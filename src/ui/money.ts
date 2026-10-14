/**
 * รูปแบบตัวเลขเงิน (เหรียญ/เพชร) ใช้ทุกหน้าจอให้เหมือนกัน
 *   < 10,000      → 1,234
 *   < 1,000,000   → 12.3k
 *   ขึ้นไป         → 1.23M
 */
export function fmtMoney(n: number): string {
  const v = Math.round(n);
  const a = Math.abs(v);
  if (a < 10_000) return v.toLocaleString('en-US');
  if (a < 1_000_000) return `${trim((v / 1000).toFixed(a < 100_000 ? 1 : 0))}k`;
  return `${trim((v / 1_000_000).toFixed(2))}M`;
}

/** ตัวเลขเต็ม 1,234,567 (ตอนแตะดูยอดจริง) */
export const fmtFull = (n: number) => Math.round(n).toLocaleString('en-US');

const trim = (s: string) => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
