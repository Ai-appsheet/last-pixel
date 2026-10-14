import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { MetaSave, todayKey } from '../core/MetaSave';
import { SaveManager } from '../core/SaveManager';
import { nextOpenText } from '../core/SpecialIsland';
import { ACHIEVEMENTS } from '../data/achievements';
import { CHARACTERS, getCharacter } from '../data/characters';
import { CONTROL_MODES, getControlMode, setControlMode } from '../core/ControlMode';
import { getSettings, setSettings } from '../core/Settings';
import { COLORS, FONT, heading, PIXEL_FONT, pixelTxt, txt } from '../ui/widgets';
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

/** หน้าแรก: ภาพ key art นิ่ง (title_bg) + โลโก้/เมนูคอลัมน์ซ้าย — เคลื่อนไหวเบาๆ เท่านั้น (แสงวิ้งโลโก้ หิ่งห้อยไม่กี่ดวง ปุ่มหลักเรืองหายใจ) */
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
    if (this.still) return;
    // หิ่งห้อยไม่กี่ดวง ลอยช้าๆ จางๆ (ฝั่งขวา ไม่ทับเมนู)
    const R = Phaser.Math.Between;
    for (let i = 0; i < 6; i++) {
      const f = this.add.image(R(420, 940), R(230, 500), 'firefly').setScale(2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      this.tweens.add({ targets: f, alpha: 0.35, x: f.x + R(-24, 24), y: f.y - R(16, 40), duration: R(5000, 8000), yoyo: true, repeat: -1, delay: R(0, 4000), ease: 'Sine.easeInOut' });
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
    const shines: Phaser.GameObjects.Sprite[] = [];
    ([['SURVIVOR', 'tt_logo_w1', 40, false], ['ISLES', 'tt_logo_w2', 90, true]] as const).forEach(([word, key, y, blue]) => {
      this.buildLogoTexture(word, key, blue);
      const s = this.add.sprite(cx, y, `${key}_shine`, 0).setScale(LOGO_PX).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      head.add([this.add.image(cx, y, key).setScale(LOGO_PX), s]);
      shines.push(s);
    });
    // ชื่อไทย: ตัวหนาคม ขอบเข้ม อ่านง่าย (ไม่ขยับ)
    head.add(pixelTxt(this, cx, 136, 'เอาชีวิตรอดบนหมู่เกาะ', 32, COLORS.cream).setOrigin(0.5));
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
    const x = COL_X;
    const y = PANEL_Y;
    const pw = COL_W;
    const bw = 264;
    const bx = x + pw / 2;
    // กล่องเมนูกะทัดรัด (ปุ่มหลัก 44 · รอง 34 · เล็ก 30 · ช่องไฟ 6) — ที่เหลือยกให้การ์ดสไลด์ด้านล่าง
    const gap = 6;
    const rows = 44 + gap + 34 + gap + 34 + gap + 30 + gap + 30;
    fancyPanel(this, x, y, pw, rows + 20, 'gold');
    // การ์ดไฮไลต์วางใต้กล่องเมนูนี้
    this.menuBottom = y + rows + 20;
    let cy = y + 10;
    const next = (h: number) => {
      const c = cy + h / 2;
      cy += h + gap;
      return c;
    };
    // ปุ่มหลัก: มีเกาะแล้ว → ไปเกาะของฉันทันที · ยังไม่มี → เลือกตัวละคร → สุ่มเกาะ (เรืองหายใจช้าๆ)
    if (save) {
      const ch = getCharacter(save.character);
      const info = [ch.name, `Lv.${save.player.level ?? 1}`, `วันที่ ${save.day}`].join(' · ');
      fancyButton(this, bx, next(44), {
        w: bw, h: 44, label: 'ไปเกาะของฉัน', sub: info, icon: 'play', theme: 'emerald', size: 16, breathe: true,
        onClick: () => void this.enterIsland(),
      });
    } else {
      fancyButton(this, bx, next(44), {
        w: bw, h: 44, label: 'เริ่มผจญภัย', sub: 'เลือกตัวละคร · สุ่มเกาะ', icon: 'sword', theme: 'gold', size: 16, breathe: true,
        onClick: () => void this.enterIsland(),
      });
    }
    fancyButton(this, bx, next(34), {
      w: bw, h: 34, label: 'คลัง & ร้านค้า', icon: 'book', theme: 'teal', size: 15,
      onClick: () => fadeTo(this, 'CatalogScene'),
    });
    fancyButton(this, bx, next(34), {
      w: bw, h: 34, label: 'ตัวละคร', icon: 'shield', theme: 'sky', size: 15,
      onClick: () => fadeTo(this, 'CharacterSelectScene', {}),
    });
    const sy = next(30);
    fancyButton(this, bx - 68, sy, { w: 128, h: 30, label: 'ความสำเร็จ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showAchievements() });
    fancyButton(this, bx + 68, sy, { w: 128, h: 30, label: 'อันดับ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showLeaderboard() });
    // การตั้งค่าทั้งหมด (ควบคุม/เสียง/กล้อง/การแสดงผล) รวมอยู่ในปุ่มตั้งค่า
    const sy2 = next(30);
    fancyButton(this, bx - 68, sy2, { w: 128, h: 30, label: 'วิธีเล่น', icon: 'help', theme: 'steel', size: 14, onClick: () => this.showHelp() });
    fancyButton(this, bx + 68, sy2, { w: 128, h: 30, label: 'ตั้งค่า', icon: 'pad', theme: 'steel', size: 14, onClick: () => this.showSettings() });

    this.menuMsg = txt(this, bx, y + rows + 30, this.pendingMsg ?? '', 12, COLORS.bad, { align: 'center', wordWrap: { width: pw } }).setOrigin(0.5, 0).setStroke('#0b0d1f', 4);
    this.pendingMsg = null;
    // มือถือ: ขยายคอลัมน์ซ้าย ×1.18 ยึดมุมซ้ายบน — ปุ่มใหญ่พอให้นิ้วกด (การ์ดไฮไลต์ด้านล่างซ่อนไว้)
    if (this.compact) {
      const col = this.children.list.filter((o) => !before.has(o));
      this.add.container(0, 0, col).setScale(MENU_K);
      this.menuBottom = Math.round(this.menuBottom * MENU_K);
    }

    // ---------- มุมขวาบน: เสียง + บัญชี + สถิติ (ขวาของมังกรในภาพ x ≥ 746) ----------
    const before2 = new Set(this.children.list);
    // บัญชี + ออกจากระบบ
    fancyButton(this, W - 88, 32, {
      w: 152, h: 42, label: acc.username, sub: 'ออกจากระบบ', icon: 'shield', theme: 'steel', size: 14,
      onClick: async () => {
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
      },
    });
    // ปุ่มเปิด/ปิดเสียง (ซ้ายชิปบัญชี) · ปุ่มลัด 0 ใช้ได้ทุกหน้า
    const muteBtn = fancyButton(this, W - 192, 32, { w: 46, h: 42, label: Sfx.isMuted ? '🔇' : '🔊', theme: 'steel', size: 18, onClick: () => Sfx.toggleMute() });
    const onAudio = (m: boolean) => muteBtn.setLabel(m ? '🔇' : '🔊');
    EventBus.on('audio:changed', onAudio);
    this.events.once('shutdown', () => EventBus.off('audio:changed', onAudio));
    this.drawStats(meta, save?.wallet);
    if (this.compact) {
      const tr = this.children.list.filter((o) => !before2.has(o));
      anchorGroup(this, W, 0, MENU_K, 0).add(tr);
    }
    // เวอร์ชัน: มุมขวาล่าง ตัวเล็กจาง
    txt(this, W - 8, H - 6, 'Survivor Isles v0.5 · PC & Mobile · 2.5D', 11, '#8a95a8').setOrigin(1, 1).setStroke('#0b0d1f', 3);
  }

  // ---------------------------------------------------------------- ไฮไลต์บนหน้าปก

  /**
   * การ์ดไฮไลต์ใต้เมนู: ตัวละคร ด่าน บอส เกาะพิเศษ ภัยพิบัติ — นิ่ง เปลี่ยนเมื่อแตะ/กดลูกศร หรือเองทุก 9 วิ (เฟดข้าม)
   * หน้าฟอร์มบัญชี / จอเล็ก ไม่แสดง
   */
  private drawShowcase() {
    const scenes: { art: string; tag: string; title: string; sub: string; color: string; focus?: number }[] = [
      { art: 'dungeon_1', tag: 'ด่าน 1', title: 'ถ้ำหินมืด', sub: 'ค้างคาว สไลม์ โครงกระดูก · Lv.1–10', color: '#a77bdb' },
      { art: 'boss_golem', tag: 'บอส', title: 'โกเลมหินยักษ์', sub: 'ผู้เฝ้าถ้ำหินมืด', color: '#ef7d57' },
      { art: 'intro_5', tag: 'เรื่องราว', title: 'ขึ้นเกาะร้าง', sub: 'ผู้รอดชีวิตเริ่มต้นจากศูนย์', color: '#73eff7' },
      { art: 'dungeon_2', tag: 'ด่าน 2', title: 'เหมืองร้าง', sub: 'มัมมี่ เงาหลอน · Lv.10–25', color: '#a77bdb' },
      { art: 'boss_crab', tag: 'บอส', title: 'ราชาปูยักษ์', sub: 'ขึ้นฝั่งในคืนภัยพิบัติ', color: '#ef7d57' },
      { art: 'dungeon_3', tag: 'ด่าน 3', title: 'สุสานโบราณ', sub: 'อิมป์ไฟ ปีศาจ · Lv.25+', color: '#a77bdb' },
      { art: 'boss_demon', tag: 'บอสใหญ่', title: 'ราชาปีศาจ', sub: 'มาเยือนทุก 5 คืน', color: '#ef7d57' },
      { art: 'special_island', tag: 'เกาะพิเศษ', title: 'เกาะมหาสมบัติ', sub: `เปิดวันละ 2 รอบ · รอบหน้า ${nextOpenText()}`, color: '#ffcd75' },
      { art: 'market_island', tag: 'เกาะกลาง', title: 'ตลาดผู้รอดชีวิต', sub: 'ซื้อขายกับผู้เล่นคนอื่น · ห้ามต่อสู้', color: '#ffcd75' },
      { art: 'hz_tsunami', tag: 'ภัยพิบัติ', title: 'คลื่นยักษ์ & อีก 7 ภัย', sub: 'ยิ่งรอดนาน ยิ่งถี่และแรง', color: '#41a6f6' },
      { art: 'conquest', tag: 'เป้าหมาย', title: 'พิชิตเกาะร้าง', sub: 'ล้มบอสดันเจี้ยนครบ 3 ด่าน', color: '#a7f070' },
    ];
    // สลับสไลด์ตัวละคร (ภาพเต็มตัว โฟกัสส่วนบนไม่ตัดหัว) แทรกระหว่างฉาก
    const heroes = CHARACTERS.map((c) => ({ art: `char_${c.id}`, tag: 'ตัวละคร', title: c.name, sub: c.desc, color: '#73eff7', focus: 0.22 }));
    const slides: typeof scenes = [];
    for (let i = 0; i < Math.max(scenes.length, heroes.length); i++) {
      if (scenes[i]) slides.push(scenes[i]);
      if (heroes[i]) slides.push(heroes[i]);
    }
    const list = slides.filter((s) => this.textures.exists(`art_${s.art}`));
    if (!list.length) return;
    if (this.menuBottom === 0 || this.compact) return;
    const cw = 288;
    const x = COL_X + 6;
    const y = this.menuBottom + 12;
    const ch = H - y - 34;
    if (ch < 48) return;
    const box = this.add.container(0, 0).setDepth(5);
    const frame = this.add.graphics();
    frame.fillStyle(0x0b0d1f, 0.72).fillRoundedRect(x - 6, y - 6, cw + 12, ch + 32, 10);
    frame.lineStyle(2, 0xffcd75, 0.7).strokeRoundedRect(x - 6, y - 6, cw + 12, ch + 32, 10);
    box.add(frame);
    const label = txt(this, x + 2, y + ch + 4, '', 15, COLORS.text, { fontStyle: '600' }).setOrigin(0, 0);
    const sub = txt(this, x + cw, y + ch + 7, '', 10, COLORS.dim).setOrigin(1, 0);
    const tag = txt(this, x + 8, y + 7, '', 12, '#ffffff', { fontStyle: '600' }).setPadding(5, 1, 5, 1);
    const count = txt(this, x + cw - 8, y + 7, '', 10, '#d6e4ee').setOrigin(1, 0).setStroke('#0b0d1f', 3);
    let cur: Phaser.GameObjects.Image | null = null;
    let i = -1;
    const show = (n: number) => {
      i = (n + list.length) % list.length;
      const s = list[i];
      // ภาพสูงขึ้น → เอียงไปทางบน (เห็นหน้า/ส่วนหัวของภาพ)
      const img = coverCrop(this, s.art, cw, ch, x, y, Math.min(s.focus ?? 0.3, 0.35));
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
      label.setText(s.title).setColor(s.color);
      fitText(label, cw - 120);
      sub.setText(s.sub);
      fitText(sub, cw - label.displayWidth - 12);
      tag.setText(s.tag).setBackgroundColor(s.color === '#ffcd75' ? '#b86f50' : s.color === '#a7f070' ? '#257179' : s.color === '#41a6f6' ? '#3b5dc9' : s.color === '#ef7d57' ? '#b13e53' : s.color === '#73eff7' ? '#2a9d96' : '#5d275d');
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
    box.add([label, sub, tag, count, hit, arrow(x + 12, '‹', -1), arrow(x + cw - 12, '›', 1)]);
    show(0);
    if (this.still) return;
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 500, delay: 200 });
  }

  /** แผงสถิติมุมขวาบน (ใต้ชิปบัญชี): พลังสูงสุด / รอดนานสุด / เงินในเกาะ (เหรียญ·เพชร) / โบนัสล็อกอิน */
  private drawStats(meta: ReturnType<typeof MetaSave.load>, wallet?: { coins: number; gems: number }) {
    const w = 200;
    const x = W - 14 - w;
    const y = 60;
    fancyPanel(this, x, y, w, 88, 'steel', 0.82);
    const row = (ry: number, icon: 'sword' | 'moon', label: string, value: string, color: string) => {
      this.add.image(x + 22, ry, iconTexture(this, icon)).setScale(2);
      txt(this, x + 36, ry, label, 12, COLORS.dim).setOrigin(0, 0.5);
      fitText(txt(this, x + w - 14, ry, value, 14, color).setOrigin(1, 0.5), 80);
    };
    row(y + 17, 'sword', 'พลังสูงสุด', (meta.bestPower ?? 0).toLocaleString(), COLORS.gold);
    row(y + 35, 'moon', 'รอดนานสุด', `${meta.bestDays} วัน`, COLORS.good);
    // เงินของเกาะปัจจุบัน (ยังไม่มีเกาะ = ขีด) — รูปแบบเดียวกับ HUD ในเกม
    const my = y + 54;
    const pill = this.add.graphics();
    pill.fillStyle(0x0b0d1f, 0.55).fillRoundedRect(x + 10, my - 9, w - 20, 18, 9);
    pill.lineStyle(1, 0xffcd75, 0.45).strokeRoundedRect(x + 10, my - 9, w - 20, 18, 9);
    this.add.image(x + 24, my, 'i_coin').setScale(1.1);
    fitText(txt(this, x + 34, my, wallet ? fmtMoney(wallet.coins) : '—', 13, COLORS.gold).setOrigin(0, 0.5), 74);
    this.add.image(x + 118, my, 'i_gem').setScale(1.1);
    fitText(txt(this, x + 128, my, wallet ? fmtMoney(wallet.gems) : '—', 13, '#73eff7').setOrigin(0, 0.5), 56);
    const claimed = meta.lastLogin === todayKey();
    const login = txt(
      this, x + 14, y + 74,
      claimed ? `🔥 ล็อกอินติดต่อกัน ${meta.loginStreak} วัน` : '🎁 โบนัสล็อกอินรออยู่ที่ตู้จดหมาย',
      11, claimed ? COLORS.good : '#fff2b0',
    ).setOrigin(0, 0.5);
    fitText(login, w - 28);
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
    // เข้าระบบแล้ว: มุมขวาบนใต้แผงสถิติ · ฟอร์มบัญชี: มุมซ้ายล่างเหนือเลขเวอร์ชัน
    const right = this.menuBottom > 0;
    const t = txt(this, right ? W - 14 : 12, right ? (this.compact ? 182 : 152) : H - 26, '', 11, COLORS.dim).setOrigin(right ? 1 : 0, right ? 0 : 1).setStroke('#0b0d1f', 3).setDepth(5);
    const show = () => {
      const s = netStatus();
      t.setText(s === 'online' ? '🟢 ออนไลน์' : s === 'unknown' ? '🟡 กำลังเชื่อมต่อ…' : '⚪ ออฟไลน์ (บันทึกในเครื่อง)');
      t.setColor(s === 'online' ? COLORS.good : COLORS.dim);
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
          const forgot = keep(txt(this, x + pw - 30, at(166, 160), 'ลืมรหัสผ่าน?', 13, '#73eff7').setOrigin(1, 0.5).setStroke('#0b0d1f', 3));
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
    keep(txt(this, 12, H - 8, 'Survivor Isles v0.5 · PC & Mobile · 2.5D', 11, '#8a95a8').setOrigin(0, 1));
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
