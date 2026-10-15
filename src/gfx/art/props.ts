import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

/** กองไฟ 16×18: ก้อนหินล้อม + ฟืนไขว้ + เปลวไฟ (frame 0–2) หรือดับแล้ว (frame = -1) */
export function campfire(frame: number): PixelCanvas {
  const c = new PixelCanvas(16, 18);
  c.shadow(8, 16, 7, 1.8);
  // ฟืนไขว้
  c.line(3, 15, 12, 12, 'M', 2);
  c.line(3, 12, 12, 15, 'N', 2);
  c.line(4, 15, 11, 12, 'm');
  // ก้อนหินรอบกอง
  for (const [x, y] of [[2, 15], [5, 16], [8, 16.5], [11, 16], [14, 15], [3, 12.5], [13, 12.5]]) {
    c.blob(x, y, 1.6, 1.2, ['F', 'D', 'L']);
  }
  if (frame < 0) {
    c.rect(6, 12, 4, 2, 'F');
    c.set(7, 12, 'D');
    c.set(9, 13, 'r');
    return c.outline();
  }
  const rng = new RNG(40 + frame * 13);
  for (let y = 2; y <= 13; y++) {
    const k = (13 - y) / 11; // 0 ล่าง → 1 บน
    const sway = Math.sin(y * 0.8 + frame * 2.1) * k * 1.4;
    const hw = (1 - k) * 4.2 + 0.4;
    for (let x = Math.floor(8 - hw); x <= Math.ceil(8 + hw); x++) {
      const rel = Math.abs(x + 0.5 - (8 + sway)) / hw;
      if (rel > 1 || (k > 0.75 && rng.chance(0.35))) continue;
      const v = 1 - rel - k * 0.6 + dither(x, y) * 0.3;
      c.set(x, y, v > 0.62 ? 'y' : v > 0.38 ? 'Y' : v > 0.12 ? 'r' : 'R');
    }
  }
  return c.outline();
}

/** รั้วไม้ (กำแพง) 16×22 — ท่อนซุงปลายแหลม มัดเชือก */
export function woodWall(): PixelCanvas {
  const c = new PixelCanvas(16, 22);
  c.shadow(8, 20.5, 8, 1.5);
  const logs = [1, 5, 9, 13];
  logs.forEach((x0, i) => {
    const top = i % 2 ? 3 : 1;
    for (let y = top + 2; y <= 20; y++) {
      c.set(x0, y, 'N');
      c.set(x0 + 1, y, 'M');
      c.set(x0 + 2, y, 'm');
    }
    c.set(x0 + 1, top, 'N');
    c.set(x0, top + 1, 'N');
    c.set(x0 + 1, top + 1, 'M');
    c.set(x0 + 2, top + 1, 'm');
    c.set(x0 + 1, top + 6, 'm'); // ปุ่มไม้
  });
  for (const y of [8, 15]) {
    for (let x = 0; x < 16; x++) c.set(x, y, x % 3 === 0 ? 'N' : 'Y');
  }
  return c.outline();
}

/** กับดักหนาม 16×12 */
export function spikeTrap(): PixelCanvas {
  const c = new PixelCanvas(16, 12);
  c.shadow(8, 10.5, 7, 1.5);
  c.rect(1, 8, 14, 3, 'M');
  for (let x = 1; x < 15; x += 3) c.set(x, 9, 'm');
  c.rect(1, 8, 14, 1, 'N');
  for (const x of [3, 7, 11]) {
    for (let y = 2; y < 8; y++) {
      const hw = Math.floor((y - 2) / 3);
      for (let dx = -hw; dx <= hw; dx++) c.set(x + dx, y, dx < 0 ? 'W' : dx > 0 ? 'D' : 'L');
    }
  }
  return c.outline();
}

