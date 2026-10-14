import { PixelCanvas, dither } from '../PixelCanvas';

// ---------------- ยานพาหนะ (เรือ / รถ / ม้า / ยานบิน) ----------------
// แบบเดียวกับเรือใน buildings.ts:
//   เรือ  : <id> = แนวนอนหัวเรือขวา (พลิกซ้ายด้วย flipX) · <id>_v = แนวตั้งหัวเรือขึ้น (พลิกลงด้วย flipY)
//   ยานบก : <id> = ด้านข้างหันขวา · <id>_v = มองจากด้านหลัง (วิ่งขึ้น) · <id>_d = มองจากด้านหน้า (วิ่งลง)
//   ยานบิน: มองจากบน (เงาวาดแยกใน Vehicle)

const pc = (w: number, h: number) => new PixelCanvas(w, h);
const SHADOW = 'rgba(10,12,30,0.22)';
/** น้ำทับตัวเรือดำน้ำ (rgba = ไม่ถูกตีเส้นขอบ) */
const WATER = 'rgba(65,166,246,0.55)';

type Shade = (a: number, b: number, lo: number, hi: number) => string;

/**
 * ตัวเรือแนวนอน (หัวเรือขวา): ดาดฟ้ามองจากบน + แถบข้างลำด้านล่าง
 * bow = ความยาวหัวเรียว · stern = ความยาวท้ายเรียว (0 = ท้ายตัด)
 */
function hullH(c: PixelCanvas, x0: number, x1: number, cy: number, half: number, bow: number, stern: number, deck: Shade, rim: string, side: string[]) {
  for (let x = x0; x <= x1; x++) {
    let h = half;
    if (x > x1 - bow) h = half * Math.sqrt(Math.max(0, (x1 - x) / bow));
    if (stern && x < x0 + stern) h = Math.min(h, half * Math.sqrt(Math.max(0, (x - x0) / stern)));
    else if (!stern && x < x0 + 2) h -= (x0 + 2 - x) * 0.5;
    if (h < 0.5) continue;
    const top = Math.round(cy - h);
    const bot = Math.round(cy + h) - 1;
    for (let y = top; y <= bot; y++) c.set(x, y, y === top || y === bot || x === x0 ? rim : deck(x, y, top, bot));
    if (h > 1.5) side.forEach((col, i) => c.set(x, bot + 1 + i, col));
  }
}

/** ตัวเรือแนวตั้ง (หัวเรือขึ้น): ท้ายเรืออยู่ล่าง + แถบท้ายลำ (ด้านใกล้กล้อง) */
function hullV(c: PixelCanvas, cx: number, y0: number, y1: number, half: number, bow: number, stern: number, deck: Shade, rim: string, side: string[]) {
  let lastX0 = 0;
  let lastX1 = 0;
  for (let y = y0; y <= y1; y++) {
    let w = half;
    if (y < y0 + bow) w = half * Math.sqrt(Math.max(0, (y - y0) / bow));
    if (stern && y > y1 - stern) w = Math.min(w, half * Math.sqrt(Math.max(0, (y1 - y) / stern)));
    if (w < 0.5) continue;
    const x0 = Math.round(cx - w);
    const x1 = Math.round(cx + w) - 1;
    for (let x = x0; x <= x1; x++) c.set(x, y, x === x0 || x === x1 || y === y1 ? rim : deck(x, y, x0, x1));
    lastX0 = x0;
    lastX1 = x1;
  }
  for (let x = lastX0 + (stern ? 0 : 1); x <= lastX1 - (stern ? 0 : 1); x++) side.forEach((col, i) => c.set(x, y1 + 1 + i, col));
}

/** ดาดฟ้าไม้กระดาน (แนวตามลำเรือ) */
const plankH: Shade = (_x, y, top) => ((y - top) % 3 === 2 ? 'M' : y === top + 1 ? 'S' : 'N');
const plankV: Shade = (x, _y, x0) => ((x - x0) % 3 === 2 ? 'M' : x === x0 + 1 ? 'S' : 'N');

/** ล้อมองด้านข้าง */
function wheel(c: PixelCanvas, cx: number, cy: number, r: number, tire = 'F', rim = 'L', hub = 'D') {
  c.ellipse(cx, cy, r, r, tire);
  if (r >= 3.5) c.ellipse(cx, cy, r - 1.5, r - 1.5, rim);
  c.rect(Math.round(cx - 1), Math.round(cy - 1), 2, 2, hub);
  c.set(Math.round(cx - r * 0.5), Math.round(cy - r * 0.6), 'W');
}

/** ล้อซี่ลวด/ไม้ (จักรยาน/เกวียน) */
function spokeWheel(c: PixelCanvas, cx: number, cy: number, r: number, tire: string, spoke: string) {
  for (let a = 0; a < 48; a++) {
    const t = (a / 48) * Math.PI * 2;
    c.set(cx + Math.cos(t) * r, cy + Math.sin(t) * r, tire);
    c.set(cx + Math.cos(t) * (r - 0.8), cy + Math.sin(t) * (r - 0.8), tire);
  }
  for (let k = 0; k < 4; k++) {
    const t = (k / 4) * Math.PI + 0.4;
    c.line(cx - Math.cos(t) * (r - 1), cy - Math.sin(t) * (r - 1), cx + Math.cos(t) * (r - 1), cy + Math.sin(t) * (r - 1), spoke);
  }
  c.rect(Math.round(cx - 1), Math.round(cy - 1), 2, 2, 'F');
}

/** ล้อมองจากหน้า/หลัง (แท่งยางตั้ง) */
function tireFront(c: PixelCanvas, x: number, y: number, w: number, h: number) {
  c.rect(x, y, w, h, 'F');
  c.rect(x, y, 1, h, 'D');
  for (let j = 1; j < h; j += 2) c.set(x + w - 1, y + j, 'O');
}

// ======================================================================
// ทางน้ำ
// ======================================================================

