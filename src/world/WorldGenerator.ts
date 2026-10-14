import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import { SPECIAL_NAME, SPECIAL_SLOT } from '../core/SpecialIsland';
import { INTERIORS, INTERIOR_BASE, genDungeon, interiorDef, type InteriorLayout } from './Interiors';
import { RNG } from '../core/RNG';
import { CENTER_SLOT, type RoomPlayer } from '../core/RoomService';
import { BIOMES, GRID, SLOT_SIZE, WORLD_SIZE, nodeTable, type Biome, type Specialty } from '../data/islands';
import { TILE, isWater } from './tiles';

export type NodeType =
  | 'tree' | 'rock' | 'bush' | 'grass' | 'cactus' | 'wild_crop'
  | 'ore_iron' | 'ore_gold' | 'ore_coal' | 'ore_sulfur' | 'crystal' | 'meteor_rock' | 'ruin_chest'
  | 'bamboo' | 'coral' | 'shroom';

export interface NodeData {
  id: number;
  type: NodeType;
  tx: number;
  ty: number;
  tex: string;
  available: boolean;
  hp: number;
  regrowAt: number;
  daily?: boolean;
}

/** ช่องเกาะในห้อง — 1 ช่อง = เกาะของผู้เล่น 1 คน (ช่องกลาง = เกาะกลาง) */
export interface IslandSlot {
  index: number;
  biome: Biome;
  cx: number;
  cy: number;
  r: number;
  owner: string | null;
  ownerName: string;
  name: string;
  specialty: Specialty;
  /** ความพัฒนาของเกาะผู้เล่นจำลอง 0..1 */
  progress: number;
  /** รูปร่างเกาะ (ดู IslandShape) */
  shape: IslandShape;
  /** จุดกลางผืนดินหลัก (เกาะวงแหวน/จันทร์เสี้ยวกลางเกาะอาจเป็นน้ำ) */
  lx: number;
  ly: number;
}

/**
 * รูปร่างเกาะ — สุ่มตาม seed ของช่อง (เกาะเรา/เกาะกลาง/เกาะมหาสมบัติเป็น blob เสมอ)
 * blob ก้อนกลม · crescent จันทร์เสี้ยว · atoll วงแหวนล้อมลากูน · long ยาวเรียว · twin เกาะแฝดเชื่อมสันทราย · archipelago หมู่เกาะเล็ก
 */
export type IslandShapeKind = 'blob' | 'crescent' | 'atoll' | 'long' | 'twin' | 'archipelago';
export interface IslandShape {
  kind: IslandShapeKind;
  /** มุมหลัก (เรเดียน) */
  a: number;
  /** วงกลมย่อย (หมู่เกาะ/เกาะแฝด) — พิกัด tile + รัศมี */
  parts: { x: number; y: number; r: number }[];
}
export const SHAPE_NAMES: Record<IslandShapeKind, string> = {
  blob: 'เกาะก้อนกลม', crescent: 'เกาะจันทร์เสี้ยว', atoll: 'เกาะวงแหวน', long: 'เกาะยาวเรียว', twin: 'เกาะแฝด (สันทรายเชื่อม)', archipelago: 'หมู่เกาะเล็ก',
};

const DECOR = {
  FLOWERS: [0, 1, 2, 3], PEBBLES: 4, BLADES: [5, 6], MUSHROOM: 7, FERN: 8, LEAVES: 9,
  SHELL: 10, STARFISH: 11, LILY: 12, REEDS: 13, DRIFTWOOD: 14, RIPPLE: 15,
} as const;

const OTHER_BIOMES: Biome[] = [
  'home', 'forest', 'jungle', 'snow', 'desert', 'volcanic', 'ruins',
  'swamp', 'mushroom', 'crystal', 'bamboo', 'savanna', 'glacier', 'atoll', 'haunted',
];
/** น้ำหนักสุ่มรูปร่างเกาะคนอื่น */
const SHAPE_POOL: [IslandShapeKind, number][] = [['blob', 34], ['crescent', 14], ['long', 16], ['twin', 14], ['archipelago', 12], ['atoll', 10]];
const SPECIALTIES: Specialty[] = ['iron', 'coal', 'sulfur', 'gold', 'crystal'];
const SPECIAL_NODE: Record<Specialty, NodeType> = { iron: 'ore_iron', coal: 'ore_coal', sulfur: 'ore_sulfur', gold: 'ore_gold', crystal: 'crystal' };

