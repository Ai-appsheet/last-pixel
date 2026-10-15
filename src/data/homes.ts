import type { BuildDef } from './buildables';
import { IMPACT_MULT, materialOf } from './shelter';

/**
 * 🏠 เข้าไปอยู่ในบ้าน (ระบบในเกม: systems/HomeSystem.ts) — ตัวเลขทั้งหมดอยู่ที่นี่ที่เดียว
 * - อาคารที่นอนได้ (ไม่รวมเตียงเดี่ยว) บนเกาะเรา = มีประตู เดินเข้า/กด E แล้วเข้าห้องข้างใน
 * - ในบ้าน: มอนเข้าไม่ได้/ไม่เกิด · ผู้เล่นอื่นตีไม่ได้ · ภัย/อากาศไม่โดนตัว · หิว/กระหายช้าลงครึ่ง · ฟื้นพลังไวขึ้น
 * - แต่ภัยพิบัติยังซัดตัวบ้าน: ความแรงภัย (1–10) เทียบเลเวลบ้าน (Lv.1–10) — เลเวลถึง = แค่รอยขีดข่วน · ไม่ถึง = เสียหายหนัก อาจพัง
 */
export const HOME = {
  /** ตัวคูณหิว/กระหายในบ้าน */
  drain: 0.5,
  /** ฟื้นต่อวินาทีในบ้าน (บวกเพิ่มจากปกติ) */
  hpRegen: 1.5,
  staminaRegen: 8,
  sanityRegen: 1,
  /** ภัยซัดบ้านทุกกี่วินาที */
  tick: 2,
  /** เลเวลบ้านถึง: เสียหาย % HP ต่อครั้ง */
  minorFrac: 0.004,
  /** เลเวลบ้านไม่ถึง: % HP ต่อครั้ง ต่อเลเวลที่ขาด (เพดาน maxFrac) × วัสดุ ไม้ 1 / หิน 0.6 / เหล็ก 0.4 */
  perGap: 0.03,
  maxFrac: 0.1,
  /** บ้านพังตอนอยู่ข้างใน: เสีย % HP สูงสุด (ไม่ถึงตาย — เหลืออย่างน้อย 1) */
  collapseHurt: 0.15,
};

/** ความแรงพื้นฐานของภัยต่อตัวบ้าน (ไม่อยู่ในตาราง = ไม่ทำบ้านเสียหาย เช่น คลื่นความร้อน ฝูงสัตว์) · ความแรงจริง = ฐาน + ระดับภัย − 1 (สูงสุด 10) */
export const HOUSE_POWER: Record<string, number> = {
  quake: 2, lightning: 1, meteor: 2, wildfire: 2, tsunami: 2, flood: 1, eruption: 3, tornado: 3,
  sandstorm: 1, blizzard: 1, acid_rain: 1,
};

/** ภัยประจำคืนที่ซัดบ้านด้วย (special → ภัยกลางวันที่เทียบเท่า) */
export const NIGHT_HOUSE_THREAT: Record<string, string> = { meteor: 'meteor', storm: 'lightning' };

/** อาคารที่เข้าไปอยู่ข้างในได้ */
export const isDwelling = (def: BuildDef) => !!def.sleep && def.category === 'building';

/** ขนาดห้อง (tile รวมผนัง) ตามขนาดฐาน + ขั้นอาคาร: เพิง/เต็นท์ 9×7 · บ้าน 3×2 11×8–13×10 · คฤหาสน์/ป้อม 14×10 */
export function roomSize(def: BuildDef): { w: number; h: number } {
  const t = Math.min(2, Math.max(0, (def.tier ?? 1) - 1));
  return { w: Math.min(14, 5 + def.w * 2 + t), h: Math.min(10, 6 + def.h + t) };
}

export type RoomStyle = 'wood' | 'brick' | 'stone';

/** ผนังห้อง: ไม้ (เพิง/กระท่อม) · อิฐ (บ้านอิฐ/กระเบื้อง/คฤหาสน์) · หิน (บ้านหิน/ป้อม/หอ) */
export function roomStyle(def: BuildDef): RoomStyle {
  if (/brick|cottage|manor|thatch/.test(def.id)) return 'brick';
  const m = materialOf(def);
  return m === 'wood' ? 'wood' : 'stone';
}

/** ความแรงของภัยต่อบ้าน (0 = ไม่ทำบ้านเสียหาย) = เลเวลบ้านที่แนะนำ */
export function hazardPower(id: string, level: number): number {
  const b = HOUSE_POWER[id] ?? 0;
  return b ? Math.min(10, b + Math.max(1, level) - 1) : 0;
}

/** ดาเมจต่อบ้านหนึ่งครั้ง (ทุก HOME.tick วิ) */
export function houseDamage(def: BuildDef, lv: number, maxHp: number, id: string, level: number): number {
  const power = hazardPower(id, level);
  if (!power) return 0;
  if (id === 'wildfire' && materialOf(def) !== 'wood') return 0; // ไฟไหม้เฉพาะบ้านไม้
  if (id === 'flood' && def.id === 'stilt_house') return 0; // บ้านบนเสาน้ำไม่ถึง
  const gap = power - lv;
  const frac = gap <= 0 ? HOME.minorFrac : Math.min(HOME.maxFrac, HOME.perGap * gap) * IMPACT_MULT[materialOf(def)];
  return maxHp * frac;
}

/** ภัยที่หนักที่สุดที่เกิดได้ตอนนี้ (ใช้บอก "แนะนำบ้าน Lv.X+") */
export function worstHazard(list: { id: string; name: string; fromDay: number }[], day: number, level: number): { name: string; power: number } | null {
  let best: { name: string; power: number } | null = null;
  for (const h of list) {
    const p = h.fromDay <= day ? hazardPower(h.id, level) : 0;
    if (p && (!best || p > best.power)) best = { name: h.name, power: p };
  }
  return best;
}
