import { Wallet } from '../../components/Wallet';
import { BUILD, BUILDABLES, CATEGORY_NAMES, type BuildCategory, type BuildDef } from '../../data/buildables';
import { DISASTERS } from '../../data/disasters';
import { itemSources } from '../../data/encyclopedia';
import { EQUIP_SLOTS, STAT_INFO, STAT_KEYS, TRAIN_CAP, gearMult, statLine, type GearKind, type Stats } from '../../data/equipment';
import { BIOMES, type Biome } from '../../data/islands';
import { ITEMS, ITEM_LIST, type ItemDef, type WeaponEffect } from '../../data/items';
import { BOXES, LOOT_GROUPS, RARITY, mobBoxDrop, type BoxTier, type Rarity } from '../../data/loot';
import { BAND_INFO, BUILD_LEVEL, MAX_LEVEL, UP_BANDS, UP_CATEGORY_NAMES, VEHICLE_LEVEL, bandOf, itemLevelMult, upCategoryOfBuild, upCategoryOfItem, type UpBand, type UpCategory } from '../../data/upgrade';
import { bandName, buildUpgradeCost, costText, itemStatAt, itemUpgradeCost } from '../../systems/upgradeCosts';
import { MOBS, baseMobs, mobFlies, mobSwims, type BeastMove, type MobAI, type MobDef } from '../../data/mobs';
import { RECIPES, STATION_NAMES, type Recipe } from '../../data/recipes';
import { VEHICLE_KIND_NAME, vehicleKind } from '../../data/vehicles';
import { SPECIAL_TEXT, THROW_TEXT, WEAPON_CLASSES, statusText } from '../../data/weapons';
import { MarketSystem } from '../../systems/MarketSystem';
import { DUNGEON_MOBS } from '../../world/Interiors';
import { BLUEPRINT_ITEM, BLUEPRINT_KEY, BLUEPRINT_UNLOCK, blueprintSource } from '../../data/blueprints';
import { ADVENTURE_LOOT, DUNGEON_BOSS_BOXES, GOLD_BOX_GEMS, HOME_BOSS_BOX_CAP, HOME_BOX_CAP, LEGEND_BOX_GEMS, RUIN_CHEST_ODDS, bpPool, capBoxTier } from '../../data/loot';
import { RIVAL, RIVAL_LOOT } from '../../data/rivals';
import { isHiddenRecipe, isPart, rawCost, rawCostOfBuild } from '../../systems/CraftingSystem';

/**
 * ข้อมูลหน้า "คลังข้อมูล & ร้านค้า" — สร้างจากข้อมูลเกมจริงทั้งหมด (ไม่ผูกกับ Phaser)
 * แต่ละรายการ = การ์ด 1 ใบ + บล็อกรายละเอียดฝั่งขวา
 */

export interface SpriteRef {
  key: string;
  frame?: number;
  anim?: string;
  tint?: number;
  alpha?: number;
}

/** บล็อกเนื้อหาในแผงรายละเอียด */
export type Block =
  | { k: 'text'; text: string; color?: string; size?: number }
  | { k: 'section'; title: string; color?: string }
  | { k: 'stats'; items: [string, string][] }
  | { k: 'station'; station: string; icon?: SpriteRef; note?: string }
  | { k: 'mat'; item: string; qty: number; src: string }
  | { k: 'row'; icon?: SpriteRef; text: string; sub?: string; color?: string; right?: string; rightIcon?: string }
  | { k: 'bars'; rows: { label: string; pct: number; color: number; right?: string }[] }
  | { k: 'icons'; items: { icon: SpriteRef; label?: string; art?: string; band?: UpBand | null }[] };

export interface Entry {
  id: string;
  name: string;
  rarity: Rarity;
  /** ป้ายใต้ชื่อในหัวรายละเอียด (แทนชื่อความหายาก ถ้ามี) */
  tag?: string;
  sprite: SpriteRef;
  /** รูปเสริมข้างรูปหลัก (เรือแนวตั้ง) */
  sprite2?: SpriteRef;
  /** ป้ายมุมการ์ด */
  badge?: string;
  /** ราคาบนการ์ด (ร้านค้า) */
  price?: { icon: 'i_coin' | 'i_gem'; text: string };
  group: string;
  /** การ์ดเด่น (เทพ/บอส) — เรืองแสงทอง */
  featured?: boolean;
  /** การ์ดคำอธิบายระบบ */
  info?: boolean;
  /** บรรทัดสรุปสั้นในหัวรายละเอียด */
  quick: string[];
  blocks: Block[];
  /** id ภาพวาดรายไอเทม (ถ้าไม่ตรงกับ id ของการ์ด เช่น buy_wood → wood) */
  art?: string;
  /** ภาพฉาก (ART เช่น market_island) แทนภาพไอเทม — ใช้กับการ์ดคำอธิบาย/ของที่ไม่ใช่ไอเทม */
  sceneArt?: string;
}

export interface TabDef {
  id: string;
  label: string;
  title: string;
  filters?: { id: string; label: string }[];
  entries: () => Entry[];
}

// ---------------------------------------------------------------- ตัวช่วย

const rar = (d: ItemDef): Rarity => d.rarity ?? 'common';
const itemSprite = (id: string): SpriteRef => ({ key: ITEMS[id]?.icon ?? 'px' });
const buildSprite = (b: BuildDef): SpriteRef => ({ key: b.texture, frame: b.frame, anim: b.anim });
const pct = (p: number) => (p >= 0.1 ? `${+(p * 100).toFixed(p >= 0.995 ? 0 : 1)}%` : `${+(p * 100).toFixed(2)}%`);
const cut = (s: string, n = 96) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const TIERS = Object.keys(BOXES) as BoxTier[];

/** แหล่งที่มาแบบสั้น (ไม่รวมกล่อง ถ้ามีทางอื่น) สำหรับบรรทัดใต้วัตถุดิบ */
export function shortSource(id: string): string {
  const all = itemSources(id);
  const main = all.filter((s) => !s.startsWith('🎁'));
  const pick = (main.length ? main : all).slice(0, 2).map((s) => cut(s, 70));
  const shop = marketInfo().buy.get(id);
  if (shop && pick.length < 2) pick.push(`🛒 พ่อค้ากลางขาย (บางวัน)`);
  return cut(pick.join(' · '), 110);
}

/** โอกาสได้ไอเทมจากกล่องแต่ละระดับ: ต่อ 1 ชิ้นที่สุ่ม และต่อ 1 กล่อง (คิดตาม rollBox จริง รวมการลดระดับเมื่อกลุ่มไม่มีของ) */
export function boxChances(item: string): { tier: BoxTier; perRoll: number; perBox: number }[] {
  const out: { tier: BoxTier; perRoll: number; perBox: number }[] = [];
  for (const tier of TIERS) {
    const box = BOXES[tier];
    const G = Object.values<number>(box.groups).reduce((a, b) => a + b, 0);
    const RW = Object.values<number>(box.rarity).reduce((a, b) => a + b, 0);
    let p = 0;
    for (const [gname, gw] of Object.entries<number>(box.groups)) {
      const group = LOOT_GROUPS[gname];
      if (!group || !gw) continue;
      // แปลน: ตารางความหายากของแปลนแยกต่อกล่อง (คิดแบบยังไม่รู้แปลนใบไหนเลย)
      const isBp = gname === 'blueprint' && !!box.bpRarity;
      const rTable = isBp ? box.bpRarity! : box.rarity;
      const rTotal = Object.values<number>(rTable).reduce((a, b) => a + b, 0);
      for (const r of ORDER) {
        const rw = rTable[r];
        if (!rw) continue;
        let pool = isBp ? bpPool(group.entries, r) : group.entries.filter((e) => e.rarity === r);
        for (let k = ORDER.indexOf(r); !pool.length && k > 0; k--) pool = group.entries.filter((e) => e.rarity === ORDER[k - 1]);
        if (!pool.length) pool = LOOT_GROUPS.coin.entries.filter((e) => e.rarity === 'common');
        const hit = pool.filter((e) => e.item === item).length;
        if (hit) p += (gw / G) * (rw / (isBp ? rTotal : RW)) * (hit / pool.length);
      }
    }
    if (p <= 0) continue;
    // โอกาสต่อกล่อง = เฉลี่ยตามจำนวนชิ้นที่สุ่มได้
    let perBox = 0;
    const n = box.rolls[1] - box.rolls[0] + 1;
    for (let k = box.rolls[0]; k <= box.rolls[1]; k++) perBox += (1 - (1 - p) ** k) / n;
    out.push({ tier, perRoll: p, perBox });
  }
  return out;
}

const boxBars = (item: string): Block | null => {
  const ch = boxChances(item);
  if (!ch.length) return null;
  return {
    k: 'bars',
    rows: ch.map((c) => ({ label: BOXES[c.tier].name, pct: c.perBox, color: RARITY[rar(ITEMS[c.tier])].hex, right: `≈${pct(c.perBox)}/กล่อง` })),
  };
};

/** โอกาสดรอปกล่องจากมอนสเตอร์ — สุ่มจำลองด้วย mobBoxDrop จริง (แคชตาม xp) */
const dropCache = new Map<string, Partial<Record<BoxTier, number>>>();
export function mobBoxOdds(m: MobDef): Partial<Record<BoxTier, number>> {
  const boss = m.ai === 'boss';
  const key = `${m.xp}|${boss}`;
  const hit = dropCache.get(key);
  if (hit) return hit;
  const N = boss ? 1 : 20000;
  const acc: Partial<Record<BoxTier, number>> = {};
  for (let i = 0; i < N; i++) {
    const t = mobBoxDrop(m.xp, boss);
    if (t) acc[t] = (acc[t] ?? 0) + 1 / N;
  }
  dropCache.set(key, acc);
  return acc;
}

/** ราคาตลาดพ่อค้ากลาง — จำลอง MarketSystem.refresh หลายวัน แล้วรวบรวมช่วงราคา (ไม่ hardcode รายการ) */
interface PriceInfo { qty: number; min: number; max: number }
let market: { buy: Map<string, PriceInfo>; sell: Map<string, PriceInfo> } | null = null;
export function marketInfo() {
  if (market) return market;
  const m = new MarketSystem();
  const buy = new Map<string, PriceInfo>();
  const sell = new Map<string, PriceInfo>();
  const acc = (map: Map<string, PriceInfo>, item: string, qty: number, price: number) => {
    const p = map.get(item);
    if (!p) map.set(item, { qty, min: price, max: price });
    else {
      p.min = Math.min(p.min, price);
      p.max = Math.max(p.max, price);
    }
  };
  for (let day = 1; day <= 240; day++) {
    m.refresh(1234567, day);
    for (const o of m.buy) acc(buy, o.item, o.qty, o.price);
    for (const o of m.sell) if (!o.hot) acc(sell, o.item, o.qty, o.price);
  }
  market = { buy, sell };
  return market;
}

/** ราคาซื้อเพชรที่พ่อค้ากลาง (ตรงกับหน้าต่างพ่อค้าใน UIScene) · ราคากล่องทอง/เพชร อยู่ใน loot.ts */
const GEM_BUY = Wallet.GEM_RATE + 30;
const BOX_GEMS: Partial<Record<BoxTier, number>> = { box_gold: GOLD_BOX_GEMS, box_legend: LEGEND_BOX_GEMS };

/** แปลน: โอกาสได้แปลนต่อ 1 ชิ้นที่สุ่ม และ "อย่างน้อย 1 ใบ" ต่อกล่อง (คิดจาก rolls จริง) */
export function blueprintOdds(t: BoxTier): { perDraw: number; atLeastOne: number } {
  const box = BOXES[t];
  const G = Object.values<number>(box.groups).reduce((a, b) => a + b, 0);
  const p = (box.groups.blueprint ?? 0) / G;
  let atLeastOne = 0;
  const n = box.rolls[1] - box.rolls[0] + 1;
  for (let k = box.rolls[0]; k <= box.rolls[1]; k++) atLeastOne += (1 - (1 - p) ** k) / n;
  return { perDraw: p, atLeastOne };
}

