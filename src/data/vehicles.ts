import { TILE } from '../world/tiles';

/**
 * ยานพาหนะ: water = แล่นบนน้ำ · land = วิ่งบนบก (ชนกำแพง/ต้นไม้/หิน/น้ำเหมือนผู้เล่น) · air = บินข้ามได้ทุกพื้น
 * ทุกคันขึ้น/ลงด้วย E · Shift = เร่ง (เปลืองน้ำมัน/แรง) · Space = ความสามารถพิเศษ (ห้องเก็บของ/ตกปลา) · คลิก = ยิงปืนติดยาน
 */
export type VehicleKind = 'water' | 'land' | 'air';

export interface VehicleGun {
  damage: number;
  cooldown: number;
  speed: number;
  projectile: string;
  splash?: number;
  /** ยิงพร้อมกันกี่นัด (กระจาย) */
  shots?: number;
}

export interface VehicleSpec {
  speed: number;
  hp: number;
  /** texture หันขึ้น (ถ้าไม่มี down → พลิกแนวตั้งเมื่อวิ่งลง) */
  vertical: string;
  /** texture หันลง (ยานบก: เห็นหน้ารถ) */
  down?: string;
  kind?: VehicleKind;
  /** ใช้น้ำมัน · fuelUse = ตัวคูณอัตรากิน · fuelItems = ของที่เติมได้ [ไอเทม, วินาที] */
  fuel?: boolean;
  fuelUse?: number;
  fuelItems?: [string, number][];
  /** ความเร่ง (px/วิ²) — ยิ่งสูงยิ่งออกตัว/เลี้ยวไว */
  accel?: number;
  /** แรงในตัว (ม้า/เครื่องร่อน): หมดแล้วช้าลง */
  energy?: { drain: number; regen: number; food?: [string, number][] };
  /** ตัวคูณความเร็วตามพื้น */
  terrain?: Partial<Record<number, number>>;
  gun?: VehicleGun;
  /** ห้องเก็บของ (ช่อง) */
  cargo?: number;
  /** ตกปลาในตัว: ปลากินเร็วขึ้น ×n + โบนัส */
  fishing?: number;
  /** แบ่งดาเมจที่คนขับโดนไปให้ตัวยาน (0..1) */
  armor?: number;
  /** ไม่โดนสัตว์ทะเลโจมตี (เรือดำน้ำ/ยานบิน) */
  immune?: boolean;
  /** ใบเรือ: ลมแรงตอนฝนตก = เร็วขึ้น */
  sail?: boolean;
  /** ระยะยกตัวตอนบิน (px) */
  lift?: number;
  icon: string;
  /** ข้อความความสามารถพิเศษ (การ์ดข้อมูล) */
  special?: string;
}

export const vehicleKind = (v: VehicleSpec): VehicleKind => v.kind ?? 'water';

export const VEHICLE_KIND_NAME: Record<VehicleKind, string> = { water: 'ทางน้ำ', land: 'ทางบก', air: 'ทางอากาศ' };

/** ล้อ: ถนน/ลานหินเร็ว · ทราย/หิมะ/ป่าช้า */
export const WHEEL_TERRAIN: Partial<Record<number, number>> = {
  [TILE.DIRT]: 1.2, [TILE.STONE]: 1.2, [TILE.BRICK]: 1.25, [TILE.PLANK_H]: 1.1, [TILE.PLANK_V]: 1.1,
  [TILE.SAND]: 0.8, [TILE.SNOW]: 0.7, [TILE.FOREST]: 0.85, [TILE.DESERT]: 0.85,
};
/** ล้อวิบาก (ATV/จี๊ป): ทรายหิมะไม่ค่อยช้า */
export const OFFROAD_TERRAIN: Partial<Record<number, number>> = { [TILE.DIRT]: 1.1, [TILE.STONE]: 1.1, [TILE.BRICK]: 1.1, [TILE.SNOW]: 0.9 };
/** ม้า: ชอบทุ่งหญ้า */
export const HOOF_TERRAIN: Partial<Record<number, number>> = {
  [TILE.GRASS]: 1.25, [TILE.FOREST]: 1.15, [TILE.DIRT]: 1.1, [TILE.SAND]: 0.85, [TILE.SNOW]: 0.8, [TILE.STONE]: 0.95, [TILE.BRICK]: 0.95,
};

export const DEFAULT_FUEL: [string, number][] = [['fuel', 300]];
