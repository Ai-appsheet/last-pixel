import Phaser from 'phaser';
import { ITEMS } from '../data/items';

/**
 * ภาพวาดรายไอเทม/อาคาร/มอน (public/art/items/<id>.jpg สร้างด้วย tools/gen-items.mjs)
 * รายชื่อใน art/items/index.json · ภาพจริงโหลดเมื่อต้องใช้ (lazy) แล้วแคชเป็น texture `art_item_<id>` ใช้ได้ทุกซีน
 */
const INDEX = 'item_art_index';

/** id ของภาพที่ใช้แทน: แปลนทุกใบใช้ภาพม้วนแปลนตามความหายาก · มอนที่ถูกขยายพลัง (xxx@1.8B) ใช้ภาพตัวปกติ */
export function itemArtId(id: string): string {
  if (id.startsWith('bp_')) return `blueprint_${ITEMS[id]?.rarity ?? 'uncommon'}`;
  return id.split('@')[0];
}

const keyOf = (artId: string) => `art_item_${artId}`;

/** โหลดรายชื่อภาพ (ครั้งเดียวทั้งเกม) — เรียกได้ทั้งใน preload() และนอก preload */
export function queueItemArtIndex(scene: Phaser.Scene, start = false) {
  if (scene.cache.json.exists(INDEX)) return;
  scene.load.json(INDEX, 'art/items/index.json');
  if (start) scene.load.start();
}

let indexSet: Set<string> | null = null;
function index(scene: Phaser.Scene): Set<string> {
  if (indexSet) return indexSet;
  const list = scene.cache.json.get(INDEX) as string[] | undefined;
  if (!Array.isArray(list)) return new Set();
  indexSet = new Set(list);
  return indexSet;
}

/** มีภาพวาดของ id นี้ไหม (ไม่สนว่าโหลดแล้วหรือยัง) */
export const hasItemArt = (scene: Phaser.Scene, id: string) => index(scene).has(itemArtId(id));

/** texture key ถ้าโหลดแล้ว ไม่งั้น null */
export function itemArtKey(scene: Phaser.Scene, id: string): string | null {
  const k = keyOf(itemArtId(id));
  return scene.textures.exists(k) ? k : null;
}

/**
 * ขอภาพ: ถ้ามีแล้วเรียก cb ทันที (คืน true) · ถ้ายังไม่โหลดแต่มีในรายชื่อ → โหลดแล้วเรียก cb ทีหลัง (คืน false)
 * ไม่มีภาพเลย = ไม่เรียก cb
 */
export function withItemArt(scene: Phaser.Scene, id: string, cb: (key: string) => void): boolean {
  const artId = itemArtId(id);
  const k = keyOf(artId);
  if (scene.textures.exists(k)) {
    cb(k);
    return true;
  }
  if (!index(scene).has(artId)) return false;
  scene.load.image(k, `art/items/${artId}.jpg`);
  scene.load.once(`filecomplete-image-${k}`, () => scene.sys.isActive() && cb(k));
  scene.load.start();
  return false;
}

/** ภาพเล็ก 128px (public/art/items/thumb/) สำหรับการ์ด/ช่องเล็ก — เหมือน withItemArt */
export function withItemThumb(scene: Phaser.Scene, id: string, cb: (key: string) => void): boolean {
  const artId = itemArtId(id);
  const k = `art_thumb_${artId}`;
  if (scene.textures.exists(k)) {
    cb(k);
    return true;
  }
  if (!index(scene).has(artId)) return false;
  scene.load.image(k, `art/items/thumb/${artId}.jpg`);
  scene.load.once(`filecomplete-image-${k}`, () => scene.sys.isActive() && cb(k));
  scene.load.start();
  return false;
}

/** วางภาพแบบ cover ในกรอบ w×h (ตัดส่วนเกิน) ตำแหน่งมุมซ้ายบน x,y */
export function placeArtCover(img: Phaser.GameObjects.Image, x: number, y: number, w: number, h: number, focusY = 0.5) {
  const s = Math.max(w / img.width, h / img.height);
  const cw = w / s;
  const ch = h / s;
  const cx = (img.width - cw) / 2;
  const cy = (img.height - ch) * focusY;
  img.setOrigin(0).setScale(s).setCrop(cx, cy, cw, ch);
  return img.setPosition(x - cx * s, y - cy * s);
}