/** บล็อก "ต้องมีแปลน" (แปลนขั้นสูงต้องสุ่มจากกล่องทอง/เพชร) */
function needBlueprint(key: string): Block[] {
  const id = BLUEPRINT_ITEM.get(key);
  if (!id) return [{ k: 'text', text: '📐 แปลนพื้นฐาน — รู้ตั้งแต่เริ่มเกม', size: 12, color: '#a7f070' }];
  return [{ k: 'row', icon: itemSprite(id), text: '📐 ต้องมีแปลนก่อน', sub: `สุ่มได้จาก${blueprintSource(key)}`, color: RARITY[rar(ITEMS[id])].color }];
}

/** สถานีคราฟต์ → ไอคอนจากสิ่งก่อสร้างที่เป็นสถานีนั้น */
const stationBuild = (station: string) => BUILDABLES.find((b) => b.station === station);

/** บล็อก "วิธีสร้าง / ต้องใช้" ของไอเทม */
function recipeBlocks(id: string): Block[] {
  const def = ITEMS[id];
  const out: Block[] = [{ k: 'section', title: '🔨 วิธีสร้าง / ต้องใช้' }];
  const recipes = RECIPES.filter((r) => r.output.item === id && !isHiddenRecipe(r));
  if (recipes.length) out.push(...needBlueprint(`i:${id}`));
  recipes.forEach((r: Recipe, i) => {
    const sb = stationBuild(r.station);
    const note = sb ? `ต้องมี${sb.name}บนเกาะ (ไม่ต้องยืนใกล้): ${rawCostOfBuild(sb.cost).map(([it, n]) => `${ITEMS[it].name}×${n}`).join(' + ')}` : 'คราฟต์ได้ทุกที่ ไม่ต้องใช้สถานี';
    out.push({ k: 'station', station: `${recipes.length > 1 ? `สูตร ${i + 1} · ` : ''}${STATION_NAMES[r.station]}${r.output.qty > 1 ? `  → ได้ ×${r.output.qty}` : ''}`, icon: sb ? buildSprite(sb) : undefined, note });
    for (const [it, n] of rawCost(r.inputs.map((x) => [x.item, x.qty] as [string, number]))) out.push({ k: 'mat', item: it, qty: n, src: shortSource(it) });
  });
  if (recipes.length) out.push({ k: 'text', text: '🧩 แปลนใช้ของดิบ — ถ้ามีชิ้นส่วน (เชือก ไม้กระดาน แท่งเหล็ก …) ในกระเป๋าจะใช้ก่อน', size: 11, color: '#a9bccb' });
  if (isPart(id) && !recipes.length) {
    const makers = BUILDABLES.filter((b) => b.prod?.recipes.some((pr) => pr.out.some(([o]) => o === id))).map((b) => b.name);
    out.push({ k: 'text', text: '🧩 ชิ้นส่วนกลาง — ไม่ต้องทำเอง: แปลนทุกใบแตกเป็นของดิบให้ (ถ้ามีในกระเป๋าจะถูกใช้ก่อน)', size: 12, color: '#73eff7' });
    if (makers.length) out.push({ k: 'text', text: `🏭 ผลิตอัตโนมัติได้จาก: ${makers.join(', ')}`, size: 12, color: '#d6e4ee' });
  }
  const chances = boxChances(id);
  const other = itemSources(id).filter((s) => !s.startsWith('🔨') && !s.startsWith('🎁'));
  if (!recipes.length && !isPart(id)) {
    if (chances.length && !other.length) {
      out.push({ k: 'text', text: '🎁 คราฟต์ไม่ได้ — สุ่มได้จากกล่องดรอปเท่านั้น', color: RARITY.legendary.color });
      out.push({ k: 'text', text: `กล่องที่มีโอกาสได้: ${chances.map((c) => BOXES[c.tier].name).join(', ')}`, color: '#a9bccb', size: 12 });
    } else {
      out.push({ k: 'text', text: 'คราฟต์ไม่ได้ — ต้องหาจากแหล่งด้านล่าง', color: '#a9bccb', size: 12 });
    }
  }
  const shop = marketInfo().buy.get(id);
  if (other.length || shop) {
    out.push({ k: 'section', title: '📍 หาได้จาก' });
    for (const s of other) out.push({ k: 'text', text: cut(s, 140), size: 12, color: '#d6e4ee' });
    if (shop) out.push({ k: 'row', icon: { key: 'merchant' }, text: `พ่อค้ากลางขาย ×${shop.qty} (สุ่มบางวัน)`, right: range(shop.min, shop.max), rightIcon: 'i_coin' });
  }
  const bars = boxBars(id);
  if (bars) {
    out.push({ k: 'section', title: '🎁 โอกาสสุ่มได้จากกล่อง' });
    out.push(bars);
  }
  if (def.value) {
    const sell = marketInfo().sell.get(id);
    if (sell) out.push({ k: 'row', icon: { key: 'i_coin' }, text: `พ่อค้ารับซื้อ ×${sell.qty}`, right: range(sell.min, sell.max), rightIcon: 'i_coin', color: '#ffcd75' });
  }
  return out;
}

const statChips = (s: Partial<Stats>, mult = 1): [string, string][] =>
  STAT_KEYS.filter((k) => s[k]).map((k) => [STAT_INFO[k].name, STAT_INFO[k].fmt(s[k]! * (k === 'bag' ? 1 : mult))]);

// ---------------------------------------------------------------- อัพเกรด 10 ระดับ (ใช้ร่วมทุกหมวด)

const LOOK_LVS = [1, 4, 7, 10];
const LOOK_ORDER = 'หน้าตา 4 แบบ: ปกติ (Lv1–3) → เสริมเหล็ก (Lv4–6) → ทองคำ (Lv7–9) → ตำนาน (Lv10 · เรืองแสง+ประกาย)';
/** รูป 4 โฉม (key@band — หน้าคลังข้อมูลสร้าง texture ให้ตอนแสดง) */
const lookIcons = (ref: SpriteRef, art: string): Block => ({
  k: 'icons', items: LOOK_LVS.map((lv) => {
    const b = bandOf(lv);
    return { icon: { key: b ? `${ref.key}@${b}` : ref.key, frame: ref.frame }, label: b ? BAND_INFO[b].name : 'ปกติ', art, band: b };
  }),
});
const bpText = (cat: UpCategory): Block => ({
  k: 'text', size: 12, color: '#a9bccb',
  text: `แปลนที่ต้องมี: Lv2–3 ไม่ต้องใช้ · ${UP_BANDS.map((b) => `${BAND_INFO[b].range} = แปลนอัพเกรด${UP_CATEGORY_NAMES[cat]}·${BAND_INFO[b].name}`).join(' · ')} (สุ่มจากกล่องทอง/เพชร)`,
});

function upgradeItemBlocks(d: ItemDef): Block[] {
  const cat = upCategoryOfItem(d);
  if (!cat) return [];
  const c1 = itemUpgradeCost(d.id, 1);
  const c9 = itemUpgradeCost(d.id, MAX_LEVEL - 1);
  return [
    { k: 'section', title: '⬆ อัพเกรด 10 ระดับ (สำเร็จ 100%)', color: BAND_INFO.gold.css },
    { k: 'text', size: 12, color: '#a7f070', text: LOOK_LVS.map((lv) => `Lv${lv} ${bandName(lv)}: ${itemStatAt(d, lv)}`).join('\n') },
    lookIcons(itemSprite(d.id), d.id),
    { k: 'text', text: LOOK_ORDER, size: 11, color: '#d6e4ee' },
    bpText(cat),
    ...(c1 && c9 ? [{ k: 'text', size: 11, color: '#ffcd75', text: `ค่าอัพ Lv1→2: ${costText(c1)}\nค่าอัพ Lv9→10: ${costText(c9)}${d.equip || d.type === 'weapon' || d.type === 'ranged' || d.type === 'tool' ? ' · Lv4+ ต้องมีทั่งตีเหล็กบนเกาะ' : ''}` } as Block] : []),
  ];
}

/** ค่าสถานะสิ่งก่อสร้าง/ยานที่เลเวลหนึ่ง (บรรทัดสั้น) */
function buildStatAt(b: BuildDef, lv: number): string {
  if (b.boat) {
    const v = b.boat;
    return [`HP ${Math.round(v.hp * VEHICLE_LEVEL.hp(lv))}`, `ความเร็ว ${Math.round(v.speed * VEHICLE_LEVEL.speed(lv))}`, v.cargo ? `ช่องเก็บ ${Math.ceil(v.cargo * VEHICLE_LEVEL.cargo(lv) - 1e-6)}` : '', v.armor ? `เกราะ ${Math.round(VEHICLE_LEVEL.armor(v.armor, lv) * 100)}%` : '', v.fuel ? `กินน้ำมัน ×${VEHICLE_LEVEL.fuelUse(lv).toFixed(2)}` : ''].filter(Boolean).join(' · ');
  }
  const out = [`HP ${Math.round(b.hp * BUILD_LEVEL.hp(lv))}`];
  if (b.turret) out.push(`ดาเมจ ${+(b.turret.damage * BUILD_LEVEL.damage(lv)).toFixed(1)} · ยิงทุก ${(b.turret.cooldown * BUILD_LEVEL.cooldown(lv)).toFixed(2)} วิ`);
  if (b.trap) out.push(`ดาเมจกับดัก ×${BUILD_LEVEL.damage(lv).toFixed(2)}`);
  if (b.storage) out.push(`ช่องเก็บ ${Math.ceil(b.storage * BUILD_LEVEL.storage(lv) - 1e-6)}`);
  if (b.prod || b.miner) out.push(`ผลิตเร็ว ×${BUILD_LEVEL.production(lv).toFixed(1)}`);
  if (b.buff) out.push(`บัฟ ${statLine(b.buff, BUILD_LEVEL.buff(lv))}`);
  if (b.light) out.push(`แสง ${Math.round(b.light * BUILD_LEVEL.light(lv))}`);
  return out.join(' · ');
}

function upgradeBuildBlocks(b: BuildDef): Block[] {
  const cat = upCategoryOfBuild(b);
  if (!cat || b.layer === 'terrain') return [];
  const c1 = buildUpgradeCost(b, 1);
  const c9 = buildUpgradeCost(b, MAX_LEVEL - 1);
  return [
    { k: 'section', title: '⬆ อัพเกรด 10 ระดับ (สำเร็จ 100%)', color: BAND_INFO.gold.css },
    { k: 'text', size: 12, color: '#a7f070', text: LOOK_LVS.map((lv) => `Lv${lv} ${bandName(lv)}: ${buildStatAt(b, lv)}`).join('\n') },
    lookIcons({ key: b.texture, frame: b.frame }, b.id),
    { k: 'text', text: LOOK_ORDER, size: 11, color: '#d6e4ee' },
    bpText(cat),
    ...(c1 && c9 ? [{ k: 'text', size: 11, color: '#ffcd75', text: `ค่าอัพ Lv1→2: ${costText(c1)}\nค่าอัพ Lv9→10: ${costText(c9)}\nกด U (หรือปุ่ม ⬆ แถบบน) แล้วคลิกของชิ้นนั้น · อัพแล้วซ่อมเต็ม` } as Block] : []),
  ];
}

