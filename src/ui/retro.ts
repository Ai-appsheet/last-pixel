import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { reducedMotion } from './layout';
import { fitPixel, pixelTxt, txt, type Button } from './widgets';

/**
 * ชุด UI แบบเกมพิกเซลยุค 90 (เรียบ ไม่แย่งซีน — แนว Under the Island)
 * แผงสีเทาอมเขียวเข้มทึบ ขอบพิกเซล 2 ชั้น (เส้นนอกสว่าง + เส้นในเข้ม) มุมตัด 2 พิกเซล เงาตกสั้น · ไม่มีไล่สี/เงาวาว
 * ตัวหนังสือเมนู/ปุ่ม/หัวข้อ = ฟอนต์พิกเซลไทย (Unifont) + เงา 1 พิกเซล · คำอธิบาย = Noto Sans Thai
 */
export const RETRO = {
  panel: 0x1f2a33,
  panel2: 0x26343e,
  edge: 0x5f7380,
  edgeHi: 0x9fb2ba,
  inner: 0x0e1418,
  shadow: 0x05080a,
  sage: 0x8fbf7a,
  red: 0xc46a5e,
  gold: 0xe3c178,
  css: {
    text: '#eef0e6',
    muted: '#9aa7a4',
    sand: '#d9c7a0',
    sage: '#8fbf7a',
    gold: '#e3c178',
    red: '#d98a7e',
    shadow: '#0b0f12',
  },
};

/** ทำสีสดให้หม่นลงตามชุด UI เรียบ (ผสมเทาอมเขียว 35%) — ใช้กับสีชื่อ/ระดับที่มาจากข้อมูลเกม */
export function muteColor(css: string) {
  const known: Record<string, string> = { '#ffcd75': RETRO.css.gold, '#ef7d57': RETRO.css.red, '#a7f070': RETRO.css.sage, '#73eff7': '#9fd6e0', '#94b0c2': RETRO.css.muted };
  if (known[css.toLowerCase()]) return known[css.toLowerCase()];
  const m = /^#([0-9a-f]{6})$/i.exec(css);
  if (!m) return css;
  const n = parseInt(m[1], 16);
  const mix = (c: number, g: number) => Math.round(c * 0.65 + g * 0.35);
  const r = mix((n >> 16) & 255, 0x9a);
  const g = mix((n >> 8) & 255, 0xa7);
  const b = mix(n & 255, 0xa4);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** จุดของสี่เหลี่ยมมุมตัด c พิกเซล */
function chamferPts(x: number, y: number, w: number, h: number, c: number) {
  return [
    { x: x + c, y }, { x: x + w - c, y }, { x: x + w, y: y + c }, { x: x + w, y: y + h - c },
    { x: x + w - c, y: y + h }, { x: x + c, y: y + h }, { x, y: y + h - c }, { x, y: y + c },
  ];
}

export interface RetroBoxOpts {
  fill?: number;
  alpha?: number;
  edge?: number;
  shadow?: boolean;
  /** มุมตัด (พิกเซล) */
  cut?: number;
}

/** วาดกล่องพิกเซล: เงาตก 2 · ทึบ · เส้นขอบนอกสว่าง 1 + เส้นในเข้ม 1 · มุมตัด */
export function drawRetroBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, o: RetroBoxOpts = {}) {
  const c = o.cut ?? 2;
  if (o.shadow !== false) g.fillStyle(RETRO.shadow, 0.5).fillPoints(chamferPts(x + 2, y + 2, w, h, c), true);
  g.fillStyle(o.fill ?? RETRO.panel, o.alpha ?? 0.92).fillPoints(chamferPts(x + 1, y + 1, w - 2, h - 2, Math.max(1, c - 1)), true);
  g.lineStyle(1, RETRO.inner, 1).strokePoints(chamferPts(x + 1.5, y + 1.5, w - 3, h - 3, Math.max(1, c - 1)), true, true);
  g.lineStyle(1, o.edge ?? RETRO.edge, 1).strokePoints(chamferPts(x + 0.5, y + 0.5, w - 1, h - 1, c), true, true);
  return g;
}

/** แผงพิกเซล (มุมซ้ายบน) — ปรับขนาดได้ด้วย setSize เหมือน NineSlice */
export class RetroPanel extends Phaser.GameObjects.Graphics {
  width: number;
  height: number;
  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, private opts: RetroBoxOpts = {}) {
    super(scene, { x, y });
    this.width = w;
    this.height = h;
    scene.add.existing(this);
    this.redraw();
  }

  setSize(w: number, h: number) {
    this.width = w;
    this.height = h;
    return this.redraw();
  }

  private redraw() {
    this.clear();
    drawRetroBox(this, 0, 0, this.width, this.height, this.opts);
    return this;
  }
}