/**
 * โลกของห้องเซิร์ฟเวอร์: ตาราง GRID×GRID ช่อง (ช่องละ SLOT_SIZE tile)
 * เกาะเกิดเฉพาะช่องที่มีผู้เล่น + เกาะกลาง → แผนที่ใหญ่ขึ้นตามจำนวนคน
 * สร้างพื้นแบบ lazy ทีละช่องเมื่อจำเป็น (แผนที่ 1 ล้าน tile ก็ไม่ค้าง)
 */
export class World {
  readonly size = WORLD_SIZE;
  readonly tiles: Uint8Array;
  readonly island: Int8Array;
  readonly decor: Int8Array;
  readonly slots: (IslandSlot | null)[] = new Array(GRID * GRID).fill(null);
  readonly generated = new Set<number>();
  nodes: NodeData[] = [];
  nextNodeId = 0;
  readonly home: number;
  spawn = { tx: 0, ty: 0 };
  wreck: { tx: number; ty: number } | null = null;
  crates: { tx: number; ty: number }[] = [];
  mailbox = { tx: 0, ty: 0 };
  /** ขอบเขตแผนที่ที่ใช้งาน (tile) ตามช่องที่มีเกาะ + ทะเลรอบ 1 ช่อง */
  bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private shape: NoiseFunction2D;
  private moist: NoiseFunction2D;
  private patch: NoiseFunction2D;
  /** callback เมื่อสร้างช่องใหม่ (ให้ ChunkManager รับ node) */
  onSlotGenerated: ((slot: number, nodes: NodeData[]) => void) | null = null;

  constructor(readonly seed: number, players: RoomPlayer[], mySlot: number, myId: string) {
    const n = this.size * this.size;
    this.tiles = new Uint8Array(n).fill(TILE.DEEP);
    this.island = new Int8Array(n).fill(-1);
    this.decor = new Int8Array(n).fill(-1);
    const rng = new RNG(seed);
    this.shape = createNoise2D(() => rng.next());
    this.moist = createNoise2D(() => rng.next());
    this.patch = createNoise2D(() => rng.next());
    this.home = mySlot;

    const place = (index: number, owner: string | null, ownerName: string, progress: number) => {
      const r2 = new RNG(seed * 131 + index * 977);
      const gx = index % GRID;
      const gy = Math.floor(index / GRID);
      const central = index === CENTER_SLOT;
      const special = index === SPECIAL_SLOT;
      const mine = owner === myId;
      const biome: Biome = central ? 'central' : special ? 'special' : mine ? 'home' : r2.pick(OTHER_BIOMES);
      const r = central ? 50 : special ? 48 : mine ? 46 : r2.int(36, 45);
      const j = (SLOT_SIZE / 2 - r - 10) * 0.6;
      const cx = gx * SLOT_SIZE + SLOT_SIZE / 2 + (central ? 0 : Math.round(r2.range(-j, j)));
      const cy = gy * SLOT_SIZE + SLOT_SIZE / 2 + (central ? 0 : Math.round(r2.range(-j, j)));
      const specialty: Specialty = special ? 'gold' : r2.pick(SPECIALTIES);
      // รูปร่าง: เกาะเรา/กลาง/มหาสมบัติ = ก้อนกลม (สร้างฐาน/วางปากถ้ำได้แน่นอน) · เกาะปะการัง = วงแหวนเสมอ
      const kind: IslandShapeKind = central || special || mine ? 'blob' : biome === 'atoll' ? 'atoll' : biome === 'ruins' ? 'blob' : weighted(r2, SHAPE_POOL);
      const shape = makeShape(kind, cx, cy, r, r2);
      const land = shape.parts[0] ?? { x: cx, y: cy };
      this.slots[index] = {
        index, biome, owner, ownerName, progress, cx, cy, r, specialty, shape,
        lx: Math.round(land.x), ly: Math.round(land.y),
        name: central ? BIOMES.central.name : special ? SPECIAL_NAME : mine ? 'เกาะของคุณ' : `เกาะของ ${ownerName}`,
      };
    };
    place(CENTER_SLOT, null, '', 1);
    place(SPECIAL_SLOT, null, '', 1);
    for (const p of players) if (p.slot !== SPECIAL_SLOT) place(p.slot, p.id, p.name, p.id === myId ? 0 : p.progress);

    // ขอบเขตแผนที่ = ช่องที่มีเกาะ + ขอบทะเล 1 ช่อง
    let gx0 = GRID;
    let gy0 = GRID;
    let gx1 = 0;
    let gy1 = 0;
    this.slots.forEach((s, i) => {
      if (!s || i >= INTERIOR_BASE) return;
      gx0 = Math.min(gx0, i % GRID);
      gx1 = Math.max(gx1, i % GRID);
      gy0 = Math.min(gy0, Math.floor(i / GRID));
      gy1 = Math.max(gy1, Math.floor(i / GRID));
    });
    gx0 = Math.max(0, gx0 - 1);
    gy0 = Math.max(0, gy0 - 1);
    gx1 = Math.min(GRID - 1, gx1 + 1);
    gy1 = Math.min(GRID - 1, gy1 + 1);
    this.bounds = { x0: gx0 * SLOT_SIZE, y0: gy0 * SLOT_SIZE, x1: (gx1 + 1) * SLOT_SIZE, y1: (gy1 + 1) * SLOT_SIZE };

    // ดันเจี้ยนใต้เกาะเรา อยู่แถวพิเศษใต้ตาราง
    for (const d of INTERIORS) {
      const gx = d.index - INTERIOR_BASE;
      this.slots[d.index] = {
        index: d.index, biome: d.kind, owner: myId, ownerName: '', progress: 0,
        cx: gx * SLOT_SIZE + SLOT_SIZE / 2, cy: GRID * SLOT_SIZE + SLOT_SIZE / 2, r: SLOT_SIZE / 2,
        name: d.name, specialty: 'iron', shape: { kind: 'blob', a: 0, parts: [] }, lx: gx * SLOT_SIZE + SLOT_SIZE / 2, ly: GRID * SLOT_SIZE + SLOT_SIZE / 2,
      };
    }
    this.ensureSlot(mySlot);
    this.ensureSlot(CENTER_SLOT);
  }

