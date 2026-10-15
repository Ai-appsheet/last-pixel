import { PixelCanvas, mixHex } from '../PixelCanvas';
import type { RoomStyle } from '../../data/homes';

/**
 * 🏠 ภายในบ้าน (โทนหม่นอุ่นแบบ Under the Island): ห้องพื้นไม้/หิน ผนังไม้ซุง/อิฐ/หิน + เฟอร์นิเจอร์
 * สีเป็น hex ตรงๆ (ไม่ผ่านโทนโลก) · ห้องวาดตามขนาดตอนเข้าบ้าน (homeRoomCanvas) · เฟอร์นิเจอร์ลงทะเบียนใน TextureFactory
 */
const INK = '#241913';
const VOID = '#0e0d10';

const hash = (x: number, y: number) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

const FLOOR = {
  plank: ['#8a6446', '#7b583d', '#96704f', '#5a3f2c'],
  stone: ['#77746c', '#6b6961', '#827f76', '#4c4a45'],
};
const WALL: Record<RoomStyle, { face: string[]; cap: string; capHi: string; base: string }> = {
  wood: { face: ['#6f5038', '#634631', '#7c5b40', '#45301f'], cap: '#2e221b', capHi: '#4a372b', base: '#3d2a1d' },
  brick: { face: ['#8a4c3c', '#7b4334', '#985846', '#55352c'], cap: '#2c201c', capHi: '#4b3830', base: '#4a3324' },
  stone: { face: ['#6c6f74', '#606368', '#7a7d82', '#43454a'], cap: '#24262b', capHi: '#3d4046', base: '#3a3b40' },
};

