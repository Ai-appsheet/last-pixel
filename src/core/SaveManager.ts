import type { Slot } from '../components/Inventory';
import { scopedKey } from './AccountService';
import { Sync } from './backend/Sync';
import type { NodeData } from '../world/WorldGenerator';
import type { Weather } from '../systems/WeatherSystem';

/** เซฟของผู้เล่นในห้องเซิร์ฟเวอร์ — โลกสร้างใหม่จาก seed ของห้อง แล้วใส่ "ส่วนที่เปลี่ยน" ทับ */
export interface RunSave {
  version: 3;
  savedAt: number;
  roomId: string;
  slot: number;
  character: string;
  worldTime: number;
  day: number;
  time: number;
  weather: Weather;
  player: {
    x: number; y: number; hp: number; hunger: number; thirst: number; stamina: number; temp: number; sanity: number;
    selected: number; slots: (Slot | null)[]; armor: Slot | null; cosmetic: { outfit?: string; helmet?: string; cape?: string };
    /** อุปกรณ์สวมใส่ 12 ช่อง */
    equip?: Partial<Record<string, Slot | null>>;
    /** ค่าที่อัปจากผลึกพลัง */
    trained?: Partial<Record<string, number>>;
    level?: number;
    /** แปลนที่เรียนรู้แล้ว */
    blueprints?: string[];
    /** ดันเจี้ยน: วันที่เกิดมอนล่าสุด + ที่พิชิตแล้ว */
    interiors?: { spawnedDay?: [number, number][]; conquered?: number[] };
    /** ซื้อชีวิตไปแล้วกี่ครั้ง */
    revives?: number;
    xp?: number;
  };
  wallet: { coins: number; gems: number };
  /** [id, available, hp, regrowAt] */
  nodes: [number, boolean, number, number][];
  extraNodes: NodeData[];
  removedNodes: number[];
  tiles: [number, number, number][];
  structures: { id: string; tx: number; ty: number; lv?: number; hp: number; fuel: number; crop: string | null; growth: number; storage: (Slot | null)[] | null; prog?: number; water?: number }[];
  /** ยานพาหนะทุกชนิด (ชนิดดูจาก id) · energy = แรงม้า/แรงลอย · cargo = ห้องเก็บของ */
  boats: { id: string; lv?: number; x: number; y: number; hp: number; fuel: number; energy?: number; cargo?: (Slot | null)[] | null }[];
  graves: { x: number; y: number; items: Slot[] }[];
  crates: boolean[];
  mailboxReady: boolean;
  mailbox: [string, number][];
  quest: { index: number; progress: number };
  kills: number;
  counters: Record<string, number>;
  visited: string[];
  survived: number;
  trades: number;
  introSeen: boolean;
  /** เลือกแปลนเริ่มต้นแล้ว (เซฟเก่าไม่มี = ถือว่าเลือกแล้ว) */
  starterPicked?: boolean;
  /** สร้างฟรีได้ 1 ครั้ง (ฐานเริ่มต้น) */
  freeBuilds?: string[];
  showcase?: boolean;
  /** แปลนที่ปักหมุดไว้ (b:<id> / r:<recipeId>) */
  pinned?: string;
}

/** เซฟแยกตามบัญชี (ออนไลน์: localStorage เป็นแคช แล้ว Sync ส่งขึ้นเซิร์ฟเวอร์เบื้องหลัง) */
const key = () => scopedKey('lastpixel.run.v2');

export const SaveManager = {
  save(data: RunSave) {
    try {
      localStorage.setItem(key(), JSON.stringify(data));
      Sync.markSave(data.savedAt);
      return true;
    } catch {
      return false;
    }
  },

  load(): RunSave | null {
    try {
      const raw = localStorage.getItem(key());
      if (!raw) return null;
      const d = JSON.parse(raw) as RunSave;
      // v3: แมพใหญ่ขึ้น (ช่องเกาะ 144) — เซฟเก่าพิกัดไม่ตรง ใช้ไม่ได้
      return d.version === 3 ? d : null;
    } catch {
      return null;
    }
  },

  clear() {
    try {
      localStorage.removeItem(key());
    } catch {
      /* ignore */
    }
    Sync.markSaveCleared();
  },

  /** ส่งเซฟขึ้นเซิร์ฟเวอร์เดี๋ยวนี้ (บันทึกและออก) */
  flush() {
    void Sync.flush();
  },
};
