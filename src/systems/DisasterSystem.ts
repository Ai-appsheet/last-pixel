import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { DISASTERS, disasterForDay, resolveDisaster, type DisasterDef } from '../data/disasters';
import type { BoxTier } from '../data/loot';
import type { GameScene } from '../scenes/GameScene';
import { isWater } from '../world/tiles';
import { MOBS, mobSwims } from '../data/mobs';
import { bossArt } from '../ui/art';
import { ScreenTint } from './BiomeSystem';

/**
 * ภัยพิบัติประจำคืน: เตือนตอนพลบค่ำ → กลางคืนปล่อยมอนสเตอร์เป็นระลอก (+ ฝนอุกกาบาต)
 * ต้านไว้ได้ (ฆ่าหมด หรือรอดจนเช้า) = ได้กล่องรางวัลตามวัน
 * เกาะกลางไม่มีภัย — ถ้าอยู่เกาะกลาง ภัยจะลงที่เกาะของคุณ (กลับไปป้องกันฐาน!)
 */
export class DisasterSystem {
  current: DisasterDef | null = null;
  active = false;
  wave = 0;
  survived = 0;
  private waveTimer = 0;
  private meteorTimer = 0;
  private queue: string[] = [];
  private spawnTimer = 0;
  private bossSpawned = false;
  /** หมอกคืนผี */
  private fog: ScreenTint;
  /** ?raid=<id> บังคับภัยคืนแรกที่มาถึง (ทดสอบ) */
  private forced: string | null = null;

  constructor(private scene: GameScene) {
    this.fog = new ScreenTint(scene, 1e6 + 1);
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('raid') : null;
    if (q && DISASTERS.some((d) => d.id === q)) this.forced = q;
  }

  /** สีความมืดพิเศษ (คืนหมอกผี) — จันทร์เลือดใช้ฟ้าแดงของ LightingSystem */
  get darkTint(): number | undefined {
    return this.active && this.current?.special === 'fog' ? 0x10182a : undefined;
  }

  /** ภัยของคืนนี้ (รวมตัวบังคับทดสอบ) */
  private pick(day: number): DisasterDef {
    const seed = this.scene.world.seed;
    const f = this.forced && DISASTERS.find((d) => d.id === this.forced);
    this.forced = null;
    return f ? resolveDisaster(f, day, seed) : disasterForDay(day, seed);
  }

  /** สถานะสำหรับ HUD */
  get status(): string | null {
    if (this.scene.inGrace && !this.active) return `🛡 ช่วงตั้งหลัก — ภัยพิบัติเริ่มในอีก ${Math.ceil(this.scene.graceLeft / 60)} นาที`;
    if (!this.active && this.scene.hazards?.current) return this.scene.hazards.status;
    if (!this.current) return this.scene.hazards?.status ?? null;
    if (!this.active) return `คืนนี้: ${this.current.name}`;
    const left = this.scene.mobList().filter((m) => m.disaster).length + this.queue.length;
    return `⚠ ${this.current.name} — ระลอก ${this.wave}/${this.current.waves.length} · ศัตรูเหลือ ${left}`;
  }

  onDusk(day: number) {
    if (this.scene.inGrace) return;
    this.current = this.pick(day);
    this.scene.dayNight.bloodMoon = this.current.special === 'blood';
    EventBus.emit('disaster:warn', this.current);
    Sfx.play('horn');
  }

  onNight(day: number) {
    if (this.scene.inGrace) return;
    if (!this.current) this.current = this.pick(day);
    this.scene.dayNight.bloodMoon = this.current.special === 'blood';
    this.active = true;
    this.wave = 0;
    this.waveTimer = 0;
    this.bossSpawned = false;
    EventBus.emit('ui:splash', { art: this.current.art ?? 'raid_night', title: `🌙 ${this.current.name}`, sub: `${this.current.warning} — ป้องกันฐานให้รอดถึงเช้า`, color: this.current.color });
  }

  onDawn() {
    this.scene.dayNight.bloodMoon = false;
    if (!this.active) return;
    this.finish(true);
  }

  private finish(byDawn: boolean) {
    const d = this.current;
    this.active = false;
    this.current = null;
    this.queue = [];
    this.scene.dayNight.bloodMoon = false;
    for (const m of this.scene.mobList()) if (m.disaster && !m.isBoss) m.burning = true;
    if (!d) return;
    this.survived++;
    const day = this.scene.dayNight.day;
    // เพดานกล่อง: นอกเขตผจญภัย (เกาะเรา) คืนบอส = กล่องเหล็ก · คืนอื่น = กล่องไม้ · ในเขตผจญภัยได้ตามตารางเดิม
    const tier: BoxTier = this.scene.capBox(d.boss ? (day >= 10 ? 'box_legend' : 'box_gold') : day >= 12 ? 'box_gold' : day >= 5 ? 'box_iron' : 'box_wood', d.boss ? 'boss' : 'disaster');
    this.scene.spawnRewardChest(tier);
    EventBus.emit('disaster:survived');
    EventBus.emit('toast', byDawn ? `☀ รอดจาก${d.name}! ได้รับ${tier === 'box_legend' ? 'กล่องเพชร' : tier === 'box_gold' ? 'กล่องทอง' : tier === 'box_iron' ? 'กล่องเหล็ก' : 'กล่องไม้'}` : `ต้าน${d.name}สำเร็จ!`, '#ffcd75');
    Sfx.play('levelUp');
  }