/** ผืนห้องทั้งห้อง (w×h tile รวมผนัง): ผนังหลังสูง 2 ช่อง · ผนังข้าง/หน้า 1 ช่อง · ประตูกลางผนังหน้า · พรมกลางห้อง */
export function homeRoomCanvas(w: number, h: number, style: RoomStyle): PixelCanvas {
  const W = w * 16;
  const H = h * 16;
  const c = new PixelCanvas(W, H, 1);
  c.rect(0, 0, W, H, VOID);
  // ผสมสีทับพิกเซลเดิม (เงา/แสง) — ผืนห้องทึบทั้งผืน ไม่ใช้สีโปร่งใส
  const tint = (x: number, y: number, t: number, to = '#0e0a08') => {
    const p = c.get(x, y);
    if (p) c.set(x, y, mixHex(p, to, t));
  };
  // ---------- พื้น ----------
  const fx0 = 16;
  const fy0 = 32;
  const fx1 = W - 16;
  const fy1 = H - 16;
  if (style === 'stone') {
    const [a, b, hi, g] = FLOOR.stone;
    for (let y = fy0; y < fy1; y++) {
      for (let x = fx0; x < fx1; x++) {
        const row = Math.floor((y - fy0) / 8);
        const ox = row % 2 ? 4 : 0;
        const gx = (x - fx0 + ox) % 8;
        const gy = (y - fy0) % 8;
        const cell = hash(Math.floor((x - fx0 + ox) / 8), row);
        c.set(x, y, gx === 0 || gy === 0 ? g : gx === 1 || gy === 1 ? hi : cell < 0.5 ? a : b);
      }
    }
  } else {
    const [a, b, hi, gap] = FLOOR.plank;
    for (let y = fy0; y < fy1; y++) {
      const row = Math.floor((y - fy0) / 5);
      const gy = (y - fy0) % 5;
      for (let x = fx0; x < fx1; x++) {
        const len = 22 + Math.floor(hash(row, 3) * 10);
        const ox = Math.floor(hash(row, 7) * len);
        const seam = (x - fx0 + ox) % len === 0;
        const board = Math.floor((x - fx0 + ox) / len);
        const base = hash(board, row) < 0.5 ? a : b;
        c.set(x, y, gy === 4 || seam ? gap : gy === 0 ? hi : (x * 7 + y * 3) % 23 === 0 ? b : base);
      }
    }
  }
  // เงาใต้ผนังหลัง/ข้าง
  for (let y = fy0; y < fy0 + 4; y++) for (let x = fx0; x < fx1; x++) tint(x, y, 0.5 - (y - fy0) * 0.11);
  for (let y = fy0; y < fy1; y++) {
    tint(fx0, y, 0.35);
    tint(fx0 + 1, y, 0.18);
    tint(fx1 - 1, y, 0.3);
  }
  // ---------- พรม ----------
  const rw = Math.max(48, Math.round((fx1 - fx0) * 0.5));
  const rh = Math.max(24, Math.round((fy1 - fy0) * 0.5));
  const rx = Math.round((W - rw) / 2);
  const ry = Math.round(fy0 + (fy1 - fy0 - rh) / 2 + 4);
  for (let y = ry + 2; y < ry + rh + 2; y++) for (let x = rx + 1; x < rx + rw + 1; x++) tint(x, y, 0.3);
  c.rect(rx, ry, rw, rh, '#c39a5e');
  c.rect(rx + 2, ry + 2, rw - 4, rh - 4, '#7d3833');
  c.rect(rx + 4, ry + 4, rw - 8, rh - 8, '#6a2e2b');
  for (let x = rx + 6; x < rx + rw - 6; x += 6) {
    c.set(x, ry + 3, '#d9b979');
    c.set(x, ry + rh - 4, '#d9b979');
  }
  // ลายเพชรกลางพรม
  const mx = rx + rw / 2;
  const my = ry + rh / 2;
  for (let i = 0; i <= 5; i++) {
    c.set(mx - 6 + i, my - i, '#c39a5e');
    c.set(mx + 6 - i, my - i, '#c39a5e');
    c.set(mx - 6 + i, my + i, '#c39a5e');
    c.set(mx + 6 - i, my + i, '#c39a5e');
  }
  c.rect(mx - 1, my - 1, 3, 3, '#d9b979');
  // ---------- ผนังหลัง (สูง 2 ช่อง: ขอบบน 6px + หน้าผนัง) ----------
  const wl = WALL[style];
  const [f0, f1, fh, fm] = wl.face;
  for (let y = 6; y < 32; y++) {
    for (let x = 0; x < W; x++) {
      let col: string;
      if (style === 'wood') {
        const g = (y - 6) % 6;
        const log = Math.floor((y - 6) / 6);
        col = g === 5 ? fm : g === 0 ? fh : hash(log, Math.floor(x / 40)) < 0.5 ? f0 : f1;
        if (g > 0 && g < 5 && (x + log * 13) % 40 === 0) col = fm;
      } else if (style === 'brick') {
        const row = Math.floor((y - 6) / 5);
        const ox = row % 2 ? 5 : 0;
        const g = (y - 6) % 5;
        const bx = (x + ox) % 10;
        col = g === 4 || bx === 0 ? fm : g === 0 ? fh : hash(Math.floor((x + ox) / 10), row) < 0.45 ? f1 : f0;
      } else {
        const row = Math.floor((y - 6) / 7);
        const ox = row % 2 ? 7 : 0;
        const g = (y - 6) % 7;
        const bx = (x + ox) % 14;
        col = g === 6 || bx === 0 ? fm : g === 0 || bx === 1 ? fh : hash(Math.floor((x + ox) / 14), row) < 0.5 ? f0 : f1;
      }
      c.set(x, y, col);
    }
  }
  // ไม้บัวล่าง (อิฐ = แผงไม้ครึ่งผนัง)
  if (style === 'brick') {
    c.rect(0, 22, W, 8, '#5e4230');
    c.rect(0, 22, W, 1, '#7a5940');
    for (let x = 6; x < W; x += 12) c.rect(x, 24, 1, 5, '#4a3324');
  }
  c.rect(0, 29, W, 3, wl.base);
  c.rect(0, 29, W, 1, '#6b4d36');
  // ขอบบนผนัง
  c.rect(0, 0, W, 6, wl.cap);
  c.rect(0, 5, W, 1, wl.capHi);
  // ชั้นวางของบนผนัง (ห้องกว้าง)
  if (w >= 12) {
    const sx = 18;
    c.rect(sx, 14, 18, 2, '#5a3f2c');
    c.rect(sx + 1, 10, 3, 4, '#a7c06a');
    c.rect(sx + 5, 9, 2, 5, '#c97a5a');
    c.rect(sx + 8, 11, 4, 3, '#d9c08a');
    c.rect(sx + 13, 10, 3, 4, '#6f8fb0');
    c.rect(sx + 2, 16, 1, 2, '#3d2a1d');
    c.rect(sx + 15, 16, 1, 2, '#3d2a1d');
  }
  // ---------- ผนังข้าง + ผนังหน้า (มองจากบน = แถบหลังกำแพง) ----------
  const cap = (x: number, y: number, ww: number, hh: number) => c.rect(x, y, ww, hh, wl.cap);
  cap(0, 0, 16, H);
  cap(W - 16, 0, 16, H);
  cap(0, H - 16, W, 16);
  c.rect(15, 6, 1, H - 21, wl.capHi);
  c.rect(W - 16, 6, 1, H - 21, wl.capHi);
  c.rect(15, H - 16, W - 30, 1, wl.capHi);
  // ช่องประตู (กลางผนังหน้า)
  const dx = Math.floor(w / 2) * 16;
  const [pa, , phi, pgap] = style === 'stone' ? FLOOR.stone : FLOOR.plank;
  c.rect(dx, H - 16, 16, 16, pa);
  for (let y = H - 16; y < H; y += 5) c.rect(dx, y, 16, 1, pgap);
  c.rect(dx, H - 16, 16, 1, phi);
  c.rect(dx - 2, H - 16, 2, 16, '#5a3f2c');
  c.rect(dx + 16, H - 16, 2, 16, '#5a3f2c');
  // แสงลอดประตู
  for (let y = H - 6; y < H; y++) for (let x = dx; x < dx + 16; x++) tint(x, y, 0.08 + (y - (H - 6)) * 0.05, '#ffe4aa');
  return c;
}

