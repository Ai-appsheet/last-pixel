/**
 * LAST PIXEL — backend บน Google Apps Script + Google Sheet
 *
 * เก็บทุกอย่างในชีตเดียว: บัญชี session เซฟ ข้อมูลถาวร แผนที่โลก ตลาด อันดับ และ log
 * client (Next.js) ส่ง POST body เป็น JSON แบบ text/plain (ไม่มี CORS preflight) → { action, token?, ... }
 * ตอบกลับ { ok: true, ... } หรือ { ok: false, error: 'ข้อความไทย', code }
 *
 * ติดตั้ง: ดู README.md ในโฟลเดอร์นี้ (วางโค้ด → รัน setup ครั้งเดียว → Deploy เป็น Web app)
 * ไฟล์นี้ถูกโหลดโดย tools/mock-backend.mjs ด้วย (จำลอง SpreadsheetApp ในหน่วยความจำ) — แก้ที่นี่ที่เดียว
 */

var CFG = {
  /** อายุ token (วัน) */
  TOKEN_DAYS: 30,
  /** รอบแฮชรหัสผ่าน (SHA-256 วนซ้ำ) — 2000 รอบใช้ ~0.2–0.5 วิบน Apps Script · เปลี่ยนได้ บัญชีเก่ายังใช้ได้ (เก็บจำนวนรอบไว้ในแฮช) */
  HASH_ITER: 2000,
  /** ใส่รหัสผิดได้กี่ครั้งต่อชื่อผู้ใช้ใน 10 นาที */
  MAX_FAILS: 5,
  FAIL_WINDOW_SEC: 600,
  /** สมัครได้รวมกี่บัญชีต่อ 10 นาที (กันสแปม) */
  MAX_REGISTER: 40,
  /** ขนาด body สูงสุด (ตัวอักษร) */
  MAX_BODY: 4000000,
  /** เซฟหลังบีบอัดยาวได้สูงสุด (ตัวอักษร) · 1 ช่องของชีตเก็บได้ 50,000 → แบ่งช่องละ CHUNK */
  MAX_SAVE: 2000000,
  CHUNK: 45000,
  MAX_META: 45000,
  GRID: 11,
  CAPACITY: 100,
  MAX_SESSIONS: 10,
  LISTINGS_PER_SELLER: 12,
  LISTINGS_MAX: 500,
  LOG_MAX: 3000,
};

var HEADERS = {
  Accounts: ['id', 'username', 'salt', 'hash', 'createdAt', 'lastLogin', 'playerName', 'character', 'banned'],
  Sessions: ['token', 'accountId', 'expiresAt'],
  Saves: ['accountId', 'updatedAt', 'version', 'size', 'parts', 'data_1'],
  Meta: ['accountId', 'updatedAt', 'json'],
  World: ['slot', 'accountId', 'playerName', 'character', 'level', 'power', 'biome', 'updatedAt', 'alive'],
  Market: ['id', 'sellerId', 'sellerName', 'item', 'qty', 'plus', 'price', 'createdAt', 'status', 'buyerId', 'stall'],
  Leaderboard: ['accountId', 'playerName', 'bestPower', 'bestDays', 'kills', 'updatedAt'],
  Log: ['time', 'accountId', 'action', 'detail'],
  Config: ['key', 'value'],
};

var USERNAME_RE = /^[a-zA-Z0-9_฀-๿]{3,16}$/;
var ITEM_RE = /^[a-z0-9_]{1,48}$/;

// ------------------------------------------------------------------ ติดตั้ง

/** รันครั้งเดียวจากเมนู Apps Script (เลือกฟังก์ชัน setup → ▶ เรียกใช้) — สร้างชีตทั้งหมด + seed ของโลก */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  if (!config_('worldSeed')) {
    setConfig_('worldSeed', Math.floor(Math.random() * 2147483646) + 1);
    setConfig_('worldCreatedAt', Date.now());
  }
  // ทดลองความเร็วแฮช (ดูใน "บันทึกการดำเนินการ")
  var t = Date.now();
  hashPassword_('benchmark', 'salt', CFG.HASH_ITER);
  Logger.log('setup เสร็จ · seed โลก = ' + config_('worldSeed') + ' · แฮชรหัสผ่าน ' + CFG.HASH_ITER + ' รอบ ใช้เวลา ' + (Date.now() - t) + ' ms');
}

// ------------------------------------------------------------------ จุดเข้า

function doGet() {
  return json_({ ok: true, name: 'last-pixel', time: Date.now() });
}

