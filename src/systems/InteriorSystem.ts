import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import { MOBS, type MobDef } from '../data/mobs';
import { txt } from '../ui/widgets';
import { SLOT_SIZE } from '../data/islands';
import { DUNGEON_MOBS, INTERIORS, interiorDef, isInterior, type InteriorLayout } from '../world/Interiors';
import type { ResourceNode } from '../entities/ResourceNode';
import type { GameScene } from '../scenes/GameScene';
import type { LightSource } from './LightingSystem';
import type { Mob } from '../entities/Mob';
import { bossArt } from '../ui/art';
import type { BoxTier } from '../data/loot';

const T = 16;

interface Interactable {
  x: number;
  y: number;
  r: number;
  label: string;
  run: () => void;
}

/**
 * ดันเจี้ยนใต้เกาะร้าง: ปากถ้ำบนเกาะ · วาร์ปเข้า/ออก · มอน/หีบ/บอส รีเซ็ตทุกวัน
 * พิชิตเกาะ = ล้มบอสดันเจี้ยนครบทั้ง 3 แห่ง
 */
export class InteriorSystem {
  /** บอสที่โชว์การ์ดเปิดตัวไปแล้ว */
  private announced = new WeakSet<Mob>();
  /** แมพย่อยที่ผู้เล่นอยู่ (null = โลกเกาะปกติ) */
  current: number | null = null;
  private built = new Set<number>();
  readonly spots: Interactable[] = [];
  private torchLights: LightSource[] = [];
  private spawnedDay = new Map<number, number>();
  /** วันที่เกิดมอนล่าสุดจากเซฟ (มอนไม่ได้เซฟ → โหลดแล้วเกิดมอนใหม่ แต่หีบไม่รีเซ็ตซ้ำ) */
  private savedDay = new Map<number, number>();
  /** ดันเจี้ยนที่ล้มบอสได้แล้ว (พิชิต) */
  conquered = new Set<number>();
  private gateLabels = new Map<number, Phaser.GameObjects.Text>();
  private busy = false;

  constructor(private s: GameScene) {}

  /** ในดันเจี้ยน = มืดตลอด */
  get darkness() {
    return this.current !== null && interiorDef(this.current)?.kind === 'dungeon' ? 0.9 : 0;
  }

  lights(): LightSource[] {
    return this.current !== null ? this.torchLights.filter((l) => this.s.world.slotIndexAt(Math.floor(l.x / T), Math.floor(l.y / T)) === this.current) : [];
  }

  /** สร้างทางเข้าบนเกาะ + ถ้าโหลดเซฟมาอยู่ในแมพย่อยก็ตั้งขอบเขตให้ */
  init() {
    for (const p of this.s.world.portals) {
      const d = interiorDef(p.interior)!;
      const x = p.tx * T + 8;
      const y = (p.ty + 1) * T;
      this.sprite(d.entrance, x, y, 48, 40);
      this.gateLabels.set(d.index, this.label(x, y - 44, '', '#ef7d57'));
      this.spots.push({ x, y: y + 6, r: 40, label: `เข้า${d.name}${d.recommend ? ` (แนะนำ ${d.recommend})` : ''}`, run: () => this.enter(d.index) });
    }
    this.refreshGateLabels();
    const p = this.s.player;
    const here = this.s.world.slotIndexAt(Math.floor(p.x / T), Math.floor(p.y / T));
    if (isInterior(here)) this.setInside(here);
  }

  private refreshGateLabels() {
    for (const [i, t] of this.gateLabels) {
      const d = interiorDef(i)!;
      const done = this.conquered.has(i);
      t.setText(`${d.gate}\n${done ? '✔ พิชิตแล้ว' : d.recommend ?? ''}`).setColor(done ? '#a7f070' : '#ef7d57');
    }
  }

