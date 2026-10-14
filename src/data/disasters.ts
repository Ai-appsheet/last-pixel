/** ภัยพิบัติประจำคืน — ทุกเกาะโดนทุกคืน ต้องต้านให้ได้ */
export interface DisasterDef {
  id: string;
  name: string;
  warning: string;
  color: string;
  /** แต่ละระลอก: [มอนสเตอร์, จำนวนฐาน] — จำนวนจริงเพิ่มตามวัน */
  waves: [string, number][][];
  /** มาจากไหน: land = ขอบเกาะ, sea = ชายฝั่ง/ทะเล, sky = บินมา */
  from: 'land' | 'sea' | 'sky';
  /** meteor ฝนอุกกาบาต · storm ฟ้าแดง (ราชาปีศาจ) · blood จันทร์เลือด · fog หมอกผี */
  special?: 'meteor' | 'storm' | 'blood' | 'fog';
  /** บอสท้ายภัย (ถ้ามี) — 'legend' = สุ่มสัตว์ในตำนานตามวัน (ดู disasterForDay) */
  boss?: string;
  /** ภาพการ์ดเปิดคืน (public/art/<art>.jpg) — ไม่ระบุ = raid_night */
  art?: string;
  /** เริ่มสุ่มได้ตั้งแต่วันที่ */
  minDay?: number;
}

/** สัตว์ในตำนานที่นำทัพบุกได้ (บก/บิน — ไม่รวมคราเคนที่อยู่แต่ในน้ำ) */
export const LEGEND_RAIDERS = ['naga', 'garuda', 'qilin', 'phoenix', 'kochasi', 'frost_dragon', 'stone_turtle'];