function doPost(e) {
  var body = e && e.postData ? String(e.postData.contents || '') : '';
  if (body.length > CFG.MAX_BODY) return json_(fail_('ข้อมูลใหญ่เกินไป', 'too_large'));
  var req;
  try {
    req = JSON.parse(body || '{}');
  } catch (err) {
    return json_(fail_('รูปแบบคำขอไม่ถูกต้อง', 'bad_request'));
  }
  if (!req || typeof req !== 'object') return json_(fail_('รูปแบบคำขอไม่ถูกต้อง', 'bad_request'));
  try {
    return json_(route_(req));
  } catch (err) {
    try {
      log_('', 'error', String(req.action) + ': ' + String(err && err.stack ? err.stack : err).slice(0, 400));
    } catch (e2) {
      /* ignore */
    }
    return json_(fail_('เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง', 'server'));
  }
}

var PUBLIC_ACTIONS = { ping: 1, register: 1, login: 1 };

var ACTIONS = {
  ping: function () {
    return ok_({ time: Date.now() });
  },
  register: register_,
  login: login_,
  logout: logout_,
  me: me_,
  'save.get': saveGet_,
  'save.put': savePut_,
  'save.clear': saveClear_,
  'meta.get': metaGet_,
  'meta.put': metaPut_,
  'world.get': worldGet_,
  'world.join': worldJoin_,
  'world.leave': worldLeave_,
  'world.heartbeat': worldHeartbeat_,
  'market.list': marketList_,
  'market.post': marketPost_,
  'market.buy': marketBuy_,
  'market.cancel': marketCancel_,
  'market.claim': marketClaim_,
  'leaderboard.get': leaderboardGet_,
  'leaderboard.submit': leaderboardSubmit_,
};

function route_(req) {
  var action = String(req.action || '');
  var fn = ACTIONS[action];
  if (!fn) return fail_('ไม่รู้จักคำสั่ง ' + action.slice(0, 40), 'bad_action');
  if (PUBLIC_ACTIONS[action]) return fn(req, null);
  var acc = auth_(req.token);
  if (!acc) return fail_('เซสชันหมดอายุ — เข้าสู่ระบบใหม่', 'auth');
  return fn(req, acc);
}

// ------------------------------------------------------------------ บัญชี

function register_(req) {
  var username = String(req.username || '').trim();
  var password = String(req.password || '');
  if (!USERNAME_RE.test(username)) return fail_('ชื่อผู้ใช้ 3–16 ตัว (ไทย/อังกฤษ/ตัวเลข/_ ไม่มีเว้นวรรค)', 'invalid');
  if (password.length < 6) return fail_('รหัสผ่านอย่างน้อย 6 ตัวอักษร', 'invalid');
  if (password.length > 64) return fail_('รหัสผ่านยาวเกิน 64 ตัวอักษร', 'invalid');
  var cache = CacheService.getScriptCache();
  var regs = Number(cache.get('reg:count') || 0);
  if (regs >= CFG.MAX_REGISTER) return fail_('มีคนสมัครเยอะเกินไป ลองใหม่ในอีกสักครู่', 'rate');
  var salt = Utilities.getUuid().replace(/-/g, '');
  // แฮชนอก lock (ใช้เวลา) แล้วค่อยเช็กชื่อซ้ำใน lock
  var hash = hashPassword_(password, salt, CFG.HASH_ITER);
  return withLock_(function () {
    var sh = sheet_('Accounts');
    var lower = username.toLowerCase();
    var names = col_(sh, 2);
    for (var i = 0; i < names.length; i++) if (String(names[i]).toLowerCase() === lower) return fail_('ชื่อผู้ใช้นี้มีคนใช้แล้ว', 'taken');
    var now = Date.now();
    var id = 'acc_' + now.toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    sh.appendRow([t_(id), t_(username), t_(salt), t_(hash), now, now, '', '', false]);
    cache.put('reg:count', String(regs + 1), CFG.FAIL_WINDOW_SEC);
    log_(id, 'register', username);
    return newSession_({ id: id, username: username, createdAt: now });
  });
}

