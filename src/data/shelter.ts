import type { BuildDef } from './buildables';
import { rawCostOfBuild } from '../systems/CraftingSystem';

/**
 * ตัวเลขบ้านปลอดภัย (ไม่ผูก Phaser — ใช้ได้ทั้งในเกม สคริปต์วิเคราะห์สมดุล และหน้าคลังข้อมูล)
 * - วัสดุโครงสร้าง ไม้ / หิน-อิฐ / เหล็ก → ตัวคูณดาเมจแรงกระแทกจากภัย · ไฟป่าไหม้เฉพาะของไม้/หญ้า
 * - รัศมีเขตปลอดภัยของที่นอนได้ ตามขนาด/ขั้น + เลเวลอัพเกรด (ระบบในเกม: systems/ShelterSystem.ts)
 */
export type StructMaterial = 'wood' | 'stone' | 'metal';

export const MATERIAL_NAME: Record<StructMaterial, string> = { wood: 'ไม้', stone: 'หิน/อิฐ', metal: 'เหล็ก' };
/** ตัวคูณดาเมจจากแรงกระแทกของภัย (แผ่นดินไหว ฟ้าผ่า อุกกาบาต) */
export const IMPACT_MULT: Record<StructMaterial, number> = { wood: 1, stone: 0.6, metal: 0.4 };

/** แผ่นดินไหว: ดาเมจต่อครั้ง = (14 + 6×ระดับ) × วัสดุ แต่ไม่เกิน 12% ของ HP สูงสุด · ชิ้นเดียวโดนไม่เกิน 3 ครั้งต่อภัย */
export const QUAKE = { base: 14, perLevel: 6, capFrac: 0.12, maxHits: 3 };

const METAL = new Set(['iron_ore', 'gold_ore', 'meteorite', 'crystal']);
const matCache = new Map<string, StructMaterial>();

/** วัสดุของสิ่งก่อสร้าง: field material หรือดูจากวัตถุดิบดิบ (แร่ ≥ 40% = เหล็ก · หิน ≥ ครึ่งของที่เหลือ = หิน · นอกนั้น = ไม้) */
export function materialOf(def: BuildDef): StructMaterial {
  let m = matCache.get(def.id);
  if (m) return m;
  if (def.material) m = def.material;
  else {
    let metal = 0;
    let stone = 0;
    let coal = 0;
    let total = 0;
    for (const [id, n] of rawCostOfBuild(def.cost)) {
      total += n;
      if (id === 'coal') coal += n;
      else if (id === 'stone') stone += n;
      else if (METAL.has(id)) metal += n;
    }
    if (metal > 0) metal += coal; // ถ่านที่ใช้หลอมเหล็ก
    m = total > 0 && metal >= total * 0.4 ? 'metal' : stone > 0 && stone >= (total - metal - coal) * 0.5 ? 'stone' : 'wood';
  }
  matCache.set(def.id, m);
  return m;
}

/** ไฟป่าไหม้ได้ (ไม้/หญ้า/ฟาง/พืช) */
export const burnable = (def: BuildDef) => materialOf(def) === 'wood';

/** รัศมีเขตปลอดภัย (ช่อง): เล็ก 3 · บ้าน 3×2 ขั้น 1/2/3 = 4/4.5/5 · ใหญ่ (คฤหาสน์/ขั้น 4) 6 · ป้อมปราการ/หอบัญชาการ 8 · +0.3/เลเวลอัพเกรด */
export function shelterTiles(def: BuildDef, lv = 1): number {
  if (!def.sleep) return 0;
  const area = def.w * def.h;
  const base = def.id === 'fortress' || def.id === 'command_hall' ? 8 : def.tier >= 4 || area >= 15 ? 6 : area >= 6 ? 3.5 + Math.min(3, def.tier) * 0.5 : 3;
  return Math.round((base + 0.3 * (Math.max(1, lv) - 1)) * 10) / 10;
}
