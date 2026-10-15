import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import type { CharacterDef } from '../data/characters';
import { BARE_HANDS, ITEMS } from '../data/items';
import { BAG_SIZE, Inventory, type Slot } from '../components/Inventory';
import type { InputManager } from '../core/InputManager';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import type { GameScene } from '../scenes/GameScene';
import { CLASS_LOOKS, buildHeroTexture, heroKey, type HeroLook } from '../gfx/art/heroes';
import { resOf } from '../gfx/hd';
import { plusMult } from '../data/loot';
import { levelOfSlot } from '../data/upgrade';
import { lookKey } from '../gfx/UpgradeLook';
import { MAX_LEVEL, levelStats, xpNeed } from '../data/level';
import { addStats, emptyStats, gearMult, powerScore, type EquipSlot, type Stats } from '../data/equipment';
import { freshBody, tickBody, type BodyState } from '../systems/BodySystem';
import { BELT_KEYS, type LoadoutKey } from '../data/loadout';

/** อุปกรณ์ 12 ช่อง + ช่องใช้งาน (เข็มขัดเครื่องมือ 2 ช่อง + แสง — data/loadout.ts) */
export type Equipment = Record<EquipSlot | LoadoutKey, Slot | null>;
export const emptyEquipment = (): Equipment => ({
  weapon: null, offhand: null, head: null, body: null, legs: null, feet: null, hands: null, back: null, neck: null, ring1: null, ring2: null, bag: null,
  tool1: null, tool2: null, lamp: null,
});

type Facing = 'down' | 'up' | 'side';

/** ค่าเครื่องมือของช่อง (ดาเมจ ×เลเวลอัพเกรด) */
const toolOf = (s: Slot) => {
  const t = ITEMS[s.id].tool;
  return t ? (s.plus ? { ...t, damage: t.damage * plusMult(s.plus) } : t) : null;
};

/** สภาพแวดล้อมรอบตัวที่ GameScene ส่งให้ทุกเฟรม */
export interface PlayerEnv {
  /** อุณหภูมิอากาศ (°C) */
  ambient: number;
  /** ความอบอุ่นจากกองไฟ/คบไฟ (°C) */
  warmth: number;
  raining: boolean;
  dark: boolean;
  /** อยู่ในแสงไฟ (กองไฟ/คบไฟ) */
  lit: boolean;
  survival: boolean;
  /** ช่วงตั้งหลัก: ค่าสมดุลร่างกายลดช้า ไม่มีผลเสีย */
  grace?: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  readonly char: CharacterDef;
  readonly inventory: Inventory;
  texKey: string;
  /** ชุดแฟชั่นที่เลือก (ทับชุดเกราะ) */
  cosmetic: { outfit?: string; helmet?: string; cape?: string } = {};
  /** กำลังขี่เรือ (ซ่อนเงา/อาวุธ) */
  riding = false;

  hp: number;
  /** หุ่นยนต์ใช้ช่องนี้เป็นแบตเตอรี่ */
  hunger = 100;
  private calm = 0;
  private calmHp = 0;
  thirst = 100;
  stamina: number;
  /** อุณหภูมิร่างกาย 0..100 (50 = สบาย) */
  temp = 50;
  sanity = 100;
  /** อุปกรณ์ที่สวมอยู่ 12 ช่อง  */
  equip: Equipment = emptyEquipment();
  /** บัฟจากสิ่งก่อสร้างในฐาน (GameScene คำนวณให้) */
  baseStats: Stats = emptyStats();
  baseBuffs: { name: string; text: string }[] = [];
  /** ค่าจากอุปกรณ์อย่างเดียว / รวมทั้งหมด */
  gearStats: Stats = emptyStats();
  /** เลเวล + XP (ตายแล้วลด 1 เลเวล) */
  level = 1;
  xp = 0;
  /** ค่าที่อัปถาวรจากผลึกพลัง (ดรอปจากกล่อง) */
  trained: Stats = emptyStats();
  stats: Stats = emptyStats();

  selected = 0;
  aim = new Phaser.Math.Vector2(0, 1);
  facing: Facing = 'down';
  lastDamage = '';

