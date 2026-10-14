import type Phaser from 'phaser';
import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { TOWN_ANIMS, townArt } from './town';
import { BUILDING2_ANIMS, buildingArt2 } from './buildings2';

// ---------------- สิ่งก่อสร้าง / เฟอร์นิเจอร์ / เครื่องจักร / อาคารสำเร็จรูป / เรือ ----------------
// มุมมอง 3/4 จากด้านบน: ฐานวัตถุอยู่ขอบล่างของผ้าใบ, พื้น/ท่าเรือวาดแบนเต็มช่อง (ไม่มีเงา)

const pc = (w: number, h: number) => new PixelCanvas(w, h);

/** แสงเรืองรอบจุด (rgba ไม่ถูกตีเส้นขอบ) — ลงเฉพาะพิกเซลว่าง */
function halo(c: PixelCanvas, cx: number, cy: number, r: number, rgb: string, alpha = 0.3) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1 || c.get(x, y)) continue;
      const a = Math.round(alpha * (1 - d) * 6 + dither(x, y) * 0.8) / 6;
      if (a > 0) c.set(x, y, `rgba(${rgb},${Math.min(alpha, a).toFixed(2)})`);
    }
  }
  return c;
}

// ---------------- กำแพง / ประตู / รั้ว ----------------

/** กำแพงเหล็ก 16×22 — แผ่นเหล็กย้ำหมุด */
function ironWall(): PixelCanvas {
  const c = pc(16, 22);
  c.shadow(8, 20.5, 8, 1.5);
  // ด้านบน (ความหนาของกำแพง)
  c.rect(0, 2, 16, 3, 'L');
  c.rect(0, 2, 16, 1, 'W');
  c.rect(0, 4, 16, 1, 'D');
  for (const x of [3, 11]) c.set(x, 3, 'D');
  // แผ่นเหล็กเรียงสลับ
  for (let y = 5; y <= 20; y++) {
    for (let x = 0; x < 16; x++) {
      const lower = y >= 13;
      const px = (x + (lower ? 4 : 0)) % 8;
      const py = lower ? y - 13 : y - 5;
      let col = 'D';
      if (px === 0 || py === 0) col = 'L';
      else if (px === 7 || py === 7) col = 'F';
      else if (px - py === 2 || px - py === 3) col = dither(x, y) > -0.2 ? 'L' : 'D'; // แสงสะท้อนเฉียง
      else if (dither(x, y) > 0.4) col = 'U';
      c.set(x, y, col);
      if ((px === 1 || px === 6) && (py === 1 || py === 6)) c.set(x, y, 'W'); // หมุด
      if ((px === 1 || px === 6) && py === 2) c.set(x, y, 'F');
    }
  }
  for (let x = 0; x < 16; x++) c.set(x, 20, 'F');
  c.set(5, 9, 'b');
  c.set(13, 16, 'b');
  return c.outline();
}

/** ประตู 16×22 (ไม้/เหล็ก) ปิด/เปิด */
function door(kind: 'wood' | 'iron', open: boolean): PixelCanvas {
  const c = pc(16, 22);
  c.shadow(8, 20.5, 8, 1.5);
  const [fl, fm, fd] = kind === 'wood' ? ['N', 'M', 'm'] : ['L', 'D', 'F'];
  // วงกบ
  c.rect(0, 2, 2, 19, fm);
  c.rect(0, 2, 1, 19, fl);
  c.rect(14, 2, 2, 19, fd);
  c.rect(14, 2, 1, 19, fm);
  c.rect(0, 2, 16, 3, fm);
  c.rect(0, 2, 16, 1, fl);
  c.rect(2, 4, 12, 1, fd);
  if (kind === 'iron') for (const [x, y] of [[1, 3], [14, 3], [1, 19], [14, 19]]) c.set(x, y, 'W');
  if (open) {
    // ช่องประตูมืด + แสงพื้นด้านใน
    for (let y = 5; y <= 20; y++) {
      for (let x = 2; x <= 13; x++) c.set(x, y, y + dither(x, y) * 3 < 13 ? 'O' : kind === 'wood' ? 'n' : 'F');
    }
    for (let x = 6; x <= 13; x++) c.set(x, 20, kind === 'wood' ? 'm' : 'D');
    // บานประตูเปิดพับอยู่ด้านซ้าย (เห็นเฉียง)
    for (let y = 5; y <= 20; y++) {
      c.set(2, y, fl);
      c.set(3, y, fm);
      c.set(4, y, fm);
      c.set(5, y, fd);
    }
    c.set(4, 12, 'Y');
    if (kind === 'wood') {
      c.set(3, 8, fd);
      c.set(3, 16, fd);
    } else {
      c.set(3, 7, 'W');
      c.set(3, 17, 'W');
    }
    return c.outline();
  }
  if (kind === 'wood') {
    for (let y = 5; y <= 20; y++) {
      for (let x = 2; x <= 13; x++) {
        const p = (x - 2) % 3;
        c.set(x, y, p === 2 ? 'm' : p === 0 ? 'N' : 'M');
      }
    }
    for (const y of [7, 17]) {
      c.rect(2, y, 12, 1, 'N');
      c.rect(2, y + 1, 12, 1, 'm');
      c.set(3, y, 'D');
      c.set(12, y, 'D');
    }
    c.line(3, 16, 12, 9, 'N');
    c.line(3, 17, 12, 10, 'm');
    c.set(11, 12, 'Y');
    c.set(11, 13, 'r');
  } else {
    for (let y = 5; y <= 20; y++) {
      for (let x = 2; x <= 13; x++) {
        c.set(x, y, x === 2 || y === 5 ? 'L' : x === 13 || y === 20 ? 'F' : x === 3 && y < 12 ? 'L' : 'D');
      }
    }
    c.rect(5, 7, 6, 1, 'O'); // ช่องมอง
    c.rect(5, 8, 6, 1, 'L');
    for (const y of [10, 17]) {
      c.rect(2, y, 12, 1, 'F');
      for (const x of [3, 6, 9, 12]) c.set(x, y, 'W');
    }
    c.set(11, 13, 'Y');
    c.set(11, 14, 'r');
    c.set(12, 13, 'r');
  }
  return c.outline();
}

/** รั้วไม้ 16×14 — เสา 2 ต้น + ราว 2 เส้น (ราวชนขอบซ้ายขวาเพื่อต่อกันได้) */
function fence(): PixelCanvas {
  const c = pc(16, 14);
  c.shadow(8, 12.5, 8, 1.2);
  for (const y of [4, 8]) {
    c.rect(0, y, 16, 1, 'N');
    c.rect(0, y + 1, 16, 1, 'M');
    c.set(7, y + 1, 'm');
  }
  for (const x0 of [2, 11]) {
    c.set(x0 + 1, 1, 'N');
    for (let y = 2; y <= 12; y++) {
      c.set(x0, y, 'N');
      c.set(x0 + 1, y, 'M');
      c.set(x0 + 2, y, 'm');
    }
    c.set(x0 + 1, 2, 'N');
    c.set(x0 + 1, 4, 'D');
    c.set(x0 + 1, 8, 'D');
    c.set(x0 + 1, 11, 'm');
  }
  return c.outline();
}

// ---------------- พื้น (แบน เต็มช่อง ไม่มีเงา) ----------------

function floorWood(): PixelCanvas {
  const c = pc(16, 16);
  const rng = new RNG(511);
  for (let y = 0; y < 16; y++) {
    const plank = Math.floor(y / 4);
    const r = y % 4;
    const joint = (5 + plank * 7) % 16;
    for (let x = 0; x < 16; x++) {
      let col = 'N';
      if (r === 3) col = 'm';
      else if (x === joint) col = 'm';
      else if (r === 0 && dither(x, y) > 0.3) col = 'S';
      else if (r === 2 && (dither(x, y) > 0.35 || rng.chance(0.1))) col = 'M';
      else if (rng.chance(0.06)) col = 'M';
      c.set(x, y, col);
    }
    if (r === 1) {
      c.set((joint + 1) % 16, y, 'M');
      c.set((joint + 15) % 16, y, 'D');
    }
  }
  return c;
}

function floorStone(): PixelCanvas {
  const c = pc(16, 16);
  const rng = new RNG(522);
  for (let y = 0; y < 16; y++) {
    const off = Math.floor(y / 8) % 2 ? 4 : 0;
    for (let x = 0; x < 16; x++) {
      const lx = (x + off) % 8;
      const ly = y % 8;
      let col = 'L';
      if (lx === 0 || ly === 0) col = 'D';
      else if (lx === 1 || ly === 1) col = 'w';
      else if (lx === 7 || ly === 7) col = dither(x, y) > -0.1 ? 'D' : 'L';
      else if (dither(x, y) + (rng.next() - 0.5) * 0.4 > 0.5) col = 'w';
      else if (rng.chance(0.05)) col = 'D';
      c.set(x, y, col);
    }
  }
  return c;
}

function floorCarpet(): PixelCanvas {
  const c = pc(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.min(x, y, 15 - x, 15 - y);
      const md = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      let col = 'R';
      if (d === 0) col = 'P';
      else if (d === 1) col = (x + y) % 4 === 0 ? 'r' : 'Y';
      else if (d === 2) col = 'P';
      else if (md <= 1) col = 'y';
      else if (md <= 2) col = 'r';
      else if (md <= 3) col = 'Y';
      else if (md <= 4) col = 'P';
      else if (md <= 5 && (x + y) % 2 === 0) col = 'Y';
      else if (dither(x, y) > 0.42) col = 'P';
      c.set(x, y, col);
    }
  }
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) c.set(x, y, 'Y');
  return c;
}

