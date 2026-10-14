import type { Biome } from './islands';

/**
 * AI:
 *   flee     เดินเล่น → หนีผู้เล่น
 *   neutral  โดนตีแล้วสู้กลับ
 *   hunter   เห็นผู้เล่นในระยะแล้วไล่
 *   zombie   ไล่ผู้เล่นตลอด ทุบสิ่งก่อสร้างที่ขวาง
 *   ranged   รักษาระยะแล้วยิงกระสุน
 *   flyer    บินข้ามกำแพง/น้ำ
 *   swimmer  อยู่ในน้ำเท่านั้น (โจมตีเรือ/คนริมน้ำ)
 *   wrecker  พุ่งทำลายสิ่งก่อสร้างก่อน
 *   boss     ไล่ + ท่าพิเศษ (ชาร์จ / ยิงลูกไฟ / เรียกลูกน้อง)
 */
export type MobAI = 'flee' | 'neutral' | 'hunter' | 'zombie' | 'ranged' | 'flyer' | 'swimmer' | 'wrecker' | 'boss';

/** ท่าพิเศษของสัตว์ในตำนาน: charge พุ่งชน · summon เรียกลูกน้อง · nova คลื่นรอบตัว · strike โจมตีจากฟ้า/น้ำตามวงเตือน · cloud หมอกพิษใต้เท้าผู้เล่น */
export type BeastMove = 'charge' | 'summon' | 'nova' | 'strike' | 'cloud';
/** ธาตุของท่า (สีเอฟเฟกต์ + ผลที่ติดผู้เล่น) */
export type BeastElement = 'fire' | 'ice' | 'storm' | 'poison' | 'water' | 'earth' | 'wind';
/** สถานะที่ติดผู้เล่นเมื่อโดนตี/โดนกระสุน: poison/burn = เสีย HP ต่อเนื่อง · chill = เดินช้า · shock = ช้ามาก (ไฟฟ้าช็อต) */
export type Affliction = 'poison' | 'burn' | 'chill' | 'shock';
/** กฎการเกิดของสัตว์ในตำนาน — where = ไบโอมเกาะ หรือ 'sea' (ทะเลลึกตอนล่องเรือ) · chance = โอกาสต่อการเช็ก 1 ครั้ง (ทุก 6 วิ) */
export interface LegendSpawn {
  where: Biome | 'sea';
  time: 'day' | 'night' | 'any';
  chance: number;
}

export interface MobDef {
  id: string;
  name: string;
  texture: string;
  hp: number;
  attack: number;
  speed: number;
  ai: MobAI;
  aggroRange: number;
  body: { w: number; h: number };
  drops: { item: string; qty: [number, number]; chance: number; meat?: boolean }[];
  xp: number;
  scale?: number;
  tint?: number;
  alpha?: number;
  /** ลดดาเมจที่ได้รับ (0..1) */
  armor?: number;
  /** ยิงกระสุน (ranged / boss) */
  shoot?: { projectile: string; damage: number; speed: number; cooldown: number; range: number; burst?: number };
  /** ตายแล้วแตกเป็นตัวเล็ก */
  splits?: { id: string; count: number };
  /** บอส: ท่าพิเศษ */
  special?: 'charge' | 'summon';
  summon?: string;
  /** ดาเมจต่อสิ่งก่อสร้าง (คูณ) */
  structureMult?: number;
  // ---------- สัตว์ชุดใหม่ / สัตว์ในตำนาน ----------
  /** การเคลื่อนที่พิเศษ (ใช้กับ ai อื่นที่ไม่ใช่ flyer/swimmer): fly = บิน · swim = อยู่ในน้ำ · amphi = ได้ทั้งบกและน้ำ */
  move?: 'fly' | 'swim' | 'amphi';
  /** โดนตี/โดนกระสุนของตัวนี้แล้วติดสถานะ (วินาที) */
  onHit?: { kind: Affliction; dur: number; power?: number };
  /** สัตว์ประจำเกาะที่ออกมาเฉพาะกลางคืน */
  nightOnly?: boolean;
  /** แหล่งที่พบ (แสดงในคลังภาพ) */
  habitat?: string;
  /** สัตว์ในตำนาน: หลอด HP บอส · ประกาศตอนปรากฏ · เกิดยากตามกฎ spawn */
  legendary?: boolean;
  /** ตำนานสั้นๆ (ข้อความตอนปรากฏตัว) */
  lore?: string;
  /** ท่าพิเศษ (สุ่มสลับทุก moveCd วิ) */
  moves?: BeastMove[];
  moveCd?: number;
  element?: BeastElement;
  /** ล้มครั้งแรกแล้วฟื้นคืนชีพที่ HP 50% (ครั้งเดียว) */
  revive?: boolean;
  /** เลเวลวันขั้นต่ำก่อนเริ่มปรากฏ + กฎการเกิด */
  minDay?: number;
  spawn?: LegendSpawn[];
}

const M = (d: MobDef) => d;
const meat = (lo: number, hi: number, chance = 1) => ({ item: 'raw_meat', qty: [lo, hi] as [number, number], chance, meat: true });

