import type Phaser from 'phaser';
import { PALETTE } from '../../data/palette';
import { PixelCanvas, dither } from '../PixelCanvas';

// ตัวละครผู้เล่นแบบ paper-doll สไตล์จิบิ: หัวโต (≈60% ของความสูง) ตาอนิเมะ 3×4 ตัวจิ๋ว แขนขาป้อม
// ผิว/ผม/ชุด/หมวก/ผ้าคลุม ประกอบเป็นชั้น ๆ แล้วตีขอบ 'O'
// เฟรม 20×24 — 0-2 หันลง (ยืน, ก้าว A, ก้าว B), 3-5 หันขึ้น, 6-8 ด้านข้างหันขวา (ยืน, ก้าว, ยืน)
// ผม y=1.. หัว y=2..13 (กว้าง 14) ลำตัว y=14..18 ขา y=19..22 เท้าล่างสุด y=22 (ขอบ y=23) แสงมาจากซ้ายบน
// เฟรมก้าว: หัวกระดกลง 1 px (bob) ให้เดินแบบน่ารัก

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
}

const shadeDown = (mt: Mat, col: string) => (col === mt.h ? mt.l : col === mt.l ? mt.m : mt.d);

/**
 * ระบายวัสดุลงพื้นที่ mask: ขอบซ้าย/บน = รับแสง, ขอบขวา/ล่าง = เงา, ใกล้ขอบขวามี dithering
 * soft = ชิ้นเล็ก (แขน มือ) ต้องรับแสงสองด้านถึงจะสว่าง
 */
function shade(c: PixelCanvas, m: Mask, mt: Mat, soft = false) {
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

function px(c: PixelCanvas, list: [number, number][], col: string) {
  for (const [x, y] of list) c.set(x, y, col);
}

/** วาดเฉพาะจุดที่เป็นสีของวัสดุนั้นอยู่แล้ว (เช่นรอยต่อเกราะบนลำตัว ไม่ทับผ้าคลุม/เสื้อทับ) */
function onMat(c: PixelCanvas, list: [number, number][], mt: Mat, col: string) {
  for (const [x, y] of list) {
    const p = c.get(x, y);
    if (p === mt.m || p === mt.l || p === mt.d || p === mt.h) c.set(x, y, col);
  }
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
  opt: { shift?: (y: number) => number; minY?: number; dy?: number } = {},
) {
  const masks: Record<string, Mask> = {};
  const direct: [number, number, string | null][] = [];
  const dy = opt.dy ?? 0;
  rows.forEach((row, y) => {
    if (y < (opt.minY ?? 0)) return;
    const dx = opt.shift ? opt.shift(y) : 0;
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (mats[ch]) (masks[ch] ??= new Mask()).add(x + dx, y + dy);
      else if (ch === '_') direct.push([x + dx, y + dy, null]);
      else if (cols[ch]) direct.push([x + dx, y + dy, cols[ch]]);
    }
  });
  for (const k of Object.keys(masks)) shade(c, masks[k], mats[k]);
  for (const [x, y, col] of direct) c.set(x, y, col);
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
    id: 'robot', name: 'ร่างหุ่นยนต์',
    top: STEEL, sleeve: { d: 'F', m: 'D', l: 'L', pattern: 'stripe' }, hands: STEEL, legs: { d: 'F', m: 'D', l: 'L', pattern: 'stripe' },
    boots: DARK_STEEL, shoulder: STEEL, face: { d: 'D', m: 'L', l: 'w', h: 'W' }, spec: 'W',
    details: [{ kind: 'plates', seam: 'D' }, { kind: 'panel', base: 'F', lights: ['C', 'R', 'Y'] }, { kind: 'glow', color: 'C', core: 'b' }],
  },
];

// ---------------------------------------------------------------- หมวก
// ลายกว้าง 20 แถวเริ่ม y=0 — หัวจิบิอยู่ y=2..13 (กว้างสุด x3..16) ผมฟูเลยหัวออกไป 1px (x2..17, y1)
// ตาโต y=7..10 (ซ้าย x5..7 ขวา x12..14) หน้าโล่ง x4..15

