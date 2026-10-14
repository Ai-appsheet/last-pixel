import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

// ---------------- สิ่งก่อสร้างชุดขยาย: บ้าน / อาคารผลิต / ป้องกัน / ของตกแต่ง / ไอคอนวัสดุก่อสร้าง ----------------
// มุมมอง 3/4 จากด้านบน ยึดจุดกึ่งกลางล่าง (origin 0.5, 1) — แถวล่างสุดเป็นเงา, พื้น (floor) วาดแบนเต็มช่อง

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

/** เปลวไฟ ฐานที่ (cx, by) สูง h — frame ทำให้ไฟส่าย */
function flame(c: PixelCanvas, cx: number, by: number, h: number, frame: number, hw = 2.2) {
  for (let y = by - h; y <= by; y++) {
    const k = (by - y) / h;
    const sway = Math.sin(y * 0.9 + frame * 2.3) * k * 0.9;
    const w = (1 - k * 0.85) * hw + 0.3;
    for (let x = Math.floor(cx - w - 1); x <= Math.ceil(cx + w); x++) {
      const rel = Math.abs(x + 0.5 - (cx + sway)) / w;
      if (rel > 1) continue;
      const v = 1 - rel - k * 0.55 + dither(x, y + frame) * 0.3;
      c.set(x, y, v > 0.6 ? 'y' : v > 0.35 ? 'Y' : v > 0.12 ? 'r' : 'R');
    }
  }
}

/** ก่ออิฐ/หิน: cols = [ไฮไลต์, หน้า, เงา, ปูน] */
function masonry(
  c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, rng: RNG,
  cols: string[] = ['W', 'L', 'D', 'F'], bw = 6, bh = 4,
) {
  for (let y = y0; y <= y1; y++) {
    const row = Math.floor((y - y0) / bh);
    const off = row % 2 ? Math.floor(bw / 2) : 0;
    const ry = (y - y0) % bh;
    for (let x = x0; x <= x1; x++) {
      const bx = (x - x0 + off) % bw;
      let col = cols[1];
      if (ry === bh - 1 || bx === 0) col = cols[3];
      else if (ry === 0 && dither(x, y) > -0.2) col = cols[0];
      else if (bx === bw - 1 || ry === bh - 2) col = cols[2];
      else if (rng.chance(0.08)) col = cols[2];
      c.set(x, y, col);
    }
  }
}

/** ผนังไม้กระดานแนวนอน */
function planks(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, rng: RNG, cols = ['N', 'M', 'm']) {
  for (let y = y0; y <= y1; y++) {
    const r = (y - y0) % 3;
    for (let x = x0; x <= x1; x++) {
      let col = r === 0 ? cols[0] : r === 1 ? cols[1] : cols[2];
      if (r === 1 && rng.chance(0.06)) col = cols[2];
      if (r === 0 && dither(x, y) > 0.3) col = cols[1];
      c.set(x, y, col);
    }
  }
  for (let y = y0; y <= y1; y += 3) {
    const sx = x0 + 3 + ((y * 7) % 11);
    for (let x = sx; x <= x1; x += 13) {
      c.set(x, y, cols[2]);
      c.set(x, y + 1, cols[2]);
    }
  }
}

/** ผนังไม้ซุงกลม (หัวซุงโผล่ที่มุม) */
function logWall(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, ends = true) {
  for (let y = y0; y <= y1; y++) {
    const r = (y - y0) % 4;
    for (let x = x0; x <= x1; x++) {
      const col = r === 0 ? (dither(x, y) > 0.35 ? 'S' : 'N') : r === 1 ? 'N' : r === 2 ? 'M' : 'm';
      c.set(x, y, col);
    }
  }
  if (!ends) return;
  for (let y = y0; y + 3 <= y1 + 1; y += 4) {
    for (const cx of [x0 - 1.5, x1 + 2.5]) {
      c.ellipse(cx, y + 2, 2.2, 2, 'N');
      c.ellipse(cx, y + 2, 1.2, 1, 'S');
      c.set(Math.floor(cx), y + 2, 'M');
    }
  }
}

/** หน้าต่างไฟอุ่น (กรอบ + ช่องแสงเหลือง + ขอบล่าง) */
function warmWindow(c: PixelCanvas, x: number, y: number, w: number, h: number, frame = 'n', sill = 'N') {
  c.rect(x - 1, y - 1, w + 2, h + 2, frame);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j / h + dither(x + i, y + j) * 0.25;
      c.set(x + i, y + j, k < 0.3 ? 'y' : k < 0.75 ? 'Y' : 'r');
    }
  }
  if (w >= 4) c.rect(x + Math.floor(w / 2), y, 1, h, frame === 'W' ? 'W' : 'M');
  if (h >= 4) c.rect(x, y + Math.floor(h / 2), w, 1, frame === 'W' ? 'W' : 'M');
  c.set(x, y, 'W');
  c.rect(x - 2, y + h + 1, w + 4, 1, sill);
}

/** หน้าต่างกระจกเย็น (ฟ้า) */
function glassWindow(c: PixelCanvas, x: number, y: number, w: number, h: number, frame = 'W') {
  c.rect(x - 1, y - 1, w + 2, h + 2, frame);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) c.set(x + i, y + j, i + j < 2 ? 'C' : j > h * 0.6 ? 'B' : 'b');
  if (w >= 4) c.rect(x + Math.floor(w / 2), y, 1, h, frame);
  c.rect(x - 1, y + h + 1, w + 2, 1, 'L');
}

/** ประตูไม้ (y = ขอบบน) */
function woodDoor(c: PixelCanvas, x: number, y: number, w: number, h: number, arch = false, cols = ['N', 'M', 'm']) {
  c.rect(x - 1, y - 1, w + 2, h + 1, 'n');
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (arch && j < 2 && (i < 2 - j || i > w - 3 + j)) continue;
      c.set(x + i, y + j, i === 0 ? cols[0] : i % 3 === 2 ? cols[2] : cols[1]);
    }
  }
  if (arch) {
    c.set(x, y, 'n');
    c.set(x + w - 1, y, 'n');
  }
  for (const yy of [y + 2, y + h - 3]) c.rect(x, yy, w, 1, 'F');
  c.set(x + w - 2, y + Math.floor(h / 2), 'Y');
}

/** หลังคากระเบื้องทรงคางหมู */
function tileRoof(
  c: PixelCanvas, y0: number, y1: number, top0: number, top1: number, bot0: number, bot1: number,
  base: string, light: string, dark: string, rowH = 3,
) {
  for (let y = y0; y <= y1; y++) {
    const k = (y - y0) / Math.max(1, y1 - y0);
    const x0 = Math.round(top0 + (bot0 - top0) * k);
    const x1 = Math.round(top1 + (bot1 - top1) * k);
    const sr = Math.floor((y - y0) / rowH);
    const ry = (y - y0) % rowH;
    for (let x = x0; x <= x1; x++) {
      let col = base;
      if (ry === rowH - 1) col = dark;
      else if ((x + (sr % 2 ? 2 : 0)) % 4 === 0) col = dark;
      else if (ry === 0 && dither(x, y) > 0) col = light;
      if (x - x0 < 2) col = ry === rowH - 1 ? base : light;
      if (x1 - x < 2) col = dark;
      c.set(x, y, col);
    }
  }
}

/** หลังคามุงจาก/ฟาง ขอบล่างหยักเป็นพู่ */
function thatchRoof(c: PixelCanvas, y0: number, y1: number, top0: number, top1: number, bot0: number, bot1: number, S = ['#7a5a26', 's', 'S', '#f1dca4']) {
  for (let y = y0; y <= y1 + 1; y++) {
    const k = Math.min(1, (y - y0) / (y1 - y0));
    const x0 = Math.round(top0 + (bot0 - top0) * k);
    const x1 = Math.round(top1 + (bot1 - top1) * k);
    const layer = Math.floor((y - y0) / 4);
    const ly = (y - y0) % 4;
    for (let x = x0; x <= x1; x++) {
      if (y === y1 + 1 && (x + layer) % 3 !== 0) continue;
      const rel = (x - x0) / Math.max(1, x1 - x0);
      let v = 1.3 - rel * 1.1 - ly * 0.18 + dither(x, y) * 0.35;
      if ((x * 5 + layer * 3) % 4 === 0) v -= 0.45;
      if (ly === 3) v -= 0.6;
      c.set(x, y, S[v > 1 ? 3 : v > 0.45 ? 2 : v > -0.1 ? 1 : 0]);
    }
  }
}

/** ปล่องไฟหิน */
function chimney(c: PixelCanvas, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const mortar = j % 3 === 2 || (i + (Math.floor(j / 3) % 2 ? 1 : 0)) % 3 === 0;
      c.set(x + i, y + j, mortar ? 'D' : i < w / 2 ? 'W' : 'L');
    }
  }
  c.rect(x - 1, y, w + 2, 2, 'D');
  c.rect(x - 1, y, w + 2, 1, 'L');
  c.rect(x + 1, y, w - 2, 1, 'F');
}

/** ทรงกระบอกแรเงา (แสงจากซ้าย) */
function cylinder(c: PixelCanvas, x0: number, x1: number, y0: number, y1: number, shades: string[], bands = 0) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const rel = (x - x0 + 0.5) / (x1 - x0 + 1) + dither(x, y) * 0.12;
      let i = rel < 0.18 ? 3 : rel < 0.55 ? 2 : rel < 0.85 ? 1 : 0;
      if (bands && (y - y0) % bands === bands - 1) i = Math.max(0, i - 1);
      c.set(x, y, shades[i]);
    }
  }
}

/** ทรงกรวย (หลังคาหอคอย) ยอดที่ (cx, top) ฐานกว้าง hw ที่ y = bottom */
function cone(c: PixelCanvas, cx: number, top: number, bottom: number, hw: number, shades: string[], rows = 3) {
  for (let y = top; y <= bottom; y++) {
    const w = 0.6 + ((y - top) / (bottom - top)) * hw;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w) - 1; x++) {
      const rel = (x + 0.5 - (cx - w)) / (2 * w) + dither(x, y) * 0.12;
      let i = rel < 0.25 ? 3 : rel < 0.6 ? 2 : rel < 0.85 ? 1 : 0;
      if ((y - top) % rows === rows - 1) i = Math.max(0, i - 1);
      c.set(x, y, shades[i]);
    }
  }
}

/** ป้อมกำแพง (ฟันเฟือง) แถวบน */
function battlements(c: PixelCanvas, x0: number, x1: number, y: number, cols = ['W', 'L', 'D']) {
  for (let x = x0; x <= x1; x++) {
    const merlon = Math.floor((x - x0) / 3) % 2 === 0;
    if (merlon) {
      c.set(x, y, cols[0]);
      c.set(x, y + 1, cols[1]);
      c.set(x, y + 2, cols[1]);
    }
    c.set(x, y + 3, cols[0]);
    c.set(x, y + 4, cols[2]);
  }
}

/** ธงสามเหลี่ยมบนเสา */
function pennant(c: PixelCanvas, x: number, y: number, col: string, len = 6) {
  c.rect(x, y, 1, 8, 'F');
  for (let i = 0; i < len; i++) {
    const h = Math.max(1, Math.round(3 * (1 - i / len)));
    c.rect(x + 1 + i, y + Math.floor((3 - h) / 2), 1, h, i < 2 ? col : col === 'R' ? 'P' : col);
  }
  c.set(x + 1, y, 'r');
}

// ======================================================================
// บ้าน / ที่พัก
// ======================================================================

/** เพิงใบไม้ 34×26 — โครงไม้ไขว้ มุงใบปาล์ม ด้านในมีเสื่อนอน */
function leafHut(): PixelCanvas {
  const c = pc(34, 26);
  const rng = new RNG(7101);
  c.shadow(17, 23.5, 16, 2);
  const L = ['V', 'H', 'G', 'g'];
  for (let y = 4; y <= 22; y++) {
    const hw = Math.min(16, 1.5 + (y - 4) * 0.86);
    const layer = Math.floor((y - 4) / 3);
    for (let x = Math.round(17 - hw); x <= Math.round(17 + hw) - 1; x++) {
      const rel = (x + 0.5 - (17 - hw)) / (2 * hw);
      if ((y - 4) % 3 === 2 && (x + layer) % 2 === 0 && y < 22) continue;
      let v = 1.2 - rel * 1.4 + dither(x, y) * 0.4 + (rng.next() - 0.5) * 0.3;
      if ((x + layer * 2) % 5 === 0) v -= 0.5; // ก้านใบ
      c.set(x, y, L[v > 0.85 ? 3 : v > 0.25 ? 2 : v > -0.3 ? 1 : 0]);
    }
  }
  // ทางเข้าด้านใน (มืด) + เสื่อ
  for (let y = 12; y <= 22; y++) {
    const hw = (y - 12) * 0.55;
    for (let x = Math.round(17 - hw); x <= Math.round(17 + hw) - 1; x++) c.set(x, y, y < 17 ? 'O' : 'n');
  }
  c.rect(13, 21, 9, 2, 'R');
  c.rect(13, 21, 9, 1, 'r');
  c.set(14, 21, 'Y');
  c.set(18, 21, 'Y');
  // โครงไม้ไขว้ที่ยอด
  c.line(13, 0, 18, 6, 'M');
  c.line(21, 0, 16, 6, 'N');
  c.set(17, 4, 'S');
  // ฐานไม้ค้ำ
  c.rect(1, 22, 3, 2, 'm');
  c.rect(30, 22, 3, 2, 'm');
  // ก้อนหินกับกิ่งไม้
  c.rect(26, 22, 3, 2, 'L');
  c.set(26, 22, 'W');
  return c.outline();
}

