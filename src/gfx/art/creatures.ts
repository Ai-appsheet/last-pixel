import type Phaser from 'phaser';
import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { anim, clearFrom, groundShadow, isShadow, part, shadeEdges, strip } from './monsters';

// สัตว์ชุดใหม่ (สัตว์ป่า · สัตว์ในน้ำ · สัตว์ในตำนาน) วาดด้วยโค้ดแบบเดียวกับ monsters.ts
// ด้านข้างหันขวาเสมอ (เกม flipX เมื่อหันซ้าย) · ขอบ 'O' · แสงจากซ้ายบน · สัตว์น้ำมีวงน้ำรอบตัว

const GOLD = ['#a0662a', '#e0a040', 'Y', 'y'];
const pc = (w: number, h: number) => new PixelCanvas(w, h);

/** ขา 4 ข้าง (ก้าวสลับ): xs = [หลังไกล, หลังใกล้, หน้าไกล, หน้าใกล้] · ขาไกลสีเข้ม */
function legs(c: PixelCanvas, xs: number[], top: number, len: number, f: number, col: string, far: string, o: { thick?: number; foot?: string; swing?: number } = {}) {
  xs.forEach((x, i) => {
    const near = i % 2 === 1;
    const ph = ((i >> 1) + (near ? 1 : 0) + f) % 2;
    const sw = (ph ? 1 : -1) * (o.swing ?? 1);
    c.line(x, top, x + sw, top + len, near ? col : far, o.thick ?? 1);
    if (o.foot) for (let t = 0; t < (o.thick ?? 1); t++) c.set(x + sw + t - Math.floor((o.thick ?? 1) / 2), top + len, o.foot);
  });
}

/** วงน้ำรอบตัว (สัตว์ที่ว่ายอยู่ผิวน้ำ) — ตัดส่วนใต้น้ำทิ้งก่อนเรียก */
function waterRing(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, f: number, seed: number) {
  const rng = new RNG(seed + f * 7);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      if (d > 1) continue;
      const p = c.get(x, y);
      const free = !p || isShadow(p);
      const front = y + 0.5 >= cy;
      if (d > 0.8) {
        if (front || free) c.set(x, y, dither(x, y) > 0.2 ? 'C' : 'b');
      } else if (Math.abs(d - (0.5 + f * 0.06)) < 0.07 && front && free) c.set(x, y, 'C');
      else if (free) c.set(x, y, 'rgba(65,166,246,0.35)');
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = rng.range(0, Math.PI * 2);
    c.set(cx + Math.cos(a) * rx * 0.9, cy + Math.sin(a) * ry * 0.9, 'W');
  }
}

/**
 * ปีกแบบพัดขนนก (ด้านข้าง): โคนปีก (x,y) · ยาว len · up = -1 ยกขึ้น / 0 กาง / 1 กดลง
 * ขนเส้นแรก = ขอบหน้าปีก ไล่ลงไปทีละเส้นจนถึงขนท้ายปีก (สีตาม cols หน้า→หลัง)
 */
function wing(c: PixelCanvas, x: number, y: number, len: number, up: number, cols: string[], n = 7) {
  const a0 = up < 0 ? 4.2 : up === 0 ? 3.1 : 2.5;
  for (let k = 0; k < n; k++) {
    const a = a0 - k * 0.16;
    const L = len * (1 - k * 0.075);
    const rx = x - k * 0.4;
    const ry = y + k * 0.5;
    c.line(rx, ry, rx + Math.cos(a) * L, ry + Math.sin(a) * L, cols[Math.min(cols.length - 1, Math.floor((k * cols.length) / n))], 2);
  }
}

// ================================================================ สัตว์ป่า

/** กวางป่า 20×18 */
function deer(f: number) {
  const c = pc(20, 18);
  legs(c, [5, 6, 12, 13], 10, 6, f, 'M', 'm', { foot: 'n' });
  part(c, (p) => {
    p.blob(9, 9, 5.6, 3, ['m', 'M', 'N', 'S']);
    p.line(13, 8, 15, 4, 'M', 2);
    p.blob(16, 4, 2.3, 1.7, ['m', 'M', 'N']);
    p.set(18, 5, 'N');
    p.set(19, 5, 'n');
    for (const [x, y] of [[7, 8], [9, 7], [11, 8], [8, 10]]) p.set(x, y, 'S');
    p.set(3, 8, 'W');
  });
  // หู + เขา
  c.set(14, 2, 'M');
  c.line(15, 2, 14, -1, 'N');
  c.line(16, 2, 17, 0, 'N');
  c.set(14, 0, 'S');
  c.set(17, -1, 'S');
  c.set(13, 0, 'N');
  c.set(18, 0, 'N');
  c.set(17, 3, 'O');
  c.outline();
  groundShadow(c, 9.5, 16.6, 7, 1.2);
  return c;
}

/** ควายป่า 24×18 */
function buffalo(f: number) {
  const c = pc(24, 18);
  legs(c, [5, 7, 14, 16], 10, 6, f, 'F', '#1d2033', { thick: 2, foot: 'O' });
  part(c, (p) => {
    p.blob(11, 8.5, 7.5, 4.2, ['#1d2033', 'F', 'D', 'L']);
    p.blob(19.5, 9, 2.8, 2.6, ['#1d2033', 'F', 'D']);
    p.set(22, 10, 'D');
    p.set(22, 11, 'L');
    p.line(4, 7, 2, 12, 'F');
  });
  // เขาโค้งใหญ่
  c.line(18, 6, 15, 4, 'L');
  c.line(15, 4, 14, 6, 'W');
  c.line(21, 6, 23, 4, 'L');
  c.set(23, 3, 'W');
  c.set(20, 8, 'r');
  c.outline();
  groundShadow(c, 12, 16.6, 9, 1.3);
  return c;
}

/** จิ้งจอกแดง 18×14 */
function fox(f: number) {
  const c = pc(18, 14);
  legs(c, [5, 6, 10, 11], 9, 3, f, 'n', 'm');
  part(c, (p) => p.blob(3, 6.5 + f * 0.5, 3, 1.7, ['R', 'r', 'r', 'Y'])); // หางฟู
  c.set(0, 6 + f, 'W');
  c.set(1, 6 + f, 'W');
  part(c, (p) => {
    p.blob(8.5, 8, 4.4, 2.3, ['R', 'r', 'r', 'Y']);
    p.blob(13.5, 6, 2.4, 1.9, ['R', 'r', 'r', 'Y']);
    p.set(16, 7, 'W');
    p.set(17, 7, 'O');
    p.line(7, 10, 11, 10, 'W');
    p.set(12, 3, 'r');
    p.set(12, 2, 'R');
    p.set(14, 3, 'r');
    p.set(14, 2, 'R');
    p.set(15, 7, 'W');
  });
  c.set(14, 5, 'O');
  c.outline();
  groundShadow(c, 9, 12.6, 6, 1);
  return c;
}

