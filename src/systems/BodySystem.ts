import { ITEMS, type ItemDef, type Nutri } from '../data/items';
import { emptyStats, type Stats } from '../data/equipment';

/**
 * สมดุลร่างกาย — ต่อยอดจากหลอดอิ่ม/น้ำ: 🥩 โปรตีน · 🍚 พลังงาน(แป้ง) · 🥬 วิตามิน (0–100 ลดช้าๆ) + อาการป่วย (ท้องเสีย)
 *  - ครบ 3 อย่าง ≥ 50 = "สมดุล": ฟื้น HP +0.4/วิ · ฟื้นสแตมินา ×1.25 · เดินเร็ว +5%
 *  - อย่างใดต่ำกว่า 20 = อ่อนแรงเฉพาะด้าน: โปรตีนต่ำ โจมตี −15% · พลังงานต่ำ สแตมินาสูงสุด −25 · วิตามินต่ำ ฟื้นตัวช้า ×0.5 "อ่อนเพลีย"
 *  - ป่วย (กินของดิบ/น้ำดิบ): 2 นาที · หิว/กระหายเร็ว ×1.4 · สแตมินาฟื้น ×0.6 · ไม่ฟื้น HP เอง — หายด้วยสมุนไพร/ยา/นอน
 *  - ใจดี: ไม่มีตายทันที · ช่วงตั้งหลักลดช้าลงครึ่งหนึ่งและไม่มีผลเสีย · หุ่นยนต์ใช้ของชาร์จแทน (ไม่ป่วย)
 */
export interface BodyState {
  p: number;
  e: number;
  v: number;
  /** วินาทีที่ยังป่วย (0 = ปกติ) */
  sick: number;
}

export const freshBody = (): BodyState => ({ p: 70, e: 70, v: 70, sick: 0 });

export const BODY = {
  /** ลดต่อวินาที (เต็ม 100 → 0 ราว 2–3 วันเกม) */
  decay: { p: 100 / 1300, e: 100 / 1000, v: 100 / 1500 },
  good: 50,
  low: 20,
  sickTime: 120,
  balancedRegen: 0.4,
  balancedStamina: 1.25,
  balancedSpeed: 5,
  lowProteinAtk: -15,
  lowEnergyStamina: -25,
  lowVitaminHeal: 0.5,
  sickDrain: 1.4,
  sickStamina: 0.6,
};

export type NutKey = 'p' | 'e' | 'v';
export const NUT_KEYS: NutKey[] = ['p', 'e', 'v'];
export const NUT_INFO: Record<NutKey, { icon: string; name: string; robotIcon: string; robotName: string; color: number; eat: string; robotEat: string; low: string }> = {
  p: { icon: '🥩', name: 'โปรตีน', robotIcon: '🔩', robotName: 'โครงสร้าง', color: 0xef7d57, eat: 'เนื้อย่าง ปลาย่าง ไข่เจียว หมูปิ้ง', robotEat: 'เหล็กแท่ง เฟือง เศษเหล็ก', low: 'โจมตี −15%' },
  e: { icon: '🍚', name: 'พลังงาน', robotIcon: '🔋', robotName: 'ไฟสำรอง', color: 0xffcd75, eat: 'มันเผา ขนมปังแผ่น ฟักทอง พาย', robotEat: 'ไม้ ถ่านหิน', low: 'สแตมินาสูงสุด −25' },
  v: { icon: '🥬', name: 'วิตามิน', robotIcon: '🛢', robotName: 'น้ำมันหล่อลื่น', color: 0xa7f070, eat: 'ผัก ผลไม้ สตูว์ผัก น้ำผลไม้', robotEat: 'น้ำมัน', low: 'อ่อนเพลีย ฟื้นตัวช้า' },
};