function canoe(vertical: boolean): PixelCanvas {
  const inner: Shade = (a, b, lo, hi) => (b === lo + 1 || b === hi - 1 ? 'm' : dither(a, b) > 0.3 ? 'n' : 'm');
  if (!vertical) {
    const c = pc(32, 16);
    c.ellipse(16, 11, 14, 3, SHADOW);
    hullH(c, 2, 29, 7.5, 3.5, 9, 8, (x, y, top, bot) => (x < 6 || x > 25 ? 'N' : inner(x, y, top, bot)), 'N', ['M', 'm']);
    // คานนั่ง
    for (const x of [10, 21]) c.rect(x, 5, 1, 5, 'S');
    // ไม้พายพาดลำ
    c.line(13, 2, 19, 13, 'N');
    c.rect(18, 12, 2, 3, 'S');
    c.rect(12, 1, 2, 2, 'S');
    // ลายแถบหัว-ท้าย
    c.set(4, 7, 'R');
    c.set(27, 7, 'R');
    return c.outline();
  }
  const c = pc(16, 32);
  c.ellipse(8, 17, 4, 13, SHADOW);
  hullV(c, 8, 2, 27, 3.5, 8, 7, (x, y, x0, x1) => (y < 6 || y > 23 ? 'N' : inner(y, x, x0, x1)), 'N', ['M', 'm']);
  for (const y of [10, 20]) c.rect(6, y, 5, 1, 'S');
  c.line(3, 12, 13, 17, 'N');
  c.rect(12, 17, 3, 2, 'S');
  c.rect(2, 11, 2, 2, 'S');
  c.set(8, 4, 'R');
  c.set(8, 25, 'R');
  return c.outline();
}

function fishingBoat(vertical: boolean): PixelCanvas {
  if (!vertical) {
    const c = pc(38, 28);
    c.ellipse(19, 23, 17, 3, SHADOW);
    hullH(c, 2, 35, 17, 5, 9, 0, plankH, 'm', ['W', 'B', 'U']);
    // ห้องคนขับ (ท้ายเรือ)
    c.rect(5, 7, 9, 9, 'W');
    c.rect(5, 7, 9, 1, 'L');
    c.rect(4, 5, 11, 2, 'R');
    c.rect(4, 5, 11, 1, 'r');
    c.rect(7, 9, 3, 3, 'C');
    c.rect(11, 9, 2, 3, 'C');
    c.set(7, 9, 'W');
    c.rect(5, 15, 9, 1, 'L');
    // เสาเครน + อวน
    c.rect(22, 2, 1, 15, 'm');
    c.line(22, 3, 31, 9, 'm');
    c.line(31, 9, 31, 13, 'L');
    for (let y = 13; y <= 19; y++) {
      for (let x = 28; x <= 34 - Math.floor((y - 13) / 2); x++) if ((x + y) % 2 === 0) c.set(x, y, 'L');
    }
    c.set(29, 19, 'r');
    c.set(33, 15, 'r');
    // ทุ่นลอย/ลังปลา
    c.rect(16, 15, 4, 3, 'M');
    c.rect(16, 15, 4, 1, 'N');
    c.set(17, 14, 'b');
    c.set(18, 14, 'C');
    // ห่วงยาง
    c.ellipse(26, 20, 1.6, 1.2, 'r');
    c.set(26, 20, 'W');
    return c.outline();
  }
  const c = pc(28, 38);
  c.ellipse(14, 21, 7.5, 15, SHADOW);
  hullV(c, 14, 3, 31, 6, 9, 0, plankV, 'm', ['W', 'B', 'U']);
  // ห้องคนขับ (ท้าย)
  c.rect(9, 20, 10, 9, 'W');
  c.rect(8, 18, 12, 2, 'R');
  c.rect(8, 18, 12, 1, 'r');
  c.rect(10, 21, 8, 2, 'C');
  c.set(10, 21, 'W');
  c.rect(9, 28, 10, 1, 'L');
  // เครน + อวน (หัวเรือ)
  c.rect(14, 3, 1, 12, 'm');
  c.line(14, 4, 21, 9, 'm');
  for (let y = 9; y <= 15; y++) for (let x = 18; x <= 24 - Math.floor((y - 9) / 2); x++) if ((x + y) % 2 === 0) c.set(x, y, 'L');
  c.set(19, 15, 'r');
  c.set(23, 11, 'r');
  c.rect(9, 12, 4, 3, 'M');
  c.rect(9, 12, 4, 1, 'N');
  c.set(10, 11, 'b');
  return c.outline();
}

/** ตู้คอนเทนเนอร์มองเฉียง: หน้าตู้ + หลังคาสว่าง + ร่อง */
function container(c: PixelCanvas, x: number, y: number, w: number, h: number, body: string, light: string, dark: string) {
  c.rect(x, y, w, 2, light);
  c.rect(x, y + 2, w, h - 2, body);
  for (let i = x + 1; i < x + w - 1; i += 2) c.rect(i, y + 3, 1, h - 4, dark);
  c.rect(x, y + h - 1, w, 1, dark);
}

