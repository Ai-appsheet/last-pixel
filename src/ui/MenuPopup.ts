import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { iconTexture } from './fancyButton';
import { RETRO, retroButton, retroLabel, retroPanel } from './retro';
import { txt } from './widgets';

/**
 * เมนูหลัก (ปุ่ม ☰): กรอบไม้แขวนป้าย "เมนู" + ช่องไอคอน 4×2 + แถวปุ่มเล็กด้านล่าง
 * ภาพกรอบ/ไอคอน (public/art/ui/menu_*.png) โหลดตอนต้องใช้ — ระหว่างโหลดใช้กรอบพิกเซลเรียบ + ไอคอนพิกเซลเดิมแทน
 */
export interface MenuTile {
  /** ชื่อภาพ public/art/ui/menu_<art>.png */
  art: string;
  /** ไอคอนพิกเซลสำรอง (texture key) */
  fallback: string;
  label: string;
  key?: string;
  run: () => void;
  /** จุดแดงแจ้งเตือน (เช่น มีกล่องฟรีให้รับ) */
  dot?: () => boolean;
}

export interface MenuExtra {
  label: string;
  run: () => void;
}

export const MENU_ART = ['frame', 'bag', 'blueprint', 'craft', 'catalog', 'map', 'wardrobe', 'events', 'settings'] as const;
export const menuArtKey = (n: string) => `ui_menu_${n}`;

/** โหลดภาพเมนูเบื้องหลัง (ครั้งเดียว) แล้วเรียก cb เมื่อครบ */
export function loadMenuArt(scene: Phaser.Scene, cb?: () => void) {
  const missing = MENU_ART.filter((n) => !scene.textures.exists(menuArtKey(n)));
  if (!missing.length) {
    cb?.();
    return true;
  }
  for (const n of missing) scene.load.image(menuArtKey(n), `art/ui/menu_${n}.png`);
  scene.load.once('complete', () => {
    if (!scene.sys.isActive()) return;
    for (const n of MENU_ART) if (scene.textures.exists(menuArtKey(n)) && n !== 'frame') scene.textures.get(menuArtKey(n)).setFilter(Phaser.Textures.FilterMode.LINEAR);
    cb?.();
  });
  scene.load.start();
  return false;
}

// ช่องเนื้อหาในภาพกรอบ (หน่วยพิกเซลของภาพ 778×515) · ป้ายชื่อกลางบน
const FRAME_W = 778;
const FRAME_H = 515;
const IN = { x0: 72, x1: 706, y0: 112, y1: 452 };
const SIGN = { x: 389, y: 50 };

export class MenuPopup {
  private root: Phaser.GameObjects.Container | null = null;
  private dots: { g: Phaser.GameObjects.Arc; on: () => boolean }[] = [];
  private timer: Phaser.Time.TimerEvent | null = null;

  constructor(private scene: Phaser.Scene, private tiles: MenuTile[], private extras: MenuExtra[], private compact: boolean) {}

  get visible() {
    return !!this.root;
  }

  toggle(v = !this.root) {
    if (v) this.open();
    else this.close();
  }

  close() {
    this.root?.destroy();
    this.root = null;
    this.timer?.remove(false);
    this.timer = null;
  }

  open() {
    if (this.root) return;
    this.build();
    // ภาพยังไม่มา → แสดงแบบสำรองก่อน แล้ววาดใหม่ด้วยภาพจริงเมื่อโหลดเสร็จ
    if (!loadMenuArt(this.scene, () => this.root && (this.close(), this.build()))) return;
  }