function floorTile(): PixelCanvas {
  const c = pc(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const white = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      const lx = x % 8;
      const ly = y % 8;
      let col = white ? 'W' : 'b';
      if (lx === 7 || ly === 7) col = 'L';
      else if (lx === 0 || ly === 0) col = white ? 'W' : 'C';
      else if (lx === 6 || ly === 6) col = white ? 'w' : 'B';
      c.set(x, y, col);
    }
  }
  c.set(1, 1, 'C');
  c.set(9, 9, 'C');
  c.set(10, 2, 'W');
  c.set(2, 10, 'W');
  return c;
}

// ---------------- เฟอร์นิเจอร์ ----------------

function table(): PixelCanvas {
  const c = pc(16, 14);
  c.shadow(8, 12.5, 8, 1.5);
  c.rect(1, 10, 2, 3, 'M');
  c.rect(1, 10, 1, 3, 'N');
  c.rect(13, 10, 2, 3, 'm');
  c.rect(0, 3, 16, 5, 'N');
  c.rect(0, 3, 16, 1, 'S');
  c.line(2, 5, 7, 5, 'M');
  c.line(9, 6, 13, 6, 'M');
  c.set(12, 4, 'M');
  c.rect(0, 8, 16, 2, 'M');
  c.rect(0, 9, 16, 1, 'm');
  return c.outline();
}

function chair(): PixelCanvas {
  const c = pc(12, 14);
  c.shadow(6, 12.5, 5, 1.2);
  c.rect(2, 1, 8, 2, 'N');
  c.rect(2, 2, 8, 1, 'M');
  c.rect(2, 3, 1, 4, 'N');
  c.rect(9, 3, 1, 4, 'm');
  c.rect(4, 3, 1, 4, 'M');
  c.rect(7, 3, 1, 4, 'M');
  c.rect(1, 7, 10, 2, 'N');
  c.rect(1, 7, 10, 1, 'S');
  c.rect(1, 9, 10, 1, 'M');
  c.rect(1, 10, 1, 3, 'M');
  c.rect(10, 10, 1, 3, 'm');
  c.rect(3, 10, 1, 2, 'm');
  c.rect(8, 10, 1, 2, 'm');
  return c.outline();
}

function chest(open: boolean): PixelCanvas {
  const c = pc(16, 14);
  c.shadow(8, 12.5, 7.5, 1.5);
  // ตัวหีบ
  c.rect(1, 6, 14, 7, 'M');
  c.rect(1, 6, 1, 7, 'N');
  c.rect(14, 6, 1, 7, 'm');
  c.rect(1, 12, 14, 1, 'm');
  c.rect(2, 9, 12, 1, 'm');
  for (const x of [3, 12]) {
    c.rect(x, 6, 1, 7, 'D');
    c.set(x, 6, 'L');
  }
  if (open) {
    // ฝาเปิดพับไปด้านหลัง เห็นด้านใน
    c.rect(1, 0, 14, 4, 'm');
    c.rect(2, 1, 12, 2, 'n');
    for (const x of [3, 12]) c.rect(x, 0, 1, 4, 'F');
    c.rect(1, 4, 14, 2, 'n');
    c.blob(8, 5, 5.5, 1.8, ['r', 'Y', 'Y', 'y']);
    c.set(5, 4, 'W');
    c.set(10, 5, 'y');
    c.set(7, 4, 'R'); // อัญมณี
    c.set(11, 4, 'C');
    c.rect(7, 7, 2, 2, 'Y');
    return c.outline();
  }
  // ฝาโค้ง
  c.rect(3, 2, 10, 1, 'N');
  c.rect(2, 3, 12, 1, 'N');
  c.rect(1, 4, 14, 1, 'N');
  c.rect(1, 5, 14, 1, 'M');
  c.rect(4, 2, 5, 1, 'S');
  for (const x of [3, 12]) {
    c.rect(x, 2, 1, 4, 'D');
    c.set(x, 2, 'L');
  }
  c.rect(7, 5, 2, 3, 'Y');
  c.set(7, 5, 'y');
  c.set(8, 7, 'r');
  c.set(8, 6, 'n');
  return c.outline();
}

function bookshelf(): PixelCanvas {
  const c = pc(16, 26);
  const rng = new RNG(808);
  c.shadow(8, 24.5, 8, 1.5);
  c.rect(0, 1, 16, 24, 'M');
  c.rect(0, 1, 1, 24, 'N');
  c.rect(15, 1, 1, 24, 'm');
  c.rect(0, 1, 16, 2, 'N');
  c.rect(1, 1, 10, 1, 'S');
  c.rect(1, 3, 14, 19, 'n');
  for (const y of [8, 14, 20]) {
    c.rect(1, y, 14, 1, 'N');
    c.rect(1, y + 1, 14, 1, 'm');
  }
  c.rect(0, 22, 16, 3, 'M');
  c.rect(0, 22, 16, 1, 'N');
  c.rect(0, 24, 16, 1, 'm');
  const books: [string, string][] = [['R', 'P'], ['B', 'U'], ['G', 'T'], ['Y', 'r'], ['u', 'P'], ['b', 'B'], ['r', 'R'], ['g', 'G']];
  for (const [top, bottom] of [[3, 7], [10, 13], [16, 19]]) {
    let x = 2;
    while (x <= 13) {
      if (rng.chance(0.1)) {
        x++;
        continue;
      }
      const [light, dark] = rng.pick(books);
      const h = bottom - top + 1 - rng.int(0, 1);
      const w = x === 13 ? 1 : 2;
      for (let y = bottom - h + 1; y <= bottom; y++) {
        c.set(x, y, light);
        if (w === 2) c.set(x + 1, y, dark);
      }
      if (rng.chance(0.6)) c.set(x, bottom - h + 2, 'y');
      x += w;
    }
  }
  return c.outline();
}

function lamp(): PixelCanvas {
  const c = pc(10, 20);
  c.shadow(5, 18.5, 3, 1);
  c.rect(4, 9, 2, 8, 'F');
  c.rect(4, 9, 1, 8, 'D');
  c.rect(3, 16, 4, 2, 'F');
  c.rect(3, 16, 4, 1, 'D');
  c.rect(4, 1, 2, 1, 'D');
  c.rect(3, 2, 4, 1, 'F');
  c.rect(2, 3, 6, 1, 'D');
  c.rect(3, 4, 4, 4, 'Y');
  c.rect(4, 5, 2, 2, 'y');
  c.rect(2, 4, 1, 4, 'F');
  c.rect(7, 4, 1, 4, 'F');
  c.rect(2, 8, 6, 1, 'F');
  c.set(3, 8, 'D');
  c.outline();
  return halo(c, 5, 6, 5, '255,205,117', 0.3);
}

function flowerPot(): PixelCanvas {
  const c = pc(12, 14);
  c.shadow(6, 12.5, 4, 1);
  // ใบและดอก
  c.line(5, 6, 3, 3, 'G');
  c.line(6, 6, 8, 2, 'H');
  c.line(6, 6, 6, 4, 'G');
  c.set(4, 5, 'g');
  c.set(8, 4, 'g');
  c.set(2, 5, 'G');
  c.set(9, 5, 'H');
  c.blob(3, 3, 1.6, 1.5, ['R', 'p', 'W']);
  c.blob(8.5, 2, 1.6, 1.5, ['P', 'u', 'W']);
  c.blob(6, 4, 1.2, 1.2, ['r', 'Y', 'y']);
  c.set(3, 3, 'Y');
  c.set(8, 2, 'Y');
  // กระถางดินเผา
  for (let y = 8; y <= 12; y++) {
    const inset = Math.floor((y - 8) / 2);
    for (let x = 2 + inset; x <= 9 - inset; x++) {
      c.set(x, y, x <= 3 + inset ? 'r' : x >= 8 - inset || y === 12 ? 'R' : dither(x, y) > 0.3 ? 'R' : 'r');
    }
  }
  c.rect(1, 6, 10, 2, 'r');
  c.rect(2, 6, 8, 1, 'n');
  c.rect(1, 7, 10, 1, 'r');
  c.set(1, 7, 'Y');
  c.set(10, 7, 'R');
  c.set(9, 7, 'R');
  return c.outline();
}

function statue(): PixelCanvas {
  const c = pc(16, 30);
  c.shadow(8, 28, 7.5, 1.8);
  // ฐาน
  c.rect(1, 22, 14, 6, 'D');
  c.rect(1, 22, 14, 2, 'L');
  c.rect(1, 22, 6, 1, 'W');
  c.rect(1, 24, 1, 4, 'L');
  c.rect(14, 24, 1, 4, 'F');
  c.rect(1, 27, 14, 1, 'F');
  c.rect(5, 25, 6, 1, 'Y');
  c.set(5, 25, 'y');
  // ขา
  c.rect(5, 16, 2, 6, 'L');
  c.rect(5, 16, 1, 6, 'W');
  c.rect(9, 16, 2, 6, 'D');
  // ผ้าคลุม
  c.rect(11, 9, 2, 11, 'D');
  c.rect(12, 10, 1, 10, 'F');
  // ลำตัว
  c.rect(4, 9, 7, 7, 'L');
  c.rect(4, 9, 1, 7, 'W');
  c.rect(9, 9, 2, 7, 'D');
  c.rect(4, 14, 7, 1, 'D');
  c.set(7, 14, 'L');
  // หัว
  c.blob(7.5, 5.5, 2.5, 2.6, ['D', 'L', 'W']);
  // แขนชูดาบ
  c.line(4, 10, 2, 7, 'L');
  c.line(5, 10, 3, 7, 'D');
  c.rect(1, 6, 3, 1, 'D');
  c.rect(2, 1, 1, 5, 'W');
  c.set(2, 0, 'W');
  // ตะไคร่
  for (const [x, y] of [[2, 26], [3, 27], [12, 23], [6, 21], [13, 26]]) c.set(x, y, y > 25 ? 'H' : 'G');
  return c.outline();
}

