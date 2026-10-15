import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';
import { TERRAIN_COUNT, TILE } from '../../world/tiles';
import { WP } from '../palette';

export const VARIANTS = 4;

/** hash คงที่ต่อพิกัด — ใช้เลือกแบบไทล์/ลวดลายให้เหมือนเดิมทุกครั้ง */
export const hash2 = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// สไตล์พื้น: สีเรียบเป็นผืนใหญ่ noise ต่ำ + ลายหญ้า/รอยแตกประปราย (ไม่โรยจุดทั้งผืน)

/** กอหญ้าเล็ก 5×2 (ลาย "ᴪ") */
function tuftMark(c: PixelCanvas, x: number, y: number, col: string) {
  c.set(x, y, col);
  c.set(x + 2, y - 1, col);
  c.set(x + 4, y, col);
  c.rect(x + 1, y + 1, 3, 1, col);
}

/** ลายเล็กประปราย n จุด เว้นขอบไทล์ (ต่อกันไม่เห็นรอย) */
function marks(rng: RNG, n: number, fn: (x: number, y: number) => void) {
  for (let i = 0; i < n; i++) fn(rng.int(1, 10), rng.int(2, 12));
}

/** พื้นเรียบ + กอหญ้าประปราย (ใช้ทั้งหญ้าปกติและผิวพื้นตามไบโอม) */
function turf(c: PixelCanvas, rng: RNG, v: number, base: string, dark: string, light: string, accent?: string) {
  c.rect(0, 0, 16, 16, base);
  const n = [1, 2, 0, 1][v];
  marks(rng, n, (x, y) => tuftMark(c, x, y, dark));
  if (v === 3) marks(rng, 1, (x, y) => tuftMark(c, x, y, light));
  if (v === 2) {
    const x = rng.int(3, 11);
    const y = rng.int(3, 11);
    c.set(x, y, light);
    c.set(x + 1, y + 1, light);
    if (accent) c.set(x + 5 > 14 ? x - 4 : x + 4, y + 2, accent);
  }
}

/** แผ่นหินลายข้าวหลามตัด (พื้นดันเจี้ยน/ซากโบราณ) — สองโทนสลับ ร่องนุ่ม ขอบรับแสงซ้ายบน */
function diamondFloor(c: PixelCanvas, rng: RNG, v: number, main: string, alt: string, light: string, grout: string) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      let col = d < 7.5 ? main : d < 8.5 ? grout : alt;
      // ขอบรับแสง (ด้านบนซ้ายของแต่ละแผ่น)
      if (d >= 6.5 && d < 7.5 && x + y < 15) col = light;
      if (d >= 8.5 && d < 9.5 && x + y > 15) col = light;
      c.set(x, y, col);
    }
  }
  if (v === 1 || v === 2) {
    // รอยร้าวบาง ๆ บนแผ่น
    let x = rng.int(5, 8);
    let y = rng.int(4, 7);
    for (let i = 0; i < 5; i++) {
      c.set(x, y, grout);
      x += v === 1 ? 1 : -1;
      if (rng.chance(0.5)) y++;
    }
  }
  if (v === 3) {
    // แผ่นบิ่น
    c.set(7, 3, grout);
    c.set(8, 3, grout);
    c.set(8, 4, alt);
  }
}

/** ผิวบนกำแพงหิน (มองจากบน): บล็อกใหญ่สลับแนว + ขอบรับแสง */
function wallTop(c: PixelCanvas, rng: RNG, v: number) {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 8);
      const off = row % 2 ? 4 : 0;
      const bx = (x + off) % 8;
      const by = y % 8;
      let col: string = WP.wallTop;
      if (by === 7 || bx === 7) col = WP.wallLine;
      else if (by === 0 || bx === 0) col = WP.wallTopLight;
      c.set(x, y, col);
    }
  }
  if (v === 1) {
    // มอสเกาะ
    for (let i = 0; i < 4; i++) {
      const x = rng.int(1, 13);
      const y = rng.int(1, 13);
      c.set(x, y, WP.forestDark);
      c.set(x + 1, y, WP.forest);
    }
  } else if (v === 3) {
    // คริสตัลฝัง
    const x = rng.int(3, 10);
    const y = rng.int(3, 10);
    c.set(x, y, '#9fdce0');
    c.set(x, y + 1, '#5c9cc4');
    c.set(x + 1, y + 1, '#3a6694');
  }
}

