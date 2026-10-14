/**
 * โครงสร้างเพลง (ข้อมูล) + คอมไพล์ท่อนเพลงเป็นตารางโน้ตราย 1/16 จังหวะ
 * ไม่แตะ WebAudio — เครื่องเล่นอยู่ที่ MusicEngine.ts
 *
 * สัญลักษณ์
 *  - ทำนอง (mel): โน้ตคั่นด้วยเว้นวรรค 1 ช่อง = เขบ็ต 1 ชั้น (res 8) หรือ 2 ชั้น (res 16) · "-" ลากเสียง · "." เงียบ · "|" แบ่งห้อง (ไม่นับ)
 *  - เบส (bass): 16 ตัวอักษร/ห้อง R=ราก(ตามเบสคอร์ด) 3 5 7 = ขั้นคอร์ด 8=รากคู่ 8 L=คู่ 5 ต่ำ · "-" ลาก "." เงียบ
 *  - อาร์เปจ (arp): 16 ตัว/ห้อง 0-9 = ลำดับเสียงคอร์ดไล่ขึ้น · "*" = กดทั้งคอร์ด
 *  - กลอง: k เบสดรัม · s สแนร์ (x X g=เบา r=ริม) · h ไฮแฮต (x X o=เปิด s S=เชกเกอร์)
 *          p/q เพอร์คัชชัน (c=คลาเว h/l=คองกาสูง/ต่ำ t=ไทโกะ m/f=ทอม y=ฉาบ s=เชกเกอร์ d=หยดน้ำ)
 */
import { noteToMidi, parseChord, thirdBelow, type Chord } from './theory';

export type InstName =
  | 'marimba' | 'steel' | 'flute' | 'chip' | 'brass' | 'pluck' | 'bell' | 'kalimba'
  | 'bass' | 'bassSaw' | 'pad' | 'drone'
  | 'kick' | 'snare' | 'rim' | 'hat' | 'shaker' | 'clave' | 'conga' | 'taiko' | 'tom' | 'crash' | 'drip' | 'rumble';

interface PartBase {
  vol?: number;
}
export interface MelPart extends PartBase {
  kind: 'mel';
  inst: InstName;
  notes: string;
  res?: 8 | 16;
  oct?: number;
  /** ประสานคู่ 3 ต่ำลง */
  harm?: boolean;
  /** รอบเล่นคี่ใช้เครื่องนี้แทน (กันซ้ำซาก) */
  alt?: InstName;
  gate?: number;
}
export interface BassPart extends PartBase {
  kind: 'bass';
  inst: InstName;
  pat: string;
  oct?: number;
  gate?: number;
}
export interface ArpPart extends PartBase {
  kind: 'arp';
  inst: InstName;
  pat: string;
  oct?: number;
  gate?: number;
}
export interface PadPart extends PartBase {
  kind: 'pad';
  inst: InstName;
  /** โน้ตต่ำสุดของการวางคอร์ด (MIDI) */
  lo?: number;
}
export interface DrumPart extends PartBase {
  kind: 'drums';
  k?: string;
  s?: string;
  h?: string;
  p?: string;
  q?: string;
  /** ห้องสุดท้ายของท่อน = ลูกส่งกลอง */
  fill?: boolean;
  /** ฉาบตอนเริ่มท่อน */
  crash?: boolean;
  /** โอกาสไฮแฮตเบา ๆ แทรก (สุ่มตอนเล่น) */
  ghost?: number;
}
export interface DronePart extends PartBase {
  kind: 'drone';
  inst: InstName;
  /** ยาวกี่ห้องต่อหนึ่งเสียง */
  bars: number;
  oct?: number;
}
/** โน้ตประกายสุ่มจากเสียงคอร์ด (สุ่มตอนเล่น) */
export interface SparklePart extends PartBase {
  kind: 'sparkle';
  inst: InstName;
  prob: number;
  oct?: number;
  res?: 8 | 16;
}
/** หยดน้ำในถ้ำ (สุ่มตอนเล่น) */
export interface DripPart extends PartBase {
  kind: 'drip';
  prob: number;
}
export type Part = MelPart | BassPart | ArpPart | PadPart | DrumPart | DronePart | SparklePart | DripPart;

export interface Section {
  bars: number;
  /** คอร์ดห้องละตัว คั่นเว้นวรรค · "Em,A" = ครึ่งห้อง */
  chords: string;
  parts: Part[];
}

export interface TrackDef {
  bpm: number;
  /** หน่วงเขบ็ต 2 ชั้นตัวคี่ (0..0.33) */
  swing?: number;
  key: string;
  /** ปริมาณเสียงก้อง 0..1 */
  rev: number;
  /** ปริมาณเสียงสะท้อน 0..1 */
  echo?: number;
  sections: Record<string, Section>;
  order: string[];
  /** วนกลับไปท่อนที่เท่าไหร่ (ข้ามอินโทร) */
  loopFrom?: number;
}