  /** ผังแมพย่อยที่สร้างแล้ว */
  readonly layouts = new Map<number, InteriorLayout>();
  /** ทางเข้าแมพย่อยบนเกาะบ้าน */
  portals: { interior: number; tx: number; ty: number }[] = [];

  /** มุมซ้ายบนของช่อง (tile) */
  slotOrigin(index: number) {
    if (index >= INTERIOR_BASE) return { x: (index - INTERIOR_BASE) * SLOT_SIZE, y: GRID * SLOT_SIZE };
    return { x: (index % GRID) * SLOT_SIZE, y: Math.floor(index / GRID) * SLOT_SIZE };
  }

  private generateInterior(index: number) {
    const def = interiorDef(index)!;
    const S = this.size;
    const o = this.slotOrigin(index);
    const canvas = {
      S: SLOT_SIZE,
      set: (x: number, y: number, t: number) => {
        if (x < 0 || y < 0 || x >= SLOT_SIZE || y >= SLOT_SIZE) return;
        const k = (o.y + y) * S + o.x + x;
        this.tiles[k] = t;
        this.island[k] = isWater(t) || t === TILE.ROCKWALL ? -1 : index;
      },
      get: (x: number, y: number) => (x < 0 || y < 0 || x >= SLOT_SIZE || y >= SLOT_SIZE ? TILE.ROCKWALL : this.tiles[(o.y + y) * S + o.x + x]),
    };
    const L = genDungeon(canvas, def, this.seed * 31 + index);
    // พิกัดในผัง → พิกัดโลก
    const sh = <T extends { tx: number; ty: number }>(p: T): T => ({ ...p, tx: p.tx + o.x, ty: p.ty + o.y });
    const W: InteriorLayout = {
      ...L,
      entry: sh(L.entry), exit: sh(L.exit), boss: L.boss && sh(L.boss),
      rooms: L.rooms.map((r) => ({ ...r, cx: r.cx + o.x, cy: r.cy + o.y })),
      chests: L.chests.map(sh), ores: L.ores.map(sh), torches: L.torches.map(sh),
    };
    this.layouts.set(index, W);
    return W;
  }

  get homeIsland(): IslandSlot {
    return this.slots[this.home]!;
  }

  slotIndexAt(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return -1;
    const gx = Math.floor(tx / SLOT_SIZE);
    const gy = Math.floor(ty / SLOT_SIZE);
    if (gy === GRID) return INTERIOR_BASE + gx;
    if (gx >= GRID) return -1;
    return gy * GRID + gx;
  }

  tileAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return TILE.DEEP;
    this.ensureSlot(this.slotIndexAt(tx, ty));
    return this.tiles[ty * this.size + tx];
  }

  setTile(tx: number, ty: number, t: number) {
    this.tiles[ty * this.size + tx] = t;
    if (isWater(t)) this.island[ty * this.size + tx] = -1;
    else if (this.island[ty * this.size + tx] < 0) this.island[ty * this.size + tx] = this.slotIndexAt(tx, ty);
  }

  islandAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.size || ty >= this.size) return -1;
    this.ensureSlot(this.slotIndexAt(tx, ty));
    return this.island[ty * this.size + tx];
  }

  decorAt(tx: number, ty: number) {
    return this.decor[ty * this.size + tx];
  }

  /** สร้างพื้น/ทรัพยากรของช่อง (ครั้งแรกที่ต้องใช้) */
  ensureSlot(index: number) {
    if (index < 0 || this.generated.has(index)) return;
    this.generated.add(index);
    const is = this.slots[index];
    if (!is) return; // ทะเลเปิด
    const S = this.size;
    if (index >= INTERIOR_BASE) {
      const L = this.generateInterior(index);
      // ทรัพยากรในดันเจี้ยน: แร่ + หีบ
      const made: NodeData[] = [];
      const rng0 = new RNG(this.seed * 5 + index);
      const v0 = (n: number) => rng0.int(0, n - 1);
      for (const o of L.ores) made.push({ id: this.nextNodeId++, type: o.type as NodeType, tx: o.tx, ty: o.ty, tex: texFor(o.type as NodeType, TILE.STONE, v0), available: true, hp: -1, regrowAt: 0 });
      for (const c of L.chests) made.push({ id: this.nextNodeId++, type: 'ruin_chest', tx: c.tx, ty: c.ty, tex: texFor('ruin_chest', TILE.BRICK, v0), available: true, hp: -1, regrowAt: 0 });
      this.nodes.push(...made);
      this.onSlotGenerated?.(index, made);
      return;
    }
    const x0 = (index % GRID) * SLOT_SIZE;
    const y0 = Math.floor(index / GRID) * SLOT_SIZE;
    const rng = new RNG(this.seed * 7 + index * 104729);
    const lagoon = is.shape.kind === 'atoll';
    for (let y = y0; y < y0 + SLOT_SIZE; y++) {
      for (let x = x0; x < x0 + SLOT_SIZE; x++) {
        const d = shapeDist(is, x, y);
        const s = 1 - d + this.shape(x / 14, y / 14) * (lagoon ? 0.12 : 0.22) + this.shape(x / 6, y / 6) * 0.07;
        let t: number = TILE.DEEP;
        if (s >= -0.05 && s < 0.06) t = TILE.SHALLOW;
        else if (s >= 0.06) {
          this.island[y * S + x] = index;
          const m = (this.moist(x / 18, y / 18) + 1) / 2;
          const pt = this.patch(x / 8, y / 8);
          t = landTile(is.biome, s < 0.15, m, pt);
          // หนองน้ำ: บึงน้ำตื้นกลางเกาะ
          if (is.biome === 'swamp' && s > 0.2 && this.patch(x / 11 + 40, y / 11) > 0.45) {
            t = TILE.SHALLOW;
            this.island[y * S + x] = -1;
          }
        }
        // ลากูนกลางเกาะวงแหวน = น้ำตื้น (เรือเข้าได้ทางช่องแนวปะการัง)
        if (t === TILE.DEEP && lagoon && Math.hypot(x - is.cx, y - is.cy) < is.r * 0.78) t = TILE.SHALLOW;
        this.tiles[y * S + x] = t;
      }
    }
    if (is.biome === 'central') this.carveCentral(is);
    if (is.biome === 'ruins' || is.biome === 'special' || is.biome === 'haunted') this.carveRuins(is, rng);
    if (index === this.home) this.setupHome(is);

    const reserved = (x: number, y: number) => {
      if (is.biome === 'central') return true;
      if (index === this.home && Math.abs(x - this.spawn.tx) <= 5 && Math.abs(y - this.spawn.ty) <= 5) return true;
      if (index === this.home && this.portals.some((p) => Math.abs(x - p.tx) <= 3 && y - p.ty >= -4 && y - p.ty <= 3)) return true;
      const w = this.wreck;
      return index === this.home && !!w && x >= w.tx - 1 && x <= w.tx + 4 && y >= w.ty - 1 && y <= w.ty + 2;
    };
    const occupied = new Set<number>();
    const made: NodeData[] = [];
    const v = (n: number) => rng.int(0, n - 1);
    for (let y = y0 + 1; y < y0 + SLOT_SIZE - 1; y++) {
      for (let x = x0 + 1; x < x0 + SLOT_SIZE - 1; x++) {
        const k = y * S + x;
        if (this.island[k] !== index || reserved(x, y)) continue;
        if (occupied.has(k - 1) || occupied.has(k - S)) continue;
        const t = this.tiles[k];
        const tileName = t === TILE.SAND ? 'sand' : t === TILE.STONE ? 'stone' : t === TILE.FOREST ? 'forest' : t === TILE.BRICK ? 'brick' : 'land';
        let table = nodeTable(is.biome, tileName);
        // แร่ประจำเกาะบนลานหิน
        if (t === TILE.STONE && is.biome !== 'central') table = [[SPECIAL_NODE[is.specialty], 0.05], ...table];
        let roll = rng.next();
        for (const [type, p] of table) {
          if (roll < p) {
            made.push({ id: this.nextNodeId++, type, tx: x, ty: y, tex: texFor(type, t, v, is.biome), available: true, hp: -1, regrowAt: 0 });
            occupied.add(k);
            break;
          }
          roll -= p;
        }
      }
    }
    // ของตกแต่ง
    for (let y = y0; y < y0 + SLOT_SIZE; y++) {
      for (let x = x0; x < x0 + SLOT_SIZE; x++) {
        const k = y * S + x;
        if (occupied.has(k)) continue;
        const t = this.tiles[k];
        const r = rng.next();
        let d = -1;
        const gloomy = is.biome === 'haunted' || is.biome === 'mushroom' || is.biome === 'crystal' || is.biome === 'swamp';
        if (t === TILE.GRASS && r < 0.2) d = gloomy ? (r < 0.08 ? DECOR.MUSHROOM : r < 0.14 ? DECOR.PEBBLES : -1) : r < 0.09 ? rng.pick(DECOR.FLOWERS) : r < 0.16 ? rng.pick(DECOR.BLADES) : r < 0.185 ? DECOR.PEBBLES : DECOR.MUSHROOM;
        else if (t === TILE.FOREST && r < 0.26) d = r < 0.08 ? DECOR.FERN : r < 0.15 ? DECOR.LEAVES : r < 0.19 ? DECOR.MUSHROOM : rng.pick(DECOR.BLADES);
        else if ((t === TILE.SAND || t === TILE.DESERT) && r < 0.08) d = t === TILE.SAND && r < 0.03 ? DECOR.SHELL : t === TILE.SAND && r < 0.045 ? DECOR.STARFISH : r < 0.06 ? DECOR.DRIFTWOOD : DECOR.RIPPLE;
        else if ((t === TILE.STONE || t === TILE.ASH) && r < 0.12) d = DECOR.PEBBLES;
        else if (t === TILE.SHALLOW && r < 0.1) d = this.nearLand(x, y) ? DECOR.REEDS : r < 0.04 ? DECOR.LILY : -1;
        this.decor[k] = d;
      }
    }
    this.nodes.push(...made);
    this.onSlotGenerated?.(index, made);
  }

  private nearLand(x: number, y: number) {
    const S = this.size;
    const t = (a: number, b: number) => this.tiles[b * S + a];
    return !isWater(t(x + 1, y)) || !isWater(t(x - 1, y)) || !isWater(t(x, y + 1)) || !isWater(t(x, y - 1));
  }

  private setupHome(is: IslandSlot) {
    const S = this.size;
    let best: { tx: number; ty: number } | null = null;
    for (let r = 0; r < 30 && !best; r++) {
      for (let dy = -r; dy <= r && !best; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.tiles[(is.cy + dy) * S + is.cx + dx] === TILE.GRASS) {
            best = { tx: is.cx + dx, ty: is.cy + dy };
            break;
          }
        }
      }
    }
    this.spawn = best ?? { tx: is.cx, ty: is.cy };
    const land = (x: number, y: number) => !isWater(this.tiles[y * S + x]);
    const wx = this.spawn.tx + 2;
    const wy = this.spawn.ty - 3;
    let fits = true;
    for (let y = wy; y < wy + 2; y++) for (let x = wx; x < wx + 4; x++) if (!land(x, y)) fits = false;
    this.wreck = fits ? { tx: wx, ty: wy } : null;
    this.crates = [
      { tx: this.spawn.tx - 2, ty: this.spawn.ty - 1 },
      { tx: this.spawn.tx + 1, ty: this.spawn.ty + 2 },
      { tx: this.spawn.tx + 3, ty: this.spawn.ty },
    ].filter((c) => land(c.tx, c.ty));
    this.mailbox = { tx: this.spawn.tx - 2, ty: this.spawn.ty + 2 };
    // ปากถ้ำดันเจี้ยน 3 จุดรอบเกาะ
    const angles = [-Math.PI * 0.5, Math.PI * 0.82, Math.PI * 0.18];
    const solid = (x: number, y: number) => {
      for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (!land(x + dx, y + dy)) return false;
      return true;
    };
    this.portals = [];
    INTERIORS.forEach((d, i) => {
      const a = angles[i];
      for (let f = 0.72; f > 0.3; f -= 0.04) {
        const tx = Math.round(is.cx + Math.cos(a) * is.r * f);
        const ty = Math.round(is.cy + Math.sin(a) * is.r * f);
        if (solid(tx, ty) && Math.hypot(tx - this.spawn.tx, ty - this.spawn.ty) > 9) {
          this.portals.push({ interior: d.index, tx, ty });
          return;
        }
      }
      // สำรอง: วนหาที่ว่างรอบจุดเกิด (ทุกแมพย่อยต้องมีทางเข้าเสมอ)
      for (let r = 10; r < is.r; r += 2) {
        for (let k = 0; k < 16; k++) {
          const tx = Math.round(this.spawn.tx + Math.cos(a + (k / 16) * Math.PI * 2) * r);
          const ty = Math.round(this.spawn.ty + Math.sin(a + (k / 16) * Math.PI * 2) * r);
          if (solid(tx, ty) && !this.portals.some((p) => Math.abs(p.tx - tx) < 6 && Math.abs(p.ty - ty) < 6)) {
            this.portals.push({ interior: d.index, tx, ty });
            return;
          }
        }
      }
    });
  }

  /** เกาะกลาง: ลานอิฐวงกลม + ทางเดินดิน 4 ทิศ + ท่าเรือ */
  private carveCentral(is: IslandSlot) {
    const S = this.size;
    for (let y = is.cy - is.r; y <= is.cy + is.r; y++) {
      for (let x = is.cx - is.r; x <= is.cx + is.r; x++) {
        const k = y * S + x;
        if (isWater(this.tiles[k])) continue;
        const d = Math.hypot(x - is.cx, y - is.cy);
        if (d <= 13) this.tiles[k] = TILE.BRICK;
        else if (d <= 15) this.tiles[k] = TILE.DIRT;
        else if (Math.abs(x - is.cx) <= 1 || Math.abs(y - is.cy) <= 1) this.tiles[k] = TILE.DIRT;
      }
    }
  }

  private carveRuins(is: IslandSlot, rng: RNG) {
    const r = Math.round(is.r * (is.biome === 'haunted' ? 0.22 : 0.35));
    const S = this.size;
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (Math.hypot(x, y) > r || rng.chance(is.biome === 'haunted' ? 0.25 : 0.08)) continue;
        const k = (is.ly + y) * S + is.lx + x;
        if (!isWater(this.tiles[k])) this.tiles[k] = TILE.BRICK;
      }
    }
  }
}

