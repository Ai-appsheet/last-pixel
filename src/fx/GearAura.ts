import Phaser from 'phaser';
import { quality, qualityKnobs } from '../core/Quality';
import { ITEMS, type ItemDef } from '../data/items';
import type { Rarity } from '../data/loot';
import type { RivalInfo } from '../data/rivals';
import { levelOfSlot } from '../data/upgrade';
import type { Equipment } from '../entities/Player';
import { buildAuraTextures } from '../gfx/art/fx';
import { itemEl, reducedMotion, type CombatFx, type FxEl } from './CombatFx';

/**
 * ออร่าจากอุปกรณ์และชุดแฟชั่น — ระดับคิดจากความหายาก + เลเวลอัพเกรดของของที่สวม (+ ครบชุดเทพ)
 *   1 หายาก   = แสงนุ่มใต้เท้า
 *   2 มหากาพย์ = แสง + ละอองแสงลอยขึ้นช้าๆ + อาวุธเรืองสีธาตุ + ผ้าคลุมทิ้งภาพติดตาตอนวิ่ง
 *   3 เทพ     = + วงเวทรูนหมุนใต้เท้า + ละอองถี่ขึ้น
 *   4 ตำนาน   = + วงซ้อนหมุนสวนทาง + ลูกแก้วแสงโคจร 3 ดวง + เสาแสงพุ่งทุก 4 วิ
 *              (อาวุธเทพ Lv10 · เกราะเทพครบ 4 ชิ้น · หรือคะแนนสูงมาก)
 * สีตามธาตุอาวุธ (ไฟส้ม น้ำแข็งฟ้า สายฟ้าเหลือง-ม่วง พิษเขียว ศักดิ์สิทธิ์ทอง มืดม่วง น้ำน้ำเงิน ลมเขียวมิ้นต์)
 * ไม่มีธาตุ = สีความหายาก · สีรอง (ละออง/ลูกแก้ว/ภาพติดตา) จากชุดแฟชั่นที่หายากสุด
 * คุณภาพ: ต่ำ = แสงนิ่งอย่างเดียว · กลาง = ไม่มีละออง/เสาแสง/ภาพติดตา/อาวุธเรือง · ลดการเคลื่อนไหว = ไม่หมุน ไม่กะพริบ
 */

export type AuraTier = 0 | 1 | 2 | 3 | 4;
export interface AuraInfo {
  tier: AuraTier;
  color: number;
  color2: number;
  /** มีผ้าคลุม (ทิ้งภาพติดตาตอนวิ่ง) */
  cape: boolean;
}

const NONE: AuraInfo = { tier: 0, color: 0xffffff, color2: 0xffffff, cape: false };
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const RARITY_AURA: Record<number, number> = { 2: 0x5fb4ff, 3: 0xb58cff, 4: 0xffd76a };
const EL_AURA: Partial<Record<FxEl, [number, number]>> = {
  fire: [0xff8a3d, 0xffd76a], ice: [0x73eff7, 0xe0fbff], bolt: [0xfff07a, 0xb58cff], poison: [0x7cf07a, 0xd8ffa0],
  holy: [0xffd76a, 0xfff6d0], dark: [0xa66bff, 0x5d275d], water: [0x4aa8ff, 0xa8e8ff], wind: [0x9ff5d0, 0xe8fff6],
  earth: [0xd9a066, 0xffe0a0], arcane: [0xc58cff, 0xf0d0ff], blood: [0xff5a6e, 0xffb0b8],
};
const lvBonus = (lv: number) => (lv >= 10 ? 1.5 : lv >= 7 ? 1 : lv >= 4 ? 0.5 : 0);
const rankOf = (def?: ItemDef) => RANK[def?.rarity ?? 'common'] ?? 0;

function tierOf(score: number, mythic: boolean): AuraTier {
  if (mythic || score >= 5.5) return 4;
  return score >= 4 ? 3 : score >= 3 ? 2 : score >= 2 ? 1 : 0;
}

function colorsFor(weapon: ItemDef | undefined, bestRank: number, cosRank: number, cosColor: number): [number, number] {
  const el = itemEl(weapon);
  const pair = el !== 'phys' && el !== 'bullet' ? EL_AURA[el] : undefined;
  const base = pair?.[0] ?? RARITY_AURA[Math.min(4, Math.max(2, Math.floor(bestRank)))];
  return [base, cosRank >= 2 ? cosColor : pair?.[1] ?? 0xffffff];
}

/** สีหลักของไอเทมชิ้นเดียว (ธาตุ > ความหายาก) — ใช้กับเอฟเฟกต์ตอนสวม */
export function itemAuraColor(def?: ItemDef): number {
  return colorsFor(def, Math.max(2, rankOf(def)), 0, 0xffffff)[0];
}

