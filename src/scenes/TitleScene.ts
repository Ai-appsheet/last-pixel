import Phaser from 'phaser';
import { titleIslandProfile } from '../gfx/art/ui';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { MetaSave, todayKey } from '../core/MetaSave';
import { SaveManager } from '../core/SaveManager';
import { nextOpenText } from '../core/SpecialIsland';
import { ACHIEVEMENTS } from '../data/achievements';
import { CHARACTERS, HERO_CARDS, getCharacter } from '../data/characters';
import { CONTROL_MODES, getControlMode, setControlMode } from '../core/ControlMode';
import { getSettings, setSettings } from '../core/Settings';
import { CLASS_LOOKS, buildHeroTexture, heroKey } from '../gfx/art/heroes';
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
import { heroStrip } from '../ui/heroStrip';
import { applyUiScale } from '../ui/layout';
import { fmtMoney } from '../ui/money';
import { QUALITY_PREFS, quality, qualityName, qualityPref, setQualityPref } from '../core/Quality';
import { reducedMotion } from '../ui/layout';

const W = 960;
const H = 540;
/** ขนาดพิกเซลของโลโก้ (ชื่อ 14 ตัวอักษร → 4 พอดีระหว่างแผงสถิติกับปุ่มบัญชี) */
const LOGO_PX = 4;
/** จอเล็ก: ขยายคอลัมน์เมนูซ้าย */
const MENU_K = 1.18;
/** ตำแหน่งเกาะหลัก (มุมซ้ายบนของ texture title_island 960×288) */
const IX = 190;
const IY = 322;
/** เส้นขอบฟ้า */
const HORIZON = 304;

/** ความสูงพื้นหญ้าของ title_island (ใช้โปรไฟล์เดียวกับ ui.ts) หน่วยพิกเซลก่อนขยาย */
function islandTop(u: number) {
  return titleIslandProfile(u).top;
}
/** y บนจอของพื้นหญ้าที่ตำแหน่ง x */
const groundY = (x: number) => IY + islandTop(Math.floor((x - IX) / 3)) * 3;

