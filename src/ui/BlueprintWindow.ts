import Phaser from 'phaser';
import { blueprintSource, bpKeyBuild, bpKeyRecipe } from '../data/blueprints';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { BUILD, BUILDABLES, CATEGORY_NAMES, type BuildCategory, type BuildDef } from '../data/buildables';
import { itemInfo, itemSources } from '../data/encyclopedia';
import { statLine, type EquipSlot } from '../data/equipment';
import { ITEMS, type ItemType } from '../data/items';
import { RARITY } from '../data/loot';
import { RECIPES, STATION_NAMES, type Recipe } from '../data/recipes';
import type { GameScene } from '../scenes/GameScene';
import { affordableTimes, craft, isHiddenRecipe, isPart, missingRaw, planConsume, rawCost, recipeNeeds, type MaterialPool } from '../systems/CraftingSystem';
import { fitText } from './fancyButton';
import { UIWindow } from './Window';
import { placeArtCover, withItemArt, withItemThumb } from './itemArt';
import { COLORS, txt } from './widgets';

/**
 * 📐 สมุดแปลน — รวม "สร้างสิ่งก่อสร้าง" + "คราฟต์ไอเทม/อาวุธ" ไว้ที่เดียว
 * ซ้าย: การ์ดแปลน (เลื่อนได้) · ขวา: กระดาษแปลนสีน้ำเงิน + เช็กลิสต์ของที่ต้องหา + ปุ่ม "สร้างเลย"
 */
export type BlueprintSection = 'build' | 'items';
type ItemGroup = 'weapon' | 'tool' | 'armor' | 'food' | 'material';

const BUILD_TABS: BuildCategory[] = ['building', 'structure', 'furniture', 'machine', 'defense', 'farm', 'boat', 'terrain'];
const BUILD_LABEL: Partial<Record<BuildCategory, string>> = { building: 'บ้าน/อาคาร' };
const ITEM_TABS: [ItemGroup, string][] = [['weapon', 'อาวุธ'], ['tool', 'เครื่องมือ'], ['armor', 'ชุด/อุปกรณ์'], ['food', 'อาหาร/ยา'], ['material', 'วัตถุดิบ']];
const GROUP_OF: Partial<Record<ItemType, ItemGroup>> = {
  weapon: 'weapon', ranged: 'weapon', throw: 'weapon', ammo: 'weapon',
  tool: 'tool', rod: 'tool', light: 'tool', armor: 'armor', food: 'food', heal: 'food',
};

// ---- ขนาด (พิกัดใน body ของหน้าต่าง) ----
const WIN_W = 920;
const WIN_H = 478;
const BODY_H = WIN_H - UIWindow.HEAD - 18;
const GRID_W = 470;
const GRID_TOP = 76;
const GRID_H = BODY_H - GRID_TOP;
const CARD_W = 112;
const CARD_H = 90;
const PITCH_X = 117;
const PITCH_Y = 96;
const COLS = 4;
const PX = 482;
const PW = WIN_W - 32 - PX;
const PH = BODY_H - 50;
const MAX_ROWS = 7;

// ---- สีกระดาษแปลน ----
const PAPER = 0x1d3466;
const GRID_LINE = 0x41a6f6;
const CYAN = 0x73eff7;
const CYAN_S = '#73eff7';
const GREEN = 0x38b764;

interface Blueprint {
  key: string;
  section: BlueprintSection;
  tab: string;
  name: string;
  color: string;
  tex: string;
  frame?: number;
  qty: number;
  tag: string;
  no: number;
  build?: BuildDef;
  recipe?: Recipe;
}

interface Req {
  icon: string;
  frame?: number;
  name: string;
  have: number;
  need: number;
  ok: boolean;
  /** item = วัตถุดิบ, station = สถานีคราฟต์, lock = ยังไม่มีแปลน */
  item?: string;
  /** จำนวนที่จะหยิบจากหีบ/โกดัง (ไม่ได้อยู่ในกระเป๋า) */
  stored?: number;
  station?: string;
  lock?: string;
}

interface Eval {
  bp: Blueprint;
  reqs: Req[];
  progress: number;
  ready: boolean;
  matsOk: boolean;
  /** รู้แปลนแล้วหรือยัง */
  known: boolean;
  /** ชิ้นส่วนกลางในกระเป๋าที่จะถูกใช้ก่อน */
  parts: [string, number][];
}

/** ย่อข้อความให้พอดีความกว้าง (ตัดท้ายแล้วเติม …) */
function clip(t: Phaser.GameObjects.Text, s: string, maxW: number) {
  t.setText(s);
  if (t.width <= maxW) return;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    t.setText(`${s.slice(0, mid)}…`);
    if (t.width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  t.setText(`${s.slice(0, lo)}…`);
}

/** ตั้งรูปให้พอดีกรอบ (pixel art ขยายเป็นเลขเต็ม) */
function fitImage(img: Phaser.GameObjects.Image, key: string, frame: number | undefined, maxW: number, maxH: number, maxScale: number) {
  const scene = img.scene;
  if (!scene.textures.exists(key)) key = 'px';
  img.setTexture(key, frame);
  const f = img.frame;
  let s = Math.min(maxW / f.width, maxH / f.height, maxScale);
  if (s >= 1) s = Math.floor(s * 2) / 2;
  img.setScale(s);
}

/** ปุ่มไม้แบบเกม (ใช้เป็นแท็บได้: active = ไฮไลต์ค้าง) + ตัวเลขป้ายเขียว */
class Btn {
  readonly bg: Phaser.GameObjects.NineSlice;
  readonly hover: Phaser.GameObjects.NineSlice;
  readonly t: Phaser.GameObjects.Text;
  readonly badge: Phaser.GameObjects.Text;
  private over = false;
  private active = false;
  private shown = true;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly w: number, h: number, label: string, size: number, onClick: () => void) {
    this.bg = scene.add.nineslice(x + w / 2, y + h / 2, 'ui_btn', undefined, w, h, 8, 8, 8, 8).setInteractive({ useHandCursor: true });
    this.hover = scene.add.nineslice(x + w / 2, y + h / 2, 'ui_btn_hover', undefined, w, h, 8, 8, 8, 8).setVisible(false);
    this.t = txt(scene, x + w / 2, y + h / 2 - 1, label, size).setOrigin(0.5);
    fitText(this.t, w - 8);
    this.badge = txt(scene, x + w - 1, y - 3, '', 9).setOrigin(1, 0).setBackgroundColor('#38b764').setPadding(3, 0, 3, 0).setVisible(false);
    this.bg
      .on('pointerover', () => {
        this.over = true;
        this.hover.setVisible(true);
      })
      .on('pointerout', () => {
        this.over = false;
        this.hover.setVisible(this.active);
      })
      .on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        onClick();
      });
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.bg, this.hover, this.t, this.badge];
  }

  setLabel(s: string) {
    if (this.t.text === s) return;
    this.t.setText(s);
    fitText(this.t, this.w - 8);
  }

  setActive(a: boolean) {
    this.active = a;
    this.hover.setVisible(a || this.over);
    this.t.setColor(a ? COLORS.gold : COLORS.text);
  }

  setBadge(n: number) {
    const s = n > 0 ? String(n) : '';
    if (this.badge.text !== s) this.badge.setText(s);
    this.badge.setVisible(this.shown && n > 0);
  }

  setVisible(v: boolean) {
    this.shown = v;
    this.bg.setVisible(v);
    this.t.setVisible(v);
    this.hover.setVisible(v && (this.active || this.over));
    if (!v) this.badge.setVisible(false);
  }
}

