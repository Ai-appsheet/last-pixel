import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import type { Slot } from '../components/Inventory';
import { Sfx } from '../core/AudioManager';
import { BAND_INFO, bandOf, itemDurMult, levelOfSlot } from '../data/upgrade';
import { variantKey } from '../gfx/UpgradeLook';
import { renderScale, textResolution } from './crispText';
import { showItemIcon } from './itemArt';

/**
 * ฟอนต์เกม (Google Fonts ใน app/layout.tsx + app/globals.css · BootScene รอโหลดเสร็จก่อนวาด)
 * FONT = Noto Sans Thai (ข้อความทั่วไป/คำอธิบาย/ปุ่ม — ทางการ อ่านง่าย) · PIXEL_TH = UnifontThai (ชื่อหน้าต่าง/หัวข้อใหญ่เท่านั้น)
 * PIXEL_FONT = Press Start 2P (โลโก้) · HEAD_FONT (Mali) เหลือไว้ให้โค้ดเก่า
 */
export const FONT = '"Noto Sans Thai", "Sarabun", Tahoma, sans-serif';
export const HEAD_FONT = '"Mali", "Mitr", Kanit, Thonburi, Tahoma, sans-serif';
export const PIXEL_FONT = '"Press Start 2P", monospace';

export const COLORS = {
  panel: 0x1a1c2c,
  panelLight: 0x333c57,
  border: 0x566c86,
  highlight: 0xffcd75,
  text: '#f4f4f4',
  dim: '#a9bccb',
  gold: '#ffcd75',
  cream: '#fff2b0',
  sea: '#73eff7',
  /** ตัวหนังสือเข้มบนแถบหัวสีทอง */
  ink: '#2a2340',
  good: '#a7f070',
  bad: '#ef7d57',
};

type Style = Phaser.Types.GameObjects.Text.TextStyle;

/**
 * ระยะบน/ล่างของบรรทัดสำหรับภาษาไทย — Phaser วัดจาก "|MÉqgy" ซึ่งเตี้ยกว่าสระ/วรรณยุกต์ซ้อน (เช่น ที่ ปู้ ญ ฎ)
 * จึงวัดเองด้วยข้อความไทยที่สูง/ต่ำสุด แล้วส่งเป็น metrics ให้ Text (ไม่ตัดวรรณยุกต์ + บรรทัดสูงพอดีกับไทย)
 */
const metricCache = new Map<string, Phaser.Types.GameObjects.Text.TextMetrics>();
let measureCtx: CanvasRenderingContext2D | null = null;
if (typeof document !== 'undefined' && document.fonts) document.fonts.addEventListener('loadingdone', () => metricCache.clear());
export function thaiMetrics(size: number, family = FONT, weight = '600'): Phaser.Types.GameObjects.Text.TextMetrics | undefined {
  if (typeof document === 'undefined') return undefined;
  const key = `${weight}|${size}|${family}`;
  const hit = metricCache.get(key);
  if (hit) return hit;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return undefined;
  measureCtx.font = `${weight} ${size}px ${family}`;
  const m = measureCtx.measureText('ที่ปู้ญฎฐ์|MÉqgy');
  if (!('actualBoundingBoxAscent' in m)) return undefined;
  const ascent = Math.ceil(m.actualBoundingBoxAscent) + 1;
  const descent = Math.ceil(m.actualBoundingBoxDescent) + 1;
  const out = { ascent, descent, fontSize: ascent + descent };
  metricCache.set(key, out);
  return out;
}

/** จอเล็ก (มือถือ): ซีนที่ขยายตัวหนังสือที่เล็กกว่า 14px ให้อ่านออก — ตั้งจาก ui/layout.ts applyUiScale()
 *  (แยกต่อซีน: ตัวหนังสือในโลกเกม เช่น ป้ายชื่อคู่แข่ง ไม่โดนขยาย) */
const boostScenes = new WeakSet<Phaser.Scene>();
export function setTextBoost(scene: Phaser.Scene, on: boolean) {
  if (on) boostScenes.add(scene);
  else boostScenes.delete(scene);
}
/** ขนาดตัวหนังสือจริงหลังขยาย (เฉพาะจอเล็ก · ไม่เกิน ×1.15: 9→10.5, 10→11.5, 11→12, 12→13, 13→13.5) */
export function boosted(scene: Phaser.Scene, size: number) {
  return size < 14 && boostScenes.has(scene) ? Math.round(Math.min(size * 1.15, size + (14 - size) * 0.4) * 2) / 2 : size;
}

