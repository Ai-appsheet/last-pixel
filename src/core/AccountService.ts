import { api, apiEnabled, setApiToken, setAuthLostHandler, type ApiFail } from './backend/Api';

/**
 * บัญชีผู้เล่น — สมัคร (อีเมล + รหัสผ่าน + ชื่อในเกม) / ยืนยันอีเมล / เข้าสู่ระบบ / ลืมรหัสผ่าน / ผูกอีเมล / ออกจากระบบ
 *
 * มี NEXT_PUBLIC_API_URL → RemoteAccountService (บัญชีอยู่บน Google Sheet ผ่าน Apps Script, ได้ token 30 วัน)
 *   สมัครแล้วต้องใส่รหัส 6 หลักที่ส่งทางอีเมลก่อนถึงจะได้ token · บัญชีเก่า (มีแต่ชื่อผู้ใช้) เข้าได้แล้วให้ผูกอีเมล
 * ไม่มี → LocalAccountService จำลองในเครื่อง (localStorage) — ใช้อีเมลเป็น key เข้าระบบ ไม่มีรหัสยืนยัน
 *   รหัสผ่านเก็บเป็นแฮช PBKDF2 + salt ไม่เก็บตัวจริง
 * ทุกบัญชีมีเซฟของตัวเอง (เกาะ ของ เลเวล) — ดู scopedKey()
 */
export interface Account {
  id: string;
  /** ชื่อในเกม (ชื่อที่คนอื่นเห็น) — บัญชีเก่าคือชื่อผู้ใช้เดิม */
  username: string;
  createdAt: number;
  email?: string;
  /** บัญชีเก่าที่ยังไม่ได้ผูกอีเมล (ออนไลน์เท่านั้น) */
  needEmail?: boolean;
}

/** ผลของขั้นตอนบัญชี: เข้าระบบแล้ว / ต้องใส่รหัสจากอีเมล / ผิดพลาด (wait = ต้องรอกี่วินาทีก่อนขอรหัสใหม่) */
export type AuthResult =
  | { kind: 'ok'; account: Account }
  | { kind: 'code'; email: string; message: string; wait: number; /** ส่งอีเมลไม่สำเร็จ (ข้อความเป็นคำเตือน) */ bad?: boolean }
  | { kind: 'error'; error: string; code?: string; wait?: number };

/** ผลของการขอส่งรหัส (resend / forgot) */
export type SendResult = { kind: 'sent'; message: string; wait: number } | { kind: 'error'; error: string; code?: string; wait?: number };

export interface AccountService {
  /** ต้องยืนยันด้วยรหัสทางอีเมล (ออนไลน์) — ออฟไลน์ข้ามขั้นนี้ */
  readonly emailCodes: boolean;
  register(email: string, password: string, name: string, remember?: boolean): Promise<AuthResult>;
  verify(email: string, code: string, remember: boolean): Promise<AuthResult>;
  resend(email: string): Promise<SendResult>;
  /** email = อีเมล หรือชื่อผู้ใช้เดิมของบัญชีเก่า */
  login(email: string, password: string, remember: boolean): Promise<AuthResult>;
  forgot(email: string): Promise<SendResult>;
  reset(email: string, code: string, password: string, remember: boolean): Promise<AuthResult>;
  /** บัญชีเก่า: ขอผูกอีเมล → 'code' (ส่งรหัสแล้ว) */
  attachEmail(email: string): Promise<AuthResult>;
  confirmEmail(code: string): Promise<AuthResult>;
  logout(): void;
  current(): Account | null;
}

interface StoredAccount extends Account {
  salt: string;
  hash: string;
}

const ACCOUNTS = 'lastpixel.accounts.v1';
const SESSION = 'lastpixel.session';
/** คีย์เซฟแบบเดิม (ก่อนมีระบบบัญชี) — ย้ายเข้าบัญชีแรกที่สมัคร */
const LEGACY = ['lastpixel.run.v2', 'lastpixel.meta.v2'];

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}

// ---------------------------------------------------------------- ตรวจข้อมูล (กฎเดียวกับ Code.gs)

const USERNAME_RE = /^[a-zA-Z0-9_฀-๿]{3,16}$/;
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export function validateEmail(e: string): string | null {
  const v = normalizeEmail(e);
  if (!v) return 'กรอกอีเมล';
  if (v.length > 254 || !EMAIL_RE.test(v)) return 'รูปแบบอีเมลไม่ถูกต้อง';
  return null;
}

/** ชื่อในเกม */
export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u)) return 'ชื่อในเกม 3–16 ตัว (ไทย/อังกฤษ/ตัวเลข/_ ไม่มีเว้นวรรค)';
  return null;
}

