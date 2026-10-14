import Phaser from 'phaser';
import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

// มอนสเตอร์ + กระสุน: วาดด้วยโค้ดทั้งหมด (ขอบ 'O', แสงจากซ้ายบน, เงาวงรีที่ฐาน)
// ด้านข้างหันขวาเสมอ (เกมจะ flipX เมื่อหันซ้าย)

type View = 'down' | 'up' | 'side';

// ---------------------------------------------------------------- มนุษย์จิบิ 16×18 (ช่องสีเหมือน sprites.ts)
//   1 ผม/หมวก  8 ไฮไลต์ผม  2 ผิว  9 เงาผิว  3 ตา  4 เสื้อ  5 เงาเสื้อ  6 กางเกง  7 รองเท้า  n เข็มขัด  p แก้ม
//   หัวโต 11 แถว (≈60%) กว้าง 12 ตาอนิเมะ 3×3 (ขนตา 'O' + ประกาย 'W') ตัวจิ๋ว 4 แถว ขา 3 แถว
//   ใช้กับ char_* / zombie / rival / merchant / shade / skeleton / mummy / imp

const CH_HEAD_DOWN = [
  '...OOOOOOOOOO...',
  '..O8811111111O..',
  '.O881111111111O.',
  '.O811111111111O.',
  '.O111211112111O.',
  '.O1OOO2222OOO1O.',
  '.O1W332222W331O.',
  '.O233322223339O.',
  '.O2p22222222p9O.',
  '..O2222992229O..',
  '...OO222222OO...',
];
const CH_HEAD_UP = [
  '...OOOOOOOOOO...',
  '..O8811111111O..',
  '.O881111111111O.',
  '.O811111111111O.',
  '.O111111111111O.',
  '.O111111111111O.',
  '.O111111111111O.',
  '.O111111111111O.',
  '.O111111111111O.',
  '..O9111111119O..',
  '...OO922229OO...',
];
const CH_HEAD_SIDE = [
  '...OOOOOOOOOO...',
  '..O8811111111O..',
  '.O881111111111O.',
  '.O811111111111O.',
  '.O111111112221O.',
  '.O1111112OOO22O.',
  '.O1111192W3322O.',
  '.O1111122333p2O.',
  '.O111122222292O.',
  '..O1112222229O..',
  '...OO222222OO...',
];
const CH_BODY_FRONT = [
  '..O2444444442O..',
  '..O2544444452O..',
  '..O9O5nnnn5O9O..',
  '...OO666666OO...',
];
const CH_BODY_BACK = [
  '..O2444444442O..',
  '..O2544444452O..',
  '..O9O555555O9O..',
  '...OO666666OO...',
];
const CH_BODY_SIDE = [
  '.....O4444O.....',
  '.....O4544O.....',
  '.....Onn9nO.....',
  '.....O6666O.....',
];
const CH_LEGS_FRONT = [
  ['....O66OO66O....', '....O77OO77O....', '....OOOOOOOO....'],
  ['....O77OO66O....', '....OOOOO77O....', '........OOOO....'],
  ['....O66OO77O....', '....O77OOOOO....', '....OOOO........'],
];
const CH_LEGS_SIDE = [
  ['.....O6666O.....', '.....O7777O.....', '.....OOOOOO.....'],
  ['....O66OO66O....', '...O77O..O77O...', '...OOOO..OOOO...'],
];

/** เฟรมมนุษย์จิบิ: down/up/side × [ยืน, ก้าว A, ก้าว B] (แทน HUMANOID เดิมใน sprites.ts) */
export const CHIBI_HUMANOID: Record<View, string[][]> = {
  down: CH_LEGS_FRONT.map((legs) => [...CH_HEAD_DOWN, ...CH_BODY_FRONT, ...legs]),
  up: CH_LEGS_FRONT.map((legs) => [...CH_HEAD_UP, ...CH_BODY_BACK, ...legs]),
  side: [0, 1, 0].map((i) => [...CH_HEAD_SIDE, ...CH_BODY_SIDE, ...CH_LEGS_SIDE[i]]),
};

/**
 * ตาโตแบบอนิเมะ w×h: แถวบน = ขนตา 'O', ประกายใหญ่ 'W' ซ้ายบน, ประกายจิ๋วขวาล่าง (ถ้าสูง ≥4)
 * angry = คิ้วขมวด (1 = เฉียงลงไปทางขวา, -1 = ไปทางซ้าย) สำหรับบอส/ตัวดุ
 */
export function bigEye(c: PixelCanvas, x: number, y: number, iris = 'O', w = 3, h = 3, angry = 0) {
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, j === 0 ? 'O' : iris);
  c.set(x, y + 1, 'W');
  if (w >= 3 && h >= 4) c.set(x + 1, y + 1, 'W');
  if (h >= 4) c.set(x + w - 1, y + h - 1, 'W');
  else if (iris !== 'O' && w >= 3) c.set(x + 1, y + h - 1, 'O');
  if (angry > 0) for (const [dx, dy] of [[-1, -2], [0, -2], [1, -1], [2, -1]]) c.set(x + dx, y + dy, 'O');
  else if (angry < 0) for (const [dx, dy] of [[w, -2], [w - 1, -2], [w - 2, -1], [w - 3, -1]]) c.set(x + dx, y + dy, 'O');
}