function login_(req) {
  var username = String(req.username || '').trim();
  var password = String(req.password || '');
  if (!username || !password) return fail_('กรอกชื่อผู้ใช้และรหัสผ่าน', 'invalid');
  var lower = username.toLowerCase();
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + lower;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= CFG.MAX_FAILS) return fail_('ใส่รหัสผิดหลายครั้งเกินไป — ลองใหม่ในอีก 10 นาที', 'rate');
  var sh = sheet_('Accounts');
  var rows = all_(sh);
  var row = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][1]).toLowerCase() === lower) row = i;
  // แฮชเสมอแม้ไม่มีบัญชี (เวลาตอบใกล้เคียงกัน)
  var a = row >= 0 ? rows[row] : null;
  var stored = a ? String(a[3]) : '';
  var iter = Number(stored.split('$')[1]) || CFG.HASH_ITER;
  var hash = hashPassword_(password, a ? String(a[2]) : 'nosalt', iter);
  if (!a || !safeEqual_(hash, stored)) {
    cache.put(failKey, String(fails + 1), CFG.FAIL_WINDOW_SEC);
    log_(a ? String(a[0]) : '', 'login.fail', username);
    return fail_(a ? 'รหัสผ่านไม่ถูกต้อง' : 'ไม่พบชื่อผู้ใช้นี้ — สมัครสมาชิกก่อน', 'bad_login');
  }
  if (isTrue_(a[8])) return fail_('บัญชีนี้ถูกระงับ', 'banned');
  cache.remove(failKey);
  sh.getRange(row + 2, 6, 1, 1).setValues([[Date.now()]]);
  log_(String(a[0]), 'login', '');
  return withLock_(function () {
    return newSession_({ id: String(a[0]), username: String(a[1]), createdAt: Number(a[4]) });
  });
}

/** สร้าง token ใหม่ (เก็บเฉพาะแฮชของ token ในชีต) + ล้าง session ที่หมดอายุ/เกินจำนวน */
function newSession_(acc) {
  var token = 't' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var now = Date.now();
  var expiresAt = now + CFG.TOKEN_DAYS * 86400000;
  var sh = sheet_('Sessions');
  var rows = all_(sh);
  var mine = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var expired = Number(rows[i][2]) < now;
    if (expired) sh.deleteRow(i + 2);
    else if (String(rows[i][1]) === acc.id) mine.push(i);
  }
  // เก็บ session ต่อบัญชีไม่เกิน MAX_SESSIONS (ลบอันเก่าสุด) — คำนวณใหม่หลังลบแถวหมดอายุ
  if (mine.length >= CFG.MAX_SESSIONS) {
    rows = all_(sh);
    var idx = [];
    for (var j = 0; j < rows.length; j++) if (String(rows[j][1]) === acc.id) idx.push(j);
    idx.sort(function (x, y) { return Number(rows[x][2]) - Number(rows[y][2]); });
    var drop = idx.slice(0, idx.length - CFG.MAX_SESSIONS + 1).sort(function (x, y) { return y - x; });
    drop.forEach(function (k) { sh.deleteRow(k + 2); });
  }
  sh.appendRow([t_(sha256_(token)), t_(acc.id), expiresAt]);
  return ok_({ token: token, expiresAt: expiresAt, account: acc });
}

/** token → บัญชี (แคช 10 นาที) */
function auth_(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  var key = 'tok:' + sha256_(token);
  var cache = CacheService.getScriptCache();
  var hit = cache.get(key);
  if (hit) {
    var c = JSON.parse(hit);
    if (c.exp > Date.now()) return c;
  }
  var th = key.slice(4);
  var rows = all_(sheet_('Sessions'));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) !== th) continue;
    if (Number(rows[i][2]) < Date.now()) return null;
    var acc = accountById_(String(rows[i][1]));
    if (!acc || acc.banned) return null;
    var out = { id: acc.id, username: acc.username, createdAt: acc.createdAt, playerName: acc.playerName, exp: Number(rows[i][2]) };
    cache.put(key, JSON.stringify(out), 600);
    return out;
  }
  return null;
}

function accountById_(id) {
  var rows = all_(sheet_('Accounts'));
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) !== id) continue;
    var r = rows[i];
    return { row: i + 2, id: id, username: String(r[1]), createdAt: Number(r[4]), playerName: String(r[6] || ''), character: String(r[7] || ''), banned: isTrue_(r[8]) };
  }
  return null;
}

function logout_(req) {
  var th = sha256_(String(req.token));
  CacheService.getScriptCache().remove('tok:' + th);
  var sh = sheet_('Sessions');
  var keys = col_(sh, 1);
  for (var i = keys.length - 1; i >= 0; i--) if (String(keys[i]) === th) sh.deleteRow(i + 2);
  return ok_({});
}

function me_(req, acc) {
  return ok_({ account: { id: acc.id, username: acc.username, createdAt: acc.createdAt, playerName: acc.playerName } });
}

