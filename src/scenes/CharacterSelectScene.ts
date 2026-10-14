import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { MetaSave } from '../core/MetaSave';
import { CHARACTERS, type CharacterDef } from '../data/characters';
import { CLASS_LOOKS, buildHeroTexture, heroKey } from '../gfx/art/heroes';
import { button, COLORS, FONT, heading, panel, txt } from '../ui/widgets';
import { artGroup, coverCrop, coverImage, queueArt } from '../ui/art';
import { fadeIn, fadeTo } from '../ui/transition';
import { applyUiScale } from '../ui/layout';

const W = 960;

const heroTex = (scene: Phaser.Scene, id: string) => {
  const look = CLASS_LOOKS[id as keyof typeof CLASS_LOOKS];
  return buildHeroTexture(scene, heroKey(look), look);
};

const RANDOM_NAMES = ['นักล่าคลื่น', 'เจ้าเกาะ', 'ลมทะเล', 'จอมขวาน', 'ปลาทอง', 'ราชันย์ทราย', 'เงาจันทร์', 'ดาวเหนือ'];

/**
 * ขั้นที่ 1 ของการเริ่มเกม: เลือกตัวละคร + ตั้งชื่อผู้เล่น → ขั้นที่ 2 สุ่มลงเกาะบนแผนที่โลก
 * play = false คือดูตัวละครอย่างเดียว (จากหน้าแรก)
 */
export class CharacterSelectScene extends Phaser.Scene {
  private detail!: Phaser.GameObjects.Container;
  private chosen: CharacterDef = CHARACTERS[0];
  private play = false;
  private nameInput: Phaser.GameObjects.DOMElement | null = null;
  private cards: { id: string; bg: Phaser.GameObjects.NineSlice }[] = [];

  constructor() {
    super('CharacterSelectScene');
  }

  private presetName = '';

  preload() {
    queueArt(this, [...artGroup('char_'), 'keyart']);
  }

  create(data: { play?: boolean; name?: string }) {
    this.presetName = data.name ?? '';
    this.play = !!data.play;
    this.cards = [];
    applyUiScale(this);
    fadeIn(this);
    this.cameras.main.setBackgroundColor('#141626');
    const bgArt = coverImage(this, 'keyart', W, 540);
    if (bgArt) {
      bgArt.setAlpha(0.45);
      this.tweens.add({ targets: bgArt, scale: bgArt.scale * 1.05, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else this.add.image(0, 0, 'title_sky').setOrigin(0).setScale(1, 1.5).setAlpha(0.5);
    this.add.rectangle(0, 0, W, 540, 0x0b0d1f, 0.35).setOrigin(0);
    heading(this, W / 2, 14, this.play ? 'ขั้นที่ 1/2 · เลือกตัวละครและตั้งชื่อ' : `ตัวละครทั้งหมด ${CHARACTERS.length} แบบ`, 28).setOrigin(0.5, 0);
    const meta = MetaSave.load();
    this.chosen = CHARACTERS.find((c) => c.id === meta.lastCharacter && MetaSave.isUnlocked(meta, c.id)) ?? CHARACTERS[0];

    panel(this, 24, 64, 440, 410);
    CHARACTERS.forEach((c, i) => {
      const x = 44 + (i % 4) * 104;
      const y = 82 + Math.floor(i / 4) * 196;
      const unlocked = MetaSave.isUnlocked(meta, c.id);
      const bg = this.add.nineslice(x, y, 'ui_slot', undefined, 96, 184, 6, 6, 6, 6).setOrigin(0);
      const key = heroTex(this, c.id);
      // ภาพตัวละครวาด (AI) + ตัวเดินในเกมเล็กๆ ที่มุม
      const pic = coverCrop(this, `char_${c.id}`, 88, 128, x + 4, y + 4, 0.15);
      if (pic && !unlocked) pic.setTint(0x2a2f4e);
      // มีภาพวาด = ใช้ภาพวาดอย่างเดียว (ไม่โชว์ตัวพิกเซลในเกม)
      if (!pic) {
        const sp = this.add.sprite(x + 48, y + 78, key, 0).setScale(3.6);
        if (unlocked) sp.play(`${key}_walk_down`);
        else sp.setTintFill(0x0b0d1f);
      }
      txt(this, x + 48, y + (pic ? 152 : 134), unlocked ? c.name : '???', 15, unlocked ? COLORS.text : '#8a95a8').setOrigin(0.5);
      txt(this, x + 48, y + (pic ? 66 : 156), unlocked ? '' : '🔒', pic ? 26 : 10, COLORS.dim).setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(c, unlocked));
      this.cards.push({ id: c.id, bg });
    });
    this.detail = this.add.container(0, 0);
    this.select(this.chosen, true);

    if (this.play) {
      // ช่องตั้งชื่อ (DOM input ทำงานได้ทั้งคอมและมือถือ)
      txt(this, 486, 404, 'ชื่อผู้เล่น', 14, COLORS.gold);
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 16;
      el.placeholder = 'พิมพ์ชื่อของคุณ';
      el.value = meta.playerName || this.presetName;
      Object.assign(el.style, {
        width: '230px', height: '34px', fontSize: '18px', fontFamily: FONT, padding: '0 10px', borderRadius: '6px',
        border: '3px solid #8a5a35', background: '#1a1c2c', color: '#f4f4f4', outline: 'none',
      });
      this.nameInput = this.add.dom(486 + 118, 444, el);
      button(this, 790, 444, 90, 38, '🎲 สุ่ม', () => {
        el.value = `${RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]}${Math.floor(Math.random() * 99)}`;
      }, true, 14);
      button(this, 830, 506, 220, 44, 'ถัดไป: สุ่มเกาะ ▶', () => this.next(el.value), true, 15);
    }
    button(this, 100, 506, 150, 40, '← กลับ', () => {
      this.nameInput?.destroy();
      fadeTo(this, 'TitleScene');
    });
  }

  private next(raw: string) {
    const name = raw.trim().slice(0, 16);
    if (name.length < 2) {
      Sfx.play('error');
      const t = txt(this, 604, 476, 'กรุณาตั้งชื่ออย่างน้อย 2 ตัวอักษร', 13, COLORS.bad).setOrigin(0.5);
      this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 400, onComplete: () => t.destroy() });
      return;
    }
    MetaSave.setProfile(name, this.chosen.id);
    this.nameInput?.destroy();
    fadeTo(this, 'RoomSelectScene', { character: this.chosen.id });
  }