export function cuteEye(c: PixelCanvas, x: number, y: number, iris = 'O', tall = 2) {
  for (let j = 0; j < tall; j++) {
    c.set(x, y + j, iris);
    c.set(x + 1, y + j, iris);
  }
  c.set(x, y, 'W');
}

export const isShadow = (p: string | null) => !!p && p.startsWith('rgba');
const solidAt = (c: PixelCanvas, x: number, y: number) => {
  const p = c.get(x, y);
  return !!p && !isShadow(p);
};

/** เงาที่พื้น: เติมเฉพาะช่องว่าง (เรียกหลัง outline) */
export function groundShadow(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, a = 0.28) {
  const s = new PixelCanvas(c.w, c.h).shadow(cx, cy, rx, ry, a);
  for (let i = 0; i < s.px.length; i++) if (s.px[i] && !c.px[i]) c.px[i] = s.px[i];
}

/** แรเงาแบบขอบ: ขอบซ้าย/บน = สว่าง, ขอบขวา/ล่าง = มืด (สำหรับรูปทรงท่อ) */
export function shadeEdges(c: PixelCanvas, base: string, light: string, dark: string) {
  const ops: [number, number, string][] = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (c.get(x, y) !== base) continue;
      if (!solidAt(c, x - 1, y) || !solidAt(c, x, y - 1)) ops.push([x, y, light]);
      else if (!solidAt(c, x + 1, y) || !solidAt(c, x, y + 1) || (!solidAt(c, x + 1, y + 1) && dither(x, y) > 0)) ops.push([x, y, dark]);
    }
  }
  for (const [x, y, col] of ops) c.set(x, y, col);
}

/** ตีขอบ 'O' รอบจุดที่ระบุ (เฉพาะช่องว่าง) — ใช้กับของที่แปะเพิ่มบน sprite ที่มีขอบแล้ว */
export function outlineAround(c: PixelCanvas, pts: [number, number][]) {
  for (const [x, y] of pts) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!solidAt(c, x + dx, y + dy) && x + dx >= 0 && y + dy >= 0 && x + dx < c.w && y + dy < c.h) c.set(x + dx, y + dy, 'O');
    }
  }
}

export function paint(c: PixelCanvas, pts: [number, number, string][]) {
  for (const [x, y, col] of pts) c.set(x, y, col);
  outlineAround(c, pts.map(([x, y]) => [x, y] as [number, number]));
}

/** วาดชิ้นส่วนบนผ้าใบแยก ตีขอบ แล้วแปะทับ — ให้แขน/หัว/ก้ามแยกจากลำตัวชัดเจน */
export function part(c: PixelCanvas, draw: (p: PixelCanvas) => void) {
  const p = new PixelCanvas(c.w, c.h);
  draw(p);
  p.outline();
  for (let i = 0; i < p.px.length; i++) if (p.px[i]) c.px[i] = p.px[i];
}

/** ลบพิกเซลทึบตั้งแต่แถว y ลงไป */
export function clearFrom(c: PixelCanvas, y0: number) {
  for (let y = y0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (solidAt(c, x, y)) c.set(x, y, null);
}

// ---------------------------------------------------------------- texture helpers

export function strip(scene: Phaser.Scene, key: string, frames: PixelCanvas[]) {
  if (scene.textures.exists(key)) return;
  const w = frames[0].w;
  const h = frames[0].h;
  const tex = scene.textures.createCanvas(key, w * frames.length, h)!;
  frames.forEach((pc, i) => {
    pc.draw(tex.getContext(), i * w, 0);
    tex.add(i, 0, i * w, 0, w, h);
  });
  tex.refresh();
}

export function anim(scene: Phaser.Scene, key: string, tex: string, frames: number[], frameRate: number) {
  if (scene.anims.exists(key)) return;
  scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(tex, { frames }), frameRate, repeat: -1 });
}

function humanoidMonster(
  scene: Phaser.Scene,
  key: string,
  colors: Record<string, string>,
  overlay?: (c: PixelCanvas, view: View, frame: number) => void,
) {
  const frames: PixelCanvas[] = [];
  for (const v of ['down', 'up', 'side'] as View[]) {
    CHIBI_HUMANOID[v].forEach((rows, i) => {
      const c = new PixelCanvas(16, 18).rows(rows, 0, 0, colors);
      overlay?.(c, v, i);
      frames.push(c);
    });
  }
  strip(scene, key, frames);
  anim(scene, `${key}_walk_down`, key, [1, 0, 2, 0], 8);
  anim(scene, `${key}_walk_up`, key, [4, 3, 5, 3], 8);
  anim(scene, `${key}_walk_side`, key, [7, 6], 6);
}

// ---------------------------------------------------------------- monsters

