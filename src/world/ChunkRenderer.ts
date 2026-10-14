import Phaser from 'phaser';
import { EDGE, VARIANTS, hash2, skinFor, skinsGrass } from '../gfx/art/terrain';
import { TILE, isWater } from './tiles';
import type { World } from './WorldGenerator';

const CH = 32; // tile ต่อ chunk

interface Chunk {
  map: Phaser.Tilemaps.Tilemap;
  ground: Phaser.Tilemaps.TilemapLayer;
  sets: Phaser.Tilemaps.Tileset[];
  colliders: Phaser.Physics.Arcade.Collider[];
}

/**
 * วาดพื้นทีละ chunk (32×32 tile) เฉพาะรอบกล้อง — แผนที่ห้อง 100 คน (1,000×1,000+ tile) ก็ลื่น
 * แต่ละ chunk มี 4 ชั้น: พื้น → ขอบ (ฟองคลื่น/ทรายเปียก/ขอบป่า) → ขอบหญ้า → ของตกแต่ง
 */
export class ChunkRenderer {
  private chunks = new Map<string, Chunk>();
  private frame = 0;
  private timer = 0;
  /** ใครต้องชนน้ำลึก (ผู้เล่น/มอนสเตอร์) */
  colliderTargets: { obj: Phaser.Types.Physics.Arcade.ArcadeColliderType; process?: () => boolean }[] = [];

  constructor(private scene: Phaser.Scene, private world: World) {}

  private key(cx: number, cy: number) {
    return `${cx},${cy}`;
  }

