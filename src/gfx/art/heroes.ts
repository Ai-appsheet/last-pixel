import type Phaser from 'phaser';
import { PALETTE } from '../../data/palette';
import { PixelCanvas, dither } from '../PixelCanvas';
import { markHd, SPRITE_RES } from '../hd';
import type { HeroId } from '../../data/characters';

// ตัวละครผู้เล่นแบบ paper-doll สไตล์จิบิ: หัวโต (≈60% ของความสูง) ตาอนิเมะ 3×4 ตัวจิ๋ว แขนขาป้อม
// ผิว/ผม/ชุด/หมวก/ผ้าคลุม ประกอบเป็นชั้น ๆ แล้วตีขอบ 'O'
// เฟรม 20×24 — 0-2 หันลง (ยืน, ก้าว A, ก้าว B), 3-5 หันขึ้น, 6-8 ด้านข้างหันขวา (ยืน, ก้าว, ยืน)
// ผม y=1.. หัว y=2..13 (กว้าง 14) ลำตัว y=14..18 ขา y=19..22 เท้าล่างสุด y=22 (ขอบ y=23) แสงมาจากซ้ายบน
// เฟรมก้าว: หัวกระดกลง 1 px (bob) ให้เดินแบบน่ารัก
// HD: ตำแหน่ง/ท่าทั้งหมดยังเป็นพิกัดตรรกะ 20×24 แต่ผืนจริงละเอียด SPRITE_RES เท่า (40×48) — mask ขยายแบบ Scale2x (มุมมน)
// แรเงา/ลายผ้า/เส้นขอบคำนวณที่พิกเซลจริง แล้วเติมรายละเอียดเฉพาะ HD (ตา ผม ตะเข็บ กระดุม ประกายโลหะ) ทับอีกชั้น
// (ชั้นรายละเอียด HD เขียนพิกัดพิกเซลจริงไว้สำหรับ SPRITE_RES = 2 · res 1 = ลายเดิมทุกพิกเซล ใช้ทำไอคอนชุด)

export const HERO_W = 20;
export const HERO_H = 24;
const W = HERO_W;
const H = HERO_H;

// ---------------------------------------------------------------- สี

const hexOf = (c: string) => PALETTE[c] ?? c;

function rgbOf(c: string): [number, number, number] {
  let h = hexOf(c).replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** มืดลงแบบเหลื่อมไปทางม่วงเย็น / สว่างขึ้นแบบอุ่น (hue shift แบบ pixel art) */
const darken = (c: string, t = 0.35) => mix(c, '#1d1630', t);
const lighten = (c: string, t = 0.3) => mix(c, '#fff6e0', t);

/** วัสดุ 3-4 เฉด: d=เงา m=กลาง l=รับแสง h=ประกาย (ไม่บังคับ) */
export interface Mat {
  d: string;
  m: string;
  l: string;
  h?: string;
  pattern?: 'plaid' | 'check' | 'stripe';
}

const withPattern = (x: Mat, pattern: Mat['pattern']): Mat => ({ ...x, pattern });
/** วัสดุหรี่ลง (แขนขาที่อยู่ไกลในมุมด้านข้าง) */
const dim = (x: Mat, t = 0.3): Mat => ({ d: darken(x.d, t), m: darken(x.m, t), l: darken(x.l, t), pattern: x.pattern });

// ---------------------------------------------------------------- mask + แรเงา

class Mask {
  readonly on = new Uint8Array(W * H);

  add(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.on[y * W + x] = 1;
    return this;
  }

  del(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < W && y < H) this.on[y * W + x] = 0;
    return this;
  }

  span(y: number, x0: number, x1: number) {
    for (let x = x0; x <= x1; x++) this.add(x, y);
    return this;
  }

  rect(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j);
    return this;
  }

  pts(list: [number, number][]) {
    for (const [x, y] of list) this.add(x, y);
    return this;
  }

  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H && this.on[y * W + x] === 1;
  }

  each(fn: (x: number, y: number) => void) {
    for (let i = 0; i < this.on.length; i++) if (this.on[i]) fn(i % W, (i / W) | 0);
  }

  /** ขยายเป็นความละเอียดจริง (r=2 ใช้ Scale2x: มุมนูนถูกตัดมน มุมเว้าถูกเติม) */
  hi(r: number): Uint8Array {
    const HW = W * r;
    const out = new Uint8Array(HW * H * r);
    const g = (x: number, y: number) => (this.has(x, y) ? 1 : 0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const E = g(x, y);
        if (r !== 2) {
          if (E) for (let j = 0; j < r; j++) for (let i = 0; i < r; i++) out[(y * r + j) * HW + x * r + i] = 1;
          continue;
        }
        const A = g(x, y - 1);
        const B = g(x + 1, y);
        const C = g(x - 1, y);
        const D = g(x, y + 1);
        const o = y * 2 * HW + x * 2;
        out[o] = C === A && C !== D && A !== B ? A : E;
        out[o + 1] = A === B && A !== C && B !== D ? B : E;
        out[o + HW] = D === C && D !== B && C !== A ? C : E;
        out[o + HW + 1] = B === D && B !== A && D !== C ? D : E;
      }
    }
    return out;
  }
}

const shadeDown = (mt: Mat, col: string) => (col === mt.h ? mt.l : col === mt.l ? mt.m : mt.d);

/**
 * ระบายวัสดุลงพื้นที่ mask: ขอบซ้าย/บน = รับแสง, ขอบขวา/ล่าง = เงา, ใกล้ขอบขวามี dithering
 * soft = ชิ้นเล็ก (แขน มือ) ต้องรับแสงสองด้านถึงจะสว่าง
 */
function shade(c: PixelCanvas, m: Mask, mt: Mat, soft = false) {
  if (c.res > 1) {
    shadeHi(c, m, mt, soft);
    return;
  }
  const out: [number, number, string][] = [];
  m.each((x, y) => {
    const l = !m.has(x - 1, y);
    const t = !m.has(x, y - 1);
    const r = !m.has(x + 1, y);
    const b = !m.has(x, y + 1);
    let s = (l ? 1 : 0) + (t ? 1 : 0) - (r ? 1 : 0) - (b ? 1 : 0);
    if (!r && !m.has(x + 2, y) && m.has(x - 1, y) && dither(x, y) > 0.1) s -= 1;
    let col = mt.m;
    if (s >= 2 && mt.h) col = mt.h;
    else if (s >= (soft ? 2 : 1)) col = mt.l;
    else if (s <= -1) col = mt.d;
    if (mt.pattern === 'plaid' && (x % 3 === 0 || y % 3 === 1)) col = shadeDown(mt, col);
    else if (mt.pattern === 'stripe' && y % 2 === 0) col = shadeDown(mt, col);
    else if (mt.pattern === 'check') col = (x + y) & 1 ? mt.d : col === mt.d ? mt.m : mt.l;
    out.push([x, y, col]);
  });
  for (const [x, y, col] of out) c.set(x, y, col);
}

/**
 * แรเงา HD: แถบรับแสง/เงากว้างเท่าเดิม (1 พิกเซลตรรกะ) แต่ไล่ 2 ขั้นที่พิกเซลจริง + ประกายจุดมุมซ้ายบน
 * ลายผ้า (ตาราง/ทาง/ห่วงเกราะโซ่) ละเอียดขึ้นตามพิกเซลจริง
 */
function shadeHi(c: PixelCanvas, m: Mask, mt: Mat, soft: boolean) {
  const r = c.res;
  const HW = W * r;
  const HH = H * r;
  const on = m.hi(r);
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < HW && y < HH && on[y * HW + x] === 1;
  const dist = (x: number, y: number, dx: number, dy: number) => {
    for (let k = 1; k <= 4; k++) if (!has(x + k * dx, y + k * dy)) return k;
    return 5;
  };
  const f = (d: number) => (d === 1 ? 1 : d === 2 ? 0.5 : 0);
  for (let Y = 0; Y < HH; Y++) {
    for (let X = 0; X < HW; X++) {
      if (!on[Y * HW + X]) continue;
      const dl = dist(X, Y, -1, 0);
      const dt = dist(X, Y, 0, -1);
      const dr = dist(X, Y, 1, 0);
      const db = dist(X, Y, 0, 1);
      let sc = f(dl) + f(dt) - f(dr) - f(db);
      if (dr >= 3 && dr <= 4 && dl > 1 && dither(X, Y) > 0.1) sc -= 0.5;
      let col = mt.m;
      if (sc >= 2 && mt.h) col = mt.h;
      else if (sc >= (soft ? 1.5 : 0.5)) col = mt.l;
      else if (sc <= -0.5) col = mt.d;
      if (mt.pattern === 'plaid' && (X % 4 === 0 || Y % 4 === 2)) col = shadeDown(mt, col);
      else if (mt.pattern === 'stripe' && Y % 4 === 0) col = shadeDown(mt, col);
      else if (mt.pattern === 'stripe' && Y % 4 === 1 && col === mt.m) col = mt.l;
      else if (mt.pattern === 'check') {
        // ห่วงเกราะโซ่: ตารางห่วง 2×2 ที่สลับแถว + จุดสะท้อนบนห่วง
        const cell = ((X >> 1) + (Y >> 1)) & 1;
        col = cell ? mt.d : (X & 1) === 0 && (Y & 1) === 0 ? mt.l : col === mt.d ? mt.m : mt.m;
      }
      c.hset(X, Y, col);
    }
  }
}

function px(c: PixelCanvas, list: [number, number][], col: string) {
  for (const [x, y] of list) c.set(x, y, col);
}

/** วาดเฉพาะจุดที่เป็นสีของวัสดุนั้นอยู่แล้ว (เช่นรอยต่อเกราะบนลำตัว ไม่ทับผ้าคลุม/เสื้อทับ) */
function onMat(c: PixelCanvas, list: [number, number][], mt: Mat, col: string) {
  const r = c.res;
  for (const [x, y] of list) {
    for (let j = 0; j < r; j++) {
      for (let i = 0; i < r; i++) {
        const p = c.hget(x * r + i, y * r + j);
        if (p === mt.m || p === mt.l || p === mt.d || p === mt.h) c.hset(x * r + i, y * r + j, col);
      }
    }
  }
}

const isMat = (p: string | null, mt: Mat) => !!p && (p === mt.m || p === mt.l || p === mt.d || p === mt.h);

/** HD: ระบายพิกเซลจริงเฉพาะจุดที่ยังเป็นวัสดุ mt */
function hOn(c: PixelCanvas, pts: [number, number][], mt: Mat, col: string) {
  for (const [X, Y] of pts) if (isMat(c.hget(X, Y), mt)) c.hset(X, Y, col);
}

/** HD: กระดุม/หมุดกลมมีประกาย (บล็อก 2×2 ที่ช่องตรรกะ x,y) */
function hdStud(c: PixelCanvas, x: number, y: number, col: string) {
  const r = c.res;
  c.hset(x * r, y * r, lighten(hexOf(col), 0.55));
  c.hset(x * r + 1, y * r, col);
  c.hset(x * r, y * r + 1, col);
  c.hset(x * r + 1, y * r + 1, darken(hexOf(col), 0.35));
}

/**
 * วางลวดลายตัวอักษร (แถวเริ่มที่ y=0, กว้าง 20)
 * '1'/'2' = วัสดุที่แรเงาอัตโนมัติ, '_' = ลบ, ตัวอื่น = สีตรงจาก cols, '.' = ข้าม
 * dy = เลื่อนทั้งลายลงกี่แถว (หัวกระดก)
 */
function stamp(
  c: PixelCanvas,
  rows: string[],
  mats: Record<string, Mat>,
  cols: Record<string, string>,
  opt: { shift?: (y: number) => number; minY?: number; dy?: number; fine?: Record<string, 'hi' | 'lo'> } = {},
) {
  const masks: Record<string, Mask> = {};
  const direct: [number, number, string | null][] = [];
  const fine: [number, number, string, 'hi' | 'lo'][] = [];
  const dy = opt.dy ?? 0;
  const hd = c.res > 1;
  rows.forEach((row, y) => {
    if (y < (opt.minY ?? 0)) return;
    const dx = opt.shift ? opt.shift(y) : 0;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (mats[ch]) (masks[ch] ??= new Mask()).add(x + dx, y + dy);
      else if (ch === '_') direct.push([x + dx, y + dy, null]);
      else if (hd && opt.fine?.[ch] && cols[ch] && mats['1']) {
        // HD: ช่องลายเส้น (ไฮไลต์/ร่องผม) เป็นเนื้อวัสดุหลัก แล้วขีดเส้นบางทับ
        (masks['1'] ??= new Mask()).add(x + dx, y + dy);
        fine.push([x + dx, y + dy, cols[ch], opt.fine[ch]]);
      } else if (cols[ch]) direct.push([x + dx, y + dy, cols[ch]]);
    }
  });
  for (const k of Object.keys(masks)) shade(c, masks[k], mats[k]);
  for (const [x, y, col] of direct) c.set(x, y, col);
  const r = c.res;
  for (const [x, y, col, kind] of fine) {
    // hi = ขีดเฉียงขึ้นขวา (เส้นผมรับแสง) · lo = ขีดตั้งด้านซ้าย (ร่องระหว่างช่อผม)
    const pts: [number, number][] = kind === 'hi' ? [[0, 1], [1, 0]] : [[0, 0], [0, 1]];
    for (const [i, j] of pts) if (c.hget(x * r + i, y * r + j)) c.hset(x * r + i, y * r + j, col);
  }
}

