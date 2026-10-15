import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { quality } from '../core/Quality';

/**
 * หลอดเลือดเล็กบนหัว (มอน บอส คู่แข่ง ผู้เล่น ยาน) — โผล่เฉพาะตอนต่อสู้
 *  - poke() ตอนโดนตี / โจมตี / เริ่มไล่ → ค้าง 3.5 วิหลังเหตุการณ์ล่าสุด แล้วจางออก 0.3 วิ
 *  - ขนาดเล็ก: ปกติ 14–16 × 2 px · บอส ≤ 28 × 3 px · ขอบเข้ม 1 px · ไม่มีตัวเลข
 *  - แถบขาว "ส่วนที่เพิ่งเสีย" ค้างแป๊บแล้วไหลลง (คุณภาพต่ำ = ไม่มี)
 *  - Graphics ต่อหลอดแบบ pool · วาดใหม่เฉพาะตอนความยาวเปลี่ยน · ไม่มีหลอดที่ซ่อนค้างในลูป
 *  - วางตำแหน่งตอน postupdate (หลังฟิสิกส์ขยับ sprite แล้ว) จึงไม่ตามหลังตัว 1 เฟรม
 */

/** สิ่งที่มีหลอดเลือดได้ (Mob / Player / Vehicle) */
export type BarTarget = Phaser.GameObjects.Sprite & { hp: number };

const SHOW = 3.5;
const FADE = 0.3;
const MAX_BARS = 40;
const OUTLINE = 0x141826;
const BG = 0x2a3042;
const CHIP = 0xf4f4f4;
/** สีตาม % (ซีด ไม่แสบตา): เขียวเซจ → ทอง → แดง */
const fillColor = (r: number) => (r > 0.6 ? 0x8fb573 : r > 0.3 ? 0xd9b45a : 0xc8504f);

class Bar {
  g: Phaser.GameObjects.Graphics;
  t: BarTarget | null = null;
  timer = 0;
  chip = 1;
  chipHold = 0;
  w = 16;
  h = 2;
  yOff = 0;
  boss = false;
  /** ความยาว (px) ที่วาดไว้ล่าสุด — เปลี่ยนเมื่อไรค่อยวาดใหม่ */
  drawnFill = -1;
  drawnChip = -1;
  drawnCol = -1;
  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setVisible(false);
  }
}

export class HealthBars {
  private bars: Bar[] = [];
  private free: Bar[] = [];
  private byTarget = new Map<BarTarget, Bar>();
  private chipAnim = quality() !== 'low';
  private onQuality = () => (this.chipAnim = quality() !== 'low');
  private onHurt = (dmg: number) => {
    const p = (this.scene as Phaser.Scene & { player?: BarTarget }).player;
    if (p) this.poke(p, false, p.hp + dmg);
  };
  private onPost = (_t: number, delta: number) => this.update(Math.min(delta / 1000, 0.1));

  constructor(private scene: Phaser.Scene) {
    scene.events.on('postupdate', this.onPost);
    scene.events.on('player:hurt', this.onHurt);
    EventBus.on('quality', this.onQuality);
    scene.events.once('shutdown', () => {
      scene.events.off('postupdate', this.onPost);
      scene.events.off('player:hurt', this.onHurt);
      EventBus.off('quality', this.onQuality);
      this.byTarget.clear();
    });
  }

  /** มีเหตุต่อสู้ (โดนตี/โจมตี/เริ่มไล่) → แสดง/ต่อเวลาหลอด · boss = หลอดกว้างขึ้น · before = HP ก่อนโดน (แถบขาวเริ่มจากตรงนั้น) */
  poke(t: BarTarget | null | undefined, boss = false, before?: number) {
    if (!t || !t.active) return;
    let b = this.byTarget.get(t);
    if (!b) {
      b = this.free.pop() ?? (this.bars.length + this.free.length < MAX_BARS ? new Bar(this.scene) : undefined);
      if (!b) return;
      b.t = t;
      b.boss = boss;
      b.chip = Phaser.Math.Clamp((before ?? t.hp) / this.maxOf(t), 0, 1);
      b.chipHold = 0;
      b.drawnFill = b.drawnChip = b.drawnCol = -1;
      // ขนาดตามตัว (เล็ก): ปกติ 14–16 · บอส ≤ 28
      b.w = boss ? Math.round(Phaser.Math.Clamp(t.displayWidth * 0.7, 20, 28)) : t.displayWidth > 18 ? 16 : 14;
      b.h = boss ? 3 : 2;
      // คู่แข่งมีป้ายชื่อบนหัว → ยกหลอดขึ้นเหนือป้าย
      b.yOff = t.getData?.('rival') ? 8 : 0;
      b.g.setVisible(true).setAlpha(1);
      this.byTarget.set(t, b);
      this.bars.push(b);
    }
    b.timer = SHOW + FADE;
  }

  private maxOf(t: BarTarget): number {
    const m = (t as { maxHp?: number }).maxHp ?? (t as { def?: { hp?: number } }).def?.hp;
    return Math.max(1, m ?? t.hp);
  }

  private release(i: number) {
    const b = this.bars[i];
    b.g.setVisible(false).clear();
    if (b.t) this.byTarget.delete(b.t);
    b.t = null;
    const last = this.bars.pop()!;
    if (i < this.bars.length) this.bars[i] = last;
    this.free.push(b);
  }

  private update(dt: number) {
    for (let i = this.bars.length - 1; i >= 0; i--) {
      const b = this.bars[i];
      const t = b.t!;
      b.timer -= dt;
      if (b.timer <= 0 || !t.active || t.hp <= 0) {
        this.release(i);
        continue;
      }
      const r = Phaser.Math.Clamp(t.hp / this.maxOf(t), 0, 1);
      // แถบขาว: ค้าง 0.25 วิแล้วไหลลงหา HP จริง (ฟื้นเลือด = ตามทันที)
      if (!this.chipAnim || r >= b.chip) {
        b.chip = r;
        b.chipHold = 0.25;
      } else if ((b.chipHold -= dt) <= 0) b.chip = Math.max(r, b.chip - dt * 0.9);
      const fill = Math.round(r * b.w);
      const chip = Math.round(b.chip * b.w);
      const col = fillColor(r);
      if (fill !== b.drawnFill || chip !== b.drawnChip || col !== b.drawnCol) this.draw(b, fill, chip, col);
      // ตำแหน่ง: เหนือหัวพอดี (คิดจากขนาดที่แสดงจริง รวม HD scale/การยืดตัว)
      const top = t.y - t.displayHeight * t.originY;
      b.g.setPosition(Math.round(t.x - b.w / 2), Math.round(top - 3 - b.h - b.yOff));
      b.g.setDepth(t.depth + 0.6);
      b.g.setAlpha(b.timer < FADE ? b.timer / FADE : 1);
      b.g.setVisible(t.visible);
    }
  }

  private draw(b: Bar, fill: number, chip: number, col: number) {
    const g = b.g;
    b.drawnFill = fill;
    b.drawnChip = chip;
    b.drawnCol = col;
    g.clear();
    g.fillStyle(OUTLINE, 0.9).fillRect(-1, -1, b.w + 2, b.h + 2);
    g.fillStyle(BG, 1).fillRect(0, 0, b.w, b.h);
    if (chip > fill) g.fillStyle(CHIP, 0.9).fillRect(fill, 0, chip - fill, b.h);
    if (fill > 0) g.fillStyle(col, 1).fillRect(0, 0, fill, b.h);
  }
}
