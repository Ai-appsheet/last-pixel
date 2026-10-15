import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import type { TiltPipeline } from '../gfx/TiltPipeline';
import { quality, type QualityLevel } from '../core/Quality';
import { TILE } from '../world/tiles';

/** ใต้ชั้นความมืดกลางคืน (1e6) แต่อยู่เหนือทุกอย่างในโลก */
const FG_DEPTH = 9.9e5;
/** ทิศลำแสง (ตรงกับ shader) */
const DIR_X = 0.42;
const DIR_Y = 0.91;
const RAY_LEN = 260;

interface Shaft {
  x: number;
  y: number;
  w: number;
  life: number;
  max: number;
  /** ความแรงเต็มของลำนี้ */
  k: number;
  /** ความแรงตอนนี้ (หลังเฟด) */
  a: number;
}

interface Mote {
  img: Phaser.GameObjects.Image;
  shaft: number;
  t: number;
  u: number;
  phase: number;
  speed: number;
}

/**
 * บรรยากาศแบบ "เกาะในฝัน": ปรับโทนสีทั้งจอ + ลำแสงแดดเฉียง + ฝุ่นละอองลอยในลำแสง
 * + เงาใบไม้เข้มตามขอบจอเมื่ออยู่ใกล้ป่า + หมอกจาง
 * คุณภาพ: สูง = ทั้งหมด · กลาง = ลำแสง + ฝุ่น · ต่ำ = ปรับโทนสีอย่างเดียว
 * ไม่สร้างออบเจกต์ใหม่ระหว่างเล่น (พูลคงที่) · กลางคืน/ในดันเจี้ยน/ฝนตก ลำแสงจางหาย
 */
export class AtmosphereSystem {
  private time = 0;
  private shafts: Shaft[] = [];
  private motes: Mote[] = [];
  private leaves: Phaser.GameObjects.Image[] = [];
  private forest = 0;
  private sample = 0;
  private fgAlpha = 0;
  private lastCam = new Phaser.Math.Vector2();
  private vel = new Phaser.Math.Vector2();
  private level: QualityLevel = quality();

  constructor(private scene: GameScene) {
    ensureTextures(scene);
    for (let i = 0; i < 4; i++) this.shafts.push({ x: 0, y: 0, w: 0, life: 0, max: 1, k: 0, a: 0 });
    for (let i = 0; i < 36; i++) {
      const img = scene.add.image(0, 0, 'mote').setBlendMode(Phaser.BlendModes.ADD).setDepth(FG_DEPTH - 1).setVisible(false);
      this.motes.push({ img, shaft: i % 4, t: 0, u: 0, phase: Math.random() * 10, speed: 3 + Math.random() * 5 });
    }
    // เงาใบไม้ 6 กลุ่ม: มุมบนซ้าย/บนขวา (กิ่งห้อย) · มุมล่าง (เฟิร์นหน้า) · ขอบซ้าย/ขวา
    const spec: [string, boolean][] = [['fg_leaves_1', false], ['fg_leaves_0', true], ['fg_leaves_2', false], ['fg_leaves_2', true], ['fg_leaves_0', false], ['fg_leaves_1', true]];
    for (const [key, flip] of spec) this.leaves.push(scene.add.image(0, 0, key).setFlipX(flip).setDepth(FG_DEPTH).setVisible(false));
    const cam = scene.cameras.main;
    this.lastCam.set(cam.scrollX, cam.scrollY);
  }

  private pipeline(): TiltPipeline | null {
    const p = this.scene.cameras.main.getPostPipeline('TiltPipeline') as unknown as TiltPipeline | TiltPipeline[] | undefined;
    if (!p) return null;
    return Array.isArray(p) ? p[0] ?? null : p;
  }