function cargoShip(vertical: boolean): PixelCanvas {
  const steel: Shade = (a, b) => (dither(a, b) > 0.38 ? 'D' : 'L');
  if (!vertical) {
    const c = pc(54, 32);
    c.ellipse(27, 27, 25, 3.5, SHADOW);
    hullH(c, 2, 51, 19, 7, 11, 0, steel, 'F', ['R', 'R', 'n']);
    // แถบเส้นน้ำ
    for (let x = 4; x <= 46; x += 7) c.set(x, 27, 'W');
    // ตู้สินค้าเรียงซ้อน
    container(c, 16, 12, 8, 7, 'R', 'r', 'n');
    container(c, 25, 12, 8, 7, 'B', 'b', 'U');
    container(c, 34, 13, 7, 6, 'G', 'g', 'V');
    container(c, 20, 6, 8, 6, 'Y', 'y', 'M');
    container(c, 29, 7, 8, 5, 'r', 'y', 'R');
    // สะพานเดินเรือ (ท้าย)
    c.rect(4, 6, 9, 12, 'W');
    c.rect(4, 6, 9, 1, 'L');
    c.rect(3, 4, 11, 2, 'L');
    for (const wx of [5, 8, 11]) c.rect(wx, 8, 2, 2, 'C');
    c.rect(5, 12, 7, 1, 'D');
    // ปล่องควัน
    c.rect(7, 0, 3, 4, 'F');
    c.rect(7, 1, 3, 1, 'R');
    // สมอ
    c.set(47, 21, 'F');
    c.set(47, 22, 'F');
    c.set(46, 23, 'F');
    c.set(48, 23, 'F');
    return c.outline();
  }
  const c = pc(32, 54);
  c.ellipse(16, 29, 9.5, 24, SHADOW);
  hullV(c, 16, 3, 47, 8, 11, 0, steel, 'F', ['R', 'R', 'n']);
  // ตู้สินค้า (มองจากบน: เรียงตามลำ)
  container(c, 10, 14, 6, 8, 'Y', 'y', 'M');
  container(c, 17, 14, 6, 8, 'B', 'b', 'U');
  container(c, 10, 23, 6, 8, 'R', 'r', 'n');
  container(c, 17, 23, 6, 8, 'G', 'g', 'V');
  container(c, 13, 9, 7, 5, 'r', 'y', 'R');
  // สะพานเดินเรือ (ท้าย ด้านใกล้กล้อง)
  c.rect(9, 35, 15, 10, 'W');
  c.rect(8, 33, 17, 2, 'L');
  for (const wx of [10, 14, 18, 21]) c.rect(wx, 37, 2, 2, 'C');
  c.rect(14, 30, 4, 3, 'F');
  c.rect(14, 31, 4, 1, 'R');
  return c.outline();
}

function jetski(vertical: boolean): PixelCanvas {
  const body: Shade = (a, b, lo) => (b === lo + 1 ? 'W' : dither(a, b) > 0.35 ? 'r' : 'R');
  if (!vertical) {
    const c = pc(26, 16);
    c.ellipse(13, 12, 11, 2.5, SHADOW);
    hullH(c, 2, 23, 8, 3.5, 8, 0, body, 'W', ['W', 'F']);
    // เบาะ
    c.rect(6, 6, 7, 4, 'F');
    c.rect(6, 6, 7, 1, 'D');
    // คอแฮนด์
    c.rect(14, 4, 2, 5, 'D');
    c.rect(13, 3, 1, 3, 'L');
    c.rect(16, 3, 1, 3, 'L');
    c.set(14, 4, 'L');
    // แถบลาย
    c.rect(17, 7, 4, 1, 'Y');
    c.rect(2, 10, 3, 2, 'F');
    return c.outline();
  }
  const c = pc(16, 26);
  c.ellipse(8, 14, 5, 10, SHADOW);
  hullV(c, 8, 2, 20, 3.5, 8, 0, (x, y, x0, x1) => body(y, x, x0, x1), 'W', ['W', 'F']);
  c.rect(6, 12, 4, 7, 'F');
  c.rect(6, 12, 4, 1, 'D');
  c.rect(4, 10, 8, 1, 'L');
  c.rect(7, 9, 2, 2, 'D');
  c.rect(7, 5, 2, 3, 'Y');
  return c.outline();
}

function speedboat(vertical: boolean): PixelCanvas {
  const body: Shade = (a, b, lo, hi) => (b === lo + 1 ? 'W' : b === hi - 1 ? 'R' : dither(a, b) > 0.4 ? 'L' : 'W');
  if (!vertical) {
    const c = pc(42, 20);
    c.ellipse(21, 15, 19, 2.5, SHADOW);
    hullH(c, 4, 39, 8.5, 4.5, 16, 0, body, 'W', ['W', 'R', 'U']);
    // ห้องโดยสาร + กระจก
    c.rect(13, 5, 9, 7, 'F');
    c.rect(13, 5, 9, 1, 'D');
    c.rect(22, 4, 2, 9, 'C');
    c.rect(23, 4, 1, 9, 'b');
    c.set(22, 5, 'W');
    // เบาะ
    c.rect(8, 6, 4, 5, 'R');
    c.rect(8, 6, 4, 1, 'r');
    // เครื่องยนต์คู่
    for (const y of [4, 10]) {
      c.rect(0, y, 4, 3, 'F');
      c.rect(0, y, 4, 1, 'D');
      c.set(1, y + 1, 'R');
    }
    // แถบความเร็ว
    c.line(26, 7, 34, 8, 'R');
    return c.outline();
  }
  const c = pc(20, 42);
  c.ellipse(10, 22, 6.5, 18, SHADOW);
  hullV(c, 10, 2, 33, 5, 15, 0, (x, y, x0, x1) => body(y, x, x0, x1), 'W', ['W', 'R', 'U']);
  c.rect(6, 17, 8, 8, 'F');
  c.rect(6, 15, 8, 2, 'C');
  c.rect(6, 16, 8, 1, 'b');
  c.set(7, 15, 'W');
  c.rect(7, 26, 6, 4, 'R');
  c.rect(7, 26, 6, 1, 'r');
  c.line(10, 6, 10, 13, 'R');
  for (const x of [5, 12]) {
    c.rect(x, 37, 3, 3, 'F');
    c.set(x + 1, 38, 'R');
  }
  return c.outline();
}

/** ป้อมปืนเรือรบมองเฉียง: โดม + ลำกล้อง (dir 1 = ขวา, -1 = ซ้าย, 0 = ขึ้น) */
function turret(c: PixelCanvas, x: number, y: number, dir: number) {
  if (dir === 0) {
    c.rect(x - 1, y - 9, 1, 8, 'F');
    c.rect(x + 1, y - 9, 1, 8, 'F');
  } else {
    const x0 = dir > 0 ? x + 3 : x - 11;
    c.rect(x0, y - 2, 9, 1, 'F');
    c.rect(x0, y, 9, 1, 'F');
  }
  c.ellipse(x + 0.5, y, 4, 3, 'D');
  c.ellipse(x - 0.5, y - 1, 2.5, 1.6, 'L');
  c.set(x - 1, y - 2, 'W');
}

