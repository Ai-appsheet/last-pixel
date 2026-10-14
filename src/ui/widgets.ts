import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import type { Slot } from '../components/Inventory';
import { Sfx } from '../core/AudioManager';
import { BAND_INFO, bandOf, itemDurMult, levelOfSlot } from '../data/upgrade';
import { variantKey } from '../gfx/UpgradeLook';

/** ฟอนต์เกม: Chakra Petch (รองรับไทย ทรงเหลี่ยมแบบเกม) + Press Start 2P สำหรับโลโก้/ตัวเลข */
export const FONT = '"Chakra Petch", Kanit, Thonburi, Tahoma, sans-serif';
export const PIXEL_FONT = '"Press Start 2P", monospace';

export const COLORS = {
  panel: 0x1a1c2c,
  panelLight: 0x333c57,
  border: 0x566c86,
  highlight: 0xffcd75,
  text: '#f4f4f4',
  dim: '#a9bccb',
  gold: '#ffcd75',
  good: '#a7f070',
  bad: '#ef7d57',
};

type Style = Phaser.Types.GameObjects.Text.TextStyle;

/** จอเล็ก (มือถือ): ซีนที่ขยายตัวหนังสือที่เล็กกว่า 14px ให้อ่านออก — ตั้งจาก ui/layout.ts applyUiScale()
 *  (แยกต่อซีน: ตัวหนังสือในโลกเกม เช่น ป้ายชื่อคู่แข่ง ไม่โดนขยาย) */
const boostScenes = new WeakSet<Phaser.Scene>();
export function setTextBoost(scene: Phaser.Scene, on: boolean) {
  if (on) boostScenes.add(scene);
  else boostScenes.delete(scene);
}
/** ขนาดตัวหนังสือจริงหลังขยาย (9→11, 10→11.5, 11→12, 12→13, 13→13.5) */
export function boosted(scene: Phaser.Scene, size: number) {
  return size < 14 && boostScenes.has(scene) ? Math.round((size + (14 - size) * 0.4) * 2) / 2 : size;
}

/** ข้อความคมชัด มีเส้นขอบ + เงา แบบเกม */
export function txt(scene: Phaser.Scene, x: number, y: number, text: string, size0 = 16, color = COLORS.text, extra: Style = {}) {
  const size = boosted(scene, size0);
  const t = scene.add.text(x, y, text, {
    fontFamily: FONT,
    fontSize: `${size}px`,
    fontStyle: '700',
    color,
    stroke: '#0b0d1f',
    strokeThickness: Math.max(3, Math.round(size / 5)),
    resolution: 2,
    ...extra,
  });
  t.setShadow(0, Math.max(2, Math.round(size / 10)), '#0b0d1f', 0, true, true);
  t.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return t;
}

/** หัวข้อไล่สีทอง → ส้ม */
export function heading(scene: Phaser.Scene, x: number, y: number, text: string, size = 32, pixel = false) {
  const t = txt(scene, x, y, text, size, COLORS.gold, pixel ? { fontFamily: PIXEL_FONT, fontStyle: 'normal' } : {});
  const grad = t.context.createLinearGradient(0, 0, 0, t.height);
  grad.addColorStop(0, '#fff2b0');
  grad.addColorStop(0.5, '#ffcd75');
  grad.addColorStop(1, '#ef7d57');
  t.setFill(grad);
  return t;
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

/** ปุ่ม pixel: ไม้ปกติ / ส้มตอนชี้ / เทาตอนกดไม่ได้ */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number,
  label: string, onClick: () => void, enabled = true, size = 18,
): Button {
  const bg = scene.add.nineslice(x, y, enabled ? 'ui_btn' : 'ui_btn_off', undefined, w, h, 8, 8, 8, 8);
  const hover = scene.add.nineslice(x, y, 'ui_btn_hover', undefined, w, h, 8, 8, 8, 8).setVisible(false);
  const t = txt(scene, x, y - 1, label, size, enabled ? COLORS.text : '#8a95a8').setOrigin(0.5);
  if (enabled) {
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
        onClick();
      });
  }
  return { bg, hover, t, objects: [bg, hover, t], setLabel: (s) => t.setText(s) };
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
    this.icon = scene.add.image(x, y - 1, 'px').setVisible(false);
    this.qty = txt(scene, x + size / 2 - 4, y + size / 2 - 2, '', 13).setOrigin(1, 1);
    this.durBg = scene.add.rectangle(x - size / 2 + 6, y + size / 2 - 7, size - 12, 3, 0x0b0d1f).setOrigin(0, 0.5).setVisible(false);
    this.dur = scene.add.rectangle(x - size / 2 + 6, y + size / 2 - 7, size - 12, 3, 0xa7f070).setOrigin(0, 0.5).setVisible(false);
    if (label) this.label = txt(scene, x - size / 2 + 5, y - size / 2 + 2, label, 11, COLORS.dim);
    this.bandFrame = scene.add.rectangle(x, y, size - 6, size - 6).setStrokeStyle(2, 0xffcd75, 0.9).setVisible(false);
    this.lvT = txt(scene, x + size / 2 - 3, y - size / 2 + 1, '', size >= 40 ? 10 : 9, COLORS.good).setOrigin(1, 0).setVisible(false);
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.bg, this.sel, this.bandFrame, this.icon, this.qty, this.durBg, this.dur, ...(this.label ? [this.label] : []), this.lvT];
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
      this.icon.setVisible(false);
      this.bandFrame.setVisible(false);
      this.lvT.setVisible(false);
      this.qty.setText('');
      this.durBg.setVisible(false);
      this.dur.setVisible(false);
      return;
    }
    const def = ITEMS[slot.id];
    const tex = this.icon.scene.textures.get(def.icon).getSourceImage();
    const scale = Math.max(1, Math.floor(((this.size - 12) / Math.max(tex.width, tex.height)) * 2) / 2);
    // เลเวลอัพเกรด: ไอคอนโฉมใหม่ (Lv4/7/10) + กรอบสี + ป้าย Lv
    const lv = def.enhanceable ? levelOfSlot(slot) : 1;
    const band = bandOf(lv);
    this.icon.setTexture(variantKey(this.icon.scene, def.icon, band)).setVisible(true).setScale(scale);
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
