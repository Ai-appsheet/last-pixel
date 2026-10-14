/**
 * เครื่องดนตรีสังเคราะห์ (WebAudio) — ทุกเสียงมี envelope ขึ้น/ลง ไม่มีเสียงคลิก
 * แต่ละฟังก์ชันคืน "เวลาที่เสียงจบ" ไว้นับจำนวนเสียงซ้อน
 */
import type { InstName } from './compose';

export interface VoiceKit {
  ctx: AudioContext;
  noise: AudioBuffer;
  /** มือถือ/เครื่องช้า: ตัดชั้นเสียงรองออก */
  low: boolean;
  waves: Map<string, PeriodicWave>;
}

type InstFn = (k: VoiceKit, out: AudioNode, t: number, f: number, dur: number, vel: number) => number;

/** ตารางฮาร์มอนิก (ค่า sin) ของคลื่นเฉพาะ */
const WAVES: Record<string, number[]> = {
  steel: [0, 1, 0.55, 0.32, 0.14, 0.07, 0.03],
  flute: [0, 1, 0.2, 0.08, 0.03],
  warm: [0, 1, 0.5, 0.33, 0.22, 0.15, 0.1, 0.07, 0.05],
  pulse: Array.from({ length: 24 }, (_, n) => (n === 0 ? 0 : Math.abs(Math.sin((n * Math.PI) / 4)) / n)),
};

function wave(k: VoiceKit, name: string): PeriodicWave {
  let w = k.waves.get(name);
  if (!w) {
    const imag = new Float32Array(WAVES[name]);
    w = k.ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    k.waves.set(name, w);
  }
  return w;
}

function osc(k: VoiceKit, type: string, f: number, t: number, end: number): OscillatorNode {
  const o = k.ctx.createOscillator();
  if (type === 'sine' || type === 'square' || type === 'sawtooth' || type === 'triangle') o.type = type;
  else o.setPeriodicWave(wave(k, type));
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(end + 0.02);
  return o;
}

function amp(k: VoiceKit, out: AudioNode): GainNode {
  const g = k.ctx.createGain();
  g.gain.value = 0;
  g.connect(out);
  return g;
}

/** เสียงตีแล้วค่อย ๆ จาง */
function perc(g: GainNode, t: number, vel: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0005, t + attack + decay);
  return t + attack + decay;
}