  /** ล้มบอสดันเจี้ยน → พิชิตดันเจี้ยนนั้น (ครบ 3 = พิชิตเกาะ) */
  onBossKilled(index: number) {
    if (this.conquered.has(index)) return;
    this.conquered.add(index);
    this.refreshGateLabels();
    const n = this.conquered.size;
    const total = INTERIORS.length;
    const d = interiorDef(index)!;
    Sfx.play('achievement');
    if (n >= total) EventBus.emit('ui:splash', { art: 'conquest', title: '🏆 พิชิตเกาะร้างสำเร็จ!', sub: 'ล้มบอสดันเจี้ยนครบทุกแห่ง — เกาะนี้เป็นของคุณแล้ว', color: '#ffcd75', hold: 4000 });
    else EventBus.emit('banner', `⚔ พิชิต${d.name}แล้ว!`, `พิชิตเกาะ ${n}/${total} — ดันเจี้ยนถัดไปยากขึ้น`, '#a7f070');
  }

  update() {
    const s = this.s;
    const p = s.player;
    const here = s.world.slotIndexAt(Math.floor(p.x / T), Math.floor(p.y / T));
    if (isInterior(here) && this.current !== here && !this.busy) this.setInside(here);
    else if (!isInterior(here) && this.current !== null && !this.busy) this.resetToWorld();
    // แถบเลือดบอสดันเจี้ยนเมื่อเข้าใกล้
    if (this.current !== null && (!s.boss || s.boss.getData('dungeon') !== undefined)) {
      const boss = s.mobList().find((m) => m.getData('boss') && m.getData('dungeon') === this.current && Phaser.Math.Distance.Between(m.x, m.y, p.x, p.y) < 300);
      if (boss && !this.announced.has(boss)) {
        this.announced.add(boss);
        EventBus.emit('ui:splash', { art: bossArt(boss.def.id) ?? 'dungeon_3', title: `👑 ${boss.def.name}`, sub: 'บอสดันเจี้ยนปรากฏตัว! ล้มให้ได้เพื่อพิชิตดันเจี้ยนนี้', color: '#ef7d57' });
      }
      if (boss) s.boss = boss;
      else if (s.boss && s.boss.getData('dungeon') !== undefined) s.boss = null;
    }
  }

  /** กลับโลกเกาะแบบไม่วาร์ป (เช่น ตายในดันเจี้ยนแล้วไปเกิดที่บ้าน) */
  resetToWorld() {
    this.current = null;
    this.applyBounds(null);
    if (this.s.boss?.getData('dungeon') !== undefined) this.s.boss = null;
  }

