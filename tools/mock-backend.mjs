/**
 * backend จำลองสำหรับทดสอบในเครื่อง — รัน backend/apps-script/Code.gs ตัวจริงใน Node
 * โดยจำลอง SpreadsheetApp / Utilities / CacheService / LockService / ContentService ไว้ในหน่วยความจำ
 * (ข้อมูลหายเมื่อปิด) → request/response เหมือน Apps Script ทุกอย่าง + เปิด CORS ให้ next dev
 *
 *   node tools/mock-backend.mjs            (พอร์ต 8787 · ตั้ง PORT=xxxx ได้)
 *   MOCK_DELAY_MS=800 node tools/mock-backend.mjs   (หน่วงเวลาตอบ จำลองความช้าของ Apps Script)
 *   แล้วรันเกมด้วย NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
 */
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CODE = fileURLToPath(new URL('../backend/apps-script/Code.gs', import.meta.url));
const CELL_MAX = 50000;

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

function makeContext(ss) {
  const cache = new Map();
  const ctx = {
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
          if (!e || e.exp < Date.now()) return null;
          return e.v;
        },
        put: (k, v, ttl = 600) => void cache.set(k, { v: String(v), exp: Date.now() + ttl * 1000 }),
        remove: (k) => void cache.delete(k),
      }),
    },
    // Node รันทีละ request อยู่แล้ว — lock จำลองเป็น no-op
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (s) => ({ content: s, setMimeType() { return this; }, getContent() { return this.content; } }),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx, { filename: 'Code.gs' });
  return ctx;
}

/** สร้าง backend ใหม่ (ชีตว่าง + รัน setup) — ใช้ในเทสต์ได้โดยไม่ต้องเปิดพอร์ต */
export function createBackend() {
  const ss = new Spreadsheet();
  const gs = makeContext(ss);
  const log = console.log;
  console.log = () => {};
  gs.setup();
  console.log = log;
  return {
    ss,
    post: (body) => JSON.parse(gs.doPost({ postData: { contents: body, type: 'text/plain' } }).getContent()),
    get: () => JSON.parse(gs.doGet({}).getContent()),
  };
}

export function startServer(port = Number(process.env.PORT) || 8787, delay = Number(process.env.MOCK_DELAY_MS) || 0) {
  const be = createBackend();
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
  const { port } = await startServer();
  console.log(`mock backend (Code.gs ในหน่วยความจำ) พร้อมที่ http://localhost:${port}`);
  console.log(`รันเกม: NEXT_PUBLIC_API_URL=http://localhost:${port} npm run dev`);
}
