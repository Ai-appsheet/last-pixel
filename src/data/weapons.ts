import type { ItemDef } from './items';

/**
 * ระบบอาวุธชุดขยาย
 *   ชนิดอาวุธ (weaponClass) กำหนด "ฟีล": ความเร็ว · วงฟัน · จำนวนเป้า · คริ · แรงผลัก · คอมโบ · สถานะติดตัว
 *   สถานะ (status) ที่ใส่ให้ศัตรู: เผา / พิษ (ซ้อนได้) / เลือดออก (ยิ่งเดินยิ่งเสีย) / เยือกแข็ง (ช้า/แช่แข็ง) / มึน
 *   ของในไฟล์นี้ถูกรวมเข้า ITEMS ใน items.ts (ห้าม import ค่าจาก items.ts ตอนรัน — ใช้ type เท่านั้น)
 */
export type WeaponClass =
  | 'dagger' | 'sword' | 'greatsword' | 'axe' | 'mace' | 'spear' | 'scythe' | 'whip' | 'fist'
  | 'bow' | 'crossbow' | 'pistol' | 'shotgun' | 'rifle' | 'sling' | 'boomerang' | 'staff'
  | 'wand' | 'tome' | 'orb'
  | 'bomb' | 'knife' | 'javelin';

export type StatusKind = 'burn' | 'poison' | 'bleed' | 'freeze' | 'stun';

/** สถานะที่อาวุธใส่ให้: chance 0..1 · dur วินาที · power = ดาเมจ/วิ (DoT) หรือ % ช้าลง (freeze ≥1 = แช่แข็งทั้งตัว) */
export interface StatusHit {
  kind: StatusKind;
  chance: number;
  dur: number;
  power?: number;
}

/** พลังพิเศษของอาวุธเทพชุดใหม่ (ของเดิมใช้ WeaponEffect) */
export type WeaponSpecial = 'frostnova' | 'venom' | 'homing' | 'blackhole' | 'bladestorm' | 'dragonfire'
  // อาวุธเวทชุดใหม่
  | 'tidal' | 'featherstorm' | 'phoenixfire' | 'holylight' | 'bloodpact' | 'orbburst';

/** ชนิดของขว้าง */
export type ThrowKind = 'bomb' | 'cluster' | 'molotov' | 'ice' | 'smoke' | 'flash' | 'poison' | 'knife' | 'shuriken' | 'javelin';

export interface WeaponClassDef {
  name: string;
  hint: string;
  /** ตัวคูณความเร็วโจมตี (ประชิด: คูณกลับคูลดาวน์) */
  speed?: number;
  /** ครึ่งมุมวงฟัน (เรเดียน) */
  arc?: number;
  /** จำนวนเป้าสูงสุดต่อการฟัน */
  maxHits?: number;
  /** คริติคอลเพิ่ม (%) */
  crit?: number;
  /** ตัวคูณแรงผลัก */
  knock?: number;
  /** ตีต่อเนื่องแล้วแรงขึ้นทีละ 10% (สูงสุด 6 ฮิต) */
  combo?: boolean;
  /** ทะลุเกราะ (0..1) */
  armorPierce?: number;
  /** ตัวคูณสแตมินาต่อครั้ง */
  stamina?: number;
  /** ปลายแส้: ศัตรูที่อยู่ช่วงปลายระยะ คริ +25% */
  tipCrit?: boolean;
  /** สถานะติดตัวของชนิดนี้ */
  status?: StatusHit;
  // ---- ระยะไกล ----
  pellets?: number;
  spread?: number;
  /** อายุกระสุน (วิ) */
  life?: number;
  /** บินกลับหาผู้เล่น */
  returns?: boolean;
}

