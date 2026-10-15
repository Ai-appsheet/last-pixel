import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { HOUR, WorldClock, fmtLeft } from '../core/WorldClock';
import type { Mob } from '../entities/Mob';

/**
 * มอนที่ฆ่าแล้ว "ตายจริง" จนถึงรอบเกิดใหม่ทุก 1 ชั่วโมง (นาฬิกาจริง ตรง :00 น. — ใช้ WorldClock)
 *  - เกาะ (ทุกแบบ): แต่ละเกาะมี "โควตามอนต่อชั่วโมง" แยกตามประเภท — ฆ่าแล้วหักโควตา · เดินหนี/มอนหายเพราะไกลไม่หัก
 *    ฆ่าครบโควตา = เกาะนั้นไม่มีมอนประเภทนั้นเกิดอีกจนกว่าจะขึ้นชั่วโมงใหม่
 *  - ดันเจี้ยน: มอน/บอสทุกตัวมี id ตามจุดเกิด (`d<ช่อง>#<ลำดับ>` / `d<ช่อง>#boss`) — ตัวที่ฆ่าแล้วไม่เกิดซ้ำ (ออก-เข้าใหม่/โหลดเกมใหม่ก็ไม่กลับมา)
 *  - คู่แข่ง PvP (ต่อเกาะ) และสัตว์ในตำนาน (ต่อชนิด) ใช้กฎเดียวกัน
 *  - ภัยพิบัติกลางคืน/ภัยกลางวัน (ระลอกมอนชั่วคราว) ไม่นับ — ทำงานเหมือนเดิม
 * เก็บในเซฟ: RunSave.respawn = { hour, kills, dead } (ชั่วโมงไม่ตรง = ล้าง)
 */
export type SpawnCat = 'passive' | 'hostile' | 'night' | 'shore' | 'sea' | 'rival';

/** โควตาต่อเกาะต่อชั่วโมง (ต่อประเภท) — ฆ่าเกินนี้แล้วเกาะนั้นว่างจนถึงชั่วโมงหน้า */
export const SPAWN_STOCK: Record<Exclude<SpawnCat, 'rival' | 'night'>, number> = { passive: 20, hostile: 8, shore: 6, sea: 8 };
export const nightStock = (danger: number) => Math.ceil(4 * danger) + 2;

export const hourIndex = (t = WorldClock.now()) => Math.floor(t / HOUR);

export class RespawnSystem {
  hour = hourIndex();
  private kills = new Map<string, number>();
  private dead = new Set<string>();
  private timer = 0;

  /** เหลือกี่ ms ถึงรอบเกิดใหม่ (ต้นชั่วโมงถัดไป) */
  get msToRefresh(): number {
    return (this.hour + 1) * HOUR - WorldClock.now();
  }

  /** ข้อความนับถอยหลัง "🔄 มอนเกิดใหม่อีก 23:41" */
  get refreshText(): string {
    return `🔄 มอนเกิดใหม่อีก ${fmtLeft(this.msToRefresh)}`;
  }

  private key(area: number, cat: SpawnCat) {
    return `${area}|${cat}`;
  }

  killedIn(area: number, cat: SpawnCat): number {
    return this.kills.get(this.key(area, cat)) ?? 0;
  }

  /** ยังเกิดได้ไหม (โควตาชั่วโมงนี้เหลือ) */
  canSpawn(area: number, cat: SpawnCat, stock: number): boolean {
    return this.killedIn(area, cat) < stock;
  }

  /** ติดป้ายมอนที่เกิดจากระบบเกิดปกติ (ใช้หักโควตาตอนตาย) */
  tag(m: Mob, area: number, cat: SpawnCat): Mob {
    return m.setData('spawnArea', area).setData('spawnCat', cat);
  }

  isDead(id: string): boolean {
    return this.dead.has(id);
  }

  /** เรียกจาก GameScene.onMobKilled */
  onKill(m: Mob) {
    if (m.disaster) return;
    const id = m.getData('spawnId') as string | undefined;
    if (id) this.dead.add(id);
    if (m.def.legendary) this.dead.add(`legend:${m.def.id.split('@')[0]}`);
    const area = m.getData('spawnArea') as number | undefined;
    const cat = m.getData('spawnCat') as SpawnCat | undefined;
    if (area !== undefined && cat) this.kills.set(this.key(area, cat), this.killedIn(area, cat) + 1);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1;
    const h = hourIndex();
    if (h === this.hour) return;
    this.hour = h;
    this.kills.clear();
    this.dead.clear();
    Sfx.play('horn');
    EventBus.emit('toast', '🔄 ถึงรอบใหม่ — มอนสเตอร์และบอสทุกเกาะ/ดันเจี้ยนเกิดใหม่แล้ว', '#ffcd75');
    EventBus.emit('respawn:hour', h);
  }

  serialize() {
    return { hour: this.hour, kills: [...this.kills], dead: [...this.dead] };
  }

  load(d?: { hour: number; kills?: [string, number][]; dead?: string[] }) {
    if (!d || d.hour !== hourIndex()) return;
    this.hour = d.hour;
    this.kills = new Map(d.kills ?? []);
    this.dead = new Set(d.dead ?? []);
  }
}
