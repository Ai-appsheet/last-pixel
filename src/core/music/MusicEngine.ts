/**
 * เครื่องเล่นเพลงสังเคราะห์: จัดคิวโน้ตล่วงหน้า ~0.2 วิ (setInterval + เวลา AudioContext — ไม่ผูกกับเฟรมเกม)
 * ครอสเฟดระหว่างเพลง · เสียงก้อง (Convolver สร้าง IR เอง) · เสียงสะท้อน · จำกัดเสียงซ้อน · หรี่ตอนหยุดเกม/สติงเกอร์
 */
import { chordLadder, compileSection, type Compiled, type Ev, type InstName, type TrackDef } from './compose';
import { INST, type VoiceKit } from './instruments';
import { mtof, noteToMidi, scalePcs } from './theory';
import { STINGERS, TRACKS, type MusicName, type StingerName } from './tracks';

export type { MusicName, StingerName };

const LOOKAHEAD = 0.22;
const TICK_MS = 50;
const FADE = 1.6;
/** เพลงที่กลับมาเล่นต่อจากท่อนเดิม (เพลงต่อสู้/หน้าแรกเริ่มต้นใหม่ทุกครั้ง) */
const RESUMABLE = new Set<MusicName>(['day', 'night', 'market', 'adventure', 'dungeon']);

/** ระดับเสียงแต่ละเครื่องในมิกซ์ */
const MIX: Record<InstName, number> = {
  marimba: 0.9, steel: 0.75, flute: 0.7, chip: 0.38, brass: 0.42, pluck: 0.4, bell: 0.45, kalimba: 0.6,
  bass: 0.85, bassSaw: 0.45, pad: 0.22, drone: 0.3,
  kick: 0.85, snare: 0.5, rim: 0.45, hat: 0.3, shaker: 0.3, clave: 0.3, conga: 0.55, taiko: 0.85, tom: 0.6, crash: 0.25, drip: 0.35, rumble: 0.6,
};
/** ปริมาณส่งเข้าเสียงก้อง (คูณกับ rev ของเพลง) */
const REV: Record<InstName, number> = {
  marimba: 0.5, steel: 0.55, flute: 0.65, chip: 0.4, brass: 0.55, pluck: 0.5, bell: 0.9, kalimba: 0.7,
  bass: 0.05, bassSaw: 0.08, pad: 0.8, drone: 0.7,
  kick: 0.08, snare: 0.4, rim: 0.4, hat: 0.15, shaker: 0.2, clave: 0.4, conga: 0.3, taiko: 0.5, tom: 0.5, crash: 0.5, drip: 1, rumble: 0.5,
};
/** เครื่องที่ส่งเข้าเสียงสะท้อน */
const ECHO = new Set<InstName>(['bell', 'kalimba', 'drip', 'flute', 'pluck', 'steel']);

/** ตารางโน้ตที่คอมไพล์แล้ว (คอมไพล์ครั้งเดียวต่อเพลง) */
const COMPILED = new Map<MusicName, Compiled[]>();

interface Chan {
  g: GainNode;
  level: number;
  nodes: AudioNode[];
}

/** สร้าง impulse response ของห้องก้อง (หางเสียงทึบลงเรื่อย ๆ) */
function impulse(ctx: AudioContext, secs: number, decay: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.2 + 0.7 * (1 - k));
      d[i] = lp * Math.pow(1 - k, decay) * (i < sr * 0.004 ? i / (sr * 0.004) : 1);
    }
  }
  return buf;
}

/** เพลงหนึ่งเพลงที่กำลังเล่น (หรือกำลังจางออก) */
class Playback {
  readonly chans = new Map<InstName, Chan>();
  private readonly compiled: Compiled[];
  private readonly scale: number[];
  private readonly stepDur: number;
  private sec: Compiled;
  private step = 0;
  pos: number;
  pass = 0;
  next: number;
  killAt = 0;
  private fade = 0;

  constructor(private eng: MusicEngine, readonly name: MusicName, readonly def: TrackDef, startPos: number, t0: number) {
    this.scale = scalePcs(def.key);
    this.stepDur = 60 / def.bpm / 4;
    let comp = COMPILED.get(name);
    if (!comp) COMPILED.set(name, (comp = def.order.map((k) => compileSection(def.sections[k], this.scale, `${name}.${k}`))));
    this.compiled = comp;
    this.pos = startPos % def.order.length;
    this.sec = this.compiled[this.pos];
    this.next = t0;
    // เตรียมช่องเสียงของทุกเครื่องที่ใช้ (ไว้ครอสเฟดพร้อมกัน)
    const used = new Set<InstName>(['hat']);
    for (const c of this.compiled) {
      for (const st of c.steps) for (const e of st) used.add(e.inst);
      for (const p of c.parts) {
        if (p.kind === 'mel' && p.alt) used.add(p.alt);
        if (p.kind === 'sparkle') used.add(p.inst);
        if (p.kind === 'drip') used.add('drip');
      }
    }
    used.forEach((i) => this.chan(i));
  }

