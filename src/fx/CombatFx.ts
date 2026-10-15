import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { quality, qualityKnobs } from '../core/Quality';
import { buildFxTextures } from '../gfx/art/fx';
import type { ItemDef } from '../data/items';
import type { WeaponClass } from '../data/weapons';

/**
 * เอฟเฟกต์การต่อสู้ทั้งหมด (สไตล์จิบิพิกเซล สดใส อ่านง่าย ไม่สยอง)
 *  - อนุภาคใช้ pool (สร้างภาพครั้งเดียวแล้ววนใช้) ขยับเองใน tick() ไม่สร้าง tween/อ็อบเจกต์ต่อเฟรม
 *  - จำนวนอนุภาคตามคุณภาพภาพ (สูง ×1 · กลาง ×0.6 · ต่ำ ×0.3 และไม่มี hit-stop/จอสั่น)
 *  - ตัวเลขดาเมจสูงสุด 24 อันพร้อมกัน (เกินแล้ววนใช้อันเก่าสุด)
 *  - hit-stop / slow-mo ปรับ timeScale ของ GameScene เท่านั้น (ฟิสิกส์ · tween · clock · dt ของ update)
 *  - เครื่องที่ตั้ง prefers-reduced-motion: ไม่มีแสงวาบ/จอสั่น
 */

const TOP = 1e6 + 5;
const OVERLAY = 1e6 + 60;

/** ธาตุของกระสุน/อาวุธ → สีและหน้าตาเอฟเฟกต์ */
export type FxEl = 'phys' | 'bullet' | 'fire' | 'ice' | 'bolt' | 'poison' | 'holy' | 'dark' | 'water' | 'wind' | 'earth' | 'arcane' | 'blood';

export const EL_COLOR: Record<FxEl, number> = {
  phys: 0xf4f4f4, bullet: 0xffcd75, fire: 0xef7d57, ice: 0x73eff7, bolt: 0xfff2b0, poison: 0xa7f070, holy: 0xffe9a0,
  dark: 0x8a5ad6, water: 0x41a6f6, wind: 0xd6e4ee, earth: 0xc28a50, arcane: 0xc58cff, blood: 0xd8606f,
};

/** สีตัวเลข: ขาว = ปกติ · เหลือง = คริ · แดง = ผู้เล่นโดน · เขียว = ฟื้น · ฟ้า = โล่/น้ำแข็ง · ม่วง = เวท */
export const NUM_COLOR = { hit: 0xffffff, crit: 0xffe14d, hurt: 0xff4d5e, heal: 0x7cf07a, shield: 0x5fb4ff, magic: 0xc58cff };

const PROJ_EL: Record<string, FxEl> = {
  fireball: 'fire', proj_ice: 'ice', proj_frost_orb: 'ice', proj_spark: 'bolt', proj_poison: 'poison', proj_naga: 'poison',
  proj_holy: 'holy', proj_void: 'dark', proj_shadow: 'dark', proj_ink: 'dark', proj_water: 'water', proj_wind: 'wind',
  proj_feather: 'wind', proj_rock: 'earth', proj_jade: 'earth', proj_stone: 'earth', proj_arcane: 'arcane', proj_blood: 'blood',
  bullet: 'bullet', proj_pellet: 'bullet', cannonball: 'bullet',
};

/** ธาตุจากชื่อ texture กระสุน */
export const projEl = (tex: string): FxEl => PROJ_EL[tex] ?? 'phys';

/** ธาตุจากอาวุธ (พลังพิเศษ > กระสุน > สถานะหลัก) */
export function itemEl(def?: ItemDef): FxEl {
  if (!def) return 'phys';
  switch (def.special) {
    case 'phoenixfire': case 'dragonfire': return 'fire';
    case 'frostnova': return 'ice';
    case 'venom': case 'tidal': return 'poison';
    case 'holylight': return 'holy';
    case 'blackhole': return 'dark';
    case 'bloodpact': return 'blood';
    case 'featherstorm': return 'wind';
  }
  if (def.effect === 'chain' || def.chain) return 'bolt';
  if (def.effect === 'burn') return 'fire';
  if (def.ranged) {
    const e = projEl(def.ranged.projectile);
    if (e !== 'phys' && e !== 'bullet') return e;
  }
  const st = def.status?.find((s) => s.kind !== 'stun' && s.kind !== 'bleed')?.kind;
  if (st === 'burn') return 'fire';
  if (st === 'freeze') return 'ice';
  if (st === 'poison') return 'poison';
  if (def.ranged) return projEl(def.ranged.projectile);
  return 'phys';
}

/** ผู้ใช้ขอลดการเคลื่อนไหว (ระบบปฏิบัติการ) */
let reducedMq: MediaQueryList | null = null;
export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  reducedMq ??= window.matchMedia('(prefers-reduced-motion: reduce)');
  return reducedMq.matches;
}

/** จอสั่นได้ไหม (คุณภาพต่ำ/ลดการเคลื่อนไหว = ไม่สั่น) — GameScene ใช้ห่อ camera.shake */
export const motionOk = () => !reducedMotion() && quality() !== 'low';

/** กระสุนที่จำธาตุไว้ทำหางกระสุน */
export type FxShot = { fxEl?: FxEl; fxT?: number };

/** โหมดจาง: 0 = จางตลอด · 1 = จางช่วงท้าย · 2 = โผล่แล้วหาย (sin) */
type Fade = 0 | 1 | 2;

class Part {
  img: Phaser.GameObjects.Image;
  x = 0; y = 0; vx = 0; vy = 0; g = 0; drag = 0;
  life = 0; max = 1; s0 = 1; s1 = 0; sy = 1; a0 = 1; vr = 0; floor = 1e9; fade: Fade = 0; flick = false;
  constructor(img: Phaser.GameObjects.Image) {
    this.img = img;
  }
}

class Pool {
  live: Part[] = [];
  free: Part[] = [];
  size = 0;
  constructor(public cap: number, private make: () => Phaser.GameObjects.Image) {}

  get(): Part | null {
    let p = this.free.pop();
    if (!p) {
      if (this.size >= this.cap) return null;
      this.size++;
      p = new Part(this.make());
    }
    this.live.push(p);
    return p;
  }

  kill(i: number) {
    const p = this.live[i];
    p.img.setVisible(false);
    const last = this.live.pop()!;
    if (i < this.live.length) this.live[i] = last;
    this.free.push(p);
  }
}

class Num {
  c: Phaser.GameObjects.Container;
  glyphs: Phaser.GameObjects.Image[] = [];
  on = false;
  x0 = 0; y0 = 0; dx = 0; t = 0; life = 1; s = 1; rise = 14; w = 8;
  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer) {
    this.c = scene.add.container(0, 0).setVisible(false);
    for (let i = 0; i < 8; i++) {
      const g = scene.add.image(0, 0, 'digit_0').setVisible(false);
      this.glyphs.push(g);
      this.c.add(g);
    }
    layer.add(this.c);
  }
}

/** วง (คลื่นกระแทก) — วาดลง Graphics ร่วมกัน */
interface Ring { x: number; y: number; r0: number; r1: number; t: number; max: number; col: number; w: number; ell: number; on: boolean }
/** เส้นสายฟ้า/แส้ */
interface Bolt { xs: Float32Array; ys: Float32Array; n: number; t: number; max: number; col: number; w: number; core: boolean; on: boolean }
/** วงเตือนท่าบอส (บนพื้น) */
interface Warn { x: number; y: number; ang: number; len: number; w: number; t: number; max: number; on: boolean }

