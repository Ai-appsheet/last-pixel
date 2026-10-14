import type { Rarity } from './loot';
import type { GearKind, Stats } from './equipment';
import { upCategoryOfItem } from './upgrade';
import { LEGACY_WEAPON_PATCH, WEAPON_ITEMS, type StatusHit, type ThrowKind, type WeaponClass, type WeaponSpecial } from './weapons';

export type ItemType =
  | 'material' | 'food' | 'tool' | 'weapon' | 'heal' | 'light' | 'seed' | 'armor' | 'ranged' | 'ammo' | 'throw' | 'rod'
  | 'box' | 'cosmetic' | 'elixir' | 'blueprint';

/** พลังพิเศษของอาวุธเทพ */
export type WeaponEffect = 'chain' | 'burn' | 'lifesteal' | 'multishot' | 'explode' | 'shockwave';

export interface ItemDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  type: ItemType;
  stack: number;
  /** มูลค่าโดยประมาณ (เหรียญ) — ใช้คิดราคาซื้อ/ขาย */
  value: number;
  food?: { hunger?: number; thirst?: number; hp?: number; sanity?: number };
  /** สมดุลร่างกาย: p โปรตีน · e พลังงาน/แป้ง · v วิตามิน (+0–100) · risk = โอกาสท้องเสีย · cure = หายป่วย (ดู systems/BodySystem.ts) */
  nutri?: Nutri;
  tool?: { damage: number; range: number; tree: number; rock: number; durability: number };
  light?: { radius: number; durability: number };
  crop?: string;
  /** อุปกรณ์สวมใส่: ช่อง + ค่าสถานะ (+ความทนทาน, ลุคบนตัวละคร, ให้ความอบอุ่น) */
  equip?: { slot: GearKind; stats: Partial<Stats>; durability?: number; look?: string; warm?: boolean };
  /** อาวุธยิง: ammo = null คือไม่ใช้กระสุน (เช่น ไม้เท้าเวท) · pellets/spread = ยิงกระจาย · life = อายุกระสุน · returns = บินกลับ · mana = สแตมินาต่อการร่ายเวท */
  ranged?: {
    damage: number; ammo: string | null; speed: number; cooldown: number; durability: number; projectile: string; pierce?: boolean;
    pellets?: number; spread?: number; life?: number; returns?: boolean; mana?: number;
  };
  /** ของขว้าง: kind = ชนิด (ระเบิด/ขวดเพลิง/น้ำแข็ง/ควัน/มีดบิน…) · dur = เวลาพื้นที่ค้าง · count = ลูกปราย */
  throw?: { damage: number; radius: number; kind?: ThrowKind; dur?: number; count?: number };
  rarity?: Rarity;
  effect?: WeaponEffect;
  // ---------- ระบบอาวุธชุดขยาย (ดู data/weapons.ts) ----------
  /** ชนิดอาวุธ — กำหนดความเร็ว/วงฟัน/จำนวนเป้า/คอมโบ */
  weaponClass?: WeaponClass;
  /** สถานะที่ใส่ให้ศัตรูเมื่อโดน */
  status?: StatusHit[];
  /** ตัวคูณแรงผลักเพิ่ม */
  knockback?: number;
  /** คริติคอลเพิ่ม (%) */
  critBonus?: number;
  /** สายฟ้ากระโดดไปหาศัตรูอีก n ตัว */
  chain?: number;
  /** พลังพิเศษของอาวุธเทพชุดใหม่ */
  special?: WeaponSpecial;
  /** ชุดแฟชั่น: ชนิด + id ใน heroes.ts */
  cosmetic?: { slot: 'outfit' | 'helmet' | 'cape'; id: string };
  /** อัพเกรด 10 ระดับได้ (ดู data/upgrade.ts) */
  enhanceable?: boolean;
  /** ผลึกพลัง: ใช้แล้วเพิ่มค่าสถานะถาวร (มีเพดาน) — ได้จากกล่องเท่านั้น */
  elixir?: { gains: Partial<Stats>; };
}

export interface Nutri {
  p?: number;
  e?: number;
  v?: number;
  risk?: number;
  cure?: boolean;
}

const I = (d: Omit<ItemDef, 'stack' | 'value'> & { stack?: number; value?: number }): ItemDef => ({ stack: 40, value: 1, ...d });
const sword = (id: string, name: string, desc: string, damage: number, durability: number, value: number) =>
  I({ id, name, desc, icon: `i_${id}`, type: 'weapon', stack: 1, value, tool: { damage, range: 20, tree: 0.5, rock: 0, durability } });
/** อุปกรณ์สวมใส่ — กด F หรือคลิกในหน้าต่างกระเป๋าเพื่อสวม */
const gear = (id: string, name: string, slot: GearKind, desc: string, stats: Partial<Stats>, value: number, extra: { durability?: number; look?: string; warm?: boolean; rarity?: Rarity } = {}) =>
  I({ id, name, desc, icon: `i_${id}`, type: 'armor', stack: 1, value, rarity: extra.rarity, equip: { slot, stats, durability: extra.durability, look: extra.look, warm: extra.warm } });

/** ผลึกพลัง — กด F ใช้ เพิ่มค่าถาวร (เพดานดูที่ TRAIN_CAP) */
const elixir = (id: string, name: string, gains: Partial<Stats>, value: number, rarity: Rarity) =>
  I({ id, name, desc: 'ใช้แล้วค่าพลังเพิ่มถาวร (มีเพดาน) — สุ่มได้จากกล่องดรอปเท่านั้น · กด F', icon: `i_${id}`, type: 'elixir', stack: 99, value, rarity, elixir: { gains } });

