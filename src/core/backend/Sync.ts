import { getAccounts } from '../AccountService';
import { api, apiBeacon, apiEnabled, ping } from './Api';

/**
 * ซิงก์เซฟกับเซิร์ฟเวอร์เบื้องหลัง — SaveManager/MetaSave ยังอ่าน/เขียน localStorage แบบ sync เหมือนเดิม (เป็นแคช)
 *  - หลังเข้าระบบ: ดึงเซฟ + meta จากเซิร์ฟเวอร์ (อันไหนใหม่กว่าตาม updatedAt ชนะ)
 *  - เซฟในเครื่องเปลี่ยน → ส่งขึ้นเซิร์ฟเวอร์แบบหน่วง ~15 วิ · ซ่อน/ปิดหน้า → ส่งทันที (sendBeacon)
 *  - ตายถาวร → ลบเซฟบนเซิร์ฟเวอร์ด้วย
 */
const RUN = 'lastpixel.run.v2';
const META = 'lastpixel.meta.v2';
const STATE = 'lastpixel.sync.v1';
const DEBOUNCE = 15000;

interface Part {
  /** เวลาที่ข้อมูลในเครื่องเปลี่ยนล่าสุด (ms) */
  at: number;
  /** ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์ */
  dirty: boolean;
}
interface State {
  save: Part;
  meta: Part;
}

/** บัญชีที่เข้าระบบอยู่ (ออนไลน์เท่านั้น) — จับ id ไว้ตั้งแต่ต้น กันออกจากระบบระหว่างรอเซิร์ฟเวอร์แล้วเขียนผิดคีย์ */
const accId = () => (apiEnabled() ? getAccounts().current()?.id ?? null : null);
const on = () => accId() !== null;
/** คีย์เดียวกับ scopedKey() ของบัญชีนั้น */
const k = (base: string, acc: string) => `${base}:${acc}`;

function readState(acc: string): State {
  try {
    const s = JSON.parse(localStorage.getItem(k(STATE, acc)) ?? 'null') as State | null;
    if (s?.save && s.meta) return s;
  } catch {
    /* เริ่มใหม่ */
  }
  return { save: { at: 0, dirty: false }, meta: { at: 0, dirty: false } };
}

