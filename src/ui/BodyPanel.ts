import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { BODY, NUT_INFO, NUT_KEYS, isBalanced } from '../systems/BodySystem';
import type { GameScene } from '../scenes/GameScene';
import { anchorGroup, hudScale, isCompact } from './layout';
import { COLORS, txt } from './widgets';

const M = 8;
const BAR_W = 24;

/**
 * แผงสมดุลร่างกายเล็กๆ ใต้แผงสถานะ (ขวาของปุ่ม "▾ สถานะ"): 🥩 โปรตีน · 🍚 พลังงาน · 🥬 วิตามิน + สถานะสมดุล/ป่วย
 * จอเล็กพับไว้ก่อน (แตะเพื่อกาง) · ชี้/แตะ = การ์ดอธิบายว่าควรกินอะไร
 * UIScene สร้างด้วยบรรทัดเดียว: new BodyPanel(this, this.gs)
 */
export class BodyPanel {
  private root: Phaser.GameObjects.Container;
  private chip: Phaser.GameObjects.Text;
  private row: Phaser.GameObjects.Container;
  private fills: Record<string, Phaser.GameObjects.Rectangle> = {};
  private icons: Record<string, Phaser.GameObjects.Text> = {};
  private mood: Phaser.GameObjects.Text;
  private tip: Phaser.GameObjects.Container;
  private tipBg: Phaser.GameObjects.Graphics;
  private tipText: Phaser.GameObjects.Text;
  private expanded: boolean;
  private tipPinned = false;
  private hover = false;
  private timer = 0;
  private bg: Phaser.GameObjects.Rectangle;

  /** จุดบนจออยู่บนแผงนี้ไหม (UIScene.isPointerOverUI — กันคลิกทะลุไปตี) */
  contains(x: number, y: number) {
    const hit = (o: Phaser.GameObjects.GameObject & { visible: boolean; getBounds: () => Phaser.Geom.Rectangle }) => o.visible && o.getBounds().contains(x, y);
    return hit(this.chip) || (this.row.visible && hit(this.bg)) || (this.tip.visible && this.tipText.getBounds().contains(x, y));
  }