/** ซากเครื่องบินตก 64×34: ลำตัวทรงกระบอก ปีกหน้า/หลัง ช่วงท้ายฉีกขาด หางหลุด */
export function planeWreck(): PixelCanvas {
  const rng = new RNG(777);
  const c = new PixelCanvas(64, 34);
  c.shadow(30, 30, 28, 4, 0.32);
  // ปีกด้านหลัง (ชี้ขึ้น อยู่หลังลำตัว)
  for (let y = 3; y <= 12; y++) {
    const k = (12 - y) / 9;
    for (let x = Math.round(22 + k * 8); x <= Math.round(34 + k * 6); x++) c.set(x, y, x % 4 === 0 ? 'D' : 'F');
  }
  // ลำตัว (ทรงกระบอก แรเงาตามแนวตั้ง)
  const shade = ['W', 'W', 'L', 'L', 'L', 'L', 'D', 'D', 'B', 'U', 'D', 'F'];
  for (let y = 11; y <= 22; y++) {
    for (let x = 8; x <= 46; x++) c.set(x, y, shade[y - 11]);
  }
  // จมูกเครื่องบินมน
  c.blob(9, 16.5, 5, 5.8, ['D', 'L', 'W', 'W']);
  for (let y = 11; y <= 22; y++) for (let x = 8; x <= 9; x++) c.set(x, y, shade[y - 11]);
  c.rect(5, 14, 3, 2, 'U');
  c.set(6, 14, 'b');
  c.set(7, 14, 'C');
  // หน้าต่าง
  for (let x = 14; x < 42; x += 4) {
    c.rect(x, 14, 2, 2, 'U');
    c.set(x, 14, 'b');
  }
  // ประตู
  c.rect(16, 13, 1, 7, 'D');
  // ด้านที่ขาด: ขอบฉีก + รอยไหม้
  for (let y = 11; y <= 22; y++) {
    const cut = 44 + Math.round(Math.sin(y * 1.7) * 2 + rng.range(-1, 1));
    for (let x = cut; x <= 47; x++) c.set(x, y, null);
    c.set(cut - 1, y, 'O');
    c.set(cut - 2, y, 'F');
    if (rng.chance(0.6)) c.set(cut - 3, y, 'F');
  }
  for (let i = 0; i < 45; i++) {
    const x = rng.int(32, 42);
    const y = rng.int(11, 22);
    if (c.get(x, y) && dither(x, y) > 0) c.set(x, y, rng.chance(0.6) ? 'F' : 'D');
  }
  // ปีกหน้า (ชี้ลงมาทางผู้เล่น)
  for (let y = 21; y <= 29; y++) {
    const k = (y - 21) / 8;
    for (let x = Math.round(24 - k * 9); x <= Math.round(34 - k * 4); x++) c.set(x, y, y === 21 ? 'W' : x % 5 === 0 ? 'D' : 'L');
  }
  c.rect(17, 27, 3, 2, 'R'); // ไฟปลายปีก
  // เครื่องยนต์ใต้ปีก
  c.blob(28, 24, 3, 2, ['F', 'D', 'L']);
  c.set(31, 24, 'O');
  // หางหลุดอยู่ข้างๆ
  for (let y = 0; y < 13; y++) {
    for (let x = 0; x <= Math.floor(y * 0.8); x++) c.set(51 + x, 13 + y, x === Math.floor(y * 0.8) ? 'D' : x > y * 0.8 - 3 ? 'R' : 'L');
  }
  c.rect(51, 25, 11, 2, 'D');
  return c.outline();
}

/** กล่องเสบียง 16×14 (ปิด/เปิด) */
export function crate(open: boolean): PixelCanvas {
  const c = new PixelCanvas(16, 14);
  c.shadow(8, 12.5, 7, 1.5);
  c.rect(2, 4, 12, 8, 'M');
  for (const y of [6, 9]) c.rect(2, y, 12, 1, 'm');
  c.rect(2, 4, 1, 8, 'N');
  c.rect(13, 4, 1, 8, 'm');
  for (const [x, y] of [[2, 4], [13, 4], [2, 11], [13, 11]]) c.set(x, y, 'L');
  if (open) {
    c.rect(3, 4, 10, 2, 'n');
    c.line(1, 3, 6, 0, 'N', 1);
    c.line(2, 3, 7, 0, 'M', 1);
  } else {
    c.rect(1, 2, 14, 2, 'N');
    c.rect(1, 3, 14, 1, 'M');
    c.set(7, 7, 'Y');
    c.set(8, 7, 'Y');
  }
  return c.outline();
}

