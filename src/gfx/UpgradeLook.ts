import Phaser from 'phaser';
import { bandOf, type UpBand } from '../data/upgrade';
import { qualityKnobs } from '../core/Quality';

/**
 * หน้าตาใหม่ตามช่วงอัพเกรด — สร้าง texture `${key}@${band}` จาก texture เดิม (วาดด้วยโค้ดทั้งหมด = canvas) ตอนใช้ครั้งแรก
 * - iron   (Lv4–6): ขอบเหล็ก 1px + โทนเย็น + หมุดเงิน
 * - gold   (Lv7–9): ขอบทอง 1px + โทนอุ่น + ประกายขอบบน
 * - legend (Lv10) : ขอบ 2 สี ม่วง/ฟ้า + สีสดขึ้น (+ แสงเรือง/ประกายระยิบ ทำที่ตัว sprite)
 * ขอบวาดลงเฉพาะพิกเซลโปร่งใสในกรอบเฟรมเดิม — ขนาดเฟรม/จุดยึดไม่เปลี่ยน · spritesheet คัดลอกทุกเฟรม · anim โคลนเป็น `${anim}@${band}`
 * texture ที่ไม่มี canvas/รูปต้นฉบับ → คืน key เดิม (ผู้เรียกใช้ tint แทนได้)
 */

type RGB = [number, number, number];
const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

const LOOK: Record<UpBand, { tint: RGB; tint2?: RGB; tintK: number; sat: number; top: RGB; side: RGB; ring2?: RGB; shine?: RGB; shineK: number; rivet?: RGB; band?: RGB; sparkle?: boolean }> = {
  // เสริมเหล็ก: สีออกโลหะเย็น + แถบเหล็กคาดพร้อมหมุด + ขอบบนเงาเหล็ก
  iron: { tint: hex('#94b0c2'), tintK: 0.32, sat: 0.72, top: hex('#94b0c2'), side: hex('#333c57'), rivet: hex('#e4eef5'), band: hex('#566c86'), shine: hex('#e4eef5'), shineK: 0.45 },
  // ทองคำ: ไฮไลต์กลายเป็นทอง + ขอบทองหนา 2 ชั้นด้านบน + แถบทองคาด
  gold: { tint: hex('#ffcd75'), tintK: 0.34, sat: 1.15, top: hex('#ffcd75'), side: hex('#b86f50'), rivet: hex('#fff2b0'), band: hex('#ef9d3b'), shine: hex('#fff2b0'), shineK: 0.7 },
  // ตำนาน: ไล่สีฟ้า→ม่วงจากบนลงล่าง + ขอบสองชั้น + ประกายดาวในตัว
  legend: { tint: hex('#73eff7'), tint2: hex('#c77dff'), tintK: 0.3, sat: 1.45, top: hex('#73eff7'), side: hex('#c77dff'), ring2: hex('#c77dff'), shine: hex('#ffffff'), shineK: 0.6, sparkle: true },
};

/** สีประจำช่วง (ใช้กับกรอบช่องไอเทม/ป้ายเลเวล) */
export const BAND_TINT: Record<UpBand, number> = { iron: 0x94b0c2, gold: 0xffcd75, legend: 0xc77dff };

const failed = new Set<string>();

interface Rect { x: number; y: number; w: number; h: number }