export const WEAPON_CLASSES: Record<WeaponClass, WeaponClassDef> = {
  dagger: { name: 'มีดสั้น', hint: 'เร็วมาก คริแรง ต่อคอมโบได้', speed: 1.7, arc: 0.55, maxHits: 1, crit: 15, knock: 0.4, combo: true, stamina: 0.6 },
  sword: { name: 'ดาบ', hint: 'สมดุล ฟันโดนหลายตัวด้านหน้า', speed: 1, arc: 0.95, maxHits: 3, knock: 1 },
  greatsword: { name: 'ดาบสองมือ', hint: 'ช้าแต่กวาดวงกว้าง โดนทั้งกลุ่ม', speed: 0.6, arc: 1.7, maxHits: 8, knock: 1.8, stamina: 1.6 },
  axe: { name: 'ขวานรบ', hint: 'หนัก ฟันแล้วเลือดออก', speed: 0.78, arc: 0.9, maxHits: 2, knock: 1.3, stamina: 1.3, status: { kind: 'bleed', chance: 0.3, dur: 4 } },
  mace: { name: 'ค้อน/กระบอง', hint: 'ทุบทะลุเกราะ มีโอกาสทำให้มึน', speed: 0.7, arc: 1, maxHits: 3, knock: 1.7, armorPierce: 0.6, stamina: 1.4, status: { kind: 'stun', chance: 0.2, dur: 0.8 } },
  spear: { name: 'หอก', hint: 'แทงไกล ทะลุทั้งแนว', speed: 0.9, arc: 0.4, maxHits: 4, knock: 1.1 },
  scythe: { name: 'เคียว', hint: 'เหวี่ยงโค้งกว้าง ระยะดี', speed: 0.8, arc: 1.45, maxHits: 5, crit: 5, knock: 0.7, stamina: 1.2 },
  whip: { name: 'แส้', hint: 'ฟาดไกลมาก ปลายแส้คริแรง', speed: 1.05, arc: 0.22, maxHits: 3, crit: 8, knock: 0.5, tipCrit: true },
  fist: { name: 'สนับมือ', hint: 'รัวหมัดเร็วสุด ยิ่งต่อคอมโบยิ่งแรง', speed: 2.3, arc: 0.6, maxHits: 1, crit: 5, knock: 0.5, combo: true, stamina: 0.45 },
  bow: { name: 'ธนู', hint: 'ยิงไกล ใช้ลูกธนู' },
  crossbow: { name: 'หน้าไม้', hint: 'หนัก ยิงทะลุ ผลักถอย', crit: 5, knock: 1.4 },
  pistol: { name: 'ปืนพก', hint: 'แรงและแม่น ใช้กระสุน', crit: 5, knock: 1.2 },
  shotgun: { name: 'ปืนลูกซอง', hint: 'ยิงกระจายระยะใกล้ ผลักแรง', knock: 1.6, pellets: 6, spread: 0.55, life: 0.32 },
  rifle: { name: 'ปืนไรเฟิล', hint: 'ยิงไกลมาก ทะลุ คริแรง', crit: 15, knock: 1.5, life: 1.8 },
  sling: { name: 'หนังสติ๊ก', hint: 'ใช้ก้อนหินเป็นกระสุน อาจทำให้มึน', knock: 1.2, status: { kind: 'stun', chance: 0.12, dur: 0.5 } },
  boomerang: { name: 'บูมเมอแรง', hint: 'ขว้างแล้วบินกลับ โดนทั้งขาไปขากลับ', knock: 0.8, returns: true, life: 0.9 },
  staff: { name: 'ไม้เท้าเวท', hint: 'ยิงเวทธาตุ ไม่ใช้กระสุน' },
  wand: { name: 'ไม้กายสิทธิ์', hint: 'ร่ายเวทรัวเร็ว ใช้สแตมินาน้อย', knock: 0.6 },
  tome: { name: 'คัมภีร์เวท', hint: 'ร่ายเวทกระจายหลายลูกพร้อมกัน ใช้สแตมินามาก' },
  orb: { name: 'ลูกแก้วเวท', hint: 'ร่ายช้า ลูกเวทใหญ่ระเบิดเป็นวง', knock: 1.4 },
  bomb: { name: 'ระเบิด', hint: 'ขว้างใส่กลุ่มศัตรู' },
  knife: { name: 'อาวุธซัด', hint: 'ขว้างเร็ว ซ้อนกองได้' },
  javelin: { name: 'หอกซัด', hint: 'ขว้างแรง ทะลุแนว', knock: 1.4 },
};

/** ค่าเริ่มต้นเมื่อไม่ระบุชนิด (เครื่องมือ/มือเปล่า) */
export const BASIC_CLASS: WeaponClassDef = { name: 'เครื่องมือ', hint: '', speed: 1, arc: 1.1, maxHits: 3, knock: 1 };

export const classOf = (def?: { weaponClass?: WeaponClass }): WeaponClassDef => (def?.weaponClass ? WEAPON_CLASSES[def.weaponClass] : BASIC_CLASS);

export const STATUS_INFO: Record<StatusKind, { name: string; icon: string; color: number }> = {
  burn: { name: 'ไฟลุก', icon: '🔥', color: 0xef7d57 },
  poison: { name: 'พิษ', icon: '☠', color: 0xa7f070 },
  bleed: { name: 'เลือดออก', icon: '🩸', color: 0xd8606f },
  freeze: { name: 'เยือกแข็ง', icon: '❄', color: 0x73eff7 },
  stun: { name: 'มึนงง', icon: '💫', color: 0xffcd75 },
};

/** พลังสถานะเมื่อไม่ระบุ power — คิดจากดาเมจที่ตีโดน */
export function statusPower(kind: StatusKind, dmg: number): number {
  switch (kind) {
    case 'burn': return Math.max(6, dmg * 0.2);
    case 'poison': return Math.max(3, dmg * 0.12);
    case 'bleed': return Math.max(4, dmg * 0.18);
    case 'freeze': return 0.5;
    default: return 0;
  }
}

export function statusText(s: StatusHit): string {
  const i = STATUS_INFO[s.kind];
  const extra = s.kind === 'freeze' && (s.power ?? 0) >= 1 ? ' (แช่แข็ง)' : s.kind === 'poison' ? ' (ซ้อนได้)' : '';
  return `${i.icon} ${i.name}${extra} ${Math.round(s.chance * 100)}% · ${s.dur} วิ`;
}

