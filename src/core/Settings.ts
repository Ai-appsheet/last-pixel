/**
 * การตั้งค่าเกม (เก็บในเครื่อง) — เสียงอยู่ที่ Sfx.settings, โหมดควบคุมอยู่ที่ ControlMode
 * ที่นี่: มุมกล้อง/ซูมเริ่มต้น ตัวเลือกการแสดงผล และคุณภาพภาพ
 */
export interface GameSettings {
  /** มุมกล้อง 2.5D เริ่มต้น 0 (บนลงล่าง) .. 0.9 */
  tilt: number;
  /** ซูมเริ่มต้น 1.25 .. 5 */
  zoom: number;
  /** การ์ดข้อมูลตอนชี้/จิ้ม/เดินใกล้ */
  infoCards: boolean;
  /** จอสั่นตอนโดนตี/ระเบิด */
  shake: boolean;
  /** คุณภาพภาพ (ดู core/Quality.ts) */
  quality: QualityPref;
  /** เดินด้วยเมาส์ (กดค้าง/คลิกพื้น — systems/MouseMove) */
  mouseMove: boolean;
  /** ตำแหน่ง/ขนาด/ความทึบปุ่มสัมผัส แยกตามสัดส่วนจอ (ui/TouchLayout.ts) — ไม่มี = ค่าเริ่มต้น */
  touchLayouts?: Record<string, Record<string, { x: number; y: number; s: number; a: number }>>;
  /** จอย: ลอยตามนิ้ว / คงที่ · เดดโซน 0–0.4 */
  joyMode?: 'floating' | 'fixed';
  joyDead?: number;
}

export type QualityPref = 'auto' | 'high' | 'medium' | 'low';

const KEY = 'lastpixel.game.settings.v1';
const DEFAULTS: GameSettings = { tilt: 0, zoom: 3, infoCards: true, shake: true, quality: 'auto', mouseMove: true };
let cache: GameSettings | null = null;

export function getSettings(): GameSettings {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache!;
}

export function setSettings(patch: Partial<GameSettings>) {
  cache = { ...getSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}
