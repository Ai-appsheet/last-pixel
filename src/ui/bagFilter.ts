import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { ITEMS } from '../data/items';
import { CAT_INFO, ITEM_CATS, LOAD_INFO, catOf, type ItemCat, type LoadKind } from '../data/loadout';
import type { GameScene } from '../scenes/GameScene';
import { RETRO, drawRetroBox } from './retro';
import type { UIWindow } from './Window';
import { outline, SlotView, txt } from './widgets';

type Filter = ItemCat | 'all';

export interface BagFilterOpts {
  /** ช่องกระเป๋า (index จริง = HOTBAR_SIZE + i) และ hotbar (index = i) */
  bag: SlotView[];
  hot: SlotView[];
  hotOffset: number;
  /** แถวหมวด: จุดเริ่ม + ขอบขวา (พิกัดในหน้าต่าง) */
  x: number;
  y: number;
  right: number;
  /** แถวช่องใช้งานในกระเป๋า (มุมซ้ายบนของป้าย) */
  loadX: number;
  loadY: number;
  /** ของที่หยิบค้างอยู่ในกระเป๋า (คลิกช่องใช้งาน = ใส่) */
  picked: () => number | null;
  /** หลังใส่/ถอด: ล้างของที่หยิบ + วาดกระเป๋าใหม่ */
  done: () => void;
}

/**
 * หมวดในกระเป๋า + ช่องใช้งาน (ดู data/loadout.ts · systems/LoadoutSystem.ts)
 * - แถวหมวด: ทั้งหมด · ⚔ อาวุธ · ⛏ เครื่องมือ · 🛡 สวมใส่ · 🍖 อาหาร/ยา · 🧱 วัตถุดิบ · 📦 อื่นๆ → ช่องที่ไม่ใช่หมวดนั้นจางลง
 * - ไอคอนหมวดเล็กมุมซ้ายบนของทุกช่อง
 * - คลิกขวา / กดค้าง = เมนู "ใส่ช่องอาวุธ/เครื่องมือ/แสง…"
 * - แถว "ช่องใช้งาน" ⛏⛏🔦🍖 ข้าง hotbar: หยิบของแล้วคลิกช่อง = ใส่ · คลิกช่องที่มีของ = ถอด
 */
export class BagFilter {
  cat: Filter = 'all';
  private chips: { id: Filter; icon: string; name: string; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; hit: Phaser.GameObjects.Zone; w: number; x: number }[] = [];
  private tags: Phaser.GameObjects.Text[] = [];
  private load: { kind: LoadKind; v: SlotView; ghost: Phaser.GameObjects.Image; tag: Phaser.GameObjects.Text; glow: Phaser.GameObjects.Graphics }[] = [];
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private pressAt = 0;
  private pressIdx = -1;

  constructor(private scene: Phaser.Scene, private win: UIWindow, private gs: GameScene, private o: BagFilterOpts) {
    this.makeChips();
    // ไอคอนหมวดเล็กมุมซ้ายบน (ช่องกระเป๋า — hotbar มีเลขช่องอยู่แล้ว)
    for (const v of o.bag) {
      const t = outline(txt(scene, v.bg.x - v.size / 2 + 2, v.bg.y - v.size / 2 + 1, '', 7, RETRO.css.sand), 2).setAlpha(0.8);
      this.tags.push(t);
      win.add(t);
    }
    // กดค้าง (จอสัมผัส) = เมนูใส่ช่อง
    const all = [...o.bag.map((v, i) => [v, o.hotOffset + i] as const), ...o.hot.map((v, i) => [v, i] as const)];
    for (const [v, idx] of all) {
      v.bg.on('pointerdown', () => {
        this.pressAt = scene.time.now;
        this.pressIdx = idx;
      }).on('pointerup', (p: Phaser.Input.Pointer) => {
        if (this.pressIdx === idx && scene.time.now - this.pressAt > 450 && p.wasTouch) this.menu(idx, p);
        this.pressIdx = -1;
      });
    }
    this.makeLoadRow();
  }

  /** ส่วนของ key วาดใหม่ของกระเป๋า */
  get key() {
    return `${this.cat}|${this.gs.loadout.version}|${this.gs.loadout.quick}|${this.gs.loadout.buff}`;
  }