export interface Ev {
  inst: InstName;
  m: number;
  /** ความยาว (จำนวน 1/16) */
  d: number;
  v: number;
  /** ลำดับความสำคัญ 0 = ต้องเล่น · 2 = ตัดได้ก่อนเมื่อเสียงซ้อนเกิน */
  p: 0 | 1 | 2;
  part: number;
}

export interface Compiled {
  bars: number;
  steps: Ev[][];
  chords: Chord[];
  parts: Part[];
}

function tokens(s: string) {
  return s.replace(/\|/g, ' ').trim().split(/\s+/);
}

function chordLine(sec: Section): Chord[] {
  const toks = sec.chords.trim().split(/\s+/);
  const out: Chord[] = [];
  for (let b = 0; b < sec.bars; b++) {
    const sub = toks[b % toks.length].split(',');
    const len = 16 / sub.length;
    for (let s = 0; s < 16; s++) out.push(parseChord(sub[Math.floor(s / len)]));
  }
  return out;
}

/** แพทเทิร์นราย 16 ตัว/ห้อง (ยาวหลายห้องได้) → ตัวอักษรของห้อง b */
function barPat(pat: string, b: number, what: string): string {
  const p = pat.replace(/[\s|]/g, '');
  if (p.length % 16) throw new Error(`${what}: แพทเทิร์นต้องยาวเป็นทวีคูณของ 16 (${p.length})`);
  const n = p.length / 16;
  return p.slice((b % n) * 16, (b % n) * 16 + 16);
}

function holdLen(seg: string, s: number) {
  let j = s + 1;
  while (j < seg.length && seg[j] === '-') j++;
  return j - s;
}

/** เสียงคอร์ดไล่ขึ้น 3 ช่วงคู่ 8 เริ่มที่ octave นั้น */
export function chordLadder(c: Chord, oct: number): number[] {
  const base = (oct + 1) * 12 + c.root;
  const out: number[] = [];
  for (let o = 0; o < 3; o++) for (const t of c.tones) out.push(base + t + o * 12);
  return [...new Set(out)].sort((a, b) => a - b);
}

const DRUM_VEL: Record<string, number> = { X: 1, x: 0.75, g: 0.3, o: 0.7, S: 0.8, s: 0.45 };

function drumHit(line: 'k' | 's' | 'h' | 'p', ch: string): { inst: InstName; m: number; d: number; v: number } | null {
  if (ch === '.' || ch === '-') return null;
  const v = DRUM_VEL[ch] ?? 0.8;
  switch (line) {
    case 'k':
      return { inst: 'kick', m: 36, d: 2, v };
    case 's':
      return ch === 'r' ? { inst: 'rim', m: 76, d: 1, v: 0.7 } : { inst: 'snare', m: 38, d: 2, v };
    case 'h':
      if (ch === 's' || ch === 'S') return { inst: 'shaker', m: 70, d: 1, v };
      return { inst: 'hat', m: 42, d: ch === 'o' ? 4 : 1, v };
    case 'p':
      switch (ch) {
        case 'c': return { inst: 'clave', m: 75, d: 1, v: 0.7 };
        case 'h': return { inst: 'conga', m: 64, d: 2, v: 0.7 };
        case 'l': return { inst: 'conga', m: 57, d: 2, v: 0.75 };
        case 't': return { inst: 'taiko', m: 36, d: 4, v: 0.9 };
        case 'm': return { inst: 'tom', m: 50, d: 3, v: 0.75 };
        case 'f': return { inst: 'tom', m: 43, d: 3, v: 0.8 };
        case 'y': return { inst: 'crash', m: 49, d: 8, v: 0.7 };
        case 's': return { inst: 'shaker', m: 70, d: 1, v: 0.5 };
        case 'd': return { inst: 'drip', m: 88, d: 1, v: 0.6 };
      }
      return null;
  }
}

