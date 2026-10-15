/**
 * พาเลตต์โลก (ฉาก/พื้น/ต้นไม้/สิ่งก่อสร้าง) — โทนกลมกลืน สีเรียบ noise ต่ำ
 * กลางวันยังสดใส (หญ้าเขียวสด น้ำทะเลกรมท่าเข้ม) แต่ทุกสีอยู่ในชุดเดียวกัน · เส้นขอบเข้มอมสีวัสดุ ไม่ใช่ดำสนิท
 * ใช้คู่กับ worldTone(): ตอนสร้าง texture ของโลก สีพาเลตต์เดิม ('G', '#38b764' ฯลฯ) ถูกแปลงเข้าโทนนี้อัตโนมัติ
 */
export const WP = {
  // ---------- หญ้า (เขียวสดอมฟ้าเล็กน้อย) ----------
  grassDeep: '#2e6b4a',
  grassDark: '#3f8a55',
  grass: '#58a862',
  grassLight: '#78bf73',
  grassHi: '#a3d98c',
  grassLine: '#1f4a3a',
  // พื้นป่า (ยกสูง สีเข้มกว่า)
  forest: '#3f8c5c',
  forestDark: '#2f7150',
  forestLight: '#56a36a',
  // ---------- ทราย / ทะเลทราย / ดิน ----------
  sand: '#e2c48e',
  sandDark: '#c9a571',
  sandLight: '#efd8a8',
  sandLine: '#9a7652',
  desert: '#efbf62',
  desertDark: '#dea24e',
  desertLight: '#f6d27f',
  dirt: '#8e6a4c',
  dirtDark: '#6f513b',
  dirtLight: '#a7825f',
  // หน้าผาดิน (ด้านข้างของที่สูง)
  earthFace: '#6b5140',
  earthFaceDark: '#54402f',
  earthFaceLight: '#82654f',
  // ---------- หิน (เทาอมเขียว แบบหน้าผาทะเลทราย) ----------
  rock: '#8c8f80',
  rockLight: '#a6a898',
  rockDark: '#73766a',
  rockFace: '#5d6157',
  rockFaceDark: '#4a4d45',
  rockLine: '#2a2d28',
  // ---------- ดันเจี้ยน (สเลตเข้ม) ----------
  slab: '#465058',
  slabAlt: '#3e474f',
  slabLight: '#56616a',
  slabGrout: '#2b3238',
  wallTop: '#2a3036',
  wallTopLight: '#363e45',
  wallBrick: '#55606a',
  wallBrickLight: '#6a7680',
  wallMortar: '#353d44',
  wallLine: '#14181c',
  // ลานหิน/อิฐ (เมือง ซากโบราณ)
  plaza: '#a9aca0',
  plazaAlt: '#9b9f93',
  plazaLight: '#bfc1b4',
  plazaGrout: '#7d8176',
  // ---------- ไม้กระดาน ----------
  plank: '#c4935e',
  plankDark: '#a77a4a',
  plankLight: '#d8ab73',
  plankGap: '#6e4a30',
  // ---------- น้ำ (ทะเลลึกกรมท่า / น้ำตื้นฟ้าอมเขียว) ----------
  deep: '#1d2d4f',
  deepAlt: '#1f3358',
  deepDash: '#34507a',
  deepDashHi: '#4f74a0',
  shallow: '#28507a',
  shallowAlt: '#233f68',
  shallowDash: '#5b93b5',
  shallowHi: '#8cc0d6',
  foam: '#e8f2f2',
  foamSoft: '#b8d6df',
  bank: '#7a5e45',
  bankDark: '#5a4433',
  // ---------- หิมะ / น้ำแข็ง / เถ้า ----------
  snow: '#e6eef3',
  snowShade: '#cbd8e4',
  snowLight: '#f6f9fa',
  snowMark: '#aebfd0',
  ash: '#4a3f45',
  ashDark: '#3a3138',
  ashLight: '#5c4f55',
  ember: '#d0704a',
  // ---------- ใบไม้ (ไม้ใบกว้าง) ----------
  leaf0: '#1f4a3c',
  leaf1: '#2e6a4c',
  leaf2: '#448c58',
  leaf3: '#63ad69',
  leaf4: '#9cd487',
  // สน
  pine0: '#1b3f40',
  pine1: '#245a50',
  pine2: '#327360',
  pine3: '#4c9474',
  pine4: '#7fbf98',
  // ลำต้น
  bark0: '#3a2a24',
  bark1: '#5c4234',
  bark2: '#7d5d46',
  bark3: '#9a7a5c',
  // ---------- เส้นขอบ ----------
  line: '#1e2a30',
  lineWood: '#2e211b',
  shadow: 'rgba(16,30,36,0.30)',
} as const;

