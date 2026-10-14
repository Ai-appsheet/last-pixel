import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import type { Biome } from '../data/islands';
import { MOBS, legendMobs, type Affliction, type BeastElement, type BeastMove, type MobDef } from '../data/mobs';
import type { GameScene } from '../scenes/GameScene';
import type { Mob } from '../entities/Mob';
import { TILE, isWater } from '../world/tiles';

/** สีของแต่ละธาตุ (วงเตือน/เอฟเฟกต์) */
const ELEMENT_COLOR: Record<BeastElement, number> = {
  fire: 0xef7d57, ice: 0x73eff7, storm: 0xfff2b0, poison: 0x38b764, water: 0x41a6f6, earth: 0xc28a50, wind: 0xd6e4ee,
};
/** ธาตุ → สถานะที่ติดผู้เล่นจากท่า nova/strike */
const ELEMENT_AFFLICT: Partial<Record<BeastElement, Affliction>> = { fire: 'burn', ice: 'chill', storm: 'shock', poison: 'poison', water: 'chill' };
const AFFLICT_TEXT: Record<Affliction, string> = { poison: '☠ ติดพิษ!', burn: '🔥 ไฟลวก!', chill: '❄ ตัวแข็ง เดินช้าลง', shock: '⚡ ไฟฟ้าช็อต ชาไปทั้งตัว' };

interface Mark { x: number; y: number; r: number; t: number; total: number; g: Phaser.GameObjects.Graphics; from: Mob; kind: 'strike' | 'nova' | 'cloud' }
interface Cloud { x: number; y: number; r: number; t: number; tick: number; power: number; from: string; mark: Phaser.GameObjects.Ellipse }

/**
 * สัตว์ในตำนาน + สถานะที่ติดผู้เล่นจากสัตว์
 *   - เกิดยาก: เช็กทุก 6 วิ ตามกฎ spawn ของแต่ละตัว (ไบโอม/กลางวัน-คืน/ทะเลลึก) · ในโลกมีได้ทีละ 1 ตัว · พักเกิด 6 นาทีหลังเจอ
 *   - ท่าพิเศษ nova/strike/cloud (charge/summon อยู่ใน Mob.ts) — มีวงเตือนก่อนเสมอ
 *   - สถานะผู้เล่น: พิษ/ไฟลวก (เสีย HP ต่อเนื่อง) · ตัวแข็ง/ไฟฟ้าช็อต (เดินช้า)
 *   - ทดสอบ: ใส่ `?legend=<id>` ใน URL ให้ตัวนั้นโผล่หลังเข้าเกม 4 วิ
 */
export class CreatureSystem {
  /** ตัวในตำนานที่อยู่ในโลกตอนนี้ */
  legend: Mob | null = null;
  private timer = 6;
  private cooldown = 90;
  private farTime = 0;
  private marks: Mark[] = [];
  private clouds: Cloud[] = [];
  // สถานะผู้เล่น
  private poisonT = 0;
  private poisonDps = 0;
  private poisonFrom = '';
  private chillT = 0;
  private chillMult = 1;
  private toastCd = 0;
  private debug: string | null = null;

  constructor(private s: GameScene) {
    const want = new URLSearchParams(window.location.search).get('legend');
    if (want && MOBS[want]?.legendary) this.debug = want;
  }

  update(dt: number) {
    this.tickPlayer(dt);
    this.tickMarks(dt);
    this.tickClouds(dt);
    this.cooldown -= dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 6;
    this.manageLegend(6);
    if (this.debug) {
      const id = this.debug;
      this.debug = null;
      this.spawnLegend(MOBS[id]);
      return;
    }
    if (!this.legend && this.cooldown <= 0) this.rollLegend();
  }

  // ------------------------------------------------------------------ สถานะที่ติดผู้เล่น

  /** ผู้เล่นโดนสัตว์ตี/โดนกระสุน/โดนท่า → ติดสถานะ */
  afflict(h: { kind: Affliction; dur: number; power?: number }, from: string) {
    const p = this.s.player;
    if (p.dead) return;
    if (h.kind === 'poison' || h.kind === 'burn') {
      this.poisonDps = Math.max(this.poisonT > 0 ? this.poisonDps : 0, h.power ?? (h.kind === 'burn' ? 5 : 3));
      this.poisonT = Math.max(this.poisonT, h.dur);
      this.poisonFrom = `${h.kind === 'burn' ? 'ไฟลวกจาก' : 'พิษของ'}${from}`;
    } else {
      this.chillMult = Math.min(this.chillT > 0 ? this.chillMult : 1, h.kind === 'shock' ? 0.4 : 0.6);
      this.chillT = Math.max(this.chillT, h.dur);
    }
    if (this.toastCd <= 0) {
      this.toastCd = 3;
      EventBus.emit('toast', AFFLICT_TEXT[h.kind], h.kind === 'poison' ? '#a7f070' : h.kind === 'burn' ? '#ef7d57' : '#73eff7');
    }
  }

