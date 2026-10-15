import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { ITEMS } from '../data/items';
import { BAR_KINDS, LOAD_INFO, type LoadKind } from '../data/loadout';
import type { GameScene } from '../scenes/GameScene';
import { showItemIcon } from './itemArt';
import { RETRO, drawRetroBox } from './retro';
import { outline, SlotView, txt } from './widgets';

interface Cell {
  kind: LoadKind;
  v: SlotView;
  ghost: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  more: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Graphics;
}

/**
 * แถบด้านล่างแถบเดียว (แทน hotbar 8 ช่องเดิม): 5 ช่องหมวด หมวดละ 1 ชิ้น — systems/LoadoutSystem.ts
 *   1 ⚔ อาวุธ · 2 ⛏ เครื่องมือ · 3 ❤ ฟื้นเลือด · 4 ✨ บัฟ · 5 🔦 แสง (ป้ายหมวดใต้ทุกช่อง)
 *   กดช่อง/ปุ่มเลข: อาวุธ/เครื่องมือ/แสง = สลับชิ้นถัดไป · ฟื้นเลือด/บัฟ = ใช้
 *   ▴n เหนือช่อง / คลิกขวา / กดค้าง = เมนูเลือกชิ้น · หยิบของค้างในกระเป๋า = ช่องที่รับได้เรืองทอง (คลิก = ใส่)
 */
