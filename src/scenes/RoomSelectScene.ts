import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { MetaSave } from '../core/MetaSave';
import { CENTER_SLOT, ROOM_GRID, WORLD_ROOM, getRoomService, localPlayerId } from '../core/RoomService';
import { SaveManager } from '../core/SaveManager';
import { SPECIAL_SLOT } from '../core/SpecialIsland';
import { coverImage, queueArt } from '../ui/art';
import { button, COLORS, heading, txt } from '../ui/widgets';
import { fadeIn, fadeTo } from '../ui/transition';
import { applyUiScale } from '../ui/layout';

const W = 960;
const H = 540;

/**
 * ขั้นที่ 2: สุ่มลงเกาะบนแผนที่โลก (ทุกคนอยู่แผนที่เดียวกัน เกาะใครเกาะมัน)
 */
export class RoomSelectScene extends Phaser.Scene {
  private character = 'mechanic';
  private showcase = false;
  private busy = false;

  constructor() {
    super('RoomSelectScene');
  }

  preload() {
    queueArt(this, ['intro_2']);
  }

  create(data: { error?: string; showcase?: boolean; character?: string }) {
    this.showcase = !!data.showcase;
    this.character = data.character ?? MetaSave.load().lastCharacter ?? 'mechanic';
    this.busy = false;
    applyUiScale(this);
    fadeIn(this);
    this.cameras.main.setBackgroundColor('#141626');
    const art = coverImage(this, 'intro_2', W, 540);
    if (art) {
      art.setAlpha(0.9);
      this.tweens.add({ targets: art, scale: art.scale * 1.06, duration: 12000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    } else this.add.image(0, 0, 'title_sky').setOrigin(0).setScale(1, 1.5).setAlpha(0.55);
    if (data.error) {
      heading(this, W / 2, 200, 'เข้าแผนที่ไม่ได้', 28).setOrigin(0.5);
      txt(this, W / 2, 250, data.error, 16, COLORS.bad).setOrigin(0.5);
      button(this, W / 2, 330, 200, 44, '← กลับหน้าแรก', () => fadeTo(this, 'TitleScene'));
      return;
    }
    // แผนที่โลกเดียว: ข้ามการเลือกห้อง ไปสุ่มเกาะเลย
    void this.join(WORLD_ROOM);
  }

  /** เข้าห้อง → วงล้อสุ่มช่องเกาะบนตาราง → ลงเกาะ */
  private async join(roomId: string) {
    if (this.busy) return;
    this.busy = true;
    const svc = getRoomService();
    // ออนไลน์: เซิร์ฟเวอร์เป็นคนแจกช่องเกาะ (กันสองคนได้ช่องเดียวกัน)
    const wait = svc.online ? heading(this, W / 2, H / 2, 'กำลังเชื่อมต่อ…', 24).setOrigin(0.5) : null;
    // เริ่มใหม่ = ทิ้งเกาะเดิม (ของ/อาวุธทั้งหมดหาย) แล้วสุ่มเกาะใหม่
    const res = await svc.joinAsync(roomId, localPlayerId(), MetaSave.load().playerName || 'ผู้รอดชีวิต', { fresh: true, character: this.character });
    wait?.destroy();
    if (!this.sys.isActive()) return;
    if ('error' in res) {
      Sfx.play('error');
      this.scene.restart({ error: res.error, showcase: this.showcase, character: this.character });
      return;
    }
    SaveManager.clear();
    const start = () => fadeTo(this, 'GameScene', { roomId, character: this.character, showcase: this.showcase }, 280);

    // วงล้อสุ่ม
    const c = this.add.container(0, 0).setDepth(50);
    c.add(this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.25).setOrigin(0));
    const head = heading(this, W / 2, 26, 'ขั้นที่ 2/2 · กำลังสุ่มเกาะของคุณบนแผนที่โลก…', 24).setOrigin(0.5, 0);
    c.add(head);
    const cell = 30;
    const ox = W / 2 - (ROOM_GRID * cell) / 2;
    const oy = 84;
    // แผ่นแผนที่ทะเล: กรอบไม้ + น้ำทะเลไล่สี
    const map = this.add.graphics();
    map.fillStyle(0x0b0d1f, 0.55).fillRoundedRect(ox - 22, oy - 22, ROOM_GRID * cell + 44, ROOM_GRID * cell + 44, 16);
    map.fillStyle(0x8a5a35, 1).fillRoundedRect(ox - 14, oy - 14, ROOM_GRID * cell + 28, ROOM_GRID * cell + 28, 12);
    map.fillGradientStyle(0x41a6f6, 0x41a6f6, 0x29366f, 0x29366f, 1).fillRoundedRect(ox - 8, oy - 8, ROOM_GRID * cell + 16, ROOM_GRID * cell + 16, 8);
    c.add(map);
    const used = new Set(res.room.players.filter((p) => p.id !== localPlayerId()).map((p) => p.slot));
    const rects: Phaser.GameObjects.Rectangle[] = [];
    const seaCol = (i: number) => ((i + Math.floor(i / ROOM_GRID)) % 2 ? 0x3b8fd0 : 0x3483c4);
    for (let i = 0; i < ROOM_GRID * ROOM_GRID; i++) {
      const x = ox + (i % ROOM_GRID) * cell + cell / 2;
      const y = oy + Math.floor(i / ROOM_GRID) * cell + cell / 2;
      const r = this.add.rectangle(x, y, cell - 2, cell - 2, seaCol(i), 0.55);
      rects.push(r);
      c.add(r);
      // เกาะเล็กๆ บนช่องที่มีเจ้าของ / เกาะกลาง (ทอง) / เกาะมหาสมบัติ (ม่วง)
      const isl = i === CENTER_SLOT ? [0xffcd75, 0xf4b41b, 11] : i === SPECIAL_SLOT ? [0xc77dff, 0x7b4bb5, 10] : used.has(i) ? [0xf4e0a0, 0x38b764, 8] : null;
      if (isl) {
        const g = this.add.graphics();
        g.fillStyle(isl[0], 1).fillEllipse(x, y + 2, isl[2] * 2, isl[2] * 1.5);
        g.fillStyle(isl[1], 1).fillEllipse(x, y, isl[2] * 1.3, isl[2]);
        c.add(g);
      } else if ((i * 7) % 5 === 0) c.add(this.add.rectangle(x - 4, y + 3, 6, 1, 0xd6f0ff, 0.5));
    }
    c.add(txt(this, W / 2, oy + ROOM_GRID * cell + 22, '🟡 เกาะกลาง (ตลาด) · 🟣 เกาะมหาสมบัติ · 🏝 เกาะที่มีเจ้าของแล้ว · 🌊 ทะเลว่าง', 13, COLORS.text).setOrigin(0.5, 0).setStroke('#0b0d1f', 4));
    const free = rects.map((_, i) => i).filter((i) => i !== CENTER_SLOT && i !== SPECIAL_SLOT && !used.has(i));
    let step = 0;
    const total = 22;
    const tick = () => {
      rects.forEach((r, i) => r.setStrokeStyle(0).setFillStyle(seaCol(i), 0.55));
      const pick = step >= total ? res.slot : free[Math.floor(Math.random() * free.length)];
      rects[pick].setFillStyle(0xa7f070, 1).setStrokeStyle(3, 0xffffff);
      Sfx.play('click');
      step++;
      if (step <= total) this.time.delayedCall(50 + step * 9, tick);
      else {
        Sfx.play('levelUp');
        const label = txt(this, W / 2, oy + ROOM_GRID * cell + 48, `🏝 ได้เกาะช่องที่ ${res.slot + 1}! กำลังลงเกาะ…`, 20, COLORS.good).setOrigin(0.5, 0).setStroke("#0b0d1f", 5);
        c.add(label);
        this.time.delayedCall(1200, start);
      }
    };
    tick();
  }
}
