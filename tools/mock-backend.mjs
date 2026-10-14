/**
 * backend จำลองสำหรับทดสอบในเครื่อง — รัน backend/apps-script/Code.gs ตัวจริงใน Node
 * โดยจำลอง SpreadsheetApp / Utilities / CacheService / LockService / ContentService ไว้ในหน่วยความจำ
 * (ข้อมูลหายเมื่อปิด) → request/response เหมือน Apps Script ทุกอย่าง + เปิด CORS ให้ next dev
 *
 *   node tools/mock-backend.mjs            (พอร์ต 8787 · ตั้ง PORT=xxxx ได้)
 *   MOCK_DELAY_MS=800 node tools/mock-backend.mjs   (หน่วงเวลาตอบ จำลองความช้าของ Apps Script)
 *   แล้วรันเกมด้วย NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
 *
 * ชีตทุกใบ (รวม Chat ของแชทโลก) ถูกสร้างจาก HEADERS ของ Code.gs ตอน setup — เพิ่มชีตใหม่ใน Code.gs ไม่ต้องแก้ที่นี่
 * MailApp จำลอง: ไม่ส่งจริง เก็บฉบับล่าสุดต่ออีเมลไว้ในหน่วยความจำ (รันเป็นเซิร์ฟเวอร์จะพิมพ์หัวเรื่อง+รหัสลง console)
 * Google Sign-In จำลอง: UrlFetchApp ไม่ออกเน็ต — tokeninfo รับเฉพาะ token ปลอม fakeGoogleToken() = 'test.' + base64url(JSON payload)
 *   (payload ไม่ใส่ aud/iss/exp = ค่าที่ถูกต้อง · expIn = หมดอายุในกี่วินาทีตามนาฬิกาของ mock) · token อื่นตอบ 400 เหมือน token เสีย
 *   Script Property GOOGLE_CLIENT_ID = GOOGLE_TEST_CLIENT_ID (createBackend({ googleClientId: '' }) = ปิด)
 * action สำหรับทดสอบ (มีเฉพาะใน mock นี้ — ไม่มีใน Code.gs):
 *   __mail   { email }             → { mail: { to, subject, body, code } | null, sent: จำนวนที่ส่งทั้งหมด }
 *   __clock  { advanceMs }          → เลื่อนเวลาของ Code.gs + CacheService ไปข้างหน้า (ทดสอบหมดอายุ/รอส่งใหม่)
 *   __legacy { username, password } → สร้างบัญชีแบบเก่า (มีแต่ชื่อผู้ใช้ ไม่มีอีเมล) เหมือนก่อนมีระบบอีเมล
 */
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CODE = fileURLToPath(new URL('../backend/apps-script/Code.gs', import.meta.url));
const CELL_MAX = 50000;
export const GOOGLE_TEST_CLIENT_ID = 'test-client.apps.googleusercontent.com';

/** ID token ปลอมของ mock (Code.gs ไม่รู้จัก — ไปถึง tokeninfo จำลองด้านล่างเท่านั้น) */
export const fakeGoogleToken = (payload) => 'test.' + Buffer.from(JSON.stringify(payload)).toString('base64url');

/** tokeninfo จำลอง: ตอบแบบเดียวกับ https://oauth2.googleapis.com/tokeninfo (ทุกค่าเป็นสตริง) */
function fakeTokenInfo(url, now, clientId) {
  const u = new URL(url);
  if (u.origin + u.pathname !== 'https://oauth2.googleapis.com/tokeninfo') throw new Error('mock UrlFetchApp: ไม่รู้จัก ' + u.origin + u.pathname);
  const tok = u.searchParams.get('id_token') ?? '';
  let p = null;
  try {
    if (tok.startsWith('test.')) p = JSON.parse(Buffer.from(tok.slice(5), 'base64url').toString('utf8'));
  } catch {
    p = null;
  }
  if (!p) return { status: 400, body: { error: 'invalid_token', error_description: 'Invalid Value' } };
  const sec = Math.floor(now() / 1000);
  const { expIn, ...rest } = p;
  const out = { iss: 'https://accounts.google.com', aud: clientId, azp: clientId, iat: sec, exp: sec + (expIn ?? 3600), email_verified: true, ...rest };
  return { status: 200, body: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, String(v)])) };
}

// ---------------------------------------------------------------- จำลอง Google Sheets

