import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { ITEMS } from '../data/items';
import { RARITY } from '../data/loot';
import { fancyButton, fancyPanel, fitText, type FancyButton } from '../ui/fancyButton';
import { COLORS, heading, txt } from '../ui/widgets';
import { artGroup, bossArt, coverCrop, coverImage, queueArt, smallArtKey, type ArtName } from '../ui/art';
import { itemArtKey, placeArtCover, queueItemArtIndex, withItemArt, withItemThumb } from '../ui/itemArt';
import { TABS, type Block, type Entry, type SpriteRef } from './catalog/data';
import { ScrollView, pixelFit, thaiWrap } from './catalog/ScrollView';
import { resOf } from '../gfx/hd';

import { BAND_TINT } from '../gfx/UpgradeLook';
import { ensureLookKey, variantAnim } from '../gfx/UpgradeLook';
import { applyUiScale } from '../ui/layout';
import { fmtMoney } from '../ui/money';
import { SaveManager } from '../core/SaveManager';

/** pixelFit ที่คิดความละเอียด texture (sprite HD วัดเป็นพิกเซลโลกแล้วหารกลับเป็น scale จริง) */
const hdFit = (s: Phaser.GameObjects.Sprite, boxW: number, boxH: number, maxS: number) => {
  const r = resOf(s.texture);
  return pixelFit(s.width / r, s.height / r, boxW, boxH, maxS) / r;
};

const W = 960;
const H = 540;
/** แผงรายการ (ซ้าย) / แผงรายละเอียด (ขวา) */
const LIST = { x: 12, y: 108, w: 500, h: 420 };
const DET = { x: 522, y: 108, w: 426, h: 420 };
const PAD = 12;
/** กรอบรูปตัวอย่างใหญ่ในแผงรายละเอียด */
const PREV = { x: DET.x + 14, y: DET.y + 14, w: 168, h: 150 };
const HEAD_X = PREV.x + PREV.w + 12;
const HEAD_W = DET.x + DET.w - 16 - HEAD_X;
const COLS = 5;
const CELL_H = 118;
const CARD_H = 112;

interface Card {
  e: Entry;
  box: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Sprite;
  base: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * คลังข้อมูล & ร้านค้า: ดูตัวอย่างอาวุธ ชุดเกราะ บ้าน เรือ เครื่องจักร มอนสเตอร์ ร้านค้า กล่อง/ผลึก
 * + อธิบายวิธีสร้าง/วัสดุที่ต้องใช้/หาได้จากไหน (ดึงจากข้อมูลเกมจริงทั้งหมด)
 * ซ้าย = การ์ดเลื่อนได้ · ขวา = รายละเอียดเลื่อนได้ · ใช้ได้ทั้งเมาส์ (ล้อ/ลาก) และนิ้ว
 */
export class CatalogScene extends Phaser.Scene {
  private tab = 0;
  private filter = 'all';
  private entries: Entry[] = [];
  private shown: Entry[] = [];
  private cards: Card[] = [];
  private sel = -1;
  private hover = -1;
  private grid: ScrollView | null = null;
  private detail!: ScrollView;
  private tabBtns: FancyButton[] = [];
  private chipObjs: Phaser.GameObjects.GameObject[] = [];
  private headObjs: Phaser.GameObjects.GameObject[] = [];
  private headTimer: Phaser.Time.TimerEvent | null = null;
  private hoverG!: Phaser.GameObjects.Graphics;
  private selG!: Phaser.GameObjects.Graphics;
  private subtitle!: Phaser.GameObjects.Text;
  private sea!: Phaser.GameObjects.TileSprite;
  /** tween วนไม่รู้จบของการ์ดเด่น — ฆ่าทิ้งตอนสร้างกริดใหม่ */
  private gridTweens: Phaser.Tweens.Tween[] = [];
  private leaving = false;
  private entryCache = new Map<string, Entry[]>();

  constructor() {
    super('CatalogScene');
  }

  preload() {
    queueArt(this, [...artGroup('cat_'), ...artGroup('boss_')]);
    // รายชื่อภาพวาดรายไอเทม — ภาพจริงโหลดตอนเลือกดู
    queueItemArtIndex(this);
  }
  private shownEntry: Entry | null = null;

  create(data?: { tab?: string }) {
    applyUiScale(this);
    // scene ถูกใช้ซ้ำ → รีเซ็ตสถานะทุกครั้ง
    this.grid = null;
    this.cards = [];
    this.gridTweens = [];
    this.leaving = false;
    this.tabBtns = [];
    this.chipObjs = [];
    this.headObjs = [];
    this.headTimer = null;
    this.sel = this.hover = -1;
    this.filter = 'all';
    const want = data?.tab ? TABS.findIndex((t) => t.id === data.tab || t.label.includes(data.tab!)) : -1;
    this.tab = want >= 0 ? want : 0;

    this.makeGlowTexture();
    this.drawBackground();
    this.drawFrame();
    this.detail = new ScrollView(this, DET.x + 14, DET.y + 180, DET.w - 26, DET.h - 180 - 14, 6);
    this.setTab(this.tab, true);
    this.bindKeys();
    this.input.once('pointerdown', () => Sfx.unlock());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.cameras.main.fadeIn(260, 11, 13, 31);
  }

  update(_t: number, dt: number) {
    this.grid?.update(dt);
    this.detail.update(dt);
    this.sea.tilePositionX += dt * 0.006;
    this.sea.tilePositionY = Math.sin(this.time.now / 1800) * 3;
  }