/**
 * ข้อความทั่วไป (Noto Sans Thai คมชัด ความละเอียดสูง + LINEAR · บรรทัดสูงพอสำหรับสระ/วรรณยุกต์ไทย)
 * ตัวเล็ก < 15px = คำอธิบาย: ตัวปกติ 400 ไม่มีขอบ มีแค่เงาจางๆ · ≥ 15px = ชื่อ/หัวข้อย่อย: 600 + เงาตกบาง
 * ข้อความบนโลกเกม/ภาพ ใส่ขอบบางเอง (outline())
 */
export function txt(scene: Phaser.Scene, x: number, y: number, text: string, size0 = 16, color = COLORS.text, extra: Style = {}) {
  const size = boosted(scene, size0);
  const family = extra.fontFamily ?? FONT;
  const body = size0 < 15;
  const weight = extra.fontStyle ?? (body ? '400' : '600');
  const t = scene.add.text(x, y, text, {
    fontFamily: family,
    fontSize: `${size}px`,
    fontStyle: weight,
    color,
    stroke: '#0b0d1f',
    strokeThickness: family === PIXEL_FONT ? Math.max(2, Math.round(size / 8)) : 0,
    resolution: textResolution(),
    metrics: family === PIXEL_FONT ? undefined : thaiMetrics(size, family, weight),
    ...extra,
  });
  if (body) t.setShadow(0, 1, 'rgba(11,13,31,0.55)', 0, false, true);
  else t.setShadow(0, Math.max(1, Math.round(size / 14)), '#0b0d1f', 0, true, true);
  t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return t;
}

/** ขอบเข้มบางๆ สำหรับตัวหนังสือที่วางทับโลกเกม/ภาพ (ตัวเลขในช่องไอเทม ป้ายชื่อ) — ตัวพิกเซลจะเป็นขอบ 1 พิกเซลฟอนต์ */
export function outline<T extends Phaser.GameObjects.Text>(t: T, px = 2): T {
  t.setStroke('#0b0d1f', px);
  t.setShadow(0, 1, '#0b0d1f', 0, true, true);
  return t;
}

/** ฟอนต์พิกเซลไทย (GNU Unifont ไทย+อังกฤษ · app/fonts) — ใช้เฉพาะชื่อหน้าต่าง/ชื่อเกมไทย/หัวข้อใหญ่ */
export const PIXEL_TH = '"UnifontThai", monospace';

export type PixelText = Phaser.GameObjects.Text & {
  __pixel?: boolean;
  /** สีขอบ 1 พิกเซลฟอนต์ (null = ไม่มี) · สีเงาตก 1 พิกเซลฟอนต์ · ตัวหนาเทียม (วาดซ้ำเลื่อน 1 พิกเซลฟอนต์) */
  __pxOutline?: string | null;
  __pxShadow?: string | null;
  __pxBold?: boolean;
  /** พิกเซลจอจริงต่อ 1 พิกเซลฟอนต์ (เลขเต็ม) */
  __pxM?: number;
  /** พิกเซลจอจริงต่อ 1 หน่วยเกม ตอนสร้าง (ความละเอียดแคนวาส × ซูมกล้อง) */
  __pxD?: number;
  /** ขนาดที่ขอ (หน่วยเกม) */
  __pxWant?: number;
};

export interface PixelOpts {
  outline?: string | null;
  shadow?: string | null;
  bold?: boolean;
}

/** ตัวคูณเลขเต็ม m (พิกเซลจอต่อพิกเซลฟอนต์) ที่ให้ขนาดใกล้ size ที่สุด */
const pixelM = (size: number, D: number) => Math.max(1, Math.round((size * D) / 16));

/**
 * ตั้งขนาดฟอนต์พิกเซล: วาด Unifont ให้ 1 พิกเซลฟอนต์ = m พิกเซลแคนวาส = m พิกเซลจอจริง (ความละเอียดแคนวาส = D)
 * → ขนาดในเกม = 16m/D · บรรทัด/ระยะขอบปัดเป็นพิกเซลฟอนต์ (crispText) → คมทุกพิกเซล ไม่เบลอ/ไม่หยัก
 */
