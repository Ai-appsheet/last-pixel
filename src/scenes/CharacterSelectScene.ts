import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { MetaSave } from '../core/MetaSave';
import { CHARACTERS, HERO_CARDS, type CharacterDef, type HeroTier } from '../data/characters';
import { CLASS_LOOKS, buildHeroTexture, heroKey } from '../gfx/art/heroes';
import { PortraitView } from '../gfx/art/heroPortrait';
import { setWorldScale } from '../gfx/hd';
import { button, COLORS, FONT, heading, txt } from '../ui/widgets';
import { drawRetroBox, RETRO } from '../ui/retro';
import { artGroup, coverImage, queueArt } from '../ui/art';
import { fadeIn, fadeTo } from '../ui/transition';
import { applyUiScale } from '../ui/layout';

const W = 960;
const H = 540;

const heroTex = (scene: Phaser.Scene, id: string) => {
  const look = CLASS_LOOKS[id as keyof typeof CLASS_LOOKS];
  return buildHeroTexture(scene, heroKey(look), look);
};

const RANDOM_NAMES = ['นักล่าคลื่น', 'เจ้าเกาะ', 'ลมทะเล', 'จอมขวาน', 'ปลาทอง', 'ราชันย์ทราย', 'เงาจันทร์', 'ดาวเหนือ'];

/** สีกรอบ/ตราตามระดับการ์ด (tier/role/badge มาจาก data/characters.ts) — แค่หน้าตา ไม่มีผลต่อค่าพลัง */
type Tier = HeroTier;
// สีหม่นตามชุด UI เรียบ (ระดับ: ทอง · แดง · พิเศษ)
const TIER_HEX: Record<Tier, number> = { gold: 0xb59a5e, red: 0x9a5a52, special: 0x7f7399 };
const TIER_CSS: Record<Tier, string> = { gold: '#e3c178', red: '#d98a7e', special: '#a991c9' };
const BADGE_HEX: Record<Tier, number> = { gold: 0x8a7444, red: 0x7a3f3a, special: 0x5e5478 };
const INK = '#eef0e6';

// ---- ขนาดการ์ด (4 ใบ/แถว · 2 แถว) ----
// 8 ใบ = 4 + 4 จัดกลางพื้นที่ซ้ายของแผงรายละเอียด · จอเล็กย่อตามแคนวาส
const PER_ROW = 4;
const CW = 108;
const CH = 152;
/** แถวปุ่มล่าง (กลับ · ชื่อ · สุ่ม · สุ่มเกาะ) อยู่แถวเดียวกัน ไม่ซ้อนกัน */
const BAR_Y = 506;
const GX = 12;
const GY = 12;
const GRID_X = 24;
const GRID_Y = 54;
/** ขอบซ้ายของแผงรายละเอียด */
const DETAIL_X = 636;

/** ภาพเต็มตัว 1:1 → ครอปช่วงหัวถึงเอวให้เต็มกรอบ (เหมือนรูปถ่ายครึ่งตัว) */
function portrait(img: Phaser.GameObjects.Image, x: number, y: number, w: number, h: number, top = 0.05, frac = 0.56) {
  const ch = img.height * frac;
  const cw = Math.min(img.width, ch * (w / h));
  const cx = (img.width - cw) / 2;
  const cy = img.height * top;
  const s = h / ch;
  img.setOrigin(0).setScale(s).setCrop(cx, cy, cw, ch);
  return img.setPosition(x - cx * s, y - cy * s);
}

/**
 * ขั้นที่ 1 ของการเริ่มเกม: เลือกตัวละคร + ตั้งชื่อผู้เล่น → ขั้นที่ 2 สุ่มลงเกาะบนแผนที่โลก
 * play = false คือดูตัวละครอย่างเดียว (จากหน้าแรก)
 * หน้าตาแบบ "การ์ดฮีโร่": กรอบคู่สีตามระดับ + วงเล็บมุม + ตราวงกลม · เลือกแล้วการ์ดยกขึ้น+เรือง
 */
export class CharacterSelectScene extends Phaser.Scene {
  private detail!: Phaser.GameObjects.Container;
  private chosen: CharacterDef = CHARACTERS[0];
  private play = false;
  private nameInput: Phaser.GameObjects.DOMElement | null = null;
  private cards: { id: string; c: Phaser.GameObjects.Container; glow: Phaser.GameObjects.Image; frame: Phaser.GameObjects.Graphics; y: number; tier: Tier }[] = [];

