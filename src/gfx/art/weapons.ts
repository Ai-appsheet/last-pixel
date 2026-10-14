import { RNG } from '../../core/RNG';
import { PixelCanvas } from '../PixelCanvas';

/**
 * ไอคอนอาวุธชุดขยาย (16×16) + กระสุนเวท/ลูกปราย
 * ทุกอาวุธแนวทแยง: ด้ามซ้ายล่าง → ปลายขวาบน · สีตามวัสดุ (ไม้ หิน กระดูก เหล็ก ทอง คริสตัล อุกกาบาต …)
 */
type Sh = [string, string, string, string]; // เงา · กลาง · สว่าง · ไฮไลต์

const MAT = {
  wood: ['m', 'M', 'N', 'S'],
  stone: ['F', 'D', 'L', 'w'],
  bone: ['s', 'S', 'w', 'W'],
  iron: ['D', 'L', 'w', 'W'],
  steel: ['F', 'D', 'L', 'W'],
  gold: ['#a0662a', '#e0a040', 'Y', 'y'],
  crystal: ['U', 'B', 'b', 'C'],
  amethyst: ['P', 'u', '#c9a6ef', 'W'],
  meteor: ['#2e1236', 'P', 'R', 'r'],
  frost: ['B', 'b', 'C', 'W'],
  fire: ['R', 'r', 'Y', 'y'],
  venom: ['T', 'G', 'g', 'y'],
  shadow: ['#100f1c', '#262b44', 'P', 'u'],
  crab: ['#7a2633', 'R', 'r', 'Y'],
  void: ['#100f1c', 'P', 'u', 'W'],
} satisfies Record<string, Sh>;

const pc = (w = 16, h = 16) => new PixelCanvas(w, h);

function glow(c: PixelCanvas, color: string, pts: [number, number][]) {
  for (const [x, y] of pts) if (!c.get(x, y)) c.set(x, y, color);
}

/** สะท้อนซ้าย-ขวา */
function mirror(src: PixelCanvas, into: PixelCanvas) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const p = src.get(x, y);
    if (p) into.set(15 - x, y, p);
  }
  return into;
}

/** ใบมีดแนวทแยง เริ่ม (x0,y0) ไปขวาบน — ขอบบนซ้ายสว่าง ขอบล่างขวาเงา */
function diagBlade(c: PixelCanvas, x0: number, y0: number, len: number, sh: Sh, width = 1) {
  for (let i = 0; i < len; i++) for (let w = 0; w <= width; w++) c.set(x0 + i + w, y0 - i, w === 0 ? sh[2] : w === width ? sh[0] : sh[1]);
  c.set(x0 + len, y0 - len, sh[3]);
  if (len > 4) c.set(x0 + 2, y0 - 2, sh[3]);
}

interface BladeOpt {
  len: number;
  width?: number;
  x?: number;
  y?: number;
  guard?: string;
  g?: number;
  grip?: string;
  wrap?: string;
  gripLen?: number;
  pommel?: string;
}

/** อาวุธมีคม: ใบ + กระบัง + ด้าม + ปุ่มท้าย */
function bladed(sh: Sh, o: BladeOpt) {
  const c = pc();
  const x0 = o.x ?? 5;
  const y0 = o.y ?? 10;
  const width = o.width ?? 1;
  diagBlade(c, x0, y0, o.len, sh, width);
  const gx = x0 - 1;
  const gy = y0 + 1;
  const g = o.g ?? 2;
  const hw = width > 1 ? 1 : 0;
  if (o.guard) {
    c.line(gx - g + hw, gy - g, gx + g + hw, gy + g, o.guard);
    if (width > 1) c.line(gx - g + hw + 1, gy - g, gx + g + hw, gy + g - 1, o.guard);
  }
  const n = o.gripLen ?? 2;
  for (let k = 1; k <= n; k++) c.set(gx - k + hw, gy + k, o.wrap && k % 2 === 0 ? o.wrap : o.grip ?? 'M');
  if (o.pommel) c.set(gx - n - 1 + hw, gy + n + 1, o.pommel);
  return c;
}

const sword = (sh: Sh, guard = 'Y', grip = 'M', pommel = 'Y') => bladed(sh, { len: 9, guard, grip, pommel });
const dagger = (sh: Sh, guard = 'D', grip = 'M', pommel?: string) => bladed(sh, { len: 5, x: 7, y: 8, g: 1, guard, grip, gripLen: 3, pommel });
const greatsword = (sh: Sh, guard = 'Y', grip = 'm', pommel = 'Y') => bladed(sh, { len: 9, width: 2, x: 4, y: 10, g: 2, guard, grip, wrap: 'M', gripLen: 2, pommel });

/** ขวานรบสองคม */
function battleaxe(head: Sh, haft = 'M', double = true) {
  const c = pc();
  c.blob(7.5, 4.5, 3.4, 3.4, head);
  if (double) c.blob(12.5, 9.5, 2.8, 2.8, head);
  c.line(2, 14, 12, 4, haft);
  c.line(3, 14, 12, 5, 'm');
  c.rect(9, 6, 2, 2, head[0]);
  c.set(9, 6, head[2]);
  c.set(2, 14, 'N');
  return c;
}

