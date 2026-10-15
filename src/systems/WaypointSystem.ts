import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import type { GameScene } from '../scenes/GameScene';

/**
 * จุดหมายจากแผนที่ — คลิกหมุดบนแผนที่ใหญ่ (ดันเจี้ยน เกาะกลาง เกาะมหาสมบัติ เกาะกิจกรรม เกาะอื่น) = ตั้งจุดหมาย
 * ลูกศรสีฟ้ารอบตัวผู้เล่นชี้ทาง + ระยะ (ช่อง) · ถึงแล้ว (≤ 3 ช่อง) หรือคลิกหมุดเดิมซ้ำ = ยกเลิก
 * ระบบเดิน/คลิกเดิน (MouseMove) อ่าน `target` ไปใช้หาทางบนบกได้ · กลางทะเลมีแค่ลูกศร
 */
export interface Waypoint {
  x: number;
  y: number;
  name: string;
  color: number;
}

export class WaypointSystem {
  target: Waypoint | null = null;
  private arrow: Phaser.GameObjects.Container;
  private gfx: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;

  constructor(private s: GameScene) {
    this.gfx = s.add.graphics();
    this.label = s.add.text(0, -18, '', { fontFamily: '"Noto Sans Thai", Tahoma, sans-serif', fontSize: '8px', fontStyle: '600', color: '#73eff7', stroke: '#0b0d1f', strokeThickness: 3 }).setOrigin(0.5).setResolution(2);
    this.arrow = s.add.container(0, 0, [this.gfx, this.label]).setDepth(1e6 - 2).setVisible(false);
  }

  /** ตั้งจุดหมาย (พิกเซลโลก) — ตั้งที่เดิมซ้ำ = ยกเลิก */
  set(x: number, y: number, name: string, color = 0x73eff7) {
    if (this.target && Math.hypot(this.target.x - x, this.target.y - y) < 8) return this.clear(true);
    this.target = { x, y, name, color };
    this.gfx.clear().fillStyle(color, 1).fillTriangle(10, 0, -6, -7, -6, 7).lineStyle(2, 0x0b0d1f, 1).strokeTriangle(10, 0, -6, -7, -6, 7);
    Sfx.play('click');
    EventBus.emit('toast', `🧭 ตั้งจุดหมาย: ${name} — ตามลูกศรสีฟ้า`, '#73eff7');
  }

  clear(announce = false) {
    this.target = null;
    this.arrow.setVisible(false);
    if (announce) EventBus.emit('toast', '🧭 ยกเลิกจุดหมาย', '#94b0c2');
  }

  update(_dt: number) {
    const t = this.target;
    if (!t) return;
    const p = this.s.player;
    const d = Phaser.Math.Distance.Between(p.x, p.feetY, t.x, t.y);
    if (d < 48) {
      EventBus.emit('toast', `🧭 ถึง${t.name}แล้ว`, '#a7f070');
      this.clear();
      return;
    }
    const a = Math.atan2(t.y - p.feetY, t.x - p.x);
    this.arrow.setVisible(!p.dead).setPosition(p.x + Math.cos(a) * 38, p.feetY - 6 + Math.sin(a) * 38);
    this.gfx.setRotation(a);
    this.label.setText(`🧭 ${t.name} · ${Math.round(d / 16)} ช่อง`);
  }
}