function bed(double: boolean): PixelCanvas {
  const W = double ? 30 : 16;
  const c = new PixelCanvas(W, 30, 1);
  c.shadow(W / 2, 28, W / 2 - 1, 2.2);
  // หัวเตียง
  c.rect(1, 0, W - 2, 8, '#6e4b32');
  c.rect(1, 0, W - 2, 1, '#8c6646');
  c.rect(2, 2, W - 4, 4, '#5e3f2a');
  c.rect(1, 0, 2, 9, '#5a3c28');
  c.rect(W - 3, 0, 2, 9, '#5a3c28');
  // ฟูก + หมอน
  c.rect(2, 7, W - 4, 20, '#d9d2bf');
  const pillows = double ? [8, 22] : [W / 2];
  for (const px of pillows) {
    c.ellipse(px, 10, double ? 5.5 : 5, 2.6, '#efe9da');
    c.rect(px - 4, 11, 8, 1, '#c9c1ac');
  }
  // ผ้าห่ม (พับขอบ)
  c.rect(2, 14, W - 4, 13, '#56707e');
  c.rect(2, 14, W - 4, 2, '#e3dcc8');
  c.rect(2, 16, W - 4, 1, '#3f5560');
  for (let y = 19; y < 27; y += 4) for (let x = 3; x < W - 3; x += 4) c.set(x + ((y >> 2) % 2) * 2, y, '#6b8794');
  c.rect(2, 26, W - 4, 1, '#3f5560');
  // ปลายเตียง
  c.rect(1, 26, W - 2, 3, '#6e4b32');
  c.rect(1, 26, W - 2, 1, '#8c6646');
  c.outline(INK);
  return c;
}

function chest(): PixelCanvas {
  const c = new PixelCanvas(16, 15, 1);
  c.shadow(8, 13.5, 7, 1.6);
  c.rect(1, 2, 14, 11, '#7a5234');
  c.rect(1, 2, 14, 4, '#8f6440');
  c.rect(1, 2, 14, 1, '#a87a50');
  c.rect(1, 6, 14, 1, '#4f3422');
  for (const x of [3, 12]) c.rect(x, 2, 1, 11, '#5d5a52');
  c.rect(7, 5, 2, 3, '#d9b45a');
  c.set(7, 7, '#7a6024');
  c.outline(INK);
  return c;
}

function hearth(frame: number): PixelCanvas {
  const c = new PixelCanvas(34, 36, 1);
  // หิ้ง + กรอบหิน
  c.rect(1, 8, 32, 26, '#7b766d');
  for (let y = 9; y < 34; y += 4) {
    const ox = (y >> 2) % 2 ? 3 : 0;
    for (let x = 1 + ox; x < 33; x += 6) c.rect(x, y, 1, 3, '#5c5850');
    c.rect(1, y + 3, 32, 1, '#5c5850');
  }
  c.rect(0, 5, 34, 4, '#6e4b32');
  c.rect(0, 5, 34, 1, '#8c6646');
  c.rect(5, 2, 4, 3, '#c9a46a');
  c.rect(24, 1, 3, 4, '#a7c06a');
  c.rect(15, 2, 4, 3, '#8a9aa8');
  // ช่องไฟ
  c.rect(8, 16, 18, 17, '#1b1310');
  c.ellipse(17, 16, 9, 4, '#1b1310');
  // ฟืน
  c.rect(10, 29, 14, 3, '#5a3c28');
  c.rect(12, 27, 10, 2, '#6e4b32');
  // เปลวไฟ (2 เฟรม)
  const f = frame ? 1 : 0;
  c.ellipse(17 - f, 24, 6, 6, '#c8542e');
  c.ellipse(17 + f, 23, 4, 6, '#e38a3a');
  c.ellipse(16 + f, 24 + f, 2.4, 4, '#f2c35a');
  c.ellipse(13 + f * 2, 25, 1.6, 2.4, '#e38a3a');
  c.ellipse(21 - f * 2, 25, 1.6, 2.4 + f, '#e38a3a');
  c.set(18 - f, 17 + f, '#f2c35a');
  c.rect(10, 31, 14, 2, '#3a2016');
  c.outline(INK);
  return c;
}