/** สไลม์ 16×14 (ปกติ / ยุบตัว) */
function slime(squash: boolean): PixelCanvas {
  const c = new PixelCanvas(16, 14);
  const rng = new RNG(101);
  const rx = squash ? 6.8 : 5.8;
  const ry = squash ? 3.6 : 4.8;
  const cy = 11.5 - ry + 1.2;
  c.blob(8, cy, rx, ry, ['T', 'G', 'g']);
  clearFrom(c, 12);
  // แกนใสด้านใน + ฟองอากาศ
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 16; x++) {
      if (c.get(x, y) === 'G' && y > cy + 1 && Math.abs(x + 0.5 - 8) < rx * 0.5 && dither(x, y) > 0.1) c.set(x, y, 'H');
    }
  }
  for (let i = 0; i < 3; i++) {
    const x = rng.int(5, 11);
    const y = Math.round(cy + rng.range(0.5, ry - 1.5));
    if (c.get(x, y)) c.set(x, y, 'g');
  }
  // ขอบล่างสะท้อนแสง
  for (let x = 0; x < 16; x++) if (c.get(x, 11) && c.get(x - 1, 11) && c.get(x + 1, 11)) c.set(x, 11, x % 2 ? 'T' : 'H');
  // ไฮไลต์มันวาว
  const hx = Math.round(8 - rx * 0.5);
  const hy = Math.round(cy - ry * 0.55);
  c.set(hx, hy, 'W');
  c.set(hx + 1, hy, 'W');
  c.set(hx - 1, hy + 1, 'W');
  c.set(hx, hy + 1, 'g');
  // ตาโต 2×3 + ปากยิ้ม + แก้ม (จิบิ)
  const ey = Math.round(cy) - 2;
  bigEye(c, 4, ey, 'O', 3, squash ? 3 : 4);
  bigEye(c, 9, ey, 'O', 3, squash ? 3 : 4);
  c.set(7, ey + 3, 'O');
  c.set(8, ey + 3, 'O');
  c.set(3, ey + 3, 'y');
  c.set(12, ey + 3, 'y');
  c.outline();
  groundShadow(c, 8, 12.6, squash ? 7.5 : 6.5, 1.4);
  return c;
}

/** ค้างคาว 16×12 (ปีกขึ้น / ลง) */
function bat(up: boolean): PixelCanvas {
  const c = new PixelCanvas(16, 12);
  const oy = up ? 0 : 1;
  const tipY = up ? 1 : 7;
  const shY = 4 + oy;
  for (const s of [0, 1]) {
    const X = (x: number) => (s ? 15 - x : x);
    for (let x = 1; x <= 6; x++) {
      const t = (x - 1) / 5;
      const top = Math.round(tipY + (shY - tipY) * t);
      const depth = Math.round(1 + t * (up ? 3 : 2)) - (x % 2 === 0 ? 1 : 0);
      for (let y = top; y <= top + depth; y++) {
        c.set(X(x), y, y === top ? 'U' : dither(x, y) > 0.3 ? 'U' : 'P');
      }
    }
    // นิ้วปีก
    c.set(X(3), Math.round(tipY + (shY - tipY) * 0.4) + 1, 'U');
    c.set(X(1), tipY - 1 < 0 ? 0 : tipY, 'F');
  }
  // หัวโตกลม (จิบิ)
  c.blob(8, 5.5 + oy, 3.8, 3.4, ['U', 'P', 'u']);
  // หู
  for (const x of [5, 10]) {
    c.set(x, 1 + oy, 'U');
    c.set(x, 2 + oy, 'P');
  }
  // ตาแดงโต เขี้ยว เท้า
  bigEye(c, 5, 4 + oy, 'r', 3, 3, 1);
  bigEye(c, 8, 4 + oy, 'r', 3, 3, -1);
  c.set(7, 7 + oy, 'U');
  c.set(8, 7 + oy, 'U');
  c.set(6, 8 + oy, 'W');
  c.set(9, 8 + oy, 'W');
  c.set(6, 9 + oy, 'F');
  c.set(9, 9 + oy, 'F');
  c.outline();
  groundShadow(c, 8, 11.2, 3, 0.7, 0.16);
  return c;
}

/** ปู 18×14 (ขาสลับ) */
function crab(f: number): PixelCanvas {
  const c = new PixelCanvas(18, 14);
  const shell = ['R', 'r', 'Y', 'y'];
  const M = (x: number) => 17 - x;
  // ขา 2 คู่ต่อข้าง (ก้าวสลับ)
  for (let i = 0; i < 2; i++) {
    const off = (i + f) % 2;
    for (const s of [0, 1]) {
      const X = (x: number) => (s ? M(x) : x);
      const ky = 8.4 + i * 0.8 - off;
      c.line(X(5), 9 + i, X(3 - i * 1.6), ky, 'R');
      c.line(X(3 - i * 1.6), ky, X(2.4 - i * 1.4 + off * 0.5), 12, 'R');
      c.set(X(2.4 - i * 1.4 + off * 0.5), 12, 'P');
    }
  }
  // ก้ามใหญ่ (ยกสลับ)
  for (const s of [0, 1]) {
    const X = (x: number) => (s ? M(x) : x);
    const cy = 3.6 + (s === f ? 0 : 1);
    part(c, (p) => {
      p.line(X(5), 7, X(3), cy + 1.5, 'R');
      p.line(X(4), 7, X(3), cy + 1.5, 'R');
      p.blob(s ? 15.5 : 2.5, cy, 1.9, 2, shell);
      const top = Math.round(cy - 2);
      p.set(X(2), top, null);
      p.set(X(2), top + 1, null);
    });
  }
  // ก้านตาโต 3×3 (จิบิ)
  part(c, (p) => {
    for (const x of [6, 11]) {
      p.set(x + 1, 4, 'r');
      p.set(x + 1, 5, 'r');
      p.rect(x - 1, 0, 4, 4, 'W');
      p.rect(x, 1, 2, 3, 'O');
      p.set(x, 1, 'W');
      p.set(x + 1, 3, 'L');
    }
  });
  // กระดอง
  part(c, (p) => {
    p.blob(9, 9, 5.2, 2.9, shell);
    for (let x = 4; x <= 13; x++) if (p.get(x, 11) && dither(x, 11) > -0.3) p.set(x, 11, 'R');
    p.set(6, 7, 'y');
    p.set(11, 7, 'Y');
    p.set(12, 9, 'Y');
    p.set(8, 9, 'O');
    p.set(9, 9, 'O');
    p.set(8, 10, 'R');
    p.set(9, 10, 'R');
    p.set(6, 9, 'p');
    p.set(11, 9, 'p');
  });
  c.outline();
  groundShadow(c, 9, 12.7, 8, 1.3);
  return c;
}