  update(dt: number, dark: number) {
    const s = this.scene;
    const cam = s.cameras.main;
    const view = cam.worldView;
    this.time += dt;
    this.level = quality();
    const hi = this.level === 'high';
    const rays = this.level !== 'low';
    const inside = s.interiors.current !== null || !!s.homes?.inside;

    // ความหนาแน่นป่ารอบตัว (สุ่มตัวอย่างทุกครึ่งวินาที)
    this.sample -= dt;
    if (this.sample <= 0) {
      this.sample = 0.5;
      const ptx = Math.floor(s.player.x / 16);
      const pty = Math.floor(s.player.y / 16);
      let n = 0;
      let all = 0;
      for (let y = -6; y <= 6; y += 2) {
        for (let x = -10; x <= 10; x += 2) {
          all++;
          if (s.tileAt(ptx + x, pty + y) === TILE.FOREST) n++;
        }
      }
      this.forest = n / all;
    }

    // ความแรงของแดด: กลางวัน ไม่มีฝน ไม่อยู่ในดันเจี้ยน · ใกล้ป่าเด่นขึ้น
    const sun = inside ? 0 : Math.max(0, 1 - dark * 1.8) * Math.max(0, 1 - s.weather.intensity * 1.6);
    const strength = rays ? sun * (0.6 + Math.min(1, this.forest * 2.5) * 0.4) : 0;
    const want = hi ? 4 : 3;
    for (let i = 0; i < this.shafts.length; i++) {
      const sh = this.shafts[i];
      sh.life -= dt;
      const onScreen = sh.x > view.x - 120 && sh.x < view.right + 120 && sh.y > view.y - 160 && sh.y < view.bottom + 160;
      if (sh.life <= 0 || !onScreen) this.spawnShaft(sh, view, i >= want);
      // เฟดเข้า/ออก + ลอยช้า ๆ
      const f = Math.min(1, (sh.max - sh.life) / 3, sh.life / 3);
      sh.a = Math.max(0, f) * sh.k * strength;
      sh.x += dt * 1.5;
    }

    const p = this.pipeline();
    if (p) {
      p.time = this.time;
      p.area[0] = view.x;
      p.area[1] = view.y;
      p.area[2] = view.width;
      p.area[3] = view.height;
      p.grade = 1;
      p.vignette = inside ? 0.34 : 0.2;
      p.haze = hi ? Math.max(0, 1 - dark * 1.5) * (inside ? 0.4 : 0.6 + this.forest) : 0;
      p.rayLen = RAY_LEN;
      for (let i = 0; i < 4; i++) {
        const sh = this.shafts[i];
        const o = p.shafts[i];
        o[0] = sh.x;
        o[1] = sh.y;
        o[2] = sh.w;
        o[3] = sh.a;
      }
    }

    this.updateMotes(dt, rays ? (hi ? 36 : 20) : 0);
    this.updateLeaves(dt, hi && !inside);
  }

  /** ลำแสงใหม่: กระจายทั่วจอ (เอียงไปทางซ้ายบนเล็กน้อยเพราะแสงตกลงขวา) */
  private spawnShaft(sh: Shaft, view: Phaser.Geom.Rectangle, off: boolean) {
    sh.max = Phaser.Math.FloatBetween(14, 26);
    sh.life = sh.max;
    sh.k = off ? 0 : Phaser.Math.FloatBetween(0.55, 1);
    sh.w = Phaser.Math.FloatBetween(14, 30);
    sh.x = view.x + Phaser.Math.FloatBetween(-0.1, 0.95) * view.width;
    sh.y = view.y + Phaser.Math.FloatBetween(0.05, 0.7) * view.height;
    sh.a = 0;
  }

  /** ฝุ่น/ประกายลอยอยู่ในลำแสง ค่อย ๆ ร่วงตามแนวแสง */
  private updateMotes(dt: number, count: number) {
    for (let i = 0; i < this.motes.length; i++) {
      const m = this.motes[i];
      const sh = this.shafts[m.shaft];
      if (i >= count || sh.a <= 0.02) {
        m.img.setVisible(false);
        if (sh.a <= 0.02) m.t = 99; // ลำแสงกลับมา → เกิดใหม่
        continue;
      }
      m.phase += dt;
      m.t += m.speed * dt;
      if (m.t > RAY_LEN * 0.45) {
        m.t = Phaser.Math.FloatBetween(-RAY_LEN * 0.45, RAY_LEN * 0.3);
        m.u = Phaser.Math.FloatBetween(-0.7, 0.7);
      }
      const u = m.u * sh.w + Math.sin(m.phase * 0.9) * 2.5;
      const x = sh.x + DIR_X * m.t + DIR_Y * u;
      const y = sh.y + DIR_Y * m.t - DIR_X * u;
      const edge = 1 - Math.abs(m.t) / (RAY_LEN * 0.5);
      const tw = 0.55 + 0.45 * Math.sin(m.phase * 3.1 + i);
      m.img.setVisible(true).setPosition(Math.round(x), Math.round(y)).setAlpha(Math.max(0, sh.a * edge * tw * 1.1));
    }
  }

