import { ITEM_LIST } from './items';
import { MAX_LEVEL, itemLevelMult } from './upgrade';

/** ระดับความหายากของไอเทม */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { name: string; color: string; hex: number }> = {
  common: { name: 'ธรรมดา', color: '#f4f4f4', hex: 0xf4f4f4 },
  uncommon: { name: 'ดี', color: '#a7f070', hex: 0xa7f070 },
  rare: { name: 'หายาก', color: '#41a6f6', hex: 0x41a6f6 },
  epic: { name: 'มหากาพย์', color: '#a77bdb', hex: 0xa77bdb },
  legendary: { name: 'เทพ', color: '#ffcd75', hex: 0xffcd75 },
};

export type BoxTier = 'box_wood' | 'box_iron' | 'box_gold' | 'box_legend';

/**
 * กล่องของแบบ "กลุ่ม": เปิดแล้วสุ่มกลุ่มก่อน (อาวุธ/เกราะ/วัตถุดิบ/อัพเกรด/แฟชั่น/อาหาร)
 * แล้วสุ่มของในกลุ่มตามความหายากที่กล่องระดับนั้นเปิดให้ — กล่องยิ่งสูง ของยิ่งดี
 */
export interface LootEntry {
  item: string;
  qty: [number, number];
  rarity: Rarity;
  /** คีย์แปลน (เฉพาะกลุ่ม blueprint — b:/i:/u:) ไว้เช็กว่าผู้เล่นรู้แล้วหรือยัง */
  key?: string;
}

