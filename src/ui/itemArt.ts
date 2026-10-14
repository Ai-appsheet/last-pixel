import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { renderScale } from './crispText';

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

/** ไฟล์ที่กำลังโหลด (แยกตาม loader ของแต่ละซีน) — ขอซ้ำหลายช่องพร้อมกันไม่โหลดซ้ำ */
const pending = new WeakMap<Phaser.Loader.LoaderPlugin, Set<string>>();

/** ภาพวาดถูกย่อลงช่องเล็ก → ใช้ LINEAR (เกมตั้ง pixelArt = NEAREST ทุก texture ทำให้ภาพย่อแตกเป็นหยัก) */
function linear(scene: Phaser.Scene, k: string) {
  const t = scene.textures.get(k);
  const d = t.customData as { linear?: boolean };
  if (d.linear) return;
  d.linear = true;
  t.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function queueLinear(scene: Phaser.Scene, k: string, url: string, cb: (key: string) => void) {
  scene.load.once(`filecomplete-image-${k}`, () => {
    if (!scene.sys.isActive() || !scene.textures.exists(k)) return;
    linear(scene, k);
    cb(k);
  });
  let set = pending.get(scene.load);
  if (!set) pending.set(scene.load, (set = new Set()));
  if (set.has(k)) return;
  set.add(k);
  scene.load.once(`filecomplete-image-${k}`, () => set.delete(k));
  scene.load.image(k, url);
  scene.load.start();
}

/** โหลดรายชื่อภาพ (ครั้งเดียวทั้งเกม) — เรียกได้ทั้งใน preload() และนอก preload */
const indexQueued = new WeakSet<Phaser.Loader.LoaderPlugin>();
export function queueItemArtIndex(scene: Phaser.Scene, start = false) {
  if (scene.cache.json.exists(INDEX)) return;
  if (!indexQueued.has(scene.load)) {
    indexQueued.add(scene.load);
    scene.load.json(INDEX, 'art/items/index.json');
  }
  if (start) scene.load.start();
}

let indexSet: Set<string> | null = null;

/** รายชื่อภาพยังโหลดไม่เสร็จ → รอแล้วค่อยขอใหม่ (ช่องที่วาดตอนเริ่มเกมจะได้ภาพด้วย) */
function afterIndex(scene: Phaser.Scene, retry: () => void): boolean {
  if (scene.cache.json.exists(INDEX)) return false;
  scene.load.once(`filecomplete-json-${INDEX}`, () => scene.sys.isActive() && retry());
  queueItemArtIndex(scene, true);
  return true;
}
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
    linear(scene, k);
    cb(k);
    return true;
  }
  if (afterIndex(scene, () => withItemArt(scene, id, cb))) return false;
  if (!index(scene).has(artId)) return false;
  queueLinear(scene, k, `art/items/${artId}.jpg`, cb);
  return false;
}