/** การ์ดคำอธิบายระบบอัพเกรด (แทนระบบตีบวกเดิม) */
function upgradeOverview(): Entry {
  const lvs = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
  const color = (lv: number) => { const b = bandOf(lv); return b ? BAND_INFO[b].color : 0xa7f070; };
  const blocks: Block[] = [
    { k: 'text', text: 'ทุกอย่างอัพเกรดได้ 10 ระดับ — อาวุธ เครื่องมือ อุปกรณ์สวมใส่ทั้ง 12 ช่อง สิ่งก่อสร้าง และยานพาหนะ · กดอัพแล้วเลเวล +1 ทันที ค่าสถานะเพิ่ม และเปลี่ยนโฉมใหม่ (สำเร็จ 100% ไม่มีแตก/ลดขั้น)' },
    { k: 'section', title: '✨ 4 โฉม' },
    { k: 'row', icon: { key: 'i_iron_sword' }, text: 'ปกติ · Lv1–3', sub: 'หน้าตาเดิม — Lv2–3 อัพได้เลยไม่ต้องมีแปลน' },
    ...UP_BANDS.map((b): Block => ({ k: 'row', icon: { key: `i_iron_sword@${b}` }, text: `${BAND_INFO[b].name} · ${BAND_INFO[b].range}`, color: BAND_INFO[b].css, sub: b === 'iron' ? 'ขอบเหล็ก + หมุด · ต้องมีแปลนอัพเกรดช่วงเหล็กของหมวดนั้น' : b === 'gold' ? 'ขอบทอง + ประกายเงา · ต้องมีแปลนอัพเกรดช่วงทอง' : 'ขอบม่วง-ฟ้า + เรืองแสง + ประกายระยิบ · ต้องมีแปลนอัพเกรดช่วงตำนาน' })),
    { k: 'section', title: '⚔ ไอเทม: ค่าสถานะ ×เลเวล (+15%/เลเวล)' },
    { k: 'bars', rows: lvs.map((lv) => ({ label: `Lv${lv}`, pct: itemLevelMult(lv) / itemLevelMult(MAX_LEVEL), color: color(lv), right: `×${itemLevelMult(lv).toFixed(2)}` })) },
    { k: 'text', size: 12, color: '#a9bccb', text: 'ความทนทาน +10%/เลเวล · อัพแล้วซ่อมเต็ม · Lv4 ขึ้นไปต้องมีทั่งตีเหล็กบนเกาะ · อัพได้จากหน้าต่างกระเป๋า (Tab) · ทั่งตีเหล็ก (E) · สมุดแปลน (B)' },
    { k: 'section', title: '🏠 สิ่งก่อสร้าง (Lv10)' },
    { k: 'stats', items: [['HP', `×${BUILD_LEVEL.hp(10).toFixed(1)}`], ['ดาเมจป้อม/กับดัก', `×${BUILD_LEVEL.damage(10).toFixed(2)}`], ['ระยะยิง', `×${BUILD_LEVEL.range(10).toFixed(2)}`], ['ยิงเร็ว', `เวลา ×${BUILD_LEVEL.cooldown(10).toFixed(2)}`], ['ช่องเก็บของ', `×${BUILD_LEVEL.storage(10).toFixed(1)}`], ['ผลิตเร็ว', `×${BUILD_LEVEL.production(10).toFixed(1)}`], ['บัฟฐาน', `×${BUILD_LEVEL.buff(10).toFixed(1)}`], ['แสง', `×${BUILD_LEVEL.light(10).toFixed(2)}`]] },
    { k: 'section', title: '⛵ ยานพาหนะ (Lv10)' },
    { k: 'stats', items: [['HP', `×${VEHICLE_LEVEL.hp(10).toFixed(1)}`], ['ความเร็ว', `×${VEHICLE_LEVEL.speed(10).toFixed(2)}`], ['กินน้ำมัน', `×${VEHICLE_LEVEL.fuelUse(10).toFixed(2)}`], ['ห้องเก็บของ', `×${VEHICLE_LEVEL.cargo(10).toFixed(1)}`], ['เกราะ', '+2%/เลเวล (สูงสุด 90%)']] },
    { k: 'text', size: 12, color: '#a9bccb', text: 'อัพสิ่งก่อสร้าง/ยาน: กด U (หรือปุ่ม ⬆ แถบบน) → ชี้ดูค่าอัพ → คลิก · มือถือ/จอย: หันหน้าเข้าหาแล้วกดปุ่มหลัก · เฉพาะของบนเกาะคุณ' },
    { k: 'section', title: '💰 ค่าอัพจาก Lv → Lv+1' },
    { k: 'text', size: 12, color: '#d6e4ee', text: 'วัตถุดิบดิบของแปลน × (0.4 + 0.25·Lv) + เหรียญ 20·Lv² × ความหายาก\n+ แร่ตามช่วง: Lv4–6 แร่เหล็ก · Lv7–9 แร่ทอง + หินตีบวก · Lv10 คริสตัล 5 + หินตีบวก 6 + อุกกาบาต 3' },
  ];
  return {
    id: '_upgrade_info', art: 'thunder_blade', name: 'ระบบอัพเกรด 10 ระดับ', rarity: 'legendary', tag: 'คำอธิบาย', sprite: { key: 'i_iron_sword@legend' }, group: 'enhance', info: true,
    quick: ['สำเร็จ 100% · Lv10 = ×2.35 · เปลี่ยนโฉมที่ Lv4/7/10'], blocks,
  };
}

// ---------------------------------------------------------------- 1. อาวุธ

const EFFECT_TEXT: Record<WeaponEffect, string> = {
  chain: '⚡ สายฟ้าลูกโซ่ — ฟันแล้วไฟฟ้ากระโดดไปหาศัตรูรอบตัว',
  burn: '🔥 เผาไหม้ — ศัตรูติดไฟเสียเลือดต่อเนื่อง',
  lifesteal: '🩸 ดูดเลือด — ฟื้น HP ตามดาเมจที่ทำ',
  multishot: '🏹 ยิงกระจาย — ยิงหลายดอกพร้อมกัน',
  explode: '💥 ระเบิดวงกว้าง — กระสุนระเบิดโดนศัตรูเป็นกลุ่ม',
  shockwave: '🌊 คลื่นกระแทก — ทุบพื้นกระแทกศัตรูรอบตัว',
};

function weaponEntry(d: ItemDef): Entry {
  const legend = !!d.effect || !!d.special || rar(d) === 'legendary';
  const blocks: Block[] = [{ k: 'text', text: d.desc }];
  const quick: string[] = [];
  const stats: [string, string][] = [];
  let group = 'tool';
  if (d.tool) {
    group = d.type === 'weapon' ? 'melee' : 'tool';
    quick.push(`ดาเมจ ${d.tool.damage} · ระยะ ${d.tool.range}`);
    stats.push(['ดาเมจ', `${d.tool.damage}`], ['ระยะ', `${d.tool.range}`], ['ตัดไม้', `×${d.tool.tree}`], ['ขุดหิน', `×${d.tool.rock}`], ['ความทนทาน', `${d.tool.durability}`]);
  }
  if (d.ranged) {
    group = 'ranged';
    const dps = d.ranged.damage / d.ranged.cooldown;
    quick.push(`ดาเมจ ${d.ranged.damage} · ${d.ranged.ammo ? `ใช้${ITEMS[d.ranged.ammo].name}` : 'ไม่ใช้กระสุน'}`);
    stats.push(['ดาเมจ', `${d.ranged.damage}`], ['ยิงทุก', `${d.ranged.cooldown} วิ`], ['DPS', dps.toFixed(1)], ['ความเร็วกระสุน', `${d.ranged.speed}`],
      ['กระสุน', d.ranged.ammo ? ITEMS[d.ranged.ammo].name : 'ไม่ใช้'], ['ความทนทาน', `${d.ranged.durability}`]);
    if (d.ranged.pierce) stats.push(['ทะลุ', 'ใช่']);
    if (d.ranged.mana) stats.push(['ร่ายเวท', `สแตมินา ${d.ranged.mana}/ครั้ง`]);
    if (d.special === 'bloodpact') stats.push(['ร่ายเวท', 'HP 2/ครั้ง']);
  }
  if (d.throw) {
    group = 'ranged';
    const kind = d.throw.kind ?? 'bomb';
    const area = d.throw.radius > 0 && !['knife', 'shuriken', 'javelin'].includes(kind);
    quick.push(area ? `ของขว้าง · ดาเมจ ${d.throw.damage} · รัศมี ${d.throw.radius}` : `ของขว้าง · ดาเมจ ${d.throw.damage}`);
    stats.push(['ดาเมจ', `${d.throw.damage}`]);
    if (area) stats.push(['รัศมี', `${d.throw.radius}`]);
    if (d.throw.dur) stats.push(['ค้างบนพื้น', `${d.throw.dur} วิ`]);
    if (d.throw.count) stats.push(['จำนวนลูก', `${d.throw.count}`]);
    stats.push(['ซ้อนได้', `${d.stack}`]);
    blocks.push({ k: 'text', text: THROW_TEXT[kind], size: 12, color: '#ffcd75' });
  }
  // ประเภทอาวุธ (ความเร็ว จำนวนเป้า คอมโบ เจาะเกราะ) + สถานะผิดปกติ
  if (d.weaponClass) {
    const c = WEAPON_CLASSES[d.weaponClass];
    quick.unshift(`${c.name}`);
    stats.unshift(['ประเภท', c.name], ['ความเร็วโจมตี', `×${c.speed}`], ['เป้าหมายสูงสุด', `${c.maxHits}`]);
    if (c.combo) stats.push(['คอมโบ', 'ใช่']);
    if (c.armorPierce) stats.push(['เจาะเกราะ', `${Math.round(c.armorPierce * 100)}%`]);
    blocks.push({ k: 'text', text: `🗡 ${c.name}: ${c.hint}`, size: 12, color: '#73eff7' });
  }
  if (d.critBonus) stats.push(['คริเพิ่ม', `+${d.critBonus}%`]);
  if (d.chain) stats.push(['สายฟ้ากระโดด', `${d.chain} ตัว`]);
  if (d.ranged?.pellets && d.ranged.pellets > 1) stats.push(['ลูกปราย', `${d.ranged.pellets} นัด`]);
  if (d.ranged?.returns) stats.push(['บินกลับ', 'ใช่ (โดน 2 รอบ)']);
  const statuses = [...(d.status ?? []), ...(d.weaponClass && WEAPON_CLASSES[d.weaponClass].status ? [WEAPON_CLASSES[d.weaponClass].status!] : [])];
  if (statuses.length) blocks.push({ k: 'text', text: `สถานะผิดปกติ: ${statuses.map(statusText).join(' · ')}`, size: 12, color: '#ef7d57' });
  if (d.type === 'ammo') {
    group = 'ammo';
    const users = ITEM_LIST.filter((x) => x.ranged?.ammo === d.id).map((x) => x.name);
    quick.push(`ใช้กับ: ${users.join(', ')}`);
    stats.push(['ซ้อนได้', `${d.stack}`]);
  }
  if (d.type === 'light' && d.light) {
    quick.push(`แสงรัศมี ${d.light.radius}`);
    stats.push(['รัศมีแสง', `${d.light.radius}`], ['อายุ', `${d.light.durability} วิ`]);
  }
  if (d.type === 'rod') quick.push('ถือแล้วกด E ริมน้ำ');
  if (legend) group = 'legend';
  if (stats.length) blocks.push({ k: 'section', title: '📊 ค่าสถานะ' }, { k: 'stats', items: stats });
  if (d.effect || d.special) {
    blocks.push({ k: 'section', title: '✨ พลังพิเศษอาวุธเทพ', color: RARITY.legendary.color });
    if (d.effect) blocks.push({ k: 'text', text: EFFECT_TEXT[d.effect], color: RARITY.legendary.color });
    if (d.special) blocks.push({ k: 'text', text: SPECIAL_TEXT[d.special], color: RARITY.legendary.color });
  }
  blocks.push(...upgradeItemBlocks(d));
  blocks.push(...recipeBlocks(d.id));
  return {
    id: d.id, name: d.name, rarity: rar(d), sprite: itemSprite(d.id), group, featured: legend,
    badge: legend ? 'เทพ' : undefined, quick, blocks,
  };
}

