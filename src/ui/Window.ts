import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { COLORS, fitPixel, panel, pixelTxt, txt } from './widgets';

/** ปุ่มกลมเล็กบนแถบหัว (พับ/ปิด) — พื้นที่กดกว้างกว่าตัวปุ่ม ให้นิ้วกดง่าย */
export function roundButton(scene: Phaser.Scene, x: number, y: number, r: number, color: number, label: string, onClick: () => void) {
  const c = scene.add.container(x, y);
  const shadow = scene.add.circle(0, 2, r, 0x0b0d1f, 0.5);
  const face = scene.add.circle(0, 0, r, color).setStrokeStyle(2, 0x0b0d1f, 1);
  const shine = scene.add.circle(-r * 0.3, -r * 0.35, r * 0.3, 0xffffff, 0.35);
  const t = txt(scene, 0, -1, label, Math.round(r * 1.15), '#ffffff').setOrigin(0.5);
  c.add([shadow, face, shine, t]);
  const hit = r + 8;
  c.setSize(hit * 2, hit * 2).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => face.setFillStyle(color, 1).setScale(1.08));
  c.on('pointerout', () => face.setScale(1));
  c.on('pointerdown', () => {
    scene.tweens.killTweensOf(c);
    c.setScale(0.85);
    scene.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
    onClick();
  });
  return Object.assign(c, { label: t });
}

/**
 * หน้าต่าง UI มาตรฐาน: แถบหัวสีทอง (ไอคอน+ชื่อ) + ปุ่มพับ ▾/▸ + ปุ่มปิด ✕ + ลากย้ายที่แถบหัว
 * เนื้อหาใส่ใน `body` (พิกัดเริ่มที่มุมซ้ายบนของพื้นที่เนื้อหา · ระยะขอบ 16 ทุกหน้าต่าง)
 */
export class UIWindow {
  readonly root: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.NineSlice;
  private header: Phaser.GameObjects.Zone;
  private foldBtn: ReturnType<typeof roundButton>;
  private titleT: Phaser.GameObjects.Text;
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
    // แถบหัวสีครีม→ทอง มุมมน + ตัวหนังสือเข้ม (ฟอนต์หัวข้อ)
    const HEAD = UIWindow.HEAD;
    const bar = scene.add.graphics();
    bar.fillStyle(0x0b0d1f, 0.35).fillRoundedRect(8, 8, w - 16, HEAD - 8, 8);
    bar.fillGradientStyle(0xfff2b0, 0xfff2b0, 0xffcd75, 0xffcd75, 1).fillRoundedRect(8, 6, w - 16, HEAD - 8, 8);
    bar.fillStyle(0xffffff, 0.35).fillRoundedRect(12, 8, w - 24, 5, 3);
    bar.lineStyle(2, 0xc28a50, 1).strokeRoundedRect(8, 6, w - 16, HEAD - 8, 8);
    this.header = scene.add.zone(8, 6, w - 16, HEAD - 8).setOrigin(0).setInteractive({ useHandCursor: true, draggable: true });
    // ชื่อหน้าต่าง = ฟอนต์พิกเซลไทย สีเข้ม + เงาทองเข้ม 1 พิกเซล (ไม่มีขอบ)
    const t = pixelTxt(scene, 20, 6 + (HEAD - 8) / 2, title, 18, COLORS.ink, {}, { outline: null, shadow: '#c28a50' }).setOrigin(0, 0.5);
    fitPixel(t, w - 110);
    this.titleT = t;
    const cy = 6 + (HEAD - 8) / 2;
    // แสงวิ้งพาดแถบหัวทุก ~5 วิ (แถบเฉียงเล็กๆ วิ่งในแถบ ไม่ต้องใช้ mask)
    const gl = scene.add.graphics().setAlpha(0.35);
    gl.fillStyle(0xffffff, 1).fillPoints([{ x: 0, y: 8 }, { x: 12, y: 8 }, { x: 6, y: HEAD - 4 }, { x: -6, y: HEAD - 4 }], true);
    gl.setPosition(14, 0).setVisible(false);
    const sweep = () => {
      if (!this.root.visible || !gl.active) return;
      gl.setX(14).setVisible(true);
      scene.tweens.add({ targets: gl, x: w - 84, duration: 700, ease: 'Sine.easeInOut', onComplete: () => gl.setVisible(false) });
    };
    const sweepTimer = scene.time.addEvent({ delay: 5000, loop: true, callback: sweep });
    this.foldBtn = roundButton(scene, w - 56, cy, 11, 0x3b5dc9, '▾', () => this.toggleCollapse());
    const close = roundButton(scene, w - 26, cy, 11, 0xb13e53, '✕', () => this.close());
    this.body = scene.add.container(16, HEAD + 8);
    this.root.add([this.bg, bar, gl, this.header, t, this.foldBtn, close, this.body]);
    this.root.once(Phaser.GameObjects.Events.DESTROY, () => sweepTimer.remove(false));
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

  /** เปลี่ยนชื่อบนแถบหัว (เช่น ตลาด ↔ ร้านค้าทางไกล) */
  setTitle(s: string) {
    if (this.titleT.text === s) return this;
    this.titleT.setText(s);
    fitPixel(this.titleT, this.w - 110);
    return this;
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
      // จางเข้า + เด้งนิดหน่อย
      this.root.setAlpha(0);
      const k = this.scale;
      this.root.setScale(k * 0.96);
      this.root.scene.tweens.add({ targets: this.root, alpha: 1, scale: k, duration: 160, ease: 'Back.easeOut' });
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
    this.foldBtn.label.setText(this.collapsed ? '▸' : '▾');
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

/** แผงเล็กบน HUD ที่พับได้ (สถานะ แผนที่ย่อ เควสต์) — ชิปเล็ก "▾ ชื่อ" มุมแผง · พื้นที่กดสูง 22px */
export class Foldable {
  folded = false;
  private btn: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, private parts: Phaser.GameObjects.GameObject[], label: string, private onFold?: (f: boolean) => void) {
    this.btn = txt(scene, x, y, `▾ ${label}`, 11, COLORS.sea).setBackgroundColor('#0b0d1fcc').setPadding(6, 2, 6, 2).setDepth(6);
    this.btn.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-4, -4, this.btn.width + 8, Math.max(22, this.btn.height + 8)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
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