  private chan(inst: InstName): Chan {
    const hit = this.chans.get(inst);
    if (hit) return hit;
    const { ctx } = this.eng;
    const g = ctx.createGain();
    const level = MIX[inst];
    g.gain.value = level * this.fade;
    g.connect(this.eng.musicIn);
    const nodes: AudioNode[] = [g];
    const r = REV[inst] * this.def.rev;
    if (r > 0.02) {
      const s = ctx.createGain();
      s.gain.value = r;
      g.connect(s).connect(this.eng.reverb);
      nodes.push(s);
    }
    const e = ECHO.has(inst) ? this.def.echo ?? 0 : 0;
    if (e > 0.02) {
      const s = ctx.createGain();
      s.gain.value = e;
      g.connect(s).connect(this.eng.echoIn);
      nodes.push(s);
    }
    const c: Chan = { g, level, nodes };
    this.chans.set(inst, c);
    return c;
  }

  fadeTo(target: number, secs: number) {
    const now = this.eng.ctx.currentTime;
    this.fade = target;
    for (const c of this.chans.values()) {
      const p = c.g.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(c.level * target, now + secs);
    }
  }

  dispose() {
    for (const c of this.chans.values()) c.nodes.forEach((n) => n.disconnect());
    this.chans.clear();
  }

  /** จัดคิวโน้ตของ 1/16 จังหวะถัดไป */
  scheduleStep() {
    const sec = this.sec;
    const s = this.step;
    const t = this.next + (s % 2 ? (this.def.swing ?? 0) * this.stepDur : 0);
    if (this.eng.audible && !this.eng.paused) {
      for (const ev of sec.steps[s]) this.fire(ev, t);
      // ส่วนที่สุ่มตอนเล่น (กันซ้ำซาก)
      sec.parts.forEach((p, i) => {
        if (p.kind === 'sparkle') {
          const every = 16 / (p.res ?? 8);
          if (s % every === 0 && Math.random() < p.prob) {
            const lad = chordLadder(sec.chords[s], p.oct ?? 5);
            this.fire({ inst: p.inst, m: lad[Math.floor(Math.random() * Math.min(5, lad.length))], d: every * 2, v: 0.6 * (p.vol ?? 1), p: 2, part: i }, t);
          }
        } else if (p.kind === 'drip') {
          if (Math.random() < p.prob) this.fire({ inst: 'drip', m: 82 + Math.floor(Math.random() * 16), d: 1, v: (0.35 + Math.random() * 0.45) * (p.vol ?? 1), p: 1, part: i }, t + Math.random() * this.stepDur);
        } else if (p.kind === 'drums' && p.ghost && s % 2 === 1 && Math.random() < p.ghost) {
          this.fire({ inst: 'hat', m: 42, d: 1, v: 0.22 * (p.vol ?? 1), p: 2, part: i }, t);
        }
      });
    }
    this.next += this.stepDur;
    if (++this.step >= sec.steps.length) {
      this.step = 0;
      if (++this.pos >= this.compiled.length) {
        this.pos = this.def.loopFrom ?? 0;
        this.pass++;
      }
      this.sec = this.compiled[this.pos];
    }
  }

  private fire(ev: Ev, t: number) {
    const eng = this.eng;
    if (eng.busy(ev.p)) return;
    const part = this.sec.parts[ev.part];
    let inst = ev.inst;
    let gate = 1;
    let hum = 0;
    if (part.kind === 'mel') {
      if (part.alt && this.pass % 2 === 1) inst = part.alt;
      gate = part.gate ?? 0.92;
      hum = (Math.random() - 0.5) * 0.012;
      // ประดับโน้ต (รอบหลัง ๆ): โน้ตเกลาเสียงสั้น ๆ ก่อนโน้ตยาว
      if (this.pass > 0 && ev.p === 0 && ev.d >= 4 && Math.random() < 0.14) {
        const up = this.scale.includes((ev.m + 2) % 12) ? 2 : 1;
        this.play(inst, t - 0.07, ev.m + up, 0.07, ev.v * 0.45);
      }
    } else if (part.kind === 'bass' || part.kind === 'arp') {
      gate = part.gate ?? (part.kind === 'bass' ? 0.85 : 0.9);
      hum = (Math.random() - 0.5) * 0.006;
    }
    this.play(inst, t + hum, ev.m, ev.d * this.stepDur * gate, ev.v * (0.92 + Math.random() * 0.16));
  }

