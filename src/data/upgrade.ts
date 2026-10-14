import type { BuildDef } from './buildables';
import type { ItemDef } from './items';

/**
 * ระบบอัพเกรด 10 ระดับ — ใช้กับทุกอย่างที่ "เป็นชิ้น": อาวุธ เครื่องมือ อุปกรณ์สวมใส่ 12 ช่อง สิ่งก่อสร้าง ยานพาหนะ
 * - ไอเทม: เก็บใน Slot.plus = เลเวล − 1 (0..9) → ใช้ levelOfSlot()  (เซฟเก่าที่ plus = 10 ให้ปัดเหลือ 9)
 * - สิ่งก่อสร้าง/ยาน: เก็บ field lv (1..10)
 * - อัพสำเร็จ 100% (แทนระบบตีบวกเดิม) จ่ายวัตถุดิบ + เหรียญ + แร่ตามช่วงเลเวล
 * - Lv 2–3 อัพได้เลย · Lv 4–6 / 7–9 / 10 ต้องรู้ "แปลนอัพเกรด" ของหมวดนั้นก่อน (upKey) — ได้จากกล่องทอง/เพชรเท่านั้น
 * - หน้าตาเปลี่ยนตามช่วง (band): ปกติ → เสริมเหล็ก → ทองคำ → ตำนาน
 */
export const MAX_LEVEL = 10;

export type UpBand = 'iron' | 'gold' | 'legend';
export const UP_BANDS: UpBand[] = ['iron', 'gold', 'legend'];
/** ช่วงเลเวลของแต่ละ band: iron = Lv4–6, gold = Lv7–9, legend = Lv10 */
export const bandOf = (lv: number): UpBand | null => (lv >= 10 ? 'legend' : lv >= 7 ? 'gold' : lv >= 4 ? 'iron' : null);
export const BAND_INFO: Record<UpBand, { name: string; range: string; color: number; css: string; rarity: 'rare' | 'epic' | 'legendary' }> = {
  iron: { name: 'เสริมเหล็ก', range: 'Lv.4–6', color: 0x94b0c2, css: '#94b0c2', rarity: 'rare' },
  gold: { name: 'ทองคำ', range: 'Lv.7–9', color: 0xffcd75, css: '#ffcd75', rarity: 'epic' },
  legend: { name: 'ตำนาน', range: 'Lv.10', color: 0xc77dff, css: '#c77dff', rarity: 'legendary' },
};

export type UpCategory =
  | 'melee' | 'ranged' | 'tool' | 'armor' | 'accessory'
  | 'house' | 'wall' | 'furniture' | 'machine' | 'defense' | 'farm'
  | 'water' | 'land' | 'air';
export const UP_CATEGORIES: UpCategory[] = ['melee', 'ranged', 'tool', 'armor', 'accessory', 'house', 'wall', 'furniture', 'machine', 'defense', 'farm', 'water', 'land', 'air'];
export const UP_CATEGORY_NAMES: Record<UpCategory, string> = {
  melee: 'อาวุธประชิด', ranged: 'อาวุธระยะไกล', tool: 'เครื่องมือ', armor: 'ชุดเกราะ', accessory: 'เครื่องประดับ',
  house: 'บ้าน & อาคาร', wall: 'กำแพง & พื้น', furniture: 'เฟอร์นิเจอร์', machine: 'เครื่องจักร & การผลิต', defense: 'ป้อม & กับดัก', farm: 'ฟาร์ม',
  water: 'ยานทางน้ำ', land: 'ยานทางบก', air: 'ยานทางอากาศ',
};

const ACCESSORY_SLOTS = new Set(['neck', 'ring', 'back', 'bag']);

/** หมวดอัพเกรดของไอเทม (null = อัพไม่ได้ เช่น ของกิน กระสุน วัตถุดิบ) */
export function upCategoryOfItem(def: ItemDef | undefined): UpCategory | null {
  if (!def) return null;
  if (def.type === 'weapon') return 'melee';
  if (def.type === 'ranged') return 'ranged';
  if (def.type === 'tool' || def.type === 'rod') return 'tool';
  if (def.type === 'armor' && def.equip) return ACCESSORY_SLOTS.has(def.equip.slot) ? 'accessory' : 'armor';
  return null;
}

/** หมวดอัพเกรดของสิ่งก่อสร้าง/ยาน (ยานแยกตามชนิด water/land/air) */
export function upCategoryOfBuild(def: BuildDef | undefined): UpCategory | null {
  if (!def) return null;
  if (def.boat) return def.boat.kind ?? 'water';
  switch (def.category) {
    case 'building': return 'house';
    case 'structure': case 'terrain': return 'wall';
    case 'furniture': return 'furniture';
    case 'machine': return 'machine';
    case 'defense': return 'defense';
    case 'farm': return 'farm';
    case 'boat': return 'water'; // ท่าเรือ
    default: return null;
  }
}

