import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { CONTROL_MODES, controlLabel, getControlMode, setControlMode } from '../core/ControlMode';
import { TASK_PRESETS } from '../systems/AutoSystem';
import { SPECIAL_NAME, SPECIAL_SLOT, fmtLeft, nextOpenText } from '../core/SpecialIsland';
import { EventBus } from '../core/EventBus';
import { MetaSave } from '../core/MetaSave';
import { CENTER_SLOT, getRoomService, localPlayerId, type TradeListing } from '../core/RoomService';
import type { AchievementDef } from '../data/achievements';
import { itemInfo, itemSources } from '../data/encyclopedia';
import { EQUIP_SLOTS, STAT_INFO, type EquipSlot, type Stats } from '../data/equipment';
import { BIOMES, GRID, SLOT_SIZE, SPECIALTY_NAMES } from '../data/islands';
import { ITEMS, ITEM_LIST } from '../data/items';
import { BOXES, RARITY, type BoxTier, type Rarity } from '../data/loot';
import { BAND_INFO, MAX_LEVEL, bandOf } from '../data/upgrade';
import { lookKey } from '../gfx/UpgradeLook';
import { bandName, itemStatAt } from '../systems/UpgradeSystem';
import { GOLD_BOX_GEMS, LEGEND_BOX_GEMS } from '../data/loot';
import { INTRO_SLIDES, STORY } from '../data/quests';
import { HOTBAR_SIZE, type Inventory } from '../components/Inventory';
import { Wallet } from '../components/Wallet';
import type { Structure } from '../entities/Structure';
import { CAPES, HELMETS, OUTFITS, buildHeroTexture, heroKey } from '../gfx/art/heroes';
import type { Offer } from '../systems/MarketSystem';
import { TILE, isWater } from '../world/tiles';
import { vehicleKind } from '../data/vehicles';
import { ART, coverCrop, coverImage, queueArt, type ArtName } from '../ui/art';
import { itemArtKey, placeArtCover, queueItemArtIndex, withItemArt } from '../ui/itemArt';
import { BlueprintWindow } from '../ui/BlueprintWindow';
import { fitText } from '../ui/fancyButton';
import { Foldable, UIWindow } from '../ui/Window';
import { button, COLORS, heading, panel, SlotView, StatBar, txt, type Button } from '../ui/widgets';
import { STARTER_BASES, STARTER_WEAPONS, type StarterPick } from '../data/starter';
import { BUILD } from '../data/buildables';
import { SKIN, skinFor } from '../gfx/art/terrain';
import type { GameScene } from './GameScene';

const W = 960;
const H = 540;
const SLOT = 46;
const GAP = 4;
interface ReviveOffer { coins: number; gems: number; canCoins: boolean; canGems: boolean; haveCoins: number; haveGems: number; cause: string; times: number }
interface GameOverInfo { cause: string; room: string; days: number; kills: number; power: number; broke: boolean; cost: { coins: number; gems: number }; adventure?: boolean }
const MINI = 96;

