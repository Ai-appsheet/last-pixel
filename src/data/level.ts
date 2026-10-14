import type { Stats } from './equipment';

/**
 * ระบบเลเวลตัวละคร
 *  - ได้ XP จาก: ฆ่ามอนสเตอร์ · ตัดไม้/ขุดแร่/เก็บของ · คราฟต์ · สร้าง · ตกปลา · เก็บเกี่ยว · รอดภัยพิบัติ
 *  - เลเวลขึ้น = HP/สแตมินา/โจมตี/ป้องกัน เพิ่ม + ฟื้นเต็ม
 *  - ตาย = เลเวลลด 1 ขั้น (XP ในขั้นนั้นหายด้วย)
 */
export const MAX_LEVEL = 99;

/** XP ที่ต้องใช้จากเลเวล lv → lv+1 */
export const xpNeed = (lv: number) => 30 + lv * 20;

/** ค่าพลังที่ได้จากเลเวล */
export function levelStats(lv: number): Partial<Stats> {
  const n = Math.max(0, lv - 1);
  // ทนขึ้น: HP +10/เลเวล · ป้องกันติดตัว 4 (+0.5/เลเวล) ≈ ลดดาเมจ 15% ตั้งแต่ Lv1
  return { hp: n * 10, stamina: n * 2, atk: n * 1, def: 4 + n * 0.5 };
}

/** XP ต่อการกระทำ (มอนสเตอร์ใช้ค่า xp ใน mobs.ts) */
export const XP_GAIN = { harvest: 1, craft: 2, build: 3, fish: 4, crop: 2, survive: 40 } as const;
