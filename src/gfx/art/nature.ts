import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { LEAF4, PINE4, WP } from '../palette';

const LEAF = LEAF4;

// สไตล์ต้นไม้: พุ่มใบเป็นก้อนกลมซ้อนกัน (แต่ละก้อนแรเงาเอง แสงซ้ายบน) 3 เฉด + จุดไฮไลต์ · เส้นขอบเข้มอมเขียว · เงานุ่มสองชั้น

/** เงานุ่มสองชั้นใต้วัตถุ (วงนอกจาง วงในเข้ม) */
export function softShadow(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number) {
  c.ellipse(cx, cy, rx + 1.5, ry + 0.8, 'rgba(16,30,36,0.14)');
  c.ellipse(cx, cy, rx, ry, 'rgba(16,30,36,0.26)');
  return c;
}

/**
 * พุ่มใบแบบก้อนกลมซ้อน (ใช้กับต้นไม้ใบกว้าง/พุ่มไม้)
 * shades = [มืด, กลาง, สว่าง, ไฮไลต์] · ก้อนล่างวาดทีหลัง (อยู่หน้า) ขอบล่างของแต่ละก้อนเข้มให้เห็นแยกก้อน
 */
export function clump(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, shades: string[], rng: RNG, lobes = 0) {
  const n = lobes || Math.max(5, Math.round((rx + ry) / 2.4));
  const r0 = Math.min(rx, ry);
  const pts: [number, number, number][] = [[cx, cy - ry * 0.1, r0 * 0.72]];
  const spin = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    pts.push([cx + Math.cos(a) * rx * 0.58, cy + Math.sin(a) * ry * 0.55, r0 * rng.range(0.42, 0.55)]);
  }
  pts.sort((p, q) => p[1] - q[1]);
  for (const [px, py, pr] of pts) {
    const rxl = pr * (rx / r0);
    const ryl = pr * (ry / r0) * 0.92;
    for (let y = Math.floor(py - ryl); y <= Math.ceil(py + ryl); y++) {
      for (let x = Math.floor(px - rxl); x <= Math.ceil(px + rxl); x++) {
        const nx = (x + 0.5 - px) / rxl;
        const ny = (y + 0.5 - py) / ryl;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) continue;
        const lit = -(nx * 0.5 + ny * 0.85) * 0.8 + (1 - d2) * 0.25 + dither(x, y) * 0.12;
        let col = lit > 0.42 ? shades[2] : lit > -0.18 ? shades[1] : shades[0];
        if (d2 > 0.72 && ny > 0.35) col = shades[0]; // ขอบล่างของก้อน
        c.set(x, y, col);
      }
    }
  }
  // จุดไฮไลต์บนก้อนด้านบน
  for (let i = 0; i < Math.round((rx * ry) / 9); i++) {
    const x = Math.round(cx + rng.range(-rx * 0.75, rx * 0.4));
    const y = Math.round(cy + rng.range(-ry * 0.85, ry * 0.1));
    if (c.get(x, y) === shades[2] && c.get(x + 1, y) === shades[2]) {
      c.set(x, y, shades[3]);
      if (rng.chance(0.5)) c.set(x + 1, y, shades[3]);
    }
  }
  return c;
}

/** ลำต้นเข้มมีรากแผ่ (ซ้ายสว่าง ขวามืด) */
function rootTrunk(c: PixelCanvas, cx: number, top: number, base: number, hw: number) {
  for (let y = top; y <= base; y++) {
    const flare = y > base - 3 ? (y - (base - 3)) * 0.8 : 0;
    const l = Math.round(cx - hw - flare);
    const r = Math.round(cx + hw + flare);
    for (let x = l; x <= r; x++) {
      const rel = (x - l) / Math.max(1, r - l);
      c.set(x, y, rel < 0.25 ? WP.bark2 : rel < 0.7 ? WP.bark1 : WP.bark0);
    }
  }
  // รากโผล่สองข้าง
  c.set(cx - hw - 3, base, WP.bark1);
  c.set(cx + hw + 3, base, WP.bark0);
}