/** กระบอง/ตะบอง/ค้อน */
function mace(head: Sh, haft = 'M', o: { spikes?: string; hammer?: boolean; club?: boolean } = {}) {
  const c = pc();
  if (o.club) {
    for (let i = 0; i <= 8; i++) c.ellipse(3 + i, 13 - i, 0.7 + i * 0.28, 0.7 + i * 0.28, i < 3 ? 'm' : 'M');
    c.blob(10.5, 5.5, 3.2, 3.2, head);
  } else if (o.hammer) {
    c.line(2, 14, 9, 7, haft);
    c.line(7, 2, 13, 8, head[1], 3);
    c.line(7, 2, 12, 7, head[2]);
    c.line(8, 4, 14, 10, head[0]);
    c.set(9, 3, head[3]);
    c.set(10, 6, head[0]);
  } else {
    c.line(2, 14, 9, 7, haft);
    c.line(3, 14, 9, 8, 'm');
    c.blob(11, 5, 3.4, 3.4, head);
  }
  if (o.spikes) {
    const sp: [number, number][] = o.club ? [[10, 1], [14, 4], [13, 8], [7, 4], [8, 8]] : [[11, 0], [15, 5], [7, 3], [14, 1], [8, 8], [14, 9]];
    for (const [x, y] of sp) c.set(x, y, o.spikes);
  }
  c.set(2, 14, 'N');
  c.set(3, 13, 'N');
  return c;
}

/** หอก (ตรีศูล/ง้าว/พู่) */
function spear(head: Sh, haft = 'M', o: { trident?: boolean; halberd?: Sh; tassel?: string; len?: number } = {}) {
  const c = pc();
  c.line(1, 15, 10, 6, haft);
  c.set(2, 14, haft === 'M' ? 'N' : haft);
  if (o.trident) {
    c.line(8, 4, 12, 8, head[0]);
    c.line(8, 4, 11, 1, head[2]);
    c.line(12, 8, 15, 5, head[1]);
    diagBlade(c, 10, 5, 4, head, 1);
  } else diagBlade(c, 10, 5, o.len ?? 4, head, 1);
  if (o.halberd) c.blob(12.5, 7.5, 2.6, 2.4, o.halberd);
  c.set(10, 6, head[0]);
  c.set(9, 7, head[0]);
  if (o.tassel) {
    c.set(8, 8, o.tassel);
    c.set(8, 9, o.tassel);
    c.set(7, 9, o.tassel);
  }
  return c;
}

/** เคียว */
function scythe(blade: Sh, haft = 'M') {
  const c = pc();
  c.line(3, 15, 9, 2, haft);
  for (let a = 0; a <= 9; a++) {
    const x = 10 - a;
    const y = 2 + Math.round((a / 9) ** 2 * 5);
    c.set(x, y, a < 2 ? blade[3] : blade[2]);
    c.set(x, y + 1, blade[1]);
    if (a > 1 && a < 7) c.set(x, y + 2, blade[0]);
  }
  c.set(9, 2, 'F');
  c.set(10, 2, 'F');
  return c;
}

/** แส้ขด */
function whip(cord: string, dark: string, handle = 'M', tip?: string) {
  const c = pc();
  for (let a = 0; a < Math.PI * 2; a += 0.12) {
    c.set(9 + Math.cos(a) * 4.6, 7 + Math.sin(a) * 4, Math.sin(a) > 0.2 ? dark : cord);
  }
  for (let a = 0; a < Math.PI * 2; a += 0.15) c.set(9.5 + Math.cos(a) * 2.8, 7.5 + Math.sin(a) * 2.3, dark);
  c.line(13, 9, 14, 14, cord);
  c.set(14, 14, tip ?? cord);
  c.set(15, 15, tip ?? dark);
  c.line(5, 10, 3, 12, cord);
  c.line(3, 12, 1, 14, handle);
  c.line(2, 12, 1, 13, handle);
  c.set(1, 15, 'Y');
  return c;
}

/** สนับมือ 4 ห่วง */
function knuckles(sh: Sh, gem?: string) {
  const c = pc();
  for (let i = 0; i < 4; i++) {
    c.rect(1 + i * 3 + 1, 4, 3, 4, sh[1]);
    c.set(2 + i * 3, 4, sh[2]);
    c.set(3 + i * 3, 4, sh[3]);
  }
  c.rect(2, 8, 12, 2, sh[1]);
  c.rect(2, 8, 12, 1, sh[2]);
  c.rect(4, 10, 8, 2, sh[0]);
  c.rect(5, 12, 6, 1, sh[0]);
  for (let i = 0; i < 4; i++) {
    c.set(3 + i * 3, 5, null);
    c.set(3 + i * 3, 6, null);
  }
  if (gem) {
    c.set(7, 8, gem);
    c.set(8, 8, gem);
  }
  return c;
}

/** ธนู (สั้น/ยาว/รีเคิร์ฟ) */
function bow(limb: Sh, o: { rx?: number; ry?: number; string?: string; grip?: string; recurve?: boolean; cx?: number } = {}) {
  const c = pc();
  const cx = o.cx ?? 5;
  const rx = o.rx ?? 7;
  const ry = o.ry ?? 7;
  for (let a = -1.25; a <= 1.25; a += 0.05) {
    c.set(cx + Math.cos(a) * rx, 8 + Math.sin(a) * ry, limb[1]);
    if (Math.abs(a) < 1.1) c.set(cx + Math.cos(a) * (rx - 1), 8 + Math.sin(a) * (ry - 1), Math.abs(a) < 0.35 ? limb[0] : limb[2]);
  }
  const top = 8 - Math.round(Math.sin(1.25) * ry);
  const sx = Math.round(cx + Math.cos(1.25) * rx);
  c.line(sx, top, sx, 16 - top, o.string ?? 'W');
  if (o.recurve) {
    c.set(sx - 1, top - 1, limb[2]);
    c.set(sx - 1, 17 - top, limb[2]);
  }
  if (o.grip) for (let y = 7; y <= 9; y++) c.set(cx + rx, y, o.grip);
  return c;
}