/** ลิงแสม 16×16 (เดินสี่ขา หางงอ) */
function monkey(f: number) {
  const c = pc(16, 16);
  legs(c, [4, 5, 9, 10], 10, 4, f, 'M', 'm', { foot: 'k' });
  c.line(3, 9, 1, 5, 'M');
  c.line(1, 5, 3, 3, 'M');
  part(c, (p) => {
    p.blob(7, 8.5, 4, 2.8, ['m', 'M', 'N']);
    p.blob(11.5, 6, 2.8, 2.5, ['m', 'M', 'N']);
    p.blob(12.5, 6.5, 1.6, 1.5, ['k', 'K', 'p']);
    p.set(9, 5, 'p');
  });
  c.set(12, 5, 'O');
  c.set(14, 7, 'O');
  c.outline();
  groundShadow(c, 7.5, 14.6, 5.5, 1);
  return c;
}

/** นกแก้วมาคอว์ 16×14 (กระพือปีก 3 ท่า) */
function parrot(f: number) {
  const c = pc(16, 14);
  const up = f === 0 ? -1 : f === 1 ? 0 : 1;
  c.line(4, 8, 0, 11, 'B', 2);
  c.line(4, 8, 1, 12, 'b');
  part(c, (p) => {
    p.blob(8, 7, 3.6, 2.2, ['R', 'R', 'r']);
    p.blob(11.5, 5.5, 2, 1.8, ['R', 'R', 'r']);
    p.set(13, 6, 'W');
    p.set(14, 6, 'L');
    p.set(14, 7, 'F');
  });
  c.set(12, 5, 'W');
  c.set(12, 4, 'O');
  part(c, (p) => wing(p, 9, 6, 7, up, ['Y', 'b', 'B'], 5));
  c.outline();
  groundShadow(c, 8, 13, 3, 0.7, 0.16);
  return c;
}

/** งูเห่า 18×16 (แผ่แม่เบี้ย) */
function cobra(f: number) {
  const c = pc(18, 16);
  const sx = f ? 1 : 0;
  for (let a = 0; a <= Math.PI * 2; a += 0.15) c.ellipse(7 + Math.cos(a) * 4.5, 12.5 + Math.sin(a) * 1.5, 1.4, 1.4, 'M');
  c.line(11, 12, 11 + sx, 6, 'M', 2);
  shadeEdges(c, 'M', 'N', 'm');
  part(c, (p) => {
    p.blob(11 + sx, 6, 2.8, 3.4, ['m', 'M', 'N']);
    for (let y = 4; y <= 8; y++) p.set(11 + sx, y, y % 2 ? 'S' : 's');
    p.set(10 + sx, 5, 'S');
    p.set(12 + sx, 5, 'S');
  });
  part(c, (p) => {
    p.blob(13.5 + sx, 2.6, 2.2, 1.4, ['m', 'M', 'N']);
    p.set(15 + sx, 3, 'N');
  });
  c.set(14 + sx, 2, 'Y');
  if (f) c.line(16 + sx, 4, 17 + sx, 4, 'R');
  c.outline();
  groundShadow(c, 8, 14.6, 6.5, 1);
  return c;
}

/** แมงป่องยักษ์ 20×14 */
function scorpion(f: number) {
  const c = pc(20, 14);
  const shell = ['#1d2033', 'F', 'D', 'L'];
  // ขา 4 คู่
  for (let i = 0; i < 4; i++) {
    const x = 7 + i * 2;
    const ph = (i + f) % 2 ? 1 : -1;
    c.line(x, 9, x - 1 + ph, 12, 'F');
  }
  // หางโค้งข้ามหลัง + เหล็กใน
  part(c, (p) => {
    const tail: [number, number][] = [[5, 8], [3, 6], [3, 3], [5, 1], [8, 1]];
    tail.forEach(([x, y], i) => p.ellipse(x, y + (f && i > 2 ? 1 : 0), 1.5 - i * 0.12, 1.4 - i * 0.1, i % 2 ? 'D' : 'F'));
    p.set(10, 2 + f, 'r');
    p.set(11, 3 + f, 'Y');
  });
  part(c, (p) => {
    p.blob(10, 8.5, 4.6, 2.2, shell);
    p.blob(15, 8, 1.8, 1.6, shell);
    // ก้ามหนีบ
    p.line(16, 8, 18, 6, 'F', 2);
    p.blob(18.5, 5.2, 1.3, 1.2, ['F', 'D', 'r']);
    p.line(16, 9, 18, 10, 'F', 2);
    p.blob(18.5, 10.6, 1.3, 1.1, ['F', 'D', 'r']);
    for (const x of [8, 10, 12]) p.set(x, 7, 'r');
  });
  c.set(16, 7, 'R');
  c.outline();
  groundShadow(c, 10, 12.6, 8, 1);
  return c;
}

/** เพนกวิน 12×16 (เดินเตาะแตะ) */
function penguin(f: number) {
  const c = pc(12, 16);
  const t = f ? 1 : 0;
  part(c, (p) => {
    p.blob(6 + t * 0.5, 9, 3.8, 5.2, ['#1d2033', 'F', 'F', 'D']);
    p.ellipse(7 + t * 0.5, 10, 2.3, 4, 'W');
    p.ellipse(7.2 + t * 0.5, 11, 1.6, 3, 'w');
    p.set(9 + t, 4, 'Y');
    p.set(9 + t, 5, 'y');
    p.line(10 + t, 6, 11 + t, 6, 'r');
    p.line(3 + t, 8, 2 + t, 11, 'F', 2);
  });
  c.set(8 + t, 4, 'O');
  c.set(5 + (f ? 0 : 1), 14, 'r');
  c.set(6 + (f ? 0 : 1), 14, 'r');
  c.set(8 - (f ? 0 : 1), 14, 'r');
  c.outline();
  groundShadow(c, 6, 15, 4, 0.8);
  return c;
}