  private cleanup() {
    this.grid?.destroy();
    this.detail.destroy();
    this.headTimer?.remove(false);
    this.input.setDefaultCursor('default');
    this.input.keyboard?.removeAllListeners();
  }

  // ======================================================================
  // ฉากหลัง + กรอบ
  // ======================================================================
  private makeGlowTexture() {
    if (this.textures.exists('cat_glow')) return;
    const tex = this.textures.createCanvas('cat_glow', 64, 64)!;
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  private drawBackground() {
    const bg = this.add.graphics().setDepth(-11);
    bg.fillGradientStyle(0x29366f, 0x29366f, 0x0b0d1f, 0x0b0d1f, 1);
    bg.fillRect(0, 0, W, H);
    this.hasArt = this.textures.exists('art_cat_weapons');
    // แสงออโรร่าลอยช้าๆ
    for (const [x, y, c, s] of [[180, 120, 0x5d275d, 7], [760, 90, 0x3b5dc9, 8], [520, 300, 0x257179, 6]] as [number, number, number, number][]) {
      const a = this.add.image(x, y, 'cat_glow').setTint(c).setScale(s).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: a, x: x + Phaser.Math.Between(-90, 90), y: y + Phaser.Math.Between(-30, 40), alpha: 0.25, duration: Phaser.Math.Between(5000, 8000), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // ดาวระยิบ
    for (let i = 0; i < 40; i++) {
      const s = this.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(0, H), 'sparkle').setAlpha(Phaser.Math.FloatBetween(0.2, 0.8)).setScale(Phaser.Math.Between(1, 2));
      this.tweens.add({ targets: s, alpha: 0.05, duration: Phaser.Math.Between(800, 2400), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000) });
    }
    // ทะเลด้านล่าง
    this.sea = this.add.tileSprite(0, H - 130, W, 130, 'tile_deep').setOrigin(0).setTileScale(3).setAlpha(this.hasArt ? 0.12 : 0.4);
    // หิ่งห้อย/ฟองลอยขึ้นเรื่อยๆ
    for (let i = 0; i < 26; i++) this.floatMote(true);
    this.add.image(0, 0, 'vignette').setOrigin(0);
  }

  /** ภาพฉากหลังตามแท็บ (AI art) — ค่อยๆ เฟดเปลี่ยน */
  private hasArt = false;
  private backArt?: Phaser.GameObjects.Image;
  private setBackdrop(tabId: string) {
    const img = coverImage(this, `cat_${tabId}` as ArtName, W, H);
    if (!img) return;
    img.setDepth(-10).setAlpha(0);
    const old = this.backArt;
    this.backArt = img;
    this.tweens.add({ targets: img, alpha: 0.42, duration: 420 });
    this.tweens.add({ targets: img, scale: img.scale * 1.05, duration: 12000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    if (old) this.tweens.add({ targets: old, alpha: 0, duration: 420, onComplete: () => old.destroy() });
  }

  private floatMote(first = false) {
    const x = Phaser.Math.Between(0, W);
    const y = first ? Phaser.Math.Between(0, H) : H + 8;
    const m = this.add.image(x, y, Phaser.Math.RND.pick(['firefly', 'sparkle', 'ember'])).setScale(Phaser.Math.Between(1, 2))
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(Phaser.Math.FloatBetween(0.25, 0.7))
      .setTint(Phaser.Math.RND.pick([0xfff2b0, 0x73eff7, 0xa77bdb, 0xffcd75]));
    this.tweens.add({
      targets: m, y: -10, x: x + Phaser.Math.Between(-60, 60), duration: (y + 10) * Phaser.Math.Between(28, 46), ease: 'Linear',
      onComplete: () => {
        m.destroy();
        if (this.scene.isActive()) this.floatMote();
      },
    });
  }

  private drawFrame() {
    heading(this, 18, 4, '📖 คลัง & ร้านค้า', 26).setDepth(10);
    this.subtitle = txt(this, 20, 42, '', 13, COLORS.dim).setDepth(10);
    const back = fancyButton(this, W - 76, 30, { w: 128, h: 40, label: '← กลับ', icon: 'close', theme: 'crimson', size: 16, onClick: () => this.goBack() });
    back.setDepth(20);
    this.drawWallet();
    const p1 = fancyPanel(this, LIST.x, LIST.y, LIST.w, LIST.h, 'gold', 0.86).setDepth(2);
    const p2 = fancyPanel(this, DET.x, DET.y, DET.w, DET.h, 'gold', 0.86).setDepth(2);
    for (const p of [p1, p2]) this.tweens.add({ targets: p, alpha: { from: 0, to: 1 }, y: { from: p.y + 10, to: p.y }, duration: 320, ease: 'Cubic.easeOut' });
    // เส้นคั่นใต้ตัวอย่างในแผงรายละเอียด
    const sep = this.add.graphics().setDepth(4);
    sep.fillGradientStyle(0xffcd75, 0xffcd75, 0xffcd75, 0xffcd75, 0, 0.8, 0, 0.8);
    sep.fillRect(DET.x + 14, DET.y + 172, (DET.w - 28) / 2, 2);
    sep.fillGradientStyle(0xffcd75, 0xffcd75, 0xffcd75, 0xffcd75, 0.8, 0, 0.8, 0);
    sep.fillRect(DET.x + 14 + (DET.w - 28) / 2, DET.y + 172, (DET.w - 28) / 2, 2);
  }

  /** เงินของเกาะปัจจุบัน (ดูราคาในร้านเทียบกับเงินที่มี) — รูปแบบเดียวกับแถบเงินในเกม */
  private drawWallet() {
    const w = SaveManager.load()?.wallet;
    if (!w) return;
    const c = this.add.container(0, 0).setDepth(20);
    const coin = txt(this, 0, 30, fmtMoney(w.coins), 15, COLORS.gold).setOrigin(0, 0.5);
    const gem = txt(this, 0, 30, fmtMoney(w.gems), 15, '#73eff7').setOrigin(0, 0.5);
    const right = W - 150;
    const width = 14 + 18 + coin.width + 18 + 18 + gem.width + 12;
    const x0 = right - width;
    const g = this.add.graphics();
    g.fillStyle(0x0b0d1f, 0.78).fillRoundedRect(x0, 17, width, 26, 13);
    g.lineStyle(2, 0xffcd75, 0.75).strokeRoundedRect(x0, 17, width, 26, 13);
    let x = x0 + 14;
    const ci = this.add.image(x + 6, 30, 'i_coin').setScale(1.3);
    coin.setX(x + 17);
    x += 18 + coin.width + 18;
    g.lineStyle(1, 0x566c86, 0.8).lineBetween(x - 10, 22, x - 10, 38);
    const gi = this.add.image(x + 6, 30, 'i_gem').setScale(1.3);
    gem.setX(x + 17);
    c.add([g, ci, coin, gi, gem]);
  }

  private goBack() {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(200, 11, 13, 31);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('TitleScene'));
  }

  private bindKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-ESC', () => this.goBack());
    kb.on('keydown-Q', () => this.setTab((this.tab + TABS.length - 1) % TABS.length));
    kb.on('keydown-E', () => this.setTab((this.tab + 1) % TABS.length));
    kb.on('keydown-PAGE_UP', () => this.setTab((this.tab + TABS.length - 1) % TABS.length));
    kb.on('keydown-PAGE_DOWN', () => this.setTab((this.tab + 1) % TABS.length));
    kb.on('keydown-LEFT', () => this.moveSel(-1));
    kb.on('keydown-RIGHT', () => this.moveSel(1));
    kb.on('keydown-UP', () => this.moveSel(-COLS));
    kb.on('keydown-DOWN', () => this.moveSel(COLS));
  }

