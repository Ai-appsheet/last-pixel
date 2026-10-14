/**
 * เริ่มเกมใหม่: ผู้เล่นเลือกแปลนเริ่มต้น "ฐานที่มั่น 1 + อาวุธ 1" (เป้าหมายแรกให้ออกไปหาวัตถุดิบ)
 * ทั้งหมดเป็นแปลนขั้น 2 ที่ปกติต้องสุ่มจากกล่อง · อาวุธที่ต้องใช้ทั่ง จะได้แปลนทั่งตีเหล็กแถมด้วย
 */
export interface StarterPick {
  id: string;
  /** บรรทัดสั้นๆ บอกจุดเด่น */
  pitch: string;
  /** แปลนแถม (key) */
  bonus?: string[];
}

export const STARTER_BASES: StarterPick[] = [
  { id: 'cottage', pitch: 'สมดุล นอน+เก็บของ 28 ช่อง · หิน+ไม้' },
  { id: 'brick_house', pitch: 'ทนทานสุด กันหนาว · ใช้หินเยอะ' },
  { id: 'tree_house', pitch: 'มองไกล มีแสง · ใช้ไม้+เส้นใยล้วน' },
  { id: 'stilt_house', pitch: 'บนน้ำ ดักปลาให้เอง · ไม้+เส้นใย' },
];

export const STARTER_WEAPONS: StarterPick[] = [
  { id: 'long_bow', pitch: 'ยิงไกล ไม่ต้องใช้ทั่ง · โต๊ะช่าง' },
  { id: 'crossbow', pitch: 'แรงกว่าธนู ทะลุเป้า · โต๊ะช่าง' },
  { id: 'iron_sword', pitch: 'ฟันหลายตัว สมดุล · +แปลนทั่งตีเหล็ก', bonus: ['b:anvil'] },
  { id: 'iron_spear', pitch: 'แทงไกล ทะลุแนว · +แปลนทั่งตีเหล็ก', bonus: ['b:anvil'] },
];

/** ช่วงตั้งหลัก: กี่วันแรกที่ยังไม่มีภัยพิบัติ (กลางวัน+กลางคืน) */
export const GRACE_DAYS = 2;
