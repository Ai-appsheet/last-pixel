import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { ITEMS } from '../data/items';
import { HOTBAR_SIZE } from '../components/Inventory';
import type { GameScene } from '../scenes/GameScene';

/**
 * "เก็บได้ทุกอย่าง" — ของตกแต่งบนพื้น (ดอกไม้ ก้อนกรวด หญ้าสูง เห็ด เฟิร์น ใบไม้ เปลือกหอย ดาวทะเล บัว ต้นกก ขอนไม้ลอยน้ำ)
 * กด E ข้างของ = เก็บ (มือเปล่า) → หายไปแล้วงอกใหม่ตามเวลา · ซากเครื่องบินข้างจุดเกิด = รื้อเป็นเศษเหล็ก (ต้องมีขวาน/อีเต้อ)
 * ของตกแต่งไม่ถูกเซฟ (โหลดเกมใหม่ = กลับมาครบ) — ทรัพยากรหลักยังเป็น node ปกติ
 */
interface DecorDrop {
  name: string;
  drops: [string, number, number, number][];
  regrow: number;
  color: number;
}

/** ตาม index ใน tileset 'decor' (DECOR ใน WorldGenerator) — 15 = ลายทราย (ไม่ใช่สิ่งของ) */
const DECOR_DROPS: Record<number, DecorDrop> = {
  0: { name: 'ดอกไม้', drops: [['petals', 1, 2, 1], ['herb', 1, 1, 0.1], ['carrot_seed', 1, 1, 0.06]], regrow: 200, color: 0xff9fb0 },
  1: { name: 'ดอกไม้', drops: [['petals', 1, 2, 1], ['herb', 1, 1, 0.1], ['tomato_seed', 1, 1, 0.06]], regrow: 200, color: 0xa77bdb },
  2: { name: 'ดอกไม้', drops: [['petals', 1, 2, 1], ['herb', 1, 1, 0.1]], regrow: 200, color: 0xffcd75 },
  3: { name: 'ดอกไม้', drops: [['petals', 1, 2, 1], ['herb', 1, 1, 0.1]], regrow: 200, color: 0xf4f4f4 },
  4: { name: 'ก้อนกรวด', drops: [['stone', 1, 2, 1]], regrow: 300, color: 0x94b0c2 },
  5: { name: 'หญ้าสูง', drops: [['fiber', 1, 1, 1], ['wild_grain', 1, 1, 0.25]], regrow: 150, color: 0xa7f070 },
  6: { name: 'หญ้าสูง', drops: [['fiber', 1, 1, 1], ['wild_grain', 1, 1, 0.25]], regrow: 150, color: 0xa7f070 },
  7: { name: 'เห็ดป่า', drops: [['wild_mushroom', 1, 1, 1]], regrow: 260, color: 0xc28a50 },
  8: { name: 'เฟิร์น', drops: [['fiber', 1, 2, 1], ['herb', 1, 1, 0.15]], regrow: 200, color: 0x38b764 },
  9: { name: 'กองใบไม้', drops: [['fiber', 1, 1, 1]], regrow: 160, color: 0xc28a50 },
  10: { name: 'เปลือกหอย', drops: [['shell', 1, 1, 1], ['pearl', 1, 1, 0.02]], regrow: 300, color: 0xff9fb0 },
  11: { name: 'ดาวทะเล', drops: [['shell', 1, 2, 1]], regrow: 300, color: 0xef7d57 },
  12: { name: 'ใบบัว', drops: [['fiber', 1, 1, 1], ['petals', 1, 1, 0.3]], regrow: 240, color: 0x38b764 },
  13: { name: 'ต้นกก', drops: [['fiber', 2, 2, 1]], regrow: 200, color: 0xa7f070 },
  14: { name: 'ขอนไม้ลอยน้ำ', drops: [['wood', 1, 2, 1], ['cloth', 1, 1, 0.1]], regrow: 360, color: 0x8a5a35 },
};

/** ซากเครื่องบิน: รื้อได้ 6 ครั้ง */
const WRECK_CHARGES = 6;

export class GatherSystem {
  private taken: { k: number; d: number; at: number }[] = [];
  private timer = 0;
  wreckLeft = WRECK_CHARGES;

  constructor(private s: GameScene) {}

