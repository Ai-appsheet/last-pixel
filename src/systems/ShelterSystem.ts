import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { shelterTiles } from '../data/shelter';
import type { Structure } from '../entities/Structure';
import type { GameScene } from '../scenes/GameScene';

export { IMPACT_MULT, MATERIAL_NAME, QUAKE, burnable, materialOf, shelterTiles, type StructMaterial } from '../data/shelter';

/**
 * 🏠 บ้านปลอดภัย
 * - เขตปลอดภัย (shelter): สิ่งก่อสร้างที่นอนได้ของเรา "บนเกาะบ้าน" สร้างวงรัศมีตามขนาด/ขั้น + เลเวลอัพเกรด
 *   ในวง: ไม่มีมอนเกิดเอง · ภัยกลางวันไม่เล็งเข้ามา (ฟ้าผ่า/อุกกาบาตสุ่มจุดใหม่นอกวง · ความร้อน/หนาวไม่มีผล · แผ่นดินไหวเบาลงครึ่ง)
 *   อยู่ในวงและไม่โดนตี 5 วิ = ฟื้น HP +1/วิ + สติ +0.5/วิ · ภัยกลางคืนยังบุกมาตามปกติ (ต้องทุบกำแพงเข้ามา)
 * - วัสดุโครงสร้าง: ไม้ / หิน-อิฐ / เหล็ก — รับแรงกระแทกจากภัย (แผ่นดินไหว ฟ้าผ่า อุกกาบาต) ×1 / ×0.6 / ×0.4 · ไฟป่าไหม้เฉพาะของไม้/หญ้า
 * ตัวเลข/สูตร (ไม่ผูก Phaser) อยู่ที่ data/shelter.ts
 */
export interface Shelter {
  st: Structure;
  x: number;
  y: number;
  /** รัศมี (px) */
  r: number;
}

export class ShelterSystem {
  list: Shelter[] = [];
  /** เขตที่ผู้เล่นยืนอยู่ (null = ไม่อยู่) */
  inside: Shelter | null = null;
  /** วินาทีที่ไม่โดนดาเมจ */
  private calm = 0;
  private lastHp = 0;
  private timer = 0;
  private count = -1;
  private toastAt = -999;
  private g: Phaser.GameObjects.Graphics;
  private drawKey = '';

  constructor(private s: GameScene) {
    this.g = s.add.graphics().setDepth(-5.5);
    this.lastHp = s.player.hp;
  }

  /** สร้างรายการเขตใหม่ (ทุก 1 วิ หรือเมื่อจำนวนสิ่งก่อสร้างเปลี่ยน) */
  refresh() {
    const s = this.s;
    const home = s.world.home;
    this.list = [];
    for (const st of s.structureList()) {
      if (!st.def.sleep || !st.active || st.getData('foreign') || s.world.slotIndexAt(st.tx, st.ty) !== home) continue;
      this.list.push({ st, x: st.x, y: st.y - st.def.h * 8, r: shelterTiles(st.def, st.lv) * 16 });
    }
  }

  /** จุดนี้อยู่ในเขตปลอดภัยไหม */
  at(x: number, y: number): Shelter | null {
    for (const h of this.list) if (h.st.active && (x - h.x) ** 2 + (y - h.y) ** 2 < h.r * h.r) return h;
    return null;
  }

  /** สุ่มจุดใหม่จนกว่าจะอยู่นอกเขต (คืน null ถ้าหาไม่ได้) */
  outside(pick: () => { x: number; y: number }, tries = 8): { x: number; y: number } | null {
    for (let i = 0; i < tries; i++) {
      const p = pick();
      if (!this.at(p.x, p.y)) return p;
    }
    return null;
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    this.timer -= dt;
    const n = s.structureList().length;
    if (this.timer <= 0 || n !== this.count) {
      this.timer = 1;
      this.count = n;
      this.refresh();
    }
    if (p.hp < this.lastHp - 0.01) this.calm = 0;
    else this.calm += dt;
    const was = this.inside;
    // อยู่ในห้องบ้าน (HomeSystem) = อยู่ในเขตของบ้านหลังนั้น (ภัย/อากาศข้างนอกไม่มีผล)
    const room = s.homes?.house;
    this.inside = room ? this.list.find((h) => h.st === room) ?? null : !p.dead && !s.riding && s.interiors.current === null ? this.at(p.x, p.feetY) : null;
    if (this.inside && !was && !room && s.worldTime - this.toastAt > 30) {
      this.toastAt = s.worldTime;
      EventBus.emit('toast', `🏠 อยู่ในเขตปลอดภัยของ${this.inside.st.def.name} — ไม่มีมอนเกิด · ภัยกลางวันไม่เข้ามา · พักแล้วฟื้นพลัง`, '#a7f070');
    }
    if (this.inside && this.calm >= 5 && !p.dead) {
      if (p.hunger > 0 && p.thirst > 0) p.heal(dt);
      p.sanity = Math.min(100, p.sanity + 0.5 * dt);
    }
    this.lastHp = p.hp;
    this.draw();
  }

  /** วงเขตปลอดภัย: โหมดสร้าง = ทุกหลัง · ชี้/อยู่ใกล้บ้าน = หลังนั้น · กำลังวางบ้าน = พรีวิววงของหลังใหม่ */
  private draw() {
    const s = this.s;
    const b = s.build;
    let show: Shelter[] = [];
    if (b.on) show = this.list;
    else {
      const f = s.inspect.focus;
      const h = f?.def.sleep ? this.list.find((x) => x.st === f) : undefined;
      if (h) show = [h];
    }
    let ghost: { x: number; y: number; r: number } | null = null;
    const def = b.active;
    if (def?.sleep && !s.controls.touchMode) {
      const wp = s.pointerWorld();
      if (wp) {
        const { tx, ty } = b.anchor(wp.x, wp.y, def);
        ghost = { x: (tx + def.w / 2) * 16, y: (ty + def.h / 2) * 16, r: shelterTiles(def) * 16 };
      }
    }
    const key = show.map((h) => `${h.x},${h.y},${h.r}`).join('|') + (ghost ? `|g${ghost.x},${ghost.y},${ghost.r}` : '');
    if (key === this.drawKey) return;
    this.drawKey = key;
    const g = this.g.clear();
    for (const h of show) this.circle(g, h.x, h.y, h.r, 0xa7f070);
    if (ghost) this.circle(g, ghost.x, ghost.y, ghost.r, 0x73eff7);
  }

  /** วงจางๆ + เส้นประ */
  private circle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, color: number) {
    g.fillStyle(color, 0.07).fillCircle(x, y, r);
    g.lineStyle(1, color, 0.6);
    const n = Math.max(24, Math.round(r / 3)) & ~1;
    for (let i = 0; i < n; i += 2) {
      g.beginPath();
      g.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      g.strokePath();
    }
  }

  destroy() {
    this.g.destroy();
  }
}
