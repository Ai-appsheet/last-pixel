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

/**
 * วาดสี่เหลี่ยมมุมมน w×h รัศมี r — เรียก color(level, x, y) โดย level = ความลึกจากขอบ (0 = เส้นนอกสุด) · คืน null = โปร่ง
 * ใช้ทำกรอบ/ปุ่ม/ช่องให้มุมมนนุ่มๆ แบบชิบิ (ขยาย ×2 แล้วยังเป็นพิกเซล)
 */
function rounded(w: number, h: number, r: number, color: (level: number, x: number, y: number) => string | null): PixelCanvas {
  const c = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const qx = Math.abs(x + 0.5 - w / 2) - (w / 2 - r);
      const qy = Math.abs(y + 0.5 - h / 2) - (h / 2 - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      const depth = -outside;
      if (depth <= 0.2) continue;
      const col = color(Math.floor(depth - 0.2), x, y);
      if (col) c.set(x, y, col);
    }
  }
  return c;
}

/** กรอบหน้าต่าง: เส้นนอกเข้ม + ขอบสองโทน (สว่างบน-ซ้าย / เข้มล่าง-ขวา) + แสงในจางๆ + พื้นมืด */
function panel(fill: string, fill2: string, light: string, dark: string, outline = 'O'): PixelCanvas {
  const S = 16;
  return rounded(S, S, 4.5, (lv, x, y) => {
    if (lv === 0) return outline;
    if (lv === 1) return y < 4 || x < 4 ? light : dark;
    if (lv === 2) return y < 4 ? light : outline;
    if (lv === 3) return y < 5 ? 'rgba(255,255,255,0.14)' : dither(x, y) > 0.3 ? fill2 : fill;
    return dither(x, y) > 0.3 ? fill2 : fill;
  });
}

/** ปุ่ม: ไล่สีบน→ล่าง + ขอบบนสว่าง + ริมล่างหนา (3D) + เส้นนอกเข้ม */
function button(top: string, mid: string, bottom: string, lip: string): PixelCanvas {
  const S = 12;
  return rounded(S, S, 3.5, (lv, _x, y) => {
    if (lv === 0) return 'O';
    if (y >= S - 3) return lip;
    if (lv === 1 && y <= 2) return 'y';
    if (y <= 3) return top;
    if (y <= 6) return mid;
    return bottom;
  });
}

function slot(border: string, light: string, fill: string): PixelCanvas {
  return rounded(12, 12, 3, (lv, x, y) => {
    if (lv === 0) return border;
    if (lv === 1) return x <= 1 || y <= 1 ? light : 'rgba(0,0,0,0.4)';
    return fill;
  });
}

function barFrame(): PixelCanvas {
  return rounded(8, 8, 3.2, (lv) => (lv === 0 ? 'O' : lv === 1 ? 'F' : '#0b0d1f'));
}