/** งูทะเล 22×20 โผล่จากน้ำ (มีวงคลื่นแทนเงา) */
function serpent(f: number): PixelCanvas {
  const c = new PixelCanvas(22, 20);
  const sx = f ? 1 : 0;
  const WL = 16; // ระดับน้ำ
  // ขดหลังซ้าย
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.15) c.ellipse(4 + 2.6 * Math.cos(a), 16 + 2.6 * Math.sin(a), 1.5, 1.5, 'T');
  // ขดหาง ขวา
  for (let a = Math.PI; a <= Math.PI * 2 + 0.01; a += 0.2) c.ellipse(17.5 + 1.8 * Math.cos(a), 16.5 + 2 * Math.sin(a), 1.2, 1.2, 'T');
  // คอ (bezier)
  const P = [[9, 17], [6 - sx, 9], [12 + sx, 5]];
  const curve: [number, number, number][] = [];
  for (let t = 0; t <= 1.001; t += 0.05) {
    const x = (1 - t) ** 2 * P[0][0] + 2 * (1 - t) * t * P[1][0] + t * t * P[2][0];
    const y = (1 - t) ** 2 * P[0][1] + 2 * (1 - t) * t * P[1][1] + t * t * P[2][1];
    const r = 2.6 - t * 0.6;
    curve.push([x, y, r]);
    c.ellipse(x, y, r, r, 'T');
  }
  // หัวโต + จมูก (จิบิ)
  c.ellipse(13 + sx, 5, 4.2, 3.4, 'T');
  c.ellipse(17.5 + sx, 6.5, 2.4, 1.6, 'T');
  clearFrom(c, WL);
  // ท้องเกล็ด (ด้านหน้าคอ)
  curve.forEach(([x, y, r], i) => {
    if (i < 4 || i > 17) return;
    const px = Math.round(x + r - 1.2);
    const py = Math.round(y);
    if (c.get(px, py) === 'T') c.set(px, py, i % 2 ? 'S' : 's');
  });
  shadeEdges(c, 'T', 'b', 'U');
  // ลายจุดบนหลัง
  for (const [i, col] of [[6, 'C'], [10, 'C'], [14, 'b']] as [number, string][]) {
    const [x, y] = curve[i];
    if (c.get(Math.round(x - 0.5), Math.round(y))) c.set(Math.round(x - 0.5), Math.round(y), col);
  }
  // ครีบหลังคอ
  for (let i = 5; i <= 15; i += 3) {
    const [x, y, r] = curve[i];
    c.line(x - r + 0.3, y, x - r - 1.3, y - 1.2, i % 2 ? 'C' : 'b');
  }
  // หงอนหัว
  for (let k = 0; k < 3; k++) {
    const bx = 10 + sx + k * 1.6;
    c.line(bx, 2, bx - 1, k === 1 ? 0 : 1, k === 1 ? 'C' : 'b');
  }
  // ตาโต ปาก เขี้ยว
  bigEye(c, 13 + sx, 2, 'Y', 3, 3, 1);
  c.set(19 + sx, 5, 'U');
  for (let x = 15; x <= 19; x++) c.set(x + sx, 6, 'O');
  c.set(16 + sx, 7, 'W');
  c.set(18 + sx, 7, 'W');
  c.outline();
  // น้ำ + วงคลื่น
  const rx = 9.3 + f * 0.5;
  const ry = 2.5;
  const rng = new RNG(210 + f * 7);
  for (let y = 12; y < 20; y++) {
    for (let x = 0; x < 22; x++) {
      const nx = (x + 0.5 - 11) / rx;
      const ny = (y + 0.5 - 16.8) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      const p = c.get(x, y);
      const free = !p || isShadow(p);
      const front = y + 0.5 >= 16.8;
      if (d > 0.8) {
        if (front || free) c.set(x, y, dither(x, y) > 0.2 ? 'C' : 'b');
      } else if (Math.abs(d - (0.5 + f * 0.06)) < 0.07 && front && free) {
        c.set(x, y, 'C');
      } else if (free) {
        c.set(x, y, 'rgba(65,166,246,0.35)');
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    c.set(11 + Math.cos(a) * rx * 0.9, 16.8 + Math.sin(a) * ry * 0.9, 'W');
  }
  return c;
}

/** โกเลมหิน 24×26 (ย่ำเท้า) */
function golem(f: number): PixelCanvas {
  const c = new PixelCanvas(24, 26);
  const rng = new RNG(500);
  const stone = ['F', 'D', 'L'];
  const bob = f;
  // ขา (ยกสลับ)
  for (const s of [0, 1]) part(c, (p) => p.blob(s ? 16 : 8, 21 - (s === f ? 1 : 0), 2.8, 2.6, stone));
  // ลำตัว
  part(c, (p) => {
    p.blob(12, 15 + bob, 5.8, 4.6, stone, rng, 0.2);
    p.line(9, 11 + bob, 11, 14 + bob, 'F');
    p.line(11, 14 + bob, 10, 17 + bob, 'F');
    p.line(15, 15 + bob, 16, 17 + bob, 'F');
    // แกนเรืองแสงกลางอก
    p.set(13, 16 + bob, 'W');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.set(13 + dx, 16 + bob + dy, 'C');
  });
  // หัวโต + ตาเรืองฟ้าโต (จิบิ)
  part(c, (p) => {
    p.blob(12, 7 + bob, 6.4, 5.4, ['F', 'D', 'L', 'W'], rng, 0.12);
    bigEye(p, 8, 6 + bob, 'C', 3, 4, 1);
    bigEye(p, 13, 6 + bob, 'C', 3, 4, -1);
    p.set(11, 11 + bob, 'F');
    p.set(12, 11 + bob, 'F');
  });
  // ไหล่ + กำปั้นใหญ่ (แกว่งสลับกับขา)
  for (const s of [0, 1]) {
    const sx = s ? 19 : 5;
    const fx = s ? 20 : 4;
    const sw = s === f ? 0 : 1;
    part(c, (p) => {
      p.line(sx, 14 + bob, fx, 17 + bob, 'D', 2);
      p.blob(sx, 13.5 + bob, 2.4, 2.4, stone, rng, 0.2);
    });
    part(c, (p) => {
      p.blob(fx, 18.5 + bob + sw, 2.6, 2.6, stone);
      for (const ky of [17.5, 19.5]) p.set(fx + (s ? -1 : 1), ky + bob + sw, 'F');
      p.set(fx + (s ? -2 : 2), 18.5 + bob + sw, 'F');
    });
  }
  // มอสบนผิวด้านบน
  for (let y = 1; y < 19 + bob; y++) {
    for (let x = 0; x < 24; x++) {
      const p = c.get(x, y);
      const above = c.get(x, y - 1);
      if ((p === 'D' || p === 'L' || p === 'W') && (!above || above === 'O') && rng.chance(0.5)) {
        c.set(x, y, rng.chance(0.4) ? 'g' : 'G');
        if (rng.chance(0.5) && c.get(x, y + 1) && c.get(x, y + 1) !== 'O' && c.get(x, y + 1) !== 'C') c.set(x, y + 1, 'H');
      }
    }
  }
  c.outline();
  groundShadow(c, 12, 24.6, 10, 1.6, 0.32);
  return c;
}

/** เยติ 20×22 (ขนฟู) */
function yeti(f: number): PixelCanvas {
  const c = new PixelCanvas(20, 22);
  const rng = new RNG(620);
  const fur = ['L', 'w', 'W', 'W'];
  const bob = f;
  // เท้า
  for (const s of [0, 1]) part(c, (p) => p.blob(s ? 13 : 7, 18.6 - (s === f ? 1 : 0), 2.4, 1.6, ['D', 'L', 'w']));
  // ตัว + หัว
  part(c, (p) => {
    p.blob(10, 14 + bob, 5, 4.4, fur, rng, 0.35);
    p.blob(10, 7 + bob, 6.4, 5.6, fur, rng, 0.3);
    p.set(8, 2 + bob, 'W');
    p.set(10, 1 + bob, 'W');
    p.set(10, 2 + bob, 'W');
    p.set(12, 2 + bob, 'w');
    for (let i = 0; i < 40; i++) {
      const x = rng.int(4, 15);
      const y = rng.int(3, 17) + bob;
      const px = p.get(x, y);
      if ((px === 'W' || px === 'w') && p.get(x, y + 1) && dither(x, y) > -0.2) {
        p.set(x, y, 'L');
        if (rng.chance(0.4)) p.set(x, y + 1, 'w');
      }
    }
    // หน้าเทาฟ้ากลม ตาโต เขี้ยวเล็ก (จิบิ)
    p.ellipse(10, 8.6 + bob, 4.4, 3, 'D');
    bigEye(p, 6, 6 + bob, 'B', 3, 4, 1);
    bigEye(p, 11, 6 + bob, 'B', 3, 4, -1);
    p.set(9, 10 + bob, 'F');
    p.set(10, 10 + bob, 'F');
    p.set(8, 11 + bob, 'W');
    p.set(11, 11 + bob, 'W');
  });
  // แขนยาว + มือ
  for (const s of [0, 1]) {
    const ax = s ? 16 : 4;
    const sw = s === f ? 1 : 0;
    part(c, (p) => {
      p.blob(ax, 13 + bob, 2.1, 3.8, fur, rng, 0.3);
      p.blob(ax, 16.4 + bob + sw, 1.6, 1.3, ['D', 'L', 'L']);
      p.set(ax + (s ? -1 : 1), 10 + bob, 'L');
    });
  }
  c.outline();
  groundShadow(c, 10, 20.4, 7, 1.4, 0.3);
  return c;
}

/** จอมมาร (บอส) 32×36 */
function demonLord(f: number): PixelCanvas {
  const c = new PixelCanvas(32, 36);
  const bob = f;
  const flap = f ? 2 : 0;
  const skin = ['P', 'R', 'R', 'r'];
  const M = (x: number) => 31 - x;
  // ปีกค้างคาวกางด้านหลัง
  const tipY = 1 + flap;
  const elX = 6;
  const elY = 5 + bob + flap * 0.5;
  const shX = 12;
  const shY = 14 + bob;
  const topAt = (x: number) =>
    x <= elX ? tipY + (elY - tipY) * ((x - 1) / (elX - 1)) : elY + (shY - elY) * ((x - elX) / (shX - elX));
  const botAt = (x: number) =>
    tipY + 4 + (24 + bob - tipY - 4) * ((x - 1) / (shX - 1)) - 3.5 * Math.sin(((x - 1) / 3.67) * Math.PI) ** 2;
  for (const s of [0, 1]) {
    const X = (x: number) => (s ? M(x) : x);
    for (let x = 1; x <= shX; x++) {
      const top = Math.round(topAt(x));
      const bot = Math.round(botAt(x));
      for (let y = top; y <= bot; y++) {
        const v = (y - top) / Math.max(1, bot - top) + dither(x, y) * 0.45;
        c.set(X(x), y, y === top ? 'F' : v < 0.3 ? 'R' : v < 0.85 ? 'P' : 'U');
      }
    }
    for (const fx of [1, 4.67, 8.33]) c.line(X(elX), elY, X(fx), botAt(Math.round(fx)), 'F');
    c.set(X(elX), elY - 1, 'L');
    c.set(X(1), tipY - 1, 'W');
  }
  // ผ้าคลุม
  part(c, (p) => {
    for (let y = 13 + bob; y <= 32; y++) {
      const k = (y - 13 - bob) / (19 - bob);
      const left = Math.ceil(15.5 - (4.5 + k * 5.5));
      const right = 31 - left;
      for (let x = left; x <= right; x++) {
        if (y >= 31 && (x + f) % 3 === 0) continue;
        p.set(x, y, x === left || x === right ? 'R' : x === left + 2 || x === right - 2 ? 'U' : 'P');
      }
    }
  });
  // ขา + กีบ
  for (const s of [0, 1]) {
    part(c, (p) => {
      p.blob(s ? 18.8 : 13.2, 28, 2, 3.6, ['U', 'P', 'R']);
      p.rect(s ? 17 : 11, 31, 4, 2, 'F');
      p.set(s ? 17 : 11, 31, 'D');
    });
  }
  // ลำตัว
  part(c, (p) => {
    p.blob(16, 19 + bob, 5, 5.6, skin);
    for (const x of [12, 13, 14, 17, 18, 19]) p.set(x, 17 + bob, 'P');
    for (const y of [20, 22]) {
      p.set(14, y + bob, 'P');
      p.set(17, y + bob, 'P');
    }
    for (let x = 11; x <= 20; x++) if (p.get(x, 24 + bob)) p.set(x, 24 + bob, 'F');
    p.set(15, 24 + bob, 'Y');
    p.set(16, 24 + bob, 'Y');
  });
  // แขน กรงเล็บ เกราะไหล่
  for (const s of [0, 1]) {
    const X = (x: number) => (s ? M(x) : x);
    const cx = s ? 22.5 : 9.5;
    part(c, (p) => {
      p.blob(cx, 19 + bob, 1.8, 3.5, skin);
      p.blob(cx, 23 + bob, 1.8, 1.5, skin);
      p.set(X(8), 25 + bob, 'W');
      p.set(X(10), 25 + bob, 'W');
    });
    part(c, (p) => {
      p.blob(s ? 21.5 : 10.5, 14 + bob, 3, 2.4, ['F', 'D', 'L']);
      p.set(X(9), 11 + bob, 'L');
      p.set(X(9), 10 + bob, 'W');
      p.set(X(11), 11 + bob, 'L');
    });
  }
  // หัวโต หู เขา ตาโตคิ้วขมวด (จิบิดุ ๆ)
  part(c, (p) => {
    p.blob(16, 9.5 + bob, 6.4, 5.6, skin);
    for (const s of [0, 1]) {
      const X = (x: number) => (s ? M(x) : x);
      p.set(X(10), 10 + bob, 'R');
      p.set(X(9), 9 + bob, 'R');
      p.line(X(12), 6 + bob, X(10), 4 + bob, s ? 'D' : 'L', 2);
      p.line(X(10), 4 + bob, X(9), 1 + bob, 'L');
      p.set(X(9), 1 + bob, 'W');
      p.set(X(s ? 11 : 10), 4 + bob, 'W');
    }
    bigEye(p, 11, 8 + bob, 'Y', 3, 4, 1);
    bigEye(p, 18, 8 + bob, 'Y', 3, 4, -1);
    for (let x = 14; x <= 17; x++) p.set(x, 12 + bob, 'O');
    p.set(14, 13 + bob, 'W');
    p.set(17, 13 + bob, 'W');
  });
  // ปลอกคอทอง
  for (let x = 13; x <= 18; x++) c.set(x, 14 + bob, x === 13 ? 'y' : 'Y');
  c.set(15, 14 + bob, 'r');
  c.set(16, 14 + bob, 'r');
  c.outline();
  groundShadow(c, 16, 33.6, 11, 1.8, 0.34);
  return c;
}

// ---------------------------------------------------------------- projectiles

function fireball(f: number): PixelCanvas {
  const c = new PixelCanvas(10, 10);
  const rng = new RNG(70 + f * 11);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const dx = x + 0.5 - 6;
      const dy = y + 0.5 - 5;
      const d =
        Math.hypot(dx < 0 ? dx / 1.7 : dx, dy) / 3.4 + dither(x, y) * 0.22 + (rng.next() - 0.5) * (dx < 0 ? 0.35 : 0.1);
      if (d > 1.02) continue;
      c.set(x, y, d < 0.35 ? 'y' : d < 0.6 ? 'Y' : d < 0.84 ? 'r' : 'R');
    }
  }
  c.set(7, 3 + f, 'y');
  return c;
}