/** เต็นท์ผ้าใบ 34×24 */
function tent(): PixelCanvas {
  const c = pc(34, 24);
  c.shadow(17, 21.5, 16, 2);
  for (let y = 3; y <= 21; y++) {
    const hw = Math.min(15, 1 + (y - 3) * 0.8);
    for (let x = Math.round(17 - hw); x <= Math.round(17 + hw) - 1; x++) {
      const rel = (x + 0.5 - 17) / hw;
      const stripe = Math.floor((x + 40) / 4) % 2 === 0;
      let col = rel < -0.4 ? (stripe ? '#f1dca4' : 'y') : rel < 0.45 ? (stripe ? 'S' : 'W') : stripe ? 's' : 'L';
      if (stripe && rel > -0.4 && rel < 0.45 && Math.floor((x + 40) / 4) % 4 === 0) col = 'R';
      c.set(x, y, col);
    }
  }
  // ประตูผ้าเปิด
  for (let y = 9; y <= 21; y++) {
    const hw = (y - 9) * 0.45;
    for (let x = Math.round(17 - hw); x <= Math.round(17 + hw) - 1; x++) c.set(x, y, y < 14 ? 'O' : 'n');
  }
  c.line(17, 9, 10, 21, 's');
  c.line(16, 10, 11, 20, 'S');
  c.line(18, 9, 21, 21, 's');
  c.rect(14, 20, 6, 1, 'U'); // ถุงนอน
  // เสากับเชือกขึง
  c.rect(16, 0, 2, 4, 'M');
  c.set(16, 0, 'N');
  c.line(2, 21, 16, 3, 'L');
  c.line(32, 21, 18, 3, 'L');
  for (const x of [1, 32]) c.rect(x, 20, 1, 3, 'm');
  return c.outline();
}

/** กระท่อมไม้ซุง 48×50 — ระเบียงหน้าบ้าน หลังคาไม้มีตะไคร่ */
function logCabin(): PixelCanvas {
  const c = pc(48, 50);
  const rng = new RNG(7103);
  c.shadow(24, 47.5, 23, 2.5);
  logWall(c, 4, 26, 43, 45);
  // ประตู + หน้าต่าง
  woodDoor(c, 20, 32, 8, 13);
  warmWindow(c, 8, 31, 6, 5, 'n', 'M');
  warmWindow(c, 34, 31, 6, 5, 'n', 'M');
  // ระเบียง: พื้น + เสา + ราว
  c.rect(2, 45, 44, 2, 'N');
  c.rect(2, 46, 44, 1, 'M');
  for (let x = 2; x < 46; x += 4) c.set(x, 45, 'm');
  for (const x of [3, 16, 31, 44]) {
    c.rect(x, 27, 2, 18, 'M');
    c.rect(x, 27, 1, 18, 'N');
  }
  c.rect(5, 39, 11, 1, 'N');
  c.rect(33, 39, 11, 1, 'N');
  for (const x of [8, 11, 14, 35, 38, 41]) c.rect(x, 40, 1, 5, 'm');
  // ถังกับกองฟืน
  c.rect(36, 42, 6, 3, 'M');
  for (let i = 0; i < 3; i++) c.ellipse(37 + i * 2, 42, 1, 1, 'S');
  // หลังคากระดานไม้ + ตะไคร่
  tileRoof(c, 5, 25, 10, 37, 0, 47, 'M', 'N', 'm', 3);
  for (let i = 0; i < 40; i++) {
    const x = rng.int(4, 43);
    const y = rng.int(8, 24);
    if (c.get(x, y)) c.set(x, y, rng.chance(0.5) ? 'H' : 'G');
  }
  c.rect(10, 4, 28, 2, 'm');
  c.rect(10, 4, 28, 1, 'N');
  c.rect(0, 25, 48, 1, 'n');
  // ปล่องไฟหิน
  chimney(c, 33, 0, 6, 12);
  return c.outline();
}

/** บ้านอิฐ 48×54 — อิฐแดง หลังคาชนวนเทา หน้าต่างกรอบขาว */
function brickHouse(): PixelCanvas {
  const c = pc(48, 54);
  const rng = new RNG(7104);
  c.shadow(24, 51.5, 23, 2.5);
  masonry(c, 3, 28, 44, 50, rng, ['#e08a6a', '#c0583f', '#8a2f3f', '#d9c8b4'], 5, 3);
  c.rect(3, 28, 2, 23, '#e08a6a');
  c.rect(43, 28, 2, 23, '#8a2f3f');
  c.rect(3, 48, 42, 3, 'D');
  c.rect(3, 48, 42, 1, 'L');
  // ประตูเขียว + ซุ้ม
  c.rect(18, 33, 12, 2, 'W');
  woodDoor(c, 20, 35, 8, 13, false, ['g', 'G', 'H']);
  c.rect(17, 49, 14, 1, 'W');
  c.rect(18, 48, 12, 1, 'L');
  // หน้าต่างกรอบขาว + กระบะดอกไม้
  for (const wx of [7, 35]) {
    warmWindow(c, wx, 32, 6, 7, 'W', 'L');
    c.rect(wx - 1, 41, 8, 2, 'M');
    for (let i = 0; i < 8; i += 2) {
      c.set(wx - 1 + i, 40, rng.pick(['R', 'p', 'Y', 'u']));
      c.set(wx + i, 40, 'G');
    }
  }
  // หลังคาชนวนเทา
  tileRoof(c, 4, 27, 11, 36, 0, 47, 'D', 'L', 'F', 3);
  c.rect(11, 3, 26, 2, 'F');
  c.rect(11, 3, 26, 1, 'D');
  c.rect(0, 27, 48, 1, 'F');
  c.rect(3, 28, 42, 1, '#5a2a30');
  // หน้าต่างหลังคา
  c.rect(19, 11, 10, 9, '#c0583f');
  tileRoof(c, 8, 11, 22, 25, 18, 29, 'D', 'L', 'F', 2);
  warmWindow(c, 22, 14, 4, 4, 'W', 'L');
  // ปล่องไฟอิฐ
  masonry(c, 34, 0, 39, 11, rng, ['#e08a6a', '#c0583f', '#8a2f3f', '#d9c8b4'], 3, 2);
  c.rect(33, 0, 8, 1, 'F');
  // โคมหน้าประตู
  c.rect(31, 36, 2, 3, 'Y');
  c.set(31, 36, 'y');
  return c.outline();
}

/** บ้านต้นไม้ 48×72 — ลำต้นใหญ่ บ้านไม้บนกิ่ง บันไดเชือก */
function treeHouse(): PixelCanvas {
  const c = pc(48, 72);
  const rng = new RNG(7105);
  c.shadow(24, 69.5, 20, 2.5);
  const LEAF = ['V', 'H', 'G', 'g'];
  // ใบไม้ด้านหลัง
  c.blob(24, 16, 23, 15, LEAF, rng, 0.25);
  c.blob(10, 24, 10, 8, LEAF, rng, 0.3);
  c.blob(38, 24, 10, 8, LEAF, rng, 0.3);
  // ลำต้น + ราก
  for (let y = 30; y <= 68; y++) {
    const flare = y > 60 ? (y - 60) * 0.9 : 0;
    const x0 = Math.round(18 - flare);
    const x1 = Math.round(29 + flare);
    for (let x = x0; x <= x1; x++) {
      const rel = (x - x0) / Math.max(1, x1 - x0) + dither(x, y) * 0.15;
      let col = rel < 0.2 ? 'N' : rel < 0.6 ? 'M' : 'm';
      if ((x * 3 + Math.floor(y / 5)) % 7 === 0) col = 'm';
      c.set(x, y, col);
    }
  }
  // โพรงต้นไม้
  c.ellipse(24, 55, 2, 3, 'n');
  // พื้นแท่น
  c.rect(4, 42, 40, 3, 'N');
  c.rect(4, 44, 40, 1, 'm');
  for (let x = 6; x < 44; x += 5) c.set(x, 43, 'M');
  c.line(8, 45, 18, 54, 'M');
  c.line(40, 45, 29, 54, 'm');
  // ตัวบ้าน
  planks(c, 8, 30, 39, 41, rng);
  c.rect(8, 30, 1, 12, 'S');
  c.rect(39, 30, 1, 12, 'm');
  woodDoor(c, 26, 33, 6, 9);
  warmWindow(c, 13, 33, 5, 4, 'n', 'M');
  // หลังคาฟาง
  thatchRoof(c, 19, 29, 13, 34, 5, 42);
  // ใบไม้ด้านหน้าคลุมหลังคาบางส่วน
  c.blob(6, 20, 6, 5, LEAF, rng, 0.4);
  c.blob(42, 18, 6, 5, LEAF, rng, 0.4);
  // บันไดเชือก
  for (let y = 45; y <= 68; y++) {
    c.set(35, y, 'S');
    c.set(39, y, 's');
    if (y % 3 === 0) c.rect(36, y, 3, 1, 'M');
  }
  // ผลไม้ + ตะเกียง
  for (const [x, y] of [[12, 10], [34, 8], [20, 4], [41, 26]] as [number, number][]) c.set(x, y, 'R');
  c.rect(42, 34, 2, 3, 'Y');
  c.set(42, 33, 'F');
  c.outline();
  return halo(c, 43, 35, 4, '255,205,117', 0.25);
}

/** บ้านริมน้ำบนเสา 48×56 — ผนังไผ่ หลังคาจาก เสาปักในน้ำ */
function stiltHouse(): PixelCanvas {
  const c = pc(48, 56);
  const rng = new RNG(7106);
  // ระลอกน้ำรอบเสา
  for (const x of [6, 18, 30, 42]) {
    c.rect(x - 2, 54, 6, 1, 'C');
    c.rect(x - 1, 55, 4, 1, 'w');
  }
  // เสา
  for (const x of [6, 18, 30, 42]) {
    c.rect(x, 40, 2, 15, 'M');
    c.rect(x, 40, 1, 15, 'N');
    c.rect(x, 50, 2, 1, 'm');
  }
  c.line(7, 44, 19, 52, 'm');
  c.line(31, 52, 43, 44, 'm');
  // พื้นชาน
  c.rect(1, 37, 46, 4, 'N');
  c.rect(1, 37, 46, 1, 'S');
  c.rect(1, 40, 46, 1, 'm');
  for (let x = 3; x < 47; x += 4) c.rect(x, 38, 1, 2, 'M');
  // ผนังไผ่
  for (let y = 21; y <= 36; y++) {
    for (let x = 5; x <= 42; x++) {
      const p = (x - 5) % 3;
      let col = p === 0 ? 'S' : p === 1 ? 's' : 'N';
      if ((y - 21) % 6 === 0) col = 'M';
      c.set(x, y, col);
    }
  }
  woodDoor(c, 21, 26, 7, 11);
  warmWindow(c, 9, 25, 6, 4, 'M', 'N');
  warmWindow(c, 33, 25, 6, 4, 'M', 'N');
  // แหจับปลาแขวน
  for (let y = 29; y <= 35; y++) for (let x = 33; x <= 40; x++) if ((x + y) % 2 === 0) c.set(x, y, 'L');
  // หลังคาจาก
  thatchRoof(c, 3, 20, 12, 35, 0, 47);
  c.rect(12, 2, 24, 2, '#7a5a26');
  // ตะเกียงที่ชาน
  c.rect(2, 31, 1, 6, 'M');
  c.rect(1, 29, 3, 3, 'Y');
  c.set(2, 29, 'y');
  // ปลาตากแห้ง
  for (const x of [44, 46]) {
    c.rect(x, 31, 1, 4, 'L');
    c.set(x, 30, 'F');
  }
  for (let i = 0; i < 6; i++) c.set(rng.int(8, 40), rng.int(4, 18), '#f1dca4');
  c.outline();
  return halo(c, 2, 30, 5, '255,205,117', 0.25);
}