export const LOOT_GROUPS: Record<string, { name: string; entries: LootEntry[] }> = {
  material: {
    name: 'วัตถุดิบ',
    entries: [
      { item: 'wood', qty: [10, 25], rarity: 'common' }, { item: 'stone', qty: [10, 25], rarity: 'common' }, { item: 'rope', qty: [4, 10], rarity: 'common' },
      { item: 'iron_ore', qty: [4, 10], rarity: 'common' }, { item: 'coal', qty: [4, 10], rarity: 'common' }, { item: 'hide', qty: [2, 5], rarity: 'common' },
      { item: 'gold_ore', qty: [2, 5], rarity: 'uncommon' }, { item: 'crab_shell', qty: [2, 4], rarity: 'uncommon' },
      { item: 'coal', qty: [5, 12], rarity: 'uncommon' }, { item: 'iron_ingot', qty: [3, 8], rarity: 'uncommon' }, { item: 'sulfur', qty: [3, 8], rarity: 'uncommon' },
      { item: 'gear', qty: [3, 6], rarity: 'rare' }, { item: 'gold_ingot', qty: [2, 5], rarity: 'rare' }, { item: 'crystal', qty: [1, 3], rarity: 'epic' },
      { item: 'meteorite', qty: [2, 4], rarity: 'epic' }, { item: 'engine', qty: [1, 1], rarity: 'epic' }, { item: 'demon_horn', qty: [1, 1], rarity: 'legendary' },
      // ของจากสัตว์ชุดใหม่
      { item: 'feather', qty: [4, 10], rarity: 'common' }, { item: 'glow_dust', qty: [2, 5], rarity: 'uncommon' }, { item: 'venom_sac', qty: [1, 3], rarity: 'uncommon' },
      { item: 'pearl', qty: [1, 2], rarity: 'rare' }, { item: 'shark_tooth', qty: [2, 4], rarity: 'rare' },
    ],
  },
  enhance: {
    name: 'อัพเกรด',
    // วัตถุดิบอัพเกรด 10 ระดับ (หินตีบวก = ของจำเป็นช่วง Lv7+) — ระบบตีบวกแบบสุ่มพังถูกแทนด้วยอัพเกรด 100%
    entries: [
      { item: 'iron_ore', qty: [6, 12], rarity: 'common' },
      { item: 'enhance_stone', qty: [1, 3], rarity: 'uncommon' }, { item: 'gold_ore', qty: [3, 6], rarity: 'uncommon' },
      { item: 'enhance_stone', qty: [3, 6], rarity: 'rare' }, { item: 'gold_ore', qty: [6, 10], rarity: 'rare' },
      { item: 'enhance_stone', qty: [8, 15], rarity: 'epic' }, { item: 'crystal', qty: [3, 5], rarity: 'epic' },
      { item: 'enhance_stone', qty: [12, 20], rarity: 'legendary' }, { item: 'meteorite', qty: [3, 5], rarity: 'legendary' },
    ],
  },
  weapon: {
    name: 'อาวุธ',
    entries: [
      { item: 'wood_sword', qty: [1, 1], rarity: 'common' }, { item: 'spear', qty: [1, 1], rarity: 'common' }, { item: 'bow', qty: [1, 1], rarity: 'uncommon' },
      { item: 'iron_sword', qty: [1, 1], rarity: 'uncommon' }, { item: 'iron_spear', qty: [1, 1], rarity: 'uncommon' }, { item: 'crossbow', qty: [1, 1], rarity: 'rare' },
      { item: 'gold_sword', qty: [1, 1], rarity: 'rare' }, { item: 'flintlock', qty: [1, 1], rarity: 'epic' }, { item: 'crystal_sword', qty: [1, 1], rarity: 'epic' },
      { item: 'crystal_staff', qty: [1, 1], rarity: 'epic' }, { item: 'meteor_sword', qty: [1, 1], rarity: 'epic' },
      { item: 'thunder_blade', qty: [1, 1], rarity: 'legendary' }, { item: 'inferno_axe', qty: [1, 1], rarity: 'legendary' },
      { item: 'vampire_scythe', qty: [1, 1], rarity: 'legendary' }, { item: 'storm_bow', qty: [1, 1], rarity: 'legendary' },
      { item: 'cosmic_staff', qty: [1, 1], rarity: 'legendary' }, { item: 'thor_hammer', qty: [1, 1], rarity: 'legendary' },
      // อาวุธชุดขยาย (data/weapons.ts)
      { item: 'stone_dagger', qty: [1, 1], rarity: 'common' }, { item: 'wood_club', qty: [1, 1], rarity: 'common' }, { item: 'sickle', qty: [1, 1], rarity: 'common' }, { item: 'rope_whip', qty: [1, 1], rarity: 'common' },
      { item: 'hand_wraps', qty: [1, 1], rarity: 'common' }, { item: 'slingshot', qty: [1, 1], rarity: 'common' }, { item: 'bone_dagger', qty: [1, 1], rarity: 'common' }, { item: 'bone_sword', qty: [1, 1], rarity: 'common' },
      { item: 'bone_spear', qty: [1, 1], rarity: 'common' }, { item: 'short_bow', qty: [1, 1], rarity: 'common' }, { item: 'wood_boomerang', qty: [1, 1], rarity: 'common' }, { item: 'stone_battleaxe', qty: [1, 1], rarity: 'common' },
      { item: 'spiked_club', qty: [1, 1], rarity: 'common' },
      { item: 'iron_dagger', qty: [1, 1], rarity: 'uncommon' }, { item: 'leather_whip', qty: [1, 1], rarity: 'uncommon' }, { item: 'bone_claws', qty: [1, 1], rarity: 'uncommon' }, { item: 'long_bow', qty: [1, 1], rarity: 'uncommon' },
      { item: 'iron_knuckles', qty: [1, 1], rarity: 'uncommon' }, { item: 'iron_battleaxe', qty: [1, 1], rarity: 'uncommon' }, { item: 'iron_mace', qty: [1, 1], rarity: 'uncommon' }, { item: 'iron_scythe', qty: [1, 1], rarity: 'uncommon' },
      { item: 'chain_whip', qty: [1, 1], rarity: 'uncommon' }, { item: 'chakram', qty: [1, 1], rarity: 'uncommon' }, { item: 'iron_greatsword', qty: [1, 1], rarity: 'uncommon' },
      { item: 'venom_dagger', qty: [1, 1], rarity: 'rare' }, { item: 'katana', qty: [1, 1], rarity: 'rare' }, { item: 'crab_cleaver', qty: [1, 1], rarity: 'rare' }, { item: 'gold_greatsword', qty: [1, 1], rarity: 'rare' },
      { item: 'gold_warhammer', qty: [1, 1], rarity: 'rare' }, { item: 'gold_trident', qty: [1, 1], rarity: 'rare' }, { item: 'composite_bow', qty: [1, 1], rarity: 'rare' }, { item: 'heavy_crossbow', qty: [1, 1], rarity: 'rare' },
      { item: 'repeater_crossbow', qty: [1, 1], rarity: 'rare' }, { item: 'revolver', qty: [1, 1], rarity: 'rare' }, { item: 'fire_staff', qty: [1, 1], rarity: 'rare' }, { item: 'frost_staff', qty: [1, 1], rarity: 'rare' },
      { item: 'lightning_staff', qty: [1, 1], rarity: 'rare' }, { item: 'poison_staff', qty: [1, 1], rarity: 'rare' },
      { item: 'crystal_dagger', qty: [1, 1], rarity: 'epic' }, { item: 'frost_sword', qty: [1, 1], rarity: 'epic' }, { item: 'crystal_battleaxe', qty: [1, 1], rarity: 'epic' }, { item: 'crystal_halberd', qty: [1, 1], rarity: 'epic' },
      { item: 'shadow_scythe', qty: [1, 1], rarity: 'epic' }, { item: 'fire_whip', qty: [1, 1], rarity: 'epic' }, { item: 'crystal_knuckles', qty: [1, 1], rarity: 'epic' }, { item: 'frost_bow', qty: [1, 1], rarity: 'epic' },
      { item: 'shotgun', qty: [1, 1], rarity: 'epic' }, { item: 'rifle', qty: [1, 1], rarity: 'epic' }, { item: 'meteor_greatsword', qty: [1, 1], rarity: 'epic' }, { item: 'meteor_maul', qty: [1, 1], rarity: 'epic' },
      { item: 'meteor_lance', qty: [1, 1], rarity: 'epic' },
      { item: 'glacier_greatsword', qty: [1, 1], rarity: 'legendary' }, { item: 'naga_spear', qty: [1, 1], rarity: 'legendary' }, { item: 'rahu_fangs', qty: [1, 1], rarity: 'legendary' }, { item: 'garuda_bow', qty: [1, 1], rarity: 'legendary' },
      { item: 'void_staff', qty: [1, 1], rarity: 'legendary' }, { item: 'dragon_cannon', qty: [1, 1], rarity: 'legendary' },
      // อาวุธเวทชุดใหม่
      { item: 'apprentice_wand', qty: [1, 1], rarity: 'uncommon' },
      { item: 'water_staff', qty: [1, 1], rarity: 'rare' }, { item: 'wind_staff', qty: [1, 1], rarity: 'rare' }, { item: 'earth_staff', qty: [1, 1], rarity: 'rare' }, { item: 'fire_tome', qty: [1, 1], rarity: 'rare' },
      { item: 'holy_staff', qty: [1, 1], rarity: 'epic' }, { item: 'blood_staff', qty: [1, 1], rarity: 'epic' }, { item: 'abyss_tome', qty: [1, 1], rarity: 'epic' },
      { item: 'storm_wand', qty: [1, 1], rarity: 'epic' }, { item: 'glacier_orb', qty: [1, 1], rarity: 'epic' }, { item: 'gaia_orb', qty: [1, 1], rarity: 'epic' },
      { item: 'naga_staff', qty: [1, 1], rarity: 'legendary' }, { item: 'garuda_tome', qty: [1, 1], rarity: 'legendary' }, { item: 'phoenix_orb', qty: [1, 1], rarity: 'legendary' },
    ],
  },
  armor: { name: 'อุปกรณ์สวมใส่', entries: [] }, // เติมจาก ITEMS (ทุกชิ้นที่มี equip) ด้านล่าง
  elixir: {
    name: 'ผลึกพลัง',
    entries: [
      { item: 'elixir_hp', qty: [1, 2], rarity: 'common' }, { item: 'elixir_sta', qty: [1, 2], rarity: 'common' },
      { item: 'elixir_atk', qty: [1, 1], rarity: 'uncommon' }, { item: 'elixir_def', qty: [1, 1], rarity: 'uncommon' }, { item: 'elixir_hp', qty: [2, 4], rarity: 'uncommon' },
      { item: 'elixir_spd', qty: [1, 1], rarity: 'rare' }, { item: 'elixir_crit', qty: [1, 1], rarity: 'rare' }, { item: 'elixir_luck', qty: [1, 1], rarity: 'rare' }, { item: 'elixir_atk', qty: [2, 3], rarity: 'rare' },
      { item: 'elixir_regen', qty: [1, 1], rarity: 'epic' }, { item: 'elixir_def', qty: [2, 4], rarity: 'epic' },
      { item: 'elixir_soul', qty: [1, 1], rarity: 'legendary' },
    ],
  },
  supply: {
    name: 'เสบียง',
    entries: [
      { item: 'cooked_meat', qty: [3, 6], rarity: 'common' }, { item: 'bandage', qty: [2, 4], rarity: 'common' }, { item: 'arrow', qty: [15, 30], rarity: 'common' },
      { item: 'veggie_stew', qty: [2, 3], rarity: 'uncommon' }, { item: 'bullet', qty: [10, 20], rarity: 'rare' }, { item: 'bomb', qty: [2, 4], rarity: 'rare' },
      { item: 'pumpkin_pie', qty: [2, 4], rarity: 'epic' }, { item: 'fuel', qty: [3, 6], rarity: 'rare' },
      // กระสุน/ของขว้างชุดขยาย
      { item: 'javelin', qty: [3, 5], rarity: 'common' }, { item: 'molotov', qty: [2, 3], rarity: 'uncommon' }, { item: 'smoke_bomb', qty: [2, 3], rarity: 'uncommon' },
      { item: 'throwing_knife', qty: [8, 15], rarity: 'uncommon' }, { item: 'shuriken', qty: [8, 15], rarity: 'uncommon' }, { item: 'poison_bomb', qty: [2, 3], rarity: 'uncommon' },
      { item: 'shell', qty: [6, 12], rarity: 'rare' }, { item: 'rifle_round', qty: [5, 10], rarity: 'rare' }, { item: 'ice_bomb', qty: [2, 3], rarity: 'rare' },
      { item: 'flash_bomb', qty: [2, 3], rarity: 'rare' }, { item: 'cluster_bomb', qty: [1, 2], rarity: 'epic' },
    ],
  },
  coin: {
    name: 'เหรียญ',
    entries: [
      { item: 'coin', qty: [10, 30], rarity: 'common' }, { item: 'coin', qty: [40, 80], rarity: 'uncommon' }, { item: 'coin', qty: [100, 200], rarity: 'rare' },
      { item: 'coin', qty: [250, 500], rarity: 'epic' }, { item: 'coin', qty: [800, 1500], rarity: 'legendary' },
    ],
  },
  cosmetic: { name: 'ชุดแฟชั่น', entries: [] }, // เติมจาก heroes.ts ตอนเริ่มเกม
  blueprint: { name: 'แปลน', entries: [] }, // เติมจาก blueprints.ts ตอนเริ่มเกม
};

