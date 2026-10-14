import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { TERRAIN_COUNT, TILE } from '../../world/tiles';

export const VARIANTS = 4;

/** hash คงที่ต่อพิกัด — ใช้เลือกแบบไทล์/ลวดลายให้เหมือนเดิมทุกครั้ง */
export const hash2 = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function speckle(c: PixelCanvas, rng: RNG, color: string, density: number) {
  for (let n = 0; n < 256 * density; n++) c.set(rng.int(0, 15), rng.int(0, 15), color);
}

// ---------------- ถ้ำ / ดันเจี้ยน ----------------

const CAVE = ['#2e2729', '#3d3436', '#4a4042', '#5a4f4f', '#6e6362'];

/** ค่า noise เรียบแบบวนซ้ำทุก 16px (ไทล์ต่อกันไม่เห็นรอย) */
function wrapNoise(x: number, y: number, s: number, cell = 8) {
  const n = 16 / cell;
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = (x % cell) / cell;
  const fy = (y % cell) / cell;
  const at = (i: number, j: number) => hash2(((i % n) + n) % n, ((j % n) + n) % n, s);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const top = at(gx, gy) * (1 - sx) + at(gx + 1, gy) * sx;
  const bot = at(gx, gy + 1) * (1 - sx) + at(gx + 1, gy + 1) * sx;
  return top * (1 - sy) + bot * sy;
}

/** พื้นถ้ำ: หินเทาอมน้ำตาลเข้ม ไล่โทนนุ่ม ๆ + รอยแตก + กรวด */
function caveFloor(c: PixelCanvas, rng: RNG, v: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const n = wrapNoise(x, y, 40) * 0.65 + wrapNoise(x, y, 60 + v, 4) * 0.35 + dither(x, y) * 0.2;
      c.set(x, y, n > 0.74 ? CAVE[3] : n > 0.36 ? CAVE[2] : CAVE[1]);
    }
  }
  // รอยแตก (มีขอบสว่างด้านล่างให้ดูเป็นร่อง)
  if (v === 1 || v === 2) {
    let x = rng.int(2, 12);
    let y = rng.int(3, 12);
    const dir = v === 1 ? 1 : -1;
    for (let i = 0; i < rng.int(5, 9); i++) {
      c.set(x, y, CAVE[0]);
      if (i === 2) c.set(x - dir, y + 1, CAVE[0]); // แตกแขนง
      x += dir;
      if (rng.chance(0.45)) y += rng.pick([-1, 1]);
      if (x < 0 || x > 15 || y < 0 || y > 15) break;
    }
  }
  // กรวดเล็ก ๆ
  for (let i = 0; i < 1 + (v === 3 ? 3 : v === 0 ? 2 : 0); i++) {
    const x = rng.int(1, 13);
    const y = rng.int(1, 13);
    if (rng.chance(0.5)) {
      c.set(x, y, CAVE[4]);
      c.set(x + 1, y, CAVE[3]);
      c.set(x, y + 1, CAVE[1]);
      c.set(x + 1, y + 1, CAVE[0]);
    } else {
      c.set(x, y, CAVE[3]);
      c.set(x, y + 1, CAVE[0]);
    }
  }
  if (v === 0) {
    // ก้อนหินแบนฝังพื้น
    const x = rng.int(3, 10);
    const y = rng.int(3, 10);
    c.rect(x, y, 3, 2, CAVE[3]);
    c.rect(x, y, 2, 1, CAVE[4]);
    c.rect(x, y + 2, 3, 1, CAVE[0]);
    c.set(x + 3, y + 1, CAVE[0]);
  }
}

const ROCK = ['#17141a', '#241f27', '#312a33', '#40373f', '#54494f', '#6d6067'];