function warship(vertical: boolean): PixelCanvas {
  const steel: Shade = (a, b, lo) => (b === lo + 1 ? 'L' : dither(a, b) > 0.3 ? 'D' : 'L');
  if (!vertical) {
    const c = pc(58, 32);
    c.ellipse(29, 27, 27, 3.5, SHADOW);
    hullH(c, 2, 55, 19, 6.5, 14, 0, steel, 'F', ['D', 'F', 'U']);
    // แถบพราง
    for (let x = 6; x < 48; x += 9) c.rect(x, 26, 4, 1, 'F');
    // หอบังคับการ
    c.rect(22, 7, 11, 11, 'L');
    c.rect(22, 7, 11, 1, 'W');
    c.rect(24, 4, 7, 3, 'D');
    c.rect(24, 4, 7, 1, 'L');
    for (const wx of [24, 27, 30]) c.set(wx, 9, 'C');
    c.rect(23, 12, 9, 1, 'D');
    // เสาเรดาร์ + ธง
    c.rect(27, 0, 1, 4, 'F');
    c.rect(25, 1, 5, 1, 'D');
    c.rect(28, 0, 3, 2, 'R');
    // ปล่องควัน
    c.rect(17, 9, 3, 6, 'F');
    c.rect(17, 9, 3, 1, 'D');
    // ปืนใหญ่หัว-ท้าย
    turret(c, 41, 15, 1);
    turret(c, 11, 15, -1);
    // สมอ/หมายเลข
    c.set(48, 21, 'W');
    c.set(50, 21, 'W');
    c.set(49, 22, 'W');
    return c.outline();
  }
  const c = pc(32, 58);
  c.ellipse(16, 31, 8.5, 26, SHADOW);
  hullV(c, 16, 3, 51, 7, 14, 0, (x, y, x0, x1) => steel(y, x, x0, x1), 'F', ['D', 'F', 'U']);
  c.rect(10, 24, 13, 12, 'L');
  c.rect(10, 24, 13, 1, 'W');
  c.rect(12, 26, 9, 3, 'D');
  for (const wx of [13, 16, 19]) c.set(wx, 27, 'C');
  c.rect(15, 21, 1, 3, 'F');
  c.rect(16, 21, 3, 2, 'R');
  c.rect(14, 37, 4, 3, 'F');
  turret(c, 16, 19, 0);
  turret(c, 16, 45, 0);
  return c.outline();
}

function submarine(vertical: boolean): PixelCanvas {
  if (!vertical) {
    const c = pc(46, 20);
    c.ellipse(23, 14, 21, 3, 'rgba(10,12,30,0.16)');
    // ลำตัวทรงกระสวย (สีเหลือง)
    c.blob(23, 12, 19, 4.5, ['r', 'Y', 'Y', 'y']);
    // หอบังคับ + กล้องตาเรือ
    c.rect(19, 4, 9, 5, 'Y');
    c.rect(19, 4, 9, 1, 'y');
    c.rect(19, 8, 9, 1, 'r');
    c.rect(24, 0, 1, 4, 'D');
    c.rect(24, 0, 3, 1, 'D');
    c.set(26, 1, 'C');
    // ช่องหน้าต่างกลม
    for (const x of [12, 18, 30]) {
      c.rect(x, 11, 2, 2, 'B');
      c.set(x, 11, 'C');
    }
    // ใบพัด/หางเสือ
    c.rect(2, 8, 2, 9, 'D');
    c.rect(0, 11, 4, 3, 'F');
    c.set(0, 12, 'L');
    // น้ำทับครึ่งล่าง (ดำน้ำ)
    for (let y = 13; y <= 17; y++) for (let x = 3; x <= 43; x++) if (c.get(x, y)) c.set(x, y, WATER);
    for (let x = 4; x <= 42; x += 3) c.set(x, 13, 'w');
    return c.outline();
  }
  const c = pc(20, 46);
  c.ellipse(10, 24, 7, 20, 'rgba(10,12,30,0.16)');
  c.blob(10, 23, 5, 19, ['r', 'Y', 'Y', 'y']);
  c.rect(7, 18, 6, 9, 'Y');
  c.rect(7, 18, 6, 1, 'y');
  c.rect(7, 26, 6, 1, 'r');
  c.rect(9, 15, 2, 3, 'D');
  c.set(9, 15, 'C');
  c.rect(4, 42, 12, 2, 'D');
  c.rect(9, 40, 2, 6, 'F');
  for (const y of [10, 32]) {
    c.rect(9, y, 2, 2, 'B');
    c.set(9, y, 'C');
  }
  // ขอบน้ำรอบลำ
  for (let y = 4; y <= 42; y++) {
    for (let x = 0; x < 20; x++) {
      const p = c.get(x, y);
      if (p && !p.startsWith('rgba') && (x <= 5 || x >= 14) && y > 12 && y < 40) c.set(x, y, WATER);
    }
  }
  return c.outline();
}

// ======================================================================
// ทางบก
// ======================================================================