/** สุ่มแบบกำหนด seed (ให้ภาพวาดเหมือนเดิมทุกครั้ง) */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** หน้าปก: ฉากเกาะยามพลบค่ำ + ราชาปีศาจ/มอนสเตอร์/เรือ (pixel art เคลื่อนไหว) + เมนูหลัก */
export class TitleScene extends Phaser.Scene {
  private sea!: Phaser.GameObjects.TileSprite;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** ชั้นภาพสำหรับ parallax: ไกล / กลางทะเล / ใกล้ (บนเกาะ) */
  private far!: Phaser.GameObjects.Container;
  private mid!: Phaser.GameObjects.Container;
  private near!: Phaser.GameObjects.Container;
  private par = { x: 0, y: 0 };
  private clouds: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private serpent!: Phaser.GameObjects.Sprite;
  private serpentWater = 342;
  private demon!: Phaser.GameObjects.Sprite;
  private aura!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('TitleScene');
  }

  private keyArt?: Phaser.GameObjects.Image;
  /** ขอบล่างของกล่องเมนู (เข้าระบบแล้ว) — 0 = หน้าฟอร์มเข้าสู่ระบบ */
  private menuBottom = 0;

  /** จอเล็ก (มือถือ) — ซ่อนของตกแต่งเล็กๆ ที่อ่านไม่ออก */
  private compact = false;

  create() {
    this.compact = applyUiScale(this);
    fadeIn(this);
    this.menuBottom = 0;
    queueArt(this, ART, true);
    queueItemArtIndex(this, true);
    this.keyArt = undefined;
    this.overlay = null;
    this.menuMsg = null;
    this.entering = false;
    this.clouds = [];
    this.par = { x: 0, y: 0 };
    this.makeTextures();
    this.drawCover();
    this.drawLogo();
    this.drawMenu();
    this.drawNet();
    // ออนไลน์ + จำการเข้าระบบไว้: ดึงเซฟล่าสุดจากเซิร์ฟเวอร์ (เครื่องอื่นอาจเล่นต่อไปแล้ว) → วาดเมนูใหม่ถ้าเปลี่ยน
    if (apiEnabled() && getAccounts().current()) {
      void Sync.pullOnce().then((changed) => {
        if (!this.sys.isActive() || this.overlay || this.entering) return;
        if (changed || !getAccounts().current()) this.scene.restart();
      });
    }
    // ไฮไลต์ด่าน/บอส + แถบตัวละคร — ถ้าภาพยังโหลดไม่เสร็จ (เปิดครั้งแรก) วาดตอนโหลดเสร็จ
    const extras = () => {
      if (!this.keyArt) return;
      // ภาพปกใหม่โหลดเสร็จทีหลัง → สลับเข้าไป
      if (this.keyArt.texture.key !== 'art_cover' && this.textures.exists('art_cover')) {
        this.keyArt.setTexture('art_cover');
        this.keyArt.setScale(Math.max(W / this.keyArt.width, H / this.keyArt.height) * 1.05);
      }
      this.drawShowcase();
      this.drawHeroStrip();
    };
    if (this.load.isLoading()) this.load.once('complete', extras);
    else extras();
    Sfx.startMusic('title'); // เล่นจริงหลังแตะครั้งแรก (ปลดล็อกเสียง)
    this.input.once('pointerdown', () => Sfx.unlock());
  }

  // ---------------------------------------------------------------- texture เฉพาะหน้าปก

  private makeTextures() {
    const tx = this.textures;
    // แสงฟุ้งสีขาว (เอาไป tint สีอะไรก็ได้)
    if (!tx.exists('tt_softglow')) {
      const t = tx.createCanvas('tt_softglow', 128, 128)!;
      const ctx = t.getContext();
      const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    // เงามืดด้านซ้ายให้อ่านเมนูง่าย
    if (!tx.exists('tt_leftshade')) {
      const t = tx.createCanvas('tt_leftshade', 480, H)!;
      const ctx = t.getContext();
      const g = ctx.createLinearGradient(0, 0, 480, 0);
      g.addColorStop(0, 'rgba(8,8,22,0.8)');
      g.addColorStop(0.6, 'rgba(8,8,22,0.45)');
      g.addColorStop(1, 'rgba(8,8,22,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 480, H);
      t.refresh();
      t.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    // เมฆพิกเซล (ขอบล่างติดแสงอาทิตย์ตก)
    for (let i = 0; i < 3; i++) {
      const key = `tt_cloud_${i}`;
      if (tx.exists(key)) continue;
      const rnd = lcg(91 + i * 37);
      const cw = 64 + i * 10;
      const ch = 14;
      const blobs = Array.from({ length: 6 }, () => ({ x: 8 + rnd() * (cw - 16), y: 7 + rnd() * 4, rx: 6 + rnd() * 10, ry: 3 + rnd() * 3 }));
      const inside = (x: number, y: number) => y < ch - 1 && blobs.some((b) => ((x + 0.5 - b.x) / b.rx) ** 2 + ((y + 0.5 - b.y) / b.ry) ** 2 <= 1);
      const t = tx.createCanvas(key, cw, ch)!;
      const ctx = t.getContext();
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (!inside(x, y)) continue;
          ctx.fillStyle = !inside(x, y + 1) ? '#b85a6a' : !inside(x, y + 2) ? '#7a3a63' : !inside(x, y - 1) ? '#4a3466' : '#2f2350';
          ctx.fillRect(x, y, 1, 1);
        }
      }
      t.refresh();
    }
    // เกาะหินปีศาจกลางทะเล (64×26 ขยาย ×3)
    if (!tx.exists('tt_crag')) {
      const rnd = lcg(666);
      const cw = 64;
      const ch = 26;
      const top: number[] = [];
      for (let x = 0; x < cw; x++) {
        const d = Math.abs(x - 32);
        let t = d < 8 ? 2 + (rnd() < 0.3 ? 1 : 0) : 2 + (d - 8) * 1.05 + rnd() * 2.5;
        if (x === 18 || x === 47) t -= 6; // ยอดแหลม
        top.push(Math.max(0, Math.min(ch, Math.round(t))));
      }
      const solid = (x: number, y: number) => x >= 0 && x < cw && y >= top[x] && y < ch;
      const t = tx.createCanvas('tt_crag', cw, ch)!;
      const ctx = t.getContext();
      for (let x = 0; x < cw; x++) {
        for (let y = top[x]; y < ch; y++) {
          let c = (x * 7 + y * 3) % 11 === 0 ? '#2a1d40' : '#1d1630';
          if (!solid(x, y - 1)) c = '#4a3466';
          else if (!solid(x - 1, y) || !solid(x - 1, y - 1)) c = '#5d275d'; // ขอบติดแสงจันทร์
          if (y >= ch - 2) c = (x + y) % 3 === 0 ? '#d6e4ee' : '#29366f'; // ฟองคลื่นที่ฐาน
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
      // รอยแยกลาวา
      for (const lx of [24, 29, 37, 41]) {
        for (let y = top[lx] + 4; y < ch - 3; y++) {
          if (rnd() < 0.25) continue;
          ctx.fillStyle = rnd() < 0.4 ? '#ef7d57' : '#b13e53';
          ctx.fillRect(lx + (y % 4 === 0 ? 1 : 0), y, 1, 1);
        }
      }
      t.refresh();
    }
    // มงกุฎราชาปู
    if (!tx.exists('tt_crown')) {
      const rows = ['Y...Y...Y', 'YY.YYY.YY', 'YYYYYYYYY', 'YRYYbYYRY', 'yyyyyyyyy'];
      const col: Record<string, string> = { Y: '#ffcd75', y: '#fff2b0', R: '#b13e53', b: '#41a6f6' };
      const t = tx.createCanvas('tt_crown', 11, 7)!;
      const ctx = t.getContext();
      const on = (x: number, y: number) => y >= 0 && y < rows.length && x >= 0 && x < 9 && rows[y][x] !== '.';
      for (let y = -1; y <= rows.length; y++) {
        for (let x = -1; x <= 9; x++) {
          if (on(x, y)) ctx.fillStyle = col[rows[y][x]];
          else if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) ctx.fillStyle = '#1a1c2c';
          else continue;
          ctx.fillRect(x + 1, y + 1, 1, 1);
        }
      }
      t.refresh();
    }
  }

  /** เรืองแสงนุ่ม (ADD) */
  private softGlow(x: number, y: number, color: number, sx: number, sy = sx, alpha = 0.5) {
    return this.add.image(x, y, 'tt_softglow').setTint(color).setScale(sx, sy).setAlpha(alpha).setBlendMode(Phaser.BlendModes.ADD);
  }

  // ---------------------------------------------------------------- ภาพปก

  private drawCover() {
    const R = Phaser.Math.Between;
    this.add.image(0, 0, 'title_sky').setOrigin(0);
    // ดาวกระพริบ
    for (let i = 0; i < 36; i++) {
      const s = this.add.image(R(0, W), R(0, 200), 'sparkle').setScale(Phaser.Math.FloatBetween(0.5, 1.2)).setAlpha(Phaser.Math.FloatBetween(0.3, 1));
      this.tweens.add({ targets: s, alpha: 0.1, duration: R(700, 2200), yoyo: true, repeat: -1, delay: R(0, 2000) });
    }
    // เมฆลอยช้าๆ
    [[120, 168, 0.12], [560, 206, 0.2], [880, 150, 0.08]].forEach(([x, y, speed], i) => {
      const img = this.add.image(x, y, `tt_cloud_${i}`).setScale(3).setAlpha(0.85);
      this.clouds.push({ img, speed });
    });

    // ---------- ชั้นไกล: จันทร์ + ราชาปีศาจบนเกาะหิน ----------
    const back = this.add.container(0, 0);
    this.aura = this.softGlow(830, 200, 0xb13e53, 3.6, 3.2, 0.5);
    back.add([
      this.softGlow(830, 92, 0xfff2b0, 2.6, 2.6, 0.45),
      this.add.image(830, 92, 'moon'),
      this.aura,
    ]);
    this.tweens.add({ targets: this.aura, alpha: 0.75, scale: 3.9, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const hills = this.add.graphics();
    hills.fillStyle(0x2b1f4a, 1);
    hills.fillEllipse(250, HORIZON + 6, 340, 40);
    hills.fillEllipse(600, HORIZON + 4, 150, 18);
    hills.fillStyle(0x3a2856, 1);
    hills.fillEllipse(420, HORIZON + 6, 120, 14);
    back.add(hills);

    // ทะเล + แสงจันทร์สะท้อน
    this.sea = this.add.tileSprite(0, HORIZON, W, H - HORIZON, 'tile_deep').setOrigin(0).setTileScale(3);
    for (let i = 0; i < 6; i++) {
      const sp = this.add.rectangle(830 + R(-30, 30), 314 + i * 7, R(10, 34), 3, i % 2 ? 0xfff2b0 : 0xef7d57, 0.5);
      this.tweens.add({ targets: sp, alpha: 0.1, scaleX: 0.5, duration: R(500, 1200), yoyo: true, repeat: -1 });
    }

    this.far = this.add.container(0, 0);
    // เรือสินค้าไกลๆ ลอยอยู่ที่ขอบฟ้า
    const ship = this.add.image(520, HORIZON + 4, 'merchant_ship').setOrigin(0.5, 0.92).setTint(0x8f86b8).setFlipX(true);
    this.tweens.add({ targets: ship, x: 470, duration: 30000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: ship, y: '+=2', duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const crag = this.add.image(830, HORIZON + 8, 'tt_crag').setOrigin(0.5, 1).setScale(3);
    this.demon = this.add.sprite(830, HORIZON + 8 - 24 * 3 + 4, 'demon_lord', 0).setOrigin(0.5, 1).setScale(4).setTint(0xc8a8d0);
    if (this.anims.exists('demon_lord_walk')) this.demon.play('demon_lord_walk');
    this.tweens.add({ targets: this.demon, y: '-=4', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.far.add([ship, crag, this.demon]);
    // ค้างคาวบินวนรอบราชาปีศาจ
    for (let i = 0; i < 4; i++) {
      const b = this.add.sprite(830 + R(-90, 90), 170 + R(-50, 40), 'bat').setScale(2).setTint(0x9a8ab8);
      if (this.anims.exists('bat_walk')) b.play({ key: 'bat_walk', startFrame: i % 2 });
      this.tweens.add({ targets: b, x: 830 + (i % 2 ? 120 : -120), duration: R(2600, 4200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: b, y: b.y + R(30, 60), duration: R(1300, 2100), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.far.add(b);
    }
    // อิมพ์บริวาร (ลอยขึ้นลง)
    [[742, 214], [918, 190]].forEach(([x, y], i) => {
      const imp = this.add.sprite(x, y, 'imp', 0).setScale(2);
      if (this.anims.exists('imp_walk_down')) imp.play('imp_walk_down');
      this.far.add([this.softGlow(x, y, 0xef7d57, 0.5, 0.5, 0.45), imp]);
      this.tweens.add({ targets: imp, y: y - 10, duration: 900 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ---------- ชั้นกลาง: เรือ + งูทะเล ----------
    this.mid = this.add.container(0, 0);
    this.serpent = this.add.sprite(690, this.serpentWater + 4, 'serpent', 0).setOrigin(0.5, 0).setScale(3).setTint(0xb8c8e0);
    if (this.anims.exists('serpent_walk')) this.serpent.play('serpent_walk');
    this.mid.add(this.serpent);
    this.serpentLoop();
    const sail = this.add.image(390, 344, 'sailboat').setOrigin(0.5, 0.8).setScale(2);
    const motor = this.add.image(530, 396, 'motorboat').setOrigin(0.5, 0.75).setScale(2).setFlipX(true);
    this.mid.add([sail, motor]);
    this.sailBoat(sail, 610, 22000, 170, false);
    this.sailBoat(motor, 370, 9000, 90, true);

    // ---------- ชั้นใกล้: เกาะหลัก ----------
    this.near = this.add.container(0, 0);
    const S = 3;
    const near = this.near;
    const put = (key: string, x: number, y: number, tint?: number) => {
      const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(S);
      if (tint) img.setTint(tint);
      near.add(img);
      return img;
    };
    near.add(this.add.image(IX, IY, 'title_island').setOrigin(0));
    // ป่ามืดด้านขวา (ที่ซอมบี้โผล่มา)
    put('pine_0', 948, groundY(948) + 64, 0x8a8ab0);
    put('oak_1', 896, groundY(896) + 58, 0x9a9ac0);
    put('palm_0', 470, groundY(470) + 92);
    put('palm_1', 770, groundY(770) + 96);
    put('bush_0', 512, 526);
    put('grass_0', 430, 520);
    put('wreck', 410, 552);
    // ควันจากซากเครื่องบิน
    this.time.addEvent({
      delay: 260, loop: true, callback: () => {
        const p = this.add.image(458 + R(-6, 6), 488, 'px').setTint(0x333c57).setScale(3).setAlpha(0.75);
        near.addAt(p, 1);
        this.tweens.add({ targets: p, y: 330, x: p.x + 34, scale: 9, alpha: 0, duration: 3200, onComplete: () => p.destroy() });
      },
    });

    // กองไฟ + แสง + ประกายไฟ
    const fx = 604;
    const fy = 478;
    const fireGlow = this.softGlow(fx, fy - 18, 0xffa040, 2.2, 1.6, 0.55);
    near.add(fireGlow);
    this.tweens.add({ targets: fireGlow, alpha: 0.35, duration: 180, yoyo: true, repeat: -1, ease: 'Stepped' });
    const fire = this.add.sprite(fx, fy, 'campfire').setOrigin(0.5, 1).setScale(S);
    if (this.anims.exists('campfire_burn')) fire.play('campfire_burn');
    near.add(fire);
    this.time.addEvent({
      delay: 120, loop: true, callback: () => {
        const e = this.add.image(fx + R(-10, 10), fy - 30, 'ember').setScale(3).setBlendMode(Phaser.BlendModes.ADD);
        near.add(e);
        this.tweens.add({ targets: e, y: e.y - R(60, 130), x: e.x + R(-24, 24), alpha: 0, duration: 1400, onComplete: () => e.destroy() });
      },
    });

    // ตัวละครยืนล้อมกองไฟ หันหน้าสู้ฝูงมอนสเตอร์ทางขวา
    const hero = (id: keyof typeof CLASS_LOOKS) => buildHeroTexture(this, heroKey(CLASS_LOOKS[id]), CLASS_LOOKS[id]);
    // ฮีโร่ทั้งหมดตามลำดับการ์ด (HERO_CARDS) ยืนเรียงสองแถวสลับ
    const heroes: [keyof typeof CLASS_LOOKS, number, number, number][] = HERO_CARDS
      .filter((h) => h.id in CLASS_LOOKS)
      .map((h, i) => [h.id, 470 + i * 34, i % 2 ? 504 : 484, i % 2 ? 0 : 6]);
    heroes.forEach(([id, x, y, frame], i) => {
      const h = this.add.sprite(x, y, hero(id), frame).setOrigin(0.5, 1).setScale(S);
      near.add(h);
      this.tweens.add({ targets: h, scaleY: S * 1.035, duration: 1000 + i * 170, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    // ฝูงมอนสเตอร์ย่องออกจากป่า
    const walker = (key: string, x: number, y: number, dx: number, dur: number, tint: number) => {
      const m = this.add.sprite(x, y, key, 6).setOrigin(0.5, 1).setScale(S).setFlipX(true).setTint(tint);
      if (this.anims.exists(`${key}_walk_side`)) m.play(`${key}_walk_side`);
      m.anims.timeScale = 0.6;
      near.add(m);
      this.tweens.add({
        targets: m, x: x - dx, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        onYoyo: () => m.setFlipX(false), onRepeat: () => m.setFlipX(true),
      });
      return m;
    };
    walker('skeleton', 872, groundY(872) + 76, 26, 3600, 0xc8c8e0);
    walker('zombie', 920, groundY(920) + 98, 34, 4200, 0xa0a0c8);
    walker('zombie', 952, groundY(952) + 124, 22, 3000, 0x8888b0);
    const slime = this.add.sprite(526, 528, 'slime', 0).setOrigin(0.5, 1).setScale(S);
    if (this.anims.exists('slime_walk')) slime.play('slime_walk');
    near.add(slime);
    this.tweens.add({ targets: slime, x: 498, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // ราชาปูบนชายหาด (บอส) + มงกุฎ
    const crab = this.add.sprite(810, 532, 'crab', 0).setOrigin(0.5, 1).setScale(6).setTint(0xffb080);
    if (this.anims.exists('crab_walk')) crab.play('crab_walk');
    const crown = this.add.image(810, 532 - 78, 'tt_crown').setOrigin(0.5, 1).setScale(3);
    near.add([this.softGlow(810, 500, 0xef7d57, 1.4, 0.6, 0.35), crab, crown]);
    this.tweens.add({ targets: [crab, crown], x: '-=60', duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: crown, y: '-=3', duration: 260, yoyo: true, repeat: -1 });

    // หิ่งห้อย
    for (let i = 0; i < 12; i++) {
      const f = this.add.image(R(360, W), R(360, 520), 'firefly').setScale(2).setBlendMode(Phaser.BlendModes.ADD);
      near.add(f);
      this.tweens.add({ targets: f, x: f.x + R(-40, 40), y: f.y + R(-30, 30), alpha: 0.1, duration: R(1500, 3000), yoyo: true, repeat: -1 });
    }

    // ภาพปกวาด (AI) — ถ้ามี จะแทนฉากพิกเซลที่ประกอบจากโค้ดทั้งหมด แล้วใส่เอฟเฟกต์เคลื่อนไหวทับ
    // ภาพปก: ทีมฮีโร่ + บอส (cover) ถ้ามี ไม่งั้นใช้ keyart
    const art = coverImage(this, 'cover', W, H) ?? coverImage(this, 'keyart', W, H);
    if (art) {
      this.keyArt = art.setScale(art.scale * 1.05);
      this.keyScale = art.scale;
      for (const o of [this.far, this.mid, this.near, this.sea, back]) o?.setVisible(false);
      for (const c of this.clouds) c.img.setVisible(false);
      this.clouds = [];
      // แสงอาทิตย์ตกกระพริบ + เงาเมฆเลื่อน
      const sun = this.softGlow(198, 178, 0xffcd75, 2.4, 2.4, 0.35);
      this.tweens.add({ targets: sun, alpha: 0.15, scale: 2.1, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      const low = quality() === 'low' || reducedMotion();
      if (!low) {
        // Ken Burns: ซูมเข้า-ออก 1.04↔1.10 + ลอยช้าๆ ~12 วิ (ใช้ใน update ร่วมกับ parallax)
        this.tweens.add({ targets: this.kb, s: 1.1, dx: 10, dy: -6, duration: 12000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        // หมอกบางๆ ลอยผ่านแนวขอบฟ้า (ภาพแสงฟุ้งยืดกว้าง)
        for (let i = 0; i < 3; i++) {
          const m = this.softGlow(R(0, W), 250 + i * 40, 0xd6e4ee, 5.5, 0.6, 0.07);
          this.tweens.add({ targets: m, x: m.x + W * 0.6, duration: R(28000, 40000), repeat: -1, yoyo: true, ease: 'Sine.easeInOut' });
        }
        // ประกายน้ำแวววาวริมฝั่งซ้ายล่าง
        for (let i = 0; i < 7; i++) {
          const sp = this.add.rectangle(R(40, 320), R(468, 524), R(8, 22), 2, i % 2 ? 0xfff2b0 : 0x73eff7, 0.45);
          this.tweens.add({ targets: sp, alpha: 0.05, scaleX: 0.4, duration: R(700, 1500), yoyo: true, repeat: -1, delay: R(0, 1200) });
        }
        // ประกายไฟ/หิ่งห้อยลอยขึ้น (จำนวนตามคุณภาพ)
        this.time.addEvent({
          delay: quality() === 'high' ? 260 : 420, loop: true, callback: () => {
            const e = this.add.image(R(380, W), H + 6, Phaser.Math.RND.pick(['ember', 'firefly', 'sparkle'])).setScale(R(1, 2)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
            this.tweens.add({ targets: e, y: R(220, 420), x: e.x + R(-60, 60), alpha: 0, duration: R(2600, 4200), onComplete: () => e.destroy() });
          },
        });
      }
    }

    // แฟลชฟ้าผ่า + ขอบมืด + เงาด้านซ้ายหลังเมนู
    this.flash = this.add.rectangle(0, 0, W, H, 0xd6e4ee, 0).setOrigin(0);
    this.add.image(0, 0, 'vignette').setOrigin(0);
    this.add.image(0, 0, 'tt_leftshade').setOrigin(0);
    // ฟ้าผ่า: ไม่เกิน 1 ครั้ง/6 วิ แฟลชสูงสุด 0.25 · ลดการเคลื่อนไหว = ไม่มีแฟลช
    if (!reducedMotion()) this.time.delayedCall(1800, () => this.lightning());
  }

  /** Ken Burns ของภาพปก (ตัวคูณซูม + ระยะลอย) และสเกลพื้นฐาน */
  private kb = { s: 1.04, dx: 0, dy: 0 };
  private keyScale = 1;

  /** เรือแล่นไป-กลับ + โยกตามคลื่น + คลื่นท้ายเรือ */
  private sailBoat(boat: Phaser.GameObjects.Image, toX: number, dur: number, wakeEvery: number, startLeft: boolean) {
    const flipOut = startLeft;
    this.tweens.add({
      targets: boat, x: toX, duration: dur, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onYoyo: () => boat.setFlipX(!flipOut), onRepeat: () => boat.setFlipX(flipOut),
    });
    this.tweens.add({ targets: boat, y: boat.y - 2, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: boat, angle: { from: -2.5, to: 2.5 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const water = boat.y + 2;
    this.time.addEvent({
      delay: wakeEvery, loop: true, callback: () => {
        const dir = boat.flipX ? -1 : 1;
        const w = this.add.image(boat.x - dir * boat.displayWidth * 0.42, water + Phaser.Math.Between(-1, 1), 'px')
          .setTint(0xd6e4ee).setScale(2, 1).setAlpha(0.85);
        this.mid.addAt(w, 0);
        this.tweens.add({ targets: w, scaleX: 6, x: w.x - dir * 14, alpha: 0, duration: 800, onComplete: () => w.destroy() });
      },
    });
  }

  /** งูทะเลโผล่ขึ้นจากน้ำ → ค้าง → ดำลง แล้วย้ายที่ */
  private serpentLoop() {
    const s = this.serpent;
    if (!s.active) return;
    const top = this.serpentWater + 4;
    s.setPosition(Phaser.Math.Between(660, 704), top);
    this.splash(s.x);
    this.tweens.add({
      targets: s, y: this.serpentWater - 52, duration: 900, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: s, y: '+=4', duration: 600, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
          onComplete: () => {
            this.tweens.add({ targets: s, y: top, duration: 800, ease: 'Sine.easeIn',
              onComplete: () => {
                this.splash(s.x);
                this.time.delayedCall(Phaser.Math.Between(2500, 5000), () => this.serpentLoop());
              } });
          } });
      },
    });
  }

  /** น้ำกระเซ็น */
  private splash(x: number) {
    for (let i = 0; i < 8; i++) {
      const d = this.add.image(x + Phaser.Math.Between(-24, 24), this.serpentWater, 'px').setTint(i % 2 ? 0xd6e4ee : 0x73eff7).setScale(2);
      this.mid.add(d);
      this.tweens.add({ targets: d, y: d.y - Phaser.Math.Between(10, 30), x: d.x + Phaser.Math.Between(-12, 12), alpha: 0, duration: 600, ease: 'Quad.easeOut', onComplete: () => d.destroy() });
    }
  }

  /** ฟ้าผ่าหลังราชาปีศาจ */
  private lightning() {
    if (!this.sys.isActive()) return;
    const R = Phaser.Math.Between;
    const g = this.add.graphics();
    const pts: Phaser.Math.Vector2[] = [];
    let x = R(720, 940);
    const endX = 830 + R(-50, 50);
    for (let i = 0; i <= 7; i++) {
      const y = (i / 7) * 236;
      pts.push(new Phaser.Math.Vector2(Math.round(x), Math.round(y)));
      x += (endX - x) / (8 - i) + R(-16, 16);
    }
    g.lineStyle(7, 0xa77bdb, 0.45).strokePoints(pts);
    g.lineStyle(3, 0xfff2b0, 1).strokePoints(pts);
    // กิ่งสายฟ้า
    const b = pts[3];
    g.lineStyle(2, 0xd6e4ee, 0.9).lineBetween(b.x, b.y, b.x + R(-40, 40), b.y + R(24, 50));
    this.far.addAt(g, 0);
    this.tweens.add({ targets: g, alpha: 0, duration: 380, delay: 90, onComplete: () => g.destroy() });
    this.flash.setAlpha(0.25);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 120 });
    this.time.delayedCall(170, () => {
      this.flash.setAlpha(0.12);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 260 });
    });
    this.demon.setTint(0xffffff);
    this.aura.setAlpha(1);
    this.time.delayedCall(220, () => this.demon.active && this.demon.setTint(0xc8a8d0));
    this.time.delayedCall(R(6000, 10000), () => this.lightning());
  }

  // ---------------------------------------------------------------- โลโก้

  /** สร้างโลโก้ "SURVIVOR ISLES" เป็นพิกเซลจริง: SURVIVOR ไล่สีทอง→ส้ม→แดง · ISLES ไล่สีฟ้าทะเล + ขอบหนาสองชั้น + มิติ + เฟรมแสงวิ้ง */
  private buildLogoTexture(): { face: [number, number][]; w: number; h: number } {
    const TEXT = 'SURVIVOR ISLES';
    /** คำแรก (ทอง) จบที่คอลัมน์ไหน — หลังจากนั้นเป็นคำที่สอง (ฟ้า) */
    const FIRST = 'SURVIVOR';
    // วาดฟอนต์ใหญ่ ×8 แล้วสุ่มจุดกึ่งกลางช่อง → ได้ mask 1 พิกเซลต่อ 1 จุดฟอนต์ (คมทุกเครื่อง)
    const S = 8;
    const cv = document.createElement('canvas');
    cv.width = TEXT.length * 8 * S + 64;
    cv.height = 8 * S + 48;
    const c2 = cv.getContext('2d')!;
    c2.font = `${8 * S}px ${PIXEL_FONT}`;
    c2.textBaseline = 'top';
    c2.fillStyle = '#ffffff';
    c2.fillText(TEXT, 16, 16);
    const splitPx = 16 + c2.measureText(`${FIRST} `).width;
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
    const ramp = ['#fff2b0', '#ffe08a', '#ffcd75', '#f7a65f', '#ef7d57', '#d65a50', '#b13e53'];
    const sea = ['#e4fbff', '#b8f6ff', '#73eff7', '#41c6f6', '#41a6f6', '#3b7dd9', '#3b5dc9'];
    const split = maxX < 0 ? gw : Math.round((splitPx - minX) / S) + PAD;
    const faceColor = (x: number, y: number) => {
      const r = x >= split ? sea : ramp;
      return r[Math.min(r.length - 1, Math.floor(((y - PAD) / Math.max(1, gh)) * r.length))];
    };
    const lighten = (hex: string, t: number) => {
      const n = parseInt(hex.slice(1), 16);
      const m = (v: number) => Math.round(v + (255 - v) * t);
      return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
    };
    const pts: [number, number][] = [];
    if (!this.textures.exists('tt_logo')) {
      const t = this.textures.createCanvas('tt_logo', w + 1, h + 1)!;
      const ctx = t.getContext();
      const dot = (x: number, y: number, c: string) => {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      };
      // เงาตก
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (near(x, y, 2)) dot(x + 1, y + 1, 'rgba(11,13,31,0.75)');
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (face(x, y)) {
            let c = faceColor(x, y);
            if (!face(x, y - 1) && y > PAD) c = lighten(c, 0.5); // ขอบบนสว่าง (bevel)
            else if (!face(x - 1, y)) c = lighten(c, 0.18);
            if (y === PAD && x % 5 === 1) c = '#ffffff';
            dot(x, y, c);
          } else if (ext(x, y)) dot(x, y, x >= split ? '#1d3466' : '#7a2440'); // มิติ
          else if (near(x, y, 1)) dot(x, y, '#1a1c2c'); // ขอบใน
          else if (near(x, y, 2)) dot(x, y, '#5d275d'); // ขอบนอก
        }
      }
      t.refresh();
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (face(x, y)) pts.push([x, y]);
    // เฟรมแสงวิ้งพาดเฉียง
    if (!this.textures.exists('tt_logo_shine')) {
      const N = 16;
      const t = this.textures.createCanvas('tt_logo_shine', (w + 1) * N, h + 1)!;
      const ctx = t.getContext();
      for (let f = 0; f < N; f++) {
        const p = -gh * 2 + ((w + gh * 4) * f) / (N - 1);
        for (const [x, y] of pts) {
          const d = x + (h - y) * 0.7 - p;
          if (d < 0 || d >= 4) continue;
          ctx.fillStyle = d >= 1 && d < 2.5 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.45)';
          ctx.fillRect(f * (w + 1) + x, y, 1, 1);
        }
        t.add(f, 0, f * (w + 1), 0, w + 1, h + 1);
      }
      t.refresh();
      if (!this.anims.exists('tt_logo_shine_a')) {
        this.anims.create({ key: 'tt_logo_shine_a', frames: this.anims.generateFrameNumbers('tt_logo_shine', { start: 0, end: N - 1 }), frameRate: 30, repeat: 0 });
      }
    }
    return { face: pts, w: w + 1, h: h + 1 };
  }

  private drawLogo() {
    const { face, w, h } = this.buildLogoTexture();
    // จอเล็ก: คอลัมน์เมนูซ้ายขยาย → เลื่อนโลโก้ไปทางขวานิดหน่อยไม่ให้ทับ
    const cx = this.compact ? W / 2 + 24 : W / 2;
    const cy = 64;
    const logo = this.add.container(cx, cy);
    const glow = this.softGlow(0, 4, 0xef7d57, (w * LOGO_PX) / 100, (h * LOGO_PX) / 70, 0.45);
    const shine = this.add.sprite(0, 0, 'tt_logo_shine', 0).setScale(LOGO_PX).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    // แยกโลโก้เป็นตัวอักษร (คอลัมน์ที่ไม่มีพิกเซลหน้า = ช่องว่าง) → แต่ละตัวหล่นจากบนแบบยุบ-เด้ง แล้วโยกเป็นคลื่นทีละตัว
    const cols = new Set(face.map(([px]) => px));
    const glyphs: Phaser.GameObjects.Image[] = [];
    let x0 = -1;
    for (let x = 0; x <= w + 1; x++) {
      const on = cols.has(x);
      if (on && x0 < 0) x0 = x;
      if (!on && x0 >= 0) {
        const img = this.add.image(0, 0, 'tt_logo').setScale(LOGO_PX).setCrop(x0 - 3, 0, x - x0 + 6, h + 1);
        glyphs.push(img);
        x0 = -1;
      }
    }
    logo.add([glow, ...glyphs, shine]);
    this.tweens.add({ targets: glow, alpha: 0.75, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const still = reducedMotion();
    glyphs.forEach((l, k) => {
      if (still) return;
      l.setY(-120).setAlpha(0).setScale(LOGO_PX * 0.8, LOGO_PX * 1.25);
      this.tweens.add({ targets: l, y: 0, alpha: 1, duration: 520, delay: 80 + k * 70, ease: 'Bounce.easeOut' });
      this.tweens.add({ targets: l, scaleX: LOGO_PX, scaleY: LOGO_PX, duration: 420, delay: 420 + k * 70, ease: 'Back.easeOut' });
    });
    // โยกเป็นคลื่นทุก ~4.5 วิ (เหมือนหน้าโหลด) + ลอยขึ้นลงเบาๆ ทั้งโลโก้
    if (!still) {
      const wave = () => glyphs.forEach((l, k) => this.tweens.add({ targets: l, y: -7, angle: -3, duration: 260, yoyo: true, delay: k * 70, ease: 'Sine.easeInOut' }));
      this.time.addEvent({ delay: 4500, loop: true, startAt: 2500, callback: wave });
      this.tweens.add({ targets: logo, y: cy - 5, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1200 });
    }
    const playShine = () => {
      if (!shine.active) return;
      shine.setVisible(true).play('tt_logo_shine_a');
      shine.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => shine.setVisible(false));
    };
    this.time.delayedCall(800, playShine);
    this.time.addEvent({ delay: 3600, loop: true, callback: playShine });
    // ประกายดาววิ้งบนตัวอักษร
    this.time.addEvent({
      delay: 520, loop: true, callback: () => {
        if (!face.length) return;
        const [px, py] = Phaser.Utils.Array.GetRandom(face);
        const s = this.add.image((px - w / 2 + 0.5) * LOGO_PX, (py - h / 2 + 0.5) * LOGO_PX, 'sparkle').setScale(0).setBlendMode(Phaser.BlendModes.ADD);
        logo.add(s);
        this.tweens.add({ targets: s, scale: 3, angle: 90, duration: 260, yoyo: true, onComplete: () => s.destroy() });
      },
    });

    // ชื่อรอง: ตัวหนังสือพิกเซลอาร์ต (pixelTxt) ไล่สีขาว→ฟ้า + เส้นประดับสองข้าง · แยกทีละตัวอักษรให้เด้งเป็นคลื่นเบาๆ
    const subText = 'เอาชีวิตรอดบนหมู่เกาะ';
    const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(subText)].map((s) => s.segment) : [...subText];
    const probe = pixelTxt(this, 0, 0, subText, 27, '#ffffff').setVisible(false);
    const pk = probe.scaleX;
    const subW = (probe.width - probe.style.strokeThickness) * pk;
    probe.destroy();
    const sub = this.add.container(cx, 116);
    let sx = -subW / 2;
    const letters: Phaser.GameObjects.Text[] = [];
    for (const ch of seg) {
      const l = pixelTxt(this, sx, 0, ch, 27, '#ffffff').setOrigin(0, 0.5);
      const grad = l.context.createLinearGradient(0, 0, 0, l.height);
      grad.addColorStop(0.2, '#ffffff');
      grad.addColorStop(0.6, '#d6e4ee');
      grad.addColorStop(1, '#73eff7');
      l.setFill(grad);
      sub.add(l);
      letters.push(l);
      sx += (l.width - l.style.strokeThickness) * pk;
    }
    letters.forEach((l, i) => this.tweens.add({ targets: l, y: -3, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1200 + i * 90 }));
    const deco = this.add.graphics();
    const half = subW / 2 + 16;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * half;
      deco.fillStyle(0x1a1c2c, 1).fillRect(Math.min(x0, x0 + dir * 70), 114, 70, 6);
      deco.fillStyle(0xffcd75, 1).fillRect(Math.min(x0, x0 + dir * 70) + 2, 116, 66, 2);
      const gx = x0 + dir * 76;
      deco.fillStyle(0x1a1c2c, 1).fillRect(gx - 5, 112, 10, 10);
      deco.fillStyle(0xffcd75, 1).fillRect(gx - 3, 114, 6, 6);
      deco.fillStyle(0xfff2b0, 1).fillRect(gx - 3, 114, 2, 2);
    }
    // ชื่อรองเต้นเบาๆ · คำโปรยพิมพ์ทีละตัว
    const tagText = 'สร้างฐาน · ล่องเรือ · ล้มบอส · รอดให้ถึงรุ่งเช้า';
    const tag = pixelTxt(this, cx, 142, tagText, 20, COLORS.gold).setOrigin(0.5);
    // ไม่ให้ซ้อนกล่องเมนูซ้าย (ขอบขวา x≈336)
    tag.setX(Math.max(cx, 348 + tag.displayWidth / 2));
    [sub, deco, tag].forEach((o, i) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 450 + i * 150 });
    });
    if (!reducedMotion()) {
      this.tweens.add({ targets: sub, scale: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1400 });
      const chars = seg.length ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(tagText)].map((s) => s.segment) : [...tagText];
      let n = 0;
      tag.setText('');
      this.time.addEvent({ delay: 38, repeat: chars.length - 1, startAt: -700, callback: () => tag.active && tag.setText(chars.slice(0, ++n).join('')) });
    }
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
    const x = 36;
    const y = 142;
    const pw = 300;
    const bw = 264;
    const bx = x + pw / 2;
    const gap = 7;
    const rows = 52 + gap + 40 + gap + 40 + gap + 34 + gap + 34;
    fancyPanel(this, x, y, pw, rows + 30, 'gold');
    // กล่องตัวอย่างด่าน (วนภาพ) วางใต้กล่องเมนูนี้
    this.menuBottom = y + rows + 30;
    let cy = y + 15;
    const next = (h: number) => {
      const c = cy + h / 2;
      cy += h + gap;
      return c;
    };
    // ปุ่มหลัก: มีเกาะแล้ว → ไปเกาะของฉันทันที · ยังไม่มี → เลือกตัวละคร → สุ่มเกาะ
    if (save) {
      const ch = getCharacter(save.character);
      const info = [ch.name, `Lv.${save.player.level ?? 1}`, `วันที่ ${save.day}`].join(' · ');
      fancyButton(this, bx, next(52), {
        w: bw, h: 52, label: 'ไปเกาะของฉัน', pixel: true, sub: info, icon: 'play', theme: 'emerald', size: 21, pulse: true, shine: true,
        onClick: () => void this.enterIsland(),
      });
    } else {
      fancyButton(this, bx, next(52), {
        w: bw, h: 52, label: 'เริ่มผจญภัย', pixel: true, sub: 'เลือกตัวละคร · สุ่มเกาะ', icon: 'sword', theme: 'gold', size: 21, pulse: true, shine: true,
        onClick: () => void this.enterIsland(),
      });
    }
    fancyButton(this, bx, next(40), {
      w: bw, h: 40, label: 'คลัง & ร้านค้า', pixel: true, icon: 'book', theme: 'teal', size: 16,
      onClick: () => fadeTo(this, 'CatalogScene'),
    });
    fancyButton(this, bx, next(40), {
      w: bw, h: 40, label: 'ตัวละคร', pixel: true, icon: 'shield', theme: 'sky', size: 16,
      onClick: () => fadeTo(this, 'CharacterSelectScene', {}),
    });
    const sy = next(34);
    fancyButton(this, bx - 68, sy, { w: 128, h: 34, label: 'ความสำเร็จ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showAchievements() });
    fancyButton(this, bx + 68, sy, { w: 128, h: 34, label: 'วิธีเล่น', icon: 'help', theme: 'steel', size: 14, onClick: () => this.showHelp() });
    // การตั้งค่าทั้งหมด (ควบคุม/เสียง/กล้อง/การแสดงผล) รวมอยู่ในปุ่มนี้
    fancyButton(this, bx, next(34), { w: bw, h: 34, label: 'ตั้งค่า', icon: 'pad', theme: 'steel', size: 14, onClick: () => this.showSettings() });

    this.drawStats(meta, save?.wallet);
    fancyButton(this, 114, 123, { w: 200, h: 28, label: 'อันดับ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showLeaderboard() });
    this.menuMsg = txt(this, bx, y + rows + 40, this.pendingMsg ?? '', 12, COLORS.bad, { align: 'center', wordWrap: { width: pw } }).setOrigin(0.5, 0).setStroke('#0b0d1f', 4);
    this.pendingMsg = null;
    // มือถือ: ขยายคอลัมน์ซ้าย (สถิติ + อันดับ + เมนู) ×1.18 ยึดมุมซ้ายบน — ปุ่มใหญ่พอให้นิ้วกด (กล่องไฮไลต์ด่านด้านล่างซ่อนไว้)
    if (this.compact) {
      const col = this.children.list.filter((o) => !before.has(o));
      this.add.container(0, 0, col).setScale(MENU_K);
      this.menuBottom = Math.round(this.menuBottom * MENU_K);
    }
    // บัญชี (มุมขวาบน) + ออกจากระบบ
    fancyButton(this, W - 104, 32, {
      w: 188, h: 42, label: acc.username, sub: 'ออกจากระบบ', icon: 'shield', theme: 'steel', size: 14,
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
    // ปุ่มเปิด/ปิดเสียง (ใต้ชิปบัญชี) · ปุ่มลัด 0 ใช้ได้ทุกหน้า
    const muteBtn = fancyButton(this, W - 36, 78, { w: 52, h: 38, label: Sfx.isMuted ? '🔇' : '🔊', theme: 'steel', size: 18, onClick: () => Sfx.toggleMute() });
    const onAudio = (m: boolean) => muteBtn.setLabel(m ? '🔇' : '🔊');
    EventBus.on('audio:changed', onAudio);
    this.events.once('shutdown', () => EventBus.off('audio:changed', onAudio));
    // เวอร์ชัน: มุมขวาบนใต้ปุ่มเสียง (ด้านล่างมีกล่องไฮไลต์ + แถวตัวละคร)
    txt(this, W - 12, 118, 'Survivor Isles v0.5 · PC & Mobile · 2.5D', 11, '#8a95a8').setOrigin(1, 0);
  }

  // ---------------------------------------------------------------- ไฮไลต์บนหน้าปก

  /** การ์ดไฮไลต์ใต้เมนู: วนโชว์ตัวละคร ด่าน บอส เกาะพิเศษ ภัยพิบัติ (แตะเพื่อดูภาพถัดไป) — หน้าฟอร์มบัญชีไม่แสดง (ไม่บังทีมฮีโร่บนภาพปก) */
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
    // ยังไม่เข้าระบบ (ฟอร์มบัญชี) หรือจอเล็ก: ไม่แสดง — ให้เห็นทีมฮีโร่บนภาพปกเต็มๆ
    if (this.menuBottom === 0 || this.compact) return;
    const cw = 288;
    const y = this.menuBottom + 14;
    const ch = H - y - 36;
    const x = 42;
    const box = this.add.container(0, 0).setDepth(5);
    const frame = this.add.graphics();
    frame.fillStyle(0x0b0d1f, 0.7).fillRoundedRect(x - 6, y - 6, cw + 12, ch + 34, 10);
    frame.lineStyle(2, 0xffcd75, 0.85).strokeRoundedRect(x - 6, y - 6, cw + 12, ch + 34, 10);
    box.add(frame);
    const label = pixelTxt(this, x + 2, y + ch + 3, '', 20, COLORS.text).setOrigin(0, 0);
    const sub = txt(this, x + cw, y + ch + 8, '', 10, COLORS.dim).setOrigin(1, 0);
    const tag = pixelTxt(this, x + 8, y + 8, '', 18, '#ffffff').setPadding(4, 1, 4, 1);
    const dots = list.map((_, i) => this.add.circle(x + cw / 2 - (list.length - 1) * 4 + i * 8, y + ch - 10, 2.5, 0xffffff, 0.5));
    let cur: Phaser.GameObjects.Image | null = null;
    let i = -1;
    const show = (n: number) => {
      i = (n + list.length) % list.length;
      const s = list[i];
      const img = coverCrop(this, s.art, cw, ch, x, y, s.focus ?? 0.45);
      if (!img) return;
      box.addAt(img, 1);
      img.setAlpha(0);
      this.tweens.add({ targets: img, alpha: 1, duration: 500 });
      if (cur) {
        const old = cur;
        this.tweens.add({ targets: old, alpha: 0, duration: 500, onComplete: () => old.destroy() });
      }
      cur = img;
      label.setText(s.title).setColor(s.color);
      fitText(label, cw - 120);
      sub.setText(s.sub);
      fitText(sub, cw - label.displayWidth - 12);
      tag.setText(s.tag).setBackgroundColor(s.color === '#ffcd75' ? '#b86f50' : s.color === '#a7f070' ? '#257179' : s.color === '#41a6f6' ? '#3b5dc9' : s.color === '#ef7d57' ? '#b13e53' : s.color === '#73eff7' ? '#2a9d96' : '#5d275d');
      dots.forEach((d, k) => d.setFillStyle(k === i ? 0xffcd75 : 0xffffff, k === i ? 1 : 0.45).setRadius(k === i ? 3.5 : 2.5));
    };
    box.add([label, sub, tag, ...dots]);
    const hit = this.add.zone(x, y, cw, ch).setOrigin(0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      Sfx.play('click');
      show(i + 1);
      timer.reset({ delay: 3800, loop: true, callback: () => show(i + 1) });
    });
    box.add(hit);
    const timer = this.time.addEvent({ delay: 3800, loop: true, callback: () => show(i + 1) });
    show(0);
    box.setAlpha(0);
    this.tweens.add({ targets: box, alpha: 1, duration: 600, delay: 300 });
  }

  /**
   * แถวหน้าตัวละครกลม 7 คน (หน้าตาเดียวกับหน้าโหลด — ui/heroStrip.ts) กลางล่างของจอ เหนือเลขเวอร์ชัน
   * เข้าระบบแล้วมีกล่องไฮไลต์มุมซ้ายล่าง → เลื่อนกึ่งกลางไปทางขวา ไม่ทับกัน · แตะ = ไปหน้าตัวละคร
   */
  private drawHeroStrip() {
    // ขวาของคอลัมน์ซ้าย (เมนู/ฟอร์มบัญชี/กล่องไฮไลต์ กว้างถึง x≈344 · จอเล็กขยาย ×1.18)
    const left = this.compact ? 344 * MENU_K : 344;
    const cx = (left + W) / 2;
    heroStrip(this, { cx, cy: H - 46, size: 48, gap: 8, caption: `ตัวละคร ${CHARACTERS.length} แบบ · เริ่มเท่ากัน`, onPick: () => fadeTo(this, 'CharacterSelectScene', {}) });
  }

  /** แผงสถิติมุมซ้ายบน: พลังสูงสุด / รอดนานสุด / เงินในเกาะ (เหรียญ·เพชร) / โบนัสล็อกอิน */
  private drawStats(meta: ReturnType<typeof MetaSave.load>, wallet?: { coins: number; gems: number }) {
    const x = 14;
    const y = 12;
    const w = 200;
    fancyPanel(this, x, y, w, 98, 'steel', 0.86);
    const row = (ry: number, icon: 'sword' | 'moon', label: string, value: string, color: string) => {
      this.add.image(x + 22, ry, iconTexture(this, icon)).setScale(2);
      txt(this, x + 36, ry, label, 12, COLORS.dim).setOrigin(0, 0.5);
      fitText(txt(this, x + w - 14, ry, value, 15, color).setOrigin(1, 0.5), 80);
    };
    row(y + 19, 'sword', 'พลังสูงสุด', (meta.bestPower ?? 0).toLocaleString(), COLORS.gold);
    row(y + 38, 'moon', 'รอดนานสุด', `${meta.bestDays} วัน`, COLORS.good);
    // เงินของเกาะปัจจุบัน (ยังไม่มีเกาะ = ขีด) — รูปแบบเดียวกับ HUD ในเกม
    const my = y + 58;
    const pill = this.add.graphics();
    pill.fillStyle(0x0b0d1f, 0.55).fillRoundedRect(x + 10, my - 10, w - 20, 20, 10);
    pill.lineStyle(1, 0xffcd75, 0.45).strokeRoundedRect(x + 10, my - 10, w - 20, 20, 10);
    this.add.image(x + 24, my, 'i_coin').setScale(1.1);
    fitText(txt(this, x + 34, my, wallet ? fmtMoney(wallet.coins) : '—', 14, COLORS.gold).setOrigin(0, 0.5), 74);
    this.add.image(x + 118, my, 'i_gem').setScale(1.1);
    fitText(txt(this, x + 128, my, wallet ? fmtMoney(wallet.gems) : '—', 14, '#73eff7').setOrigin(0, 0.5), 56);
    const claimed = meta.lastLogin === todayKey();
    const login = txt(
      this, x + 14, y + 81,
      claimed ? `🔥 ล็อกอินติดต่อกัน ${meta.loginStreak} วัน` : '🎁 โบนัสล็อกอินรออยู่ที่ตู้จดหมาย',
      11, claimed ? COLORS.good : '#fff2b0',
    ).setOrigin(0, 0.5);
    fitText(login, w - 28);
    if (!claimed) this.tweens.add({ targets: login, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });
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
    // เข้าระบบแล้ว: มุมขวาบนเหนือเลขเวอร์ชัน · ฟอร์มบัญชี: มุมซ้ายล่างเหนือเลขเวอร์ชัน
    const right = this.menuBottom > 0;
    const t = txt(this, right ? W - 12 : 12, right ? 102 : H - 26, '', 11, COLORS.dim).setOrigin(right ? 1 : 0, right ? 0 : 1).setStroke('#0b0d1f', 3).setDepth(5);
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

  update(t: number, dt: number) {
    if (this.sea) this.sea.tilePositionX += dt * 0.004;
    // เมฆลอย (วนกลับเมื่อพ้นจอ)
    for (const c of this.clouds) {
      c.img.x -= c.speed * dt * 0.06;
      if (c.img.x < -c.img.displayWidth / 2) c.img.x = W + c.img.displayWidth / 2;
    }
    // parallax ตามเมาส์ (มือถือ = แกว่งช้าๆ เอง)
    const p = this.input.activePointer;
    const moved = p.x !== 0 || p.y !== 0;
    const tx = moved ? Phaser.Math.Clamp((p.x - W / 2) / (W / 2), -1, 1) : Math.sin(t * 0.0003) * 0.5;
    const ty = moved ? Phaser.Math.Clamp((p.y - H / 2) / (H / 2), -1, 1) : 0;
    const k = Math.min(1, dt * 0.003);
    this.par.x += (tx - this.par.x) * k;
    this.par.y += (ty - this.par.y) * k;
    this.far?.setPosition(-this.par.x * 4, -this.par.y * 2);
    this.mid?.setPosition(-this.par.x * 8, -this.par.y * 3);
    this.near?.setPosition(-this.par.x * 14, -this.par.y * 4);
    if (this.keyArt) this.keyArt.setPosition(W / 2 - this.par.x * 12 + this.kb.dx, H / 2 - this.par.y * 6 + this.kb.dy).setScale(this.keyScale * this.kb.s);
    // งูทะเล: ตัดส่วนที่อยู่ใต้ผิวน้ำออก
    const s = this.serpent;
    if (s?.active) {
      const visible = Math.min(s.frame.height, (this.serpentWater - s.y) / s.scaleY);
      s.setVisible(visible >= 1);
      if (visible >= 1) s.setCrop(0, 0, s.frame.width, Math.floor(visible));
    }
  }
}

/** หน้าของฟอร์มบัญชีบนหน้าแรก (attach/attachCode = บัญชีเก่าผูกอีเมลหลังเข้าระบบ) */
type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset' | 'attach' | 'attachCode' | 'name';