/** ผนังหินถ้ำ/หน้าผา มองจากบน: ก้อนหินขรุขระ ขอบบนซ้ายสว่าง ร่องมืด (v1 มอส, v3 คริสตัล) */
function rockWall(c: PixelCanvas, rng: RNG, v: number) {
  // จุดศูนย์กลางก้อนหิน (แบบ Worley วนซ้ำ 16px)
  const pts: [number, number][] = [];
  const n = 3 + (v % 2);
  for (let i = 0; i < n; i++) pts.push([rng.range(0, 16), rng.range(0, 16)]);
  const id: number[] = [];
  const shade: number[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let d1 = 99;
      let d2 = 99;
      let best = 0;
      let near: [number, number] = pts[0];
      pts.forEach(([px, py], i) => {
        for (const ox of [-16, 0, 16]) {
          for (const oy of [-16, 0, 16]) {
            const d = Math.hypot(x + 0.5 - (px + ox), y + 0.5 - (py + oy));
            if (d < d1) {
              d2 = d1;
              d1 = d;
              best = i;
              near = [px + ox, py + oy];
            } else if (d < d2) d2 = d;
          }
        }
      });
      // แรเงาแต่ละก้อนเป็นทรงโดม (แสงจากซ้ายบน)
      const R = (d1 + d2) / 2;
      const nx = (x + 0.5 - near[0]) / R;
      const ny = (y + 0.5 - near[1]) / R;
      const lit = -(nx * 0.55 + ny * 0.8) * 0.7 + (1 - (d1 / R) ** 2) * 0.25 + (wrapNoise(x, y, 80, 4) - 0.5) * 0.3 + dither(x, y) * 0.25 - 0.1;
      id.push(best);
      shade.push(lit > 0.42 ? 4 : lit > 0.12 ? 3 : lit > -0.2 ? 2 : 1);
    }
  }
  const idAt = (x: number, y: number) => id[(((y % 16) + 16) % 16) * 16 + (((x % 16) + 16) % 16)];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const me = idAt(x, y);
      let idx = shade[y * 16 + x];
      if (idAt(x + 1, y) !== me || idAt(x, y + 1) !== me) idx = 0; // ร่องระหว่างก้อน (1px)
      else if (idAt(x - 1, y) !== me || idAt(x, y - 1) !== me) idx = 5; // ขอบรับแสงด้านซ้ายบน
      else if (idAt(x + 1, y + 1) !== me || idAt(x, y + 2) !== me) idx = 1; // เงาใต้ก้อน
      c.set(x, y, ROCK[idx]);
    }
  }
  // รอยแตกเล็กบนก้อน
  for (let i = 0; i < 2; i++) {
    const x = rng.int(2, 12);
    const y = rng.int(2, 12);
    if (c.get(x, y) === ROCK[0]) continue;
    c.set(x, y, ROCK[1]);
    c.set(x + 1, y + 1, ROCK[1]);
    c.set(x + 1, y, ROCK[4]);
  }
  if (v === 1) {
    // มอส: เกาะตามขอบบนของก้อน
    for (let i = 0; i < 7; i++) {
      const x = rng.int(0, 15);
      const y = rng.int(0, 15);
      if (c.get(x, y) === ROCK[5] || c.get(x, y) === ROCK[4]) {
        c.set(x, y, 'H');
        if (rng.chance(0.5)) c.set(x + 1, y, 'G');
      }
    }
  } else if (v === 3) {
    // คริสตัลฝังหิน
    const x = rng.int(4, 10);
    const y = rng.int(4, 10);
    c.set(x, y, 'C');
    c.set(x, y + 1, 'b');
    c.set(x + 1, y + 1, 'B');
    c.set(x, y + 2, ROCK[0]);
    c.set(x + 1, y + 2, ROCK[0]);
  } else if (v === 2) {
    // จุดแร่ระยิบ
    c.set(rng.int(2, 13), rng.int(2, 13), ROCK[5]);
    c.set(rng.int(2, 13), rng.int(2, 13), '#a99a7a');
  }
}

/**
 * ไทล์พื้น TERRAIN_COUNT ชนิด × 4 แบบ (ลำดับ: terrain*4 + variant)
 * frame = 0/1 — น้ำต่างกันระหว่างสองเฟรมเพื่อทำคลื่นเคลื่อนไหว
 */