function windowArt(night: boolean): PixelCanvas {
  const c = new PixelCanvas(18, 16, 1);
  c.rect(0, 0, 18, 16, '#5a3f2c');
  c.rect(0, 0, 18, 1, '#7a5940');
  const sky = night ? ['#1d2640', '#26324f'] : ['#8fb8c4', '#a9cdd5'];
  c.rect(2, 2, 14, 11, sky[0]);
  c.rect(2, 2, 14, 5, sky[1]);
  if (night) {
    c.set(5, 4, '#e8e2c8');
    c.set(12, 6, '#c9c3a8');
    c.ellipse(12, 4, 1.6, 1.6, '#e8e2c8');
  } else {
    c.line(4, 10, 8, 5, '#d6ebee');
    c.line(5, 11, 9, 6, '#c2dfe4');
  }
  c.rect(8, 2, 2, 11, '#5a3f2c');
  c.rect(2, 7, 14, 1, '#5a3f2c');
  c.rect(0, 13, 18, 3, '#6e4b32');
  c.rect(0, 13, 18, 1, '#8c6646');
  c.outline(INK);
  return c;
}

function lamp(): PixelCanvas {
  const c = new PixelCanvas(10, 24, 1);
  c.shadow(5, 22.5, 4, 1.2);
  c.rect(3, 21, 4, 2, '#4a3324');
  c.rect(4, 9, 2, 12, '#5a3f2c');
  c.rect(1, 2, 8, 8, '#e3c178');
  c.rect(1, 2, 8, 1, '#f2dca0');
  c.rect(2, 8, 6, 2, '#c9a05a');
  c.rect(3, 0, 4, 2, '#c9a05a');
  c.outline(INK);
  return c;
}

function table(): PixelCanvas {
  const c = new PixelCanvas(28, 20, 1);
  c.shadow(14, 18.5, 13, 1.6);
  c.rect(2, 12, 2, 7, '#5a3c28');
  c.rect(24, 12, 2, 7, '#5a3c28');
  c.rect(0, 6, 28, 7, '#7a5234');
  c.rect(0, 6, 28, 2, '#94683f');
  c.rect(0, 12, 28, 1, '#4f3422');
  // แก้ว + เทียน + ขนมปัง
  c.rect(5, 3, 4, 4, '#cfc6b0');
  c.rect(9, 4, 1, 2, '#cfc6b0');
  c.rect(15, 2, 2, 5, '#efe9da');
  c.set(15, 1, '#f2c35a');
  c.set(16, 0, '#e38a3a');
  c.ellipse(22, 5, 3.5, 2, '#c98a4a');
  c.rect(20, 4, 4, 1, '#e0a865');
  c.outline(INK);
  return c;
}

function plant(): PixelCanvas {
  const c = new PixelCanvas(12, 18, 1);
  c.shadow(6, 16.5, 5, 1.2);
  c.rect(3, 11, 6, 6, '#a0583c');
  c.rect(3, 11, 6, 1, '#bb6e4e');
  c.ellipse(6, 7, 4.5, 4, '#4f7a4a');
  c.ellipse(4, 5, 2.5, 2.5, '#628f58');
  c.ellipse(8, 4, 2.2, 3, '#5a8452');
  c.set(6, 2, '#7aa86a');
  c.outline(INK);
  return c;
}

function mat(): PixelCanvas {
  const c = new PixelCanvas(16, 10, 1);
  c.rect(1, 1, 14, 8, '#8a4a3a');
  c.rect(2, 2, 12, 6, '#a8644c');
  for (let x = 3; x < 14; x += 3) c.rect(x, 2, 1, 6, '#8a4a3a');
  return c;
}

/** เฟอร์นิเจอร์ในบ้าน (ลงทะเบียนครั้งเดียวใน TextureFactory) */
export function homeInteriorArt(): Record<string, PixelCanvas> {
  return {
    hi_bed: bed(false),
    hi_bed2: bed(true),
    hi_chest: chest(),
    hi_hearth_a: hearth(0),
    hi_hearth_b: hearth(1),
    hi_window_day: windowArt(false),
    hi_window_night: windowArt(true),
    hi_lamp: lamp(),
    hi_table: table(),
    hi_plant: plant(),
    hi_mat: mat(),
  };
}