  // ======================================================================
  // แท็บ + ตัวกรอง
  // ======================================================================
  private setTab(i: number, first = false) {
    if (i === this.tab && !first) return;
    this.tab = i;
    this.filter = 'all';
    const def = TABS[i];
    let list = this.entryCache.get(def.id);
    if (!list) {
      list = def.entries();
      this.entryCache.set(def.id, list);
    }
    this.entries = list;
    this.setBackdrop(def.id);
    this.drawTabs();
    this.applyFilter();
    if (!first) Sfx.play('click');
  }

  private drawTabs() {
    this.tabBtns.forEach((b) => b.destroy());
    this.tabBtns = [];
    const gap = 5;
    const tw = Math.floor((W - 24 - gap * (TABS.length - 1)) / TABS.length);
    const x0 = (W - (tw * TABS.length + gap * (TABS.length - 1))) / 2;
    TABS.forEach((t, i) => {
      const active = i === this.tab;
      const b = fancyButton(this, Math.round(x0 + tw / 2 + i * (tw + gap)), 82, {
        w: tw - (tw % 2), h: 40, label: t.label, theme: active ? 'gold' : 'steel', size: 14, pulse: active, shine: active,
        onClick: () => this.setTab(i),
      });
      b.setDepth(12);
      if (!active) b.setAlpha(0.85);
      this.tabBtns.push(b);
    });
  }

  private applyFilter() {
    const f = this.filter;
    this.shown = this.entries.filter((e) => f === 'all' || e.group === f || e.info);
    const def = TABS[this.tab];
    const n = this.shown.filter((e) => !e.info).length;
    this.subtitle.setText(`${def.title} · ${n} รายการ — แตะการ์ดเพื่อดูรายละเอียด`);
    fitText(this.subtitle, W - 360);
    const chipsH = this.drawChips();
    this.buildGrid(chipsH);
    this.select(0, true);
  }

  /** ปุ่มกรองแบบชิป (ไหลขึ้นบรรทัดใหม่ได้) — คืนความสูงที่ใช้ */
  private drawChips(): number {
    this.chipObjs.forEach((o) => o.destroy());
    this.chipObjs = [];
    const filters = TABS[this.tab].filters;
    if (!filters) return 0;
    const x0 = LIST.x + PAD + 2;
    const maxX = LIST.x + LIST.w - PAD - 2;
    const ch = 28;
    let x = x0;
    let y = LIST.y + PAD + 2;
    for (const f of filters) {
      const active = f.id === this.filter;
      const count = f.id === 'all' ? this.entries.filter((e) => !e.info).length : this.entries.filter((e) => e.group === f.id).length;
      const t = txt(this, 0, 0, `${f.label} ${count}`, 13, active ? '#1a1c2c' : COLORS.text, active ? { stroke: '#fff2b0', strokeThickness: 0 } : {}).setOrigin(0.5).setDepth(8);
      if (active) t.setShadow(0, 0, '#000', 0, false, false);
      const cw = Math.ceil(t.width) + 20;
      if (x + cw > maxX && x > x0) {
        x = x0;
        y += ch + 6;
      }
      const g = this.add.graphics().setDepth(7);
      const draw = (hover: boolean) => {
        g.clear();
        if (active) {
          g.fillGradientStyle(0xfff2b0, 0xfff2b0, 0xffcd75, 0xffcd75, 1);
          g.fillRoundedRect(x, y, cw, ch, 8);
          g.lineStyle(2, 0xc28a50, 1).strokeRoundedRect(x, y, cw, ch, 8);
        } else {
          g.fillStyle(hover ? 0x566c86 : 0x333c57, 0.85).fillRoundedRect(x, y, cw, ch, 8);
          g.lineStyle(1, hover ? 0xffcd75 : 0x566c86, 1).strokeRoundedRect(x, y, cw, ch, 8);
        }
      };
      draw(false);
      t.setPosition(x + cw / 2, y + ch / 2 - 1);
      const zone = this.add.zone(x, y - 3, cw, ch + 6).setOrigin(0).setDepth(9).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => draw(true)).on('pointerout', () => draw(false)).on('pointerup', () => {
        if (this.filter === f.id) return;
        this.filter = f.id;
        Sfx.play('click');
        this.applyFilter();
      });
      this.chipObjs.push(g, t, zone);
      x += cw + 6;
    }
    return y + ch + 8 - (LIST.y + PAD + 2);
  }