function bone(): PixelCanvas {
  return new PixelCanvas(10, 4).rows(['WW......WW', 'LWWWWWWWWL', 'LWLLLLLLWL', 'LD......DL'], 0, 0);
}

function cannonball(): PixelCanvas {
  const c = new PixelCanvas(6, 6).blob(3, 3, 2, 2, ['F', 'D', 'L']);
  c.set(2, 1, 'W');
  return c.outline();
}

function bullet(): PixelCanvas {
  return new PixelCanvas(4, 2).rows(['rYWW', 'RYYW'], 0, 0);
}

function spit(): PixelCanvas {
  const c = new PixelCanvas(6, 6).blob(3, 3, 2, 2, ['H', 'G', 'g']);
  c.set(2, 1, 'W');
  return c.outline('V');
}

function meteor(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  const rng = new RNG(808);
  // เปลวไฟลากไปทางซ้ายบน
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ax = 10.5 - (x + 0.5);
      const ay = 10.5 - (y + 0.5);
      const u = (ax + ay) / Math.SQRT2;
      const v = (ax - ay) / Math.SQRT2;
      if (u < -1 || u > 12) continue;
      const w = 3.8 * (1 - u / 12.5) + (rng.next() - 0.5) * 0.9;
      if (Math.abs(v) > w) continue;
      const k = u / 12 + Math.abs(v) / 10 + dither(x, y) * 0.25;
      c.set(x, y, k < 0.22 ? 'y' : k < 0.42 ? 'Y' : k < 0.66 ? 'r' : 'R');
    }
  }
  // หิน
  c.blob(10.5, 10.5, 3.6, 3.4, ['F', 'D', 'L'], rng, 0.3);
  c.set(11, 11, 'F');
  c.set(12, 12, 'F');
  c.set(12, 9, 'F');
  c.set(10, 12, 'r');
  c.set(11, 12, 'Y');
  c.set(13, 11, 'r');
  c.set(9, 9, 'L');
  return c.outline();
}