/** รหัสผ่านใหม่ (สมัคร/ตั้งใหม่) — บัญชีเก่าที่รหัสสั้นกว่านี้ยังเข้าระบบได้ */
export function validatePassword(p: string): string | null {
  if (p.length < 8) return 'รหัสผ่านอย่างน้อย 8 ตัวอักษร';
  if (p.length > 64) return 'รหัสผ่านยาวเกิน 64 ตัวอักษร';
  if (!/[A-Za-zก-ฮ]/.test(p) || !/[0-9]/.test(p)) return 'รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข';
  return null;
}

export function validateCode(c: string): string | null {
  return /^\d{6}$/.test(c.trim()) ? null : 'รหัสยืนยันเป็นตัวเลข 6 หลัก';
}

const fail = (error: string, code?: string, wait?: number): { kind: 'error'; error: string; code?: string; wait?: number } => ({ kind: 'error', error, code, wait });
const pub = (a: Account): Account => ({ id: a.id, username: a.username, createdAt: a.createdAt, email: a.email, needEmail: a.needEmail });

// ---------------------------------------------------------------- ออฟไลน์ (ในเครื่อง)

class LocalAccountService implements AccountService {
  readonly emailCodes = false;
  private session: string | null = null;

  constructor() {
    try {
      this.session = localStorage.getItem(SESSION) ?? sessionStorage.getItem(SESSION);
    } catch {
      this.session = null;
    }
  }

