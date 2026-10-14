import Phaser from 'phaser';
import { NODE_SPECS, ResourceNode } from '../entities/ResourceNode';
import type { NodeData } from './WorldGenerator';

const CHUNK = 16; // tiles ต่อ chunk

const tkey = (tx: number, ty: number) => `${tx},${ty}`;

/**
 * โหลด/ปลด sprite ของทรัพยากรตาม chunk รอบกล้อง — แมพใหญ่แค่ไหนก็ลื่น
 * ข้อมูลจริงอยู่ใน NodeData เสมอ (sprite เป็นแค่ตัวแสดงผล)
 */
export class ChunkManager {
  private byChunk = new Map<string, NodeData[]>();
  private byTile = new Map<string, NodeData>();
  private active = new Map<string, ResourceNode[]>();
  private sprites = new Map<NodeData, ResourceNode>();
  private timer = 0;

  constructor(
    private scene: Phaser.Scene,
    nodes: NodeData[],
    private blockers: Phaser.Physics.Arcade.StaticGroup,
  ) {
    for (const n of nodes) this.index(n);
  }

  private chunkKey(n: { tx: number; ty: number }) {
    return `${Math.floor(n.tx / CHUNK)},${Math.floor(n.ty / CHUNK)}`;
  }

  private index(n: NodeData) {
    const k = this.chunkKey(n);
    if (!this.byChunk.has(k)) this.byChunk.set(k, []);
    this.byChunk.get(k)!.push(n);
    this.byTile.set(tkey(n.tx, n.ty), n);
  }

  /** ข้อมูล node ที่ tile นั้น (มีแม้ chunk ไม่ได้โหลด) */
  at(tx: number, ty: number): NodeData | undefined {
    return this.byTile.get(tkey(tx, ty));
  }

  /** sprite ที่ tile นั้น (เฉพาะ chunk ที่โหลดอยู่) */
  spriteAt(tx: number, ty: number): ResourceNode | undefined {
    const d = this.at(tx, ty);
    return d ? this.sprites.get(d) : undefined;
  }

  activeSprites(): Iterable<ResourceNode> {
    return this.sprites.values();
  }

  add(n: NodeData) {
    this.index(n);
    const k = this.chunkKey(n);
    if (this.active.has(k)) this.active.get(k)!.push(this.spawn(n));
  }

  remove(n: NodeData) {
    const k = this.chunkKey(n);
    this.byChunk.set(k, (this.byChunk.get(k) ?? []).filter((x) => x !== n));
    if (this.byTile.get(tkey(n.tx, n.ty)) === n) this.byTile.delete(tkey(n.tx, n.ty));
    const s = this.sprites.get(n);
    if (s) {
      this.active.set(k, (this.active.get(k) ?? []).filter((x) => x !== s));
      this.sprites.delete(n);
      s.destroy();
    }
  }

  private spawn(n: NodeData): ResourceNode {
    const node = new ResourceNode(this.scene, n);
    const b = NODE_SPECS[n.type].blocker;
    if (b) {
      this.blockers.add(node);
      const body = node.body as Phaser.Physics.Arcade.StaticBody;
      body.setSize(b.w, b.h, false).setOffset((node.width - b.w) / 2, node.height - b.h - 1);
      body.enable = n.available;
    }
    this.sprites.set(n, node);
    return node;
  }

  update(dt: number, view: Phaser.Geom.Rectangle, worldTime: number, force = false) {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.25;
    const T = 16 * CHUNK;
    const x0 = Math.floor((view.x - T * 0.6) / T);
    const x1 = Math.floor((view.right + T * 0.6) / T);
    const y0 = Math.floor((view.y - T * 0.6) / T);
    const y1 = Math.floor((view.bottom + T * 1.2) / T); // ต้นไม้สูงโผล่จาก chunk ล่าง
    const want = new Set<string>();
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) want.add(`${cx},${cy}`);

    for (const [k, list] of this.active) {
      if (want.has(k)) continue;
      for (const s of list) {
        this.sprites.delete(s.info);
        s.destroy();
      }
      this.active.delete(k);
    }
    for (const k of want) {
      if (this.active.has(k)) continue;
      this.active.set(k, (this.byChunk.get(k) ?? []).map((n) => this.spawn(n)));
    }
    for (const s of this.sprites.values()) s.tick(worldTime);
  }
}