export function groundTiles(frame: number): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  for (let terrain = 0; terrain < TERRAIN_COUNT; terrain++) {
    for (let v = 0; v < VARIANTS; v++) {
      const rng = new RNG(1000 + terrain * 31 + v * 7 + (terrain <= 1 ? frame * 101 : 0));
      const c = new PixelCanvas(16, 16);
      switch (terrain) {
        case TILE.DEEP:
          c.rect(0, 0, 16, 16, 'U');
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (dither(x + v, y) > 0.38) c.set(x, y, 'B');
          for (let i = 0; i < 2; i++) c.rect((rng.int(0, 10) + frame * 2) % 12, rng.int(1, 14), rng.int(3, 5), 1, 'b');
          break;
        case TILE.SHALLOW:
          c.rect(0, 0, 16, 16, 'B');
          speckle(c, rng, 'b', 0.12);
          for (let i = 0; i < 3; i++) c.rect(rng.int(0, 13), rng.int(0, 15), 2 + frame, 1, frame ? 'C' : 'b');
          break;
        case TILE.SAND:
          c.rect(0, 0, 16, 16, 'S');
          speckle(c, rng, 's', 0.1);
          speckle(c, rng, 'Y', 0.03);
          if (v === 3) for (let x = 1; x < 15; x++) c.set(x, 7 + Math.round(Math.sin(x * 0.7) * 1.2), 's');
          break;
        case TILE.GRASS:
          c.rect(0, 0, 16, 16, 'G');
          for (let i = 0; i < 9 + v * 2; i++) {
            const x = rng.int(0, 15);
            const y = rng.int(1, 15);
            c.set(x, y, 'H');
            c.set(x, y - 1, rng.chance(0.4) ? 'g' : 'H');
          }
          speckle(c, rng, 'g', 0.03);
          break;
        case TILE.FOREST:
          c.rect(0, 0, 16, 16, 'H');
          speckle(c, rng, 'T', 0.12);
          speckle(c, rng, 'G', 0.05);
          speckle(c, rng, 'V', 0.03);
          break;
        case TILE.SNOW:
          c.rect(0, 0, 16, 16, 'W');
          speckle(c, rng, 'w', 0.14);
          speckle(c, rng, 'L', 0.03);
          if (v === 2) c.set(rng.int(2, 13), rng.int(2, 13), 'C');
          break;
        case TILE.DESERT:
          c.rect(0, 0, 16, 16, '#e3a95f');
          speckle(c, rng, '#c98a48', 0.1);
          speckle(c, rng, 'Y', 0.04);
          if (v >= 2) for (let x = 0; x < 16; x++) c.set(x, 5 + v * 2 + Math.round(Math.sin(x * 0.5 + v) * 1.4), '#c98a48');
          break;
        case TILE.STONE:
          c.rect(0, 0, 16, 16, 'D');
          speckle(c, rng, 'L', 0.1);
          speckle(c, rng, 'F', 0.08);
          c.line(rng.int(0, 8), rng.int(0, 15), rng.int(8, 15), rng.int(0, 15), 'F');
          break;
        case TILE.BRICK:
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const row = Math.floor(y / 4);
              const off = row % 2 ? 4 : 0;
              const mortar = y % 4 === 3 || (x + off) % 8 === 7;
              const tone = hash2(Math.floor((x + off) / 8) + v * 3, row) > 0.5 ? 'L' : '#a9b8c6';
              c.set(x, y, mortar ? 'D' : y % 4 === 0 ? 'W' : tone);
            }
          }
          break;
        case TILE.PLANK_H:
        case TILE.PLANK_V:
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const a = terrain === TILE.PLANK_H ? x : y;
              const b = terrain === TILE.PLANK_H ? y : x;
              const gap = a % 4 === 3;
              c.set(x, y, gap ? 'm' : a % 4 === 0 ? 'N' : hash2(Math.floor(a / 4), b + v) > 0.85 ? 'm' : 'M');
            }
          }
          break;
        case TILE.ASH:
          c.rect(0, 0, 16, 16, '#3a3346');
          speckle(c, rng, 'F', 0.14);
          speckle(c, rng, '#4d4459', 0.1);
          if (v >= 2) c.set(rng.int(1, 14), rng.int(1, 14), 'r');
          break;
        case TILE.CAVE:
          caveFloor(c, rng, v);
          break;
        case TILE.ROCKWALL:
          rockWall(c, rng, v);
          break;
        default: // DIRT
          c.rect(0, 0, 16, 16, 'M');
          speckle(c, rng, 'm', 0.12);
          speckle(c, rng, 'N', 0.06);
      }
      out.push(c);
    }
  }
  // ผิวพื้นตามไบโอม (ต่อท้าย: index = SKIN.x * VARIANTS + variant)
  for (let k = 0; k < SKIN_COUNT; k++) {
    for (let v = 0; v < VARIANTS; v++) {
      const id = TERRAIN_COUNT + k;
      const water = id === SKIN.SWAMP_WATER || id === SKIN.LAGOON;
      const rng = new RNG(5000 + k * 37 + v * 11 + (water ? frame * 101 : 0));
      const c = new PixelCanvas(16, 16);
      paintSkin(id, c, rng, v, frame);
      out.push(c);
    }
  }
  return out;
}