/** พรมตกแต่ง 32×16 (แบน ไม่มีเงา) */
function rug(): PixelCanvas {
  const c = pc(32, 16);
  for (let y = 1; y <= 14; y++) {
    for (let x = 2; x <= 29; x++) {
      const d = Math.min(x - 2, y - 1, 29 - x, 14 - y);
      const md = Math.abs(x - 15.5) / 2 + Math.abs(y - 7.5);
      let col = 'R';
      if (d === 0) col = 'P';
      else if (d === 1) col = 'Y';
      else if (d === 2) col = (x + y) % 2 ? 'P' : 'R';
      else if (md < 1.5) col = 'y';
      else if (md < 2.5) col = 'Y';
      else if (md < 3.5) col = 'B';
      else if (md < 4.5) col = 'Y';
      else if (dither(x, y) > 0.42) col = 'P';
      c.set(x, y, col);
    }
  }
  for (const [x, y] of [[5, 4], [26, 4], [5, 11], [26, 11]]) {
    c.set(x, y, 'Y');
    c.set(x - 1, y, 'r');
    c.set(x + 1, y, 'r');
    c.set(x, y - 1, 'r');
    c.set(x, y + 1, 'r');
  }
  for (let y = 2; y <= 13; y += 2) {
    c.rect(0, y, 2, 1, 'W');
    c.rect(30, y, 2, 1, 'w');
  }
  return c;
}

function bannerFlag(): PixelCanvas {
  const c = pc(10, 28);
  c.shadow(3, 26.5, 3, 1);
  c.rect(1, 2, 2, 25, 'M');
  c.rect(1, 2, 1, 25, 'N');
  c.blob(2, 1.5, 1.3, 1.3, ['r', 'Y', 'y']);
  for (let x = 3; x <= 8; x++) {
    const yo = Math.round(Math.sin(x * 0.9) * 0.8);
    for (let y = 3 + yo; y <= 15 + yo; y++) {
      if (x >= 7 && y >= 11 + yo && y <= 13 + yo) continue; // ปลายแฉก
      c.set(x, y, yo > 0 || x === 8 ? 'P' : y === 3 + yo ? 'r' : 'R');
    }
  }
  c.rect(4, 7, 2, 3, 'Y');
  c.set(4, 7, 'y');
  c.set(3, 3, 'Y');
  return c.outline();
}

function barrel(): PixelCanvas {
  const c = pc(12, 14);
  c.shadow(6, 12.5, 5, 1.2);
  for (let y = 3; y <= 12; y++) {
    const hw = y >= 5 && y <= 10 ? 5 : 4;
    for (let x = 6 - hw; x <= 5 + hw; x++) {
      const rel = (x + 0.5 - 6) / hw;
      let col = rel < -0.45 ? 'N' : rel < 0.35 ? 'M' : 'm';
      if ((x === 4 || x === 8) && col !== 'm') col = col === 'N' ? 'M' : 'm';
      c.set(x, y, col);
    }
  }
  for (const y of [4, 10]) {
    for (let x = 1; x <= 10; x++) if (c.get(x, y)) c.set(x, y, x < 4 ? 'L' : 'D');
  }
  c.ellipse(6, 2.5, 4.5, 1.6, 'm');
  c.ellipse(6, 2.5, 3.5, 1.1, 'N');
  c.set(4, 2, 'S');
  return c.outline();
}

function crateBox(): PixelCanvas {
  const c = pc(14, 14);
  c.shadow(7, 12.5, 6.5, 1.2);
  c.rect(1, 1, 12, 3, 'N');
  c.rect(1, 1, 12, 1, 'S');
  c.line(2, 2, 11, 2, 'N');
  c.set(6, 2, 'M');
  c.rect(1, 4, 12, 8, 'M');
  c.line(2, 10, 11, 5, 'N');
  c.line(2, 11, 11, 6, 'm');
  c.rect(1, 4, 1, 8, 'N');
  c.rect(12, 4, 1, 8, 'm');
  c.rect(1, 4, 12, 1, 'N');
  c.rect(1, 11, 12, 1, 'm');
  for (const [x, y] of [[2, 5], [11, 5], [2, 10], [11, 10]]) c.set(x, y, 'D');
  return c.outline();
}

// ---------------- เครื่องจักร ----------------

function anvil(): PixelCanvas {
  const c = pc(18, 12);
  c.shadow(9, 10.5, 8, 1.5);
  c.rect(4, 8, 10, 3, 'F');
  c.rect(4, 8, 10, 1, 'D');
  c.set(3, 10, 'F');
  c.set(14, 10, 'F');
  c.rect(6, 6, 6, 2, 'D');
  c.rect(6, 6, 1, 2, 'L');
  c.rect(11, 6, 1, 2, 'F');
  c.rect(3, 2, 13, 4, 'D');
  c.rect(3, 2, 13, 2, 'L');
  c.rect(4, 2, 8, 1, 'W');
  c.rect(3, 5, 13, 1, 'F');
  c.rect(16, 2, 1, 3, 'D');
  c.set(16, 2, 'L');
  // เขาทั่ง
  c.set(2, 2, 'L');
  c.set(2, 3, 'L');
  c.set(2, 4, 'D');
  c.set(1, 3, 'D');
  return c.outline();
}

function mechBench(): PixelCanvas {
  const c = pc(26, 20);
  c.shadow(13, 18.5, 12.5, 1.5);
  // ขาและชั้นล่าง
  c.rect(2, 12, 2, 6, 'M');
  c.rect(2, 12, 1, 6, 'N');
  c.rect(22, 12, 2, 6, 'm');
  c.rect(4, 15, 18, 1, 'm');
  c.rect(6, 13, 3, 2, 'D');
  c.set(6, 13, 'L');
  c.rect(15, 13, 4, 2, 'R');
  c.set(15, 13, 'r');
  // หน้าโต๊ะ
  c.rect(0, 6, 26, 5, 'N');
  c.rect(0, 6, 26, 1, 'S');
  c.rect(0, 11, 26, 2, 'M');
  c.rect(0, 12, 26, 1, 'm');
  c.set(18, 8, 'M');
  c.set(23, 9, 'M');
  // พิมพ์เขียว
  c.rect(2, 6, 10, 4, 'b');
  c.rect(2, 9, 10, 1, 'B');
  c.line(3, 7, 7, 7, 'W');
  c.line(5, 8, 10, 8, 'C');
  c.set(9, 7, 'W');
  c.set(10, 7, 'C');
  c.set(11, 6, 'C');
  c.set(3, 8, 'C');
  // เฟือง
  const gear = (gx: number, gy: number, r: number, teeth: number) => {
    for (let y = Math.floor(gy - r - 1); y <= gy + r + 1; y++) {
      for (let x = Math.floor(gx - r - 1); x <= gx + r + 1; x++) {
        const dx = x + 0.5 - gx;
        const dy = y + 0.5 - gy;
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        if (d > r + 0.9 || (d > r - 0.4 && Math.cos(a * teeth) < 0.1)) continue;
        if (d < r * 0.32) {
          c.set(x, y, 'F');
          continue;
        }
        const v = -(dx * 0.55 + dy * 0.8) / r + dither(x, y) * 0.3;
        c.set(x, y, v > 0.45 ? 'W' : v > -0.1 ? 'L' : 'D');
      }
    }
  };
  gear(17, 5, 4, 8);
  gear(22.5, 7.5, 2.2, 5);
  // ประแจ
  c.line(12, 10, 14, 8, 'L');
  c.set(14, 7, 'L');
  c.set(15, 8, 'L');
  c.set(12, 10, 'D');
  return c.outline();
}

function generator(frame: number): PixelCanvas {
  const c = pc(20, 20);
  const on = frame > 0;
  c.shadow(10, 18.5, 9.5, 1.5);
  c.rect(3, 17, 2, 1, 'F');
  c.rect(15, 17, 2, 1, 'F');
  // ท่อไอเสีย
  c.rect(14, 1, 2, 5, 'F');
  c.rect(14, 1, 1, 5, 'D');
  c.rect(13, 1, 4, 1, 'D');
  // ตัวเครื่อง
  c.rect(2, 7, 16, 10, 'D');
  c.rect(2, 7, 1, 10, 'L');
  c.rect(17, 7, 1, 10, 'F');
  c.rect(2, 16, 16, 1, 'F');
  c.rect(2, 5, 16, 2, 'L');
  c.rect(3, 5, 8, 1, 'W');
  c.set(5, 5, 'R');
  c.set(6, 5, 'R');
  // ช่องระบายอากาศ
  for (const y of [8, 10, 12]) c.rect(4, y, 6, 1, on ? (frame === 1 ? 'R' : 'r') : 'F');
  if (on) c.rect(5, 10, 4, 1, frame === 1 ? 'r' : 'Y');
  // แผงควบคุม
  c.rect(11, 8, 5, 4, 'F');
  c.set(12, 9, on ? (frame === 1 ? 'g' : 'G') : 'D');
  c.set(14, 9, on ? (frame === 1 ? 'R' : 'r') : 'D');
  c.rect(12, 10, 3, 1, on ? 'C' : 'U');
  // แถบเตือน
  for (let x = 3; x <= 16; x++) c.set(x, 14, Math.floor((x + (on ? frame : 0)) / 2) % 2 ? 'Y' : 'F');
  c.outline();
  if (on) {
    // ควัน
    const puffs = frame === 1 ? [[16, 0, 'L'], [17, 0, 'W'], [13, 0, 'D']] : [[12, 0, 'L'], [17, 1, 'W'], [18, 0, 'L']];
    for (const [x, y, col] of puffs as [number, number, string][]) c.set(x, y, col);
    halo(c, 7, 11, 6, '239,125,87', 0.18);
  }
  return c;
}

