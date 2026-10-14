import Phaser from 'phaser';

/**
 * เปลี่ยนซีนแบบนุ่มๆ: กล้องจางเป็นสีมืดของเกม → start ซีนใหม่ → ซีนใหม่เรียก fadeIn()
 * กันกดซ้ำระหว่างจาง (ซีนเดิมจะไม่ start ซ้อนสองรอบ)
 */
const DARK: [number, number, number] = [11, 13, 31];
const leaving = new WeakSet<Phaser.Scene>();

/** เรียกต้น create() ของทุกซีนเมนู/เกม */
export function fadeIn(scene: Phaser.Scene, ms = 260) {
  leaving.delete(scene);
  scene.cameras.main.fadeIn(ms, ...DARK);
}

/** จางออกแล้วไปซีน key (ms = 0 → ไปทันที) */
export function fadeTo(scene: Phaser.Scene, key: string, data?: object, ms = 200) {
  if (leaving.has(scene)) return;
  leaving.add(scene);
  const cam = scene.cameras.main;
  if (ms <= 0) {
    scene.scene.start(key, data);
    return;
  }
  cam.fadeOut(ms, ...DARK);
  cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}

/** จางออกแล้ว restart ซีนเดิม */
export function fadeRestart(scene: Phaser.Scene, data?: object, ms = 160) {
  fadeTo(scene, scene.scene.key, data, ms);
}

/** ป๊อปอัป/หน้าต่าง: จางเข้า (+ ขยายจาก fromScale ถ้า < 1 — ใช้กับหน้าต่างที่ไม่เต็มจอ) */
export function popIn(scene: Phaser.Scene, target: Phaser.GameObjects.Container, ms = 160, fromScale = 1) {
  const sx = target.scaleX;
  const sy = target.scaleY;
  // ขยายรอบจุดกึ่งกลางของจอ (container อยู่ที่ 0,0) → เลื่อนให้ขยายจากกลางจอ
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;
  const x0 = target.x;
  const y0 = target.y;
  target.setAlpha(0).setScale(sx * fromScale, sy * fromScale);
  target.setPosition(x0 + (cx - x0) * (1 - fromScale), y0 + (cy - y0) * (1 - fromScale));
  scene.tweens.add({ targets: target, alpha: 1, scaleX: sx, scaleY: sy, x: x0, y: y0, duration: ms, ease: 'Cubic.easeOut' });
}
