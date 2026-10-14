'use client';
import { useEffect, useRef } from 'react';

/**
 * ข้อความภาษาไทยแบบพิกเซล (หน้าโหลด) — วาดตัวหนังสือขนาดเล็กลง canvas, ตัดขอบให้คม (ไม่มีเงาเบลอ),
 * ใส่ขอบดำ + เงา 1 พิกเซล แล้วขยายแบบ pixelated ให้เป็นตัวอักษรพิกเซลก้อนๆ
 */
export default function PixelText({
  text,
  px = 12,
  scale = 3,
  color = '#fff6d8',
  color2,
  outline = '#1a1030',
  shadow = '#5a1f2b',
  font = '"Mitr", Kanit, Tahoma, sans-serif',
  weight = 600,
  className,
}: {
  text: string;
  /** ขนาดตัวอักษรตอนวาด (พิกเซลจริงของตัวอักษร) */
  px?: number;
  /** ขยายกี่เท่า (ยิ่งมาก = พิกเซลยิ่งใหญ่) */
  scale?: number;
  color?: string;
  /** สีไล่ล่าง (ไม่ใส่ = สีเดียว) */
  color2?: string;
  outline?: string;
  shadow?: string;
  font?: string;
  weight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dead = false;
    const draw = () => {
      const cv = ref.current;
      if (!cv || dead) return;
      const f = `${weight} ${px}px ${font}`;
      const m = document.createElement('canvas').getContext('2d')!;
      m.font = f;
      const pad = 3;
      // ภาษาไทยมีสระบน/ล่าง → เผื่อความสูง 1.9 เท่า
      const w = Math.ceil(m.measureText(text).width) + pad * 2 + 1;
      const h = Math.ceil(px * 1.9) + pad * 2 + 1;
      const base = pad + Math.round(px * 1.32);
      // 1) วาดตัวอักษรลง canvas ชั่วคราว แล้วตัด alpha ให้เป็น 0/1 (ขอบคมแบบพิกเซล)
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const t = tmp.getContext('2d')!;
      t.font = f;
      t.textBaseline = 'alphabetic';
      t.fillStyle = '#fff';
      t.fillText(text, pad, base);
      const src = t.getImageData(0, 0, w, h).data;
      const on = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) on[i] = src[i * 4 + 3] > 110 ? 1 : 0;
      // 2) ระบายสี: เงา (ขยับ +1,+1) → ขอบ (รอบตัว 1 ช่อง) → ตัวอักษร (ไล่สีบนลงล่าง)
      cv.width = w;
      cv.height = h;
      const c = cv.getContext('2d')!;
      const img = c.createImageData(w, h);
      const d = img.data;
      const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      const cTop = hex(color);
      const cBot = hex(color2 ?? color);
      const cOut = hex(outline);
      const cSh = hex(shadow);
      const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? on[y * w + x] : 0);
      let y0 = h;
      let y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on[y * w + x]) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          let rgb: number[] | null = null;
          if (at(x, y)) {
            const k = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
            rgb = cTop.map((v, j) => Math.round(v + (cBot[j] - v) * k));
          } else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || at(x - 1, y - 1) || at(x + 1, y - 1) || at(x - 1, y + 1) || at(x + 1, y + 1)) {
            rgb = cOut;
          } else if (at(x - 2, y - 2) || at(x - 1, y - 2) || at(x - 2, y - 1)) {
            rgb = cSh;
          }
          if (rgb) {
            d[i] = rgb[0];
            d[i + 1] = rgb[1];
            d[i + 2] = rgb[2];
            d[i + 3] = 255;
          }
        }
      }
      c.putImageData(img, 0, 0);
      cv.style.width = `${w * scale}px`;
      cv.style.height = `${h * scale}px`;
    };
    // รอฟอนต์โหลดก่อน (ไม่งั้นจะได้ฟอนต์สำรอง) — แต่ไม่รอเกิน 1.5 วิ
    const fonts = document.fonts?.load(`${weight} ${px}px ${font}`) ?? Promise.resolve();
    Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).then(draw, draw);
    return () => {
      dead = true;
    };
  }, [text, px, scale, color, color2, outline, shadow, font, weight]);

  return <canvas ref={ref} className={className} role="img" aria-label={text} style={{ imageRendering: 'pixelated', display: 'inline-block', verticalAlign: 'middle' }} />;
}
