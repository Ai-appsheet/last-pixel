import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { ITEMS } from '../data/items';
import { EventBus } from '../core/EventBus';
import { BOXES, RARITY, rollBox, type BoxTier, type Rarity } from '../data/loot';
import { placeArtCover, withItemArt } from '../ui/itemArt';
import { button, txt } from '../ui/widgets';

/**
 * 🎉 เอฟเฟกต์ฉลองการได้ของ — ไล่ 3 ขั้นตามความหายาก (ตัวหนังสือยังเล็ก-บางเสมอ)
 *  0 ธรรมดา/ดี/กล่องไม้-เหล็ก → ประกายดาวเล็กตรงข้อความได้ของ (+เสียงเก็บของ)
 *  1 หายาก/กล่องทอง          → แสงพุ่ง + ดาวกระจาย + คอนเฟตติ + จอวาบเบาๆ + ป้ายชื่อของเล็กๆ
 *  2 มหากาพย์/เทพ/กล่องเพชร   → ฉากมืดลง + รัศมีทองหมุน + การ์ดไอเทมเด้งกลางจอ + จอสั่นเบาๆ + เสียงพิเศษ
 * + หน้าจอเปิดกล่อง (ลุ้น → ระเบิดแสง → การ์ดบินออกแล้วพลิกทีละใบ ของดีสุดพลิกท้ายสุด)
 * + วงล้อสุ่มกล่องฟรีรายวัน (แถบกล่องวิ่งแล้วค่อยๆ หยุดที่กล่องที่ได้)
 *
 * ดีบัก (ต้องเปิดเกมด้วย ?debug): window.__rewardFx('common'|'rare'|'legendary'|0|1|2, itemId?) · __boxFx('box_legend') · __dailyFx('box_gold', streak) · __toastFx('ข้อความ', '#ffcd75') · __bannerFx(ชื่อ, คำอธิบาย, สี)
 */
export type FxLevel = 0 | 1 | 2;

const W = 960;
const H = 540;
const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
const CONFETTI = [0xffcd75, 0x41a6f6, 0xa7f070, 0xef7d57, 0xa77bdb, 0x73eff7, 0xf4f4f4];
const GOLD = 0xffcd75;
export const BOX_TINT: Record<BoxTier, number> = { box_wood: 0xc9a46a, box_iron: 0xb6c2d0, box_gold: 0xffcd75, box_legend: 0x73eff7 };

export function rarityOf(id: string): Rarity {
  return (ITEMS[id]?.rarity ?? 'common') as Rarity;
}

/** ระดับการฉลองของไอเทม */
export function rewardLevel(id: string): FxLevel | -1 {
  if (id === 'box_legend') return 2;
  if (id === 'box_gold') return 1;
  if (id === 'box_wood' || id === 'box_iron' || id === 'gem') return 0;
  if (id === 'coin') return -1;
  const r = rarityOf(id);
  return r === 'epic' || r === 'legendary' ? 2 : r === 'rare' ? 1 : 0;
}

const levelOfRarity = (r: Rarity): FxLevel => (RANK[r] >= 3 ? 2 : RANK[r] === 2 ? 1 : 0);

/** สร้างพื้นผิวเอฟเฟกต์ (ครั้งเดียวต่อเกม) */
function ensureTextures(scene: Phaser.Scene) {
  const T = scene.textures;
  if (T.exists('rfx_ray')) return;
  const mk = (key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, nearest = false) => {
    const ct = T.createCanvas(key, w, h)!;
    draw(ct.getContext());
    ct.refresh();
    if (nearest) ct.setFilter(Phaser.Textures.FilterMode.NEAREST);
  };
  // ลำแสง: ฐานแคบสว่างที่ศูนย์กลาง → กว้างและจางออกด้านนอก (origin 0.5,1)
  mk('rfx_ray', 48, 256, (g) => {
    const grad = g.createLinearGradient(0, 256, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(22, 256);
    g.lineTo(0, 0);
    g.lineTo(48, 0);
    g.lineTo(26, 256);
    g.closePath();
    g.fill();
  });
  mk('rfx_soft', 64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
  mk('rfx_ring', 64, 64, (g) => {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.stroke();
  });
  // ดาวพิกเซล 7×7 (กากบาท + จุดกลางสว่าง)
  mk('rfx_star', 7, 7, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(3, 0, 1, 7);
    g.fillRect(0, 3, 7, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(3, 1, 1, 5);
    g.fillRect(1, 3, 5, 1);
    g.fillRect(2, 2, 3, 3);
  }, true);
  mk('rfx_conf', 4, 2, (g) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 4, 2);
  }, true);
}

interface Pending {
  level: FxLevel;
  item?: string;
  qty?: number;
}

export class RewardFx {
  /** ระงับเอฟเฟกต์ได้ของระหว่างหน้าจอเปิดกล่อง/วงล้อ (ของจากกล่องเข้ากระเป๋าพร้อมกัน) */
  private quietUntil = 0;
  private lastL0 = 0;
  private lastL1 = 0;
  private bigBusy = false;
  private queue: Pending[] = [];

