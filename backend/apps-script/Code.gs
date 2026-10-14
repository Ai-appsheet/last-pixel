/**
 * Survivor Isles (ชื่อเดิม LAST PIXEL) — backend บน Google Apps Script + Google Sheet
 *
 * เก็บทุกอย่างในชีตเดียว: บัญชี session เซฟ ข้อมูลถาวร แผนที่โลก ตลาด อันดับ และ log
 * บัญชีใช้อีเมล + รหัสผ่าน (ยืนยันอีเมลด้วยรหัส 6 หลักที่ส่งผ่าน MailApp) · บัญชีเก่าที่มีแต่ชื่อผู้ใช้ยังเข้าได้ แล้วผูกอีเมลทีหลัง
 * เข้าสู่ระบบด้วย Google ได้ (auth.google ตรวจ ID token กับ Google ผ่าน UrlFetchApp) — ต้องตั้ง Script Property GOOGLE_CLIENT_ID
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
  /** ใส่รหัสผิดได้กี่ครั้งต่ออีเมล/ชื่อผู้ใช้ใน 10 นาที · รวมทั้งระบบ */
  MAX_FAILS: 5,
  MAX_FAILS_ALL: 300,
  FAIL_WINDOW_SEC: 600,
  /** ชื่อเกมในอีเมล */
  GAME_NAME: 'Survivor Isles',
  /** รหัสยืนยันทางอีเมล: อายุ (วิ) · ใส่ผิดได้ · ขอส่งใหม่ได้ทุกกี่วิ */
  CODE_TTL_SEC: 900,
  CODE_TRIES: 5,
  RESEND_SEC: 60,
  /** ส่งอีเมลได้กี่ฉบับ ต่ออีเมลต่อชั่วโมง · รวมทั้งระบบต่อ 10 นาที (MailApp บัญชีธรรมดาส่งได้ ~100 ฉบับ/วัน) */
  MAIL_PER_EMAIL_HOUR: 6,
  MAIL_ALL_10MIN: 40,
  /** สมัครแล้วไม่ยืนยันอีเมลเกินกี่วัน → ชื่อ/อีเมลนั้นให้คนอื่นสมัครทับได้ */
  PENDING_DAYS: 1,
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
  /** แชทโลก: ยาวสุด (ตัวอักษร) · ส่งได้ 1 ข้อความ/CHAT_GAP_SEC วิ และ ≤ CHAT_PER_MIN ต่อนาทีต่อบัญชี · เก็บแถวไม่เกิน CHAT_MAX · ส่งให้ client ครั้งละ ≤ CHAT_PAGE (แคช CHAT_CACHE_SEC วิ) */
  CHAT_MAX_LEN: 140,
  CHAT_GAP_SEC: 2,
  CHAT_PER_MIN: 20,
  CHAT_MAX: 2000,
  CHAT_PAGE: 50,
  CHAT_CACHE_SEC: 10,
  /**
   * OAuth Client ID ของปุ่ม "Sign in with Google" (xxxx.apps.googleusercontent.com) — แนะนำให้ตั้งใน Script Properties ชื่อ GOOGLE_CLIENT_ID แทน
   * (ใส่ที่นี่แล้วรัน setup ก็ได้ setup จะคัดลอกไปไว้ใน Script Properties ให้) · ว่างทั้งคู่ = ปิดการเข้าสู่ระบบด้วย Google
   */
  GOOGLE_CLIENT_ID: '',
  /** เรียก auth.google ได้รวมกี่ครั้งต่อ 10 นาที (แต่ละครั้งใช้ UrlFetch ซึ่งมีโควตารายวัน) */
  MAX_GOOGLE: 300,
};

var HEADERS = {
  // คอลัมน์ email…verifyTries และ googleSub เพิ่มทีหลัง — setup() เติมหัวตารางให้ชีตเดิมโดยไม่ยุ่งข้อมูล
  Accounts: ['id', 'username', 'salt', 'hash', 'createdAt', 'lastLogin', 'playerName', 'character', 'banned', 'email', 'verified', 'verifyHash', 'verifyExp', 'verifyTries', 'googleSub'],
  Sessions: ['token', 'accountId', 'expiresAt'],
  Saves: ['accountId', 'updatedAt', 'version', 'size', 'parts', 'data_1'],
  Meta: ['accountId', 'updatedAt', 'json'],
  World: ['slot', 'accountId', 'playerName', 'character', 'level', 'power', 'biome', 'updatedAt', 'alive'],
  Market: ['id', 'sellerId', 'sellerName', 'item', 'qty', 'plus', 'price', 'createdAt', 'status', 'buyerId', 'stall'],
  Leaderboard: ['accountId', 'playerName', 'bestPower', 'bestDays', 'kills', 'updatedAt'],
  Log: ['time', 'accountId', 'action', 'detail'],
  Config: ['key', 'value'],
  // channel: 'world' (ตอนนี้มีช่องเดียว · เผื่อ 'island' ภายหลัง)
  Chat: ['id', 'time', 'accountId', 'playerName', 'text', 'channel'],
};

var USERNAME_RE = /^[a-zA-Z0-9_฀-๿]{3,16}$/;
var ITEM_RE = /^[a-z0-9_]{1,48}$/;
/** อีเมล (ตัวพิมพ์เล็กแล้ว) — ห้ามมี $ เพราะใช้คั่นใน verifyHash */
var EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

// ------------------------------------------------------------------ ติดตั้ง