function treat(d: Uint8ClampedArray, W: number, r: Rect, band: UpBand) {
  const L = LOOK[band];
  const OPA = 160;
  const solid = new Uint8Array(r.w * r.h);
  let minX = r.w, minY = r.h, maxX = -1, maxY = -1;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (d[((r.y + y) * W + r.x + x) * 4 + 3] >= OPA) {
        solid[y * r.w + x] = 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return;
  // ของทรงแผ่นเต็มช่อง (แปลงผัก พื้น กำแพง รั้ว) วางติดกันเป็นแถว — ห้ามมีขอบ/แถบ ไม่งั้นกลายเป็นตารางลายตา ใช้แค่ย้อมสีอ่อนๆ
  const tile = minX <= 1 && maxX >= r.w - 2 && maxY >= r.h - 2 && maxY - minY >= r.h * 0.5;
  const S = (x: number, y: number) => (x < 0 || y < 0 || x >= r.w || y >= r.h ? 0 : solid[y * r.w + x]);
  const at = (x: number, y: number) => ((r.y + y) * W + r.x + x) * 4;
  const set = (x: number, y: number, c: RGB, a = 255) => {
    const i = at(x, y);
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = a;
  };
  // 1) ย้อมสี + ปรับความสด + ประกายขอบบน
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (!solid[y * r.w + x]) continue;
      const i = at(x, y);
      let R = d[i], G = d[i + 1], B = d[i + 2];
      const g = 0.3 * R + 0.59 * G + 0.11 * B;
      R = g + (R - g) * L.sat;
      G = g + (G - g) * L.sat;
      B = g + (B - g) * L.sat;
      // สีย้อม (ตำนาน = ไล่ฟ้า→ม่วงตามความสูง) · เน้นที่พิกเซลสว่างให้ดูเป็นวัสดุใหม่
      const t = maxY > minY ? (y - minY) / (maxY - minY) : 0;
      const tc = L.tint2 ? [L.tint[0] + (L.tint2[0] - L.tint[0]) * t, L.tint[1] + (L.tint2[1] - L.tint[1]) * t, L.tint[2] + (L.tint2[2] - L.tint[2]) * t] : L.tint;
      const k = L.tintK * (0.6 + (g / 255) * 0.8) * (tile ? 0.55 : 1);
      R += (tc[0] - R) * k;
      G += (tc[1] - G) * k;
      B += (tc[2] - B) * k;
      // ขอบบนของทุกคอลัมน์ (หลังคา/ยอด) หนา 2 พิกเซลเป็นสีเงา/ทอง/ประกาย
      const edge = !S(x, y - 1) ? 1 : !S(x, y - 2) ? 0.55 : 0;
      if (L.shine && edge && !tile) {
        R += (L.shine[0] - R) * L.shineK * edge;
        G += (L.shine[1] - G) * L.shineK * edge;
        B += (L.shine[2] - B) * L.shineK * edge;
      }
      if (L.sparkle && !tile && g > 110 && (x * 7 + y * 13) % 29 === 0) R = G = B = 255;
      d[i] = R;
      d[i + 1] = G;
      d[i + 2] = B;
    }
  }
  // 2a) แถบคาด + หมุด (เฉพาะภาพใหญ่อย่างสิ่งก่อสร้าง/ยาน — ไอคอน 16px ข้าม)
  if (tile) return;
  if (L.band && maxX - minX >= 14 && maxY - minY >= 14) {
    const by = minY + Math.round((maxY - minY) * 0.7);
    for (let x = minX; x <= maxX; x++) {
      if (!S(x, by) || !S(x, by + 1)) continue;
      set(x, by, L.band);
      const i = at(x, by + 1);
      d[i] *= 0.7;
      d[i + 1] *= 0.7;
      d[i + 2] *= 0.7;
      if (L.rivet && (x - minX) % 4 === 2) set(x, by, L.rivet);
    }
  }
  // 2) หมุดที่มุมกรอบ
  if (L.rivet && maxX - minX >= 7 && maxY - minY >= 7) {
    const pts: [number, number][] = [[minX + 2, minY + 2], [maxX - 2, minY + 2], [minX + 2, maxY - 2], [maxX - 2, maxY - 2]];
    if (maxX - minX >= 20) pts.push([(minX + maxX) >> 1, minY + 2], [(minX + maxX) >> 1, maxY - 2]);
    for (const [x, y] of pts) if (S(x, y)) set(x, y, L.rivet);
  }
  // 3) ขอบนอก 1px (ลงเฉพาะพิกเซลโปร่งใสจริงๆ) — ด้านบน/ซ้าย = สีสว่าง, ด้านล่าง/ขวา = สีเข้ม
  const ring = new Uint8Array(r.w * r.h);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (solid[y * r.w + x] || d[at(x, y) + 3] > 40) continue;
      const below = S(x, y + 1), right = S(x + 1, y), above = S(x, y - 1), left = S(x - 1, y);
      if (!(below || right || above || left)) continue;
      ring[y * r.w + x] = 1;
      const light = band === 'legend' ? y < (minY + maxY) / 2 : below || right;
      set(x, y, light ? L.top : L.side);
    }
  }
  // 4) ขอบชั้นที่ 2 จางๆ (ตำนาน)
  if (L.ring2) {
    for (let y = 0; y < r.h; y++) {
      for (let x = 0; x < r.w; x++) {
        const k = y * r.w + x;
        if (solid[k] || ring[k] || d[at(x, y) + 3] > 40) continue;
        const R2 = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < r.w && yy < r.h && ring[yy * r.w + xx] === 1;
        if (R2(x + 1, y) || R2(x - 1, y) || R2(x, y + 1) || R2(x, y - 1)) set(x, y, L.ring2, 110);
      }
    }
  }
}

