import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { CONTROL_MODES, controlLabel, getControlMode, setControlMode } from '../core/ControlMode';
import { TASK_PRESETS } from '../systems/AutoSystem';
import { SPECIAL_NAME, SPECIAL_SLOT, centerState, fmtLeft, nextOpenText, openLeft } from '../core/SpecialIsland';
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
import { PORTRAIT_FEET, PORTRAIT_H, PORTRAIT_W, PortraitView } from '../gfx/art/heroPortrait';
import { setWorldScale } from '../gfx/hd';
import { auraOf, drawAuraPreview } from '../fx/GearAura';
import { playEquipFlourish } from '../fx/EquipFx';
import { RewardFx } from '../fx/RewardFx';
import { ToastHost } from '../ui/Toast';
import { CENTER_ONLY_GEM, remoteFee, type Offer } from '../systems/MarketSystem';
import { TILE, isWater } from '../world/tiles';
import { vehicleKind } from '../data/vehicles';
import { ART, coverCrop, coverImage, queueArt, type ArtName } from '../ui/art';
import { hasItemArt, itemArtKey, placeArtCover, queueItemArtIndex, showItemIcon, withItemArt } from '../ui/itemArt';
import { BlueprintWindow } from '../ui/BlueprintWindow';
import { BodyPanel } from '../ui/BodyPanel';
import { SupplyWindow } from '../ui/SupplyWindow';
import { ALL_ITEMS } from '../config/allItems';
import { EventsPanel } from '../ui/EventsPanel';
import { MapMarkers } from '../ui/MapMarkers';
import { RespawnPopup } from '../ui/RespawnPopup';
import { PAID_RESPAWN, respawnFee } from '../config/openWorld';
import { fitText, iconTexture } from '../ui/fancyButton';
import { Foldable, UIWindow } from '../ui/Window';
import { muteColor, retroButton, retroLabel, retroPanel, RETRO } from '../ui/retro';
import { MiniHud } from '../ui/MiniHud';
import { getSettings, setSettings } from '../core/Settings';
import { LoadoutBar } from '../ui/LoadoutBar';
import { BagFilter } from '../ui/bagFilter';
import { loadMenuArt, menuArtKey, MenuPopup } from '../ui/MenuPopup';
import { TouchEditor } from '../ui/TouchEditor';
import { cssToGame, defaultLayout, joyOptions, loadLayout, saveLayout, TOUCH_R_CSS, type TouchId, type TouchItem, type TouchLayout } from '../ui/TouchLayout';
import { button, COLORS, heading, outline, panel, setTextBoost, SlotView, StatBar, txt, type Button } from '../ui/widgets';
import { anchorGroup, displayScale, hudScale, isCompact, touchScale } from '../ui/layout';

/** HUD แบบเบา (หัวใจ + ไอคอนเล็ก + ปุ่ม ☰) เป็นค่าเริ่มต้น — แบบเดิมเปิดด้วย ?hud=classic */
/** สีขอบปุ่มสัมผัสแบบหม่น (แทนสีสดเดิม) */
const MUTED_TOUCH: Record<number, number> = { 0xb13e53: 0xc46a5e, 0x38b764: 0x8fbf7a, 0x3b5dc9: 0x7fb3c9, 0xffcd75: 0xe3c178, 0xc28a50: 0xc9a06a };
type MenuTab = 'bag' | 'build' | 'items' | 'info' | 'settings';
const MENU_TABS: { id: MenuTab; label: string; icon: string }[] = [
  { id: 'bag', label: 'กระเป๋า', icon: 'ui_menu_bag' }, { id: 'build', label: 'สมุดแปลน', icon: 'ui_menu_blueprint' },
  { id: 'items', label: 'คราฟต์', icon: 'ui_menu_craft' }, { id: 'info', label: 'คลังข้อมูล', icon: 'ui_menu_catalog' },
  { id: 'settings', label: 'ตั้งค่า', icon: 'ui_menu_settings' },
];
const MINI_HUD = typeof location === 'undefined' || new URLSearchParams(location.search).get('hud') !== 'classic';
/** การ์ดข้อมูล (จิ้ม/คลิกขวา): กว้าง · HUD เบา = แคบลง */
const CARD_W = MINI_HUD ? 220 : 260;
import { ChatPanel } from '../ui/ChatPanel';
import { presence } from '../systems/PresenceSystem';
import { fmtFull, fmtMoney } from '../ui/money';
import { fadeIn, popIn } from '../ui/transition';
import { QUALITY_PREFS, qualityKnobs, qualityName, qualityPref, setQualityPref } from '../core/Quality';
import { STARTER_BASES, STARTER_WEAPONS, type StarterPick } from '../data/starter';
import { BUILD } from '../data/buildables';
import { SKIN, skinFor } from '../gfx/art/terrain';
import type { GameScene } from './GameScene';

