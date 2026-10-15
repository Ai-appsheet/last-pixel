import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { MetaSave, todayKey } from '../core/MetaSave';
import { SaveManager } from '../core/SaveManager';
import { ACHIEVEMENTS } from '../data/achievements';
import { getCharacter } from '../data/characters';
import { RETRO, retroCursor, retroLabel, retroPanel } from '../ui/retro';
import { BIOMES } from '../data/islands';
import { CONTROL_MODES, getControlMode, setControlMode } from '../core/ControlMode';
import { getSettings, setSettings } from '../core/Settings';
import { chunkyTxt, COLORS, FONT, heading, PIXEL_FONT, txt } from '../ui/widgets';
import { getAccounts, type AuthResult, type SendResult } from '../core/AccountService';
import { cancelGoogle, promptGoogleOneTap, renderGoogleButton } from '../core/GoogleSignIn';
import { apiEnabled, netStatus, onNetStatus } from '../core/backend/Api';
import { Sync, fetchLeaderboard } from '../core/backend/Sync';
import { WORLD_ROOM, getRoomService, localPlayerId } from '../core/RoomService';
import { ART, coverCrop, coverImage, queueArt } from '../ui/art';
import { queueItemArtIndex } from '../ui/itemArt';
import { fancyButton, fancyPanel, fitText, iconTexture } from '../ui/fancyButton';
import { fadeIn, fadeTo, popIn } from '../ui/transition';
import { anchorGroup, applyUiScale, reducedMotion } from '../ui/layout';
import { fmtMoney } from '../ui/money';
import { QUALITY_PREFS, quality, qualityName, qualityPref, setQualityPref } from '../core/Quality';

const W = 960;
const H = 540;
/** ขนาดพิกเซลของโลโก้ (SURVIVOR 8 ตัว ×4 ≈ 284px พอดีคอลัมน์ซ้าย) */
const LOGO_PX = 4;
/** จอเล็ก: ขยายคอลัมน์เมนูซ้าย + กลุ่มมุมขวาบน */
const MENU_K = 1.18;
/** คอลัมน์ซ้าย (โลโก้ + ชื่อไทย + เมนู/ฟอร์มบัญชี) — ภาพ title_bg ฝั่งซ้ายเป็นฟ้า/ทะเลโล่ง */
const COL_X = 36;
const COL_W = 300;
/** ขอบบนของกล่องเมนู (ใต้โลโก้ + ชื่อไทย) — ฟอร์มบัญชีใช้ค่าเดียวกัน */
const PANEL_Y = 156;
/** กล่องเมนู/การ์ดสไลด์: กว้างใกล้เคียงโลโก้ (~266) กึ่งกลางคอลัมน์ */
const MENU_W = 290;
const MENU_X = COL_X + (COL_W - MENU_W) / 2;

/**
 * หน้าแรก (แบบอลังการ): ภาพ key art "ภูเขาไฟปะทุ" นิ่ง (title_bg — ภาพเดียวกับหน้าโหลด) + กรอบทองมุม + วิกเนตต์เข้ม
 * คอลัมน์ซ้าย: แผ่นป้ายทองหลังโลโก้/ชื่อไทย · เมนูไอคอนภาพวาด · การ์ดสไลด์ key art/บอสด่าน
 * เคลื่อนไหวเบาๆ เท่านั้น (แสงวิ้งโลโก้ หิ่งห้อย/ประกายไฟไม่กี่ดวง)
 */
