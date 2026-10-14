/**
 * กิจกรรมตามเวลาจริง (ข้อมูล + ตารางเวลา) — ไม่มี Phaser ในไฟล์นี้ (สคริปต์ทดสอบใน Node เรียกใช้ได้)
 *  - เกาะกลาง / เกาะมหาสมบัติ: เปิดวันละ 2 รอบ รอบละ 60 นาที เวลาสุ่มตามวัน (ทุกคนเห็นตารางเดียวกัน)
 *  - เกาะกิจกรรม (ป๊อปอัปกลางทะเล): วันละ 4–6 ครั้ง ครั้งละ 30–45 นาที ระบบเลือกเอง
 * เวลาในตาราง = นาทีนับจากเที่ยงคืนไทย (0..1440)
 */
import { seededRandom } from '../core/WorldClock';
import type { Biome } from './islands';
import type { NodeType } from '../world/WorldGenerator';

export type GateKind = 'center' | 'special';
export interface TimeWindow {
  start: number;
  end: number;
}

/** รอบละ 60 นาที · เริ่มได้ 06:00–23:00 · สองรอบห่างกัน ≥ 4 ชม. (ปิดรอบแรก → เปิดรอบสอง) */
export const GATE_OPEN_MIN = 60;
export const GATE_EARLIEST = 6 * 60;
export const GATE_LATEST_START = 23 * 60;
export const GATE_GAP = 4 * 60;
/** เกาะกลางกับเกาะมหาสมบัติเปิดซ้อนกันได้ไม่เกิน 30 นาที (ไม่ซ้อนกันทั้งรอบ) */
export const GATE_MAX_OVERLAP = 30;

export type EventTypeId = 'shipwreck' | 'crystal_cave' | 'volcano' | 'flower' | 'reef';

export interface EventTypeDef {
  id: EventTypeId;
  name: string;
  icon: string;
  desc: string;
  /** ไบโอมที่ยืมใช้ (สัตว์ประจำเกาะ อากาศ ผิวพื้น ภัยกลางวัน) */
  biome: Biome;
  shape: 'blob' | 'atoll';
  r: [number, number];
  color: string;
  /** texture ของหีบสมบัติบนเกาะ */
  chest: 'crate' | 'reward_chest';
  /** ทรัพยากรต่อชนิดพื้น (หนาแน่นกว่าเกาะปกติ) */
  nodes: Partial<Record<'land' | 'forest' | 'stone' | 'sand' | 'brick', [NodeType, number][]>>;
}

export const EVENT_TYPES: Record<EventTypeId, EventTypeDef> = {
  shipwreck: {
    id: 'shipwreck', name: 'ซากเรือสมบัติ', icon: '⛵', desc: 'เรือสินค้าอับปาง — ถังไม้ ลังสินค้า ซากปืนใหญ่ เหรียญทอง', biome: 'atoll', shape: 'blob', r: [26, 32], color: '#ffcd75', chest: 'crate',
    nodes: {
      sand: [['wreckage', 0.035], ['barrel', 0.03], ['event_chest', 0.0035], ['cannon', 0.01], ['clam', 0.02], ['tree', 0.015]],
      land: [['barrel', 0.025], ['wreckage', 0.02], ['event_chest', 0.0025], ['grass', 0.06], ['bush', 0.03], ['tree', 0.04]],
    },
  },
  crystal_cave: {
    id: 'crystal_cave', name: 'ถ้ำคริสตัล', icon: '💎', desc: 'ผลึกโผล่จากใต้ทะเล — แร่และคริสตัลหนาแน่น มีโกเลมเฝ้า', biome: 'crystal', shape: 'blob', r: [28, 34], color: '#73eff7', chest: 'reward_chest',
    nodes: {
      stone: [['crystal', 0.09], ['ore_iron', 0.05], ['ore_gold', 0.02], ['rock', 0.05], ['event_chest', 0.0025]],
      land: [['crystal', 0.04], ['rock', 0.04], ['herb', 0.012], ['event_chest', 0.0025]],
      sand: [['rock', 0.03], ['clam', 0.015]],
    },
  },
  volcano: {
    id: 'volcano', name: 'เกาะภูเขาไฟชั่วคราว', icon: '🌋', desc: 'ภูเขาไฟเพิ่งดันตัวขึ้นจากทะเล — กำมะถัน ออบซิเดียน ปีศาจไฟ', biome: 'volcanic', shape: 'blob', r: [26, 32], color: '#ef7d57', chest: 'reward_chest',
    nodes: {
      stone: [['obsidian', 0.07], ['ore_sulfur', 0.05], ['ore_coal', 0.035], ['meteor_rock', 0.006], ['event_chest', 0.0025]],
      land: [['obsidian', 0.03], ['ore_sulfur', 0.02], ['rock', 0.03], ['tree', 0.02], ['event_chest', 0.0025]],
    },
  },
  flower: {
    id: 'flower', name: 'สวนดอกไม้ลอยฟ้า', icon: '🌺', desc: 'สวนผลไม้หายาก ดอกไม้ และสมุนไพร — แหล่งวิตามินชั้นดี', biome: 'bamboo', shape: 'blob', r: [27, 33], color: '#ff9fb0', chest: 'reward_chest',
    nodes: {
      forest: [['fruit_bush', 0.06], ['bamboo', 0.07], ['flower', 0.05], ['herb', 0.03], ['tree', 0.04]],
      land: [['flower', 0.08], ['fruit_bush', 0.05], ['herb', 0.04], ['bush', 0.04], ['wild_crop', 0.03], ['grass', 0.04], ['event_chest', 0.0025]],
      sand: [['tree', 0.03], ['flower', 0.02]],
    },
  },
  reef: {
    id: 'reef', name: 'แนวปะการังยักษ์', icon: '🐙', desc: 'แนวปะการังโผล่พ้นน้ำตอนน้ำลง — หอย ไข่มุก ปลา สัตว์ทะเล', biome: 'atoll', shape: 'atoll', r: [30, 36], color: '#41a6f6', chest: 'reward_chest',
    nodes: {
      sand: [['coral', 0.06], ['clam', 0.05], ['tree', 0.025], ['event_chest', 0.003], ['wreckage', 0.008]],
      land: [['clam', 0.03], ['coral', 0.03], ['bush', 0.02], ['grass', 0.04]],
    },
  },
};
export const EVENT_IDS = Object.keys(EVENT_TYPES) as EventTypeId[];

