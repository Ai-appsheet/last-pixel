import Phaser from 'phaser';
import type { Slot } from '../../components/Inventory';
import type { EquipSlot } from '../../data/equipment';
import { ITEMS, type ItemDef } from '../../data/items';
import { bandOf, levelOfSlot } from '../../data/upgrade';
import { itemEl, type FxEl } from '../../fx/CombatFx';
import { PixelCanvas, dither, mixHex } from '../PixelCanvas';
import { CAPE_DEFS, HAIR, HELMET_DEFS, OUTFITS, type HelmetDef, type HeroLook, type Mat, type OutfitDef } from './heroes';

// รูปเหมือนตัวละครแบบละเอียด (หน้ากระเป๋า/ตู้เสื้อผ้า): วาดใหม่ที่ 4 เท่าของกริด sprite (20×24 → 80×96 พิกเซลจริง)
// สัดส่วน/ตำแหน่งเหมือนตัวในเกม (หัว y8..55 ลำตัว y56..75 ขา y76..91) — ทรงผม/หมวกใช้ลายเดิมขยายแบบ EPX ให้มน
// แล้วลงเงา 4–5 เฉด ลายผ้า เส้นผม หน้าตา อาวุธในมือ โล่ เครื่องประดับ ใหม่ทั้งหมดที่ความละเอียดจริง
// เฟรม: 0 ยืน · 1 หายใจเข้า (อกยก 1px) · 2 กะพริบตา

export const PORTRAIT_W = 80;
export const PORTRAIT_H = 96;
/** จุดเท้า (เงาพื้น) นับจากขอบบนของรูป */
export const PORTRAIT_FEET = 91;
const PW = PORTRAIT_W;
const PH = PORTRAIT_H;
const NPX = PW * PH;

// ---------------------------------------------------------------- สี

const MIX = new Map<string, string>();
function mx(a: string, b: string, t: number): string {
  const k = `${a}|${b}|${t}`;
  let v = MIX.get(k);
  if (!v) MIX.set(k, (v = mixHex(a, b, t)));
  return v;
}
const INK = '#1d1630';
const dk = (c: string, t = 0.35) => mx(c, INK, t);
const lt = (c: string, t = 0.3) => mx(c, '#fff6e0', t);
const matOf = (c: string): Mat => ({ d: dk(c, 0.35), m: c, l: lt(c, 0.3), h: lt(c, 0.62) });

function lum(c: string) {
  const h = mixHex(c, c, 0).slice(1);
  const n = parseInt(h, 16);
  return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255;
}

/** 6 โทน: เงาลึก · เงา · กลาง · รับแสง · ประกาย · เส้นใน */
const TONES = new WeakMap<Mat, string[]>();
function tones(mt: Mat): string[] {
  let t = TONES.get(mt);
  if (!t) {
    t = [dk(mt.d, 0.32), mt.d, mt.m, mt.l, mt.h ?? lt(mt.l, 0.38), mx(mt.d, '#120a1c', 0.55)];
    TONES.set(mt, t);
  }
  return t;
}

// วัสดุ
const STEEL: Mat = { d: 'D', m: 'L', l: 'w', h: 'W' };
const DSTEEL: Mat = { d: 'F', m: 'D', l: 'L', h: 'w' };
const GOLD: Mat = { d: '#a0662a', m: '#e0a040', l: 'Y', h: 'y' };
const LEATHER: Mat = { d: 'm', m: 'M', l: 'N' };
const DLEATHER: Mat = { d: 'n', m: 'm', l: 'M' };
const WOOD: Mat = { d: 'm', m: 'M', l: 'N', h: '#e0b07a' };
const LIGHT_WOOD: Mat = { d: 'M', m: 'N', l: '#e0b07a', h: '#f6d8a8' };
const STONE: Mat = { d: '#4a4550', m: '#7a7484', l: '#a8a2b0', h: '#d0ccd6' };
const BONE: Mat = { d: 's', m: 'S', l: '#f6e4bc', h: 'W' };
const CRYSTAL: Mat = { d: '#2a7f9a', m: 'b', l: 'C', h: 'W' };
const METEOR: Mat = { d: '#1c0c24', m: '#3a1840', l: '#62306e', h: 'u' };
const ICE: Mat = { d: '#2a6f9a', m: '#73c8f7', l: 'C', h: 'W' };
const FIRE: Mat = { d: '#7a1e2e', m: 'R', l: 'r', h: 'Y' };
const VENOM: Mat = { d: 'V', m: 'H', l: 'G', h: 'g' };
const SHADOW: Mat = { d: '#100f1c', m: '#262b44', l: '#5d4a8a', h: 'u' };
const BLOOD: Mat = { d: '#3a0f1e', m: '#7a1e34', l: 'R', h: '#ff7d8a' };
const STORM: Mat = { d: '#29366f', m: 'B', l: 'b', h: 'y' };
const HOLY: Mat = { d: '#a0662a', m: 'Y', l: 'y', h: 'W' };
const SHELL: Mat = { d: 'R', m: 'r', l: '#ffb38a', h: 'Y' };
const JADE: Mat = { d: '#1b4d3e', m: '#2c8a55', l: '#7fd6a0', h: '#d8ffe8' };
const EARTH: Mat = { d: 'm', m: '#a0662a', l: '#d9a066', h: 'Y' };
const WATER: Mat = { d: 'U', m: 'B', l: 'b', h: 'C' };
const WIND: Mat = { d: 'T', m: '#3c9a96', l: '#9ff5d0', h: 'W' };
const COSMIC: Mat = { d: '#120818', m: '#29366f', l: '#7a5ad8', h: 'C' };
const LINEN: Mat = { d: 's', m: 'S', l: '#f6e4bc' };
const RED: Mat = { d: '#6e2034', m: 'R', l: '#d8606f' };
const FUR: Mat = { d: 'L', m: 'w', l: 'W' };
const DARK: Mat = { d: '#141522', m: '#2a2d45', l: '#454b6e', h: 'D' };

const EL_HEX: Partial<Record<FxEl, string>> = {
  fire: '#ff8a3d', ice: '#73eff7', bolt: '#fff07a', poison: '#7cf07a', holy: '#ffd76a', dark: '#a66bff',
  water: '#4aa8ff', wind: '#9ff5d0', earth: '#d9a066', arcane: '#c58cff', blood: '#ff5a6e',
};

// ---------------------------------------------------------------- mask

class Mk {
  readonly on = new Uint8Array(NPX);

  has(x: number, y: number) {
    return x >= 0 && y >= 0 && x < PW && y < PH && this.on[y * PW + x] === 1;
  }

  add(x: number, y: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < PW && y < PH) this.on[y * PW + x] = 1;
    return this;
  }

  del(x: number, y: number) {
    if (x >= 0 && y >= 0 && x < PW && y < PH) this.on[y * PW + x] = 0;
    return this;
  }

  rect(x: number, y: number, w: number, h: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j);
    return this;
  }

  /** วงรี/ซูเปอร์เอลลิปส์ (p>2 = เหลี่ยมมน) ทดสอบที่กึ่งกลางพิกเซล */
  ell(cx: number, cy: number, rx: number, ry: number, p = 2) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = Math.abs((x + 0.5 - cx) / rx);
        const ny = Math.abs((y + 0.5 - cy) / ry);
        if (nx ** p + ny ** p <= 1) this.add(x, y);
      }
    }
    return this;
  }

  /** รูปหลายเหลี่ยม [x0,y0,x1,y1,…] เติมแบบ scanline */
  poly(p: number[]) {
    const n = p.length / 2;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      y0 = Math.min(y0, p[i * 2 + 1]);
      y1 = Math.max(y1, p[i * 2 + 1]);
    }
    const xs: number[] = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5;
      xs.length = 0;
      for (let i = 0; i < n; i++) {
        const ax = p[i * 2];
        const ay = p[i * 2 + 1];
        const bx = p[((i + 1) % n) * 2];
        const by = p[((i + 1) % n) * 2 + 1];
        if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.add(x, y);
    }
    return this;
  }

  /** เส้นหลายท่อน แปรงสี่เหลี่ยม w px */
  stroke(p: number[], w = 1) {
    for (let i = 0; i + 3 < p.length; i += 2) {
      const [ax, ay, bx, by] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2));
      for (let s = 0; s <= steps; s++) {
        const x = Math.round(ax + ((bx - ax) * s) / steps - (w - 1) / 2);
        const y = Math.round(ay + ((by - ay) * s) / steps - (w - 1) / 2);
        for (let j = 0; j < w; j++) for (let k = 0; k < w; k++) this.add(x + k, y + j);
      }
    }
    return this;
  }

  or(o: Mk) {
    for (let i = 0; i < NPX; i++) if (o.on[i]) this.on[i] = 1;
    return this;
  }

  cut(o: Mk) {
    for (let i = 0; i < NPX; i++) if (o.on[i]) this.on[i] = 0;
    return this;
  }

  keep(fn: (x: number, y: number) => boolean) {
    for (let i = 0; i < NPX; i++) if (this.on[i] && !fn(i % PW, (i / PW) | 0)) this.on[i] = 0;
    return this;
  }

  bbox(): [number, number, number, number] | null {
    let x0 = PW;
    let y0 = PH;
    let x1 = -1;
    let y1 = -1;
    for (let i = 0; i < NPX; i++) {
      if (!this.on[i]) continue;
      const x = i % PW;
      const y = (i / PW) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
    return x1 < 0 ? null : [x0, y0, x1, y1];
  }
}

/** ขยาย 2 เท่าแบบ EPX (มุมนูนถูกตัดมน) */
function epx(src: Uint8Array, w: number, h: number): Uint8Array {
  const W2 = w * 2;
  const out = new Uint8Array(W2 * h * 2);
  const g = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? src[y * w + x] : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const E = g(x, y);
      const A = g(x, y - 1);
      const B = g(x + 1, y);
      const C = g(x - 1, y);
      const D = g(x, y + 1);
      const o = y * 2 * W2 + x * 2;
      out[o] = C === A && C !== D && A !== B ? A : E;
      out[o + 1] = A === B && A !== C && B !== D ? B : E;
      out[o + W2] = D === C && D !== B && C !== A ? C : E;
      out[o + W2 + 1] = B === D && B !== A && D !== C ? D : E;
    }
  }
  return out;
}

/** ลายตัวอักษรกว้าง 20 (เหมือน heroes.ts) → mask 80×96 (EPX สองรอบ) เฉพาะตัวอักษรใน chars */
function fromRows(rows: string[], chars: string, minY = 0): Mk {
  const lw = 20;
  const lh = 24;
  const g = new Uint8Array(lw * lh);
  rows.forEach((row, y) => {
    if (y < minY || y >= lh) return;
    for (let x = 0; x < Math.min(lw, row.length); x++) if (chars.includes(row[x])) g[y * lw + x] = 1;
  });
  const m = new Mk();
  m.on.set(epx(epx(g, lw, lh), lw * 2, lh * 2));
  return m;
}

// ---------------------------------------------------------------- ระบาย

const RIM = [0, 1, 0.55, 0.25, 0.08, 0, 0, 0];
const SHD = [0, 1, 0.78, 0.55, 0.32, 0.14, 0.05, 0];
const isSolid = (p: string | null) => !!p && !p.startsWith('rgba');

function dist(m: Mk, x: number, y: number, dx: number, dy: number) {
  for (let k = 1; k <= 6; k++) if (!m.has(x + dx * k, y + dy * k)) return k;
  return 7;
}

interface FillOpt {
  /** เส้นในตรงขอบที่ติดชิ้นที่วาดไว้ก่อน (ค่าเริ่มต้น true) */
  line?: boolean;
  /** ความแรงขอบรับแสง (ชิ้นเล็ก ๆ ลดลง) */
  soft?: number;
  /** ปรับความสว่างทีละพิกเซล (ลายผ้า/เส้นผม/รอยพับ) */
  tex?: (x: number, y: number) => number;
  bias?: number;
  noHi?: boolean;
}

/** ระบายวัสดุลง mask: แสงซ้ายบน แถบรับแสงที่ขอบซ้าย/บน แถบเงาขอบขวา/ล่าง ไล่ 5 เฉด + dither */
function fill(c: PixelCanvas, m: Mk, mt: Mat, o: FillOpt = {}) {
  const bb = m.bbox();
  if (!bb) return;
  const [x0, y0, x1, y1] = bb;
  const T = tones(mt);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const soft = o.soft ?? 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!m.has(x, y)) continue;
      const rim = RIM[dist(m, x, y, -1, 0)] * 0.45 + RIM[dist(m, x, y, 0, -1)] * 0.7;
      const sh = SHD[dist(m, x, y, 1, 0)] * 0.55 + SHD[dist(m, x, y, 0, 1)] * 0.75;
      const u = (x - x0 + 0.5) / w;
      const v = (y - y0 + 0.5) / h;
      const val = (0.5 - u) * 0.5 + (0.5 - v) * 0.4 + rim * 0.6 * soft - sh * 0.8 + dither(x, y) * 0.16 + (o.tex ? o.tex(x, y) : 0) + (o.bias ?? 0);
      const i = val > 0.72 && rim > 0.35 && !o.noHi ? 4 : val > 0.22 ? 3 : val > -0.24 ? 2 : val > -0.66 ? 1 : 0;
      c.px[y * PW + x] = T[i];
    }
  }
  if (o.line !== false) edges(c, m, T[5]);
}

/** เส้นในบาง 1px: ขอบของ m ที่ติดพิกเซลทึบซึ่งวาดไว้ก่อน */
function edges(c: PixelCanvas, m: Mk, col: string) {
  const out: number[] = [];
  for (let i = 0; i < NPX; i++) {
    if (!m.on[i]) continue;
    const x = i % PW;
    const y = (i / PW) | 0;
    for (const [dx, dy] of NB4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= PW || ny >= PH || m.has(nx, ny)) continue;
      if (isSolid(c.px[ny * PW + nx])) {
        out.push(i);
        break;
      }
    }
  }
  for (const i of out) c.px[i] = col;
}
const NB4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** ระบายตามฟังก์ชัน (คืน null = ข้าม) */
function paint(c: PixelCanvas, m: Mk, fn: (x: number, y: number) => string | null) {
  for (let i = 0; i < NPX; i++) {
    if (!m.on[i]) continue;
    const col = fn(i % PW, (i / PW) | 0);
    if (col) c.px[i] = col;
  }
}

/** เงาตกใต้ชิ้น (ผมบนหน้าผาก หัวบนคอเสื้อ) n px ลงล่าง — ok = ระบายเฉพาะสีที่ผ่าน */
function castDown(c: PixelCanvas, m: Mk, n: number, t: number, ok?: (col: string) => boolean) {
  const done = new Uint8Array(NPX);
  for (let i = 0; i < NPX; i++) {
    if (!m.on[i]) continue;
    const x = i % PW;
    const y = (i / PW) | 0;
    if (m.has(x, y + 1)) continue;
    for (let k = 1; k <= n; k++) {
      const yy = y + k;
      if (yy >= PH || m.has(x, yy)) break;
      const j = yy * PW + x;
      const p = c.px[j];
      if (!isSolid(p)) break;
      if (done[j] || (ok && !ok(p!))) continue;
      done[j] = 1;
      c.px[j] = dk(p!, k === n ? t * 0.55 : t);
    }
  }
}