function landTile(biome: Biome, beach: boolean, m: number, patch: number): number {
  switch (biome) {
    case 'snow':
      return patch > 0.45 ? TILE.STONE : TILE.SNOW;
    case 'desert':
      if (beach) return TILE.SAND;
      return patch > 0.5 ? TILE.STONE : TILE.DESERT;
    case 'volcanic':
      if (beach) return TILE.ASH;
      return patch > 0.3 ? TILE.STONE : TILE.ASH;
    case 'jungle':
      if (beach) return TILE.SAND;
      return m > 0.35 ? TILE.FOREST : TILE.GRASS;
    case 'forest':
      if (beach) return TILE.SAND;
      return m > 0.45 ? TILE.FOREST : TILE.GRASS;
    case 'ruins':
      if (beach) return TILE.SAND;
      return patch > 0.35 ? TILE.BRICK : m > 0.6 ? TILE.FOREST : TILE.GRASS;
    case 'central':
      if (beach) return TILE.SAND;
      return TILE.GRASS;
    case 'swamp':
      if (beach) return m > 0.5 ? TILE.DIRT : TILE.SAND;
      return m < 0.38 ? TILE.DIRT : m > 0.58 ? TILE.FOREST : TILE.GRASS;
    case 'mushroom':
      if (beach) return TILE.SAND;
      return patch > 0.6 ? TILE.STONE : m > 0.45 ? TILE.FOREST : TILE.GRASS;
    case 'crystal':
      if (beach) return TILE.SAND;
      return patch > 0.15 ? TILE.STONE : TILE.GRASS;
    case 'bamboo':
      if (beach) return TILE.SAND;
      return m > 0.42 ? TILE.FOREST : TILE.GRASS;
    case 'savanna':
      if (beach) return TILE.SAND;
      return patch > 0.72 ? TILE.STONE : patch > 0.42 ? TILE.DIRT : TILE.GRASS;
    case 'glacier':
      if (beach) return TILE.ASH;
      return patch > 0.55 ? TILE.STONE : patch > 0.05 || m < 0.3 ? TILE.ASH : TILE.SNOW;
    case 'atoll':
      return beach || m < 0.55 ? TILE.SAND : TILE.GRASS;
    case 'haunted':
      if (beach) return TILE.SAND;
      return patch > 0.55 ? TILE.BRICK : m > 0.5 ? TILE.FOREST : patch < -0.5 ? TILE.DIRT : TILE.GRASS;
    case 'special':
      if (beach) return TILE.SAND;
      return patch > 0.4 ? TILE.STONE : m > 0.55 ? TILE.FOREST : TILE.GRASS;
    default:
      if (beach) return TILE.SAND;
      if (patch > 0.62) return TILE.STONE;
      return m > 0.6 ? TILE.FOREST : TILE.GRASS;
  }
}