const DIGIT_KEYS = ['digit_0', 'digit_1', 'digit_2', 'digit_3', 'digit_4', 'digit_5', 'digit_6', 'digit_7', 'digit_8', 'digit_9'];
const MAX_NUMS = 24;
const outBack = (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** จำนวนหลักของตัวเลขดาเมจ (1–6) */
const nd0 = (v: number) => Math.min(6, Math.max(1, Math.floor(Math.log10(Math.max(1, Math.round(v)))) + 1));

export class CombatFx {
  /** ตัวคูณจำนวนอนุภาคตามคุณภาพ */
  private k = 1;
  private low = false;
  private layer: Phaser.GameObjects.Layer;
  private top: Pool;
  private world: Pool;
  private nums: Num[] = [];
  private digits = new Int8Array(8);
  private gTop: Phaser.GameObjects.Graphics;
  private gGround: Phaser.GameObjects.Graphics;
  private rings: Ring[] = [];
  private bolts: Bolt[] = [];
  private warns: Warn[] = [];
  private dirtyTop = false;
  private dirtyGround = false;
  private vignette: Phaser.GameObjects.Image;
  private flashImg: Phaser.GameObjects.Image;
  private vigT = 0;
  private vigA = 0;
  private flashT = 0;
  private flashMax = 1;
  private flashA = 0;
  // ---------- เวลา (hit-stop / slow-mo) ----------
  private stopT = 0;
  private stopCd = 0;
  private slowT = 0;
  private slowScale = 1;
  private ts = 1;
  private worldPaused = false;
  private swingFlip = 1;
  private onQuality = () => this.applyQuality();

  constructor(private scene: Phaser.Scene) {
    buildFxTextures(scene);
    this.layer = scene.add.layer().setDepth(TOP);
    this.top = new Pool(360, () => {
      const img = scene.add.image(0, 0, 'fx_dot').setVisible(false);
      this.layer.add(img);
      return img;
    });
    this.world = new Pool(140, () => scene.add.image(0, 0, 'fx_dot').setVisible(false));
    this.gGround = scene.add.graphics().setDepth(-0.3);
    this.gTop = scene.add.graphics();
    this.layer.add(this.gTop);
    this.vignette = scene.add.image(0, 0, 'fx_vignette').setScrollFactor(0).setDepth(OVERLAY).setVisible(false);
    this.flashImg = scene.add.image(0, 0, 'px').setScrollFactor(0).setDepth(OVERLAY + 1).setVisible(false);
    this.applyQuality();
    this.setTimeScale(1);
    EventBus.on('quality', this.onQuality);
    scene.events.once('shutdown', () => {
      EventBus.off('quality', this.onQuality);
      this.stopT = this.slowT = 0;
      this.setTimeScale(1);
    });
  }

  private applyQuality() {
    const q = quality();
    this.k = qualityKnobs(q).particles;
    this.low = q === 'low';
    this.top.cap = Math.round(360 * this.k);
    this.world.cap = Math.max(48, Math.round(140 * this.k));
  }

  /** จำนวนตามคุณภาพ (ปัดแบบสุ่ม ให้ค่าเฉลี่ยตรง) */
  private n(count: number) {
    const c = count * this.k;
    return Math.floor(c) + (Math.random() < c % 1 ? 1 : 0);
  }

  /** ลุ้นปล่อยอนุภาคต่อเนื่อง (rate ต่อวินาที) */
  private every(rate: number, dt: number) {
    return Math.random() < rate * dt * this.k;
  }

  // ====================================================================== เวลา

  /**
   * เรียกต้นเฟรมจาก GameScene.update (dt จริง) → คืนตัวคูณเวลาของเฟรมนี้ (0 = หยุดชั่วขณะ)
   * อนุภาค/ตัวเลขขยับด้วยเวลาจริง (ยังพุ่งต่อระหว่าง hit-stop ให้ดูหนักแน่น)
   */
  tick(dt: number): number {
    this.stopCd -= dt;
    let ts = 1;
    if (this.stopT > 0) {
      this.stopT -= dt;
      ts = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      ts = this.slowScale;
    }
    if (ts !== this.ts) this.setTimeScale(ts);
    this.update(dt);
    return ts;
  }

  private setTimeScale(ts: number) {
    this.ts = ts;
    const s = this.scene;
    const world = (s as Phaser.Scene & { physics?: Phaser.Physics.Arcade.ArcadePhysics }).physics?.world;
    if (world) {
      if (ts === 0) {
        if (!world.isPaused) {
          world.isPaused = true;
          this.worldPaused = true;
        }
      } else {
        if (this.worldPaused) world.isPaused = false;
        this.worldPaused = false;
        world.timeScale = 1 / ts;
      }
    }
    s.tweens.timeScale = ts;
    s.time.timeScale = ts;
  }

  /** หยุดภาพชั่วขณะตอนตีหนัก/คริ (40–70 ms) · คุณภาพต่ำไม่มี · กันรัวติดกัน */
  hitStop(ms = 55) {
    if (this.low || this.stopCd > 0) return;
    const t = Phaser.Math.Clamp(ms, 30, 70) / 1000;
    this.stopT = Math.max(this.stopT, t);
    this.stopCd = t + 0.12;
  }

  /** ภาพช้า (ล้มบอส) */
  slowMo(sec: number, scale = 0.35) {
    this.slowT = Math.max(this.slowT, sec);
    this.slowScale = scale;
  }

  // ====================================================================== อนุภาค

  private spawn(pool: Pool, tex: string, x: number, y: number, life: number): Part | null {
    const p = pool.get();
    if (!p) return null;
    p.x = x;
    p.y = y;
    p.vx = p.vy = p.g = p.drag = p.vr = 0;
    p.life = p.max = life;
    p.s0 = 1;
    p.s1 = 0;
    p.sy = 1;
    p.a0 = 1;
    p.floor = 1e9;
    p.fade = 0;
    p.flick = false;
    const img = p.img;
    img.setTexture(tex).setPosition(x, y).setOrigin(0.5).setRotation(0).setScale(1).setAlpha(1).setFlipX(false).setVisible(true);
    img.clearTint();
    img.setBlendMode(Phaser.BlendModes.NORMAL);
    if (pool === this.world) img.cameraFilter = 0; // เคยถูกซ่อนนอกจอ (cullOffscreen) → ล้าง
    return p;
  }

  private stepPool(pool: Pool, dt: number) {
    const live = pool.live;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      p.life -= dt;
      if (p.life <= 0) {
        pool.kill(i);
        continue;
      }
      if (p.drag) {
        const f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f;
        p.vy *= f;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floor && p.vy > 0) {
        // เด้งกับพื้น
        p.y = p.floor;
        p.vy *= -0.42;
        p.vx *= 0.6;
      }
      const t = 1 - p.life / p.max;
      const sc = p.s0 + (p.s1 - p.s0) * t;
      let a = p.fade === 0 ? 1 - t : p.fade === 1 ? (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4) : Math.sin(Math.PI * Math.min(1, t * 1.15));
      if (p.flick && Math.random() < 0.35) a *= 0.45;
      const img = p.img;
      img.x = p.x;
      img.y = p.y;
      img.setScale(sc, sc * p.sy);
      img.setAlpha(a * p.a0);
      if (p.vr) img.rotation += p.vr * dt;
    }
  }

  private update(dt: number) {
    this.stepPool(this.top, dt);
    this.stepPool(this.world, dt);
    this.stepNums(dt);
    this.drawTop(dt);
    this.drawGround(dt);
    this.stepOverlay(dt);
  }

  // ====================================================================== ตัวเลขดาเมจ

  /**
   * ตัวเลขดาเมจเด้งขึ้นแล้วจาง (API เดิม) — ระบบอื่นส่งสีมาเอง
   * ตำแหน่งตรงหัวผู้เล่นพอดี (p.x, p.y − 12) = ผู้เล่นโดน (แดง) หรือฟื้น (สีเขียว → ขึ้น +)
   */
  damageNumber(x: number, y: number, amount: number, color = 0xffffff, crit = false) {
    if (!(amount > 0)) return;
    const p =(this.scene as Phaser.Scene & { player?: { x: number; y: number } }).player;
    if (p && x === p.x && y === p.y - 12) {
      if (color === 0xa7f070) this.num(x, y, amount, NUM_COLOR.heal, false, true);
      else this.num(x, y, amount, NUM_COLOR.hurt);
      return;
    }
    this.num(x, y, amount, crit ? NUM_COLOR.crit : color, crit);
  }

  /** ตัวเลขลอย: crit = ใหญ่ + "!" · plus = นำหน้า "+" (ฟื้นเลือด) */
  num(x: number, y: number, amount: number, color: number, crit = false, plus = false) {
    // หาช่องว่าง (เต็ม → ใช้อันที่เก่าที่สุด)
    let slot: Num | null = null;
    let oldest: Num | null = null;
    let stack = 0;
    for (const n of this.nums) {
      if (!n.on) {
        slot ??= n;
        continue;
      }
      if (!oldest || n.t > oldest.t) oldest = n;
      if (n.t < 0.4 && Math.abs(n.x0 - x) < 14 && Math.abs(n.y0 - y) < 12) stack++;
    }
    // ยังทับตัวเลขที่ลอยอยู่ (ตำแหน่งปัจจุบัน ตามความกว้างจริง) → ดันขึ้นทีละขั้น
    const s = crit ? 1.5 : amount < 3 ? 0.85 : 1;
    const w = (nd0(amount) + (plus ? 1 : 0) + (crit ? 1 : 0)) * 4 * s;
    let lift = 0;
    for (let tries = 0; tries < 6; tries++) {
      let hit = false;
      for (const n of this.nums) {
        if (!n.on || n === slot) continue;
        if (Math.abs(n.c.x - x) < (n.w * n.c.scaleX + w) / 2 && Math.abs(n.c.y - (y - stack * 6 - lift)) < 7 * Math.max(s, n.c.scaleX)) {
          hit = true;
          break;
        }
      }
      if (!hit) break;
      lift += 7 * s;
    }
    if (!slot && this.nums.length < MAX_NUMS) {
      slot = new Num(this.scene, this.layer);
      this.nums.push(slot);
    }
    slot ??= oldest!;
    // แยกหลัก (ไม่สร้างสตริง)
    let v = Math.max(1, Math.round(amount));
    let nd = 0;
    while (v > 0 && nd < 6) {
      this.digits[nd++] = v % 10;
      v = Math.floor(v / 10);
    }
    const x0 = 2 - (nd + (plus ? 1 : 0) + (crit ? 1 : 0)) * 2;
    let gi = 0;
    if (plus) this.glyph(slot.glyphs[gi], 'digit_+', x0 + gi++ * 4, color);
    for (let i = nd - 1; i >= 0; i--) this.glyph(slot.glyphs[gi], DIGIT_KEYS[this.digits[i]], x0 + gi++ * 4, color);
    if (crit) this.glyph(slot.glyphs[gi], 'digit_!', x0 + gi++ * 4, color);
    for (let i = gi; i < 8; i++) slot.glyphs[i].setVisible(false);
    // กองซ้อนไม่ให้ทับกัน: เลื่อนขึ้น + สลับซ้ายขวา
    slot.x0 = x + (stack ? (stack % 2 ? 5 : -5) * Math.ceil(stack / 2) : 0);
    slot.y0 = y - stack * 6 - lift;
    slot.dx = rnd(-4, 4);
    slot.t = 0;
    slot.s = s;
    slot.w = w / s;
    slot.rise = 16; // ลอยเท่ากันทุกอัน (ไม่ไล่ทับกัน)
    slot.life = crit ? 1.05 : 0.85;
    slot.on = true;
    slot.c.setPosition(Math.round(slot.x0), Math.round(slot.y0)).setScale(slot.s * 1.8).setAlpha(1).setVisible(true);
    this.layer.bringToTop(slot.c); // อันใหม่อยู่บนสุด
  }

  private glyph(g: Phaser.GameObjects.Image, key: string, x: number, color: number) {
    g.setTexture(key).setPosition(x, 0).setTint(color).setVisible(true);
  }

  private stepNums(dt: number) {
    for (const n of this.nums) {
      if (!n.on) continue;
      n.t += dt;
      if (n.t >= n.life) {
        n.on = false;
        n.c.setVisible(false);
        continue;
      }
      const kp = Math.min(1, n.t / 0.14);
      const ky = Math.min(1, n.t / 0.42);
      const sc = n.s * (1.8 - 0.8 * outBack(kp));
      const fadeAt = n.life - 0.28;
      n.c.setPosition(Math.round(n.x0 + n.dx * ky), Math.round(n.y0 - n.rise * outBack(ky)));
      n.c.setScale(sc);
      n.c.setAlpha(n.t > fadeAt ? 1 - (n.t - fadeAt) / 0.28 : 1);
    }
  }

  // ====================================================================== เอฟเฟกต์พื้นฐาน (API เดิม)

  /** ประกายกระแทก (บวกแสง) */
  sparks(x: number, y: number, color: number, n = 6, speed = 18) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) {
      const p = this.spawn(this.top, 'fx_px', x, y, rnd(0.18, 0.32));
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const d = speed * rnd(0.5, 1.5) * 3.2;
      p.vx = Math.cos(a) * d;
      p.vy = Math.sin(a) * d;
      p.drag = 7;
      p.s0 = 0.6;
      p.s1 = 0.15;
      p.img.setTint(color).setBlendMode(Phaser.BlendModes.ADD);
    }
  }

  /** เศษวัสดุกระเด็น (ไม้/หิน/ใบไม้) มีแรงโน้มถ่วง เด้งพื้น */
  debris(x: number, y: number, color: number, n = 5) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) {
      const p = this.spawn(this.world, 'fx_px', x, y, rnd(0.45, 0.7));
      if (!p) return;
      p.vx = rnd(-40, 40);
      p.vy = rnd(-75, -40);
      p.g = 320;
      p.floor = y + rnd(2, 6);
      p.s0 = p.s1 = 0.5;
      p.fade = 1;
      p.img.setTint(color).setDepth(y + 10);
    }
  }

  /** วงแรงกระแทก */
  ring(x: number, y: number, color: number, radius = 12, width = 1.5, dur = 0.24, ell = 1) {
    let r: Ring | undefined;
    for (const o of this.rings) if (!o.on) {
      r = o;
      break;
    }
    if (!r) {
      if (this.rings.length >= 48) return;
      r = { x: 0, y: 0, r0: 0, r1: 0, t: 0, max: 1, col: 0, w: 1, ell: 1, on: false };
      this.rings.push(r);
    }
    r.x = x;
    r.y = y;
    r.r0 = Math.min(2, radius * 0.2);
    r.r1 = radius;
    r.t = 0;
    r.max = dur;
    r.col = color;
    r.w = width;
    r.ell = ell;
    r.on = true;
    this.dirtyTop = true;
  }

  /** ควัน/ฝุ่นฟุ้ง */
  poof(x: number, y: number, color = 0x94b0c2, n = 8) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) {
      const a = (i / c) * Math.PI * 2 + rnd(-0.3, 0.3);
      const p = this.spawn(this.top, 'fx_puff', x, y, rnd(0.4, 0.55));
      if (!p) return;
      p.vx = Math.cos(a) * rnd(18, 30);
      p.vy = Math.sin(a) * rnd(10, 18) - 8;
      p.drag = 3;
      p.s0 = 0.5;
      p.s1 = 1.3;
      p.a0 = 0.8;
      p.img.setTint(color);
    }
  }

  /** รอยฟันทั่วไป (API เดิม) */
  slash(x: number, y: number, angle: number, color: number, depth: number, big = false) {
    this.arc(x, y, angle, big ? 1.25 : 1, 1.1, 0.15, color, depth, false);
  }

  // ====================================================================== ประชิด

  /** รอยฟันวงโค้ง: หมุนตามทิศเหวี่ยง + แกนขาวสว่าง */
  private arc(x: number, y: number, angle: number, scale: number, sweep: number, life: number, color: number, depth: number, heavy: boolean) {
    const dir = (this.swingFlip = -this.swingFlip);
    const tex = heavy ? 'fx_arc_heavy' : 'fx_arc';
    for (let i = 0; i < 2; i++) {
      const p = this.spawn(this.world, i ? (heavy ? 'fx_arc_heavy' : 'fx_arc_core') : tex, x, y, life);
      if (!p) return;
      p.s0 = scale * 0.85;
      p.s1 = scale * 1.08;
      p.fade = 1;
      p.vr = (sweep / life) * dir;
      p.img.setRotation(angle - (sweep / 2) * dir).setDepth(depth + i * 0.01);
      if (i) {
        p.img.setBlendMode(Phaser.BlendModes.ADD);
        if (heavy) {
          p.s0 *= 0.82;
          p.s1 *= 0.82;
          p.a0 = 0.7;
        }
      } else p.img.setTint(color);
    }
  }

  /** ท่าเหวี่ยงตามชนิดอาวุธ (ดาบโค้ง · หอกแทง · ขวานโค้งหนัก · หมัดฝุ่น ฯลฯ) */
  swing(cls: WeaponClass | undefined, px: number, py: number, angle: number, reach: number, color: number, depth: number) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const sx = px + cos * 6;
    const sy = py + 2 + sin * 6;
    const sc = Phaser.Math.Clamp(reach / 22, 0.75, 1.7);
    switch (cls) {
      case 'spear': {
        const p = this.spawn(this.world, 'fx_thrust', px + cos * 4, py + 2 + sin * 4, 0.13);
        if (p) {
          p.img.setOrigin(0, 0.5).setRotation(angle).setTint(color).setDepth(depth);
          p.s0 = (reach / 36) * 0.5;
          p.s1 = reach / 36;
          p.sy = 0.7 / p.s1;
          p.fade = 1;
        }
        this.starPop(px + cos * (reach - 2), py + 2 + sin * (reach - 2), 0xffffff, 0.5);
        break;
      }
      case 'whip': {
        // แส้: เส้นโค้งสะบัด + ปลายแส้ดีด
        const len = reach - 4;
        const b = this.bolt(sx, sy, sx + cos * len, sy + sin * len, 0xc28a50, 1, false, 0.16);
        if (b) for (let i = 1; i < b.n - 1; i++) {
          const t = i / (b.n - 1);
          const off = Math.sin(t * Math.PI) * 6 * (1 - t * 0.5) * this.swingFlip;
          b.xs[i] = sx + cos * len * t - sin * off;
          b.ys[i] = sy + sin * len * t + cos * off;
        }
        this.swingFlip = -this.swingFlip;
        this.starPop(sx + cos * len, sy + sin * len, 0xffcd75, 0.55);
        break;
      }
      case 'greatsword':
      case 'scythe':
        this.arc(sx, sy, angle, sc * 0.95, 2.2, 0.2, color, depth, true);
        break;
      case 'axe':
        this.arc(sx, sy, angle, sc * 0.9, 1.5, 0.16, color, depth, true);
        break;
      case 'mace':
        this.arc(sx, sy, angle, sc * 0.8, 1.3, 0.17, color, depth, true);
        break;
      case 'dagger':
        this.arc(sx, sy, angle, sc * 0.7, 0.9, 0.09, color, depth, false);
        break;
      case 'fist': {
        const tx = px + cos * 14;
        const ty = py + 2 + sin * 14;
        for (let i = 0; i < this.n(3) + 1; i++) {
          const p = this.spawn(this.world, 'fx_puff', tx, ty, rnd(0.18, 0.26));
          if (!p) break;
          const a = angle + rnd(-1.1, 1.1);
          p.vx = Math.cos(a) * rnd(30, 60);
          p.vy = Math.sin(a) * rnd(30, 60);
          p.drag = 9;
          p.s0 = 0.45;
          p.s1 = 0.9;
          p.img.setTint(0xffffff).setDepth(depth);
        }
        this.ring(tx, ty, color, 7, 1);
        break;
      }
      default:
        this.arc(sx, sy, angle, sc, 1.6, 0.13, color, depth, false);
    }
  }

  /** ดาวดวงเล็กเด้งออก */
  private starPop(x: number, y: number, tint: number, scale: number) {
    const p = this.spawn(this.top, 'fx_spark4', x, y, 0.12);
    if (!p) return;
    p.s0 = scale * 2;
    p.s1 = scale * 0.6;
    p.img.setTint(tint).setBlendMode(Phaser.BlendModes.ADD);
  }

  /** ตีโดน: เส้นประกายพุ่ง + ดาวกระจาย + วงเล็ก (คริ = เหลือง ใหญ่กว่า) */
  hit(x: number, y: number, angle: number, crit: boolean, heavy: boolean, el: FxEl = 'phys') {
    const col = crit ? NUM_COLOR.crit : 0xffffff;
    // แฟลชตรงจุดกระทบ
    const f = this.spawn(this.top, 'fx_spark4', x, y, crit ? 0.12 : 0.08);
    if (f) {
      f.s0 = crit ? 3 : 2.2;
      f.s1 = 0.6;
      f.img.setTint(col).setBlendMode(Phaser.BlendModes.ADD).setRotation(Math.random() * 0.8);
    }
    const streaks = this.n(crit ? 8 : heavy ? 6 : 4);
    for (let i = 0; i < streaks; i++) {
      const a = angle + rnd(-0.95, 0.95);
      const sp = rnd(90, 170) * (crit ? 1.25 : 1);
      const p = this.spawn(this.top, 'fx_streak', x, y, rnd(0.12, 0.2));
      if (!p) break;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.drag = 9;
      p.s0 = crit ? 1 : 0.8;
      p.s1 = 0.2;
      p.img.setRotation(a).setTint(i % 2 ? col : EL_COLOR[el]).setBlendMode(Phaser.BlendModes.ADD);
    }
    const stars = crit ? this.n(4) + 1 : heavy ? this.n(2) : Math.random() < 0.6 ? 1 : 0;
    for (let i = 0; i < stars; i++) {
      const a = angle + rnd(-1.3, 1.3);
      const p = this.spawn(this.top, 'fx_star', x, y - 2, rnd(0.32, 0.45));
      if (!p) break;
      p.vx = Math.cos(a) * rnd(35, 70);
      p.vy = Math.sin(a) * rnd(25, 50) - 45;
      p.g = 220;
      p.s0 = crit ? 0.8 : 0.6;
      p.s1 = 0.25;
      p.fade = 1;
      p.vr = rnd(-8, 8);
    }
    this.ring(x, y, col, crit ? 15 : heavy ? 12 : 9, crit ? 2 : 1.5, crit ? 0.26 : 0.2);
    if (el !== 'phys' && el !== 'bullet') this.impact(x, y, el, 0.6);
  }

  // ====================================================================== ระยะไกล

  /** ประกายปากกระบอกปืน / สายธนูดีด / แสงร่ายเวท */
  muzzle(x: number, y: number, angle: number, kind: 'gun' | 'heavy' | 'bow' | 'magic', el: FxEl = 'phys') {
    if (kind === 'bow') {
      for (let i = 0; i < 2; i++) {
        const p = this.spawn(this.top, 'fx_streak', x, y, 0.1);
        if (!p) return;
        const a = angle + (i ? 0.5 : -0.5) + Math.PI;
        p.vx = Math.cos(a) * 40;
        p.vy = Math.sin(a) * 40;
        p.s0 = 0.7;
        p.s1 = 0.2;
        p.img.setRotation(a).setAlpha(0.7);
      }
      return;
    }
    if (kind === 'magic') {
      const col = EL_COLOR[el];
      const p = this.spawn(this.top, 'fx_cross', x, y, 0.16);
      if (p) {
        p.s0 = 1.8;
        p.s1 = 0.4;
        p.vr = 6;
        p.img.setTint(col).setBlendMode(Phaser.BlendModes.ADD);
      }
      this.ring(x, y, col, 7, 1, 0.16);
      for (let i = 0; i < this.n(3); i++) this.elemBit(x, y, el, angle + rnd(-1.2, 1.2), rnd(20, 45));
      return;
    }
    const heavy = kind === 'heavy';
    const f = this.spawn(this.top, 'fx_muzzle', x, y, heavy ? 0.08 : 0.06);
    if (f) {
      f.s0 = heavy ? 1.7 : 1.2;
      f.s1 = heavy ? 1.1 : 0.8;
      f.img.setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
    }
    for (let i = 0; i < this.n(heavy ? 5 : 3); i++) {
      const a = angle + rnd(-0.35, 0.35);
      const p = this.spawn(this.top, 'fx_streak', x, y, rnd(0.06, 0.12));
      if (!p) break;
      const sp = rnd(140, 220);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.drag = 10;
      p.s0 = 0.9;
      p.s1 = 0.2;
      p.img.setRotation(a).setTint(0xffcd75).setBlendMode(Phaser.BlendModes.ADD);
    }
    for (let i = 0; i < this.n(heavy ? 4 : 2); i++) {
      const p = this.spawn(this.top, 'fx_puff', x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, rnd(0.35, 0.5));
      if (!p) break;
      p.vx = Math.cos(angle) * rnd(15, 35) + rnd(-8, 8);
      p.vy = Math.sin(angle) * rnd(15, 35) - 10;
      p.drag = 4;
      p.s0 = 0.4;
      p.s1 = 1;
      p.a0 = 0.6;
      p.img.setTint(0xd6e4ee);
    }
  }

  /** หางกระสุนตามธาตุ — เรียกทุกเฟรมต่อกระสุน */
  shotTrail(shot: Phaser.Physics.Arcade.Image & FxShot, dt: number) {
    const el = shot.fxEl ?? 'phys';
    const gap = (el === 'phys' || el === 'bullet' || el === 'wind' ? 0.03 : 0.045) / Math.max(0.3, this.k);
    shot.fxT = (shot.fxT ?? 0) - dt;
    if (shot.fxT > 0) return;
    shot.fxT = gap;
    const v = shot.body?.velocity;
    const ang = v ? Math.atan2(v.y, v.x) : shot.rotation;
    const x = shot.x;
    const y = shot.y;
    switch (el) {
      case 'phys':
      case 'bullet':
      case 'wind': {
        const p = this.spawn(this.top, 'fx_streak', x - Math.cos(ang) * 3, y - Math.sin(ang) * 3, el === 'bullet' ? 0.08 : 0.12);
        if (!p) return;
        p.s0 = el === 'bullet' ? 1.2 : 0.9;
        p.s1 = 0.3;
        p.a0 = el === 'phys' ? 0.45 : 0.75;
        p.img.setRotation(ang).setTint(EL_COLOR[el]).setBlendMode(Phaser.BlendModes.ADD);
        return;
      }
      default:
        this.elemBit(x, y, el, ang + Math.PI + rnd(-0.6, 0.6), rnd(8, 22));
    }
  }

  /** ชิ้นส่วนธาตุ 1 ชิ้น (ใช้ทั้งหางกระสุน/แสงร่าย/ระเบิด) */
  private elemBit(x: number, y: number, el: FxEl, a: number, sp: number) {
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp;
    switch (el) {
      case 'fire': {
        // เปลวไฟเล็ก (ทรงหยดไฟ) สลับลูกไฟกลม สีส้ม/เหลือง
        const flame = Math.random() < 0.55;
        const p = this.spawn(this.top, flame ? 'fx_wisp' : 'fx_dot', x + rnd(-2, 2), y + rnd(-2, 2), rnd(0.3, 0.5));
        if (!p) return;
        p.vx = vx * 0.5;
        p.vy = vy * 0.5 - rnd(20, 40);
        p.s0 = flame ? 1.6 : 1.4;
        p.s1 = 0.3;
        p.fade = 1;
        p.flick = !flame;
        p.img.setTint(Math.random() < 0.5 ? 0xef7d57 : 0xffcd75);
        return;
      }
      case 'ice': {
        const p = this.spawn(this.top, 'fx_shard', x + rnd(-2, 2), y + rnd(-2, 2), rnd(0.3, 0.45));
        if (!p) return;
        p.vx = vx;
        p.vy = vy;
        p.drag = 4;
        p.s0 = 0.8;
        p.s1 = 0.3;
        p.fade = 1;
        p.vr = rnd(-6, 6);
        return;
      }
      case 'bolt': {
        const p = this.spawn(this.top, 'fx_spark4', x + rnd(-4, 4), y + rnd(-4, 4), rnd(0.08, 0.14));
        if (!p) return;
        p.s0 = rnd(0.8, 1.4);
        p.s1 = 0.3;
        p.flick = true;
        p.img.setTint(Math.random() < 0.5 ? 0xfff2b0 : 0x73eff7).setBlendMode(Phaser.BlendModes.ADD).setRotation(Math.random());
        return;
      }
      case 'poison': {
        const p = this.spawn(this.top, 'fx_bubble', x + rnd(-3, 3), y + rnd(-3, 3), rnd(0.4, 0.6));
        if (!p) return;
        p.vx = vx * 0.4;
        p.vy = vy * 0.4 - rnd(8, 16);
        p.s0 = 1;
        p.s1 = 1.7;
        p.fade = 1;
        p.img.setTint(Math.random() < 0.5 ? 0xa7f070 : 0x38b764);
        return;
      }
      case 'holy': {
        const p = this.spawn(this.top, 'fx_cross', x + rnd(-3, 3), y + rnd(-3, 3), rnd(0.35, 0.5));
        if (!p) return;
        p.vx = vx * 0.3;
        p.vy = vy * 0.3 - 10;
        p.s0 = 0.9;
        p.s1 = 0.1;
        p.fade = 2;
        p.img.setTint(Math.random() < 0.5 ? 0xffe9a0 : 0xffffff).setBlendMode(Phaser.BlendModes.ADD);
        return;
      }
      case 'dark': {
        const p = this.spawn(this.top, 'fx_wisp', x + rnd(-3, 3), y + rnd(-3, 3), rnd(0.45, 0.65));
        if (!p) return;
        p.vx = vx * 0.4 + rnd(-6, 6);
        p.vy = vy * 0.4 - rnd(10, 20);
        p.s0 = 0.6;
        p.s1 = 1.2;
        p.a0 = 0.75;
        p.vr = rnd(-2, 2);
        p.img.setTint(Math.random() < 0.5 ? 0x5d275d : 0x8a5ad6);
        return;
      }
      case 'water':
      case 'blood': {
        const p = this.spawn(this.top, el === 'water' ? 'fx_dot' : 'fx_drop', x, y, rnd(0.3, 0.45));
        if (!p) return;
        p.vx = vx;
        p.vy = vy - 20;
        p.g = 160;
        p.s0 = 0.8;
        p.s1 = 0.4;
        p.fade = 1;
        p.img.setTint(el === 'water' ? (Math.random() < 0.5 ? 0x41a6f6 : 0x73eff7) : 0xd8606f);
        return;
      }
      case 'earth': {
        const p = this.spawn(this.top, 'fx_pebble', x, y, rnd(0.35, 0.5));
        if (!p) return;
        p.vx = vx;
        p.vy = vy - 30;
        p.g = 260;
        p.s0 = p.s1 = rnd(0.6, 1);
        p.fade = 1;
        p.img.setTint(Math.random() < 0.5 ? 0xc28a50 : 0x8a5a35);
        return;
      }
      default: {
        // arcane / อื่นๆ: ประกายดาวม่วง
        const p = this.spawn(this.top, 'fx_spark4', x + rnd(-3, 3), y + rnd(-3, 3), rnd(0.25, 0.4));
        if (!p) return;
        p.vx = vx * 0.4;
        p.vy = vy * 0.4;
        p.s0 = 1;
        p.s1 = 0.2;
        p.img.setTint(EL_COLOR[el]).setBlendMode(Phaser.BlendModes.ADD);
      }
    }
  }

  /** จุดกระทบตามธาตุ (กระสุนโดน/ลูกแก้วแตก) — size 1 = ปกติ */
  impact(x: number, y: number, el: FxEl, size = 1) {
    const col = EL_COLOR[el];
    if (el === 'phys' || el === 'bullet') {
      this.poof(x, y, 0xd6e4ee, Math.round(3 * size));
      this.sparks(x, y, el === 'bullet' ? 0xffcd75 : 0xffffff, Math.round(4 * size), 16);
      return;
    }
    const cnt = this.n(8 * size) + 1;
    for (let i = 0; i < cnt; i++) this.elemBit(x, y, el, (i / cnt) * Math.PI * 2 + rnd(-0.3, 0.3), rnd(35, 70) * size);
    switch (el) {
      case 'ice':
        // วงน้ำแข็ง (วงรีบนพื้น)
        this.ring(x, y + 2, 0xc8f4ff, 16 * size + 4, 2, 0.32, 0.6);
        this.ring(x, y, 0x73eff7, 10 * size + 3, 1, 0.22);
        break;
      case 'bolt': {
        // สายฟ้าซิกแซกสั้นๆ แตกออก 3 เส้น
        const nb = Math.max(1, this.n(3));
        for (let i = 0; i < nb; i++) {
          const a = Math.random() * Math.PI * 2;
          const l = rnd(10, 18) * size;
          this.bolt(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0x73eff7, 1, true, 0.12);
        }
        this.ring(x, y, 0xfff2b0, 10 * size + 2, 1.5, 0.18);
        break;
      }
      case 'holy':
        this.ring(x, y, 0xffe9a0, 14 * size + 2, 2, 0.3);
        this.starPop(x, y, 0xffffff, 1.2 * size);
        break;
      case 'dark':
        this.ring(x, y, 0x8a5ad6, 12 * size + 2, 2, 0.3);
        break;
      case 'fire':
        this.ring(x, y, 0xffcd75, 12 * size + 2, 2, 0.24);
        this.poof(x, y - 2, 0x566c86, Math.round(2 * size));
        break;
      case 'poison':
        this.ring(x, y + 2, 0x38b764, 12 * size + 2, 1.5, 0.3, 0.6);
        break;
      default:
        this.ring(x, y, col, 11 * size + 2, 1.5, 0.22);
    }
  }

  /** ระเบิด: ลูกไฟ + ควันดำ + คลื่นวงรีบนพื้น + เศษหิน */
  explosion(x: number, y: number, radius: number) {
    this.impact(x, y, 'fire', Math.min(2, radius / 24));
    this.ring(x, y + 2, 0xffffff, radius * 1.1, 3, 0.35, 0.6);
    this.poof(x, y, 0x333c57, 10);
    this.debris(x, y + 2, 0x566c86, 6);
    const f = this.spawn(this.top, 'fx_muzzle', x, y, 0.12);
    if (f) {
      f.s0 = radius / 6;
      f.s1 = radius / 12;
      f.img.setBlendMode(Phaser.BlendModes.ADD);
    }
  }

  // ====================================================================== เส้นสายฟ้า / วง (Graphics)

  /** เส้นซิกแซก (สายฟ้า) ระหว่างสองจุด — คืน record ให้ปรับจุดเองได้ (แส้) */
  bolt(x1: number, y1: number, x2: number, y2: number, col: number, w = 2, core = true, dur = 0.2): Bolt | null {
    let b: Bolt | undefined;
    for (const o of this.bolts) if (!o.on) {
      b = o;
      break;
    }
    if (!b) {
      if (this.bolts.length >= 24) return null;
      b = { xs: new Float32Array(12), ys: new Float32Array(12), n: 0, t: 0, max: 1, col: 0, w: 1, core: true, on: false };
      this.bolts.push(b);
    }
    const n = core ? 6 : 12;
    const nx = -(y2 - y1);
    const ny = x2 - x1;
    const nl = Math.hypot(nx, ny) || 1;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const j = i === 0 || i === n - 1 ? 0 : rnd(-4, 4);
      b.xs[i] = x1 + (x2 - x1) * t + (nx / nl) * j;
      b.ys[i] = y1 + (y2 - y1) * t + (ny / nl) * j;
    }
    b.n = n;
    b.t = 0;
    b.max = dur;
    b.col = col;
    b.w = w;
    b.core = core;
    b.on = true;
    this.dirtyTop = true;
    return b;
  }

  private drawTop(dt: number) {
    if (!this.dirtyTop) return;
    const g = this.gTop;
    g.clear();
    let any = false;
    for (const r of this.rings) {
      if (!r.on) continue;
      r.t += dt;
      if (r.t >= r.max) {
        r.on = false;
        continue;
      }
      any = true;
      const k = 1 - (1 - r.t / r.max) ** 3;
      const rad = r.r0 + (r.r1 - r.r0) * k;
      g.lineStyle(Math.max(0.6, r.w * (1 - k * 0.6)), r.col, 1 - k * k);
      if (r.ell !== 1) {
        g.save();
        g.translateCanvas(r.x, r.y);
        g.scaleCanvas(1, r.ell);
        g.strokeCircle(0, 0, rad);
        g.restore();
      } else g.strokeCircle(r.x, r.y, rad);
    }
    for (const b of this.bolts) {
      if (!b.on) continue;
      b.t += dt;
      if (b.t >= b.max) {
        b.on = false;
        continue;
      }
      any = true;
      const a = 1 - b.t / b.max;
      const flick = b.core && Math.random() < 0.3 ? 0.5 : 1;
      g.lineStyle(b.w + (b.core ? 1 : 0), b.col, a * flick);
      g.beginPath();
      g.moveTo(b.xs[0], b.ys[0]);
      for (let i = 1; i < b.n; i++) g.lineTo(b.xs[i], b.ys[i]);
      g.strokePath();
      if (b.core) {
        g.lineStyle(1, 0xffffff, a);
        g.beginPath();
        g.moveTo(b.xs[0], b.ys[0]);
        for (let i = 1; i < b.n; i++) g.lineTo(b.xs[i], b.ys[i]);
        g.strokePath();
      }
    }
    this.dirtyTop = any;
  }

  // ====================================================================== วงเตือนท่าบอส

  private warn(): Warn | null {
    for (const o of this.warns) if (!o.on) return o;
    if (this.warns.length >= 16) return null;
    const w: Warn = { x: 0, y: 0, ang: 0, len: 0, w: 0, t: 0, max: 1, on: false };
    this.warns.push(w);
    return w;
  }

  /** แถบเตือนสีแดงตามแนวพุ่ง (ชาร์จ/ยิง) — เติมจากโคนไปปลายจนเต็มแล้วโจมตี */
  telegraphLine(x: number, y: number, ang: number, len: number, width: number, dur: number) {
    const w = this.warn();
    if (!w) return;
    w.x = x;
    w.y = y;
    w.ang = ang;
    w.len = len;
    w.w = width;
    w.t = 0;
    w.max = dur;
    w.on = true;
    this.dirtyGround = true;
  }

  private drawGround(dt: number) {
    if (!this.dirtyGround) return;
    const g = this.gGround;
    g.clear();
    let any = false;
    for (const w of this.warns) {
      if (!w.on) continue;
      w.t += dt;
      if (w.t >= w.max) {
        w.on = false;
        continue;
      }
      any = true;
      const k = w.t / w.max;
      // กะพริบเร็วขึ้นช่วงท้าย
      const blink = k > 0.7 && Math.floor(w.t * 20) % 2 ? 0.55 : 1;
      g.fillStyle(0xff3355, 0.14 * blink);
      this.quad(w, w.len);
      g.fillPath();
      g.fillStyle(0xff3355, (0.25 + 0.25 * k) * blink);
      this.quad(w, w.len * k);
      g.fillPath();
      g.lineStyle(1.5, 0xff5a6e, 0.9 * blink);
      this.quad(w, w.len);
      g.strokePath();
    }
    this.dirtyGround = any;
  }

  /** สี่เหลี่ยมเอียงตามแนวเตือน (จากโคนยาว len) */
  private quad(w: Warn, len: number) {
    const g = this.gGround;
    const c = Math.cos(w.ang);
    const s = Math.sin(w.ang);
    const hw = w.w / 2;
    g.beginPath();
    g.moveTo(w.x - s * hw, w.y + c * hw);
    g.lineTo(w.x + c * len - s * hw, w.y + s * len + c * hw);
    g.lineTo(w.x + c * len + s * hw, w.y + s * len - c * hw);
    g.lineTo(w.x + s * hw, w.y - c * hw);
    g.closePath();
  }

  // ====================================================================== สถานะผิดปกติ

  /**
   * อนุภาคสถานะต่อเฟรม (มอน/ผู้เล่น): burn ไฟ+ประกายไฟ · poison ฟองพิษ · bleed หยดเลือดการ์ตูน
   * chill ไอเย็น · frozen ผลึกน้ำแข็งเกาะตัว · shock ประกายไฟฟ้า
   * x,y = กลางตัว · w,h = ขนาดตัวโดยประมาณ · rate = ตัวคูณความถี่
   */
  status(kind: 'burn' | 'poison' | 'bleed' | 'chill' | 'frozen' | 'shock', x: number, y: number, w: number, h: number, dt: number, rate = 1) {
    switch (kind) {
      case 'burn':
        if (!this.every(16 * rate, dt)) return;
        this.elemBit(x + rnd(-w, w) * 0.4, y + rnd(-h * 0.1, h * 0.4), 'fire', -Math.PI / 2, rnd(10, 25));
        return;
      case 'poison':
        if (!this.every(4 * rate, dt)) return;
        this.elemBit(x + rnd(-w, w) * 0.35, y - h * 0.2, 'poison', -Math.PI / 2, 8);
        return;
      case 'bleed': {
        if (!this.every(4 * rate, dt)) return;
        const p = this.spawn(this.world, 'fx_drop', x + rnd(-w, w) * 0.3, y, rnd(0.45, 0.6));
        if (!p) return;
        p.vx = rnd(-20, 20);
        p.vy = rnd(-50, -25);
        p.g = 300;
        p.floor = y + h * 0.5;
        p.s0 = p.s1 = 1.4;
        p.fade = 1;
        p.img.setTint(Math.random() < 0.5 ? 0xd8606f : 0xb13e53).setDepth(y + h);
        return;
      }
      case 'chill': {
        if (!this.every(4 * rate, dt)) return;
        const p = this.spawn(this.top, 'fx_dot', x + rnd(-w, w) * 0.4, y + rnd(-h, h) * 0.3, 0.5);
        if (!p) return;
        p.vy = -8;
        p.s0 = 0.6;
        p.s1 = 0.1;
        p.img.setTint(0xc8f4ff);
        return;
      }
      case 'frozen': {
        if (!this.every(9 * rate, dt)) return;
        // ผลึกเกาะรอบตัว (ไม่ขยับ โผล่แล้วหาย)
        const a = Math.random() * Math.PI * 2;
        const p = this.spawn(this.top, 'fx_shard', x + Math.cos(a) * w * 0.45, y + Math.sin(a) * h * 0.4, rnd(0.5, 0.8));
        if (!p) return;
        p.s0 = 1.1;
        p.s1 = 1.7;
        p.fade = 2;
        p.img.setRotation(a + Math.PI / 2);
        return;
      }
      case 'shock':
        if (!this.every(8 * rate, dt)) return;
        this.elemBit(x + rnd(-w, w) * 0.4, y + rnd(-h, h) * 0.4, 'bolt', 0, 0);
        return;
    }
  }

  // ====================================================================== ตาย

  /** มอนตาย: ร่างเด้งพองขาวแล้วหาย + ฝุ่นฟุ้งรอบเท้า + ดาว */
  mobDeath(m: Phaser.GameObjects.Sprite, feetY: number, color = 0x94b0c2) {
    const g = this.spawn(this.world, m.texture.key, m.x, m.y, 0.2);
    if (g) {
      g.img.setTexture(m.texture.key, m.frame.name).setFlipX(m.flipX).setDepth(m.depth).setTintFill(0xffffff);
      g.s0 = Math.abs(m.scaleX);
      g.s1 = g.s0 * 1.45;
      g.sy = 0.85;
      g.fade = 0;
    }
    const c = this.n(8) + 2;
    for (let i = 0; i < c; i++) {
      const a = (i / c) * Math.PI * 2;
      const p = this.spawn(this.world, 'fx_puff', m.x + Math.cos(a) * 3, feetY - 2, rnd(0.35, 0.5));
      if (!p) break;
      p.vx = Math.cos(a) * rnd(30, 50);
      p.vy = Math.sin(a) * rnd(10, 18) - 6;
      p.drag = 5;
      p.s0 = 0.6;
      p.s1 = 1.3;
      p.a0 = 0.85;
      p.img.setTint(color).setDepth(feetY + 1);
    }
    for (let i = 0; i < this.n(3); i++) {
      const p = this.spawn(this.top, 'fx_star', m.x, m.y - 4, rnd(0.35, 0.5));
      if (!p) break;
      p.vx = rnd(-50, 50);
      p.vy = rnd(-90, -60);
      p.g = 260;
      p.s0 = 0.7;
      p.s1 = 0.3;
      p.fade = 1;
      p.vr = rnd(-8, 8);
    }
  }

  /** ละอองแสงลอยขึ้นจากออร่าอุปกรณ์ (fx/GearAura) */
  auraMote(x: number, y: number, color: number, big = false) {
    const p = this.spawn(this.top, big ? 'fx_cross' : 'fx_spark4', x, y, rnd(0.7, 1.1));
    if (!p) return;
    p.vx = rnd(-4, 4);
    p.vy = -rnd(14, 26);
    p.s0 = big ? 1 : 0.8;
    p.s1 = 0.2;
    p.fade = 2;
    p.img.setTint(color); // ไม่ใช้ ADD → อ่านออกบนพื้นสว่างกลางวัน
  }

  /** อนุภาคหมุนวนเข้าหาจุดกลาง (ร่ายแปลงร่าง/สวมอุปกรณ์) — r = รัศมีเริ่ม · t = เวลาถึงกลาง */
  spiralIn(x: number, y: number, color: number, n: number, r: number, t: number) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) {
      const a = (i / c) * Math.PI * 2 + rnd(-0.2, 0.2);
      const life = t * rnd(0.8, 1);
      const sx = x + Math.cos(a) * r;
      const sy = y + Math.sin(a) * r * 0.6;
      const p = this.spawn(this.top, i % 3 ? 'fx_spark4' : 'fx_cross', sx, sy, life);
      if (!p) return;
      // เข้ากลาง + เฉียงไปทางสัมผัสวง → เป็นเกลียว
      p.vx = (x - sx) / life - Math.sin(a) * r * 0.9;
      p.vy = (y - sy) / life + Math.cos(a) * r * 0.5;
      p.s0 = 1.1;
      p.s1 = 0.3;
      p.fade = 2;
      p.img.setTint(i % 2 ? color : 0xffffff);
    }
  }

  /** ประกายตกโปรยรอบตัว (หลังแปลงร่าง) */
  fallSparkles(x: number, y: number, color: number, n: number, spread = 22) {
    const c = this.n(n);
    for (let i = 0; i < c; i++) {
      const p = this.spawn(this.top, i % 2 ? 'fx_cross' : 'fx_spark4', x + rnd(-spread, spread), y - rnd(14, 30), rnd(0.7, 1.1));
      if (!p) return;
      p.vx = rnd(-8, 8);
      p.vy = rnd(-20, 5);
      p.g = 40;
      p.s0 = rnd(0.7, 1.1);
      p.s1 = 0.2;
      p.fade = 1;
      p.flick = true;
      p.img.setTint(i % 3 ? color : 0xffffff);
    }
  }

  /** แสงวาบรูปดาวตรงจุด (ขยายตามขนาด) */
  burst(x: number, y: number, size: number) {
    const f = this.spawn(this.top, 'fx_muzzle', x, y, 0.22);
    if (!f) return;
    f.s0 = size;
    f.s1 = size * 0.3;
    f.vr = 3;
    f.img.setBlendMode(Phaser.BlendModes.ADD);
  }

  /** ภาพติดตาตอนวิ่ง (ผ้าคลุม/ออร่าระดับสูง) — สำเนาเฟรมปัจจุบันสีอ่อนแล้วจาง */
  afterImage(src: Phaser.GameObjects.Sprite, color: number) {
    const p = this.spawn(this.world, src.texture.key, src.x, src.y, 0.28);
    if (!p) return;
    p.img.setTexture(src.texture.key, src.frame.name).setFlipX(src.flipX).setDepth(src.depth - 0.05).setTint(color);
    p.s0 = p.s1 = Math.abs(src.scaleX);
    p.sy = Math.abs(src.scaleY) / p.s0;
    p.a0 = 0.35;
  }

  /** ล้มบอส/สัตว์ในตำนาน: คลื่นกระแทกใหญ่ + ภาพช้า 0.4 วิ + เหรียญทองพุ่ง + จอวาบ (≤ 0.25) */
  bossDeath(x: number, y: number) {
    this.ring(x, y + 4, 0xffffff, 90, 4, 0.55, 0.6);
    this.ring(x, y + 4, 0xffcd75, 64, 3, 0.45, 0.6);
    this.ring(x, y, 0xffe9a0, 36, 2, 0.35);
    this.slowMo(0.4, 0.3);
    this.flash(0xfff2b0, 0.22, 0.25);
    const c = this.n(22) + 4;
    for (let i = 0; i < c; i++) {
      const p = this.spawn(this.top, 'fx_coin', x, y - 4, rnd(0.9, 1.3));
      if (!p) break;
      const a = rnd(-Math.PI, 0);
      const sp = rnd(60, 130);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 60;
      p.g = 380;
      p.floor = y + rnd(4, 16);
      p.s0 = p.s1 = rnd(0.8, 1.1);
      p.fade = 1;
    }
    for (let i = 0; i < this.n(10); i++) this.starPop(x + rnd(-24, 24), y + rnd(-24, 12), 0xffe9a0, rnd(0.6, 1.1));
  }

  // ====================================================================== จอ (วาบ / ขอบแดง)

  /** ขอบจอแดงตอนผู้เล่นโดนตี — frac = ดาเมจ ÷ HP สูงสุด */
  hurtFlash(frac: number) {
    const a = Phaser.Math.Clamp(0.5 + frac * 3, 0.5, 0.9) * (reducedMotion() ? 0.5 : 1);
    this.vigA = Math.max(this.vigT > 0 ? this.vigA * (this.vigT / 0.5) : 0, a);
    this.vigT = 0.5;
  }

  /** จอวาบอ่อนๆ (ปิดเมื่อผู้ใช้ขอลดการเคลื่อนไหว) */
  flash(color: number, alpha: number, dur: number) {
    if (reducedMotion()) return;
    this.flashImg.setTint(color);
    this.flashA = Math.min(0.25, alpha);
    this.flashT = this.flashMax = dur;
  }

  private stepOverlay(dt: number) {
    if (this.vigT <= 0 && this.flashT <= 0) return;
    const cam = this.scene.cameras.main;
    const cw = cam.width / cam.zoom;
    const ch = cam.height / cam.zoom;
    if (this.vigT > 0) {
      this.vigT -= dt;
      const k = Math.max(0, this.vigT / 0.5);
      this.vignette.setVisible(this.vigT > 0).setPosition(cam.width / 2, cam.height / 2).setDisplaySize(cw * 1.04, ch * 1.04).setAlpha(this.vigA * k ** 1.4);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashImg.setVisible(this.flashT > 0).setPosition(cam.width / 2, cam.height / 2).setDisplaySize(cw * 1.1, ch * 1.1)
        .setAlpha(this.flashA * Math.max(0, this.flashT / this.flashMax));
    }
  }
}