function windmill(frame: number): PixelCanvas {
  const c = pc(26, 42);
  c.shadow(13, 40, 9, 2);
  // หอไม้
  for (let y = 16; y <= 39; y++) {
    const hw = 4 + ((y - 16) / 23) * 3;
    for (let x = Math.round(13 - hw); x <= Math.round(13 + hw) - 1; x++) {
      const rel = (x + 0.5 - 13) / hw;
      let col = rel < -0.5 ? 'N' : rel < 0.4 ? 'M' : 'm';
      if (y % 4 === 0) col = rel < -0.5 ? 'M' : 'm';
      c.set(x, y, col);
    }
  }
  c.rect(11, 33, 4, 7, 'n');
  c.rect(12, 32, 2, 1, 'n');
  c.set(14, 36, 'Y');
  c.rect(12, 22, 2, 3, 'Y');
  c.set(12, 22, 'y');
  // หลังคาหัวกังหัน
  for (let y = 9; y <= 17; y++) {
    const hw = 2 + (y - 9) * 0.7;
    for (let x = Math.round(13 - hw); x <= Math.round(13 + hw) - 1; x++) {
      const rel = (x + 0.5 - 13) / hw;
      c.set(x, y, y === 17 ? 'n' : rel < -0.3 ? 'r' : rel < 0.45 ? 'R' : 'P');
    }
  }
  // ใบพัด 4 ใบ (หมุน 22.5° ต่อเฟรม)
  const hx = 13;
  const hy = 13;
  for (let b = 0; b < 4; b++) {
    const a = frame * (Math.PI / 8) + b * (Math.PI / 2) - Math.PI / 4;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 26; x++) {
        const px = x + 0.5 - hx;
        const py = y + 0.5 - hy;
        const t = px * dx + py * dy;
        const s = -px * dy + py * dx;
        if (t < 1 || t > 11.8) continue;
        if (Math.abs(s) < 0.7) c.set(x, y, 'm');
        else if (t >= 3.2 && s >= 0.7 && s <= 4.2) {
          const edge = s > 3.4 || t > 11;
          c.set(x, y, edge ? 'M' : Math.abs(t - 7.5) < 0.5 ? 'L' : s < 2.2 ? 'W' : 'w');
        }
      }
    }
  }
  c.blob(13, 13, 1.6, 1.6, ['F', 'D', 'L']);
  return c.outline();
}

function autoMiner(frame: number): PixelCanvas {
  const c = pc(20, 24);
  const off = frame ? 2 : 0;
  c.shadow(10, 22.5, 9, 1.5);
  c.ellipse(9.5, 21.5, 3, 1, 'n');
  // โครงขาตั้ง
  c.line(3, 21, 9, 3, 'D');
  c.line(4, 21, 10, 3, 'F');
  c.line(16, 21, 10, 3, 'F');
  c.line(5, 15, 14, 15, 'F');
  c.line(7, 9, 12, 9, 'F');
  c.rect(2, 21, 3, 1, 'F');
  c.rect(15, 21, 3, 1, 'F');
  // ก้านสว่าน
  for (let y = 4 + off; y <= 17 + off; y++) {
    c.set(9, y, 'L');
    c.set(10, y, 'D');
    if ((y + off) % 3 === 0) c.set(9, y, 'F');
    if ((y + off) % 3 === 1) c.set(10, y, 'W');
  }
  c.rect(8, 18 + off, 4, 1, 'D');
  c.rect(9, 19 + off, 2, 1, 'L');
  if (!frame) c.set(9, 20, 'W');
  c.blob(9.5, 2.5, 2, 1.5, ['F', 'D', 'L']);
  // มอเตอร์
  c.rect(12, 14, 7, 7, 'Y');
  c.rect(12, 14, 7, 1, 'y');
  c.rect(12, 14, 1, 7, 'y');
  c.rect(18, 14, 1, 7, 'r');
  c.rect(12, 20, 7, 1, 'r');
  for (let x = 13; x <= 17; x++) c.set(x, 19, (x + frame) % 2 ? 'F' : 'Y');
  c.rect(14, 16, 3, 2, 'F');
  c.set(14, 16, frame ? 'g' : 'G');
  c.set(16, 17, 'R');
  c.line(11, 16, 11, 13, 'F');
  c.set(11, 13 + off, 'D');
  c.outline();
  if (frame) {
    for (const [x, y] of [[6, 22], [13, 21], [5, 20], [14, 19]]) c.set(x, y, 'S');
  } else {
    c.set(7, 21, 's');
    c.set(12, 22, 's');
  }
  return c;
}

function sprinkler(frame: number): PixelCanvas {
  const c = pc(12, 12);
  c.shadow(6, 10.5, 3, 1);
  c.rect(5, 7, 2, 3, 'D');
  c.rect(5, 7, 1, 3, 'L');
  c.rect(4, 6, 4, 1, 'L');
  c.rect(5, 5, 2, 1, 'D');
  c.set(4, 6, 'W');
  c.outline();
  for (let k = 0; k < 6; k++) {
    const a = k * (Math.PI / 3) + (frame ? Math.PI / 6 : 0) - Math.PI / 2;
    const r = k % 2 === frame ? 3.6 : 4.8;
    const x = Math.round(6 + Math.cos(a) * r);
    const y = Math.round(5 + Math.sin(a) * r * 0.8);
    c.set(x, y, k % 2 ? 'b' : 'C');
  }
  if (frame) c.set(6, 1, 'W');
  else c.set(5, 2, 'C');
  return c;
}

function turretArrow(): PixelCanvas {
  const c = pc(18, 22);
  c.shadow(9, 20.5, 7, 1.5);
  // ขาตั้ง
  c.line(4, 20, 8, 12, 'M');
  c.line(14, 20, 10, 12, 'm');
  c.line(9, 20, 9, 12, 'M');
  c.rect(6, 11, 6, 2, 'N');
  c.rect(6, 12, 6, 1, 'M');
  // คันธนูใหญ่
  for (let y = 2; y <= 15; y++) {
    const x = 12 - Math.round(((y - 8.5) / 6.5) ** 2 * 2);
    c.set(x, y, 'N');
    c.set(x + 1, y, 'm');
  }
  // แกนราง
  c.rect(2, 8, 13, 2, 'M');
  c.rect(2, 8, 13, 1, 'N');
  c.rect(2, 8, 1, 2, 'm');
  // สาย
  c.line(10, 2, 4, 7, 'L');
  c.line(10, 15, 4, 10, 'L');
  // ลูกดอก
  c.line(4, 7, 15, 7, 'L');
  c.set(16, 7, 'W');
  c.set(15, 6, 'W');
  c.set(15, 8, 'D');
  c.set(4, 6, 'R');
  c.set(5, 6, 'r');
  return c.outline();
}

function turretCannon(): PixelCanvas {
  const c = pc(20, 20);
  c.shadow(10, 18.5, 9, 1.5);
  // ฐานหิน
  c.rect(2, 13, 16, 5, 'D');
  c.rect(2, 13, 16, 1, 'L');
  c.rect(2, 13, 1, 5, 'L');
  c.rect(17, 14, 1, 4, 'F');
  c.rect(2, 17, 16, 1, 'F');
  c.rect(3, 15, 14, 1, 'F');
  for (const x of [7, 12]) c.set(x, 16, 'F');
  for (const x of [5, 10, 15]) c.set(x, 14, 'F');
  // แท่นไม้
  c.rect(4, 9, 10, 4, 'M');
  c.rect(4, 9, 10, 1, 'N');
  c.rect(13, 10, 1, 3, 'm');
  // ล้อ
  c.blob(7, 12, 2.6, 2.6, ['m', 'M', 'N']);
  c.set(7, 12, 'D');
  c.line(5, 12, 9, 12, 'm');
  // ลำกล้อง
  const shade = ['L', 'L', 'D', 'D', 'F'];
  for (let y = 5; y <= 9; y++) c.rect(5, y, 11, 1, shade[y - 5]);
  c.rect(7, 6, 7, 1, 'W');
  for (const x of [9, 13]) {
    c.rect(x, 5, 1, 5, 'F');
    c.set(x, 5, 'L');
  }
  c.rect(16, 4, 2, 7, 'F');
  c.rect(16, 4, 2, 1, 'L');
  c.set(16, 5, 'D');
  c.blob(4.5, 7.5, 2.5, 2.5, ['F', 'D', 'L']);
  c.set(1, 7, 'D');
  return c.outline();
}