const items: ItemDef[] = [
  // ---------- วัตถุดิบพื้นฐาน ----------
  I({ id: 'wood', name: 'ไม้', desc: 'ตัดจากต้นไม้', icon: 'i_wood', type: 'material' }),
  I({ id: 'stone', name: 'หิน', desc: 'ทุบหินด้วยอีเต้อ', icon: 'i_stone', type: 'material' }),
  I({ id: 'fiber', name: 'หญ้าแห้ง', desc: 'เก็บจากกอหญ้า', icon: 'grass_0', type: 'material' }),
  I({ id: 'rope', name: 'เชือก', desc: 'ใช้ทำเครื่องมือและเรือ', icon: 'i_rope', type: 'material', stack: 40, value: 4 }),
  I({ id: 'hide', name: 'หนังสัตว์', desc: 'จากหมูป่า/หมาป่า ใช้ทำเกราะ', icon: 'i_hide', type: 'material', stack: 20, value: 6 }),
  I({ id: 'bone', name: 'กระดูก', desc: 'จากโครงกระดูก', icon: 'i_bone', type: 'material', stack: 40, value: 3 }),
  // ---------- แร่ ----------
  I({ id: 'coal', name: 'ถ่านหิน', desc: 'เชื้อเพลิงเตาหลอม/เครื่องปั่นไฟ', icon: 'i_coal', type: 'material', value: 3 }),
  I({ id: 'sulfur', name: 'กำมะถัน', desc: 'ใช้ทำดินปืน', icon: 'i_sulfur', type: 'material', value: 5 }),
  I({ id: 'iron_ore', name: 'แร่เหล็ก', desc: 'หลอมเป็นเหล็กแท่ง', icon: 'i_iron_ore', type: 'material', value: 5 }),
  I({ id: 'iron_ingot', name: 'เหล็กแท่ง', desc: 'วัสดุเครื่องมือ/เครื่องจักร', icon: 'i_iron_ingot', type: 'material', stack: 40, value: 14 }),
  I({ id: 'gold_ore', name: 'แร่ทอง', desc: 'ต้องใช้อีเต้อเหล็ก', icon: 'i_gold_ore', type: 'material', value: 18 }),
  I({ id: 'gold_ingot', name: 'ทองแท่ง', desc: 'ของมีค่า/วงจรเครื่องยนต์', icon: 'i_gold_ingot', type: 'material', stack: 20, value: 45 }),
  I({ id: 'crystal', name: 'คริสตัล', desc: 'อัญมณีพลังเวท', icon: 'i_crystal', type: 'material', stack: 20, value: 60 }),
  I({ id: 'meteorite', name: 'อุกกาบาต', desc: 'แร่จากฟ้า — ได้จากภัยฝนอุกกาบาต', icon: 'i_meteorite', type: 'material', stack: 20, value: 80 }),
  // ---------- ชิ้นส่วน ----------
  I({ id: 'gunpowder', name: 'ดินปืน', desc: 'ใช้ทำกระสุนและระเบิด', icon: 'i_gunpowder', type: 'material', value: 10 }),
  I({ id: 'gear', name: 'เฟือง', desc: 'ชิ้นส่วนเครื่องจักร', icon: 'i_gear', type: 'material', value: 12 }),
  I({ id: 'engine', name: 'เครื่องยนต์', desc: 'หัวใจของเรือยนต์', icon: 'i_engine', type: 'material', stack: 5, value: 150 }),
  I({ id: 'fuel', name: 'น้ำมัน', desc: 'เติมเรือยนต์/เครื่องปั่นไฟ', icon: 'i_fuel', type: 'material', stack: 20, value: 12 }),
  I({ id: 'coin', name: 'เหรียญทอง', desc: 'เงินหลักของเกม — เก็บแล้วเข้ากระเป๋าเงินอัตโนมัติ', icon: 'i_coin', type: 'material', stack: 9999, value: 1 }),
  I({ id: 'gem', name: 'เพชร', desc: 'เงินหายาก — แลกได้ 100 เหรียญ หรือซื้อของพิเศษ', icon: 'i_gem', type: 'material', stack: 9999, value: 100, rarity: 'epic' }),
  // ---------- ของจากมอนสเตอร์ ----------
  I({ id: 'slime_gel', name: 'เจลสไลม์', desc: 'เหนียวหนึบ ใช้ทำผ้าพันแผล', icon: 'i_slime_gel', type: 'material', value: 4 }),
  I({ id: 'bat_wing', name: 'ปีกค้างคาว', desc: 'ใช้ทำลูกธนูบินไกล', icon: 'i_bat_wing', type: 'material', value: 5 }),
  I({ id: 'crab_shell', name: 'กระดองปู', desc: 'แข็งมาก ใช้ทำเกราะ', icon: 'i_crab_shell', type: 'material', stack: 20, value: 12 }),
  I({ id: 'yeti_fur', name: 'ขนเยติ', desc: 'อุ่นสุดๆ', icon: 'i_yeti_fur', type: 'material', stack: 20, value: 20 }),
  I({ id: 'demon_horn', name: 'เขาปีศาจ', desc: 'ของหายากจากราชาปีศาจ', icon: 'i_demon_horn', type: 'material', stack: 10, value: 150 }),
  // ---------- ของจากสัตว์ชุดใหม่ (สัตว์ป่า/สัตว์ในน้ำ) ----------
  I({ id: 'antler', name: 'เขากวาง', desc: 'จากกวางป่า — ด้ามไม้กายสิทธิ์', icon: 'i_antler', type: 'material', stack: 20, value: 8 }),
  I({ id: 'feather', name: 'ขนนก', desc: 'จากนกแก้ว/เพนกวิน — ทำลูกธนูบินตรง ไม้เท้าวายุ', icon: 'i_feather', type: 'material', stack: 40, value: 3 }),
  I({ id: 'venom_sac', name: 'ต่อมพิษ', desc: 'จากงูเห่า/แมงป่อง — ระเบิดแก๊สพิษ อาวุธพิษ', icon: 'i_venom_sac', type: 'material', stack: 20, value: 30 }),
  I({ id: 'glow_mushroom', name: 'เห็ดเรืองแสง', desc: 'เห็ดจากเกาะเห็ดยักษ์/หนองน้ำ — กินแล้วจิตใจสงบ ฟื้นสติ', icon: 'i_glow_mushroom', type: 'food', stack: 40, value: 18, food: { hunger: 6, sanity: 18 } }),
  I({ id: 'glow_dust', name: 'ผงหิ่งห้อย', desc: 'ผงเรืองแสงจากฝูงหิ่งห้อยยามค่ำ — วัตถุดิบเวทมนตร์', icon: 'i_glow_dust', type: 'material', stack: 40, value: 12 }),
  I({ id: 'turtle_shell', name: 'กระดองเต่าทะเล', desc: 'จากเต่าทะเล — ไม้เท้าวารี', icon: 'i_turtle_shell', type: 'material', stack: 10, value: 35 }),
  I({ id: 'shark_tooth', name: 'เขี้ยวฉลาม', desc: 'จากฉลามขาว — คมกริบ ใช้ทำไม้เท้าโลหิต', icon: 'i_shark_tooth', type: 'material', stack: 20, value: 30 }),
  I({ id: 'pearl', name: 'ไข่มุก', desc: 'จากสัตว์ทะเล — ขายได้ราคาดี ใช้ทำอาวุธธาตุน้ำ', icon: 'i_pearl', type: 'material', stack: 20, value: 120 }),
  // ---------- ของจากสัตว์ในตำนาน (ดรอปแน่นอนเมื่อล้มได้ · ทำอาวุธเวทขั้นสูง) ----------
  I({ id: 'naga_scale', name: 'เกล็ดพญานาค', desc: 'เกล็ดมรกตขอบทองของพญานาค — คทาพญานาค', icon: 'i_naga_scale', type: 'material', stack: 20, value: 320, rarity: 'epic' }),
  I({ id: 'garuda_feather', name: 'ขนพญาครุฑ', desc: 'ขนสีแดงทองเรืองแสงของพญาครุฑ — คัมภีร์ครุฑ', icon: 'i_garuda_feather', type: 'material', stack: 20, value: 320, rarity: 'epic' }),
  I({ id: 'qilin_horn', name: 'เขากิเลน', desc: 'เขาเกลียวที่มีประกายสายฟ้า — คทาอัสนีกิเลน', icon: 'i_qilin_horn', type: 'material', stack: 10, value: 360, rarity: 'epic' }),
  I({ id: 'phoenix_feather', name: 'ขนหงส์เพลิง', desc: 'ขนนกที่ลุกเป็นไฟไม่มีวันมอด — ลูกแก้วหงส์เพลิง', icon: 'i_phoenix_feather', type: 'material', stack: 20, value: 340, rarity: 'epic' }),
  I({ id: 'kraken_ink', name: 'หมึกคราเคน', desc: 'หมึกดำม่วงจากห้วงทะเลลึก — คัมภีร์ห้วงทะเลลึก', icon: 'i_kraken_ink', type: 'material', stack: 20, value: 300, rarity: 'epic' }),
  I({ id: 'kochasi_tusk', name: 'งาคชสีห์', desc: 'งาช้างประดับทองของผู้พิทักษ์ — ไม้เท้าแสงศักดิ์สิทธิ์', icon: 'i_kochasi_tusk', type: 'material', stack: 10, value: 360, rarity: 'epic' }),
  I({ id: 'frost_dragon_scale', name: 'เกล็ดมังกรน้ำแข็ง', desc: 'เกล็ดใสเย็นเฉียบ — ลูกแก้วมังกรน้ำแข็ง', icon: 'i_frost_dragon_scale', type: 'material', stack: 20, value: 340, rarity: 'epic' }),
  I({ id: 'jade_shell', name: 'กระดองหยกศิลา', desc: 'เศษกระดองเต่ายักษ์ฝังหยก — ลูกแก้วธรณี', icon: 'i_jade_shell', type: 'material', stack: 10, value: 360, rarity: 'epic' }),
  // ---------- วัสดุก่อสร้าง (แปรรูป — ใช้สร้างบ้าน/อาคารขั้นสูง · ไอคอนอยู่ใน art/buildings2.ts) ----------
  I({ id: 'plank', name: 'ไม้กระดาน', desc: 'ไม้แปรรูป — ทำที่โต๊ะช่าง หรือใส่ไม้ในโรงเลื่อยให้ผลิตเอง', icon: 'i_plank', type: 'material', stack: 60, value: 2 }),
  I({ id: 'brick', name: 'อิฐ', desc: 'เผาจากหินที่เตาหลอม — สร้างบ้านอิฐ/กำแพงอิฐ', icon: 'i_brick', type: 'material', stack: 60, value: 3 }),
  I({ id: 'glass', name: 'กระจก', desc: 'หลอมหินกับถ่านที่เตาหลอม — หน้าต่าง/โรงเพาะชำ', icon: 'i_glass', type: 'material', stack: 40, value: 6 }),
  I({ id: 'steel_plate', name: 'เหล็กกล้า', desc: 'เหล็กแท่งหลอมซ้ำกับถ่าน แข็งแรงมาก — ป้อมปราการ/อาวุธป้อม', icon: 'i_steel_plate', type: 'material', stack: 40, value: 35 }),
  // ---------- ผลผลิตจากฟาร์ม/ครัว (ได้จากรังผึ้ง เล้าไก่ และเมนูที่ครัว) ----------
  I({ id: 'egg', name: 'ไข่ไก่', desc: 'จากเล้าไก่ — ทำอาหารที่ครัว', icon: 'i_egg', type: 'food', stack: 30, value: 3, food: { hunger: 6, hp: -2 } }),
  I({ id: 'honey', name: 'น้ำผึ้ง', desc: 'จากรังผึ้ง หวานชื่นใจ ฟื้นสติ', icon: 'i_honey', type: 'food', stack: 30, value: 6, food: { hunger: 6, hp: 4, sanity: 6 } }),
  I({ id: 'fried_egg', name: 'ไข่เจียว', desc: 'เมนูง่ายๆ ที่ครัว อิ่มอร่อย', icon: 'i_fried_egg', type: 'food', stack: 20, value: 10, food: { hunger: 28, hp: 8, sanity: 5 } }),
  I({ id: 'tom_yum', name: 'ต้มยำปลา', desc: 'เผ็ดร้อนสดชื่น แก้กระหาย ฟื้น HP', icon: 'i_tom_yum', type: 'food', stack: 10, value: 30, food: { hunger: 45, thirst: 30, hp: 25, sanity: 15 } }),
  I({ id: 'pumpkin_curry', name: 'แกงฟักทอง', desc: 'อิ่มนานมาก ฟื้นทุกอย่าง', icon: 'i_pumpkin_curry', type: 'food', stack: 10, value: 36, food: { hunger: 65, thirst: 10, hp: 30, sanity: 18 } }),
  I({ id: 'honey_cake', name: 'เค้กน้ำผึ้ง', desc: 'ของหวานชั้นเลิศ ฟื้นสติมหาศาล', icon: 'i_honey_cake', type: 'food', stack: 10, value: 40, food: { hunger: 40, hp: 15, sanity: 45 } }),
  I({ id: 'skewer', name: 'หมูปิ้งน้ำผึ้ง', desc: 'พกง่าย อิ่มเร็ว', icon: 'i_skewer', type: 'food', stack: 20, value: 14, food: { hunger: 30, hp: 12, sanity: 6 } }),
  I({ id: 'fruit_juice', name: 'น้ำผลไม้ปั่น', desc: 'ดับกระหายชั้นยอด', icon: 'i_juice', type: 'food', stack: 20, value: 12, food: { hunger: 6, thirst: 55, sanity: 8 } }),

  // ---------- อาหาร ----------
  I({ id: 'berry', name: 'เบอร์รี่', desc: 'อิ่มนิดหน่อย แก้กระหาย', icon: 'i_berry', type: 'food', stack: 40, food: { hunger: 8, thirst: 4 } }),
  I({ id: 'raw_meat', name: 'เนื้อดิบ', desc: 'ย่างก่อนดีกว่า', icon: 'i_raw_meat', type: 'food', stack: 20, value: 3, food: { hunger: 12, hp: -8, sanity: -5 } }),
  I({ id: 'cooked_meat', name: 'เนื้อย่าง', desc: 'อิ่มมาก ฟื้น HP', icon: 'i_cooked_meat', type: 'food', stack: 20, value: 6, food: { hunger: 35, hp: 10, sanity: 3 } }),
  I({ id: 'fish', name: 'ปลาสด', desc: 'ตกได้จากทะเล', icon: 'i_fish', type: 'food', stack: 20, value: 4, food: { hunger: 10, hp: -3 } }),
  I({ id: 'cooked_fish', name: 'ปลาย่าง', desc: 'อร่อย ฟื้นสติ', icon: 'i_cooked_fish', type: 'food', stack: 20, value: 8, food: { hunger: 30, hp: 8, sanity: 6 } }),
  I({ id: 'carrot', name: 'แครอท', desc: 'ผักสดกรอบ', icon: 'i_carrot', type: 'food', stack: 40, value: 4, food: { hunger: 14, thirst: 4, sanity: 2 } }),
  I({ id: 'tomato', name: 'มะเขือเทศ', desc: 'ฉ่ำน้ำ แก้กระหาย', icon: 'i_tomato', type: 'food', stack: 40, value: 5, food: { hunger: 10, thirst: 18 } }),
  I({ id: 'pumpkin', name: 'ฟักทอง', desc: 'อิ่มนาน', icon: 'i_pumpkin', type: 'food', stack: 20, value: 10, food: { hunger: 30, sanity: 2 } }),
  I({ id: 'cactus_fruit', name: 'ผลกระบองเพชร', desc: 'แหล่งน้ำกลางทะเลทราย', icon: 'i_cactus_fruit', type: 'food', stack: 20, value: 3, food: { thirst: 22, hunger: 4 } }),
  I({ id: 'veggie_stew', name: 'สตูว์ผัก', desc: 'ฟื้นทุกอย่าง', icon: 'i_stew', type: 'food', stack: 10, value: 22, food: { hunger: 55, thirst: 15, hp: 20, sanity: 20 } }),
  I({ id: 'pumpkin_pie', name: 'พายฟักทอง', desc: 'ฟื้นสติมาก', icon: 'i_pie', type: 'food', stack: 10, value: 28, food: { hunger: 45, hp: 10, sanity: 35 } }),
  // ---------- อาหาร/น้ำ ชุดสมดุลร่างกาย + ของจากเกาะกิจกรรม ----------
  I({ id: 'coconut', name: 'มะพร้าว', desc: 'จากต้นมะพร้าวริมหาด — น้ำสะอาดดื่มได้เลย', icon: 'i_coconut', type: 'food', stack: 20, value: 4, food: { hunger: 6, thirst: 30 } }),
  I({ id: 'wild_potato', name: 'มันป่า', desc: 'ขุดจากพืชป่า — กินดิบได้แต่ย่างดีกว่า', icon: 'i_wild_potato', type: 'food', stack: 30, value: 3, food: { hunger: 10 } }),
  I({ id: 'baked_potato', name: 'มันเผา', desc: 'แป้งให้พลังงาน อิ่มนาน', icon: 'i_baked_potato', type: 'food', stack: 20, value: 8, food: { hunger: 28, hp: 4 } }),
  I({ id: 'flatbread', name: 'ขนมปังแผ่น', desc: 'อบจากเมล็ดข้าวป่าบนกองไฟ — พลังงานล้วน', icon: 'i_flatbread', type: 'food', stack: 20, value: 8, food: { hunger: 26, sanity: 2 } }),
  I({ id: 'mango', name: 'มะม่วงสุก', desc: 'ผลไม้หายากจากสวนลอยฟ้า — วิตามินเพียบ', icon: 'i_mango', type: 'food', stack: 20, value: 14, food: { hunger: 12, thirst: 12, sanity: 3 } }),
  I({ id: 'dragonfruit', name: 'แก้วมังกร', desc: 'ผลไม้หายาก ฉ่ำน้ำ — วิตามินสูงสุด', icon: 'i_dragonfruit', type: 'food', stack: 20, value: 18, food: { hunger: 8, thirst: 16, sanity: 5 } }),
  I({ id: 'seaweed', name: 'สาหร่ายทะเล', desc: 'จากหอย/แนวปะการัง — วิตามิน + โปรตีนนิดหน่อย', icon: 'i_seaweed', type: 'food', stack: 40, value: 3, food: { hunger: 6, thirst: 2 } }),
  I({ id: 'wild_mushroom', name: 'เห็ดป่า', desc: 'เก็บจากพื้นป่า — กินดิบเสี่ยงท้องเสียเล็กน้อย', icon: 'i_wild_mushroom', type: 'food', stack: 30, value: 3, food: { hunger: 6 } }),
  I({ id: 'dirty_water', name: 'น้ำดิบ (กระบอก)', desc: 'ตักจากทะเล/บึง — ดื่มได้แต่เสี่ยงท้องเสีย 20% · ต้มที่กองไฟให้สะอาด', icon: 'i_dirty_water', type: 'food', stack: 10, value: 1, food: { thirst: 25 } }),
  I({ id: 'clean_water', name: 'น้ำต้มสุก', desc: 'น้ำสะอาด ดื่มปลอดภัย (ต้มน้ำดิบ/น้ำแข็งที่กองไฟ)', icon: 'i_clean_water', type: 'food', stack: 10, value: 4, food: { thirst: 38 } }),
  I({ id: 'flower_tea', name: 'ชาดอกไม้', desc: 'ชาหอมจากกลีบดอกไม้ ผ่อนคลาย ฟื้นสติ', icon: 'i_flower_tea', type: 'food', stack: 10, value: 12, food: { thirst: 28, sanity: 15 } }),
  I({ id: 'herb', name: 'สมุนไพร', desc: 'ใบยาจากป่า — เคี้ยวแล้วหายท้องเสีย/ป่วย', icon: 'i_herb', type: 'food', stack: 40, value: 6, food: { hp: 4, sanity: 4 } }),
  I({ id: 'herbal_medicine', name: 'ยาสมุนไพร', desc: 'ยาต้มจากสมุนไพร — หายป่วยทันที + ฟื้น HP', icon: 'i_herbal_medicine', type: 'heal', stack: 20, value: 22, food: { hp: 15 } }),
  // ---------- วัตถุดิบจากการเก็บทุกอย่างในโลก (ของตกแต่ง ซากเรือ เกาะกิจกรรม) ----------
  I({ id: 'scrap_metal', name: 'เศษเหล็ก', desc: 'จากซากเครื่องบิน/ซากเรือ/ปืนใหญ่ — หลอมเป็นเหล็กแท่งได้', icon: 'i_scrap_metal', type: 'material', stack: 60, value: 4 }),
  I({ id: 'cloth', name: 'ผ้าใบ', desc: 'ผ้าเก่าจากถังไม้/ซากเรือ — ทำผ้าพันแผล เชือก', icon: 'i_cloth', type: 'material', stack: 40, value: 4 }),
  I({ id: 'shell', name: 'เปลือกหอย', desc: 'เก็บตามชายหาด — ทำสร้อย/ขายได้', icon: 'i_shell', type: 'material', stack: 60, value: 2 }),
  I({ id: 'petals', name: 'กลีบดอกไม้', desc: 'เก็บจากดอกไม้ — ชงชา ทำยา', icon: 'i_petals', type: 'material', stack: 60, value: 2 }),
  I({ id: 'wild_grain', name: 'เมล็ดข้าวป่า', desc: 'จากกอหญ้าสูง — อบเป็นขนมปังแผ่นที่กองไฟ', icon: 'i_wild_grain', type: 'material', stack: 60, value: 2 }),
  I({ id: 'obsidian', name: 'หินออบซิเดียน', desc: 'แก้วภูเขาไฟสีดำ (อีเต้อหิน+) — หลอมเป็นกระจก · หัวลูกธนูคม', icon: 'i_obsidian', type: 'material', stack: 40, value: 15 }),
  I({ id: 'crystal_shard', name: 'เศษคริสตัล', desc: 'เศษผลึกเรืองแสง — ทำคบไฟ ×2 · ขายได้ราคาดี', icon: 'i_crystal_shard', type: 'material', stack: 60, value: 14 }),
  I({ id: 'ice_shard', name: 'ก้อนน้ำแข็ง', desc: 'จากเกาะหิมะ/ธารน้ำแข็ง — ต้มที่กองไฟได้น้ำสะอาด', icon: 'i_ice_shard', type: 'material', stack: 40, value: 2 }),
  // ---------- เมล็ด ----------
  I({ id: 'carrot_seed', name: 'เมล็ดแครอท', desc: 'ถือแล้วกด E ที่แปลงผัก', icon: 'i_seed_carrot', type: 'seed', stack: 40, value: 2, crop: 'carrot' }),
  I({ id: 'tomato_seed', name: 'เมล็ดมะเขือเทศ', desc: 'ถือแล้วกด E ที่แปลงผัก', icon: 'i_seed_tomato', type: 'seed', stack: 40, value: 3, crop: 'tomato' }),
  I({ id: 'pumpkin_seed', name: 'เมล็ดฟักทอง', desc: 'โตช้าแต่คุ้ม', icon: 'i_seed_pumpkin', type: 'seed', stack: 40, value: 5, crop: 'pumpkin' }),
  // ---------- ยา ----------
  I({ id: 'bandage', name: 'ผ้าพันแผล', desc: 'ฟื้น HP 30', icon: 'i_bandage', type: 'heal', stack: 20, value: 8, food: { hp: 30 } }),

  // ---------- เครื่องมือ ----------
  I({ id: 'stone_axe', name: 'ขวานหิน', desc: 'ตัดไม้เร็วขึ้นมาก', icon: 'i_stone_axe', type: 'tool', stack: 1, value: 10, tool: { damage: 9, range: 16, tree: 3, rock: 0.5, durability: 150 } }),
  I({ id: 'stone_pickaxe', name: 'อีเต้อหิน', desc: 'ทุบหิน ถ่านหิน เหล็ก', icon: 'i_stone_pickaxe', type: 'tool', stack: 1, value: 10, tool: { damage: 7, range: 16, tree: 1, rock: 3, durability: 150 } }),
  I({ id: 'iron_axe', name: 'ขวานเหล็ก', desc: 'ตัดไม้แรงมาก', icon: 'i_iron_axe', type: 'tool', stack: 1, value: 40, tool: { damage: 14, range: 16, tree: 6, rock: 1, durability: 400 } }),
  I({ id: 'iron_pickaxe', name: 'อีเต้อเหล็ก', desc: 'ขุดทอง กำมะถัน คริสตัล อุกกาบาต', icon: 'i_iron_pickaxe', type: 'tool', stack: 1, value: 40, tool: { damage: 11, range: 16, tree: 1, rock: 6, durability: 400 } }),
  I({ id: 'fishing_rod', name: 'คันเบ็ด', desc: 'ถือแล้วกด E ริมน้ำเพื่อตกปลา', icon: 'i_fishing_rod', type: 'rod', stack: 1, value: 12 }),
  I({ id: 'torch', name: 'คบไฟ', desc: 'ให้แสง + ความอบอุ่น', icon: 'i_torch', type: 'light', stack: 1, value: 3, light: { radius: 64, durability: 180 } }),

  // ---------- อาวุธระยะประชิด ----------
  sword('wood_sword', 'ดาบไม้', 'อาวุธแรกเริ่ม', 10, 80, 6),
  I({ id: 'spear', name: 'หอก', desc: 'ระยะยาว', icon: 'i_spear', type: 'weapon', stack: 1, value: 14, tool: { damage: 16, range: 24, tree: 0.5, rock: 0, durability: 120 } }),
  I({ id: 'iron_spear', name: 'หอกเหล็ก', desc: 'ระยะยาว แรง', icon: 'i_iron_spear', type: 'weapon', stack: 1, value: 45, tool: { damage: 26, range: 26, tree: 0.5, rock: 0, durability: 300 } }),
  sword('iron_sword', 'ดาบเหล็ก', 'ดาเมจสูง', 28, 300, 55),
  sword('gold_sword', 'ดาบทอง', 'คริติคอลแรง (ทองคม)', 34, 220, 120),
  sword('crystal_sword', 'ดาบคริสตัล', 'อาวุธในตำนาน', 45, 500, 220),
  sword('meteor_sword', 'ดาบอุกกาบาต', 'ร้อนแรงที่สุด', 62, 700, 400),
  // ---------- อาวุธยิง ----------
  I({ id: 'bow', name: 'ธนู', desc: 'ใช้ลูกธนู', icon: 'i_bow', type: 'ranged', stack: 1, value: 18, ranged: { damage: 16, ammo: 'arrow', speed: 300, cooldown: 0.5, durability: 200, projectile: 'arrow' } }),
  I({ id: 'crossbow', name: 'หน้าไม้', desc: 'แรงกว่าธนู ยิงช้า', icon: 'i_crossbow', type: 'ranged', stack: 1, value: 50, ranged: { damage: 32, ammo: 'arrow', speed: 380, cooldown: 0.9, durability: 300, projectile: 'arrow', pierce: true } }),
  I({ id: 'flintlock', name: 'ปืนคาบศิลา', desc: 'ดาเมจมหาศาล ใช้กระสุน', icon: 'i_flintlock', type: 'ranged', stack: 1, value: 120, ranged: { damage: 55, ammo: 'bullet', speed: 480, cooldown: 1.2, durability: 250, projectile: 'bullet' } }),
  I({ id: 'crystal_staff', name: 'ไม้เท้าคริสตัล', desc: 'ยิงลูกไฟเวท ไม่ใช้กระสุน', icon: 'i_crystal_staff', type: 'ranged', stack: 1, value: 200, ranged: { damage: 24, ammo: null, speed: 260, cooldown: 0.45, durability: 300, projectile: 'fireball', pierce: true } }),
  I({ id: 'bomb', name: 'ระเบิด', desc: 'ขว้างใส่กลุ่มศัตรู (ดาเมจวงกว้าง)', icon: 'i_bomb', type: 'throw', stack: 20, value: 20, throw: { damage: 70, radius: 40 } }),
  I({ id: 'arrow', name: 'ลูกธนู', desc: 'กระสุนธนู/หน้าไม้', icon: 'i_arrow', type: 'ammo', stack: 99, value: 1 }),
  I({ id: 'bullet', name: 'กระสุน', desc: 'กระสุนปืนคาบศิลา', icon: 'i_bullet', type: 'ammo', stack: 99, value: 3 }),

  // ---------- อาวุธเทพ (Legendary) ----------
  I({ id: 'thunder_blade', name: 'ดาบเทพสายฟ้า', desc: 'ฟันแล้วสายฟ้ากระโดดไปโดนศัตรูรอบๆ 3 ตัว', icon: 'i_thunder_blade', type: 'weapon', stack: 1, value: 1500, rarity: 'legendary', effect: 'chain', tool: { damage: 80, range: 22, tree: 1, rock: 0, durability: 1500 } }),
  I({ id: 'inferno_axe', name: 'ขวานเทพอัคคี', desc: 'เผาศัตรูต่อเนื่อง + ตัดไม้ทีเดียวขาด', icon: 'i_inferno_axe', type: 'weapon', stack: 1, value: 1400, rarity: 'legendary', effect: 'burn', tool: { damage: 75, range: 20, tree: 12, rock: 2, durability: 1500 } }),
  I({ id: 'vampire_scythe', name: 'เคียวยมทูต', desc: 'ดูดเลือด 15% ของดาเมจ ระยะยาว', icon: 'i_vampire_scythe', type: 'weapon', stack: 1, value: 1500, rarity: 'legendary', effect: 'lifesteal', tool: { damage: 70, range: 28, tree: 1, rock: 0, durability: 1500 } }),
  I({ id: 'thor_hammer', name: 'ค้อนเทพธอร์', desc: 'ทุบพื้นเกิดคลื่นกระแทกรอบตัว', icon: 'i_thor_hammer', type: 'weapon', stack: 1, value: 1600, rarity: 'legendary', effect: 'shockwave', tool: { damage: 95, range: 18, tree: 2, rock: 8, durability: 1500 } }),
  I({ id: 'storm_bow', name: 'ธนูเทพพิรุณ', desc: 'ยิงทีละ 3 ดอก ไม่ใช้ลูกธนู', icon: 'i_storm_bow', type: 'ranged', stack: 1, value: 1500, rarity: 'legendary', effect: 'multishot', ranged: { damage: 38, ammo: null, speed: 380, cooldown: 0.45, durability: 1500, projectile: 'arrow', pierce: true } }),
  I({ id: 'cosmic_staff', name: 'คทาจักรวาล', desc: 'ลูกไฟระเบิดวงกว้าง', icon: 'i_cosmic_staff', type: 'ranged', stack: 1, value: 1600, rarity: 'legendary', effect: 'explode', ranged: { damage: 55, ammo: null, speed: 260, cooldown: 0.7, durability: 1500, projectile: 'fireball' } }),

  // ---------- อาวุธชุดขยาย: มีด ดาบสองมือ ขวานรบ ค้อน แส้ สนับมือ ปืน บูมเมอแรง ไม้เท้าธาตุ ของขว้าง (ข้อมูลอยู่ใน data/weapons.ts) ----------
  ...WEAPON_ITEMS,

  // ---------- อัพเกรด / กล่อง ----------
  I({ id: 'enhance_stone', name: 'หินตีบวก', desc: 'วัตถุดิบอัพเกรดอุปกรณ์/สิ่งก่อสร้างช่วง Lv.7 ขึ้นไป', icon: 'i_enhance_stone', type: 'material', stack: 99, value: 30, rarity: 'uncommon' }),
  I({ id: 'lucky_charm', name: 'เครื่องรางนำโชค', desc: 'ของจากระบบตีบวกเก่า (เลิกใช้แล้ว — อัพเกรดสำเร็จ 100%) · ขายได้', icon: 'i_lucky_charm', type: 'material', stack: 20, value: 80, rarity: 'rare' }),
  I({ id: 'protect_scroll', name: 'ใบกันแตก', desc: 'ของจากระบบตีบวกเก่า (เลิกใช้แล้ว — อัพเกรดสำเร็จ 100%) · ขายได้', icon: 'i_protect_scroll', type: 'material', stack: 10, value: 200, rarity: 'epic' }),
  I({ id: 'box_wood', name: 'กล่องไม้', desc: 'เปิดได้ของ 2-3 ชิ้น (ส่วนใหญ่ธรรมดา · ไม่มีแปลน) — กด F', icon: 'box_wood', type: 'box', stack: 20, value: 20, rarity: 'common' }),
  I({ id: 'box_iron', name: 'กล่องเหล็ก', desc: 'เปิดได้ของ 3-4 ชิ้น มีโอกาสได้ของหายาก (ไม่มีแปลน) — กด F', icon: 'box_iron', type: 'box', stack: 20, value: 80, rarity: 'uncommon' }),
  I({ id: 'box_gold', name: 'กล่องทอง', desc: 'ของหายาก-มหากาพย์ ลุ้นอาวุธเทพ 4% · มีแปลน ~35% ต่อกล่อง — กด F', icon: 'box_gold', type: 'box', stack: 20, value: 300, rarity: 'epic' }),
  I({ id: 'box_legend', name: 'กล่องเพชร', desc: 'ของมหากาพย์+ ลุ้นอาวุธเทพ 20% · มีแปลน ~66% ต่อกล่อง — กด F', icon: 'box_legend', type: 'box', stack: 20, value: 1200, rarity: 'legendary' }),
  I({ id: 'golden_fish', name: 'ปลาทอง', desc: 'ปลาหายาก ขายได้ราคาดีมาก', icon: 'i_golden_fish', type: 'material', stack: 20, value: 120, rarity: 'epic' }),

  // ---------- ผลึกพลัง (อัปค่าพลังถาวร · สุ่มได้จากกล่องดรอปเท่านั้น) ----------
  elixir('elixir_hp', 'ผลึกชีวิต', { hp: 5 }, 40, 'common'),
  elixir('elixir_sta', 'ผลึกอึด', { stamina: 3 }, 40, 'common'),
  elixir('elixir_atk', 'ผลึกพลัง', { atk: 1 }, 80, 'uncommon'),
  elixir('elixir_def', 'ผลึกพิทักษ์', { def: 0.5 }, 80, 'uncommon'),
  elixir('elixir_spd', 'ผลึกวายุ', { speed: 1 }, 150, 'rare'),
  elixir('elixir_crit', 'ผลึกคมกริบ', { crit: 0.5 }, 150, 'rare'),
  elixir('elixir_luck', 'ผลึกโชคลาภ', { luck: 1 }, 150, 'rare'),
  elixir('elixir_regen', 'ผลึกฟื้นฟู', { regen: 0.05 }, 300, 'epic'),
  elixir('elixir_soul', 'ผลึกวิญญาณบอส', { atk: 2, def: 1, hp: 10, crit: 0.5 }, 900, 'legendary'),

  // ---------- เสื้อเกราะ ----------
  gear('leather_armor', 'เกราะหนัง', 'body', 'เกราะแรกเริ่ม เบาและอุ่น', { def: 3, cold: 0.3 }, 25, { durability: 200, look: 'leather' }),
  gear('fur_coat', 'เสื้อขนสัตว์', 'body', 'กันหนาวได้ดีมาก เหมาะกับเกาะหิมะ', { def: 1, cold: 0.85 }, 30, { durability: 250, look: 'fur' }),
  gear('crab_armor', 'เกราะกระดองปู', 'body', 'แข็งและหนา เพิ่ม HP', { def: 6, cold: 0.1, hp: 20 }, 70, { durability: 380, look: 'crab' }),
  gear('iron_armor', 'เกราะเหล็ก', 'body', 'ป้องกันสูง', { def: 7, cold: 0.1 }, 90, { durability: 450, look: 'iron' }),
  gear('gold_armor', 'เกราะทอง', 'body', 'สวยงาม แข็งแรง นำโชค', { def: 8, cold: 0.2, luck: 5 }, 160, { durability: 400, look: 'gold' }),
  gear('meteor_armor', 'เกราะอุกกาบาต', 'body', 'ป้องกันสูงสุด กันหนาว เพิ่ม HP', { def: 11, cold: 0.6, hp: 30 }, 450, { durability: 800, look: 'meteor' }),
  // ---------- หมวก ----------
  gear('leather_cap', 'ฮู้ดหนัง', 'head', 'หมวกพื้นฐาน กันหนาวนิดหน่อย', { def: 1, cold: 0.1 }, 15, { durability: 150, look: 'hood' }),
  gear('miner_helmet', 'หมวกนิรภัยช่างเหมือง', 'head', 'ขุด/ตัดแรงขึ้น มีไฟฉายติดหมวก', { def: 2, gather: 15, light: 24 }, 60, { durability: 300, look: 'hard_hat' }),
  gear('iron_helmet', 'หมวกอัศวิน', 'head', 'หมวกเหล็กป้องกันสูง', { def: 3 }, 50, { durability: 380, look: 'iron_helm' }),
  gear('samurai_helmet', 'หมวกซามูไร', 'head', 'ป้องกัน + พลังโจมตี', { def: 4, atk: 5 }, 120, { durability: 420, look: 'samurai_kabuto' }),
  gear('wizard_hat', 'หมวกพ่อมด', 'head', 'คริติคอล + ฟื้นฟู HP', { def: 1, crit: 5, regen: 0.3 }, 140, { durability: 300, look: 'wizard_hat' }),
  gear('royal_crown', 'มงกุฎราชา', 'head', 'ของเจ้าเกาะ — โชคและคริติคอล', { def: 2, luck: 10, crit: 3 }, 260, { durability: 500, look: 'gold_crown' }),
  gear('demon_crown', 'มงกุฎเขาปีศาจ', 'head', 'พลังจากราชาปีศาจ — โจมตีแรง ดูดเลือด', { def: 5, atk: 12, lifesteal: 3 }, 1200, { durability: 1200, look: 'horns', rarity: 'legendary' }),
  // ---------- สนับขา ----------
  gear('leather_pants', 'กางเกงหนัง', 'legs', 'คล่องตัว', { def: 1, speed: 2 }, 15, { durability: 180 }),
  gear('iron_greaves', 'สนับแข้งเหล็ก', 'legs', 'ป้องกันขา', { def: 3, hp: 5 }, 50, { durability: 380 }),
  gear('meteor_greaves', 'สนับแข้งอุกกาบาต', 'legs', 'ป้องกันสูง + HP', { def: 5, hp: 20 }, 300, { durability: 700 }),
  // ---------- รองเท้า ----------
  gear('leather_boots', 'รองเท้าหนัง', 'feet', 'เดินเร็วขึ้น', { def: 1, speed: 6 }, 18, { durability: 200 }),
  gear('snow_boots', 'รองเท้าขนเยติ', 'feet', 'อุ่นมาก เดินบนหิมะสบาย', { cold: 0.25, speed: 4 }, 60, { durability: 260 }),
  gear('iron_boots', 'รองเท้าเหล็ก', 'feet', 'หนักแต่แข็งแรง', { def: 2, speed: 2 }, 45, { durability: 380 }),
  gear('wind_boots', 'รองเท้าวายุ', 'feet', 'เร็วดั่งสายลม + สแตมินา', { speed: 18, stamina: 20 }, 420, { durability: 600, rarity: 'epic' }),
  // ---------- ถุงมือ ----------
  gear('work_gloves', 'ถุงมือช่าง', 'hands', 'ตัดไม้/ขุดแร่เร็วขึ้นมาก', { gather: 20 }, 20, { durability: 220 }),
  gear('iron_gauntlets', 'ถุงมือเหล็ก', 'hands', 'ต่อยหนักขึ้น', { def: 1, atk: 6 }, 55, { durability: 380 }),
  gear('fire_gauntlets', 'กำปั้นอัคคี', 'hands', 'พลังไฟลุกโชน — โจมตี + คริ', { atk: 14, crit: 4 }, 450, { durability: 700, rarity: 'epic' }),
  // ---------- ผ้าคลุม ----------
  gear('travel_cloak', 'ผ้าคลุมเดินทาง', 'back', 'ผ้าคลุมพื้นฐาน', { cold: 0.1, speed: 3, stamina: 10 }, 25, { look: 'red' }),
  gear('fur_cloak', 'ผ้าคลุมขนสัตว์', 'back', 'อุ่นมาก', { cold: 0.35 }, 45, { look: 'blue' }),
  gear('shadow_cloak', 'ผ้าคลุมเงา', 'back', 'เร็วและคม', { speed: 8, crit: 5 }, 220, { look: 'black' }),
  gear('arcane_cape', 'ผ้าคลุมเวท', 'back', 'พลังเวทฟื้นฟูร่างกาย', { regen: 0.5, crit: 3 }, 260, { look: 'purple' }),
  gear('royal_cape', 'ผ้าคลุมราชา', 'back', 'ทรงพลังและนำโชค', { hp: 30, luck: 8, def: 2 }, 480, { look: 'gold', rarity: 'epic' }),
  // ---------- สร้อยคอ ----------
  gear('shell_necklace', 'สร้อยเปลือกหอย', 'neck', 'เครื่องรางชาวเกาะ', { hp: 15 }, 20),
  gear('fang_amulet', 'สร้อยเขี้ยวหมาป่า', 'neck', 'สัญชาตญาณนักล่า', { atk: 5, crit: 2 }, 40),
  gear('crystal_amulet', 'จี้คริสตัล', 'neck', 'เรืองแสงอ่อนๆ ฟื้น HP', { regen: 0.4, light: 16 }, 160),
  gear('demon_amulet', 'จี้ปีศาจ', 'neck', 'ดูดเลือดศัตรู + โจมตี + HP', { atk: 10, lifesteal: 5, hp: 25 }, 1300, { rarity: 'legendary' }),
  // ---------- แหวน (ใส่ได้ 2 วง) ----------
  gear('iron_ring', 'แหวนเหล็ก', 'ring', 'แหวนธรรมดา', { def: 1, atk: 2 }, 25),
  gear('gold_ring', 'แหวนทอง', 'ring', 'นำโชค', { luck: 8, crit: 2 }, 90),
  gear('ruby_ring', 'แหวนทับทิม', 'ring', 'โจมตีแรงขึ้น', { atk: 8 }, 180),
  gear('jade_ring', 'แหวนหยกชีวิต', 'ring', 'HP + ฟื้นฟู', { hp: 20, regen: 0.2 }, 180),
  gear('meteor_ring', 'แหวนอุกกาบาต', 'ring', 'ครบเครื่อง', { atk: 10, def: 2, crit: 3 }, 500, { rarity: 'epic' }),
  // ---------- มือรอง ----------
  gear('wood_shield', 'โล่ไม้', 'offhand', 'กันดาเมจ', { def: 2 }, 15, { durability: 200 }),
  gear('iron_shield', 'โล่เหล็ก', 'offhand', 'กันดาเมจสูง แต่หนัก', { def: 5, speed: -3 }, 60, { durability: 450 }),
  gear('crab_shield', 'โล่กระดองปู', 'offhand', 'แข็ง + HP', { def: 6, hp: 10 }, 90, { durability: 500 }),
  gear('lantern', 'ตะเกียง', 'offhand', 'ส่องสว่างกว้าง + อบอุ่น ไม่ต้องถือในมือ ไม่มอดดับ', { light: 72 }, 50, { warm: true }),
  // ---------- กระเป๋าเป้ ----------
  gear('pouch', 'ถุงย่าม', 'bag', 'เพิ่มช่องกระเป๋า 4 ช่อง', { bag: 4 }, 20),
  gear('leather_backpack', 'เป้หนัง', 'bag', 'เพิ่มช่องกระเป๋า 8 ช่อง', { bag: 8 }, 70),
  gear('explorer_pack', 'เป้นักสำรวจ', 'bag', 'เพิ่มช่องกระเป๋า 12 ช่อง + เดินเร็ว', { bag: 12, speed: 2 }, 260),
];