/** โรงนา 64×64 — หลังคาทรงจั่วหัก (gambrel) ไก่ตั้งลม */
function barn(): PixelCanvas {
  const c = pc(64, 64);
  const rng = new RNG(7107);
  c.shadow(32, 61.5, 31, 2.5);
  // ผนังไม้แดงแนวตั้ง
  for (let y = 28; y <= 60; y++) {
    for (let x = 3; x <= 60; x++) {
      let col = (x - 3) % 4 === 3 ? 'P' : 'R';
      if (col === 'R' && x < 14 && dither(x, y) > 0.2) col = 'r';
      c.set(x, y, col);
    }
  }
  for (const x of [3, 59]) c.rect(x, 28, 2, 33, 'W');
  // หน้าจั่ว gambrel: ส่วนล่างชัน ส่วนบนลาด
  const half = (y: number) => (y >= 20 ? 30 : y >= 10 ? 21 + (y - 10) * 0.9 : 8 + (y - 2) * 1.6);
  for (let y = 2; y <= 27; y++) {
    const hw = half(y);
    for (let x = Math.round(32 - hw); x <= Math.round(32 + hw) - 1; x++) {
      let col = (x - 3) % 4 === 3 ? 'P' : 'R';
      if (col === 'R' && x < 20 && dither(x, y) > 0.2) col = 'r';
      c.set(x, y, col);
    }
    // ขอบหลังคา
    const l = Math.round(32 - hw) - 1;
    const r = Math.round(32 + hw);
    c.set(l - 1, y, 'L');
    c.set(l, y, 'D');
    c.set(r, y, 'D');
    c.set(r + 1, y, 'F');
  }
  c.rect(0, 27, 64, 2, 'D');
  c.rect(0, 27, 64, 1, 'L');
  // ประตูโรงนาใหญ่ (กากบาทขาว)
  c.rect(19, 36, 26, 25, 'W');
  c.rect(20, 37, 24, 24, 'R');
  for (const [x0, x1] of [[20, 31], [32, 43]] as [number, number][]) {
    c.line(x0, 37, x1, 60, 'W');
    c.line(x1, 37, x0, 60, 'W');
    c.rect(x0, 48, x1 - x0 + 1, 1, 'W');
  }
  c.rect(31, 37, 2, 24, 'O');
  // ช่องฟางชั้นลอย
  c.rect(26, 12, 12, 11, 'W');
  c.rect(27, 13, 10, 9, 'n');
  for (let y = 16; y <= 21; y++) for (let x = 27; x <= 36; x++) if (y > 17 || dither(x, y) > -0.1) c.set(x, y, dither(x, y) > 0.2 ? 'y' : 'Y');
  c.rect(31, 8, 2, 4, 'D'); // รอกดึงฟาง
  c.set(32, 12, 'L');
  // หน้าต่างข้าง
  for (const wx of [8, 50]) {
    c.rect(wx, 33, 7, 7, 'W');
    c.rect(wx + 1, 34, 5, 5, 'n');
    c.line(wx + 1, 34, wx + 5, 38, 'W');
    c.line(wx + 5, 34, wx + 1, 38, 'W');
  }
  // ไก่ตั้งลมบนยอด
  c.rect(31, 0, 1, 3, 'F');
  c.rect(29, 0, 5, 1, 'D');
  c.set(33, 0, 'R');
  // ฟ่อนฟางข้างประตู
  for (const bx of [7, 49]) {
    c.rect(bx, 54, 8, 6, 'Y');
    c.rect(bx, 54, 8, 1, 'y');
    c.rect(bx + 7, 54, 1, 6, 's');
    c.rect(bx + 3, 54, 1, 6, 'N');
    c.set(bx + rng.int(1, 6), 56, 'S');
  }
  return c.outline();
}

/** คฤหาสน์ 80×76 — สองชั้น เสาโรมัน หน้าจั่ว ระเบียงชั้นบน */
function manor(): PixelCanvas {
  const c = pc(80, 76);
  const rng = new RNG(7108);
  c.shadow(40, 73.5, 39, 2.5);
  // ชั้นล่าง: หินก่อ
  masonry(c, 4, 52, 75, 71, rng, ['W', 'L', 'D', 'D'], 7, 4);
  // ชั้นบน: ปูนขาวครีม
  for (let y = 30; y <= 51; y++) for (let x = 4; x <= 75; x++) c.set(x, y, x < 7 ? 'W' : dither(x, y) > 0.42 ? 'w' : '#f1e8d8');
  c.rect(4, 50, 72, 2, 'L');
  c.rect(4, 51, 72, 1, 'D');
  c.rect(4, 30, 72, 1, 'L');
  // หน้าต่างชั้นบน
  for (const wx of [9, 21, 53, 65]) {
    warmWindow(c, wx, 35, 6, 9, 'W', 'L');
    c.rect(wx - 1, 33, 8, 1, 'D');
  }
  // หน้าต่างชั้นล่าง
  for (const wx of [9, 21, 53, 65]) warmWindow(c, wx, 56, 6, 8, 'D', 'W');
  // มุขหน้าจั่วกลาง + เสา
  for (let y = 22; y <= 30; y++) {
    const hw = 6 + (y - 22) * 1.4;
    for (let x = Math.round(40 - hw); x <= Math.round(40 + hw) - 1; x++) c.set(x, y, y === 30 ? 'L' : (x + y) % 9 === 0 ? 'L' : 'W');
  }
  c.ellipse(40, 26, 2, 2, 'B');
  c.set(39, 25, 'b');
  c.rect(29, 31, 22, 2, 'L');
  // ระเบียงชั้นบน
  c.rect(30, 44, 20, 2, 'W');
  c.rect(30, 45, 20, 1, 'L');
  for (let x = 31; x < 50; x += 2) c.rect(x, 41, 1, 3, 'L');
  c.rect(30, 40, 20, 1, 'W');
  glassWindow(c, 35, 33, 10, 7, 'W');
  // เสาโรมัน 4 ต้น
  for (const x of [30, 35, 44, 49]) {
    c.rect(x, 46, 2, 25, 'W');
    c.rect(x + 1, 46, 1, 25, 'L');
    c.rect(x - 1, 46, 4, 1, 'L');
    c.rect(x - 1, 70, 4, 1, 'D');
  }
  // ประตูคู่
  woodDoor(c, 36, 58, 4, 13, false, ['N', 'M', 'm']);
  woodDoor(c, 40, 58, 4, 13, false, ['M', 'M', 'm']);
  c.rect(35, 56, 10, 1, 'Y');
  // บันไดหน้า
  c.rect(31, 71, 18, 1, 'W');
  c.rect(30, 72, 20, 1, 'L');
  // หลังคาน้ำเงิน
  tileRoof(c, 6, 29, 14, 65, 0, 79, 'B', 'b', 'U', 3);
  c.rect(14, 5, 52, 2, 'U');
  c.rect(14, 5, 52, 1, 'b');
  c.rect(0, 29, 80, 1, 'U');
  // หน้าต่างหลังคา
  for (const dx of [20, 54]) {
    c.rect(dx, 13, 8, 8, 'W');
    tileRoof(c, 10, 13, dx + 2, dx + 5, dx - 1, dx + 8, 'B', 'b', 'U', 2);
    warmWindow(c, dx + 2, 15, 4, 4, 'W', 'L');
  }
  // ปล่องไฟคู่
  chimney(c, 8, 0, 5, 10);
  chimney(c, 67, 0, 5, 10);
  // พุ่มไม้หน้าบ้าน
  for (const bx of [8, 22, 58, 72]) c.blob(bx, 69, 4, 3, ['V', 'H', 'G', 'g'], rng, 0.3);
  return c.outline();
}

/** ป้อมปราการ 80×72 — หอคอยสองข้าง ปราการกลาง ประตูซี่เหล็ก */
function fortress(): PixelCanvas {
  const c = pc(80, 72);
  const rng = new RNG(7109);
  c.shadow(40, 69.5, 39, 2.5);
  // กำแพงกลาง (หอกลาง)
  masonry(c, 20, 18, 59, 68, rng, ['W', 'L', 'D', 'F'], 6, 4);
  battlements(c, 20, 59, 13);
  // หอคอยข้าง (ทรงกระบอก)
  for (const [x0, x1] of [[2, 19], [60, 77]] as [number, number][]) {
    cylinder(c, x0, x1, 22, 68, ['F', 'D', 'L', 'W'], 4);
    for (let y = 22; y <= 68; y += 4) for (let x = x0; x <= x1; x++) if ((x + Math.floor(y / 4) * 3) % 6 === 0) c.set(x, y, 'F');
    battlements(c, x0, x1, 18);
    // หลังคากรวยแดง
    cone(c, (x0 + x1 + 1) / 2, 2, 18, 10, ['P', 'R', 'r', 'r']);
    pennant(c, Math.floor((x0 + x1) / 2), 0, 'R');
    // ช่องยิงธนู
    for (const y of [30, 46]) {
      c.rect(Math.floor((x0 + x1) / 2), y, 1, 5, 'O');
      c.rect(Math.floor((x0 + x1) / 2) - 1, y + 2, 3, 1, 'O');
    }
  }
  // ซุ้มประตูโค้ง + ซี่เหล็ก
  for (let y = 44; y <= 68; y++) {
    const dy = 51 - y;
    const hw = dy > 0 ? Math.sqrt(Math.max(0, 49 - dy * dy)) : 7;
    for (let x = Math.round(40 - hw - 2); x <= Math.round(40 + hw + 1); x++) c.set(x, y, 'D');
    for (let x = Math.round(40 - hw); x <= Math.round(40 + hw) - 1; x++) c.set(x, y, 'n');
  }
  for (let x = 34; x <= 46; x += 3) c.rect(x, 45, 1, 22, 'F');
  for (const y of [50, 56, 62]) c.rect(33, y, 14, 1, 'F');
  for (let x = 34; x <= 46; x += 3) c.set(x, 67, 'L');
  // ธงแขวน
  for (const bx of [25, 50]) {
    c.rect(bx, 22, 6, 14, 'R');
    c.rect(bx, 22, 1, 14, 'r');
    c.rect(bx, 22, 6, 1, 'Y');
    c.set(bx + 2, 35, 'R');
    c.set(bx + 3, 36, 'R');
    c.rect(bx + 2, 27, 2, 3, 'Y');
  }
  // หน้าต่างแสงไฟ
  for (const wx of [28, 50]) warmWindow(c, wx, 40, 2, 3, 'F', 'D');
  // ธงยอดหอกลาง
  pennant(c, 39, 4, 'B', 7);
  c.rect(39, 12, 1, 2, 'F');
  return c.outline();
}

/** หอคอยพ่อมด 32×80 — หอทรงกระบอก หลังคากรวยม่วงลายดาว คริสตัลบนยอด */
function wizardTower(): PixelCanvas {
  const c = pc(32, 80);
  const rng = new RNG(7110);
  c.shadow(16, 77.5, 13, 2);
  // ตัวหอ
  cylinder(c, 6, 25, 30, 76, ['U', 'D', 'L', 'W'], 4);
  for (let y = 30; y <= 76; y += 4) for (let x = 6; x <= 25; x++) if ((x + Math.floor(y / 4) * 2) % 5 === 0) c.set(x, y, 'F');
  // ฐานกว้าง
  c.rect(4, 72, 24, 5, 'D');
  c.rect(4, 72, 24, 1, 'L');
  c.rect(4, 72, 2, 5, 'L');
  // เถาวัลย์
  for (let y = 50; y <= 72; y++) if (rng.chance(0.6)) c.set(7 + Math.round(Math.sin(y * 0.4) * 1.5), y, rng.chance(0.5) ? 'G' : 'H');
  // ประตูโค้ง
  for (let y = 62; y <= 76; y++) {
    const dy = 65 - y;
    const hw = dy > 0 ? Math.sqrt(Math.max(0, 9 - dy * dy)) : 3;
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) c.set(x, y, 'P');
  }
  c.set(17, 70, 'Y');
  // หน้าต่างเรืองแสงฟ้า
  for (const [x, y] of [[14, 38], [19, 52]] as [number, number][]) {
    c.rect(x - 1, y - 1, 4, 6, 'F');
    c.rect(x, y, 2, 4, 'C');
    c.set(x, y, 'W');
  }
  // ระเบียง
  c.rect(3, 30, 26, 2, 'D');
  c.rect(3, 30, 26, 1, 'L');
  for (let x = 4; x <= 27; x += 3) c.rect(x, 27, 1, 3, 'F');
  c.rect(3, 27, 26, 1, 'D');
  // หลังคากรวยม่วง ขอบปีกกว้าง
  cone(c, 16, 2, 26, 15, ['U', 'P', 'u', 'u'], 4);
  for (const [x, y] of [[13, 14], [19, 20], [11, 23], [17, 9], [22, 24]] as [number, number][]) c.set(x, y, 'y');
  c.set(12, 14, 'Y');
  // คริสตัลบนยอด
  c.rect(15, 0, 2, 3, 'C');
  c.set(15, 0, 'W');
  c.outline();
  halo(c, 16, 1, 6, '115,239,247', 0.35);
  halo(c, 15, 40, 5, '115,239,247', 0.2);
  return c;
}

/** คลังสินค้าอัตโนมัติ 64×60 — ผนังสังกะสี ประตูม้วน ลังซ้อน */
function storehouse(): PixelCanvas {
  const c = pc(64, 60);
  c.shadow(32, 57.5, 31, 2.5);
  // ผนังลอนโลหะ
  for (let y = 20; y <= 56; y++) {
    for (let x = 3; x <= 60; x++) {
      const p = (x - 3) % 3;
      let col = p === 0 ? 'W' : p === 1 ? 'L' : 'D';
      if (x > 50 && p === 0) col = 'L';
      c.set(x, y, col);
    }
  }
  c.rect(3, 54, 58, 3, 'F');
  c.rect(3, 54, 58, 1, 'D');
  // หลังคาทรงฟันเลื่อย (shed roof)
  for (let i = 0; i < 4; i++) {
    const x0 = 1 + i * 16;
    for (let y = 6; y <= 19; y++) {
      const k = (y - 6) / 13;
      const top = Math.round(x0 + 14 * (1 - k));
      for (let x = top; x <= x0 + 15; x++) c.set(x, y, x === top ? 'L' : (y - 6) % 3 === 2 ? 'F' : 'D');
    }
    for (let y = 6; y <= 19; y++) c.set(x0 + 15, y, 'b'); // กระจกรับแสง
    c.set(x0 + 15, 7, 'C');
  }
  c.rect(0, 19, 64, 2, 'F');
  // ประตูม้วนใหญ่
  c.rect(16, 30, 26, 24, 'F');
  for (let y = 31; y <= 53; y++) for (let x = 17; x <= 40; x++) c.set(x, y, (y - 31) % 3 === 2 ? 'D' : y < 34 ? 'W' : 'L');
  c.rect(27, 50, 4, 1, 'Y');
  // แถบเตือนเหลืองดำ
  for (let x = 16; x <= 41; x++) c.set(x, 29, Math.floor(x / 2) % 2 ? 'Y' : 'O');
  // ป้ายหัวประตู
  c.rect(22, 23, 14, 5, 'B');
  c.rect(22, 23, 14, 1, 'b');
  for (const x of [24, 27, 30, 33]) c.rect(x, 25, 2, 1, 'W');
  // ลังไม้ซ้อน
  const crate = (x: number, y: number) => {
    c.rect(x, y, 8, 7, 'N');
    c.rect(x, y, 8, 1, 'S');
    c.rect(x + 7, y, 1, 7, 'm');
    c.rect(x, y + 6, 8, 1, 'm');
    c.line(x + 1, y + 1, x + 6, y + 5, 'M');
  };
  crate(4, 47);
  crate(9, 40);
  crate(4, 40);
  crate(46, 47);
  crate(53, 47);
  // ไฟสัญญาณ
  c.rect(43, 24, 2, 2, 'g');
  c.outline();
  return halo(c, 44, 25, 3, '167,240,112', 0.3);
}