/** คอมไพล์หนึ่งท่อน → ตารางโน้ตราย 1/16 */
export function compileSection(sec: Section, scale: number[], name = '?'): Compiled {
  const total = sec.bars * 16;
  const steps: Ev[][] = Array.from({ length: total }, () => []);
  const chords = chordLine(sec);
  const push = (s: number, e: Ev) => s >= 0 && s < total && steps[s].push(e);

  sec.parts.forEach((part, pi) => {
    const vol = part.vol ?? 1;
    switch (part.kind) {
      case 'mel': {
        const res = part.res ?? 8;
        const mul = 16 / res;
        const toks = tokens(part.notes);
        if (toks.length !== sec.bars * res) throw new Error(`${name}: ทำนองมี ${toks.length} ช่อง ต้องเป็น ${sec.bars * res}`);
        const sh = (part.oct ?? 0) * 12;
        toks.forEach((tk, i) => {
          if (tk === '.' || tk === '-') return;
          let j = i + 1;
          while (j < toks.length && toks[j] === '-') j++;
          const m = noteToMidi(tk) + sh;
          const d = (j - i) * mul;
          const accent = (i * mul) % 16 === 0 ? 1 : 0.88;
          push(i * mul, { inst: part.inst, m, d, v: 0.8 * vol * accent, p: 0, part: pi });
          if (part.harm) push(i * mul, { inst: part.inst, m: thirdBelow(m, scale), d, v: 0.45 * vol * accent, p: 1, part: pi });
        });
        break;
      }
      case 'bass': {
        const oct = part.oct ?? 2;
        for (let b = 0; b < sec.bars; b++) {
          const seg = barPat(part.pat, b, `${name} bass`);
          for (let s = 0; s < 16; s++) {
            const ch = seg[s];
            if (ch === '.' || ch === '-') continue;
            const c = chords[b * 16 + s];
            const base = (oct + 1) * 12;
            const root = base + c.root;
            let m: number;
            switch (ch) {
              case 'R': m = base + c.bass; break;
              case '8': m = base + c.bass + 12; break;
              case '3': m = root + c.tones[1]; break;
              case '5': m = root + (c.tones.find((t) => t >= 6 && t <= 8) ?? 7); break;
              case '7': m = root + (c.tones[3] ?? 10); break;
              case 'L': m = root - 5; break;
              default: throw new Error(`${name}: เบสไม่รู้จัก "${ch}"`);
            }
            const accent = s % 4 === 0 ? 1 : 0.85;
            push(b * 16 + s, { inst: part.inst, m, d: holdLen(seg, s), v: 0.8 * vol * accent, p: 0, part: pi });
          }
        }
        break;
      }
      case 'arp': {
        const oct = part.oct ?? 4;
        for (let b = 0; b < sec.bars; b++) {
          const seg = barPat(part.pat, b, `${name} arp`);
          for (let s = 0; s < 16; s++) {
            const ch = seg[s];
            if (ch === '.' || ch === '-') continue;
            const lad = chordLadder(chords[b * 16 + s], oct);
            const d = holdLen(seg, s);
            const v = 0.7 * vol * (s % 4 === 0 ? 1 : 0.8);
            if (ch === '*') lad.slice(0, 3).forEach((m) => push(b * 16 + s, { inst: part.inst, m, d, v: v * 0.7, p: 1, part: pi }));
            else push(b * 16 + s, { inst: part.inst, m: lad[Number(ch) % lad.length], d, v, p: 1, part: pi });
          }
        }
        break;
      }
      case 'pad': {
        const lo = part.lo ?? 55;
        let s = 0;
        while (s < total) {
          const c = chords[s];
          let e = s + 1;
          while (e < total && chords[e] === c && e % 16 !== 0) e++;
          for (const t of c.tones) {
            const pc = (c.root + t) % 12;
            push(s, { inst: part.inst, m: lo + ((((pc - lo) % 12) + 12) % 12), d: e - s, v: 0.5 * vol, p: 2, part: pi });
          }
          s = e;
        }
        break;
      }
      case 'drone': {
        const oct = part.oct ?? 2;
        for (let b = 0; b < sec.bars; b += part.bars) {
          const c = chords[b * 16];
          const m = (oct + 1) * 12 + c.root;
          const d = Math.min(part.bars, sec.bars - b) * 16;
          push(b * 16, { inst: part.inst, m, d, v: 0.6 * vol, p: 1, part: pi });
          if (part.inst !== 'rumble') push(b * 16, { inst: part.inst, m: m + 7, d, v: 0.35 * vol, p: 2, part: pi });
        }
        break;
      }
      case 'drums': {
        for (let b = 0; b < sec.bars; b++) {
          const lastBar = part.fill && b === sec.bars - 1;
          for (const line of ['k', 's', 'h', 'p', 'q'] as const) {
            const pat = part[line];
            if (!pat) continue;
            const seg = barPat(pat, b, `${name} drums.${line}`);
            for (let s = 0; s < 16; s++) {
              if (lastBar && s >= 8 && line !== 'k' && line !== 'h') continue; // ช่วงลูกส่ง
              const hit = drumHit(line === 'q' ? 'p' : line, seg[s]);
              if (hit) push(b * 16 + s, { ...hit, v: hit.v * vol, p: line === 'h' ? 2 : 0, part: pi });
            }
          }
          if (lastBar) {
            // ลูกส่ง: ทอมไล่ลง + สแนร์รัวเร่งเสียง
            [[8, 52], [10, 50], [12, 47], [13, 45], [14, 43], [15, 41]].forEach(([s, m], i) =>
              push(b * 16 + s, { inst: 'tom', m, d: 2, v: (0.55 + i * 0.07) * vol, p: 0, part: pi }));
            for (let s = 12; s < 16; s++) push(b * 16 + s, { inst: 'snare', m: 38, d: 1, v: (0.35 + (s - 12) * 0.12) * vol, p: 1, part: pi });
          }
        }
        if (part.crash) push(0, { inst: 'crash', m: 49, d: 8, v: 0.7 * vol, p: 1, part: pi });
        break;
      }
      case 'sparkle':
      case 'drip':
        break; // สุ่มตอนเล่น
    }
  });
  return { bars: sec.bars, steps, chords, parts: sec.parts };
}