/** ต้นไม้ใบกลม (โอ๊ก) 32×34 — พุ่มก้อนกลมใหญ่ บางต้นมีผล */
export function oak(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(32, 34);
  softShadow(c, 16, 31, 12, 2.6);
  rootTrunk(c, 15.5, 18, 31, 2.5);
  // เงาพุ่มบนลำต้น
  c.rect(13, 18, 6, 2, WP.bark0);
  clump(c, 16, 12, 13, 10, LEAF, rng);
  if (rng.chance(0.35)) {
    for (let i = 0, t = 0; i < 6 && t < 40; t++) {
      const x = rng.int(6, 25);
      const y = rng.int(5, 18);
      if (c.get(x, y) !== LEAF[1] && c.get(x, y) !== LEAF[2]) continue;
      c.set(x, y, '#d06850');
      c.set(x, y + 1, '#9a3e3c');
      i++;
    }
  }
  return c.outline(WP.leaf0);
}

/** ชั้นใบสนทรงสามเหลี่ยม ขอบล่างหยักโค้ง (ซ้ายสว่าง ขวามืด) */
function pineTier(c: PixelCanvas, cx: number, top: number, bottom: number, half: number, tones: string[], snow = 0) {
  for (let y = top; y <= bottom + 1; y++) {
    const k = (y - top) / (bottom - top);
    const hw = 0.6 + Math.min(1, k) * half;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const rel = (x + 0.5 - cx) / hw;
      if (Math.abs(rel) > 1) continue;
      // ขอบล่างเป็นลอนโค้ง
      const lobe = Math.abs(Math.sin(((x - cx) / 3) * Math.PI));
      if (y > bottom - 1 + lobe * 1.6) continue;
      const v = -rel * 0.7 + (1 - k) * 0.25 + dither(x, y) * 0.1;
      let col = v > 0.4 ? tones[2] : v > -0.15 ? tones[1] : tones[0];
      if (y >= bottom - 1 + lobe * 1.6 - 1) col = tones[0];
      if (snow && k < snow + (rel < 0 ? 0.12 : 0)) col = rel < 0.1 ? WP.snowLight : WP.snowShade;
      c.set(x, y, col);
    }
  }
  // ไฮไลต์ขอบซ้าย
  for (let y = top + 2; y < bottom - 1; y += 2) {
    const k = (y - top) / (bottom - top);
    const x = Math.round(cx - (0.6 + k * half) * 0.55);
    if (c.get(x, y) === tones[2]) c.set(x, y, tones[3]);
  }
}

/** ต้นสน 24×38 — ใบซ้อนเป็นชั้น ลอนโค้ง */
export function pine(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(24, 38);
  softShadow(c, 12, 35, 8, 2.3);
  rootTrunk(c, 11.5, 28, 35, 1.5);
  const tiers = [[20, 33, 11], [14, 27, 9.5], [8, 21, 7.5], [2, 14, 5.5]];
  for (const [top, bottom, half] of tiers) pineTier(c, 12, top + rng.int(0, 1), bottom, half, PINE4);
  if (rng.chance(0.4)) for (let i = 0; i < 3; i++) c.set(rng.int(7, 16), rng.int(14, 30), WP.bark2); // ลูกสน
  return c.outline(WP.pine0);
}

/** สนหิมะ 24×38 */
export function snowPine(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(24, 38);
  softShadow(c, 12, 35, 8, 2.3);
  rootTrunk(c, 11.5, 28, 35, 1.5);
  const tiers = [[20, 33, 11], [14, 27, 9.5], [8, 21, 7.5], [2, 14, 5.5]];
  for (const [top, bottom, half] of tiers) pineTier(c, 12, top + rng.int(0, 1), bottom, half, PINE4, 0.42);
  return c.outline(WP.pine0);
}

