import { PixelCanvas } from '../PixelCanvas';
import { RNG } from '../../core/RNG';

/**
 * ไอคอน + ทรัพยากรชุด "กิจกรรมตามเวลาจริง / เก็บได้ทุกอย่าง / สมดุลร่างกาย"
 * (ไฟล์แยก — ลงทะเบียนใน TextureFactory บรรทัดเดียว · ไม่ทับ texture ที่มีอยู่แล้ว)
 */
const pc = (w = 16, h = 16) => new PixelCanvas(w, h);

function icons(): Record<string, PixelCanvas> {
  const o: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(); // มะพร้าว
  c.blob(8, 9, 6, 6, ['m', 'M', 'N', 'N']);
  c.ellipse(8, 5, 3, 1.5, 'W').set(7, 5, 'g');
  o.i_coconut = c.outline();

  c = pc(); // มันป่า
  c.blob(8, 9, 6, 4, ['m', 'M', 'N', 'S']);
  for (const [x, y] of [[5, 8], [9, 10], [11, 8]]) c.set(x, y, 'm');
  o.i_wild_potato = c.outline();

  c = pc(); // มันเผา
  c.blob(8, 9, 6, 4, ['n', 'm', 'M', 'r']);
  c.rect(6, 7, 4, 2, 'Y');
  c.set(7, 6, 'y');
  o.i_baked_potato = c.outline();

  c = pc(); // ขนมปังแผ่น
  c.ellipse(8, 9, 7, 4, 'N').ellipse(8, 8, 6, 3, 'S');
  for (const [x, y] of [[5, 8], [8, 7], [11, 9], [7, 10]]) c.set(x, y, 'M');
  o.i_flatbread = c.outline();

  c = pc(); // มะม่วง
  c.blob(8, 9, 5, 6, ['r', 'Y', 'Y', 'y']);
  c.line(8, 3, 9, 2, 'G');
  c.set(10, 2, 'g');
  o.i_mango = c.outline();

  c = pc(); // แก้วมังกร
  c.blob(8, 9, 5, 6, ['R', 'p', 'p', 'W']);
  for (const [x, y] of [[4, 6], [12, 7], [5, 12], [11, 12], [8, 3]]) c.set(x, y, 'G');
  o.i_dragonfruit = c.outline();

  c = pc(); // สาหร่าย
  for (let i = 0; i < 3; i++) for (let y = 3; y < 15; y++) c.set(4 + i * 4 + Math.round(Math.sin(y / 2 + i) * 1.2), y, i === 1 ? 'H' : 'G');
  o.i_seaweed = c.outline();

  c = pc(); // เห็ดป่า
  c.rect(7, 9, 3, 5, 'W');
  c.ellipse(8, 7, 6, 3.5, 'N').ellipse(8, 6, 5, 2.5, 'M');
  c.set(6, 6, 'S');
  c.set(10, 5, 'S');
  o.i_wild_mushroom = c.outline();

  const bottle = (water: string, light: string) => {
    const b = pc();
    b.rect(6, 1, 4, 3, 'M');
    b.rect(4, 4, 8, 11, 'L');
    b.rect(5, 6, 6, 8, water);
    b.rect(5, 6, 1, 6, light);
    return b.outline();
  };
  o.i_dirty_water = bottle('s', 'N');
  o.i_clean_water = bottle('b', 'C');

  c = pc(); // ชาดอกไม้
  c.rect(3, 7, 9, 6, 'W').rect(4, 8, 7, 2, 'r');
  c.line(12, 8, 13, 10, 'W');
  c.set(12, 11, 'W');
  for (const [x, y] of [[6, 3], [8, 4], [10, 3]]) c.set(x, y, 'p');
  o.i_flower_tea = c.outline();

  c = pc(); // สมุนไพร
  c.line(8, 14, 8, 5, 'H');
  c.ellipse(5, 7, 3, 1.5, 'G').ellipse(11, 6, 3, 1.5, 'G').ellipse(6, 11, 3, 1.5, 'g').ellipse(10, 10, 3, 1.5, 'G');
  o.i_herb = c.outline();

  c = pc(); // ยาสมุนไพร
  c.rect(5, 2, 6, 2, 'M');
  c.blob(8, 10, 5, 5, ['T', 'H', 'G', 'g']);
  c.rect(6, 9, 4, 1, 'W').rect(7, 8, 2, 3, 'W');
  o.i_herbal_medicine = c.outline();

  c = pc(); // เศษเหล็ก
  c.rect(2, 9, 6, 4, 'D').rect(3, 9, 5, 1, 'L');
  c.line(8, 12, 13, 5, 'L', 2);
  c.rect(9, 11, 4, 3, 'F');
  c.set(10, 11, 'r');
  o.i_scrap_metal = c.outline();

  c = pc(); // ผ้าใบ
  c.rect(3, 4, 10, 9, 'S');
  for (let y = 4; y < 13; y += 2) c.line(3, y, 12, y, 's');
  c.rect(3, 4, 10, 1, 'W');
  o.i_cloth = c.outline();

  c = pc(); // เปลือกหอย
  for (let a = 0; a < 7; a++) c.line(8, 13, 3 + a * 1.7, 4 + Math.abs(a - 3) * 0.7, a % 2 ? 'p' : 'W');
  c.rect(6, 12, 5, 2, 'k');
  o.i_shell = c.outline();

  c = pc(); // กลีบดอกไม้
  for (const [x, y, col] of [[5, 6, 'p'], [10, 5, 'u'], [7, 10, 'p'], [11, 11, 'R']] as [number, number, string][]) c.ellipse(x, y, 2.5, 1.6, col);
  o.i_petals = c.outline();

  c = pc(); // เมล็ดข้าวป่า
  c.line(8, 15, 8, 4, 'N');
  for (let i = 0; i < 5; i++) {
    c.ellipse(6, 4 + i * 2, 1.5, 1, 'Y');
    c.ellipse(10, 5 + i * 2, 1.5, 1, 'Y');
  }
  o.i_wild_grain = c.outline();

  c = pc(); // ออบซิเดียน
  c.blob(8, 9, 6, 5, ['O', 'F', 'P', 'u']);
  c.line(5, 6, 8, 5, 'u');
  o.i_obsidian = c.outline();

  c = pc(); // เศษคริสตัล
  c.line(5, 13, 7, 5, 'C', 2).line(9, 13, 11, 7, 'b', 2).line(7, 13, 8, 9, 'W');
  o.i_crystal_shard = c.outline();

  c = pc(); // ก้อนน้ำแข็ง
  c.rect(3, 6, 10, 8, 'C').rect(4, 7, 3, 3, 'W').rect(10, 11, 2, 2, 'b');
  o.i_ice_shard = c.outline();
  return o;
}