/** วงแสงอุ่น (บวกสีแบบ ADD) */
export function glowCanvas(size: number, rgb: [number, number, number]): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb.join(',')},0.9)`);
  g.addColorStop(0.4, `rgba(${rgb.join(',')},0.35)`);
  g.addColorStop(1, `rgba(${rgb.join(',')},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

/** เงาเมฆ (dither แบบ pixel) */
export function cloudShadow(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(96, 48);
  const puffs = Array.from({ length: 6 }, () => [rng.range(22, 74), rng.range(18, 30), rng.range(12, 20)]);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 96; x++) {
      let v = 0;
      for (const [px, py, r] of puffs) v = Math.max(v, 1 - Math.hypot(x - px, (y - py) * 1.6) / r);
      if (v + dither(x, y) * 0.5 > 0.25) c.set(x, y, 'rgba(10,12,30,1)');
    }
  }
  return c;
}

/** เงาวงรีใต้ตัวละคร/สัตว์ */
export function entityShadow(): PixelCanvas {
  // เงานุ่มสามชั้น (ขอบจาง กลางเข้ม)
  const c = new PixelCanvas(14, 6);
  c.ellipse(7, 3, 7, 3, 'rgba(10,12,30,0.16)');
  c.ellipse(7, 3, 5.5, 2.2, 'rgba(10,12,30,0.26)');
  c.ellipse(7, 3, 3.8, 1.5, 'rgba(10,12,30,0.36)');
  return c;
}

// ---------------- ฉากเกาะกลาง: ลานประลอง / ตลาด ----------------

/** เสาหินแกะสลัก 16×34 */
export function pillar(): PixelCanvas {
  const c = new PixelCanvas(16, 34);
  c.shadow(8, 32, 7, 2);
  c.rect(2, 28, 12, 4, 'D');
  c.rect(2, 28, 12, 1, 'L');
  c.rect(4, 6, 8, 22, 'L');
  for (let y = 6; y < 28; y++) {
    c.set(4, y, 'W');
    c.set(10, y, 'D');
    c.set(11, y, 'F');
    if (y % 6 === 0) c.line(5, y, 9, y, 'D');
  }
  c.rect(2, 2, 12, 4, 'L');
  c.rect(2, 2, 12, 1, 'W');
  c.rect(2, 5, 12, 1, 'D');
  for (let i = 0; i < 6; i++) c.set(5 + (i % 3) * 2, 12 + i * 2, 'G'); // ตะไคร่
  return c.outline();
}

/** เตาไฟบนขาตั้ง (frame 0/1) 14×24 */
export function brazier(frame: number): PixelCanvas {
  const c = new PixelCanvas(14, 24);
  c.shadow(7, 22.5, 5, 1.5);
  c.line(4, 22, 7, 12, 'F');
  c.line(10, 22, 7, 12, 'F');
  c.line(7, 12, 7, 22, 'D');
  c.rect(2, 9, 10, 3, 'D');
  c.rect(2, 9, 10, 1, 'L');
  c.rect(3, 12, 8, 1, 'F');
  for (let y = 0; y < 9; y++) {
    const hw = Math.max(0, Math.round((y / 9) * 4 + Math.sin(y + frame * 2) * 0.7));
    for (let x = 7 - hw; x <= 7 + hw - (frame ? 1 : 0); x++) c.set(x, y, y < 3 ? 'Y' : Math.abs(x - 7) < hw - 1 ? 'y' : 'r');
  }
  return c.outline();
}

/** ธงผ้า (สีทีม) 12×32 */
export function banner(color: string, shade: string): PixelCanvas {
  const c = new PixelCanvas(12, 32);
  c.shadow(6, 30.5, 3, 1);
  c.rect(5, 2, 2, 29, 'M');
  c.rect(5, 2, 1, 29, 'N');
  c.rect(1, 1, 10, 1, 'N');
  for (let y = 2; y < 18; y++) for (let x = 1; x <= 10; x++) {
    if (y > 14 && Math.abs(x - 5.5) < (y - 14) * 1.2) continue; // ปลายแฉก
    c.set(x, y, x > 7 ? shade : color);
  }
  c.rect(4, 6, 4, 4, 'Y');
  c.set(5, 7, 'y');
  return c.outline();
}

/** ป้ายบอกทาง 16×22 */
export function signpost(): PixelCanvas {
  const c = new PixelCanvas(18, 22);
  c.shadow(9, 20.5, 4, 1.2);
  c.rect(8, 6, 2, 15, 'M');
  c.rect(1, 3, 16, 7, 'N');
  c.rect(1, 9, 16, 1, 'M');
  for (let x = 3; x < 15; x += 2) c.set(x, 6, 'm');
  c.set(16, 6, 'N');
  c.set(17, 6, 'N');
  return c.outline();
}

