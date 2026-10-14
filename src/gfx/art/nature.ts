import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

const LEAF = ['V', 'T', 'G', 'g'];

/** ต้นไม้ใบกลม (โอ๊ก) 32×34 — บางต้นมีผล */
export function oak(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(32, 34);
  c.shadow(16, 31, 12, 3);
  for (let y = 19; y <= 31; y++) for (let x = 13; x <= 18; x++) c.set(x, y, x <= 13 ? 'N' : x >= 17 ? 'm' : 'M');
  c.set(12, 31, 'M');
  c.set(19, 31, 'm');
  c.set(12, 30, 'N');
  c.set(19, 30, 'm');
  for (let i = 0; i < 7; i++) c.set(rng.int(14, 17), rng.int(21, 30), 'm');
  c.line(15, 22, 11, 18, 'M', 1); // กิ่ง
  c.blob(9, 16, 7, 6, LEAF, rng, 0.3);
  c.blob(23, 16, 7, 6, LEAF, rng, 0.3);
  c.blob(16, 12, 11, 9, LEAF, rng, 0.22);
  c.blob(13 + rng.int(0, 5), 6, 7, 5, LEAF, rng, 0.3);
  // ช่อใบเล็กๆ ให้ดูเป็นพุ่มใบ
  for (let i = 0; i < 22; i++) {
    const x = rng.int(4, 27);
    const y = rng.int(3, 21);
    if (c.get(x, y) === 'G' && c.get(x + 1, y) === 'G') {
      c.set(x, y, 'g');
      c.set(x + 1, y + 1, 'T');
    }
  }
  if (rng.chance(0.35)) {
    for (let i = 0; i < 6; i++) {
      const x = rng.int(6, 25);
      const y = rng.int(8, 20);
      if (c.get(x, y) && c.get(x, y) !== 'V') {
        c.set(x, y, 'r');
        c.set(x, y + 1, 'R');
      }
    }
  }
  return c.outline();
}

/** ต้นสน 24×38 */
export function pine(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(24, 38);
  c.shadow(12, 35, 8, 2.5);
  for (let y = 29; y <= 35; y++) for (let x = 11; x <= 13; x++) c.set(x, y, x === 11 ? 'N' : x === 13 ? 'm' : 'M');
  const tiers = [
    { top: 1, bottom: 12, half: 5 },
    { top: 7, bottom: 19, half: 8 },
    { top: 13, bottom: 26, half: 10 },
    { top: 19, bottom: 32, half: 11 },
  ];
  for (const t of tiers) {
    for (let y = t.top; y <= t.bottom; y++) {
      const k = (y - t.top) / (t.bottom - t.top);
      const hw = 0.8 + k * t.half;
      for (let x = Math.floor(12 - hw); x <= Math.ceil(12 + hw); x++) {
        const rel = (x + 0.5 - 12) / hw;
        if (Math.abs(rel) > 1) continue;
        if (y === t.bottom && (x + t.top) % 2 === 0) continue; // ขอบล่างหยัก
        const v = -rel * 0.6 + (1 - k) * 0.35 + dither(x, y) * 0.45 + (rng.next() - 0.5) * 0.15;
        c.set(x, y, v > 0.5 ? 'G' : v > 0.05 ? 'H' : v > -0.4 ? 'T' : 'V');
      }
    }
  }
  if (rng.chance(0.4)) for (let i = 0; i < 4; i++) c.set(rng.int(6, 18), rng.int(12, 30), 'M'); // ลูกสน
  return c.outline();
}

/** ต้นมะพร้าว (ชายหาด) 36×42 */
export function palm(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(36, 42);
  c.shadow(18, 39, 10, 2.5);
  const lean = rng.chance(0.5) ? 1 : -1;
  const trunkX = (y: number) => 18 + lean * ((39 - y) / 26) ** 2 * 6;
  for (let y = 39; y >= 13; y--) {
    const x = Math.round(trunkX(y));
    const ring = (39 - y) % 3 === 0;
    c.set(x - 1, y, ring ? 'M' : 'N');
    c.set(x, y, ring ? 'm' : 'M');
    c.set(x + 1, y, 'm');
  }
  const tx = Math.round(trunkX(13));
  const ty = 12;
  const fronds: [number, number, number][] = [
    [-1, 0.5, 13], [-1, -0.1, 12], [-0.45, 0.9, 10], [0.45, 0.9, 10], [1, -0.1, 12], [1, 0.5, 13], [-0.15, 1.1, 7],
  ];
  for (const [dx, lift, len] of fronds) {
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      const x = tx + dx * len * t;
      const y = ty - lift * 7 * t + 8 * t * t;
      c.set(x, y, 'G');
      if (t < 0.85) c.set(x, y - 1, 'g');
      if (i % 2 === 0 && i > 1) {
        c.set(x, y + 1, 'H');
        c.set(x + (dx > 0 ? -1 : 1) * 0.5, y + 2, 'T');
      }
    }
  }
  c.blob(tx - 2, ty + 3, 1.7, 1.7, ['m', 'M', 'N']);
  c.blob(tx + 1, ty + 4, 1.7, 1.7, ['m', 'M', 'N']);
  return c.outline();
}

