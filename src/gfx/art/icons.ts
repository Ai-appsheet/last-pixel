import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { SPRITES } from '../../data/sprites';

const pc = (w = 16, h = 16) => new PixelCanvas(w, h);

/** ไอคอนไอเทมใหม่ทั้งหมด (16×16) */
export function itemIcons(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(); // หนังสัตว์
  c.ellipse(8, 8, 6, 5, 'N');
  c.ellipse(8, 8, 4, 3, 'M');
  for (const [x, y] of [[2, 4], [13, 4], [2, 12], [13, 12]]) c.set(x, y, 'N');
  c.set(6, 7, 'm');
  c.set(10, 9, 'm');
  out.i_hide = c.outline();

  const ore = (speck: string, light: string) => {
    const o = pc();
    o.blob(8, 9, 6, 5, ['F', 'D', 'L', 'L']);
    for (const [x, y] of [[6, 7], [9, 10], [10, 6], [5, 10], [8, 8]]) {
      o.set(x, y, speck);
      o.set(x + 1, y, light);
    }
    return o.outline();
  };
  out.i_iron_ore = ore('r', 'N');
  out.i_gold_ore = ore('Y', 'y');

  const ingot = (dark: string, mid: string, light: string) => {
    const o = pc();
    for (let y = 6; y <= 11; y++) {
      const inset = Math.max(0, 8 - y);
      for (let x = 3 + inset; x <= 12 - inset; x++) o.set(x, y, y === 6 ? light : y >= 10 ? dark : mid);
    }
    o.line(4, 7, 11, 7, light);
    o.set(5, 8, 'W');
    return o.outline();
  };
  out.i_iron_ingot = ingot('D', 'L', 'W');
  out.i_gold_ingot = ingot('r', 'Y', 'y');

  c = pc(); // คริสตัล
  for (const [cx, h, col] of [[6, 9, 'u'], [10, 7, 'C'], [8, 12, 'b']] as [number, number, string][]) {
    for (let y = 0; y < h; y++) {
      const hw = y < 2 ? y : Math.min(2, Math.floor((h - y) / 2) + 1);
      for (let x = -hw; x <= hw; x++) c.set(cx + x, 14 - h + y, x < 0 ? 'W' : x === 0 ? col : 'P');
    }
  }
  out.i_crystal = c.outline();

  c = pc(); // เหรียญ
  c.blob(8, 8, 5.5, 5.5, ['r', 'Y', 'y', 'W']);
  c.rect(7, 5, 2, 6, 'r');
  c.set(7, 5, 'Y');
  out.i_coin = c.outline();

  c = pc(); // แครอท
  for (let i = 0; i < 9; i++) {
    const hw = Math.max(0, Math.round((9 - i) / 3));
    for (let x = -hw; x <= hw; x++) c.set(6 + i * 0.6 + x, 6 + i, x < 0 ? 'Y' : 'r');
  }
  c.line(6, 6, 4, 2, 'G');
  c.line(7, 6, 8, 1, 'g');
  c.line(8, 6, 11, 3, 'G');
  for (const y of [8, 11]) c.set(7 + (y - 6) * 0.6, y, 'R');
  out.i_carrot = c.outline();

  c = pc(); // มะเขือเทศ
  c.blob(8, 9, 5.5, 4.5, ['R', 'R', 'r', 'p']);
  c.line(6, 5, 10, 5, 'G');
  c.set(8, 4, 'G');
  c.set(8, 3, 'H');
  out.i_tomato = c.outline();

  c = pc(); // ฟักทอง
  c.blob(8, 9.5, 6.5, 5, ['R', 'r', 'r', 'Y']);
  for (const x of [5, 8, 11]) c.line(x, 6, x, 13, 'R');
  c.rect(7, 3, 2, 3, 'H');
  c.set(9, 3, 'G');
  out.i_pumpkin = c.outline();

  c = pc(); // ผลกระบองเพชร
  c.blob(8, 9, 4.5, 5, ['R', 'p', 'p', 'W']);
  c.set(6, 7, 'Y');
  c.set(10, 10, 'Y');
  c.rect(7, 3, 3, 2, 'G');
  out.i_cactus_fruit = c.outline();

  c = pc(); // สตูว์ (ชาม)
  c.ellipse(8, 9, 6, 2, 'r');
  c.set(6, 9, 'r');
  c.set(7, 8, 'G');
  c.set(10, 9, 'R');
  for (let y = 10; y <= 13; y++) for (let x = 2 + (y - 10); x <= 13 - (y - 10); x++) c.set(x, y, y === 10 ? 'N' : 'M');
  c.line(5, 6, 6, 4, 'W');
  c.line(10, 6, 11, 3, 'W');
  out.i_stew = c.outline();

  c = pc(); // พาย
  for (let y = 7; y <= 12; y++) for (let x = 2; x <= 13; x++) if (y > 7 || (x > 3 && x < 12)) c.set(x, y, y === 7 ? 'N' : y < 10 ? 'r' : 'N');
  for (let x = 3; x <= 12; x += 2) c.set(x, 8, 'Y');
  c.rect(2, 11, 12, 2, 'M');
  out.i_pie = c.outline();

  const seed = (col: string) => {
    const o = pc();
    // ถุงเมล็ด
    for (let y = 5; y <= 13; y++) for (let x = 4; x <= 11; x++) o.set(x, y, x === 4 ? 'N' : x === 11 ? 'M' : y > 11 ? 'M' : 'S');
    o.rect(5, 3, 6, 2, 'N');
    o.rect(6, 5, 4, 1, 'm');
    o.blob(8, 9, 2, 2, [col, col, 'W']);
    return o.outline();
  };
  out.i_seed_carrot = seed('r');
  out.i_seed_tomato = seed('R');
  out.i_seed_pumpkin = seed('Y');

  // เครื่องมือเหล็ก = สลับสีหัวเครื่องมือหิน
  const steel = { L: 'C', D: 'b', W: 'W' };
  out.i_iron_axe = pc().rows(SPRITES.i_stone_axe, 2, 1, steel);
  out.i_iron_pickaxe = pc().rows(SPRITES.i_stone_pickaxe, 1, 2, steel);

  const sword = (blade: string, edge: string, guard: string) => {
    const o = pc();
    for (let i = 0; i < 10; i++) {
      o.set(4 + i, 11 - i, blade);
      o.set(5 + i, 11 - i, edge);
    }
    o.set(14, 1, 'W');
    o.line(2, 10, 6, 14, guard);
    o.line(3, 13, 1, 15, 'M');
    o.set(2, 14, 'm');
    return o.outline();
  };
  out.i_iron_sword = sword('L', 'W', 'Y');
  out.i_crystal_sword = sword('u', 'C', 'Y');

  c = pc(); // ธนู
  for (let a = -1.2; a <= 1.2; a += 0.08) c.set(5 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 'M');
  c.line(10, 2, 10, 14, 'W');
  c.set(12, 8, 'N');
  out.i_bow = c.outline();

  c = pc(); // ลูกธนู
  c.line(3, 13, 12, 4, 'M');
  c.set(13, 3, 'L');
  c.set(12, 3, 'W');
  c.set(13, 4, 'D');
  c.set(3, 12, 'W');
  c.set(4, 13, 'W');
  out.i_arrow = c.outline();

  const armor = (body: string, shade: string, trim: string) => {
    const o = pc();
    for (let y = 3; y <= 13; y++) {
      for (let x = 3; x <= 12; x++) {
        const shoulder = y < 6 && (x < 5 || x > 10);
        const neck = y < 5 && x > 5 && x < 10;
        if (neck || (y > 6 && (x < 4 || x > 11))) continue;
        o.set(x, y, shoulder ? trim : x > 9 ? shade : body);
      }
    }
    o.line(5, 7, 10, 7, trim);
    return o.outline();
  };
  out.i_leather_armor = armor('M', 'm', 'N');
  out.i_fur_coat = armor('W', 'L', 'N');
  out.i_iron_armor = armor('L', 'D', 'C');

  return out;
}

