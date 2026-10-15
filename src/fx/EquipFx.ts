import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { quality } from '../core/Quality';
import { ITEMS, type ItemDef } from '../data/items';
import { RARITY, type Rarity } from '../data/loot';
import { buildAuraTextures, buildFxTextures } from '../gfx/art/fx';
import { lookKey } from '../gfx/UpgradeLook';
import type { GameScene } from '../scenes/GameScene';
import { txt } from '../ui/widgets';
import { reducedMotion } from './CombatFx';
import { itemAuraColor } from './GearAura';

/**
 * เอฟเฟกต์ตอนสวมอุปกรณ์/ชุดแฟชั่น/อาวุธ (แปลงร่าง) — ใหญ่ขึ้นตามความหายาก + เลเวล
 *   0 ธรรมดา   = ประกายเล็ก
 *   1 หายาก    = วงแสง + ประกาย
 *   2 มหากาพย์ = + เสาแสง + อนุภาคหมุนวนเข้าตัว + ตัวเรืองขาว
 *   3 เทพ / 4 ตำนาน (เทพ Lv10) = แปลงร่างเต็ม: ภาพช้า 0.15 วิ · วงรูนขยาย · แสงวาบเผยลุคใหม่ · คลื่นกระแทก · ประกายโปรย · กล้องซูมกระตุก
 * ลุคใหม่ (texture) เปลี่ยนตรงจังหวะแสงวาบพอดี (reveal callback) — ค่าพลังเปลี่ยนทันทีตามปกติ
 * อาวุธ: ลอยเหนือหัว แวววับ หมุนหนึ่งรอบแล้วลงมือ + ชื่อสีความหายาก "⚔ ชื่อ ★5"
 * สวมหลายชิ้นติดกัน = รวมเป็นเอฟเฟกต์เดียว · ไม่บล็อกการกด · ลดการเคลื่อนไหว = แสงนุ่ม + ชื่อ · คุณภาพต่ำ = เล็กสุด
 */

const RANK: Record<Rarity, number> = { common: 0, uncommon: 0.5, rare: 1, epic: 2, legendary: 3 };
const STARS: Record<Rarity, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
const FLASH_AT = [0.2, 0.32, 0.5, 0.62, 0.72];
const TOTAL = [0.7, 1.0, 1.2, 1.45, 1.6];

export class EquipFx {
  /** หน้าต่างกระเป๋าตั้งไว้ → เล่นประกายรอบรูปตัวละครด้วย */
  preview: ((rarity: Rarity, color: number) => void) | null = null;
  private active = false;
  private flashed = false;
  private t = 0;
  private tier = 0;
  private color = 0xffffff;
  private reveals: (() => void)[] = [];
  private pillar: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Container;
  private rune: Phaser.GameObjects.Image;
  private weapon: Phaser.GameObjects.Image;
  private weaponOn = false;
  private weaponT = 0;
  private texts = 0;
  private zoomBase = 0;
  private zoomT = 0;
  private onPost = (_t: number, delta: number) => this.tick(Math.min(delta / 1000, 0.1));

  constructor(private s: GameScene) {
    buildFxTextures(s);
    buildAuraTextures(s);
    this.pillar = s.add.image(0, 0, 'aura_pillar').setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.rune = s.add.image(0, 0, 'aura_circle').setScale(0.5);
    this.ring = s.add.container(0, 0, [this.rune]).setVisible(false);
    this.weapon = s.add.image(0, 0, 'px').setVisible(false).setDepth(1e6 + 7);
    s.events.on('postupdate', this.onPost);
    s.events.once('shutdown', () => {
      s.events.off('postupdate', this.onPost);
      this.finish(); // ลุคต้องเปลี่ยนเสมอแม้ซีนปิดกลางเอฟเฟกต์
    });
  }