  update(dt: number, view: Phaser.Geom.Rectangle) {
    // น้ำกระเพื่อม: สลับภาพ tileset ของทุก chunk
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.7;
      this.frame ^= 1;
      const g = this.scene.textures.get(this.frame ? 'tiles_b' : 'tiles_a');
      const e = this.scene.textures.get(this.frame ? 'edges_b' : 'edges_a');
      for (const c of this.chunks.values()) {
        c.sets[0].setImage(g);
        c.sets[1].setImage(e);
      }
    }
    const T = CH * 16;
    const x0 = Math.floor((view.x - 32) / T);
    const x1 = Math.floor((view.right + 32) / T);
    const y0 = Math.floor((view.y - 32) / T);
    const y1 = Math.floor((view.bottom + 32) / T);
    const want = new Set<string>();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) want.add(this.key(cx, cy));
    for (const [k, c] of this.chunks) {
      if (want.has(k)) continue;
      c.colliders.forEach((col) => col.destroy());
      c.map.destroy();
      this.chunks.delete(k);
    }
    for (const k of want) if (!this.chunks.has(k)) this.build(k);
  }

  /** วาด chunk ใหม่ทั้งหมด (หลังเปลี่ยนพื้น เช่น ขุดบ่อ/ถมทะเล) */
  refreshAt(tx: number, ty: number) {
    const cx = Math.floor(tx / CH);
    const cy = Math.floor(ty / CH);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = this.key(cx + dx, cy + dy);
        const c = this.chunks.get(k);
        if (!c) continue;
        // รีเฟรชเฉพาะ chunk ที่ tile อยู่ใกล้ขอบ (ขอบคลื่นข้าม chunk ได้)
        if ((dx || dy) && !(Math.abs(tx - (cx + dx) * CH - CH / 2) < CH / 2 + 2 && Math.abs(ty - (cy + dy) * CH - CH / 2) < CH / 2 + 2)) continue;
        c.colliders.forEach((col) => col.destroy());
        c.map.destroy();
        this.chunks.delete(k);
        this.build(k);
      }
    }
  }

  private build(k: string) {
    const [cx, cy] = k.split(',').map(Number);
    const W = this.world;
    const ox = cx * CH;
    const oy = cy * CH;
    if (ox < 0 || oy < 0 || ox >= W.size || oy >= W.size) return;
    const at = (x: number, y: number) => W.tileAt(x, y);
    const maskOf = (x: number, y: number, test: (t: number) => boolean) =>
      (test(at(x, y - 1)) ? 1 : 0) | (test(at(x + 1, y)) ? 2 : 0) | (test(at(x, y + 1)) ? 4 : 0) | (test(at(x - 1, y)) ? 8 : 0);
    const notWater = (t: number) => !isWater(t);
    const isGreen = (t: number) => t === TILE.GRASS || t === TILE.FOREST;
    const ground: number[][] = [];
    const edgeA: number[][] = [];
    const edgeB: number[][] = [];
    const decor: number[][] = [];
    for (let y = 0; y < CH; y++) {
      const g: number[] = [];
      const a: number[] = [];
      const b: number[] = [];
      const d: number[] = [];
      for (let x = 0; x < CH; x++) {
        const wx = ox + x;
        const wy = oy + y;
        const t = at(wx, wy);
        // ผิวพื้นตามไบโอมของช่อง (โคลน น้ำแข็ง หญ้าเหลือง ลากูน ฯลฯ)
        const biome = W.slots[W.slotIndexAt(wx, wy)]?.biome;
        const sk = skinFor(biome, t);
        g.push((sk >= 0 ? sk : t) * VARIANTS + Math.floor(hash2(wx, wy) * VARIANTS));
        let ea = -1;
        let eb = -1;
        if (isWater(t)) {
          const m = maskOf(wx, wy, notWater);
          if (m) ea = EDGE.FOAM + m;
        } else if (t === TILE.SAND || t === TILE.DESERT) {
          const m = maskOf(wx, wy, isWater);
          if (m) ea = EDGE.WET + m;
          const mg = skinsGrass(biome) ? 0 : maskOf(wx, wy, isGreen);
          if (mg) eb = EDGE.GRASS + mg;
        } else if (t === TILE.GRASS && !skinsGrass(biome)) {
          const m = maskOf(wx, wy, (n) => n === TILE.FOREST);
          if (m) ea = EDGE.FOREST + m;
        }
        a.push(ea);
        b.push(eb);
        d.push(wx < W.size && wy < W.size ? W.decorAt(wx, wy) : -1);
      }
      ground.push(g);
      edgeA.push(a);
      edgeB.push(b);
      decor.push(d);
    }
    const map = this.scene.make.tilemap({ width: CH, height: CH, tileWidth: 16, tileHeight: 16 });
    const gs = map.addTilesetImage('ground', this.frame ? 'tiles_b' : 'tiles_a', 16, 16, 0, 0)!;
    const es = map.addTilesetImage('edges', this.frame ? 'edges_b' : 'edges_a', 16, 16, 0, 0)!;
    const ds = map.addTilesetImage('decor', 'decor', 16, 16, 0, 0)!;
    const px = ox * 16;
    const py = oy * 16;
    const groundLayer = map.createBlankLayer('g', gs, px, py)!.setDepth(-10);
    groundLayer.putTilesAt(ground, 0, 0);
    groundLayer.setCollisionBetween(0, VARIANTS - 1);
    groundLayer.setCollisionBetween(TILE.ROCKWALL * VARIANTS, TILE.ROCKWALL * VARIANTS + VARIANTS - 1); // ผนังถ้ำ
    map.createBlankLayer('a', es, px, py)!.setDepth(-9).putTilesAt(edgeA, 0, 0);
    map.createBlankLayer('b', es, px, py)!.setDepth(-8).putTilesAt(edgeB, 0, 0);
    map.createBlankLayer('d', ds, px, py)!.setDepth(-7).putTilesAt(decor, 0, 0);
    const physics = (this.scene as Phaser.Scene & { physics: Phaser.Physics.Arcade.ArcadePhysics }).physics;
    const colliders = this.colliderTargets.map((t) => physics.add.collider(t.obj, groundLayer, undefined, t.process));
    this.chunks.set(k, { map, ground: groundLayer, sets: [gs, es, ds], colliders });
  }
}
