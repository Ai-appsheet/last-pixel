/**
 * เสียงเอฟเฟกต์สังเคราะห์สด ๆ ด้วย WebAudio (สไตล์ 8-bit / jsfxr) — ไม่ต้องมีไฟล์เสียง
 * เรียก Sfx.play('hit') ได้จากทุกที่
 * เพลงประกอบ: core/music/* (Sfx.startMusic / setMusicScene / setMusicPaused)
 */
import { EventBus } from './EventBus';
import { MusicEngine, type MusicName, type StingerName } from './music/MusicEngine';

export type { MusicName };

/** สถานะในเกมที่ใช้เลือกเพลง (GameScene ส่งมาทุก ~0.4 วิ) */
export interface MusicScene {
  /** หลอด HP บอสขึ้นอยู่ */
  boss: boolean;
  /** คืนภัยพิบัติกำลังบุก */
  raid: boolean;
  /** ภัยกลางวันกำลังเกิด */
  hazard: boolean;
  dungeon: boolean;
  /** อยู่เกาะกลาง (ตลาด) */
  market: boolean;
  adventure: boolean;
}

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  to?: number;
  dur: number;
  type?: Wave;
  vol?: number;
  delay?: number;
  vibrato?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  delay?: number;
}

const SETTINGS_KEY = 'lastpixel.settings.v1';