/** ต้นมะพร้าว (ชายหาด) 36×42 — ลำต้นอ้วนพันเป็นปล้อง ใบกว้างแผ่ */
export function palm(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(36, 42);
  softShadow(c, 18, 39, 10, 2.4);
  const lean = rng.chance(0.5) ? 1 : -1;
  const trunkX = (y: number) => 18 + lean * ((39 - y) / 26) ** 2 * 5;
  for (let y = 39; y >= 13; y--) {
    const x = trunkX(y);
    const hw = y > 34 ? 3 : 2.2;
    const band = (39 - y) % 4;
    for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
      if (Math.abs(dx) > hw) continue;
      const rel = dx / hw;
      let col: string = rel < -0.4 ? WP.bark3 : rel < 0.4 ? WP.bark2 : WP.bark1;
      if (band === 0) col = rel < 0 ? WP.bark1 : WP.bark0; // ร่องปล้องพัน
      c.set(x + dx, y, col);
    }
  }
  const tx = Math.round(trunkX(13));
  const ty = 12;
  // ใบกว้าง: [ทิศ x, ยกขึ้น, ยาว, หน้า/หลัง]
  const fronds: [number, number, number, number][] = [
    [-1, 0.2, 13, 0], [1, 0.2, 13, 0], [-0.55, 1, 9, 0], [0.55, 1, 9, 0],
    [-1, 0.75, 12, 1], [1, 0.75, 12, 1], [-0.3, -0.6, 8, 1], [0.35, -0.6, 8, 1],
  ];
  for (const [dx, lift, len, front] of fronds) {
    const tones = front ? [WP.leaf2, WP.leaf3, WP.leaf4] : [WP.leaf1, WP.leaf2, WP.leaf3];
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      const x = tx + dx * len * t;
      const y = ty - lift * 6 * t + 7 * t * t;
      const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 2.6;
      for (let k = -Math.ceil(w); k <= Math.ceil(w); k++) {
        if (Math.abs(k) > w) continue;
        c.set(x, y + k, k < 0 ? tones[2] : k === 0 ? tones[1] : tones[0]);
      }
    }
  }
  c.blob(tx - 2, ty + 3, 1.7, 1.7, [WP.bark0, WP.bark1, WP.bark2]);
  c.blob(tx + 1, ty + 4, 1.7, 1.7, [WP.bark0, WP.bark1, WP.bark2]);
  return c.outline(WP.leaf0);
}

/** ก้อนหิน/ก้อนกลมเรียบ (แรเงานุ่ม noise ต่ำ) */
function boulder(c: PixelCanvas, cx: number, cy: number, rx: number, ry: number, tones: string[]) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const lit = -(nx * 0.55 + ny * 0.8) * 0.75 + (1 - d2) * 0.3 + dither(x, y) * 0.1;
      c.set(x, y, tones[lit > 0.55 ? 3 : lit > 0.15 ? 2 : lit > -0.3 ? 1 : 0]);
    }
  }
}

/** ก้อนหิน 20×16 (บางก้อนมีมอส) */
export function rock(seed: number, mossy: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 16);
  softShadow(c, 10, 13.5, 8.5, 2.2);
  const tones = [WP.rockFace, WP.rockDark, WP.rock, WP.rockLight];
  boulder(c, 10, 9, 8, 5.5, tones);
  boulder(c, 5 + rng.int(0, 8), 6, 4, 3, tones);
  const cx = rng.int(7, 12);
  c.line(cx, 8, cx + 1, 10, WP.rockFace);
  if (mossy) {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 16; y++) {
        const p = c.get(x, y);
        if (p && !p.startsWith('rgba')) {
          if (rng.chance(0.75)) {
            c.set(x, y, WP.leaf3);
            c.set(x, y + 1, rng.chance(0.6) ? WP.leaf2 : WP.leaf3);
          }
          break;
        }
      }
    }
  }
  return c.outline(WP.rockLine);
}