// ---------------- สิ่งก่อสร้างใหม่ ----------------

export function stoneWall(): PixelCanvas {
  const c = new PixelCanvas(16, 22);
  c.shadow(8, 20.5, 8, 1.5);
  for (let y = 2; y <= 20; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor((y - 2) / 4);
      const off = row % 2 ? 4 : 0;
      const mortar = (y - 2) % 4 === 0 || (x + off) % 8 === 0;
      c.set(x, y, mortar ? 'F' : y < 4 ? 'W' : dither(x, y) > 0.3 ? 'D' : 'L');
    }
  }
  return c.outline();
}

export function farmPlot(): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) c.set(x, y, y % 4 === 1 ? 'n' : y % 4 === 2 ? 'M' : 'm');
  return c.outline('n');
}

export function workbench(): PixelCanvas {
  const c = new PixelCanvas(20, 18);
  c.shadow(10, 16.5, 9, 1.5);
  c.rect(1, 5, 18, 3, 'N');
  c.rect(1, 7, 18, 1, 'M');
  for (const x of [2, 16]) c.rect(x, 8, 2, 8, 'M');
  c.rect(4, 11, 12, 1, 'm');
  c.rect(4, 2, 4, 3, 'L'); // ค้อน/ทั่ง
  c.rect(5, 1, 2, 1, 'W');
  c.line(11, 4, 15, 2, 'M');
  c.rect(14, 1, 3, 2, 'D');
  return c.outline();
}