/** ก้อนหิน 20×16 (บางก้อนมีมอส) */
export function rock(seed: number, mossy: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 16);
  c.shadow(10, 13.5, 9, 2.5);
  const shades = ['F', 'D', 'L', 'W'];
  c.blob(10, 9, 8, 5.5, shades, rng, 0.15);
  c.blob(5 + rng.int(0, 8), 6, 4, 3, shades, rng, 0.2);
  const cx = rng.int(7, 12);
  c.line(cx, 7, cx + 2, 10, 'F');
  c.line(cx + 2, 10, cx + 1, 12, 'F');
  if (mossy) {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 16; y++) {
        const p = c.get(x, y);
        if (p && !p.startsWith('rgba') && !c.get(x, y - 1) && rng.chance(0.7)) {
          c.set(x, y, 'G');
          if (rng.chance(0.6)) c.set(x, y + 1, 'H');
          break;
        }
      }
    }
  }
  return c.outline();
}

/** พุ่มไม้ 20×18 (มีเบอร์รี่หรือไม่ก็ได้) */
export function bush(seed: number, berries: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 18);
  c.shadow(10, 15.5, 9, 2.5);
  c.blob(6, 11, 5, 4.5, LEAF, rng, 0.3);
  c.blob(14, 11, 5, 4.5, LEAF, rng, 0.3);
  c.blob(10, 8, 6, 5.5, LEAF, rng, 0.3);
  const n = berries ? 9 : 0;
  for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
    const x = rng.int(3, 15);
    const y = rng.int(4, 13);
    if (!c.get(x, y) || !c.get(x + 1, y + 1)) continue;
    c.set(x, y, 'p');
    c.set(x + 1, y, 'R');
    c.set(x, y + 1, 'R');
    c.set(x + 1, y + 1, 'P');
    i++;
  }
  if (!berries) for (let i = 0; i < 5; i++) c.set(rng.int(4, 15), rng.int(5, 13), 'g');
  return c.outline();
}

/** กอหญ้าแห้ง 16×14 */
export function tuft(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(16, 14);
  c.shadow(8, 12.5, 6, 1.5, 0.2);
  for (let i = 0; i < 9; i++) {
    const bx = 3 + i * 1.2 + rng.range(-0.5, 0.5);
    const h = rng.int(5, 10);
    const lean = rng.range(-2.5, 2.5);
    const straw = rng.chance(0.5);
    c.line(bx, 12, bx + lean, 12 - h, straw ? 'N' : 'G');
    c.set(bx + lean, 12 - h, straw ? 'Y' : 'g');
    c.set(bx, 12, 'H');
  }
  return c;
}

/** ตอไม้ 16×12 */
export function stump(): PixelCanvas {
  const c = new PixelCanvas(16, 12);
  c.shadow(8, 10, 6, 2);
  for (let y = 4; y <= 9; y++) for (let x = 4; x <= 11; x++) c.set(x, y, x <= 5 ? 'N' : x >= 10 ? 'm' : 'M');
  c.ellipse(8, 4, 4.5, 2, 'N');
  c.ellipse(8, 4, 2.5, 1, 'M');
  c.set(8, 4, 'N');
  c.set(3, 9, 'M');
  c.set(12, 9, 'm');
  return c.outline();
}

// ---------------- ของตกแต่งพื้น (ไม่มีการชน) ----------------

function flower(c: PixelCanvas, x: number, y: number, petal: string, center: string) {
  c.set(x, y + 1, 'H');
  c.set(x, y + 2, 'H');
  c.set(x - 1, y, petal);
  c.set(x + 1, y, petal);
  c.set(x, y - 1, petal);
  c.set(x, y + 1, petal);
  c.set(x, y, center);
}

