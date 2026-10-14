import type Phaser from 'phaser';

// sprite ตัวละคร/มอน/สัตว์/บอส วาดละเอียด 2 เท่า (HD pixel art) แล้วแสดงที่ scale 1/2 → ขนาดในโลกเท่าเดิม
// texture HD จะมี customData.res = SPRITE_RES · โค้ดที่ตั้ง scale/ขนาด body ให้ใช้ resOf / setWorldScale

export const SPRITE_RES = 2;

type Tex = Phaser.Textures.Texture;
type Scaled = { texture: Tex; setScale(x: number, y?: number): unknown };

export function markHd(tex: Tex, res = SPRITE_RES) {
  (tex.customData as Record<string, unknown>).res = res;
}

/** พิกเซลจริงต่อ 1 พิกเซลโลกของ texture (ปกติ 1 · sprite HD = 2) */
export function resOf(tex: Tex | undefined | null): number {
  const r = (tex?.customData as { res?: number } | undefined)?.res;
  return r && r > 0 ? r : 1;
}

/** ตั้ง scale แบบขนาดโลก (1 = ขนาดเดิมก่อน HD) — หารความละเอียดของ texture ให้เอง */
export function setWorldScale<T extends Scaled>(go: T, sx = 1, sy = sx): T {
  const r = resOf(go.texture);
  go.setScale(sx / r, sy / r);
  return go;
}