export const retroPanel = (scene: Phaser.Scene, x: number, y: number, w: number, h: number, o?: RetroBoxOpts) => new RetroPanel(scene, x, y, w, h, o);

/** ลูกศร ▶ พิกเซลเล็ก (เคอร์เซอร์เมนู) — กระพริบช้าๆ (ลดการเคลื่อนไหว = นิ่ง) */
export function retroCursor(scene: Phaser.Scene, x: number, y: number, color = RETRO.gold) {
  const g = scene.add.graphics({ x, y });
  g.fillStyle(RETRO.shadow, 0.8).fillPoints([{ x: 1, y: -3 }, { x: 6, y: 1 }, { x: 1, y: 5 }], true);
  g.fillStyle(color, 1).fillPoints([{ x: 0, y: -4 }, { x: 5, y: 0 }, { x: 0, y: 4 }], true);
  if (!reducedMotion()) scene.tweens.add({ targets: g, alpha: { from: 1, to: 0.25 }, duration: 420, yoyo: true, repeat: -1, ease: 'Stepped', easeParams: [2] });
  return g;
}

/** ตัวหนังสือเมนู/ปุ่ม/แท็บ: Noto Sans Thai 500 (บาง คม) ขนาด ~80% ของค่าที่ขอ (16 → 13) + เงา 1px ไม่มีขอบ */
export function retroLabel(scene: Phaser.Scene, x: number, y: number, text: string, color = RETRO.css.text, size = 16) {
  const t = txt(scene, x, y, text, Math.round(size * 0.8) + 1, color, { fontStyle: '500' });
  return t.setShadow(0, 1, RETRO.css.shadow, 0, false, true);
}

/** ชื่อหน้าต่าง: ฟอนต์พิกเซลไทยเส้นบาง (Unifont) + เงา 1 พิกเซล */
export function retroTitle(scene: Phaser.Scene, x: number, y: number, text: string, color = RETRO.css.gold) {
  return pixelTxt(scene, x, y, text, 14, color, {}, { outline: null, shadow: RETRO.css.shadow, bold: false });
}

export type RetroRole = 'normal' | 'primary' | 'danger';

/**
 * ปุ่มกล่องพิกเซลเรียบ: ชี้ = ขอบสว่าง + ▶ หน้าตัวหนังสือ · กด = เลื่อนลง 1 พิกเซล
 * คืนค่าแบบเดียวกับ button() ใน widgets (bg/hover/t/objects/setLabel) ใช้แทนกันได้
 */
export function retroButton(scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void, role: RetroRole = 'normal', enabled = true): Button {
  const edge = role === 'primary' ? RETRO.sage : role === 'danger' ? RETRO.red : RETRO.edge;
  const color = !enabled ? RETRO.css.muted : role === 'primary' ? RETRO.css.sage : role === 'danger' ? RETRO.css.red : RETRO.css.text;
  const g = scene.add.graphics({ x, y });
  const t = retroLabel(scene, x, y, label, color).setOrigin(0.5);
  const cur = retroCursor(scene, 0, y).setVisible(false);
  let state: 'idle' | 'hover' | 'down' = 'idle';
  const draw = () => {
    const d = state === 'down' ? 1 : 0;
    g.clear();
    drawRetroBox(g, -w / 2, -h / 2 + d, w, h, { edge: state === 'idle' || !enabled ? edge : RETRO.edgeHi, fill: state === 'idle' ? RETRO.panel : RETRO.panel2, shadow: d === 0 });
    t.setY(Math.round(y - 1 + d));
    cur.setPosition(Math.round(x - t.displayWidth / 2 - 10), Math.round(y + d));
  };
  const fit = () => {
    fitPixel(t, w - 26);
    draw();
  };
  fit();
  if (enabled) {
    g.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    if (g.input) g.input.cursor = 'pointer';
    g.on('pointerover', () => {
      state = 'hover';
      cur.setVisible(true);
      draw();
      Sfx.play('click', 60);
    })
      .on('pointerout', () => {
        state = 'idle';
        cur.setVisible(false);
        draw();
      })
      .on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        state = 'down';
        draw();
        scene.time.delayedCall(90, () => {
          if (!g.active) return;
          state = cur.visible ? 'hover' : 'idle';
          draw();
        });
        onClick();
      });
  }
  return {
    bg: g as unknown as Phaser.GameObjects.NineSlice,
    hover: cur as unknown as Phaser.GameObjects.NineSlice,
    t,
    objects: [g, cur, t],
    setLabel: (s: string) => {
      if (t.text === s) return;
      t.setText(s);
      fit();
    },
  };
}