/** สร้างไทล์ตกแต่ง 16 แบบ (ลำดับตรงกับ DECOR ใน WorldGenerator) */
export function decorTiles(): PixelCanvas[] {
  const rng = new RNG(99);
  const tiles: PixelCanvas[] = [];
  const flowers = (petal: string, center: string) => {
    const c = new PixelCanvas(16, 16);
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) flower(c, rng.int(3, 12), rng.int(3, 12), petal, center);
    return c;
  };
  tiles.push(flowers('R', 'Y')); // 0 แดง
  tiles.push(flowers('Y', 'r')); // 1 เหลือง
  tiles.push(flowers('W', 'Y')); // 2 ขาว
  tiles.push(flowers('u', 'W')); // 3 ม่วง

  let c = new PixelCanvas(16, 16); // 4 กรวด
  for (let i = 0; i < 4; i++) {
    const x = rng.int(2, 12);
    const y = rng.int(3, 12);
    c.set(x, y, 'L');
    c.set(x + 1, y, 'W');
    c.set(x, y + 1, 'D');
    c.set(x + 1, y + 1, 'D');
  }
  tiles.push(c);

  for (let k = 0; k < 2; k++) { // 5,6 ใบหญ้า
    c = new PixelCanvas(16, 16);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(5, 14);
      c.line(x, y, x + rng.int(-1, 1), y - rng.int(2, 4), k ? 'g' : 'T');
    }
    tiles.push(c);
  }

  c = new PixelCanvas(16, 16); // 7 เห็ด
  for (const [x, y, big] of [[5, 10, 1], [9, 12, 0]]) {
    c.rect(x, y, 1, 2 + big, 'W');
    c.rect(x - 1 - big, y - 1, 3 + big * 2, 1, 'R');
    c.rect(x - big, y - 2, 1 + big * 2, 1, 'R');
    c.set(x, y - 1, 'W');
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 8 เฟิร์น
  for (const a of [-2.4, -1.9, -1.5, -1.1, -0.7]) {
    for (let i = 0; i < 7; i++) {
      const x = 8 + Math.cos(a) * i;
      const y = 13 + Math.sin(a) * i + i * i * 0.06;
      c.set(x, y, i > 4 ? 'g' : 'G');
      if (i % 2) c.set(x, y + 1, 'T');
    }
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 9 ใบไม้ร่วง
  for (let i = 0; i < 6; i++) {
    const x = rng.int(1, 13);
    const y = rng.int(2, 13);
    const col = rng.pick(['r', 'Y', 'N', 'M']);
    c.set(x, y, col);
    c.set(x + 1, y, col);
    c.set(x + 1, y + 1, 'm');
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 10 เปลือกหอย
  c.ellipse(8, 9, 3.5, 2.5, 'p');
  for (const x of [6, 8, 10]) c.line(8, 11, x, 7, 'k');
  c.set(8, 11, 'W');
  tiles.push(c.outline());

  c = new PixelCanvas(16, 16); // 11 ปลาดาว
  for (let a = 0; a < 5; a++) {
    const ang = -Math.PI / 2 + (a * Math.PI * 2) / 5;
    c.line(8, 8, 8 + Math.cos(ang) * 4, 8 + Math.sin(ang) * 4, 'r');
  }
  c.set(8, 8, 'Y');
  c.set(7, 7, 'Y');
  tiles.push(c.outline());

  c = new PixelCanvas(16, 16); // 12 ใบบัว
  c.ellipse(8, 9, 5, 3.5, 'G');
  c.ellipse(7, 8, 3, 2, 'g');
  c.line(8, 9, 12, 7, 'B');
  c.set(10, 8, 'p');
  c.set(11, 8, 'W');
  c.set(10, 7, 'p');
  tiles.push(c.outline('T'));

  c = new PixelCanvas(16, 16); // 13 กก
  for (const x of [5, 7, 9, 11]) {
    const h = rng.int(6, 10);
    c.line(x, 14, x, 14 - h, 'H');
    if (rng.chance(0.6)) c.rect(x, 14 - h - 2, 1, 3, 'M');
    else c.set(x + 1, 14 - h, 'g');
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 14 กิ่งไม้ลอยมาเกยหาด
  c.line(3, 10, 12, 7, 'M', 1);
  c.line(3, 9, 12, 6, 'N', 1);
  c.line(8, 8, 10, 11, 'M');
  tiles.push(c.outline());

  c = new PixelCanvas(16, 16); // 15 ลายทราย
  for (const y of [5, 10]) for (let x = 2; x < 14; x++) if (Math.sin(x * 0.9 + y) > 0.2) c.set(x, y + Math.round(Math.sin(x * 0.6)), 's');
  tiles.push(c);

  return tiles;
}

// ---------------- ต้นไม้หลากชนิด (เกาะใหม่) ----------------

/** แสงเรืองรอบจุด (rgba ไม่ถูกตีเส้นขอบ) — ลงเฉพาะพิกเซลว่าง */
function glow(c: PixelCanvas, cx: number, cy: number, r: number, rgb: string, alpha = 0.3) {
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

/** จุดประใบไม้: เติมพิกเซลสว่าง/มืดเป็นช่อ ๆ ให้พุ่มดูมีใบ */
function dapple(c: PixelCanvas, rng: RNG, n: number, x0: number, x1: number, y0: number, y1: number, from: string, hi: string, lo: string) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(x0, x1);
    const y = rng.int(y0, y1);
    if (c.get(x, y) === from && c.get(x + 1, y) === from) {
      c.set(x, y, hi);
      c.set(x + 1, y + 1, lo);
    }
  }
}

/** ลำต้นไล่เฉด 3 สี (ซ้ายสว่าง ขวามืด) */
function trunk(c: PixelCanvas, x0: number, x1: number, y0: number, y1: number, [l, m, d]: string[]) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) c.set(x, y, x === x0 ? l : x >= x1 - (x1 - x0 > 3 ? 1 : 0) ? d : m);
}