/**
 * ผิวพื้นตามไบโอม — วาดเป็นไทล์เพิ่มต่อท้ายชุดพื้น (ไม่ใช่ TILE ใหม่: ข้อมูลโลก/การชน/มินิแมปยังเป็น TILE เดิม)
 * ChunkRenderer เลือกผิวจาก skinFor(ไบโอมของช่อง, TILE)
 */
export const SKIN = {
  MUD: TERRAIN_COUNT, SWAMP_GRASS: TERRAIN_COUNT + 1, SWAMP_FOREST: TERRAIN_COUNT + 2, SWAMP_WATER: TERRAIN_COUNT + 3,
  MYCEL: TERRAIN_COUNT + 4, MYCEL_FOREST: TERRAIN_COUNT + 5, SHARDS: TERRAIN_COUNT + 6, CRYSTAL_ROCK: TERRAIN_COUNT + 7,
  BAMBOO: TERRAIN_COUNT + 8, BAMBOO_FOREST: TERRAIN_COUNT + 9, SAVANNA: TERRAIN_COUNT + 10, RED_EARTH: TERRAIN_COUNT + 11,
  ICE: TERRAIN_COUNT + 12, CORAL_SAND: TERRAIN_COUNT + 13, LAGOON: TERRAIN_COUNT + 14, GHOST_GRASS: TERRAIN_COUNT + 15, GHOST_FOREST: TERRAIN_COUNT + 16,
} as const;
const SKIN_COUNT = 17;

const SKIN_MAP: Record<string, Partial<Record<number, number>>> = {
  swamp: { [TILE.DIRT]: SKIN.MUD, [TILE.GRASS]: SKIN.SWAMP_GRASS, [TILE.FOREST]: SKIN.SWAMP_FOREST, [TILE.SHALLOW]: SKIN.SWAMP_WATER },
  mushroom: { [TILE.GRASS]: SKIN.MYCEL, [TILE.FOREST]: SKIN.MYCEL_FOREST },
  crystal: { [TILE.GRASS]: SKIN.SHARDS, [TILE.STONE]: SKIN.CRYSTAL_ROCK },
  bamboo: { [TILE.GRASS]: SKIN.BAMBOO, [TILE.FOREST]: SKIN.BAMBOO_FOREST },
  savanna: { [TILE.GRASS]: SKIN.SAVANNA, [TILE.DIRT]: SKIN.RED_EARTH, [TILE.FOREST]: SKIN.SAVANNA },
  glacier: { [TILE.ASH]: SKIN.ICE },
  atoll: { [TILE.SAND]: SKIN.CORAL_SAND, [TILE.SHALLOW]: SKIN.LAGOON },
  haunted: { [TILE.GRASS]: SKIN.GHOST_GRASS, [TILE.FOREST]: SKIN.GHOST_FOREST },
};

/** ผิวพื้นของ tile ในไบโอมนี้ (-1 = ใช้ไทล์ปกติ) */
export function skinFor(biome: string | undefined, tile: number): number {
  if (!biome) return -1;
  return SKIN_MAP[biome]?.[tile] ?? -1;
}
/** ไบโอมนี้เปลี่ยนสีหญ้า (ไม่ต้องวาดขอบหญ้าเขียวทับ) */
export const skinsGrass = (biome: string | undefined) => !!biome && SKIN_MAP[biome]?.[TILE.GRASS] !== undefined;

/** พื้นเรียบ + จุดสี + เส้นหญ้า (ใช้กับผิวพื้นหญ้าแบบต่างๆ) */
function turf(c: PixelCanvas, rng: RNG, v: number, base: string, blade: string, tip: string, spot: string, density = 0.03) {
  c.rect(0, 0, 16, 16, base);
  for (let i = 0; i < 9 + v * 2; i++) {
    const x = rng.int(0, 15);
    const y = rng.int(1, 15);
    c.set(x, y, blade);
    c.set(x, y - 1, rng.chance(0.4) ? tip : blade);
  }
  speckle(c, rng, spot, density);
}