function cart(view: 'side' | 'back' | 'front'): PixelCanvas {
  if (view === 'side') {
    const c = pc(32, 24);
    c.ellipse(15, 21, 13, 2.5, SHADOW);
    // คานลาก
    c.rect(24, 13, 7, 1, 'm');
    c.rect(30, 12, 1, 3, 'M');
    // กระบะไม้
    c.rect(4, 8, 21, 8, 'M');
    for (let y = 9; y <= 15; y += 3) c.rect(4, y, 21, 1, 'N');
    c.rect(4, 8, 21, 1, 'S');
    for (const x of [4, 14, 24]) c.rect(x, 8, 1, 8, 'm');
    // ของบนกระบะ: กระสอบ + ฟาง
    c.blob(9, 6, 3.5, 2.5, ['s', 'S', 'S', 'y']);
    c.blob(15, 6, 3, 2.5, ['s', 'S', 'S', 'y']);
    c.rect(19, 4, 5, 4, 'Y');
    c.rect(19, 4, 5, 1, 'y');
    for (const x of [20, 22]) c.set(x, 6, 's');
    // ล้อไม้ใหญ่
    spokeWheel(c, 12, 17, 5.5, 'm', 'N');
    return c.outline();
  }
  const c = pc(24, 24);
  c.ellipse(12, 21, 10, 2.5, SHADOW);
  const front = view === 'front';
  // ล้อสองข้าง (แท่งตั้ง)
  for (const x of [2, 20]) {
    c.rect(x, 11, 2, 11, 'm');
    c.rect(x, 11, 1, 11, 'M');
  }
  // กระบะ
  c.rect(4, 9, 16, 9, 'M');
  c.rect(4, 9, 16, 2, 'N');
  for (let y = 12; y <= 17; y += 3) c.rect(4, y, 16, 1, 'm');
  c.blob(9, 7, 4, 3, ['s', 'S', 'S', 'y']);
  c.rect(13, 5, 5, 4, 'Y');
  c.rect(13, 5, 5, 1, 'y');
  if (front) {
    // คานลากยื่นเข้าหากล้อง
    c.rect(8, 18, 1, 6, 'm');
    c.rect(15, 18, 1, 6, 'm');
    c.rect(8, 22, 8, 1, 'M');
  } else {
    c.rect(4, 17, 16, 1, 'm');
    c.set(5, 15, 'R');
    c.set(18, 15, 'R');
  }
  return c.outline();
}

function bicycle(view: 'side' | 'back' | 'front'): PixelCanvas {
  if (view === 'side') {
    const c = pc(28, 20);
    c.ellipse(14, 18, 12, 2, SHADOW);
    spokeWheel(c, 6, 13, 5, 'F', 'L');
    spokeWheel(c, 21, 13, 5, 'F', 'L');
    // เฟรม
    c.line(6, 13, 11, 13, 'R');
    c.line(11, 13, 9, 7, 'R');
    c.line(9, 7, 18, 7, 'R');
    c.line(11, 13, 18, 7, 'R');
    c.line(18, 6, 21, 13, 'R');
    c.line(6, 13, 9, 7, 'R');
    // เบาะ + แฮนด์ + บันได
    c.rect(7, 5, 4, 1, 'F');
    c.rect(8, 6, 1, 1, 'D');
    c.rect(17, 4, 1, 3, 'D');
    c.rect(17, 4, 3, 1, 'F');
    c.rect(10, 14, 3, 1, 'F');
    // ตะกร้าหน้า
    c.rect(20, 5, 4, 3, 'N');
    c.rect(20, 5, 4, 1, 'S');
    c.set(23, 8, 'Y');
    return c.outline();
  }
  const c = pc(14, 20);
  c.ellipse(7, 18, 5, 2, SHADOW);
  const front = view === 'front';
  tireFront(c, 6, 8, 2, 11);
  c.rect(6, 6, 2, 3, 'R');
  // ขาจาน + บันได
  c.rect(4, 13, 6, 1, 'D');
  c.rect(2, 12, 2, 2, 'F');
  c.rect(10, 14, 2, 2, 'F');
  c.rect(2, 4, 10, 1, 'D');
  c.rect(1, 4, 2, 1, 'F');
  c.rect(11, 4, 2, 1, 'F');
  if (front) {
    c.rect(4, 6, 6, 3, 'N');
    c.rect(4, 6, 6, 1, 'S');
    c.set(7, 9, 'Y');
  } else {
    c.rect(5, 7, 4, 2, 'F');
    c.set(7, 10, 'R');
  }
  return c.outline();
}

function horse(view: 'side' | 'back' | 'front'): PixelCanvas {
  const coat = ['m', 'M', 'N', 'S'];
  if (view === 'side') {
    const c = pc(32, 26);
    c.ellipse(15, 24, 12, 2, SHADOW);
    // ขา (ไกล = เข้ม)
    for (const [x, col] of [[8, 'm'], [11, 'M'], [19, 'm'], [22, 'M']] as [number, string][]) {
      c.rect(x, 15, 2, 8, col);
      c.rect(x, 22, 2, 2, 'n');
    }
    // หาง
    c.line(5, 9, 3, 16, 'n');
    c.line(4, 9, 2, 15, 'n');
    c.set(3, 17, 'n');
    // ลำตัว
    c.blob(15, 12, 10, 5, coat);
    // คอ + หัว (หันขวา)
    c.line(22, 10, 25, 4, 'M', 3);
    c.blob(27, 5, 3.5, 2.5, coat);
    c.rect(29, 5, 2, 2, 'N');
    c.set(30, 6, 'n');
    c.set(27, 4, 'O');
    c.rect(24, 1, 1, 2, 'm');
    c.set(25, 1, 'M');
    // แผงคอ
    for (let i = 0; i < 5; i++) c.set(22 + i * 0.7, 9 - i * 1.4, 'n');
    // อานม้า + โกลน
    c.rect(11, 6, 8, 3, 'R');
    c.rect(11, 6, 8, 1, 'r');
    c.rect(11, 9, 8, 1, 'Y');
    c.rect(15, 10, 1, 4, 'F');
    c.rect(14, 14, 3, 1, 'L');
    // บังเหียน
    c.line(26, 7, 20, 7, 'F');
    return c.outline();
  }
  const c = pc(18, 28);
  c.ellipse(9, 26, 7, 2, SHADOW);
  if (view === 'back') {
    // หัว/หูโผล่ด้านหน้า (ไกล)
    c.blob(9, 4, 2.5, 3, coat);
    c.set(7, 1, 'm');
    c.set(11, 1, 'm');
    // สะโพก
    for (const x of [4, 11]) {
      c.rect(x, 17, 3, 7, 'M');
      c.rect(x, 23, 3, 2, 'n');
    }
    c.blob(9, 13, 6.5, 6, coat);
    c.rect(4, 7, 10, 4, 'R');
    c.rect(4, 7, 10, 1, 'r');
    c.rect(4, 10, 10, 1, 'Y');
    // หาง
    c.rect(8, 14, 2, 8, 'n');
    c.set(9, 22, 'n');
    return c.outline();
  }
  // ด้านหน้า: ลำตัวไกล หัวใกล้
  for (const x of [4, 11]) {
    c.rect(x, 17, 3, 7, 'M');
    c.rect(x, 23, 3, 2, 'n');
  }
  c.blob(9, 13, 6, 5.5, coat);
  c.rect(4, 7, 10, 3, 'R');
  c.rect(4, 7, 10, 1, 'r');
  // หัว
  c.blob(9, 9, 3.5, 5.5, coat);
  c.rect(8, 6, 2, 7, 'W');
  c.rect(7, 13, 4, 2, 'S');
  c.set(7, 14, 'n');
  c.set(10, 14, 'n');
  c.set(6, 8, 'O');
  c.set(12, 8, 'O');
  c.rect(5, 3, 1, 2, 'm');
  c.rect(12, 3, 1, 2, 'm');
  c.rect(8, 4, 2, 2, 'n');
  return c.outline();
}