/** ต้นเบิร์ช 28×38 — เปลือกขาวลายดำ ใบเขียวอมเหลือง */
export function birch(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(28, 38);
  const LEAVES = ['H', 'G', 'g', 'y'];
  c.shadow(14, 35, 9, 2.5);
  const twin = seed % 2 === 1;
  const stems: [number, number][] = twin ? [[11, 13], [16, 22]] : [[13, 15]];
  for (const [sx, top] of stems) {
    const w = twin && sx > 12 ? 2 : 3;
    for (let y = top; y <= 35; y++) {
      for (let x = sx; x < sx + w; x++) c.set(x, y, x === sx ? 'W' : x === sx + w - 1 ? 'L' : 'w');
    }
    // ลายดำบนเปลือกเบิร์ช
    for (let y = top + 1; y <= 34; y += rng.int(2, 4)) {
      const len = rng.int(1, w);
      const from = rng.chance(0.5) ? sx : sx + w - len;
      for (let x = from; x < from + len; x++) c.set(x, y, rng.chance(0.75) ? 'O' : 'F');
    }
    c.set(sx - 1, 35, 'L');
    c.set(sx + w, 35, 'D');
  }
  // กิ่งเล็ก
  c.line(14, 22, 9, 17, 'L');
  c.line(15, 20, 20, 15, 'L');
  c.blob(14, 11, 9, 9.5, LEAVES, rng, 0.3);
  c.blob(8, 17, 5.5, 5, LEAVES, rng, 0.35);
  c.blob(20, 16, 5.5, 5, LEAVES, rng, 0.35);
  c.blob(13 + rng.int(-1, 2), 4, 5, 3.5, LEAVES, rng, 0.35);
  c.blob(14, 20, 4.5, 3, LEAVES, rng, 0.4);
  dapple(c, rng, 30, 4, 23, 2, 22, 'G', 'y', 'H');
  dapple(c, rng, 14, 4, 23, 2, 22, 'g', 'W', 'G');
  // ลำต้นโผล่ตามช่องใบ
  c.set(14, 15, 'W');
  c.set(14, 16, 'O');
  return c.outline();
}

const PINK = ['#a8486a', '#de7a98', 'p', '#ffd3dd'];

/** ซากุระ 34×34 — พุ่มชมพูกลีบสว่าง มีกลีบร่วง */
export function sakura(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(34, 34);
  c.shadow(17, 31, 13, 2.8);
  // ลำต้นคดเคี้ยวสีน้ำตาลเข้ม
  for (let y = 18; y <= 31; y++) {
    const sway = Math.round(Math.sin(y * 0.45 + seed) * 1);
    for (let x = 15 + sway; x <= 19 + sway; x++) c.set(x, y, x === 15 + sway ? 'M' : x >= 18 + sway ? 'n' : 'm');
  }
  c.set(14, 31, 'm');
  c.set(20, 31, 'n');
  c.set(13, 31, 'M');
  c.line(16, 22, 8, 15, 'm', 2);
  c.line(18, 21, 26, 14, 'n', 2);
  c.line(17, 19, 17, 10, 'm', 2);
  // ปุยดอกไม้
  c.blob(8, 14, 7.5, 6, PINK, rng, 0.35);
  c.blob(26, 14, 7.5, 6, PINK, rng, 0.35);
  c.blob(17, 10, 11, 8.5, PINK, rng, 0.25);
  c.blob(12 + rng.int(0, 6), 4.5, 6.5, 4, PINK, rng, 0.35);
  c.blob(17, 18, 6, 3, PINK, rng, 0.4);
  // กิ่งโผล่ระหว่างปุย
  c.line(10, 16, 7, 18, 'n');
  c.line(24, 16, 27, 18, 'n');
  // กลีบสว่างเป็นจุด ๆ
  for (let i = 0; i < 36; i++) {
    const x = rng.int(2, 31);
    const y = rng.int(1, 21);
    const p = c.get(x, y);
    if (p === 'p' || p === '#de7a98') c.set(x, y, rng.chance(0.4) ? 'W' : '#ffd3dd');
    else if (p === '#ffd3dd') c.set(x + 1, y + 1, '#a8486a');
  }
  c.outline('#4a1f33');
  // กลีบร่วงกลางอากาศ + กองกลีบบนพื้น
  for (let i = 0; i < 7; i++) {
    const x = rng.pick([rng.int(1, 8), rng.int(26, 32)]);
    const y = rng.int(18, 30);
    if (!c.get(x, y)) c.set(x, y, rng.chance(0.5) ? 'p' : '#ffd3dd');
  }
  for (let i = 0; i < 6; i++) c.set(rng.int(6, 28), rng.int(31, 33), rng.chance(0.5) ? 'p' : '#ffd3dd');
  return c;
}

/** เมเปิลฤดูใบไม้ร่วง 32×34 — v0 แดงส้ม, v1 ส้มเหลือง */
export function maple(seed: number, golden: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(32, 34);
  const A = golden ? ['#9a4a1c', 'r', 'Y', 'y'] : ['#6e1f35', 'R', 'r', 'Y'];
  c.shadow(16, 31, 12, 3);
  trunk(c, 13, 18, 20, 31, ['N', 'M', 'm']);
  c.set(12, 31, 'M');
  c.set(19, 31, 'm');
  for (let i = 0; i < 6; i++) c.set(rng.int(14, 17), rng.int(22, 30), 'm');
  c.line(15, 23, 10, 18, 'M');
  c.line(17, 22, 22, 18, 'm');
  c.blob(8, 15, 7, 6, A, rng, 0.35);
  c.blob(24, 15, 7, 6, A, rng, 0.35);
  c.blob(16, 11, 11, 9, A, rng, 0.25);
  c.blob(14 + rng.int(0, 4), 5, 7, 4.5, A, rng, 0.35);
  // ใบสีต่างแซม (ให้ดูหลายโทนแบบใบไม้เปลี่ยนสี)
  const mix = golden ? ['R', 'r', 'y'] : ['Y', 'y', '#c2502a'];
  for (let i = 0; i < 30; i++) {
    const x = rng.int(3, 28);
    const y = rng.int(2, 21);
    const p = c.get(x, y);
    if (p && p !== A[0] && c.get(x + 1, y)) {
      c.set(x, y, rng.pick(mix));
      if (rng.chance(0.5)) c.set(x + 1, y + 1, A[0]);
    }
  }
  c.outline();
  // ใบร่วงบนพื้นรอบโคน
  for (let i = 0; i < 9; i++) {
    const x = rng.int(4, 27);
    const y = rng.int(30, 33);
    if (!c.get(x, y) || c.get(x, y)!.startsWith('rgba')) c.set(x, y, rng.pick(['R', 'r', 'Y']));
  }
  return c;
}

