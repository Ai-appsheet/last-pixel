import { api, apiBeacon } from './Api';

/**
 * ผู้เล่นในโลก (live) — เรียก presence.sync / presence.put ของ backend (Code.gs ส่วน "ผู้เล่นในโลก (live)")
 * เซิร์ฟเวอร์เก็บใน CacheService อย่างเดียว (ไม่เขียนชีต) · ตอบเฉพาะคนที่ส่งภายใน 20 วิ · ส่งได้ 1 ครั้ง/วิ ต่อบัญชี
 */
export interface PresenceOut {
  x: number;
  y: number;
  /** ช่องเกาะใต้ตัว (เซิร์ฟเวอร์ใช้กรอง area) */
  s: number;
  /** ทิศ d/u/s + พลิกซ้าย */
  f: 'd' | 'u' | 's';
  fl: boolean;
  /** ท่าล่าสุด: โจมตี / โดนตี */
  a: '' | 'atk' | 'hurt';
  /** อาชีพ + ชุด/หมวก/ผ้าคลุม (สร้างหน้าตาด้วย buildHeroTexture) */
  c: string;
  o: string;
  h: string;
  k: string;
  lv: number;
  /** HP เป็น % */
  hp: number;
  al: boolean;
  z: '' | 'home' | 'safe' | 'adv' | 'sea';
  /** ยานที่ขี่ (texture key) + ความสูงยานบิน */
  rd: string;
  alt: number;
  /** อยู่ในดันเจี้ยน/บ้าน → คนอื่นไม่เห็น */
  hid: boolean;
  name: string;
  /** เส้นทางย้อนหลัง [ms ก่อนส่ง, x, y][] */
  tr: [number, number, number][];
  /** กรองคนที่ห่างเกินกี่ช่องเกาะ */
  area: number;
}

/** ข้อมูลผู้เล่นคนอื่นจากเซิร์ฟเวอร์ (tr = [เวลาเซิร์ฟเวอร์, x, y][] เก่า→ใหม่ · t = เวลาที่ส่งล่าสุด) */
export interface PresenceIn {
  id: string;
  n: string;
  x: number;
  y: number;
  s: number;
  f: string;
  fl: number;
  a: string;
  c: string;
  o: string;
  h: string;
  k: string;
  lv: number;
  hp: number;
  al: number;
  z: string;
  rd: string;
  alt: number;
  tr: [number, number, number][];
  t: number;
}

/** ส่งของเรา + รับคนอื่นในคำขอเดียว */
export function presenceSync(me: PresenceOut) {
  return api<{ players: PresenceIn[]; serverTime: number; rated: boolean }>('presence.sync', { ...me }, { timeout: 10000, retries: 0 });
}

/** ออกจากโลก (ปิดหน้า/กลับหน้าแรก) — ลบตำแหน่งเราทันที */
export function presenceBye() {
  apiBeacon('presence.put', { bye: true });
}