// ======================================================================
// อาคารผลิต
// ======================================================================

/** โรงเลื่อย 48×40 (2 เฟรม ใบเลื่อยหมุน) */
function sawmill(frame: number): PixelCanvas {
  const c = pc(48, 40);
  const rng = new RNG(7201);
  c.shadow(24, 37.5, 23, 2);
  // เสาโรง
  for (const x of [3, 43]) {
    c.rect(x, 12, 2, 25, 'M');
    c.rect(x, 12, 1, 25, 'N');
  }
  // หลังคากระดาน
  tileRoof(c, 2, 13, 6, 41, 0, 47, 'N', 'S', 'M', 3);
  c.rect(0, 13, 48, 1, 'm');
  // กองซุง (ซ้าย)
  for (const [x, y] of [[7, 33], [12, 33], [9.5, 29]] as [number, number][]) {
    c.ellipse(x, y, 2.6, 2.6, 'M');
    c.ellipse(x, y, 1.7, 1.7, 'S');
    c.set(Math.floor(x), Math.floor(y), 'N');
  }
  // โต๊ะเลื่อย + ซุงบนราง
  c.rect(14, 28, 22, 3, 'N');
  c.rect(14, 30, 22, 1, 'm');
  for (const x of [15, 34]) c.rect(x, 31, 2, 6, 'm');
  c.rect(14, 25, 12, 3, 'M');
  c.rect(14, 25, 12, 1, 'N');
  c.ellipse(14, 26.5, 1.5, 1.5, 'S');
  // ใบเลื่อยวงเดือน
  const cx = 28;
  const cy = 22;
  c.ellipse(cx, cy, 6, 6, 'L');
  c.ellipse(cx, cy, 4, 4, 'W');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + frame * 0.32;
    c.set(Math.round(cx + Math.cos(a) * 6.6 - 0.5), Math.round(cy + Math.sin(a) * 6.6 - 0.5), 'D');
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + frame * 0.5;
    c.line(cx, cy, cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5, 'L');
  }
  c.rect(cx - 1, cy - 1, 2, 2, 'D');
  c.rect(cx - 1, cy + 6, 2, 3, 'F'); // แกน
  // ขี้เลื่อยกระเด็น
  for (let i = 0; i < 5; i++) c.set(cx + 6 + rng.int(0, 5) + frame, cy + rng.int(-2, 4), rng.chance(0.5) ? 'S' : 'Y');
  // กองไม้กระดาน (ขวา)
  for (let i = 0; i < 4; i++) {
    c.rect(36, 34 - i * 2, 9, 2, i % 2 ? 'N' : 'S');
    c.rect(36, 35 - i * 2, 9, 1, 'M');
  }
  return c.outline();
}

/** เตาเผาถ่าน 32×36 — โดมอิฐ ปากเตาไฟแดง ควันลอย (2 เฟรม) */
function charcoalKiln(frame: number): PixelCanvas {
  const c = pc(32, 36);
  const rng = new RNG(7202);
  c.shadow(16, 33.5, 15, 2);
  // โดมอิฐ
  for (let y = 8; y <= 32; y++) {
    const dy = (y - 32) / 24;
    const hw = 14 * Math.sqrt(Math.max(0, 1 - dy * dy));
    const row = Math.floor((y - 8) / 3);
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) {
      const rel = (x + 0.5 - 16) / Math.max(1, hw);
      const mortar = (y - 8) % 3 === 2 || (x + (row % 2 ? 2 : 0)) % 4 === 0;
      let col = rel < -0.45 ? '#e08a6a' : rel < 0.5 ? '#c0583f' : '#8a2f3f';
      if (mortar) col = '#5a2a30';
      if (!mortar && rng.chance(0.06)) col = 'F';
      c.set(x, y, col);
    }
  }
  // ปล่องควัน
  c.rect(14, 3, 5, 6, 'D');
  c.rect(14, 3, 5, 1, 'L');
  c.rect(15, 3, 3, 1, 'F');
  // ปากเตา
  for (let y = 22; y <= 32; y++) {
    const dy = 25 - y;
    const hw = dy > 0 ? Math.sqrt(Math.max(0, 16 - dy * dy)) : 4;
    for (let x = Math.round(16 - hw - 1); x <= Math.round(16 + hw); x++) c.set(x, y, 'F');
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) c.set(x, y, 'n');
  }
  flame(c, 16, 32, 7, frame, 3);
  for (const x of [13, 16, 19]) c.set(x, 32, 'm');
  // กองฟืนข้างเตา
  for (let i = 0; i < 3; i++) {
    c.ellipse(27 + (i % 2), 31 - i * 2, 1.6, 1.4, 'M');
    c.set(27 + (i % 2), 31 - i * 2, 'S');
  }
  c.outline();
  // ควัน (ไม่ตีขอบ)
  for (let i = 0; i < 3; i++) {
    const y = 2 - i + (frame ? -1 : 0);
    c.ellipse(16 + i + frame, y + 1, 1.6, 1.2, 'rgba(148,176,194,0.55)');
  }
  return halo(c, 16, 28, 7, '239,125,87', 0.3);
}

/** เครื่องหลอมอัตโนมัติ 32×40 — ตัวเหล็กหมุดย้ำ หม้อหลอมเรืองแสง ท่อ (2 เฟรม) */
function autoSmelter(frame: number): PixelCanvas {
  const c = pc(32, 40);
  c.shadow(16, 37.5, 15, 2);
  // ตัวเครื่อง
  for (let y = 14; y <= 36; y++) {
    for (let x = 3; x <= 26; x++) {
      const rel = (x - 3) / 23;
      let col = rel < 0.12 ? 'L' : rel < 0.75 ? 'D' : 'F';
      if ((y - 14) % 8 === 0) col = 'F';
      c.set(x, y, col);
    }
  }
  for (const [x, y] of [[5, 16], [24, 16], [5, 34], [24, 34], [5, 25], [24, 25]] as [number, number][]) c.set(x, y, 'W');
  // ช่องเตาเรือง
  c.rect(9, 20, 12, 8, 'F');
  for (let y = 21; y <= 27; y++) for (let x = 10; x <= 19; x++) c.set(x, y, (y + x + frame) % 4 === 0 ? 'y' : y < 24 ? 'Y' : 'r');
  for (let x = 10; x <= 19; x += 3) c.rect(x, 21, 1, 7, 'F');
  // หม้อหลอมบนหัว
  c.rect(7, 8, 16, 6, 'D');
  c.rect(7, 8, 16, 1, 'L');
  c.rect(9, 6, 12, 3, 'F');
  c.rect(10, 6, 10, 2, frame ? 'Y' : 'r');
  c.set(12 + frame * 4, 6, 'y');
  // ท่อด้านข้าง + เกจ
  c.rect(27, 6, 3, 30, 'D');
  c.rect(27, 6, 1, 30, 'L');
  c.rect(23, 4, 7, 3, 'D');
  c.rect(23, 4, 7, 1, 'L');
  c.ellipse(28.5, 20, 2.2, 2.2, 'W');
  c.line(28, 20, 29 + frame, 18, 'R');
  // ถาดทางออก + แท่งเหล็ก
  c.rect(1, 30, 10, 3, 'F');
  c.rect(2, 29, 4, 2, 'L');
  c.set(2, 29, 'W');
  // ไฟสถานะ
  c.rect(22, 31, 2, 2, frame ? 'g' : 'G');
  c.outline();
  return halo(c, 15, 24, 9, '255,205,117', frame ? 0.32 : 0.24);
}

/** ครัว/เตาอบ 32×28 — เตาอิฐ หม้อซุป กระทะ เครื่องดูดควัน */
function kitchen(): PixelCanvas {
  const c = pc(32, 28);
  const rng = new RNG(7203);
  c.shadow(16, 25.5, 15, 2);
  // เคาน์เตอร์อิฐ
  masonry(c, 2, 14, 29, 24, rng, ['#e08a6a', '#c0583f', '#8a2f3f', '#5a2a30'], 4, 3);
  c.rect(1, 12, 30, 3, 'L');
  c.rect(1, 12, 30, 1, 'W');
  // ช่องอบมีไฟ
  c.rect(4, 17, 10, 6, 'F');
  c.rect(5, 18, 8, 4, 'n');
  flame(c, 9, 21, 3, 0, 3);
  c.rect(4, 16, 10, 1, 'D');
  // หม้อซุป
  c.rect(16, 7, 8, 5, 'D');
  c.rect(16, 7, 8, 1, 'L');
  c.rect(17, 7, 6, 1, 'r');
  c.set(18, 7, 'Y');
  c.rect(15, 8, 1, 2, 'F');
  c.rect(24, 8, 1, 2, 'F');
  // กระทะ + ไข่
  c.ellipse(8, 11, 4, 1.4, 'F');
  c.rect(12, 10, 4, 1, 'm');
  c.set(7, 10, 'W');
  c.set(8, 10, 'Y');
  // เขียง + ผัก
  c.rect(25, 10, 5, 2, 'N');
  c.set(26, 9, 'r');
  c.set(28, 9, 'G');
  // เครื่องดูดควัน + ท่อ
  c.rect(6, 1, 12, 3, 'D');
  c.rect(6, 1, 12, 1, 'L');
  c.rect(10, 0, 4, 1, 'F');
  // ทัพพีแขวน
  for (const x of [22, 25, 28]) {
    c.rect(x, 1, 1, 4, 'L');
    c.set(x, 5, 'D');
  }
  c.rect(21, 0, 9, 1, 'm');
  c.outline();
  // ไอน้ำ
  for (let i = 0; i < 3; i++) c.set(18 + i * 2, 5 - i, 'rgba(244,244,244,0.6)');
  return halo(c, 9, 20, 6, '239,125,87', 0.22);
}

/** ถังเก็บน้ำฝน 16×26 — กรวยรับน้ำบนถังไม้ ก๊อกน้ำ */
function rainCollector(): PixelCanvas {
  const c = pc(16, 26);
  c.shadow(8, 23.5, 7, 1.5);
  // ถังไม้
  cylinder(c, 2, 13, 11, 22, ['m', 'M', 'N', 'S']);
  for (const y of [13, 20]) c.rect(2, y, 12, 1, 'D');
  // ก๊อก
  c.rect(13, 18, 2, 1, 'L');
  c.set(14, 19, 'b');
  // กรวยรับน้ำ
  for (let y = 3; y <= 10; y++) {
    const hw = 7.5 - (y - 3) * 0.6;
    for (let x = Math.round(8 - hw); x <= Math.round(8 + hw) - 1; x++) c.set(x, y, y === 3 ? 'W' : x < 6 ? 'L' : 'D');
  }
  // น้ำในกรวย
  c.rect(3, 4, 10, 1, 'b');
  c.rect(4, 4, 3, 1, 'C');
  return c.outline();
}

/** บ่อน้ำบาดาล 22×28 — ขอบหิน หลังคาไม้ ถังรอก */
function wellNew(): PixelCanvas {
  const c = pc(22, 28);
  const rng = new RNG(7205);
  c.shadow(11, 25.5, 10, 1.8);
  // ขอบบ่อหิน
  masonry(c, 2, 16, 19, 24, rng, ['W', 'L', 'D', 'F'], 4, 3);
  c.ellipse(11, 16, 9, 2.6, 'D');
  c.ellipse(11, 16, 7, 1.8, 'U');
  c.ellipse(9, 16, 2, 0.8, 'b');
  // เสา + หลังคา
  for (const x of [2, 18]) {
    c.rect(x, 6, 2, 11, 'M');
    c.rect(x, 6, 1, 11, 'N');
  }
  tileRoof(c, 1, 6, 6, 15, 0, 21, 'R', 'r', 'P', 2);
  // รอก + เชือก + ถัง
  c.rect(4, 8, 14, 1, 'm');
  c.rect(10, 8, 2, 2, 'D');
  c.rect(11, 10, 1, 4, 'S');
  c.rect(9, 13, 4, 3, 'M');
  c.rect(9, 13, 4, 1, 'D');
  return c.outline();
}