/** หลิวลู่ลม 36×36 — ทรงโดมมีกิ่งใบยาวห้อยระย้า */
export function willow(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(36, 36);
  c.shadow(18, 33, 15, 2.8);
  const frond = (x: number, top: number, len: number, back: boolean) => {
    const drift = (x - 18) * 0.06;
    for (let i = 0; i <= len; i++) {
      const fx = x + drift * i * 0.5;
      const y = top + i;
      const k = i / len;
      let col = back ? (i % 3 === 0 ? 'V' : 'T') : k > 0.85 ? 'g' : (i + x) % 4 === 0 ? 'g' : (i + x) % 4 === 2 ? 'H' : 'G';
      if (!back && x % 2 === 0 && k < 0.6) col = (i + x) % 3 === 0 ? 'T' : 'H';
      c.set(fx, y, col);
    }
  };
  // ระย้าด้านหลัง (เข้ม)
  for (let x = 4; x <= 31; x += 2) frond(x, 10, rng.int(14, 20), true);
  // ลำต้นอ้วนเตี้ย
  trunk(c, 16, 20, 16, 32, ['N', 'M', 'm']);
  c.set(15, 32, 'M');
  c.set(14, 32, 'N');
  c.set(21, 32, 'm');
  c.set(22, 32, 'm');
  for (let i = 0; i < 6; i++) c.set(rng.int(17, 19), rng.int(18, 31), 'm');
  // พุ่มโดมด้านบน
  c.blob(18, 10, 15, 8, ['V', 'T', 'H', 'G'], rng, 0.2);
  c.blob(18, 6, 10, 5, ['T', 'H', 'G', 'g'], rng, 0.25);
  // ระย้าด้านหน้า — เว้นกลางให้เห็นลำต้น
  for (let x = 3; x <= 33; x++) {
    const mid = Math.abs(x - 18);
    if (mid > 4 && x % 3 === 0) continue; // ช่องว่างระหว่างสาย
    const len = mid <= 4 ? rng.int(6, 9) : rng.int(13, 22 - Math.max(0, mid - 12));
    frond(x, 9 + Math.round((mid / 15) ** 2 * 4), len, false);
  }
  return c.outline('V');
}

/** โอ๊กยักษ์โบราณ 48×52 — ลำต้นใหญ่ รากแผ่ พุ่มหนาแน่น */
export function bigOak(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(48, 52);
  c.shadow(24, 48, 22, 3.6, 0.3);
  // รากแผ่
  for (const [x0, x1, s] of [[19, 9, 1], [21, 14, 0], [28, 38, 1], [26, 33, 0]] as [number, number, number][]) {
    c.line(x0, 41, x1, 48, s ? 'M' : 'm', 3);
    c.line(x0, 40, x1, 47, s ? 'N' : 'M');
  }
  // ลำต้นใหญ่ ร่องเปลือกแนวตั้ง
  for (let y = 26; y <= 47; y++) {
    const flare = Math.max(0, y - 40) * 0.7;
    const l = Math.round(17 - flare);
    const r = Math.round(30 + flare);
    for (let x = l; x <= r; x++) {
      const rel = (x - l) / (r - l);
      let col = rel < 0.18 ? 'N' : rel < 0.62 ? 'M' : rel < 0.85 ? 'm' : 'n';
      if ((x * 3 + Math.floor(y / 5)) % 5 === 0 && rel > 0.1) col = rel < 0.5 ? 'm' : 'n';
      if (dither(x, y) > 0.42 && col === 'M') col = 'N';
      c.set(x, y, col);
    }
  }
  // โพรงในต้น + มอส
  c.ellipse(25, 36, 2.6, 3.4, 'n');
  c.ellipse(25, 37, 1.6, 2.2, 'O');
  c.set(23, 34, 'N');
  for (let i = 0; i < 10; i++) c.set(rng.int(17, 30), rng.int(40, 47), rng.chance(0.5) ? 'H' : 'G');
  // กิ่งใหญ่
  c.line(20, 29, 10, 22, 'M', 3);
  c.line(28, 28, 38, 21, 'm', 3);
  // พุ่มใบหนา
  c.blob(10, 23, 10, 8, LEAF, rng, 0.25);
  c.blob(38, 23, 10, 8, LEAF, rng, 0.25);
  c.blob(24, 17, 20, 13, LEAF, rng, 0.18);
  c.blob(15, 9, 10, 7.5, LEAF, rng, 0.25);
  c.blob(33, 9, 10, 7.5, LEAF, rng, 0.25);
  c.blob(24, 5, 9, 5, LEAF, rng, 0.3);
  c.blob(17, 28, 7, 4, LEAF, rng, 0.35);
  c.blob(32, 28, 7, 4, LEAF, rng, 0.35);
  // ช่อใบ: เงาใต้ช่อ + ไฮไลต์บนช่อ
  for (let i = 0; i < 70; i++) {
    const x = rng.int(2, 45);
    const y = rng.int(2, 31);
    const p = c.get(x, y);
    if ((p === 'G' || p === 'T') && c.get(x + 1, y) === p) {
      c.set(x, y, p === 'G' ? 'g' : 'G');
      c.set(x + 1, y, p === 'G' ? 'g' : 'G');
      c.set(x, y + 1, p === 'G' ? 'H' : 'V');
      c.set(x + 1, y + 1, 'T');
    }
  }
  if (seed % 2 === 1) {
    // แบบที่สอง: ดอกไม้ป่าเกาะพุ่ม + เถาวัลย์ห้อย
    for (let i = 0; i < 12; i++) {
      const x = rng.int(6, 41);
      const y = rng.int(5, 28);
      if (c.get(x, y) && c.get(x, y) !== 'V') {
        c.set(x, y, 'W');
        c.set(x + 1, y, 'y');
      }
    }
    for (const vx of [14, 21, 34]) for (let y = 29; y < 29 + rng.int(4, 8); y++) c.set(vx, y, y % 2 ? 'H' : 'G');
  } else {
    for (let i = 0; i < 9; i++) {
      const x = rng.int(6, 41);
      const y = rng.int(8, 28);
      if (c.get(x, y) && c.get(x, y) !== 'V') {
        c.set(x, y, 'r');
        c.set(x, y + 1, 'R');
      }
    }
  }
  return c.outline();
}

