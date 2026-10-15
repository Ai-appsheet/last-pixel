import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { anchorGroup } from './layout';
import { RETRO, retroLabel } from './retro';
import { outline, txt } from './widgets';
import { BODY, NUT_KEYS } from '../systems/BodySystem';
import { homeBadge } from './homeBadge';

/**
 * HUD แบบเบาที่สุด (แนว Under the Island): หัวใจพิกเซลแถวเดียวมุมซ้ายบน ไม่มีแผงพื้นหลัง
 * ค่าอื่น (หิว/น้ำ/แรง/อุณหภูมิ/สติ) = ไอคอนเล็ก + แถบสั้น แสดงเฉพาะตอนไม่เต็ม · เลเวลตัวพิกเซลเล็กท้ายแถว
 */
const M = 8;
const HEARTS = 10;

type StatKey = 'hunger' | 'thirst' | 'stamina' | 'temp' | 'sanity';
const STATS: [StatKey, string, number][] = [
  ['stamina', 'hud_stamina', 0xe3c178],
  ['hunger', 'hud_food', 0xc9a06a],
  ['thirst', 'hud_water', 0x7fb3c9],
  ['temp', 'hud_temp', 0x8fbf7a],
  ['sanity', 'hud_sanity', 0xa991c9],
];

export class MiniHud {
  readonly root: Phaser.GameObjects.Container;
  private hearts: Phaser.GameObjects.Image[] = [];
  private lv: Phaser.GameObjects.Text;
  private xp: Phaser.GameObjects.Rectangle;
  /** ไอคอนเตือนสารอาหารต่ำ/ป่วย (แทนชิป "ร่างกาย") */
  private body: Phaser.GameObjects.Text;
  private stats: { key: StatKey; c: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Rectangle; color: number }[] = [];

  constructor(scene: Phaser.Scene, private gs: GameScene, k: number) {
    this.root = anchorGroup(scene, 0, 0, k, 2);
    for (let i = 0; i < HEARTS; i++) {
      const h = scene.add.image(M + 8 + i * 16, M + 9, 'hud_heart').setScale(2);
      this.hearts.push(h);
    }
    this.lv = outline(retroLabel(scene, M + 2 + HEARTS * 16 + 6, M + 9, '', RETRO.css.gold).setOrigin(0, 0.5), 2);
    const xpBg = scene.add.rectangle(M + 2, M + 21, HEARTS * 16, 2, 0x0e1418, 0.7).setOrigin(0, 0.5);
    this.xp = scene.add.rectangle(M + 2, M + 21, 0, 2, 0xa991c9, 1).setOrigin(0, 0.5);
    this.body = outline(txt(scene, M + 2 + HEARTS * 16 + 44, M + 9, '🍽', 12, '#d98a7e').setOrigin(0, 0.5), 2).setVisible(false);
    this.root.add([...this.hearts, this.lv, xpBg, this.xp, this.body]);
    this.root.add(homeBadge(scene, M + 2, M + 49)); // 🏠 ปลอดภัย (อยู่ในบ้าน — HomeSystem)
    for (const [key, icon, color] of STATS) {
      const c = scene.add.container(0, M + 33);
      const ic = scene.add.image(0, 0, icon).setScale(1.4);
      const bg = scene.add.rectangle(8, 0, 24, 4, 0x0e1418, 0.85).setOrigin(0, 0.5);
      const fill = scene.add.rectangle(9, 0, 22, 2, color, 1).setOrigin(0, 0.5);
      c.add([ic, bg, fill]);
      this.root.add(c);
      this.stats.push({ key, c, fill, color });
    }
  }

  update(time: number) {
    const p = this.gs.player;
    // หัวใจ: เต็ม / ครึ่ง (จาง) / ว่าง (มืด)
    const f = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1) * HEARTS;
    const low = p.hp < p.maxHp * 0.25 && Math.floor(time / 300) % 2 === 0;
    this.hearts.forEach((h, i) => {
      const v = Phaser.Math.Clamp(f - i, 0, 1);
      if (v >= 0.75) h.clearTint().setAlpha(low ? 0.5 : 1);
      else if (v >= 0.25) h.clearTint().setAlpha(0.55);
      else h.setTint(0x2a3640).setAlpha(0.85);
    });
    const last = p.level <= 1;
    const t = `Lv.${p.level}`;
    if (this.lv.text !== t) this.lv.setText(t);
    this.lv.setColor(last ? RETRO.css.red : RETRO.css.gold);
    this.xp.width = HEARTS * 16 * Math.min(1, p.xp / p.xpNeed);
    const b = p.nutri;
    const bad = !!b && (b.sick > 0 || NUT_KEYS.some((k) => b[k] < BODY.low));
    this.body.setVisible(bad).setText(b && b.sick > 0 ? '🤢' : '🍽').setX(this.lv.x + this.lv.displayWidth + 6);
    // แถบเล็ก: แสดงเฉพาะค่าที่ไม่เต็ม (อุณหภูมิ = หนาว/ร้อนเกิน) เรียงชิดซ้าย
    const val: Record<StatKey, number> = {
      hunger: p.hunger / 100,
      thirst: p.thirst / 100,
      stamina: p.stamina / p.maxStamina,
      temp: p.temp / 100,
      sanity: p.sanity / 100,
    };
    let x = M + 8;
    for (const s of this.stats) {
      const r = Phaser.Math.Clamp(val[s.key], 0, 1);
      const show = s.key === 'temp' ? p.temp < 25 || p.temp > 75 : r < 0.99;
      s.c.setVisible(show);
      if (!show) continue;
      s.c.setX(x);
      s.fill.width = 22 * r;
      s.fill.setFillStyle(s.key === 'temp' ? (p.temp < 25 ? 0x7fb3c9 : 0xd98a7e) : s.color, r < 0.2 && Math.floor(time / 300) % 2 === 0 ? 0.35 : 1);
      x += 42;
    }
  }

  setVisible(v: boolean) {
    this.root.setVisible(v);
  }
}