/** หินแร่ 20×18: ก้อนหินเรียบ + ก้อนแร่ใหญ่ 2×2 มีประกาย (คริสตัล = แท่งผลึกโผล่) */
export function oreRock(kind: 'iron' | 'gold' | 'crystal' | 'coal' | 'sulfur' | 'meteor', seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 18);
  softShadow(c, 10, 15.5, 8.5, 2.2);
  const body = kind === 'meteor' ? ['#2c2436', '#41344e', '#5a4868', '#76648a'] : kind === 'coal' ? [WP.rockLine, '#3a3c38', '#52554e', '#6c6f66'] : [WP.rockFace, WP.rockDark, WP.rock, WP.rockLight];
  boulder(c, 10, 11, 8, 5.5, body);
  boulder(c, 7, 8, 4.5, 3.5, body);
  if (kind === 'crystal') {
    for (const [x, h, col] of [[6, 9, '#b49ad6'], [10, 12, '#9fdce0'], [14, 8, '#7fb0d8']] as [number, number, string][]) {
      for (let y = 0; y < h; y++) {
        const hw = y < 2 ? 0 : 1;
        for (let dx = -hw; dx <= hw; dx++) c.set(x + dx, 13 - h + y, dx < 0 ? '#f2f4ef' : dx === 0 ? col : '#6a5a90');
      }
    }
  } else {
    const [a, b, hi] = kind === 'iron' ? ['#c47a52', '#8e5236', '#f0b48a'] : kind === 'coal' ? ['#1e2024', '#2c2f33', '#8a8f96'] : kind === 'meteor' ? ['#e0845c', '#a8483a', '#f6d28a'] : ['#f0c870', '#c8963e', '#fff2c8'];
    for (let i = 0, t = 0; i < 4 && t < 40; t++) {
      const x = rng.int(4, 14);
      const y = rng.int(6, 13);
      if (c.get(x, y) !== body[2] && c.get(x, y) !== body[1]) continue;
      if (c.get(x + 1, y + 1) !== body[2] && c.get(x + 1, y + 1) !== body[1]) continue;
      c.set(x, y, a);
      c.set(x + 1, y, a);
      c.set(x, y + 1, b);
      c.set(x + 1, y + 1, b);
      c.set(x, y, hi);
      i++;
    }
  }
  return c.outline(WP.rockLine);
}

/** พุ่มไม้ 20×18 (มีเบอร์รี่หรือไม่ก็ได้) */
export function bush(seed: number, berries: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 18);
  softShadow(c, 10, 15.5, 8.5, 2.2);
  clump(c, 10, 9.5, 8.5, 6, LEAF, rng, 5);
  const n = berries ? 6 : 0;
  for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
    const x = rng.int(3, 15);
    const y = rng.int(4, 13);
    if (!c.get(x, y) || !c.get(x + 1, y + 1)) continue;
    c.set(x, y, '#f09a8a');
    c.set(x + 1, y, '#c4504c');
    c.set(x, y + 1, '#c4504c');
    c.set(x + 1, y + 1, '#8a3040');
    i++;
  }
  return c.outline(WP.leaf0);
}

/** กอหญ้า/พืชใบแหลม 16×14 — ใบแผ่เป็นพัด 3–4 เฉด (บางใบสีฟาง) */
export function tuft(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(16, 14);
  softShadow(c, 8, 12.5, 5.5, 1.3);
  const blades: [number, number][] = [[-1.25, 7], [-0.9, 9], [-0.5, 10], [-0.15, 11], [0.2, 10], [0.55, 9], [0.95, 8], [1.3, 6]];
  blades.forEach(([ang, len], i) => {
    const a = -Math.PI / 2 + ang * 0.9 + rng.range(-0.1, 0.1);
    const straw = i % 4 === 1 && rng.chance(0.6);
    const tones = straw ? [WP.bark2, WP.bark3, '#d8b878'] : i % 2 ? [WP.leaf1, WP.leaf2, WP.leaf3] : [WP.leaf2, WP.leaf3, WP.leaf4];
    for (let k = 0; k <= len; k++) {
      const t = k / len;
      const x = 8 + Math.cos(a) * k + (ang > 0 ? 1 : -1) * t * t * 1.5;
      const y = 12.5 + Math.sin(a) * k + t * t * 2;
      c.set(x, y, t > 0.7 ? tones[2] : tones[1]);
      if (t < 0.6) c.set(x + (ang < 0 ? 1 : -1), y, tones[0]);
    }
  });
  return c.outline(WP.leaf0);
}

/** ตอไม้ 16×12 */
export function stump(): PixelCanvas {
  const c = new PixelCanvas(16, 12);
  softShadow(c, 8, 10, 6, 1.8);
  for (let y = 4; y <= 9; y++) for (let x = 4; x <= 11; x++) c.set(x, y, x <= 5 ? WP.bark2 : x >= 10 ? WP.bark0 : WP.bark1);
  c.ellipse(8, 4, 4.5, 2, WP.bark3);
  c.ellipse(8, 4, 2.5, 1, WP.bark2);
  c.set(8, 4, WP.bark3);
  c.set(3, 9, WP.bark1);
  c.set(12, 9, WP.bark0);
  return c.outline(WP.lineWood);
}