export const DISASTERS: DisasterDef[] = [
  {
    id: 'zombie_horde', name: 'ฝูงซอมบี้บุก', warning: 'เสียงคำรามดังจากป่า… ฝูงซอมบี้กำลังมา!', color: '#7fae5a', from: 'land',
    waves: [[['zombie', 5]], [['zombie', 5], ['skeleton', 2]], [['zombie', 6], ['skeleton', 3]]],
  },
  {
    id: 'sea_invasion', name: 'ปูยักษ์ขึ้นฝั่ง', warning: 'คลื่นปั่นป่วน… ปูยักษ์และงูทะเลกำลังขึ้นฝั่ง!', color: '#ef7d57', from: 'sea',
    waves: [[['crab', 3]], [['crab', 4], ['serpent', 1]], [['crab', 4], ['serpent', 2]]], boss: 'crab_king',
  },
  {
    id: 'swarm', name: 'ฝูงค้างคาวและสไลม์', warning: 'ท้องฟ้ามืดมิด… ฝูงค้างคาวบินมา!', color: '#a77bdb', from: 'sky',
    waves: [[['bat', 6]], [['bat', 5], ['slime', 3]], [['bat', 6], ['slime', 4]]],
  },
  {
    id: 'meteor', name: 'ฝนอุกกาบาต', warning: 'ดาวตกเต็มฟ้า… หลบอุกกาบาต! (ได้แร่อุกกาบาต)', color: '#ffcd75', from: 'land', special: 'meteor',
    waves: [[['imp', 3]], [['imp', 4]], [['imp', 4], ['golem', 1]]],
  },
  {
    id: 'golem_march', name: 'กองทัพโกเลม', warning: 'พื้นสั่นสะเทือน… โกเลมกำลังมาทำลายฐาน!', color: '#94b0c2', from: 'land',
    waves: [[['golem', 1], ['skeleton', 3]], [['golem', 1], ['skeleton', 4]], [['golem', 2], ['zombie', 4]]],
  },
  // ---------- ภัยกลางคืนชุดใหม่ ----------
  {
    id: 'blood_moon', name: 'คืนจันทร์เลือด', warning: 'พระจันทร์กลายเป็นสีเลือด… ฝูงหมาป่าคลั่งกำลังล่า!', color: '#d04a5a', from: 'land', special: 'blood', art: 'raid_blood_moon', minDay: 4,
    waves: [[['blood_wolf', 4]], [['blood_wolf', 4], ['wolf', 3]], [['blood_wolf', 5]]], boss: 'alpha_wolf',
  },
  {
    id: 'ghost_night', name: 'คืนหมอกผี', warning: 'หมอกเย็นเยียบคืบคลานเข้ามา… วิญญาณเร่ร่อนออกหาผู้รอดชีวิต!', color: '#9aa4c0', from: 'land', special: 'fog', art: 'raid_ghost_night', minDay: 3,
    waves: [[['shade', 5]], [['shade', 4], ['wraith', 3]], [['wraith', 4], ['skeleton', 2]]],
  },
  {
    id: 'skeleton_army', name: 'กองทัพโครงกระดูก', warning: 'เสียงกระดูกกระทบกันดังทั่วเกาะ… กองทัพโครงกระดูกพร้อมนักธนูกำลังบุก!', color: '#ffe08a', from: 'land', art: 'raid_skeleton_army', minDay: 6,
    waves: [[['skeleton', 3], ['skeleton_warrior', 2]], [['skeleton', 4], ['skeleton_warrior', 3]], [['skeleton', 4], ['skeleton_warrior', 4]]], boss: 'skeleton_general',
  },
  {
    id: 'insect_swarm', name: 'ฝูงแมลงยักษ์', warning: 'เสียงหึ่งดังกระหึ่ม… ฝูงด้วงยักษ์และราชินีแมลงกำลังมา!', color: '#b07bff', from: 'land', art: 'raid_insect_swarm', minDay: 7,
    waves: [[['giant_beetle', 5]], [['giant_beetle', 5], ['bat', 3]], [['giant_beetle', 6], ['scorpion', 2]]], boss: 'insect_queen',
  },
  {
    id: 'sea_rage', name: 'ทะเลคลั่ง', warning: 'คลื่นซัดสาด ทะเลเดือดพล่าน… ฉลาม หนวดคราเคน และปูยักษ์บุกฝั่ง!', color: '#41a6f6', from: 'sea', art: 'raid_sea_rage', minDay: 5,
    waves: [[['crab', 4], ['shark', 2]], [['crab', 4], ['kraken_tentacle', 2], ['serpent', 1]], [['hermit_crab', 3], ['shark', 3], ['kraken_tentacle', 2]]],
  },
  {
    id: 'legend_raid', name: 'สัตว์ในตำนานบุก', warning: '⚠ สัตว์ในตำนานนำทัพมาบุกเกาะ! เตรียมอาวุธที่ดีที่สุด!', color: '#ffcd75', from: 'land', art: 'raid_legend', minDay: 12,
    waves: [[['golem', 1], ['imp', 3]], [['skeleton', 4], ['imp', 3]]], boss: 'legend',
  },
  {
    id: 'demon_night', name: 'คืนแห่งราชาปีศาจ', warning: '⚠ ราชาปีศาจตื่นแล้ว! ปกป้องเกาะของคุณ!', color: '#b13e53', from: 'land', special: 'storm',
    waves: [[['imp', 4], ['skeleton', 2]], [['imp', 4], ['golem', 1]]], boss: 'demon_lord',
  },
];

/** แปลงบอส 'legend' เป็นสัตว์ในตำนานตัวจริง (ตาม seed + วัน) */
export function resolveDisaster(d: DisasterDef, day: number, seed: number): DisasterDef {
  if (d.boss !== 'legend') return d;
  return { ...d, boss: LEGEND_RAIDERS[Math.abs(seed + day * 31) % LEGEND_RAIDERS.length] };
}

/** เลือกภัยของวัน: ทุก 5 วันคือราชาปีศาจ, ที่เหลือสุ่มตาม seed+วัน จากภัยที่ปลดล็อกแล้ว (minDay) */
export function disasterForDay(day: number, seed: number): DisasterDef {
  if (day % 5 === 0) return DISASTERS[DISASTERS.length - 1];
  const pool = DISASTERS.slice(0, -1).filter((d) => (d.minDay ?? 1) <= day);
  return resolveDisaster(pool[Math.abs(seed + day * 7919) % pool.length], day, seed);
}