  // ======================================================================
  // กริดการ์ด
  // ======================================================================
  private buildGrid(chipsH: number) {
    if (this.grid) {
      this.tweens.killTweensOf(this.grid.content.list);
      this.gridTweens.forEach((t) => t.remove());
      this.gridTweens = [];
      this.grid.destroy();
    }
    const gx = LIST.x + PAD;
    const gy = LIST.y + PAD + chipsH + (chipsH ? 0 : 2);
    const grid = new ScrollView(this, gx, gy, LIST.w - PAD * 2, LIST.y + LIST.h - PAD - gy, 5);
    this.grid = grid;
    grid.onTap = (lx, ly) => {
      const i = this.cardAt(lx, ly);
      if (i >= 0) this.select(i);
    };
    grid.onHover = (lx, ly) => this.setHover(this.cardAt(lx, ly));

    const cellW = Math.floor((grid.w - 10) / COLS);
    const cw = cellW - 6;
    this.cards = this.shown.map((e, i) => this.makeCard(e, (i % COLS) * cellW + 3, Math.floor(i / COLS) * CELL_H + 3, cw, CARD_H, i));
    this.hoverG = this.add.graphics();
    this.selG = this.add.graphics();
    grid.content.add([this.hoverG, this.selG]);
    grid.setContentHeight(Math.ceil(this.shown.length / COLS) * CELL_H + 6);
    this.hover = -1;
  }

  private cardAt(lx: number, ly: number) {
    if (lx < 0) return -1;
    return this.cards.findIndex((c) => lx >= c.x && lx <= c.x + c.w && ly >= c.y && ly <= c.y + c.h);
  }

