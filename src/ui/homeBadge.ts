import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { outline, txt } from './widgets';

/** ป้ายเล็ก "🏠 ปลอดภัย" ใต้แถวหัวใจตอนอยู่ในบ้าน (+ HP บ้านตอนภัยซัด) — ฟัง 'home:inside' จาก HomeSystem */
export function homeBadge(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Text {
  const t = outline(txt(scene, x, y, '🏠 ปลอดภัย', 11, '#a7f070').setOrigin(0, 0.5), 2).setVisible(false);
  const on = (inside: boolean, text?: string, color?: string) => {
    if (!t.active) return;
    t.setVisible(inside);
    if (inside) t.setText(text ?? '🏠 ปลอดภัย').setColor(color ?? '#a7f070');
  };
  EventBus.on('home:inside', on);
  scene.events.once('shutdown', () => EventBus.off('home:inside', on));
  return t;
}