// ------------------------------------------------------------------ เซฟ (แบ่งเป็นช่องละ ≤ 45,000 ตัวอักษร)

function saveGet_(req, acc) {
  var sh = sheet_('Saves');
  var r = findRow_(sh, 1, acc.id);
  if (r < 0) return ok_({ save: null, updatedAt: 0 });
  var lastCol = Math.max(5, sh.getLastColumn());
  var v = sh.getRange(r, 1, 1, lastCol).getValues()[0];
  var parts = Number(v[4]) || 0;
  if (!parts) return ok_({ save: null, updatedAt: Number(v[1]) || 0 });
  var data = v.slice(5, 5 + parts).join('');
  return ok_({ save: unpack_(data), updatedAt: Number(v[1]) || 0, version: Number(v[2]) || 0 });
}

function savePut_(req, acc) {
  var save = req.save;
  if (typeof save !== 'string' || !save) return fail_('ไม่มีข้อมูลเซฟ', 'invalid');
  try {
    JSON.parse(save);
  } catch (e) {
    return fail_('ข้อมูลเซฟเสีย', 'invalid');
  }
  var updatedAt = Number(req.updatedAt) || Date.now();
  var packed = pack_(save);
  if (packed.length > CFG.MAX_SAVE) return fail_('เซฟใหญ่เกินกว่าที่เซิร์ฟเวอร์เก็บได้', 'too_large');
  var chunks = [];
  for (var i = 0; i < packed.length; i += CFG.CHUNK) chunks.push(packed.slice(i, i + CFG.CHUNK));
  return writeSave_(acc.id, updatedAt, Number(req.version) || 0, save.length, chunks);
}

/** ตายถาวร / เริ่มใหม่ → ลบเซฟ (เก็บเวลาไว้ เครื่องอื่นจะได้รู้ว่าเซฟเก่าใช้ไม่ได้แล้ว) */
function saveClear_(req, acc) {
  return writeSave_(acc.id, Number(req.updatedAt) || Date.now(), 0, 0, []);
}

function writeSave_(accId, updatedAt, version, size, chunks) {
  var sh = sheet_('Saves');
  var write = function (r) {
    var lastCol = Math.max(5, sh.getLastColumn());
    var prev = r > 0 ? sh.getRange(r, 1, 1, lastCol).getValues()[0] : null;
    if (prev && Number(prev[1]) > updatedAt) return fail_('มีเซฟที่ใหม่กว่าจากเครื่องอื่น', 'stale', { updatedAt: Number(prev[1]) });
    var width = Math.max(5 + chunks.length, prev ? 5 + (Number(prev[4]) || 0) : 5);
    ensureCols_(sh, width);
    var row = [t_(accId), updatedAt, version, size, chunks.length];
    for (var i = 0; i < chunks.length; i++) row.push(t_(chunks[i]));
    while (row.length < width) row.push('');
    if (r > 0) sh.getRange(r, 1, 1, width).setValues([row]);
    else sh.appendRow(row);
    return ok_({ updatedAt: updatedAt });
  };
  var r = findRow_(sh, 1, accId);
  if (r > 0) return write(r);
  // แถวใหม่: lock กันสองเครื่องสร้างแถวซ้ำพร้อมกัน
  return withLock_(function () {
    return write(findRow_(sh, 1, accId));
  });
}

// ------------------------------------------------------------------ ข้อมูลถาวร (meta)

function metaGet_(req, acc) {
  var sh = sheet_('Meta');
  var r = findRow_(sh, 1, acc.id);
  if (r < 0) return ok_({ meta: null, updatedAt: 0 });
  var v = sh.getRange(r, 1, 1, 3).getValues()[0];
  return ok_({ meta: v[2] ? unpack_(String(v[2])) : null, updatedAt: Number(v[1]) || 0 });
}

