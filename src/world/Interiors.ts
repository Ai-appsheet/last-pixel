import { RNG } from '../core/RNG';
import { TILE } from './tiles';

/**
 * แมพย่อยในเกาะส่วนตัว — ดันเจี้ยนใต้ดินของเกาะร้าง (ไม่มีหมู่บ้าน/ชาวบ้าน — ผู้เล่นต้องพิชิตเอง)
 * อยู่ในแถวพิเศษใต้ตารางเกาะ (ช่อง INTERIOR_BASE + n) — เดินเรือไปไม่ได้ ต้องเข้าทางประตู/ปากถ้ำบนเกาะตัวเอง
 * ขอบช่องทุกด้านเป็นผนังหินหนา (ROCKWALL) กันเดินทะลุไปแมพอื่น
 */
export const INTERIOR_BASE = 1000;

export type InteriorKind = 'dungeon';

export interface InteriorDef {
  index: number;
  kind: InteriorKind;
  name: string;
  /** ข้อความใต้ชื่อ (แบนเนอร์/ป้ายทางเข้า) */
  desc: string;
  /** ป้ายหน้าทางเข้าบนเกาะ */
  gate: string;
  /** ดันเจี้ยน: ระดับความยาก 1..3 */
  tier?: number;
  /** เลเวลที่แนะนำ */
  recommend?: string;
  /** texture ทางเข้าบนเกาะ */
  entrance: string;
}

export const INTERIORS: InteriorDef[] = [
  { index: INTERIOR_BASE + 0, kind: 'dungeon', name: 'ถ้ำหินมืด', desc: 'ดันเจี้ยนชั้น 1 · ค้างคาว สไลม์ โครงกระดูก · บอส: โกเลมหินยักษ์', gate: '⛏ ถ้ำหินมืด', tier: 1, recommend: 'Lv.1–10', entrance: 'cave_entrance' },
  { index: INTERIOR_BASE + 1, kind: 'dungeon', name: 'เหมืองร้าง', desc: 'ดันเจี้ยนชั้น 2 · โกเลม มัมมี่ เงาหลอน · บอส: ราชาปูยักษ์', gate: '⛏ เหมืองร้าง', tier: 2, recommend: 'Lv.10–25', entrance: 'cave_entrance' },
  { index: INTERIOR_BASE + 2, kind: 'dungeon', name: 'สุสานโบราณ', desc: 'ดันเจี้ยนชั้น 3 · อิมป์ไฟ มัมมี่ เงาหลอน · บอส: ราชาปีศาจ', gate: '💀 สุสานโบราณ', tier: 3, recommend: 'Lv.25+', entrance: 'cave_entrance' },
];

export const interiorDef = (index: number) => INTERIORS.find((d) => d.index === index);
export const isInterior = (index: number) => index >= INTERIOR_BASE;

/** มอนสเตอร์ประจำดันเจี้ยนแต่ละระดับ + บอส + ตัวคูณพลัง */
export const DUNGEON_MOBS: Record<number, { mobs: string[]; boss: string; mult: number; box: string; ores: string[] }> = {
  1: { mobs: ['bat', 'slime', 'skeleton'], boss: 'golem', mult: 1, box: 'box_wood', ores: ['ore_coal', 'ore_iron'] },
  2: { mobs: ['golem', 'mummy', 'shade', 'skeleton'], boss: 'crab_king', mult: 1.8, box: 'box_iron', ores: ['ore_iron', 'ore_gold', 'ore_sulfur'] },
  3: { mobs: ['imp', 'mummy', 'shade', 'golem'], boss: 'demon_lord', mult: 3, box: 'box_gold', ores: ['ore_gold', 'crystal', 'meteor_rock'] },
};

export interface Pt {
  tx: number;
  ty: number;
}

/** ข้อมูลผังที่สร้างได้ (ใช้วางของ/มอน/NPC ใน GameScene) */
export interface InteriorLayout {
  index: number;
  /** จุดเกิดเมื่อเข้ามา */
  entry: Pt;
  /** ประตู/บันไดออก (กลับเกาะ) */
  exit: Pt;
  /** ดันเจี้ยน: ห้องทั้งหมด (จุดกลาง + ขนาด) ห้องแรก = ทางเข้า, boss = ห้องไกลสุด */
  rooms: { cx: number; cy: number; w: number; h: number }[];
  boss?: Pt;
  chests: Pt[];
  ores: (Pt & { type: string })[];
  torches: Pt[];
}

/** ผ้าใบสำหรับวาดพื้นในช่อง (พิกัดภายในช่อง 0..S-1) */
export interface SlotCanvas {
  S: number;
  set(x: number, y: number, t: number): void;
  get(x: number, y: number): number;
}

const emptyLayout = (index: number): InteriorLayout => ({ index, entry: { tx: 0, ty: 0 }, exit: { tx: 0, ty: 0 }, rooms: [], chests: [], ores: [], torches: [] });

/** ขอบหนา 3 ช่องเป็นผนังหิน */
function border(c: SlotCanvas, th = 3) {
  for (let y = 0; y < c.S; y++) for (let x = 0; x < c.S; x++) if (x < th || y < th || x >= c.S - th || y >= c.S - th) c.set(x, y, TILE.ROCKWALL);
}