function paintSkin(id: number, c: PixelCanvas, rng: RNG, v: number, frame: number) {
  switch (id) {
    case SKIN.MUD:
      c.rect(0, 0, 16, 16, '#4a3a24');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (wrapNoise(x, y, 70 + v) > 0.62) c.set(x, y, '#5d4a2c');
      speckle(c, rng, '#33281a', 0.08);
      if (v >= 2) c.ellipse(rng.int(4, 11), rng.int(4, 11), 2.5, 1.5, '#3c5a4a'); // แอ่งน้ำขัง
      if (v === 3) c.set(rng.int(3, 12), rng.int(3, 12), '#8fa86a');
      break;
    case SKIN.SWAMP_GRASS:
      turf(c, rng, v, '#4e6b2e', '#3b5524', '#7f9a46', '#6b5a32', 0.05);
      break;
    case SKIN.SWAMP_FOREST:
      c.rect(0, 0, 16, 16, '#344a22');
      speckle(c, rng, '#263a1a', 0.14);
      speckle(c, rng, '#4e6b2e', 0.06);
      speckle(c, rng, '#5d4a2c', 0.03);
      break;
    case SKIN.SWAMP_WATER:
      c.rect(0, 0, 16, 16, '#3c5a4a');
      speckle(c, rng, '#2f4a3c', 0.12);
      for (let i = 0; i < 2; i++) c.rect(rng.int(0, 13), rng.int(0, 15), 2 + frame, 1, frame ? '#6f8f5a' : '#4f7058');
      if (v === 1) c.ellipse(rng.int(4, 11), rng.int(4, 11), 1.6, 1.1, '#5f8a3a'); // จอกแหน
      break;
    case SKIN.MYCEL:
      turf(c, rng, v, '#5b4a73', '#4a3a60', '#9b7fc4', '#7a6a90', 0.04);
      if (v === 2) c.set(rng.int(2, 13), rng.int(2, 13), '#d9b8ff');
      break;
    case SKIN.MYCEL_FOREST:
      c.rect(0, 0, 16, 16, '#3f3155');
      speckle(c, rng, '#2e2340', 0.14);
      speckle(c, rng, '#6a5590', 0.06);
      if (v >= 2) c.set(rng.int(1, 14), rng.int(1, 14), '#c9a6ff');
      break;
    case SKIN.SHARDS:
      c.rect(0, 0, 16, 16, '#6e6a8a');
      speckle(c, rng, '#5a5675', 0.12);
      for (let i = 0; i < 2 + (v % 2); i++) {
        const x = rng.int(2, 12);
        const y = rng.int(3, 13);
        c.set(x, y, '#e0d0ff');
        c.set(x, y + 1, '#a98be8');
        c.set(x + 1, y + 1, '#7b5cc0');
      }
      if (v === 3) c.set(rng.int(1, 14), rng.int(1, 14), '#73eff7');
      break;
    case SKIN.CRYSTAL_ROCK:
      c.rect(0, 0, 16, 16, '#4b4766');
      speckle(c, rng, '#8a7fb5', 0.1);
      speckle(c, rng, '#33304a', 0.08);
      c.line(rng.int(0, 8), rng.int(0, 15), rng.int(8, 15), rng.int(0, 15), '#c8a8ff');
      break;
    case SKIN.BAMBOO:
      turf(c, rng, v, '#7cc35a', '#5aa548', '#c4ef8a', '#ffc9d6', 0.02);
      break;
    case SKIN.BAMBOO_FOREST:
      c.rect(0, 0, 16, 16, '#4f9a45');
      speckle(c, rng, '#3b7a38', 0.14);
      speckle(c, rng, '#9ad66a', 0.05);
      if (v === 1) c.set(rng.int(1, 14), rng.int(1, 14), '#ffb3c6'); // กลีบซากุระ
      break;
    case SKIN.SAVANNA:
      turf(c, rng, v, '#c9a548', '#a8842f', '#ead27a', '#8f6a2a', 0.03);
      break;
    case SKIN.RED_EARTH:
      c.rect(0, 0, 16, 16, '#a0592f');
      speckle(c, rng, '#844422', 0.12);
      speckle(c, rng, '#c47a45', 0.06);
      if (v >= 2) c.line(rng.int(0, 6), rng.int(2, 13), rng.int(9, 15), rng.int(2, 13), '#6e3a1c');
      break;
    case SKIN.ICE:
      c.rect(0, 0, 16, 16, '#a9d8f0');
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (wrapNoise(x, y, 90 + v) > 0.6) c.set(x, y, '#c8ecff');
      c.line(rng.int(0, 7), rng.int(0, 15), rng.int(8, 15), rng.int(0, 15), '#7fb6d8');
      c.set(rng.int(2, 13), rng.int(2, 6), 'W');
      c.set(rng.int(2, 13), rng.int(2, 6), 'W');
      break;
    case SKIN.CORAL_SAND:
      c.rect(0, 0, 16, 16, '#f2e3c4');
      speckle(c, rng, '#e0c9a0', 0.1);
      speckle(c, rng, '#ff9fb0', 0.02);
      if (v === 2) c.set(rng.int(2, 13), rng.int(2, 13), '#ff7f6a');
      break;
    case SKIN.LAGOON:
      c.rect(0, 0, 16, 16, '#3fc4d0');
      speckle(c, rng, '#5ce1e6', 0.12);
      for (let i = 0; i < 3; i++) c.rect(rng.int(0, 13), rng.int(0, 15), 2 + frame, 1, frame ? '#c8fbff' : '#8af0f5');
      break;
    case SKIN.GHOST_GRASS:
      turf(c, rng, v, '#4c5a5a', '#3a4646', '#7a8a86', '#5d5a70', 0.04);
      break;
    default: // GHOST_FOREST
      c.rect(0, 0, 16, 16, '#323c3e');
      speckle(c, rng, '#252d30', 0.14);
      speckle(c, rng, '#4c5a5a', 0.06);
      if (v === 2) c.set(rng.int(1, 14), rng.int(1, 14), '#9aa4c0');
  }
}

