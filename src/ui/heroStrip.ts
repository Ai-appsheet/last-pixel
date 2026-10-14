import Phaser from 'phaser';
import { CHARACTERS, getCharacter } from '../data/characters';
import { COLORS, pixelTxt, txt } from './widgets';

/**
 * แถวหน้าตัวละครกลม 7 คน — หน้าตาเดียวกับหน้าโหลด (app/loading.css `.si-heroes`):
 * ภาพ art/loader/<id>.jpg ครอปวงกลม · ขอบทอง 3px · เงาตก 4px สีเลือดหมู + แสงทองฟุ้ง · พื้นหลัง #2a2f4a
 * กระโดดเบาๆ ทีละตัว (1.4 วิ ขึ้น 9px เอียง −4° หน่วง 0.12 วิ/ตัว) · ชี้/แตะ = โชว์ชื่อ
 * ใช้ได้ทุกซีนที่มี texture art_loader/* (คิวโหลดใน ui/art.ts) — ไม่มีภาพ = ข้ามตัวนั้น
 */
export interface HeroStripOptions {
  /** จุดกึ่งกลางแถว */
  cx: number;
  /** กึ่งกลางแนวตั้งของวงกลม */
  cy: number;
  /** เส้นผ่านศูนย์กลาง (px) */
  size?: number;
  gap?: number;
  depth?: number;
  /** ข้อความใต้/เหนือแถว (ซ่อนตอนชี้ตัวละคร) */
  caption?: string;
  onPick?: (id: string) => void;
}

export function heroStrip(scene: Phaser.Scene, o: HeroStripOptions) {
  const ids = CHARACTERS.map((c) => c.id).filter((id) => scene.textures.exists(`art_loader/${id}`));
  const objs: Phaser.GameObjects.GameObject[] = [];
  if (!ids.length) return { ids, objs, width: 0 };
  const size = o.size ?? 48;
  const gap = o.gap ?? 8;
  const r = size / 2;
  const depth = o.depth ?? 5;
  const total = ids.length * size + (ids.length - 1) * gap;
  const x0 = o.cx - total / 2 + r;
  const cy = o.cy;
  const caption = o.caption ? pixelTxt(scene, o.cx, cy - r - 8, o.caption, 18, COLORS.cream).setOrigin(0.5, 1).setDepth(depth) : null;
  const name = txt(scene, 0, cy - r - 10, '', 15, COLORS.gold).setOrigin(0.5, 1).setStroke('#0b0d1f', 4).setDepth(depth + 1).setVisible(false);
  if (caption) objs.push(caption);
  objs.push(name);
  ids.forEach((id, k) => {
    const x = x0 + k * (size + gap);
    // แสงทองฟุ้ง + เงาตก + พื้นหลัง + ภาพครอปวงกลม + วงขอบทอง
    const glow = scene.add.image(x, cy, 'glow').setTint(0xffcd75).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setScale((size + 28) / 64).setDepth(depth);
    const shadow = scene.add.circle(x, cy + 4, r + 1.5, 0x5a1f2b).setDepth(depth);
    const back = scene.add.circle(x, cy, r, 0x2a2f4a).setDepth(depth);
    const face = scene.add.image(x, cy, `art_loader/${id}`).setDepth(depth);
    face.setScale(size / Math.min(face.width, face.height));
    const maskG = scene.make.graphics({ x: 0, y: 0 }, false).fillStyle(0xffffff).fillCircle(x, cy, r);
    face.setMask(maskG.createGeometryMask());
    const ring = scene.add.circle(x, cy, r).setStrokeStyle(3, 0xffcd75, 1).setDepth(depth);
    const hit = scene.add.zone(x, cy, size + 8, size + 8).setInteractive({ useHandCursor: true }).setDepth(depth + 1);
    const show = () => {
      ring.setStrokeStyle(3, 0xffffff, 1);
      name.setText(getCharacter(id).name).setX(x).setVisible(true);
      caption?.setVisible(false);
    };
    const hide = () => {
      ring.setStrokeStyle(3, 0xffcd75, 1);
      name.setVisible(false);
      caption?.setVisible(true);
    };
    hit.on('pointerover', show).on('pointerout', hide);
    hit.on('pointerdown', () => {
      show();
      if (o.onPick) scene.time.delayedCall(220, () => scene.sys.isActive() && o.onPick!(id));
    });
    objs.push(glow, shadow, back, face, ring, hit);
    // กระโดด: 40% ขึ้น → 60% ลง → พัก (รวม 1.4 วิ) — mask ขยับตามภาพ
    const hop = [face, maskG, back, ring, glow];
    scene.tweens.add({ targets: hop, y: '-=9', duration: 560, yoyo: true, repeat: -1, repeatDelay: 280, ease: 'Sine.easeInOut', delay: k * 120 });
    scene.tweens.add({ targets: face, angle: -4, duration: 560, yoyo: true, repeat: -1, repeatDelay: 280, ease: 'Sine.easeInOut', delay: k * 120 });
    // เข้าฉากทีละตัว
    for (const g of [glow, shadow, back, face, ring]) {
      g.setAlpha(0);
      scene.tweens.add({ targets: g, alpha: g === glow ? 0.4 : 1, duration: 300, delay: 300 + k * 80 });
    }
    scene.events.once('shutdown', () => maskG.destroy());
  });
  return { ids, objs, width: total };
}