/** ปุ่มหลักสีเขียว (วาดด้วย Graphics) — กดไม่ได้ = สีเทา */
class PrimaryBtn {
  private g: Phaser.GameObjects.Graphics;
  private t: Phaser.GameObjects.Text;
  private zone: Phaser.GameObjects.Zone;
  enabled = false;
  private over = false;

  constructor(scene: Phaser.Scene, private x: number, private y: number, private w: number, private h: number, size: number, onClick: () => void) {
    this.g = scene.add.graphics();
    this.t = txt(scene, x + w / 2, y + h / 2 - 1, '', size).setOrigin(0.5);
    this.zone = scene.add.zone(x, y, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    this.zone
      .on('pointerover', () => {
        this.over = true;
        this.draw();
      })
      .on('pointerout', () => {
        this.over = false;
        this.draw();
      })
      .on('pointerdown', () => {
        Sfx.unlock();
        if (this.enabled) onClick();
        else Sfx.play('error', 200);
      });
    this.draw();
  }

  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.g, this.t, this.zone];
  }

  set(enabled: boolean, label: string) {
    const changed = enabled !== this.enabled;
    this.enabled = enabled;
    if (this.t.text !== label) {
      this.t.setText(label);
      fitText(this.t, this.w - 16);
    }
    if (changed) this.draw();
  }

  setVisible(v: boolean) {
    this.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v));
  }

  /** เปลี่ยนความกว้าง (ปุ่มคราฟต์ ×1 แคบลงเมื่อมีปุ่ม ×5/×สูงสุด) */
  setWidth(w: number) {
    if (w === this.w) return;
    this.w = w;
    this.zone.setSize(w, this.h);
    (this.zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(w, this.h);
    this.t.setX(this.x + w / 2);
    fitText(this.t, w - 16);
    this.draw();
  }

  private draw() {
    const { x, y, w, h } = this;
    const fill = !this.enabled ? 0x333c57 : this.over ? 0x4fcf78 : GREEN;
    const line = !this.enabled ? 0x566c86 : 0xa7f070;
    this.g.clear();
    this.g.fillStyle(0x0b0d1f, 0.85).fillRoundedRect(x, y + 3, w, h, 7);
    this.g.fillStyle(fill, 1).fillRoundedRect(x, y, w, h, 7);
    this.g.fillStyle(0xffffff, this.enabled ? 0.2 : 0.06).fillRoundedRect(x + 4, y + 3, w - 8, h * 0.38, 5);
    this.g.lineStyle(2, line, 1).strokeRoundedRect(x, y, w, h, 7);
    this.t.setColor(this.enabled ? '#ffffff' : '#a9bccb').setY(y + h / 2 - (this.over && this.enabled ? 2 : 1));
  }
}

interface Card {
  c: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.NineSlice;
  sel: Phaser.GameObjects.NineSlice;
  glow: Phaser.GameObjects.Rectangle;
  img: Phaser.GameObjects.Image;
  /** ภาพวาดของแปลน (แทน img เมื่อโหลดแล้ว) */
  art: Phaser.GameObjects.Image;
  artId: string;
  qty: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  barBg: Phaser.GameObjects.Rectangle;
  bar: Phaser.GameObjects.Rectangle;
  pct: Phaser.GameObjects.Text;
  badgeBg: Phaser.GameObjects.Rectangle;
  badge: Phaser.GameObjects.Text;
}

interface Row {
  hit: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
  jump: string | null;
}

export class BlueprintWindow {
  readonly win: UIWindow;
  section: BlueprintSection = 'build';
  private tab: Record<BlueprintSection, string> = { build: 'building', items: 'weapon' };
  private sel: Record<BlueprintSection, string | null> = { build: null, items: null };
  private onlyReady = false;

  private bps: Blueprint[] = [];
  private byKey = new Map<string, Blueprint>();
  private evals = new Map<string, Eval>();
  private list: Eval[] = [];
  private stations = new Set<string>();
  private srcCache = new Map<string, string>();
  private dataKey = '';
  private viewKey = '';
  private detailKey = '';
  private lastTabKey = '';
  private reveal = false;

  // ---- ส่วนประกอบ ----
  private secBtns: Record<BlueprintSection, Btn>;
  private subBtns: { section: BlueprintSection; id: string; b: Btn }[] = [];
  private chip: Btn;
  private gridC: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private cards: Card[] = [];
  private empty: Phaser.GameObjects.Text;
  private thumb: Phaser.GameObjects.Rectangle;
  private track: Phaser.GameObjects.Rectangle;
  private scroll = 0;
  private maxScroll = 0;
  private press: { y: number; scroll: number; card: number } | null = null;
  private dragged = false;

  private preview: Phaser.GameObjects.Image;
  /** ภาพวาดของแปลนที่เลือก (ถ้ามี) — วางทับไอคอนพิกเซล */
  private artPic?: Phaser.GameObjects.Image;
  private artFor: unknown = null;
  private dims: Phaser.GameObjects.Text;
  private sheetNo: Phaser.GameObjects.Text;
  private title: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private desc: Phaser.GameObjects.Text;
  private stats: Phaser.GameObjects.Text;
  private reqHead: Phaser.GameObjects.Text;
  private reqSum: Phaser.GameObjects.Text;
  private reqLine: Phaser.GameObjects.Graphics;
  private rows: Row[] = [];
  private notes: Phaser.GameObjects.Text;
  private placeholder: Phaser.GameObjects.Text;
  private detailParts: Phaser.GameObjects.GameObject[] = [];

  private goBuild: PrimaryBtn;
  private goItem: PrimaryBtn;
  private go5: Btn;
  private goMax: Btn;
  private pin: Btn;
  /** วัตถุดิบ: กระเป๋า + คลังในฐาน (คำนวณครั้งเดียวต่อรอบ refresh) */
  private pool: MaterialPool | null = null;
  private demo: Btn;
  private fix: Btn;
  /** ⬆ อัพเกรดชิ้นที่ถือ/สวมอยู่ (ไอเทม) หรือหลังที่ใกล้ที่สุด (สิ่งก่อสร้าง) */
  private upBtn: Btn;
  private upRun: (() => void) | null = null;