function set(c: PixelCanvas, x: number, y: number, col: string | null) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x >= 0 && y >= 0 && x < PW && y < PH) c.px[y * PW + x] = col;
}
const get = (c: PixelCanvas, x: number, y: number) => (x >= 0 && y >= 0 && x < PW && y < PH ? c.px[y * PW + x] : null);
/** วางเฉพาะช่องว่าง (หลังตีขอบ: ประกาย/ละอองนอกตัว) */
function setEmpty(c: PixelCanvas, x: number, y: number, col: string) {
  if (!get(c, x, y)) set(c, x, y, col);
}

// ---------------------------------------------------------------- แกนเอียง (อาวุธ)

interface Ax {
  bx: number;
  by: number;
  dx: number;
  dy: number;
  /** ตั้งฉาก ชี้ไปฝั่งซ้าย (ฝั่งรับแสง) */
  px: number;
  py: number;
}
function ax(bx: number, by: number, dx: number, dy: number): Ax {
  const l = Math.hypot(dx, dy);
  return { bx, by, dx: dx / l, dy: dy / l, px: dy / l, py: -dx / l };
}
/** พิกัดบนแกน (t ตามยาว, s ตามขวาง) → จุดบนผืน */
const at = (a: Ax, t: number, s: number): [number, number] => [a.bx + a.dx * t + a.px * s, a.by + a.dy * t + a.py * s];
const tOf = (a: Ax, x: number, y: number) => (x + 0.5 - a.bx) * a.dx + (y + 0.5 - a.by) * a.dy;
const sOf = (a: Ax, x: number, y: number) => (x + 0.5 - a.bx) * a.px + (y + 0.5 - a.by) * a.py;

/** แท่งตามแกน t0..t1 ครึ่งความกว้าง hw(t) */
function bar(a: Ax, t0: number, t1: number, hw: (t: number) => number): Mk {
  const m = new Mk();
  let R = 0;
  for (let t = t0; t <= t1; t += 1) R = Math.max(R, hw(t));
  const [ax0, ay0] = at(a, t0, 0);
  const [ax1, ay1] = at(a, t1, 0);
  for (let y = Math.floor(Math.min(ay0, ay1) - R - 1); y <= Math.ceil(Math.max(ay0, ay1) + R + 1); y++) {
    for (let x = Math.floor(Math.min(ax0, ax1) - R - 1); x <= Math.ceil(Math.max(ax0, ax1) + R + 1); x++) {
      const t = tOf(a, x, y);
      if (t < t0 || t > t1) continue;
      if (Math.abs(sOf(a, x, y)) <= hw(t)) m.add(x, y);
    }
  }
  return m;
}

/** เนื้อใบมีด/โลหะตามแนวขวาง: คมรับแสง · ร่องเลือด · ด้านเงา + แถบสะท้อนเฉียง */
function metalAt(T: string[], r: number, t: number, s: number, fuller: string | null): string {
  let i = r > 0.62 ? 4 : r > 0.12 ? 3 : r > -0.55 ? 2 : 1;
  if (fuller && Math.abs(r) <= 0.2) return fuller;
  const band = (((t * 0.55 + s) % 9) + 9) % 9;
  if (band < 1.3 && i < 4) i++;
  return T[i];
}

/** เนื้อไม้ตามแกน: ลายเสี้ยนไม้ */
function woodAt(T: string[], r: number, t: number, s: number) {
  let i = r > 0.35 ? 3 : r < -0.4 ? 1 : 2;
  if ((((t + s * 3) % 7) + 7) % 7 < 0.9 && i > 1) i--;
  return T[i];
}

// ---------------------------------------------------------------- อุปกรณ์ที่สวม

export interface PortraitPiece {
  id: string;
  lv: number;
}
export type PortraitGear = Partial<Record<EquipSlot, PortraitPiece>>;

/** อุปกรณ์ของผู้เล่น → ข้อมูลที่รูปเหมือนใช้ (id + เลเวลอัพเกรด) */
export function portraitGearOf(equip: Partial<Record<EquipSlot, Slot | null>>): PortraitGear {
  const g: PortraitGear = {};
  for (const k of Object.keys(equip) as EquipSlot[]) {
    const s = equip[k];
    if (s && ITEMS[s.id]) g[k] = { id: s.id, lv: levelOfSlot(s) };
  }
  return g;
}

/** key ของ texture ตามลุค + อุปกรณ์ + เลเวล */
export function portraitKey(look: HeroLook, gear: PortraitGear): string {
  const parts = [look.skin, look.skinShade, look.hair, look.hairShade, look.hairStyle, look.eyes, look.outfit, look.helmet, look.cape];
  for (const k of Object.keys(gear).sort()) {
    const p = gear[k as EquipSlot]!;
    parts.push(`${k}:${p.id}:${p.lv}`);
  }
  const src = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `portrait_${(h >>> 0).toString(36)}`;
}

/** สีขอบตามเลเวลอัพเกรด (Lv7+ ทอง · Lv10 ตำนาน) */
const trimOf = (p?: PortraitPiece) => {
  const b = p ? bandOf(p.lv) : null;
  return b === 'legend' ? '#73eff7' : b === 'gold' ? 'Y' : null;
};

const LEG_GEAR: Record<string, Mat> = {
  leather_pants: { d: 'n', m: 'm', l: 'M' },
  iron_greaves: DSTEEL,
  meteor_greaves: METEOR,
};
const FEET_GEAR: Record<string, { mat: Mat; top?: string; kind: 'lace' | 'fur' | 'plate' | 'wing' }> = {
  leather_boots: { mat: LEATHER, kind: 'lace' },
  snow_boots: { mat: LEATHER, top: 'W', kind: 'fur' },
  iron_boots: { mat: STEEL, kind: 'plate' },
  wind_boots: { mat: WIND, kind: 'wing' },
};
const HAND_GEAR: Record<string, { mat: Mat; kind: 'cloth' | 'plate' | 'fire' }> = {
  work_gloves: { mat: LINEN, kind: 'cloth' },
  iron_gauntlets: { mat: STEEL, kind: 'plate' },
  fire_gauntlets: { mat: { d: '#4a1420', m: '#8a2a3e', l: 'R', h: 'r' }, kind: 'fire' },
};
const RING_GEAR: Record<string, [string, string | null]> = {
  iron_ring: ['L', null],
  gold_ring: ['Y', null],
  ruby_ring: ['Y', 'R'],
  jade_ring: ['Y', '#2c8a55'],
  meteor_ring: ['#8a4a9a', 'r'],
};

// ---------------------------------------------------------------- บริบทการวาด

interface F {
  c: PixelCanvas;
  look: HeroLook;
  o: OutfitDef;
  g: PortraitGear;
  skin: Mat;
  hm: Mat;
  legs: Mat;
  boots: Mat;
  hands: Mat;
  blink: boolean;
  /** สีขอบทองตามเลเวลเกราะ */
  trim: string | null;
  /** จุดประกายหลังตีขอบ */
  glints: [number, number, string, number][];
  /** แสงเรือง (ทำหลังตีขอบ) */
  halos: [number, number, number, string][];
  skinSet: Set<string>;
  hairSet: Set<string>;
}

// ส่วนร่างกาย (พิกัดจริง): หัว 12..67 × 8..55 · ลำตัว 24..55 × 56..75 · แขน 16..23 / 56..63 · มือกลาง (19.5,67.5)/(59.5,67.5)
// ขา 28..39 / 40..51 × 76..83 · รองเท้า 84..91
const HAND_L: [number, number] = [19.5, 67.5];
const HAND_R: [number, number] = [59.5, 67.5];

function capeBack(f: F) {
  const cape = CAPE_DEFS.find((d) => d.id === f.look.cape);
  if (!cape?.mat) return;
  const cm = cape.mat;
  const m = new Mk().poly([16, 50, 63, 50, 68, 60, 71, 72, 73, 85, 6, 85, 8, 72, 11, 60]);
  for (let x = 9; x <= 71; x += 8) m.ell(x, 85.5, 4.2, 2.6);
  // ซับในด้านใน: ขอบผ้าที่ม้วนเข้าตรงชายซ้าย/ขวา
  const lining: Mat = { d: dk(cm.d, 0.25), m: dk(cm.m, 0.38), l: dk(cm.m, 0.15) };
  fill(f.c, m, cm, {
    line: false,
    tex: (x, y) => {
      if (y < 56) return 0.1;
      const k = Math.sin(((x + (y - 50) * 0.12 * (x < 40 ? -1 : 1)) / 9) * Math.PI * 2);
      return k * 0.38 * Math.min(1, (y - 54) / 14);
    },
  });
  const lin = new Mk()
    .poly([6, 85, 9, 72, 12, 74, 11, 86])
    .poly([73, 85, 70, 72, 67, 74, 68, 86]);
  lin.keep((x, y) => m.has(x, y));
  fill(f.c, lin, lining, { line: false, soft: 0.4 });
  const hem = trimOf(f.g.back);
  if (hem) {
    paint(f.c, m, (x, y) => (!m.has(x, y + 1) || !m.has(x, y + 2) ? (y % 2 ? hem : lt(hem, 0.3)) : null));
  }
}

function backpack(f: F) {
  const id = f.g.bag?.id;
  if (!id || id === 'pouch') return;
  const pack = id === 'explorer_pack' ? { d: 'm', m: '#7a6a3a', l: '#a8945a' } : LEATHER;
  fill(f.c, new Mk().ell(40, 66, 27, 15, 3), pack, { line: false, tex: (x, y) => (y === 62 || y === 63 ? -0.5 : (x + y) % 9 === 0 ? -0.2 : 0) });
  if (id === 'explorer_pack') {
    // ม้วนผ้าห่มบนเป้ (โผล่ข้างหัว) — ปลายม้วนเห็นวงก้นหอย
    const roll = new Mk().ell(40, 50, 33, 5.2, 2.4);
    fill(f.c, roll, RED, { line: false, tex: (x) => (x % 6 === 0 ? -0.4 : 0) });
    for (const [cx, dir] of [[8.5, 1], [71.5, -1]] as [number, number][]) {
      set(f.c, cx, 49, '#d8606f');
      set(f.c, cx + dir, 50, '#6e2034');
      set(f.c, cx, 51, '#6e2034');
    }
    for (const x of [24, 56]) for (let y = 45; y <= 55; y++) set(f.c, x, y, y % 3 ? 'm' : 'n');
  }
}

function quiverBack(f: F) {
  const q = f.o.details?.find((d) => d.kind === 'quiver');
  if (!q || q.kind !== 'quiver') return;
  // ลูกธนูโผล่ข้างไหล่ขวา (ขนหาง 2 สี)
  for (const [x, y] of [[66, 34], [70, 31], [73, 35]] as [number, number][]) {
    const m = new Mk().stroke([x, y, x - 4, y + 14], 1);
    paint(f.c, m, () => 'N');
    const fl = new Mk().poly([x - 2, y - 3, x + 2, y - 3, x + 2, y + 4, x, y + 6, x - 2, y + 4]);
    paint(f.c, fl, (xx, yy) => ((xx + yy) % 2 ? q.fletch : q.fletch2));
  }
  fill(f.c, new Mk().poly([60, 42, 68, 38, 74, 52, 66, 58]), q.mat, { line: false, tex: (x, y) => ((x - y) % 6 === 0 ? -0.5 : 0) });
}

function drawLegs(f: F) {
  const { c, o } = f;
  const fg = f.g.feet ? FEET_GEAR[f.g.feet.id] : undefined;
  const lg = f.g.legs ? LEG_GEAR[f.g.legs.id] : undefined;
  const bootTop = fg?.top ?? o.bootTop;
  for (const [x0, side] of [[28, -1], [40, 1]] as [number, number][]) {
    const pm = new Mk().rect(x0, 76, 12, 9);
    const legs = f.legs;
    fill(c, pm, legs, {
      tex: (x, y) => {
        if (legs.pattern === 'check') return ((x >> 1) + (y >> 1)) & 1 ? -0.5 : 0.1;
        if (legs.pattern === 'stripe') return y % 4 === 0 ? -0.45 : 0;
        // รอยพับเข่า + ตะเข็บขาด้านใน
        if (y === 80 && x > x0 + 2 && x < x0 + 9) return -0.35;
        if ((side < 0 && x === x0 + 11) || (side > 0 && x === x0)) return -0.6;
        return 0;
      },
    });
    if (lg === DSTEEL || lg === METEOR) {
      // สนับเข่า
      const knee = new Mk().ell(x0 + 6, 80, 4.2, 3);
      fill(c, knee, lg === METEOR ? { d: '#3a1840', m: '#62306e', l: 'u', h: 'y' } : STEEL, { soft: 0.6 });
      if (lg === METEOR) f.glints.push([x0 + 6, 80, 'r', 0]);
    }
    // รองเท้า: หัวมน พื้นเข้ม
    const bm = new Mk().rect(x0 - (side < 0 ? 1 : 0), 84, 13, 8);
    bm.ell(x0 + 6 + side * 1.5, 88.5, 7.4, 3.6, 2.6);
    bm.keep((_, y) => y <= 91);
    const boots = f.boots;
    fill(c, bm, boots, { tex: (x, y) => (y >= 90 ? -0.9 : y === 89 ? 0.15 : boots.pattern === 'stripe' && y % 3 === 0 ? -0.45 : x === x0 + 6 && y < 88 ? -0.15 : 0) });
    if (bootTop) {
      const cuff = new Mk().rect(x0 - 1, 83, 14, 3);
      for (let x = x0 - 1; x < x0 + 13; x += 2) cuff.add(x, 86);
      fill(c, cuff, matOf(bootTop), { soft: 0.6, tex: (x, y) => (dither(x, y) > 0.3 ? -0.4 : 0) });
    }
    if (fg?.kind === 'lace' || (!fg && boots === LEATHER)) {
      for (let y = 85; y <= 88; y++) {
        set(c, x0 + 5, y, y % 2 ? 'N' : boots.d);
        set(c, x0 + 7, y, y % 2 ? boots.d : 'N');
      }
    } else if (fg?.kind === 'plate') {
      for (let x = x0; x <= x0 + 12; x++) if (bm.has(x, 87)) set(c, x, 87, 'D');
      set(c, x0 + 2, 85, 'W');
    } else if (fg?.kind === 'wing') {
      // ปีกเล็กที่ข้อเท้า
      const wx = side < 0 ? x0 - 1 : x0 + 12;
      const wing = new Mk().poly(side < 0 ? [wx, 84, wx - 7, 80, wx - 6, 84, wx - 8, 85, wx - 5, 87, wx, 87] : [wx, 84, wx + 7, 80, wx + 6, 84, wx + 8, 85, wx + 5, 87, wx, 87]);
      fill(c, wing, FUR, { soft: 0.5, tex: (x) => (x % 2 ? -0.3 : 0) });
    }
    // ประกายหัวรองเท้า
    set(c, x0 + 2 + (side > 0 ? 1 : 0), 87, boots.h ?? lt(boots.l, 0.3));
  }
}

function drawRobe(f: F) {
  const { c, o } = f;
  if (!o.robe) return;
  const rm = o.robeMat ?? o.top;
  const m = new Mk();
  if (o.robe === 'long') m.poly([24, 70, 56, 70, 61, 88, 19, 88]);
  else {
    m.rect(23, 70, 34, 10);
    for (let x = 23; x <= 54; x += 6) m.rect(x, 80, 4, 4);
  }
  fill(c, m, rm, {
    tex: (x, y) => {
      const k = Math.sin(((x - 40) / (4 + (y - 70) * 0.18)) * Math.PI);
      return y > 74 ? k * 0.25 : 0;
    },
  });
  if (o.trim) {
    const t = matOf(o.trim);
    if (o.robe === 'long') {
      paint(c, m, (x, y) => (!m.has(x, y + 2) ? (dither(x, y) > 0 ? t.m : t.l) : null));
      // แถบกลางชุดคลุม
      fill(c, new Mk().rect(37, 56, 6, 32), t, { soft: 0.5, line: false, tex: (_, y) => (y % 6 === 0 ? -0.5 : 0) });
    } else paint(c, m, (x, y) => (y === 79 || (y >= 80 && !m.has(x, y + 1)) ? t.m : null));
  }
}