/**
 * รันจากเมนู Apps Script (เลือกฟังก์ชัน setup → ▶ เรียกใช้) — สร้างชีตทั้งหมด + seed ของโลก
 * รันซ้ำได้ปลอดภัย: ชีตเดิมจะถูกเติมหัวตารางที่ขาด (คอลัมน์ใหม่ต่อท้าย) ข้อมูลเดิมไม่หาย
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    migrateHeaders_(sh, HEADERS[name]);
    sh.setFrozenRows(1);
  });
  if (!config_('worldSeed')) {
    setConfig_('worldSeed', Math.floor(Math.random() * 2147483646) + 1);
    setConfig_('worldCreatedAt', Date.now());
  }
  // Google Sign-In: ใส่ client id ไว้ใน CFG → เก็บลง Script Properties
  if (CFG.GOOGLE_CLIENT_ID && CFG.GOOGLE_CLIENT_ID !== googleClientId_()) PropertiesService.getScriptProperties().setProperty('GOOGLE_CLIENT_ID', CFG.GOOGLE_CLIENT_ID);
  Logger.log(googleClientId_() ? 'เข้าสู่ระบบด้วย Google: เปิด (GOOGLE_CLIENT_ID = ' + googleClientId_() + ')' : 'เข้าสู่ระบบด้วย Google: ปิด (ยังไม่ได้ตั้ง Script Property GOOGLE_CLIENT_ID)');
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

var PUBLIC_ACTIONS = { ping: 1, register: 1, login: 1, verify: 1, resend: 1, forgot: 1, reset: 1, 'auth.google': 1 };

var ACTIONS = {
  ping: function () {
    return ok_({ time: Date.now() });
  },
  register: register_,
  verify: verify_,
  resend: resend_,
  login: login_,
  forgot: forgot_,
  reset: reset_,
  'auth.google': authGoogle_,
  'account.setName': accountSetName_,
  'email.attach': emailAttach_,
  'email.confirm': emailConfirm_,
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
  'chat.post': chatPost_,
  'chat.get': chatGet_,
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

/**
 * สมัคร: อีเมล + รหัสผ่าน + ชื่อในเกม → สร้างบัญชีแบบ "ยังไม่ยืนยัน" แล้วส่งรหัส 6 หลักทางอีเมล
 * ยังไม่ได้ token จนกว่าจะ verify (ตอบ { needVerify: true, email, sent, wait })
 */
function register_(req) {
  var email = normEmail_(req.email);
  var password = String(req.password || '');
  var name = String(req.name || '').trim();
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  var pe = passwordError_(password);
  if (pe) return fail_(pe, 'invalid');
  if (!USERNAME_RE.test(name)) return fail_('ชื่อในเกม 3–16 ตัว (ไทย/อังกฤษ/ตัวเลข/_ ไม่มีเว้นวรรค)', 'invalid');
  var cache = CacheService.getScriptCache();
  var regs = Number(cache.get('reg:count') || 0);
  if (regs >= CFG.MAX_REGISTER) return fail_('มีคนสมัครเยอะเกินไป ลองใหม่ในอีกสักครู่', 'rate');
  var salt = Utilities.getUuid().replace(/-/g, '');
  // แฮชนอก lock (ใช้เวลา) แล้วค่อยเช็กซ้ำใน lock
  var hash = hashPassword_(password, salt, CFG.HASH_ITER);
  var res = withLock_(function () {
    var sh = sheet_('Accounts');
    var rows = all_(sh);
    var now = Date.now();
    var lname = name.toLowerCase();
    // บัญชีที่สมัครค้างไว้ไม่ยืนยันเกิน PENDING_DAYS → ลบทิ้ง ให้ชื่อ/อีเมลนั้นสมัครใหม่ได้
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (!String(r[9]) || isTrue_(r[10]) || Number(r[4]) > now - CFG.PENDING_DAYS * 86400000) continue;
      if (String(r[9]).toLowerCase() !== email && String(r[1]).toLowerCase() !== lname) continue;
      sh.deleteRow(i + 2);
      rows.splice(i, 1);
      log_(String(r[0]), 'register.expire', '');
    }
    for (var j = 0; j < rows.length; j++) {
      if (String(rows[j][9]).toLowerCase() === email) return fail_('อีเมลนี้มีบัญชีแล้ว — เข้าสู่ระบบ หรือกด "ลืมรหัสผ่าน"', 'email_taken');
      if (String(rows[j][1]).toLowerCase() === lname) return fail_('ชื่อในเกมนี้มีคนใช้แล้ว', 'taken');
    }
    var id = 'acc_' + now.toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    sh.appendRow([t_(id), t_(name), t_(salt), t_(hash), now, now, t_(name), '', false, t_(email), false, '', '', 0]);
    cache.put('reg:count', String(regs + 1), CFG.FAIL_WINDOW_SEC);
    log_(id, 'register', name);
    return ok_({ id: id });
  });
  if (!res.ok) return res;
  var a = accountById_(res.id);
  var gate = mailGate_(email, 'verify');
  var sent = !gate && !!a && issueCode_(a, 'verify', email);
  return ok_({
    needVerify: true,
    email: email,
    sent: sent,
    wait: sent ? CFG.RESEND_SEC : gate && gate.wait ? gate.wait : 0,
    message: sent ? 'ส่งรหัสยืนยัน 6 หลักไปที่ ' + email + ' แล้ว' : gate ? gate.error : 'ส่งอีเมลไม่สำเร็จ — กด "ส่งรหัสอีกครั้ง" ภายหลัง',
  });
}

/**
 * เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน · บัญชีเก่า (ไม่มีอีเมล) ใช้ชื่อผู้ใช้เดิมได้ → ได้ account.needEmail = true ให้ไปผูกอีเมล
 * ยังไม่ยืนยันอีเมล → ส่งรหัสใหม่ให้ (ถ้าพ้นเวลารอ) แล้วตอบ code 'unverified'
 */
