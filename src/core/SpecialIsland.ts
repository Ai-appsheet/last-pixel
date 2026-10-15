/**
 * เกาะที่มี "เวลาเปิด" ตามนาฬิกาจริง (เวลาไทย) — เกาะมหาสมบัติ + เกาะกลาง
 * เปิดวันละ 2 รอบ รอบละ 60 นาที เวลาสุ่มใหม่ทุกวัน (ตารางจาก data/worldEvents.ts · ทุกคนเห็นเหมือนกัน)
 * ทดสอบ: ?specialopen = บังคับเปิดเกาะมหาสมบัติ · ?centeropen = บังคับเปิดเกาะกลาง
 */
import { GRID } from '../data/islands';
import { OPEN_ALL } from '../config/openWorld';
import { daySchedule, type GateKind, type TimeWindow } from '../data/worldEvents';
import { MINUTE, WorldClock, bkkClock, bkkDayKey, dayStartOf, fmtLeft as fmt, msToMidnight, shiftDayKey } from './WorldClock';

/** ช่องเกาะพิเศษ: ขอบล่างกลางของตาราง (ช่องนี้ไม่แจกให้ผู้เล่น) */
export const SPECIAL_SLOT = (GRID - 1) * GRID + Math.floor(GRID / 2);
export const SPECIAL_NAME = 'เกาะมหาสมบัติ';

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const FORCED: Record<GateKind, boolean> = { special: !!params?.has('specialopen'), center: !!params?.has('centeropen') };

export interface SpecialState {
  open: boolean;
  /** เปิดอยู่ = เหลือเวลาก่อนปิด, ปิดอยู่ = เหลือเวลาก่อนเปิด (ms) */
  msLeft: number;
  /** รอบที่เปิด (ใช้รีเซ็ตทรัพยากรเมื่อเปิดรอบใหม่) — `<วัน>#<0|1>` แปลงเป็นเลข */
  round: number;
  /** เวลาเปิดรอบถัดไป (epoch ms) */
  nextOpen: number;
  /** เปิดตลอด (config/openWorld.ts OPEN_ALL) — ไม่มีเวลาปิด */
  always?: boolean;
}

/** รอบเปิดทั้งหมด (epoch ms) ของเมื่อวาน วันนี้ พรุ่งนี้ */
function windowsAround(kind: GateKind, now: number): { start: number; end: number; round: number }[] {
  const today = bkkDayKey(now);
  const out: { start: number; end: number; round: number }[] = [];
  for (const d of [-1, 0, 1, 2]) {
    const day = shiftDayKey(today, d);
    const base = dayStartOf(day);
    const list: TimeWindow[] = daySchedule(day)[kind];
    list.forEach((w, i) => out.push({ start: base + w.start * MINUTE, end: base + w.end * MINUTE, round: Math.floor(base / 86_400_000) * 2 + i }));
  }
  return out;
}

export function gateState(kind: GateKind, now = WorldClock.now()): SpecialState {
  // เปิดตลอด: รอบ = วัน (เกาะมหาสมบัติยังรีเซ็ตทรัพยากรทุกเที่ยงคืน)
  if (OPEN_ALL) return { open: true, msLeft: msToMidnight(now), round: Math.floor((now + 7 * 3_600_000) / 86_400_000), nextOpen: now, always: true };
  const ws = windowsAround(kind, now);
  const cur = ws.find((w) => now >= w.start && now < w.end);
  const next = ws.find((w) => w.start > now) ?? ws[ws.length - 1];
  if (cur) return { open: true, msLeft: cur.end - now, round: cur.round, nextOpen: next.start };
  if (FORCED[kind]) return { open: true, msLeft: 60 * MINUTE - (now % (60 * MINUTE)), round: next.round - 1, nextOpen: next.start };
  return { open: false, msLeft: next.start - now, round: next.round, nextOpen: next.start };
}

export function specialState(now = WorldClock.now()): SpecialState {
  return gateState('special', now);
}

export function centerState(now = WorldClock.now()): SpecialState {
  return gateState('center', now);
}

/** 1:05:09 / 42:10 */
export const fmtLeft = fmt;

/** ข้อความเวลาของเกาะที่เปิดอยู่: 'เปิดตลอด' หรือเวลาที่เหลือ '42:10' */
export function openLeft(st: SpecialState): string {
  return st.always ? 'เปิดตลอด' : fmt(st.msLeft);
}

/** เวลาเปิดรอบถัดไป (ข้อความเวลาไทย เช่น '19:40 น.') */
export function nextOpenText(now = WorldClock.now(), kind: GateKind = 'special'): string {
  const st = gateState(kind, now);
  if (st.always) return 'เปิดตลอด';
  return `${bkkClock(st.nextOpen)} น.`;
}

/** ตารางวันนี้แบบข้อความ เช่น '10:25–11:25 · 18:40–19:40' */
export function todayWindowsText(kind: GateKind, now = WorldClock.now()): string {
  const day = bkkDayKey(now);
  const base = dayStartOf(day);
  return daySchedule(day)[kind].map((w) => `${bkkClock(base + w.start * MINUTE)}–${bkkClock(base + w.end * MINUTE)}`).join(' · ');
}