/** หีบบนเกาะกิจกรรม (เขตผจญภัย = ไม่มีเพดานกล่อง): ไม้ 50% / เหล็ก 38% / ทอง 10% / เพชร 2% */
export const EVENT_CHEST_ODDS: [string, number][] = [['box_wood', 0.5], ['box_iron', 0.38], ['box_gold', 0.1], ['box_legend', 0.02]];
export function eventChestBox(r = Math.random()): string {
  for (const [tier, p] of EVENT_CHEST_ODDS) if ((r -= p) < 0) return tier;
  return 'box_wood';
}

export interface EventPlan extends TimeWindow {
  /** id ไม่ซ้ำ เช่น '2026-10-14#2' */
  id: string;
  type: EventTypeId;
  /** 0..1 ใช้เลือกช่องทะเลว่าง (ช่องที่ใช้ได้ขึ้นกับแผนที่ของห้อง) */
  pref: number;
}

export interface DaySchedule {
  day: string;
  center: TimeWindow[];
  special: TimeWindow[];
  events: EventPlan[];
}

const step5 = (r: () => number, from: number, to: number) => from + Math.floor(r() * (Math.floor((to - from) / 5) + 1)) * 5;
const overlap = (a: TimeWindow, b: TimeWindow) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** สุ่มรอบเปิด 2 รอบของเกาะ (avoid = รอบของอีกเกาะ ห้ามซ้อนเกิน GATE_MAX_OVERLAP) */
export function gateWindows(day: string, kind: GateKind, avoid: TimeWindow[] = []): TimeWindow[] {
  const r = seededRandom(`${day}:${kind}`);
  for (let i = 0; i < 400; i++) {
    const a = step5(r, GATE_EARLIEST, GATE_LATEST_START);
    const b = step5(r, GATE_EARLIEST, GATE_LATEST_START);
    const s1 = Math.min(a, b);
    const s2 = Math.max(a, b);
    if (s2 - (s1 + GATE_OPEN_MIN) < GATE_GAP) continue;
    const w = [{ start: s1, end: s1 + GATE_OPEN_MIN }, { start: s2, end: s2 + GATE_OPEN_MIN }];
    if (w.some((x) => avoid.some((y) => overlap(x, y) > GATE_MAX_OVERLAP))) continue;
    return w;
  }
  // สำรอง (แทบไม่เกิด)
  return kind === 'center' ? [{ start: 9 * 60, end: 10 * 60 }, { start: 19 * 60, end: 20 * 60 }] : [{ start: 13 * 60, end: 14 * 60 }, { start: 21 * 60, end: 22 * 60 }];
}

/** เกาะกิจกรรม 4–6 ครั้ง/วัน · 30–45 นาที · 07:00–24:00 · ไม่ซ้อนกัน (ห่าง ≥ 15 นาที) */
export function eventPlans(day: string): EventPlan[] {
  const r = seededRandom(`${day}:events`);
  const n = 4 + Math.floor(r() * 3);
  const order = [...EVENT_IDS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out: EventPlan[] = [];
  for (let i = 0; i < n; i++) {
    const dur = 30 + Math.floor(r() * 4) * 5;
    for (let k = 0; k < 200; k++) {
      const start = step5(r, 7 * 60, 24 * 60 - dur);
      const w = { start, end: start + dur };
      if (out.some((e) => w.start < e.end + 15 && e.start < w.end + 15)) continue;
      out.push({ ...w, id: '', type: order[i % order.length], pref: r() });
      break;
    }
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((e, i) => (e.id = `${day}#${i}`));
  return out;
}

const cache = new Map<string, DaySchedule>();
export function daySchedule(day: string): DaySchedule {
  let s = cache.get(day);
  if (!s) {
    const center = gateWindows(day, 'center');
    s = { day, center, special: gateWindows(day, 'special', center), events: eventPlans(day) };
    cache.set(day, s);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
  }
  return s;
}

/**
 * เลือกช่องทะเลว่างให้เกาะกิจกรรม (deterministic จาก pref) — candidates = ช่องที่ "ไม่มีเกาะ" ภายในขอบแผนที่
 * (ไม่ใช่เกาะผู้เล่น เกาะกลาง เกาะมหาสมบัติ และไม่ติดเกาะกลาง)
 */
export function pickEventSlot(pref: number, candidates: number[]): number {
  if (!candidates.length) return -1;
  const sorted = [...candidates].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(pref * sorted.length))];
}