/** ต้นไม้หลายแบบตามไบโอม (น้ำหนักสุ่ม) */
const TREE_MIX: Partial<Record<Biome, { grass: [string, number][]; forest: [string, number][] }>> = {
  home: {
    grass: [['oak', 30], ['birch', 15], ['sakura', 15], ['maple', 15], ['willow', 10], ['bigoak', 8], ['pine', 7]],
    forest: [['pine', 35], ['oak', 18], ['birch', 15], ['bigoak', 12], ['maple', 10], ['sakura', 10]],
  },
  forest: { grass: [['oak', 35], ['birch', 30], ['maple', 20], ['bigoak', 15]], forest: [['pine', 50], ['birch', 22], ['bigoak', 18], ['oak', 10]] },
  jungle: { grass: [['bigoak', 30], ['oak', 25], ['willow', 20], ['mushtree', 15], ['palm', 10]], forest: [['bigoak', 35], ['willow', 25], ['mushtree', 20], ['oak', 20]] },
  ruins: { grass: [['oak', 45], ['deadtree', 30], ['willow', 25]], forest: [['willow', 35], ['deadtree', 30], ['bigoak', 35]] },
  special: { grass: [['sakura', 30], ['bigoak', 30], ['mushtree', 20], ['maple', 20]], forest: [['bigoak', 40], ['sakura', 30], ['mushtree', 30]] },
  swamp: { grass: [['mangrove', 50], ['willow', 30], ['deadtree', 20]], forest: [['mangrove', 60], ['willow', 25], ['bigoak', 15]] },
  mushroom: { grass: [['mushtree', 75], ['deadtree', 10], ['willow', 15]], forest: [['mushtree', 90], ['bigoak', 10]] },
  crystal: { grass: [['deadtree', 50], ['snow_pine', 30], ['birch', 20]], forest: [['deadtree', 60], ['birch', 40]] },
  bamboo: { grass: [['sakura', 60], ['maple', 20], ['willow', 20]], forest: [['sakura', 50], ['bigoak', 20], ['willow', 30]] },
  savanna: { grass: [['acacia', 85], ['deadtree', 15]], forest: [['acacia', 100]] },
  atoll: { grass: [['palm', 80], ['bigoak', 20]], forest: [['palm', 100]] },
  haunted: { grass: [['deadtree', 60], ['willow', 40]], forest: [['deadtree', 50], ['willow', 30], ['bigoak', 20]] },
};
const TREE_VARIANTS: Record<string, number> = { oak: 3, pine: 2, palm: 2, birch: 2, sakura: 2, maple: 2, willow: 1, bigoak: 2, deadtree: 2, mushtree: 2, snow_pine: 2, acacia: 2, mangrove: 2 };

