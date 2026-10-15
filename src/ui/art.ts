import Phaser from 'phaser';

/** ภาพประกอบที่สร้างจาก AI (public/art/<name>.jpg) → texture key `art_<name>` */
export const ART = [
  // title_bg = ภาพหน้าแรก (ทิวทัศน์หมู่เกาะ + วัดบนหน้าผา + ทีมฮีโร่) · cover/keyart = ภาพปกเดิม (ใช้ในหน้าอื่น)
  'title_bg', 'keyart', 'cover', 'intro_1', 'intro_2', 'intro_3', 'intro_4', 'intro_5',
  'dungeon_1', 'dungeon_2', 'dungeon_3', 'boss_golem', 'boss_crab', 'boss_demon',
  'death', 'conquest', 'special_island',
  // key art โชว์เคสหน้าแรก (แมพ+มหันตภัย อลังการ) — A พายุคลื่นยักษ์ · B ภูเขาไฟจันทร์เลือด · C ศึกสัตว์ในตำนาน
  'show_a', 'show_b', 'show_c',
  'hz_quake', 'hz_lightning', 'hz_stampede', 'hz_heatwave', 'hz_coldsnap', 'hz_wildfire', 'hz_meteor', 'hz_tsunami',
  'raid_night', 'market_island',
  'cat_weapons', 'cat_gear', 'cat_build', 'cat_boat', 'cat_machine', 'cat_mobs', 'cat_shop', 'cat_elixir',
  'char_mechanic', 'char_medic', 'char_hunter', 'char_farmer', 'char_scout', 'char_shaman', 'char_robot',
  // การ์ดขึ้นเกาะไบโอมครั้งแรก (isl_<biome>)
  'isl_forest', 'isl_snow', 'isl_desert', 'isl_jungle', 'isl_volcanic', 'isl_ruins',
  'isl_swamp', 'isl_mushroom', 'isl_crystal', 'isl_bamboo', 'isl_savanna', 'isl_glacier', 'isl_atoll', 'isl_haunted',
  // ภัยกลางวันชุดใหม่
  'hz_sandstorm', 'hz_blizzard', 'hz_eruption', 'hz_acid_rain', 'hz_locusts', 'hz_flood', 'hz_toxic_fog', 'hz_eclipse', 'hz_tornado', 'hz_whirlpool',
  // ภัยกลางคืนชุดใหม่
  'raid_blood_moon', 'raid_ghost_night', 'raid_skeleton_army', 'raid_insect_swarm', 'raid_sea_rage', 'raid_legend',
  // สัตว์ในตำนานปรากฏตัว
  'legend_naga', 'legend_garuda', 'legend_qilin', 'legend_phoenix', 'legend_kraken', 'legend_kochasi', 'legend_frost_dragon', 'legend_stone_turtle',
] as const;
export type ArtName = (typeof ART)[number];

export const artKey = (name: ArtName) => `art_${name}`;

/**
 * คิวโหลดภาพที่ยังไม่มี — ใช้ใน preload() (ซีนรอโหลดเสร็จ) หรือ background=true (โหลดเบื้องหลัง ไม่บล็อกซีน)
 * texture เป็นของทั้งเกม: เปลี่ยนซีนกลางทาง ไฟล์ที่ค้างจะถูกคิวใหม่ในซีนถัดไปเอง · ไฟล์หาย/โหลดพลาด = ข้าม เกมยังเล่นได้
 */
export function queueArt(scene: Phaser.Scene, names: readonly ArtName[] = ART, background = false) {
  const missing = names.filter((n) => !scene.textures.exists(artKey(n)));
  if (!missing.length) return;
  scene.load.maxParallelDownloads = 6;
  for (const n of missing) scene.load.image(artKey(n), `art/${n}.jpg`);
  if (background) scene.load.start();
}
export const artGroup = (prefix: string) => ART.filter((n) => n.startsWith(prefix));
export const hasArt = (scene: Phaser.Scene, name: ArtName) => scene.textures.exists(artKey(name));

/** วางภาพแบบเต็มกรอบ (cover) — ไม่มีภาพ = คืน null */
export function coverImage(scene: Phaser.Scene, name: ArtName, w: number, h: number, x = 0, y = 0) {
  if (!hasArt(scene, name)) return null;
  const img = scene.add.image(x + w / 2, y + h / 2, artKey(name));
  const s = Math.max(w / img.width, h / img.height);
  return img.setScale(s);
}

/** วางภาพแบบ cover แต่ตัดส่วนเกินกรอบออก (ใช้ในกล่อง/การ์ดที่ไม่ได้เต็มจอ) */
export function coverCrop(scene: Phaser.Scene, name: string, w: number, h: number, x = 0, y = 0, focusY = 0.5) {
  const key = `art_${name}`;
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(0, 0, key).setOrigin(0);
  const s = Math.max(w / img.width, h / img.height);
  const cw = w / s;
  const ch = h / s;
  const cx = (img.width - cw) / 2;
  const cy = (img.height - ch) * focusY;
  img.setScale(s).setCrop(cx, cy, cw, ch);
  // setCrop ไม่ขยับตำแหน่ง → เลื่อนกลับให้มุมที่ตัดตรงกับ (x,y)
  return img.setPosition(x - cx * s, y - cy * s);
}

/** ภาพบอสตาม id มอน (รวมตัวที่ถูกขยายพลัง เช่น crab_king@1.8B) */
export function bossArt(mobId: string): ArtName | null {
  const base = mobId.split('@')[0];
  return base === 'golem' ? 'boss_golem' : base === 'crab_king' ? 'boss_crab' : base === 'demon_lord' ? 'boss_demon' : null;
}

/** สำเนาย่อของภาพฉาก (กว้าง w px) สำหรับใช้ในการ์ดเล็ก/รายการเลื่อน — ภาพใหญ่ 1024px ในรายการเลื่อนแสดงไม่ขึ้น */
export function smallArtKey(scene: Phaser.Scene, name: string, w = 192): string | null {
  const src = `art_${name}`;
  if (!scene.textures.exists(src)) return null;
  const key = `${src}_sm`;
  if (scene.textures.exists(key)) return key;
  const img = scene.textures.get(src).getSourceImage() as HTMLImageElement;
  const h = Math.round((w * img.height) / img.width);
  const ct = scene.textures.createCanvas(key, w, h);
  if (!ct) return null;
  ct.getContext().drawImage(img, 0, 0, w, h);
  ct.refresh();
  return key;
}