  constructor(private scene: Phaser.Scene) {
    ensureTextures(scene);
    // ดีบัก (เฉพาะ ?debug): window.__rewardFx / __boxFx / __dailyFx / __toastFx / __bannerFx
    if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
      const w = window as unknown as Record<string, unknown>;
      w.__rewardFx = (lv: FxLevel | Rarity | string = 'legendary', item?: string) => {
        const level: FxLevel = typeof lv === 'number' ? lv : lv in RANK ? levelOfRarity(lv as Rarity) : 2;
        const pick = item ?? (level === 2 ? 'thunder_blade' : level === 1 ? 'katana' : 'wood');
        if (level === 0) this.spark(120, 380, RARITY[rarityOf(pick)].hex, true);
        else this.celebrate(level, pick, 1);
      };
      w.__boxFx = (tier: BoxTier = 'box_legend') => EventBus.emit('ui:boxopen', tier, rollBox(tier));
      w.__toastFx = (text = '✔ สำเร็จ: ตัวอย่างการแจ้งเตือน', color = '#a7f070') => EventBus.emit('toast', text, color);
      w.__bannerFx = (name = '🏝 เกาะป่าดิบ', desc = 'เขตผจญภัย · ของดรอปดีขึ้น', color = '#ffcd75') => EventBus.emit('banner', name, desc, color);
      w.__dailyFx = (tier: BoxTier = 'box_gold', streak = 3) => this.dailyRoll(tier, streak);
    }
  }

  get quiet() {
    return this.scene.time.now < this.quietUntil;
  }

  /** ได้ของ (จากแถบ +ของ ซ้ายล่าง) → ฉลองตามระดับ */
  onPickup(id: string, n: number, at?: { x: number; y: number }) {
    if (this.quiet) return;
    let lv = rewardLevel(id);
    if (lv < 0) return;
    const now = this.scene.time.now;
    if (lv === 1 && now - this.lastL1 < 1200) lv = 0;
    if (lv === 0) {
      if (!at || now - this.lastL0 < 140) return;
      this.lastL0 = now;
      return this.spark(at.x, at.y, RARITY[rarityOf(id)].hex, false);
    }
    this.celebrate(lv as FxLevel, id, n);
  }

  /** ฉลองระดับ 1/2 กลางจอ */
  celebrate(level: FxLevel, item?: string, qty = 1) {
    if (level === 0) return;
    if (level === 1) {
      this.lastL1 = this.scene.time.now;
      return this.burst(item, qty);
    }
    if (this.bigBusy) {
      if (this.queue.length < 3) this.queue.push({ level, item, qty });
      return;
    }
    this.grand(item ?? 'thunder_blade', qty);
  }

  // ======================================================================
  // ขั้น 0: ประกายเล็ก
  // ======================================================================
  spark(x: number, y: number, color: number, sound: boolean) {
    const s = this.scene;
    const e = this.emitter('rfx_star', {
      speed: { min: 18, max: 60 }, scale: { start: 1, end: 0 }, lifespan: { min: 300, max: 520 },
      tint: [color, 0xffffff], blendMode: 'ADD', gravityY: -20,
    }, 48);
    e.explode(7, x, y);
    const ring = s.add.image(x, y, 'rfx_ring').setDepth(48).setTint(color).setScale(0.08).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: ring, scale: 0.35, alpha: 0, duration: 340, onComplete: () => ring.destroy() });
    s.time.delayedCall(700, () => e.destroy());
    if (sound) Sfx.play('pickup');
  }

  // ======================================================================
  // ขั้น 1: แสงพุ่ง + ดาว + คอนเฟตติ + วาบเบาๆ + ป้ายชื่อ
  // ======================================================================
  burst(item?: string, qty = 1, cx = W / 2, cy = H / 2 - 74) {
    const s = this.scene;
    const r = item ? rarityOf(item) : 'rare';
    const col = item === 'box_gold' ? GOLD : RARITY[r].hex;
    const objs: Phaser.GameObjects.GameObject[] = [];
    this.flash(0.2, 220, col);
    const glow = s.add.image(cx, cy, 'rfx_soft').setDepth(46).setTint(col).setScale(0.8).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: glow, scale: 3.6, alpha: 0, duration: 1100, ease: 'Cubic.easeOut' });
    const rays = this.rays(cx, cy, 12, col, 46, 0.85);
    rays.setScale(0.25).setAlpha(0);
    s.tweens.add({ targets: rays, scale: 0.95, alpha: 1, angle: 25, duration: 360, ease: 'Cubic.easeOut' });
    s.tweens.add({ targets: rays, alpha: 0, angle: 50, scale: 1.05, delay: 900, duration: 600 });
    const ring = s.add.image(cx, cy, 'rfx_ring').setDepth(47).setTint(col).setScale(0.2).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: ring, scale: 3.4, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
    const stars = this.emitter('rfx_star', {
      speed: { min: 70, max: 220 }, scale: { start: 1.6, end: 0 }, lifespan: { min: 550, max: 950 },
      tint: [col, 0xffffff, GOLD], blendMode: 'ADD', rotate: { min: 0, max: 90 },
    }, 47);
    stars.explode(28, cx, cy);
    const conf = this.confetti(47);
    conf.explode(70, cx, cy);
    objs.push(glow, rays, ring, stars, conf);
    // ป้ายชื่อของเล็กๆ (ไอคอน + ระดับ + ชื่อ)
    if (item && ITEMS[item]) {
      const tag = this.tag(item, qty, cx, cy);
      objs.push(tag);
    }
    Sfx.play('achievement');
    s.time.delayedCall(2300, () => objs.forEach((o) => o.destroy()));
  }

  /** ป้ายชื่อของ: แคปซูลเล็ก ไอคอน + "หายาก · ชื่อ ×n" */
  private tag(item: string, qty: number, cx: number, cy: number) {
    const s = this.scene;
    const def = ITEMS[item];
    const r = rarityOf(item);
    const col = RARITY[r].hex;
    const c = s.add.container(cx, cy).setDepth(49);
    const lab = txt(s, 0, 0, RARITY[r].name, 10, '#1a1c2c', { fontStyle: '500' }).setOrigin(0, 0.5);
    const name = txt(s, 0, 0, `${def.name}${qty > 1 ? ` ×${qty.toLocaleString()}` : ''}`, 12, '#f4f4f4', { fontStyle: '400', maxLines: 1 }).setOrigin(0, 0.5);
    const ic = s.add.image(0, 0, def.icon);
    ic.setScale(22 / Math.max(ic.width, ic.height));
    const lw = lab.width + 10;
    const w = 30 + lw + 6 + name.width + 12;
    const h = 26;
    const g = s.add.graphics();
    g.fillStyle(0x0b0d1f, 0.55).fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, 6);
    g.fillStyle(0x121626, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.lineStyle(1, col, 0.95).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    g.fillStyle(col, 0.95).fillRoundedRect(-w / 2 + 30, -7, lw, 14, 3);
    ic.setPosition(-w / 2 + 15, 0);
    lab.setPosition(-w / 2 + 35, 0);
    name.setPosition(-w / 2 + 30 + lw + 6, 0);
    c.add([g, ic, lab, name]);
    c.setScale(0.5).setAlpha(0);
    s.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    s.tweens.add({ targets: c, y: cy - 16, alpha: 0, delay: 1700, duration: 450 });
    return c;
  }

  // ======================================================================
  // ขั้น 2: รัศมีทองหมุน + การ์ดเด้งกลางจอ + จอสั่น + เสียงพิเศษ
  // ======================================================================
  grand(item: string, qty = 1) {
    const s = this.scene;
    this.bigBusy = true;
    const r = item === 'box_legend' ? 'legendary' : rarityOf(item);
    const col = item === 'box_legend' ? 0x73eff7 : RARITY[r].hex;
    const cx = W / 2;
    const cy = H / 2 - 18;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const dim = s.add.rectangle(0, 0, W, H, 0x0b0d1f, 0).setOrigin(0).setDepth(66);
    s.tweens.add({ targets: dim, fillAlpha: 0.55, duration: 260 });
    this.flash(0.45, 320, 0xfff2b0);
    const glow = s.add.image(cx, cy, 'rfx_soft').setDepth(67).setTint(GOLD).setScale(4.6).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: glow, scale: 5.4, alpha: 0.75, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // รัศมีทอง 2 ชั้นหมุนสวนกัน
    const raysA = this.rays(cx, cy, 14, GOLD, 67, 0.9);
    const raysB = this.rays(cx, cy, 10, col, 67, 0.6);
    raysA.setScale(0.2).setAlpha(0);
    raysB.setScale(0.2).setAlpha(0).setAngle(12);
    s.tweens.add({ targets: [raysA, raysB], scale: 1.05, alpha: 0.85, duration: 420, ease: 'Back.easeOut' });
    s.tweens.add({ targets: raysA, angle: '+=360', duration: 9000, repeat: -1 });
    s.tweens.add({ targets: raysB, angle: '-=360', duration: 13000, repeat: -1 });
    const ring = s.add.image(cx, cy, 'rfx_ring').setDepth(68).setTint(GOLD).setScale(0.3).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
    // การ์ด
    const card = this.card(item, qty, r).setPosition(cx, cy).setDepth(70).setScale(0).setAngle(-10);
    s.tweens.add({ targets: card, scale: 1.4, angle: 0, duration: 380, ease: 'Back.easeOut', onComplete: () => {
      s.tweens.add({ targets: card, scale: 1.25, duration: 160 });
      s.tweens.add({ targets: card, y: cy - 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } });
    // หัวข้อเล็กเหนือการ์ด
    const head = this.ribbonLabel(cx, cy - 116, item === 'box_legend' ? 'ได้กล่องเพชร!' : r === 'legendary' ? 'ได้ของระดับเทพ!' : 'ได้ของระดับมหากาพย์!', col).setDepth(71);
    head.setAlpha(0).setY(cy - 106);
    s.tweens.add({ targets: head, alpha: 1, y: cy - 116, delay: 220, duration: 300, ease: 'Back.easeOut' });
    // ดาวรอบการ์ด + คอนเฟตติ 2 จังหวะ
    const halo = this.emitter('rfx_star', {
      speed: { min: 10, max: 40 }, scale: { start: 1.8, end: 0 }, lifespan: { min: 600, max: 1100 },
      tint: [GOLD, 0xffffff, col], blendMode: 'ADD', frequency: 45, quantity: 2,
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(cx, cy, 96) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource },
    }, 69);
    halo.start();
    const conf = this.confetti(69);
    conf.explode(70, cx, cy);
    s.time.delayedCall(380, () => conf.explode(46, cx - 140, cy + 20));
    s.time.delayedCall(560, () => conf.explode(46, cx + 140, cy + 20));
    objs.push(dim, glow, raysA, raysB, ring, card, head, halo, conf);
    this.shake(320, 0.005);
    Sfx.play(r === 'legendary' || item === 'box_legend' ? 'victory' : 'levelUp');
    s.time.delayedCall(260, () => Sfx.play('achievement'));
    s.time.delayedCall(1600, () => halo.stop());
    s.time.delayedCall(2700, () => {
      s.tweens.add({ targets: objs.filter((o) => o !== conf && o !== halo), alpha: 0, duration: 380 });
      s.tweens.add({ targets: card, scale: 0.6, y: cy - 40, duration: 380, ease: 'Back.easeIn' });
      s.time.delayedCall(420, () => {
        objs.forEach((o) => o.destroy());
        this.bigBusy = false;
        const next = this.queue.shift();
        if (next) this.celebrate(next.level, next.item, next.qty);
      });
    });
  }

  // ======================================================================
  // หน้าจอเปิดกล่อง (ใส่ใน modal container ของ UIScene)
  // ======================================================================
  boxOpen(c: Phaser.GameObjects.Container, tier: BoxTier, loot: { item: string; qty: number; rarity: Rarity }[], close: () => void) {
    const s = this.scene;
    this.quietUntil = s.time.now + 1e9;
    const list = [...loot].sort((a, b) => RANK[a.rarity] - RANK[b.rarity]); // ของดีสุดพลิกท้ายสุด
    const best = list[list.length - 1]?.rarity ?? 'common';
    const bestCol = RARITY[best].hex;
    const tcol = BOX_TINT[tier];
    const bx = W / 2;
    const by = 206;
    const timers: Phaser.Time.TimerEvent[] = [];
    const later = (ms: number, fn: () => void) => timers.push(s.time.delayedCall(ms, fn));
    const emitters: Phaser.GameObjects.Particles.ParticleEmitter[] = [];
    const D = 61; // เหนือ modal (60)
    let alive = true;
    c.once(Phaser.GameObjects.Events.DESTROY, () => {
      alive = false;
      charge.stop();
      timers.forEach((t) => t.remove(false));
      emitters.forEach((e) => e.destroy());
      this.quietUntil = s.time.now + 300;
    });

    // หัวข้อเล็ก
    const title = txt(s, W / 2, 92, BOXES[tier].name, 14, '#ffcd75', { fontStyle: '500' }).setOrigin(0.5);
    const sub = txt(s, W / 2, 112, 'กำลังเปิด…', 11, '#a9bccb', { fontStyle: '400' }).setOrigin(0.5);
    c.add([title, sub]);
    // ออร่า + กล่อง
    const aura = s.add.image(bx, by, 'rfx_soft').setTint(tcol).setScale(2.6).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD);
    const rays = this.rays(bx, by, 12, RANK[best] >= 3 ? GOLD : bestCol, 0, 0.7).setAlpha(0).setScale(0.3);
    const box = s.add.image(bx, by, tier).setScale(6);
    c.add([aura, rays, box]);
    const suck = this.emitter('rfx_star', {
      speed: 0, scale: { start: 1.4, end: 0.4 }, lifespan: 420, frequency: 26, quantity: 1,
      tint: [tcol, 0xffffff], blendMode: 'ADD', moveToX: bx, moveToY: by,
      emitZone: { type: 'edge', source: new Phaser.Geom.Circle(bx, by, 120) as unknown as Phaser.Types.GameObjects.Particles.EdgeZoneSource, quantity: 32 },
    }, D);
    suck.start();
    emitters.push(suck);
    // ลุ้น: สั่นแรงขึ้นเรื่อยๆ ออร่าโตขึ้น สีค่อยๆ เป็นสีของดีที่สุด (ใบ้)
    const CH = 1000;
    const charge = s.tweens.addCounter({
      from: 0, to: 1, duration: CH, ease: 'Quad.easeIn',
      onUpdate: (tw) => {
        if (!alive) return;
        const p = tw.getValue() ?? 0;
        const amp = 2 + p * 12;
        box.setAngle(Math.sin(s.time.now / (38 - p * 18)) * amp);
        box.setScale(6 + p * 0.9 + Math.sin(s.time.now / 50) * 0.08 * p);
        box.x = bx + (Math.random() - 0.5) * p * 4;
        aura.setScale(2.6 + p * 2).setAlpha(0.3 + p * 0.6);
        if (p > 0.65) aura.setTint(Phaser.Display.Color.GetColor(...lerpRgb(tcol, bestCol, (p - 0.65) / 0.35)));
      },
    });
    const skipBtn = () => {
      // แตะจอ → ข้ามไปเปิดทุกใบทันที
      if (!opened) {
        charge.complete();
      } else flipAll(true);
    };
    const dim = c.list[0] as Phaser.GameObjects.Rectangle;
    dim.on('pointerdown', skipBtn);

    let opened = false;
    const cards: { card: Phaser.GameObjects.Container; back: Phaser.GameObjects.Container; face: Phaser.GameObjects.Container; l: (typeof list)[number]; flipped: boolean; x: number }[] = [];
    const n = list.length;
    const gap = n > 5 ? 108 : 118;
    const cy = 222;
    charge.once(Phaser.Tweens.Events.TWEEN_COMPLETE, () => {
      if (opened || !alive) return;
      opened = true;
      suck.stop();
      box.setVisible(false);
      sub.setText(`ได้ของ ${n} ชิ้น · แตะเพื่อเปิดทั้งหมด`);
      // ระเบิดแสง
      this.flash(RANK[best] >= 3 ? 0.65 : 0.45, 320, 0xffffff);
      const ring = s.add.image(bx, by, 'rfx_ring').setTint(bestCol).setScale(0.3).setBlendMode(Phaser.BlendModes.ADD);
      c.add(ring);
      s.tweens.add({ targets: ring, scale: 7, alpha: 0, duration: 520, ease: 'Cubic.easeOut' });
      const pop = this.emitter('rfx_star', {
        speed: { min: 90, max: 280 }, scale: { start: 2, end: 0 }, lifespan: { min: 500, max: 900 }, tint: [tcol, bestCol, 0xffffff], blendMode: 'ADD',
      }, D);
      pop.explode(34, bx, by);
      emitters.push(pop);
      s.tweens.add({ targets: aura, scale: 6, alpha: RANK[best] >= 2 ? 0.45 : 0.25, duration: 500 });
      aura.setTint(bestCol);
      if (RANK[best] >= 2) {
        rays.setPosition(W / 2, cy);
        aura.setPosition(W / 2, cy);
        s.tweens.add({ targets: rays, alpha: RANK[best] >= 3 ? 0.55 : 0.32, scale: 1.25, duration: 500, ease: 'Cubic.easeOut' });
        s.tweens.add({ targets: rays, angle: '+=360', duration: 16000, repeat: -1 });
        const conf = this.confetti(D);
        conf.explode(RANK[best] >= 3 ? 80 : 44, bx, by);
        emitters.push(conf);
      }
      // การ์ดคว่ำบินออกจากกล่อง
      list.forEach((l, i) => {
        const x = W / 2 + (i - (n - 1) / 2) * gap;
        const back = this.cardBack(tier);
        const face = this.card(l.item, l.qty, l.rarity).setVisible(false);
        const card = s.add.container(bx, by, [back, face]).setScale(0.15).setAngle(-180);
        c.add(card);
        cards.push({ card, back, face, l, flipped: false, x });
        s.tweens.add({ targets: card, x, y: cy, scale: 1, angle: 0, delay: i * 80, duration: 380, ease: 'Cubic.easeOut' });
      });
      later(380 + n * 80 + 160, () => flipNext(0));
    });

    let shaken = false;
    const flip = (i: number, fast = false) => {
      const k = cards[i];
      if (!k || k.flipped) return;
      k.flipped = true;
      const rank = RANK[k.l.rarity];
      s.tweens.add({
        targets: k.card, scaleX: 0, duration: fast ? 60 : 110, ease: 'Quad.easeIn',
        onComplete: () => {
          if (!alive) return;
          k.back.setVisible(false);
          k.face.setVisible(true);
          s.tweens.add({ targets: k.card, scaleX: rank >= 2 ? 1.1 : 1, scaleY: rank >= 2 ? 1.1 : 1, duration: fast ? 90 : 160, ease: 'Back.easeOut', onComplete: () => {
            if (rank >= 2) s.tweens.add({ targets: k.card, scaleX: 1, scaleY: 1, duration: 140 });
          } });
          const col = RARITY[k.l.rarity].hex;
          // แสงหลังการ์ดตามระดับ
          if (rank >= 1) {
            const g = s.add.image(k.x, cy, 'rfx_soft').setTint(col).setScale(rank >= 3 ? 2.6 : 1.9).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
            c.addAt(g, c.getIndex(k.card));
            s.tweens.add({ targets: g, alpha: rank >= 3 ? 0.9 : rank === 2 ? 0.6 : 0.35, duration: 200 });
            if (rank >= 3) s.tweens.add({ targets: g, scale: '+=0.35', duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          }
          if (rank >= 3) {
            const mr = this.rays(k.x, cy, 10, GOLD, 0, 0.8).setScale(0.1).setAlpha(0);
            c.addAt(mr, c.getIndex(k.card));
            s.tweens.add({ targets: mr, scale: 0.55, alpha: 0.95, duration: 260, ease: 'Back.easeOut' });
            s.tweens.add({ targets: mr, angle: 360, duration: 6000, repeat: -1 });
          }
          if (rank >= 2) {
            const st = this.emitter('rfx_star', {
              speed: { min: 50, max: 150 }, scale: { start: 1.6, end: 0 }, lifespan: { min: 400, max: 750 }, tint: [col, 0xffffff, GOLD], blendMode: 'ADD',
            }, D);
            st.explode(rank >= 3 ? 26 : 14, k.x, cy);
            emitters.push(st);
          }
          if (!fast) {
            if (k.l.rarity === 'legendary') {
              this.flash(0.4, 260, 0xfff2b0);
              const conf = this.confetti(D);
              conf.explode(60, k.x, cy - 30);
              emitters.push(conf);
              if (!shaken) this.shake(300, 0.006);
              shaken = true;
              Sfx.play('victory');
            } else if (rank === 3) {
              this.shake(200, 0.003);
              Sfx.play('achievement');
            } else if (rank === 2) Sfx.play('pickup');
            else Sfx.play('click');
          }
        },
      });
    };
    const flipNext = (i: number) => {
      if (i >= cards.length) return finish();
      if (cards[i].flipped) return flipNext(i + 1);
      flip(i);
      // ของดีขึ้น → เว้นจังหวะนานขึ้นให้ลุ้น
      const nextRank = cards[i + 1] ? RANK[cards[i + 1].l.rarity] : 0;
      later(nextRank >= 3 ? 620 : 300, () => flipNext(i + 1));
    };
    let done = false;
    const flipAll = (fast: boolean) => {
      cards.forEach((_, i) => flip(i, fast));
      later(260, finish);
    };
    const finish = () => {
      if (done || !alive) return;
      done = true;
      sub.setText(`ได้ของ ${n} ชิ้น · ดีสุด: ${RARITY[best].name}`).setColor(RARITY[best].color);
      const b = button(s, W / 2, 344, 150, 32, 'รับของ', close, true, 13);
      c.add(b.objects);
    };
  }

  // ======================================================================
  // วงล้อสุ่มกล่องฟรีรายวัน
  // ======================================================================
  dailyRoll(tier: BoxTier, streak: number, hint = '') {
    const s = this.scene;
    this.quietUntil = s.time.now + 2600; // กล่องที่ตกพื้นยังไม่ฉลองซ้ำ
    const cx = W / 2;
    const cy = 168;
    const FW = 236;
    const FH = 54;
    const c = s.add.container(cx, cy).setDepth(55).setAlpha(0);
    const g = s.add.graphics();
    g.fillStyle(0x0b0d1f, 0.55).fillRoundedRect(-FW / 2 + 2, -FH / 2 + 3, FW, FH, 6);
    g.fillStyle(0x10141f, 0.95).fillRoundedRect(-FW / 2, -FH / 2, FW, FH, 6);
    g.lineStyle(1, GOLD, 0.9).strokeRoundedRect(-FW / 2, -FH / 2, FW, FH, 6);
    g.lineStyle(1, 0xffffff, 0.06).strokeRoundedRect(-FW / 2 + 3, -FH / 2 + 3, FW - 6, FH - 6, 4);
    // ช่องหน้าต่างวงล้อ
    const VW = FW - 20;
    const VH = FH - 12;
    g.fillStyle(0x070912, 1).fillRect(-VW / 2, -VH / 2, VW, VH);
    c.add(g);
    // แถบกล่อง (สุ่มหน้าตาตามโอกาส แล้วจบที่กล่องที่ได้)
    const tiers: BoxTier[] = ['box_wood', 'box_iron', 'box_gold', 'box_legend'];
    const weights = [50, 30, 15, 5];
    const N = 30;
    const STOP = 25;
    const SP = 42;
    const strip = s.add.container(0, 0);
    const icons: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < N; i++) {
      let t: BoxTier = tier;
      if (i !== STOP) {
        let r = Math.random() * 100;
        t = tiers[weights.findIndex((w) => (r -= w) < 0)] ?? 'box_wood';
        if (i === STOP + 1 || i === STOP - 1) t = tier === 'box_legend' ? 'box_gold' : 'box_legend'; // เฉียดของดี
      }
      const im = s.add.image(i * SP, 0, t);
      im.setScale(26 / Math.max(im.width, im.height));
      icons.push(im);
      strip.add(im);
    }
    c.add(strip);
    // หน้ากากตัดขอบวงล้อ
    const mg = s.make.graphics({}, false);
    const mask = mg.createGeometryMask();
    strip.setMask(mask);
    const syncMask = () => {
      mg.clear().fillStyle(0xffffff).fillRect(c.x - (VW / 2) * c.scaleX, c.y - (VH / 2) * c.scaleY, VW * c.scaleX, VH * c.scaleY);
    };
    // เงาไล่ขอบซ้ายขวา + เข็มชี้ทอง
    const fade = s.add.graphics();
    for (let i = 0; i < 8; i++) {
      fade.fillStyle(0x070912, 0.85 - i * 0.1).fillRect(-VW / 2 + i * 4, -VH / 2, 4, VH).fillRect(VW / 2 - (i + 1) * 4, -VH / 2, 4, VH);
    }
    const pin = s.add.graphics();
    pin.fillStyle(GOLD, 1).fillTriangle(-5, -FH / 2 - 1, 5, -FH / 2 - 1, 0, -VH / 2 + 4).fillTriangle(-5, FH / 2 + 1, 5, FH / 2 + 1, 0, VH / 2 - 4);
    pin.fillStyle(GOLD, 0.35).fillRect(-1, -VH / 2, 2, VH);
    c.add([fade, pin]);
    const cap = txt(s, 0, FH / 2 + 13, `🎁 กล่องฟรีวันนี้ · ต่อเนื่อง ${streak} วัน`, 11, '#c9d3dc', { fontStyle: '400' }).setOrigin(0.5)
      .setBackgroundColor('#10141fe6').setPadding(7, 1, 7, 1);
    c.add(cap);
    s.tweens.add({ targets: c, alpha: 1, duration: 200 });
    // หมุน: เริ่มให้ไอคอนแรกอยู่กลาง → ค่อยๆ หยุดที่ช่อง STOP (เลยนิดแล้วดีดกลับ)
    strip.x = 0;
    const endX = -STOP * SP + Phaser.Math.Between(-8, 8);
    let lastIdx = 0;
    s.tweens.add({
      targets: strip, x: endX, duration: 2100, ease: 'Cubic.easeOut',
      onUpdate: () => {
        syncMask();
        const idx = Math.round(-strip.x / SP);
        if (idx !== lastIdx) {
          lastIdx = idx;
          Sfx.play('click', 40);
        }
      },
      onComplete: () => {
        s.tweens.add({ targets: strip, x: -STOP * SP, duration: 160, ease: 'Back.easeOut', onUpdate: syncMask, onComplete: land });
      },
    });
    syncMask();
    const land = () => {
      const win = icons[STOP];
      const col = BOX_TINT[tier];
      const glow = s.add.image(win.x, 0, 'rfx_soft').setTint(col).setScale(0.6).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      strip.addAt(glow, strip.getIndex(win));
      s.tweens.add({ targets: glow, alpha: 0.9, scale: 1.1, duration: 220 });
      s.tweens.add({ targets: win, scale: win.scale * 1.45, duration: 240, ease: 'Back.easeOut', yoyo: true, hold: 500 });
      icons.forEach((im, i) => i !== STOP && s.tweens.add({ targets: im, alpha: 0.25, duration: 200 }));
      cap.setText(`ได้ ${ITEMS[tier].name}!${hint ? `  ·  ${hint}` : ''}`).setColor(Phaser.Display.Color.IntegerToColor(col).rgba);
      if (tier === 'box_legend') this.celebrate(2, 'box_legend', 1);
      else if (tier === 'box_gold') this.burst('box_gold', 1, cx, cy);
      else this.spark(cx, cy, col, true);
      s.time.delayedCall(tier === 'box_legend' ? 3000 : 1900, () => {
        s.tweens.add({ targets: c, alpha: 0, y: cy - 10, duration: 360, onComplete: () => (c.destroy(), mg.destroy()) });
      });
    };
  }

  // ======================================================================
  // ชิ้นส่วน
  // ======================================================================
  /** การ์ดไอเทม 100×136 (origin กลาง) */
  card(item: string, qty: number, rarity: Rarity) {
    const s = this.scene;
    const def = ITEMS[item];
    const col = RARITY[rarity].hex;
    const CW = 100;
    const CH = 136;
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    g.fillStyle(0x0b0d1f, 0.6).fillRoundedRect(-CW / 2 + 2, -CH / 2 + 3, CW, CH, 6);
    g.fillStyle(0x151a2b, 1).fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 6);
    // ไล่สีระดับจากบนลงล่างจางๆ
    for (let i = 0; i < 10; i++) g.fillStyle(col, 0.16 - i * 0.015).fillRect(-CW / 2 + 2, -CH / 2 + 16 + i * 6, CW - 4, 6);
    g.lineStyle(2, col, 1).strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 6);
    g.lineStyle(1, 0xffffff, 0.1).strokeRoundedRect(-CW / 2 + 3, -CH / 2 + 3, CW - 6, CH - 6, 4);
    // แถบระดับด้านบน
    g.fillStyle(col, 1).fillRoundedRect(-CW / 2, -CH / 2, CW, 16, { tl: 6, tr: 6, bl: 0, br: 0 });
    const tag = txt(s, 0, -CH / 2 + 8, RARITY[rarity].name, 10, '#1a1c2c', { fontStyle: '500' }).setOrigin(0.5);
    // มุมเพชรเล็ก
    for (const [sx, sy] of [[-1, 1], [1, 1]] as const) g.fillStyle(col, 1).fillRect(sx * (CW / 2 - 6) - 1, sy * (CH / 2 - 6) - 1, 3, 3);
    const icon = s.add.image(0, -18, def?.icon ?? 'px');
    icon.setScale(52 / Math.max(icon.width, icon.height, 1));
    const name = txt(s, 0, 20, def?.name ?? item, 11, RARITY[rarity].color, { fontStyle: '500', wordWrap: { width: CW - 10 }, align: 'center', maxLines: 2 }).setOrigin(0.5, 0);
    // จำนวน: ป้ายเล็กมุมขวาล่างของภาพ
    const q = txt(s, CW / 2 - 9, -CH / 2 + 20 + 60 - 2, `×${qty.toLocaleString()}`, 10, '#f4f4f4', { fontStyle: '500' })
      .setOrigin(1, 1).setBackgroundColor('#0b0d1fcc').setPadding(4, 0, 4, 0);
    c.add([g, icon, tag, name, q]);
    withItemArt(s, item, (k) => {
      if (!icon.scene) return;
      const art = placeArtCover(s.add.image(0, 0, k), -CW / 2 + 8, -CH / 2 + 20, CW - 16, 60, 0.25);
      const frame = s.add.rectangle(-CW / 2 + 8, -CH / 2 + 20, CW - 16, 60).setOrigin(0).setStrokeStyle(1, col, 0.8);
      c.addAt(art, c.getIndex(icon));
      c.addAt(frame, c.getIndex(icon));
      icon.setVisible(false);
    });
    // ระดับมหากาพย์+: แสงวาบวิ่งผ่านการ์ดเป็นระยะ
    if (RANK[rarity] >= 3) {
      const sh = s.add.rectangle(-CW / 2 + 6, -CH / 2 + 18, 4, CH - 24, 0xffffff, 1).setOrigin(0).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      c.add(sh);
      // วิ่งซ้ายไปขวาแล้วจางหาย (ระหว่างรอบมองไม่เห็น)
      s.tweens.add({ targets: sh, x: { from: -CW / 2 + 6, to: CW / 2 - 12 }, alpha: { from: 0.22, to: 0 }, duration: 700, delay: 500, repeat: -1, repeatDelay: 1200, ease: 'Sine.easeIn' });
    }
    return c;
  }

  /** หลังการ์ด (สีตามกล่อง + เครื่องหมาย ?) */
  private cardBack(tier: BoxTier) {
    const s = this.scene;
    const col = BOX_TINT[tier];
    const c = s.add.container(0, 0);
    const g = s.add.graphics();
    g.fillStyle(0x0b0d1f, 0.6).fillRoundedRect(-48, -65, 100, 136, 6);
    g.fillStyle(0x1d2238, 1).fillRoundedRect(-50, -68, 100, 136, 6);
    g.lineStyle(2, col, 1).strokeRoundedRect(-50, -68, 100, 136, 6);
    g.lineStyle(1, col, 0.35).strokeRoundedRect(-42, -60, 84, 120, 4);
    // ลายตารางเพชร
    for (let y = -52; y <= 52; y += 13) for (let x = -34; x <= 34; x += 13) g.fillStyle(col, 0.18).fillRect(x - 1, y - 1, 3, 3);
    g.fillStyle(col, 0.9).fillCircle(0, 0, 16);
    g.fillStyle(0x1d2238, 1).fillCircle(0, 0, 13);
    c.add([g, txt(s, 0, 0, '?', 14, Phaser.Display.Color.IntegerToColor(col).rgba, { fontStyle: '600' }).setOrigin(0.5)]);
    return c;
  }

  /** ป้ายหัวข้อเล็ก (ริบบอนทอง) */
  private ribbonLabel(x: number, y: number, text: string, col: number) {
    const s = this.scene;
    const c = s.add.container(x, y);
    const t = txt(s, 0, 0, text, 12, '#fff2b0', { fontStyle: '500' }).setOrigin(0.5);
    const w = t.width + 30;
    const g = s.add.graphics();
    const dark = Phaser.Display.Color.IntegerToColor(GOLD).darken(50).color;
    g.fillStyle(dark, 1).fillPoints([{ x: -w / 2 - 12, y: -7 }, { x: -w / 2 + 4, y: -7 }, { x: -w / 2 + 4, y: 9 }, { x: -w / 2 - 12, y: 9 }, { x: -w / 2 - 6, y: 1 }], true);
    g.fillPoints([{ x: w / 2 + 12, y: -7 }, { x: w / 2 - 4, y: -7 }, { x: w / 2 - 4, y: 9 }, { x: w / 2 + 12, y: 9 }, { x: w / 2 + 6, y: 1 }], true);
    g.fillStyle(0x1a1424, 0.96).fillRoundedRect(-w / 2, -10, w, 20, 4);
    g.lineStyle(1, GOLD, 1).strokeRoundedRect(-w / 2, -10, w, 20, 4);
    g.fillStyle(col, 1).fillRect(-w / 2 + 6, -1, 3, 3).fillRect(w / 2 - 9, -1, 3, 3);
    c.add([g, t]);
    return c;
  }

  /** กลุ่มลำแสงรอบจุด (หมุนได้ด้วย angle) */
  private rays(x: number, y: number, n: number, tint: number, depth: number, alpha: number) {
    const s = this.scene;
    const c = s.add.container(x, y).setDepth(depth);
    for (let i = 0; i < n; i++) {
      const long = i % 2 === 0;
      const r = s.add.image(0, 0, 'rfx_ray').setOrigin(0.5, 1).setAngle((360 / n) * i).setTint(tint)
        .setScale(long ? 0.9 : 0.6, long ? 0.9 : 0.62).setAlpha(alpha * (long ? 1 : 0.7)).setBlendMode(Phaser.BlendModes.ADD);
      c.add(r);
    }
    return c;
  }

  private emitter(key: string, cfg: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig, depth: number) {
    return this.scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(depth);
  }

  /** คอนเฟตติหลากสี พุ่งขึ้นแล้วร่วงหมุน */
  private confetti(depth: number) {
    return this.emitter('rfx_conf', {
      speedX: { min: -240, max: 240 }, speedY: { min: -360, max: -120 }, gravityY: 520,
      scale: { min: 1.5, max: 2.5 }, rotate: { start: 0, end: 720 }, lifespan: { min: 1200, max: 1900 },
      alpha: { start: 1, end: 0.2 }, tint: CONFETTI,
    }, depth);
  }

  /** จอวาบเบาๆ */
  private flash(alpha: number, ms: number, color = 0xffffff) {
    const s = this.scene;
    const r = s.add.rectangle(0, 0, W, H, color, alpha).setOrigin(0).setDepth(72).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: r, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }

  /** สั่นจอเกมเบาๆ (โลกเกม ไม่ใช่ HUD) */
  private shake(ms: number, k: number) {
    const gs = this.scene.scene.get('GameScene');
    (gs?.cameras?.main ?? this.scene.cameras.main).shake(ms, k);
  }
}

function lerpRgb(a: number, b: number, t: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  const ch = (v: number, sh: number) => (v >> sh) & 0xff;
  return [0, 8, 16].reverse().map((sh) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * k)) as [number, number, number];
}