function atv(view: 'side' | 'back' | 'front'): PixelCanvas {
  if (view === 'side') {
    const c = pc(30, 22);
    c.ellipse(15, 20, 13, 2, SHADOW);
    // แชสซี
    c.rect(6, 12, 18, 2, 'F');
    // บังโคลน + ตัวถัง (ส้ม)
    c.blob(8, 10, 5, 2.5, ['R', 'r', 'r', 'Y']);
    c.blob(22, 10, 5, 2.5, ['R', 'r', 'r', 'Y']);
    c.rect(10, 8, 11, 4, 'r');
    c.rect(10, 8, 11, 1, 'Y');
    // เบาะ + แร็ค
    c.rect(11, 6, 7, 2, 'F');
    c.rect(11, 6, 7, 1, 'D');
    c.rect(3, 7, 6, 1, 'L');
    c.rect(22, 7, 5, 1, 'L');
    // แฮนด์
    c.rect(20, 3, 1, 5, 'D');
    c.rect(19, 3, 3, 1, 'F');
    // ไฟหน้า
    c.set(27, 10, 'Y');
    // ล้อวิบาก
    wheel(c, 7, 16, 4.5);
    wheel(c, 23, 16, 4.5);
    return c.outline();
  }
  const c = pc(24, 22);
  c.ellipse(12, 20, 11, 2, SHADOW);
  const front = view === 'front';
  tireFront(c, 1, 11, 4, 9);
  tireFront(c, 19, 11, 4, 9);
  c.rect(5, 13, 14, 3, 'F');
  c.blob(12, 10, 7, 3.5, ['R', 'r', 'r', 'Y']);
  c.rect(8, 6, 8, 3, 'F');
  c.rect(8, 6, 8, 1, 'D');
  if (front) {
    c.rect(4, 4, 16, 1, 'F');
    c.rect(11, 4, 2, 3, 'D');
    c.set(8, 11, 'Y');
    c.set(15, 11, 'Y');
    c.rect(9, 14, 6, 1, 'D');
  } else {
    c.rect(6, 8, 12, 1, 'L');
    c.set(7, 11, 'R');
    c.set(16, 11, 'R');
  }
  return c.outline();
}

function motorbike(view: 'side' | 'back' | 'front'): PixelCanvas {
  if (view === 'side') {
    const c = pc(32, 20);
    c.ellipse(16, 18, 14, 2, SHADOW);
    wheel(c, 6, 14, 4.5);
    wheel(c, 25, 14, 4.5);
    // โครง + เครื่อง
    c.rect(10, 11, 9, 4, 'D');
    c.rect(11, 12, 3, 2, 'L');
    c.line(18, 7, 25, 14, 'L');
    c.line(6, 14, 11, 10, 'F');
    // ถังน้ำมัน + เบาะ
    c.blob(17, 8, 4, 2.2, ['U', 'B', 'b', 'C']);
    c.rect(8, 7, 7, 2, 'F');
    c.rect(8, 7, 7, 1, 'D');
    // ท่อไอเสีย
    c.rect(4, 12, 8, 1, 'L');
    c.set(3, 12, 'D');
    // แฮนด์ + ไฟหน้า
    c.rect(21, 3, 1, 5, 'D');
    c.rect(20, 3, 3, 1, 'F');
    c.rect(24, 6, 2, 2, 'Y');
    c.set(25, 6, 'y');
    // บังโคลน
    c.line(22, 9, 28, 9, 'B');
    return c.outline();
  }
  const c = pc(14, 20);
  c.ellipse(7, 18, 5, 2, SHADOW);
  const front = view === 'front';
  tireFront(c, 5, 9, 4, 10);
  c.blob(7, 8, 3.5, 2.5, ['U', 'B', 'b', 'C']);
  c.rect(1, 4, 12, 1, 'D');
  c.rect(0, 4, 2, 1, 'F');
  c.rect(12, 4, 2, 1, 'F');
  if (front) {
    c.rect(5, 5, 4, 3, 'Y');
    c.rect(6, 5, 2, 1, 'y');
    c.rect(3, 6, 1, 1, 'r');
    c.rect(10, 6, 1, 1, 'r');
  } else {
    c.rect(4, 6, 6, 2, 'F');
    c.rect(5, 10, 4, 1, 'R');
    c.rect(10, 11, 2, 1, 'L');
  }
  return c.outline();
}