  /** ของตกแต่งที่เก็บได้ใกล้เท้าผู้เล่น (ด้านหน้าก่อน) */
  private decorNear(): { tx: number; ty: number; k: number; d: number } | null {
    const s = this.s;
    const p = s.player;
    const w = s.world;
    const R = BALANCE.reach;
    let best: { tx: number; ty: number; k: number; d: number } | null = null;
    let bd = Infinity;
    const fx = p.x + p.aim.x * 8;
    const fy = p.feetY + p.aim.y * 8;
    const tx0 = Math.floor(fx / 16);
    const ty0 = Math.floor(fy / 16);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = tx0 + dx;
        const ty = ty0 + dy;
        if (tx < 0 || ty < 0 || tx >= w.size || ty >= w.size) continue;
        const k = ty * w.size + tx;
        const d = w.decor[k];
        if (d < 0 || !DECOR_DROPS[d]) continue;
        const dist = Phaser.Math.Distance.Between(fx, fy, tx * 16 + 8, ty * 16 + 8);
        if (dist > R + 4 || dist >= bd) continue;
        bd = dist;
        best = { tx, ty, k, d };
      }
    }
    return best;
  }

  private nearWreck(): boolean {
    const w = this.s.wreckSprite;
    if (!w) return false;
    const p = this.s.player;
    return Phaser.Math.Distance.Between(p.x, p.feetY, w.x, w.y - 6) < 40;
  }

  /** ข้อความใบ้ [E] */
  hint(): string | null {
    if (this.nearWreck()) return `รื้อซากเครื่องบิน → เศษเหล็ก (เหลือ ${this.wreckLeft} ครั้ง · ต้องมีขวาน/อีเต้อ)`;
    const d = this.decorNear();
    return d ? `เก็บ${DECOR_DROPS[d.d].name}` : null;
  }

  /** กด E → เก็บ (คืน true ถ้าทำอะไรไปแล้ว) */
  interact(): boolean {
    if (this.nearWreck()) return this.salvageWreck();
    const d = this.decorNear();
    if (!d) return false;
    const s = this.s;
    const info = DECOR_DROPS[d.d];
    const x = d.tx * 16 + 8;
    const y = d.ty * 16 + 12;
    for (const [item, a, b, chance] of info.drops) if (Math.random() < chance) s.spawnDrop(x, y, item, Phaser.Math.Between(a, b));
    s.world.decor[d.k] = -1;
    this.taken.push({ k: d.k, d: d.d, at: s.worldTime + info.regrow * (0.8 + Math.random() * 0.4) });
    s.refreshTile(d.tx, d.ty);
    s.fx.debris(x, y - 2, info.color, 4);
    Sfx.play('harvest');
    EventBus.emit('node:harvested', 'decor');
    return true;
  }

  private salvageWreck(): boolean {
    const s = this.s;
    const inv = s.player.inventory;
    let tool = false;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const t = inv.slots[i] && ITEMS[inv.slots[i]!.id].tool;
      if (t && (t.rock >= 1 || t.tree >= 3)) tool = true;
    }
    if ((s.player.beltTool('rock')?.tool.rock ?? 0) >= 1 || (s.player.beltTool('tree')?.tool.tree ?? 0) >= 3) tool = true; // ⛏ เข็มขัดเครื่องมือ
    if (!tool) {
      EventBus.emit('toast', '🔧 ต้องมีขวานหรืออีเต้อ (ช่องเครื่องมือ/hotbar) ถึงจะรื้อซากเครื่องบินได้', '#ef7d57');
      return true;
    }
    const w = s.wreckSprite!;
    const x = w.x;
    const y = w.y - 2;
    s.spawnDrop(x, y, 'scrap_metal', Phaser.Math.Between(2, 3));
    if (Math.random() < 0.5) s.spawnDrop(x, y, 'cloth', 1);
    if (Math.random() < 0.3) s.spawnDrop(x, y, 'rope', 1);
    if (Math.random() < 0.15) s.spawnDrop(x, y, 'gear', 1);
    if (Math.random() < 0.1) s.spawnDrop(x, y, 'fuel', 1);
    s.fx.debris(x, y - 8, 0x94b0c2, 8);
    s.cameras.main.shake(80, 0.002);
    Sfx.play('hitRock');
    this.wreckLeft--;
    if (this.wreckLeft <= 0) {
      s.removeWreck();
      EventBus.emit('toast', '🛩 รื้อซากเครื่องบินหมดแล้ว — ได้พื้นที่สร้างฐานเพิ่ม', '#a7f070');
    }
    EventBus.emit('node:harvested', 'wreck');
    return true;
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0 || !this.taken.length) return;
    this.timer = 2;
    const s = this.s;
    const now = s.worldTime;
    const w = s.world;
    this.taken = this.taken.filter((t) => {
      if (t.at > now) return true;
      // งอกคืนเฉพาะถ้ายังว่าง (ไม่มีสิ่งก่อสร้าง/พื้นไม่ถูกเปลี่ยน)
      const tx = t.k % w.size;
      const ty = Math.floor(t.k / w.size);
      if (w.decor[t.k] < 0 && !s.structureAt(tx, ty, 'object') && !s.structureAt(tx, ty, 'floor')) {
        w.decor[t.k] = t.d;
        s.refreshTile(tx, ty);
      }
      return false;
    });
  }
}