/** ฝูงหิ่งห้อย 14×14 (ไม่มีเส้นขอบ — เป็นจุดแสง) */
function fireflies(f: number) {
  const c = pc(14, 14);
  const rng = new RNG(900 + f * 13);
  for (let i = 0; i < 7; i++) {
    const x = rng.int(1, 12);
    const y = rng.int(1, 11);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (!c.get(x + dx, y + dy)) c.set(x + dx, y + dy, 'rgba(255,242,176,0.45)');
    c.set(x, y, i % 3 ? 'y' : 'g');
    c.set(x - 1, y - 1, 'F');
  }
  return c;
}

// ================================================================ สัตว์ในน้ำ

/** ฉลามขาว 24×14 (ครีบหลังโผล่ผิวน้ำ) */
function shark(f: number) {
  const c = pc(24, 14);
  const flick = f ? 1 : -1;
  part(c, (p) => {
    p.blob(12, 8, 8, 2.8, ['F', 'D', 'L', 'w']);
    p.line(4, 8, 1, 5 + flick, 'D', 2);
    p.line(4, 8, 1, 11 - flick, 'D', 2);
    for (let i = 0; i < 4; i++) p.line(11 + i, 7, 12 + i * 0.5, 2 + i, 'D');
    p.line(14, 9, 12, 12, 'D', 2);
    p.line(14, 9, 20, 9, 'W');
    for (let x = 16; x <= 20; x += 2) p.set(x, 10, 'W');
  });
  c.set(18, 7, 'O');
  c.set(20, 9, 'R');
  clearFrom(c, 11);
  c.outline();
  waterRing(c, 12, 11, 11, 2.6, f, 311);
  return c;
}

/** แมงกะพรุนไฟ 12×16 */
function jellyfish(f: number) {
  const c = pc(12, 16);
  for (let i = 0; i < 4; i++) {
    const x0 = 3 + i * 2;
    for (let y = 7; y < 15; y++) c.set(x0 + Math.round(Math.sin((y + f * 2 + i) * 0.9) * 0.8), y, i % 2 ? 'u' : 'C');
  }
  part(c, (p) => {
    p.blob(6, 5, 4.6, 3.6, ['P', 'u', '#c9a6ef', 'W']);
    p.line(2, 7, 10, 7, 'P');
  });
  c.set(5, 3, 'W');
  c.set(7, 5, 'C');
  if (f) {
    c.set(1, 10, 'y');
    c.set(10, 12, 'y');
  } else {
    c.set(11, 9, 'y');
    c.set(0, 13, 'y');
  }
  c.outline('U');
  return c;
}

/** ปลาหมึกยักษ์ 18×16 */
function octopus(f: number) {
  const c = pc(18, 16);
  part(c, (p) => {
    for (let i = 0; i < 6; i++) {
      const x0 = 4 + i * 2;
      const dir = i < 3 ? -1 : 1;
      let x = x0;
      for (let y = 9; y < 14; y++) {
        x += dir * (y > 11 ? 0.7 : 0.2) + (f && i % 2 ? 0.3 : 0);
        p.ellipse(x, y, 0.9, 0.9, 'R');
      }
    }
    p.blob(9, 5.5, 4.4, 4.6, ['#7a2633', 'R', 'r', 'p']);
  });
  for (const [x, y] of [[5, 12], [13, 12], [3, 13], [15, 13]]) if (c.get(x, y)) c.set(x, y, 'p');
  c.rect(7, 6, 2, 2, 'W');
  c.rect(11, 6, 2, 2, 'W');
  c.set(8, 7, 'O');
  c.set(12, 7, 'O');
  clearFrom(c, 13);
  c.outline();
  waterRing(c, 9, 13, 8.5, 2.4, f, 333);
  return c;
}

/** เต่าทะเล 20×14 */
function seaTurtle(f: number) {
  const c = pc(20, 14);
  const fl = f ? 1 : -1;
  part(c, (p) => {
    p.line(13, 7, 16, 4 + fl, 'Z', 2);
    p.line(7, 8, 4, 10 - fl, 'Z', 2);
    p.blob(17, 6.5, 2.2, 1.7, ['H', 'Z', 'g']);
  });
  part(c, (p) => {
    p.blob(10, 7, 6.2, 3.6, ['V', 'H', 'G', 'g']);
    for (const x of [7, 10, 13]) p.line(x, 4.5, x, 9, 'T');
    p.line(5, 7, 15, 7, 'T');
  });
  c.set(18, 6, 'O');
  clearFrom(c, 10);
  c.outline();
  waterRing(c, 10, 10, 9.5, 2.6, f, 344);
  return c;
}

/** กระเบนราหู 22×12 (มองเฉียงบน กระพือครีบ) */
function manta(f: number) {
  const c = pc(22, 12);
  const tip = f ? 2 : 5;
  part(c, (p) => {
    p.line(4, 6, 0, 8, 'F');
    p.blob(10, 6, 4, 2.4, ['U', 'F', 'D', 'L']);
    p.line(8, 5, 11, tip - 2, 'F', 2);
    p.line(12, 5, 14, tip - 1, 'F', 2);
    p.line(8, 7, 11, 12 - tip, 'D', 2);
    p.line(12, 7, 14, 13 - tip, 'D', 2);
    p.line(14, 5, 16, 5, 'F');
    p.line(14, 7, 16, 7, 'F');
  });
  c.set(13, 6, 'W');
  c.outline();
  waterRing(c, 10, 9.5, 9.5, 2, f, 355);
  return c;
}

/** ปิรันย่า 14×10 (กระโดดผิวน้ำ) */
function piranha(f: number) {
  const c = pc(14, 10);
  const j = f ? 0 : 1;
  part(c, (p) => {
    p.blob(7, 4.5 + j, 3.8, 2.6, ['F', 'D', 'L', 'w']);
    p.line(3, 4 + j, 1, 2 + j, 'D', 2);
    p.line(3, 5 + j, 1, 7 + j, 'D', 2);
    p.line(6, 2 + j, 8, 1 + j, 'R');
    p.ellipse(8, 6 + j, 2, 1, 'R');
  });
  c.set(9, 3 + j, 'O');
  c.set(11, 5 + j, 'W');
  c.set(10, 6 + j, 'W');
  c.outline();
  waterRing(c, 7, 8, 6.5, 1.8, f, 366);
  return c;
}

