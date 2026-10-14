export type SkillId = 'quick_fix' | 'snipe' | 'first_aid' | 'harvest_rain' | 'dash' | 'spirit_ward' | 'overclock';

export type UnlockRule =
  | { type: 'default' }
  | { type: 'stat'; stat: 'bestDays' | 'cropsHarvested' | 'islandsVisited' | 'bossKills' | 'totalKills'; value: number; text: string };

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  passiveText: string;
  skillText: string;
  weaknessText: string;
  /** สีตามช่องในเทมเพลตตัวละคร (1 ผม/หมวก 8 ไฮไลต์ผม 2 ผิว 9 เงาผิว 3 ตา 4 เสื้อ 5 เงาเสื้อ 6 กางเกง 7 รองเท้า) */
  colors: Record<string, string>;
  stats: { hp: number; speed: number; stamina: number; hungerRate: number; thirstRate: number; damageMult: number };
  passive: {
    materialCost?: number;
    structureHp?: number;
    extraMeat?: number;
    healMult?: number;
    cropSpeed?: number;
    noDarkSanity?: boolean;
    /** หุ่นยนต์: ไม่หิว/ไม่กระหาย ใช้แบตเตอรี่แทน (แสดงในช่องความหิว) */
    robot?: boolean;
    bagSize?: number;
  };
  skill: { id: SkillId; name: string; cooldown: number };
  unlock: UnlockRule;
}

/** ทุกตัวละครเริ่มต้นเท่ากัน — ไม่มีสาย/อาชีพ ต่างกันแค่หน้าตา (ความเก่งมาจากอุปกรณ์ + ฐาน + ผลึกพลัง) */
const BASE_STATS: CharacterDef['stats'] = { hp: 180, speed: 62, stamina: 100, hungerRate: 1, thirstRate: 1, damageMult: 1 };
/** สกิลติดตัวเหมือนกันทุกคน */
const SHARED_SKILL: CharacterDef['skill'] = { id: 'first_aid', name: 'ปฐมพยาบาล', cooldown: 30 };

const C = (id: string, name: string, desc: string, colors: Record<string, string>): CharacterDef => ({
  id, name, title: name, desc, passiveText: '', skillText: 'ปฐมพยาบาล (Q): ฟื้น HP 35 + สติ 20', weaknessText: '',
  colors, stats: { ...BASE_STATS }, passive: {}, skill: { ...SHARED_SKILL }, unlock: { type: 'default' },
});

export const CHARACTERS: CharacterDef[] = [
  C('mechanic', 'ต้น', 'หนุ่มแว่นช่าง ผมตั้ง ชุดหมีสีส้ม', { 1: 'm', 8: 'M', 2: 'K', 9: 'k', 3: 'O', 4: 'r', 5: 'R', 6: 'B', 7: 'F' }),
  C('medic', 'ฝน', 'สาวผมทอง ชุดขาว หมวกพยาบาล', { 1: 'O', 8: 'F', 2: 'K', 9: 'k', 3: 'O', 4: 'W', 5: 'L', 6: 'b', 7: 'F' }),
  C('hunter', 'เสือ', 'ฮู้ดเขียว ผิวแทน ชุดหนังสัตว์', { 1: 'T', 8: 'G', 2: 'k', 9: 'M', 3: 'O', 4: 'N', 5: 'M', 6: 'm', 7: 'n' }),
  C('farmer', 'ข้าว', 'หมวกฟาง เอี๊ยมยีนส์ ยิ้มง่าย', { 1: 'Y', 8: 'y', 2: 'k', 9: 'M', 3: 'O', 4: 'G', 5: 'H', 6: 'B', 7: 'm' }),
  C('scout', 'ลม', 'ผมดำฟู ผ้าคลุมแดง คล่องแคล่ว', { 1: 'R', 8: 'r', 2: 'K', 9: 'k', 3: 'O', 4: 'b', 5: 'B', 6: 'F', 7: 'O' }),
  C('shaman', 'มืด', 'ผมยาว ที่คาดหัวขนนก ลายเผ่า', { 1: 'P', 8: 'u', 2: 'k', 9: 'M', 3: 'C', 4: 'P', 5: 'O', 6: 'U', 7: 'O' }),
  C('robot', 'B-07', 'หุ่นยนต์เงินตาฟ้า เสาอากาศบนหัว', { 1: 'L', 8: 'W', 2: 'D', 9: 'F', 3: 'C', 4: 'L', 5: 'D', 6: 'F', 7: 'O', p: 'C' }),
];

export const ZOMBIE_COLORS: Record<string, string> = { 1: 'F', 8: 'D', 2: 'Z', 9: 'H', 3: 'R', 4: 'P', 5: 'O', 6: 'U', 7: 'O', p: 'H' };
export const RIVAL_COLORS: Record<string, string> = { 1: 'O', 8: 'F', 2: 'k', 9: 'M', 3: 'R', 4: 'R', 5: 'P', 6: 'F', 7: 'O' };
export const MERCHANT_COLORS: Record<string, string> = { 1: 'Y', 8: 'y', 2: 'k', 9: 'M', 3: 'O', 4: 'P', 5: 'U', 6: 'P', 7: 'm' };
export const SHADE_COLORS: Record<string, string> = { 1: 'O', 8: 'U', 2: 'U', 9: 'O', 3: 'u', 4: 'O', 5: 'U', 6: 'O', 7: 'O', p: 'U' };

export const getCharacter = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
