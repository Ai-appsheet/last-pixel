import type { Station } from './recipes';
import type { Stats } from './equipment';
import { TILE } from '../world/tiles';
import { HOOF_TERRAIN, OFFROAD_TERRAIN, WHEEL_TERRAIN, type VehicleSpec } from './vehicles';

export type BuildCategory = 'terrain' | 'structure' | 'building' | 'furniture' | 'machine' | 'defense' | 'farm' | 'boat';

export const CATEGORY_NAMES: Record<BuildCategory, string> = {
  terrain: 'ภูมิทัศน์',
  structure: 'กำแพง/พื้น',
  building: 'อาคาร',
  furniture: 'เฟอร์นิเจอร์',
  machine: 'เครื่องจักร',
  defense: 'ป้องกัน',
  farm: 'ฟาร์ม',
  boat: 'ยานพาหนะ',
};

/**
 * ชั้นของสิ่งก่อสร้าง (1 tile วางซ้อนได้หลายชั้น — ออกแบบเกาะได้หลายมิติ)
 *   terrain: เปลี่ยนชนิดพื้นดินถาวร (ปูทาง ขุดบ่อ ถมทะเล)
 *   floor:   พื้นราบ (เดินทับได้) วางใต้วัตถุอื่น
 *   object:  วัตถุตั้งพื้น (กำแพง เฟอร์นิเจอร์ เครื่องจักร อาคาร)
 *   boat:    ยานพาหนะ (เรือวางบนน้ำ · ยานบกวางบนบก · ยานบินวางได้ทั้งสองแบบ) + ท่าเรือ
 */
export type BuildLayer = 'terrain' | 'floor' | 'object' | 'boat';

/**
 * สูตรผลิตอัตโนมัติ: in = วัตถุดิบที่ต้องมีในช่องเก็บของ (ไม่ใส่ = ผลิตเองฟรี เช่น รังผึ้ง)
 * out = [ไอเทม, จำนวน, โอกาส/น้ำหนัก] — pick = สุ่มเลือก 1 อย่างตามน้ำหนัก, ไม่งั้นได้ทุกอย่างตามโอกาส (ค่าเริ่ม 1)
 */
export interface ProdRecipe {
  in?: [string, number][];
  out: [string, number, number?][];
  pick?: boolean;
}

/** ผลิตทุก every วินาที (ใช้สูตรแรกที่วัตถุดิบครบ) · power = ต้องมีไฟฟ้า */
export interface ProdDef {
  every: number;
  recipes: ProdRecipe[];
  power?: boolean;
  label: string;
}

export interface BuildDef {
  id: string;
  name: string;
  desc: string;
  category: BuildCategory;
  layer: BuildLayer;
  texture: string;
  frame?: number;
  anim?: string;
  cost: [string, number][];
  /** ขนาดฐาน (tile) */
  w: number;
  h: number;
  hp: number;
  /** all = ขวางทุกอย่าง, mobs = ขวางเฉพาะศัตรู (ประตู), none = เดินผ่านได้ */
  blocks: 'all' | 'mobs' | 'none';
  /** ภูมิทัศน์: เปลี่ยนเป็นพื้นชนิดนี้ (fill = ถมทะเลทีละขั้น) */
  terrain?: number | 'fill';
  /** วางนอกเกาะของตัวเองได้ */
  anywhere?: boolean;
  station?: Station;
  light?: number;
  warmth?: number;
  storage?: number;
  sleep?: boolean;
  /** ระบบไฟฟ้า: gen = เครื่องปั่นไฟ (ใช้เชื้อเพลิง), wind = กังหัน, use = ต้องใช้ไฟ */
  power?: 'gen' | 'wind' | 'use';
  turret?: {
    range: number; damage: number; cooldown: number; projectile: string; splash?: number;
    /** ทะลุศัตรูหลายตัว */
    pierce?: boolean;
    /** ติดไฟกี่วินาที */
    burn?: number;
    /** สายฟ้ากระโดดต่อกี่ตัว (ยิงทันที ไม่มีกระสุน) */
    chain?: number;
    /** ยิงโค้ง (ปืนครก) — ข้ามกำแพง ตกระเบิดที่เป้า */
    lob?: boolean;
    /** ระยะใกล้สุดที่ยิงได้ */
    minRange?: number;
    /** ความเร็วกระสุน / อายุกระสุน (วิ) */
    speed?: number;
    life?: number;
  };
  crop?: boolean;
  sprinkler?: boolean;
  miner?: boolean;
  trap?: boolean;
  /** ชนิดกับดัก (ไม่ใส่ = หนาม): bomb = ระเบิดครั้งเดียว, frost = ทำให้ช้า, snare = หนีบแรง */
  trapKind?: 'spike' | 'bomb' | 'frost' | 'snare';
  /** สถานีคราฟต์เพิ่มเติมในตัวเดียว (เช่น โต๊ะช่างขั้นสูง = โต๊ะช่าง+ทั่ง+เตาหลอม) */
  stations?: Station[];
  /** ผลิตอัตโนมัติลงช่องเก็บของของตัวเอง (กด E เปิดเก็บผลผลิต/ใส่วัตถุดิบ) */
  prod?: ProdDef;
  /** anim ตอนกำลังทำงาน (ผลิตอยู่ / มีไฟ) */
  workAnim?: string;
  /** ดื่มน้ำได้ที่นี่: well = ไม่จำกัด, rain = เก็บน้ำฝน (จำกัดจำนวนครั้ง) */
  water?: 'well' | 'rain';
  /** พืชในรัศมี r px โตเร็วขึ้น ×mult (ไม่ซ้อนกัน ใช้ค่าสูงสุด) */
  growAura?: { mult: number; r: number };
  /** ฟื้นสติ/วินาที เมื่อยืนใกล้ (ของตกแต่ง — รวมกันมีเพดาน) */
  comfort?: number;
  /** ระฆังเตือนภัยเมื่อศัตรูเข้าใกล้ฐาน */
  alarm?: boolean;
  /** คลังอัตโนมัติ: ดูดผลผลิตจากอาคารผลิตในรัศมี (tile) เข้าตัวเอง */
  collect?: number;
  dock?: boolean;
  boat?: VehicleSpec;
  /** วัสดุโครงสร้าง (ทนภัย: ไม้ > หิน > เหล็ก) — ไม่ใส่ = ดูจากวัตถุดิบดิบ (ดู systems/ShelterSystem.ts materialOf) */
  material?: 'wood' | 'stone' | 'metal';
  /** ลำดับปลดล็อก (แสดงในเมนู) */
  tier: number;
  /** บัฟถาวรให้ผู้เล่น (ฐานยิ่งครบยิ่งเก่ง) · buffMax = นับสูงสุดกี่หลัง */
  buff?: Partial<Stats>;
  buffMax?: number;
}

/** บัฟจากฐาน: ใส่แยกไว้ตรงนี้ให้ปรับสมดุลง่าย */
const BUFFS: Record<string, { buff: Partial<Stats>; max: number }> = {
  cabin: { buff: { hp: 10 }, max: 2 },
  stone_house: { buff: { hp: 20, def: 1 }, max: 2 },
  warehouse: { buff: { bag: 4 }, max: 1 },
  watchtower: { buff: { crit: 2 }, max: 2 },
  lighthouse: { buff: { light: 24, luck: 3 }, max: 1 },
  bed: { buff: { regen: 0.15 }, max: 2 },
  bookshelf: { buff: { luck: 2 }, max: 3 },
  banner_flag: { buff: { atk: 2 }, max: 5 },
  statue: { buff: { luck: 5, atk: 3 }, max: 1 },
  flower_pot: { buff: { stamina: 2 }, max: 5 },
  campfire: { buff: { stamina: 10 }, max: 1 },
  workbench: { buff: { gather: 5 }, max: 1 },
  furnace: { buff: { cold: 0.05 }, max: 1 },
  anvil: { buff: { atk: 3 }, max: 1 },
  mech_bench: { buff: { speed: 3 }, max: 1 },
  windmill: { buff: { speed: 2 }, max: 1 },
  farm_plot: { buff: { regen: 0.01 }, max: 20 },
};

const B = (d: Omit<BuildDef, 'w' | 'h' | 'hp' | 'blocks' | 'tier'> & Partial<Pick<BuildDef, 'w' | 'h' | 'hp' | 'blocks' | 'tier'>>): BuildDef => ({
  w: 1, h: 1, hp: 80, blocks: 'all', tier: 1, ...d,
});