/** ภาพเล็ก 128px (public/art/items/thumb/) สำหรับการ์ด/ช่องเล็ก — เหมือน withItemArt */
export function withItemThumb(scene: Phaser.Scene, id: string, cb: (key: string) => void): boolean {
  const artId = itemArtId(id);
  const k = `art_thumb_${artId}`;
  if (scene.textures.exists(k)) {
    linear(scene, k);
    cb(k);
    return true;
  }
  if (afterIndex(scene, () => withItemThumb(scene, id, cb))) return false;
  if (!index(scene).has(artId)) return false;
  queueLinear(scene, k, `art/items/thumb/${artId}.jpg`, cb);
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

/**
 * ไอคอนพิกเซลให้พอดีกรอบ box: ขยายเป็นเลขเต็ม (×1 ×2 ×3) หรือย่อเป็นเศษส่วนเต็ม (½ ⅓ — sprite HD 2 เท่า)
 * → พิกเซลคมเท่ากันทุกจุด ไม่เบลอ/ไม่เบี้ยว
 */
export function fitPixelIcon(img: Phaser.GameObjects.Image, key: string, frame: string | number | undefined, box: number) {
  img.setTexture(img.scene.textures.exists(key) ? key : 'px', frame);
  const m = Math.max(img.frame.width, img.frame.height, 1);
  return img.setScale(m <= box ? Math.floor(box / m) : 1 / Math.ceil(m / box));
}

/**
 * sprite พิกเซลขนาดใหญ่ (หุ่นตัวละคร/พรีวิว): ขยายเลขเต็มจากขนาดเฟรมจริงให้ใหญ่สุดในกรอบ maxW×maxH
 * ใช้ได้ทั้ง texture 20×24 และ HD 40×48 · บังคับ NEAREST (คมเป็นพิกเซล ไม่เบลอ)
 */
export function fitPixelSprite<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(img: T, maxW: number, maxH: number): T {
  const f = img.frame;
  img.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  img.setScale(Math.max(1, Math.floor(Math.min(maxW / f.width, maxH / f.height))));
  return img;
}

/** ขนาดภาพอบตามความละเอียดจอจริง (ไม่ใหญ่เกินภาพต้นฉบับ 128px) */
function bakeSize(box: number) {
  const need = box * renderScale() * 1.25;
  return need <= 48 ? 48 : need <= 64 ? 64 : need <= 96 ? 96 : 128;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** ภาพเล็กมุมมน + ขอบเข้มบางๆ (อบลงแคนวาสครั้งเดียวต่อ id/ขนาด) — ไม่ต้องใช้ mask ทีละช่อง */
function bakedThumb(scene: Phaser.Scene, src: string, px: number): string {
  const k = `${src}_r${px}`;
  if (scene.textures.exists(k)) return k;
  const img = scene.textures.get(src).getSourceImage() as HTMLImageElement;
  const tex = scene.textures.createCanvas(k, px, px)!;
  const ctx = tex.getContext();
  const r = Math.round(px * 0.2);
  ctx.save();
  roundRectPath(ctx, 0, 0, px, px, r);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, px, px);
  ctx.restore();
  const lw = Math.max(1, px / 40);
  ctx.lineWidth = lw;
  ctx.strokeStyle = 'rgba(11,13,31,0.75)';
  roundRectPath(ctx, lw / 2, lw / 2, px - lw, px - lw, r - lw / 2);
  ctx.stroke();
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return k;
}

/**
 * ไอคอนไอเทมในช่อง/แถว UI: ภาพวาดมุมมน (ถ้ามีภาพ + โหลดแล้ว) ไม่งั้นไอคอนพิกเซลเดิม (ระหว่างโหลด/ไม่มีภาพ)
 * px กับ art ต้องวางตำแหน่งเดียวกัน (origin กลาง) · artBox = ขนาดภาพวาด · pxBox = กรอบไอคอนพิกเซล
 * id = null → ซ่อนทั้งคู่ · pixelKey = ไอคอนพิกเซลแทน (เช่น โฉมอัพเกรด) · fallback=false = ไม่มีภาพก็ไม่แสดงอะไร
 */
export function showItemIcon(
  px: Phaser.GameObjects.Image, art: Phaser.GameObjects.Image, id: string | null,
  artBox: number, pxBox = artBox, pixelKey?: string, frame?: string | number, fallback = true,
) {
  art.setData('want', id);
  if (!id) {
    px.setVisible(false);
    art.setVisible(false);
    return;
  }
  const scene = px.scene;
  const put = (k: string) => {
    art.setTexture(bakedThumb(scene, k, bakeSize(artBox))).setDisplaySize(artBox, artBox).setVisible(true);
    px.setVisible(false);
  };
  fitPixelIcon(px, pixelKey ?? ITEMS[id]?.icon ?? 'px', frame, pxBox).setVisible(fallback);
  art.setVisible(false);
  withItemThumb(scene, id, (k) => {
    // ช่องเปลี่ยนของ/ถูกซ่อนไประหว่างโหลด → ไม่ต้องสลับ
    if (!art.active || art.getData('want') !== id || (fallback && !px.visible)) return;
    put(k);
  });
}