function login_(req) {
  var ident = String(req.email || req.username || '').trim().toLowerCase();
  var password = String(req.password || '');
  if (!ident || !password) return fail_('กรอกอีเมลและรหัสผ่าน', 'invalid');
  var byEmail = ident.indexOf('@') >= 0;
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + ident;
  var fails = Number(cache.get(failKey) || 0);
  var failsAll = Number(cache.get('fail:*') || 0);
  if (fails >= CFG.MAX_FAILS) return fail_('ใส่รหัสผิดหลายครั้งเกินไป — ลองใหม่ในอีก 10 นาที', 'rate');
  if (failsAll >= CFG.MAX_FAILS_ALL) return fail_('ระบบกำลังถูกลองรหัสผ่านจำนวนมาก — ลองใหม่ในอีกสักครู่', 'rate');
  var rows = all_(sheet_('Accounts'));
  var row = -1;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][byEmail ? 9 : 1]).toLowerCase() === ident) row = i;
  }
  // แฮชเสมอแม้ไม่มีบัญชี (เวลาตอบใกล้เคียงกัน)
  var a = row >= 0 ? accFromRow_(rows[row], row) : null;
  var stored = a ? a.hash : '';
  var iter = Number(stored.split('$')[1]) || CFG.HASH_ITER;
  var hash = hashPassword_(password, a ? a.salt : 'nosalt', iter);
  if (!a || !safeEqual_(hash, stored)) {
    cache.put(failKey, String(fails + 1), CFG.FAIL_WINDOW_SEC);
    cache.put('fail:*', String(failsAll + 1), CFG.FAIL_WINDOW_SEC);
    log_(a ? a.id : '', 'login.fail', byEmail ? '(email)' : ident);
    // ไม่บอกว่าอีเมล/ชื่อนี้มีบัญชีหรือไม่
    return fail_(byEmail ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง', 'bad_login');
  }
  if (a.banned) return fail_('บัญชีนี้ถูกระงับ', 'banned');
  cache.remove(failKey);
  if (!byEmail && a.email) return fail_('บัญชีนี้ผูกอีเมลแล้ว — เข้าสู่ระบบด้วยอีเมล ' + maskEmail_(a.email), 'use_email');
  if (a.email && !a.verified) {
    var gate = mailGate_(a.email, 'verify');
    var sent = !gate && issueCode_(a, 'verify', a.email);
    return fail_('ยังไม่ได้ยืนยันอีเมล — ใส่รหัส 6 หลักที่ส่งไปทางอีเมล', 'unverified', {
      email: a.email, sent: sent, wait: sent ? CFG.RESEND_SEC : gate && gate.wait ? gate.wait : 0,
    });
  }
  sheet_('Accounts').getRange(a.row, 6, 1, 1).setValues([[Date.now()]]);
  log_(a.id, 'login', byEmail ? '' : 'username');
  return withLock_(function () {
    return newSession_(publicAccount_(a));
  });
}

/** ยืนยันอีเมลหลังสมัคร: email + code → ได้ token เหมือน login */
function verify_(req) {
  var email = normEmail_(req.email);
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  return withLock_(function () {
    var a = accountByEmail_(email);
    if (!a) return fail_('รหัสไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่', 'bad_code');
    if (a.verified) return fail_('ยืนยันอีเมลนี้แล้ว — เข้าสู่ระบบได้เลย', 'already');
    if (a.banned) return fail_('บัญชีนี้ถูกระงับ', 'banned');
    var bad = checkCode_(a, 'verify', req.code);
    if (bad) return bad;
    var now = Date.now();
    var sh = sheet_('Accounts');
    sh.getRange(a.row, 11, 1, 4).setValues([[true, '', '', 0]]);
    sh.getRange(a.row, 6, 1, 1).setValues([[now]]);
    log_(a.id, 'verify', '');
    a.verified = true;
    return newSession_(publicAccount_(a));
  });
}

/** ขอรหัสยืนยันใหม่ (บัญชีที่ยังไม่ยืนยัน) — ตอบเหมือนกันทุกกรณี ไม่บอกว่ามีบัญชีหรือไม่ */
function resend_(req) {
  var email = normEmail_(req.email);
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  var gate = mailGate_(email, 'verify');
  if (gate) return gate;
  var a = accountByEmail_(email);
  var sent = !!a && !a.verified && !a.banned && issueCode_(a, 'verify', email);
  if (a && !a.verified && !sent) return fail_('ส่งอีเมลไม่สำเร็จ ลองใหม่ภายหลัง', 'mail');
  return ok_({ wait: CFG.RESEND_SEC, message: 'ถ้ามีบัญชีที่รอยืนยัน เราได้ส่งรหัสใหม่ไปแล้ว' });
}

/** ลืมรหัสผ่าน: ส่งรหัสทางอีเมล — ตอบข้อความเดียวกันเสมอ (ไม่บอกว่ามีบัญชีนี้หรือไม่) */
function forgot_(req) {
  var email = normEmail_(req.email);
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  // จำกัดการส่งตามอีเมลเสมอ (มีบัญชีหรือไม่ก็ตาม) จึงไม่รั่วข้อมูล
  var gate = mailGate_(email, 'reset');
  if (gate) return gate;
  var a = accountByEmail_(email);
  if (a && !a.banned) issueCode_(a, 'reset', email);
  log_(a ? a.id : '', 'forgot', '');
  return ok_({ wait: CFG.RESEND_SEC, message: 'ถ้ามีบัญชีนี้ เราได้ส่งรหัสไปแล้ว' });
}

/** ตั้งรหัสผ่านใหม่ด้วยรหัสจากอีเมล → ยืนยันอีเมลไปด้วย + ล้าง session เดิมทั้งหมด + ได้ token ใหม่ */
function reset_(req) {
  var email = normEmail_(req.email);
  var password = String(req.password || '');
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  var pe = passwordError_(password);
  if (pe) return fail_(pe, 'invalid');
  var salt = Utilities.getUuid().replace(/-/g, '');
  var hash = hashPassword_(password, salt, CFG.HASH_ITER);
  return withLock_(function () {
    var a = accountByEmail_(email);
    var bad = a ? checkCode_(a, 'reset', req.code) : null;
    if (!a || (bad && bad.code === 'no_code')) return fail_('รหัสไม่ถูกต้องหรือหมดอายุ — ขอรหัสใหม่', 'bad_code');
    if (bad) return bad;
    if (a.banned) return fail_('บัญชีนี้ถูกระงับ', 'banned');
    var sh = sheet_('Accounts');
    sh.getRange(a.row, 3, 1, 2).setValues([[t_(salt), t_(hash)]]);
    sh.getRange(a.row, 11, 1, 4).setValues([[true, '', '', 0]]);
    // token เก่าทุกเครื่องใช้ไม่ได้อีก (ลบทั้งในชีตและแคช token)
    var cache = CacheService.getScriptCache();
    var ss = sheet_('Sessions');
    var srows = all_(ss);
    for (var i = srows.length - 1; i >= 0; i--) {
      if (String(srows[i][1]) !== a.id) continue;
      cache.remove('tok:' + String(srows[i][0]));
      ss.deleteRow(i + 2);
    }
    cache.remove('fail:' + email);
    log_(a.id, 'reset', '');
    a.verified = true;
    return newSession_(publicAccount_(a));
  });
}