/** โต๊ะช่างขั้นสูง 32×24 — โต๊ะใหญ่ ปากกาจับ แผงเครื่องมือ ทั่งเล็ก */
function advWorkbench(): PixelCanvas {
  const c = pc(32, 24);
  c.shadow(16, 21.5, 15, 1.8);
  // แผงเครื่องมือด้านหลัง
  c.rect(3, 0, 26, 10, 'm');
  c.rect(4, 1, 24, 8, 'M');
  for (let y = 2; y <= 8; y += 2) for (let x = 5; x <= 27; x += 2) c.set(x, y, 'n');
  // เครื่องมือแขวน
  c.rect(6, 2, 1, 5, 'N');
  c.rect(5, 2, 3, 2, 'L'); // ค้อน
  c.rect(10, 2, 1, 6, 'L'); // ไขควง
  c.set(10, 7, 'R');
  c.line(13, 2, 16, 7, 'L'); // ประแจ
  c.set(13, 2, 'D');
  c.rect(19, 3, 5, 4, 'D'); // เลื่อย
  c.rect(19, 3, 5, 1, 'W');
  c.rect(24, 3, 2, 3, 'M');
  // พื้นโต๊ะ
  c.rect(1, 10, 30, 3, 'N');
  c.rect(1, 10, 30, 1, 'S');
  c.rect(1, 13, 30, 1, 'm');
  for (const x of [2, 28]) c.rect(x, 14, 2, 7, 'M');
  c.rect(4, 17, 24, 1, 'm');
  // ปากกาจับ (vise)
  c.rect(3, 7, 6, 3, 'D');
  c.rect(3, 7, 6, 1, 'L');
  c.rect(5, 6, 2, 1, 'F');
  // ทั่งเล็ก
  c.rect(20, 7, 8, 2, 'D');
  c.rect(20, 7, 8, 1, 'L');
  c.rect(22, 9, 4, 1, 'F');
  c.rect(18, 7, 2, 1, 'D');
  // พิมพ์เขียว
  c.rect(11, 8, 7, 2, 'B');
  c.set(12, 8, 'W');
  c.set(15, 9, 'C');
  // กล่องเครื่องมือใต้โต๊ะ
  c.rect(8, 18, 8, 3, 'R');
  c.rect(8, 18, 8, 1, 'r');
  c.set(11, 18, 'L');
  return c.outline();
}

// ======================================================================
// ฟาร์ม
// ======================================================================

/** รังผึ้ง 16×22 — กล่องซ้อนบนขาตั้ง ผึ้งบินรอบ */
function beehive(): PixelCanvas {
  const c = pc(16, 22);
  c.shadow(8, 19.5, 6, 1.4);
  for (const x of [3, 12]) c.rect(x, 15, 1, 5, 'm');
  c.rect(2, 14, 12, 2, 'M');
  // กล่องรังซ้อน 2 ชั้น
  for (const [y, col] of [[9, 'Y'], [4, 'S']] as [number, string][]) {
    c.rect(3, y, 10, 5, col);
    c.rect(3, y, 1, 5, 'y');
    c.rect(12, y, 1, 5, 's');
    c.rect(3, y + 4, 10, 1, 'N');
  }
  c.rect(6, 12, 4, 1, 'n'); // ทางเข้า
  // หลังคา
  c.rect(2, 2, 12, 2, 'D');
  c.rect(2, 2, 12, 1, 'L');
  // น้ำผึ้งย้อย
  c.set(5, 14, 'r');
  c.outline();
  // ผึ้ง
  for (const [x, y] of [[1, 6], [14, 9], [12, 1], [0, 12]] as [number, number][]) {
    c.set(x, y, 'Y');
    c.set(x + 1, y, 'O');
  }
  return c;
}

/** เล้าไก่ 32×32 — เล้ายกพื้น ทางลาด ไก่ + ไข่ */
function chickenCoop(): PixelCanvas {
  const c = pc(32, 32);
  const rng = new RNG(7302);
  c.shadow(16, 29.5, 15, 2);
  // ขาเล้า
  for (const x of [5, 22]) c.rect(x, 19, 2, 9, 'm');
  // ตัวเล้า
  planks(c, 4, 9, 24, 19, rng, ['W', 'L', 'D']);
  c.rect(4, 9, 1, 11, 'W');
  c.rect(24, 9, 1, 11, 'D');
  c.rect(11, 12, 6, 7, 'n'); // ช่องประตู
  c.rect(12, 16, 4, 3, 'Y'); // ฟางในรัง
  c.set(13, 16, 'W'); // ไข่
  // ทางลาด
  c.line(12, 20, 22, 28, 'N');
  c.line(13, 20, 23, 28, 'M');
  for (let i = 0; i < 4; i++) c.set(14 + i * 2, 22 + i * 2, 'm');
  // หลังคาแดง
  tileRoof(c, 2, 9, 6, 22, 1, 27, 'R', 'r', 'P', 2);
  // ไก่สองตัว
  const hen = (x: number, y: number, flip: boolean) => {
    c.ellipse(x, y, 3, 2.3, 'W');
    c.rect(x + (flip ? -3 : 2), y - 4, 2, 3, 'W');
    c.set(x + (flip ? -3 : 3), y - 5, 'R');
    c.set(x + (flip ? -4 : 4), y - 3, 'Y');
    c.set(x + (flip ? -2 : 2), y - 3, 'O');
    c.set(x + (flip ? 2 : -3), y - 1, 'L');
    c.rect(x, y + 2, 1, 2, 'Y');
  };
  hen(5, 26, false);
  hen(28, 23, true);
  // ไข่บนพื้น
  c.ellipse(26, 28, 1.2, 1, 'W');
  return c.outline();
}

/** กับดักปลา 16×16 — ไซสานจมน้ำครึ่งตัว ทุ่นลอย */
function fishTrap(): PixelCanvas {
  const c = pc(16, 16);
  // ระลอกน้ำ
  c.ellipse(8, 12, 7.5, 2.5, 'rgba(115,239,247,0.35)');
  // ไซสาน
  for (let y = 4; y <= 12; y++) {
    const hw = 2 + (y - 4) * 0.55;
    for (let x = Math.round(7 - hw); x <= Math.round(7 + hw) - 1; x++) c.set(x, y, (x + y) % 2 === 0 ? 'N' : 'M');
  }
  c.rect(5, 4, 4, 1, 'm');
  c.rect(3, 9, 9, 1, 'm');
  // ผิวน้ำปิดครึ่งล่าง
  for (let x = 1; x <= 14; x++) {
    c.set(x, 12, x % 3 === 0 ? 'w' : 'C');
    c.set(x, 13, 'b');
  }
  // ทุ่น
  c.line(9, 6, 13, 10, 'L');
  c.rect(12, 9, 3, 3, 'W');
  c.rect(12, 10, 3, 1, 'R');
  return c.outline();
}

/** ถังปุ๋ยหมัก 16×16 — กล่องระแนง ดินดำ ใบไม้ */
function compostBin(): PixelCanvas {
  const c = pc(16, 16);
  c.shadow(8, 14.5, 7, 1.3);
  // ดินหมักด้านบน
  c.ellipse(8, 5, 6, 2, 'n');
  c.set(5, 4, 'G');
  c.set(10, 4, 'g');
  c.set(7, 5, 'r');
  c.set(9, 3, 'H');
  // ระแนงไม้
  for (let y = 5; y <= 13; y++) {
    for (let x = 2; x <= 13; x++) {
      const p = (y - 5) % 3;
      c.set(x, y, p === 2 ? 'n' : p === 0 ? 'N' : 'M');
    }
  }
  for (const x of [2, 13]) c.rect(x, 4, 1, 10, 'm');
  // แมลงวันตัวเล็ก
  c.outline();
  c.set(3, 1, 'F');
  c.set(12, 0, 'F');
  return c;
}

/** โรงเพาะชำ (กรีนเฮาส์) 48×40 — โครงกระจก ต้นไม้ด้านใน ฐานอิฐ */
function greenhouse(): PixelCanvas {
  const c = pc(48, 40);
  const rng = new RNG(7304);
  c.shadow(24, 37.5, 23, 2);
  // ฐานอิฐ
  masonry(c, 2, 32, 45, 36, rng, ['#e08a6a', '#c0583f', '#8a2f3f', '#5a2a30'], 4, 2);
  // ผนังกระจก + หลังคาโค้ง
  for (let y = 4; y <= 31; y++) {
    const dy = Math.max(0, 16 - y) / 12;
    const hw = 22 * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = Math.round(24 - hw); x <= Math.round(24 + hw) - 1; x++) {
      const v = dither(x, y);
      c.set(x, y, (x + y) % 9 < 2 ? 'w' : v > 0.3 ? 'C' : 'rgba(65,166,246,0.55)');
    }
  }
  // ต้นไม้ด้านใน
  for (const [x, h] of [[9, 9], [16, 12], [24, 8], [31, 13], [38, 10]] as [number, number][]) {
    c.blob(x, 31 - h / 2, 3.5, h / 2, ['V', 'H', 'G', 'g'], rng, 0.4);
    if (rng.chance(0.6)) c.set(x, 31 - h + 2, rng.pick(['R', 'Y', 'r']));
  }
  // โครงเหล็กขาว
  for (let x = 2; x <= 45; x += 7) c.rect(x, 8, 1, 24, 'W');
  for (const y of [16, 24, 31]) c.rect(2, y, 44, 1, 'W');
  c.rect(23, 4, 2, 28, 'W');
  // ประตูกระจก
  c.rect(21, 22, 6, 10, 'L');
  c.rect(22, 23, 4, 9, 'C');
  c.set(25, 27, 'Y');
  // ช่องระบายบนหลังคา
  c.rect(18, 3, 12, 2, 'L');
  c.rect(18, 3, 12, 1, 'W');
  c.outline();
  return c;
}

/** หุ่นไล่กา 16×28 */
function scarecrow(): PixelCanvas {
  const c = pc(16, 28);
  c.shadow(8, 25.5, 4, 1.2);
  c.rect(7, 8, 2, 18, 'M');
  c.rect(7, 8, 1, 18, 'N');
  // แขน
  c.rect(1, 11, 14, 2, 'M');
  c.rect(1, 11, 14, 1, 'N');
  // เสื้อลายสก็อต
  for (let y = 10; y <= 18; y++) for (let x = 4; x <= 11; x++) c.set(x, y, (x + y) % 4 === 0 ? 'R' : x % 3 === 0 ? 'P' : 'B');
  c.rect(6, 15, 2, 2, 'S'); // แผ่นปะ
  // ฟางโผล่แขน
  for (const x of [0, 15]) {
    c.set(x, 11, 'Y');
    c.set(x, 13, 'y');
  }
  c.set(5, 19, 'Y');
  c.set(10, 19, 'Y');
  // หัวกระสอบ
  c.ellipse(8, 6, 3.5, 3.2, 'S');
  c.set(7, 5, 'O');
  c.set(9, 5, 'O');
  c.rect(7, 7, 3, 1, 'm');
  // หมวกฟาง
  c.rect(2, 3, 12, 1, 'Y');
  c.rect(5, 0, 6, 3, 'Y');
  c.rect(5, 0, 6, 1, 'y');
  c.rect(5, 2, 6, 1, 'R');
  c.outline();
  // อีกาเกาะ
  c.rect(13, 8, 2, 2, 'O');
  c.set(15, 8, 'Y');
  return c;
}

// ======================================================================
// ป้องกัน
// ======================================================================

/** หอธนู 32×60 — ฐานหิน ป้อมไม้ด้านบน หลังคากรวยแดง */
function towerArcher(): PixelCanvas {
  const c = pc(32, 60);
  const rng = new RNG(7401);
  c.shadow(16, 57.5, 14, 2);
  masonry(c, 5, 32, 26, 56, rng, ['W', 'L', 'D', 'F'], 5, 4);
  c.rect(4, 54, 24, 3, 'D');
  c.rect(4, 54, 24, 1, 'L');
  // ช่องยิง + ประตู
  c.rect(15, 38, 2, 6, 'O');
  c.rect(14, 40, 4, 1, 'O');
  woodDoor(c, 13, 48, 6, 8, true);
  // แท่นไม้
  c.rect(2, 29, 28, 4, 'N');
  c.rect(2, 29, 28, 1, 'S');
  c.rect(2, 32, 28, 1, 'm');
  for (const x of [3, 28]) c.line(x, 33, x + (x < 10 ? 3 : -3), 37, 'M');
  // ป้อมไม้ + โล่
  planks(c, 4, 17, 27, 28, rng);
  c.rect(7, 19, 18, 5, 'n');
  for (const x of [8, 15, 22]) {
    c.ellipse(x + 1.5, 26, 2.5, 2.5, 'R');
    c.set(x + 1, 25, 'Y');
  }
  // ลูกธนูพิงไว้
  c.line(9, 19, 11, 23, 'L');
  c.line(20, 19, 21, 23, 'L');
  // หลังคากรวย
  cone(c, 16, 2, 17, 15, ['P', 'R', 'r', 'r']);
  pennant(c, 16, 0, 'Y', 5);
  return c.outline();
}