function weaponEntries(): Entry[] {
  const list = ITEM_LIST.filter((d) => (d.type === 'weapon' || d.type === 'ranged' || d.type === 'throw' || d.type === 'ammo' || d.type === 'tool' || d.type === 'rod' || d.type === 'light'));
  const order = ['legend', 'melee', 'ranged', 'ammo', 'tool'];
  return list.map(weaponEntry).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

// ---------------------------------------------------------------- 2. อุปกรณ์สวมใส่

const GEAR_ORDER: GearKind[] = ['head', 'body', 'legs', 'feet', 'hands', 'back', 'neck', 'ring', 'offhand', 'bag'];
const gearName = (k: GearKind) => (k === 'ring' ? 'แหวน' : EQUIP_SLOTS.find((s) => s.id === k)?.name ?? k);
const gearHint = (k: GearKind) => EQUIP_SLOTS.find((s) => s.id === (k === 'ring' ? 'ring1' : k))?.hint ?? '';

function gearOverview(): Entry {
  const buffs = BUILDABLES.filter((b) => b.buff);
  const blocks: Block[] = [
    { k: 'text', text: 'ความเก่งของตัวละครมาจาก 4 อย่าง:' },
    { k: 'row', icon: { key: 'i_elixir_hp' }, text: '0) เลเวล (ฆ่ามอน/ฟาร์ม/สร้าง ได้ XP)', sub: 'เลเวลละ HP +5 · สแตมินา +2 · โจมตี +1% · ป้องกัน +0.3 — ตายแล้วเลเวลลด 1' },
    { k: 'row', icon: { key: 'i_iron_armor' }, text: '1) อุปกรณ์ที่สวมใส่ + อัพเกรด 10 ระดับ', sub: `ใส่ได้ ${EQUIP_SLOTS.length} ช่อง · อัพเกรดเพิ่มค่าสถานะ +${Math.round((gearMult(1) - 1) * 100)}%/เลเวล (Lv${MAX_LEVEL} ×${itemLevelMult(MAX_LEVEL).toFixed(2)}) สำเร็จ 100%` },
    { k: 'row', icon: buildSprite(BUILD.cabin), text: '2) บัฟถาวรจากสิ่งก่อสร้างในฐาน', sub: 'ยิ่งสร้างฐานครบ ยิ่งเก่ง (แต่ละอย่างนับได้จำกัดจำนวน)' },
    { k: 'row', icon: { key: 'i_elixir_atk' }, text: '3) ผลึกพลัง (สุ่มจากกล่องดรอป)', sub: 'กด F ใช้ — เพิ่มค่าพลังถาวร มีเพดาน' },
    { k: 'section', title: '🧍 ช่องสวมใส่' },
    ...EQUIP_SLOTS.map((s): Block => ({ k: 'text', text: `• ${s.name} — ${s.hint}`, size: 12, color: '#d6e4ee' })),
    { k: 'section', title: '⬆ อัพเกรด 10 ระดับ (แทนตีบวก · สำเร็จ 100%)' },
    { k: 'bars', rows: Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lv) => ({ label: `Lv${lv}`, pct: itemLevelMult(lv) / itemLevelMult(MAX_LEVEL), color: bandOf(lv) ? BAND_INFO[bandOf(lv)!].color : 0xa7f070, right: `×${itemLevelMult(lv).toFixed(2)} ${bandName(lv)}` })) },
    { k: 'section', title: '🏠 บัฟจากฐาน' },
    ...buffs.map((b): Block => ({ k: 'row', icon: buildSprite(b), text: b.name, sub: `${statLine(b.buff!)} · นับสูงสุด ${b.buffMax} หลัง` })),
    { k: 'section', title: '✦ เพดานผลึกพลัง' },
    { k: 'stats', items: statChips(TRAIN_CAP) },
  ];
  return {
    id: '_gear_info', sceneArt: 'cat_gear', name: 'ระบบพลัง & เลเวล', rarity: 'legendary', tag: 'คำอธิบาย', sprite: { key: 'i_iron_armor' }, group: '_info', info: true,
    quick: ['พลัง = อุปกรณ์ + บัฟฐาน + ผลึกพลัง'], blocks,
  };
}

function gearEntry(d: ItemDef): Entry {
  const e = d.equip!;
  const blocks: Block[] = [
    { k: 'text', text: d.desc },
    { k: 'text', text: `สวมที่ช่อง: ${e.slot === 'ring' ? 'แหวน (ใส่ได้ 2 วง)' : gearName(e.slot)} — ${gearHint(e.slot)}`, size: 12, color: '#a9bccb' },
    { k: 'section', title: '📊 ค่าสถานะ' },
    { k: 'stats', items: [...statChips(e.stats), ...(e.durability ? [['ความทนทาน', `${e.durability}`] as [string, string]] : []), ...(e.warm ? [['อบอุ่น', 'ใช่'] as [string, string]] : [])] },
  ];
  blocks.push(...upgradeItemBlocks(d));
  if (e.look) blocks.push({ k: 'text', text: '👕 สวมแล้วเปลี่ยนลุคตัวละครด้วย', size: 12, color: '#a9bccb' });
  blocks.push(...recipeBlocks(d.id));
  return {
    id: d.id, name: d.name, rarity: rar(d), sprite: itemSprite(d.id), group: e.slot, featured: rar(d) === 'legendary',
    badge: gearName(e.slot), quick: [statLine(e.stats)], blocks,
  };
}

function gearEntries(): Entry[] {
  const list = ITEM_LIST.filter((d) => d.equip).sort((a, b) => GEAR_ORDER.indexOf(a.equip!.slot) - GEAR_ORDER.indexOf(b.equip!.slot) || a.value - b.value);
  return [gearOverview(), ...list.map(gearEntry)];
}

// ---------------------------------------------------------------- 3-5. สิ่งก่อสร้าง / เรือ / เครื่องจักร

const LAYER_NAME: Record<string, string> = { terrain: 'เปลี่ยนพื้นดิน', floor: 'พื้น (วางของทับได้)', object: 'วัตถุตั้งพื้น', boat: 'วางบนน้ำ' };
const BLOCK_NAME: Record<string, string> = { all: 'ขวางทุกอย่าง', mobs: 'ขวางเฉพาะศัตรู', none: 'เดินผ่านได้' };
const POWER_TEXT: Record<string, string> = {
  gen: '⚡ เครื่องปั่นไฟ — เติมเชื้อเพลิง (น้ำมัน/ถ่านหิน/ไม้ กด E) แล้วจ่ายไฟให้สิ่งก่อสร้างรอบๆ',
  wind: '🌬 จ่ายไฟฟรีตลอดเวลา ไม่ต้องเติมเชื้อเพลิง',
  use: '🔌 ต้องใช้ไฟ — วางในรัศมีเครื่องปั่นไฟหรือกังหันลม',
};

function costBlocks(b: BuildDef): Block[] {
  const out: Block[] = [{ k: 'section', title: '🔨 วิธีสร้าง / ต้องใช้' }];
  out.push({ k: 'station', station: `โหมดสร้าง (B) → หมวด${CATEGORY_NAMES[b.category]}`, note: b.anywhere ? 'วางนอกเกาะของตัวเองได้' : b.layer === 'boat' ? 'วางบนน้ำ' : 'วางบนเกาะของคุณ' });
  out.push(...needBlueprint(`b:${b.id}`));
  if (!b.cost.length) out.push({ k: 'text', text: 'ไม่ต้องใช้วัสดุ', color: '#a7f070' });
  for (const [item, n] of rawCostOfBuild(b.cost)) out.push({ k: 'mat', item, qty: n, src: shortSource(item) });
  if (b.cost.some(([item]) => isPart(item))) out.push({ k: 'text', text: '🧩 แปลนใช้ของดิบ — ถ้ามีชิ้นส่วนในกระเป๋าจะใช้ก่อน', size: 11, color: '#a9bccb' });
  return out;
}

function buildStats(b: BuildDef): [string, string][] {
  const s: [string, string][] = [['ขนาด', `${b.w}×${b.h} ช่อง`], ['HP', `${b.hp}`]];
  if (b.storage) s.push(['เก็บของ', `${b.storage} ช่อง`]);
  if (b.sleep) s.push(['นอน/จุดเกิด', 'ได้']);
  if (b.warmth) s.push(['ความอบอุ่น', `+${b.warmth}`]);
  if (b.light) s.push(['แสง', `${b.light}`]);
  s.push(['การวาง', LAYER_NAME[b.layer]], ['ทางเดิน', BLOCK_NAME[b.blocks]]);
  return s;
}

function buildEntry(b: BuildDef): Entry {
  const blocks: Block[] = [{ k: 'text', text: b.desc }, { k: 'section', title: '📊 ข้อมูล' }, { k: 'stats', items: buildStats(b) }];
  if (b.turret) {
    blocks.push({ k: 'section', title: '🎯 ยิงอัตโนมัติ' });
    blocks.push({ k: 'stats', items: [['ดาเมจ', `${b.turret.damage}`], ['ระยะ', `${b.turret.range}`], ['ยิงทุก', `${b.turret.cooldown} วิ`], ['DPS', (b.turret.damage / b.turret.cooldown).toFixed(1)], ...(b.turret.splash ? [['วงระเบิด', `${b.turret.splash}`] as [string, string]] : [])] });
  }
  if (b.power) blocks.push({ k: 'text', text: POWER_TEXT[b.power], color: '#73eff7', size: 12 });
  if (b.power === 'gen' || b.power === 'wind') {
    const users = BUILDABLES.filter((x) => x.power === 'use');
    blocks.push({ k: 'text', text: 'จ่ายไฟให้:', size: 12, color: '#a9bccb' }, { k: 'icons', items: users.map((u) => ({ icon: buildSprite(u), label: u.name, art: u.id })) });
  }
  if (b.station) {
    const rs = RECIPES.filter((r) => r.station === b.station && !isHiddenRecipe(r));
    const outs = [...new Set(rs.map((r) => r.output.item))];
    blocks.push({ k: 'section', title: `🛠 คราฟต์ได้ ${outs.length} อย่าง` }, { k: 'icons', items: outs.map((id) => ({ icon: itemSprite(id), label: ITEMS[id].name, art: id })) });
  }
  if (b.miner) blocks.push({ k: 'text', text: '⛏ ขุดแร่อัตโนมัติเก็บเข้าตัวเครื่อง — มาเก็บด้วย E', size: 12, color: '#d6e4ee' });
  if (b.sprinkler) blocks.push({ k: 'text', text: '💧 พืชรอบๆ โตเร็วขึ้น', size: 12, color: '#d6e4ee' });
  if (b.trap) blocks.push({ k: 'text', text: '🗡 ศัตรูเหยียบแล้วโดนดาเมจ', size: 12, color: '#d6e4ee' });
  if (b.crop) blocks.push({ k: 'text', text: '🌱 ถือเมล็ดแล้วกด E เพื่อปลูก · รดน้ำด้วยเครื่องรดน้ำโตเร็วขึ้น', size: 12, color: '#d6e4ee' });
  if (b.dock) blocks.push({ k: 'text', text: '⚓ จุดจอดเรือ — วางบนน้ำตื้นริมฝั่ง ขึ้นลงเรือสะดวก', size: 12, color: '#d6e4ee' });
  if (b.buff) {
    const total: Partial<Stats> = {};
    for (const k of Object.keys(b.buff) as (keyof Stats)[]) total[k] = b.buff[k]! * (b.buffMax ?? 1);
    blocks.push({ k: 'section', title: '⭐ บัฟถาวรให้ผู้เล่น', color: '#a7f070' });
    blocks.push({ k: 'text', text: `${statLine(b.buff)} ต่อหลัง · นับสูงสุด ${b.buffMax} หลัง`, color: '#a7f070', size: 13 });
    if ((b.buffMax ?? 1) > 1) blocks.push({ k: 'text', text: `รวมสูงสุด: ${statLine(total)}`, size: 12, color: '#a9bccb' });
  }
  blocks.push(...upgradeBuildBlocks(b));
  blocks.push(...costBlocks(b));
  const r: Rarity = b.tier >= 4 ? 'epic' : b.tier === 3 ? 'rare' : b.tier === 2 ? 'uncommon' : 'common';
  const quick = [`ขนาด ${b.w}×${b.h} · HP ${b.hp}${b.storage ? ` · เก็บ ${b.storage}` : ''}`];
  if (b.turret) quick.push(`ดาเมจ ${b.turret.damage} · ระยะ ${b.turret.range}`);
  if (b.buff) quick.push(`บัฟ: ${statLine(b.buff)}`);
  return {
    id: b.id, name: b.name, rarity: r, tag: `${CATEGORY_NAMES[b.category]} · ขั้น ${b.tier}`, sprite: buildSprite(b), group: b.category,
    badge: b.buff ? '⭐' : undefined, quick, blocks,
  };
}

const buildsOf = (cats: BuildCategory[]) => BUILDABLES.filter((b) => cats.includes(b.category)).sort((a, b) => cats.indexOf(a.category) - cats.indexOf(b.category) || a.tier - b.tier);