/** บัญชีเก่า (ไม่มีอีเมล): ขอผูกอีเมล → ส่งรหัสไปที่อีเมลนั้น (ยังไม่บันทึกอีเมลจนกว่าจะ email.confirm) */
function emailAttach_(req, acc) {
  var email = normEmail_(req.email);
  if (!validEmail_(email)) return fail_('รูปแบบอีเมลไม่ถูกต้อง', 'invalid');
  var a = accountById_(acc.id);
  if (!a) return fail_('ไม่พบบัญชี', 'auth');
  if (a.email) return fail_('บัญชีนี้ผูกอีเมลแล้ว', 'has_email');
  if (accountByEmail_(email)) return fail_('อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว', 'email_taken');
  var gate = mailGate_(email, 'attach');
  if (gate) return gate;
  if (!issueCode_(a, 'attach', email)) return fail_('ส่งอีเมลไม่สำเร็จ ลองใหม่ภายหลัง', 'mail');
  log_(a.id, 'email.attach', '');
  return ok_({ email: email, wait: CFG.RESEND_SEC, message: 'ส่งรหัสยืนยัน 6 หลักไปที่ ' + email + ' แล้ว' });
}

/** ยืนยันรหัสผูกอีเมล → บันทึกอีเมล (ต่อไปเข้าระบบด้วยอีเมลเท่านั้น) */
function emailConfirm_(req, acc) {
  return withLock_(function () {
    var a = accountById_(acc.id);
    if (!a) return fail_('ไม่พบบัญชี', 'auth');
    if (a.email) return fail_('บัญชีนี้ผูกอีเมลแล้ว', 'has_email');
    var bad = checkCode_(a, 'attach', req.code);
    if (bad) return bad;
    var email = a.verifyHash.split('$')[1];
    if (accountByEmail_(email)) return fail_('อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว', 'email_taken');
    sheet_('Accounts').getRange(a.row, 10, 1, 5).setValues([[t_(email), true, '', '', 0]]);
    log_(a.id, 'email.confirm', '');
    a.email = email;
    a.verified = true;
    return ok_({ account: publicAccount_(a) });
  });
}

// ---------- เข้าสู่ระบบด้วย Google

var GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

/** client id ของ Google Sign-In: Script Property GOOGLE_CLIENT_ID ก่อน แล้วค่อย CFG */
function googleClientId_() {
  var id = '';
  try {
    id = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
  } catch (e) {
    /* อ่านไม่ได้ → ใช้ CFG */
  }
  return String(id || CFG.GOOGLE_CLIENT_ID || '').trim();
}

/**
 * เข้าสู่ระบบด้วย Google: credential = ID token จากปุ่ม Google (Google Identity Services) → ตรวจกับ Google (tokeninfo) แล้ว
 *  - บัญชีที่ผูก Google นี้ไว้ (googleSub) → เข้าเลย
 *  - บัญชีที่ใช้อีเมลเดียวกัน → ผูกให้อัตโนมัติ (Google ยืนยันอีเมลแล้ว) แล้วเข้า
 *  - ไม่มี → สร้างบัญชีใหม่ ชื่อในเกมชั่วคราวจาก given_name · account.needName = true ให้ผู้เล่นยืนยัน/เปลี่ยนชื่อครั้งเดียว (account.setName)
 */
function authGoogle_(req) {
  var clientId = googleClientId_();
  if (!clientId) return fail_('ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วย Google', 'google_off');
  var cred = String(req.credential || '');
  // ID token เป็น JWT (base64url 3 ท่อนคั่นด้วยจุด)
  if (cred.length < 20 || cred.length > 4096 || !/^[A-Za-z0-9_\-.]+$/.test(cred)) return fail_('ข้อมูลจาก Google ไม่ถูกต้อง — ลองใหม่อีกครั้ง', 'invalid');
  var cache = CacheService.getScriptCache();
  var failsAll = Number(cache.get('fail:*') || 0);
  if (failsAll >= CFG.MAX_FAILS_ALL) return fail_('ระบบกำลังถูกลองเข้าสู่ระบบจำนวนมาก — ลองใหม่ในอีกสักครู่', 'rate');
  var calls = Number(cache.get('gauth:count') || 0);
  if (calls >= CFG.MAX_GOOGLE) return fail_('มีคนเข้าสู่ระบบเยอะเกินไป ลองใหม่ในอีกสักครู่', 'rate');
  cache.put('gauth:count', String(calls + 1), CFG.FAIL_WINDOW_SEC);
  var g = googleTokenInfo_(cred, clientId);
  if (!g.ok) {
    if (g.code !== 'google_down') cache.put('fail:*', String(failsAll + 1), CFG.FAIL_WINDOW_SEC);
    log_('', 'google.fail', g.code + (g.why ? ' ' + g.why : ''));
    delete g.why;
    return g;
  }
  return withLock_(function () {
    var sh = sheet_('Accounts');
    var rows = all_(sh);
    var bySub = -1;
    var byEmail = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][14]) === g.sub) bySub = i;
      if (String(rows[i][9]).toLowerCase() === g.email) byEmail = i;
    }
    var now = Date.now();
    var k = bySub >= 0 ? bySub : byEmail;
    if (k >= 0) {
      var a = accFromRow_(rows[k], k);
      if (a.banned) return fail_('บัญชีนี้ถูกระงับ', 'banned');
      if (bySub < 0) {
        if (a.googleSub) return fail_('อีเมลนี้ผูกกับบัญชี Google อื่นแล้ว — เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน', 'google_linked');
        sh.getRange(a.row, 15, 1, 1).setValues([[t_(g.sub)]]);
        if (!a.verified) {
          // สมัครค้างไว้ยังไม่ยืนยัน: คนตั้งรหัสผ่านอาจไม่ใช่เจ้าของอีเมล → ล้างรหัสผ่านเดิม (ตั้งใหม่ได้ทาง "ลืมรหัสผ่าน")
          sh.getRange(a.row, 3, 1, 2).setValues([[t_(Utilities.getUuid().replace(/-/g, '')), t_(noPassword_())]]);
          sh.getRange(a.row, 11, 1, 4).setValues([[true, '', '', 0]]);
          a.verified = true;
          a.verifyHash = '';
        }
        log_(a.id, 'google.link', '');
      }
      sh.getRange(a.row, 6, 1, 1).setValues([[now]]);
      log_(a.id, 'login', 'google');
      return newSession_(publicAccount_(a));
    }
    var regs = Number(cache.get('reg:count') || 0);
    if (regs >= CFG.MAX_REGISTER) return fail_('มีคนสมัครเยอะเกินไป ลองใหม่ในอีกสักครู่', 'rate');
    var name = uniqueName_(googleName_(g), rows);
    var id = 'acc_' + now.toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 6);
    // verifyHash 'name$<อีเมล>$' = ยังไม่ได้ยืนยันชื่อในเกม (ไม่ใช่รหัส — checkCode_ ไม่รับ)
    var mark = 'name$' + g.email + '$';
    sh.appendRow([t_(id), t_(name), t_(Utilities.getUuid().replace(/-/g, '')), t_(noPassword_()), now, now, t_(name), '', false, t_(g.email), true, t_(mark), '', 0, t_(g.sub)]);
    cache.put('reg:count', String(regs + 1), CFG.FAIL_WINDOW_SEC);
    log_(id, 'register', 'google ' + name);
    return newSession_(publicAccount_({ id: id, username: name, createdAt: now, email: g.email, verifyHash: mark }));
  });
}