export class TitleScene extends Phaser.Scene {
  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('TitleScene');
  }

  private keyArt?: Phaser.GameObjects.Image;
  /** ขอบล่างของกล่องเมนู (เข้าระบบแล้ว) — 0 = หน้าฟอร์มเข้าสู่ระบบ */
  private menuBottom = 0;

  /** จอเล็ก (มือถือ) — ซ่อนของตกแต่งเล็กๆ ที่อ่านไม่ออก */
  private compact = false;
  /** ลดการเคลื่อนไหว / คุณภาพต่ำ → ไม่มีเอฟเฟกต์เคลื่อนไหวเลย */
  private still = false;
  create() {
    this.compact = applyUiScale(this);
    this.still = reducedMotion() || quality() === 'low';
    fadeIn(this);
    this.menuBottom = 0;
    queueArt(this, ART, true);
    queueItemArtIndex(this, true);
    this.keyArt = undefined;
    this.overlay = null;
    this.menuMsg = null;
    this.entering = false;
    this.makeTextures();
    this.drawCover();
    this.drawMenu();
    this.drawLogo();
    this.drawNet();
    // ออนไลน์ + จำการเข้าระบบไว้: ดึงเซฟล่าสุดจากเซิร์ฟเวอร์ (เครื่องอื่นอาจเล่นต่อไปแล้ว) → วาดเมนูใหม่ถ้าเปลี่ยน
    if (apiEnabled() && getAccounts().current()) {
      void Sync.pullOnce().then((changed) => {
        if (!this.sys.isActive() || this.overlay || this.entering) return;
        if (changed || !getAccounts().current()) this.scene.restart();
      });
    }
    // การ์ดไฮไลต์ + สลับภาพหน้าแรก — ถ้าภาพยังโหลดไม่เสร็จ (เปิดครั้งแรก) วาดตอนโหลดเสร็จ
    const extras = () => {
      if (!this.sys.isActive()) return;
      this.swapArt();
      this.drawShowcase();
    };
    // รอด้วยการเช็กเป็นระยะ (ไม่พึ่ง event 'complete' — ซีน restart ระหว่างโหลดแล้ว event หาย)
    const waitArt = () => (this.load.isLoading() ? this.time.delayedCall(400, waitArt) : extras());
    // เริ่มเฟรมถัดไป (ระหว่าง create() ซีนยังไม่ "active" → ถ้าภาพโหลดครบแล้ว เช่น restart การ์ดจะไม่ถูกวาด)
    this.time.delayedCall(0, waitArt);
    Sfx.startMusic('title'); // เล่นจริงหลังแตะครั้งแรก (ปลดล็อกเสียง)
    this.input.once('pointerdown', () => Sfx.unlock());
  }

  // ---------------------------------------------------------------- texture เฉพาะหน้าปก

  private makeTextures() {
    // เงามืดด้านซ้ายหลังโลโก้/เมนู ให้อ่านง่ายบนท้องฟ้าสว่าง
    if (!this.textures.exists('tt_leftshade')) {
      const t = this.textures.createCanvas('tt_leftshade', 560, H)!;
      const ctx = t.getContext();
      const g = ctx.createLinearGradient(0, 0, 560, 0);
      g.addColorStop(0, 'rgba(8,8,22,0.78)');
      g.addColorStop(0.5, 'rgba(8,8,22,0.5)');
      g.addColorStop(1, 'rgba(8,8,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 560, H);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
  }

  // ---------------------------------------------------------------- ภาพปก

  private drawCover() {
    // ภาพ key art นิ่งเต็มจอ (ไม่ซูม ไม่เลื่อน) — ยังไม่มีภาพใหม่ = ภาพปกเก่า/ฟ้าพลบค่ำแทน แล้วสลับตอนโหลดเสร็จ
    const art = coverImage(this, 'title_bg', W, H) ?? coverImage(this, 'cover', W, H) ?? coverImage(this, 'keyart', W, H);
    if (art) this.keyArt = art.setDepth(-10);
    else this.add.image(0, 0, 'title_sky').setOrigin(0).setDisplaySize(W, H).setDepth(-10);
    this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0.6);
    this.add.image(0, 0, 'tt_leftshade').setOrigin(0);
    // ตกแต่งอลังการแบบนิ่ง (วิกเนตต์เข้มขึ้น + เงาซ้ายเข้มขึ้น + กรอบทองมุม)
    this.drawGrandFrame();
    if (this.still) return;
    // หิ่งห้อยไม่กี่ดวง ลอยช้าๆ จางๆ (ฝั่งขวา ไม่ทับเมนู)
    const R = Phaser.Math.Between;
    for (let i = 0; i < 6; i++) {
      const f = this.add.image(R(420, 940), R(230, 500), 'firefly').setScale(2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.tweens.add({ targets: f, alpha: 0.35, x: f.x + R(-24, 24), y: f.y - R(16, 40), duration: R(5000, 8000), yoyo: true, repeat: -1, delay: R(0, 4000), ease: 'Sine.easeInOut' });
    }
    // ประกายไฟ/ขี้เถ้าสีส้มลอยขึ้นช้าๆ (ฝั่งขวา ไม่ทับเมนู) — จางๆ ไม่กี่ดวง ไม่ทำให้ตาลาย
    this.drawEmbers();
  }

  /** วิกเนตต์เข้มขึ้น + เงาซ้ายเข้มขึ้น + กรอบทองประดับ 4 มุม + เส้นขอบรอบจอ (นิ่งทั้งหมด) — ขอบเว้นเข้ามาให้เห็นชัดบนจอ 16:9 */
  private drawGrandFrame() {
    this.add.image(0, 0, 'vignette').setOrigin(0).setAlpha(0.5).setDepth(0);
    this.add.image(0, 0, 'tt_leftshade').setOrigin(0).setAlpha(0.75).setDepth(0);
    const g = this.add.graphics().setDepth(7);
    const m = 14;
    const L = 40;
    const col = 0xffcd75;
    const dark = 0x1a1030;
    // เส้นขอบรอบจอ 2 ชั้น (เข้มด้านนอก + ทองด้านใน)
    g.lineStyle(3, dark, 0.5).strokeRect(m - 1, m - 1, W - 2 * m + 2, H - 2 * m + 2);
    g.lineStyle(1, col, 0.3).strokeRect(m, m, W - 2 * m, H - 2 * m);
    // ฉากมุมทอง 4 มุม (เส้นหนา + ขอบเข้มใต้ให้ดูมีมิติ)
    const corner = (x: number, y: number, dx: number, dy: number) => {
      g.lineStyle(4, dark, 0.55);
      g.beginPath();
      g.moveTo(x + dx, y + dy * L + dy);
      g.lineTo(x + dx, y + dy);
      g.lineTo(x + dx * L + dx, y + dy);
      g.strokePath();
      g.lineStyle(3, col, 1);
      g.beginPath();
      g.moveTo(x, y + dy * L);
      g.lineTo(x, y);
      g.lineTo(x + dx * L, y);
      g.strokePath();
      // อัญมณีมุม (สี่เหลี่ยมหมุน 45°)
      g.fillStyle(col, 1);
      const s = 4;
      g.fillPoints([new Phaser.Geom.Point(x, y - s * dy - dy), new Phaser.Geom.Point(x + s * dx, y), new Phaser.Geom.Point(x, y + s * dy + dy), new Phaser.Geom.Point(x - s * dx, y)], true);
    };
    corner(m, m, 1, 1);
    corner(W - m, m, -1, 1);
    corner(m, H - m, 1, -1);
    corner(W - m, H - m, -1, -1);
  }

  /** ประกายไฟลอยขึ้น (ADD) จางๆ 8 ดวง ฝั่งขวา */
  private drawEmbers() {
    const R = Phaser.Math.Between;
    for (let i = 0; i < 8; i++) {
      const e = this.add.image(R(430, 930), R(300, 520), 'firefly').setTint(0xffa64a).setScale(1.4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDepth(3);
      const dur = R(5200, 8200);
      this.tweens.add({
        targets: e,
        y: e.y - R(130, 220),
        duration: dur,
        repeat: -1,
        ease: 'Sine.easeOut',
        delay: R(0, 5000),
        onRepeat: () => {
          e.x = R(430, 930);
          e.y = R(320, 520);
        },
      });
      this.tweens.add({ targets: e, alpha: 0.5, duration: dur / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: R(0, 5000) });
    }
  }

  /** ภาพ title_bg โหลดเสร็จทีหลัง (เปิดครั้งแรก) → เฟดเข้ามาแทนภาพสำรอง */
  private swapArt() {
    if (this.keyArt?.texture.key === 'art_title_bg') return;
    const img = coverImage(this, 'title_bg', W, H);
    if (!img) return;
    img.setDepth(-9);
    const old = this.keyArt;
    this.keyArt = img;
    if (this.still) return void old?.destroy();
    img.setAlpha(0);
    this.tweens.add({ targets: img, alpha: 1, duration: 600, onComplete: () => old?.destroy() });
  }

  // ---------------------------------------------------------------- โลโก้

  /**
   * โลโก้หนึ่งบรรทัดเป็นพิกเซลจริง (texture `key` + เฟรมแสงวิ้ง `key_shine`):
   * ไล่สีทอง→แดง (หรือฟ้าทะเลถ้า blue) + ขอบบนสว่าง + มิติด้านล่าง + ขอบหนาสองชั้น + เงาตก
   */
  private buildLogoTexture(text: string, key: string, blue: boolean) {
    if (this.textures.exists(key)) return;
    // วาดฟอนต์ใหญ่ ×8 แล้วสุ่มจุดกึ่งกลางช่อง → ได้ mask 1 พิกเซลต่อ 1 จุดฟอนต์ (คมทุกเครื่อง)
    const S = 8;
    const cv = document.createElement('canvas');
    cv.width = text.length * 8 * S + 64;
    cv.height = 8 * S + 48;
    const c2 = cv.getContext('2d')!;
    c2.font = `${8 * S}px ${PIXEL_FONT}`;
    c2.textBaseline = 'top';
    c2.fillStyle = '#ffffff';
    c2.fillText(text, 16, 16);
    const data = c2.getImageData(0, 0, cv.width, cv.height).data;
    let minX = cv.width;
    let minY = cv.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (data[(y * cv.width + x) * 4 + 3] > 127) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const gw = maxX < 0 ? 1 : Math.round((maxX - minX + 1) / S);
    const gh = maxY < 0 ? 1 : Math.round((maxY - minY + 1) / S);
    const mask = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= gw || y >= gh || maxX < 0) return false;
      const px = Math.min(cv.width - 1, minX + x * S + S / 2);
      const py = Math.min(cv.height - 1, minY + y * S + S / 2);
      return data[(py * cv.width + px) * 4 + 3] > 127;
    };
    const PAD = 3;
    const w = gw + PAD * 2;
    const h = gh + PAD * 2 + 1;
    const face = (x: number, y: number) => mask(x - PAD, y - PAD);
    const ext = (x: number, y: number) => face(x, y) || face(x, y - 1); // หน้า + มิติด้านล่าง 1 พิกเซล
    const near = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 1 && Math.abs(dx) === r && Math.abs(dy) === r) continue; // มุมมน
          if (ext(x + dx, y + dy)) return true;
        }
      }
      return false;
    };
    const ramp = blue
      ? ['#e4fbff', '#b8f6ff', '#73eff7', '#41c6f6', '#41a6f6', '#3b7dd9', '#3b5dc9']
      : ['#fff2b0', '#ffe08a', '#ffcd75', '#f7a65f', '#ef7d57', '#d65a50', '#b13e53'];
    const faceColor = (y: number) => ramp[Math.min(ramp.length - 1, Math.floor(((y - PAD) / Math.max(1, gh)) * ramp.length))];
    const lighten = (hex: string, t: number) => {
      const n = parseInt(hex.slice(1), 16);
      const m = (v: number) => Math.round(v + (255 - v) * t);
      return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
    };
    const t = this.textures.createCanvas(key, w + 1, h + 1)!;
    const ctx = t.getContext();
    const dot = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    // เงาตก
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(x, y, 2)) dot(x + 1, y + 1, 'rgba(11,13,31,0.75)');
    const pts: [number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (face(x, y)) {
          let c = faceColor(y);
          if (!face(x, y - 1) && y > PAD) c = lighten(c, 0.5); // ขอบบนสว่าง (bevel)
          else if (!face(x - 1, y)) c = lighten(c, 0.18);
          dot(x, y, c);
          pts.push([x, y]);
        } else if (ext(x, y)) dot(x, y, blue ? '#1d3466' : '#7a2440'); // มิติ
        else if (near(x, y, 1)) dot(x, y, '#1a1c2c'); // ขอบใน
        else if (near(x, y, 2)) dot(x, y, blue ? '#29366f' : '#5d275d'); // ขอบนอก
      }
    }
    t.refresh();
    // เฟรมแสงวิ้งพาดเฉียง (ช้า นุ่ม)
    const N = 20;
    const sk = `${key}_shine`;
    const st = this.textures.createCanvas(sk, (w + 1) * N, h + 1)!;
    const sctx = st.getContext();
    for (let f = 0; f < N; f++) {
      const p = -gh * 2 + ((w + gh * 4) * f) / (N - 1);
      for (const [x, y] of pts) {
        const d = x + (h - y) * 0.7 - p;
        if (d < 0 || d >= 4) continue;
        sctx.fillStyle = d >= 1 && d < 2.5 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
        sctx.fillRect(f * (w + 1) + x, y, 1, 1);
      }
      st.add(f, 0, f * (w + 1), 0, w + 1, h + 1);
    }
    st.refresh();
    if (!this.anims.exists(`${sk}_a`)) {
      this.anims.create({ key: `${sk}_a`, frames: this.anims.generateFrameNumbers(sk, { start: 0, end: N - 1 }), frameRate: 22, repeat: 0 });
    }
  }

  /** โลโก้ 2 บรรทัด (SURVIVOR ทอง / ISLES ฟ้า) + ชื่อไทย — วางกลางคอลัมน์ซ้าย นิ่ง มีแค่แสงวิ้งช้าๆ ทุก ~7 วิ */
  private drawLogo() {
    // จอเล็ก + เมนู (เข้าระบบแล้ว): คอลัมน์ถูกขยาย ×MENU_K จากมุมซ้ายบน → เลื่อนหัวตามให้ตรงกลางคอลัมน์ (ฟอร์มบัญชีไม่ขยาย)
    const cx = (COL_X + COL_W / 2) * (this.compact && this.menuBottom > 0 ? MENU_K : 1);
    const head = this.add.container(0, 0).setDepth(2);
    // แผ่นป้ายหัวเรื่องประดับ (กรอบทอง 2 ชั้น + เส้นประดับใต้ชื่อไทย) หลังโลโก้ — ให้ดูอลังการ + อ่านง่ายบนภาพ
    {
      const pg = this.add.graphics();
      const bw = COL_W + 8;
      const bh = 132;
      const bx0 = cx - bw / 2;
      const by0 = 16;
      pg.fillStyle(0x0b0d1f, 0.5).fillRoundedRect(bx0, by0, bw, bh, 12);
      pg.lineStyle(2, 0xffcd75, 0.5).strokeRoundedRect(bx0, by0, bw, bh, 12);
      pg.lineStyle(1, 0x7a2440, 0.6).strokeRoundedRect(bx0 + 3, by0 + 3, bw - 6, bh - 6, 9);
      pg.lineStyle(1, 0xffcd75, 0.55).lineBetween(cx - 56, by0 + bh - 12, cx + 56, by0 + bh - 12);
      pg.fillStyle(0xffcd75, 0.9);
      [cx - 70, cx + 70].forEach((dx) => pg.fillPoints([new Phaser.Geom.Point(dx, by0 + bh - 16), new Phaser.Geom.Point(dx + 4, by0 + bh - 12), new Phaser.Geom.Point(dx, by0 + bh - 8), new Phaser.Geom.Point(dx - 4, by0 + bh - 12)], true));
      head.add(pg);
    }
    const shines: Phaser.GameObjects.Sprite[] = [];
    ([['SURVIVOR', 'tt_logo_w1', 40, false], ['ISLES', 'tt_logo_w2', 90, true]] as const).forEach(([word, key, y, blue]) => {
      this.buildLogoTexture(word, key, blue);
      const s = this.add.sprite(cx, y, `${key}_shine`, 0).setScale(LOGO_PX).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      head.add([this.add.image(cx, y, key).setScale(LOGO_PX), s]);
      shines.push(s);
    });
    // ชื่อไทย: ตัวหนาคม ขอบเข้ม อ่านง่าย (ไม่ขยับ)
    // ชื่อไทย: ตัวพิกเซลหนาแบบหน้าโหลด (ครีม → ทอง ขอบ/เงาเข้ม) ให้เข้ากับโลโก้
    const sub = chunkyTxt(this, cx, 135, 'เอาชีวิตรอดบนหมู่เกาะ', 24, '#fff6d8', {}, { outline: '#1a1030', shadow: '#5a1f2b' }).setOrigin(0.5);
    const g = sub.context.createLinearGradient(0, 0, 0, sub.height);
    g.addColorStop(0.2, '#fff6d8');
    g.addColorStop(1, '#ffcd75');
    head.add(sub.setFill(g));
    if (this.still) return;
    head.setAlpha(0);
    this.tweens.add({ targets: head, alpha: 1, duration: 500, delay: 100 });
    const glint = () =>
      shines.forEach((s, i) =>
        this.time.delayedCall(i * 300, () => {
          if (!s.active) return;
          s.setVisible(true).play(`${s.texture.key}_a`);
          s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.setVisible(false));
        }),
      );
    this.time.delayedCall(1400, glint);
    this.time.addEvent({ delay: 7000, loop: true, callback: glint });
  }

  // ---------------------------------------------------------------- เมนู

  private drawMenu() {
    const acc = getAccounts().current();
    // ยังไม่เข้าระบบ / บัญชีเก่ายังไม่ผูกอีเมล → ฟอร์มบัญชี
    if (!acc || acc.needName || (acc.needEmail && !this.attachSkipped)) return this.drawAuth();
    const meta = MetaSave.load();
    const save = SaveManager.load();
    /** ของที่มีอยู่ก่อนวาดเมนู — ที่เพิ่มหลังจากนี้คือคอลัมน์ซ้าย (ไว้ขยายบนจอเล็ก) */
    const before = new Set(this.children.list);
    const x = MENU_X;
    const y = PANEL_Y;
    const pw = MENU_W;
    const bx = x + pw / 2;
    // ---------- เมนูแบบเกมพิกเซลยุค 90: รายการตัวหนังสือในแผงบาง + ไอคอนภาพวาดชุดเมนูนำหน้า ----------
    const PAD = 10;
    type Item = { label: string; sub?: string; color: string; h: number; art: string; run: () => void };
    const items: Item[] = [
      save
        ? { label: 'ไปเกาะของฉัน', sub: [getCharacter(save.character).name, `Lv.${save.player.level ?? 1}`, `วันที่ ${save.day}`].join(' · '), color: RETRO.css.sage, h: 40, art: 'map', run: () => void this.enterIsland() }
        : { label: 'เริ่มผจญภัย', sub: 'เลือกตัวละคร · สุ่มเกาะ', color: RETRO.css.sage, h: 40, art: 'map', run: () => void this.enterIsland() },
      { label: 'คลัง & ร้านค้า', color: RETRO.css.text, h: 30, art: 'catalog', run: () => fadeTo(this, 'CatalogScene') },
      { label: 'ตัวละคร', color: RETRO.css.text, h: 30, art: 'wardrobe', run: () => fadeTo(this, 'CharacterSelectScene', {}) },
    ];
    const tiles: { art: string; label: string; run: () => void }[] = [
      { art: 'trophy', label: 'ความสำเร็จ', run: () => this.showAchievements() },
      { art: 'rank', label: 'อันดับ', run: () => this.showLeaderboard() },
      { art: 'guide', label: 'วิธีเล่น', run: () => this.showHelp() },
      { art: 'settings', label: 'ตั้งค่า', run: () => this.showSettings() },
    ];
    // ไอคอนเมนูภาพวาด (public/art/ui/menu_*.png) — โหลดเองตามต้องการ · ระหว่างโหลดซ่อนไว้ แล้วเปลี่ยนเมื่อเสร็จ
    const iconSwaps: Array<() => void> = [];
    const menuIcon = (ix: number, iy: number, art: string, size: number) => {
      const key = `tt_mi_${art}`;
      const img = this.add.image(Math.round(ix), Math.round(iy), this.textures.exists(key) ? key : 'i_coin').setDisplaySize(size, size);
      if (!this.textures.exists(key)) {
        img.setAlpha(0);
        iconSwaps.push(() => img.active && img.setTexture(key).setDisplaySize(size, size).setAlpha(1));
      }
      return img;
    };
    const TILE = 46;
    const listH = items.reduce((a, it) => a + it.h, 0);
    const rows = PAD + listH + 10 + TILE + PAD;
    retroPanel(this, x, y, pw, rows);
    this.menuBottom = y + rows;
    const strip = this.add.rectangle(x + 4, 0, pw - 8, 10, 0xffffff, 0.06).setOrigin(0, 0);
    const cursor = retroCursor(this, x + 14, 0);
    const rowsY: number[] = [];
    let sel = 0;
    const select = (i: number) => {
      sel = (i + items.length) % items.length;
      strip.setY(rowsY[sel]).setSize(pw - 8, items[sel].h);
      cursor.setY(rowsY[sel] + (items[sel].sub ? 13 : items[sel].h / 2));
    };
    let ry = y + PAD;
    const LX = x + 54; // ข้อความเริ่มหลังไอคอนภาพ (▶ ที่ x+14 · ไอคอนที่ x+34)
    items.forEach((it, i) => {
      rowsY.push(ry);
      menuIcon(x + 34, ry + it.h / 2, it.art, it.sub ? 30 : 24);
      const t = retroLabel(this, LX, ry + (it.sub ? 13 : it.h / 2), it.label, it.color).setOrigin(0, 0.5);
      if (it.sub) fitText(txt(this, LX, ry + 29, it.sub, 11, RETRO.css.muted).setOrigin(0, 0.5), pw - LX + x - 14);
      fitText(t, pw - LX + x - 14);
      const hit = this.add.zone(x, ry, pw, it.h).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => select(i));
      hit.on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        it.run();
      });
      ry += it.h;
    });
    select(0);
    // ↑/↓ เลือก · Enter/Space ตกลง (เมนูหลักเท่านั้น — ไม่ทำงานตอนมีหน้าต่างย่อย)
    const kb = this.input.keyboard;
    const onKey = (e: KeyboardEvent) => {
      if (this.overlay || this.entering || !this.sys.isActive()) return;
      if (e.key === 'ArrowDown') select(sel + 1);
      else if (e.key === 'ArrowUp') select(sel - 1);
      else if (e.key === 'Enter' || e.key === ' ') {
        Sfx.play('click');
        items[sel].run();
      } else return;
      Sfx.play('click', 50);
    };
    kb?.on('keydown', onKey);
    this.events.once('shutdown', () => kb?.off('keydown', onKey));
    // เส้นคั่น + ปุ่มไอคอนเล็ก 4 ช่อง (ไอคอนบน ชื่อเล็กล่าง)
    const sepY = y + PAD + listH + 4;
    this.add.rectangle(x + 12, sepY, pw - 24, 1, RETRO.edge, 0.6).setOrigin(0, 0);
    const tw = (pw - 2 * PAD - 3 * 6) / 4;
    tiles.forEach((tl, i) => {
      const tx = x + PAD + i * (tw + 6);
      const ty = sepY + 6;
      const box = retroPanel(this, tx, ty, tw, TILE, { fill: RETRO.panel2, alpha: 0.9 });
      // ไอคอนภาพวาดชุดเมนู (ถ้วยรางวัล/มงกุฎ/คัมภีร์/เฟือง)
      menuIcon(tx + tw / 2, ty + 15, tl.art, 26);
      const lab = txt(this, tx + tw / 2, ty + 34, tl.label, 11, RETRO.css.muted).setOrigin(0.5);
      fitText(lab, tw - 6);
      const hit = this.add.zone(tx, ty, tw, TILE).setOrigin(0).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => {
        box.setY(ty - 1);
        lab.setColor(RETRO.css.gold);
      });
      hit.on('pointerout', () => {
        box.setY(ty);
        lab.setColor(RETRO.css.muted);
      });
      hit.on('pointerdown', () => {
        Sfx.unlock();
        Sfx.play('click');
        tl.run();
      });
    });

    // โหลดไอคอนเมนูภาพวาดที่ยังไม่มี แล้วเปลี่ยนภาพเมื่อเสร็จ (ครั้งแรกเท่านั้น · ครั้งต่อไปใช้แคช)
    const iconNames = ['map', 'catalog', 'wardrobe', 'trophy', 'rank', 'guide', 'settings'];
    const missingIcons = iconNames.filter((n) => !this.textures.exists(`tt_mi_${n}`));
    if (missingIcons.length) {
      for (const n of missingIcons) this.load.image(`tt_mi_${n}`, `art/ui/menu_${n}.png`);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        if (!this.sys.isActive()) return;
        iconNames.forEach((n) => this.textures.exists(`tt_mi_${n}`) && this.textures.get(`tt_mi_${n}`).setFilter(Phaser.Textures.FilterMode.LINEAR));
        iconSwaps.forEach((f) => f());
      });
      this.load.start();
    }

    this.menuMsg = txt(this, bx, y + rows + 8, this.pendingMsg ?? '', 12, COLORS.bad, { align: 'center', wordWrap: { width: pw } }).setOrigin(0.5, 0).setStroke('#0b0d1f', 4);
    this.pendingMsg = null;
    // มือถือ: ขยายคอลัมน์ซ้าย ×1.18 ยึดมุมซ้ายบน — ปุ่มใหญ่พอให้นิ้วกด (การ์ดไฮไลต์ด้านล่างซ่อนไว้)
    if (this.compact) {
      const col = this.children.list.filter((o) => !before.has(o));
      this.add.container(0, 0, col).setScale(MENU_K);
      this.menuBottom = Math.round(this.menuBottom * MENU_K);
    }

    // ---------- มุมขวาบน: เสียง + บัญชี + สถิติ (ขวาของมังกรในภาพ x ≥ 746) ----------
    const before2 = new Set(this.children.list);
    // แผงเดียวมุมขวาบน: เสียง · ชื่อบัญชี · ออกจากระบบ + สถิติ 2 แถว
    const logout = async () => {
      if (this.entering) return;
      // ออนไลน์: ส่งเซฟที่ค้างขึ้นเซิร์ฟเวอร์ก่อนออก
      if (apiEnabled()) {
        this.entering = true;
        this.menuMsg?.setText('กำลังบันทึก…').setColor(COLORS.dim);
        await Sync.flush();
        if (!this.sys.isActive()) return;
      }
      getAccounts().logout();
      this.scene.restart();
    };
    this.drawAccount(acc.username, logout, meta, save?.wallet);
    if (this.compact) {
      const tr = this.children.list.filter((o) => !before2.has(o));
      anchorGroup(this, W, 0, MENU_K, 0).add(tr);
    }
    // เวอร์ชัน: มุมขวาล่าง ตัวเล็กจาง
    // (เลขเวอร์ชันเอาออก — หน้าแรกเหลือเท่าที่จำเป็น)
  }

  // ---------------------------------------------------------------- ไฮไลต์บนหน้าปก

  /**
   * การ์ดไฮไลต์ใต้เมนู: ตัวละคร ด่าน บอส เกาะพิเศษ ภัยพิบัติ — นิ่ง เปลี่ยนเมื่อแตะ/กดลูกศร หรือเองทุก 9 วิ (เฟดข้าม)
   * หน้าฟอร์มบัญชี / จอเล็ก ไม่แสดง
   */
  private drawShowcase() {
    // สไลด์ = ตัวอย่างแมพ (เกาะ) สลับกับมหันตภัย — ไม่ใช้ภาพที่มีตัวละครเด่นกลางภาพ
    type Slide = { art: string; tag: string; title: string; sub: string; color: string; bg: string; focus?: number };
    const short = (d: string) => (d.split('—').pop() ?? d).trim();
    const maps: Slide[] = (['forest', 'crystal', 'volcanic', 'glacier', 'jungle', 'atoll', 'snow', 'mushroom', 'desert', 'bamboo', 'swamp', 'savanna', 'ruins', 'haunted'] as const)
      .map((b) => ({ art: `isl_${b}`, tag: 'เกาะ', title: BIOMES[b].name, sub: short(BIOMES[b].desc), color: '#73eff7', bg: '#3d6e68', focus: 0.5 }));
    maps.splice(3, 0, { art: 'market_island', tag: 'เกาะกลาง', title: 'ตลาดผู้รอดชีวิต', sub: 'ซื้อขายกับผู้เล่น · ห้ามต่อสู้', color: '#ffcd75', bg: '#3d6e68', focus: 0.5 });
    const hz = (art: string, title: string, sub: string): Slide => ({ art, tag: 'มหันตภัย', title, sub, color: '#ef7d57', bg: '#8a4440', focus: 0.35 });
    const disasters: Slide[] = [
      hz('hz_tsunami', 'คลื่นยักษ์', 'พาสัตว์ทะเลขึ้นฝั่ง · ถอยจากหาด'),
      hz('hz_tornado', 'พายุทอร์นาโด', 'ดูดคนและของ · พังสิ่งก่อสร้าง'),
      hz('hz_eruption', 'ภูเขาไฟระเบิด', 'ลาวาตกใส่ · บ้านหินทนกว่า'),
      hz('raid_night', 'คืนมอนบุก', 'มอนบุกฐานทุกคืน · สร้างป้อมรับมือ'),
      hz('hz_meteor', 'อุกกาบาตตก', 'หลบให้ทัน · ได้แร่อุกกาบาต'),
      hz('hz_blizzard', 'พายุหิมะ', 'หนาวจัด เดินช้า · ก่อไฟ'),
      hz('raid_sea_rage', 'ทะเลคลั่ง', 'ฉลาม คราเคน ปูยักษ์ขึ้นฝั่ง'),
      hz('hz_wildfire', 'ไฟป่า', 'ลามตามต้นไม้ · บ้านไม้ติดไฟ'),
      hz('hz_quake', 'แผ่นดินไหว', 'สิ่งก่อสร้างพัง · หินทนกว่าไม้'),
      hz('raid_ghost_night', 'คืนหมอกผี', 'วิญญาณเร่ร่อนออกล่า'),
      hz('hz_flood', 'น้ำท่วม', 'ริมฝั่งเดินช้า · ขึ้นที่สูง'),
      hz('hz_whirlpool', 'วังน้ำวน', 'ดูดเรือ · แล่นออกด้านข้าง'),
      hz('raid_skeleton_army', 'กองทัพโครงกระดูก', 'บุกเป็นฝูงยามดึก'),
      hz('hz_eclipse', 'สุริยุปราคา', 'มอนกลางคืนออกกลางวัน'),
      hz('hz_toxic_fog', 'หมอกพิษ', 'อย่ายืนในหมอก · หลบในบ้าน'),
      hz('raid_legend', 'สัตว์ในตำนานบุก', 'มังกรนำทัพบุกเกาะ'),
      hz('hz_acid_rain', 'ฝนกรด', 'ของ/ผักนอกบ้านเสียหาย'),
      hz('hz_locusts', 'ฝูงตั๊กแตน', 'กินผักในไร่ · ตั้งหุ่นไล่กา'),
      hz('hz_stampede', 'ฝูงสัตว์คลั่ง', 'ตั้งหลักในบ้าน/ป้อม'),
    ];
    // ภาพ key art ใหม่ (16:9 อลังการ) — โชว์เต็มกรอบ จัดกลาง เป็นสไลด์เปิด
    const feat = (art: string, title: string, sub: string): Slide => ({ art, tag: 'ไฮไลต์', title, sub, color: '#ffcd75', bg: '#7a5a2a', focus: 0.5 });
    const features: Slide[] = [
      feat('show_a', 'พายุคลื่นยักษ์', 'คลื่นสึนามิซัดเกาะ ฟ้าผ่า · สัตว์ทะเลคลั่งขึ้นฝั่ง'),
      feat('show_b', 'ภูเขาไฟปะทุ', 'จันทร์เลือด ลาวาพุ่ง · ฝูงมอนสเตอร์บุกฐาน'),
      feat('show_c', 'ศึกสัตว์ในตำนาน', 'มังกรน้ำแข็งปะทะฟีนิกซ์เพลิง'),
    ];
    // ตัวอย่างบอสด่าน — โชว์หน้า (ครึ่งบน) ให้เห็นหัวบอส
    const boss = (art: string, title: string, sub: string): Slide => ({ art, tag: 'บอสด่าน', title, sub, color: '#ff9f9f', bg: '#6a2a3a', focus: 0.32 });
    const bosses: Slide[] = [
      boss('boss_demon', 'ราชาปีศาจ', 'เจ้าแห่งเปลวไฟก้นดันเจี้ยน'),
      boss('boss_crab', 'ราชาปู', 'เจ้าสมุทรกระดองเหล็ก'),
      boss('legend_kraken', 'คราเคน', 'หมึกยักษ์จากก้นทะเลลึก'),
      boss('legend_phoenix', 'ฟีนิกซ์', 'นกเพลิงอมตะคืนชีพจากเถ้าถ่าน'),
      boss('boss_golem', 'โกเลมหิน', 'ยักษ์ศิลาผู้พิทักษ์ซากโบราณ'),
      boss('legend_frost_dragon', 'มังกรน้ำแข็ง', 'ลมหายใจเยือกแข็งเหนือน่านฟ้า'),
    ];
    // สไลด์หลัก = key art ใหม่ + บอสด่าน (สลับกัน) · ตามด้วยมหันตภัยเด่น + เกาะส่วนน้อย (ไม่วนเกาะ 43 ใบ)
    const slides: Slide[] = [];
    const lead = [features[0], bosses[0], features[1], bosses[1], features[2], bosses[2], bosses[3], bosses[4], bosses[5]].filter(Boolean) as Slide[];
    slides.push(...lead);
    const topDisasters = disasters.slice(0, 6); // มหันตภัยเด่นๆ ไม่กี่อัน
    const topMaps = maps.slice(0, 4); // เกาะส่วนน้อย
    for (let i = 0; i < Math.max(topDisasters.length, topMaps.length); i++) {
      if (topDisasters[i]) slides.push(topDisasters[i]);
      if (topMaps[i]) slides.push(topMaps[i]);
    }
    const list = slides.filter((s) => this.textures.exists(`art_${s.art}`));
    if (!list.length) return;
    if (this.menuBottom === 0 || this.compact) return;
    // กว้างเท่ากล่องเมนู · ห่างกล่องเมนู 10 · ขอบล่างจอ ≥ 16
    const cw = MENU_W - 12;
    const x = MENU_X + 6;
    const y = this.menuBottom + 16;
    const ch = H - y - 42;
    if (ch < 48) return;
    const box = this.add.container(0, 0).setDepth(5);
    // กรอบพิกเซลบางแบบเดียวกับเมนู · แถบชื่อ: ชื่อ (ตัวพิกเซล) ซ้าย + ข้อมูลสั้น (ตัวปกติจาง) ขวา
    box.add(retroPanel(this, x - 6, y - 6, cw + 12, ch + 32));
    const edge = this.add.graphics();
    edge.lineStyle(1, RETRO.inner, 1).strokeRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
    const label = retroLabel(this, x + 2, y + ch + 13, '', RETRO.css.text).setOrigin(0, 0.5);
    const sub = txt(this, x + cw, y + ch + 13, '', 11, RETRO.css.muted).setOrigin(1, 0.5);
    const tag = retroLabel(this, x + 6, y + 6, '', RETRO.css.text).setPadding(5, 1, 5, 1);
    const count = retroLabel(this, x + cw - 6, y + 6, '', RETRO.css.text).setOrigin(1, 0);
    let cur: Phaser.GameObjects.Image | null = null;
    let i = -1;
    const show = (n: number) => {
      i = (n + list.length) % list.length;
      const s = list[i];
      // ภาพสูงขึ้น → เอียงไปทางบน (เห็นหน้า/ส่วนหัวของภาพ)
      const img = coverCrop(this, s.art, cw, ch, x, y, s.focus ?? 0.4);
      if (!img) return;
      box.addAt(img, 1);
      const old = cur;
      cur = img;
      if (this.still || !old) old?.destroy();
      else {
        img.setAlpha(0);
        this.tweens.add({ targets: img, alpha: 1, duration: 600 });
        this.tweens.add({ targets: old, alpha: 0, duration: 600, onComplete: () => old.destroy() });
      }
      label.setText(s.title);
      fitText(label, cw - 120);
      sub.setText(s.sub);
      fitText(sub, cw - label.displayWidth - 12);
      tag.setText(s.tag).setBackgroundColor(s.bg);
      count.setText(`${i + 1}/${list.length}`);
    };
    // เปลี่ยนเองทุก 9 วิ (ลดการเคลื่อนไหว/คุณภาพต่ำ = เปลี่ยนเมื่อกดเท่านั้น) · กด = เริ่มนับใหม่
    const timer = this.still ? null : this.time.addEvent({ delay: 9000, loop: true, callback: () => show(i + 1) });
    const step = (d: number) => {
      Sfx.play('click');
      show(i + d);
      timer?.reset({ delay: 9000, loop: true, callback: () => show(i + 1) });
    };
    // ลูกศรซ้าย/ขวา + แตะภาพ = ถัดไป
    const arrow = (ax: number, ch2: string, d: number) => {
      const a = txt(this, ax, y + ch / 2, ch2, 22, '#ffffff').setOrigin(0.5).setStroke('#0b0d1f', 5).setAlpha(0.75);
      a.setInteractive({ useHandCursor: true })
        .on('pointerover', () => a.setAlpha(1).setColor(COLORS.gold))
        .on('pointerout', () => a.setAlpha(0.75).setColor('#ffffff'))
        .on('pointerdown', () => step(d));
      return a;
    };
    const hit = this.add.zone(x + 28, y, cw - 56, ch).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => step(1));
    box.add([edge, label, sub, tag, count, hit, arrow(x + 12, '‹', -1), arrow(x + cw - 12, '›', 1)]);
    show(0);
    if (this.still) return;
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 500, delay: 200 });
  }

  /** แผงสถิติมุมขวาบน (ใต้ชิปบัญชี): พลังสูงสุด / รอดนานสุด / เงินในเกาะ (เหรียญ·เพชร) / โบนัสล็อกอิน */
  /** แผงบางมุมขวาบน: ไอคอนเสียง + ชื่อบัญชี + ลิงก์ออกจากระบบ · พลังสูงสุด/รอดนานสุด · เหรียญ/เพชร/โบนัสล็อกอิน */
  private drawAccount(name: string, logout: () => void, meta: ReturnType<typeof MetaSave.load>, wallet?: { coins: number; gems: number }) {
    const w = 236;
    const x = W - 16 - w;
    const y = 16;
    retroPanel(this, x, y, w, 98);
    // เสียง (ปุ่มลัด 0 ใช้ได้ทุกหน้า)
    const mute = this.add.image(x + 18, y + 16, Sfx.isMuted ? 'tb_mute' : 'tb_sound').setDisplaySize(16, 16).setInteractive({ useHandCursor: true });
    mute.on('pointerdown', () => Sfx.toggleMute());
    const onAudio = (m: boolean) => mute.setTexture(m ? 'tb_mute' : 'tb_sound').setDisplaySize(16, 16);
    EventBus.on('audio:changed', onAudio);
    this.events.once('shutdown', () => EventBus.off('audio:changed', onAudio));
    const out = txt(this, x + w - 12, y + 16, 'ออกจากระบบ', 11, RETRO.css.muted).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    out.on('pointerover', () => out.setColor(RETRO.css.gold)).on('pointerout', () => out.setColor(RETRO.css.muted)).on('pointerdown', () => logout());
    fitText(retroLabel(this, x + 34, y + 16, name, RETRO.css.text).setOrigin(0, 0.5), w - 46 - out.width - 8);
    this.add.rectangle(x + 10, y + 29, w - 20, 1, RETRO.edge, 0.6).setOrigin(0, 0);
    // แถว: ไอคอนเล็ก · ชื่อจาง · ค่า
    const stat = (sx: number, sy: number, icon: string, label: string, value: string, color: string, cw: number) => {
      this.add.image(sx + 7, sy, icon).setScale(icon.startsWith('fbicon') ? 1 : 0.75);
      const lab = txt(this, sx + 17, sy, label, 11, RETRO.css.muted).setOrigin(0, 0.5);
      fitText(txt(this, sx + cw, sy, value, 12, color, { fontStyle: '600' }).setOrigin(1, 0.5), Math.max(24, cw - 17 - lab.width - 6));
    };
    const half = (w - 30) / 2;
    stat(x + 10, y + 43, iconTexture(this, 'sword'), 'พลังสูงสุด', (meta.bestPower ?? 0).toLocaleString(), RETRO.css.gold, half);
    stat(x + 20 + half, y + 43, iconTexture(this, 'moon'), 'รอดสุด', `${meta.bestDays} วัน`, RETRO.css.sage, half);
    stat(x + 10, y + 62, 'i_coin', 'เหรียญ', wallet ? fmtMoney(wallet.coins) : '—', RETRO.css.gold, half);
    stat(x + 20 + half, y + 62, 'i_gem', 'เพชร', wallet ? fmtMoney(wallet.gems) : '—', '#9fd6e0', half);
    const claimed = meta.lastLogin === todayKey();
    this.add.rectangle(x + 10, y + 74, w - 20, 1, RETRO.edge, 0.4).setOrigin(0, 0);
    const login = txt(this, x + 12, y + 86, claimed ? `ล็อกอินติดต่อกัน ${meta.loginStreak} วัน` : '🎁 โบนัสล็อกอินรออยู่ที่ตู้จดหมาย', 11, claimed ? RETRO.css.sage : RETRO.css.sand).setOrigin(0, 0.5);
    fitText(login, w - 24);
  }

  // ---------------------------------------------------------------- หน้าต่างย่อย

  private modal(title: string, build: (c: Phaser.GameObjects.Container) => void, animate = true) {
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.85).setOrigin(0).setInteractive();
    c.add([dim, fancyPanel(this, 70, 24, W - 140, H - 48, 'gold', 0.96), heading(this, W / 2, 38, title, 26).setOrigin(0.5, 0)]);
    build(c);
    c.add(fancyButton(this, W / 2, H - 60, {
      w: 180, h: 40, label: 'ปิด', icon: 'close', theme: 'crimson', size: 16,
      onClick: () => {
        this.overlay = null;
        this.tweens.add({ targets: c, alpha: 0, duration: 120, onComplete: () => c.destroy() });
      },
    }));
    this.overlay = c;
    if (animate) popIn(this, c);
  }

  /** ข้อความสถานะใต้เมนู (กำลังเชื่อมต่อ / error) */
  private menuMsg: Phaser.GameObjects.Text | null = null;
  /** กำลังรอเซิร์ฟเวอร์ก่อนเข้าเกาะ (กันกดซ้ำ) */
  private entering = false;
  private pendingMsg: string | null = null;

  /** เข้าระบบแล้ว → ไปเกาะของตัวเอง (บัญชีใหม่: เลือกตัวละคร → สุ่มเกาะ) */
  private async enterIsland() {
    if (this.entering) return;
    const svc = getRoomService();
    if (svc.online) {
      // ออนไลน์: ต้องรู้ seed โลก + ช่องเกาะของเราจากเซิร์ฟเวอร์ก่อนสร้างโลก
      this.entering = true;
      this.menuMsg?.setText('กำลังเชื่อมต่อ…').setColor(COLORS.dim);
      await Sync.pullOnce();
      const err = await svc.sync();
      const save = SaveManager.load();
      const res = !err && save ? await svc.joinAsync(WORLD_ROOM, localPlayerId(), MetaSave.load().playerName || 'ผู้รอดชีวิต', { slot: save.slot, character: save.character }) : null;
      this.entering = false;
      if (!this.sys.isActive()) return;
      const fail = err ?? (res && 'error' in res ? res.error : null);
      if (fail) {
        Sfx.play('error');
        if (this.menuMsg) this.menuMsg.setText(fail).setColor(COLORS.bad);
        else {
          // มาจากฟอร์มเข้าระบบ → ไปหน้าเมนูแล้วโชว์ error
          this.pendingMsg = fail;
          this.scene.restart();
        }
        return;
      }
    }
    const save = SaveManager.load();
    if (save) fadeTo(this, 'GameScene', { roomId: save.roomId, character: save.character, restore: true }, 260);
    else fadeTo(this, 'CharacterSelectScene', { play: true, name: getAccounts().current()?.username });
  }

  /** ไฟสถานะการเชื่อมต่อ (มุมซ้ายล่าง เหนือเลขเวอร์ชัน) */
  private drawNet() {
    // จุดสถานะเล็กๆ (เขียว = ออนไลน์ · เหลือง = กำลังเชื่อมต่อ · เทา = ออฟไลน์) — ชี้ = บอกเป็นข้อความ
    // เข้าระบบแล้ว: ในแผงบัญชีมุมขวาบน · ฟอร์มบัญชี: มุมซ้ายล่าง
    const right = this.menuBottom > 0;
    const x = right ? W - 20 : 16;
    const y = right ? Math.round(122 * (this.compact ? MENU_K : 1)) : H - 16;
    const dot = this.add.circle(x, y, 3, 0x8fbf7a).setStrokeStyle(1, 0x0b0f12).setDepth(6);
    const tip = txt(this, x + (right ? -8 : 8), y, '', 11, RETRO.css.muted).setOrigin(right ? 1 : 0, 0.5).setDepth(6).setVisible(false);
    dot.setInteractive(new Phaser.Geom.Circle(3, 3, 9), Phaser.Geom.Circle.Contains);
    dot.on('pointerover', () => tip.setVisible(true)).on('pointerout', () => tip.setVisible(false));
    const show = () => {
      const st = netStatus();
      dot.setFillStyle(st === 'online' ? 0x8fbf7a : st === 'unknown' ? 0xe3c178 : 0x6b7489);
      tip.setText(st === 'online' ? 'ออนไลน์' : st === 'unknown' ? 'กำลังเชื่อมต่อ…' : 'ออฟไลน์ (บันทึกในเครื่อง)');
    };
    show();
    const off = onNetStatus(() => this.sys.isActive() && show());
    this.events.once('shutdown', () => off());
  }

  /** ตารางอันดับผู้เล่น (พลังสูงสุด) — ต้องออนไลน์ */
  private showLeaderboard() {
    this.modal('🏆 อันดับผู้รอดชีวิต', (c) => {
      const status = txt(this, W / 2, 96, apiEnabled() ? 'กำลังโหลด…' : 'ตารางอันดับต้องเชื่อมต่อเซิร์ฟเวอร์ (ตอนนี้เล่นแบบออฟไลน์)', 14, COLORS.dim).setOrigin(0.5, 0);
      c.add(status);
      if (!apiEnabled()) {
        const m = MetaSave.load();
        c.add(txt(this, W / 2, 140, `สถิติของคุณ: พลังสูงสุด ${(m.bestPower ?? 0).toLocaleString()} · รอดนานสุด ${m.bestDays} วัน · ฆ่ารวม ${m.totalKills}`, 14, COLORS.gold).setOrigin(0.5, 0));
        return;
      }
      void fetchLeaderboard().then((rows) => {
        if (!c.active) return;
        if ('error' in rows) return void status.setText(rows.error).setColor(COLORS.bad);
        if (!rows.length) return void status.setText('ยังไม่มีใครติดอันดับ — เป็นคนแรกสิ!');
        status.destroy();
        const me = getAccounts().current()?.id;
        c.add(txt(this, W / 2, 80, 'เรียงตามพลังสูงสุด · รอดนานสุด · ฆ่ารวม', 12, COLORS.dim).setOrigin(0.5, 0));
        rows.slice(0, 50).forEach((r, i) => {
          const col = i < 25 ? 0 : 1;
          const x = 96 + col * 390;
          const y = 102 + (i % 25) * 14.4;
          const line = `${String(i + 1).padStart(2, ' ')}. ${r.playerName || 'ผู้รอดชีวิต'}`;
          const color = r.accountId === me ? COLORS.good : i < 3 ? COLORS.gold : COLORS.text;
          c.add(fitText(txt(this, x, y, line, 12, color), 180));
          c.add(txt(this, x + 370, y, `⚔${Number(r.bestPower).toLocaleString()}  🌙${r.bestDays}  ☠${r.kills}`, 12, color).setOrigin(1, 0));
        });
      });
    });
  }

  /** ยังไม่เข้าระบบ: ฟอร์มบัญชี (เข้าสู่ระบบ ↔ สมัคร ↔ ใส่รหัสยืนยัน ↔ ลืมรหัสผ่าน) + ผูกอีเมลของบัญชีเก่า */
  private authMode: AuthMode = 'login';
  /** อีเมลของขั้นตอนที่ทำอยู่ (ส่งต่อระหว่างหน้า เช่น สมัคร → ใส่รหัส) */
  private authEmail = '';
  private authRemember = true;
  /** ข้อความที่จะโชว์บนหน้าถัดไป */
  private authNotice: { text: string; bad?: boolean } | null = null;
  /** ขอรหัสใหม่ได้เมื่อ (ms) */
  private resendAt = 0;
  /** บัญชีเก่ากด "ไว้ทีหลัง" แล้ว (ไม่ถามผูกอีเมลอีกจนกว่าจะเปิดหน้าใหม่) */
  private attachSkipped = false;
  /** ของในฟอร์ม — ลบทิ้งตอนเปลี่ยนหน้าโดยไม่ต้อง restart ซีน */
  private authObjs: Phaser.GameObjects.GameObject[] = [];
  private authTimer: Phaser.Time.TimerEvent | null = null;

  private drawAuth() {
    this.authObjs.forEach((o) => o.destroy());
    this.authObjs = [];
    this.authTimer?.remove();
    this.authTimer = null;
    const svc = getAccounts();
    // เข้าระบบอยู่แล้ว = บัญชีเก่าที่ยังไม่ผูกอีเมล → หน้าผูกอีเมล · บัญชี Google ใหม่ → หน้าตั้งชื่อในเกม
    const signed = !!svc.current();
    const signedStep = this.authMode === 'attach' || this.authMode === 'attachCode' || this.authMode === 'name';
    if (signed !== signedStep) this.authMode = signed ? (svc.current()?.needName ? 'name' : 'attach') : 'login';
    const mode = this.authMode;
    const keep = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.authObjs.push(o);
      return o;
    };
    // ปุ่ม Google (เข้าสู่ระบบ/สมัคร) เพิ่มแถวบนสุด 48px แล้วบีบระยะระหว่างแถว — ขอบล่าง ≤ 490 ไม่ทับไฟสถานะ
    const gOn = svc.googleSignIn && (mode === 'login' || mode === 'register');
    const at = (normal: number, tight: number) => y + (gOn ? 48 + tight : normal);
    this.events.off('shutdown', cancelGoogle);
    if (gOn) this.events.once('shutdown', cancelGoogle);
    else cancelGoogle();
    // กล่องอยู่คอลัมน์ซ้าย (x 36–336) ใต้โลโก้ (y ≥ 156) · สูงสุด 290 → ขอบล่าง ≤ 446 ไม่ทับไฟสถานะ/แถบตัวละคร (มีปุ่ม Google สูงสุด 334)
    const x = 36;
    const y = 156;
    const pw = 300;
    const bx = x + pw / 2;
    const iw = 236;
    const ph = { login: gOn ? 324 : 282, register: gOn ? 334 : 290, verify: 282, forgot: 266, reset: 290, attach: 290, attachCode: 282, name: 266 }[mode];
    keep(fancyPanel(this, x, y, pw, ph, 'gold'));
    const msg = keep(txt(this, bx, y + ph - 38, '', 12, COLORS.bad, { align: 'center', wordWrap: { width: 260 } }).setOrigin(0.5, 0));
    const say = (t: string, color: string = COLORS.bad) => msg.setText(t).setColor(color);
    if (this.authNotice) {
      say(this.authNotice.text, this.authNotice.bad ? COLORS.bad : COLORS.good);
      this.authNotice = null;
    }

    const inputs: HTMLInputElement[] = [];
    let submit = () => {};
    let busy = false;
    /** รอเซิร์ฟเวอร์: ล็อกช่องกรอก + "กำลังเชื่อมต่อ…" (กันกดซ้ำ) */
    const run = async (fn: () => Promise<void>) => {
      if (busy) return;
      busy = true;
      inputs.forEach((e) => (e.disabled = true));
      say(apiEnabled() ? 'กำลังเชื่อมต่อ…' : 'กำลังตรวจสอบ…', COLORS.dim);
      try {
        await fn();
      } finally {
        busy = false;
        if (this.sys.isActive()) inputs.forEach((e) => (e.disabled = false));
      }
    };
    // ป้ายช่องกรอก: ยกขึ้น 9px ไม่ให้ช่อง DOM (สูง 34) ทับ (ฟอนต์ไทยบรรทัดสูงกว่าเดิม)
    const label = (yy: number, t: string) => keep(txt(this, x + 32, yy - 9, t, 12, COLORS.dim));
    const title = (t: string) => keep(txt(this, bx, y + 30, t, 16, COLORS.gold).setOrigin(0.5));
    const info = (yy: number, t: string, color: string = COLORS.dim, size = 12) =>
      keep(txt(this, bx, yy, t, size, color, { align: 'center', wordWrap: { width: 260 } }).setOrigin(0.5, 0));
    /** ช่องกรอก (DOM) — ตัวอักษร ≥ 16px กันมือถือซูมหน้าเอง */
    const input = (cx: number, cy: number, o: { type?: string; ph: string; auto: string; max: number; w?: number; code?: boolean; value?: string }) => {
      const el = document.createElement('input');
      el.type = o.type ?? 'text';
      el.placeholder = o.ph;
      el.maxLength = o.max;
      el.value = o.value ?? '';
      el.name = o.auto;
      el.spellcheck = false;
      el.setAttribute('autocomplete', o.auto);
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('autocorrect', 'off');
      if (o.code) {
        el.setAttribute('inputmode', 'numeric');
        el.setAttribute('pattern', '[0-9]*');
        el.addEventListener('input', () => (el.value = el.value.replace(/\D/g, '').slice(0, 6)));
      }
      Object.assign(el.style, {
        width: `${o.w ?? iw}px`, height: o.code ? '40px' : '34px', fontSize: o.code ? '22px' : '16px', letterSpacing: o.code ? '6px' : 'normal',
        textAlign: o.code ? 'center' : 'left', fontFamily: FONT, fontWeight: '500', padding: '0 10px', borderRadius: '8px',
        border: '2px solid #41a6f6', background: '#1a1c2c', color: '#f4f4f4', outline: 'none', boxSizing: 'border-box',
      });
      el.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
      keep(this.add.dom(cx, cy, el));
      inputs.push(el);
      return el;
    };
    /** รหัสผ่าน + ยืนยัน วางคู่กันในแถวเดียว */
    const passPair = (cy: number) => [
      input(bx - 61, cy, { type: 'password', ph: 'รหัสผ่าน', auto: 'new-password', max: 64, w: 114 }),
      input(bx + 61, cy, { type: 'password', ph: 'ยืนยันรหัส', auto: 'new-password', max: 64, w: 114 }),
    ];
    const mainBtn = (cy: number, text: string, fn: () => Promise<void>) => {
      submit = () => void run(fn);
      keep(fancyButton(this, bx, cy, { w: iw, h: 44, label: text, icon: 'play', theme: 'emerald', size: 17, pulse: true, onClick: submit }));
    };
    const smallBtn = (cx: number, cy: number, w: number, text: string, onClick: () => void) =>
      keep(fancyButton(this, cx, cy, { w, h: 32, label: text, theme: 'steel', size: 13, onClick: () => !busy && onClick() }));
    /** ปุ่มส่งรหัสอีกครั้ง (นับถอยหลังจนพ้นเวลารอ) */
    const resendBtn = (cx: number, cy: number, w: number, send: () => Promise<void>) => {
      const b = smallBtn(cx, cy, w, 'ส่งรหัสอีกครั้ง', () => Date.now() >= this.resendAt && void run(send));
      const tick = () => {
        const s = Math.ceil((this.resendAt - Date.now()) / 1000);
        if (b.active) b.setLabel(s > 0 ? `ส่งรหัสอีกครั้ง (${s})` : 'ส่งรหัสอีกครั้ง');
      };
      tick();
      this.authTimer = this.time.addEvent({ delay: 500, loop: true, callback: tick });
    };
    /** ผลการขอส่งรหัส → ตั้งเวลารอ + ข้อความ */
    const sent = (r: SendResult | AuthResult) => {
      if (r.kind === 'error') {
        if (r.wait) this.resendAt = Date.now() + r.wait * 1000;
        say(r.error);
        Sfx.play('error');
        return false;
      }
      if (r.kind === 'sent' || r.kind === 'code') {
        this.resendAt = Date.now() + r.wait * 1000;
        say(r.message, COLORS.good);
      }
      return true;
    };
    const mismatch = (a: HTMLInputElement, b: HTMLInputElement) => {
      if (a.value === b.value) return false;
      say('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      Sfx.play('error');
      return true;
    };

    if (mode === 'login' || mode === 'register') {
      const reg = mode === 'register';
      keep(fancyButton(this, bx - 68, y + 30, { w: 128, h: 34, label: 'เข้าสู่ระบบ', theme: reg ? 'steel' : 'gold', size: 14, onClick: () => !busy && this.switchAuth('login') }));
      keep(fancyButton(this, bx + 68, y + 30, { w: 128, h: 34, label: 'สมัครสมาชิก', theme: reg ? 'gold' : 'steel', size: 14, onClick: () => !busy && this.switchAuth('register') }));
      /** "จำฉันไว้" ของหน้าเข้าสู่ระบบ (สมัคร = จำไว้เสมอ) — ปุ่ม Google ใช้ค่าเดียวกัน */
      let rememberNow = () => true;
      if (gOn) {
        // ปุ่มทางการของ Google (iframe) ใน DOM ซ้อนบนกล่อง วางแบบเดียวกับช่องกรอก + เส้นคั่น "หรือ"
        const box = document.createElement('div');
        Object.assign(box.style, { width: `${iw}px`, height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', colorScheme: 'normal' });
        keep(this.add.dom(bx, y + 67, box));
        const line = keep(this.add.graphics());
        line.lineStyle(1, 0x8a95a8, 0.6).lineBetween(x + 32, y + 93, bx - 22, y + 93).lineBetween(bx + 22, y + 93, x + pw - 32, y + 93);
        keep(txt(this, bx, y + 93, 'หรือ', 12, COLORS.dim).setOrigin(0.5));
        const onCredential = (credential: string) => {
          if (!this.sys.isActive() || !box.isConnected) return;
          void run(async () => {
            this.authRemember = rememberNow();
            await this.authResult(await svc.google(credential, this.authRemember), say);
          });
        };
        void renderGoogleButton(box, { text: reg ? 'signup_with' : 'signin_with', width: iw }, onCredential).then((ok) => {
          if (!box.isConnected) return;
          if (!ok) {
            Object.assign(box.style, { color: '#8a95a8', fontFamily: FONT, fontSize: '13px' });
            box.textContent = 'โหลดปุ่ม Google ไม่ได้ — ใช้อีเมลแทน';
          } else if (!reg) promptGoogleOneTap();
        });
      }
      label(at(54, 54), 'อีเมล');
      const email = input(bx, at(82, 82), { type: 'email', ph: reg ? 'you@example.com' : 'อีเมล (บัญชีเก่าใส่ชื่อผู้ใช้ได้)', auto: reg ? 'email' : 'username', max: 254, value: this.authEmail });
      if (reg) {
        label(at(104, 102), 'ชื่อในเกม (คนอื่นเห็นชื่อนี้)');
        const name = input(bx, at(132, 130), { ph: '3–16 ตัว ไทย/อังกฤษ/ตัวเลข/_', auto: 'nickname', max: 16 });
        label(at(154, 150), 'รหัสผ่าน (8 ตัวขึ้นไป มีตัวอักษร + ตัวเลข)');
        const [pass, pass2] = passPair(at(182, 178));
        mainBtn(at(226, 220), 'สมัครสมาชิก', async () => {
          if (mismatch(pass, pass2)) return;
          this.authEmail = email.value.trim();
          this.authRemember = true;
          await this.authResult(await svc.register(email.value, pass.value, name.value, true), say);
        });
      } else {
        label(at(104, 102), 'รหัสผ่าน');
        const pass = input(bx, at(132, 130), { type: 'password', ph: 'รหัสผ่าน', auto: 'current-password', max: 64 });
        const wrap = document.createElement('label');
        Object.assign(wrap.style, { color: '#d6e4ee', fontFamily: FONT, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' });
        const remember = document.createElement('input');
        remember.type = 'checkbox';
        remember.checked = this.authRemember;
        wrap.append(remember, 'จำฉันไว้');
        keep(this.add.dom(x + 30, at(166, 160), wrap).setOrigin(0, 0.5));
        inputs.push(remember);
        rememberNow = () => remember.checked;
        if (svc.emailCodes) {
          const forgot = keep(txt(this, x + pw - 30, at(166, 160), 'ลืมรหัสผ่าน?', 13, RETRO.css.sand).setOrigin(1, 0.5));
          forgot.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
            if (busy) return;
            Sfx.play('click');
            if (email.value.includes('@')) this.authEmail = email.value.trim();
            this.switchAuth('forgot');
          });
        }
        mainBtn(at(206, 198), 'เข้าสู่ระบบ', async () => {
          this.authRemember = remember.checked;
          if (email.value.includes('@')) this.authEmail = email.value.trim();
          await this.authResult(await svc.login(email.value, pass.value, remember.checked), say);
        });
      }
    } else if (mode === 'verify' || mode === 'attachCode') {
      const attach = mode === 'attachCode';
      title(attach ? 'ยืนยันการผูกอีเมล' : 'ยืนยันอีเมล');
      info(y + 50, 'ใส่รหัสยืนยัน 6 หลักที่ส่งไปทางอีเมล');
      fitText(info(y + 68, this.authEmail, COLORS.text, 13), 260);
      const code = input(bx, y + 112, { ph: '••••••', auto: 'one-time-code', max: 6, w: 180, code: true });
      mainBtn(y + 160, 'ยืนยัน', async () => {
        const r = attach ? await svc.confirmEmail(code.value) : await svc.verify(this.authEmail, code.value, this.authRemember);
        await this.authResult(r, say);
      });
      resendBtn(bx - 56, y + 206, 150, async () => void sent(attach ? await svc.attachEmail(this.authEmail) : await svc.resend(this.authEmail)));
      smallBtn(bx + 79, y + 206, 104, attach ? 'เปลี่ยนอีเมล' : 'กลับ', () => this.switchAuth(attach ? 'attach' : 'login'));
    } else if (mode === 'forgot') {
      title('ลืมรหัสผ่าน');
      info(y + 50, 'กรอกอีเมลของบัญชี เราจะส่งรหัส 6 หลักไปให้ตั้งรหัสผ่านใหม่');
      label(y + 88, 'อีเมล');
      const email = input(bx, y + 116, { type: 'email', ph: 'you@example.com', auto: 'email', max: 254, value: this.authEmail });
      mainBtn(y + 162, 'ส่งรหัส', async () => {
        const r = await svc.forgot(email.value);
        if (!this.sys.isActive()) return;
        // เพิ่งขอไป (ยังไม่พ้นเวลารอ) → รหัสเดิมยังใช้ได้ ไปหน้าใส่รหัสเลย
        if (r.kind === 'error' && r.code !== 'cooldown') return void sent(r);
        this.authEmail = email.value.trim();
        if (r.wait) this.resendAt = Date.now() + r.wait * 1000;
        this.authNotice = r.kind === 'sent' ? { text: `${r.message} — ตรวจกล่องจดหมาย (และสแปม)` } : { text: r.error, bad: true };
        this.switchAuth('reset');
      });
      smallBtn(bx, y + 206, 160, '← กลับไปเข้าสู่ระบบ', () => this.switchAuth('login'));
    } else if (mode === 'reset') {
      title('ตั้งรหัสผ่านใหม่');
      fitText(info(y + 46, `รหัสส่งไปที่ ${this.authEmail}`), 260);
      label(y + 64, 'รหัสยืนยัน 6 หลัก');
      const code = input(bx, y + 90, { ph: '••••••', auto: 'one-time-code', max: 6, w: 180, code: true });
      label(y + 116, 'รหัสผ่านใหม่ (8 ตัวขึ้นไป มีตัวอักษร + ตัวเลข)');
      const [pass, pass2] = passPair(y + 142);
      mainBtn(y + 186, 'ตั้งรหัสผ่านใหม่', async () => {
        if (mismatch(pass, pass2)) return;
        await this.authResult(await svc.reset(this.authEmail, code.value, pass.value, this.authRemember), say);
      });
      resendBtn(bx - 56, y + 228, 150, async () => void sent(await svc.forgot(this.authEmail)));
      smallBtn(bx + 79, y + 228, 104, 'กลับ', () => this.switchAuth('login'));
    } else if (mode === 'name') {
      // บัญชีที่เพิ่งสร้างด้วย Google: ยืนยัน/เปลี่ยนชื่อในเกมชั่วคราว (ได้ครั้งเดียว)
      title('ตั้งชื่อในเกม');
      info(y + 48, 'ชื่อนี้คนอื่นเห็นบนแผนที่โลก อันดับ และแชท — ใช้ชื่อที่ตั้งให้ หรือแก้ก็ได้ (ตั้งได้ครั้งเดียว)');
      label(y + 104, 'ชื่อในเกม');
      const name = input(bx, y + 132, { ph: '3–16 ตัว ไทย/อังกฤษ/ตัวเลข/_', auto: 'nickname', max: 16, value: svc.current()?.username ?? '' });
      mainBtn(y + 178, 'ยืนยันชื่อ', async () => {
        await this.authResult(await svc.setName(name.value), say);
      });
    } else {
      // attach: บัญชีเก่า (เข้าด้วยชื่อผู้ใช้) → ผูกอีเมล
      title('ผูกอีเมลกับบัญชี');
      info(y + 48, `บัญชี "${svc.current()?.username ?? ''}" ยังไม่มีอีเมล — ผูกไว้เพื่อเข้าสู่ระบบด้วยอีเมลและกู้รหัสผ่านได้`);
      label(y + 104, 'อีเมล');
      const email = input(bx, y + 132, { type: 'email', ph: 'you@example.com', auto: 'email', max: 254, value: this.authEmail });
      mainBtn(y + 178, 'ส่งรหัสยืนยัน', async () => {
        const r = await svc.attachEmail(email.value);
        if (!this.sys.isActive()) return;
        // เพิ่งขอไปแล้ว → ไปหน้าใส่รหัส (รหัสเดิมยังใช้ได้)
        if (r.kind === 'error' && r.code === 'cooldown') {
          this.authEmail = email.value.trim().toLowerCase();
          if (r.wait) this.resendAt = Date.now() + r.wait * 1000;
          this.authNotice = { text: r.error, bad: true };
          return this.switchAuth('attachCode');
        }
        await this.authResult(r, say);
      });
      smallBtn(bx, y + 222, 140, 'ไว้ทีหลัง →', () => {
        this.attachSkipped = true;
        say(apiEnabled() ? 'กำลังเข้าเกาะ…' : '', COLORS.dim);
        void this.enterIsland();
      });
    }
    // โฟกัสช่องแรกที่ยังว่าง
    this.time.delayedCall(100, () => (inputs.find((e) => e.type !== 'checkbox' && !e.value) ?? inputs[0])?.focus());
    // (เลขเวอร์ชันเอาออก — มีจุดสถานะออนไลน์เล็กๆ มุมซ้ายล่างแทน)
  }

  /** ผลจาก AccountService → หน้าใส่รหัส / เข้าเกม / โชว์ข้อผิดพลาด */
  private async authResult(r: AuthResult, say: (t: string, color?: string) => unknown) {
    if (!this.sys.isActive()) return;
    if (r.kind === 'error') {
      if (r.wait) this.resendAt = Date.now() + r.wait * 1000;
      say(r.error);
      Sfx.play('error');
      return;
    }
    if (r.kind === 'code') {
      this.authEmail = r.email;
      this.resendAt = Date.now() + r.wait * 1000;
      this.authNotice = { text: r.message, bad: r.bad };
      this.switchAuth(this.authMode === 'attach' ? 'attachCode' : 'verify');
      return;
    }
    const attached = this.authMode === 'attachCode' || this.authMode === 'attach';
    const named = this.authMode === 'name';
    // ออนไลน์: โหลดเซฟ/ข้อมูลถาวรจากเซิร์ฟเวอร์ลงเครื่องก่อนเข้าเกม (ผูกอีเมล/ตั้งชื่อ = เข้าระบบอยู่แล้ว โหลดไปแล้ว)
    if (apiEnabled() && !attached && !named) {
      say('กำลังโหลดเซฟ…', COLORS.dim);
      await Sync.afterLogin();
      if (!this.sys.isActive()) return;
    }
    Sfx.play('levelUp');
    if (!attached) this.attachSkipped = false;
    if (r.account.needName) {
      this.authNotice = { text: 'สร้างบัญชีด้วย Google แล้ว — ยืนยันชื่อในเกม' };
      this.switchAuth('name');
      return;
    }
    if (r.account.needEmail && !this.attachSkipped) {
      this.authNotice = { text: 'เข้าสู่ระบบแล้ว — ผูกอีเมลก่อน (หรือกด "ไว้ทีหลัง")' };
      this.authEmail = '';
      this.switchAuth('attach');
      return;
    }
    say(attached ? 'ผูกอีเมลเรียบร้อย — กำลังเข้าเกาะ…' : named ? 'ตั้งชื่อเรียบร้อย — กำลังเข้าเกาะ…' : apiEnabled() ? 'กำลังเข้าเกาะ…' : '', COLORS.good);
    void this.enterIsland();
  }

  private switchAuth(m: AuthMode) {
    if (this.authMode === m) return;
    this.authMode = m;
    this.drawAuth();
  }

  /** หน้าต่างตั้งค่า: รวมทุกการตั้งค่าไว้ที่เดียว (เปลี่ยนแล้วบันทึกทันที) */
  private showSettings(animate = true) {
    this.modal('⚙ ตั้งค่า', (c) => {
      const a = Sfx.settings;
      const g = getSettings();
      let LX = 100;
      let CX = 330;
      let y = 100;
      const redraw = () => this.showSettings(false);
      const label = (t: string, sub?: string) => {
        c.add(txt(this, LX, sub ? y - 7 : y, t, 15, COLORS.text).setOrigin(0, 0.5));
        if (sub) c.add(txt(this, LX, y + 11, sub, 10, COLORS.dim).setOrigin(0, 0.5));
      };
      /** แถวปรับค่า: − ค่า + */
      const stepper = (t: string, value: string, dec: () => void, inc: () => void, sub?: string) => {
        label(t, sub);
        c.add(fancyButton(this, CX - 58, y, { w: 40, h: 32, label: '−', theme: 'steel', size: 16, onClick: () => (dec(), redraw()) }));
        c.add(fitText(txt(this, CX, y, value, 14, COLORS.gold).setOrigin(0.5), 70));
        c.add(fancyButton(this, CX + 58, y, { w: 40, h: 32, label: '+', theme: 'steel', size: 16, onClick: () => (inc(), redraw()) }));
        y += 52;
      };
      const toggle = (t: string, on: boolean, flip: () => void, sub?: string) => {
        label(t, sub);
        c.add(fancyButton(this, CX, y, { w: 156, h: 32, label: on ? 'เปิด' : 'ปิด', theme: on ? 'emerald' : 'steel', size: 14, onClick: () => (flip(), redraw()) }));
        y += 52;
      };
      const head = (t: string) => {
        c.add(txt(this, LX, y - 6, t, 13, COLORS.gold).setOrigin(0, 0.5));
        y += 26;
      };
      const pct = (v: number) => `${Math.round(v * 100)}%`;
      const vol = (k: 'master' | 'sfx' | 'music', d: number) => {
        a[k] = Math.round(Math.min(1, Math.max(0, a[k] + d)) * 10) / 10;
        Sfx.applySettings();
        Sfx.play('click');
      };

      // ---- การควบคุม (เต็มแถว) ----
      head('🎮 การควบคุม — เลือกวิธีเล่น');
      CONTROL_MODES.forEach((m, i) => {
        const on = getControlMode() === m.id;
        c.add(fancyButton(this, 196 + i * 190, y, {
          w: 178, h: 40, label: m.label.replace(/\s*\(.*\)/, ''), sub: m.label.match(/\((.*)\)/)?.[1] ?? 'ตรวจจับให้เอง', theme: on ? 'gold' : 'steel', size: 14,
          onClick: () => (setControlMode(m.id), redraw()),
        }));
      });
      const top = y + 50;

      // ---- คอลัมน์ซ้าย: เสียง ----
      y = top;
      head('🔊 เสียง');
      toggle('เสียง', !a.muted, () => (Sfx.toggleMute(), Sfx.play('click')));
      stepper('ระดับเสียงรวม', pct(a.master), () => vol('master', -0.1), () => vol('master', 0.1));
      stepper('เสียงเอฟเฟกต์', pct(a.sfx), () => vol('sfx', -0.1), () => vol('sfx', 0.1));
      stepper('เพลงประกอบ', pct(a.music), () => vol('music', -0.1), () => vol('music', 0.1));
      // เดินด้วยเมาส์ (systems/MouseMove) — คอลัมน์ซ้ายมีที่ว่าง (คอลัมน์ขวาเต็มถึงปุ่มปิด)
      toggle('เดินด้วยเมาส์', g.mouseMove, () => setSettings({ mouseMove: !g.mouseMove }), 'กดค้าง/คลิกพื้นเพื่อเดิน');

      // ---- คอลัมน์ขวา: การแสดงผล ----
      LX = 490;
      CX = 760;
      y = top;
      head('🖥 การแสดงผล');
      stepper('มุมกล้อง 2.5D', g.tilt > 0 ? pct(g.tilt) : 'ปิด',
        () => setSettings({ tilt: Math.max(0, Math.round((g.tilt - 0.15) * 100) / 100) }),
        () => setSettings({ tilt: Math.min(0.9, Math.round((g.tilt + 0.15) * 100) / 100) }), 'เริ่มเกม · กด V ในเกมสลับได้');
      stepper('ซูมเริ่มต้น', `${g.zoom.toFixed(2)}×`,
        () => setSettings({ zoom: Math.max(1.25, Math.round((g.zoom - 0.25) * 100) / 100) }),
        () => setSettings({ zoom: Math.min(5, Math.round((g.zoom + 0.25) * 100) / 100) }), 'ล้อเมาส์ / บีบนิ้ว ในเกม');
      toggle('การ์ดข้อมูล', g.infoCards, () => setSettings({ infoCards: !g.infoCards }), 'ชี้/จิ้ม/เดินใกล้ของ');
      toggle('จอสั่น', g.shake, () => setSettings({ shake: !g.shake }), 'โดนตี / ระเบิด / คริ');
      // คุณภาพภาพ: อัตโนมัติ = มือถือเริ่ม "กลาง" และลดเองถ้า FPS ตก
      label('คุณภาพภาพ', qualityPref() === 'auto' ? `ตอนนี้: ${qualityName()} · ลดเองถ้ากระตุก` : 'ต่ำ = ลื่นสุด (ปิด 2.5D)');
      QUALITY_PREFS.forEach((q, i) => {
        const on = qualityPref() === q.id;
        c.add(fancyButton(this, CX - 60 + i * 52 - (i === 0 ? 8 : 0), y, {
          w: i === 0 ? 64 : 48, h: 32, label: q.label, theme: on ? 'gold' : 'steel', size: 12,
          onClick: () => (setQualityPref(q.id), redraw()),
        }));
      });
    }, animate);
  }

  private showAchievements() {
    const got = new Set(MetaSave.load().achievements);
    this.modal('ความสำเร็จ', (c) => {
      c.add(txt(this, W - 96, 46, `ปลดล็อก ${ACHIEVEMENTS.filter((a) => got.has(a.id)).length}/${ACHIEVEMENTS.length}`, 13, COLORS.dim).setOrigin(1, 0));
      const cw = 248;
      ACHIEVEMENTS.forEach((a, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 94 + col * (cw + 13);
        const y = 84 + row * 50;
        const ok = got.has(a.id);
        c.add(this.add.nineslice(x, y, ok ? 'ui_slot_sel' : 'ui_slot', undefined, cw, 44, 6, 6, 6, 6).setOrigin(0));
        c.add(fitText(txt(this, x + 10, y + 4, `${ok ? '🏆' : '🔒'} ${a.name}`, 14, ok ? COLORS.gold : '#8a95a8'), cw - 20));
        c.add(fitText(txt(this, x + 10, y + 25, a.desc, 11, COLORS.dim), cw - 20));
      });
    });
  }

  private showHelp() {
    this.modal('วิธีเล่น', (c) => {
      const lines = [
        '🏝  ทุกคนมีเกาะของตัวเอง — สร้างฐาน ปลูกผัก เลี้ยงชีพ',
        '⚔  พลัง = เลเวล + อุปกรณ์ + ฐาน · ตายแล้วเลเวลลด 1',
        '🌉  เกาะกลาง = ตลาดซื้อ/ขาย — ห้ามต่อสู้',
        '⛵  สร้างเรือ (แพ → เรือใบ → เรือยนต์) ไปเกาะอื่น',
        '📦  ทุกเช้า: กล่องร่มชูชีพ + ของขวัญในตู้จดหมาย + แร่เกิดใหม่',
        '🔨  คราฟต์: มือเปล่า → โต๊ะช่าง → เตาหลอม → ดาบคริสตัล',
        '🌡  ดูแลความหิว น้ำ อุณหภูมิ และสติ',
        '🌙  ทุกคืนมีภัย/มอนบุก · ทุก 5 วันคืนปีศาจ — อยู่ใกล้กองไฟ',
        '',
        'คอม: WASD เดิน · Shift วิ่ง · Space หลบ · คลิก ตี · E ใช้ · F กิน · Q สกิล',
        '         Tab กระเป๋า · B แปลน · M แผนที่ · N เสียง · Esc เมนู',
        'มือถือ: จอยซ้ายเดิน (ดันสุด = วิ่ง) · ปุ่มขวา โจมตี/ใช้/หลบ/สกิล/กิน',
      ];
      c.add(txt(this, 104, 84, lines.join('\n'), 14, COLORS.text, { lineSpacing: 5 }));
    });
  }
}

/** หน้าของฟอร์มบัญชีบนหน้าแรก (attach/attachCode = บัญชีเก่าผูกอีเมลหลังเข้าระบบ) */
type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'attach' | 'attachCode' | 'name';