export interface AudioSettings {
  master: number;
  sfx: number;
  music: number;
  muted: boolean;
}

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private rainNode: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private music: MusicEngine | null = null;
  /** เพลงหลักตามช่วงเวลา (title/day/night) */
  private baseMusic: MusicName | null = null;
  /** เพลงตามสถานการณ์ (บอส/ต่อสู้/ดันเจี้ยน/ตลาด/ผจญภัย) ทับเพลงหลัก */
  private sceneMusic: MusicName | null = null;
  private pendingScene: MusicName | null | undefined = undefined;
  private pendingSince = 0;
  private gamePaused = false;
  private pageHidden = false;
  settings: AudioSettings = { master: 0.7, sfx: 0.8, music: 0.3, muted: false };

  constructor() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      /* ใช้ค่าเริ่มต้น */
    }
    if (typeof window === 'undefined') return;
    // ?mute ใน URL = ปิดเสียงทั้งหมด (ใช้ตอนทดสอบระบบ ไม่ให้เพลงหลายแท็บดังซ้อนกัน) — ไม่บันทึกลงการตั้งค่า
    if (new URLSearchParams(location.search).has('mute')) this.settings.muted = true;
    // โหลดโมดูลซ้ำ (hot reload / เปิดเกมใหม่ในหน้าเดิม) → ปิดเสียงของตัวเก่าให้หมด ไม่ให้เพลงซ้อน/ค้าง
    const w = window as unknown as { __lpAudio?: { shutdown?: () => void } };
    try {
      w.__lpAudio?.shutdown?.();
    } catch {
      /* ignore */
    }
    w.__lpAudio = this;
    // สลับแท็บ/พับจอ/ออกจากหน้า = หยุดเสียงทั้งหมด · กลับมา (และไม่ได้ปิดเสียง) = เล่นต่อ
    document.addEventListener('visibilitychange', () => this.syncRunning());
    window.addEventListener('pagehide', () => {
      this.pageHidden = true;
      this.syncRunning();
    });
    window.addEventListener('pageshow', () => {
      this.pageHidden = false;
      this.syncRunning();
    });
    // ปุ่มลัด 0 = เปิด/ปิดเสียง (M ใช้เปิดแผนที่) — ไม่ทำงานตอนพิมพ์ในช่องกรอก
    window.addEventListener('keydown', (e) => {
      if (e.key !== '0' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      this.unlock();
      this.toggleMute();
    });
  }

  get isMuted() {
    return this.settings.muted;
  }

  /** เปิดเสียงอยู่ + หน้าเว็บมองเห็นอยู่ = ควรมีเสียง */
  private get live() {
    return !this.settings.muted && !this.pageHidden && !document.hidden;
  }

  /** ปิดเสียง/ซ่อนหน้า → ค่อย ๆ เงียบแล้ว suspend ทั้ง AudioContext (ไม่มีเสียงค้าง ไม่กิน CPU) · กลับมา → resume */
  private syncRunning() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const live = this.live;
    this.out.gain.cancelScheduledValues(ctx.currentTime);
    this.out.gain.setTargetAtTime(live ? this.settings.master : 0, ctx.currentTime, 0.03);
    if (live) {
      if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
    } else {
      setTimeout(() => {
        if (!this.live && this.ctx === ctx && ctx.state === 'running') ctx.suspend().catch(() => undefined);
      }, 150);
    }
  }

  /** ต้องเรียกหลังผู้ใช้คลิก/กดปุ่มครั้งแรก (นโยบายเบราว์เซอร์) */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && this.live) this.ctx.resume().catch(() => undefined); // รวม 'interrupted' ของ iOS
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.out);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.out);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const low = (navigator.maxTouchPoints > 0 && !!window.matchMedia?.('(pointer: coarse)').matches) || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.music = new MusicEngine(this.ctx, this.musicBus, this.sfxBus, this.noiseBuf, low);
    this.music.setPaused(this.gamePaused);
    this.applySettings();
    this.refreshMusic();
  }

  applySettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    if (!this.out || !this.sfxBus || !this.musicBus) return;
    const s = this.settings;
    const now = this.ctx!.currentTime;
    this.sfxBus.gain.setTargetAtTime(s.sfx, now, 0.02);
    this.musicBus.gain.setTargetAtTime(s.music, now, 0.02);
    if (this.music) this.music.audible = !s.muted && s.master > 0 && s.music > 0;
    this.syncRunning(); // เสียงรวม + ปิดเสียง (suspend ทั้งหมด)
  }

  /** เปิด/ปิดเสียงทั้งหมด (บันทึกถาวร) — แจ้ง EventBus 'audio:changed' (muted) ให้ปุ่ม 🔊/🔇 อัปเดต */
  setMuted(m: boolean) {
    this.settings.muted = m;
    this.applySettings();
    EventBus.emit('audio:changed', m);
  }

  toggleMute() {
    this.setMuted(!this.settings.muted);
    return this.settings.muted;
  }

  /** ปิด AudioContext ถาวร (ออกจากหน้าเกม) */
  shutdown() {
    this.music?.close();
    this.music = null;
    this.rainNode = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.out = this.sfxBus = this.musicBus = null;
  }

  private tone(o: ToneOpts, bus = this.sfxBus) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 7;
      lg.gain.value = o.vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur);
    }
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(bus);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + o.dur);
    const g = ctx.createGain();
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }

  /** เล่นเสียงตามชื่อ (กันเล่นซ้ำถี่เกินด้วย minGap ms) */
  play(name: SfxName, minGap = 30) {
    if (!this.ctx || this.settings.muted) return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < minGap) return;
    this.last.set(name, now);
    const r = 0.94 + Math.random() * 0.12; // สุ่มระดับเสียงเล็กน้อยไม่ให้ซ้ำซาก
    SFX[name](this, r);
  }

  // ---------- เสียงฝน (ลูป) ----------
  setRain(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    if (level <= 0) {
      if (this.rainNode) {
        this.rainNode.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
        const node = this.rainNode;
        setTimeout(() => {
          try {
            node.src.stop();
            node.gain.disconnect();
          } catch {
            /* ปิดไปแล้ว */
          }
        }, 700);
        this.rainNode = null;
      }
      return;
    }
    if (!this.rainNode) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400;
      f.Q.value = 0.4;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(f).connect(gain).connect(this.sfxBus);
      src.start();
      this.rainNode = { src, gain };
    }
    this.rainNode.gain.gain.setTargetAtTime(this.gamePaused ? 0 : level * 0.12, ctx.currentTime, this.gamePaused ? 0.08 : 0.6);
  }

  // ---------- เพลงประกอบ ----------
  /** เพลงหลัก: 'title' หน้าแรก · 'day'/'night' ในเกม (เรียกก่อนปลดล็อกเสียงได้ จะเริ่มเล่นตอนแตะครั้งแรก) */
  startMusic(name: MusicName) {
    this.baseMusic = name;
    if (name === 'title') this.sceneMusic = null;
    this.refreshMusic();
  }

  /** หยุดเพลงทันที (จาง ≤0.3 วิ รวมหางเสียงก้อง) + เสียงฝน และล้างสถานะเพลงในเกม — เรียกตอนออกจากซีนเกม */
  stopMusic() {
    this.baseMusic = null;
    this.sceneMusic = null;
    this.pendingScene = undefined;
    this.setMusicPaused(false);
    this.music?.stop(0.25);
    this.setRain(0);
  }

  /**
   * เลือกเพลงตามสถานการณ์ — ลำดับ: บอส > ดันเจี้ยน > ตลาด > ต่อสู้ (ภัยคืน/ภัยกลางวัน) > เขตผจญภัย > เพลงหลัก
   * เข้าฉากตึงเครียดเปลี่ยนทันที · ออกจากฉาก/เข้าเขตผจญภัยต้องคงอยู่ 3 วิก่อน (กันเพลงสลับไปมาตรงขอบเขต)
   */
  setMusicScene(f: MusicScene) {
    const want: MusicName | null = f.boss ? 'boss' : f.dungeon ? 'dungeon' : f.market ? 'market' : f.raid || f.hazard ? 'battle' : f.adventure ? 'adventure' : null;
    if (want === this.sceneMusic) {
      this.pendingScene = undefined;
      return;
    }
    const now = performance.now();
    const urgent = want === 'boss' || want === 'battle' || want === 'dungeon' || want === 'market';
    if (!urgent) {
      if (this.pendingScene !== want) {
        this.pendingScene = want;
        this.pendingSince = now;
        return;
      }
      if (now - this.pendingSince < 3000) return;
    }
    this.pendingScene = undefined;
    this.sceneMusic = want;
    this.refreshMusic();
  }

  /** เกมหยุด (เมนู Esc/ป๊อปอัป) → เพลงและเสียงฝนเงียบ (เอฟเฟกต์ปุ่มยังดัง) · เล่นต่อ → ค่อย ๆ กลับมา */
  setMusicPaused(p: boolean) {
    this.gamePaused = p;
    this.music?.setPaused(p);
    if (p && this.ctx && this.rainNode) this.rainNode.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
  }

  private refreshMusic() {
    if (!this.music) return;
    const want = this.sceneMusic ?? this.baseMusic;
    if (want) this.music.play(want);
    else this.music.stop();
  }

  /** ท่อนสั้น (ใช้ผ่าน Sfx.play('levelUp' | 'victory' | 'death')) */
  stinger(name: StingerName) {
    this.music?.stinger(name);
  }

  // ให้ตาราง SFX เรียกใช้
  t(o: ToneOpts) {
    this.tone(o);
  }
  n(o: NoiseOpts) {
    this.noise(o);
  }
}

