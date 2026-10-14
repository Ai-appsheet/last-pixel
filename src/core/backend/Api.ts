/**
 * ตัวเรียก backend (Google Apps Script web app หรือ tools/mock-backend.mjs)
 *  - เปิดใช้เมื่อ build ด้วย NEXT_PUBLIC_API_URL · ไม่ตั้ง = เล่นออฟไลน์ (localStorage) แบบเดิม
 *  - ส่ง JSON เป็น text/plain เพื่อไม่ให้เบราว์เซอร์ยิง CORS preflight (Apps Script ตอบ OPTIONS ไม่ได้)
 *  - ทุกคำตอบเป็น { ok: true, ... } หรือ { ok: false, error: 'ข้อความไทย', code }
 */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

export const apiEnabled = () => API_URL.length > 0;

/** path ของไฟล์ใน public/ (GitHub Pages อยู่ใต้ /<repo>/) — ลงท้ายด้วย / เสมอ */
export function assetBase(): string {
  return `${(process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')}/`;
}

export type ApiFail = { ok: false; error: string; code: string };
export type ApiResult<T> = ({ ok: true } & T) | ApiFail;

/** สถานะการเชื่อมต่อล่าสุด (ใช้แสดงไฟบนหน้าแรก) */
export type NetStatus = 'off' | 'online' | 'offline' | 'unknown';
let status: NetStatus = apiEnabled() ? 'unknown' : 'off';
const watchers = new Set<(s: NetStatus) => void>();
export const netStatus = () => status;
export function onNetStatus(fn: (s: NetStatus) => void) {
  watchers.add(fn);
  return () => watchers.delete(fn);
}
function setStatus(s: NetStatus) {
  if (s === status) return;
  status = s;
  watchers.forEach((fn) => fn(s));
}

/** token ของ session (AccountService ตั้งให้) */
let token: string | null = null;
let onAuthLost: (() => void) | null = null;
export const setApiToken = (t: string | null) => (token = t);
export const apiToken = () => token;
/** เรียกเมื่อเซิร์ฟเวอร์บอกว่า token หมดอายุ/ใช้ไม่ได้ */
export const setAuthLostHandler = (fn: () => void) => (onAuthLost = fn);

/** action ที่เรียกซ้ำได้ปลอดภัย (อ่านอย่างเดียว / ผลเหมือนเดิม) */
const RETRYABLE = new Set(['me', 'save.get', 'meta.get', 'world.get', 'market.list', 'leaderboard.get', 'world.heartbeat', 'ping']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function api<T = Record<string, unknown>>(
  action: string,
  body: Record<string, unknown> = {},
  opts: { timeout?: number; retries?: number } = {},
): Promise<ApiResult<T>> {
  if (!apiEnabled()) return { ok: false, error: 'ไม่ได้ตั้งค่าเซิร์ฟเวอร์', code: 'disabled' };
  const retries = opts.retries ?? (RETRYABLE.has(action) ? 2 : 0);
  const payload = JSON.stringify({ ...body, action, token: token ?? undefined });
  let last: ApiFail = { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', code: 'network' };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await sleep(600 * attempt);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeout ?? 20000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: payload,
        redirect: 'follow',
        signal: ctl.signal,
      });
      const json = (await res.json()) as ApiResult<T>;
      setStatus('online');
      if (!json.ok && json.code === 'auth' && token) {
        token = null;
        onAuthLost?.();
      }
      return json;
    } catch (e) {
      last = (e as Error)?.name === 'AbortError'
        ? { ok: false, error: 'เซิร์ฟเวอร์ตอบช้าเกินไป ลองใหม่อีกครั้ง', code: 'timeout' }
        : { ok: false, error: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ต', code: 'network' };
    } finally {
      clearTimeout(timer);
    }
  }
  setStatus('offline');
  return last;
}

/**
 * ส่งแบบ "ยิงแล้วลืม" ตอนปิดหน้า (pagehide) — sendBeacon ส่งได้แม้หน้ากำลังปิด (จำกัด ~64KB)
 * ใหญ่กว่านั้น/ส่งไม่ได้ → fetch keepalive (ก็จำกัด 64KB) → fetch ธรรมดา (อาจไม่ทันถ้าหน้าปิดแล้ว)
 */
export function apiBeacon(action: string, body: Record<string, unknown>): boolean {
  if (!apiEnabled()) return false;
  const payload = JSON.stringify({ ...body, action, token: token ?? undefined });
  const small = payload.length < 60000;
  try {
    if (small && navigator.sendBeacon?.(API_URL, new Blob([payload], { type: 'text/plain;charset=utf-8' }))) return true;
  } catch {
    /* ใช้ fetch แทน */
  }
  try {
    void fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: payload, keepalive: small }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

/** ตรวจว่าเซิร์ฟเวอร์ตอบไหม (ไฟสถานะบนหน้าแรก) */
export async function ping(): Promise<boolean> {
  const r = await api('ping', {}, { timeout: 12000, retries: 1 });
  return r.ok;
}
