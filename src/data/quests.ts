/** เป้าหมายเนื้อเรื่อง */
export type QuestGoal =
  | { type: 'collect'; item: string; qty: number }
  | { type: 'craft'; item: string; qty: number }
  | { type: 'build'; id: string; qty: number }
  | { type: 'kill'; mob: string; qty: number }
  | { type: 'harvest'; qty: number }
  | { type: 'fish'; qty: number }
  | { type: 'visit'; island: string }
  | { type: 'survive'; days: number }
  | { type: 'disaster'; qty: number }
  | { type: 'trade'; qty: number }
  | { type: 'enhance'; qty: number }
  | { type: 'box'; qty: number };

export interface QuestDef {
  id: string;
  chapter: number;
  title: string;
  text: string;
  goal: QuestGoal;
  reward: [string, number][];
}

/** ฉากเปิดเรื่อง (แสดงครั้งแรกครั้งเดียว) */
export const INTRO_SLIDES = [
  { title: 'ปี 2099…', text: 'โลกจมอยู่ใต้ทะเล เหลือเพียงหมู่เกาะเล็กๆ กระจายกลางมหาสมุทร\nผู้รอดชีวิตทุกคนถูกส่งขึ้นเครื่องบินอพยพ…' },
  { title: 'เครื่องบินตก', text: 'พายุพัดเครื่องบินแตกกลางอากาศ\nแคปซูลกู้ภัยพาคุณร่อนลงบน "เกาะส่วนตัว" ของคุณเอง' },
  { title: 'ภัยไม่เคยหยุด', text: 'กลางวัน: แผ่นดินไหว พายุฟ้าผ่า ไฟป่า อุกกาบาต คลื่นยักษ์ — ยิ่งอยู่นานยิ่งถี่และแรง\nกลางคืน: ฝูงมอนสเตอร์บุก และทุก 5 คืนราชาปีศาจจะมาเยือน' },
  { title: 'เกาะกลาง', text: 'ผู้รอดชีวิตคนอื่นอยู่บนเกาะรอบๆ คุณ (ทุกคนอยู่แผนที่โลกเดียวกัน)\nสร้างเรือแล้วล่องไปเกาะกลาง — ตลาดแลกเปลี่ยนที่ห้ามต่อสู้เด็ดขาด' },
  { title: 'พิชิตเกาะร้าง!', text: 'ไม่มีใครช่วยคุณ — หาแปลนจากกล่อง สร้างบ้าน อาวุธ และเรือด้วยมือตัวเอง\nบุกดันเจี้ยน 3 ชั้นใต้เกาะ ล้มบอสให้ครบ แล้วเกาะนี้จะเป็นของคุณ' },
];

/** บทสอนเล่นช่วงเริ่มต้นเท่านั้น — จบแล้วเป็นการเล่นอิสระ */
export const STORY: QuestDef[] = [
  { id: 't1', chapter: 0, title: 'ตื่นขึ้นบนเกาะ', text: 'ค้นกล่องเสบียงรอบซากเครื่องบิน (E) แล้วเก็บไม้ 8 ท่อน', goal: { type: 'collect', item: 'wood', qty: 8 }, reward: [['box_wood', 1]] },
  { id: 't2', chapter: 0, title: 'เครื่องมือชิ้นแรก', text: 'กด B เปิดสมุดแปลน → แท็บ "ไอเทม/อาวุธ" → ขวานหิน → กดสร้างเลย', goal: { type: 'craft', item: 'stone_axe', qty: 1 }, reward: [['rope', 3]] },
  { id: 't3', chapter: 0, title: 'ไฟแห่งความหวัง', text: 'กด B → แท็บ "สิ่งก่อสร้าง" → กองไฟ → สร้างเลย แล้วคลิกวางบนพื้น', goal: { type: 'build', id: 'campfire', qty: 1 }, reward: [['raw_meat', 2]] },
  { id: 't4', chapter: 0, title: 'กำแพงบ้าน', text: 'สร้างรั้วไม้ 6 ชิ้นล้อมที่พัก', goal: { type: 'build', id: 'wood_wall', qty: 6 }, reward: [['box_wood', 1]] },
  { id: 't5', chapter: 0, title: 'ประตูบ้าน', text: 'สร้างประตูไม้ (ศัตรูเดินผ่านไม่ได้ แต่คุณผ่านได้)', goal: { type: 'build', id: 'door_wood', qty: 1 }, reward: [['carrot_seed', 4]] },
  { id: 't6', chapter: 0, title: 'ปลูกผัก', text: 'สร้างแปลงผัก แล้วถือเมล็ดกด E เพื่อปลูก', goal: { type: 'build', id: 'farm_plot', qty: 2 }, reward: [['tomato_seed', 3]] },
  { id: 't7', chapter: 0, title: 'คืนภัยพิบัติแรก', text: 'หมดช่วงตั้งหลัก 2 วันแล้ว ภัยพิบัติจะเริ่มมา — รอดคืนภัยพิบัติแรก (อยู่ใกล้กองไฟ + ถืออาวุธ)', goal: { type: 'disaster', qty: 1 }, reward: [['box_iron', 1], ['bp_b_turret_arrow', 1]] },
  { id: 't8', chapter: 0, title: 'นักตกปลา', text: 'คราฟต์คันเบ็ด ถือแล้วกด E ริมน้ำ รอปลากินแล้วกดอีกครั้ง', goal: { type: 'fish', qty: 2 }, reward: [['box_wood', 1]] },
  { id: 't9', chapter: 0, title: 'ออกสู่ทะเล', text: 'สร้างแพ (B → ยานพาหนะ) วางบนน้ำริมฝั่ง แล้วกด E เพื่อขึ้นเรือ', goal: { type: 'build', id: 'raft', qty: 1 }, reward: [['coin', 30]] },
  { id: 't10', chapter: 0, title: 'ตลาดกลางทะเล', text: 'ล่องเรือไปเกาะกลาง (M ดูแผนที่) — วางขาย/ซื้อของที่แผงร้าน', goal: { type: 'visit', island: 'central' }, reward: [['box_gold', 1], ['coin', 50]] },
];
