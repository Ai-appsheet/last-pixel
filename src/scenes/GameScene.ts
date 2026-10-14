import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { InputManager } from '../core/InputManager';
import { MetaSave } from '../core/MetaSave';
import { CENTER_SLOT, getRoomService, localPlayerId, type RoomInfo, type TradeListing } from '../core/RoomService';
import { SaveManager, type RunSave } from '../core/SaveManager';
import { getSettings } from '../core/Settings';
import { XP_GAIN, levelStats } from '../data/level';
import { BLUEPRINT_ITEM, BLUEPRINT_KEY, DEFAULT_KNOWN, bpKeyBuild, bpKeyRecipe } from '../data/blueprints';
import { RECIPES } from '../data/recipes';
import { SPECIAL_NAME, SPECIAL_SLOT, fmtLeft, specialState, type SpecialState } from '../core/SpecialIsland';
import { BUILD, hasAnvil, type BuildDef } from '../data/buildables';
import { getCharacter } from '../data/characters';
import { BIOMES } from '../data/islands';
import { CROPS, ITEMS, type ItemDef } from '../data/items';
import { STATUS_INFO, classOf, statusPower, type WeaponClass } from '../data/weapons';
import { RARITY, mobBoxDrop, plusMult, rollBox, type BoxTier } from '../data/loot';
import { BUILD_LEVEL } from '../data/upgrade';
import { UpgradeSystem, migrateUpgradeSave, savedLevel, type ItemRef } from '../systems/UpgradeSystem';
import { ADVENTURE_LOOT, DUNGEON_BOSS_BOXES, capBoxTier, isBoxTier, ruinChestBox, type BoxSource, type LootZone } from '../data/loot';
import { MOBS, mobFreeMove, type MobDef } from '../data/mobs';
import { STORY } from '../data/quests';
import { HOTBAR_SIZE, type Inventory, type Slot } from '../components/Inventory';
import { Wallet } from '../components/Wallet';
import { Vehicle } from '../entities/Boat';
import { interiorDef, isInterior } from '../world/Interiors';
import { DroppedItem } from '../entities/DroppedItem';
import { Mob } from '../entities/Mob';
import { Player, emptyEquipment, type Equipment } from '../entities/Player';
import { addStats, emptyStats, statLine, SLOT_NAME, STAT_INFO, TRAIN_CAP, type EquipSlot, type Stats } from '../data/equipment';
import { ResourceNode } from '../entities/ResourceNode';
import { RAIN_WATER_CAP, Structure } from '../entities/Structure';
import { TiltPipeline, tiltMap } from '../gfx/TiltPipeline';
import { AchievementSystem } from '../systems/AchievementSystem';
import { InspectSystem } from '../systems/InspectSystem';
import { AutoSystem } from '../systems/AutoSystem';
import { InteriorSystem } from '../systems/InteriorSystem';
import { MaterialPool, affordableTimes, canAfford, consume, missingRaw, planConsume, rawCost, rawCostOfBuild, recipeNeeds } from '../systems/CraftingSystem';
import { IMPACT_MULT, ShelterSystem, burnable, materialOf } from '../systems/ShelterSystem';
import { HazardSystem } from '../systems/HazardSystem';
import { BiomeSystem } from '../systems/BiomeSystem';
import { AmbientSystem } from '../systems/AmbientSystem';
import { BuildSystem } from '../systems/BuildSystem';
import { CombatFX } from '../systems/CombatFX';
import { DailySystem } from '../systems/DailySystem';
import { DayNightSystem } from '../systems/DayNightSystem';
import { DisasterSystem } from '../systems/DisasterSystem';
import { LightingSystem, type LightSource } from '../systems/LightingSystem';
import { MarketSystem } from '../systems/MarketSystem';
import { QuestSystem } from '../systems/QuestSystem';
import { SpawnSystem } from '../systems/SpawnSystem';
import { CreatureSystem } from '../systems/CreatureSystem';
import { RivalSystem } from '../systems/RivalSystem';
import { WeatherSystem, type Weather } from '../systems/WeatherSystem';
import { ChunkManager } from '../world/ChunkManager';
import { ChunkRenderer } from '../world/ChunkRenderer';
import { TILE, isWater } from '../world/tiles';
import { SHAPE_NAMES, World, texFor, type NodeData } from '../world/WorldGenerator';
import { buildShowcase } from '../world/Showcase';
import { txt } from '../ui/widgets';
import { fadeIn, fadeTo } from '../ui/transition';
import { FpsWatch, qualityKnobs } from '../core/Quality';
import { GRACE_DAYS, STARTER_BASES, STARTER_WEAPONS } from '../data/starter';
import { GuideSystem } from '../systems/GuideSystem';
import type { UIScene } from './UIScene';

export interface GameStartData {
  roomId: string;
  character: string;
  restore?: boolean;
  showcase?: boolean;
}

type Layer = 'floor' | 'object' | 'boat';
const tkey = (layer: string, tx: number, ty: number) => `${layer}:${tx},${ty}`;
/** ไบโอมที่ไม่มีการ์ดขึ้นเกาะครั้งแรก (มีแบนเนอร์/การ์ดของตัวเองอยู่แล้ว) */
const NO_LAND_CARD = new Set(['home', 'central', 'special', 'dungeon']);
const BLOCKING_NODES = new Set(['tree', 'rock', 'ore_iron', 'ore_gold', 'ore_coal', 'ore_sulfur', 'crystal', 'cactus', 'meteor_rock', 'ruin_chest', 'bamboo', 'coral']);

/** อันเดด (ไม้เท้าแสงศักดิ์สิทธิ์ทำดาเมจ ×1.5) */
const UNDEAD = new Set(['zombie', 'skeleton', 'mummy', 'shade']);

export class GameScene extends Phaser.Scene {
  player!: Player;
  dayNight!: DayNightSystem;
  controls!: InputManager;
  inspect!: InspectSystem;
  auto!: AutoSystem;
  interiors!: InteriorSystem;
  hazards!: HazardSystem;
  biomeFx!: BiomeSystem;
  world!: World;
  room!: RoomInfo;
  fx!: CombatFX;
  market!: MarketSystem;
  daily!: DailySystem;
  weather!: WeatherSystem;
  build!: BuildSystem;
  /** อัพเกรด 10 ระดับ (ไอเทม/สิ่งก่อสร้าง/ยาน) */
  upgrades!: UpgradeSystem;
  /** เขตปลอดภัยรอบบ้าน + วัสดุทนภัย */
  shelter!: ShelterSystem;
  /** แปลนที่ปักหมุดไว้ (b:<id> / r:<recipeId>) — HUD แสดงของที่ยังขาด */
  pinned: string | null = null;
  disaster!: DisasterSystem;
  quests: QuestSystem | null = null;
  guide!: GuideSystem;
  achievements!: AchievementSystem;
  wallet = new Wallet();
  worldTime = 0;
  creative = false;
  showcase = false;
  introSeen = true;
  /** เลือกแปลนเริ่มต้น (ฐาน 1 + อาวุธ 1) แล้วหรือยัง — เกมใหม่ = false */
  starterPicked = true;
  /** สิ่งก่อสร้างที่สร้างฟรีได้ 1 ครั้ง (ฐานที่มั่นเริ่มต้น) */
  freeBuilds = new Set<string>();
  playerName = '';

  kills = 0;
  deathCause = '';
  hint: string | null = null;
  currentSlot = -1;
  boss: Mob | null = null;
  ward: { x: number; y: number; r: number; t: number; img: Phaser.GameObjects.Arc } | null = null;
  wreckSprite: Phaser.GameObjects.Image | null = null;
  mailboxSprite: Phaser.GameObjects.Image | null = null;
  merchantSprite: Phaser.GameObjects.Sprite | null = null;
  stalls: { x: number; y: number; index: number }[] = [];
  visited = new Set<string>();
  /** กล้อง */
  zoom = 3;
  tilt = 0;
  /** การตกปลา */
  fishing: { state: 'wait' | 'bite'; t: number; bobber: Phaser.GameObjects.Image; mark: Phaser.GameObjects.Text } | null = null;
  /** ยานพาหนะที่กำลังขี่ (เรือ/รถ/ม้า/ยานบิน) */
  riding: Vehicle | null = null;

  private chunksR!: ChunkRenderer;
  private chunks!: ChunkManager;
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  private structures: Structure[] = [];
  private structureMap = new Map<string, Structure>();
  private structBlockers!: Phaser.Physics.Arcade.StaticGroup;
  private doorBlockers!: Phaser.Physics.Arcade.StaticGroup;
  private boats: Vehicle[] = [];
  private mobs!: Phaser.Physics.Arcade.Group;
  private airMobs!: Phaser.Physics.Arcade.Group;
  private shots!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private drops: DroppedItem[] = [];
  private graves: { x: number; y: number; items: Slot[]; sprite: Phaser.GameObjects.Image }[] = [];
  private crates: { sprite: Phaser.GameObjects.Image; tx: number; ty: number; looted: boolean }[] = [];
  private braziers: Phaser.GameObjects.Sprite[] = [];
  private signs: { x: number; y: number; text: string }[] = [];
  private paintedTiles = new Map<string, number>();
  private removedNodes = new Set<number>();
  private lighting!: LightingSystem;
  private spawner!: SpawnSystem;
  /** สัตว์ในตำนาน + สถานะที่สัตว์ทำให้ผู้เล่นติด */
  creatures!: CreatureSystem;
  /** ผู้รอดชีวิตคู่แข่ง (PvP บนเกาะผจญภัย — บอทแทนผู้เล่นจริง) */
  rivals!: RivalSystem;
  /** อยู่ในเขตผจญภัยตอนนี้ (อัปเดตทุก 0.4 วิใน updateZones) */
  private adventure = false;
  private ambient!: AmbientSystem;
  private gameOverFlag = false;
  private ui!: UIScene;
  private zoneTimer = 0;
  private powerTimer = 0;
  /** นับรอบ (ทุก 1 วิ) ของระบบสิ่งก่อสร้าง — คลังอัตโนมัติดูดของทุก 5 รอบ */
  private structTick = 0;
  private autosaveTimer = 60;
  private offEvents: (() => void)[] = [];
  /** โหมดคุณภาพ auto: เฝ้า FPS แล้วลดคุณภาพเองถ้ากระตุก */
  private fpsWatch = new FpsWatch();
  /** นับเฟรมสำหรับซ่อนของนอกจอ (ทุก 3 เฟรม) */
  private cullTimer = 0;
  private pinch = 0;

  constructor() {
    super('GameScene');
  }

