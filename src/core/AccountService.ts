import { api, apiEnabled, setApiToken, setAuthLostHandler } from './backend/Api';

/**
 * บัญชีผู้เล่น — สมัครสมาชิก / เข้าสู่ระบบ / ออกจากระบบ
 *
 * มี NEXT_PUBLIC_API_URL → RemoteAccountService (บัญชีอยู่บน Google Sheet ผ่าน Apps Script, ได้ token 30 วัน)
 * ไม่มี → LocalAccountService จำลองในเครื่อง (localStorage) — รหัสผ่านเก็บเป็นแฮช PBKDF2 + salt ไม่เก็บตัวจริง
 * ทุกบัญชีมีเซฟของตัวเอง (เกาะ ของ เลเวล) — ดู scopedKey()
 */
export interface Account {
  id: string;
  username: string;
  createdAt: number;
}

interface StoredAccount extends Account {
  salt: string;
  hash: string;
}

export interface AccountService {
  register(username: string, password: string): Promise<Account | { error: string }>;
  login(username: string, password: string, remember: boolean): Promise<Account | { error: string }>;
  logout(): void;
  current(): Account | null;
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

const USERNAME_RE = /^[a-zA-Z0-9_฀-๿]{3,16}$/;

export function validateUsername(u: string): string | null {
  if (!USERNAME_RE.test(u)) return 'ชื่อผู้ใช้ 3–16 ตัว (ไทย/อังกฤษ/ตัวเลข/_ ไม่มีเว้นวรรค)';
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length < 6) return 'รหัสผ่านอย่างน้อย 6 ตัวอักษร';
  return null;
}

class LocalAccountService implements AccountService {
  private session: string | null = null;

  constructor() {
    try {
      this.session = localStorage.getItem(SESSION) ?? sessionStorage.getItem(SESSION);
    } catch {
      this.session = null;
    }
  }

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

  async register(username: string, password: string) {
    const u = username.trim();
    const err = validateUsername(u) ?? validatePassword(password);
    if (err) return { error: err };
    const all = this.all();
    if (all[u.toLowerCase()]) return { error: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' };
    const first = Object.keys(all).length === 0;
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    const acc: StoredAccount = { id: `acc_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`, username: u, createdAt: Date.now(), salt, hash: await hashPassword(password, salt) };
    all[u.toLowerCase()] = acc;
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
    this.setSession(acc.id, true);
    return { id: acc.id, username: acc.username, createdAt: acc.createdAt };
  }

  async login(username: string, password: string, remember: boolean) {
    const acc = this.all()[username.trim().toLowerCase()];
    if (!acc) return { error: 'ไม่พบชื่อผู้ใช้นี้ — สมัครสมาชิกก่อน' };
    if ((await hashPassword(password, acc.salt)) !== acc.hash) return { error: 'รหัสผ่านไม่ถูกต้อง' };
    this.setSession(acc.id, remember);
    return { id: acc.id, username: acc.username, createdAt: acc.createdAt };
  }

  logout() {
    this.setSession(null, false);
  }

  current(): Account | null {
    if (!this.session) return null;
    const acc = Object.values(this.all()).find((a) => a.id === this.session);
    return acc ? { id: acc.id, username: acc.username, createdAt: acc.createdAt } : null;
  }
}

/** session ฝั่งเซิร์ฟเวอร์ที่เก็บในเครื่อง (จำฉันไว้ = localStorage ไม่ติ๊ก = sessionStorage) */
const REMOTE_SESSION = 'lastpixel.session.remote';
interface RemoteSession extends Account {
  token: string;
  expiresAt: number;
}

class RemoteAccountService implements AccountService {
  private session: RemoteSession | null = null;

  constructor() {
    try {
      const raw = localStorage.getItem(REMOTE_SESSION) ?? sessionStorage.getItem(REMOTE_SESSION);
      const s = raw ? (JSON.parse(raw) as RemoteSession) : null;
      this.session = s && s.token && s.expiresAt > Date.now() ? s : null;
    } catch {
      this.session = null;
    }
    setApiToken(this.session?.token ?? null);
    // เซิร์ฟเวอร์ปฏิเสธ token (หมดอายุ/ถูกแบน) → ออกจากระบบในเครื่อง
    setAuthLostHandler(() => this.setSession(null, false));
  }

  private setSession(s: RemoteSession | null, remember: boolean) {
    this.session = s;
    setApiToken(s?.token ?? null);
    try {
      localStorage.removeItem(REMOTE_SESSION);
      sessionStorage.removeItem(REMOTE_SESSION);
      if (s) (remember ? localStorage : sessionStorage).setItem(REMOTE_SESSION, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  private async auth(action: 'register' | 'login', username: string, password: string, remember: boolean) {
    const r = await api<{ token: string; expiresAt: number; account: Account }>(action, { username: username.trim(), password }, { timeout: 30000 });
    if (!r.ok) return { error: r.error };
    const acc = { id: r.account.id, username: r.account.username, createdAt: r.account.createdAt };
    this.setSession({ ...acc, token: r.token, expiresAt: r.expiresAt }, remember);
    return acc;
  }

  async register(username: string, password: string) {
    const err = validateUsername(username.trim()) ?? validatePassword(password);
    if (err) return { error: err };
    return this.auth('register', username, password, true);
  }

  async login(username: string, password: string, remember: boolean) {
    if (!username.trim() || !password) return { error: 'กรอกชื่อผู้ใช้และรหัสผ่าน' };
    return this.auth('login', username, password, remember);
  }

  logout() {
    if (this.session) void api('logout');
    this.setSession(null, false);
  }

  current(): Account | null {
    const s = this.session;
    if (!s || s.expiresAt <= Date.now()) return null;
    return { id: s.id, username: s.username, createdAt: s.createdAt };
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