function torsoMask() {
  return new Mk().rect(24, 56, 32, 20).del(24, 56).del(55, 56).del(24, 57).del(55, 57);
}

function patternTex(mt: Mat) {
  return (x: number, y: number) => {
    if (mt.pattern === 'plaid') return x % 8 === 0 || y % 8 === 4 ? -0.55 : x % 8 === 4 ? -0.22 : 0;
    if (mt.pattern === 'stripe') return y % 4 === 0 ? -0.45 : 0;
    if (mt.pattern === 'check') {
      // ห่วงเกราะโซ่: วงแหวน 3×3 สลับแถว
      const rx = (x + (Math.floor(y / 3) % 2) * 2) % 4;
      const ry = y % 3;
      return rx === 0 || ry === 0 ? -0.55 : rx === 1 && ry === 1 ? 0.35 : 0;
    }
    return 0;
  };
}

function drawTorso(f: F) {
  const { c, o } = f;
  const mt = o.coat && !o.coat.open ? o.coat.mat : o.top;
  const m = torsoMask();
  const pt = patternTex(mt);
  fill(c, m, mt, {
    tex: (x, y) => {
      let v = pt(x, y);
      // รอยย่นใต้รักแร้ + ตะเข็บข้าง
      if ((x - 26 === y - 60 || 53 - x === y - 60) && y >= 60 && y <= 64) v -= 0.5;
      if (x === 25 || x === 54) v -= 0.2;
      return v;
    },
  });
  // คอเสื้อ
  if (o.neck) {
    const v = new Mk();
    for (let y = 56; y <= 61; y++) v.rect(35 + (y - 56), y, 10 - (y - 56) * 2, 1);
    fill(c, v, f.skin, { line: false, bias: -0.35, soft: 0.3 });
    const tc = o.trim ? matOf(o.trim).m : mt.d;
    for (let y = 56; y <= 61; y++) {
      set(c, 34 + (y - 56), y, tc);
      set(c, 45 - (y - 56), y, tc);
    }
    set(c, 39, 62, tc);
    set(c, 40, 62, tc);
  } else if (o.trim && !o.coat) {
    for (let x = 26; x <= 53; x++) set(c, x, 56, matOf(o.trim).m);
  }
  if (f.trim) {
    // ขอบทองตามเลเวลเกราะ: คอ + ชายเสื้อ
    for (let x = 26; x <= 53; x++) {
      set(c, x, 57, x % 3 ? f.trim : lt(f.trim, 0.5));
      if (!o.robe) set(c, x, 75, x % 4 ? f.trim : lt(f.trim, 0.5));
    }
  }
}

function stud(c: PixelCanvas, x: number, y: number, col: string, r = 1) {
  const T = tones(matOf(col));
  if (r <= 1) {
    set(c, x, y, T[4]);
    set(c, x + 1, y, T[3]);
    set(c, x, y + 1, T[2]);
    set(c, x + 1, y + 1, T[1]);
    return;
  }
  const m = new Mk().ell(x + 0.5, y + 0.5, r + 0.3, r + 0.3);
  fill(c, m, matOf(col), { line: false });
  set(c, x - 1, y - 1, T[4]);
}

function star(c: PixelCanvas, cx: number, cy: number, r: number, col: string, hi: string) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  const m = new Mk().poly(pts);
  paint(c, m, (x, y) => (x + y < cx + cy - 1 ? hi : col));
}

function chestDetails(f: F, phase: 'chest' | 'post' | 'neck') {
  const { c, o } = f;
  const top = o.coat && !o.coat.open ? o.coat.mat : o.top;
  for (const d of o.details ?? []) {
    switch (d.kind) {
      case 'emblem': {
        if (phase !== 'chest') break;
        const cx = 39.5;
        const cy = 65;
        if (d.shape === 'cross') {
          const m = new Mk().rect(37, 60, 6, 11).rect(34, 63, 12, 5);
          fill(c, m, { d: dk(d.color, 0.3), m: d.color, l: d.hi ? d.hi : lt(d.color, 0.3) }, { soft: 0.7 });
        } else if (d.shape === 'gem') {
          const m = new Mk().poly([cx, cy - 5, cx + 5, cy, cx, cy + 5, cx - 5, cy]);
          // เหลี่ยมเพชร: บนซ้ายสว่าง ล่างขวาเข้ม
          paint(c, m, (x, y) => {
            const u = x + 0.5 - cx;
            const v = y + 0.5 - cy;
            if (Math.abs(u) + Math.abs(v) > 4.2) return d.edge ?? dk(d.color, 0.4);
            return u + v < -1.5 ? d.hi ?? lt(d.color, 0.5) : u > 0.5 && v > 0.5 ? dk(d.color, 0.3) : d.color;
          });
          f.glints.push([cx - 2, cy - 2, 'W', 1]);
          // กรอบทอง
          for (const [x, y] of [[cx - 7, cy], [cx + 6, cy], [cx, cy - 7], [cx, cy + 6]] as [number, number][]) stud(c, x, y, 'Y');
        } else if (d.shape === 'bolt') {
          paint(c, new Mk().poly([42, 59, 36, 66, 40, 66, 37, 72, 44, 64, 40, 64]), (x, y) => (x + y < 103 ? lt(d.color, 0.4) : d.color));
        } else star(c, cx, cy, 5.5, d.color, d.hi ?? lt(d.color, 0.4));
        break;
      }
      case 'strap': {
        if (phase !== 'chest') break;
        const lines: number[][] = [[24, 57, 54, 74]];
        if (d.cross) lines.push([55, 57, 25, 74]);
        for (const [ax0, ay0, ax1, ay1] of lines) {
          const m = new Mk().stroke([ax0, ay0, ax1, ay1], 4);
          m.keep((x, y) => y >= 56 && y <= 75 && x >= 24 && x <= 55);
          fill(c, m, matOf(d.color), { soft: 0.5, tex: (x, y) => ((x + y) % 4 === 0 ? 0.35 : 0) });
          if (d.buckle) {
            const bx = Math.round((ax0 + ax1) / 2) - 2;
            const by = Math.round((ay0 + ay1) / 2) - 2;
            const bk = new Mk().rect(bx, by, 5, 5);
            paint(c, bk, (x, y) => (x === bx + 2 && y > by && y < by + 4 ? dk(d.color, 0.3) : x + y < bx + by + 3 ? lt(d.buckle!, 0.5) : d.buckle!));
          }
        }
        break;
      }
      case 'buttons': {
        if (phase !== 'chest') break;
        const xs = d.double ? [33, 45] : [39];
        for (const x of xs) for (const y of [60, 65, 70]) stud(c, x, y, d.color);
        break;
      }
      case 'zip': {
        if (phase !== 'chest') break;
        for (let y = 56; y <= 74; y++) {
          set(c, 39, y, y % 2 ? d.color : top.l);
          set(c, 40, y, y % 2 ? top.l : d.color);
        }
        const p = new Mk().rect(38, 61, 4, 4);
        paint(c, p, (x, y) => (x === 39 && y === 63 ? dk(d.pull, 0.5) : x + y < 100 ? lt(d.pull, 0.5) : d.pull));
        break;
      }
      case 'lapel': {
        if (phase !== 'chest') break;
        // ปกเสื้อไขว้ (ซามูไร/เสื้อกาวน์)
        const lm = new Mk().poly([30, 56, 35, 56, 42, 66, 40, 69]).poly([50, 56, 45, 56, 38, 66, 40, 69]);
        fill(c, lm, matOf(d.color), { soft: 0.6 });
        break;
      }
      case 'bikini': {
        // ชุดว่ายน้ำสองชิ้นแบบ tasteful: บราสามเหลี่ยม 2 ถ้วยอิ่ม เว้นร่องกลางเป็นผิว + กางเกงบิกินี่สะโพก
        if (phase !== 'chest') break;
        const bik = matOf(d.color);
        const tr = matOf(d.trim);
        const bust = (cx: number, left: boolean) => {
          const cup = new Mk().ell(cx, 63, 8.4, 7, 2.3);
          cup.keep((x, y) => y >= 56 && y <= 71 && (left ? x <= 39 : x >= 40));
          fill(c, cup, bik, {
            soft: 0.55,
            tex: (x, y) => {
              // ไล่แสงให้ดูทรวดทรงอิ่ม: บน-ในรับแสง ล่างนอกเป็นเงาใต้ทรวงอก
              const u = (x + 0.5 - cx) / 8;
              const v = (y + 0.5 - 61) / 7;
              return (v < 0 ? 0.3 : -0.35) + (u * (left ? 1 : -1) < 0 ? 0.15 : -0.1) + (y >= 69 ? -0.4 : 0);
            },
          });
        };
        bust(34, true);
        bust(46, false);
        // ร่องอก (เงากลาง) + ปมผูกกลาง + สายคล้องคอ
        for (let y = 58; y <= 68; y++) set(c, 40, y, mx(f.skin.d, '#5a1e2e', 0.25));
        stud(c, 39, 61, d.trim, 1.3);
        for (const [sx, dir] of [[34, -1], [46, 1]] as [number, number][]) {
          for (let k = 0; k <= 5; k++) set(c, sx + dir * Math.round(k * 0.5), 57 - k, k < 2 ? bik.l : tr.m);
        }
        // กางเกงบิกินี่: ทรงสะโพกโค้ง เว้าเอว + สายผูกข้าง
        const bot = new Mk().poly([27, 72, 52, 72, 51, 79, 45, 84, 40, 86, 35, 84, 29, 79]);
        bot.cut(new Mk().poly([24, 72, 31, 72, 27, 78]).poly([49, 72, 56, 72, 53, 78]));
        fill(c, bot, bik, { tex: (_, y) => (y === 72 ? 0.3 : y >= 82 ? -0.4 : 0) });
        for (const hx of [28, 51]) {
          for (let y = 71; y <= 75; y++) set(c, hx, y, y % 2 ? tr.m : tr.l);
          stud(c, hx - 1, 73, d.trim);
        }
        break;
      }
      case 'plates': {
        if (phase !== 'chest') break;
        for (let x = 25; x <= 54; x++) {
          if (!isMatPx(c, x, 65, top)) continue;
          set(c, x, 65, d.seam);
          set(c, x, 66, top.l);
        }
        if (d.ridge) {
          for (let y = 57; y <= 64; y++) if (isMatPx(c, 39, y, top)) set(c, 39, y, d.ridge);
          for (let y = 57; y <= 64; y++) if (isMatPx(c, 40, y, top)) set(c, 40, y, top.d);
        }
        for (const [x, y] of [[27, 61], [51, 61], [27, 69], [51, 69]] as [number, number][]) if (isMatPx(c, x, y, top)) stud(c, x, y, d.ridge ?? top.l);
        break;
      }
      case 'zigzag': {
        if (phase !== 'chest') break;
        for (let x = 24; x <= 55; x++) {
          const y = 66 + Math.abs(((x + 2) % 8) - 4) - 2;
          for (const yy of [y, y + 1]) if (isMatPx(c, x, yy, top)) set(c, x, yy, yy === y ? d.color : dk(d.color, 0.3));
        }
        break;
      }
      case 'glow': {
        if (phase !== 'chest') break;
        // รอยแตกเรืองแสง
        const cracks = [[29, 59, 31, 63, 29, 67, 32, 71], [50, 59, 48, 63, 51, 67, 48, 71], [36, 70, 40, 67, 43, 70]];
        for (const cr of cracks) {
          const m = new Mk().stroke(cr, 1);
          m.keep((x, y) => isMatPx(c, x, y, top));
          paint(c, m, (x, y) => ((x + y) % 3 ? d.color : d.core));
        }
        stud(c, 39, 63, d.core);
        f.halos.push([40, 64, 7, d.color]);
        break;
      }
      case 'panel': {
        if (phase !== 'chest') break;
        const p = new Mk().rect(32, 60, 16, 11);
        paint(c, p, (x, y) => (x === 32 || y === 60 ? 'D' : x === 47 || y === 70 ? '#1a1c2c' : d.base));
        d.lights.forEach((col, i) => {
          stud(c, 34 + i * 4, 62, col);
          f.glints.push([34 + i * 4, 62, 'W', 0]);
        });
        for (let x = 34; x <= 45; x++) if (x % 2 === 0) set(c, x, 66, 'D');
        for (let x = 34; x <= 45; x++) if (x % 2 === 0) set(c, x, 68, 'D');
        break;
      }
      case 'overalls': {
        if (phase !== 'chest') break;
        const bib = new Mk().rect(28, 63, 24, 9).rect(24, 72, 32, 4);
        fill(c, bib, d.mat, { tex: (x, y) => (y === 64 || (x === 29 || x === 50) ? 0.2 : (x + y) % 7 === 0 ? -0.2 : 0) });
        const straps = new Mk().rect(28, 56, 4, 8).rect(48, 56, 4, 8);
        fill(c, straps, d.mat, { soft: 0.5 });
        stud(c, 29, 64, d.button, 1.4);
        stud(c, 49, 64, d.button, 1.4);
        // กระเป๋าหน้าอก + ตะเข็บ
        for (let x = 34; x <= 45; x++) set(c, x, 66, d.mat.d);
        for (let y = 66; y <= 70; y++) {
          set(c, 34, y, d.mat.d);
          set(c, 45, y, d.mat.d);
        }
        for (let x = 35; x <= 44; x += 2) set(c, x, 67, d.mat.l);
        break;
      }
      case 'tabard': {
        if (phase !== 'chest') break;
        const m = new Mk().rect(30, 56, 20, 28);
        m.poly([30, 84, 50, 84, 40, 88]);
        fill(c, m, d.mat, { tex: (x) => (x === 35 || x === 44 ? -0.3 : 0) });
        paint(c, m, (x, y) => (!m.has(x - 1, y) || !m.has(x + 1, y) || !m.has(x, y + 1) || !m.has(x - 2, y) || !m.has(x + 2, y) ? d.trim : null));
        break;
      }
      case 'toolbelt': {
        if (phase !== 'post') break;
        for (const x0 of [18, 54]) {
          const p = new Mk().rect(x0, 72, 9, 8);
          fill(c, p, d.pouch, { soft: 0.6 });
          for (let x = x0 + 1; x < x0 + 8; x++) set(c, x, 74, d.pouch.d);
          stud(c, x0 + 4, 75, 'Y');
        }
        // ประแจ + ไขควง
        const w = new Mk().stroke([60, 72, 63, 64], 2);
        paint(c, w, () => 'L');
        paint(c, new Mk().ell(63.5, 63, 2.4, 2), (x, y) => (x === 63 && y === 62 ? null : 'w'));
        paint(c, new Mk().stroke([57, 72, 56, 66], 1), () => 'R');
        break;
      }
      case 'necklace': {
        if (phase !== 'post') break;
        necklaceAt(c, d.cord, d.bead, d.tooth);
        break;
      }
      case 'scarf': {
        if (phase !== 'neck') break;
        const m = new Mk().ell(40, 55, 18, 4.6, 2.6).ell(40, 58.5, 20, 3.4, 2.6);
        if (d.tails) {
          const tl = new Mk().poly([48, 58, 55, 58, 58, 66, 62, 74, 57, 75, 54, 67]);
          fill(c, tl, d.mat, { soft: 0.6, tex: (x, y) => ((x - y * 0.4) % 4 < 1 ? -0.35 : 0) });
        }
        fill(c, m, d.mat, { tex: (x, y) => (Math.abs(((x + y * 0.5) % 7) - 3.5) < 0.6 ? -0.4 : 0) });
        break;
      }
      case 'fur': {
        if (phase !== 'neck') break;
        const m = new Mk();
        for (let x = 18; x <= 62; x += 5) m.ell(x, 56 + (Math.abs(x - 40) < 12 ? 1 : 0), 4.2, 3.6);
        m.ell(40, 54, 18, 3.5);
        fill(c, m, d.mat, { tex: (x, y) => (dither(x, y) > 0.32 ? -0.45 : (x * 3 + y) % 5 === 0 ? 0.3 : 0) });
        break;
      }
      case 'quiver': {
        if (phase !== 'chest') break;
        // สายสะพายกระบอกธนู
        const m = new Mk().stroke([54, 56, 26, 75], 3);
        m.keep((x, y) => y >= 56 && x >= 24 && x <= 55);
        fill(c, m, LEATHER, { soft: 0.4, tex: (x) => (x % 3 === 0 ? 0.3 : 0) });
        break;
      }
    }
  }
}