function metaPut_(req, acc) {
  var meta = req.meta;
  if (typeof meta !== 'string' || !meta) return fail_('ไม่มีข้อมูล', 'invalid');
  var parsed;
  try {
    parsed = JSON.parse(meta);
  } catch (e) {
    return fail_('ข้อมูลเสีย', 'invalid');
  }
  var packed = pack_(meta);
  if (packed.length > CFG.MAX_META) return fail_('ข้อมูลถาวรใหญ่เกินไป', 'too_large');
  var updatedAt = Number(req.updatedAt) || Date.now();
  var sh = sheet_('Meta');
  var write = function (r) {
    if (r > 0) {
      var prev = Number(sh.getRange(r, 2, 1, 1).getValues()[0][0]) || 0;
      if (prev > updatedAt) return fail_('มีข้อมูลที่ใหม่กว่าจากเครื่องอื่น', 'stale', { updatedAt: prev });
      sh.getRange(r, 1, 1, 3).setValues([[t_(acc.id), updatedAt, t_(packed)]]);
    } else sh.appendRow([t_(acc.id), updatedAt, t_(packed)]);
    return ok_({ updatedAt: updatedAt });
  };
  var r = findRow_(sh, 1, acc.id);
  var res = r > 0 ? write(r) : withLock_(function () { return write(findRow_(sh, 1, acc.id)); });
  // ชื่อในเกม/ตัวละครล่าสุด → ชีต Accounts (ดูง่ายสำหรับแอดมิน)
  if (res.ok && parsed && (parsed.playerName || parsed.lastCharacter)) {
    var a = accountById_(acc.id);
    if (a && (a.playerName !== String(parsed.playerName || '') || a.character !== String(parsed.lastCharacter || ''))) {
      sheet_('Accounts').getRange(a.row, 7, 1, 2).setValues([[t_(cleanName_(parsed.playerName)), t_(cleanName_(parsed.lastCharacter))]]);
    }
  }
  return res;
}

// ------------------------------------------------------------------ แผนที่โลก

/** ลำดับช่องแบบวงก้นหอยจากเกาะกลาง (ต้องตรงกับ spiralSlots() ใน src/core/RoomService.ts) */
function spiralSlots_() {
  var G = CFG.GRID;
  var c = Math.floor(G / 2);
  var center = Math.floor((G * G) / 2);
  var special = (G - 1) * G + Math.floor(G / 2);
  var out = [];
  for (var y = 0; y < G; y++) {
    for (var x = 0; x < G; x++) {
      var s = y * G + x;
      if (s === center || s === special) continue;
      out.push({ s: s, d: Math.max(Math.abs(x - c), Math.abs(y - c)), a: Math.atan2(y - c, x - c) });
    }
  }
  out.sort(function (p, q) { return p.d - q.d || p.a - q.a; });
  return out.map(function (o) { return o.s; });
}

function players_() {
  return all_(sheet_('World')).map(function (r) {
    return {
      slot: Number(r[0]), accountId: String(r[1]), playerName: String(r[2] || ''), character: String(r[3] || ''),
      level: Number(r[4]) || 1, power: Number(r[5]) || 0, biome: String(r[6] || ''), updatedAt: Number(r[7]) || 0, alive: !(r[8] === false || r[8] === 'FALSE'),
    };
  });
}

function worldInfo_(extra) {
  var o = { seed: Number(config_('worldSeed')) || 1, createdAt: Number(config_('worldCreatedAt')) || 0, players: players_() };
  for (var k in extra) o[k] = extra[k];
  return ok_(o);
}

function worldGet_() {
  return worldInfo_({});
}

function worldJoin_(req, acc) {
  var name = cleanName_(req.playerName) || acc.username;
  var character = cleanName_(req.character);
  return withLock_(function () {
    var sh = sheet_('World');
    var rows = all_(sh);
    var now = Date.now();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) !== acc.id) continue;
      sh.getRange(i + 2, 3, 1, 2).setValues([[t_(name), t_(character || String(rows[i][3] || ''))]]);
      sh.getRange(i + 2, 8, 1, 2).setValues([[now, true]]);
      return worldInfo_({ slot: Number(rows[i][0]) });
    }
    if (rows.length >= CFG.CAPACITY) return fail_('แผนที่เต็มแล้ว (' + CFG.CAPACITY + '/' + CFG.CAPACITY + ') — ปิดรับผู้เล่นใหม่', 'full');
    var used = {};
    rows.forEach(function (r) { used[Number(r[0])] = true; });
    var order = spiralSlots_();
    var free = order.filter(function (s) { return !used[s]; });
    if (!free.length) return fail_('ไม่มีช่องเกาะว่าง', 'full');
    var want = Number(req.slot);
    // ขอช่องเดิมจากเซฟ (ถ้ายังว่าง) ไม่งั้นสุ่มจาก 10 ช่องที่ใกล้เกาะกลางที่สุด
    var slot = req.slot !== undefined && req.slot !== null && order.indexOf(want) >= 0 && !used[want] ? want : free[Math.floor(Math.random() * Math.min(10, free.length))];
    sh.appendRow([slot, t_(acc.id), t_(name), t_(character), 1, 0, '', now, true]);
    log_(acc.id, 'world.join', 'slot ' + slot);
    return worldInfo_({ slot: slot });
  });
}

