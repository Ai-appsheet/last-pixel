import type { NodeType } from '../world/WorldGenerator';
import { OPEN_ALL } from '../config/openWorld';

export type Biome =
  | 'home' | 'forest' | 'snow' | 'desert' | 'jungle' | 'volcanic' | 'ruins' | 'central' | 'special' | 'dungeon'
  | 'swamp' | 'mushroom' | 'crystal' | 'bamboo' | 'savanna' | 'glacier' | 'atoll' | 'haunted';

export interface BiomeDef {
  id: Biome;
  name: string;
  desc: string;
  /** อุณหภูมิอากาศ กลางวัน/กลางคืน (°C) */
  temp: [number, number];
  /** ตัวคูณความอันตราย (จำนวนศัตรู) */
  danger: number;
  color: string;
  /** สัตว์/มอนสเตอร์ประจำเกาะ */
  wildlife: string[];
  nightMobs: string[];
  /** ลักษณะพิเศษของพื้นที่ (แสดงบนการ์ดขึ้นเกาะครั้งแรก) */
  tip?: string;
}

export const BIOMES: Record<Biome, BiomeDef> = {
  home: { id: 'home', name: 'เกาะของคุณ', desc: 'เกาะส่วนตัว — สร้างบ้าน ฟาร์ม และฐานได้ตามใจ', temp: [26, 17], danger: 0.8, color: '#a7f070', wildlife: ['rabbit', 'boar', 'deer', 'buffalo', 'hermit_crab', 'firefly_swarm'], nightMobs: ['zombie'] },
  forest: { id: 'forest', name: 'เกาะป่าสน', desc: 'ไม้และสัตว์ป่าเยอะ', temp: [22, 12], danger: 1, color: '#38b764', wildlife: ['rabbit', 'boar', 'wolf', 'deer', 'fox', 'buffalo', 'hermit_crab'], nightMobs: ['zombie', 'skeleton'] },
  snow: { id: 'snow', name: 'เกาะหิมะ', desc: 'หนาวจัด — แร่เหล็กและเยติ', temp: [-4, -16], danger: 1.2, color: '#f4f4f4', wildlife: ['snow_wolf', 'penguin'], nightMobs: ['yeti', 'skeleton'] },
  desert: { id: 'desert', name: 'เกาะทะเลทราย', desc: 'ร้อนจัด — ทอง กำมะถัน กระบองเพชร', temp: [40, 14], danger: 1.2, color: '#ef7d57', wildlife: ['crab', 'scorpion', 'cobra', 'hermit_crab'], nightMobs: ['mummy', 'skeleton'] },
  jungle: { id: 'jungle', name: 'เกาะป่าดิบ', desc: 'พืชป่า เมล็ดหายาก และสไลม์', temp: [30, 22], danger: 1.1, color: '#257179', wildlife: ['boar', 'slime', 'monkey', 'parrot', 'cobra', 'firefly_swarm'], nightMobs: ['slime', 'bat'] },
  volcanic: { id: 'volcanic', name: 'เกาะภูเขาไฟ', desc: 'ถ่านหิน กำมะถัน คริสตัล — อิมป์และโกเลม', temp: [38, 28], danger: 1.5, color: '#b13e53', wildlife: ['imp'], nightMobs: ['imp', 'golem'] },
  central: { id: 'central', name: 'เกาะกลาง (ตลาดแลกเปลี่ยน)', desc: `เขตปลอดภัย — ห้ามต่อสู้ วางขาย/ซื้อของกับผู้เล่นอื่น · ${OPEN_ALL ? 'เปิดตลอด' : 'เปิดวันละ 2 รอบ รอบละ 60 นาที'}`, temp: [27, 20], danger: 0, color: '#ffcd75', wildlife: [], nightMobs: [] },
  special: { id: 'special', name: 'เกาะมหาสมบัติ', desc: `แร่หายาก หีบสมบัติ · มอนดรอปกล่อง ×2 · ${OPEN_ALL ? 'เปิดตลอด (ทรัพยากรรีเซ็ตทุกเที่ยงคืน)' : 'เปิดวันละ 2 รอบ รอบละ 60 นาที (เวลาสุ่มทุกวัน)'}`, temp: [25, 16], danger: 1.8, color: '#ffcd75', wildlife: ['golem', 'skeleton', 'mummy'], nightMobs: ['golem', 'shade', 'skeleton'] },
  dungeon: { id: 'dungeon', name: 'ดันเจี้ยน', desc: 'มืดมิด อันตราย — มอนสเตอร์ หีบสมบัติ บอส', temp: [16, 14], danger: 0, color: '#a77bdb', wildlife: [], nightMobs: [] },
  ruins: { id: 'ruins', name: 'เกาะซากโบราณ', desc: 'ซากอารยธรรม หีบสมบัติ และโครงกระดูก', temp: [24, 14], danger: 1.4, color: '#a77bdb', wildlife: ['skeleton', 'cobra'], nightMobs: ['skeleton', 'mummy'] },
  // ---------- ไบโอมชุดใหม่ ----------
  swamp: { id: 'swamp', name: 'หนองน้ำป่าชายเลน', desc: 'โกงกาง บึงน้ำ โคลน — สไลม์บึงและปิรันย่า', temp: [29, 23], danger: 1.2, color: '#6b8f3a', wildlife: ['bog_slime', 'cobra', 'monkey', 'firefly_swarm'], nightMobs: ['bog_slime', 'zombie', 'bat'], tip: '🟫 โคลนทำให้เดินช้า · 🟢 หลบหมอกพิษสีเขียว (ติดพิษ)' },
  mushroom: { id: 'mushroom', name: 'เกาะเห็ดยักษ์', desc: 'ป่าเห็ดยักษ์เรืองแสง — เก็บเห็ดเรืองแสงไว้ฟื้นสติ', temp: [21, 16], danger: 1.1, color: '#b98be8', wildlife: ['slime', 'firefly_swarm', 'deer', 'bat'], nightMobs: ['slime', 'shade', 'bat'], tip: '🍄 สปอร์ทำให้สติลดช้าๆ (อยู่ใกล้ไฟ/ในบ้านไม่ลด) · เห็ดยักษ์ส่องแสงยามค่ำ' },
  crystal: { id: 'crystal', name: 'เกาะคริสตัล', desc: 'พื้นเกล็ดผลึก สายแร่คริสตัลเต็มเกาะ — โกเลมคริสตัลเฝ้า', temp: [18, 8], danger: 1.5, color: '#c8a8ff', wildlife: ['crystal_golem', 'bat', 'penguin'], nightMobs: ['crystal_golem', 'golem', 'shade'], tip: '💎 สายแร่คริสตัลเยอะมาก (ต้องอีเต้อเหล็ก) · โกเลมคริสตัลเกราะหนา' },
  bamboo: { id: 'bamboo', name: 'ป่าไผ่ซากุระ', desc: 'สงบ ร่มรื่น — ไผ่ ซากุระ สัตว์ไม่ดุ', temp: [24, 15], danger: 0.6, color: '#9ad66a', wildlife: ['deer', 'rabbit', 'parrot', 'monkey', 'firefly_swarm'], nightMobs: ['zombie'], tip: '🎋 ไผ่ขึ้นแน่น ตัดได้ไม้ + เส้นใย · เกาะสงบ อันตรายต่ำ' },
  savanna: { id: 'savanna', name: 'ทุ่งหญ้าสะวันนา', desc: 'ทุ่งหญ้าเหลืองกว้าง ต้นอาคาเซีย — ฝูงควายป่า', temp: [34, 19], danger: 1.1, color: '#e3b04b', wildlife: ['buffalo', 'deer', 'fox', 'wolf', 'scorpion', 'rabbit'], nightMobs: ['wolf', 'zombie', 'skeleton'], tip: '🐃 ควายป่าเดินเป็นฝูง (อย่าตีถ้าไม่พร้อม) · แดดแรง หิวน้ำเร็ว' },
  glacier: { id: 'glacier', name: 'ธารน้ำแข็ง', desc: 'หนาวที่สุดในโลก — พื้นน้ำแข็งลื่น ถิ่นมังกรน้ำแข็ง', temp: [-12, -24], danger: 1.4, color: '#bfe8ff', wildlife: ['snow_wolf', 'penguin', 'yeti'], nightMobs: ['yeti', 'snow_wolf', 'wraith'], tip: '🧊 พื้นน้ำแข็งลื่นไถล · หนาวจัด ต้องมีไฟ/ชุดกันหนาว' },
  atoll: { id: 'atoll', name: 'เกาะปะการังวงแหวน', desc: 'เกาะวงแหวนล้อมลากูน — ปะการัง ไข่มุก ตกปลาดีมาก', temp: [30, 24], danger: 0.9, color: '#5ce1e6', wildlife: ['hermit_crab', 'crab', 'parrot'], nightMobs: ['crab', 'zombie'], tip: '🐚 ทุบปะการังได้ไข่มุก · 🎣 ตกปลาที่นี่ได้ของดีบ่อยขึ้น' },
  haunted: { id: 'haunted', name: 'เกาะหมอกผี', desc: 'หมอกหนาไม่เคยจาง ซากปรักหักพัง หีบสมบัติ — วิญญาณเร่ร่อน', temp: [16, 9], danger: 1.6, color: '#8b93b0', wildlife: ['shade', 'skeleton', 'wraith'], nightMobs: ['wraith', 'shade', 'skeleton', 'zombie'], tip: '👻 หมอกหนามองเห็นไม่ไกล · ผีออกทั้งวัน · หีบสมบัติในซาก' },
};

