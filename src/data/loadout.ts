import type { ItemDef } from './items';

/**
 * หมวดของ + ช่องใช้งาน (ดู DESIGN.md 5.3b)
 * แถบด้านล่างแถบเดียว = 5 ช่องหมวด หมวดละ 1 ชิ้น (สลับในช่องได้) ทำงานพร้อมกัน:
 *   ⚔ อาวุธ (equip.weapon หรือของขว้างในมือ) · ⛏ เครื่องมือ (equip.tool1 — สลับเองตามเป้า) · ❤ ฟื้นเลือด (heal = id อาหาร/ยา)
 *   ✨ บัฟ (buff = id ผลึกพลัง) · 🔦 แสง (equip.lamp) — 🛡 มือรอง สวมจากกระเป๋า
 */

/** หมวดในกระเป๋า/คลังเสบียง */
export type ItemCat = 'weapon' | 'tool' | 'wear' | 'food' | 'mat' | 'misc';
export const ITEM_CATS: { id: ItemCat; icon: string; name: string; color: number }[] = [
  { id: 'weapon', icon: '⚔', name: 'อาวุธ', color: 0xc46a5e },
  { id: 'tool', icon: '⛏', name: 'เครื่องมือ', color: 0xe3c178 },
  { id: 'wear', icon: '🛡', name: 'สวมใส่', color: 0x7fb3c9 },
  { id: 'food', icon: '🍖', name: 'อาหาร/ยา', color: 0x8fbf7a },
  { id: 'mat', icon: '🧱', name: 'วัตถุดิบ', color: 0xb08a6a },
  { id: 'misc', icon: '📦', name: 'อื่นๆ', color: 0x9aa7a4 },
];
export const CAT_INFO = Object.fromEntries(ITEM_CATS.map((c) => [c.id, c])) as Record<ItemCat, (typeof ITEM_CATS)[number]>;

export function catOf(d: ItemDef): ItemCat {
  switch (d.type) {
    case 'weapon': case 'ranged': case 'throw': return 'weapon';
    case 'tool': case 'rod': case 'light': return 'tool';
    case 'armor': case 'cosmetic': return 'wear';
    case 'food': case 'heal': case 'elixir': return 'food';
    case 'material': return 'mat';
    default: return 'misc'; // กล่อง เมล็ด กระสุน แปลน
  }
}

/** ช่องใหม่ที่เก็บใน Player.equip (เซฟไปพร้อมอุปกรณ์) */
export type LoadoutKey = 'tool1' | 'tool2' | 'lamp';
/** เครื่องมือเหลือช่องเดียว (tool2 เก็บไว้แค่ให้เซฟเก่าโหลดได้ — ย้ายกลับเข้ากระเป๋าตอนโหลด) */
export const BELT_KEYS: LoadoutKey[] = ['tool1'];

/** ชนิดช่องใช้งาน (offhand = สวมจากกระเป๋า ไม่อยู่บนแถบ) */
export type LoadKind = 'weapon' | 'tool' | 'heal' | 'buff' | 'lamp' | 'offhand';
/** ช่องบนแถบด้านล่าง (เรียงซ้าย→ขวา · ปุ่มเลข 1–5) */
export const BAR_KINDS: LoadKind[] = ['weapon', 'tool', 'heal', 'buff', 'lamp'];
export const LOAD_INFO: Record<LoadKind, { icon: string; name: string; hint: string; tap: string; ghost: string }> = {
  weapon: { icon: '⚔', name: 'อาวุธ', hint: 'ดาบ ธนู ไม้เท้า ของขว้าง — ใช้ตีมอน', tap: 'สลับอาวุธ', ghost: 'i_wood_sword' },
  tool: { icon: '⛏', name: 'เครื่องมือ', hint: 'ขวาน อีเต้อ คันเบ็ด — ตีต้นไม้/หิน/หันเข้าน้ำ = สลับชิ้นที่เหมาะให้เอง', tap: 'สลับเครื่องมือ', ghost: 'i_stone_axe' },
  heal: { icon: '❤', name: 'ฟื้นเลือด', hint: 'อาหาร น้ำ ยา ผ้าพันแผล — กดช่องหรือ F = กิน/ใช้', tap: 'กิน/ใช้', ghost: 'i_bandage' },
  buff: { icon: '✨', name: 'บัฟ', hint: 'ผลึกพลัง (เพิ่มค่าพลังถาวร) — กดช่อง = ใช้', tap: 'ใช้', ghost: 'i_elixir_atk' },
  lamp: { icon: '🔦', name: 'แสง', hint: 'คบไฟ — สว่าง + อุ่นตลอด ไม่ต้องถือ (ไส้หมดเฉพาะตอนมืด)', tap: 'สลับไฟ', ghost: 'i_torch' },
  offhand: { icon: '🛡', name: 'มือรอง', hint: 'โล่/ตะเกียง — สวมจากกระเป๋า', tap: '', ghost: 'i_wood_shield' },
};

/** ใส่ช่องเครื่องมือได้: เครื่องมือ/คันเบ็ด หรืออาวุธที่ตัดไม้/ขุดได้ดี (ขวานรบ ค้อน) */
export function canBelt(d: ItemDef) {
  return d.type === 'tool' || d.type === 'rod' || (!!d.tool && (d.tool.tree >= 2 || d.tool.rock >= 2));
}

/** ช่องที่ของชิ้นนี้ลงได้ (null = ไว้ในกระเป๋า) */
export function loadKindOf(d: ItemDef): LoadKind | null {
  if (d.type === 'weapon' || d.type === 'ranged' || d.type === 'throw') return 'weapon';
  if (d.type === 'tool' || d.type === 'rod') return 'tool';
  if (d.type === 'light') return 'lamp';
  if (d.type === 'elixir') return 'buff';
  if (d.equip?.slot === 'offhand') return 'offhand';
  if (d.food && (d.type === 'food' || d.type === 'heal')) return 'heal';
  return null;
}