function jeep(view: 'side' | 'back' | 'front'): PixelCanvas {
  const paint = ['V', 'H', 'G', 'g'];
  if (view === 'side') {
    const c = pc(40, 28);
    c.ellipse(20, 25, 18, 2.5, SHADOW);
    // ตัวถัง
    c.rect(4, 11, 32, 9, 'H');
    c.rect(4, 11, 32, 2, 'G');
    for (let x = 4; x < 36; x++) if (dither(x, 16) > 0.3) c.set(x, 16, 'V');
    c.rect(4, 19, 32, 1, 'V');
    // ฝากระโปรง + กระจังหน้า
    c.rect(26, 9, 10, 3, 'G');
    c.rect(26, 9, 10, 1, 'g');
    c.rect(35, 12, 2, 6, 'F');
    c.set(36, 13, 'Y');
    // กระจกหน้า + โรลบาร์
    c.line(24, 3, 26, 10, 'D');
    c.line(25, 3, 27, 10, 'C');
    c.rect(9, 3, 1, 8, 'D');
    c.rect(9, 3, 16, 1, 'D');
    // เบาะ + ประตูเปิดโล่ง
    c.rect(13, 8, 4, 4, 'F');
    c.rect(19, 8, 4, 4, 'F');
    c.rect(13, 8, 4, 1, 'D');
    c.rect(19, 8, 4, 1, 'D');
    // ยางอะไหล่ท้าย
    c.ellipse(3, 14, 2, 3.5, 'F');
    c.set(3, 14, 'D');
    // ดาวทหาร
    c.set(18, 15, 'W');
    c.set(17, 15, 'W');
    c.set(19, 15, 'W');
    c.set(18, 14, 'W');
    // ล้อ
    wheel(c, 10, 20, 5);
    wheel(c, 30, 20, 5);
    return c.outline();
  }
  const c = pc(30, 28);
  c.ellipse(15, 25, 14, 2.5, SHADOW);
  const front = view === 'front';
  tireFront(c, 1, 16, 4, 10);
  tireFront(c, 25, 16, 4, 10);
  // ตัวถัง
  c.rect(3, 10, 24, 11, 'H');
  c.rect(3, 10, 24, 2, 'G');
  c.rect(3, 20, 24, 1, 'V');
  // โรลบาร์/กระจก
  c.rect(4, 2, 1, 8, 'D');
  c.rect(25, 2, 1, 8, 'D');
  c.rect(4, 2, 22, 1, 'D');
  if (front) {
    c.rect(5, 3, 20, 6, 'C');
    c.rect(5, 3, 20, 1, 'W');
    for (let x = 6; x < 24; x++) if (dither(x, 5) > 0.3) c.set(x, 6, 'b');
    // กระจังหน้า 7 ช่อง + ไฟกลม
    for (let x = 9; x <= 21; x += 2) c.rect(x, 13, 1, 5, 'F');
    c.ellipse(6, 15, 1.8, 1.8, 'Y');
    c.ellipse(24, 15, 1.8, 1.8, 'Y');
    c.set(6, 14, 'y');
    c.set(24, 14, 'y');
    c.rect(4, 19, 22, 2, 'D');
  } else {
    c.rect(5, 6, 20, 4, 'F');
    c.rect(7, 7, 4, 2, 'D');
    c.rect(19, 7, 4, 2, 'D');
    // ยางอะไหล่ + ไฟท้าย
    c.ellipse(15, 15, 4, 4, 'F');
    c.ellipse(15, 15, 2, 2, 'D');
    c.set(15, 15, 'L');
    c.rect(4, 13, 2, 2, 'R');
    c.rect(24, 13, 2, 2, 'R');
  }
  for (let y = 10; y < 21; y++) for (let x = 3; x < 27; x++) if (c.get(x, y) === 'H' && dither(x, y) > 0.42) c.set(x, y, paint[0]);
  return c.outline();
}

function tank(view: 'side' | 'back' | 'front'): PixelCanvas {
  if (view === 'side') {
    const c = pc(44, 28);
    c.ellipse(20, 25, 19, 2.5, SHADOW);
    // สายพาน
    c.rect(4, 17, 32, 8, 'F');
    c.ellipse(5, 21, 3, 4, 'F');
    c.ellipse(35, 21, 3, 4, 'F');
    for (let x = 4; x <= 36; x += 2) {
      c.set(x, 17, 'D');
      c.set(x + 1, 24, 'D');
    }
    for (const x of [8, 14, 20, 26, 32]) {
      c.ellipse(x, 21, 2.4, 2.4, 'D');
      c.set(x, 21, 'L');
    }
    // ตัวถัง
    c.rect(3, 12, 34, 5, 'H');
    c.rect(3, 12, 34, 1, 'G');
    c.line(36, 12, 38, 16, 'H');
    for (let x = 4; x < 36; x += 5) c.set(x, 15, 'V');
    // ป้อม + ปืนใหญ่ (ยื่นขวา)
    c.ellipse(19, 9.5, 8, 4, 'H');
    c.ellipse(18, 8.5, 6, 2.5, 'G');
    c.rect(13, 12, 13, 1, 'V');
    c.rect(26, 7, 16, 2, 'D');
    c.rect(26, 7, 16, 1, 'L');
    c.rect(41, 6, 2, 4, 'F');
    // ฝาป้อม + เสาอากาศ
    c.rect(15, 5, 4, 1, 'V');
    c.line(12, 7, 9, 0, 'F');
    // ดาว
    c.set(20, 14, 'Y');
    return c.outline();
  }
  const c = pc(32, 30);
  c.ellipse(16, 27, 15, 2.5, SHADOW);
  const front = view === 'front';
  // สายพานสองข้าง
  for (const x of [1, 24]) {
    c.rect(x, 12, 7, 15, 'F');
    for (let y = 12; y < 27; y += 2) c.rect(x, y, 7, 1, 'D');
    c.rect(x, 12, 1, 15, 'D');
  }
  c.rect(7, 13, 18, 11, 'H');
  c.rect(7, 13, 18, 2, 'G');
  c.rect(7, 23, 18, 1, 'V');
  c.ellipse(16, 10, 8, 5, 'H');
  c.ellipse(15, 9, 6, 3, 'G');
  c.rect(9, 13, 14, 1, 'V');
  c.rect(14, 4, 4, 2, 'V');
  if (front) {
    // ลำกล้องชี้เข้าหากล้อง
    c.rect(14, 11, 4, 8, 'D');
    c.rect(14, 11, 1, 8, 'L');
    c.ellipse(16, 19.5, 2.5, 2, 'F');
    c.set(16, 19, 'O');
    c.rect(9, 18, 2, 2, 'Y');
    c.rect(21, 18, 2, 2, 'Y');
  } else {
    // ลำกล้องชี้ออกไป (สั้นลงตามมุมมอง)
    c.rect(15, 0, 2, 6, 'D');
    c.rect(15, 0, 1, 6, 'L');
    c.rect(10, 17, 12, 4, 'D');
    for (let x = 11; x < 21; x += 2) c.set(x, 18, 'F');
    c.rect(8, 15, 2, 2, 'R');
    c.rect(22, 15, 2, 2, 'R');
  }
  return c.outline();
}