/** พิกเซลยังเป็นสีของวัสดุ mt (ไม่ถูกชิ้นอื่นทับ) */
function isMatPx(c: PixelCanvas, x: number, y: number, mt: Mat) {
  const p = get(c, x, y);
  if (!p) return false;
  const T = tones(mt);
  return p === T[0] || p === T[1] || p === T[2] || p === T[3] || p === T[4];
}

function necklaceAt(c: PixelCanvas, cord: string, bead: string, tooth?: string) {
  const m = new Mk().stroke([31, 56, 35, 62, 39.5, 65, 44, 62, 48, 56], 1);
  paint(c, m, (x, y) => ((x + y) % 2 ? cord : dk(cord, 0.25)));
  stud(c, 39, 65, bead, 1.3);
  if (tooth) {
    for (const x of [34, 45]) {
      const t = new Mk().poly([x - 1, 61, x + 2, 61, x + 0.5, 66]);
      fill(c, t, matOf(tooth), { line: false, soft: 0.4 });
    }
  }
}

function drawBelt(f: F) {
  const { c, o } = f;
  if (!o.belt) return;
  const y0 = o.beltWide ? 68 : 72;
  const m = new Mk().rect(24, y0, 32, 76 - y0);
  fill(c, m, o.belt, { soft: 0.5, tex: (x, y) => (y === y0 && x % 3 === 0 ? 0.4 : o.beltWide && (y === 71 || y === 73) ? -0.35 : 0) });
  if (!o.buckle) return;
  const bk = matOf(o.buckle);
  if (!o.beltWide) {
    const b = new Mk().rect(35, 71, 10, 6);
    fill(c, b, bk, { soft: 0.6 });
    paint(c, new Mk().rect(37, 73, 6, 2), () => o.belt!.d);
    set(c, 39, 73, bk.l);
    set(c, 39, 74, bk.m);
    f.glints.push([36, 71, 'W', 0]);
    for (const x of [48, 52]) set(c, x, 73, o.belt.d);
  } else {
    // ปมผ้าคาดเอว + ชายผ้า
    const k = new Mk().ell(28, 72, 3.6, 3.2);
    fill(c, k, bk, { soft: 0.6 });
    const tails = new Mk().poly([26, 74, 29, 74, 27, 82, 23, 81]).poly([29, 74, 31, 74, 32, 80, 29, 80]);
    fill(c, tails, o.belt, { soft: 0.5 });
  }
}

function drawCoat(f: F) {
  const { c, o } = f;
  if (!o.coat) return;
  const cm = o.coat.mat;
  const L = new Mk();
  const R = new Mk();
  if (o.coat.open) {
    L.poly([24, 56, 31, 56, 31, 84, 20, 84, 21, 72, 24, 70]);
    R.poly([48, 56, 55, 56, 55, 70, 58, 72, 59, 84, 48, 84]);
  } else {
    L.poly([24, 72, 36, 72, 36, 84, 20, 84]);
    R.poly([43, 72, 55, 72, 59, 84, 43, 84]);
  }
  for (const m of [L, R]) {
    fill(c, m, cm, { tex: (x, y) => (y > 74 && (x === 26 || x === 53) ? -0.4 : 0) });
    if (o.trim || f.trim) {
      const t = matOf(f.trim ?? o.trim!);
      paint(c, m, (x, y) => {
        const inner = o.coat!.open && (x === 30 || x === 31 || x === 48 || x === 49) && y < 84;
        return inner || !m.has(x, y + 1) || !m.has(x, y + 2) ? ((x + y) % 3 ? t.m : t.l) : null;
      });
    }
  }
  if (o.coat.open) {
    // ปกเสื้อพับ + กระดุมทอง
    for (const p of [[28, 56, 33, 56, 31, 65], [52, 56, 47, 56, 49, 65]]) fill(c, new Mk().poly(p), { d: cm.m, m: cm.l, l: lt(cm.l, 0.3) }, { soft: 0.5 });
    for (const y of [67, 72, 77]) {
      stud(c, 28, y, o.trim ?? 'Y');
      stud(c, 51, y, o.trim ?? 'Y');
    }
  } else {
    // กระเป๋าเสื้อกาวน์ + ปากกา
    for (let x = 45; x <= 51; x++) set(c, x, 62, cm.d);
    set(c, 47, 60, 'B');
    set(c, 47, 61, 'B');
    for (let x = 27; x <= 33; x++) set(c, x, 78, cm.d);
    for (let x = 46; x <= 52; x++) set(c, x, 78, cm.d);
  }
}

function sleeveOf(f: F): Mat {
  const o = f.o;
  return o.sleeve === 'skin' ? f.skin : o.sleeve ?? (o.coat?.open ? o.coat.mat : o.top);
}

function drawArms(f: F) {
  const { c, o } = f;
  const sl = sleeveOf(f);
  const cuff = o.cuff ?? (o.sleeve === 'skin' ? undefined : o.trim);
  for (const [x0, out] of [[16, -1], [56, 1]] as [number, number][]) {
    const m = new Mk().rect(x0, 56, 8, 8);
    // ไหล่มน
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]] as [number, number][]) m.del(out < 0 ? x0 + dx : x0 + 7 - dx, 56 + dy);
    if (o.bellSleeves) m.poly(out < 0 ? [17, 57, 11, 64, 18, 64] : [62, 57, 69, 64, 62, 64]);
    fill(c, m, sl, { soft: 0.7, tex: patternTex(sl) });
    // รอยพับข้อศอก
    set(c, x0 + 3, 60, sl.d);
    set(c, x0 + 4, 60, sl.d);
    if (cuff) {
      const cm = matOf(cuff);
      paint(c, m, (_, y) => (y >= 62 ? (y === 62 ? cm.l : cm.m) : null));
    }
  }
  const hg = f.g.hands ? HAND_GEAR[f.g.hands.id] : undefined;
  if (hg?.kind === 'plate' || hg?.kind === 'fire') {
    // ข้อมือเกราะบาน
    for (const x0 of [15, 55]) fill(c, new Mk().rect(x0, 61, 10, 3), hg.mat, { soft: 0.6 });
  }
}

function drawShoulders(f: F) {
  const { c, o } = f;
  if (!o.shoulder) return;
  for (const cx of [19.5, 60.5]) {
    const m = new Mk().ell(cx, 58.5, 8.6, 6.2);
    m.keep((_, y) => y <= 63);
    fill(c, m, o.shoulder, {
      tex: (x, y) => (o.id === 'samurai' && y % 3 === 0 ? -0.45 : o.id === 'crab' && Math.abs(x - cx) % 4 < 1 && y > 57 ? -0.35 : 0),
    });
    const st = o.shoulderTrim ?? f.trim;
    if (st) paint(c, m, (x, y) => (!m.has(x, y + 1) || !m.has(x, y + 2) ? (x % 2 ? st : lt(st, 0.35)) : null));
    if (o.spec) f.glints.push([Math.round(cx - 4), 55, o.spec, 1]);
    stud(c, Math.round(cx) - 1, 59, o.shoulder.l);
  }
}

function capeOver(f: F) {
  const cape = CAPE_DEFS.find((d) => d.id === f.look.cape);
  if (!cape?.mat) return;
  for (const [cx, x] of [[19.5, 29], [60.5, 49]] as [number, number][]) {
    const drape = new Mk().ell(cx, 55.5, 8, 3.2);
    drape.keep((_, y) => y <= 57);
    fill(f.c, drape, cape.mat, { soft: 0.6 });
    stud(f.c, x, 56, cape.clasp, 1.5);
  }
}

function frontGear(f: F) {
  const { c } = f;
  const bag = f.g.bag?.id;
  if (bag === 'leather_backpack' || bag === 'explorer_pack') {
    // สายเป้พาดไหล่ + หัวเข็มขัด
    for (const x of [27, 50]) {
      const m = new Mk().rect(x, 56, 3, 16);
      fill(c, m, DLEATHER, { soft: 0.4, tex: (_, y) => (y % 3 === 0 ? 0.3 : 0) });
      stud(c, x, 64, 'L');
    }
  } else if (bag === 'pouch') {
    const p = new Mk().ell(55, 76, 4.5, 4.2);
    fill(c, p, LEATHER, { soft: 0.6 });
    paint(c, new Mk().rect(51, 73, 9, 2), () => 'm');
    stud(c, 54, 75, 'Y');
  }
  const neck = f.g.neck?.id;
  if (neck) {
    const m = new Mk().stroke([30, 56, 34, 62, 39.5, 65.5, 45, 62, 49, 56], 1);
    const cord = neck === 'demon_amulet' ? '#a0662a' : neck === 'crystal_amulet' ? 'L' : 'N';
    paint(c, m, (x, y) => ((x + y) % 2 ? cord : dk(cord, 0.25)));
    const cx = 39.5;
    const cy = 68;
    if (neck === 'shell_necklace') {
      const s = new Mk().poly([cx - 4, cy - 2, cx + 4, cy - 2, cx + 3, cy + 2, cx, cy + 4, cx - 3, cy + 2]);
      fill(c, s, { d: '#d07a8a', m: 'p', l: '#ffd0d8', h: 'W' }, { soft: 0.4, tex: (x) => ((x - 36) % 2 === 0 ? -0.35 : 0) });
    } else if (neck === 'fang_amulet') {
      fill(c, new Mk().poly([cx - 2, cy - 3, cx + 2, cy - 3, cx + 1, cy + 2, cx - 0.5, cy + 5]), BONE, { soft: 0.4 });
    } else if (neck === 'crystal_amulet') {
      const s = new Mk().poly([cx, cy - 4, cx + 3, cy, cx, cy + 5, cx - 3, cy]);
      paint(c, s, (x, y) => (x < cx - 0.5 ? (y < cy ? 'W' : 'C') : y < cy ? 'C' : 'b'));
      f.glints.push([Math.round(cx - 1), cy - 2, 'W', 1]);
    } else {
      const s = new Mk().ell(cx, cy, 4, 4);
      fill(c, s, GOLD, { soft: 0.4 });
      paint(c, new Mk().ell(cx, cy, 2.2, 2.4), (x, y) => (x + y < cx + cy - 1 ? '#ff7d8a' : 'R'));
      set(c, cx - 0.5, cy, '#1d1630');
      f.halos.push([Math.round(cx), cy, 6, '#ff5a6e']);
      f.glints.push([Math.round(cx - 1), cy - 2, 'W', 0]);
    }
  }
}

// ---------------------------------------------------------------- หัว + หน้า

function headMask() {
  const m = new Mk();
  for (let y = 8; y <= 55; y++) {
    for (let x = 12; x <= 67; x++) {
      const nx = Math.abs((x + 0.5 - 40) / 28);
      const ny = Math.abs((y + 0.5 - 31.8) / 24.2);
      const p = y + 0.5 < 31.8 ? 2.9 : 2.3;
      if (nx ** p + ny ** p <= 1) m.add(x, y);
    }
  }
  return m;
}

function drawHead(f: F) {
  const { c, o } = f;
  const sk = f.skin;
  // หู (โผล่ใต้ผมด้านข้าง)
  const ears = new Mk().ell(12.5, 40.5, 3.6, 5.2).ell(67.5, 40.5, 3.6, 5.2);
  fill(c, ears, sk, { line: false, soft: 0.5 });
  for (const [x, dx] of [[12, 1], [67, -1]] as [number, number][]) {
    set(c, x, 38, sk.d);
    set(c, x, 39, sk.d);
    set(c, x + dx, 40, sk.d);
    set(c, x, 42, mx(sk.d, '#ff5d73', 0.25));
  }
  const m = headMask();
  fill(c, m, sk, {
    soft: 0.8,
    noHi: true,
    tex: (x, y) => {
      // แก้มนูนรับแสงซ้าย + เงาใต้คาง
      const ch = (x - 22) ** 2 / 60 + (y - 40) ** 2 / 50;
      return (ch < 1 ? 0.18 : 0) + (y > 52 ? -0.15 : 0);
    },
  });
  // เงาหัวตกบนคอ/อก
  castDown(c, m, 3, 0.3);
  if (o.face) {
    robotFace(f, o.face);
    return;
  }
  face(f);
}

