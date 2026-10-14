import { PALETTE } from '../data/palette';
import { RNG } from '../core/RNG';

/** ตาราง Bayer 4×4 สำหรับ dithering แบบ pixel art (ค่า −0.5..0.5) */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => v / 16 - 0.5));

export const dither = (x: number, y: number) => BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4];

const resolve = (c: string) => PALETTE[c] ?? c;
const isShadow = (c: string | null) => !!c && c.startsWith('rgba');

/**
 * ผืนผ้าใบพิกเซลสำหรับวาด sprite ด้วยโค้ด: รูปทรง + แรเงาทรงกลม + dithering + เส้นขอบอัตโนมัติ
 * สีใช้ได้ทั้งตัวอักษรพาเลตต์ ('G') หรือ css ('rgba(0,0,0,0.3)' = เงา ไม่ถูกตีเส้นขอบ)
 */
export class PixelCanvas {
  readonly px: (string | null)[];

  constructor(readonly w: number, readonly h: number) {
    this.px = new Array(w * h).fill(null);
  }

  get(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.px[y * this.w + x];
  }

  set(x: number, y: number, c: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  /** เงาวงรีใต้วัตถุ */
  shadow(cx: number, cy: number, rx: number, ry: number, alpha = 0.28) {
    return this.ellipse(cx, cy, rx, ry, `rgba(10,12,30,${alpha})`);
  }

  /**
   * ทรงกลมแรเงา: แสงมาจากซ้ายบน ไล่เฉด dark→mid→light (+highlight) พร้อม dithering
   * jitter = ความขรุขระของขอบ (เช่น พุ่มใบไม้)
   */
  blob(cx: number, cy: number, rx: number, ry: number, shades: string[], rng?: RNG, jitter = 0) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        const edge = 1 + (rng && jitter ? (rng.next() - 0.5) * jitter : 0);
        const d2 = nx * nx + ny * ny;
        if (d2 > edge) continue;
        // ความสว่าง: หันเข้าหาแสง (−0.55, −0.8) + นูนตรงกลาง
        const lit = -(nx * 0.55 + ny * 0.8) * 0.75 + (1 - d2) * 0.35;
        const v = lit + dither(x, y) * 0.35;
        const idx = v > 0.62 && shades[3] ? 3 : v > 0.28 ? 2 : v > -0.12 ? 1 : 0;
        this.set(x, y, shades[Math.min(idx, shades.length - 1)]);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string, thickness = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps;
      const y = y0 + ((y1 - y0) * i) / steps;
      if (thickness === 1) this.set(x, y, c);
      else this.rect(Math.round(x - thickness / 2), Math.round(y - thickness / 2), thickness, thickness, c);
    }
    return this;
  }

  /** ตีเส้นขอบรอบพิกเซลทึบ (ไม่นับเงา) */
  outline(c = 'O', diagonal = false) {
    const solid = (x: number, y: number) => {
      const p = this.get(x, y);
      return !!p && !isShadow(p);
    };
    const add: [number, number][] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (solid(x, y)) continue;
        const n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        const d = diagonal && (solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1));
        if (n || d) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.set(x, y, c);
    return this;
  }

  /** วางรูปแบบตัวอักษร (เหมือน sprites.ts) ลงผ้าใบ */
  rows(rows: string[], ox: number, oy: number, map: Record<string, string> = {}) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        this.set(ox + x, oy + y, map[ch] ?? ch);
      }
    });
    return this;
  }

  /** วาดลง canvas (scale = ขยายพิกเซลละกี่เท่า ใช้กับ UI ให้ขอบหนาแบบ pixel) */
  draw(ctx: CanvasRenderingContext2D, ox = 0, oy = 0, scale = 1) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.px[y * this.w + x];
        if (!c) continue;
        ctx.fillStyle = resolve(c);
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }
}