interface HelmetDef {
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

const HELMET_DEFS: HelmetDef[] = [
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

interface CapeDef {
  id: string;
  name: string;
  mat?: Mat;
  clasp: string;
}

const CAPE_DEFS: CapeDef[] = [
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

type HairStyle = 'short' | 'spiky' | 'long' | 'ponytail' | 'bald';
type View = 'down' | 'up' | 'side';

const HAIR: Record<Exclude<HairStyle, 'bald'>, Record<View, string[]>> = {
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

function drawHair(f: Ctx, minY: number) {
  const { c, view, step, look } = f;
  if (look.hairStyle === 'bald') return;
  const rows = HAIR[look.hairStyle]?.[view];
  if (!rows) return;
  const hm: Mat = { d: look.hairShade, m: look.hair, l: lighten(hexOf(look.hair), 0.28), h: lighten(hexOf(look.hair), 0.5) };
  const swayFrom = HAIR_SWAY[look.hairStyle]?.[view];
  const sway = view === 'side' ? -step : step;
  stamp(c, rows, { '1': hm }, { c: hm.l, a: hm.d, e: 'R' }, {
    minY,
    dy: f.bob,
    shift: swayFrom === undefined ? undefined : (y) => (y >= swayFrom ? sway : 0),
  });
}

function drawHelmet(f: Ctx, h: HelmetDef) {
  const rows = f.view === 'side' ? h.side : f.view === 'up' ? h.up ?? h.down : h.down;
  if (!rows.length) return;
  const m1 = h.mat ?? STEEL;
  stamp(f.c, rows, { '1': m1, '2': h.mat2 ?? m1 }, { c: m1.l, a: m1.d, h: m1.h ?? m1.l, ...h.cols }, { dy: f.bob });
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
        }
        break;
      }
      case 'buttons': {
        if (phase !== 'chest') break;
        if (view === 'down') px(c, d.double ? [[8, 15], [8, 17], [11, 15], [11, 17]] : [[9, 15], [9, 17]], d.color);
        else if (view === 'side') px(c, [[12, 15], [12, 17]], d.color);
        break;
      }
      case 'zip': {
        if (phase !== 'chest') break;
        if (view === 'down') {
          for (let y = 14; y <= 17; y++) c.set(9, y, d.color);
          c.set(9, 15, d.pull);
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
      case 'plates': {
        if (phase !== 'chest') break;
        const seam: [number, number][] = [];
        const x0 = view === 'side' ? 7 : 6;
        const x1 = view === 'side' ? 12 : 13;
        for (let x = x0; x <= x1; x++) seam.push([x, 16]);
        onMat(c, seam, o.top, d.seam);
        if (d.ridge && view === 'down') onMat(c, [[9, 14], [9, 15], [9, 17]], o.top, d.ridge);
        if (d.ridge && view !== 'side') onMat(c, [[8, 19], [11, 19]], o.legs, d.ridge);
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
        m.each((x, y) => dither(x, y) > 0.25 && c.set(x, y, d.mat.d));
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

function drawHero(look: HeroLook, view: View, step: number): PixelCanvas {
  const c = new PixelCanvas(W, H);
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
  const spec = (pts: [number, number][], col: string, allow?: Mat) => {
    for (const [x, y] of pts) {
      const p = c.get(x, y);
      if (!p || p === 'O' || isShadow(p)) continue;
      if (allow && p !== allow.m && p !== allow.l && p !== allow.h) continue;
      c.set(x, y, col);
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

/** วาดทั้ง 9 เฟรม (ใช้ทำ preview ใน UI ได้ เช่นหน้าจอเลือกชุด) */
export function heroFrames(look: HeroLook): PixelCanvas[] {
  return FRAMES.map(([v, s]) => drawHero(look, v, s));
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
 * สร้าง texture strip ชื่อ key (ถ้ายังไม่มี) + anims `${key}_walk_down` [1,0,2,0] 8fps,
 * `${key}_walk_up` [4,3,5,3] 8fps, `${key}_walk_side` [7,6] 6fps (repeat -1). คืน key
 */
export function buildHeroTexture(scene: Phaser.Scene, key: string, look: HeroLook): string {
  if (!scene.textures.exists(key)) {
    const frames = heroFrames(look);
    const tex = scene.textures.createCanvas(key, W * frames.length, H)!;
    const ctx = tex.getContext();
    frames.forEach((pc, i) => {
      pc.draw(ctx, i * W, 0);
      tex.add(i, 0, i * W, 0, W, H);
    });
    tex.refresh();
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
export const CLASS_LOOKS: Record<'mechanic' | 'medic' | 'hunter' | 'farmer' | 'scout' | 'shaman' | 'robot', HeroLook> = {
  mechanic: { skin: 'K', skinShade: 'k', hair: '#333c57', hairShade: '#1d1630', hairStyle: 'spiky', eyes: 'U', outfit: 'mechanic', helmet: 'goggles', cape: 'none' },
  medic: { skin: '#f3cfb0', skinShade: 'k', hair: 'Y', hairShade: '#c0752a', hairStyle: 'ponytail', eyes: 'T', outfit: 'medic', helmet: 'nurse_cap', cape: 'none' },
  hunter: { skin: 'k', skinShade: '#9a6248', hair: 'M', hairShade: 'm', hairStyle: 'short', eyes: 'V', outfit: 'hunter', helmet: 'hood', cape: 'none' },
  farmer: { skin: 'K', skinShade: 'k', hair: 'M', hairShade: 'm', hairStyle: 'short', eyes: 'm', outfit: 'farmer', helmet: 'straw_hat', cape: 'none' },
  scout: { skin: '#8d5a3b', skinShade: '#663f2a', hair: '#262b44', hairShade: '#100f1c', hairStyle: 'spiky', eyes: 'O', outfit: 'leather', helmet: 'none', cape: 'red' },
  shaman: { skin: '#c08458', skinShade: '#8a5638', hair: 'L', hairShade: 'D', hairStyle: 'long', eyes: '#1d1630', outfit: 'shaman', helmet: 'feather_band', cape: 'none' },
  robot: { skin: 'L', skinShade: 'D', hair: 'D', hairShade: 'F', hairStyle: 'bald', eyes: 'C', outfit: 'robot', helmet: 'antenna', cape: 'none' },
};