  private tickPlayer(dt: number) {
    const p = this.s.player;
    this.toastCd -= dt;
    if (p.dead) {
      this.poisonT = this.chillT = 0;
      p.speedMult = 1;
      return;
    }
    if (this.poisonT > 0) {
      this.poisonT -= dt;
      p.hp = Math.max(0, p.hp - this.poisonDps * dt);
      p.lastDamage = this.poisonFrom;
      if (Math.random() < dt * 5) this.s.fx.sparks(p.x + Phaser.Math.Between(-4, 4), p.y - 6, 0xa7f070, 1, 5);
    }
    if (this.chillT > 0) {
      this.chillT -= dt;
      if (Math.random() < dt * 5) this.s.fx.sparks(p.x + Phaser.Math.Between(-5, 5), p.y - 2, 0xc8f4ff, 1, 4);
      if (this.chillT <= 0) this.chillMult = 1;
    }
    p.speedMult = this.chillT > 0 ? this.chillMult : 1;
  }

  // ------------------------------------------------------------------ ท่าพิเศษ

  /** ร่ายท่า (Mob เรียกเมื่อถึงคูลดาวน์) */
  cast(mob: Mob, move: BeastMove) {
    const s = this.s;
    const p = s.player;
    const el = mob.def.element ?? 'earth';
    if (move === 'nova') {
      this.mark(mob.x, mob.feetY, 72, 0.9, mob, 'nova');
      Sfx.play('growl');
    } else if (move === 'strike') {
      // วงเตือน 3 จุด: ใต้ตัวผู้เล่น 1 + รอบๆ 2
      this.mark(p.x, p.feetY, 22, 1.1, mob, 'strike');
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Phaser.Math.Between(30, 70);
        this.mark(p.x + Math.cos(a) * d, p.feetY + Math.sin(a) * d * 0.7, 22, 1.1 + i * 0.25, mob, 'strike');
      }
    } else if (move === 'cloud') {
      this.mark(p.x, p.feetY, 34, 0.7, mob, 'cloud');
    }
    s.fx.ring(mob.x, mob.y, ELEMENT_COLOR[el], 20);
  }

  private mark(x: number, y: number, r: number, t: number, from: Mob, kind: Mark['kind']) {
    this.marks.push({ x, y, r, t, total: t, from, kind, g: this.s.add.graphics().setDepth(1e6 - 1) });
  }

  private tickMarks(dt: number) {
    for (const m of [...this.marks]) {
      m.t -= dt;
      const el = m.from.def.element ?? 'earth';
      const col = ELEMENT_COLOR[el];
      const k = Math.max(0, m.t / m.total);
      m.g.clear().fillStyle(col, 0.15).fillEllipse(m.x, m.y, m.r * 2, m.r * 1.3)
        .fillStyle(0xff3355, 0.25 + (1 - k) * 0.3).fillEllipse(m.x, m.y, m.r * 2 * (1 - k), m.r * 1.3 * (1 - k))
        .lineStyle(2, col, 0.95).strokeEllipse(m.x, m.y, m.r * 2, m.r * 1.3);
      if (m.t > 0) continue;
      m.g.destroy();
      this.marks.splice(this.marks.indexOf(m), 1);
      this.resolve(m);
    }
  }

  /** วงเตือนหมดเวลา → ท่าทำงานจริง */
  private resolve(m: Mark) {
    const s = this.s;
    const p = s.player;
    const def = m.from.def;
    const el = def.element ?? 'earth';
    const col = ELEMENT_COLOR[el];
    const inside = Phaser.Math.Distance.Between(p.x, p.feetY, m.x, m.y) < m.r && !p.dead && !s.playerSafe;
    if (m.kind === 'cloud') {
      s.fx.poof(m.x, m.y, 0x38b764, 10);
      if (this.clouds.length >= 8) this.clouds.shift()?.mark.destroy();
      const mark = s.add.ellipse(m.x, m.y, m.r * 2, m.r * 1.3, 0x38b764, 0.28).setStrokeStyle(1, 0xa7f070, 0.6).setDepth(-0.5);
      this.clouds.push({ x: m.x, y: m.y, r: m.r, t: 5, tick: 0, power: Math.max(4, def.attack * 0.25), from: def.name, mark });
      return;
    }
    if (m.kind === 'nova') {
      s.fx.ring(m.x, m.y, col, m.r);
      s.time.delayedCall(90, () => s.fx.ring(m.x, m.y, 0xffffff, m.r * 0.6));
      s.fx.sparks(m.x, m.y, col, 20, m.r * 0.7);
      s.cameras.main.shake(el === 'earth' ? 380 : 200, el === 'earth' ? 0.012 : 0.006);
      Sfx.play(el === 'earth' ? 'breakRock' : el === 'ice' ? 'splash' : 'fire');
      // แผ่นดินไหว: สิ่งก่อสร้างรอบตัวโดนแรงกระแทก
      if (el === 'earth') for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        s.damageStructureAt(m.x + Math.cos(a) * m.r * 0.6, m.y + Math.sin(a) * m.r * 0.4, def.attack * 2, 'impact');
      }
    } else {
      this.strikeFx(m.x, m.y, el);
    }
    if (!inside) return;
    if (s.boatRiding && def.element === 'water') {
      s.damageBoat(def.attack * 1.2);
      return;
    }
    p.lastDamage = def.name;
    const dmg = p.hurt(def.attack * (m.kind === 'nova' ? 1.3 : 1.2), { x: m.x, y: m.y });
    if (dmg > 0) {
      s.fx.damageNumber(p.x, p.y - 12, dmg, 0xef7d57);
      const af = ELEMENT_AFFLICT[el];
      if (af) this.afflict({ kind: af, dur: af === 'shock' ? 1.2 : 2.5, power: af === 'burn' ? 5 : af === 'poison' ? 4 : undefined }, def.name);
    }
  }

  /** เอฟเฟกต์ strike ตามธาตุ: สายฟ้า/เสาน้ำ/เสาไฟ/ใบมีดลม */
  private strikeFx(x: number, y: number, el: BeastElement) {
    const s = this.s;
    const col = ELEMENT_COLOR[el];
    const g = s.add.graphics().setDepth(1e6);
    if (el === 'storm' || el === 'wind') {
      g.lineStyle(3, col, 1).beginPath();
      let bx = x;
      let by = y - 200;
      g.moveTo(bx, by);
      while (by < y) {
        by = Math.min(y, by + Phaser.Math.Between(16, 30));
        bx = x + Phaser.Math.Between(-8, 8) * (by < y ? 1 : 0);
        g.lineTo(bx, by);
      }
      g.strokePath();
      Sfx.play(el === 'storm' ? 'thunder' : 'swing');
    } else {
      // เสาพุ่งขึ้นจากพื้น (น้ำ/ไฟ/พิษ/ดิน/น้ำแข็ง)
      g.fillStyle(col, 0.75).fillRect(x - 6, y - 60, 12, 60).fillStyle(0xffffff, 0.5).fillRect(x - 2, y - 60, 4, 60);
      Sfx.play(el === 'fire' ? 'fire' : 'splash');
    }
    s.fx.ring(x, y, col, 22);
    s.fx.sparks(x, y - 6, col, 10, 20);
    s.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  private tickClouds(dt: number) {
    const s = this.s;
    const p = s.player;
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt;
      c.tick -= dt;
      if (Math.random() < dt * 6) s.fx.poof(c.x + Phaser.Math.FloatBetween(-c.r, c.r) * 0.7, c.y + Phaser.Math.FloatBetween(-c.r, c.r) * 0.4, 0x38b764, 3);
      if (c.tick <= 0) {
        c.tick = 0.5;
        if (!p.dead && Phaser.Math.Distance.Between(p.x, p.feetY, c.x, c.y) < c.r) this.afflict({ kind: 'poison', dur: 2, power: c.power }, c.from);
      }
      if (c.t <= 0) {
        c.mark.destroy();
        this.clouds.splice(i, 1);
      } else if (c.t < 0.5) c.mark.setAlpha(c.t * 2);
    }
  }

  // ------------------------------------------------------------------ การเกิดของสัตว์ในตำนาน

  /** สุ่มว่าจะมีสัตว์ในตำนานโผล่ไหม (ตามไบโอม เวลา และทะเลลึก) */
  private rollLegend() {
    const s = this.s;
    const p = s.player;
    if (s.inGrace || s.playerSafe || p.dead) return;
    const day = s.dayNight.day;
    const night = s.dayNight.isNight;
    let where: Biome | 'sea' | null = null;
    if (s.boatRiding && s.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16)) === TILE.DEEP) where = 'sea';
    else if (!s.riding || s.riding.kind === 'land') {
      const slot = s.world.slots[s.currentSlot];
      if (slot && slot.biome !== 'central' && slot.biome !== 'dungeon' && !s.shelter.inside) where = slot.biome;
    }
    if (!where) return;
    for (const def of Phaser.Utils.Array.Shuffle(legendMobs())) {
      if (day < (def.minDay ?? 1)) continue;
      const rule = def.spawn?.find((r) => r.where === where && (r.time === 'any' || (r.time === 'night') === night) && Math.random() < r.chance);
      if (rule && this.spawnLegend(def)) return;
    }
  }

  /** ปล่อยสัตว์ในตำนานใกล้ผู้เล่น + ประกาศ + ตั้งหลอด HP บอส */
  private spawnLegend(def: MobDef): boolean {
    const s = this.s;
    const p = s.player;
    const water = def.move === 'swim';
    const beach = def.id === 'stone_turtle';
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.FloatBetween(170, 230);
      const tx = Math.floor((p.x + Math.cos(a) * d) / 16);
      const ty = Math.floor((p.y + Math.sin(a) * d) / 16);
      const t = s.tileAt(tx, ty);
      if (water ? !isWater(t) : def.move === 'fly' || def.move === 'amphi' ? t === TILE.ROCKWALL : isWater(t) || s.isTileBlocked(tx, ty)) continue;
      if (beach && i < 18 && t !== TILE.SAND) continue; // เต่าศิลาชอบขึ้นจากชายหาด
      if (s.isSafeTile(tx, ty) || s.shelter.at(tx * 16 + 8, ty * 16 + 8)) continue;
      const m = s.spawnMob(def.id, tx * 16 + 8, ty * 16 + 8);
      this.legend = m;
      this.cooldown = 360;
      this.farTime = 0;
      if (!s.boss?.active) s.boss = m;
      s.fx.ring(m.x, m.y, ELEMENT_COLOR[def.element ?? 'earth'], 50);
      s.cameras.main.shake(600, 0.006);
      Sfx.play('bossRoar');
      const dir = this.dirText(m.x - p.x, m.y - p.y);
      EventBus.emit('ui:splash', { art: `legend_${def.id}`, title: `🐉 ${def.name}ปรากฏตัว!`, sub: `${def.lore ?? 'สัตว์ในตำนานโผล่มาแล้ว'} (ทาง${dir})`, color: '#ffcd75', hold: 3400 });
      EventBus.emit('legend:appear', def.id);
      return true;
    }
    return false;
  }

  /** ตัวในตำนานจากไปเมื่อผู้เล่นอยู่ไกลเกิน ~45 วิ · ตั้งหลอด HP เมื่อเข้าใกล้ */
  private manageLegend(dt: number) {
    const s = this.s;
    const m = this.legend;
    if (!m) return;
    if (!m.active) {
      this.legend = null;
      return;
    }
    const d = Phaser.Math.Distance.Between(m.x, m.y, s.player.x, s.player.y);
    if (d < 300 && (!s.boss?.active || s.boss === m)) s.boss = m;
    this.farTime = d > 700 ? this.farTime + dt : 0;
    if (this.farTime >= 42) {
      EventBus.emit('toast', `🌫 ${m.def.name}หายลับไปแล้ว…`, '#a9bccb');
      if (s.boss === m) s.boss = null;
      m.destroy();
      this.legend = null;
    }
  }

  private dirText(dx: number, dy: number) {
    const a = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    const names = ['ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ', 'เหนือ', 'ตะวันออกเฉียงเหนือ'];
    return names[(Math.round(a / 45) + 8) % 8];
  }

  destroy() {
    this.marks.forEach((m) => m.g.destroy());
    this.clouds.forEach((c) => c.mark.destroy());
    this.marks = [];
    this.clouds = [];
  }
}