/** ของที่หุ่นยนต์ "ชาร์จ" ได้ (กด F): battery = หลอดอิ่ม(แบตเตอรี่) + ค่าสมดุลแบบเครื่องจักร */
export const ROBOT_FUEL: Record<string, { battery: number } & Nutri> = {
  wood: { battery: 8, e: 6 },
  coal: { battery: 15, e: 12 },
  iron_ingot: { battery: 40, p: 25 },
  gear: { battery: 5, p: 20 },
  scrap_metal: { battery: 6, p: 10 },
  fuel: { battery: 25, v: 35 },
};

/** ส่วนที่ระบบนี้ต้องใช้จาก Player (เลี่ยง import วงกลม) */
interface BodyHost {
  nutri: BodyState;
  hunger: number;
  thirst: number;
  char: { passive: { robot?: boolean } };
  bodyStats: Stats;
  bodyStaminaMult: number;
  bodyHealMult: number;
  bodyDrainMult: number;
  bodySpeedMult: number;
}

export const isBalanced = (b: BodyState) => b.p >= BODY.good && b.e >= BODY.good && b.v >= BODY.good;

/** ลดค่าตามเวลา + คำนวณผลบวก/ลบ (เรียกทุกเฟรมจาก Player.survive) */
export function tickBody(h: BodyHost, dt: number, grace: boolean) {
  const b = h.nutri;
  const k = grace ? 0.5 : 1;
  b.p = Math.max(0, b.p - BODY.decay.p * k * dt);
  b.e = Math.max(0, b.e - BODY.decay.e * k * dt);
  b.v = Math.max(0, b.v - BODY.decay.v * k * dt);
  if (b.sick > 0) b.sick = Math.max(0, b.sick - dt);
  applyBodyEffects(h, grace);
}

export function applyBodyEffects(h: BodyHost, grace: boolean) {
  const b = h.nutri;
  const s = emptyStats();
  let stamina = 1;
  let heal = 1;
  let speed = 1;
  if (isBalanced(b)) {
    s.regen += BODY.balancedRegen;
    stamina *= BODY.balancedStamina;
    speed *= 1 + BODY.balancedSpeed / 100;
  }
  if (!grace) {
    if (b.p < BODY.low) s.atk += BODY.lowProteinAtk;
    if (b.e < BODY.low) s.stamina += BODY.lowEnergyStamina;
    if (b.v < BODY.low) heal *= BODY.lowVitaminHeal;
  }
  if (b.sick > 0) {
    stamina *= BODY.sickStamina;
    heal = 0;
  }
  h.bodyStats = s;
  h.bodyStaminaMult = stamina;
  h.bodyHealMult = heal;
  h.bodySpeedMult = speed;
  h.bodyDrainMult = b.sick > 0 ? BODY.sickDrain : 1;
}

/** ใส่ค่าโภชนาการหลังกิน/ดื่ม → คืนข้อความ (เช่น ป่วย/หายป่วย) หรือ null */
export function eatNutri(h: BodyHost, def: ItemDef, rand = Math.random()): string | null {
  const n = def.nutri;
  if (!n) return null;
  const b = h.nutri;
  b.p = Math.min(100, b.p + (n.p ?? 0));
  b.e = Math.min(100, b.e + (n.e ?? 0));
  b.v = Math.min(100, b.v + (n.v ?? 0));
  if (n.cure && b.sick > 0) {
    b.sick = 0;
    return '🌿 หายป่วยแล้ว';
  }
  if (n.risk && !h.char.passive.robot && rand < n.risk) {
    const was = b.sick > 0;
    b.sick = Math.max(b.sick, BODY.sickTime);
    return was ? '🤢 ท้องเสียหนักขึ้น — หาสมุนไพร/ยา หรือนอนพัก' : `🤢 ท้องเสีย! (${def.name}ไม่สะอาด) — สมุนไพร/ยาสมุนไพร/นอนพัก ช่วยได้`;
  }
  return null;
}

