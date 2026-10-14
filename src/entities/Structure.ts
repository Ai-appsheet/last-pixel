import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { BUILD, type BuildDef, type ProdRecipe } from '../data/buildables';
import { CROPS, ITEMS } from '../data/items';
import { Inventory, type Slot } from '../components/Inventory';
import { BUILD_LEVEL, MAX_LEVEL, bandOf } from '../data/upgrade';
import { addLegendGlow, baseKeyOf, variantAnim, variantKey } from '../gfx/UpgradeLook';

/** ถังเก็บน้ำฝนจุได้กี่ครั้ง */
export const RAIN_WATER_CAP = 8;

/** สิ่งก่อสร้างทุกชนิด (ขับเคลื่อนด้วยข้อมูลใน buildables.ts) */
export class Structure extends Phaser.GameObjects.Sprite {
  readonly def: BuildDef;
  /** tile ซ้ายบนของฐาน */
  readonly tx: number;
  readonly ty: number;
  maxHp: number;
  hp: number;
  /** เชื้อเพลิง (วินาที) — กองไฟ / เครื่องปั่นไฟ */
  fuel = 0;
  powered = false;
  storage: Inventory | null = null;
  crop: string | null = null;
  growth = 0;
  cooldown = 0;
  /** ความคืบหน้าการผลิต (วินาที) — อาคารผลิต */
  prog = 0;
  /** น้ำที่เก็บไว้ (ครั้ง) — ถังเก็บน้ำฝน */
  water = 0;
  /** กำลังผลิตอยู่ไหม (ไว้เล่น anim) */
  working = false;
  /** เลเวลอัพเกรด 1..10 (ดู data/upgrade.ts) */
  lv = 1;
  /** HP ฐานก่อนคูณเลเวล (รวมโบนัสตัวละครแล้ว) */
  private hpBase: number;
  private turretLv: BuildDef['turret'] | null = null;
  private glow: Phaser.FX.Glow | null = null;
  private cropImg?: Phaser.GameObjects.Image;
  private hpBar?: Phaser.GameObjects.Rectangle;
  private open = false;

  constructor(scene: Phaser.Scene, def: BuildDef, tx: number, ty: number, hpMult = 1) {
    super(scene, (tx + def.w / 2) * 16, (ty + def.h) * 16, def.texture, def.frame);
    this.def = def;
    this.tx = tx;
    this.ty = ty;
    this.hpBase = def.hp * hpMult;
    this.maxHp = this.hp = Math.round(this.hpBase);
    this.setOrigin(0.5, 1);
    if (def.layer === 'floor') this.setDepth(-6 + this.y * 1e-5);
    else if (def.trap || def.crop || def.dock) this.setDepth(def.dock ? -6.5 : this.y - 16);
    else this.setDepth(this.y);
    scene.add.existing(this);
    if (def.anim) this.play(def.anim);
    if (def.id === 'campfire') this.fuel = BALANCE.campfireFuel;
    if (def.storage) {
      this.storage = new Inventory(0);
      this.storage.slots = new Array(def.storage).fill(null);
    }
  }

  get kind() {
    return this.def.id;
  }

  /** tile ที่ฐานครอบคลุม */
  *tiles(): Generator<[number, number]> {
    for (let y = 0; y < this.def.h; y++) for (let x = 0; x < this.def.w; x++) yield [this.tx + x, this.ty + y];
  }

  get lit(): boolean {
    const d = this.def;
    if (!d.light) return false;
    if (d.id === 'campfire') return this.fuel > 0;
    if (d.power === 'use') return this.powered;
    return true;
  }

  get lightRadius() {
    return this.lit ? (this.def.light ?? 0) * BUILD_LEVEL.light(this.lv) : 0;
  }

