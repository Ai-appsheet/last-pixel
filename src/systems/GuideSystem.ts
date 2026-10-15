import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { MetaSave } from '../core/MetaSave';
import { CENTER_SLOT } from '../core/RoomService';
import { NODE_SPECS } from '../entities/ResourceNode';
import { isWater } from '../world/tiles';
import type { GameScene } from '../scenes/GameScene';

const T = 16;

/** คำแนะนำมือใหม่ — โชว์ครั้งเดียวต่อบัญชี เมื่อเจอสถานการณ์นั้นครั้งแรก */
const TIPS: Record<string, string> = {
  night: '🌙 ค่ำแล้ว — มองเห็นน้อยลง มอนออกมากขึ้น · อยู่ใกล้กองไฟหรือในเขตบ้าน (ปลอดภัย + ฟื้นเลือด)',
  box: '📦 ได้กล่อง! เลือกกล่องในช่องของแล้วกด F เพื่อเปิด',
  blueprint: '📐 ได้แปลนใหม่! กด B เปิดสมุดแปลน ดูว่าต้องหาอะไรมาสร้าง',
  dungeon: '⛏ ปากถ้ำดันเจี้ยน — เดินเข้าใกล้แล้วกด E · ล้มบอสครบ 3 ด่าน = พิชิตเกาะ',
  hungry: '🍖 เริ่มหิว/กระหาย — กินอาหาร (F) หรือยืนริมน้ำแล้วกด E เพื่อดื่ม',
  hurt: '❤ เลือดเหลือน้อย! ถอยเข้าเขตบ้าน หรือกด Q ปฐมพยาบาล',
};

/**
 * ตัวช่วยมือใหม่ (เบาๆ ไม่รก):
 * 1) การ์ดปุ่มพื้นฐานครั้งแรกที่เข้าเกม
 * 2) ลูกศรเล็กรอบตัวชี้ไปยังเป้าหมายของบทสอน (ต้นไม้ / กล่องเสบียง / ริมน้ำ / เกาะกลาง)
 * 3) คำแนะนำสั้นๆ ครั้งแรกที่เจอสถานการณ์ (ค่ำ ได้กล่อง ได้แปลน เจอดันเจี้ยน หิว เลือดน้อย)
 */
export class GuideSystem {
  private arrow: Phaser.GameObjects.Container;
  private arrowTxt: Phaser.GameObjects.Text;
  private target: { x: number; y: number; label: string } | null = null;
  private retarget = 0;
  private shown: Set<string>;
  private offs: (() => void)[] = [];

