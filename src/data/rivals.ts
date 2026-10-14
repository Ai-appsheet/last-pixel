import type { HeroLook } from '../gfx/art/heroes';
import type { BoxTier } from './loot';

/**
 * ผู้รอดชีวิตคู่แข่ง (PvP บนเกาะผจญภัย) — ตอนนี้เป็นบอทจำลอง เพราะยังไม่มีเซิร์ฟเวอร์จริง
 * ข้อมูลล้วน (ไม่ผูก Phaser) ใช้ร่วมกับ systems/RivalSystem.ts และคลังข้อมูล
 */

/** ข้อมูลผู้เล่นคู่แข่ง 1 คน — ถ้ามีเซิร์ฟเวอร์ ข้อมูลชุดนี้จะมาจากผู้เล่นจริง (ชื่อ เลเวล อาวุธ หน้าตา) */
export interface RivalInfo {
  id: string;
  name: string;
  level: number;
  /** ขั้นอาวุธ 0..3 (ไม้/เหล็ก/ทอง/คริสตัล) */
  tier: number;
  weapon: string;
  ranged: boolean;
  /** ช่องเกาะที่อยู่ (ไม่ออกนอกเกาะนี้) */
  slot: number;
  /** HP ต่ำแล้วหนี */
  coward: boolean;
  look: HeroLook;
}

export const RIVAL = {
  /** เกาะอันตราย ×1.4 ขึ้นไป = 3 คน · อื่นๆ 2 คน */
  maxPerIsland: (danger: number) => (danger >= 1.4 ? 3 : 2),
  /** ขึ้นเกาะแล้วตัวแรกโผล่ภายใน (วิ) */
  firstDelay: [8, 20] as [number, number],
  /** ระยะห่างระหว่างการเกิดแต่ละตัว (วิ) */
  stagger: [10, 25] as [number, number],
  /** ล้มแล้วเกิดตัวใหม่บนเกาะนั้นหลัง (วิ) */
  respawn: [90, 150] as [number, number],
  /** ระยะเห็นผู้เล่น (px · กลางคืน ×1.5) */
  aggro: 130,
  /** ความเร็ว (ผู้เล่น 62 — วิ่งหนีทันได้) */
  speed: 58,
  /** โอกาสหลบ (ไม่โดนเลย) / ป้องกัน (ดาเมจ ×0.35) ต่อการโดนตี 1 ครั้ง */
  dodge: 0.12,
  block: 0.15,
  blockMult: 0.35,
  /** คนขี้กลัว (50%): HP < 30% หนี · ฟื้น 3%/วิ ระหว่างหนี (ห่างผู้เล่น > 110 px) · HP > 55% กลับมาสู้ */
  cowardChance: 0.5,
  fleeAt: 0.3,
  fleeUntil: 0.55,
  fleeRegen: 0.03,
  /** สัดส่วนนักธนู */
  rangedChance: 0.35,
  /** โดนตีแล้วโกรธ (สู้กลับแม้ผู้เล่นยิงจากเรือ) วินาที */
  provoke: 8,
};

/** อาวุธตามขั้น 0..3 */
export const RIVAL_WEAPONS = {
  melee: ['wood_sword', 'iron_sword', 'gold_sword', 'crystal_sword'],
  ranged: ['bow', 'crossbow', 'crossbow', 'crystal_staff'],
};
export const RIVAL_WEAPON_MULT = [1, 1.25, 1.5, 1.8];

/** เลเวล = 1 + วัน × 0.7 × อันตรายเกาะ + สุ่ม 0..3 (สูงสุด 50) */
export const rivalLevel = (day: number, danger: number, r: number) => Math.max(1, Math.min(50, Math.round(1 + day * 0.7 * danger + r * 3)));
/** ขั้นอาวุธจาก วัน × อันตราย: < 4 ไม้ · < 9 เหล็ก · < 16 ทอง · ที่เหลือคริสตัล */
export const rivalTier = (day: number, danger: number) => {
  const k = day * danger;
  return k < 4 ? 0 : k < 9 ? 1 : k < 16 ? 2 : 3;
};

/**
 * ค่าพลัง (เทียบผู้เล่น HP 180 +10/เลเวล · ป้องกันติดตัว ≈ −15%)
 * HP 100 + 12×Lv · ประชิด (6 + 0.5×Lv) × ตัวคูณอาวุธ ต่อ 1 วิ · ธนูยิง (5 + 0.45×Lv) × ตัวคูณ ทุก 1.7 วิ (ประชิดเหลือ 60%)
 * (ผู้เล่นอมตะ 0.8 วิหลังโดนตี → รุมกี่คนก็โดนได้ไม่เกิน ~1.25 ครั้ง/วิ)
 * เกราะ 10% + 5%/ขั้นอาวุธ · XP 15 + 3×Lv
 */
export function rivalStats(level: number, tier: number, ranged: boolean) {
  const m = RIVAL_WEAPON_MULT[tier] ?? 1;
  return {
    hp: 100 + 12 * level,
    attack: Math.round((6 + 0.5 * level) * m * (ranged ? 0.6 : 1)),
    shot: Math.round((5 + 0.45 * level) * m),
    armor: 0.1 + 0.05 * tier,
    xp: 15 + 3 * level,
  };
}

/** วัตถุดิบในถุงของ (ดรอปผ่าน MobDef.drops ตามปกติ) */
export const RIVAL_DROPS: { item: string; qty: [number, number]; chance: number }[] = [
  { item: 'iron_ingot', qty: [1, 3], chance: 0.5 },
  { item: 'gear', qty: [1, 3], chance: 0.35 },
  { item: 'gold_ingot', qty: [1, 2], chance: 0.25 },
  { item: 'crystal', qty: [1, 1], chance: 0.15 },
  { item: 'bandage', qty: [1, 2], chance: 0.3 },
];

/** ถุงของเมื่อล้มคู่แข่ง: เหรียญ (20 + 4×Lv)–(50 + 4×Lv) · กล่อง 45% (เพชร 10 / ทอง 50 / เหล็ก 30 / ไม้ 10) · อาวุธที่ถือ 8% */
export const RIVAL_LOOT = {
  coins: (lv: number): [number, number] => [20 + 4 * lv, 50 + 4 * lv],
  boxChance: 0.45,
  box: { box_legend: 0.1, box_gold: 0.5, box_iron: 0.3, box_wood: 0.1 } as Record<BoxTier, number>,
  weaponChance: 0.08,
};

/** ชื่อสำรอง (ถ้าห้องมีผู้เล่นไม่พอ) */
export const RIVAL_NAMES_TH = ['สมชาย', 'น้องฟ้า', 'กวิน', 'มะลิ', 'พลอย', 'อาทิตย์', 'ต้นกล้า', 'แก้ว', 'เล็ก', 'ฝน', 'ภูผา', 'ดาว', 'เพชร', 'ขุนทอง', 'นักล่าเงา', 'จอมโจรสลัด'];