/** หน้าไม้ */
function crossbow(prod: Sh, o: { heavy?: boolean; repeater?: boolean; stock?: Sh } = {}) {
  const c = pc();
  const st = o.stock ?? MAT.wood;
  c.rect(7, 4, 2, 11, st[1]);
  c.rect(7, 4, 1, 11, st[2]);
  c.rect(7, 13, 2, 2, st[0]);
  for (let x = 1; x <= 14; x++) {
    const y = 5 + Math.round(((x - 7.5) / 6.5) ** 2 * 2);
    c.set(x, y, x < 7 ? prod[2] : prod[1]);
    c.set(x, y - 1, x < 7 ? prod[3] : prod[2]);
    if (o.heavy) c.set(x, y + 1, prod[0]);
  }
  c.line(1, 8, 7, 10, 'W');
  c.line(14, 8, 8, 10, 'W');
  c.rect(7, 1, 1, 9, 'N');
  c.set(7, 1, 'W');
  if (o.heavy) {
    c.blob(10, 12, 1.8, 1.8, ['F', 'D', 'L', 'W']);
    c.set(10, 12, 'O');
  }
  if (o.repeater) {
    c.rect(5, 0, 5, 3, st[1]);
    c.rect(5, 0, 5, 1, st[2]);
    c.set(7, 1, 'Y');
    c.blob(10.5, 11.5, 2, 2, ['F', 'D', 'L', 'W']);
  }
  return c;
}

/** ไม้เท้าเวท: ด้าม + กรงเล็บ + ลูกแก้วธาตุ */
function staff(orb: Sh, haft = 'M', claw = 'Y') {
  const c = pc();
  c.line(2, 15, 9, 8, haft);
  c.line(3, 15, 9, 9, 'm');
  c.blob(11.5, 4.5, 3.2, 3.2, orb);
  c.set(8, 7, claw);
  c.set(8, 6, claw);
  c.set(9, 8, claw);
  c.set(10, 8, claw);
  c.set(2, 15, 'N');
  return c;
}

/** ไม้กายสิทธิ์สั้น: ด้าม + ปลายเรืองแสง */
function wand(haft: string, tip: [string, string]) {
  const c = pc();
  c.line(3, 14, 12, 5, haft);
  c.line(4, 14, 12, 6, haft);
  c.blob(13, 3.5, 1.8, 1.8, [tip[0], tip[0], tip[1]]);
  c.set(13, 3, 'W');
  return c;
}

/** คัมภีร์เวท (หันหน้าปก): ปก + สันเข้ม + ขอบกระดาษ + ตราตรงกลาง */
function tome(cover: Sh, emblem: string) {
  const c = pc();
  c.rect(3, 3, 10, 11, cover[1]);
  c.rect(3, 3, 10, 1, cover[2]);
  c.rect(3, 3, 2, 11, cover[0]);
  c.line(12, 4, 12, 13, 'W');
  c.line(13, 5, 13, 13, 'w');
  c.blob(8.5, 8, 2, 2, [emblem, emblem, cover[3]]);
  c.rect(5, 12, 7, 1, cover[0]);
  return c;
}

/** ลูกแก้วเวท: ลูกแก้วใหญ่บนฐานกรงเล็บ */
function orb(sh: Sh, base: string) {
  const c = pc();
  c.blob(8, 7, 5, 5, sh);
  c.set(6, 4, 'W');
  c.set(5, 5, 'W');
  c.rect(5, 12, 7, 2, base);
  c.rect(4, 14, 9, 1, base);
  c.set(4, 11, base);
  c.set(12, 11, base);
  return c;
}

/** ระเบิดลูกกลม */
function bomb(body: Sh, cap = 'D') {
  const c = pc();
  c.blob(7, 10, 5, 5, body);
  c.set(5, 7, 'W');
  c.rect(9, 4, 3, 2, cap);
  c.line(11, 3, 13, 2, 'S');
  return c;
}

const spark = (c: PixelCanvas, col = 'Y') => {
  for (const [x, y, k] of [[14, 1, col], [15, 0, 'y'], [14, 0, 'r'], [15, 2, 'r'], [13, 0, col]] as [number, number, string][]) c.set(x, y, k);
};