// ---------------------------------------------------------------- วัสดุมาตรฐาน

const STEEL: Mat = { d: 'D', m: 'L', l: 'w', h: 'W' };
const DARK_STEEL: Mat = { d: 'F', m: 'D', l: 'L', h: 'w' };
const MAIL: Mat = { d: 'F', m: 'D', l: 'L', pattern: 'check' };
const GOLD: Mat = { d: '#a0662a', m: '#e0a040', l: 'Y', h: 'y' };
const WHITE: Mat = { d: 'L', m: 'w', l: 'W' };
const CLOTH_BLACK: Mat = { d: '#141522', m: '#2a2d45', l: '#454b6e' };
const RED: Mat = { d: '#6e2034', m: 'R', l: '#d8606f' };
const CRIMSON: Mat = { d: '#5a1e2e', m: '#9a3046', l: '#c8505f' };
const BLUE: Mat = { d: 'U', m: 'B', l: '#5f86e0' };
const NAVY: Mat = { d: '#141c3a', m: 'U', l: 'B' };
const PURPLE: Mat = { d: '#2e1236', m: 'P', l: '#8a4a9a', h: 'u' };
const DEEP_PURPLE: Mat = { d: '#1c0c24', m: '#3a1840', l: '#62306e', h: '#8a4a9a' };
const GREEN: Mat = { d: 'V', m: 'H', l: 'G', h: 'g' };
const TEAL: Mat = { d: '#173e48', m: 'T', l: '#3c9a96' };
const ORANGE: Mat = { d: '#a8452f', m: 'r', l: '#ffa772' };
const LEATHER: Mat = { d: 'm', m: 'M', l: 'N' };
const DARK_LEATHER: Mat = { d: 'n', m: 'm', l: 'M' };
const LINEN: Mat = { d: 's', m: 'S', l: '#f6e4bc' };
const DENIM: Mat = { d: 'U', m: 'B', l: '#5f86e0' };
const SHELL: Mat = { d: 'R', m: 'r', l: '#ffb38a', h: 'Y' };
const SCRUB: Mat = { d: 'B', m: 'b', l: 'C' };
/** ผิวเปลือย (แขน/ขา/ลำตัวในชุดว่ายน้ำ) — โทนผิวแทนของสาวชายหาด */
const BARE: Mat = { d: 'k', m: 'K', l: '#f3cfb0' };

// ---------------------------------------------------------------- ชุด

export type Detail =
  | { kind: 'emblem'; shape: 'cross' | 'gem' | 'bolt' | 'star'; color: string; edge?: string; hi?: string }
  | { kind: 'strap'; color: string; cross?: boolean; buckle?: string }
  | { kind: 'buttons'; color: string; double?: boolean }
  | { kind: 'zip'; color: string; pull: string }
  | { kind: 'scarf'; mat: Mat; tails?: boolean }
  | { kind: 'necklace'; cord: string; bead: string; tooth?: string }
  | { kind: 'glow'; color: string; core: string }
  | { kind: 'overalls'; mat: Mat; button: string }
  | { kind: 'fur'; mat: Mat }
  | { kind: 'toolbelt'; pouch: Mat; tool: string }
  | { kind: 'tabard'; mat: Mat; trim: string }
  | { kind: 'plates'; seam: string; ridge?: string }
  | { kind: 'zigzag'; color: string }
  | { kind: 'panel'; base: string; lights: string[] }
  | { kind: 'quiver'; mat: Mat; fletch: string; fletch2: string }
  | { kind: 'bikini'; color: string; trim: string }
  | { kind: 'lapel'; color: string };

export interface OutfitDef {
  id: string;
  name: string;
  /** ลำตัว (ถ้ามี coat แบบเปิด = เสื้อด้านใน) */
  top: Mat;
  /** แขนเสื้อ ('skin' = แขนเปลือย) — ค่าเริ่มต้น = top */
  sleeve?: Mat | 'skin';
  /** ถุงมือ — ค่าเริ่มต้น = ผิว */
  hands?: Mat;
  legs: Mat;
  boots: Mat;
  belt?: Mat;
  buckle?: string;
  beltWide?: boolean;
  /** ขอบคอ/ปลายแขน/ชายเสื้อ */
  trim?: string;
  cuff?: string;
  bootTop?: string;
  shoulder?: Mat;
  shoulderTrim?: string;
  bellSleeves?: boolean;
  robe?: 'long' | 'short';
  robeMat?: Mat;
  coat?: { mat: Mat; open: boolean };
  neck?: boolean;
  /** ปิดผิวหน้า (หุ่นยนต์) */
  face?: Mat;
  /** จุดประกายหลังตีขอบ (เกราะโลหะ) */
  spec?: string;
  details?: Detail[];
}

export const OUTFITS: OutfitDef[] = [
  {
    id: 'tunic', name: 'เสื้อผ้าธรรมดา',
    top: TEAL, legs: LEATHER, boots: DARK_LEATHER, belt: DARK_LEATHER, buckle: 'N', trim: 'N', neck: true,
  },
  {
    id: 'leather', name: 'เกราะหนัง',
    top: LEATHER, sleeve: LINEN, hands: DARK_LEATHER, legs: DARK_LEATHER, boots: { d: 'n', m: 'm', l: 'N' },
    belt: DARK_LEATHER, buckle: 'Y', shoulder: { d: 'm', m: 'M', l: 'N' }, neck: true,
    details: [{ kind: 'strap', color: 'm', cross: true, buckle: 'Y' }],
  },
  {
    id: 'fur', name: 'เสื้อขนสัตว์',
    top: { d: 'L', m: 'w', l: 'W' }, sleeve: { d: 'L', m: 'w', l: 'W' }, hands: LEATHER, legs: LEATHER,
    boots: LEATHER, bootTop: 'W', cuff: 'W', belt: DARK_LEATHER, buckle: 'N',
    details: [{ kind: 'buttons', color: 'M' }, { kind: 'fur', mat: { d: 'L', m: 'W', l: 'W' } }],
  },
  {
    id: 'iron', name: 'เกราะเหล็ก',
    top: STEEL, sleeve: MAIL, hands: DARK_STEEL, legs: DARK_STEEL, boots: DARK_STEEL, shoulder: STEEL,
    belt: DARK_LEATHER, buckle: 'L', spec: 'W', details: [{ kind: 'plates', seam: 'D', ridge: 'W' }],
  },
  {
    id: 'gold', name: 'เกราะทองคำ',
    top: GOLD, sleeve: GOLD, hands: GOLD, legs: { d: '#7a4a1e', m: '#a0662a', l: '#e0a040' }, boots: GOLD, shoulder: GOLD,
    belt: RED, buckle: 'y', spec: 'W',
    details: [{ kind: 'plates', seam: '#a0662a', ridge: 'y' }, { kind: 'emblem', shape: 'gem', color: 'R', edge: '#6e2034', hi: 'p' }],
  },
  {
    id: 'meteor', name: 'เกราะอุกกาบาต',
    top: DEEP_PURPLE, sleeve: DEEP_PURPLE, hands: DEEP_PURPLE, legs: DEEP_PURPLE, boots: { d: '#120818', m: '#2a1032', l: '#4a2456' },
    shoulder: PURPLE, belt: { d: '#120818', m: '#24102e', l: '#3a1840' }, buckle: 'r', spec: 'u',
    details: [{ kind: 'glow', color: 'r', core: 'Y' }, { kind: 'plates', seam: '#1c0c24' }],
  },
  {
    id: 'crab', name: 'เกราะกระดองปู',
    top: SHELL, sleeve: SHELL, hands: SHELL, legs: RED, boots: { d: '#5a1e2e', m: 'R', l: 'r' },
    shoulder: { d: 'R', m: 'r', l: '#ffb38a', h: 'y' }, belt: DARK_LEATHER, buckle: 'Y', spec: 'y',
    details: [{ kind: 'plates', seam: 'R', ridge: '#ffb38a' }],
  },
  {
    id: 'ninja', name: 'ชุดนินจา',
    top: CLOTH_BLACK, legs: CLOTH_BLACK, hands: CLOTH_BLACK, boots: { d: 'D', m: 'L', l: 'w', pattern: 'stripe' },
    belt: RED, buckle: '#6e2034', beltWide: true,
    details: [{ kind: 'strap', color: '#454b6e' }, { kind: 'scarf', mat: RED, tails: true }],
  },
  {
    id: 'pirate', name: 'ชุดโจรสลัด',
    top: WHITE, legs: { d: '#141522', m: 'F', l: 'D' }, boots: { d: '#141522', m: '#2a2d45', l: 'D' },
    coat: { mat: CRIMSON, open: true }, trim: 'Y', cuff: 'Y', belt: DARK_LEATHER, buckle: 'Y', neck: true,
    sleeve: CRIMSON,
  },
  {
    id: 'samurai', name: 'ชุดซามูไร',
    top: BLUE, sleeve: WHITE, legs: NAVY, boots: { d: 'L', m: 'w', l: 'W' }, bellSleeves: true,
    shoulder: { d: 'U', m: 'B', l: '#5f86e0', h: 'b' }, shoulderTrim: 'W', belt: WHITE, beltWide: true, buckle: 'L', trim: 'W',
    details: [{ kind: 'plates', seam: 'U' }, { kind: 'lapel', color: 'W' }],
  },
  {
    id: 'mage', name: 'เสื้อคลุมจอมเวท',
    top: PURPLE, sleeve: PURPLE, legs: PURPLE, boots: DARK_LEATHER, robe: 'long', trim: 'Y', cuff: 'Y', bellSleeves: true,
    belt: { d: '#a0662a', m: '#e0a040', l: 'Y' }, buckle: 'C',
    details: [{ kind: 'necklace', cord: 'Y', bead: 'C' }],
  },
  {
    id: 'knight', name: 'ชุดอัศวิน',
    top: STEEL, sleeve: MAIL, hands: DARK_STEEL, legs: DARK_STEEL, boots: DARK_STEEL, shoulder: STEEL,
    belt: DARK_LEATHER, buckle: 'Y', spec: 'W',
    details: [{ kind: 'tabard', mat: WHITE, trim: 'B' }, { kind: 'emblem', shape: 'cross', color: 'B', hi: 'b' }],
  },
  {
    id: 'chef', name: 'ชุดเชฟ',
    top: WHITE, legs: { d: 'F', m: 'D', l: 'W', pattern: 'check' }, boots: { d: '#141522', m: '#2a2d45', l: 'D' },
    details: [{ kind: 'buttons', color: 'D', double: true }, { kind: 'scarf', mat: RED }],
  },
  {
    id: 'farmer', name: 'ชุดชาวนา',
    top: withPattern(RED, 'plaid'), legs: DENIM, boots: LEATHER, neck: true,
    details: [{ kind: 'overalls', mat: DENIM, button: 'Y' }],
  },
  {
    id: 'mechanic', name: 'ชุดช่างกล',
    top: ORANGE, legs: ORANGE, hands: { d: 'F', m: 'D', l: 'L' }, boots: { d: '#141522', m: 'F', l: 'D' },
    belt: DARK_LEATHER, buckle: 'L', trim: '#a8452f',
    details: [{ kind: 'zip', color: '#a8452f', pull: 'L' }, { kind: 'toolbelt', pouch: LEATHER, tool: 'L' }],
  },
  {
    id: 'medic', name: 'ชุดหมอ',
    top: WHITE, legs: SCRUB, boots: { d: 'F', m: 'D', l: 'L' }, coat: { mat: WHITE, open: false }, cuff: 'L',
    details: [{ kind: 'lapel', color: 'b' }, { kind: 'emblem', shape: 'cross', color: 'R', hi: 'r' }],
  },
  {
    id: 'hunter', name: 'ชุดนักล่า',
    top: GREEN, sleeve: GREEN, hands: LEATHER, legs: LEATHER, boots: DARK_LEATHER, bootTop: 'M',
    belt: DARK_LEATHER, buckle: 'Y', neck: true, trim: 'M',
    details: [{ kind: 'strap', color: 'm' }, { kind: 'quiver', mat: LEATHER, fletch: 'W', fletch2: 'R' }],
  },
  {
    id: 'shaman', name: 'ชุดหมอผี',
    top: PURPLE, sleeve: 'skin', legs: DARK_LEATHER, boots: { d: 'm', m: 'M', l: 'N', pattern: 'stripe' },
    robe: 'short', robeMat: { d: 'n', m: 'm', l: 'M' }, trim: 'r', cuff: 'r', neck: true,
    details: [{ kind: 'zigzag', color: 'r' }, { kind: 'necklace', cord: 'm', bead: 'R', tooth: 'W' }],
  },
  {
    id: 'bikini', name: 'ชุดบิกินี่',
    top: BARE, sleeve: 'skin', hands: BARE, legs: BARE, boots: { d: '#a8452f', m: 'r', l: 'Y' },
    details: [{ kind: 'bikini', color: 'R', trim: 'Y' }],
  },
  {
    id: 'robot', name: 'ร่างหุ่นยนต์',
    top: STEEL, sleeve: { d: 'F', m: 'D', l: 'L', pattern: 'stripe' }, hands: STEEL, legs: { d: 'F', m: 'D', l: 'L', pattern: 'stripe' },
    boots: DARK_STEEL, shoulder: STEEL, face: { d: 'D', m: 'L', l: 'w', h: 'W' }, spec: 'W',
    details: [{ kind: 'plates', seam: 'D' }, { kind: 'panel', base: 'F', lights: ['C', 'R', 'Y'] }, { kind: 'glow', color: 'C', core: 'b' }],
  },
];