/** ทิ้งเกาะ (ตายถาวร/เริ่มใหม่) — ช่องว่างให้คนใหม่ + ของที่วางขายอยู่หายไปด้วย */
function worldLeave_(req, acc) {
  return withLock_(function () {
    var sh = sheet_('World');
    var ids = col_(sh, 2);
    var left = false;
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i]) === acc.id) {
        sh.deleteRow(i + 2);
        left = true;
      }
    }
    var m = sheet_('Market');
    var rows = all_(m);
    for (var j = 0; j < rows.length; j++) {
      if (String(rows[j][1]) === acc.id && String(rows[j][8]) === 'open') m.getRange(j + 2, 9, 1, 1).setValues([['expired']]);
    }
    if (left) log_(acc.id, 'world.leave', '');
    return ok_({ left: left });
  });
}

function worldHeartbeat_(req, acc) {
  var sh = sheet_('World');
  var r = findRow_(sh, 2, acc.id);
  if (r > 0) {
    var level = clampInt_(req.level, 1, 999);
    var power = clampInt_(req.power, 0, 100000000);
    sh.getRange(r, 5, 1, 2).setValues([[level, power]]);
    sh.getRange(r, 8, 1, 2).setValues([[Date.now(), req.alive !== false]]);
  }
  return ok_({ players: players_(), joined: r > 0 });
}

// ------------------------------------------------------------------ ตลาด (แผงบนเกาะกลาง)

function listing_(r) {
  return {
    id: String(r[0]), sellerId: String(r[1]), sellerName: String(r[2]), item: String(r[3]), qty: Number(r[4]), plus: Number(r[5]) || 0,
    price: Number(r[6]), createdAt: Number(r[7]), status: String(r[8]), buyerId: String(r[9] || ''), stall: Number(r[10]) || 0,
  };
}

function marketList_() {
  var open = all_(sheet_('Market')).filter(function (r) { return String(r[8]) === 'open'; }).map(listing_);
  open.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return ok_({ listings: open.slice(0, 300) });
}

function marketPost_(req, acc) {
  var item = String(req.item || '');
  if (!ITEM_RE.test(item)) return fail_('ไอเทมไม่ถูกต้อง', 'invalid');
  var qty = clampInt_(req.qty, 1, 9999);
  var plus = clampInt_(req.plus, 0, 9);
  var price = clampInt_(req.price, 1, 10000000);
  var stall = clampInt_(req.stall, 0, 11);
  var sellerName = cleanName_(req.sellerName) || acc.username;
  return withLock_(function () {
    var sh = sheet_('Market');
    var rows = all_(sh);
    var mine = 0;
    var open = 0;
    rows.forEach(function (r) {
      if (String(r[8]) !== 'open') return;
      open++;
      if (String(r[1]) === acc.id) mine++;
    });
    if (mine >= CFG.LISTINGS_PER_SELLER) return fail_('วางขายได้สูงสุด ' + CFG.LISTINGS_PER_SELLER + ' รายการ', 'limit');
    if (open >= CFG.LISTINGS_MAX) return fail_('ตลาดเต็ม ลองใหม่ภายหลัง', 'limit');
    pruneMarket_(sh, rows);
    var id = 'M' + Date.now().toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    var row = [id, acc.id, sellerName, item, qty, plus, price, Date.now(), 'open', '', stall];
    sh.appendRow(row.map(function (v, i) { return i < 4 ? t_(v) : v; }));
    return ok_({ listing: listing_(row) });
  });
}

/** ซื้อ: lock แล้วเปลี่ยนสถานะ open → sold ครั้งเดียว (สองคนกดพร้อมกันได้แค่คนเดียว) */
function marketBuy_(req, acc) {
  var id = String(req.id || '');
  return withLock_(function () {
    var sh = sheet_('Market');
    var r = findRow_(sh, 1, id);
    if (r < 0) return fail_('ไม่พบรายการนี้แล้ว', 'not_found');
    var v = sh.getRange(r, 1, 1, 11).getValues()[0];
    if (String(v[8]) !== 'open') return fail_('มีคนซื้อไปแล้ว', 'sold');
    if (String(v[1]) === acc.id) return fail_('ซื้อของตัวเองไม่ได้', 'invalid');
    sh.getRange(r, 9, 1, 2).setValues([['sold', t_(acc.id)]]);
    v[8] = 'sold';
    v[9] = acc.id;
    log_(acc.id, 'market.buy', id + ' ' + v[3] + '×' + v[4] + ' ' + v[6]);
    return ok_({ listing: listing_(v) });
  });
}

