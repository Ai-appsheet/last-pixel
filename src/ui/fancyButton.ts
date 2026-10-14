import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { PALETTE } from '../data/palette';
import { pixelTxt, txt } from './widgets';

/**
 * ปุ่มสวยๆ แบบ pixel art วาดด้วยโค้ด: ไล่สีแนวตั้ง + ขอบบนสว่าง + ขอบล่างเข้ม + เงาตก + มุมมนแบบพิกเซล
 * ชี้ = สว่างขึ้น + เรืองแสง + ขยายนิดหน่อย · กด = ยุบลง · ปล่อยบนปุ่ม = ทำงาน
 * ใช้ซ้ำได้ทุกฉาก: fancyButton(scene, x, y, { w, h, label, theme, icon, onClick })
 */

/** ขนาดพิกเซลของปุ่ม (1 หน่วย = 2px จอ) */
const P = 2;

export type FancyTheme = 'emerald' | 'gold' | 'magic' | 'sky' | 'teal' | 'steel' | 'crimson';
export type FancyIcon = 'play' | 'sword' | 'star' | 'shield' | 'trophy' | 'help' | 'close' | 'book' | 'pad' | 'moon';

interface ThemeDef {
  /** ไล่สีตัวปุ่ม บน → ล่าง */
  body: string[];
  /** ขอบล่างหนา (ริมปุ่ม 3D) */
  edge: string;
  /** เส้นขอบในบางๆ */
  trim: string;
  /** สีแสงเรือง */
  glow: string;
  /** สีข้อความบรรทัดรอง */
  sub: string;
}

const THEMES: Record<FancyTheme, ThemeDef> = {
  emerald: { body: ['#a7f070', '#5ccf6a', '#38b764', '#257179'], edge: '#1b4d3e', trim: '#fff2b0', glow: '#a7f070', sub: '#eaffd6' },
  gold: { body: ['#fff2b0', '#ffcd75', '#f0a050', '#c2602e'], edge: '#8a3a1e', trim: '#fff2b0', glow: '#ffcd75', sub: '#fff7d6' },
  magic: { body: ['#d9b8ff', '#a77bdb', '#7a4fb0', '#5d275d'], edge: '#341739', trim: '#ff9fb0', glow: '#c08cff', sub: '#f6e8ff' },
  sky: { body: ['#73eff7', '#41a6f6', '#3b5dc9', '#29366f'], edge: '#1a2350', trim: '#d6e4ee', glow: '#41a6f6', sub: '#e4f6ff' },
  teal: { body: ['#a0fff0', '#4fd8c8', '#2a9d96', '#1d5e6a'], edge: '#123a40', trim: '#fff2b0', glow: '#73eff7', sub: '#e0fffa' },
  steel: { body: ['#94b0c2', '#6a819c', '#4a5a78', '#333c57'], edge: '#1d2238', trim: '#d6e4ee', glow: '#94b0c2', sub: '#e6eef4' },
  crimson: { body: ['#ff9f80', '#ef7d57', '#b13e53', '#7a2440'], edge: '#3e1426', trim: '#ffcd75', glow: '#ef7d57', sub: '#ffe8dc' },
};

const OUTLINE = '#0b0d1f';