// อุปกรณ์ทุกชิ้นสุ่มได้จากกล่อง (ระดับตามความหายากของไอเทม)
for (const it of ITEM_LIST) if (it.equip) LOOT_GROUPS.armor.entries.push({ item: it.id, qty: [1, 1], rarity: it.rarity ?? 'common' });

export interface BoxDef {
  id: BoxTier;
  name: string;
  /** จำนวนของที่ได้ */
  rolls: [number, number];
  /** น้ำหนักกลุ่ม */
  groups: Record<string, number>;
  /** น้ำหนักความหายาก (ต่อ 100) */
  rarity: Record<Rarity, number>;
  /** ตารางความหายากของ "แปลน" ในกล่องนี้ (แยกจากของทั่วไป) */
  bpRarity?: Record<Rarity, number>;
}

export const BOXES: Record<BoxTier, BoxDef> = {
  box_wood: {
    id: 'box_wood', name: 'กล่องไม้', rolls: [2, 3],
    groups: { material: 36, supply: 22, coin: 22, weapon: 5, armor: 6, enhance: 6, cosmetic: 2, elixir: 8, blueprint: 0 },
    rarity: { common: 70, uncommon: 25, rare: 5, epic: 0, legendary: 0 },
  },
  box_iron: {
    id: 'box_iron', name: 'กล่องเหล็ก', rolls: [3, 4],
    groups: { material: 32, supply: 12, coin: 19, weapon: 10, armor: 11, enhance: 11, cosmetic: 4, elixir: 12, blueprint: 7 },
    rarity: { common: 25, uncommon: 45, rare: 25, epic: 5, legendary: 0 },
    // สมดุล: กล่องเหล็กมีแปลนระดับ "ดี/หายาก" เล็กน้อย (~0.2 ใบ/กล่อง) ให้ได้ของขั้น 2 ภายใน ~1 สัปดาห์เกม
    bpRarity: { common: 0, uncommon: 85, rare: 15, epic: 0, legendary: 0 },
  },
  box_gold: {
    id: 'box_gold', name: 'กล่องทอง', rolls: [3, 5],
    groups: { material: 20, supply: 6, coin: 14, weapon: 16, armor: 16, enhance: 12, cosmetic: 6, elixir: 14, blueprint: 16 },
    rarity: { common: 0, uncommon: 25, rare: 45, epic: 26, legendary: 4 },
    bpRarity: { common: 0, uncommon: 40, rare: 40, epic: 18, legendary: 2 },
  },
  box_legend: {
    id: 'box_legend', name: 'กล่องเพชร', rolls: [4, 6],
    groups: { material: 14, supply: 3, coin: 10, weapon: 22, armor: 20, enhance: 12, cosmetic: 6, elixir: 16, blueprint: 25 },
    rarity: { common: 0, uncommon: 0, rare: 30, epic: 50, legendary: 20 },
    bpRarity: { common: 0, uncommon: 0, rare: 35, epic: 45, legendary: 20 },
  },
};