// ---------------------------------------------------------------- หมวก
// ลายกว้าง 20 แถวเริ่ม y=0 — หัวจิบิอยู่ y=2..13 (กว้างสุด x3..16) ผมฟูเลยหัวออกไป 1px (x2..17, y1)
// ตาโต y=7..10 (ซ้าย x5..7 ขวา x12..14) หน้าโล่ง x4..15

export interface HelmetDef {
  id: string;
  name: string;
  /** all = ซ่อนผมทั้งหมด, top = ซ่อนผมแถว y < clearTop, none = วางทับเฉย ๆ */
  hide: 'all' | 'top' | 'none';
  clearTop?: number;
  mat?: Mat;
  mat2?: Mat;
  cols?: Record<string, string>;
  down: string[];
  up?: string[];
  side: string[];
  spec?: string;
}

export const HELMET_DEFS: HelmetDef[] = [
  { id: 'none', name: 'ไม่สวม', hide: 'none', down: [], side: [] },
  {
    id: 'hood', name: 'ฮู้ดนักล่า', hide: 'all', mat: GREEN, cols: { x: '#0f2a22' },
    down: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..111xxxxxxxxxx111..',
      '..11x..........x11..',
      '..11............11..',
      '..11............11..',
      '..11............11..',
      '..11............11..',
      '..111..........111..',
      '.11111........11111.',
      '.11111........11111.',
      '..1..............1..',
    ],
    up: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '.111111111111111111.',
      '.111111111111111111.',
      '...11111111111111...',
      '.....1111111111.....',
      '........1111........',
    ],
    side: [
      '....................',
      '.....111111.........',
      '...1111111111.......',
      '..11111111111111....',
      '..1111111111111111..',
      '..1111111111111111..',
      '..11111111111xxxxx..',
      '..11111111x.........',
      '..11111111x.........',
      '..11111111x.........',
      '..11111111x.........',
      '..11111111x.........',
      '..111111111.........',
      '.111111111111.......',
      '.1111111111111......',
      '.11.................',
    ],
  },
  {
    id: 'iron_helm', name: 'หมวกอัศวิน', hide: 'all', mat: STEEL, spec: 'W',
    cols: { x: '#1d1630', f: 'W', e: 'R', g: 'r', w: 'W' },
    down: [
      '.........eg.........',
      '.......11ww11.......',
      '.....1111ww1111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..11xxffxxxxffxx11..',
      '..11xxxxxxxxxxxx11..',
      '..11111111xx111111..',
      '..11111111xx111111..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
    up: [
      '.........eg.........',
      '.......11ww11.......',
      '.....1111ww1111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
    side: [
      '.....ge.............',
      '......11ww11........',
      '....1111ww11111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..11111111111xffx1..',
      '..11111111111xxxx1..',
      '..1111111111111111..',
      '..111111111111111x..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
  },
  {
    id: 'gold_crown', name: 'มงกุฎทองคำ', hide: 'top', clearTop: 1, mat: GOLD, spec: 'W', cols: { e: 'R', f: 'b' },
    down: [
      '.....1...11...1.....',
      '.....11.1111.11.....',
      '.....1111111111.....',
      '.....1e11ff11e1.....',
    ],
    side: [
      '.....1..1..1........',
      '.....1111111........',
      '....111111111.......',
      '....1e11f11e1.......',
    ],
  },
  {
    id: 'wizard_hat', name: 'หมวกพ่อมด', hide: 'top', clearTop: 6, mat: PURPLE, cols: { f: '#e0a040', e: 'y' },
    down: [
      '............11......',
      '..........1111......',
      '.........11111......',
      '.......1111e111.....',
      '......111111111.....',
      '.....ffffffffff.....',
      '.111111111111111111.',
    ],
    up: [
      '............11......',
      '..........1111......',
      '.........11111......',
      '.......11111111.....',
      '......111111111.....',
      '.....ffffffffff.....',
      '.111111111111111111.',
    ],
    side: [
      '...11...............',
      '....1111............',
      '.....11111..........',
      '.....1111e11........',
      '.....111111111......',
      '.....ffffffffff.....',
      '.111111111111111111.',
    ],
  },
  {
    id: 'pirate_hat', name: 'หมวกโจรสลัด', hide: 'top', clearTop: 5, mat: CLOTH_BLACK, cols: { f: '#e0a040', w: 'W' },
    down: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '..1.1111ww11111.1...',
      '.ff1111111111111ff..',
      '..ffffffffffffffff..',
    ],
    up: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '..1.11111111111.1...',
      '.ff1111111111111ff..',
      '..ffffffffffffffff..',
    ],
    side: [
      '....................',
      '......111111........',
      '....1111111111......',
      '...11111111111......',
      '..f1111111111111f...',
      '..ffffffffffffffff..',
    ],
  },
  {
    id: 'samurai_kabuto', name: 'หมวกซามูไร', hide: 'all', mat: { d: '#141c3a', m: 'U', l: 'B', h: 'b' },
    mat2: { d: 'U', m: 'B', l: '#5f86e0' }, cols: { f: 'Y', e: 'R', w: 'W' }, spec: 'b',
    down: [
      '..f..............f..',
      '...f...111111...f...',
      '....f1111111111f....',
      '...111111ee111111...',
      '..2222222222222222..',
      '..2222222222222222..',
      '..222..........222..',
      '..2w2..........2w2..',
      '..222..........222..',
      '..222..........222..',
      '..222..........222..',
      '..ww............ww..',
    ],
    up: [
      '..f..............f..',
      '...f...111111...f...',
      '....f1111111111f....',
      '...11111111111111...',
      '..2222222222222222..',
      '..2222222222222222..',
      '..2222222222222222..',
      '..22w222w22w222w22..',
      '..2222222222222222..',
      '..2222222222222222..',
      '...22222222222222...',
      '...w.w........w.w...',
    ],
    side: [
      '...............f....',
      '.......111111.f.....',
      '.....1111111111.....',
      '....111111111ee1....',
      '..22222222222222....',
      '..22222222222222....',
      '..22222222..........',
      '..2w222222..........',
      '..22222222..........',
      '..22222222..........',
      '..2222222...........',
      '..w.w.w.............',
    ],
  },
  {
    id: 'straw_hat', name: 'หมวกฟาง', hide: 'top', clearTop: 5, mat: { d: 's', m: 'S', l: '#f6e4bc', h: 'y' }, cols: { e: 'R', a: 's' },
    down: [
      '....................',
      '.......111111.......',
      '......11a11a11......',
      '......11111111......',
      '......eeeeeeee......',
      '.1a11111111111111a1.',
    ],
    side: [
      '....................',
      '......111111........',
      '......11a11a11......',
      '......11111111......',
      '......eeeeeeee......',
      '.1a11111111111111a1.',
    ],
  },
  {
    id: 'hard_hat', name: 'หมวกนิรภัย', hide: 'top', clearTop: 5, mat: { d: '#c0752a', m: '#f5b82e', l: 'Y', h: 'y' },
    cols: { w: 'W' }, spec: 'W',
    down: [
      '....................',
      '.......111111.......',
      '.....11cc111111.....',
      '....11111ww11111....',
      '...11111111111111...',
      '.111111111111111111.',
    ],
    up: [
      '....................',
      '.......111111.......',
      '.....11cc111111.....',
      '....111111111111....',
      '...11111111111111...',
      '.111111111111111111.',
    ],
    side: [
      '....................',
      '......111111........',
      '.....11cc11111......',
      '....1111111111w1....',
      '...11111111111111...',
      '..11111111111111111.',
    ],
  },
  {
    id: 'nurse_cap', name: 'หมวกพยาบาล', hide: 'none', mat: WHITE, cols: { e: 'R' },
    down: [
      '.......11ee11.......',
      '......11eeee11......',
      '......111ee111......',
    ],
    side: [
      '.......11e1.........',
      '......1eee11........',
      '......111e111.......',
    ],
  },
  {
    id: 'horns', name: 'เขาปีศาจ', hide: 'none', mat: { d: '#1e1020', m: '#4a1f30', l: 'R', h: 'r' },
    down: [
      '.1................1.',
      '.11..............11.',
      '..11............11..',
      '...1............1...',
    ],
    side: [
      '......1.............',
      '......11............',
      '.......11...........',
      '........1...........',
    ],
  },
  {
    id: 'ninja_mask', name: 'ผ้าคลุมนินจา', hide: 'all', mat: CLOTH_BLACK, cols: { e: 'R', f: 'L' },
    down: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..eeeeeeeffeeeeeee..',
      '..111..........111e.',
      '..111..........111.e',
      '..111..........111..',
      '..111..........111..',
      '..1111111111111111..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
    up: [
      '....................',
      '.......111111.......',
      '.....1111111111.....',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '..eeeeeeeeeeeeeeee..',
      '..1111111ee1111111..',
      '..111111e11e111111..',
      '..111111e11e111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
    side: [
      '....................',
      '......111111........',
      '....1111111111......',
      '...11111111111111...',
      '..1111111111111111..',
      '..1111111111111111..',
      '.eeeeeeeeeeeeeeeee..',
      'e.1111111111........',
      'e.1111111111........',
      '..1111111111........',
      '..1111111111........',
      '..1111111111111111..',
      '...11111111111111...',
      '.....1111111111.....',
    ],
  },
  {
    id: 'antenna', name: 'เสาอากาศ', hide: 'none', mat: DARK_STEEL, cols: { e: 'C', g: 'b' },
    down: ['.........ee.........', '.........11.........'],
    side: ['.........ee.........', '.........11.........'],
  },
  {
    id: 'chef_hat', name: 'หมวกเชฟ', hide: 'top', clearTop: 5, mat: WHITE, mat2: { d: 'L', m: 'L', l: 'w' }, cols: { a: 'L' },
    down: [
      '......11111111......',
      '....111111111111....',
      '....111111111111....',
      '.....1a11a11a11.....',
      '.....1111111111.....',
      '...22222222222222...',
    ],
    side: [
      '......11111111......',
      '....111111111111....',
      '....111111111111....',
      '.....1a11a11a11.....',
      '.....1111111111.....',
      '...22222222222222...',
    ],
  },
  {
    id: 'feather_band', name: 'ที่คาดหัวขนนก', hide: 'none', mat: { d: '#a8452f', m: 'r', l: 'Y' }, cols: { e: 'R', f: 'W', g: 'L', y: 'Y' },
    down: [
      '..............fg....',
      '..............f1....',
      '.............f1.....',
      '.............11.....',
      '....................',
      '..eeeeeeeyyeeeeeee..',
    ],
    up: [
      '....gf..............',
      '....1f..............',
      '.....1f.............',
      '.....11.............',
      '....................',
      '..eeeeeeeeeeeeeeee..',
    ],
    side: [
      '..gf................',
      '..1f................',
      '...1f...............',
      '...11...............',
      '....................',
      '..eeeeeeeeeeeeeeee..',
    ],
  },
  {
    id: 'goggles', name: 'แว่นช่าง', hide: 'none', cols: { e: '#262b44', g: '#c0752a', f: 'C', w: 'W' },
    down: [
      '....................',
      '....................',
      '....................',
      '....gggg....gggg....',
      '..eegwfgeeeegwfgee..',
      '....gggg....gggg....',
    ],
    up: [
      '....................',
      '....................',
      '....................',
      '....................',
      '..eeeeeeeeeeeeeeee..',
    ],
    side: [
      '....................',
      '....................',
      '....................',
      '...........gggg.....',
      '..eeeeeeeeegwfg.....',
      '...........gggg.....',
    ],
  },
];

export const HELMETS: { id: string; name: string }[] = HELMET_DEFS.map(({ id, name }) => ({ id, name }));

// ---------------------------------------------------------------- ผ้าคลุม

export interface CapeDef {
  id: string;
  name: string;
  mat?: Mat;
  clasp: string;
}

export const CAPE_DEFS: CapeDef[] = [
  { id: 'none', name: 'ไม่สวม', clasp: 'Y' },
  { id: 'red', name: 'ผ้าคลุมแดง', mat: { d: '#5a1e2e', m: 'R', l: '#d8606f' }, clasp: 'Y' },
  { id: 'blue', name: 'ผ้าคลุมน้ำเงิน', mat: { d: '#1a2350', m: 'B', l: 'b' }, clasp: 'Y' },
  { id: 'purple', name: 'ผ้าคลุมม่วง', mat: { d: '#2e1236', m: 'P', l: '#8a4a9a' }, clasp: 'C' },
  { id: 'gold', name: 'ผ้าคลุมทอง', mat: { d: '#a0662a', m: '#e0a040', l: 'Y' }, clasp: 'R' },
  { id: 'black', name: 'ผ้าคลุมดำ', mat: { d: '#100f1c', m: '#262b44', l: '#40466a' }, clasp: 'R' },
];

export const CAPES: { id: string; name: string }[] = CAPE_DEFS.map(({ id, name }) => ({ id, name }));

// ---------------------------------------------------------------- ผม
// ผมฟูใหญ่แบบจิบิ: กลุ่มผมเลยหัว 1px รอบด้าน หน้าม้าถึง y=6 (เหนือตาพอดี) จอนข้างแก้มถึง y=10-11

export type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'bald';
type View = 'down' | 'up' | 'side';

export const HAIR: Record<Exclude<HairStyle, 'bald'>, Record<View, string[]>> = {
  short: {
    down: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c11111111111a1..',
      '..1c111111111111a1..',
      '..11a11.1111.11a11..',
      '..11............11..',
      '..11............11..',
      '..1a............a1..',
      '..11............11..',
      '...1............1...',
    ],
    up: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c1111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '...111111111111a1...',
      '....111111111111....',
      '.....11a1111a11.....',
    ],
    side: [
      '....................',
      '.....1111111........',
      '...1111cc111111.....',
      '..111cc111111111....',
      '..11c11111111111a...',
      '..1c111111111111a1..',
      '..111111111111.1a...',
      '..11111111..........',
      '..11111111..........',
      '..1111111...........',
      '..111111............',
      '..11111.............',
      '...111..............',
      '....1...............',
    ],
  },
  spiky: {
    down: [
      '....1..11..11..1....',
      '...11.111111111.1...',
      '..111cc111111111a1..',
      '.111c1111111111111a.',
      '..11c11111111111a1..',
      '.111111111111111111.',
      '..111.11.11.11.111..',
      '..11............11..',
      '.111............111.',
      '..11............11..',
      '..1..............1..',
    ],
    up: [
      '....1..11..11..1....',
      '...11.111111111.1...',
      '..111cc111111111a1..',
      '.111c1111111111111a.',
      '..11c1111111111111..',
      '.111111111111111111.',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '.111111111111111111.',
      '..11111111111111a1..',
      '...1.1111111111.1...',
      '.....1.1.11.1.1.....',
    ],
    side: [
      '.....1..1..1........',
      '....11111111.1......',
      '.11111cc11111111....',
      '...11c1111111111a...',
      '1111c111111111111a..',
      '..1111111111111.11a.',
      '.1111111111111.1....',
      '..11111111..........',
      '.111111111..........',
      '..1111111...........',
      '.111111.............',
      '..1111..............',
      '...11...............',
    ],
  },
  long: {
    down: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c11111111111a1..',
      '..1c111111111111a1..',
      '..11a11.1111.11a11..',
      '..11............11..',
      '..11............11..',
      '.111............111.',
      '.1a1............1a1.',
      '.111............111.',
      '.111............111.',
      '.11a............a11.',
      '.111............111.',
      '.1a..............a1.',
      '..1..............1..',
    ],
    up: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c1111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..111a11111111a111..',
      '..11a1111111111a11..',
      '...1a1111111111a1...',
      '...11a11111111a11...',
      '....1a11111111a1....',
      '.....11.1111.11.....',
    ],
    side: [
      '....................',
      '.....1111111........',
      '...1111cc111111.....',
      '..111cc111111111....',
      '..11c11111111111a...',
      '..1c111111111111a1..',
      '..111111111111.1a...',
      '..11111111..........',
      '..11111111..........',
      '.111111111..........',
      '.11111111...........',
      '.1a11111............',
      '.111111.............',
      '.1a1111.............',
      '.11111..............',
      '.11a1...............',
      '..11................',
    ],
  },
  ponytail: {
    down: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c11111111111a11.',
      '..1c111111111111a11.',
      '..11a11.1111.11a111.',
      '..11............111.',
      '..11............111.',
      '..1a.............11.',
      '..11.............11.',
      '...1.............1..',
    ],
    up: [
      '....................',
      '......11111111......',
      '....111cc1111111....',
      '...11cc1111111111...',
      '..11c1111111111111..',
      '..1111111111111111..',
      '..1111111ee1111111..',
      '..1111111cc1111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '..1111111111111111..',
      '...11111111111111...',
      '....111111111111....',
      '......11111111......',
      '.......1c11.........',
      '.......1111.........',
      '........11..........',
    ],
    side: [
      '....................',
      '.....1111111........',
      '...1111cc111111.....',
      '..111cc111111111....',
      '.e11c11111111111a...',
      '.1.1111111111111a1..',
      '.1.111111111111.1a..',
      '.1.11111111.........',
      '.1.11111111.........',
      '..11111111..........',
      '...111111...........',
      '...11111............',
      '....111.............',
    ],
  },
};