  // ======================================================================
  // สร้างโลก
  // ======================================================================
  create(data: GameStartData) {
    this.resetState();
    fadeIn(this, 380);
    this.fpsWatch = new FpsWatch();
    this.cullTimer = 0;
    const rooms = getRoomService();
    const save = data.restore ? SaveManager.load() : null;
    const roomId = save?.roomId ?? data.roomId;
    const pid = localPlayerId();
    const joined = rooms.join(roomId, pid, MetaSave.load().playerName || 'ผู้รอดชีวิต');
    if ('error' in joined) {
      this.scene.start('RoomSelectScene', { error: joined.error });
      return;
    }
    this.room = joined.room;
    this.playerName = MetaSave.load().playerName || 'ผู้รอดชีวิต';
    this.showcase = !!(data.showcase || save?.showcase);
    this.world = new World(this.room.seed, this.room.players, joined.slot, pid);
    this.introSeen = save?.introSeen ?? this.showcase;
    this.starterPicked = save ? save.starterPicked ?? true : this.showcase;
    this.freeBuilds = new Set(save?.freeBuilds ?? []);

    const T = 16;
    const b = this.world.bounds;
    this.physics.world.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
    this.blockers = this.physics.add.staticGroup();
    this.structBlockers = this.physics.add.staticGroup();
    this.doorBlockers = this.physics.add.staticGroup();
    this.mobs = this.physics.add.group({ runChildUpdate: false });
    this.airMobs = this.physics.add.group({ runChildUpdate: false });
    this.shots = this.physics.add.group();
    this.enemyShots = this.physics.add.group();
    this.chunks = new ChunkManager(this, this.world.nodes, this.blockers);
    this.world.onSlotGenerated = (slot, nodes) => {
      nodes.forEach((n) => this.chunks.add(n));
      this.decorateOtherIsland(slot);
    };

    const char = getCharacter(save?.character ?? data.character);
    const sp = this.world.spawn;
    this.player = new Player(this, sp.tx * T + 8, sp.ty * T + 8, char);
    this.chunksR = new ChunkRenderer(this, this.world);
    this.chunksR.colliderTargets = [
      { obj: this.player, process: () => !this.riding || this.riding.kind === 'land' },
      { obj: this.mobs },
    ];

    this.buildCrashSite();
    this.buildCentral();
    for (const s of this.world.slots) if (s && s.index !== this.world.home && s.biome !== 'central') this.world.generated.has(s.index) && this.decorateOtherIsland(s.index);

    this.physics.add.collider(this.player, this.blockers, undefined, () => !this.riding || this.riding.kind === 'land');
    this.physics.add.collider(this.player, this.structBlockers, undefined, () => !this.riding || this.riding.kind === 'land');
    this.physics.add.collider(this.mobs, this.blockers);
    this.physics.add.collider(this.mobs, this.mobs);
    this.physics.add.collider(this.mobs, [this.structBlockers, this.doorBlockers], (m, s) => {
      if (!(s instanceof Structure)) return;
      const mob = m as Mob;
      mob.bumpStructure((mult) => this.damageStructure(s, mob.def.attack * mult));
    });
    this.physics.add.overlap(this.shots, [this.mobs, this.airMobs], (a, m) => this.onShotHit(a as Phaser.Physics.Arcade.Image, m as Mob));
    this.physics.add.overlap(this.enemyShots, this.player, (_p, a) => this.onEnemyShot(a as Phaser.Physics.Arcade.Image));
    this.physics.add.collider(this.enemyShots, this.structBlockers, (a, s) => {
      const shot = a as Phaser.Physics.Arcade.Image;
      if (s instanceof Structure) this.damageStructure(s, (shot.getData('damage') as number) * 0.6);
      shot.destroy();
    });

    const cam = this.cameras.main;
    cam.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
    cam.setZoom(this.zoom);
    cam.startFollow(this.player, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    cam.setBackgroundColor('#29366f');

    this.fx = new CombatFX(this);
    this.dayNight = new DayNightSystem();
    this.lighting = new LightingSystem(this);
    this.spawner = new SpawnSystem(this);
    this.creatures = new CreatureSystem(this);
    this.rivals = new RivalSystem(this);
    this.ambient = new AmbientSystem(this);
    this.weather = new WeatherSystem(this);
    this.market = new MarketSystem();
    this.market.refresh(this.room.seed, 1);
    this.daily = new DailySystem(this);
    this.build = new BuildSystem(this);
    this.upgrades = new UpgradeSystem(this);
    this.disaster = new DisasterSystem(this);
    this.achievements = new AchievementSystem();
    this.controls = new InputManager(this);
    this.inspect = new InspectSystem(this);
    this.auto = new AutoSystem(this);
    this.interiors = new InteriorSystem(this);
    this.shelter = new ShelterSystem(this);
    this.quests = new QuestSystem(STORY, (items) => this.giveItems(items));
    this.guide = new GuideSystem(this);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.ui?.isPointerOverUI(p)) return;
      this.setZoom(this.zoom * (dy > 0 ? 0.9 : 1.1));
    });
    const kb = this.input.keyboard!;
    kb.on('keydown-PLUS', () => this.setZoom(this.zoom * 1.15));
    kb.on('keydown-NUMPAD_ADD', () => this.setZoom(this.zoom * 1.15));
    kb.on('keydown-MINUS', () => this.setZoom(this.zoom / 1.15));
    kb.on('keydown-NUMPAD_SUBTRACT', () => this.setZoom(this.zoom / 1.15));
    kb.on('keydown-V', () => this.setTilt(this.tilt > 0 ? 0 : 0.6));
    kb.on('keydown-B', () => EventBus.emit('ui:build'));
    kb.on('keydown-X', () => this.build.toggleDemolish());
    kb.on('keydown-U', () => this.build.toggleUpgrade());

    this.listen('day:start', (day: number) => {
      if (day === GRACE_DAYS + 1 && !this.showcase) EventBus.emit('ui:splash', { art: 'raid_night', title: '🛡 ช่วงตั้งหลักจบแล้ว', sub: 'ตั้งแต่วันนี้ภัยพิบัติจะมาเยือนทั้งกลางวันและกลางคืน — เตรียมฐานให้พร้อม!', color: '#ef7d57', hold: 3600 });
      this.mobList().forEach((m) => !m.isBoss && m.getData('dungeon') === undefined && (m.def.ai === 'zombie' || m.disaster) && (m.burning = true));
      this.disaster.onDawn();
      this.daily.onDayStart(day);
      this.market.refresh(this.room.seed, day);
      void this.simulateBuyers();
      if (day >= 2) MetaSave.bump('bestDays', day - 1, 'max');
      Sfx.startMusic('day');
      this.autosave();
    });
    this.listen('night:start', (day: number) => {
      this.disaster.onNight(day);
      Sfx.startMusic('night');
    });
    this.listen('phase:dusk', (day: number) => this.disaster.onDusk(day));
    // คุณภาพลดเป็น "ต่ำ" → ปิดมุม 2.5D (post-effect ทั้งจอ)
    this.listen('quality', () => {
      if (!qualityKnobs().tilt && this.tilt > 0) this.setTilt(0);
    });
    this.events.once('shutdown', () => this.cleanup());

    if (save) this.applySave(save);
    else this.daily.setMailbox(true);
    if (this.showcase && !save) buildShowcase(this);
    this.interiors.init();
    this.hazards = new HazardSystem(this);
    this.biomeFx = new BiomeSystem(this);
    // เกาะใหม่: เซฟทันที (กลับมาเข้าเกาะเดิมได้แม้ปิดเกมเร็ว)
    if (!save) this.time.delayedCall(500, () => this.autosave());
    this.refreshBaseBuffs(true);
    if (!save) {
      this.player.hp = this.player.maxHp;
      this.player.stamina = this.player.maxStamina;
    }
    const onGearBroken = (name: string) => EventBus.emit('toast', `${name} พังแล้ว!`, '#b13e53');
    this.events.on('gear:broken', onGearBroken);
    this.offEvents.push(() => this.events.off('gear:broken', onGearBroken));

    this.chunksR.update(0, cam.worldView);
    this.chunks.update(0, cam.worldView, this.worldTime, true);
    this.scene.launch('UIScene');
    this.ui = this.scene.get('UIScene') as UIScene;
    // ค่าจากหน้าตั้งค่า: มุมกล้องเริ่มต้น + ปิดจอสั่น
    if (getSettings().tilt > 0) this.setTilt(getSettings().tilt);
    const cam0 = this.cameras.main;
    const shake = cam0.shake.bind(cam0);
    cam0.shake = ((...args: Parameters<typeof shake>) => (getSettings().shake ? shake(...args) : cam0)) as typeof cam0.shake;
    Sfx.startMusic(this.dayNight.isNight ? 'night' : 'day');
    if (!this.introSeen) this.time.delayedCall(300, () => EventBus.emit('ui:intro'));
    else if (!this.starterPicked) this.time.delayedCall(300, () => EventBus.emit('ui:starter'));
    else this.time.delayedCall(1500, () => this.guide.showControls());
    if (this.inGrace) this.time.delayedCall(this.introSeen ? 1200 : 400, () => EventBus.emit('toast', `🛡 ช่วงตั้งหลัก ${GRACE_DAYS} วันแรก — ยังไม่มีภัยพิบัติ ฟาร์มและสร้างฐานได้เต็มที่`, '#a7f070'));
    // XP จากทุกกิจกรรม
    this.listen('node:harvested', () => this.addXp(XP_GAIN.harvest));
    this.listen('craft', () => this.addXp(XP_GAIN.craft));
    this.listen('build', () => this.addXp(XP_GAIN.build));
    this.listen('fish', () => this.addXp(XP_GAIN.fish));
    this.listen('harvest', () => this.addXp(XP_GAIN.crop));
    this.listen('disaster:survived', () => this.addXp(XP_GAIN.survive));
    // 📌 สร้าง/คราฟต์ของที่ปักไว้ → เลิกปัก
    this.listen('build', (id: string) => this.checkPinDone(`b:${id}`));
    this.listen('craft', (item: string) => {
      const r = this.pinned?.startsWith('r:') ? RECIPES.find((x) => x.id === this.pinned!.slice(2)) : undefined;
      if (r && r.output.item === item) this.checkPinDone(this.pinned!);
    });
  }

  /** ได้ XP + เอฟเฟกต์เลเวลอัป */
  addXp(n: number) {
    const p = this.player;
    const up = p.gainXp(n);
    if (!up) return;
    Sfx.play('levelUp');
    this.fx.ring(p.x, p.y, 0xffcd75, 26);
    this.fx.sparks(p.x, p.y - 8, 0xfff2b0, 16, 20);
    const s = levelStats(p.level);
    const prev = levelStats(p.level - up);
    EventBus.emit('banner', `⬆ เลเวล ${p.level}!`, `HP +${(s.hp ?? 0) - (prev.hp ?? 0)} · สแตมินา +${(s.stamina ?? 0) - (prev.stamina ?? 0)} · โจมตี +${(s.atk ?? 0) - (prev.atk ?? 0)}% · ฟื้นเต็ม`, '#ffcd75');
  }

  private listen(ev: string, fn: (...a: never[]) => void) {
    EventBus.on(ev, fn);
    this.offEvents.push(() => EventBus.off(ev, fn));
  }

  private cleanup() {
    this.offEvents.forEach((f) => f());
    this.offEvents = [];
    this.quests?.destroy();
    this.guide?.destroy();
    this.achievements?.destroy();
    this.creatures?.destroy();
    Sfx.stopMusic();
    Sfx.setRain(0);
  }

  private resetState() {
    this.learned = new Set();
    this.pinned = null;
    this.poolCache = null;
    this.kills = 0;
    this.deathCause = '';
    this.hint = null;
    this.currentSlot = -1;
    this.boss = null;
    this.ward = null;
    this.worldTime = 0;
    this.structures = [];
    this.structureMap.clear();
    this.boats = [];
    this.drops = [];
    this.graves = [];
    this.crates = [];
    this.braziers = [];
    this.signs = [];
    this.stalls = [];
    this.paintedTiles.clear();
    this.removedNodes.clear();
    this.wreckSprite = null;
    this.mailboxSprite = null;
    this.merchantSprite = null;
    this.visited = new Set();
    this.wallet = new Wallet();
    this.autosaveTimer = 60;
    this.gameOverFlag = false;
    this.quests = null;
    this.riding = null;
    this.fishing = null;
    this.offEvents = [];
    this.zoom = getSettings().zoom;
    this.tilt = 0;
    this.specialFx = null;
    this.revives = 0;
    this.adventure = false;
  }

  private buildCrashSite() {
    const w = this.world.wreck;
    if (w) {
      const img = this.add.image(w.tx * 16 + 32, w.ty * 16 + 30, 'wreck').setOrigin(0.5, 1);
      img.setDepth(img.y);
      this.structBlockers.add(img);
      (img.body as Phaser.Physics.Arcade.StaticBody).setSize(46, 10, false).setOffset(6, img.height - 14);
      this.wreckSprite = img;
    }
    for (const c of this.world.crates) {
      const sprite = this.add.image(c.tx * 16 + 8, c.ty * 16 + 15, 'crate').setOrigin(0.5, 1);
      sprite.setDepth(sprite.y);
      this.crates.push({ sprite, tx: c.tx, ty: c.ty, looted: false });
    }
    const m = this.world.mailbox;
    this.mailboxSprite = this.add.image(m.tx * 16 + 8, m.ty * 16 + 16, 'mailbox').setOrigin(0.5, 1).setDepth(m.ty * 16 + 16);
    this.signs.push({ x: m.tx * 16 + 8, y: m.ty * 16 + 16, text: 'ตู้จดหมาย — ของขวัญรายวัน / เงินจากการขาย' });
  }

  /** เกาะกลาง: แผงร้าน 12 แผงรอบลาน + พ่อค้า + เตาไฟ + ป้าย */
  private buildCentral() {
    const c = this.world.slots[CENTER_SLOT]!;
    const cx = c.cx * 16 + 8;
    const cy = c.cy * 16 + 8;
    const stallKeys = ['stall_a', 'stall_b', 'stall_c'];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const x = cx + Math.cos(a) * 10 * 16;
      const y = cy + Math.sin(a) * 9 * 16;
      const img = this.add.image(x, y, stallKeys[i % 3]).setOrigin(0.5, 1).setDepth(y);
      this.structBlockers.add(img);
      (img.body as Phaser.Physics.Arcade.StaticBody).setSize(34, 6, false).setOffset(3, img.height - 7);
      this.stalls.push({ x, y, index: i });
    }
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      const bz = this.add.sprite(cx + dx * 16, cy + dy * 16, 'brazier').setOrigin(0.5, 1).setDepth(cy + dy * 16).play('brazier_burn');
      this.braziers.push(bz);
    }
    this.add.image(cx, cy - 8, 'statue').setOrigin(0.5, 1).setDepth(cy - 8);
    const m = this.add.sprite(cx + 40, cy + 30, 'merchant', 0).setOrigin(0.5, 1).setDepth(cy + 30);
    this.add.image(cx + 40, cy + 29, 'shadow').setDepth(-1);
    this.tweens.add({ targets: m, scaleY: 1.04, yoyo: true, repeat: -1, duration: 900 });
    this.merchantSprite = m;
    for (const [dx, dy, text] of [[0, 17, 'เกาะกลาง — เขตปลอดภัย ห้ามต่อสู้'], [17, 0, 'ตลาดแลกเปลี่ยน: วางขาย/ซื้อของที่แผง'], [-17, 0, 'พ่อค้ากลาง: ซื้อ/ขาย/แลกเพชร']] as [number, number, string][]) {
      const x = cx + dx * 16;
      const y = cy + dy * 16;
      this.add.image(x, y, 'signpost').setOrigin(0.5, 1).setDepth(y);
      this.signs.push({ x, y, text });
    }
  }

  /** เกาะของผู้เล่นคนอื่น (จำลอง): ฐานตามความคืบหน้า + ป้ายชื่อเจ้าของ */
  private decorateOtherIsland(slot: number) {
    const is = this.world.slots[slot];
    if (!is || is.biome === 'central' || slot === this.world.home || !is.owner || slot >= 1000) return;
    const S = this.world.size;
    const land = (x: number, y: number) => !isWater(this.world.tiles[y * S + x]);
    const put = (id: string, dx: number, dy: number) => {
      const def = BUILD[id];
      const tx = is.lx + dx;
      const ty = is.ly + dy;
      for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) if (!land(tx + x, ty + y) || this.structureMap.has(tkey('object', tx + x, ty + y))) return;
      for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) this.clearNodeAt(tx + x, ty + y);
      const s = this.placeStructure(def, tx, ty, true);
      s.setData('foreign', true);
      if (s.def.id === 'campfire') s.fuel = 99999;
    };
    const p = is.progress;
    put('campfire', 0, 3);
    if (p > 0.15) for (const [dx, dy] of [[-3, 0], [-2, 0], [2, 0], [3, 0]]) put('wood_wall', dx, dy);
    if (p > 0.3) put('cabin', -1, -2);
    if (p > 0.4) for (let i = 0; i < 4; i++) put('farm_plot', -4 + i, 5);
    if (p > 0.55) put('workbench', 3, 2);
    if (p > 0.65) put('turret_arrow', -4, -3);
    if (p > 0.75) put('windmill', 3, -3);
    if (p > 0.85) put('stone_house', -1, -6);
    const x = (is.lx + 1) * 16;
    const y = (is.ly + 5) * 16;
    this.add.image(x, y, 'signpost').setOrigin(0.5, 1).setDepth(y);
    this.signs.push({ x, y, text: `${is.name} (แร่เด่น: ${['เหล็ก', 'ถ่าน', 'กำมะถัน', 'ทอง', 'คริสตัล'][['iron', 'coal', 'sulfur', 'gold', 'crystal'].indexOf(is.specialty)]})` });
  }

  /** ลบต้นไม้/หินที่ tile (ใช้ตอนปรับพื้น/สร้างฐาน) */
  clearNodeAt(tx: number, ty: number) {
    const n = this.chunks.at(tx, ty);
    if (n) {
      this.chunks.remove(n);
      this.world.nodes = this.world.nodes.filter((x) => x !== n);
      this.removedNodes.add(n.id);
    }
  }

  /** ซากเครื่องบิน+กล่องรอบจุดเกิด หายไป (เกาะที่พัฒนาแล้ว) */
  removeWreck() {
    this.wreckSprite?.destroy();
    this.wreckSprite = null;
    this.world.wreck = null;
    for (const c of this.crates) c.sprite.destroy();
    this.crates = [];
  }

  // ======================================================================
  // query
  // ======================================================================
  get uiOpen(): boolean {
    return !!this.registry.get('uiOpen');
  }

  /** อยู่บนยานทางน้ำ/ทางอากาศ (นับเป็น "กลางทะเล": งูทะเลโผล่ ไม่โดนภัยบนเกาะ) */
  get boatRiding() {
    return !!this.riding && this.riding.kind !== 'land';
  }

  /** อยู่บนเกาะกลาง = ปลอดภัย (ห้ามต่อสู้) */
  get playerSafe() {
    return this.currentSlot === CENTER_SLOT;
  }

  // ---------------------------------------------------------------- เขตผจญภัย (PvP · ตายถาวร · ของดี)
  /** ช่องนี้เป็นเกาะผจญภัยไหม = มีเกาะ และไม่ใช่เกาะเรา/เกาะกลาง/ดันเจี้ยน (รวมเกาะไบโอม เกาะคนอื่น ซากโบราณ เกาะมหาสมบัติ) */
  isAdventureSlot(slot: number): boolean {
    return slot >= 0 && !isInterior(slot) && slot !== this.world.home && slot !== CENTER_SLOT && !!this.world.slots[slot];
  }

  /** ยืนอยู่บนเกาะผจญภัย (บก/น้ำตื้นในช่องนั้น) และไม่ได้อยู่บนเรือ/ยานบิน — ทะเลเปิดไม่นับ */
  private computeAdventure(): boolean {
    const p = this.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    if (!this.isAdventureSlot(this.world.slotIndexAt(tx, ty)) || this.boatRiding) return false;
    const t = this.tileAt(tx, ty);
    return !isWater(t) || t === TILE.SHALLOW;
  }

  /** อยู่ในเขตผจญภัย: ผู้เล่นอื่น (คู่แข่ง) โจมตีได้ · ตาย = ตายถาวร · ของดรอปดีขึ้น */
  get inAdventure() {
    return this.adventure;
  }

  /** พื้นที่ของจุด (x,y) สำหรับเพดานกล่อง */
  lootZoneAt(x: number, y: number): LootZone {
    const slot = this.world.slotIndexAt(Math.floor(x / 16), Math.floor(y / 16));
    if (slot === this.world.home || isInterior(slot)) return 'home';
    return this.isAdventureSlot(slot) ? 'adventure' : 'neutral';
  }

  /**
   * เพดานกล่อง — ทุกแหล่งกล่องบนแผนที่ต้องผ่านที่นี่ (ไม่รวมรางวัลภารกิจ/ร้านเพชรเกาะกลาง)
   * x,y = จุดที่ของตก (มอน หีบ กล่องร่ม ตกปลา) · ไม่ใส่ = รางวัลของผู้เล่น (ภัยกลางวัน/คืนภัย: นอกเขตผจญภัย = นับเป็นเกาะเรา)
   */
  capBox(tier: BoxTier, source: BoxSource, x?: number, y?: number): BoxTier {
    const zone: LootZone = x === undefined || y === undefined ? (this.adventure ? 'adventure' : 'home') : this.lootZoneAt(x, y);
    return capBoxTier(tier, source, zone);
  }

  /** ถอยออกจากเขตผจญภัย (กด "ถอยกลับ" ตอนเตือนครั้งแรก): ขึ้นยานของเราที่จอดใกล้ๆ ไม่งั้นกลับจุดเกิดบนเกาะเรา */
  retreatFromAdventure() {
    const p = this.player;
    const near = this.boats
      .filter((b) => !b.riding && b.kind !== 'land' && Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < 480)
      .sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) - Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y))[0];
    if (this.riding) this.dismount(true);
    if (near) {
      this.board(near);
      EventBus.emit('toast', `↩ ถอยกลับขึ้น${near.def.name}แล้ว`, '#73eff7');
    } else {
      if (this.riding) {
        this.riding.riding = false;
        this.riding = null;
        p.riding = false;
      }
      const sp = this.world.spawn;
      p.setPosition(sp.tx * 16 + 8, sp.ty * 16 + 8);
      this.cameras.main.flash(300, 11, 13, 31);
      EventBus.emit('toast', '↩ ไม่มียานจอดใกล้ๆ — กลับจุดเกิดบนเกาะของคุณ', '#73eff7');
    }
    this.adventure = false;
  }

  /** ใส่ตัวกันชน (static) ให้ผู้เล่น/มอนชน */
  addBlocker(o: Phaser.GameObjects.GameObject) {
    this.blockers.add(o);
  }

  tileAt(tx: number, ty: number): number {
    return this.world.tileAt(tx, ty);
  }

  isSafeTile(tx: number, ty: number) {
    return this.world.islandAt(tx, ty) === CENTER_SLOT;
  }

  isTileBlocked(tx: number, ty: number): boolean {
    if (this.crates.some((c) => c.tx === tx && c.ty === ty)) return true;
    const w = this.world.wreck;
    if (w && tx >= w.tx && tx < w.tx + 4 && ty >= w.ty && ty < w.ty + 2) return true;
    const n = this.chunks.at(tx, ty);
    return !!(n && n.available && BLOCKING_NODES.has(n.type));
  }

  structureAt(tx: number, ty: number, layer: Layer): Structure | undefined {
    return this.structureMap.get(tkey(layer, tx, ty));
  }

  boatAt(tx: number, ty: number) {
    return this.boats.find((b) => Math.floor(b.x / 16) === tx && Math.floor(b.y / 16) === ty);
  }

  /** node ทั้งหมดในรัศมี (sprite ที่โหลดอยู่) */
  nodesNear(x: number, y: number, r: number, filter: (n: ResourceNode) => boolean): ResourceNode[] {
    const out: ResourceNode[] = [];
    for (const n of this.chunks.activeSprites()) if (n.active && filter(n) && Phaser.Math.Distance.Between(x, y, n.x, n.baseY) < r) out.push(n);
    return out;
  }

  boatList(): Vehicle[] {
    return this.boats;
  }
  dropList(): DroppedItem[] {
    return this.drops;
  }
  nodeNear(x: number, y: number, r: number): ResourceNode | null {
    return this.nearestNode(x, y, r, () => true);
  }

  // ---------- เกาะพิเศษ (เปิดทุก 4 ชม. ครั้งละ 1 ชม.) ----------
  special: SpecialState = specialState();
  private specialKnown: boolean | null = null;
  private specialRound = -1;
  private specialWarned = -1;
  private specialTimer = 0;
  private barrierToastAt = 0;
  private specialFx: { storm: Phaser.GameObjects.Container; beam: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } | null = null;

  /** อยู่ในเขตพายุรอบเกาะพิเศษ (พิกเซลโลก) */
  inSpecialZone(x: number, y: number): boolean {
    const is = this.world.slots[SPECIAL_SLOT];
    if (!is) return false;
    return Math.hypot(x / 16 - is.cx, y / 16 - is.cy) < is.r + 12;
  }

  private buildSpecialFx() {
    const is = this.world.slots[SPECIAL_SLOT];
    if (!is) return;
    const x = is.cx * 16;
    const y = is.cy * 16;
    const R = (is.r + 12) * 16;
    // พายุมิติ (ตอนปิด): วงหมุนสีม่วง
    const g = this.add.graphics();
    g.fillStyle(0x5d275d, 0.22).fillCircle(0, 0, R);
    for (let i = 0; i < 3; i++) {
      g.lineStyle(10 - i * 3, i === 1 ? 0xa77bdb : 0x5d275d, 0.55 - i * 0.12);
      for (let a = 0; a < 8; a++) g.beginPath().arc(0, 0, R - i * 26, (a / 8) * Math.PI * 2, (a / 8) * Math.PI * 2 + 0.5).strokePath();
    }
    const storm = this.add.container(x, y, [g]).setDepth(5e5);
    this.tweens.add({ targets: storm, angle: 360, duration: 24000, repeat: -1 });
    // ลำแสงทอง (ตอนเปิด)
    const beamG = this.add.graphics();
    beamG.fillGradientStyle(0xffcd75, 0xffcd75, 0xffcd75, 0xffcd75, 0, 0, 0.55, 0.55).fillRect(-14, -900, 28, 900);
    beamG.fillStyle(0xfff2b0, 0.35).fillEllipse(0, 0, 90, 28);
    const beam = this.add.container(x, y, [beamG]).setDepth(5e5).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: beam, alpha: 0.55, duration: 900, yoyo: true, repeat: -1 });
    const label = txt(this, x, y - (is.r + 4) * 16, '', 10, '#ffcd75').setOrigin(0.5).setDepth(5e5 + 1).setStroke('#0b0d1f', 3).setResolution(4);
    this.specialFx = { storm, beam, label };
  }

  private updateSpecial(dt: number) {
    this.specialTimer -= dt;
    if (this.specialTimer > 0) return;
    this.specialTimer = 0.5;
    if (!this.specialFx) this.buildSpecialFx();
    const st = specialState();
    this.special = st;
    const fx = this.specialFx;
    if (fx) {
      fx.storm.setVisible(!st.open);
      fx.beam.setVisible(st.open);
      fx.label.setText(st.open ? `✨ ${SPECIAL_NAME} — เปิดอยู่! เหลือ ${fmtLeft(st.msLeft)}` : `🔒 ${SPECIAL_NAME} — เปิดอีก ${fmtLeft(st.msLeft)}`).setColor(st.open ? '#ffcd75' : '#a77bdb');
    }
    if (st.open && st.round !== this.specialRound) {
      this.specialRound = st.round;
      this.refillSpecial();
    }
    if (this.specialKnown !== null && st.open !== this.specialKnown) {
      if (st.open) {
        Sfx.play('achievement');
        EventBus.emit('ui:splash', { art: 'special_island', title: `✨ ${SPECIAL_NAME} เปิดแล้ว!`, sub: 'เปิด 1 ชั่วโมง — นั่งเรือไปทางใต้สุดของแผนที่ (ดูแผนที่ M)', color: '#ffcd75', hold: 3200 });
      } else {
        EventBus.emit('banner', `🌀 ${SPECIAL_NAME} ปิดแล้ว`, 'เปิดอีกครั้งใน 3 ชั่วโมง', '#a77bdb');
        this.ejectFromSpecial();
      }
    }
    if (this.specialKnown === null && !st.open) this.ejectFromSpecial(true);
    this.specialKnown = st.open;
    if (st.open && st.msLeft < 5 * 60_000 && this.specialWarned !== st.round) {
      this.specialWarned = st.round;
      EventBus.emit('toast', `⚠ ${SPECIAL_NAME} จะปิดใน ${fmtLeft(st.msLeft)} — รีบกลับขึ้นเรือ!`, '#ef7d57');
    }
  }

  /** เปิดรอบใหม่: ทรัพยากรบนเกาะเกิดใหม่ทั้งหมด */
  private refillSpecial() {
    for (const n of this.world.nodes) {
      if (this.world.slotIndexAt(n.tx, n.ty) !== SPECIAL_SLOT) continue;
      if (!n.available) n.regrowAt = 0;
      n.hp = -1;
    }
  }

  /** ปิดเกาะ: ผู้เล่น (และเรือของเรา) ที่ยังอยู่ถูกพายุพัดกลับเกาะตัวเอง */
  private ejectFromSpecial(quiet = false) {
    const p = this.player;
    if (!this.inSpecialZone(p.x, p.y)) return;
    if (this.riding) {
      this.riding.riding = false;
      this.riding = null;
      p.riding = false;
    }
    const home = this.world.spawn;
    p.setPosition(home.tx * 16 + 8, home.ty * 16 + 8);
    // ยานที่จอดค้างที่เกาะพิเศษ ย้ายกลับมาจอดใกล้บ้าน (ยานบก → ข้างจุดเกิด)
    const water = this.waterNear(home.tx, home.ty);
    this.boats.filter((b) => this.inSpecialZone(b.x, b.y)).forEach((b, i) => {
      b.riding = false;
      b.vel.set(0, 0);
      if (b.kind === 'land') b.setPosition(home.tx * 16 + 8 + ((i % 4) - 1.5) * 20, home.ty * 16 + 30);
      else if (water) b.setPosition(water.x + i * 28, water.y);
      b.setDepth(b.y);
      b.syncLift();
    });
    this.cameras.main.flash(400, 167, 123, 219);
    if (!quiet) EventBus.emit('toast', '🌀 พายุมิติพัดคุณกลับเกาะของตัวเอง (ของที่เก็บมายังอยู่ครบ)', '#a77bdb');
  }

  /** หาน้ำตื้นใกล้จุดที่กำหนด (ไว้จอดเรือ) */
  private waterNear(tx: number, ty: number): { x: number; y: number } | null {
    for (let r = 4; r < 60; r += 2) {
      for (let a = 0; a < 24; a++) {
        const ang = (a / 24) * Math.PI * 2;
        const x = Math.round(tx + Math.cos(ang) * r);
        const y = Math.round(ty + Math.sin(ang) * r);
        if (this.tileAt(x, y) === TILE.SHALLOW && isWater(this.tileAt(x + 1, y))) return { x: x * 16 + 8, y: y * 16 + 8 };
      }
    }
    return null;
  }

  // ---------- ซ่อมแซม ----------
  /** ค่าซ่อม = 50% ของวัสดุ × สัดส่วนที่เสียหาย (อย่างน้อย 1 ชิ้น) */
  private repairNeeds(st: Structure): [string, number][] {
    const ratio = 1 - Phaser.Math.Clamp(st.hp / st.maxHp, 0, 1);
    if (ratio <= 0) return [];
    return st.def.cost.filter(([, n]) => n > 0).map(([i, n]) => [i, Math.max(1, Math.ceil(this.costOf(n) * 0.5 * ratio))] as [string, number]);
  }

  /** ค่าซ่อมเป็นวัตถุดิบดิบ (ไว้แสดง) — ตอนจ่ายจริงใช้ชิ้นส่วนที่มีอยู่ก่อน */
  repairCost(st: Structure): [string, number][] {
    return rawCostOfBuild(this.repairNeeds(st));
  }

  canRepair(st: Structure): boolean {
    return canAfford(this.repairNeeds(st), this.materials());
  }

  repairStructure(st: Structure, quiet = false): boolean {
    const inv = this.materials(); // กระเป๋า + คลังในฐาน
    const need = this.repairNeeds(st);
    if (!consume(need, inv)) {
      if (!quiet) {
        const miss = missingRaw(need, inv)[0];
        Sfx.play('error', 300);
        EventBus.emit('toast', `ซ่อมไม่ได้ — ขาด${miss ? `${ITEMS[miss[0]].name} ${miss[1]}` : 'วัสดุ'}`, '#ef7d57');
      }
      return false;
    }
    st.repair();
    this.fx.sparks(st.x, st.y - 8, 0xffcd75, 8, 12);
    if (!quiet) {
      Sfx.play('craft');
      EventBus.emit('toast', `🔧 ซ่อม${st.def.name}แล้ว`, '#a7f070');
    }
    return true;
  }

  /** ซ่อมทุกอย่างบนเกาะเรา (ปุ่มในหน้าต่างสร้าง) */
  repairAll(): { done: number; left: number } {
    const list = this.structures.filter((st) => !st.getData('foreign') && st.hp < st.maxHp);
    let done = 0;
    for (const st of list) if (this.repairStructure(st, true)) done++;
    const left = list.length - done;
    if (!list.length) EventBus.emit('toast', 'ทุกอย่างสมบูรณ์ ไม่ต้องซ่อม', '#a7f070');
    else {
      Sfx.play(done ? 'craft' : 'error');
      EventBus.emit('toast', `🔧 ซ่อมแล้ว ${done} ชิ้น${left ? ` · วัสดุไม่พออีก ${left} ชิ้น` : ''}`, done ? '#a7f070' : '#ef7d57');
    }
    return { done, left };
  }

  // ---------- แหล่งวัตถุดิบ: กระเป๋า + คลังในฐาน ----------
  private poolCache: { at: number; n: number; slot: number; pool: MaterialPool } | null = null;

  /**
   * วัตถุดิบที่ใช้สร้าง/คราฟต์/อัพเกรด/ซ่อมได้ = กระเป๋า + ที่เก็บของของเรา (ไม่รวมอาคารผลิต)
   * อยู่บนเกาะบ้าน = ทุกหีบ/โกดังบนเกาะ · ที่อื่น = ในระยะ 16 ช่อง · หักจากกระเป๋าก่อน แล้วคลังที่ใกล้ที่สุด · แคช 1 วิ
   */
  materials(): MaterialPool {
    const p = this.player;
    const slot = this.world.slotIndexAt(Math.floor(p.x / 16), Math.floor(p.y / 16));
    const c = this.poolCache;
    if (c && c.n === this.structures.length && c.slot === slot && this.time.now - c.at < 1000) return c.pool;
    const home = slot === this.world.home;
    const R2 = (16 * 16) ** 2;
    const d2 = (st: Structure) => Phaser.Math.Distance.Squared(p.x, p.y, st.x, st.y);
    const list = this.structures
      .filter((st) => st.storage && !st.def.prod && !st.getData('foreign') && (home ? this.world.slotIndexAt(st.tx, st.ty) === this.world.home : d2(st) < R2))
      .sort((a, b) => d2(a) - d2(b));
    const pool = new MaterialPool(p.inventory, list.map((st) => st.storage!));
    this.poolCache = { at: this.time.now, n: this.structures.length, slot, pool };
    return pool;
  }

  /** ฝากของที่ซ้ำกับในคลัง (ไม่แตะ hotbar / ของที่อัพเกรดหรือมีความทนทาน) · targets ไม่ระบุ = คลังของเราในระยะ ~6 ช่อง · คืนจำนวนชิ้นที่ฝาก */
  quickStack(targets?: Inventory[]): { moved: number; stores: number } {
    const p = this.player;
    const inv = p.inventory;
    const stores = targets ?? this.structures
      .filter((st) => st.storage && !st.def.prod && !st.getData('foreign') && Phaser.Math.Distance.Between(p.x, p.feetY, st.x, st.y - 4) < 96 + st.def.w * 8)
      .map((st) => st.storage!);
    let moved = 0;
    for (const st of stores) {
      const ids = new Set(st.slots.filter((x): x is Slot => !!x && !x.plus).map((x) => x.id));
      for (let i = HOTBAR_SIZE; i < inv.slots.length; i++) {
        const sl = inv.slots[i];
        if (!sl || sl.plus || sl.dur !== undefined || !ids.has(sl.id)) continue;
        const left = st.add(sl.id, sl.qty);
        moved += sl.qty - left;
        if (left <= 0) inv.slots[i] = null;
        else sl.qty = left;
      }
    }
    if (moved) inv.version++;
    return { moved, stores: stores.length };
  }

  // ---------- 📌 ปักหมุดแปลน ----------
  /** แปลนที่ปักไว้: ชื่อ + ของดิบ มี/ต้องใช้ (รวมของในคลัง) */
  pinInfo(): { name: string; rows: { item: string; have: number; need: number; stored: number }[]; ready: boolean } | null {
    const k = this.pinned;
    if (!k) return null;
    let name: string;
    let needs: [string, number][];
    if (k.startsWith('b:')) {
      const d = BUILD[k.slice(2)];
      if (!d) return null;
      name = d.name;
      needs = this.buildNeeds(d);
    } else {
      const r = RECIPES.find((x) => x.id === k.slice(2));
      if (!r) return null;
      name = ITEMS[r.output.item].name;
      needs = recipeNeeds(r, this.player.char.passive.materialCost ?? 1);
    }
    const pool = this.materials();
    const plan = planConsume(needs, pool);
    const bag = this.player.inventory;
    const rows = rawCost(needs).map(([item, need]) => {
      const have = Math.max(0, need - (plan.missing.get(item) ?? 0));
      return { item, have, need, stored: Math.max(0, Math.min(have, pool.count(item)) - bag.count(item)) };
    });
    return { name, rows, ready: plan.ok || this.creative };
  }

  /** สร้าง/คราฟต์ของที่ปักไว้แล้ว → เลิกปักเอง */
  private checkPinDone(key: string) {
    if (this.pinned !== key) return;
    this.pinned = null;
    EventBus.emit('toast', '📌 สร้างของที่ปักหมุดแล้ว — เลิกปักหมุดให้อัตโนมัติ', '#73eff7');
  }

  damagedCount(): number {
    return this.structures.filter((st) => !st.getData('foreign') && st.hp < st.maxHp).length;
  }

  mobList(): Mob[] {
    return [...(this.mobs.getChildren() as Mob[]), ...(this.airMobs.getChildren() as Mob[])];
  }

  structureList(): Structure[] {
    return this.structures;
  }

  /** ราคาวัสดุจริง (ช่างลด 10%) */
  costOf(n: number) {
    const mc = this.player.char.passive.materialCost ?? 1;
    return Math.max(1, Math.floor(n * mc + 0.001));
  }

  /** วัสดุของแปลนสิ่งก่อสร้าง (หักส่วนลดแล้ว — ยังไม่แตกชิ้นส่วน ใช้กับ planConsume/consume) */
  buildNeeds(def: BuildDef): [string, number][] {
    if (this.freeBuilds.has(def.id)) return [];
    return def.cost.filter(([, n]) => n > 0).map(([i, n]) => [i, this.costOf(n)] as [string, number]);
  }

  fireSources() {
    const out: { key: object; x: number; y: number }[] = [];
    for (const s of this.structures) if (s.def.id === 'campfire' && s.lit) out.push({ key: s, x: s.x, y: s.y });
    for (const b of this.braziers) out.push({ key: b, x: b.x, y: b.y - 12 });
    return out;
  }

  airdropMarkers() {
    return this.daily.airdrops.filter((a) => !a.opened).map((a) => ({ x: a.x, y: a.y }));
  }

  nearestStructureTo(x: number, y: number, range: number, filter?: (s: Structure) => boolean): Structure | null {
    let best: Structure | null = null;
    let bd = range;
    for (const s of this.structures) {
      if (s.def.layer !== 'object' || s.getData('foreign') || (filter && !filter(s))) continue;
      const d = Phaser.Math.Distance.Between(x, y, s.x, s.y - 6);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /** make = สร้างคลาสลูกของ Mob เอง (เช่น ผู้รอดชีวิตคู่แข่ง) — def ไม่ต้องอยู่ใน MOBS */
  spawnMob(id: string, x: number, y: number, make?: (x: number, y: number) => Mob): Mob {
    const mob = make ? make(x, y) : new Mob(this, x, y, MOBS[id]);
    const def = mob.def;
    (mobFreeMove(def) ? this.airMobs : this.mobs).add(mob);
    mob.fitBody();
    return mob;
  }

  giveItems(items: [string, number][]) {
    for (const [id, n] of items) this.collect(id, n, this.player.x, this.player.y + 6);
  }

  /** เก็บของเข้ากระเป๋า (เหรียญ/เพชรเข้ากระเป๋าเงิน) — เหลือแล้วตกพื้น */
  /** แปลนที่เรียนรู้แล้ว (นอกจากแปลนพื้นฐาน) */
  learned = new Set<string>();

  /** ช่วงตั้งหลัก (กี่วันแรกยังไม่มีภัยพิบัติ) */
  get inGrace() {
    return !this.showcase && this.dayNight.day <= GRACE_DAYS;
  }
  /** วินาทีที่เหลือของช่วงตั้งหลัก */
  get graceLeft() {
    return Math.max(0, (GRACE_DAYS + 1 - this.dayNight.day - this.dayNight.time) * BALANCE.dayLength);
  }

  /** เลือกแปลนเริ่มต้น: ได้แปลนฐาน + อาวุธ (+แปลนแถม) แล้วปักหมุดฐานไว้เป็นเป้าหมายแรก */
  pickStarter(baseId: string, weaponId: string) {
    const base = STARTER_BASES.find((b) => b.id === baseId);
    const weapon = STARTER_WEAPONS.find((w) => w.id === weaponId);
    if (!base || !weapon) return;
    this.learned.add(`b:${baseId}`);
    this.learned.add(`i:${weaponId}`);
    for (const k of [...(base.bonus ?? []), ...(weapon.bonus ?? [])]) this.learned.add(k);
    // ง่ายขึ้น: ได้อาวุธทันที (ถือไว้ในมือ + กระสุน) และสร้างฐานที่เลือกได้ฟรี 1 หลัง (ไม่ใช้วัตถุดิบ)
    const inv = this.player.inventory;
    inv.add(weaponId, 1);
    const at = inv.slots.findIndex((s) => s?.id === weaponId);
    if (at >= 0 && at < HOTBAR_SIZE) this.player.selected = at;
    const ammo = ITEMS[weaponId]?.ranged?.ammo;
    if (ammo) inv.add(ammo, 40);
    this.freeBuilds.add(baseId);
    this.pinned = null;
    this.starterPicked = true;
    inv.version++;
    this.time.delayedCall(2600, () => this.guide.showControls());
    Sfx.play('achievement');
    this.autosave();
  }

  /** รู้แปลนนี้หรือยัง (b:<id> / i:<id>) */
  knows(key: string) {
    return this.creative || DEFAULT_KNOWN.has(key) || this.learned.has(key) || !BLUEPRINT_ITEM.has(key);
  }

  /** เก็บแปลน → เรียนรู้ทันที · ซ้ำ = แปลงเป็นเหรียญครึ่งราคา */
  private learnBlueprint(id: string, n: number) {
    const key = BLUEPRINT_KEY.get(id) ?? [...BLUEPRINT_ITEM].find(([, v]) => v === id)?.[0];
    if (!key) return;
    let dup = 0;
    for (let i = 0; i < n; i++) {
      if (this.learned.has(key)) dup++;
      else {
        this.learned.add(key);
        Sfx.play('achievement');
        EventBus.emit('toast', `📐 ได้แปลนใหม่: ${ITEMS[id].name.replace('แปลน: ', '')} — เปิดสมุดแปลน (B) เพื่อสร้าง`, '#73eff7');
      }
    }
    if (dup) {
      const coins = Math.round((ITEMS[id].value / 2) * dup);
      this.wallet.add(coins);
      EventBus.emit('toast', `📐 แปลนซ้ำ → แลกเป็น ${coins} เหรียญ`, '#ffcd75');
    }
    this.player.inventory.version++; // ให้สมุดแปลนอัปเดต
    EventBus.emit('pickup', id, n);
  }

  collect(id: string, n: number, x: number, y: number) {
    if (ITEMS[id]?.type === 'blueprint') return this.learnBlueprint(id, n);
    if (id === 'coin' || id === 'gem') {
      this.wallet.add(id === 'coin' ? n : 0, id === 'gem' ? n : 0);
      EventBus.emit('pickup', id, n);
      return;
    }
    const left = this.player.inventory.add(id, n);
    if (n - left > 0) EventBus.emit('pickup', id, n - left);
    if (left > 0) this.spawnDrop(x, y, id, left);
  }

  // ======================================================================
  // กล้อง: ซูม + มุม 2.5D
  // ======================================================================
  setZoom(z: number) {
    this.zoom = Phaser.Math.Clamp(z, 1.25, 5);
    this.applyCamera();
    this.cullTimer = 0;
  }

  setTilt(t: number) {
    const cam = this.cameras.main;
    const webgl = this.renderer.type === Phaser.WEBGL;
    // คุณภาพต่ำ: ไม่มีมุม 2.5D (ประหยัด post-effect ทั้งจอ)
    if (t > 0 && !qualityKnobs().tilt) {
      EventBus.emit('toast', '🎥 คุณภาพภาพ "ต่ำ" ปิดมุม 2.5D ไว้ (เปลี่ยนได้ในตั้งค่า)', '#94b0c2');
      t = 0;
    }
    this.tilt = webgl ? Phaser.Math.Clamp(t, 0, 0.9) : 0;
    if (this.tilt > 0) {
      let p = cam.getPostPipeline('TiltPipeline') as TiltPipeline | TiltPipeline[] | undefined;
      if (!p || (Array.isArray(p) && !p.length)) {
        cam.setPostPipeline('TiltPipeline');
        p = cam.getPostPipeline('TiltPipeline') as TiltPipeline | TiltPipeline[];
      }
      const inst = Array.isArray(p) ? p[0] : p;
      if (inst) inst.tilt = this.tilt;
    } else cam.resetPostPipeline();
    this.applyCamera();
    EventBus.emit('toast', this.tilt > 0 ? '🎥 มุมมอง 2.5D (V เพื่อสลับ)' : '🎥 มุมมองบนลงล่าง', '#94b0c2');
  }

  private applyCamera() {
    const cam = this.cameras.main;
    // มุมเอียงเห็นพื้นที่มากขึ้น → ซูมเพิ่มนิดหน่อยให้ตัวละครไม่เล็กเกิน
    cam.setZoom(this.zoom * (1 + this.tilt * 0.25));
    // ให้ผู้เล่นอยู่ค่อนล่างของจอเมื่อเอียง
    const k = this.tilt * 2.2;
    const gp = 0.42 / (1 + k - k * 0.42);
    cam.setFollowOffset(0, this.tilt > 0 ? (0.5 - gp) * (cam.height / cam.zoom) : 0);
  }

  /** ตำแหน่งเมาส์ในโลก (รองรับมุม 2.5D) */
  pointerWorld(pointer = this.input.activePointer): Phaser.Math.Vector2 | null {
    const cam = this.cameras.main;
    let sx = pointer.x;
    let sy = pointer.y;
    if (this.tilt > 0) {
      const m = tiltMap(sx / cam.width, sy / cam.height, this.tilt);
      if (!m) return null;
      sx = m.x * cam.width;
      sy = m.y * cam.height;
    }
    return cam.getWorldPoint(sx, sy);
  }

  private handlePinch() {
    const p1 = this.input.pointer1;
    const p2 = this.input.pointer2;
    if (p1?.isDown && p2?.isDown && !this.ui.isPointerOverUI(p1)) {
      const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
      if (this.pinch > 0) this.setZoom(this.zoom * (d / this.pinch));
      this.pinch = d;
    } else this.pinch = 0;
  }

  // ======================================================================
  // loop
  // ======================================================================
  update(_time: number, deltaMs: number) {
    if (this.gameOverFlag) return;
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.worldTime += dt;
    const p = this.player;
    const uiOpen = this.uiOpen;
    const c = this.controls;
    const pointer = this.input.activePointer;
    const wp = this.pointerWorld();

    this.handlePinch();
    c.pollPad();
    if (c.pressed('pad_bag')) EventBus.emit('pad:bag');
    if (c.pressed('pad_menu')) EventBus.emit('pad:menu');
    if (c.pressed('pad_tilt')) this.setTilt(this.tilt > 0 ? 0 : 0.6);
    if (c.pressed('auto')) EventBus.emit('ui:auto');
    this.auto.update(dt);
    this.guide.update(dt);
    if (c.pressed('zoomin')) this.setZoom(this.zoom * 1.15);
    if (c.pressed('zoomout')) this.setZoom(this.zoom / 1.15);
    if (!uiOpen) {
      if (c.padMode) {
        const mv = c.move();
        if (c.padAim) p.aim.copy(c.padAim);
        else if (mv.lengthSq() > 0.05) p.aim.copy(mv).normalize();
        const t = this.autoTarget();
        if (t && !c.padAim && c.held('attack')) p.aimAt(t.x, t.y);
      } else if (c.touchMode) {
        const mv = c.move();
        if (mv.lengthSq() > 0.05) p.aim.copy(mv).normalize();
        const t = this.autoTarget();
        if (t && (c.touch.held.has('attack') || c.touch.pressed.has('attack'))) p.aimAt(t.x, t.y);
      } else if (wp) p.aimAt(wp.x, wp.y);
      const hb = c.hotbarPressed();
      if (hb >= 0) p.selected = hb;
      const cyc = c.hotbarCycle();
      if (cyc) p.selected = (p.selected + cyc + HOTBAR_SIZE) % HOTBAR_SIZE;
    }

    this.tickVehicles(dt);
    if (this.riding) this.updateBoat(dt);
    else p.update(dt, c, uiOpen, this.environment());

    if (!uiOpen) {
      if (c.pressed('interact')) this.interact();
      if (c.pressed('skill')) this.useSkill();
      if (c.pressed('use')) this.useHeld();
      const overUI = this.ui?.isPointerOverUI(pointer) ?? false;
      const mouseAttack = !c.touchMode && !c.padMode && pointer.leftButtonDown() && !overUI && !this.build.on;
      const touchAttack = c.touch.held.has('attack') || c.touch.pressed.delete('attack');
      const heldDef = p.held ? ITEMS[p.held.id] : undefined;
      const attackish = !this.build.on && (!heldDef || ['tool', 'weapon', 'ranged', 'material', 'light', 'seed', 'ammo'].includes(heldDef.type));
      const padAttack = c.padMode && (attackish ? c.held('attack') : c.pressed('attack'));
      if (mouseAttack || touchAttack || padAttack) {
        if (this.riding) this.vehicleShoot();
        else this.primaryAction(touchAttack || padAttack);
      }
    }

    this.dayNight.update(dt);
    this.burnTorch(dt);
    this.buffTimer -= dt;
    if (this.buffTimer <= 0) this.refreshBaseBuffs();
    this.updateSpecial(dt);
    this.interiors.update();
    this.hazards.update(dt);
    this.biomeFx.update(dt);
    this.player.thirstMult = this.shelter.inside ? 1 : this.hazards.thirstMult; // ในบ้าน: คลื่นความร้อนไม่ทำให้กระหาย
    this.player.envSpeed = this.biomeFx.speedMult * (this.shelter.inside ? 1 : this.hazards.speedMult); // โคลน · น้ำท่วม · พายุทราย/หิมะ
    const view = this.cameras.main.worldView;
    this.chunksR.update(dt, view);
    this.chunks.update(dt, view, this.worldTime);
    for (const m of this.mobList()) m.update(dt);
    this.updateStructures(dt);
    this.shelter.update(dt);
    this.updateDrops(dt);
    this.updateShots(dt);
    this.updateWeaponAreas(dt);
    this.updateWard(dt);
    this.updateFishing(dt);
    this.spawner.update(dt);
    this.creatures.update(dt);
    this.rivals.update(dt);
    this.disaster.update(dt);
    this.updateZones(dt);
    this.build.update(wp?.x ?? -999, wp?.y ?? -999);
    // ลากวางต่อเนื่อง (กำแพง/พื้น/รั้ว/ภูมิทัศน์ ขนาด 1×1)
    const ba = this.build.active;
    if (ba && ba.w === 1 && ba.h === 1 && wp && !c.touchMode && pointer.leftButtonDown() && !(this.ui?.isPointerOverUI(pointer) ?? true)) {
      const key = `${Math.floor(wp.x / 16)},${Math.floor(wp.y / 16)}`;
      if (key !== this.lastBuildTile && !this.build.check(ba, Math.floor(wp.x / 16), Math.floor(wp.y / 16))) {
        this.lastBuildTile = key;
        this.build.place(wp.x, wp.y);
      }
    }
    this.inspect.update(dt);
    this.upgrades.update(dt);
    this.hint = this.computeHint();
    this.weather.update(dt, this.currentBiome);

    const lights: LightSource[] = [{ x: p.x, y: p.y, radius: p.lightRadius }];
    for (const f of this.fireSources()) lights.push({ x: f.x, y: f.y - 6, radius: BALANCE.campfireLight });
    for (const s of this.structures) if (s.def.id !== 'campfire' && s.lightRadius > 0) lights.push({ x: s.x, y: s.y - 10, radius: s.lightRadius });
    lights.push(...this.interiors.lights(), ...this.biomeFx.lights(), ...this.hazards.lights());
    const dark = Math.max(this.dayNight.darkness, this.weather.intensity * 0.35, p.sanity < 30 ? 0.3 : 0, this.interiors.darkness, this.hazards.darkness, this.biomeFx.darkness);
    this.lighting.update(dt, dark, this.dayNight.isBloodMoon || (this.disaster.active && this.disaster.current?.id === 'demon_night'), lights, this.hazards.darkTint ?? this.disaster.darkTint);
    this.ambient.update(dt);

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = 60;
      this.autosave();
      // ออนไลน์: บอกเซิร์ฟเวอร์ว่ายังเล่นอยู่ (เลเวล/พลัง บนแผนที่โลก) + รับรายชื่อผู้เล่นล่าสุด
      if (!this.showcase) getRoomService().heartbeat({ level: p.level, power: p.power, alive: !p.dead });
    }
    if (p.hp <= 0) this.respawn();
    this.fpsWatch.update(dt, this.game.loop.actualFps);
    if (--this.cullTimer <= 0) {
      this.cullTimer = 3;
      this.cullOffscreen();
    }
  }

  /**
   * ไม่ส่งของที่อยู่นอกจอไปวาด (สิ่งก่อสร้าง ต้นไม้ มอน แถบ HP ป้ายชื่อ ฯลฯ — ทั้งเกาะมีหลายร้อยชิ้น เห็นจริงไม่กี่สิบ)
   * ใช้ cameraFilter ของกล้องหลักแทน visible → ไม่ไปทับสถานะซ่อน/แสดงที่ระบบอื่นตั้งไว้
   */
  private cullOffscreen() {
    const cam = this.cameras.main;
    const v = cam.worldView;
    const id = cam.id;
    const m = 40;
    const x0 = v.x - m;
    const y0 = v.y - m;
    const x1 = v.right + m;
    const y1 = v.bottom + m;
    for (const o of this.children.list) {
      if (!(o instanceof Phaser.GameObjects.Sprite || o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Shape || o instanceof Phaser.GameObjects.Text) || o.scrollFactorX !== 1) continue;
      const w = o.displayWidth;
      const h = o.displayHeight;
      const l = o.x - w * o.originX;
      const t = o.y - h * o.originY;
      const out = l > x1 || l + w < x0 || t > y1 || t + h < y0;
      o.cameraFilter = out ? o.cameraFilter | id : o.cameraFilter & ~id;
    }
  }

  get currentBiome(): string {
    return this.world.slots[this.currentSlot]?.biome ?? 'home';
  }

  private environment() {
    const p = this.player;
    const is = this.world.slots[this.currentSlot];
    const temp = is ? BIOMES[is.biome].temp : ([22, 14] as [number, number]);
    const dn = this.dayNight;
    const nightK = dn.darkness / 0.88;
    // ในเขตปลอดภัยของบ้าน: คลื่นความร้อน/ความหนาวฉับพลันไม่มีผล
    const ambient = temp[0] + (temp[1] - temp[0]) * nightK + (this.shelter?.inside ? 0 : this.hazards?.tempShift ?? 0);
    let warmth = p.holdingTorch ? BALANCE.torchWarmth : 0;
    let lit = p.holdingTorch;
    for (const s of this.structures) {
      const w = s.def.warmth ?? 0;
      const lr = s.lightRadius;
      if (!w && !lr) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, s.x, s.y - 4);
      if (w && (s.def.id !== 'campfire' || s.lit) && d < 70 + s.def.w * 8) warmth = Math.max(warmth, w * (1 - d / 100));
      if (lr && d < lr) lit = true;
    }
    for (const b of this.braziers) if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) < 90) lit = true;
    const raining = this.weather.raining && is?.biome !== 'desert' && is?.biome !== 'snow' && is?.biome !== 'glacier';
    return { ambient, warmth, raining, dark: dn.darkness > 0.5, lit, survival: !this.creative };
  }

  private updateZones(dt: number) {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0) return;
    this.zoneTimer = 0.4;
    Sfx.setMusicScene({ boss: !!this.boss, raid: this.disaster.active, hazard: !!this.hazards?.current, dungeon: this.interiors.darkness > 0, market: this.playerSafe, adventure: this.adventure }); // เพลงตามสถานการณ์
    const p = this.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    const slot = this.world.islandAt(tx, ty);
    if (slot >= 0 && slot !== this.currentSlot) {
      this.currentSlot = slot;
      const is = this.world.slots[slot]!;
      const b = BIOMES[is.biome];
      EventBus.emit('island:enter', is.biome);
      if (slot >= 1000) return; // แมพย่อย: แบนเนอร์แสดงตอนวาร์ปเข้าแล้ว
      const bName = is.biome === 'home' && slot !== this.world.home ? 'เกาะผู้รอดชีวิต' : b.name;
      const bDesc = `${is.biome === 'home' && slot !== this.world.home ? 'เกาะทุ่งหญ้าของผู้เล่นคนอื่น' : b.desc}${this.isAdventureSlot(slot) ? ' · ⚔ เขตผจญภัย' : ''}`;
      // ขึ้นเกาะไบโอมนี้ครั้งแรก = การ์ดภาพเต็มจอ (เก็บใน visited เป็น `b:<ไบโอม>`)
      const firstBiome = slot !== this.world.home && !NO_LAND_CARD.has(is.biome) && !this.visited.has(`b:${is.biome}`);
      if (firstBiome) this.visited.add(`b:${is.biome}`);
      if (slot === CENTER_SLOT) EventBus.emit('ui:splash', { art: 'market_island', title: is.name, sub: b.desc, color: b.color });
      else if (firstBiome) EventBus.emit('ui:splash', { art: `isl_${is.biome}`, title: `🏝 ${b.name}`, sub: `${b.desc}${b.tip ? ` · ${b.tip}` : ''} · ${SHAPE_NAMES[is.shape.kind]} · ⚔ เขตผจญภัย`, color: b.color, hold: 3600 });
      else EventBus.emit('banner', is.name, `${bName} · ${bDesc}`, b.color);
      if (slot !== this.world.home && slot !== CENTER_SLOT) EventBus.emit('island:visit_other', slot);
      if (!this.visited.has(String(slot))) {
        this.visited.add(String(slot));
        MetaSave.bump('islandsVisited', [...this.visited].filter((k) => !k.startsWith('b:')).length, 'max');
      }
      if (slot === CENTER_SLOT) {
        // เขตปลอดภัย: ไล่มอนสเตอร์ทั้งหมดออก
        for (const m of this.mobList()) if (m.hostile && this.isSafeTile(Math.floor(m.x / 16), Math.floor(m.y / 16))) m.destroy();
      }
    }
    // เขตผจญภัย: เข้า/ออก
    const adv = p.dead ? this.adventure : this.computeAdventure();
    if (adv !== this.adventure) {
      this.adventure = adv;
      const name = this.world.slots[this.world.slotIndexAt(tx, ty)]?.name ?? '';
      if (adv && !MetaSave.load().adventureSeen) EventBus.emit('ui:adventure', name);
      else if (adv) EventBus.emit('ui:adventure_enter', name);
      else EventBus.emit('toast', '🛡 ออกจากเขตผจญภัยแล้ว', '#a7f070');
      EventBus.emit('adventure:change', adv);
    }
    // เปิด/ปิดประตูเมื่อผู้เล่นเข้าใกล้
    for (const s of this.structures) {
      if (s.def.blocks === 'mobs') s.setDoorOpen(Phaser.Math.Distance.Between(p.x, p.feetY, s.x, s.y - 4) < 22);
    }
  }

  // ======================================================================
  // ผู้เล่น: โจมตี / ใช้ของ / โต้ตอบ
  // ======================================================================
  private onPointerDown(pointer: Phaser.Input.Pointer) {
    Sfx.unlock();
    if (this.gameOverFlag || this.ui.isPointerOverUI(pointer)) return;
    const wp = this.pointerWorld(pointer);
    if (!wp) return;
    if (this.controls.touchMode) {
      // มือถือ: จิ้มที่ของบนแผนที่ = ดูข้อมูล
      if (!this.build.on) this.inspect.pick(wp.x, wp.y);
      return;
    }
    if (pointer.rightButtonDown()) {
      if (this.build.on) this.build.cancel();
      return;
    }
    if (this.build.demolish) return this.build.demolishAt(wp.x, wp.y);
    if (this.build.upgrade) return this.build.upgradeAt(wp.x, wp.y);
    if (this.build.active) {
      this.lastBuildTile = `${Math.floor(wp.x / 16)},${Math.floor(wp.y / 16)}`;
      return this.build.place(wp.x, wp.y);
    }
    const def = this.player.held ? ITEMS[this.player.held.id] : undefined;
    if (def && ['food', 'heal', 'armor', 'box', 'cosmetic'].includes(def.type)) this.useHeld();
    else if (def?.type === 'rod') this.interact();
  }

  /** ปุ่มหลักบนมือถือ — วางของในโหมดสร้างตรงหน้าผู้เล่น */
  buildAtFront() {
    const p = this.player;
    const x = p.x + p.aim.x * 20;
    const y = p.feetY + p.aim.y * 20;
    if (this.build.demolish) this.build.demolishAt(x, y);
    else if (this.build.upgrade) this.build.upgradeAt(x, y);
    else this.build.place(x, y);
  }

  private primaryAction(touch: boolean) {
    if (touch && this.build.on) {
      this.buildAtFront();
      this.controls.touch.held.delete('attack');
      return;
    }
    const def = this.player.held ? ITEMS[this.player.held.id] : undefined;
    const weapon = this.player.weaponRef;
    const ranged = !!weapon && !!ITEMS[weapon.slot.id].ranged;
    if (def?.type === 'throw') this.throwBomb();
    else if (!def || ['tool', 'weapon', 'ranged', 'material', 'light', 'seed', 'ammo'].includes(def.type)) {
      if (ranged) this.shoot();
      else this.attack();
    }
    else if (touch) {
      if (def.type === 'rod') this.interact();
      else this.useHeld();
      this.controls.touch.held.delete('attack');
    }
  }

  private autoTarget(): Mob | null {
    const p = this.player;
    let best: Mob | null = null;
    let bd = 70;
    for (const m of this.mobList()) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y);
      if (d < bd && m.hostile) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  private noFight(): boolean {
    if (!this.playerSafe) return false;
    EventBus.emit('toast', '🕊 เกาะกลางเป็นเขตปลอดภัย — ห้ามต่อสู้', '#a7f070');
    this.player.attackCd = 1;
    return true;
  }

  // ---------------------------------------------------------------- ระบบอาวุธ (ดู data/weapons.ts)
  /** คอมโบ (มีด/สนับมือ): ตีโดนต่อเนื่องภายใน 1.1 วิ แรงขึ้นทีละ 10% */
  private combo = 0;
  private comboAt = -9;
  /** นับครั้งฟันโดน (ดาบเทพธารน้ำแข็ง) */
  private novaCount = 0;
  private venomCd = 0;
  /** พื้นที่ค้างบนพื้นจากอาวุธ: กองไฟ / หมอกพิษ / ควัน / หลุมดำ */
  private weaponAreas: { x: number; y: number; r: number; t: number; kind: 'fire' | 'poison' | 'smoke' | 'vortex'; power: number; tick: number; mark: Phaser.GameObjects.Ellipse }[] = [];

  attack() {
    const p = this.player;
    const held = p.weaponRef?.slot ?? null;
    const def = held ? ITEMS[held.id] : undefined;
    const cls = classOf(def);
    const stam = BALANCE.attackStamina * (cls.stamina ?? 1);
    if (p.attackCd > 0 || p.stamina < stam || p.isDodging) return;
    p.attackCd = p.attackCooldown / (cls.speed ?? 1);
    p.stamina -= stam;
    p.startSwing();
    Sfx.play('swing');
    const tool = p.tool;
    const atkMult = p.char.stats.damageMult * (1 + p.stats.atk / 100);
    const reach = tool.range + 12;
    const angle = p.aim.angle();
    this.swingFx(def?.weaponClass, angle, reach, this.weaponColor(held?.id, def));

    let hitMob = false;
    if (!this.playerSafe) {
      const targets = this.mobsInArc(p.x, p.y, angle, reach, cls.arc ?? 1.1, cls.maxHits ?? 3);
      if (targets.length) {
        hitMob = true;
        if (cls.combo) {
          this.combo = this.worldTime - this.comboAt < 1.1 ? Math.min(this.combo + 1, 6) : 1;
          this.comboAt = this.worldTime;
        }
        const comboMult = cls.combo ? 1 + (this.combo - 1) * 0.1 : 1;
        targets.forEach((m, i) => {
          // ปลายแส้คริแรง · เป้าตัวถัดไปโดนเบาลง (หอกทะลุแนวเสียน้อยกว่า)
          const tip = !!cls.tipCrit && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) > reach * 0.65;
          const fall = i === 0 ? 1 : def?.weaponClass === 'spear' ? 0.85 : 0.75;
          this.hitMob(m, tool.damage * atkMult * comboMult * fall, def?.effect, { def, tip });
        });
        if (def?.special === 'frostnova' && ++this.novaCount % 4 === 0) this.frostNova(p.x, p.y, tool.damage * atkMult);
        if (def?.special === 'bladestorm' && this.combo >= 5) {
          this.combo = 0;
          this.bladeStorm(tool.damage * atkMult, def);
        }
      }
      if (def?.effect === 'shockwave') {
        this.fx.ring(p.x, p.y + 4, 0xffcd75, 40);
        this.cameras.main.shake(140, 0.006);
        for (const m of this.mobList()) if (Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < 44) this.hitMob(m, tool.damage * atkMult * 0.5, undefined);
      }
    }

    // ตัดไม้/ขุด: จุดกระทบไม่ไกลเกินระยะเครื่องมือปกติ (แส้ไม่ตัดไม้ข้ามจอ)
    const nr = Math.min(tool.range, 24) * 0.8;
    const cx = p.x + p.aim.x * nr;
    const cy = p.y + 3 + p.aim.y * nr;
    let used = hitMob;
    if (!hitMob) {
      const node = this.nearestNode(cx, cy, 15, (n) => n.available);
      if (node) {
        if (node.spec.harvest === 'pick') this.pick(node);
        else {
          const power = tool[node.spec.harvest] * (1 + p.stats.gather / 100);
          if (power <= 0 || (node.spec.minPower && power < node.spec.minPower)) {
            Sfx.play('error', 300);
            EventBus.emit('toast', node.spec.minPower && power > 0 ? 'ต้องใช้อีเต้อที่ดีกว่านี้ (ดูคู่มือ J)' : node.spec.harvest === 'tree' ? 'ใช้มือหรือขวาน' : 'ต้องใช้อีเต้อทุบ', '#ef7d57');
          } else {
            used = true;
            const col = node.spec.sound === 'wood' ? 0x8a5a35 : node.spec.sound === 'rock' ? 0x94b0c2 : 0x38b764;
            this.fx.debris(node.x, node.baseY - 6, col, 4);
            Sfx.play(node.spec.sound === 'rock' ? 'hitRock' : 'hitWood');
            if (node.hit(power, this.worldTime)) {
              Sfx.play(node.spec.sound === 'rock' ? 'breakRock' : 'breakWood');
              this.fx.debris(node.x, node.baseY - 8, col, 10);
              this.dropFromNode(node);
              EventBus.emit('node:harvested', node.kind);
            }
          }
        }
      } else if (!hitMob && this.playerSafe) this.noFight();
    }
    if (used && held && def?.tool && p.wearWeapon(1)) EventBus.emit('toast', `${def.name} พังแล้ว!`, '#b13e53');
  }

  /** มอนในวงฟัน (กรวยตามทิศเล็ง) เรียงใกล้→ไกล · ชิดตัวมากโดนเสมอ */
  private mobsInArc(x: number, y: number, angle: number, reach: number, arc: number, max: number): Mob[] {
    const out: { m: Mob; d: number }[] = [];
    for (const m of this.mobList()) {
      if (!m.active) continue;
      const dx = m.x - x;
      const dy = m.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach + (m.isBoss ? 16 : 0)) continue;
      if (d > 10 && Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle)) > arc + 0.15) continue;
      out.push({ m, d });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max).map((o) => o.m);
  }

  /** สีรอยฟันตามวัสดุอาวุธ */
  private weaponColor(id: string | undefined, def?: ItemDef): number {
    if (def?.rarity === 'legendary') return RARITY.legendary.hex;
    if (!id) return 0xffffff;
    const st = def?.status?.[0]?.kind;
    if (st === 'burn') return 0xef7d57;
    if (st === 'freeze') return 0x73eff7;
    if (st === 'poison') return 0xa7f070;
    if (id.startsWith('crystal') || id.startsWith('shadow')) return 0xa77bdb;
    if (id.startsWith('gold')) return 0xffcd75;
    if (id.startsWith('iron') || id.startsWith('chain')) return 0x73eff7;
    return 0xffffff;
  }

  /** เอฟเฟกต์การฟันตามชนิดอาวุธ */
  private swingFx(cls: WeaponClass | undefined, angle: number, reach: number, color: number) {
    const p = this.player;
    const depth = p.depth + 1;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = p.x + cos * 6;
    const sy = p.y + 2 + sin * 6;
    const slash = (a: number, scale: number, dur = 150) => {
      const fx = this.add.image(sx, sy, 'slash').setRotation(a).setDepth(depth).setTint(color).setScale(scale);
      this.tweens.add({ targets: fx, alpha: 0, scale: scale * 1.2, duration: dur, onComplete: () => fx.destroy() });
    };
    switch (cls) {
      case 'spear':
      case 'whip': {
        const g = this.add.graphics().setDepth(depth);
        const len = reach - 4;
        if (cls === 'spear') {
          g.lineStyle(2, color, 0.9).lineBetween(sx, sy, p.x + cos * len, p.y + 2 + sin * len);
          this.fx.sparks(p.x + cos * len, p.y + 2 + sin * len, color, 2, 6);
        } else {
          // แส้: เส้นโค้งสะบัด + ประกายปลายแส้
          g.lineStyle(1, 0xc28a50, 1).beginPath().moveTo(sx, sy);
          for (let i = 1; i <= 12; i++) {
            const t = i / 12;
            const off = Math.sin(t * Math.PI) * 6 * (1 - t * 0.5);
            g.lineTo(sx + cos * len * t - sin * off, sy + sin * len * t + cos * off);
          }
          g.strokePath();
          this.fx.sparks(sx + cos * len, sy + sin * len, 0xffcd75, 3, 8);
        }
        this.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
        break;
      }
      case 'greatsword':
      case 'scythe':
        slash(angle - 0.55, 1.45, 200);
        slash(angle + 0.55, 1.45, 200);
        this.fx.slash(sx, sy, angle, color, depth, true);
        break;
      case 'dagger':
        slash(angle + (this.combo % 2 ? 0.45 : -0.45), 0.75, 110);
        break;
      case 'fist': {
        const tx = p.x + cos * 14;
        const ty = p.y + 2 + sin * 14;
        this.fx.ring(tx, ty, color, 7);
        this.fx.sparks(tx, ty, color, 3, 8);
        break;
      }
      case 'axe':
      case 'mace':
        this.fx.slash(sx, sy, angle, color, depth, true);
        break;
      default:
        this.fx.slash(sx, sy, angle, color, depth, reach > 32);
    }
  }

  /** ตีมอน + ชนิดอาวุธ (คริ/ผลัก/ทะลุเกราะ) + สถานะ + เอฟเฟกต์อาวุธเทพ */
  private hitMob(m: Mob, base: number, effect?: string, o: { def?: ItemDef; tip?: boolean } = {}) {
    const p = this.player;
    const def = o.def;
    const cls = classOf(def);
    const critPct = p.stats.crit + (cls.crit ?? 0) + (def?.critBonus ?? 0) + (o.tip ? 25 : 0);
    const crit = Math.random() < BALANCE.critChance + critPct / 100;
    const dmg = base * (crit ? BALANCE.critMult : 1) * Phaser.Math.FloatBetween(0.9, 1.1);
    m.hurt(dmg, p, { crit, knock: (cls.knock ?? 1) * (def?.knockback ?? 1), armorPierce: cls.armorPierce });
    if (p.stats.lifesteal > 0) p.heal(dmg * p.stats.lifesteal / 100);
    this.fx.sparks(m.x, m.y, crit ? 0xffcd75 : 0xffffff, crit ? 10 : 5);
    this.fx.ring(m.x, m.y, crit ? 0xffcd75 : 0xf4f4f4, crit ? 16 : 10);
    Sfx.play(crit ? 'crit' : 'hit');
    this.fx.hitStop(crit ? 90 : (cls.speed ?? 1) < 0.8 ? 70 : 45);
    if (crit) this.cameras.main.shake(90, 0.004);
    this.applyWeaponStatus(m, def, dmg);
    if (effect === 'lifesteal') {
      p.heal(dmg * 0.15);
      this.fx.damageNumber(p.x, p.y - 12, dmg * 0.15, 0xa7f070);
    }
    if (effect === 'burn') m.applyStatus('burn', 4, Math.max(8, dmg * 0.15));
    if (effect === 'chain') this.chainLightning(m, dmg * 0.5, 3);
    if (def?.chain) this.chainLightning(m, dmg * 0.5, def.chain);
    if (def?.special === 'venom' && this.venomCd <= 0) {
      this.venomCd = 0.8;
      this.addWeaponArea(m.x, m.y + 4, 30, 'poison', 2.5, Math.max(4, dmg * 0.08));
    }
  }

  /** สุ่มใส่สถานะจากชนิดอาวุธ + ตัวอาวุธ */
  private applyWeaponStatus(m: Mob, def: ItemDef | undefined, dmg: number) {
    const cs = classOf(def).status;
    const list = cs ? [cs, ...(def?.status ?? [])] : def?.status;
    if (!list) return;
    for (const s of list) if (m.active && Math.random() < s.chance) m.applyStatus(s.kind, s.dur, s.power ?? statusPower(s.kind, dmg));
  }

  /** สายฟ้ากระโดดไปหาศัตรูใกล้ๆ */
  private chainLightning(m: Mob, dmg: number, jumps: number) {
    let from = { x: m.x, y: m.y };
    const hit = new Set([m]);
    for (let i = 0; i < jumps; i++) {
      const next = this.mobList().find((o) => !hit.has(o) && o.active && Phaser.Math.Distance.Between(from.x, from.y, o.x, o.y) < 60);
      if (!next) break;
      hit.add(next);
      const g = this.add.graphics().setDepth(1e6 + 4);
      g.lineStyle(2, 0x73eff7, 1).beginPath().moveTo(from.x, from.y - 4);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        g.lineTo(from.x + (next.x - from.x) * t + Phaser.Math.Between(-4, 4), from.y - 4 + (next.y - from.y) * t + Phaser.Math.Between(-4, 4));
      }
      g.lineTo(next.x, next.y - 4).strokePath();
      this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
      next.hurt(dmg, from, { color: 0x73eff7, knock: 0.3 });
      this.fx.sparks(next.x, next.y - 4, 0xc8f4ff, 4, 10);
      from = { x: next.x, y: next.y };
    }
  }

  /** ดาบเทพธารน้ำแข็ง: คลื่นเยือกแข็งรอบตัว */
  private frostNova(x: number, y: number, dmg: number) {
    this.fx.ring(x, y + 2, 0x73eff7, 56);
    this.time.delayedCall(90, () => this.fx.ring(x, y + 2, 0xc8f4ff, 40));
    this.fx.sparks(x, y, 0xc8f4ff, 18, 50);
    this.cameras.main.shake(120, 0.004);
    Sfx.play('splash');
    for (const m of this.mobList()) {
      if (Phaser.Math.Distance.Between(x, y, m.x, m.y) > 56) continue;
      m.hurt(dmg * 0.5, { x, y }, { color: 0x73eff7 });
      m.applyStatus('freeze', 2, 1);
    }
  }

  /** เขี้ยวคู่ราหู: ใบมีดหมุนรอบตัว */
  private bladeStorm(dmg: number, def: ItemDef) {
    const p = this.player;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const fx = this.add.image(p.x + Math.cos(a) * 16, p.y + Math.sin(a) * 12, 'slash').setRotation(a + Math.PI / 2).setDepth(p.depth + 1).setTint(0xb13e53);
      this.tweens.add({ targets: fx, alpha: 0, scale: 1.4, angle: fx.angle + 90, duration: 260, delay: i * 18, onComplete: () => fx.destroy() });
    }
    this.fx.ring(p.x, p.y, 0xb13e53, 44);
    Sfx.play('crit');
    for (const m of this.mobList()) if (Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) < 44) this.hitMob(m, dmg * 0.8, undefined, { def });
  }

  private dropFromNode(node: ResourceNode) {
    for (const d of node.spec.drops) {
      if (Math.random() > d.chance) continue;
      this.spawnDrop(node.x, node.baseY, d.item, Phaser.Math.Between(d.qty[0], d.qty[1]));
    }
  }

  shoot() {
    const p = this.player;
    const held = p.weaponRef?.slot;
    if (!held || !ITEMS[held.id].ranged) return;
    const def = ITEMS[held.id];
    const r = def.ranged!;
    const cls = classOf(def);
    if (p.attackCd > 0 || p.isDodging || this.noFight()) return;
    if (r.ammo && p.inventory.count(r.ammo) <= 0) {
      Sfx.play('error', 400);
      EventBus.emit('toast', `ไม่มี${ITEMS[r.ammo].name}`, '#ef7d57');
      p.attackCd = 0.4;
      return;
    }
    // อาวุธเวท: ร่ายด้วยสแตมินา (ไม้เท้าโลหิตใช้ HP แทน)
    if (def.special === 'bloodpact' ? p.hp <= 3 : r.mana && p.stamina < r.mana) {
      Sfx.play('error', 400);
      EventBus.emit('toast', def.special === 'bloodpact' ? 'เลือดเหลือน้อยเกินไป ร่ายเวทโลหิตไม่ได้' : 'สแตมินาไม่พอร่ายเวท', '#ef7d57');
      p.attackCd = 0.4;
      return;
    }
    if (def.special === 'bloodpact') p.hp -= 2;
    else if (r.mana) p.stamina -= r.mana;
    p.attackCd = r.cooldown;
    if (r.ammo) p.inventory.remove(r.ammo, 1);
    if (p.wearWeapon(1)) EventBus.emit('toast', `${def.name} พังแล้ว!`, '#b13e53');
    const dmg = r.damage * p.char.stats.damageMult * plusMult(held.plus) * (1 + p.stats.atk / 100);
    const base = p.aim.angle();
    const returns = r.returns ?? cls.returns ?? false;
    const pellets = r.pellets ?? cls.pellets ?? 1;
    let angles: number[];
    if (pellets > 1) {
      const sp = r.spread ?? cls.spread ?? 0.5;
      angles = Array.from({ length: pellets }, (_, i) => (i / (pellets - 1) - 0.5) * sp + Phaser.Math.FloatBetween(-0.04, 0.04));
    } else angles = def.effect === 'multishot' ? [-0.18, 0, 0.18] : def.special === 'homing' ? [-0.12, 0.12] : def.special === 'featherstorm' ? [-0.36, -0.18, 0, 0.18, 0.36] : [0];
    const extra = { item: def.id, life: r.life ?? cls.life, returns, homing: def.special === 'homing' || def.special === 'featherstorm', vortex: def.special === 'blackhole' };
    for (const a of angles) {
      const spd = r.speed * (pellets > 1 ? Phaser.Math.FloatBetween(0.85, 1.1) : 1);
      const shot = this.fireShot(r.projectile, dmg, spd, !!r.pierce || returns, base + a, def.effect === 'explode' ? 34 : 0, undefined, extra);
      if (pellets > 1 && r.projectile === 'fireball') shot.setScale(0.7);
      if (def.weaponClass === 'orb' && r.projectile === 'fireball') shot.setScale(1.5);
    }
    // เสียง + แรงสะท้อน + ประกายปากกระบอก
    const proj = r.projectile;
    const boom = proj === 'bullet' || proj === 'proj_pellet' || def.weaponClass === 'shotgun';
    Sfx.play(boom || proj === 'proj_spark' ? 'thunder' : proj === 'fireball' || proj.startsWith('proj_') && proj !== 'proj_stone' ? 'skill' : returns ? 'swing' : 'bow', 80);
    if (boom) {
      const heavy = def.weaponClass === 'shotgun' || def.weaponClass === 'rifle';
      this.cameras.main.shake(heavy ? 130 : 80, heavy ? 0.007 : 0.004);
      this.fx.sparks(p.x + Math.cos(base) * 10, p.y + Math.sin(base) * 10, 0xffcd75, heavy ? 8 : 4, 10);
    }
  }

  /** ของขว้าง: ระเบิดชนิดต่างๆ (โยนโค้งไปตกพื้น) หรือ มีดบิน/ดาวกระจาย/หอกซัด (บินตรง) */
  private throwBomb() {
    const p = this.player;
    if (p.attackCd > 0 || this.noFight()) return;
    const def = p.held ? ITEMS[p.held.id] : undefined;
    const t = def?.throw;
    if (!def || !t) return;
    const kind = t.kind ?? 'bomb';
    const atk = p.char.stats.damageMult * (1 + p.stats.atk / 100);
    p.inventory.consumeAt(p.selected);
    if (kind === 'knife' || kind === 'shuriken' || kind === 'javelin') {
      p.attackCd = kind === 'javelin' ? 0.6 : 0.28;
      const angles = kind === 'shuriken' ? [-0.15, 0, 0.15] : [0];
      for (const a of angles) {
        this.fireShot(def.icon, t.damage * atk, kind === 'javelin' ? 340 : 400, kind === 'javelin', p.aim.angle() + a, 0, undefined, {
          item: def.id, life: kind === 'javelin' ? 0.9 : 0.6, spin: kind === 'shuriken' ? 22 : 0,
        });
      }
      Sfx.play('swing');
      return;
    }
    p.attackCd = 0.8;
    const tx = p.x + p.aim.x * 70;
    const ty = p.y + p.aim.y * 70;
    const bomb = this.add.image(p.x, p.y, def.icon).setScale(0.6).setDepth(1e5);
    this.tweens.add({ targets: bomb, x: tx, duration: 500 });
    this.tweens.add({
      targets: bomb, y: { from: p.y, to: ty }, duration: 500, ease: 'Quad.easeIn', angle: 360,
      onComplete: () => {
        bomb.destroy();
        this.detonate(def, tx, ty, atk);
      },
    });
  }

  /** ของขว้างตกถึงพื้น — ผลตามชนิด */
  private detonate(def: ItemDef, x: number, y: number, atk: number) {
    const t = def.throw!;
    const dmg = t.damage * atk;
    const inside = (r: number) => this.mobList().filter((m) => Phaser.Math.Distance.Between(x, y, m.x, m.y) < r);
    switch (t.kind ?? 'bomb') {
      case 'cluster': {
        this.explode(x, y, t.radius, dmg, true);
        const n = t.count ?? 5;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
          const d = 26 + Math.random() * 18;
          const bx = x + Math.cos(a) * d;
          const by = y + Math.sin(a) * d * 0.8;
          const mini = this.add.image(x, y, 'i_bomb').setScale(0.35).setDepth(1e5);
          this.tweens.add({
            targets: mini, x: bx, y: by, angle: 360, duration: 260 + i * 50, ease: 'Quad.easeOut',
            onComplete: () => {
              mini.destroy();
              this.explode(bx, by, 24, dmg * 0.5, true);
            },
          });
        }
        break;
      }
      case 'molotov':
        this.fx.sparks(x, y, 0xef7d57, 14, t.radius * 0.7);
        this.fx.ring(x, y, 0xef7d57, t.radius);
        Sfx.play('splash');
        Sfx.play('fire');
        for (const m of inside(t.radius)) {
          m.hurt(dmg, { x, y }, { color: 0xef7d57, knock: 0.3 });
          m.applyStatus('burn', 3, Math.max(8, dmg * 0.3));
        }
        this.addWeaponArea(x, y, t.radius, 'fire', t.dur ?? 4, Math.max(8, dmg * 0.3));
        break;
      case 'ice':
        this.fx.ring(x, y, 0x73eff7, t.radius);
        this.time.delayedCall(80, () => this.fx.ring(x, y, 0xc8f4ff, t.radius * 0.7));
        this.fx.sparks(x, y, 0xc8f4ff, 18, t.radius * 0.8);
        Sfx.play('splash');
        for (const m of inside(t.radius)) {
          m.hurt(dmg, { x, y }, { color: 0x73eff7, knock: 0 });
          this.applyWeaponStatus(m, def, dmg);
        }
        break;
      case 'smoke':
        this.fx.poof(x, y, 0x94b0c2, 16);
        Sfx.play('dash');
        for (const m of inside(t.radius)) this.applyWeaponStatus(m, def, dmg);
        this.addWeaponArea(x, y, t.radius, 'smoke', t.dur ?? 3.5, 0);
        break;
      case 'flash':
        this.cameras.main.flash(160, 255, 255, 230);
        this.fx.ring(x, y, 0xffffff, t.radius);
        this.fx.sparks(x, y, 0xfff2b0, 20, t.radius * 0.8);
        Sfx.play('thunder');
        for (const m of inside(t.radius)) {
          m.hurt(dmg, { x, y }, { color: 0xffcd75, knock: 0.5 });
          this.applyWeaponStatus(m, def, dmg);
        }
        break;
      case 'poison':
        this.fx.poof(x, y, 0x38b764, 14);
        Sfx.play('splash');
        for (const m of inside(t.radius)) {
          m.hurt(dmg, { x, y }, { color: 0xa7f070, knock: 0.2 });
          this.applyWeaponStatus(m, def, dmg);
        }
        this.addWeaponArea(x, y, t.radius, 'poison', t.dur ?? 5, Math.max(4, dmg * 0.4));
        break;
      default:
        this.explode(x, y, t.radius, dmg, true);
    }
  }

  /** วางพื้นที่ค้าง (กองไฟ/หมอกพิษ/ควัน/หลุมดำ) */
  private addWeaponArea(x: number, y: number, r: number, kind: 'fire' | 'poison' | 'smoke' | 'vortex', t: number, power: number) {
    const col = { fire: 0xef7d57, poison: 0x38b764, smoke: 0x94b0c2, vortex: 0x5d275d }[kind];
    const mark = this.add.ellipse(x, y, r * 2, r * 1.3, col, kind === 'smoke' ? 0.15 : 0.22).setStrokeStyle(1, col, 0.5).setDepth(-0.5);
    if (this.weaponAreas.length >= 24) this.weaponAreas.shift()?.mark.destroy();
    this.weaponAreas.push({ x, y, r, t, kind, power, tick: 0, mark });
  }

  private updateWeaponAreas(dt: number) {
    this.venomCd -= dt;
    for (let i = this.weaponAreas.length - 1; i >= 0; i--) {
      const a = this.weaponAreas[i];
      if (!a.mark.scene) {
        this.weaponAreas.splice(i, 1);
        continue;
      }
      a.t -= dt;
      a.tick -= dt;
      const rx = a.x + Phaser.Math.FloatBetween(-a.r, a.r) * 0.8;
      const ry = a.y + Phaser.Math.FloatBetween(-a.r, a.r) * 0.5;
      if (a.kind === 'fire' && Math.random() < dt * 14) this.fx.sparks(rx, ry, Math.random() < 0.5 ? 0xef7d57 : 0xffcd75, 2, 8);
      if (a.kind === 'poison' && Math.random() < dt * 6) this.fx.poof(rx, ry, 0x38b764, 3);
      if (a.kind === 'smoke' && Math.random() < dt * 9) this.fx.poof(rx, ry, 0x94b0c2, 4);
      if (a.kind === 'vortex') {
        a.mark.rotation += dt * 4;
        if (Math.random() < dt * 20) {
          const ang = Math.random() * Math.PI * 2;
          this.fx.sparks(a.x + Math.cos(ang) * a.r * 0.8, a.y + Math.sin(ang) * a.r * 0.5, 0xa77bdb, 1, 6);
        }
        // ดูดศัตรู (ยกเว้นบอส) เข้าหาศูนย์กลาง
        for (const m of this.mobList()) {
          if (m.isBoss) continue;
          const d = Phaser.Math.Distance.Between(a.x, a.y, m.x, m.y);
          if (d > a.r * 1.4 || d < 3) continue;
          const k = Math.min(1, (90 * dt) / d);
          m.x += (a.x - m.x) * k;
          m.y += (a.y - m.y) * k;
        }
      }
      if (a.tick <= 0) {
        a.tick = 0.4;
        for (const m of this.mobList()) {
          if (Phaser.Math.Distance.Between(a.x, a.y, m.x, m.y + 3) > a.r) continue;
          if (a.kind === 'fire') m.applyStatus('burn', 1.5, a.power);
          else if (a.kind === 'poison') m.applyStatus('poison', 3, a.power);
          else if (a.kind === 'smoke') {
            if (!m.isBoss) m.applyStatus('stun', 0.6);
          } else m.hurt(a.power, undefined, { color: 0xa77bdb, knock: 0 });
        }
      }
      if (a.t <= 0) {
        if (a.kind === 'vortex') {
          this.fx.ring(a.x, a.y, 0xa77bdb, a.r);
          for (const m of this.mobList()) if (Phaser.Math.Distance.Between(a.x, a.y, m.x, m.y) < a.r) m.hurt(a.power * 2, { x: a.x, y: a.y }, { color: 0xa77bdb, knock: 1.5 });
        }
        a.mark.destroy();
        this.weaponAreas.splice(i, 1);
      } else if (a.t < 0.5) a.mark.setAlpha(a.t * 2);
    }
  }

  explode(x: number, y: number, radius: number, damage: number, friendly: boolean) {
    this.fx.ring(x, y, 0xef7d57, radius);
    this.fx.sparks(x, y, 0xffcd75, 16, radius * 0.8);
    this.fx.poof(x, y, 0x333c57, 12);
    this.cameras.main.shake(200, 0.008);
    Sfx.play('breakRock');
    for (const m of this.mobList()) if (Phaser.Math.Distance.Between(x, y, m.x, m.y) < radius) m.hurt(damage, { x, y });
    if (!friendly && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < radius) this.player.hurt(damage, { x, y });
  }

  /**
   * ยิงกระสุนผู้เล่น/ป้อมปืน — extra: item = อาวุธต้นทาง (ใช้คิดคริ/สถานะ/สายฟ้า) · returns = บินกลับ · homing = ไล่เป้า · vortex = หลุมดำ
   * texture ที่ขึ้นต้น i_ (ไอคอนไอเทม เช่น มีดบิน/บูมเมอแรง) วาดเอียง 45° จึงหมุนชดเชย
   */
  private fireShot(
    tex: string, damage: number, speed: number, pierce: boolean, angle: number, splash = 0, from = { x: this.player.x, y: this.player.y },
    extra: { item?: string; life?: number; returns?: boolean; homing?: boolean; vortex?: boolean; spin?: number } = {},
  ) {
    const shot = this.shots.create(from.x, from.y, tex) as Phaser.Physics.Arcade.Image;
    const icon = tex.startsWith('i_');
    shot.setRotation(angle + (icon ? Math.PI / 4 : 0)).setDepth(this.player.depth + 1);
    shot.setData({
      hit: new Set<Mob>(), life: extra.returns ? 3 : extra.life ?? 1.1, damage, pierce, splash, item: extra.item ?? '',
      returns: !!extra.returns, out: (extra.life ?? 0.9) * 0.5, back: false, homing: !!extra.homing, vortex: !!extra.vortex, speed,
      spin: extra.spin ?? (extra.returns ? 18 : 0),
    });
    if (icon) shot.setScale(0.75);
    shot.body!.setSize(icon ? 10 : 6, icon ? 10 : 6);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    if (tex === 'fireball' && this.anims.exists('fireball_spin')) (shot as unknown as Phaser.GameObjects.Sprite).play?.('fireball_spin');
    return shot;
  }

  private onShotHit(shot: Phaser.Physics.Arcade.Image, mob: Mob) {
    const hit: Set<Mob> = shot.getData('hit');
    if (!hit || hit.has(mob)) return;
    hit.add(mob);
    if (shot.getData('vortex')) {
      mob.hurt(shot.getData('damage'), shot, { color: 0xa77bdb });
      this.addWeaponArea(shot.x, shot.y, 56, 'vortex', 2.5, shot.getData('damage') * 0.3);
      shot.destroy();
      return;
    }
    const splash = shot.getData('splash') as number;
    if (splash) {
      this.explode(shot.x, shot.y, splash, shot.getData('damage'), true);
      shot.destroy();
      return;
    }
    const def = ITEMS[shot.getData('item') as string] as ItemDef | undefined;
    const cls = classOf(def);
    const crit = Math.random() < BALANCE.critChance + (this.player.stats.crit + (cls.crit ?? 0) + (def?.critBonus ?? 0)) / 100;
    // แสงศักดิ์สิทธิ์: อันเดดรับดาเมจ ×1.5
    const holy = def?.special === 'holylight' && UNDEAD.has(mob.def.id.split('@')[0]) ? 1.5 : 1;
    const sdmg = shot.getData('damage') * (crit ? BALANCE.critMult : 1) * holy;
    if (def && this.magicBurst(shot, mob, def, sdmg, hit.size === 1)) return;
    // ธาตุหลัก (โอกาสติดสูง) → ตัวเลขดาเมจเป็นสีธาตุ
    const el = def?.status?.find((s) => s.chance >= 0.5);
    const color = el ? STATUS_INFO[el.kind].color : undefined;
    mob.hurt(sdmg, shot, { crit, knock: def ? (cls.knock ?? 1) * (def.knockback ?? 1) : 1, color });
    if (this.player.stats.lifesteal > 0) this.player.heal(sdmg * this.player.stats.lifesteal / 100);
    this.applyWeaponStatus(mob, def, sdmg);
    if (def?.chain) this.chainLightning(mob, sdmg * 0.6, def.chain);
    if (def?.special === 'holylight') this.player.heal(sdmg * 0.04);
    if (def?.special === 'bloodpact') this.player.heal(sdmg * 0.1);
    this.fx.sparks(mob.x, mob.y, color ?? 0xffffff, 4);
    Sfx.play('hit', 60);
    if (!shot.getData('pierce')) shot.destroy();
  }

  /**
   * อาวุธเวทพิเศษ: กระสุนแตกเป็นวง (ลูกแก้ว/คทาพญานาค/ลูกแก้วหงส์เพลิง) — คืน true ถ้ากระสุนถูกใช้หมดแล้ว
   * first = เป้าแรกของกระสุนนัดนี้ (คทาพญานาคแตกครั้งเดียวแล้วทะลุต่อ)
   */
  private magicBurst(shot: Phaser.Physics.Arcade.Image, mob: Mob, def: ItemDef, dmg: number, first: boolean): boolean {
    const sp = def.special;
    if (sp !== 'orbburst' && sp !== 'phoenixfire' && !(sp === 'tidal' && first)) return false;
    const x = shot.x;
    const y = shot.y;
    const r = sp === 'phoenixfire' ? 40 : sp === 'tidal' ? 44 : 36;
    const col = sp === 'tidal' ? 0x41a6f6 : sp === 'phoenixfire' ? 0xef7d57 : (def.status?.[0] ? STATUS_INFO[def.status[0].kind].color : 0xa77bdb);
    this.fx.ring(x, y, col, r);
    this.time.delayedCall(80, () => this.fx.ring(x, y, 0xffffff, r * 0.6));
    this.fx.sparks(x, y, col, 14, r * 0.8);
    this.cameras.main.shake(140, 0.005);
    Sfx.play(sp === 'tidal' ? 'splash' : 'breakRock', 80);
    let total = 0;
    for (const m of this.mobList()) {
      if (!m.active || Phaser.Math.Distance.Between(x, y, m.x, m.y) > r || (sp === 'tidal' && m === mob)) continue;
      const d = m === mob ? dmg : dmg * (sp === 'tidal' ? 0.6 : 0.7);
      m.hurt(d, { x, y }, { color: col, knock: classOf(def).knock ?? 1 });
      total += d;
      this.applyWeaponStatus(m, def, d);
      if (sp === 'tidal' && m.active) m.applyStatus('poison', 5, Math.max(4, d * 0.1));
    }
    if (sp === 'phoenixfire') {
      this.addWeaponArea(x, y, 34, 'fire', 3, Math.max(8, dmg * 0.15));
      this.player.heal(total * 0.06);
    }
    if (this.player.stats.lifesteal > 0) this.player.heal(total * this.player.stats.lifesteal / 100);
    if (sp !== 'tidal') shot.destroy();
    return sp !== 'tidal';
  }

  /** กระสุนพิเศษ: หมุน · บูมเมอแรงบินกลับ · ศรไล่ล่าเป้า */
  private steerShot(a: Phaser.Physics.Arcade.Image, dt: number) {
    const spin = a.getData('spin') as number;
    if (spin) a.rotation += spin * dt;
    if (a.getData('returns')) {
      const out = (a.getData('out') as number) - dt;
      a.setData('out', out);
      if (out <= 0) {
        if (!a.getData('back')) {
          a.setData('back', true);
          (a.getData('hit') as Set<Mob>).clear(); // ขากลับตีซ้ำได้
        }
        const p = this.player;
        const ang = Phaser.Math.Angle.Between(a.x, a.y, p.x, p.y);
        const sp = (a.getData('speed') as number) * 1.15;
        a.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
        if (Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) < 12) a.destroy();
      }
    } else if (a.getData('homing')) {
      const hit = a.getData('hit') as Set<Mob>;
      let best: Mob | null = null;
      let bd = 150;
      for (const m of this.mobList()) {
        if (!m.hostile || hit.has(m)) continue;
        const d = Phaser.Math.Distance.Between(a.x, a.y, m.x, m.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      if (best) {
        const v = a.body!.velocity;
        const na = Phaser.Math.Angle.RotateTo(Math.atan2(v.y, v.x), Phaser.Math.Angle.Between(a.x, a.y, best.x, best.y), 7 * dt);
        const sp = a.getData('speed') as number;
        a.setVelocity(Math.cos(na) * sp, Math.sin(na) * sp).setRotation(na);
      }
    }
  }

  /** มอนยิงกระสุนใส่ผู้เล่น */
  enemyShoot(mob: Mob, sh: NonNullable<MobDef['shoot']>) {
    const p = this.player;
    const base = Phaser.Math.Angle.Between(mob.x, mob.y, p.x, p.y);
    const n = sh.burst ?? 1;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.22;
      const s = this.enemyShots.create(mob.x, mob.y - 4, sh.projectile) as Phaser.Physics.Arcade.Image;
      s.setRotation(a).setDepth(1e5).setData({ damage: sh.damage, life: 2.2, from: mob.def.name, afflict: mob.def.onHit ?? null });
      s.body!.setSize(6, 6);
      s.setVelocity(Math.cos(a) * sh.speed, Math.sin(a) * sh.speed);
      if (sh.projectile === 'fireball' && this.anims.exists('fireball_spin')) (s as unknown as Phaser.GameObjects.Sprite).play?.('fireball_spin');
    }
    Sfx.play(sh.projectile === 'fireball' ? 'fire' : 'bow', 120);
  }

  private onEnemyShot(shot: Phaser.Physics.Arcade.Image) {
    const p = this.player;
    if (this.playerSafe) return shot.destroy();
    p.lastDamage = shot.getData('from');
    const dmg = p.hurt(shot.getData('damage'), shot);
    if (dmg > 0) this.fx.damageNumber(p.x, p.y - 12, dmg, 0xef7d57);
    if (dmg > 0 && shot.getData('afflict')) this.creatures.afflict(shot.getData('afflict'), shot.getData('from'));
    shot.destroy();
  }

  private updateShots(dt: number) {
    for (const a of [...this.shots.getChildren()] as Phaser.Physics.Arcade.Image[]) if (a.active) this.steerShot(a, dt);
    for (const group of [this.shots, this.enemyShots]) {
      for (const a of [...group.getChildren()] as Phaser.Physics.Arcade.Image[]) {
        const life = a.getData('life') - dt;
        a.setData('life', life);
        if (life <= 0) {
          // ลูกแก้วหลุมดำหมดระยะ → กลายเป็นหลุมดำตรงนั้น
          if (a.getData('vortex')) this.addWeaponArea(a.x, a.y, 56, 'vortex', 2.5, a.getData('damage') * 0.3);
          a.destroy();
        }
      }
    }
  }

  // ---------- โต้ตอบ (E) ----------
  private interact() {
    const p = this.player;
    const R = BALANCE.reach;
    if (this.fishing) return this.reelIn();
    if (this.riding) return this.ridingInteract();
    const portal = this.interiors.interactAt();
    if (portal) return portal.run();
    const near = (x: number, y: number, r = R + 4) => Phaser.Math.Distance.Between(p.x, p.feetY, x, y) < r;
    const crate = this.crates.find((c) => !c.looted && near(c.sprite.x, c.sprite.y - 4, R));
    if (crate) return this.openCrate(crate);
    const drop = this.daily.nearest(p.x, p.feetY, R + 4);
    if (drop) return this.daily.open(drop);
    const grave = this.graves.find((g) => near(g.x, g.y));
    if (grave) return this.openGrave(grave);
    if (this.mailboxSprite && this.daily.mailboxReady && near(this.mailboxSprite.x, this.mailboxSprite.y)) return this.daily.claim();
    if (this.merchantSprite && near(this.merchantSprite.x, this.merchantSprite.y, R + 10)) return EventBus.emit('ui:market');
    const stall = this.stalls.find((s) => near(s.x, s.y + 4, 30));
    if (stall) return EventBus.emit('ui:trade', stall.index);
    const t = this.structTarget();
    if (t.boat) return this.board(t.boat);
    if (t.repair) return void this.repairStructure(t.repair);
    const st = t.st;
    if (st) {
      if (st.def.crop && this.farmInteract(st)) return;
      if (hasAnvil(st.def)) return EventBus.emit('ui:enhance');
      if ((st.def.id === 'campfire' || st.def.id === 'generator') && this.refuel(st)) return;
      if (st.def.water) return this.drinkFrom(st);
      // บ้านที่นอนได้ + มีที่เก็บของ: กลางคืน = นอน, กลางวัน = เปิดที่เก็บของ
      if (st.def.sleep && st.def.storage && this.canSleepNow()) return this.sleep();
      if (st.def.storage) return EventBus.emit('ui:storage', st);
      if (st.def.sleep) return this.sleep();
    }
    if (t.broken) return void this.repairStructure(t.broken); // วัสดุไม่พอ → แจ้งเตือน
    const node = this.nearestNode(p.x, p.feetY, R, (n) => n.isPickable);
    if (node) return this.pick(node);
    if (this.waterNearby()) {
      if (p.held && ITEMS[p.held.id].type === 'rod') return this.castLine();
      if (p.char.passive.robot) return EventBus.emit('toast', 'หุ่นยนต์ดื่มน้ำไม่ได้!', '#ef7d57');
      p.thirst = Math.min(100, p.thirst + BALANCE.drinkAmount);
      this.fx.sparks(p.x + p.aim.x * 10, p.feetY + p.aim.y * 10, 0x41a6f6, 5, 8);
      Sfx.play('drink');
      EventBus.emit('toast', 'ดื่มน้ำ 💧', '#73eff7');
    }
  }

  /** เป้าหมาย E ระหว่างยาน/สิ่งก่อสร้าง: เลือกอันที่ใกล้ตัวกว่า · ซ่อมก่อนเฉพาะเมื่อวัสดุพอ */
  private structTarget() {
    const p = this.player;
    const R = BALANCE.reach;
    const broken = this.nearestStructure(R + 8, (s) => !s.getData('foreign') && s.hp < s.maxHp);
    const st = this.nearestStructure(R + 8, (s) => !s.getData('foreign') && (!!s.def.storage || !!s.def.crop || !!s.def.sleep || !!s.def.water || s.def.id === 'campfire' || s.def.id === 'generator' || hasAnvil(s.def)));
    const repair = broken && this.canRepair(broken) ? broken : null;
    const target = repair ?? st ?? broken;
    const veh = this.vehicleNear();
    const boat = veh && (!target || Phaser.Math.Distance.Between(p.x, p.feetY, veh.x, veh.y) <= this.structDist(target)) ? veh : undefined;
    return { boat, repair, st, broken };
  }

  private canSleepNow(): boolean {
    return (this.dayNight.isNight || this.dayNight.phase === 'dusk') && !this.disaster.active;
  }

  /** ดื่มน้ำจากบ่อ/น้ำพุ/ถังเก็บน้ำฝน */
  private drinkFrom(st: Structure) {
    const p = this.player;
    if (p.char.passive.robot) return EventBus.emit('toast', 'หุ่นยนต์ดื่มน้ำไม่ได้!', '#ef7d57');
    if (st.def.water === 'rain') {
      if (st.water < 1) return EventBus.emit('toast', 'ถังว่าง — รอฝนตก (หรือรอน้ำค้างสะสม)', '#94b0c2');
      st.water -= 1;
    }
    p.thirst = Math.min(100, p.thirst + BALANCE.drinkAmount * 1.5);
    this.fx.sparks(st.x, st.y - 10, 0x41a6f6, 6, 8);
    Sfx.play('drink');
    EventBus.emit('toast', st.def.water === 'rain' ? `ดื่มน้ำฝน 💧 (เหลือ ${Math.floor(st.water)}/${RAIN_WATER_CAP})` : 'ดื่มน้ำสะอาด 💧', '#73eff7');
  }

  private refuel(st: Structure): boolean {
    const inv = this.player.inventory;
    const fuels: [string, number][] = st.def.id === 'campfire' ? [['wood', 60], ['coal', 150]] : [['fuel', 240], ['coal', 90], ['wood', 25]];
    for (const [item, sec] of fuels) {
      if (inv.count(item) > 0) {
        inv.remove(item, 1);
        st.addFuel(sec);
        Sfx.play('fire');
        EventBus.emit('toast', `เติม${ITEMS[item].name} (${Math.ceil(st.fuel)} วิ)`, '#ffcd75');
        return true;
      }
    }
    if (st.def.id === 'generator') EventBus.emit('toast', 'เครื่องปั่นไฟต้องใช้ น้ำมัน/ถ่านหิน/ไม้', '#ef7d57');
    return st.def.id === 'generator';
  }

  farmInteract(plot: Structure): boolean {
    const p = this.player;
    if (plot.ripe) {
      const crop = CROPS[plot.harvest()!];
      this.spawnDrop(plot.x, plot.y - 4, crop.item, Phaser.Math.Between(crop.yield[0], crop.yield[1]));
      if (Math.random() < 0.7) this.spawnDrop(plot.x, plot.y - 4, crop.seed, Phaser.Math.Between(1, 2));
      Sfx.play('harvest');
      this.fx.sparks(plot.x, plot.y - 6, 0xa7f070, 8);
      EventBus.emit('harvest', crop.item);
      MetaSave.bump('cropsHarvested', 1);
      return true;
    }
    if (plot.crop) {
      EventBus.emit('toast', `${CROPS[plot.crop].name} โตแล้ว ${Math.floor(plot.growth * 100)}%`, '#a7f070');
      return true;
    }
    const held = p.held && ITEMS[p.held.id].crop ? p.held : p.inventory.slots.find((s) => s && ITEMS[s.id].crop) ?? null;
    if (!held) {
      EventBus.emit('toast', 'ไม่มีเมล็ดพันธุ์ (หาจากหญ้า พืชป่า กล่อง หรือตลาด)', '#ef7d57');
      return true;
    }
    const crop = ITEMS[held.id].crop!;
    p.inventory.remove(held.id, 1);
    plot.plant(crop);
    Sfx.play('place');
    EventBus.emit('toast', `ปลูก${CROPS[crop].name}แล้ว`, '#a7f070');
    return true;
  }

  private sleep() {
    const dn = this.dayNight;
    if (!dn.isNight && dn.phase !== 'dusk') return EventBus.emit('toast', 'ยังไม่ง่วง — นอนได้ตอนกลางคืน', '#94b0c2');
    if (this.disaster.active) return EventBus.emit('toast', 'นอนไม่ได้ระหว่างภัยพิบัติ!', '#ef7d57');
    Sfx.play('sleep');
    const cam = this.cameras.main;
    cam.fadeOut(600, 0, 0, 0);
    cam.once('camerafadeoutcomplete', () => {
      dn.time = 0.999;
      const p = this.player;
      p.sanity = Math.min(100, p.sanity + 30);
      p.heal(20);
      cam.fadeIn(900);
      EventBus.emit('toast', '😴 นอนหลับสบาย — ฟื้น HP + สติ', '#a7f070');
    });
  }

  private openCrate(c: { sprite: Phaser.GameObjects.Image; looted: boolean }) {
    c.looted = true;
    c.sprite.setTexture('crate_open');
    const pool: [string, number][][] = [
      [['rope', 3], ['berry', 4], ['torch', 1], ['box_wood', 1]],
      [['bandage', 2], ['fiber', 6], ['wood', 6], ['carrot_seed', 3]],
      [['stone', 5], ['cooked_meat', 2], ['coin', 25], ['fishing_rod', 1]],
    ];
    for (const [item, qty] of Phaser.Utils.Array.GetRandom(pool)) this.spawnDrop(c.sprite.x, c.sprite.y - 2, isBoxTier(item) ? this.capBox(item, 'chest', c.sprite.x, c.sprite.y) : item, qty);
    this.fx.sparks(c.sprite.x, c.sprite.y - 8, 0xffcd75, 8);
    Sfx.play('pickup');
  }

  pick(node: ResourceNode) {
    if (node.kind === 'ruin_chest') {
      node.deplete(this.worldTime);
      const dungeonChest = this.interiors.onNodePicked(node);
      this.dropFromNode(node);
      // เกาะมหาสมบัติ: เพชร 15% / ทอง 60% · เกาะซากโบราณ/หมอกผี: เพชร 5% / ทอง 45% (ผ่านเพดานกล่องตามพื้นที่)
      if (!dungeonChest) this.spawnDrop(node.x, node.baseY, this.capBox(ruinChestBox(this.world.slotIndexAt(node.tx, node.ty) === SPECIAL_SLOT), 'chest', node.x, node.baseY), 1);
      Sfx.play('levelUp');
      return;
    }
    node.deplete(this.worldTime);
    this.fx.debris(node.x, node.baseY - 3, node.kind === 'bush' ? 0xb13e53 : 0xa7f070, 5);
    Sfx.play('harvest');
    this.dropFromNode(node);
    EventBus.emit('node:harvested', node.kind);
  }

  useHeld() {
    const p = this.player;
    const held = p.held;
    if (!held) return;
    const def = ITEMS[held.id];
    if (def.type === 'box') return this.openBox(held.id as BoxTier);
    if (def.type === 'cosmetic' && def.cosmetic) {
      p.inventory.consumeAt(p.selected);
      MetaSave.addWardrobe(`${def.cosmetic.slot}:${def.cosmetic.id}`);
      p.cosmetic[def.cosmetic.slot] = def.cosmetic.id;
      p.refreshLook();
      Sfx.play('achievement');
      return EventBus.emit('toast', `เก็บ${def.name}เข้าตู้เสื้อผ้า และสวมใส่แล้ว`, '#a77bdb');
    }
    if (p.char.passive.robot && (held.id === 'wood' || held.id === 'iron_ingot')) {
      p.hunger = Math.min(100, p.hunger + (held.id === 'wood' ? 8 : 40));
      p.inventory.consumeAt(p.selected);
      Sfx.play('skill');
      return EventBus.emit('toast', '🔋 ชาร์จแบตเตอรี่', '#73eff7');
    }
    if (def.elixir) return this.useElixir(p.selected);
    if (def.equip || def.type === 'weapon' || def.type === 'ranged') {
      this.equipFrom(p.selected);
      return;
    }
    if (!def.food) return;
    if (p.char.passive.robot && def.type === 'food') return EventBus.emit('toast', 'หุ่นยนต์ไม่กินอาหาร — ถือไม้/เหล็กแท่งแล้วกด F', '#ef7d57');
    if (def.type === 'heal' && p.hp >= p.maxHp) return EventBus.emit('toast', 'HP เต็มอยู่แล้ว', '#94b0c2');
    p.eat(def.food);
    p.inventory.consumeAt(p.selected);
    Sfx.play(def.type === 'heal' ? 'skill' : 'eat');
    if (def.food.hp && def.food.hp > 0) this.fx.damageNumber(p.x, p.y - 12, def.food.hp * (p.char.passive.healMult ?? 1), 0xa7f070);
  }

  /** เปิดกล่อง → หน้าต่างเปิดกล่องใน UI แล้วได้ของ */
  openBox(tier: BoxTier) {
    const p = this.player;
    if (!p.inventory.remove(tier, 1)) return;
    const loot = rollBox(tier, this.learned);
    EventBus.emit('ui:boxopen', tier, loot);
    EventBus.emit('box:open');
    Sfx.play('levelUp');
    for (const l of loot) this.collect(l.item, l.qty, p.x, p.y + 6);
  }

  // ======================================================================
  // อุปกรณ์สวมใส่ (12 ช่อง) + บัฟจากฐาน
  // ======================================================================
  /** ใช้ผลึกพลัง → ค่าถาวร (ไม่เกินเพดาน) */
  useElixir(index: number): boolean {
    const p = this.player;
    const item = p.inventory.slots[index];
    const ex = item && ITEMS[item.id].elixir;
    if (!ex) return false;
    const gained: string[] = [];
    for (const [k, v] of Object.entries(ex.gains) as [keyof Stats, number][]) {
      const cap = TRAIN_CAP[k] ?? Infinity;
      const add = Math.min(v, cap - p.trained[k]);
      if (add <= 0) continue;
      p.trained[k] = +(p.trained[k] + add).toFixed(2);
      gained.push(`${STAT_INFO[k].name} ${STAT_INFO[k].fmt(add)}`);
    }
    if (!gained.length) {
      EventBus.emit('toast', 'ค่านี้อัปเต็มเพดานแล้ว — หาอุปกรณ์/อัพเกรดแทน', '#ef7d57');
      return false;
    }
    p.inventory.consumeAt(index);
    p.recalc();
    Sfx.play('levelUp');
    this.fx.ring(p.x, p.y, 0xffcd75, 22);
    this.fx.sparks(p.x, p.y - 6, 0xa77bdb, 14, 18);
    EventBus.emit('toast', `✦ พลังถาวร: ${gained.join(' · ')}`, '#ffcd75');
    return true;
  }

  /** ช่องที่ของชิ้นนี้ใส่ได้ (แหวน: ช่องว่างก่อน) */
  slotFor(id: string): EquipSlot | null {
    const def = ITEMS[id];
    if (def.type === 'weapon' || def.type === 'ranged') return 'weapon';
    const k = def.equip?.slot;
    if (!k) return null;
    if (k === 'ring') return !this.player.equip.ring1 ? 'ring1' : !this.player.equip.ring2 ? 'ring2' : 'ring1';
    return k;
  }

  /** สวมของจากช่องกระเป๋า (ของเดิมสลับกลับเข้ากระเป๋า) */
  equipFrom(index: number, target?: EquipSlot): boolean {
    const p = this.player;
    const item = p.inventory.slots[index];
    if (!item) return false;
    const def = ITEMS[item.id];
    let slot = this.slotFor(item.id);
    if (target && slot && (target === slot || (def.equip?.slot === 'ring' && (target === 'ring1' || target === 'ring2')))) slot = target;
    if (!slot) {
      EventBus.emit('toast', 'ของชิ้นนี้สวมใส่ไม่ได้', '#ef7d57');
      return false;
    }
    const prev = p.equip[slot];
    // ถอดกระเป๋าเป้ใบใหญ่ → ต้องไม่มีของในช่องเสริมที่จะหายไป
    if (slot === 'bag' && prev) {
      const newBag = p.inventory.baseSize + Math.round(p.stats.bag - (ITEMS[prev.id].equip?.stats.bag ?? 0) + (def.equip?.stats.bag ?? 0));
      if (p.inventory.usedFrom(HOTBAR_SIZE + newBag) > 0 && newBag < p.inventory.bagSize) {
        EventBus.emit('toast', 'ย้ายของออกจากช่องท้ายกระเป๋าก่อนเปลี่ยนเป้', '#ef7d57');
        return false;
      }
    }
    p.equip[slot] = { ...item };
    p.inventory.slots[index] = prev ? { ...prev } : null;
    p.inventory.version++;
    p.recalc();
    p.refreshLook();
    Sfx.play('craft');
    EventBus.emit('toast', `สวม${item.plus ? ` Lv.${item.plus + 1}` : ''} ${def.name} → ${SLOT_NAME[slot]}`, '#a7f070');
    EventBus.emit('gear:changed');
    return true;
  }

  /** ถอดอุปกรณ์กลับเข้ากระเป๋า */
  unequip(slot: EquipSlot): boolean {
    const p = this.player;
    const item = p.equip[slot];
    if (!item) return false;
    if (slot === 'bag') {
      const lose = Math.round(ITEMS[item.id].equip?.stats.bag ?? 0);
      if (p.inventory.usedFrom(p.inventory.slots.length - lose) > 0) {
        EventBus.emit('toast', 'ย้ายของออกจากช่องท้ายกระเป๋าก่อนถอดเป้', '#ef7d57');
        return false;
      }
    }
    p.equip[slot] = null;
    p.recalc();
    if (!p.inventory.addSlot(item)) {
      p.equip[slot] = item;
      p.recalc();
      EventBus.emit('toast', 'กระเป๋าเต็ม', '#ef7d57');
      return false;
    }
    p.refreshLook();
    Sfx.play('click');
    EventBus.emit('gear:changed');
    return true;
  }

  private buffTimer = 0;
  private lastBuildTile = '';
  /** รวมบัฟจากสิ่งก่อสร้างของเรา (นับไม่เกิน buffMax ต่อชนิด) */
  refreshBaseBuffs(force = false) {
    this.buffTimer = 1;
    // นับไม่เกิน buffMax หลังต่อชนิด (เลือกหลังเลเวลสูงสุดก่อน) · แต่ละหลังให้บัฟ ×BUILD_LEVEL.buff(lv) (Lv10 = ×1.9)
    const lvs: Record<string, number[]> = {};
    for (const st of this.structures) {
      if (st.getData('foreign') || !st.def.buff) continue;
      (lvs[st.def.id] ??= []).push(st.lv);
    }
    const total = emptyStats();
    const list: { name: string; text: string }[] = [];
    for (const [id, all] of Object.entries(lvs)) {
      const def = BUILD[id];
      const top = all.sort((a, b) => b - a).slice(0, def.buffMax ?? 1);
      const n = top.length;
      const mult = top.reduce((a, lv) => a + BUILD_LEVEL.buff(lv), 0);
      addStats(total, def.buff!, mult);
      const maxLv = top[0] ?? 1;
      list.push({ name: `${def.name}${(def.buffMax ?? 1) > 1 ? ` ×${n}/${def.buffMax}` : ''}${maxLv > 1 ? ` (Lv.${maxLv})` : ''}`, text: statLine(def.buff!, mult) });
    }
    const p = this.player;
    p.baseStats = total;
    p.baseBuffs = list;
    if (force) p.recalc();
    const power = p.power;
    if (power > this.bestPower) {
      this.bestPower = power;
      MetaSave.setBestPower(power);
    }
  }
  private bestPower = 0;

  /** อัพเกรดไอเทม (ช่องกระเป๋า/ช่องสวมใส่) Lv +1 — สำเร็จ 100% (แทนระบบตีบวกเดิม) */
  upgradeItem(ref: ItemRef): { ok: boolean; msg: string } {
    const r = this.upgrades.upgradeItem(ref);
    if (r.ok && typeof ref === 'string') this.player.refreshLook();
    return r;
  }

  private useSkill() {
    const p = this.player;
    if (p.skillCd > 0) return;
    p.skillCd = p.char.skill.cooldown;
    Sfx.play('skill');
    const ring = (r: number, color: number) => {
      const c = this.add.circle(p.x, p.y, 8).setStrokeStyle(1, color).setDepth(1e5);
      this.tweens.add({ targets: c, radius: r, alpha: 0, duration: 450, onComplete: () => c.destroy() });
    };
    switch (p.char.skill.id) {
      case 'quick_fix':
        for (const s of this.structures) if (Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 110) s.repair();
        p.heal(15);
        ring(110, 0xffcd75);
        break;
      case 'snipe':
        this.fireShot('arrow', 60 * p.char.stats.damageMult, 340, true, p.aim.angle());
        break;
      case 'first_aid':
        p.heal(35);
        p.sanity = Math.min(100, p.sanity + 20);
        this.fx.damageNumber(p.x, p.y - 12, 35, 0xa7f070);
        ring(40, 0xa7f070);
        break;
      case 'harvest_rain':
        for (const s of this.structures) if (s.def.crop && s.crop && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 110) s.boostCrop();
        for (const node of this.chunks.activeSprites()) if (!node.available && Phaser.Math.Distance.Between(p.x, p.y, node.x, node.y) < 110) node.regrowNow();
        ring(110, 0xa7f070);
        break;
      case 'dash': {
        const mv = this.controls.move();
        p.dodge(mv.lengthSq() > 0 ? mv : p.aim, 0.3, 4.2);
        break;
      }
      case 'spirit_ward': {
        const img = this.add.circle(p.x, p.y, 72, 0x5d275d, 0.18).setStrokeStyle(1, 0xa77bdb).setDepth(-0.5);
        this.ward = { x: p.x, y: p.y, r: 72, t: 10, img };
        break;
      }
      case 'overclock':
        p.overclock = 8;
        ring(40, 0x73eff7);
        break;
    }
    EventBus.emit('toast', `${p.char.skill.name}!`, '#ffcd75');
  }

  private updateWard(dt: number) {
    if (!this.ward) return;
    this.ward.t -= dt;
    this.ward.img.setAlpha(0.6 + Math.sin(this.worldTime * 6) * 0.2);
    if (this.ward.t <= 0) {
      this.ward.img.destroy();
      this.ward = null;
    }
  }

  private burnTorch(dt: number) {
    const p = this.player;
    if (p.holdingTorch && p.inventory.wear(p.selected, dt)) EventBus.emit('toast', 'คบไฟมอดดับแล้ว', '#ef7d57');
  }

  // ======================================================================
  // ตกปลา
  // ======================================================================
  private castLine() {
    const p = this.player;
    const x = p.x + p.aim.x * 26;
    const y = p.feetY + p.aim.y * 26;
    if (!isWater(this.tileAt(Math.floor(x / 16), Math.floor(y / 16)))) return EventBus.emit('toast', 'หันหน้าเข้าหาน้ำแล้วเหวี่ยงเบ็ด', '#94b0c2');
    const bobber = this.add.image(p.x, p.y, 'px').setTint(0xb13e53).setScale(1.2).setDepth(1e5);
    this.tweens.add({ targets: bobber, x, y, duration: 350, ease: 'Quad.easeOut' });
    const mark = this.add.text(x, y - 14, '!', { fontFamily: 'monospace', fontSize: '12px', color: '#ffcd75', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(1e6 + 5).setVisible(false);
    // เรือประมง: อวนในตัว ปลากินเร็วขึ้น
    this.fishing = { state: 'wait', t: Phaser.Math.FloatBetween(1.6, 4.5) / (this.riding?.spec.fishing ?? 1), bobber, mark };
    Sfx.play('splash');
    EventBus.emit('toast', '🎣 รอปลากิน… กด E/ใช้ เมื่อเห็น !', '#73eff7');
  }

  private updateFishing(dt: number) {
    const f = this.fishing;
    if (!f) return;
    f.t -= dt;
    f.bobber.y += Math.sin(this.worldTime * (f.state === 'bite' ? 30 : 4)) * 0.08;
    const p = this.player;
    if (Phaser.Math.Distance.Between(p.x, p.y, f.bobber.x, f.bobber.y) > 60) return this.stopFishing('สายเบ็ดขาด');
    if (f.state === 'wait' && f.t <= 0) {
      f.state = 'bite';
      f.t = 0.9;
      f.mark.setVisible(true).setPosition(f.bobber.x, f.bobber.y - 12);
      Sfx.play('splash');
      this.fx.sparks(f.bobber.x, f.bobber.y, 0x73eff7, 6, 8);
    } else if (f.state === 'bite' && f.t <= 0) this.stopFishing('ปลาหลุดไปแล้ว…');
  }

  private reelIn() {
    const f = this.fishing!;
    if (f.state !== 'bite') return this.stopFishing('ดึงเร็วไป ปลาตกใจหนี');
    const deep = this.tileAt(Math.floor(f.bobber.x / 16), Math.floor(f.bobber.y / 16)) === TILE.DEEP;
    // ทะเลลึก: บางทีเบ็ดเกี่ยวสัตว์ทะเลตัวใหญ่ขึ้นมาแทนปลา!
    if (deep && Math.random() < 0.05 && !this.playerSafe) {
      const id = Phaser.Utils.Array.GetRandom(['shark', 'octopus', 'electric_eel', 'jellyfish']);
      const m = this.spawnMob(id, f.bobber.x, f.bobber.y);
      if (m.def.ai === 'neutral') m.hurt(1, this.player, { silent: true });
      Sfx.play('splash');
      this.fx.sparks(f.bobber.x, f.bobber.y, 0x73eff7, 12, 16);
      return this.stopFishing(`🎣 เบ็ดเกี่ยว${m.def.name}ขึ้นมา! ระวังตัว!`);
    }
    const r = Math.random();
    const table: [string, number][] = deep
      ? [['golden_fish', 0.06], ['box_iron', 0.04], ['box_wood', 0.1], ['crab_shell', 0.05], ['fish', 0.75]]
      : this.biomeFx.biomeAt(f.bobber.x, f.bobber.y) === 'atoll'
        ? [['golden_fish', 0.07], ['pearl', 0.05], ['box_wood', 0.08], ['crab_shell', 0.05], ['fish', 0.75]] // ลากูนเกาะปะการัง: ปลาดี ไข่มุก
        : [['golden_fish', 0.02], ['box_wood', 0.06], ['wood', 0.07], ['fiber', 0.05], ['fish', 0.8]];
    let acc = 0;
    let got = 'fish';
    for (const [item, p] of table) if (r < (acc += p)) {
      got = item;
      break;
    }
    if (isBoxTier(got)) got = this.capBox(got, 'fish', f.bobber.x, f.bobber.y);
    this.collect(got, 1, f.bobber.x, f.bobber.y);
    // เรือประมง: ได้ของแถม
    if (this.riding?.spec.fishing && Math.random() < 0.6) this.collect(deep && Math.random() < 0.25 ? 'crab_shell' : 'fish', 1, f.bobber.x, f.bobber.y);
    EventBus.emit('fish');
    Sfx.play('harvest');
    this.stopFishing(`ตกได้ ${ITEMS[got].name}!`);
    this.player.inventory.wear(this.player.selected, 0);
  }

  private stopFishing(msg: string) {
    const f = this.fishing;
    if (!f) return;
    f.bobber.destroy();
    f.mark.destroy();
    this.fishing = null;
    EventBus.emit('toast', msg, '#73eff7');
  }

  // ======================================================================
  // ยานพาหนะ: เรือ / รถ / ม้า / ยานบิน
  // ======================================================================
  /** HP ผู้เล่นเฟรมก่อน (ใช้คำนวณเกราะยาน) */
  private vehHpMark = -1;
  private vehTick = 0;
  private vehWarnAt = 0;

  spawnBoat(id: string, x: number, y: number, hp?: number, fuel = 0, extra?: { energy?: number; cargo?: (Slot | null)[] | null; lv?: number }): Vehicle {
    const b = new Vehicle(this, BUILD[id], x, y);
    if (extra?.lv && extra.lv > 1) b.setLevel(extra.lv, true);
    if (hp !== undefined) b.hp = hp;
    b.fuel = fuel;
    if (extra?.energy !== undefined) b.energy = extra.energy;
    const cargo = extra?.cargo;
    if (cargo && b.storage) b.storage.slots = b.storage.slots.map((_, i) => (cargo[i] ? { ...cargo[i]! } : null));
    this.boats.push(b);
    return b;
  }

  /** ยานที่จอดอยู่ใกล้ผู้เล่น (กด E ขึ้น) */
  private vehicleNear(): Vehicle | undefined {
    const p = this.player;
    let best: Vehicle | undefined;
    let bd = Infinity;
    for (const b of this.boats) {
      if (b.riding) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, b.x, b.y);
      if (d < Math.max(26, b.width * 0.45) && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  private board(b: Vehicle) {
    const p = this.player;
    if (this.fishing) this.stopFishing('เก็บเบ็ดแล้ว');
    this.riding = b;
    b.riding = true;
    b.vel.set(0, 0);
    p.riding = true;
    p.setPosition(b.x, b.y - 6);
    p.body.setVelocity(0, 0);
    this.vehHpMark = p.hp;
    Sfx.play(b.kind === 'water' ? 'splash' : 'step');
    if (b.spec.fuel && b.fuel <= 0 && !this.refuelVehicle(b)) {
      EventBus.emit('toast', `${b.def.name}ไม่มีเชื้อเพลิง — ไปได้ช้าๆ (พก${b.fuelItems.map(([i]) => ITEMS[i].name).join('/')}ไว้ในกระเป๋า)`, '#ef7d57');
    }
    if (b.spec.energy?.food && b.energy < 50) this.feedVehicle(b);
    const how = b.kind === 'water' ? 'E ใกล้ฝั่ง = ขึ้นบก' : b.kind === 'air' ? 'E เหนือพื้นดิน = ลงจอด' : 'E = ลงจากยาน';
    const extra = ['Shift = เร่ง', b.spec.gun ? 'คลิก = ยิง' : '', b.storage ? 'Space = ห้องเก็บของ' : '', b.spec.fishing ? 'Space = ตกปลา' : ''].filter(Boolean).join(' · ');
    EventBus.emit('toast', `${b.spec.icon} ขึ้น${b.def.name}แล้ว — ${how} · ${extra}`, '#73eff7');
  }

  /** เติมเชื้อเพลิงจากกระเป๋า (ชิ้นแรกที่มี) */
  private refuelVehicle(b: Vehicle): boolean {
    const inv = this.player.inventory;
    for (const [item, sec] of b.fuelItems) {
      if (inv.count(item) <= 0) continue;
      inv.remove(item, 1);
      b.fuel += sec;
      EventBus.emit('toast', `⛽ เติม${ITEMS[item].name}ให้${b.def.name} (${Math.ceil(b.fuel)} วิ)`, '#ffcd75');
      return true;
    }
    return false;
  }

  /** ให้อาหารม้า (กินจากกระเป๋าอัตโนมัติ) */
  private feedVehicle(b: Vehicle): boolean {
    const inv = this.player.inventory;
    for (const [item, n] of b.spec.energy?.food ?? []) {
      if (inv.count(item) <= 0) continue;
      inv.remove(item, 1);
      b.energy = Math.min(100, b.energy + n);
      EventBus.emit('toast', `${b.spec.icon} ${b.def.name}กิน${ITEMS[item].name} (แรง ${Math.round(b.energy)}%)`, '#a7f070');
      return true;
    }
    return false;
  }

  /** จุดลงจากยาน: เรือ = ฝั่งใกล้ๆ · ยานบก = ข้างตัว · ยานบิน = พื้นดินใต้/รอบตัว */
  private dismountSpot(b: Vehicle): { x: number; y: number } | null {
    const radii = b.kind === 'water' ? [16, 24, 32, 40] : b.kind === 'land' ? [14, 22, 0] : [0, 12, 20, 28, 36];
    for (const r of radii) {
      for (let a = 0; a < (r ? 8 : 1); a++) {
        const ang = (a / 8) * Math.PI * 2;
        const x = b.x + Math.cos(ang) * r;
        const y = b.y + Math.sin(ang) * r;
        const tx = Math.floor(x / 16);
        const ty = Math.floor(y / 16);
        const t = this.tileAt(tx, ty);
        if (!isWater(t) && t !== TILE.ROCKWALL && !this.isTileBlocked(tx, ty) && !this.structureAt(tx, ty, 'object')) return { x, y };
      }
    }
    return null;
  }

  /** E ขณะขี่: เรือประมง/เรือขนส่งกลางทะเล = ใช้ความสามารถ · ที่เหลือ = ลงจากยาน */
  private ridingInteract() {
    const b = this.riding!;
    if (b.kind === 'water' && (b.spec.fishing || b.storage) && !this.dismountSpot(b)) return this.vehicleAction();
    this.dismount();
  }

  private dismount(force = false): boolean {
    const b = this.riding!;
    const p = this.player;
    let spot = this.dismountSpot(b);
    if (!spot && b.kind === 'land') spot = { x: p.x, y: p.y + 8 };
    if (!spot) {
      if (!force) EventBus.emit('toast', b.kind === 'air' ? 'ต้องบินเหนือพื้นดินก่อนลงจอด' : 'ต้องเข้าใกล้ฝั่งก่อน', '#94b0c2');
      return false;
    }
    if (this.fishing) this.stopFishing('เก็บเบ็ดแล้ว');
    this.riding = null;
    b.riding = false;
    b.vel.set(0, 0);
    p.riding = false;
    p.body.setVelocity(0, 0);
    // ยานบินร่อนลงจอดตรงจุดนั้น
    if (b.kind === 'air') b.setPosition(spot.x, spot.y + 4);
    if (b.alt <= 0) b.setDepth(b.y);
    p.setPosition(spot.x, spot.y - 8);
    Sfx.play('step');
    return true;
  }

  /** Space ขณะขี่: ตกปลา (เรือประมง) / ห้องเก็บของ / บีบแตร */
  private vehicleAction() {
    const b = this.riding!;
    if (b.spec.fishing && b.kind === 'water') return this.fishing ? this.reelIn() : this.castLine();
    if (b.storage) return void EventBus.emit('ui:storage', b);
    Sfx.play(b.spec.energy && b.kind === 'land' ? 'growl' : 'horn', 600);
  }

  /** Shift = เร่ง: ยานน้ำมันกินน้ำมันเพิ่ม · ม้า/เครื่องร่อนใช้แรง · พาย/ปั่นใช้แรงผู้เล่น */
  private vehicleBoost(b: Vehicle, dt: number): boolean {
    if (b.spec.fuel) return b.fuel > 0;
    if (b.spec.energy) return b.energy > 5;
    const p = this.player;
    if (p.stamina < 5) return false;
    p.stamina = Math.max(0, p.stamina - 16 * dt);
    return true;
  }

  /** ใช้น้ำมัน/แรง ระหว่างขี่ */
  private burnVehicle(b: Vehicle, dt: number, moving: boolean, boost: boolean) {
    const spec = b.spec;
    if (spec.fuel && moving && b.fuel > 0) {
      b.fuel = Math.max(0, b.fuel - dt * b.fuelUse * (boost ? 2.5 : 1));
      if (b.fuel <= 0 && !this.refuelVehicle(b)) EventBus.emit('toast', `⛽ ${b.def.name}น้ำมันหมด! — ไปต่อได้ช้าๆ`, '#ef7d57');
    }
    const e = spec.energy;
    if (!e) return;
    const flying = b.kind === 'air';
    if (moving || flying) b.energy = Math.max(0, b.energy - e.drain * dt * (boost ? 3 : 1));
    else b.energy = Math.min(100, b.energy + e.regen * 0.5 * dt); // ม้ายืนพัก
    if (b.energy < 25 && this.worldTime > this.vehWarnAt) {
      this.vehWarnAt = this.worldTime + 6;
      if (e.food && this.feedVehicle(b)) return;
      if (b.energy <= 0) EventBus.emit('toast', flying ? '🪂 แรงลอยหมด — ร่อนช้าลง หาพื้นดินลงจอดพัก' : `${spec.icon} ${b.def.name}เหนื่อยแล้ว — หยุดพักหรือพกแครอท/เบอร์รี่`, '#ef7d57');
    }
  }

  /** ยานที่จอดอยู่: ยานบินร่อนลง · ม้า/เครื่องร่อนฟื้นแรงบนบก · เรือใกล้ท่าเรือซ่อมตัวเอง */
  private tickVehicles(dt: number) {
    this.vehTick -= dt;
    const slow = this.vehTick <= 0;
    if (slow) this.vehTick = 1;
    for (const b of this.boats) {
      if (b.riding) continue;
      if (b.alt > 0) {
        b.alt = Math.max(0, b.alt - dt * 20);
        b.syncLift();
        if (b.alt <= 0) b.setDepth(b.y);
      }
      if (!slow) continue;
      const e = b.spec.energy;
      if (e && b.energy < 100 && !isWater(this.tileAt(Math.floor(b.x / 16), Math.floor(b.y / 16)))) b.energy = Math.min(100, b.energy + e.regen);
      if (b.kind === 'water' && b.hp < b.maxHp && this.structures.some((s) => s.def.dock && Phaser.Math.Distance.Between(s.x, s.y - 8, b.x, b.y) < 44)) {
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.02);
      }
    }
  }

  private updateBoat(dt: number) {
    const b = this.riding!;
    const p = this.player;
    const c = this.controls;
    const spec = b.spec;
    // เกราะยาน: ดาเมจที่คนขับโดนตั้งแต่เฟรมก่อน → ตัวยานรับแทนบางส่วน
    if (b.armor && this.vehHpMark > 0 && p.hp > 0 && p.hp < this.vehHpMark - 0.9) {
      const absorbed = (this.vehHpMark - p.hp) * b.armor;
      p.hp += absorbed;
      this.damageVehicle(b, absorbed);
      if (this.riding !== b) return;
    }
    if (!this.uiOpen && c.pressed('dodge')) this.vehicleAction();
    const land = b.kind === 'land';
    const mv = this.uiOpen ? new Phaser.Math.Vector2() : c.move();
    const input = mv.lengthSq() > 0.01;
    b.gunCd = Math.max(0, b.gunCd - dt);
    if (land) b.vel.set(p.body.velocity.x, p.body.velocity.y); // ชนต้นไม้/กำแพงแล้วหยุดจริง
    const boost = input && c.held('sprint') && this.vehicleBoost(b, dt);
    let max = b.speed * (boost ? 1.35 : 1);
    if (spec.sail && this.weather.raining) max *= 1.3;
    if (land && spec.terrain) max *= spec.terrain[this.tileAt(Math.floor(b.x / 16), Math.floor(b.y / 16))] ?? 1;
    // ความเร่ง/การเลี้ยว: ความเร็วค่อยๆ เข้าหาเป้า (เรือไถลต่อนิดหน่อยตอนปล่อยปุ่ม)
    const acc = b.accel * (input ? 1 : land ? 2.2 : 0.6);
    const dvx = mv.x * max - b.vel.x;
    const dvy = mv.y * max - b.vel.y;
    const dl = Math.hypot(dvx, dvy);
    if (dl > 0) {
      const step = Math.min(dl, acc * dt);
      b.vel.x += (dvx / dl) * step;
      b.vel.y += (dvy / dl) * step;
    }
    let vx = b.vel.x;
    let vy = b.vel.y;
    if (b.kind === 'water') {
      const nx = Math.floor((b.x + Math.sign(vx) * 10 + vx * dt) / 16);
      const ny = Math.floor((b.y + Math.sign(vy) * 6 + vy * dt) / 16);
      if (!isWater(this.tileAt(nx, Math.floor(b.y / 16)))) vx = 0;
      if (!isWater(this.tileAt(Math.floor(b.x / 16), ny))) vy = 0;
    } else if (land) {
      // ยานบกลงน้ำไม่ได้ (ต้นไม้/หิน/กำแพง/ผนังถ้ำ ชนด้วยฟิสิกส์ของผู้เล่น)
      const nx = Math.floor((b.x + Math.sign(vx) * 8 + vx * dt) / 16);
      const ny = Math.floor((b.y + Math.sign(vy) * 5 + vy * dt) / 16);
      if (isWater(this.tileAt(nx, Math.floor(b.y / 16)))) vx = 0;
      if (isWater(this.tileAt(Math.floor(b.x / 16), ny))) vy = 0;
    } else {
      // ยานบิน: ห้ามบินเข้าแมพย่อย (ดันเจี้ยน)
      if (isInterior(this.world.slotIndexAt(Math.floor((b.x + Math.sign(vx) * 10 + vx * dt) / 16), Math.floor(b.y / 16)))) vx = 0;
      if (isInterior(this.world.slotIndexAt(Math.floor(b.x / 16), Math.floor((b.y + Math.sign(vy) * 10 + vy * dt) / 16)))) vy = 0;
    }
    // เกาะพิเศษปิดอยู่ → พายุมิติกั้นไว้ เข้าไม่ได้ (ทั้งเรือและยานบิน)
    if (!land && !this.special.open && this.inSpecialZone(b.x + vx * dt, b.y + vy * dt) && !this.inSpecialZone(b.x, b.y)) {
      vx = 0;
      vy = 0;
      if (this.worldTime > this.barrierToastAt) {
        this.barrierToastAt = this.worldTime + 3;
        EventBus.emit('toast', `🌀 พายุมิติกั้นเกาะมหาสมบัติ — เปิดอีก ${fmtLeft(this.special.msLeft)}`, '#a77bdb');
      }
    }
    b.vel.set(vx, vy);
    const moving = Math.abs(vx) + Math.abs(vy) > 1;
    this.burnVehicle(b, dt, moving, boost);
    // ค่าสถานะยังลดตามปกติ (หิว/กระหาย)
    p.update(dt, c, true, this.environment());
    if (land) {
      p.body.setVelocity(vx, vy);
      b.setPosition(p.x, p.y + 6);
    } else {
      const bd = this.world.bounds;
      b.x = Phaser.Math.Clamp(b.x + vx * dt, bd.x0 * 16 + 20, bd.x1 * 16 - 20);
      b.y = Phaser.Math.Clamp(b.y + vy * dt, bd.y0 * 16 + 20, bd.y1 * 16 - 20);
      if (b.kind === 'air') b.alt = Math.min(spec.lift ?? 14, b.alt + dt * 24);
      p.body.setVelocity(0, 0);
    }
    b.face(vx, vy);
    b.syncLift();
    b.setDepth(b.kind === 'air' && b.alt > 4 ? 1.5e5 + b.y : b.y);
    b.trail(dt, moving);
    const bob = b.kind === 'water' ? Math.sin(this.worldTime * 3) * 0.6 : b.kind === 'air' ? Math.sin(this.worldTime * 2) * 1.2 : 0;
    if (!land) p.setPosition(b.x, b.y - 6 - b.alt + bob);
    p.setDepth(b.depth + 1);
    p.setFrame(Math.abs(vy) > Math.abs(vx) && vy < 0 ? 3 : Math.abs(vx) > 1 ? 6 : 0).setFlipX(vx < 0);
    this.vehHpMark = p.hp;
  }

  /** ยิงปืนติดยาน (เรือรบ/รถถัง) — คลิก/ปุ่มโจมตีขณะขี่ · ใช้กระสุนกลุ่มเดียวกับผู้เล่น */
  vehicleShoot() {
    const b = this.riding;
    const g = b?.spec.gun;
    if (!b || !g || b.gunCd > 0 || this.noFight()) return;
    b.gunCd = g.cooldown;
    const p = this.player;
    const dmg = g.damage * p.char.stats.damageMult * (1 + p.stats.atk / 100);
    const n = g.shots ?? 1;
    const base = p.aim.angle();
    const ox = b.x;
    const oy = b.y - 8 - b.alt;
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i - (n - 1) / 2) * 0.16 : 0);
      this.fireShot(g.projectile, dmg, g.speed, false, a, g.splash ?? 0, { x: ox + Math.cos(a) * 12, y: oy + Math.sin(a) * 8 });
    }
    this.fx.sparks(ox + Math.cos(base) * 14, oy + Math.sin(base) * 10, 0xffcd75, 8, 14);
    this.fx.poof(ox + Math.cos(base) * 14, oy + Math.sin(base) * 10, 0x94b0c2, 5);
    this.cameras.main.shake(90, 0.004);
    Sfx.play('breakRock', 120);
    // แรงถีบ
    b.vel.x -= Math.cos(base) * 25;
    b.vel.y -= Math.sin(base) * 25;
  }

  /** สัตว์ทะเลโจมตียานที่ขี่อยู่ (Mob เรียก) */
  damageBoat(n: number) {
    const b = this.riding;
    if (!b) return;
    if (b.spec.immune) {
      this.fx.sparks(b.x, b.y - 4, 0x73eff7, 4, 10);
      return;
    }
    this.damageVehicle(b, n);
  }

  /** ยานรับดาเมจ — พัง = ลงจากยาน + ของในห้องเก็บของหล่นเป็นถุง */
  damageVehicle(b: Vehicle, n: number) {
    this.fx.damageNumber(b.x, b.y - 10 - b.alt, n, 0xef7d57);
    if (!b.damage(n)) return;
    const p = this.player;
    EventBus.emit('toast', b.kind === 'water' ? `💥 ${b.def.name}แตก! ว่ายน้ำเข้าฝั่ง…` : `💥 ${b.def.name}พังแล้ว!`, '#b13e53');
    if (this.riding === b && !this.dismount(true)) {
      this.riding = null;
      b.riding = false;
      p.riding = false;
      p.setPosition(this.world.spawn.tx * 16 + 8, this.world.spawn.ty * 16 + 8);
    }
    const items = (b.storage?.slots ?? []).filter((s): s is Slot => !!s);
    if (items.length) this.graves.push({ x: p.x, y: p.y + 8, items, sprite: this.add.image(p.x, p.y + 8, 'grave_bag').setOrigin(0.5, 1).setDepth(p.y + 8) });
    this.fx.debris(b.x, b.y - 4, 0x8a5a35, 12);
    this.boats = this.boats.filter((x) => x !== b);
    b.destroy();
  }

  /** รื้อยานที่จอดอยู่ (โหมดรื้อ) — ของในห้องเก็บของหล่นเป็นถุง */
  removeVehicle(b: Vehicle) {
    if (b.riding) return;
    const items = (b.storage?.slots ?? []).filter((s): s is Slot => !!s);
    if (items.length) this.graves.push({ x: b.x, y: b.y, items, sprite: this.add.image(b.x, b.y, 'grave_bag').setOrigin(0.5, 1).setDepth(b.y) });
    this.fx.debris(b.x, b.y - 4, 0x8a5a35, 10);
    this.boats = this.boats.filter((x) => x !== b);
    b.destroy();
  }

  /** คำใบ้ขณะขี่: ปุ่ม E ทำอะไร + สถานะยาน */
  private ridingHint(): string {
    const b = this.riding!;
    const v = b.spec;
    const spot = b.kind === 'land' || !!this.dismountSpot(b);
    const parts: string[] = [];
    if (b.kind === 'water') parts.push(spot ? 'ขึ้นฝั่ง' : v.fishing ? 'ตกปลา' : b.storage ? 'เปิดห้องเก็บของ' : 'ขึ้นฝั่ง (ใกล้ฝั่ง)');
    else if (b.kind === 'air') parts.push(spot ? 'ลงจอด' : 'ลงจอด (ต้องอยู่เหนือพื้นดิน)');
    else parts.push(`ลงจาก${b.def.name}`);
    parts.push(`${v.icon} HP ${Math.ceil(b.hp)}/${b.maxHp}`);
    if (v.fuel) parts.push(`⛽ ${Math.ceil(b.fuel)} วิ`);
    if (v.energy) parts.push(`แรง ${Math.round(b.energy)}%`);
    if (v.gun) parts.push('คลิก = ยิง');
    if (b.storage) parts.push('Space = ห้องเก็บของ');
    return parts.join(' · ');
  }

  // ======================================================================
  // สิ่งก่อสร้าง
  // ======================================================================
  placeStructure(def: BuildDef, tx: number, ty: number, silent = false): Structure {
    const s = new Structure(this, def, tx, ty, this.player.char.passive.structureHp ?? 1);
    this.structures.push(s);
    const layer = def.layer === 'terrain' ? 'floor' : def.layer;
    for (const [x, y] of s.tiles()) this.structureMap.set(tkey(layer, x, y), s);
    if (def.layer === 'object' && def.blocks !== 'none') {
      (def.blocks === 'mobs' ? this.doorBlockers : this.structBlockers).add(s);
      const body = s.body as Phaser.Physics.Arcade.StaticBody;
      const bw = def.w * 16 - (def.w > 1 ? 4 : 0);
      const bh = Math.min(def.h * 16 - 2, def.w > 1 ? def.h * 16 - 4 : 14);
      if (def.id === 'campfire') body.setSize(12, 6, false).setOffset((s.width - 12) / 2, s.height - 7);
      else body.setSize(bw, bh, false).setOffset((s.width - bw) / 2, s.height - bh - 1);
    }
    if (!silent) this.fx.poof(s.x, s.y - 2, 0xc28a50, 6);
    return s;
  }

  removeStructure(s: Structure, dropStorage = false) {
    if (dropStorage && s.storage) for (const slot of s.storage.slots) if (slot) this.spawnDrop(s.x, s.y - 4, slot.id, slot.qty);
    this.structures = this.structures.filter((x) => x !== s);
    const layer = s.def.layer === 'terrain' ? 'floor' : s.def.layer;
    for (const [x, y] of s.tiles()) if (this.structureMap.get(tkey(layer, x, y)) === s) this.structureMap.delete(tkey(layer, x, y));
    s.destroy();
  }

  damageStructure(s: Structure, amount: number) {
    if (!s.active || s.getData('foreign')) return;
    Sfx.play('hitWood', 120);
    if (s.damage(amount)) {
      this.fx.debris(s.x, s.y - 6, 0x8a5a35, 10);
      Sfx.play('breakWood');
      this.removeStructure(s, true);
    }
  }

  /** ดาเมจสิ่งก่อสร้างที่ใกล้จุดนี้ · impact = แรงกระแทกจากภัย (หิน ×0.6 เหล็ก ×0.4) · fire = ไหม้เฉพาะของไม้/หญ้า */
  damageStructureAt(x: number, y: number, amount: number, kind: 'raw' | 'impact' | 'fire' = 'raw') {
    const s = this.nearestStructureTo(x, y, 24, kind === 'fire' ? (st) => burnable(st.def) : undefined);
    if (s) this.damageStructure(s, kind === 'impact' ? amount * IMPACT_MULT[materialOf(s.def)] : amount);
  }

  /** เปลี่ยนพื้น (ภูมิทัศน์) */
  paintTile(tx: number, ty: number, t: number) {
    this.clearNodeAt(tx, ty);
    this.world.setTile(tx, ty, t);
    this.paintedTiles.set(`${tx},${ty}`, t);
    this.chunksR.refreshAt(tx, ty);
  }

  private updateStructures(dt: number) {
    const p = this.player;
    // ไฟฟ้า: ทุก 1 วิ คำนวณว่าเครื่องไหนได้ไฟ (+ ระบบรอบละวินาที: ความสบาย/ระฆัง/คลังอัตโนมัติ)
    this.powerTimer -= dt;
    if (this.powerTimer <= 0) {
      this.powerTimer = 1;
      this.structTick++;
      const sources = this.structures.filter((s) => s.powerSource > 0);
      for (const s of this.structures) {
        if (s.def.power !== 'use') continue;
        s.powered = sources.some((g) => Phaser.Math.Distance.Between(g.x, g.y, s.x, s.y) < g.powerSource * 16);
      }
      this.structureSecond();
    }
    const baseCrop = (p.char.passive.cropSpeed ?? 1) * (this.weather.raining ? 1.5 : 1);
    // คำนวณครั้งเดียวต่อเฟรม (และเฉพาะเมื่อมีคนใช้)
    let sprinklers: Structure[] | null = null;
    let auras: Structure[] | null = null;
    let mobs: Mob[] | null = null;
    const mobsNow = () => (mobs ??= this.mobList());
    const fuelMult = this.weather.raining ? 2 : 1;
    for (const s of this.structures) {
      let crop = baseCrop;
      if (s.def.crop) {
        sprinklers ??= this.structures.filter((k) => k.def.sprinkler && k.powered);
        auras ??= this.structures.filter((a) => a.def.growAura && !a.getData('foreign'));
        if (sprinklers.some((k) => Phaser.Math.Distance.Between(k.x, k.y, s.x, s.y) < 40)) crop *= 2;
        // ปุ๋ยหมัก/โรงเพาะชำ/โรงนา: ใช้ตัวคูณสูงสุดที่ครอบคลุม
        let aura = 1;
        for (const a of auras) if (Phaser.Math.Distance.Between(a.x, a.y - a.def.h * 8, s.x, s.y) < a.def.growAura!.r) aura = Math.max(aura, a.def.growAura!.mult);
        crop *= aura;
      }
      s.tick(dt, crop, fuelMult);
      if (s.getData('foreign')) continue;
      // อาคารผลิต (โรงเลื่อย เตาเผาถ่าน รังผึ้ง เล้าไก่ ไซดักปลา ...)
      if (s.def.prod) {
        const got = s.produce(dt);
        if (got?.length && Phaser.Math.Distance.Between(p.x, p.y, s.x, s.y) < 200) this.fx.sparks(s.x, s.y - s.height * 0.5, 0xa7f070, 4, 10);
      }
      // ถังเก็บน้ำฝน
      if (s.def.water === 'rain') s.water = Math.min(RAIN_WATER_CAP, s.water + dt / (this.weather.raining ? 15 : 120));
      // กับดัก
      if (s.def.trap && s.cooldown <= 0 && this.trapTick(s, mobsNow())) continue;
      // ป้อมยิง
      const tur = s.turret; // ค่าหลังคูณเลเวลอัพเกรด
      if (tur && s.cooldown <= 0 && (s.def.power !== 'use' || s.powered)) {
        let target: Mob | null = null;
        let bd = tur.range;
        const minR = tur.minRange ?? 0;
        for (const m of mobsNow()) {
          if (!m.hostile || !m.active) continue;
          const d = Phaser.Math.Distance.Between(s.x, s.y - 12, m.x, m.y);
          if (d < bd && d >= minR) {
            bd = d;
            target = m;
          }
        }
        if (target) {
          s.cooldown = tur.cooldown;
          this.turretFire(s, tur, target);
        }
      }
      // เครื่องขุดแร่
      if (s.def.miner && s.powered && s.cooldown <= 0) {
        s.cooldown = 25 / s.prodMult;
        const spec = this.world.homeIsland.specialty;
        const r = Math.random();
        const item = r < 0.45 ? 'stone' : r < 0.7 ? 'coal' : r < 0.9 ? 'iron_ore' : spec === 'iron' ? 'iron_ore' : spec === 'coal' ? 'coal' : spec === 'sulfur' ? 'sulfur' : spec === 'gold' ? 'gold_ore' : 'crystal';
        s.storage?.add(item, item === 'stone' ? 3 : 1);
      }
    }
  }

  /** กับดักแต่ละชนิด — คืน true ถ้าสิ่งก่อสร้างถูกทำลาย/ใช้หมดแล้ว */
  private trapTick(s: Structure, mobs: Mob[]): boolean {
    const kind = s.def.trapKind ?? 'spike';
    const near = (r: number) => mobs.filter((m) => m.hostile && !m.ignoresWalls && m.active && Phaser.Math.Distance.Between(m.x, m.feetY, s.x, s.y - 4) < r);
    if (kind === 'frost') {
      // ทำให้ช้า (สถานะเย็น ~1 วิ ต่ออายุเมื่อใกล้หมด) + ความเย็นกัดทุก 0.5 วิ
      const list = near(26);
      for (const m of list) if (m.chillTime < 0.3) m.applyStatus('freeze', 1, 0.65);
      if (list.length && Math.random() < 0.25) this.fx.sparks(s.x, s.y - 4, 0x73eff7, 2, 8);
      if (list.length) {
        s.cooldown = 0.5;
        for (const m of list) m.hurt(4 * s.dmgMult, undefined, { silent: true });
        this.damageStructure(s, 1);
      }
      return !s.active;
    }
    const m = near(kind === 'bomb' ? 12 : 9)[0];
    if (!m) return false;
    if (kind === 'bomb') {
      this.explode(s.x, s.y - 4, 40, 90 * s.dmgMult, true);
      this.removeStructure(s, false);
      return true;
    }
    if (kind === 'snare') {
      m.hurt(40 * s.dmgMult, { x: s.x, y: s.y });
      this.fx.sparks(s.x, s.y - 4, 0x94b0c2, 6, 10);
      Sfx.play('hitRock', 120);
      s.cooldown = 2.5;
      this.damageStructure(s, 6);
      return !s.active;
    }
    m.hurt(BALANCE.spikeDamage * s.dmgMult);
    s.cooldown = 0.5;
    this.damageStructure(s, BALANCE.spikeSelfDamage);
    return !s.active;
  }

  /** ป้อมยิงแต่ละแบบ: กระสุนตรง / ทะลุ / ไฟ / สายฟ้ากระโดด / ยิงโค้ง (ปืนครก) */
  private turretFire(s: Structure, tur: NonNullable<BuildDef['turret']>, target: Mob) {
    const from = { x: s.x, y: s.y - Math.max(14, Math.min(s.displayHeight * 0.7, 56)) };
    if (tur.chain) {
      // สายฟ้าเทสลา: ฟาดเป้าแรกแล้วกระโดดต่อ ดาเมจลดลงทีละ 20%
      const hit = new Set<Mob>();
      let prev = from;
      let cur: Mob | undefined = target;
      let dmg = tur.damage;
      for (let i = 0; i < tur.chain && cur; i++) {
        hit.add(cur);
        this.lightningBolt(prev.x, prev.y, cur.x, cur.y - 4);
        cur.hurt(dmg, prev);
        prev = { x: cur.x, y: cur.y - 4 };
        dmg *= 0.8;
        const c0: Mob = cur;
        cur = this.mobList().find((o) => !hit.has(o) && o.active && o.hostile && Phaser.Math.Distance.Between(c0.x, c0.y, o.x, o.y) < 70);
      }
      Sfx.play('thunder', 200);
      return;
    }
    if (tur.lob) {
      // ปืนครก: ลูกโค้งข้ามกำแพง ตกระเบิดที่ตำแหน่งเป้า (ณ ตอนยิง + เผื่อทางเดินเล็กน้อย)
      const tx = target.x + target.body.velocity.x * 0.4;
      const ty = target.y + target.body.velocity.y * 0.4;
      const ball = this.add.image(from.x, from.y, 'cannonball').setDepth(1e6);
      const dist = Phaser.Math.Distance.Between(from.x, from.y, tx, ty);
      const dur = 500 + dist * 2.2;
      const arc = 30 + dist * 0.35;
      this.tweens.addCounter({
        from: 0, to: 1, duration: dur,
        onUpdate: (tw) => {
          const k = tw.getValue() ?? 0;
          ball.setPosition(from.x + (tx - from.x) * k, from.y + (ty - from.y) * k - Math.sin(k * Math.PI) * arc).setScale(1 + Math.sin(k * Math.PI) * 0.5);
        },
        onComplete: () => {
          ball.destroy();
          this.explode(tx, ty, tur.splash ?? 36, tur.damage, true);
        },
      });
      this.fx.poof(from.x, from.y, 0x94b0c2, 5);
      Sfx.play('breakRock', 150);
      return;
    }
    const a = Phaser.Math.Angle.Between(from.x, from.y, target.x, target.y);
    const speed = tur.speed ?? (tur.projectile === 'cannonball' ? 220 : 320);
    const shot = this.fireShot(tur.projectile, tur.damage, speed, !!tur.pierce, a, tur.splash ?? 0, from);
    if (tur.life) shot.setData('life', tur.life);
    if (tur.pierce && tur.projectile === 'arrow') shot.setScale(1.6); // ลูกดอกยักษ์
    if (tur.burn) target.burnTime = Math.max(target.burnTime, tur.burn);
    Sfx.play(tur.projectile === 'cannonball' ? 'breakRock' : tur.projectile === 'fireball' ? 'fire' : 'bow', 150);
  }

  /** เส้นสายฟ้าหยักๆ (จางหายเร็ว) */
  private lightningBolt(x0: number, y0: number, x1: number, y1: number) {
    const g = this.add.graphics().setDepth(1e6 + 4);
    const pts: Phaser.Math.Vector2[] = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const j = i === 0 || i === n ? 0 : Phaser.Math.Between(-5, 5);
      pts.push(new Phaser.Math.Vector2(x0 + (x1 - x0) * k + j, y0 + (y1 - y0) * k + j * 0.6));
    }
    g.lineStyle(3, 0x41a6f6, 0.6).strokePoints(pts);
    g.lineStyle(1, 0xf4f4f4, 1).strokePoints(pts);
    this.fx.sparks(x1, y1, 0x73eff7, 4, 10);
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  /** ระบบสิ่งก่อสร้างที่ทำทุก 1 วินาที: ของตกแต่งฟื้นสติ · ระฆังเตือนภัย · คลังอัตโนมัติดูดผลผลิต */
  private structureSecond() {
    const p = this.player;
    let comfort = 0;
    for (const s of this.structures) {
      if (s.getData('foreign')) continue;
      const d = s.def;
      if (d.comfort && Phaser.Math.Distance.Between(p.x, p.feetY, s.x, s.y - 4) < 72 + d.w * 8) comfort += d.comfort;
      if (d.alarm && this.worldTime >= ((s.getData('alarmAt') as number | undefined) ?? 0)) {
        const enemy = this.mobList().find((m) => m.hostile && Phaser.Math.Distance.Between(m.x, m.y, s.x, s.y) < 224);
        if (enemy) {
          s.setData('alarmAt', this.worldTime + 30);
          EventBus.emit('toast', `🔔 ระฆังเตือนภัย: ${enemy.def.name} บุกเข้าใกล้ฐาน!`, '#ef7d57');
          Sfx.play('horn');
          this.tweens.add({ targets: s, angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: 5, onComplete: () => s.setAngle(0) });
        }
      }
      if (d.collect && s.storage && this.structTick % 5 === 0) this.collectInto(s);
    }
    if (comfort > 0 && p.hp > 0) p.sanity = Math.min(100, p.sanity + Math.min(comfort, 1.2));
  }

  /** คลังอัตโนมัติ: ย้ายผลผลิตจากอาคารผลิตในรัศมีเข้าคลัง */
  private collectInto(dst: Structure) {
    const inv = dst.storage!;
    const r = dst.def.collect! * 16;
    for (const src of this.structures) {
      if (src === dst || !src.def.prod || !src.storage || src.getData('foreign')) continue;
      if (Phaser.Math.Distance.Between(src.x, src.y, dst.x, dst.y) > r) continue;
      const outs = new Set(src.def.prod.recipes.flatMap((x) => x.out.map((o) => o[0])));
      const slots = src.storage.slots;
      let moved = false;
      for (let i = 0; i < slots.length; i++) {
        const sl = slots[i];
        if (!sl || !outs.has(sl.id)) continue;
        const left = inv.add(sl.id, sl.qty);
        if (left === sl.qty) continue;
        moved = true;
        if (left <= 0) slots[i] = null;
        else sl.qty = left;
      }
      if (moved) {
        src.storage.version++;
        this.fx.sparks(src.x, src.y - 8, 0xffcd75, 3, 8);
      }
    }
  }

  // ======================================================================
  // ของตก
  // ======================================================================
  spawnDrop(x: number, y: number, itemId: string, qty: number, slot?: Slot) {
    if (qty > 0) {
      const d = new DroppedItem(this, x, y, itemId, qty);
      if (slot) d.setData('slot', slot);
      const r = ITEMS[itemId]?.rarity;
      if (r && r !== 'common') {
        const glow = this.add.image(x, y, 'glow_cool').setTint(RARITY[r].hex).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.6).setDepth(y - 1);
        d.setData('glow', glow);
      }
      this.drops.push(d);
    }
  }

  private updateDrops(dt: number) {
    const p = this.player;
    this.drops = this.drops.filter((d) => {
      d.delay -= dt;
      d.life -= dt;
      const glow = d.getData('glow') as Phaser.GameObjects.Image | undefined;
      glow?.setPosition(d.x, d.y);
      if (d.life <= 0) {
        glow?.destroy();
        d.destroy();
        return false;
      }
      if (d.delay > 0 || this.riding) return true;
      const dist = Phaser.Math.Distance.Between(d.x, d.y, p.x, p.feetY - 2);
      if (dist < 40) {
        const v = new Phaser.Math.Vector2(p.x - d.x, p.feetY - 2 - d.y).normalize().scale(150 * dt);
        d.x += v.x;
        d.y += v.y;
        d.setDepth(d.y);
      }
      if (dist < 7) {
        const slot = d.getData('slot') as Slot | undefined;
        let left: number;
        if (slot) left = p.inventory.addSlot(slot) ? 0 : d.qty;
        else if (d.itemId === 'coin' || d.itemId === 'gem') {
          this.collect(d.itemId, d.qty, d.x, d.y);
          left = 0;
        } else {
          left = p.inventory.add(d.itemId, d.qty);
          if (d.qty - left > 0) EventBus.emit('pickup', d.itemId, d.qty - left);
        }
        if (left < d.qty) Sfx.play('pickup', 60);
        if (left === 0) {
          glow?.destroy();
          d.destroy();
          return false;
        }
        d.qty = left;
        d.delay = 2;
      }
      return true;
    });
  }

  /** กล่องรางวัลข้างตัวผู้เล่น — tier ต้องผ่าน capBox มาแล้ว (ภัยกลางวัน/คืนภัยพิบัติ) */
  spawnRewardChest(tier: BoxTier) {
    const p = this.player;
    this.spawnDrop(p.x + Phaser.Math.Between(-10, 10), p.y + 10, tier, 1);
    this.fx.sparks(p.x, p.y, RARITY.legendary.hex, 16, 24);
  }

  /** อุกกาบาตตก: เตือน → ระเบิด → ทิ้งหินอุกกาบาต · avoidShelter = ภัยกลางวัน (สุ่มจุดใหม่นอกเขตปลอดภัยของบ้าน) */
  dropMeteor(avoidShelter = false) {
    const p = this.player;
    const pick = () => ({ x: p.x + Phaser.Math.Between(-140, 140), y: p.y + Phaser.Math.Between(-100, 100) });
    const pt = avoidShelter ? this.shelter.outside(pick) : pick();
    if (!pt) return;
    const { x, y } = pt;
    const tx = Math.floor(x / 16);
    const ty = Math.floor(y / 16);
    if (isWater(this.tileAt(tx, ty)) || this.isSafeTile(tx, ty)) return;
    const ring = this.add.image(x, y, 'warn_ring').setDepth(-5).setAlpha(0.8);
    this.tweens.add({ targets: ring, alpha: 0.2, yoyo: true, repeat: 3, duration: 150 });
    const m = this.add.image(x - 80, y - 200, 'meteor').setDepth(1e6 + 3).setScale(1.4);
    this.tweens.add({
      targets: m, x, y, duration: 1200, ease: 'Quad.easeIn',
      onComplete: () => {
        m.destroy();
        ring.destroy();
        this.explode(x, y, 30, 30, false);
        for (const s of this.structures) if (Phaser.Math.Distance.Between(x, y, s.x, s.y) < 30) this.damageStructure(s, 60 * IMPACT_MULT[materialOf(s.def)]);
        if (Math.random() < 0.45 && !this.chunks.at(tx, ty) && !this.structureAt(tx, ty, 'object')) {
          const n: NodeData = { id: 100000 + this.world.nextNodeId++, type: 'meteor_rock', tx, ty, tex: texFor('meteor_rock', 0, () => 0), available: true, hp: -1, regrowAt: 0, daily: true };
          this.world.nodes.push(n);
          this.chunks.add(n);
        }
      },
    });
  }

  // ======================================================================
  // ตาย → เกิดใหม่ (ไม่มีจบ — เนื้อเรื่องเดินต่อ)
  // ======================================================================
  onMobKilled(mob: Mob) {
    const extraMeat = this.player.char.passive.extraMeat ?? 0;
    const zone = this.lootZoneAt(mob.x, mob.y);
    // บอสดันเจี้ยน/บอสคืนภัยพิบัติ = ข้อยกเว้นเพดานบนเกาะเรา (ได้ถึงกล่องเหล็ก)
    const src: BoxSource = mob.isBoss && (mob.disaster || mob.getData('dungeon') !== undefined) ? 'boss' : 'mob';
    for (const d of mob.def.drops) {
      // สัตว์ในตำนานในเขตผจญภัย: โอกาสกล่องเพชร ×2.5
      const chance = zone === 'adventure' && mob.def.legendary && isBoxTier(d.item) ? Math.min(1, d.chance * ADVENTURE_LOOT.legendBoxMult) : d.chance;
      if (Math.random() > chance) continue;
      const n = Phaser.Math.Between(d.qty[0], d.qty[1]) + (d.meat ? extraMeat : 0);
      // เกาะเรา: แปลนไม่ดรอปตรงๆ → แลกเป็นเหรียญครึ่งราคา (แปลนหายากต้องไปหาที่เขตผจญภัย)
      if (zone === 'home' && ITEMS[d.item]?.type === 'blueprint') this.spawnDrop(mob.x, mob.y + 4, 'coin', Math.round((ITEMS[d.item].value / 2) * n));
      else this.spawnDrop(mob.x, mob.y + 4, isBoxTier(d.item) ? this.capBox(d.item, src, mob.x, mob.y) : d.item, n);
    }
    // ผู้รอดชีวิตคู่แข่ง: ถุงของ (เหรียญ/วัตถุดิบ/กล่อง/อาวุธ) แทนกล่องสุ่มปกติ
    const rival = !!mob.getData('rival');
    if (rival) this.rivals.onKilled(mob);
    // บอสดันเจี้ยน: ชั้น 1 = ทอง · ชั้น 2 = ทอง ×2 · ชั้น 3 = เพชร + ทอง (ทุกครั้งที่ล้ม) → บนเกาะเราถูกจำกัดเป็นกล่องเหล็ก
    const dgBoss = mob.isBoss ? (mob.getData('dungeon') as number | undefined) : undefined;
    const dgBoxes = dgBoss !== undefined ? DUNGEON_BOSS_BOXES[interiorDef(dgBoss)?.tier ?? 1] : undefined;
    if (dgBoxes) dgBoxes.forEach((b, i) => this.spawnDrop(mob.x + (i - (dgBoxes.length - 1) / 2) * 10, mob.y + 2, this.capBox(b, 'boss', mob.x, mob.y), 1));
    let box = dgBoxes || rival ? null : mobBoxDrop(mob.def.xp, mob.isBoss);
    if (!box && !dgBoxes && !rival && Math.random() < this.player.stats.luck / 100) box = mobBoxDrop(mob.def.xp, mob.isBoss);
    // เขตผจญภัย: ลุ้นซ้ำอีกรอบ (≈ ×2) · เกาะมหาสมบัติ (เป็นเขตผจญภัยด้วย): ลุ้นเพิ่มอีกรอบ
    for (let i = 0; !box && !dgBoxes && !rival && zone === 'adventure' && i < ADVENTURE_LOOT.mobRerolls; i++) box = mobBoxDrop(mob.def.xp, mob.isBoss);
    if (!box && !rival && this.world.slotIndexAt(Math.floor(mob.x / 16), Math.floor(mob.y / 16)) === SPECIAL_SLOT) box = mobBoxDrop(Math.max(8, mob.def.xp), mob.isBoss);
    if (box) {
      box = this.capBox(box, src, mob.x, mob.y);
      this.spawnDrop(mob.x, mob.y + 2, box, 1);
      this.fx.sparks(mob.x, mob.y, RARITY[ITEMS[box].rarity!].hex, 10, 16);
    }
    if (mob.isBoss) {
      this.spawnDrop(mob.x, mob.y, 'gem', Phaser.Math.Between(1, 3));
      this.spawnDrop(mob.x, mob.y, mob.def.xp >= 700 ? 'elixir_soul' : 'elixir_atk', 1);
    }
    if (mob.def.splits) for (let i = 0; i < mob.def.splits.count; i++) {
      const m = this.spawnMob(mob.def.splits.id, mob.x + Phaser.Math.Between(-8, 8), mob.y + Phaser.Math.Between(-6, 6));
      m.disaster = mob.disaster;
    }
    if (mob.def.ai !== 'flee') this.kills++;
    this.fx.poof(mob.x, mob.y + 2, mob.def.id === 'zombie' ? 0x7fae5a : 0x94b0c2, 10);
    this.fx.sparks(mob.x, mob.y, 0xb13e53, 6);
    Sfx.play('mobDie');
    if (mob.isBoss) {
      if (this.boss === mob) this.boss = null;
      const dg = mob.getData('dungeon') as number | undefined;
      if (dg !== undefined) this.interiors.onBossKilled(dg);
      this.cameras.main.shake(600, 0.01);
      Sfx.play('levelUp');
      EventBus.emit('toast', `👑 ล้ม${mob.def.name}สำเร็จ!`, '#ffcd75');
      MetaSave.bump('bossKills', 1);
    }
    EventBus.emit('mob:killed', mob.def.id.split('@')[0]);
    if (!this.player.dead) this.addXp(mob.def.xp);
    mob.destroy();
  }

  private respawn() {
    const p = this.player;
    this.deathCause = p.lastDamage || 'ไม่ทราบสาเหตุ';
    // ตายในเขตผจญภัย = ตายถาวรทันที (ไม่ลดเลเวล ไม่มีซื้อชีวิต) · โหมดโชว์เคสยกเว้น (โลกทดสอบ)
    if (this.computeAdventure() && !this.showcase) {
      const is = this.world.slots[this.world.slotIndexAt(Math.floor(p.x / 16), Math.floor(p.y / 16))];
      this.deathCause = `ตายในเขตผจญภัย${is ? ` (${is.name})` : ''} — ${this.deathCause}`;
      return this.permaDeath(false, true);
    }
    // เลเวลหมด (ตายตอน Lv.1) → เสนอซื้อชีวิต (เงินไม่พอ = ตายถาวร)
    if (p.level <= 1) return this.offerRevive();
    this.finishRespawn(true);
  }

  /** จำนวนครั้งที่ซื้อชีวิตในห้องนี้ (ราคาแพงขึ้นเรื่อยๆ) */
  revives = 0;

  /** ราคาซื้อชีวิต: เหรียญ = (300 + 50×วัน) × 2^ครั้ง · เพชร = 3 + 3×ครั้ง */
  reviveCost() {
    return { coins: Math.round((300 + this.dayNight.day * 50) * 2 ** this.revives), gems: 3 + this.revives * 3 };
  }

  private offerRevive() {
    const p = this.player;
    this.gameOverFlag = true;
    this.auto.stop(true);
    p.body.setVelocity(0, 0);
    Sfx.play('death');
    const c = this.reviveCost();
    const w = this.wallet;
    const canCoins = w.coins >= c.coins;
    const canGems = w.gems >= c.gems;
    if (!canCoins && !canGems) return this.permaDeath(true);
    EventBus.emit('ui:revive', { ...c, canCoins, canGems, haveCoins: w.coins, haveGems: w.gems, cause: this.deathCause, times: this.revives });
  }

  /** จ่ายเงินซื้อชีวิต → ฟื้นที่บ้าน (เลเวลคงที่ Lv.1 · ของในกระเป๋าตกเป็นถุงตามปกติ) */
  buyRevive(pay: 'coins' | 'gems'): boolean {
    const c = this.reviveCost();
    const ok = pay === 'coins' ? this.wallet.spend(c.coins) : this.wallet.spend(0, c.gems);
    if (!ok) return false;
    this.revives++;
    this.gameOverFlag = false;
    this.finishRespawn(false);
    Sfx.play('achievement');
    EventBus.emit('toast', `💖 ซื้อชีวิตสำเร็จ (${pay === 'coins' ? `${c.coins.toLocaleString()} เหรียญ` : `${c.gems} เพชร`}) — ครั้งหน้าแพงขึ้น`, '#ff9fb0');
    this.autosave();
    return true;
  }

  /** ยอมแพ้ → ตายถาวร */
  giveUp() {
    this.permaDeath(false);
  }

  private finishRespawn(loseLevel: boolean) {
    const p = this.player;
    this.interiors.resetToWorld(); // ตายในดันเจี้ยน → กลับขอบเขตโลกเกาะ
    if (loseLevel) Sfx.play('death');
    // ของในกระเป๋า (ไม่ใช่ hotbar) ตกเป็นถุงที่จุดตาย + เสียเงิน 10%
    const items: Slot[] = [];
    for (let i = HOTBAR_SIZE; i < p.inventory.slots.length; i++) {
      const s = p.inventory.slots[i];
      if (s) items.push({ ...s });
      p.inventory.slots[i] = null;
    }
    p.inventory.version++;
    const lost = Math.floor(this.wallet.coins * 0.1);
    this.wallet.spend(lost);
    if (items.length) {
      const g = this.graveSpot();
      const sprite = this.add.image(g.x, g.y, 'grave_bag').setOrigin(0.5, 1).setDepth(g.y);
      this.graves.push({ x: g.x, y: g.y, items, sprite });
    }
    if (this.riding) {
      this.riding.riding = false;
      this.riding = null;
      p.riding = false;
    }
    // จุดเกิด: ที่นอนบนบกเท่านั้น (บ้านบนเสาริมน้ำตั้งอยู่บนน้ำ — ไม่ใช้เป็นจุดเกิด)
    const bed = this.structures.find((s) => s.def.sleep && !s.getData('foreign') && s.def.layer === 'object');
    const x = bed ? bed.x : this.world.spawn.tx * 16 + 8;
    const y = bed ? bed.y + 10 : this.world.spawn.ty * 16 + 8;
    p.setPosition(x, y);
    p.hp = p.maxHp * 0.6;
    p.hunger = Math.max(p.hunger, 50);
    p.thirst = Math.max(p.thirst, 50);
    p.sanity = Math.max(p.sanity, 50);
    p.temp = 50;
    // ตาย = เลเวลลด 1 ขั้น (ซื้อชีวิต = ไม่ลด แต่ XP หาย)
    const lvBefore = p.level;
    if (loseLevel) p.loseLevel();
    else p.xp = 0;
    p.hp = p.maxHp * 0.6;
    p.protect(3);
    this.cameras.main.flash(500, 120, 20, 30);
    if (loseLevel) EventBus.emit('ui:death', this.deathCause, lost, items.length, lvBefore, p.level);
    else if (items.length || lost) EventBus.emit('toast', `เสียเหรียญ ${lost} · ของในกระเป๋า ${items.length} ช่องตกเป็นถุงที่จุดล้ม`, '#ef7d57');
  }

  /** จุดวางถุงของตอนตาย: ตายกลางน้ำ (ขี่เรือ/ยานบิน) → ฝั่งใกล้สุด หรือจุดเกิดบนเกาะเรา */
  private graveSpot(): { x: number; y: number } {
    const p = this.player;
    const px = Math.floor(p.x / 16);
    const py = Math.floor((p.y + 8) / 16);
    if (!isWater(this.tileAt(px, py))) return { x: p.x, y: p.y + 8 };
    const spot = this.riding && this.dismountSpot(this.riding);
    if (spot) return { x: spot.x, y: spot.y + 8 };
    for (let r = 1; r <= 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = px + dx;
          const ty = py + dy;
          const t = this.tileAt(tx, ty);
          if (!isWater(t) && t !== TILE.ROCKWALL && !this.isTileBlocked(tx, ty) && !this.structureAt(tx, ty, 'object')) return { x: tx * 16 + 8, y: ty * 16 + 12 };
        }
      }
    }
    const sp = this.world.spawn;
    return { x: sp.tx * 16 + 8, y: sp.ty * 16 + 16 };
  }

  private openGrave(g: (typeof this.graves)[number]) {
    for (const s of g.items) this.spawnDrop(g.x, g.y - 4, s.id, s.qty, s.plus || s.dur !== undefined ? s : undefined);
    g.sprite.destroy();
    this.graves = this.graves.filter((x) => x !== g);
    Sfx.play('pickup');
    EventBus.emit('toast', 'เก็บของคืนจากถุงแล้ว', '#a7f070');
  }

  /** ของที่เราวางขายบนเกาะกลางขายได้ → เงินเข้าตู้จดหมาย (ออนไลน์: ผู้เล่นจริงซื้อ + บอทซื้อ · ออฟไลน์: บอทซื้อ) */
  private async simulateBuyers() {
    const rooms = getRoomService();
    const me = localPlayerId();
    const paid = (l: TradeListing) => {
      if (!this.sys.isActive() || !ITEMS[l.item]) return;
      const net = Math.floor(l.price * (1 - Wallet.TAX));
      this.daily.deliver('coin', net, `💰 มีคนซื้อ${ITEMS[l.item].name}×${l.qty} ของคุณ! ได้ ${net} เหรียญ (ในตู้จดหมาย)`);
    };
    for (const l of await rooms.claimSales()) paid(l);
    for (const l of rooms.listings(this.room.id).filter((x) => x.seller === me)) {
      if (Math.random() < 0.55) {
        const r = await rooms.cancelListing(this.room.id, l.id);
        if (!('error' in r)) paid(l);
      }
    }
  }

  // ======================================================================
  // เซฟ / โหลด
  // ======================================================================
  autosave() {
    if (this.player.dead || this.gameOverFlag) return;
    SaveManager.save(this.toSave());
  }

  toSave(): RunSave {
    const p = this.player;
    return {
      version: 3, savedAt: Date.now(), roomId: this.room.id, slot: this.world.home, character: p.char.id,
      worldTime: this.worldTime, day: this.dayNight.day, time: this.dayNight.time, weather: this.weather.state,
      player: {
        x: p.x, y: p.y, hp: p.hp, hunger: p.hunger, thirst: p.thirst, stamina: p.stamina, temp: p.temp, sanity: p.sanity,
        selected: p.selected, slots: p.inventory.serialize(), armor: null, cosmetic: { ...p.cosmetic },
        trained: { ...p.trained },
        level: p.level, xp: p.xp, revives: this.revives, blueprints: [...this.learned],
        interiors: this.interiors.serialize(),
        equip: Object.fromEntries(Object.entries(p.equip).map(([k, v]) => [k, v ? { ...v } : null])) as Equipment,
      },
      wallet: { coins: this.wallet.coins, gems: this.wallet.gems },
      nodes: this.world.nodes.filter((n) => !n.daily && (!n.available || n.hp >= 0)).map((n) => [n.id, n.available, n.hp, n.regrowAt]),
      extraNodes: this.world.nodes.filter((n) => n.daily),
      removedNodes: [...this.removedNodes],
      tiles: [...this.paintedTiles].map(([k, t]) => [...k.split(',').map(Number), t] as [number, number, number]),
      structures: this.structures.filter((s) => !s.getData('foreign')).map((s) => s.serialize()),
      boats: this.boats.map((b) => ({ id: b.def.id, lv: b.lv, x: b.x, y: b.y, hp: b.hp, fuel: b.fuel, energy: b.energy, cargo: b.storage ? b.storage.slots.map((x) => (x ? { ...x } : null)) : null })),
      graves: this.graves.map((g) => ({ x: g.x, y: g.y, items: g.items })),
      crates: this.crates.map((c) => c.looted),
      mailboxReady: this.daily.mailboxReady,
      mailbox: this.daily.mailbox,
      quest: { index: this.quests?.index ?? 0, progress: this.quests?.progress ?? 0 },
      kills: this.kills, counters: this.achievements.counters, visited: [...this.visited],
      survived: this.disaster.survived, trades: this.market.trades, introSeen: this.introSeen, starterPicked: this.starterPicked, freeBuilds: [...this.freeBuilds], showcase: this.showcase,
      pinned: this.pinned ?? undefined,
    };
  }

  private applySave(s: RunSave) {
    const refund = migrateUpgradeSave(s); // ระบบตีบวกเก่า → อัพเกรด 10 ระดับ
    this.worldTime = s.worldTime;
    this.dayNight.day = s.day;
    this.dayNight.time = s.time;
    this.weather.state = s.weather as Weather;
    const p = this.player;
    Object.assign(p, { hp: s.player.hp, hunger: s.player.hunger, thirst: s.player.thirst, stamina: s.player.stamina, temp: s.player.temp, sanity: s.player.sanity, selected: s.player.selected });
    p.setPosition(s.player.x, s.player.y);
    p.equip = { ...emptyEquipment(), ...(s.player.equip ?? {}) };
    if (s.player.armor && !p.equip.body) p.equip.body = s.player.armor; // เซฟเก่า
    if (s.player.trained) p.trained = { ...emptyStats(), ...s.player.trained };
    p.level = s.player.level ?? 1;
    this.revives = s.player.revives ?? 0;
    this.learned = new Set(s.player.blueprints ?? this.legacyBlueprints(s));
    this.pinned = s.pinned ?? null;
    this.interiors.load(s.player.interiors);
    p.xp = s.player.xp ?? 0;
    p.recalc();
    p.inventory.load(s.player.slots);
    p.cosmetic = s.player.cosmetic ?? {};
    p.refreshLook();
    this.wallet.coins = s.wallet.coins;
    this.wallet.gems = s.wallet.gems;
    if (refund > 0) {
      this.wallet.coins += refund;
      this.time.delayedCall(1500, () => EventBus.emit('toast', `⬆ ระบบตีบวกเปลี่ยนเป็นอัพเกรด 100% — แลกเครื่องรางนำโชค/ใบกันแตกเป็น ${refund.toLocaleString()} เหรียญแล้ว`, '#ffcd75'));
    }
    for (const [tx, ty, t] of s.tiles) {
      this.world.ensureSlot(this.world.slotIndexAt(tx, ty));
      this.world.setTile(tx, ty, t);
      this.paintedTiles.set(`${tx},${ty}`, t);
    }
    for (const id of s.removedNodes) {
      const n = this.world.nodes.find((x) => x.id === id);
      if (n) {
        this.chunks.remove(n);
        this.world.nodes = this.world.nodes.filter((x) => x !== n);
      }
      this.removedNodes.add(id);
    }
    const byId = new Map(this.world.nodes.map((n) => [n.id, n]));
    for (const [id, available, hp, regrowAt] of s.nodes) {
      const n = byId.get(id);
      if (n) Object.assign(n, { available, hp, regrowAt });
    }
    for (const n of s.extraNodes) {
      this.world.nodes.push(n);
      this.chunks.add(n);
    }
    for (const d of s.structures) {
      const def = BUILD[d.id];
      if (!def) continue;
      const st = this.placeStructure(def, d.tx, d.ty, true);
      if (savedLevel(d.lv) > 1) st.setLevel(savedLevel(d.lv), false);
      st.hp = d.hp;
      st.fuel = d.fuel;
      st.prog = d.prog ?? 0;
      st.water = d.water ?? 0;
      if (d.crop) {
        st.plant(d.crop);
        st.growth = d.growth;
        st.refreshCrop();
      }
      if (d.storage && st.storage) st.storage.slots = d.storage.map((x) => (x ? { ...x } : null));
      if (def.id === 'campfire' && st.fuel <= 0) st.tick(0.01);
    }
    for (const b of s.boats) if (BUILD[b.id]?.boat) this.spawnBoat(b.id, b.x, b.y, b.hp, b.fuel, { energy: b.energy, cargo: b.cargo, lv: savedLevel(b.lv) });
    // เซฟตอนอยู่กลางทะเล → ขึ้นยานที่อยู่ใต้ตัวต่อ
    const under = this.boats.find((b) => b.kind !== 'land' && Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y) < 24);
    if (under && isWater(this.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16)))) this.board(under);
    for (const g of s.graves) this.graves.push({ ...g, sprite: this.add.image(g.x, g.y, 'grave_bag').setOrigin(0.5, 1).setDepth(g.y) });
    s.crates.forEach((looted, i) => {
      if (looted && this.crates[i]) {
        this.crates[i].looted = true;
        this.crates[i].sprite.setTexture('crate_open');
      }
    });
    this.daily.mailbox = s.mailbox;
    this.daily.setMailbox(s.mailboxReady);
    if (this.quests) {
      this.quests.index = s.quest.index;
      this.quests.progress = s.quest.progress;
    }
    this.kills = s.kills;
    this.achievements.counters = s.counters;
    this.visited = new Set(s.visited);
    this.disaster.survived = s.survived;
    this.market.refresh(this.room.seed, s.day);
    this.market.trades = s.trades;
    this.cameras.main.centerOn(p.x, p.y);
  }

  /** เซฟเก่าก่อนมีระบบแปลน: ให้แปลนของทุกอย่างที่สร้าง/มีอยู่แล้ว (ไม่ให้เสียสิทธิ์สร้างของเดิม) */
  private legacyBlueprints(s: RunSave): string[] {
    const keys = new Set<string>();
    for (const id of [...s.structures.map((d) => d.id), ...s.boats.map((b) => b.id)]) if (BUILD[id]) keys.add(bpKeyBuild(BUILD[id]));
    const have = new Set<string>();
    const slots = [...s.player.slots, ...Object.values(s.player.equip ?? {}), s.player.armor, ...s.structures.flatMap((d) => d.storage ?? []), ...s.boats.flatMap((b) => b.cargo ?? [])];
    for (const x of slots) if (x) have.add(x.id);
    for (const r of RECIPES) if (have.has(r.output.item)) keys.add(bpKeyRecipe(r));
    return [...keys];
  }

  /** ตายถาวร: ลบเซฟของห้องนี้ + ออกจากห้อง (เกาะว่างให้คนใหม่) */
  private permaDeath(broke = false, adventure = false) {
    const p = this.player;
    this.gameOverFlag = true;
    this.auto.stop(true);
    p.body.setVelocity(0, 0);
    Sfx.play('death');
    this.cameras.main.flash(800, 120, 20, 30);
    const days = this.dayNight.day;
    MetaSave.bump('bestDays', days, 'max');
    MetaSave.bump('totalKills', this.kills);
    getRoomService().leave(this.room.id, localPlayerId());
    SaveManager.clear();
    EventBus.emit('ui:gameover', { cause: this.deathCause, room: this.room.name, days, kills: this.kills, power: p.power, broke, cost: this.reviveCost(), adventure });
  }

  saveAndQuit() {
    this.autosave();
    SaveManager.flush();
    this.scene.stop('UIScene');
    fadeTo(this, 'TitleScene', undefined, 240);
  }

  // ======================================================================
  // helpers
  // ======================================================================
  /** หา node ใกล้สุดในรัศมีกว้าง (วนทุก sprite ที่โหลดอยู่) */
  /** กล่องเสบียงรอบซากเครื่องบินที่ยังไม่ได้ค้น (ใกล้สุดในระยะ) */
  nearestCrate(x: number, y: number, range: number): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = range;
    for (const c of this.crates) {
      if (c.looted) continue;
      const d = Phaser.Math.Distance.Between(x, y, c.sprite.x, c.sprite.y);
      if (d < bd) {
        bd = d;
        best = { x: c.sprite.x, y: c.sprite.y };
      }
    }
    return best;
  }

  nearestNodeFar(x: number, y: number, range: number, filter: (n: ResourceNode) => boolean) {
    let best: ResourceNode | null = null;
    let bestD = range;
    for (const n of this.chunks.activeSprites()) {
      if (!n.active || !filter(n)) continue;
      const d = Phaser.Math.Distance.Between(x, y, n.x, n.baseY);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  nearestNode(x: number, y: number, range: number, filter: (n: ResourceNode) => boolean) {
    let best: ResourceNode | null = null;
    let bestD = range;
    const tx = Math.floor(x / 16);
    const ty = Math.floor(y / 16);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const n = this.chunks.spriteAt(tx + dx, ty + dy);
        if (!n || !filter(n)) continue;
        const d = Phaser.Math.Distance.Between(x, y, n.x, n.baseY);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    return best;
  }

  private structDist(s: Structure): number {
    const p = this.player;
    return Phaser.Math.Distance.Between(p.x, p.feetY, s.x, s.y - 4) - (s.def.w - 1) * 8;
  }

  nearestStructure(range: number, filter: (s: Structure) => boolean): Structure | null {
    let best: Structure | null = null;
    let bestD = range;
    for (const s of this.structures) {
      if (!filter(s)) continue;
      const d = this.structDist(s);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  nearStations(): Set<string> {
    const out = new Set<string>(['none']);
    for (const s of this.structures) {
      const st = s.def.station;
      const extra = s.def.stations;
      if ((!st && !extra) || s.getData('foreign')) continue;
      if (Phaser.Math.Distance.Between(this.player.x, this.player.feetY, s.x, s.y - 4) >= BALANCE.stationRange + s.def.w * 8) continue;
      if (st && !(st === 'campfire' && !s.lit)) out.add(st);
      // อาคารรวมหลายสถานี (โต๊ะช่างขั้นสูง / ครัว / โรงตีเหล็ก)
      if (extra) for (const k of extra) out.add(k);
    }
    if (this.creative) ['campfire', 'workbench', 'furnace', 'anvil', 'mech_bench', 'kitchen'].forEach((k) => out.add(k));
    return out;
  }

  /** สถานีที่ "มีอยู่" บนเกาะของเรา (คราฟต์จากแปลนได้โดยไม่ต้องยืนใกล้) — แคช 1 วิ หรือเมื่อจำนวนสิ่งก่อสร้างเปลี่ยน */
  private stationCache: { n: number; at: number; set: Set<string> } | null = null;
  ownStations(): Set<string> {
    const c = this.stationCache;
    if (c && c.n === this.structures.length && this.time.now - c.at < 1000) return c.set;
    const out = new Set<string>(['none']);
    for (const s of this.structures) {
      const st = s.def.station;
      const extra = s.def.stations;
      if ((!st && !extra) || s.getData('foreign') || this.world.islandAt(s.tx, s.ty) !== this.world.home) continue;
      if (st) out.add(st);
      if (extra) for (const k of extra) out.add(k);
    }
    if (this.creative) ['campfire', 'workbench', 'furnace', 'anvil', 'mech_bench', 'kitchen'].forEach((k) => out.add(k));
    this.stationCache = { n: this.structures.length, at: this.time.now, set: out };
    return out;
  }

  private waterNearby(): boolean {
    const p = this.player;
    const pts = [[p.x + p.aim.x * 14, p.feetY + p.aim.y * 14], [p.x + 14, p.feetY], [p.x - 14, p.feetY], [p.x, p.feetY + 14], [p.x, p.feetY - 14]];
    return pts.some(([x, y]) => isWater(this.tileAt(Math.floor(x / 16), Math.floor(y / 16))));
  }

  private computeHint(): string | null {
    if (this.uiOpen) return null;
    const p = this.player;
    const R = BALANCE.reach;
    if (this.fishing) return this.fishing.state === 'bite' ? 'ดึงเบ็ด!' : 'รอปลากิน…';
    if (this.riding) return this.ridingHint();
    if (this.build.active) {
      const n = this.creative ? 999 : affordableTimes(this.buildNeeds(this.build.active), this.materials());
      const one = this.build.active.w === 1 && this.build.active.h === 1;
      return `วาง${this.build.active.name} · วัสดุพออีก ${n === 999 ? '∞' : n} ชิ้น${one && !this.controls.touchMode ? ' · กดค้างลากเพื่อวางต่อเนื่อง' : ''} · คลิกขวา = ยกเลิก`;
    }
    if (this.build.demolish) return 'คลิกสิ่งก่อสร้างเพื่อรื้อ (คืนวัสดุ 50%) · X = ออก';
    if (this.build.upgrade) return this.controls.touchMode ? '⬆ โหมดอัพเกรด: หันหน้าเข้าหาของแล้วแตะปุ่มหลัก · แตะ ⬆ = ออก' : '⬆ โหมดอัพเกรด: คลิกสิ่งก่อสร้าง/ยานเพื่ออัพ Lv +1 · U/คลิกขวา = ออก';
    const portal = this.interiors.interactAt();
    if (portal) return portal.label;
    const near = (x: number, y: number, r = R + 4) => Phaser.Math.Distance.Between(p.x, p.feetY, x, y) < r;
    if (this.crates.some((c) => !c.looted && near(c.sprite.x, c.sprite.y - 4, R))) return 'ค้นกล่องเสบียง';
    if (this.daily.nearest(p.x, p.feetY, R + 4)) return 'เปิดกล่องร่มชูชีพ';
    if (this.graves.some((g) => near(g.x, g.y))) return 'เก็บของคืนจากถุง';
    if (this.mailboxSprite && this.daily.mailboxReady && near(this.mailboxSprite.x, this.mailboxSprite.y)) return 'เปิดตู้จดหมาย';
    if (this.merchantSprite && near(this.merchantSprite.x, this.merchantSprite.y, R + 10)) return 'คุยกับพ่อค้ากลาง (ซื้อ/ขาย/แลกเพชร)';
    if (this.stalls.some((s) => near(s.x, s.y + 4, 30))) return 'แผงตลาด: ดู/ซื้อ/วางขายของ';
    const t = this.structTarget();
    if (t.boat) return `ขึ้น${t.boat.def.name}`;
    if (t.repair) return `ซ่อม${t.repair.def.name} (${Math.ceil(t.repair.hp)}/${t.repair.maxHp})`;
    const st = t.st;
    if (st) {
      if (st.def.crop) return st.ripe ? 'เก็บเกี่ยว' : st.crop ? `ดูแปลง (${Math.floor(st.growth * 100)}%)` : 'ปลูกเมล็ด';
      if (hasAnvil(st.def)) return 'อัพเกรดอุปกรณ์ (ทั่งตีเหล็ก)';
      if (st.def.id === 'campfire') return st.lit ? 'เติมเชื้อเพลิง' : 'จุดไฟ (ใช้ไม้/ถ่าน)';
      if (st.def.id === 'generator') return `เติมเชื้อเพลิง (${Math.ceil(st.fuel)} วิ)`;
      if (st.def.water) return st.def.water === 'rain' ? `ดื่มน้ำฝน (${Math.floor(st.water)}/${RAIN_WATER_CAP})` : 'ดื่มน้ำ';
      if (st.def.sleep && st.def.storage && this.canSleepNow()) return `นอนใน${st.def.name}`;
      if (st.def.storage && st.def.prod) return `เปิด${st.def.name} (เก็บผลผลิต/ใส่วัตถุดิบ)`;
      if (st.def.storage) return `เปิด${st.def.name}`;
      if (st.def.sleep) return 'นอน';
    }
    if (t.broken) return `ซ่อม${t.broken.def.name} (${Math.ceil(t.broken.hp)}/${t.broken.maxHp})`;
    const node = this.nearestNode(p.x, p.feetY, R, (n) => n.isPickable);
    if (node) return node.kind === 'bush' ? 'เก็บเบอร์รี่' : node.kind === 'wild_crop' ? 'เก็บพืชป่า' : node.kind === 'ruin_chest' ? 'เปิดหีบสมบัติ' : node.kind === 'shroom' ? 'เก็บเห็ดเรืองแสง' : 'เก็บหญ้า';
    if (this.waterNearby()) return p.held && ITEMS[p.held.id].type === 'rod' ? 'ตกปลา' : 'ดื่มน้ำ';
    const sign = this.signs.find((s) => near(s.x, s.y, 30));
    if (sign) return `ป้าย: ${sign.text}`;
    return null;
  }
}
