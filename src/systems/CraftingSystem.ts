import { ITEMS } from '../data/items';
import { RECIPES, type Recipe } from '../data/recipes';
import type { Inventory } from '../components/Inventory';

/** คำนวณจำนวนวัตถุดิบจริงหลังหักส่วนลดของตัวละคร (เช่น ช่าง ×0.9) */
export function costOf(qty: number, materialCost = 1): number {
  return Math.max(1, Math.floor(qty * materialCost + 0.001));
}

/** วัตถุดิบดิบที่ยังขาด (คิดแบบใช้ชิ้นส่วนที่มีอยู่ก่อน) */
export function missingFor(recipe: Recipe, inv: Inventory, materialCost = 1) {
  return missingRaw(recipeNeeds(recipe, materialCost), inv).map(([item, miss]) => ({ item, need: miss + inv.count(item), have: inv.count(item) }));
}

/** คราฟต์ — error: 'station' (ไม่มีสถานีบนเกาะ) หรือข้อความ, leftover = จำนวนที่ใส่กระเป๋าไม่ได้ · src = แหล่งวัตถุดิบ (กระเป๋า + คลังในฐาน) */
export function craft(recipe: Recipe, inv: Inventory, hasStation: boolean, materialCost = 1, src: MaterialSource = inv): { error?: string; leftover: number } {
  if (recipe.station !== 'none' && !hasStation) return { error: 'station', leftover: 0 };
  if (!consume(recipeNeeds(recipe, materialCost), src)) return { error: 'วัตถุดิบไม่พอ', leftover: 0 };
  return { leftover: inv.add(recipe.output.item, recipe.output.qty) };
}

// ======================================================================
// แหล่งวัตถุดิบ — กระเป๋า + ที่เก็บของในฐาน (หีบ/โกดัง/คลัง) ใช้กับคราฟต์ สร้าง อัพเกรด และซ่อม
// ======================================================================
/** นับ/หักวัตถุดิบได้ (Inventory ใช้แทนได้ตรงๆ) */
export interface MaterialSource {
  count(id: string): number;
  remove(id: string, qty: number): boolean;
}

/** กระเป๋า + คลัง: นับรวมกัน · หักจากกระเป๋าก่อน ที่ขาดค่อยหักจากคลัง (เรียงใกล้ → ไกล) */
export class MaterialPool implements MaterialSource {
  private totals = new Map<string, number>();
  private ver = -1;

  constructor(readonly inv: Inventory, readonly stores: Inventory[] = []) {}

  /** รวมเลขเวอร์ชันของคลังทั้งหมด (ของในหีบเปลี่ยน = นับใหม่) */
  get version() {
    let v = this.stores.length;
    for (const st of this.stores) v += st.version * 31;
    return v;
  }

  /** ของในคลัง (ไม่รวมกระเป๋า) */
  stored(id: string): number {
    const v = this.version;
    if (v !== this.ver) {
      this.ver = v;
      this.totals.clear();
      for (const st of this.stores) for (const s of st.slots) if (s && !s.plus) this.totals.set(s.id, (this.totals.get(s.id) ?? 0) + s.qty);
    }
    return this.totals.get(id) ?? 0;
  }

  count(id: string): number {
    if (this.inv.infinite && id !== 'coin') return 999;
    return this.inv.count(id) + this.stored(id);
  }

  remove(id: string, qty: number): boolean {
    if (this.inv.infinite && id !== 'coin') return true;
    if (this.count(id) < qty) return false;
    const fromBag = Math.min(this.inv.count(id), qty);
    if (fromBag > 0) this.inv.remove(id, fromBag);
    let left = qty - fromBag;
    for (const st of this.stores) {
      if (left <= 0) break;
      const n = Math.min(left, st.slots.reduce((a, s) => a + (s?.id === id && !s.plus ? s.qty : 0), 0));
      if (n <= 0) continue;
      let k = n;
      for (let i = st.slots.length - 1; i >= 0 && k > 0; i--) {
        const s = st.slots[i];
        if (!s || s.id !== id || s.plus) continue;
        const t = Math.min(s.qty, k);
        s.qty -= t;
        k -= t;
        if (s.qty <= 0) st.slots[i] = null;
      }
      st.version++;
      left -= n;
    }
    return true;
  }
}

// ======================================================================
// วัตถุดิบดิบ — แปลนทุกใบบอกแค่ของดิบ (ไม้ หิน แร่ …) ชิ้นส่วนกลาง (เชือก ไม้กระดาน แท่งเหล็ก ฯลฯ) ถูกแตกเป็นของดิบให้เอง
// ======================================================================

/** สูตรหลักของชิ้นส่วนกลาง (ไอเทมชนิด material ที่มีสูตรทำ) — ใช้สูตรแรกที่พบ */
let PARTS: Map<string, Recipe> | null = null;
function parts(): Map<string, Recipe> {
  if (PARTS) return PARTS;
  PARTS = new Map();
  for (const r of RECIPES) {
    const d = ITEMS[r.output.item];
    if (d?.type === 'material' && !PARTS.has(d.id)) PARTS.set(d.id, r);
  }
  return PARTS;
}
/** ไอเทมนี้เป็นชิ้นส่วนกลาง (ผู้เล่นไม่ต้องทำเอง) หรือไม่ */
export const isPart = (id: string) => parts().has(id);