function applyPixelSize(t: PixelText, m: number) {
  const D = t.__pxD ?? 1;
  const u = m / D;
  t.__pxM = m;
  t.style.setStyle({ fontSize: `${(16 * u).toFixed(4)}px`, fontStyle: 'normal', resolution: D, metrics: { ascent: 14 * u, descent: 2 * u, fontSize: 16 * u } }, true, false);
}

/**
 * ตัวหนังสือพิกเซลไทย (ชื่อหน้าต่าง · ชื่อเกมภาษาไทย · หัวข้อใหญ่) — ไม่มีเส้นขอบแคนวาส:
 * ตัดขอบแข็ง + ขอบ/เงา/ตัวหนา 1 พิกเซลฟอนต์ ทำบนแคนวาส (crispText.pixelPost) · NEAREST
 */
export function pixelTxt(scene: Phaser.Scene, x: number, y: number, text: string, size = 16, color = COLORS.text, extra: Style = {}, opts: PixelOpts = {}) {
  const t = scene.add.text(x, y, '', { fontFamily: PIXEL_TH, color, ...extra }) as PixelText;
  t.__pixel = true;
  t.__pxD = renderScale() * (scene.cameras?.main?.zoom || 1);
  t.__pxWant = size;
  t.__pxBold = opts.bold ?? true;
  t.__pxOutline = opts.outline === undefined ? '#1a1c2c' : opts.outline;
  t.__pxShadow = opts.shadow === undefined ? '#1a1c2c' : opts.shadow;
  applyPixelSize(t, pixelM(size, t.__pxD));
  t.setText(text);
  t.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return t;
}

/**
 * ย่อข้อความให้พอดีความกว้าง · ตัวพิกเซล: ลดตัวคูณเลขเต็มทีละขั้นก่อน (คมเหมือนเดิม) แล้วค่อยย่อเศษส่วนเป็นทางเลือกสุดท้าย
 * ข้อความสั้นลงภายหลัง → กลับไปขนาดที่ขอ
 */
export function fitPixel(t: Phaser.GameObjects.Text, maxW: number) {
  const p = t as PixelText;
  if (p.__pixel && p.__pxD) {
    const want = pixelM(p.__pxWant ?? 16, p.__pxD);
    if (p.__pxM !== want) applyPixelSize(p, want);
    while (t.width > maxW && (p.__pxM ?? 1) > 1) applyPixelSize(p, (p.__pxM ?? 1) - 1);
  }
  return t.setScale(t.width > maxW ? maxW / t.width : 1);
}

/** หัวข้อใหญ่ของหน้าจอ: ฟอนต์พิกเซลไทย ไล่สีครีม → ทอง → ส้ม + ขอบ/เงาม่วงเข้ม */
export function heading(scene: Phaser.Scene, x: number, y: number, text: string, size = 32, _pixel = true) {
  const t = pixelTxt(scene, x, y, text, size, COLORS.gold, {}, { outline: '#3a2440', shadow: '#3a2440' });
  const grad = t.context.createLinearGradient(0, 0, 0, t.height);
  grad.addColorStop(0, '#fff2b0');
  grad.addColorStop(0.5, '#ffcd75');
  grad.addColorStop(1, '#ef7d57');
  return t.setFill(grad);
}

/** กรอบหน้าต่างแบบ pixel (NineSlice) — origin มุมซ้ายบน */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel') {
  return scene.add.nineslice(x, y, key, undefined, w, h, 10, 10, 10, 10).setOrigin(0);
}

export interface Button {
  bg: Phaser.GameObjects.NineSlice;
  hover: Phaser.GameObjects.NineSlice;
  t: Phaser.GameObjects.Text;
  objects: Phaser.GameObjects.GameObject[];
  setLabel(s: string): void;
}

