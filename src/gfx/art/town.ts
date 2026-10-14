import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

// ---------------- เมือง / หมู่บ้าน / ดันเจี้ยน (แผนที่ย่อย) ----------------
// มุมมอง 3/4 จากด้านบน, ทุกรูปยึดจุดกึ่งกลางล่าง (origin 0.5, 1) — มีเงาที่แถวล่างสุด

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

/** เปลวไฟเล็ก ฐานที่ (cx, by) สูง h — frame ทำให้ไฟส่าย */
function flame(c: PixelCanvas, cx: number, by: number, h: number, frame: number, hw = 2.2) {
  for (let y = by - h; y <= by; y++) {
    const k = (by - y) / h; // 0 ล่าง → 1 บน
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

/** ก่ออิฐหิน: [ไฮไลต์, หน้า, เงา, ปูน] — แถวบนของก้อนสว่าง */
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

/** หน้าต่างไฟอุ่น (กรอบไม้ + ช่องแสงเหลือง + ขอบล่าง) */
function warmWindow(c: PixelCanvas, x: number, y: number, w: number, h: number, frame = 'n', sill = 'N') {
  c.rect(x - 1, y - 1, w + 2, h + 2, frame);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j / h + dither(x + i, y + j) * 0.25;
      c.set(x + i, y + j, k < 0.3 ? 'y' : k < 0.75 ? 'Y' : 'r');
    }
  }
  if (w >= 4) c.rect(x + Math.floor(w / 2), y, 1, h, 'M');
  if (h >= 4) c.rect(x, y + Math.floor(h / 2), w, 1, 'M');
  c.set(x, y, 'W');
  c.rect(x - 2, y + h + 1, w + 4, 1, sill);
  c.rect(x - 1, y + h + 2, w + 2, 1, 'm');
}

/** ประตูไม้ (y = ขอบบน, ชิดล่างที่ y+h-1) */
function woodDoor(c: PixelCanvas, x: number, y: number, w: number, h: number, arch = false) {
  c.rect(x - 1, y - 1, w + 2, h + 1, 'n');
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (arch && j < 2 && (i < 2 - j || i > w - 3 + j)) continue;
      c.set(x + i, y + j, i === 0 ? 'N' : i % 3 === 2 ? 'm' : 'M');
    }
  }
  if (arch) {
    c.set(x, y, 'n');
    c.set(x + w - 1, y, 'n');
  }
  for (const yy of [y + 2, y + h - 3]) c.rect(x, yy, w, 1, 'F');
  c.set(x + w - 2, y + Math.floor(h / 2), 'Y');
  c.set(x + w - 2, y + Math.floor(h / 2) + 1, 'r');
}

/** แถวกระเบื้องหลังคาทรงคางหมู */
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