/** ป้อมหน้าไม้ยักษ์ 32×22 — แท่นล้อ คันธนูใหญ่ ลูกดอกยักษ์ */
function ballista(): PixelCanvas {
  const c = pc(32, 22);
  c.shadow(16, 19.5, 15, 1.8);
  // แท่นไม้ + ล้อ
  c.rect(5, 12, 22, 4, 'M');
  c.rect(5, 12, 22, 1, 'N');
  c.rect(5, 15, 22, 1, 'm');
  for (const x of [8, 24]) {
    c.blob(x, 17, 3, 3, ['m', 'M', 'N']);
    c.set(x, 17, 'D');
  }
  // ขาตั้งหมุน
  c.rect(14, 9, 4, 4, 'D');
  c.rect(14, 9, 4, 1, 'L');
  // คันธนูใหญ่ (แขนโค้งแนวตั้ง ปลายงอไปด้านหลัง)
  for (let y = 0; y <= 14; y++) {
    const x = Math.round(22 - ((y - 7) / 7) ** 2 * 5);
    c.set(x, y, y < 3 || y > 11 ? 'M' : 'N');
    c.set(x + 1, y, 'm');
  }
  // สายธนูดึงไปที่ไก
  c.line(17, 0, 7, 7, 'L');
  c.line(17, 14, 7, 8, 'L');
  // รางยิง
  c.rect(4, 7, 22, 2, 'N');
  c.rect(4, 8, 22, 1, 'M');
  c.rect(4, 6, 1, 3, 'm');
  // ลูกดอกยักษ์
  c.rect(6, 6, 22, 1, 'D');
  c.rect(27, 5, 2, 3, 'L');
  c.set(29, 6, 'W');
  c.set(28, 5, 'W');
  c.set(6, 5, 'R');
  c.set(7, 5, 'r');
  c.set(6, 7, 'R');
  // กว้านดึงสาย
  c.ellipse(5, 10, 2, 2, 'D');
  c.set(5, 10, 'W');
  return c.outline();
}

/** ป้อมพ่นไฟ 18×24 — ถังเชื้อเพลิงลายเตือน หัวพ่นไฟ (2 เฟรม) */
function flameTurret(frame: number): PixelCanvas {
  const c = pc(18, 24);
  c.shadow(9, 21.5, 8, 1.5);
  // ฐาน
  c.rect(2, 18, 14, 3, 'D');
  c.rect(2, 18, 14, 1, 'L');
  // ถังน้ำมันแดง
  cylinder(c, 3, 12, 7, 18, ['P', 'R', 'r', 'r']);
  for (let x = 3; x <= 12; x++) c.set(x, 14, Math.floor(x / 2) % 2 ? 'Y' : 'O');
  c.rect(5, 5, 6, 2, 'D');
  c.rect(5, 5, 6, 1, 'L');
  // ท่อ + หัวพ่น
  c.rect(11, 9, 5, 2, 'D');
  c.rect(11, 9, 5, 1, 'L');
  c.rect(15, 8, 2, 4, 'F');
  // ไฟนำ
  c.rect(7, 3, 2, 2, 'F');
  c.outline();
  flame(c, 8, 3, 3 + frame, frame, 1.3);
  c.set(17, 9 + frame, 'Y');
  return halo(c, 8, 2, 4, '239,125,87', 0.3);
}

/** ป้อมเทสลา 18×38 — ขดลวดทองแดง ลูกทรงกลม ประกายไฟ (2 เฟรม) */
function teslaTower(frame: number): PixelCanvas {
  const c = pc(18, 38);
  c.shadow(9, 35.5, 7, 1.5);
  // ฐานคอนกรีต
  c.rect(2, 30, 14, 5, 'D');
  c.rect(2, 30, 14, 1, 'L');
  c.rect(2, 34, 14, 1, 'F');
  for (const x of [4, 13]) c.set(x, 32, 'Y');
  // แกนขดลวด
  for (let y = 12; y <= 29; y++) {
    for (let x = 5; x <= 12; x++) {
      const ring = (y - 12) % 2 === 0;
      const rel = (x - 5) / 7;
      c.set(x, y, ring ? (rel < 0.3 ? 'Y' : rel < 0.7 ? 'r' : 'R') : rel < 0.3 ? 'r' : 'm');
    }
  }
  c.rect(4, 12, 10, 1, 'D');
  c.rect(4, 28, 10, 2, 'D');
  // ลูกทรงกลมบนยอด
  c.rect(8, 9, 2, 3, 'D');
  c.blob(9, 6, 4.5, 4.5, ['D', 'L', 'W', 'W']);
  c.outline();
  // ประกายไฟฟ้า
  const sparks = frame
    ? [[2, 3], [1, 4], [15, 7], [16, 8], [13, 1], [14, 0]]
    : [[3, 7], [2, 8], [15, 3], [16, 2], [5, 0], [4, 1]];
  for (const [x, y] of sparks) c.set(x, y, frame ? 'C' : 'W');
  return halo(c, 9, 6, 9, '115,239,247', frame ? 0.4 : 0.28);
}

/** ปืนครก 30×20 — กระสอบทรายล้อม ลำกล้องอ้วนชี้ฟ้า */
function mortar(): PixelCanvas {
  const c = pc(30, 20);
  c.shadow(15, 17.5, 14, 1.8);
  // ลำกล้อง (เฉียงขึ้น)
  for (let i = 0; i < 9; i++) {
    const cx = 13 + i * 0.7;
    const cy = 12 - i;
    c.ellipse(cx, cy, 3.3, 2.2, i < 2 ? 'F' : i % 3 === 0 ? 'F' : 'D');
    c.set(Math.round(cx - 2), Math.round(cy - 1), 'L');
  }
  c.ellipse(19.3, 3, 3.3, 1.6, 'O');
  c.ellipse(19.3, 2.6, 2.6, 1.0, 'F');
  // ฐานหมุน
  c.rect(10, 12, 8, 3, 'D');
  c.rect(10, 12, 8, 1, 'L');
  // กระสอบทราย
  for (const [x, y] of [[3, 15], [9, 16], [15, 16], [21, 16], [26, 15], [6, 12], [24, 12]] as [number, number][]) {
    c.ellipse(x, y, 3.2, 1.8, 's');
    c.rect(x - 2, y - 1, 3, 1, 'S');
    c.set(x, y, 'M');
  }
  // กองกระสุน
  c.ellipse(27, 9, 1.5, 1.5, 'F');
  c.ellipse(28, 11, 1.5, 1.5, 'F');
  c.set(27, 8, 'L');
  return c.outline();
}

/** กับดักระเบิด 16×10 — แผ่นกดฝังดิน ถังดินปืนโผล่ */
function bombTrap(): PixelCanvas {
  const c = pc(16, 10);
  c.ellipse(8, 7, 7.5, 2.8, 'm');
  c.ellipse(8, 7, 6, 2, 'n');
  c.rect(4, 4, 8, 4, 'M');
  c.rect(4, 4, 8, 1, 'N');
  for (const x of [6, 9]) c.rect(x, 4, 1, 4, 'm');
  // ถังระเบิดโผล่
  c.rect(11, 2, 4, 5, 'R');
  c.rect(11, 2, 4, 1, 'r');
  c.rect(11, 4, 4, 1, 'F');
  c.line(13, 1, 14, 0, 'S');
  // หัวกะโหลกเตือน
  c.set(7, 5, 'W');
  c.set(8, 5, 'W');
  return c.outline();
}

/** กับดักน้ำแข็ง 16×12 — แผ่นผลึกน้ำแข็ง แท่งแหลม */
function frostTrap(): PixelCanvas {
  const c = pc(16, 12);
  c.ellipse(8, 9, 7.5, 2.6, 'B');
  c.ellipse(8, 9, 6, 1.8, 'b');
  c.ellipse(7, 8.5, 3, 0.8, 'C');
  for (const [x, h] of [[3, 4], [6, 7], [9, 5], [12, 6], [8, 3]] as [number, number][]) {
    for (let j = 0; j < h; j++) {
      c.set(x, 9 - j, j === h - 1 ? 'W' : 'C');
      if (j < h - 2) c.set(x + 1, 9 - j, 'b');
    }
  }
  c.outline('U');
  return halo(c, 8, 6, 7, '115,239,247', 0.25);
}

/** กับดักหนีบ 16×10 — ปากเหล็กมีฟัน โซ่ */
function snareTrap(): PixelCanvas {
  const c = pc(16, 10);
  c.ellipse(8, 7, 6.5, 2.4, 'F');
  c.ellipse(8, 7, 4.5, 1.5, 'D');
  for (let x = 3; x <= 13; x += 2) {
    c.set(x, 4, 'W');
    c.set(x, 5, 'L');
    c.set(x + 1, 8, 'L');
  }
  c.rect(7, 6, 2, 2, 'Y'); // แผ่นกด
  // โซ่
  for (let i = 0; i < 3; i++) c.set(13 + i, 8 + (i % 2), 'L');
  return c.outline();
}

/** เสาคบเพลิง 10×30 (2 เฟรม) */
function torchPole(frame: number): PixelCanvas {
  const c = pc(10, 30);
  c.shadow(5, 27.5, 3, 1);
  c.rect(4, 9, 2, 19, 'M');
  c.rect(4, 9, 1, 19, 'N');
  c.rect(3, 26, 4, 2, 'm');
  c.rect(3, 16, 4, 1, 'm');
  // ตะกร้าไฟ
  c.rect(2, 7, 6, 3, 'F');
  c.rect(2, 7, 6, 1, 'D');
  for (const x of [3, 6]) c.set(x, 8, 'D');
  c.outline();
  flame(c, 5, 7, 6, frame, 2.4);
  return halo(c, 5, 4, 5, '255,205,117', 0.3);
}

/** สปอตไลท์ 18×28 — ขาตั้งเหล็ก โคมใหญ่ */
function searchlight(): PixelCanvas {
  const c = pc(18, 28);
  c.shadow(9, 25.5, 7, 1.5);
  // ขาตั้งสามขา
  c.line(3, 25, 8, 14, 'D');
  c.line(15, 25, 10, 14, 'F');
  c.line(9, 25, 9, 14, 'D');
  c.rect(6, 13, 6, 2, 'F');
  // โคม
  c.blob(9, 8, 7, 6, ['F', 'D', 'L']);
  c.ellipse(9, 8, 5, 4.2, 'Y');
  c.ellipse(8, 7, 3, 2.4, 'y');
  c.ellipse(7, 6, 1.4, 1.2, 'W');
  for (let i = -4; i <= 4; i += 2) c.set(9 + i, 8, 'r');
  c.outline();
  return halo(c, 9, 8, 9, '255,242,176', 0.35);
}

/** ระฆังเตือนภัย 18×30 — โครงไม้มีหลังคา ระฆังทองเหลือง */
function alarmBell(): PixelCanvas {
  const c = pc(18, 30);
  c.shadow(9, 27.5, 7, 1.5);
  for (const x of [2, 14]) {
    c.rect(x, 7, 2, 21, 'M');
    c.rect(x, 7, 1, 21, 'N');
  }
  c.rect(2, 8, 14, 1, 'm');
  c.line(3, 26, 9, 20, 'm');
  c.line(15, 26, 9, 20, 'm');
  // หลังคา
  tileRoof(c, 2, 7, 5, 12, 0, 17, 'R', 'r', 'P', 2);
  // ระฆัง
  for (let y = 10; y <= 17; y++) {
    const hw = 2 + (y - 10) * 0.45 + (y > 15 ? 0.6 : 0);
    for (let x = Math.round(9 - hw); x <= Math.round(9 + hw) - 1; x++) {
      const rel = (x + 0.5 - (9 - hw)) / (2 * hw);
      c.set(x, y, rel < 0.3 ? 'y' : rel < 0.7 ? 'Y' : 'r');
    }
  }
  c.rect(5, 17, 8, 1, 'N');
  c.set(9, 18, 'D');
  // เชือกดึง
  c.rect(12, 18, 1, 7, 'S');
  c.set(12, 25, 'R');
  return c.outline();
}

// ======================================================================
// กำแพง / ประตู / รั้ว / พื้น
// ======================================================================

/** รั้วซุงแหลม 16×26 */
function palisade(): PixelCanvas {
  const c = pc(16, 26);
  c.shadow(8, 24.5, 8, 1.5);
  for (const [x0, top] of [[0, 2], [5, 0], [11, 3]] as [number, number][]) {
    const w = 5;
    for (let y = top; y <= 23; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const rel = (x - x0) / (w - 1);
        const tip = y - top < 3 && Math.abs(x - (x0 + 2)) > y - top;
        if (tip) continue;
        let col = rel < 0.25 ? 'S' : rel < 0.7 ? 'N' : 'M';
        if ((y + x0) % 7 === 0 && rel > 0.2) col = 'M';
        c.set(x, y, col);
      }
    }
  }
  // เชือกมัด
  for (const y of [9, 18]) {
    c.rect(0, y, 16, 1, 'S');
    c.rect(0, y + 1, 16, 1, 's');
  }
  return c.outline();
}

/** กำแพงอิฐ 16×22 (ต่อกันได้) */
function brickWall(): PixelCanvas {
  const c = pc(16, 22);
  const rng = new RNG(7501);
  c.shadow(8, 20.5, 8, 1.5);
  c.rect(0, 2, 16, 3, 'L');
  c.rect(0, 2, 16, 1, 'W');
  c.rect(0, 4, 16, 1, 'D');
  masonry(c, 0, 5, 15, 20, rng, ['#e08a6a', '#c0583f', '#8a2f3f', '#d9c8b4'], 6, 3);
  for (let x = 0; x < 16; x++) c.set(x, 20, '#5a2a30');
  return c.outline();
}