/** ปลาไหลไฟฟ้า 22×12 */
function eel(f: number) {
  const c = pc(22, 12);
  part(c, (p) => {
    for (let x = 1; x <= 18; x++) {
      const y = 6 + Math.sin(x * 0.55 + f * Math.PI) * 1.6;
      p.ellipse(x, y, 1.4, 1.4 + (x > 14 ? 0.3 : 0), 'F');
    }
    p.blob(19, 6 + Math.sin(18 * 0.55 + f * Math.PI) * 1.6, 2.2, 1.7, ['#1d2033', 'F', 'D']);
  });
  shadeEdges(c, 'F', 'D', '#1d2033');
  for (let x = 3; x <= 15; x += 3) {
    const y = Math.round(6 + Math.sin(x * 0.55 + f * Math.PI) * 1.6);
    c.set(x, y, 'Y');
  }
  const hy = Math.round(6 + Math.sin(18 * 0.55 + f * Math.PI) * 1.6);
  c.set(20, hy - 1, 'Y');
  c.outline();
  for (const [x, y] of f ? [[4, 1], [12, 10], [17, 1]] : [[7, 10], [14, 1], [1, 2]]) {
    c.set(x, y, 'y');
    c.set(x + 1, y, 'C');
  }
  return c;
}

/** ปูเสฉวนยักษ์ 16×14 */
function hermitCrab(f: number) {
  const c = pc(16, 14);
  for (let i = 0; i < 3; i++) {
    const x = 8 + i * 2;
    const ph = (i + f) % 2 ? 1 : -1;
    c.line(x, 10, x + ph, 12, 'R');
  }
  part(c, (p) => {
    p.blob(6, 7, 5, 4.6, ['s', 'S', 'S', 'W']);
    for (let a = 0; a < Math.PI * 3; a += 0.3) p.set(6 + Math.cos(a) * (3.6 - a * 0.35), 7 + Math.sin(a) * (3.4 - a * 0.33), 'N');
    p.line(1, 3, 3, 2, 'S');
  });
  part(c, (p) => {
    p.blob(11, 8.5, 2.4, 1.8, ['R', 'r', 'r', 'Y']);
    p.blob(14, 7 + f * 0.5, 1.6, 1.4, ['R', 'r', 'Y']);
    p.line(12, 7, 12, 4, 'R');
    p.line(13, 7, 14, 4, 'R');
  });
  c.set(12, 3, 'O');
  c.set(14, 3, 'O');
  c.outline();
  groundShadow(c, 8, 12.6, 6.5, 1);
  return c;
}

/** หนวดคราเคน 14×22 */
function tentacle(f: number) {
  const c = pc(14, 22);
  const sway = f ? 1.5 : -1.5;
  part(c, (p) => {
    for (let t = 0; t <= 1.001; t += 0.04) {
      const x = 7 + Math.sin(t * 3 + 0.5) * 2 + sway * t * t;
      const y = 19 - t * 17;
      p.ellipse(x, y, 2.6 - t * 1.8, 2.6 - t * 1.8, 'u');
    }
    // ปลายม้วน
    for (let a = 0; a < Math.PI * 1.4; a += 0.3) p.set(7 + sway + 1 + Math.cos(a) * 1.5, 2.5 + Math.sin(a) * 1.5, 'u');
  });
  shadeEdges(c, 'u', '#c9a6ef', 'P');
  for (let y = 5; y < 18; y += 2) {
    for (let x = 13; x > 0; x--) {
      if (c.get(x, y) && c.get(x, y) !== 'O') {
        c.set(x, y, 'p');
        break;
      }
    }
  }
  clearFrom(c, 19);
  c.outline();
  waterRing(c, 7, 19, 6.5, 2.2, f, 377);
  return c;
}

// ================================================================ สัตว์ในตำนาน (32–48px)

/** พญานาค 44×38 — งูใหญ่ขดตัวบนพื้น ชูแม่เบี้ย 3 เศียรพร้อมหงอนทอง */
function naga(f: number) {
  const c = pc(44, 38);
  const sx = f ? 1 : 0;
  // หางเลื้อยบนพื้น (คลื่น)
  for (let t = 0; t <= 1.001; t += 0.03) c.ellipse(2 + t * 18, 32 + Math.sin(t * 7 + f) * 1.4, 1.4 + t * 2.4, 1.4 + t * 2.2, 'G');
  // ลำตัวชูขึ้น
  const P = [[20, 31], [14 - sx, 20], [27 + sx, 13]];
  const curve: [number, number, number][] = [];
  for (let t = 0; t <= 1.001; t += 0.03) {
    const x = (1 - t) ** 2 * P[0][0] + 2 * (1 - t) * t * P[1][0] + t * t * P[2][0];
    const y = (1 - t) ** 2 * P[0][1] + 2 * (1 - t) * t * P[1][1] + t * t * P[2][1];
    const r = 4.4 - t * 1.2;
    curve.push([x, y, r]);
    c.ellipse(x, y, r, r, 'G');
  }
  shadeEdges(c, 'G', 'g', 'H');
  // ท้องเกล็ดครีมด้านหน้าลำตัว
  curve.forEach(([x, y, r], i) => {
    if (i < 3) return;
    for (const k of [1.4, 2.2]) {
      const px = Math.round(x + r - k);
      const py = Math.round(y);
      if (c.get(px, py) && c.get(px, py) !== 'O') c.set(px, py, i % 3 ? 'S' : 's');
    }
  });
  // ลายจุดทองบนหลัง
  for (let i = 4; i < curve.length; i += 5) {
    const [x, y, r] = curve[i];
    c.set(Math.round(x - r * 0.4), Math.round(y), 'Y');
  }
  // 3 คอแยกจากลำตัว + เศียรหันขวา หงอนทอง (เหมือนนาคหลายเศียร)
  const heads: [number, number, number][] = [[21 + sx, 7, 2.8], [36 + sx, 9, 2.8], [29 + sx, 4, 3.4]];
  for (const [hx, hy] of heads) {
    for (let t = 0; t <= 1.001; t += 0.06) c.ellipse(27 + sx + (hx - 27 - sx) * t, 13 + (hy + 2 - 13) * t - Math.sin(t * Math.PI) * 2, 2.6 - t * 0.6, 2.6 - t * 0.6, 'G');
  }
  shadeEdges(c, 'G', 'g', 'H');
  for (const [hx, hy, r] of heads) {
    part(c, (p) => {
      p.blob(hx, hy, r + 0.5, r * 0.85, ['H', 'G', 'g', 'y']);
      p.blob(hx + r + 0.4, hy + 0.7, r * 0.8, r * 0.55, ['H', 'G', 'g']);
      p.line(hx - r * 0.6, hy + r * 0.5, hx + r * 1.6, hy + r * 0.6, 'S');
    });
    // หงอนทองแหลม 3 ยอด
    for (let k = -1; k <= 1; k++) c.line(hx + k * 1.4 - 0.5, hy - r * 0.7, hx + k * 2 - 1.5, hy - r - 2.6 + Math.abs(k) * 0.8, k ? '#e0a040' : 'Y');
    c.set(hx + 0.5, hy - 0.8, 'R');
    c.set(hx + 1.5, hy - 0.8, 'Y');
    if (f) c.line(hx + r * 2.1, hy + 1, hx + r * 2.1 + 2, hy + 2, 'R');
  }
  c.outline();
  groundShadow(c, 18, 35.8, 17, 1.8, 0.32);
  return c;
}

