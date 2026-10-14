export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_night', name: 'รอดคืนแรก', desc: 'อยู่รอดจนเช้าวันที่ 2' },
  { id: 'week', name: 'หนึ่งสัปดาห์บนเกาะ', desc: 'อยู่รอดครบ 7 วัน' },
  { id: 'month', name: 'หนึ่งเดือนบนเกาะ', desc: 'อยู่รอดครบ 30 วัน' },
  { id: 'lumberjack', name: 'คนตัดไม้', desc: 'ตัดต้นไม้ 25 ต้น' },
  { id: 'miner', name: 'นักขุด', desc: 'ขุดแร่ 15 ก้อน' },
  { id: 'farmer', name: 'เกษตรกร', desc: 'เก็บเกี่ยวผักครั้งแรก' },
  { id: 'angler', name: 'นักตกปลา', desc: 'ตกปลาได้ 10 ตัว' },
  { id: 'builder', name: 'สถาปนิก', desc: 'สร้างสิ่งก่อสร้าง 50 ชิ้น' },
  { id: 'sailor', name: 'กะลาสี', desc: 'สร้างเรือลำแรก' },
  { id: 'explorer', name: 'นักเดินทาง', desc: 'ไปเยือนเกาะผู้เล่นอื่น 3 เกาะ' },
  { id: 'trader', name: 'พ่อค้า', desc: 'ซื้อขายที่เกาะกลาง 10 ครั้ง' },
  { id: 'defender', name: 'ผู้พิทักษ์เกาะ', desc: 'รอดจากภัยพิบัติ 5 คืน' },
  { id: 'king_slayer', name: 'ผู้ล้มราชา', desc: 'ล้มบอสตัวแรก' },
  { id: 'demon_slayer', name: 'ปราบมาร', desc: 'ล้มราชาปีศาจ' },
  { id: 'legend_slayer', name: 'ผู้พิชิตตำนาน', desc: 'ล้มสัตว์ในตำนานได้ 1 ตัว' },
  { id: 'legend_master', name: 'จ้าวแห่งตำนาน', desc: 'ล้มสัตว์ในตำนานครบ 4 ชนิด' },
  { id: 'sea_hunter', name: 'นักล่าแห่งท้องทะเล', desc: 'ล้มสัตว์ทะเลดุร้าย (ฉลาม/ปลาไหลไฟฟ้า/ปลาหมึกยักษ์) 10 ตัว' },
  { id: 'plus7', name: 'ช่างตีมือทอง', desc: 'อัพเกรดอุปกรณ์ถึง Lv.8' },
  { id: 'legendary', name: 'ผู้ถืออาวุธเทพ', desc: 'ได้รับอาวุธระดับเทพ' },
  { id: 'rich', name: 'เศรษฐีเกาะ', desc: 'มีเหรียญ 1,000 เหรียญ' },
];