/** HUD + หน้าต่างทั้งหมด (พับ/ปิด/ลากได้) + ปุ่มจอสัมผัส */
export class UIScene extends Phaser.Scene {
  private gs!: GameScene;
  private bars: Record<string, { bar: StatBar; value: Phaser.GameObjects.Text }> = {};
  private walletText!: Phaser.GameObjects.Text;
  private gemText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private xpBg!: Phaser.GameObjects.Rectangle;
  private xpBar!: Phaser.GameObjects.Rectangle;
  private portrait!: Phaser.GameObjects.Sprite;
  private dayText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private placeText!: Phaser.GameObjects.Text;
  private miniImg!: Phaser.GameObjects.Image;
  private miniGfx!: Phaser.GameObjects.Graphics;
  private specialChip!: Phaser.GameObjects.Text;
  /** ป้าย "⚔ เขตผจญภัย" มุมขวาบน (ซ้ายของมินิแมป) */
  private advBadge!: Phaser.GameObjects.Text;
  private miniTimer = 0;
  private hotbar: SlotView[] = [];
  private hotbarRect!: Phaser.Geom.Rectangle;
  private skillBox!: Phaser.GameObjects.NineSlice;
  private skillCover!: Phaser.GameObjects.Rectangle;
  private skillText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private heldName!: Phaser.GameObjects.Text;
  private lastSelected = -1;
  private toasts: Phaser.GameObjects.Text[] = [];
  private feed: Phaser.GameObjects.Text[] = [];
  private questTitle!: Phaser.GameObjects.Text;
  private questText!: Phaser.GameObjects.Text;
  private questBox!: Phaser.GameObjects.NineSlice;
  /** 📌 แผงติดตามแปลนที่ปักหมุด (ใต้แผงเป้าหมาย) */
  private pinBox!: Phaser.GameObjects.NineSlice;
  private pinTitle!: Phaser.GameObjects.Text;
  private pinText!: Phaser.GameObjects.Text;
  private pinTimer = 0;
  private bossBar!: StatBar;
  private bossName!: Phaser.GameObjects.Text;
  private bossGroup: Phaser.GameObjects.GameObject[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private lastHp = 0;
  private toolbarRect!: Phaser.Geom.Rectangle;
  private touchLayer!: Phaser.GameObjects.Container;
  private modal: Phaser.GameObjects.Container | null = null;

  private wins: UIWindow[] = [];
  private bagWin!: UIWindow;
  private blueprint!: BlueprintWindow;
  private infoWin!: UIWindow;
  private storageWin!: UIWindow;
  private tradeWin!: UIWindow;
  private marketWin!: UIWindow;
  private enhanceWin!: UIWindow;
  private wardrobeWin!: UIWindow;
  private mapWin!: UIWindow;
  private pauseWin!: UIWindow;
  private autoWin!: UIWindow;
  private refreshers: (() => void)[] = [];
  private refreshTimer = 0;

  constructor() {
    super('UIScene');
  }

  private gamePaused = false;

  create() {
    // โหลดภาพประกอบที่ยังขาดแบบเบื้องหลัง (ไม่ใช้ preload — ซีนนี้ต้องพร้อมพร้อมกับ GameScene เพื่อไม่พลาดอีเวนต์ตอนเริ่ม)
    queueItemArtIndex(this, true);
    queueArt(this, ART, true);
    this.gamePaused = false;
    this.gs = this.scene.get('GameScene') as GameScene;
    this.registry.set('uiOpen', false);
    this.toasts = [];
    this.feed = [];
    this.hotbar = [];
    this.bars = {};
    this.wins = [];
    this.refreshers = [];
    this.modal = null;
    this.lastSelected = -1;
    this.bagKey = '';
    this.lastHp = this.gs.player.hp;

    this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0.7);
    this.hurtFlash = this.add.rectangle(0, 0, W, H, 0xb13e53, 0).setOrigin(0);
    this.buildStatus();
    this.buildMinimap();
    this.buildQuest();
    this.buildBoss();
    this.buildHotbar();
    this.buildToolbar();
    this.hintText = txt(this, W / 2, H - 98, '', 17, COLORS.gold).setOrigin(0.5);
    this.heldName = txt(this, W / 2, H - 122, '', 16).setOrigin(0.5).setAlpha(0);
    this.statusText = txt(this, W / 2, 62, '', 15, COLORS.gold).setOrigin(0.5, 0);
    this.advBadge = txt(this, W - 12 - MINI - 16, 8, '⚔ เขตผจญภัย\nPvP · ตายถาวร', 11, '#ffffff', { align: 'center', lineSpacing: 1 })
      .setOrigin(1, 0).setBackgroundColor('#b13e53dd').setPadding(6, 3, 6, 3).setDepth(6).setVisible(false);
    this.buildInspectCard();
    this.autoChip = txt(this, W / 2 - 176, H - 72, '', 13, '#a7f070').setOrigin(0, 1).setBackgroundColor('#0b0d1fcc').setPadding(6, 3, 6, 3).setDepth(7).setVisible(false);
    this.padLegend = this.add.container(0, H - 70).setDepth(7);
    const lg = txt(this, W / 2, 0, '🎮 RT ตี/ยิง · Ⓐ ใช้/คุย · Ⓑ หลบ · Ⓧ กิน/สวม · Ⓨ สกิล · LT วิ่ง · LB/RB สลับของ · ↑↓ ซูม · Back กระเป๋า · Start เมนู', 11, COLORS.dim).setOrigin(0.5, 0.5);
    const lgBg = this.add.rectangle(W / 2, 0, lg.width + 20, 18, 0x0b0d1f, 0.6);
    this.padLegend.add([lgBg, lg]).setVisible(false);
    this.buildTouch();

    this.bagWin = this.makeBag();
    this.blueprint = new BlueprintWindow(this, this.gs, (t, c) => this.toast(t, c));
    this.register(this.blueprint.win, () => this.blueprint.refresh());
    this.infoWin = this.makeInfo();
    this.storageWin = this.makeStorage();
    this.tradeWin = this.makeTrade();
    this.marketWin = this.makeMarket();
    this.enhanceWin = this.makeEnhance();
    this.wardrobeWin = this.makeWardrobe();
    this.mapWin = this.makeMap();
    this.pauseWin = this.makePause();
    this.autoWin = this.makeAuto();

    const kb = this.input.keyboard!;
    kb.on('keydown-TAB', () => this.toggleBag());
    kb.on('keydown-C', () => this.toggleBag());
    kb.on('keydown-J', () => this.infoWin.toggle());
    kb.on('keydown-M', () => this.mapWin.toggle());
    kb.on('keydown-O', () => this.wardrobeWin.toggle());
    EventBus.on('ui:auto', this.toggleAuto, this);
    this.events.once('shutdown', () => EventBus.off('ui:auto', this.toggleAuto, this));
    kb.on('keydown-N', () => this.toggleSound());
    kb.on('keydown-Z', () => !this.modal && this.quickDeposit());
    const escape = () => {
      const open = this.wins.filter((w) => w.visible);
      if (this.gs.build.on) this.gs.build.cancel();
      else if (open.length) open.forEach((w) => w.close());
      else this.pauseWin.open();
    };
    kb.on('keydown-ESC', escape);
    EventBus.on('pad:menu', escape);
    EventBus.on('pad:bag', () => this.toggleBag());
    this.events.once('shutdown', () => {
      EventBus.off('pad:menu', escape);
      EventBus.off('pad:bag');
    });

    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.events.once('shutdown', () => EventBus.off(ev, fn));
    };
    on('toast', (t: string, c?: string) => this.toast(t, c));
    on('pickup', (id: string, n: number) => this.pickup(id, n));
    on('banner', (name: string, desc: string, color: string) => this.banner(name, desc, color));
    on('achievement', (a: AchievementDef) => this.achievement(a));
    on('quest:done', (q: { title: string }) => this.toast(`✔ สำเร็จ: ${q.title}`, COLORS.good));
    on('ui:build', () => this.blueprint.toggle('build'));
    on('ui:market', () => this.marketWin.open());
    on('ui:trade', (stall: number) => this.openTrade(stall));
    on('ui:enhance', () => this.enhanceWin.open());
    on('ui:storage', (s: Structure) => this.openStorage(s));
    on('ui:boxopen', (tier: BoxTier, loot: { item: string; qty: number; rarity: Rarity }[]) => this.showBox(tier, loot));
    on('ui:death', (cause: string, lost: number, items: number, lv0: number, lv1: number) => this.showDeath(cause, lost, items, lv0, lv1));
    on('ui:gameover', (r: GameOverInfo) => this.showGameOver(r));
    on('ui:revive', (r: ReviveOffer) => this.showRevive(r));
    on('ui:intro', () => this.showIntro(0));
    on('ui:starter', () => this.showStarter());
    on('ui:guide', (title: string, lines: string[]) => this.showGuide(title, lines));
    on('ui:splash', (o: { art: string; title: string; sub?: string; color?: string; hold?: number }) => this.showSplash(o));
    on('ui:adventure', (name: string) => this.showAdventureRules(name));
    on('ui:adventure_enter', (name: string) => this.adventureFlash(name));
    on('disaster:warn', (d: { name: string; warning: string; color: string }) => this.banner(`คืนนี้: ${d.name}`, d.warning, d.color));
  }

  // ======================================================================
  // API
  // ======================================================================
  isPointerOverUI(p: Phaser.Input.Pointer): boolean {
    // UIScene ยังโหลดภาพอยู่ (preload) — HUD ยังไม่ถูกสร้าง
    if (!this.toolbarRect) return false;
    if (this.modal) return true;
    if (this.pinBox?.visible && this.pinBox.getBounds().contains(p.x, p.y)) return true;
    if (this.wins.some((w) => w.contains(p.x, p.y))) return true;
    if (this.toolbarRect.contains(p.x, p.y)) return true;
    if (this.touchLayer.visible && (p.x < 290 && p.y > 200)) return true;
    return this.hotbarRect.contains(p.x, p.y) || this.skillBox.getBounds().contains(p.x, p.y);
  }

  // ---------- การ์ดข้อมูล (จิ้ม/ชี้/เดินใกล้) ----------
  private padLegend!: Phaser.GameObjects.Container;
  private autoChip!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.Container;
  private cardBg!: Phaser.GameObjects.NineSlice;
  private cardTitle!: Phaser.GameObjects.Text;
  private cardBody!: Phaser.GameObjects.Text;
  private cardKey = '';

  private buildInspectCard() {
    this.cardBg = this.add.nineslice(0, 0, 'ui_panel_dark', undefined, 270, 60, 10, 10, 10, 10).setOrigin(0).setAlpha(0.92);
    this.cardTitle = txt(this, 12, 8, '', 14, COLORS.gold);
    this.cardBody = txt(this, 12, 28, '', 11, COLORS.text, { wordWrap: { width: 248 }, lineSpacing: 2 });
    this.card = this.add.container(0, 0, [this.cardBg, this.cardTitle, this.cardBody]).setDepth(8).setVisible(false);
  }

  private updateInspectCard(touch: boolean) {
    const info = this.gs.inspect.info;
    if (!info || this.modal) {
      this.card.setVisible(false);
      this.cardKey = '';
      return;
    }
    const key = `${info.title}|${info.lines.join('|')}`;
    if (key !== this.cardKey) {
      const fresh = !this.card.visible || !this.cardKey.startsWith(info.title);
      this.cardKey = key;
      this.cardTitle.setText(info.title).setColor(info.color);
      this.cardBody.setText(info.lines.join('\n'));
      this.cardBg.setSize(270, 36 + this.cardBody.height);
      if (fresh) {
        this.card.setAlpha(0);
        this.tweens.add({ targets: this.card, alpha: 1, duration: 140 });
      }
    }
    // คอม: มุมขวาล่าง · มือถือ: กลางบน (ไม่ทับปุ่มสัมผัส)
    const h = this.cardBg.height;
    if (touch) this.card.setPosition(W / 2 - 135, 62);
    else this.card.setPosition(W - 282, this.pinBox.visible ? Math.max(H - 92 - h, this.pinBox.y + this.pinBox.height + 4) : H - 92 - h); // ไม่ทับแผงปักหมุด
    this.card.setVisible(true);
  }

  private register(w: UIWindow, refresh?: () => void) {
    this.wins.push(w);
    if (refresh) this.refreshers.push(() => w.visible && !w.collapsed && refresh());
    return w;
  }

  private toggleBag() {
    if (!this.bagWin.visible) this.bagWin.open();
    else {
      this.bagWin.close();
      if (this.blueprint.section === 'items') this.blueprint.win.close();
    }
  }

  // ======================================================================
  // HUD
  // ======================================================================
  /** แผงสถานะแบบกะทัดรัด (มุมซ้ายบน) */
  private buildStatus() {
    const p = this.gs.player;
    const parts: Phaser.GameObjects.GameObject[] = [];
    parts.push(panel(this, 6, 6, 188, 114));
    this.portrait = this.add.sprite(24, 30, p.texKey, 0).setScale(1.5);
    parts.push(this.portrait);
    this.levelText = txt(this, 44, 28, '', 10, COLORS.gold);
    this.xpBg = this.add.rectangle(44, 43, 138, 4, 0x0b0d1f).setOrigin(0, 0.5);
    this.xpBar = this.add.rectangle(44, 43, 0, 4, 0xa77bdb).setOrigin(0, 0.5);
    parts.push(txt(this, 44, 11, this.gs.playerName, 13), this.levelText, this.xpBg, this.xpBar);
    const rows: [string, string, number][] = [
      ['hp', 'hud_heart', 0xb13e53], ['hunger', 'hud_food', p.char.passive.robot ? 0x73eff7 : 0xc28a50],
      ['thirst', 'hud_water', 0x41a6f6], ['stamina', 'hud_stamina', 0xffcd75],
      ['temp', 'hud_temp', 0xa7f070], ['sanity', 'hud_sanity', 0xa77bdb],
    ];
    rows.forEach(([key, icon, color], i) => {
      const x = 16 + (i % 2) * 88;
      const y = 58 + Math.floor(i / 2) * 16;
      parts.push(this.add.image(x, y, icon).setScale(1.4));
      const bar = new StatBar(this, x + 8, y, 50, 10, color);
      const value = txt(this, x + 61, y, '', 9).setOrigin(0, 0.5);
      parts.push(...bar.objects, value);
      this.bars[key] = { bar, value };
    });
    parts.push(this.add.image(16, 105, 'i_coin').setScale(0.9), this.add.image(84, 105, 'i_gem').setScale(0.9));
    this.walletText = txt(this, 25, 105, '', 11, COLORS.gold).setOrigin(0, 0.5);
    this.gemText = txt(this, 92, 105, '', 11, '#73eff7').setOrigin(0, 0.5);
    this.powerText = txt(this, 186, 105, '', 10, '#ef7d57').setOrigin(1, 0.5);
    parts.push(this.walletText, this.gemText, this.powerText);
    new Foldable(this, 10, 122, parts, 'สถานะ');
  }

  private buildMinimap() {
    const x0 = W - 12 - MINI;
    const y0 = 14;
    if (this.textures.exists('minimap')) this.textures.remove('minimap');
    this.textures.createCanvas('minimap', MINI, MINI);
    const parts: Phaser.GameObjects.GameObject[] = [panel(this, x0 - 8, y0 - 8, MINI + 16, MINI + 44, 'ui_panel_dark')];
    this.miniImg = this.add.image(x0, y0, 'minimap').setOrigin(0);
    this.miniGfx = this.add.graphics();
    this.dayText = txt(this, x0, y0 + MINI + 3, '', 11);
    this.clockText = txt(this, x0 + MINI, y0 + MINI + 4, '', 9, COLORS.dim).setOrigin(1, 0);
    this.placeText = txt(this, x0 + MINI / 2, y0 + MINI + 19, '', 9, COLORS.gold).setOrigin(0.5, 0);
    // แตะมินิแมป = เปิดแผนที่ใหญ่
    this.miniImg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.mapWin.toggle());
    const expand = txt(this, x0 + MINI - 2, y0 + 2, '⤢ ขยาย', 9, COLORS.text).setOrigin(1, 0).setBackgroundColor('#0b0d1fcc').setPadding(3, 1, 3, 1);
    expand.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.mapWin.toggle());
    this.specialChip = txt(this, x0 + 2, y0 + MINI - 2, '', 9, COLORS.gold).setOrigin(0, 1).setBackgroundColor('#0b0d1fcc').setPadding(3, 1, 3, 1);
    parts.push(this.miniImg, this.miniGfx, this.dayText, this.clockText, this.placeText, expand, this.specialChip);
    new Foldable(this, x0 - 4, y0 + MINI + 38, parts, 'แผนที่ย่อ');
  }

  /** มินิแมปวาดรอบตัวผู้เล่น (1 px = 1 tile, รัศมี 70 tile) */
  private drawMinimap() {
    const g = this.gs;
    const tex = this.textures.get('minimap') as Phaser.Textures.CanvasTexture;
    const ctx = tex.getContext();
    const img = ctx.createImageData(MINI, MINI);
    const cx = Math.floor(g.player.x / 16) - MINI / 2;
    const cy = Math.floor(g.player.y / 16) - MINI / 2;
    for (let y = 0; y < MINI; y++) {
      for (let x = 0; x < MINI; x++) {
        const tx = cx + x;
        const ty = cy + y;
        const slot = g.world.slotIndexAt(tx, ty);
        let col = TILE_RGB[TILE.DEEP];
        if (slot >= 0 && g.world.generated.has(slot)) {
          col = tileColor(g.world.tiles[ty * g.world.size + tx], g.world.slots[slot]?.biome);
          if (g.structureAt(tx, ty, 'object')) col = [255, 205, 117];
        }
        const k = (y * MINI + x) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    }
    // ปากถ้ำดันเจี้ยนบนเกาะ = จุดม่วง 3×3 (พิชิตแล้ว = เขียว)
    for (const pt of g.world.portals) {
      const mx = pt.tx - cx;
      const my = pt.ty - cy;
      const col = g.interiors.conquered.has(pt.interior) ? [167, 240, 112] : [199, 125, 255];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = mx + dx;
          const y = my + dy;
          if (x < 0 || y < 0 || x >= MINI || y >= MINI) continue;
          const k = (y * MINI + x) * 4;
          img.data[k] = col[0];
          img.data[k + 1] = col[1];
          img.data[k + 2] = col[2];
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  private buildQuest() {
    const x = W - 12 - MINI - 10;
    this.questBox = panel(this, x - 104, 168, MINI + 20 + 104, 58, 'ui_panel_dark');
    this.questTitle = txt(this, x - 92, 176, '', 11, COLORS.gold);
    this.questText = txt(this, x - 92, 193, '', 10, COLORS.text, { wordWrap: { width: MINI + 96 } });
    new Foldable(this, x - 100, 228, [this.questBox, this.questTitle, this.questText], 'เป้าหมาย');
    // 📌 แปลนที่ปักหมุด: ของดิบที่ยังขาด (นับรวมหีบ/โกดัง) — แตะเพื่อเปิดสมุดแปลนหน้านั้น
    this.pinBox = panel(this, x - 104, 246, MINI + 20 + 104, 40, 'ui_panel_dark').setInteractive({ useHandCursor: true }).setVisible(false);
    this.pinTitle = txt(this, x - 92, 253, '', 11, '#73eff7').setVisible(false);
    this.pinText = txt(this, x - 92, 270, '', 10, COLORS.text, { lineSpacing: 2 }).setVisible(false);
    this.pinBox.on('pointerdown', () => this.blueprint.showPinned());
  }

  /** อัปเดตแผงปักหมุด (ทุก 0.4 วิ) — มือถือย้ายไปฝั่งซ้ายใต้แผงสถานะ (ไม่ทับปุ่มสัมผัส) */
  private updatePin(touch: boolean) {
    const info = this.gs.pinInfo();
    const show = !!info && !this.modal;
    [this.pinBox, this.pinTitle, this.pinText].forEach((o) => o.setVisible(show));
    if (!show) return;
    const rows = [...info!.rows].sort((a, b) => Number(a.have >= a.need) - Number(b.have >= b.need));
    const maxRows = touch ? 3 : 5;
    const lines = rows.slice(0, maxRows).map((r) => `${r.have >= r.need ? '✔' : '✘'} ${ITEMS[r.item]?.name ?? r.item} ${Math.min(r.have, 9999)}/${r.need}${r.stored ? ` 📦${r.stored}` : ''}`);
    if (rows.length > maxRows) lines.push(`… อีก ${rows.length - maxRows} อย่าง`);
    this.pinTitle.setText(`📌 ${info!.name}${info!.ready ? ' — ✔ พร้อมสร้าง (B)' : ''}`).setColor(info!.ready ? COLORS.good : '#73eff7');
    this.pinText.setText(lines.join('\n'));
    const w = MINI + 20 + 104;
    const x = touch ? 6 : W - 12 - MINI - 10 - 104;
    const y = touch ? 140 : 246;
    this.pinBox.setPosition(x, y).setSize(w, 26 + this.pinText.height + 6);
    this.pinTitle.setPosition(x + 12, y + 7);
    this.pinText.setPosition(x + 12, y + 24);
    fitText(this.pinTitle, w - 20);
  }

  private buildBoss() {
    this.bossName = txt(this, W / 2, 84, '', 15, '#ef7d57').setOrigin(0.5, 0);
    this.bossBar = new StatBar(this, W / 2 - 180, 114, 360, 16, 0xb13e53);
    this.bossGroup = [this.bossName, ...this.bossBar.objects];
    this.setVis(this.bossGroup, false);
  }

  private setVis(list: Phaser.GameObjects.GameObject[], v: boolean) {
    for (const o of list) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  private buildHotbar() {
    const total = HOTBAR_SIZE * SLOT + (HOTBAR_SIZE - 1) * GAP;
    const x0 = (W - total) / 2 + SLOT / 2;
    const y = H - SLOT / 2 - 14;
    panel(this, (W - total) / 2 - 10, y - SLOT / 2 - 10, total + 20, SLOT + 20, 'ui_panel_dark');
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const v = new SlotView(this, x0 + i * (SLOT + GAP), y, SLOT, String(i + 1));
      v.bg.setInteractive().on('pointerdown', () => (this.gs.player.selected = i));
      this.hotbar.push(v);
    }
    this.hotbarRect = new Phaser.Geom.Rectangle((W - total) / 2 - 10, y - SLOT / 2 - 10, total + 20, SLOT + 20);
    const sx = (W + total) / 2 + 24 + SLOT / 2;
    this.skillBox = this.add.nineslice(sx, y, 'ui_btn_hover', undefined, SLOT + 4, SLOT + 4, 8, 8, 8, 8);
    txt(this, sx, y - 4, this.gs.player.char.skill.name, 10).setOrigin(0.5);
    txt(this, sx - SLOT / 2 + 4, y - SLOT / 2 + 2, 'Q', 11, COLORS.dim);
    this.skillCover = this.add.rectangle(sx - SLOT / 2, y + SLOT / 2, SLOT, SLOT, 0x000000, 0.6).setOrigin(0, 1);
    this.skillText = txt(this, sx, y + 10, '', 14).setOrigin(0.5);
  }

  /** แถบปุ่มด้านบน (ใช้ได้ทั้งคอมและมือถือ) */
  private buildToolbar() {
    const items: [string, string, () => void][] = [
      ['🎒', 'กระเป๋า Tab', () => this.toggleBag()],
      ['📐', 'แปลน B', () => this.blueprint.toggle('build')],
      ['⬆', 'อัพเกรด U', () => this.gs.build.toggleUpgrade()],
      ['📖', 'คู่มือ J', () => this.infoWin.toggle()],
      ['🗺', 'แผนที่ M', () => this.mapWin.toggle()],
      ['👕', 'ชุด O', () => this.wardrobeWin.toggle()],
      ['🤖', 'งานอัตโนมัติ T', () => this.autoWin.toggle()],
      ['🎥', '2.5D V', () => this.gs.setTilt(this.gs.tilt > 0 ? 0 : 0.6)],
      ['➕', 'ซูมเข้า', () => this.gs.setZoom(this.gs.zoom * 1.2)],
      ['➖', 'ซูมออก', () => this.gs.setZoom(this.gs.zoom / 1.2)],
      ['⚙', 'เมนู Esc', () => this.pauseWin.toggle()],
    ];
    const bw = 42;
    const x0 = W / 2 - (items.length * bw) / 2;
    panel(this, x0 - 8, 4, items.length * bw + 16, 52, 'ui_panel_dark');
    items.forEach(([icon, tip, fn], i) => {
      const x = x0 + i * bw + bw / 2;
      const b = this.add.nineslice(x, 26, 'ui_slot', undefined, bw - 4, 36, 6, 6, 6, 6).setInteractive({ useHandCursor: true });
      txt(this, x, 25, icon, 17).setOrigin(0.5);
      const tipT = txt(this, x, 48, tip, 10, COLORS.dim).setOrigin(0.5, 0).setVisible(false).setDepth(30);
      b.on('pointerover', () => tipT.setVisible(true)).on('pointerout', () => tipT.setVisible(false)).on('pointerdown', () => {
        Sfx.unlock();
        fn();
      });
    });
    this.toolbarRect = new Phaser.Geom.Rectangle(x0 - 8, 4, items.length * bw + 16, 52);
  }

  private updateHUD(delta: number) {
    const g = this.gs;
    const p = g.player;
    const set = (k: string, v: number, max: number, color?: number) => {
      const b = this.bars[k];
      b.bar.set(v / max, delta);
      b.value.setText(String(Math.max(0, Math.ceil(v))));
      if (color !== undefined) b.bar.setColor(color);
    };
    set('hp', p.hp, p.maxHp);
    set('hunger', p.hunger, 100);
    set('thirst', p.thirst, 100);
    set('stamina', p.stamina, p.maxStamina);
    set('temp', p.temp, 100, p.temp < 25 ? 0x41a6f6 : p.temp > 75 ? 0xef7d57 : 0xa7f070);
    set('sanity', p.sanity, 100);
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    this.bars.hunger.bar.setAlpha(p.hunger < 20 && blink ? 0.3 : 1);
    this.bars.thirst.bar.setAlpha(p.thirst < 20 && blink ? 0.3 : 1);
    this.bars.hp.bar.setAlpha(p.hp < p.maxHp * 0.25 && blink ? 0.3 : 1);
    this.walletText.setText(g.wallet.coins.toLocaleString());
    this.gemText.setText(String(g.wallet.gems));
    this.powerText.setText(`พลัง ${g.player.power.toLocaleString()}`);
    const last = g.player.level <= 1;
    this.levelText.setText(`Lv.${g.player.level} · XP ${g.player.xp}/${g.player.xpNeed}${last ? ' ⚠' : ''}`).setColor(last ? COLORS.bad : COLORS.gold);
    this.xpBar.width = 138 * Math.min(1, g.player.xp / g.player.xpNeed);
    if (this.portrait.texture.key !== p.texKey) this.portrait.setTexture(p.texKey, 0);
    if (p.hp < this.lastHp - 0.5) {
      this.hurtFlash.setAlpha(0.28);
      this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 350 });
    }
    this.lastHp = p.hp;

    const dn = g.dayNight;
    const phase = { day: 'กลางวัน', dusk: 'พลบค่ำ', night: 'กลางคืน', dawn: 'รุ่งสาง' }[dn.phase];
    this.dayText.setText(`วันที่ ${dn.day}`);
    this.clockText.setText(`${dn.clock} ${{ day: '☀', dusk: '🌇', night: '🌙', dawn: '🌅' }[dn.phase]}`);
    void phase;
    const is = g.world.slots[g.currentSlot];
    const overWater = isWater(g.tileAt(Math.floor(g.player.x / 16), Math.floor(g.player.y / 16)));
    const air = g.riding?.def.boat && vehicleKind(g.riding.def.boat) === 'air';
    const where = g.boatRiding && overWater ? (air ? '🎈 เหนือทะเล' : '⛵ กลางทะเล') : is ? `${air ? '🎈 ' : ''}${is.name}` : 'ทะเล';
    this.placeText.setText(`${where}${g.weather.state !== 'clear' ? ` · ${g.weather.name}` : ''}`);
    this.placeText.setScale(Math.min(1, (MINI + 12) / Math.max(1, this.placeText.width)));
    this.miniTimer -= delta;
    if (this.miniTimer <= 0) {
      this.miniTimer = 400;
      this.drawMinimap();
    }
    const mg = this.miniGfx.clear().fillStyle(0xff3355, 1).fillRect(W - 12 - MINI / 2 - 2, 14 + MINI / 2 - 2, 4, 4);
    // เกาะพิเศษ: สถานะ + ลูกศรชี้ทาง (ตอนเปิด)
    const sp = g.special;
    this.specialChip.setText(sp.open ? `✨ เกาะพิเศษ ${fmtLeft(sp.msLeft)}` : `🔒 เกาะพิเศษ ${fmtLeft(sp.msLeft)}`).setColor(sp.open ? COLORS.gold : '#a77bdb');
    const sis = g.world.slots[SPECIAL_SLOT];
    if (sp.open && sis) {
      const dx = sis.cx - p.x / 16;
      const dy = sis.cy - p.y / 16;
      if (Math.hypot(dx, dy) > MINI / 2) {
        const a = Math.atan2(dy, dx);
        const cx = W - 12 - MINI / 2 + Math.cos(a) * (MINI / 2 - 8);
        const cy = 14 + MINI / 2 + Math.sin(a) * (MINI / 2 - 8);
        const pulse = 5 + Math.sin(this.time.now / 200) * 1.5;
        mg.fillStyle(0xffcd75, 1).fillTriangle(
          cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse,
          cx + Math.cos(a + 2.4) * pulse, cy + Math.sin(a + 2.4) * pulse,
          cx + Math.cos(a - 2.4) * pulse, cy + Math.sin(a - 2.4) * pulse,
        );
      }
    }

    for (let i = 0; i < HOTBAR_SIZE; i++) this.hotbar[i].set(p.inventory.slots[i], i === p.selected);
    if (p.selected !== this.lastSelected) {
      this.lastSelected = p.selected;
      const held = p.held;
      const def = held ? ITEMS[held.id] : null;
      this.heldName.setText(def ? `${held!.plus ? `Lv.${held!.plus + 1} ` : ''}${def.name}` : '').setColor(def ? RARITY[def.rarity ?? 'common'].color : COLORS.text).setAlpha(1);
      this.tweens.killTweensOf(this.heldName);
      this.tweens.add({ targets: this.heldName, alpha: 0, delay: 1200, duration: 400 });
    }
    this.skillCover.setSize(SLOT, SLOT * (p.skillCd / p.char.skill.cooldown));
    this.skillText.setText(p.skillCd > 0 ? String(Math.ceil(p.skillCd)) : '');
    const touch = g.controls.touchMode;
    const pad = g.controls.padMode;
    this.hintText.setText(g.hint ? `${pad ? 'Ⓐ' : touch ? '[ใช้]' : '[E]'} ${g.hint}` : '');
    this.padLegend.setVisible(pad && !this.modal);
    this.touchLayer.setVisible(touch && !this.modal);
    this.pinTimer -= delta;
    if (this.pinTimer <= 0) {
      this.pinTimer = 400;
      this.updatePin(touch);
    }
    this.updateInspectCard(touch);
    const au = g.auto;
    this.autoChip.setVisible(au.active && !this.modal);
    if (au.active) this.autoChip.setText(au.status).setColor(au.paused ? '#ef7d57' : '#a7f070').setAlpha(au.paused ? 1 : 0.9 + Math.sin(this.time.now / 300) * 0.1);
    void pad;

    // เป้าหมาย: บทสอนเล่น → หลังจบเป็นเคล็ดลับอิสระ
    const q = g.quests?.current;
    if (q) {
      this.questTitle.setText(`★ ${q.title} (${(g.quests!.index + 1)}/${STORY.length})`);
      const target = g.quests!.target;
      this.questText.setText(q.text + (q.goal.type === 'visit' ? '' : ` (${Math.min(g.quests!.progress, target)}/${target})`));
    } else {
      this.questTitle.setText('★ เล่นอิสระ');
      this.questText.setText('ขยันฟาร์ม ขุดแร่ ตกปลา ล่ามอน เปิดกล่อง อัพเกรด — เกาะยิ่งใหญ่ตามความขยันของคุณ');
    }
    const boss = g.boss;
    const showBoss = !!boss && boss.active && Phaser.Math.Distance.Between(boss.x, boss.y, p.x, p.y) < 300;
    this.setVis(this.bossGroup, showBoss);
    if (showBoss) {
      this.bossName.setText(`👑 ${boss!.def.name}`);
      this.bossBar.set(boss!.hp / boss!.def.hp, delta);
    }
    const ds = g.disaster.status;
    this.statusText.setText(g.playerSafe ? '🕊 เขตปลอดภัย — ห้ามต่อสู้' : ds ?? '').setColor(g.playerSafe ? COLORS.good : COLORS.gold);
    this.advBadge.setVisible(g.inAdventure && !this.modal);
    if (g.inAdventure) this.advBadge.setAlpha(0.85 + Math.sin(this.time.now / 260) * 0.15);
  }

  // ======================================================================
  // แจ้งเตือน
  // ======================================================================
  private toast(text: string, color = COLORS.text) {
    const t = txt(this, W / 2, 0, text, 16, color).setOrigin(0.5, 0).setDepth(40);
    this.toasts.push(t);
    if (this.toasts.length > 4) this.toasts.shift()?.destroy();
    this.toasts.forEach((x, i) => x.setY(140 + i * 24));
    this.tweens.add({
      targets: t, alpha: 0, delay: 2800, duration: 500,
      onComplete: () => {
        this.toasts = this.toasts.filter((x) => x !== t);
        t.destroy();
        this.toasts.forEach((x, i) => x.setY(140 + i * 24));
      },
    });
  }

  private pickup(id: string, n: number) {
    const def = ITEMS[id];
    const t = txt(this, 16, 0, `+${n.toLocaleString()} ${def.name}`, 15, RARITY[def.rarity ?? 'common'].color);
    this.feed.push(t);
    if (this.feed.length > 5) this.feed.shift()?.destroy();
    this.feed.forEach((f, i) => f.setY(H - 190 - (this.feed.length - 1 - i) * 20));
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => {
      this.feed = this.feed.filter((x) => x !== t);
      t.destroy();
    } });
  }

  private banner(name: string, desc: string, color: string) {
    const t = heading(this, W / 2, H / 2 - 120, name, 38).setOrigin(0.5).setAlpha(0).setDepth(9);
    const d = txt(this, W / 2, H / 2 - 80, desc, 16, color).setOrigin(0.5).setAlpha(0).setDepth(9);
    this.tweens.add({ targets: [t, d], alpha: 1, duration: 400, yoyo: true, hold: 2000, onComplete: () => (t.destroy(), d.destroy()) });
  }

  private achievement(a: AchievementDef) {
    const c = this.add.container(W + 10, 360).setDepth(45);
    c.add([panel(this, 0, 0, 290, 62), txt(this, 14, 8, `🏆 ${a.name}`, 16, COLORS.gold), txt(this, 14, 34, a.desc, 12, COLORS.dim)]);
    this.tweens.add({ targets: c, x: W - 300, duration: 400, ease: 'Back.easeOut', yoyo: true, hold: 3000, onComplete: () => c.destroy() });
  }

  private toggleSound() {
    const muted = Sfx.toggleMute();
    this.toast(muted ? '🔇 ปิดเสียง' : '🔊 เปิดเสียง', COLORS.dim);
  }

  // ======================================================================
  // ส่วนประกอบหน้าต่าง
  // ======================================================================
  /** กริดช่องไอเทมในหน้าต่าง */
  private grid(win: UIWindow, x: number, y: number, cols: number, count: number, size: number, onClick: (i: number, p: Phaser.Input.Pointer) => void, onHover?: (i: number) => void, labels = false) {
    const views: SlotView[] = [];
    for (let i = 0; i < count; i++) {
      const v = new SlotView(this, x + (i % cols) * (size + 3) + size / 2, y + Math.floor(i / cols) * (size + 3) + size / 2, size, labels ? String(i + 1) : undefined);
      v.bg.setInteractive({ useHandCursor: true }).on('pointerdown', (p: Phaser.Input.Pointer) => onClick(i, p));
      if (onHover) v.bg.on('pointerover', () => onHover(i));
      win.add(v.objects);
      views.push(v);
    }
    return views;
  }

  private tabs<T extends string>(win: UIWindow, x: number, y: number, list: [T, string][], w: number, onPick: (t: T) => void, perRow = list.length) {
    const btns: { id: T; b: Button }[] = [];
    list.forEach(([id, label], i) => {
      const b = button(this, x + (i % perRow) * (w + 4) + w / 2, y + Math.floor(i / perRow) * 32 + 14, w, 28, label, () => onPick(id), true, 12);
      win.add(b.objects);
      btns.push({ id, b });
    });
    return (active: T) => btns.forEach((t) => t.b.hover.setVisible(t.id === active));
  }

  // ---------- ตัวละคร + กระเป๋า (เลเวล + อุปกรณ์ 12 ช่อง) ----------
  private bagPicked: number | null = null;
  private bagSel: number | null = null;
  private eqSel: EquipSlot | null = null;
  private bagKey = '';
  private showBaseBuffs = false;

  private makeBag() {
    const w = new UIWindow(this, 110, 40, 740, 484, 'ตัวละคร & กระเป๋า (Tab)');
    const gs = this.gs;
    const inv = gs.player.inventory;
    // ---- ฝั่งซ้าย: หุ่นอุปกรณ์ ----
    w.add(panel(this, 0, 0, 244, 252, 'ui_panel_dark'));
    const glow = this.add.ellipse(122, 150, 96, 18, 0x73eff7, 0.18);
    const preview = this.add.sprite(122, 104, gs.player.texKey, 0).setScale(4);
    w.add([glow, preview]);
    const SL = 38;
    const pos: [EquipSlot, number, number][] = [
      ['head', 26, 28], ['body', 26, 72], ['legs', 26, 116], ['feet', 26, 160],
      ['neck', 218, 28], ['back', 218, 72], ['hands', 218, 116], ['bag', 218, 160],
      ['weapon', 50, 222], ['offhand', 98, 222], ['ring1', 146, 222], ['ring2', 194, 222],
    ];
    const eqViews: { slot: EquipSlot; v: SlotView; ghost: Phaser.GameObjects.Image }[] = [];
    for (const [slot, x, y] of pos) {
      const v = new SlotView(this, x, y, SL);
      const ghost = this.add.image(x, y - 1, `eqslot_${slot}`).setScale(1.5).setAlpha(0.8);
      v.bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.clickEquip(slot));
      w.add([...v.objects, ghost]);
      eqViews.push({ slot, v, ghost });
    }
    const power = heading(this, 0, 262, '', 20);
    const statL = txt(this, 0, 290, '', 11, COLORS.text, { lineSpacing: 1 });
    const statR = txt(this, 124, 290, '', 11, COLORS.text, { lineSpacing: 1 });
    w.add([power, statL, statR]);
    const baseBtn = button(this, 122, 424, 244, 26, '🏠 บัฟจากฐาน', () => {
      this.showBaseBuffs = !this.showBaseBuffs;
      this.bagSel = null;
      this.eqSel = null;
      this.bagKey = '';
    }, true, 12);
    w.add(baseBtn.objects);

    // ---- ฝั่งขวา: กระเป๋า ----
    const RX = 258;
    const MAX_BAG = 44;
    const onClick = (index: number, p: Phaser.Input.Pointer) => {
      if (index >= inv.slots.length) return;
      this.showBaseBuffs = false;
      this.eqSel = null;
      if (p.rightButtonDown()) inv.split(index);
      else if (this.bagPicked === null) {
        if (inv.slots[index]) this.bagPicked = index;
      } else {
        inv.moveOrMerge(this.bagPicked, index);
        this.bagPicked = null;
      }
      this.bagSel = index;
      Sfx.play('click');
      this.bagKey = '';
    };
    const bagLabel = txt(this, RX, 0, '', 12, COLORS.dim);
    w.add(bagLabel);
    const bag = this.grid(w, RX, 18, 11, MAX_BAG, 36, (i, p) => onClick(HOTBAR_SIZE + i, p));
    w.add(txt(this, RX, 180, 'Hotbar (1–8)', 12, COLORS.dim));
    const hot = this.grid(w, RX, 198, 8, HOTBAR_SIZE, 36, (i, p) => onClick(i, p), undefined, true);
    const use = button(this, RX + 62, 258, 124, 28, 'ใช้ (F)', () => {
      if (this.eqSel) {
        gs.unequip(this.eqSel);
        this.eqSel = null;
      } else if (this.bagSel !== null && inv.slots[this.bagSel] && gs.slotFor(inv.slots[this.bagSel]!.id)) gs.equipFrom(this.bagSel);
      else this.useSlot(this.bagSel);
      this.bagKey = '';
    }, true, 13);
    const drop = button(this, RX + 186, 258, 100, 28, 'ทิ้ง', () => this.dropSlot(this.bagSel), true, 13);
    const sort = button(this, RX + 296, 258, 100, 28, 'จัดเรียง', () => this.sortBag(inv), true, 13);
    const craftB = button(this, RX + 400, 258, 96, 28, '🔨 คราฟต์', () => this.blueprint.toggle('items'), true, 13);
    w.add([...use.objects, ...drop.objects, ...sort.objects, ...craftB.objects]);
    const info = txt(this, RX, 282, '', 12, COLORS.text, { wordWrap: { width: 446 }, lineSpacing: 3 });
    w.add(info);
    // ⬆ อัพเกรดของที่เลือก (อาวุธ/เครื่องมือ/อุปกรณ์) — สำเร็จ 100%
    const upB = button(this, RX + 330, 424, 232, 26, '⬆ อัพเกรด', () => {
      const ref = this.eqSel ?? this.bagSel;
      if (ref === null) return;
      const r = gs.upgradeItem(ref);
      if (!r.ok) this.toast(r.msg, COLORS.bad);
      this.bagKey = '';
    }, true, 12);
    w.add(upB.objects);

    const statKeys: (keyof Stats)[][] = [['atk', 'def', 'hp', 'stamina', 'speed', 'crit', 'lifesteal'], ['gather', 'cold', 'light', 'luck', 'regen', 'bag']];
    return this.register(w, () => {
      const pl = gs.player;
      const key = `${inv.version}|${pl.texKey}|${JSON.stringify(pl.equip)}|${pl.power}|${this.bagPicked}|${this.bagSel}|${this.eqSel}|${this.showBaseBuffs}|${gs.wallet.coins}`;
      if (key === this.bagKey) return;
      this.bagKey = key;
      preview.setTexture(pl.texKey, 0);
      for (const e of eqViews) {
        e.v.set(pl.equip[e.slot], e.slot === this.eqSel);
        e.ghost.setVisible(!pl.equip[e.slot]);
      }
      power.setText(`Lv.${pl.level}  ⚔ พลังรวม ${pl.power.toLocaleString()}`);
      const fmt = (k: keyof Stats) => `${STAT_INFO[k].name} ${STAT_INFO[k].fmt(pl.stats[k])}`;
      statL.setText(statKeys[0].map(fmt).join('\n'));
      statR.setText(statKeys[1].map(fmt).join('\n'));
      const size = inv.slots.length - HOTBAR_SIZE;
      bagLabel.setText(`กระเป๋า ${inv.slots.slice(HOTBAR_SIZE).filter(Boolean).length}/${size} ช่อง`);
      bag.forEach((v, i) => {
        const on = i < size;
        v.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
        if (on) v.set(inv.slots[HOTBAR_SIZE + i], HOTBAR_SIZE + i === this.bagPicked);
      });
      hot.forEach((v, i) => v.set(inv.slots[i], i === this.bagPicked));
      // ข้อมูลด้านล่าง
      let lines: string[];
      let label = 'ใช้ (F)';
      if (this.showBaseBuffs) {
        lines = pl.baseBuffs.length
          ? ['🏠 บัฟจากสิ่งก่อสร้างในฐาน (มีผลตลอด ไม่ว่าอยู่ที่ไหน)', ...pl.baseBuffs.map((b) => `• ${b.name}: ${b.text}`)]
          : ['🏠 ยังไม่มีบัฟจากฐาน', 'สร้าง กระท่อม/บ้านหิน/เตียง/ธง/รูปปั้น/โต๊ะช่าง/ทั่ง ฯลฯ เพื่อเพิ่มพลังถาวร (ดูได้ในสมุดแปลน B)'];
      } else if (this.eqSel) {
        const s = pl.equip[this.eqSel];
        const meta = EQUIP_SLOTS.find((x) => x.id === this.eqSel)!;
        lines = s ? [...itemInfo(ITEMS[s.id], s.plus), '', 'คลิกช่องนี้อีกครั้ง หรือกด "ถอดออก" เพื่อถอด'] : [`ช่อง ${meta.name}: ${meta.hint}`, '', 'เลือกของในกระเป๋าแล้วคลิกช่องนี้เพื่อสวม'];
        label = s ? 'ถอดออก' : 'ใช้ (F)';
      } else {
        const s = this.bagSel !== null ? inv.slots[this.bagSel] : null;
        lines = s
          ? [...itemInfo(ITEMS[s.id], s.plus), '', 'หาได้จาก:', ...itemSources(s.id).slice(0, 3)]
          : ['ความเก่ง = เลเวล + อุปกรณ์ที่สวม (×เลเวลอัพเกรด) + บัฟจากฐาน (ตายแล้วเลเวลลด 1)', 'คลิกไอเทม = ดูรายละเอียด · คลิกอีกช่อง = ย้าย · คลิกขวา = แบ่งครึ่ง', 'เลือกอุปกรณ์แล้วกด "สวมใส่" หรือคลิกช่องบนหุ่นทางซ้าย'];
        if (s && gs.slotFor(s.id)) label = 'สวมใส่ (F)';
      }
      // ปุ่ม/ค่าอัพเกรดของชิ้นที่เลือก
      const upRef = this.showBaseBuffs ? null : this.eqSel ?? this.bagSel;
      const upSlot = upRef === null ? null : typeof upRef === 'string' ? pl.equip[upRef] : inv.slots[upRef];
      const chk = upRef !== null && upSlot && ITEMS[upSlot.id].enhanceable ? gs.upgrades.checkItem(upRef) : null;
      upB.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!chk));
      upB.hover.setVisible(false);
      if (chk) {
        if (chk.cost) {
          upB.setLabel(`⬆ อัพเกรด Lv.${chk.lv} → ${chk.lv + 1}`);
          lines.splice(2, 0, `⬆ Lv.${chk.lv}→${chk.lv + 1}: ${itemStatAt(ITEMS[upSlot!.id], chk.lv + 1)} · ค่าอัพ ${gs.upgrades.costLines(chk.cost)}${chk.err && !chk.err.startsWith('ขาด') ? ` · ${chk.err}` : ''}`);
        } else upB.setLabel(`✨ Lv.${chk.lv} สูงสุดแล้ว`);
        if (lines.length > 8) lines.length = 8; // เว้นที่ให้ปุ่มอัพเกรดมุมขวาล่าง
      }
      info.setText(lines.join('\n'));
      use.setLabel(label);
      baseBtn.setLabel(this.showBaseBuffs ? '🏠 ซ่อนบัฟจากฐาน' : `🏠 บัฟจากฐาน (${pl.baseBuffs.length})`);
    });
  }

  private clickEquip(slot: EquipSlot) {
    const gs = this.gs;
    this.showBaseBuffs = false;
    if (this.bagPicked !== null) {
      gs.equipFrom(this.bagPicked, slot);
      this.bagPicked = null;
      this.eqSel = slot;
    } else if (this.eqSel === slot && gs.player.equip[slot]) {
      gs.unequip(slot);
      this.eqSel = null;
    } else this.eqSel = slot;
    this.bagSel = null;
    this.bagKey = '';
    Sfx.play('click');
  }

  private useSlot(i: number | null) {
    if (i === null) return;
    const p = this.gs.player;
    if (i >= HOTBAR_SIZE) {
      p.inventory.moveOrMerge(i, p.selected);
      this.bagSel = p.selected;
    } else p.selected = i;
    this.gs.useHeld();
    this.bagKey = '';
  }

  private dropSlot(i: number | null) {
    if (i === null) return;
    const p = this.gs.player;
    const s = p.inventory.slots[i];
    if (!s) return;
    p.inventory.slots[i] = null;
    p.inventory.version++;
    this.gs.spawnDrop(p.x + p.aim.x * 20, p.y + p.aim.y * 20, s.id, s.qty, s.plus || s.dur !== undefined ? s : undefined);
  }

  private sortBag(inv: Inventory) {
    this.sortSlots(inv, HOTBAR_SIZE);
  }

  /** จัดเรียง (ตั้งแต่ช่อง from): รวมกองที่ไม่เต็มเข้าด้วยกันก่อน แล้วเรียงตามชนิด → id */
  private sortSlots(inv: Inventory, from: number) {
    const list: NonNullable<Inventory['slots'][number]>[] = [];
    for (const s of inv.slots.slice(from)) {
      if (!s) continue;
      const stack = ITEMS[s.id]?.stack ?? 1;
      let left = s.qty;
      if (!s.plus && s.dur === undefined && stack > 1) {
        for (const t of list) {
          if (left <= 0) break;
          if (t.id !== s.id || t.plus || t.dur !== undefined || t.qty >= stack) continue;
          const n = Math.min(stack - t.qty, left);
          t.qty += n;
          left -= n;
        }
      }
      if (left > 0) list.push({ ...s, qty: left });
    }
    list.sort((a, b) => ITEMS[a.id].type.localeCompare(ITEMS[b.id].type) || a.id.localeCompare(b.id) || (b.plus ?? 0) - (a.plus ?? 0) || b.qty - a.qty);
    for (let i = from; i < inv.slots.length; i++) inv.slots[i] = list[i - from] ?? null;
    inv.version++;
    Sfx.play('click');
  }

  /** Z / ปุ่ม: ฝากของในกระเป๋าที่ "มีอยู่แล้วในคลัง" (ไม่แตะ hotbar) — เปิดหีบอยู่ = หีบนั้น · ไม่ได้เปิด = หีบ/โกดังของเราในระยะ ~6 ช่อง */
  private quickDeposit() {
    const st = this.storageWin.visible ? this.liveStorage() : null;
    const r = this.gs.quickStack(st ? [st] : undefined);
    if (r.moved) {
      Sfx.play('pickup', 60);
      this.toast(`📦 ฝากของที่ซ้ำกับในคลังแล้ว ${r.moved.toLocaleString()} ชิ้น`, COLORS.good);
    } else this.toast(r.stores ? 'ไม่มีของในกระเป๋าที่ซ้ำกับในคลัง' : 'ไม่มีหีบ/โกดังของคุณอยู่ใกล้ (ประมาณ 6 ช่อง)', COLORS.dim);
  }

  // ---------- คู่มือ ----------
  private infoCat = 'all';
  private infoPage = 0;
  private infoSel: string | null = null;

  private makeInfo() {
    const w = new UIWindow(this, 100, 60, 760, 460, 'คู่มือไอเทม (J)');
    const cats: [string, string][] = [['all', 'ทั้งหมด'], ['material', 'วัตถุดิบ'], ['food', 'อาหาร'], ['tool', 'เครื่องมือ'], ['weapon', 'อาวุธ'], ['armor', 'เกราะ'], ['box', 'กล่อง/อื่นๆ']];
    const setTab = this.tabs(w, 0, 0, cats, 66, (c) => {
      this.infoCat = c;
      this.infoPage = 0;
    });
    let shown: string[] = [];
    const views = this.grid(w, 0, 40, 11, 66, 36, (i) => (this.infoSel = shown[i] ?? null));
    const detail = txt(this, 452, 40, '', 12, COLORS.text, { wordWrap: { width: 270 }, lineSpacing: 3 });
    const page = txt(this, 200, 290, '', 12, COLORS.dim).setOrigin(0.5);
    const prev = button(this, 120, 290, 50, 26, '◀', () => (this.infoPage = Math.max(0, this.infoPage - 1)), true, 12);
    const next = button(this, 280, 290, 50, 26, '▶', () => this.infoPage++, true, 12);
    w.add([detail, page, ...prev.objects, ...next.objects]);
    w.add(txt(this, 0, 320, 'สีชื่อบอกความหายาก: ธรรมดา · ดี · หายาก · มหากาพย์ · เทพ\nกล่อง: ไม้ < เหล็ก < ทอง < เทพ — ยิ่งระดับสูงของยิ่งดี (ดูอัตราดรอปในรายละเอียดกล่อง)', 12, COLORS.dim, { lineSpacing: 3 }));
    const group: Record<string, string[]> = { tool: ['tool', 'rod', 'light'], weapon: ['weapon', 'ranged', 'throw', 'ammo'], box: ['box', 'cosmetic', 'heal', 'seed'] };
    return this.register(w, () => {
      setTab(this.infoCat as never);
      const list = ITEM_LIST.filter((d) => this.infoCat === 'all' || (group[this.infoCat] ?? [this.infoCat]).includes(d.type)).map((d) => d.id);
      const pages = Math.max(1, Math.ceil(list.length / 66));
      this.infoPage = Math.min(this.infoPage, pages - 1);
      shown = list.slice(this.infoPage * 66, this.infoPage * 66 + 66);
      page.setText(`${this.infoPage + 1}/${pages}`);
      views.forEach((v, i) => v.set(shown[i] ? { id: shown[i], qty: 1 } : null, shown[i] === this.infoSel));
      const id = this.infoSel;
      if (!id) {
        detail.setText('คลิกไอเทมเพื่อดูรายละเอียด วิธีใช้ และแหล่งที่หาได้');
        return;
      }
      const def = ITEMS[id];
      const lines = [...itemInfo(def), '', 'หาได้จาก:', ...itemSources(id)];
      if (def.type === 'box') {
        const b = BOXES[id as BoxTier];
        lines.push('', `อัตราดรอป (${b.rolls[0]}-${b.rolls[1]} ชิ้น):`, ...(Object.entries(b.rarity) as [Rarity, number][]).filter(([, v]) => v > 0).map(([r, v]) => `  ${RARITY[r].name} ${v}%`));
      }
      detail.setText(lines.join('\n')).setColor(RARITY[def.rarity ?? 'common'].color);
      detail.setColor(COLORS.text);
    });
  }

  // ---------- หีบเก็บของ ----------
  private storageOf: Structure | null = null;

  private openStorage(s: Structure) {
    this.storageOf = s;
    s.setChestOpen(true);
    this.storageWin.open();
  }

  /** ที่เก็บของที่เปิดอยู่ — เจ้าของ (หีบ/ยาน) ถูกทำลายแล้ว = ปิดหน้าต่าง (กันฝากของหาย) */
  private liveStorage() {
    const o = this.storageOf;
    if (o && o.active && o.scene) return o.storage;
    if (this.storageWin.visible) {
      this.storageOf = null;
      this.storageWin.close();
    }
    return null;
  }

  private makeStorage() {
    const w = new UIWindow(this, 100, 70, 760, 420, 'หีบเก็บของ');
    const title = txt(this, 0, 0, '', 14, COLORS.gold);
    w.add([title, txt(this, 390, 0, 'กระเป๋าของคุณ (คลิกเพื่อฝาก)', 14, COLORS.gold)]);
    const chest = this.grid(w, 0, 24, 6, 60, 36, (i) => {
      const st = this.liveStorage();
      const s = st?.slots[i];
      if (!st || !s) return;
      if (this.gs.player.inventory.addSlot(s)) st.slots[i] = null;
      st.version++;
      Sfx.play('pickup', 40);
    });
    const mine = this.grid(w, 390, 24, 8, 28, 38, (i) => {
      const st = this.liveStorage();
      const inv = this.gs.player.inventory;
      const s = inv.slots[i];
      if (!st || !s) return;
      if (st.addSlot(s)) {
        inv.slots[i] = null;
        inv.version++;
      }
      Sfx.play('pickup', 40);
    });
    const all = button(this, 470, 216, 160, 32, 'ฝากทั้งหมด (ยกเว้น hotbar)', () => {
      const st = this.liveStorage();
      const inv = this.gs.player.inventory;
      if (!st) return;
      for (let i = HOTBAR_SIZE; i < inv.slots.length; i++) if (inv.slots[i] && st.addSlot(inv.slots[i]!)) inv.slots[i] = null;
      inv.version++;
    }, true, 12);
    const same = button(this, 640, 216, 160, 32, 'ฝากของที่ซ้ำกับในคลัง (Z)', () => this.quickDeposit(), true, 12);
    const sortChest = button(this, 470, 254, 160, 32, 'จัดเรียงคลัง', () => {
      const st = this.liveStorage();
      if (st) this.sortSlots(st, 0);
    }, true, 12);
    const sortMine = button(this, 640, 254, 160, 32, 'จัดเรียงกระเป๋า', () => this.sortBag(this.gs.player.inventory), true, 12);
    const tip = txt(this, 390, 278, '📦 ของในหีบ/โกดังบนเกาะของคุณถูกนับและหยิบใช้อัตโนมัติ ตอนสร้าง คราฟต์ อัพเกรด และซ่อม', 11, COLORS.dim, { wordWrap: { width: 330 }, lineSpacing: 2 });
    w.add([...all.objects, ...same.objects, ...sortChest.objects, ...sortMine.objects, tip]);
    w.onClose = () => this.storageOf?.setChestOpen(false);
    return this.register(w, () => {
      const st = this.liveStorage();
      if (!st) return;
      title.setText(`${this.storageOf!.def.name} (${st.slots.filter(Boolean).length}/${st.slots.length})`);
      chest.forEach((v, i) => {
        v.bg.setVisible(i < st.slots.length);
        v.set(i < st.slots.length ? st.slots[i] : null, false);
      });
      mine.forEach((v, i) => v.set(this.gs.player.inventory.slots[i] ?? null, false));
    });
  }

  // ---------- ตลาดผู้เล่นบนเกาะกลาง ----------
  private tradeStall = 0;
  private tradePage = 0;
  private sellIdx: number | null = null;
  private sellQty = 1;
  private sellPrice = 10;

  private openTrade(stall: number) {
    this.tradeStall = stall;
    this.tradePage = 0;
    this.tradeWin.open();
    // ออนไลน์: ดึงแผงล่าสุดจากเซิร์ฟเวอร์ (หน้าต่างอ่านจากแคชทุก 150 ms อยู่แล้ว)
    if (getRoomService().online) void getRoomService().sync();
  }

  private makeTrade() {
    const w = new UIWindow(this, 60, 50, 840, 470, 'ตลาดแลกเปลี่ยน (เกาะกลาง)');
    const rooms = getRoomService();
    w.add(txt(this, 0, 0, 'ของที่ผู้เล่นวางขาย', 15, COLORS.gold));
    const rows: { bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; btn: Button }[] = [];
    let shown: TradeListing[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 38 + i * 38;
      const bg = this.add.rectangle(0, y, 440, 34, 0x333c57, 0.45).setOrigin(0, 0.5);
      const icon = this.add.image(18, y, 'px').setScale(1.6);
      const name = txt(this, 38, y, '', 12).setOrigin(0, 0.5);
      const btn = button(this, 395, y, 86, 28, '', () => this.buyListing(shown[i]), true, 12);
      rows.push({ bg, icon, name, btn });
      w.add([bg, icon, name, ...btn.objects]);
    }
    const page = txt(this, 220, 352, '', 12, COLORS.dim).setOrigin(0.5);
    const prev = button(this, 150, 352, 50, 26, '◀', () => (this.tradePage = Math.max(0, this.tradePage - 1)), true, 12);
    const next = button(this, 290, 352, 50, 26, '▶', () => this.tradePage++, true, 12);
    w.add([page, ...prev.objects, ...next.objects]);
    w.add(txt(this, 0, 376, `ภาษีตลาด ${Wallet.TAX * 100}% · ของที่ขายได้ เงินจะส่งเข้าตู้จดหมายที่เกาะของคุณ\n🕊 เกาะกลางเป็นเขตปลอดภัย — ห้ามต่อสู้เด็ดขาด`, 11, COLORS.dim, { lineSpacing: 3 }));

    // ฝั่งวางขาย
    w.add(txt(this, 460, 0, 'วางขายของคุณ: เลือกไอเทม', 15, COLORS.gold));
    const pick = this.grid(w, 460, 24, 8, 28, 36, (i) => {
      this.sellIdx = i;
      const s = this.gs.player.inventory.slots[i];
      if (s) {
        this.sellQty = s.qty;
        this.sellPrice = Math.max(1, Math.round(ITEMS[s.id].value * s.qty * (1 + (s.plus ?? 0) * 0.5)));
      }
    });
    const sellInfo = txt(this, 460, 186, '', 13);
    const adj = (label: string, x: number, y: number, fn: () => void) => w.add(button(this, x, y, 44, 26, label, fn, true, 12).objects);
    adj('−', 480, 236, () => (this.sellQty = Math.max(1, this.sellQty - 1)));
    adj('+', 528, 236, () => (this.sellQty = Math.min(this.gs.player.inventory.slots[this.sellIdx ?? 0]?.qty ?? 1, this.sellQty + 1)));
    adj('−10', 600, 236, () => (this.sellPrice = Math.max(1, this.sellPrice - 10)));
    adj('−1', 648, 236, () => (this.sellPrice = Math.max(1, this.sellPrice - 1)));
    adj('+1', 696, 236, () => (this.sellPrice += 1));
    adj('+10', 744, 236, () => (this.sellPrice += 10));
    w.add([sellInfo, txt(this, 460, 254, 'จำนวน', 11, COLORS.dim), txt(this, 600, 254, 'ราคา (เหรียญ)', 11, COLORS.dim)]);
    const post = button(this, 640, 290, 220, 34, 'วางขายที่แผงนี้', () => this.postListing(), true, 14);
    w.add(post.objects);
    const mineTitle = txt(this, 460, 316, 'ของที่คุณวางขายอยู่ (คลิกเพื่อยกเลิก)', 12, COLORS.dim);
    const mineList = txt(this, 460, 336, '', 12, COLORS.text, { lineSpacing: 3 }).setInteractive({ useHandCursor: true });
    mineList.on('pointerdown', async () => {
      const mine = rooms.listings(this.gs.room.id).filter((l) => l.seller === localPlayerId());
      const l = mine[0];
      if (!l || this.tradeBusy) return;
      this.tradeBusy = true;
      const r = await rooms.cancelListing(this.gs.room.id, l.id);
      this.tradeBusy = false;
      if ('error' in r) return this.toast(r.error, COLORS.bad);
      this.receiveListing(l);
      this.toast(`ยกเลิกขาย ${ITEMS[l.item].name}`, COLORS.dim);
    });
    w.add([mineTitle, mineList]);
    return this.register(w, () => {
      const list = rooms.listings(this.gs.room.id).filter((l) => l.seller !== localPlayerId()).sort((a, b) => (a.stall === this.tradeStall ? -1 : 0) - (b.stall === this.tradeStall ? -1 : 0));
      const pages = Math.max(1, Math.ceil(list.length / 8));
      this.tradePage = Math.min(this.tradePage, pages - 1);
      shown = list.slice(this.tradePage * 8, this.tradePage * 8 + 8);
      page.setText(`${this.tradePage + 1}/${pages}`);
      rows.forEach((r, i) => {
        const l = shown[i];
        [r.bg, r.icon, r.name, ...r.btn.objects].forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!l));
        if (!l) return;
        r.btn.hover.setVisible(false);
        r.icon.setTexture(ITEMS[l.item].icon);
        r.name.setText(`${ITEMS[l.item].name} ×${l.qty}  ·  ผู้ขาย ${l.sellerName}${l.stall === this.tradeStall ? ' ★' : ''}`).setColor(RARITY[ITEMS[l.item].rarity ?? 'common'].color);
        r.btn.setLabel(`ซื้อ ${l.price}`);
      });
      const inv = this.gs.player.inventory;
      pick.forEach((v, i) => v.set(inv.slots[i] ?? null, i === this.sellIdx));
      const s = this.sellIdx !== null ? inv.slots[this.sellIdx] : null;
      sellInfo.setText(s ? `${s.plus ? `Lv.${s.plus + 1} ` : ''}${ITEMS[s.id].name} ×${this.sellQty}  ·  ราคา ${this.sellPrice} (ได้สุทธิ ${Math.floor(this.sellPrice * (1 - Wallet.TAX))})` : 'คลิกไอเทมด้านบนเพื่อวางขาย');
      const mine = rooms.listings(this.gs.room.id).filter((l) => l.seller === localPlayerId());
      mineList.setText(mine.length ? mine.slice(0, 4).map((l) => `• ${ITEMS[l.item].name} ×${l.qty} — ${l.price} เหรียญ`).join('\n') : '(ยังไม่มี)');
    });
  }

  /** รอคำตอบเซิร์ฟเวอร์ (ออนไลน์) — กันกดซ้ำ */
  private tradeBusy = false;

  /** ได้ของจากแผง (ซื้อ/ยกเลิก) — ของที่อัพเกรดแล้วตกเป็นของพร้อมเลเวล */
  private receiveListing(l: TradeListing) {
    const g = this.gs;
    if (l.plus) g.spawnDrop(g.player.x, g.player.y, l.item, l.qty, { id: l.item, qty: l.qty, plus: l.plus });
    else g.collect(l.item, l.qty, g.player.x, g.player.y);
  }

  private async buyListing(l: TradeListing | undefined) {
    if (!l || this.tradeBusy) return;
    const g = this.gs;
    if (g.wallet.coins < l.price) {
      Sfx.play('error');
      return this.toast('เหรียญไม่พอ', COLORS.bad);
    }
    this.tradeBusy = true;
    if (getRoomService().online) this.toast('กำลังเชื่อมต่อ…', COLORS.dim);
    const got = await getRoomService().takeListing(g.room.id, l.id);
    this.tradeBusy = false;
    if ('error' in got) {
      Sfx.play('error');
      return this.toast(got.error, COLORS.bad);
    }
    if (!g.wallet.spend(l.price)) return this.toast('เหรียญไม่พอ', COLORS.bad);
    this.receiveListing(got);
    Sfx.play('pickup');
    EventBus.emit('trade');
    this.toast(`ซื้อ ${ITEMS[l.item].name} ×${l.qty} จาก ${l.sellerName}`, COLORS.good);
  }

  private async postListing() {
    const g = this.gs;
    const inv = g.player.inventory;
    const i = this.sellIdx;
    const s = i !== null ? inv.slots[i] : null;
    if (i === null || !s) return this.toast('เลือกไอเทมก่อน', COLORS.bad);
    if (this.tradeBusy) return;
    const qty = Math.min(this.sellQty, s.qty);
    const taken = { ...s, qty: s.plus || s.dur !== undefined ? s.qty : qty };
    if (s.plus || s.dur !== undefined) inv.slots[i] = null;
    else inv.consumeAt(i, qty);
    inv.version++;
    this.sellIdx = null;
    this.tradeBusy = true;
    const r = await getRoomService().postListing(g.room.id, { seller: localPlayerId(), sellerName: g.playerName, item: s.id, qty, price: this.sellPrice, stall: this.tradeStall, plus: s.plus || undefined });
    this.tradeBusy = false;
    if ('error' in r) {
      // วางขายไม่สำเร็จ → คืนของ
      if (taken.plus || taken.dur !== undefined) g.spawnDrop(g.player.x, g.player.y, taken.id, taken.qty, taken);
      else g.collect(taken.id, taken.qty, g.player.x, g.player.y);
      Sfx.play('error');
      return this.toast(r.error, COLORS.bad);
    }
    Sfx.play('place');
    EventBus.emit('trade');
    this.toast(`วางขาย ${ITEMS[s.id].name} ×${qty} ราคา ${this.sellPrice} เหรียญแล้ว`, COLORS.good);
  }

  // ---------- พ่อค้ากลาง (ซื้อ/ขาย/แลกเพชร) ----------
  private makeMarket() {
    const w = new UIWindow(this, 60, 40, 840, 480, 'พ่อค้ากลาง — ราคาเปลี่ยนทุกวัน');
    w.add([txt(this, 0, 0, 'ซื้อ (จ่ายเหรียญ)', 15, COLORS.good), txt(this, 410, 0, 'ขาย (ได้เหรียญ) · ★ ราคาพิเศษวันนี้', 15, COLORS.gold)]);
    const rows: { o: Offer; side: 'buy' | 'sell'; icon: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; btn: Button }[] = [];
    for (let i = 0; i < 8; i++) {
      for (const side of ['buy', 'sell'] as const) {
        const x = side === 'buy' ? 0 : 410;
        const y = 36 + i * 38;
        const bg = this.add.rectangle(x, y, 395, 34, 0x333c57, 0.45).setOrigin(0, 0.5);
        const icon = this.add.image(x + 18, y, 'px').setScale(1.6);
        const name = txt(this, x + 38, y, '', 12).setOrigin(0, 0.5);
        const ref = { o: { item: 'wood', qty: 1, price: 1 } as Offer, side, icon, name, btn: null as unknown as Button };
        ref.btn = button(this, x + 345, y, 92, 28, '', () => this.trade(ref.o, side), true, 12);
        rows.push(ref);
        w.add([bg, icon, name, ...ref.btn.objects]);
      }
    }
    const gemBuy = button(this, 100, 368, 196, 32, `ซื้อเพชร 1 (${Wallet.GEM_RATE + 30} เหรียญ)`, () => {
      if (!this.gs.wallet.spend(Wallet.GEM_RATE + 30)) return this.toast('เหรียญไม่พอ', COLORS.bad);
      this.gs.wallet.add(0, 1);
      Sfx.play('pickup');
    }, true, 13);
    const gemSell = button(this, 302, 368, 196, 32, `แลกเพชร 1 → ${Wallet.GEM_RATE} เหรียญ`, () => {
      if (!this.gs.wallet.spend(0, 1)) return this.toast('ไม่มีเพชร', COLORS.bad);
      this.gs.wallet.add(Wallet.GEM_RATE);
      Sfx.play('pickup');
    }, true, 13);
    // กล่องทอง/กล่องเพชร (มีแปลน) ซื้อด้วยเพชร
    const goldBuy = button(this, 504, 368, 196, 32, `ซื้อกล่องทอง (${GOLD_BOX_GEMS} เพชร)`, () => {
      if (!this.gs.wallet.spend(0, GOLD_BOX_GEMS)) return this.toast('เพชรไม่พอ', COLORS.bad);
      this.gs.collect('box_gold', 1, this.gs.player.x, this.gs.player.y);
      Sfx.play('levelUp');
    }, true, 13);
    const boxBuy = button(this, 706, 368, 196, 32, `ซื้อกล่องเพชร (${LEGEND_BOX_GEMS} เพชร)`, () => {
      if (!this.gs.wallet.spend(0, LEGEND_BOX_GEMS)) return this.toast('เพชรไม่พอ', COLORS.bad);
      this.gs.collect('box_legend', 1, this.gs.player.x, this.gs.player.y);
      Sfx.play('levelUp');
    }, true, 13);
    w.add([...gemBuy.objects, ...gemSell.objects, ...goldBuy.objects, ...boxBuy.objects]);
    const wallet = txt(this, 0, 396, '', 14, COLORS.gold);
    w.add(wallet);
    return this.register(w, () => {
      const m = this.gs.market;
      let bi = 0;
      let si = 0;
      for (const r of rows) {
        const o = r.side === 'buy' ? m.buy[bi++] : m.sell[si++];
        if (!o) continue;
        r.o = o;
        r.icon.setTexture(ITEMS[o.item].icon);
        const have = r.side === 'sell' ? `  (มี ${this.gs.player.inventory.count(o.item)})` : '';
        r.name.setText(`${o.hot ? '★ ' : ''}${ITEMS[o.item].name} ×${o.qty}${have}`).setColor(o.hot ? COLORS.gold : COLORS.text);
        r.btn.setLabel(`${r.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${o.price}`);
      }
      wallet.setText(`💰 ${this.gs.wallet.coins.toLocaleString()} เหรียญ   💎 ${this.gs.wallet.gems} เพชร`);
    });
  }

  private trade(o: Offer, side: 'buy' | 'sell') {
    const g = this.gs;
    const err = side === 'buy' ? g.market.doBuy(o, g.player.inventory, g.wallet) : g.market.doSell(o, g.player.inventory, g.wallet);
    if (err) {
      Sfx.play('error');
      return this.toast(err, COLORS.bad);
    }
    Sfx.play('pickup');
    EventBus.emit('trade');
    this.toast(`${side === 'buy' ? 'ซื้อ' : 'ขาย'} ${ITEMS[o.item].name} ×${o.qty} (${o.price} เหรียญ)`, COLORS.good);
  }

  // ---------- อัพเกรดไอเทม 10 ระดับ (แทนตีบวกเดิม · สำเร็จ 100%) ----------
  private enhSel: number | EquipSlot | null = null;

  /** เปิดหน้าต่างอัพเกรดพร้อมเลือกช่องนี้ไว้ */
  openUpgrade(ref: number | EquipSlot | null) {
    this.enhSel = ref;
    this.enhanceWin.open();
  }

  private makeEnhance() {
    const w = new UIWindow(this, 160, 50, 640, 450, '⬆ อัพเกรดอุปกรณ์ (10 ระดับ)');
    w.add(txt(this, 0, 0, 'เลือกอาวุธ/เครื่องมือ/อุปกรณ์ (ที่สวม + ในกระเป๋า)', 13, COLORS.gold));
    let idx: (number | EquipSlot)[] = [];
    const views = this.grid(w, 0, 24, 6, 30, 40, (i) => (this.enhSel = idx[i] ?? null));
    const big = this.add.image(440, 56, 'px').setScale(4);
    // ภาพวาดของชิ้นที่เลือก (ใช้แทนตัวพิกเซลในเกม) + กรอบสีตามช่วงเลเวล
    const bigArt = this.add.image(0, 0, 'px').setVisible(false);
    const bigFrame = this.add.rectangle(400, 16, 80, 72).setOrigin(0).setStrokeStyle(2, 0x566c86).setVisible(false);
    const BAND_TINTS: Record<string, number> = { iron: 0xc8d8ea, gold: 0xffe2a0, legend: 0xe6c8ff };
    const title = txt(this, 440, 92, '', 17).setOrigin(0.5, 0);
    const info = txt(this, 284, 120, '', 12, COLORS.text, { wordWrap: { width: 320 }, lineSpacing: 3 });
    const result = txt(this, 440, 356, '', 16, COLORS.gold).setOrigin(0.5);
    // หน้าตา 4 แบบ (ปกติ / เหล็ก / ทอง / ตำนาน)
    const looks = [1, 4, 7, 10].map((lv, i) => {
      const x = 335 + i * 70;
      const frame = this.add.rectangle(x, 252, 40, 40, 0x0b0d1f, 0.5).setStrokeStyle(1, 0x566c86);
      const img = this.add.image(x, 252, 'px').setScale(2);
      const art = this.add.image(0, 0, 'px').setVisible(false);
      const lab = txt(this, x, 275, `${bandName(lv)}\nLv.${lv === 1 ? '1–3' : lv === 10 ? '10' : `${lv}–${lv + 2}`}`, 9, COLORS.dim, { align: 'center' }).setOrigin(0.5, 0);
      w.add([frame, img, art, lab]);
      return { lv, frame, img, art, lab };
    });
    const go = button(this, 440, 322, 260, 36, '⬆ อัพเกรด', () => {
      if (this.enhSel === null) return;
      const r = this.gs.upgradeItem(this.enhSel);
      result.setText(r.msg).setColor(r.ok ? COLORS.good : COLORS.bad).setScale(1.3);
      this.tweens.add({ targets: result, scale: 1, duration: 300, ease: 'Back.easeOut' });
      if (r.ok) {
        this.tweens.add({ targets: big, scale: { from: 5.2, to: 4 }, duration: 320, ease: 'Back.easeOut' });
        this.cameras.main.flash(160, 255, 230, 150);
      }
    }, true, 15);
    w.add([big, bigArt, bigFrame, title, info, result, ...go.objects]);
    w.add(txt(this, 0, 372, 'อัพเกรดสำเร็จ 100% · ค่าสถานะ +15%/เลเวล (Lv10 = ×2.35) · ความทนทาน +10%/เลเวล · อัพแล้วซ่อมเต็ม\nLv2–3 อัพได้ทุกที่ · Lv4+ ต้องมีทั่งตีเหล็กบนเกาะ · Lv4–6/7–9/10 ต้องมีแปลนอัพเกรดของหมวดนั้น (กล่องทอง/เพชร)', 11, COLORS.dim, { lineSpacing: 3, wordWrap: { width: 600 } }));
    return this.register(w, () => {
      const g = this.gs;
      const p = g.player;
      idx = [];
      for (const k of Object.keys(p.equip) as EquipSlot[]) if (p.equip[k] && ITEMS[p.equip[k]!.id].enhanceable) idx.push(k);
      p.inventory.slots.forEach((s, i) => s && ITEMS[s.id].enhanceable && idx.push(i));
      views.forEach((v, i) => {
        const k = idx[i];
        v.set(k === undefined ? null : typeof k === 'string' ? p.equip[k] : p.inventory.slots[k], k !== undefined && k === this.enhSel);
      });
      const chk = this.enhSel === null ? null : g.upgrades.checkItem(this.enhSel);
      const s = chk?.slot && ITEMS[chk.slot.id].enhanceable ? chk.slot : null;
      looks.forEach((o) => [o.frame, o.img, o.lab].forEach((x) => x.setVisible(!!s)));
      looks.forEach((o) => o.art.setVisible(false));
      bigArt.setVisible(false);
      bigFrame.setVisible(false);
      if (!s || !chk) {
        big.setVisible(false);
        title.setText('');
        info.setText('เลือกของทางซ้าย\n\nกดอัพเกรดแล้วเลเวล +1 ทันที — ค่าสถานะเพิ่ม และหน้าตาเปลี่ยนเมื่อถึง Lv.4 (เสริมเหล็ก) · Lv.7 (ทองคำ) · Lv.10 (ตำนาน)');
        go.setLabel('⬆ อัพเกรด');
        return;
      }
      const def = ITEMS[s.id];
      const lv = chk.lv;
      big.setVisible(true).setTexture(lookKey(this, def.icon, lv));
      const band = bandOf(lv);
      title.setText(`Lv.${lv} ${def.name}`).setColor(band ? BAND_INFO[band].css : RARITY[def.rarity ?? 'common'].color);
      const artTex = itemArtKey(this, def.id);
      if (artTex) {
        big.setVisible(false);
        bigArt.setTexture(artTex);
        placeArtCover(bigArt, 400, 16, 80, 72).setVisible(true).setTint(band ? BAND_TINTS[band] : 0xffffff);
        bigFrame.setVisible(true).setStrokeStyle(2, band ? BAND_INFO[band].color : 0x566c86);
      } else withItemArt(this, def.id, () => undefined);
      looks.forEach((o) => {
        o.img.setTexture(lookKey(this, def.icon, o.lv));
        if (artTex) {
          const ob = bandOf(o.lv);
          o.art.setTexture(artTex);
          placeArtCover(o.art, 335 + looks.indexOf(o) * 70 - 18, 234, 36, 36).setVisible(true).setTint(ob ? BAND_TINTS[ob] : 0xffffff);
          o.img.setVisible(false);
        }
        const on = bandOf(o.lv) === band;
        o.frame.setStrokeStyle(on ? 2 : 1, on ? (band ? BAND_INFO[band].color : 0xa7f070) : 0x566c86);
        o.lab.setColor(on ? COLORS.gold : COLORS.dim);
      });
      if (lv >= MAX_LEVEL || !chk.cost) {
        info.setText(`✨ อัพเกรดสูงสุดแล้ว (Lv.${MAX_LEVEL} ${bandName(lv)})\n${itemStatAt(def, lv)}`);
        go.setLabel('✨ สูงสุดแล้ว');
        return;
      }
      const nb = bandOf(lv + 1);
      info.setText([
        `Lv.${lv} → Lv.${lv + 1}${nb && nb !== band ? `   ✨ โฉมใหม่: ${BAND_INFO[nb].name}!` : ''}`,
        `ตอนนี้: ${itemStatAt(def, lv)}`,
        `ถัดไป: ${itemStatAt(def, lv + 1)}`,
        `ค่าอัพ: ${g.upgrades.costLines(chk.cost)}`,
        chk.err ? (chk.err.startsWith('ขาด') ? '✘ วัสดุ/เหรียญยังไม่ครบ' : chk.err) : '✔ พร้อมอัพเกรด!',
      ].join('\n'));
      go.setLabel(`⬆ อัพเกรด Lv.${lv} → ${lv + 1}`);
    });
  }

  // ---------- ตู้เสื้อผ้า ----------
  private makeWardrobe() {
    const w = new UIWindow(this, 200, 50, 560, 460, 'ตู้เสื้อผ้า (O)');
    const preview = this.add.sprite(80, 120, this.gs.player.texKey, 0).setScale(6);
    w.add(preview);
    const lists: { slot: 'outfit' | 'helmet' | 'cape'; label: string; defs: { id: string; name: string }[]; y: number }[] = [
      { slot: 'outfit', label: 'ชุด', defs: OUTFITS, y: 0 },
      { slot: 'helmet', label: 'หมวก', defs: HELMETS, y: 150 },
      { slot: 'cape', label: 'ผ้าคลุม', defs: CAPES, y: 270 },
    ];
    const texts: { slot: 'outfit' | 'helmet' | 'cape'; id: string; t: Phaser.GameObjects.Text }[] = [];
    for (const l of lists) {
      w.add(txt(this, 170, l.y, l.label, 14, COLORS.gold));
      const auto = txt(this, 170, l.y + 22, '• ตามอุปกรณ์ที่สวม', 12).setInteractive({ useHandCursor: true });
      auto.on('pointerdown', () => this.setCos(l.slot, undefined));
      texts.push({ slot: l.slot, id: '', t: auto });
      w.add(auto);
      l.defs.forEach((d, i) => {
        const t = txt(this, 170 + ((i + 1) % 3) * 120, l.y + 22 + Math.floor((i + 1) / 3) * 18, `• ${d.name}`, 12).setInteractive({ useHandCursor: true });
        t.on('pointerdown', () => this.setCos(l.slot, d.id));
        texts.push({ slot: l.slot, id: d.id, t });
        w.add(t);
      });
    }
    w.add(txt(this, 0, 380, 'ชุดสีเทา = ยังไม่มี (สุ่มได้จากกล่องกลุ่ม "ชุดแฟชั่น") · ชุดแฟชั่นไม่มีผลต่อค่าพลัง', 11, COLORS.dim));
    return this.register(w, () => {
      const p = this.gs.player;
      preview.setTexture(p.texKey, 0);
      const own = new Set(MetaSave.load().wardrobe);
      const unlockAll = new URLSearchParams(location.search).has('unlockall') || this.gs.showcase;
      for (const t of texts) {
        const owned = !t.id || unlockAll || own.has(`${t.slot}:${t.id}`) || t.id === 'none';
        const active = (p.cosmetic[t.slot] ?? '') === t.id;
        t.t.setColor(active ? COLORS.gold : owned ? COLORS.text : '#5c6478');
        t.t.setData('owned', owned);
      }
    });
  }

  private setCos(slot: 'outfit' | 'helmet' | 'cape', id: string | undefined) {
    const p = this.gs.player;
    const unlockAll = new URLSearchParams(location.search).has('unlockall') || this.gs.showcase;
    if (id && id !== 'none' && !unlockAll && !MetaSave.load().wardrobe.includes(`${slot}:${id}`)) {
      Sfx.play('error');
      return this.toast('ยังไม่มีชุดนี้ — หาได้จากกล่อง', COLORS.bad);
    }
    p.cosmetic[slot] = id;
    p.refreshLook();
    Sfx.play('click');
  }

  // ---------- แผนที่โลก ----------
  private mapScale = 1;
  private mapPick: number | null = null;
  private mapInv: ((mx: number, my: number) => { tx: number; ty: number }) | null = null;
  private mapImg!: Phaser.GameObjects.Image;
  private mapGfx!: Phaser.GameObjects.Graphics;
  private mapLabels: Phaser.GameObjects.Text[] = [];

  private makeMap() {
    const w = new UIWindow(this, 40, 20, 880, 500, 'แผนที่โลก (M)');
    const viewW = 600;
    const viewH = 430;
    const maskG = this.make.graphics({}).fillRect(56, 62, viewW, viewH);
    const mask = maskG.createGeometryMask();
    this.mapImg = this.add.image(viewW / 2, viewH / 2, 'px').setMask(mask);
    this.mapGfx = this.add.graphics().setMask(mask);
    const holder = this.add.container(0, 0);
    holder.add([this.mapImg, this.mapGfx]);
    w.add(holder);
    const drag = this.add.zone(0, 0, viewW, viewH).setOrigin(0).setInteractive({ draggable: true });
    drag.on('drag', (_p: Phaser.Input.Pointer, dx: number, dy: number) => {
      holder.x += dx - drag.x;
      holder.y += dy - drag.y;
    });
    this.input.setDraggable(drag);
    // ล้อเมาส์ซูมแผนที่
    drag.on('wheel', (_p: Phaser.Input.Pointer, _dx: number, dy: number) => {
      this.mapScale = Phaser.Math.Clamp(this.mapScale * (dy > 0 ? 1 / 1.2 : 1.2), 0.5, 6);
    });
    // แตะเกาะบนแผนที่ = ดูข้อมูลเกาะ (ถ้าไม่ได้ลาก)
    let downAt = { x: 0, y: 0 };
    drag.on('pointerdown', (p: Phaser.Input.Pointer) => (downAt = { x: p.x, y: p.y }));
    drag.on('pointerup', (p: Phaser.Input.Pointer, lx: number, ly: number) => {
      if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 6 || !this.mapInv) return;
      const t = this.mapInv(lx - holder.x, ly - holder.y);
      let best: number | null = null;
      let bd = Infinity;
      for (const is of this.gs.world.slots) {
        if (!is || is.index >= 1000) continue;
        const d = Math.hypot(is.cx - t.tx, is.cy - t.ty);
        if (d < is.r + 14 && d < bd) {
          bd = d;
          best = is.index;
        }
      }
      this.mapPick = best;
    });
    w.add(drag);
    const side = txt(this, viewW + 16, 0, '', 11, COLORS.text, { wordWrap: { width: 228 }, lineSpacing: 2 });
    const zin = button(this, viewW + 60, 398, 80, 30, 'ซูม +', () => (this.mapScale = Math.min(6, this.mapScale * 1.4)), true, 13);
    const zout = button(this, viewW + 160, 398, 80, 30, 'ซูม −', () => (this.mapScale = Math.max(0.5, this.mapScale / 1.4)), true, 13);
    const center = button(this, viewW + 110, 434, 200, 30, 'กลับมาที่ตัวเรา', () => holder.setPosition(0, 0), true, 13);
    w.add([side, ...zin.objects, ...zout.objects, ...center.objects]);
    w.onClose = () => holder.setPosition(0, 0);
    let built = -1;
    return this.register(w, () => {
      const g = this.gs;
      const world = g.world;
      const b = world.bounds;
      const tilesW = b.x1 - b.x0;
      const tilesH = b.y1 - b.y0;
      // วาดภาพแผนที่ใหม่เมื่อมีช่องเกาะสร้างเพิ่ม
      if (built !== world.generated.size) {
        built = world.generated.size;
        const res = 2; // 1 px = 2 tile
        const cw = Math.ceil(tilesW / res);
        const ch = Math.ceil(tilesH / res);
        if (this.textures.exists('worldmap')) this.textures.remove('worldmap');
        const tex = this.textures.createCanvas('worldmap', cw, ch)!;
        const ctx = tex.getContext();
        const img = ctx.createImageData(cw, ch);
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const tx = b.x0 + x * res;
            const ty = b.y0 + y * res;
            const slot = world.slotIndexAt(tx, ty);
            let col = TILE_RGB[TILE.DEEP];
            if (world.generated.has(slot)) col = tileColor(world.tiles[ty * world.size + tx], world.slots[slot]?.biome);
            else {
              const is = world.slots[slot];
              if (is && Math.hypot(tx - is.cx, ty - is.cy) < is.r) col = [70, 90, 110];
            }
            const k = (y * cw + x) * 4;
            img.data.set([col[0], col[1], col[2], 255], k);
          }
        }
        ctx.putImageData(img, 0, 0);
        tex.refresh();
        this.mapLabels.forEach((t) => t.destroy());
        this.mapLabels = [];
      }
      const fit = Math.min(viewW / (tilesW / 2), viewH / (tilesH / 2)) * this.mapScale;
      this.mapImg.setTexture('worldmap').setScale(fit).setPosition(viewW / 2, viewH / 2);
      const toMap = (tx: number, ty: number) => ({ x: viewW / 2 + ((tx - b.x0) / 2 - tilesW / 4) * fit, y: viewH / 2 + ((ty - b.y0) / 2 - tilesH / 4) * fit });
      this.mapInv = (mx: number, my: number) => ({ tx: b.x0 + ((mx - viewW / 2) / fit + tilesW / 4) * 2, ty: b.y0 + ((my - viewH / 2) / fit + tilesH / 4) * 2 });
      const gfx = this.mapGfx.clear();
      if (!this.mapLabels.length) {
        for (const is of world.slots) {
          if (!is || is.index >= 1000) continue;
          const special = is.index === SPECIAL_SLOT;
          const t = txt(this, 0, 0, is.index === CENTER_SLOT ? '⚖ เกาะกลาง' : special ? `✨ ${SPECIAL_NAME}` : is.index === world.home ? '★ เกาะของคุณ' : is.ownerName, special ? 12 : 10, is.index === world.home || special ? COLORS.gold : is.index === CENTER_SLOT ? COLORS.good : COLORS.dim).setOrigin(0.5);
          t.setData('slot', is.index);
          holder.add(t);
          this.mapLabels.push(t);
        }
      }
      const sp = g.special;
      for (const t of this.mapLabels) {
        const is = world.slots[t.getData('slot')]!;
        const m = toMap(is.cx, is.cy - is.r - 4);
        t.setPosition(m.x, m.y).setMask(mask);
        if (is.index === SPECIAL_SLOT) t.setText(sp.open ? `✨ ${SPECIAL_NAME} (เปิด ${fmtLeft(sp.msLeft)})` : `🔒 ${SPECIAL_NAME} (เปิดอีก ${fmtLeft(sp.msLeft)})`).setColor(sp.open ? COLORS.gold : '#a77bdb');
      }
      // วงพายุ/แสงรอบเกาะพิเศษ + เส้นนำทางเมื่อเปิด
      const sis = world.slots[SPECIAL_SLOT];
      if (sis) {
        const c = toMap(sis.cx, sis.cy);
        const rr = ((sis.r + 12) / 2) * fit;
        gfx.lineStyle(2, sp.open ? 0xffcd75 : 0xa77bdb, 0.9).strokeCircle(c.x, c.y, rr);
        if (sp.open) {
          const pm0 = toMap(g.player.x / 16, g.player.y / 16);
          const steps = 24;
          gfx.lineStyle(2, 0xffcd75, 0.7);
          for (let i = 0; i < steps; i += 2) {
            const a0 = i / steps;
            const a1 = (i + 1) / steps;
            gfx.lineBetween(pm0.x + (c.x - pm0.x) * a0, pm0.y + (c.y - pm0.y) * a0, pm0.x + (c.x - pm0.x) * a1, pm0.y + (c.y - pm0.y) * a1);
          }
        }
      }
      // ปากถ้ำดันเจี้ยนบนเกาะของคุณ (ม่วง = ยังไม่พิชิต · เขียว = พิชิตแล้ว)
      for (const pt of world.portals) {
        const m = toMap(pt.tx, pt.ty);
        const won = g.interiors.conquered.has(pt.interior);
        gfx.fillStyle(won ? 0xa7f070 : 0xc77dff, 1).fillCircle(m.x, m.y, 4 + fit * 0.4);
        gfx.lineStyle(1.5, 0x0b0d1f, 1).strokeCircle(m.x, m.y, 4 + fit * 0.4);
      }
      // เกาะที่เลือก: กรอบไฮไลต์
      const pick = this.mapPick !== null ? world.slots[this.mapPick] : null;
      if (pick) {
        const c = toMap(pick.cx, pick.cy);
        gfx.lineStyle(2, 0xffffff, 0.9).strokeCircle(c.x, c.y, (pick.r / 2) * fit + 4);
      }
      gfx.fillStyle(0xffcd75, 1);
      for (const a of g.airdropMarkers()) {
        const m = toMap(a.x / 16, a.y / 16);
        gfx.fillRect(m.x - 3, m.y - 3, 6, 6);
      }
      const pm = toMap(g.player.x / 16, g.player.y / 16);
      gfx.fillStyle(0xff3355, 1).fillCircle(pm.x, pm.y, 4).lineStyle(2, 0xffffff).strokeCircle(pm.x, pm.y, 5);
      const players = g.room.players.length;
      const info: string[] = [];
      if (pick) {
        const dist = Math.round(Math.hypot(pick.cx - g.player.x / 16, pick.cy - g.player.y / 16));
        const b = BIOMES[pick.biome];
        info.push(`▶ ${pick.name}`, `${b.name} · แร่เด่น: ${SPECIALTY_NAMES[pick.specialty]}`, `ระยะทาง ~${dist} ช่อง (ต้องใช้เรือ)`, '');
      }
      const spLine = sp.open ? [`✨ ${SPECIAL_NAME}: เปิดอยู่ เหลือ ${fmtLeft(sp.msLeft)}`, 'ตามเส้นประสีทองไปได้เลย (ใต้สุดของแผนที่)'] : [`🔒 ${SPECIAL_NAME}: เปิดอีก ${fmtLeft(sp.msLeft)}`, `(เปิดทุก 4 ชม. ครั้งละ 1 ชม. รอบหน้า ${nextOpenText()})`];
      side.setText([
        ...info, ...spLine, '',
        `แผนที่โลก · ผู้รอดชีวิต ${players} คน`,
        '★ เกาะคุณ · ⚖ เกาะกลาง · ● แดง = คุณ · ■ เหลือง = กล่องร่ม',
        'เงาเทา = ยังไม่เคยไป · ข้ามทะเลต้องใช้เรือ',
        'แตะเกาะ = ดูข้อมูล · ลาก = เลื่อน · ล้อเมาส์ = ซูม',
      ].join('\n'));
    });
  }

  // ---------- งานอัตโนมัติ (ใช้ได้เฉพาะบนเกาะตัวเอง) ----------
  private autoAmount = 20;

  private toggleAuto() {
    this.autoWin.toggle();
  }

  private makeAuto() {
    const w = new UIWindow(this, W / 2 - 250, 26, 500, 488, 'งานอัตโนมัติ (T)');
    w.add(txt(this, 0, 0, 'สั่งงานให้ตัวละครทำเอง — ใช้ได้เฉพาะบนเกาะของคุณ · ครบจำนวนแล้วหยุดเอง', 11, COLORS.dim));
    // จำนวน
    const AMOUNTS = [10, 20, 50, 100, 200];
    w.add(txt(this, 0, 22, 'จำนวน:', 13, COLORS.gold));
    const amtBtns = AMOUNTS.map((n, i) => {
      const b = button(this, 90 + i * 66, 30, 60, 26, String(n), () => (this.autoAmount = n), true, 12);
      w.add(b.objects);
      return { n, b };
    });
    // ปุ่มงาน 2 คอลัมน์
    const cards = TASK_PRESETS.map((t, i) => {
      const x = (i % 2) * 236;
      const y = 54 + Math.floor(i / 2) * 40;
      const bg = this.add.nineslice(x, y, 'ui_slot', undefined, 228, 36, 6, 6, 6, 6).setOrigin(0).setInteractive({ useHandCursor: true });
      const ic = this.add.image(x + 20, y + 18, t.icon).setScale(1.5);
      const label = txt(this, x + 38, y + 18, t.label, 13).setOrigin(0, 0.5);
      bg.on('pointerdown', () => {
        this.gs.auto.start(t.make(t.counted ? this.autoAmount : 0));
        w.close();
      });
      w.add([bg, ic, label]);
      return { t, label };
    });
    void cards;
    const qy = 54 + Math.ceil(TASK_PRESETS.length / 2) * 40 + 4;
    const quest = button(this, 234, qy + 16, 468, 32, '', () => {
      const t = this.gs.auto.questTask();
      if (!t) return this.toast('ภารกิจนี้ต้องทำเอง (สร้าง/คราฟต์/ตกปลา/เดินทาง)', COLORS.dim);
      this.gs.auto.start(t);
      w.close();
    }, true, 13);
    const stop = button(this, 234, qy + 56, 220, 32, '⏹ หยุดงาน', () => this.gs.auto.stop(), true, 14);
    const status = txt(this, 0, qy + 80, '', 12, COLORS.text, { wordWrap: { width: 468 } });
    w.add([...quest.objects, ...stop.objects, status]);
    return this.register(w, () => {
      const au = this.gs.auto;
      amtBtns.forEach(({ n, b }) => b.hover.setVisible(n === this.autoAmount));
      const qt = au.questTask();
      quest.setLabel(qt ? `📜 ทำภารกิจปัจจุบันแทน — ${qt.label}${qt.goal ? ` ×${qt.goal}` : ''}` : '📜 ภารกิจปัจจุบัน: ต้องทำเอง');
      const here = this.gs.world.islandAt(Math.floor(this.gs.player.x / 16), Math.floor(this.gs.player.y / 16));
      const onHome = (here === this.gs.world.home || here >= 1000) && !this.gs.boatRiding;
      status.setText([
        au.active ? `กำลังทำ: ${au.status}` : 'ยังไม่ได้สั่งงาน — เลือกงานด้านบน',
        onHome ? '✔ อยู่บนเกาะของคุณ — ใช้งานอัตโนมัติได้' : '✘ อยู่นอกเกาะของคุณ — งานจะพักไว้จนกว่าจะกลับเกาะ',
        'งานเก็บของ/เกี่ยวผัก: เจอมอนเข้าใกล้จะสู้ป้องกันตัวก่อน · HP ต่ำใช้ยาเอง',
      ].join('\n')).setColor(onHome ? COLORS.text : COLORS.bad);
    });
  }

  // ---------- เมนูหยุด / ตั้งค่า ----------
  private makePause() {
    const w = new UIWindow(this, W / 2 - 230, 60, 460, 430, 'เมนู · ⏸ เกมหยุดชั่วคราว');
    const resume = button(this, 214, 20, 260, 38, 'เล่นต่อ', () => w.close(), true, 15);
    const sound = button(this, 214, 66, 260, 38, '', () => this.toggleSound(), true, 15);
    const vol = txt(this, 214, 112, '', 14).setOrigin(0.5);
    const vm = button(this, 84, 112, 50, 30, '−', () => this.setVol(-0.1), true, 14);
    const vp = button(this, 344, 112, 50, 30, '+', () => this.setVol(0.1), true, 14);
    const tilt = txt(this, 214, 156, '', 14).setOrigin(0.5);
    const tm = button(this, 84, 156, 50, 30, '−', () => this.gs.setTilt(Math.max(0, this.gs.tilt - 0.15)), true, 14);
    const tp = button(this, 344, 156, 50, 30, '+', () => this.gs.setTilt(this.gs.tilt + 0.15), true, 14);
    const zoom = txt(this, 214, 200, '', 14).setOrigin(0.5);
    const zm = button(this, 84, 200, 50, 30, '−', () => this.gs.setZoom(this.gs.zoom / 1.2), true, 14);
    const zp = button(this, 344, 200, 50, 30, '+', () => this.gs.setZoom(this.gs.zoom * 1.2), true, 14);
    const ctrl = button(this, 214, 244, 330, 32, '', () => {
      const i = CONTROL_MODES.findIndex((m) => m.id === getControlMode());
      setControlMode(CONTROL_MODES[(i + 1) % CONTROL_MODES.length].id);
      this.toast(`การควบคุม: ${controlLabel()}`, COLORS.gold);
    }, true, 13);
    const intro = button(this, 120, 284, 220, 32, 'ดูเนื้อเรื่องเปิดอีกครั้ง', () => this.showIntro(0), true, 12);
    const quit = button(this, 340, 284, 190, 32, 'บันทึกและออก', () => this.gs.saveAndQuit(), true, 13);
    const help = txt(this, 0, 312, 'WASD เดิน · Shift วิ่ง · Space หลบ · คลิก ตี/ยิง/วาง · E ใช้/คุย/ขึ้นเรือ\nF กิน/สวม/เปิดกล่อง · Q สกิล · B สร้าง · X รื้อ · Tab กระเป๋า · J คู่มือ\nM แผนที่ · O ตู้เสื้อผ้า · V มุม 2.5D · ล้อเมาส์/+/− ซูม · N เสียง', 11, COLORS.dim, { lineSpacing: 3 });
    w.add([...resume.objects, ...sound.objects, vol, ...vm.objects, ...vp.objects, tilt, ...tm.objects, ...tp.objects, zoom, ...zm.objects, ...zp.objects, ...intro.objects, ...quit.objects, ...ctrl.objects, help]);
    return this.register(w, () => {
      ctrl.setLabel(`การควบคุม: ${controlLabel()}  (กดเพื่อเปลี่ยน)`);
      sound.setLabel(Sfx.settings.muted ? '🔇 เสียง: ปิด' : '🔊 เสียง: เปิด');
      vol.setText(`ระดับเสียง ${Math.round(Sfx.settings.master * 100)}%`);
      tilt.setText(`มุมกล้อง 2.5D: ${this.gs.tilt > 0 ? Math.round(this.gs.tilt * 100) + '%' : 'ปิด (บนลงล่าง)'}`);
      zoom.setText(`ซูม ${this.gs.zoom.toFixed(1)}×`);
    });
  }

  private setVol(d: number) {
    Sfx.settings.master = Phaser.Math.Clamp(Math.round((Sfx.settings.master + d) * 10) / 10, 0, 1);
    Sfx.applySettings();
  }

  // ======================================================================
  // ป๊อปอัป: เปิดกล่อง / ตาย / เนื้อเรื่องเปิด
  // ======================================================================
  private openModal(build: (c: Phaser.GameObjects.Container, close: () => void) => void) {
    this.modal?.destroy();
    const c = this.add.container(0, 0).setDepth(60);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.82).setOrigin(0).setInteractive();
    c.add(dim);
    const close = () => {
      c.destroy();
      if (this.modal === c) this.modal = null;
      this.registry.set('uiOpen', false);
    };
    build(c, close);
    this.modal = c;
    this.registry.set('uiOpen', true);
  }

  private showBox(tier: BoxTier, loot: { item: string; qty: number; rarity: Rarity }[]) {
    this.openModal((c, close) => {
      const box = this.add.image(W / 2, 200, tier).setScale(6);
      const title = heading(this, W / 2, 70, BOXES[tier].name, 32).setOrigin(0.5);
      c.add([title, box]);
      this.tweens.add({ targets: box, angle: { from: -8, to: 8 }, duration: 70, yoyo: true, repeat: 6 });
      this.time.delayedCall(700, () => {
        const best = loot.reduce((a, b) => (RANK[b.rarity] > RANK[a.rarity] ? b : a), loot[0]);
        this.cameras.main.flash(300, ...(hexRgb(RARITY[best.rarity].hex) as [number, number, number]));
        box.setVisible(false);
        const glow = this.add.image(W / 2, 200, 'glow').setScale(5).setTint(RARITY[best.rarity].hex).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
        c.addAt(glow, 1);
        loot.forEach((l, i) => {
          const x = W / 2 + (i - (loot.length - 1) / 2) * 120;
          const card = panel(this, x - 54, 150, 108, 150, 'ui_panel_dark');
          const icon = this.add.image(x, 200, ITEMS[l.item].icon).setScale(3);
          // มีภาพวาดของชิ้นนี้ → ใช้แทนไอคอนพิกเซลขยาย
          withItemArt(this, l.item, (k) => {
            if (!icon.scene) return;
            const art = placeArtCover(this.add.image(0, 0, k), x - 46, 158, 92, 74);
            const frame = this.add.rectangle(x - 46, 158, 92, 74).setOrigin(0).setStrokeStyle(2, RARITY[l.rarity].hex, 0.9);
            c.add([art, frame]);
            icon.setVisible(false);
          });
          const name = txt(this, x, 236, ITEMS[l.item].name, 13, RARITY[l.rarity].color, { wordWrap: { width: 100 }, align: 'center' }).setOrigin(0.5, 0);
          const q = txt(this, x, 272, `×${l.qty}  ${RARITY[l.rarity].name}`, 11, RARITY[l.rarity].color).setOrigin(0.5, 0);
          for (const o of [card, icon, name, q]) {
            o.setAlpha(0);
            this.tweens.add({ targets: o, alpha: 1, delay: i * 180, duration: 250 });
          }
          c.add([card, icon, name, q]);
        });
        c.add(button(this, W / 2, 360, 200, 44, 'รับของ', close, true, 16).objects);
      });
    });
  }

  private showDeath(cause: string, lost: number, items: number, lv0 = 1, lv1 = 1) {
    this.openModal((c, close) => {
      c.add(panel(this, W / 2 - 230, 110, 460, 290));
      c.add(heading(this, W / 2, 130, 'คุณหมดสติ…', 34).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 182, `💀 เลเวลลดลง  Lv.${lv0} → Lv.${lv1}${lv1 <= 1 ? '  ⚠ ตายอีกครั้ง = ตายถาวร!' : ''}`, lv1 <= 1 ? 16 : 18, COLORS.bad).setOrigin(0.5, 0));
      void lv0;
      c.add(txt(this, W / 2, 222, `สาเหตุ: ${cause}\nเสียเหรียญ ${lost} · ของในกระเป๋า ${items} ช่องตกเป็นถุงที่จุดล้ม\nกลับไปเก็บคืนได้ (กด E ที่ถุง)`, 15, COLORS.text, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 312, '⚔ เตือน: ถ้าตายในเขตผจญภัย (เกาะอื่น) = ตายถาวรทันที', 12, '#ef7d57').setOrigin(0.5, 0));
      c.add(button(this, W / 2, 352, 220, 44, 'ฟื้นที่บ้าน', close, true, 16).objects);
    });
  }

  /** ตายถาวร — เลเวลหมด เกาะหายไปจากแผนที่ */
  /** ตาย Lv.1 → ซื้อชีวิตด้วยเหรียญ/เพชร หรือยอมแพ้ (ตายถาวร) */
  private showRevive(r: ReviveOffer) {
    this.openModal((c, close) => {
      const art = coverImage(this, 'death', W, H);
      if (art) c.add(art.setAlpha(0.85));
      c.add(this.add.rectangle(0, 0, W, H, 0x2a0710, 0.55).setOrigin(0));
      c.add(panel(this, W / 2 - 270, 80, 540, 370));
      c.add(heading(this, W / 2, 98, '💀 เลเวลหมด!', 38).setOrigin(0.5, 0).setColor('#ef7d57'));
      c.add(txt(this, W / 2, 150, `สาเหตุ: ${r.cause}`, 14, COLORS.dim).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 176, 'ซื้อชีวิตเพื่อเกิดใหม่ — ไม่งั้นจะ "ตายถาวร" ต้องเริ่มเล่นใหม่ทั้งหมด', 15, COLORS.text).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 202, `ซื้อไปแล้ว ${r.times} ครั้ง · ครั้งหน้าราคาจะแพงขึ้น · มีเงิน ${r.haveCoins.toLocaleString()} เหรียญ · ${r.haveGems} เพชร`, 12, COLORS.dim).setOrigin(0.5, 0));
      const pay = (kind: 'coins' | 'gems') => {
        if (!this.gs.buyRevive(kind)) return;
        close();
      };
      const bc = button(this, W / 2 - 128, 268, 236, 64, '', () => r.canCoins && pay('coins'), r.canCoins, 15);
      bc.setLabel(`💰 ${r.coins.toLocaleString()} เหรียญ${r.canCoins ? '' : '\n(ไม่พอ)'}`);
      const bg = button(this, W / 2 + 128, 268, 236, 64, '', () => r.canGems && pay('gems'), r.canGems, 15);
      bg.setLabel(`💎 ${r.gems} เพชร${r.canGems ? '' : '\n(ไม่พอ)'}`);
      c.add([...bc.objects, ...bg.objects]);
      c.add(txt(this, W / 2, 312, 'เกิดใหม่ที่บ้าน Lv.1 · ของในกระเป๋าตกเป็นถุงตามปกติ · อุปกรณ์ที่สวมยังอยู่', 12, COLORS.dim).setOrigin(0.5, 0));
      c.add(button(this, W / 2, 384, 260, 40, 'ยอมแพ้ (ตายถาวร)', () => {
        close();
        this.gs.giveUp();
      }, true, 14).objects);
    });
  }

  /** ขึ้นเกาะผจญภัยครั้งแรก (ต่อบัญชี): อธิบายกฎ แล้วให้เลือกไปต่อ/ถอยกลับ */
  private showAdventureRules(name: string) {
    this.openModal((c, close) => {
      const art = coverImage(this, 'death', W, H);
      if (art) c.add(art.setAlpha(0.5));
      c.add(panel(this, W / 2 - 280, 96, 560, 330));
      c.add(heading(this, W / 2, 112, '⚔ เขตผจญภัย', 36).setOrigin(0.5, 0).setColor('#ef7d57'));
      if (name) c.add(txt(this, W / 2, 158, name, 14, COLORS.dim).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 186, [
        '⚔ ผู้เล่นอื่นโจมตีคุณได้ (PvP)',
        '💀 ตายที่นี่ = เริ่มใหม่ทั้งหมด (ไม่มีซื้อชีวิต · ไม่สนเลเวล)',
        '🎁 ของดรอปดีกว่ามาก — กล่องทอง/เพชรและแปลนหายากหาได้ที่นี่',
        '🏠 เกาะของคุณปลอดภัยกว่า แต่ได้แค่กล่องไม้ (บอสดันเจี้ยน = กล่องเหล็ก)',
      ].join('\n'), 15, COLORS.text, { align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
      c.add(button(this, W / 2 - 120, 376, 220, 46, 'เข้าใจแล้ว ไปต่อ', () => {
        MetaSave.markAdventureSeen();
        close();
      }, true, 15).objects);
      c.add(button(this, W / 2 + 120, 376, 200, 46, 'ถอยกลับ', () => {
        close();
        this.gs.retreatFromAdventure();
      }, true, 15).objects);
    });
  }

  /** เข้าเขตผจญภัย (ครั้งถัดๆ ไป): แถบเตือนสั้นๆ กลางจอ */
  private adventureFlash(name: string) {
    const t = txt(this, W / 2, H / 2 - 30, `⚔ เข้าเขตผจญภัย${name ? ` · ${name}` : ''} — PvP · ตายที่นี่ = เริ่มใหม่`, 16, '#ffffff')
      .setOrigin(0.5).setBackgroundColor('#b13e53dd').setPadding(12, 6, 12, 6).setDepth(9).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250, yoyo: true, hold: 1800, onComplete: () => t.destroy() });
    Sfx.play('horn', 600);
  }

  private showGameOver(r: GameOverInfo) {
    this.openModal((c) => {
      const art = coverImage(this, 'death', W, H);
      if (art) c.add(art.setAlpha(0.85).setTint(0xb0a0c0));
      c.add(this.add.rectangle(0, 0, W, H, 0x2a0710, 0.6).setOrigin(0));
      c.add(panel(this, W / 2 - 260, 90, 520, 340));
      c.add(heading(this, W / 2, 110, '💀 ตายถาวร', 42).setOrigin(0.5, 0).setColor('#ef7d57'));
      const why = r.adventure ? '⚔ ตายในเขตผจญภัย = ตายถาวรทันที (ไม่มีซื้อชีวิต)'
        : r.broke ? `เลเวลหมดและเงินไม่พอซื้อชีวิต (ต้องใช้ ${r.cost.coins.toLocaleString()} เหรียญ หรือ ${r.cost.gems} เพชร)` : 'ยอมแพ้ — ตายถาวร เกาะของคุณหายไปจากแผนที่';
      c.add(txt(this, W / 2, 170, why, r.broke || r.adventure ? 14 : 18, COLORS.bad).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 204, 'เกาะ อุปกรณ์ และของทั้งหมดหายไป\nต้องเริ่มเล่นใหม่ — สุ่มลงเกาะใหม่บนแผนที่โลก', 14, COLORS.text, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 262, `สาเหตุ: ${r.cause}\nรอดมาได้ ${r.days} วัน · ฆ่ามอนสเตอร์ ${r.kills} ตัว · พลังสูงสุด ${r.power.toLocaleString()}`, 14, COLORS.gold, { align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
      const go = (scene: string, data?: object) => {
        this.modal?.destroy();
        this.modal = null;
        this.scene.stop('GameScene');
        this.scene.start(scene, data);
      };
      c.add(button(this, W / 2 - 115, 372, 210, 44, 'เริ่มใหม่ (เลือกตัวละคร)', () => go('CharacterSelectScene', { play: true }), true, 14).objects);
      c.add(button(this, W / 2 + 115, 372, 190, 44, 'กลับหน้าแรก', () => go('TitleScene'), true, 14).objects);
    });
  }

  private showIntro(i: number) {
    const s = INTRO_SLIDES[i];
    this.openModal((c, close) => {
      const art = coverImage(this, `intro_${i + 1}` as ArtName, W, H);
      if (art) {
        c.add(art);
        this.tweens.add({ targets: art, scale: art.scale * 1.06, x: W / 2 + (i % 2 ? -14 : 14), duration: 9000, ease: 'Sine.easeInOut' });
      } else c.add(this.add.image(0, 0, 'title_sky').setOrigin(0).setScale(1, 1.5).setAlpha(0.55));
      // ไล่เงาด้านล่างให้อ่านตัวหนังสือได้
      const shade = this.add.graphics();
      shade.fillGradientStyle(0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0, 0, 0.92, 0.92).fillRect(0, H - 250, W, 150);
      shade.fillStyle(0x0b0d1f, 0.92).fillRect(0, H - 100, W, 100);
      c.add(shade);
      c.add(heading(this, W / 2, H - 200, s.title, 36).setOrigin(0.5));
      c.add(txt(this, W / 2, H - 132, s.text, 16, COLORS.text, { align: 'center', lineSpacing: 8 }).setOrigin(0.5).setStroke('#0b0d1f', 4));
      // จุดบอกหน้า
      INTRO_SLIDES.forEach((_, k) => c.add(this.add.circle(W / 2 - (INTRO_SLIDES.length - 1) * 9 + k * 18, H - 82, k === i ? 5 : 3.5, k === i ? 0xffcd75 : 0x94b0c2, k === i ? 1 : 0.6)));
      const last = i === INTRO_SLIDES.length - 1;
      c.add(button(this, W / 2 + 100, H - 42, 210, 40, last ? 'เริ่มเอาชีวิตรอด!' : 'ถัดไป ▶', () => {
        close();
        if (last) {
          this.gs.introSeen = true;
          this.afterIntro();
        } else this.showIntro(i + 1);
      }, true, 16).objects);
      c.add(button(this, W / 2 - 120, H - 42, 150, 40, 'ข้าม', () => {
        close();
        this.gs.introSeen = true;
        this.afterIntro();
      }, true, 14).objects);
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 350 });
    });
  }

  /** การ์ดคำแนะนำเล็กๆ ด้านซ้าย (ไม่หยุดเกม) — ปิดเองใน 16 วิ หรือกด ✕ */
  private guideCard?: Phaser.GameObjects.Container;
  private showGuide(title: string, lines: string[]) {
    this.guideCard?.destroy();
    const w = 300;
    const h = 30 + lines.length * 19 + 10;
    const x = 12;
    const y = 150;
    const c = this.add.container(x, y).setDepth(40);
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0d1f, 0.86).fillRoundedRect(0, 0, w, h, 8);
    bg.lineStyle(2, 0xffcd75, 0.9).strokeRoundedRect(0, 0, w, h, 8);
    c.add(bg);
    c.add(txt(this, 10, 7, title, 14, COLORS.gold));
    lines.forEach((l, i) => c.add(txt(this, 10, 30 + i * 19, l, 12, COLORS.text)));
    const x1 = txt(this, w - 10, 6, '✕', 14, COLORS.dim).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    const close = () => {
      if (this.guideCard !== c) return;
      this.guideCard = undefined;
      this.tweens.add({ targets: c, alpha: 0, x: x - 20, duration: 300, onComplete: () => c.destroy() });
    };
    x1.on('pointerdown', close);
    c.add(x1);
    c.setAlpha(0).setX(x - 20);
    this.tweens.add({ targets: c, alpha: 1, x, duration: 300 });
    this.guideCard = c;
    this.time.delayedCall(16000, close);
  }

  private afterIntro() {
    if (!this.gs.starterPicked) this.time.delayedCall(250, () => this.showStarter());
  }

  /** เกมใหม่: เลือกแปลนเริ่มต้น ฐานที่มั่น 1 + อาวุธ 1 (เป้าหมายแรกให้ออกไปหาวัตถุดิบ) */
  private showStarter() {
    if (this.gs.starterPicked) return;
    this.openModal((c, close) => {
      const art = coverImage(this, 'intro_5', W, H);
      if (art) c.add(art.setAlpha(0.35));
      c.add(heading(this, W / 2, 16, '🗺 เลือกแปลนเริ่มต้น', 30).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 56, 'เลือกฐานที่มั่น 1 แบบ และอาวุธ 1 แบบ — ⚔ ได้อาวุธถือในมือทันที · 🏠 สร้างฐานที่มั่นฟรี 1 หลัง (ไม่ใช้วัตถุดิบ)\nกด B → สิ่งก่อสร้าง → เลือกบ้านของคุณ → สร้างเลย แล้ววางบนพื้น', 13, COLORS.text, { align: 'center', lineSpacing: 4 }).setOrigin(0.5, 0).setStroke('#0b0d1f', 3));
      const pick: { base: string | null; weapon: string | null } = { base: null, weapon: null };
      const cw = 210;
      const ch = 150;
      const gap = 14;
      const x0 = (W - (cw * 4 + gap * 3)) / 2;
      const frames: Record<'base' | 'weapon', { id: string; f: Phaser.GameObjects.Rectangle }[]> = { base: [], weapon: [] };
      const row = (kind: 'base' | 'weapon', y: number, label: string, list: StarterPick[]) => {
        c.add(txt(this, x0, y, label, 16, COLORS.gold).setStroke('#0b0d1f', 4));
        list.forEach((o, i) => {
          const x = x0 + i * (cw + gap);
          const cy = y + 24;
          const b = kind === 'base' ? BUILD[o.id] : undefined;
          const it = kind === 'weapon' ? ITEMS[o.id] : undefined;
          c.add(this.add.rectangle(x, cy, cw, ch, 0x1a1c2c, 0.92).setOrigin(0));
          const icon = this.add.image(x + cw / 2, cy + 40, b ? b.texture : it!.icon);
          icon.setScale(Math.min(64 / icon.width, 64 / icon.height, 4));
          c.add(icon);
          withItemArt(this, o.id, (k) => {
            if (!icon.scene) return;
            c.addAt(placeArtCover(this.add.image(0, 0, k), x + 3, cy + 3, cw - 6, 80), c.getIndex(icon));
            icon.setVisible(false);
          });
          c.add(txt(this, x + 8, cy + 86, b?.name ?? it!.name, 15, COLORS.gold));
          c.add(txt(this, x + 8, cy + 106, o.pitch, 11, COLORS.text, { wordWrap: { width: cw - 14 } }));
          c.add(txt(this, x + 8, cy + ch - 16, kind === 'base' ? '🎁 สร้างฟรี 1 หลัง (ไม่ใช้วัตถุดิบ)' : '⚔ ได้ถือในมือทันที', 11, COLORS.good, { wordWrap: { width: cw - 14 } }).setOrigin(0, 0.5));
          const f = this.add.rectangle(x, cy, cw, ch).setOrigin(0).setStrokeStyle(2, 0x566c86, 1);
          frames[kind].push({ id: o.id, f });
          const hit = this.add.zone(x, cy, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => {
            Sfx.play('click');
            pick[kind] = o.id;
            for (const e of frames[kind]) e.f.setStrokeStyle(e.id === o.id ? 4 : 2, e.id === o.id ? 0xffcd75 : 0x566c86, 1);
            refresh();
          });
          c.add([f, hit]);
        });
      };
      row('base', 100, '🏠 ฐานที่มั่น', STARTER_BASES);
      row('weapon', 290, '⚔ อาวุธ', STARTER_WEAPONS);
      const ok = button(this, W / 2 + 90, H - 34, 240, 42, '', () => {
        if (!pick.base || !pick.weapon) return;
        const bName = BUILD[pick.base].name;
        const wName = ITEMS[pick.weapon].name;
        this.gs.pickStarter(pick.base, pick.weapon);
        close();
        this.banner(`ได้ ${wName} + สร้าง${bName}ฟรี!`, `อาวุธอยู่ในมือแล้ว · กด B → สิ่งก่อสร้าง → ${bName} → สร้างเลย (ฟรี 1 หลัง)`, '#a7f070');
      }, true, 15);
      const rnd = button(this, W / 2 - 140, H - 34, 160, 42, '🎲 สุ่มให้', () => {
        pick.base = Phaser.Utils.Array.GetRandom(STARTER_BASES).id;
        pick.weapon = Phaser.Utils.Array.GetRandom(STARTER_WEAPONS).id;
        for (const k of ['base', 'weapon'] as const) for (const e of frames[k]) e.f.setStrokeStyle(e.id === pick[k] ? 4 : 2, e.id === pick[k] ? 0xffcd75 : 0x566c86, 1);
        refresh();
      }, true, 14);
      const refresh = () => ok.setLabel(pick.base && pick.weapon ? '✔ เริ่มเลย!' : `เลือก${!pick.base ? 'ฐาน' : ''}${!pick.base && !pick.weapon ? ' + ' : ''}${!pick.weapon ? 'อาวุธ' : ''}`);
      refresh();
      c.add([...ok.objects, ...rnd.objects]);
    });
  }

  /** การ์ดภาพเต็มจอชั่วคราว (เข้าดันเจี้ยน/บอสโผล่/ภัยพิบัติ/พิชิตเกาะ) — ไม่หยุดเกม กดที่ไหนก็ได้เพื่อปิด */
  private splash?: Phaser.GameObjects.Container;
  private showSplash(o: { art: string; title: string; sub?: string; color?: string; hold?: number }) {
    if (!this.textures.exists(`art_${o.art}`) || this.modal) {
      this.banner(o.title, o.sub ?? '', o.color ?? '#ffcd75');
      return;
    }
    this.splash?.destroy();
    const c = this.add.container(0, 0).setDepth(55);
    this.splash = c;
    const bh = 230;
    const y0 = (H - bh) / 2 - 20;
    // กว้างกว่าจอ 40px เผื่อเลื่อนภาพช้าๆ โดยไม่เห็นขอบ
    const img = coverCrop(this, o.art, W + 40, bh, -40, y0, 0.45);
    if (!img) return;
    const frame = this.add.graphics();
    frame.fillStyle(0x0b0d1f, 0.55).fillRect(0, 0, W, H);
    const col = Phaser.Display.Color.HexStringToColor(o.color ?? '#ffcd75').color;
    const fade = this.add.graphics();
    fade.fillGradientStyle(0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0, 0, 0.9, 0.9).fillRect(0, y0 + bh - 110, W, 110);
    const edge = this.add.graphics();
    edge.fillStyle(col, 1).fillRect(0, y0 - 3, W, 3).fillRect(0, y0 + bh, W, 3);
    const title = heading(this, W / 2, y0 + bh - 62, o.title, 34).setOrigin(0.5).setColor(o.color ?? '#ffcd75');
    const sub = txt(this, W / 2, y0 + bh - 24, o.sub ?? '', 14, COLORS.text).setOrigin(0.5).setStroke('#0b0d1f', 4);
    c.add([frame, img, fade, edge, title, sub]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 280 });
    this.tweens.add({ targets: img, x: img.x + 40, duration: (o.hold ?? 2400) + 600, ease: 'Sine.easeOut' });
    title.setScale(1.4);
    this.tweens.add({ targets: title, scale: 1, duration: 380, ease: 'Back.easeOut' });
    const done = () => {
      if (this.splash !== c) return;
      this.splash = undefined;
      this.tweens.add({ targets: c, alpha: 0, duration: 400, onComplete: () => c.destroy() });
    };
    frame.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains).on('pointerdown', done);
    this.time.delayedCall(o.hold ?? 2400, done);
  }

  // ======================================================================
  // จอสัมผัส
  // ======================================================================
  private buildTouch() {
    this.touchLayer = this.add.container(0, 0).setDepth(5).setVisible(false);
    this.input.addPointer(2);
    const ctl = this.gs.controls;
    const jx = 120;
    const jy = H - 130;
    const base = this.add.circle(jx, jy, 64, 0x0b0d1f, 0.35).setStrokeStyle(3, 0xf4f4f4, 0.35);
    const knob = this.add.circle(jx, jy, 28, 0xf4f4f4, 0.4);
    const zone = this.add.zone(0, 220, 280, H - 290).setOrigin(0).setInteractive();
    let pid = -1;
    const moveKnob = (p: Phaser.Input.Pointer) => {
      const v = new Phaser.Math.Vector2(p.x - jx, p.y - jy);
      const len = Math.min(56, v.length());
      v.normalize().scale(len);
      knob.setPosition(jx + v.x, jy + v.y);
      ctl.touch.move.set(v.x / 56, v.y / 56);
      if (len > 50) ctl.touch.held.add('sprint');
      else ctl.touch.held.delete('sprint');
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      Sfx.unlock();
      ctl.touchMode = true;
      pid = p.id;
      moveKnob(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => p.id === pid && moveKnob(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id !== pid) return;
      pid = -1;
      knob.setPosition(jx, jy);
      ctl.touch.move.set(0, 0);
      ctl.touch.held.delete('sprint');
    });
    this.touchLayer.add([base, knob, zone]);
    const btn = (x: number, y: number, r: number, label: string, color: number, act: () => void, hold?: string) => {
      const c = this.add.circle(x, y, r, color, 0.55).setStrokeStyle(3, 0xf4f4f4, 0.5).setInteractive();
      const t = txt(this, x, y, label, r > 36 ? 16 : 11).setOrigin(0.5);
      c.on('pointerdown', () => {
        Sfx.unlock();
        ctl.touchMode = true;
        c.setScale(0.9);
        if (hold) ctl.touch.held.add(hold);
        act();
      });
      const up = () => {
        c.setScale(1);
        if (hold) ctl.touch.held.delete(hold);
      };
      c.on('pointerup', up).on('pointerout', up);
      this.touchLayer.add([c, t]);
    };
    btn(W - 84, H - 128, 46, 'โจมตี/วาง', 0xb13e53, () => ctl.touch.pressed.add('attack'), 'attack');
    btn(W - 186, H - 92, 32, 'ใช้', 0x38b764, () => ctl.touch.pressed.add('interact'));
    btn(W - 176, H - 186, 28, 'หลบ', 0x3b5dc9, () => ctl.touch.pressed.add('dodge'));
    btn(W - 72, H - 214, 28, 'สกิล', 0xffcd75, () => ctl.touch.pressed.add('skill'));
    btn(W - 262, H - 140, 26, 'กิน/เปิด', 0xc28a50, () => ctl.touch.pressed.add('use'));
    btn(W - 270, H - 222, 26, 'ออโต้', 0x38b764, () => this.autoWin.toggle());
  }

  update(_time: number, delta: number) {
    if (!this.gs?.player) return;
    this.updateHUD(delta);
    this.refreshTimer -= delta;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 150;
      for (const r of this.refreshers) r();
    }
    // ย้อนให้ GameScene รู้ว่ามีป๊อปอัปเปิด (หยุดรับการกด)
    if (!this.modal && this.registry.get('uiOpen')) this.registry.set('uiOpen', false);
    // เปิดเมนู/ป๊อปอัป = เกมหยุดจริง (มอนสเตอร์ เวลา ภัยพิบัติ หยุดหมด)
    const pause = this.pauseWin.visible || !!this.modal;
    if (pause !== this.gamePaused) {
      this.gamePaused = pause;
      if (pause) this.scene.pause('GameScene');
      else if (this.scene.isPaused('GameScene')) this.scene.resume('GameScene');
    }
  }
}