/** กำแพงอุกกาบาต 16×22 — หินม่วงดำ เส้นแร่เรืองแสง */
function meteorWall(): PixelCanvas {
  const c = pc(16, 22);
  const rng = new RNG(7502);
  c.shadow(8, 20.5, 8, 1.5);
  c.rect(0, 2, 16, 3, 'P');
  c.rect(0, 2, 16, 1, 'u');
  c.rect(0, 4, 16, 1, 'U');
  masonry(c, 0, 5, 15, 20, rng, ['u', 'P', 'U', 'O'], 8, 5);
  // เส้นแร่ร้อน
  c.line(2, 7, 6, 12, 'r');
  c.line(6, 12, 5, 17, 'p');
  c.line(11, 6, 13, 10, 'p');
  c.line(13, 10, 10, 15, 'r');
  c.set(3, 8, 'Y');
  c.set(12, 8, 'y');
  c.outline();
  return halo(c, 8, 12, 9, '255,159,176', 0.12);
}

/** ประตูหิน/อุกกาบาต 16×22 ปิด/เปิด */
function heavyDoor(kind: 'stone' | 'meteor', open: boolean): PixelCanvas {
  const c = pc(16, 22);
  c.shadow(8, 20.5, 8, 1.5);
  const [hl, mid, dk, acc] = kind === 'stone' ? ['W', 'L', 'D', 'Y'] : ['u', 'P', 'U', 'p'];
  // ซุ้มประตู
  c.rect(0, 2, 16, 19, mid);
  c.rect(0, 2, 16, 1, hl);
  c.rect(0, 2, 1, 19, hl);
  c.rect(15, 2, 1, 19, dk);
  c.rect(4, 3, 8, 1, dk);
  c.set(7, 2, acc);
  c.set(8, 2, acc);
  if (open) {
    for (let y = 5; y <= 20; y++) for (let x = 2; x <= 13; x++) c.set(x, y, y + dither(x, y) * 3 < 12 ? 'O' : kind === 'stone' ? 'n' : 'U');
    // บานประตูพับเข้าข้าง
    for (let y = 5; y <= 20; y++) {
      c.set(2, y, hl);
      c.set(3, y, mid);
      c.set(4, y, dk);
    }
    return c.outline();
  }
  for (let y = 5; y <= 20; y++) {
    for (let x = 2; x <= 13; x++) {
      let col = x === 2 || y === 5 ? hl : x === 13 || y === 20 ? dk : mid;
      if (x === 7 || x === 8) col = dk;
      if ((y - 5) % 5 === 0 && x > 2 && x < 13) col = dk;
      c.set(x, y, col);
    }
  }
  // หมุดเหล็ก + ห่วง
  for (const [x, y] of [[4, 7], [11, 7], [4, 17], [11, 17]] as [number, number][]) c.set(x, y, kind === 'stone' ? 'F' : 'r');
  c.set(6, 12, acc);
  c.set(9, 12, acc);
  c.rect(6, 13, 1, 2, 'F');
  c.rect(9, 13, 1, 2, 'F');
  if (kind === 'meteor') {
    c.line(3, 9, 6, 15, 'r');
    c.line(12, 8, 10, 16, 'p');
  }
  const out = c.outline();
  return kind === 'meteor' ? halo(out, 8, 12, 9, '255,159,176', 0.12) : out;
}

/** กำแพงหินเตี้ย 16×14 (ต่อกันได้) */
function fenceStone(): PixelCanvas {
  const c = pc(16, 14);
  const rng = new RNG(7503);
  c.shadow(8, 12.5, 8, 1.2);
  for (let i = 0; i < 5; i++) {
    const x = i * 3.5 + 1;
    const y = i % 2 ? 9 : 8.5;
    c.blob(x, y, 2.6, 2.4, ['D', 'L', 'L', 'W'], rng, 0.2);
  }
  for (let i = 0; i < 4; i++) c.blob(i * 4 + 2.5, 5, 2.4, 2.2, ['D', 'L', 'W', 'W'], rng, 0.2);
  c.set(4, 4, 'G');
  c.set(11, 5, 'H');
  return c.outline();
}

/** รั้วไม้ขาว (picket) 16×14 */
function fencePicket(): PixelCanvas {
  const c = pc(16, 14);
  c.shadow(8, 12.5, 8, 1.2);
  for (const y of [5, 9]) {
    c.rect(0, y, 16, 1, 'W');
    c.rect(0, y + 1, 16, 1, 'L');
  }
  for (let x0 = 1; x0 < 16; x0 += 4) {
    c.rect(x0, 2, 3, 10, 'W');
    c.rect(x0 + 2, 2, 1, 10, 'L');
    c.set(x0 + 1, 1, 'W');
    c.set(x0, 2, 'w');
  }
  return c.outline();
}

/** ทางเดินไม้กระดาน 16×16 (แบน) */
function floorPlank(): PixelCanvas {
  const c = pc(16, 16);
  for (let y = 0; y < 16; y++) {
    const r = y % 4;
    for (let x = 0; x < 16; x++) {
      let col = r === 3 ? 'n' : r === 0 ? 'S' : 'N';
      if (r !== 3 && dither(x, y) > 0.38) col = 'M';
      c.set(x, y, col);
    }
  }
  for (const [x, y] of [[2, 1], [13, 1], [2, 5], [13, 5], [2, 9], [13, 9], [2, 13], [13, 13]] as [number, number][]) c.set(x, y, 'D');
  return c;
}

/** ทางเดินหินกรวด 16×16 (แบน) */
function floorCobble(): PixelCanvas {
  const c = pc(16, 16);
  const rng = new RNG(7505);
  c.rect(0, 0, 16, 16, 'F');
  const stones: [number, number][] = [[3, 3], [9, 2], [14, 4], [2, 9], [7, 8], [12, 10], [4, 14], [10, 14], [15, 15], [0, 15]];
  for (const [x, y] of stones) c.blob(x, y, 2.6 + rng.next(), 2.2 + rng.next() * 0.6, ['D', 'L', 'L', 'W']);
  return c;
}

/** พื้นหินอ่อน 16×16 (แบน) */
function floorMarble(): PixelCanvas {
  const c = pc(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) c.set(x, y, dither(x, y) > 0.35 ? 'w' : 'W');
  c.line(1, 3, 6, 7, 'L');
  c.line(6, 7, 9, 6, 'L');
  c.line(9, 10, 14, 14, 'L');
  c.rect(0, 15, 16, 1, 'L');
  c.rect(15, 0, 1, 16, 'L');
  c.rect(7, 7, 2, 2, 'Y');
  c.set(7, 7, 'y');
  return c;
}

// ======================================================================
// เฟอร์นิเจอร์ / ตกแต่ง
// ======================================================================

/** โซฟา 32×18 */
function sofa(): PixelCanvas {
  const c = pc(32, 18);
  c.shadow(16, 16.5, 15, 1.4);
  const [hl, mid, dk] = ['r', 'R', 'P'];
  // พนักพิง
  c.rect(3, 2, 26, 7, mid);
  c.rect(3, 2, 26, 1, hl);
  for (const x of [11, 20]) c.rect(x, 3, 1, 6, dk);
  // เบาะนั่ง
  c.rect(3, 9, 26, 4, hl);
  c.rect(3, 12, 26, 1, dk);
  for (const x of [11, 20]) c.rect(x, 9, 1, 4, mid);
  // ที่วางแขน
  for (const x of [0, 28]) {
    c.rect(x, 5, 4, 10, mid);
    c.rect(x, 5, 4, 1, hl);
    c.rect(x + 3, 6, 1, 9, dk);
  }
  c.rect(3, 13, 26, 2, dk);
  // ขาไม้
  for (const x of [1, 29]) c.rect(x, 15, 2, 1, 'm');
  // หมอนอิง
  c.rect(5, 6, 5, 4, 'Y');
  c.rect(5, 6, 5, 1, 'y');
  return c.outline();
}

/** ตู้เสื้อผ้า 16×28 */
function wardrobe(): PixelCanvas {
  const c = pc(16, 28);
  c.shadow(8, 26.5, 8, 1.3);
  c.rect(1, 2, 14, 24, 'M');
  c.rect(1, 2, 14, 1, 'N');
  c.rect(0, 0, 16, 3, 'N');
  c.rect(0, 0, 16, 1, 'S');
  c.rect(1, 25, 14, 1, 'm');
  // บานประตูคู่
  for (const x0 of [2, 8]) {
    c.rect(x0, 4, 6, 19, 'N');
    c.rect(x0 + 1, 5, 4, 7, 'M');
    c.rect(x0 + 1, 14, 4, 7, 'M');
    c.rect(x0 + 1, 5, 4, 1, 'm');
  }
  c.rect(7, 4, 2, 19, 'm');
  c.set(6, 13, 'Y');
  c.set(9, 13, 'Y');
  // ลิ้นชักล่าง
  c.rect(2, 23, 12, 2, 'N');
  c.set(8, 24, 'Y');
  return c.outline();
}

/** ชั้นโชว์อาวุธ 16×22 */
function weaponRack(): PixelCanvas {
  const c = pc(16, 22);
  c.shadow(8, 20.5, 7, 1.3);
  for (const x of [1, 13]) {
    c.rect(x, 2, 2, 18, 'M');
    c.rect(x, 2, 1, 18, 'N');
  }
  for (const y of [4, 16]) c.rect(1, y, 14, 2, 'N');
  c.rect(1, 17, 14, 1, 'm');
  // ดาบ
  c.rect(4, 2, 1, 13, 'W');
  c.rect(5, 2, 1, 13, 'L');
  c.rect(3, 13, 4, 1, 'Y');
  c.rect(4, 14, 2, 3, 'm');
  // ขวาน
  c.rect(8, 3, 1, 14, 'M');
  c.rect(9, 3, 3, 4, 'L');
  c.rect(9, 3, 1, 4, 'W');
  // หอก
  c.rect(11, 1, 1, 16, 'N');
  c.set(11, 0, 'W');
  c.set(11, 1, 'L');
  // โล่กลม
  c.blob(8, 10, 2.6, 2.6, ['P', 'R', 'r']);
  c.set(8, 10, 'Y');
  return c.outline();
}

/** ต้นไม้กระถาง 12×22 — ใบมอนสเตอร่า */
function pottedPlant(): PixelCanvas {
  const c = pc(12, 22);
  const rng = new RNG(7604);
  c.shadow(6, 20.5, 4, 1);
  // กระถางดินเผา
  for (let y = 14; y <= 19; y++) {
    const hw = 4 - (y - 14) * 0.3;
    for (let x = Math.round(6 - hw); x <= Math.round(6 + hw) - 1; x++) c.set(x, y, x < 5 ? 'r' : x < 8 ? '#c0583f' : '#8a2f3f');
  }
  c.rect(1, 13, 10, 2, '#c0583f');
  c.rect(1, 13, 10, 1, 'r');
  // ใบ
  c.blob(4, 6, 3.5, 3, ['V', 'H', 'G', 'g'], rng, 0.3);
  c.blob(8, 8, 3.5, 3, ['V', 'H', 'G', 'g'], rng, 0.3);
  c.blob(6, 3, 3, 3, ['V', 'H', 'G', 'g'], rng, 0.3);
  c.blob(3, 10, 2.5, 2, ['V', 'H', 'G'], rng, 0.3);
  c.line(6, 12, 6, 5, 'H');
  c.set(5, 6, 'V');
  c.set(8, 8, 'V');
  return c.outline();
}

/** โคมไฟตั้งพื้น 10×26 */
function floorLamp(): PixelCanvas {
  const c = pc(10, 26);
  c.shadow(5, 24.5, 3, 1);
  c.rect(2, 23, 6, 1, 'F');
  c.rect(3, 22, 4, 1, 'D');
  c.rect(4, 9, 2, 13, 'D');
  c.rect(4, 9, 1, 13, 'L');
  // โป๊ะผ้า
  for (let y = 1; y <= 8; y++) {
    const hw = 2 + (y - 1) * 0.42;
    for (let x = Math.round(5 - hw); x <= Math.round(5 + hw) - 1; x++) c.set(x, y, x < 4 ? 'y' : 'Y');
  }
  c.rect(1, 8, 8, 1, 'r');
  c.outline();
  return halo(c, 5, 10, 6, '255,205,117', 0.3);
}

/** ภาพวาดบนขาตั้ง 16×24 */
function painting(): PixelCanvas {
  const c = pc(16, 24);
  c.shadow(8, 22.5, 6, 1.2);
  // ขาตั้ง
  c.line(3, 22, 6, 4, 'M');
  c.line(13, 22, 10, 4, 'm');
  c.line(8, 22, 8, 14, 'M');
  // กรอบทอง
  c.rect(1, 1, 14, 13, 'Y');
  c.rect(1, 1, 14, 1, 'y');
  c.rect(14, 1, 1, 13, 'r');
  // ภาพทิวทัศน์เกาะ
  c.rect(2, 2, 12, 11, 'b');
  c.rect(2, 2, 12, 3, 'C');
  c.ellipse(11, 4, 1.5, 1.5, 'y');
  c.rect(2, 9, 12, 4, 'B');
  c.ellipse(7, 9, 4, 2, 'S');
  c.rect(6, 5, 1, 4, 'M');
  c.blob(6, 5, 2.5, 1.5, ['H', 'G', 'g']);
  c.rect(1, 13, 14, 1, 'r');
  return c.outline();
}

