import Phaser from 'phaser';
import type { BuildDef } from '../data/buildables';
import { DEFAULT_FUEL, vehicleKind, type VehicleKind, type VehicleSpec } from '../data/vehicles';
import { Inventory } from '../components/Inventory';
import { MAX_LEVEL, VEHICLE_LEVEL, bandOf } from '../data/upgrade';
import { addLegendGlow, variantKey } from '../gfx/UpgradeLook';

/**
 * ยานพาหนะ (เรือ/รถ/ม้า/ยานบิน) — จอดอยู่กับที่ ผู้เล่นขึ้น/ลงด้วยปุ่ม E
 * ตำแหน่ง (x, y) = จุดบนพื้น · ยานบินยกตัวขึ้นด้วย alt (วาดลอยเหนือเงา)
 */
export class Vehicle extends Phaser.GameObjects.Sprite {
  readonly def: BuildDef;
  readonly spec: VehicleSpec;
  readonly kind: VehicleKind;
  hp: number;
  /** น้ำมัน (วินาทีที่วิ่งได้) */
  fuel = 0;
  /** แรงม้า/แรงลอย 0..100 */
  energy = 100;
  riding = false;
  /** ความเร็วปัจจุบัน (มีความเร่ง) */
  vel = new Phaser.Math.Vector2();
  gunCd = 0;
  /** ความสูงตอนบิน (px) */
  alt = 0;
  /** ห้องเก็บของ (เรือขนส่ง/เกวียน/จี๊ป) — ใช้หน้าต่างเดียวกับหีบ */
  storage: Inventory | null = null;
  /** เลเวลอัพเกรด 1..10 (ดู data/upgrade.ts) */
  lv = 1;
  private glow: Phaser.FX.Glow | null = null;
  private wake = 0;
  private shadowImg: Phaser.GameObjects.Ellipse | null = null;

  constructor(scene: Phaser.Scene, def: BuildDef, x: number, y: number) {
    super(scene, x, y, def.texture);
    this.def = def;
    this.spec = def.boat!;
    this.kind = vehicleKind(this.spec);
    this.hp = this.spec.hp;
    if (this.spec.cargo) {
      this.storage = new Inventory(0);
      this.storage.slots = new Array(this.spec.cargo).fill(null);
    }
    this.setOrigin(0.5, 0.6);
    this.setDepth(y);
    if (this.kind === 'air') this.shadowImg = scene.add.ellipse(x, y + 4, this.width * 0.6, 6, 0x0a0c1e, 0.25).setDepth(-4);
    scene.add.existing(this);
  }

  get maxHp() {
    return Math.round(this.spec.hp * VEHICLE_LEVEL.hp(this.lv));
  }
  /** ตัวคูณอัตรากินน้ำมัน (หลังคูณเลเวล) */
  get fuelUse() {
    return (this.spec.fuelUse ?? 1) * VEHICLE_LEVEL.fuelUse(this.lv);
  }
  /** สัดส่วนดาเมจที่ยานรับแทนคนขับ (หลังคูณเลเวล) */
  get armor() {
    return this.spec.armor ? VEHICLE_LEVEL.armor(this.spec.armor, this.lv) : 0;
  }

  /** ตั้งเลเวล: HP/ช่องเก็บของ/หน้าตาเปลี่ยนตาม · heal = เติม HP เต็ม */
  setLevel(lv: number, heal = true) {
    this.lv = Phaser.Math.Clamp(Math.round(lv) || 1, 1, MAX_LEVEL);
    this.hp = heal ? this.maxHp : Math.min(this.hp, this.maxHp);
    if (this.storage && this.spec.cargo) {
      const want = Math.ceil(this.spec.cargo * VEHICLE_LEVEL.cargo(this.lv) - 1e-6);
      while (this.storage.slots.length < want) this.storage.slots.push(null);
      this.storage.version++;
    }
    const base = this.texture.key.split('@')[0];
    const key = this.tex(base);
    if (key !== this.texture.key) {
      this.setTexture(key, this.frame?.name);
      this.syncLift();
    }
    if (bandOf(this.lv) === 'legend' && !this.glow) this.glow = addLegendGlow(this);
  }

  /** texture ตามช่วงเลเวล (รวมรูปหันขึ้น/ลง) */
  private tex(key: string) {
    return variantKey(this.scene, key, bandOf(this.lv));
  }

