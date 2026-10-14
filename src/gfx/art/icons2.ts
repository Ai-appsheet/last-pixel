import { RNG } from '../../core/RNG';
import { PixelCanvas, dither } from '../PixelCanvas';

const pc = () => new PixelCanvas(16, 16);

/** ดาบแนวทแยง (สไตล์เดียวกับ icons.ts) */
function sword(blade: string, edge: string, guard: string, tip = 'W', grip = 'M'): PixelCanvas {
  const o = pc();
  for (let i = 0; i < 10; i++) {
    o.set(4 + i, 11 - i, blade);
    o.set(5 + i, 11 - i, edge);
  }
  o.set(14, 1, tip);
  o.line(2, 10, 6, 14, guard);
  o.line(3, 13, 1, 15, grip);
  o.set(2, 14, 'm');
  return o;
}

/** เสื้อเกราะ (สไตล์เดียวกับ icons.ts) */
function armor(body: string, shade: string, trim: string): PixelCanvas {
  const o = pc();
  for (let y = 3; y <= 13; y++) {
    for (let x = 3; x <= 12; x++) {
      const shoulder = y < 6 && (x < 5 || x > 10);
      const neck = y < 5 && x > 5 && x < 10;
      if (neck || (y > 6 && (x < 4 || x > 11))) continue;
      o.set(x, y, shoulder ? trim : x > 9 ? shade : body);
    }
  }
  o.line(5, 7, 10, 7, trim);
  return o;
}

/** ปลา (หันซ้าย) */
function fish(shades: string[], fin: string, belly: string): PixelCanvas {
  const o = pc();
  for (let y = 4; y <= 12; y++) {
    const hw = Math.round(Math.abs(y - 8) * 0.8);
    for (let x = 11; x <= 14; x++) if (x - 11 >= hw - 1 && x - 11 <= hw + 1) o.set(x, y, fin);
  }
  o.blob(7, 8, 5.5, 3.3, shades);
  o.line(4, 10, 9, 10, belly);
  o.set(6, 4, fin);
  o.set(7, 4, fin);
  o.set(8, 5, fin);
  o.set(4, 7, 'W');
  o.set(3, 7, 'O');
  o.set(2, 9, shades[0]);
  return o;
}