/** พรมวงกลม 32×32 (แบน) */
function rugRound(): PixelCanvas {
  const c = pc(32, 32);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x + 0.5 - 16, (y + 0.5 - 16) * 1.0) / 15.5;
      if (d > 1) continue;
      let col = 'B';
      if (d > 0.9) col = 'U';
      else if (d > 0.82) col = 'Y';
      else if (d > 0.62) col = (Math.floor(Math.atan2(y - 16, x - 16) * 4) % 2 === 0) ? 'b' : 'B';
      else if (d > 0.55) col = 'Y';
      else if (d > 0.25) col = 'U';
      else col = 'r';
      if (d < 0.12) col = 'Y';
      c.set(x, y, col);
    }
  }
  return c;
}

/** เตาผิง 32×30 — หินก่อ ไฟลุก (2 เฟรม) */
function fireplace(frame: number): PixelCanvas {
  const c = pc(32, 30);
  const rng = new RNG(7608);
  c.shadow(16, 28.5, 15, 1.4);
  masonry(c, 2, 6, 29, 27, rng, ['W', 'L', 'D', 'F'], 5, 3);
  // หิ้งไม้
  c.rect(0, 6, 32, 3, 'N');
  c.rect(0, 6, 32, 1, 'S');
  c.rect(0, 8, 32, 1, 'm');
  // ของบนหิ้ง
  c.rect(4, 3, 2, 3, 'Y');
  c.set(4, 2, 'y');
  c.rect(24, 2, 4, 4, 'u');
  c.rect(24, 2, 4, 1, 'W');
  c.rect(13, 1, 6, 5, 'Y');
  c.rect(14, 2, 4, 3, 'b');
  // ปล่องไฟ (ช่องไฟ)
  for (let y = 13; y <= 27; y++) {
    const dy = 17 - y;
    const hw = dy > 0 ? Math.sqrt(Math.max(0, 49 - dy * dy * 3)) : 7;
    for (let x = Math.round(16 - hw); x <= Math.round(16 + hw) - 1; x++) c.set(x, y, 'O');
  }
  for (const x of [12, 16, 20]) {
    c.rect(x - 2, 25, 5, 2, 'M');
    c.set(x - 2, 25, 'N');
  }
  flame(c, 14, 25, 7 + frame, frame, 3);
  flame(c, 18, 25, 6 - frame, frame + 1, 2.5);
  c.outline();
  return halo(c, 16, 22, 10, '239,125,87', 0.25);
}

/** โต๊ะอาหารยาว 32×18 */
function diningTable(): PixelCanvas {
  const c = pc(32, 18);
  c.shadow(16, 16.5, 15, 1.4);
  c.rect(1, 4, 30, 7, 'N');
  c.rect(1, 4, 30, 1, 'S');
  c.rect(1, 10, 30, 2, 'M');
  c.rect(1, 11, 30, 1, 'm');
  for (const x of [2, 28]) c.rect(x, 12, 2, 4, 'M');
  // ผ้าปูกลาง
  c.rect(8, 4, 16, 7, 'W');
  c.rect(8, 10, 16, 2, 'L');
  // จาน + อาหาร
  for (const x of [5, 13, 21, 27]) {
    c.ellipse(x, 7, 2, 1.3, 'W');
    c.set(x, 7, x === 13 ? 'r' : x === 21 ? 'G' : 'N');
  }
  // เทียน
  c.rect(16, 2, 1, 4, 'W');
  c.set(16, 1, 'Y');
  c.outline();
  return halo(c, 16, 1, 3, '255,205,117', 0.3);
}

/** ตู้ปลา 32×22 */
function aquarium(): PixelCanvas {
  const c = pc(32, 22);
  c.shadow(16, 20.5, 15, 1.4);
  // ตู้ไม้ด้านล่าง
  c.rect(1, 14, 30, 6, 'M');
  c.rect(1, 14, 30, 1, 'N');
  c.rect(15, 15, 1, 5, 'm');
  // ตู้กระจก
  c.rect(1, 1, 30, 13, 'F');
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 29; x++) c.set(x, y, y < 4 ? 'C' : dither(x, y) > 0.35 ? 'B' : 'b');
  // ทรายพื้น + สาหร่าย
  c.rect(2, 11, 28, 2, 'S');
  for (const x of [5, 9, 24]) for (let y = 6; y <= 10; y++) c.set(x + (y % 2), y, 'G');
  // ปลา
  for (const [x, y, col] of [[13, 6, 'r'], [19, 8, 'Y'], [26, 5, 'p']] as [number, number, string][]) {
    c.rect(x, y, 3, 2, col);
    c.set(x + 3, y, col);
    c.set(x + 3, y + 1, col);
    c.set(x, y, 'O');
  }
  // ฟองอากาศ
  c.set(22, 3, 'W');
  c.set(21, 5, 'w');
  c.rect(1, 0, 30, 1, 'D');
  return c.outline();
}

// ======================================================================
// ไอคอนวัสดุก่อสร้าง / อาหาร 16×16
// ======================================================================

function icons(): Record<string, PixelCanvas> {
  const o: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(16, 16); // ไม้กระดาน
  for (let i = 0; i < 3; i++) {
    const y = 4 + i * 3;
    c.rect(2 + i, y, 12, 3, 'N');
    c.rect(2 + i, y, 12, 1, 'S');
    c.rect(2 + i, y + 2, 12, 1, 'M');
    c.set(4 + i * 3, y + 1, 'm');
  }
  o.i_plank = c.outline();

  c = pc(16, 16); // อิฐ
  for (const [x, y] of [[2, 9], [8, 9], [5, 5]] as [number, number][]) {
    c.rect(x, y, 6, 4, '#c0583f');
    c.rect(x, y, 6, 1, '#e08a6a');
    c.rect(x + 5, y, 1, 4, '#8a2f3f');
    c.rect(x, y + 3, 6, 1, '#8a2f3f');
  }
  o.i_brick = c.outline();

  c = pc(16, 16); // กระจก
  c.rect(3, 3, 10, 10, 'b');
  c.rect(3, 3, 10, 1, 'C');
  c.line(4, 10, 10, 4, 'W');
  c.line(5, 11, 11, 5, 'C');
  c.rect(3, 12, 10, 1, 'B');
  o.i_glass = c.outline();

  c = pc(16, 16); // เหล็กกล้า
  for (let y = 5; y <= 11; y++) for (let x = 2; x <= 13; x++) c.set(x, y, y === 5 ? 'W' : y < 8 ? 'L' : y < 10 ? 'D' : 'F');
  for (const x of [3, 12]) {
    c.set(x, 7, 'W');
    c.set(x, 9, 'F');
  }
  c.line(5, 6, 9, 6, 'W');
  o.i_steel_plate = c.outline();

  c = pc(16, 16); // ไข่
  c.blob(8, 9, 4, 5, ['L', 'w', 'W', 'W']);
  c.set(6, 6, 'W');
  o.i_egg = c.outline();

  c = pc(16, 16); // น้ำผึ้ง (โถ)
  c.rect(4, 6, 8, 8, 'Y');
  c.rect(4, 6, 2, 8, 'y');
  c.rect(10, 6, 2, 8, 'r');
  c.rect(5, 4, 6, 2, 'N');
  c.rect(5, 4, 6, 1, 'S');
  c.rect(6, 9, 4, 3, 'S');
  c.set(7, 10, 'M');
  c.set(8, 10, 'M');
  o.i_honey = c.outline();

  c = pc(16, 16); // ไข่เจียว
  c.ellipse(8, 10, 6.5, 3.5, 'D');
  c.ellipse(8, 9.5, 5.5, 2.8, 'Y');
  c.ellipse(7, 9, 3, 1.5, 'y');
  c.set(10, 10, 'G');
  c.set(5, 10, 'r');
  c.rect(1, 9, 2, 1, 'm');
  o.i_fried_egg = c.outline();

  c = pc(16, 16); // ต้มยำปลา
  c.ellipse(8, 10, 6.5, 3.5, 'W');
  c.ellipse(8, 9, 5.5, 2.4, 'r');
  c.ellipse(7, 8.6, 2.5, 1, 'Y');
  c.set(5, 9, 'G');
  c.set(11, 8, 'G');
  c.set(9, 10, 'R');
  c.rect(6, 12, 5, 1, 'L');
  o.i_tom_yum = c.outline();
  for (const [x, y] of [[6, 4], [9, 3], [8, 5]] as [number, number][]) o.i_tom_yum.set(x, y, 'w');

  c = pc(16, 16); // แกงฟักทอง
  c.ellipse(8, 10, 6.5, 3.5, 'U');
  c.ellipse(8, 9, 5.5, 2.4, 'Y');
  c.rect(5, 8, 2, 2, 'r');
  c.rect(9, 9, 2, 2, 'r');
  c.set(8, 8, 'G');
  c.set(7, 10, 'N');
  o.i_pumpkin_curry = c.outline();

  c = pc(16, 16); // เค้กน้ำผึ้ง
  c.rect(3, 7, 10, 6, 'S');
  c.rect(3, 9, 10, 1, 'Y');
  c.rect(3, 11, 10, 1, 'N');
  c.rect(3, 6, 10, 2, 'W');
  c.set(5, 8, 'Y');
  c.set(9, 8, 'Y');
  c.rect(7, 3, 2, 3, 'R');
  c.set(7, 3, 'r');
  o.i_honey_cake = c.outline();

  c = pc(16, 16); // หมูปิ้ง
  c.line(2, 14, 13, 3, 'N');
  for (const [x, y] of [[5, 10], [8, 7], [11, 4]] as [number, number][]) {
    c.blob(x, y, 2.2, 1.8, ['m', 'M', 'r']);
    c.set(x - 1, y - 1, 'Y');
  }
  o.i_skewer = c.outline();

  c = pc(16, 16); // น้ำผลไม้
  c.rect(5, 4, 6, 10, 'W');
  c.rect(6, 6, 4, 7, 'p');
  c.rect(6, 6, 4, 1, 'R');
  c.rect(6, 6, 1, 7, 'y');
  c.line(9, 1, 8, 6, 'G');
  c.ellipse(11, 4, 1.4, 1.4, 'Y');
  o.i_juice = c.outline();

  return o;
}

// ---------------- ลงทะเบียน ----------------

/** รูปชุดขยาย: key → เฟรม (รวมเข้า buildingArt() ใน buildings.ts) */
export function buildingArt2(): Record<string, PixelCanvas[]> {
  const out: Record<string, PixelCanvas[]> = {
    // บ้าน
    leaf_hut: [leafHut()],
    tent: [tent()],
    log_cabin: [logCabin()],
    brick_house: [brickHouse()],
    tree_house: [treeHouse()],
    stilt_house: [stiltHouse()],
    barn: [barn()],
    manor: [manor()],
    fortress: [fortress()],
    wizard_tower: [wizardTower()],
    storehouse: [storehouse()],
    // ผลิต
    sawmill: [sawmill(0), sawmill(1)],
    charcoal_kiln: [charcoalKiln(0), charcoalKiln(1)],
    auto_smelter: [autoSmelter(0), autoSmelter(1)],
    kitchen: [kitchen()],
    rain_collector: [rainCollector()],
    water_well: [wellNew()],
    adv_workbench: [advWorkbench()],
    // ฟาร์ม
    beehive: [beehive()],
    chicken_coop: [chickenCoop()],
    fish_trap: [fishTrap()],
    compost_bin: [compostBin()],
    greenhouse: [greenhouse()],
    scarecrow: [scarecrow()],
    // ป้องกัน
    tower_archer: [towerArcher()],
    ballista: [ballista()],
    flame_turret: [flameTurret(0), flameTurret(1)],
    tesla_tower: [teslaTower(0), teslaTower(1)],
    mortar: [mortar()],
    bomb_trap: [bombTrap()],
    frost_trap: [frostTrap()],
    snare_trap: [snareTrap()],
    torch_pole: [torchPole(0), torchPole(1)],
    searchlight: [searchlight()],
    alarm_bell: [alarmBell()],
    // กำแพง / ประตู / รั้ว / พื้น
    wall_palisade: [palisade()],
    wall_brick: [brickWall()],
    wall_meteor: [meteorWall()],
    door_stone: [heavyDoor('stone', false), heavyDoor('stone', true)],
    door_meteor: [heavyDoor('meteor', false), heavyDoor('meteor', true)],
    fence_stone: [fenceStone()],
    fence_picket: [fencePicket()],
    floor_plank: [floorPlank()],
    floor_cobble: [floorCobble()],
    floor_marble: [floorMarble()],
    // เฟอร์นิเจอร์
    sofa: [sofa()],
    wardrobe: [wardrobe()],
    weapon_rack: [weaponRack()],
    potted_plant: [pottedPlant()],
    floor_lamp: [floorLamp()],
    painting: [painting()],
    rug_round: [rugRound()],
    fireplace: [fireplace(0), fireplace(1)],
    dining_table: [diningTable()],
    aquarium: [aquarium()],
  };
  for (const [k, v] of Object.entries(icons())) out[k] = [v];
  return out;
}

/** anim ชุดขยาย: [key, texture, เฟรม, fps] */
export const BUILDING2_ANIMS: [string, string, number[], number][] = [
  ['sawmill_run', 'sawmill', [0, 1], 10],
  ['charcoal_kiln_burn', 'charcoal_kiln', [0, 1], 4],
  ['auto_smelter_run', 'auto_smelter', [0, 1], 5],
  ['flame_turret_idle', 'flame_turret', [0, 1], 6],
  ['tesla_tower_spark', 'tesla_tower', [0, 1], 8],
  ['torch_pole_burn', 'torch_pole', [0, 1], 6],
  ['fireplace_burn', 'fireplace', [0, 1], 5],
];