for (const it of items) {
  if (LEGACY_WEAPON_PATCH[it.id]) Object.assign(it, LEGACY_WEAPON_PATCH[it.id]); // ชนิดอาวุธของชุดเดิม
  it.rarity ??= it.value >= 400 ? 'epic' : it.value >= 100 ? 'rare' : it.value >= 30 ? 'uncommon' : 'common';
  it.enhanceable = upCategoryOfItem(it) !== null; // อัพเกรด 10 ระดับได้ (อาวุธ เครื่องมือ อุปกรณ์สวมใส่ทุกช่อง)
}

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(items.map((i) => [i.id, i]));

/**
 * ค่าโภชนาการของอาหาร/เครื่องดื่มทุกชนิด (ระบบสมดุลร่างกาย — systems/BodySystem.ts)
 * ของดิบ (เนื้อ/ปลา/ไข่) โปรตีนสูงแต่เสี่ยงท้องเสีย · ผักผลไม้ = วิตามิน · แป้ง (มัน ขนมปัง ฟักทอง) = พลังงาน · อาหารปรุง = สมดุล
 */
const NUTRI: Record<string, Nutri> = {
  berry: { v: 8, e: 2 }, carrot: { v: 14, e: 4 }, tomato: { v: 14 }, pumpkin: { e: 22, v: 6 }, cactus_fruit: { v: 8 },
  raw_meat: { p: 18, risk: 0.35 }, cooked_meat: { p: 32 }, fish: { p: 14, risk: 0.25 }, cooked_fish: { p: 26, v: 4 }, egg: { p: 10, risk: 0.15 },
  veggie_stew: { v: 28, e: 14, p: 10 }, pumpkin_pie: { e: 30, v: 8, p: 4 }, glow_mushroom: { v: 6, e: 2 }, honey: { e: 12, v: 4 },
  fried_egg: { p: 22, e: 6 }, tom_yum: { p: 22, v: 22, e: 6 }, pumpkin_curry: { e: 30, v: 18, p: 12 }, honey_cake: { e: 35, p: 6, v: 4 },
  skewer: { p: 26, e: 10 }, fruit_juice: { v: 28, e: 6 },
  coconut: { e: 6, v: 6 }, wild_potato: { e: 14, risk: 0.1 }, baked_potato: { e: 32 }, flatbread: { e: 30, p: 4 }, mango: { v: 24, e: 6 }, dragonfruit: { v: 28 },
  seaweed: { v: 12, p: 4 }, wild_mushroom: { v: 8, p: 4, risk: 0.12 }, dirty_water: { risk: 0.2 }, clean_water: {}, flower_tea: { v: 12 },
  herb: { v: 6, cure: true }, herbal_medicine: { cure: true },
};
for (const [id, n] of Object.entries(NUTRI)) if (ITEMS[id]) ITEMS[id].nutri = n;