export function texFor(type: NodeType, tile: number, v: (n: number) => number, biome?: Biome): string {
  switch (type) {
    case 'tree': {
      if (tile === TILE.SAND) return `palm_${v(2)}`;
      if (tile === TILE.ASH && biome === 'glacier') return v(100) < 70 ? `snow_pine_${v(2)}` : `deadtree_${v(2)}`;
      if (tile === TILE.DIRT && biome === 'swamp') return `mangrove_${v(2)}`;
      if (tile === TILE.DIRT && biome === 'savanna') return `acacia_${v(2)}`;
      if (tile === TILE.ASH) return `deadtree_${v(2)}`;
      if (tile === TILE.SNOW || tile === TILE.STONE) return v(100) < 80 ? `snow_pine_${v(2)}` : `deadtree_${v(2)}`;
      const mix = biome && TREE_MIX[biome];
      if (mix) {
        const list = tile === TILE.FOREST ? mix.forest : mix.grass;
        let r = v(list.reduce((a, [, w]) => a + w, 0));
        for (const [kind, w] of list) if ((r -= w) < 0) return `${kind}_${v(TREE_VARIANTS[kind] ?? 1)}`;
      }
      if (tile === TILE.FOREST && v(100) < 55) return `pine_${v(2)}`;
      return `oak_${v(3)}`;
    }
    case 'rock':
      return `rock_${tile === TILE.FOREST ? 2 : v(2)}`;
    case 'bush':
      return `bush_${v(2)}`;
    case 'cactus':
      return `cactus_${v(2)}`;
    case 'ore_iron':
      return `ore_iron_${v(2)}`;
    case 'ore_gold':
      return 'ore_gold_0';
    case 'ore_coal':
      return 'ore_coal_0';
    case 'ore_sulfur':
      return 'ore_sulfur_0';
    case 'crystal':
      return biome === 'crystal' && v(100) < 60 ? 'crystal_1' : 'crystal_0';
    case 'bamboo':
      return `bamboo_${v(2)}`;
    case 'coral':
      return `coral_${v(3)}`;
    case 'shroom':
      return `shroom_${v(2)}`;
    case 'meteor_rock':
      return 'meteor_rock_0';
    case 'ruin_chest':
      return 'reward_chest';
    case 'wild_crop':
      return `wild_crop_${v(2)}`;
    default:
      return `grass_${v(2)}`;
  }
}