/** ไอคอนแถบเครื่องมือ 14×14 (เส้นขอบ 1px + ประกาย 1px) → ขยาย ×2 */
const TOOL_ICONS: Record<string, string[]> = {
  bag: [
    '....MMMM......', '...M....M.....', '..MNNNNNNM....', '.MNNNNNNNNM...', '.MNrrrrrrNM...', '.MNNNYYNNNM...', '.MNNNYYNNNM...',
    '.MNNNNNNNNM...', '.MMNNNNNNMM...', '.MmmmmmmmmM...', '..MMMMMMMM....', '..............', '..............', '..............',
  ],
  blueprint: [
    '..............', '.BBBBBBBBBBB..', '.BUUUUUUUUUB..', '.BUCUUUUUCUB..', '.BUUCCCCCUUB..', '.BUUCUUUCUUB..', '.BUUCUUUCUUB..',
    '.BUUCCCCCUUB..', '.BUUUUUUUUUB..', '.BUCUCUCUCUB..', '.BBBBBBBBBBB..', '..............', '..............', '..............',
  ],
  upgrade: [
    '......YY......', '.....YyyY.....', '....YyyyyY....', '...YyyyyyyY...', '..YyyyyyyyyY..', '.YYYYyyyyYYYY.', '....YyyyyY....',
    '....YyyyyY....', '....YyyyyY....', '....YYYYYY....', '....GggggG....', '....GGGGGG....', '..............', '..............',
  ],
  book: [
    '..............', '.RRRRR.RRRRR..', '.RWWWWRWWWWR..', '.RWLLWRWLLWR..', '.RWWWWRWWWWR..', '.RWLLWRWLLWR..', '.RWWWWRWWWWR..',
    '.RWLLWRWLLWR..', '.RWWWWRWWWWR..', '.RWWWWRWWWWR..', '.RRRRRRRRRRR..', '..RRRRRRRRR...', '..............', '..............',
  ],
  map: [
    '..............', '.SSSS.SSSS.SS.', '.SsSSSSSsSSSS.', '.SSSGGSSSSsSS.', '.SSGGGGSSSSSS.', '.SSSGGSbbSSSS.', '.SSSSSbbbbSSS.',
    '.SSSSSSbbSSSS.', '.SsSSSSSSSSsS.', '.SSSSSRSSSSSS.', '.SSSSSSSSSSSS.', '.SS.SSSS.SSSS.', '..............', '..............',
  ],
  shirt: [
    '..............', '..CC.....CC...', '.CCCC...CCCC..', 'CCCCCCCCCCCCC.', 'CCCCCCCCCCCCC.', 'CCCwCCCCCwCCC.', '.CCCCCCCCCCC..',
    '..CCCCCCCCC...', '..CCCCCCCCC...', '..CCCCCCCCC...', '..CCCCCCCCC...', '..CCCCCCCCC...', '..............', '..............',
  ],
  robot: [
    '......W.......', '.....LLL......', '..LLLLLLLLL...', '.LLLLLLLLLLL..', '.LLCCLLLCCLL..', '.LLCCLLLCCLL..', '.LLLLLLLLLLL..',
    '.LLLRRRRRLLL..', '.LLLLLLLLLLL..', '..LLLLLLLLL...', '....DD.DD.....', '....DD.DD.....', '..............', '..............',
  ],
  camera: [
    '..............', '...LLLL.......', '.DDDDDDDDDD...', '.DLDDDDDDDD...', '.DDDWWWDDDD...', '.DDWCCCWDDD...', '.DDWCCCWDDD...',
    '.DDDWWWDDDD...', '.DDDDDDDDDD...', '.DDDDDDDDDDLL.', '.DDDDDDDDDDLL.', '..............', '..............', '..............',
  ],
  zoomIn: [
    '..............', '...WWWWW......', '..WwwwwwW.....', '.WwwwgwwwW....', '.Wwwwgwwww....', '.WwgggggwW....', '.Wwwwgwwww....',
    '.WwwwgwwwW....', '..WwwwwwWW....', '...WWWWW.WW...', '..........WW..', '...........W..', '..............', '..............',
  ],
  zoomOut: [
    '..............', '...WWWWW......', '..WwwwwwW.....', '.WwwwwwwwW....', '.Wwwwwwwww....', '.WwRRRRRwW....', '.Wwwwwwwww....',
    '.WwwwwwwwW....', '..WwwwwwWW....', '...WWWWW.WW...', '..........WW..', '...........W..', '..............', '..............',
  ],
  sound: [
    '..............', '.....LL.......', '....LLL..C....', '.LLLLLL.C.C...', '.LLLLLLC.C.C..', '.LLLLLLC.C.C..', '.LLLLLLC.C.C..',
    '.LLLLLL.C.C...', '....LLL..C....', '.....LL.......', '..............', '..............', '..............', '..............',
  ],
  mute: [
    '..............', '.....LL.......', '....LLL.......', '.LLLLLL.R..R..', '.LLLLLL..RR...', '.LLLLLL..RR...', '.LLLLLL.R..R..',
    '.LLLLLL.......', '....LLL.......', '.....LL.......', '..............', '..............', '..............', '..............',
  ],
  gear: [
    '.....LLL......', '..L..LwL..L...', '.LLLLLLLLLL...', '..LLwwwwLL....', '.LLwLLLLwLL...', 'LLLwL..LwLLL..', 'LwLwL..LwLwL..',
    'LLLwL..LwLLL..', '.LLwLLLLwLL...', '..LLwwwwLL....', '.LLLLLLLLLL...', '..L..LLL..L...', '.....LLL......', '..............',
  ],
};
export const TOOL_ICON_KEYS = Object.keys(TOOL_ICONS);

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
  // หน้าต่าง = ขอบครีม/ทอง · HUD = ขอบฟ้าทะเล (พื้นมืดอมน้ำเงินทั้งคู่ ให้ตัวหนังสือสว่างอ่านง่าย)
  addScaled(scene, 'ui_panel', panel('#1d2242', '#222850', 'y', 'N', '#2a1f3a'));
  addScaled(scene, 'ui_panel_dark', panel('rgba(16,22,46,0.93)', 'rgba(20,27,54,0.93)', 'C', 'B', '#0b0d1f'));
  addScaled(scene, 'ui_btn', button('C', 'b', 'B', 'U'));
  addScaled(scene, 'ui_btn_hover', button('y', 'Y', '#f0a050', '#c2602e'));
  addScaled(scene, 'ui_btn_off', button('L', 'D', 'F', '#1d2238'));
  addScaled(scene, 'ui_slot', slot('#0b0d1f', 'L', 'rgba(14,16,30,0.82)'));
  addScaled(scene, 'ui_slot_sel', slot('Y', 'y', 'rgba(70,52,24,0.7)'));
  addScaled(scene, 'ui_bar', barFrame());
  for (const [name, rows] of Object.entries(TOOL_ICONS)) {
    addScaled(scene, `tb_${name}`, new PixelCanvas(16, 16).rows(rows, 1, 1).outline('O', true));
  }
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