/** พญาครุฑ 40×40 — กายคน ปีกแดงทอง จะงอยปากทอง มงกุฎ (กระพือ 3 ท่า) */
function garuda(f: number) {
  const c = pc(40, 40);
  const up = f === 0 ? -1 : f === 1 ? 0 : 1;
  const feathers = ['Y', 'r', 'R', '#7a2633'];
  // ปีกหลัง (ไกล)
  part(c, (p) => wing(p, 18, 14, 16, up, ['R', '#7a2633', '#7a2633'], 8));
  // ขา + กรงเล็บ
  part(c, (p) => {
    p.line(18, 26, 16, 33, GOLD[1], 2);
    p.line(22, 26, 23, 33, GOLD[1], 2);
    for (const x of [14, 16, 18, 21, 23, 25]) p.set(x, 34, 'W');
  });
  // ลำตัว + หาง
  part(c, (p) => {
    p.blob(20, 20, 5, 7, ['#7a2633', 'R', 'r', 'Y']);
    p.line(17, 25, 12, 32, 'R', 3);
    p.line(18, 26, 14, 34, 'r', 2);
    p.rect(17, 23, 7, 2, GOLD[1]);
    p.set(20, 18, 'Y');
    p.set(19, 19, 'Y');
    p.set(21, 19, 'Y');
  });
  // หัวนกอินทรี + มงกุฎ
  part(c, (p) => {
    p.blob(23, 10, 3.6, 3.4, GOLD);
    p.line(26, 10, 29, 12, '#e0a040', 2);
    p.set(29, 13, '#a0662a');
    p.rect(20, 6, 6, 2, '#e0a040');
    for (let k = 0; k < 3; k++) p.line(20.5 + k * 2.5, 6, 20.5 + k * 2.5, k === 1 ? 2 : 4, k === 1 ? 'Y' : '#e0a040');
  });
  c.set(24, 9, 'O');
  c.set(25, 9, 'R');
  // ปีกหน้า (ใกล้)
  part(c, (p) => wing(p, 22, 15, 18, up, feathers, 8));
  c.outline();
  groundShadow(c, 20, 38.6, 9, 1.4, 0.18);
  return c;
}

/** กิเลน 36×30 — กายเกล็ดทอง หัวมังกร เขาเดียว แผงคอฟ้า กีบสายฟ้า */
function qilin(f: number) {
  const c = pc(36, 30);
  legs(c, [9, 11, 22, 24], 17, 8, f, '#e0a040', '#a0662a', { thick: 2, foot: 'C', swing: 1.5 });
  // หางพลิ้ว
  part(c, (p) => {
    p.line(6, 14, 2, 10 + f, 'C', 2);
    p.line(2, 10 + f, 1, 6 + f * 2, 'b', 2);
    p.set(0, 5 + f * 2, 'W');
  });
  part(c, (p) => {
    p.blob(16.5, 15, 10, 5, GOLD);
    p.line(24, 13, 27, 7, '#e0a040', 3);
    p.blob(29, 6.5, 3.6, 3, GOLD);
    p.blob(32.5, 7.5, 2.2, 1.6, GOLD);
  });
  // ลายเกล็ด
  for (let y = 12; y <= 18; y += 2) for (let x = 9 + (y % 4 ? 1 : 0); x <= 24; x += 3) if (c.get(x, y) && c.get(x, y) !== 'O') c.set(x, y, '#a0662a');
  // แผงคอ + เขา + ตา + หนวด
  for (let i = 0; i < 6; i++) c.line(24 + i * 0.6, 8 + i * 1.2, 21 + i * 0.4, 10 + i * 1.6, i % 2 ? 'b' : 'C');
  c.line(28, 4, 26, 0, 'W');
  c.set(27, 2, 'y');
  c.set(30, 5, 'O');
  c.set(31, 5, 'C');
  c.line(34, 8, 35, 11, 'C');
  c.outline();
  // ประกายสายฟ้าที่กีบ
  for (const [x, y] of f ? [[8, 27], [25, 26], [13, 24]] : [[11, 27], [22, 27], [5, 24]]) {
    c.set(x, y, 'y');
    c.set(x + 1, y - 1, 'C');
  }
  groundShadow(c, 17, 27.6, 12, 1.6, 0.3);
  return c;
}

/** หงส์เพลิง 40×36 — ปีกเปลวไฟ หางยาว (กระพือ 3 ท่า) */
function phoenix(f: number) {
  const c = pc(40, 36);
  const up = f === 0 ? -1 : f === 1 ? 0 : 1;
  const rng = new RNG(970 + f);
  const flame = ['R', 'r', 'Y', 'y'];
  part(c, (p) => wing(p, 18, 14, 15, up, ['R', 'R', '#7a2633'], 8));
  // หางเปลวไฟยาว
  part(c, (p) => {
    for (let k = 0; k < 3; k++) p.line(14, 20 + k, 3 + k * 2, 30 + k * 2 - f, k === 1 ? 'Y' : 'r', 2);
  });
  part(c, (p) => {
    p.blob(19, 18, 5.4, 4.2, flame);
    p.line(22, 15, 26, 9, 'r', 3);
    p.blob(27, 8, 2.8, 2.4, flame);
    p.line(29, 8, 32, 9, 'Y', 2);
    for (let k = 0; k < 3; k++) p.line(25 + k, 6, 23 + k * 2, 2 - k + f, k === 1 ? 'y' : 'Y');
  });
  c.set(28, 7, 'O');
  part(c, (p) => wing(p, 21, 15, 17, up, flame, 8));
  // ขอบเปลวไฟระยิบ
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, 39);
    const y = rng.int(0, 33);
    const px = c.get(x, y);
    if (px === 'R' || px === 'r') c.set(x, y, rng.chance(0.5) ? 'Y' : 'y');
  }
  c.outline('#7a2633');
  for (let i = 0; i < 8; i++) c.set(rng.int(2, 37), rng.int(1, 33), rng.chance(0.5) ? 'Y' : 'r');
  groundShadow(c, 19, 34.6, 8, 1.3, 0.18);
  return c;
}

