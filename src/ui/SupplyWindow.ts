import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { ITEMS, type ItemDef } from '../data/items';
import type { GameScene } from '../scenes/GameScene';
import { SUPPLY_TABS, supplyItems, supplyTabOf, type SupplyTab } from '../systems/AllItemsSystem';
import { UIWindow } from './Window';
import { COLORS, SlotView, button, txt, type Button } from './widgets';

const COLS = 15;
const ROWS = 5;
const CELL = 46;
const BAG_COLS = 18;
const BAG_CELL = 40;

/**
 * ♾ คลังเสบียงไม่จำกัด (โหมดของครบ) — ของทุกชิ้นในเกม คลิก = หยิบ 1 กองเข้ากระเป๋า (ไม่มีวันหมด)
 * เปิดจากหีบทองข้างตู้จดหมาย (E) หรือกด K บนเกาะบ้าน · คลิกของในกระเป๋า = คืนเข้าคลัง (ทิ้ง)
 */
export class SupplyWindow {
  readonly win: UIWindow;
  private page = 0;
  private list: ItemDef[] = [];
  private cells: SlotView[] = [];
  private bag: SlotView[] = [];
  private tabs: { id: SupplyTab; b: Button }[] = [];
  private info: Phaser.GameObjects.Text;
  private pageT: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, private gs: GameScene, private toast: (t: string, c?: string) => void) {
    const w = (this.win = new UIWindow(scene, 90, 33, 780, 474, '♾ คลังเสบียงไม่จำกัด'));
    SUPPLY_TABS.forEach((t, i) => {
      const b = button(scene, 50 + i * 106, 14, 100, 28, t.name, () => this.setTab(t.id), true, 12);
      this.tabs.push({ id: t.id, b });
      w.add(b.objects);
    });
    this.info = txt(scene, 0, 34, '', 13, COLORS.dim);
    w.add(this.info);
    for (let i = 0; i < COLS * ROWS; i++) {
      const v = new SlotView(scene, 24 + (i % COLS) * CELL, 56 + CELL / 2 + Math.floor(i / COLS) * CELL, CELL - 4);
      v.bg.setInteractive({ useHandCursor: true })
        .on('pointerover', () => this.hover(this.list[this.page * COLS * ROWS + i]))
        .on('pointerdown', () => this.take(this.list[this.page * COLS * ROWS + i]));
      this.cells.push(v);
      w.add(v.objects);
    }
    const prev = button(scene, 290, 302, 70, 26, '◀', () => this.turn(-1), true, 12);
    const next = button(scene, 450, 302, 70, 26, '▶', () => this.turn(1), true, 12);
    this.pageT = txt(scene, 370, 302, '', 13, COLORS.text).setOrigin(0.5);
    w.add([...prev.objects, ...next.objects, this.pageT, txt(scene, 0, 320, 'กระเป๋า (คลิก = คืนเข้าคลัง)', 13, COLORS.gold)]);
    for (let i = 0; i < BAG_COLS * 2; i++) {
      const v = new SlotView(scene, 18 + (i % BAG_COLS) * BAG_CELL, 360 + Math.floor(i / BAG_COLS) * BAG_CELL, BAG_CELL - 4);
      v.bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.giveBack(i));
      this.bag.push(v);
      w.add(v.objects);
    }
    this.setTab('all');
    const open = () => this.open();
    EventBus.on('ui:supply', open);
    // K = เปิดคลังเสบียงจากที่ไหนก็ได้บนเกาะบ้าน
    const key = () => (this.win.visible ? this.win.close() : this.gs.currentSlot === this.gs.world.home ? this.open() : this.toast('♾ คลังเสบียงเปิดได้บนเกาะบ้าน (หีบทองข้างตู้จดหมาย)', COLORS.dim));
    scene.input.keyboard?.on('keydown-K', key);
    scene.events.once('shutdown', () => EventBus.off('ui:supply', open));
  }

  open() {
    if (!this.gs.supplySprite) return;
    this.win.open();
    this.refresh();
  }

  private setTab(id: SupplyTab) {
    this.page = 0;
    this.list = supplyItems().filter((d) => id === 'all' || supplyTabOf(d) === id);
    for (const t of this.tabs) t.b.t.setColor(t.id === id ? COLORS.gold : '#eef0e6');
    this.info.setText(`${SUPPLY_TABS.find((t) => t.id === id)!.name} ${this.list.length} ชนิด · ชี้ = ดูชื่อ · คลิก = หยิบ 1 กอง (ไม่มีวันหมด)`);
    this.drawPage();
  }

  private turn(d: number) {
    const pages = Math.max(1, Math.ceil(this.list.length / (COLS * ROWS)));
    this.page = (this.page + d + pages) % pages;
    this.drawPage();
  }

  private drawPage() {
    const per = COLS * ROWS;
    const pages = Math.max(1, Math.ceil(this.list.length / per));
    this.cells.forEach((v, i) => {
      const d = this.list[this.page * per + i];
      v.bg.setVisible(!!d);
      v.set(d ? { id: d.id, qty: d.stack } : null, false);
    });
    this.pageT.setText(`${this.page + 1}/${pages}`);
  }

  private hover(d?: ItemDef) {
    if (d) this.info.setText(`${d.name} — ${d.desc}`.slice(0, 110));
  }

  private take(d?: ItemDef) {
    if (!d) return;
    const inv = this.gs.player.inventory;
    const left = inv.add(d.id, d.stack);
    if (left >= d.stack) {
      Sfx.play('error');
      return this.toast('🎒 กระเป๋าเต็ม — คลิกของในกระเป๋าเพื่อคืนเข้าคลังก่อน', COLORS.bad);
    }
    Sfx.play('pickup', 40);
    EventBus.emit('pickup', d.id, d.stack - left);
  }

  /** คืนของเข้าคลัง (= ทิ้ง เพราะคลังมีไม่จำกัดอยู่แล้ว) — ของที่อัพเกรดแล้วไม่ให้คืน กันกดพลาด */
  private giveBack(i: number) {
    const inv = this.gs.player.inventory;
    const s = inv.slots[i];
    if (!s) return;
    if (s.plus) return this.toast('ของที่อัพเกรดแล้วคืนไม่ได้ (กันกดพลาด)', COLORS.bad);
    inv.slots[i] = null;
    inv.version++;
    Sfx.play('click');
    this.toast(`คืน${ITEMS[s.id]?.name ?? s.id} ×${s.qty} เข้าคลังแล้ว`, COLORS.dim);
  }

  refresh() {
    const inv = this.gs.player.inventory;
    this.bag.forEach((v, i) => {
      v.bg.setVisible(i < inv.slots.length);
      v.set(inv.slots[i] ?? null, i === this.gs.player.selected);
    });
  }
}