export const BUILDABLES: BuildDef[] = [
  // ---------- ภูมิทัศน์ ----------
  B({ id: 't_path', name: 'ทางเดินดิน', desc: 'ปูทางเดิน', category: 'terrain', layer: 'terrain', texture: 'tile_dirt', terrain: TILE.DIRT, cost: [['stone', 1]], blocks: 'none' }),
  B({ id: 't_cobble', name: 'ลานหิน', desc: 'พื้นหินแข็งแรง', category: 'terrain', layer: 'terrain', texture: 'tile_stone', terrain: TILE.STONE, cost: [['stone', 2]], blocks: 'none' }),
  B({ id: 't_brick', name: 'ลานอิฐ', desc: 'ลานอิฐสวยงาม', category: 'terrain', layer: 'terrain', texture: 'tile_brick', terrain: TILE.BRICK, cost: [['stone', 3]], blocks: 'none' }),
  B({ id: 't_grass', name: 'ปลูกหญ้า', desc: 'เปลี่ยนเป็นสนามหญ้า', category: 'terrain', layer: 'terrain', texture: 'tile_grass', terrain: TILE.GRASS, cost: [['fiber', 1]], blocks: 'none' }),
  B({ id: 't_sand', name: 'ลานทราย', desc: 'โรยทราย', category: 'terrain', layer: 'terrain', texture: 'tile_sand', terrain: TILE.SAND, cost: [['stone', 1]], blocks: 'none' }),
  B({ id: 't_pond', name: 'ขุดบ่อน้ำ', desc: 'บ่อน้ำตื้น ดื่มได้ ตกปลาได้', category: 'terrain', layer: 'terrain', texture: 'tile_shallow', terrain: TILE.SHALLOW, cost: [], blocks: 'none' }),
  B({ id: 't_fill', name: 'ถมทะเล', desc: 'ขยายเกาะ: น้ำลึก→น้ำตื้น→ทราย', category: 'terrain', layer: 'terrain', texture: 'tile_sand', terrain: 'fill', cost: [['stone', 4]], blocks: 'none', tier: 2 }),

  // ---------- กำแพง / พื้น ----------
  B({ id: 'wood_wall', name: 'รั้วไม้', desc: 'กำแพงพื้นฐาน', category: 'structure', layer: 'object', texture: 'wood_wall', cost: [['wood', 4]], hp: 120, anywhere: true }),
  B({ id: 'stone_wall', name: 'กำแพงหิน', desc: 'แข็งแรง', category: 'structure', layer: 'object', texture: 'stone_wall', cost: [['stone', 6]], hp: 360, anywhere: true }), // สมดุล: 300 → 360 (เดิมแพ้กำแพงอิฐที่ราคาเท่ากัน 40%)
  B({ id: 'wall_iron', name: 'กำแพงเหล็ก', desc: 'แข็งแรงที่สุด', category: 'structure', layer: 'object', texture: 'wall_iron', cost: [['iron_ingot', 2], ['stone', 2]], hp: 650, tier: 3 }),
  B({ id: 'door_wood', name: 'ประตูไม้', desc: 'ผู้เล่นเดินผ่านได้ ศัตรูผ่านไม่ได้', category: 'structure', layer: 'object', texture: 'door_wood', frame: 0, cost: [['wood', 6]], hp: 150, blocks: 'mobs' }),
  B({ id: 'door_iron', name: 'ประตูเหล็ก', desc: 'ประตูกันมอนสเตอร์', category: 'structure', layer: 'object', texture: 'door_iron', frame: 0, cost: [['iron_ingot', 3]], hp: 500, blocks: 'mobs', tier: 3 }),
  B({ id: 'fence_wood', name: 'รั้วเตี้ย', desc: 'กั้นเขตฟาร์ม', category: 'structure', layer: 'object', texture: 'fence_wood', cost: [['wood', 2]], hp: 60 }),
  B({ id: 'floor_wood', name: 'พื้นไม้', desc: 'พื้นบ้าน', category: 'structure', layer: 'floor', texture: 'floor_wood', cost: [['wood', 2]], blocks: 'none' }),
  B({ id: 'floor_stone', name: 'พื้นหินขัด', desc: 'พื้นบ้าน', category: 'structure', layer: 'floor', texture: 'floor_stone', cost: [['stone', 2]], blocks: 'none' }),
  B({ id: 'floor_carpet', name: 'พรม', desc: 'พื้นพรมแดง', category: 'structure', layer: 'floor', texture: 'floor_carpet', cost: [['fiber', 4], ['hide', 1]], blocks: 'none' }),
  B({ id: 'floor_tile', name: 'พื้นกระเบื้อง', desc: 'ครัว/ห้องน้ำ', category: 'structure', layer: 'floor', texture: 'floor_tile', cost: [['stone', 3]], blocks: 'none' }),

  // ---------- อาคาร ----------
  B({ id: 'cabin', name: 'กระท่อมไม้', desc: 'จุดเกิดใหม่ + นอน + เก็บของ 20 ช่อง', category: 'building', layer: 'object', texture: 'cabin', cost: [['wood', 40], ['stone', 10]], w: 3, h: 2, hp: 400, sleep: true, storage: 20, warmth: 20 }),
  B({ id: 'stone_house', name: 'บ้านหิน', desc: 'จุดเกิด + นอน + เก็บของ 34 ช่อง อบอุ่น แข็งแรงมาก', category: 'building', layer: 'object', texture: 'stone_house', cost: [['stone', 60], ['wood', 20], ['iron_ingot', 4]], w: 3, h: 2, hp: 1500, sleep: true, storage: 34, warmth: 30, tier: 3 }),
  B({ id: 'warehouse', name: 'โกดัง', desc: 'เก็บของ 60 ช่อง', category: 'building', layer: 'object', texture: 'warehouse', cost: [['wood', 50], ['iron_ingot', 6]], w: 4, h: 2, hp: 700, storage: 60, tier: 3 }),
  B({ id: 'watchtower', name: 'หอสังเกตการณ์', desc: 'ยิงธนูใส่ศัตรูอัตโนมัติ ระยะไกล', category: 'building', layer: 'object', texture: 'watchtower', cost: [['wood', 30], ['rope', 6]], w: 2, h: 2, hp: 450, turret: { range: 150, damage: 12, cooldown: 1.2, projectile: 'arrow' }, tier: 2 }),
  B({ id: 'lighthouse', name: 'ประภาคาร', desc: 'ส่องสว่างไกล เรือพ่อค้ามาบ่อยขึ้น', category: 'building', layer: 'object', texture: 'lighthouse', cost: [['stone', 40], ['iron_ingot', 6], ['crystal', 1]], w: 2, h: 2, hp: 800, light: 170, tier: 4 }),
  B({ id: 'dock', name: 'ท่าเรือ', desc: 'วางบนน้ำตื้นริมฝั่ง — จุดจอดเรือ · เรือที่จอดใกล้ท่าซ่อมตัวเองช้าๆ', category: 'boat', layer: 'boat', texture: 'dock', cost: [['wood', 16]], w: 2, h: 2, hp: 300, blocks: 'none', dock: true, tier: 2 }),

  // ---------- เฟอร์นิเจอร์ ----------
  B({ id: 'bed', name: 'เตียง', desc: 'นอนข้ามคืน + จุดเกิดใหม่', category: 'furniture', layer: 'object', texture: 'bed', cost: [['wood', 8], ['fiber', 10], ['hide', 2]], sleep: true }),
  B({ id: 'chest', name: 'หีบเก็บของ', desc: 'เก็บของ 20 ช่อง', category: 'furniture', layer: 'object', texture: 'chest', frame: 0, cost: [['wood', 8]], storage: 20 }),
  B({ id: 'barrel', name: 'ถังไม้', desc: 'เก็บของ 10 ช่อง', category: 'furniture', layer: 'object', texture: 'barrel', cost: [['wood', 4]], storage: 10 }),
  B({ id: 'crate_box', name: 'ลังไม้', desc: 'เก็บของ 8 ช่อง', category: 'furniture', layer: 'object', texture: 'crate_box', cost: [['wood', 3]], storage: 8 }),
  B({ id: 'table', name: 'โต๊ะ', desc: 'ตกแต่ง', category: 'furniture', layer: 'object', texture: 'table', cost: [['wood', 4]] }),
  B({ id: 'chair', name: 'เก้าอี้', desc: 'ตกแต่ง', category: 'furniture', layer: 'object', texture: 'chair', cost: [['wood', 3]], blocks: 'none' }),
  B({ id: 'bookshelf', name: 'ชั้นหนังสือ', desc: 'ตกแต่ง +สติเมื่ออยู่ใกล้', category: 'furniture', layer: 'object', texture: 'bookshelf', cost: [['wood', 6]] }),
  B({ id: 'lamp', name: 'ตะเกียง', desc: 'ให้แสงสว่าง', category: 'furniture', layer: 'object', texture: 'lamp', cost: [['iron_ingot', 1], ['wood', 2]], light: 70 }),
  B({ id: 'flower_pot', name: 'กระถางดอกไม้', desc: 'ตกแต่ง', category: 'furniture', layer: 'object', texture: 'flower_pot', cost: [['stone', 2], ['fiber', 1]], blocks: 'none' }),
  B({ id: 'rug', name: 'พรมลาย', desc: 'ตกแต่งพื้น', category: 'furniture', layer: 'floor', texture: 'rug', cost: [['fiber', 6]], w: 2, h: 1, blocks: 'none' }),
  B({ id: 'banner_flag', name: 'ธงประจำเกาะ', desc: 'ตกแต่ง', category: 'furniture', layer: 'object', texture: 'banner_flag', cost: [['wood', 2], ['fiber', 4]], blocks: 'none' }),
  B({ id: 'statue', name: 'รูปปั้นวีรบุรุษ', desc: 'ตกแต่งสุดหรู', category: 'furniture', layer: 'object', texture: 'statue', cost: [['stone', 20]], tier: 2 }),

  // ---------- เครื่องจักร / สถานีคราฟต์ ----------
  B({ id: 'campfire', name: 'กองไฟ', desc: 'แสง ความอบอุ่น ทำอาหาร', category: 'machine', layer: 'object', texture: 'campfire', frame: 0, anim: 'campfire_burn', cost: [['wood', 5], ['stone', 3]], hp: 60, station: 'campfire', light: 84, warmth: 30, anywhere: true }),
  B({ id: 'workbench', name: 'โต๊ะช่าง', desc: 'สถานีคราฟต์', category: 'machine', layer: 'object', texture: 'workbench', cost: [['wood', 10], ['stone', 4]], station: 'workbench' }),
  B({ id: 'furnace', name: 'เตาหลอม', desc: 'หลอมแร่', category: 'machine', layer: 'object', texture: 'furnace', frame: 1, cost: [['stone', 12], ['wood', 4]], hp: 160, station: 'furnace', light: 40, warmth: 20 }),
  B({ id: 'anvil', name: 'ทั่งตีเหล็ก', desc: 'ตีอาวุธ/เครื่องมือเหล็ก', category: 'machine', layer: 'object', texture: 'anvil', cost: [['iron_ingot', 6], ['stone', 4]], hp: 300, station: 'anvil', tier: 2 }),
  B({ id: 'mech_bench', name: 'โต๊ะช่างกล', desc: 'เครื่องยนต์ ปืน ระเบิด ไม้เท้าเวท', category: 'machine', layer: 'object', texture: 'mech_bench', cost: [['iron_ingot', 8], ['gear', 4], ['wood', 10]], hp: 300, station: 'mech_bench', w: 2, h: 1, tier: 3 }),
  B({ id: 'generator', name: 'เครื่องปั่นไฟ', desc: 'ใช้ถ่าน/น้ำมัน จ่ายไฟรัศมี 8 ช่อง', category: 'machine', layer: 'object', texture: 'generator', frame: 0, cost: [['iron_ingot', 10], ['gear', 3]], hp: 250, power: 'gen', tier: 3 }),
  B({ id: 'windmill', name: 'กังหันลม', desc: 'จ่ายไฟฟรีรัศมี 6 ช่อง', category: 'machine', layer: 'object', texture: 'windmill', frame: 0, anim: 'windmill_spin', cost: [['wood', 30], ['gear', 4], ['fiber', 10]], hp: 250, power: 'wind', w: 2, h: 1, tier: 3 }),
  B({ id: 'auto_miner', name: 'เครื่องขุดแร่', desc: 'ต้องใช้ไฟ — ขุดหิน/ถ่าน/เหล็กให้อัตโนมัติ', category: 'machine', layer: 'object', texture: 'auto_miner', frame: 0, cost: [['iron_ingot', 12], ['gear', 6]], hp: 300, power: 'use', miner: true, storage: 12, tier: 4 }),
  B({ id: 'lamp_post', name: 'เสาไฟฟ้า', desc: 'ต้องใช้ไฟ — ส่องสว่างกว้าง', category: 'machine', layer: 'object', texture: 'lamp_post', cost: [['iron_ingot', 3], ['gear', 1]], power: 'use', light: 110, tier: 3 }),

  // ---------- ป้องกัน ----------
  B({ id: 'spike_trap', name: 'กับดักหนาม', desc: 'ทำดาเมจศัตรูที่เหยียบ', category: 'defense', layer: 'object', texture: 'spike_trap', cost: [['wood', 3], ['stone', 2]], hp: 60, blocks: 'none', trap: true, anywhere: true }),
  B({ id: 'turret_arrow', name: 'ป้อมธนู', desc: 'ยิงศัตรูอัตโนมัติ', category: 'defense', layer: 'object', texture: 'turret_arrow', cost: [['wood', 10], ['rope', 4], ['iron_ingot', 2]], hp: 250, turret: { range: 120, damage: 14, cooldown: 0.9, projectile: 'arrow' }, tier: 2 }),
  B({ id: 'turret_cannon', name: 'ป้อมปืนใหญ่', desc: 'ต้องใช้ไฟ — ยิงระเบิดวงกว้าง', category: 'defense', layer: 'object', texture: 'turret_cannon', cost: [['iron_ingot', 12], ['gear', 4], ['gunpowder', 4]], hp: 450, power: 'use', turret: { range: 150, damage: 40, cooldown: 2.2, projectile: 'cannonball', splash: 28 }, tier: 4 }),

  // ---------- ฟาร์ม ----------
  B({ id: 'farm_plot', name: 'แปลงผัก', desc: 'ปลูกเมล็ด (กด E)', category: 'farm', layer: 'object', texture: 'farm_plot', cost: [['wood', 2], ['fiber', 3]], hp: 40, blocks: 'none', crop: true }),
  B({ id: 'sprinkler', name: 'เครื่องรดน้ำ', desc: 'ต้องใช้ไฟ — พืชรอบ 2 ช่องโตเร็ว ×2', category: 'farm', layer: 'object', texture: 'sprinkler', frame: 0, cost: [['iron_ingot', 2], ['gear', 1]], power: 'use', sprinkler: true, blocks: 'none', tier: 3 }),

  // ---------- ยานพาหนะ: ทางน้ำ ----------
  B({ id: 'raft', name: 'แพไม้', desc: 'ข้ามทะเลได้ช้าๆ ไม่ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'raft', cost: [['wood', 20], ['rope', 6]], hp: 100, blocks: 'none', boat: { speed: 70, hp: 100, vertical: 'raft_v', accel: 160, icon: '🪵' } }),
  B({ id: 'canoe', name: 'เรือแคนู', desc: 'เบา ออกตัวไว เลี้ยวคล่อง ไม่ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'canoe', cost: [['wood', 16], ['fiber', 8], ['rope', 2]], hp: 50, blocks: 'none', boat: { speed: 122, hp: 50, vertical: 'canoe_v', accel: 520, icon: '🛶', special: 'Shift = จ้วงพายเร็ว (ใช้แรง)' } }),
  B({ id: 'fishing_boat', name: 'เรือประมง', desc: 'มีอวนในตัว — ตกปลากลางทะเลได้เร็ว ได้ของแถม', category: 'boat', layer: 'boat', texture: 'fishing_boat', cost: [['wood', 34], ['rope', 12], ['fiber', 16]], hp: 140, blocks: 'none', boat: { speed: 95, hp: 140, vertical: 'fishing_boat_v', fishing: 2.2, icon: '🎣', special: 'กด E/Space กลางทะเล = ตกปลา (เร็ว ×2 · ได้ปลาแถม · ไม่ต้องมีเบ็ด)' }, tier: 2 }),
  B({ id: 'sailboat', name: 'เรือใบ', desc: 'เร็วขึ้น ทนทานกว่า — ลมแรงตอนฝนตกยิ่งเร็ว', category: 'boat', layer: 'boat', texture: 'sailboat', cost: [['wood', 40], ['rope', 10], ['fiber', 20]], hp: 140, blocks: 'none', boat: { speed: 110, hp: 140, vertical: 'sailboat_v', sail: true, accel: 140, icon: '⛵', special: 'ฝนตก/พายุ = ลมส่ง เร็ว +30%' }, tier: 2 }),
  B({ id: 'cargo_ship', name: 'เรือขนส่ง', desc: 'ลำใหญ่ ทนทาน มีห้องเก็บของ 36 ช่อง', category: 'boat', layer: 'boat', texture: 'cargo_ship', cost: [['wood', 60], ['iron_ingot', 10], ['rope', 16]], hp: 380, blocks: 'none', boat: { speed: 92, hp: 380, vertical: 'cargo_ship_v', cargo: 36, accel: 90, icon: '🚢', special: 'Space (หรือ E กลางทะเล) = เปิดห้องเก็บของ 36 ช่อง' }, tier: 3 }),
  B({ id: 'jetski', name: 'เจ็ตสกี', desc: 'เล็ก เร็ว คล่องตัวสุดๆ ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'jetski', cost: [['iron_ingot', 8], ['engine', 1], ['gear', 2]], hp: 90, blocks: 'none', boat: { speed: 205, hp: 90, fuel: true, vertical: 'jetski_v', accel: 600, icon: '🛥', special: 'ออกตัวแรง เลี้ยวไวที่สุด' }, tier: 3 }),
  B({ id: 'motorboat', name: 'เรือยนต์', desc: 'เร็วมาก ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'motorboat', cost: [['iron_ingot', 15], ['engine', 1], ['wood', 10]], hp: 260, blocks: 'none', boat: { speed: 175, hp: 260, fuel: true, vertical: 'motorboat_v', accel: 300, icon: '🚤' }, tier: 4 }),
  B({ id: 'speedboat', name: 'เรือเร็ว', desc: 'เร็วที่สุดในทะเล แต่กินน้ำมันมหาศาล', category: 'boat', layer: 'boat', texture: 'speedboat', cost: [['iron_ingot', 20], ['engine', 2], ['gear', 6]], hp: 200, blocks: 'none', boat: { speed: 255, hp: 200, fuel: true, fuelUse: 2.5, vertical: 'speedboat_v', accel: 260, icon: '🚤', special: 'เร็วสุดในทะเล · กินน้ำมัน ×2.5' }, tier: 4 }),
  B({ id: 'warship', name: 'เรือรบ', desc: 'หุ้มเกราะ ติดปืนใหญ่ — คลิกยิงสัตว์ทะเล', category: 'boat', layer: 'boat', texture: 'warship', cost: [['iron_ingot', 30], ['wood', 40], ['gunpowder', 10], ['gear', 6]], hp: 600, blocks: 'none', boat: { speed: 112, hp: 600, vertical: 'warship_v', armor: 0.4, accel: 110, gun: { damage: 46, cooldown: 1.4, speed: 260, projectile: 'cannonball', splash: 30, shots: 2 }, icon: '⚓', special: 'คลิก/ปุ่มโจมตี = ยิงปืนใหญ่คู่ (ระเบิดวงกว้าง) · เกราะรับดาเมจแทน 40%' }, tier: 4 }),
  B({ id: 'submarine', name: 'เรือดำน้ำ', desc: 'ดำใต้น้ำ งูทะเลทำอะไรไม่ได้ แต่ช้า', category: 'boat', layer: 'boat', texture: 'submarine', cost: [['iron_ingot', 36], ['engine', 2], ['crystal', 2], ['gear', 8]], hp: 320, blocks: 'none', boat: { speed: 88, hp: 320, fuel: true, fuelUse: 0.6, vertical: 'submarine_v', immune: true, armor: 0.6, accel: 120, icon: '🫧', special: 'ไม่โดนสัตว์ทะเลโจมตี · ประหยัดน้ำมัน' }, tier: 5 }),

  // ---------- ยานพาหนะ: ทางบก ----------
  B({ id: 'cart', name: 'เกวียนลาก', desc: 'ขนของบนเกาะ — มีกระบะเก็บของ 20 ช่อง', category: 'boat', layer: 'boat', texture: 'cart', cost: [['wood', 24], ['rope', 4]], hp: 150, blocks: 'none', boat: { kind: 'land', speed: 72, hp: 150, vertical: 'cart_v', down: 'cart_d', cargo: 20, accel: 200, terrain: WHEEL_TERRAIN, icon: '🛒', special: 'Space = เปิดกระบะเก็บของ 20 ช่อง' } }),
  B({ id: 'bicycle', name: 'จักรยาน', desc: 'ปั่นเร็วกว่าเดิน ไม่ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'bicycle', cost: [['iron_ingot', 4], ['rope', 4], ['hide', 2]], hp: 50, blocks: 'none', boat: { kind: 'land', speed: 118, hp: 50, vertical: 'bicycle_v', down: 'bicycle_d', accel: 380, terrain: { ...WHEEL_TERRAIN, [TILE.SAND]: 0.6, [TILE.SNOW]: 0.55 }, icon: '🚲', special: 'ถนน/ลานหินเร็ว +20% · Shift = ปั่นสุดแรง (ใช้แรง)' }, tier: 2 }),
  B({ id: 'horse', name: 'ม้า', desc: 'สัตว์พาหนะ — เร็วบนทุ่งหญ้า ต้องให้อาหาร', category: 'boat', layer: 'boat', texture: 'horse', cost: [['hide', 6], ['rope', 6], ['carrot', 6], ['fiber', 20]], hp: 120, blocks: 'none', boat: { kind: 'land', speed: 145, hp: 120, vertical: 'horse_v', down: 'horse_d', accel: 340, energy: { drain: 1.2, regen: 6, food: [['carrot', 45], ['berry', 15], ['pumpkin', 70], ['tomato', 25]] }, terrain: HOOF_TERRAIN, icon: '🐎', special: 'ทุ่งหญ้า +25% · มีแรงม้า (กินแครอท/เบอร์รี่ในกระเป๋าอัตโนมัติ)' }, tier: 2 }),
  B({ id: 'atv', name: 'รถ ATV', desc: 'รถสี่ล้อวิบาก ลุยทราย/หิมะได้ ใช้น้ำมัน', category: 'boat', layer: 'boat', texture: 'atv', cost: [['iron_ingot', 12], ['engine', 1], ['gear', 3], ['hide', 2]], hp: 170, blocks: 'none', boat: { kind: 'land', speed: 160, hp: 170, fuel: true, vertical: 'atv_v', down: 'atv_d', accel: 330, armor: 0.2, terrain: OFFROAD_TERRAIN, icon: '🏍', special: 'ลุยทราย/หิมะไม่ช้าลง' }, tier: 3 }),
  B({ id: 'motorbike', name: 'มอเตอร์ไซค์', desc: 'เร็วจัดบนถนน ใช้น้ำมันน้อย', category: 'boat', layer: 'boat', texture: 'motorbike', cost: [['iron_ingot', 14], ['engine', 1], ['gear', 4]], hp: 110, blocks: 'none', boat: { kind: 'land', speed: 215, hp: 110, fuel: true, fuelUse: 0.8, vertical: 'motorbike_v', down: 'motorbike_d', accel: 420, terrain: WHEEL_TERRAIN, icon: '🏍', special: 'เร็วสุดบนบก · ถนน +20%' }, tier: 4 }),
  B({ id: 'jeep', name: 'รถจี๊ป', desc: 'รถลุยป่า หุ้มเกราะ มีท้ายเก็บของ 12 ช่อง', category: 'boat', layer: 'boat', texture: 'jeep', cost: [['iron_ingot', 24], ['engine', 1], ['gear', 6], ['hide', 4]], hp: 340, blocks: 'none', boat: { kind: 'land', speed: 185, hp: 340, fuel: true, vertical: 'jeep_v', down: 'jeep_d', accel: 260, armor: 0.5, cargo: 12, terrain: OFFROAD_TERRAIN, icon: '🚙', special: 'เกราะรับดาเมจแทน 50% · Space = ท้ายรถ 12 ช่อง' }, tier: 4 }),
  B({ id: 'tank', name: 'รถถังเล็ก', desc: 'ช้าแต่อึดสุดๆ ติดปืนใหญ่', category: 'boat', layer: 'boat', texture: 'tank', cost: [['iron_ingot', 45], ['engine', 2], ['gear', 10], ['gunpowder', 12]], hp: 900, blocks: 'none', boat: { kind: 'land', speed: 78, hp: 900, fuel: true, fuelUse: 0.7, vertical: 'tank_v', down: 'tank_d', accel: 120, armor: 0.85, gun: { damage: 70, cooldown: 1.8, speed: 240, projectile: 'cannonball', splash: 36 }, icon: '🛡', special: 'คลิก = ยิงปืนใหญ่ (ระเบิด) · เกราะรับดาเมจแทน 85% · สายพานไม่ช้าบนทราย/หิมะ' }, tier: 5 }),

  // ---------- ยานพาหนะ: ทางอากาศ ----------
  B({ id: 'glider', name: 'เครื่องร่อน', desc: 'บินข้ามเกาะ/ทะเลได้ ไม่ใช้น้ำมัน แต่ร่อนได้จำกัด', category: 'boat', layer: 'boat', texture: 'glider', cost: [['wood', 20], ['fiber', 30], ['rope', 10], ['bat_wing', 4]], hp: 50, blocks: 'none', boat: { kind: 'air', speed: 132, hp: 50, vertical: 'glider_v', down: 'glider_d', accel: 160, immune: true, lift: 16, energy: { drain: 2.2, regen: 10 }, icon: '🪂', special: 'บินข้ามทุกพื้น · แรงลอยหมด = ร่อนช้าลง (จอดพักบนบกเพื่อฟื้น)' }, tier: 3 }),
  B({ id: 'balloon', name: 'บอลลูนลมร้อน', desc: 'ลอยช้าๆ ข้ามทุกอย่าง ใช้น้ำมันหรือถ่าน', category: 'boat', layer: 'boat', texture: 'balloon', cost: [['fiber', 40], ['hide', 8], ['rope', 16], ['iron_ingot', 6]], hp: 110, blocks: 'none', boat: { kind: 'air', speed: 84, hp: 110, fuel: true, fuelUse: 1.4, fuelItems: [['fuel', 300], ['coal', 90]], vertical: 'balloon', down: 'balloon', accel: 70, immune: true, lift: 22, icon: '🎈', special: 'บินข้ามทุกพื้น · เติมด้วยน้ำมัน/ถ่านหิน' }, tier: 3 }),
];

// ======================================================================
// ชุดขยาย: บ้าน/อาคาร/อาคารผลิต/ป้องกัน/ตกแต่ง (รูปอยู่ใน art/buildings2.ts — บางชิ้นใช้รูปจาก art/town.ts)
// เกาะร้าง ไม่มีหมู่บ้าน — ทุกหลังผู้เล่นสร้างเอง · ขั้น 1 = รู้แปลนตั้งแต่แรก, ขั้น 2+ ต้องหาแปลนจากกล่อง
// ======================================================================
Object.assign(BUFFS, {
  leaf_hut: { buff: { stamina: 3 }, max: 1 },
  tent: { buff: { regen: 0.03 }, max: 1 },
  log_cabin: { buff: { hp: 12, stamina: 5 }, max: 2 },
  thatch_house: { buff: { hp: 8, regen: 0.03 }, max: 2 },
  cottage: { buff: { hp: 15, luck: 2 }, max: 2 },
  wood_house_2f: { buff: { hp: 15, regen: 0.05, bag: 2 }, max: 1 },
  brick_house: { buff: { hp: 20, def: 1, cold: 0.05 }, max: 2 },
  tree_house: { buff: { crit: 2, light: 12, luck: 2 }, max: 1 },
  stilt_house: { buff: { luck: 3, stamina: 4 }, max: 1 },
  barn: { buff: { gather: 5, stamina: 5 }, max: 1 },
  forge_house: { buff: { atk: 4 }, max: 1 },
  storehouse: { buff: { bag: 4 }, max: 1 },
  manor: { buff: { hp: 40, def: 2, regen: 0.1, luck: 4 }, max: 1 },
  fortress: { buff: { def: 4, atk: 5, hp: 20 }, max: 1 },
  wizard_tower: { buff: { luck: 6, crit: 3 }, max: 1 },
  command_hall: { buff: { atk: 5, def: 2, speed: 3, luck: 4, gather: 5 }, max: 1 },
  kitchen: { buff: { stamina: 5 }, max: 1 },
  adv_workbench: { buff: { gather: 5 }, max: 1 },
  scarecrow: { buff: { luck: 1 }, max: 2 },
  alarm_bell: { buff: { crit: 1 }, max: 1 },
  tower_archer: { buff: { crit: 2 }, max: 2 },
  weapon_rack: { buff: { atk: 2 }, max: 2 },
  painting: { buff: { luck: 1 }, max: 3 },
  fireplace: { buff: { cold: 0.05 }, max: 1 },
  dining_table: { buff: { stamina: 3 }, max: 1 },
  fountain: { buff: { regen: 0.05, luck: 2 }, max: 1 },
} satisfies Record<string, { buff: Partial<Stats>; max: number }>);

const prodFish: ProdRecipe = { out: [['fish', 1], ['crab_shell', 1, 0.08], ['golden_fish', 1, 0.02]] };

BUILDABLES.push(
  // ---------- บ้าน / ที่พัก (ใหญ่ขึ้น = ช่องเก็บของ/ความอบอุ่น/บัฟฐานดีขึ้น · กด E กลางคืน = นอน) ----------
  B({ id: 'leaf_hut', name: 'เพิงใบไม้', desc: 'ที่พักแรกสุดง่าย — นอน + จุดเกิด + เก็บของ 4 ช่อง', category: 'building', layer: 'object', texture: 'leaf_hut', cost: [['wood', 8], ['fiber', 12]], w: 2, h: 1, hp: 120, sleep: true, storage: 4, warmth: 8 }),
  B({ id: 'tent', name: 'เต็นท์', desc: 'กางได้ทุกเกาะ — นอน + จุดเกิด + เก็บของ 6 ช่อง', category: 'building', layer: 'object', texture: 'tent', cost: [['hide', 3], ['fiber', 10], ['wood', 4], ['rope', 2]], w: 2, h: 1, hp: 150, sleep: true, storage: 6, warmth: 12, anywhere: true }),
  B({ id: 'thatch_house', name: 'บ้านหลังคามุงจาก', desc: 'บ้านผนังปูนหลังคาฟาง — นอน + เก็บของ 20 ช่อง', category: 'building', layer: 'object', texture: 'house_a', cost: [['wood', 40], ['fiber', 30], ['stone', 10]], w: 3, h: 2, hp: 450, sleep: true, storage: 20, warmth: 22 }),
  B({ id: 'log_cabin', name: 'กระท่อมไม้ซุง', desc: 'บ้านซุงมีระเบียง แข็งแรง — นอน + เก็บของ 24 ช่อง อบอุ่น', category: 'building', layer: 'object', texture: 'log_cabin', cost: [['wood', 60], ['stone', 8], ['rope', 4]], w: 3, h: 2, hp: 550, sleep: true, storage: 24, warmth: 28 }),
  B({ id: 'cottage', name: 'บ้านกระเบื้องแดง', desc: 'บ้านอิฐส้มหลังคากระเบื้อง — นอน + เก็บของ 28 ช่อง', category: 'building', layer: 'object', texture: 'house_b', cost: [['brick', 30], ['plank', 16], ['glass', 2]], w: 3, h: 2, hp: 800, sleep: true, storage: 28, warmth: 30, tier: 2 }),
  B({ id: 'wood_house_2f', name: 'บ้านไม้ 2 ชั้น', desc: 'บ้านโครงไม้สองชั้น — นอน + เก็บของ 36 ช่อง + ช่องกระเป๋าเพิ่ม', category: 'building', layer: 'object', texture: 'house_c', cost: [['plank', 40], ['stone', 20], ['glass', 4]], w: 3, h: 2, hp: 900, sleep: true, storage: 36, warmth: 32, tier: 2 }),
  B({ id: 'brick_house', name: 'บ้านอิฐ', desc: 'อิฐแดงหนาแน่น ทนทานมาก — นอน + เก็บของ 32 ช่อง กันหนาว', category: 'building', layer: 'object', texture: 'brick_house', cost: [['brick', 50], ['plank', 12], ['glass', 4]], w: 3, h: 2, hp: 1300, sleep: true, storage: 32, warmth: 38, tier: 2 }),
  B({ id: 'tree_house', name: 'บ้านต้นไม้', desc: 'บ้านบนกิ่งไม้ใหญ่ มองได้ไกล — นอน + เก็บของ 20 ช่อง + แสงสว่าง', category: 'building', layer: 'object', texture: 'tree_house', cost: [['wood', 50], ['plank', 20], ['rope', 10], ['fiber', 10]], w: 3, h: 2, hp: 700, sleep: true, storage: 20, warmth: 18, light: 50, tier: 2 }),
  B({ id: 'stilt_house', name: 'บ้านริมน้ำบนเสา', desc: 'วางบนน้ำริมฝั่ง — นอน + เก็บของ 24 ช่อง + ดักปลาใต้ถุนบ้านให้เอง', category: 'building', layer: 'boat', texture: 'stilt_house', cost: [['plank', 30], ['wood', 20], ['rope', 8]], w: 3, h: 2, hp: 600, blocks: 'none', sleep: true, storage: 24, warmth: 20, prod: { every: 150, recipes: [prodFish], label: 'ดักปลาใต้ถุนบ้าน' }, tier: 2 }),
  B({ id: 'barn', name: 'โรงนา', desc: 'เก็บของ 50 ช่อง + พืชในรัศมี 6 ช่องโตเร็ว ×1.25', category: 'building', layer: 'object', texture: 'barn', cost: [['plank', 40], ['wood', 30], ['stone', 10]], w: 4, h: 3, hp: 900, storage: 50, growAura: { mult: 1.25, r: 96 }, tier: 2 }),
  B({ id: 'forge_house', name: 'โรงตีเหล็ก', desc: 'ทั่ง + เตาหลอม + โต๊ะช่าง ในหลังเดียว (กด E = อัพเกรดอุปกรณ์)', category: 'building', layer: 'object', texture: 'shop_blacksmith', cost: [['brick', 30], ['stone', 30], ['iron_ingot', 12], ['plank', 10]], w: 4, h: 2, hp: 1000, station: 'anvil', stations: ['furnace', 'workbench'], warmth: 25, light: 50, tier: 3 }),
  B({ id: 'storehouse', name: 'คลังสินค้าอัตโนมัติ', desc: 'เก็บของ 60 ช่อง + ดูดผลผลิตจากอาคารผลิตรอบ 8 ช่องเข้าคลังเอง', category: 'building', layer: 'object', texture: 'storehouse', cost: [['steel_plate', 6], ['iron_ingot', 10], ['plank', 30], ['gear', 4]], w: 4, h: 3, hp: 1200, storage: 60, collect: 8, tier: 3 }),
  B({ id: 'manor', name: 'คฤหาสน์', desc: 'บ้านหรูสองชั้นมีเสาโรมัน — นอน + เก็บของ 60 ช่อง + บัฟฐานสูง', category: 'building', layer: 'object', texture: 'manor', cost: [['brick', 80], ['plank', 40], ['glass', 12], ['gold_ingot', 4], ['iron_ingot', 10]], w: 5, h: 3, hp: 2500, sleep: true, storage: 60, warmth: 45, light: 60, tier: 4 }),
  B({ id: 'fortress', name: 'ป้อมปราการ', desc: 'ปราการหินยักษ์ ยิงธนูอัตโนมัติ — นอน + เก็บของ 40 ช่อง', category: 'building', layer: 'object', texture: 'fortress', cost: [['stone', 150], ['brick', 40], ['steel_plate', 10], ['iron_ingot', 10]], w: 5, h: 3, hp: 4500, material: 'metal', sleep: true, storage: 40, warmth: 30, turret: { range: 190, damage: 22, cooldown: 0.7, projectile: 'arrow' }, tier: 4 }),
  B({ id: 'wizard_tower', name: 'หอคอยพ่อมด', desc: 'ยิงลูกไฟทะลุศัตรู + ส่องสว่าง + โชค', category: 'building', layer: 'object', texture: 'wizard_tower', cost: [['brick', 30], ['crystal', 6], ['gold_ingot', 3], ['glass', 6]], w: 2, h: 2, hp: 1100, light: 90, storage: 12, turret: { range: 170, damage: 30, cooldown: 1.5, projectile: 'fireball', pierce: true, speed: 260 }, tier: 4 }),
  B({ id: 'command_hall', name: 'หอบัญชาการ', desc: 'ศูนย์กลางฐาน — บัฟทุกด้าน + นอน + เก็บของ 40 ช่อง', category: 'building', layer: 'object', texture: 'guild_hall', material: 'stone', cost: [['brick', 60], ['plank', 40], ['gold_ingot', 6], ['steel_plate', 6], ['glass', 8]], w: 4, h: 3, hp: 2200, sleep: true, storage: 40, warmth: 35, light: 70, tier: 4 }),

  // ---------- อาคารผลิต / สถานี ----------
  B({ id: 'sawmill', name: 'โรงเลื่อย', desc: 'ใส่ไม้ (E) → ผลิตไม้กระดานเอง ไม้ 2 → กระดาน 3 ทุก 8 วิ', category: 'machine', layer: 'object', texture: 'sawmill', frame: 0, cost: [['wood', 30], ['stone', 12], ['rope', 4]], w: 3, h: 2, hp: 400, storage: 12, workAnim: 'sawmill_run', prod: { every: 8, recipes: [{ in: [['wood', 2]], out: [['plank', 3]] }], label: 'ไม้ 2 → ไม้กระดาน 3' } }),
  B({ id: 'charcoal_kiln', name: 'เตาเผาถ่าน', desc: 'ใส่ไม้ → ถ่าน (ไม้ 3 → ถ่าน 2) · ใส่หิน → อิฐ (หิน 4 → อิฐ 3)', category: 'machine', layer: 'object', texture: 'charcoal_kiln', frame: 0, cost: [['stone', 24], ['wood', 6]], w: 2, h: 2, hp: 300, storage: 12, light: 30, warmth: 15, workAnim: 'charcoal_kiln_burn', prod: { every: 12, recipes: [{ in: [['wood', 3]], out: [['coal', 2]] }, { in: [['stone', 4]], out: [['brick', 3]] }], label: 'ไม้→ถ่าน · หิน→อิฐ' } }),
  B({ id: 'kitchen', name: 'ครัว', desc: 'สถานีทำอาหารเมนูพิเศษ (ใช้แทนกองไฟได้) — ไข่เจียว ต้มยำ แกง เค้ก', category: 'machine', layer: 'object', texture: 'kitchen', cost: [['stone', 20], ['wood', 12]], w: 2, h: 1, hp: 250, station: 'kitchen', stations: ['campfire'], warmth: 15, light: 40 }),
  B({ id: 'rain_collector', name: 'ถังเก็บน้ำฝน', desc: 'เก็บน้ำฝนไว้ดื่ม (E) — เติมเร็วตอนฝนตก จุ 8 ครั้ง', category: 'machine', layer: 'object', texture: 'rain_collector', cost: [['wood', 8], ['fiber', 4], ['stone', 2]], hp: 100, water: 'rain', anywhere: true }),
  B({ id: 'water_well', name: 'บ่อน้ำบาดาล', desc: 'ดื่มน้ำสะอาดได้ไม่จำกัด (E) กลางฐาน', category: 'machine', layer: 'object', texture: 'water_well', cost: [['stone', 30], ['wood', 10], ['rope', 4]], hp: 400, water: 'well' }),
  B({ id: 'auto_smelter', name: 'เครื่องหลอมอัตโนมัติ', desc: 'ต้องใช้ไฟ — ใส่แร่ → หลอมเป็นแท่งเอง (แร่ 2 → แท่ง 1 ทุก 10 วิ)', category: 'machine', layer: 'object', texture: 'auto_smelter', frame: 0, cost: [['iron_ingot', 14], ['gear', 6], ['brick', 10]], w: 2, h: 2, hp: 500, storage: 16, power: 'use', workAnim: 'auto_smelter_run', prod: { every: 10, power: true, recipes: [{ in: [['iron_ore', 2]], out: [['iron_ingot', 1]] }, { in: [['gold_ore', 2]], out: [['gold_ingot', 1]] }], label: 'แร่ 2 → แท่ง 1' }, light: 40, tier: 3 }),
  B({ id: 'adv_workbench', name: 'โต๊ะช่างขั้นสูง', desc: 'ใช้เป็นโต๊ะช่าง + ทั่ง + เตาหลอม ได้ในตัวเดียว', category: 'machine', layer: 'object', texture: 'adv_workbench', cost: [['plank', 20], ['iron_ingot', 10], ['gear', 4], ['steel_plate', 2]], w: 2, h: 1, hp: 400, station: 'workbench', stations: ['anvil', 'furnace'], tier: 3 }),

  // ---------- ฟาร์ม ----------
  B({ id: 'beehive', name: 'รังผึ้ง', desc: 'ได้น้ำผึ้งเรื่อยๆ ทุก 90 วิ (กด E เก็บ)', category: 'farm', layer: 'object', texture: 'beehive', cost: [['wood', 10], ['fiber', 8]], hp: 80, storage: 6, prod: { every: 90, recipes: [{ out: [['honey', 1]] }], label: 'ผลิตน้ำผึ้ง' } }),
  B({ id: 'chicken_coop', name: 'เล้าไก่', desc: 'ไก่ออกไข่ทุก 70 วิ — ใส่เบอร์รี่เป็นอาหาร ได้ไข่ 2 ฟอง', category: 'farm', layer: 'object', texture: 'chicken_coop', cost: [['wood', 24], ['fiber', 10]], w: 2, h: 2, hp: 200, storage: 8, prod: { every: 70, recipes: [{ in: [['berry', 1]], out: [['egg', 2]] }, { out: [['egg', 1]] }], label: 'ไก่ออกไข่ (ป้อนเบอร์รี่ = ×2)' } }),
  B({ id: 'fish_trap', name: 'ไซดักปลา', desc: 'วางบนน้ำ — ได้ปลาทุก 60 วิ มีลุ้นปูและปลาทอง', category: 'farm', layer: 'boat', texture: 'fish_trap', cost: [['wood', 6], ['rope', 3], ['fiber', 4]], hp: 60, blocks: 'none', storage: 6, prod: { every: 60, recipes: [prodFish], label: 'ดักปลา' } }),
  B({ id: 'compost_bin', name: 'ถังปุ๋ยหมัก', desc: 'พืชรอบ 3 ช่องโตเร็ว ×1.5 · ใส่หญ้าแห้ง 5 → ได้เมล็ดพันธุ์', category: 'farm', layer: 'object', texture: 'compost_bin', cost: [['wood', 6], ['fiber', 4]], hp: 80, storage: 6, growAura: { mult: 1.5, r: 48 }, prod: { every: 40, recipes: [{ in: [['fiber', 5]], out: [['carrot_seed', 1, 5], ['tomato_seed', 1, 3], ['pumpkin_seed', 1, 2]], pick: true }], label: 'หญ้าแห้ง 5 → เมล็ดพันธุ์' } }),
  B({ id: 'greenhouse', name: 'โรงเพาะชำ', desc: 'พืชรอบ 4 ช่องโตเร็ว ×2 + ปลูกผักให้เองทุก 100 วิ', category: 'farm', layer: 'object', texture: 'greenhouse', cost: [['glass', 16], ['plank', 20], ['brick', 10]], w: 3, h: 2, hp: 500, storage: 12, growAura: { mult: 2, r: 72 }, prod: { every: 100, recipes: [{ out: [['carrot', 2, 4], ['tomato', 2, 4], ['pumpkin', 1, 2]], pick: true }], label: 'ปลูกผักในโรงเรือน' }, tier: 2 }),
  B({ id: 'scarecrow', name: 'หุ่นไล่กา', desc: 'เฝ้าไร่ + โชคเล็กน้อย', category: 'farm', layer: 'object', texture: 'scarecrow', cost: [['wood', 4], ['fiber', 8]], hp: 60, blocks: 'none' }),
  B({ id: 'hay_bale', name: 'ฟ่อนฟาง', desc: 'ตกแต่งไร่นา', category: 'farm', layer: 'object', texture: 'hay_bale', cost: [['fiber', 10]], hp: 40 }),

  // ---------- ป้องกัน ----------
  B({ id: 'tower_archer', name: 'หอธนู', desc: 'ฐานหินแน่นหนา ยิงธนูอัตโนมัติระยะไกล', category: 'defense', layer: 'object', texture: 'tower_archer', cost: [['stone', 40], ['wood', 20], ['rope', 6], ['iron_ingot', 4]], w: 2, h: 2, hp: 900, turret: { range: 175, damage: 21, cooldown: 0.75, projectile: 'arrow' }, tier: 2 }),
  B({ id: 'ballista', name: 'ป้อมหน้าไม้ยักษ์', desc: 'ลูกดอกยักษ์ทะลุศัตรูทั้งแถว ดาเมจสูง', category: 'defense', layer: 'object', texture: 'ballista', cost: [['plank', 16], ['iron_ingot', 8], ['rope', 8], ['gear', 2]], w: 2, h: 1, hp: 450, turret: { range: 210, damage: 48, cooldown: 2.2, projectile: 'arrow', pierce: true, speed: 440 }, tier: 3 }),
  B({ id: 'flame_turret', name: 'ป้อมพ่นไฟ', desc: 'พ่นไฟระยะใกล้รัวๆ ศัตรูติดไฟ', category: 'defense', layer: 'object', texture: 'flame_turret', frame: 0, anim: 'flame_turret_idle', cost: [['iron_ingot', 10], ['fuel', 4], ['gear', 3]], hp: 380, turret: { range: 80, damage: 7, cooldown: 0.3, projectile: 'fireball', burn: 2.5, pierce: true, speed: 220, life: 0.4 }, tier: 3 }),
  B({ id: 'tesla_tower', name: 'ป้อมเทสลา', desc: 'ต้องใช้ไฟ — สายฟ้ากระโดดใส่ศัตรูต่อกัน 4 ตัว', category: 'defense', layer: 'object', texture: 'tesla_tower', frame: 0, cost: [['steel_plate', 6], ['gold_ingot', 3], ['crystal', 2], ['gear', 4]], hp: 500, power: 'use', workAnim: 'tesla_tower_spark', light: 40, turret: { range: 120, damage: 32, cooldown: 1.3, projectile: 'bolt', chain: 4 }, tier: 4 }),
  B({ id: 'mortar', name: 'ปืนครก', desc: 'ยิงโค้งข้ามกำแพง ระเบิดวงกว้าง ระยะไกลมาก (ยิงใกล้ไม่ได้)', category: 'defense', layer: 'object', texture: 'mortar', cost: [['steel_plate', 6], ['iron_ingot', 8], ['gunpowder', 8]], w: 2, h: 1, hp: 600, turret: { range: 260, damage: 55, cooldown: 3.6, projectile: 'cannonball', splash: 44, lob: true, minRange: 48 }, tier: 4 }),
  B({ id: 'snare_trap', name: 'กับดักหนีบ', desc: 'หนีบศัตรูที่เหยียบ ดาเมจ 40', category: 'defense', layer: 'object', texture: 'snare_trap', cost: [['iron_ingot', 1], ['stone', 3]], hp: 90, blocks: 'none', trap: true, trapKind: 'snare', anywhere: true }),
  B({ id: 'bomb_trap', name: 'กับดักระเบิด', desc: 'ระเบิดเมื่อศัตรูเหยียบ (ใช้ครั้งเดียว) ดาเมจ 90 วงกว้าง', category: 'defense', layer: 'object', texture: 'bomb_trap', cost: [['gunpowder', 3], ['wood', 2], ['iron_ingot', 1]], hp: 40, blocks: 'none', trap: true, trapKind: 'bomb', anywhere: true, tier: 2 }),
  B({ id: 'frost_trap', name: 'กับดักน้ำแข็ง', desc: 'ศัตรูรอบ 1.5 ช่องเดินช้าลงมาก + ความเย็นกัดกร่อน', category: 'defense', layer: 'object', texture: 'frost_trap', cost: [['crystal', 1], ['iron_ingot', 2], ['stone', 6]], hp: 200, blocks: 'none', trap: true, trapKind: 'frost', anywhere: true, tier: 2 }),
  B({ id: 'torch_pole', name: 'เสาคบเพลิง', desc: 'ส่องสว่างรอบฐาน ไม่ต้องใช้ไฟฟ้า', category: 'defense', layer: 'object', texture: 'torch_pole', frame: 0, anim: 'torch_pole_burn', cost: [['wood', 4], ['fiber', 3]], hp: 60, light: 80, warmth: 6, anywhere: true }),
  B({ id: 'searchlight', name: 'สปอตไลท์', desc: 'ต้องใช้ไฟ — ส่องสว่างกว้างมาก', category: 'defense', layer: 'object', texture: 'searchlight', cost: [['iron_ingot', 4], ['glass', 4], ['gear', 1]], hp: 200, power: 'use', light: 190, tier: 3 }),
  B({ id: 'alarm_bell', name: 'ระฆังเตือนภัย', desc: 'ดังเตือนเมื่อศัตรูบุกเข้าใกล้ (รัศมี 14 ช่อง)', category: 'defense', layer: 'object', texture: 'alarm_bell', cost: [['wood', 12], ['stone', 6], ['rope', 2]], hp: 150, alarm: true }),

  // ---------- กำแพง / ประตู / รั้ว / พื้น ----------
  B({ id: 'wall_palisade', name: 'รั้วซุงแหลม', desc: 'กำแพงไม้เสริม แข็งกว่ารั้วไม้', category: 'structure', layer: 'object', texture: 'wall_palisade', cost: [['wood', 6], ['rope', 1]], hp: 200, anywhere: true }),
  B({ id: 'wall_brick', name: 'กำแพงอิฐ', desc: 'แข็งแรงกว่ากำแพงหิน สวยกว่า', category: 'structure', layer: 'object', texture: 'wall_brick', cost: [['brick', 4]], hp: 420, anywhere: true }),
  B({ id: 'wall_meteor', name: 'กำแพงอุกกาบาต', desc: 'แข็งแกร่งที่สุดในเกม', category: 'structure', layer: 'object', texture: 'wall_meteor', cost: [['meteorite', 2], ['steel_plate', 1], ['stone', 4]], hp: 1400, tier: 4 }),
  B({ id: 'door_stone', name: 'ประตูหิน', desc: 'ประตูหนัก ผู้เล่นผ่านได้ ศัตรูผ่านไม่ได้', category: 'structure', layer: 'object', texture: 'door_stone', frame: 0, cost: [['stone', 12], ['iron_ingot', 1]], hp: 380, blocks: 'mobs', tier: 2 }),
  B({ id: 'door_meteor', name: 'ประตูอุกกาบาต', desc: 'ประตูที่แข็งแกร่งที่สุด', category: 'structure', layer: 'object', texture: 'door_meteor', frame: 0, cost: [['meteorite', 3], ['steel_plate', 2]], hp: 1200, blocks: 'mobs', tier: 4 }),
  B({ id: 'fence_stone', name: 'กำแพงหินเตี้ย', desc: 'กั้นเขตแบบชนบท', category: 'structure', layer: 'object', texture: 'fence_stone', cost: [['stone', 3]], hp: 120 }),
  B({ id: 'fence_picket', name: 'รั้วไม้ขาว', desc: 'รั้วตกแต่งหน้าบ้าน', category: 'structure', layer: 'object', texture: 'fence_picket', cost: [['plank', 2]], hp: 60 }),
  B({ id: 'floor_plank', name: 'ทางเดินไม้กระดาน', desc: 'ทางเดิน/ชานบ้าน', category: 'structure', layer: 'floor', texture: 'floor_plank', cost: [['plank', 1]], blocks: 'none' }),
  B({ id: 'floor_cobble', name: 'ทางเดินหินกรวด', desc: 'ทางเดินในสวน', category: 'structure', layer: 'floor', texture: 'floor_cobble', cost: [['stone', 2]], blocks: 'none' }),
  B({ id: 'floor_marble', name: 'พื้นหินอ่อน', desc: 'พื้นหรูสำหรับคฤหาสน์', category: 'structure', layer: 'floor', texture: 'floor_marble', cost: [['stone', 4], ['brick', 1]], blocks: 'none', tier: 2 }),

  // ---------- เฟอร์นิเจอร์ / ตกแต่ง (comfort = ฟื้นสติเมื่อยืนใกล้) ----------
  B({ id: 'sofa', name: 'โซฟา', desc: 'นั่งสบาย ฟื้นสติเมื่ออยู่ใกล้', category: 'furniture', layer: 'object', texture: 'sofa', cost: [['plank', 6], ['fiber', 10], ['hide', 2]], w: 2, h: 1, comfort: 0.3 }),
  B({ id: 'wardrobe', name: 'ตู้เสื้อผ้า', desc: 'เก็บของ 16 ช่อง', category: 'furniture', layer: 'object', texture: 'wardrobe', cost: [['plank', 10]], storage: 16 }),
  B({ id: 'dining_table', name: 'โต๊ะอาหาร', desc: 'โต๊ะยาวพร้อมเทียน ฟื้นสติ', category: 'furniture', layer: 'object', texture: 'dining_table', cost: [['plank', 8]], w: 2, h: 1, comfort: 0.2 }),
  B({ id: 'potted_plant', name: 'ต้นไม้กระถาง', desc: 'สดชื่น ฟื้นสติเล็กน้อย', category: 'furniture', layer: 'object', texture: 'potted_plant', cost: [['stone', 3], ['fiber', 4]], comfort: 0.15 }),
  B({ id: 'floor_lamp', name: 'โคมไฟตั้งพื้น', desc: 'แสงนวลในบ้าน', category: 'furniture', layer: 'object', texture: 'floor_lamp', cost: [['plank', 2], ['glass', 1], ['fiber', 3]], light: 75, comfort: 0.1 }),
  B({ id: 'painting', name: 'ภาพวาด', desc: 'ภาพทิวทัศน์เกาะ ฟื้นสติ + โชค', category: 'furniture', layer: 'object', texture: 'painting', cost: [['plank', 3], ['fiber', 4], ['berry', 2]], comfort: 0.2 }),
  B({ id: 'rug_round', name: 'พรมวงกลม', desc: 'พรมลายสวย ปูกลางห้อง', category: 'furniture', layer: 'floor', texture: 'rug_round', cost: [['fiber', 10], ['hide', 1]], w: 2, h: 2, blocks: 'none', comfort: 0.1 }),
  B({ id: 'bench', name: 'ม้านั่ง', desc: 'นั่งพักในสวน ฟื้นสติ', category: 'furniture', layer: 'object', texture: 'bench', cost: [['plank', 4]], w: 2, h: 1, comfort: 0.2 }),
  B({ id: 'flower_box', name: 'กระบะดอกไม้', desc: 'แต่งสวนหน้าบ้าน', category: 'furniture', layer: 'object', texture: 'flower_box', cost: [['plank', 2], ['fiber', 4]], w: 2, h: 1, blocks: 'none', comfort: 0.1 }),
  B({ id: 'barrel_stack', name: 'กองถังไม้', desc: 'เก็บของ 16 ช่อง', category: 'furniture', layer: 'object', texture: 'barrel_stack', cost: [['wood', 10]], w: 2, h: 1, storage: 16 }),
  B({ id: 'weapon_rack', name: 'ชั้นโชว์อาวุธ', desc: 'โชว์ดาบ ขวาน หอก — ปลุกใจนักสู้', category: 'furniture', layer: 'object', texture: 'weapon_rack', cost: [['plank', 6], ['iron_ingot', 2]], tier: 2 }),
  B({ id: 'fireplace', name: 'เตาผิง', desc: 'อบอุ่นมาก + แสง + ฟื้นสติ', category: 'furniture', layer: 'object', texture: 'fireplace', frame: 0, anim: 'fireplace_burn', cost: [['stone', 24], ['brick', 8]], w: 2, h: 1, hp: 300, warmth: 45, light: 60, comfort: 0.35, tier: 2 }),
  B({ id: 'aquarium', name: 'ตู้ปลา', desc: 'ดูปลาว่ายเพลินๆ ผ่อนคลายสุดๆ', category: 'furniture', layer: 'object', texture: 'aquarium', cost: [['glass', 8], ['plank', 4], ['fish', 3]], w: 2, h: 1, comfort: 0.4, tier: 2 }),
  B({ id: 'street_lamp', name: 'โคมไฟถนน', desc: 'ส่องทางเดินยามค่ำ ไม่ต้องใช้ไฟฟ้า', category: 'furniture', layer: 'object', texture: 'town_lamp', cost: [['iron_ingot', 2], ['glass', 1], ['coal', 2]], light: 90, tier: 2 }),
  B({ id: 'fountain', name: 'น้ำพุ', desc: 'ศูนย์กลางลานบ้าน ดื่มน้ำได้ (E) + ฟื้นสติ', category: 'furniture', layer: 'object', texture: 'fountain', frame: 0, anim: 'fountain_flow', cost: [['stone', 40], ['brick', 12]], w: 3, h: 2, hp: 500, water: 'well', comfort: 0.5, tier: 2 }),
);

for (const b of BUILDABLES) {
  const x = BUFFS[b.id];
  if (x) {
    b.buff = x.buff;
    b.buffMax = x.max;
  }
}

export const BUILD: Record<string, BuildDef> = Object.fromEntries(BUILDABLES.map((b) => [b.id, b]));

/** ใช้เป็นทั่ง (อัพเกรดอุปกรณ์ Lv4+) ได้ — รวมอาคารหลายสถานี เช่น โต๊ะช่างขั้นสูง */
export const hasAnvil = (b: BuildDef) => b.station === 'anvil' || !!b.stations?.includes('anvil');