function writeState(acc: string, s: State) {
  try {
    localStorage.setItem(k(STATE, acc), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const getRaw = (base: string, acc: string) => {
  try {
    return localStorage.getItem(k(base, acc));
  } catch {
    return null;
  }
};

function setRaw(base: string, acc: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k(base, acc));
    else localStorage.setItem(k(base, acc), v);
  } catch {
    /* ignore */
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;
let pushing: Promise<void> | null = null;
let again = false;
let pulled: { acc: string; p: Promise<boolean> } | null = null;
let started = false;

function schedule(delay = DEBOUNCE) {
  if (!on()) return;
  if (timer) {
    if (delay > 0) return; // รอบที่ตั้งไว้แล้วจะส่งให้เอง
    clearTimeout(timer);
  }
  timer = setTimeout(() => {
    timer = null;
    void Sync.flush();
  }, delay);
}

export const Sync = {
  /** SaveManager.save → จดว่าเซฟในเครื่องใหม่กว่า */
  markSave(at: number) {
    const acc = accId();
    if (!acc) return;
    const s = readState(acc);
    s.save = { at: Math.max(at, s.save.at + 1), dirty: true };
    writeState(acc, s);
    schedule();
  },

  /** SaveManager.clear (ตายถาวร/เริ่มใหม่) → ลบบนเซิร์ฟเวอร์ทันที */
  markSaveCleared() {
    const acc = accId();
    if (!acc) return;
    const s = readState(acc);
    s.save = { at: Math.max(Date.now(), s.save.at + 1), dirty: true };
    writeState(acc, s);
    schedule(0);
  },

  markMeta() {
    const acc = accId();
    if (!acc) return;
    const s = readState(acc);
    s.meta = { at: Math.max(Date.now(), s.meta.at + 1), dirty: true };
    writeState(acc, s);
    schedule();
  },

  /** ดึงเซฟ + meta จากเซิร์ฟเวอร์ลงแคช — คืน true ถ้าข้อมูลในเครื่องเปลี่ยน */
  async pull(): Promise<boolean> {
    const acc = accId();
    if (!acc) return false;
    const [rs, rm] = await Promise.all([
      api<{ save: string | null; updatedAt: number }>('save.get'),
      api<{ meta: string | null; updatedAt: number }>('meta.get'),
    ]);
    if (accId() !== acc) return false;
    const st = readState(acc);
    let changed = false;
    let push = false;
    if (rs.ok) {
      const at = Number(rs.updatedAt) || 0;
      if (at > st.save.at) {
        setRaw(RUN, acc, rs.save ?? null);
        st.save = { at, dirty: false };
        changed = true;
      } else if (at === st.save.at) st.save.dirty = false;
      else {
        // ในเครื่องใหม่กว่า (เล่นตอนเน็ตหลุด) → ส่งขึ้น
        st.save.dirty = true;
        push = true;
      }
    }
    if (rm.ok) {
      const at = Number(rm.updatedAt) || 0;
      if (at > st.meta.at && rm.meta) {
        setRaw(META, acc, rm.meta);
        st.meta = { at, dirty: false };
        changed = true;
      } else if (at === st.meta.at) st.meta.dirty = false;
      else if (st.meta.at > at && getRaw(META, acc)) {
        st.meta.dirty = true;
        push = true;
      }
    }
    writeState(acc, st);
    if (push) schedule(0);
    return changed;
  },

  /** ดึงครั้งเดียวต่อบัญชีต่อการเปิดเกม (หน้าแรกเรียกซ้ำได้) */
  pullOnce(): Promise<boolean> {
    const acc = getAccounts().current();
    if (!apiEnabled() || !acc) return Promise.resolve(false);
    if (pulled?.acc !== acc.id) pulled = { acc: acc.id, p: this.pull() };
    return pulled.p;
  },

  /** หลังเข้าระบบใหม่ — บังคับดึงใหม่ */
  afterLogin(): Promise<boolean> {
    pulled = null;
    return this.pullOnce();
  },

  /** ส่งของที่ค้างขึ้นเซิร์ฟเวอร์เดี๋ยวนี้ */
  async flush(): Promise<void> {
    const acc = accId();
    if (!acc) return;
    if (pushing) {
      again = true;
      return pushing;
    }
    pushing = (async () => {
      const st = readState(acc);
      if (st.save.dirty) {
        const at = st.save.at;
        const raw = getRaw(RUN, acc);
        const r = raw ? await api('save.put', { save: raw, updatedAt: at, version: 3 }, { retries: 1 }) : await api('save.clear', { updatedAt: at }, { retries: 1 });
        // stale = เครื่องอื่นเซฟใหม่กว่า → ไม่ทับ (ดึงใหม่ตอนเข้าหน้าแรกครั้งหน้า)
        if (r.ok || r.code === 'stale') {
          const now = readState(acc);
          if (now.save.at === at) now.save.dirty = false;
          writeState(acc, now);
        }
      }
      const s2 = readState(acc);
      if (s2.meta.dirty && accId() === acc) {
        const at = s2.meta.at;
        const raw = getRaw(META, acc);
        if (raw) {
          const r = await api('meta.put', { meta: raw, updatedAt: at }, { retries: 1 });
          if (r.ok || r.code === 'stale') {
            const now = readState(acc);
            if (now.meta.at === at) now.meta.dirty = false;
            writeState(acc, now);
            submitScore(raw);
          }
        }
      }
    })().finally(() => {
      pushing = null;
      if (again) {
        again = false;
        schedule(0);
      }
    });
    return pushing;
  },

  /** หน้ากำลังถูกซ่อน/ปิด → ส่งแบบ beacon (ไม่รอผล — รอบหน้าเทียบ updatedAt แล้วส่งซ้ำถ้าจำเป็น) */
  beacon() {
    const acc = accId();
    if (!acc) return;
    const st = readState(acc);
    if (st.save.dirty) {
      const raw = getRaw(RUN, acc);
      apiBeacon(raw ? 'save.put' : 'save.clear', raw ? { save: raw, updatedAt: st.save.at, version: 3 } : { updatedAt: st.save.at });
    }
    if (st.meta.dirty) {
      const raw = getRaw(META, acc);
      if (raw) apiBeacon('meta.put', { meta: raw, updatedAt: st.meta.at });
    }
  },
};

/** ส่งสถิติขึ้นตารางอันดับ (พลังสูงสุด / รอดนานสุด / ฆ่ารวม) */
function submitScore(rawMeta: string) {
  try {
    const m = JSON.parse(rawMeta) as { bestPower?: number; bestDays?: number; totalKills?: number; playerName?: string };
    void api('leaderboard.submit', { bestPower: m.bestPower ?? 0, bestDays: m.bestDays ?? 0, kills: m.totalKills ?? 0, playerName: m.playerName ?? '' });
  } catch {
    /* ignore */
  }
}

export interface LeaderRow {
  accountId: string;
  playerName: string;
  bestPower: number;
  bestDays: number;
  kills: number;
}

export async function fetchLeaderboard(): Promise<LeaderRow[] | { error: string }> {
  const r = await api<{ top: LeaderRow[] }>('leaderboard.get');
  return r.ok ? r.top : { error: r.error };
}

/** ติดตั้งตัวฟังการซ่อน/ปิดหน้า + ตรวจการเชื่อมต่อ (ครั้งเดียวทั้งเกม) */
export function startSync() {
  if (started || !apiEnabled() || typeof window === 'undefined') return;
  started = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Sync.beacon();
  });
  window.addEventListener('pagehide', () => Sync.beacon());
  void ping();
  void Sync.pullOnce();
}