/** คราเคน 44×36 — หัวหมึกยักษ์โผล่จากทะเล หนวดม้วนรอบตัว */
function kraken(f: number) {
  const c = pc(44, 36);
  const WL = 29;
  // หนวด 6 เส้นโผล่จากน้ำ ปลายม้วนเป็นตะขอ
  const tents: [number, number, number][] = [[4, 14, -1], [10, 8, -1], [15, 17, -1], [29, 17, 1], [34, 8, 1], [40, 14, 1]];
  tents.forEach(([x0, top, dir], i) => {
    const sway = (f + i) % 2 ? 1 : -1;
    let tx = x0;
    let ty = top;
    for (let t = 0; t <= 1.001; t += 0.04) {
      const x = x0 + Math.sin(t * 3) * 1.6 * dir + sway * t * 1.2;
      const y = WL + 1 - t * (WL + 1 - top);
      c.ellipse(x, y, 2.5 - t * 1.4, 2.5 - t * 1.4, 'u');
      tx = x;
      ty = y;
    }
    for (let a = 0; a <= Math.PI * 1.5; a += 0.25) c.ellipse(tx + dir * (1.6 - Math.cos(a) * 1.6), ty - Math.sin(a) * 1.6, 0.8, 0.8, 'u');
  });
  shadeEdges(c, 'u', '#c9a6ef', 'P');
  for (const [x0, top] of tents) for (let y = top + 3; y < WL; y += 2) {
    for (let x = x0 - 3; x <= x0 + 3; x++) if (c.get(x, y) === 'u' && c.get(x + 1, y) !== 'u') {
      c.set(x, y, 'p');
      break;
    }
  }
  // หัวหมึก (แมนเทิล)
  part(c, (p) => {
    p.blob(22, 16, 8.4, 11, ['P', 'P', 'u', '#c9a6ef']);
    for (let k = 0; k < 4; k++) p.line(17 + k * 3, 27, 16 + k * 3.4, 31, 'P', 3);
  });
  for (const ex of [17, 25]) {
    c.rect(ex, 18, 3, 3, 'Y');
    c.set(ex + 1, 19, 'O');
    c.set(ex + 1, 20, 'O');
    c.set(ex, 18, 'y');
  }
  for (const [x, y] of [[19, 8], [24, 6], [21, 12], [27, 11]]) c.set(x, y, '#c9a6ef');
  clearFrom(c, WL + 1);
  c.outline();
  waterRing(c, 22, WL + 1, 21, 4.5, f, 999);
  return c;
}

/** คชสีห์ 40×34 — กายราชสีห์ เศียรคชสาร งาทอง เครื่องทรงทอง */
function kochasi(f: number) {
  const c = pc(40, 34);
  const lion = ['M', 'N', 'S', 'y'];
  legs(c, [9, 11, 22, 24], 20, 9, f, 'N', 'M', { thick: 3, foot: 'O', swing: 1 });
  // หางราชสีห์
  part(c, (p) => {
    p.line(6, 17, 2, 12 - f, 'N', 2);
    p.blob(2, 10.5 - f, 1.8, 1.8, ['R', 'r', 'r']);
  });
  part(c, (p) => {
    p.blob(16, 17, 10.5, 5.5, lion);
    p.rect(9, 13, 14, 3, GOLD[1]);
    p.rect(9, 13, 14, 1, 'Y');
    for (let x = 10; x <= 22; x += 3) p.set(x, 15, 'R');
  });
  // แผงคอราชสีห์ (แดงส้ม) + หัวช้าง
  part(c, (p) => p.blob(27, 12, 6, 6.5, ['R', 'R', 'r', 'Y'], new RNG(41), 0.5));
  part(c, (p) => {
    p.blob(30, 10, 5, 4.6, ['F', 'D', 'L', 'w']);
    p.blob(26.5, 10, 2.6, 3.6, ['F', 'D', 'L']); // หู
    p.line(34, 12, 36, 20, 'D', 3); // งวง
    p.line(36, 20, 38, 22 - f, 'D', 2);
    // มงกุฎทอง
    p.rect(27, 4, 7, 2, GOLD[1]);
    for (let k = 0; k < 4; k++) p.line(27 + k * 2, 4, 27 + k * 2, 1 + (k === 1 || k === 2 ? -1 : 0), 'Y');
  });
  // งา
  c.line(33, 14, 37, 15, 'W', 2);
  c.set(38, 14, 'W');
  c.set(32, 9, 'O');
  c.set(31, 9, 'Y');
  c.outline();
  groundShadow(c, 18, 31.6, 13, 1.8, 0.32);
  return c;
}

/** มังกรน้ำแข็ง 44×38 — ปีกเยือกแข็ง (กระพือ 3 ท่า) */
function frostDragon(f: number) {
  const c = pc(44, 38);
  const up = f === 0 ? -1 : f === 1 ? 0 : 1;
  const ice = ['U', 'B', 'b', 'C'];
  part(c, (p) => wing(p, 20, 15, 17, up, ['B', 'U', 'U'], 8));
  // หาง
  part(c, (p) => {
    for (let t = 0; t <= 1; t += 0.05) p.ellipse(14 - t * 12, 22 + Math.sin(t * 3 + f) * 3, 2.6 - t * 1.8, 2.6 - t * 1.8, 'b');
  });
  // ขา
  part(c, (p) => {
    p.line(16, 24, 15, 31, 'B', 3);
    p.line(26, 24, 27, 31, 'B', 3);
    for (const x of [13, 15, 17, 25, 27, 29]) p.set(x, 32, 'W');
  });
  part(c, (p) => {
    p.blob(21, 20, 8, 5.2, ice);
    p.line(27, 17, 32, 9, 'b', 4);
    p.blob(34, 8, 3.6, 3, ice);
    p.blob(38, 9, 2.6, 1.8, ice);
    // ท้องเกล็ดขาว
    for (let x = 15; x <= 27; x++) p.set(x, 24, x % 2 ? 'W' : 'C');
  });
  // หนามน้ำแข็งบนหลัง + เขา
  for (let x = 10; x <= 28; x += 3) c.line(x, 15 - (x > 18 ? 0 : 1), x - 1, 12 - (x > 18 ? 0 : 1), 'W');
  c.line(33, 5, 30, 1, 'W');
  c.line(35, 5, 34, 1, 'W');
  c.set(35, 7, 'O');
  c.set(36, 7, 'C');
  part(c, (p) => wing(p, 23, 15, 19, up, ['W', 'C', 'b', 'B'], 8));
  c.outline('U');
  // ลมหายใจเย็น
  if (f !== 1) for (const [x, y] of [[41, 10], [42, 12], [43, 9]]) c.set(x, y, 'w');
  groundShadow(c, 21, 36.6, 10, 1.4, 0.18);
  return c;
}