const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function weighted<T extends string>(w: Record<T, number>): T {
  const total = Object.values<number>(w).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, v] of Object.entries<number>(w)) if (v > 0 && (r -= v) <= 0) return k as T;
  return Object.keys(w)[0] as T;
}

// ---------------- แปลน: กล่องทอง/กล่องเพชร (+ กล่องเหล็กเล็กน้อย ระดับ ดี/หายาก) ----------------

/** โอกาสที่แปลนที่สุ่มได้จะเป็นใบที่ "ยังไม่รู้" (ถ้ายังมีเหลือ) */
export const BP_UNKNOWN_FIRST = 0.7;
/** แปลนหลักช่วงต้นเกม เรียงตามความจำเป็น (ทั่ง ป้อมธนู ประตูหิน บ้านขั้น 2 …) — blueprints.ts เติมให้ · สุ่มได้แปลนระดับ "ดี" = สุ่มจาก 3 ใบแรกที่ยังไม่รู้ */
export const BP_CORE = new Set<string>();
export const BP_CORE_FIRST = 0.9;

/** แปลนระดับนั้น — ถ้าไม่มี ขยับไประดับที่ใกล้ที่สุด (ลงก่อนแล้วขึ้น) */
export function bpPool(entries: LootEntry[], rarity: Rarity): LootEntry[] {
  const i = ORDER.indexOf(rarity);
  for (let d = 0; d < ORDER.length; d++) {
    for (const k of d ? [i - d, i + d] : [i]) {
      const pool = k >= 0 && k < ORDER.length ? entries.filter((e) => e.rarity === ORDER[k]) : [];
      if (pool.length) return pool;
    }
  }
  return [];
}