/** ตรวจ ID token กับ Google (tokeninfo ตรวจลายเซ็นให้) แล้วเช็ก aud / iss / exp / email_verified เอง → { ok, sub, email, given, name } */
function googleTokenInfo_(cred, clientId) {
  var bad = function (why) {
    return fail_('เข้าสู่ระบบด้วย Google ไม่สำเร็จ — ลองใหม่อีกครั้ง', 'google_bad', { why: why });
  };
  var res;
  try {
    res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(cred), { muteHttpExceptions: true });
  } catch (e) {
    log_('', 'google.fetch', String(e && e.message ? e.message : e).slice(0, 200));
    return fail_('ติดต่อ Google ไม่ได้ ลองใหม่อีกครั้ง', 'google_down');
  }
  var status = res.getResponseCode();
  if (status >= 500) return fail_('ติดต่อ Google ไม่ได้ ลองใหม่อีกครั้ง', 'google_down');
  var p = null;
  try {
    p = JSON.parse(res.getContentText());
  } catch (e) {
    /* ไม่ใช่ JSON */
  }
  if (status !== 200 || !p || typeof p !== 'object' || p.error) return bad('token ' + status);
  if (String(p.aud) !== clientId) return bad('aud');
  if (GOOGLE_ISS.indexOf(String(p.iss)) < 0) return bad('iss');
  if (!(Number(p.exp) * 1000 > Date.now())) return fail_('หมดเวลายืนยันตัวตนกับ Google — กดปุ่ม Google อีกครั้ง', 'google_expired');
  if (!isTrue_(p.email_verified)) return fail_('อีเมลของบัญชี Google นี้ยังไม่ได้ยืนยัน — ใช้บัญชีอื่น หรือสมัครด้วยอีเมล', 'google_unverified');
  var email = normEmail_(p.email);
  var sub = String(p.sub || '');
  if (!validEmail_(email)) return bad('email');
  if (!/^[A-Za-z0-9_-]{1,255}$/.test(sub)) return bad('sub');
  return ok_({ sub: sub, email: email, given: String(p.given_name || ''), name: String(p.name || '') });
}

/** รหัสผ่านที่ใช้เข้าไม่ได้ (บัญชี Google) — รอบเป็น 0 → login แฮชด้วยรอบปกติแล้วไม่มีทางตรง */
function noPassword_() {
  return 'nopw$0$' + Utilities.getUuid().replace(/-/g, '');
}

/** ชื่อในเกมชั่วคราวจากชื่อใน Google (given_name → name → ส่วนหน้าอีเมล) ตัดให้เข้ากฎ USERNAME_RE */
function googleName_(g) {
  var tries = [g.given, g.name, g.email.split('@')[0]];
  for (var i = 0; i < tries.length; i++) {
    var s = String(tries[i] || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_฀-๿]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16);
    if (s.length >= 3) return s;
  }
  return 'ผู้รอดชีวิต';
}

/** ชื่อไม่ซ้ำกับบัญชีอื่น (ไม่สนตัวพิมพ์) — ซ้ำ → ต่อท้ายด้วยตัวเลขสุ่ม (ยาวรวม ≤ 16) */
function uniqueName_(base, rows) {
  var taken = {};
  for (var i = 0; i < rows.length; i++) taken[String(rows[i][1]).toLowerCase()] = 1;
  if (!taken[base.toLowerCase()]) return base;
  for (var n = 0; n < 60; n++) {
    var digits = 2 + Math.floor(n / 15);
    var d = String(Math.floor(Math.random() * Math.pow(10, digits)));
    while (d.length < digits) d = '0' + d;
    var cand = base.slice(0, 16 - digits) + d;
    if (!taken[cand.toLowerCase()]) return cand;
  }
  return base.slice(0, 8) + Date.now().toString(36).slice(-8);
}

