/**
 * นาฬิกาโลกจริง (เวลาไทย UTC+7) — ใช้กับ "กิจกรรมตามเวลาจริง" ทั้งหมด (เกาะกลาง/เกาะมหาสมบัติเปิด-ปิด · เกาะกิจกรรม · กล่องฟรีรายวัน)
 *  - วันเกม (กลางวัน/กลางคืน) ยังเร็วเหมือนเดิม (BALANCE.dayLength) — นาฬิกานี้แยกกัน
 *  - now() = เวลาเครื่อง + ส่วนต่างกับเซิร์ฟเวอร์ (เรียนจาก ping ครั้งแรก · ออฟไลน์ = นาฬิกาเครื่อง)
 *  - seededRandom(key) ทำให้ทุกคนคำนวณตารางเดียวกันได้เองโดยไม่ต้องถามเซิร์ฟเวอร์
 */
import { api, apiEnabled } from './backend/Api';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** เวลาไทย = UTC+7 */
export const BKK = 7 * HOUR;

let offset = 0;
let synced = false;

export const WorldClock = {
  /** เวลาปัจจุบัน (ms, epoch) หลังปรับตามเซิร์ฟเวอร์ */
  now(): number {
    return Date.now() + offset;
  },

  get offset() {
    return offset;
  },

  /** รับเวลาเซิร์ฟเวอร์จากคำตอบใดก็ได้ (rtt = เวลาไป-กลับ ใช้ชดเชยครึ่งหนึ่ง) */
  learn(serverTime: number, rtt = 0) {
    if (!Number.isFinite(serverTime) || serverTime <= 0) return;
    offset = Math.round(serverTime + rtt / 2 - Date.now());
    synced = true;
  },

  /** ping เซิร์ฟเวอร์ครั้งเดียวตอนเริ่ม (ออฟไลน์/ล้มเหลว = ใช้นาฬิกาเครื่อง) */
  async sync(): Promise<boolean> {
    if (synced || !apiEnabled()) return synced;
    const t0 = Date.now();
    const r = await api<{ time: number }>('ping', {}, { timeout: 8000, retries: 0 });
    if (r.ok && typeof r.time === 'number') this.learn(r.time, Date.now() - t0);
    return synced;
  },
};

/** คีย์วันจริงตามเวลาไทย เช่น '2026-10-14' */
export function bkkDayKey(t = WorldClock.now()): string {
  const d = new Date(t + BKK);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** เวลาเที่ยงคืน (ไทย) ของวันนั้น เป็น epoch ms */
export function bkkMidnight(t = WorldClock.now()): number {
  return Math.floor((t + BKK) / DAY) * DAY - BKK;
}

/** epoch ms ของ 00:00 น. ไทย ของคีย์วัน */
export function dayStartOf(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - BKK;
}

/** คีย์วันก่อนหน้า/ถัดไป */
export function shiftDayKey(dayKey: string, days: number): string {
  return bkkDayKey(dayStartOf(dayKey) + days * DAY + HOUR);
}

/** เหลือกี่ ms ถึงเที่ยงคืนไทย (รีเซ็ตกิจกรรมรายวัน) */
export function msToMidnight(t = WorldClock.now()): number {
  return bkkMidnight(t) + DAY - t;
}

/** 'HH:MM' เวลาไทย */
export function bkkClock(t: number): string {
  const d = new Date(t + BKK);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** hash สตริง → 32 บิต (xmur3) */
function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** สุ่มแบบมี seed จากข้อความ (mulberry32) — key เดียวกันได้ลำดับเดียวกันทุกเครื่อง */
export function seededRandom(key: string): () => number {
  let a = hashString(key);
  return () => {
    let t = (a = (a + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1:05:09 / 42:10 */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