export const MOBS: Record<string, MobDef> = {
  // ---------- สัตว์ ----------
  rabbit: M({ id: 'rabbit', name: 'กระต่าย', texture: 'rabbit', hp: 10, attack: 0, speed: 70, ai: 'flee', aggroRange: 60, body: { w: 10, h: 7 }, drops: [{ item: 'raw_meat', qty: [1, 1], chance: 1, meat: true }], xp: 2 }),
  boar: M({ id: 'boar', name: 'หมูป่า', texture: 'boar', hp: 45, attack: 9, speed: 52, ai: 'neutral', aggroRange: 0, body: { w: 14, h: 8 }, drops: [{ item: 'raw_meat', qty: [2, 3], chance: 1, meat: true }, { item: 'hide', qty: [1, 1], chance: 0.7 }], xp: 6 }),
  wolf: M({ id: 'wolf', name: 'หมาป่า', texture: 'wolf', hp: 35, attack: 7, speed: 70, ai: 'hunter', aggroRange: 100, body: { w: 13, h: 8 }, drops: [{ item: 'raw_meat', qty: [1, 2], chance: 1, meat: true }, { item: 'hide', qty: [1, 1], chance: 0.5 }], xp: 8 }),
  snow_wolf: M({ id: 'snow_wolf', name: 'หมาป่าหิมะ', texture: 'wolf', hp: 50, attack: 10, speed: 74, ai: 'hunter', aggroRange: 120, body: { w: 13, h: 8 }, tint: 0xdfe8f2, drops: [{ item: 'raw_meat', qty: [1, 2], chance: 1, meat: true }, { item: 'hide', qty: [1, 2], chance: 0.9 }], xp: 12 }),

  // ---------- มอนสเตอร์ ----------
  zombie: M({ id: 'zombie', name: 'ซอมบี้', texture: 'zombie', hp: 32, attack: 8, speed: 34, ai: 'zombie', aggroRange: 400, body: { w: 8, h: 6 }, drops: [{ item: 'fiber', qty: [1, 2], chance: 0.5 }, { item: 'coin', qty: [1, 3], chance: 0.4 }, { item: 'carrot_seed', qty: [1, 1], chance: 0.08 }], xp: 5 }),
  skeleton: M({ id: 'skeleton', name: 'โครงกระดูกนักธนู', texture: 'skeleton', hp: 28, attack: 6, speed: 42, ai: 'ranged', aggroRange: 220, body: { w: 8, h: 6 }, shoot: { projectile: 'bone', damage: 8, speed: 170, cooldown: 1.8, range: 120 }, drops: [{ item: 'bone', qty: [1, 3], chance: 1 }, { item: 'arrow', qty: [2, 5], chance: 0.4 }], xp: 8 }),
  mummy: M({ id: 'mummy', name: 'มัมมี่', texture: 'mummy', hp: 60, attack: 12, speed: 32, ai: 'zombie', aggroRange: 400, body: { w: 8, h: 6 }, armor: 0.15, drops: [{ item: 'fiber', qty: [3, 6], chance: 1 }, { item: 'gold_ore', qty: [1, 1], chance: 0.25 }], xp: 12 }),
  slime: M({ id: 'slime', name: 'สไลม์', texture: 'slime', hp: 30, attack: 6, speed: 40, ai: 'zombie', aggroRange: 300, body: { w: 12, h: 7 }, splits: { id: 'slime_small', count: 2 }, drops: [{ item: 'slime_gel', qty: [1, 2], chance: 1 }], xp: 5 }),
  slime_small: M({ id: 'slime_small', name: 'สไลม์จิ๋ว', texture: 'slime', hp: 10, attack: 3, speed: 55, ai: 'zombie', aggroRange: 300, body: { w: 8, h: 5 }, scale: 0.6, drops: [{ item: 'slime_gel', qty: [1, 1], chance: 0.5 }], xp: 2 }),
  bat: M({ id: 'bat', name: 'ค้างคาวยักษ์', texture: 'bat', hp: 16, attack: 5, speed: 82, ai: 'flyer', aggroRange: 400, body: { w: 10, h: 6 }, drops: [{ item: 'bat_wing', qty: [1, 1], chance: 0.8 }], xp: 4 }),
  crab: M({ id: 'crab', name: 'ปูยักษ์', texture: 'crab', hp: 55, attack: 11, speed: 46, ai: 'zombie', aggroRange: 300, body: { w: 14, h: 7 }, armor: 0.35, structureMult: 1.5, drops: [{ item: 'crab_shell', qty: [1, 2], chance: 0.9 }, { item: 'raw_meat', qty: [1, 2], chance: 0.6, meat: true }], xp: 10 }),
  serpent: M({ id: 'serpent', name: 'งูทะเล', texture: 'serpent', hp: 80, attack: 14, speed: 70, ai: 'swimmer', aggroRange: 260, body: { w: 14, h: 8 }, drops: [{ item: 'fish', qty: [2, 4], chance: 1 }, { item: 'crystal', qty: [1, 1], chance: 0.15 }], xp: 16 }),
  imp: M({ id: 'imp', name: 'อิมป์ไฟ', texture: 'imp', hp: 34, attack: 8, speed: 56, ai: 'ranged', aggroRange: 240, body: { w: 8, h: 6 }, shoot: { projectile: 'fireball', damage: 12, speed: 150, cooldown: 2, range: 130 }, drops: [{ item: 'sulfur', qty: [1, 2], chance: 0.7 }, { item: 'coal', qty: [1, 2], chance: 0.5 }], xp: 10 }),
  golem: M({ id: 'golem', name: 'โกเลมหิน', texture: 'golem', hp: 200, attack: 22, speed: 26, ai: 'wrecker', aggroRange: 400, body: { w: 16, h: 8 }, armor: 0.4, structureMult: 3, drops: [{ item: 'stone', qty: [6, 10], chance: 1 }, { item: 'iron_ore', qty: [2, 4], chance: 0.8 }, { item: 'crystal', qty: [1, 1], chance: 0.2 }], xp: 30 }),
  yeti: M({ id: 'yeti', name: 'เยติ', texture: 'yeti', hp: 120, attack: 18, speed: 50, ai: 'hunter', aggroRange: 200, body: { w: 14, h: 8 }, drops: [{ item: 'yeti_fur', qty: [1, 2], chance: 1 }, { item: 'raw_meat', qty: [2, 3], chance: 1, meat: true }], xp: 22 }),
  shade: M({ id: 'shade', name: 'เงาหลอน', texture: 'shade', hp: 25, attack: 12, speed: 48, ai: 'zombie', aggroRange: 400, body: { w: 8, h: 6 }, alpha: 0.7, drops: [{ item: 'crystal', qty: [1, 1], chance: 0.05 }], xp: 6 }),

  // ---------- สัตว์ป่าชุดใหม่ ----------
  deer: M({ id: 'deer', name: 'กวางป่า', texture: 'deer', hp: 30, attack: 0, speed: 78, ai: 'flee', aggroRange: 90, body: { w: 12, h: 7 }, drops: [meat(2, 3), { item: 'hide', qty: [1, 1], chance: 0.6 }, { item: 'antler', qty: [1, 1], chance: 0.45 }], xp: 4 }),
  monkey: M({ id: 'monkey', name: 'ลิงแสม', texture: 'monkey', hp: 26, attack: 5, speed: 76, ai: 'neutral', aggroRange: 0, body: { w: 9, h: 6 }, drops: [{ item: 'berry', qty: [1, 3], chance: 0.7 }, { item: 'coin', qty: [2, 8], chance: 0.35 }, meat(1, 1, 0.5)], xp: 5, habitat: 'ขโมยของเก่ง — ล้มแล้วมักทำเหรียญที่ขโมยมาหล่น' }),
  parrot: M({ id: 'parrot', name: 'นกแก้วมาคอว์', texture: 'parrot', hp: 8, attack: 0, speed: 84, ai: 'flee', move: 'fly', aggroRange: 70, body: { w: 8, h: 6 }, drops: [{ item: 'feather', qty: [1, 3], chance: 1 }, meat(1, 1, 0.4)], xp: 3 }),
  cobra: M({ id: 'cobra', name: 'งูเห่า', texture: 'cobra', hp: 26, attack: 8, speed: 52, ai: 'hunter', aggroRange: 90, body: { w: 12, h: 5 }, onHit: { kind: 'poison', dur: 4, power: 3 }, drops: [{ item: 'venom_sac', qty: [1, 1], chance: 0.6 }, meat(1, 1, 0.5), { item: 'hide', qty: [1, 1], chance: 0.3 }], xp: 8 }),
  scorpion: M({ id: 'scorpion', name: 'แมงป่องยักษ์', texture: 'scorpion', hp: 42, attack: 10, speed: 48, ai: 'hunter', aggroRange: 100, body: { w: 14, h: 6 }, armor: 0.25, onHit: { kind: 'poison', dur: 5, power: 3 }, drops: [{ item: 'venom_sac', qty: [1, 1], chance: 0.7 }, { item: 'crab_shell', qty: [1, 1], chance: 0.2 }], xp: 10 }),
  penguin: M({ id: 'penguin', name: 'เพนกวิน', texture: 'penguin', hp: 16, attack: 0, speed: 44, ai: 'flee', aggroRange: 70, body: { w: 8, h: 6 }, drops: [meat(1, 2), { item: 'feather', qty: [1, 2], chance: 0.7 }, { item: 'fish', qty: [1, 1], chance: 0.4 }], xp: 3 }),
  buffalo: M({ id: 'buffalo', name: 'ควายป่า', texture: 'buffalo', hp: 110, attack: 15, speed: 50, ai: 'neutral', aggroRange: 0, body: { w: 16, h: 8 }, drops: [meat(3, 5), { item: 'hide', qty: [2, 3], chance: 1 }, { item: 'bone', qty: [1, 2], chance: 0.5 }], xp: 14 }),
  fox: M({ id: 'fox', name: 'จิ้งจอกแดง', texture: 'fox', hp: 24, attack: 6, speed: 82, ai: 'hunter', aggroRange: 90, body: { w: 11, h: 6 }, drops: [meat(1, 1), { item: 'hide', qty: [1, 1], chance: 0.7 }], xp: 6 }),
  firefly_swarm: M({ id: 'firefly_swarm', name: 'ฝูงหิ่งห้อย', texture: 'firefly_swarm', hp: 6, attack: 0, speed: 40, ai: 'flee', move: 'fly', aggroRange: 50, body: { w: 8, h: 8 }, nightOnly: true, drops: [{ item: 'glow_dust', qty: [1, 2], chance: 1 }], xp: 2 }),

  // ---------- สัตว์ในน้ำ (เกิดในน้ำตื้นใกล้ฝั่ง / ทะเลลึกตอนล่องเรือ) ----------
  shark: M({ id: 'shark', name: 'ฉลามขาว', texture: 'shark', hp: 90, attack: 16, speed: 84, ai: 'swimmer', aggroRange: 240, body: { w: 16, h: 7 }, drops: [meat(2, 3), { item: 'shark_tooth', qty: [1, 2], chance: 0.8 }, { item: 'fish', qty: [1, 2], chance: 0.6 }], xp: 18, habitat: '🌊 ทะเลลึก — ไล่กัดเรือ' }),
  jellyfish: M({ id: 'jellyfish', name: 'แมงกะพรุนไฟ', texture: 'jellyfish', hp: 20, attack: 6, speed: 22, ai: 'swimmer', aggroRange: 140, body: { w: 8, h: 8 }, alpha: 0.88, onHit: { kind: 'shock', dur: 1.6 }, drops: [{ item: 'slime_gel', qty: [1, 2], chance: 1 }], xp: 4, habitat: '🌊 ลอยในน้ำตื้นและทะเลลึก — โดนแล้วชาจนเดินช้า' }),
  octopus: M({ id: 'octopus', name: 'ปลาหมึกยักษ์', texture: 'octopus', hp: 60, attack: 9, speed: 50, ai: 'neutral', move: 'swim', aggroRange: 0, body: { w: 12, h: 8 }, onHit: { kind: 'chill', dur: 2 },
    shoot: { projectile: 'proj_ink', damage: 8, speed: 150, cooldown: 2.4, range: 110 }, drops: [{ item: 'fish', qty: [2, 3], chance: 1 }, { item: 'pearl', qty: [1, 1], chance: 0.15 }, meat(1, 1, 0.5)], xp: 12, habitat: '🌊 ทะเลลึก — โดนตีแล้วพ่นหมึก' }),
  sea_turtle: M({ id: 'sea_turtle', name: 'เต่าทะเล', texture: 'sea_turtle', hp: 70, attack: 0, speed: 36, ai: 'flee', move: 'swim', aggroRange: 60, body: { w: 14, h: 8 }, armor: 0.4, drops: [{ item: 'turtle_shell', qty: [1, 1], chance: 0.5 }, meat(1, 2), { item: 'pearl', qty: [1, 1], chance: 0.08 }], xp: 8, habitat: '🌊 ทะเลลึกยามกลางวัน — ใจดี ไม่สู้' }),
  manta: M({ id: 'manta', name: 'กระเบนราหู', texture: 'manta', hp: 50, attack: 0, speed: 62, ai: 'flee', move: 'swim', aggroRange: 80, body: { w: 16, h: 6 }, drops: [meat(2, 2), { item: 'fish', qty: [1, 2], chance: 0.7 }], xp: 6, habitat: '🌊 ทะเลลึกยามกลางวัน' }),
  piranha: M({ id: 'piranha', name: 'ฝูงปิรันย่า', texture: 'piranha', hp: 14, attack: 5, speed: 70, ai: 'swimmer', aggroRange: 160, body: { w: 9, h: 5 }, drops: [{ item: 'fish', qty: [1, 1], chance: 0.8 }, meat(1, 1, 0.3)], xp: 3, habitat: '🌊 น้ำตื้นของเกาะป่าดิบ/เกาะป่าสน — มาเป็นฝูง กัดคนริมน้ำ' }),
  electric_eel: M({ id: 'electric_eel', name: 'ปลาไหลไฟฟ้า', texture: 'electric_eel', hp: 55, attack: 12, speed: 58, ai: 'swimmer', aggroRange: 200, body: { w: 16, h: 5 }, onHit: { kind: 'shock', dur: 1.5 },
    shoot: { projectile: 'proj_spark', damage: 10, speed: 220, cooldown: 2.2, range: 100 }, drops: [{ item: 'fish', qty: [1, 2], chance: 1 }, { item: 'crystal', qty: [1, 1], chance: 0.1 }], xp: 12, habitat: '🌊 ทะเลลึกยามกลางคืน — ปล่อยไฟฟ้าช็อต' }),
  hermit_crab: M({ id: 'hermit_crab', name: 'ปูเสฉวนยักษ์', texture: 'hermit_crab', hp: 70, attack: 10, speed: 34, ai: 'neutral', aggroRange: 0, body: { w: 12, h: 7 }, armor: 0.5, drops: [{ item: 'crab_shell', qty: [1, 2], chance: 0.8 }, { item: 'pearl', qty: [1, 1], chance: 0.2 }, meat(1, 1, 0.5)], xp: 10, habitat: '🏖 ชายหาดทุกเกาะ — มุดเปลือกหอย เกราะหนา' }),
  kraken_tentacle: M({ id: 'kraken_tentacle', name: 'หนวดคราเคน', texture: 'kraken_tentacle', hp: 140, attack: 14, speed: 16, ai: 'swimmer', aggroRange: 400, body: { w: 10, h: 10 }, armor: 0.1, drops: [{ item: 'kraken_ink', qty: [1, 1], chance: 0.12 }, { item: 'fish', qty: [1, 1], chance: 0.5 }], xp: 12, habitat: '🐙 คราเคนเรียกออกมาจากใต้ทะเล' }),

  // ---------- มอนประจำไบโอมชุดใหม่ + มอนคืนภัยพิบัติชุดใหม่ (ใช้ sprite เดิม + สี/ขนาด) ----------
  bog_slime: M({ id: 'bog_slime', name: 'สไลม์บึง', texture: 'slime', hp: 36, attack: 7, speed: 38, ai: 'zombie', aggroRange: 260, body: { w: 12, h: 7 }, tint: 0x8a9a3a, onHit: { kind: 'poison', dur: 3, power: 2 },
    drops: [{ item: 'slime_gel', qty: [1, 3], chance: 1 }, { item: 'venom_sac', qty: [1, 1], chance: 0.2 }], xp: 7, habitat: '🌿 หนองน้ำป่าชายเลน — โดนแล้วติดพิษ' }),
  crystal_golem: M({ id: 'crystal_golem', name: 'โกเลมคริสตัล', texture: 'golem', hp: 170, attack: 18, speed: 30, ai: 'hunter', aggroRange: 150, body: { w: 16, h: 8 }, tint: 0xc8a8ff, armor: 0.45,
    drops: [{ item: 'crystal', qty: [1, 2], chance: 0.7 }, { item: 'stone', qty: [3, 6], chance: 1 }], xp: 26, habitat: '💎 เกาะคริสตัล — เกราะผลึกหนามาก' }),
  wraith: M({ id: 'wraith', name: 'วิญญาณหมอก', texture: 'shade', hp: 32, attack: 10, speed: 56, ai: 'zombie', aggroRange: 360, body: { w: 8, h: 6 }, tint: 0xbfe8ff, alpha: 0.6, onHit: { kind: 'chill', dur: 1.5 },
    drops: [{ item: 'glow_dust', qty: [1, 1], chance: 0.35 }, { item: 'crystal', qty: [1, 1], chance: 0.04 }], xp: 8, habitat: '👻 เกาะหมอกผี · ธารน้ำแข็งยามค่ำ — สัมผัสแล้วหนาวเยือก' }),
  blood_wolf: M({ id: 'blood_wolf', name: 'หมาป่าจันทร์เลือด', texture: 'wolf', hp: 55, attack: 11, speed: 84, ai: 'hunter', aggroRange: 400, body: { w: 13, h: 8 }, tint: 0xd04a5a, structureMult: 1.2,
    drops: [meat(1, 2), { item: 'hide', qty: [1, 2], chance: 0.8 }, { item: 'bone', qty: [1, 1], chance: 0.4 }], xp: 12, habitat: '🌕 คืนจันทร์เลือด — ล่าเป็นฝูง' }),
  skeleton_warrior: M({ id: 'skeleton_warrior', name: 'อัศวินโครงกระดูก', texture: 'skeleton', hp: 60, attack: 12, speed: 40, ai: 'zombie', aggroRange: 400, body: { w: 8, h: 6 }, tint: 0xd8cfa0, armor: 0.25, structureMult: 1.3,
    drops: [{ item: 'bone', qty: [2, 3], chance: 1 }, { item: 'iron_ore', qty: [1, 1], chance: 0.25 }], xp: 11, habitat: '💀 กองทัพโครงกระดูก — ถือโล่ บุกทุบกำแพง' }),
  giant_beetle: M({ id: 'giant_beetle', name: 'ด้วงยักษ์', texture: 'scorpion', hp: 40, attack: 9, speed: 58, ai: 'zombie', aggroRange: 400, body: { w: 14, h: 6 }, tint: 0x6fb04a, armor: 0.2, structureMult: 1.4,
    drops: [{ item: 'crab_shell', qty: [1, 1], chance: 0.35 }, { item: 'venom_sac', qty: [1, 1], chance: 0.15 }], xp: 9, habitat: '🪲 ฝูงแมลงยักษ์ — กัดกินทุกอย่างที่ขวาง' }),

  // ---------- บอส ----------
  crab_king: M({ id: 'crab_king', name: 'ราชาปู', texture: 'crab', hp: 700, attack: 20, speed: 44, ai: 'boss', aggroRange: 300, body: { w: 14, h: 7 }, scale: 2.6, tint: 0xffb080, armor: 0.3, special: 'charge', structureMult: 2,
    drops: [{ item: 'crab_shell', qty: [5, 8], chance: 1 }, { item: 'gold_ingot', qty: [2, 3], chance: 1 }, { item: 'coin', qty: [60, 100], chance: 1 }], xp: 250 }),
  king_boar: M({ id: 'king_boar', name: 'ราชาหมูป่า', texture: 'boar', hp: 600, attack: 18, speed: 46, ai: 'boss', aggroRange: 220, body: { w: 14, h: 8 }, scale: 2.4, tint: 0xd9a0a0, special: 'charge',
    drops: [{ item: 'raw_meat', qty: [6, 8], chance: 1 }, { item: 'hide', qty: [4, 6], chance: 1 }, { item: 'gold_ingot', qty: [2, 3], chance: 1 }], xp: 220 }),
  alpha_wolf: M({ id: 'alpha_wolf', name: 'จ่าฝูงหมาป่าเลือด', texture: 'wolf', hp: 900, attack: 22, speed: 70, ai: 'boss', aggroRange: 320, body: { w: 13, h: 8 }, scale: 2.3, tint: 0x9a1a2a, armor: 0.2, special: 'summon', summon: 'blood_wolf',
    drops: [{ item: 'hide', qty: [5, 8], chance: 1 }, { item: 'gold_ingot', qty: [2, 3], chance: 1 }, { item: 'raw_meat', qty: [5, 8], chance: 1, meat: true }, { item: 'coin', qty: [80, 140], chance: 1 }], xp: 300 }),
  skeleton_general: M({ id: 'skeleton_general', name: 'แม่ทัพโครงกระดูก', texture: 'skeleton', hp: 1000, attack: 20, speed: 38, ai: 'boss', aggroRange: 320, body: { w: 8, h: 6 }, scale: 2.4, tint: 0xffe08a, armor: 0.3, special: 'summon', summon: 'skeleton',
    shoot: { projectile: 'bone', damage: 14, speed: 180, cooldown: 2.2, range: 180, burst: 3 },
    drops: [{ item: 'bone', qty: [8, 12], chance: 1 }, { item: 'gold_ingot', qty: [2, 4], chance: 1 }, { item: 'enhance_stone', qty: [1, 3], chance: 1 }, { item: 'coin', qty: [100, 160], chance: 1 }], xp: 340 }),
  insect_queen: M({ id: 'insect_queen', name: 'ราชินีแมลงยักษ์', texture: 'scorpion', hp: 1100, attack: 22, speed: 44, ai: 'boss', aggroRange: 320, body: { w: 14, h: 6 }, scale: 2.6, tint: 0xb07bff, armor: 0.3, special: 'summon', summon: 'giant_beetle',
    onHit: { kind: 'poison', dur: 4, power: 5 }, shoot: { projectile: 'proj_naga', damage: 14, speed: 160, cooldown: 2.4, range: 170, burst: 3 },
    drops: [{ item: 'venom_sac', qty: [3, 5], chance: 1 }, { item: 'crystal', qty: [2, 3], chance: 1 }, { item: 'gold_ingot', qty: [2, 3], chance: 1 }, { item: 'coin', qty: [100, 160], chance: 1 }], xp: 360 }),
  demon_lord: M({ id: 'demon_lord', name: 'ราชาปีศาจ', texture: 'demon_lord', hp: 1500, attack: 26, speed: 40, ai: 'boss', aggroRange: 400, body: { w: 16, h: 8 }, armor: 0.25, special: 'summon', summon: 'imp',
    shoot: { projectile: 'fireball', damage: 18, speed: 170, cooldown: 2.6, range: 200, burst: 5 },
    drops: [{ item: 'demon_horn', qty: [1, 2], chance: 1 }, { item: 'meteorite', qty: [3, 5], chance: 1 }, { item: 'crystal', qty: [2, 4], chance: 1 }, { item: 'coin', qty: [150, 250], chance: 1 }], xp: 800 }),

  // ---------- สัตว์ในตำนาน (ai boss + legendary: เกิดยาก ตัวละ 1 ตัวในโลก — ดู systems/CreatureSystem.ts) ----------
  naga: M({ id: 'naga', name: 'พญานาค', texture: 'naga', hp: 2600, attack: 22, speed: 50, ai: 'boss', move: 'amphi', aggroRange: 260, body: { w: 22, h: 10 }, armor: 0.25, legendary: true,
    lore: 'ราชาแห่งงูใหญ่ผุดขึ้นจากสายน้ำ — ระวังหมอกพิษ!', moves: ['cloud', 'charge'], moveCd: 6, element: 'poison', onHit: { kind: 'poison', dur: 5, power: 5 },
    shoot: { projectile: 'proj_naga', damage: 16, speed: 170, cooldown: 2.2, range: 160, burst: 3 }, minDay: 5,
    spawn: [{ where: 'jungle', time: 'night', chance: 0.008 }, { where: 'home', time: 'night', chance: 0.0015 }, { where: 'sea', time: 'night', chance: 0.006 }, { where: 'swamp', time: 'night', chance: 0.01 }, { where: 'swamp', time: 'day', chance: 0.003 }],
    drops: [{ item: 'naga_scale', qty: [3, 5], chance: 1 }, { item: 'crystal', qty: [2, 3], chance: 1 }, { item: 'gold_ingot', qty: [2, 3], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.2 }, { item: 'bp_i_naga_staff', qty: [1, 1], chance: 0.3 }], xp: 650 }),
  garuda: M({ id: 'garuda', name: 'พญาครุฑ', texture: 'garuda', hp: 2200, attack: 26, speed: 80, ai: 'boss', move: 'fly', aggroRange: 300, body: { w: 20, h: 10 }, armor: 0.15, legendary: true,
    lore: 'เจ้าแห่งปักษาโฉบลงจากฟ้า — ขนครุฑพุ่งเป็นพายุ!', moves: ['charge', 'strike'], moveCd: 5, element: 'wind',
    shoot: { projectile: 'proj_feather', damage: 14, speed: 200, cooldown: 2, range: 170, burst: 5 }, minDay: 6,
    spawn: [{ where: 'forest', time: 'day', chance: 0.006 }, { where: 'snow', time: 'day', chance: 0.006 }, { where: 'special', time: 'any', chance: 0.012 }, { where: 'home', time: 'day', chance: 0.001 }, { where: 'savanna', time: 'day', chance: 0.007 }],
    drops: [{ item: 'garuda_feather', qty: [3, 5], chance: 1 }, { item: 'gold_ingot', qty: [3, 4], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.2 }, { item: 'bp_i_garuda_tome', qty: [1, 1], chance: 0.3 }], xp: 600 }),
  qilin: M({ id: 'qilin', name: 'กิเลน', texture: 'qilin', hp: 1900, attack: 22, speed: 92, ai: 'boss', aggroRange: 240, body: { w: 18, h: 8 }, armor: 0.2, legendary: true,
    lore: 'สัตว์มงคลกีบสายฟ้าวิ่งเร็วดุจลมพายุ — หลบวงฟ้าผ่า!', moves: ['strike', 'charge'], moveCd: 4.5, element: 'storm', onHit: { kind: 'shock', dur: 1.2 }, minDay: 4,
    spawn: [{ where: 'forest', time: 'day', chance: 0.007 }, { where: 'jungle', time: 'day', chance: 0.007 }, { where: 'home', time: 'day', chance: 0.0015 }, { where: 'bamboo', time: 'day', chance: 0.008 }, { where: 'mushroom', time: 'any', chance: 0.004 }],
    drops: [{ item: 'qilin_horn', qty: [1, 2], chance: 1 }, { item: 'crystal', qty: [3, 4], chance: 1 }, { item: 'elixir_luck', qty: [1, 1], chance: 0.5 }, { item: 'box_legend', qty: [1, 1], chance: 0.2 }], xp: 520 }),
  phoenix: M({ id: 'phoenix', name: 'หงส์เพลิง', texture: 'phoenix', hp: 2000, attack: 22, speed: 72, ai: 'boss', move: 'fly', aggroRange: 280, body: { w: 18, h: 10 }, legendary: true, revive: true,
    lore: 'วิหคอมตะแห่งเปลวไฟ — ล้มได้ครั้งหนึ่งมันจะฟื้นจากเถ้าถ่าน!', moves: ['nova', 'strike'], moveCd: 5.5, element: 'fire',
    shoot: { projectile: 'fireball', damage: 16, speed: 170, cooldown: 2.4, range: 180, burst: 5 }, minDay: 6,
    spawn: [{ where: 'volcanic', time: 'night', chance: 0.01 }, { where: 'desert', time: 'night', chance: 0.006 }, { where: 'special', time: 'night', chance: 0.012 }, { where: 'savanna', time: 'night', chance: 0.004 }],
    drops: [{ item: 'phoenix_feather', qty: [2, 4], chance: 1 }, { item: 'meteorite', qty: [2, 3], chance: 1 }, { item: 'sulfur', qty: [5, 8], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.2 }, { item: 'bp_i_phoenix_orb', qty: [1, 1], chance: 0.3 }], xp: 620 }),
  kraken: M({ id: 'kraken', name: 'คราเคน', texture: 'kraken', hp: 3200, attack: 28, speed: 58, ai: 'boss', move: 'swim', aggroRange: 320, body: { w: 24, h: 12 }, armor: 0.2, legendary: true, structureMult: 2,
    lore: 'ปีศาจหมึกยักษ์ใต้ทะเลลึก — มันจะลากเรือของคุณลงก้นทะเล!', moves: ['summon', 'strike'], summon: 'kraken_tentacle', moveCd: 6, element: 'water', onHit: { kind: 'chill', dur: 2 },
    shoot: { projectile: 'proj_ink', damage: 14, speed: 160, cooldown: 2.8, range: 150, burst: 3 }, minDay: 5,
    spawn: [{ where: 'sea', time: 'any', chance: 0.008 }, { where: 'sea', time: 'night', chance: 0.006 }, { where: 'atoll', time: 'any', chance: 0.004 }],
    drops: [{ item: 'kraken_ink', qty: [3, 5], chance: 1 }, { item: 'golden_fish', qty: [1, 2], chance: 1 }, { item: 'gold_ingot', qty: [3, 5], chance: 1 }, { item: 'pearl', qty: [1, 3], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.3 }], xp: 720 }),
  kochasi: M({ id: 'kochasi', name: 'คชสีห์', texture: 'kochasi', hp: 3000, attack: 30, speed: 48, ai: 'boss', aggroRange: 240, body: { w: 22, h: 10 }, armor: 0.35, legendary: true, structureMult: 3,
    lore: 'ผู้พิทักษ์กายราชสีห์เศียรคชสาร — กระทืบทีแผ่นดินไหว!', moves: ['charge', 'nova'], moveCd: 5, element: 'earth', minDay: 7,
    spawn: [{ where: 'ruins', time: 'any', chance: 0.01 }, { where: 'special', time: 'day', chance: 0.012 }, { where: 'desert', time: 'day', chance: 0.004 }, { where: 'haunted', time: 'any', chance: 0.007 }, { where: 'crystal', time: 'day', chance: 0.005 }],
    drops: [{ item: 'kochasi_tusk', qty: [1, 2], chance: 1 }, { item: 'gold_ingot', qty: [4, 6], chance: 1 }, { item: 'enhance_stone', qty: [3, 6], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.25 }], xp: 680 }),
  frost_dragon: M({ id: 'frost_dragon', name: 'มังกรน้ำแข็ง', texture: 'frost_dragon', hp: 2800, attack: 28, speed: 64, ai: 'boss', move: 'fly', aggroRange: 300, body: { w: 22, h: 10 }, armor: 0.2, legendary: true,
    lore: 'ลมหายใจเยือกแข็งพัดมาจากยอดเขา — โดนแล้วตัวแข็งเดินช้า!', moves: ['nova', 'strike'], moveCd: 5.5, element: 'ice', onHit: { kind: 'chill', dur: 2.5 },
    shoot: { projectile: 'proj_frost_orb', damage: 18, speed: 160, cooldown: 2.4, range: 180, burst: 3 }, minDay: 8,
    spawn: [{ where: 'snow', time: 'any', chance: 0.01 }, { where: 'special', time: 'night', chance: 0.006 }, { where: 'glacier', time: 'any', chance: 0.014 }, { where: 'crystal', time: 'night', chance: 0.005 }],
    drops: [{ item: 'frost_dragon_scale', qty: [3, 5], chance: 1 }, { item: 'crystal', qty: [3, 5], chance: 1 }, { item: 'yeti_fur', qty: [2, 4], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.25 }], xp: 700 }),
  stone_turtle: M({ id: 'stone_turtle', name: 'เต่ายักษ์ศิลา', texture: 'stone_turtle', hp: 4000, attack: 24, speed: 22, ai: 'boss', aggroRange: 200, body: { w: 26, h: 12 }, armor: 0.55, legendary: true, structureMult: 3,
    lore: 'เกาะเคลื่อนที่ได้! เต่าศิลาโบราณขึ้นฝั่งมา — กระดองแข็งดุจหินผา', moves: ['nova', 'charge'], moveCd: 6, element: 'earth',
    shoot: { projectile: 'proj_rock', damage: 18, speed: 140, cooldown: 3, range: 150, burst: 3 }, minDay: 4,
    spawn: [{ where: 'home', time: 'day', chance: 0.0015 }, { where: 'desert', time: 'day', chance: 0.005 }, { where: 'jungle', time: 'day', chance: 0.004 }, { where: 'forest', time: 'day', chance: 0.004 }, { where: 'atoll', time: 'day', chance: 0.007 }],
    drops: [{ item: 'jade_shell', qty: [1, 2], chance: 1 }, { item: 'stone', qty: [15, 25], chance: 1 }, { item: 'iron_ore', qty: [4, 8], chance: 1 }, { item: 'gold_ore', qty: [3, 5], chance: 1 }, { item: 'crystal', qty: [1, 3], chance: 1 }, { item: 'box_legend', qty: [1, 1], chance: 0.2 }], xp: 560 }),
};

/** บินได้ (ข้ามกำแพง/น้ำ) */
export const mobFlies = (d: MobDef) => d.ai === 'flyer' || d.move === 'fly';
/** อยู่ในน้ำเท่านั้น */
export const mobSwims = (d: MobDef) => d.ai === 'swimmer' || d.move === 'swim';
/** ไม่ชนกำแพง/ไม่ติดน้ำ (บิน · ว่ายน้ำ · สะเทินน้ำสะเทินบก) */
export const mobFreeMove = (d: MobDef) => mobFlies(d) || mobSwims(d) || d.move === 'amphi';
/** สัตว์ในตำนานทั้งหมด */
export const legendMobs = (): MobDef[] => Object.values(MOBS).filter((m) => m.legendary);

/** มอนต้นแบบ (ไม่รวมร่างขยายของดันเจี้ยน id แบบ `xxx@n` ที่สร้างตอนรันเกม) */
export const baseMobs = (): MobDef[] => Object.values(MOBS).filter((m) => !m.id.includes('@'));