/** เขตผจญภัย + เพดานกล่อง (ใช้ในการ์ดยานพาหนะ และการ์ดผลึก & กล่อง) */
function adventureBlocks(): Block[] {
  const pctN = (n: number) => `${Math.round(n * 100)}%`;
  return [
    { k: 'section', title: '⚔ เขตผจญภัย (ทุกเกาะที่ไม่ใช่เกาะเรา/เกาะกลาง)', color: '#ef7d57' },
    { k: 'text', text: 'เกาะไบโอมทุกแบบ เกาะของผู้เล่นคนอื่น เกาะซากโบราณ และเกาะมหาสมบัติ = เขตผจญภัย (ทะเลเปิดและบนเรือไม่นับ) · มุมจอจะมีป้าย "⚔ เขตผจญภัย"', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '⚔ PvP: ผู้เล่นอื่นโจมตีคุณได้ และคุณตีเขาได้ (ตอนนี้เป็นบอท "ผู้รอดชีวิตคู่แข่ง" แทนผู้เล่นจริง — ยังไม่มีเซิร์ฟเวอร์)', size: 12, color: '#ef7d57' },
    { k: 'text', text: '💀 ตายในเขตนี้ = ตายถาวร เริ่มใหม่ทั้งหมด (ไม่สนเลเวล · ไม่มีซื้อชีวิต)', size: 12, color: '#ef7d57' },
    { k: 'text', text: `🎁 ของดีกว่า: มอนลุ้นกล่องซ้ำ (≈×2) + ${pctN(ADVENTURE_LOOT.mobUpgrade)} ขยับขึ้น 1 ขั้น · รอดภัยกลางวัน +${ADVENTURE_LOOT.hazardStep} ขั้น · หีบสมบัติ ทอง/เพชร · สัตว์ในตำนานลุ้นกล่องเพชร ×${ADVENTURE_LOOT.legendBoxMult}`, size: 12, color: '#ffcd75' },
    { k: 'text', text: `🧑 ผู้รอดชีวิตคู่แข่ง: เกาะละ 2–3 คน (ไม่เกิดช่วงตั้งหลัก · ไม่ตามข้ามเกาะ) · ใช้ดาบหรือธนูตามวัน/ความอันตรายของเกาะ · หลบ ${pctN(RIVAL.dodge)} · ป้องกัน ${pctN(RIVAL.block)} · บางคนหนีตอน HP ต่ำ · ล้มแล้วได้ถุงของ: เหรียญ + กล่อง ${pctN(RIVAL_LOOT.boxChance)} (ส่วนใหญ่ทอง) + อาวุธ ${pctN(RIVAL_LOOT.weaponChance)}`, size: 12, color: '#d6e4ee' },
  ];
}

/** ตาราง "ได้กล่องจากไหน" ตามพื้นที่ */
function boxZoneBlocks(): Block[] {
  const name = (t: BoxTier) => BOXES[t].name;
  return [
    { k: 'section', title: '🗺 ได้กล่องจากไหน (เพดานกล่องตามพื้นที่)' },
    { k: 'row', icon: itemSprite(HOME_BOX_CAP), text: '🏠 เกาะของคุณ + ดันเจี้ยน', sub: 'มอน ภัยกลางวัน คืนภัยพิบัติ หีบดันเจี้ยน ตู้จดหมาย กล่องร่ม ตกปลา', right: name(HOME_BOX_CAP), color: RARITY.common.color },
    { k: 'row', icon: itemSprite(HOME_BOSS_BOX_CAP), text: '👑 บอสดันเจี้ยน · คืนบอส (บนเกาะเรา)', sub: 'ข้อยกเว้นเดียวบนเกาะเรา', right: `สูงสุด${name(HOME_BOSS_BOX_CAP)}`, color: RARITY.uncommon.color },
    { k: 'row', icon: itemSprite('box_legend'), text: '⚔ เขตผจญภัย (เกาะอื่นทุกเกาะ)', sub: 'ไม่จำกัด + โบนัส — แหล่งหลักของกล่องทอง/เพชรและแปลนหายาก', right: 'ทุกระดับ', color: RARITY.legendary.color },
    { k: 'row', icon: itemSprite('box_gold'), text: '🕊 เกาะกลาง (พ่อค้า)', sub: 'ซื้อด้วยเพชร', right: `${GOLD_BOX_GEMS}/${LEGEND_BOX_GEMS}`, rightIcon: 'i_gem', color: RARITY.epic.color },
    { k: 'text', text: '📜 รางวัลภารกิจได้ตามเดิม · แปลนที่สัตว์ในตำนานดรอปบนเกาะเรากลายเป็นเหรียญครึ่งราคา', size: 11, color: '#a9bccb' },
  ];
}

function boatOverview(): Entry {
  const islands = (Object.keys(BIOMES) as Biome[]).map((k) => BIOMES[k]);
  const blocks: Block[] = [
    { k: 'text', text: 'ทุกคนเริ่มบนเกาะของตัวเอง — ต้องต่อเรือเพื่อออกไปหาทรัพยากรหายากบนเกาะอื่น และไปค้าขายที่เกาะกลาง · บนเกาะใช้ยานบกเดินทางเร็วขึ้น · ยานบินข้ามได้ทั้งบกและทะเล' },
    { k: 'section', title: '🚗 ยานพาหนะ 3 แบบ' },
    { k: 'row', text: '⛵ ทางน้ำ (10 แบบ)', sub: 'วางบนน้ำริมฝั่ง · แพ แคนู เรือประมง เรือใบ เรือขนส่ง เจ็ตสกี เรือยนต์ เรือเร็ว เรือรบ เรือดำน้ำ', color: '#41a6f6' },
    { k: 'row', text: '🐎 ทางบก (7 แบบ)', sub: 'วางบนพื้น · ชนต้นไม้/หิน/กำแพงได้ ลงน้ำไม่ได้ · เกวียน จักรยาน ม้า ATV มอเตอร์ไซค์ จี๊ป รถถังเล็ก', color: '#a7f070' },
    { k: 'row', text: '🎈 ทางอากาศ (2 แบบ)', sub: 'บินข้ามบกและทะเล ลงจอดได้เฉพาะบนพื้น · เครื่องร่อน บอลลูนลมร้อน', color: '#ffcd75' },
    { k: 'section', title: '⛵ ขั้นตอนออกเดินทาง' },
    { k: 'text', text: '1) หาแปลนยาน (ยานขั้น 1 รู้แปลนตั้งแต่แรก ขั้นสูงต้องได้แปลนจากกล่อง)', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '2) กด B → หมวดยานพาหนะ → วางยาน (เรือวางบนน้ำ · ยานบก/บินวางบนพื้น)', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '3) เดินไปข้างยานแล้วกด E เพื่อขึ้น/ลง · Shift = เร่ง (กินน้ำมัน/แรงมากขึ้น)', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '4) เปิดแผนที่ (M) ดูทิศเกาะ แล้วแล่นไปเลย — ระวังงูทะเลโจมตีเรือ!', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '⛽ ยานเครื่องยนต์เติมน้ำมันอัตโนมัติจากกระเป๋า — หมดแล้ววิ่งได้แค่ 30% · ม้ากินผัก/ผลไม้จากกระเป๋าเอง · จอดเรือข้างท่าเรือ = ซ่อมเอง', size: 12, color: '#ffcd75' },
    { k: 'section', title: '🏝 เกาะที่ไปได้ (รูปร่างสุ่ม: ก้อนกลม จันทร์เสี้ยว วงแหวน ยาวเรียว เกาะแฝด หมู่เกาะเล็ก)' },
    ...islands.map((b): Block => ({ k: 'row', text: b.name, sub: `${b.desc}${b.tip ? ` · ${b.tip}` : ''} · ${b.temp[0]}°/${b.temp[1]}°C${b.danger ? ` · อันตราย ×${b.danger}` : ''}`, color: b.color })),
    ...adventureBlocks(),
    ...boxZoneBlocks(),
  ];
  return {
    id: '_boat_info', sceneArt: 'cat_boat', name: 'ยานพาหนะ & การเดินทาง', rarity: 'rare', tag: 'คำอธิบาย', sprite: { key: 'sailboat' }, group: '_info', info: true,
    quick: ['สร้างยาน → กด E ขึ้น → เดินทางข้ามเกาะ'], blocks,
  };
}

function boatEntry(b: BuildDef): Entry {
  const e = buildEntry(b);
  if (!b.boat) return { ...e, group: 'water' };
  const maxSpeed = Math.max(...BUILDABLES.filter((x) => x.boat).map((x) => x.boat!.speed));
  const maxHp = Math.max(...BUILDABLES.filter((x) => x.boat).map((x) => x.boat!.hp));
  const v = b.boat;
  const kind = vehicleKind(v);
  const fuelNames = (v.fuelItems ?? [['fuel', 0]]).map(([id]) => ITEMS[id]?.name ?? id).join(' / ');
  const stats: [string, string][] = [
    ['ประเภท', VEHICLE_KIND_NAME[kind]],
    ['เชื้อเพลิง', v.fuel ? fuelNames : v.energy ? 'แรงในตัว (พักฟื้นเอง)' : 'ไม่ใช้ (ใบเรือ/พาย/ปั่น)'],
    ['ขนาด', `${b.w}×${b.h}`],
  ];
  if (v.armor) stats.push(['กันดาเมจคนขับ', `${Math.round(v.armor * 100)}%`]);
  if (v.cargo) stats.push(['ช่องเก็บของ', `${v.cargo} ช่อง`]);
  if (v.gun) stats.push(['อาวุธติดยาน', 'มี (คลิกยิง)']);
  const blocks: Block[] = [
    { k: 'text', text: b.desc },
    { k: 'section', title: '📊 สมรรถนะ' },
    { k: 'bars', rows: [
      { label: 'ความเร็ว', pct: v.speed / maxSpeed, color: 0x41a6f6, right: `${v.speed}` },
      { label: 'ความทนทาน', pct: v.hp / maxHp, color: 0xa7f070, right: `${v.hp} HP` },
    ] },
    { k: 'stats', items: stats },
  ];
  if (v.special) blocks.push({ k: 'text', text: `✨ ${v.special}`, size: 12, color: '#73eff7' });
  if (v.fuel) blocks.push({ k: 'text', text: `⛽ พก${fuelNames}ไว้ในกระเป๋า — เติมให้อัตโนมัติตอนขึ้นยานและตอนหมด`, size: 12, color: '#ffcd75' });
  blocks.push({ k: 'text', text: kind === 'water' ? 'วางบนน้ำ · กด E ข้างเรือเพื่อขึ้น/ลง · แล่นไปเกาะอื่นได้ทุกทิศ' : kind === 'land' ? 'วางบนพื้น · กด E ข้างยานเพื่อขึ้น/ลง · ลงน้ำไม่ได้ (ใช้บนเกาะ)' : 'วางบนพื้น · บินข้ามบกและทะเลได้ · ลงจอดได้เฉพาะบนพื้น', size: 12, color: '#a9bccb' });
  blocks.push(...upgradeBuildBlocks(b));
  blocks.push(...costBlocks(b));
  return { ...e, group: kind, sprite2: { key: v.down ?? v.vertical }, quick: [`${VEHICLE_KIND_NAME[kind]} · ความเร็ว ${v.speed} · HP ${v.hp}${v.fuel ? ' · ใช้น้ำมัน' : ''}`], blocks };
}

// ---------------------------------------------------------------- 6. มอนสเตอร์

