import { BUILDABLES, type BuildDef } from './buildables';
import { ITEMS, ITEM_LIST, type ItemDef } from './items';
import { BP_CORE, LOOT_GROUPS, type Rarity } from './loot';
import { MOBS } from './mobs';
import { RECIPES, type Recipe } from './recipes';
import { BAND_INFO, UP_BANDS, UP_CATEGORIES, UP_CATEGORY_NAMES, upBlueprintItem, upKey } from './upgrade';
import { isHiddenRecipe } from '../systems/CraftingSystem';

/**
 * แปลน (Blueprint) — ของพื้นฐานรู้แปลนตั้งแต่แรก ของขั้นสูงต้อง "หาแปลน" จากกล่องก่อนถึงจะสร้างได้
 *   คีย์แปลน:  b:<buildableId>  (สิ่งก่อสร้าง)  ·  i:<itemId>  (ไอเทม/อาวุธ — ทุกสูตรของไอเทมนั้น)
 *              u:<หมวด>:<ช่วง>  (แปลนอัพเกรด 14 หมวด × 3 ช่วง = 42 ใบ — ระบบอัพเกรดเช็กด้วย knows(upKey()))
 *   ไอเทมแปลน: bp_b_<id> / bp_i_<id> / bp_u_<หมวด>_<ช่วง> — เก็บได้แล้วเรียนรู้ทันที · ได้ซ้ำ = แปลงเป็นเหรียญครึ่งราคา
 *   ดรอปจากกล่องทอง/กล่องเพชร (+ กล่องเหล็กเล็กน้อย เฉพาะระดับ ดี/หายาก) (ตารางความหายากของแปลนแยกต่อกล่อง — ดู loot.ts bpRarity)
 */
export const bpKeyBuild = (b: BuildDef) => `b:${b.id}`;
export const bpKeyRecipe = (r: Recipe) => `i:${r.output.item}`;

const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const BP_VALUE: Record<Rarity, number> = { common: 30, uncommon: 60, rare: 150, epic: 400, legendary: 900 };

/** แปลนหลักขั้น 2 เรียงตามความจำเป็น (สถานี → ป้องกัน → บ้าน → ฟาร์ม/เรือ) — กล่องสุ่มให้ก่อนเมื่อยังไม่รู้ (ดู BP_CORE ใน loot.ts) */
const CORE_BUILDS = ['anvil', 'turret_arrow', 'door_stone', 'brick_house', 'tower_archer', 'watchtower', 'cottage', 'dock', 'greenhouse', 'bomb_trap', 'sailboat', 'barn'];

/** สิ่งก่อสร้างระดับ 1 = รู้แปลนตั้งแต่แรก */
function buildKnownByDefault(b: BuildDef) {
  return (b.tier ?? 1) <= 1;
}

/** ไอเทมพื้นฐาน (มือเปล่า/กองไฟ/เตาหลอม หรือของธรรมดาที่โต๊ะช่าง) = รู้แปลนตั้งแต่แรก */
function itemKnownByDefault(item: ItemDef) {
  const recipes = RECIPES.filter((r) => r.output.item === item.id);
  return recipes.some((r) => r.station === 'none' || r.station === 'campfire' || r.station === 'furnace' || r.station === 'kitchen' || (r.station === 'workbench' && (item.rarity ?? 'common') === 'common'));
}

/** แปลนทั้งหมดที่ต้องหา (คีย์ → ไอเทมแปลน) */
export const BLUEPRINT_ITEM = new Map<string, string>();
/** ไอเทมแปลน → คีย์ (กลับด้าน) */
export const BLUEPRINT_KEY = new Map<string, string>();
/** ไอเทมแปลน → ปลดล็อกอะไร (ข้อความสั้น) */
export const BLUEPRINT_UNLOCK = new Map<string, string>();
/** คีย์แปลนที่รู้ตั้งแต่เริ่ม */
export const DEFAULT_KNOWN = new Set<string>();

let registered = false;

