import Phaser from 'phaser';
import { PixelCanvas } from '../PixelCanvas';

/**
 * texture เล็กๆ ของเอฟเฟกต์การต่อสู้ (fx/CombatFx.ts) — ส่วนใหญ่วาดสีขาวไว้ย้อมสีด้วย tint
 * สร้างครั้งเดียวต่อเกม (เช็ก exists ก่อน) จึงเรียกจาก CombatFx ได้เลยไม่ต้องลงทะเบียนใน TextureFactory
 */
const SHAPES: Record<string, string[]> = {
  fx_dot: ['.W.', 'WWW', '.W.'],
  fx_px: ['WW', 'WW'],
  fx_streak: ['wWWWWW'],
  fx_spark4: ['..W..', '..W..', 'WWWWW', '..W..', '..W..'],
  fx_cross: ['..W..', '.wWw.', 'WWWWW', '.wWw.', '..W..'],
  fx_drop: ['.W.', '.W.', 'WWW', 'WWW', '.W.'],
  fx_bubble: ['.WWW.', 'W.wwW', 'W..wW', 'W...W', '.WWW.'],
  fx_wisp: ['..W.', '.WW.', '.WWW', 'WWW.', '.WW.', '..W.'],
  fx_pebble: ['.WW', 'WWW', 'WW.'],
};

/** ทรงที่มีสีในตัว (ไม่ย้อม) */
const COLORED: Record<string, string[]> = {
  fx_star: ['...O...', '..OYO..', 'OOOYOOO', 'OYYyYYO', '.OYYYO.', '.OYOYO.', '.OO.OO.'],
  fx_shard: ['.O.', 'OWO', 'OCO', 'OCO', 'ObO', '.O.'],
  fx_coin: ['.OOO.', 'OYyYO', 'OYNYO', 'OYNYO', 'OYYYO', '.OOO.'],
  fx_muzzle: ['...y...', '..yWy..', '.yWWWy.', 'yWWWWWy', '.yWWWy.', '..yWy..', '...y...'],
};

function addPc(scene: Phaser.Scene, key: string, pc: PixelCanvas) {
  const tex = scene.textures.createCanvas(key, pc.w, pc.h)!;
  pc.draw(tex.getContext());
  tex.refresh();
}

/** วงรอยฟันรูปพระจันทร์เสี้ยว: หนาตรงกลาง บางที่ปลาย (ชี้ไปทาง +x) */
function crescent(size: number, r: number, thick: number, span: number, core: boolean): PixelCanvas {
  const pc = new PixelCanvas(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const a = Math.atan2(dy, dx);
      if (Math.abs(a) > span) continue;
      const k = 1 - Math.abs(a) / span; // 1 ตรงกลาง → 0 ที่ปลาย
      const t = thick * (0.25 + 0.75 * Math.sqrt(k));
      const d = Math.hypot(dx, dy);
      if (d > r || d < r - t) continue;
      if (core) {
        if (d > r - 1.2) pc.set(x, y, 'W');
      } else pc.set(x, y, d > r - t * 0.45 ? 'W' : 'w');
    }
  }
  return pc;
}

/** แทงหอก: ลิ่มยาวเรียวไปทาง +x */
function thrust(): PixelCanvas {
  const pc = new PixelCanvas(36, 9);
  for (let x = 0; x < 36; x++) {
    const h = Math.max(0, Math.round(4 * (1 - Math.abs(x - 26) / 26)));
    for (let y = 4 - h; y <= 4 + h; y++) pc.set(x, y, Math.abs(y - 4) <= h / 2 ? 'W' : 'w');
  }
  return pc;
}

/** กลุ่มควัน/ฝุ่นกลมนุ่ม */
function puff(): PixelCanvas {
  return new PixelCanvas(8, 8).ellipse(4, 4.2, 3.6, 3.4, 'w').ellipse(3.4, 3.4, 2.4, 2.2, 'W');
}

/** ขอบจอแดง (ไล่ alpha จริงจัง ใช้ filter LINEAR ให้เนียนตอนขยาย) */
function vignette(scene: Phaser.Scene) {
  const w = 160;
  const h = 90;
  const tex = scene.textures.createCanvas('fx_vignette', w, h)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.55);
  g.addColorStop(0, 'rgba(255,40,60,0)');
  g.addColorStop(0.45, 'rgba(255,40,60,0.3)');
  g.addColorStop(1, 'rgba(210,10,40,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export function buildFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fx_vignette')) return;
  for (const [key, rows] of Object.entries(SHAPES)) addPc(scene, key, new PixelCanvas(rows[0].length, rows.length).rows(rows, 0, 0));
  for (const [key, rows] of Object.entries(COLORED)) addPc(scene, key, new PixelCanvas(rows[0].length, rows.length).rows(rows, 0, 0));
  addPc(scene, 'fx_arc', crescent(36, 16, 5, 1.25, false));
  addPc(scene, 'fx_arc_core', crescent(36, 16, 5, 1.1, true));
  addPc(scene, 'fx_arc_heavy', crescent(48, 22, 9, 1.4, false));
  addPc(scene, 'fx_thrust', thrust());
  addPc(scene, 'fx_puff', puff());
  vignette(scene);
}