/** ดื่มน้ำดิบริมทะเล/บึง (เสี่ยงเท่าน้ำดิบในกระบอก) */
export function drinkRaw(h: BodyHost, rand = Math.random()): string | null {
  return eatNutri(h, ITEMS.dirty_water, rand);
}

/** หุ่นยนต์: ชาร์จด้วยของในมือ → ข้อความ หรือ null ถ้าของนี้ชาร์จไม่ได้ */
export function robotCharge(h: BodyHost, id: string): string | null {
  const f = ROBOT_FUEL[id];
  if (!f) return null;
  h.hunger = Math.min(100, h.hunger + f.battery);
  const b = h.nutri;
  b.p = Math.min(100, b.p + (f.p ?? 0));
  b.e = Math.min(100, b.e + (f.e ?? 0));
  b.v = Math.min(100, b.v + (f.v ?? 0));
  return `🔋 ชาร์จด้วย${ITEMS[id]?.name ?? id}`;
}

/** หายป่วยจากการนอน */
export function restCure(h: BodyHost): boolean {
  if (h.nutri.sick <= 0) return false;
  h.nutri.sick = 0;
  return true;
}

/** บรรทัดโภชนาการของอาหาร (การ์ด/tooltip) */
export function nutriLine(def: ItemDef): string | null {
  const n = def.nutri;
  if (!n) return null;
  const parts = NUT_KEYS.filter((k) => n[k]).map((k) => `${NUT_INFO[k].icon}${NUT_INFO[k].name} +${n[k]}`);
  if (n.risk) parts.push(`⚠ ท้องเสีย ${Math.round(n.risk * 100)}%${def.id === 'dirty_water' ? ' (ต้มก่อน)' : ' (ปรุงสุกก่อน)'}`);
  else if (def.food && (def.food.thirst ?? 0) > 0 && !n.cure) parts.push('✔ ปลอดภัย');
  if (n.cure) parts.push('🌿 แก้ป่วย');
  return parts.length ? parts.join('  ') : null;
}

/**
 * คะแนนอาหารสำหรับระบบอัตโนมัติ: กินตอนหิว/กระหาย/ขาดสารอาหาร — เลือกของที่เติมส่วนที่ขาดมากสุด เลี่ยงของดิบ (เว้นแต่หิวจัด)
 * คืน -1 = ไม่ควรกิน
 */
export function foodScore(h: BodyHost, def: ItemDef): number {
  const f = def.food;
  if (!f || def.type !== 'food') return -1;
  const b = h.nutri;
  const n = def.nutri ?? {};
  const hungerNeed = Math.max(0, 100 - h.hunger);
  const thirstNeed = Math.max(0, 100 - h.thirst);
  const desperate = h.hunger < 15 || h.thirst < 15;
  if (n.risk && !desperate) return -1;
  if (n.cure && b.sick > 0) return 999;
  let score = Math.min(f.hunger ?? 0, hungerNeed) * (h.hunger < 40 ? 2 : 0.5) + Math.min(f.thirst ?? 0, thirstNeed) * (h.thirst < 40 ? 2 : 0.5);
  for (const k of NUT_KEYS) {
    const need = Math.max(0, 70 - b[k]);
    score += Math.min(n[k] ?? 0, need) * (b[k] < BODY.low ? 2.5 : b[k] < BODY.good ? 1.2 : 0.2);
  }
  // ไม่กินทิ้งขว้าง (อิ่ม/น้ำเต็มแล้ว)
  const waste = Math.max(0, (f.hunger ?? 0) - hungerNeed) + Math.max(0, (f.thirst ?? 0) - thirstNeed);
  return score - waste * 0.3 - def.value * 0.05 - (n.risk ? 15 : 0);
}

/** ควรหาอะไรกินไหม (ระบบอัตโนมัติ) */
export function wantsFood(h: BodyHost): boolean {
  const b = h.nutri;
  return h.hunger < 45 || h.thirst < 45 || b.sick > 0 || NUT_KEYS.some((k) => b[k] < 35);
}