  private build() {
    const s = this.scene;
    const W = s.scale.width;
    const H = s.scale.height;
    const art = s.textures.exists(menuArtKey('frame'));
    const k = Math.min(((this.compact ? 0.9 : 0.58) * W) / FRAME_W, (0.94 * H) / FRAME_H);
    const fw = FRAME_W * k;
    const fh = FRAME_H * k;
    const X0 = Math.round((W - fw) / 2);
    const Y0 = Math.round((H - fh) / 2);
    const fx = (x: number) => X0 + x * k;
    const fy = (y: number) => Y0 + y * k;
    const root = s.add.container(0, 0).setDepth(55);
    this.root = root;
    const dim = s.add.rectangle(0, 0, W, H, 0x0b0f12, 0.45).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.close());
    root.add(dim);
    if (art) {
      root.add(s.add.image(X0, Y0, menuArtKey('frame')).setOrigin(0).setScale(k));
      root.add(txt(s, fx(SIGN.x), fy(SIGN.y), 'เมนู', 15, '#fff2d0', { fontStyle: '600' }).setOrigin(0.5).setShadow(0, 1, '#5a3418', 0, false, true));
    } else {
      // สำรอง: กรอบพิกเซลเรียบ
      root.add(retroPanel(s, fx(IN.x0 - 24), fy(IN.y0 - 40), (IN.x1 - IN.x0 + 48) * k, (IN.y1 - IN.y0 + 64) * k));
      root.add(retroLabel(s, fx(SIGN.x), fy(IN.y0 - 20), 'เมนู', RETRO.css.gold, 15).setOrigin(0.5));
    }
    // ปิด (x) มุมขวาบนในช่องเนื้อหา
    const x = retroLabel(s, fx(IN.x1) - 2, fy(IN.y0) + 2, 'x', RETRO.css.muted, 16).setOrigin(1, 0).setPadding(6, 2, 6, 2).setInteractive({ useHandCursor: true });
    x.on('pointerover', () => x.setColor(RETRO.css.gold)).on('pointerout', () => x.setColor(RETRO.css.muted));
    x.on('pointerdown', () => this.close());
    root.add(x);
    // ช่องไอคอน 4×2
    const cols = 4;
    const gap = 12 * k;
    const extraH = this.extras.length ? 34 * k : 0;
    const top = fy(IN.y0) + 26 * k;
    const gw = (IN.x1 - IN.x0) * k;
    const gh = fy(IN.y1) - top - extraH - 6 * k;
    const tw = (gw - gap * (cols - 1)) / cols;
    const th = (gh - gap) / 2;
    const iconSz = Math.min(tw * 0.62, th * 0.52, 64);
    this.dots = [];
    this.tiles.forEach((t, i) => {
      const cx = fx(IN.x0) + (i % cols) * (tw + gap);
      const cy = top + Math.floor(i / cols) * (th + gap);
      const g = s.add.graphics();
      const draw = (hover: boolean) => {
        g.clear().fillStyle(hover ? 0x22323a : 0x0f1519, hover ? 0.9 : 0.78).fillRoundedRect(cx, cy, tw, th, 6);
        g.lineStyle(1, hover ? 0xb7d9a4 : RETRO.sage, hover ? 1 : 0.75).strokeRoundedRect(cx + 0.5, cy + 0.5, tw - 1, th - 1, 6);
      };
      draw(false);
      const ix = cx + tw / 2;
      const iy = cy + th * 0.34;
      const key = s.textures.exists(menuArtKey(t.art)) ? menuArtKey(t.art) : null;
      const icon = key
        ? s.add.image(ix, iy, key).setDisplaySize(iconSz, iconSz)
        : s.add.image(ix, iy, s.textures.exists(t.fallback) ? t.fallback : iconTexture(s, 'star')).setScale(2);
      const lab = txt(s, ix, cy + th * 0.68, t.label, 13, '#f3ead2', { fontStyle: '500' }).setOrigin(0.5);
      const parts: Phaser.GameObjects.GameObject[] = [g, icon, lab];
      if (t.key) parts.push(txt(s, ix, cy + th - 3, t.key, 10, RETRO.css.muted).setOrigin(0.5, 1));
      if (t.dot) {
        const d = s.add.circle(cx + tw - 8, cy + 8, 4, 0xd98a7e).setStrokeStyle(1, 0x0b0f12).setVisible(t.dot());
        this.dots.push({ g: d, on: t.dot });
        parts.push(d);
      }
      const hit = s.add.zone(cx, cy, tw, th).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        draw(true);
        icon.setY(iy - 1);
        Sfx.play('click', 50);
      });
      hit.on('pointerout', () => {
        draw(false);
        icon.setY(iy);
      });
      hit.on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        this.close();
        t.run();
      });
      parts.push(hit);
      root.add(parts);
    });
    // แถวปุ่มเล็ก (คำสั่งเสริม)
    if (this.extras.length) {
      const n = this.extras.length;
      const bw = (gw - 6 * (n - 1)) / n;
      const by = fy(IN.y1) - extraH / 2;
      this.extras.forEach((e, i) => {
        const b = retroButton(s, fx(IN.x0) + bw / 2 + i * (bw + 6), by, bw, Math.max(22, extraH - 6 * k), e.label, () => {
          this.close();
          e.run();
        });
        root.add(b.objects);
      });
    }
    root.setAlpha(0);
    s.tweens.add({ targets: root, alpha: 1, duration: 140 });
    this.timer = s.time.addEvent({ delay: 400, loop: true, callback: () => this.dots.forEach((d) => d.g.setVisible(d.on())) });
  }
}