// ---------------------------------------------------------------- สีช่วย

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: number[]): string {
  return `#${[r, g, b].map((v) => Math.round(Phaser.Math.Clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

/** ผสมสี a → b (t = 0..1) */
function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** สว่างขึ้น (amt > 0) / มืดลง (amt < 0) */
function shade(hex: string, amt: number): string {
  return amt >= 0 ? mix(hex, '#ffffff', amt) : mix(hex, '#000000', -amt);
}

/** สีจากจุดไล่สีหลายจุด */
function gradientAt(stops: string[], t: number): string {
  const f = Phaser.Math.Clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  return mix(stops[i], stops[i + 1], f - i);
}

/** ระยะตัดมุมของแถว r (มุมมนพิกเซล รัศมี rad) */
function cut(r: number, h: number, rad: number) {
  return Math.max(0, rad - r, rad - (h - 1 - r));
}

// ---------------------------------------------------------------- texture ปุ่ม

type State = 'idle' | 'hover' | 'down' | 'off';

/** วาดตัวปุ่ม (หน่วยพิกเซล cw×ch) + เงาตกด้านล่าง 2 หน่วย */
function bodyTexture(scene: Phaser.Scene, theme: FancyTheme, cw: number, ch: number, state: State): string {
  const key = `fbtn_${theme}_${cw}x${ch}_${state}`;
  if (scene.textures.exists(key)) return key;
  const th = state === 'off' ? THEMES.steel : THEMES[theme];
  const lift = state === 'hover' ? 0.14 : state === 'down' ? -0.08 : state === 'off' ? -0.25 : 0;
  const body = th.body.map((c) => shade(c, lift));
  const tex = scene.textures.createCanvas(key, cw, ch + 2)!;
  const ctx = tex.getContext();
  const oy = state === 'down' ? 1 : 0; // กดแล้วตัวปุ่มยุบลง 1 หน่วย
  const row = (y: number, x0: number, x1: number, color: string, alpha = 1) => {
    if (x1 <= x0) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x0, y, x1 - x0, 1);
    ctx.globalAlpha = 1;
  };
  // เงาตก (พื้น)
  for (let r = 0; r < ch; r++) {
    const c = cut(r, ch, 2);
    row(r + 2, c, cw - c, OUTLINE, 0.55);
  }
  // เส้นขอบนอก
  for (let r = 0; r < ch; r++) {
    const c = cut(r, ch, 2);
    row(r + oy, c, cw - c, OUTLINE);
  }
  // ตัวปุ่มไล่สี
  const ih = ch - 2;
  const iw = cw - 2;
  for (let r = 0; r < ih; r++) {
    const c = cut(r, ih, 2);
    const y = r + 1 + oy;
    let color = gradientAt(body, r / Math.max(1, ih - 3));
    if (r >= ih - 2) color = shade(th.edge, lift); // ริมล่างหนา
    else if (r === ih - 3) color = mix(color, th.edge, 0.5);
    row(y, 1 + c, 1 + iw - c, color);
  }
  // ขอบบนสว่าง (bevel) + ประกายมุม
  row(1 + oy, 3, cw - 3, shade(body[0], 0.55));
  row(2 + oy, 2, cw - 2, shade(body[0], 0.25), 0.7);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 2 + oy, 2, 1);
  ctx.fillRect(2, 3 + oy, 1, 1);
  // เงาเงาวาว (ครึ่งบน)
  const gloss = Math.floor(ih * 0.45);
  for (let r = 2; r < gloss; r++) row(r + 1 + oy, 2, cw - 2, '#ffffff', state === 'hover' ? 0.16 : 0.1);
  // ข้างซ้ายสว่าง ข้างขวาเข้ม
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(1, 3 + oy, 1, ih - 5);
  ctx.fillStyle = '#000000';
  ctx.fillRect(cw - 2, 3 + oy, 1, ih - 5);
  // เส้นขอบใน (trim)
  ctx.globalAlpha = state === 'hover' ? 0.7 : 0.35;
  ctx.strokeStyle = th.trim;
  ctx.lineWidth = 1;
  ctx.strokeRect(3.5, 3.5 + oy, cw - 7, ih - 6);
  ctx.globalAlpha = 1;
  tex.refresh();
  return key;
}

/** แสงเรืองรอบปุ่ม (ไล่ฟุ้งนุ่ม ใช้ blend ADD) */
function glowTexture(scene: Phaser.Scene, color: string, w: number, h: number): string {
  const key = `fbglow_${color}_${w}x${h}`;
  if (scene.textures.exists(key)) return key;
  const pad = 28;
  const tex = scene.textures.createCanvas(key, w + pad * 2, h + pad * 2)!;
  const ctx = tex.getContext();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(pad, pad, w, h);
  ctx.fillRect(pad, pad, w, h); // ซ้ำให้ฟุ้งเข้มขึ้น
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}

/** แถบแสงวิ้งพาดเฉียง — สร้างเป็นเฟรมเรียงกัน แล้วเล่นเป็น anim */
const SHINE_FRAMES = 12;
function shineTexture(scene: Phaser.Scene, cw: number, ch: number): string {
  const key = `fbshine_${cw}x${ch}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, cw * SHINE_FRAMES, ch + 2)!;
  const ctx = tex.getContext();
  const ih = ch - 2;
  for (let f = 0; f < SHINE_FRAMES; f++) {
    const ox = f * cw;
    const p = -ih + ((cw + ih * 2) * f) / (SHINE_FRAMES - 1);
    for (let r = 0; r < ih - 2; r++) {
      const c = cut(r, ih, 2);
      for (let x = 1 + c; x < cw - 1 - c; x++) {
        const d = x - (p + (ih - r) * 0.7);
        if (d >= 0 && d < 4) {
          ctx.fillStyle = d >= 1 && d < 2 ? 'rgba(255,255,255,0.75)' : 'rgba(255,242,176,0.35)';
          ctx.fillRect(ox + x, r + 1, 1, 1);
        }
      }
    }
    tex.add(f, 0, ox, 0, cw, ch + 2);
  }
  tex.refresh();
  if (!scene.anims.exists(`${key}_a`)) {
    scene.anims.create({ key: `${key}_a`, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: SHINE_FRAMES - 1 }), frameRate: 28, repeat: 0 });
  }
  return key;
}