export function furnace(lit: boolean): PixelCanvas {
  const c = new PixelCanvas(18, 22);
  c.shadow(9, 20.5, 8, 1.5);
  for (let y = 4; y <= 20; y++) {
    const hw = y < 7 ? 6 : 8;
    for (let x = 9 - hw; x <= 9 + hw - 1; x++) c.set(x, y, (x + Math.floor(y / 3)) % 5 === 0 || y % 3 === 0 ? 'F' : 'D');
  }
  c.rect(6, 0, 6, 4, 'F');
  c.rect(7, 0, 4, 1, 'D');
  c.rect(5, 12, 8, 6, lit ? 'R' : 'O');
  if (lit) {
    c.rect(6, 14, 6, 4, 'r');
    c.rect(7, 15, 4, 3, 'Y');
    c.rect(8, 16, 2, 2, 'y');
  }
  c.line(5, 11, 12, 11, 'L');
  return c.outline();
}

export function bed(): PixelCanvas {
  const c = new PixelCanvas(16, 24);
  c.shadow(8, 22.5, 8, 1.5);
  c.rect(1, 2, 14, 20, 'M');
  c.rect(2, 3, 12, 5, 'W');
  c.rect(2, 7, 12, 1, 'L');
  c.rect(2, 9, 12, 12, 'R');
  for (let y = 10; y < 21; y += 3) c.line(2, y, 13, y, 'P');
  c.rect(2, 9, 12, 1, 'r');
  return c.outline();
}

/** พืชในแปลง 4 ระยะ */
export function cropStage(kind: string, stage: number): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  const rng = new RNG(kind.length * 7 + stage);
  if (stage === 0) {
    for (const x of [4, 8, 12]) c.set(x, 9, 'n');
    return c;
  }
  const plants = [4, 8, 12];
  for (const px of plants) {
    const h = stage === 1 ? 2 : stage === 2 ? 5 : 7;
    c.line(px, 13, px, 13 - h, 'H');
    c.set(px - 1, 13 - h + 1, 'G');
    c.set(px + 1, 13 - h + 2, 'g');
    if (stage === 3) {
      if (kind === 'carrot') {
        c.rect(px - 1, 12, 3, 2, 'r');
        c.set(px - 1, 12, 'Y');
        c.line(px - 2, 6, px + 2, 6, 'G');
      } else if (kind === 'tomato') {
        c.blob(px, 8 + rng.int(0, 2), 1.6, 1.6, ['R', 'R', 'p']);
        c.blob(px + 1, 11, 1.2, 1.2, ['R', 'r']);
      } else {
        c.blob(px, 11, 2.6, 2.2, ['R', 'r', 'Y']);
      }
    }
  }
  return stage === 3 ? c.outline() : c;
}

// ---------------- ธรรมชาติเพิ่มเติม ----------------

/** สนหิมะ */
export function snowPine(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(24, 38);
  c.shadow(12, 35, 8, 2.5);
  for (let y = 29; y <= 35; y++) for (let x = 11; x <= 13; x++) c.set(x, y, x === 11 ? 'N' : x === 13 ? 'm' : 'M');
  const tiers = [{ top: 1, bottom: 12, half: 5 }, { top: 7, bottom: 19, half: 8 }, { top: 13, bottom: 26, half: 10 }, { top: 19, bottom: 32, half: 11 }];
  for (const t of tiers) {
    for (let y = t.top; y <= t.bottom; y++) {
      const k = (y - t.top) / (t.bottom - t.top);
      const hw = 0.8 + k * t.half;
      for (let x = Math.floor(12 - hw); x <= Math.ceil(12 + hw); x++) {
        const rel = (x + 0.5 - 12) / hw;
        if (Math.abs(rel) > 1) continue;
        if (y === t.bottom && (x + t.top) % 2 === 0) continue;
        const snowy = k < 0.35 + rng.next() * 0.15 || (y === t.bottom - 1 && rng.chance(0.4));
        const v = -rel * 0.6 + dither(x, y) * 0.4;
        c.set(x, y, snowy ? (v > 0 ? 'W' : 'w') : v > 0.2 ? 'T' : v > -0.3 ? 'V' : 'U');
      }
    }
  }
  return c.outline();
}