  /** สวมอุปกรณ์/อาวุธ — reveal = เปลี่ยนลุคตอนแสงวาบ */
  play(itemId: string, lv = 1, reveal?: () => void) {
    const def = ITEMS[itemId];
    if (!def) return reveal?.();
    const weapon = def.type === 'weapon' || def.type === 'ranged' || def.type === 'tool';
    this.start(def, lv, reveal, weapon);
  }

  /** สวมชุดแฟชั่นจากตู้เสื้อผ้า/กล่อง (id ว่าง = ถอด → เปลี่ยนเลยไม่มีเอฟเฟกต์) */
  playCosmetic(slot: 'outfit' | 'helmet' | 'cape', id: string | undefined, reveal?: () => void) {
    const def = id && id !== 'none' ? ITEMS[`cos_${slot}_${id}`] : undefined;
    if (!def) return reveal?.();
    this.start(def, 1, reveal, false);
  }

  private start(def: ItemDef, lv: number, reveal: (() => void) | undefined, isWeapon: boolean) {
    const rar = def.rarity ?? 'common';
    const tier = Math.min(4, Math.floor(RANK[rar] + (lv >= 10 ? 1 : lv >= 7 ? 0.5 : 0)));
    const color = itemAuraColor(def);
    this.preview?.(rar, color);
    const p = this.s.player;
    this.nameTag(def, lv, isWeapon);
    // ลดการเคลื่อนไหว / คุณภาพต่ำ: แสงนุ่มใต้เท้า + ประกายเล็ก แล้วเปลี่ยนลุคทันที
    if (reducedMotion() || quality() === 'low') {
      reveal?.();
      this.s.fx.ring(p.x, p.feetY, color, 14, 1.5, 0.4, 0.6);
      if (!reducedMotion()) this.s.fx.sparks(p.x, p.y - 4, color, 4, 12);
      return;
    }
    // กำลังร่ายอยู่ (ยังไม่วาบ) → รวมเป็นครั้งเดียว ใช้ระดับสูงสุด
    if (this.active && !this.flashed) {
      if (reveal) this.reveals.push(reveal);
      if (tier > this.tier) {
        this.tier = tier;
        this.color = color;
      }
      if (isWeapon) this.showWeapon(def, lv);
      return;
    }
    // วาบไปแล้ว → เปลี่ยนเลย + ประกายเสริมเล็กๆ
    if (this.active) {
      reveal?.();
      this.s.fx.fallSparkles(p.x, p.y, color, 6);
      return;
    }
    this.active = true;
    this.flashed = false;
    this.t = 0;
    this.tier = tier;
    this.color = color;
    if (reveal) this.reveals.push(reveal);
    if (tier >= 3) this.s.fx.slowMo(0.15, 0.5);
    if (tier >= 2) p.setTintFill(0xffffff);
    const fl = FLASH_AT[tier];
    this.s.fx.spiralIn(p.x, p.y - 4, color, 6 + tier * 5, 22 + tier * 5, fl);
    this.pillar.setVisible(tier >= 2).setTint(color);
    this.ring.setVisible(tier >= 1);
    this.rune.setTint(color);
    if (isWeapon) this.showWeapon(def, lv);
  }

  /** อาวุธลอยเหนือหัว */
  private showWeapon(def: ItemDef, lv: number) {
    const key = def.enhanceable ? lookKey(this.s, def.icon, lv) : def.icon;
    this.weapon.setTexture(this.s.textures.exists(key) ? key : def.icon).setVisible(true).setRotation(0).setAlpha(1);
    this.weaponOn = true;
    this.weaponT = 0;
  }