// ---------------------------------------------------------------- ไอคอนพิกเซล 7×7 (ใส่เส้นขอบให้อัตโนมัติ)

const ICONS: Record<FancyIcon, string[]> = {
  play: ['WL.....', 'WWL....', 'WWWL...', 'WWWWL..', 'WWWL...', 'WWL....', 'WL.....'],
  sword: ['.....WW', '....WLW', '...WLW.', 'Y.WLW..', '.YLW...', '.mY....', 'm..Y...'],
  star: ['...Y...', '..yYy..', '.yYWYy.', 'YYWWWYY', '.yYWYy.', '..yYy..', '...Y...'],
  shield: ['LWWWWWL', 'WbbbbbL', 'WbCbbBL', 'WbCbbBL', '.LbbBL.', '..LBL..', '...L...'],
  trophy: ['YYYYYYY', 'yYyYYYm', '.yYYYm.', '..YYm..', '...Y...', '..YYY..', '.mmmmm.'],
  help: ['.WWWW..', 'WW..WW.', '....WW.', '...WW..', '..WW...', '.......', '..WW...'],
  book: ['RR...RR', 'RWWRWWR', 'RWLRLWR', 'RWWRWWR', 'RWLRLWR', 'RWWRWWR', '.RRRRR.'],
  pad: ['.......', '.FFFFF.', 'FWFFFRF', 'WWWFRFb', 'FWFFFbF', 'FFF.FFF', 'FF...FF'],
  moon: ['..YYY..', '.Yy....', 'YY.....', 'Yy.....', 'YY.....', '.Yy....', '..YYY..'],
  close: ['W.....W', 'WW...WW', '.WW.WW.', '..WWW..', '.WW.WW.', 'WW...WW', 'W.....W'],
};