  constructor(private s: GameScene) {
    this.shown = new Set(MetaSave.load().tips ?? []);
    const g = s.add.graphics();
    // ลูกศรนำทางเล็กๆ (ผู้ใช้ขอให้เล็กกว่าตัวละครชัดเจน)
    g.fillStyle(0xffcd75, 1).fillTriangle(6, 0, -4, -4, -4, 4);
    g.lineStyle(2, 0x0b0d1f, 0.9).strokeTriangle(10, 0, -6, -7, -6, 7);
    this.arrowTxt = s.add.text(0, -11, '', { fontFamily: '"Noto Sans Thai", Tahoma, sans-serif', fontSize: '7px', fontStyle: '500', color: '#ffcd75', stroke: '#0b0d1f', strokeThickness: 2 }).setOrigin(0.5).setResolution(3);
    this.arrow = s.add.container(0, 0, [g, this.arrowTxt]).setDepth(1e6 - 3).setVisible(false);
    s.tweens.add({ targets: g, x: 4, duration: 450, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.offs.push(() => EventBus.off(ev, fn));
    };
    on('night:start', () => this.tip('night'));
    on('pickup', (id: string) => {
      if (id.startsWith('box_')) this.tip('box');
      if (id.startsWith('bp_')) this.tip('blueprint');
    });
  }

  get active() {
    const q = this.s.quests?.current;
    return !this.s.showcase && !!q && q.chapter === 0;
  }

  /** การ์ดปุ่มพื้นฐาน (เรียกครั้งเดียวตอนเริ่มเกมใหม่) */
  showControls() {
    if (this.shown.has('controls')) return;
    this.mark('controls');
    const touch = this.s.controls.touchMode;
    const pad = this.s.controls.padMode;
    const lines = touch
      ? ['🕹 จอยซ้าย = เดิน (ดันสุด = วิ่ง)', '⚔ ปุ่มโจมตี = ตี/ตัดไม้/ขุด', '✋ ปุ่มใช้ = เก็บ/คุย/เข้าประตู', '🎒 แถบบน = กระเป๋า · 📐 แปลน · 🗺 แผนที่']
      : pad
        ? ['🕹 อนาล็อกซ้าย = เดิน · RT = ตี', 'Ⓐ = ใช้/เก็บ/เข้าประตู · Ⓧ = กิน/เปิดกล่อง', 'Back = กระเป๋า · Start = เมนู']
        : ['WASD = เดิน · Shift = วิ่ง · คลิกซ้าย = ตี/ตัด/ขุด', 'E = ใช้/เก็บ/เข้าประตู · F = กิน/เปิดกล่อง', 'Tab = กระเป๋า · B = สมุดแปลน · M = แผนที่', 'ทำตาม "เป้าหมาย" มุมขวา — มีลูกศรชี้ทาง'];
    EventBus.emit('ui:guide', '🎮 ปุ่มพื้นฐาน', lines);
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    // คำแนะนำตามสถานการณ์
    if (p.hunger < 30 || p.thirst < 30) this.tip('hungry');
    if (p.hp < p.maxHp * 0.35 && p.hp > 0) this.tip('hurt');
    if (!this.shown.has('dungeon') && s.interiors.current === null) {
      const near = s.interiors.spots.some((sp) => Phaser.Math.Distance.Between(p.x, p.feetY, sp.x, sp.y) < 130);
      if (near) this.tip('dungeon');
    }
    // ลูกศรชี้เป้าหมายบทสอน
    if (!this.active || s.interiors.current !== null) {
      this.arrow.setVisible(false);
      return;
    }
    this.retarget -= dt;
    if (this.retarget <= 0) {
      this.retarget = 0.6;
      this.target = this.findTarget();
    }
    const t = this.target;
    const d = t ? Phaser.Math.Distance.Between(p.x, p.feetY, t.x, t.y) : 0;
    if (!t || d < 56) {
      this.arrow.setVisible(false);
      return;
    }
    const a = Math.atan2(t.y - p.feetY, t.x - p.x);
    this.arrow.setVisible(true).setPosition(p.x + Math.cos(a) * 30, p.feetY - 8 + Math.sin(a) * 30);
    (this.arrow.list[0] as Phaser.GameObjects.Graphics).setRotation(a);
    this.arrowTxt.setText(t.label);
  }

  private findTarget(): { x: number; y: number; label: string } | null {
    const s = this.s;
    const q = s.quests?.current;
    const p = s.player;
    if (!q) return null;
    const g = q.goal;
    if (g.type === 'collect') {
      const crate = s.nearestCrate(p.x, p.feetY, 420);
      if (crate) return { ...crate, label: 'กล่องเสบียง' };
      const node = s.nearestNodeFar(p.x, p.feetY, 700, (n) => n.available && NODE_SPECS[n.kind].drops.some((d) => d.item === g.item));
      return node ? { x: node.x, y: node.baseY, label: g.item === 'wood' ? 'ต้นไม้' : 'แหล่งวัตถุดิบ' } : null;
    }
    if (g.type === 'fish') {
      const tx0 = Math.floor(p.x / T);
      const ty0 = Math.floor(p.feetY / T);
      for (let r = 2; r < 30; r++) {
        for (let k = 0; k < r * 8; k++) {
          const ang = (k / (r * 8)) * Math.PI * 2;
          const tx = tx0 + Math.round(Math.cos(ang) * r);
          const ty = ty0 + Math.round(Math.sin(ang) * r);
          if (isWater(s.tileAt(tx, ty))) return { x: tx * T + 8, y: ty * T + 8, label: 'ริมน้ำ' };
        }
      }
      return null;
    }
    if (g.type === 'visit') {
      const is = s.world.slots[CENTER_SLOT];
      return is ? { x: is.cx * T, y: is.cy * T, label: 'เกาะกลาง' } : null;
    }
    return null;
  }

  private tip(id: string) {
    if (this.shown.has(id) || this.s.showcase) return;
    this.mark(id);
    EventBus.emit('toast', TIPS[id], '#fff2b0');
  }

  private mark(id: string) {
    this.shown.add(id);
    const m = MetaSave.load();
    m.tips = [...this.shown];
    MetaSave.save(m);
  }

  destroy() {
    this.offs.forEach((f) => f());
    this.arrow.destroy();
  }
}