/** ออร่าของผู้เล่นจากอุปกรณ์ที่สวม + ชุดแฟชั่น */
export function auraOf(p: { equip: Equipment; cosmetic: { outfit?: string; helmet?: string; cape?: string } }): AuraInfo {
  let best = 0;
  let epicCount = 0;
  let legendArmor = 0;
  let mythic = false;
  for (const [slot, s] of Object.entries(p.equip)) {
    if (!s) continue;
    const def = ITEMS[s.id];
    const r = rankOf(def);
    const lv = levelOfSlot(s);
    best = Math.max(best, r + lvBonus(lv));
    if (r >= 3) epicCount++;
    if (r === 4 && (slot === 'head' || slot === 'body' || slot === 'legs' || slot === 'feet')) legendArmor++;
    if (slot === 'weapon' && r === 4 && lv >= 10) mythic = true;
  }
  // ชุดแฟชั่นช่วยได้ (น้อยกว่าของจริงครึ่งขั้น) + ให้สีรอง
  let cosRank = 0;
  let cosColor = 0xffffff;
  for (const slot of ['outfit', 'helmet', 'cape'] as const) {
    const id = p.cosmetic[slot];
    if (!id) continue;
    const r = rankOf(ITEMS[`cos_${slot}_${id}`]);
    best = Math.max(best, r - 0.5);
    if (r > cosRank) {
      cosRank = r;
      cosColor = RARITY_AURA[Math.max(2, r)] ?? 0xffffff;
    }
  }
  if (epicCount >= 3) best += 0.5;
  const tier = tierOf(best, mythic || legendArmor >= 4);
  if (!tier) return NONE;
  const w = p.equip.weapon ? ITEMS[p.equip.weapon.id] : undefined;
  const [color, color2] = colorsFor(w, best, cosRank, cosColor);
  return { tier, color, color2, cape: !!(p.cosmetic.cape || p.equip.back) };
}

/** ออร่าของผู้รอดชีวิตคู่แข่ง (มีแค่อาวุธ + ขั้นอาวุธ 0..3) */
export function rivalAura(info: RivalInfo): AuraInfo {
  const w = ITEMS[info.weapon];
  const tier = tierOf(rankOf(w) + info.tier * 0.5, false);
  if (!tier) return NONE;
  const [color, color2] = colorsFor(w, rankOf(w), 0, 0xffffff);
  return { tier, color, color2, cape: !!info.look.cape };
}

const auraKey = (a: AuraInfo) => a.tier * 1e8 + a.color + (a.cape ? 0.5 : 0) + a.color2 / 1e9;

/** ชิ้นภาพของออร่า (ใช้ทั้งในโลกและภาพตัวอย่างในหน้าต่าง) */
class AuraParts {
  glow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Container;
  c1: Phaser.GameObjects.Image;
  c2: Phaser.GameObjects.Image;
  orbs: Phaser.GameObjects.Image[] = [];
  t = Math.random() * 10;

  constructor(scene: Phaser.Scene) {
    buildAuraTextures(scene);
    // แสงใต้เท้าแบบผสมปกติ (ADD จางหายบนหญ้าตอนกลางวัน)
    this.glow = scene.add.image(0, 0, 'aura_glow').setVisible(false);
    this.c1 = scene.add.image(0, 0, 'aura_circle').setScale(0.5);
    this.c2 = scene.add.image(0, 0, 'aura_circle2').setScale(0.5);
    // วงเวทแบนบนพื้น: หมุนตัววงใน container ที่บีบแกน y → หมุนบนพื้นจริง ไม่ใช่วงรีหมุน
    this.ring = scene.add.container(0, 0, [this.c1, this.c2]).setScale(1, 0.5).setVisible(false);
    for (let i = 0; i < 3; i++) this.orbs.push(scene.add.image(0, 0, 'fx_cross').setVisible(false));
  }

  /** ตั้งหน้าตาตามระดับ (เรียกเมื่อออร่าเปลี่ยน) */
  apply(a: AuraInfo, low: boolean) {
    this.glow.setVisible(a.tier >= 1).setTint(a.color);
    this.ring.setVisible(a.tier >= 3 && !low);
    this.c1.setTint(a.color);
    this.c2.setVisible(a.tier >= 4).setTint(a.color2);
    for (const o of this.orbs) o.setVisible(a.tier >= 4 && !low).setTint(a.color2);
  }