/** ปุ่มมน: ฟ้าทะเลปกติ / ทองตอนชี้ / เทาตอนกดไม่ได้ · กดแล้วเด้งนิดหน่อย */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, onClick: () => void, enabled = true, size = 18,
): Button {
  const bg = scene.add.nineslice(x, y, enabled ? 'ui_btn' : 'ui_btn_off', undefined, w, h, 8, 8, 8, 8);
  const hover = scene.add.nineslice(x, y, 'ui_btn_hover', undefined, w, h, 8, 8, 8, 8).setVisible(false);
  // ป้ายปุ่ม: Noto Sans Thai 600 ขนาด 14–15 (ปุ่มใหญ่ตามที่ขอ) · เงาตกบาง ไม่มีขอบหนา · ยาวเกินปุ่มย่อให้พอดี
  const t = txt(scene, x, y - 1, label, size >= 18 ? size : Math.min(15, Math.max(14, size)), enabled ? COLORS.text : '#8a95a8', { fontStyle: '600' }).setOrigin(0.5);
  t.setShadow(0, 1, '#0b0d1f', 0, false, true);
  const fit = () => fitPixel(t, w - 10);
  fit();
  if (enabled) {
    const all = [bg, hover, t];
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        hover.setVisible(true);
        t.setY(y - 2);
        Sfx.play('click', 60);
      })
      .on('pointerout', () => {
        hover.setVisible(false);
        t.setY(y - 1);
      })
      .on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        scene.tweens.killTweensOf(all);
        all.forEach((o) => o.setScale(o === t ? t.scaleX * 0.94 : 0.94));
        scene.tweens.add({ targets: [bg, hover], scale: 1, duration: 180, ease: 'Back.easeOut' });
        scene.tweens.add({ targets: t, scale: t.scaleX / 0.94, duration: 180, ease: 'Back.easeOut', onComplete: fit });
        onClick();
      });
  }
  return { bg, hover, t, objects: [bg, hover, t], setLabel: (s) => (t.setText(s), fit()) };
}

/** แถบค่าสถานะแบบ pixel (กรอบ + สี + เงาสะท้อน) */
export class StatBar {
  readonly frame: Phaser.GameObjects.NineSlice;
  private fill: Phaser.GameObjects.Rectangle;
  private shine: Phaser.GameObjects.Rectangle;
  private ghost: Phaser.GameObjects.Rectangle;
  private shown = 1;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, readonly h: number, color: number) {
    this.frame = scene.add.nineslice(x, y, 'ui_bar', undefined, w, h, 4, 4, 4, 4).setOrigin(0, 0.5);
    this.ghost = scene.add.rectangle(x + 4, y, w - 8, h - 8, 0xf4f4f4, 0.5).setOrigin(0, 0.5);
    this.fill = scene.add.rectangle(x + 4, y, w - 8, h - 8, color).setOrigin(0, 0.5);
    this.shine = scene.add.rectangle(x + 4, y - (h - 8) / 2 + 1, w - 8, 2, 0xffffff, 0.3).setOrigin(0, 0.5);
  }

  get objects() {
    return [this.frame, this.ghost, this.fill, this.shine];
  }

  set(ratio: number, dt = 16) {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    const full = this.w - 8;
    this.fill.setSize(full * r, this.h - 8);
    this.shine.setSize(full * r, 2);
    // แถบขาวค่อยๆ ไหลตามตอนค่าลด (ให้เห็นความเสียหาย)
    this.shown = r > this.shown ? r : Math.max(r, this.shown - dt * 0.0006);
    this.ghost.setSize(full * this.shown, this.h - 8);
  }

  setAlpha(a: number) {
    this.fill.setAlpha(a);
  }

  setColor(color: number) {
    this.fill.setFillStyle(color);
  }
}