/** ต้นไม้ตาย 26×34 — กิ่งบิดเบี้ยวไร้ใบ (v0 เทา, v1 น้ำตาล) */
export function deadTree(seed: number, brown: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(26, 34);
  const [l, m, d] = brown ? ['N', 'M', 'm'] : ['L', 'D', 'F'];
  c.shadow(13, 31, 9, 2.4);
  const branch = (x: number, y: number, ang: number, len: number, th: number, depth: number) => {
    let cx = x;
    let cy = y;
    let a = ang;
    for (let i = 0; i < len; i++) {
      a += (rng.next() - 0.5) * 0.5;
      const nx = cx + Math.cos(a);
      const ny = cy + Math.sin(a);
      if (th >= 2) {
        c.set(nx, ny, m);
        c.set(nx - 1, ny, l);
        c.set(nx + 1, ny, d);
        if (th >= 3) c.set(nx + 0.5, ny + 1, d);
      } else c.set(nx, ny, i % 2 ? m : d);
      cx = nx;
      cy = ny;
    }
    if (depth <= 0) return;
    const n = depth >= 2 ? 2 : rng.int(1, 2);
    for (let k = 0; k < n; k++) {
      const spread = (k === 0 ? -1 : 1) * rng.range(0.45, 0.9);
      branch(cx, cy, ang + spread, Math.max(2, Math.round(len * rng.range(0.55, 0.75))), Math.max(1, th - 1), depth - 1);
    }
  };
  // ลำต้นบิดขึ้น
  for (let y = 31; y >= 18; y--) {
    const sx = 12 + Math.round(Math.sin(y * 0.35 + seed) * 1.3);
    c.set(sx - 1, y, l);
    c.set(sx, y, m);
    c.set(sx + 1, y, m);
    c.set(sx + 2, y, d);
    if (y > 25) c.set(sx + 3, y, d);
    if (y > 28) c.set(sx - 2, y, l);
  }
  c.set(10, 31, m);
  c.set(9, 31, l);
  c.set(15, 31, d);
  c.set(16, 31, d);
  const top = 12 + Math.round(Math.sin(18 * 0.35 + seed) * 1.3);
  branch(top, 18, -Math.PI / 2 - 0.1, 8, 3, 3);
  branch(top, 22, -Math.PI / 2 - 1.0, 8, 2, 2);
  branch(top + 1, 24, -Math.PI / 2 + 1.0, 7, 2, 2);
  // กิ่งหักทู่
  c.line(top + 2, 28, top + 5, 27, d);
  c.set(top + 5, 26, m);
  // โพรงและรอยแตก
  c.set(13, 26, 'O');
  c.set(13, 27, d);
  c.set(12, 29, d);
  return c.outline();
}

