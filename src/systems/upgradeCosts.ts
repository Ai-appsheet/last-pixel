import type { BuildDef } from '../data/buildables';
import { statLine } from '../data/equipment';
import { ITEMS, type ItemDef } from '../data/items';
import { RECIPES } from '../data/recipes';
import { BAND_INFO, MAX_LEVEL, UP_CATEGORY_NAMES, bandOf, itemLevelMult, upCategoryOfBuild, upCategoryOfItem, upgradeCost, type UpCategory, type UpgradeCost } from '../data/upgrade';
import { rawCostOfBuild, rawCostOfRecipe } from './CraftingSystem';

/**
 * ค่าอัพเกรด 10 ระดับ (ไม่ผูกกับ Phaser — ใช้ได้ทั้งในเกมและหน้าคลังข้อมูล)
 * baseCost ของไอเทม = วัตถุดิบดิบจากสูตรคราฟต์ · ของที่ได้จากกล่องเท่านั้น = คิดจากมูลค่า/ความหายาก
 */
// ======================================================================
// ค่าอัพเกรด
// ======================================================================
const baseCache = new Map<string, [string, number][]>();

/** วัตถุดิบดิบ "ต่อ 1 ชิ้น" ของไอเทม — จากสูตรคราฟต์ · ของที่ได้จากกล่องเท่านั้น = คิดจากมูลค่า/ความหายาก */
export function itemBaseCost(id: string): [string, number][] {
  const hit = baseCache.get(id);
  if (hit) return hit;
  const def = ITEMS[id];
  const r = RECIPES.find((x) => x.output.item === id);
  let out: [string, number][] = [];
  if (r) out = rawCostOfRecipe(r).map(([i, n]) => [i, Math.max(1, Math.ceil(n / Math.max(1, r.output.qty)))] as [string, number]).filter(([i]) => ITEMS[i]);
  if (!out.length && def) {
    const n = Math.max(2, Math.min(24, Math.round(def.value / 25)));
    switch (def.rarity ?? 'common') {
      case 'common': out = [['stone', n * 2], ['iron_ore', n]]; break;
      case 'uncommon': out = [['iron_ore', n], ['coal', n]]; break;
      case 'rare': out = [['iron_ore', n], ['gold_ore', Math.ceil(n / 2)]]; break;
      case 'epic': out = [['gold_ore', Math.ceil(n / 2)], ['crystal', Math.ceil(n / 6)]]; break;
      default: out = [['gold_ore', Math.ceil(n / 2)], ['crystal', Math.ceil(n / 5)], ['meteorite', Math.ceil(n / 8)]];
    }
  }
  baseCache.set(id, out);
  return out;
}

/** สัดส่วนแร่ช่วงเลเวล (ของถูกจ่ายน้อยลง): มูลค่าฐาน/100 อยู่ในช่วง 0.25..1 */
export const oreScaleOf = (base: [string, number][]) => Math.min(1, Math.max(0.25, base.reduce((a, [i, n]) => a + (ITEMS[i]?.value ?? 1) * n, 0) / 100));

/** ความหายากของสิ่งก่อสร้าง (ตามขั้นแปลน) — ใช้คิดเหรียญ */
export const buildRarity = (def: BuildDef) => (def.tier >= 4 ? 'epic' : def.tier === 3 ? 'rare' : def.tier === 2 ? 'uncommon' : 'common');

/** ค่าอัพไอเทมจาก lv → lv+1 (null = อัพไม่ได้/เต็มแล้ว) */
export function itemUpgradeCost(id: string, lv: number): UpgradeCost | null {
  const def = ITEMS[id];
  const cat = upCategoryOfItem(def);
  if (!cat || lv >= MAX_LEVEL) return null;
  const base = itemBaseCost(id);
  return upgradeCost(cat, lv, base, def.rarity ?? 'common', oreScaleOf(base));
}

/** ค่าอัพสิ่งก่อสร้าง/ยานจาก lv → lv+1 */
export function buildUpgradeCost(def: BuildDef, lv: number): UpgradeCost | null {
  const cat = upCategoryOfBuild(def);
  if (!cat || lv >= MAX_LEVEL) return null;
  const base = rawCostOfBuild(def.cost).filter(([i]) => ITEMS[i]);
  return upgradeCost(cat, lv, base, buildRarity(def), oreScaleOf(base));
}

/** ข้อความสั้นของรายการวัตถุดิบ (ไม่เทียบของในกระเป๋า) */
export const costText = (c: UpgradeCost) => [...c.items.map(([i, n]) => `${ITEMS[i]?.name ?? i}×${n}`), `${c.coins.toLocaleString()} เหรียญ`].join(' · ');

/** หน้าตา 4 แบบ */
export const bandName = (lv: number) => {
  const b = bandOf(lv);
  return b ? BAND_INFO[b].name : 'ปกติ';
};

/** ค่าสถานะไอเทมที่เลเวลนั้น (บรรทัดเดียว) */
export function itemStatAt(def: ItemDef, lv: number): string {
  const m = itemLevelMult(lv);
  if (def.tool) return `ดาเมจ ${Math.round(def.tool.damage * m)}`;
  if (def.ranged) return `ดาเมจ ${Math.round(def.ranged.damage * m)}`;
  if (def.equip) return statLine(def.equip.stats, m) || '—';
  return '';
}

/** ช่วงเลเวลที่ต้องมีแปลนอัพเกรด (ข้อความ) */
export const lockLabel = (cat: UpCategory, toLv: number) => {
  const b = bandOf(toLv);
  return b ? `ต้องมีแปลนอัพเกรด ${UP_CATEGORY_NAMES[cat]} · ${BAND_INFO[b].name}` : '';
};

