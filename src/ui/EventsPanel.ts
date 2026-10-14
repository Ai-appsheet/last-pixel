import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { WorldClock, bkkClock, fmtLeft } from '../core/WorldClock';
import { EVENT_TYPES } from '../data/worldEvents';
import { ITEMS } from '../data/items';
import type { GameScene } from '../scenes/GameScene';
import { anchorGroup, hudScale, isCompact } from './layout';
import { COLORS, txt } from './widgets';

const M = 8;

/**
 * แผง "กิจกรรมตามเวลาจริง" ฝั่งซ้ายใต้แผงสถานะ:
 *  - ปุ่ม 🎁 กล่องฟรีวันนี้ (กดรับได้ทันที · รับแล้วนับถอยหลังถึงเที่ยงคืนไทย)
 *  - 📣 เกาะกลาง / เกาะมหาสมบัติ เปิด-ปิด + เกาะกิจกรรมที่โผล่อยู่ + กิจกรรมถัดไป
 * จอเล็กพับรายการไว้ (แตะหัวข้อเพื่อกาง) · UIScene สร้างด้วยบรรทัดเดียว: new EventsPanel(this, this.gs)
 */
export class EventsPanel {
  private root: Phaser.GameObjects.Container;
  private boxBtn: Phaser.GameObjects.Text;
  private head: Phaser.GameObjects.Text;
  private list: Phaser.GameObjects.Text;
  private odds: Phaser.GameObjects.Text;
  private open: boolean;
  private timer = 0;
  private k: number;
  private hoverBox = false;

  /** จุดบนจออยู่บนแผงนี้ไหม (UIScene.isPointerOverUI — กันคลิกทะลุไปตี) */
  contains(x: number, y: number) {
    return [this.boxBtn, this.head, this.list, this.odds].some((o) => o.visible && o.getBounds().contains(x, y));
  }

  constructor(scene: Phaser.Scene, private gs: GameScene) {
    this.k = hudScale(scene);
    this.open = !isCompact(scene);
    this.root = anchorGroup(scene, 0, 0, this.k, 2);
    const x = M;
    this.boxBtn = txt(scene, x, 0, '', 12, '#1a1c2c', { fontStyle: '500' }).setPadding(7, 3, 7, 3).setBackgroundColor('#ffcd75');
    // ปุ่มพื้นทอง: ตัวหนังสือเข้มไม่ต้องมีขอบ/เงาดำ (อ่านชัดกว่า)
    this.boxBtn.setStroke('#ffcd75', 0).setShadow(0, 0, '#000', 0, false, false);
    this.boxBtn.setInteractive({ useHandCursor: true });
    this.boxBtn.on('pointerdown', () => this.claim());
    this.boxBtn.on('pointerover', () => (this.hoverBox = true));
    this.boxBtn.on('pointerout', () => (this.hoverBox = false));
    this.odds = txt(scene, x, 0, '', 11, COLORS.dim, { lineSpacing: 2 }).setBackgroundColor('#0b0d1fd9').setPadding(6, 2, 6, 2);
    this.head = txt(scene, x, 0, '', 11, COLORS.sea).setBackgroundColor('#0b0d1fcc').setPadding(6, 2, 6, 2);
    this.head.setInteractive({ useHandCursor: true });
    this.head.on('pointerdown', () => {
      Sfx.play('click');
      this.open = !this.open;
      this.refresh();
    });
    this.list = txt(scene, x, 0, '', 11, COLORS.text, { lineSpacing: 3 }).setBackgroundColor('#0b0d1fbf').setPadding(6, 4, 6, 4);
    this.root.add([this.head, this.list, this.boxBtn, this.odds]);
    const tick = (_t: number, dt: number) => {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 500;
      this.refresh();
    };
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => scene.events.off('update', tick));
    this.refresh();
  }

  private claim() {
    const d = this.gs.daily;
    if (!d.boxAvailable) {
      Sfx.play('error');
      return;
    }
    Sfx.play('click');
    d.claimDailyBox();
    this.refresh();
  }

  private refresh() {
    const g = this.gs;
    if (!g.worldEvents || !g.daily) return;
    // มือถือ + แผงปักหมุดอยู่ฝั่งซ้าย → เลื่อนลงไม่ให้ทับ
    const pinShift = g.controls?.touchMode && g.pinned ? 96 : 0;
    let y = M + 132 + pinShift;
    const box = g.daily.dailyBoxStatus();
    const odds = box.odds.map(([t, p]) => `${ITEMS[t].name.replace('กล่อง', '')} ${Math.round(p * 100)}%`).join(' · ');
    if (box.available) {
      this.boxBtn.setText(`🎁 กล่องฟรีวันนี้ · วันที่ ${box.streak}`).setBackgroundColor('#ffcd75').setColor('#1a1c2c').setAlpha(0.85 + Math.sin(Date.now() / 250) * 0.15);
    } else {
      this.boxBtn.setText(`🎁 รับแล้ว (ต่อเนื่อง ${box.streak} วัน) · อีก ${fmtLeft(box.msToReset)}`).setBackgroundColor('#333c57').setColor(COLORS.dim).setAlpha(1);
    }
    this.boxBtn.setPosition(M, y);
    y += this.boxBtn.height + 2;
    // โอกาสได้กล่อง = ป้ายเล็กตอนชี้ที่ปุ่มเท่านั้น (ไม่กินที่คอลัมน์ซ้าย)
    const showOdds = this.hoverBox;
    this.odds.setVisible(showOdds).setText(`โอกาส: ${odds}\n${box.streak >= 3 || box.streak % 7 === 0 ? 'โบนัสต่อเนื่องแล้ว' : 'ครบ 3 วันโอกาสดีขึ้น · วันที่ 7 การันตีทอง'}`).setPosition(M, y);
    if (showOdds) y += this.odds.height + 2;
    const marks = g.worldEvents.markers();
    const events = marks.filter((m) => m.kind === 'event');
    const openGates = marks.filter((m) => m.kind !== 'event' && m.open).length;
    this.head.setText(`📣 กิจกรรม${events.length || openGates ? ` (${events.length + openGates} เปิดอยู่)` : ''} ${this.open ? '▾' : '▸'}`).setColor(events.length || openGates ? COLORS.gold : COLORS.sea).setPosition(M, y);
    y += this.head.height + 2;
    this.list.setVisible(this.open).setPosition(M, y);
    if (!this.open) return;
    const lines: string[] = [];
    for (const m of marks) {
      if (m.kind === 'event') lines.push(`${m.icon} ${m.name} · เหลือ ${fmtLeft(m.msLeft)}`);
      else {
        const st = m.kind === 'center' ? g.center : g.special;
        lines.push(m.open ? `${m.icon} ${m.name}: เปิด · เหลือ ${fmtLeft(m.msLeft)}` : `🔒 ${m.name}: ปิด · เปิด ${bkkClock(st.nextOpen)} น.`);
      }
    }
    const next = g.worldEvents.upcoming();
    if (next) {
      const def = EVENT_TYPES[next.plan.type];
      lines.push(`⏭ ถัดไป ${def.icon} ${def.name} ${bkkClock(next.at)} น. (อีก ${fmtLeft(next.at - WorldClock.now())})`);
    } else lines.push('⏭ วันนี้ไม่มีเกาะกิจกรรมแล้ว — รีเซ็ตเที่ยงคืน');
    this.list.setText(lines.join('\n'));
  }
}