/** ต้นเห็ดยักษ์ 30×36 — v0 หมวกแดงจุดขาว, v1 หมวกม่วงเรืองแสง */
export function mushTree(seed: number, glowing: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(30, 36);
  const CAP = glowing ? ['P', '#7b3fa0', 'u', '#d9b8ff'] : ['#7a1f30', 'R', 'r', '#ffb08a'];
  c.shadow(15, 33, 10, 2.6);
  // ก้าน (โค้งเล็กน้อย โคนป่อง) + วงแหวน
  for (let y = 15; y <= 33; y++) {
    const off = Math.round(Math.sin((y - 15) * 0.17));
    const hw = y >= 32 ? 5 : y >= 29 ? 4 : 3;
    for (let x = 15 - hw + off; x <= 14 + hw + off; x++) {
      const rel = (x - (15 - hw + off)) / (hw * 2 - 1) + dither(x, y) * 0.15;
      c.set(x, y, rel < 0.25 ? 'W' : rel < 0.7 ? 'w' : 'L');
    }
  }
  for (let x = 11; x <= 19; x++) {
    c.set(x + 1, 20, x < 13 ? 'W' : x > 17 ? 'L' : 'w');
    c.set(x + 1, 21, x < 13 ? 'w' : 'L');
  }
  c.set(11, 22, 'L');
  c.set(20, 22, 'D');
  c.rect(13, 22, 6, 1, 'L');
  // ใต้หมวก (ครีบ)
  c.ellipse(15, 14, 13, 3, glowing ? '#4b2a66' : 'k');
  for (let x = 4; x <= 26; x += 2) c.set(x, 15, glowing ? 'P' : 'M');
  // หมวกครึ่งวงรี
  for (let y = 1; y <= 14; y++) {
    for (let x = 0; x < 30; x++) {
      const nx = (x + 0.5 - 15) / 14.5;
      const ny = (y + 0.5 - 14) / 13;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const lit = -(nx * 0.55 + ny * 0.8) * 0.75 + (1 - d2) * 0.35 - 0.25;
      const v = lit + dither(x, y) * 0.35;
      c.set(x, y, CAP[v > 0.62 ? 3 : v > 0.28 ? 2 : v > -0.12 ? 1 : 0]);
    }
  }
  for (let x = 1; x < 29; x++) if (c.get(x, 13)) c.set(x, 13, CAP[0]);
  // จุดบนหมวก
  const spots: [number, number, number][] = [[9, 6, 1.8], [16, 4, 1.5], [21, 8, 1.8], [12, 10, 1.3], [5, 10, 1.2], [25, 11, 1.1], [18, 11, 1]];
  for (const [x, y, r] of spots) {
    const sx = x + rng.int(-1, 1);
    c.ellipse(sx, y, r, r * 0.8, glowing ? '#f0e0ff' : 'W');
    if (r > 1.2) c.set(sx + 0.5, y + 0.6, glowing ? 'u' : 'w');
  }
  c.outline(glowing ? '#2a1238' : 'O');
  if (glowing) {
    glow(c, 15, 9, 15, '200,140,255', 0.32);
    // สปอร์เรืองแสงลอย
    for (let i = 0; i < 8; i++) {
      const x = rng.int(1, 28);
      const y = rng.int(16, 31);
      if (!c.get(x, y) || c.get(x, y)!.startsWith('rgba')) c.set(x, y, rng.chance(0.5) ? 'C' : '#e6ccff');
    }
  } else {
    // เห็ดลูกเล็กข้างโคน
    c.rect(23, 30, 1, 3, 'w');
    c.rect(21, 29, 5, 1, 'R');
    c.rect(22, 28, 3, 1, 'r');
    c.set(22, 29, 'W');
    c.set(25, 29, 'O');
    c.set(20, 29, 'O');
  }
  return c;
}

// ---------------- พืช/หินของไบโอมชุดใหม่ ----------------

/** อาคาเซีย (ทุ่งสะวันนา) 38×34 — ทรงร่มแบนกว้าง ลำต้นแตกกิ่ง */
export function acacia(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(38, 34);
  c.shadow(19, 31, 14, 2.6);
  for (let y = 18; y <= 31; y++) for (let x = 18; x <= 20; x++) c.set(x, y, x === 18 ? 'N' : x === 20 ? 'm' : 'M');
  c.line(19, 20, 10, 11, 'M', 2);
  c.line(19, 19, 28, 10, 'm', 2);
  c.line(19, 22, 19, 11, 'M', 1);
  const LEAVES = ['V', 'H', '#7f9a46', '#b5c46a'];
  c.blob(19, 8, 17, 4, LEAVES, rng, 0.25);
  c.blob(10 + rng.int(-1, 1), 6, 7, 3, LEAVES, rng, 0.3);
  c.blob(27 + rng.int(-1, 1), 6.5, 7, 3, LEAVES, rng, 0.3);
  for (let x = 4; x < 34; x++) if (c.get(x, 10) && rng.chance(0.5)) c.set(x, 11, 'V');
  return c.outline();
}

/** โกงกาง (ป่าชายเลน) 32×34 — รากค้ำโค้งเหนือโคลน */
export function mangrove(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(32, 34);
  c.shadow(16, 31, 12, 2.6);
  for (let y = 16; y <= 26; y++) for (let x = 15; x <= 17; x++) c.set(x, y, x === 15 ? 'N' : x === 17 ? 'n' : 'm');
  // รากค้ำ
  for (const [ex, k] of [[7, -1], [11, -1], [21, 1], [25, 1]] as [number, number][]) {
    const pt = (t: number): [number, number] => [16 + (ex - 16) * t, 22 + t * 9 - Math.sin(t * Math.PI) * 5];
    for (let i = 0; i < 8; i++) {
      const [x0, y0] = pt(i / 8);
      const [x1, y1] = pt((i + 1) / 8);
      c.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), k < 0 ? 'M' : 'm', 2);
    }
  }
  const LEAVES = ['V', 'T', 'H', '#5f8a3a'];
  c.blob(16, 11, 12, 8, LEAVES, rng, 0.25);
  c.blob(9, 13, 6, 4.5, LEAVES, rng, 0.3);
  c.blob(23, 13, 6, 4.5, LEAVES, rng, 0.3);
  for (let i = 0; i < 5; i++) c.line(rng.int(8, 24), 15, rng.int(8, 24), 18 + rng.int(0, 3), 'V'); // รากอากาศ
  return c.outline();
}

