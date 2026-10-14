import { PixelCanvas } from '../PixelCanvas';

/** 📦 ท่าส่งของ (ร้านค้าทางไกล) 38×34: ลานไม้ + ซุ้มหลังคาลายฟ้า + เคาน์เตอร์มีพัสดุ + ลังไม้ + ธงเหลือง */
export function tradingPost(): PixelCanvas {
  const c = new PixelCanvas(38, 34);
  c.shadow(19, 32, 18, 2.2);
  // ลานไม้ (ท่าเล็ก) + ขาเสา
  for (const x of [3, 18, 33]) c.rect(x, 29, 2, 4, 'm');
  c.rect(1, 26, 36, 4, 'N');
  c.rect(1, 26, 36, 1, 'y');
  c.rect(1, 29, 36, 1, 'M');
  for (let x = 6; x < 37; x += 6) c.rect(x, 26, 1, 3, 'M');
  // ธงบนเสา (ซ้าย)
  c.rect(3, 2, 1, 24, 'M');
  c.rect(4, 2, 1, 24, 'm');
  c.set(3, 1, 'Y');
  c.set(4, 1, 'Y');
  for (let y = 2; y < 9; y++) for (let x = 5; x <= 5 + Math.min(y - 1, 9 - y) * 2; x++) c.set(x, y, x > 8 ? 'r' : 'Y');
  // ซุ้ม: เสา 2 ต้น + เคาน์เตอร์
  for (const x of [9, 28]) c.rect(x, 10, 2, 16, 'M');
  c.rect(8, 18, 23, 2, 'N');
  c.rect(8, 18, 23, 1, 'y');
  c.rect(9, 20, 21, 6, 'M');
  for (let x = 12; x < 30; x += 5) c.rect(x, 20, 1, 6, 'm');
  // ป้ายหน้าเคาน์เตอร์ (กล่องพัสดุ)
  c.rect(16, 21, 7, 4, 'y');
  c.rect(17, 22, 5, 2, 'N');
  c.rect(19, 22, 1, 2, 'R');
  // พัสดุบนเคาน์เตอร์
  c.rect(12, 14, 5, 4, 'N');
  c.rect(12, 14, 5, 1, 'Y');
  c.rect(14, 14, 1, 4, 'R');
  c.rect(21, 15, 4, 3, 'S');
  c.rect(21, 15, 4, 1, 'y');
  c.rect(26, 16, 2, 2, 'b');
  // หลังคาลายทางฟ้า/ขาว
  for (let y = 4; y < 11; y++) for (let x = 7 - Math.floor((y - 4) / 3); x < 32 + Math.floor((y - 4) / 3); x++) {
    c.set(x, y, Math.floor(x / 4) % 2 ? 'b' : 'W');
  }
  for (let x = 6; x < 34; x += 4) c.ellipse(x + 2, 11, 2, 1.4, Math.floor(x / 4) % 2 ? 'b' : 'W');
  c.rect(7, 3, 25, 1, 'B');
  // ลังไม้ข้างซุ้ม (ขวาล่าง)
  c.rect(30, 20, 7, 6, 'M');
  c.rect(30, 20, 7, 1, 'N');
  c.line(30, 21, 36, 25, 'm');
  c.rect(30, 20, 1, 6, 'N');
  return c.outline();
}

/** texture ของท่าส่งของ (TextureFactory วนลงทะเบียน) */
export function postArt(): Record<string, PixelCanvas> {
  return { trading_post: tradingPost() };
}