/** แถวตั้งแต่เท่าไรที่แกว่งตามจังหวะเดิน (ผมยาว/หางม้า) */
const HAIR_SWAY: Partial<Record<HairStyle, Record<View, number>>> = {
  long: { down: 12, up: 13, side: 11 },
  ponytail: { down: 7, up: 13, side: 5 },
};

// ---------------------------------------------------------------- look

export interface HeroLook {
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: HairStyle;
  eyes: string;
  outfit: string;
  helmet: string;
  cape: string;
}

const outfitById = (id: string) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
const helmetById = (id: string) => HELMET_DEFS.find((h) => h.id === id) ?? HELMET_DEFS[0];
const capeById = (id: string) => CAPE_DEFS.find((c) => c.id === id) ?? CAPE_DEFS[0];

interface Ctx {
  c: PixelCanvas;
  view: View;
  step: number;
  /** หัวกระดกลงกี่ px (เฟรมก้าว = 1) */
  bob: number;
  o: OutfitDef;
  look: HeroLook;
  skin: Mat;
}

// ---------------------------------------------------------------- ชิ้นส่วนร่างกาย (ตัวจิ๋ว: ลำตัว y14..18 ขา y19..22)

function drawLegs(f: Ctx) {
  const { c, o, view, step } = f;
  if (view !== 'side') {
    for (const [x0, lift] of [[7, step === 1], [10, step === -1]] as [number, boolean][]) {
      const L = lift ? 1 : 0;
      shade(c, new Mask().rect(x0, 19, 3, 2 - L), o.legs);
      shade(c, new Mask().rect(x0, 21 - L, 3, 2), o.boots);
      if (o.bootTop) px(c, [[x0, 21 - L], [x0 + 1, 21 - L], [x0 + 2, 21 - L]], o.bootTop);
      if (c.res > 1) {
        // HD: รอยพับกางเกงกลางขา · ขอบรองเท้า (ตะเข็บ) · พื้นรองเท้า · ประกายหัวรองเท้า
        const X = x0 * 2;
        const by = (21 - L) * 2;
        if (!o.robe && o.legs.pattern !== 'check') hOn(c, [[X + 3, 39], [X + 3, 40]].filter(([, Y]) => Y < by) as [number, number][], o.legs, o.legs.d);
        if (!o.bootTop) hOn(c, [[X + 1, by + 1], [X + 2, by + 1], [X + 3, by + 1], [X + 4, by + 1]], o.boots, o.boots.d);
        hOn(c, [[X + 1, by + 2]], o.boots, o.boots.h ?? lighten(hexOf(o.boots.l), 0.3));
        hOn(c, [[X, by + 3], [X + 1, by + 3], [X + 2, by + 3], [X + 3, by + 3], [X + 4, by + 3], [X + 5, by + 3]], o.boots, darken(hexOf(o.boots.d), 0.3));
      }
    }
    return;
  }
  // ด้านข้าง: ขาไกล (หรี่) แล้วขาใกล้
  const legs = step
    ? [
        { far: true, pants: [[8, 10, 19], [7, 9, 20]], bx: 6, by: 20, toe: 9 },
        { far: false, pants: [[9, 11, 19], [10, 12, 20]], bx: 10, by: 21, toe: 13 },
      ]
    : [
        { far: true, pants: [[8, 10, 19], [8, 10, 20]], bx: 8, by: 21, toe: 11 },
        { far: false, pants: [[9, 11, 19], [9, 11, 20]], bx: 9, by: 21, toe: 12 },
      ];
  for (const g of legs) {
    const pm = new Mask();
    for (const [x0, x1, y] of g.pants) pm.span(y, x0, x1);
    shade(c, pm, g.far ? dim(o.legs) : o.legs);
    const bm = new Mask().rect(g.bx, g.by, 3, 2).add(g.toe, g.by + 1);
    shade(c, bm, g.far ? dim(o.boots) : o.boots);
    if (o.bootTop) px(c, [[g.bx, g.by], [g.bx + 1, g.by], [g.bx + 2, g.by]], g.far ? darken(hexOf(o.bootTop)) : o.bootTop);
    if (c.res > 1) {
      // HD: พื้นรองเท้า + ประกายหัวรองเท้า (ด้านข้าง)
      const bt = g.far ? dim(o.boots) : o.boots;
      const sole: [number, number][] = [];
      for (let X = g.bx * 2; X <= g.toe * 2 + 1; X++) sole.push([X, g.by * 2 + 3]);
      hOn(c, sole, bt, darken(hexOf(bt.d), 0.3));
      hOn(c, [[g.toe * 2, g.by * 2 + 2]], bt, bt.l);
    }
  }
}

function drawRobe(f: Ctx) {
  const { c, o, view, step } = f;
  if (!o.robe) return;
  const rm = o.robeMat ?? o.top;
  const m = new Mask();
  const s = step;
  if (view !== 'side') {
    m.span(18, 6, 13).span(19, 5, 14);
    if (o.robe === 'long') m.span(20, 5 + s, 14 + s).span(21, 4 + s, 15 + s);
    else for (let x = 5; x <= 14; x++) if (x % 2 === 1) m.add(x, 20);
  } else {
    m.span(18, 7, 12).span(19, 6, 13);
    if (o.robe === 'long') {
      if (s) m.span(20, 5, 14).span(21, 4, 14);
      else m.span(20, 6, 13).span(21, 5, 13);
    } else for (let x = 6; x <= 13; x++) if (x % 2 === 0) m.add(x, 20);
  }
  shade(c, m, rm);
  if (o.trim) {
    // ชายกระโปรง + แถบกลาง (หน้า)
    m.each((x, y) => {
      if (!m.has(x, y + 1) && o.robe === 'long') c.set(x, y, o.trim!);
    });
    if (o.robe === 'long' && view === 'down') {
      for (let y = 14; y <= 21; y++) {
        const dx = y >= 20 ? s : 0;
        c.set(9 + dx, y, o.trim);
        c.set(10 + dx, y, y === 14 ? o.trim : darken(hexOf(o.trim), 0.25));
      }
    } else if (o.robe === 'long' && view === 'side') {
      for (let y = 18; y <= 21; y++) c.set(y < 20 ? 12 : 13, y, o.trim);
    }
  }
}