  constructor(private scene: Phaser.Scene, private gs: GameScene, private toast: (text: string, color?: string) => void) {
    this.collect();
    const w = (this.win = new UIWindow(scene, 20, 58, WIN_W, WIN_H, '📐 สมุดแปลน (B)'));

    // ---- แถวบน: หมวดหลัก + ตัวกรอง ----
    this.secBtns = {
      build: new Btn(scene, 0, 0, 150, 32, '🏠 สิ่งก่อสร้าง', 13, () => this.setSection('build')),
      items: new Btn(scene, 154, 0, 150, 32, '⚔ ไอเทม/อาวุธ', 13, () => this.setSection('items')),
    };
    this.chip = new Btn(scene, 310, 0, GRID_W - 310, 32, '', 11, () => {
      this.onlyReady = !this.onlyReady;
      this.refresh();
    });

    // ---- แท็บย่อย ----
    // ความกว้างแท็บตามความยาวชื่อ (ชื่อยาวได้ที่มากกว่า)
    const subRow = (section: BlueprintSection, tabs: [string, string][]) => {
      const probe = txt(scene, 0, 0, '', 11);
      const tw = tabs.map(([, label]) => probe.setText(label).width + 10);
      probe.destroy();
      const room = GRID_W - (tabs.length - 1) * 3;
      const extra = Math.max(0, room - tw.reduce((a, b) => a + b, 0)) / tabs.length;
      const k = Math.min(1, room / tw.reduce((a, b) => a + b, 0));
      let x = 0;
      tabs.forEach(([id, label], i) => {
        const bw = Math.floor(tw[i] * k + extra);
        const b = new Btn(scene, x, 38, bw, 32, label, 11, () => {
          this.tab[section] = id;
          this.refresh();
        });
        x += bw + 3;
        this.subBtns.push({ section, id, b });
      });
    };
    subRow('build', BUILD_TABS.map((c) => [c, BUILD_LABEL[c] ?? CATEGORY_NAMES[c]]));
    subRow('items', ITEM_TABS);

    // ---- ตารางการ์ด (เลื่อนด้วยการลาก/ล้อเมาส์ + mask) ----
    const zone = scene.add.zone(0, GRID_TOP, GRID_W, GRID_H).setOrigin(0).setInteractive();
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.pressGrid(p, -1));
    this.gridC = scene.add.container(0, GRID_TOP);
    this.maskG = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, 0, GRID_W, GRID_H);
    this.gridC.setMask(this.maskG.createGeometryMask());
    const pool = Math.max(...[...BUILD_TABS, ...ITEM_TABS.map(([id]) => id)].map((t) => this.bps.filter((b) => b.tab === t).length));
    for (let i = 0; i < pool; i++) this.cards.push(this.makeCard(i));
    this.track = scene.add.rectangle(GRID_W - 3, GRID_TOP, 4, GRID_H, 0x0b0d1f, 0.5).setOrigin(0.5, 0);
    this.thumb = scene.add.rectangle(GRID_W - 3, GRID_TOP, 4, 40, 0xffcd75, 0.9).setOrigin(0.5, 0);
    this.empty = txt(scene, GRID_W / 2, GRID_TOP + 60, '', 13, COLORS.dim, { align: 'center', wordWrap: { width: GRID_W - 60 } }).setOrigin(0.5, 0);

    // ---- กระดาษแปลน ----
    const paper = this.drawPaper();
    this.sheetNo = txt(scene, PX + PW - 16, 12, '', 9, CYAN_S).setOrigin(1, 0).setAlpha(0.85);
    this.preview = scene.add.image(PX + 62, 60, 'px');
    this.dims = txt(scene, PX + 62, 108, '', 10, CYAN_S).setOrigin(0.5, 0);
    this.title = txt(scene, PX + 120, 16, '', 18);
    this.sub = txt(scene, PX + 120, 41, '', 11, CYAN_S);
    this.desc = txt(scene, PX + 120, 58, '', 12, COLORS.text, { wordWrap: { width: PW - 138 }, lineSpacing: 1, maxLines: 3 });
    this.stats = txt(scene, PX + 18, 124, '', 11, COLORS.gold, { wordWrap: { width: PW - 36 }, lineSpacing: 1, maxLines: 3 });
    this.reqHead = txt(scene, PX + 18, 0, '📋 ต้องใช้', 13);
    this.reqSum = txt(scene, PX + PW - 18, 0, '', 11).setOrigin(1, 0);
    this.reqLine = scene.add.graphics();
    for (let i = 0; i < MAX_ROWS; i++) this.rows.push(this.makeRow());
    this.notes = txt(scene, PX + 18, 0, '', 10, COLORS.dim, { wordWrap: { width: PW - 36 }, lineSpacing: 1 });
    this.placeholder = txt(scene, PX + PW / 2, PH / 2, 'เลือกแปลนทางซ้าย\nเพื่อดูว่าต้องหาอะไรบ้าง', 14, CYAN_S, { align: 'center' }).setOrigin(0.5);
    this.detailParts = [this.sheetNo, this.preview, this.dims, this.title, this.sub, this.desc, this.stats, this.reqHead, this.reqSum, this.reqLine, this.notes];

    // ---- ปุ่มล่าง ----
    const by = PH + 6;
    this.goBuild = new PrimaryBtn(scene, PX, by, 210, 40, 16, () => this.go(1));
    this.demo = new Btn(scene, PX + 214, by, 96, 40, '🔨 รื้อ (X)', 13, () => {
      this.gs.build.toggleDemolish();
      if (this.gs.build.demolish) this.hideForPlacing();
    });
    this.fix = new Btn(scene, PX + 314, by, PW - 314, 40, '🔧 ซ่อม', 13, () => this.gs.repairAll());
    this.goItem = new PrimaryBtn(scene, PX, by, 196, 40, 16, () => this.go(1));
    this.go5 = new Btn(scene, PX + 200, by, 98, 40, '×5', 15, () => this.go(5));
    this.goMax = new Btn(scene, PX + 302, by, PW - 302, 40, '×สูงสุด', 13, () => this.go(-1));
    // 📌 ปักหมุด: HUD แสดงของที่ยังขาด (นับรวมของในคลัง) — สร้างเสร็จแล้วเลิกปักเอง
    this.pin = new Btn(scene, PX + PW - 54, 30, 38, 26, '📌', 13, () => this.togglePin());
    this.upBtn = new Btn(scene, PX + PW - 214, PH - 42, 200, 28, '⬆ อัพเกรด', 12, () => {
      this.upRun?.();
      this.detailKey = '';
    });
    this.upBtn.setVisible(false);

    w.add([
      ...this.secBtns.build.objects, ...this.secBtns.items.objects, ...this.chip.objects,
      zone, this.gridC, this.track, this.thumb, this.empty,
      ...this.subBtns.flatMap((s) => s.b.objects),
      paper, ...this.detailParts, ...this.rows.flatMap((r) => [r.hit, r.icon, r.name, r.count, r.hint]), this.placeholder,
      ...this.goBuild.objects, ...this.demo.objects, ...this.fix.objects, ...this.goItem.objects, ...this.go5.objects, ...this.goMax.objects, ...this.upBtn.objects, ...this.pin.objects,
    ]);
    w.onClose = () => this.gs.build.cancel();

    // ลาก/ล้อเมาส์เลื่อนการ์ด · mask ตามตำแหน่งหน้าต่าง
    const input = scene.input;
    const move = (p: Phaser.Input.Pointer) => {
      if (!this.press || !p.isDown) return;
      const dy = p.y - this.press.y;
      if (Math.abs(dy) > 6) this.dragged = true;
      if (this.dragged) this.setScroll(this.press.scroll - dy);
    };
    const up = () => {
      if (!this.press) return;
      const i = this.press.card;
      if (!this.dragged && i >= 0 && this.list[i]) this.select(this.list[i].bp.key);
      this.press = null;
    };
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.win.visible && !this.win.collapsed && this.inGrid(p)) this.setScroll(this.scroll + dy * 0.5);
    };
    const sync = () => {
      if (!this.win.visible) return;
      this.maskG.setPosition(this.win.root.x + this.win.body.x, this.win.root.y + this.win.body.y + GRID_TOP);
    };
    input.on('pointermove', move);
    input.on('pointerup', up);
    input.on('pointerupoutside', up);
    input.on('wheel', wheel);
    scene.events.on('update', sync);
    scene.events.once('shutdown', () => {
      input.off('pointermove', move);
      input.off('pointerup', up);
      input.off('pointerupoutside', up);
      input.off('wheel', wheel);
      scene.events.off('update', sync);
      this.maskG.destroy();
    });
  }

  // ======================================================================
  // API (UIScene เรียก)
  // ======================================================================
  /** เปิดที่หมวดนั้น (ถ้าเปิดหมวดนั้นอยู่แล้ว = ปิด) */
  toggle(section: BlueprintSection) {
    if (this.win.visible && !this.win.collapsed && this.section === section) this.win.close();
    else this.show(section);
  }

  show(section: BlueprintSection) {
    this.section = section;
    if (this.win.collapsed) this.win.toggleCollapse();
    if (!this.win.visible) this.win.open();
    this.refresh();
  }

  /** เรียกทุก ~150ms จาก register() — สร้างการ์ดใหม่เฉพาะตอนข้อมูล/แท็บเปลี่ยน */
  refresh() {
    const gs = this.gs;
    const inv = gs.player.inventory;
    this.stations = gs.ownStations();
    const pool = (this.pool = gs.materials());
    const dk = `${inv.version}|${pool.stores.length}:${pool.version}|${[...this.stations].sort().join(',')}|${gs.creative}|${this.mc()}|${gs.learned.size}`;
    if (dk !== this.dataKey) {
      this.dataKey = dk;
      this.evals.clear();
      for (const bp of this.bps) this.evals.set(bp.key, this.evaluate(bp));
    }
    const vk = `${dk}|${this.section}|${this.tab[this.section]}|${this.onlyReady}`;
    if (vk !== this.viewKey) {
      this.viewKey = vk;
      this.rebuild();
    }
    const sk = `${vk}|${this.sel[this.section]}|${gs.pinned}`;
    if (sk !== this.detailKey) {
      this.detailKey = sk;
      this.drawDetail();
      const key = this.sel[this.section];
      this.list.forEach((e, i) => this.cards[i].sel.setVisible(e.bp.key === key));
    }
    if (this.section === 'build') {
      const broken = gs.damagedCount();
      this.fix.setLabel(broken ? `🔧 ซ่อม (${broken})` : '🔧 ซ่อม');
      this.demo.setActive(gs.build.demolish);
    }
  }

  // ======================================================================
  // ข้อมูล
  // ======================================================================
  private collect() {
    let n = 0;
    for (const b of BUILDABLES) {
      this.bps.push({ key: `b:${b.id}`, section: 'build', tab: b.category, name: b.name, color: COLORS.text, tex: b.texture, frame: b.frame, qty: 1, tag: '', no: ++n, build: b });
    }
    RECIPES.forEach((r, i) => {
      if (isHiddenRecipe(r)) return; // ชิ้นส่วนกลาง (เชือก ไม้กระดาน แท่งเหล็ก …) ไม่ต้องทำเอง
      const d = ITEMS[r.output.item];
      const tab = GROUP_OF[d.type] ?? (d.equip ? 'armor' : 'material');
      this.bps.push({
        key: `r:${i}`, section: 'items', tab, name: d.name, color: RARITY[d.rarity ?? 'common'].color, tex: d.icon, qty: r.output.qty,
        tag: [r.station === 'none' ? '' : STATION_NAMES[r.station], r.id.includes('#') ? 'สูตรทางเลือก' : ''].filter(Boolean).join(' · '), no: ++n, recipe: r,
      });
    });
    for (const bp of this.bps) this.byKey.set(bp.key, bp);
  }

  private mc() {
    return this.gs.player.char.passive.materialCost ?? 1;
  }

  private evaluate(bp: Blueprint): Eval {
    const gs = this.gs;
    const inv = (this.pool ??= gs.materials());
    const bag = gs.player.inventory;
    const reqs: Req[] = [];
    let matsOk = true;
    // ต้องมีแปลนก่อน (ของขั้นสูงหาจากกล่อง)
    const bpKey = bp.build ? bpKeyBuild(bp.build) : bpKeyRecipe(bp.recipe!);
    const known = gs.knows(bpKey);
    if (!known) reqs.push({ icon: bp.build ? 'i_blueprint_b' : 'i_blueprint', name: '🔒 ต้องมีแปลนนี้ก่อน', have: 0, need: 1, ok: false, lock: blueprintSource(bpKey) });
    // แปลนบอกแต่ของดิบ — ตอนสร้างจริงใช้ชิ้นส่วนที่มีอยู่ในกระเป๋าก่อน ส่วนที่ขาดค่อยหักของดิบ
    const needs = bp.build ? gs.buildNeeds(bp.build) : recipeNeeds(bp.recipe!, this.mc());
    const free = !!bp.build && gs.creative;
    const plan = planConsume(needs, inv);
    if (!free && !plan.ok) matsOk = false;
    for (const [item, need] of rawCost(needs)) {
      const miss = free ? 0 : plan.missing.get(item) ?? 0;
      const have = Math.max(inv.count(item), need - miss);
      reqs.push({ icon: ITEMS[item].icon, name: ITEMS[item].name, have, need, ok: miss <= 0, item, stored: free ? 0 : Math.max(0, Math.min(need, have) - bag.count(item)) });
    }
    // สถานี: แค่ต้อง "มี" บนเกาะของเรา ไม่ต้องยืนใกล้
    const st = bp.recipe?.station;
    if (st && st !== 'none' && !this.stations.has(st)) {
      const sb = BUILD[st];
      reqs.push({ icon: sb?.texture ?? 'px', frame: sb?.frame, name: `🔒 ต้องมี${STATION_NAMES[st]}บนเกาะ`, have: 0, need: 1, ok: false, station: st });
    }
    const parts = free ? [] : [...plan.take].filter(([id]) => isPart(id));
    const progress = reqs.length ? reqs.reduce((s, q) => s + (q.ok ? 1 : Math.min(1, q.have / Math.max(1, q.need))), 0) / reqs.length : 1;
    return { bp, reqs, progress: known ? progress : 0, ready: reqs.every((q) => q.ok), matsOk, known, parts };
  }

  /** แหล่งที่หาได้ (ย่อให้สั้น) — แคชไว้เพราะข้อมูลคงที่ */
  private source(item: string) {
    let s = this.srcCache.get(item);
    if (s === undefined) {
      s = itemSources(item)
        .slice(0, 2)
        .map((x) => {
          const y = x.replace(/^\S+\s/, '').replace(/\s*\(.*?\)/g, '');
          return y.startsWith('คราฟต์') ? y.split(':')[0] : y.split(' — ')[0];
        })
        .join(' · ');
      this.srcCache.set(item, s);
    }
    return s;
  }

  /** แปลนที่สร้างวัตถุดิบนี้ได้ (แตะแถวเพื่อกระโดดไปดู) */
  private recipeKeyFor(item: string): string | null {
    const i = RECIPES.findIndex((r) => r.output.item === item);
    return i >= 0 && this.byKey.has(`r:${i}`) ? `r:${i}` : null;
  }

  // ======================================================================
  // ซ้าย: การ์ด
  // ======================================================================
  private setSection(s: BlueprintSection) {
    this.section = s;
    this.refresh();
  }

  private select(key: string) {
    this.sel[this.section] = key;
    Sfx.play('click');
    this.refresh();
  }

  /** กระโดดไปแปลนอื่น (เช่น แตะวัตถุดิบที่คราฟต์ได้) */
  private jump(key: string) {
    const bp = this.byKey.get(key);
    if (!bp) return;
    this.section = bp.section;
    this.tab[bp.section] = bp.tab;
    this.sel[bp.section] = key;
    if (this.onlyReady && !this.evals.get(key)?.ready) this.onlyReady = false;
    this.reveal = true;
    Sfx.play('click');
    this.refresh();
  }

  private makeCard(i: number): Card {
    const s = this.scene;
    const c = s.add.container((i % COLS) * PITCH_X, Math.floor(i / COLS) * PITCH_Y);
    const bg = s.add.nineslice(0, 0, 'ui_slot', undefined, CARD_W, CARD_H, 6, 6, 6, 6).setOrigin(0).setInteractive({ useHandCursor: true });
    const sel = s.add.nineslice(0, 0, 'ui_slot_sel', undefined, CARD_W, CARD_H, 6, 6, 6, 6).setOrigin(0).setVisible(false);
    const glow = s.add.rectangle(1, 1, CARD_W - 2, CARD_H - 2).setOrigin(0).setStrokeStyle(2, 0xa7f070, 0.9);
    const img = s.add.image(CARD_W / 2, 30, 'px');
    const art = s.add.image(0, 0, 'px').setVisible(false);
    const qty = txt(s, CARD_W - 6, 4, '', 11, COLORS.gold).setOrigin(1, 0).setStroke('#0b0d1f', 3);
    const tag = txt(s, 6, 4, '', 9, COLORS.dim).setStroke('#0b0d1f', 3);
    const name = txt(s, CARD_W / 2, 56, '', 11).setOrigin(0.5);
    const barBg = s.add.rectangle(10, 76, 64, 6, 0x0b0d1f).setOrigin(0, 0.5);
    const bar = s.add.rectangle(10, 76, 0, 6, 0xffcd75).setOrigin(0, 0.5);
    const pct = txt(s, 80, 76, '', 10, COLORS.dim).setOrigin(0, 0.5);
    const badgeBg = s.add.rectangle(CARD_W / 2, 76, CARD_W - 16, 16, GREEN).setStrokeStyle(1, 0xa7f070);
    const badge = txt(s, CARD_W / 2, 75, '✔ พร้อมสร้าง', 10, '#ffffff').setOrigin(0.5);
    c.add([bg, sel, glow, img, art, qty, tag, name, barBg, bar, pct, badgeBg, badge]);
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => this.pressGrid(p, i));
    this.gridC.add(c);
    return { c, bg, sel, glow, img, art, artId: '', qty, tag, name, barBg, bar, pct, badgeBg, badge };
  }

  private inGrid(p: Phaser.Input.Pointer) {
    const x = this.win.root.x + this.win.body.x;
    const y = this.win.root.y + this.win.body.y + GRID_TOP;
    return p.x >= x && p.x <= x + GRID_W && p.y >= y && p.y <= y + GRID_H;
  }

  private pressGrid(p: Phaser.Input.Pointer, card: number) {
    if (!this.inGrid(p)) return;
    this.press = { y: p.y, scroll: this.scroll, card };
    this.dragged = false;
  }

  private rebuild() {
    const sec = this.section;
    const tab = this.tab[sec];
    // ปุ่มแท็บ + ตัวเลขของที่พร้อมสร้าง
    const all = [...this.evals.values()];
    (['build', 'items'] as BlueprintSection[]).forEach((s) => {
      this.secBtns[s].setActive(s === sec);
      this.secBtns[s].setBadge(all.filter((e) => e.bp.section === s && e.ready).length);
    });
    for (const sb of this.subBtns) {
      const on = sb.section === sec;
      sb.b.setVisible(on);
      if (!on) continue;
      sb.b.setActive(sb.id === tab);
      sb.b.setBadge(all.filter((e) => e.bp.section === sec && e.bp.tab === sb.id && e.ready).length);
    }
    this.chip.setLabel(this.onlyReady ? '☑ แสดงเฉพาะที่สร้างได้' : '☐ แสดงเฉพาะที่สร้างได้');
    this.chip.setActive(this.onlyReady);
    const isBuild = sec === 'build';
    this.goBuild.setVisible(isBuild);
    this.demo.setVisible(isBuild);
    this.fix.setVisible(isBuild);
    this.goItem.setVisible(!isBuild);

    // รายการ: พร้อมสร้างก่อน → ความคืบหน้ามากก่อน
    this.list = all
      .filter((e) => e.bp.section === sec && e.bp.tab === tab && (!this.onlyReady || e.ready))
      .sort((a, b) => Number(b.ready) - Number(a.ready) || b.progress - a.progress || a.bp.no - b.bp.no);
    this.cards.forEach((cd, i) => {
      const e = this.list[i];
      if (!e) return;
      const bp = e.bp;
      fitImage(cd.img, bp.tex, bp.frame, bp.build ? 64 : 36, 38, bp.build ? 2 : 2.5);
      // ภาพวาดแทนตัวพิกเซลในเกม (ยังไม่รู้แปลน = มืดลง)
      const artId = bp.build ? bp.build.id : bp.recipe!.output.item;
      cd.artId = artId;
      cd.art.setVisible(false);
      cd.img.setVisible(true);
      withItemThumb(this.scene, artId, (k) => {
        if (cd.artId !== artId || !cd.c.active) return;
        cd.art.setTexture(k);
        placeArtCover(cd.art, 5, 5, CARD_W - 10, 44).setVisible(true).setTint(e.known ? 0xffffff : 0x5a6278);
        cd.img.setVisible(false);
      });
      cd.name.setText(`${e.known ? '' : '🔒 '}${bp.name}`).setColor(!e.known ? '#8a95a8' : bp.build ? (e.ready ? COLORS.good : COLORS.text) : bp.color);
      fitText(cd.name, CARD_W - 10);
      cd.qty.setText(bp.qty > 1 ? `×${bp.qty}` : '');
      cd.tag.setText(bp.tag);
      fitText(cd.tag, CARD_W - 34);
      cd.glow.setVisible(e.ready);
      cd.badge.setVisible(e.ready);
      cd.badgeBg.setVisible(e.ready);
      [cd.barBg, cd.bar, cd.pct].forEach((o) => o.setVisible(!e.ready));
      cd.bar.width = 64 * e.progress;
      cd.bar.setFillStyle(e.progress >= 0.5 ? 0xffcd75 : 0xef7d57);
      cd.pct.setText(`${Math.floor(e.progress * 100)}%`);
      cd.c.setAlpha(e.ready ? 1 : e.known ? 0.55 + e.progress * 0.35 : 0.4);
      if (!e.known) cd.pct.setText('🔒');
    });
    this.empty.setText(this.list.length ? '' : this.onlyReady ? 'ยังไม่มีแปลนที่วัสดุครบในหมวดนี้\nกด "แสดงเฉพาะที่สร้างได้" อีกครั้งเพื่อดูทั้งหมด' : 'ไม่มีแปลนในหมวดนี้');

    // เลือกอัตโนมัติ + รีเซ็ตการเลื่อนเมื่อเปลี่ยนแท็บ
    const tk = `${sec}|${tab}|${this.onlyReady}`;
    const key = this.sel[sec];
    if (!key || !this.list.some((e) => e.bp.key === key)) this.sel[sec] = this.list[0]?.bp.key ?? null;
    const rows = Math.ceil(this.list.length / COLS);
    this.maxScroll = Math.max(0, rows * PITCH_Y - 6 - GRID_H);
    if (tk !== this.lastTabKey) {
      this.lastTabKey = tk;
      this.scroll = 0;
    }
    if (this.reveal) {
      this.reveal = false;
      const idx = this.list.findIndex((e) => e.bp.key === this.sel[sec]);
      if (idx >= 0) this.scroll = Math.floor(idx / COLS) * PITCH_Y - 8;
    }
    this.setScroll(this.scroll);
  }

  private setScroll(v: number) {
    this.scroll = Phaser.Math.Clamp(v, 0, this.maxScroll);
    this.gridC.y = GRID_TOP - this.scroll;
    this.cards.forEach((cd, i) => {
      const top = Math.floor(i / COLS) * PITCH_Y - this.scroll;
      cd.c.setVisible(i < this.list.length && top + CARD_H > 0 && top < GRID_H);
    });
    const on = this.maxScroll > 0;
    this.track.setVisible(on);
    this.thumb.setVisible(on);
    if (on) {
      const th = Math.max(28, (GRID_H * GRID_H) / (GRID_H + this.maxScroll));
      this.thumb.height = th;
      this.thumb.y = GRID_TOP + (GRID_H - th) * (this.scroll / this.maxScroll);
    }
  }

  // ======================================================================
  // ขวา: กระดาษแปลน
  // ======================================================================
  private drawPaper() {
    const g = this.scene.add.graphics();
    g.fillStyle(0x0b0d1f, 0.6).fillRect(PX + 3, 4, PW, PH);
    g.fillStyle(PAPER, 1).fillRect(PX, 0, PW, PH);
    g.lineStyle(1, GRID_LINE, 0.14);
    for (let x = 12; x < PW; x += 12) g.lineBetween(PX + x, 0, PX + x, PH);
    for (let y = 12; y < PH; y += 12) g.lineBetween(PX, y, PX + PW, y);
    g.lineStyle(1, CYAN, 0.26);
    for (let x = 48; x < PW; x += 48) g.lineBetween(PX + x, 0, PX + x, PH);
    for (let y = 48; y < PH; y += 48) g.lineBetween(PX, y, PX + PW, y);
    // กรอบคู่ ขาว/ฟ้า + เครื่องหมายมุม
    g.lineStyle(2, 0xf4f4f4, 0.9).strokeRect(PX + 5, 5, PW - 10, PH - 10);
    g.lineStyle(1, CYAN, 0.75).strokeRect(PX + 9, 9, PW - 18, PH - 18);
    g.lineStyle(2, 0xf4f4f4, 1);
    for (const [cx, cy, sx, sy] of [[PX + 5, 5, 1, 1], [PX + PW - 5, 5, -1, 1], [PX + 5, PH - 5, 1, -1], [PX + PW - 5, PH - 5, -1, -1]]) {
      g.lineBetween(cx, cy, cx + sx * 14, cy);
      g.lineBetween(cx, cy, cx, cy + sy * 14);
    }
    // กรอบรูปตัวอย่าง (เส้นประ)
    const bx = PX + 18;
    const by = 16;
    const bs = 88;
    g.lineStyle(1, CYAN, 0.85);
    for (let d = 0; d < bs; d += 8) {
      const e = Math.min(d + 4, bs);
      g.lineBetween(bx + d, by, bx + e, by);
      g.lineBetween(bx + d, by + bs, bx + e, by + bs);
      g.lineBetween(bx, by + d, bx, by + e);
      g.lineBetween(bx + bs, by + d, bx + bs, by + e);
    }
    g.fillStyle(CYAN, 0.06).fillRect(bx, by, bs, bs);
    return g;
  }

  private makeRow(): Row {
    const s = this.scene;
    const row: Row = {
      hit: s.add.rectangle(PX + 14, 0, PW - 28, 34, 0xffffff, 0.05).setOrigin(0).setInteractive({ useHandCursor: true }),
      icon: s.add.image(PX + 32, 0, 'px'),
      name: txt(s, PX + 52, 0, '', 12),
      count: txt(s, PX + PW - 22, 0, '', 12).setOrigin(1, 0),
      hint: txt(s, PX + 52, 0, '', 10, COLORS.dim),
      jump: null,
    };
    row.hit.on('pointerdown', () => row.jump && this.jump(row.jump));
    return row;
  }

  private drawDetail() {
    const key = this.sel[this.section];
    const e = key ? this.evals.get(key) : undefined;
    const has = !!e;
    this.detailParts.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(has));
    this.artPic?.setVisible(has);
    this.placeholder.setVisible(!has);
    const btn = this.section === 'build' ? this.goBuild : this.goItem;
    // ×5 / ×สูงสุด เฉพาะของที่ซ้อนกองได้ (กระสุน อาหาร ของขว้าง ฯลฯ)
    const out = e?.bp.recipe ? ITEMS[e.bp.recipe.output.item] : undefined;
    const batch = this.section === 'items' && !!out && out.stack > 1;
    this.goItem.setWidth(batch ? 196 : PW);
    this.go5.setVisible(batch);
    this.goMax.setVisible(batch);
    this.pin.setVisible(has);
    if (!e) {
      this.rows.forEach((r) => [r.hit, r.icon, r.name, r.count, r.hint].forEach((o) => o.setVisible(false)));
      btn.set(false, 'เลือกแปลนก่อน');
      this.upBtn.setVisible(false);
      return;
    }
    const bp = e.bp;
    const gs = this.gs;
    if (batch && bp.recipe) {
      const n = e.ready && this.pool ? affordableTimes(recipeNeeds(bp.recipe, this.mc()), this.pool, 99) : 0;
      this.goMax.setLabel(n > 1 ? `×สูงสุด (${n})` : '×สูงสุด');
    }
    this.sheetNo.setText(`แปลน No.${String(bp.no).padStart(3, '0')}`);
    fitImage(this.preview, bp.tex, bp.frame, 78, 78, 4);
    if (this.artFor !== bp) {
      this.artFor = bp;
      this.artPic?.destroy();
      this.artPic = undefined;
      this.preview.setVisible(true);
      withItemArt(this.scene, bp.build ? bp.build.id : bp.recipe!.output.item, (k) => {
        if (this.artFor !== bp || !this.win.root.active) return;
        this.artPic = placeArtCover(this.scene.add.image(0, 0, k), PX + 22, 20, 80, 80);
        this.win.add([this.artPic]);
        this.preview.setVisible(false);
      });
    }
    if (this.artPic) this.preview.setVisible(false);
    this.title.setText(bp.name).setColor(bp.color);
    fitText(this.title, PW - 180);
    this.pin.setActive(gs.pinned === this.pinKey(bp));

    let sub: string;
    let desc: string;
    let stats: string[];
    const notes: string[] = [];
    if (bp.build) {
      const b = bp.build;
      const cat = BUILD_LABEL[b.category] ?? CATEGORY_NAMES[b.category];
      sub = b.layer === 'terrain' ? `${cat} · ปรับพื้นทีละ 1 ช่อง` : `${cat} · ขนาด ${b.w}×${b.h} ช่อง · HP ${b.hp}`;
      this.dims.setText(b.layer === 'terrain' ? '◂ 1×1 ▸' : `◂ ${b.w}×${b.h} ▸`);
      desc = b.desc;
      stats = [];
      if (b.station) stats.push(`สถานีคราฟต์: ${STATION_NAMES[b.station]}`);
      if (b.storage) stats.push(`เก็บของ ${b.storage} ช่อง`);
      if (b.sleep) stats.push('นอนได้ + จุดเกิดใหม่');
      if (b.light) stats.push(`แสงสว่าง ${b.light}`);
      if (b.turret) stats.push(`ยิงอัตโนมัติ ดาเมจ ${b.turret.damage} ระยะ ${b.turret.range}`);
      if (b.power === 'gen') stats.push('จ่ายไฟรัศมี 8 ช่อง (ใช้เชื้อเพลิง)');
      if (b.power === 'wind') stats.push('จ่ายไฟฟรีรัศมี 6 ช่อง');
      if (b.boat) stats.push(`ความเร็ว ${b.boat.speed} · ทนทาน ${b.boat.hp}${b.boat.fuel ? ' · ใช้น้ำมัน' : ''}`);
      if (b.buff) stats.push(`🏠 บัฟถาวร ${statLine(b.buff)}${(b.buffMax ?? 1) > 1 ? ` (สูงสุด ${b.buffMax} หลัง)` : ''}`);
      // หมายเหตุการวาง
      if (b.layer === 'terrain') notes.push(b.terrain === 'fill' ? '🌊 ถมได้เฉพาะน้ำ: น้ำลึก → น้ำตื้น → ทราย (ขยายเกาะ)' : '🌱 เปลี่ยนพื้นถาวร ได้เฉพาะเกาะของคุณ (น้ำลึกต้องถมก่อน)');
      else if (b.dock) notes.push('⚓ ต้องวางบนน้ำตื้นริมฝั่ง');
      else if (b.boat) notes.push('⛵ ต้องวางบนน้ำ (ริมฝั่ง/ท่าเรือ)');
      else notes.push(b.anywhere ? '📍 วางได้ทุกเกาะ (ยกเว้นเขตตลาดเกาะกลาง)' : '📍 วางได้เฉพาะเกาะของคุณ');
      if (b.power === 'use') notes.push('⚡ ต้องมีไฟ: วางใกล้เครื่องปั่นไฟหรือกังหันลม');
      if (b.crop) notes.push('🌱 ใส่เมล็ดแล้วกด E เพื่อปลูก');
      notes.push(gs.creative ? '✨ โหมดสร้างสรรค์: ไม่ใช้วัสดุ' : '🔨 กดสร้างเลย → คลิก/แตะบนพื้นใกล้ตัว · Esc/คลิกขวา = ยกเลิก · รื้อคืนวัสดุ 50%');
    } else {
      const r = bp.recipe!;
      const d = ITEMS[r.output.item];
      const info = itemInfo(d);
      sub = `${RARITY[d.rarity ?? 'common'].name} · คราฟต์ที่${STATION_NAMES[r.station]}${r.output.qty > 1 ? ` · ได้ ×${r.output.qty}` : ''}`;
      this.dims.setText(r.output.qty > 1 ? `ได้ ×${r.output.qty}` : RARITY[d.rarity ?? 'common'].name);
      desc = d.desc;
      stats = info.slice(2).filter((l) => l && !l.startsWith('⬆ อัพเกรด'));
      notes.push(r.station === 'none' ? '✋ คราฟต์ได้ทุกที่ ไม่ต้องใช้สถานี' : `🏝 ต้องมี${STATION_NAMES[r.station]}บนเกาะของคุณ (ไม่ต้องยืนใกล้) — กดแล้วได้ของสำเร็จทันที`);
      if (d.enhanceable) notes.push('⬆ อัพเกรดได้ 10 ระดับ (สำเร็จ 100%) — เปลี่ยนโฉมที่ Lv4/7/10 · อัพจากกระเป๋า (Tab) หรือปุ่ม ⬆ ด้านล่าง');
      if (this.mc() < 1) notes.push(`🧰 ส่วนลดวัสดุของตัวละคร ×${this.mc()} คิดรวมแล้ว`);
    }
    if (e.reqs.some((q) => q.stored)) notes.unshift('📦 ใช้ของในหีบ/โกดังของคุณด้วย (หยิบจากกระเป๋าก่อน)');
    if (e.parts.length) notes.unshift(`🧩 ใช้ชิ้นส่วนที่มีอยู่ก่อน: ${e.parts.map(([id, n]) => `${ITEMS[id].name}×${n}`).join(' ')}`);
    else notes.push('🧩 แปลนใช้ของดิบ — ถ้ามีชิ้นส่วน (เชือก ไม้กระดาน แท่งเหล็ก …) ในกระเป๋าจะใช้ก่อน');
    this.sub.setText(sub);
    fitText(this.sub, PW - 180);
    this.desc.setText(desc);
    this.stats.setText(stats.join(' · '));
    let y = Math.max(112 + 12, 58 + this.desc.height + 6);
    this.stats.setY(y);
    if (stats.length) y += this.stats.height + 6;

    // ---- เช็กลิสต์ ----
    this.reqHead.setY(y);
    const okN = e.reqs.filter((q) => q.ok).length;
    this.reqSum.setY(y + 2).setText(!e.reqs.length ? '✔ ไม่ต้องใช้วัสดุ' : e.ready ? '✔ ครบแล้ว!' : `ครบ ${okN}/${e.reqs.length}`).setColor(e.ready ? COLORS.good : COLORS.bad);
    y += 20;
    this.reqLine.clear().lineStyle(1, CYAN, 0.7);
    for (let x = PX + 18; x < PX + PW - 18; x += 8) this.reqLine.lineBetween(x, y, Math.min(x + 4, PX + PW - 18), y);
    y += 4;
    // แถวเยอะ (ของดิบหลายชนิด) → บีบแถวให้พอดีกระดาษ (แถวเตี้ยไม่แสดงคำใบ้)
    const pitch = Math.max(22, Math.min(37, Math.floor((PH - 30 - y) / Math.max(1, e.reqs.length))));
    const compact = pitch < 34;
    this.rows.forEach((row, i) => {
      const q = e.reqs[i];
      [row.hit, row.icon, row.name, row.count, row.hint].forEach((o) => o.setVisible(!!q));
      if (!q) return;
      row.hit.setY(y).setSize(PW - 28, pitch - 3).setFillStyle(q.ok ? 0xa7f070 : 0xef7d57, 0.08);
      (row.hit.input!.hitArea as Phaser.Geom.Rectangle).setSize(PW - 28, pitch - 3);
      row.icon.setY(y + (pitch - 3) / 2);
      fitImage(row.icon, q.icon, q.frame, Math.min(26, pitch - 6), Math.min(26, pitch - 6), 2);
      const ty = compact ? y + (pitch - 3) / 2 - 8 : y + 2;
      row.name.setY(ty).setText(q.name).setColor(q.ok ? COLORS.text : '#ffd8c8');
      fitText(row.name, PW - 160);
      row.count.setY(ty);
      row.hint.setVisible(!compact);
      let hint: string;
      if (q.lock !== undefined) {
        row.count.setText('🔒').setColor(COLORS.bad);
        hint = `สุ่มได้จาก${q.lock || 'กล่องทอง/เพชร'} — บอสดันเจี้ยน · หีบเกาะมหาสมบัติ · ภัยคืนบอส · ซื้อด้วยเพชร · 📌 ปักหมุดไว้ติดตามได้`;
        row.jump = null;
      } else if (q.station) {
        row.count.setText(q.ok ? '✔' : '🔒').setColor(q.ok ? COLORS.good : COLORS.bad);
        hint = `สร้าง${STATION_NAMES[q.station as Recipe['station']]}ที่ไหนก็ได้บนเกาะของคุณ (ไม่ต้องยืนใกล้) · แตะดูแปลน ›`;
        row.jump = `b:${q.station}`;
      } else {
        const st = q.stored ?? 0;
        row.count.setText(`${st ? '📦' : ''}${q.ok ? '✔' : '✘'} ${Math.min(q.have, 9999)}/${q.need}`).setColor(q.ok ? COLORS.good : COLORS.bad);
        row.jump = this.recipeKeyFor(q.item!);
        hint = `${st ? `📦 จากคลัง ${st} · ` : ''}หาได้จาก: ${this.source(q.item!)}${row.jump ? ' · แตะดูแปลน ›' : ''}`;
      }
      row.hint.setY(y + 18).setColor(q.ok ? '#8fa3b8' : COLORS.dim);
      clip(row.hint, hint, PW - 76);
      row.hit.input!.cursor = row.jump ? 'pointer' : 'default';
      y += pitch;
    });

    // ---- อัพเกรด ----
    const up = this.upgradeInfo(bp);
    this.upRun = up?.run ?? null;
    this.upBtn.setVisible(!!up);
    if (up) {
      this.upBtn.setLabel(up.label);
      notes.unshift(up.note);
    }

    // ---- หมายเหตุ ----
    this.notes.setY(y + 2);
    const lines = Math.max(0, Math.floor((PH - 14 - (up ? 32 : 0) - (y + 2)) / 14));
    this.notes.setMaxLines(lines).setText(lines ? notes.join('\n') : '');

    // ---- ปุ่มหลัก ----
    if (e.ready) btn.set(true, '🔨 สร้างเลย');
    else if (!e.known) btn.set(false, '🔒 ยังไม่มีแปลน');
    // ขาดแค่วัตถุดิบ → ให้ตัวละครออกหาเองอัตโนมัติ (ต้องเปิดหน้าจอเกมไว้)
    else if (!e.matsOk) btn.set(true, '🤖 ออกหาวัตถุดิบอัตโนมัติ');
    else btn.set(false, `ต้องมี${STATION_NAMES[bp.recipe!.station]}บนเกาะ`);
  }

  // ======================================================================
  // สร้าง / คราฟต์
  // ======================================================================
  /** ข้อมูลปุ่มอัพเกรด: ไอเทม = ชิ้นที่ถือ/สวม/ในกระเป๋า · สิ่งก่อสร้าง/ยาน = หลังที่ใกล้ที่สุดในระยะ ~6 ช่อง */
  private upgradeInfo(bp: Blueprint): { label: string; note: string; run: () => void } | null {
    const gs = this.gs;
    const up = gs.upgrades;
    if (bp.build) {
      const t = up.nearestOf(bp.build.id, 6 * 16 + 8);
      if (!t) return null;
      const lines = up.cardLines(t, false);
      return { label: t.lv >= 10 ? `✨ หลังที่ใกล้ Lv.${t.lv}` : `⬆ อัพหลังที่ใกล้ Lv.${t.lv}→${t.lv + 1}`, note: lines.slice(1).join(' · ') || lines[0], run: () => up.upgradeBuild(t) };
    }
    const id = bp.recipe?.output.item;
    if (!id || !ITEMS[id]?.enhanceable) return null;
    const p = gs.player;
    let ref: number | EquipSlot | null = p.held?.id === id ? p.selected : null;
    if (ref === null) ref = (Object.keys(p.equip) as EquipSlot[]).find((k) => p.equip[k]?.id === id) ?? null;
    if (ref === null) {
      const i = p.inventory.slots.findIndex((x) => x?.id === id);
      ref = i >= 0 ? i : null;
    }
    if (ref === null) return null;
    const chk = up.checkItem(ref);
    const where = typeof ref === 'string' ? 'ที่สวม' : ref === p.selected ? 'ที่ถือ' : 'ในกระเป๋า';
    if (!chk.cost) return { label: `✨ ${where} Lv.${chk.lv} สูงสุด`, note: `✨ ชิ้น${where} Lv.${chk.lv} — อัพเกรดสูงสุดแล้ว`, run: () => undefined };
    const err = chk.err && !chk.err.startsWith('ขาด') ? ` · ${chk.err}` : '';
    return {
      label: `⬆ อัพชิ้น${where} Lv.${chk.lv}→${chk.lv + 1}`,
      note: `⬆ ค่าอัพชิ้น${where} Lv.${chk.lv}→${chk.lv + 1}: ${up.costLines(chk.cost)}${err}`,
      run: () => {
        const r = gs.upgradeItem(ref!);
        if (!r.ok) this.toast(r.msg, COLORS.bad);
      },
    };
  }

  // ======================================================================
  // 📌 ปักหมุด
  // ======================================================================
  /** คีย์ปักหมุดที่คงที่ข้ามเวอร์ชัน: b:<buildId> / r:<recipeId> */
  private pinKey(bp: Blueprint) {
    return bp.build ? `b:${bp.build.id}` : `r:${bp.recipe!.id}`;
  }

  private togglePin() {
    const key = this.sel[this.section];
    const bp = key ? this.byKey.get(key) : undefined;
    if (!bp) return;
    const k = this.pinKey(bp);
    const gs = this.gs;
    gs.pinned = gs.pinned === k ? null : k;
    Sfx.play('click');
    this.toast(gs.pinned ? `📌 ปักหมุด ${bp.name} — ดูของที่ขาดได้ใต้แผงเป้าหมาย` : '📌 เลิกปักหมุดแล้ว', COLORS.gold);
    this.detailKey = '';
    this.refresh();
  }

  /** เปิดสมุดแปลนที่หน้าของที่ปักไว้ (แตะแผงติดตามบน HUD) */
  showPinned() {
    const k = this.gs.pinned;
    if (!k) return;
    const bp = k.startsWith('b:') ? this.byKey.get(k) : this.bps.find((b) => b.recipe?.id === k.slice(2));
    if (!bp) return;
    this.show(bp.section);
    this.jump(bp.key);
  }

  /** ขาดวัตถุดิบ → สั่งตัวละครเดินไปเก็บของที่ขาดจนครบ แล้วปักหมุดแปลนนี้ไว้ดูความคืบหน้า */
  private autoGather(bp: Blueprint) {
    const gs = this.gs;
    const needs = bp.build ? gs.buildNeeds(bp.build) : recipeNeeds(bp.recipe!, this.mc());
    const missing = missingRaw(needs, gs.materials());
    const r = gs.auto.gatherFor(missing, bp.name);
    if (!r.started) {
      Sfx.play('error');
      this.toast(`หาเองไม่ได้: ${r.unavailable.join(', ')} — ต้องหาจากกล่อง/ตลาด/เกาะอื่น`, COLORS.bad);
      return;
    }
    gs.pinned = this.pinKey(bp);
    this.win.close();
    if (r.unavailable.length) this.toast(`🤖 ออกหาวัตถุดิบ… (ที่หาเองไม่ได้: ${r.unavailable.join(', ')})`, COLORS.gold);
    else this.toast(`🤖 ออกหาวัตถุดิบให้${bp.name} — เปิดหน้าจอเกมไว้ · เดินเองทับได้ตลอด`, COLORS.gold);
  }

  private go(times: number) {
    const key = this.sel[this.section];
    const bp = key ? this.byKey.get(key) : undefined;
    if (!bp) return;
    const ev = this.evaluate(bp);
    if (ev.known && !ev.matsOk) return this.autoGather(bp);
    if (bp.build) {
      const e = ev;
      if (!e.ready) {
        Sfx.play('error');
        this.toast('วัสดุยังไม่ครบ', COLORS.bad);
        return;
      }
      this.gs.build.select(bp.build.id);
      this.hideForPlacing();
      this.toast(`วาง${bp.name}: คลิก/แตะบนพื้น · Esc = ยกเลิก`, COLORS.gold);
    } else this.doCraft(bp.recipe!, times);
  }

  /** ซ่อนหน้าต่างระหว่างวาง (ไม่เรียก onClose → ไม่ยกเลิกโหมดสร้าง) · กด B เพื่อเปิดกลับ */
  private hideForPlacing() {
    this.win.root.setVisible(false);
  }

  /** คราฟต์ times ครั้ง (−1 = มากที่สุดที่วัตถุดิบพอ ≤ 99 · หยุดเมื่อกระเป๋าเต็ม) — หยิบวัตถุดิบจากกระเป๋าก่อนแล้วจากคลัง */
  private doCraft(r: Recipe, times: number) {
    const g = this.gs;
    const p = g.player;
    const pool = g.materials();
    const max = times < 0;
    if (max) times = Math.max(1, affordableTimes(recipeNeeds(r, this.mc()), pool, 99));
    let made = 0;
    for (let k = 0; k < times; k++) {
      if (!g.knows(bpKeyRecipe(r))) {
        if (!made) this.toast('🔒 ยังไม่มีแปลนนี้', COLORS.bad);
        break;
      }
      const res = craft(r, p.inventory, g.ownStations().has(r.station), this.mc(), pool);
      if (res.error) {
        if (!made) {
          Sfx.play('error');
          this.toast(res.error === 'station' ? `ต้องมี${STATION_NAMES[r.station]}บนเกาะของคุณ` : res.error, COLORS.bad);
        }
        break;
      }
      made++;
      EventBus.emit('craft', r.output.item, r.output.qty);
      if (res.leftover > 0) {
        g.spawnDrop(p.x, p.y + 6, r.output.item, res.leftover);
        if (max) {
          this.toast('🎒 กระเป๋าเต็ม — หยุดคราฟต์ (ของที่เกินตกที่พื้น)', COLORS.gold);
          break;
        }
      }
    }
    if (made) {
      Sfx.play('craft');
      this.toast(`คราฟต์ ${ITEMS[r.output.item].name} ×${made * r.output.qty}`, COLORS.good);
      this.refresh();
    }
  }
}