function warnRing(): PixelCanvas {
  const c = new PixelCanvas(20, 10);
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      const nx = (x + 0.5 - 10) / 9.6;
      const ny = (y + 0.5 - 5) / 4.6;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1 || d < 0.74) continue;
      const a = Math.atan2(ny, nx);
      if (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2) continue;
      c.set(x, y, 'R');
    }
  }
  return c;
}

// ---------------------------------------------------------------- humanoid overlays

function skeletonOverlay(c: PixelCanvas, v: View) {
  // กะโหลกจิบิ: ขอบเทา เบ้าตาโบ๋ใหญ่ + แววแดงเรือง จมูกโหว่ ฟันซี่ ๆ แก้มแรเงา
  for (let y = 0; y <= 10; y++) for (let x = 0; x < 16; x++) if (c.get(x, y) === 'O') c.set(x, y, 'D');
  if (v === 'down') {
    for (const ex of [3, 10]) {
      c.rect(ex, 5, 3, 3, 'O');
      c.set(ex + 1, 6, 'r');
      c.set(ex + 2, 6, 'R');
      c.set(ex, 4, 'L');
      c.set(ex + 2, 4, 'L');
    }
    c.set(7, 8, 'O');
    c.set(8, 8, 'O');
    for (let x = 5; x <= 10; x++) c.set(x, 9, x % 2 ? 'W' : 'D');
    c.set(4, 9, 'L');
    c.set(11, 9, 'L');
    c.set(3, 8, 'L');
    c.set(12, 8, 'L');
  } else if (v === 'side') {
    c.rect(9, 5, 3, 3, 'O');
    c.set(10, 6, 'r');
    c.set(11, 6, 'R');
    c.set(13, 7, 'O');
    for (let x = 9; x <= 13; x++) c.set(x, 9, x % 2 ? 'W' : 'D');
    c.set(7, 7, 'L');
    c.set(7, 8, 'L');
  } else {
    c.set(7, 9, 'L');
    c.set(8, 9, 'L');
  }
  // ซี่โครง + กระดูกสันหลัง
  if (v === 'side') {
    for (const y of [11, 12]) {
      c.set(6, y, 'W');
      c.set(7, y, 'D');
      c.set(8, y, 'W');
      c.set(9, y, 'L');
    }
  } else {
    for (const y of [11, 12]) for (let x = 4; x <= 11; x++) c.set(x, y, x === 7 || x === 8 ? 'L' : y === 11 ? 'W' : 'w');
    for (const x of [5, 10]) c.set(x, 12, 'D');
  }
}