/** bit ของด้านที่ติดกับอีกชนิด: N=1 E=2 S=4 W=8 */
type EdgePainter = (c: PixelCanvas, x: number, y: number, d: number, side: number) => void;

function edgeSet(paint: EdgePainter, depth: number): PixelCanvas[] {
  const out: PixelCanvas[] = [];
  for (let mask = 0; mask < 16; mask++) {
    const c = new PixelCanvas(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const dists: [number, number][] = [];
        if (mask & 1) dists.push([y, 1]);
        if (mask & 2) dists.push([15 - x, 2]);
        if (mask & 4) dists.push([15 - y, 4]);
        if (mask & 8) dists.push([x, 8]);
        let best: [number, number] | null = null;
        for (const d of dists) if (!best || d[0] < best[0]) best = d;
        if (best && best[0] < depth) paint(c, x, y, best[0], best[1]);
      }
    }
    out.push(c);
  }
  return out;
}

/**
 * ไทล์ขอบซ้อนทับ 4 ชุด × 16 mask:
 *   0–15  ฟองคลื่นบนน้ำที่ติดฝั่ง (2 เฟรม)
 *   16–31 ทรายเปียกริมน้ำ
 *   32–47 ขอบป่าบนพื้นหญ้า
 *   48–63 ขอบหญ้าบนพื้นทราย
 */
export function edgeTiles(frame: number): PixelCanvas[] {
  const along = (x: number, y: number, side: number) => (side === 1 || side === 4 ? x : y);
  const foam = edgeSet((c, x, y, d, side) => {
    const a = along(x, y, side) + frame * 3;
    if (d === 0) c.set(x, y, (a + side) % 5 === 0 ? 'C' : 'W');
    else if (d === 1 && (a + d * 2) % 4 !== 0) c.set(x, y, 'w');
    else if (d === 2 && (a + frame) % 3 === 0) c.set(x, y, 'C');
    else if (d === 3 && hash2(a, side, frame) > 0.75) c.set(x, y, 'b');
  }, 4);
  const wet = edgeSet((c, x, y, d) => {
    if (d === 0 || (d === 1 && dither(x, y) > -0.25) || (d === 2 && dither(x, y) > 0.25)) c.set(x, y, 's');
  }, 3);
  const forest = edgeSet((c, x, y, d, side) => {
    const a = along(x, y, side);
    const reach = 1 + Math.floor(hash2(a, side, 7) * 3);
    if (d < reach) c.set(x, y, d === reach - 1 && hash2(a, d, 3) > 0.5 ? 'T' : 'H');
  }, 4);
  const grass = edgeSet((c, x, y, d, side) => {
    const a = along(x, y, side);
    const reach = 1 + Math.floor(hash2(a, side, 11) * 3);
    if (d < reach) c.set(x, y, d === 0 ? 'H' : 'G');
    else if (d === reach && hash2(a, side, 5) > 0.6) c.set(x, y, 'g');
  }, 5);
  return [...foam, ...wet, ...forest, ...grass];
}

export const EDGE = { FOAM: 0, WET: 16, FOREST: 32, GRASS: 48 } as const;