/** กระบองเพชร (มีผลสีชมพู) */
export function cactus(seed: number, fruit: boolean): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(18, 26);
  c.shadow(9, 24, 6, 1.8);
  const col = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) {
      c.set(x - 1, y, 'g');
      c.set(x, y, 'G');
      c.set(x + 1, y, 'H');
      c.set(x + 2, y, 'T');
    }
    c.set(x, y0 - 1, 'G');
    c.set(x + 1, y0 - 1, 'H');
  };
  col(8, 3, 23);
  const armL = rng.int(9, 13);
  col(3, armL - 6, armL);
  for (let x = 3; x <= 8; x++) {
    c.set(x, armL, 'G');
    c.set(x, armL + 1, 'T');
  }
  const armR = rng.int(6, 11);
  col(13, armR - 4, armR);
  for (let x = 10; x <= 13; x++) {
    c.set(x, armR, 'G');
    c.set(x, armR + 1, 'T');
  }
  for (let i = 0; i < 14; i++) {
    const x = rng.int(2, 15);
    const y = rng.int(3, 22);
    if (c.get(x, y) === 'G') c.set(x, y, 'y'); // หนาม
  }
  if (fruit) {
    c.blob(9, 2, 1.6, 1.4, ['R', 'p', 'W']);
    c.blob(4, armL - 7, 1.4, 1.2, ['R', 'p']);
  }
  return c.outline();
}

/** หินแร่: iron / gold / crystal */
export function oreRock(kind: 'iron' | 'gold' | 'crystal' | 'coal' | 'sulfur' | 'meteor', seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(20, 18);
  c.shadow(10, 15.5, 9, 2.5);
  const body = kind === 'meteor' ? ['O', 'U', 'P', 'u'] : kind === 'coal' ? ['O', 'F', 'D', 'L'] : ['F', 'D', 'L', 'L'];
  c.blob(10, 11, 8, 5.5, body, rng, 0.15);
  c.blob(7, 8, 4.5, 3.5, kind === 'meteor' ? ['O', 'U', 'P', 'u'] : ['F', 'D', 'L', 'W'], rng, 0.2);
  if (kind === 'crystal') {
    for (const [x, h, col] of [[6, 9, 'u'], [10, 12, 'C'], [14, 8, 'b']] as [number, number, string][]) {
      for (let y = 0; y < h; y++) {
        const hw = y < 2 ? Math.floor(y / 2) : 1;
        for (let dx = -hw; dx <= hw; dx++) c.set(x + dx, 13 - h + y, dx < 0 ? 'W' : dx === 0 ? col : 'P');
      }
    }
  } else {
    const [a, b] = kind === 'iron' ? ['r', 'N'] : kind === 'coal' ? ['O', 'L'] : kind === 'meteor' ? ['r', 'Y'] : kind === 'sulfur' ? ['Y', 'y'] : ['Y', 'y'];
    for (let i = 0; i < 9; i++) {
      const x = rng.int(4, 15);
      const y = rng.int(6, 14);
      if (!c.get(x, y) || c.get(x, y)!.startsWith('rgba')) continue;
      c.set(x, y, a);
      c.set(x + 1, y, b);
      if (kind === 'gold' || kind === 'sulfur') c.set(x, y - 1, kind === 'sulfur' ? 'Y' : 'W');
      if (kind === 'meteor') c.set(x + 1, y + 1, 'R');
    }
  }
  return c.outline();
}

/** พืชป่า (ให้เมล็ดสุ่ม) */
export function wildCrop(seed: number): PixelCanvas {
  const rng = new RNG(seed);
  const c = new PixelCanvas(16, 16);
  c.shadow(8, 14, 6, 1.5, 0.22);
  for (let i = 0; i < 6; i++) {
    const x = 3 + i * 2;
    const h = rng.int(5, 9);
    c.line(x, 14, x + rng.int(-1, 1), 14 - h, 'G');
    c.set(x - 1, 14 - h + 2, 'g');
  }
  c.blob(5, 8, 1.5, 1.5, ['R', 'r', 'Y']);
  c.blob(11, 7, 1.5, 1.5, ['r', 'Y', 'y']);
  return c.outline();
}