const AI_TEXT: Record<MobAI, string> = {
  flee: 'ขี้ตกใจ — วิ่งหนีเมื่อเข้าใกล้',
  neutral: 'ไม่ทำร้ายถ้าไม่ตีก่อน (ตีแล้วสู้กลับ)',
  hunter: 'นักล่า — เห็นผู้เล่นในระยะแล้วไล่ล่า',
  zombie: 'เดินบุกเข้าหาไม่หยุด ทุบสิ่งก่อสร้างที่ขวาง',
  ranged: 'รักษาระยะแล้วยิงกระสุน — เข้าประชิดหรือใช้โล่',
  flyer: 'บินข้ามกำแพงและน้ำได้',
  swimmer: 'อยู่ในน้ำ — โจมตีเรือและคนริมน้ำ',
  wrecker: '⚠ พุ่งทำลายสิ่งก่อสร้างก่อน! สร้างป้อมยิงรับมือ',
  boss: '👑 บอส — ไล่ล่า + ท่าพิเศษ',
};
const PROJ_NAME: Record<string, string> = {
  bone: 'กระดูก', fireball: 'ลูกไฟ', arrow: 'ลูกธนู', spit: 'น้ำลายพิษ', proj_naga: 'น้ำพิษพญานาค', proj_feather: 'ขนครุฑ', proj_ink: 'หมึกดำ',
  proj_spark: 'ประกายไฟฟ้า', proj_frost_orb: 'ลูกแก้วน้ำแข็ง', proj_rock: 'ก้อนหินผา',
};
/** ท่าพิเศษของสัตว์ในตำนาน (ตรงกับ CreatureSystem.cast / Mob.ts) */
const BEAST_MOVE_TEXT: Record<BeastMove, string> = {
  charge: 'พุ่งชาร์จใส่อย่างแรง — หลบด้วย Space',
  summon: 'เรียกลูกน้องออกมาช่วย',
  nova: 'คลื่นพลังรอบตัวรัศมีกว้าง (มีวงเตือน) — ถอยออกห่าง',
  strike: 'โจมตีจากฟ้า/ใต้พื้น 3 จุด (มีวงเตือน 1 วิ) — เดินออกจากวง',
  cloud: 'พ่นหมอกพิษใต้เท้า ค้าง 5 วิ — รีบออกจากหมอก',
};
const ELEMENT_NAME: Record<string, string> = { fire: '🔥 ไฟ', ice: '❄ น้ำแข็ง', storm: '⚡ สายฟ้า', poison: '☠ พิษ', water: '🌊 น้ำ', earth: '🪨 ดิน', wind: '🌪 ลม' };
const AFFLICT_NAME: Record<string, string> = { poison: 'ติดพิษ (เสีย HP ต่อเนื่อง)', burn: 'ไฟลวก', chill: 'ตัวแข็ง เดินช้าลง', shock: 'ไฟฟ้าช็อต เดินช้ามาก' };
const SPAWN_TIME: Record<string, string> = { day: '☀ กลางวัน', night: '🌙 กลางคืน', any: 'ทั้งวัน' };

const isAnimal = (m: MobDef) => m.ai !== 'boss' && m.drops.some((d) => d.meat);
const isSea = (m: MobDef) => !m.legendary && (mobSwims(m) || m.id === 'hermit_crab');

function mobEntry(m: MobDef): Entry {
  const boss = m.ai === 'boss';
  const humanoid = ['zombie', 'skeleton', 'mummy', 'shade', 'merchant'].includes(m.texture);
  const sprite: SpriteRef = { key: m.texture, frame: 0, anim: humanoid ? `${m.texture}_walk_down` : `${m.texture}_walk`, tint: m.tint, alpha: m.alpha };
  const stats: [string, string][] = [['HP', `${m.hp}`], ['โจมตี', `${m.attack}`], ['ความเร็ว', `${m.speed}`], ['ระยะมองเห็น', m.aggroRange ? `${m.aggroRange}` : '—']];
  if (m.armor) stats.push(['เกราะ', `-${Math.round(m.armor * 100)}% ดาเมจ`]);
  if (m.structureMult) stats.push(['ทุบสิ่งก่อสร้าง', `×${m.structureMult}`]);
  const blocks: Block[] = [{ k: 'text', text: AI_TEXT[m.ai], color: boss ? RARITY.legendary.color : '#f4f4f4' }, { k: 'section', title: '📊 ค่าสถานะ' }, { k: 'stats', items: stats }];
  const moves: string[] = [];
  if (m.shoot) moves.push(`ยิง${PROJ_NAME[m.shoot.projectile] ?? m.shoot.projectile} ดาเมจ ${m.shoot.damage} ทุก ${m.shoot.cooldown} วิ ระยะ ${m.shoot.range}${m.shoot.burst ? ` (ทีละ ${m.shoot.burst} ลูก)` : ''}`);
  if (m.special === 'charge') moves.push('พุ่งชาร์จใส่อย่างแรง — หลบด้วย Space');
  if (m.special === 'summon' && m.summon) moves.push(`เรียก${MOBS[m.summon]?.name ?? m.summon}มาช่วย`);
  if (m.splits) moves.push(`ตายแล้วแตกเป็น${MOBS[m.splits.id]?.name ?? ''} ×${m.splits.count}`);
  for (const mv of m.moves ?? []) moves.push(mv === 'summon' && m.summon ? `เรียก${MOBS[m.summon]?.name ?? m.summon}ออกมาช่วย` : BEAST_MOVE_TEXT[mv]);
  if (m.element) moves.push(`ธาตุ ${ELEMENT_NAME[m.element] ?? m.element}`);
  if (m.onHit) moves.push(`โดนแล้ว${AFFLICT_NAME[m.onHit.kind]} ${m.onHit.dur} วิ`);
  if (m.revive) moves.push('🔥 ล้มครั้งแรกจะฟื้นคืนชีพที่ HP 50%');
  if (m.move === 'fly' && m.ai !== 'flyer') moves.push('บินข้ามกำแพงและน้ำได้');
  if (m.move === 'amphi') moves.push('อยู่ได้ทั้งบนบกและในน้ำ — โจมตีเรือได้');
  if (mobSwims(m) && m.ai !== 'swimmer') moves.push('อยู่ในน้ำเท่านั้น');
  if (moves.length) {
    blocks.push({ k: 'section', title: '⚔ ท่าโจมตี' });
    for (const t of moves) blocks.push({ k: 'text', text: `• ${t}`, size: 12, color: '#d6e4ee' });
  }
  // พบที่ไหน
  const where: string[] = [];
  const day = (Object.keys(BIOMES) as Biome[]).filter((b) => BIOMES[b].wildlife.includes(m.id)).map((b) => BIOMES[b].name);
  const night = (Object.keys(BIOMES) as Biome[]).filter((b) => BIOMES[b].nightMobs.includes(m.id)).map((b) => BIOMES[b].name);
  const dis = DISASTERS.filter((d) => d.waves.some((w) => w.some(([id]) => id === m.id))).map((d) => d.name);
  const bossOf = DISASTERS.filter((d) => d.boss === m.id).map((d) => d.name);
  if (day.length) where.push(`☀ ${day.join(', ')}`);
  if (night.length) where.push(`🌙 กลางคืน: ${night.join(', ')}`);
  if (dis.length) where.push(`⚠ มากับภัย: ${dis.join(', ')}`);
  if (bossOf.length) where.push(`👑 บอสท้ายภัย: ${bossOf.join(', ')}`);
  if (m.id === 'slime_small') where.push('แตกออกมาจากสไลม์');
  if (m.legendary) {
    for (const r of m.spawn ?? []) where.push(`✨ ${r.where === 'sea' ? '🌊 ทะเลลึก (ตอนล่องเรือ)' : BIOMES[r.where].name} · ${SPAWN_TIME[r.time]} · หายากมาก`);
    where.push(`ปรากฏตั้งแต่วันที่ ${m.minDay ?? 1} · ในโลกมีได้ทีละ 1 ตัว · ห่างไปนานจะหายลับ`);
  }
  if (m.nightOnly) where.push('🌙 ออกมาเฉพาะกลางคืน');
  if (m.habitat) where.push(m.habitat);
  if (!where.length) where.push('ปรากฏตัวเป็นครั้งคราวในโลก');
  blocks.push({ k: 'section', title: '📍 พบได้ที่' });
  for (const w of where) blocks.push({ k: 'text', text: w, size: 12, color: '#d6e4ee' });
  // ของดรอป
  blocks.push({ k: 'section', title: '🎒 ของดรอป' });
  for (const d of m.drops) {
    blocks.push({ k: 'row', icon: itemSprite(d.item), text: `${ITEMS[d.item].name} ×${range(d.qty[0], d.qty[1])}`, right: pct(d.chance), color: RARITY[rar(ITEMS[d.item])].color });
  }
  if (boss) {
    // โบนัสบอส (ตรงกับ GameScene.onMobKilled)
    blocks.push({ k: 'row', icon: itemSprite('gem'), text: `${ITEMS.gem.name} ×1–3`, right: '100%', color: RARITY.epic.color });
    const el = m.xp >= 700 ? 'elixir_soul' : 'elixir_atk';
    blocks.push({ k: 'row', icon: itemSprite(el), text: `${ITEMS[el].name} ×1`, right: '100%', color: RARITY[rar(ITEMS[el])].color });
  }
  const odds = mobBoxOdds(m);
  const tiers = TIERS.filter((t) => odds[t]);
  blocks.push({ k: 'section', title: '🎁 โอกาสดรอปกล่อง' });
  if (tiers.length) {
    blocks.push({ k: 'bars', rows: tiers.map((t) => ({ label: BOXES[t].name, pct: odds[t]!, color: RARITY[rar(ITEMS[t])].hex, right: `≈${pct(odds[t]!)}` })) });
    if (!boss) blocks.push({ k: 'text', text: '🍀 ค่าโชค (luck) ทำให้มีโอกาสสุ่มกล่องซ้ำอีกครั้ง', size: 11, color: '#a9bccb' });
    blocks.push({ k: 'text', text: `🏠 บนเกาะเรา: กล่องไม้เท่านั้น${boss ? ' (บอสดันเจี้ยน/คืนบอส = กล่องเหล็ก)' : ''} · ⚔ เขตผจญภัย: ลุ้นซ้ำ ≈×2 + ${Math.round(ADVENTURE_LOOT.mobUpgrade * 100)}% ขยับขึ้น 1 ขั้น`, size: 11, color: '#ffcd75' });
  } else blocks.push({ k: 'text', text: 'ไม่ดรอปกล่อง', size: 12, color: '#a9bccb' });
  return {
    id: m.id, name: m.name, rarity: boss ? 'legendary' : m.hp >= 100 ? 'epic' : m.hp >= 50 ? 'rare' : m.attack > 0 ? 'uncommon' : 'common',
    tag: m.legendary ? '🐉 ตำนาน' : boss ? '👑 บอส' : isSea(m) ? 'สัตว์น้ำ' : isAnimal(m) || mobFlies(m) && m.ai === 'flee' ? 'สัตว์' : 'มอนสเตอร์', sprite,
    group: m.legendary ? 'legend' : boss ? 'boss' : isSea(m) ? 'sea' : isAnimal(m) || mobFlies(m) && m.ai === 'flee' ? 'animal' : 'monster', featured: boss,
    badge: m.legendary ? 'ตำนาน' : boss ? 'บอส' : undefined, quick: [`HP ${m.hp} · โจมตี ${m.attack}`, m.legendary ? m.lore ?? AI_TEXT[m.ai] : AI_TEXT[m.ai]], blocks,
  };
}