  private makeCard(e: Entry, x: number, y: number, w: number, h: number, i: number): Card {
    const box = this.add.container(x, y);
    const col = e.info ? 0x73eff7 : RARITY[e.rarity].hex;
    const g = this.add.graphics();
    // พื้นการ์ด: ไล่สีเข้ม + แถบสว่างด้านบน + ขอบสีตามความหายาก
    g.fillGradientStyle(0x333c57, 0x333c57, 0x1a1c2c, 0x1a1c2c, 0.95);
    g.fillRoundedRect(0, 0, w, h, 8);
    g.fillStyle(col, 0.1).fillRoundedRect(4, 4, w - 8, 56, 6);
    g.lineStyle(2, col, e.rarity === 'common' && !e.info ? 0.45 : 0.85).strokeRoundedRect(0, 0, w, h, 8);
    g.fillStyle(col, 0.9).fillRect(10, h - 4, w - 20, 2);
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (e.featured) {
      const glow = this.add.image(w / 2, 32, 'cat_glow').setTint(0xffcd75).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
      const rim = this.add.graphics();
      rim.lineStyle(4, 0xffcd75, 0.35).strokeRoundedRect(-1, -1, w + 2, h + 2, 9);
      rim.setBlendMode(Phaser.BlendModes.ADD);
      this.gridTweens.push(this.tweens.add({ targets: [glow, rim], alpha: { from: 0.15, to: 0.6 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (i % 5) * 120 }));
      parts.push(glow, rim);
    }
    const icon = this.makeSprite(e.sprite, w / 2, 58, false).setOrigin(0.5, 1);
    const base = hdFit(icon, w - 22, 50, 4);
    icon.setScale(base);
    const name = txt(this, w / 2, 62, e.name, 13, e.info ? '#73eff7' : RARITY[e.rarity].color, { align: 'center', wordWrap: { callback: thaiWrap(w - 8) }, maxLines: 2 }).setOrigin(0.5, 0);
    parts.push(icon, name);
    if (e.badge || e.info) {
      const b = txt(this, 5, 3, e.info ? 'ℹ คู่มือ' : e.badge!, 10, e.info ? '#73eff7' : e.featured ? COLORS.gold : COLORS.dim).setOrigin(0, 0);
      fitText(b, w - 10);
      parts.push(b);
    }
    if (e.price) {
      const pi = this.add.image(0, h - 15, e.price.icon).setScale(1);
      const pt = txt(this, 0, h - 15, e.price.text, 11, COLORS.gold).setOrigin(0, 0.5);
      fitText(pt, w - 30);
      const tw = pi.displayWidth + 4 + pt.displayWidth;
      pi.setX(w / 2 - tw / 2 + pi.displayWidth / 2);
      pt.setX(w / 2 - tw / 2 + pi.displayWidth + 4);
      parts.push(pi, pt);
    }
    box.add([g, ...parts]);
    // (ต้องใส่หลังพื้นการ์ด ไม่งั้นพื้นการ์ดทับภาพ — กรณีภาพโหลดไว้แล้ว callback ถูกเรียกทันที)
    // มีภาพวาด → ภาพเล็กเต็มแถบบนของการ์ด (ไอคอนพิกเซลซ่อนไว้)
    if (e.sceneArt || e.info) {
      const tabArt = smallArtKey(this, e.sceneArt ?? `cat_${TABS[this.tab].id}`);
      if (tabArt) {
        box.addAt(placeArtCover(this.add.image(0, 0, tabArt), 4, 4, w - 8, 54), 1);
        icon.setVisible(false);
      }
    } else {
      // ภาพ 1:1 ในกรอบกว้าง → โฟกัสส่วนบน ไม่ตัดหัวตัวละคร/มอน
      withItemThumb(this, e.art ?? e.id, (k) => {
        if (!box.active) return;
        const art = placeArtCover(this.add.image(0, 0, k), 4, 4, w - 8, 54, 0.2);
        box.addAt(art, 1);
        icon.setVisible(false);
      });
    }
    this.grid!.content.add(box);
    // เข้าฉากแบบไล่ทีละใบ
    box.setAlpha(0).setY(y + 8);
    this.tweens.add({ targets: box, alpha: 1, y, duration: 220, delay: Math.min(i, 24) * 14, ease: 'Cubic.easeOut' });
    return { e, box, icon, base, x, y, w, h };
  }

  private setHover(i: number) {
    if (i === this.hover) return;
    const prev = this.cards[this.hover];
    if (prev) this.tweens.add({ targets: prev.icon, scale: prev.base, duration: 120 });
    this.hover = i;
    this.hoverG.clear();
    this.input.setDefaultCursor(i >= 0 ? 'pointer' : 'default');
    const c = this.cards[i];
    if (!c) return;
    this.hoverG.fillStyle(0xffffff, 0.07).fillRoundedRect(c.x, c.y, c.w, c.h, 8);
    this.hoverG.lineStyle(2, 0xfff2b0, 0.7).strokeRoundedRect(c.x - 1, c.y - 1, c.w + 2, c.h + 2, 9);
    this.tweens.add({ targets: c.icon, scale: c.base * 1.15, duration: 140, ease: 'Back.easeOut' });
    Sfx.play('click', 40);
  }

  private moveSel(d: number) {
    if (!this.shown.length) return;
    const n = Phaser.Math.Clamp(this.sel + d, 0, this.shown.length - 1);
    if (n !== this.sel) this.select(n);
  }

  private select(i: number, quiet = false) {
    const c = this.cards[i];
    if (!c) {
      this.sel = -1;
      this.selG.clear();
      this.clearDetail();
      return;
    }
    this.sel = i;
    this.selG.clear();
    this.selG.lineStyle(3, 0xffcd75, 1).strokeRoundedRect(c.x - 2, c.y - 2, c.w + 4, c.h + 4, 10);
    this.selG.fillStyle(0xfff2b0, 1);
    for (const [px, py] of [[c.x - 3, c.y - 3], [c.x + c.w - 1, c.y - 3], [c.x - 3, c.y + c.h - 1], [c.x + c.w - 1, c.y + c.h - 1]]) this.selG.fillRect(px, py, 4, 4);
    this.grid?.reveal(c.y, c.y + c.h);
    if (!quiet) Sfx.play('click');
    this.showDetail(c.e);
  }

  // ======================================================================
  // แผงรายละเอียด
  // ======================================================================
  private clearDetail() {
    this.headTimer?.remove(false);
    this.headTimer = null;
    this.tweens.killTweensOf(this.headObjs);
    this.headObjs.forEach((o) => o.destroy());
    this.headObjs = [];
    this.tweens.killTweensOf(this.detail.content.list);
    this.detail.clear();
  }

  private showDetail(e: Entry) {
    this.shownEntry = e;
    this.clearDetail();
    this.drawPreview(e);
    this.drawHeader(e);
    let y = 2;
    const cw = this.detail.w - 12;
    for (const b of e.blocks) y = this.drawBlock(b, y, cw);
    this.detail.setContentHeight(y + 10);
  }

  private head<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as unknown as Phaser.GameObjects.Components.Depth).setDepth?.(6);
    this.headObjs.push(o);
    return o;
  }

  /** รูปตัวอย่างใหญ่: แสงเรืองตามความหายาก + เงาวงรี + ลอยขึ้นลง */
  private drawPreview(e: Entry) {
    const col = e.info ? 0x73eff7 : RARITY[e.rarity].hex;
    const p = PREV;
    const tabId = TABS[this.tab].id;
    // ภาพวาดรายไอเทม: มีแล้วใช้เลย · มีในรายชื่อแต่ยังไม่โหลด = โหลดแล้ววาดใหม่
    const artId = e.art ?? e.id;
    // โหลดเสร็จทีหลัง → วาดหน้ารายละเอียดใหม่ (ถ้าโหลดไว้แล้ว callback ถูกเรียกทันที — ห้ามวาดซ้ำ ไม่งั้นวนไม่จบ)
    let sync = true;
    const loaded = !e.sceneArt && withItemArt(this, artId, () => !sync && this.shownEntry === e && this.showDetail(e));
    sync = false;
    const artKey = loaded ? itemArtKey(this, artId) : null;
    // ภาพฉาก (การ์ดคำอธิบาย/แผงตลาด) หรือหน้าคู่มือใช้ภาพฉากของแท็บเต็มกรอบ
    const infoArt = !artKey && (e.sceneArt || e.info) ? coverCrop(this, e.sceneArt ?? `cat_${tabId}`, p.w, p.h, p.x, p.y, 0.5) : null;
    const ownArt = !!artKey || !!infoArt;
    // ไม่มีภาพวาด: บอสใช้ภาพบอส · ที่เหลือพื้นเรียบ (ไม่เอาฉากวาดมาซ้อนกับพิกเซลขยาย ดูขัดกัน)
    const special = !ownArt && tabId === 'mobs' ? bossArt(e.id) : null;
    const tabArt = artKey
      ? this.head(placeArtCover(this.add.image(0, 0, artKey), p.x, p.y, p.w, p.h))
      : infoArt ?? (special ? coverCrop(this, special, p.w, p.h, p.x, p.y, 0.35) : null);
    if (tabArt) this.head(tabArt);
    const bg = this.head(this.add.graphics());
    bg.fillGradientStyle(0x29366f, 0x29366f, 0x0b0d1f, 0x0b0d1f, ownArt ? 0 : special ? 0.5 : 0.9);
    bg.fillRoundedRect(p.x, p.y, p.w, p.h, 10);
    bg.lineStyle(2, col, 0.6).strokeRoundedRect(p.x, p.y, p.w, p.h, 10);
    // แสงพื้นหลัง
    const cx = p.x + p.w / 2;
    const floor = p.y + p.h - 26;
    const glow = this.head(this.add.image(cx, floor - 44, 'cat_glow').setTint(col).setScale(2.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.45));
    this.tweens.add({ targets: glow, alpha: 0.25, scale: 2.3, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // เงา + วงแสงที่พื้น
    const shadow = this.head(this.add.ellipse(cx, floor + 2, 96, 18, 0x0b0d1f, 0.6));
    const ring = this.head(this.add.ellipse(cx, floor + 2, 120, 22, col, 0.22).setBlendMode(Phaser.BlendModes.ADD));
    this.tweens.add({ targets: ring, scaleX: 0.85, scaleY: 0.85, alpha: 0.12, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const sprites: Phaser.GameObjects.Sprite[] = [];
    const s1 = this.makeSprite(e.sprite, cx, floor, true).setOrigin(0.5, 1);
    sprites.push(s1);
    if (e.sprite2) {
      const s2 = this.makeSprite(e.sprite2, cx, floor, true).setOrigin(0.5, 1);
      const sc = Math.min(hdFit(s1, p.w / 2 - 16, 104, 5), hdFit(s2, p.w / 2 - 16, 104, 5));
      s1.setScale(sc).setX(cx - p.w / 4 + 4);
      s2.setScale(sc).setX(cx + p.w / 4 - 4);
      sprites.push(s2);
    } else s1.setScale(hdFit(s1, p.w - 24, 104, 4));
    if (ownArt) {
      // มีภาพวาดเต็มกรอบแล้ว → ตัวในเกมย่อเป็นป้ายเล็กมุมขวาล่าง
      glow.setVisible(false);
      shadow.setVisible(false);
      ring.setVisible(false);
      // ภาพตัวอย่างใช้ภาพวาดเท่านั้น — ไม่แสดงตัวพิกเซลในเกม
      for (const sp of sprites) sp.setVisible(false);
    }
    for (const s of sprites) this.head(s);
    shadow.setSize(Math.min(p.w - 20, Math.max(40, sprites.reduce((a, s) => a + s.displayWidth, 0) * 0.8)), 16);
    if (!ownArt) this.tweens.add({ targets: sprites, y: floor - 5, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: shadow, scaleX: 0.85, alpha: 0.4, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // ประกายรอบของเทพ/บอส
    if (e.featured || e.rarity === 'legendary' || e.rarity === 'epic') {
      this.headTimer = this.time.addEvent({
        delay: e.featured ? 160 : 320, loop: true, callback: () => {
          const s = this.add.image(cx + Phaser.Math.Between(-50, 50), floor - Phaser.Math.Between(0, 90), 'sparkle')
            .setDepth(7).setScale(Phaser.Math.Between(1, 2)).setBlendMode(Phaser.BlendModes.ADD).setTint(Phaser.Math.RND.pick([0xffffff, col, 0xfff2b0]));
          this.headObjs.push(s);
          this.tweens.add({
            targets: s, y: s.y - Phaser.Math.Between(12, 26), alpha: { from: 1, to: 0 }, angle: 90, duration: 900,
            onComplete: () => {
              s.destroy();
              const k = this.headObjs.indexOf(s);
              if (k >= 0) this.headObjs.splice(k, 1);
            },
          });
        },
      });
    }
    // เด้งเข้า
    for (const s of sprites) {
      const sc = s.scale;
      s.setScale(sc * 0.6);
      this.tweens.add({ targets: s, scale: sc, duration: 260, ease: 'Back.easeOut' });
    }
  }

  /** ชื่อ + ป้ายความหายาก + สรุปสั้น (ข้างรูปตัวอย่าง) */
  private drawHeader(e: Entry) {
    const x = HEAD_X;
    const bottom = PREV.y + PREV.h;
    const color = e.info ? '#73eff7' : RARITY[e.rarity].color;
    // ชื่อของ (ตัดบรรทัดได้) = ฟอนต์ปกติ · ระดับเทพ = สีทอง
    const name = txt(this, x, PREV.y, e.name, 20, e.rarity === 'legendary' && !e.info ? '#ffcd75' : color);
    name.setWordWrapCallback(thaiWrap(HEAD_W)).setMaxLines(2);
    this.head(name);
    let y = PREV.y + name.height + 4;
    const tag = e.tag ?? `★ ${RARITY[e.rarity].name}`;
    const t = this.head(txt(this, x + 8, y + 2, tag, 12, color));
    fitText(t, HEAD_W - 16);
    const chip = this.head(this.add.graphics());
    chip.fillStyle(e.info ? 0x73eff7 : RARITY[e.rarity].hex, 0.18).fillRoundedRect(x, y, t.displayWidth + 16, 22, 6);
    chip.lineStyle(1, e.info ? 0x73eff7 : RARITY[e.rarity].hex, 0.8).strokeRoundedRect(x, y, t.displayWidth + 16, 22, 6);
    chip.setDepth(5);
    y += 30;
    for (const q of e.quick) {
      const room = Math.floor((bottom - y) / 17);
      if (room < 1) break;
      const line = this.head(txt(this, x, y, q, 13, '#d6e4ee', { wordWrap: { callback: thaiWrap(HEAD_W) }, maxLines: Math.min(3, room), lineSpacing: 2 }));
      y += line.height + 4;
    }
    // ค่าของไอเทม (ถ้าเป็นไอเทมจริง)
    const def = ITEMS[e.id];
    if (def && def.value > 1 && bottom - y >= 18) {
      const ci = this.head(this.add.image(x + 8, bottom - 9, 'i_coin'));
      const ct = this.head(txt(this, x + 20, bottom - 9, `มูลค่า ${def.value}`, 12, COLORS.gold).setOrigin(0, 0.5));
      ci.setDepth(6);
      ct.setDepth(6);
    }
  }

  /** วาดบล็อกเนื้อหา 1 บล็อก คืนค่า y ถัดไป */
  private drawBlock(b: Block, y: number, cw: number): number {
    const c = this.detail.content;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      c.add(o);
      return o;
    };
    switch (b.k) {
      case 'text': {
        const t = add(txt(this, 0, y, b.text, Math.max(14, b.size ?? 14), b.color ?? COLORS.text, { wordWrap: { callback: thaiWrap(cw) }, lineSpacing: 5 }));
        return y + t.height + 6;
      }
      case 'section': {
        y += 6;
        const t = add(txt(this, 0, y, b.title, 15, b.color ?? COLORS.gold));
        fitText(t, cw);
        const g = add(this.add.graphics());
        g.fillGradientStyle(0xffcd75, 0xffcd75, 0xffcd75, 0xffcd75, 0.6, 0, 0.6, 0);
        g.fillRect(0, y + t.displayHeight + 1, cw, 1);
        return y + t.displayHeight + 7;
      }
      case 'stats': {
        let x = 0;
        const h = 24;
        for (const [label, value] of b.items) {
          const lt = txt(this, 0, 0, label, 12, COLORS.dim).setOrigin(0, 0.5);
          const vt = txt(this, 0, 0, value, 14, COLORS.cream).setOrigin(0, 0.5);
          const w = Math.ceil(lt.width + vt.width) + 18;
          if (x + w > cw && x > 0) {
            x = 0;
            y += h + 4;
          }
          const g = this.add.graphics();
          g.fillStyle(0x29366f, 0.75).fillRoundedRect(x, y, Math.min(w, cw), h, 6);
          g.lineStyle(1, 0x41a6f6, 0.55).strokeRoundedRect(x, y, Math.min(w, cw), h, 6);
          lt.setPosition(x + 7, y + h / 2);
          vt.setPosition(x + 11 + lt.width, y + h / 2 - 1);
          c.add([g, lt, vt]);
          x += w + 5;
        }
        return y + h + 6;
      }
      case 'station': {
        const g = add(this.add.graphics());
        const iconW = b.icon ? 40 : 0;
        const t = add(txt(this, iconW + 8, y + 5, `🛠 ${b.station}`, 14, COLORS.gold, { wordWrap: { callback: thaiWrap(cw - iconW - 14) }, maxLines: 2 }));
        let hh = t.height + 8;
        if (b.note) {
          const n = add(txt(this, iconW + 8, y + 5 + t.height, b.note, 12, COLORS.dim, { wordWrap: { callback: thaiWrap(cw - iconW - 14) }, maxLines: 3, lineSpacing: 2 }));
          hh += n.height;
        }
        hh = Math.max(hh, b.icon ? 42 : 0);
        g.fillStyle(0xffcd75, 0.1).fillRoundedRect(0, y, cw, hh, 6);
        g.lineStyle(1, 0xffcd75, 0.4).strokeRoundedRect(0, y, cw, hh, 6);
        if (b.icon) {
          const s = add(this.makeSprite(b.icon, 22, y + hh / 2, false));
          s.setScale(hdFit(s, 34, 34, 2));
        }
        return y + hh + 4;
      }
      case 'mat': {
        const d = ITEMS[b.item];
        const slot = add(this.add.nineslice(19, y + 19, 'ui_slot', undefined, 36, 36, 6, 6, 6, 6));
        const s = add(this.makeSprite({ key: d?.icon ?? 'px' }, slot.x, slot.y, false));
        s.setScale(hdFit(s, 26, 26, 2));
        const q = add(txt(this, 35, y + 36, `${b.qty}`, 11, '#ffffff').setOrigin(1, 1));
        q.setDepth(1);
        const nm = add(txt(this, 46, y + 1, `${d?.name ?? b.item} ×${b.qty}`, 14, RARITY[d?.rarity ?? 'common'].color));
        fitText(nm, cw - 46);
        const src = add(txt(this, 46, y + 21, `หาได้จาก: ${b.src}`, 12, COLORS.dim, { wordWrap: { callback: thaiWrap(cw - 46) }, maxLines: 2, lineSpacing: 2 }));
        return y + Math.max(42, 21 + src.height + 2) + 4;
      }
      case 'row': {
        const ix = b.icon ? 34 : 0;
        if (b.icon) {
          const s = add(this.makeSprite(b.icon, 14, y + 12, false));
          s.setScale(hdFit(s, 26, 26, 2));
        }
        let rw = 0;
        if (b.right) {
          const rt = add(txt(this, cw, y + 2, b.right, 13, COLORS.gold).setOrigin(1, 0));
          rw = rt.width + 6;
          if (b.rightIcon) {
            const ri = add(this.add.image(cw - rt.width - 9, y + 11, b.rightIcon));
            rw += ri.displayWidth + 4;
          }
        }
        const t = add(txt(this, ix, y + 2, b.text, 14, b.color ?? COLORS.text, { wordWrap: { callback: thaiWrap(cw - ix - rw) }, maxLines: 2, lineSpacing: 2 }));
        let hh = t.height + 2;
        if (b.sub) {
          const s = add(txt(this, ix, y + 2 + t.height, b.sub, 12, COLORS.dim, { wordWrap: { callback: thaiWrap(cw - ix) }, maxLines: 3, lineSpacing: 2 }));
          hh += s.height;
        }
        return y + Math.max(hh, b.icon ? 26 : 0) + 5;
      }
      case 'bars': {
        const lw = 92;
        const rw = 86;
        const bw = cw - lw - rw - 8;
        b.rows.forEach((r, i) => {
          const lt = add(txt(this, 0, y + 9, r.label, 12, COLORS.text).setOrigin(0, 0.5));
          fitText(lt, lw - 4);
          add(this.add.rectangle(lw, y + 9, bw, 10, 0x0b0d1f, 0.8).setOrigin(0, 0.5).setStrokeStyle(1, 0x566c86, 0.8));
          const fill = add(this.add.rectangle(lw + 1, y + 9, 0, 8, r.color, 1).setOrigin(0, 0.5));
          const target = Math.max(r.pct > 0 ? 2 : 0, (bw - 2) * Phaser.Math.Clamp(r.pct, 0, 1));
          this.tweens.addCounter({ from: 0, to: target, duration: 420, delay: i * 40, ease: 'Cubic.easeOut', onUpdate: (tw) => fill.active && fill.setSize(tw.getValue() ?? 0, 8) });
          const rt = add(txt(this, cw, y + 9, r.right ?? `${Math.round(r.pct * 100)}%`, 12, COLORS.gold).setOrigin(1, 0.5));
          fitText(rt, rw);
          y += 20;
        });
        return y + 4;
      }
      case 'icons': {
        const cell = 38;
        const per = Math.max(1, Math.floor(cw / cell));
        b.items.forEach((it, i) => {
          const x = (i % per) * cell + cell / 2;
          const yy = y + Math.floor(i / per) * cell + cell / 2;
          add(this.add.nineslice(x, yy, 'ui_slot', undefined, cell - 4, cell - 4, 6, 6, 6, 6));
          const s = add(this.makeSprite(it.icon, x, yy, false));
          s.setScale(hdFit(s, cell - 12, cell - 12, 2));
          // มีภาพวาด → ใช้ภาพวาด (ช่วงอัพเกรด = ย้อมสี + กรอบสีตามช่วง)
          if (it.art) {
            const band = it.band ?? null;
            withItemThumb(this, it.art, (k) => {
              if (!s.active) return;
              const img = add(placeArtCover(this.add.image(0, 0, k), x - (cell - 8) / 2, yy - (cell - 8) / 2, cell - 8, cell - 8));
              if (band === 'iron') img.setTint(0xc8d8ea);
              if (band === 'gold') img.setTint(0xffe2a0);
              if (band === 'legend') img.setTint(0xe6c8ff);
              if (band) add(this.add.rectangle(x, yy, cell - 6, cell - 6).setStrokeStyle(2, BAND_TINT[band], 1));
              s.setVisible(false);
            });
          }
        });
        return y + Math.ceil(b.items.length / per) * cell + 4;
      }
    }
    return y;
  }

  // ======================================================================
  // ตัวช่วย
  // ======================================================================
  /** sprite จาก texture key (+frame แรกอัตโนมัติถ้าเป็นแผ่นรวม) — เล่นอนิเมชันได้ */
  private makeSprite(ref: SpriteRef, x: number, y: number, animate: boolean): Phaser.GameObjects.Sprite {
    const look = ensureLookKey(this, ref.key); // 'key@band' = หน้าตาอัพเกรด (สร้างตอนใช้ครั้งแรก)
    const key = this.textures.exists(look) ? look : '__MISSING';
    const tex = this.textures.get(key);
    let frame: string | number | undefined = ref.frame;
    if (frame !== undefined && !tex.has(String(frame))) frame = undefined;
    if (frame === undefined && tex.frameTotal > 1) frame = tex.getFrameNames()[0];
    const s = this.add.sprite(x, y, key, frame);
    if (animate && ref.anim && this.anims.exists(ref.anim)) s.play(key.includes('@') ? variantAnim(this, ref.anim, key.slice(key.indexOf('@') + 1) as 'iron' | 'gold' | 'legend') : ref.anim);
    if (ref.tint !== undefined) s.setTint(ref.tint);
    if (ref.alpha !== undefined) s.setAlpha(ref.alpha);
    return s;
  }
}