function weighted<T>(rng: RNG, list: [T, number][]): T {
  let r = rng.next() * list.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}

/** สร้างพารามิเตอร์รูปร่าง (deterministic จาก RNG ของช่อง) — parts[0] = ผืนดินหลัก */
function makeShape(kind: IslandShapeKind, cx: number, cy: number, r: number, rng: RNG): IslandShape {
  const a = rng.range(0, Math.PI * 2);
  const parts: { x: number; y: number; r: number }[] = [];
  const at = (ang: number, dist: number, rr: number) => parts.push({ x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist, r: rr });
  switch (kind) {
    case 'crescent':
      at(a + Math.PI, r * 0.5, r * 0.45); // ผืนดินหลัก = ด้านหนา (ตรงข้ามรอยเว้า)
      break;
    case 'atoll':
      at(a + Math.PI / 2, r * 0.78, r * 0.2); // บนวงแหวน
      break;
    case 'long':
      at(a, 0, r * 0.45);
      break;
    case 'twin':
      at(a, r * 0.5, r * 0.62);
      at(a + Math.PI, r * 0.5, r * 0.55);
      break;
    case 'archipelago': {
      at(0, 0, r * 0.52);
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) at(a + (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3), r * rng.range(0.72, 0.92), r * rng.range(0.2, 0.3));
      break;
    }
    default:
      at(0, 0, r * 0.5);
  }
  return { kind, a, parts };
}

/** ระยะแบบ normalize จากจุดถึงขอบเกาะ (< 1 = แผ่นดิน, 1 = ขอบ) ตามรูปร่าง */
function shapeDist(is: IslandSlot, x: number, y: number): number {
  const sh = is.shape;
  const dx = x - is.cx;
  const dy = y - is.cy;
  const d0 = Math.hypot(dx, dy) / is.r;
  switch (sh.kind) {
    case 'crescent': {
      // วงกลมใหญ่ลบวงกลมที่เลื่อนไปทางมุม a
      const bx = is.cx + Math.cos(sh.a) * is.r * 0.72;
      const by = is.cy + Math.sin(sh.a) * is.r * 0.72;
      const d2 = Math.hypot(x - bx, y - by) / (is.r * 0.74);
      return Math.max(d0, 2 - d2);
    }
    case 'atoll': {
      const ring = Math.abs(d0 - 0.78) / 0.2;
      // ช่องแนวปะการังให้เรือเข้าลากูน
      const ang = Math.atan2(dy, dx);
      const gap = Math.abs(Math.atan2(Math.sin(ang - sh.a), Math.cos(ang - sh.a)));
      return gap < 0.16 ? Math.max(ring, 1.08) : ring;
    }
    case 'long': {
      const c = Math.cos(sh.a);
      const s = Math.sin(sh.a);
      const u = (dx * c + dy * s) / (is.r * 1.35);
      const v = (-dx * s + dy * c) / (is.r * 0.5);
      return Math.hypot(u, v);
    }
    case 'twin': {
      const [p, q] = sh.parts;
      let d = Math.min(Math.hypot(x - p.x, y - p.y) / p.r, Math.hypot(x - q.x, y - q.y) / q.r);
      // สันทรายเชื่อมสองเกาะ (ค่า ~0.88–1 = ชายหาด)
      const vx = q.x - p.x;
      const vy = q.y - p.y;
      const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (y - p.y) * vy) / (vx * vx + vy * vy)));
      const seg = Math.hypot(x - (p.x + vx * t), y - (p.y + vy * t));
      d = Math.min(d, 0.88 + seg / (is.r * 0.1) * 0.12);
      return d;
    }
    case 'archipelago': {
      let d = 9;
      for (const p of sh.parts) d = Math.min(d, Math.hypot(x - p.x, y - p.y) / p.r);
      return d;
    }
    default:
      return d0;
  }
}