/** texture ไอคอนพิกเซล (มีเส้นขอบ) — ใช้นอกปุ่มได้ เช่น แผงสถิติ */
export function iconTexture(scene: Phaser.Scene, name: FancyIcon): string {
  const key = `fbicon_${name}`;
  if (scene.textures.exists(key)) return key;
  const rows = ICONS[name];
  const w = rows[0].length + 2;
  const h = rows.length + 2;
  const solid = (x: number, y: number) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && rows[y][x] !== '.';
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  for (let y = -1; y <= rows.length; y++) {
    for (let x = -1; x <= rows[0].length; x++) {
      if (solid(x, y)) {
        ctx.fillStyle = PALETTE[rows[y][x]] ?? '#ffffff';
      } else if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        ctx.fillStyle = OUTLINE;
      } else continue;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  tex.refresh();
  return key;
}

/** ย่อข้อความให้พอดีความกว้าง */
export function fitText(t: Phaser.GameObjects.Text, maxW: number) {
  // ตัวหนังสือพิกเซล (pixelTxt) มีสเกลพื้นฐาน ×2–3
  const base = (t.getData('pxScale') as number | undefined) ?? 1;
  t.setScale(t.width * base > maxW ? maxW / t.width : base);
  return t;
}

// ---------------------------------------------------------------- ปุ่ม

export interface FancyButtonOptions {
  w: number;
  h: number;
  label: string;
  onClick: () => void;
  /** ข้อความบรรทัดรอง (ตัวเล็กใต้ชื่อปุ่ม) */
  sub?: string;
  /** ชื่อปุ่มแบบพิกเซลอาร์ต (หน้าแรก) */
  pixel?: boolean;
  icon?: FancyIcon;
  theme?: FancyTheme;
  /** ขนาดตัวอักษร (px) */
  size?: number;
  /** แสงเรืองเต้นเป็นจังหวะ (ปุ่มหลัก) */
  pulse?: boolean;
  /** ประกายดาวลอยรอบปุ่ม */
  sparkle?: boolean;
  /** แสงวิ้งพาดผ่านเป็นระยะ */
  shine?: boolean;
  enabled?: boolean;
}

export class FancyButton extends Phaser.GameObjects.Container {
  readonly face: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  private sub?: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private shine: Phaser.GameObjects.Sprite;
  private content: Phaser.GameObjects.GameObject[] = [];
  private pulseTween?: Phaser.Tweens.Tween;
  private timers: Phaser.Time.TimerEvent[] = [];
  private hovered = false;
  private pressed = false;
  private enabled: boolean;
  private readonly cw: number;
  private readonly ch: number;
  private readonly theme: FancyTheme;
  private readonly opts: FancyButtonOptions;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: FancyButtonOptions) {
    super(scene, x, y);
    this.opts = opts;
    this.theme = opts.theme ?? 'gold';
    this.enabled = opts.enabled ?? true;
    this.cw = Math.round(opts.w / P);
    this.ch = Math.round(opts.h / P);
    const th = THEMES[this.theme];
    const oy = (this.ch / 2) / (this.ch + 2); // origin ให้กึ่งกลางตัวปุ่ม (ไม่นับเงา)

    this.glow = scene.add.image(0, 0, glowTexture(scene, th.glow, this.cw * P, this.ch * P))
      .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.face = scene.add.image(0, 0, bodyTexture(scene, this.theme, this.cw, this.ch, this.enabled ? 'idle' : 'off'))
      .setOrigin(0.5, oy).setScale(P);
    this.shine = scene.add.sprite(0, 0, shineTexture(scene, this.cw, this.ch), 0)
      .setOrigin(0.5, oy).setScale(P).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.add([this.glow, this.face, this.shine]);

    // ไอคอน + ข้อความ (จัดกึ่งกลางเป็นกลุ่ม)
    const size = opts.size ?? 18;
    this.label = opts.pixel
      ? pixelTxt(scene, 0, 0, opts.label, size + 2, this.enabled ? '#ffffff' : '#a9bccb').setOrigin(0, 0.5)
      : txt(scene, 0, 0, opts.label, size, this.enabled ? '#ffffff' : '#a9bccb').setOrigin(0, 0.5);
    if (!opts.pixel) this.label.setShadow(0, 2, '#0b0d1f', 0, true, true);
    if (opts.sub) {
      this.sub = txt(scene, 0, 0, opts.sub, Math.max(10, Math.round(size * 0.6)), this.enabled ? th.sub : '#a9bccb').setOrigin(0, 0.5);
      this.sub.setStroke('#0b0d1f', 3);
    }
    if (opts.icon) {
      const iconScale = opts.h >= 44 ? 3 : 2;
      this.icon = scene.add.image(0, 0, iconTexture(scene, opts.icon)).setScale(iconScale);
      if (!this.enabled) this.icon.setTint(0x8a95a8);
    }
    this.layoutContent();
    this.content = [this.icon, this.label, this.sub].filter((o): o is NonNullable<typeof o> => !!o);
    this.add(this.content);

    scene.add.existing(this);
    if (this.enabled) this.bindInput();
    else this.setAlpha(0.8);

    // แสงเรืองเต้น
    if (opts.pulse && this.enabled) {
      this.pulseTween = scene.tweens.add({ targets: this.glow, alpha: { from: 0.18, to: 0.7 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    // แสงวิ้งเป็นระยะ
    if (opts.shine && this.enabled) {
      const loop = () => {
        this.playShine();
        this.timers.push(scene.time.delayedCall(Phaser.Math.Between(2600, 5200), loop));
      };
      this.timers.push(scene.time.delayedCall(Phaser.Math.Between(600, 2000), loop));
    }
    // ประกายดาว
    if (opts.sparkle && this.enabled) {
      this.timers.push(scene.time.addEvent({ delay: 240, loop: true, callback: () => this.spawnSparkle() }));
    }
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.timers.forEach((t) => t.remove(false));
      this.pulseTween?.remove();
      scene.tweens.killTweensOf([this, this.glow, ...this.content]);
    });
  }

  /** วางไอคอน + ชื่อปุ่ม + บรรทัดรองให้อยู่กลางปุ่ม */
  private layoutContent(dy = 0) {
    const maxW = this.cw * P - 28;
    const iconW = this.icon ? this.icon.displayWidth + 8 : 0;
    fitText(this.label, maxW - iconW);
    if (this.sub) fitText(this.sub, maxW - iconW);
    const textW = Math.max(this.label.displayWidth, this.sub?.displayWidth ?? 0);
    const left = -(iconW + textW) / 2;
    const cy = -1 + dy;
    if (this.icon) this.icon.setPosition(Math.round(left + this.icon.displayWidth / 2), cy);
    const tx = Math.round(left + iconW);
    if (this.sub) {
      this.label.setPosition(tx, cy - 8);
      this.sub.setPosition(tx, cy + 11);
    } else {
      this.label.setPosition(tx, cy);
    }
  }

  private applyState(state: State) {
    this.face.setTexture(bodyTexture(this.scene, this.theme, this.cw, this.ch, state));
    this.layoutContent(state === 'down' ? P : 0);
    this.shine.setY(state === 'down' ? P : 0);
  }

  private bindInput() {
    const scene = this.scene;
    this.face.setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        this.hovered = true;
        this.applyState('hover');
        this.pulseTween?.pause();
        this.glow.setAlpha(0.95);
        scene.tweens.killTweensOf(this);
        scene.tweens.add({ targets: this, scale: 1.05, duration: 140, ease: 'Back.easeOut' });
        this.playShine();
        Sfx.play('click', 60);
      })
      .on('pointerout', () => {
        this.hovered = false;
        this.pressed = false;
        this.applyState('idle');
        this.glow.setAlpha(0);
        this.pulseTween?.resume();
        scene.tweens.killTweensOf(this);
        scene.tweens.add({ targets: this, scale: 1, duration: 160, ease: 'Sine.easeOut' });
      })
      .on('pointerdown', () => {
        Sfx.unlock();
        this.pressed = true;
        this.applyState('down');
      })
      .on('pointerup', () => {
        if (!this.pressed) return;
        this.pressed = false;
        this.applyState(this.hovered ? 'hover' : 'idle');
        Sfx.play('click');
        this.opts.onClick();
      });
  }

  /** เล่นแสงวิ้งพาดผ่านหนึ่งครั้ง */
  playShine() {
    if (!this.active || !this.shine.active) return;
    this.shine.setVisible(true).play(`${this.shine.texture.key}_a`);
    this.shine.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.shine.setVisible(false));
  }

  private spawnSparkle() {
    if (!this.active) return;
    const hw = (this.cw * P) / 2;
    const hh = (this.ch * P) / 2;
    const s = this.scene.add.image(Phaser.Math.Between(-hw + 6, hw - 6), Phaser.Math.Between(-hh, hh), 'sparkle')
      .setScale(Phaser.Math.Between(1, 2)).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(Phaser.Utils.Array.GetRandom([0xffffff, 0xff9fb0, 0xd9b8ff, 0xfff2b0]));
    this.add(s);
    this.scene.tweens.add({
      targets: s, y: s.y - Phaser.Math.Between(10, 22), alpha: { from: 1, to: 0 }, angle: 90,
      duration: Phaser.Math.Between(700, 1100), onComplete: () => s.destroy(),
    });
  }

  setLabel(s: string) {
    this.label.setText(s);
    this.layoutContent();
    return this;
  }
}