function lampPost(): PixelCanvas {
  const c = pc(10, 32);
  c.shadow(5, 30.5, 3, 1);
  c.rect(3, 27, 4, 3, 'F');
  c.rect(3, 27, 4, 1, 'D');
  c.rect(2, 29, 6, 1, 'F');
  c.rect(4, 8, 2, 19, 'F');
  c.rect(4, 8, 1, 19, 'D');
  c.rect(3, 16, 4, 1, 'D');
  c.rect(4, 1, 2, 1, 'F');
  c.rect(3, 2, 4, 1, 'D');
  c.rect(2, 3, 6, 1, 'F');
  c.rect(3, 4, 4, 3, 'C');
  c.rect(4, 4, 2, 2, 'W');
  c.rect(3, 6, 4, 1, 'b');
  c.rect(3, 7, 4, 1, 'F');
  c.outline();
  return halo(c, 5, 5, 5, '115,239,247', 0.3);
}

// ---------------- อาคารสำเร็จรูป ----------------

/** แถวกระเบื้องหลังคาทรงคางหมู */
function roof(
  c: PixelCanvas, y0: number, y1: number, top0: number, top1: number, bot0: number, bot1: number,
  base: string, light: string, dark: string, rowH = 3,
) {
  for (let y = y0; y <= y1; y++) {
    const k = (y - y0) / (y1 - y0);
    const x0 = Math.round(top0 + (bot0 - top0) * k);
    const x1 = Math.round(top1 + (bot1 - top1) * k);
    const sr = Math.floor((y - y0) / rowH);
    const ry = (y - y0) % rowH;
    for (let x = x0; x <= x1; x++) {
      let col = base;
      if (ry === rowH - 1) col = dark;
      else if ((x + (sr % 2 ? 2 : 0)) % 4 === 0) col = dark;
      else if (ry === 0 && dither(x, y) > 0) col = light;
      if (x - x0 < 2) col = ry === rowH - 1 ? base : light; // ข้างหลังคาด้านรับแสง
      if (x1 - x < 2) col = dark;
      c.set(x, y, col);
    }
  }
}

function cabin(): PixelCanvas {
  const c = pc(48, 48);
  c.shadow(24, 45.5, 23, 2.5);
  // ผนังซุง
  for (let y = 25; y <= 44; y++) {
    const r = (y - 25) % 3;
    for (let x = 4; x <= 43; x++) c.set(x, y, r === 0 ? (dither(x, y) > 0.35 ? 'S' : 'N') : r === 1 ? 'M' : 'm');
  }
  for (let y0 = 25; y0 <= 42; y0 += 3) {
    for (const cx of [2.5, 45.5]) {
      c.ellipse(cx, y0 + 1.5, 1.7, 1.5, 'M');
      c.set(Math.floor(cx), y0 + 1, 'N');
      c.set(Math.floor(cx) - 1, y0, 'S');
    }
  }
  // ประตู
  c.rect(19, 30, 10, 15, 'n');
  c.rect(20, 31, 8, 14, 'M');
  for (const x of [22, 25]) c.rect(x, 31, 1, 14, 'm');
  c.rect(20, 31, 1, 14, 'N');
  c.rect(20, 34, 8, 1, 'm');
  c.rect(20, 41, 8, 1, 'm');
  c.set(26, 38, 'Y');
  c.set(26, 39, 'r');
  c.rect(18, 44, 12, 1, 'D');
  // หน้าต่างมีแสงไฟ
  for (const wx of [7, 33]) {
    c.rect(wx, 29, 8, 7, 'n');
    c.rect(wx + 1, 30, 6, 5, 'Y');
    c.rect(wx + 1, 30, 2, 2, 'y');
    c.rect(wx + 4, 30, 1, 5, 'M');
    c.rect(wx + 1, 32, 6, 1, 'M');
    c.rect(wx - 1, 36, 10, 1, 'N');
    c.rect(wx, 37, 8, 1, 'm');
  }
  // กระถางดอกไม้ใต้หน้าต่างซ้าย
  for (const [x, col] of [[8, 'R'], [10, 'p'], [12, 'Y'], [14, 'R']] as [number, string][]) {
    c.set(x, 35, col);
    c.set(x - 1, 35, 'G');
  }
  // หลังคากระเบื้องแดงอมน้ำตาล
  roof(c, 5, 24, 10, 37, 0, 47, 'R', 'r', 'P');
  c.rect(10, 4, 28, 2, 'm');
  c.rect(10, 4, 28, 1, 'M');
  c.rect(0, 24, 48, 1, 'P');
  c.rect(4, 25, 40, 1, 'n');
  for (let x = 4; x <= 43; x++) if (dither(x, 26) > 0) c.set(x, 26, 'm');
  // ปล่องไฟหิน
  for (let y = 0; y <= 11; y++) {
    for (let x = 33; x <= 38; x++) {
      const mortar = y % 3 === 2 || (x + (Math.floor(y / 3) % 2 ? 1 : 0)) % 3 === 0;
      c.set(x, y, mortar ? 'D' : x < 35 ? 'W' : 'L');
    }
  }
  c.rect(32, 0, 8, 2, 'D');
  c.rect(32, 0, 8, 1, 'L');
  c.rect(34, 0, 4, 1, 'F');
  return c.outline();
}

function stoneHouse(): PixelCanvas {
  const c = pc(48, 54);
  const rng = new RNG(1212);
  c.shadow(24, 51.5, 23, 2.5);
  // ผนังหิน
  for (let y = 28; y <= 51; y++) {
    const row = Math.floor((y - 28) / 4);
    const off = row % 2 ? 3 : 0;
    for (let x = 3; x <= 44; x++) {
      const mortar = (y - 28) % 4 === 3 || (x + off) % 6 === 0;
      let col = mortar ? 'D' : (y - 28) % 4 === 0 ? 'w' : dither(x, y) + (rng.next() - 0.5) * 0.3 > 0.45 ? 'D' : 'L';
      if (!mortar && (x <= 4 || x >= 43)) col = x <= 4 ? 'W' : 'D';
      c.set(x, y, col);
    }
  }
  c.rect(3, 50, 42, 2, 'D');
  c.rect(3, 51, 42, 1, 'F');
  // ประตูโค้ง
  const arch = (cx: number, top: number, hw: number, bottom: number, col: string) => {
    for (let y = top; y <= bottom; y++) {
      const dy = top + hw - y;
      const w = dy > 0 ? Math.sqrt(Math.max(0, hw * hw - dy * dy)) : hw;
      for (let x = Math.round(cx - w); x <= Math.round(cx + w) - 1; x++) c.set(x, y, col);
    }
  };
  arch(24, 35, 6, 51, 'F');
  arch(24, 36, 5, 51, 'M');
  for (const x of [21, 24, 27]) c.rect(x, 38, 1, 13, 'm');
  c.rect(19, 38, 1, 13, 'N');
  for (const y of [42, 47]) c.rect(19, y, 10, 1, 'F');
  c.set(26, 44, 'Y');
  c.set(26, 45, 'r');
  c.rect(17, 51, 14, 1, 'L');
  // หน้าต่าง 2 บาน
  for (const wx of [10.5, 37.5]) {
    arch(wx, 31, 4, 40, 'F');
    arch(wx, 32, 3, 39, 'b');
    c.rect(Math.round(wx - 3), 37, 6, 3, 'B');
    c.rect(Math.round(wx - 3), 33, 2, 2, 'C');
    c.rect(Math.round(wx) - 1, 32, 1, 8, 'L');
    c.rect(Math.round(wx - 3), 36, 6, 1, 'L');
    c.rect(Math.round(wx - 5), 40, 10, 1, 'W');
    c.rect(Math.round(wx - 5), 41, 10, 1, 'D');
  }
  // หลังคากระดานชนวนสีน้ำเงิน
  roof(c, 4, 27, 12, 35, 0, 47, 'B', 'b', 'U');
  c.rect(12, 3, 24, 2, 'D');
  c.rect(12, 3, 24, 1, 'L');
  c.rect(0, 27, 48, 1, 'U');
  c.rect(3, 28, 42, 1, 'F');
  for (let x = 3; x <= 44; x++) if (dither(x, 29) > 0) c.set(x, 29, 'D');
  // ปล่องไฟ
  for (let y = 0; y <= 10; y++) for (let x = 9; x <= 13; x++) c.set(x, y, y % 3 === 2 || (x + Math.floor(y / 3)) % 3 === 0 ? 'D' : x < 11 ? 'W' : 'L');
  c.rect(8, 0, 7, 1, 'L');
  c.rect(10, 0, 3, 1, 'F');
  return c.outline();
}