  /** ขยับทุกเฟรม · s = ตัวคูณขนาด (โลก = 1) · still = ไม่หมุนไม่กะพริบ */
  step(dt: number, a: AuraInfo, x: number, y: number, s: number, still: boolean) {
    this.t += still ? 0 : dt;
    const pulse = still ? 1 : 1 + 0.12 * Math.sin(this.t * 2.2);
    const gw = (28 + a.tier * 3) * s;
    this.glow.setPosition(x, y).setDisplaySize(gw * pulse, gw * 0.5 * pulse).setAlpha(0.6 + a.tier * 0.07);
    if (this.ring.visible) {
      this.ring.setPosition(x, y).setScale(s, s * 0.5);
      this.c1.rotation = this.t * 0.6;
      this.c2.rotation = -this.t * 1.1;
      this.c1.setAlpha(0.85 + 0.15 * Math.sin(this.t * 3));
      this.c2.setAlpha(0.9);
    }
    if (this.orbs[0].visible) {
      for (let i = 0; i < 3; i++) {
        const ang = this.t * 1.8 + (i * Math.PI * 2) / 3;
        this.orbs[i].setPosition(x + Math.cos(ang) * 12 * s, y - (8 + Math.sin(this.t * 3 + i) * 1.5) * s + Math.sin(ang) * 3.5 * s).setScale(s * (0.9 + 0.25 * Math.sin(ang)));
      }
    }
  }

  all(): Phaser.GameObjects.GameObject[] {
    return [this.glow, this.ring, ...this.orbs];
  }

  destroy() {
    for (const o of this.all()) o.destroy();
  }
}

/** ตัวที่มีออร่า (ผู้เล่น / คู่แข่ง) */
type AuraTarget = Phaser.GameObjects.Sprite & { feetY?: number; riding?: boolean; dead?: boolean; body?: Phaser.Physics.Arcade.Body | null };

/** ออร่าในโลกติดตัวละคร — ดูแลตัวเองผ่าน postupdate · ทำลายตัวเองเมื่อเป้าหายไป */
export class GearAura {
  private parts: AuraParts;
  private pillar: Phaser.GameObjects.Image;
  private info: AuraInfo = NONE;
  private key = -1;
  private infoT = 0;
  private moteT = 0;
  private pillarT = 2;
  private pillarLife = 0;
  private ghostT = 0;
  private lvl: 'high' | 'medium' | 'low' = 'high';
  private wGlow: Phaser.FX.Glow | null = null;
  private wGlowOn: Phaser.GameObjects.Image | null = null;
  private onPost = (_t: number, delta: number) => this.update(Math.min(delta / 1000, 0.1));

  constructor(
    private scene: Phaser.Scene,
    private target: AuraTarget,
    private getInfo: () => AuraInfo,
    private opts: { fx?: CombatFx; weapon?: () => Phaser.GameObjects.Image | null } = {},
  ) {
    this.parts = new AuraParts(scene);
    this.pillar = scene.add.image(0, 0, 'aura_pillar').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    scene.events.on('postupdate', this.onPost);
    target.once('destroy', () => this.destroy());
    scene.events.once('shutdown', () => this.destroy());
  }

  private refresh() {
    this.lvl = quality();
    const a = this.getInfo();
    const k = auraKey(a) + (this.lvl === 'low' ? 0.25 : this.lvl === 'medium' ? 0.125 : 0);
    if (k === this.key) return;
    this.key = k;
    this.info = a;
    this.parts.apply(a, this.lvl === 'low');
  }

