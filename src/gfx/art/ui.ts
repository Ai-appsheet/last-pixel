import Phaser from 'phaser';
import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

/** UI วาดเป็น pixel art แล้วขยาย ×2 (ขอบหนาแบบเกมเรโทร) ใช้กับ NineSlice */
export const UI_SCALE = 2;

function addScaled(scene: Phaser.Scene, key: string, pc: PixelCanvas, scale = UI_SCALE) {
  const tex = scene.textures.createCanvas(key, pc.w * scale, pc.h * scale)!;
  pc.draw(tex.getContext(), 0, 0, scale);
  tex.refresh();
}

/** กรอบหน้าต่าง: ขอบไม้ + หมุดทอง + พื้นมืด */
function panel(fill: string, fill2: string, wood: [string, string, string]): PixelCanvas {
  const c = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = Math.min(x, y, 15 - x, 15 - y);
      let col: string;
      if (edge === 0) col = 'O';
      else if (edge === 1) col = x === 1 || y === 1 ? wood[0] : wood[2];
      else if (edge === 2) col = wood[1];
      else if (edge === 3) col = 'O';
      else col = dither(x, y) > 0.3 ? fill2 : fill;
      c.set(x, y, col);
    }
  }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) c.set(x, y, 'Y');
  return c;
}

function button(top: string, mid: string, bottom: string, border: string): PixelCanvas {
  const c = new PixelCanvas(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const edge = Math.min(x, y, 11 - x, 11 - y);
      if (edge === 0) {
        if ((x === 0 || x === 11) && (y === 0 || y === 11)) continue; // มุมมน
        c.set(x, y, 'O');
      } else if (edge === 1) c.set(x, y, y === 1 ? top : y === 10 ? bottom : border);
      else c.set(x, y, y < 5 ? mid : y > 8 ? bottom : mid);
    }
  }
  return c;
}

function slot(border: string, light: string): PixelCanvas {
  const c = new PixelCanvas(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const edge = Math.min(x, y, 11 - x, 11 - y);
      if (edge === 0) c.set(x, y, border);
      else if (edge === 1) c.set(x, y, x === 1 || y === 1 ? 'rgba(0,0,0,0.55)' : light);
      else c.set(x, y, 'rgba(14,16,30,0.82)');
    }
  }
  return c;
}

function barFrame(): PixelCanvas {
  const c = new PixelCanvas(8, 8);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const edge = Math.min(x, y, 7 - x, 7 - y);
      c.set(x, y, edge === 0 ? 'O' : edge === 1 ? 'F' : '#0b0d1f');
    }
  }
  return c;
}

function paper(): PixelCanvas {
  const c = new PixelCanvas(12, 12);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const edge = Math.min(x, y, 11 - x, 11 - y);
      c.set(x, y, edge === 0 ? 'O' : edge === 1 ? 'M' : dither(x, y) > 0.35 ? 's' : 'S');
    }
  }
  return c;
}

/** ท้องฟ้ายามพลบค่ำสำหรับหน้าปก */
function sky(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas('title_sky', 960, 360)!;
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, '#0e0f22');
  g.addColorStop(0.45, '#2b1f4a');
  g.addColorStop(0.75, '#7a3a63');
  g.addColorStop(1, '#ef7d57');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 960, 360);
  tex.refresh();
}

/** เกาะหน้าปก 320×96 (ขยาย ×3) */
/** โปรไฟล์เกาะหน้าปก (หน่วยพิกเซลก่อนขยาย ×3): ขอบหญ้า / ขอบทราย / แนวน้ำ — ปลายเกาะลาดโค้งลงทะเล ไม่ตัดตรง */
export function titleIslandProfile(x: number): { top: number; sandTop: number; shore: number } {
  const W = 320;
  const top0 = 28 + Math.sin(x * 0.02) * 8 + Math.sin(x * 0.07 + 1) * 3 - Math.max(0, 1 - Math.abs(x - 160) / 160) * 14;
  const sand0 = top0 + 42 + Math.sin(x * 0.05) * 3;
  const shore0 = sand0 + 12;
  // ปลายเกาะ: smoothstep 0→1 ในช่วง 90 พิกเซลจากขอบ (ซ้ายโค้งยาว ขวาสั้นกว่า)
  const ss = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const e = Math.min(ss(x / 90), ss((W - 1 - x) / 40));
  const mid = 80;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const top = Math.round(lerp(mid, top0, Math.pow(e, 0.6)));
  const shore = Math.round(lerp(mid + 2, shore0, Math.pow(e, 0.35)));
  // หญ้าบางลงเร็วกว่า → ปลายเกาะเหลือหาดทรายโค้ง
  const sandTop = Math.min(shore - 2, Math.round(lerp(top + 1, sand0, Math.pow(e, 1.6))));
  return { top, sandTop, shore };
}