export const SPECIAL_TEXT: Record<WeaponSpecial, string> = {
  frostnova: '❄ ธารน้ำแข็ง — ฟันโดนครบ 4 ครั้ง ปล่อยคลื่นเยือกแข็งรอบตัว แช่แข็งศัตรู',
  venom: '🐍 พิษพญานาค — แทงโดนแล้วพ่นหมอกพิษ ศัตรูรอบๆ ติดพิษซ้อน',
  homing: '🦅 ศรครุฑ — ยิงทีละ 2 ดอก ลูกศรไล่ล่าเป้าหมายเอง',
  blackhole: '🌀 หลุมดำ — กระสุนกลายเป็นหลุมดำ ดูดศัตรูเข้ากลางแล้วบดขยี้',
  bladestorm: '🌪 พายุเขี้ยว — คอมโบครบ 5 ฮิต ใบมีดหมุนรอบตัวฟันทุกตัวใกล้ๆ',
  dragonfire: '🐉 ลมหายใจมังกร — ลูกปรายลุกเป็นไฟ เผาทุกตัวที่โดน',
  tidal: '🐍 อุทกพญานาค — กระสุนโดนเป้าแรกแตกเป็นคลื่นน้ำวงกว้าง ดาเมจ 60% + พิษทุกตัวในวง',
  featherstorm: '🦅 พายุขนครุฑ — ร่ายขนครุฑ 5 เส้นเป็นพัด ไล่ล่าเป้าเอง ผลักกระเด็น',
  phoenixfire: '🔥 เพลิงหงส์ — ลูกไฟระเบิดวงกว้าง ทิ้งทะเลเพลิง 3 วิ และดูดพลังชีวิต 6% ของดาเมจ',
  holylight: '✨ แสงศักดิ์สิทธิ์ — อันเดด (ซอมบี้/โครงกระดูก/มัมมี่/เงาหลอน) รับดาเมจ ×1.5 · ฟื้น HP 4% ของดาเมจ',
  bloodpact: '🩸 พันธสัญญาโลหิต — ร่ายด้วย HP 2 แทนสแตมินา · ดูดเลือด 10% ของดาเมจ',
  orbburst: '💥 ลูกแก้วแตก — โดนเป้าแล้วระเบิดรัศมี 36 ใส่สถานะของอาวุธให้ทุกตัวในวง',
};

export const THROW_TEXT: Record<ThrowKind, string> = {
  bomb: '💥 ระเบิดวงกว้าง',
  cluster: '💥 แตกเป็นระเบิดลูกเล็กหลายลูก',
  molotov: '🔥 ทิ้งกองไฟบนพื้น เผาศัตรูที่เดินผ่าน',
  ice: '❄ แช่แข็งศัตรูทั้งวง',
  smoke: '🌫 กลุ่มควัน ศัตรูข้างในมึนงง',
  flash: '✨ แสงวาบ ศัตรูมึนงงนาน',
  poison: '☠ หมอกพิษค้างบนพื้น',
  knife: '🗡 ขว้างตรงไว',
  shuriken: '✴ ขว้างทีละ 3 ดาวกระจาย',
  javelin: '➶ ขว้างแรง ทะลุแนว',
};

// ------------------------------------------------------------------ ตัวช่วยสร้างไอเทม
type Extra = Partial<Pick<ItemDef, 'status' | 'knockback' | 'critBonus' | 'chain' | 'special' | 'rarity' | 'effect'>> & { tree?: number; rock?: number };

const pick = (e: Extra) => {
  const { tree: _t, rock: _r, ...rest } = e;
  return rest;
};

/** อาวุธประชิด */
const melee = (id: string, name: string, cls: WeaponClass, desc: string, damage: number, range: number, durability: number, value: number, e: Extra = {}): ItemDef => ({
  id, name, desc, icon: `i_${id}`, type: 'weapon', stack: 1, value, weaponClass: cls,
  tool: { damage, range, tree: e.tree ?? 0.5, rock: e.rock ?? 0, durability }, ...pick(e),
});

/** อาวุธยิง */
const gun = (id: string, name: string, cls: WeaponClass, desc: string, ranged: NonNullable<ItemDef['ranged']>, value: number, e: Extra = {}): ItemDef => ({
  id, name, desc, icon: `i_${id}`, type: 'ranged', stack: 1, value, weaponClass: cls, ranged, ...pick(e),
});

/** ของขว้าง */
const thrown = (id: string, name: string, cls: WeaponClass, desc: string, t: NonNullable<ItemDef['throw']>, value: number, stack: number, e: Extra = {}): ItemDef => ({
  id, name, desc, icon: `i_${id}`, type: 'throw', stack, value, weaponClass: cls, throw: t, ...pick(e),
});

const st = (kind: StatusKind, chance: number, dur: number, power?: number): StatusHit => ({ kind, chance, dur, power });