export function fancyButton(scene: Phaser.Scene, x: number, y: number, opts: FancyButtonOptions): FancyButton {
  return new FancyButton(scene, x, y, opts);
}

// ---------------------------------------------------------------- กรอบหน้าต่างกระจกขอบทอง

export type PanelTrim = 'gold' | 'steel';

/** กรอบหน้าต่างแบบกระจกมืดโปร่งแสง + ขอบไล่สีทอง/เงิน + มุมประดับ (origin มุมซ้ายบน) */
export function fancyPanel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, trim: PanelTrim = 'gold', opacity = 0.82) {
  const cw = Math.round(w / P);
  const ch = Math.round(h / P);
  const key = `fpanel_${trim}_${cw}x${ch}_${Math.round(opacity * 100)}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, cw, ch)!;
    const ctx = tex.getContext();
    const stops = trim === 'gold' ? ['#fff2b0', '#ffcd75', '#c28a50', '#8a5a35'] : ['#d6e4ee', '#94b0c2', '#566c86', '#333c57'];
    const row = (yy: number, x0: number, x1: number, color: string, alpha = 1) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fillRect(x0, yy, x1 - x0, 1);
    };
    for (let r = 0; r < ch; r++) {
      const c0 = cut(r, ch, 3);
      row(r, c0, cw - c0, OUTLINE); // ขอบนอกสุด
      if (r >= 1 && r < ch - 1) {
        const c1 = cut(r - 1, ch - 2, 3);
        row(r, 1 + c1, cw - 1 - c1, gradientAt(stops, r / ch)); // ขอบทองไล่สี
      }
      if (r >= 2 && r < ch - 2) {
        const c2 = cut(r - 2, ch - 4, 2);
        row(r, 2 + c2, cw - 2 - c2, OUTLINE);
      }
      if (r >= 3 && r < ch - 3) {
        const c3 = cut(r - 3, ch - 6, 2);
        // กระจกมืดไล่สี (บนอมม่วง → ล่างน้ำเงินเข้ม)
        row(r, 3 + c3, cw - 3 - c3, mix('#2a2346', '#0e1024', r / ch), opacity);
      }
    }
    // เงาวาวด้านบนของกระจก + เส้นขอบในจางๆ
    for (let r = 3; r < Math.min(ch - 3, 3 + Math.floor(ch * 0.18)); r++) row(r, 4, cw - 4, '#ffffff', 0.04);
    row(3, 4, cw - 4, stops[0], 0.35);
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = stops[1];
    ctx.strokeRect(5.5, 5.5, cw - 11, ch - 11);
    // มุมประดับ (เพชรเล็ก)
    ctx.globalAlpha = 1;
    const gem = (gx: number, gy: number) => {
      ctx.fillStyle = OUTLINE;
      ctx.fillRect(gx - 2, gy - 1, 5, 3);
      ctx.fillRect(gx - 1, gy - 2, 3, 5);
      ctx.fillStyle = stops[1];
      ctx.fillRect(gx - 1, gy, 3, 1);
      ctx.fillRect(gx, gy - 1, 1, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(gx, gy - 1, 1, 1);
    };
    gem(2, 2);
    gem(cw - 3, 2);
    gem(2, ch - 3);
    gem(cw - 3, ch - 3);
    gem(Math.floor(cw / 2), 1);
    tex.refresh();
  }
  return scene.add.image(x, y, key).setOrigin(0).setScale(P);
}