function titleIsland(): PixelCanvas {
  const rng = new RNG(4242);
  const c = new PixelCanvas(320, 96);
  for (let x = 0; x < 320; x++) {
    const { top, sandTop, shore } = titleIslandProfile(x);
    for (let y = top; y < 96; y++) {
      let col: string;
      if (y < sandTop) {
        const d = y - top;
        const v = -d / 42 + dither(x, y) * 0.35;
        col = d === 0 ? 'g' : v > -0.15 ? 'G' : v > -0.6 ? 'H' : 'T';
      } else if (y < shore) {
        col = y === sandTop && sandTop > top ? 'H' : y === top ? 'S' : dither(x, y) > 0.3 ? 's' : 'S';
      } else if (y === shore || (y === shore + 1 && (x + y) % 3 === 0)) {
        col = 'W';
      } else break;
      c.set(x, y, col);
    }
    if (sandTop - top > 6 && rng.chance(0.08)) c.set(x, top + rng.int(3, Math.min(30, sandTop - top - 2)), rng.pick(['R', 'Y', 'W', 'u']));
    else rng.next();
  }
  return c;
}

function moon(): PixelCanvas {
  const c = new PixelCanvas(24, 24);
  c.blob(12, 12, 10.5, 10.5, ['Y', 'y', 'y', 'W']);
  c.blob(8, 9, 2, 2, ['N', 'Y', 'Y']);
  c.blob(15, 15, 2.5, 2, ['N', 'Y', 'Y']);
  c.blob(14, 7, 1.2, 1.2, ['N', 'Y']);
  return c;
}

/** ตัวเลข pixel 3×5 สำหรับดาเมจลอย */
const DIGITS: Record<string, string[]> = {
  '0': ['WWW', 'W.W', 'W.W', 'W.W', 'WWW'],
  '1': ['.W.', 'WW.', '.W.', '.W.', 'WWW'],
  '2': ['WWW', '..W', 'WWW', 'W..', 'WWW'],
  '3': ['WWW', '..W', '.WW', '..W', 'WWW'],
  '4': ['W.W', 'W.W', 'WWW', '..W', '..W'],
  '5': ['WWW', 'W..', 'WWW', '..W', 'WWW'],
  '6': ['WWW', 'W..', 'WWW', 'W.W', 'WWW'],
  '7': ['WWW', '..W', '.W.', '.W.', '.W.'],
  '8': ['WWW', 'W.W', 'WWW', 'W.W', 'WWW'],
  '9': ['WWW', 'W.W', 'WWW', '..W', 'WWW'],
  '+': ['...', '.W.', 'WWW', '.W.', '...'],
  '!': ['.W.', '.W.', '.W.', '...', '.W.'],
};

export function buildUiTextures(scene: Phaser.Scene) {
  addScaled(scene, 'ui_panel', panel('#1c1f33', '#22263d', ['N', 'M', 'm']));
  addScaled(scene, 'ui_panel_dark', panel('#121426', '#171a2e', ['D', 'F', 'O']));
  addScaled(scene, 'ui_btn', button('N', 'M', 'm', 'N'));
  addScaled(scene, 'ui_btn_hover', button('y', 'r', 'R', 'Y'));
  addScaled(scene, 'ui_btn_off', button('D', 'F', 'O', 'D'));
  addScaled(scene, 'ui_slot', slot('F', 'D'));
  addScaled(scene, 'ui_slot_sel', slot('Y', 'y'));
  addScaled(scene, 'ui_bar', barFrame());
  addScaled(scene, 'ui_paper', paper());
  addScaled(scene, 'moon', moon(), 3);
  addScaled(scene, 'title_island', titleIsland(), 3);
  sky(scene);

  // ตัวเลขดาเมจ (มีเส้นขอบ) — 1 texture ต่อ 1 ตัวอักษร
  for (const [ch, rows] of Object.entries(DIGITS)) {
    const pc = new PixelCanvas(5, 7).rows(rows, 1, 1).outline('O', true);
    const key = `digit_${ch}`;
    const tex = scene.textures.createCanvas(key, 5, 7)!;
    pc.draw(tex.getContext());
    tex.refresh();
  }
}