const W = 960;
const H = 540;
const SLOT = MINI_HUD ? 34 : 46;
const GAP = 4;
/** ระยะขอบจอของ HUD ทุกมุม (ตารางระยะ 8px) */
const M = 8;
/** ความกว้างแผงคอลัมน์ขวา (เป้าหมาย / ปักหมุด) ชิดขอบขวาเท่ามินิแมป */
const RIGHT_W = 220;
interface ReviveOffer { coins: number; gems: number; canCoins: boolean; canGems: boolean; haveCoins: number; haveGems: number; cause: string; times: number }
interface GameOverInfo { cause: string; room: string; days: number; kills: number; power: number; broke: boolean; cost: { coins: number; gems: number }; adventure?: boolean }
const MINI = MINI_HUD ? 80 : 96;

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
  /** แถบหมวดแถบเดียว ⚔⛏❤✨🔦 (แทน hotbar เดิม) — ui/LoadoutBar.ts */
  private loadoutBar: LoadoutBar | null = null;
  /** ป้าย "✦ สกิล" ใต้ช่องสกิล */
  private skillTag!: Phaser.GameObjects.Text;
  private skillBox!: Phaser.GameObjects.NineSlice;
  private skillCover!: Phaser.GameObjects.Rectangle;
  private skillText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private heldName!: Phaser.GameObjects.Text;
  private lastSelected = -1;
  /** 🔔 แจ้งเตือนแบบริบบอน · 🎉 เอฟเฟกต์ฉลองได้ของ/เปิดกล่อง */
  private notify!: ToastHost;
  private rewardFx!: RewardFx;
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
  private toolbarPanel!: Phaser.GameObjects.NineSlice;
  private hotbarPanel!: Phaser.GameObjects.NineSlice;
  private touchLayer!: Phaser.GameObjects.Container;
  /** จอเล็ก (มือถือ): HUD ขยาย k เท่า · ปุ่มสัมผัส/hotbar ขยาย kt เท่า (ดู ui/layout.ts) */
  private compact = false;
  private k = 1;
  private kt = 1;
  /** กลุ่ม HUD ที่ยึดมุมจอ */
  private gLeft!: Phaser.GameObjects.Container;
  private gRight!: Phaser.GameObjects.Container;
  private gTop!: Phaser.GameObjects.Container;
  private gHot!: Phaser.GameObjects.Container;
  private statusFold!: Foldable;
  private pinC!: Phaser.GameObjects.Container;
  private skillCdT: Phaser.GameObjects.Text | null = null;
  private skillLabel!: Phaser.GameObjects.Text;
  private skillKey!: Phaser.GameObjects.Text;
  private modal: Phaser.GameObjects.Container | null = null;

  private wins: UIWindow[] = [];
  private chat: ChatPanel | null = null;
  private bodyPanel: BodyPanel | null = null;
  private eventsPanel: EventsPanel | null = null;
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
    this.feed = [];
    this.bars = {};
    this.wins = [];
    this.refreshers = [];
    this.modal = null;
    this.lastSelected = -1;
    this.bagKey = '';
    this.lastHp = this.gs.player.hp;
    this.walletInit = false;
    this.moneyTw = {};
    this.skillCdT = null;
    fadeIn(this, 320);
    // จอเล็ก: HUD ขยายทั้งกลุ่ม (ไม่ต้องขยายตัวหนังสือซ้ำ) · หน้าต่างใช้ตัวหนังสือขยาย + ขยายหน้าต่างให้เต็มจอ
    this.compact = isCompact(this);
    this.k = hudScale(this);
    this.kt = touchScale(this);
    this.notify = new ToastHost(this, () => ({ k: this.k, top: (MINI_HUD ? 32 : 122) * this.k, max: MINI_HUD ? 3 : 4, bannerY: Math.round((32 + 3 * 25 + 18) * this.k) }));
    this.rewardFx = new RewardFx(this);
    setTextBoost(this, false);
    this.gLeft = anchorGroup(this, 0, 0, this.k, 2);
    this.gRight = anchorGroup(this, W, 0, this.k, 2);
    this.gTop = anchorGroup(this, W / 2, 0, this.k, 3);

    this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0.7);
    this.hurtFlash = this.add.rectangle(0, 0, W, H, 0xb13e53, 0).setOrigin(0);
    this.buildStatus();
    this.buildMinimap();
    this.buildQuest();
    this.buildBoss();
    this.buildHotbar();
    this.buildToolbar();
    this.buildWallet();
    // สมดุลร่างกาย + กิจกรรมตามเวลาจริง/กล่องฟรี (ไฟล์แยก) — เช็กขอบเขตใน isPointerOverUI
    this.bodyPanel = new BodyPanel(this, this.gs);
    this.eventsPanel = new EventsPanel(this, this.gs);
    new RespawnPopup(this, this.gs); // ตายแล้วจ่ายเงินเกิดใหม่ที่บ้าน (ui/RespawnPopup.ts · config/openWorld.ts PAID_RESPAWN)
    // ข้อความกลางล่าง: เหนือ hotbar (จอเล็ก hotbar ขยาย → ยกขึ้นตาม)
    const hotTop = H - 80 * this.kt;
    this.hintText = txt(this, W / 2, hotTop - 14, '', MINI_HUD ? 12 : 17, MINI_HUD ? RETRO.css.sand : COLORS.gold).setOrigin(0.5);
    this.heldName = txt(this, W / 2, hotTop - 32, '', MINI_HUD ? 12 : 16).setOrigin(0.5).setAlpha(0);
    if (MINI_HUD) [this.hintText, this.heldName].forEach((t) => outline(t, 2));
    this.statusText = txt(this, W / 2, 92, '', 15, COLORS.gold).setOrigin(0.5, 0);
    this.gTop.add(this.statusText);
    this.advBadge = txt(this, 0, 0, PAID_RESPAWN ? '⚔ เขตผจญภัย\nPvP · ตาย = จ่ายเกิดใหม่' : '⚔ เขตผจญภัย\nPvP · ตายถาวร', 11, '#ffffff', { align: 'center', lineSpacing: 1 })
      .setBackgroundColor('#b13e53dd').setPadding(6, 3, 6, 3).setVisible(false);
    // คอม: ซ้ายของมินิแมป · จอเล็ก: ขวาของแถบเงิน (ใต้แถบเครื่องมือ — มุมขวาเต็มแล้ว)
    if (this.compact) this.gTop.add(this.advBadge.setOrigin(0, 0).setPosition(W / 2 + 112, 62));
    else this.gRight.add(this.advBadge.setOrigin(1, 0).setPosition(W - M - RIGHT_W - M, M));
    this.buildInspectCard();
    if (MINI_HUD) this.applyMiniHud();
    this.autoChip = txt(this, W / 2 - 176 * this.kt, hotTop - 4, '', 13, '#a7f070').setOrigin(0, 1).setBackgroundColor('#0b0d1fcc').setPadding(6, 3, 6, 3).setDepth(7).setVisible(false);
    this.padLegend = this.add.container(0, H - 70).setDepth(7);
    const lg = txt(this, W / 2, 0, '🎮 RT ตี/ยิง · Ⓐ ใช้/คุย · Ⓑ หลบ · Ⓧ กิน/สวม · Ⓨ สกิล · LT วิ่ง · LB/RB สลับของ · ↑↓ ซูม · Back กระเป๋า · Start เมนู', 11, COLORS.dim).setOrigin(0.5, 0.5);
    const lgBg = this.add.rectangle(W / 2, 0, lg.width + 20, 18, 0x0b0d1f, 0.6);
    this.padLegend.add([lgBg, lg]).setVisible(false);
    this.buildTouch();

    // หน้าต่าง: จอเล็กขยายตัวหนังสือเล็ก + ขยายหน้าต่างให้เต็มจอ
    setTextBoost(this, this.compact);
    UIWindow.fit = this.compact;
    UIWindow.retroDefault = MINI_HUD;
    this.bagWin = this.makeBag();
    this.blueprint = new BlueprintWindow(this, this.gs, (t, c) => this.toast(t, c));
    this.register(this.blueprint.win, () => {
      this.blueprint.refresh();
      // แท็บหัวหน้าต่างตามหมวด (สมุดแปลน/คราฟต์)
      if (MINI_HUD && this.bpTabFor !== this.blueprint.section) {
        this.bpTabFor = this.blueprint.section;
        this.blueprint.win.setHeaderTabs(MENU_TABS, this.blueprint.section, (id) => this.openMenuTab(id as MenuTab));
      }
    });
    this.infoWin = this.makeInfo();
    this.storageWin = this.makeStorage();
    this.tradeWin = this.makeTrade();
    this.marketWin = this.makeMarket();
    this.enhanceWin = this.makeEnhance();
    this.wardrobeWin = this.makeWardrobe();
    this.mapWin = this.makeMap();
    this.pauseWin = this.makePause();
    this.autoWin = this.makeAuto();
    if (MINI_HUD) this.setupMenuGroup();
    { const sw = new SupplyWindow(this, this.gs, (t, c) => this.toast(t, c)); this.register(sw.win, () => sw.refresh()); } // ♾ คลังเสบียง (โหมดของครบ)
    UIWindow.fit = false;

    // หมุนจอ/ย่อหน้าต่างจนขนาดจอข้ามเกณฑ์ "จอเล็ก" → สร้าง HUD ใหม่ (ไม่มีป๊อปอัปค้างอยู่เท่านั้น)
    const onResize = () => {
      if (isCompact(this) !== this.compact && !this.modal && !this.pauseWin.visible && this.sys.isActive()) this.scene.restart();
    };
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    const kb = this.input.keyboard!;
    kb.on('keydown-TAB', () => this.toggleBag());
    // C: HUD เบา = คราฟต์ (แท็บในเมนู) · แบบเดิม = กระเป๋า
    kb.on('keydown-C', () => (MINI_HUD ? this.blueprint.toggle('items') : this.toggleBag()));
    kb.on('keydown-J', () => this.infoWin.toggle());
    kb.on('keydown-M', () => this.mapWin.toggle());
    kb.on('keydown-O', () => this.wardrobeWin.toggle());
    EventBus.on('ui:auto', this.toggleAuto, this);
    this.events.once('shutdown', () => EventBus.off('ui:auto', this.toggleAuto, this));
    kb.on('keydown-N', () => this.toggleSound());
    kb.on('keydown-Z', () => !this.modal && this.quickDeposit());
    const escape = () => {
      if (this.menuPopup?.visible) return this.menuPopup.close();
      const open = this.wins.filter((w) => w.visible);
      if (this.gs.build.on) this.gs.build.cancel();
      else if (open.length) open.forEach((w) => w.close());
      else if (!this.gs.inspect.unpin() && !this.gs.homes.escape()) this.pauseWin.open(); // ในบ้าน: Esc = ออกจากบ้าน
    };
    // I = เปิด/ปิดการ์ดข้อมูลของที่ชี้อยู่
    kb.on('keydown-I', () => !this.modal && this.gs.inspect.togglePin());
    kb.on('keydown-ESC', escape);
    // แชทโลก (ui/ChatPanel.ts): Enter = พิมพ์เมื่อไม่มีหน้าต่าง/ป๊อปอัปเปิด (Esc ในช่องพิมพ์ = ปิด)
    this.chat = new ChatPanel(this, { compact: this.compact, k: this.k, me: this.gs.playerName, toast: (t, c) => this.toast(t, c) });
    // HUD เบา: แชทเริ่มแบบพับเป็นปุ่ม 💬 เล็ก (กด/Enter = กาง)
    if (MINI_HUD) this.chat.collapse();
    kb.on('keydown-ENTER', () => !this.modal && !this.wins.some((w) => w.visible) && this.chat?.focus());
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
    on('audio:changed', (muted: boolean) => this.muteIcon?.setTexture(muted ? 'tb_mute' : 'tb_sound'));
    on('pickup', (id: string, n: number) => this.pickup(id, n));
    on('banner', (name: string, desc: string, color: string) => this.banner(name, desc, color));
    on('achievement', (a: AchievementDef) => this.achievement(a));
    on('quest:done', (q: { title: string }) => this.toast(`✔ สำเร็จ: ${q.title}`, COLORS.good));
    on('ui:build', () => this.blueprint.toggle('build'));
    on('ui:market', (o?: { remote?: boolean }) => {
      this.marketRemote = !!o?.remote; // 📦 ท่าส่งของ = ร้านค้าทางไกล
      this.marketWin.open();
    });
    on('ui:trade', (stall: number) => this.openTrade(stall));
    on('ui:enhance', () => this.enhanceWin.open());
    on('ui:storage', (s: Structure) => this.openStorage(s));
    on('ui:boxopen', (tier: BoxTier, loot: { item: string; qty: number; rarity: Rarity }[]) => this.showBox(tier, loot));
    on('dailybox:claimed', (tier: BoxTier, streak: number, hint?: string) => this.rewardFx.dailyRoll(tier, streak, hint)); // 🎰 วงล้อกล่องฟรี
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
    if (!this.toolbarPanel) return false;
    if (this.modal || this.touchEditor || this.menuPopup?.visible) return true;
    if (this.chat?.contains(p.x, p.y)) return true;
    if (this.loadoutBar?.contains(p.x, p.y)) return true;
    if (this.bodyPanel?.contains(p.x, p.y) || this.eventsPanel?.contains(p.x, p.y)) return true;
    if (this.pinBox?.visible && this.pinBox.getBounds().contains(p.x, p.y)) return true;
    if (this.wins.some((w) => w.contains(p.x, p.y))) return true;
    if (this.card?.visible && this.card.getBounds().contains(p.x, p.y)) return true;
    if (this.toolbarPanel.visible && this.toolbarPanel.getBounds().contains(p.x, p.y)) return true;
    if (this.menuBtns?.getBounds().contains(p.x, p.y) || (this.menuPop?.visible && this.menuPop.getBounds().contains(p.x, p.y))) return true;
    if (this.walletC.getBounds().contains(p.x, p.y)) return true;
    if (this.touchLayer.visible && (this.joyZone.getBounds().contains(p.x, p.y) || this.touchBtns.some((b) => b.getBounds().contains(p.x, p.y)))) return true;
    return this.hotbarPanel.getBounds().contains(p.x, p.y) || (this.skillBox.visible && this.skillBox.getBounds().contains(p.x, p.y));
  }

  // ---------- การ์ดข้อมูล (จิ้ม/ชี้/เดินใกล้) ----------
  private padLegend!: Phaser.GameObjects.Container;
  private autoChip!: Phaser.GameObjects.Text;
  private card!: Phaser.GameObjects.Container;
  private cardBg!: Phaser.GameObjects.NineSlice;
  private cardTitle!: Phaser.GameObjects.Text;
  private cardBody!: Phaser.GameObjects.Text;
  private cardPx!: Phaser.GameObjects.Image;
  private cardArt!: Phaser.GameObjects.Image;
  private cardKey = '';

  private cardMore!: Phaser.GameObjects.Text;
  private cardClose!: Phaser.GameObjects.Text;
  /** รายละเอียดที่พับไว้ กางอยู่ไหม (รีเซ็ตเมื่อเปลี่ยนเป้าหมาย) */
  private cardOpen = false;
  private cardFor = '';
  private tipT!: Phaser.GameObjects.Text;

  /**
   * การ์ดข้อมูลแบบกะทัดรัด (กว้าง 260): หัว (รูป + ชื่อ/Lv) · บรรทัดสำคัญ 1–3 บรรทัด · "▸ รายละเอียด" กางที่เหลือ
   * เปิดเองเท่านั้น (คลิกขวา/แตะ/ปุ่ม I) — ตอนชี้แค่มีป้ายเล็กบรรทัดเดียว (tipT)
   */
  private buildInspectCard() {
    const CW = CARD_W;
    this.cardBg = this.add.nineslice(0, 0, 'ui_panel_dark', undefined, CW, 60, 10, 10, 10, 10).setOrigin(0);
    this.cardPx = this.add.image(27, 26, 'px').setVisible(false);
    this.cardArt = this.add.image(27, 26, 'px').setVisible(false);
    this.cardTitle = txt(this, 48, 26, '', MINI_HUD ? 13 : 14, COLORS.gold).setOrigin(0, 0.5);
    this.cardClose = txt(this, CW - 10, 8, '✕', 13, COLORS.dim).setOrigin(1, 0).setPadding(4, 2, 4, 2).setInteractive({ useHandCursor: true });
    this.cardClose.on('pointerdown', () => this.gs.inspect.unpin());
    this.cardBody = txt(this, 12, 48, '', MINI_HUD ? 11 : 12, COLORS.text, { wordWrap: { width: CW - 24 }, lineSpacing: MINI_HUD ? 2 : 3 });
    this.cardMore = txt(this, 12, 0, '', 11, MINI_HUD ? RETRO.css.sand : COLORS.sea).setPadding(0, 2, 8, 2).setInteractive({ useHandCursor: true });
    this.cardMore.on('pointerdown', () => {
      this.cardOpen = !this.cardOpen;
      this.cardKey = '';
    });
    this.card = this.add.container(0, 0, [this.cardBg, this.cardPx, this.cardArt, this.cardTitle, this.cardClose, this.cardBody, this.cardMore]).setDepth(8).setVisible(false);
    this.tipT = txt(this, 0, 0, '', MINI_HUD ? 11 : 12, COLORS.text).setBackgroundColor(MINI_HUD ? '#1f2a33e6' : '#0b0d1fd9').setPadding(MINI_HUD ? 4 : 6, 1, MINI_HUD ? 4 : 6, 1).setOrigin(0.5, 1).setDepth(8).setVisible(false);
  }

  /** พิกัดโลก → พิกัดจอ UI (กล้องหลักของเกม) */
  private worldToScreen(x: number, y: number) {
    const cam = this.gs.cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom + cam.x, y: (y - cam.worldView.y) * cam.zoom + cam.y };
  }

  /** พื้นที่เล่นที่ว่าง (ระหว่างคอลัมน์ HUD ซ้าย/ขวา ใต้แถบเครื่องมือ เหนือ hotbar) — การ์ด/ป้ายห้ามทับ HUD */
  private freeArea() {
    const k = this.k;
    const top = Math.max(this.toolbarPanel.getBounds().bottom, this.walletC.getBounds().bottom) + 6;
    return { left: M + 236 * k, right: W - (M + RIGHT_W) * k - 6, top, bottom: this.hotbarPanel.getBounds().top - 6 };
  }

  private updateInspectCard(touch: boolean) {
    const ins = this.gs.inspect;
    // ซีนเกมหยุด/กำลังเปลี่ยนซีน (ไม่มีกล้อง) → ซ่อนทั้งหมด
    if (!this.gs.cameras?.main) {
      this.tipT.setVisible(false);
      this.card.setVisible(false);
      return;
    }
    const info = ins.info;
    const k = this.k;
    // ---- ป้ายเล็กตอนชี้/เดินใกล้: ชื่อ + ข้อมูลสำคัญ 1 อย่าง ----
    const tip = this.modal ? null : ins.tip;
    if (tip) {
      const t = `${tip.info.title}${tip.info.tip ? ` · ${tip.info.tip}` : ''}`;
      if (this.tipT.text !== t) this.tipT.setText(t).setColor(MINI_HUD ? muteColor(tip.info.color) : tip.info.color);
      const p = this.worldToScreen(tip.x, tip.y);
      const hw = (this.tipT.width * k) / 2;
      const f = this.freeArea();
      this.tipT.setScale(k).setPosition(Phaser.Math.Clamp(p.x, M + hw, W - M - hw), Math.max(f.top + this.tipT.height * k, p.y - 2)).setVisible(true);
    } else this.tipT.setVisible(false);
    // ---- การ์ดเต็ม (เปิดเอง) ----
    if (!info || this.modal) {
      this.card.setVisible(false);
      this.cardKey = '';
      this.cardFor = '';
      return;
    }
    if (this.cardFor !== info.title) {
      this.cardFor = info.title;
      this.cardOpen = false;
    }
    const keep = Math.min(info.keep ?? info.lines.length, info.lines.length);
    const more = info.lines.length - keep;
    const key = `${info.title}|${info.lines.join('|')}|${this.cardOpen}`;
    if (key !== this.cardKey) {
      const fresh = !this.card.visible;
      this.cardKey = key;
      const art = info.art && hasItemArt(this, info.art) ? info.art : null;
      showItemIcon(this.cardPx, this.cardArt, art, 30, 30, undefined, undefined, false);
      this.cardTitle.setX(art ? 48 : 12).setText(info.title).setColor(MINI_HUD ? muteColor(info.color) : info.color);
      fitText(this.cardTitle, CARD_W - (art ? 74 : 38));
      this.cardClose.setVisible(ins.pinnedOpen);
      // กางแล้วสูงเกินพื้นที่ว่าง (จอเล็ก) → ตัดบรรทัดท้ายออก
      const f0 = this.freeArea();
      const maxH = (f0.bottom - f0.top) / k - 30;
      let n = this.cardOpen ? info.lines.length : keep;
      this.cardBody.setText(info.lines.slice(0, n).join('\n'));
      while (n > keep && this.cardBody.y + this.cardBody.height > maxH) {
        n--;
        this.cardBody.setText([...info.lines.slice(0, n), '…'].join('\n'));
      }
      let h = this.cardBody.y + this.cardBody.height;
      this.cardMore.setVisible(more > 0);
      if (more > 0) {
        this.cardMore.setY(h + 2).setText(this.cardOpen ? '▾ ซ่อนรายละเอียด' : `▸ รายละเอียด (${more})`);
        h += this.cardMore.height + 2;
      }
      this.cardBg.setSize(CARD_W, h + 10);
      if (fresh) {
        this.card.setAlpha(0);
        this.tweens.add({ targets: this.card, alpha: 1, duration: 120 });
      }
    }
    // ---- ตำแหน่ง: มือถือ/จอเล็ก = แผ่นล่างเหนือ hotbar · คอม = ข้างๆ เป้าหมาย ในพื้นที่ว่าง ----
    const f = this.freeArea();
    const cw = CARD_W * k;
    const ch = this.cardBg.height * k;
    this.card.setScale(MINI_HUD ? k * 0.88 : k);
    let x: number;
    let y: number;
    if (touch || this.compact || !ins.anchor) {
      x = W / 2 - cw / 2;
      y = f.bottom - ch;
    } else {
      const p = this.worldToScreen(ins.anchor.x, ins.anchor.y);
      x = p.x + 28 + cw <= f.right ? p.x + 28 : p.x - 28 - cw;
      y = p.y - 10;
    }
    x = Phaser.Math.Clamp(x, Math.min(f.left, W / 2 - cw / 2), Math.max(f.right - cw, W / 2 - cw / 2));
    y = Phaser.Math.Clamp(y, f.top, Math.max(f.top, f.bottom - ch));
    this.card.setPosition(Math.round(x), Math.round(y)).setVisible(true);
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
  /** แผงสถานะแบบกะทัดรัด (มุมซ้ายบน) — เงินย้ายไปแถบเงินกลางบน (buildWallet) */
  private buildStatus() {
    const p = this.gs.player;
    const parts: Phaser.GameObjects.GameObject[] = [];
    // การ์ดเดียว: รูป+ชื่อ+เลเวล แถวบน · แถบสถานะ 6 แถบเป็นกลุ่ม 2 คอลัมน์
    parts.push(panel(this, M, M, 196, 104));
    this.portrait = setWorldScale(this.add.sprite(M + 20, M + 26, p.texKey, 0), 1.5);
    parts.push(this.portrait);
    this.levelText = txt(this, M + 40, M + 24, '', 11, COLORS.gold, { fontStyle: '500' });
    this.xpBg = this.add.rectangle(M + 40, M + 39, 142, 4, 0x0b0d1f).setOrigin(0, 0.5);
    this.xpBar = this.add.rectangle(M + 40, M + 39, 0, 4, 0xa77bdb).setOrigin(0, 0.5);
    // ชื่อ (ซ้าย) + พลัง (ขวา) แถวเดียวกัน
    this.powerText = txt(this, M + 182, M + 7, '', 11, '#ef7d57', { fontStyle: '500' }).setOrigin(1, 0);
    const name = fitText(txt(this, M + 40, M + 6, this.gs.playerName, 13, COLORS.text, { fontStyle: '600' }), 84);
    parts.push(name, this.powerText, this.levelText, this.xpBg, this.xpBar);
    const rows: [string, string, number][] = [
      ['hp', 'hud_heart', 0xb13e53], ['hunger', 'hud_food', p.char.passive.robot ? 0x73eff7 : 0xc28a50],
      ['thirst', 'hud_water', 0x41a6f6], ['stamina', 'hud_stamina', 0xffcd75],
      ['temp', 'hud_temp', 0xa7f070], ['sanity', 'hud_sanity', 0xa77bdb],
    ];
    rows.forEach(([key, icon, color], i) => {
      const x = M + 12 + (i % 2) * 92;
      const y = M + 54 + Math.floor(i / 2) * 16;
      parts.push(this.add.image(x, y, icon).setScale(1.4));
      const bar = new StatBar(this, x + 8, y, 52, 10, color);
      const value = txt(this, x + 63, y, '', 11, COLORS.text, { fontStyle: '500' }).setOrigin(0, 0.5);
      parts.push(...bar.objects, value);
      this.bars[key] = { bar, value };
    });
    this.statusFold = new Foldable(this, M + 4, M + 106, parts, 'สถานะ');
    this.gLeft.add([...parts, this.statusFold.button]);
  }

  /** ขอบล่างของแผงสถานะบนจอ (ใช้วางแผงอื่นต่อลงมา) */
  private get statusBottom() {
    return (this.statusFold.folded ? M + 24 : M + 128) * this.k;
  }

  // ---------- 💰 แถบเงิน (เหรียญ + เพชร) กลางบน ใต้แถบเครื่องมือ ----------
  private walletC!: Phaser.GameObjects.Container;
  private walletBg!: Phaser.GameObjects.Graphics;
  private coinIcon!: Phaser.GameObjects.Image;
  private gemIcon!: Phaser.GameObjects.Image;
  private walletInit = false;
  /** ค่าที่แสดงอยู่ (นับขึ้น/ลงไล่ตามค่าจริง) */
  private money = { coins: 0, gems: 0 };
  private moneyTarget = { coins: 0, gems: 0 };
  /** แตะแถบเงิน = ดูตัวเลขเต็มชั่วคราว */
  private moneyExact = 0;
  private moneyTw: Partial<Record<'coins' | 'gems', Phaser.Tweens.Tween>> = {};

  private buildWallet() {
    const c = this.add.container(W / 2, 74);
    this.walletBg = this.add.graphics();
    this.coinIcon = this.add.image(0, 0, 'i_coin').setScale(1.3);
    this.walletText = txt(this, 0, 0, '0', 15, COLORS.gold).setOrigin(0, 0.5);
    this.gemIcon = this.add.image(0, 0, 'i_gem').setScale(1.3);
    this.gemText = txt(this, 0, 0, '0', 15, '#73eff7').setOrigin(0, 0.5);
    c.add([this.walletBg, this.coinIcon, this.walletText, this.gemIcon, this.gemText]);
    // hit area ใน local ของ container (ไม่ setSize → จุด 0,0 = กลางแถบ) — ปรับความกว้างใน renderMoney()
    c.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-100, -14, 200, 28), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    c.on('pointerdown', () => {
      Sfx.play('click');
      this.moneyExact = this.moneyExact > 0 ? 0 : 3500;
      this.renderMoney();
    });
    this.walletC = c;
    this.gTop.add(c);
    const w = this.gs.wallet;
    this.money = { coins: w.coins, gems: w.gems };
    this.moneyTarget = { ...this.money };
    this.renderMoney();
  }

  /** วาดตัวเลข + จัดความกว้างแถบตามความยาวตัวเลข */
  private renderMoney() {
    const exact = this.moneyExact > 0;
    // โหมด "มีของทุกอย่าง" (อีกระบบตั้งค่าไว้) → แสดง ∞
    const wl = this.gs.wallet as unknown as { unlimited?: boolean; constructor?: { unlimited?: boolean } };
    const inf = !!wl.unlimited || !!wl.constructor?.unlimited || !!this.registry.get('infiniteSupply');
    const f = (n: number) => (inf ? '∞' : exact ? fmtFull(n) : fmtMoney(n));
    this.walletText.setText(f(this.money.coins));
    this.gemText.setText(f(this.money.gems));
    const cw = this.walletText.width;
    const gw = this.gemText.width;
    const w = 14 + 18 + cw + 18 + 18 + gw + 12;
    let x = -w / 2 + 14;
    this.coinIcon.setPosition(x + 6, 0);
    this.walletText.setPosition(x + 17, 0);
    x += 18 + cw + 18;
    this.gemIcon.setPosition(x + 6, 0);
    this.gemText.setPosition(x + 17, 0);
    const g = this.walletBg.clear();
    if (this.miniHud) {
      // HUD เบา: แค่ไอคอน + ตัวเลข (ไม่มีกรอบ)
      (this.walletC.input?.hitArea as Phaser.Geom.Rectangle | undefined)?.setTo(-w / 2, -14, w, 28);
      return;
    }
    g.fillStyle(0x0b0d1f, 0.78).fillRoundedRect(-w / 2, -13, w, 26, 13);
    g.lineStyle(2, 0xffcd75, 0.75).strokeRoundedRect(-w / 2, -13, w, 26, 13);
    g.lineStyle(1, 0x566c86, 0.8).lineBetween(x - 10, -8, x - 10, 8);
    (this.walletC.input?.hitArea as Phaser.Geom.Rectangle | undefined)?.setTo(-w / 2, -14, w, 28);
  }

  /** เงินเปลี่ยน → นับตัวเลขไล่ + "+N"/"−N" ลอยขึ้น + แถบกระพริบสี */
  private updateMoney(delta: number) {
    const w = this.gs.wallet;
    if (this.moneyExact > 0 && (this.moneyExact -= delta) <= 0) this.renderMoney();
    if (!this.walletInit) {
      this.walletInit = true;
      this.money = { coins: w.coins, gems: w.gems };
      this.moneyTarget = { ...this.money };
      this.renderMoney();
      return;
    }
    for (const kind of ['coins', 'gems'] as const) {
      const now = w[kind];
      const d = now - this.moneyTarget[kind];
      if (!d) continue;
      this.moneyTarget[kind] = now;
      const text = kind === 'coins' ? this.walletText : this.gemText;
      const icon = kind === 'coins' ? this.coinIcon : this.gemIcon;
      // ตัวเลขนับไล่ (0.25–0.7 วิ ตามขนาดที่เปลี่ยน)
      const from = this.money[kind];
      const counter = { v: from };
      // เปลี่ยนซ้อนกันเร็วๆ → หยุดตัวนับเก่า (กันตัวเก่าจบทีหลังแล้วเขียนค่าเก่าทับ)
      this.moneyTw[kind]?.stop();
      this.moneyTw[kind] = this.tweens.add({
        targets: counter, v: now, duration: Phaser.Math.Clamp(250 + Math.log10(Math.abs(d) + 1) * 110, 250, 700), ease: 'Cubic.easeOut',
        onUpdate: () => {
          this.money[kind] = Math.round(counter.v);
          this.renderMoney();
        },
        onComplete: () => {
          this.money[kind] = now;
          this.renderMoney();
        },
      });
      // เด้ง + กระพริบสี
      const gain = d > 0;
      this.tweens.killTweensOf(icon);
      icon.setScale(1.3);
      this.tweens.add({ targets: icon, scale: 1.75, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
      text.setColor(gain ? '#ffffff' : '#ef7d57');
      this.time.delayedCall(260, () => text.active && text.setColor(kind === 'coins' ? COLORS.gold : '#73eff7'));
      // ตัวเลข +N / −N ลอยขึ้นจากใต้แถบ
      const sign = gain ? '+' : '−';
      const fl = txt(this, icon.x + 10, 18, `${sign}${fmtMoney(Math.abs(d))}`, 14, gain ? (kind === 'coins' ? '#fff2b0' : '#a0fff0') : '#ef7d57').setOrigin(0.5, 0);
      this.walletC.add(fl);
      this.tweens.add({ targets: fl, y: gain ? 4 : 30, alpha: { from: 1, to: 0 }, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => fl.destroy() });
      if (gain && Math.abs(d) >= 50) {
        // ได้เยอะ: ประกายวิ้งรอบไอคอน
        const sp = this.add.image(icon.x, 0, 'sparkle').setScale(0).setBlendMode(Phaser.BlendModes.ADD);
        this.walletC.add(sp);
        this.tweens.add({ targets: sp, scale: 2.5, angle: 90, alpha: 0, duration: 420, onComplete: () => sp.destroy() });
      }
    }
  }

  /**
   * ชิปเงินบนแถบหัวหน้าต่างร้าน/ตลาด/อัพเกรด (ขวา ก่อนปุ่มพับ) — ตัวเลขเต็ม อัปเดตทุก 150 ms ตอนหน้าต่างเปิด
   * คืนฟังก์ชันอัปเดตให้เรียกใน refresher ของหน้าต่าง
   */
  private headerWallet(win: UIWindow) {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    const ci = this.add.image(0, 17, 'i_coin').setScale(1.15);
    const ct = txt(this, 0, 17, '', 13, COLORS.gold).setOrigin(0, 0.5);
    const gi = this.add.image(0, 17, 'i_gem').setScale(1.15);
    const gt = txt(this, 0, 17, '', 13, '#73eff7').setOrigin(0, 0.5);
    c.add([g, ci, ct, gi, gt]);
    win.root.add(c);
    let last = '';
    return () => {
      const w = this.gs.wallet;
      const key = `${w.coins}|${w.gems}`;
      if (key === last) return;
      last = key;
      ct.setText(fmtFull(w.coins));
      gt.setText(fmtFull(w.gems));
      const width = 12 + 16 + ct.width + 14 + 16 + gt.width + 10;
      const x0 = win.w - 78 - width;
      ci.setX(x0 + 17);
      ct.setX(x0 + 26);
      gi.setX(x0 + 12 + 16 + ct.width + 14 + 5);
      gt.setX(gi.x + 9);
      g.clear().fillStyle(0x0b0d1f, 0.7).fillRoundedRect(x0, 7, width, 21, 10).lineStyle(1, 0xffcd75, 0.6).strokeRoundedRect(x0, 7, width, 21, 10);
    };
  }

  /** มินิแมปมุมขวาบน: การ์ดกว้าง RIGHT_W ชิดขอบขวา (เท่าแผงเป้าหมาย) + กรอบฟ้าทะเล */
  private buildMinimap() {
    const x0 = W - M - RIGHT_W + (RIGHT_W - MINI) / 2;
    const y0 = M + 8;
    if (this.textures.exists('minimap')) this.textures.remove('minimap');
    this.textures.createCanvas('minimap', MINI, MINI);
    const parts: Phaser.GameObjects.GameObject[] = [panel(this, W - M - RIGHT_W, M, RIGHT_W, MINI + 50, 'ui_panel_dark')];
    this.miniPanel = parts[0];
    this.miniImg = this.add.image(x0, y0, 'minimap').setOrigin(0);
    const frame = this.add.rectangle(x0 - 1, y0 - 1, MINI + 2, MINI + 2).setOrigin(0).setStrokeStyle(2, 0x41a6f6, 0.9);
    this.miniFrame = frame;
    this.miniGfx = this.add.graphics();
    // ใต้มินิแมป: จัดกลางชิดกันเป็นแถวสั้นๆ (วัน · เวลา / สถานที่ / เกาะพิเศษ) — ไม่ชิดขอบการ์ดจนเว้นโหวง
    const mx = x0 + MINI / 2;
    this.dayText = txt(this, mx - 3, y0 + MINI + 3, '', 10).setOrigin(1, 0);
    this.clockText = txt(this, mx + 3, y0 + MINI + 3, '', 10, COLORS.dim).setOrigin(0, 0);
    this.placeText = txt(this, mx, y0 + MINI + 16, '', 10, COLORS.gold).setOrigin(0.5, 0);
    // แตะมินิแมป = เปิดแผนที่ใหญ่
    this.miniImg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.mapWin.toggle());
    // ⤢ ขยาย (มุมขวาบนการ์ด) · ▾ พับ (มุมซ้ายบนการ์ด) — อยู่ในการ์ด ไม่ล้ำแผงเป้าหมายด้านล่าง
    const expand = txt(this, W - M - 8, M + 7, '⤢', 12, COLORS.text).setOrigin(1, 0).setBackgroundColor('#0b0d1fcc').setPadding(5, 1, 5, 1);
    expand.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.mapWin.toggle());
    // ป้ายเกาะพิเศษ: บรรทัดเล็กใต้ชื่อสถานที่ (ไม่ซ้อนทับภาพแมป)
    this.specialChip = txt(this, mx, y0 + MINI + 29, '', 9, COLORS.gold).setOrigin(0.5, 0);
    parts.push(this.miniImg, frame, this.miniGfx, this.dayText, this.clockText, this.placeText, expand, this.specialChip);
    const fold = new Foldable(this, W - M - RIGHT_W + 8, M + 7, parts, '');
    this.gRight.add([...parts, fold.button]);
    this.miniFold = fold;
    this.miniExpand = expand;
  }

  /** ขอบล่างของการ์ดมินิแมป (ในกลุ่มขวา) */
  private get minimapBottom() {
    return M + MINI + 50;
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
    presence.paintMini(img.data, MINI, cx, cy); // ผู้เล่นคนอื่น (live) = จุดฟ้า
    ctx.putImageData(img, 0, 0);
    tex.refresh();
  }

  /** แผงเป้าหมาย: ใต้มินิแมป ชิดขอบขวา กว้างเท่ากัน · สูงตามข้อความ (จอเล็ก = 2 บรรทัด) */
  private questFold!: Foldable;
  private buildQuest() {
    const x = W - M - RIGHT_W;
    const y = this.minimapBottom + M;
    const c = this.compact;
    this.questBox = panel(this, x, y, RIGHT_W, 60, 'ui_panel_dark');
    this.questTitle = txt(this, x + 12, y + (c ? 6 : 8), '', MINI_HUD ? 12 : 13, COLORS.gold);
    this.questText = txt(this, x + 12, y + (c ? 24 : 28), '', 12, COLORS.text, { wordWrap: { width: RIGHT_W - 24 }, lineSpacing: c ? 2 : 3, maxLines: c ? 2 : 4 });
    // ▾ พับ อยู่มุมขวาบนในแผง (จอเล็ก: ไม่กินที่ใต้แผง ไม่ชนปุ่มสัมผัส)
    this.questFold = new Foldable(this, x + RIGHT_W - 8, y + 6, [this.questBox, this.questTitle, this.questText], '');
    this.questFold.button.setOrigin(1, 0);
    this.questFold.button.setY(y + (c ? 5 : 7));
    this.gRight.add([this.questBox, this.questTitle, this.questText, this.questFold.button]);
    // 📌 แปลนที่ปักหมุด: ของดิบที่ยังขาด (นับรวมหีบ/โกดัง) — แตะเพื่อเปิดสมุดแปลนหน้านั้น
    this.pinBox = panel(this, 0, 0, RIGHT_W, 40, 'ui_panel_dark').setInteractive({ useHandCursor: true });
    this.pinTitle = txt(this, 12, 8, '', 13, COLORS.sea);
    this.pinText = txt(this, 12, 28, '', 12, COLORS.text, { lineSpacing: 3 });
    this.pinBox.on('pointerdown', () => this.blueprint.showPinned());
    this.pinC = this.add.container(0, 0, [this.pinBox, this.pinTitle, this.pinText]).setScale(this.k).setDepth(2).setVisible(false);
  }

  /** ปรับความสูงแผงเป้าหมายตามข้อความ */
  private layoutQuest() {
    const h = (this.compact ? 28 : 34) + this.questText.height + (this.compact ? 4 : 8);
    if (this.questBox.height !== h) this.questBox.setSize(RIGHT_W, h);
  }

  /** ขอบล่างของแผงเป้าหมายบนจอ (พับแล้ว = ขอบล่างมินิแมป) */
  private get questBottom() {
    return (this.questFold.folded ? this.minimapBottom : this.questBox.y + this.questBox.height) * this.k;
  }

  /** อัปเดตแผงปักหมุด (ทุก 0.4 วิ) — มือถือย้ายไปฝั่งซ้ายใต้แผงสถานะ (ไม่ทับปุ่มสัมผัส) */
  private updatePin(touch: boolean) {
    const info = this.gs.pinInfo();
    const show = !!info && !this.modal;
    this.pinC.setVisible(show);
    // pinBox.visible ใช้เช็กใน isPointerOverUI / การ์ดข้อมูล
    this.pinBox.setVisible(show);
    if (!show) return;
    const rows = [...info!.rows].sort((a, b) => Number(a.have >= a.need) - Number(b.have >= b.need));
    const maxRows = touch ? 3 : 5;
    const lines = rows.slice(0, maxRows).map((r) => `${r.have >= r.need ? '✔' : '✘'} ${ITEMS[r.item]?.name ?? r.item} ${Math.min(r.have, 9999)}/${r.need}${r.stored ? ` 📦${r.stored}` : ''}`);
    if (rows.length > maxRows) lines.push(`… อีก ${rows.length - maxRows} อย่าง`);
    this.pinTitle.setText(`📌 ${info!.name}${info!.ready ? ' · ✔ พร้อม (B)' : ''}`).setColor(info!.ready ? COLORS.good : COLORS.sea);
    this.pinText.setText(lines.join('\n'));
    this.pinBox.setSize(RIGHT_W, 30 + this.pinText.height + 8);
    fitText(this.pinTitle, RIGHT_W - 24);
    // คอม: ใต้แผงเป้าหมาย (ขวา) · มือถือ: ซ้ายใต้แผงสถานะ
    const k = this.k;
    if (touch) this.pinC.setPosition(M * k, this.statusBottom + 4);
    else this.pinC.setPosition(W - (M + RIGHT_W) * k, this.questBottom + 4);
  }

  private buildBoss() {
    this.bossName = txt(this, W / 2, 112, '', 15, '#ef7d57').setOrigin(0.5, 0);
    this.bossBar = new StatBar(this, W / 2 - 180, 140, 360, 16, 0xb13e53);
    this.bossGroup = [this.bossName, ...this.bossBar.objects];
    this.gTop.add(this.bossGroup);
    this.setVis(this.bossGroup, false);
  }

  private setVis(list: Phaser.GameObjects.GameObject[], v: boolean) {
    for (const o of list) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  private buildHotbar() {
    const total = HOTBAR_SIZE * SLOT + (HOTBAR_SIZE - 1) * GAP;
    const y = H - SLOT / 2 - 10 - M;
    // จอเล็ก: ขยาย kt เท่า ยึดกลางล่าง (เลื่อนซ้ายนิดหน่อย เว้นที่ให้ปุ่มสัมผัสขวา)
    const ax = this.compact ? W / 2 - 26 : W / 2;
    this.gHot = this.add.container(ax - (W / 2) * this.kt, H * (1 - this.kt)).setScale(this.kt).setDepth(2);
    this.hotbarPanel = panel(this, (W - total) / 2 - 10, y - SLOT / 2 - 10, total + 20, SLOT + 20, 'ui_panel_dark');
    this.gHot.add(this.hotbarPanel);
    // hotbar 8 ช่องเดิมไม่มีแล้ว (ช่อง 0–7 เป็นกระเป๋าธรรมดา) — แทนด้วยแถบหมวด 5 ช่องแถบเดียว (ui/LoadoutBar.ts)
    const bar = (this.loadoutBar = new LoadoutBar(this, this.gs, this.gHot, W / 2, y - 6, SLOT, {
      picked: () => (this.bagWin?.visible ? this.bagPicked : null),
      done: () => {
        this.bagPicked = null;
        this.bagKey = '';
      },
    }));
    // แผง hotbar = ขอบเขตของแถบหมวด (ใช้กันคลิกทะลุ/จัดปุ่มสัมผัส)
    this.hotbarPanel.setPosition(bar.left, bar.top).setSize(bar.right - bar.left, bar.bottom - bar.top).setAlpha(0);
    // ช่องสกิล (คอม/จอย) — มือถือใช้ปุ่ม "สกิล" บนจอแทน (แสดงคูลดาวน์บนปุ่ม)
    const sx = bar.right + 12 + SLOT / 2;
    this.skillTag = outline(txt(this, sx, y - 6 + SLOT / 2 + 8, '✦ สกิล', 10, RETRO.css.text, { fontStyle: '500' }), 2).setOrigin(0.5);
    this.gHot.add(this.skillTag);
    this.skillBox = this.add.nineslice(sx, y, 'ui_btn_hover', undefined, SLOT + 4, SLOT + 4, 8, 8, 8, 8);
    this.skillLabel = fitText(outline(txt(this, sx, y - 4, this.gs.player.char.skill.name, 11, COLORS.text, { fontStyle: '600' }).setOrigin(0.5)), SLOT);
    this.skillKey = txt(this, sx - SLOT / 2 + 4, y - SLOT / 2 + 2, 'Q', 11, COLORS.dim);
    this.skillCover = this.add.rectangle(sx - SLOT / 2, y + SLOT / 2, SLOT, SLOT, 0x000000, 0.6).setOrigin(0, 1);
    this.skillText = txt(this, sx, y + 10, '', 14).setOrigin(0.5);
    this.gHot.add([this.skillBox, this.skillLabel, this.skillKey, this.skillCover, this.skillText]);
    if (MINI_HUD) {
      // ช่องสกิลแบบเบา: กรอบเท่าช่อง hotbar · ไอคอนเล็ก + ปุ่ม Q มุมล่าง (ไม่มีชื่อไทยล้นช่อง)
      this.skillBox.setTexture('ui_slot').setSize(SLOT, SLOT);
      this.skillIcon = this.add.image(sx, y - 2, 'hud_heart').setScale(2);
      this.skillKey.setText('Q').setOrigin(1, 1).setPosition(sx + SLOT / 2 - 3, y + SLOT / 2 - 1).setFontSize(11).setColor(RETRO.css.sand);
      outline(this.skillKey, 2);
      this.skillText.setY(y);
      outline(this.skillText, 2);
      this.gHot.addAt(this.skillIcon, this.gHot.getIndex(this.skillKey));
    }
    // แถวเดียวกับแถบหมวด (ยกขึ้นเว้นที่ป้ายใต้ช่อง)
    for (const o of [this.skillBox, this.skillLabel, this.skillKey, this.skillCover, this.skillText, this.skillIcon]) o?.setY(o.y - 6);
  }

  private muteIcon: Phaser.GameObjects.Image | null = null;
  /** ของในแถบเครื่องมือ (ซ่อนได้ในโหมด HUD เบา) + รายการคำสั่ง (ไว้ทำเมนู ☰) */
  private toolbarObjs: Phaser.GameObjects.GameObject[] = [];
  private toolActions: [string, string, () => void][] = [];
  private miniHud: MiniHud | null = null;
  private miniPanel: Phaser.GameObjects.GameObject | null = null;
  private miniFrame: Phaser.GameObjects.Rectangle | null = null;
  private menuBtns: Phaser.GameObjects.Container | null = null;
  private menuPop: Phaser.GameObjects.Container | null = null;
  private menuBlock: Phaser.GameObjects.Zone | null = null;
  private graceToasted = false;
  private menuPopup: MenuPopup | null = null;
  private bpTabFor = '';
  private skillIcon: Phaser.GameObjects.Image | null = null;
  private miniFold: Foldable | null = null;
  private miniExpand: Phaser.GameObjects.Text | null = null;
  private miniRetroFrame: Phaser.GameObjects.GameObject | null = null;
  private menuDot: Phaser.GameObjects.Arc | null = null;

  /** แถบปุ่มด้านบน (ไอคอนพิกเซล tb_*) — จอเล็ก: ปุ่มใหญ่ขึ้น ตัด 2.5D/ซูม (บีบนิ้วซูม · ตั้งค่าในเมนู ⚙) */
  private buildToolbar() {
    const all: [string, string, () => void][] = [
      ['bag', 'กระเป๋า Tab', () => this.toggleBag()],
      ['blueprint', 'แปลน B', () => this.blueprint.toggle('build')],
      ['upgrade', 'อัพเกรด U', () => this.gs.build.toggleUpgrade()],
      ['book', 'คู่มือ J', () => this.infoWin.toggle()],
      ['map', 'แผนที่ M', () => this.mapWin.toggle()],
      ['shirt', 'ชุด O', () => this.wardrobeWin.toggle()],
      ['robot', 'ออโต้ T', () => this.autoWin.toggle()],
      ['camera', '2.5D V', () => this.gs.setTilt(this.gs.tilt > 0 ? 0 : 0.6)],
      ['zoomIn', 'ซูมเข้า', () => this.gs.setZoom(this.gs.zoom * 1.2)],
      ['zoomOut', 'ซูมออก', () => this.gs.setZoom(this.gs.zoom / 1.2)],
      // 🔊/🔇 ปิดเสียงทั้งหมด (ปุ่ม 0 / N ก็ได้) — ไอคอนเปลี่ยนตาม 'audio:changed'
      [Sfx.isMuted ? 'mute' : 'sound', 'เสียง N', () => this.toggleSound()],
      ['gear', 'เมนู Esc', () => this.pauseWin.toggle()],
    ];
    // จอเล็ก: เหลือ 7 ปุ่ม (คู่มือ/ชุด/2.5D/ซูม อยู่ในเมนู ⚙ · บีบนิ้วซูม) ให้แถบพอดีระหว่างแผงสถานะกับมินิแมป
    const items = this.compact ? all.filter(([i]) => !['camera', 'zoomIn', 'zoomOut', 'book', 'shirt'].includes(i)) : all;
    this.toolActions = all;
    this.toolbarObjs = [];
    const bw = this.compact ? 41 : 40;
    const bh = this.compact ? 40 : 36;
    const ph = bh + 14;
    const x0 = W / 2 - (items.length * bw) / 2;
    this.toolbarPanel = panel(this, x0 - 8, M, items.length * bw + 16, ph, 'ui_panel_dark');
    this.gTop.add(this.toolbarPanel);
    items.forEach(([icon, tip, fn], i) => {
      const x = x0 + i * bw + bw / 2;
      const cy = M + ph / 2;
      const b = this.add.nineslice(x, cy, 'ui_slot', undefined, bw - 4, bh, 6, 6, 6, 6).setInteractive({ useHandCursor: true });
      const ic = this.add.image(x, cy, `tb_${icon}`);
      if (tip.startsWith('เสียง')) this.muteIcon = ic;
      const tipT = txt(this, x, M + ph + 2, tip, 12, COLORS.cream).setOrigin(0.5, 0).setBackgroundColor('#0b0d1fdd').setPadding(6, 2, 6, 2).setVisible(false).setDepth(30);
      b.on('pointerover', () => {
        tipT.setVisible(true);
        b.setTexture('ui_slot_sel');
      }).on('pointerout', () => {
        tipT.setVisible(false);
        b.setTexture('ui_slot');
      }).on('pointerdown', () => {
        Sfx.unlock();
        // กดแล้วยุบแล้วเด้งกลับ (รู้สึกว่ากดติด)
        this.tweens.killTweensOf([b, ic]);
        b.setScale(0.88);
        ic.setScale(0.88);
        this.tweens.add({ targets: [b, ic], scale: 1, duration: 220, ease: 'Back.easeOut' });
        fn();
      });
      this.gTop.add([b, ic, tipT]);
      this.toolbarObjs.push(b, ic, tipT);
    });
  }

  /**
   * HUD แบบเบา (แนว Under the Island): ซ่อนแผงสถานะ/แถบเครื่องมือ/กรอบใหญ่ → หัวใจ + ไอคอนเล็ก · ปุ่ม ☰ + กระเป๋า
   * มินิแมปกรอบพิกเซลบาง · เป้าหมายบรรทัดเดียว · เงินเป็นตัวเลขลอย · ทุกคำสั่งเดิมอยู่ในเมนู ☰ (และปุ่มลัดเดิม)
   */
  private applyMiniHud() {
    this.gLeft.setVisible(false);
    this.miniHud = new MiniHud(this, this.gs, this.k);
    this.toolbarObjs.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
    this.toolbarPanel.setVisible(false);
    this.hotbarPanel.setAlpha(0);
    (this.miniPanel as unknown as Phaser.GameObjects.Components.Visible | null)?.setVisible(false);
    this.miniFrame?.setVisible(false);
    this.miniRetroFrame = retroPanel(this, this.miniImg.x - 4, this.miniImg.y - 4, MINI + 8, MINI + 8, { alpha: 0.55 });
    this.gRight.addAt(this.miniRetroFrame, 0);
    // ⤢ ขยาย = ไอคอนเล็กบนมุมขวาบนของกรอบมินิแมป · ▾ พับมินิแมป/เป้าหมาย ย้ายเข้าเมนู ☰
    this.miniExpand?.setBackgroundColor('#1f2a33cc').setPadding(3, 0, 3, 0).setFontSize(11).setPosition(this.miniImg.x + MINI - 1, this.miniImg.y + 1).setOrigin(1, 0);
    this.miniFold?.button.setVisible(false);
    this.questFold.button.setVisible(false);
    [this.dayText, this.clockText, this.placeText, this.specialChip].forEach((t) => outline(t, 2));
    this.questBox.setAlpha(0);
    this.questText.setAlpha(0);
    outline(this.questTitle, 2);
    // กิจกรรม/กล่องฟรี + สารอาหาร: ไม่ค้างบนจอ (กิจกรรมเปิดจากเมนู ☰ · สารอาหารต่ำ = ไอคอนเล็กข้างหัวใจ)
    this.eventsPanel?.setShown(false);
    this.bodyPanel?.hide();
    this.skillLabel.setVisible(false);
    this.walletC.setY(M + 12);
    this.renderMoney();
    // ปุ่ม ☰ + กระเป๋า ซ้ายมินิแมป (มือถือ: ใหญ่พอนิ้ว ≥ 44px บนจอจริง)
    const s = this.gs.controls.touchMode ? Math.max(30, Math.ceil(44 / (displayScale(this) * this.k))) : 28;
    const bx = W - M - RIGHT_W - 8 - s / 2;
    const by = M + s / 2;
    const c = this.add.container(0, 0);
    const menu = retroButton(this, bx, by, s, s, '', () => this.toggleMenuPop());
    // จุดแจ้งเตือนบน ☰ (มีกล่องฟรีให้รับ)
    this.menuDot = this.add.circle(bx + s / 2 - 3, by - s / 2 + 3, 3, 0xd98a7e).setStrokeStyle(1, 0x0b0f12).setVisible(false);
    // ☰ วาดเป็นขีดพิกเซล 3 เส้น (ฟอนต์ไม่มีสัญลักษณ์นี้)
    const bars = this.add.graphics();
    for (const dy of [-4, 0, 4]) bars.fillStyle(0x0b0f12, 1).fillRect(bx - 6, by + dy - 1 + 1, 12, 2).fillStyle(0xeef0e6, 1).fillRect(bx - 6, by + dy - 1, 12, 2);
    const bag = retroButton(this, bx - s - 6, by, s, s, '', () => this.toggleBag());
    const bagIc = this.add.image(bx - s - 6, by, 'tb_bag').setDisplaySize(16, 16);
    c.add([...menu.objects, bars, ...bag.objects, bagIc, this.menuDot]);
    this.gRight.add(c);
    this.menuBtns = c;
    // เมนู ☰: รายการคำสั่งทั้งหมดของแถบเครื่องมือเดิม
    const rowH = 24;
    const pw = 176;
    const actions: [string, string, () => void][] = [
      ['events', 'กิจกรรม · กล่องฟรี', () => this.eventsPanel?.setShown(!this.eventsPanel.shown)],
      ['pad', 'จัดตำแหน่งปุ่ม (มือถือ)', () => this.openTouchEditor()],
      ['map', 'แผนที่ย่อ ซ่อน/แสดง', () => this.toggleMiniMap()],
      ...this.toolActions,
    ];
    // เมนูหลักแบบกรอบไม้ (ui/MenuPopup.ts): ช่องไอคอน 4×2 + แถวปุ่มเล็ก — แทนรายการตัวหนังสือ
    this.menuPopup = new MenuPopup(this, [
      { art: 'bag', fallback: 'tb_bag', label: 'กระเป๋า', key: 'Tab', run: () => this.openMenuTab('bag') },
      { art: 'blueprint', fallback: 'tb_blueprint', label: 'สมุดแปลน', key: 'B', run: () => this.openMenuTab('build') },
      { art: 'craft', fallback: 'tb_upgrade', label: 'คราฟต์', key: 'C', run: () => this.openMenuTab('items') },
      { art: 'catalog', fallback: 'tb_book', label: 'คลังข้อมูล', key: 'J', run: () => this.openMenuTab('info') },
      { art: 'map', fallback: 'tb_map', label: 'แผนที่', key: 'M', run: () => this.mapWin.open() },
      { art: 'wardrobe', fallback: 'tb_shirt', label: 'ตู้เสื้อผ้า', key: 'O', run: () => this.wardrobeWin.open() },
      { art: 'events', fallback: 'tb_gear', label: 'กิจกรรม', run: () => this.eventsPanel?.setShown(!this.eventsPanel.shown), dot: () => !!this.eventsPanel?.claimable },
      { art: 'settings', fallback: 'tb_gear', label: 'ตั้งค่า', key: 'Esc', run: () => this.openMenuTab('settings') },
    ], [
      { label: 'อัพเกรด (U)', run: () => this.gs.build.toggleUpgrade() },
      { label: 'ออโต้ (T)', run: () => this.autoWin.toggle() },
      { label: 'แผนที่ย่อ', run: () => this.toggleMiniMap() },
      { label: 'จัดปุ่ม', run: () => this.openTouchEditor() },
      { label: 'เสียง (N)', run: () => this.toggleSound() },
    ], this.compact);
    const ph = actions.length * rowH + 12;
    const pop = this.add.container(0, 0).setVisible(false);
    const px = bx + s / 2 - pw;
    const py = by + s / 2 + 6;
    pop.add(retroPanel(this, px, py, pw, ph));
    actions.forEach(([icon, tip, fn], i) => {
      const ry = py + 6 + i * rowH;
      const strip = this.add.rectangle(px + 3, ry, pw - 6, rowH, 0xffffff, 0.07).setOrigin(0).setVisible(false);
      const ic = this.textures.exists(`tb_${icon}`)
        ? this.add.image(px + 16, ry + rowH / 2, `tb_${icon}`).setDisplaySize(16, 16)
        : this.add.image(px + 16, ry + rowH / 2, iconTexture(this, 'star')).setScale(1.5);
      if (tip.startsWith('เสียง')) this.muteIcon = ic;
      const t = retroLabel(this, px + 30, ry + rowH / 2, tip, RETRO.css.text).setOrigin(0, 0.5);
      const hit = this.add.zone(px, ry, pw, rowH).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => (strip.setVisible(true), t.setColor(RETRO.css.gold)));
      hit.on('pointerout', () => (strip.setVisible(false), t.setColor(RETRO.css.text)));
      hit.on('pointerdown', () => {
        Sfx.play('click');
        this.toggleMenuPop(false);
        fn();
      });
      pop.add([strip, ic, t, hit]);
    });
    this.gRight.add(pop);
    this.menuPop = pop;
    // แตะที่อื่น = ปิดเมนู
    this.menuBlock = this.add.zone(0, 0, W, H).setOrigin(0).setDepth(1).setInteractive().setVisible(false);
    this.menuBlock.on('pointerdown', () => this.toggleMenuPop(false));
  }

  /**
   * หน้าต่างหลักทำตัวเป็น "เมนู" เดียว: กระเป๋า · สมุดแปลน · คราฟต์ · คลังข้อมูล · ตั้งค่า (แท็บบนหัว)
   * เปิดบานหนึ่ง = ปิดบานอื่นในกลุ่ม · Tab/B/J/Esc/☰ เปิดตรงแท็บนั้นอยู่แล้ว
   */
  private setupMenuGroup() {
    const wins = [this.bagWin, this.blueprint.win, this.infoWin, this.pauseWin];
    for (const w of wins) w.onOpen = () => wins.forEach((o) => o !== w && o.visible && o.close());
    const pick = (id: string) => this.openMenuTab(id as MenuTab);
    this.bagWin.setHeaderTabs(MENU_TABS, 'bag', pick);
    this.infoWin.setHeaderTabs(MENU_TABS, 'info', pick);
    this.pauseWin.setHeaderTabs(MENU_TABS, 'settings', pick);
    this.bpTabFor = this.blueprint.section;
    this.blueprint.win.setHeaderTabs(MENU_TABS, this.blueprint.section, pick);
    // ภาพไอคอนเมนูโหลดเบื้องหลัง → ใส่ไอคอนในแท็บเมื่อพร้อม
    if (!this.textures.exists(menuArtKey('bag'))) loadMenuArt(this, () => this.sys.isActive() && this.setupMenuGroup());
  }

  private openMenuTab(id: MenuTab) {
    Sfx.play('click');
    if (id === 'bag') this.bagWin.open();
    else if (id === 'build' || id === 'items') this.blueprint.show(id);
    else if (id === 'info') this.infoWin.open();
    else this.pauseWin.open();
  }

  /** ซ่อน/แสดงมินิแมป (จากเมนู) */
  private toggleMiniMap() {
    const f = this.miniFold;
    if (!f) return;
    f.set(!f.folded);
    (this.miniRetroFrame as unknown as Phaser.GameObjects.Components.Visible | null)?.setVisible(!f.folded);
    f.button.setVisible(false);
  }

  private toggleMenuPop(v?: boolean) {
    if (this.menuPopup) {
      this.menuPopup.toggle(v ?? !this.menuPopup.visible);
      return;
    }
    if (!this.menuPop) return;
    v ??= !this.menuPop.visible;
    this.menuPop.setVisible(v);
    this.menuBlock?.setVisible(v);
    if (this.menuBlock?.input) this.menuBlock.input.enabled = v;
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
    this.miniHud?.update(this.time.now);
    this.menuDot?.setVisible(!!this.eventsPanel?.claimable && Math.floor(this.time.now / 500) % 2 === 0);
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    this.bars.hunger.bar.setAlpha(p.hunger < 20 && blink ? 0.3 : 1);
    this.bars.thirst.bar.setAlpha(p.thirst < 20 && blink ? 0.3 : 1);
    this.bars.hp.bar.setAlpha(p.hp < p.maxHp * 0.25 && blink ? 0.3 : 1);
    this.updateMoney(delta);
    this.powerText.setText(`⚔ ${g.player.power.toLocaleString()}`);
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
    this.placeText.setScale(Math.min(1, (RIGHT_W - 24) / Math.max(1, this.placeText.width)));
    this.miniTimer -= delta;
    if (this.miniTimer <= 0) {
      // คุณภาพต่ำ = วาดมินิแมปห่างขึ้น (ลูปทุกช่อง 96×96)
      this.miniTimer = qualityKnobs().minimapMs;
      this.drawMinimap();
    }
    const mcx = this.miniImg.x + MINI / 2;
    const mcy = this.miniImg.y + MINI / 2;
    const mg = this.miniGfx.clear().fillStyle(0xff3355, 1).fillRect(mcx - 2, mcy - 2, 4, 4);
    // เกาะพิเศษ: สถานะ + ลูกศรชี้ทาง (ตอนเปิด)
    const sp = g.special;
    this.specialChip.setText(sp.open ? `✨ เกาะพิเศษ ${openLeft(sp)}` : `🔒 เกาะพิเศษ ${fmtLeft(sp.msLeft)}`).setColor(sp.open ? COLORS.gold : '#a77bdb');
    const sis = g.world.slots[SPECIAL_SLOT];
    if (sp.open && !sp.always && sis) {
      const dx = sis.cx - p.x / 16;
      const dy = sis.cy - p.y / 16;
      if (Math.hypot(dx, dy) > MINI / 2) {
        const a = Math.atan2(dy, dx);
        const cx = mcx + Math.cos(a) * (MINI / 2 - 8);
        const cy = mcy + Math.sin(a) * (MINI / 2 - 8);
        const pulse = 5 + Math.sin(this.time.now / 200) * 1.5;
        mg.fillStyle(0xffcd75, 1).fillTriangle(
          cx + Math.cos(a) * pulse, cy + Math.sin(a) * pulse,
          cx + Math.cos(a + 2.4) * pulse, cy + Math.sin(a + 2.4) * pulse,
          cx + Math.cos(a - 2.4) * pulse, cy + Math.sin(a - 2.4) * pulse,
        );
      }
    }

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
    // มือถือ: ซ่อนช่องสกิลข้าง hotbar (มีปุ่ม "สกิล" บนจอ แสดงคูลดาวน์แทน)
    this.setVis([this.skillBox, this.skillKey, this.skillCover, this.skillText, this.skillTag], !touch);
    this.skillIcon?.setVisible(!touch).setAlpha(p.skillCd > 0 ? 0.4 : 1);
    this.skillLabel.setVisible(!touch && !MINI_HUD);
    this.skillCdT?.setText(p.skillCd > 0 ? `${Math.ceil(p.skillCd)}` : '');
    this.hintText.setText(g.hint ? `${pad ? 'Ⓐ' : touch ? '[ใช้]' : '[คลิก/E]'} ${g.hint}` : '');
    this.padLegend.setVisible(pad && !this.modal);
    // โหมดสัมผัสเปลี่ยน (หรือเพิ่งปิดหน้าจัดตำแหน่ง) → จัดปุ่ม/hotbar ใหม่
    if (!this.touchEditor && this.touchApplied !== touch) {
      this.touchApplied = touch;
      this.applyTouchLayout(touch);
    }
    this.touchLayer.setVisible((touch || !!this.touchEditor) && !this.modal);
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
    // HUD เบา: เป้าหมายบรรทัดเดียว (ชื่อ + ความคืบหน้า) · หลังจบบทสอนซ่อน (ปักหมุดแปลนยังแสดงแยก)
    if (MINI_HUD) {
      const target = g.quests?.target ?? 0;
      this.questTitle.setText(q ? `◆ ${q.title}${q.goal.type === 'visit' ? '' : ` ${Math.min(g.quests!.progress, target)}/${target}`}` : '').setAlpha(q ? 1 : 0);
      this.questFold.button.setAlpha(q ? 1 : 0);
      fitText(this.questTitle, RIGHT_W - 40);
    } else if (q) {
      this.questTitle.setText(`★ ${q.title} (${(g.quests!.index + 1)}/${STORY.length})`);
      const target = g.quests!.target;
      this.questText.setText(q.text + (q.goal.type === 'visit' ? '' : ` (${Math.min(g.quests!.progress, target)}/${target})`));
    } else {
      this.questTitle.setText('★ เล่นอิสระ');
      this.questText.setText('ฟาร์ม ขุดแร่ ตกปลา ล่ามอน เปิดกล่อง อัพเกรด — เกาะโตตามความขยัน');
    }
    fitText(this.questTitle, RIGHT_W - 52);
    this.layoutQuest();
    const boss = g.boss;
    const showBoss = !!boss && boss.active && Phaser.Math.Distance.Between(boss.x, boss.y, p.x, p.y) < 300;
    this.setVis(this.bossGroup, showBoss);
    if (showBoss) {
      this.bossName.setText(`👑 ${boss!.def.name}`);
      this.bossBar.set(boss!.hp / boss!.def.hp, delta);
    }
    let ds = g.disaster.status;
    // HUD เบา: ข้อความ "ช่วงตั้งหลัก" แสดงครั้งเดียวเป็น toast แล้วไม่ค้างบนจอ
    if (MINI_HUD && ds && ds.includes('ช่วงตั้งหลัก')) {
      if (!this.graceToasted) {
        this.graceToasted = true;
        this.toast(ds, COLORS.dim);
      }
      ds = null;
    }
    this.statusText.setText(g.playerSafe ? '🕊 เขตปลอดภัย — ห้ามต่อสู้' : ds ?? '').setColor(g.playerSafe ? COLORS.good : COLORS.gold);
    this.advBadge.setVisible(g.inAdventure && !this.modal);
    if (g.inAdventure) this.advBadge.setAlpha(0.85 + Math.sin(this.time.now / 260) * 0.15);
  }

  // ======================================================================
  // แจ้งเตือน
  // ======================================================================
  /** แจ้งเตือนกลางจอ: ป้ายพื้นมืดมน ตัวหนังสือ 16px (จอเล็กขยายตาม HUD) */
  private toast(text: string, color = COLORS.text) {
    // ป้ายแจ้งเตือนแบบริบบอน (ui/Toast.ts) — ตัวเล็ก-บาง · ซ้อนไม่เกิน 3 (คลาสสิก 4) ใต้แถบเงิน
    this.notify.show(text, color);
  }

  private pickup(id: string, n: number) {
    const def = ITEMS[id];
    const t = txt(this, 16, 0, `+${n.toLocaleString()} ${def.name}`, MINI_HUD ? 12 : 15, MINI_HUD ? muteColor(RARITY[def.rarity ?? 'common'].color) : RARITY[def.rarity ?? 'common'].color);
    if (MINI_HUD) outline(t, 2);
    this.feed.push(t);
    if (this.feed.length > 5) this.feed.shift()?.destroy();
    // มือถือ: เหนือจอยสติก · คอม: ซ้ายล่าง
    const fy = this.gs.controls.touchMode ? H - 236 * this.kt : H - 190;
    this.feed.forEach((f, i) => f.setY(fy - (this.feed.length - 1 - i) * 20));
    // 🎉 ฉลองตามความหายาก (ธรรมดา = ประกายเล็กท้ายข้อความ · หายาก = แสงพุ่ง · มหากาพย์+ = การ์ดกลางจอ)
    this.rewardFx.onPickup(id, n, { x: t.x + t.displayWidth + 8, y: t.y + t.displayHeight / 2 });
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 400, onComplete: () => {
      this.feed = this.feed.filter((x) => x !== t);
      t.destroy();
    } });
  }

  /** แบนเนอร์กลางจอ (ชื่อเกาะ/ภัย/เลเวลอัพ): แถบมืดพาดจอให้อ่านออกเหนือโลกเกม */
  private banner(name: string, desc: string, color: string) {
    if (MINI_HUD) return this.slimBanner(name, desc, color);
    // ใต้แถว toast (จอเล็ก: ต่ำลงอีก ไม่ทับข้อความสถานะใต้แถบเงิน)
    const by = this.compact ? H / 2 - 56 : H / 2 - 76;
    const band = this.add.graphics().setDepth(9).setAlpha(0);
    band.fillGradientStyle(0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0, 0, 0.7, 0.7).fillRect(0, by - 50, W, 30);
    band.fillStyle(0x0b0d1f, 0.7).fillRect(0, by - 20, W, 84);
    band.fillGradientStyle(0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0x0b0d1f, 0.7, 0.7, 0, 0).fillRect(0, by + 64, W, 30);
    const t = heading(this, W / 2, by, name, 38).setOrigin(0.5).setAlpha(0).setDepth(9);
    const d = txt(this, W / 2, by + 42, desc, 17, color, { wordWrap: { width: 640 }, align: 'center' }).setOrigin(0.5, 0).setAlpha(0).setDepth(9);
    t.setScale(1.2);
    this.tweens.add({ targets: t, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [t, d, band], alpha: 1, duration: 400, yoyo: true, hold: 2000, onComplete: () => (t.destroy(), d.destroy(), band.destroy()) });
  }

  /** HUD เบา: แบนเนอร์เป็นแถบบางบรรทัดเดียว (ชื่อสีทอง · คำอธิบายสั้น) กลางจอบน ไม่บังเกม */
  private slimBanner(name: string, desc: string, color: string) {
    // ใต้แถว toast (สูงสุด 3 แถว) — ui/Toast.ts ริบบอนบาง · ตัวเล็ก-บาง
    this.notify.banner(name, desc, color);
  }

  private achievement(a: AchievementDef) {
    // การ์ด 2 บรรทัดในกองแจ้งเตือน + ประกายดาวเล็ก
    const c = this.notify.card(`🏆 ${a.name}`, a.desc, COLORS.gold);
    this.time.delayedCall(80, () => c.scene && this.rewardFx.spark(c.x + 60 * this.k, c.y + 10 * this.k, 0xffcd75, false));
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
    const w = new UIWindow(this, 110, 40, 740, 484, '🎒 กระเป๋า');
    const gs = this.gs;
    const inv = gs.player.inventory;
    // ---- ฝั่งซ้าย: หุ่นอุปกรณ์ ----
    w.add(panel(this, 0, 0, 244, 252, 'ui_panel_dark'));
    // หุ่นตัวละคร: รูปเหมือนละเอียด 4 เท่า (gfx/art/heroPortrait) ขยาย 2 เท่า เท้ายืนบนเงา · หายใจ/กะพริบตา
    // กรอบว่างระหว่างคอลัมน์ช่องอุปกรณ์ (ช่องซ้าย x≤45 · ขวา x≥199 · แถวล่าง y≥203) เว้นขอบ 6px
    // → ขยายเลขเต็มที่ใหญ่สุดที่ใส่ได้ (ตอนนี้ 1× = 80×96 · จอ HiDPI ยังเห็นทุกพิกเซล) วางกลางกรอบ
    const BOX = { x0: 51, x1: 193, y0: 6, y1: 197 };
    const bw = BOX.x1 - BOX.x0;
    const bh = BOX.y1 - BOX.y0;
    const pScale = Math.max(1, Math.floor(Math.min(bw / PORTRAIT_W, bh / PORTRAIT_H)));
    const pTop = BOX.y0 + Math.floor((bh - PORTRAIT_H * pScale) / 2);
    const feetY = pTop + PORTRAIT_FEET * pScale;
    const glow = this.add.ellipse(122, feetY, Math.min(bw - 8, 26 * pScale * 4), 18, 0x73eff7, 0.18);
    const portrait = new PortraitView(this, 122, feetY, pScale);
    // ออร่าย่อให้วงกว้างสุด (≈ 40×scale) ไม่เกินกรอบ
    const auraScale = Math.min(portrait.worldScale, bw / 40);
    w.add([glow, drawAuraPreview(this, 122, feetY, auraScale, () => auraOf(gs.player)), portrait.sprite]); // ออร่าตามอุปกรณ์ (fx/GearAura)
    gs.equipFx.preview = (r, c) => w.visible && playEquipFlourish(this, 122, pTop + (PORTRAIT_H * pScale) / 2, r, c, w, bw); // ประกายรอบรูปตอนสวมของ
    this.tweens.add({ targets: glow, alpha: { from: 0.7, to: 1.3 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
    const power = txt(this, 0, 260, '', 16, COLORS.gold);
    w.add(power);
    // ค่าพลัง 2 คอลัมน์ (ชื่อซ้าย · ค่าชิดขวา) แถวสูงคงที่ → ไม่ล้นลงไปใต้ปุ่มบัฟฐาน · ค่า 0 = สีจาง
    if (MINI_HUD) w.addHelp([], () => (this.bagKey = ''));
    const statKeys: (keyof Stats)[][] = [['atk', 'def', 'hp', 'stamina', 'speed', 'crit', 'lifesteal'], ['gather', 'cold', 'light', 'luck', 'regen', 'bag']];
    const STAT_Y = 294;
    const STAT_PITCH = 15;
    const stripes = this.add.graphics();
    for (let r = 0; r < 7; r += 2) stripes.fillStyle(0xffffff, 0.05).fillRect(0, STAT_Y + r * STAT_PITCH - 7, 244, STAT_PITCH - 1);
    w.add(stripes);
    const statCells = statKeys.flatMap((col, ci) => col.map((k, ri) => {
      const x = ci * 126 + 4;
      const y = STAT_Y + ri * STAT_PITCH;
      const n = txt(this, x, y, STAT_INFO[k].name, 12, COLORS.dim).setOrigin(0, 0.5);
      const v = txt(this, x + 112, y, '', 12, COLORS.text, { fontStyle: '500' }).setOrigin(1, 0.5);
      w.add([n, v]);
      return { k, v };
    }));
    const baseBtn = button(this, 122, 418, 244, 26, '🏠 บัฟจากฐาน', () => {
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
      if (p.rightButtonDown()) {
        if (!filt.menu(index, p)) inv.split(index); // คลิกขวา = เมนูใส่ช่องใช้งาน (ui/bagFilter.ts)
      } else if (this.bagPicked === null) {
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
    w.add(txt(this, RX, 180, 'กระเป๋า (แถวล่าง)', 12, COLORS.dim)); // hotbar เดิม = ช่องกระเป๋าธรรมดา (แถบด้านล่างเป็นแถบหมวดแล้ว)
    const hot = this.grid(w, RX, 198, 8, HOTBAR_SIZE, 36, (i, p) => onClick(i, p));
    // หมวด (แถวบนขวาของป้ายกระเป๋า) + แถบหมวด ⛏❤✨🔦 ข้างแถวล่าง + เมนูคลิกขวา
    const filt = new BagFilter(this, w, gs, {
      bag, hot, hotOffset: HOTBAR_SIZE, x: RX + 120, y: 0, right: RX + 452, loadX: RX + 318, loadY: 198,
      picked: () => this.bagPicked,
      done: () => {
        this.bagPicked = null;
        this.bagKey = '';
      },
    });
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
    const info = txt(this, RX, 282, '', MINI_HUD ? 12 : 13, COLORS.text, { wordWrap: { width: 446 }, lineSpacing: MINI_HUD ? 3 : 4 });
    w.add(info);
    // ⬆ อัพเกรดของที่เลือก (อาวุธ/เครื่องมือ/อุปกรณ์) — สำเร็จ 100%
    const upB = button(this, RX + 330, 418, 232, 26, '⬆ อัพเกรด', () => {
      const ref = this.eqSel ?? this.bagSel;
      if (ref === null) return;
      const r = gs.upgradeItem(ref);
      if (!r.ok) this.toast(r.msg, COLORS.bad);
      this.bagKey = '';
    }, true, 12);
    w.add(upB.objects);

    return this.register(w, () => {
      const pl = gs.player;
      const key = `${inv.version}|${pl.texKey}|${JSON.stringify(pl.equip)}|${pl.power}|${this.bagPicked}|${this.bagSel}|${this.eqSel}|${this.showBaseBuffs}|${gs.wallet.coins}|${filt.key}`;
      if (key === this.bagKey) return;
      this.bagKey = key;
      portrait.sync(pl.look, pl.equip); // สร้างใหม่เฉพาะเมื่อลุค/อุปกรณ์/เลเวลเปลี่ยน
      for (const e of eqViews) {
        e.v.set(pl.equip[e.slot], e.slot === this.eqSel);
        e.ghost.setVisible(!pl.equip[e.slot]);
      }
      power.setText(`Lv.${pl.level}  ⚔ พลังรวม ${pl.power.toLocaleString()}`);
      for (const c of statCells) c.v.setText(STAT_INFO[c.k].fmt(pl.stats[c.k])).setColor(pl.stats[c.k] ? COLORS.text : '#6b7489');
      const size = inv.slots.length - HOTBAR_SIZE;
      bagLabel.setText(`กระเป๋า ${inv.slots.slice(HOTBAR_SIZE).filter(Boolean).length}/${size} ช่อง`);
      bag.forEach((v, i) => {
        const on = i < size;
        v.objects.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
        v.dirty();
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
          : w.helpOn || !MINI_HUD
            ? ['• พลัง = เลเวล + อุปกรณ์ (×อัพเกรด) + บัฟฐาน · ตาย = เลเวลลด 1', '• คลิกไอเทม = ดู · คลิกอีกช่อง = ย้าย · คลิกขวา = แบ่งครึ่ง', '• เลือกอุปกรณ์แล้วกด "สวมใส่" หรือคลิกช่องบนหุ่น']
            : [];
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
      filt.refresh();
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
    // ใช้ของช่องนั้นตรงๆ (มือว่างเป็นปกติ — แถบหมวด) · ของขว้าง = ถือไว้ในช่องอาวุธ
    p.selected = i;
    this.gs.useHeld();
    if (!(p.held && ITEMS[p.held.id].type === 'throw')) p.selected = -1;
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
    const w = new UIWindow(this, 100, 60, 760, 460, '📖 คู่มือไอเทม');
    const cats: [string, string][] = [['all', 'ทั้งหมด'], ['material', 'วัตถุดิบ'], ['food', 'อาหาร'], ['tool', 'เครื่องมือ'], ['weapon', 'อาวุธ'], ['armor', 'เกราะ'], ['box', 'กล่อง/อื่นๆ']];
    const setTab = this.tabs(w, 0, 0, cats, 66, (c) => {
      this.infoCat = c;
      this.infoPage = 0;
    });
    let shown: string[] = [];
    const views = this.grid(w, 0, 40, 11, 66, 36, (i) => (this.infoSel = shown[i] ?? null));
    const detail = txt(this, 452, 40, '', 13, COLORS.text, { wordWrap: { width: 270 }, lineSpacing: 4 });
    const page = txt(this, 200, 290, '', 12, COLORS.dim).setOrigin(0.5);
    const prev = button(this, 120, 290, 50, 26, '◀', () => (this.infoPage = Math.max(0, this.infoPage - 1)), true, 12);
    const next = button(this, 280, 290, 50, 26, '▶', () => this.infoPage++, true, 12);
    w.add([detail, page, ...prev.objects, ...next.objects]);
    w.add(txt(this, 0, 320, 'สีชื่อ = ความหายาก: ธรรมดา · ดี · หายาก · มหากาพย์ · เทพ\nกล่อง: ไม้ < เหล็ก < ทอง < เทพ (ดูอัตราดรอปที่กล่อง)', 13, COLORS.dim, { lineSpacing: 4 }));
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
    const w = new UIWindow(this, 100, 70, 760, 420, '📦 หีบเก็บของ');
    const title = txt(this, 0, 0, '', 14, COLORS.gold);
    w.add([title, txt(this, 390, 0, 'กระเป๋า (คลิก = ฝาก)', 14, COLORS.gold)]);
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
    const all = button(this, 470, 216, 160, 32, 'ฝากทั้งหมด', () => {
      const st = this.liveStorage();
      const inv = this.gs.player.inventory;
      if (!st) return;
      for (let i = HOTBAR_SIZE; i < inv.slots.length; i++) if (inv.slots[i] && st.addSlot(inv.slots[i]!)) inv.slots[i] = null;
      inv.version++;
    }, true, 12);
    const same = button(this, 640, 216, 160, 32, 'ฝากของซ้ำ (Z)', () => this.quickDeposit(), true, 12);
    const sortChest = button(this, 470, 254, 160, 32, 'จัดเรียงคลัง', () => {
      const st = this.liveStorage();
      if (st) this.sortSlots(st, 0);
    }, true, 12);
    const sortMine = button(this, 640, 254, 160, 32, 'จัดเรียงกระเป๋า', () => this.sortBag(this.gs.player.inventory), true, 12);
    const tip = txt(this, 390, 278, '📦 ของในหีบ/โกดังบนเกาะ ใช้สร้าง คราฟต์ อัพเกรด ซ่อม ได้อัตโนมัติ · "ฝากทั้งหมด" ไม่รวม hotbar', 13, COLORS.dim, { wordWrap: { width: 330 }, lineSpacing: 4 });
    if (MINI_HUD) w.addHelp([tip]);
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
  /** ร้านค้าทางไกล (ท่าส่งของ) — ราคา/ค่าส่งคิดใน MarketSystem */
  private tradeRemote = false;
  private marketRemote = false;
  private tradePage = 0;
  private sellIdx: number | null = null;
  private sellQty = 1;
  private sellPrice = 10;

  /** stall < 0 = เปิดจากท่าส่งของ (ทางไกล · ค่าส่ง 10%) */
  private openTrade(stall: number) {
    this.tradeStall = stall;
    this.tradeRemote = stall < 0;
    this.tradePage = 0;
    this.tradeWin.open();
    // ออนไลน์: ดึงแผงล่าสุดจากเซิร์ฟเวอร์ (หน้าต่างอ่านจากแคชทุก 150 ms อยู่แล้ว)
    if (getRoomService().online) void getRoomService().sync();
  }

  private makeTrade() {
    const w = new UIWindow(this, 60, 50, 840, 470, '⚖ ตลาดผู้เล่น');
    const rooms = getRoomService();
    w.add(txt(this, 0, 0, 'ของที่ผู้เล่นวางขาย', 15, COLORS.gold));
    const rows: { bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; art: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; btn: Button }[] = [];
    let shown: TradeListing[] = [];
    for (let i = 0; i < 8; i++) {
      const y = 38 + i * 38;
      const bg = this.add.rectangle(0, y, 440, 34, 0x333c57, 0.45).setOrigin(0, 0.5);
      const icon = this.add.image(18, y, 'px');
      const art = this.add.image(18, y, 'px').setVisible(false);
      const name = txt(this, 38, y, '', 12).setOrigin(0, 0.5);
      const btn = button(this, 395, y, 86, 28, '', () => this.buyListing(shown[i]), true, 12);
      rows.push({ bg, icon, art, name, btn });
      w.add([bg, icon, art, name, ...btn.objects]);
    }
    const page = txt(this, 220, 352, '', 12, COLORS.dim).setOrigin(0.5);
    const prev = button(this, 150, 352, 50, 26, '◀', () => (this.tradePage = Math.max(0, this.tradePage - 1)), true, 12);
    const next = button(this, 290, 352, 50, 26, '▶', () => this.tradePage++, true, 12);
    w.add([page, ...prev.objects, ...next.objects]);
    const foot = txt(this, 0, 376, '', 13, COLORS.dim, { lineSpacing: 4 });
    w.add(foot);
    if (MINI_HUD) w.addHelp([foot]);

    // ฝั่งวางขาย
    w.add(txt(this, 460, 0, 'วางขาย: เลือกไอเทม', 15, COLORS.gold));
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
    const post = button(this, 640, 290, 220, 34, 'วางขาย', () => this.postListing(), true, 14);
    w.add(post.objects);
    const mineTitle = txt(this, 460, 316, 'ที่วางขายอยู่ (คลิก = ยกเลิก)', 13, COLORS.dim);
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
    const wallet = this.headerWallet(w);
    return this.register(w, () => {
      wallet();
      const list = rooms.listings(this.gs.room.id).filter((l) => l.seller !== localPlayerId()).sort((a, b) => (a.stall === this.tradeStall ? -1 : 0) - (b.stall === this.tradeStall ? -1 : 0));
      const pages = Math.max(1, Math.ceil(list.length / 8));
      this.tradePage = Math.min(this.tradePage, pages - 1);
      shown = list.slice(this.tradePage * 8, this.tradePage * 8 + 8);
      page.setText(`${this.tradePage + 1}/${pages}`);
      rows.forEach((r, i) => {
        const l = shown[i];
        [r.bg, r.name, ...r.btn.objects].forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(!!l));
        if (r.art.getData('want') !== (l?.item ?? null)) showItemIcon(r.icon, r.art, l?.item ?? null, 30, 32);
        if (!l) return;
        r.btn.hover.setVisible(false);
        r.name.setText(`${ITEMS[l.item].name} ×${l.qty}  ·  ผู้ขาย ${l.sellerName}${l.stall === this.tradeStall ? ' ★' : ''}`).setColor(RARITY[ITEMS[l.item].rarity ?? 'common'].color);
        r.btn.setLabel(`ซื้อ ${l.price + remoteFee(l.price, this.tradeRemote)}`);
      });
      foot.setText(`ภาษี ${Wallet.TAX * 100}% · เงินค่าขายส่งเข้าตู้จดหมายที่เกาะคุณ\n${this.tradeRemote ? '📦 ทางไกล: ซื้อ/วางขาย มีค่าส่ง 10% (ราคาที่ปุ่มรวมแล้ว)' : '🕊 เกาะกลาง = เขตปลอดภัย ห้ามต่อสู้'}`);
      const inv = this.gs.player.inventory;
      pick.forEach((v, i) => v.set(inv.slots[i] ?? null, i === this.sellIdx));
      const s = this.sellIdx !== null ? inv.slots[this.sellIdx] : null;
      sellInfo.setText(s ? `${s.plus ? `Lv.${s.plus + 1} ` : ''}${ITEMS[s.id].name} ×${this.sellQty}  ·  ราคา ${this.sellPrice} (ได้สุทธิ ${Math.floor(this.sellPrice * (1 - Wallet.TAX))})${this.tradeRemote ? ` · ค่าส่ง ${remoteFee(this.sellPrice, true)}` : ''}` : 'คลิกไอเทมด้านบนเพื่อวางขาย');
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
    const fee = remoteFee(l.price, this.tradeRemote);
    if (g.wallet.coins < l.price + fee) {
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
    if (fee) g.wallet.spend(Math.min(fee, g.wallet.coins)); // ค่าส่งทางไกล (หักฝั่งเรา)
    this.receiveListing(got);
    Sfx.play('pickup');
    EventBus.emit('trade');
    this.toast(`ซื้อ ${ITEMS[l.item].name} ×${l.qty} จาก ${l.sellerName}${fee ? ` · 📦 ค่าส่ง ${fee}` : ''}`, COLORS.good);
  }

  private async postListing() {
    const g = this.gs;
    const inv = g.player.inventory;
    const i = this.sellIdx;
    const s = i !== null ? inv.slots[i] : null;
    if (i === null || !s) return this.toast('เลือกไอเทมก่อน', COLORS.bad);
    if (this.tradeBusy) return;
    const fee = remoteFee(this.sellPrice, this.tradeRemote);
    if (g.wallet.coins < fee) return this.toast(`ค่าส่งทางไกล ${fee} เหรียญ — เหรียญไม่พอ`, COLORS.bad);
    const qty = Math.min(this.sellQty, s.qty);
    const taken = { ...s, qty: s.plus || s.dur !== undefined ? s.qty : qty };
    if (s.plus || s.dur !== undefined) inv.slots[i] = null;
    else inv.consumeAt(i, qty);
    inv.version++;
    this.sellIdx = null;
    this.tradeBusy = true;
    const r = await getRoomService().postListing(g.room.id, { seller: localPlayerId(), sellerName: g.playerName, item: s.id, qty, price: this.sellPrice, stall: this.tradeStall < 0 ? Phaser.Math.Between(0, 11) : this.tradeStall, plus: s.plus || undefined });
    this.tradeBusy = false;
    if ('error' in r) {
      // วางขายไม่สำเร็จ → คืนของ
      if (taken.plus || taken.dur !== undefined) g.spawnDrop(g.player.x, g.player.y, taken.id, taken.qty, taken);
      else g.collect(taken.id, taken.qty, g.player.x, g.player.y);
      Sfx.play('error');
      return this.toast(r.error, COLORS.bad);
    }
    if (fee) g.wallet.spend(Math.min(fee, g.wallet.coins)); // ค่าส่งทางไกล (ไม่คืนเมื่อยกเลิก)
    Sfx.play('place');
    EventBus.emit('trade');
    this.toast(`วางขาย ${ITEMS[s.id].name} ×${qty} ราคา ${this.sellPrice} เหรียญแล้ว${fee ? ` · 📦 ค่าส่ง ${fee}` : ''}`, COLORS.good);
  }

  // ---------- พ่อค้ากลาง (ซื้อ/ขาย/แลกเพชร) ----------
  private makeMarket() {
    const w = new UIWindow(this, 60, 40, 840, 480, '🛒 พ่อค้ากลาง');
    const buyHead = txt(this, 0, 0, '', 15, COLORS.good);
    const sellHead = txt(this, 410, 0, '', 15, COLORS.gold);
    w.add([buyHead, sellHead]);
    const rows: { o: Offer; side: 'buy' | 'sell'; bg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; art: Phaser.GameObjects.Image; name: Phaser.GameObjects.Text; btn: Button }[] = [];
    for (let i = 0; i < 8; i++) {
      for (const side of ['buy', 'sell'] as const) {
        const x = side === 'buy' ? 0 : 410;
        const y = 36 + i * 38;
        const bg = this.add.rectangle(x, y, 395, 34, 0x333c57, 0.45).setOrigin(0, 0.5);
        const icon = this.add.image(x + 18, y, 'px');
        const art = this.add.image(x + 18, y, 'px').setVisible(false);
        const name = txt(this, x + 38, y, '', 12).setOrigin(0, 0.5);
        const ref = { o: { item: 'wood', qty: 1, price: 1 } as Offer, side, bg, icon, art, name, btn: null as unknown as Button };
        ref.btn = button(this, x + 345, y, 92, 28, '', () => this.trade(ref.o, side), true, 12);
        rows.push(ref);
        w.add([bg, icon, art, name, ...ref.btn.objects]);
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
      if (this.marketRemote && CENTER_ONLY_GEM.has('box_legend')) return this.toast('กล่องเพชรมีขายเฉพาะที่เกาะกลาง', COLORS.bad);
      if (!this.gs.wallet.spend(0, LEGEND_BOX_GEMS)) return this.toast('เพชรไม่พอ', COLORS.bad);
      this.gs.collect('box_legend', 1, this.gs.player.x, this.gs.player.y);
      Sfx.play('levelUp');
    }, true, 13);
    w.add([...gemBuy.objects, ...gemSell.objects, ...goldBuy.objects, ...boxBuy.objects]);
    // 📦 ร้านค้าทางไกล: แถบแจ้ง + ปุ่มไปแผงผู้เล่น (แสดงเฉพาะตอนเปิดจากท่าส่งของ)
    // แถบมนสีน้ำเงินขอบฟ้า (ชุด UI เดียวกับ HUD) — ข้อความย่อให้พอดีแถบ
    const ribbon = this.add.graphics();
    ribbon.fillStyle(0x0b0d1f, 0.45).fillRoundedRect(2, 324, 600, 28, 10);
    ribbon.fillStyle(0x29366f, 0.95).fillRoundedRect(0, 322, 600, 28, 10).lineStyle(2, 0x41a6f6, 0.9).strokeRoundedRect(0, 322, 600, 28, 10);
    const ribbonTxt = txt(this, 12, 336, '', 13, COLORS.cream).setOrigin(0, 0.5);
    const stallsBtn = button(this, 712, 336, 180, 30, '⚖ แผงผู้เล่น (+10%)', () => {
      w.close();
      this.openTrade(-1);
    }, true, 12);
    w.add([ribbon, ribbonTxt, ...stallsBtn.objects]);
    const wallet = this.headerWallet(w);
    return this.register(w, () => {
      wallet();
      const m = this.gs.market;
      const remote = this.marketRemote;
      [ribbon, ribbonTxt, stallsBtn.bg, stallsBtn.t].forEach((o) => o.setVisible(remote));
      if (!remote) stallsBtn.hover.setVisible(false);
      else {
        const cs = centerState();
        ribbonTxt.setText(`📦 ทางไกล แพงกว่าเกาะกลาง · ${cs.open ? (cs.always ? 'เกาะกลางเปิดตลอด' : `เกาะกลางเปิดอยู่ (อีก ${fmtLeft(cs.msLeft)})`) : `เกาะกลางเปิด ${nextOpenText(undefined, 'center')}`}`);
        fitText(ribbonTxt, 576);
      }
      w.setTitle(remote ? '📦 ร้านค้าทางไกล' : '🛒 พ่อค้ากลาง');
      boxBuy.setLabel(remote ? 'กล่องเพชร: เฉพาะเกาะกลาง' : `ซื้อกล่องเพชร (${LEGEND_BOX_GEMS} เพชร)`);
      buyHead.setText(remote ? 'ซื้อ · ทางไกล +25%' : 'ซื้อ (จ่ายเหรียญ)');
      sellHead.setText(remote ? 'ขาย · ทางไกล −20%' : 'ขาย · ★ ราคาพิเศษวันนี้');
      const buy = m.offers('buy', remote);
      const sell = m.offers('sell', remote);
      let bi = 0;
      let si = 0;
      for (const r of rows) {
        const o = r.side === 'buy' ? buy[bi++] : sell[si++];
        [r.bg, r.name, r.btn.bg, r.btn.t].forEach((x) => x.setVisible(!!o));
        if (r.art.getData('want') !== (o?.item ?? null)) showItemIcon(r.icon, r.art, o?.item ?? null, 30, 32);
        if (!o) {
          r.btn.hover.setVisible(false);
          continue;
        }
        r.o = o;
        const have = r.side === 'sell' ? `  (มี ${this.gs.player.inventory.count(o.item)})` : '';
        r.name.setText(`${o.hot ? '★ ' : ''}${ITEMS[o.item].name} ×${o.qty}${have}`).setColor(o.hot ? COLORS.gold : COLORS.text);
        r.btn.setLabel(`${r.side === 'buy' ? 'ซื้อ' : 'ขาย'} ${o.price}`);
      }
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
    const w = new UIWindow(this, 160, 50, 640, 450, '⬆ อัพเกรด');
    w.add(txt(this, 0, 0, 'เลือกของ (ที่สวม + ในกระเป๋า)', 13, COLORS.gold));
    let idx: (number | EquipSlot)[] = [];
    const views = this.grid(w, 0, 24, 6, 30, 40, (i) => (this.enhSel = idx[i] ?? null));
    const big = this.add.image(440, 56, 'px').setScale(4);
    // ภาพวาดของชิ้นที่เลือก (ใช้แทนตัวพิกเซลในเกม) + กรอบสีตามช่วงเลเวล
    const bigArt = this.add.image(0, 0, 'px').setVisible(false);
    const bigFrame = this.add.rectangle(400, 16, 80, 72).setOrigin(0).setStrokeStyle(2, 0x566c86).setVisible(false);
    const BAND_TINTS: Record<string, number> = { iron: 0xc8d8ea, gold: 0xffe2a0, legend: 0xe6c8ff };
    const title = txt(this, 440, 92, '', 17).setOrigin(0.5, 0);
    const info = txt(this, 284, 120, '', 13, COLORS.text, { wordWrap: { width: 320 }, lineSpacing: 4 });
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
    w.add(txt(this, 0, 372, '• สำเร็จ 100% · ค่าสถานะ +15%/เลเวล · ความทนทาน +10%/เลเวล · อัพแล้วซ่อมเต็ม\n• Lv2–3 อัพได้ทุกที่ · Lv4+ ต้องมีทั่ง · Lv4/7/10 ต้องมีแปลนอัพเกรด (กล่องทอง/เพชร)', 12, COLORS.dim, { lineSpacing: 4, wordWrap: { width: 600 } }));
    const wallet = this.headerWallet(w);
    return this.register(w, () => {
      wallet();
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
        info.setText('เลือกของทางซ้าย\n\n• กดอัพเกรด = เลเวล +1 ทันที\n• โฉมใหม่ที่ Lv.4 เหล็ก · Lv.7 ทอง · Lv.10 ตำนาน');
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
    const w = new UIWindow(this, 200, 50, 560, 460, '👕 ตู้เสื้อผ้า');
    const portrait = new PortraitView(this, 80, 196, 2); // รูปเหมือนละเอียด (gfx/art/heroPortrait)
    w.add([drawAuraPreview(this, 80, 196, portrait.worldScale, () => auraOf(this.gs.player)), portrait.sprite]); // ออร่าตามอุปกรณ์/ชุด
    let seenTex = '';
    let seenVer = -1;
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
    w.add(txt(this, 0, 380, 'สีเทา = ยังไม่มี (สุ่มจากกล่อง) · ชุดไม่มีผลต่อพลัง', 13, COLORS.dim));
    return this.register(w, () => {
      const p = this.gs.player;
      if (seenTex !== p.texKey || seenVer !== p.inventory.version) {
        seenTex = p.texKey;
        seenVer = p.inventory.version;
        portrait.sync(p.look, p.equip);
      }
      const own = new Set(MetaSave.load().wardrobe);
      const unlockAll = ALL_ITEMS || new URLSearchParams(location.search).has('unlockall') || this.gs.showcase;
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
    const unlockAll = ALL_ITEMS || new URLSearchParams(location.search).has('unlockall') || this.gs.showcase;
    if (id && id !== 'none' && !unlockAll && !MetaSave.load().wardrobe.includes(`${slot}:${id}`)) {
      Sfx.play('error');
      return this.toast('ยังไม่มีชุดนี้ — หาได้จากกล่อง', COLORS.bad);
    }
    p.cosmetic[slot] = id;
    this.gs.equipFx.playCosmetic(slot, id, () => p.refreshLook()); // เอฟเฟกต์แปลงร่าง (fx/EquipFx)
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
    const w = new UIWindow(this, 40, 20, 880, 500, '🗺 แผนที่โลก');
    const viewW = 600;
    const viewH = 430;
    const maskG = this.make.graphics({}, false).fillRect(0, 0, viewW, viewH);
    const mask = maskG.createGeometryMask();
    // mask อยู่พิกัดจอ → ตามหน้าต่างทุกเฟรม (ลากย้าย/ขยายบนจอเล็กได้)
    const syncMask = () => {
      if (!w.visible) return;
      const k = w.scale;
      maskG.setScale(k).setPosition(w.root.x + w.body.x * k, w.root.y + w.body.y * k);
    };
    this.events.on('update', syncMask);
    this.events.once('shutdown', () => {
      this.events.off('update', syncMask);
      maskG.destroy();
    });
    this.mapImg = this.add.image(viewW / 2, viewH / 2, 'px').setMask(mask);
    this.mapGfx = this.add.graphics().setMask(mask);
    const holder = this.add.container(0, 0);
    holder.add([this.mapImg, this.mapGfx]);
    w.add(holder);
    const marks = new MapMarkers(this, this.gs, holder, mask, this.miniImg, MINI); // หมุดดันเจี้ยน/เกาะ + จุดหมาย (ui/MapMarkers.ts)
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
      if (marks.tap(t.tx, t.ty)) return;
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
    const side = txt(this, viewW + 16, 0, '', 13, COLORS.text, { wordWrap: { width: 228 }, lineSpacing: 4 });
    const zin = button(this, viewW + 60, 398, 80, 30, 'ซูม +', () => (this.mapScale = Math.min(6, this.mapScale * 1.4)), true, 13);
    const zout = button(this, viewW + 160, 398, 80, 30, 'ซูม −', () => (this.mapScale = Math.max(0.5, this.mapScale / 1.4)), true, 13);
    const center = button(this, viewW + 110, 434, 200, 30, 'กลับหาตัวเรา', () => holder.setPosition(0, 0), true, 13);
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
        if (is.index === SPECIAL_SLOT) t.setText(sp.open ? `✨ ${SPECIAL_NAME} (${sp.always ? 'เปิดตลอด' : `เปิด ${fmtLeft(sp.msLeft)}`})` : `🔒 ${SPECIAL_NAME} (เปิดอีก ${fmtLeft(sp.msLeft)})`).setColor(sp.open ? COLORS.gold : '#a77bdb');
      }
      // วงพายุ/แสงรอบเกาะพิเศษ + เส้นนำทางเมื่อเปิด
      const sis = world.slots[SPECIAL_SLOT];
      if (sis) {
        const c = toMap(sis.cx, sis.cy);
        const rr = ((sis.r + 12) / 2) * fit;
        gfx.lineStyle(2, sp.open ? 0xffcd75 : 0xa77bdb, 0.9).strokeCircle(c.x, c.y, rr);
        if (sp.open && !sp.always) {
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
      marks.drawBig(gfx, toMap, fit);
      const pm = toMap(g.player.x / 16, g.player.y / 16);
      for (const d of presence.dots()) gfx.fillStyle(d.adv ? 0xef7d57 : 0x73eff7, 1).fillCircle(toMap(d.x / 16, d.y / 16).x, toMap(d.x / 16, d.y / 16).y, 3.5); // ผู้เล่นคนอื่น (live)
      gfx.fillStyle(0xff3355, 1).fillCircle(pm.x, pm.y, 4).lineStyle(2, 0xffffff).strokeCircle(pm.x, pm.y, 5);
      const players = g.room.players.length;
      const info: string[] = [];
      if (pick) {
        const dist = Math.round(Math.hypot(pick.cx - g.player.x / 16, pick.cy - g.player.y / 16));
        const b = BIOMES[pick.biome];
        info.push(`▶ ${pick.name}`, `${b.name} · แร่เด่น: ${SPECIALTY_NAMES[pick.specialty]}`, `ระยะทาง ~${dist} ช่อง (ต้องใช้เรือ)`, '');
      }
      const spLine = sp.always ? [`✨ ${SPECIAL_NAME}: เปิดตลอด (ใต้สุดของแผนที่)`] : sp.open ? [`✨ ${SPECIAL_NAME}: เปิดอยู่ เหลือ ${fmtLeft(sp.msLeft)}`, 'ตามเส้นประสีทองไปได้เลย (ใต้สุดของแผนที่)'] : [`🔒 ${SPECIAL_NAME}: เปิดอีก ${fmtLeft(sp.msLeft)}`, `(เปิดวันละ 2 รอบ รอบละ 60 นาที · รอบหน้า ${nextOpenText()})`];
      side.setText([
        ...info, ...spLine, '',
        `ผู้รอดชีวิต ${players} คน`,
        '★ เกาะคุณ · ⚖ เกาะกลาง',
        '● แดง = คุณ · ■ เหลือง = กล่องร่ม',
        '● ฟ้า = ผู้เล่นออนไลน์ใกล้ๆ',
        'เทา = ยังไม่เคยไป · ข้ามทะเลใช้เรือ',
        'แตะเกาะ = ดู · ลาก = เลื่อน · ล้อ = ซูม',
      ].join('\n'));
    });
  }

  // ---------- งานอัตโนมัติ (ใช้ได้เฉพาะบนเกาะตัวเอง) ----------
  private autoAmount = 20;

  private toggleAuto() {
    this.autoWin.toggle();
  }

  private makeAuto() {
    const w = new UIWindow(this, W / 2 - 250, 26, 500, 488, '🤖 งานอัตโนมัติ');
    w.add(txt(this, 0, 0, 'ตัวละครทำเอง · เฉพาะบนเกาะคุณ · ครบแล้วหยุดเอง', 13, COLORS.dim));
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
    const status = txt(this, 0, qy + 80, '', 13, COLORS.text, { wordWrap: { width: 468 }, lineSpacing: 4 });
    w.add([...quest.objects, ...stop.objects, status]);
    return this.register(w, () => {
      const au = this.gs.auto;
      amtBtns.forEach(({ n, b }) => b.hover.setVisible(n === this.autoAmount));
      const qt = au.questTask();
      quest.setLabel(qt ? `📜 ทำภารกิจ: ${qt.label}${qt.goal ? ` ×${qt.goal}` : ''}` : '📜 ภารกิจนี้ต้องทำเอง');
      const here = this.gs.world.islandAt(Math.floor(this.gs.player.x / 16), Math.floor(this.gs.player.y / 16));
      const onHome = (here === this.gs.world.home || here >= 1000) && !this.gs.boatRiding;
      status.setText([
        au.active ? `กำลังทำ: ${au.status}` : 'ยังไม่ได้สั่งงาน — เลือกงานด้านบน',
        onHome ? '✔ อยู่บนเกาะคุณ ใช้งานได้' : '✘ อยู่นอกเกาะ — งานพักจนกว่าจะกลับ',
        '• เจอมอนจะสู้ป้องกันตัวก่อน · HP ต่ำใช้ยาเอง',
      ].join('\n')).setColor(onHome ? COLORS.text : COLORS.bad);
    });
  }

  // ---------- เมนูหยุด / ตั้งค่า ----------
  private makePause() {
    // ตัวอย่างดีไซน์ใหม่ (เรียบแบบเกมพิกเซลยุค 90): หน้าต่าง + ปุ่มกล่องพิกเซล
    const w = new UIWindow(this, W / 2 - 230, 26, 460, 492, 'เมนู', 10, true);
    const button = (_s: Phaser.Scene, x: number, y: number, bw: number, bh: number, label: string, fn: () => void, _e?: boolean, _z?: number) => retroButton(this, x, y, bw, bh, label, fn, label === 'เล่นต่อ' ? 'primary' : 'normal');
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
    const intro = button(this, 120, 284, 220, 32, 'ดูเนื้อเรื่อง', () => this.showIntro(0), true, 13);
    const quit = button(this, 340, 284, 190, 32, 'บันทึก & ออก', () => this.gs.saveAndQuit(), true, 13);
    // คุณภาพภาพ (วนค่า) + เต็มจอ
    const qual = button(this, 120, 324, 220, 32, '', () => {
      const i = QUALITY_PREFS.findIndex((q) => q.id === qualityPref());
      setQualityPref(QUALITY_PREFS[(i + 1) % QUALITY_PREFS.length].id);
      this.toast(`คุณภาพภาพ: ${QUALITY_PREFS.find((q) => q.id === qualityPref())!.label} (${qualityName()})`, COLORS.gold);
    }, true, 13);
    const full = button(this, 340, 324, 190, 32, '', () => this.scale.toggleFullscreen(), true, 13);
    // คู่มือ/ตู้เสื้อผ้า (จอเล็กไม่มีบนแถบเครื่องมือ)
    // HUD เบา: คู่มืออยู่ในแท็บ "คลังข้อมูล" แล้ว → ช่องนี้เป็นปุ่มจัดตำแหน่งปุ่มสัมผัส
    const bookB = MINI_HUD
      ? button(this, 120, 364, 220, 32, 'จัดตำแหน่งปุ่ม', () => (w.close(), this.openTouchEditor()), true, 13)
      : button(this, 120, 364, 220, 32, 'คู่มือไอเทม', () => (w.close(), this.infoWin.open()), true, 13);
    const shirtB = button(this, 340, 364, 190, 32, 'ตู้เสื้อผ้า', () => (w.close(), this.wardrobeWin.open()), true, 13);
    w.add([...qual.objects, ...full.objects, ...bookB.objects, ...shirtB.objects]);
    // เดินด้วยเมาส์ (กดค้าง/คลิกพื้น — systems/MouseMove) เปิด/ปิด
    const mouseB = button(this, 214, 402, 330, 28, '', () => setSettings({ mouseMove: !getSettings().mouseMove }), true, 13);
    w.add(mouseB.objects);
    const help = txt(this, 0, 424, 'WASD เดิน · Shift วิ่ง · Space หลบ · คลิก ตี/วาง · E ใช้ · F กิน/สวม\nQ สกิล · B แปลน · X รื้อ · Tab กระเป๋า · J คู่มือ · M แผนที่ · N เสียง', 12, COLORS.dim, { lineSpacing: 4 });
    // ปุ่มลัดซ่อนไว้หลังปุ่ม "?" (ไม่รกหน้าต่าง)
    if (MINI_HUD) w.addHelp([help]);
    w.add([...resume.objects, ...sound.objects, vol, ...vm.objects, ...vp.objects, tilt, ...tm.objects, ...tp.objects, zoom, ...zm.objects, ...zp.objects, ...intro.objects, ...quit.objects, ...ctrl.objects, help]);
    return this.register(w, () => {
      ctrl.setLabel(`ควบคุม: ${controlLabel()}`);
      sound.setLabel(Sfx.settings.muted ? 'เสียง: ปิด' : 'เสียง: เปิด');
      vol.setText(`ระดับเสียง ${Math.round(Sfx.settings.master * 100)}%`);
      tilt.setText(`มุมกล้อง 2.5D: ${this.gs.tilt > 0 ? Math.round(this.gs.tilt * 100) + '%' : 'ปิด'}`);
      zoom.setText(`ซูม ${this.gs.zoom.toFixed(1)}×`);
      qual.setLabel(`คุณภาพ: ${QUALITY_PREFS.find((q) => q.id === qualityPref())!.label}${qualityPref() === 'auto' ? ` (${qualityName()})` : ''}`);
      full.setLabel(this.scale.isFullscreen ? 'ออกจากเต็มจอ' : 'เต็มจอ');
      mouseB.setLabel(`เดินด้วยเมาส์: ${getSettings().mouseMove ? 'เปิด' : 'ปิด'}`);
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
    // จางเข้านุ่มๆ (ซีนที่ทำเอฟเฟกต์เข้าเองตั้ง alpha ไว้แล้ว — ไม่ทับ)
    if (c.alpha === 1) popIn(this, c, 160);
  }

  private showBox(tier: BoxTier, loot: { item: string; qty: number; rarity: Rarity }[]) {
    // 🎁 หน้าจอเปิดกล่องแบบลุ้น (fx/RewardFx.ts) — ลุ้น → ระเบิดแสง → การ์ดบินออกแล้วพลิกทีละใบ (ของดีสุดท้ายสุด)
    this.openModal((c, close) => this.rewardFx.boxOpen(c, tier, loot, close));
  }

  private showDeath(cause: string, lost: number, items: number, lv0 = 1, lv1 = 1) {
    this.openModal((c, close) => {
      c.add(panel(this, W / 2 - 240, 100, 480, 320));
      c.add(heading(this, W / 2, 118, '💫 คุณหมดสติ…', 34).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 174, `💀 เลเวล  Lv.${lv0} → Lv.${lv1}${lv1 <= 1 ? '   ⚠ ตายอีก = ตายถาวร!' : ''}`, 18, COLORS.bad).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 210, [
        `สาเหตุ: ${cause}`,
        `• เสียเหรียญ ${lost.toLocaleString()}`,
        `• ของในกระเป๋า ${items} ช่อง ตกเป็นถุงที่จุดล้ม (กด E เก็บคืน)`,
      ].join('\n'), 15, COLORS.text, { align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 312, '⚔ ตายในเขตผจญภัย (เกาะอื่น) = ตายถาวรทันที', 14, '#ef7d57').setOrigin(0.5, 0));
      c.add(button(this, W / 2, 370, 220, 44, '🏠 ฟื้นที่บ้าน', close, true, 16).objects);
    });
  }

  /** ตายถาวร — เลเวลหมด เกาะหายไปจากแผนที่ */
  /** ตาย Lv.1 → ซื้อชีวิตด้วยเหรียญ/เพชร หรือยอมแพ้ (ตายถาวร) */
  private showRevive(r: ReviveOffer) {
    this.openModal((c, close) => {
      const art = coverImage(this, 'death', W, H);
      if (art) c.add(art.setAlpha(0.85));
      c.add(this.add.rectangle(0, 0, W, H, 0x2a0710, 0.55).setOrigin(0));
      c.add(panel(this, W / 2 - 270, 70, 540, 390));
      c.add(heading(this, W / 2, 88, '💀 เลเวลหมด!', 38).setOrigin(0.5, 0).setColor('#ef7d57'));
      c.add(txt(this, W / 2, 142, `สาเหตุ: ${r.cause}`, 14, COLORS.dim).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 168, 'ซื้อชีวิตเพื่อเกิดใหม่ — ไม่งั้น "ตายถาวร" เริ่มใหม่ทั้งหมด', 16, COLORS.text).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 198, `ซื้อแล้ว ${r.times} ครั้ง (ครั้งหน้าแพงขึ้น) · มี 💰 ${r.haveCoins.toLocaleString()} · 💎 ${r.haveGems}`, 14, COLORS.dim).setOrigin(0.5, 0));
      const pay = (kind: 'coins' | 'gems') => {
        if (!this.gs.buyRevive(kind)) return;
        close();
      };
      const bc = button(this, W / 2 - 128, 268, 236, 64, '', () => r.canCoins && pay('coins'), r.canCoins, 15);
      bc.setLabel(`💰 ${r.coins.toLocaleString()} เหรียญ${r.canCoins ? '' : '\n(ไม่พอ)'}`);
      const bg = button(this, W / 2 + 128, 268, 236, 64, '', () => r.canGems && pay('gems'), r.canGems, 15);
      bg.setLabel(`💎 ${r.gems} เพชร${r.canGems ? '' : '\n(ไม่พอ)'}`);
      c.add([...bc.objects, ...bg.objects]);
      c.add(txt(this, W / 2, 316, 'เกิดใหม่ที่บ้าน Lv.1 · ของในกระเป๋าตกเป็นถุง · อุปกรณ์ที่สวมยังอยู่', 14, COLORS.dim).setOrigin(0.5, 0));
      c.add(button(this, W / 2, 396, 260, 40, 'ยอมแพ้ (ตายถาวร)', () => {
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
      c.add(panel(this, W / 2 - 280, 90, 560, 350));
      c.add(heading(this, W / 2, 106, '⚔ เขตผจญภัย', 36).setOrigin(0.5, 0).setColor('#ef7d57'));
      if (name) c.add(txt(this, W / 2, 154, name, 14, COLORS.dim).setOrigin(0.5, 0));
      c.add(txt(this, W / 2 - 240, 182, [
        '⚔ ผู้เล่นอื่นโจมตีคุณได้ (PvP)',
        PAID_RESPAWN ? `💀 ตาย = เกิดใหม่ที่บ้านทันที (ค่าเกิดใหม่ 💰 ${respawnFee(this.gs.player.level).toLocaleString()}) · ของติดตัวอยู่ครบ` : '💀 ตายที่นี่ = เริ่มใหม่ทั้งหมด (ซื้อชีวิตไม่ได้)',
        '🎁 ของดรอปดีกว่ามาก: กล่องทอง/เพชร แปลนหายาก',
        '🏠 เกาะของคุณปลอดภัยกว่า แต่ได้แค่กล่องไม้',
      ].join('\n'), 16, COLORS.text, { lineSpacing: 10 }).setOrigin(0, 0));
      c.add(button(this, W / 2 - 110, 392, 200, 46, '✔ ไปต่อ', () => {
        MetaSave.markAdventureSeen();
        close();
      }, true, 16).objects);
      c.add(button(this, W / 2 + 110, 392, 200, 46, '↩ ถอยกลับ', () => {
        close();
        this.gs.retreatFromAdventure();
      }, true, 15).objects);
    });
  }

  /** เข้าเขตผจญภัย (ครั้งถัดๆ ไป): แถบเตือนสั้นๆ กลางจอ */
  private adventureFlash(name: string) {
    const t = txt(this, W / 2, H / 2 - 30, `⚔ เข้าเขตผจญภัย${name ? ` · ${name}` : ''} — PvP · ${PAID_RESPAWN ? 'ตาย = จ่ายเงินเกิดใหม่ที่บ้าน' : 'ตายที่นี่ = เริ่มใหม่'}`, 16, '#ffffff')
      .setOrigin(0.5).setBackgroundColor('#b13e53dd').setPadding(12, 6, 12, 6).setDepth(9).setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 250, yoyo: true, hold: 1800, onComplete: () => t.destroy() });
    Sfx.play('horn', 600);
  }

  private showGameOver(r: GameOverInfo) {
    this.openModal((c) => {
      const art = coverImage(this, 'death', W, H);
      if (art) c.add(art.setAlpha(0.85).setTint(0xb0a0c0));
      c.add(this.add.rectangle(0, 0, W, H, 0x2a0710, 0.6).setOrigin(0));
      c.add(panel(this, W / 2 - 260, 80, 520, 360));
      c.add(heading(this, W / 2, 98, '💀 ตายถาวร', 42).setOrigin(0.5, 0).setColor('#ef7d57'));
      const why = r.adventure ? '⚔ ตายในเขตผจญภัย = ตายถาวรทันที'
        : r.broke ? `เงินไม่พอซื้อชีวิต (ต้องใช้ 💰 ${r.cost.coins.toLocaleString()} หรือ 💎 ${r.cost.gems})` : 'ยอมแพ้ — เกาะของคุณหายไปจากแผนที่';
      c.add(txt(this, W / 2, 160, why, 16, COLORS.bad, { wordWrap: { width: 480 }, align: 'center' }).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 200, 'เกาะ อุปกรณ์ และของทั้งหมดหายไป\nเริ่มใหม่ — สุ่มลงเกาะใหม่บนแผนที่โลก', 15, COLORS.text, { align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
      c.add(txt(this, W / 2, 266, `สาเหตุ: ${r.cause}\nรอด ${r.days} วัน · ฆ่ามอน ${r.kills} ตัว · พลังสูงสุด ${r.power.toLocaleString()}`, 15, COLORS.gold, { align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
      const go = (scene: string, data?: object) => {
        this.modal?.destroy();
        this.modal = null;
        this.scene.stop('GameScene');
        this.scene.start(scene, data);
      };
      c.add(button(this, W / 2 - 110, 384, 200, 44, '🔄 เริ่มใหม่', () => go('CharacterSelectScene', { play: true }), true, 15).objects);
      c.add(button(this, W / 2 + 110, 384, 200, 44, '🏠 หน้าแรก', () => go('TitleScene'), true, 15).objects);
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
      c.add(heading(this, W / 2, H - 204, s.title, 36).setOrigin(0.5));
      c.add(txt(this, W / 2, H - 134, s.text, 17, COLORS.text, { align: 'center', lineSpacing: 10, wordWrap: { width: 720 } }).setOrigin(0.5).setStroke('#0b0d1f', 4));
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
    // HUD เบา: การ์ดเล็กแบบ toast (กว้าง 260 · ตัวเล็ก) ใต้หัวใจ/แถบค่า ไม่ทับ · หายเองใน ~8 วิ
    const mini = MINI_HUD;
    const w = mini ? 260 : 320;
    const lh = mini ? 17 : 22;
    const top = mini ? 26 : 34;
    const h = top + lines.length * lh + (mini ? 8 : 10);
    const x = M;
    // ใต้แผงสถานะ (จอเล็กแผงสถานะขยาย → เลื่อนลงตาม)
    const y = mini ? Math.round(58 * this.k) : Math.max(150, this.statusBottom + 6);
    const c = this.add.container(x, y).setDepth(4); // ใต้หน้าต่าง (depth 10) ไม่ทับกระเป๋า/สมุดแปลน
    if (mini) {
      c.setScale(this.k);
      c.add(retroPanel(this, 0, 0, w, h, { alpha: 0.9 }));
      c.add(retroLabel(this, 10, 6, title, RETRO.css.gold, 15));
      lines.forEach((l, i) => c.add(fitText(txt(this, 10, top + i * lh, l, 12, RETRO.css.text), w - 20)));
    } else {
      const bg = this.add.graphics();
      bg.fillStyle(0x0b0d1f, 0.88).fillRoundedRect(0, 0, w, h, 10);
      bg.lineStyle(2, 0xffcd75, 0.9).strokeRoundedRect(0, 0, w, h, 10);
      c.add(bg);
      c.add(txt(this, 12, 8, title, 15, COLORS.gold));
      lines.forEach((l, i) => c.add(fitText(txt(this, 12, 34 + i * 22, l, 14, COLORS.text), w - 24)));
    }
    const x1 = mini
      ? retroLabel(this, w - 8, 4, 'x', RETRO.css.muted).setOrigin(1, 0).setPadding(6, 2, 6, 2).setInteractive({ useHandCursor: true })
      : txt(this, w - 10, 6, '✕', 15, COLORS.dim).setOrigin(1, 0).setPadding(6, 2, 6, 2).setInteractive({ useHandCursor: true });
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
    this.time.delayedCall(MINI_HUD ? 8000 : 16000, close);
  }

  private afterIntro() {
    if (!this.gs.starterPicked) this.time.delayedCall(250, () => this.showStarter());
  }

  /** เกมใหม่: เลือกแปลนเริ่มต้น ฐานที่มั่น 1 + อาวุธ 1 (เป้าหมายแรกให้ออกไปหาวัตถุดิบ)
   *  หน้าตาแบบ "การ์ดเกมสะสม": การ์ดฐาน (กรอบทอง) / อาวุธ (กรอบเงิน) เรียงพัด แจกคว่ำแล้วพลิกเปิด */
  private starterPitch(kind: 'base' | 'weapon', id: string) {
    return (kind === 'base' ? STARTER_BASES : STARTER_WEAPONS).find((s) => s.id === id)?.pitch ?? '';
  }

  private starterName(kind: 'base' | 'weapon', id: string) {
    return kind === 'base' ? BUILD[id].name : ITEMS[id].name;
  }

  /** ยืนยันแปลน: เซ็ตของให้ผู้เล่น + ปิดหน้าต่าง + แจ้งเตือน (ใช้ร่วมทั้งสองแบบ) */
  private starterCommit(pick: { base: string | null; weapon: string | null }, close: () => void) {
    if (!pick.base || !pick.weapon) return;
    const bName = BUILD[pick.base].name;
    const wName = ITEMS[pick.weapon].name;
    this.gs.pickStarter(pick.base, pick.weapon);
    close();
    this.banner(`ได้ ${wName} + ${bName}ฟรี!`, `กด B → สิ่งก่อสร้าง → ${bName} → สร้างเลย (ฟรี 1 หลัง)`, '#a7f070');
  }

  /** ใส่ภาพไอเทม/บ้านแบบครอบเต็มกรอบ ลงใน container (มีไอคอนพิกเซลเป็นภาพสำรองระหว่างโหลด) */
  private starterArt(box: Phaser.GameObjects.Container, kind: 'base' | 'weapon', id: string, x: number, y: number, w: number, h: number, focusY = 0.32) {
    const texKey = kind === 'base' ? BUILD[id].texture : ITEMS[id].icon;
    const fb = this.add.image(x + w / 2, y + h / 2, texKey);
    fb.setScale(Math.min((w * 0.7) / fb.width, (h * 0.8) / fb.height, 4));
    box.add(fb);
    withItemArt(this, id, (k) => {
      if (!fb.scene) return;
      box.addAt(placeArtCover(this.add.image(0, 0, k), x, y, w, h, focusY), box.getIndex(fb));
      fb.setVisible(false);
    });
  }

  /** ค่าสั้นๆ ของแปลน (แถบพลัง/ชิปบนการ์ด) — v = สัดส่วน 0..1 */
  private starterStats(kind: 'base' | 'weapon', id: string): { icon: string; label: string; v: number; text: string }[] {
    if (kind === 'base') {
      const b = BUILD[id];
      return [
        { icon: '❤', label: 'ทนทาน', v: b.hp / 1300, text: String(b.hp) },
        { icon: '📦', label: 'เก็บของ', v: (b.storage ?? 0) / 32, text: String(b.storage ?? 0) },
        { icon: '🔥', label: 'อบอุ่น', v: (b.warmth ?? 0) / 40, text: String(b.warmth ?? 0) },
      ];
    }
    const it = ITEMS[id];
    const dmg = it.tool?.damage ?? it.ranged?.damage ?? 0;
    const reach = it.tool?.range ?? 0;
    return [
      { icon: '⚔', label: 'พลัง', v: dmg / 34, text: String(dmg) },
      { icon: '🎯', label: 'ระยะ', v: it.ranged ? (id === 'long_bow' ? 1 : 0.85) : Math.min(1, reach / 40), text: it.ranged ? 'ไกล' : reach >= 26 ? 'กลาง' : 'ใกล้' },
    ];
  }

  /** ประกายดาวกระจายจากจุดหนึ่ง (เลือกของ/สุ่มเสร็จ) */
  private starterBurst(c: Phaser.GameObjects.Container, x: number, y: number, n = 7, color = '#fff2b0', spread = 42) {
    for (let i = 0; i < n; i++) {
      const s = txt(this, x, y, '✦', 9 + Math.random() * 5, color).setOrigin(0.5).setAlpha(0);
      c.add(s);
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = spread * (0.55 + Math.random() * 0.5);
      this.tweens.add({ targets: s, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: { from: 1, to: 0 }, scale: { from: 1.2, to: 0.3 }, duration: 480 + Math.random() * 260, ease: 'Cubic.easeOut', onComplete: () => s.destroy() });
    }
  }

  /** ปุ่มเกมหนามีมิติของหน้าเลือกแปลน (ขอบเข้ม + ฐานเงา + ไฮไลต์บน · ชี้ = สว่าง · กด = ยุบลง) */
  private starterBtn(x: number, y: number, w: number, h: number, label: string, theme: 'gold' | 'magic', onClick: () => void, primary = false) {
    const T = {
      gold: { light: 0xffe08a, mid: 0xf0a84a, dark: 0x9a4f24, trim: 0xfff2b0, ink: '#3a2410', glow: 0xffcd75 },
      magic: { light: 0xdcc4fb, mid: 0xa77bdb, dark: 0x4a2a70, trim: 0xf3e8ff, ink: '#2a1640', glow: 0xc08cff },
    }[theme];
    const box = this.add.container(x, y);
    const glow = this.add.image(0, 2, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(T.glow).setScale((w / 64) * 1.5, (h / 64) * 1.9).setAlpha(primary ? 0.45 : 0);
    const g = this.add.graphics();
    const t = txt(this, 0, -2, label, 13, T.ink, { fontStyle: '600' }).setOrigin(0.5);
    t.setShadow(0, 1, '#ffffff', 0, false, true).setAlpha(0.95);
    const draw = (st: 'idle' | 'hover' | 'down') => {
      const dy = st === 'down' ? 3 : 0;
      const lip = 5 - dy;
      g.clear();
      g.fillStyle(0x140c1e, 1).fillRoundedRect(-w / 2 - 2, -h / 2 - 2 + dy, w + 4, h + lip + 4, 10);
      g.fillStyle(T.dark, 1).fillRoundedRect(-w / 2, -h / 2 + dy + lip, w, h, 8);
      g.fillStyle(st === 'hover' ? T.light : T.mid, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h, 8);
      g.fillStyle(st === 'hover' ? 0xffffff : T.light, st === 'hover' ? 0.35 : 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h * 0.46, { tl: 8, tr: 8, bl: 0, br: 0 });
      g.fillStyle(0xffffff, 0.45).fillRect(-w / 2 + 9, -h / 2 + dy + 3, w - 18, 2);
      g.lineStyle(1.5, T.trim, 0.9).strokeRoundedRect(-w / 2 + 1, -h / 2 + dy + 1, w - 2, h - 2, 7);
      t.setY(-2 + dy);
    };
    draw('idle');
    const hit = this.add.zone(0, 0, w + 4, h + 8).setInteractive({ useHandCursor: true });
    let pressed = false;
    hit.on('pointerover', () => draw('hover'));
    hit.on('pointerout', () => { pressed = false; draw('idle'); });
    hit.on('pointerdown', () => { pressed = true; Sfx.unlock(); Sfx.play('click'); draw('down'); });
    hit.on('pointerup', () => { if (!pressed) return; pressed = false; draw('hover'); onClick(); });
    box.add([glow, g, t, hit]);
    if (primary) this.tweens.add({ targets: glow, alpha: { from: 0.3, to: 0.75 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return {
      box, hit,
      setLabel: (s: string) => fitText(t.setText(s).setScale(1), w - 16),
      shake: () => this.tweens.add({ targets: box, x: x + 5, duration: 50, yoyo: true, repeat: 3, onComplete: () => box.setX(x) }),
    };
  }

  private showStarter() {
    if (this.gs.starterPicked) return;
    this.openModal((c, close) => {
      const art = coverImage(this, 'intro_5', W, H);
      if (art) c.add(art.setAlpha(0.32));
      c.add(this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.5).setOrigin(0));
      this.starterPickD(c, close);
    });
  }

  /**
   * หน้าเลือกแปลน — การ์ดเกมสะสม: ฐาน (กรอบทอง) / อาวุธ (กรอบเงิน) เรียงเป็นพัด · แจกการ์ดคว่ำแล้วพลิกเปิด
   * ชี้ = ยกขึ้น · เลือก = พลิก + เรืองทอง ลอยเด่น · สุ่ม = คว่ำ สับ แล้วพลิกเปิดใบที่ได้
   */
  private starterPickD(c: Phaser.GameObjects.Container, close: () => void) {
    type Kind = 'base' | 'weapon';
    const pick: Record<Kind, string | null> = { base: null, weapon: null };
    let busy = true;
    const lists: Record<Kind, StarterPick[]> = { base: STARTER_BASES, weapon: STARTER_WEAPONS };
    const CW = 104, CH = 146;
    const TRIM: Record<Kind, { edge: number; band: number; light: number; ribbon: number; back: number; css: string }> = {
      base: { edge: 0x8a5a35, band: 0xffcd75, light: 0xfff2b0, ribbon: 0x5a3418, back: 0x29366f, css: '#ffcd75' },
      weapon: { edge: 0x333c57, band: 0xc0cfdb, light: 0xf4f4f4, ribbon: 0x333c57, back: 0x3a2346, css: '#d6e4ee' },
    };
    const fanC: Record<Kind, { x: number; y: number }> = { base: { x: 250, y: 236 }, weapon: { x: 710, y: 236 } };

    // พื้นมืดลงอีก + แสงกลางโต๊ะ ให้การ์ดเด่น ไม่ตาลาย
    c.add(this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.45).setOrigin(0));
    c.add(this.add.image(W / 2, 250, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0x3b5dc9).setScale(14, 6).setAlpha(0.35));
    c.add(heading(this, W / 2, 12, '🗺 เลือกแปลนเริ่มต้น', 22).setOrigin(0.5, 0));
    c.add(txt(this, W / 2, 44, 'เลือกการ์ดฐาน 1 ใบ + การ์ดอาวุธ 1 ใบ — 🏠 สร้างฐานฟรี · ⚔ อาวุธถือในมือทันที', 11, '#c9d3dc').setOrigin(0.5, 0).setStroke('#0b0d1f', 3));
    (['base', 'weapon'] as Kind[]).forEach((kind) => {
      c.add(txt(this, fanC[kind].x, 86, kind === 'base' ? '🏠 การ์ดฐานที่มั่น' : '⚔ การ์ดอาวุธ', 12, TRIM[kind].css).setOrigin(0.5).setStroke('#0b0d1f', 3));
    });
    // เหรียญ + ตรงกลาง
    const medal = this.add.graphics();
    medal.fillStyle(0x5a3418, 1).fillCircle(480, 236, 17).fillStyle(0xffcd75, 1).fillCircle(480, 236, 14).fillStyle(0x8a5a35, 1).fillCircle(480, 236, 10);
    c.add([medal, txt(this, 480, 235, '+', 14, '#fff2b0', { fontStyle: '600' }).setOrigin(0.5)]);

    type Card = { id: string; kind: Kind; box: Phaser.GameObjects.Container; front: Phaser.GameObjects.Container; back: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Image; home: { x: number; y: number; a: number }; up: boolean };
    const cards: Record<Kind, Card[]> = { base: [], weapon: [] };
    const layer: Record<Kind, Phaser.GameObjects.Container> = { base: this.add.container(0, 0), weapon: this.add.container(0, 0) };
    c.add([layer.base, layer.weapon]);

    const frameG = (kind: Kind) => {
      const t = TRIM[kind];
      const g = this.add.graphics();
      g.fillStyle(t.edge, 1).fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 9);
      g.fillStyle(t.band, 1).fillRoundedRect(-CW / 2 + 2, -CH / 2 + 2, CW - 4, CH - 4, 8);
      g.fillStyle(t.edge, 1).fillRoundedRect(-CW / 2 + 5, -CH / 2 + 5, CW - 10, CH - 10, 6);
      // อัญมณีมุม
      for (const [x, y] of [[-CW / 2 + 5, -CH / 2 + 5], [CW / 2 - 5, -CH / 2 + 5], [-CW / 2 + 5, CH / 2 - 5], [CW / 2 - 5, CH / 2 - 5]]) {
        g.fillStyle(t.light, 1).fillPoints([new Phaser.Geom.Point(x, y - 4), new Phaser.Geom.Point(x + 4, y), new Phaser.Geom.Point(x, y + 4), new Phaser.Geom.Point(x - 4, y)], true);
      }
      return g;
    };
    const makeCard = (kind: Kind, o: StarterPick, i: number): Card => {
      const t = TRIM[kind];
      const box = this.add.container(480, 620);
      const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffcd75).setScale(3.4, 4.4).setAlpha(0);
      // หน้า
      const front = this.add.container(0, 0);
      const fg = frameG(kind);
      fg.fillStyle(0x15161f, 1).fillRoundedRect(-CW / 2 + 7, -CH / 2 + 7, CW - 14, CH - 14, 5);
      front.add(fg);
      this.starterArt(front, kind, o.id, -CW / 2 + 9, -CH / 2 + 9, CW - 18, 64, 0.3);
      front.add(this.add.graphics().lineStyle(1, t.band, 0.8).strokeRect(-CW / 2 + 9, -CH / 2 + 9, CW - 18, 64));
      // ริบบิ้นชื่อ
      const rib = this.add.graphics();
      const ry = -CH / 2 + 76;
      rib.fillStyle(t.ribbon, 1).fillRect(-CW / 2 + 4, ry, CW - 8, 17);
      rib.fillStyle(t.band, 1).fillRect(-CW / 2 + 4, ry, CW - 8, 1).fillRect(-CW / 2 + 4, ry + 16, CW - 8, 1);
      front.add(rib);
      front.add(fitText(txt(this, 0, ry + 8, this.starterName(kind, o.id), 11, '#fff2d0').setOrigin(0.5), CW - 16));
      // ชิปค่าสั้นๆ
      const chips = this.starterStats(kind, o.id).map((s) => `${s.icon}${s.text}`);
      if (kind === 'weapon') {
        const it = ITEMS[o.id];
        chips.push(o.bonus?.length ? '+ทั่ง' : it.ranged?.pierce ? 'ทะลุ' : 'ไม่ใช้ทั่ง');
      }
      chips.forEach((s, j) => {
        const col = j % 2, rowN = Math.floor(j / 2);
        const cx = -CW / 2 + 10 + col * 43, cy = ry + 22 + rowN * 17;
        front.add(this.add.rectangle(cx, cy, 41, 14, 0x0b0d1f, 0.7).setOrigin(0).setStrokeStyle(1, t.band, 0.5));
        front.add(fitText(txt(this, cx + 20.5, cy + 7, s, 10, '#e8e2d0').setOrigin(0.5), 38));
      });
      // หลัง (ลายตาข่ายเพชร + ตราตรงกลาง)
      const back = this.add.container(0, 0);
      const bg = frameG(kind);
      bg.fillStyle(t.back, 1).fillRoundedRect(-CW / 2 + 7, -CH / 2 + 7, CW - 14, CH - 14, 5);
      for (let yy = -CH / 2 + 14; yy < CH / 2 - 10; yy += 10) {
        for (let xx = -CW / 2 + 14 + ((yy / 10) % 2 ? 5 : 0); xx < CW / 2 - 10; xx += 10) {
          bg.fillStyle(t.band, 0.28).fillPoints([new Phaser.Geom.Point(xx, yy - 2), new Phaser.Geom.Point(xx + 2, yy), new Phaser.Geom.Point(xx, yy + 2), new Phaser.Geom.Point(xx - 2, yy)], true);
        }
      }
      bg.fillStyle(t.edge, 1).fillCircle(0, 0, 19).fillStyle(t.band, 1).fillCircle(0, 0, 16).fillStyle(t.back, 1).fillCircle(0, 0, 12);
      bg.fillStyle(t.light, 1).fillPoints([new Phaser.Geom.Point(0, -9), new Phaser.Geom.Point(3, -3), new Phaser.Geom.Point(9, 0), new Phaser.Geom.Point(3, 3), new Phaser.Geom.Point(0, 9), new Phaser.Geom.Point(-3, 3), new Phaser.Geom.Point(-9, 0), new Phaser.Geom.Point(-3, -3)], true);
      back.add(bg);
      front.setVisible(false);
      box.add([glow, back, front]);
      box.setSize(CW, CH).setInteractive({ useHandCursor: true });
      const tt = i - 1.5;
      const home = { x: fanC[kind].x + tt * 78, y: fanC[kind].y + tt * tt * 7, a: tt * 8 };
      const card: Card = { id: o.id, kind, box, front, back, glow, home, up: false };
      box.on('pointerover', () => {
        if (busy || pick[kind] === o.id) return;
        layer[kind].bringToTop(box);
        this.tweens.add({ targets: box, y: home.y - 14, angle: home.a * 0.5, scale: 1.05, duration: 140, ease: 'Quad.easeOut' });
      });
      box.on('pointerout', () => {
        if (busy || pick[kind] === o.id) return;
        restack(kind);
        this.tweens.add({ targets: box, y: home.y, angle: home.a, scale: 1, duration: 160, ease: 'Quad.easeOut' });
      });
      box.on('pointerdown', () => {
        if (busy) return;
        Sfx.play('click');
        choose(kind, o.id);
      });
      layer[kind].add(box);
      return card;
    };
    /** พลิกการ์ด (ย่อแกน X → สลับหน้า/หลัง → ขยายกลับเป็น to) */
    const flip = (cd: Card, up: boolean, delay = 0, done?: () => void, to = 1) => {
      if (cd.up === up) return void (done && this.time.delayedCall(delay, done));
      cd.up = up;
      const sc = to;
      this.tweens.add({
        targets: cd.box, scaleX: 0, duration: 110, delay, ease: 'Quad.easeIn',
        onComplete: () => {
          cd.front.setVisible(up);
          cd.back.setVisible(!up);
          this.tweens.add({ targets: cd.box, scaleX: sc, duration: 120, ease: 'Quad.easeOut', onComplete: () => done?.() });
        },
      });
    };
    // ลำดับซ้อน: ใบที่เลือกอยู่บนสุดเสมอ
    const restack = (kind: Kind) => {
      for (const cd of cards[kind]) layer[kind].bringToTop(cd.box);
      const sel = cards[kind].find((cd) => cd.id === pick[kind]);
      if (sel) layer[kind].bringToTop(sel.box);
    };
    const info: Record<Kind, Phaser.GameObjects.Container> = { base: this.add.container(0, 0), weapon: this.add.container(0, 0) };
    c.add([info.base, info.weapon]);
    const renderInfo = (kind: Kind) => {
      const box = info[kind];
      box.removeAll(true);
      const id = pick[kind];
      const x = fanC[kind].x, y = 356;
      if (!id) {
        box.add(txt(this, x, y + 6, 'ชี้การ์ดเพื่อดู · แตะเพื่อเลือก', 11, '#8d9aa6').setOrigin(0.5));
        return;
      }
      box.add(txt(this, x, y, this.starterName(kind, id), 13, TRIM[kind].css).setOrigin(0.5).setStroke('#0b0d1f', 3));
      box.add(txt(this, x, y + 20, this.starterPitch(kind, id), 11, '#c9d3dc', { align: 'center', wordWrap: { width: 300 }, maxLines: 2 }).setOrigin(0.5, 0));
    };
    const choose = (kind: Kind, id: string) => {
      pick[kind] = id;
      for (const cd of cards[kind]) {
        const on = cd.id === id;
        this.tweens.killTweensOf(cd.glow);
        if (on) {
          this.tweens.add({ targets: cd.box, x: cd.home.x, y: cd.home.y - 30, angle: 0, scaleY: 1.12, alpha: 1, duration: 220, ease: 'Back.easeOut' });
          // พลิกโชว์ 1 รอบ แล้วเรืองทองเต้นเบาๆ
          flip(cd, false, 0, () => flip(cd, true, 0, undefined, 1.12), 1.12);
          cd.glow.setAlpha(0.8);
          this.tweens.add({ targets: cd.glow, alpha: { from: 0.65, to: 1 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.time.delayedCall(240, () => this.starterBurst(c, cd.home.x, cd.home.y - 30, 10, '#fff2b0', 70));
        } else {
          cd.glow.setAlpha(0);
          this.tweens.add({ targets: cd.box, x: cd.home.x, y: cd.home.y, angle: cd.home.a, scale: 1, alpha: 0.82, duration: 200, ease: 'Quad.easeOut' });
        }
      }
      restack(kind);
      renderInfo(kind);
      refresh();
    };

    (['base', 'weapon'] as Kind[]).forEach((kind) => lists[kind].forEach((o, i) => cards[kind].push(makeCard(kind, o, i))));
    renderInfo('base');
    renderInfo('weapon');

    // ---- ปุ่มเกม ----
    const rnd = this.starterBtn(370, 476, 166, 38, '🎲 สุ่มให้', 'magic', () => shuffle());
    const ok = this.starterBtn(590, 476, 214, 42, '', 'gold', () => {
        if (busy) return;
        if (pick.base && pick.weapon) return this.starterCommit(pick, close);
        ok.shake();
        (['base', 'weapon'] as Kind[]).filter((k) => !pick[k]).forEach((k) => cards[k].forEach((cd, i) => this.tweens.add({ targets: cd.box, y: cd.home.y - 10, duration: 90, delay: i * 50, yoyo: true })));
    }, true);
    c.add([rnd.box, ok.box]);
    const refresh = () => ok.setLabel(pick.base && pick.weapon ? '✔ เริ่มเอาชีวิตรอด!' : `เลือก${!pick.base ? 'การ์ดฐาน' : ''}${!pick.base && !pick.weapon ? ' + ' : ''}${!pick.weapon ? 'อาวุธ' : ''}`);
    refresh();

    // ---- สุ่ม: คว่ำการ์ด → รวมกอง สับไปมา → กางพัด → พลิกเปิด → เลือกใบที่ได้ ----
    const shuffle = () => {
      if (busy) return;
      busy = true;
      (['base', 'weapon'] as Kind[]).forEach((kind) => {
        const list = cards[kind];
        const target = Phaser.Math.Between(0, list.length - 1);
        pick[kind] = null;
        renderInfo(kind);
        refresh();
        list.forEach((cd, i) => {
          this.tweens.killTweensOf(cd.glow);
          cd.glow.setAlpha(0);
          flip(cd, false, i * 40);
          cd.box.setScale(cd.box.scaleX, 1);
          this.tweens.add({ targets: cd.box, x: fanC[kind].x + (i - 1.5) * 4, y: fanC[kind].y, angle: Phaser.Math.Between(-5, 5), alpha: 1, duration: 240, delay: 180 + i * 30, ease: 'Quad.easeIn' });
        });
        // สับ: ใบสุ่มเลื่อนออกซ้าย/ขวาแล้วกลับเข้ากอง
        for (let s = 0; s < 6; s++) {
          this.time.delayedCall(480 + s * 120, () => {
            const cd = Phaser.Utils.Array.GetRandom(list);
            layer[kind].bringToTop(cd.box);
            this.tweens.add({ targets: cd.box, x: fanC[kind].x + (s % 2 ? 46 : -46), angle: s % 2 ? 9 : -9, duration: 60, yoyo: true, ease: 'Sine.easeOut' });
            if (kind === 'base') Sfx.play('click');
          });
        }
        this.time.delayedCall(1240, () => {
          list.forEach((cd, i) => this.tweens.add({ targets: cd.box, x: cd.home.x, y: cd.home.y, angle: cd.home.a, duration: 260, delay: i * 40, ease: 'Back.easeOut' }));
          list.forEach((cd, i) => flip(cd, true, 360 + i * 90));
          this.time.delayedCall(360 + list.length * 90 + 260, () => {
            choose(kind, list[target].id);
            if (kind === 'weapon') busy = false;
          });
        });
      });
    };

    // ---- เข้าฉาก: แจกการ์ดคว่ำออกเป็นพัด แล้วพลิกเปิดทีละใบ ----
    (['base', 'weapon'] as Kind[]).forEach((kind, k) => {
      cards[kind].forEach((cd, i) => {
        const d = 120 + k * 200 + i * 70;
        this.tweens.add({ targets: cd.box, x: cd.home.x, y: cd.home.y, angle: cd.home.a, duration: 380, delay: d, ease: 'Cubic.easeOut' });
        flip(cd, true, d + 420);
      });
    });
    this.time.delayedCall(120 + 200 + 4 * 70 + 420 + 300, () => (busy = false));
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
  private joyZone!: Phaser.GameObjects.Zone;
  private touchBtns: Phaser.GameObjects.Arc[] = [];

  /**
   * ปุ่มสัมผัส: จอยซ้าย (ลอย — แตะตรงไหนในโซนซ้ายล่าง จอยไปเกิดตรงนั้น) + กลุ่มปุ่มขวาล่างรอบปุ่มโจมตี
   * จอเล็ก: ทั้งสองกลุ่มขยาย kt เท่า ยึดมุมล่าง (ปุ่มเล็กสุด ≥ 44 css px บนมือถือ)
   */
  /** ปุ่มสัมผัสแต่ละตัว (คอนเทนเนอร์ที่จุดกลาง) + วงกลม + รัศมีที่ขนาด 1 (หน่วยเกม) */
  private touchParts: Partial<Record<TouchId, { c: Phaser.GameObjects.Container; arc: Phaser.GameObjects.Arc; r: number }>> = {};
  private touchLayout: TouchLayout | null = null;
  private touchApplied: boolean | null = null;
  private touchEditor: TouchEditor | null = null;
  private joyApply: (() => void) | null = null;
  /** ตำแหน่งปกติ (ไม่ใช่โหมดสัมผัส) ของ hotbar / ปุ่มเมนู — คืนค่าตอนกลับเป็นคอม */
  private hotHome: { x: number; y: number; s: number } | null = null;
  private menuHome: { x: number; popX: number } | null = null;

  /**
   * ปุ่มสัมผัส (มือถือ/แท็บเล็ต): จอยซ้ายล่าง (ลอยตามนิ้ว/คงที่ · เดดโซน) + ปุ่มโจมตีใหญ่มุมขวาล่าง ปุ่มอื่นเรียงโค้งรอบ
   * ตำแหน่ง/ขนาด/ความทึบ จัดเองได้ (หน้า "จัดตำแหน่งปุ่ม" — ui/TouchEditor.ts) เก็บตามสัดส่วนจอ (ui/TouchLayout.ts)
   * แบบเรียบ: พื้นเทาอมเขียวใส ขอบบางสีตามหน้าที่ · ปกติทึบ ~0.7 · กดแล้ว 0.9
   */
  private buildTouch() {
    this.touchLayer = this.add.container(0, 0).setDepth(5).setVisible(false);
    this.touchBtns = [];
    this.touchParts = {};
    this.touchLayout = null;
    this.touchApplied = null;
    this.input.addPointer(2);
    const ctl = this.gs.controls;
    // ---- จอย ----
    const zone = this.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive();
    this.joyZone = zone;
    const joyC = this.add.container(0, 0);
    const base = this.add.circle(0, 0, 10, RETRO.panel, 0.45).setStrokeStyle(2, RETRO.edgeHi, 0.7);
    const knob = this.add.circle(0, 0, 5, RETRO.edgeHi, 0.6).setStrokeStyle(1, 0x0b0f12, 0.8);
    joyC.add([base, knob]);
    let R = 40;
    let home = { x: 0, y: 0 };
    let pid = -1;
    let centre = { x: 0, y: 0 };
    this.joyApply = () => {
      const it = this.touchLayout!.joy;
      R = cssToGame(this, TOUCH_R_CSS.joy!) * it.s;
      base.setRadius(R);
      knob.setRadius(R * 0.45);
      home = { x: it.x * W, y: it.y * H };
      if (pid < 0) {
        joyC.setPosition(home.x, home.y);
        knob.setPosition(0, 0);
      }
      joyC.setAlpha(Math.min(1, it.a + 0.1));
      // พื้นที่แตะจอย: ฝั่งเดียวกับจอย (ไม่ทับ hotbar ตรงกลาง) · ล่าง 65% ของจอ
      const left = it.x < 0.5;
      const x0 = left ? 0 : Math.max(W * 0.5, home.x - W * 0.16);
      const x1 = left ? Math.min(W * 0.5, home.x + W * 0.16) : W;
      zone.setPosition(x0, H * 0.35).setSize(x1 - x0, H * 0.65);
      if (zone.input) (zone.input.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, x1 - x0, H * 0.65);
    };
    const moveKnob = (p: Phaser.Input.Pointer) => {
      const v = new Phaser.Math.Vector2(p.x - centre.x, p.y - centre.y);
      const len = Math.min(R, v.length());
      v.normalize().scale(len);
      knob.setPosition(v.x, v.y);
      const dead = joyOptions().dead;
      if (len < dead * R) ctl.touch.move.set(0, 0);
      else ctl.touch.move.set(v.x / R, v.y / R);
      if (len > R * 0.9) ctl.touch.held.add('sprint');
      else ctl.touch.held.delete('sprint');
    };
    zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      Sfx.unlock();
      ctl.touchMode = true;
      pid = p.id;
      // ลอย: ฐานย้ายไปที่นิ้วแตะ · คงที่: ฐานอยู่ที่เดิม
      if (joyOptions().mode === 'floating') {
        const b = zone.getBounds();
        centre = { x: Phaser.Math.Clamp(p.x, b.left + R * 0.6, b.right - R * 0.6), y: Phaser.Math.Clamp(p.y, b.top + R * 0.6, H - R * 0.6) };
      } else centre = { ...home };
      joyC.setPosition(centre.x, centre.y).setAlpha(0.9);
      moveKnob(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => p.id === pid && moveKnob(p));
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== pid) return;
      pid = -1;
      this.joyApply?.();
      ctl.touch.move.set(0, 0);
      ctl.touch.held.delete('sprint');
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.touchLayer.add([zone, joyC]);

    // ---- ปุ่มขวา ----
    const btn = (id: TouchId, label: string, color: number, act: () => void, hold?: string) => {
      const c = this.add.container(0, 0);
      const arc = this.add.circle(0, 0, 10, RETRO.panel, 0.8).setStrokeStyle(2, MUTED_TOUCH[color] ?? RETRO.edge, 1).setInteractive();
      const t = txt(this, 0, 0, label, id === 'attack' ? 13 : 11, RETRO.css.text, { fontStyle: '500' }).setOrigin(0.5);
      c.add([arc, t]);
      arc.on('pointerdown', () => {
        Sfx.unlock();
        ctl.touchMode = true;
        c.setAlpha(0.9).setScale(c.scaleX * 0.92);
        if (hold) ctl.touch.held.add(hold);
        act();
      });
      const up = () => {
        const it = this.touchLayout?.[id];
        if (it) c.setAlpha(it.a).setScale(it.s);
        if (hold) ctl.touch.held.delete(hold);
      };
      arc.on('pointerup', up).on('pointerout', up);
      this.touchLayer.add(c);
      this.touchBtns.push(arc);
      this.touchParts[id] = { c, arc, r: 10 };
      return c;
    };
    btn('attack', 'โจมตี', 0xb13e53, () => ctl.touch.pressed.add('attack'), 'attack');
    btn('use', 'ใช้', 0x38b764, () => ctl.touch.pressed.add('interact'));
    btn('eat', 'กิน/เปิด', 0xc28a50, () => ctl.touch.pressed.add('use'));
    btn('dodge', 'หลบ', 0x3b5dc9, () => ctl.touch.pressed.add('dodge'));
    const sk = btn('skill', 'สกิล', 0xffcd75, () => ctl.touch.pressed.add('skill'));
    btn('auto', 'ออโต้', 0x38b764, () => this.autoWin.toggle());
    // คูลดาวน์สกิลบนปุ่ม
    this.skillCdT = txt(this, 0, 12, '', 12, '#ffffff').setOrigin(0.5);
    sk.add(this.skillCdT);
  }

  /** ขนาดปุ่มที่ขนาด 1 (หน่วยเกม) — ใช้ในหน้าจัดตำแหน่ง */
  private touchSize(id: TouchId) {
    const r = TOUCH_R_CSS[id];
    if (r) return { w: cssToGame(this, r) * 2, h: cssToGame(this, r) * 2, round: true };
    if (id === 'hotbar') {
      const b = this.hotbarPanel.getBounds();
      const sc = this.gHot.scaleX || 1;
      return { w: (b.width / sc) * this.kt, h: (b.height / sc) * this.kt, round: false };
    }
    if (id === 'chat') {
      const c = this.chat?.pillRect();
      return { w: c?.w ?? 40, h: c?.h ?? 28, round: false };
    }
    const b = this.menuBtns?.getBounds();
    return { w: b?.width ?? 70, h: b?.height ?? 30, round: false };
  }

  /** ตำแหน่งปกติของ hotbar / แชท / ปุ่มเมนู (สัดส่วนจอ) — เป็นค่าเริ่มต้นของหน้าจัดตำแหน่ง */
  private touchFixed(): Partial<Record<TouchId, TouchItem>> {
    const out: Partial<Record<TouchId, TouchItem>> = {};
    const hb = this.hotbarPanel.getBounds();
    const hs = this.hotHome ? this.gHot.scaleX / this.hotHome.s : 1;
    // hotbar ปกติ (ย่อเล็กน้อยบนมือถือ ไม่ชนนิ้ว)
    if (this.hotHome) {
      const sc = this.hotHome.s;
      out.hotbar = { x: (this.hotHome.x + (W / 2) * sc) / W, y: (this.hotHome.y + this.hotY * sc) / H, s: 0.9, a: 1 };
    } else out.hotbar = { x: hb.centerX / W, y: hb.centerY / H, s: 0.9 * (1 / hs), a: 1 };
    const c = this.chat?.pillRect();
    if (c) out.chat = { x: c.x / W, y: c.y / H, s: 1, a: 1 };
    const mb = this.menuBtns?.getBounds();
    if (mb && this.menuHome) {
      const dx = (this.menuBtns!.x - this.menuHome.x) * this.k;
      out.menu = { x: (mb.centerX - dx) / W, y: mb.centerY / H, s: 1, a: 1 };
    }
    return out;
  }

  /** y ของแถว hotbar (พิกัดภายในกลุ่ม) */
  private get hotY() {
    return H - SLOT / 2 - 10 - M;
  }

  /** จัดปุ่มสัมผัสตามตำแหน่งที่บันทึก (touch = true) · กลับเป็นคอม = คืน hotbar/เมนู ที่เดิม */
  private applyTouchLayout(touch: boolean, l?: TouchLayout) {
    if (!this.hotHome) this.hotHome = { x: this.gHot.x, y: this.gHot.y, s: this.gHot.scaleX };
    if (!this.menuHome && this.menuBtns) this.menuHome = { x: this.menuBtns.x, popX: this.menuPop?.x ?? 0 };
    if (l) this.touchLayout = l;
    if (!this.touchLayout) this.touchLayout = loadLayout(this, this.touchFixed());
    const lay = this.touchLayout;
    if (!touch) {
      const h = this.hotHome;
      this.gHot.setScale(h.s).setPosition(h.x, h.y);
      this.chat?.setPillAt(null);
      if (this.menuHome && this.menuBtns) {
        this.menuBtns.setX(this.menuHome.x);
        this.menuPop?.setX(this.menuHome.popX);
      }
      return;
    }
    this.joyApply?.();
    for (const id of ['attack', 'use', 'eat', 'dodge', 'skill', 'auto'] as TouchId[]) {
      const p = this.touchParts[id];
      if (!p) continue;
      const it = lay[id];
      p.r = cssToGame(this, TOUCH_R_CSS[id]!);
      p.arc.setRadius(p.r);
      if (p.arc.input) (p.arc.input.hitArea as Phaser.Geom.Circle).setTo(p.r, p.r, p.r);
      p.c.setPosition(it.x * W, it.y * H).setScale(it.s).setAlpha(it.a);
    }
    // hotbar: จุดกลางตามที่จัด · ขนาดตาม s (ฐาน = ขนาดปกติของจอนี้)
    const hb = lay.hotbar;
    const sc = this.hotHome.s * hb.s;
    this.gHot.setScale(sc).setPosition(hb.x * W - (W / 2) * sc, hb.y * H - this.hotY * sc);
    this.chat?.setPillAt({ x: lay.chat.x * W, y: lay.chat.y * H });
    if (this.menuBtns && this.menuHome) {
      this.menuBtns.setX(this.menuHome.x);
      this.menuPop?.setX(this.menuHome.popX);
      const b = this.menuBtns.getBounds();
      const dx = (lay.menu.x * W - b.centerX) / this.k;
      this.menuBtns.setX(this.menuHome.x + dx);
      this.menuPop?.setX(this.menuHome.popX + dx);
    }
  }

  /** เปิดหน้าจัดตำแหน่งปุ่มสัมผัส (จาก ☰ / ตั้งค่า) */
  private openTouchEditor() {
    if (this.touchEditor) return;
    this.wins.forEach((w) => w.visible && w.close());
    this.toggleMenuPop(false);
    this.applyTouchLayout(true);
    this.touchLayer.setVisible(true);
    this.touchEditor = new TouchEditor(this, this.touchLayout!, {
      sizeOf: (id) => this.touchSize(id),
      apply: (l) => this.applyTouchLayout(true, l),
      defaults: () => defaultLayout(this, this.touchFixedDefault()),
      save: (l) => {
        saveLayout(this, l);
        this.touchLayout = l;
        this.toast('บันทึกตำแหน่งปุ่มแล้ว', RETRO.css.sage);
      },
      close: () => {
        this.touchEditor = null;
        this.touchLayout = loadLayout(this, this.touchFixedDefault());
        this.touchApplied = null; // ให้ updateHUD จัดใหม่ตามโหมดปัจจุบัน
      },
    });
  }

  /** ค่าเริ่มต้นของ hotbar/แชท/เมนู (ตำแหน่งปกติ ไม่ใช่ที่จัดไว้) */
  private touchFixedDefault(): Partial<Record<TouchId, TouchItem>> {
    const keep = this.touchLayout;
    this.applyTouchLayout(false);
    const f = this.touchFixed();
    this.touchLayout = keep;
    return f;
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
      Sfx.setMusicPaused(pause); // หยุดเกม = เพลงหรี่
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
void BIOMES;
void GRID;
void SLOT_SIZE;
void heroKey;
void buildHeroTexture;