function pickBlueprint(box: BoxDef, learned?: ReadonlySet<string>): LootEntry | null {
  const all = LOOT_GROUPS.blueprint.entries;
  const unknown = learned ? all.filter((e) => !e.key || !learned.has(e.key)) : all;
  const src = unknown.length && unknown.length < all.length && Math.random() < BP_UNKNOWN_FIRST ? unknown : all;
  const rarity = weighted(box.bpRarity ?? box.rarity);
  if (rarity === 'uncommon' && learned && Math.random() < BP_CORE_FIRST) {
    const next = [...BP_CORE].filter((k) => !learned.has(k)).slice(0, 3);
    const core = all.filter((e) => e.key && next.includes(e.key));
    if (core.length) return core[Math.floor(Math.random() * core.length)];
  }
  const pool = bpPool(src, rarity);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}

/** ราคากล่องที่พ่อค้ากลาง (เพชร) */
export const LEGEND_BOX_GEMS = 12;
export const GOLD_BOX_GEMS = 4;

/** บอสดันเจี้ยนตามชั้น → กล่องที่ได้ (ทุกครั้งที่ล้ม — บอสเกิดใหม่ทุกวัน) */
export const DUNGEON_BOSS_BOXES: Record<number, BoxTier[]> = { 1: ['box_gold'], 2: ['box_gold', 'box_gold'], 3: ['box_legend', 'box_gold'] };