/** แตกรายการวัตถุดิบเป็นของดิบทั้งหมด (รวมจำนวนซ้ำ) */
export function rawCost(inputs: [string, number][], depth = 0): [string, number][] {
  const out = new Map<string, number>();
  for (const [id, n] of inputs) {
    const r = depth < 6 ? parts().get(id) : undefined;
    if (!r) {
      out.set(id, (out.get(id) ?? 0) + n);
      continue;
    }
    const times = Math.ceil(n / r.output.qty);
    for (const [sid, sn] of rawCost(r.inputs.map((i) => [i.item, i.qty * times] as [string, number]), depth + 1)) out.set(sid, (out.get(sid) ?? 0) + sn);
  }
  return [...out.entries()];
}
export const rawCostOfRecipe = (r: Recipe) => rawCost(r.inputs.map((i) => [i.item, i.qty] as [string, number]));
export const rawCostOfBuild = (cost: [string, number][]) => rawCost(cost);

/** ชิ้นส่วนกลางที่ยังคราฟต์เองได้ (ของใช้สิ้นเปลืองโดยตรง — น้ำมันเติมเรือ/เครื่องปั่นไฟ) */
const HAND_PARTS = new Set(['fuel']);
/** สูตรนี้ซ่อนจากสมุดแปลน/คลังข้อมูล (ชิ้นส่วนกลาง — ผู้เล่นไม่ต้องทำเอง) */
export const isHiddenRecipe = (r: Recipe) => isPart(r.output.item) && !HAND_PARTS.has(r.output.item);

// ======================================================================
// หักของแบบฉลาด — ใช้ชิ้นส่วนที่มีอยู่ก่อน (จากโรงเลื่อย/เตาเผา/กล่อง/เซฟเก่า) ส่วนที่ขาดค่อยแตกเป็นของดิบ
// ======================================================================
type Countable = { count(id: string): number };

/** วัตถุดิบของสูตร (หักส่วนลดตัวละครแล้ว) — ยังไม่แตกชิ้นส่วน */
export const recipeNeeds = (r: Recipe, materialCost = 1): [string, number][] => r.inputs.map((i) => [i.item, costOf(i.qty, materialCost)]);

/** แผนหักของ: take = ของที่จะถูกหักจริง (อาจมีชิ้นส่วน) · missing = ของดิบที่ยังขาด */
export function planConsume(inputs: [string, number][], inv: Countable, times = 1) {
  const avail = new Map<string, number>();
  const take = new Map<string, number>();
  const missing = new Map<string, number>();
  const have = (id: string) => avail.get(id) ?? inv.count(id);
  const need = (id: string, n: number, depth: number) => {
    const use = Math.min(have(id), n);
    if (use > 0) {
      avail.set(id, have(id) - use);
      take.set(id, (take.get(id) ?? 0) + use);
    }
    const rem = n - use;
    if (rem <= 0) return;
    const r = depth < 6 ? parts().get(id) : undefined;
    if (!r) {
      missing.set(id, (missing.get(id) ?? 0) + rem);
      return;
    }
    const k = Math.ceil(rem / r.output.qty);
    for (const i of r.inputs) need(i.item, i.qty * k, depth + 1);
  };
  for (const [id, n] of inputs) need(id, n * times, 0);
  return { take, missing, ok: missing.size === 0 };
}

export const missingRaw = (inputs: [string, number][], inv: Countable, times = 1): [string, number][] => [...planConsume(inputs, inv, times).missing];
export const canAfford = (inputs: [string, number][], inv: Countable, times = 1) => planConsume(inputs, inv, times).ok;

/** หักของตามแผน (คืน false ถ้าไม่พอ — ไม่หักอะไรเลย) · inv = กระเป๋า หรือ MaterialPool (กระเป๋า + คลัง) */
export function consume(inputs: [string, number][], inv: MaterialSource, times = 1): boolean {
  const plan = planConsume(inputs, inv, times);
  if (!plan.ok) return false;
  for (const [id, n] of plan.take) inv.remove(id, n);
  return true;
}

/** ทำได้อีกกี่ครั้ง (สูงสุด max) */
export function affordableTimes(inputs: [string, number][], inv: Countable, max = 999): number {
  if (!canAfford(inputs, inv, 1)) return 0;
  let lo = 1;
  let hi = max;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (canAfford(inputs, inv, mid)) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** ชิ้นส่วนกลางที่แผนนี้จะหยิบจากกระเป๋า (ไว้แสดง "ใช้ชิ้นส่วนที่มีอยู่ก่อน") */
export const partsUsed = (inputs: [string, number][], inv: Countable, times = 1): [string, number][] =>
  [...planConsume(inputs, inv, times).take].filter(([id]) => isPart(id));