/** เสียงลากยาว: ขึ้น → ค้าง → ปล่อย */
function held(g: GainNode, t: number, vel: number, attack: number, dur: number, release: number, sustain = 0.85) {
  const a = Math.min(attack, dur * 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  g.gain.linearRampToValueAtTime(vel * sustain, t + Math.max(a + 0.01, dur));
  g.gain.exponentialRampToValueAtTime(0.0005, t + Math.max(a + 0.01, dur) + release);
  return t + Math.max(a + 0.01, dur) + release;
}

function lowpass(k: VoiceKit, out: AudioNode, freq: number, q = 0.7): BiquadFilterNode {
  const f = k.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(out);
  return f;
}

function noiseSrc(k: VoiceKit, t: number, end: number): AudioBufferSourceNode {
  const s = k.ctx.createBufferSource();
  s.buffer = k.noise;
  s.loop = true; // เสียงยาวกว่าบัฟเฟอร์ (ฉาบ/ครืน) ไม่ขาดกลางคัน
  s.start(t, Math.random() * k.noise.duration * 0.9);
  s.stop(end + 0.02);
  return s;
}

function noiseHit(k: VoiceKit, out: AudioNode, t: number, vel: number, type: BiquadFilterType, freq: number, attack: number, decay: number, q = 0.8) {
  const g = amp(k, out);
  const f = k.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  f.connect(g);
  const end = perc(g, t, vel, attack, decay);
  noiseSrc(k, t, end).connect(f);
  return end;
}

/** ไวเบรโตแบบเริ่มช้า (เฉพาะโน้ตยาว) */
function vibrato(k: VoiceKit, o: OscillatorNode, f: number, t: number, end: number, depth: number) {
  const lfo = k.ctx.createOscillator();
  const lg = k.ctx.createGain();
  lfo.frequency.value = 5.2;
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(0, t + 0.18);
  lg.gain.linearRampToValueAtTime(f * depth, t + 0.5);
  lfo.connect(lg).connect(o.frequency);
  lfo.start(t);
  lfo.stop(end + 0.02);
}

export const INST: Record<InstName, InstFn> = {
  // ระนาดฝรั่ง: ไซน์ + ฮาร์มอนิกเคาะ (โน้ตต่ำก้องนานกว่า)
  marimba: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.004, Math.min(1.1, 0.22 + 90 / f));
    osc(k, 'sine', f, t, end).connect(g);
    if (!k.low) {
      const g2 = amp(k, out);
      osc(k, 'sine', f * 3.93, t, perc(g2, t, vel * 0.3, 0.002, 0.06)).connect(g2);
    }
    return end;
  },
  // กลองกระทะ (steel pan): คลื่นฮาร์มอนิกเดียว + เสียงเอื้อนตอนเคาะ
  steel: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.006, Math.max(0.45, Math.min(1.3, dur + 0.35)));
    const o = osc(k, 'steel', f * 1.012, t, end);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    o.connect(g);
    return end;
  },
  // ขลุ่ย: ลมหายใจ + ไวเบรโต
  flute: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 0.06, dur, 0.12, 0.8);
    const o = osc(k, 'flute', f, t, end);
    o.connect(g);
    if (!k.low) {
      if (dur > 0.35) vibrato(k, o, f, t, end, 0.007);
      noiseHit(k, out, t, vel * 0.18, 'bandpass', Math.min(8000, f * 2), 0.01, 0.12, 1.5);
    }
    return end;
  },
  // ชิปทูนพัลส์ 25%
  chip: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 0.006, dur, 0.06, 0.7);
    const o = osc(k, 'pulse', f, t, end);
    o.connect(lowpass(k, g, Math.min(5200, f * 6)));
    if (!k.low && dur > 0.4) vibrato(k, o, f, t, end, 0.006);
    return end;
  },
  // ทองเหลือง: ซอว์ 2 ตัวเพี้ยนนิด ๆ + ฟิลเตอร์เปิดตอนเป่า
  brass: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 0.03, dur, 0.12, 0.8);
    const lp = lowpass(k, g, f * 1.5, 1.5);
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.linearRampToValueAtTime(Math.min(f * 8, 5000), t + 0.06);
    lp.frequency.setTargetAtTime(Math.min(f * 4, 3200), t + 0.06, 0.15);
    const a = osc(k, 'sawtooth', f, t, end);
    a.detune.value = -6;
    a.connect(lp);
    if (!k.low) {
      const b = osc(k, 'sawtooth', f, t, end);
      b.detune.value = 7;
      b.connect(lp);
    }
    return end;
  },
  // ดีดสั้น (อาร์เปจ)
  pluck: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.003, Math.min(0.45, dur + 0.15));
    const lp = lowpass(k, g, 5000);
    lp.frequency.setValueAtTime(Math.min(6000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.18);
    osc(k, 'pulse', f, t, end).connect(lp);
    return end;
  },
  // ระฆัง FM (กลางคืน/ถ้ำ)
  bell: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.003, 1.9);
    const c = osc(k, 'sine', f, t, end);
    const m = osc(k, 'sine', f * 3.5, t, end);
    const mg = k.ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
    m.connect(mg).connect(c.frequency);
    c.connect(g);
    return end;
  },
  // คาลิมบา: FM สั้น ใส ๆ
  kalimba: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.002, 0.7);
    const c = osc(k, 'sine', f, t, end);
    if (!k.low) {
      const m = osc(k, 'sine', f * 2, t, end);
      const mg = k.ctx.createGain();
      mg.gain.setValueAtTime(f * 1.4, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.02, t + 0.25);
      m.connect(mg).connect(c.frequency);
    }
    c.connect(g);
    return end;
  },
  // เบสอุ่น ๆ
  bass: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 0.006, dur, 0.05, 0.85);
    osc(k, 'warm', f, t, end).connect(lowpass(k, g, Math.min(900, f * 5)));
    return end;
  },
  // เบสซอว์ดุ ๆ (ฉากต่อสู้)
  bassSaw: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 0.004, dur, 0.04, 0.75);
    const lp = lowpass(k, g, 1800, 4);
    lp.frequency.setValueAtTime(Math.min(2600, f * 14), t);
    lp.frequency.setTargetAtTime(f * 3, t + 0.005, 0.07);
    osc(k, 'sawtooth', f, t, end).connect(lp);
    return end;
  },
  // แพดนุ่ม ๆ (เสียงคอร์ดพื้นหลัง)
  pad: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, Math.min(0.6, dur * 0.35), dur, 0.6, 0.9);
    const lp = lowpass(k, g, Math.min(1600, f * 4));
    osc(k, 'warm', f, t, end).connect(lp);
    if (!k.low) {
      const b = osc(k, 'warm', f, t, end);
      b.detune.value = 9;
      b.connect(lp);
    }
    return end;
  },
  // โดรนต่ำ ๆ ฟิลเตอร์หายใจช้า ๆ (ถ้ำ)
  drone: (k, out, t, f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, 1.6, dur, 1.6, 0.9);
    const lp = lowpass(k, g, 320, 2);
    const lfo = k.ctx.createOscillator();
    const lg = k.ctx.createGain();
    lfo.frequency.value = 0.13;
    lg.gain.value = 160;
    lfo.connect(lg).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(end + 0.02);
    osc(k, 'sawtooth', f, t, end).connect(lp);
    if (!k.low) {
      const b = osc(k, 'sawtooth', f, t, end);
      b.detune.value = 7;
      b.connect(lp);
    }
    return end;
  },

  // ---------- กลอง/เพอร์คัชชัน ----------
  kick: (k, out, t, _f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.002, 0.32);
    const o = osc(k, 'sine', 150, t, end);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    o.connect(g);
    return end;
  },
  snare: (k, out, t, _f, _d, vel) => {
    const end = noiseHit(k, out, t, vel * 0.8, 'highpass', 1400, 0.001, 0.15);
    if (!k.low) {
      const g = amp(k, out);
      const o = osc(k, 'triangle', 190, t, perc(g, t, vel * 0.55, 0.001, 0.07));
      o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      o.connect(g);
    }
    return end;
  },
  rim: (k, out, t, _f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel * 0.6, 0.001, 0.035);
    osc(k, 'triangle', 1650, t, end).connect(g);
    return end;
  },
  hat: (k, out, t, _f, dur, vel) => noiseHit(k, out, t, vel * 0.6, 'highpass', 7500, 0.001, dur > 0.12 ? 0.22 : 0.035),
  shaker: (k, out, t, _f, _d, vel) => noiseHit(k, out, t, vel * 0.55, 'bandpass', 5800, 0.012, 0.06, 0.9),
  clave: (k, out, t, _f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel * 0.7, 0.001, 0.07);
    osc(k, 'sine', 2350, t, end).connect(g);
    return end;
  },
  conga: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.002, 0.24);
    const o = osc(k, 'sine', f * 1.35, t, end);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    o.connect(g);
    return end;
  },
  taiko: (k, out, t, _f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.003, 0.7);
    const o = osc(k, 'sine', 105, t, end);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.25);
    o.connect(g);
    if (!k.low) noiseHit(k, out, t, vel * 0.45, 'lowpass', 380, 0.002, 0.12);
    return end;
  },
  tom: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.002, 0.34);
    const o = osc(k, 'sine', f * 1.6, t, end);
    o.frequency.exponentialRampToValueAtTime(f * 0.95, t + 0.16);
    o.connect(g);
    return end;
  },
  crash: (k, out, t, _f, _d, vel) => noiseHit(k, out, t, vel * 0.5, 'highpass', 4800, 0.002, 1.3, 0.5),
  // หยดน้ำ: ไซน์ไต่เสียงขึ้นเร็ว ๆ
  drip: (k, out, t, f, _d, vel) => {
    const g = amp(k, out);
    const end = perc(g, t, vel, 0.002, 0.09);
    const o = osc(k, 'sine', f, t, end);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    o.connect(g);
    return end;
  },
  // เสียงครืนต่ำ ๆ ในถ้ำ
  rumble: (k, out, t, _f, dur, vel) => {
    const g = amp(k, out);
    const end = held(g, t, vel, Math.min(1.5, dur * 0.4), dur, 1.2, 0.8);
    const f = k.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 140;
    f.connect(g);
    noiseSrc(k, t, end).connect(f);
    return end;
  },
};