function torsoMask(view: View) {
  return view === 'side' ? new Mask().rect(7, 14, 6, 5) : new Mask().rect(6, 14, 8, 5);
}

function drawTorso(f: Ctx) {
  const { c, o, view } = f;
  shade(c, torsoMask(view), o.coat && !o.coat.open ? o.coat.mat : o.top);
  if (view === 'down' && o.neck) {
    c.set(9, 14, f.skin.d);
    c.set(10, 14, f.skin.d);
    if (o.trim) {
      c.set(8, 14, o.trim);
      c.set(11, 14, o.trim);
    }
    if (c.res > 1) {
      // HD: คอเสื้อรูปตัว V มีขอบผ้า
      const top = o.coat && !o.coat.open ? o.coat.mat : o.top;
      for (const [X, Y] of [[18, 29], [21, 29]] as [number, number][]) c.hset(X, Y, o.trim ? hexOf(o.trim) : top.d);
      c.hset(19, 29, f.skin.d);
      c.hset(20, 29, f.skin.d);
      c.hset(19, 30, o.trim ? hexOf(o.trim) : top.d);
      c.hset(20, 30, o.trim ? hexOf(o.trim) : top.d);
      if (o.trim) {
        c.hset(16, 28, top.l);
        c.hset(23, 28, top.m);
      }
    }
  }
  if (c.res > 1 && !o.robe) {
    // HD: รอยย่นผ้าใต้รักแร้ + ชายเสื้อมีเงาตะเข็บ
    const mt = o.coat && !o.coat.open ? o.coat.mat : o.top;
    if (view === 'down') hOn(c, [[13, 30], [14, 31], [26, 30], [25, 31]], mt, mt.d);
    else if (view === 'side') hOn(c, [[16, 30], [17, 31]], mt, mt.d);
    else hOn(c, [[19, 30], [20, 31], [19, 32], [20, 33]], mt, mt.d); // ตะเข็บหลัง
  }
  // เอว: ชายเสื้อ
  if (!o.robe) {
    const wm = view === 'side' ? new Mask().rect(7, 18, 6, 1) : new Mask().rect(6, 18, 8, 1);
    shade(c, wm, o.coat && !o.coat.open ? o.coat.mat : o.top, true);
  }
}

function drawBelt(f: Ctx) {
  const { c, o, view } = f;
  if (!o.belt) return;
  const y0 = o.beltWide ? 17 : 18;
  const m = view === 'side' ? new Mask().rect(7, y0, 6, 19 - y0) : new Mask().rect(6, y0, 8, 19 - y0);
  shade(c, m, o.belt, true);
  if (o.buckle) {
    if (view === 'down') px(c, [[9, 18], [10, 18]], o.buckle);
    else if (view === 'side') c.set(12, 18, o.buckle);
    else if (o.beltWide) px(c, [[9, 17], [10, 17]], o.buckle); // ปมโอบิด้านหลัง
  }
  if (c.res > 1) {
    // HD: หัวเข็มขัดเป็นกรอบมีรูกลาง + ประกาย · รูเข็มขัด
    const bk = o.buckle ? hexOf(o.buckle) : '';
    if (o.buckle && view === 'down' && !o.beltWide) {
      for (const [X, Y] of [[19, 36], [20, 36], [19, 37], [20, 37]] as [number, number][]) c.hset(X, Y, darken(hexOf(o.belt.d), 0.2));
      c.hset(18, 36, lighten(bk, 0.5));
      c.hset(21, 37, darken(bk, 0.3));
    } else if (o.buckle && view === 'side') {
      c.hset(24, 36, lighten(bk, 0.5));
      c.hset(25, 37, darken(bk, 0.3));
    }
    const y = (view === 'side' ? 37 : o.beltWide ? 35 : 36);
    const holes: [number, number][] = [];
    for (let X = 0; X < W * 2; X++) if (X % 4 === 1 && (view !== 'down' || X < 17 || X > 22)) holes.push([X, y]);
    if (!o.beltWide) hOn(c, holes, o.belt, o.belt.d);
    else hOn(c, holes.map(([X]) => [X, 34] as [number, number]), o.belt, o.belt.l);
  }
}

function drawCoat(f: Ctx) {
  const { c, o, view, step } = f;
  if (!o.coat) return;
  const cm = o.coat.mat;
  const s = step;
  const masks: Mask[] = [];
  if (view === 'down') {
    const w = o.coat.open ? 2 : 3;
    const L = new Mask();
    const R = new Mask();
    if (o.coat.open) {
      L.rect(6, 14, 2, 4);
      R.rect(12, 14, 2, 4);
    }
    L.span(18, 6, 5 + w).span(19, 5, 5 + w).span(20, 5 + s, 5 + w + s);
    R.span(18, 14 - w, 13).span(19, 14 - w, 14).span(20, 14 - w + s, 14 + s);
    masks.push(L, R);
  } else if (view === 'up') {
    const B = new Mask().rect(6, 14, 8, 4).span(18, 6, 13).span(19, 5, 14);
    for (let x = 5; x <= 14; x++) if (x !== 9 && x !== 10) B.add(x + s, 20);
    masks.push(B);
  } else {
    const B = new Mask().rect(7, 14, o.coat.open ? 5 : 6, 4);
    if (s) B.span(18, 6, 9).span(19, 4, 8).span(20, 3, 7);
    else B.span(18, 6, 9).span(19, 5, 8).span(20, 5, 8);
    masks.push(B);
  }
  for (const m of masks) {
    shade(c, m, cm);
    if (o.trim) {
      m.each((x, y) => {
        const inner = view === 'down' && o.coat!.open && (x === 7 || x === 12) && y <= 19;
        const front = view === 'side' && o.coat!.open && x === 11 && y <= 17;
        if (inner || front || (!m.has(x, y + 1) && y >= 19)) c.set(x, y, o.trim!);
      });
    }
  }
}

function drawArms(f: Ctx, layer: 'far' | 'near') {
  const { c, o, view, step } = f;
  const sl = o.sleeve === 'skin' ? f.skin : o.sleeve ?? (o.coat?.open ? o.coat.mat : o.top);
  const hands = o.hands ?? f.skin;
  const cuff = o.cuff ?? (o.sleeve === 'skin' ? undefined : o.trim);
  if (view !== 'side') {
    if (layer === 'far') return;
    // แขนสั้นป้อม 2 แถว + มือกลม 2×2
    const dyL = step === 1 ? -1 : step === -1 ? 1 : 0;
    for (const [x0, dy, outer] of [[4, dyL, 4], [14, -dyL, 15]] as [number, number, number][]) {
      const m = new Mask();
      const end = 15 + dy;
      for (let y = 14; y <= end; y++) m.add(x0, y).add(x0 + 1, y);
      m.del(outer, 14);
      if (o.bellSleeves) for (let y = end - 1; y <= end; y++) m.add(outer === 4 ? 3 : 16, y);
      shade(c, m, sl, true);
      if (cuff) m.each((x, y) => y === end && c.set(x, y, cuff));
      shade(c, new Mask().rect(x0, 16 + dy, 2, 2), hands, true);
    }
    return;
  }
  if (layer === 'far') {
    if (!step) return;
    // แขนไกลแกว่งไปหน้า (โผล่หน้าอก)
    shade(c, new Mask().span(14, 11, 12).span(15, 12, 13), dim(sl), true);
    shade(c, new Mask().rect(13, 16, 2, 2), dim(hands), true);
    return;
  }
  const m = new Mask();
  let hand: Mask;
  if (step) {
    m.span(14, 9, 10).span(15, 8, 9);
    if (o.bellSleeves) m.add(7, 15);
    hand = new Mask().rect(7, 16, 2, 2);
  } else {
    m.rect(9, 14, 2, 2);
    if (o.bellSleeves) m.add(8, 15);
    hand = new Mask().rect(9, 16, 2, 2);
  }
  shade(c, m, sl, true);
  if (cuff) m.each((x, y) => y === 15 && c.set(x, y, cuff));
  shade(c, hand, hands, true);
}

function drawShoulders(f: Ctx) {
  const { c, o, view } = f;
  if (!o.shoulder) return;
  const pads: Mask[] = [];
  if (view === 'side') pads.push(new Mask().span(13, 8, 10).span(14, 7, 11).span(15, 7, 11));
  else {
    pads.push(new Mask().span(13, 4, 5).span(14, 3, 6).span(15, 3, 6));
    pads.push(new Mask().span(13, 14, 15).span(14, 13, 16).span(15, 13, 16));
  }
  for (const m of pads) {
    shade(c, m, o.shoulder);
    if (o.shoulderTrim) m.each((x, y) => y === 15 && x % 2 === 0 && c.set(x, y, o.shoulderTrim!));
  }
}

// ---------------------------------------------------------------- หัวจิบิ (14×12 กลมมน ตัดมุม 2px)

const HEAD_SPANS: [number, number, number][] = [
  [2, 6, 13], [3, 4, 15], [4, 3, 16], [5, 3, 16], [6, 3, 16], [7, 3, 16], [8, 3, 16], [9, 3, 16], [10, 3, 16], [11, 3, 16], [12, 4, 15], [13, 6, 13],
];
const HEAD: Record<View, [number, number, number][]> = { down: HEAD_SPANS, up: HEAD_SPANS, side: HEAD_SPANS };

function drawHead(f: Ctx) {
  const { c, view, look, o, bob: b } = f;
  const m = new Mask();
  for (const [y, x0, x1] of HEAD[view]) m.span(y + b, x0, x1);
  const sk = f.skin;
  shade(c, m, sk);
  const hi = sk.h ?? lighten(hexOf(sk.m), 0.5);
  if (look.hairStyle === 'bald' && helmetById(look.helmet).hide !== 'all') px(c, [[7, 3 + b], [6, 4 + b], [5, 5 + b]], hi);

  if (o.face && c.res > 1) {
    hdRobotFace(c, view, b, look.eyes || 'C', o.face);
    return;
  }
  if (o.face) {
    // หน้ากากหุ่นยนต์: วิซอร์กว้าง + ไฟตาโต + ตะแกรงปาก + น็อตหู
    if (view === 'down') {
      for (let y = 7; y <= 10; y++) for (let x = 4; x <= 15; x++) c.set(x, y + b, 'F');
      for (const ex of [5, 12]) {
        for (let y = 8; y <= 9; y++) for (let x = ex; x <= ex + 2; x++) c.set(x, y + b, look.eyes || 'C');
        c.set(ex, 8 + b, 'W');
        c.set(ex + 2, 9 + b, 'b');
      }
      px(c, [[8, 12 + b], [10, 12 + b]], 'F');
      px(c, [[9, 12 + b], [11, 12 + b]], 'D');
      px(c, [[3, 9 + b], [16, 9 + b]], o.face.l);
      px(c, [[3, 10 + b], [16, 10 + b]], o.face.d);
    } else if (view === 'side') {
      for (let y = 7; y <= 10; y++) for (let x = 10; x <= 16; x++) c.set(x, y + b, 'F');
      for (let y = 8; y <= 9; y++) for (let x = 12; x <= 14; x++) c.set(x, y + b, look.eyes || 'C');
      c.set(12, 8 + b, 'W');
      px(c, [[13, 12 + b], [14, 12 + b]], 'F');
      px(c, [[8, 9 + b]], o.face.l);
      px(c, [[8, 10 + b]], o.face.d);
    } else {
      for (let y = 2; y <= 12; y++) c.set(9, y + b, o.face.d);
      px(c, [[6, 10 + b], [13, 10 + b]], 'F');
      px(c, [[3, 9 + b], [16, 9 + b]], o.face.l);
    }
    return;
  }

  const eye = hexOf(look.eyes);
  const lash = mix(eye, '#120e1e', 0.78);
  const eyeD = mix(eye, '#1a1c2c', 0.45);
  const eyeL = lighten(eye, 0.4);
  const blush = mix(sk.m, '#ff5d73', 0.42);
  const mouth = mix(sk.d, '#5a1e2e', 0.5);
  // ตาอนิเมะ 3×4: ขนตาหนาด้านบน + ประกายใหญ่ซ้ายบน + ประกายจิ๋วขวาล่าง + ม่านตาไล่สี
  const eyeAt = (x: number, y: number) => {
    px(c, [[x, y], [x + 1, y], [x + 2, y]], lash);
    px(c, [[x + 1, y + 1], [x + 1, y + 2]], eyeD);
    px(c, [[x + 2, y + 1], [x, y + 2], [x + 2, y + 2]], eye);
    px(c, [[x, y + 3], [x + 1, y + 3]], eyeL);
    c.set(x, y + 1, 'W');
    c.set(x + 2, y + 3, 'W');
  };
  if (c.res > 1) {
    hdFace(c, view, b, { lash, eyeD, eye, eyeL, blush, mouth, sk });
    return;
  }
  if (view === 'down') {
    eyeAt(5, 7 + b);
    eyeAt(12, 7 + b);
    px(c, [[4, 11 + b], [5, 11 + b], [14, 11 + b], [15, 11 + b]], blush);
    px(c, [[9, 12 + b], [10, 12 + b]], mouth);
  } else if (view === 'side') {
    eyeAt(12, 7 + b);
    px(c, [[12, 11 + b], [13, 11 + b]], blush);
    c.set(15, 12 + b, mouth);
    c.set(10, 9 + b, sk.d); // หู
    c.set(10, 10 + b, sk.d);
  }
}