/** กระบองเพชร 18×26 — ลำกลมเขียวสด หนามจุดเล็ก ดอกแดง */
export function cactus(seed: number, fruit: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(18, 26);
  softShadow(c, 9, 24, 6, 1.6);
  const T = [WP.leaf1, WP.leaf2, WP.leaf3, WP.leaf4];
  const col = (x: number, y0: number, y1: number, hw: number) => {
    for (let y = y0 - hw; y <= y1; y++) {
      for (let dx = -hw; dx <= hw; dx++) {
        const top = y < y0 ? Math.hypot(dx, y - y0) > hw + 0.3 : false;
        if (top) continue;
        const rel = dx / (hw + 0.5);
        c.set(x + dx, y, rel < -0.45 ? T[2] : rel < 0.35 ? T[1] : T[0]);
      }
      if ((y - y0) % 4 === 1 && y >= y0) c.set(x - Math.round(hw * 0.5), y, T[3]); // หนาม
    }
  };
  const armL = rng.int(10, 14);
  col(4, armL - 6, armL, 1);
  for (let x = 4; x <= 8; x++) c.rect(x, armL - 1, 1, 3, x < 6 ? T[2] : T[1]);
  const armR = rng.int(7, 11);
  col(14, armR - 4, armR, 1);
  for (let x = 10; x <= 14; x++) c.rect(x, armR - 1, 1, 3, T[1]);
  col(9, 5, 23, 2);
  if (fruit) {
    for (const [x, y] of [[9, 2], [4, armL - 8]] as [number, number][]) {
      c.set(x - 1, y, '#e0605a');
      c.set(x + 1, y, '#e0605a');
      c.set(x, y - 1, '#e0605a');
      c.set(x, y, '#f0c870');
    }
  }
  return c.outline(WP.leaf0);
}

// ---------------- ของตกแต่งพื้น (ไม่มีการชน) ----------------

