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

// ---------------------------------------------------------------- ออร่าอุปกรณ์ (fx/GearAura.ts)

/** วงเวทรูนบนพื้น (สีขาว ย้อมด้วย tint) — วาด 2 เท่า (HD) แสดงที่ scale 0.5 */
function runeCircle(size: number, rOut: number, rIn: number, runes: number, star: number): PixelCanvas {
  const pc = new PixelCanvas(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if ((d <= rOut && d > rOut - 3) || (d <= rIn && d > rIn - 2.5)) pc.set(x, y, 'W');
      else if (d <= rOut - 4 && d > rOut - 5) pc.set(x, y, 'w');
    }
  }
  // อักษรรูนเล็กๆ ระหว่างวงนอก-วงใน
  const GLYPHS = [['W.W', '.W.', 'W.W'], ['WWW', 'W..', 'WWW'], ['.W.', 'WWW', '.W.'], ['W..', 'WWW', '..W']];
  const rr = (rOut + rIn) / 2 - 1;
  for (let i = 0; i < runes; i++) {
    const a = (i / runes) * Math.PI * 2;
    pc.rows(GLYPHS[i % GLYPHS.length], Math.round(c + Math.cos(a) * rr - 1.5), Math.round(c + Math.sin(a) * rr - 1.5));
  }
  // ดาวเส้นตรงข้างใน (หกแฉก/ห้าแฉก)
  if (star) {
    const pts: [number, number][] = [];
    const r = rIn - 3;
    for (let i = 0; i < star; i++) {
      const a = -Math.PI / 2 + (i / star) * Math.PI * 2;
      pts.push([c + Math.cos(a) * r, c + Math.sin(a) * r]);
    }
    for (let i = 0; i < star; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 2) % star]; // ต่อข้ามจุด = ดาวหกแฉก/ห้าแฉก
      pc.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), 'w', 2);
    }
  }
  return pc;
}

/** ไล่ alpha นุ่มๆ (วงรีแสงใต้เท้า / เสาแสง) */
function softTex(scene: Phaser.Scene, key: string, w: number, h: number, pillar: boolean) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  if (pillar) {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // จางขึ้นด้านบน
    ctx.globalCompositeOperation = 'destination-in';
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.6, 'rgba(0,0,0,0.8)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.save();
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
    ctx.restore();
  }
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

export function buildAuraTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('aura_circle')) return;
  addPc(scene, 'aura_circle', runeCircle(72, 35, 25, 12, 6));
  addPc(scene, 'aura_circle2', runeCircle(40, 19, 13, 8, 5));
  softTex(scene, 'aura_glow', 64, 32, false);
  softTex(scene, 'aura_pillar', 16, 64, true);
}