  /** ชื่อของ + ดาวตามความหายาก ลอยขึ้นแล้วจาง */
  private nameTag(def: ItemDef, lv: number, isWeapon: boolean) {
    const p = this.s.player;
    const rar = def.rarity ?? 'common';
    const label = `${isWeapon ? '⚔' : '✦'} ${def.name}${lv > 1 ? ` Lv.${lv}` : ''} ${'★'.repeat(STARS[rar])}`;
    const t = txt(this.s, p.x, p.y - 36 - (this.texts % 3) * 8, label, 6, RARITY[rar].color, { fontStyle: '600' })
      .setOrigin(0.5, 1).setStroke('#0b0d1f', 2).setResolution(8).setScale(0.5).setDepth(1e6 + 8).setAlpha(0); // ตัวเล็กเหนือหัว
    this.texts++;
    this.s.tweens.add({ targets: t, alpha: 1, y: t.y - 4, duration: 180, ease: 'Quad.easeOut' });
    this.s.tweens.add({ targets: t, alpha: 0, y: t.y - 12, delay: 1300, duration: 400, onComplete: () => {
      t.destroy();
      this.texts = Math.max(0, this.texts - 1);
    } });
  }

  private tick(dt: number) {
    const p = this.s.player;
    if (this.zoomT > 0) {
      // กล้องกระตุกซูมเข้า-ออก (เทพขึ้นไป)
      this.zoomT = Math.max(0, this.zoomT - dt);
      const k = 1 - this.zoomT / 0.35;
      this.s.cameras.main.setZoom(this.zoomBase * (1 + 0.07 * Math.sin(Math.PI * k)));
      if (this.zoomT <= 0) this.s.cameras.main.setZoom(this.zoomBase);
    }
    if (this.weaponOn) this.stepWeapon(dt);
    if (!this.active) return;
    this.t += dt;
    const tier = this.tier;
    const fl = FLASH_AT[tier];
    const x = p.x;
    const fy = p.feetY;
    // วงรูนขยายพร้อมหมุน (แบนบนพื้น)
    const kr = Math.min(1, this.t / fl);
    const fade = this.flashed ? Math.max(0, 1 - (this.t - fl) / 0.4) : 1;
    this.ring.setPosition(x, fy).setScale(0.4 + kr * (0.8 + tier * 0.15), (0.4 + kr * (0.8 + tier * 0.15)) * 0.5).setDepth(p.depth - 0.2).setAlpha(fade);
    this.rune.rotation += dt * (2 + tier);
    // เสาแสง: โตขึ้นก่อนวาบ หดจางหลังวาบ
    if (this.pillar.visible) {
      const h = (36 + tier * 8) * (this.flashed ? 1 : kr);
      this.pillar.setPosition(x, fy).setDisplaySize((10 + tier * 2) * (this.flashed ? fade : 0.6 + 0.4 * kr), Math.max(1, h)).setAlpha(0.75 * fade).setDepth(p.depth + 0.1);
    }
    if (!this.flashed && tier >= 2) p.setAlpha(0.75 + 0.25 * Math.sin(this.t * 40)); // ตัวเรืองขาวสั่นๆ
    if (!this.flashed && this.t >= fl) this.flash();
    if (this.t >= TOTAL[tier]) this.finish();
  }

  /** จังหวะแสงวาบ: เปลี่ยนลุคตอนนี้พอดี */
  private flash() {
    const p = this.s.player;
    const fx = this.s.fx;
    const tier = this.tier;
    this.flashed = true;
    this.runReveals();
    p.clearTint();
    p.setAlpha(1);
    fx.burst(p.x, p.y - 4, 1.4 + tier * 0.6);
    fx.ring(p.x, p.feetY, this.color, 22 + tier * 10, 2 + tier * 0.5, 0.45, 0.6);
    if (tier >= 1) fx.ring(p.x, p.y - 4, 0xffffff, 12 + tier * 5, 1.5, 0.3);
    fx.fallSparkles(p.x, p.y, this.color, 6 + tier * 6);
    if (tier >= 3) {
      fx.flash(this.color, 0.18, 0.3);
      this.zoomBase = this.zoomT > 0 ? this.zoomBase : this.s.cameras.main.zoom;
      this.zoomT = reducedMotion() ? 0 : 0.35;
      Sfx.play('levelUp', 300);
    } else if (tier >= 2) Sfx.play('achievement', 300);
  }