/** เต่ายักษ์ศิลา 46×32 — กระดองหินมีมอส ผลึกหยก ต้นไม้เล็ก */
function stoneTurtle(f: number) {
  const c = pc(46, 32);
  const rng = new RNG(4242);
  const rock = ['F', 'D', 'L', 'w'];
  // ขาหิน
  for (const [x, i] of [[10, 0], [15, 1], [30, 2], [35, 3]] as [number, number][]) {
    const lift = (i + f) % 2 ? 1 : 0;
    part(c, (p) => p.blob(x, 25 - lift, 3, 3.2, rock));
  }
  // หัว + คอ
  part(c, (p) => {
    p.line(36, 20, 40, 17, 'D', 4);
    p.blob(41.5, 16, 3.6, 3, rock);
  });
  c.set(42, 15, 'O');
  c.set(43, 15, 'g');
  // กระดอง
  part(c, (p) => {
    p.blob(22, 17, 16, 9.5, rock, rng, 0.15);
    clearFrom(p, 24);
    p.rect(7, 22, 31, 2, 'F');
  });
  // ลายแผ่นกระดอง + มอส + ผลึกหยก + ต้นไม้
  for (const x of [14, 22, 30]) c.line(x, 9, x - 1, 22, 'F');
  c.line(8, 17, 37, 17, 'F');
  for (let y = 7; y < 22; y++) for (let x = 6; x < 39; x++) {
    const p = c.get(x, y);
    const above = c.get(x, y - 1);
    if ((p === 'L' || p === 'w' || p === 'D') && (!above || above === 'O') && rng.chance(0.6)) {
      c.set(x, y, rng.chance(0.4) ? 'g' : 'G');
      if (rng.chance(0.5) && c.get(x, y + 1) && c.get(x, y + 1) !== 'O') c.set(x, y + 1, 'H');
    }
  }
  for (const [x, y] of [[18, 8], [27, 9], [33, 13]]) {
    c.line(x, y, x, y - 4, 'G', 2);
    c.set(x, y - 5, 'g');
    c.set(x + 1, y - 3, 'C');
  }
  c.line(11, 11, 11, 6, 'm');
  part(c, (p) => p.blob(11, 4.5, 2.6, 2.2, ['V', 'H', 'G', 'g']));
  c.outline();
  groundShadow(c, 23, 29.6, 19, 2, 0.34);
  return c;
}

// ================================================================ ลงทะเบียน

/** id texture → [ท่าแต่ละเฟรม, ลำดับเฟรมใน anim, fps] */
export const CREATURE_ART: Record<string, { frames: () => PixelCanvas[]; anim: number[]; rate: number }> = {
  deer: { frames: () => [deer(0), deer(1)], anim: [0, 1], rate: 7 },
  buffalo: { frames: () => [buffalo(0), buffalo(1)], anim: [0, 1], rate: 5 },
  fox: { frames: () => [fox(0), fox(1)], anim: [0, 1], rate: 9 },
  monkey: { frames: () => [monkey(0), monkey(1)], anim: [0, 1], rate: 8 },
  parrot: { frames: () => [parrot(0), parrot(1), parrot(2)], anim: [0, 1, 2, 1], rate: 12 },
  cobra: { frames: () => [cobra(0), cobra(1)], anim: [0, 1], rate: 4 },
  scorpion: { frames: () => [scorpion(0), scorpion(1)], anim: [0, 1], rate: 8 },
  penguin: { frames: () => [penguin(0), penguin(1)], anim: [0, 1], rate: 5 },
  firefly_swarm: { frames: () => [fireflies(0), fireflies(1)], anim: [0, 1], rate: 4 },
  shark: { frames: () => [shark(0), shark(1)], anim: [0, 1], rate: 4 },
  jellyfish: { frames: () => [jellyfish(0), jellyfish(1)], anim: [0, 1], rate: 3 },
  octopus: { frames: () => [octopus(0), octopus(1)], anim: [0, 1], rate: 4 },
  sea_turtle: { frames: () => [seaTurtle(0), seaTurtle(1)], anim: [0, 1], rate: 3 },
  manta: { frames: () => [manta(0), manta(1)], anim: [0, 1], rate: 4 },
  piranha: { frames: () => [piranha(0), piranha(1)], anim: [0, 1], rate: 6 },
  electric_eel: { frames: () => [eel(0), eel(1)], anim: [0, 1], rate: 5 },
  hermit_crab: { frames: () => [hermitCrab(0), hermitCrab(1)], anim: [0, 1], rate: 6 },
  kraken_tentacle: { frames: () => [tentacle(0), tentacle(1)], anim: [0, 1], rate: 3 },
  naga: { frames: () => [naga(0), naga(1)], anim: [0, 1], rate: 3 },
  garuda: { frames: () => [garuda(0), garuda(1), garuda(2)], anim: [0, 1, 2, 1], rate: 8 },
  qilin: { frames: () => [qilin(0), qilin(1)], anim: [0, 1], rate: 8 },
  phoenix: { frames: () => [phoenix(0), phoenix(1), phoenix(2)], anim: [0, 1, 2, 1], rate: 9 },
  kraken: { frames: () => [kraken(0), kraken(1)], anim: [0, 1], rate: 2 },
  kochasi: { frames: () => [kochasi(0), kochasi(1)], anim: [0, 1], rate: 4 },
  frost_dragon: { frames: () => [frostDragon(0), frostDragon(1), frostDragon(2)], anim: [0, 1, 2, 1], rate: 6 },
  stone_turtle: { frames: () => [stoneTurtle(0), stoneTurtle(1)], anim: [0, 1], rate: 2 },
};

/** ไอคอนขนนก (ใบขนรูปใบไม้ แกนทแยง) — cols[i] ไล่สีจากโคนไปปลาย */
function featherIcon(shaft: string, left: string[], right: string[]) {
  const c = pc(16, 16);
  for (let i = 0; i <= 10; i++) {
    const x = 3 + i;
    const y = 13 - i * 1.2;
    const w = Math.round(Math.sin((i / 10) * Math.PI) * 2.6);
    const k = Math.min(left.length - 1, Math.floor((i * left.length) / 11));
    for (let d = 1; d <= w; d++) {
      c.set(x - d, y - d, left[k]);
      c.set(x + d, y + d * 0.6, right[k]);
    }
  }
  c.line(1, 15, 13, 1, shaft);
  return c;
}

