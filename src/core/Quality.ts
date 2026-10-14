import { EventBus } from './EventBus';
import { getSettings, setSettings, type QualityPref } from './Settings';

/**
 * คุณภาพภาพ (หน้าตั้งค่า → คุณภาพภาพ อัตโนมัติ/สูง/กลาง/ต่ำ)
 *  high   = เต็มที่ (มุม 2.5D, เรืองแสง Lv10, อนุภาคเต็ม)
 *  medium = ลดอนุภาค/ฝน/แสงไฟ ปิดเรืองแสง Lv10 (ค่าเริ่มของมือถือ)
 *  low    = ปิดมุม 2.5D + ลดอนุภาคเหลือน้อย + มินิแมปวาดช้าลง
 * auto = มือถือ/แท็บเล็ตเริ่มที่ "กลาง" (จอเล็กมาก = "ต่ำ") · คอมเริ่ม "สูง"
 *        แล้วลดลงเองถ้า FPS ต่ำกว่า 45 ติดกันหลายวินาที (ไม่ปรับขึ้นเองในรอบเล่นเดียวกัน กันภาพกระพริบไปมา)
 */
export type QualityLevel = 'high' | 'medium' | 'low';

export const QUALITY_PREFS: { id: QualityPref; label: string }[] = [
  { id: 'auto', label: 'อัตโนมัติ' },
  { id: 'high', label: 'สูง' },
  { id: 'medium', label: 'กลาง' },
  { id: 'low', label: 'ต่ำ' },
];

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];
const NAMES: Record<QualityLevel, string> = { high: 'สูง', medium: 'กลาง', low: 'ต่ำ' };

/** เครื่องจอสัมผัส (มือถือ/แท็บเล็ต) */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** มือถือจริง (จอสัมผัส + ด้านสั้นของจอไม่เกิน 500 css px) */
export function isPhone(): boolean {
  if (!isTouchDevice()) return false;
  return Math.min(screen.width, screen.height) <= 500;
}

/** ระดับที่ auto ลดลงมาแล้วในรอบเล่นนี้ */
let autoLevel: QualityLevel | null = null;

function autoStart(): QualityLevel {
  if (!isTouchDevice()) return 'high';
  // มือถือ CPU น้อย/จอเล็กมาก → ต่ำ · มือถือทั่วไป/แท็บเล็ต → กลาง
  const cores = navigator.hardwareConcurrency || 4;
  return isPhone() && cores <= 4 ? 'low' : 'medium';
}

export function qualityPref(): QualityPref {
  return getSettings().quality;
}

/** ระดับคุณภาพที่ใช้งานจริงตอนนี้ */
export function quality(): QualityLevel {
  const p = qualityPref();
  if (p !== 'auto') return p;
  return autoLevel ?? (autoLevel = autoStart());
}

export function setQualityPref(p: QualityPref) {
  setSettings({ quality: p });
  autoLevel = null;
  EventBus.emit('quality', quality());
}

/** ค่าที่ระบบต่างๆ ใช้ปรับตามคุณภาพ */
export function qualityKnobs(q = quality()) {
  return {
    /** มุม 2.5D (post-effect ทั้งจอ) */
    tilt: q !== 'low',
    /** แสงเรืองรอบของ Lv10 (preFX ต่อชิ้น) */
    glow: q === 'high',
    /** ตัวคูณจำนวนอนุภาคบรรยากาศ (หิ่งห้อย ประกายน้ำ ควัน ใบไม้) */
    particles: q === 'high' ? 1 : q === 'medium' ? 0.6 : 0.3,
    /** ตัวคูณจำนวนเม็ดฝน/หิมะ/ทราย */
    weather: q === 'high' ? 1 : q === 'medium' ? 0.6 : 0.35,
    /** จำนวนแหล่งแสงสูงสุดตอนกลางคืน (ใกล้ผู้เล่นก่อน) */
    lights: q === 'high' ? 64 : q === 'medium' ? 28 : 12,
    /** วาดมินิแมปใหม่ทุกกี่ ms */
    minimapMs: q === 'high' ? 400 : q === 'medium' ? 600 : 900,
  };
}

/**
 * เฝ้า FPS ในเกม (เรียกทุกเฟรมจาก GameScene) — โหมด auto: FPS < 45 นาน 4 วิ → ลดคุณภาพ 1 ขั้น
 * ไม่นับช่วงแรกหลังเข้าเกม 3 วิ (โหลด texture) และตอนแท็บถูกซ่อน
 */
export class FpsWatch {
  private low = 0;
  private warm = 3;

  update(dt: number, fps: number) {
    if (qualityPref() !== 'auto') return;
    if (this.warm > 0) {
      this.warm -= dt;
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) return;
    this.low = fps < 45 ? this.low + dt : Math.max(0, this.low - dt * 2);
    if (this.low < 4) return;
    this.low = 0;
    this.warm = 3;
    const cur = quality();
    const i = ORDER.indexOf(cur);
    if (i >= ORDER.length - 1) return;
    autoLevel = ORDER[i + 1];
    EventBus.emit('quality', autoLevel);
    EventBus.emit('toast', `⚙ ลดคุณภาพภาพเป็น "${NAMES[autoLevel]}" ให้เล่นลื่นขึ้น (ปรับได้ในตั้งค่า)`, '#94b0c2');
  }
}

export const qualityName = (q = quality()) => NAMES[q];