function marketCancel_(req, acc) {
  var id = String(req.id || '');
  return withLock_(function () {
    var sh = sheet_('Market');
    var r = findRow_(sh, 1, id);
    if (r < 0) return fail_('ไม่พบรายการนี้แล้ว', 'not_found');
    var v = sh.getRange(r, 1, 1, 11).getValues()[0];
    if (String(v[1]) !== acc.id) return fail_('ไม่ใช่ของคุณ', 'forbidden');
    if (String(v[8]) !== 'open') return fail_('มีคนซื้อไปแล้ว', 'sold');
    sh.getRange(r, 9, 1, 1).setValues([['cancelled']]);
    v[8] = 'cancelled';
    return ok_({ listing: listing_(v) });
  });
}

/** ผู้ขายรับเงินของที่ขายได้ (sold → paid) */
function marketClaim_(req, acc) {
  return withLock_(function () {
    var sh = sheet_('Market');
    var rows = all_(sh);
    var sold = [];
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) !== acc.id || String(rows[i][8]) !== 'sold') continue;
      sh.getRange(i + 2, 9, 1, 1).setValues([['paid']]);
      sold.push(listing_(rows[i]));
    }
    return ok_({ sold: sold });
  });
}

/** ลบรายการที่จบแล้วเก่ากว่า 3 วัน เมื่อชีตเริ่มยาว */
function pruneMarket_(sh, rows) {
  if (rows.length < 1500) return;
  var cut = Date.now() - 3 * 86400000;
  for (var i = rows.length - 1; i >= 0; i--) {
    var st = String(rows[i][8]);
    if ((st === 'paid' || st === 'cancelled' || st === 'expired') && Number(rows[i][7]) < cut) sh.deleteRow(i + 2);
  }
}

// ------------------------------------------------------------------ อันดับ

function leaderboardGet_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('leaderboard');
  if (hit) return ok_({ top: JSON.parse(hit) });
  var top = all_(sheet_('Leaderboard')).map(function (r) {
    return { accountId: String(r[0]), playerName: String(r[1] || ''), bestPower: Number(r[2]) || 0, bestDays: Number(r[3]) || 0, kills: Number(r[4]) || 0 };
  });
  top.sort(function (a, b) { return b.bestPower - a.bestPower || b.bestDays - a.bestDays || b.kills - a.kills; });
  top = top.slice(0, 50);
  cache.put('leaderboard', JSON.stringify(top), 60);
  return ok_({ top: top });
}

/** ส่งสถิติ — เก็บค่าสูงสุดเสมอ (ค่าไม่ลดลง) */
function leaderboardSubmit_(req, acc) {
  var power = clampInt_(req.bestPower, 0, 100000000);
  var days = clampInt_(req.bestDays, 0, 1000000);
  var kills = clampInt_(req.kills, 0, 100000000);
  var name = cleanName_(req.playerName) || acc.playerName || acc.username;
  var sh = sheet_('Leaderboard');
  var write = function (r) {
    if (r > 0) {
      var v = sh.getRange(r, 1, 1, 6).getValues()[0];
      sh.getRange(r, 2, 1, 5).setValues([[t_(name), Math.max(power, Number(v[2]) || 0), Math.max(days, Number(v[3]) || 0), Math.max(kills, Number(v[4]) || 0), Date.now()]]);
    } else sh.appendRow([t_(acc.id), t_(name), power, days, kills, Date.now()]);
    return ok_({});
  };
  var r = findRow_(sh, 1, acc.id);
  var res = r > 0 ? write(r) : withLock_(function () { return write(findRow_(sh, 1, acc.id)); });
  CacheService.getScriptCache().remove('leaderboard');
  return res;
}

// ------------------------------------------------------------------ ตัวช่วย

function ok_(o) {
  o = o || {};
  o.ok = true;
  return o;
}

function fail_(error, code, extra) {
  var o = { ok: false, error: error, code: code };
  for (var k in extra || {}) o[k] = extra[k];
  return o;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** ข้อความลงชีต: นำหน้าด้วย ' ให้ชีตเก็บเป็นข้อความเสมอ (ไม่แปลงเป็นตัวเลข/วันที่ และกันสูตร =...) */
function t_(s) {
  return "'" + String(s === undefined || s === null ? '' : s);
}

function cleanName_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
}