/** หลังคามุงจาก/ฟาง ทรงคางหมู ขอบล่างหยักเป็นพู่ */
function thatchRoof(c: PixelCanvas, y0: number, y1: number, top0: number, top1: number, bot0: number, bot1: number) {
  const S = ['#7a5a26', 's', 'S', '#f1dca4'];
  for (let y = y0; y <= y1 + 1; y++) {
    const k = Math.min(1, (y - y0) / (y1 - y0));
    const x0 = Math.round(top0 + (bot0 - top0) * k);
    const x1 = Math.round(top1 + (bot1 - top1) * k);
    const layer = Math.floor((y - y0) / 4);
    const ly = (y - y0) % 4;
    for (let x = x0; x <= x1; x++) {
      if (y === y1 + 1 && (x + layer) % 3 !== 0) continue; // พู่ฟางห้อย
      const rel = (x - x0) / Math.max(1, x1 - x0);
      let v = 1.3 - rel * 1.1 - ly * 0.18 + dither(x, y) * 0.35;
      if ((x * 5 + layer * 3) % 4 === 0) v -= 0.45; // เส้นฟาง
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

/** ป้ายแขวน (คานยื่น + แผ่นป้าย) — ไอคอนวาดทีหลัง */
function hangingSign(c: PixelCanvas, x: number, y: number, w: number, h: number, dir: 1 | -1) {
  const bx0 = dir > 0 ? x - 3 : x + w + 2;
  c.line(bx0, y - 3, dir > 0 ? x + w : x - 1, y - 3, 'F');
  c.set(x + 1, y - 2, 'D');
  c.set(x + w - 2, y - 2, 'D');
  c.rect(x, y - 1, w, h + 1, 'n');
  c.rect(x, y, w, h, 'N');
  c.rect(x, y, w, 1, 'S');
  c.rect(x, y + h - 1, w, 1, 'M');
}

// ---------------- ดันเจี้ยน ----------------

const ROCKS = ['F', 'D', 'L', 'W'];

/** ปากถ้ำบนเนินหิน 48×40 — ช่องมืดไล่เฉด คบไฟสองข้าง ป้ายไม้ */
function caveEntrance(): PixelCanvas {
  const c = pc(48, 40);
  const rng = new RNG(4801);
  c.shadow(24, 37.5, 23, 2.5, 0.3);
  // เนินหิน
  c.blob(24, 24, 23, 15, ROCKS, rng, 0.12);
  c.blob(9, 28, 9, 9, ROCKS, rng, 0.2);
  c.blob(39, 28, 9, 9, ROCKS, rng, 0.2);
  c.blob(19, 11, 9, 7, ROCKS, rng, 0.2);
  c.blob(31, 12, 8, 6, ROCKS, rng, 0.2);
  // รอยแยกหิน
  for (const [x0, y0, x1, y1] of [[6, 22, 10, 28], [40, 20, 43, 26], [16, 8, 18, 13], [33, 9, 31, 14], [4, 31, 7, 34]]) c.line(x0, y0, x1, y1, 'F');
  // หญ้า/มอสบนยอดเนิน
  for (let x = 0; x < 48; x++) {
    for (let y = 0; y < 30; y++) {
      if (!c.get(x, y) || c.get(x, y)!.startsWith('rgba')) continue;
      if (rng.chance(0.75)) {
        c.set(x, y, rng.chance(0.4) ? 'g' : 'G');
        c.set(x, y + 1, 'H');
        if (rng.chance(0.4)) c.set(x, y + 2, 'T');
      }
      break;
    }
  }
  // ปากถ้ำโค้ง: ไล่จากขอบหินเข้าความมืด
  const cx = 24;
  const top = 17;
  for (let y = top - 2; y <= 37; y++) {
    for (let x = 12; x <= 36; x++) {
      const nx = (x + 0.5 - cx) / 11;
      const ny = (y + 0.5 - (top + 11)) / 11;
      const inArch = y >= top + 11 ? Math.abs(nx) <= 1 : nx * nx + ny * ny <= 1;
      if (!inArch) {
        // ขอบหินรอบปาก (หนาขึ้น)
        const nx2 = (x + 0.5 - cx) / 12.5;
        const ny2 = (y + 0.5 - (top + 11)) / 12.5;
        const rim = y >= top + 11 ? Math.abs(nx2) <= 1 : nx2 * nx2 + ny2 * ny2 <= 1;
        if (rim) c.set(x, y, x < cx ? 'L' : 'D');
        continue;
      }
      const edgeDist = y >= top + 11 ? 1 - Math.abs(nx) : 1 - Math.sqrt(nx * nx + ny * ny);
      const v = edgeDist * 3 + dither(x, y) * 0.5 - (y > 33 ? (y - 33) * 0.1 : 0);
      c.set(x, y, v < 0.2 ? 'F' : v < 0.55 ? '#232638' : v < 1 ? '#141522' : '#0b0b14');
    }
  }
  // หินย้อยฟันปาก
  for (const [x, h] of [[16, 2], [19, 3], [23, 2], [27, 4], [31, 2]] as [number, number][]) {
    for (let j = 0; j < h; j++) c.set(x, top + 1 + j + (x < 18 || x > 30 ? 2 : 0), j === h - 1 ? 'D' : 'L');
  }
  // พื้นทางเข้า (ดินเหยียบ) + ก้อนกรวด
  for (let x = 14; x <= 34; x++) c.set(x, 37, dither(x, 37) > 0 ? 'm' : 'n');
  for (const [x, y] of [[13, 36], [35, 35], [10, 37], [38, 37]] as [number, number][]) c.blob(x, y, 1.6, 1.2, ['F', 'D', 'L']);
  // ป้ายไม้ซ้ายหน้า
  c.rect(5, 29, 2, 9, 'M');
  c.rect(5, 29, 1, 9, 'N');
  c.rect(1, 27, 11, 6, 'n');
  c.rect(2, 28, 9, 4, 'N');
  c.rect(2, 28, 9, 1, 'S');
  c.rect(2, 31, 9, 1, 'M');
  // ลายกะโหลก/ลูกศรบนป้าย
  c.set(4, 29, 'm');
  c.set(5, 29, 'm');
  c.set(6, 30, 'm');
  c.set(7, 29, 'm');
  c.set(8, 29, 'm');
  c.set(9, 30, 'm');
  // คบไฟผนังสองข้าง
  for (const tx of [10, 38]) {
    c.rect(tx - 1, 23, 3, 1, 'F');
    c.rect(tx, 18, 1, 6, 'M');
    c.set(tx, 18, 'm');
    c.rect(tx - 1, 17, 3, 1, 'F');
  }
  c.outline();
  for (const tx of [10.5, 38.5]) {
    flame(c, tx, 16, 5, tx > 20 ? 1 : 0, 1.6);
    halo(c, tx, 14, 6, '255,170,80', 0.3);
  }
  return c;
}

/** ทางออกดันเจี้ยน 32×32 — บันไดหินขึ้นสู่แสง (frame = ระยิบ) */
function dungeonExit(frame: number): PixelCanvas {
  const c = pc(32, 32);
  const rng = new RNG(3201 + frame);
  c.shadow(16, 30, 15, 2, 0.25);
  // กรอบหินสองข้าง
  masonry(c, 2, 8, 8, 30, new RNG(77), ['L', 'D', 'F', 'O'], 4, 4);
  masonry(c, 23, 8, 29, 30, new RNG(78), ['L', 'D', 'F', 'O'], 4, 4);
  c.rect(2, 7, 7, 1, 'W');
  c.rect(23, 7, 7, 1, 'L');
  // ขั้นบันได: ขั้นล่างใกล้ตา (มืดกว่า) → ขั้นบนสว่าง (ใกล้ทางออก)
  const steps = 6;
  for (let s = 0; s < steps; s++) {
    const yTop = 26 - s * 3; // หน้าเหยียบ
    const k = s / (steps - 1); // 0 ล่าง → 1 บน
    const tread = k > 0.75 ? 'y' : k > 0.45 ? 'W' : k > 0.2 ? 'L' : 'D';
    const riser = k > 0.75 ? 'Y' : k > 0.45 ? 'L' : k > 0.2 ? 'D' : 'F';
    for (let x = 9; x <= 22; x++) {
      c.set(x, yTop, tread);
      c.set(x, yTop + 1, riser);
      c.set(x, yTop + 2, dither(x, yTop) > 0.2 ? riser : k > 0.45 ? 'D' : 'F');
    }
    c.set(9, yTop + 1, 'F');
    c.set(22, yTop + 2, 'F');
  }
  c.rect(9, 29, 14, 2, 'F');
  // ช่องแสงด้านบน
  for (let y = 4; y <= 10; y++) for (let x = 9; x <= 22; x++) c.set(x, y, y < 7 ? 'y' : 'W');
  c.rect(8, 3, 16, 1, 'Y');
  c.outline();
  // ลำแสงโปร่ง (rgba บนพื้นที่ว่างด้านบน) + ประกายที่ขยับตามเฟรม
  for (let y = 0; y <= 3; y++) {
    for (let x = 7; x <= 24; x++) {
      if (c.get(x, y)) continue;
      const a = 0.18 + 0.12 * Math.sin((x + y * 0.5 + frame * 2) * 0.9) + dither(x, y + frame * 2) * 0.1;
      c.set(x, y, `rgba(255,242,176,${Math.max(0.05, a).toFixed(2)})`);
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.int(9, 22);
    const y = rng.int(4, 26);
    const p = c.get(x, y);
    if (p === 'D' || p === 'L' || p === 'F') c.set(x, y, frame ? 'y' : 'W');
  }
  // แถบแสงเฉียงบนขั้นบันได (สลับตำแหน่งตามเฟรม)
  for (let y = 8; y <= 28; y++) {
    const x = 11 + Math.floor((28 - y) * 0.35) + frame * 4;
    for (const xx of [x, x + 1]) {
      const p = c.get(xx, y);
      if (xx > 21) continue;
      if (p === 'F') c.set(xx, y, 'D');
      else if (p === 'D') c.set(xx, y, 'L');
      else if (p === 'L') c.set(xx, y, 'W');
    }
  }
  halo(c, 16, 6, 14, '255,242,176', 0.28);
  return c;
}

/** คบไฟติดผนัง 12×24 (2 เฟรม) */
function torchWall(frame: number): PixelCanvas {
  const c = pc(12, 24);
  // แผ่นยึดผนัง
  c.rect(4, 15, 4, 6, 'F');
  c.rect(4, 15, 4, 1, 'D');
  c.set(5, 17, 'L');
  c.set(5, 19, 'L');
  // ด้าม + ห่วงรัด
  c.rect(5, 9, 2, 13, 'M');
  c.rect(5, 9, 1, 13, 'N');
  c.rect(4, 13, 4, 1, 'D');
  c.rect(4, 13, 1, 1, 'L');
  // หัวคบ (ผ้าพัน)
  c.rect(4, 8, 4, 3, 'n');
  c.rect(4, 8, 4, 1, 'm');
  c.set(5, 9, 'M');
  c.rect(5, 22, 2, 1, 'F');
  flame(c, 6, 8, 7, frame, 2.2);
  c.outline();
  halo(c, 6, 5, 6, '255,170,80', 0.35);
  // ประกายไฟลอย
  c.set(frame ? 3 : 8, frame ? 1 : 0, 'Y');
  c.set(frame ? 9 : 2, frame ? 2 : 3, 'r');
  return c;
}

/** กองกระดูก 20×12 */
function bonesPile(): PixelCanvas {
  const c = pc(20, 12);
  c.shadow(10, 10, 9.5, 1.8);
  const bone = (x0: number, y0: number, x1: number, y1: number) => {
    c.line(x0, y0, x1, y1, 'w');
    c.line(x0, y0 + 1, x1, y1 + 1, 'L');
    for (const [x, y] of [[x0, y0], [x1, y1]]) {
      c.set(x - 1, y, 'W');
      c.set(x - 1, y + 1, 'w');
      c.set(x + 1, y + 1, 'L');
    }
  };
  bone(2, 8, 9, 6);
  bone(10, 9, 17, 7);
  bone(4, 5, 8, 9);
  bone(13, 4, 16, 9);
  // กะโหลก
  c.blob(10, 5.5, 3.5, 3, ['L', 'w', 'W', 'W']);
  c.rect(8, 7, 5, 2, 'w');
  c.set(9, 5, 'O');
  c.set(11, 5, 'O');
  c.set(10, 7, 'F');
  for (const x of [8, 10, 12]) c.set(x, 8, 'D');
  return c.outline();
}

/** เสาหินประดับกะโหลก 20×40 */
function skullPillar(): PixelCanvas {
  const c = pc(20, 40);
  const rng = new RNG(4002);
  c.shadow(10, 37.5, 9.5, 2);
  // ฐาน
  c.rect(1, 32, 18, 6, 'D');
  c.rect(1, 32, 18, 1, 'L');
  c.rect(1, 32, 2, 6, 'L');
  c.rect(17, 32, 2, 6, 'F');
  c.rect(1, 37, 18, 1, 'F');
  // ลำเสาก้อนหิน
  for (let y = 6; y <= 31; y++) {
    for (let x = 3; x <= 16; x++) {
      const rel = (x - 3) / 13 + dither(x, y) * 0.15;
      let col = rel < 0.2 ? 'L' : rel < 0.65 ? 'D' : 'F';
      if ((y - 6) % 6 === 5) col = 'F';
      else if ((y - 6) % 6 === 0 && rel < 0.65) col = rel < 0.2 ? 'W' : 'L';
      c.set(x, y, col);
    }
  }
  // หัวเสา (ร้าว บิ่น)
  c.rect(1, 2, 18, 4, 'D');
  c.rect(1, 2, 18, 1, 'W');
  c.rect(1, 3, 2, 3, 'L');
  c.rect(17, 3, 2, 3, 'F');
  c.rect(1, 5, 18, 1, 'F');
  c.set(14, 2, null);
  c.set(15, 2, null);
  c.set(15, 3, null);
  c.line(6, 7, 8, 13, 'F');
  c.line(13, 20, 11, 25, 'F');
  // กะโหลกฝัง
  const skull = (x: number, y: number) => {
    c.blob(x, y, 2.6, 2.3, ['L', 'w', 'W', 'W']);
    c.rect(x - 1, y + 1, 3, 2, 'w');
    c.set(x - 1, y, 'O');
    c.set(x + 1, y, 'O');
    c.set(x, y + 1, 'F');
    c.set(x - 1, y + 2, 'D');
    c.set(x + 1, y + 2, 'D');
  };
  skull(10, 10);
  skull(7, 21);
  skull(13, 27);
  // เทียนละลายบนหัวเสา
  c.rect(4, 1, 2, 1, 'w');
  c.set(4, 1, 'W');
  c.set(5, 3, 'W');
  for (let i = 0; i < 5; i++) c.set(rng.int(2, 17), rng.int(33, 36), 'H');
  c.outline();
  c.set(4, 0, 'Y');
  halo(c, 4.5, 0.5, 4, '255,205,117', 0.3);
  return c;
}

/** กลุ่มคริสตัลเรืองแสง 20×22 */
function crystalCluster(): PixelCanvas {
  const c = pc(20, 22);
  c.shadow(10, 19.5, 9, 2);
  c.blob(10, 18, 8, 3, ['F', 'D', 'L']);
  const shard = (bx: number, by: number, h: number, w: number, lean: number) => {
    for (let j = 0; j <= h; j++) {
      const k = j / h; // 0 ฐาน → 1 ยอด
      const hw = k > 0.8 ? w * (1 - k) * 5 : w;
      const cx = bx + lean * j;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
        const rel = (x - (cx - hw)) / (2 * hw + 0.01);
        c.set(x, by - j, rel < 0.35 ? 'W' : rel < 0.55 ? 'C' : rel < 0.8 ? 'b' : 'B');
      }
    }
  };
  shard(5, 18, 7, 1.4, -0.2);
  shard(15, 18, 8, 1.4, 0.18);
  shard(10, 18, 15, 2.2, 0.02);
  shard(7, 19, 4, 1.1, -0.35);
  shard(13, 19, 5, 1.1, 0.3);
  c.set(9, 6, 'W');
  c.set(9, 7, 'W');
  c.outline('U');
  halo(c, 10, 10, 10, '115,239,247', 0.35);
  for (const [x, y] of [[2, 6], [17, 4], [4, 1], [15, 11]] as [number, number][]) c.set(x, y, 'C');
  return c;
}

/** ใยแมงมุม 20×16 */
function cobweb(): PixelCanvas {
  const c = pc(20, 16);
  const W = 'rgba(244,244,244,0.75)';
  const w = 'rgba(214,228,238,0.45)';
  const ax = 10;
  const ay = 1;
  // เส้นรัศมี
  const spokes = [-0.15, 0.45, 1.05, 1.57, 2.1, 2.7, 3.3];
  for (const a of spokes) c.line(ax, ay, ax + Math.cos(a) * 11, ay + Math.sin(a) * 14, W);
  // วงใยห้อยโค้ง
  for (const r of [3, 6, 9, 12]) {
    for (let i = 0; i < spokes.length - 1; i++) {
      const a0 = spokes[i];
      const a1 = spokes[i + 1];
      for (let t = 0; t <= 1; t += 0.12) {
        const a = a0 + (a1 - a0) * t;
        const sag = Math.sin(t * Math.PI) * 1.2;
        c.set(ax + Math.cos(a) * r * 0.8, ay + Math.sin(a) * r + sag, r % 6 === 0 ? W : w);
      }
    }
  }
  // แมงมุมตัวเล็ก
  c.rect(12, 8, 2, 2, 'O');
  c.set(11, 7, 'F');
  c.set(14, 7, 'F');
  c.set(11, 10, 'F');
  c.set(14, 10, 'F');
  c.set(12, 8, 'R');
  return c;
}

// ---------------- บ้านเรือน ----------------

/** กระท่อมหลังคามุงฟาง 48×48 */
function houseA(): PixelCanvas {
  const c = pc(48, 48);
  const rng = new RNG(4811);
  c.shadow(24, 45.5, 22, 2.5);
  // ผนังปูนครีม + โครงไม้
  for (let y = 26; y <= 44; y++) {
    for (let x = 5; x <= 42; x++) {
      const v = dither(x, y) + (rng.next() - 0.5) * 0.3;
      c.set(x, y, x < 8 ? 'y' : v > 0.4 ? 'S' : '#f1dca4');
    }
  }
  for (const x of [5, 17, 30, 42]) c.rect(x, 26, 2, 19, x === 42 ? 'm' : 'M');
  c.rect(5, 34, 38, 1, 'M');
  c.rect(5, 43, 38, 2, 'D'); // ฐานหิน
  c.rect(5, 43, 38, 1, 'L');
  // ประตูไม้
  woodDoor(c, 21, 33, 7, 11, true);
  c.rect(19, 44, 11, 1, 'L');
  // หน้าต่างไฟอุ่น
  warmWindow(c, 9, 29, 5, 4);
  warmWindow(c, 34, 29, 5, 4);
  // กระบะดอกไม้
  for (const wx of [8, 33]) {
    c.rect(wx, 36, 7, 2, 'M');
    c.rect(wx, 36, 7, 1, 'N');
    for (let i = 0; i < 7; i += 2) {
      c.set(wx + i, 35, rng.pick(['R', 'p', 'Y', 'u']));
      c.set(wx + i + 1, 35, 'G');
    }
  }
  // หลังคาฟางหนาโค้ง
  thatchRoof(c, 4, 25, 9, 38, 0, 47);
  // สันหลังคา
  c.rect(9, 3, 30, 2, '#7a5a26');
  c.rect(9, 3, 30, 1, 's');
  // ปล่องไฟ
  chimney(c, 33, 0, 5, 9);
  // หน้าต่างใต้หลังคา
  c.rect(20, 11, 8, 7, '#7a5a26');
  warmWindow(c, 22, 13, 4, 3, 'n', 's');
  return c.outline();
}

/** บ้านหลังคากระเบื้องแดง 48×52 */
function houseB(): PixelCanvas {
  const c = pc(48, 52);
  const rng = new RNG(4812);
  c.shadow(24, 49.5, 22, 2.5);
  // ผนังอิฐส้มอ่อน
  masonry(c, 4, 29, 43, 48, rng, ['K', 'k', '#a8705a', '#8a5a48'], 6, 3);
  c.rect(4, 29, 2, 20, 'K');
  c.rect(42, 29, 2, 20, '#8a5a48');
  c.rect(4, 47, 40, 2, 'D');
  c.rect(4, 47, 40, 1, 'L');
  // ประตูโค้ง + บันไดหน้าบ้าน
  woodDoor(c, 20, 35, 8, 12, true);
  c.rect(18, 48, 12, 1, 'L');
  c.rect(19, 47, 10, 1, 'W');
  // โคมเหนือประตู
  c.rect(30, 34, 2, 3, 'Y');
  c.set(30, 34, 'y');
  // หน้าต่าง + บานเกล็ดเขียว
  for (const wx of [8, 34]) {
    warmWindow(c, wx, 33, 6, 6);
    c.rect(wx - 3, 32, 2, 8, 'H');
    c.rect(wx + 7, 32, 2, 8, 'H');
    c.rect(wx - 3, 32, 1, 8, 'G');
    for (const yy of [34, 36, 38]) {
      c.set(wx - 2, yy, 'T');
      c.set(wx + 8, yy, 'T');
    }
  }
  // หลังคากระเบื้องแดง
  tileRoof(c, 6, 28, 11, 36, 0, 47, 'R', 'r', 'P');
  c.rect(11, 5, 26, 2, 'P');
  c.rect(11, 5, 26, 1, 'r');
  c.rect(0, 28, 48, 1, 'P');
  c.rect(4, 29, 40, 1, '#5a3a30');
  // หน้าต่างหลังคา (dormer)
  c.rect(19, 12, 10, 9, 'W');
  c.rect(19, 12, 10, 1, 'w');
  tileRoof(c, 9, 12, 22, 25, 18, 29, 'R', 'r', 'P', 2);
  warmWindow(c, 22, 15, 4, 4, 'M', 'W');
  // ปล่องไฟอิฐ
  chimney(c, 35, 1, 5, 10);
  return c.outline();
}

/** บ้านไม้สองชั้น (half-timbered) 56×56 */
function houseC(): PixelCanvas {
  const c = pc(56, 56);
  const rng = new RNG(4813);
  c.shadow(28, 53.5, 26, 2.5);
  // ชั้นล่าง: หิน
  masonry(c, 5, 40, 50, 52, rng, ['W', 'L', 'D', 'F'], 6, 3);
  // ชั้นบน: ปูนขาว + คานไม้เข้ม (ยื่นออกเล็กน้อย)
  for (let y = 22; y <= 39; y++) for (let x = 3; x <= 52; x++) c.set(x, y, dither(x, y) > 0.4 ? 'w' : 'W');
  for (const x of [3, 14, 27, 40, 51]) c.rect(x, 22, 2, 18, 'm');
  c.rect(3, 22, 50, 2, 'm');
  c.rect(3, 38, 50, 2, 'm');
  c.rect(3, 40, 50, 1, 'n');
  // คานเฉียง
  for (const [x0, x1] of [[5, 13], [42, 50]] as [number, number][]) {
    c.line(x0, 37, x1, 24, 'm');
    c.line(x0 + 1, 37, x1 + 1, 24, 'M');
  }
  c.line(16, 24, 25, 37, 'm');
  c.line(29, 37, 38, 24, 'm');
  // หน้าต่างชั้นบน
  for (const wx of [18, 33]) {
    warmWindow(c, wx, 26, 5, 6, 'm', 'M');
  }
  warmWindow(c, 6, 27, 3, 5, 'm', 'M');
  warmWindow(c, 46, 27, 3, 5, 'm', 'M');
  // ชั้นล่าง: ประตู + หน้าต่าง
  woodDoor(c, 24, 42, 8, 11);
  c.rect(23, 53, 10, 1, 'L');
  warmWindow(c, 9, 43, 7, 5, 'n', 'D');
  warmWindow(c, 40, 43, 7, 5, 'n', 'D');
  // หลังคากระดานชนวนน้ำตาลเข้ม
  tileRoof(c, 4, 21, 12, 43, 0, 55, 'M', 'N', 'n', 3);
  c.rect(12, 3, 32, 2, 'n');
  c.rect(12, 3, 32, 1, 'm');
  c.rect(0, 21, 56, 1, 'n');
  // ปล่องไฟ
  chimney(c, 40, 0, 6, 10);
  // ป้ายเลขบ้าน
  c.rect(34, 45, 3, 2, 'B');
  c.set(35, 45, 'W');
  return c.outline();
}

// ---------------- ร้านค้า ----------------

/** โรงตีเหล็ก 64×56 — เตาหลอมเรืองแสง ป้ายรูปทั่ง */
function shopBlacksmith(): PixelCanvas {
  const c = pc(64, 56);
  const rng = new RNG(6401);
  c.shadow(32, 53.5, 31, 2.5, 0.3);
  // ตัวอาคารหิน (ซ้าย)
  masonry(c, 3, 24, 40, 52, rng, ['W', 'L', 'D', 'F'], 6, 4);
  c.rect(3, 24, 2, 29, 'W');
  // หลังคาชนวนเทาเข้ม
  tileRoof(c, 4, 23, 8, 36, 0, 44, 'F', 'D', 'O', 3);
  c.rect(8, 3, 29, 2, 'D');
  c.rect(8, 3, 29, 1, 'L');
  c.rect(0, 23, 45, 1, 'O');
  // ปล่องไฟใหญ่มีควัน (เตาหลอม)
  chimney(c, 28, 0, 7, 12);
  // ประตูบานใหญ่
  woodDoor(c, 7, 36, 9, 16);
  c.rect(6, 52, 11, 1, 'L');
  // หน้าต่างไฟส้ม (แสงเตา)
  warmWindow(c, 22, 32, 6, 5, 'n', 'D');
  // เพิงหลังคาขวา (ลาดเอียง) เหนือเตาหลอม
  for (let y = 18; y <= 27; y++) {
    const x1 = 61;
    for (let x = 41; x <= x1; x++) {
      const r = (y - 18 + Math.floor((x - 41) / 4)) % 3;
      c.set(x, y + Math.floor((x - 41) / 6), r === 2 ? 'm' : x % 4 === 0 ? 'M' : 'N');
    }
  }
  for (const x of [43, 60]) {
    c.rect(x, 28, 2, 25, 'M');
    c.rect(x, 28, 1, 25, 'N');
  }
  // พื้นที่มืดใต้เพิง
  for (let y = 28; y <= 52; y++) for (let x = 41; x <= 59; x++) if (!c.get(x, y) || x > 44) if (x < 60) c.set(x, y, y < 32 ? 'O' : '#262438');
  // เตาหลอมก่ออิฐ + ปากเตาเรืองแสง
  masonry(c, 46, 34, 58, 51, new RNG(9), ['r', 'R', 'P', 'n'], 4, 3);
  c.rect(46, 34, 13, 1, 'D');
  for (let y = 41; y <= 48; y++) {
    for (let x = 49; x <= 55; x++) {
      const dy = 44 - y;
      if (dy > 0 && Math.hypot(x + 0.5 - 52.5, dy) > 3.5) continue;
      const v = (y - 41) / 7 + dither(x, y) * 0.3;
      c.set(x, y, v < 0.3 ? 'y' : v < 0.65 ? 'Y' : 'r');
    }
  }
  c.rect(48, 49, 9, 1, 'F');
  // ท่อเตา
  c.rect(50, 28, 4, 6, 'F');
  c.rect(50, 28, 1, 6, 'D');
  // ทั่งหน้าร้าน
  c.rect(43, 47, 2, 1, 'D');
  const ax = 35;
  c.rect(ax, 49, 6, 3, 'F');
  c.rect(ax + 1, 47, 4, 2, 'D');
  c.rect(ax - 2, 45, 10, 2, 'L');
  c.rect(ax - 2, 45, 10, 1, 'W');
  c.set(ax - 3, 45, 'L');
  c.rect(ax + 8, 45, 1, 2, 'D');
  // ถังน้ำชุบเหล็ก
  c.rect(17, 47, 5, 5, 'M');
  c.rect(17, 47, 5, 1, 'b');
  c.rect(17, 49, 5, 1, 'D');
  // ป้ายแขวนรูปทั่ง + ค้อน
  hangingSign(c, 23, 41, 9, 6, 1);
  c.rect(25, 43, 5, 1, 'F');
  c.rect(26, 44, 3, 1, 'F');
  c.rect(25, 45, 5, 1, 'F');
  c.set(24, 43, 'F');
  // ดาบพิงผนัง
  c.line(37, 30, 37, 40, 'L');
  c.rect(36, 39, 3, 1, 'Y');
  c.set(37, 41, 'm');
  c.outline();
  halo(c, 52, 45, 11, '255,170,80', 0.35);
  // ควันจากปล่องไฟ
  for (const [x, y] of [[30, 0], [32, 0]] as [number, number][]) c.set(x, y, 'rgba(148,176,194,0.6)');
  return c;
}

/** หอกิลด์ 72×64 — อาคารหินใหญ่ เสาหน้า ป้ายธงคู่ */
function guildHall(): PixelCanvas {
  const c = pc(72, 64);
  const rng = new RNG(7201);
  c.shadow(36, 61.5, 35, 2.5, 0.3);
  // ตัวอาคารหิน
  masonry(c, 3, 28, 68, 58, rng, ['W', 'L', 'D', 'F'], 8, 4);
  c.rect(3, 28, 2, 31, 'W');
  c.rect(67, 28, 2, 31, 'F');
  // ขั้นบันไดหน้า
  for (let s = 0; s < 3; s++) {
    c.rect(22 - s * 2, 58 + s, 28 + s * 4, 1, s === 0 ? 'W' : 'L');
    c.rect(22 - s * 2, 59 + s, 28 + s * 4, 1, 'D');
  }
  // หลังคาใหญ่กระดานชนวนน้ำเงินเข้ม
  tileRoof(c, 8, 27, 10, 61, 0, 71, 'U', 'B', 'O', 3);
  c.rect(10, 7, 52, 2, 'O');
  c.rect(10, 7, 52, 1, 'B');
  c.rect(0, 27, 72, 1, 'O');
  c.rect(3, 28, 66, 1, 'F');
  // จั่วหน้าจั่วกลาง (pediment) ยื่นลงมา
  for (let y = 4; y <= 26; y++) {
    const hw = 3 + (y - 4) * 0.75;
    for (let x = Math.round(36 - hw); x <= Math.round(36 + hw) - 1; x++) {
      const edge = x - Math.round(36 - hw) < 2 || Math.round(36 + hw) - 1 - x < 2;
      c.set(x, y, edge ? (x < 36 ? 'W' : 'D') : dither(x, y) > 0.35 ? 'L' : 'w');
    }
  }
  // ตรากิลด์ (ดาบไขว้บนโล่) ในหน้าจั่ว
  c.rect(33, 14, 7, 6, 'R');
  c.rect(34, 20, 5, 1, 'R');
  c.rect(35, 21, 3, 1, 'R');
  c.rect(33, 14, 7, 1, 'r');
  c.line(33, 13, 39, 20, 'Y');
  c.line(39, 13, 33, 20, 'Y');
  c.set(36, 16, 'y');
  // ยอดจั่ว
  c.rect(35, 1, 2, 4, 'Y');
  c.set(35, 1, 'y');
  // หอระฆังเล็กบนสัน
  // เสาหินหน้าอาคาร
  for (const px of [14, 24, 45, 55]) {
    c.rect(px, 30, 4, 27, 'w');
    c.rect(px, 30, 1, 27, 'W');
    c.rect(px + 3, 30, 1, 27, 'L');
    c.rect(px - 1, 29, 6, 2, 'W');
    c.rect(px - 1, 30, 6, 1, 'L');
    c.rect(px - 1, 56, 6, 2, 'L');
    c.rect(px - 1, 57, 6, 1, 'D');
  }
  // ประตูคู่บานใหญ่
  for (let y = 36; y <= 57; y++) {
    for (let x = 29; x <= 42; x++) {
      const dy = 41 - y;
      if (dy > 0 && Math.hypot(x + 0.5 - 36, dy * 1.2) > 7.5) continue;
      c.set(x, y, x === 35 || x === 36 ? 'n' : x % 3 === 0 ? 'm' : 'M');
    }
  }
  c.rect(29, 44, 14, 1, 'Y');
  c.rect(29, 52, 14, 1, 'Y');
  c.set(34, 48, 'Y');
  c.set(37, 48, 'Y');
  // ธงห้อยระหว่างเสา
  for (const bx of [19, 49]) {
    c.rect(bx, 32, 5, 1, 'F');
    for (let y = 33; y <= 48; y++) {
      for (let x = bx; x < bx + 5; x++) {
        if (y >= 47 && x === bx + 2) continue;
        c.set(x, y, x === bx ? 'b' : x === bx + 4 ? 'U' : 'B');
      }
    }
    c.rect(bx + 1, 36, 3, 3, 'Y');
    c.set(bx + 2, 37, 'R');
    c.rect(bx + 1, 42, 3, 1, 'Y');
  }
  // หน้าต่างโค้งด้านข้าง
  for (const wx of [6, 61]) {
    warmWindow(c, wx, 34, 5, 8, 'F', 'W');
    c.set(wx, 34, 'F');
    c.set(wx + 4, 34, 'F');
  }
  // ตะเกียงข้างประตู
  for (const lx of [27, 44]) {
    c.rect(lx, 40, 2, 3, 'Y');
    c.set(lx, 40, 'y');
    c.rect(lx, 43, 2, 1, 'F');
  }
  c.outline();
  for (const lx of [28, 45]) halo(c, lx, 41.5, 4, '255,205,117', 0.3);
  return c;
}

// ---------------- ของประดับเมือง ----------------

/** บ่อน้ำ 24×28 — ขอบหิน หลังคาเล็ก ถังน้ำ */
function well(): PixelCanvas {
  const c = pc(24, 28);
  c.shadow(12, 25.5, 11, 2);
  // ขอบบ่อหินทรงกระบอก
  masonry(c, 2, 17, 21, 25, new RNG(2401), ['W', 'L', 'D', 'F'], 4, 3);
  c.rect(2, 17, 2, 9, 'W');
  c.rect(20, 17, 2, 9, 'F');
  c.ellipse(12, 16.5, 10, 2.6, 'L');
  c.ellipse(12, 16.5, 8, 1.6, 'U');
  c.rect(7, 16, 6, 1, 'B');
  c.set(8, 16, 'b');
  // เสาไม้ + คานรอก
  for (const x of [3, 19]) {
    c.rect(x, 5, 2, 12, 'M');
    c.rect(x, 5, 1, 12, 'N');
  }
  c.rect(3, 8, 18, 1, 'm');
  c.ellipse(12, 8.5, 1.5, 1.5, 'n');
  // เชือก + ถัง
  c.rect(12, 9, 1, 3, 'S');
  c.rect(10, 12, 5, 3, 'M');
  c.rect(10, 12, 5, 1, 'D');
  c.rect(10, 12, 1, 3, 'N');
  // หลังคาจั่วเล็ก
  tileRoof(c, 1, 5, 9, 14, 1, 22, 'M', 'N', 'm', 2);
  c.rect(9, 0, 6, 1, 'n');
  // ที่หมุน
  c.rect(21, 8, 2, 1, 'D');
  c.set(22, 9, 'D');
  return c.outline();
}

/** น้ำพุกลางเมือง 48×40 (2 เฟรมน้ำไหล) */
function fountain(frame: number): PixelCanvas {
  const c = pc(48, 40);
  c.shadow(24, 36.5, 23, 2.5, 0.28);
  // อ่างล่าง: ผนังหินด้านหน้า
  for (let y = 26; y <= 36; y++) {
    const k = (y - 26) / 10;
    const hw = 22 - k * 1.5;
    for (let x = Math.round(24 - hw); x <= Math.round(24 + hw) - 1; x++) {
      const rel = (x + 0.5 - (24 - hw)) / (2 * hw) + dither(x, y) * 0.12;
      const course = (y - 26) % 4 === 3 || (x + ((y - 26) >> 2) * 3) % 7 === 0;
      c.set(x, y, course ? 'D' : rel < 0.2 ? 'W' : rel < 0.7 ? 'L' : 'D');
    }
  }
  // ขอบอ่าง (วงรีบน)
  c.ellipse(24, 26, 23, 8, 'L');
  c.ellipse(24, 26, 23, 8, 'L');
  for (let x = 1; x < 47; x++) for (let y = 18; y < 26; y++) if (c.get(x, y) === 'L' && !c.get(x, y - 1)) c.set(x, y, 'W');
  // ผิวน้ำ
  c.ellipse(24, 26, 20.5, 6.5, 'B');
  for (let y = 20; y <= 32; y++) {
    for (let x = 4; x <= 44; x++) {
      if (c.get(x, y) !== 'B') continue;
      const ring = Math.hypot((x + 0.5 - 24) / 20, (y + 0.5 - 26) / 6.5);
      const wave = Math.sin(ring * 14 - frame * Math.PI) > 0.6;
      if (wave) c.set(x, y, 'b');
      else if (dither(x + frame * 2, y) > 0.42) c.set(x, y, 'U');
    }
  }
  // เสากลาง + อ่างบน
  c.rect(21, 12, 6, 15, 'L');
  c.rect(21, 12, 2, 15, 'W');
  c.rect(25, 12, 2, 15, 'D');
  c.rect(20, 25, 8, 2, 'D');
  c.ellipse(24, 12, 9, 3, 'L');
  c.ellipse(24, 12.5, 9, 3, 'D');
  c.ellipse(24, 11.5, 9, 2.6, 'W');
  c.ellipse(24, 11.5, 7, 1.8, 'b');
  c.rect(19, 11, 4, 1, 'C');
  // ยอดน้ำพุพุ่ง
  c.rect(23, 4, 2, 7, 'C');
  c.rect(23, 4, 1, 7, 'W');
  c.ellipse(24, 4, 2.2, 1.8, 'C');
  c.set(23, 3, 'W');
  // สายน้ำตกจากอ่างบนลงอ่างล่าง (สลับเฟรม)
  for (const sx of [15, 33]) {
    for (let y = 13; y <= 24; y++) {
      const x = sx + (sx < 24 ? -1 : 1) * Math.round(((y - 13) / 11) ** 2 * 3);
      const on = (y + frame * 2) % 4 !== 0;
      c.set(x, y, on ? 'C' : 'b');
      if ((y + frame) % 3 === 0) c.set(x + (sx < 24 ? 1 : -1), y, 'W');
    }
  }
  // ละอองน้ำกระเซ็น
  const drops = frame ? [[12, 22], [36, 23], [17, 25], [31, 24], [20, 3], [28, 5]] : [[13, 24], [35, 21], [16, 23], [32, 25], [19, 5], [29, 3]];
  c.outline();
  for (const [x, y] of drops) c.set(x, y, 'W');
  return c;
}

/** เสาตะเกียงเมือง 12×32 — แสงไฟอุ่น */
function townLamp(): PixelCanvas {
  const c = pc(12, 32);
  c.shadow(6, 30.5, 4, 1.2);
  c.rect(4, 27, 4, 3, 'F');
  c.rect(4, 27, 4, 1, 'D');
  c.rect(3, 29, 6, 1, 'F');
  c.rect(5, 10, 2, 17, 'F');
  c.rect(5, 10, 1, 17, 'D');
  c.rect(4, 18, 4, 1, 'D');
  // ตะเกียงทรงบ้าน
  c.rect(5, 1, 2, 1, 'F');
  c.rect(4, 2, 4, 1, 'D');
  c.rect(3, 3, 6, 1, 'F');
  c.rect(4, 4, 4, 4, 'Y');
  c.rect(4, 4, 2, 2, 'y');
  c.rect(6, 4, 1, 4, 'r');
  c.rect(4, 7, 4, 1, 'r');
  for (const x of [3, 8]) c.rect(x, 4, 1, 4, 'F');
  c.rect(3, 8, 6, 1, 'F');
  c.rect(5, 9, 2, 1, 'D');
  c.outline();
  return halo(c, 6, 6, 6, '255,205,117', 0.35);
}

/** ฟ่อนฟาง 18×14 */
function hayBale(): PixelCanvas {
  const c = pc(18, 14);
  c.shadow(9, 12, 8.5, 1.5);
  for (let y = 3; y <= 12; y++) {
    for (let x = 1; x <= 16; x++) {
      const rel = (x - 1) / 15;
      let v = 1.1 - rel * 1.1 + (y === 3 ? 0.4 : 0) + dither(x, y) * 0.3;
      if ((x * 3 + y) % 5 === 0) v -= 0.4;
      c.set(x, y, v > 0.9 ? '#f1dca4' : v > 0.4 ? 'S' : v > -0.05 ? 's' : '#7a5a26');
    }
  }
  c.rect(1, 2, 16, 1, '#f1dca4');
  for (const x of [5, 12]) c.rect(x, 2, 1, 11, 'm');
  c.rect(1, 12, 16, 1, '#7a5a26');
  c.set(2, 1, 'S');
  c.set(10, 1, 'y');
  return c.outline();
}

/** กระบะดอกไม้ 24×12 */
function flowerBox(): PixelCanvas {
  const c = pc(24, 12);
  const rng = new RNG(2402);
  c.shadow(12, 10.5, 11, 1.2);
  c.rect(1, 6, 22, 5, 'M');
  c.rect(1, 6, 22, 1, 'N');
  c.rect(1, 6, 1, 5, 'N');
  c.rect(22, 6, 1, 5, 'm');
  c.rect(1, 10, 22, 1, 'm');
  c.rect(1, 8, 22, 1, 'm');
  // ใบเขียว + ดอก
  for (let x = 2; x <= 21; x++) {
    c.set(x, 5, rng.chance(0.5) ? 'G' : 'H');
    if (rng.chance(0.5)) c.set(x, 4, 'G');
  }
  for (let x = 2; x <= 20; x += 3) {
    const col = rng.pick(['R', 'p', 'Y', 'u', 'W']);
    const y = rng.int(1, 3);
    c.set(x, y, col);
    c.set(x + 1, y, col);
    c.set(x, y + 1, col);
    c.set(x + 1, y + 1, col === 'Y' ? 'r' : 'Y');
    c.set(x, y + 2, 'H');
  }
  return c.outline();
}

/** ม้านั่งไม้ 28×14 */
function bench(): PixelCanvas {
  const c = pc(28, 14);
  c.shadow(14, 12.5, 13, 1.3);
  // พนักพิง
  c.rect(2, 1, 24, 2, 'N');
  c.rect(2, 1, 24, 1, 'S');
  c.rect(2, 4, 24, 2, 'M');
  c.rect(2, 4, 24, 1, 'N');
  for (const x of [3, 24]) c.rect(x, 1, 1, 7, 'F');
  // ที่นั่ง
  c.rect(1, 7, 26, 2, 'N');
  c.rect(1, 7, 26, 1, 'S');
  c.rect(1, 9, 26, 1, 'm');
  // ขาเหล็กดัด
  for (const x of [3, 23]) {
    c.rect(x, 10, 2, 2, 'F');
    c.set(x - 1, 12, 'F');
    c.set(x + 2, 12, 'F');
    c.set(x, 10, 'D');
  }
  return c.outline();
}

/** กองถังไม้ 24×22 (3 ถังซ้อน) */
function barrelStack(): PixelCanvas {
  const c = pc(24, 22);
  c.shadow(12, 20, 11.5, 1.8);
  const barrel = (ox: number, oy: number) => {
    for (let y = oy + 2; y <= oy + 10; y++) {
      const hw = y >= oy + 4 && y <= oy + 8 ? 5 : 4;
      for (let x = ox + 5 - hw; x <= ox + 4 + hw; x++) {
        const rel = (x + 0.5 - (ox + 5)) / hw;
        let col = rel < -0.45 ? 'N' : rel < 0.35 ? 'M' : 'm';
        if ((x - ox) % 3 === 0 && col !== 'm') col = col === 'N' ? 'M' : 'm';
        c.set(x, y, col);
      }
    }
    for (const y of [oy + 3, oy + 9]) for (let x = ox; x <= ox + 9; x++) if (c.get(x, y)) c.set(x, y, x < ox + 3 ? 'L' : 'D');
    c.ellipse(ox + 5, oy + 1.5, 4.5, 1.6, 'm');
    c.ellipse(ox + 5, oy + 1.5, 3.5, 1.1, 'N');
    c.set(ox + 3, oy + 1, 'S');
  };
  barrel(1, 9);
  barrel(13, 9);
  barrel(7, 0);
  return c.outline();
}

// ---------------- รวมทั้งหมด ----------------

/** รูปเมือง/ดันเจี้ยนทั้งหมด: key → เฟรม (รวมเข้า buildingArt) */
export function townArt(): Record<string, PixelCanvas[]> {
  return {
    cave_entrance: [caveEntrance()],
    dungeon_exit: [dungeonExit(0), dungeonExit(1)],
    torch_wall: [torchWall(0), torchWall(1)],
    bones_pile: [bonesPile()],
    skull_pillar: [skullPillar()],
    crystal_cluster: [crystalCluster()],
    cobweb: [cobweb()],
    house_a: [houseA()],
    house_b: [houseB()],
    house_c: [houseC()],
    shop_blacksmith: [shopBlacksmith()],
    guild_hall: [guildHall()],
    well: [well()],
    fountain: [fountain(0), fountain(1)],
    town_lamp: [townLamp()],
    hay_bale: [hayBale()],
    flower_box: [flowerBox()],
    bench: [bench()],
    barrel_stack: [barrelStack()],
  };
}

/** anim ของเมือง/ดันเจี้ยน: [key, texture, เฟรม, fps] */
export const TOWN_ANIMS: [string, string, number[], number][] = [
  ['dungeon_exit_glow', 'dungeon_exit', [0, 1], 4],
  ['torch_wall_burn', 'torch_wall', [0, 1], 6],
  ['fountain_flow', 'fountain', [0, 1], 5],
];