/** แผงร้านค้าในตลาด (หลังคาลายทาง) 40×34 */
export function marketStall(a: string, b: string): PixelCanvas {
  const c = new PixelCanvas(40, 34);
  c.shadow(20, 32, 19, 2.5);
  for (const x of [3, 35]) c.rect(x, 10, 2, 22, 'M');
  c.rect(1, 20, 38, 4, 'N');
  c.rect(1, 23, 38, 1, 'M');
  c.rect(2, 24, 36, 7, 'M');
  for (let x = 4; x < 36; x += 6) c.rect(x, 25, 1, 6, 'm');
  // ของบนแผง
  c.blob(8, 18, 2.5, 2, ['R', 'r', 'Y']);
  c.blob(14, 18, 2.5, 2, ['G', 'g', 'y']);
  c.rect(19, 16, 4, 4, 'N');
  c.blob(28, 18, 2.5, 2, ['r', 'Y', 'y']);
  c.blob(33, 18, 2, 2, ['u', 'C', 'W']);
  // หลังคา
  for (let y = 2; y < 11; y++) for (let x = 1 - Math.floor((y - 2) / 3); x < 39 + Math.floor((y - 2) / 3); x++) {
    c.set(x, y, Math.floor(x / 5) % 2 ? a : b);
  }
  for (let x = 0; x < 40; x += 5) c.ellipse(x + 2.5, 11, 2.5, 1.5, Math.floor(x / 5) % 2 ? a : b);
  return c.outline();
}

/** ตู้จดหมาย (รับกล่องรางวัลรายวัน) 12×22 */
export function mailbox(flag: boolean): PixelCanvas {
  const c = new PixelCanvas(14, 22);
  c.shadow(7, 20.5, 4, 1.2);
  c.rect(6, 10, 2, 11, 'M');
  c.rect(2, 3, 10, 8, 'B');
  c.rect(2, 3, 10, 2, 'b');
  c.rect(2, 9, 10, 2, 'U');
  c.rect(4, 6, 6, 2, 'U');
  if (flag) {
    c.rect(12, 1, 1, 7, 'D');
    c.rect(12, 1, 2, 3, 'R');
  }
  return c.outline();
}

/** ตราประจำลานประลอง (วางราบกับพื้น) 48×48 */
export function arenaEmblem(): PixelCanvas {
  const c = new PixelCanvas(48, 48);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const d = Math.hypot(x - 23.5, y - 23.5);
    if (d > 23) continue;
    c.set(x, y, d > 21 ? 'F' : d > 19 ? 'Y' : d > 17 ? 'R' : (Math.floor(Math.atan2(y - 23.5, x - 23.5) / (Math.PI / 4)) + 8) % 2 ? 'D' : 'L');
  }
  // ดาบไขว้
  for (let i = 0; i < 22; i++) {
    c.set(13 + i, 13 + i, 'W');
    c.set(14 + i, 13 + i, 'C');
    c.set(34 - i, 13 + i, 'W');
    c.set(35 - i, 13 + i, 'C');
  }
  c.line(11, 32, 17, 38, 'Y');
  c.line(31, 38, 37, 32, 'Y');
  return c;
}

/** กล่องเสบียงร่มชูชีพ */
export function airdrop(open: boolean): PixelCanvas {
  const c = new PixelCanvas(18, 16);
  c.shadow(9, 14.5, 8, 1.5);
  c.rect(2, 4, 14, 10, 'B');
  c.rect(2, 4, 14, 2, 'b');
  for (const x of [2, 15]) c.rect(x, 4, 1, 10, 'U');
  c.rect(8, 4, 2, 10, 'Y');
  c.rect(2, 8, 14, 2, 'Y');
  if (open) {
    c.rect(3, 4, 12, 3, 'O');
    c.set(6, 5, 'Y');
    c.set(11, 5, 'C');
  }
  return c.outline();
}

export function parachute(): PixelCanvas {
  const c = new PixelCanvas(32, 30);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot((x - 15.5) / 16, (y - 12) / 12);
    if (d > 1 || y > 11) continue;
    c.set(x, y, Math.floor(x / 4) % 2 ? 'R' : 'W');
  }
  for (const x of [1, 10, 21, 30]) c.line(x, 11, 15.5, 29, 'L');
  return c.outline();
}