/** ชุดใบไม้ 4 เฉด (มืด → สว่าง) */
export const LEAF4 = [WP.leaf1, WP.leaf2, WP.leaf3, WP.leaf4];
export const PINE4 = [WP.pine1, WP.pine2, WP.pine3, WP.pine4];

/** สีที่ออกแบบไว้แล้วในพาเลตต์โลก — worldTone ไม่แปลงซ้ำ */
const DESIGNED = new Set<string>(Object.values(WP).map((v) => v.toLowerCase()));

/** ตัวอักษรพาเลตต์เดิม → สีโลกที่เลือกเอง (ที่เหลือแปลงด้วยสูตร HSL) */
const LETTER: Record<string, string> = {
  O: WP.line,
  G: WP.leaf3,
  g: WP.leaf4,
  H: WP.leaf2,
  T: WP.leaf1,
  V: WP.leaf0,
  M: WP.bark2,
  m: WP.bark1,
  N: WP.bark3,
  n: WP.bark0,
  S: WP.sand,
  s: WP.sandDark,
  W: '#f2f4ef',
  w: '#d8e4e6',
  L: '#a8b4bb',
  D: '#6f7c85',
  F: '#414b54',
  R: '#b4504e',
  r: '#e0845c',
  Y: '#f0c870',
  y: '#f6e8b8',
  B: '#3a6694',
  b: '#5c9cc4',
  C: '#9fdce0',
  U: '#24395f',
  P: '#653f66',
  u: '#ad8fd0',
  p: '#efa8b0',
  Z: '#82a86a',
};

type RGBA = [number, number, number, number];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const hexRgb = (h: string): RGBA => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
};

/**
 * แปลงสีหนึ่งสีเข้าโทนโลก (เรียกครั้งเดียวต่อสี แล้วแคช)
 * key = สีต้นฉบับ (ตัวอักษรพาเลตต์ / #hex / rgba) · v = ค่า rgba ที่ resolve แล้ว
 */
export function worldTone(key: string, v: RGBA): RGBA {
  if (LETTER[key]) return hexRgb(LETTER[key]);
  if (DESIGNED.has(key.toLowerCase())) return v;
  const [r, g, b, a] = v;
  // เงาโปร่งใส → เงาเย็นอมเขียวเข้ม (ไม่ใช่น้ำเงินม่วง)
  if (a < 255 && r < 60 && g < 60 && b < 80) return [16, 30, 36, a];
  let [h, s, l] = rgbToHsl(r, g, b);
  if (h >= 70 && h < 170) {
    // เขียว: ดึงเข้าหาเขียวอมฟ้า ลดความจัด
    h = h + (140 - h) * 0.35;
    s *= 0.78;
  } else if (h >= 170 && h < 260) {
    // ฟ้า/น้ำเงิน: เอียงเข้าหาฟ้าอมเขียวนิดหน่อย
    h = h + (205 - h) * 0.2;
    s *= 0.8;
  } else if (h >= 260 && h < 330) {
    s *= 0.72; // ม่วง/ชมพูจัด → นุ่มลง
  } else {
    s *= 0.85; // แดง ส้ม เหลือง น้ำตาล → อุ่นแต่ไม่แสบตา
  }
  // บีบช่วงความสว่าง: ดำไม่สนิท ขาวไม่จ้า
  l = 0.06 + l * 0.9;
  const [R, G, B] = hslToRgb(h, Math.min(1, s), l);
  return [R, G, B, a];
}
