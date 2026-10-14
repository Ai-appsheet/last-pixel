/**
 * ระบบอุปกรณ์สวมใส่
 * ความเก่ง = อุปกรณ์ที่สวม (×เลเวลอัพเกรด) + บัฟจากสิ่งก่อสร้างในฐาน
 *
 * ช่องสวมใส่ 12 ช่อง:
 *   อาวุธหลัก · มือรอง (โล่/ตะเกียง) · หมวก · เสื้อเกราะ · สนับขา · รองเท้า
 *   ถุงมือ · ผ้าคลุม · สร้อยคอ · แหวน ×2 · กระเป๋าเป้
 */
import { MAX_LEVEL, itemLevelMult } from './upgrade';
export type EquipSlot = 'weapon' | 'offhand' | 'head' | 'body' | 'legs' | 'feet' | 'hands' | 'back' | 'neck' | 'ring1' | 'ring2' | 'bag';
/** ชนิดของที่ใส่ได้ (แหวนใส่ได้ทั้ง ring1/ring2) */
export type GearKind = Exclude<EquipSlot, 'ring1' | 'ring2' | 'weapon'> | 'ring';

export const EQUIP_SLOTS: { id: EquipSlot; name: string; hint: string }[] = [
  { id: 'weapon', name: 'อาวุธหลัก', hint: 'ดาบ/หอก/ธนู/ไม้เท้า — ใช้โจมตีเมื่อมือถือของที่ไม่ใช่อาวุธ' },
  { id: 'offhand', name: 'มือรอง', hint: 'โล่ (ป้องกัน) หรือ ตะเกียง (แสง+ความอบอุ่น)' },
  { id: 'head', name: 'หมวก', hint: 'ป้องกัน + โบนัสพิเศษตามชนิด' },
  { id: 'body', name: 'เสื้อเกราะ', hint: 'ป้องกันหลัก + กันหนาว' },
  { id: 'legs', name: 'สนับขา', hint: 'ป้องกัน + HP' },
  { id: 'feet', name: 'รองเท้า', hint: 'ความเร็วเดิน' },
  { id: 'hands', name: 'ถุงมือ', hint: 'พลังโจมตี / ความเร็วเก็บของ' },
  { id: 'back', name: 'ผ้าคลุม', hint: 'กันหนาว ความเร็ว คริติคอล' },
  { id: 'neck', name: 'สร้อยคอ', hint: 'HP ฟื้นฟู ดูดเลือด' },
  { id: 'ring1', name: 'แหวน 1', hint: 'โจมตี คริติคอล โชค' },
  { id: 'ring2', name: 'แหวน 2', hint: 'โจมตี คริติคอล โชค' },
  { id: 'bag', name: 'กระเป๋าเป้', hint: 'เพิ่มช่องเก็บของ' },
];

export const SLOT_NAME = Object.fromEntries(EQUIP_SLOTS.map((s) => [s.id, s.name])) as Record<EquipSlot, string>;

export interface Stats {
  /** โจมตี +% */
  atk: number;
  /** ป้องกัน (แต้ม) */
  def: number;
  hp: number;
  stamina: number;
  /** ความเร็วเดิน +% */
  speed: number;
  /** โอกาสคริติคอล +% */
  crit: number;
  /** ดูดเลือด % ของดาเมจ */
  lifesteal: number;
  /** ตัดไม้/ขุดแร่แรงขึ้น +% */
  gather: number;
  /** กันหนาว 0..1 */
  cold: number;
  /** รัศมีแสง +px */
  light: number;
  /** โชค +% (โอกาสดรอปกล่อง) */
  luck: number;
  /** ฟื้น HP ต่อวินาที */
  regen: number;
  /** ช่องกระเป๋าเพิ่ม */
  bag: number;
}

export const STAT_INFO: Record<keyof Stats, { name: string; fmt: (v: number) => string }> = {
  atk: { name: 'โจมตี', fmt: (v) => `+${Math.round(v)}%` },
  def: { name: 'ป้องกัน', fmt: (v) => `${+v.toFixed(1)}` },
  hp: { name: 'HP สูงสุด', fmt: (v) => `+${Math.round(v)}` },
  stamina: { name: 'สแตมินา', fmt: (v) => `+${Math.round(v)}` },
  speed: { name: 'ความเร็ว', fmt: (v) => `${v >= 0 ? '+' : ''}${Math.round(v)}%` },
  crit: { name: 'คริติคอล', fmt: (v) => `+${+v.toFixed(1)}%` },
  lifesteal: { name: 'ดูดเลือด', fmt: (v) => `${+v.toFixed(1)}%` },
  gather: { name: 'เก็บของ', fmt: (v) => `+${Math.round(v)}%` },
  cold: { name: 'กันหนาว', fmt: (v) => `${Math.round(Math.min(v, 0.95) * 100)}%` },
  light: { name: 'แสง', fmt: (v) => `+${Math.round(v)}` },
  luck: { name: 'โชค', fmt: (v) => `+${Math.round(v)}%` },
  regen: { name: 'ฟื้น HP', fmt: (v) => `${+v.toFixed(1)}/วิ` },
  bag: { name: 'ช่องกระเป๋า', fmt: (v) => `+${Math.round(v)}` },
};

export const STAT_KEYS = Object.keys(STAT_INFO) as (keyof Stats)[];

export const emptyStats = (): Stats => ({ atk: 0, def: 0, hp: 0, stamina: 0, speed: 0, crit: 0, lifesteal: 0, gather: 0, cold: 0, light: 0, luck: 0, regen: 0, bag: 0 });

export function addStats(into: Stats, s: Partial<Stats>, mult = 1) {
  for (const k of STAT_KEYS) if (s[k]) into[k] += s[k]! * (k === 'bag' ? 1 : mult);
  return into;
}

/** เลเวลอุปกรณ์ (plus = เลเวล − 1) เพิ่มค่าสถานะ +15% ต่อเลเวล (ช่องกระเป๋าไม่เพิ่ม) */
export const gearMult = (plus = 0) => itemLevelMult(1 + Math.max(0, Math.min(MAX_LEVEL - 1, plus)));

/** สรุปค่าสถานะเป็นข้อความสั้น */
export function statLine(s: Partial<Stats>, mult = 1): string {
  return STAT_KEYS.filter((k) => s[k]).map((k) => `${STAT_INFO[k].name} ${STAT_INFO[k].fmt(s[k]! * (k === 'bag' ? 1 : mult))}`).join(' · ');
}

/** ค่าพลังรวม */
export function powerScore(weaponDamage: number, s: Stats): number {
  return Math.round(
    weaponDamage * 6 + s.atk * 5 + s.def * 14 + s.hp * 1.2 + s.stamina * 0.6 + s.speed * 4 + s.crit * 6 + s.lifesteal * 10 +
      s.gather * 1.5 + s.cold * 60 + s.light * 0.4 + s.luck * 3 + s.regen * 40 + s.bag * 4,
  );
}

/** เพดานค่าที่อัปได้จากผลึกพลัง (กันโกงเกินอุปกรณ์) */
export const TRAIN_CAP: Partial<Stats> = { hp: 150, stamina: 60, atk: 30, def: 15, speed: 15, crit: 10, luck: 20, regen: 1 };