/** กอไผ่ 22×40 — ลำปล้องเขียวหลายลำ */
export function bambooClump(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(22, 40);
  c.shadow(11, 37, 8, 2.2);
  const stems = [4 + rng.int(0, 1), 8, 12 + rng.int(-1, 0), 16];
  stems.forEach((x0, i) => {
    const top = 2 + rng.int(0, 8) + (i % 2) * 3;
    const lean = rng.pick([-1, 0, 1]);
    for (let y = top; y <= 37; y++) {
      const x = Math.round(x0 + lean * ((37 - y) / 35) * 2);
      const node = (y + i * 3) % 7 === 0;
      c.set(x, y, node ? '#3b7a38' : '#7cc35a');
      c.set(x + 1, y, node ? '#2c5e2a' : '#4f9a45');
      if (node && rng.chance(0.5)) {
        const d = rng.chance(0.5) ? -1 : 1;
        c.line(x + (d > 0 ? 2 : -1), y, x + d * 5, y - 3, '#5aa548');
        c.set(x + d * 5, y - 4, '#9ad66a');
      }
    }
    c.blob(x0 + lean * 2, top + 1, 3, 2, ['#3b7a38', '#5aa548', '#9ad66a'], rng, 0.3);
  });
  return c.outline('#1b3d1b');
}

/** กองปะการัง (ชายหาดเกาะวงแหวน) 20×16 */
export function coral(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 16);
  c.shadow(10, 13.5, 8, 2.2);
  const tones = [['#a8344a', '#ef5f6a', '#ff9fb0'], ['#b5641f', '#ff9a4a', '#ffd08a'], ['#6a3fa0', '#a77bdb', '#e0c8ff']][seed % 3];
  c.blob(10, 11, 7, 3, ['#c9b48a', '#e4d6b0', '#f2e3c4'], rng, 0.2);
  for (let i = 0; i < 5; i++) {
    let x = 4 + i * 3 + rng.int(0, 1);
    let y = 12;
    const h = rng.int(5, 9);
    for (let k = 0; k < h; k++) {
      c.set(x, y, tones[k > h - 3 ? 2 : k > 2 ? 1 : 0]);
      if (k === 3 && rng.chance(0.6)) c.set(x + rng.pick([-1, 1]), y - 1, tones[1]);
      y--;
      if (rng.chance(0.35)) x += rng.pick([-1, 1]);
    }
  }
  if (rng.chance(0.6)) c.ellipse(15, 11, 1.5, 1.2, 'W'); // ไข่มุก/เปลือกหอย
  return c.outline();
}

/** กลุ่มเห็ดเรืองแสง (เก็บได้) 16×14 */
export function shroomPatch(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(16, 14);
  c.shadow(8, 12, 6, 1.6);
  const caps = seed % 2 ? ['#7b3fa0', 'u', '#e6ccff'] : ['#1f6f7a', 'C', '#d8fbff'];
  for (const [x, y, r] of [[5, 7, 3], [11, 8, 2.4], [8, 10, 1.8]] as [number, number, number][]) {
    c.rect(x, y, 1, 12 - y, 'w');
    c.blob(x + 0.5, y, r, r * 0.7, caps, rng, 0.2);
    c.set(x, y - 1, 'W');
  }
  c.outline('#2a1238');
  glow(c, 8, 7, 8, seed % 2 ? '200,140,255' : '115,239,247', 0.28);
  return c;
}

/** ผลึกคริสตัลขนาดใหญ่ (เกาะคริสตัล) 20×22 */
export function crystalCluster(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 22);
  c.shadow(10, 19.5, 8, 2.2);
  const shards: [number, number, number][] = [[10, 2, 3], [5, 8, 2], [15, 7, 2], [8, 10, 1.5], [13, 11, 1.5]];
  for (const [x, top, hw] of shards) {
    for (let y = top; y <= 19; y++) {
      const w = Math.min(hw, (y - top) * 0.9 + 0.5);
      for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
        const v = dx / (w + 0.5) + dither(x + dx, y) * 0.4;
        c.set(x + dx, y, v < -0.4 ? '#e0d0ff' : v < 0.2 ? '#a98be8' : '#6a4fb0');
      }
    }
    c.set(x, top + 1, 'W');
  }
  c.blob(10, 19, 7, 2, ['#33304a', '#4b4766', '#6e6a8a'], rng, 0.2);
  c.outline('#241a40');
  glow(c, 10, 10, 10, '200,168,255', 0.22);
  return c;
}

/** ไอคอนเห็ดเรืองแสง 16×16 */
export function glowMushroomIcon(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  c.rect(7, 8, 3, 6, 'w');
  c.rect(7, 8, 1, 6, 'W');
  c.ellipse(8.5, 7, 6, 4, '#7b3fa0');
  c.ellipse(8, 6, 5, 3, 'u');
  c.ellipse(7, 5, 2.5, 1.5, '#e6ccff');
  c.set(11, 6, '#f0e0ff');
  c.set(5, 7, '#f0e0ff');
  c.outline('#2a1238');
  glow(c, 8, 7, 8, '200,140,255', 0.3);
  return c;
}