/** หีบสมบัติบนเกาะ (อยู่ในเขตผจญภัยเสมอ): เกาะมหาสมบัติ = เพชร 15% / ทอง 60% / เหล็ก · เกาะซากโบราณ/หมอกผี = เพชร 5% / ทอง 45% / เหล็ก */
export const RUIN_CHEST_ODDS: Record<'ruins' | 'special', Partial<Record<BoxTier, number>>> = {
  ruins: { box_legend: 0.05, box_gold: 0.45, box_iron: 0.5 },
  special: { box_legend: 0.15, box_gold: 0.6, box_iron: 0.25 },
};

// ---------------- เพดานกล่องตามพื้นที่ (เกาะเรา = ของขั้นต่ำ · เขตผจญภัย = ของดี) ----------------

export const BOX_ORDER: BoxTier[] = ['box_wood', 'box_iron', 'box_gold', 'box_legend'];
/** ขยับกล่องขึ้น n ขั้น (สูงสุดกล่องเพชร) */
export const boxStep = (t: BoxTier, n = 1): BoxTier => BOX_ORDER[Math.min(BOX_ORDER.length - 1, BOX_ORDER.indexOf(t) + n)];
/** ไม่ให้เกิน cap */
export const minBox = (t: BoxTier, cap: BoxTier): BoxTier => (BOX_ORDER.indexOf(t) > BOX_ORDER.indexOf(cap) ? cap : t);

/** แหล่งกล่อง — boss = บอสดันเจี้ยน/บอสคืนภัยพิบัติ (ข้อยกเว้นบนเกาะเรา) */
export type BoxSource = 'mob' | 'boss' | 'chest' | 'hazard' | 'disaster' | 'daily' | 'fish' | 'rival';
/** home = เกาะเรา + ดันเจี้ยน + ทะเลในช่องเกาะเรา · adventure = เกาะอื่นทุกเกาะ (ยกเว้นเกาะกลาง) · neutral = เกาะกลาง/ทะเลเปิด */
export type LootZone = 'home' | 'adventure' | 'neutral';

/** เกาะเรา: กล่องไม้เท่านั้น · บอส (ดันเจี้ยน/คืนบอส) ได้ถึงกล่องเหล็ก */
export const HOME_BOX_CAP: BoxTier = 'box_wood';
export const HOME_BOSS_BOX_CAP: BoxTier = 'box_iron';
/** โบนัสเขตผจญภัย */
export const ADVENTURE_LOOT = {
  /** มอน: ไม่ได้กล่อง → ลุ้นซ้ำอีก 1 รอบ (≈ โอกาส ×2) */
  mobRerolls: 1,
  /** มอน: กล่องที่ได้มีโอกาสขยับขึ้น 1 ขั้น (ไม้→เหล็ก→ทอง→เพชร) */
  mobUpgrade: 0.25,
  /** รอดภัยกลางวัน: กล่อง +1 ขั้น */
  hazardStep: 1,
  /** สัตว์ในตำนาน: โอกาสกล่องเพชร ×2.5 (20% → 50%) */
  legendBoxMult: 2.5,
};

/**
 * เพดานกล่อง (ฟังก์ชันเดียวที่ทุกแหล่งกล่องบนแผนที่ต้องผ่าน — ดู GameScene.capBox)
 * home → ไม้ (บอส → ไม่เกินเหล็ก) · adventure → ไม่จำกัด + โบนัส · neutral → ตามเดิม
 */
