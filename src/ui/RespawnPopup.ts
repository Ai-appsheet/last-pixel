import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import type { GameScene } from '../scenes/GameScene';
import { coverImage } from './art';
import { COLORS, button, heading, panel, txt } from './widgets';

const W = 960;
const H = 540;

interface PaidRespawnInfo {
  cause: string;
  fee: number;
  canPay: boolean;
  unlimited: boolean;
  have: number;
  level: number;
}

/**
 * หน้าต่างตาย (โหมดเกิดใหม่แบบจ่ายเงิน — config/openWorld.ts PAID_RESPAWN):
 * "💀 คุณตาย — เกิดใหม่ที่บ้าน (ค่าเกิดใหม่ 💰 N)" + ปุ่มเดียว "จ่ายแล้วเกิดใหม่" → GameScene.paidRespawn()
 * UIScene สร้างด้วยบรรทัดเดียว: new RespawnPopup(this, this.gs)
 */
export class RespawnPopup {
  private c: Phaser.GameObjects.Container | null = null;

  constructor(private scene: Phaser.Scene, private gs: GameScene) {
    const s0 = (fn: () => void) => scene.time.delayedCall(50, fn);
    const on = (i: PaidRespawnInfo) => this.show(i);
    EventBus.on('ui:paid_respawn', on);
    scene.events.once('shutdown', () => {
      EventBus.off('ui:paid_respawn', on);
      this.c?.destroy();
    });
    if (gs.pendingRespawn) s0(() => this.show(gs.pendingRespawn!));
  }

  get open() {
    return !!this.c;
  }

  private show(i: PaidRespawnInfo) {
    const s = this.scene;
    this.c?.destroy();
    const c = s.add.container(0, 0).setDepth(60);
    const art = coverImage(s, 'death', W, H);
    if (art) c.add(art.setAlpha(0.8));
    c.add(s.add.rectangle(0, 0, W, H, 0x2a0710, 0.55).setOrigin(0).setInteractive());
    c.add(panel(s, W / 2 - 260, 110, 520, 300));
    c.add(heading(s, W / 2, 128, '💀 คุณตาย', 38).setOrigin(0.5, 0).setColor('#ef7d57'));
    c.add(txt(s, W / 2, 182, `สาเหตุ: ${i.cause}`, 14, COLORS.dim, { wordWrap: { width: 480 }, align: 'center' }).setOrigin(0.5, 0));
    c.add(txt(s, W / 2, 214, `เกิดใหม่ที่บ้าน (ค่าเกิดใหม่ 💰 ${i.fee.toLocaleString()})`, 18, COLORS.gold).setOrigin(0.5, 0));
    const note = i.unlimited
      ? 'เงินไม่จำกัด (∞) — จ่ายได้เสมอ · ของติดตัวอยู่ครบ'
      : i.canPay
        ? `มี 💰 ${i.have.toLocaleString()} · ของติดตัวอยู่ครบ ไม่ลดเลเวล`
        : `เงินไม่พอ (มี 💰 ${i.have.toLocaleString()}) — เกิดใหม่ฟรี แต่เลเวลลด 1 ขั้น (Lv.${i.level} → Lv.${Math.max(1, i.level - 1)})`;
    c.add(txt(s, W / 2, 248, note, 14, i.canPay ? COLORS.text : '#ef7d57', { wordWrap: { width: 480 }, align: 'center' }).setOrigin(0.5, 0));
    c.add(txt(s, W / 2, 284, 'เกิดแล้วอมตะ 3 วินาที', 13, COLORS.dim).setOrigin(0.5, 0));
    const go = () => {
      if (!this.c) return;
      this.c.destroy();
      this.c = null;
      this.gs.paidRespawn();
    };
    c.add(button(s, W / 2, 352, 300, 46, i.canPay ? 'จ่ายแล้วเกิดใหม่' : 'เกิดใหม่ (เลเวลลด 1)', go, true, 18).objects);
    s.input.keyboard?.once('keydown-ENTER', go);
    c.setAlpha(0);
    s.tweens.add({ targets: c, alpha: 1, duration: 200 });
    this.c = c;
  }
}