  /** key = อีเมล (บัญชีใหม่) หรือชื่อผู้ใช้ตัวเล็ก (บัญชีเก่าก่อนมีอีเมล) */
  private all(): Record<string, StoredAccount> {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS) ?? '{}');
    } catch {
      return {};
    }
  }

  private saveAll(a: Record<string, StoredAccount>) {
    localStorage.setItem(ACCOUNTS, JSON.stringify(a));
  }

  private setSession(id: string | null, remember: boolean) {
    this.session = id;
    try {
      localStorage.removeItem(SESSION);
      sessionStorage.removeItem(SESSION);
      if (id) (remember ? localStorage : sessionStorage).setItem(SESSION, id);
    } catch {
      /* ignore */
    }
  }

  async register(email: string, password: string, name: string, remember = true): Promise<AuthResult> {
    const e = normalizeEmail(email);
    const n = name.trim();
    const err = validateEmail(e) ?? validatePassword(password) ?? validateUsername(n);
    if (err) return fail(err, 'invalid');
    const all = this.all();
    if (all[e]) return fail('อีเมลนี้มีบัญชีแล้ว — เข้าสู่ระบบ', 'email_taken');
    if (Object.values(all).some((a) => a.username.toLowerCase() === n.toLowerCase())) return fail('ชื่อในเกมนี้มีคนใช้แล้ว', 'taken');
    const first = Object.keys(all).length === 0;
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const acc: StoredAccount = { id: `acc_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, username: n, email: e, createdAt: Date.now(), salt, hash: await hashPassword(password, salt) };
    all[e] = acc;
    this.saveAll(all);
    // บัญชีแรก: รับเซฟเดิมในเครื่อง (ถ้ามี) มาเป็นของบัญชีนี้
    if (first) {
      try {
        for (const k of LEGACY) {
          const v = localStorage.getItem(k);
          if (v && !localStorage.getItem(`${k}:${acc.id}`)) localStorage.setItem(`${k}:${acc.id}`, v);
        }
        const pid = localStorage.getItem('lastpixel.pid');
        if (pid) localStorage.setItem(`lastpixel.pid:${acc.id}`, pid);
      } catch {
        /* ignore */
      }
    }
    this.setSession(acc.id, remember);
    return { kind: 'ok', account: pub(acc) };
  }

  async login(email: string, password: string, remember: boolean): Promise<AuthResult> {
    const key = email.trim().toLowerCase();
    if (!key || !password) return fail('กรอกอีเมลและรหัสผ่าน', 'invalid');
    const acc = this.all()[key];
    if (!acc) return fail('ไม่พบบัญชีนี้ในเครื่อง — สมัครสมาชิกก่อน', 'bad_login');
    if ((await hashPassword(password, acc.salt)) !== acc.hash) return fail('รหัสผ่านไม่ถูกต้อง', 'bad_login');
    this.setSession(acc.id, remember);
    return { kind: 'ok', account: pub(acc) };
  }

  private noMail(): { kind: 'error'; error: string; code: string } {
    return { kind: 'error', error: 'โหมดออฟไลน์ไม่มีระบบอีเมล — กู้รหัสผ่านไม่ได้', code: 'offline' };
  }

  async verify(): Promise<AuthResult> {
    return this.noMail();
  }

  async resend(): Promise<SendResult> {
    return this.noMail();
  }

  async forgot(): Promise<SendResult> {
    return this.noMail();
  }

  async reset(): Promise<AuthResult> {
    return this.noMail();
  }

  /** ออฟไลน์: ย้าย key บัญชีเก่าไปเป็นอีเมลทันที (ไม่มีรหัสยืนยัน) */
  async attachEmail(email: string): Promise<AuthResult> {
    const e = normalizeEmail(email);
    const err = validateEmail(e);
    if (err) return fail(err, 'invalid');
    const all = this.all();
    const key = Object.keys(all).find((k) => all[k].id === this.session);
    if (!key) return fail('ยังไม่ได้เข้าสู่ระบบ', 'auth');
    if (all[key].email) return fail('บัญชีนี้ผูกอีเมลแล้ว', 'has_email');
    if (all[e]) return fail('อีเมลนี้ถูกใช้กับบัญชีอื่นแล้ว', 'email_taken');
    all[e] = { ...all[key], email: e };
    delete all[key];
    this.saveAll(all);
    return { kind: 'ok', account: pub(all[e]) };
  }

  async confirmEmail(): Promise<AuthResult> {
    return this.noMail();
  }

  logout() {
    this.setSession(null, false);
  }

  current(): Account | null {
    if (!this.session) return null;
    const acc = Object.values(this.all()).find((a) => a.id === this.session);
    return acc ? pub(acc) : null;
  }
}

// ---------------------------------------------------------------- ออนไลน์ (Apps Script)

/** session ฝั่งเซิร์ฟเวอร์ที่เก็บในเครื่อง (จำฉันไว้ = localStorage ไม่ติ๊ก = sessionStorage) */
const REMOTE_SESSION = 'lastpixel.session.remote';
interface RemoteSession extends Account {
  token: string;
  expiresAt: number;
}
type SessionReply = { token: string; expiresAt: number; account: Account };
/** คำตอบผิดพลาดที่มีข้อมูลเพิ่ม (unverified / cooldown) */
type FailExtra = ApiFail & { wait?: number; email?: string; sent?: boolean };

class RemoteAccountService implements AccountService {
  readonly emailCodes = true;
  private session: RemoteSession | null = null;
  private remember = true;

  constructor() {
    try {
      const fromLocal = localStorage.getItem(REMOTE_SESSION);
      const raw = fromLocal ?? sessionStorage.getItem(REMOTE_SESSION);
      const s = raw ? (JSON.parse(raw) as RemoteSession) : null;
      this.session = s && s.token && s.expiresAt > Date.now() ? s : null;
      this.remember = fromLocal !== null || raw === null;
    } catch {
      this.session = null;
    }
    setApiToken(this.session?.token ?? null);
    // เซิร์ฟเวอร์ปฏิเสธ token (หมดอายุ/ถูกแบน) → ออกจากระบบในเครื่อง
    setAuthLostHandler(() => this.setSession(null, false));
  }

  private setSession(s: RemoteSession | null, remember: boolean) {
    this.session = s;
    this.remember = remember;
    setApiToken(s?.token ?? null);
    try {
      localStorage.removeItem(REMOTE_SESSION);
      sessionStorage.removeItem(REMOTE_SESSION);
      if (s) (remember ? localStorage : sessionStorage).setItem(REMOTE_SESSION, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  /** ได้ token จากเซิร์ฟเวอร์ → เก็บ session */
  private signedIn(r: { ok: true } & SessionReply, remember: boolean): AuthResult {
    const acc: Account = { id: r.account.id, username: r.account.username, createdAt: r.account.createdAt, email: r.account.email || undefined, needEmail: !!r.account.needEmail };
    this.setSession({ ...acc, token: r.token, expiresAt: r.expiresAt }, remember);
    return { kind: 'ok', account: acc };
  }

  private err(r: ApiFail): ReturnType<typeof fail> {
    return fail(r.error, r.code, (r as FailExtra).wait);
  }

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    const e = normalizeEmail(email);
    const err = validateEmail(e) ?? validatePassword(password) ?? validateUsername(name.trim());
    if (err) return fail(err, 'invalid');
    const r = await api<{ email: string; message: string; wait: number; sent: boolean }>('register', { email: e, password, name: name.trim() }, { timeout: 30000 });
    if (!r.ok) return this.err(r);
    return { kind: 'code', email: r.email || e, message: r.message, wait: r.wait || 0, bad: r.sent === false };
  }

  async verify(email: string, code: string, remember: boolean): Promise<AuthResult> {
    const err = validateCode(code);
    if (err) return fail(err, 'invalid');
    const r = await api<SessionReply>('verify', { email: normalizeEmail(email), code: code.trim() }, { timeout: 30000 });
    return r.ok ? this.signedIn(r, remember) : this.err(r);
  }

  async resend(email: string): Promise<SendResult> {
    const r = await api<{ message: string; wait: number }>('resend', { email: normalizeEmail(email) }, { timeout: 30000 });
    return r.ok ? { kind: 'sent', message: 'ส่งรหัสใหม่แล้ว — ตรวจกล่องจดหมาย (และโฟลเดอร์สแปม)', wait: r.wait || 60 } : this.err(r);
  }

  async login(email: string, password: string, remember: boolean): Promise<AuthResult> {
    const ident = email.trim();
    if (!ident || !password) return fail('กรอกอีเมลและรหัสผ่าน', 'invalid');
    // มี @ = อีเมล · ไม่มี = ชื่อผู้ใช้ของบัญชีเก่า (เซิร์ฟเวอร์แยกเอง)
    if (ident.includes('@')) {
      const err = validateEmail(ident);
      if (err) return fail(err, 'invalid');
    }
    const r = await api<SessionReply>('login', { email: ident.includes('@') ? normalizeEmail(ident) : ident, password }, { timeout: 30000 });
    if (r.ok) return this.signedIn(r, remember);
    const x = r as FailExtra;
    if (r.code === 'unverified' && x.email) {
      return {
        kind: 'code', email: x.email, wait: x.wait ?? 0,
        message: x.sent ? `ยังไม่ได้ยืนยันอีเมล — ส่งรหัสใหม่ไปที่ ${x.email} แล้ว` : 'ยังไม่ได้ยืนยันอีเมล — ใส่รหัสที่ส่งไปทางอีเมลล่าสุด',
      };
    }
    return this.err(r);
  }

  async forgot(email: string): Promise<SendResult> {
    const e = normalizeEmail(email);
    const err = validateEmail(e);
    if (err) return fail(err, 'invalid');
    const r = await api<{ message: string; wait: number }>('forgot', { email: e }, { timeout: 30000 });
    return r.ok ? { kind: 'sent', message: r.message || 'ถ้ามีบัญชีนี้ เราได้ส่งรหัสไปแล้ว', wait: r.wait || 60 } : this.err(r);
  }

  async reset(email: string, code: string, password: string, remember: boolean): Promise<AuthResult> {
    const err = validateCode(code) ?? validatePassword(password);
    if (err) return fail(err, 'invalid');
    const r = await api<SessionReply>('reset', { email: normalizeEmail(email), code: code.trim(), password }, { timeout: 30000 });
    return r.ok ? this.signedIn(r, remember) : this.err(r);
  }

  async attachEmail(email: string): Promise<AuthResult> {
    const e = normalizeEmail(email);
    const err = validateEmail(e);
    if (err) return fail(err, 'invalid');
    const r = await api<{ email: string; message: string; wait: number }>('email.attach', { email: e }, { timeout: 30000 });
    if (!r.ok) return this.err(r);
    return { kind: 'code', email: r.email || e, message: r.message, wait: r.wait || 60 };
  }

  async confirmEmail(code: string): Promise<AuthResult> {
    const err = validateCode(code);
    if (err) return fail(err, 'invalid');
    const r = await api<{ account: Account }>('email.confirm', { code: code.trim() }, { timeout: 30000 });
    if (!r.ok) return this.err(r);
    const s = this.session;
    if (s) this.setSession({ ...s, email: r.account.email, needEmail: false }, this.remember);
    const cur = this.current();
    return cur ? { kind: 'ok', account: cur } : fail('เซสชันหมดอายุ — เข้าสู่ระบบใหม่', 'auth');
  }

  logout() {
    if (this.session) void api('logout');
    this.setSession(null, false);
  }

  current(): Account | null {
    const s = this.session;
    if (!s || s.expiresAt <= Date.now()) return null;
    return pub(s);
  }
}

let service: AccountService | null = null;
export function getAccounts(): AccountService {
  service ??= apiEnabled() ? new RemoteAccountService() : new LocalAccountService();
  return service;
}

/** คีย์ localStorage แยกตามบัญชีที่เข้าระบบอยู่ (ยังไม่เข้าระบบ = คีย์เดิม) */
export function scopedKey(base: string): string {
  const acc = getAccounts().current();
  return acc ? `${base}:${acc.id}` : base;
}