function face(f: F) {
  const { c, look } = f;
  const sk = f.skin;
  const eye = look.eyes;
  const lash = mx(eye, '#120e1e', 0.82);
  const dark = lum(eye) < 0.22;
  const irisM = dark ? mx(eye, '#6a7aa8', 0.3) : eye;
  const irisD = mx(irisM, lash, 0.5);
  const irisL = lt(irisM, 0.35);
  const irisB = lt(irisM, 0.62);
  const pupil = mx(irisD, lash, 0.6);
  const sclera = 'W';
  const scleraS = mx('W', sk.d, 0.35);
  const lashSoft = mx(lash, sk.m, 0.5);

  for (const [ex, out] of [[20, -1], [48, 1]] as [number, number][]) {
    const cx = ex + 6;
    const topY = (x: number) => 29 + Math.round(2.2 * ((x + 0.5 - cx) / 6.5) ** 2);
    const botY = (x: number) => 43 - Math.round(1.6 * ((x + 0.5 - cx) / 6.2) ** 2);
    if (f.blink) {
      // ปิดตา: เส้นโค้ง ‿ หนา 2 + หางขนตา
      for (let x = ex; x < ex + 12; x++) {
        const y = 38 + Math.round(1.8 * (1 - ((x + 0.5 - cx) / 6) ** 2));
        set(c, x, y, lash);
        set(c, x, y - 1, x === ex || x === ex + 11 ? lashSoft : lash);
      }
      const ox = out < 0 ? ex - 1 : ex + 12;
      set(c, ox, 37, lash);
      set(c, ox + out, 36, lash);
      continue;
    }
    // ม่านตาเยื้องเข้าด้านใน (มองตรงน่ารัก)
    const icx = cx - out * 0.4;
    for (let x = ex; x < ex + 12; x++) {
      const t0 = topY(x);
      const b0 = botY(x);
      for (let y = t0; y <= b0; y++) {
        let col: string;
        if (y <= t0 + 2) col = lash;
        else {
          const nx = (x + 0.5 - icx) / 4.9;
          const ny = (y + 0.5 - 37.2) / 6.6;
          const r2 = nx * nx + ny * ny;
          if (r2 <= 1) {
            const v = (y - (t0 + 3)) / (b0 - t0 - 3);
            col = r2 > 0.72 ? irisD : v < 0.3 ? irisD : v < 0.62 ? irisM : v < 0.86 ? irisL : irisB;
            const pn = ((x + 0.5 - icx) / 1.7) ** 2 + ((y + 0.5 - 36.4) / 2.7) ** 2;
            if (pn <= 1) col = pupil;
          } else col = y <= t0 + 4 ? scleraS : sclera;
        }
        set(c, x, y, col);
      }
      // ขนตาล่าง (จาง ๆ ตรงกลาง)
      if (Math.abs(x + 0.5 - cx) < 3.5) set(c, x, b0 + 1, lashSoft);
    }
    // หางขนตาด้านนอก 2 แฉก + ขนตาล่างหางตา
    const ox = out < 0 ? ex - 1 : ex + 12;
    for (const [dx, dy] of [[0, 30], [0, 31], [out, 29], [out, 30], [out * 2, 28]] as [number, number][]) set(c, ox + dx, dy, lash);
    set(c, ox, 41, lashSoft);
    // ประกาย: ใหญ่ซ้ายบน · เล็กขวาล่าง · จุดจิ๋ว
    const hx = Math.round(icx - 3);
    for (const [dx, dy] of [[0, 33], [1, 33], [0, 34], [1, 34], [2, 34], [1, 35], [0, 35]] as [number, number][]) set(c, hx + dx, dy, 'W');
    set(c, hx + 5, 40, 'W');
    set(c, hx + 6, 40, mx('W', irisL, 0.4));
    set(c, hx + 5, 41, mx('W', irisL, 0.4));
    set(c, hx + 6, 33, mx('W', irisM, 0.5));
  }
  // จมูก + ปาก (ยิ้มเปิดนิด ๆ) + แก้มแดง
  set(c, 40, 45, sk.d);
  set(c, 40, 46, mx(sk.d, sk.m, 0.5));
  set(c, 39, 45, sk.l);
  const mouth = mx(sk.d, '#5a1e2e', 0.55);
  const inner = '#8e3a4a';
  for (let x = 37; x <= 42; x++) set(c, x, 49, x === 37 || x === 42 ? mx(mouth, sk.m, 0.4) : mouth);
  for (let x = 38; x <= 41; x++) set(c, x, 50, x === 38 || x === 41 ? mouth : inner);
  set(c, 39, 51, mouth);
  set(c, 40, 51, mouth);
  set(c, 40, 50, '#d86a7c');
  const blush = mx(sk.m, '#ff6f87', 0.32);
  const hatch = mx(sk.m, '#ff5d73', 0.55);
  for (const bx of [21.5, 58.5]) {
    const m = new Mk().ell(bx, 46.5, 4.8, 1.9);
    paint(c, m, (x, y) => (dither(x, y) > -0.3 || Math.abs(x + 0.5 - bx) < 3 ? blush : null));
    for (const dx of [-3, 0, 3]) {
      set(c, bx + dx, 47, hatch);
      set(c, bx + dx + 1, 46, hatch);
    }
  }
}

function robotFace(f: F, face: Mat) {
  const { c, look } = f;
  const led = look.eyes || 'C';
  const visor = new Mk().ell(40, 36, 25, 9, 3.2);
  paint(c, visor, (x, y) => {
    if ((x - y) % 11 === 0 && x < 34) return 'D';
    return y < 30 ? '#262b44' : 'F';
  });
  edges(c, visor, '#1a1c2c');
  for (const ex of [21, 48]) {
    for (let y = 32; y <= 39; y++) {
      for (let x = ex; x < ex + 11; x++) {
        const edge = x === ex || x === ex + 10 || y === 32 || y === 39;
        if (edge && (x === ex || x === ex + 10) && (y === 32 || y === 39)) continue;
        set(c, x, y, edge ? dk(led, 0.3) : y % 2 ? led : lt(led, 0.35));
      }
    }
    if (!f.blink) {
      set(c, ex + 2, 33, 'W');
      set(c, ex + 3, 33, 'W');
      set(c, ex + 2, 34, 'W');
    } else for (let y = 32; y <= 39; y++) for (let x = ex; x < ex + 11; x++) if (y !== 36) set(c, x, y, 'F');
    f.halos.push([ex + 5, 36, 7, led]);
  }
  // ตะแกรงปาก + น็อตหู
  for (let x = 33; x <= 46; x++) {
    set(c, x, 48, x % 2 ? 'D' : 'F');
    set(c, x, 50, x % 2 ? 'F' : 'D');
  }
  for (const bx of [12.5, 67.5]) {
    const b = new Mk().ell(bx, 40, 3.4, 3.4);
    fill(c, b, face, { soft: 0.5 });
    set(c, bx - 1, 40, face.d);
    set(c, bx, 40, face.d);
    set(c, bx + 1, 40, face.d);
  }
  // รอยต่อแผ่นหน้า
  for (let y = 10; y <= 26; y++) if (y % 2) set(c, 40, y, face.d);
}

// ---------------------------------------------------------------- ผม

function hairMask(look: HeroLook): Mk | null {
  if (look.hairStyle === 'bald') return null;
  const rows = HAIR[look.hairStyle]?.down;
  if (!rows) return null;
  const m = fromRows(rows, '1ca');
  if (look.hairStyle === 'spiky') {
    // ปลายผมแหลม: ตัดส่วนบนเป็นยอดสามเหลี่ยม + หนามข้าง
    const tips = new Mk();
    for (const [tx, ty] of [[16, 1], [25, 4], [32, 0], [40, 3], [47, 0], [55, 4], [63, 1]] as [number, number][]) tips.poly([tx, ty, tx + 7, 11, tx - 7, 11]);
    m.keep((x, y) => y >= 10 || tips.has(x, y));
    m.or(tips.keep((x, y) => y < 11 && x > 8 && x < 72));
    for (const [y0, y1, tip] of [[10, 19, 13], [18, 26, 21], [30, 38, 33]] as [number, number, number][]) {
      m.poly([11, y0, 2 + (tip > 30 ? 3 : 0), tip, 11, y1]);
      m.poly([68, y0, 77 - (tip > 30 ? 3 : 0), tip, 68, y1]);
    }
  }
  if (look.hairStyle === 'ponytail') {
    // หางม้าด้านหลังขวา
    m.poly([62, 14, 70, 12, 76, 22, 77, 36, 74, 48, 70, 54, 71, 42, 68, 30, 64, 24]);
  }
  if (look.hairStyle === 'long') {
    // ปลายผมยาวแหลมเป็นช่อ
    for (const x of [6, 10, 70, 74]) m.poly([x - 2.5, 64, x + 2.5, 64, x, 70]);
  }
  // หน้าม้าปลายแหลม (ทุกช่อมี 1–2 ยอด)
  for (let x = 14; x <= 65; x++) {
    if (!m.has(x, 24) || !m.has(x, 22)) continue;
    const tip = 3 - Math.abs(((x - 14) % 7) - 3);
    const bot = 26 + tip;
    for (let y = 24; y <= 31; y++) {
      if (x < 16 || x > 63) break;
      if (y <= bot) m.add(x, y);
      else m.del(x, y);
    }
  }
  return m;
}

function drawHair(f: F, minY: number) {
  const { c, look, hm } = f;
  const m = hairMask(look);
  if (!m) {
    if (look.hairStyle === 'bald' && !f.o.face) {
      // หัวโล้น: ประกายบนหัว
      for (const [x, y] of [[26, 13], [27, 13], [24, 14], [25, 14], [23, 15]] as [number, number][]) set(c, x, y, lt(f.skin.m, 0.5));
    }
    return;
  }
  if (minY > 0) m.keep((_, y) => y >= minY);
  fill(c, m, hm, {
    tex: (x, y) => {
      // ช่อผมรัศมีจากกลางกระหม่อม: ร่องเข้ม + ไฮไลต์ในช่อ
      const a = Math.atan2(x + 0.5 - 40, y + 10);
      const sPos = a * 10 + Math.sin(y * 0.35) * 0.25;
      const fr = sPos - Math.floor(sPos);
      let v = 0;
      if (y > 6 && fr < 0.13) v -= 0.6;
      else if (fr > 0.32 && fr < 0.55) v += 0.16;
      // วงแสงบนผม (angel ring)
      const ry = 13 + 9 * ((x - 40) / 30) ** 2;
      if (y >= ry && y <= ry + 2 && fr >= 0.13 && x > 14 && x < 64) v += x < 50 ? 0.75 : 0.4;
      return v;
    },
  });
  for (let i = 0; i < NPX; i++) if (m.on[i]) f.hairSet.add(c.px[i]!);
  // เงาผมตกบนหน้าผาก
  castDown(c, m, 3, 0.28, (p) => f.skinSet.has(p));
}

function hairFlyaways(f: F, helmetHidesTop: boolean) {
  const { c, look, hm } = f;
  if (look.hairStyle === 'bald' || helmetHidesTop) return;
  const col = hm.l;
  const pts: [number, number][] =
    look.hairStyle === 'short' ? [[43, 3], [44, 2], [45, 1], [46, 1], [47, 2]]
    : look.hairStyle === 'long' ? [[41, 3], [42, 2], [43, 2], [44, 1], [5, 56], [4, 57], [4, 58]]
    : look.hairStyle === 'ponytail' ? [[42, 3], [43, 2], [44, 2], [77, 49], [77, 50], [76, 51]]
    : [[57, 9], [58, 8], [21, 9], [20, 8]];
  for (const [x, y] of pts) setEmpty(c, x, y, col);
}

// ---------------------------------------------------------------- หมวก

function drawHelmet(f: F, h: HelmetDef) {
  const { c } = f;
  if (!h.down.length) return;
  const m1 = h.mat ?? STEEL;
  const m2 = h.mat2 ?? m1;
  const main = fromRows(h.down, '1ca');
  const sec = fromRows(h.down, '2');
  const tex = (x: number, y: number) => {
    if (h.id === 'straw_hat') return (x + y) % 4 === 0 || (x - y + 96) % 4 === 0 ? -0.32 : 0;
    if (h.id === 'chef_hat') return y < 18 ? Math.sin(x * 0.55) * 0.3 : 0;
    if (h.id === 'horns') return (x + y) % 3 === 0 ? -0.35 : 0;
    if (h.id === 'hood') return Math.abs(((x - 40) * 0.2 + y * 0.05) % 3) < 0.25 && y < 26 ? -0.3 : 0;
    return 0;
  };
  fill(c, main, m1, { tex });
  if (sec.bbox()) fill(c, sec, m2, { tex: (_, y) => (y % 4 === 0 ? -0.5 : 0) });
  const cols = h.cols ?? {};
  for (const ch of Object.keys(cols)) {
    if (ch === 'c' || ch === 'a') continue;
    const cm = fromRows(h.down, ch);
    if (!cm.bbox()) continue;
    fill(c, cm, matOf(cols[ch]), { soft: 0.6, line: ch !== 'x' });
  }
  const trim = trimOf(f.g.head);
  switch (h.id) {
    case 'hood': {
      // เชือกรูดฮู้ด
      for (const x of [30, 49]) {
        for (let y = 54; y <= 61; y++) set(c, x, y, y % 2 ? 'N' : 'M');
        stud(c, x, 62, 'L');
      }
      for (let y = 6; y <= 20; y++) set(c, 40, y, m1.d);
      break;
    }
    case 'iron_helm': {
      for (let x = 13; x <= 66; x += 6) if (main.has(x, 18)) stud(c, x, 17, 'w');
      for (let y = 6; y <= 30; y++) {
        if (main.has(39, y)) set(c, 39, y, 'W');
        if (main.has(40, y)) set(c, 40, y, 'D');
      }
      // รูหายใจ
      for (let y = 44; y <= 48; y += 2) for (const x of [30, 33, 46, 49]) set(c, x, y, '#1a1c2c');
      f.glints.push([22, 12, 'W', 1]);
      break;
    }
    case 'gold_crown': {
      for (let x = 22; x <= 58; x += 4) set(c, x, 13, 'y');
      f.glints.push([28, 13, 'W', 1], [46, 13, 'W', 1]);
      break;
    }
    case 'wizard_hat': {
      star(c, 46, 15, 4, 'y', 'W');
      f.glints.push([46, 15, 'W', 1]);
      break;
    }
    case 'pirate_hat': {
      // หัวกะโหลก + กระดูกไขว้
      const sk = new Mk().ell(40, 14.5, 4, 3.6).rect(38, 16, 5, 3);
      paint(c, sk, () => 'W');
      set(c, 38, 14, '#1a1c2c');
      set(c, 41, 14, '#1a1c2c');
      set(c, 40, 17, '#1a1c2c');
      for (const [a, b] of [[33, 19], [46, 19]]) {
        set(c, a, b, 'W');
        set(c, b === 19 && a < 40 ? a + 1 : a - 1, b - 1, 'W');
      }
      break;
    }
    case 'samurai_kabuto': {
      for (const y of [22, 30, 38]) for (let x = 8; x <= 72; x++) if (sec.has(x, y) && sec.has(x, y + 1) && x % 6 === 2) {
        set(c, x, y, 'W');
        set(c, x + 1, y + 1, 'L');
      }
      f.glints.push([38, 14, 'W', 1]);
      break;
    }
    case 'hard_hat': {
      // ไฟฉายหน้าหมวก (หมวกเหมืองมีไฟ)
      const lamp = new Mk().ell(40, 14, 4.2, 3.6);
      fill(c, lamp, DSTEEL, { soft: 0.4 });
      paint(c, new Mk().ell(40, 14, 2.5, 2.2), (x, y) => (x + y < 53 ? 'W' : 'Y'));
      f.halos.push([40, 14, 7, '#ffcd75']);
      break;
    }
    case 'nurse_cap': {
      const cap = fromRows(h.down, '1e');
      fill(c, cap, { d: 'L', m: 'w', l: 'W' }, { tex: (x) => (x === 32 || x === 47 ? -0.4 : 0) });
      for (const [x, y, w, hh] of [[38, 1, 4, 10], [35, 4, 10, 4]] as number[][]) for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) set(c, x + i, y + j, i === 0 || j === 0 ? '#d8606f' : 'R');
      break;
    }
    case 'antenna': {
      f.halos.push([40, 2, 6, '#73eff7']);
      f.glints.push([38, 1, 'W', 0]);
      break;
    }
    case 'feather_band': {
      // ก้านขนนก + เส้นขน
      for (let y = 1; y <= 14; y++) {
        const x = 57 + Math.round(y * 0.1);
        if (y % 2 === 0) set(c, x + 1, y, 'L');
      }
      for (let x = 10; x <= 70; x += 4) if (get(c, x, 22)) set(c, x, 22, 'Y');
      break;
    }
    case 'goggles': {
      for (const cx of [27.5, 51.5]) {
        const lens = new Mk().ell(cx, 18.5, 5.5, 4.5);
        paint(c, lens, (x, y) => (x + y < cx + 15 ? 'C' : (x - y) % 4 === 0 ? 'W' : '#41a6f6'));
        f.glints.push([Math.round(cx - 3), 16, 'W', 0]);
      }
      break;
    }
    case 'ninja_mask': {
      const plate = new Mk().rect(30, 24, 20, 6);
      fill(c, plate, STEEL, { soft: 0.5 });
      for (let x = 35; x <= 44; x++) set(c, x, 27, x % 3 ? 'D' : 'F');
      stud(c, 31, 26, 'w');
      stud(c, 47, 26, 'w');
      break;
    }
  }
  if (trim) {
    // ขอบหมวกทองตามเลเวล
    paint(c, main, (x, y) => (!main.has(x, y + 1) && y > 8 ? trim : null));
  }
}