/** แผ่นหินลานเมือง/ซาก: แผ่นใหญ่ 1 แผ่นต่อไทล์ (บางแบบแบ่งครึ่ง) ร่องด้านขวา/ล่าง ขอบรับแสงซ้าย/บน */
function squareSlabs(c: PixelCanvas, rng: RNG, v: number) {
  const tone = [WP.plaza, WP.plazaAlt, WP.plaza, WP.plazaAlt][v];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      // v1 = สองแผ่นแนวนอน · v3 = สองแผ่นแนวตั้ง
      const lx = v === 3 ? x % 8 : x;
      const ly = v === 1 ? y % 8 : y;
      const w = v === 3 ? 8 : 16;
      const h = v === 1 ? 8 : 16;
      c.set(x, y, lx === w - 1 || ly === h - 1 ? WP.plazaGrout : lx === 0 || ly === 0 ? WP.plazaLight : tone);
    }
  }
  if (v === 2) {
    const x = rng.int(3, 9);
    const y = rng.int(3, 9);
    c.line(x, y, x + 3, y + 2, WP.plazaGrout);
    c.line(x + 3, y + 2, x + 4, y + 5, WP.plazaGrout);
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
      const rng = new RNG(1000 + terrain * 31 + v * 7);
      const c = new PixelCanvas(16, 16);
      switch (terrain) {
        case TILE.DEEP: {
          // ทะเลลึกกรมท่า + ขีดคลื่นประปราย (เลื่อนตามเฟรม)
          c.rect(0, 0, 16, 16, WP.deep);
          const n = [1, 0, 0, 1][v];
          for (let i = 0; i < n; i++) {
            const x = (rng.int(1, 9) + frame) % 12;
            const y = rng.int(2, 13);
            c.rect(x, y, 3, 1, WP.deepDash);
            c.set(x + 1, y - 1, WP.deepDash);
            if (v === 3) c.set(x + 1, y, WP.deepDashHi);
          }
          break;
        }
        case TILE.SHALLOW: {
          c.rect(0, 0, 16, 16, WP.shallow);
          const n = [1, 1, 2, 0][v];
          for (let i = 0; i < n; i++) {
            const x = (rng.int(1, 9) + frame) % 12;
            const y = rng.int(2, 13);
            c.rect(x, y, 3, 1, WP.shallowDash);
            c.set(x + 1, y - 1, frame ? WP.shallowHi : WP.shallowDash);
          }
          break;
        }
        case TILE.SAND:
          c.rect(0, 0, 16, 16, WP.sand);
          if (v === 0) marks(rng, 1, (x, y) => c.rect(x, y, 2, 1, WP.sandDark));
          if (v === 1) marks(rng, 1, (x, y) => tuftMark(c, x, y, WP.sandDark));
          if (v === 3) marks(rng, 1, (x, y) => {
            c.set(x, y, WP.sandLight);
            c.set(x + 3, y + 2, WP.sandDark);
          });
          break;
        case TILE.GRASS:
          turf(c, rng, v, WP.grass, WP.grassDark, WP.grassLight, '#f2f4ef');
          break;
        case TILE.FOREST:
          turf(c, rng, v, WP.forest, WP.forestDark, WP.forestLight);
          break;
        case TILE.SNOW:
          c.rect(0, 0, 16, 16, WP.snow);
          if (v === 0) marks(rng, 1, (x, y) => c.rect(x, y, 3, 1, WP.snowShade));
          if (v === 1) marks(rng, 1, (x, y) => tuftMark(c, x, y, WP.snowShade));
          if (v === 2) marks(rng, 1, (x, y) => {
            c.rect(x, y, 2, 1, WP.snowLight);
            c.rect(x, y + 1, 3, 1, WP.snowShade);
          });
          break;
        case TILE.DESERT:
          c.rect(0, 0, 16, 16, WP.desert);
          if (v === 1 || v === 3) marks(rng, 1, (x, y) => tuftMark(c, x, y, WP.desertDark));
          if (v === 2) marks(rng, 1, (x, y) => c.rect(x, y, 3, 1, WP.desertLight));
          break;
        case TILE.STONE:
          // ผิวบนหินยกสูง: สีเรียบ + รอยแตกสั้น ๆ
          c.rect(0, 0, 16, 16, WP.rock);
          if (v !== 3) {
            const x = rng.int(2, 9);
            const y = rng.int(3, 11);
            c.line(x, y, x + 2, y + 1, WP.rockDark);
            c.line(x + 2, y + 1, x + 3, y + 3, WP.rockDark);
            c.set(x, y + 1, WP.rockLight);
          }
          if (v === 1 || v === 3) marks(rng, 1, (x, y) => {
            c.rect(x, y, 2, 1, WP.rockLight);
            c.rect(x, y + 1, 2, 1, WP.rockDark);
          });
          break;
        case TILE.BRICK:
          squareSlabs(c, rng, v);
          break;
        case TILE.PLANK_H:
        case TILE.PLANK_V:
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const a = terrain === TILE.PLANK_H ? x : y;
              const b = terrain === TILE.PLANK_H ? y : x;
              const board = Math.floor(b / 4);
              const joint = (a + board * 5 + v * 3) % 16 === 0;
              let col: string = b % 4 === 3 || joint ? WP.plankGap : b % 4 === 0 ? WP.plankLight : WP.plank;
              if (col === WP.plank && hash2(Math.floor(a / 3), b + v * 7) > 0.88) col = WP.plankDark;
              c.set(x, y, col);
            }
          }
          break;
        case TILE.ASH:
          c.rect(0, 0, 16, 16, WP.ash);
          if (v === 0 || v === 2) marks(rng, 1, (x, y) => {
            c.line(x, y, x + 3, y + 1, WP.ashDark);
            c.set(x + 1, y + 1, WP.ashLight);
          });
          if (v === 3) marks(rng, 1, (x, y) => c.set(x, y, WP.ember));
          break;
        case TILE.CAVE:
          diamondFloor(c, rng, v, WP.slab, WP.slabAlt, WP.slabLight, WP.slabGrout);
          break;
        case TILE.ROCKWALL:
          wallTop(c, rng, v);
          break;
        default: // DIRT
          c.rect(0, 0, 16, 16, WP.dirt);
          if (v !== 2) marks(rng, 1, (x, y) => {
            c.rect(x, y, 2, 1, WP.dirtLight);
            c.rect(x, y + 1, 2, 1, WP.dirtDark);
          });
          if (v === 3) marks(rng, 1, (x, y) => c.set(x, y, WP.dirtDark));
      }
      out.push(c);
    }
  }
  // ผิวพื้นตามไบโอม (ต่อท้าย: index = SKIN.x * VARIANTS + variant)
  for (let k = 0; k < SKIN_COUNT; k++) {
    for (let v = 0; v < VARIANTS; v++) {
      const id = TERRAIN_COUNT + k;
      const rng = new RNG(5000 + k * 37 + v * 11);
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

function paintSkin(id: number, c: PixelCanvas, rng: RNG, v: number, frame: number) {
  switch (id) {
    case SKIN.MUD:
      c.rect(0, 0, 16, 16, '#5a4630');
      if (v >= 2) c.ellipse(rng.int(5, 10), rng.int(5, 10), 2.5, 1.5, '#3e5a52'); // แอ่งน้ำขัง
      if (v === 1) marks(rng, 1, (x, y) => c.rect(x, y, 2, 1, '#4a3926'));
      if (v === 3) marks(rng, 1, (x, y) => tuftMark(c, x, y, '#6e8a52'));
      break;
    case SKIN.SWAMP_GRASS:
      turf(c, rng, v, '#5c7f45', '#46673a', '#7f9e5a', '#c8b86a');
      break;
    case SKIN.SWAMP_FOREST:
      turf(c, rng, v, '#45683c', '#365431', '#5c7f45');
      break;
    case SKIN.SWAMP_WATER:
      c.rect(0, 0, 16, 16, '#3a5a50');
      if (v === 0 || v === 3) {
        const x = (rng.int(1, 9) + frame) % 12;
        c.rect(x, rng.int(2, 13), 3, 1, frame ? '#5f8262' : '#4c6c5a');
      }
      if (v === 1) c.ellipse(rng.int(4, 11), rng.int(4, 11), 1.6, 1.1, '#6f9a52'); // จอกแหน
      break;
    case SKIN.MYCEL:
      turf(c, rng, v, '#6e5a86', '#5a4872', '#9682b8', '#d9c4f0');
      break;
    case SKIN.MYCEL_FOREST:
      turf(c, rng, v, '#56466e', '#46395c', '#6e5a86', '#c9a6ff');
      break;
    case SKIN.SHARDS:
      turf(c, rng, v, '#7c7a98', '#686684', '#9896b2');
      for (let i = 0; i < (v % 2); i++) {
        const x = rng.int(3, 11);
        const y = rng.int(4, 11);
        c.set(x, y, '#e6dcff');
        c.set(x, y + 1, '#b09ae6');
        c.set(x + 1, y + 1, '#8064c0');
      }
      break;
    case SKIN.CRYSTAL_ROCK:
      c.rect(0, 0, 16, 16, '#6a6688');
      if (v !== 3) c.line(rng.int(2, 6), rng.int(3, 12), rng.int(9, 13), rng.int(3, 12), '#585476');
      if (v === 2) c.set(rng.int(3, 12), rng.int(3, 12), '#c8b4ff');
      break;
    case SKIN.BAMBOO:
      turf(c, rng, v, '#73b462', '#5a9a52', '#a2d486', '#f2c4d0');
      break;
    case SKIN.BAMBOO_FOREST:
      turf(c, rng, v, '#5a9a52', '#468048', '#73b462', '#f2c4d0');
      break;
    case SKIN.SAVANNA:
      turf(c, rng, v, '#d2b25a', '#b8963e', '#e6cd7e', '#c46a3e');
      break;
    case SKIN.RED_EARTH:
      c.rect(0, 0, 16, 16, '#b0683e');
      if (v !== 1) marks(rng, 1, (x, y) => {
        c.rect(x, y, 2, 1, '#c4804f');
        c.rect(x, y + 1, 2, 1, '#93552f');
      });
      if (v === 3) c.line(rng.int(1, 5), rng.int(3, 12), rng.int(9, 14), rng.int(3, 12), '#93552f');
      break;
    case SKIN.ICE:
      c.rect(0, 0, 16, 16, '#b4d8ea');
      if (v !== 2) c.line(rng.int(1, 6), rng.int(2, 13), rng.int(9, 14), rng.int(2, 13), '#93bfd6');
      if (v === 1 || v === 3) {
        const x = rng.int(2, 11);
        const y = rng.int(2, 9);
        c.rect(x, y, 3, 1, '#e4f2f8');
        c.set(x, y + 1, '#e4f2f8');
      }
      break;
    case SKIN.CORAL_SAND:
      c.rect(0, 0, 16, 16, '#f0e0c4');
      if (v === 1) marks(rng, 1, (x, y) => c.rect(x, y, 2, 1, '#dcc6a0'));
      if (v === 2) marks(rng, 1, (x, y) => c.set(x, y, '#f0a4a8'));
      break;
    case SKIN.LAGOON: {
      c.rect(0, 0, 16, 16, '#3a9cb0');
      const n = [1, 2, 0, 1][v];
      for (let i = 0; i < n; i++) {
        const x = (rng.int(1, 9) + frame) % 12;
        c.rect(x, rng.int(2, 13), 3, 1, frame ? '#a8e4ea' : '#6cc4d0');
      }
      break;
    }
    case SKIN.GHOST_GRASS:
      turf(c, rng, v, '#56656a', '#46545a', '#748286', '#9aa4c0');
      break;
    default: // GHOST_FOREST
      turf(c, rng, v, '#45525a', '#37434a', '#56656a', '#9aa4c0');
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
        // ด้านใต้ (หน้าผา) ได้สิทธิ์ก่อนตอนใกล้เท่ากัน
        if (mask & 4) dists.push([15 - y, 4]);
        if (mask & 1) dists.push([y, 1]);
        if (mask & 2) dists.push([15 - x, 2]);
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

const along = (x: number, y: number, side: number) => (side === 1 || side === 4 ? x : y);
/** หยักของขอบหน้าผา (0/1) — ซ้ำทุก 16px ให้ต่อกันได้ */
const notch = (a: number, side: number) => ((a + side * 3) % 8 < 3 ? 1 : 0);

/**
 * หน้าผา/ขอบที่ยกสูง (วาดบนไทล์ที่สูงกว่า · mask = ด้านที่ต่ำกว่า)
 * ใต้ = หน้าผาด้านข้างสูง face px มีลายแนวตั้ง · ด้านอื่น = เส้นขอบเข้มหยัก + ขอบรับแสง
 */
function cliffSet(face: number, faceCol: string, faceDark: string, faceLight: string, line: string) {
  return edgeSet((c, x, y, d, side) => {
    const a = along(x, y, side);
    if (side === 4) {
      const top = face + notch(a, side);
      if (d === 0) c.set(x, y, faceDark);
      else if (d < top) c.set(x, y, d === top - 1 ? faceLight : (a + Math.floor(d / 2)) % 5 === 0 ? faceDark : faceCol);
      else if (d === top) c.set(x, y, line);
      else if (d === top + 1) c.set(x, y, 'rgba(255,255,255,0.16)');
      return;
    }
    const o = notch(a, side);
    if (d < o) return;
    if (d === o) c.set(x, y, line);
    else if (d === o + 1) c.set(x, y, side === 2 ? 'rgba(10,20,24,0.14)' : 'rgba(255,255,255,0.14)');
  }, face + 3);
}

/** เงานุ่มบนพื้นต่ำที่ติดของสูง (ด้านเหนือเข้มสุด = เงาที่หน้าผาทอดลงมา) */
function shadeSet(strength: number, reach: number) {
  return edgeSet((c, x, y, d, side) => {
    const k = side === 1 ? 1 : 0.55;
    const a = strength * k * (1 - d / reach) + dither(x, y) * 0.04;
    if (a > 0.02) c.set(x, y, `rgba(14,24,30,${Math.min(0.6, a).toFixed(2)})`);
  }, reach);
}

/**
 * ไทล์ขอบซ้อนทับ (ชุดละ 16 mask):
 *   0  ฟองคลื่น + ตลิ่ง บนน้ำที่ติดฝั่ง (2 เฟรม)
 *   16 ทรายเปียกริมน้ำ
 *   32 หน้าผาดิน (พื้นป่ายกสูง)
 *   48 ขอบหญ้าหยักบนพื้นทราย
 *   64 หน้าผาหิน (หินยกสูง)
 *   80 กำแพงดันเจี้ยน (หน้ากำแพงอิฐ)
 *   96 เงานุ่มบนพื้นที่ติดที่สูง
 *   112 เงามุมห้อง (AO) บนพื้นดันเจี้ยน
 */
export function edgeTiles(frame: number): PixelCanvas[] {
  const foam = edgeSet((c, x, y, d, side) => {
    const a = along(x, y, side) + frame * 2;
    if (side === 1) {
      // ตลิ่ง (ฝั่งอยู่เหนือน้ำ) แล้วค่อยฟอง
      if (d === 0) c.set(x, y, WP.bank);
      else if (d === 1) c.set(x, y, WP.bankDark);
      else if (d === 2) c.set(x, y, a % 7 === 0 ? WP.foamSoft : WP.foam);
      else if (d === 3 && (a + frame) % 4 === 0) c.set(x, y, WP.foamSoft);
      return;
    }
    if (d === 0) c.set(x, y, (a + side) % 6 === 0 ? WP.foamSoft : WP.foam);
    else if (d === 1 && (a + side) % 3 === 0) c.set(x, y, WP.foamSoft);
  }, 4);
  const wet = edgeSet((c, x, y, d) => {
    if (d === 0 || (d === 1 && dither(x, y) > -0.1)) c.set(x, y, WP.sandDark);
  }, 2);
  const earth = cliffSet(3, WP.earthFace, WP.earthFaceDark, WP.earthFaceLight, WP.grassLine);
  const grass = edgeSet((c, x, y, d, side) => {
    // ลิ้นหญ้าโค้งหยัก (scallop) ยื่นลงทราย + เส้นขอบเขียวเข้ม
    const a = along(x, y, side);
    const reach = 2 + Math.round(Math.sin((a / 16) * Math.PI * 2 * 2 + side) * 1.2 + 1);
    if (d < reach) c.set(x, y, WP.grass);
    else if (d === reach) c.set(x, y, side === 1 ? WP.earthFace : WP.grassLine);
    else if (d === reach + 1 && side === 1) c.set(x, y, 'rgba(14,24,30,0.18)');
  }, 7);
  const rock = cliffSet(5, WP.rockFace, WP.rockFaceDark, WP.rockDark, WP.rockLine);
  const wall = edgeSet((c, x, y, d, side) => {
    if (side === 4) {
      // หน้ากำแพงอิฐสูง 9px
      if (d === 0) c.set(x, y, WP.wallLine);
      else if (d < 9) {
        const row = Math.floor((d - 1) / 3);
        const bx = (x + (row % 2 ? 3 : 0)) % 6;
        const mortar = (d - 1) % 3 === 2 || bx === 5;
        c.set(x, y, mortar ? WP.wallMortar : d >= 7 ? WP.wallBrickLight : WP.wallBrick);
      } else if (d === 9) c.set(x, y, WP.wallLine);
      else if (d === 10) c.set(x, y, WP.wallTopLight);
      return;
    }
    if (d === 0) c.set(x, y, WP.wallLine);
    else if (d === 1) c.set(x, y, WP.wallTopLight);
  }, 11);
  const shade = shadeSet(0.32, 4);
  const ao = shadeSet(0.5, 5);
  // น้ำตื้นที่ติดน้ำลึก: ไล่สีเข้มแบบ dither (ไม่เห็นขอบเหลี่ยม)
  const drop = edgeSet((c, x, y, d) => {
    if (dither(x, y) + 0.5 < 1 - d / 5) c.set(x, y, d < 2 ? WP.deepAlt : WP.shallowAlt);
  }, 5);
  return [...foam, ...wet, ...earth, ...grass, ...rock, ...wall, ...shade, ...ao, ...drop];
}

export const EDGE = { FOAM: 0, WET: 16, CLIFF: 32, GRASS: 48, ROCK: 64, WALL: 80, SHADE: 96, AO: 112, DROP: 128 } as const;