function mobEntries(): Entry[] {
  const order = ['legend', 'boss', 'monster', 'animal', 'sea'];
  return baseMobs().map(mobEntry).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

// ---------------------------------------------------------------- 7. ร้านค้า

function shopOverview(): Entry {
  const m = marketInfo();
  const blocks: Block[] = [
    { k: 'text', text: 'เกาะกลางเป็นเขตปลอดภัย (ห้ามต่อสู้) มีพ่อค้ากลางและแผงตลาด 12 แผงให้ผู้เล่นค้าขายกัน' },
    { k: 'section', title: '🛒 พ่อค้ากลาง' },
    { k: 'text', text: `• สุ่มของขาย ${8} อย่าง และรับซื้อ ${8} อย่างใหม่ทุกวัน (ทุกคนในห้องเห็นราคาเดียวกัน)`, size: 12, color: '#d6e4ee' },
    { k: 'text', text: '• ★ ทุกวันจะมีของรับซื้อ 1 อย่างที่ให้ราคา ×2', size: 12, color: '#ffcd75' },
    { k: 'text', text: `• ของที่อาจขาย: ${m.buy.size} อย่าง · ของที่อาจรับซื้อ: ${m.sell.size} อย่าง (ดูในตัวกรอง)`, size: 12, color: '#d6e4ee' },
    { k: 'section', title: '💎 เพชร' },
    { k: 'row', icon: itemSprite('gem'), text: 'ซื้อเพชร 1 เม็ด', right: `${GEM_BUY}`, rightIcon: 'i_coin' },
    { k: 'row', icon: itemSprite('gem'), text: 'แลกเพชร 1 เม็ด → เหรียญ', right: `${Wallet.GEM_RATE}`, rightIcon: 'i_coin', color: '#ffcd75' },
    { k: 'row', icon: itemSprite('box_gold'), text: 'ซื้อกล่องทอง (มีแปลน)', right: `${GOLD_BOX_GEMS}`, rightIcon: 'i_gem', color: RARITY.epic.color },
    { k: 'row', icon: itemSprite('box_legend'), text: 'ซื้อกล่องเพชร (มีแปลน)', right: `${LEGEND_BOX_GEMS}`, rightIcon: 'i_gem', color: RARITY.legendary.color },
    { k: 'section', title: '🏪 ตลาดผู้เล่น (แผงร้าน)' },
    { k: 'text', text: `• วางขายของที่แผงไหนก็ได้ ตั้งราคาเอง · ภาษีตลาด ${Math.round(Wallet.TAX * 100)}% (ขาย 100 ได้สุทธิ ${Math.floor(100 * (1 - Wallet.TAX))})`, size: 12, color: '#d6e4ee' },
    { k: 'text', text: '• ขายได้แล้วเงินส่งเข้าตู้จดหมายที่เกาะของคุณ', size: 12, color: '#d6e4ee' },
    { k: 'text', text: '• แต่ละเกาะมีแร่เด่นต่างกัน — แลกเปลี่ยนกันที่นี่คุ้มที่สุด', size: 12, color: '#d6e4ee' },
    { k: 'section', title: '💰 หาเหรียญได้จาก' },
    ...itemSources('coin').map((s): Block => ({ k: 'text', text: s, size: 12, color: '#d6e4ee' })),
  ];
  return {
    id: '_shop_info', sceneArt: 'cat_shop', name: 'พ่อค้ากลาง & ตลาด', rarity: 'legendary', tag: 'เกาะกลาง', sprite: { key: 'merchant', frame: 0, anim: 'merchant_walk_down' }, group: '_info', info: true,
    quick: [`เพชร 1 = ${Wallet.GEM_RATE} เหรียญ · ภาษี ${Math.round(Wallet.TAX * 100)}%`], blocks,
  };
}

function shopItemEntry(id: string, side: 'buy' | 'sell', p: PriceInfo): Entry {
  const d = ITEMS[id];
  const unit = (p.min / p.qty).toFixed(1).replace(/\.0$/, '');
  const blocks: Block[] = [
    { k: 'text', text: d.desc },
    { k: 'section', title: side === 'buy' ? '🛒 ซื้อจากพ่อค้ากลาง' : '💰 ขายให้พ่อค้ากลาง' },
    { k: 'row', icon: itemSprite(id), text: `${d.name} ×${p.qty} ต่อครั้ง`, right: range(p.min, p.max), rightIcon: 'i_coin', color: '#ffcd75' },
    { k: 'text', text: `ราคาเปลี่ยนทุกวัน (เฉลี่ย ~${unit}+ เหรียญ/ชิ้น) · มูลค่าพื้นฐาน ${d.value}${side === 'sell' ? ' · วันที่ติด ★ ให้ราคา ×2' : ''}`, size: 12, color: '#a9bccb' },
  ];
  blocks.push(...recipeBlocks(id).filter((b) => !(b.k === 'row' && b.rightIcon === 'i_coin' && b.text.startsWith('พ่อค้า'))));
  return {
    id: `${side}_${id}`, art: id, name: d.name, rarity: rar(d), sprite: itemSprite(id), group: side,
    price: { icon: 'i_coin', text: range(p.min, p.max) }, badge: side === 'buy' ? 'ขาย' : 'รับซื้อ',
    quick: [`${side === 'buy' ? 'ราคาซื้อ' : 'พ่อค้าจ่าย'} ${range(p.min, p.max)} เหรียญ / ×${p.qty}`], blocks,
  };
}

function shopEntries(): Entry[] {
  const m = marketInfo();
  const byVal = (a: [string, PriceInfo], b: [string, PriceInfo]) => a[1].min - b[1].min;
  const gem: Entry = {
    id: '_gem', art: 'gem', name: 'แลกเพชร', rarity: 'epic', sprite: itemSprite('gem'), group: 'gem', price: { icon: 'i_coin', text: `${GEM_BUY}` },
    quick: [`ซื้อ ${GEM_BUY} · ขาย ${Wallet.GEM_RATE} เหรียญ`],
    blocks: [
      { k: 'text', text: ITEMS.gem.desc },
      { k: 'row', icon: itemSprite('gem'), text: 'ซื้อเพชร 1 เม็ด', right: `${GEM_BUY}`, rightIcon: 'i_coin' },
      { k: 'row', icon: itemSprite('gem'), text: 'แลกเพชร 1 → เหรียญ', right: `${Wallet.GEM_RATE}`, rightIcon: 'i_coin', color: '#ffcd75' },
      { k: 'row', icon: itemSprite('box_gold'), text: 'ซื้อกล่องทอง (มีแปลน)', right: `${GOLD_BOX_GEMS}`, rightIcon: 'i_gem', color: RARITY.epic.color },
      { k: 'row', icon: itemSprite('box_legend'), text: 'ซื้อกล่องเพชร (มีแปลน)', right: `${LEGEND_BOX_GEMS}`, rightIcon: 'i_gem', color: RARITY.legendary.color },
      { k: 'section', title: '📍 หาเพชรได้จาก' },
      { k: 'text', text: '👑 ล้มบอส (ได้ 1–3 เม็ดแน่นอน) · ความสำเร็จ · กล่องดรอป', size: 12, color: '#d6e4ee' },
    ],
  };
  const stall: Entry = {
    id: '_stall', sceneArt: 'market_island', name: 'แผงตลาดผู้เล่น', rarity: 'rare', sprite: { key: 'stall_a' }, group: 'gem', price: { icon: 'i_coin', text: `ภาษี ${Math.round(Wallet.TAX * 100)}%` },
    quick: ['วางขาย/ซื้อของกับผู้เล่นอื่น'],
    blocks: [
      { k: 'text', text: 'เดินไปที่แผงบนเกาะกลางแล้วกด E เพื่อดูของที่ผู้เล่นอื่นวางขาย หรือวางขายของของคุณเอง' },
      { k: 'stats', items: [['จำนวนแผง', '12'], ['ภาษีตลาด', `${Math.round(Wallet.TAX * 100)}%`], ['ขาย 1,000', `ได้ ${Math.floor(1000 * (1 - Wallet.TAX)).toLocaleString()}`]] },
      { k: 'text', text: '📬 ขายได้แล้วเงินเข้าตู้จดหมายที่เกาะของคุณ · 🕊 เขตปลอดภัย ห้ามต่อสู้', size: 12, color: '#a9bccb' },
    ],
  };
  return [
    shopOverview(), gem, stall,
    ...TIERS.map((t) => ({ ...boxEntry(t), group: 'gem' })),
    ...[...m.buy.entries()].sort(byVal).map(([id, p]) => shopItemEntry(id, 'buy', p)),
    ...[...m.sell.entries()].sort(byVal).map(([id, p]) => shopItemEntry(id, 'sell', p)),
  ];
}

// ---------------------------------------------------------------- 8. ผลึกพลัง & กล่อง

function boxEntry(t: BoxTier): Entry {
  const box = BOXES[t];
  const d = ITEMS[t];
  const G = Object.values<number>(box.groups).reduce((a, b) => a + b, 0);
  const RW = Object.values<number>(box.rarity).reduce((a, b) => a + b, 0);
  const legendW = (box.groups.weapon ?? 0) / G * (box.rarity.legendary / RW);
  const mobs = baseMobs().filter((m) => mobBoxOdds(m)[t]).map((m) => m.name);
  const blocks: Block[] = [
    { k: 'text', text: d.desc },
    { k: 'stats', items: [['ได้ของ', `${range(box.rolls[0], box.rolls[1])} ชิ้น`], ['มูลค่า', `${d.value}`], ...(legendW > 0 ? [['ลุ้นอาวุธเทพ/ชิ้น', pct(legendW)] as [string, string]] : [])] },
    { k: 'section', title: '✦ โอกาสความหายาก (ต่อชิ้น)' },
    { k: 'bars', rows: ORDER.map((r) => ({ label: RARITY[r].name, pct: box.rarity[r] / RW, color: RARITY[r].hex, right: pct(box.rarity[r] / RW) })) },
    { k: 'section', title: '📦 กลุ่มของที่สุ่ม' },
    { k: 'bars', rows: Object.entries<number>(box.groups).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([g, w]) => ({ label: LOOT_GROUPS[g]?.name ?? g, pct: w / G, color: 0x73eff7, right: pct(w / G) })) },
    ...blueprintBlocks(t),
    { k: 'section', title: '📍 หาได้จาก' },
    ...boxSources(t).map((s): Block => ({ k: 'text', text: s, size: 12, color: '#d6e4ee' })),
    ...itemSources(t).filter((s) => !s.startsWith('🎁 สุ่ม')).map((s): Block => ({ k: 'text', text: s, size: 12, color: '#d6e4ee' })),
  ];
  if (mobs.length) blocks.push({ k: 'text', text: `⚔ มอนสเตอร์ที่ดรอป: ${mobs.join(', ')}`, size: 12, color: '#d6e4ee' });
  if (BOX_GEMS[t]) blocks.push({ k: 'row', icon: itemSprite('gem'), text: 'ซื้อได้ที่พ่อค้ากลาง', right: `${BOX_GEMS[t]}`, rightIcon: 'i_gem', color: RARITY[rar(d)].color });
  const shop = marketInfo().buy.get(t);
  if (shop) blocks.push({ k: 'row', icon: { key: 'merchant' }, text: `พ่อค้ากลางขาย ×${shop.qty} (บางวัน)`, right: range(shop.min, shop.max), rightIcon: 'i_coin' });
  return {
    id: t, name: box.name, rarity: rar(d), sprite: itemSprite(t), group: 'box', featured: t === 'box_legend',
    quick: [`ได้ของ ${range(box.rolls[0], box.rolls[1])} ชิ้น · กด F เปิด`], blocks,
    price: BOX_GEMS[t] ? { icon: 'i_gem', text: `${BOX_GEMS[t]}` } : undefined,
  };
}

/** แปลนในกล่อง: โอกาสต่อชิ้น + อย่างน้อย 1 ใบต่อกล่อง + ตารางความหายากของแปลน */
function blueprintBlocks(t: BoxTier): Block[] {
  const box = BOXES[t];
  const o = blueprintOdds(t);
  if (!o.perDraw || !box.bpRarity) return [{ k: 'section', title: '📐 แปลน' }, { k: 'text', text: '❌ กล่องนี้ไม่มีแปลน — แปลนได้จากกล่องเหล็ก (เล็กน้อย) / กล่องทอง / กล่องเพชร', size: 12, color: '#ef7d57' }];
  const RW = Object.values<number>(box.bpRarity).reduce((a, b) => a + b, 0);
  return [
    { k: 'section', title: '📐 แปลน', color: '#73eff7' },
    { k: 'stats', items: [['ต่อชิ้นที่สุ่ม', pct(o.perDraw)], ['ได้อย่างน้อย 1 ใบ/กล่อง', pct(o.atLeastOne)]] },
    { k: 'text', text: 'โอกาสได้แปลนอย่างน้อย 1 ใบต่อกล่อง (คิดจากจำนวนชิ้นที่สุ่มจริง) · แปลนที่ยังไม่รู้ออกก่อน 70% · แปลนระดับ "ดี" = แปลนหลัก (ทั่ง ป้อมธนู ประตูหิน บ้านอิฐ …) ที่ยังไม่มีออกก่อน 90%', size: 11, color: '#a9bccb' },
    { k: 'bars', rows: ORDER.filter((r) => box.bpRarity![r]).map((r) => ({ label: `แปลน${RARITY[r].name}`, pct: box.bpRarity![r] / RW, color: RARITY[r].hex, right: pct(box.bpRarity![r] / RW) })) },
  ];
}