  /** สิ่งที่กด E ได้ใกล้ตัว (ปากถ้ำ/ทางออก) */
  interactAt(): Interactable | null {
    const p = this.s.player;
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.spots) {
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, it.x, it.y);
      if (d < it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------
  // วาร์ป
  // ------------------------------------------------------------------
  enter(index: number) {
    if (this.busy) return;
    const w = this.s.world;
    w.ensureSlot(index);
    const L = w.layouts.get(index)!;
    this.fade(() => {
      this.s.player.setPosition(L.entry.tx * T + 8, L.entry.ty * T + 8);
      this.setInside(index);
      const d = interiorDef(index)!;
      EventBus.emit('ui:splash', { art: `dungeon_${d.tier ?? 1}`, title: d.name, sub: `${d.desc}${this.conquered.has(index) ? ' · ✔ พิชิตแล้ว' : ''}`, color: '#a77bdb' });
      Sfx.play(d.kind === 'dungeon' ? 'thunder' : 'achievement');
    });
  }

  leave() {
    if (this.busy || this.current === null) return;
    const portal = this.s.world.portals.find((p) => p.interior === this.current);
    const sp = this.s.world.spawn;
    this.fade(() => {
      const tx = portal ? portal.tx : sp.tx;
      const ty = portal ? portal.ty + 3 : sp.ty;
      this.s.player.setPosition(tx * T + 8, ty * T + 8);
      this.current = null;
      this.applyBounds(null);
      Sfx.play('step');
    });
  }

  private fade(mid: () => void) {
    this.busy = true;
    const cam = this.s.cameras.main;
    cam.fadeOut(220, 11, 13, 31);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      mid();
      cam.fadeIn(260, 11, 13, 31);
      this.busy = false;
    });
  }

  private setInside(index: number) {
    this.current = index;
    this.s.world.ensureSlot(index);
    this.build(index);
    this.applyBounds(index);
    const d = interiorDef(index)!;
    if (d.kind === 'dungeon') this.spawnDungeon(index);
  }

  private applyBounds(index: number | null) {
    const s = this.s;
    const cam = s.cameras.main;
    if (index === null) {
      const b = s.world.bounds;
      s.physics.world.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
      cam.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
      return;
    }
    const o = s.world.slotOrigin(index);
    s.physics.world.setBounds(o.x * T, o.y * T, SLOT_SIZE * T, SLOT_SIZE * T);
    cam.setBounds(o.x * T, o.y * T, SLOT_SIZE * T, SLOT_SIZE * T);
  }

  // ------------------------------------------------------------------
  // สร้างวัตถุในแมพย่อย (ครั้งแรกที่เข้า)
  // ------------------------------------------------------------------
  private build(index: number) {
    if (this.built.has(index)) return;
    this.built.add(index);
    const L = this.s.world.layouts.get(index)!;
    const d = interiorDef(index)!;
    // ทางออก
    const ex = L.exit.tx * T + 8;
    const ey = (L.exit.ty + 1) * T;
    if (d.kind === 'dungeon') {
      const spr = this.sprite('dungeon_exit', ex, ey, 32, 32);
      if (this.s.anims.exists('dungeon_exit_glow')) (spr as Phaser.GameObjects.Sprite).play('dungeon_exit_glow');
      this.label(ex, ey - 36, '⬆ ทางออก', '#a7f070');
      this.torchLights.push({ x: ex, y: ey - 10, radius: 80 });
    }
    this.spots.push({ x: ex, y: ey + 6, r: 40, label: 'กลับไปเกาะของคุณ', run: () => this.leave() });

    if (d.kind === 'dungeon') {
      for (const t of L.torches) {
        const x = t.tx * T + 8;
        const y = (t.ty + 1) * T;
        const spr = this.sprite('torch_wall', x, y, 12, 24);
        if (this.s.anims.exists('torch_wall_burn')) (spr as Phaser.GameObjects.Sprite).play('torch_wall_burn');
        this.torchLights.push({ x, y: y - 12, radius: 76 });
      }
      // ของตกแต่งในห้อง
      const rng = new Phaser.Math.RandomDataGenerator([String(index)]);
      for (const r of L.rooms.slice(1)) {
        for (let i = 0; i < 2; i++) {
          const tex = rng.pick(['bones_pile', 'cobweb', 'crystal_cluster', 'skull_pillar']);
          const x = (r.cx + rng.between(-r.w / 2 + 2, r.w / 2 - 2)) * T;
          const y = (r.cy + rng.between(-r.h / 2 + 2, r.h / 2 - 2)) * T;
          this.sprite(tex, x, y, 20, 20, tex === 'skull_pillar');
          if (tex === 'crystal_cluster') this.torchLights.push({ x, y: y - 8, radius: 46 });
        }
      }
    }
  }

  /** รูป (มี fallback ถ้า texture ยังไม่มี) + กันเดินทะลุฐาน */
  private sprite(key: string, x: number, y: number, w: number, h: number, solid = false) {
    const s = this.s;
    let o: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
    if (s.textures.exists(key)) o = s.add.sprite(x, y, key, 0).setOrigin(0.5, 1);
    else o = s.add.rectangle(x, y, w, h, 0x566c86).setOrigin(0.5, 1).setStrokeStyle(1, 0x1a1c2c);
    o.setDepth(y);
    if (solid) {
      const bw = (o.displayWidth || w) * 0.8;
      const z = s.add.zone(x, y - 6, bw, 12);
      s.physics.add.existing(z, true);
      s.addBlocker(z);
    }
    return o;
  }

  private label(x: number, y: number, text: string, color: string) {
    return txt(this.s, x, y, text, 9, color, { align: 'center' }).setOrigin(0.5, 1).setStroke('#0b0d1f', 3).setResolution(4).setDepth(y + 2000);
  }

  // ------------------------------------------------------------------
  // ดันเจี้ยน: มอน/บอสเกิดใหม่ทุกวัน (เมื่อเข้าไป) · หีบให้กล่องตามระดับ
  // ------------------------------------------------------------------
  private scaled(id: string, mult: number, boss = false): string {
    if (mult === 1 && !boss) return id;
    const key = `${id}@${mult}${boss ? 'B' : ''}`;
    if (!MOBS[key]) {
      const b = MOBS[id];
      const m = boss && b.ai !== 'boss' ? mult * 3 : mult;
      MOBS[key] = {
        ...b, id: key, name: boss && b.ai !== 'boss' ? `${b.name}ยักษ์ (บอสดันเจี้ยน)` : b.name,
        hp: Math.round(b.hp * m), attack: Math.round(b.attack * Math.sqrt(m) * 1.1), xp: Math.round(b.xp * m),
        scale: boss && b.ai !== 'boss' ? (b.scale ?? 1) * 1.6 : b.scale,
      } as MobDef;
    }
    return key;
  }

  private spawnDungeon(index: number) {
    const day = this.s.dayNight.day;
    if (this.spawnedDay.get(index) === day) return;
    this.spawnedDay.set(index, day);
    const restock = this.savedDay.get(index) !== day;
    const s = this.s;
    // ล้างมอนเก่าของดันเจี้ยนนี้
    for (const m of s.mobList()) if (m.getData('dungeon') === index) m.destroy();
    const L: InteriorLayout = s.world.layouts.get(index)!;
    const d = interiorDef(index)!;
    const conf = DUNGEON_MOBS[d.tier ?? 1];
    const rng = new Phaser.Math.RandomDataGenerator([`${index}:${day}`]);
    L.rooms.slice(1).forEach((r) => {
      if (rng.frac() < 0.3) return; // บางห้องว่าง (มีแต่ของ)
      const n = rng.between(1, 2) + (d.tier ?? 1) - 1;
      for (let i = 0; i < n; i++) {
        const id = this.scaled(rng.pick(conf.mobs), conf.mult);
        const x = (r.cx + rng.between(-r.w / 2 + 2, r.w / 2 - 2)) * T;
        const y = (r.cy + rng.between(-r.h / 2 + 2, r.h / 2 - 2)) * T;
        s.spawnMob(id, x, y).setData('dungeon', index);
      }
    });
    if (L.boss) s.spawnMob(this.scaled(conf.boss, conf.mult, true), L.boss.tx * T, L.boss.ty * T).setData('dungeon', index).setData('boss', true);
    // หีบเกิดใหม่
    if (restock) for (const n of s.world.nodes) if (s.world.slotIndexAt(n.tx, n.ty) === index && n.type === 'ruin_chest' && !n.available) n.regrowAt = 0;
  }

  /** เปิดหีบในดันเจี้ยน → กล่องตามระดับดันเจี้ยน */
  /** คืน true ถ้าเป็นหีบดันเจี้ยน (ให้กล่องตามระดับแทนกล่องปกติ) */
  onNodePicked(node: ResourceNode): boolean {
    if (node.kind !== 'ruin_chest') return false;
    const idx = this.s.world.slotIndexAt(node.tx, node.ty);
    const d = interiorDef(idx);
    if (d?.kind !== 'dungeon') return false;
    // ดันเจี้ยนอยู่ใต้เกาะเรา → เพดานกล่องไม้ (ดู GameScene.capBox)
    this.s.spawnDrop(node.x, node.baseY, this.s.capBox(DUNGEON_MOBS[d.tier ?? 1].box as BoxTier, 'chest', node.x, node.baseY), 1);
    return true;
  }

  serialize() {
    return { spawnedDay: [...new Map([...this.savedDay, ...this.spawnedDay])], conquered: [...this.conquered] };
  }

  load(d: { spawnedDay?: [number, number][]; conquered?: number[] } | undefined) {
    if (!d) return;
    this.savedDay = new Map(d.spawnedDay ?? []);
    this.conquered = new Set(d.conquered ?? []);
  }
}