/** ทรัพยากรตามไบโอม × ชนิดพื้น (โอกาสต่อ tile) */
export function nodeTable(biome: Biome, tile: string): [NodeType, number][] {
  if (tile === 'sand' && biome === 'atoll') return [['coral', 0.03], ['tree', 0.03], ['grass', 0.01]];
  if (tile === 'sand') return [['tree', 0.025], ['rock', 0.012], ['grass', 0.012]];
  switch (biome) {
    case 'snow':
      return tile === 'stone' ? [['rock', 0.06], ['ore_iron', 0.05], ['ore_coal', 0.02], ['crystal', 0.004], ['ice', 0.015]] : [['tree', 0.12], ['rock', 0.025], ['ore_iron', 0.012], ['grass', 0.01], ['ice', 0.012]];
    case 'desert':
      return tile === 'stone' ? [['rock', 0.05], ['ore_gold', 0.025], ['ore_sulfur', 0.03]] : [['cactus', 0.035], ['rock', 0.02], ['grass', 0.008]];
    case 'jungle':
      return [['tree', 0.28], ['bush', 0.06], ['wild_crop', 0.025], ['grass', 0.06], ['rock', 0.01], ['vine', 0.03], ['herb', 0.008]];
    case 'volcanic':
      return [['rock', 0.05], ['ore_coal', 0.05], ['ore_sulfur', 0.04], ['crystal', 0.012], ['ore_gold', 0.01]];
    case 'ruins':
      return tile === 'brick' ? [['ruin_chest', 0.006], ['rock', 0.02]] : [['tree', 0.05], ['rock', 0.04], ['ore_iron', 0.015], ['bush', 0.02], ['grass', 0.05]];
    case 'forest':
      return tile === 'forest' ? [['tree', 0.26], ['bush', 0.03], ['grass', 0.05], ['rock', 0.02], ['herb', 0.006]] : [['tree', 0.07], ['bush', 0.04], ['grass', 0.07], ['rock', 0.03], ['ore_coal', 0.006], ['flower', 0.01]];
    case 'swamp':
      return tile === 'forest' ? [['tree', 0.2], ['bush', 0.03], ['grass', 0.06], ['wild_crop', 0.02]] : [['tree', 0.05], ['grass', 0.1], ['bush', 0.03], ['wild_crop', 0.025], ['shroom', 0.006], ['rock', 0.008], ['herb', 0.012]];
    case 'mushroom':
      return tile === 'stone' ? [['rock', 0.05], ['crystal', 0.012], ['ore_iron', 0.02]] : tile === 'forest' ? [['tree', 0.22], ['shroom', 0.05], ['grass', 0.03]] : [['tree', 0.07], ['shroom', 0.04], ['bush', 0.02], ['grass', 0.04], ['rock', 0.015]];
    case 'crystal':
      return tile === 'stone' ? [['crystal', 0.06], ['rock', 0.04], ['ore_iron', 0.02], ['ore_gold', 0.008]] : [['crystal', 0.025], ['rock', 0.03], ['tree', 0.015], ['grass', 0.02]];
    case 'bamboo':
      return tile === 'forest' ? [['bamboo', 0.3], ['tree', 0.04], ['grass', 0.04]] : [['bamboo', 0.08], ['tree', 0.05], ['bush', 0.04], ['grass', 0.07], ['wild_crop', 0.012], ['rock', 0.015], ['flower', 0.02], ['herb', 0.008]];
    case 'savanna':
      return tile === 'stone' ? [['rock', 0.07], ['ore_gold', 0.012], ['ore_iron', 0.02]] : [['tree', 0.018], ['grass', 0.12], ['bush', 0.015], ['rock', 0.01], ['wild_crop', 0.008]];
    case 'glacier':
      return tile === 'stone' ? [['rock', 0.05], ['ore_iron', 0.04], ['crystal', 0.02], ['ice', 0.03]] : [['tree', 0.03], ['rock', 0.02], ['crystal', 0.004], ['ice', 0.03]];
    case 'atoll':
      return [['tree', 0.05], ['grass', 0.04], ['bush', 0.02], ['rock', 0.008], ['clam', 0.012]];
    case 'haunted':
      return tile === 'brick' ? [['ruin_chest', 0.009], ['rock', 0.02]] : tile === 'forest' ? [['tree', 0.16], ['shroom', 0.01], ['grass', 0.03]] : [['tree', 0.05], ['rock', 0.03], ['grass', 0.04], ['ore_coal', 0.008]];
    case 'central':
    case 'dungeon':
      return [];
    case 'special':
      return tile === 'stone' ? [['ore_gold', 0.06], ['crystal', 0.035], ['meteor_rock', 0.02], ['ore_iron', 0.04], ['ore_sulfur', 0.02]]
        : tile === 'brick' ? [['ruin_chest', 0.025], ['rock', 0.02]]
        : [['tree', 0.05], ['bush', 0.05], ['wild_crop', 0.03], ['rock', 0.03], ['ore_gold', 0.008], ['grass', 0.03]];
    default: // home
      return tile === 'forest' ? [['tree', 0.22], ['bush', 0.03], ['grass', 0.05], ['rock', 0.02]] : [['tree', 0.04], ['bush', 0.035], ['grass', 0.08], ['wild_crop', 0.004], ['rock', 0.03], ['ore_coal', 0.004]];
  }
}