/** ดอกไม้เล็กกลีบ 4 (แบบดอกเดซี่) */
function flower(c: PixelCanvas, x: number, y: number, petal: string, center: string) {
  c.set(x, y + 2, WP.leaf2);
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
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) flower(c, rng.int(3, 12), rng.int(3, 11), petal, center);
    return c;
  };
  tiles.push(flowers('#e6828a', '#f6e8b8')); // 0 แดง/ชมพู
  tiles.push(flowers('#f0c870', '#e0845c')); // 1 เหลือง
  tiles.push(flowers('#f6f8f2', '#f0c870')); // 2 ขาว
  tiles.push(flowers('#b49ad6', '#f6f8f2')); // 3 ม่วง

  let c = new PixelCanvas(16, 16); // 4 กรวด
  for (let i = 0; i < 3; i++) {
    const x = rng.int(2, 12);
    const y = rng.int(3, 12);
    c.set(x, y, WP.rockLight);
    c.set(x + 1, y, WP.rock);
    c.set(x, y + 1, WP.rockDark);
    c.set(x + 1, y + 1, WP.rockFace);
  }
  tiles.push(c);

  for (let k = 0; k < 2; k++) { // 5,6 กอหญ้าเล็ก
    c = new PixelCanvas(16, 16);
    for (let i = 0; i < 2; i++) {
      const x = rng.int(2, 10);
      const y = rng.int(4, 12);
      const col = k ? WP.grassLight : WP.grassDeep;
      c.set(x, y, col);
      c.set(x + 2, y - 1, col);
      c.set(x + 4, y, col);
      c.rect(x + 1, y + 1, 3, 1, col);
    }
    tiles.push(c);
  }

  c = new PixelCanvas(16, 16); // 7 เห็ด
  for (const [x, y, big] of [[5, 10, 1], [9, 12, 0]]) {
    c.rect(x, y, 1, 2 + big, '#ece6d8');
    c.rect(x - 1 - big, y - 1, 3 + big * 2, 1, '#c4605a');
    c.rect(x - big, y - 2, 1 + big * 2, 1, '#d87a6a');
    c.set(x - big, y - 2, '#f6e8d8');
  }
  tiles.push(c.outline(WP.lineWood));

  c = new PixelCanvas(16, 16); // 8 เฟิร์น (ใบพัดเขียวอมฟ้า)
  for (const a of [-2.6, -2.15, -1.75, -1.4, -1.0, -0.55]) {
    for (let i = 0; i < 7; i++) {
      const x = 8 + Math.cos(a) * i;
      const y = 13 + Math.sin(a) * i + i * i * 0.07;
      c.set(x, y, i > 4 ? WP.leaf4 : i > 2 ? WP.leaf3 : WP.leaf2);
      if (i % 2 && i > 1) c.set(x + (a < -1.57 ? 1 : -1), y + 1, WP.leaf1);
    }
  }
  tiles.push(c.outline(WP.leaf0));

  c = new PixelCanvas(16, 16); // 9 ใบไม้ร่วง
  for (let i = 0; i < 4; i++) {
    const x = rng.int(1, 13);
    const y = rng.int(2, 13);
    const col = rng.pick(['#e0845c', '#f0c870', WP.bark3]);
    c.set(x, y, col);
    c.set(x + 1, y, col);
    c.set(x + 1, y + 1, WP.bark1);
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 10 เปลือกหอย
  c.ellipse(8, 9, 3.5, 2.5, '#efc0b8');
  for (const x of [6, 8, 10]) c.line(8, 11, x, 7, '#c99080');
  c.set(8, 11, '#f6f0e8');
  tiles.push(c.outline(WP.lineWood));

  c = new PixelCanvas(16, 16); // 11 ปลาดาว
  for (let a = 0; a < 5; a++) {
    const ang = -Math.PI / 2 + (a * Math.PI * 2) / 5;
    c.line(8, 8, 8 + Math.cos(ang) * 4, 8 + Math.sin(ang) * 4, '#e0845c');
  }
  c.set(8, 8, '#f0c870');
  c.set(7, 7, '#f0c870');
  tiles.push(c.outline(WP.lineWood));

  c = new PixelCanvas(16, 16); // 12 ใบบัว
  c.ellipse(8, 9, 5, 3.5, WP.leaf2);
  c.ellipse(7, 8, 3, 2, WP.leaf3);
  c.line(8, 9, 12, 7, WP.shallow);
  c.set(10, 8, '#efa8b0');
  c.set(11, 8, '#f6f8f2');
  c.set(10, 7, '#efa8b0');
  tiles.push(c.outline(WP.leaf0));

  c = new PixelCanvas(16, 16); // 13 กก/ธูปฤๅษี
  for (const x of [5, 7, 9, 11]) {
    const h = rng.int(6, 10);
    c.line(x, 14, x, 14 - h, WP.leaf2);
    if (rng.chance(0.6)) c.rect(x, 14 - h - 2, 1, 3, WP.bark2);
    else c.set(x + 1, 14 - h, WP.leaf3);
  }
  tiles.push(c);

  c = new PixelCanvas(16, 16); // 14 กิ่งไม้ลอยมาเกยหาด
  c.line(3, 10, 12, 7, WP.bark1, 1);
  c.line(3, 9, 12, 6, WP.bark3, 1);
  c.line(8, 8, 10, 11, WP.bark1);
  tiles.push(c.outline(WP.lineWood));

  c = new PixelCanvas(16, 16); // 15 ลายทราย
  for (const y of [5, 10]) for (let x = 3; x < 13; x++) if (Math.sin(x * 0.9 + y) > 0.35) c.set(x, y + Math.round(Math.sin(x * 0.6)), WP.sandDark);
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
  softShadow(c, 14, 35, 9, 2.5);
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
  clump(c, 14, 11, 9, 9.5, LEAVES, rng);
  clump(c, 8, 17, 5.5, 5, LEAVES, rng);
  clump(c, 20, 16, 5.5, 5, LEAVES, rng);
  clump(c, 13 + rng.int(-1, 2), 4, 5, 3.5, LEAVES, rng);
  clump(c, 14, 20, 4.5, 3, LEAVES, rng);
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
  softShadow(c, 17, 31, 13, 2.8);
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
  clump(c, 8, 14, 7.5, 6, PINK, rng);
  clump(c, 26, 14, 7.5, 6, PINK, rng);
  clump(c, 17, 10, 11, 8.5, PINK, rng);
  clump(c, 12 + rng.int(0, 6), 4.5, 6.5, 4, PINK, rng);
  clump(c, 17, 18, 6, 3, PINK, rng);
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
  softShadow(c, 16, 31, 12, 3);
  trunk(c, 13, 18, 20, 31, ['N', 'M', 'm']);
  c.set(12, 31, 'M');
  c.set(19, 31, 'm');
  for (let i = 0; i < 6; i++) c.set(rng.int(14, 17), rng.int(22, 30), 'm');
  c.line(15, 23, 10, 18, 'M');
  c.line(17, 22, 22, 18, 'm');
  clump(c, 8, 15, 7, 6, A, rng);
  clump(c, 24, 15, 7, 6, A, rng);
  clump(c, 16, 11, 11, 9, A, rng);
  clump(c, 14 + rng.int(0, 4), 5, 7, 4.5, A, rng);
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
  softShadow(c, 18, 33, 15, 2.8);
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
  clump(c, 18, 10, 15, 8, [WP.leaf0, WP.leaf1, WP.leaf2, WP.leaf3], rng);
  clump(c, 18, 6, 10, 5, LEAF, rng);
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
  softShadow(c, 24, 48, 21, 3.4);
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
  clump(c, 10, 23, 10, 8, LEAF, rng);
  clump(c, 38, 23, 10, 8, LEAF, rng);
  clump(c, 24, 17, 20, 13, LEAF, rng);
  clump(c, 15, 9, 10, 7.5, LEAF, rng);
  clump(c, 33, 9, 10, 7.5, LEAF, rng);
  clump(c, 24, 5, 9, 5, LEAF, rng);
  clump(c, 17, 28, 7, 4, LEAF, rng);
  clump(c, 32, 28, 7, 4, LEAF, rng);
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
  softShadow(c, 13, 31, 9, 2.4);
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
  softShadow(c, 15, 33, 10, 2.6);
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
  softShadow(c, 19, 31, 14, 2.6);
  for (let y = 18; y <= 31; y++) for (let x = 18; x <= 20; x++) c.set(x, y, x === 18 ? 'N' : x === 20 ? 'm' : 'M');
  c.line(19, 20, 10, 11, 'M', 2);
  c.line(19, 19, 28, 10, 'm', 2);
  c.line(19, 22, 19, 11, 'M', 1);
  const LEAVES = ['V', 'H', '#7f9a46', '#b5c46a'];
  clump(c, 19, 8, 17, 4, LEAVES, rng);
  clump(c, 10 + rng.int(-1, 1), 6, 7, 3, LEAVES, rng);
  clump(c, 27 + rng.int(-1, 1), 6.5, 7, 3, LEAVES, rng);
  for (let x = 4; x < 34; x++) if (c.get(x, 10) && rng.chance(0.5)) c.set(x, 11, 'V');
  return c.outline();
}

/** โกงกาง (ป่าชายเลน) 32×34 — รากค้ำโค้งเหนือโคลน */
export function mangrove(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(32, 34);
  softShadow(c, 16, 31, 12, 2.6);
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
  clump(c, 16, 11, 12, 8, LEAVES, rng);
  clump(c, 9, 13, 6, 4.5, LEAVES, rng);
  clump(c, 23, 13, 6, 4.5, LEAVES, rng);
  for (let i = 0; i < 5; i++) c.line(rng.int(8, 24), 15, rng.int(8, 24), 18 + rng.int(0, 3), 'V'); // รากอากาศ
  return c.outline();
}

/** กอไผ่ 22×40 — ลำปล้องเขียวหลายลำ */
export function bambooClump(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(22, 40);
  softShadow(c, 11, 37, 8, 2.2);
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
  softShadow(c, 10, 13.5, 8, 2.2);
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
  softShadow(c, 8, 12, 6, 1.6);
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
  softShadow(c, 10, 19.5, 8, 2.2);
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