export function weaponIcons(): Record<string, PixelCanvas> {
  const out: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  // ---------- มีดสั้น ----------
  out.i_stone_dagger = dagger(MAT.stone, 'm', 'M').outline();
  out.i_bone_dagger = dagger(MAT.bone, 'S', 'M', 's').outline();
  out.i_iron_dagger = dagger(MAT.iron, 'D', 'm', 'D').outline();
  c = dagger(MAT.venom, 'P', 'F', 'g');
  c.set(9, 6, 'y');
  out.i_venom_dagger = c.outline();
  glow(out.i_venom_dagger, 'g', [[14, 1], [13, 4]]);
  out.i_crystal_dagger = dagger(MAT.amethyst, 'Y', 'U', 'C').outline();
  glow(out.i_crystal_dagger, 'C', [[14, 2], [11, 1]]);

  // ---------- ดาบ ----------
  out.i_bone_sword = sword(MAT.bone, 'S', 'M', 's').outline();
  out.i_katana = bladed(['D', 'L', 'W', 'W'], { len: 9, guard: 'Y', g: 1, grip: 'F', wrap: 'R', gripLen: 3 }).outline();
  out.i_frost_sword = sword(MAT.frost, 'C', 'U', 'C').outline();
  glow(out.i_frost_sword, 'C', [[15, 0], [12, 0], [15, 4]]);

  // ---------- ดาบสองมือ ----------
  out.i_iron_greatsword = greatsword(MAT.iron, 'D').outline();
  out.i_gold_greatsword = greatsword(MAT.gold, 'R', 'm', 'R').outline();
  out.i_meteor_greatsword = greatsword(MAT.meteor, 'Y', 'F', 'r').outline();
  glow(out.i_meteor_greatsword, 'r', [[15, 1], [10, 0], [15, 6]]);

  // ---------- ขวานรบ ----------
  out.i_stone_battleaxe = battleaxe(MAT.stone).outline();
  out.i_iron_battleaxe = battleaxe(MAT.iron).outline();
  c = battleaxe(MAT.crab, 'M', false);
  c.set(6, 3, 'Y');
  c.set(7, 2, 'y');
  out.i_crab_cleaver = c.outline();
  out.i_crystal_battleaxe = battleaxe(MAT.crystal, 'U').outline();
  glow(out.i_crystal_battleaxe, 'C', [[3, 1], [15, 6]]);

  // ---------- ค้อน/กระบอง ----------
  out.i_wood_club = mace(MAT.wood, 'M', { club: true }).outline();
  out.i_spiked_club = mace(MAT.wood, 'M', { club: true, spikes: 'W' }).outline();
  out.i_iron_mace = mace(MAT.iron, 'M', { spikes: 'L' }).outline();
  out.i_gold_warhammer = mace(MAT.gold, 'm', { hammer: true }).outline();
  c = mace(MAT.meteor, 'F', { hammer: true });
  c.set(10, 5, 'Y');
  c.set(11, 6, 'r');
  out.i_meteor_maul = c.outline();
  glow(out.i_meteor_maul, 'r', [[15, 3], [5, 0], [15, 12]]);

  // ---------- หอก ----------
  out.i_bone_spear = spear(MAT.bone, 'M', { tassel: 'R' }).outline();
  out.i_gold_trident = spear(MAT.gold, 'm', { trident: true }).outline();
  out.i_crystal_halberd = spear(MAT.crystal, 'U', { halberd: MAT.amethyst }).outline();
  out.i_meteor_lance = spear(MAT.meteor, 'F', { len: 5, tassel: 'Y' }).outline();
  glow(out.i_meteor_lance, 'r', [[15, 3], [12, 0]]);

  // ---------- เคียว ----------
  c = pc();
  for (let a = Math.PI; a <= Math.PI * 2.05; a += 0.08) {
    c.set(9 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, 'L');
    c.set(9 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, a < Math.PI * 1.5 ? 'W' : 'D');
  }
  c.line(4, 9, 2, 14, 'M');
  c.line(5, 9, 3, 14, 'm');
  out.i_sickle = c.outline();
  out.i_iron_scythe = scythe(MAT.iron).outline();
  out.i_shadow_scythe = scythe(MAT.shadow, 'F').outline();
  glow(out.i_shadow_scythe, 'u', [[0, 6], [2, 1], [12, 0]]);

  // ---------- แส้ ----------
  out.i_rope_whip = whip('S', 's', 'M').outline();
  out.i_leather_whip = whip('M', 'm', 'n').outline();
  out.i_chain_whip = whip('L', 'D', 'F', 'W').outline();
  out.i_fire_whip = whip('r', 'R', 'F', 'Y').outline();
  glow(out.i_fire_whip, 'Y', [[15, 13], [13, 1]]);

  // ---------- สนับมือ ----------
  c = pc(); // ผ้าพันมือมวยไทย
  c.rect(3, 5, 10, 8, 'W');
  for (const x of [4, 7, 10]) c.rect(x, 4, 2, 1, 'W');
  c.rect(3, 7, 10, 1, 'L');
  c.rect(3, 10, 10, 1, 'L');
  c.line(3, 12, 12, 12, 'R');
  c.line(3, 13, 12, 13, 'r');
  c.rect(12, 6, 2, 4, 'w');
  out.i_hand_wraps = c.outline();
  c = pc(); // กรงเล็บกระดูก
  c.rect(3, 10, 10, 4, 'M');
  c.rect(3, 10, 10, 1, 'N');
  for (const [x0, x1] of [[4, 6], [7, 9], [10, 12]]) {
    c.line(x0, 10, x1, 2, 'W');
    c.line(x0 + 1, 10, x1, 4, 's');
  }
  out.i_bone_claws = c.outline();
  out.i_iron_knuckles = knuckles(MAT.iron).outline();
  out.i_crystal_knuckles = knuckles(MAT.amethyst, 'C').outline();
  glow(out.i_crystal_knuckles, 'C', [[15, 3], [0, 4]]);

  // ---------- ธนู ----------
  out.i_short_bow = bow(MAT.wood, { rx: 5, ry: 5, cx: 6 }).outline();
  out.i_long_bow = bow(MAT.wood, { rx: 6, ry: 7.4, cx: 4, grip: 'R' }).outline();
  out.i_composite_bow = bow(MAT.bone, { rx: 6.5, ry: 7, cx: 4, grip: 'M', recurve: true }).outline();
  out.i_frost_bow = bow(MAT.frost, { rx: 6.5, ry: 7, cx: 4, grip: 'U', string: 'C', recurve: true }).outline();
  glow(out.i_frost_bow, 'C', [[15, 2], [15, 13], [0, 8]]);

  // ---------- หน้าไม้ ----------
  out.i_heavy_crossbow = crossbow(MAT.steel, { heavy: true }).outline();
  out.i_repeater_crossbow = crossbow(MAT.iron, { repeater: true }).outline();

  // ---------- ปืน ----------
  c = pc(); // ปืนพกลูกโม่
  c.rect(7, 5, 8, 2, 'D');
  c.rect(7, 5, 8, 1, 'L');
  c.set(14, 4, 'D');
  c.rect(4, 4, 4, 4, 'F');
  c.rect(4, 4, 4, 1, 'D');
  c.set(5, 6, 'L');
  c.set(6, 6, 'L');
  for (const [x, y] of [[3, 8], [3, 9], [2, 10], [2, 11], [1, 12], [4, 8], [4, 9], [3, 10], [3, 11], [2, 12]] as [number, number][]) c.set(x, y, x < 3 || y < 9 ? 'N' : 'M');
  c.line(5, 8, 7, 8, 'D');
  c.set(7, 9, 'D');
  c.set(3, 3, 'D');
  out.i_revolver = c.outline();

  c = pc(); // ปืนลูกซอง
  c.rect(5, 4, 10, 1, 'L');
  c.rect(5, 5, 10, 1, 'D');
  c.rect(8, 6, 4, 2, 'M');
  c.rect(8, 6, 4, 1, 'N');
  c.rect(1, 5, 5, 3, 'M');
  c.rect(1, 5, 5, 1, 'N');
  c.rect(1, 8, 2, 3, 'M');
  c.set(5, 7, 'D');
  c.set(6, 8, 'D');
  c.set(14, 3, 'F');
  out.i_shotgun = c.outline();

  c = pc(); // ปืนไรเฟิล
  c.rect(6, 6, 9, 1, 'D');
  c.rect(6, 7, 6, 1, 'F');
  c.rect(6, 3, 5, 2, 'F');
  c.set(10, 3, 'C');
  c.set(6, 3, 'b');
  c.rect(7, 5, 1, 1, 'D');
  c.rect(9, 5, 1, 1, 'D');
  c.rect(1, 6, 5, 2, 'M');
  c.rect(1, 6, 5, 1, 'N');
  c.rect(1, 8, 3, 2, 'M');
  c.set(6, 8, 'D');
  c.set(15, 6, 'L');
  out.i_rifle = c.outline();

  c = pc(); // หนังสติ๊ก
  c.line(8, 15, 8, 9, 'M');
  c.line(9, 15, 9, 10, 'm');
  c.line(8, 9, 4, 3, 'M');
  c.line(9, 9, 12, 3, 'M');
  c.line(4, 4, 8, 7, 'R');
  c.line(8, 7, 12, 4, 'R');
  c.rect(7, 6, 3, 2, 'L');
  c.set(7, 6, 'W');
  out.i_slingshot = c.outline();

  // ---------- บูมเมอแรง/จักร ----------
  c = pc();
  c.line(2, 5, 8, 11, 'M', 2);
  c.line(8, 11, 14, 5, 'M', 2);
  c.line(2, 4, 8, 10, 'N');
  c.line(8, 10, 13, 5, 'N');
  for (const [x, y] of [[4, 7], [12, 7]] as [number, number][]) c.set(x, y, 'R');
  out.i_wood_boomerang = c.outline();
  c = pc();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (d <= 6.5 && d >= 3.4) c.set(x, y, d > 5.6 ? (x + y < 15 ? 'W' : 'L') : x + y < 16 ? 'L' : 'D');
  }
  c.set(8, 1, 'W');
  c.set(14, 8, 'W');
  c.set(1, 7, 'W');
  c.set(7, 14, 'W');
  c.rect(7, 3, 2, 1, 'Y');
  out.i_chakram = c.outline();

  // ---------- ไม้เท้าเวทธาตุ ----------
  out.i_fire_staff = staff(MAT.fire).outline();
  glow(out.i_fire_staff, 'r', [[15, 1], [8, 0], [15, 7]]);
  out.i_frost_staff = staff(MAT.frost, 'M', 'W').outline();
  glow(out.i_frost_staff, 'C', [[15, 1], [8, 0], [15, 7]]);
  c = staff(['U', 'B', 'C', 'W'], 'F', 'L');
  for (const [x, y] of [[12, 2], [11, 3], [12, 4], [11, 5], [12, 6]] as [number, number][]) c.set(x, y, 'Y');
  out.i_lightning_staff = c.outline();
  glow(out.i_lightning_staff, 'y', [[15, 0], [7, 1], [15, 7], [9, 10]]);
  out.i_poison_staff = staff(MAT.venom, 'm', 'S').outline();
  glow(out.i_poison_staff, 'g', [[15, 1], [8, 0]]);

  // ---------- ของขว้าง ----------
  c = pc(); // ระเบิดขวดเพลิง
  c.rect(5, 7, 6, 7, 'T');
  c.rect(5, 7, 1, 7, 'G');
  c.rect(6, 10, 4, 3, 'r');
  c.rect(6, 4, 4, 3, 'T');
  c.rect(7, 2, 2, 2, 'S');
  c.set(6, 8, 'w');
  out.i_molotov = c.outline();
  for (const [x, y, k] of [[7, 0, 'Y'], [8, 0, 'r'], [9, 1, 'Y'], [6, 1, 'r'], [8, 1, 'y']] as [number, number, string][]) out.i_molotov.set(x, y, k);
  c = bomb(MAT.frost, 'L');
  for (const [x, y] of [[7, 8], [7, 9], [7, 10], [7, 11], [7, 12], [5, 10], [6, 10], [8, 10], [9, 10]] as [number, number][]) c.set(x, y, 'W');
  out.i_ice_bomb = c.outline();
  spark(out.i_ice_bomb, 'C');
  c = bomb(MAT.stone, 'F');
  out.i_smoke_bomb = c.outline();
  for (const [x, y, k] of [[13, 1, 'L'], [14, 0, 'w'], [15, 1, 'L'], [14, 2, 'D'], [12, 0, 'w']] as [number, number, string][]) out.i_smoke_bomb.set(x, y, k);
  c = bomb(['#a0662a', 'Y', 'y', 'W'], 'L');
  c.set(7, 10, 'W');
  out.i_flash_bomb = c.outline();
  glow(out.i_flash_bomb, 'y', [[1, 4], [13, 8], [1, 14]]);
  spark(out.i_flash_bomb, 'W');
  c = bomb(MAT.venom, 'F');
  c.set(6, 9, 'O');
  c.set(8, 9, 'O');
  c.rect(6, 11, 3, 1, 'W');
  out.i_poison_bomb = c.outline();
  spark(out.i_poison_bomb, 'g');
  c = pc(); // ระเบิดลูกปราย
  c.blob(5, 11, 3.2, 3.2, ['O', 'F', 'D', 'L']);
  c.blob(11, 11, 3.2, 3.2, ['O', 'F', 'D', 'L']);
  c.blob(8, 6, 3.2, 3.2, ['O', 'F', 'D', 'L']);
  c.rect(8, 2, 2, 1, 'R');
  c.line(9, 1, 11, 0, 'S');
  for (const [x, y] of [[4, 10], [10, 10], [7, 5]] as [number, number][]) c.set(x, y, 'W');
  out.i_cluster_bomb = c.outline();
  c = pc(); // มีดบิน (คุไน)
  diagBlade(c, 7, 8, 5, MAT.steel, 1);
  c.line(6, 9, 4, 11, 'F');
  for (const [x, y] of [[2, 12], [3, 12], [2, 13], [4, 13], [3, 14], [4, 14], [2, 14]] as [number, number][]) c.set(x, y, 'D');
  c.set(3, 13, null);
  c.set(5, 10, 'R');
  out.i_throwing_knife = c.outline();
  c = pc(); // ดาวกระจาย
  for (let i = 0; i < 6; i++) {
    const w = i < 2 ? 1 : 0;
    c.rect(8 - w, 2 + i, 1 + w * 2, 1, i < 3 ? 'W' : 'L');
    c.rect(8 - w, 14 - i, 1 + w * 2, 1, 'D');
    c.rect(2 + i, 8 - w, 1, 1 + w * 2, 'L');
    c.rect(14 - i, 8 - w, 1, 1 + w * 2, 'D');
  }
  c.rect(6, 6, 5, 5, 'L');
  c.rect(6, 6, 5, 1, 'W');
  c.set(8, 8, null);
  out.i_shuriken = c.outline();
  c = pc(); // หอกซัด
  c.line(1, 15, 12, 4, 'N');
  c.line(2, 15, 12, 5, 'M');
  diagBlade(c, 12, 3, 2, MAT.iron, 1);
  c.set(1, 13, 'W');
  c.set(3, 15, 'W');
  c.set(2, 12, 'R');
  c.set(4, 15, 'R');
  out.i_javelin = c.outline();

  // ---------- กระสุนใหม่ ----------
  c = pc(); // ลูกซอง
  for (const [x, y] of [[3, 5], [9, 3]] as [number, number][]) {
    c.rect(x, y, 4, 7, 'R');
    c.rect(x, y, 1, 7, 'r');
    c.rect(x, y + 7, 4, 2, 'Y');
    c.rect(x, y + 7, 1, 2, 'y');
    c.rect(x + 1, y - 1, 2, 1, 'R');
  }
  out.i_shell = c.outline();
  c = pc(); // กระสุนไรเฟิล
  for (const x of [2, 7, 12]) {
    const y = x === 7 ? 2 : 4;
    c.rect(x, y + 2, 2, 8, 'Y');
    c.rect(x, y + 2, 1, 8, 'y');
    c.rect(x, y, 2, 2, 'L');
    c.set(x, y - 1, 'W');
    c.rect(x, y + 9, 2, 1, '#a0662a');
  }
  out.i_rifle_round = c.outline();

  // ---------- อาวุธเทพชุดใหม่ ----------
  out.i_glacier_greatsword = greatsword(MAT.frost, 'C', 'U', 'W').outline();
  glow(out.i_glacier_greatsword, 'C', [[15, 0], [11, 0], [15, 5], [9, 2]]);
  glow(out.i_glacier_greatsword, 'W', [[14, 6], [8, 0]]);

  c = spear(['#a0662a', 'Y', 'y', 'W'], 'T', { len: 5 });
  for (const [x, y] of [[3, 12], [4, 12], [5, 10], [6, 10], [7, 8], [8, 8]] as [number, number][]) c.set(x, y, 'G');
  c.set(8, 7, 'R');
  out.i_naga_spear = c.outline();
  glow(out.i_naga_spear, 'g', [[15, 4], [12, 0], [10, 2]]);

  c = dagger(MAT.meteor, 'Y', 'F', 'u');
  const twin = mirror(c, pc());
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!c.get(x, y) && twin.get(x, y)) c.set(x, y, twin.get(x, y));
  out.i_rahu_fangs = c.outline();
  glow(out.i_rahu_fangs, 'r', [[8, 0], [0, 6], [15, 6]]);

  c = bow(MAT.gold, { rx: 6.5, ry: 7, cx: 4, grip: 'R', string: 'y', recurve: true });
  for (const [x, y, k] of [[6, 0, 'R'], [7, 1, 'r'], [5, 0, 'Y'], [6, 15, 'R'], [7, 14, 'r'], [5, 15, 'Y']] as [number, number, string][]) c.set(x, y, k);
  out.i_garuda_bow = c.outline();
  glow(out.i_garuda_bow, 'y', [[15, 1], [15, 14], [1, 8]]);

  c = staff(MAT.void, 'F', 'u');
  for (let a = 0; a < Math.PI; a += 0.15) c.set(11.5 + Math.cos(a) * 4.6, 4.5 + Math.sin(a) * 1.6, 'u'); // วงแหวนด้านหน้า
  out.i_void_staff = c.outline();
  glow(out.i_void_staff, 'u', [[15, 0], [7, 0], [15, 9]]);

  c = pc(); // ปืนมังกรเพลิง
  c.rect(4, 5, 8, 2, '#e0a040');
  c.rect(4, 5, 8, 1, 'Y');
  c.rect(11, 3, 4, 5, 'R');
  c.rect(11, 3, 4, 1, 'r');
  c.set(14, 4, 'Y');
  c.set(15, 6, 'Y');
  c.set(12, 2, 'r');
  c.rect(7, 7, 3, 2, 'R');
  c.rect(1, 5, 4, 3, 'M');
  c.rect(1, 8, 2, 3, 'M');
  c.rect(1, 5, 4, 1, 'N');
  out.i_dragon_cannon = c.outline();
  glow(out.i_dragon_cannon, 'r', [[15, 8], [15, 9]]);
  glow(out.i_dragon_cannon, 'Y', [[15, 5], [14, 9], [13, 1]]);

  // ---------- อาวุธเวทชุดใหม่ (ไม้กายสิทธิ์ · ไม้เท้าธาตุ · คัมภีร์ · ลูกแก้ว) ----------
  c = wand('M', ['g', 'y']);
  c.line(2, 15, 4, 13, 'N');
  c.set(3, 13, 'S');
  out.i_apprentice_wand = c.outline();
  glow(out.i_apprentice_wand, 'y', [[14, 0], [15, 2], [11, 1]]);
  c = staff(['U', 'B', 'b', 'C'], 'M', 'w');
  c.set(11, 5, 'W');
  c.set(12, 5, 'w');
  out.i_water_staff = c.outline();
  glow(out.i_water_staff, 'C', [[15, 2], [8, 1], [15, 8]]);
  c = staff(['T', 'G', 'g', 'W'], 'N', 'W');
  for (const [x, y] of [[6, 8], [5, 9], [7, 7]] as [number, number][]) c.set(x, y, 'W');
  out.i_wind_staff = c.outline();
  glow(out.i_wind_staff, 'g', [[15, 3], [9, 0], [14, 9]]);
  out.i_earth_staff = staff(['m', 'M', 'N', 'S'], 'D', 'L').outline();
  glow(out.i_earth_staff, 'N', [[15, 1], [8, 2]]);
  c = tome(['#7a2633', 'R', 'r', 'Y'], 'Y');
  c.set(8, 2, 'Y');
  c.set(9, 1, 'r');
  c.set(7, 1, 'r');
  out.i_fire_tome = c.outline();
  glow(out.i_fire_tome, 'Y', [[8, 0], [10, 0]]);
  c = staff(['#a0662a', 'Y', 'y', 'W'], 'W', 'Y');
  out.i_holy_staff = c.outline();
  glow(out.i_holy_staff, 'y', [[15, 0], [11, 0], [7, 3], [15, 5], [8, 0], [15, 9]]);
  c = staff(['#7a2633', 'R', 'r', 'p'], 'S', 'W');
  c.set(7, 9, 'W');
  c.set(5, 11, 'W');
  out.i_blood_staff = c.outline();
  glow(out.i_blood_staff, 'R', [[15, 1], [8, 1], [15, 8]]);
  c = tome(['#100f1c', 'P', 'u', 'W'], 'u');
  c.line(6, 7, 8, 10, 'u');
  c.line(9, 7, 10, 10, 'u');
  out.i_abyss_tome = c.outline();
  glow(out.i_abyss_tome, 'u', [[13, 2], [2, 3], [14, 13]]);
  c = wand('#e0a040', ['C', 'y']);
  for (let i = 0; i < 9; i += 2) c.set(4 + i, 12 - i, 'W');
  out.i_storm_wand = c.outline();
  glow(out.i_storm_wand, 'y', [[15, 0], [12, 0], [15, 3]]);
  out.i_glacier_orb = orb(MAT.frost, 'L').outline('U');
  glow(out.i_glacier_orb, 'C', [[1, 2], [14, 1], [15, 6]]);
  c = orb(['V', 'G', 'g', 'y'], 'D');
  for (let a = 0; a < Math.PI; a += 0.2) c.set(8 + Math.cos(a) * 6.4, 7 + Math.sin(a) * 1.8, 'L');
  out.i_gaia_orb = c.outline();
  glow(out.i_gaia_orb, 'g', [[1, 3], [14, 2]]);
  // อาวุธเวทเทพ
  c = pc();
  c.line(2, 15, 9, 8, '#e0a040');
  c.line(3, 15, 9, 9, '#a0662a');
  for (let t = 0; t <= 1; t += 0.1) c.ellipse(9 + Math.sin(t * 5) * 1.2 + t * 2, 8 - t * 6, 1.3, 1.3, 'G');
  c.blob(12.5, 2.5, 2.4, 2, ['V', 'H', 'G', 'g']);
  c.line(10, 1, 15, 1, 'Y');
  c.set(13, 2, 'R');
  c.blob(14, 6, 1.4, 1.4, ['B', 'b', 'C']);
  out.i_naga_staff = c.outline();
  glow(out.i_naga_staff, 'Y', [[11, 0], [15, 0], [15, 8]]);
  c = tome(MAT.gold, 'R');
  c.line(4, 6, 0, 3, 'R', 2);
  c.line(12, 6, 15, 3, 'R', 2);
  c.set(0, 2, 'r');
  c.set(15, 2, 'r');
  out.i_garuda_tome = c.outline();
  glow(out.i_garuda_tome, 'y', [[8, 0], [1, 9], [15, 9]]);
  c = orb(MAT.fire, '#e0a040');
  c.line(3, 3, 6, 1, 'Y');
  c.line(13, 3, 10, 1, 'Y');
  out.i_phoenix_orb = c.outline('#7a2633');
  glow(out.i_phoenix_orb, 'r', [[8, 0], [1, 6], [15, 6]]);

  // ---------- กระสุนเวท/ลูกปราย (ชี้ไปทางขวา) ----------
  c = pc(9, 5);
  c.line(1, 2, 7, 2, 'C');
  c.line(2, 1, 5, 1, 'W');
  c.line(2, 3, 5, 3, 'b');
  out.proj_ice = c.outline('B');
  c = pc(10, 7);
  for (const [x, y] of [[1, 3], [2, 2], [3, 2], [4, 3], [5, 4], [6, 4], [7, 3], [8, 2]] as [number, number][]) c.set(x, y, 'W');
  for (const [x, y] of [[2, 3], [3, 3], [5, 3], [6, 3], [7, 2]] as [number, number][]) c.set(x, y, 'Y');
  out.proj_spark = c.outline('y');
  c = pc(7, 7);
  c.blob(3.5, 3.5, 2.5, 2.5, ['G', 'G', 'g', 'y']);
  out.proj_poison = c.outline('T');
  c = pc(9, 9);
  c.blob(4.5, 4.5, 3.4, 3.4, ['#100f1c', 'P', 'u', 'W']);
  out.proj_void = c.outline('u');
  c = pc(4, 4);
  c.rect(1, 1, 2, 2, 'Y');
  c.set(1, 1, 'W');
  out.proj_pellet = c.outline('r');
  c = pc(6, 6);
  c.blob(3, 3, 2, 2, ['D', 'D', 'L', 'W']);
  out.proj_stone = c.outline();
  // กระสุนเวทชุดใหม่ (อาวุธผู้เล่น + กระสุนของสัตว์)
  c = pc(9, 5);
  c.line(1, 2, 7, 2, 'u');
  c.line(4, 1, 7, 1, '#c9a6ef');
  c.set(7, 2, 'W');
  out.proj_arcane = c.outline('P');
  c = pc(8, 7);
  c.blob(4.5, 3.5, 2.8, 2.4, ['B', 'b', 'C', 'W']);
  c.set(1, 3, 'C');
  out.proj_water = c.outline('U');
  c = pc(9, 9);
  for (let a = -1.2; a <= 1.2; a += 0.15) c.set(3 + Math.cos(a) * 4, 4.5 + Math.sin(a) * 4, a > -0.4 && a < 0.4 ? 'W' : 'w');
  for (let a = -0.9; a <= 0.9; a += 0.2) c.set(2 + Math.cos(a) * 4, 4.5 + Math.sin(a) * 3, 'g');
  out.proj_wind = c.outline('T');
  c = pc(9, 9);
  c.blob(4.5, 4.5, 3.4, 3.2, ['F', 'D', 'L', 'w'], new RNG(77), 0.3);
  out.proj_rock = c.outline();
  c = pc(10, 5);
  c.line(1, 2, 8, 2, 'Y');
  c.line(3, 1, 7, 1, 'y');
  c.line(3, 3, 7, 3, '#e0a040');
  c.set(8, 2, 'W');
  out.proj_holy = c.outline('#a0662a');
  c = pc(8, 7);
  c.blob(4.5, 3.5, 2.6, 2.3, ['#7a2633', 'R', 'r', 'p']);
  c.set(1, 3, 'R');
  out.proj_blood = c.outline('#3d0f1c');
  c = pc(8, 7);
  c.blob(4.5, 3.5, 2.6, 2.3, ['#100f1c', 'P', 'u', 'W']);
  c.set(1, 2, 'P');
  c.set(1, 4, 'P');
  out.proj_shadow = c.outline('#100f1c');
  c = pc(11, 5);
  c.line(1, 2, 9, 2, 'Y');
  for (let x = 2; x <= 8; x++) {
    c.set(x, 1, x > 5 ? 'r' : 'R');
    c.set(x, 3, x > 5 ? 'Y' : 'r');
  }
  out.proj_feather = c.outline('#7a2633');
  c = pc(10, 10);
  c.blob(5, 5, 3.6, 3.6, ['B', 'b', 'C', 'W']);
  c.set(4, 3, 'W');
  out.proj_frost_orb = c.outline('U');
  c = pc(11, 7);
  c.line(1, 4, 6, 3, 'G', 2);
  c.blob(8, 3, 2.2, 1.8, ['V', 'H', 'G', 'g']);
  c.set(9, 2, 'Y');
  out.proj_naga = c.outline('V');
  c = pc(7, 7);
  c.blob(3.5, 3.5, 2.5, 2.5, ['#100f1c', 'F', 'P', 'u']);
  out.proj_ink = c.outline('#100f1c');
  c = pc(10, 10);
  c.blob(5, 5, 3.6, 3.6, ['V', 'G', 'g', 'y']);
  c.set(4, 3, 'W');
  out.proj_jade = c.outline('V');
  return out;
}