  private runReveals() {
    const list = this.reveals;
    this.reveals = [];
    for (const f of list) f();
  }

  private finish() {
    this.runReveals();
    if (this.active && !this.flashed && this.s.player?.active) this.s.player.clearTint();
    this.active = false;
    this.ring.setVisible(false);
    this.pillar.setVisible(false);
    if (this.s.player?.active) this.s.player.setAlpha(1);
  }

  /** อาวุธ: ลอยขึ้นเหนือหัว (แวววับ) → หมุนหนึ่งรอบ → ลงมือ */
  private stepWeapon(dt: number) {
    const p = this.s.player;
    this.weaponT += dt;
    const t = this.weaponT;
    const up = 0.45;
    const fall = 0.35;
    const topY = p.y - 26;
    if (t < up) {
      const k = Math.min(1, t / 0.18);
      this.weapon.setPosition(p.x, topY + (1 - k) * 10).setScale(1.2 + 0.4 * (1 - k)).setRotation(Math.sin(t * 12) * 0.08);
      if (t > 0.2 && Math.random() < dt * 18) this.s.fx.sparks(p.x + 3, topY - 4, 0xffffff, 1, 8);
    } else if (t < up + fall) {
      const k = (t - up) / fall;
      const h = p.heldSprite;
      const hx = h.visible ? h.x : p.x + 4;
      const hy = h.visible ? h.y - 4 : p.y + 2;
      this.weapon.setPosition(p.x + (hx - p.x) * k, topY + (hy - topY) * k * k).setRotation(Math.PI * 2 * k).setScale(1.2 - 0.5 * k);
    } else {
      this.weapon.setVisible(false);
      this.weaponOn = false;
      this.s.fx.sparks(p.heldSprite.x, p.heldSprite.y - 2, 0xffffff, 3, 10);
    }
  }
}

/**
 * ประกายรอบรูปตัวละครในหน้าต่าง (กระเป๋า/ตู้เสื้อผ้า/รูปใหญ่) — แสงพุ่ง + ประกาย + กรอบสีความหายากวาบ
 * parent = container ของหน้าต่าง (พิกัด x,y เป็นพิกัดใน parent) · size = ขนาดกรอบโดยประมาณ (px)
 */
export function playEquipFlourish(
  scene: Phaser.Scene, x: number, y: number, rarity: Rarity, color: number,
  parent?: { add(o: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[]): unknown }, size = 150,
) {
  buildFxTextures(scene);
  buildAuraTextures(scene);
  const rc = RARITY[rarity].hex;
  const objs: Phaser.GameObjects.GameObject[] = [];
  const glow = scene.add.image(x, y, 'aura_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(size * 0.6, size * 0.6).setAlpha(1);
  objs.push(glow);
  scene.tweens.add({ targets: glow, displayWidth: size * 1.4, displayHeight: size * 1.4, alpha: 0, duration: 520, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
  const frame = scene.add.graphics();
  frame.lineStyle(4, rc, 1).strokeRect(x - size / 2, y - size * 0.6, size, size * 1.2);
  objs.push(frame);
  scene.tweens.add({ targets: frame, alpha: { from: 1, to: 0 }, duration: 260, yoyo: true, repeat: 1, onComplete: () => frame.destroy() });
  if (!reducedMotion()) {
    const n = rarity === 'legendary' ? 14 : rarity === 'epic' ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = scene.add.image(x, y, i % 2 ? 'fx_cross' : 'fx_spark4').setTint(i % 3 ? color : 0xffffff).setScale(4);
      objs.push(sp);
      scene.tweens.add({
        targets: sp, x: x + Math.cos(a) * size * 0.55, y: y + Math.sin(a) * size * 0.6, scale: 0.5, alpha: 0,
        duration: 500 + Math.random() * 300, ease: 'Cubic.easeOut', onComplete: () => sp.destroy(),
      });
    }
  }
  parent?.add(objs);
}