/** หน้ากากหุ่นยนต์ HD: วิซอร์มุมมน + แสงสะท้อนเฉียง · ไฟตา LED มีเส้นสแกน · ตะแกรงปาก · น็อตหูมีประกาย */
function hdRobotFace(c: PixelCanvas, view: View, b: number, eyeCol: string, face: Mat) {
  const yb = b * 2;
  const led = hexOf(eyeCol);
  const ledHi = lighten(led, 0.6);
  const ledLo = darken(led, 0.35);
  const visor = (x0: number, x1: number) => {
    for (let Y = 14; Y <= 21; Y++) {
      for (let X = x0; X <= x1; X++) {
        if ((Y === 14 || Y === 21) && (X === x0 || X === x1)) continue;
        c.hset(X, Y + yb, Y === 14 ? '#262b44' : 'F');
      }
    }
    // แสงสะท้อนเฉียงบนกระจก
    for (let k = 0; k < 3; k++) c.hset(x0 + 2 + k, 19 - k + yb, 'D');
  };
  const eye = (X: number, w: number) => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < w; i++) c.hset(X + i, 16 + j + yb, j === 0 ? ledHi : j === 3 ? ledLo : j === 2 && i % 2 ? ledLo : led);
    c.hset(X, 16 + yb, 'W');
    c.hset(X + 1, 16 + yb, 'W');
    c.hset(X, 17 + yb, 'W');
  };
  const bolt = (X: number) => {
    c.hset(X, 18 + yb, face.l);
    c.hset(X + 1, 18 + yb, face.m);
    c.hset(X, 19 + yb, face.m);
    c.hset(X + 1, 19 + yb, face.d);
    c.hset(X, 20 + yb, face.d);
    c.hset(X + 1, 20 + yb, face.d);
  };
  if (view === 'down') {
    visor(8, 31);
    eye(10, 6);
    eye(24, 6);
    for (let X = 16; X <= 23; X++) c.hset(X, 24 + yb, X % 2 ? 'D' : 'F');
    for (let X = 17; X <= 22; X++) c.hset(X, 25 + yb, X % 2 ? 'F' : '#262b44');
    bolt(6);
    bolt(32);
  } else if (view === 'side') {
    visor(20, 33);
    eye(24, 6);
    for (let X = 26; X <= 29; X++) c.hset(X, 24 + yb, X % 2 ? 'D' : 'F');
    bolt(16);
  } else {
    for (let Y = 4; Y <= 25; Y++) c.hset(19, Y + yb, face.d);
    for (let Y = 4; Y <= 25; Y++) c.hset(20, Y + yb, face.l); // รอยต่อหลังหัว
    for (const X of [12, 26]) {
      c.hset(X, 20 + yb, 'F');
      c.hset(X + 1, 20 + yb, 'F');
      c.hset(X, 21 + yb, 'D');
    }
    bolt(6);
    bolt(32);
  }
}

// ตา HD 6×8 (ตรรกะ 3×4): ขนตาหนา 2 แถว + หางขนตาชี้ออก · ม่านตาไล่ 3 เฉด + รูม่านตา · ประกายใหญ่ซ้ายบน + ประกายจิ๋วขวาล่าง · ขอบล่างมน
const HD_EYE = [
  'KKKKKK',
  'KKKKKK',
  'WWDPDE',
  'WWPPDE',
  'EDPPDE',
  'EEDDEE',
  'LLEEWL',
  '.LLLL.',
];

interface FaceCols {
  lash: string;
  eyeD: string;
  eye: string;
  eyeL: string;
  blush: string;
  mouth: string;
  sk: Mat;
}

function hdFace(c: PixelCanvas, view: View, b: number, k: FaceCols) {
  const r = c.res;
  const pupil = mix(k.eyeD, k.lash, 0.55);
  const map: Record<string, string> = { K: k.lash, W: 'W', D: k.eyeD, P: pupil, E: k.eye, L: k.eyeL };
  /** x,y = มุมตาตรรกะ · outer = ด้านหางตา (-1 ซ้าย / 1 ขวา) */
  const eye = (x: number, y: number, outer: number) => {
    const X = x * r;
    const Y = y * r;
    HD_EYE.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') c.hset(X + i, Y + j, map[row[i]]);
    });
    const ox = outer > 0 ? X + 6 : X - 1;
    c.hset(ox, Y + 1, k.lash);
    c.hset(ox + outer, Y, k.lash);
    c.hset(ox, Y + 5, mix(k.lash, k.sk.m, 0.5)); // ขนตาล่างจาง ๆ
  };
  const blushAt = (X: number, Y: number) => {
    const soft = mix(k.sk.m, k.blush, 0.55);
    for (let i = 0; i < 4; i++) c.hset(X + i, Y, soft);
    for (let i = 1; i < 3; i++) c.hset(X + i, Y + 1, soft);
    c.hset(X + 1, Y, k.blush); // ขีดแก้มเฉียง
    c.hset(X, Y + 1, k.blush);
    c.hset(X + 3, Y, k.blush);
    c.hset(X + 2, Y + 1, k.blush);
  };
  if (view === 'down') {
    eye(5, 7 + b, -1);
    eye(12, 7 + b, 1);
    blushAt(8, (11 + b) * r);
    blushAt(28, (11 + b) * r);
    // ปากยิ้มเล็ก ๆ + จมูกจุด
    const my = (12 + b) * r;
    c.hset(18, my, k.mouth);
    c.hset(21, my, k.mouth);
    c.hset(19, my + 1, k.mouth);
    c.hset(20, my + 1, k.mouth);
    c.hset(19, my - 3, k.sk.d);
  } else if (view === 'side') {
    eye(12, 7 + b, 1);
    blushAt(24, (11 + b) * r);
    const my = (12 + b) * r;
    c.hset(30, my, k.mouth);
    c.hset(31, my + 1, k.mouth);
    c.hset(29, my + 1, k.mouth);
    // หู: เงาโค้งในหู
    for (const [x, y] of [[20, 18], [21, 18], [20, 19], [20, 20], [21, 21]] as [number, number][]) c.hset(x, y + b * r, k.sk.d);
    c.hset(21, 19 + b * r, mix(k.sk.d, k.blush, 0.5));
  }
}

function drawHair(f: Ctx, minY: number) {
  const { c, view, step, look } = f;
  if (look.hairStyle === 'bald') return;
  const rows = HAIR[look.hairStyle]?.[view];
  if (!rows) return;
  const hm: Mat = { d: look.hairShade, m: look.hair, l: lighten(hexOf(look.hair), 0.28), h: lighten(hexOf(look.hair), 0.5) };
  const swayFrom = HAIR_SWAY[look.hairStyle]?.[view];
  const sway = view === 'side' ? -step : step;
  stamp(c, rows, { '1': hm }, { c: c.res > 1 ? hm.h ?? hm.l : hm.l, a: hm.d, e: 'R' }, {
    fine: { c: 'hi', a: 'lo' },
    minY,
    dy: f.bob,
    shift: swayFrom === undefined ? undefined : (y) => (y >= swayFrom ? sway : 0),
  });
  if (c.res > 1) hairShine(c, hm, view, minY * 2);
}

/** HD: วงแสงบนผม (angel ring) โค้งตามหัว เว้นช่องเป็นช่อ ๆ + ร่องผมด้านหลัง */
function hairShine(c: PixelCanvas, hm: Mat, view: View, minY: number) {
  const HW = W * 2;
  const tops: number[] = [];
  let x0 = HW;
  let x1 = -1;
  for (let X = 0; X < HW; X++) {
    tops[X] = -1;
    for (let Y = Math.max(0, minY); Y < 30; Y++) {
      if (isMat(c.hget(X, Y), hm)) {
        tops[X] = Y;
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        break;
      }
    }
  }
  if (x1 < 0) return;
  const w = x1 - x0;
  for (let X = x0 + 2; X <= x1 - 2; X++) {
    const t = (X - x0) / w;
    if (tops[X] < 0 || t > (view === 'side' ? 0.75 : 0.7) || (X - x0) % 4 === 3) continue;
    const Y = tops[X] + 3 + Math.round(Math.abs(t - 0.38) * 3);
    for (const yy of [Y, Y + 1]) if (c.hget(X, yy) === hm.m) c.hset(X, yy, t < 0.5 ? hm.l : hm.m === hm.l ? hm.l : lighten(hexOf(hm.m), 0.16));
  }
  if (view !== 'up') return;
  // ร่องผมด้านหลัง: เส้นเข้มยาวลงตามช่อ
  for (let X = x0 + 3; X <= x1 - 3; X += 5) {
    const len = 10 + ((X * 7) % 4) * 3;
    for (let Y = tops[X] + 7 + ((X * 3) % 4); Y < Math.min(30, tops[X] + 7 + len); Y++) {
      if (c.hget(X, Y) === hm.m) c.hset(X, Y, hm.d);
    }
  }
}

function drawHelmet(f: Ctx, h: HelmetDef) {
  const rows = f.view === 'side' ? h.side : f.view === 'up' ? h.up ?? h.down : h.down;
  if (!rows.length) return;
  const m1 = h.mat ?? STEEL;
  stamp(f.c, rows, { '1': m1, '2': h.mat2 ?? m1 }, { c: m1.l, a: m1.d, h: m1.h ?? m1.l, ...h.cols }, { dy: f.bob, fine: { c: 'hi', a: 'lo' } });
  if (f.c.res > 1 && (h.id === 'hood' || h.id === 'ninja_mask') && f.view === 'up') {
    // HD: ตะเข็บกลางหลังฮู้ด + รอยพับผ้า
    const yb = f.bob * 2;
    for (let Y = 4; Y <= 30; Y++) {
      hOn(f.c, [[19, Y + yb]], m1, m1.d);
      hOn(f.c, [[20, Y + yb]], m1, m1.l);
    }
    for (const [X, Y] of [[11, 14], [12, 15], [12, 16], [28, 14], [27, 15], [27, 16], [9, 24], [30, 24]] as [number, number][]) hOn(f.c, [[X, Y + yb]], m1, m1.d);
  }
}

// ---------------------------------------------------------------- ผ้าคลุม

function drawCape(f: Ctx, cape: CapeDef, phase: 'back' | 'over') {
  const { c, view, step, bob: b } = f;
  if (!cape.mat) return;
  const cm = cape.mat;
  const s = step;
  if (phase === 'back' && view === 'down') {
    const m = new Mask().span(13, 5, 14);
    for (let y = 14; y <= 16; y++) m.span(y, 4, 15);
    for (let y = 17; y <= 18; y++) m.span(y, 3, 16);
    for (let y = 19; y <= 20; y++) m.span(y, 3 + s, 16 + s);
    for (let x = 3; x <= 16; x++) if (x % 2 === 1) m.add(x + s, 21);
    // ด้านในผ้าคลุม (ซับใน) มืดกว่า
    shade(c, m, { d: cm.d, m: darken(hexOf(cm.m), 0.22), l: cm.m });
  } else if (phase === 'back' && view === 'side') {
    const m = new Mask().span(13, 6, 8).span(14, 5, 8).span(15, 4, 8).span(16, 4, 8);
    if (s) m.span(17, 3, 8).span(18, 3, 8).span(19, 2, 8).span(20, 2, 7).add(1, 21).add(3, 21).add(5, 21);
    else m.span(17, 4, 8).span(18, 3, 8).span(19, 3, 8).span(20, 3, 8).add(3, 21).add(5, 21).add(7, 21);
    shade(c, m, cm);
    px(c, [[5, 17], [5, 18], [4, 19]].map(([x, y]) => [x - (s && y >= 17 ? 1 : 0), y] as [number, number]), cm.d);
  } else if (phase === 'over' && view === 'down') {
    // ผ้าพาดไหล่ + เข็มกลัด
    px(c, [[4, 14]], cm.l);
    px(c, [[15, 14]], cm.m);
    px(c, [[7, 14], [12, 14]], cape.clasp);
  } else if (phase === 'over' && view === 'side') {
    c.set(11, 14, cape.clasp);
  } else if (phase === 'over' && view === 'up') {
    const m = new Mask();
    for (let y = 14; y <= 16; y++) m.span(y, 6, 13);
    for (let y = 17; y <= 18; y++) m.span(y, 5, 14);
    m.span(19, 4 + s, 15 + s).span(20, 3 + s, 16 + s);
    for (let x = 3; x <= 16; x++) if (x % 2 === 1) m.add(x + s, 21);
    shade(c, m, cm);
    // รอยพับผ้า
    for (let y = 16; y <= 20; y++) {
      const dx = y >= 19 ? s : 0;
      if (m.has(8 + dx, y)) c.set(8 + dx, y, cm.d);
      if (m.has(11 + dx, y)) c.set(11 + dx, y, cm.d);
    }
    px(c, [[6, 14 + b], [13, 14 + b]], cape.clasp);
  }
}