/** key ของ texture ตามช่วง (สร้างครั้งแรกที่เรียก) — band null = key เดิม */
export function variantKey(scene: Phaser.Scene, key: string, band: UpBand | null): string {
  if (!band || !key) return key;
  const vk = `${key}@${band}`;
  const tm = scene.textures;
  if (tm.exists(vk)) return vk;
  if (failed.has(vk) || !tm.exists(key)) return key;
  try {
    const base = tm.get(key);
    const src = base.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const w = src?.width ?? 0;
    const h = src?.height ?? 0;
    const drawable = typeof HTMLCanvasElement !== 'undefined' && (src instanceof HTMLCanvasElement || src instanceof HTMLImageElement);
    if (!drawable || !w || !h || w * h > 1024 * 1024) throw new Error('no source');
    const tex = tm.createCanvas(vk, w, h);
    if (!tex) throw new Error('create failed');
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    const names = base.getFrameNames(false);
    const rects: Rect[] = [];
    const seen = new Set<string>();
    for (const n of names) {
      const f = base.get(n);
      const r = { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
      const k = `${r.x},${r.y},${r.w},${r.h}`;
      if (!seen.has(k) && r.w > 0 && r.h > 0) {
        seen.add(k);
        rects.push(r);
      }
    }
    if (!rects.length) rects.push({ x: 0, y: 0, w, h });
    for (const r of rects) treat(img.data, w, r, band);
    ctx.putImageData(img, 0, 0);
    for (const n of names) {
      const f = base.get(n);
      tex.add(n, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    }
    tex.refresh();
    return vk;
  } catch {
    failed.add(vk);
    if (tm.exists(vk)) tm.remove(vk);
    return key;
  }
}

/** key ของ texture สำหรับเลเวล (Lv1–3 = เดิม) */
export const lookKey = (scene: Phaser.Scene, key: string, lv: number) => variantKey(scene, key, bandOf(lv));

/** โคลน animation ให้ใช้ texture ช่วงนั้น (`${anim}@${band}`) — ไม่ได้ = คืน key เดิม */
export function variantAnim(scene: Phaser.Scene, animKey: string, band: UpBand | null): string {
  if (!band) return animKey;
  const vk = `${animKey}@${band}`;
  const am = scene.anims;
  if (am.exists(vk)) return vk;
  const a = am.get(animKey);
  if (!a) return animKey;
  try {
    const frames = a.frames.map((f) => ({ key: variantKey(scene, f.textureKey, band), frame: f.textureFrame, duration: f.duration || undefined }));
    am.create({
      key: vk, frames, frameRate: a.frameRate, repeat: a.repeat, yoyo: a.yoyo, repeatDelay: a.repeatDelay, delay: a.delay,
      showOnStart: a.showOnStart, hideOnComplete: a.hideOnComplete, skipMissedFrames: a.skipMissedFrames,
    });
    return am.exists(vk) ? vk : animKey;
  } catch {
    return animKey;
  }
}

/** ตัดส่วน @band ออก (เช็ก key ต้นฉบับ) */
export const baseKeyOf = (key: string) => {
  const i = key.indexOf('@');
  return i < 0 ? key : key.slice(0, i);
};

/** แสงเรืองรอบ sprite (Lv10) — WebGL เท่านั้น · คืนตัวควบคุมไว้ลบทีหลัง */
export function addLegendGlow(obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): Phaser.FX.Glow | null {
  // คุณภาพกลาง/ต่ำ: ไม่ใส่ (preFX = วาดซ้ำต่อชิ้น หนักบนมือถือ) — ภาพโฉม Lv10 ยังเปลี่ยนตามปกติ
  if (!qualityKnobs().glow) return null;
  try {
    const fx = obj.preFX;
    if (!fx) return null;
    fx.setPadding(2);
    return fx.addGlow(0xc77dff, 2, 0, false, 0.1, 8);
  } catch {
    return null;
  }
}

/** สร้าง texture ที่ระบุแบบ `base@band` ถ้ายังไม่มี (หน้าคลังข้อมูลส่ง key แบบนี้มา) */
export function ensureLookKey(scene: Phaser.Scene, key: string): string {
  const i = key.indexOf('@');
  if (i < 0 || scene.textures.exists(key)) return key;
  const band = key.slice(i + 1) as UpBand;
  if (band !== 'iron' && band !== 'gold' && band !== 'legend') return key;
  return variantKey(scene, key.slice(0, i), band);
}