const TILE_RGB: Record<number, [number, number, number]> = {
  [TILE.DEEP]: [41, 54, 111], [TILE.SHALLOW]: [59, 93, 201], [TILE.SAND]: [228, 197, 138], [TILE.GRASS]: [56, 183, 100],
  [TILE.FOREST]: [44, 138, 85], [TILE.SNOW]: [244, 244, 244], [TILE.DESERT]: [227, 169, 95], [TILE.STONE]: [86, 108, 134],
  [TILE.BRICK]: [148, 176, 194], [TILE.PLANK_H]: [138, 90, 53], [TILE.PLANK_V]: [138, 90, 53], [TILE.DIRT]: [92, 58, 33], [TILE.ASH]: [58, 51, 70],
  [TILE.CAVE]: [74, 66, 72], [TILE.ROCKWALL]: [26, 28, 44],
};
/** สีผิวพื้นของเกาะแต่ละแบบบนแผนที่ (ตรงกับผิวพื้นในเกม — หนองน้ำ ธารน้ำแข็ง สะวันนา ฯลฯ) */
const SKIN_RGB: Record<number, [number, number, number]> = {
  [SKIN.MUD]: [84, 70, 44], [SKIN.SWAMP_GRASS]: [86, 120, 62], [SKIN.SWAMP_FOREST]: [52, 88, 50], [SKIN.SWAMP_WATER]: [62, 98, 84],
  [SKIN.MYCEL]: [126, 92, 140], [SKIN.MYCEL_FOREST]: [98, 66, 118], [SKIN.SHARDS]: [150, 200, 230], [SKIN.CRYSTAL_ROCK]: [120, 160, 220],
  [SKIN.BAMBOO]: [130, 190, 90], [SKIN.BAMBOO_FOREST]: [70, 150, 70], [SKIN.SAVANNA]: [206, 176, 86], [SKIN.RED_EARTH]: [170, 96, 60],
  [SKIN.ICE]: [170, 220, 240], [SKIN.CORAL_SAND]: [244, 214, 196], [SKIN.LAGOON]: [80, 200, 210], [SKIN.GHOST_GRASS]: [84, 96, 110], [SKIN.GHOST_FOREST]: [58, 66, 82],
};
const tileColor = (tile: number, biome?: string): [number, number, number] => {
  const sk = skinFor(biome, tile);
  return (sk >= 0 && SKIN_RGB[sk]) || TILE_RGB[tile] || TILE_RGB[TILE.DEEP];
};
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const hexRgb = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
void BIOMES;
void GRID;
void SLOT_SIZE;
void heroKey;
void buildHeroTexture;
