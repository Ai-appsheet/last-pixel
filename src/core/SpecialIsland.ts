/**
 * เกาะพิเศษ "เกาะมหาสมบัติ" — เปิดทุก 4 ชั่วโมง ครั้งละ 1 ชั่วโมง (เวลาไทย 00/04/08/12/16/20 น.)
 * ทุกคนในห้องใช้ตารางเวลาเดียวกัน (อิงนาฬิกาจริง UTC+7) — ต้องนั่งเรือไปเอง
 * ทดสอบ: เพิ่ม ?specialopen ใน URL เพื่อบังคับให้เปิด
 */
import { GRID } from '../data/islands';

/** ช่องเกาะพิเศษ: ขอบล่างกลางของตาราง (ช่องนี้ไม่แจกให้ผู้เล่น) */
export const SPECIAL_SLOT = (GRID - 1) * GRID + Math.floor(GRID / 2);
export const SPECIAL_NAME = 'เกาะมหาสมบัติ';

const HOUR = 3600_000;
const PERIOD = 4 * HOUR;
const OPEN_FOR = 1 * HOUR;
const TZ = 7 * HOUR;

const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('specialopen');

export interface SpecialState {
  open: boolean;
  /** เปิดอยู่ = เหลือเวลาก่อนปิด, ปิดอยู่ = เหลือเวลาก่อนเปิด (ms) */
  msLeft: number;
  /** รอบที่เปิด (ใช้รีเซ็ตทรัพยากรเมื่อเปิดรอบใหม่) */
  round: number;
}

export function specialState(now = Date.now()): SpecialState {
  const t = now + TZ;
  const round = Math.floor(t / PERIOD);
  const phase = t - round * PERIOD;
  if (forced) return { open: true, msLeft: OPEN_FOR - (phase % OPEN_FOR), round };
  const open = phase < OPEN_FOR;
  return { open, msLeft: open ? OPEN_FOR - phase : PERIOD - phase, round };
}

/** 1:05:09 / 42:10 */
export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** เวลาเปิดรอบถัดไป (ข้อความเวลาไทย) */
export function nextOpenText(now = Date.now()): string {
  const st = specialState(now);
  const at = new Date(now + (st.open ? st.msLeft + 3 * HOUR : st.msLeft) + TZ);
  return `${String(at.getUTCHours()).padStart(2, '0')}:00 น.`;
}