/** ยืนยัน/เปลี่ยนชื่อในเกมของบัญชีที่เพิ่งสร้างด้วย Google — ได้ครั้งเดียว (needName) */
function accountSetName_(req, acc) {
  var name = String(req.name || '').trim();
  if (!USERNAME_RE.test(name)) return fail_('ชื่อในเกม 3–16 ตัว (ไทย/อังกฤษ/ตัวเลข/_ ไม่มีเว้นวรรค)', 'invalid');
  return withLock_(function () {
    var a = accountById_(acc.id);
    if (!a) return fail_('ไม่พบบัญชี', 'auth');
    if (a.verifyHash.split('$')[0] !== 'name') return fail_('ตั้งชื่อในเกมไปแล้ว', 'name_set');
    var lname = name.toLowerCase();
    var rows = all_(sheet_('Accounts'));
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) !== a.id && String(rows[i][1]).toLowerCase() === lname) return fail_('ชื่อในเกมนี้มีคนใช้แล้ว', 'taken');
    }
    var sh = sheet_('Accounts');
    sh.getRange(a.row, 2, 1, 1).setValues([[t_(name)]]);
    sh.getRange(a.row, 7, 1, 1).setValues([[t_(name)]]);
    sh.getRange(a.row, 12, 1, 3).setValues([['', '', 0]]);
    // แคช token ของเครื่องนี้ยังจำชื่อเดิม → ล้าง
    CacheService.getScriptCache().remove('tok:' + sha256_(String(req.token)));
    log_(a.id, 'account.setName', name);
    a.username = name;
    a.verifyHash = '';
    return ok_({ account: publicAccount_(a) });
  });
}

// ---------- ตัวช่วยบัญชี/อีเมล

function normEmail_(s) {
  return String(s === undefined || s === null ? '' : s).trim().toLowerCase();
}

function validEmail_(e) {
  return e.length <= 254 && EMAIL_RE.test(e);
}