function watchtower(): PixelCanvas {
  const c = pc(32, 58);
  c.shadow(16, 55.5, 13, 2);
  // เสาด้านหลัง
  for (const x of [8, 22]) c.rect(x, 26, 2, 25, 'm');
  // ค้ำไขว้
  c.line(7, 29, 24, 50, 'M');
  c.line(24, 29, 7, 50, 'm');
  c.rect(7, 40, 18, 1, 'm');
  // บันได
  for (let y = 26; y <= 55; y++) {
    c.set(13, y, 'N');
    c.set(18, y, 'M');
    if (y % 3 === 0) c.rect(14, y, 4, 1, 'N');
  }
  // เสาด้านหน้า
  for (const x of [4, 25]) {
    c.rect(x, 22, 3, 34, 'M');
    c.rect(x, 22, 1, 34, 'N');
    c.rect(x + 2, 22, 1, 34, 'm');
  }
  // ห้องเฝ้าระวัง (ด้านในมืด)
  c.rect(4, 10, 24, 6, 'n');
  // เสาหลังคา
  for (const x of [3, 27]) {
    c.rect(x, 8, 2, 16, 'M');
    c.set(x, 8, 'N');
  }
  // พื้นแท่น
  c.rect(1, 21, 30, 4, 'N');
  for (let x = 4; x < 30; x += 4) c.rect(x, 21, 1, 4, 'M');
  c.rect(1, 21, 30, 1, 'S');
  c.rect(1, 25, 30, 2, 'M');
  c.rect(1, 26, 30, 1, 'm');
  // ราวกันตก
  for (const x of [2, 9, 16, 22, 29]) c.rect(x, 14, 1, 7, 'M');
  c.rect(1, 14, 30, 2, 'N');
  c.rect(1, 15, 30, 1, 'M');
  c.rect(1, 18, 30, 1, 'M');
  // หลังคา
  for (let y = 1; y <= 10; y++) {
    const hw = Math.min(16, 2.5 + (y - 1) * 1.55);
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) {
      const rel = (x + 0.5 - 16) / hw;
      let col = rel < -0.45 ? 'r' : rel < 0.4 ? 'R' : 'P';
      if (y % 3 === 0 && rel > -0.45) col = 'P';
      if (y === 10) col = 'm';
      c.set(x, y, col);
    }
  }
  c.set(15, 0, 'Y');
  c.set(16, 0, 'Y');
  return c.outline();
}

function warehouse(): PixelCanvas {
  const c = pc(64, 44);
  c.shadow(32, 41.5, 31, 2.5);
  // ผนังหน้าจั่ว (ทรงโรงนา)
  const cx = 32;
  const gableHW = (y: number) => (y < 10 ? 12 + (y - 4) * 2 : Math.min(29, 24 + (y - 10) * 0.75));
  for (let y = 4; y <= 41; y++) {
    const hw = y < 18 ? gableHW(y) : 29;
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw) - 1; x++) {
      let col = x % 3 === 0 ? 'P' : 'R';
      if (col === 'R' && x < 20 && dither(x, y) > 0.3) col = 'r';
      if (y === 41) col = 'P';
      c.set(x, y, col);
    }
  }
  // ขอบหลังคา (มองจากด้านหน้า)
  for (let y = 2; y <= 18; y++) {
    const hw = gableHW(Math.max(4, y + 2)) + 2;
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const x = Math.round(cx + side * (hw - k)) - (side > 0 ? 1 : 0);
        c.set(x, y, k === 2 ? 'F' : side < 0 ? (k === 0 ? 'L' : 'D') : 'D');
      }
    }
  }
  c.rect(cx - 12, 2, 24, 2, 'D');
  c.rect(cx - 12, 2, 24, 1, 'L');
  c.rect(1, 18, 62, 2, 'D');
  c.rect(1, 18, 62, 1, 'L');
  c.rect(3, 20, 58, 1, 'P');
  // มุมผนังขาว
  for (const x of [3, 59]) {
    c.rect(x, 20, 2, 22, 'W');
    c.rect(x + 1, 20, 1, 22, 'L');
  }
  // ประตูใหญ่
  c.rect(21, 23, 22, 19, 'W');
  c.rect(22, 24, 20, 18, 'R');
  for (let x = 22; x <= 41; x += 3) c.rect(x, 24, 1, 18, 'P');
  for (const [x0, x1] of [[22, 31], [32, 41]]) {
    c.line(x0, 24, x1, 41, 'W');
    c.line(x1, 24, x0, 41, 'W');
    c.rect(x0, 24, x1 - x0 + 1, 1, 'W');
    c.rect(x0, 32, x1 - x0 + 1, 1, 'W');
  }
  c.rect(31, 24, 2, 18, 'O');
  c.set(30, 33, 'D');
  c.set(33, 33, 'D');
  // ช่องใต้หลังคาใส่ฟาง
  c.rect(26, 7, 12, 10, 'W');
  c.rect(27, 8, 10, 8, 'n');
  for (let y = 11; y <= 15; y++) {
    for (let x = 27; x <= 36; x++) if (y > 12 || dither(x, y) > -0.2) c.set(x, y, dither(x, y) > 0.2 ? 'y' : y > 13 ? 's' : 'Y');
  }
  c.rect(30, 4, 4, 2, 'M');
  c.set(32, 6, 'D');
  // หน้าต่างข้าง
  for (const wx of [9, 49]) {
    c.rect(wx, 22, 7, 6, 'W');
    c.rect(wx + 1, 23, 5, 4, 'U');
    c.set(wx + 1, 23, 'b');
    c.rect(wx + 3, 23, 1, 4, 'W');
  }
  // ฟ่อนฟาง
  for (const [bx, by] of [[6, 34], [14, 35], [48, 34], [10, 30]]) {
    c.rect(bx, by, 8, 7, 'Y');
    c.rect(bx, by, 8, 1, 'y');
    c.rect(bx + 7, by, 1, 7, 's');
    c.rect(bx, by + 6, 8, 1, 's');
    c.rect(bx + 2, by, 1, 7, 'N');
    c.rect(bx + 5, by, 1, 7, 'N');
    for (let i = 0; i < 4; i++) c.set(bx + 1 + i * 2, by + 2 + (i % 3), 'S');
  }
  return c.outline();
}

function lighthouse(): PixelCanvas {
  const c = pc(32, 66);
  c.shadow(16, 63.5, 13, 2);
  // ฐานหิน
  c.rect(3, 57, 26, 6, 'D');
  c.rect(3, 57, 26, 2, 'L');
  c.rect(3, 57, 12, 1, 'W');
  c.rect(3, 62, 26, 1, 'F');
  for (const x of [8, 14, 20, 26]) c.rect(x, 59, 1, 3, 'F');
  c.rect(3, 60, 26, 1, 'F');
  // ลำตัวลายทางแดงขาว
  for (let y = 16; y <= 57; y++) {
    const hw = 6 + ((y - 16) / 41) * 3;
    const red = Math.floor((y - 16) / 7) % 2 === 1;
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) {
      const rel = (x + 0.5 - 16) / hw + dither(x, y) * 0.15;
      const col = rel < -0.5 ? (red ? 'r' : 'W') : rel < 0.45 ? (red ? 'R' : 'w') : red ? 'P' : 'L';
      c.set(x, y, col);
    }
  }
  c.rect(14, 50, 4, 7, 'n');
  c.rect(15, 49, 2, 1, 'n');
  c.set(17, 53, 'Y');
  for (const y of [27, 40]) {
    c.rect(15, y, 2, 3, 'U');
    c.set(15, y, 'b');
  }
  // ระเบียง
  c.rect(7, 14, 18, 2, 'F');
  c.rect(7, 14, 18, 1, 'D');
  c.rect(7, 11, 18, 1, 'D');
  for (let x = 7; x <= 24; x += 3) c.rect(x, 11, 1, 3, 'F');
  // ห้องโคมไฟ
  c.rect(11, 6, 10, 6, 'Y');
  c.rect(13, 7, 6, 4, 'y');
  c.rect(15, 8, 2, 2, 'W');
  for (const x of [11, 15, 20]) c.rect(x, 6, 1, 6, 'F');
  c.rect(10, 12, 12, 2, 'F');
  // โดม
  const dome = [3, 4, 5, 6];
  dome.forEach((hw, i) => {
    const y = 2 + i;
    for (let x = 16 - hw; x <= 15 + hw; x++) c.set(x, y, x < 16 - hw + 2 ? 'r' : x > 13 + hw ? 'P' : 'R');
  });
  c.set(15, 1, 'Y');
  c.set(16, 1, 'Y');
  c.outline();
  halo(c, 16, 9, 12, '255,205,117', 0.35);
  return c;
}

/** ท่าเรือ 32×32 แบน (มองจากด้านบน) */
function dock(): PixelCanvas {
  const c = pc(32, 32);
  const rng = new RNG(321);
  for (let y = 0; y < 32; y++) {
    const r = y % 4;
    for (let x = 0; x < 32; x++) {
      let col: string;
      if (x <= 1 || x >= 30) col = x === 0 || x === 31 ? 'm' : 'M';
      else if (r === 3) col = 'n';
      else if (r === 0 && dither(x, y) > 0.25) col = 'S';
      else if (rng.chance(0.08) || (r === 2 && dither(x, y) > 0.4)) col = 'M';
      else col = 'N';
      c.set(x, y, col);
    }
    if (r === 1) {
      c.set(3, y, 'D');
      c.set(28, y, 'D');
    }
  }
  for (const [px, py] of [[2.5, 6], [29.5, 6], [2.5, 22], [29.5, 22]]) {
    c.ellipse(px, py, 2.6, 2.6, 'n');
    c.ellipse(px, py, 2, 2, 'M');
    c.ellipse(px - 0.4, py - 0.4, 1.1, 1.1, 'N');
    c.set(Math.floor(px), Math.floor(py), 'm');
  }
  return c;
}

// ---------------- เรือ ----------------