/** ไอคอนไอเทมชุดที่ 2 (16×16) */
export function itemIcons2(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(); // ถ่านหิน
  {
    const rng = new RNG(901);
    c.blob(7, 9, 5.5, 4.5, ['O', 'F', 'F', 'D'], rng, 0.3);
    c.blob(11.5, 11, 2.6, 2.2, ['O', 'F', 'D'], rng, 0.2);
    for (const [x, y] of [[5, 7], [8, 6], [11, 10], [6, 10]]) c.set(x, y, 'L');
    c.set(5, 6, 'W');
    c.set(9, 9, 'D');
  }
  out.i_coal = c.outline();

  c = pc(); // กำมะถัน
  c.blob(8, 12, 6, 2.6, ['s', 'S', 'S']);
  for (const [cx, h] of [[5, 7], [9, 10], [12, 6]]) {
    for (let y = 0; y < h; y++) {
      const hw = y < 2 ? y : Math.min(2, Math.floor((h - y) / 2) + 1);
      for (let x = -hw; x <= hw; x++) c.set(cx + x, 13 - h + y, x < 0 ? 'y' : x === 0 ? 'Y' : 'r');
    }
  }
  c.set(8, 5, 'W');
  out.i_sulfur = c.outline();

  c = pc(); // ดินปืน (ถุงผ้า)
  c.blob(8, 10, 5, 4.3, ['F', 'D', 'D', 'L']);
  c.rect(6, 3, 4, 3, 'D');
  c.rect(6, 3, 1, 3, 'L');
  c.rect(5, 5, 6, 1, 'N');
  c.set(10, 6, 'N');
  c.set(11, 7, 'M');
  c.rect(6, 9, 4, 4, 'S');
  c.set(7, 10, 'r');
  c.set(8, 9, 'r');
  c.set(7, 11, 'Y');
  c.set(8, 11, 'r');
  c.set(8, 10, 'Y');
  c.rect(6, 12, 4, 1, 's');
  for (const [x, y] of [[2, 14], [3, 15], [13, 14], [1, 13]]) c.set(x, y, 'F');
  out.i_gunpowder = c.outline();

  c = pc(); // เฟือง
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8;
      const dy = y + 0.5 - 8;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d > 6.6 || (d > 5 && Math.cos(a * 8) < 0.15) || d < 1.9) continue;
      const v = -(dx * 0.55 + dy * 0.8) / 6 + dither(x, y) * 0.3 + (d < 3.2 ? -0.2 : 0);
      c.set(x, y, v > 0.45 ? 'W' : v > 0 ? 'L' : v > -0.45 ? 'D' : 'F');
    }
  }
  out.i_gear = c.outline();

  c = pc(); // เครื่องยนต์เรือ
  c.rect(2, 7, 10, 6, 'D');
  c.rect(2, 7, 10, 1, 'L');
  c.rect(2, 7, 1, 6, 'L');
  c.rect(2, 12, 10, 1, 'F');
  c.rect(4, 9, 6, 1, 'R');
  for (const px of [3, 8]) {
    c.rect(px, 3, 3, 4, 'L');
    c.rect(px, 3, 1, 4, 'W');
    c.rect(px + 2, 3, 1, 4, 'D');
    c.rect(px - 1, 2, 5, 1, 'D');
    c.set(px + 1, 5, 'F');
  }
  c.rect(12, 9, 2, 2, 'F');
  c.rect(14, 7, 1, 6, 'L');
  c.set(14, 7, 'W');
  c.rect(4, 13, 2, 2, 'F');
  c.rect(9, 13, 2, 2, 'F');
  out.i_engine = c.outline();

  c = pc(); // ถังน้ำมัน
  c.rect(3, 4, 10, 11, 'R');
  c.rect(3, 4, 2, 11, 'r');
  c.rect(11, 4, 2, 11, 'P');
  c.rect(3, 14, 10, 1, 'P');
  c.line(5, 6, 10, 12, 'P');
  c.line(10, 6, 5, 12, 'P');
  c.rect(5, 8, 6, 3, 'Y');
  c.rect(6, 9, 4, 1, 'r');
  c.rect(4, 2, 5, 2, 'R');
  c.rect(5, 2, 3, 1, 'O');
  c.rect(10, 1, 2, 3, 'D');
  c.set(10, 1, 'L');
  out.i_fuel = c.outline();

  c = pc(); // อุกกาบาต
  {
    const rng = new RNG(944);
    c.blob(8, 8.5, 6, 5.5, ['O', 'F', 'P', 'D'], rng, 0.25);
    const veins: [number, number, number, number, string][] = [
      [4, 6, 8, 9, 'u'], [8, 9, 12, 7, 'r'], [7, 12, 9, 9, 'r'], [6, 4, 8, 6, 'u'],
    ];
    for (const [x0, y0, x1, y1, col] of veins) c.line(x0, y0, x1, y1, col);
    c.set(8, 9, 'Y');
    c.set(11, 8, 'Y');
    c.set(5, 6, 'p');
    c.set(4, 5, 'L');
  }
  c.outline();
  for (const [x, y, col] of [[13, 2, 'Y'], [2, 3, 'u'], [14, 13, 'r']] as [number, number, string][]) c.set(x, y, col);
  out.i_meteorite = c;

  out.i_wood_sword = sword('M', 'N', 'm', 'N', 'n').outline();

  c = sword('Y', 'y', 'R', 'W', 'M');
  c.set(6, 9, 'r');
  c.set(9, 6, 'r');
  c.set(4, 12, 'C');
  out.i_gold_sword = c.outline();

  c = sword('P', 'u', 'r', 'Y', 'F');
  for (let i = 1; i < 10; i += 3) c.set(4 + i, 11 - i, 'r');
  c.set(9, 7, 'Y');
  c.set(12, 4, 'y');
  c.outline();
  for (const [x, y, col] of [[10, 1, 'Y'], [15, 5, 'u'], [12, 0, 'r']] as [number, number, string][]) c.set(x, y, col);
  out.i_meteor_sword = c;

  c = pc(); // หอกเหล็ก
  c.line(2, 14, 10, 6, 'M');
  c.line(3, 14, 10, 7, 'm');
  c.set(2, 13, 'N');
  c.rect(9, 6, 2, 2, 'S');
  c.set(10, 7, 's');
  for (const [x, y, col] of [
    [11, 5, 'D'], [11, 4, 'L'], [12, 4, 'L'], [12, 3, 'W'], [13, 3, 'L'], [13, 2, 'W'], [14, 1, 'W'],
    [12, 5, 'D'], [13, 4, 'D'], [14, 2, 'L'], [10, 4, 'L'], [12, 6, 'D'],
  ] as [number, number, string][]) c.set(x, y, col);
  out.i_iron_spear = c.outline();

  c = pc(); // หน้าไม้
  c.rect(7, 4, 2, 11, 'M');
  c.rect(7, 4, 1, 11, 'N');
  c.rect(7, 13, 2, 2, 'm');
  for (let x = 1; x <= 14; x++) {
    const y = 5 + Math.round(((x - 7.5) / 6.5) ** 2 * 2);
    c.set(x, y, x < 7 ? 'L' : 'D');
    c.set(x, y - 1, x < 7 ? 'W' : 'L');
  }
  c.line(1, 8, 7, 10, 'W');
  c.line(14, 8, 8, 10, 'W');
  c.rect(7, 1, 1, 9, 'N');
  c.set(7, 1, 'W');
  c.set(6, 2, 'L');
  c.set(8, 2, 'L');
  c.set(9, 11, 'D');
  out.i_crossbow = c.outline();

  c = pc(); // ปืนคาบศิลา
  c.rect(5, 5, 9, 2, 'D');
  c.rect(5, 5, 9, 1, 'L');
  c.set(14, 5, 'F');
  c.set(14, 6, 'F');
  for (const x of [8, 12]) c.rect(x, 5, 1, 2, 'Y');
  const grip: [number, number, number][] = [[7, 3, 7], [8, 3, 6], [9, 2, 5], [10, 2, 5], [11, 1, 4], [12, 1, 4]];
  for (const [y, x0, x1] of grip) {
    for (let x = x0; x <= x1; x++) c.set(x, y, x === x0 ? 'N' : 'M');
  }
  c.rect(3, 6, 4, 2, 'M');
  c.rect(3, 6, 4, 1, 'N');
  c.rect(1, 13, 3, 1, 'Y');
  c.set(5, 3, 'D');
  c.set(5, 4, 'L');
  c.set(4, 3, 'F');
  c.rect(6, 8, 3, 1, 'Y');
  c.set(8, 9, 'Y');
  c.set(7, 9, 'D');
  out.i_flintlock = c.outline();

  c = pc(); // ลูกตะกั่ว
  for (const [x, y] of [[5, 11], [11, 11], [8, 6]]) c.blob(x, y, 2.8, 2.8, ['F', 'D', 'L', 'W']);
  out.i_bullet = c.outline();

  c = pc(); // ไม้เท้าคริสตัล
  c.line(2, 15, 10, 7, 'M');
  c.line(3, 15, 10, 8, 'm');
  c.set(2, 14, 'N');
  c.set(10, 6, 'N');
  c.set(9, 5, 'N');
  c.set(12, 8, 'm');
  c.set(11, 8, 'M');
  for (const [x, y, col] of [
    [12, 2, 'W'], [11, 3, 'W'], [12, 3, 'C'], [13, 3, 'b'], [10, 4, 'C'], [11, 4, 'C'], [12, 4, 'b'],
    [13, 4, 'u'], [11, 5, 'b'], [12, 5, 'u'], [13, 2, 'C'], [14, 3, 'u'], [12, 6, 'P'], [11, 6, 'u'],
  ] as [number, number, string][]) c.set(x, y, col);
  c.outline();
  for (const [x, y, col] of [[15, 1, 'C'], [9, 1, 'W'], [15, 7, 'u']] as [number, number, string][]) c.set(x, y, col);
  out.i_crystal_staff = c;

  c = pc(); // ระเบิด
  c.blob(7, 10, 5, 5, ['O', 'F', 'D', 'L']);
  c.set(5, 7, 'W');
  c.rect(9, 4, 3, 2, 'D');
  c.set(9, 4, 'L');
  c.line(11, 3, 13, 2, 'S');
  c.set(11, 3, 's');
  c.outline();
  for (const [x, y, col] of [[14, 1, 'Y'], [15, 0, 'y'], [14, 0, 'r'], [15, 2, 'r'], [13, 0, 'Y']] as [number, number, string][]) c.set(x, y, col);
  out.i_bomb = c;

  c = armor('P', 'F', 'u');
  for (const [x, y, col] of [[6, 9, 'r'], [7, 10, 'Y'], [8, 11, 'r'], [9, 9, 'r'], [5, 12, 'r']] as [number, number, string][]) c.set(x, y, col);
  out.i_meteor_armor = c.outline();

  c = armor('Y', 'r', 'y');
  c.set(7, 9, 'R');
  c.set(8, 9, 'p');
  c.set(5, 11, 'y');
  c.line(5, 12, 10, 12, 'r');
  out.i_gold_armor = c.outline();

  c = pc(); // พายเรือ
  c.line(2, 14, 9, 7, 'N');
  c.line(3, 14, 9, 8, 'M');
  c.line(1, 13, 3, 15, 'm');
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 11.8;
      const dy = y + 0.5 - 4.2;
      const u = (dx - dy) / Math.SQRT2;
      const v = (dx + dy) / Math.SQRT2;
      if ((u / 4.4) ** 2 + (v / 2.3) ** 2 > 1) continue;
      c.set(x, y, Math.abs(v) < 0.5 ? 'M' : v < 0 ? 'N' : 'M');
    }
  }
  c.set(11, 3, 'S');
  c.set(12, 2, 'S');
  out.i_boat_paddle = c.outline();

  out.i_fish = fish(['U', 'B', 'b', 'C'], 'B', 'w').outline();

  c = fish(['m', 'M', 'N', 'Y'], 'm', 'N');
  c.set(4, 7, 'n');
  c.set(3, 7, 'n');
  for (const x of [6, 9]) c.line(x, 6, x - 2, 10, 'n');
  out.i_cooked_fish = c.outline();

  c = pc(); // คันเบ็ด
  c.line(2, 14, 12, 2, 'M');
  c.line(3, 14, 4, 13, 'm');
  c.rect(2, 12, 2, 2, 'm');
  c.set(13, 1, 'N');
  c.blob(5.5, 11.5, 1.6, 1.6, ['F', 'D', 'L']);
  c.outline();
  c.line(13, 2, 14, 10, 'W');
  c.set(14, 11, 'R');
  c.set(14, 12, 'W');
  c.set(13, 13, 'L');
  out.i_fishing_rod = c;

  c = pc(); // พิมพ์เขียว (ม้วน)
  c.rect(5, 4, 9, 8, 'b');
  for (let x = 6; x <= 13; x += 2) for (let y = 5; y <= 11; y += 2) c.set(x, y, 'B');
  c.rect(7, 6, 4, 3, 'W');
  c.rect(8, 7, 2, 1, 'b');
  c.line(7, 10, 12, 10, 'C');
  c.set(12, 6, 'C');
  c.rect(13, 4, 1, 8, 'B');
  for (let y = 3; y <= 13; y++) {
    c.set(2, y, 'C');
    c.set(3, y, 'b');
    c.set(4, y, 'B');
  }
  c.rect(2, 7, 3, 2, 'R');
  c.set(2, 7, 'r');
  out.i_blueprint = c.outline();

  c = pc(); // เจลสไลม์
  c.blob(8, 10, 5.5, 4.3, ['T', 'G', 'g', 'y']);
  c.blob(9, 6.5, 2.5, 2, ['G', 'g', 'y']);
  c.set(6, 15, 'G');
  c.set(6, 14, 'G');
  c.set(5, 8, 'W');
  c.set(10, 11, 'g');
  c.set(11, 12, 'W');
  out.i_slime_gel = c.outline();

  c = pc(); // ปีกค้างคาว
  for (let x = 2; x <= 14; x++) {
    const top = Math.round(4 + (x - 2) * 0.2);
    const bottom = 9 + Math.round(4 * Math.abs(Math.cos(((x - 2) * Math.PI) / 4)));
    for (let y = top; y <= bottom; y++) c.set(x, y, y - top < 2 ? 'u' : dither(x, y) > 0.3 ? 'P' : 'P');
  }
  c.line(2, 4, 14, 6, 'F');
  for (const [x0, y0] of [[6, 5], [10, 6]]) c.line(x0, y0, x0, 13, 'F');
  c.line(14, 6, 14, 13, 'F');
  c.set(2, 3, 'W');
  c.set(1, 3, 'L');
  out.i_bat_wing = c.outline();

  c = pc(); // กระดองปู
  for (const [x0, y0, x1, y1] of [[2, 9, 0, 11], [2, 11, 1, 13], [13, 9, 15, 11], [13, 11, 14, 13]]) c.line(x0, y0, x1, y1, 'P');
  c.blob(8, 9, 6.2, 4.4, ['P', 'R', 'r', 'Y']);
  // ขอบหน้าหยัก + ตา
  for (const x of [3, 5, 10, 12]) c.set(x, 4 + (x === 3 || x === 12 ? 1 : 0), 'R');
  c.rect(6, 3, 1, 2, 'R');
  c.rect(9, 3, 1, 2, 'R');
  c.set(6, 3, 'O');
  c.set(9, 3, 'O');
  c.line(4, 10, 7, 12, 'P');
  c.line(12, 10, 9, 12, 'P');
  c.set(8, 9, 'P');
  c.set(5, 7, 'W');
  c.set(6, 7, 'y');
  c.set(10, 8, 'Y');
  out.i_crab_shell = c.outline();

  c = pc(); // เขาปีศาจ
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const x = (1 - t) ** 2 * 6 + 2 * (1 - t) * t * 1.5 + t * t * 13.5;
    const y = (1 - t) ** 2 * 13 + 2 * (1 - t) * t * 2.5 + t * t * 1.5;
    const r = 2.6 * (1 - t) + 0.45;
    const ridge = Math.floor(t * 10) % 2 === 1 && t < 0.7;
    const col = t < 0.35 ? 'F' : t < 0.65 ? 'P' : t < 0.88 ? 'R' : 'r';
    c.ellipse(x, y, r, r, ridge ? (t < 0.35 ? 'D' : 'R') : col);
  }
  c.line(3, 11, 3, 7, 'D');
  c.set(4, 5, 'u');
  c.set(13, 2, 'p');
  out.i_demon_horn = c.outline();

  c = pc(); // ขนเยติ
  {
    const rng = new RNG(977);
    c.blob(8, 9.5, 6, 4.5, ['L', 'w', 'W', 'W'], rng, 0.45);
    for (const [x0, y0, x1, y1] of [[4, 6, 3, 3], [7, 5, 7, 2], [10, 5, 11, 2], [12, 7, 14, 5]]) c.line(x0, y0, x1, y1, 'w');
    for (const [x0, y0, x1, y1] of [[5, 10, 7, 13], [9, 9, 10, 12], [11, 11, 12, 13]]) c.line(x0, y0, x1, y1, 'L');
    c.set(6, 7, 'W');
  }
  out.i_yeti_fur = c.outline();

  c = pc(); // กระดูก
  c.line(4, 11, 11, 4, 'W', 2);
  c.line(5, 12, 12, 5, 'L');
  for (const [x, y] of [[3, 11], [4, 13], [11, 3], [13, 4]]) c.blob(x, y, 1.6, 1.6, ['L', 'w', 'W']);
  c.set(5, 10, 'W');
  out.i_bone = c.outline();

  return out;
}