  attackCd = 0;
  skillCd = 0;
  overclock = 0;
  /** ตัวคูณจากโหมด/กฎพิเศษ */
  speedMult = 1;
  hungerMult = 1;
  /** ตัวคูณการกระหาย (เช่น คลื่นความร้อน) */
  thirstMult = 1;
  /** ตัวคูณความเร็วจากพื้น/ภัย (โคลน น้ำท่วม พายุทราย/หิมะ) — ตั้งโดย GameScene ทุกเฟรม */
  envSpeed = 1;
  /** อยู่ในบ้านของเรา (HomeSystem) — มอน/ผู้เล่นอื่น/ภัยตีไม่โดน */
  sheltered = false;
  /** พื้นลื่น (น้ำแข็ง): ความเร็วค่อยๆ เปลี่ยน ไถลต่อหลังปล่อยปุ่ม */
  slippery = false;
  /** สมดุลร่างกาย (โปรตีน/พลังงาน/วิตามิน/ป่วย) — systems/BodySystem.ts */
  nutri: BodyState = freshBody();
  bodyStats: Stats = emptyStats();
  bodyStaminaMult = 1;
  bodyHealMult = 1;
  bodyDrainMult = 1;
  bodySpeedMult = 1;
  private invuln = 0;
  private dodgeTime = 0;
  private dodgeDir = new Phaser.Math.Vector2();
  private dodgeMult = BALANCE.dodgeSpeedMult;
  private exhausted = false;
  private shadowImg: Phaser.GameObjects.Image;
  private heldImg: Phaser.GameObjects.Image;
  private swing = 0;
  private stepTimer = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, char: CharacterDef) {
    const look = CLASS_LOOKS[char.id as keyof typeof CLASS_LOOKS];
    const key = buildHeroTexture(scene, heroKey(look), look);
    super(scene, x, y, key, 0);
    this.char = char;
    this.texKey = key;
    this.inventory = new Inventory(char.passive.bagSize ?? BAG_SIZE);
    this.hp = char.stats.hp;
    this.stamina = char.stats.stamina;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    // texture ฮีโร่เป็น HD (ละเอียด SPRITE_RES เท่า) → แสดง scale 1/res · ขนาด body เป็นพิกเซล texture จึงคูณ res (ขนาดในโลกเท่าเดิม 8×5)
    const res = resOf(this.texture);
    this.setScale(1 / res);
    this.body.setSize(8 * res, 5 * res).setOffset(6 * res, 18 * res);
    this.setCollideWorldBounds(true);
    this.shadowImg = scene.add.image(x, y + 11, 'shadow').setDepth(-1);
    this.heldImg = scene.add.image(x, y, 'px').setVisible(false);
  }

  /** ภาพอาวุธในมือ (ออร่าใช้ใส่แสงเรือง) */
  get heldSprite() {
    return this.heldImg;
  }
  get dead() {
    return this.hp <= 0;
  }
  get isDodging() {
    return this.dodgeTime > 0;
  }
  /** ของในมือ — แถบหมวด (ui/LoadoutBar.ts): ปกติมือว่าง (selected = -1) ถือเฉพาะของขว้างที่เลือกในช่องอาวุธ/ตอนใช้ของ */
  get held() {
    return this.inventory.slots[this.selected] ?? null;
  }
  get maxHp() {
    return this.char.stats.hp + Math.round(this.stats.hp);
  }
  get maxStamina() {
    return this.char.stats.stamina + Math.round(this.stats.stamina);
  }
  /** ของในมือเป็นอาวุธ/เครื่องมือ → ใช้ของในมือ, ไม่งั้นใช้อาวุธหลักที่สวมอยู่ */
  get weaponRef(): { slot: Slot; ref: number | 'weapon' } | null {
    const h = this.held;
    if (h && ['tool', 'weapon', 'ranged'].includes(ITEMS[h.id].type)) return { slot: h, ref: this.selected };
    if (this.equip.weapon) return { slot: this.equip.weapon, ref: 'weapon' };
    return null;
  }
  get tool() {
    const s = this.weaponRef?.slot;
    const t = (s && ITEMS[s.id].tool) || BARE_HANDS;
    return s?.plus ? { ...t, damage: t.damage * plusMult(s.plus) } : t;
  }
  /** ลดความทนทานของอาวุธที่ใช้อยู่ — คืน true ถ้าพัง */
  wearWeapon(amount: number): boolean {
    const w = this.weaponRef;
    if (!w) return false;
    if (w.ref !== 'weapon') return this.inventory.wear(w.ref, amount);
    if (w.slot.dur === undefined) return false;
    w.slot.dur -= amount;
    if (w.slot.dur > 0) return false;
    this.equip.weapon = null;
    return true;
  }

  /** คำนวณค่าสถานะรวม: อุปกรณ์ (×เลเวลอัพเกรด) + บัฟฐาน */
  recalc() {
    const g = emptyStats();
    for (const s of Object.values(this.equip)) {
      const e = s && ITEMS[s.id].equip;
      if (e) addStats(g, e.stats, gearMult(s.plus));
    }
    if (this.equip.weapon?.id === 'gold_sword') g.crit += 10;
    this.gearStats = g;
    this.stats = addStats(addStats(addStats(addStats(addStats(emptyStats(), g), this.baseStats), this.trained), levelStats(this.level)), this.bodyStats);
    const bag = this.inventory.baseSize + Math.round(this.stats.bag);
    if (this.inventory.bagSize !== bag) {
      // กระเป๋าเล็กลง (เช่น อาคารเพิ่มช่องถูกทำลาย) → ของที่ล้นหล่นลงพื้นข้างตัว
      const spill = this.inventory.resize(bag);
      for (const s of spill) (this.scene as GameScene).spawnDrop(this.x, this.y + 6, s.id, s.qty, s.plus || s.dur !== undefined ? s : undefined);
      if (spill.length) EventBus.emit('toast', `กระเป๋าเล็กลง — ของ ${spill.length} ช่องหล่นลงพื้น`, '#ef7d57');
    }
    this.hp = Math.min(this.hp, this.maxHp);
    this.stamina = Math.min(this.stamina, this.maxStamina);
  }

  get xpNeed() {
    return xpNeed(this.level);
  }

  /** ได้ XP — คืนจำนวนเลเวลที่ขึ้น */
  gainXp(n: number): number {
    if (this.level >= MAX_LEVEL || n <= 0) return 0;
    this.xp += n;
    let up = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpNeed(this.level)) {
      this.xp -= xpNeed(this.level);
      this.level++;
      up++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    if (up) {
      this.recalc();
      this.hp = this.maxHp;
      this.stamina = this.maxStamina;
    }
    return up;
  }

  /** อมตะชั่วคราว (เช่น หลังฟื้น) */
  protect(sec: number) {
    this.invuln = Math.max(this.invuln, sec);
  }

  /** ตาย: ลด 1 เลเวล (ไม่ต่ำกว่า 1) */
  loseLevel(): boolean {
    this.xp = 0;
    if (this.level <= 1) return false;
    this.level--;
    this.recalc();
    return true;
  }

  /** ค่าพลังรวม */
  get power() {
    const w = this.equip.weapon ?? this.weaponRef?.slot;
    const def = w ? ITEMS[w.id] : undefined;
    const dmg = def?.tool?.damage ?? def?.ranged?.damage ?? BARE_HANDS.damage;
    return powerScore(dmg * plusMult(w?.plus), this.stats) + Math.round(this.char.stats.hp * 0.5);
  }

  /** ลุคปัจจุบัน: หน้าตาตัวละคร + ชุดตามเกราะ + ชุดแฟชั่น */
  get look(): HeroLook {
    const base = { ...CLASS_LOOKS[this.char.id as keyof typeof CLASS_LOOKS] };
    const lookOf = (s: Slot | null) => (s ? ITEMS[s.id].equip?.look : undefined);
    base.outfit = lookOf(this.equip.body) ?? base.outfit;
    base.helmet = lookOf(this.equip.head) ?? base.helmet;
    base.cape = lookOf(this.equip.back) ?? base.cape;
    if (this.cosmetic.outfit) base.outfit = this.cosmetic.outfit;
    if (this.cosmetic.helmet) base.helmet = this.cosmetic.helmet;
    if (this.cosmetic.cape) base.cape = this.cosmetic.cape;
    return base;
  }

  /** สร้าง/สลับ texture ตามลุค (เรียกเมื่อเปลี่ยนเกราะหรือชุด) */
  refreshLook() {
    const look = this.look;
    const key = buildHeroTexture(this.scene, heroKey(look), look);
    if (key === this.texKey) return;
    this.texKey = key;
    this.anims.stop();
    this.setTexture(key, 0);
  }
  get lightRadius() {
    const s = this.held;
    const light = s ? ITEMS[s.id].light : undefined;
    const lamp = this.equip.lamp ? ITEMS[this.equip.lamp.id].light : undefined; // 🔦 ช่องแสง: สว่างตลอดไม่ต้องถือ
    return Math.max(light?.radius ?? 0, lamp?.radius ?? 0, BALANCE.playerLight) + this.stats.light;
  }
  /** ถือคบไฟ · มีของในช่องแสง · หรือตะเกียงที่มือรอง (ให้ความอบอุ่น) */
  get holdingTorch() {
    const s = this.held;
    return (!!s && ITEMS[s.id].type === 'light') || !!this.equip.lamp || !!(this.equip.offhand && ITEMS[this.equip.offhand.id].equip?.warm);
  }

  // ---------- ช่องใช้งาน (data/loadout.ts) ----------
  /** เครื่องมือในเข็มขัดที่แรงสุดสำหรับต้นไม้/หิน */
  beltTool(kind: 'tree' | 'rock'): { key: LoadoutKey; slot: Slot; tool: NonNullable<ReturnType<typeof toolOf>> } | null {
    let best: { key: LoadoutKey; slot: Slot; tool: NonNullable<ReturnType<typeof toolOf>> } | null = null;
    for (const key of BELT_KEYS) {
      const slot = this.equip[key];
      const tool = slot ? toolOf(slot) : null;
      if (tool && tool[kind] > (best?.tool[kind] ?? 0)) best = { key, slot: slot!, tool };
    }
    return best;
  }
  /** คันเบ็ดในเข็มขัด */
  get beltRod(): LoadoutKey | null {
    return BELT_KEYS.find((k) => this.equip[k] && ITEMS[this.equip[k]!.id].type === 'rod') ?? null;
  }
  /** มีคันเบ็ด (ถือในมือ หรือในเข็มขัด) */
  get hasRod() {
    return (!!this.held && ITEMS[this.held.id].type === 'rod') || !!this.beltRod || this.inventory.slots.some((s) => !!s && ITEMS[s.id].type === 'rod');
  }
  /** สึกของในช่องใช้งาน — คืน true ถ้าพัง (ช่องว่าง) */
  wearLoadout(key: LoadoutKey, amount: number): boolean {
    const s = this.equip[key];
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    if (s.dur > 0) return false;
    this.equip[key] = null;
    return true;
  }
  /** โชว์เครื่องมือจากเข็มขัดในมือชั่วครู่ (ตอนตัด/ขุด/ตกปลา) */
  flashTool(slot: Slot) {
    this.toolFlash = slot;
    this.toolFlashT = 0.45;
  }
  private toolFlash: Slot | null = null;
  private toolFlashT = 0;
  get feetY() {
    return this.y + 11;
  }
  get defense() {
    return this.stats.def;
  }
  get coldResist() {
    return Math.min(0.95, this.stats.cold);
  }
  /** % ลดดาเมจจากค่าป้องกัน (ลดผลตอบแทน สูงสุด 75%) */
  get damageReduction() {
    const d = Math.max(0, this.defense);
    return Math.min(0.75, d / (d + 22));
  }
  get freezing() {
    return this.temp < 18;
  }
  get overheating() {
    return this.temp > 82;
  }
  get attackCooldown() {
    return BALANCE.attackCooldown * (this.overclock > 0 ? 0.5 : 1);
  }

  update(dt: number, input: InputManager, frozen: boolean, env: PlayerEnv) {
    if (this.dead) return;
    this.recalc();
    if (this.stats.regen > 0 && this.hunger > 0 && this.thirst > 0) this.heal(this.stats.regen * this.bodyHealMult * dt);
    // ฟื้นเลือดเองช้าๆ เมื่อไม่โดนตี 6 วิ และไม่หิว/กระหายมาก (+0.6 HP/วิ)
    this.calm = this.hp < this.calmHp - 0.01 ? 0 : this.calm + dt;
    this.calmHp = this.hp;
    if (this.calm >= 6 && this.hunger > 25 && this.thirst > 25 && this.hp < this.maxHp) this.heal(0.6 * this.bodyHealMult * dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.skillCd = Math.max(0, this.skillCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.overclock = Math.max(0, this.overclock - dt);

    const dir = frozen ? new Phaser.Math.Vector2() : input.move();
    const moving = dir.lengthSq() > 0;
    let speed = this.char.stats.speed * this.speedMult * this.envSpeed * this.bodySpeedMult * Math.max(0.5, 1 + this.stats.speed / 100) * (this.overclock > 0 ? 1.8 : 1) * (this.freezing ? 0.85 : 1);
    let sprinting = false;

    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      this.body.setVelocity(this.dodgeDir.x * speed * this.dodgeMult, this.dodgeDir.y * speed * this.dodgeMult);
      this.setAlpha(0.6);
    } else {
      // อมตะหลังโดนตี: กะพริบชัดๆ (จางสลับทึบ ~7 ครั้ง/วิ)
      this.setAlpha(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0 ? 0.25 : 1);
      if (this.stamina <= 0) this.exhausted = true;
      if (this.exhausted && this.stamina > 30) this.exhausted = false;
      if (moving && input.held('sprint') && !this.exhausted) {
        sprinting = true;
        speed *= BALANCE.sprintMult;
        this.stamina = Math.max(0, this.stamina - BALANCE.sprintStaminaPerSec * dt);
      }
      if (this.slippery) {
        // น้ำแข็ง: เร่ง/เบรกช้า ไถลต่อ
        const v = this.body.velocity;
        const k = Math.min(1, dt * (moving ? 2.4 : 0.9));
        this.body.setVelocity(v.x + (dir.x * speed * 1.1 - v.x) * k, v.y + (dir.y * speed * 1.1 - v.y) * k);
      } else this.body.setVelocity(dir.x * speed, dir.y * speed);
      if (!frozen && input.pressed('dodge') && this.stamina >= BALANCE.dodgeStamina) {
        this.dodge(moving ? dir : this.aim, BALANCE.dodgeTime, BALANCE.dodgeSpeedMult);
        this.stamina -= BALANCE.dodgeStamina;
      }
    }
    if (!sprinting && this.dodgeTime <= 0) {
      this.stamina = Math.min(this.maxStamina, this.stamina + BALANCE.staminaRegenPerSec * this.bodyStaminaMult * dt * (moving ? 0.6 : 1));
    }

    if (env.survival) this.survive(dt, sprinting, env);

    // เสียงฝีเท้า
    if (moving && this.dodgeTime <= 0) {
      this.stepTimer -= dt * (sprinting ? 1.6 : 1);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.32;
        Sfx.play('step', 100);
      }
    }

    this.animate(dir, moving);
    this.setDepth(this.feetY);
    this.updateAttachments(dt);
  }

  /** หิว/กระหาย/อุณหภูมิ/สติ */
  private survive(dt: number, sprinting: boolean, env: PlayerEnv) {
    const p = this.char.passive;
    const drain = (sprinting ? BALANCE.sprintHungerMult : 1) * this.bodyDrainMult;
    tickBody(this, dt, !!env.grace);
    this.hunger = Math.max(0, this.hunger - BALANCE.hungerPerSec * this.char.stats.hungerRate * this.hungerMult * drain * dt);
    if (p.robot) {
      this.thirst = 100;
      if (env.raining) this.damageOverTime(1 * dt, 'ไฟฟ้าช็อต');
    } else {
      const heat = this.overheating ? BALANCE.heatThirstMult : 1;
      this.thirst = Math.max(0, this.thirst - BALANCE.thirstPerSec * this.char.stats.thirstRate * this.thirstMult * drain * heat * dt);
    }
    if (this.hunger <= 0) this.damageOverTime(BALANCE.starveDamagePerSec * dt, p.robot ? 'แบตเตอรี่หมด' : 'ความหิว');
    if (this.thirst <= 0) this.damageOverTime(BALANCE.starveDamagePerSec * dt, 'ขาดน้ำ');

    // อุณหภูมิร่างกายวิ่งเข้าหาเป้าหมายตามอากาศ
    const effective = env.ambient + env.warmth * (env.ambient < 22 ? 1 : 0.25) - (env.raining ? 4 : 0);
    let target = 50;
    if (effective < 12) target = 50 - (12 - effective) * 2.6 * (1 - this.coldResist);
    else if (effective > 32) target = 50 + (effective - 32) * 4;
    this.temp += Phaser.Math.Clamp(target - this.temp, -1, 1) * Math.min(Math.abs(target - this.temp), 5) * dt;
    this.temp = Phaser.Math.Clamp(this.temp, 0, 100);
    if (this.temp < 12) this.damageOverTime(BALANCE.freezeDamagePerSec * dt, 'ความหนาว');
    if (this.temp > 94) this.damageOverTime(1 * dt, 'ฮีทสโตรก');

    // สติ: ลดในความมืดที่ไม่มีแสง
    if (env.dark && !env.lit && !p.noDarkSanity) this.sanity -= BALANCE.sanityDarkLossPerSec * dt;
    else if (!env.dark) this.sanity += BALANCE.sanityRegenPerSec * dt;
    this.sanity = Phaser.Math.Clamp(this.sanity, 0, 100);
    if (this.sanity <= 0) this.damageOverTime(1 * dt, 'สติแตก');
  }

  private damageOverTime(amount: number, cause: string) {
    this.hp -= amount;
    this.lastDamage = cause;
  }

  dodge(dir: Phaser.Math.Vector2, time: number, mult: number) {
    this.dodgeTime = time;
    this.dodgeMult = mult;
    this.dodgeDir.copy(dir).normalize();
    Sfx.play('dash');
  }

  aimAt(x: number, y: number) {
    const v = new Phaser.Math.Vector2(x - this.x, y - this.y);
    if (v.lengthSq() > 1) this.aim = v.normalize();
  }

  startSwing() {
    this.swing = 1;
  }

  private animate(dir: Phaser.Math.Vector2, moving: boolean) {
    const v = moving ? dir : this.aim;
    if (Math.abs(v.x) > Math.abs(v.y)) {
      this.facing = 'side';
      this.setFlipX(v.x < 0);
    } else {
      this.facing = v.y < 0 ? 'up' : 'down';
      this.setFlipX(false);
    }
    if (moving) this.anims.play(`${this.texKey}_walk_${this.facing}`, true);
    else {
      this.anims.stop();
      this.setFrame({ down: 0, up: 3, side: 6 }[this.facing]);
    }
  }

  /** เงาใต้เท้า + ของที่ถือในมือ (เหวี่ยงตอนโจมตี) */
  private updateAttachments(dt: number) {
    this.shadowImg.setPosition(Math.round(this.x), Math.round(this.y + 11)).setVisible(!this.riding);
    let held = this.held;
    let def = held ? ITEMS[held.id] : undefined;
    this.toolFlashT = Math.max(0, this.toolFlashT - dt);
    if (this.toolFlashT > 0 && this.toolFlash) {
      held = this.toolFlash; // ⛏ เครื่องมือจากเข็มขัดขึ้นมือชั่วครู่
      def = ITEMS[held.id];
    } else if (!(def && ['tool', 'weapon', 'light', 'ranged', 'rod'].includes(def.type)) && this.equip.weapon) {
      held = this.equip.weapon;
      def = ITEMS[held.id];
    }
    const showable = def && ['tool', 'weapon', 'light', 'ranged', 'rod'].includes(def.type);
    if (!showable || this.riding) {
      this.heldImg.setVisible(false);
      return;
    }
    this.swing = Math.max(0, this.swing - dt / 0.2);
    const flip = this.facing === 'side' ? this.flipX : this.facing === 'up';
    const dir = flip ? -1 : 1;
    let hx = this.x + 4 * dir;
    let behind = false;
    if (this.facing === 'up') {
      hx = this.x - 5;
      behind = true;
    } else if (this.facing === 'down') hx = this.x + 5;
    const swingAngle = this.swing > 0 ? Math.sin(this.swing * Math.PI) * 100 - 30 : 0;
    this.heldImg
      .setTexture(def!.enhanceable ? lookKey(this.scene, def!.icon, levelOfSlot(held)) : def!.icon) // โฉมตามเลเวลอัพเกรด
      .setVisible(true)
      .setScale(0.7)
      .setOrigin(flip ? 0.85 : 0.15, 0.85)
      .setFlipX(flip)
      .setPosition(Math.round(hx), Math.round(this.y + 6))
      .setAngle(dir * (15 + swingAngle))
      .setDepth(this.depth + (behind ? -0.1 : 0.1));
  }

  /** โดนโจมตี — คืนดาเมจจริงหลังหักเกราะ (0 = ไม่โดน) */
  hurt(amount: number, from?: { x: number; y: number }): number {
    if (this.dead || this.sheltered || this.invuln > 0 || this.dodgeTime > 0) return 0;
    const dmg = Math.max(1, amount * (1 - this.damageReduction));
    this.hp = Math.max(0, this.hp - dmg);
    this.invuln = BALANCE.hurtInvuln;
    // ชิ้นเกราะที่มีความทนทาน สึก 1 ชิ้นแบบสุ่ม
    const worn = (['head', 'body', 'legs', 'feet', 'hands', 'offhand'] as EquipSlot[]).filter((k) => this.equip[k]?.dur !== undefined);
    if (worn.length) {
      const k = worn[Math.floor(Math.random() * worn.length)];
      const s = this.equip[k]!;
      s.dur! -= 1;
      if (s.dur! <= 0) {
        this.equip[k] = null;
        this.refreshLook();
        this.scene.events.emit('gear:broken', ITEMS[s.id].name);
      }
    }
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.clearTint());
    if (from) {
      const k = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(120);
      this.body.setVelocity(k.x, k.y);
    }
    // จอสั่นตามความแรง + ขอบจอแดง (GameScene ฟัง player:hurt)
    const k = Math.min(1, (dmg / Math.max(1, this.maxHp)) * 4);
    this.scene.cameras.main.shake(90 + 140 * k, 0.002 + 0.006 * k);
    this.scene.events.emit('player:hurt', dmg, this.maxHp);
    Sfx.play('hurt');
    return dmg;
  }

  heal(amount: number) {
    this.hp = Phaser.Math.Clamp(this.hp + amount, 0, this.maxHp);
  }

  eat(food: { hunger?: number; thirst?: number; hp?: number; sanity?: number }) {
    const p = this.char.passive;
    if (!p.robot) {
      this.hunger = Math.min(100, this.hunger + (food.hunger ?? 0));
      this.thirst = Math.min(100, this.thirst + (food.thirst ?? 0));
    }
    this.sanity = Phaser.Math.Clamp(this.sanity + (food.sanity ?? 0) + (p.cropSpeed && (food.thirst ?? 0) > 0 ? 3 : 0), 0, 100);
    if (food.hp) {
      if (food.hp > 0) this.heal(food.hp * (p.healMult ?? 1));
      else this.hp = Math.max(1, this.hp + food.hp);
    }
  }

  destroy(fromScene?: boolean) {
    this.shadowImg?.destroy();
    this.heldImg?.destroy();
    super.destroy(fromScene);
  }
}