  update(dt: number) {
    const s = this.scene;
    const d = this.current;
    this.fog.update(dt, 0xa8b0c8, this.active && d?.special === 'fog' ? (s.shelter.inside ? 0.12 : 0.3) : 0);
    if (!this.active || !d) return;
    const day = s.dayNight.day;

    // ระลอกถัดไป
    this.waveTimer -= dt;
    const alive = s.mobList().filter((m) => m.disaster).length;
    if (this.wave < d.waves.length && (this.waveTimer <= 0 || (alive === 0 && this.queue.length === 0))) {
      const mult = 1 + (day - 1) * 0.15;
      for (const [id, n] of d.waves[this.wave]) {
        const count = Math.max(1, Math.round(n * mult));
        for (let i = 0; i < count; i++) this.queue.push(id);
      }
      this.wave++;
      this.waveTimer = 35;
      EventBus.emit('toast', `ระลอกที่ ${this.wave}!`, d.color);
    }
    if (this.wave === d.waves.length && d.boss && !this.bossSpawned && this.queue.length === 0) {
      this.bossSpawned = true;
      this.queue.push(d.boss);
      const legend = MOBS[d.boss]?.legendary;
      EventBus.emit('ui:splash', {
        art: legend ? `legend_${d.boss}` : bossArt(d.boss) ?? d.art ?? 'raid_night',
        title: `👑 ${MOBS[d.boss]?.name ?? 'บอส'}${legend ? 'นำทัพบุก' : 'ปรากฏตัว'}!`,
        sub: legend ? `${MOBS[d.boss]?.lore ?? ''} — ล้มให้ได้เพื่อรับกล่องเพชร` : 'บอสแห่งค่ำคืนมาแล้ว — ล้มให้ได้เพื่อรับกล่องรางวัลใหญ่',
        color: '#ef7d57',
      });
    }

    // ปล่อยมอนทีละตัว
    this.spawnTimer -= dt;
    if (this.queue.length && this.spawnTimer <= 0) {
      this.spawnTimer = 0.45;
      const id = this.queue.shift()!;
      const pos = this.spawnPoint(d, id);
      if (pos) {
        const m = s.spawnMob(id, pos.x, pos.y);
        m.disaster = true;
        if (m.isBoss) s.boss = m;
        s.fx.poof(pos.x, pos.y, 0x5d275d, 6);
      }
    }

    // ฝนอุกกาบาต
    if (d.special === 'meteor') {
      this.meteorTimer -= dt;
      if (this.meteorTimer <= 0) {
        this.meteorTimer = Phaser.Math.FloatBetween(1.2, 2.6);
        s.dropMeteor();
      }
    }

    // จบเมื่อปล่อยครบ + ฆ่าหมด
    if (this.wave === d.waves.length && this.queue.length === 0 && alive === 0 && (!d.boss || this.bossSpawned)) this.finish(false);
  }

  /** จุดเกิดรอบเกาะที่จะโดนบุก (เกาะที่ผู้เล่นอยู่ หรือเกาะบ้านถ้าอยู่เกาะกลาง/ทะเล) */
  private spawnPoint(d: DisasterDef, id: string): { x: number; y: number } | null {
    const s = this.scene;
    const p = s.player;
    // ลอยอยู่บนบก (ยานบิน) ไม่นับว่าปลอดภัย — ต้องอยู่เหนือน้ำจริง
    const overWater = isWater(s.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16)));
    const atSafe = s.playerSafe || (s.boatRiding && overWater) || s.interiors.current !== null;
    const is = atSafe ? s.world.homeIsland : s.world.slots[Math.max(0, s.world.islandAt(Math.floor(p.x / 16), Math.floor(p.y / 16)))] ?? s.world.homeIsland;
    const cx = atSafe ? is.cx * 16 : p.x;
    const cy = atSafe ? is.cy * 16 : p.y;
    const def = MOBS[id];
    const swims = !!def && mobSwims(def);
    const wantWater = swims || (d.from === 'sea' && Math.random() < 0.3);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = d.from === 'sea' ? (is.r + Phaser.Math.Between(-3, 1)) * 16 : Phaser.Math.Between(170, 240);
      const x = (d.from === 'sea' ? is.cx * 16 : cx) + Math.cos(a) * r;
      const y = (d.from === 'sea' ? is.cy * 16 : cy) + Math.sin(a) * r;
      const tx = Math.floor(x / 16);
      const ty = Math.floor(y / 16);
      const t = s.tileAt(tx, ty);
      if (s.isSafeTile(tx, ty)) continue;
      if (i < 24 && s.shelter.at(x, y)) continue; // เกิดนอกเขตบ้าน — ต้องบุกทะลุกำแพงเข้ามาเอง (ไม่โผล่กลางบ้าน)
      if (id === 'bat' || d.from === 'sky') return { x, y };
      if (wantWater ? !isWater(t) : isWater(t) || s.isTileBlocked(tx, ty)) continue;
      return { x, y };
    }
    return null;
  }

  serialize() {
    return { survived: this.survived };
  }
}
