import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { COLORS, heading, panel, txt } from './widgets';

/**
 * หน้าต่าง UI มาตรฐาน: แถบหัว (ชื่อ) + ปุ่มพับ ▾/▸ + ปุ่มปิด ✕ + ลากย้ายที่แถบหัว
 * เนื้อหาใส่ใน `body` (พิกัดเริ่มที่มุมซ้ายบนของพื้นที่เนื้อหา)
 */
export class UIWindow {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.NineSlice;
  private header: Phaser.GameObjects.Rectangle;
  private foldBtn: Phaser.GameObjects.Text;
  collapsed = false;
  onClose: (() => void) | null = null;
  static readonly HEAD = 34;
  /** จอเล็ก (มือถือ): หน้าต่างที่สร้างตอนค่านี้เป็น true จะขยายให้เต็มจอเท่าที่ได้ + จัดกลางจอ (UIScene ตั้งก่อนสร้าง) */
  static fit = false;
  /** ตัวคูณขนาดหน้าต่าง (1 = ปกติ) */
  readonly scale: number = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly w: number,
    readonly h: number,
    title: string,
    depth = 10,
  ) {
    this.root = scene.add.container(x, y).setDepth(depth).setVisible(false);
    if (UIWindow.fit) {
      const sw = scene.scale.width;
      const sh = scene.scale.height;
      const k = Math.min(1.25, (sw - 8) / w, (sh - 8) / h);
      if (k > 1.02) {
        this.scale = k;
        this.root.setScale(k).setPosition(Math.round((sw - w * k) / 2), Math.round((sh - h * k) / 2));
      }
    }
    this.bg = panel(scene, 0, 0, w, h);
    this.header = scene.add.rectangle(10, 8, w - 20, UIWindow.HEAD - 10, 0x0b0d1f, 0.45).setOrigin(0).setInteractive({ useHandCursor: true, draggable: true });
    const t = heading(scene, 18, 9, title, 20);
    this.foldBtn = txt(scene, w - 62, 9, '▾', 20, COLORS.gold).setInteractive({ useHandCursor: true });
    const close = txt(scene, w - 32, 9, '✕', 20, COLORS.bad).setInteractive({ useHandCursor: true });
    this.body = scene.add.container(16, UIWindow.HEAD + 8);
    this.root.add([this.bg, this.header, t, this.foldBtn, close, this.body]);
    this.foldBtn.on('pointerdown', () => this.toggleCollapse());
    close.on('pointerdown', () => this.close());
    // ลากแถบหัว: Phaser ให้ dragX = ตำแหน่งเริ่ม + ระยะลากทั้งหมด (หน่วย local) → อิงตำแหน่งหน้าต่างตอนเริ่มลาก
    let start = { x: 0, y: 0 };
    this.header.on('dragstart', () => (start = { x: this.root.x, y: this.root.y }));
    this.header.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      const k = this.scale;
      this.root.x = Phaser.Math.Clamp(start.x + (dx - this.header.x) * k, -w * k + 120, scene.scale.width - 120);
      this.root.y = Phaser.Math.Clamp(start.y + (dy - this.header.y) * k, 0, scene.scale.height - 40);
    });
    scene.input.setDraggable(this.header);
  }

  get visible() {
    return this.root.visible;
  }

  open() {
    const was = this.root.visible;
    this.root.setVisible(true);
    Sfx.play('click');
    // จางเข้าเร็วๆ (ไม่กระตุกตอนเปิด)
    if (!was) {
      this.root.setAlpha(0);
      this.root.scene.tweens.add({ targets: this.root, alpha: 1, duration: 120, ease: 'Quad.easeOut' });
    }
  }

  close() {
    if (!this.root.visible) return;
    this.root.setVisible(false);
    Sfx.play('click');
    this.onClose?.();
  }

  toggle() {
    if (this.visible) this.close();
    else this.open();
  }

  toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.body.setVisible(!this.collapsed);
    this.bg.setSize(this.w, this.collapsed ? UIWindow.HEAD + 14 : this.h);
    this.foldBtn.setText(this.collapsed ? '▸' : '▾');
    Sfx.play('click');
  }

  /** จุดบนจออยู่ในหน้าต่างไหม (กันคลิกทะลุไปโลก) */
  contains(x: number, y: number) {
    if (!this.visible) return false;
    const h = (this.collapsed ? UIWindow.HEAD + 14 : this.h) * this.scale;
    return x >= this.root.x && x <= this.root.x + this.w * this.scale && y >= this.root.y && y <= this.root.y + h;
  }

  add(objs: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]) {
    this.body.add(objs);
    return this;
  }
}

/** แผงเล็กบน HUD ที่พับได้ (สถานะ แผนที่ย่อ เควสต์) */
export class Foldable {
  folded = false;
  private btn: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, private parts: Phaser.GameObjects.GameObject[], label: string, private onFold?: (f: boolean) => void) {
    this.btn = txt(scene, x, y, `▾ ${label}`, 11, COLORS.dim).setInteractive({ useHandCursor: true }).setDepth(6);
    this.btn.on('pointerdown', () => this.set(!this.folded));
  }

  set(f: boolean) {
    this.folded = f;
    for (const o of this.parts) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!f);
    this.btn.setText(`${f ? '▸' : '▾'} ${this.btn.text.slice(2)}`);
    this.onFold?.(f);
  }

  get button() {
    return this.btn;
  }
}