// ---------------------------------------------------------------- มือ + อาวุธ + มือรอง

function handMat(f: F) {
  const hg = f.g.hands ? HAND_GEAR[f.g.hands.id] : undefined;
  return hg?.mat ?? f.hands;
}

function drawHand(f: F, [cx, cy]: [number, number], grip: boolean) {
  const { c } = f;
  const hm = handMat(f);
  const m = new Mk().ell(cx, cy, 4.6, 4.4);
  fill(c, m, hm, { soft: 0.6 });
  const T = tones(hm);
  if (grip) {
    // นิ้วกำด้าม
    for (let x = Math.floor(cx) - 3; x <= Math.floor(cx) + 3; x++) if (x % 2 === 0) set(c, x, Math.floor(cy) + 1, T[1]);
    set(c, cx - 3, cy - 2, T[3]);
  } else {
    set(c, cx - 2, cy - 2, T[3]);
    set(c, cx + (cx < 40 ? 2 : -3), cy + 1, T[1]);
  }
  const hg = f.g.hands ? HAND_GEAR[f.g.hands.id] : undefined;
  if (hg?.kind === 'plate') for (let x = Math.floor(cx) - 3; x <= Math.floor(cx) + 3; x++) set(c, x, Math.floor(cy) - 1, T[4]);
  if (hg?.kind === 'fire') {
    for (let x = Math.floor(cx) - 3; x <= Math.floor(cx) + 3; x += 2) set(c, x, Math.floor(cy) - 2, 'r');
    set(c, cx - 1, cy - 3, 'Y');
    f.halos.push([Math.round(cx), Math.round(cy), 6, '#ff8a3d']);
  }
  if (hg?.kind === 'cloth') for (let y = Math.floor(cy) - 3; y <= cy + 3; y += 2) set(c, cx + 2, y, LINEN.d);
  // แหวน
  const ring = cx < 40 ? f.g.ring1 : f.g.ring2;
  const rg = ring ? RING_GEAR[ring.id] ?? ['Y', null] : null;
  if (rg) {
    for (let x = Math.floor(cx) - 2; x <= Math.floor(cx) + 1; x++) set(c, x, Math.floor(cy) + 2, rg[0]);
    if (rg[1]) {
      set(c, cx - 1, cy + 1, rg[1]);
      set(c, cx, cy + 1, dk(rg[1], 0.3));
      f.glints.push([Math.floor(cx - 1), Math.floor(cy + 1), 'W', 0]);
    }
  }
}

type WKind =
  | 'sword' | 'katana' | 'dagger' | 'great' | 'axe' | 'axe2' | 'pick' | 'mace' | 'hammer' | 'club' | 'spear' | 'trident' | 'halberd' | 'lance'
  | 'scythe' | 'sickle' | 'whip' | 'fist' | 'bow' | 'crossbow' | 'pistol' | 'rifle' | 'shotgun' | 'cannon' | 'sling' | 'boomerang' | 'chakram'
  | 'staff' | 'wand' | 'tome' | 'orb' | 'bomb' | 'none';

function weaponKind(def: ItemDef): WKind {
  const id = def.id;
  switch (def.weaponClass) {
    case 'dagger': case 'knife': return 'dagger';
    case 'sword': return id === 'katana' ? 'katana' : 'sword';
    case 'greatsword': return 'great';
    case 'axe': return 'axe2';
    case 'mace': return /hammer|maul/.test(id) ? 'hammer' : /club/.test(id) ? 'club' : 'mace';
    case 'spear': case 'javelin': return /trident/.test(id) ? 'trident' : /halberd/.test(id) ? 'halberd' : /lance/.test(id) ? 'lance' : 'spear';
    case 'scythe': return id === 'sickle' ? 'sickle' : 'scythe';
    case 'whip': return 'whip';
    case 'fist': return 'fist';
    case 'bow': return 'bow';
    case 'crossbow': return 'crossbow';
    case 'pistol': return 'pistol';
    case 'rifle': return 'rifle';
    case 'shotgun': return id === 'dragon_cannon' ? 'cannon' : 'shotgun';
    case 'sling': return 'sling';
    case 'boomerang': return id === 'chakram' ? 'chakram' : 'boomerang';
    case 'staff': return 'staff';
    case 'wand': return 'wand';
    case 'tome': return 'tome';
    case 'orb': return 'orb';
    case 'bomb': return 'bomb';
  }
  if (/pickaxe/.test(id)) return 'pick';
  if (/axe/.test(id)) return 'axe';
  if (def.ranged) return def.ranged.ammo === null ? 'staff' : 'bow';
  return def.tool ? 'sword' : 'none';
}

function weaponMat(id: string): Mat {
  const tbl: [RegExp, Mat][] = [
    [/crystal|glass/, CRYSTAL], [/meteor/, METEOR], [/frost|glacier|ice/, ICE], [/fire|inferno|phoenix|dragon/, FIRE],
    [/venom|poison|naga/, VENOM], [/shadow|void|abyss|rahu/, SHADOW], [/vampire|blood/, BLOOD], [/thunder|storm|lightning|thor/, STORM],
    [/holy/, HOLY], [/gold|garuda|royal/, GOLD], [/crab/, SHELL], [/jade|gaia/, JADE], [/earth/, EARTH], [/water/, WATER], [/wind/, WIND],
    [/cosmic/, COSMIC], [/bone/, BONE], [/stone/, STONE], [/wood|rope|apprentice|short_bow|long_bow|^bow|sling|club/, WOOD],
    [/leather/, LEATHER],
  ];
  for (const [re, m] of tbl) if (re.test(id)) return m;
  return STEEL;
}

const RARITY_GEM: Record<string, string> = { rare: 'b', epic: 'u', legendary: 'R' };

