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

/** แปลงสี (ตัวอักษรพาเลตต์ / #hex / rgba) → [r,g,b,a 0-255] แคชไว้ (ใช้ตอน blit) */
const RGBA = new Map<string, [number, number, number, number]>();
function rgbaOf(c: string): [number, number, number, number] {
  let v = RGBA.get(c);
  if (v) return v;
  const s = resolve(c);
  const m = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) v = [+m[1], +m[2], +m[3], m[4] === undefined ? 255 : Math.round(+m[4] * 255)];
  else {
    let h = s.replace('#', '');
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  RGBA.set(c, v);
  return v;
}

/** ผสมสีสองสี (ตัวอักษรพาเลตต์หรือ #hex) → #hex */
export function mixHex(a: string, b: string, t: number): string {
  const A = rgbaOf(a);
  const B = rgbaOf(b);
  return '#' + [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * ผืนผ้าใบพิกเซลสำหรับวาด sprite ด้วยโค้ด: รูปทรง + แรเงาทรงกลม + dithering + เส้นขอบอัตโนมัติ
 * สีใช้ได้ทั้งตัวอักษรพาเลตต์ ('G') หรือ css ('rgba(0,0,0,0.3)' = เงา ไม่ถูกตีเส้นขอบ)
 * res > 1 = ผืน HD: พิกัดทุกเมธอดยังเป็น "พิกเซลตรรกะ" เดิม แต่รูปทรง/แรเงา/เส้นขอบคำนวณที่ความละเอียดจริง
 * (set() จุดเดียว = บล็อก res×res · ใช้ hset/hget เมื่อต้องการพิกเซลจริงทีละจุด) ขนาดจริง = W×H
 */
export class PixelCanvas {
  /** ความละเอียดของผืนที่สร้างใหม่ (ตั้งชั่วคราวด้วย withRes ตอนสร้าง sprite HD) */
  static defaultRes = 1;
  readonly px: (string | null)[];
  readonly res: number;
  readonly W: number;
  readonly H: number;

  constructor(readonly w: number, readonly h: number, res = PixelCanvas.defaultRes) {
    this.res = res;
    this.W = w * res;
    this.H = h * res;
    this.px = new Array(this.W * this.H).fill(null);
  }

  /** พิกเซลจริง */
  hget(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    return this.px[y * this.W + x];
  }

  hset(x: number, y: number, c: string | null) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this.px[y * this.W + x] = c;
  }

  /**
   * วนพิกเซลจริงในกรอบตรรกะ [x0..x1]×[y0..y1] (รวมขอบ): fn(x, y, X, Y) — x,y = พิกัดตรรกะมุมบนซ้ายของพิกเซลจริง (ทศนิยมใน HD)
   * คืนสี = ระบาย · undefined = ข้าม (ใช้แปลงลูปที่เคยวาดทีละพิกเซลตรรกะให้ละเอียดตามความละเอียดจริง)
   */
  eachHi(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, X: number, Y: number) => string | null | undefined) {
    const r = this.res;
    for (let Y = Math.max(0, Math.floor(y0) * r); Y < Math.min(this.H, (Math.floor(y1) + 1) * r); Y++) {
      for (let X = Math.max(0, Math.floor(x0) * r); X < Math.min(this.W, (Math.floor(x1) + 1) * r); X++) {
        const col = fn(X / r, Y / r, X, Y);
        if (col !== undefined) this.px[Y * this.W + X] = col;
      }
    }
    return this;
  }

  /** จุดพิกเซลจริง 1 จุด ที่พิกัดตรรกะ (ทศนิยมได้) */
  dot(x: number, y: number, c: string | null) {
    this.hset(x * this.res, y * this.res, c);
    return this;
  }

  get(x: number, y: number) {
    const r = this.res;
    if (r === 1) return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.px[y * this.w + x];
    return this.hget(Math.floor(x * r), Math.floor(y * r));
  }

  set(x: number, y: number, c: string | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const r = this.res;
    if (r === 1) {
      this.px[y * this.w + x] = c;
      return;
    }
    for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) this.px[(y * r + j) * this.W + x * r + i] = c;
  }

  rect(x: number, y: number, w: number, h: number, c: string) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: string) {
    const r = this.res;
    for (let y = Math.floor((cy - ry) * r); y <= Math.ceil((cy + ry) * r); y++) {
      for (let x = Math.floor((cx - rx) * r); x <= Math.ceil((cx + rx) * r); x++) {
        const nx = ((x + 0.5) / r - cx) / rx;
        const ny = ((y + 0.5) / r - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.hset(x, y, c);
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
   * jitter = ความขรุขระของขอบ (เช่น พุ่มใบไม้) — สุ่มทีละพิกเซลตรรกะ (ลำดับ rng เท่าเดิมทุกความละเอียด)
   */
  blob(cx: number, cy: number, rx: number, ry: number, shades: string[], rng?: RNG, jitter = 0) {
    const r = this.res;
    const x0 = Math.floor(cx - rx - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y0 = Math.floor(cy - ry - 1);
    const y1 = Math.ceil(cy + ry + 1);
    const bw = x1 - x0 + 1;
    const edges = new Float32Array(bw * (y1 - y0 + 1)).fill(1);
    if (rng && jitter) for (let i = 0; i < edges.length; i++) edges[i] = 1 + (rng.next() - 0.5) * jitter;
    for (let y = y0 * r; y < (y1 + 1) * r; y++) {
      for (let x = x0 * r; x < (x1 + 1) * r; x++) {
        const nx = ((x + 0.5) / r - cx) / rx;
        const ny = ((y + 0.5) / r - cy) / ry;
        const d2 = nx * nx + ny * ny;
        if (d2 > edges[(Math.floor(y / r) - y0) * bw + Math.floor(x / r) - x0]) continue;
        // ความสว่าง: หันเข้าหาแสง (−0.55, −0.8) + นูนตรงกลาง
        const lit = -(nx * 0.55 + ny * 0.8) * 0.75 + (1 - d2) * 0.35;
        const v = lit + dither(x, y) * (r > 1 ? 0.24 : 0.35);
        const idx = v > 0.62 && shades[3] ? 3 : v > 0.28 ? 2 : v > -0.12 ? 1 : 0;
        this.hset(x, y, shades[Math.min(idx, shades.length - 1)]);
      }
    }
    return this;
  }

  line(x0: number, y0: number, x1: number, y1: number, c: string, thickness = 1) {
    const r = this.res;
    if (r === 1) {
      const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= steps; i++) {
        const x = x0 + ((x1 - x0) * i) / steps;
        const y = y0 + ((y1 - y0) * i) / steps;
        if (thickness === 1) this.set(x, y, c);
        else this.rect(Math.round(x - thickness / 2), Math.round(y - thickness / 2), thickness, thickness, c);
      }
      return this;
    }
    // HD: ก้าวทีละพิกเซลจริง แปรงหนา thickness×res (น้ำหนักเส้นเท่าเดิม แต่แนวเฉียงเนียนขึ้น)
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1 / r) * r;
    const t = thickness * r;
    const off = thickness > 1 ? thickness / 2 : 0;
    for (let i = 0; i <= steps; i++) {
      const X = Math.round((x0 + ((x1 - x0) * i) / steps - off) * r);
      const Y = Math.round((y0 + ((y1 - y0) * i) / steps - off) * r);
      for (let j = 0; j < t; j++) for (let k = 0; k < t; k++) this.hset(X + k, Y + j, c);
    }
    return this;
  }

  /** ตีเส้นขอบรอบพิกเซลทึบ (ไม่นับเงา) — ผืน HD ได้ขอบบาง 1 พิกเซลจริง */
  outline(c = 'O', diagonal = false) {
    const W = this.W;
    const H = this.H;
    const solid = (x: number, y: number) => {
      const p = this.hget(x, y);
      return !!p && !isShadow(p);
    };
    const add: number[] = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (solid(x, y)) continue;
        const n = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
        const d = diagonal && (solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1));
        if (n || d) add.push(y * W + x);
      }
    }
    for (const i of add) this.px[i] = c;
    if (this.res > 1) {
      // HD: ขอบด้านเงา (ขวา/ล่าง) หนาขึ้นอีก 1 พิกเซลจริง → ยังดูหนาแน่นแบบจิบิเดิม แต่ด้านรับแสงบางคม
      const ring = new Uint8Array(W * H);
      for (const i of add) ring[i] = 1;
      const more: number[] = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (ring[i] || solid(x, y)) continue;
          if ((x > 1 && ring[i - 1] && solid(x - 2, y)) || (y > 1 && ring[i - W] && solid(x, y - 2))) more.push(i);
        }
      }
      for (const i of more) this.px[i] = c;
    }
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

  /** วางรูปแบบตัวอักษรที่พิกัดพิกเซลจริง (ลายที่วาดไว้ที่ความละเอียด HD) */
  hrows(rows: string[], ox: number, oy: number, map: Record<string, string> = {}) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        this.hset(ox + x, oy + y, map[ch] ?? ch);
      }
    });
    return this;
  }

  /** วาดลง canvas (scale = ขยายพิกเซลละกี่เท่า ใช้กับ UI ให้ขอบหนาแบบ pixel) */
  draw(ctx: CanvasRenderingContext2D, ox = 0, oy = 0, scale = 1) {
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const c = this.px[y * this.W + x];
        if (!c) continue;
        ctx.fillStyle = resolve(c);
        ctx.fillRect(ox + x * scale, oy + y * scale, scale, scale);
      }
    }
  }

  /** เขียนทั้งผืนลง canvas ทีเดียวด้วย ImageData (เร็วกว่า draw มาก — ใช้กับพื้นที่ว่างเท่านั้น เพราะทับค่าเดิม) */
  blit(ctx: CanvasRenderingContext2D, ox = 0, oy = 0) {
    const img = ctx.createImageData(this.W, this.H);
    const d = img.data;
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (!c) continue;
      const v = rgbaOf(c);
      d[i * 4] = v[0];
      d[i * 4 + 1] = v[1];
      d[i * 4 + 2] = v[2];
      d[i * 4 + 3] = v[3];
    }
    ctx.putImageData(img, ox, oy);
  }
}

/** สร้างผืนใหม่ทั้งหมดใน fn ที่ความละเอียด res (เช่นสร้าง sprite มอนแบบ HD) */
export function withRes<T>(res: number, fn: () => T): T {
  const prev = PixelCanvas.defaultRes;
  PixelCanvas.defaultRes = res;
  try {
    return fn();
  } finally {
    PixelCanvas.defaultRes = prev;
  }
}
