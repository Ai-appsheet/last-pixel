/**
 * ทฤษฎีดนตรีพื้นฐานสำหรับเพลงสังเคราะห์: ชื่อโน้ต → MIDI → Hz, คอร์ด, บันไดเสียง
 * ไม่แตะ WebAudio (ทดสอบใน Node ได้)
 */

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pcOf(name: string): number {
  const base = LETTER[name[0]];
  if (base === undefined) throw new Error(`ชื่อโน้ตผิด: ${name}`);
  const acc = name[1] === '#' ? 1 : name[1] === 'b' ? -1 : 0;
  return (base + acc + 12) % 12;
}

/** "C#5" / "Bb4" → เลข MIDI (C4 = 60) */
export function noteToMidi(n: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error(`โน้ตผิด: ${n}`);
  return LETTER[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** ระยะครึ่งเสียงจากราก ตามชนิดคอร์ด */
const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  m9: [0, 3, 7, 10, 14],
  '7b9': [0, 4, 7, 10, 13],
};

export interface Chord {
  /** pitch class ของราก 0..11 */
  root: number;
  /** ระยะจากราก (เรียงจากต่ำ) */
  tones: number[];
  /** pitch class ของเบส (คอร์ด slash เช่น G/B) */
  bass: number;
}

const chordCache = new Map<string, Chord>();

/** "Em7" / "G/B" / "Bbmaj7" → Chord */
export function parseChord(sym: string): Chord {
  const hit = chordCache.get(sym);
  if (hit) return hit;
  const m = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m || !QUALITY[m[2]]) throw new Error(`คอร์ดผิด: ${sym}`);
  const root = pcOf(m[1]);
  const c: Chord = { root, tones: QUALITY[m[2]], bass: m[3] ? pcOf(m[3]) : root };
  chordCache.set(sym, c);
  return c;
}

const MODES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/** "G major" / "D minor" → pitch class ในบันไดเสียง */
export function scalePcs(key: string): number[] {
  const [tonic, mode] = key.split(' ');
  const t = pcOf(tonic);
  return (MODES[mode] ?? MODES.major).map((x) => (x + t) % 12);
}

/** เสียงประสานคู่ 3 ต่ำลง (เลือกคู่ 3 เล็ก/ใหญ่ที่อยู่ในบันไดเสียง) */
export function thirdBelow(m: number, scale: number[]): number {
  for (const c of [m - 3, m - 4]) if (scale.includes(((c % 12) + 12) % 12)) return c;
  return m - 3;
}