/** สร้างไอเทมแปลน + ใส่ในกลุ่มของกล่อง (เรียกครั้งเดียวตอนบูต) */
export function registerBlueprints() {
  if (registered) return;
  registered = true;
  const add = (key: string, name: string, rarity: Rarity, what: string, opt: { id?: string; icon?: string; full?: string; desc?: string } = {}) => {
    const id = opt.id ?? `bp_${key.replace(':', '_')}`;
    const def: ItemDef = {
      id, name: opt.full ?? `แปลน: ${name}`, desc: opt.desc ?? `เก็บแล้วเรียนรู้ทันที — ปลดล็อกการสร้าง${what} (ใช้ของดิบ กดแล้วได้ของสำเร็จ · ได้ซ้ำ = แปลงเป็นเหรียญ)`,
      icon: opt.icon ?? (key.startsWith('b:') ? 'i_blueprint_b' : 'i_blueprint'), type: 'blueprint', stack: 10, value: BP_VALUE[rarity], rarity,
    };
    ITEM_LIST.push(def);
    ITEMS[id] = def;
    BLUEPRINT_ITEM.set(key, id);
    BLUEPRINT_KEY.set(id, key);
    BLUEPRINT_UNLOCK.set(id, what);
    LOOT_GROUPS.blueprint.entries.push({ item: id, qty: [1, 1], rarity, key });
  };
  for (const b of BUILDABLES) {
    const key = bpKeyBuild(b);
    if (buildKnownByDefault(b)) DEFAULT_KNOWN.add(key);
    else add(key, b.name, ORDER[Math.min(4, Math.max(1, (b.tier ?? 1) - 1))], b.name);
  }
  for (const id of CORE_BUILDS) if (BUILDABLES.some((b) => b.id === id && b.tier === 2)) BP_CORE.add(`b:${id}`);
  // ชิ้นส่วนกลาง (เชือก ไม้กระดาน แท่งเหล็ก เฟือง …) ไม่มีแปลน — ผู้เล่นไม่ต้องทำเอง แปลนอื่นแตกเป็นของดิบให้
  const outputs = new Set(RECIPES.filter((r) => !isHiddenRecipe(r)).map((r) => r.output.item));
  for (const r of RECIPES) if (isHiddenRecipe(r)) DEFAULT_KNOWN.add(`i:${r.output.item}`);
  for (const id of outputs) {
    const it = ITEMS[id];
    const key = `i:${id}`;
    if (itemKnownByDefault(it)) DEFAULT_KNOWN.add(key);
    else add(key, it.name, ORDER[Math.max(1, ORDER.indexOf(it.rarity ?? 'common'))], it.name);
  }
  // แปลนอัพเกรด: 14 หมวด × 3 ช่วง (เสริมเหล็ก Lv4–6 = หายาก · ทองคำ Lv7–9 = มหากาพย์ · ตำนาน Lv10 = เทพ)
  for (const cat of UP_CATEGORIES) {
    for (const band of UP_BANDS) {
      const b = BAND_INFO[band];
      const what = `อัพเกรด${UP_CATEGORY_NAMES[cat]} ${b.range}`;
      add(upKey(cat, band), what, b.rarity, what, {
        id: upBlueprintItem(cat, band), icon: `i_blueprint_u_${band}`,
        full: `แปลนอัพเกรด ${UP_CATEGORY_NAMES[cat]} · ${b.name} (${b.range})`,
        desc: `เก็บแล้วเรียนรู้ทันที — อัพเกรดของหมวด${UP_CATEGORY_NAMES[cat]}ไป ${b.range} ได้ (ได้ซ้ำ = แปลงเป็นเหรียญ)`,
      });
    }
  }
}

/** แปลนนี้ต้องหาจากกล่องระดับไหน (ข้อความสั้น) */
export function blueprintSource(key: string): string {
  const id = BLUEPRINT_ITEM.get(key);
  if (!id) return '';
  const r = ITEMS[id].rarity ?? 'uncommon';
  if (BP_CORE.has(key)) return 'กล่องทอง/กล่องเหล็ก (แปลนหลัก — ออกก่อน)';
  // แปลนที่สัตว์ (ในตำนาน) ดรอปได้ด้วย
  const mob = Object.values(MOBS).find((m) => m.drops.some((d) => d.item === id));
  const also = mob ? ` · หรือลุ้นจาก${mob.name}` : '';
  return (r === 'uncommon' ? 'กล่องทอง (กล่องเหล็กโอกาสน้อย)' : r === 'legendary' ? 'กล่องเพชร (กล่องทองโอกาสน้อย)' : 'กล่องทอง/กล่องเพชร') + also;
}
