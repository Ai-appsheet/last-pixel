import Phaser from 'phaser';
import { setTextBoost } from './widgets';

/**
 * ขนาด UI ตามจอจริง — เกมวาดที่ 960×540 แล้วย่อ/ขยายให้พอดีจอ (Scale.FIT)
 * มือถือแนวนอน (เช่น 844×390) ภาพถูกย่อเหลือ ~72% → ตัวหนังสือ 10–12px อ่านไม่ออก
 * โหมด "กะทัดรัด" (compact) = จอแสดงผลเล็กกว่า 82% ของขนาดจริง:
 *   · HUD (แผงสถานะ มินิแมป แถบเครื่องมือ hotbar ปุ่มสัมผัส) ขยาย ×1.15–1.25 ยึดตามมุมจอ
 *   · ตัวหนังสือเล็ก (< 14px) ขยายขึ้นอัตโนมัติ (ดู setTextBoost ใน widgets.ts)
 *   · หน้าต่าง (กระเป๋า แผนที่ ฯลฯ) ขยายให้เต็มจอเท่าที่ได้
 * บังคับได้ด้วย ?ui=compact / ?ui=normal (ไว้ทดสอบ)
 */
export const GW = 960;
export const GH = 540;

const forced = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('ui');
  return v === 'compact' || v === 'normal' ? v : null;
})();

/** อัตราย่อ/ขยายของแคนวาสบนจอจริง (1 = 960×540 css px) */
export function displayScale(scene: Phaser.Scene) {
  const d = scene.scale.displaySize;
  const k = Math.min(d.width / GW, d.height / GH);
  return k > 0 ? k : 1;
}

export function isCompact(scene: Phaser.Scene) {
  if (forced) return forced === 'compact';
  return displayScale(scene) < 0.82;
}

/** ตัวคูณขนาด HUD (แผงสถานะ มินิแมป แถบเครื่องมือ) */
export function hudScale(scene: Phaser.Scene) {
  return isCompact(scene) ? 1.25 : 1;
}

/** ตัวคูณขนาดปุ่มสัมผัส + hotbar (เล็กกว่า HUD นิดหน่อย ให้มีที่ว่างตรงกลางจอ) */
export function touchScale(scene: Phaser.Scene) {
  return isCompact(scene) ? 1.15 : 1;
}

/** เรียกต้น create() ของซีน: เปิด/ปิดการขยายตัวหนังสือเล็กตามจอปัจจุบัน */
export function applyUiScale(scene: Phaser.Scene) {
  const c = isCompact(scene);
  setTextBoost(scene, c);
  return c;
}

/**
 * กลุ่ม HUD ที่ยึดกับจุดบนจอ (ax, ay) แล้วขยาย k เท่า — ลูกในกลุ่มใช้พิกัดจอเดิม (960×540) ได้เลย
 * จุดยึดอยู่กับที่ ส่วนอื่นขยายออกจากจุดนั้น
 */
export function anchorGroup(scene: Phaser.Scene, ax: number, ay: number, k: number, depth = 0) {
  return scene.add.container(ax * (1 - k), ay * (1 - k)).setScale(k).setDepth(depth);
}

/** ผู้ใช้ตั้งระบบให้ลดการเคลื่อนไหว (prefers-reduced-motion) → งดแฟลช/กระพริบ */
export function reducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** แปลงพิกัดในกลุ่ม → พิกัดจอ */
export function groupPoint(c: Phaser.GameObjects.Container, x: number, y: number) {
  return { x: c.x + x * c.scaleX, y: c.y + y * c.scaleY };
}