/** รหัสผ่านใหม่: 8–64 ตัว มีตัวอักษรและตัวเลขอย่างน้อยอย่างละ 1 (บัญชีเก่ารหัสสั้นกว่านี้ยังเข้าได้) */
function passwordError_(p) {
  if (p.length < 8) return 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';
  if (p.length > 64) return 'รหัสผ่านยาวเกิน 64 ตัวอักษร';
  if (!/[A-Za-zก-ฮ]/.test(p) || !/[0-9]/.test(p)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

/** a***@gmail.com */
function maskEmail_(e) {
  var at = e.indexOf('@');
  return at > 0 ? e.charAt(0) + '***' + e.slice(at) : e;
}

/** แถวของชีต Accounts → object (row = เลขแถวในชีต) */
function accFromRow_(r, i) {
  return {
    row: i + 2, id: String(r[0]), username: String(r[1]), salt: String(r[2]), hash: String(r[3]), createdAt: Number(r[4]),
    playerName: String(r[6] || ''), character: String(r[7] || ''), banned: isTrue_(r[8]),
    email: String(r[9] || '').toLowerCase(), verified: isTrue_(r[10]), verifyHash: String(r[11] || ''), verifyExp: Number(r[12]) || 0, verifyTries: Number(r[13]) || 0,
    googleSub: String(r[14] || ''),
  };
}

function accountByEmail_(email) {
  var rows = all_(sheet_('Accounts'));
  for (var i = 0; i < rows.length; i++) if (String(rows[i][9]).toLowerCase() === email) return accFromRow_(rows[i], i);
  return null;
}

/** ข้อมูลบัญชีที่ส่งให้ client (username = ชื่อในเกม/ชื่อผู้ใช้เดิม · needEmail = บัญชีเก่าที่ยังไม่ผูกอีเมล · needName = บัญชี Google ที่ยังไม่ยืนยันชื่อในเกม) */
function publicAccount_(a) {
  return { id: a.id, username: a.username, createdAt: a.createdAt, email: a.email, needEmail: !a.email, needName: String(a.verifyHash || '').indexOf('name$') === 0 };
}

/** รหัส 6 หลักจาก UUID สุ่ม (48 บิต) */
function newCode_() {
  var n = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000;
  return ('000000' + n).slice(-6);
}

/**
 * ด่านก่อนส่งอีเมล: รอ RESEND_SEC ต่ออีเมลต่อประเภท (verify/reset/attach) · ≤ MAIL_PER_EMAIL_HOUR ต่ออีเมลต่อชั่วโมง · ≤ MAIL_ALL_10MIN ทั้งระบบ · โควตา MailApp
 * ผ่าน → จองสิทธิ์ส่งแล้วคืน null · ไม่ผ่าน → fail_ (มี wait เป็นวินาทีถ้าต้องรอ)
 */
function mailGate_(email, purpose) {
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var cdKey = 'mailcd:' + purpose + ':' + email;
  var until = Number(cache.get(cdKey) || 0);
  if (until > now) {
    var wait = Math.ceil((until - now) / 1000);
    return fail_('ส่งรหัสไปแล้ว — ขอใหม่ได้ในอีก ' + wait + ' วินาที', 'cooldown', { wait: wait });
  }
  var perHour = Number(cache.get('mailh:' + email) || 0);
  if (perHour >= CFG.MAIL_PER_EMAIL_HOUR) return fail_('ขอรหัสบ่อยเกินไป — ลองใหม่ในอีก 1 ชั่วโมง', 'rate');
  var all = Number(cache.get('mail:*') || 0);
  if (all >= CFG.MAIL_ALL_10MIN) return fail_('มีคนขอรหัสเยอะเกินไป ลองใหม่ในอีกสักครู่', 'rate');
  var quota = 1;
  try {
    quota = MailApp.getRemainingDailyQuota();
  } catch (e) {
    /* อ่านโควตาไม่ได้ → ลองส่งไปเลย */
  }
  if (quota < 1) return fail_('วันนี้ส่งอีเมลครบโควตาแล้ว — ลองใหม่พรุ่งนี้', 'mail_quota');
  cache.put(cdKey, String(now + CFG.RESEND_SEC * 1000), CFG.RESEND_SEC);
  cache.put('mailh:' + email, String(perHour + 1), 3600);
  cache.put('mail:*', String(all + 1), 600);
  return null;
}

/** สร้างรหัสใหม่ → เก็บแฮช (ไม่เก็บตัวรหัส) ลง verifyHash = '<purpose>$<email>$<sha256>' → ส่งอีเมล · คืน true ถ้าส่งได้ */
function issueCode_(a, purpose, email) {
  var code = newCode_();
  var h = purpose + '$' + email + '$' + sha256_(purpose + ':' + a.id + ':' + code);
  sheet_('Accounts').getRange(a.row, 12, 1, 3).setValues([[t_(h), Date.now() + CFG.CODE_TTL_SEC * 1000, 0]]);
  a.verifyHash = h;
  a.verifyTries = 0;
  return sendCodeMail_(email, purpose, code, purpose === 'verify' ? a.username : a.playerName || a.username);
}

var MAIL_TEXT = {
  verify: { subject: 'รหัสยืนยันอีเมล', line: 'ขอบคุณที่สมัครเล่น ใส่รหัสนี้ในเกมเพื่อยืนยันอีเมลและเปิดใช้บัญชี' },
  reset: { subject: 'รหัสตั้งรหัสผ่านใหม่', line: 'มีคำขอตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ ใส่รหัสนี้ในเกมเพื่อตั้งรหัสผ่านใหม่\nถ้าไม่ได้ขอเอง ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้' },
  attach: { subject: 'รหัสยืนยันการผูกอีเมล', line: 'ใส่รหัสนี้ในเกมเพื่อผูกอีเมลนี้กับบัญชีของคุณ (ต่อไปเข้าสู่ระบบด้วยอีเมลนี้)' },
};

function sendCodeMail_(to, purpose, code, name) {
  var m = MAIL_TEXT[purpose];
  var body = [
    'สวัสดี ' + (cleanName_(name) || 'ผู้รอดชีวิต'),
    '',
    m.line,
    '',
    'รหัส: ' + code,
    '',
    'รหัสใช้ได้ ' + Math.round(CFG.CODE_TTL_SEC / 60) + ' นาที ใส่ผิดได้ไม่เกิน ' + CFG.CODE_TRIES + ' ครั้ง',
    'อย่าบอกรหัสนี้กับใคร ทีมงานจะไม่ขอรหัสนี้จากคุณ',
    '',
    '— ' + CFG.GAME_NAME,
  ].join('\n');
  try {
    MailApp.sendEmail({ to: to, subject: CFG.GAME_NAME + ' — ' + m.subject + ' ' + code, body: body, name: CFG.GAME_NAME });
    return true;
  } catch (e) {
    log_('', 'mail.fail', purpose + ': ' + String(e && e.message ? e.message : e).slice(0, 200));
    return false;
  }
}

/** ตรวจรหัสของ purpose นี้ — ถูก → null · ผิด → นับครั้ง (ครบ CODE_TRIES ต้องขอใหม่) */
function checkCode_(a, purpose, code) {
  var parts = a.verifyHash.split('$');
  if (parts[0] !== purpose || !parts[2]) return fail_('ยังไม่มีรหัสที่รอยืนยัน — กดส่งรหัสใหม่', 'no_code');
  if (a.verifyExp < Date.now()) return fail_('รหัสหมดอายุแล้ว — กดส่งรหัสใหม่', 'expired');
  if (a.verifyTries >= CFG.CODE_TRIES) return fail_('ใส่รหัสผิดครบ ' + CFG.CODE_TRIES + ' ครั้งแล้ว — กดส่งรหัสใหม่', 'too_many');
  code = String(code === undefined || code === null ? '' : code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return fail_('รหัสยืนยันเป็นตัวเลข 6 หลัก', 'invalid');
  if (safeEqual_(sha256_(purpose + ':' + a.id + ':' + code), parts[2])) return null;
  a.verifyTries++;
  sheet_('Accounts').getRange(a.row, 14, 1, 1).setValues([[a.verifyTries]]);
  var left = CFG.CODE_TRIES - a.verifyTries;
  if (left <= 0) return fail_('ใส่รหัสผิดครบ ' + CFG.CODE_TRIES + ' ครั้งแล้ว — กดส่งรหัสใหม่', 'too_many');
  return fail_('รหัสไม่ถูกต้อง (เหลืออีก ' + left + ' ครั้ง)', 'bad_code', { left: left });
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
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === id) return accFromRow_(rows[i], i);
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
  // อ่านจากชีตใหม่ (แคช token อาจยังไม่รู้ว่าเพิ่งผูกอีเมล)
  var a = accountById_(acc.id) || acc;
  var out = a.row ? publicAccount_(a) : { id: acc.id, username: acc.username, createdAt: acc.createdAt };
  out.playerName = a.playerName;
  return ok_({ account: out });
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
  // บอกข้อความแชทล่าสุดไปด้วย — client จะได้รู้ว่าควร chat.get หรือยัง (อ่านจากแคช ไม่แตะชีตเพิ่ม)
  return ok_({ players: players_(), joined: r > 0, chat: chatLatest_() });
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

// ------------------------------------------------------------------ แชทโลก

/** คำหยาบขั้นพื้นฐาน → แทนด้วย * (เติมได้) */
var CHAT_BAD_RE = /เหี้ย|ควย|สัส|fuck|shit/gi;

/** ข้อความแชท: ช่องว่าง/ขึ้นบรรทัดติดกัน → เว้นวรรคเดียว · ตัดอักขระควบคุม + < > · trim */
function cleanChat_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
}

function chatMsg_(r) {
  return { id: String(r[0]), time: Number(r[1]) || 0, accountId: String(r[2]), name: String(r[3] || ''), text: String(r[4] || ''), channel: String(r[5] || 'world') };
}

/** CHAT_PAGE ข้อความท้ายสุดจากชีต (เก่า→ใหม่) — อ่านเฉพาะแถวท้าย ไม่ดึงทั้งชีต */
function chatRead_(sh) {
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var count = Math.min(n, CFG.CHAT_PAGE);
  return sh.getRange(2 + n - count, 1, count, HEADERS.Chat.length).getValues().map(chatMsg_);
}

/** ข้อความล่าสุดจากแคช (CHAT_CACHE_SEC วิ) — chat.get ส่วนใหญ่จึงไม่แตะชีตเลย */
function chatRecent_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('chat:recent');
  if (hit) return JSON.parse(hit);
  var list = chatRead_(sheet_('Chat'));
  cache.put('chat:recent', JSON.stringify(list), CFG.CHAT_CACHE_SEC);
  return list;
}

function chatLatest_() {
  var list = chatRecent_();
  var last = list.length ? list[list.length - 1] : null;
  return { latestId: last ? last.id : '', latest: last ? last.time : 0 };
}

/**
 * ส่งข้อความ: text (1–CHAT_MAX_LEN หลังตัดแต่ง) · playerName (ชื่อในเกมล่าสุด ไม่ส่ง = ชื่อในบัญชี) · channel ('world')
 * จำกัดต่อบัญชีด้วย CacheService: เว้น CHAT_GAP_SEC วิระหว่างข้อความ · ≤ CHAT_PER_MIN ต่อนาที (หน้าต่างคงที่นับจากข้อความแรก)
 * lock เฉพาะตอนเขียน (time ไม่ซ้ำและเพิ่มขึ้นเสมอ → id เรียงตามเวลาได้ · client ใช้ `since` = time ที่เห็นล่าสุด)
 */
function chatPost_(req, acc) {
  var text = cleanChat_(req.text);
  if (!text) return fail_('พิมพ์ข้อความก่อนส่ง', 'invalid');
  if (text.length > CFG.CHAT_MAX_LEN) return fail_('ข้อความยาวเกิน ' + CFG.CHAT_MAX_LEN + ' ตัวอักษร', 'too_long');
  var channel = String(req.channel || 'world');
  if (channel !== 'world') return fail_('ไม่รู้จักช่องแชท', 'invalid');
  var cache = CacheService.getScriptCache();
  var now = Date.now();
  var gapKey = 'chatgap:' + acc.id;
  if (cache.get(gapKey)) return fail_('ส่งเร็วเกินไป — รอ ' + CFG.CHAT_GAP_SEC + ' วินาที', 'rate', { wait: CFG.CHAT_GAP_SEC });
  var minKey = 'chatmin:' + acc.id;
  var win = String(cache.get(minKey) || '0|' + now).split('|');
  var count = Number(win[0]) || 0;
  var start = Number(win[1]) || now;
  if (now - start >= 60000) {
    count = 0;
    start = now;
  }
  if (count >= CFG.CHAT_PER_MIN) {
    var wait = Math.ceil((start + 60000 - now) / 1000);
    return fail_('ส่งข้อความบ่อยเกินไป — พัก ' + wait + ' วินาที', 'rate', { wait: wait });
  }
  cache.put(gapKey, '1', CFG.CHAT_GAP_SEC);
  cache.put(minKey, (count + 1) + '|' + start, 120);
  var name = cleanName_(req.playerName) || acc.playerName || acc.username;
  var masked = text.replace(CHAT_BAD_RE, function (m) { return '*'.repeat(m.length); });
  return withLock_(function () {
    var sh = sheet_('Chat');
    var last = sh.getLastRow();
    var time = Date.now();
    if (last > 1) {
      var prev = Number(sh.getRange(last, 2, 1, 1).getValues()[0][0]) || 0;
      if (time <= prev) time = prev + 1;
    }
    var row = ['C' + time.toString(36), time, acc.id, name, masked, channel];
    sh.appendRow(row.map(function (v, i) { return i === 1 ? v : t_(v); }));
    // เก็บไม่เกิน CHAT_MAX แถว (ลบทีละ 200 แถวเก่าสุด)
    if (last > CFG.CHAT_MAX + 200) sh.deleteRows(2, 200);
    cache.put('chat:recent', JSON.stringify(chatRead_(sh)), CFG.CHAT_CACHE_SEC);
    return ok_({ message: chatMsg_(row) });
  });
}

/** since = time ของข้อความที่เห็นล่าสุด (0 = เอาทั้งหมด) → ข้อความที่ใหม่กว่า ≤ CHAT_PAGE ข้อความ เก่า→ใหม่ + serverTime (ให้ client เทียบนาฬิกา) */
function chatGet_(req) {
  var since = Number(req.since) || 0;
  var channel = String(req.channel || 'world');
  var list = chatRecent_();
  var out = list.filter(function (m) { return m.time > since && m.channel === channel; });
  return ok_({ messages: out, serverTime: Date.now(), latest: list.length ? list[list.length - 1].time : 0 });
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

/** เติมหัวตารางที่ขาด (ช่องว่าง) ให้ครบตาม h — ไม่ทับหัวตารางที่มีชื่ออื่นอยู่แล้ว ไม่ยุ่งแถวข้อมูล */
function migrateHeaders_(sh, h) {
  var max = sh.getMaxColumns();
  if (max < h.length) sh.insertColumnsAfter(max, h.length - max);
  var cur = sh.getRange(1, 1, 1, h.length).getValues()[0];
  var added = [];
  for (var i = 0; i < h.length; i++) {
    if (String(cur[i]) === h[i]) continue;
    if (cur[i] !== '' && cur[i] !== null && cur[i] !== undefined) {
      Logger.log('⚠ ชีต ' + sh.getName() + ' คอลัมน์ที่ ' + (i + 1) + ' หัวตารางเป็น "' + cur[i] + '" (ควรเป็น "' + h[i] + '") — ไม่แก้ให้ ตรวจด้วยมือ');
      continue;
    }
    cur[i] = h[i];
    added.push(h[i]);
  }
  sh.getRange(1, 1, 1, h.length).setValues([cur]).setFontWeight('bold');
  if (added.length && sh.getLastRow() > 1) Logger.log('ชีต ' + sh.getName() + ': เพิ่มคอลัมน์ ' + added.join(', ') + ' (ข้อมูลเดิมอยู่ครบ)');
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