export class LoadoutBar {
  private cells: Cell[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  private box: Phaser.GameObjects.Container;
  private area: Phaser.GameObjects.Zone;
  private tip: Phaser.GameObjects.Text;
  private flash: Phaser.GameObjects.Text;
  private menuObjs: Phaser.GameObjects.GameObject[] = [];
  private key = '';
  private downAt = 0;
  private downKind: LoadKind | null = null;
  /** ขอบซ้าย/ขวาของแถบ (พิกัดใน parent) — UIScene ใช้จัดแผง hotbar/ช่องสกิล */
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;

  constructor(private scene: Phaser.Scene, private gs: GameScene, private parent: Phaser.GameObjects.Container, cx: number, y: number, size: number, private bag?: { picked: () => number | null; done: () => void }) {
    const s = size;
    const pitch = s + 12;
    const width = BAR_KINDS.length * pitch - 12;
    const x0 = Math.round(cx - width / 2);
    this.left = x0 - 8;
    this.right = x0 + width + 8;
    this.top = y - s / 2 - 8;
    this.bottom = y + s / 2 + 16;
    const frame = scene.add.graphics();
    drawRetroBox(frame, this.left, this.top, this.right - this.left, this.bottom - this.top, { alpha: 0.6 });
    this.area = scene.add.zone(this.left, this.top, this.right - this.left, this.bottom - this.top).setOrigin(0);
    this.objs.push(frame, this.area);
    BAR_KINDS.forEach((kind, i) => {
      const x = x0 + i * pitch + s / 2;
      const info = LOAD_INFO[kind];
      const glow = scene.add.graphics();
      glow.lineStyle(2, RETRO.gold, 1).strokeRect(x - s / 2 - 2, y - s / 2 - 2, s + 4, s + 4).setVisible(false);
      const v = new SlotView(scene, x, y, s);
      const ghost = scene.add.image(x, y, info.ghost).setTint(0x9aa7a4).setAlpha(0.45);
      fitIcon(ghost, s - 12);
      const num = outline(txt(scene, x - s / 2, y - s / 2 - 5, String(i + 1), 9, RETRO.css.muted), 2).setOrigin(0, 0.5); // ปุ่มเลขลัด (เหนือมุมซ้าย ไม่ทับป้าย Lv)
      // ป้ายหมวดใต้ช่อง (มองเห็นตลอด)
      const label = outline(txt(scene, x, y + s / 2 + 8, info.name, 10, RETRO.css.text, { fontStyle: '500' }), 2).setOrigin(0.5);
      if (label.width > pitch - 2) label.setScale((pitch - 2) / label.width);
      // ▴n = มีให้เลือกหลายชิ้น (กด = เมนูเลือก)
      const more = outline(txt(scene, x, y - s / 2 - 5, '', 9, RETRO.css.gold), 2).setOrigin(0.5).setBackgroundColor('#1f2a33dd').setPadding(3, 0, 3, 0);
      more.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openMenu(kind));
      v.bg.setInteractive({ useHandCursor: true })
        .on('pointerdown', (p: Phaser.Input.Pointer) => {
          Sfx.unlock();
          this.downAt = scene.time.now;
          this.downKind = kind;
          if (p.rightButtonDown()) {
            this.downKind = null;
            this.openMenu(kind);
          }
        })
        .on('pointerup', () => {
          if (this.downKind !== kind) return;
          this.downKind = null;
          if (scene.time.now - this.downAt > 450) this.openMenu(kind); // กดค้าง = เมนูเลือก
          else this.click(kind);
        })
        .on('pointerover', () => this.showTip(kind, x))
        .on('pointerout', () => this.tip.setVisible(false));
      this.cells.push({ kind, v, ghost, label, more, glow });
      this.objs.push(glow, ...v.objects, ghost, num, label, more);
    });
    this.tip = outline(txt(scene, cx, this.top - 3, '', 11, RETRO.css.text), 2).setOrigin(0.5, 1).setVisible(false);
    this.tip.setBackgroundColor('#1f2a33ee').setPadding(6, 3, 6, 3);
    this.flash = outline(txt(scene, cx, this.top - 3, '', 12, RETRO.css.gold, { fontStyle: '600' }), 2).setOrigin(0.5, 1).setAlpha(0);
    this.objs.push(this.tip, this.flash);
    // กล่องของตัวเอง ตามกลุ่ม hotbar ทุกเฟรม · ลึกกว่าพื้นที่แตะจอย (มือถือแตะช่องได้ ไม่กลายเป็นจอย)
    this.box = scene.add.container(0, 0, this.objs).setDepth(parent.depth + 4);
    this.follow();
    const onPick = (_k: LoadKind, text: string) => this.say(text);
    EventBus.on('loadout:pick', onPick);
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', () => {
      scene.events.off('update', this.update, this);
      EventBus.off('loadout:pick', onPick);
    });
  }

  /** จุดอยู่บนแถบ/เมนู (พิกัดจอ) — กันคลิกทะลุไปโจมตี */
  contains(x: number, y: number) {
    return this.menuObjs.length > 0 || (this.box.visible && this.area.getBounds().contains(x, y));
  }

  private follow() {
    const g = this.parent;
    this.box.setPosition(g.x, g.y).setScale(g.scaleX, g.scaleY).setVisible(g.visible).setAlpha(g.alpha);
  }

  private update() {
    const gs = this.gs;
    this.follow();
    if (!gs.player || !gs.loadout || !this.box.visible) return;
    const lo = gs.loadout;
    const picked = this.bag?.picked() ?? null;
    const pickedId = picked !== null ? gs.player.inventory.slots[picked]?.id ?? null : null;
    const parts = BAR_KINDS.map((k) => {
      const s = lo.current(k);
      return `${s?.id}:${s?.qty}:${Math.ceil(s?.dur ?? 0)}:${s?.plus ?? 0}:${lo.choices(k).length}`;
    });
    const k = `${parts.join('|')}|${pickedId}`;
    if (k === this.key) return;
    this.key = k;
    for (const c of this.cells) {
      const s = lo.current(c.kind);
      const has = !!s && s.qty > 0;
      c.v.set(has ? s : null, false);
      c.ghost.setVisible(!has);
      if (s && !has) c.ghost.setTexture(ITEMS[s.id].icon).clearTint().setAlpha(0.3); // ❤/✨ หมดแล้ว = จางไว้ให้รู้ว่าตั้งอะไร
      else c.ghost.setTexture(LOAD_INFO[c.kind].ghost).setTint(0x9aa7a4).setAlpha(0.45);
      fitIcon(c.ghost, c.v.size - 12);
      const n = lo.choices(c.kind).length;
      c.more.setText(n > 1 ? `▴${n}` : '').setVisible(n > 1);
      // กำลังจะวางของ: ช่องที่รับได้เรืองทอง + ป้าย "วางที่นี่" · ช่องอื่นจาง
      const ok = pickedId ? lo.accepts(c.kind, pickedId) : null;
      c.glow.setVisible(ok === true);
      c.label.setText(ok ? '⬇ วางที่นี่' : LOAD_INFO[c.kind].name).setColor(ok ? RETRO.css.gold : has ? RETRO.css.text : RETRO.css.muted);
      for (const o of [...c.v.objects, c.ghost]) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha(ok === false ? 0.35 : o === c.ghost ? c.ghost.alpha : 1);
    }
  }

  private say(text: string) {
    this.tip.setVisible(false);
    this.flash.setText(text).setAlpha(1);
    this.scene.tweens.killTweensOf(this.flash);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, delay: 1100, duration: 400 });
  }

  private showTip(kind: LoadKind, x: number) {
    const s = this.gs.loadout.current(kind);
    const info = LOAD_INFO[kind];
    const name = s && s.qty > 0 ? ITEMS[s.id].name : 'ว่าง';
    this.tip.setText(`${info.icon} ${info.name}: ${name}\n${info.hint}\nกด = ${info.tap} · คลิกขวา/กดค้าง = เลือกชิ้น`).setX(Math.round(x)).setVisible(true);
  }

  private click(kind: LoadKind) {
    const gs = this.gs;
    const picked = this.bag?.picked() ?? null;
    if (picked !== null) {
      gs.loadout.equip(picked, kind); // หยิบของค้างในกระเป๋า → ใส่ช่องนี้ (ผิดหมวด = บอกว่าช่องนี้รับอะไร)
      this.bag!.done();
    } else gs.loadout.tap(kind);
    this.key = '';
  }

  // ---------------------------------------------------------------- เมนูเลือกชิ้น
  private closeMenu() {
    this.menuObjs.forEach((o) => o.destroy());
    this.menuObjs = [];
  }

  private openMenu(kind: LoadKind) {
    const scene = this.scene;
    const lo = this.gs.loadout;
    this.closeMenu();
    this.tip.setVisible(false);
    const list = lo.choices(kind);
    const info = LOAD_INFO[kind];
    const cell = this.cells.find((c) => c.kind === kind)!;
    const b = cell.v.bg.getBounds();
    const RH = 26;
    const W = 200;
    const shown = list.slice(0, 8);
    const rows: [string, (() => void) | null, string | null, boolean][] = shown.map((c) => {
      const d = ITEMS[c.slot.id];
      const extra = kind === 'heal' || kind === 'buff' ? ` ×${c.slot.qty}` : c.slot.plus ? ` Lv.${c.slot.plus + 1}` : c.slot.qty > 1 ? ` ×${c.slot.qty}` : '';
      return [`${d.name}${extra}`, () => lo.pick(kind, c), c.slot.id, c.current];
    });
    if (list.length > shown.length) rows.push([`… อีก ${list.length - shown.length} ชิ้น (ดูในกระเป๋า)`, null, null, false]);
    if (!list.length) rows.push([`ยังไม่มี — ${info.hint.split(' —')[0]}`, null, null, false]);
    if (lo.current(kind)) rows.push(['เอาออกจากช่อง', () => lo.unequip(kind), null, false]);
    const h = 26 + rows.length * RH + 6;
    const sw = scene.scale.width;
    const mx = Phaser.Math.Clamp(Math.round(b.centerX - W / 2), 4, sw - W - 4);
    const my = Math.max(4, Math.round(b.top - h - 8));
    const block = scene.add.zone(0, 0, sw, scene.scale.height).setOrigin(0).setInteractive().setDepth(60);
    block.on('pointerdown', () => this.closeMenu());
    const g = scene.add.graphics().setDepth(61);
    drawRetroBox(g, mx, my, W, h, { alpha: 0.97 });
    const head = outline(txt(scene, mx + 10, my + 6, `${info.icon} เลือก${info.name} (ช่องนี้ใส่ได้ 1 ชิ้น)`, 11, RETRO.css.gold), 2).setDepth(62);
    this.menuObjs.push(block, g, head);
    rows.forEach(([label, fn, id, cur], i) => {
      const ry = my + 26 + i * RH;
      const hl = scene.add.rectangle(mx + 4, ry, W - 8, RH - 2, 0xffffff, cur ? 0.1 : 0).setOrigin(0).setDepth(62);
      const tx = id ? mx + 34 : mx + 12;
      const t = txt(scene, tx, ry + (RH - 2) / 2, `${cur ? '▶ ' : ''}${label}`, 12, fn ? (cur ? RETRO.css.gold : RETRO.css.text) : RETRO.css.muted, { fontStyle: '500' }).setOrigin(0, 0.5).setDepth(63);
      this.menuObjs.push(hl, t);
      if (id) {
        const ic = scene.add.image(mx + 20, ry + (RH - 2) / 2, 'px').setDepth(63);
        const art = scene.add.image(mx + 20, ry + (RH - 2) / 2, 'px').setDepth(63);
        showItemIcon(ic, art, id, 20, 22);
        this.menuObjs.push(ic, art);
      }
      if (!fn) return;
      hl.setInteractive({ useHandCursor: true })
        .on('pointerover', () => hl.setFillStyle(0xffffff, 0.14))
        .on('pointerout', () => hl.setFillStyle(0xffffff, cur ? 0.1 : 0))
        .on('pointerdown', () => {
          this.closeMenu();
          fn();
          this.key = '';
        });
    });
  }
}

/** ย่อ/ขยายไอคอนให้พอดีช่อง (ไอคอนพิกเซล 16 → ขยายเลขเต็ม) */
function fitIcon(img: Phaser.GameObjects.Image, max: number) {
  const w = img.frame?.realWidth || 16;
  const h = img.frame?.realHeight || 16;
  const k = max / Math.max(w, h);
  img.setScale(k >= 1 ? Math.max(1, Math.floor(k)) : k);
}