function raft(vertical: boolean): PixelCanvas {
  const rng = new RNG(vertical ? 62 : 61);
  const c = vertical ? pc(18, 24) : pc(24, 18);
  if (vertical) c.ellipse(9, 13, 8, 10.5, 'rgba(10,12,30,0.22)');
  else c.ellipse(12, 10, 11, 7, 'rgba(10,12,30,0.22)');
  const shades = ['N', 'M', 'm'];
  for (let k = 0; k < 4; k++) {
    const p0 = 3 + k * 3; // ตำแหน่งท่อนซุง
    const a = 2 + rng.int(0, 1);
    const b = 21 - rng.int(0, 1);
    for (let t = a; t <= b; t++) {
      for (let s = 0; s < 3; s++) {
        if ((t === a || t === b) && s !== 1) continue;
        let col = shades[s];
        if (s === 1 && rng.chance(0.08)) col = 'm';
        if (vertical) c.set(p0 + s, t, col);
        else c.set(t, p0 + s, col);
      }
    }
    // หน้าตัดท่อนซุง (ด้านใกล้กล้อง)
    if (vertical) {
      c.set(p0 + 1, b, 'S');
      c.set(p0, b - 1, 'N');
    }
  }
  // ด้านข้างแพ (ความหนา)
  if (!vertical) for (let x = 3; x <= 20; x++) c.set(x, 15, dither(x, 15) > 0 ? 'n' : 'm');
  // เชือกมัด
  for (const t of [5, 18]) {
    for (let s = 2; s <= 15; s++) {
      const col = s % 2 ? 'S' : 's';
      if (vertical) c.set(s, t, col);
      else c.set(t, s, col);
    }
  }
  return c.outline();
}

function sailboat(vertical: boolean): PixelCanvas {
  if (!vertical) {
    const c = pc(34, 24);
    c.ellipse(17, 20, 16, 3, 'rgba(10,12,30,0.22)');
    const cy = 14;
    const hh = (x: number) => (x < 4 ? 4 : x <= 22 ? 5 : 5 * Math.sqrt(Math.max(0, (32 - x) / 10)));
    for (let x = 2; x <= 32; x++) {
      const h = hh(x);
      if (h < 0.5) continue;
      const top = Math.round(cy - h);
      const bot = Math.round(cy + h) - 1;
      for (let y = top; y <= bot; y++) {
        let col = (y - top) % 3 === 2 ? 'M' : y === top + 1 ? 'S' : 'N';
        if (y === top || y === bot || x === 2) col = 'm';
        c.set(x, y, col);
      }
      // ด้านข้างตัวเรือ
      if (h > 1.5) {
        c.set(x, bot + 1, 'M');
        c.set(x, bot + 2, x % 6 === 0 ? 'Y' : 'M');
        c.set(x, bot + 3, 'm');
      }
    }
    c.rect(6, 12, 5, 4, 'M');
    c.rect(6, 12, 5, 1, 'N');
    // เสากระโดง + ใบเรือ
    c.rect(15, 1, 1, 14, 'm');
    c.rect(14, 2, 1, 12, 'M');
    for (let y = 2; y <= 13; y++) {
      const w = Math.round((y - 1) * 0.85);
      for (let x = 16; x <= 16 + w; x++) {
        let col = x > 13 + w ? 'L' : 'W';
        if (y === 8 || y === 9) col = x > 13 + w ? 'P' : 'R';
        c.set(x, y, col);
      }
    }
    c.rect(15, 14, 13, 1, 'N');
    c.set(13, 1, 'R');
    c.set(12, 2, 'R');
    c.set(13, 2, 'R');
    return c.outline();
  }
  const c = pc(24, 34);
  c.ellipse(12, 19, 9, 14, 'rgba(10,12,30,0.22)');
  const cx = 12;
  const hw = (y: number) => (y < 13 ? 6 * Math.sqrt(Math.max(0, (y - 3) / 10)) : y > 26 ? 5 : 6);
  for (let y = 3; y <= 28; y++) {
    const w = hw(y);
    if (w < 0.5) continue;
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w) - 1;
    for (let x = x0; x <= x1; x++) {
      let col = (x - x0) % 3 === 2 ? 'M' : x === x0 + 1 ? 'S' : 'N';
      if (x === x0 || x === x1 || y === 28) col = 'm';
      if (x === x1 - 1 && y > 8) col = 'M';
      c.set(x, y, col);
    }
  }
  // ท้ายเรือ (ด้านใกล้กล้อง)
  for (let x = 8; x <= 15; x++) {
    c.set(x, 29, 'M');
    c.set(x, 30, x % 3 === 0 ? 'Y' : 'M');
    c.set(x, 31, 'm');
  }
  c.rect(9, 22, 6, 4, 'M');
  c.rect(9, 22, 6, 1, 'N');
  // เสากระโดงตั้งขึ้น + ใบเรือ
  c.rect(12, 4, 1, 15, 'm');
  c.rect(11, 5, 1, 13, 'M');
  for (let y = 5; y <= 16; y++) {
    const w = Math.round((y - 4) * 0.62);
    for (let x = 13; x <= 13 + w; x++) {
      let col = x > 11 + w ? 'L' : 'W';
      if (y === 11 || y === 12) col = x > 11 + w ? 'P' : 'R';
      c.set(x, y, col);
    }
  }
  c.rect(12, 17, 9, 1, 'N');
  c.set(10, 4, 'R');
  c.set(9, 5, 'R');
  c.set(10, 5, 'R');
  return c.outline();
}

function motorboat(vertical: boolean): PixelCanvas {
  if (!vertical) {
    const c = pc(32, 18);
    c.ellipse(17, 14, 14, 2.5, 'rgba(10,12,30,0.22)');
    const cy = 7.5;
    const hh = (x: number) => (x <= 20 ? 4 : 4 * Math.sqrt(Math.max(0, (30 - x) / 10)));
    for (let x = 5; x <= 30; x++) {
      const h = hh(x);
      if (h < 0.5) continue;
      const top = Math.round(cy - h);
      const bot = Math.round(cy + h) - 1;
      for (let y = top; y <= bot; y++) {
        let col = x >= 22 ? (y - top < 2 ? 'W' : 'w') : 'L';
        if (x < 22 && dither(x, y) > 0.35) col = 'D';
        if (y === top || y === bot || x === 5) col = 'W';
        c.set(x, y, col);
      }
      if (h > 1.5) {
        c.set(x, bot + 1, 'W');
        c.set(x, bot + 2, 'B');
        c.set(x, bot + 3, 'U');
      }
    }
    // เบาะ
    for (const sx of [8, 13]) {
      c.rect(sx, 5, 3, 4, 'B');
      c.rect(sx, 5, 3, 1, 'b');
    }
    // กระจกบังลม
    c.rect(20, 4, 2, 7, 'C');
    c.rect(21, 4, 1, 7, 'b');
    c.set(20, 5, 'W');
    // มอเตอร์ท้ายเรือ
    c.rect(1, 4, 4, 6, 'D');
    c.rect(1, 4, 4, 1, 'L');
    c.rect(1, 4, 1, 6, 'L');
    c.rect(2, 7, 3, 1, 'R');
    c.rect(2, 10, 2, 3, 'F');
    c.set(1, 12, 'L');
    c.set(4, 12, 'L');
    return c.outline();
  }
  const c = pc(18, 32);
  c.ellipse(9, 17, 7.5, 14, 'rgba(10,12,30,0.22)');
  const cx = 9;
  const hw = (y: number) => (y >= 12 ? 4.5 : 4.5 * Math.sqrt(Math.max(0, (y - 2) / 10)));
  for (let y = 2; y <= 24; y++) {
    const w = hw(y);
    if (w < 0.5) continue;
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w) - 1;
    for (let x = x0; x <= x1; x++) {
      let col = y < 11 ? (x - x0 < 2 ? 'W' : 'w') : 'L';
      if (y >= 11 && dither(x, y) > 0.35) col = 'D';
      if (x === x0 || x === x1 || y === 24) col = 'W';
      if (x === x1 && y > 6) col = 'L';
      c.set(x, y, col);
    }
  }
  // ท้ายเรือ
  for (let x = 5; x <= 12; x++) {
    c.set(x, 25, 'W');
    c.set(x, 26, 'B');
    c.set(x, 27, 'U');
  }
  // กระจกบังลม + เบาะ
  c.rect(5, 11, 8, 2, 'C');
  c.rect(5, 12, 8, 1, 'b');
  c.set(6, 11, 'W');
  for (const sy of [15, 20]) {
    c.rect(6, sy, 6, 3, 'B');
    c.rect(6, sy, 6, 1, 'b');
  }
  // มอเตอร์
  c.rect(7, 27, 4, 4, 'D');
  c.rect(7, 27, 4, 1, 'L');
  c.rect(7, 27, 1, 4, 'L');
  c.rect(8, 29, 3, 1, 'R');
  return c.outline();
}