/** ช่องไอเทม (hotbar / กระเป๋า) */
export class SlotView {
  readonly bg: Phaser.GameObjects.NineSlice;
  private sel: Phaser.GameObjects.NineSlice;
  private icon: Phaser.GameObjects.Image;
  /** ภาพวาดไอเทมมุมมน (แทนไอคอนพิกเซลเมื่อมีภาพ) */
  private art: Phaser.GameObjects.Image;
  private qty: Phaser.GameObjects.Text;
  private durBg: Phaser.GameObjects.Rectangle;
  private dur: Phaser.GameObjects.Rectangle;
  private label?: Phaser.GameObjects.Text;
  /** กรอบสีตามช่วงอัพเกรด + ป้าย Lv */
  private bandFrame: Phaser.GameObjects.Rectangle;
  private lvT: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly size: number, label?: string) {
    this.bg = scene.add.nineslice(x, y, 'ui_slot', undefined, size, size, 6, 6, 6, 6);
    this.sel = scene.add.nineslice(x, y, 'ui_slot_sel', undefined, size, size, 6, 6, 6, 6).setVisible(false);
    this.icon = scene.add.image(x, y, 'px').setVisible(false);
    this.art = scene.add.image(x, y, 'px').setVisible(false);
    this.qty = outline(txt(scene, x + size / 2 - 3, y + size / 2 - 1, '', 13, COLORS.text, { fontStyle: '600' }).setOrigin(1, 1), 3);
    this.durBg = scene.add.rectangle(x - size / 2 + 6, y + size / 2 - 7, size - 12, 3, 0x0b0d1f).setOrigin(0, 0.5).setVisible(false);
    this.dur = scene.add.rectangle(x - size / 2 + 6, y + size / 2 - 7, size - 12, 3, 0xa7f070).setOrigin(0, 0.5).setVisible(false);
    if (label) this.label = outline(txt(scene, x - size / 2 + 5, y - size / 2 + 2, label, 11, COLORS.cream, { fontStyle: '500' }));
    this.bandFrame = scene.add.rectangle(x, y, size - 6, size - 6).setStrokeStyle(2, 0xffcd75, 0.9).setVisible(false);
    this.lvT = outline(txt(scene, x + size / 2 - 3, y - size / 2 + 1, '', size >= 40 ? 11 : 10, COLORS.good, { fontStyle: '600' }).setOrigin(1, 0)).setVisible(false);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.bg, this.sel, this.icon, this.art, this.bandFrame, this.durBg, this.dur, this.qty, ...(this.label ? [this.label] : []), this.lvT];
  }

  /** ค่าล่าสุดที่วาด — HUD เรียก set() ทุกเฟรม ถ้าไม่เปลี่ยนก็ไม่ต้องวาดใหม่ */
  private last = '';

  /** บังคับวาดใหม่ครั้งหน้า (หลังมีโค้ดอื่นซ่อน/แสดงชิ้นส่วนของช่องเอง) */
  dirty() {
    this.last = '#';
  }

  set(slot: Slot | null, selected: boolean) {
    const key = slot ? `${selected ? 1 : 0}|${slot.id}|${slot.qty}|${slot.dur ?? ''}|${slot.plus ?? ''}` : selected ? 's' : '-';
    if (key === this.last) return;
    this.last = key;
    this.sel.setVisible(selected);
    if (!slot) {
      showItemIcon(this.icon, this.art, null, 0);
      this.bandFrame.setVisible(false);
      this.lvT.setVisible(false);
      this.qty.setText('');
      this.durBg.setVisible(false);
      this.dur.setVisible(false);
      return;
    }
    const def = ITEMS[slot.id];
    // เลเวลอัพเกรด: ไอคอนโฉมใหม่ (Lv4/7/10) + กรอบสี + ป้าย Lv
    const lv = def.enhanceable ? levelOfSlot(slot) : 1;
    const band = bandOf(lv);
    // ภาพวาดมุมมนเต็มช่อง (เว้นขอบช่อง) · ไม่มีภาพ = ไอคอนพิกเซลขยายเลขเต็ม (×2 สำหรับไอคอน 16px)
    showItemIcon(this.icon, this.art, slot.id, this.size - 8, this.size - 4, variantKey(this.icon.scene, def.icon, band));
    this.bandFrame.setVisible(!!band);
    if (band) this.bandFrame.setStrokeStyle(band === 'legend' ? 2 : 1, BAND_INFO[band].color, 0.95);
    this.lvT.setVisible(lv > 1);
    if (lv > 1) this.lvT.setText(`Lv${lv}`).setColor(band ? BAND_INFO[band].css : COLORS.good);
    this.qty.setText(slot.qty > 1 ? String(slot.qty) : '');
    const max0 = def.tool?.durability ?? def.light?.durability ?? def.equip?.durability ?? def.ranged?.durability;
    const max = max0 && def.enhanceable ? max0 * itemDurMult(lv) : max0;
    if (max && slot.dur !== undefined) {
      const r = Phaser.Math.Clamp(slot.dur / max, 0, 1);
      this.durBg.setVisible(true);
      this.dur.setVisible(true).setSize((this.size - 12) * r, 3).setFillStyle(r > 0.5 ? 0xa7f070 : r > 0.2 ? 0xffcd75 : 0xb13e53);
    } else {
      this.durBg.setVisible(false);
      this.dur.setVisible(false);
    }
  }
}