function mummyOverlay(c: PixelCanvas, v: View) {
  // ผ้าพันเป็นแถบเฉียง
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 16; x++) {
      if (c.get(x, y) === 'S' && (((y * 2 - Math.floor(x / 3)) % 5) + 5) % 5 === 0) c.set(x, y, 's');
    }
  }
  if (v === 'down') {
    // ตาโตเรืองแสงข้างเดียว อีกข้างพันผ้าปิด
    c.rect(3, 5, 4, 3, 'O');
    c.rect(4, 6, 2, 2, 'Y');
    c.set(4, 6, 'W');
    c.set(5, 7, 'y');
    c.set(3, 6, 'y');
    for (let x = 9; x <= 13; x++) {
      c.set(x, 5, 's');
      c.set(x, 6, 'S');
      c.set(x, 7, 's');
    }
    paint(c, [[13, 12, 'S'], [14, 13, 's'], [14, 14, 'S']]);
  } else if (v === 'side') {
    c.rect(9, 5, 4, 3, 'O');
    c.rect(10, 6, 2, 2, 'Y');
    c.set(10, 6, 'W');
    c.set(11, 7, 'y');
    paint(c, [[4, 12, 'S'], [3, 13, 's'], [2, 14, 'S']]);
  } else {
    paint(c, [[2, 12, 'S'], [2, 13, 's'], [1, 14, 'S']]);
  }
}