/** ชีตจริงแปลงข้อความที่หน้าตาเป็นตัวเลข/TRUE/FALSE เอง — ' นำหน้า = เก็บเป็นข้อความ */
function coerce(v) {
  if (typeof v !== 'string') return v;
  if (v.startsWith("'")) return v.slice(1);
  if (/^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  return v;
}

function checkCell(v) {
  if (typeof v === 'string' && v.length > CELL_MAX) throw new Error(`Your input contains more than the maximum of ${CELL_MAX} characters in a single cell.`);
}

class Range {
  constructor(sheet, row, col, nr, nc) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error('The coordinates or dimensions of the range are invalid.');
    if (col + nc - 1 > sheet.maxCols) throw new Error(`Range out of bounds: column ${col + nc - 1} > ${sheet.maxCols}`);
    Object.assign(this, { sheet, row, col, nr, nc });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nr; r++) {
      const src = this.sheet.rows[this.row - 1 + r] ?? [];
      const line = [];
      for (let c = 0; c < this.nc; c++) line.push(src[this.col - 1 + c] ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.nr || values.some((l) => l.length !== this.nc)) throw new Error('The number of rows or columns in the data does not match the range.');
    values.forEach((line, r) => {
      const idx = this.row - 1 + r;
      const dst = (this.sheet.rows[idx] ??= []);
      line.forEach((v, c) => {
        checkCell(v);
        dst[this.col - 1 + c] = coerce(v);
      });
    });
    return this;
  }
  setFontWeight() {
    return this;
  }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.maxCols = 26;
  }
  getName() {
    return this.name;
  }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) if ((this.rows[i] ?? []).some((v) => v !== '' && v !== undefined)) return i + 1;
    return 0;
  }
  getLastColumn() {
    let m = 0;
    for (const r of this.rows) if (r) for (let c = r.length - 1; c >= 0; c--) if (r[c] !== '' && r[c] !== undefined) { m = Math.max(m, c + 1); break; }
    return m;
  }
  getMaxColumns() {
    return this.maxCols;
  }
  insertColumnsAfter(_after, n) {
    this.maxCols += n;
  }
  getRange(row, col, nr = 1, nc = 1) {
    return new Range(this, row, col, nr, nc);
  }
  appendRow(values) {
    if (values.length > this.maxCols) this.maxCols = values.length;
    values.forEach(checkCell);
    this.rows[this.getLastRow()] = values.map(coerce);
    return this;
  }
  deleteRow(r) {
    this.rows.splice(r - 1, 1);
  }
  deleteRows(r, n) {
    this.rows.splice(r - 1, n);
  }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor() {
    this.sheets = new Map();
  }
  getSheetByName(name) {
    return this.sheets.get(name) ?? null;
  }
  insertSheet(name) {
    const sh = new Sheet(name);
    this.sheets.set(name, sh);
    return sh;
  }
}

// ---------------------------------------------------------------- จำลองบริการอื่นของ Apps Script

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => b & 255));

class Blob {
  constructor(bytes = Buffer.alloc(0), type = '') {
    this.bytes = Buffer.from(bytes);
    this.type = type;
  }
  setDataFromString(s, cs = 'UTF-8') {
    this.bytes = Buffer.from(String(s), cs.toLowerCase().replace('-', '') === 'utf8' ? 'utf8' : 'latin1');
    return this;
  }
  getBytes() {
    return signed(this.bytes);
  }
  getDataAsString() {
    return this.bytes.toString('utf8');
  }
}

function makeContext(ss, clock, mail, google) {
  const cache = new Map();
  const props = new Map(google.clientId ? [['GOOGLE_CLIENT_ID', google.clientId]] : []);
  const now = () => Date.now() + clock.skew;
  const ctx = {
    __now: now,
    console,
    Logger: { log: (...a) => console.log('[gs]', ...a) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => {} },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      getUuid: () => crypto.randomUUID(),
      computeDigest: (alg, value) => signed(crypto.createHash(alg).update(typeof value === 'string' ? Buffer.from(value, 'utf8') : unsigned(value)).digest()),
      newBlob: (data, type) => (typeof data === 'string' ? new Blob(Buffer.from(data, 'utf8'), type) : new Blob(unsigned(data ?? []), type)),
      gzip: (blob) => new Blob(zlib.gzipSync(blob.bytes), 'application/x-gzip'),
      ungzip: (blob) => new Blob(zlib.gunzipSync(blob.bytes)),
      base64Encode: (bytes) => unsigned(bytes).toString('base64'),
      base64Decode: (s) => signed(Buffer.from(s, 'base64')),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const e = cache.get(k);
          if (!e || e.exp < now()) return null;
          return e.v;
        },
        put: (k, v, ttl = 600) => void cache.set(k, { v: String(v), exp: now() + ttl * 1000 }),
        remove: (k) => void cache.delete(k),
      }),
    },
    MailApp: {
      sendEmail: (opts, subject, body) => {
        const m = typeof opts === 'object' ? { ...opts } : { to: opts, subject, body };
        if (mail.quota < 1) throw new Error('Service invoked too many times for one day: email.');
        mail.quota--;
        mail.sent++;
        mail.last.set(String(m.to).toLowerCase(), m);
        if (mail.verbose) console.log(`[mail] ${m.to} · ${m.subject}`);
      },
      getRemainingDailyQuota: () => mail.quota,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => props.get(k) ?? null,
        setProperty: (k, v) => void props.set(k, String(v)),
      }),
    },
    UrlFetchApp: {
      fetch: (url) => {
        google.calls++;
        const r = fakeTokenInfo(url, now, google.clientId);
        return { getResponseCode: () => r.status, getContentText: () => JSON.stringify(r.body) };
      },
    },
    // Node รันทีละ request อยู่แล้ว — lock จำลองเป็น no-op
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
  };
  vm.createContext(ctx);
  // Date.now() ใน Code.gs ใช้นาฬิกาที่เลื่อนได้ (__clock)
  vm.runInContext('Date.now = function () { return __now(); };', ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx, { filename: 'Code.gs' });
  return ctx;
}