function merchantShip(): PixelCanvas {
  const c = pc(72, 48);
  c.ellipse(36, 44, 34, 3.5, 'rgba(10,12,30,0.25)');
  // ตัวเรือด้านข้าง
  const xs = (y: number) => 4 + Math.round(((y - 24) / 18) ** 2 * 5);
  const xe = (y: number) => 66 - Math.round(((y - 24) / 18) ** 1.4 * 10);
  for (let y = 30; y <= 42; y++) {
    for (let x = xs(y); x <= xe(y); x++) {
      let col = (y - 30) % 3 === 2 ? 'm' : dither(x, y) > 0.38 ? 'N' : 'M';
      if (y === 31) col = 'Y';
      if (y >= 41) col = y === 42 ? 'n' : 'm';
      c.set(x, y, col);
    }
  }
  for (let x = 12; x <= 58; x += 9) {
    c.rect(x, 34, 2, 2, 'O');
    c.set(x, 34, 'Y');
  }
  // ดาดฟ้า
  for (let y = 23; y <= 29; y++) {
    for (let x = xs(24); x <= xe(24) + (y - 23) % 2; x++) {
      let col = (y - 23) % 2 ? 'N' : x % 6 === 0 ? 'M' : 'N';
      if (y === 23) col = 'M';
      if (y === 29) col = 'm';
      c.set(x, y, col);
    }
  }
  c.rect(4, 30, xe(30) - 3, 1, 'N');
  // ท้ายเรือยกสูง
  c.rect(4, 14, 16, 10, 'M');
  c.rect(4, 12, 16, 3, 'N');
  c.rect(4, 12, 16, 1, 'S');
  c.rect(19, 14, 1, 10, 'm');
  for (const wx of [7, 12]) {
    c.rect(wx, 17, 3, 3, 'Y');
    c.set(wx, 17, 'y');
  }
  c.rect(4, 21, 16, 1, 'm');
  c.set(5, 11, 'Y');
  c.set(5, 10, 'r');
  // หัวเรือ + เสาหัวเรือ
  c.line(64, 25, 70, 20, 'M');
  c.line(64, 26, 70, 21, 'm');
  // สินค้าบนดาดฟ้า
  const box = (bx: number, by: number, w: number, h: number) => {
    c.rect(bx, by, w, h, 'M');
    c.rect(bx, by, w, 1, 'N');
    c.rect(bx + w - 1, by, 1, h, 'm');
    c.line(bx, by + h - 1, bx + w - 1, by, 'N');
  };
  box(22, 19, 6, 6);
  box(28, 21, 5, 4);
  box(56, 20, 5, 5);
  c.blob(40, 23, 2.5, 2.5, ['m', 'M', 'N']);
  c.rect(38, 22, 5, 1, 'D');
  c.blob(45, 24, 2.5, 1.8, ['s', 'S', 'S']);
  // เสากระโดง
  for (const mx of [29, 49]) {
    c.rect(mx, 1, 2, 25, 'M');
    c.rect(mx, 1, 1, 25, 'N');
  }
  // ใบเรือสี่เหลี่ยม (โป่งลม) พร้อมตรา
  const sail = (mx: number, emblem: string, ring: string) => {
    for (let x = mx - 6; x <= mx + 7; x++) {
      const k = (x - mx - 0.5) / 7;
      const bottom = 15 + Math.round((1 - k * k) * 2);
      for (let y = 5; y <= bottom; y++) {
        const v = -k * 0.5 + (bottom - y) / 20 + dither(x, y) * 0.25;
        c.set(x, y, v > 0.15 ? 'W' : v > -0.25 ? 'w' : 'L');
      }
    }
    c.rect(mx - 7, 4, 16, 1, 'm');
    c.ellipse(mx + 1, 10.5, 3.2, 3.2, ring);
    c.ellipse(mx + 1, 10.5, 2, 2, emblem);
    c.set(mx, 10, 'y');
  };
  sail(29, 'Y', 'R');
  sail(49, 'Y', 'B');
  // ธง
  for (const [mx, col] of [[29, 'R'], [49, 'B']] as [number, string][]) {
    c.rect(mx + 2, 1, 5, 2, col);
    c.set(mx + 7, 1, col);
    c.set(mx + 2, 1, col === 'R' ? 'r' : 'b');
  }
  c.outline();
  // เชือกโยง (ไม่ตีเส้นขอบ)
  c.line(30, 2, 7, 11, 'n');
  c.line(50, 2, 69, 19, 'n');
  c.line(31, 3, 48, 3, 'n');
  return c;
}

// ---------------- อื่นๆ ----------------

function graveBag(): PixelCanvas {
  const c = pc(12, 10);
  c.shadow(6, 8.5, 5, 1.2);
  c.blob(6, 6, 4.5, 2.7, ['s', 'S', 'S', 'y']);
  c.rect(5, 2, 2, 2, 'S');
  c.rect(4, 3, 4, 1, 'M');
  c.set(4, 1, 'S');
  c.set(7, 1, 's');
  c.rect(6, 4, 1, 4, 'R');
  c.rect(5, 5, 3, 1, 'R');
  c.set(3, 7, 'N');
  return c.outline();
}

function rewardChest(): PixelCanvas {
  const c = pc(18, 16);
  c.shadow(9, 14.5, 8, 1.5);
  // ตัวหีบ
  c.rect(2, 7, 14, 7, 'P');
  for (let y = 8; y <= 12; y++) for (let x = 3; x <= 9; x++) if (dither(x, y) > 0.1) c.set(x, y, 'u');
  c.rect(2, 12, 14, 2, 'r');
  c.rect(2, 12, 14, 1, 'Y');
  c.rect(2, 7, 14, 1, 'Y');
  for (const x of [4, 13]) {
    c.rect(x, 2, 1, 12, 'Y');
    c.set(x, 13, 'r');
  }
  c.rect(2, 7, 1, 7, 'Y');
  c.rect(15, 7, 1, 7, 'r');
  // ฝาโค้ง
  c.rect(5, 2, 8, 1, 'u');
  c.rect(3, 3, 12, 1, 'u');
  c.rect(2, 4, 14, 2, 'P');
  c.rect(3, 4, 5, 1, 'u');
  c.rect(2, 6, 14, 1, 'Y');
  c.set(6, 2, 'p');
  for (const x of [4, 13]) c.rect(x, 2, 1, 5, 'Y');
  // กุญแจ + อัญมณี
  c.rect(8, 5, 2, 4, 'Y');
  c.set(8, 6, 'C');
  c.set(9, 6, 'b');
  c.set(8, 5, 'y');
  c.set(4, 10, 'p');
  c.set(13, 10, 'G');
  c.set(4, 4, 'R');
  c.set(13, 4, 'C');
  c.outline();
  halo(c, 9, 8, 9, '255,205,117', 0.22);
  for (const [x, y, col] of [[1, 2, 'y'], [16, 3, 'W'], [15, 0, 'y'], [2, 0, 'W']] as [number, number, string][]) c.set(x, y, col);
  return c;
}

// ---------------- ลงทะเบียน texture ----------------

/** รูปทั้งหมด: key → เฟรม (1 เฟรม = texture เดี่ยว, หลายเฟรม = แถบแนวนอน) */
export function buildingArt(): Record<string, PixelCanvas[]> {
  return {
    wall_iron: [ironWall()],
    door_wood: [door('wood', false), door('wood', true)],
    door_iron: [door('iron', false), door('iron', true)],
    fence_wood: [fence()],
    floor_wood: [floorWood()],
    floor_stone: [floorStone()],
    floor_carpet: [floorCarpet()],
    floor_tile: [floorTile()],
    table: [table()],
    chair: [chair()],
    chest: [chest(false), chest(true)],
    bookshelf: [bookshelf()],
    lamp: [lamp()],
    flower_pot: [flowerPot()],
    statue: [statue()],
    rug: [rug()],
    banner_flag: [bannerFlag()],
    barrel: [barrel()],
    crate_box: [crateBox()],
    anvil: [anvil()],
    mech_bench: [mechBench()],
    generator: [generator(0), generator(1), generator(2)],
    windmill: [windmill(0), windmill(1), windmill(2), windmill(3)],
    auto_miner: [autoMiner(0), autoMiner(1)],
    sprinkler: [sprinkler(0), sprinkler(1)],
    turret_arrow: [turretArrow()],
    turret_cannon: [turretCannon()],
    lamp_post: [lampPost()],
    cabin: [cabin()],
    stone_house: [stoneHouse()],
    watchtower: [watchtower()],
    warehouse: [warehouse()],
    lighthouse: [lighthouse()],
    dock: [dock()],
    raft: [raft(false)],
    raft_v: [raft(true)],
    sailboat: [sailboat(false)],
    sailboat_v: [sailboat(true)],
    motorboat: [motorboat(false)],
    motorboat_v: [motorboat(true)],
    merchant_ship: [merchantShip()],
    grave_bag: [graveBag()],
    reward_chest: [rewardChest()],
    // เมือง / ดันเจี้ยน (art/town.ts)
    ...townArt(),
    // บ้าน/อาคาร/ป้องกัน/ตกแต่ง ชุดขยาย + ไอคอนวัสดุก่อสร้าง (art/buildings2.ts)
    ...buildingArt2(),
  };
}

/** anim: key → [texture, เฟรม, fps] */
const BUILDING_ANIMS: [string, string, number[], number][] = [
  ['generator_run', 'generator', [1, 2], 8],
  ['windmill_spin', 'windmill', [0, 1, 2, 3], 6],
  ['auto_miner_run', 'auto_miner', [0, 1], 6],
  ['sprinkler_spray', 'sprinkler', [0, 1], 6],
  ...TOWN_ANIMS,
  ...BUILDING2_ANIMS,
];

export function buildBuildingTextures(scene: Phaser.Scene): void {
  for (const [key, frames] of Object.entries(buildingArt())) {
    if (scene.textures.exists(key)) continue;
    const w = frames[0].w;
    const h = frames[0].h;
    const tex = scene.textures.createCanvas(key, w * frames.length, h);
    if (!tex) continue;
    const ctx = tex.getContext();
    frames.forEach((art, i) => {
      art.draw(ctx, i * w, 0);
      if (frames.length > 1) tex.add(i, 0, i * w, 0, w, h);
    });
    tex.refresh();
  }
  for (const [key, texKey, frames, frameRate] of BUILDING_ANIMS) {
    if (scene.anims.exists(key)) continue;
    scene.anims.create({ key, frames: scene.anims.generateFrameNumbers(texKey, { frames }), frameRate, repeat: -1 });
  }
}