/**
 * โลกเป็นตาราง "ช่องเกาะ" (slot) — แต่ละผู้เล่นได้ 1 ช่อง
 * ออนไลน์: เซิร์ฟเวอร์แจก slot ให้ผู้เล่นใหม่ ยิ่งคนเยอะตารางยิ่งขยาย
 * ออฟไลน์ (ตอนนี้): ช่องอื่นเป็นเกาะป่าสุ่มแทนเกาะของผู้เล่นคนอื่น
 */
export const SLOT_SIZE = 144;
export const GRID = 11;
/** +1 แถว/คอลัมน์ สำหรับแมพย่อย (ดันเจี้ยน/เมือง) ใต้ตารางเกาะ */
export const WORLD_SIZE = SLOT_SIZE * (GRID + 1);

/** แร่ประจำเกาะ (แต่ละเกาะมีแร่เด่นไม่เหมือนกัน → ต้องแลกเปลี่ยนกันที่เกาะกลาง) */
export type Specialty = 'iron' | 'coal' | 'sulfur' | 'gold' | 'crystal';
export const SPECIALTY_NAMES: Record<Specialty, string> = { iron: 'เหล็ก', coal: 'ถ่านหิน', sulfur: 'กำมะถัน', gold: 'ทอง', crystal: 'คริสตัล' };
