import Phaser from 'phaser';
import { titleIslandProfile } from '../gfx/art/ui';
import { Sfx } from '../core/AudioManager';
import { MetaSave, todayKey } from '../core/MetaSave';
import { SaveManager } from '../core/SaveManager';
import { ACHIEVEMENTS } from '../data/achievements';
import { getCharacter } from '../data/characters';
import { CONTROL_MODES, getControlMode, setControlMode } from '../core/ControlMode';
import { getSettings, setSettings } from '../core/Settings';
import { CLASS_LOOKS, buildHeroTexture, heroKey } from '../gfx/art/heroes';
import { COLORS, FONT, heading, PIXEL_FONT, txt } from '../ui/widgets';
import { getAccounts } from '../core/AccountService';
import { apiEnabled, netStatus, onNetStatus } from '../core/backend/Api';
import { Sync, fetchLeaderboard } from '../core/backend/Sync';
import { WORLD_ROOM, getRoomService, localPlayerId } from '../core/RoomService';
import { ART, coverCrop, coverImage, queueArt } from '../ui/art';
import { queueItemArtIndex } from '../ui/itemArt';
import { fancyButton, fancyPanel, fitText, iconTexture } from '../ui/fancyButton';

const W = 960;
const H = 540;
/** ขนาดพิกเซลของโลโก้ */
const LOGO_PX = 6;
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

  create() {
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
    const heroes: [keyof typeof CLASS_LOOKS, number, number, number][] = [
      ['mechanic', 548, 482, 6],
      ['medic', 606, 506, 0],
      ['hunter', 662, 482, 6],
      ['robot', 714, 474, 6],
    ];
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
      for (const o of [this.far, this.mid, this.near, this.sea, back]) o?.setVisible(false);
      for (const c of this.clouds) c.img.setVisible(false);
      this.clouds = [];
      // แสงอาทิตย์ตกกระพริบ + เงาเมฆเลื่อน
      const sun = this.softGlow(198, 178, 0xffcd75, 2.4, 2.4, 0.35);
      this.tweens.add({ targets: sun, alpha: 0.15, scale: 2.1, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      // ประกายไฟ/หิ่งห้อยลอยขึ้น
      this.time.addEvent({
        delay: 260, loop: true, callback: () => {
          const e = this.add.image(R(380, W), H + 6, Phaser.Math.RND.pick(['ember', 'firefly', 'sparkle'])).setScale(R(1, 2)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
          this.tweens.add({ targets: e, y: R(220, 420), x: e.x + R(-60, 60), alpha: 0, duration: R(2600, 4200), onComplete: () => e.destroy() });
        },
      });
    }

    // แฟลชฟ้าผ่า + ขอบมืด + เงาด้านซ้ายหลังเมนู
    this.flash = this.add.rectangle(0, 0, W, H, 0xd6e4ee, 0).setOrigin(0);
    this.add.image(0, 0, 'vignette').setOrigin(0);
    this.add.image(0, 0, 'tt_leftshade').setOrigin(0);
    this.time.delayedCall(1800, () => this.lightning());
  }

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
    this.flash.setAlpha(0.3);
    this.tweens.add({ targets: this.flash, alpha: 0, duration: 120 });
    this.time.delayedCall(170, () => {
      this.flash.setAlpha(0.16);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 260 });
    });
    this.demon.setTint(0xffffff);
    this.aura.setAlpha(1);
    this.time.delayedCall(220, () => this.demon.active && this.demon.setTint(0xc8a8d0));
    this.time.delayedCall(R(3500, 7500), () => this.lightning());
  }

  // ---------------------------------------------------------------- โลโก้

  /** สร้างโลโก้ "LAST PIXEL" เป็นพิกเซลจริง: ไล่สีทอง→ส้ม→แดง + ขอบหนาสองชั้น + มิติ + เฟรมแสงวิ้ง */
  private buildLogoTexture(): { face: [number, number][]; w: number; h: number } {
    const TEXT = 'LAST PIXEL';
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
    const faceColor = (y: number) => ramp[Math.min(ramp.length - 1, Math.floor(((y - PAD) / Math.max(1, gh)) * ramp.length))];
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
            let c = faceColor(y);
            if (!face(x, y - 1) && y > PAD) c = lighten(c, 0.5); // ขอบบนสว่าง (bevel)
            else if (!face(x - 1, y)) c = lighten(c, 0.18);
            if (y === PAD && x % 5 === 1) c = '#ffffff';
            dot(x, y, c);
          } else if (ext(x, y)) dot(x, y, '#7a2440'); // มิติ
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
    const cx = W / 2;
    const cy = 58;
    const logo = this.add.container(cx, cy);
    const glow = this.softGlow(0, 4, 0xef7d57, (w * LOGO_PX) / 100, (h * LOGO_PX) / 70, 0.45);
    const img = this.add.image(0, 0, 'tt_logo').setScale(LOGO_PX);
    const shine = this.add.sprite(0, 0, 'tt_logo_shine', 0).setScale(LOGO_PX).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    logo.add([glow, img, shine]);
    this.tweens.add({ targets: glow, alpha: 0.75, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // เข้าฉากแบบเด้ง แล้วลอยขึ้นลงเบาๆ
    logo.setScale(0.3).setAlpha(0);
    this.tweens.add({
      targets: logo, scale: 1, alpha: 1, duration: 650, ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({ targets: logo, y: cy - 5, duration: 1700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
    });
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

    // ชื่อรอง: ไล่สีขาว→ฟ้า + เรืองฟ้า + เส้นประดับสองข้าง
    const sub = txt(this, cx, 116, 'เอาชีวิตรอดบนหมู่เกาะ', 26, '#ffffff').setOrigin(0.5).setStroke('#1a1c2c', 6);
    const grad = sub.context.createLinearGradient(0, 0, 0, sub.height);
    grad.addColorStop(0.2, '#ffffff');
    grad.addColorStop(0.6, '#d6e4ee');
    grad.addColorStop(1, '#73eff7');
    sub.setFill(grad);
    sub.setShadow(0, 0, '#41a6f6', 12, true, true);
    const deco = this.add.graphics();
    const half = sub.width / 2 + 16;
    for (const dir of [-1, 1]) {
      const x0 = cx + dir * half;
      deco.fillStyle(0x1a1c2c, 1).fillRect(Math.min(x0, x0 + dir * 70), 114, 70, 6);
      deco.fillStyle(0xffcd75, 1).fillRect(Math.min(x0, x0 + dir * 70) + 2, 116, 66, 2);
      const gx = x0 + dir * 76;
      deco.fillStyle(0x1a1c2c, 1).fillRect(gx - 5, 112, 10, 10);
      deco.fillStyle(0xffcd75, 1).fillRect(gx - 3, 114, 6, 6);
      deco.fillStyle(0xfff2b0, 1).fillRect(gx - 3, 114, 2, 2);
    }
    const tag = txt(this, cx, 142, 'สร้างฐาน · ล่องเรือ · ล้มบอส · รอดให้ถึงรุ่งเช้า', 13, COLORS.gold).setOrigin(0.5);
    [sub, deco, tag].forEach((o, i) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 450 + i * 150 });
    });
  }

  // ---------------------------------------------------------------- เมนู

  private drawMenu() {
    const acc = getAccounts().current();
    if (!acc) return this.drawAuth();
    const meta = MetaSave.load();
    const save = SaveManager.load();
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
        w: bw, h: 52, label: 'ไปเกาะของฉัน', sub: info, icon: 'play', theme: 'emerald', size: 21, pulse: true, shine: true,
        onClick: () => void this.enterIsland(),
      });
    } else {
      fancyButton(this, bx, next(52), {
        w: bw, h: 52, label: 'เริ่มผจญภัย', sub: 'เลือกตัวละคร → สุ่มเกาะของคุณ', icon: 'sword', theme: 'gold', size: 21, pulse: true, shine: true,
        onClick: () => void this.enterIsland(),
      });
    }
    fancyButton(this, bx, next(40), {
      w: bw, h: 40, label: 'คลังอุปกรณ์ & ร้านค้า', icon: 'book', theme: 'teal', size: 16,
      onClick: () => this.scene.start('CatalogScene'),
    });
    fancyButton(this, bx, next(40), {
      w: bw, h: 40, label: 'ดูตัวละครทั้งหมด', icon: 'shield', theme: 'sky', size: 16,
      onClick: () => this.scene.start('CharacterSelectScene', {}),
    });
    const sy = next(34);
    fancyButton(this, bx - 68, sy, { w: 128, h: 34, label: 'ความสำเร็จ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showAchievements() });
    fancyButton(this, bx + 68, sy, { w: 128, h: 34, label: 'วิธีเล่น', icon: 'help', theme: 'steel', size: 14, onClick: () => this.showHelp() });
    // การตั้งค่าทั้งหมด (ควบคุม/เสียง/กล้อง/การแสดงผล) รวมอยู่ในปุ่มนี้
    fancyButton(this, bx, next(34), { w: bw, h: 34, label: 'ตั้งค่า  (ควบคุม · เสียง · กล้อง)', icon: 'pad', theme: 'steel', size: 14, onClick: () => this.showSettings() });

    this.drawStats(meta);
    fancyButton(this, 114, 120, { w: 200, h: 30, label: 'อันดับ', icon: 'trophy', theme: 'steel', size: 14, onClick: () => this.showLeaderboard() });
    this.menuMsg = txt(this, bx, y + rows + 40, this.pendingMsg ?? '', 12, COLORS.bad, { align: 'center', wordWrap: { width: pw } }).setOrigin(0.5, 0).setStroke('#0b0d1f', 4);
    this.pendingMsg = null;
    // บัญชี (มุมขวาบน) + ออกจากระบบ
    fancyButton(this, W - 104, 32, {
      w: 188, h: 42, label: acc.username, sub: 'แตะเพื่อออกจากระบบ', icon: 'shield', theme: 'steel', size: 14,
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
    txt(this, W - 12, H - 6, 'v0.4 · PC & Mobile · 2.5D', 11, '#8a95a8').setOrigin(1, 1);
  }

  // ---------------------------------------------------------------- ไฮไลต์บนหน้าปก

  /** การ์ดไฮไลต์มุมขวาล่าง: วนโชว์ด่าน บอส เกาะพิเศษ ภัยพิบัติ (แตะเพื่อดูภาพถัดไป) */
  private drawShowcase() {
    const slides: { art: string; tag: string; title: string; sub: string; color: string }[] = [
      { art: 'dungeon_1', tag: 'ด่าน 1', title: 'ถ้ำหินมืด', sub: 'ค้างคาว สไลม์ โครงกระดูก · Lv.1–10', color: '#a77bdb' },
      { art: 'boss_golem', tag: 'บอส', title: 'โกเลมหินยักษ์', sub: 'ผู้เฝ้าถ้ำหินมืด', color: '#ef7d57' },
      { art: 'dungeon_2', tag: 'ด่าน 2', title: 'เหมืองร้าง', sub: 'มัมมี่ เงาหลอน · Lv.10–25', color: '#a77bdb' },
      { art: 'boss_crab', tag: 'บอส', title: 'ราชาปูยักษ์', sub: 'ขึ้นฝั่งในคืนภัยพิบัติ', color: '#ef7d57' },
      { art: 'dungeon_3', tag: 'ด่าน 3', title: 'สุสานโบราณ', sub: 'อิมป์ไฟ ปีศาจ · Lv.25+', color: '#a77bdb' },
      { art: 'boss_demon', tag: 'บอสใหญ่', title: 'ราชาปีศาจ', sub: 'มาเยือนทุก 5 คืน', color: '#ef7d57' },
      { art: 'special_island', tag: 'เกาะพิเศษ', title: 'เกาะมหาสมบัติ', sub: 'เปิด 1 ชม. ทุก 4 ชม. · กล่องทอง/เพชร', color: '#ffcd75' },
      { art: 'market_island', tag: 'เกาะกลาง', title: 'ตลาดผู้รอดชีวิต', sub: 'ซื้อขายกับผู้เล่นคนอื่น · ห้ามต่อสู้', color: '#ffcd75' },
      { art: 'hz_tsunami', tag: 'ภัยพิบัติ', title: 'คลื่นยักษ์ & อีก 7 ภัย', sub: 'ยิ่งรอดนาน ยิ่งถี่และแรง', color: '#41a6f6' },
      { art: 'conquest', tag: 'เป้าหมาย', title: 'พิชิตเกาะร้าง', sub: 'ล้มบอสดันเจี้ยนครบ 3 ด่าน', color: '#a7f070' },
    ].filter((s) => this.textures.exists(`art_${s.art}`));
    if (!slides.length) return;
    // เข้าระบบแล้ว: ใต้กล่องเมนูทางซ้าย · ยังไม่เข้า (ฟอร์มสูง): มุมขวาล่าง
    const under = this.menuBottom > 0;
    const cw = under ? 288 : 292;
    const y = under ? this.menuBottom + 14 : H - 150 - 40;
    const ch = under ? H - y - 36 : 150;
    const x = under ? 42 : W - cw - 18;
    const box = this.add.container(0, 0).setDepth(5);
    const frame = this.add.graphics();
    frame.fillStyle(0x0b0d1f, 0.7).fillRoundedRect(x - 6, y - 6, cw + 12, ch + 34, 10);
    frame.lineStyle(2, 0xffcd75, 0.85).strokeRoundedRect(x - 6, y - 6, cw + 12, ch + 34, 10);
    box.add(frame);
    const label = txt(this, x + 2, y + ch + 6, '', 14, COLORS.text).setOrigin(0, 0);
    const sub = txt(this, x + cw, y + ch + 8, '', 10, COLORS.dim).setOrigin(1, 0);
    const tag = txt(this, x + 8, y + 8, '', 12, '#ffffff').setPadding(8, 3, 8, 3).setStroke('#0b0d1f', 3);
    const dots = slides.map((_, i) => this.add.circle(x + cw / 2 - (slides.length - 1) * 5 + i * 10, y + ch - 10, 2.5, 0xffffff, 0.5));
    let cur: Phaser.GameObjects.Image | null = null;
    let i = -1;
    const show = (n: number) => {
      i = (n + slides.length) % slides.length;
      const s = slides[i];
      const img = coverCrop(this, s.art, cw, ch, x, y, 0.45);
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
      tag.setText(s.tag).setBackgroundColor(s.color === '#ffcd75' ? '#b86f50' : s.color === '#a7f070' ? '#257179' : s.color === '#41a6f6' ? '#3b5dc9' : s.color === '#ef7d57' ? '#b13e53' : '#5d275d');
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

  /** แถบหน้าตัวละคร 7 คน (แตะ = ไปหน้าตัวละคร) */
  private drawHeroStrip() {
    const ids = ['mechanic', 'medic', 'hunter', 'farmer', 'scout', 'shaman', 'robot'].filter((id) => this.textures.exists(`art_char_${id}`));
    if (!ids.length) return;
    const s = 38;
    const gap = 6;
    const total = ids.length * s + (ids.length - 1) * gap;
    const x0 = this.menuBottom > 0 ? W - 18 - total : W - 18 - 292 - 24 - total;
    const y = H - 40 - s + 2;
    txt(this, x0, y - 18, 'ตัวละคร 7 แบบ · เริ่มเท่ากัน ไม่มีสายอาชีพ', 11, '#fff2b0').setStroke('#0b0d1f', 4).setDepth(5);
    ids.forEach((id, k) => {
      const x = x0 + k * (s + gap);
      const bg = this.add.rectangle(x - 2, y - 2, s + 4, s + 4, 0x0b0d1f, 0.75).setOrigin(0).setStrokeStyle(2, 0xffcd75, 0.8).setDepth(5);
      // ครอปเฉพาะช่วงหัว (ภาพเต็มตัว: หัวอยู่กลาง ช่วงบน ~10–40% ของภาพ)
      const face = this.add.image(0, 0, `art_char_${id}`).setOrigin(0).setDepth(5);
      const cs = face.width * 0.3;
      const cx = (face.width - cs) / 2;
      const cy = face.height * 0.1;
      face.setScale(s / cs).setCrop(cx, cy, cs, cs).setPosition(x - cx * (s / cs), y - cy * (s / cs));
      const hit = this.add.zone(x, y, s, s).setOrigin(0).setInteractive({ useHandCursor: true }).setDepth(6);
      hit.on('pointerover', () => bg.setStrokeStyle(3, 0xffffff, 1));
      hit.on('pointerout', () => bg.setStrokeStyle(2, 0xffcd75, 0.8));
      hit.on('pointerdown', () => this.scene.start('CharacterSelectScene', {}));
      bg.setAlpha(0);
      face.setAlpha(0);
      this.tweens.add({ targets: [bg, face], alpha: 1, duration: 300, delay: 400 + k * 80 });
    });
  }

  /** แผงสถิติมุมซ้ายบน: พลังสูงสุด / รอดนานสุด / โบนัสล็อกอิน */
  private drawStats(meta: ReturnType<typeof MetaSave.load>) {
    const x = 14;
    const y = 12;
    const w = 200;
    fancyPanel(this, x, y, w, 86, 'steel', 0.86);
    const row = (ry: number, icon: 'sword' | 'moon', label: string, value: string, color: string) => {
      this.add.image(x + 22, ry, iconTexture(this, icon)).setScale(2);
      txt(this, x + 36, ry, label, 12, COLORS.dim).setOrigin(0, 0.5);
      fitText(txt(this, x + w - 14, ry, value, 16, color).setOrigin(1, 0.5), 80);
    };
    row(y + 22, 'sword', 'พลังสูงสุด', (meta.bestPower ?? 0).toLocaleString(), COLORS.gold);
    row(y + 44, 'moon', 'รอดนานสุด', `${meta.bestDays} วัน`, COLORS.good);
    const claimed = meta.lastLogin === todayKey();
    const login = txt(
      this, x + 14, y + 67,
      claimed ? `🔥 ล็อกอินติดต่อกัน ${meta.loginStreak} วัน` : '🎁 โบนัสล็อกอินรออยู่ที่ตู้จดหมาย',
      11, claimed ? COLORS.good : '#fff2b0',
    ).setOrigin(0, 0.5);
    fitText(login, w - 28);
    if (!claimed) this.tweens.add({ targets: login, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });
  }

  // ---------------------------------------------------------------- หน้าต่างย่อย

  private modal(title: string, build: (c: Phaser.GameObjects.Container) => void) {
    this.overlay?.destroy();
    const c = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, W, H, 0x0b0d1f, 0.85).setOrigin(0).setInteractive();
    c.add([dim, fancyPanel(this, 70, 24, W - 140, H - 48, 'gold', 0.96), heading(this, W / 2, 38, title, 26).setOrigin(0.5, 0)]);
    build(c);
    c.add(fancyButton(this, W / 2, H - 60, {
      w: 180, h: 40, label: 'ปิด', icon: 'close', theme: 'crimson', size: 16,
      onClick: () => {
        c.destroy();
        this.overlay = null;
      },
    }));
    this.overlay = c;
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
    if (save) this.scene.start('GameScene', { roomId: save.roomId, character: save.character, restore: true });
    else this.scene.start('CharacterSelectScene', { play: true, name: getAccounts().current()?.username });
  }

  /** ไฟสถานะการเชื่อมต่อ (มุมซ้ายล่าง เหนือเลขเวอร์ชัน) */
  private drawNet() {
    // กล่องตัวอย่างด่านอยู่ซ้ายล่าง → ไฟสถานะย้ายไปขวาล่าง (เหนือเลขเวอร์ชัน)
    const right = this.menuBottom > 0;
    const t = txt(this, right ? W - 12 : 12, right ? H - 20 : H - 32, '', 11, COLORS.dim).setOrigin(right ? 1 : 0, 1).setStroke('#0b0d1f', 3).setDepth(5);
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

  /** ยังไม่เข้าระบบ: ฟอร์มเข้าสู่ระบบ / สมัครสมาชิก */
  private authMode: 'login' | 'register' = 'login';

  private drawAuth() {
    const x = 36;
    const y = 156;
    const pw = 300;
    const bx = x + pw / 2;
    const reg = this.authMode === 'register';
    fancyPanel(this, x, y, pw, reg ? 330 : 300, 'gold');
    fancyButton(this, bx - 68, y + 30, { w: 128, h: 34, label: 'เข้าสู่ระบบ', theme: reg ? 'steel' : 'gold', size: 14, onClick: () => this.switchAuth('login') });
    fancyButton(this, bx + 68, y + 30, { w: 128, h: 34, label: 'สมัครสมาชิก', theme: reg ? 'gold' : 'steel', size: 14, onClick: () => this.switchAuth('register') });

    const input = (yy: number, placeholder: string, type: string) => {
      const el = document.createElement('input');
      el.type = type;
      el.placeholder = placeholder;
      el.maxLength = type === 'password' ? 64 : 16;
      el.autocomplete = type === 'password' ? (reg ? 'new-password' : 'current-password') : 'username';
      Object.assign(el.style, {
        width: '236px', height: '34px', fontSize: '16px', fontFamily: FONT, padding: '0 10px', borderRadius: '6px',
        border: '3px solid #8a5a35', background: '#1a1c2c', color: '#f4f4f4', outline: 'none', boxSizing: 'border-box',
      });
      this.add.dom(bx, yy, el);
      return el;
    };
    txt(this, x + 32, y + 58, 'ชื่อผู้ใช้', 12, COLORS.dim);
    const user = input(y + 88, 'ชื่อผู้ใช้', 'text');
    txt(this, x + 32, y + 110, 'รหัสผ่าน', 12, COLORS.dim);
    const pass = input(y + 140, 'รหัสผ่าน (6 ตัวขึ้นไป)', 'password');
    let pass2: HTMLInputElement | null = null;
    let rememberBox: HTMLInputElement | null = null;
    let by = y + 196;
    if (reg) {
      txt(this, x + 32, y + 162, 'ยืนยันรหัสผ่าน', 12, COLORS.dim);
      pass2 = input(y + 192, 'พิมพ์รหัสผ่านอีกครั้ง', 'password');
      by = y + 244;
    } else {
      const wrap = document.createElement('label');
      Object.assign(wrap.style, { color: '#d6e4ee', fontFamily: FONT, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' });
      rememberBox = document.createElement('input');
      rememberBox.type = 'checkbox';
      rememberBox.checked = true;
      wrap.append(rememberBox, 'จำฉันไว้ในเครื่องนี้');
      this.add.dom(bx, y + 172, wrap);
      by = y + 218;
    }
    const err = txt(this, bx, by + 34, '', 12, COLORS.bad, { align: 'center', wordWrap: { width: 260 } }).setOrigin(0.5, 0);
    let busy = false;
    const submit = async () => {
      if (busy) return;
      if (reg && pass.value !== pass2!.value) {
        err.setText('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        Sfx.play('error');
        return;
      }
      busy = true;
      const fields = [user, pass, pass2, rememberBox].filter((e): e is HTMLInputElement => !!e);
      fields.forEach((e) => (e.disabled = true));
      err.setText(apiEnabled() ? 'กำลังเชื่อมต่อ…' : 'กำลังตรวจสอบ…').setColor(COLORS.dim);
      const acc = getAccounts();
      const r = reg ? await acc.register(user.value, pass.value) : await acc.login(user.value, pass.value, rememberBox?.checked ?? true);
      // ออนไลน์: โหลดเซฟ/ข้อมูลถาวรจากเซิร์ฟเวอร์ลงเครื่องก่อนเข้าเกม
      if (!('error' in r) && apiEnabled()) {
        if (this.sys.isActive()) err.setText('กำลังโหลดเซฟ…');
        await Sync.afterLogin();
      }
      busy = false;
      if (!this.sys.isActive()) return;
      fields.forEach((e) => (e.disabled = false));
      if ('error' in r) {
        err.setText(r.error).setColor(COLORS.bad);
        Sfx.play('error');
        return;
      }
      Sfx.play('levelUp');
      if (apiEnabled()) err.setText('กำลังเข้าเกาะ…').setColor(COLORS.dim);
      void this.enterIsland();
    };
    fancyButton(this, bx, by, { w: 236, h: 44, label: reg ? 'สมัครและเริ่มเล่น' : 'เข้าสู่ระบบ', icon: 'play', theme: 'emerald', size: 17, pulse: true, onClick: () => void submit() });
    for (const el of [user, pass, pass2]) el?.addEventListener('keydown', (e) => e.key === 'Enter' && void submit());
    this.time.delayedCall(100, () => user.focus());
    txt(this, 12, H - 8, 'v0.4 · PC & Mobile · 2.5D', 11, '#8a95a8').setOrigin(0, 1);
  }

  private switchAuth(m: 'login' | 'register') {
    if (this.authMode === m) return;
    this.authMode = m;
    this.scene.restart();
  }

  /** หน้าต่างตั้งค่า: รวมทุกการตั้งค่าไว้ที่เดียว (เปลี่ยนแล้วบันทึกทันที) */
  private showSettings() {
    this.modal('⚙ ตั้งค่า', (c) => {
      const a = Sfx.settings;
      const g = getSettings();
      let LX = 100;
      let CX = 330;
      let y = 100;
      const redraw = () => this.showSettings();
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
    });
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
        '⚔  พลังมาจาก เลเวล + อุปกรณ์ + ฐาน · ตายแล้วเลเวลลด 1 ขั้น',
        '🌉  เกาะกลางเป็นเขตค้าขาย: ตลาด ซื้อ/ขาย — ห้ามต่อสู้',
        '⛵  สร้างเรือ (แพ → เรือใบ → เรือยนต์) เพื่อล่องไปเกาะอื่น',
        '📦  ทุกเช้ามีกล่องร่มชูชีพ + ของขวัญในตู้จดหมาย + แร่หายากเกิดใหม่',
        '🔨  คราฟต์: มือเปล่า → โต๊ะช่าง → เตาหลอม (เหล็ก/ทอง) → ดาบคริสตัล',
        '🌡  ดูแลความหิว น้ำ อุณหภูมิ และสติ (ความมืด)',
        '🌙  ทุกคืนมีภัยพิบัติ/มอนสเตอร์บุกแต่ละเกาะ · ทุก 5 วันคือคืนปีศาจ — อยู่ใกล้กองไฟ',
        '',
        'คอม: WASD เดิน · Shift วิ่ง · Space หลบ · คลิก ตี/วาง · E ใช้ · F กิน · Q สกิล',
        '        Tab กระเป๋า+คราฟต์ · M แผนที่ · N เสียง · Esc หยุด',
        'มือถือ: จอยซ้ายเดิน (ดันสุด = วิ่ง) · ปุ่มขวา โจมตี/ใช้/หลบ/สกิล/กิน (เล็งอัตโนมัติ)',
      ];
      c.add(txt(this, 104, 88, lines.join('\n'), 14, COLORS.text, { lineSpacing: 7 }));
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
    this.keyArt?.setPosition(W / 2 - this.par.x * 12, H / 2 - this.par.y * 6);
    // งูทะเล: ตัดส่วนที่อยู่ใต้ผิวน้ำออก
    const s = this.serpent;
    if (s?.active) {
      const visible = Math.min(s.frame.height, (this.serpentWater - s.y) / s.scaleY);
      s.setVisible(visible >= 1);
      if (visible >= 1) s.setCrop(0, 0, s.frame.width, Math.floor(visible));
    }
  }
}