  constructor(scene: Phaser.Scene, private gs: GameScene) {
    const k = hudScale(scene);
    this.expanded = !isCompact(scene);
    this.root = anchorGroup(scene, 0, 0, k, 5);
    // จอเล็ก: เลื่อนขวาหลบปุ่ม 💬 แชท (ui/ChatPanel.ts วางที่ 96×k)
    const x0 = M + 76 + (isCompact(scene) ? 52 : 0);
    const y0 = M + 112;
    this.chip = txt(scene, x0, y0, '', 11, COLORS.text).setOrigin(0, 0.5).setBackgroundColor('#0b0d1fcc').setPadding(5, 2, 5, 2);
    this.row = scene.add.container(0, 0);
    const bg = scene.add.rectangle(x0 - 3, y0, 126, 18, 0x0b0d1f, 0.8).setOrigin(0, 0.5).setStrokeStyle(1, 0x41a6f6, 0.8);
    this.bg = bg;
    this.row.add(bg);
    NUT_KEYS.forEach((key, i) => {
      const x = x0 + i * 38;
      const ic = txt(scene, x, y0, NUT_INFO[key].icon, 9).setOrigin(0, 0.5);
      const back = scene.add.rectangle(x + 12, y0, BAR_W, 5, 0x333c57).setOrigin(0, 0.5);
      const fill = scene.add.rectangle(x + 12, y0, BAR_W, 5, NUT_INFO[key].color).setOrigin(0, 0.5);
      this.fills[key] = fill;
      this.icons[key] = ic;
      this.row.add([ic, back, fill]);
    });
    this.mood = txt(scene, x0 + 116, y0, '', 10).setOrigin(0, 0.5);
    this.row.add(this.mood);
    this.tipBg = scene.add.graphics();
    this.tipText = txt(scene, 10, 8, '', 12, COLORS.text, { lineSpacing: 4, wordWrap: { width: 300 } });
    this.tip = scene.add.container(M, y0 + 14, [this.tipBg, this.tipText]).setVisible(false);
    this.root.add([this.row, this.chip, this.tip]);

    const hit = (o: Phaser.GameObjects.GameObject) => {
      o.setInteractive({ useHandCursor: true });
      o.on('pointerover', () => (this.hover = true));
      o.on('pointerout', () => (this.hover = false));
      o.on('pointerdown', () => this.onTap());
    };
    hit(bg);
    hit(this.chip);
    const tick = (_t: number, dt: number) => this.update(dt);
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => scene.events.off('update', tick));
    this.refresh();
  }

  private onTap() {
    Sfx.play('click');
    if (!this.expanded) {
      this.expanded = true;
      this.tipPinned = true;
    } else this.tipPinned = !this.tipPinned;
    this.refresh();
  }

  private update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 250;
    this.refresh();
  }

  private refresh() {
    const p = this.gs.player;
    if (!p?.nutri) return;
    const b = p.nutri;
    const robot = !!p.char.passive.robot;
    const balanced = isBalanced(b);
    const low = NUT_KEYS.filter((k) => b[k] < BODY.low);
    const moodIcon = b.sick > 0 ? '🤢' : balanced ? '⚖' : low.length ? '⚠' : '';
    this.chip.setVisible(!this.expanded).setText(`🍽 ร่างกาย ${moodIcon || '·'}`).setColor(b.sick > 0 || low.length ? '#ef7d57' : balanced ? COLORS.good : COLORS.text);
    this.row.setVisible(this.expanded);
    for (const k of NUT_KEYS) {
      this.fills[k].setSize(BAR_W * Math.max(0, Math.min(1, b[k] / 100)), 5).setAlpha(b[k] < BODY.low ? 0.55 + Math.sin(Date.now() / 160) * 0.35 : 1);
      this.icons[k].setText(robot ? NUT_INFO[k].robotIcon : NUT_INFO[k].icon);
    }
    this.mood.setText(moodIcon).setColor(b.sick > 0 ? '#ef7d57' : balanced ? COLORS.good : '#ffcd75');
    const show = this.expanded && (this.hover || this.tipPinned);
    this.tip.setVisible(show);
    if (!show) return;
    const lines: string[] = [];
    lines.push(b.sick > 0 ? `🤢 ป่วย (ท้องเสีย) อีก ${Math.ceil(b.sick)} วิ — หิว/กระหายเร็ว · ไม่ฟื้น HP เอง\n   หายด้วย: สมุนไพร · ยาสมุนไพร · นอนพัก` : balanced ? `⚖ สมดุล! ฟื้น HP +${BODY.balancedRegen}/วิ · สแตมินาฟื้นเร็ว ×${BODY.balancedStamina} · เดินเร็ว +${BODY.balancedSpeed}%` : '⚖ ครบ 3 อย่าง ≥ 50 = บัฟ "สมดุล" (ฟื้นเร็ว เดินเร็ว)');
    for (const k of NUT_KEYS) {
      const i = NUT_INFO[k];
      const v = Math.round(b[k]);
      const state = v < BODY.low ? ` ⚠ ${i.low}` : v >= BODY.good ? ' ✔' : '';
      lines.push(`${robot ? i.robotIcon : i.icon} ${robot ? i.robotName : i.name} ${v}/100${state}\n   ${robot ? 'ชาร์จ' : 'กิน'}: ${robot ? i.robotEat : i.eat}`);
    }
    lines.push(robot ? '🤖 หุ่นยนต์: ถือของแล้วกด F เพื่อชาร์จ (ไม่ป่วย)' : '⚠ เนื้อ/ปลา/ไข่ดิบ และน้ำดิบ เสี่ยงท้องเสีย — ปรุงสุก/ต้มก่อน');
    if (this.gs.inGrace) lines.push('🛡 ช่วงตั้งหลัก: ค่าลดช้าลงครึ่งหนึ่ง ไม่มีผลเสีย');
    this.tipText.setText(lines.join('\n'));
    const w = Math.max(240, this.tipText.width + 20);
    const h = this.tipText.height + 16;
    this.tipBg.clear().fillStyle(0x0b0d1f, 0.92).fillRoundedRect(0, 0, w, h, 8).lineStyle(2, balanced ? 0xa7f070 : 0x566c86, 0.9).strokeRoundedRect(0, 0, w, h, 8);
  }
}