/** ลงทะเบียนชุดแฟชั่นเป็นไอเทม (เรียกตอนบูต หลังโหลดข้อมูลชุดจาก heroes.ts) */
export function registerCosmetics(list: { slot: 'outfit' | 'helmet' | 'cape'; id: string; name: string; rarity: Rarity }[]) {
  for (const c of list) {
    const id = `cos_${c.slot}_${c.id}`;
    if (ITEMS[id]) continue;
    const def: ItemDef = {
      id, name: `${c.slot === 'outfit' ? 'ชุด' : c.slot === 'helmet' ? 'หมวก' : 'ผ้าคลุม'}${c.name}`, desc: 'ชุดแฟชั่น — กด F เพื่อเก็บเข้าตู้เสื้อผ้า',
      icon: `icon_${id}`, type: 'cosmetic', stack: 1, value: 100, rarity: c.rarity, cosmetic: { slot: c.slot, id: c.id },
    };
    items.push(def);
    ITEMS[id] = def;
  }
}
export const ITEM_LIST = items;

export const BARE_HANDS = { damage: 4, range: 14, tree: 1, rock: 0, durability: Infinity };

export const CROPS: Record<string, { name: string; grow: number; yield: [number, number]; item: string; seed: string }> = {
  carrot: { name: 'แครอท', grow: 150, yield: [2, 3], item: 'carrot', seed: 'carrot_seed' },
  tomato: { name: 'มะเขือเทศ', grow: 200, yield: [2, 4], item: 'tomato', seed: 'tomato_seed' },
  pumpkin: { name: 'ฟักทอง', grow: 300, yield: [1, 2], item: 'pumpkin', seed: 'pumpkin_seed' },
};
