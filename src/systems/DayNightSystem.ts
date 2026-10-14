import { BALANCE } from '../config/balance';
import { EventBus } from '../core/EventBus';

export type Phase = 'day' | 'dusk' | 'night' | 'dawn';

// สัดส่วนของวัน: กลางวัน 3/8, เย็น 1/8, กลางคืน 3/8, รุ่งสาง 1/8
const DUSK = 3 / 8;
const NIGHT = 4 / 8;
const DAWN = 7 / 8;
const MAX_DARK = 0.88;

export class DayNightSystem {
  /** 0..1 ของวัน */
  time = BALANCE.startTime;
  day = 1;
  private lastPhase: Phase;

  constructor() {
    this.lastPhase = this.phase;
  }

  get phase(): Phase {
    const t = this.time;
    if (t < DUSK) return 'day';
    if (t < NIGHT) return 'dusk';
    if (t < DAWN) return 'night';
    return 'dawn';
  }

  get isNight() {
    return this.phase === 'night';
  }

  /** คืนนี้เป็นจันทร์เลือด (DisasterSystem ตั้งตอนพลบค่ำเมื่อภัยคือ 'คืนจันทร์เลือด') */
  bloodMoon = false;

  get isBloodMoon() {
    return this.bloodMoon && (this.phase === 'dusk' || this.phase === 'night');
  }

  /** ความมืด 0..MAX_DARK */
  get darkness(): number {
    const t = this.time;
    if (t < DUSK) return 0;
    if (t < NIGHT) return ((t - DUSK) / (NIGHT - DUSK)) * MAX_DARK;
    if (t < DAWN) return MAX_DARK;
    return (1 - (t - DAWN) / (1 - DAWN)) * MAX_DARK;
  }

  /** นาฬิกาในเกม (เริ่มวัน = 06:00) */
  get clock(): string {
    const minutes = Math.floor(((this.time * 24 + 6) % 24) * 60);
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60 / 10) * 10;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** วันที่รอดมาแล้ว (ทศนิยม) ใช้คิดคะแนน */
  get daysSurvived() {
    return this.day - 1 + this.time;
  }

  update(dt: number) {
    this.time += dt / BALANCE.dayLength;
    if (this.time >= 1) {
      this.time -= 1;
      this.day++;
    }
    const p = this.phase;
    if (p !== this.lastPhase) {
      if (p === 'day') EventBus.emit('day:start', this.day);
      if (p === 'night') EventBus.emit('night:start', this.day, this.isBloodMoon);
      if (p === 'dusk') EventBus.emit('phase:dusk', this.day);
      this.lastPhase = p;
    }
  }
}