  private play(inst: InstName, t: number, m: number, dur: number, vel: number) {
    const now = this.eng.ctx.currentTime;
    const end = INST[inst](this.eng.kit, this.chan(inst).g, Math.max(now + 0.005, t), mtof(m), dur, vel);
    this.eng.voice(end);
  }
}

export class MusicEngine {
  readonly kit: VoiceKit;
  /** ทุกช่องเสียงของเพลงเข้าที่นี่ */
  readonly musicIn: GainNode;
  readonly reverb: ConvolverNode;
  readonly echoIn: GainNode;
  /** false = ปิดเพลง/ปิดเสียง → เดินเพลงต่อแต่ไม่สร้างเสียง (ประหยัด CPU) */
  audible = true;
  /** เกมหยุด (เมนู/ป๊อปอัป) → เงียบ และไม่สร้างโน้ต */
  paused = false;
  private readonly echo: DelayNode;
  private readonly pauseG: GainNode;
  private readonly duckG: GainNode;
  /** ประตูปิดเพลงทั้งหมด (รวมหางเสียงก้อง/สะท้อน) ตอน stop */
  private readonly gateG: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly sting: GainNode;
  private pbs: Playback[] = [];
  private cur: Playback | null = null;
  private resumeAt = new Map<MusicName, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ends: number[] = [];
  private lastSting: { name: StingerName | null; at: number } = { name: null, at: -99 };
  private readonly cap: number;