  // ---------------------------------------------------------------- แถวหมวด
  private makeChips() {
    const { scene, o } = this;
    const list: { id: Filter; icon: string; name: string }[] = [{ id: 'all', icon: '', name: 'ทั้งหมด' }, ...ITEM_CATS];
    for (const c of list) {
      const t = txt(scene, 0, o.y + 8, '', 10, RETRO.css.text, { fontStyle: '500' }).setOrigin(0.5);
      const g = scene.add.graphics();
      const hit = scene.add.zone(0, o.y - 1, 10, 18).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.cat = this.cat === c.id ? 'all' : c.id;
        Sfx.play('click');
        this.layoutChips();
        this.o.done();
      }).on('pointerover', () => this.layoutChips(c.id)).on('pointerout', () => this.layoutChips());
      this.win.add([g, t, hit]);
      this.chips.push({ id: c.id, icon: c.icon, name: c.name, g, t, hit, w: 0, x: 0 });
    }
    this.layoutChips();
  }

  /** ชื่อเต็มทุกปุ่มถ้าพอดีแถว · ไม่พอ = ไอคอนอย่างเดียว ยกเว้นหมวดที่เลือก/ที่ชี้อยู่ */
  private layoutChips(hover?: Filter) {
    const o = this.o;
    const label = (c: (typeof this.chips)[number], full: boolean) => (c.icon ? (full ? `${c.icon} ${c.name}` : c.icon) : c.name);
    this.chips.forEach((c) => c.t.setText(label(c, true)));
    const fits = this.chips.reduce((s, c) => s + c.t.width + 13, 0) <= o.right - o.x;
    let x = o.x;
    for (const c of this.chips) {
      c.t.setText(label(c, fits || c.id === this.cat || c.id === hover));
      c.w = Math.ceil(c.t.width) + 10;
      c.x = x;
      c.t.setX(x + c.w / 2);
      c.hit.setPosition(x, o.y - 1).setSize(c.w, 18);
      x += c.w + 3;
    }
    this.drawChips();
  }

  private drawChips() {
    for (const c of this.chips) {
      const on = c.id === this.cat;
      c.g.clear();
      drawRetroBox(c.g, c.x, this.o.y, c.w, 16, { fill: on ? RETRO.panel2 : RETRO.inner, edge: on ? (c.id === 'all' ? RETRO.edgeHi : CAT_INFO[c.id].color) : RETRO.edge, alpha: on ? 1 : 0.7, shadow: false });
      c.t.setColor(on ? RETRO.css.gold : RETRO.css.muted);
    }
  }

  /** จางช่องที่ไม่ใช่หมวดที่เลือก + ไอคอนหมวด (เรียกตอนกระเป๋าวาดใหม่) */
  refresh() {
    const inv = this.gs.player.inventory;
    const apply = (v: SlotView, idx: number, tag?: Phaser.GameObjects.Text) => {
      const s = inv.slots[idx];
      const c = s ? catOf(ITEMS[s.id]) : null;
      const dim = this.cat !== 'all' && c !== this.cat;
      for (const ob of v.objects) (ob as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(dim ? (ob === v.bg ? 0.5 : 0.22) : 1);
      if (tag) tag.setText(c ? CAT_INFO[c].icon : '').setVisible(!!c && v.bg.visible).setAlpha(dim ? 0.2 : 0.8);
    };
    this.o.bag.forEach((v, i) => apply(v, this.o.hotOffset + i, this.tags[i]));
    this.o.hot.forEach((v, i) => apply(v, i));
    this.drawLoad();
  }

  // ---------------------------------------------------------------- ช่องใช้งานในกระเป๋า
  private makeLoadRow() {
    const { scene, o } = this;
    const S = 30;
    this.win.add(txt(scene, o.loadX, o.loadY - 18, 'แถบหมวด (หยิบของ → กดช่อง)', 11, RETRO.css.muted));
    const kinds: LoadKind[] = ['tool', 'heal', 'buff', 'lamp']; // ⚔ อาวุธอยู่บนหุ่น
    kinds.forEach((kind, i) => {
      const cx = o.loadX + S / 2 + i * (S + 4);
      const cy = o.loadY + 18;
      const glow = scene.add.graphics();
      glow.lineStyle(2, RETRO.gold, 1).strokeRect(cx - S / 2 - 2, cy - S / 2 - 2, S + 4, S + 4).setVisible(false);
      const v = new SlotView(scene, cx, cy, S);
      const ghost = scene.add.image(cx, cy, LOAD_INFO[kind].ghost).setTint(0x9aa7a4).setAlpha(0.45);
      const tag = outline(txt(scene, cx - S / 2 + 2, cy - S / 2 + 1, LOAD_INFO[kind].icon, 8, RETRO.css.sand), 2);
      v.bg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => this.clickLoad(kind, p.rightButtonDown()));
      // ป้ายหมวดใต้ช่อง (ช่องนี้รับอะไร)
      const name = outline(txt(scene, cx, cy + S / 2 + 6, LOAD_INFO[kind].name, 9, RETRO.css.muted), 2).setOrigin(0.5);
      if (name.width > S + 2) name.setScale((S + 2) / name.width);
      this.win.add([glow, ...v.objects, ghost, tag, name]);
      this.load.push({ kind, v, ghost, tag, glow });
    });
  }

  private drawLoad() {
    const lo = this.gs.loadout;
    const picked = this.o.picked();
    const pid = picked !== null ? this.gs.player.inventory.slots[picked]?.id ?? null : null;
    for (const c of this.load) {
      const s = lo.current(c.kind);
      c.v.set(s && s.qty > 0 ? s : null, false);
      c.ghost.setVisible(!s || s.qty <= 0);
      c.tag.setVisible(!s || s.qty <= 0);
      // หยิบของอยู่: ช่องที่รับได้เรืองทอง
      c.glow.setVisible(!!pid && lo.accepts(c.kind, pid));
    }
  }

  private clickLoad(kind: LoadKind, right: boolean) {
    const gs = this.gs;
    const picked = this.o.picked();
    Sfx.play('click');
    if (picked !== null && !right) gs.loadout.equip(picked, kind);
    else gs.loadout.unequip(kind);
    this.o.done();
  }

  // ---------------------------------------------------------------- เมนูคลิกขวา / กดค้าง
  /** เปิดเมนูใส่ช่องของช่องกระเป๋า index — คืน false = ไม่มีช่องให้ใส่ (ให้แบ่งครึ่งตามเดิม) */
  menu(index: number, p: Phaser.Input.Pointer): boolean {
    const gs = this.gs;
    const lo = gs.loadout;
    const s = gs.player.inventory.slots[index];
    const kind = s ? lo.kindOf(s.id) : null;
    if (!s || (!kind && !lo.accepts('tool', s.id))) return false;
    const items: [string, () => void][] = [];
    const put = (label: string, fn: () => void) => items.push([label, () => {
      fn();
      this.o.done();
    }]);
    for (const k of ['weapon', 'tool', 'heal', 'buff', 'lamp'] as LoadKind[]) {
      if (lo.accepts(k, s.id)) put(`${LOAD_INFO[k].icon} ใส่ช่อง${LOAD_INFO[k].name}`, () => lo.equip(index, k));
    }
    if (kind === 'offhand') put('🛡 สวมมือรอง', () => gs.equipFrom(index));
    if (s.qty > 1) put('✂ แบ่งครึ่ง', () => gs.player.inventory.split(index));
    items.push(['ยกเลิก', () => undefined]);
    this.openMenu(p.x, p.y, ITEMS[s.id].name, items);
    return true;
  }

  private closeMenu() {
    this.menuObjs.forEach((o) => o.destroy());
    this.menuObjs = [];
  }

  private openMenu(x: number, y: number, title: string, items: [string, () => void][]) {
    const scene = this.scene;
    this.closeMenu();
    const W = 168;
    const RH = 22;
    const h = 24 + items.length * RH + 6;
    const sw = scene.scale.width;
    const sh = scene.scale.height;
    const mx = Math.min(x, sw - W - 4);
    const my = Math.min(y, sh - h - 4);
    const block = scene.add.zone(0, 0, sw, sh).setOrigin(0).setInteractive().setDepth(60);
    block.on('pointerdown', () => this.closeMenu());
    const g = scene.add.graphics().setDepth(61);
    drawRetroBox(g, mx, my, W, h, { alpha: 0.97 });
    const head = outline(txt(scene, mx + 10, my + 5, title, 11, RETRO.css.gold), 2).setDepth(62);
    this.menuObjs.push(block, g, head);
    items.forEach(([label, fn], i) => {
      const ry = my + 24 + i * RH;
      const hl = scene.add.rectangle(mx + 4, ry, W - 8, RH - 2, 0xffffff, 0).setOrigin(0).setDepth(62).setInteractive({ useHandCursor: true });
      const t = txt(scene, mx + 12, ry + (RH - 2) / 2, label, 12, label === 'ยกเลิก' ? RETRO.css.muted : RETRO.css.text, { fontStyle: '500' }).setOrigin(0, 0.5).setDepth(63);
      hl.on('pointerover', () => hl.setFillStyle(0xffffff, 0.08)).on('pointerout', () => hl.setFillStyle(0xffffff, 0)).on('pointerdown', () => {
        Sfx.play('click');
        this.closeMenu();
        fn();
      });
      this.menuObjs.push(hl, t);
    });
  }
}