function drawWeapon(f: F) {
  const p = f.g.weapon;
  const def = p ? ITEMS[p.id] : undefined;
  if (!p || !def) return null;
  const kind = weaponKind(def);
  if (kind === 'none') return null;
  const { c } = f;
  const el = itemEl(def);
  const elc = EL_HEX[el] ?? null;
  const band = bandOf(p.lv);
  const mt = weaponMat(def.id);
  const T = tones(mt);
  const gripMat = mt === GOLD || mt === HOLY ? RED : def.rarity === 'legendary' ? DARK : DLEATHER;
  const G = tones(gripMat);
  const accent: Mat = band === 'gold' || band === 'legend' || mt === GOLD || def.rarity === 'legendary' ? GOLD : mt === WOOD || mt === BONE ? DLEATHER : DSTEEL;
  const gem = elc ?? (def.rarity ? RARITY_GEM[def.rarity] : undefined);
  const edge = band === 'legend' ? '#73eff7' : band === 'gold' ? 'y' : band === 'iron' ? '#e4eef5' : null;
  const [hx, hy] = HAND_L;
  /** ใบมีดตามแกน: เนื้อโลหะ + คมสีตามเลเวล + ร่องเลือดสีธาตุ */
  const blade = (a: Ax, t0: number, t1: number, hw: (t: number) => number, fuller: boolean) => {
    const m = bar(a, t0, t1, hw);
    paint(c, m, (x, y) => {
      const t = tOf(a, x, y);
      const s = sOf(a, x, y);
      const w = Math.max(0.6, hw(t));
      const r = s / w;
      if (edge && r > 0.62) return edge;
      return metalAt(T, r, t, s, fuller && t < t1 - 8 ? elc ?? T[1] : null);
    });
    edges(c, m, T[5]);
    return m;
  };
  const shaft = (a: Ax, t0: number, t1: number, w: number, mat: Mat = WOOD, wrap = false) => {
    const S = tones(mat);
    const m = bar(a, t0, t1, () => w);
    paint(c, m, (x, y) => {
      const t = tOf(a, x, y);
      const r = sOf(a, x, y) / w;
      if (wrap && (((t + r * 1.2) % 3) + 3) % 3 < 1) return S[1];
      return mat === WOOD || mat === BONE ? woodAt(S, r, t, sOf(a, x, y)) : metalAt(S, r, t, sOf(a, x, y), null);
    });
    edges(c, m, S[5]);
    return m;
  };
  const grip = (a: Ax, t0: number, t1: number, w = 1.7) => {
    const m = bar(a, t0, t1, () => w);
    paint(c, m, (x, y) => {
      const t = tOf(a, x, y);
      const r = sOf(a, x, y) / w;
      return (((t * 1.0 + r * 1.6) % 3) + 3) % 3 < 1.1 ? G[1] : r > 0.3 ? G[3] : G[2];
    });
  };
  const blob = (x: number, y: number, r: number, mat: Mat) => {
    const m = new Mk().ell(x, y, r, r);
    fill(c, m, mat, { soft: 0.6 });
    return m;
  };
  const gemAt = (x: number, y: number) => {
    if (!gem) return;
    set(c, x, y, lt(gem, 0.5));
    set(c, x + 1, y, gem);
    set(c, x, y + 1, gem);
    set(c, x + 1, y + 1, dk(gem, 0.35));
    f.glints.push([x, y, 'W', 0]);
  };
  let tip: [number, number] | null = null;
  switch (kind) {
    case 'sword': case 'dagger': case 'great': case 'katana': {
      const great = kind === 'great';
      const a = ax(hx, hy, great ? -0.25 : -0.36, -1);
      const len = kind === 'dagger' ? 17 : great ? 48 : 36;
      const w = kind === 'dagger' ? 2.4 : great ? 4.3 : kind === 'katana' ? 2.2 : 3;
      const tipL = kind === 'katana' ? 9 : great ? 9 : 6;
      const t0 = 7;
      const t1 = t0 + len;
      blade(a, t0, t1, (t) => w * Math.min(1, Math.max(0, (t1 - t) / tipL)) ** 0.75, kind !== 'katana');
      // การ์ด / สึบะ
      if (kind === 'katana') blob(...at(a, 5.5, 0), 3.4, GOLD);
      else {
        const gw = great ? 8 : kind === 'dagger' ? 4.5 : 6.5;
        const gm = bar(ax(...at(a, 5.6, 0), a.px, a.py), -gw, gw, () => 1.5);
        fill(c, gm, accent, { soft: 0.5 });
        blob(...at(a, 5.6, gw + 0.5), 1.6, accent);
        blob(...at(a, 5.6, -gw - 0.5), 1.6, accent);
      }
      grip(a, great ? -10 : -5, 4.5);
      blob(...at(a, great ? -11.5 : -6.5, 0), great ? 2.6 : 2.1, accent);
      const [gx, gy] = at(a, 5.6, 0);
      gemAt(Math.round(gx) - 1, Math.round(gy) - 1);
      tip = at(a, t1 - 1, 0);
      break;
    }
    case 'axe': case 'axe2': {
      const a = ax(hx, hy, -0.14, -1);
      shaft(a, -12, 46, 1.7, WOOD);
      const head = (side: number, big: number) => {
        const pts: number[] = [];
        for (const [t, s] of [[46, 1], [49.5, 5 * big], [48.5, 10.5 * big], [41, 12 * big], [34, 10.5 * big], [34.5, 5 * big], [38, 1]] as [number, number][]) pts.push(...at(a, t, s * side));
        const m = new Mk().poly(pts);
        fill(c, m, mt === WOOD ? STONE : mt, { tex: (x, y) => (Math.abs(sOf(a, x, y)) > 9.5 * big ? 0.6 : 0) });
        return m;
      };
      head(1, 1);
      if (kind === 'axe2') head(-1, 0.7);
      // ปลอกยึด
      fill(c, bar(a, 36, 45, () => 2.3), accent, { soft: 0.5 });
      gemAt(...(at(a, 40, 0).map(Math.round) as [number, number]));
      tip = at(a, 42, 11);
      break;
    }
    case 'pick': {
      const a = ax(hx, hy, -0.12, -1);
      shaft(a, -12, 44, 1.7);
      const m = new Mk();
      for (let s = -13; s <= 13; s += 0.5) {
        const [x, y] = at(a, 44 - 0.035 * s * s, s);
        const r = 2.4 * (1 - Math.abs(s) / 14) + 0.5;
        m.ell(x, y, r, r);
      }
      fill(c, m, mt === WOOD ? STONE : mt);
      tip = at(a, 38, 13);
      break;
    }
    case 'mace': case 'hammer': case 'club': {
      const a = ax(hx, hy, -0.16, -1);
      if (kind === 'club') {
        const m = bar(a, -6, 40, (t) => 1.7 + Math.max(0, t - 4) * 0.1);
        m.or(new Mk().ell(...at(a, 40, 0), 5.2, 5.2));
        fill(c, m, WOOD, { tex: (x, y) => ((((tOf(a, x, y) + sOf(a, x, y) * 2) % 6) + 6) % 6 < 1 ? -0.4 : 0) });
        if (/spiked/.test(def.id)) for (const [t, s] of [[24, 3.5], [29, -3.8], [34, 4.4], [38, -4.8], [42, 2]] as [number, number][]) {
          const [x, y] = at(a, t, s);
          stud(c, Math.round(x), Math.round(y), 'L');
        }
      } else {
        shaft(a, -10, 38, 1.6, kind === 'hammer' ? DLEATHER : WOOD, kind === 'hammer');
        if (kind === 'hammer') {
          const pts: number[] = [];
          for (const [t, s] of [[37, -9], [37, 9], [48, 9], [48, -9]] as [number, number][]) pts.push(...at(a, t, s));
          const hmk = new Mk().poly(pts);
          fill(c, hmk, mt === STEEL ? DSTEEL : mt, { tex: (x, y) => (Math.abs(Math.abs(sOf(a, x, y)) - 5) < 0.6 ? -0.5 : Math.abs(sOf(a, x, y)) > 7.5 ? 0.35 : 0) });
          if (elc) for (const s of [-2, 0, 2]) set(c, ...at(a, 42.5, s), elc);
        } else {
          const hm = new Mk().ell(...at(a, 42, 0), 5.4, 5.4);
          for (let k = 0; k < 6; k++) {
            const an = (k / 6) * Math.PI * 2;
            const [cx, cy] = at(a, 42, 0);
            const ox = Math.cos(an);
            const oy = Math.sin(an);
            hm.poly([cx + ox * 4 - oy * 1.8, cy + oy * 4 + ox * 1.8, cx + ox * 8.5, cy + oy * 8.5, cx + ox * 4 + oy * 1.8, cy + oy * 4 - ox * 1.8]);
          }
          fill(c, hm, mt);
        }
      }
      tip = at(a, 46, 0);
      break;
    }
    case 'spear': case 'trident': case 'halberd': case 'lance': {
      const a = ax(hx, hy, -0.1, -1);
      shaft(a, -20, 50, 1.4, mt === GOLD ? GOLD : WOOD);
      if (kind === 'lance') {
        blade(a, 30, 64, (t) => 5 * (1 - (t - 30) / 34) + 0.3, false);
        fill(c, bar(a, 27, 30, () => 6), accent, { soft: 0.5 });
      } else if (kind === 'trident') {
        fill(c, bar(a, 48, 51, () => 6.5), mt, { soft: 0.5 });
        for (const s of [-5.5, 0, 5.5]) {
          const ap = ax(...at(a, 50, s), a.dx, a.dy);
          blade(ap, 0, s === 0 ? 14 : 10, (t) => 1.4 * Math.min(1, ((s === 0 ? 14 : 10) - t) / 3), false);
        }
      } else {
        const wave = /naga/.test(def.id);
        blade(a, 50, 64, (t) => 3.8 * Math.sin((Math.PI * (t - 49)) / 15.5) ** 0.7 + (wave ? Math.sin(t) * 0.6 : 0), true);
        if (kind === 'halberd') {
          const pts: number[] = [];
          for (const [t, s] of [[52, 1], [55, 6], [53, 11], [46, 12], [41, 9], [44, 1]] as [number, number][]) pts.push(...at(a, t, s));
          fill(c, new Mk().poly(pts), mt);
        }
        // ผ้าพันใต้หัวหอก
        const wr = bar(a, 46, 50, () => 2);
        paint(c, wr, (x, y) => ((Math.round(tOf(a, x, y)) % 2 ? accent.m : accent.l)));
      }
      gemAt(...(at(a, 48, -0.5).map(Math.round) as [number, number]));
      tip = at(a, 62, 0);
      break;
    }
    case 'scythe': case 'sickle': {
      if (kind === 'sickle') {
        const a = ax(hx, hy, -0.3, -1);
        shaft(a, -5, 9, 1.5);
        const m = new Mk();
        for (let k = 0; k <= 30; k++) {
          const an = Math.PI * (0.1 + (k / 30) * 1.1);
          const [cx, cy] = at(a, 15, -2);
          const r = 1.8 * Math.sin((k / 30) * Math.PI) + 0.5;
          m.ell(cx + Math.cos(an) * 7, cy - Math.sin(an) * 7, r, r);
        }
        fill(c, m, mt);
        tip = at(a, 20, 0);
      } else {
        const a = ax(hx, hy, -0.12, -1);
        shaft(a, -20, 52, 1.5, mt === WOOD || mt === STEEL ? DLEATHER : SHADOW);
        const [sx, sy] = at(a, 52, 0);
        const m = new Mk().poly([sx - 1, sy - 4, sx + 8, sy - 9, sx + 20, sy - 8, sx + 31, sy - 1, sx + 21, sy - 3, sx + 10, sy - 1, sx + 1, sy + 3]);
        fill(c, m, mt, { tex: (x, y) => (y < sy - 5 + (x - sx) * 0.05 ? 0.6 : 0) });
        tip = [sx + 29, sy - 1];
      }
      break;
    }
    case 'whip': {
      const a = ax(hx, hy, -0.4, -1);
      grip(a, -4, 8, 1.6);
      const col = /fire/.test(def.id) ? FIRE : /chain/.test(def.id) ? STEEL : /rope/.test(def.id) ? LINEN : LEATHER;
      const [ex, ey] = at(a, 8, 0);
      const m = new Mk().stroke([ex, ey, ex - 5, ey + 2, ex - 9, ey + 8, ex - 9, ey + 15, ex - 4, ey + 19, ex + 1, ey + 15, ex - 3, ey + 11, ex - 8, ey + 16, ex - 9, ey + 23, ex - 5, ey + 28], 2);
      paint(c, m, (x, y) => ((x + y) % 3 === 0 ? tones(col)[1] : (x + y) % 3 === 1 ? tones(col)[3] : tones(col)[2]));
      edges(c, m, tones(col)[5]);
      if (col === FIRE) f.halos.push([Math.round(ex - 5), Math.round(ey + 14), 9, '#ff8a3d']);
      tip = [ex - 5, ey + 28];
      break;
    }
    case 'fist': {
      for (const [cx, cy] of [HAND_L, HAND_R]) {
        const fm = /bone/.test(def.id) ? BONE : /crystal/.test(def.id) ? CRYSTAL : /iron/.test(def.id) ? STEEL : LINEN;
        if (/claw/.test(def.id) || /crystal/.test(def.id)) {
          for (const dx of [-2.5, 0, 2.5]) {
            const m = new Mk().poly([cx + dx - 1, cy - 3, cx + dx + 1, cy - 3, cx + dx - 1.5, cy - 10]);
            fill(c, m, fm, { soft: 0.4 });
          }
        }
      }
      return 'fist';
    }
    case 'bow': {
      const m = new Mk();
      const limb = (y: number) => hx - 0.5 - 10 * ((y - hy) / 24) ** 2 + 1.6 * ((y - hy) / 24) ** 6;
      for (let y = 43; y <= 92; y++) {
        const w = 2.3 - Math.abs(y - hy) / 22;
        const x = limb(y);
        for (let k = -w; k <= w; k += 0.5) m.add(x + k, y);
      }
      // สายธนูด้านนอก (ทับเฉพาะพื้นว่าง/ผ้าคลุม)
      const sx = Math.round(limb(44)) + 1;
      for (let y = 45; y <= 90; y++) set(c, sx, y, 'w');
      const bm = mt === STEEL || mt === WOOD ? LIGHT_WOOD : mt;
      fill(c, m, bm, { soft: 0.6, tex: (_, y) => (y % 5 === 0 ? -0.3 : 0) });
      for (const y of [43, 92]) blob(limb(y), y, 1.7, accent);
      grip(ax(hx, hy, 0, -1), -5, 5, 2.2);
      if (elc) {
        f.halos.push([Math.round(limb(48)), 48, 6, elc]);
        f.halos.push([Math.round(limb(88)), 88, 6, elc]);
      }
      tip = [limb(46), 46];
      break;
    }
    case 'crossbow': {
      const a = ax(hx, hy, -0.22, -1);
      shaft(a, -7, 22, 2.4, LIGHT_WOOD);
      const m = new Mk();
      for (let s = -12; s <= 12; s += 0.5) {
        const [x, y] = at(a, 19 + 0.045 * s * s, s);
        m.ell(x, y, 1.7, 1.7);
      }
      fill(c, m, mt === WOOD ? STEEL : mt, { soft: 0.5 });
      const [l0x, l0y] = at(a, 19 + 0.045 * 144, 12);
      const [l1x, l1y] = at(a, 19 + 0.045 * 144, -12);
      const [nx, ny] = at(a, 9, 0);
      paint(c, new Mk().stroke([l0x, l0y, nx, ny, l1x, l1y], 1), () => 'w');
      blade(a, 9, 28, (t) => (t > 25 ? 1.3 * (28 - t) / 3 : 0.7), false);
      tip = at(a, 27, 0);
      break;
    }
    case 'pistol': case 'rifle': case 'shotgun': case 'cannon': {
      const a = kind === 'pistol' ? ax(hx, hy - 3, -1, -0.45) : ax(hx, hy, -0.2, -1);
      const len = kind === 'pistol' ? 16 : kind === 'cannon' ? 34 : 42;
      const bw = kind === 'cannon' ? 4 : kind === 'shotgun' ? 2.1 : kind === 'pistol' ? 1.7 : 1.4;
      if (kind !== 'pistol') {
        const st = bar(a, -14, 6, (t) => 2.8 - (t + 14) * 0.03);
        fill(c, st, LIGHT_WOOD);
      } else {
        // ด้ามปืนพก (ไม้) เอียงลงใต้มือ + โครงโลหะ
        fill(c, bar(ax(hx, hy - 3, 0.35, 1), -1, 9, () => 2.3), LIGHT_WOOD, { soft: 0.5 });
        fill(c, bar(a, -2, 8, () => 3), DSTEEL, { soft: 0.5 });
      }
      const brl = bar(a, 3, len, () => bw);
      fill(c, brl, kind === 'cannon' ? GOLD : mt === STEEL ? STEEL : mt, { tex: (x, y) => (kind === 'shotgun' && Math.abs(sOf(a, x, y)) < 0.5 ? -0.6 : 0) });
      if (kind === 'cannon') {
        for (const t of [10, 20, 30]) fill(c, bar(a, t, t + 2, () => bw + 1), RED, { soft: 0.4 });
        f.halos.push([...(at(a, len + 2, 0).map(Math.round) as [number, number]), 7, '#ff8a3d']);
      }
      if (/flintlock/.test(def.id)) fill(c, bar(a, -1, 4, () => 2.6), GOLD, { soft: 0.4 });
      if (/revolver/.test(def.id)) fill(c, new Mk().ell(...at(a, 5, 0), 3.2, 3.2), STEEL, { soft: 0.5 });
      if (kind === 'pistol') set(c, ...at(a, -2.5, 2.6), 'F'); // นกสับ
      if (kind === 'rifle') fill(c, bar(ax(...at(a, 0, 3.5), a.dx, a.dy), 10, 20, () => 1.4), DARK, { soft: 0.4 });
      tip = at(a, len, 0);
      break;
    }
    case 'sling': {
      const a = ax(hx, hy, -0.3, -1);
      shaft(a, -4, 8, 1.5);
      const [fx, fy] = at(a, 8, 0);
      const arms = new Mk().stroke([fx, fy, fx - 5, fy - 8], 2).stroke([fx, fy, fx + 3, fy - 9], 2);
      fill(c, arms, WOOD, { soft: 0.5 });
      paint(c, new Mk().stroke([fx - 5, fy - 8, fx - 1, fy - 4, fx + 3, fy - 9], 1), () => 'R');
      tip = [fx, fy - 9];
      break;
    }
    case 'boomerang': case 'chakram': {
      const a = ax(hx, hy, -0.3, -1);
      if (kind === 'chakram') {
        const [cx, cy] = at(a, 11, 0);
        const m = new Mk().ell(cx, cy, 8.5, 8.5);
        for (let k = 0; k < 8; k++) {
          const an = (k / 8) * Math.PI * 2;
          m.poly([cx + Math.cos(an) * 7, cy + Math.sin(an) * 7, cx + Math.cos(an + 0.35) * 11, cy + Math.sin(an + 0.35) * 11, cx + Math.cos(an + 0.5) * 7.5, cy + Math.sin(an + 0.5) * 7.5]);
        }
        m.cut(new Mk().ell(cx, cy, 5, 5));
        fill(c, m, mt === STEEL ? GOLD : mt);
        tip = [cx + 8, cy - 8];
      } else {
        const [bx, by] = at(a, 3, 0);
        const m = new Mk().stroke([bx - 12, by - 6, bx, by - 14, bx + 10, by - 6], 4);
        fill(c, m, WOOD, { tex: (x, y) => ((x + y) % 6 < 2 ? -0.3 : 0) });
        tip = [bx, by - 14];
      }
      break;
    }
    case 'staff': case 'wand': {
      const wand = kind === 'wand';
      const a = ax(hx, hy, wand ? -0.35 : -0.08, -1);
      const top = wand ? 16 : 44;
      shaft(a, wand ? -4 : -21, top, wand ? 1.1 : 1.6, mt === STEEL || mt === WOOD ? WOOD : mt === GOLD || mt === HOLY ? GOLD : DLEATHER, !wand);
      const orbC = elc ?? (mt.l ?? 'C');
      const [ox, oy] = at(a, top + (wand ? 4 : 9), 0);
      const r = wand ? 3 : 5.4;
      if (/holy/.test(def.id)) {
        star(c, ox, oy, 8, 'Y', 'y');
        blob(ox, oy, 3.4, HOLY);
      } else if (/crystal|blood|frost|ice/.test(def.id) || wand) {
        const m = new Mk().poly([ox, oy - r * 1.6, ox + r, oy, ox, oy + r * 1.3, ox - r, oy]);
        paint(c, m, (x, y) => (x + 0.5 < ox ? (y < oy ? lt(orbC, 0.6) : orbC) : y < oy ? orbC : dk(orbC, 0.35)));
        edges(c, m, dk(orbC, 0.6));
      } else {
        // ลูกแก้ว: ไล่สีวงกลม + ลายวนด้านใน + ประกาย
        const m = new Mk().ell(ox, oy, r, r);
        paint(c, m, (x, y) => {
          const u = (x + 0.5 - ox) / r;
          const v = (y + 0.5 - oy) / r;
          const d = u * 0.55 + v * 0.8;
          const sw = Math.sin(Math.atan2(v, u) * 3 + Math.hypot(u, v) * 6);
          return d < -0.55 ? lt(orbC, 0.6) : d < -0.1 ? lt(orbC, 0.3) : d < 0.45 ? (sw > 0.6 ? lt(orbC, 0.2) : orbC) : dk(orbC, 0.35);
        });
        edges(c, m, dk(orbC, 0.6));
        if (/void|abyss/.test(def.id)) paint(c, new Mk().ell(ox, oy, r * 0.5, r * 0.5), () => '#100f1c');
      }
      if (!wand) {
        // ก้ามจับลูกแก้ว
        for (const s of [-1, 1]) {
          const cl = new Mk().stroke([...at(a, top - 1, s * 2), ...at(a, top + 4, s * 6), ...at(a, top + 10, s * 5.2)], 2);
          fill(c, cl, accent, { soft: 0.4 });
        }
      }
      f.halos.push([Math.round(ox), Math.round(oy), wand ? 6 : 10, orbC]);
      f.glints.push([Math.round(ox - r * 0.45), Math.round(oy - r * 0.5), 'W', 0]);
      tip = [ox, oy - r];
      break;
    }
    case 'tome': {
      const cov = elc ? { d: dk(elc, 0.55), m: dk(elc, 0.3), l: elc } : mt;
      const book = new Mk().poly([8, 58, 25, 56, 27, 75, 10, 77]);
      fill(c, book, cov, { tex: (x) => (x < 11 ? -0.4 : 0) });
      paint(c, new Mk().poly([10, 77, 27, 75, 27, 77, 10, 79]), (x) => (x % 2 ? '#f6e4bc' : 's'));
      // วงเวทบนปก
      const rc = elc ?? 'Y';
      const ring = new Mk().ell(17.8, 66.5, 4.5, 4.5);
      ring.cut(new Mk().ell(17.8, 66.5, 3.3, 3.3));
      paint(c, ring, () => rc);
      star(c, 17.8, 66.5, 2.6, lt(rc, 0.4), 'W');
      for (const [x, y] of [[9, 59], [24, 57], [25, 74], [11, 76]] as [number, number][]) stud(c, x - 1, y - 1, 'Y');
      f.halos.push([18, 66, 8, rc]);
      return 'tome';
    }
    case 'orb': {
      const oc = elc ?? 'C';
      const [ox, oy] = [hx, hy - 15];
      const m = new Mk().ell(ox, oy, 6.5, 6.5);
      paint(c, m, (x, y) => {
        const u = (x + 0.5 - ox) / 6.5;
        const v = (y + 0.5 - oy) / 6.5;
        const d = u * 0.55 + v * 0.8;
        const sw = Math.sin(Math.atan2(v, u) * 2 - Math.hypot(u, v) * 7);
        return d < -0.6 ? 'W' : d < -0.15 ? lt(oc, 0.4) : d < 0.4 ? (sw > 0.5 ? lt(oc, 0.2) : oc) : dk(oc, 0.4);
      });
      edges(c, m, dk(oc, 0.6));
      f.halos.push([Math.round(ox), Math.round(oy), 12, oc]);
      f.glints.push([Math.round(ox + 6), Math.round(oy - 7), oc, 2], [Math.round(ox - 7), Math.round(oy + 3), oc, 0]);
      tip = [ox, oy - 6];
      break;
    }
    case 'bomb': {
      blob(hx - 1, hy - 7, 5.2, DARK);
      set(c, hx + 1, hy - 13, 'N');
      set(c, hx + 2, hy - 14, 'N');
      f.glints.push([hx + 3, hy - 15, 'Y', 2]);
      tip = null;
      break;
    }
  }
  // ระยิบตามความหายาก/เลเวล
  if (tip && (def.rarity === 'legendary' || def.rarity === 'epic' || band === 'legend' || band === 'gold')) {
    const [tx, ty] = tip;
    f.glints.push([Math.round(tx), Math.round(ty), band === 'legend' ? '#73eff7' : 'W', 2]);
    if (def.rarity === 'legendary' || band === 'legend') f.glints.push([Math.round(tx) + 5, Math.round(ty) + 9, elc ?? 'y', 2], [Math.round(tx) - 4, Math.round(ty) + 18, elc ?? 'y', 0]);
  }
  return kind;
}