  constructor(readonly ctx: AudioContext, dest: AudioNode, sfxDest: AudioNode, noise: AudioBuffer, low: boolean) {
    this.kit = { ctx, noise, low, waves: new Map() };
    this.cap = low ? 18 : 34;
    // musicIn → หรี่ตอนหยุดเกม → หรี่ตอนสติงเกอร์ → โลว์พาส (อู้อี้ตอนหยุด) → คอมเพรสเซอร์ → ออก
    this.musicIn = ctx.createGain();
    this.pauseG = ctx.createGain();
    this.duckG = ctx.createGain();
    this.gateG = ctx.createGain();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 18000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    const trim = ctx.createGain();
    trim.gain.value = 0.75;
    this.musicIn.connect(this.pauseG).connect(this.duckG).connect(this.gateG).connect(this.lp).connect(comp).connect(trim).connect(dest);
    // เสียงก้อง
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, low ? 1.4 : 2.6, low ? 3 : 2.4);
    this.reverb.connect(this.pauseG);
    // เสียงสะท้อน (ดีเลย์ป้อนกลับ ทึบลงทุกรอบ)
    this.echoIn = ctx.createGain();
    this.echo = ctx.createDelay(2);
    this.echo.delayTime.value = 0.45;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.echoIn.connect(this.echo).connect(tone);
    tone.connect(fb).connect(this.echo);
    tone.connect(this.pauseG);
    // สติงเกอร์: เสียงตรงเข้าช่องเอฟเฟกต์ (ตามระดับเสียงเอฟเฟกต์) + ก้องนิด ๆ
    this.sting = ctx.createGain();
    this.sting.connect(sfxDest);
    const sr = ctx.createGain();
    sr.gain.value = 0.3;
    this.sting.connect(sr).connect(this.reverb);
  }

  get current(): MusicName | null {
    return this.cur?.name ?? null;
  }

  /** เปลี่ยนเพลง (ครอสเฟด) — เพลงเดิมอยู่แล้วไม่ทำอะไร */
  play(name: MusicName, fade = FADE) {
    const now = this.ctx.currentTime;
    this.gateG.gain.cancelScheduledValues(now);
    this.gateG.gain.setTargetAtTime(1, now, 0.03);
    if (this.cur?.name === name) return;
    const had = !!this.cur;
    if (this.cur) this.retire(this.cur, fade);
    // เพลงนี้ยังจางออกอยู่ → ดึงกลับมาเลย ไม่ต้องเริ่มใหม่
    const back = this.pbs.find((p) => p.name === name && p.killAt > 0);
    if (back) {
      back.killAt = 0;
      back.fadeTo(1, fade);
      this.cur = back;
    } else {
      const pb = new Playback(this, name, TRACKS[name], RESUMABLE.has(name) ? this.resumeAt.get(name) ?? 0 : 0, now + 0.08);
      pb.fadeTo(1, had ? fade : 1);
      this.pbs.push(pb);
      this.cur = pb;
    }
    this.echo.delayTime.setTargetAtTime(Math.min(1.5, (60 / TRACKS[name].bpm) * 0.75), now, 0.3);
    if (!this.timer) this.timer = setInterval(this.tick, TICK_MS);
  }

  /** หยุดเพลงทันที (จาง ≤0.3 วิ) — ปิดประตูรวมด้วย หางเสียงก้อง/สะท้อนไม่ค้าง */
  stop(fade = 0.25) {
    const now = this.ctx.currentTime;
    if (this.cur) this.retire(this.cur, fade);
    for (const pb of this.pbs) if (pb.killAt === 0 || pb.killAt > now + fade + 0.15) this.retire(pb, fade);
    this.cur = null;
    this.gateG.gain.cancelScheduledValues(now);
    this.gateG.gain.setTargetAtTime(0, now, fade / 4);
  }

  /** ปิดทุกอย่างถาวร (ก่อนปิด AudioContext) */
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.pbs.forEach((p) => p.dispose());
    this.pbs = [];
    this.cur = null;
  }

  private retire(pb: Playback, fade: number) {
    pb.fadeTo(0, fade);
    pb.killAt = this.ctx.currentTime + fade + 0.15;
    this.resumeAt.set(pb.name, pb.pos);
  }

  /** เกมหยุด (เมนู/ป๊อปอัป): เพลงจางเงียบใน ~0.3 วิ (เดินจังหวะต่อแต่ไม่สร้างโน้ต) · กลับมาค่อย ๆ ดังขึ้น */
  setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    const now = this.ctx.currentTime;
    this.pauseG.gain.cancelScheduledValues(now);
    this.pauseG.gain.setTargetAtTime(p ? 0 : 1, now, p ? 0.07 : 0.25);
    this.lp.frequency.setTargetAtTime(p ? 900 : 18000, now, p ? 0.05 : 0.3);
  }

  /** เล่นท่อนสั้น (เลเวลอัป/ชนะ/ตาย) แล้วหรี่เพลงพื้นหลังชั่วครู่ */
  stinger(name: StingerName) {
    // เลเวลอัปรอเสี้ยววิ: ถ้าชนะภัย/ตายพร้อมกัน (ได้ XP จากภัย) → เล่นแค่ท่อนนั้น
    if (name === 'levelUp') {
      setTimeout(() => {
        if (this.lastSting.name !== 'levelUp' && this.ctx.currentTime - this.lastSting.at < 2.5) return;
        this.playSting(name);
      }, 60);
    } else this.playSting(name);
  }

  private playSting(name: StingerName) {
    const now = this.ctx.currentTime;
    this.lastSting = { name, at: now };
    const st = STINGERS[name];
    const beat = 60 / st.bpm;
    const t0 = now + 0.03;
    for (const [b, inst, note, beats, vel] of st.notes) INST[inst](this.kit, this.sting, t0 + b * beat, mtof(noteToMidi(note)), beats * beat, vel * MIX[inst] * 0.35);
    const g = this.duckG.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0.3, now, 0.05);
    g.setTargetAtTime(1, now + st.duck, 0.4);
  }

  /** เสียงซ้อนเต็มแล้วไหม (ตัดส่วนที่ไม่สำคัญก่อน) */
  busy(prio: number): boolean {
    if (prio === 0) return false;
    const now = this.ctx.currentTime;
    if (this.ends.length > 24) this.ends = this.ends.filter((e) => e > now);
    let n = 0;
    for (const e of this.ends) if (e > now) n++;
    return n >= (prio === 2 ? this.cap * 0.75 : this.cap);
  }

  voice(end: number) {
    this.ends.push(end);
  }

  private tick = () => {
    if (this.ctx.state !== 'running') return; // แท็บซ่อน/ยังไม่ปลดล็อก = เวลาหยุด
    const now = this.ctx.currentTime;
    for (const pb of this.pbs) {
      if (pb.next < now - 0.2) pb.next = now + 0.03; // ตามไม่ทัน (เครื่องค้าง) → ข้าม ไม่ยิงโน้ตรัว
      let guard = 0;
      while (pb.next < now + LOOKAHEAD && guard++ < 64) pb.scheduleStep();
    }
    const dead = this.pbs.filter((p) => p.killAt > 0 && now > p.killAt);
    if (dead.length) {
      dead.forEach((p) => p.dispose());
      this.pbs = this.pbs.filter((p) => !dead.includes(p));
    }
    if (!this.pbs.length && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  };
}