// ======================================================================
// ดันเจี้ยน: ห้อง 4×4 เชื่อมด้วยทางเดิน (ต้นไม้ครอบคลุม + ทางลัดสุ่ม) · ห้องไกลสุด = ห้องบอส
// ======================================================================
export function genDungeon(c: SlotCanvas, def: InteriorDef, seed: number): InteriorLayout {
  const rng = new RNG(seed);
  const L = emptyLayout(def.index);
  const S = c.S;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) c.set(x, y, TILE.ROCKWALL);
  const N = 4;
  const cell = Math.floor((S - 8) / N);
  const rooms: { cx: number; cy: number; w: number; h: number }[] = [];
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const w = rng.int(14, cell - 8);
      const h = rng.int(12, cell - 8);
      const cx = 4 + gx * cell + Math.floor(cell / 2) + rng.int(-3, 3);
      const cy = 4 + gy * cell + Math.floor(cell / 2) + rng.int(-3, 3);
      rooms.push({ cx, cy, w, h });
    }
  }
  const carveRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (x > 3 && y > 3 && x < S - 4 && y < S - 4) c.set(x, y, TILE.CAVE);
  };
  // ห้องทรงมนเล็กน้อย
  for (const r of rooms) {
    for (let y = -Math.floor(r.h / 2); y <= Math.floor(r.h / 2); y++) {
      for (let x = -Math.floor(r.w / 2); x <= Math.floor(r.w / 2); x++) {
        const nx = x / (r.w / 2);
        const ny = y / (r.h / 2);
        if (nx * nx * nx * nx + ny * ny * ny * ny <= 1 - rng.next() * 0.08) carveRect(r.cx + x, r.cy + y, r.cx + x, r.cy + y);
      }
    }
  }
  // ทางเดิน: DFS ต้นไม้ครอบคลุม + ทางลัด 3 ทาง
  const idx = (gx: number, gy: number) => gy * N + gx;
  const seen = new Set<number>([0]);
  const stack = [0];
  const links: [number, number][] = [];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const gx = cur % N;
    const gy = Math.floor(cur / N);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [gx + dx, gy + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !seen.has(idx(x, y)));
    if (!nb.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = rng.pick(nb);
    seen.add(idx(nx, ny));
    links.push([cur, idx(nx, ny)]);
    stack.push(idx(nx, ny));
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.int(0, N * N - 1);
    const b = a % N < N - 1 ? a + 1 : a + N < N * N ? a + N : a - 1;
    links.push([a, b]);
  }
  for (const [a, b] of links) {
    const A = rooms[a];
    const B = rooms[b];
    const half = 1; // กว้าง 3 ช่อง
    if (rng.chance(0.5)) {
      carveRect(A.cx, A.cy - half, B.cx, A.cy + half);
      carveRect(B.cx - half, A.cy, B.cx + half, B.cy);
    } else {
      carveRect(A.cx - half, A.cy, A.cx + half, B.cy);
      carveRect(A.cx, B.cy - half, B.cx, B.cy + half);
    }
  }
  // ห้องบอส = ห้องที่ไกลจากห้องแรกที่สุด (ตามจำนวนทางเดินบนกราฟ)
  const dist = new Array(N * N).fill(Infinity);
  dist[0] = 0;
  const q = [0];
  while (q.length) {
    const cur = q.shift()!;
    for (const [a, b] of links) {
      const n = a === cur ? b : b === cur ? a : -1;
      if (n >= 0 && dist[n] === Infinity) {
        dist[n] = dist[cur] + 1;
        q.push(n);
      }
    }
  }
  const bossI = dist.indexOf(Math.max(...dist.filter((d) => d < Infinity)));
  // ห้องบอสใหญ่ขึ้น
  const BR = rooms[bossI];
  carveRect(BR.cx - 10, BR.cy - 8, BR.cx + 10, BR.cy + 8);
  L.rooms = rooms;
  L.entry = { tx: rooms[0].cx, ty: rooms[0].cy + 2 };
  L.exit = { tx: rooms[0].cx, ty: rooms[0].cy - 3 };
  L.boss = { tx: BR.cx, ty: BR.cy };
  const tier = def.tier ?? 1;
  const conf = DUNGEON_MOBS[tier];
  rooms.forEach((r, i) => {
    // คบไฟตามมุมห้อง
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const tx = r.cx + dx * Math.floor(r.w / 2 - 2);
      const ty = r.cy + dy * Math.floor(r.h / 2 - 2);
      if (c.get(tx, ty) === TILE.CAVE && rng.chance(0.7)) L.torches.push({ tx, ty });
    }
    if (i === 0) return;
    if (i === bossI || rng.chance(0.4)) L.chests.push({ tx: r.cx + rng.int(-3, 3), ty: r.cy + rng.int(-2, 2) });
    for (let k = 0; k < rng.int(1, 3); k++) {
      const tx = r.cx + rng.int(-Math.floor(r.w / 2) + 2, Math.floor(r.w / 2) - 2);
      const ty = r.cy + rng.int(-Math.floor(r.h / 2) + 2, Math.floor(r.h / 2) - 2);
      if (c.get(tx, ty) === TILE.CAVE) L.ores.push({ tx, ty, type: rng.pick(conf.ores) });
    }
  });
  border(c);
  return L;
}