  /** เงาใบไม้ตามขอบจอ (พารัลแลกซ์ตามความเร็วกล้อง + ไหวเบา ๆ) — ไม่บังกลางจอ */
  private updateLeaves(dt: number, on: boolean) {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const target = on && this.forest > 0.12 ? Math.min(1, (this.forest - 0.12) * 4) : 0;
    this.fgAlpha += (target - this.fgAlpha) * Math.min(1, dt * 1.5);
    const vis = this.fgAlpha > 0.02;
    // ความเร็วกล้อง (หน่วยโลก/วินาที) → ใบไม้หน้าเลื่อนเร็วกว่าพื้นนิดหน่อย
    if (dt > 0) {
      const vx = (cam.scrollX - this.lastCam.x) / dt;
      const vy = (cam.scrollY - this.lastCam.y) / dt;
      this.vel.x += (Phaser.Math.Clamp(vx, -200, 200) - this.vel.x) * Math.min(1, dt * 4);
      this.vel.y += (Phaser.Math.Clamp(vy, -200, 200) - this.vel.y) * Math.min(1, dt * 4);
    }
    this.lastCam.set(cam.scrollX, cam.scrollY);
    const sc = Phaser.Math.Clamp(view.height / 180, 0.8, 2.2);
    const px = -this.vel.x * 0.05;
    const py = -this.vel.y * 0.05;
    const t = this.time;
    // [ตำแหน่ง x, y (สัดส่วนจอ), จุดยึด x, y]
    const at: [number, number, number, number][] = [[0, 0, 0.3, 0.25], [1, 0, 0.7, 0.3], [0, 1, 0.35, 0.62], [1, 1, 0.65, 0.62], [0, 0.5, 0.62, 0.5], [1, 0.55, 0.38, 0.5]];
    for (let i = 0; i < this.leaves.length; i++) {
      const img = this.leaves[i];
      img.setVisible(vis);
      if (!vis) continue;
      const [fx, fy, ox, oy] = at[i];
      const sway = Math.sin(t * 0.7 + i * 1.7) * 1.5;
      img
        .setOrigin(ox, oy)
        .setScale(sc)
        .setPosition(view.x + fx * view.width + px + sway, view.y + fy * view.height + py)
        .setRotation(Math.sin(t * 0.5 + i) * 0.03)
        .setAlpha(this.fgAlpha * (i >= 4 ? 0.75 : 0.92));
    }
  }
}

/** texture ของฝุ่นและเงาใบไม้ (สร้างครั้งเดียว) */
function ensureTextures(scene: Phaser.Scene) {
  const T = scene.textures;
  if (!T.exists('mote')) {
    const tex = T.createCanvas('mote', 3, 3)!;
    const ctx = tex.getContext();
    ctx.fillStyle = 'rgba(255,246,214,0.55)';
    ctx.fillRect(0, 1, 3, 1);
    ctx.fillRect(1, 0, 1, 3);
    ctx.fillStyle = 'rgba(255,252,236,1)';
    ctx.fillRect(1, 1, 1, 1);
    tex.refresh();
  }
  // เงาใบไม้: วาดที่ความละเอียดพิกเซลโลก (1 พิกเซล = 1 หน่วยโลก) สีเขียวดำ ขอบในสว่างนิด ๆ
  const leaf = (ctx: CanvasRenderingContext2D, x: number, y: number, len: number, wid: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.5, wid, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  const make = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    if (T.exists(key)) return;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    // ทำให้เป็นพิกเซลคม: alpha ตัดเป็นขั้น
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      d[i + 3] = a > 110 ? 255 : 0;
    }
    ctx.putImageData(img, 0, 0);
    // ขอบในสว่าง (ขอบใบรับแสงจากด้านหลัง)
    const out = ctx.getImageData(0, 0, w, h);
    const o = out.data;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4;
        if (!o[i + 3]) continue;
        const edge = !d[i + 3 - 4] || !d[i + 3 + 4] || !d[i + 3 - w * 4] || !d[i + 3 + w * 4];
        const [r, g, b] = edge ? [26, 48, 46] : [12, 24, 26];
        o[i] = r;
        o[i + 1] = g;
        o[i + 2] = b;
      }
    }
    ctx.putImageData(out, 0, 0);
    T.addCanvas(key, cv);
  };
  // 0: กลุ่มใบใหญ่ที่มุม
  make('fg_leaves_0', 84, 64, (ctx) => {
    ctx.fillStyle = '#000';
    for (const [x, y, l, w, a] of [[0, 8, 60, 13, 0.25], [0, 20, 70, 15, 0.55], [0, 34, 54, 12, 0.95], [6, 0, 46, 10, -0.1], [14, 44, 40, 10, 1.3], [2, 26, 78, 9, 0.38]] as number[][]) leaf(ctx, x, y, l, w, a);
  });
  // 1: กิ่งห้อยจากด้านบน
  make('fg_leaves_1', 72, 84, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 72, 5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(30, 30, 24, 70);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = 10 + 20 * t + Math.sin(t * 3) * 4;
      const y = 6 + 64 * t;
      leaf(ctx, x, y, 18 - i, 6, i % 2 ? 0.5 : 2.6);
    }
    for (const [x, y, l, w, a] of [[30, 2, 40, 9, 0.35], [44, 0, 28, 7, 1.0]] as number[][]) leaf(ctx, x, y, l, w, a);
  });
  // 2: เฟิร์นหน้าจอด้านล่าง
  make('fg_leaves_2', 76, 64, (ctx) => {
    ctx.fillStyle = '#000';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 - 0.9 + i * 0.3;
      leaf(ctx, 30, 64, 46 + (i % 2) * 12, 9, a);
    }
  });
}