function impOverlay(c: PixelCanvas, v: View) {
  // เขาเล็กสีเหลือง 2 พิกเซลต่อข้าง
  paint(c, [[4, 1, 'Y'], [3, 0, 'y'], [11, 1, 'Y'], [12, 0, 'y']]);
  if (v === 'side') {
    paint(c, [[4, 13, 'R'], [3, 12, 'R'], [2, 11, 'P'], [2, 10, 'R'], [1, 10, 'R']]);
    c.set(8, 4, 'O');
    c.set(9, 4, 'O');
  } else {
    paint(c, [[0, 4, 'R'], [1, 5, 'R'], [15, 4, 'R'], [14, 5, 'R']]);
    if (v === 'down') for (const [x, y] of [[3, 4], [4, 4], [11, 4], [12, 4]]) c.set(x, y, 'O'); // คิ้วขมวด
  }
}

// ---------------------------------------------------------------- entry

export function buildMonsterTextures(scene: Phaser.Scene): void {
  strip(scene, 'slime', [slime(false), slime(true)]);
  anim(scene, 'slime_walk', 'slime', [0, 1], 4);
  strip(scene, 'bat', [bat(true), bat(false)]);
  anim(scene, 'bat_walk', 'bat', [0, 1], 10);
  strip(scene, 'crab', [crab(0), crab(1)]);
  anim(scene, 'crab_walk', 'crab', [0, 1], 8);
  strip(scene, 'serpent', [serpent(0), serpent(1)]);
  anim(scene, 'serpent_walk', 'serpent', [0, 1], 4);
  strip(scene, 'golem', [golem(0), golem(1)]);
  anim(scene, 'golem_walk', 'golem', [0, 1], 4);
  strip(scene, 'yeti', [yeti(0), yeti(1)]);
  anim(scene, 'yeti_walk', 'yeti', [0, 1], 6);
  strip(scene, 'demon_lord', [demonLord(0), demonLord(1)]);
  anim(scene, 'demon_lord_walk', 'demon_lord', [0, 1], 4);

  humanoidMonster(
    scene,
    'skeleton',
    { 1: 'w', 8: 'W', 2: 'W', 9: 'L', 3: 'O', 4: 'F', 5: 'D', 6: 'L', 7: 'w', p: 'W', n: 'D' },
    skeletonOverlay,
  );
  humanoidMonster(
    scene,
    'mummy',
    { 1: 'S', 8: 'y', 2: 'S', 9: 's', 3: 'Y', 4: 'S', 5: 's', 6: 'S', 7: 's', p: 'S', n: 's' },
    mummyOverlay,
  );
  humanoidMonster(
    scene,
    'imp',
    { 1: 'R', 8: 'r', 2: 'R', 9: 'P', 3: 'Y', 4: 'R', 5: 'P', 6: 'F', 7: 'n', p: 'r', n: 'm' },
    impOverlay,
  );

  strip(scene, 'fireball', [fireball(0), fireball(1)]);
  anim(scene, 'fireball_spin', 'fireball', [0, 1], 12);
  strip(scene, 'bone', [bone()]);
  strip(scene, 'cannonball', [cannonball()]);
  strip(scene, 'bullet', [bullet()]);
  strip(scene, 'spit', [spit()]);
  strip(scene, 'meteor', [meteor()]);
  strip(scene, 'warn_ring', [warnRing()]);
}