/** อาวุธชุดขยาย (รวมเข้า ITEMS) */
export const WEAPON_ITEMS: ItemDef[] = [
  // ---------- มีดสั้น ----------
  melee('stone_dagger', 'มีดหิน', 'dagger', 'มีดหินคมๆ ฟันรัวเร็ว', 7, 14, 100, 6),
  melee('bone_dagger', 'มีดกระดูก', 'dagger', 'ปลายแหลม แทงแล้วเลือดไหล', 11, 14, 160, 18, { status: [st('bleed', 0.2, 3)] }),
  melee('iron_dagger', 'มีดสั้นเหล็ก', 'dagger', 'เบาและไว คริติคอลบ่อย', 17, 14, 320, 45),
  melee('venom_dagger', 'กริชอาบพิษ', 'dagger', 'ใบมีดชุบพิษ — พิษซ้อนได้หลายชั้น', 22, 14, 360, 120, { status: [st('poison', 0.55, 5)] }),
  melee('crystal_dagger', 'กริชคริสตัล', 'dagger', 'คมกริบ คริแรง มีโอกาสทำให้เยือกแข็ง', 28, 15, 500, 260, { critBonus: 10, status: [st('freeze', 0.25, 2)] }),
  // ---------- ดาบ ----------
  melee('bone_sword', 'ดาบกระดูก', 'sword', 'ดาบจากกระดูกมอนสเตอร์', 18, 20, 200, 22),
  melee('katana', 'ดาบคาตานะ', 'sword', 'ดาบซามูไร คมจัด คริแรง เลือดออก', 38, 21, 380, 160, { critBonus: 10, status: [st('bleed', 0.3, 4)] }),
  melee('frost_sword', 'ดาบน้ำแข็ง', 'sword', 'ไอเย็นทำให้ศัตรูเชื่องช้า', 50, 21, 520, 300, { status: [st('freeze', 0.35, 2.5)] }),
  // ---------- ดาบสองมือ ----------
  melee('iron_greatsword', 'ดาบใหญ่เหล็ก', 'greatsword', 'ดาบสองมือหนักอึ้ง กวาดทั้งกลุ่ม', 46, 24, 420, 90),
  melee('gold_greatsword', 'ดาบสองมือทองคำ', 'greatsword', 'หรูหรา ทรงพลัง คริดี', 58, 24, 380, 220, { critBonus: 5 }),
  melee('meteor_greatsword', 'ดาบสองมืออุกกาบาต', 'greatsword', 'เหล็กจากฟ้า ลุกเป็นไฟเมื่อฟัน', 100, 25, 800, 560, { status: [st('burn', 0.4, 4)] }),
  // ---------- ขวานรบ ----------
  melee('stone_battleaxe', 'ขวานรบหิน', 'axe', 'ขวานสองคม ตัดไม้ได้ด้วย', 15, 18, 160, 14, { tree: 2 }),
  melee('iron_battleaxe', 'ขวานรบเหล็ก', 'axe', 'ฟันหนัก เลือดสาด', 37, 18, 400, 70, { tree: 4 }),
  melee('crab_cleaver', 'ขวานก้ามปูยักษ์', 'axe', 'ทำจากกระดองราชาปู ผลักกระเด็น', 44, 19, 450, 130, { tree: 3, knockback: 1.4 }),
  melee('crystal_battleaxe', 'ขวานรบคริสตัล', 'axe', 'ใบขวานผลึกเย็นเฉียบ', 66, 19, 600, 330, { tree: 5, status: [st('freeze', 0.3, 2)] }),
  // ---------- ค้อน/กระบอง ----------
  melee('wood_club', 'กระบองไม้', 'mace', 'ไม้หนาๆ ทุบหัวมึน', 12, 17, 120, 5),
  melee('spiked_club', 'กระบองหนาม', 'mace', 'ตอกหนามกระดูก ทุบแล้วเลือดออก', 21, 17, 200, 20, { status: [st('bleed', 0.2, 3)] }),
  melee('iron_mace', 'ตะบองเหล็ก', 'mace', 'ทุบทะลุเกราะ ทำให้มึน', 36, 17, 420, 65, { rock: 2 }),
  melee('gold_warhammer', 'ค้อนศึกทองคำ', 'mace', 'ทุบครั้งเดียวกระเด็นไกล', 54, 18, 400, 210, { rock: 3, knockback: 1.3 }),
  melee('meteor_maul', 'ค้อนยักษ์อุกกาบาต', 'mace', 'ร้อนระอุ ทุบทุกอย่างแหลก', 92, 18, 800, 540, { rock: 5, status: [st('burn', 0.25, 3)] }),
  // ---------- หอก ----------
  melee('bone_spear', 'หอกกระดูก', 'spear', 'หอกปลายกระดูก แทงทะลุแนว', 21, 25, 200, 22),
  melee('gold_trident', 'ตรีศูลทองคำ', 'spear', 'สามง่ามแห่งท้องทะเล', 44, 27, 380, 200, { critBonus: 5 }),
  melee('crystal_halberd', 'ง้าวคริสตัล', 'spear', 'ง้าวยาว ไอเย็นแผ่ซ่าน', 60, 28, 560, 320, { status: [st('freeze', 0.25, 2)] }),
  melee('meteor_lance', 'ทวนอุกกาบาต', 'spear', 'ทวนเพลิง แทงทะลุทั้งแถว', 84, 30, 780, 520, { status: [st('burn', 0.35, 4)] }),
  // ---------- เคียว ----------
  melee('sickle', 'เคียวเกี่ยวข้าว', 'scythe', 'เคียวชาวนา เหวี่ยงโค้งกว้าง', 10, 18, 140, 8),
  melee('iron_scythe', 'เคียวเหล็ก', 'scythe', 'เคียวใหญ่ กวาดศัตรูรอบด้าน', 34, 24, 380, 60, { status: [st('bleed', 0.2, 3)] }),
  melee('shadow_scythe', 'เคียวเงามรณะ', 'scythe', 'เคียวแห่งรัตติกาล เลือดไหลไม่หยุด', 66, 26, 600, 360, { critBonus: 5, status: [st('bleed', 0.4, 5)] }),
  // ---------- แส้ ----------
  melee('rope_whip', 'แส้เชือก', 'whip', 'ฟาดได้ไกล ปลายแส้คริแรง', 8, 34, 120, 6),
  melee('leather_whip', 'แส้หนัง', 'whip', 'แส้หนังสัตว์ เสียงดังเปรี้ยะ', 17, 36, 220, 24),
  melee('chain_whip', 'แส้โซ่เหล็ก', 'whip', 'โซ่เหล็กหนัก ฟาดแล้วมึน', 30, 38, 400, 70, { status: [st('stun', 0.15, 0.6)] }),
  melee('fire_whip', 'แส้เพลิง', 'whip', 'แส้ลุกเป็นไฟ ฟาดไกลเผาศัตรู', 46, 40, 520, 280, { status: [st('burn', 0.5, 3)] }),
  // ---------- สนับมือ ----------
  melee('hand_wraps', 'ผ้าพันมือมวยไทย', 'fist', 'หมัด เข่า ศอก! รัวเร็วสุดๆ', 5, 12, 120, 6),
  melee('bone_claws', 'กรงเล็บกระดูก', 'fist', 'ข่วนแล้วเลือดออก', 8, 12, 220, 26, { status: [st('bleed', 0.25, 3)] }),
  melee('iron_knuckles', 'สนับมือเหล็ก', 'fist', 'ต่อยหนัก คอมโบต่อเนื่อง', 12, 12, 350, 40),
  melee('crystal_knuckles', 'สนับมือคริสตัล', 'fist', 'หมัดผลึก ต่อยแล้วมึน', 22, 13, 520, 250, { status: [st('stun', 0.15, 0.6)] }),

  // ---------- ธนู/หน้าไม้ ----------
  gun('short_bow', 'ธนูสั้น', 'bow', 'ยิงรัวเร็ว ดาเมจเบา', { damage: 11, ammo: 'arrow', speed: 280, cooldown: 0.3, durability: 150, projectile: 'arrow' }, 12),
  gun('long_bow', 'ธนูยาว', 'bow', 'ยิงไกลและแรง แต่ช้า', { damage: 26, ammo: 'arrow', speed: 380, cooldown: 0.6, durability: 260, projectile: 'arrow', life: 1.6 }, 40),
  gun('composite_bow', 'ธนูคอมโพสิต', 'bow', 'ไม้+กระดูก+เหล็ก สมดุลทุกด้าน', { damage: 34, ammo: 'arrow', speed: 400, cooldown: 0.5, durability: 380, projectile: 'arrow', life: 1.3 }, 130),
  gun('frost_bow', 'ธนูเหมันต์', 'bow', 'ลูกธนูเคลือบน้ำแข็ง ศัตรูเชื่องช้า', { damage: 40, ammo: 'arrow', speed: 400, cooldown: 0.5, durability: 500, projectile: 'arrow', life: 1.3 }, 320, { status: [st('freeze', 0.5, 2)] }),
  gun('heavy_crossbow', 'หน้าไม้หนัก', 'crossbow', 'ยิงทะลุแรงมาก ผลักกระเด็น', { damage: 64, ammo: 'arrow', speed: 440, cooldown: 1.4, durability: 380, projectile: 'arrow', pierce: true }, 140, { knockback: 1.3, status: [st('stun', 0.25, 0.6)] }),
  gun('repeater_crossbow', 'หน้าไม้กลรัว', 'crossbow', 'กลไกเฟือง ยิงรัวไม่หยุด', { damage: 18, ammo: 'arrow', speed: 380, cooldown: 0.22, durability: 400, projectile: 'arrow' }, 220),
  // ---------- ปืน ----------
  gun('revolver', 'ปืนพกลูกโม่', 'pistol', 'ยิงเร็วกว่าปืนคาบศิลา ใช้กระสุน', { damage: 30, ammo: 'bullet', speed: 520, cooldown: 0.38, durability: 400, projectile: 'bullet' }, 240),
  gun('shotgun', 'ปืนลูกซอง', 'shotgun', 'กระจาย 6 ลูก ระยะใกล้แรงมหาศาล', { damage: 13, ammo: 'shell', speed: 420, cooldown: 1, durability: 350, projectile: 'proj_pellet' }, 300),
  gun('rifle', 'ปืนไรเฟิล', 'rifle', 'ยิงไกลสุด ทะลุทั้งแถว คริแรง', { damage: 95, ammo: 'rifle_round', speed: 720, cooldown: 1.25, durability: 400, projectile: 'bullet', pierce: true }, 460),
  gun('slingshot', 'หนังสติ๊ก', 'sling', 'ใช้ก้อนหินเป็นกระสุน หาง่าย', { damage: 8, ammo: 'stone', speed: 300, cooldown: 0.45, durability: 150, projectile: 'proj_stone' }, 6),
  // ---------- บูมเมอแรง ----------
  gun('wood_boomerang', 'บูมเมอแรงไม้', 'boomerang', 'ขว้างแล้วบินกลับ ไม่ใช้กระสุน', { damage: 12, ammo: null, speed: 240, cooldown: 0.9, durability: 200, projectile: 'i_wood_boomerang', pierce: true }, 14),
  gun('chakram', 'จักรเหล็ก', 'boomerang', 'จานคมหมุนทะลุศัตรูแล้วบินกลับ', { damage: 28, ammo: null, speed: 280, cooldown: 0.8, durability: 400, projectile: 'i_chakram', pierce: true }, 75, { status: [st('bleed', 0.2, 3)] }),
  // ---------- ไม้เท้าเวทธาตุ ----------
  gun('fire_staff', 'ไม้เท้าอัคคี', 'staff', 'ลูกไฟเผาศัตรูต่อเนื่อง', { damage: 20, ammo: null, speed: 260, cooldown: 0.5, durability: 350, projectile: 'fireball' }, 200, { status: [st('burn', 0.7, 3)] }),
  gun('frost_staff', 'ไม้เท้าน้ำแข็ง', 'staff', 'ลูกน้ำแข็งทำให้ศัตรูช้าลงมาก', { damage: 18, ammo: null, speed: 260, cooldown: 0.5, durability: 350, projectile: 'proj_ice' }, 200, { status: [st('freeze', 0.75, 2.5, 0.6)] }),
  gun('lightning_staff', 'ไม้เท้าสายฟ้า', 'staff', 'สายฟ้ากระโดดไปหาศัตรู 3 ตัว', { damage: 22, ammo: null, speed: 420, cooldown: 0.6, durability: 350, projectile: 'proj_spark' }, 220, { chain: 3, status: [st('stun', 0.2, 0.4)] }),
  gun('poison_staff', 'ไม้เท้าพิษ', 'staff', 'ลูกพิษ ติดซ้อนได้หลายชั้น', { damage: 12, ammo: null, speed: 240, cooldown: 0.45, durability: 350, projectile: 'proj_poison' }, 190, { status: [st('poison', 0.9, 6)] }),

  // ---------- อาวุธเวทชุดใหม่ (ไม่ใช้กระสุน · ใช้สแตมินาต่อการร่าย `mana`) ----------
  gun('apprentice_wand', 'ไม้กายสิทธิ์ฝึกหัด', 'wand', 'ด้ามเขากวาง ปลายเรืองแสงหิ่งห้อย ร่ายลูกเวทรัวเร็ว', { damage: 8, ammo: null, speed: 300, cooldown: 0.3, durability: 260, projectile: 'proj_arcane', mana: 3 }, 40),
  gun('water_staff', 'ไม้เท้าวารี', 'staff', 'ลูกน้ำกระแทกศัตรูกระเด็น เปียกจนเชื่องช้า', { damage: 20, ammo: null, speed: 260, cooldown: 0.5, durability: 380, projectile: 'proj_water', mana: 4 }, 210, { knockback: 1.6, status: [st('freeze', 0.35, 2, 0.4)] }),
  gun('wind_staff', 'ไม้เท้าวายุ', 'staff', 'ใบมีดลมทะลุทั้งแนว ผลักศัตรูกระเด็นไกล', { damage: 16, ammo: null, speed: 360, cooldown: 0.4, durability: 380, projectile: 'proj_wind', pierce: true, life: 0.9, mana: 4 }, 210, { knockback: 2 }),
  gun('earth_staff', 'ไม้เท้าปฐพี', 'staff', 'ขว้างหินผาก้อนใหญ่ ทุบศัตรูจนมึน', { damage: 30, ammo: null, speed: 220, cooldown: 0.8, durability: 420, projectile: 'proj_rock', mana: 5 }, 220, { knockback: 1.4, status: [st('stun', 0.3, 0.8)] }),
  gun('fire_tome', 'คัมภีร์อัคคี', 'tome', 'เปิดคัมภีร์ปล่อยลูกไฟ 3 ลูกเป็นพัด', { damage: 9, ammo: null, speed: 260, cooldown: 0.65, durability: 380, projectile: 'fireball', pellets: 3, spread: 0.3, life: 0.9, mana: 6 }, 240, { status: [st('burn', 0.5, 3)] }),
  gun('holy_staff', 'ไม้เท้าแสงศักดิ์สิทธิ์', 'staff', 'ตะวันศักดิ์สิทธิ์ทะลุทั้งแนว เผาผลาญอันเดด', { damage: 30, ammo: null, speed: 320, cooldown: 0.55, durability: 520, projectile: 'proj_holy', pierce: true, mana: 5 }, 440, { special: 'holylight' }),
  gun('blood_staff', 'ไม้เท้าโลหิต', 'staff', 'ร่ายด้วยเลือดของตัวเอง แลกกับการดูดเลือดศัตรู', { damage: 26, ammo: null, speed: 280, cooldown: 0.5, durability: 520, projectile: 'proj_blood' }, 420, { special: 'bloodpact', status: [st('bleed', 0.8, 4)] }),
  gun('abyss_tome', 'คัมภีร์ห้วงทะเลลึก', 'tome', 'หมึกคราเคนกลายเป็นลูกเงา 3 ลูก ทะลุศัตรู', { damage: 18, ammo: null, speed: 280, cooldown: 0.7, durability: 520, projectile: 'proj_shadow', pellets: 3, spread: 0.35, life: 1, pierce: true, mana: 6 }, 430, { status: [st('stun', 0.15, 0.5)] }),
  gun('storm_wand', 'คทาอัสนีกิเลน', 'wand', 'เขากิเลนเรียกสายฟ้ารัวเร็ว กระโดดต่อ 2 ตัว', { damage: 14, ammo: null, speed: 420, cooldown: 0.28, durability: 520, projectile: 'proj_spark', mana: 3 }, 450, { chain: 2, status: [st('stun', 0.1, 0.4)] }),
  gun('glacier_orb', 'ลูกแก้วมังกรน้ำแข็ง', 'orb', 'ลูกแก้วพายุหิมะ แตกแล้วแช่แข็งทั้งวง', { damage: 36, ammo: null, speed: 200, cooldown: 0.9, durability: 520, projectile: 'proj_frost_orb', mana: 8 }, 460, { special: 'orbburst', status: [st('freeze', 0.6, 2, 1)] }),
  gun('gaia_orb', 'ลูกแก้วธรณี', 'orb', 'พลังหยกปฐพี แตกแล้วศัตรูทั้งวงมึนงง', { damage: 40, ammo: null, speed: 190, cooldown: 1, durability: 560, projectile: 'proj_jade', mana: 8 }, 440, { special: 'orbburst', status: [st('stun', 0.5, 1)] }),

  // ---------- ของขว้าง ----------
  thrown('molotov', 'ระเบิดขวดเพลิง', 'bomb', 'ขวดน้ำมัน แตกแล้วไฟลุกบนพื้น 4 วิ', { damage: 20, radius: 34, kind: 'molotov', dur: 4 }, 15, 20),
  thrown('ice_bomb', 'ระเบิดน้ำแข็ง', 'bomb', 'แช่แข็งศัตรูทั้งวง', { damage: 25, radius: 48, kind: 'ice' }, 30, 20, { status: [st('freeze', 1, 2.5, 1)] }),
  thrown('smoke_bomb', 'ระเบิดควัน', 'bomb', 'ควันหนาทึบ ศัตรูข้างในมึนงง', { damage: 0, radius: 50, kind: 'smoke', dur: 3.5 }, 12, 20, { status: [st('stun', 1, 1.2)] }),
  thrown('flash_bomb', 'ระเบิดแสง', 'bomb', 'แสงวาบจ้า ศัตรูมึนงงนาน', { damage: 10, radius: 64, kind: 'flash' }, 28, 20, { status: [st('stun', 1, 3)] }),
  thrown('poison_bomb', 'ระเบิดแก๊สพิษ', 'bomb', 'หมอกพิษค้างบนพื้น 5 วิ', { damage: 10, radius: 44, kind: 'poison', dur: 5 }, 18, 20, { status: [st('poison', 1, 4)] }),
  thrown('cluster_bomb', 'ระเบิดลูกปราย', 'bomb', 'ระเบิดแล้วแตกเป็นลูกเล็กอีก 5 ลูก', { damage: 50, radius: 32, kind: 'cluster', count: 5 }, 60, 20),
  thrown('throwing_knife', 'มีดบิน', 'knife', 'ขว้างเร็ว เลือดออก', { damage: 14, radius: 0, kind: 'knife' }, 3, 40, { status: [st('bleed', 0.2, 3)] }),
  thrown('shuriken', 'ดาวกระจาย', 'knife', 'ขว้างทีละ 3 ดาว', { damage: 10, radius: 0, kind: 'shuriken' }, 3, 40),
  thrown('javelin', 'หอกซัด', 'javelin', 'ขว้างแรง ทะลุศัตรูทั้งแนว', { damage: 32, radius: 0, kind: 'javelin' }, 6, 15),
  // ---------- กระสุนใหม่ ----------
  { id: 'shell', name: 'ลูกซอง', desc: 'กระสุนปืนลูกซอง', icon: 'i_shell', type: 'ammo', stack: 99, value: 4 },
  { id: 'rifle_round', name: 'กระสุนไรเฟิล', desc: 'กระสุนปืนไรเฟิล หัวแหลมยาว', icon: 'i_rifle_round', type: 'ammo', stack: 99, value: 6 },

  // ---------- อาวุธเทพชุดใหม่ (ได้จากกล่องเท่านั้น) ----------
  melee('glacier_greatsword', 'ดาบเทพธารน้ำแข็ง', 'greatsword', 'ฟันครบ 4 ครั้งปล่อยคลื่นเยือกแข็งรอบตัว', 110, 26, 1500, 1600, { rarity: 'legendary', special: 'frostnova', status: [st('freeze', 0.5, 3, 0.6)] }),
  melee('naga_spear', 'หอกพญานาค', 'spear', 'แทงแล้วพ่นหมอกพิษพญานาค', 92, 32, 1500, 1500, { rarity: 'legendary', special: 'venom', status: [st('poison', 1, 6)] }),
  melee('rahu_fangs', 'เขี้ยวคู่ราหู', 'dagger', 'คอมโบครบ 5 ฮิต ใบมีดหมุนเป็นพายุ', 52, 15, 1500, 1500, { rarity: 'legendary', special: 'bladestorm', critBonus: 10, status: [st('bleed', 0.4, 4)] }),
  gun('garuda_bow', 'ธนูพญาครุฑ', 'bow', 'ศรไล่ล่าเป้าเอง ยิงทีละ 2 ไม่ใช้ลูกธนู', { damage: 44, ammo: null, speed: 420, cooldown: 0.4, durability: 1500, projectile: 'arrow', pierce: true, life: 1.6 }, 1550, { rarity: 'legendary', special: 'homing' }),
  gun('void_staff', 'คทาหลุมดำ', 'staff', 'ยิงลูกแก้วมืดที่กลายเป็นหลุมดำ', { damage: 40, ammo: null, speed: 240, cooldown: 0.9, durability: 1500, projectile: 'proj_void' }, 1600, { rarity: 'legendary', special: 'blackhole' }),
  // อาวุธเวทเทพจากวัสดุสัตว์ในตำนาน (แปลนเทพ: กล่องเพชร หรือลุ้นจากตัวสัตว์ในตำนานเอง)
  gun('naga_staff', 'คทาพญานาค', 'staff', 'งูมรกตพ่นน้ำ — กระสุนแตกเป็นคลื่นพิษวงกว้าง', { damage: 42, ammo: null, speed: 280, cooldown: 0.6, durability: 1500, projectile: 'proj_naga', pierce: true, mana: 5 }, 1650, { rarity: 'legendary', special: 'tidal', status: [st('poison', 0.6, 5)] }),
  gun('garuda_tome', 'คัมภีร์ครุฑ', 'tome', 'ขนครุฑ 5 เส้นพุ่งไล่ล่าเป้าเอง', { damage: 22, ammo: null, speed: 320, cooldown: 0.75, durability: 1500, projectile: 'proj_feather', life: 1.4, mana: 7 }, 1600, { rarity: 'legendary', special: 'featherstorm', knockback: 1.6 }),
  gun('phoenix_orb', 'ลูกแก้วหงส์เพลิง', 'orb', 'ลูกไฟหงส์ระเบิด ทิ้งทะเลเพลิง ดูดพลังชีวิต', { damage: 60, ammo: null, speed: 220, cooldown: 0.9, durability: 1500, projectile: 'fireball', mana: 8 }, 1700, { rarity: 'legendary', special: 'phoenixfire', status: [st('burn', 1, 3)] }),
  gun('dragon_cannon', 'ปืนมังกรเพลิง', 'shotgun', 'พ่นลูกไฟ 7 ลูก เผาทุกสิ่ง ไม่ใช้กระสุน', { damage: 26, ammo: null, speed: 380, cooldown: 0.9, durability: 1500, projectile: 'fireball', pellets: 7, spread: 0.7, life: 0.45 }, 1650, { rarity: 'legendary', special: 'dragonfire', status: [st('burn', 1, 3)] }),
];

/** เติมชนิด/พลังให้อาวุธชุดเดิมใน items.ts */
export const LEGACY_WEAPON_PATCH: Record<string, Partial<ItemDef>> = {
  wood_sword: { weaponClass: 'sword' },
  iron_sword: { weaponClass: 'sword' },
  gold_sword: { weaponClass: 'sword', critBonus: 10 },
  crystal_sword: { weaponClass: 'sword' },
  meteor_sword: { weaponClass: 'sword', status: [st('burn', 0.3, 3)] },
  spear: { weaponClass: 'spear' },
  iron_spear: { weaponClass: 'spear' },
  bow: { weaponClass: 'bow' },
  crossbow: { weaponClass: 'crossbow' },
  flintlock: { weaponClass: 'pistol' },
  crystal_staff: { weaponClass: 'staff' },
  bomb: { weaponClass: 'bomb' },
  thunder_blade: { weaponClass: 'sword' },
  inferno_axe: { weaponClass: 'axe' },
  vampire_scythe: { weaponClass: 'scythe' },
  thor_hammer: { weaponClass: 'mace' },
  storm_bow: { weaponClass: 'bow' },
  cosmic_staff: { weaponClass: 'staff' },
};