function drawOffhand(f: F) {
  const id = f.g.offhand?.id;
  if (!id) return;
  const { c } = f;
  const [hx, hy] = HAND_R;
  const trim = trimOf(f.g.offhand);
  if (id === 'lantern') {
    // ตะเกียงแขวนจากมือ
    paint(c, new Mk().stroke([hx - 3, hy + 2, hx - 3, hy + 6, hx + 3, hy + 6, hx + 3, hy + 2], 1), () => 'F');
    const top = new Mk().poly([hx - 4, hy + 7, hx + 4, hy + 7, hx + 5, hy + 9, hx - 5, hy + 9]);
    fill(c, top, DSTEEL, { soft: 0.4 });
    const glass = new Mk().rect(hx - 4.5, hy + 10, 9, 9);
    paint(c, glass, (x, y) => {
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - (hy + 15));
      return x === Math.floor(hx) ? 'F' : d < 1.6 ? 'W' : d < 3 ? 'Y' : d < 4.2 ? 'r' : '#a8452f';
    });
    fill(c, new Mk().rect(hx - 5, hy + 19, 10, 2), DSTEEL, { soft: 0.4 });
    f.halos.push([Math.round(hx), Math.round(hy + 15), 13, '#ffcd75']);
    return;
  }
  let m: Mk;
  let mat: Mat;
  if (id === 'iron_shield') {
    m = new Mk().poly([49, 55, 75, 55, 75, 69, 62, 85, 49, 69]);
    mat = STEEL;
  } else if (id === 'crab_shield') {
    m = new Mk().ell(62, 69, 12.5, 12.5);
    for (let k = 0; k < 9; k++) {
      const an = Math.PI * (1.1 + (k / 8) * 0.8);
      m.ell(62 + Math.cos(an) * 12.5, 69 + Math.sin(an) * 12.5, 2.2, 2.2);
    }
    mat = SHELL;
  } else {
    m = new Mk().ell(62, 69, 12.5, 13);
    mat = WOOD;
  }
  m.keep((x) => x <= 77);
  fill(c, m, mat, {
    tex: (x, y) => {
      if (id === 'wood_shield') return x % 5 === 0 ? -0.55 : (x * 7 + y) % 11 === 0 ? -0.3 : 0;
      if (id === 'crab_shield') {
        const an = Math.atan2(y + 0.5 - 75, x + 0.5 - 62);
        return Math.abs(((an * 6) % 1) + 1) % 1 < 0.15 ? -0.45 : 0;
      }
      return 0;
    },
  });
  // ขอบโลหะ + ปุ่มกลาง/ลวดลาย
  const rimC = trim ?? (id === 'wood_shield' ? 'D' : id === 'crab_shield' ? '#ffb38a' : 'w');
  paint(c, m, (x, y) => (!m.has(x - 2, y) || !m.has(x + 2, y) || !m.has(x, y - 2) || !m.has(x, y + 2) ? ((x + y) % 4 ? rimC : lt(rimC, 0.4)) : null));
  edges(c, m, tones(mat)[5]);
  if (id === 'wood_shield') {
    fill(c, new Mk().ell(62, 69, 4, 4), STEEL, { soft: 0.6 });
    for (const [x, y] of [[53, 62], [70, 62], [53, 76], [70, 76]] as [number, number][]) stud(c, x, y, 'L');
    f.glints.push([60, 67, 'W', 0]);
  } else if (id === 'iron_shield') {
    const cr = new Mk().rect(60, 59, 4, 20).rect(53, 64, 18, 4);
    cr.keep((x, y) => m.has(x, y) && m.has(x + 2, y) && m.has(x - 2, y));
    fill(c, cr, { d: 'U', m: 'B', l: 'b' }, { soft: 0.5 });
    f.glints.push([53, 58, 'W', 1]);
  } else f.glints.push([56, 62, 'y', 1]);
}

// ---------------------------------------------------------------- ตีขอบ + ประกาย

function outlineAll(c: PixelCanvas) {
  const px = c.px;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < PW && y < PH && isSolid(px[y * PW + x]);
  const ring: (string | null)[] = new Array(NPX).fill(null);
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      if (solid(x, y)) continue;
      let nb: string | null = null;
      for (const [dx, dy] of NB4) {
        if (solid(x + dx, y + dy)) {
          nb = px[(y + dy) * PW + x + dx];
          break;
        }
      }
      if (nb) ring[y * PW + x] = mx(nb, '#120a1c', 0.8);
    }
  }
  // ด้านเงา (ขวา/ล่าง) หนา 2px
  const more: [number, string][] = [];
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const i = y * PW + x;
      if (ring[i] || solid(x, y)) continue;
      if (x > 1 && ring[i - 1] && solid(x - 2, y)) more.push([i, ring[i - 1]!]);
      else if (y > 1 && ring[i - PW] && solid(x, y - 2)) more.push([i, ring[i - PW]!]);
    }
  }
  for (let i = 0; i < NPX; i++) if (ring[i]) px[i] = ring[i];
  for (const [i, col] of more) px[i] = col;
}

/** ประกาย: 0 = จุดเดียว · 1 = ขีดเฉียงสะท้อนแสง · 2 = ดาวระยิบ 4 แฉก (นอกตัว) */
function glint(c: PixelCanvas, x: number, y: number, col: string, kind: number) {
  set(c, x, y, 'W');
  if (kind === 1) {
    for (const [dx, dy] of [[1, -1], [-1, 1]]) {
      const p = get(c, x + dx, y + dy);
      if (isSolid(p)) set(c, x + dx, y + dy, mx(col, p!, 0.35));
    }
  } else if (kind === 2) {
    for (const [dx, dy] of NB4) set(c, x + dx, y + dy, col);
    for (const [dx, dy] of NB4) setEmpty(c, x + dx * 2, y + dy * 2, mx(col, '#ffffff', 0.3));
  }
}

function halo(c: PixelCanvas, cx: number, cy: number, r: number, col: string) {
  const h = mixHex(col, col, 0).slice(1);
  const n = parseInt(h, 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
      if (d > 1 || get(c, x, y)) continue;
      const a = (1 - d) * 0.42 + dither(x, y) * 0.12;
      if (a > 0.06) set(c, x, y, `rgba(${rgb},${a.toFixed(2)})`);
    }
  }
}

// ---------------------------------------------------------------- ประกอบ

const outfitOf = (id: string) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
const helmetOf = (id: string) => HELMET_DEFS.find((h) => h.id === id) ?? HELMET_DEFS[0];

function drawPortrait(look: HeroLook, gear: PortraitGear, blink: boolean): PixelCanvas {
  const c = new PixelCanvas(PW, PH, 1);
  const o = outfitOf(look.outfit);
  const helm = helmetOf(look.helmet);
  const skin: Mat = o.face ?? { d: look.skinShade, m: look.skin, l: lt(look.skin, 0.22), h: lt(look.skin, 0.45) };
  const hm: Mat = { d: look.hairShade, m: look.hair, l: lt(look.hair, 0.28), h: lt(look.hair, 0.52) };
  const hg = gear.hands ? HAND_GEAR[gear.hands.id] : undefined;
  const fg = gear.feet ? FEET_GEAR[gear.feet.id] : undefined;
  const f: F = {
    c, look, o, g: gear, skin, hm, blink,
    legs: (gear.legs && LEG_GEAR[gear.legs.id]) || o.legs,
    boots: fg?.mat ?? o.boots,
    hands: hg?.mat ?? o.hands ?? skin,
    trim: trimOf(gear.body),
    glints: [],
    halos: [],
    skinSet: new Set(tones(skin)),
    hairSet: new Set(),
  };
  const sk = tones(skin);
  for (const t of sk) f.skinSet.add(t);
  for (const t of sk) f.skinSet.add(dk(t, 0.3));

  capeBack(f);
  backpack(f);
  quiverBack(f);
  drawLegs(f);
  drawRobe(f);
  drawTorso(f);
  chestDetails(f, 'chest');
  drawBelt(f);
  chestDetails(f, 'post');
  drawCoat(f);
  drawArms(f);
  drawShoulders(f);
  capeOver(f);
  frontGear(f);
  drawHead(f);
  chestDetails(f, 'neck');
  const hideTop = helm.hide === 'all' ? 999 : helm.hide === 'top' ? (helm.clearTop ?? 0) * 4 : 0;
  if (hideTop < 999) drawHair(f, hideTop);
  if (helm.hide === 'top' && hideTop > 0) {
    // หมวกทรงสูง: เหนือปีกหมวกเห็นเฉพาะตัวหมวก (ไม่มีหัว/ผมโผล่ข้างยอดหมวก)
    const hm = fromRows(helm.down, '12abcdefghwxy');
    for (let y = 0; y < hideTop; y++) for (let x = 0; x < PW; x++) if (!hm.has(x, y)) c.px[y * PW + x] = null;
  }
  drawHelmet(f, helm);
  // คิ้ว (โผล่ทะลุหน้าม้าจาง ๆ)
  if (!o.face && helm.hide !== 'all') {
    for (const [x0, dir] of [[21, 1], [49, -1]] as [number, number][]) {
      for (let i = 0; i < 9; i++) {
        const x = x0 + i;
        const y = 25 - (i > 1 && i < 7 ? 1 : 0) + (dir > 0 ? (i > 6 ? 1 : 0) : i < 2 ? 1 : 0);
        const p = get(c, x, y);
        if (!p) continue;
        if (f.skinSet.has(p)) set(c, x, y, mx(look.hairShade, INK, 0.25));
        else if (f.hairSet.has(p)) set(c, x, y, dk(look.hairShade, 0.15));
      }
    }
  }
  drawHand(f, HAND_R, false);
  drawOffhand(f);
  const wk = drawWeapon(f);
  if (wk !== 'tome') drawHand(f, HAND_L, !!wk && wk !== 'orb' && wk !== 'fist');
  if (wk === 'fist') {
    // สนับมือทับมือทั้งสองข้าง
    const id = gear.weapon!.id;
    const fm = /iron/.test(id) ? STEEL : /crystal/.test(id) ? CRYSTAL : /bone/.test(id) ? BONE : LINEN;
    for (const [cx, cy] of [HAND_L, HAND_R]) {
      const m = new Mk().rect(cx - 4, cy - 3, 9, 3);
      fill(c, m, fm, { soft: 0.5, tex: (x) => (x % 2 ? 0.3 : 0) });
    }
  }

  outlineAll(c);
  hairFlyaways(f, helm.hide === 'all' || helm.hide === 'top');
  // เงาพื้น
  for (let y = 86; y <= 95; y++) {
    for (let x = 14; x <= 66; x++) {
      const d = ((x + 0.5 - 40) / 24) ** 2 + ((y + 0.5 - 91) / 4) ** 2;
      if (d <= 1 && !c.px[y * PW + x]) c.px[y * PW + x] = d < 0.45 ? 'rgba(10,12,30,0.34)' : 'rgba(10,12,30,0.2)';
    }
  }
  for (const [x, y, r, col] of f.halos) halo(c, x, y, r, col);
  for (const [x, y, col, big] of f.glints) glint(c, x, y, col, big);
  return c;
}

/** อกยกขึ้น 1px (หายใจเข้า): แถวเหนือ y=62 เลื่อนขึ้น 1 แถว */
function breathe(src: PixelCanvas): PixelCanvas {
  const c = new PixelCanvas(PW, PH, 1);
  for (let y = 0; y < PH; y++) {
    const sy = y < 62 ? y + 1 : y;
    for (let x = 0; x < PW; x++) c.px[y * PW + x] = src.px[sy * PW + x];
  }
  return c;
}

/** 3 เฟรม: ยืน · หายใจเข้า · กะพริบตา (ใช้ทำ contact sheet ได้โดยไม่ต้องมี Phaser) */
export function portraitFrames(look: HeroLook, gear: PortraitGear = {}): PixelCanvas[] {
  const base = drawPortrait(look, gear, false);
  return [base, breathe(base), drawPortrait(look, gear, true)];
}

// ---------------------------------------------------------------- texture + มุมมอง UI

const LRU: string[] = [];

/** สร้าง texture รูปเหมือน (3 เฟรม 80×96) ถ้ายังไม่มี — คืน key · เก็บล่าสุดไม่เกิน 10 ใบ */
export function buildHeroPortrait(scene: Phaser.Scene, look: HeroLook, gear: PortraitGear): string {
  const key = portraitKey(look, gear);
  const i = LRU.indexOf(key);
  if (i >= 0) LRU.splice(i, 1);
  LRU.push(key);
  if (!scene.textures.exists(key)) {
    const frames = portraitFrames(look, gear);
    const tex = scene.textures.createCanvas(key, PW * frames.length, PH)!;
    const ctx = tex.getContext();
    frames.forEach((pc, k) => {
      pc.blit(ctx, k * PW, 0);
      tex.add(k, 0, k * PW, 0, PW, PH);
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  while (LRU.length > 10) {
    const old = LRU.shift()!;
    if (scene.textures.exists(old)) scene.textures.remove(old);
  }
  return key;
}

/**
 * รูปเหมือนในหน้าต่าง: sprite ขยายเลขเต็ม (NEAREST) จุดยึดที่เท้า + หายใจ/กะพริบตาเบา ๆ (สลับเฟรม ไม่เด้ง)
 * sync() เรียกตอนหน้าต่างรีเฟรช — สร้าง texture ใหม่เฉพาะเมื่อลุค/อุปกรณ์/เลเวลเปลี่ยน
 */
export class PortraitView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private key = '';
  private tick = 0;
  private frame = -1;

  /** x,y = จุดเท้า (พื้น) บนจอ · scale = ขยายกี่เท่า (จำนวนเต็ม) */
  constructor(private scene: Phaser.Scene, x: number, y: number, readonly scale = 2) {
    this.sprite = scene.add.sprite(x, y + (PH - PORTRAIT_FEET) * scale, '__DEFAULT').setOrigin(0.5, 1).setScale(scale).setVisible(false);
    const ev = scene.time.addEvent({ delay: 150, loop: true, callback: () => this.step() });
    this.sprite.once('destroy', () => ev.remove());
  }

  /** ขนาดพิกเซลต่อ 1 พิกเซลโลก (ใช้กับภาพออร่า) */
  get worldScale() {
    return (this.scale * PW) / 20;
  }

  sync(look: HeroLook, equip: Partial<Record<EquipSlot, Slot | null>>) {
    const gear = portraitGearOf(equip);
    const key = portraitKey(look, gear);
    if (key === this.key && this.scene.textures.exists(key)) return;
    this.key = buildHeroPortrait(this.scene, look, gear);
    this.frame = -1;
    this.sprite.setTexture(this.key, 0).setVisible(true);
    this.step();
  }

  /** ลุคล้วน (ไม่มีอุปกรณ์) เช่นหน้าจอเลือกตัวละคร */
  show(look: HeroLook) {
    this.sync(look, {});
    return this;
  }

  private step() {
    if (!this.key || !this.sprite.active) return;
    this.tick = (this.tick + 1) % 420;
    // หายใจ: เข้า 1.35 วิ ออก 1.35 วิ · กะพริบตา 150ms ทุก ~4.5 วิ (สองครั้งติดเป็นบางรอบ)
    const t = this.tick % 30;
    const blink = t === 0 || (this.tick % 90 === 2);
    const fr = blink ? 2 : this.tick % 18 < 9 ? 0 : 1;
    if (fr !== this.frame) {
      this.frame = fr;
      this.sprite.setFrame(fr);
    }
  }
}