function clampInt_(v, lo, hi) {
  var n = Math.floor(Number(v));
  if (!isFinite(n)) n = lo;
  return Math.max(lo, Math.min(hi, n));
}

function isTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('เซิร์ฟเวอร์ยุ่ง ลองใหม่อีกครั้ง', 'busy');
  try {
    var out = fn();
    SpreadsheetApp.flush();
    return out;
  } finally {
    lock.releaseLock();
  }
}

var sheets__ = {};
function sheet_(name) {
  if (sheets__[name]) return sheets__[name];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    // ยังไม่ได้รัน setup → สร้างให้เอง
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]);
    sh.setFrozenRows(1);
  }
  sheets__[name] = sh;
  return sh;
}

/** แถวข้อมูลทั้งหมด (ไม่รวมหัวตาราง) */
function all_(sh) {
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  // ชีต Saves อ่านแค่ 5 คอลัมน์แรก (ไม่ดึงข้อมูลเซฟทุกคนมาทั้งก้อน)
  var name = sh.getName();
  return sh.getRange(2, 1, n, name === 'Saves' ? 5 : HEADERS[name].length).getValues();
}

/** ค่าทั้งคอลัมน์ (ไม่รวมหัวตาราง) */
function col_(sh, c) {
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, c, n, 1).getValues().map(function (r) { return r[0]; });
}

/** เลขแถวในชีต (เริ่ม 2) ที่คอลัมน์ c ตรงกับ value หรือ -1 */
function findRow_(sh, c, value) {
  var v = col_(sh, c);
  for (var i = 0; i < v.length; i++) if (String(v[i]) === value) return i + 2;
  return -1;
}

/** เพิ่มคอลัมน์ data_N ของชีต Saves ให้พอ (พร้อมหัวตาราง) */
function ensureCols_(sh, width) {
  var max = sh.getMaxColumns();
  if (max < width) sh.insertColumnsAfter(max, width - max);
  var hdr = sh.getRange(1, 1, 1, width).getValues()[0];
  var changed = false;
  for (var i = 5; i < width; i++) {
    if (hdr[i]) continue;
    hdr[i] = 'data_' + (i - 4);
    changed = true;
  }
  if (changed) sh.getRange(1, 1, 1, width).setValues([hdr]);
}

function config_(key) {
  var rows = all_(sheet_('Config'));
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === key) return rows[i][1];
  return null;
}

function setConfig_(key, value) {
  var sh = sheet_('Config');
  var r = findRow_(sh, 1, key);
  if (r > 0) sh.getRange(r, 2, 1, 1).setValues([[value]]);
  else sh.appendRow([t_(key), value]);
}

function log_(accountId, action, detail) {
  var sh = sheet_('Log');
  sh.appendRow([Date.now(), t_(accountId), t_(action), t_(String(detail || '').slice(0, 300))]);
  var n = sh.getLastRow();
  // เก็บไม่เกิน LOG_MAX แถว (ลบทีละ 500 แถวเก่าสุด)
  if (n > CFG.LOG_MAX + 500) sh.deleteRows(2, 500);
}

/** บีบอัด JSON: gzip → base64 (ข้อความยาว ~ 1/4–1/8 ของเดิม) */
function pack_(s) {
  var blob = Utilities.newBlob('').setDataFromString(s, 'UTF-8');
  return 'gz:' + Utilities.base64Encode(Utilities.gzip(blob).getBytes());
}

function unpack_(s) {
  if (s.indexOf('gz:') !== 0) return s;
  var bytes = Utilities.base64Decode(s.slice(3));
  return Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString('UTF-8');
}

function sha256_(s) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}

function hex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) out += ((bytes[i] + 256) % 256).toString(16).padStart(2, '0');
  return out;
}

/** แฮชรหัสผ่าน: SHA-256(salt:password) แล้ววนซ้ำ iter รอบ (ต่อ password ทุกรอบ) → 'v1$<iter>$<hex>' */
function hashPassword_(password, salt, iter) {
  var pw = Utilities.newBlob('').setDataFromString(String(password), 'UTF-8').getBytes();
  var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (var i = 1; i < iter; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(pw));
  return 'v1$' + iter + '$' + hex_(h);
}

/** เทียบข้อความแบบใช้เวลาเท่ากันทุกตัวอักษร (ไม่หยุดตอนเจอตัวแรกที่ต่าง) */
function safeEqual_(a, b) {
  a = String(a);
  b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