  // ---------- อัพเกรด ----------
  /** ป้อมยิงหลังคูณเลเวล (ดาเมจ/ระยะ/ความเร็วยิง) */
  get turret(): BuildDef['turret'] {
    const t = this.def.turret;
    if (!t || this.lv <= 1) return t;
    return (this.turretLv ??= {
      ...t,
      damage: Math.round(t.damage * BUILD_LEVEL.damage(this.lv) * 10) / 10,
      range: Math.round(t.range * BUILD_LEVEL.range(this.lv)),
      cooldown: Math.round(t.cooldown * BUILD_LEVEL.cooldown(this.lv) * 1000) / 1000,
    });
  }
  /** ตัวคูณดาเมจกับดัก */
  get dmgMult() {
    return BUILD_LEVEL.damage(this.lv);
  }
  /** ตัวคูณความเร็วผลิต */
  get prodMult() {
    return BUILD_LEVEL.production(this.lv);
  }

  /** ตั้งเลเวล: HP สูงสุด/ช่องเก็บของ/หน้าตาเปลี่ยนตาม · heal = เติม HP เต็ม (ตอนอัพเกรด) */
  setLevel(lv: number, heal = true) {
    this.lv = Phaser.Math.Clamp(Math.round(lv) || 1, 1, MAX_LEVEL);
    this.maxHp = Math.round(this.hpBase * BUILD_LEVEL.hp(this.lv));
    this.hp = heal ? this.maxHp : Math.min(this.hp, this.maxHp);
    if (this.storage && this.def.storage) {
      const want = Math.ceil(this.def.storage * BUILD_LEVEL.storage(this.lv) - 1e-6);
      while (this.storage.slots.length < want) this.storage.slots.push(null);
      this.storage.version++;
    }
    this.turretLv = null;
    this.applyLook();
    this.updateBar();
  }

  /** เปลี่ยน texture/anim เป็นแบบของช่วงเลเวล (เหล็ก/ทอง/ตำนาน) */
  private applyLook() {
    const band = bandOf(this.lv);
    const playing = this.anims.isPlaying ? this.anims.currentAnim?.key : undefined;
    const frame = this.frame?.name;
    const key = variantKey(this.scene, this.def.texture, band);
    if (this.texture.key !== key) {
      this.setTexture(key, frame);
      if (playing) this.play(baseKeyOf(playing));
    }
    // แสงเรืองเฉพาะของชิ้นใหญ่ (กำแพง/พื้น/แปลงผักที่วางติดกันเป็นแถว ถ้าเรืองทุกช่องจะเป็นกรอบลายตาและหนักเครื่อง)
    const big = this.def.w > 1 || this.def.h > 1 || this.def.category === 'defense' || this.def.category === 'machine';
    if (band === 'legend' && !this.glow && big) this.glow = addLegendGlow(this);
  }

  /** เล่น anim แบบของช่วงเลเวล */
  play(key: string | Phaser.Animations.Animation | Phaser.Types.Animations.PlayAnimationConfig, ignoreIfPlaying?: boolean): this {
    const band = bandOf(this.lv);
    return super.play(band && typeof key === 'string' ? variantAnim(this.scene, key, band) : key, ignoreIfPlaying);
  }

  /** เครื่องปั่นไฟ/กังหันที่ทำงานอยู่ */
  get powerSource(): number {
    if (this.def.power === 'gen' && this.fuel > 0) return 8;
    if (this.def.power === 'wind') return 6;
    return 0;
  }

  get ripe() {
    return !!this.crop && this.growth >= 1;
  }

  get cropStage(): number {
    if (!this.crop) return -1;
    return this.growth >= 1 ? 3 : this.growth >= 0.55 ? 2 : this.growth >= 0.2 ? 1 : 0;
  }

  addFuel(seconds: number) {
    const was = this.fuel > 0;
    this.fuel = Math.min(this.fuel + seconds, 900);
    if (!was && this.def.id === 'campfire') this.play('campfire_burn');
  }

  setDoorOpen(open: boolean) {
    if (this.def.blocks !== 'mobs' || open === this.open) return;
    this.open = open;
    this.setFrame(open ? 1 : 0);
  }

