import { CHARACTERS } from '../data/characters';
import { scopedKey } from './AccountService';
import { Sync } from './backend/Sync';

/** เซฟถาวรข้ามรอบ: เลเวลบัญชี ตัวละครที่ปลดล็อก สถิติ ความสำเร็จ โบนัสล็อกอินรายวัน */
export interface MetaData {
  version: 2;
  xp: number;
  bestDays: number;
  totalKills: number;
  runs: number;
  cropsHarvested: number;
  bossKills: number;
  islandsVisited: number;
  unlocked: string[];
  achievements: string[];
  /** วันที่ (YYYY-MM-DD) ที่รับโบนัสล็อกอินล่าสุด + จำนวนวันติดต่อกัน */
  lastLogin: string;
  loginStreak: number;
  /** คะแนน Daily Challenge รายวัน */
  daily: Record<string, number>;
  /** ชุดแฟชั่นที่ปลดล็อก ('outfit:ninja') */
  wardrobe: string[];
  playerName: string;
  lastCharacter: string;
  /** ค่าพลังรวมสูงสุดที่เคยทำได้ (เลเวล + อุปกรณ์ + ฐาน) */
  bestPower: number;
  /** คำแนะนำมือใหม่ที่โชว์ไปแล้ว (โชว์ครั้งเดียวต่อบัญชี) */
  tips?: string[];
  /** เคยกดยืนยันกฎเขตผจญภัยแล้ว (PvP · ตายถาวร) — ครั้งต่อไปแสดงแค่แบนเนอร์สั้น */
  adventureSeen?: boolean;
  /** 🎁 กล่องฟรีรายวัน (วันจริงเวลาไทย · ต่อบัญชี — สร้างเกาะใหม่ก็รับซ้ำไม่ได้) */
  dailyBox?: { lastDay: string; streak: number };
}

/** ข้อมูลถาวรแยกตามบัญชี */
const key = () => scopedKey('lastpixel.meta.v2');

const fresh = (): MetaData => ({
  version: 2, xp: 0, bestDays: 0, totalKills: 0, runs: 0, cropsHarvested: 0, bossKills: 0, islandsVisited: 0,
  unlocked: ['mechanic', 'medic'], achievements: [], lastLogin: '', loginStreak: 0, daily: {}, wardrobe: [], playerName: '', lastCharacter: 'mechanic', bestPower: 0,
});

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export type StatKey = 'bestDays' | 'cropsHarvested' | 'bossKills' | 'islandsVisited' | 'totalKills';

export const MetaSave = {
  load(): MetaData {
    try {
      const raw = localStorage.getItem(key());
      if (!raw) return fresh();
      const d = { ...fresh(), ...JSON.parse(raw) } as MetaData;
      for (const id of fresh().unlocked) if (!d.unlocked.includes(id)) d.unlocked.push(id);
      return d;
    } catch {
      return fresh();
    }
  },

  setBestPower(power: number) {
    const d = this.load();
    if (power <= (d.bestPower ?? 0)) return;
    d.bestPower = power;
    this.save(d);
  },

  save(data: MetaData) {
    try {
      localStorage.setItem(key(), JSON.stringify(data));
      Sync.markMeta();
    } catch {
      // เบราว์เซอร์บล็อก storage — เล่นต่อได้แต่ไม่บันทึก
    }
  },

  level(xp: number): { level: number; into: number; need: number } {
    let level = 1;
    let need = 200;
    let rest = xp;
    while (rest >= need) {
      rest -= need;
      level++;
      need = Math.round(need * 1.3);
    }
    return { level, into: rest, need };
  },

  isUnlocked(data: MetaData, charId: string): boolean {
    if (new URLSearchParams(location.search).has('unlockall')) return true;
    // ตัวละครต่างกันแค่หน้าตา — แบบ default เปิดให้ทุกคน
    if (CHARACTERS.find((c) => c.id === charId)?.unlock.type === 'default') return true;
    return data.unlocked.includes(charId);
  },

  /** อัปเดตสถิติระหว่างเล่น (ใช้ max สำหรับ bestDays/islandsVisited, บวกเพิ่มสำหรับตัวอื่น) */
  bump(stat: StatKey, value: number, mode: 'add' | 'max' = 'add'): string[] {
    const d = this.load();
    d[stat] = mode === 'max' ? Math.max(d[stat], value) : d[stat] + value;
    const unlocked = this.checkUnlocks(d);
    this.save(d);
    return unlocked;
  },

  checkUnlocks(d: MetaData): string[] {
    const out: string[] = [];
    for (const c of CHARACTERS) {
      if (d.unlocked.includes(c.id) || c.unlock.type !== 'stat') continue;
      if (d[c.unlock.stat] >= c.unlock.value) {
        d.unlocked.push(c.id);
        out.push(c.id);
      }
    }
    return out;
  },

  /** โบนัสล็อกอินรายวัน (วันจริง) — คืนจำนวนวันติดต่อกัน หรือ 0 ถ้ารับไปแล้ววันนี้ */
  claimLogin(): number {
    const d = this.load();
    const today = todayKey();
    if (d.lastLogin === today) return 0;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    d.loginStreak = d.lastLogin === yKey ? d.loginStreak + 1 : 1;
    d.lastLogin = today;
    this.save(d);
    return d.loginStreak;
  },

  setProfile(name: string, character: string) {
    const d = this.load();
    d.playerName = name;
    d.lastCharacter = character;
    this.save(d);
  },

  /** กล่องฟรีวันนี้: รับได้ไหม + จำนวนวันต่อเนื่องถ้ารับวันนี้ (ขาด 1 วัน = เริ่มนับใหม่) */
  dailyBoxStatus(today: string, yesterday: string): { available: boolean; streak: number } {
    const b = this.load().dailyBox;
    if (b?.lastDay === today) return { available: false, streak: b.streak };
    return { available: true, streak: b?.lastDay === yesterday ? b.streak + 1 : 1 };
  },

  /** บันทึกว่ารับกล่องฟรีวันนี้แล้ว → คืน streak (0 = รับไปแล้ว) */
  claimDailyBox(today: string, yesterday: string): number {
    const st = this.dailyBoxStatus(today, yesterday);
    if (!st.available) return 0;
    const d = this.load();
    d.dailyBox = { lastDay: today, streak: st.streak };
    this.save(d);
    return st.streak;
  },

  markAdventureSeen() {
    const d = this.load();
    d.adventureSeen = true;
    this.save(d);
  },

  addWardrobe(id: string) {
    const d = this.load();
    if (!d.wardrobe.includes(id)) d.wardrobe.push(id);
    this.save(d);
  },

  unlockAchievement(id: string): boolean {
    const d = this.load();
    if (d.achievements.includes(id)) return false;
    d.achievements.push(id);
    this.save(d);
    return true;
  },

  /** บันทึกผลรอบที่เล่นจบ → คืนรายชื่อตัวละครที่เพิ่งปลดล็อก */
  recordRun(result: { days: number; kills: number; xp: number; mode: string }): { data: MetaData; newlyUnlocked: string[] } {
    const d = this.load();
    d.xp += result.xp;
    d.bestDays = Math.max(d.bestDays, result.days);
    d.totalKills += result.kills;
    d.runs++;
    if (result.mode === 'daily') d.daily[todayKey()] = Math.max(d.daily[todayKey()] ?? 0, result.xp);
    const newlyUnlocked = this.checkUnlocks(d);
    this.save(d);
    return { data: d, newlyUnlocked };
  },
};