const SFX = {
  swing: (a: AudioManagerImpl, r: number) => a.n({ dur: 0.09, vol: 0.12, filter: 'highpass', freq: 900 * r, to: 3500 }),
  hit: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 150 * r, to: 55, dur: 0.12, type: 'sine', vol: 0.35 });
    a.n({ dur: 0.07, vol: 0.18, freq: 1600 });
  },
  crit: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 180 * r, to: 50, dur: 0.16, type: 'sine', vol: 0.4 });
    a.t({ freq: 1400 * r, to: 1800, dur: 0.12, type: 'square', vol: 0.08 });
    a.n({ dur: 0.1, vol: 0.2, freq: 2400 });
  },
  hitWood: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 240 * r, to: 170, dur: 0.08, type: 'square', vol: 0.12 });
    a.n({ dur: 0.06, vol: 0.15, filter: 'bandpass', freq: 900 });
  },
  hitRock: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 900 * r, to: 700, dur: 0.07, type: 'triangle', vol: 0.15 });
    a.n({ dur: 0.05, vol: 0.12, filter: 'highpass', freq: 2500 });
  },
  breakWood: (a: AudioManagerImpl, r: number) => {
    a.n({ dur: 0.35, vol: 0.25, freq: 700 * r, to: 150 });
    a.t({ freq: 120, to: 50, dur: 0.3, type: 'square', vol: 0.12 });
  },
  breakRock: (a: AudioManagerImpl, r: number) => {
    a.n({ dur: 0.3, vol: 0.25, filter: 'bandpass', freq: 1800 * r, to: 300 });
    a.t({ freq: 300, to: 80, dur: 0.2, type: 'triangle', vol: 0.15 });
  },
  pickup: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 660 * r, dur: 0.06, type: 'square', vol: 0.08 });
    a.t({ freq: 990 * r, dur: 0.08, type: 'square', vol: 0.08, delay: 0.05 });
  },
  craft: (a: AudioManagerImpl) => {
    for (let i = 0; i < 3; i++) {
      a.n({ dur: 0.05, vol: 0.18, filter: 'bandpass', freq: 2200, delay: i * 0.09 });
      a.t({ freq: 520 + i * 120, dur: 0.06, type: 'square', vol: 0.06, delay: i * 0.09 });
    }
  },
  place: (a: AudioManagerImpl) => {
    a.t({ freq: 110, to: 60, dur: 0.15, type: 'sine', vol: 0.35 });
    a.n({ dur: 0.1, vol: 0.12, freq: 600 });
  },
  eat: (a: AudioManagerImpl) => {
    for (let i = 0; i < 3; i++) a.n({ dur: 0.05, vol: 0.15, filter: 'bandpass', freq: 1300 + i * 200, delay: i * 0.1 });
  },
  drink: (a: AudioManagerImpl) => {
    for (let i = 0; i < 3; i++) a.t({ freq: 300 + i * 80, to: 600 + i * 80, dur: 0.08, type: 'sine', vol: 0.12, delay: i * 0.1 });
  },
  hurt: (a: AudioManagerImpl, r: number) => a.t({ freq: 320 * r, to: 110, dur: 0.22, type: 'sawtooth', vol: 0.15 }),
  death: (a: AudioManagerImpl) => {
    a.t({ freq: 330, to: 110, dur: 0.5, type: 'sawtooth', vol: 0.12 });
    a.stinger('death');
  },
  mobDie: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 260 * r, to: 70, dur: 0.25, type: 'square', vol: 0.12 });
    a.n({ dur: 0.2, vol: 0.12, freq: 900, to: 200 });
  },
  zombie: (a: AudioManagerImpl, r: number) => a.t({ freq: 85 * r, to: 70, dur: 0.7, type: 'sawtooth', vol: 0.09, vibrato: 6 }),
  growl: (a: AudioManagerImpl, r: number) => a.t({ freq: 110 * r, to: 80, dur: 0.45, type: 'sawtooth', vol: 0.12, vibrato: 10 }),
  bossRoar: (a: AudioManagerImpl) => {
    a.t({ freq: 70, to: 45, dur: 1.4, type: 'sawtooth', vol: 0.25, vibrato: 12 });
    a.n({ dur: 1.2, vol: 0.2, freq: 500, to: 120 });
  },
  skill: (a: AudioManagerImpl) => [523, 659, 784, 1047].forEach((f, i) => a.t({ freq: f, dur: 0.12, type: 'square', vol: 0.08, delay: i * 0.06 })),
  bow: (a: AudioManagerImpl, r: number) => {
    a.t({ freq: 900 * r, to: 200, dur: 0.14, type: 'triangle', vol: 0.15 });
    a.n({ dur: 0.08, vol: 0.1, filter: 'highpass', freq: 3000 });
  },
  dash: (a: AudioManagerImpl) => a.n({ dur: 0.18, vol: 0.18, filter: 'bandpass', freq: 600, to: 3000 }),
  click: (a: AudioManagerImpl) => a.t({ freq: 1200, dur: 0.04, type: 'square', vol: 0.06 }),
  error: (a: AudioManagerImpl) => a.t({ freq: 180, dur: 0.15, type: 'square', vol: 0.08 }),
  levelUp: (a: AudioManagerImpl) => a.stinger('levelUp'),
  victory: (a: AudioManagerImpl) => a.stinger('victory'),
  horn: (a: AudioManagerImpl) => {
    a.t({ freq: 110, dur: 1.6, type: 'sawtooth', vol: 0.15, vibrato: 2 });
    a.t({ freq: 165, dur: 1.6, type: 'sawtooth', vol: 0.08, vibrato: 2 });
  },
  thunder: (a: AudioManagerImpl) => {
    a.n({ dur: 2.2, vol: 0.45, freq: 400, to: 60 });
    a.t({ freq: 50, to: 30, dur: 1.8, type: 'sine', vol: 0.3 });
  },
  fire: (a: AudioManagerImpl, r: number) => a.n({ dur: 0.04, vol: 0.06, filter: 'highpass', freq: 3000 * r }),
  step: (a: AudioManagerImpl, r: number) => a.n({ dur: 0.04, vol: 0.04, freq: 500 * r }),
  splash: (a: AudioManagerImpl) => a.n({ dur: 0.25, vol: 0.15, filter: 'bandpass', freq: 1200, to: 400 }),
  harvest: (a: AudioManagerImpl) => {
    a.n({ dur: 0.1, vol: 0.12, freq: 1800 });
    a.t({ freq: 700, to: 1000, dur: 0.1, type: 'sine', vol: 0.1, delay: 0.05 });
  },
  sleep: (a: AudioManagerImpl) => [392, 330, 262].forEach((f, i) => a.t({ freq: f, dur: 0.4, type: 'triangle', vol: 0.1, delay: i * 0.3 })),
  achievement: (a: AudioManagerImpl) => [784, 988, 1175, 1568].forEach((f, i) => a.t({ freq: f, dur: 0.2, type: 'triangle', vol: 0.12, delay: i * 0.09 })),
} as const;

export type SfxName = keyof typeof SFX;

export const Sfx = new AudioManagerImpl();
