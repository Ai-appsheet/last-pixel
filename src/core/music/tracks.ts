/**
 * เพลงประกอบทั้งหมด (แต่งใหม่ทั้งหมด ไม่มีทำนองของใคร) — ข้อมูลล้วน เล่นด้วย MusicEngine
 * ทำนอง 1 ช่อง = เขบ็ต 1 ชั้น (8 ช่อง/ห้อง) · ดูสัญลักษณ์ที่ compose.ts
 */
import type { InstName, Section, TrackDef } from './compose';

/** ต่อห้องเข้าด้วยกัน */
const M = (...bars: string[]) => bars.join(' | ');

/** ท่อนเดิมแต่เปลี่ยนชิ้นส่วน */
const vary = (s: Section, parts: Section['parts']): Section => ({ ...s, parts });

// =====================================================================
// title — ธีมผจญภัยฮีโร่ (D major 112)
// =====================================================================
const titleTheme = M(
  'D5 - - A4 D5 E5 F#5 -', 'G5 - F#5 E5 D5 - B4 -', 'F#5 - - E5 D5 - C#5 D5', 'E5 - - - - - . .',
  'D5 - - A4 D5 E5 F#5 -', 'G5 - A5 B5 A5 - G5 F#5', 'E5 - F#5 G5 A5 - C#5 -', 'D5 - - - - - . .',
);
const titleThemeEnd = M(
  'D5 - - A4 D5 E5 F#5 -', 'G5 - F#5 E5 D5 - B4 -', 'F#5 - - E5 D5 - C#5 D5', 'E5 - - - - - . .',
  'D5 - - A4 D5 E5 F#5 -', 'G5 - A5 B5 A5 - G5 F#5', 'E5 - F#5 G5 A5 - C#5 -', 'A4 - C#5 - E5 - A5 -',
);
const titleDrums = { kind: 'drums', k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', fill: true, crash: true, ghost: 0.15 } as const;
const titleA: Section = {
  bars: 8,
  chords: 'D G Bm A D G Em,A D',
  parts: [
    { kind: 'mel', inst: 'chip', notes: titleTheme, alt: 'brass' },
    { kind: 'bass', inst: 'bass', pat: 'R.RRR.RR5.55R.RR', gate: 0.7 },
    { kind: 'arp', inst: 'pluck', pat: '0.2.1.2.0.2.1.2.', vol: 0.6 },
    { kind: 'pad', inst: 'pad', vol: 0.7 },
    titleDrums,
  ],
};
const TITLE: TrackDef = {
  bpm: 112,
  key: 'D major',
  rev: 0.4,
  echo: 0.1,
  loopFrom: 1,
  order: ['intro', 'A', 'A2', 'B', 'C'],
  sections: {
    intro: {
      bars: 4,
      chords: 'D G Bm A',
      parts: [
        { kind: 'mel', inst: 'brass', notes: M('A4 - D5 - F#5 - - -', 'G5 - - - F#5 - E5 -', 'F#5 - - - D5 - B4 -', 'C#5 - - - E5 - - -'), harm: true },
        { kind: 'bass', inst: 'bass', pat: 'R---------------' },
        { kind: 'pad', inst: 'pad' },
        { kind: 'drums', p: 't.......t...t.t.', fill: true, crash: true },
      ],
    },
    A: titleA,
    A2: vary(titleA, [
      { kind: 'mel', inst: 'brass', notes: titleTheme, harm: true, alt: 'chip' },
      { kind: 'mel', inst: 'steel', notes: titleTheme, vol: 0.45 },
      { kind: 'bass', inst: 'bass', pat: 'R.RRR.RR5.55R.RR', gate: 0.7 },
      { kind: 'arp', inst: 'pluck', pat: '0121012101210121', vol: 0.5 },
      { kind: 'pad', inst: 'pad', vol: 0.7 },
      titleDrums,
    ]),
    B: {
      bars: 8,
      chords: 'Bm G D A Bm G D A',
      parts: [
        {
          kind: 'mel', inst: 'flute', alt: 'steel',
          notes: M('F#5 - E5 D5 B4 - - -', 'D5 - E5 F#5 G5 - - -', 'F#5 - - D5 A4 - - -', 'C#5 - D5 E5 A4 - - -', 'B4 - C#5 D5 F#5 - E5 D5', 'G5 - - F#5 E5 - D5 -', 'F#5 - - A5 - - F#5 -', 'E5 - - - C#5 - - -'),
        },
        { kind: 'bass', inst: 'bass', pat: 'R.......5...R...' },
        { kind: 'arp', inst: 'marimba', pat: '0.1.2.1.0.1.2.1.', vol: 0.55 },
        { kind: 'pad', inst: 'pad', vol: 0.8 },
        { kind: 'drums', k: 'x.......x.......', s: '........x.......', h: '..x...x...x...x.', p: '............h.l.', fill: true },
      ],
    },
    C: {
      bars: 8,
      chords: 'D G Bm A D G Em,A A',
      parts: [
        { kind: 'mel', inst: 'brass', notes: titleThemeEnd, harm: true },
        { kind: 'mel', inst: 'chip', notes: titleThemeEnd, vol: 0.4, alt: 'steel' },
        { kind: 'bass', inst: 'bass', pat: 'R.RRR.RR5.558.88', gate: 0.7 },
        { kind: 'arp', inst: 'pluck', pat: '0121012101210121', vol: 0.5 },
        { kind: 'pad', inst: 'pad', vol: 0.8 },
        { kind: 'drums', k: 'x...x...x...x...', s: '....x.......x.x.', h: 'xxxxxxxxxxxxxxxx', vol: 0.95, fill: true, crash: true },
      ],
    },
  },
};

// =====================================================================
// day — สำรวจเกาะยามกลางวัน อบอุ่นสบาย ๆ (G major 92)
// =====================================================================
const dayMel = M(
  'D5 - B4 - G4 A4 B4 -', 'E5 - D5 B4 - - G4 -', 'C5 - E5 G5 - E5 D5 C5', 'A4 - - - F#4 - A4 -',
  'D5 - B4 - G4 A4 B4 D5', 'E5 - G5 - F#5 E5 D5 -', 'C5 - - E5 D5 C5 A4 -', 'A4 - B4 - C5 - F#4 -',
);
const dayDrums = { kind: 'drums', k: 'x.......x..x....', s: '....r.......r...', h: 'S.s.S.s.S.s.S.s.', p: '......c...h...l.', vol: 0.8 } as const;
const dayA: Section = {
  bars: 8,
  chords: 'Gmaj7 Em7 Cmaj7 D Gmaj7 Em7 Am7 D7',
  parts: [
    { kind: 'mel', inst: 'marimba', notes: dayMel, alt: 'steel' },
    { kind: 'bass', inst: 'bass', pat: 'R-....R.5---....', vol: 0.85 },
    { kind: 'arp', inst: 'kalimba', pat: '..0...2...1...3.', vol: 0.55 },
    { kind: 'pad', inst: 'pad', vol: 0.6 },
    dayDrums,
  ],
};
const DAY: TrackDef = {
  bpm: 92,
  swing: 0.1,
  key: 'G major',
  rev: 0.45,
  echo: 0.15,
  order: ['A', 'B', 'C', 'A2'],
  sections: {
    A: dayA,
    B: {
      bars: 8,
      chords: 'Cmaj7 D Bm7 Em7 Am7 D G G',
      parts: [
        {
          kind: 'mel', inst: 'steel', alt: 'flute',
          notes: M('E5 - G5 - B5 - G5 -', 'A5 - F#5 - D5 - - -', 'F#5 - D5 - B4 - D5 -', 'E5 - - - G5 - - -', 'A5 - G5 E5 C5 - E5 -', 'F#5 - E5 D5 A4 - - -', 'B4 - D5 - G5 - - -', '- - - - . . . .'),
        },
        { kind: 'bass', inst: 'bass', pat: 'R...5...R...5...', vol: 0.85 },
        { kind: 'arp', inst: 'marimba', pat: '0.1.2.1.3.1.2.1.', oct: 4, vol: 0.45 },
        { kind: 'pad', inst: 'pad', vol: 0.6 },
        { ...dayDrums, p: '......c...h.h.l.' },
      ],
    },
    C: {
      bars: 8,
      chords: 'Em7 Cmaj7 G D Em7 Cmaj7 Am7 D7',
      parts: [
        { kind: 'mel', inst: 'flute', notes: M('B4 - - - - - - -', 'G4 - - - E5 - - -', 'D5 - - - - - B4 -', 'A4 - - - - - - -', 'B4 - - - E5 - - -', 'G5 - - - - - E5 -', 'C5 - - - - - E5 -', 'D5 - - - - - . .'), vol: 0.9 },
        { kind: 'arp', inst: 'pluck', pat: '0.1.2.3.4.3.2.1.', vol: 0.45 },
        { kind: 'bass', inst: 'bass', pat: 'R-------5-------', vol: 0.8 },
        { kind: 'pad', inst: 'pad', vol: 0.75 },
        { kind: 'sparkle', inst: 'kalimba', prob: 0.12, oct: 5, vol: 0.4 },
        { kind: 'drums', h: 'S.s.S.s.S.s.S.s.', vol: 0.7 },
      ],
    },
    A2: vary(dayA, [
      { kind: 'mel', inst: 'marimba', notes: dayMel, harm: true, alt: 'steel' },
      { kind: 'bass', inst: 'bass', pat: 'R-....R.5---..R.', vol: 0.85 },
      { kind: 'arp', inst: 'kalimba', pat: '..0...2...1...3.', vol: 0.5 },
      { kind: 'sparkle', inst: 'steel', prob: 0.06, oct: 5, vol: 0.3 },
      { kind: 'pad', inst: 'pad', vol: 0.6 },
      { ...dayDrums, fill: true },
    ]),
  },
};

// =====================================================================
// night — กลางคืน ลึกลับ ตึงเครียด (D minor 76)
// =====================================================================
const nightBell = M(
  'D5 . . A4 . . F5 E5', 'D5 - - - . . . .', 'D5 . . Bb4 . . F5 G5', 'E5 - - C#5 - - A4 .',
  'D5 . . A4 . . F5 A5', 'G5 . F5 . E5 . D5 .', 'Bb4 . D5 . G5 . F5 E5', 'C#5 - - - E5 - - -',
);
const nightA: Section = {
  bars: 8,
  chords: 'Dm Dm Bb A Dm Dm Gm A',
  parts: [
    { kind: 'mel', inst: 'bell', notes: nightBell, alt: 'kalimba', vol: 0.9 },
    { kind: 'bass', inst: 'bass', pat: 'R.R.R.R.R.R.R.R.', gate: 0.5, vol: 0.65 },
    { kind: 'pad', inst: 'pad', lo: 50, vol: 0.7 },
    { kind: 'drums', k: 'x..x............', h: '..g...g...g...g.', p: '..............m.', vol: 0.8 },
  ],
};
const NIGHT: TrackDef = {
  bpm: 76,
  key: 'D minor',
  rev: 0.55,
  echo: 0.35,
  order: ['A', 'B', 'C', 'A2'],
  sections: {
    A: nightA,
    B: {
      bars: 8,
      chords: 'Gm Eb Dm A Gm Eb Bb A',
      parts: [
        {
          kind: 'mel', inst: 'flute', alt: 'bell',
          notes: M('G4 - - - Bb4 - A4 G4', 'G4 - - - - - Bb4 -', 'A4 - - - F4 - D4 -', 'E4 - - - C#4 - - -', 'D5 - - - Bb4 - C5 D5', 'Eb5 - - - D5 - C5 Bb4', 'D5 - - - F5 - - -', 'E5 - - - - - . .'),
        },
        { kind: 'arp', inst: 'marimba', pat: '0.1.2.0.1.2.0.1.', oct: 3, vol: 0.5 },
        { kind: 'bass', inst: 'bass', pat: 'R.......R...5...', vol: 0.7 },
        { kind: 'pad', inst: 'pad', lo: 50, vol: 0.6 },
        { kind: 'drums', k: 'x.......x.......', h: 'g.g.g.g.g.g.g.g.', p: '..............mf', vol: 0.8, fill: true },
      ],
    },
    C: {
      bars: 4,
      chords: 'Dm Bb Gm A',
      parts: [
        { kind: 'drone', inst: 'drone', bars: 2, vol: 0.8 },
        { kind: 'pad', inst: 'pad', lo: 50, vol: 0.7 },
        { kind: 'sparkle', inst: 'bell', prob: 0.14, oct: 5, vol: 0.5 },
        { kind: 'drums', k: 'x..x............', vol: 0.6 },
      ],
    },
    A2: vary(nightA, [
      { kind: 'mel', inst: 'bell', notes: nightBell, alt: 'flute', vol: 0.9 },
      { kind: 'arp', inst: 'marimba', pat: '0.1.2.0.1.2.0.1.', oct: 3, vol: 0.45 },
      { kind: 'bass', inst: 'bass', pat: 'R.R.R.R.R.R.R.R.', gate: 0.5, vol: 0.65 },
      { kind: 'pad', inst: 'pad', lo: 50, vol: 0.7 },
      { kind: 'drums', k: 'x..x............', h: '..g...g...g...g.', p: '..........m...m.', vol: 0.8, fill: true },
    ]),
  },
};

// =====================================================================
// dungeon — ถ้ำมืด หยดน้ำ เสียงสะท้อน (C minor 60)
// =====================================================================
const DUNGEON: TrackDef = {
  bpm: 60,
  key: 'C minor',
  rev: 0.75,
  echo: 0.5,
  order: ['A', 'B', 'C'],
  sections: {
    A: {
      bars: 8,
      chords: 'Cm Cm Ab Ab Fm Fm G G',
      parts: [
        { kind: 'drone', inst: 'drone', bars: 2 },
        { kind: 'pad', inst: 'pad', lo: 48, vol: 0.55 },
        { kind: 'drip', prob: 0.035 },
        { kind: 'sparkle', inst: 'bell', prob: 0.05, oct: 5, vol: 0.4 },
      ],
    },
    B: {
      bars: 8,
      chords: 'Cm Ab Fm G Cm Ab Db G',
      parts: [
        { kind: 'mel', inst: 'bell', alt: 'kalimba', vol: 0.8, notes: M('G4 . . . C5 . . Eb5', 'D5 - - - C5 - - -', 'Ab4 . . . F4 . . .', 'B4 - - - . . . .', 'G4 . . . C5 . . G5', 'Eb5 - - - C5 - - -', 'F5 . . . Db5 . . .', 'B4 - - - D5 - - -') },
        { kind: 'drone', inst: 'drone', bars: 1, vol: 0.8 },
        { kind: 'pad', inst: 'pad', lo: 48, vol: 0.45 },
        { kind: 'drip', prob: 0.025 },
        { kind: 'drums', p: 'f.......f.f.....', vol: 0.55 },
      ],
    },
    C: {
      bars: 4,
      chords: 'Cm Cm Cm G',
      parts: [
        { kind: 'drone', inst: 'drone', bars: 4 },
        { kind: 'drone', inst: 'rumble', bars: 2, vol: 0.7 },
        { kind: 'drip', prob: 0.06 },
      ],
    },
  },
};

// =====================================================================
// battle — ภัยพิบัติ/ภัยกลางวัน เร้าใจ (E minor 150)
// =====================================================================
const battleLead = M(
  'E5 - B4 - E5 F#5 G5 -', 'G5 - E5 - C5 - E5 G5', 'F#5 - D5 - A4 - D5 F#5', 'D#5 - - - B4 - F#5 -',
  'E5 - B4 - E5 F#5 G5 A5', 'B5 - A5 G5 E5 - G5 -', 'A5 - G5 - E5 - C5 -', 'B4 - D#5 - F#5 - A5 -',
);
const battleDrums = { kind: 'drums', k: 'x...x...x...x...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', ghost: 0.3, fill: true, crash: true } as const;
const battleA: Section = {
  bars: 8,
  chords: 'Em C D B Em C Am B7',
  parts: [
    { kind: 'mel', inst: 'chip', notes: battleLead, alt: 'brass' },
    { kind: 'bass', inst: 'bassSaw', pat: 'R.RRR.RRR.RR5.88', gate: 0.6 },
    { kind: 'pad', inst: 'pad', vol: 0.5 },
    battleDrums,
  ],
};
const battleB: Section = {
  bars: 8,
  chords: 'Am Em C D Am Em B B',
  parts: [
    { kind: 'mel', inst: 'brass', notes: M('A4 - - - C5 - - -', 'B4 - - - G4 - - -', 'C5 - - - E5 - - -', 'D5 - - - F#5 - - -', 'A5 - - - - - G5 -', 'E5 - - - - - B4 -', 'D#5 - - - F#5 - - -', 'B5 - - - - - . .'), harm: true },
    { kind: 'arp', inst: 'pluck', pat: '0123210101232101', vol: 0.55 },
    { kind: 'bass', inst: 'bassSaw', pat: 'R.R.R.R.R.R.R.R.', gate: 0.6 },
    { kind: 'drums', k: 'x..x..x.x..x..x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', ghost: 0.3, fill: true },
  ],
};
const BATTLE: TrackDef = {
  bpm: 150,
  key: 'E minor',
  rev: 0.22,
  order: ['A', 'B', 'A2', 'C', 'D', 'B'],
  sections: {
    A: battleA,
    B: battleB,
    A2: vary(battleA, [
      { kind: 'mel', inst: 'brass', notes: battleLead, harm: true, alt: 'chip' },
      { kind: 'arp', inst: 'pluck', pat: '0.1.2.1.0.1.2.1.', vol: 0.4 },
      { kind: 'bass', inst: 'bassSaw', pat: 'R.RRR.RRR.RR5.88', gate: 0.6 },
      { kind: 'pad', inst: 'pad', vol: 0.5 },
      { ...battleDrums, h: 'xxxxxxxxxxxxxxxx' },
    ]),
    C: {
      bars: 8,
      chords: 'C D Em Em C D B B',
      parts: [
        { kind: 'mel', inst: 'chip', alt: 'flute', notes: M('G5 - - - - - E5 -', 'F#5 - - - - - D5 -', 'E5 - - - - - - -', 'B4 - - - E5 - G5 -', 'G5 - - - - - A5 -', 'F#5 - - - - - D5 -', 'D#5 - - - - - - -', 'F#5 - - - B5 - - -') },
        { kind: 'bass', inst: 'bassSaw', pat: 'R-------R---5---', gate: 0.9 },
        { kind: 'pad', inst: 'pad', vol: 0.7 },
        { kind: 'drums', k: 'x.........x.....', s: '........X.......', h: 'x.x.x.x.x.x.x.x.', p: '..t.......t.....', fill: true },
      ],
    },
    D: {
      bars: 4,
      chords: 'Em Em C B',
      parts: [
        { kind: 'bass', inst: 'bassSaw', pat: 'R.R.R.R.R.R.R.R.', gate: 0.5, vol: 0.9 },
        { kind: 'drums', k: 'x.......x.......', p: 't..t..t.t..t.mmf', h: '..x...x...x...x.', crash: true, fill: true },
      ],
    },
  },
};

// =====================================================================
// boss — หลอดเลือดบอสขึ้น หนักแน่น มืดมน (C minor 138)
// =====================================================================
const bossLead = M(
  'C5 - - Eb5 - - G5 -', 'F#5 - G5 - Eb5 - D5 -', 'C5 - - Eb5 - - Ab5 -', 'G5 - - - F5 - D5 -',
  'C5 - - Eb5 - - G5 -', 'Bb5 - Ab5 - G5 - F5 -', 'Db5 - - - F5 - Ab5 -', 'G5 - - - B4 - D5 -',
);
const bossDrums = { kind: 'drums', k: 'x.x...x.x.x...x.', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: 't...............', ghost: 0.25, fill: true, crash: true } as const;
const bossA: Section = {
  bars: 8,
  chords: 'Cm Cm Ab Bb Cm Cm Db G',
  parts: [
    { kind: 'mel', inst: 'brass', notes: bossLead, alt: 'chip' },
    { kind: 'bass', inst: 'bassSaw', pat: '8R8R8R8R8R8R8R8R', gate: 0.55, oct: 1 },
    { kind: 'pad', inst: 'pad', lo: 48, vol: 0.6 },
    bossDrums,
  ],
};
const bossB_mel = M('F5 - - - Ab5 - - -', 'F5 - - - Db5 - - -', 'Eb5 - - - C5 - - -', 'D5 - - - B4 - - -', 'F5 - - - Ab5 - - -', 'Db5 - - - C5 - - -', 'Bb4 - - - G4 - - -', 'B4 - - - D5 - - -');
const bossB: Section = {
  bars: 8,
  chords: 'Fm Db Ab G Fm Db Eb G',
  parts: [
    { kind: 'mel', inst: 'brass', harm: true, notes: bossB_mel },
    { kind: 'arp', inst: 'pluck', pat: '0120012001200120', vol: 0.5 },
    { kind: 'bass', inst: 'bassSaw', pat: 'R.R.R.R.R.R.R.R.', gate: 0.6, oct: 1 },
    { kind: 'drums', k: 'x...x...x...x...', s: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', ghost: 0, fill: true },
  ],
};
const BOSS: TrackDef = {
  bpm: 138,
  key: 'C minor',
  rev: 0.3,
  order: ['A', 'B', 'A2', 'B2', 'C'],
  sections: {
    A: bossA,
    B: bossB,
    A2: vary(bossA, [
      { kind: 'mel', inst: 'chip', notes: bossLead, harm: true, alt: 'brass' },
      { kind: 'mel', inst: 'brass', notes: bossLead, oct: -1, vol: 0.5 },
      { kind: 'bass', inst: 'bassSaw', pat: '8R8R8R8R8R8R8R8R', gate: 0.55, oct: 1 },
      { kind: 'pad', inst: 'pad', lo: 48, vol: 0.6 },
      bossDrums,
    ]),
    B2: vary(bossB, [
      { kind: 'mel', inst: 'chip', notes: bossB_mel, alt: 'brass' },
      { kind: 'arp', inst: 'pluck', pat: '0123432101234321', vol: 0.5 },
      { kind: 'bass', inst: 'bassSaw', pat: 'R.R.R.R.R.R.R.R.', gate: 0.6, oct: 1 },
      { kind: 'drums', k: 'x.x.x...x.x.x...', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', p: 't.......t.......', fill: true },
    ]),
    C: {
      bars: 4,
      chords: 'Cm Cm Db G',
      parts: [
        { kind: 'drone', inst: 'drone', bars: 2, vol: 0.9 },
        { kind: 'bass', inst: 'bassSaw', pat: 'R...R...R...R.R.', gate: 0.5, oct: 1 },
        { kind: 'drums', k: 'x.....x.....x...', p: 't..t..t...t.t.t.', q: '............mmff', crash: true },
      ],
    },
  },
};

// =====================================================================
// market — เกาะกลาง ตลาดคึกคักแบบคาลิปโซ (F major 112)
// =====================================================================
const marketA_mel = M(
  'A4 - C5 - F5 - E5 F5', 'D5 - F5 - - D5 Bb4 -', 'C5 - E5 - G5 - E5 C5', 'F5 - - - A4 - - -',
  'A4 - C5 - F5 - G5 A5', 'Bb5 - A5 - G5 - F5 D5', 'E5 - G5 - Bb5 - G5 E5', 'F5 - - - . . . .',
);
const marketB_mel = M(
  'D5 - - F5 - - D5 -', 'C5 - - A4 - - F4 -', 'Bb4 - - D5 - - F5 -', 'E5 - - - G5 - - -',
  'F5 - E5 - D5 - A4 -', 'Bb4 - D5 - F5 - D5 -', 'E5 - D5 - C5 - G4 -', 'A4 - - - F4 - - -',
);
const marketDrums = { kind: 'drums', k: 'x...x...x...x...', s: '............r...', h: 'S.s.S.s.S.s.S.s.', p: 'c..c..c...c.c...', q: '..h.l.h...h.l.hh', vol: 0.85 } as const;
const marketComp = { kind: 'arp', inst: 'marimba', pat: '..*...*...*...*.', oct: 4, vol: 0.55 } as const;
const marketBass = { kind: 'bass', inst: 'bass', pat: 'R..5..R.R..5..8.', gate: 0.8 } as const;
const MARKET: TrackDef = {
  bpm: 112,
  swing: 0.16,
  key: 'F major',
  rev: 0.35,
  echo: 0.1,
  order: ['A', 'B', 'A2', 'B2'],
  sections: {
    A: { bars: 8, chords: 'F Bb C F F Bb C7 F', parts: [{ kind: 'mel', inst: 'steel', notes: marketA_mel, alt: 'marimba' }, marketComp, marketBass, marketDrums] },
    B: { bars: 8, chords: 'Bb F Gm7 C7 Dm Bb C F', parts: [{ kind: 'mel', inst: 'steel', notes: marketB_mel, alt: 'flute' }, marketComp, marketBass, { ...marketDrums, fill: true }] },
    A2: {
      bars: 8,
      chords: 'F Bb C F F Bb C7 F',
      parts: [{ kind: 'mel', inst: 'marimba', notes: marketA_mel, harm: true, alt: 'steel' }, { kind: 'arp', inst: 'steel', pat: '..*...*...*...*.', oct: 4, vol: 0.4 }, marketBass, { kind: 'sparkle', inst: 'kalimba', prob: 0.06, oct: 5, vol: 0.35 }, marketDrums],
    },
    B2: { bars: 8, chords: 'Bb F Gm7 C7 Dm Bb C F', parts: [{ kind: 'mel', inst: 'flute', notes: marketB_mel, alt: 'steel' }, { kind: 'mel', inst: 'marimba', notes: marketB_mel, oct: -1, vol: 0.4 }, marketComp, marketBass, { ...marketDrums, fill: true, crash: true }] },
  },
};

// =====================================================================
// adventure — เขตผจญภัย อันตราย กลองนำ (A minor 120)
// =====================================================================
const advA_mel = M(
  'A4 - - - C5 - B4 A4', 'E5 - - - - - . .', 'F5 - E5 - C5 - A4 -', 'G#4 - - - B4 - - -',
  'A4 - - - C5 - D5 E5', 'A5 - - - G5 - E5 -', 'F5 - - - D5 - Bb4 -', 'B4 - - - G#4 - E4 -',
);
const advB_mel = M(
  'D5 - - F5 - - A5 -', 'E5 - - - C5 - - -', 'F5 - - A5 - - C6 -', 'B5 - - - G#5 - - -',
  'A5 - - - F5 - D5 -', 'E5 - - - C5 - A4 -', 'D5 - - - F5 - - -', 'E5 - - - - - . .',
);
const advDrums = { kind: 'drums', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 's.s.s.s.s.s.s.s.', p: 't.......t...m.m.', q: '..h...h...h.h.h.', ghost: 0.1 } as const;
const advOst = { kind: 'arp', inst: 'marimba', pat: '0.0.1.0.2.0.1.0.', oct: 3, vol: 0.6 } as const;
const advBass = { kind: 'bass', inst: 'bass', pat: 'R..R..R.R..R..R.', gate: 0.7 } as const;
const ADVENTURE: TrackDef = {
  bpm: 120,
  key: 'A minor',
  rev: 0.35,
  echo: 0.2,
  order: ['A', 'B', 'C', 'A2', 'B2'],
  sections: {
    A: { bars: 8, chords: 'Am Am F E Am Am Bb E', parts: [{ kind: 'mel', inst: 'flute', notes: advA_mel, alt: 'chip' }, advOst, advBass, { kind: 'pad', inst: 'pad', lo: 52, vol: 0.5 }, advDrums] },
    B: { bars: 8, chords: 'Dm Am F E Dm Am Bb E', parts: [{ kind: 'mel', inst: 'steel', notes: advB_mel, oct: -1, alt: 'brass' }, advOst, advBass, { kind: 'pad', inst: 'pad', lo: 52, vol: 0.5 }, { ...advDrums, fill: true }] },
    C: {
      bars: 4,
      chords: 'Am Am Bb E',
      parts: [
        advBass,
        { kind: 'drums', k: 'x.......x.......', p: 't..t..t.t.t.t...', q: 'h.h.l.h.h.l.hhll', h: 's.s.s.s.s.s.s.s.', crash: true, fill: true },
      ],
    },
    A2: { bars: 8, chords: 'Am Am F E Am Am Bb E', parts: [{ kind: 'mel', inst: 'chip', notes: advA_mel, harm: true, alt: 'flute' }, advOst, advBass, { kind: 'pad', inst: 'pad', lo: 52, vol: 0.5 }, { ...advDrums, crash: true }] },
    B2: { bars: 8, chords: 'Dm Am F E Dm Am Bb E', parts: [{ kind: 'mel', inst: 'brass', notes: advB_mel, oct: -1, harm: true }, { kind: 'arp', inst: 'pluck', pat: '0.1.2.1.0.1.2.1.', vol: 0.4 }, advBass, { ...advDrums, fill: true }] },
  },
};

export const TRACKS = {
  title: TITLE,
  day: DAY,
  night: NIGHT,
  dungeon: DUNGEON,
  battle: BATTLE,
  boss: BOSS,
  market: MARKET,
  adventure: ADVENTURE,
} satisfies Record<string, TrackDef>;

export type MusicName = keyof typeof TRACKS;

// =====================================================================
// สติงเกอร์ (ท่อนสั้นตอนเหตุการณ์สำคัญ) — [จังหวะ, เครื่อง, โน้ต, ยาวกี่จังหวะ, ความแรง]
// =====================================================================
export interface Stinger {
  bpm: number;
  /** ลดเสียงเพลงพื้นหลังกี่วินาที */
  duck: number;
  notes: Array<[number, InstName, string, number, number]>;
}

export const STINGERS = {
  levelUp: {
    bpm: 180,
    duck: 1.2,
    notes: [
      [0, 'chip', 'C5', 0.25, 0.5], [0.25, 'chip', 'E5', 0.25, 0.5], [0.5, 'chip', 'G5', 0.25, 0.55], [0.75, 'chip', 'C6', 0.5, 0.6],
      [1, 'marimba', 'E5', 1, 0.6], [1, 'marimba', 'G5', 1, 0.55], [1, 'marimba', 'C6', 1, 0.6],
      [1, 'bell', 'G6', 1, 0.25], [1.5, 'kalimba', 'E6', 0.5, 0.35],
    ],
  },
  victory: {
    bpm: 132,
    duck: 2.6,
    notes: [
      [0, 'taiko', 'C2', 1, 0.7],
      [0, 'brass', 'G4', 0.3, 0.6], [0.33, 'brass', 'G4', 0.3, 0.6], [0.66, 'brass', 'G4', 0.3, 0.6],
      [1, 'brass', 'C5', 1.5, 0.75], [1, 'brass', 'E4', 1.5, 0.45], [1, 'crash', 'C4', 2, 0.6], [1, 'taiko', 'C2', 1, 0.8],
      [1, 'steel', 'E5', 0.5, 0.6], [1.5, 'steel', 'G5', 0.5, 0.6], [2, 'steel', 'C6', 1, 0.7],
      [1, 'pad', 'C4', 3, 0.5], [1, 'pad', 'E4', 3, 0.45], [1, 'pad', 'G4', 3, 0.45],
      [2.5, 'marimba', 'C5', 1, 0.5], [2.5, 'marimba', 'E5', 1, 0.5], [2.5, 'marimba', 'G5', 1, 0.5], [2.5, 'marimba', 'C6', 1, 0.6],
      [1, 'bass', 'C3', 2.5, 0.6],
    ],
  },
  death: {
    bpm: 70,
    duck: 3.6,
    notes: [
      [0, 'bell', 'A4', 2, 0.45],
      [0, 'pad', 'A3', 3, 0.45], [0, 'pad', 'C4', 3, 0.4], [0, 'pad', 'E4', 3, 0.4],
      [0, 'drone', 'A1', 4.5, 0.5],
      [0, 'flute', 'E5', 0.75, 0.55], [0.75, 'flute', 'D5', 0.25, 0.5], [1, 'flute', 'C5', 1, 0.55],
      [2, 'flute', 'B4', 0.5, 0.5], [2.5, 'flute', 'G#4', 0.5, 0.5], [3, 'flute', 'A4', 2, 0.55],
      [3, 'pad', 'F3', 2, 0.35], [3, 'pad', 'A3', 2, 0.35], [3, 'pad', 'C4', 2, 0.35],
    ],
  },
} satisfies Record<string, Stinger>;

export type StingerName = keyof typeof STINGERS;
