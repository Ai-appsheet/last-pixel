import Phaser from 'phaser';
import { ITEMS } from '../data/items';

/** ของที่ตกอยู่บนพื้น — ผู้เล่นเดินเข้าใกล้แล้วดูดเข้ากระเป๋าอัตโนมัติ */
export class DroppedItem extends Phaser.GameObjects.Image {
  readonly itemId: string;
  qty: number;
  /** กันไม่ให้ดูดทันทีตอนเพิ่งตก */
  delay = 0.35;
  life = 300;

  constructor(scene: Phaser.Scene, x: number, y: number, itemId: string, qty: number) {
    super(scene, x, y, ITEMS[itemId].icon);
    this.itemId = itemId;
    this.qty = qty;
    this.setScale(0.6).setDepth(y);
    scene.add.existing(this);
    // เด้งออกมาเล็กน้อย
    const tx = x + Phaser.Math.Between(-8, 8);
    const ty = y + Phaser.Math.Between(-6, 6);
    scene.tweens.add({ targets: this, x: tx, duration: 260, ease: 'Quad.easeOut' });
    scene.tweens.add({ targets: this, y: { from: ty - 6, to: ty }, duration: 260, ease: 'Bounce.easeOut' });
  }
}