  private select(c: CharacterDef, unlocked: boolean) {
    if (unlocked) this.chosen = c;
    for (const card of this.cards) card.bg.setTexture(card.id === c.id ? 'ui_slot_sel' : 'ui_slot');
    const d = this.detail;
    d.removeAll(true);
    const x = 476;
    const h = this.play ? 330 : 410;
    d.add(panel(this, x, 64, 470, h));
    const key = heroTex(this, c.id);
    const pic = coverCrop(this, `char_${c.id}`, 150, 150, x + 14, 78, 0.12);
    const tx = pic ? x + 180 : x + 140;
    if (pic) {
      if (!unlocked) pic.setTint(0x2a2f4e);
      d.add(pic);
      d.add(this.add.rectangle(x + 14, 78, 150, 150).setOrigin(0).setStrokeStyle(3, 0xffcd75, 0.8));
    }
    if (!pic) {
      const big = this.add.sprite(x + 70, 150, key, 0).setScale(5);
      if (unlocked) big.play(`${key}_walk_down`);
      else big.setTintFill(0x0b0d1f);
      d.add(big);
    }
    d.add(heading(this, tx, 84, unlocked ? c.name : '???', 28));
    d.add(txt(this, tx, 122, unlocked ? c.desc : 'ยังไม่ปลดล็อก', 14, COLORS.dim, { wordWrap: { width: 470 - (tx - x) - 16 } }));
    if (!unlocked) return;
    const s = c.stats;
    d.add(txt(this, x + 30, pic ? 240 : 214, [
      `ทุกตัวเริ่มเท่ากัน (HP ${s.hp} · Stamina ${s.stamina}) — ไม่มีสาย/อาชีพ`,
      'จะเป็นนักรบ ชาวไร่ ช่าง หรือพ่อค้า ขึ้นกับสิ่งที่คุณทำ',
      '⚔ เก่งขึ้นจาก: เลเวล · อุปกรณ์ · อัพเกรด 10 ระดับ · บัฟฐาน · ผลึกพลัง',
      '💀 ตายลด 1 เลเวล · ตายตอน Lv.1 = ซื้อชีวิต หรือตายถาวร',
      `★ สกิล: ${c.skillText} · 👕 เปลี่ยนชุดได้ (O)`,
    ].join('\n'), 12, COLORS.text, { wordWrap: { width: 430 }, lineSpacing: 4 }));
  }
}