// ---------------------------------------------------------------- รายละเอียดชุด

type Phase = 'back' | 'chest' | 'post' | 'neck' | 'top';

const EMBLEM: Record<string, [number, number][]> = {
  cross: [[9, 15], [10, 15], [8, 16], [9, 16], [10, 16], [11, 16], [9, 17], [10, 17]],
  gem: [[9, 15], [10, 15], [8, 16], [9, 16], [10, 16], [11, 16], [9, 17], [10, 17]],
  bolt: [[10, 15], [11, 15], [9, 16], [10, 16], [8, 17], [9, 17]],
  star: [[9, 15], [10, 15], [8, 16], [9, 16], [10, 16], [11, 16], [8, 17], [11, 17]],
};

function drawDetails(f: Ctx, phase: Phase) {
  const { c, o, view, step, bob: b } = f;
  const s = step;
  for (const d of o.details ?? []) {
    switch (d.kind) {
      case 'emblem': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          px(c, EMBLEM[d.shape], d.color);
          if (d.hi) c.set(9, 15, d.hi);
          if (d.edge) px(c, [[10, 17], [11, 16]], d.edge);
        } else if (view === 'side') {
          px(c, [[11, 15], [12, 15], [11, 16], [12, 16]], d.color);
          if (d.hi) c.set(11, 15, d.hi);
        }
        break;
      }
      case 'strap': {
        if (phase !== 'chest') break;
        const lines: [number, number][][] = [];
        const diag = (flip: boolean) => {
          const out: [number, number][] = [];
          for (let i = 0; i <= 3; i++) {
            const a = flip ? 13 - i : 6 + i;
            const bb = flip ? 12 - i : 7 + i;
            out.push([a, 14 + i], [bb, 14 + i]);
          }
          return out;
        };
        if (view === 'down') {
          lines.push(diag(false));
          if (d.cross) lines.push(diag(true));
        } else if (view === 'up') {
          lines.push(diag(true));
          if (d.cross) lines.push(diag(false));
        } else lines.push([[11, 14], [12, 14], [11, 15], [10, 16], [11, 16], [10, 17], [9, 17]]);
        for (const ln of lines) {
          ln.forEach(([x, y], i) => c.set(x, y, i % 2 ? darken(hexOf(d.color), 0.25) : d.color));
          if (d.buckle && view !== 'side') px(c, [ln[4], ln[5]], d.buckle);
          // HD: ตะเข็บเย็บบนสาย (จุดสว่างเว้นระยะ)
          if (c.res > 1) ln.forEach(([x, y], i) => i % 2 === 0 && !(d.buckle && (i === 4 || i === 5)) && c.hset(x * 2 + 1, y * 2, lighten(hexOf(d.color), 0.35)));
          if (c.res > 1 && d.buckle && view !== 'side') hdStud(c, ln[4][0], ln[4][1], d.buckle);
        }
        break;
      }
      case 'buttons': {
        if (phase !== 'chest') break;
        const pts: [number, number][] = view === 'down' ? (d.double ? [[8, 15], [8, 17], [11, 15], [11, 17]] : [[9, 15], [9, 17]]) : view === 'side' ? [[12, 15], [12, 17]] : [];
        px(c, pts, d.color);
        if (c.res > 1) for (const [x, y] of pts) hdStud(c, x, y, d.color);
        break;
      }
      case 'zip': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          for (let y = 14; y <= 17; y++) c.set(9, y, d.color);
          c.set(9, 15, d.pull);
          if (c.res > 1) {
            // HD: ฟันซิปสลับซ้ายขวา + หัวซิปมีรู
            for (let Y = 28; Y <= 35; Y++) if (Y < 30 || Y > 31) c.hset(18 + (Y % 2), Y, o.top.l);
            c.hset(18, 30, lighten(hexOf(d.pull), 0.5));
            c.hset(19, 31, darken(hexOf(d.pull), 0.4));
          }
        } else if (view === 'side') for (let y = 14; y <= 17; y++) c.set(12, y, d.color);
        break;
      }
      case 'lapel': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          px(c, [[8, 14], [9, 14], [10, 14], [11, 14], [9, 15], [10, 15]], d.color);
          px(c, [[8, 15], [11, 15]], o.coat?.mat.d ?? 'L');
        } else if (view === 'side') px(c, [[12, 14], [12, 15]], d.color);
        break;
      }
      case 'bikini': {
        // ชุดว่ายน้ำสองชิ้น: บราสามเหลี่ยม 2 ถ้วย (เว้นร่องกลางเป็นผิว ให้ดูอกอิ่ม) + กางเกงบิกินี่สะโพก
        if (phase !== 'chest') break;
        const col = hexOf(d.color);
        const bik: Mat = { d: darken(col, 0.38), m: col, l: lighten(col, 0.26) };
        if (view === 'down') {
          // ถ้วยบราซ้าย/ขวา (เว้น x9,10 เป็นผิว = ร่องอก)
          shade(c, new Mask().span(14, 6, 8).span(15, 6, 8).add(7, 16), bik, true);
          shade(c, new Mask().span(14, 11, 13).span(15, 11, 13).add(12, 16), bik, true);
          // สายคล้องคอ + สายบ่า + ปมกลาง
          px(c, [[7, 13], [12, 13]], bik.m);
          px(c, [[9, 14], [10, 14]], d.trim);
          // กางเกงบิกินี่ (เอว/สะโพก) เว้นช่องขากลาง
          shade(c, new Mask().span(18, 6, 13).add(6, 19).add(7, 19).add(12, 19).add(13, 19), bik, true);
          px(c, [[6, 18], [13, 18]], d.trim);
        } else if (view === 'up') {
          // ด้านหลัง: สายบราคาด + สายกางเกง
          shade(c, new Mask().span(15, 6, 13), bik, true);
          px(c, [[9, 15], [10, 15]], d.trim);
          px(c, [[6, 14], [13, 14]], bik.m);
          shade(c, new Mask().span(18, 6, 13), bik, true);
          px(c, [[6, 18], [13, 18]], d.trim);
        } else {
          // ด้านข้าง
          shade(c, new Mask().span(14, 8, 11).span(15, 9, 11), bik, true);
          px(c, [[10, 13]], bik.m);
          shade(c, new Mask().span(18, 7, 12).add(7, 19).add(12, 19), bik, true);
        }
        break;
      }
      case 'plates': {
        if (phase !== 'chest') break;
        const seam: [number, number][] = [];
        const x0 = view === 'side' ? 7 : 6;
        const x1 = view === 'side' ? 12 : 13;
        for (let x = x0; x <= x1; x++) seam.push([x, 16]);
        onMat(c, seam, o.top, d.seam);
        if (d.ridge && view === 'down') onMat(c, [[9, 14], [9, 15], [9, 17]], o.top, d.ridge);
        if (d.ridge && view !== 'side') onMat(c, [[8, 19], [11, 19]], o.legs, d.ridge);
        if (c.res > 1) {
          // HD: รอยต่อแผ่นเกราะบาง 1 พิกเซล + ขอบมุมรับแสงใต้รอยต่อ + หมุดย้ำ
          const row: [number, number][] = [];
          for (let X = x0 * 2; X <= x1 * 2 + 1; X++) row.push([X, 33]);
          for (const [X, Y] of row) {
            const p = c.hget(X, Y);
            if (p === hexOf(d.seam) || p === d.seam) c.hset(X, Y, o.top.l);
          }
          const rivet = d.ridge ? hexOf(d.ridge) : lighten(hexOf(o.top.l), 0.4);
          hOn(c, view === 'side' ? [[x1 * 2, 30]] : [[x0 * 2 + 1, 30], [x1 * 2, 30], [x0 * 2 + 1, 35], [x1 * 2, 35]], o.top, rivet);
        }
        break;
      }
      case 'zigzag': {
        if (phase !== 'chest') break;
        const pts: [number, number][] = [];
        const x0 = view === 'side' ? 7 : 6;
        const x1 = view === 'side' ? 12 : 13;
        for (let x = x0; x <= x1; x++) pts.push([x, x % 2 === 0 ? 17 : 16]);
        onMat(c, pts, o.top, d.color);
        break;
      }
      case 'glow': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          onMat(c, [[7, 15], [7, 16], [12, 15], [12, 16], [8, 17], [11, 17]], o.top, d.color);
          onMat(c, [[9, 16], [10, 16]], o.top, d.core);
          onMat(c, [[8, 19], [11, 19], [8, 20], [11, 20]], o.legs, d.color);
          if (c.res > 1) {
            c.hset(19, 32, 'W');
            c.hset(20, 32, lighten(hexOf(d.core), 0.5));
          }
        } else if (view === 'up') {
          onMat(c, [[9, 15], [10, 15], [9, 17], [10, 17], [7, 15], [12, 15]], o.top, d.color);
          onMat(c, [[9, 16], [10, 16]], o.top, d.core);
          onMat(c, [[8, 19], [11, 19]], o.legs, d.color);
        } else {
          onMat(c, [[8, 15], [8, 16], [8, 17]], o.top, d.color);
          onMat(c, [[11, 16], [12, 16]], o.top, d.core);
          onMat(c, [[s ? 11 : 10, 20]], o.legs, d.color);
        }
        break;
      }
      case 'panel': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          for (let y = 15; y <= 17; y++) for (let x = 8; x <= 11; x++) c.set(x, y, d.base);
          px(c, [[8, 15]], d.lights[0]);
          px(c, [[10, 15]], d.lights[1 % d.lights.length]);
          px(c, [[11, 15]], d.lights[2 % d.lights.length]);
          px(c, [[8, 17], [10, 17]], 'D');
          if (c.res > 1) {
            // HD: ไฟแผงมีประกาย + ร่องระบายอากาศ
            for (const x of [8, 10, 11]) c.hset(x * 2, 30, 'W');
            for (let X = 16; X <= 23; X++) if (X % 2 === 0) c.hset(X, 33, 'D');
            c.hset(18, 35, 'L');
            c.hset(22, 35, 'L');
          }
        } else if (view === 'up') {
          for (let y = 15; y <= 17; y++) for (let x = 8; x <= 11; x++) c.set(x, y, y % 2 ? 'D' : d.base);
        } else {
          px(c, [[11, 15], [12, 15], [11, 16], [12, 16]], d.base);
          c.set(12, 15, d.lights[0]);
        }
        break;
      }
      case 'overalls': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          shade(c, new Mask().rect(7, 16, 6, 2).rect(6, 18, 8, 1), d.mat);
          px(c, [[7, 14], [7, 15], [12, 14], [12, 15]], d.mat.m);
          px(c, [[7, 16], [12, 16]], d.button);
          if (c.res > 1) {
            hdStud(c, 7, 16, d.button);
            hdStud(c, 12, 16, d.button);
            // กระเป๋าหน้าอก
            hOn(c, [[17, 34], [18, 34], [19, 34], [20, 34], [21, 34], [22, 34]], d.mat, d.mat.d);
          }
        } else if (view === 'up') {
          shade(c, new Mask().rect(6, 16, 8, 3), d.mat);
          px(c, [[7, 14], [8, 15], [12, 14], [11, 15]], d.mat.m);
        } else {
          shade(c, new Mask().rect(10, 16, 3, 2).rect(7, 18, 6, 1), d.mat);
          px(c, [[11, 14], [11, 15]], d.mat.m);
          c.set(11, 16, d.button);
        }
        break;
      }
      case 'tabard': {
        if (phase !== 'chest') break;
        const m = new Mask();
        if (view === 'side') {
          for (let y = 14; y <= 19; y++) m.span(y, 10, 12);
          m.span(20, 10 + s, 12 + s);
        } else {
          for (let y = 14; y <= 19; y++) m.span(y, 7, 12);
          m.span(20, 7 + s, 12 + s);
        }
        shade(c, m, d.mat);
        m.each((x, y) => {
          if (!m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y + 1)) c.set(x, y, d.trim);
        });
        break;
      }
      case 'toolbelt': {
        if (phase !== 'post') break;
        if (view === 'side') {
          shade(c, new Mask().rect(7, 18, 2, 2), d.pouch, true);
          px(c, [[12, 19], [12, 20]], d.tool);
          c.set(13, 19, d.tool);
        } else {
          shade(c, new Mask().rect(5, 18, 2, 2), d.pouch, true);
          shade(c, new Mask().rect(13, 18, 2, 2), d.pouch, true);
          if (view === 'down') {
            px(c, [[15, 18], [15, 19]], d.tool);
            px(c, [[14, 20], [16, 20]], d.tool);
          }
        }
        break;
      }
      case 'necklace': {
        if (phase !== 'post') break;
        if (view === 'down') {
          px(c, [[8, 14], [8, 15], [9, 16], [10, 16], [11, 15], [11, 14]], d.cord);
          px(c, [[9, 17], [10, 17]], d.bead);
          if (d.tooth) px(c, [[8, 16], [11, 16]], d.tooth);
          if (c.res > 1) {
            hdStud(c, 9, 17, d.bead);
            hdStud(c, 10, 17, d.bead);
            if (d.tooth) for (const x of [8, 11]) c.hset(x * 2 + (x === 8 ? 1 : 0), 33, 'L'); // เขี้ยวปลายแหลม
          }
        } else if (view === 'side') {
          px(c, [[11, 14], [12, 15]], d.cord);
          c.set(12, 16, d.bead);
          if (d.tooth) c.set(13, 16, d.tooth);
        }
        break;
      }
      case 'scarf': {
        // ผ้าพันคอใหญ่พันใต้คาง (วาดหลังหัว เลื่อนตาม bob)
        if (phase !== 'neck') break;
        const m = new Mask();
        const tail = new Mask();
        if (view === 'side') {
          m.span(13 + b, 6, 13).span(14 + b, 7, 12);
          if (d.tails) {
            if (s) tail.pts([[6, 13], [5, 13], [4, 14], [5, 14], [3, 14], [2, 15], [3, 15], [1, 15]]);
            else tail.pts([[6, 13], [5, 14], [6, 14], [4, 15], [5, 15], [4, 16], [3, 17]]);
          }
        } else {
          m.span(13 + b, 6, 13).span(14 + b, 5, 14);
          if (d.tails && view === 'down') tail.pts([[12, 15], [13, 15], [13, 16], [14 + s, 16], [14 + s, 17], [15 + s, 18]]);
          if (d.tails && view === 'up') tail.pts([[9, 15], [10, 15], [10, 16], [11, 16], [11 + s, 17], [12 + s, 17], [12 + s, 18], [13 + s, 19]]);
        }
        shade(c, tail, d.mat, true);
        shade(c, m, d.mat, true);
        if (view === 'down' && !d.tails) px(c, [[9, 15 + b], [10, 15 + b]], d.mat.m);
        break;
      }
      case 'fur': {
        if (phase !== 'neck') break;
        const m = new Mask();
        if (view === 'side') m.span(13 + b, 5, 13).span(14 + b, 6, 13).add(7, 15 + b);
        else m.span(13 + b, 5, 6).span(13 + b, 13, 14).span(14 + b, 4, 15).add(6, 15 + b).add(13, 15 + b);
        if (view === 'up') m.span(13 + b, 5, 14);
        shade(c, m, d.mat, true);
        if (c.res > 1) {
          const on = m.hi(c.res);
          for (let i = 0; i < on.length; i++) if (on[i] && dither(i % (W * 2), (i / (W * 2)) | 0) > 0.3) c.hset(i % (W * 2), (i / (W * 2)) | 0, d.mat.d);
        } else m.each((x, y) => dither(x, y) > 0.25 && c.set(x, y, d.mat.d));
        break;
      }
      case 'quiver': {
        if (view === 'down' && phase === 'back') {
          shade(c, new Mask().rect(16, 12, 2, 3), d.mat, true);
          px(c, [[17, 10], [18, 9]], d.fletch);
          px(c, [[16, 10], [18, 10]], d.fletch2);
        } else if (view === 'side' && phase === 'back') {
          shade(c, new Mask().span(15, 3, 4).span(16, 3, 4).span(17, 3, 4).span(18, 4, 5), d.mat, true);
          px(c, [[1, 13], [2, 14]], d.fletch);
          px(c, [[2, 13], [1, 14]], d.fletch2);
        } else if (view === 'up' && phase === 'top') {
          const m = new Mask().pts([[12, 13], [13, 13], [11, 14], [12, 14], [11, 15], [10, 16], [11, 16], [9, 17], [10, 17], [8, 18], [9, 18]]).add(12, 15);
          shade(c, m, d.mat, true);
          px(c, [[13, 11], [14, 12], [12, 12]], d.fletch);
          px(c, [[14, 11], [13, 12]], d.fletch2);
        }
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- ประกอบเฟรม

function skinMat(look: HeroLook): Mat {
  return { d: look.skinShade, m: look.skin, l: lighten(hexOf(look.skin), 0.22) };
}

const isShadow = (p: string | null) => !!p && p.startsWith('rgba');

function drawHero(look: HeroLook, view: View, step: number, res: number): PixelCanvas {
  const c = new PixelCanvas(W, H, res);
  const o = outfitById(look.outfit);
  const helm = helmetById(look.helmet);
  const cape = capeById(look.cape);
  const f: Ctx = { c, view, step, bob: step ? 1 : 0, o, look, skin: o.face ?? skinMat(look) };

  drawCape(f, cape, 'back');
  drawDetails(f, 'back');
  drawArms(f, 'far');
  drawLegs(f);
  drawRobe(f);
  drawTorso(f);
  drawDetails(f, 'chest');
  drawBelt(f);
  drawDetails(f, 'post');
  drawCoat(f);
  drawArms(f, 'near');
  drawShoulders(f);
  drawCape(f, cape, 'over');
  drawHead(f);
  drawDetails(f, 'neck');
  drawHair(f, helm.hide === 'all' ? 99 : helm.hide === 'top' ? helm.clearTop ?? 0 : 0);
  drawHelmet(f, helm);
  drawDetails(f, 'top');

  c.outline('O');

  // เงาที่พื้น (เติมเฉพาะช่องว่าง)
  const sh = new PixelCanvas(W, H).shadow(10, 22.6, 5.5, 1.6, 0.3);
  for (let i = 0; i < sh.px.length; i++) if (sh.px[i] && !c.px[i]) c.px[i] = sh.px[i];

  // ประกายโลหะหลังตีขอบ
  // HD: ประกายเป็นจุดคม 2 พิกเซลจริงแนวเฉียง (แทนบล็อกทั้งช่อง)
  const r = c.res;
  const spec = (pts: [number, number][], col: string, allow?: Mat) => {
    for (const [x, y] of pts) {
      const sub: [number, number][] = r > 1 ? [[x * r, y * r + 1], [x * r + 1, y * r]] : [[x, y]];
      for (const [X, Y] of sub) {
        const p = c.hget(X, Y);
        if (!p || p === 'O' || isShadow(p)) continue;
        if (allow && p !== allow.m && p !== allow.l && p !== allow.h) continue;
        c.hset(X, Y, col);
      }
    }
  };
  if (o.spec) {
    spec(view === 'side' ? [[8, 15]] : [[7, 15]], o.spec, o.top);
    if (o.shoulder) spec(view === 'side' ? [[8, 14]] : [[4, 14], [14, 14]], o.spec, o.shoulder);
  }
  if (helm.spec && helm.mat) spec([[6, 3 + f.bob]], helm.spec, helm.mat);
  return c;
}

const FRAMES: [View, number][] = [
  ['down', 0], ['down', 1], ['down', -1],
  ['up', 0], ['up', 1], ['up', -1],
  ['side', 0], ['side', 1], ['side', 0],
];

/** วาดทั้ง 9 เฟรม (ใช้ทำ preview ใน UI ได้ เช่นหน้าจอเลือกชุด) · res = ความละเอียด (ค่าเริ่มต้น HD) */
export function heroFrames(look: HeroLook, res = SPRITE_RES): PixelCanvas[] {
  return FRAMES.map(([v, s]) => drawHero(look, v, s, res));
}

/** เฟรมเดียว (เช่นไอคอนชุดในกระเป๋า ใช้ res 1 = ขนาด 20×24 ที่ UI ไอเทมคาดไว้) */
export function heroFrame(look: HeroLook, index = 0, res = SPRITE_RES): PixelCanvas {
  const [v, st] = FRAMES[index] ?? FRAMES[0];
  return drawHero(look, v, st, res);
}

/** key ที่ไม่ซ้ำตาม look */
export function heroKey(look: HeroLook): string {
  const src = [look.skin, look.skinShade, look.hair, look.hairShade, look.hairStyle, look.eyes, look.outfit, look.helmet, look.cape].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `hero_${(h >>> 0).toString(36)}`;
}

/**
 * สร้าง texture strip ชื่อ key (ถ้ายังไม่มี) — HD: เฟรมละ (HERO_W×HERO_H)×SPRITE_RES แสดงที่ scale 1/SPRITE_RES + anims `${key}_walk_down` [1,0,2,0] 8fps,
 * `${key}_walk_up` [4,3,5,3] 8fps, `${key}_walk_side` [7,6] 6fps (repeat -1). คืน key
 */
export function buildHeroTexture(scene: Phaser.Scene, key: string, look: HeroLook): string {
  if (!scene.textures.exists(key)) {
    const frames = heroFrames(look);
    const fw = frames[0].W;
    const fh = frames[0].H;
    const tex = scene.textures.createCanvas(key, fw * frames.length, fh)!;
    const ctx = tex.getContext();
    frames.forEach((pc, i) => {
      pc.blit(ctx, i * fw, 0);
      tex.add(i, 0, i * fw, 0, fw, fh);
    });
    tex.refresh();
    markHd(tex, frames[0].res);
  }
  const anims = scene.anims;
  const defs: [string, number[], number][] = [
    ['walk_down', [1, 0, 2, 0], 8],
    ['walk_up', [4, 3, 5, 3], 8],
    ['walk_side', [7, 6], 6],
  ];
  for (const [name, frames, frameRate] of defs) {
    const k = `${key}_${name}`;
    if (!anims.exists(k)) anims.create({ key: k, frames: anims.generateFrameNumbers(key, { frames }), frameRate, repeat: -1 });
  }
  return key;
}

/** ค่าเริ่มต้นของแต่ละอาชีพ */
export const CLASS_LOOKS: Record<HeroId, HeroLook> = {
  mechanic: { skin: 'K', skinShade: 'k', hair: '#333c57', hairShade: '#1d1630', hairStyle: 'spiky', eyes: 'U', outfit: 'mechanic', helmet: 'goggles', cape: 'none' },
  medic: { skin: '#f3cfb0', skinShade: 'k', hair: 'Y', hairShade: '#c0752a', hairStyle: 'ponytail', eyes: 'T', outfit: 'medic', helmet: 'nurse_cap', cape: 'none' },
  hunter: { skin: 'k', skinShade: '#9a6248', hair: 'M', hairShade: 'm', hairStyle: 'short', eyes: 'V', outfit: 'hunter', helmet: 'hood', cape: 'none' },
  farmer: { skin: 'K', skinShade: 'k', hair: 'M', hairShade: 'm', hairStyle: 'short', eyes: 'm', outfit: 'farmer', helmet: 'straw_hat', cape: 'none' },
  scout: { skin: '#8d5a3b', skinShade: '#663f2a', hair: '#262b44', hairShade: '#100f1c', hairStyle: 'spiky', eyes: 'O', outfit: 'leather', helmet: 'none', cape: 'red' },
  shaman: { skin: '#c08458', skinShade: '#8a5638', hair: 'L', hairShade: 'D', hairStyle: 'long', eyes: '#1d1630', outfit: 'shaman', helmet: 'feather_band', cape: 'none' },
  robot: { skin: 'L', skinShade: 'D', hair: 'D', hairShade: 'F', hairStyle: 'bald', eyes: 'C', outfit: 'robot', helmet: 'antenna', cape: 'none' },
  lifeguard: { skin: 'K', skinShade: 'k', hair: 'M', hairShade: 'm', hairStyle: 'long', eyes: 'T', outfit: 'bikini', helmet: 'none', cape: 'none' },
};