/** แหล่งกล่อง (ดันเจี้ยน หีบสมบัติ ภัย) — ดันเจี้ยนอยู่ใต้เกาะเรา จึงคิดผ่านเพดานกล่องของเกาะเรา (capBoxTier) */
function boxSources(t: BoxTier): string[] {
  const out: string[] = [];
  const boss = Object.entries(DUNGEON_BOSS_BOXES).map(([tier, list]) => [tier, list.filter((b) => capBoxTier(b, 'boss', 'home') === t).length] as const).filter(([, n]) => n > 0);
  if (boss.length) out.push(`👑 บอสดันเจี้ยน (ล้มได้ทุกวัน · เพดานเกาะเรา): ${boss.map(([tier, n]) => `ชั้น ${tier} ×${n}`).join(' · ')}`);
  const chest = Object.entries(DUNGEON_MOBS).filter(([, c]) => capBoxTier(c.box as BoxTier, 'chest', 'home') === t).map(([tier]) => tier);
  if (chest.length) out.push(`🧰 หีบในดันเจี้ยนชั้น ${chest.join('/')}`);
  const ruin = RUIN_CHEST_ODDS.ruins[t];
  const special = RUIN_CHEST_ODDS.special[t];
  if (ruin || special) out.push(`🏝 หีบสมบัติ (เขตผจญภัย): ${[special && `เกาะมหาสมบัติ ${pct(special)}`, ruin && `เกาะซากโบราณ/หมอกผี ${pct(ruin)}`].filter(Boolean).join(' · ')}`);
  if (t === 'box_wood') out.push('🏠 บนเกาะเรา: มอน · ภัยกลางวัน · คืนภัยพิบัติ · ตู้จดหมาย · กล่องร่ม · ตกปลา (เพดานกล่องไม้)');
  if (t === 'box_iron') out.push('🌙 รอดคืนบอสบนเกาะเรา (เพดานกล่องเหล็ก) · ⚔ เขตผจญภัย: รอดคืนภัยวันที่ 5+ · ภัยกลางวัน (+1 ขั้น)');
  if (t === 'box_gold') out.push(`⚔ เขตผจญภัย: รอดคืนบอสก่อนวันที่ 10 · คืนปกติวันที่ 12+ · ภัยกลางวันระดับ 3+ · ผู้รอดชีวิตคู่แข่ง (${pct(RIVAL_LOOT.boxChance * RIVAL_LOOT.box.box_gold)}/ตัว)`);
  if (t === 'box_legend') out.push(`⚔ เขตผจญภัย: รอดคืนบอสวันที่ 10+ · ภัยกลางวันระดับ 5+ (25%) · สัตว์ในตำนาน · ผู้รอดชีวิตคู่แข่ง (${pct(RIVAL_LOOT.boxChance * RIVAL_LOOT.box.box_legend)}/ตัว)`);
  return out;
}

/** การ์ดแปลน 1 ใบ (คลังข้อมูล → ผลึก & กล่อง → แปลน) */
function blueprintEntry(d: ItemDef): Entry {
  const key = BLUEPRINT_KEY.get(d.id) ?? '';
  const what = BLUEPRINT_UNLOCK.get(d.id) ?? d.name;
  const kind = key.startsWith('b:') ? 'สิ่งก่อสร้าง' : key.startsWith('u:') ? 'แปลนอัพเกรด' : 'ไอเทม/อาวุธ';
  const target = key.startsWith('b:') ? BUILD[key.slice(2)] : undefined;
  const item = key.startsWith('i:') ? ITEMS[key.slice(2)] : undefined;
  const chances = boxChances(d.id);
  const blocks: Block[] = [
    { k: 'text', text: d.desc },
    { k: 'section', title: '🔓 ปลดล็อก' },
    { k: 'row', icon: target ? buildSprite(target) : item ? itemSprite(item.id) : itemSprite(d.id), text: what, sub: kind, color: RARITY[rar(d)].color },
    { k: 'section', title: '🎁 สุ่มได้จาก (ต่อ 1 ชิ้นที่สุ่ม · ยังไม่รู้แปลนใบไหน)' },
  ];
  if (chances.length) blocks.push({ k: 'bars', rows: chances.map((c) => ({ label: BOXES[c.tier].name, pct: c.perBox, color: RARITY[rar(ITEMS[c.tier])].hex, right: `${pct(c.perRoll)}/ชิ้น · ${pct(c.perBox)}/กล่อง` })) });
  blocks.push({ k: 'text', text: `ได้ซ้ำ = แลกเป็น ${Math.round(d.value / 2)} เหรียญ`, size: 12, color: '#ffcd75' });
  return { id: d.id, name: d.name.replace('แปลน: ', ''), rarity: rar(d), tag: `แปลน · ${kind}`, sprite: itemSprite(d.id), group: 'blueprint', quick: [`ปลดล็อก: ${what}`], blocks };
}

function blueprintEntries(): Entry[] {
  return ITEM_LIST.filter((d) => d.type === 'blueprint' && BLUEPRINT_KEY.has(d.id))
    .sort((a, b) => ORDER.indexOf(rar(b)) - ORDER.indexOf(rar(a)) || a.name.localeCompare(b.name, 'th'))
    .map(blueprintEntry);
}

function elixirOverview(): Entry {
  return {
    id: '_elixir_info', sceneArt: 'cat_elixir', name: 'ผลึกพลัง & กล่องดรอป', rarity: 'legendary', tag: 'คำอธิบาย', sprite: itemSprite('elixir_soul'), group: '_info', info: true,
    quick: ['อัปค่าพลังถาวร (มีเพดาน) — ได้จากกล่องเท่านั้น'],
    blocks: [
      { k: 'text', text: 'ผลึกพลังคือวิธีเดียวที่เพิ่มค่าพลังของตัวละครถาวร (นอกเหนือจากเลเวล) — ใช้ด้วยปุ่ม F' },
      { k: 'text', text: '⚔ ฆ่ามอนสเตอร์ → มีโอกาสดรอปกล่อง → เปิดกล่องลุ้นผลึก (กล่องยิ่งสูง ยิ่งได้ผลึกดี) · บอสดรอปผลึกแน่นอน', size: 12, color: '#d6e4ee' },
      { k: 'section', title: '✦ เพดานค่าที่อัปได้' },
      { k: 'stats', items: statChips(TRAIN_CAP) },
      { k: 'section', title: '🎁 ระดับกล่อง' },
      ...TIERS.map((t): Block => ({ k: 'row', icon: itemSprite(t), text: BOXES[t].name, sub: `${range(BOXES[t].rolls[0], BOXES[t].rolls[1])} ชิ้น · ${ORDER.filter((r) => BOXES[t].rarity[r]).map((r) => RARITY[r].name).join('/')}`, color: RARITY[rar(ITEMS[t])].color })),
      ...boxZoneBlocks(),
      ...adventureBlocks(),
    ],
  };
}

function elixirEntry(d: ItemDef): Entry {
  const gains = d.elixir!.gains;
  const blocks: Block[] = [
    { k: 'text', text: d.desc },
    { k: 'section', title: '✦ ใช้แล้วได้ถาวร' },
    { k: 'stats', items: statChips(gains) },
    { k: 'text', text: `เพดาน: ${(Object.keys(gains) as (keyof Stats)[]).map((k) => statLine({ [k]: TRAIN_CAP[k] })).join(' · ')}`, size: 12, color: '#a9bccb' },
    { k: 'section', title: '🔨 วิธีได้มา' },
    { k: 'text', text: '🎁 คราฟต์ไม่ได้ — สุ่มได้จากกล่องดรอปเท่านั้น', color: RARITY.legendary.color },
  ];
  const bars = boxBars(d.id);
  if (bars) blocks.push(bars);
  if (d.id === 'elixir_soul' || d.id === 'elixir_atk') {
    const bosses = baseMobs().filter((m) => m.ai === 'boss' && (m.xp >= 700) === (d.id === 'elixir_soul')).map((m) => m.name);
    if (bosses.length) blocks.push({ k: 'text', text: `👑 ดรอปแน่นอนจาก: ${bosses.join(', ')}`, size: 12, color: '#ffcd75' });
  }
  return { id: d.id, name: d.name, rarity: rar(d), sprite: itemSprite(d.id), group: 'elixir', featured: rar(d) === 'legendary', quick: [statLine(gains)], blocks };
}

function enhanceEntry(d: ItemDef): Entry {
  return { id: d.id, name: d.name, rarity: rar(d), sprite: itemSprite(d.id), group: 'enhance', quick: [d.desc], blocks: [{ k: 'text', text: d.desc }, ...recipeBlocks(d.id)] };
}

// ---------------------------------------------------------------- แท็บทั้งหมด

export const TABS: TabDef[] = [
  {
    id: 'weapons', label: '⚔ อาวุธ', title: 'อาวุธ & เครื่องมือ',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'legend', label: '✨ เทพ' }, { id: 'melee', label: 'ประชิด' }, { id: 'ranged', label: 'ระยะไกล' }, { id: 'ammo', label: 'กระสุน' }, { id: 'tool', label: 'เครื่องมือ' }],
    entries: weaponEntries,
  },
  {
    id: 'gear', label: '🛡 ชุดสวมใส่', title: 'อุปกรณ์สวมใส่',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, ...GEAR_ORDER.map((k) => ({ id: k, label: gearName(k) }))],
    entries: gearEntries,
  },
  {
    id: 'build', label: '🏠 บ้าน', title: 'บ้าน & สิ่งก่อสร้าง',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, ...(['building', 'structure', 'furniture', 'farm', 'terrain'] as BuildCategory[]).map((c) => ({ id: c, label: CATEGORY_NAMES[c] }))],
    entries: () => buildsOf(['building', 'structure', 'furniture', 'farm', 'terrain']).filter((b) => !b.dock).map(buildEntry),
  },
  {
    id: 'boat', label: '⛵ ยานพาหนะ', title: 'ยานพาหนะ ทางน้ำ บก อากาศ',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'water', label: '⛵ ทางน้ำ' }, { id: 'land', label: '🐎 ทางบก' }, { id: 'air', label: '🎈 ทางอากาศ' }],
    entries: () => [boatOverview(), ...BUILDABLES.filter((b) => b.boat || b.dock).map(boatEntry)],
  },
  {
    id: 'machine', label: '⚙ เครื่องจักร', title: 'เครื่องจักร & ป้องกัน',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'machine', label: CATEGORY_NAMES.machine }, { id: 'defense', label: CATEGORY_NAMES.defense }],
    entries: () => buildsOf(['machine', 'defense']).map(buildEntry),
  },
  {
    id: 'mobs', label: '👹 มอนสเตอร์', title: 'มอนสเตอร์ & บอส',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'legend', label: '🐉 ตำนาน' }, { id: 'boss', label: '👑 บอส' }, { id: 'monster', label: 'มอนสเตอร์' }, { id: 'animal', label: 'สัตว์' }, { id: 'sea', label: '🌊 สัตว์น้ำ' }],
    entries: mobEntries,
  },
  {
    id: 'shop', label: '🛒 ร้านค้า', title: 'ร้านค้า เกาะกลาง',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'buy', label: '🛒 พ่อค้าขาย' }, { id: 'sell', label: '💰 พ่อค้ารับซื้อ' }, { id: 'gem', label: '💎 เพชร & กล่อง' }],
    entries: shopEntries,
  },
  {
    id: 'elixir', label: '✦ ผลึก & กล่อง', title: 'ผลึกพลัง & กล่องดรอป',
    filters: [{ id: 'all', label: 'ทั้งหมด' }, { id: 'elixir', label: 'ผลึกพลัง' }, { id: 'box', label: 'กล่อง' }, { id: 'blueprint', label: 'แปลน' }, { id: 'enhance', label: '⬆ อัพเกรด' }],
    entries: () => [
      elixirOverview(),
      ...ITEM_LIST.filter((d) => d.elixir).map(elixirEntry),
      ...TIERS.map(boxEntry),
      ...blueprintEntries(),
      upgradeOverview(),
      ...['enhance_stone'].filter((id) => ITEMS[id]).map((id) => enhanceEntry(ITEMS[id])),
    ],
  },
];