/** คีย์แปลนอัพเกรดในชุด learned (คู่กับ b:<id> / i:<id> ของแปลนสร้าง) */
export const upKey = (cat: UpCategory, band: UpBand) => `u:${cat}:${band}`;
/** id ไอเทมแปลนอัพเกรด */
export const upBlueprintItem = (cat: UpCategory, band: UpBand) => `bp_u_${cat}_${band}`;
/** ต้องรู้แปลนอะไรก่อนอัพจาก lv → lv+1 (null = ไม่ต้อง) */
export const upKeyNeeded = (cat: UpCategory, toLv: number): string | null => {
  const b = bandOf(toLv);
  return b ? upKey(cat, b) : null;
};

/** เลเวลของไอเทมจากช่อง (plus = เลเวล − 1) */
export const levelOfSlot = (s: { plus?: number } | null | undefined) => 1 + Math.max(0, Math.min(MAX_LEVEL - 1, s?.plus ?? 0));

// ------------------------------------------------------------------ ตัวคูณค่าสถานะตามเลเวล (lv 1 = ×1)
/** อาวุธ/เครื่องมือ: ดาเมจ +15%/เลเวล (Lv10 = ×2.35) · อุปกรณ์สวมใส่: ค่าสถานะ +15%/เลเวล */
export const itemLevelMult = (lv: number) => 1 + (Math.max(1, lv) - 1) * 0.15;
/** ความทนทานของไอเทม +10%/เลเวล */
export const itemDurMult = (lv: number) => 1 + (Math.max(1, lv) - 1) * 0.1;

/** สิ่งก่อสร้าง */
export const BUILD_LEVEL = {
  hp: (lv: number) => 1 + (lv - 1) * 0.2, // Lv10 ×2.8
  damage: (lv: number) => 1 + (lv - 1) * 0.15, // ป้อม/กับดัก
  range: (lv: number) => 1 + (lv - 1) * 0.03,
  cooldown: (lv: number) => 1 - (lv - 1) * 0.03, // ยิงเร็วขึ้น
  storage: (lv: number) => 1 + (lv - 1) * 0.1, // ปัดขึ้น
  production: (lv: number) => 1 + (lv - 1) * 0.1, // ความเร็วผลิต (หารเวลา)
  buff: (lv: number) => 1 + (lv - 1) * 0.1,
  light: (lv: number) => 1 + (lv - 1) * 0.04,
};

/** ยานพาหนะ */
export const VEHICLE_LEVEL = {
  hp: (lv: number) => 1 + (lv - 1) * 0.2,
  speed: (lv: number) => 1 + (lv - 1) * 0.03, // Lv10 ×1.27
  fuelUse: (lv: number) => 1 - (lv - 1) * 0.03,
  cargo: (lv: number) => 1 + (lv - 1) * 0.1,
  armor: (base: number, lv: number) => Math.min(0.9, base + (lv - 1) * 0.02),
};

// ------------------------------------------------------------------ ค่าอัพเกรด
export interface UpgradeCost {
  /** วัตถุดิบดิบ [ไอเทม, จำนวน] */
  items: [string, number][];
  coins: number;
  /** แปลนอัพเกรดที่ต้องรู้ (key ใน learned) */
  needKey: string | null;
}

const RARITY_COIN: Record<string, number> = { common: 1, uncommon: 1.5, rare: 2.2, epic: 3.5, legendary: 5 };

/**
 * ค่าอัพจาก lv → lv+1
 * baseCost = วัตถุดิบดิบของแปลนสร้าง (หลังแตกชิ้นส่วนกลางแล้ว) · rarity = ความหายากของของนั้น
 * - วัตถุดิบ: baseCost × (0.4 + 0.25·lv) ปัดขึ้น
 * - เหรียญ: 20·lv² × ตัวคูณความหายาก
 * - แร่ตามช่วงปลายทาง: Lv4–6 แร่เหล็ก lv · Lv7–9 แร่ทอง (lv−3) + หินตีบวก (lv−6) · Lv10 คริสตัล 5 + หินตีบวก 6 + อุกกาบาต 3
 * - oreScale (0.25..1) = ของถูก (กำแพง/รั้ว/ธนูไม้ มูลค่าฐาน < 100) จ่ายแร่ช่วงและเหรียญน้อยลงตามสัดส่วน (ปัดขึ้น) — เดิมกำแพงหิน Lv10 แพงกว่าตัวมัน ~220 เท่า
 */
export function upgradeCost(cat: UpCategory, lv: number, baseCost: [string, number][], rarity = 'common', oreScale = 1): UpgradeCost {
  const to = lv + 1;
  const k = 0.4 + 0.25 * lv;
  const map = new Map<string, number>();
  const add = (id: string, n: number) => n > 0 && map.set(id, (map.get(id) ?? 0) + n);
  const ore = (id: string, n: number) => add(id, Math.ceil(n * oreScale));
  for (const [id, n] of baseCost) add(id, Math.ceil(n * k));
  if (to >= 4 && to <= 6) ore('iron_ore', to);
  if (to >= 7 && to <= 9) {
    ore('gold_ore', to - 3);
    ore('enhance_stone', to - 6);
  }
  if (to >= 10) {
    ore('crystal', 5);
    ore('enhance_stone', 6);
    ore('meteorite', 3);
  }
  return { items: [...map.entries()], coins: Math.round(20 * lv * lv * (RARITY_COIN[rarity] ?? 1) * oreScale), needKey: upKeyNeeded(cat, to) };
}