/** ทรัพยากรบนแผนที่ (origin ล่างกลาง) */
function nodes(): Record<string, PixelCanvas> {
  const o: Record<string, PixelCanvas> = {};
  let c: PixelCanvas;

  c = pc(16, 18); // ถังไม้
  c.shadow(8, 16, 6, 2);
  c.blob(8, 10, 6, 7, ['m', 'M', 'N', 'N']);
  c.rect(2, 6, 12, 1, 'D').rect(2, 13, 12, 1, 'D');
  o.n_barrel = c.outline();

  c = pc(28, 18); // ซากเรือ (ไม้หัก)
  c.shadow(14, 16, 12, 2);
  c.line(2, 14, 25, 8, 'M', 3);
  c.line(4, 15, 22, 13, 'm', 2);
  c.line(16, 12, 20, 2, 'N', 2);
  c.rect(17, 3, 7, 5, 'S');
  o.n_wreckage = c.outline();

  c = pc(24, 16); // ซากปืนใหญ่
  c.shadow(12, 14, 10, 2);
  c.line(4, 10, 21, 6, 'F', 4);
  c.ellipse(21, 6, 2, 2, 'O');
  c.ellipse(8, 12, 3, 3, 'M').ellipse(8, 12, 1, 1, 'm');
  o.n_cannon = c.outline();

  c = pc(16, 12); // หอยยักษ์
  c.shadow(8, 10, 6, 2);
  c.ellipse(8, 7, 6, 4, 'p').ellipse(8, 6, 5, 2, 'W');
  c.line(8, 3, 8, 10, 'k');
  o.n_clam = c.outline();

  c = pc(16, 14); // สมุนไพร
  for (let i = 0; i < 4; i++) {
    c.line(4 + i * 3, 13, 4 + i * 3 + (i % 2 ? 1 : -1), 5 + (i % 2) * 2, 'H');
    c.ellipse(4 + i * 3, 6 + (i % 2) * 2, 2, 1.2, i % 2 ? 'g' : 'G');
  }
  o.n_herb = c.outline();

  c = pc(16, 14); // ดงดอกไม้
  const rng = new RNG(77);
  for (let i = 0; i < 6; i++) {
    const x = 3 + rng.int(0, 10);
    const y = 6 + rng.int(0, 5);
    c.line(x, 13, x, y, 'G');
    c.ellipse(x, y, 1.6, 1.4, ['p', 'u', 'Y', 'R'][i % 4]).set(x, y, 'y');
  }
  o.n_flower = c.outline();

  for (let v = 0; v < 2; v++) {
    for (const full of [true, false]) {
      c = pc(18, 20); // ต้นผลไม้หายาก
      c.shadow(9, 18, 7, 2);
      c.rect(8, 11, 2, 7, 'M');
      c.blob(9, 8, 7, 6, ['V', 'H', 'G', 'g'], new RNG(300 + v), 0.3);
      if (full) for (const [x, y] of [[5, 7], [11, 6], [8, 10], [13, 9]]) c.ellipse(x, y, 1.5, 1.5, v ? 'p' : 'Y');
      o[`fruit_bush_${full ? '' : 'empty_'}${v}`] = c.outline();
    }
  }

  c = pc(16, 16); // หินออบซิเดียน
  c.shadow(8, 14, 6, 2);
  c.blob(8, 10, 6, 5, ['O', 'F', 'P', 'u']);
  c.line(4, 8, 7, 6, 'u');
  c.set(10, 7, 'W');
  o.n_obsidian = c.outline();

  c = pc(16, 16); // ก้อนน้ำแข็ง
  c.shadow(8, 14, 6, 2);
  c.blob(8, 10, 6, 5, ['b', 'C', 'C', 'W']);
  c.line(5, 8, 7, 12, 'W');
  o.n_ice = c.outline();

  c = pc(14, 20); // เถาวัลย์
  for (let i = 0; i < 3; i++) for (let y = 2; y < 19; y++) c.set(3 + i * 4 + Math.round(Math.sin(y / 3 + i * 2) * 1.5), y, i === 1 ? 'H' : 'G');
  for (const [x, y] of [[2, 6], [8, 9], [11, 14], [5, 15]]) c.ellipse(x, y, 1.5, 1, 'g');
  o.n_vine = c.outline();
  return o;
}

export function extraArt(): Record<string, PixelCanvas> {
  return { ...icons(), ...nodes() };
}