// ================================================================ ไอคอนวัตถุดิบ 16×16

export function creatureIcons(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;
  // เขากวาง
  c = pc(16, 16);
  for (const s of [0, 1]) {
    const X = (x: number) => (s ? 15 - x : x);
    c.line(X(7), 14, X(5), 6, 'M', 2);
    c.line(X(5), 6, X(2), 1, 'N');
    c.line(X(5), 9, X(1), 7, 'N');
    c.line(X(5), 6, X(6), 2, 'S');
  }
  out.i_antler = c.outline();
  // ขนนก
  out.i_feather = featherIcon('W', ['B', 'b', 'R'], ['U', 'C', 'r']).outline();
  // ต่อมพิษ (ขวด + เขี้ยว)
  c = pc(16, 16);
  c.rect(6, 1, 4, 2, 'M');
  c.rect(7, 3, 2, 2, 'w');
  c.blob(8, 10, 4.5, 4.5, ['T', 'G', 'g', 'y']);
  c.set(6, 8, 'W');
  c.line(12, 14, 14, 10, 'W');
  out.i_venom_sac = c.outline();
  // ผงหิ่งห้อย (โหลแก้วเรืองแสง)
  c = pc(16, 16);
  c.rect(5, 1, 6, 2, 'M');
  c.rect(4, 3, 8, 11, 'rgba(214,228,238,0.5)');
  for (const [x, y] of [[6, 6], [9, 5], [7, 9], [10, 10], [5, 12], [8, 12], [10, 7]]) {
    c.set(x, y, 'y');
    c.set(x + 1, y, 'g');
  }
  c.line(4, 3, 4, 13, 'w');
  out.i_glow_dust = c.outline();
  // กระดองเต่าทะเล
  c = pc(16, 16);
  c.blob(8, 8, 6.5, 5, ['V', 'H', 'G', 'g']);
  for (const x of [5, 8, 11]) c.line(x, 4, x, 12, 'T');
  c.line(2, 8, 14, 8, 'T');
  out.i_turtle_shell = c.outline();
  // เขี้ยวฉลาม (สร้อย)
  c = pc(16, 16);
  c.line(1, 3, 15, 3, 'M');
  for (const x of [3, 7, 11]) {
    c.line(x, 4, x + 1.5, 12, 'W', 2);
    c.set(x + 2, 4, 'w');
    c.set(x + 2, 13, 'L');
  }
  out.i_shark_tooth = c.outline();
  // ไข่มุกในหอย
  c = pc(16, 16);
  c.blob(8, 11, 7, 3.4, ['F', 'D', 'L', 'w']);
  c.line(2, 11, 14, 11, 'F');
  part(c, (p) => p.blob(8, 8, 3, 3, ['u', '#c9a6ef', 'W', 'W']));
  c.set(7, 7, 'W');
  out.i_pearl = c.outline();
  // เกล็ดพญานาค
  c = pc(16, 16);
  for (const [x, y] of [[5, 6], [11, 6], [8, 11]]) {
    c.blob(x, y, 3.2, 3.6, ['V', 'H', 'G', 'g']);
    c.line(x - 2, y + 3, x + 2, y + 3, 'Y');
  }
  out.i_naga_scale = c.outline();
  // ขนพญาครุฑ
  out.i_garuda_feather = featherIcon('Y', ['#7a2633', 'R', 'r', 'Y'], ['#7a2633', 'R', 'Y', 'y']).outline();
  // เขากิเลน
  c = pc(16, 16);
  for (let i = 0; i <= 11; i++) {
    const x = 3 + i;
    const y = 14 - i;
    c.line(x, y, x, y - Math.max(0, 2 - i * 0.15), i % 3 ? 'W' : 'Y', 2);
  }
  c.set(15, 1, 'y');
  c.set(13, 0, 'C');
  c.set(15, 4, 'C');
  out.i_qilin_horn = c.outline();
  // ขนหงส์เพลิง
  c = featherIcon('y', ['R', 'r', 'Y'], ['r', 'Y', 'y']);
  c.set(14, 0, 'Y');
  c.set(15, 2, 'r');
  out.i_phoenix_feather = c.outline('#7a2633');
  // หมึกคราเคน
  c = pc(16, 16);
  c.rect(6, 1, 4, 2, 'M');
  c.rect(7, 3, 2, 2, 'w');
  c.blob(8, 10, 5, 5, ['#100f1c', 'P', 'P', 'u']);
  c.set(6, 8, 'W');
  c.set(9, 11, 'u');
  out.i_kraken_ink = c.outline();
  // งาคชสีห์
  c = pc(16, 16);
  for (let t = 0; t <= 1; t += 0.05) c.ellipse(2 + t * 12, 13 - Math.sin(t * 2.4) * 9, 1.8 - t * 1.2, 1.8 - t * 1.2, t < 0.3 ? '#e0a040' : 'W');
  c.line(2, 12, 5, 12, 'Y');
  out.i_kochasi_tusk = c.outline();
  // เกล็ดมังกรน้ำแข็ง
  c = pc(16, 16);
  for (const [x, y] of [[5, 6], [11, 6], [8, 11]]) {
    c.blob(x, y, 3.2, 3.6, ['B', 'b', 'C', 'W']);
    c.set(x, y - 1, 'W');
  }
  out.i_frost_dragon_scale = c.outline('U');
  // กระดองหยกศิลา
  c = pc(16, 16);
  c.blob(8, 9, 7, 5.5, ['F', 'D', 'L', 'w']);
  clearFrom(c, 13);
  for (const [x, y] of [[5, 7], [9, 6], [11, 10], [6, 10]]) {
    c.set(x, y, 'g');
    c.set(x + 1, y, 'G');
    c.set(x, y + 1, 'G');
  }
  out.i_jade_shell = c.outline();
  return out;
}

/** สร้าง texture + anim ของสัตว์ชุดใหม่ทั้งหมด (เรียกจาก TextureFactory) */
export function buildCreatureTextures(scene: Phaser.Scene) {
  for (const [key, a] of Object.entries(CREATURE_ART)) {
    strip(scene, key, a.frames());
    anim(scene, `${key}_walk`, key, a.anim, a.rate);
  }
}
