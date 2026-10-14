import { PixelCanvas } from '../PixelCanvas';

const pc = () => new PixelCanvas(16, 16);

/** ใบมีดแนวทแยง (ด้าม ซ้ายล่าง → ปลาย ขวาบน) */
function blade(c: PixelCanvas, len: number, colors: [string, string, string], width = 1) {
  for (let i = 0; i < len; i++) {
    for (let w = 0; w <= width; w++) c.set(4 + i + w, 11 - i, w === 0 ? colors[0] : w === width ? colors[2] : colors[1]);
  }
}

function glowDots(c: PixelCanvas, color: string, pts: [number, number][]) {
  for (const [x, y] of pts) if (!c.get(x, y)) c.set(x, y, color);
}

/** ไอคอนอาวุธเทพ หินตีบวก กล่องของ และปลาทอง */
export function itemIcons3(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(); // ดาบเทพสายฟ้า
  blade(c, 10, ['W', 'C', 'b'], 2);
  c.line(2, 9, 7, 14, 'Y');
  c.line(3, 13, 1, 15, 'U');
  c.outline();
  glowDots(c, 'y', [[13, 0], [15, 3], [10, 1], [15, 6]]);
  c.line(12, 2, 14, 0, 'y');
  out.i_thunder_blade = c;

  c = pc(); // ขวานเทพอัคคี
  c.line(3, 14, 11, 4, 'm', 1);
  c.blob(11, 5, 4, 4, ['R', 'r', 'Y', 'y']);
  c.set(13, 2, 'y');
  c.outline();
  glowDots(c, 'r', [[15, 1], [14, 9], [9, 0]]);
  out.i_inferno_axe = c;

  c = pc(); // เคียวยมทูต
  c.line(4, 15, 10, 2, 'F', 1);
  for (let a = 0; a < 9; a++) c.set(10 - a + Math.round(Math.sin(a / 3) * 2), 2 + Math.round(a * 0.35), a < 3 ? 'W' : 'P');
  for (let a = 0; a < 8; a++) c.set(9 - a + Math.round(Math.sin(a / 3) * 2), 3 + Math.round(a * 0.35), 'R');
  c.outline();
  out.i_vampire_scythe = c;

  c = pc(); // ค้อนเทพธอร์
  c.line(4, 15, 9, 7, 'M', 1);
  c.rect(6, 1, 9, 6, 'L');
  c.rect(6, 1, 9, 1, 'W');
  c.rect(6, 6, 9, 1, 'D');
  c.rect(9, 2, 3, 4, 'C');
  c.outline();
  glowDots(c, 'y', [[3, 2], [15, 9], [4, 6]]);
  out.i_thor_hammer = c;

  c = pc(); // ธนูเทพพิรุณ
  for (let a = -1.3; a <= 1.3; a += 0.07) c.set(5 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 'b');
  for (let a = -1.2; a <= 1.2; a += 0.15) c.set(5 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 'C');
  c.line(10, 1, 10, 15, 'W');
  c.line(3, 8, 14, 8, 'Y');
  c.outline();
  out.i_storm_bow = c;

  c = pc(); // คทาจักรวาล
  c.line(3, 15, 9, 6, 'U', 1);
  c.blob(11, 4, 3.5, 3.5, ['P', 'u', 'C', 'W']);
  c.outline();
  glowDots(c, 'y', [[15, 1], [7, 1], [15, 7], [8, 8]]);
  out.i_cosmic_staff = c;

  c = pc(); // หินตีบวก
  c.blob(8, 9, 5.5, 5, ['U', 'B', 'b', 'C']);
  c.line(6, 7, 10, 11, 'C');
  c.set(8, 9, 'W');
  c.outline();
  out.i_enhance_stone = c;

  c = pc(); // เครื่องรางนำโชค
  c.ellipse(8, 9, 4.5, 4.5, 'R');
  c.ellipse(8, 9, 3, 3, 'Y');
  c.set(8, 9, 'W');
  c.line(8, 2, 8, 4, 'N');
  c.line(6, 2, 10, 2, 'N');
  c.outline();
  out.i_lucky_charm = c;

  c = pc(); // ใบกันแตก
  c.rect(3, 4, 10, 9, 'S');
  c.rect(3, 4, 10, 1, 'N');
  c.rect(3, 12, 10, 1, 'N');
  c.blob(8, 8, 2.5, 2.5, ['B', 'b', 'C']);
  c.outline();
  out.i_protect_scroll = c;

  c = pc(); // ปลาทอง
  c.ellipse(7, 8, 5.5, 3.5, 'Y');
  c.ellipse(6, 7, 3, 1.5, 'y');
  for (let i = 0; i < 4; i++) c.line(12, 8, 15, 5 + i * 2, 'r');
  c.set(4, 7, 'O');
  c.outline();
  out.i_golden_fish = c;

  c = pc(); // เพชร
  for (let y = 0; y < 10; y++) {
    const hw = y < 3 ? 3 + y * 1.6 : 7 - (y - 3);
    for (let x = Math.round(8 - hw); x <= Math.round(8 + hw); x++) c.set(x, 3 + y, y < 3 ? (x < 8 ? 'C' : 'W') : x < 8 ? 'b' : 'B');
  }
  c.line(5, 5, 8, 12, 'C');
  c.outline();
  glowDots(c, 'W', [[2, 2], [13, 1]]);
  out.i_gem = c;

  // กล่อง 4 ระดับ (ใช้ทั้งเป็นไอคอนและวางบนพื้น)
  const box = (wood: [string, string, string], band: string, gem: string, glow?: string) => {
    const b = new PixelCanvas(16, 16);
    b.shadow(8, 14.5, 7, 1.5);
    b.rect(2, 6, 12, 8, wood[1]);
    b.rect(2, 6, 12, 1, wood[0]);
    b.rect(2, 13, 12, 1, wood[2]);
    b.rect(1, 3, 14, 4, wood[0]);
    b.rect(1, 6, 14, 1, wood[2]);
    for (const x of [3, 12]) b.rect(x, 3, 1, 11, band);
    b.rect(7, 5, 2, 4, band);
    b.set(7, 6, gem);
    b.set(8, 6, gem);
    b.outline();
    if (glow) glowDots(b, glow, [[0, 1], [15, 2], [1, 10], [15, 11], [8, 0]]);
    return b;
  };
  out.box_wood = box(['N', 'M', 'm'], 'm', 'D');
  out.box_iron = box(['L', 'D', 'F'], 'W', 'b');
  out.box_gold = box(['y', 'Y', 'r'], 'W', 'R', 'y');
  out.box_legend = box(['W', 'C', 'b'], 'w', 'B', 'C'); // กล่องเพชร (ฟ้าใส/ขาว)
  return out;
}