  private update(dt: number) {
    if (!this.target.active) return;
    if ((this.infoT -= dt) <= 0) {
      this.infoT = 0.5;
      this.refresh();
    }
    const a = this.info;
    const t = this.target;
    const hidden = !a.tier || !t.visible || !!t.riding || !!t.dead;
    const p = this.parts;
    if (hidden) {
      p.glow.setVisible(false);
      p.ring.setVisible(false);
      for (const o of p.orbs) o.setVisible(false);
      this.pillar.setVisible(false);
      this.weaponGlow(false);
      if (a.tier) this.key = -1; // กลับมาแสดงแล้วตั้งค่าใหม่
      return;
    }
    if (!p.glow.visible) p.apply(a, this.lvl === 'low');
    const still = reducedMotion();
    const x = t.x;
    const fy = t.feetY ?? t.y + t.displayHeight * (1 - t.originY) - 1;
    p.step(dt, a, x, fy, 1, still || this.lvl === 'low');
    // ใต้ตัวละคร: วงแสง/วงเวทอยู่หลังตัว · ลูกแก้ววนหน้า-หลัง
    p.glow.setDepth(t.depth - 0.3);
    p.ring.setDepth(t.depth - 0.25);
    for (let i = 0; i < 3; i++) p.orbs[i].setDepth(Math.sin(p.t * 1.8 + (i * Math.PI * 2) / 3) > 0 ? t.depth + 0.2 : t.depth - 0.2);
    const high = this.lvl === 'high';
    const fx = this.opts.fx;
    // ละอองแสงลอยขึ้น
    if (high && fx && a.tier >= 2 && (this.moteT -= dt) <= 0) {
      this.moteT = a.tier >= 3 ? 0.14 : 0.28;
      fx.auraMote(x + (Math.random() - 0.5) * 14, fy - Math.random() * 4, Math.random() < 0.5 ? a.color : a.color2, a.tier >= 3 && Math.random() < 0.3);
    }
    // เสาแสงพุ่ง (ตำนาน)
    if (high && !still && a.tier >= 4 && (this.pillarT -= dt) <= 0) {
      this.pillarT = 4;
      this.pillarLife = 0.6;
      this.pillar.setTint(a.color).setVisible(true);
    }
    if (this.pillarLife > 0) {
      this.pillarLife -= dt;
      const k = 1 - Math.max(0, this.pillarLife) / 0.6;
      this.pillar.setPosition(x, fy).setDisplaySize(14 * (1 - k * 0.5), 46 * Math.min(1, k * 4)).setAlpha(0.55 * (1 - k)).setDepth(t.depth - 0.2);
      if (this.pillarLife <= 0) this.pillar.setVisible(false);
    }
    // ผ้าคลุม: ภาพติดตาตอนวิ่ง
    const v = t.body?.velocity;
    if (high && !still && fx && a.cape && a.tier >= 2 && v && v.x * v.x + v.y * v.y > 2500 && (this.ghostT -= dt) <= 0) {
      this.ghostT = 0.07;
      fx.afterImage(t, a.color2);
    }
    this.weaponGlow(a.tier >= 2 && qualityKnobs(this.lvl).glow);
  }

  /** อาวุธในมือเรืองสีธาตุ (คุณภาพสูง · preFX) */
  private weaponGlow(on: boolean) {
    const img = on ? this.opts.weapon?.() ?? null : null;
    if (this.wGlowOn && (this.wGlowOn !== img || !on)) {
      try {
        if (this.wGlowOn.active && this.wGlow) this.wGlowOn.preFX?.remove(this.wGlow);
      } catch {
        /* ignore */
      }
      this.wGlow = null;
      this.wGlowOn = null;
    }
    if (!img || !img.visible) return;
    if (!this.wGlow) {
      try {
        const fx = img.preFX;
        if (!fx) return;
        fx.setPadding(2);
        this.wGlow = fx.addGlow(this.info.color, 2, 0, false, 0.1, 6);
        this.wGlowOn = img;
      } catch {
        this.wGlow = null;
      }
    } else if (this.wGlow.color !== this.info.color) this.wGlow.color = this.info.color;
    if (this.wGlow && !reducedMotion()) this.wGlow.outerStrength = 1.5 + Math.sin(this.parts.t * 4) * 0.7; // ประกายวิบวับ
  }

  destroy() {
    this.scene.events.off('postupdate', this.onPost);
    this.weaponGlow(false);
    this.parts.destroy();
    this.pillar.destroy();
  }
}

/**
 * ภาพตัวอย่างออร่าในหน้าต่าง (กระเป๋า/ตู้เสื้อผ้า) — คืน container วางไว้ "หลัง" รูปตัวละคร
 * x,y = จุดเท้า · scale = ขนาดพิกเซลของรูปตัวละคร (ต่อ 1 พิกเซลโลก) · provider อ่านออร่าล่าสุดทุก 0.5 วิ
 */
export function drawAuraPreview(scene: Phaser.Scene, x: number, y: number, scale: number, provider: () => AuraInfo): Phaser.GameObjects.Container {
  const parts = new AuraParts(scene);
  const c = scene.add.container(x, y, parts.all());
  let key = -1;
  let tick = 0;
  let info = NONE;
  const onUpdate = (_t: number, delta: number) => {
    if (!c.active || !c.visible) return;
    const dt = Math.min(delta / 1000, 0.1);
    if ((tick -= dt) <= 0) {
      tick = 0.5;
      info = provider();
      const k = auraKey(info);
      if (k !== key) {
        key = k;
        parts.apply(info, false);
      }
    }
    if (info.tier) parts.step(dt, info, 0, 0, scale, reducedMotion());
  };
  scene.events.on('update', onUpdate);
  c.once('destroy', () => scene.events.off('update', onUpdate));
  return c;
}