export function capBoxTier(tier: BoxTier, source: BoxSource, zone: LootZone, rnd: () => number = Math.random): BoxTier {
  if (zone === 'home') return minBox(tier, source === 'boss' ? HOME_BOSS_BOX_CAP : HOME_BOX_CAP);
  if (zone === 'adventure') {
    if (source === 'mob' && rnd() < ADVENTURE_LOOT.mobUpgrade) return boxStep(tier);
    if (source === 'hazard') return boxStep(tier, ADVENTURE_LOOT.hazardStep);
  }
  return tier;
}
export const isBoxTier = (id: string): id is BoxTier => (BOX_ORDER as string[]).includes(id);
export function ruinChestBox(special: boolean): BoxTier {
  const odds = RUIN_CHEST_ODDS[special ? 'special' : 'ruins'];
  let r = Math.random();
  for (const [t, p] of Object.entries(odds) as [BoxTier, number][]) if ((r -= p) < 0) return t;
  return 'box_iron';
}

/** เปิดกล่อง → รายการของ (พร้อมความหายาก) · learned = คีย์แปลนที่รู้แล้ว (แปลนใบใหม่ออกง่ายกว่า) */
export function rollBox(tier: BoxTier, learned?: ReadonlySet<string>): { item: string; qty: number; rarity: Rarity }[] {
  const box = BOXES[tier];
  const n = box.rolls[0] + Math.floor(Math.random() * (box.rolls[1] - box.rolls[0] + 1));
  const out: { item: string; qty: number; rarity: Rarity }[] = [];
  for (let i = 0; i < n; i++) {
    const gname = weighted(box.groups);
    if (gname === 'blueprint') {
      const bp = pickBlueprint(box, learned);
      if (bp) {
        out.push({ item: bp.item, qty: 1, rarity: bp.rarity });
        continue;
      }
    }
    const group = LOOT_GROUPS[gname];
    let rarity = weighted(box.rarity);
    // ถ้ากลุ่มไม่มีของระดับนั้น ลดลงทีละขั้นจนกว่าจะเจอ
    let pool = group.entries.filter((e) => e.rarity === rarity);
    for (let k = ORDER.indexOf(rarity); !pool.length && k > 0; k--) {
      rarity = ORDER[k - 1];
      pool = group.entries.filter((e) => e.rarity === rarity);
    }
    if (!pool.length) pool = LOOT_GROUPS.coin.entries.filter((e) => e.rarity === 'common');
    const e = pool[Math.floor(Math.random() * pool.length)];
    out.push({ item: e.item, qty: e.qty[0] + Math.floor(Math.random() * (e.qty[1] - e.qty[0] + 1)), rarity: e.rarity });
  }
  return out;
}

/** โอกาสดรอปกล่องจากมอนสเตอร์ (ต่อการฆ่า 1 ตัว) — บอสได้กล่องแน่นอน */
export function mobBoxDrop(mobXp: number, boss: boolean): BoxTier | null {
  if (boss) return mobXp >= 700 ? 'box_legend' : 'box_gold';
  const r = Math.random();
  if (mobXp >= 20) return r < 0.04 ? 'box_gold' : r < 0.2 ? 'box_iron' : r < 0.45 ? 'box_wood' : null;
  if (mobXp >= 8) return r < 0.01 ? 'box_gold' : r < 0.06 ? 'box_iron' : r < 0.2 ? 'box_wood' : null;
  return r < 0.02 ? 'box_iron' : r < 0.08 ? 'box_wood' : null;
}

// ---------------- เลเวลไอเทม (อัพเกรด 10 ระดับ — ดู data/upgrade.ts) ----------------

/** plus สูงสุด (= Lv.10) */
export const MAX_PLUS = MAX_LEVEL - 1;
/** ตัวคูณพลังตามเลเวลไอเทม (plus = เลเวล − 1) → +15%/เลเวล */
export const plusMult = (plus = 0) => itemLevelMult(1 + Math.max(0, Math.min(MAX_PLUS, plus)));