// ======================================================================
// ทางอากาศ
// ======================================================================

/** เครื่องร่อน (มองจากบน): ปีกสามเหลี่ยมลายแถบ + โครง */
function glider(dir: 'h' | 'u' | 'd'): PixelCanvas {
  const c = pc(32, 32);
  const stripe = ['R', 'R', 'Y', 'W', 'Y'];
  // พิกัดในระบบ "หัวไปขวา" แล้วหมุนตามทิศ
  const put = (x: number, y: number, col: string) => {
    if (dir === 'h') c.set(x, y, col);
    else if (dir === 'u') c.set(y, 31 - x, col);
    else c.set(31 - y, x, col);
  };
  for (let x = 4; x <= 28; x++) {
    const half = ((28 - x) / 24) * 14;
    for (let y = Math.round(16 - half); y <= Math.round(15 + half); y++) {
      const band = Math.floor(Math.abs(y - 15.5) / 3);
      let col = stripe[band % stripe.length];
      if (x === 4 || Math.abs(y - 15.5) > half - 1) col = 'R';
      if (x > 4 && x < 8 && dither(x, y) > 0.3) col = col === 'W' ? 'L' : col === 'Y' ? 'r' : col;
      put(x, y, col);
    }
  }
  // โครงกลาง + คานขวาง + คนห้อย (ห่วงจับ)
  for (let x = 5; x <= 28; x++) put(x, 15, 'F');
  for (let y = 7; y <= 24; y++) put(14, y, 'D');
  for (const [x, y] of [[17, 13], [17, 18], [18, 14], [18, 17], [19, 15], [19, 16]] as [number, number][]) put(x, y, 'L');
  return c.outline();
}

/** บอลลูนลมร้อน: ผ้าลายแถบ + เชือก + ตะกร้าหวาย + ไฟเตา */
function balloon(): PixelCanvas {
  const c = pc(32, 48);
  // ผืนผ้า
  const cx = 16;
  for (let y = 1; y <= 30; y++) {
    const t = (y - 13) / 17;
    const w = y <= 13 ? 14 * Math.sqrt(Math.max(0, 1 - ((13 - y) / 13) ** 2)) : 14 * (1 - t * t * 0.55) * (1 - Math.max(0, t - 0.6) * 1.2);
    if (w < 0.5) continue;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w) - 1; x++) {
      const u = (x + 0.5 - cx) / w; // -1..1
      const band = Math.floor((Math.asin(Math.max(-1, Math.min(1, u))) / Math.PI + 0.5) * 8);
      const lit = -u * 0.6 - (y - 10) / 40 + dither(x, y) * 0.3;
      const pal = band % 2 ? ['R', 'R', 'r', 'p'] : ['r', 'Y', 'Y', 'y'];
      c.set(x, y, pal[lit > 0.45 ? 3 : lit > 0.1 ? 2 : lit > -0.3 ? 1 : 0]);
    }
  }
  // ปากบอลลูน
  c.rect(12, 30, 8, 2, 'R');
  c.rect(12, 30, 8, 1, 'r');
  // เปลวไฟเตา
  c.rect(15, 33, 2, 3, 'Y');
  c.set(15, 32, 'y');
  c.set(16, 34, 'r');
  // เชือก
  c.line(12, 32, 11, 39, 'm');
  c.line(19, 32, 20, 39, 'm');
  c.line(14, 32, 14, 39, 'n');
  c.line(17, 32, 17, 39, 'n');
  // ตะกร้า
  c.rect(10, 39, 12, 7, 'M');
  c.rect(10, 39, 12, 1, 'N');
  c.rect(10, 40, 12, 1, 'S');
  for (let y = 41; y <= 45; y++) for (let x = 10; x <= 21; x++) if ((x + y) % 3 === 0) c.set(x, y, 'm');
  c.rect(10, 45, 12, 1, 'm');
  // ถุงทราย
  c.rect(8, 41, 2, 3, 'S');
  c.rect(22, 41, 2, 3, 'S');
  return c.outline();
}

/** ทุกรูปของยานพาหนะใหม่ (เรือเดิม raft/sailboat/motorboat อยู่ใน buildings.ts) */
export function vehicleArt(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {
    canoe: canoe(false), canoe_v: canoe(true),
    fishing_boat: fishingBoat(false), fishing_boat_v: fishingBoat(true),
    cargo_ship: cargoShip(false), cargo_ship_v: cargoShip(true),
    jetski: jetski(false), jetski_v: jetski(true),
    speedboat: speedboat(false), speedboat_v: speedboat(true),
    warship: warship(false), warship_v: warship(true),
    submarine: submarine(false), submarine_v: submarine(true),
    glider: glider('h'), glider_v: glider('u'), glider_d: glider('d'),
    balloon: balloon(),
  };
  const land: [string, (v: 'side' | 'back' | 'front') => PixelCanvas][] = [
    ['cart', cart], ['bicycle', bicycle], ['horse', horse], ['atv', atv], ['motorbike', motorbike], ['jeep', jeep], ['tank', tank],
  ];
  for (const [id, fn] of land) {
    out[id] = fn('side');
    out[`${id}_v`] = fn('back');
    out[`${id}_d`] = fn('front');
  }
  return out;
}