  setChestOpen(open: boolean) {
    if (this.def.id === 'chest') this.setFrame(open ? 1 : 0);
  }

  plant(crop: string) {
    this.crop = crop;
    this.growth = 0;
    this.updateCrop();
  }

  harvest(): string | null {
    const c = this.crop;
    this.crop = null;
    this.growth = 0;
    this.updateCrop();
    return c;
  }

  boostCrop() {
    if (!this.crop) return;
    this.growth = Math.min(1, this.growth + 0.4);
    this.updateCrop();
  }

  /** speed = ตัวคูณการโตของพืช, fuelMult = ฝนทำให้ไฟมอดเร็ว */
  tick(dt: number, speed = 1, fuelMult = 1) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const id = this.def.id;
    if ((id === 'campfire' || id === 'generator') && this.fuel > 0) {
      this.fuel -= dt * (id === 'campfire' ? fuelMult : 1);
      if (this.fuel <= 0) {
        this.fuel = 0;
        this.stop();
        this.setFrame(id === 'campfire' ? 3 : 0);
      } else if (id === 'generator' && !this.anims.isPlaying) this.play('generator_run');
    }
    if (this.def.power === 'use' && this.def.anim === undefined && !this.def.prod) {
      const anim = this.def.workAnim ?? (id === 'auto_miner' ? 'auto_miner_run' : id === 'sprinkler' ? 'sprinkler_spray' : null);
      if (anim) {
        if (this.powered && !this.anims.isPlaying) this.play(anim);
        if (!this.powered && this.anims.isPlaying) {
          this.stop();
          this.setFrame(0);
        }
      }
    }
    if (this.crop && this.growth < 1) {
      const before = this.cropStage;
      this.growth = Math.min(1, this.growth + (dt * speed) / CROPS[this.crop].grow);
      if (this.cropStage !== before) this.updateCrop();
    }
  }

  // ---------- อาคารผลิต ----------

  /** ช่องว่างที่ยังใส่ไอเทมนี้ได้อีกกี่ชิ้น */
  room(id: string): number {
    if (!this.storage) return 0;
    const stack = ITEMS[id]?.stack ?? 1;
    let n = 0;
    for (const s of this.storage.slots) {
      if (!s) n += stack;
      else if (s.id === id && !s.plus) n += Math.max(0, stack - s.qty);
    }
    return n;
  }

  /** สูตรแรกที่ทำได้ (วัตถุดิบครบ + ช่องว่างพอ) */
  private readyRecipe(): ProdRecipe | 'full' | null {
    const p = this.def.prod;
    const st = this.storage;
    if (!p || !st) return null;
    let full = false;
    for (const r of p.recipes) {
      if (r.in && !r.in.every(([id, n]) => st.count(id) >= n)) continue;
      if (!r.out.every(([id, n]) => this.room(id) >= n)) {
        full = true;
        continue;
      }
      return r;
    }
    return full ? 'full' : null;
  }

  /** ข้อความสถานะการผลิต (การ์ดข้อมูล) */
  get prodText(): string {
    const p = this.def.prod;
    if (!p) return '';
    if (p.power && !this.powered) return '⚠ ไม่มีไฟฟ้า';
    const r = this.readyRecipe();
    if (r === 'full') return '📦 ช่องเก็บเต็ม — กด E เก็บผลผลิต';
    if (!r) return 'รอวัตถุดิบ — กด E ใส่ของ';
    return `กำลังผลิต ${Math.floor((this.prog / p.every) * 100)}%`;
  }

  private setWorking(on: boolean) {
    if (on === this.working) return;
    this.working = on;
    const anim = this.def.workAnim;
    if (!anim) return;
    if (on) this.play(anim);
    else {
      this.stop();
      this.setFrame(this.def.frame ?? 0);
    }
  }

  /** เดินเวลาการผลิต — คืนรายการไอเทมที่เพิ่งได้ (หรือ null) */
  produce(dt: number): [string, number][] | null {
    const p = this.def.prod;
    if (!p || !this.storage) return null;
    const r = p.power && !this.powered ? null : this.readyRecipe();
    if (!r || r === 'full') {
      this.setWorking(false);
      return null;
    }
    this.setWorking(true);
    this.prog += dt * BUILD_LEVEL.production(this.lv);
    if (this.prog < p.every) return null;
    this.prog = 0;
    for (const [id, n] of r.in ?? []) this.storage.remove(id, n);
    const got: [string, number][] = [];
    if (r.pick) {
      const total = r.out.reduce((a, o) => a + (o[2] ?? 1), 0);
      let roll = Math.random() * total;
      for (const [id, n, w] of r.out) {
        roll -= w ?? 1;
        if (roll <= 0) {
          got.push([id, n]);
          break;
        }
      }
    } else for (const [id, n, ch] of r.out) if (Math.random() < (ch ?? 1)) got.push([id, n]);
    for (const [id, n] of got) this.storage.add(id, n);
    return got;
  }

  /** วาดพืชตามความคืบหน้าปัจจุบัน (หลังตั้งค่า growth ตรงๆ) */
  refreshCrop() {
    this.updateCrop();
  }

  private updateCrop() {
    if (!this.crop) {
      this.cropImg?.setVisible(false);
      return;
    }
    if (!this.cropImg) this.cropImg = this.scene.add.image(this.x, this.y, 'px').setOrigin(0.5, 1);
    this.cropImg.setTexture(`crop_${this.crop}_${this.cropStage}`).setVisible(true).setDepth(this.y - 1);
    if (this.ripe) this.scene.tweens.add({ targets: this.cropImg, scaleY: { from: 1.15, to: 1 }, duration: 300, ease: 'Back.easeOut' });
  }

  damage(amount: number): boolean {
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.clearTint());
    this.updateBar();
    return this.hp <= 0;
  }

  repair() {
    this.hp = this.maxHp;
    this.updateBar();
  }

  private updateBar() {
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    if (ratio >= 1) {
      this.hpBar?.setVisible(false);
      return;
    }
    const w = Math.max(14, this.def.w * 12);
    if (!this.hpBar) this.hpBar = this.scene.add.rectangle(this.x - w / 2, this.y + 1, w, 2, 0xb13e53).setOrigin(0, 0).setDepth(this.depth + 0.5);
    this.hpBar.setVisible(true).setSize(w * ratio, 2);
  }

  /** ข้อมูลสำหรับเซฟ */
  serialize() {
    return {
      id: this.def.id, tx: this.tx, ty: this.ty, lv: this.lv, hp: this.hp, fuel: this.fuel, crop: this.crop, growth: this.growth, prog: this.prog, water: this.water,
      storage: this.storage ? this.storage.slots.map((s) => (s ? { ...s } : null)) : null,
    };
  }

  static deserialize(scene: Phaser.Scene, d: ReturnType<Structure['serialize']>, hpMult = 1): Structure {
    const s = new Structure(scene, BUILD[d.id], d.tx, d.ty, hpMult);
    if (d.lv && d.lv > 1) s.setLevel(d.lv, false);
    s.hp = d.hp;
    s.fuel = d.fuel;
    s.prog = d.prog ?? 0;
    s.water = d.water ?? 0;
    if (d.crop) {
      s.plant(d.crop);
      s.growth = d.growth;
      s.refreshCrop();
    }
    if (d.storage && s.storage) s.storage.slots = d.storage.map((x: Slot | null) => (x ? { ...x } : null));
    if (s.def.id === 'campfire' && s.fuel <= 0) s.tick(0.01);
    return s;
  }

  destroy(fromScene?: boolean) {
    this.hpBar?.destroy();
    this.cropImg?.destroy();
    super.destroy(fromScene);
  }
}