  get fuelItems() {
    return this.spec.fuelItems ?? DEFAULT_FUEL;
  }

  /** ความเร็วสูงสุดตอนนี้ (ก่อนคูณพื้น/เร่ง) */
  get speed() {
    const b = this.spec;
    const sp = b.speed * VEHICLE_LEVEL.speed(this.lv);
    if (b.fuel && this.fuel <= 0) return sp * (this.kind === 'air' ? 0.25 : 0.3); // หมดน้ำมัน = พาย/ไถลช้าๆ
    if (b.energy && this.energy <= 0) return sp * 0.4;
    return sp;
  }

  get accel() {
    return this.spec.accel ?? this.spec.speed * 2.5;
  }

  /** หันหน้ายานตามทิศ: แนวนอน = พลิกซ้าย/ขวา · แนวตั้ง = texture หันขึ้น/ลง (หรือพลิกถ้าไม่มีรูปหันลง) */
  face(vx: number, vy: number) {
    if (Math.abs(vx) < 1 && Math.abs(vy) < 1) return;
    const b = this.spec;
    if (Math.abs(vx) >= Math.abs(vy)) {
      this.setTexture(this.tex(this.def.texture)).setFlipX(vx < 0).setFlipY(false);
    } else if (b.down) {
      this.setTexture(this.tex(vy > 0 ? b.down : b.vertical)).setFlipX(false).setFlipY(false);
    } else {
      this.setTexture(this.tex(b.vertical)).setFlipY(vy > 0).setFlipX(false);
    }
    this.syncLift();
  }

  /** ยกตัว (ยานบิน) — เลื่อนจุดยึดภาพขึ้นตาม alt */
  syncLift() {
    this.setDisplayOrigin(this.width / 2, this.height * 0.6 + this.alt);
    if (this.shadowImg) {
      this.shadowImg.setPosition(this.x, this.y + 4).setVisible(this.visible);
      this.shadowImg.setScale(1 - Math.min(0.4, this.alt / 60));
    }
  }

  /** คลื่นท้ายเรือ / ฝุ่นล้อ / เมฆบาง */
  trail(dt: number, moving: boolean) {
    if (!moving) return;
    this.wake -= dt;
    if (this.wake > 0) return;
    const s = this.scene;
    if (this.kind === 'water') {
      this.wake = this.spec.speed > 180 ? 0.04 : 0.08;
      const w = s.add.image(this.x + Phaser.Math.Between(-4, 4), this.y + 2, 'px').setTint(0xd6e4ee).setDepth(-5).setAlpha(0.8);
      s.tweens.add({ targets: w, alpha: 0, scale: this.spec.speed > 180 ? 3.5 : 2.5, duration: 700, onComplete: () => w.destroy() });
    } else if (this.kind === 'land') {
      this.wake = 0.12;
      const d = s.add.image(this.x - this.vel.x * 0.06 + Phaser.Math.Between(-3, 3), this.y + 3, 'px').setTint(this.spec.energy ? 0x8a5a35 : 0xc9a46a).setDepth(this.y - 1).setAlpha(0.6);
      s.tweens.add({ targets: d, alpha: 0, scale: 2.2, y: d.y - 4, duration: 500, onComplete: () => d.destroy() });
    } else {
      this.wake = 0.25;
      const c = s.add.image(this.x - this.vel.x * 0.1, this.y - this.alt - 4, 'px').setTint(0xf4f4f4).setDepth(this.depth - 1).setAlpha(0.5);
      s.tweens.add({ targets: c, alpha: 0, scale: 3, duration: 900, onComplete: () => c.destroy() });
    }
  }

  damage(amount: number): boolean {
    this.hp -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.active && this.clearTint());
    return this.hp <= 0;
  }

  /** ให้หน้าต่างหีบ (UIScene) เรียกได้เหมือนสิ่งก่อสร้าง */
  setChestOpen(_open: boolean) {}

  destroy(fromScene?: boolean) {
    this.shadowImg?.destroy();
    this.shadowImg = null;
    super.destroy(fromScene);
  }
}

/** ชื่อเดิม (โค้ดเก่ายังอ้าง Boat) */
export { Vehicle as Boat };