  constructor() {
    super('CharacterSelectScene');
  }

  private presetName = '';

  preload() {
    queueArt(this, [...artGroup('char_'), 'keyart']);
    // ตัวละครที่ 8 (ไลฟ์การ์ด) ไม่ได้อยู่ในรายการ ART หลัก — โหลดภาพการ์ดตรง ๆ (ไม่มีไฟล์ = ข้าม ใช้รูปวาดจากโค้ดแทน)
    if (!this.textures.exists('art_char_lifeguard')) this.load.image('art_char_lifeguard', 'art/char_lifeguard.jpg');
  }

  create(data: { play?: boolean; name?: string }) {
    this.presetName = data.name ?? '';
    this.play = !!data.play;
    this.cards = [];
    applyUiScale(this);
    fadeIn(this);
    this.cameras.main.setBackgroundColor('#141626');
    // พื้นหลังโทนสว่าง (ภาพปกจางๆ + ชั้นครีมโปร่ง) ให้การ์ดสีครีมดูเป็นหน้ากระดาษ
    const bgArt = coverImage(this, 'keyart', W, H);
    if (bgArt) {
      bgArt.setAlpha(0.5);
      this.tweens.add({ targets: bgArt, scale: bgArt.scale * 1.05, duration: 14000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else this.add.image(0, 0, 'title_sky').setOrigin(0).setScale(1, 1.5).setAlpha(0.5);
    this.add.rectangle(0, 0, W, H, 0x2a2340, 0.55).setOrigin(0);
    heading(this, W / 2, 8, this.play ? 'เลือกตัวละคร (1/2)' : `ตัวละคร ${CHARACTERS.length} แบบ`, 30).setOrigin(0.5, 0);
    const meta = MetaSave.load();
    this.chosen = CHARACTERS.find((c) => c.id === meta.lastCharacter && MetaSave.isUnlocked(meta, c.id)) ?? CHARACTERS[0];

    // เรียงตาม HERO_CARDS: 4 ใบแถวบน 4 ใบแถวล่าง (กลาง) ในพื้นที่ GRID_X..แผงรายละเอียด
    const order = HERO_CARDS.map((h) => CHARACTERS.find((c) => c.id === h.id)!).filter(Boolean);
    const areaW = DETAIL_X - 24 - GRID_X;
    order.forEach((c, i) => {
      const row = Math.floor(i / PER_ROW);
      const n = Math.min(PER_ROW, order.length - row * PER_ROW);
      const x = GRID_X + (areaW - (n * CW + (n - 1) * GX)) / 2 + (i % PER_ROW) * (CW + GX);
      const y = GRID_Y + row * (CH + GY);
      this.makeCard(c, x, y, MetaSave.isUnlocked(meta, c.id), i);
    });
    this.detail = this.add.container(0, 0);
    this.select(this.chosen, true);

    if (this.play) {
      // ช่องตั้งชื่อ (DOM input ทำงานได้ทั้งคอมและมือถือ)
      txt(this, 184, BAR_Y, 'ชื่อ', 15, COLORS.gold).setOrigin(0, 0.5);
      const el = document.createElement('input');
      el.type = 'text';
      el.maxLength = 16;
      el.placeholder = 'พิมพ์ชื่อของคุณ';
      el.value = meta.playerName || this.presetName;
      Object.assign(el.style, {
        width: '220px', height: '34px', fontSize: '17px', fontFamily: FONT, fontWeight: '500', padding: '0 10px', borderRadius: '8px',
        border: '2px solid #41a6f6', background: '#1a1c2c', color: '#f4f4f4', outline: 'none',
      });
      this.nameInput = this.add.dom(338, BAR_Y, el);
      button(this, 508, BAR_Y, 92, 38, '🎲 สุ่ม', () => {
        el.value = `${RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)]}${Math.floor(Math.random() * 99)}`;
      }, true, 14);
      button(this, 836, BAR_Y, 208, 44, 'สุ่มเกาะ ▶', () => this.next(el.value), true, 16);
    }
    button(this, 92, BAR_Y, 140, 40, '← กลับ', () => {
      this.nameInput?.destroy();
      fadeTo(this, 'TitleScene');
    });
  }

  /** ข้อความบนพื้นครีม (ไม่ใส่เส้นขอบ/เงาเข้ม) */
  private ink(x: number, y: number, s: string, size: number, color = INK, extra: Phaser.Types.GameObjects.Text.TextStyle = {}) {
    const t = txt(this, x, y, s, size, color, { stroke: '#ffffff', strokeThickness: 0, ...extra });
    t.setShadow(0, 0, '#000', 0, false, false);
    return t;
  }

  /** กรอบการ์ดแบบเรียบ (ชุด UI ยุค 90): แผงทึบสีเทาอมเขียว ขอบพิกเซลสีตามระดับ (หม่น) มุมตัด · เลือกอยู่ = ขอบสว่าง */
  private drawFrame(g: Phaser.GameObjects.Graphics, w: number, h: number, tier: Tier, selected: boolean) {
    g.clear();
    drawRetroBox(g, 0, 0, w, h, { edge: selected ? RETRO.edgeHi : TIER_HEX[tier], fill: selected ? RETRO.panel2 : RETRO.panel, cut: 3 });
  }

  private makeCard(c: CharacterDef, x: number, y: number, unlocked: boolean, i: number) {
    const info = { tier: c.tier, role: c.role, badge: c.badge };
    const cont = this.add.container(x, y);
    const glow = this.add.image(CW / 2, CH / 2, 'glow').setTint(0xffcd75).setScale(CW / 40, CH / 40).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    const frame = this.add.graphics();
    this.drawFrame(frame, CW, CH, info.tier, false);
    // แผงใน (เทาอ่อน) + ภาพครึ่งตัว
    const px = 12;
    const py = 12;
    const pw = CW - 24;
    const ph = 84;
    const panel = this.add.graphics();
    panel.fillStyle(0x26343e, 1).fillRect(px, py, pw, ph);
    const parts: Phaser.GameObjects.GameObject[] = [glow, frame, panel];
    const key = `art_char_${c.id}`;
    if (this.textures.exists(key)) {
      const img = portrait(this.add.image(0, 0, key), px + 2, py + 2, pw - 4, ph - 4);
      if (!unlocked) img.setTint(0x6a6a7a);
      parts.push(img);
    } else {
      const sp = setWorldScale(this.add.sprite(CW / 2, py + ph - 8, heroTex(this, c.id), 0).setOrigin(0.5, 1), 3);
      if (!unlocked) sp.setTintFill(0x555566);
      parts.push(sp);
    }
    // ตราวงกลมมุมขวาบนของแผง
    const bx = px + pw - 4;
    const by = py + 4;
    const badge = this.add.circle(bx, by, 11, BADGE_HEX[info.tier]).setStrokeStyle(2, 0xffffff, 1);
    const badgeT = this.ink(bx, by, info.badge, info.badge === 'AI' ? 9 : 11, '#ffffff', { fontStyle: '700' }).setOrigin(0.5);
    parts.push(badge, badgeT);
    // บทบาท (ไม่แสดงชื่อตัวละครตามที่ผู้ใช้ขอ) — เส้นบางสองข้าง
    const role = this.ink(CW / 2, py + ph + 14, unlocked ? info.role : 'ยังไม่ปลดล็อก', 15, unlocked ? TIER_CSS[info.tier] : INK, { fontStyle: '600' }).setOrigin(0.5, 0);
    const lines = this.add.graphics();
    const half = Math.min(role.width / 2 + 8, 48);
    const ly = py + ph + 14 + role.height + 6;
    lines.lineStyle(1, TIER_HEX[info.tier], 0.9).lineBetween(12, ly, CW / 2 - half, ly).lineBetween(CW / 2 + half, ly, CW - 12, ly);
    parts.push(role, lines);
    if (!unlocked) parts.push(this.ink(CW / 2, py + ph / 2, '🔒', 26, '#ffffff').setOrigin(0.5));
    cont.add(parts);
    const hit = this.add.zone(CW / 2, CH / 2, CW, CH).setInteractive({ useHandCursor: true });
    cont.add(hit);
    hit.on('pointerover', () => this.tweens.add({ targets: cont, scale: 1.04, duration: 120, ease: 'Sine.easeOut' }));
    hit.on('pointerout', () => this.tweens.add({ targets: cont, scale: 1, duration: 120 }));
    hit.on('pointerdown', () => this.select(c, unlocked));
    // เข้าฉากทีละใบ
    cont.setAlpha(0).setY(y + 10);
    this.tweens.add({ targets: cont, alpha: 1, y, duration: 240, delay: 60 + i * 50, ease: 'Cubic.easeOut' });
    this.cards.push({ id: c.id, c: cont, glow, frame, y, tier: info.tier });
  }

  private next(raw: string) {
    const name = raw.trim().slice(0, 16);
    if (name.length < 2) {
      Sfx.play('error');
      const t = txt(this, 142, 494, 'ตั้งชื่ออย่างน้อย 2 ตัวอักษร', 13, COLORS.bad).setOrigin(0.5);
      this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 400, onComplete: () => t.destroy() });
      return;
    }
    MetaSave.setProfile(name, this.chosen.id);
    this.nameInput?.destroy();
    fadeTo(this, 'RoomSelectScene', { character: this.chosen.id });
  }

  private select(c: CharacterDef, unlocked: boolean) {
    if (unlocked) this.chosen = c;
    Sfx.play('click', 60);
    for (const card of this.cards) {
      const on = card.id === c.id;
      this.drawFrame(card.frame, CW, CH, card.tier, on);
      this.tweens.killTweensOf(card.glow);
      this.tweens.add({ targets: card.glow, alpha: on ? 0.55 : 0, duration: 200 });
      this.tweens.add({ targets: card.c, y: on ? card.y - 8 : card.y, duration: 220, ease: 'Back.easeOut' });
    }
    const d = this.detail;
    d.removeAll(true);
    // ---- แผงรายละเอียด (ขวา) ภาษาเดียวกับการ์ด: ครีม กรอบทอง ฮีโร่ใหญ่ซ้าย ค่าเป็นแถว ----
    const info = { tier: c.tier, role: c.role, badge: c.badge };
    const x = DETAIL_X;
    const y = GRID_Y;
    const w = W - x - 24;
    const h = 2 * CH + GY;
    const g = this.add.graphics();
    this.drawFrame(g, w, h, 'gold', false);
    g.setPosition(x, y);
    d.add(g);
    const pw = 118;
    const ph = 140;
    const pane = this.add.graphics();
    pane.fillStyle(0x26343e, 1).fillRect(x + 16, y + 16, pw, ph);
    d.add(pane);
    const key = `art_char_${c.id}`;
    if (this.textures.exists(key)) {
      const img = portrait(this.add.image(0, 0, key), x + 18, y + 18, pw - 4, ph - 4, 0.04, 0.62);
      if (!unlocked) img.setTint(0x6a6a7a);
      d.add(img);
    } else {
      const big = new PortraitView(this, x + 16 + pw / 2, y + 16 + ph - 14, 1).show(CLASS_LOOKS[c.id as keyof typeof CLASS_LOOKS]).sprite; // รูปเหมือนละเอียด (gfx/art/heroPortrait)
      if (!unlocked) big.setTintFill(0x555566);
      d.add(big);
    }
    const tx = x + 16 + pw + 14;
    const tw = w - (tx - x) - 18;
    // ไม่แสดงชื่อตัวละคร — ใช้ "บทบาท" เป็นหัวข้อหลักแทน
    d.add(this.ink(tx, y + 18, unlocked ? info.role : 'ยังไม่ปลดล็อก', 22, unlocked ? TIER_CSS[info.tier] : INK, { fontStyle: '600' }));
    d.add(this.ink(tx, y + 72, unlocked ? c.desc : '', 13, '#9aa7a4', { wordWrap: { width: tw }, lineSpacing: 3, maxLines: 3 }));
    if (!unlocked) return;
    // แถวค่าสถานะ (ทุกตัวเริ่มเท่ากัน)
    const s = c.stats;
    const rows: [string, string][] = [
      ['HP', String(s.hp)], ['สแตมินา', String(s.stamina)], ['สกิล', c.skillText || c.skill.name], ['เก่งขึ้นจาก', 'เลเวล · อุปกรณ์ · อัพเกรด · ฐาน'], ['ตาย', 'ลด 1 เลเวล (Lv.1 = ซื้อชีวิต/ถาวร)'],
    ];
    let ry = y + 16 + ph + 14;
    rows.forEach(([k, v], i) => {
      const rg = this.add.graphics();
      rg.fillStyle(i % 2 ? 0x2b3a45 : 0x26343e, 0.9).fillRect(x + 16, ry, w - 32, 24);
      d.add(rg);
      d.add(this.ink(x + 26, ry + 12, k, 12, '#8a8498').setOrigin(0, 0.5));
      const vt = this.ink(x + w - 26, ry + 12, v, 13, INK, { fontStyle: '600' }).setOrigin(1, 0.5);
      if (vt.width > w - 130) vt.setScale((w - 130) / vt.width);
      d.add(vt);
      ry += 27;
    });
  }
}