/**
 * สร้าง backend ใหม่ (ชีตว่าง + รัน setup) — ใช้ในเทสต์ได้โดยไม่ต้องเปิดพอร์ต
 * opts.prepare(ss) = เตรียมชีตก่อนรัน setup (เช่น ชีต Accounts แบบเก่า เพื่อทดสอบการเติมคอลัมน์)
 */
export function createBackend(opts = {}) {
  const ss = new Spreadsheet();
  opts.prepare?.(ss);
  const clock = { skew: 0 };
  const mail = { last: new Map(), sent: 0, quota: opts.mailQuota ?? 100, verbose: !!opts.verbose };
  const google = { clientId: opts.googleClientId ?? GOOGLE_TEST_CLIENT_ID, calls: 0 };
  const gs = makeContext(ss, clock, mail, google);
  const logs = [];
  /** รัน setup โดยเก็บ Logger.log ไว้ใน logs แทนการพิมพ์ */
  const runSetup = () => {
    const log = console.log;
    console.log = (...a) => logs.push(a.join(' '));
    try {
      gs.setup();
    } finally {
      console.log = log;
    }
  };
  runSetup();
  const doPost = (body) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain' } }).getContent());
  /** action ทดสอบเฉพาะ mock (ขึ้นต้นด้วย __) — ไม่ผ่าน Code.gs */
  const mockOnly = (req) => {
    if (req.action === '__mail') {
      const m = mail.last.get(String(req.email ?? '').trim().toLowerCase()) ?? null;
      return { ok: true, sent: mail.sent, quota: mail.quota, mail: m && { ...m, code: /\b(\d{6})\b/.exec(m.body)?.[1] ?? null } };
    }
    if (req.action === '__clock') {
      clock.skew += Number(req.advanceMs) || 0;
      return { ok: true, skew: clock.skew };
    }
    if (req.action === '__legacy') {
      const salt = crypto.randomBytes(16).toString('hex');
      const id = 'acc_legacy' + crypto.randomBytes(4).toString('hex');
      const t = Date.now() + clock.skew;
      // แถว 9 คอลัมน์แบบเดิม (ก่อนมี email/verified/…)
      gs.sheet_('Accounts').appendRow([`'${id}`, `'${req.username}`, `'${salt}`, `'${gs.hashPassword_(String(req.password), salt, gs.CFG.HASH_ITER)}`, t, t, '', '', false]);
      return { ok: true, id };
    }
    return null;
  };
  return {
    ss,
    mail,
    clock,
    google,
    setupLog: logs,
    post: (body) => {
      let req = null;
      try {
        req = JSON.parse(body);
      } catch {
        /* ให้ Code.gs ตอบ bad_request เอง */
      }
      return (req && typeof req.action === 'string' && req.action.startsWith('__') && mockOnly(req)) || doPost(body);
    },
    get: () => JSON.parse(gs.doGet({}).getContent()),
    /** รัน setup ซ้ำ (เหมือนกด ▶ setup อีกครั้งหลังวางโค้ดใหม่) */
    setup: runSetup,
  };
}

export function startServer(port = Number(process.env.PORT) || 8787, delay = Number(process.env.MOCK_DELAY_MS) || 0, opts = {}) {
  const be = createBackend(opts);
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      setTimeout(() => {
        let out;
        try {
          out = req.method === 'POST' ? be.post(Buffer.concat(chunks).toString('utf8')) : be.get();
        } catch (e) {
          out = { ok: false, error: 'mock: ' + e.message, code: 'server' };
        }
        res.writeHead(200, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out));
      }, delay);
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, port: server.address().port, backend: be })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { port } = await startServer(undefined, undefined, { verbose: true });
  console.log(`mock backend (Code.gs ในหน่วยความจำ) พร้อมที่ http://localhost:${port}`);
  console.log(`รันเกม: NEXT_PUBLIC_API_URL=http://localhost:${port} npm run dev`);
}
