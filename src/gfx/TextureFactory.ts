import Phaser from 'phaser';
import { PALETTE } from '../data/palette';
import { SPRITES } from '../data/sprites';
import { CHARACTERS, MERCHANT_COLORS, RIVAL_COLORS, SHADE_COLORS, ZOMBIE_COLORS } from '../data/characters';
import { PixelCanvas, dither, setTone } from './PixelCanvas';
import { worldTone } from './palette';
import {
  acacia, bambooClump, bigOak, birch, bush, cactus, coral, crystalCluster, deadTree, decorTiles, glowMushroomIcon, mangrove, maple, mushTree, oak, oreRock, palm, pine, rock,
  sakura, shroomPatch, snowPine, stump, tuft, willow,
} from './art/nature';
import {
  airdrop, arenaEmblem, banner, brazier, campfire, cloudShadow, crate, entityShadow, glowCanvas, mailbox, marketStall,
  parachute, pillar, planeWreck, signpost, spikeTrap, woodWall,
} from './art/props';
import { bed, cropStage, farmPlot, furnace, itemIcons, stoneWall, wildCrop, workbench } from './art/icons';
import { buildUiTextures } from './art/ui';
import { itemIcons3 } from './art/icons3';
import { itemIcons2 } from './art/icons2';
import { gearIcons } from './art/gear';
import { weaponIcons } from './art/weapons';
import { buildCreatureTextures, creatureIcons } from './art/creatures';
import { extraArt } from './art/icons_extra';
import { postArt } from './art/post';
import { homeInteriorArt } from './art/homeInterior';
import { buildBuildingTextures } from './art/buildings';
import { vehicleArt } from './art/vehicles';
import { buildMonsterTextures, CHIBI_HUMANOID_HD, humanoidFrame, strip } from './art/monsters';
import { edgeTiles, groundTiles } from './art/terrain';

export { TILE } from '../world/tiles';

/** จำนวนแบบของแต่ละอย่าง (WorldGenerator ใช้สุ่มเลือก) */
export const ART_VARIANTS = { oak: 3, pine: 2, palm: 2, rock: 3, bush: 2, grass: 2, cloud: 3, snow_pine: 2, cactus: 2, ore_iron: 2, wild: 2,
  birch: 2, sakura: 2, maple: 2, willow: 1, bigoak: 2, deadtree: 2, mushtree: 2,
  acacia: 2, mangrove: 2, bamboo: 2, coral: 3, shroom: 2,
};

type Ctx = CanvasRenderingContext2D;

function paintRows(ctx: Ctx, rows: string[], ox: number, oy: number, colorMap: Record<string, string> = {}) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      let ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ch = colorMap[ch] ?? ch;
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

const rowsWidth = (rows: string[]) => Math.max(...rows.map((r) => r.length));

/** texture จาก pixel rows — วางกึ่งกลางแนวนอน ชิดล่าง */
function spriteTexture(scene: Phaser.Scene, key: string, rows: string[], w = 16, h = 16, colorMap?: Record<string, string>) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  paintRows(tex.getContext(), rows, Math.floor((w - rowsWidth(rows)) / 2), h - rows.length, colorMap);
  tex.refresh();
}

/** texture จาก PixelCanvas หนึ่งรูป */
function canvasTexture(scene: Phaser.Scene, key: string, pc: PixelCanvas) {
  const tex = scene.textures.createCanvas(key, pc.W, pc.H)!;
  pc.blit(tex.getContext()); // ผืนใหม่ว่างเปล่า → เขียน ImageData ทีเดียว (เร็วกว่า fillRect ทีละพิกเซล)
  tex.refresh();
}

/** แผ่นรวมหลายรูปเรียงแนวนอน (ใช้เป็น tileset หรือ spritesheet) */
function stripTexture(scene: Phaser.Scene, key: string, frames: PixelCanvas[]) {
  const w = frames[0].W;
  const h = frames[0].H;
  const tex = scene.textures.createCanvas(key, w * frames.length, h)!;
  frames.forEach((pc, i) => {
    pc.blit(tex.getContext(), i * w, 0);
    tex.add(i, 0, i * w, 0, w, h);
  });
  tex.refresh();
}

function humanoid(scene: Phaser.Scene, key: string, colors: Record<string, string>) {
  // เฟรม: 0-2 down, 3-5 up, 6-8 side — วาด HD 32×36 (แสดงที่ scale 1/2)
  const frames = (['down', 'up', 'side'] as const).flatMap((v) => CHIBI_HUMANOID_HD[v].map((rows) => humanoidFrame(rows, v, colors)));
  strip(scene, key, frames);
  const anims = scene.anims;
  anims.create({ key: `${key}_walk_down`, frames: anims.generateFrameNumbers(key, { frames: [1, 0, 2, 0] }), frameRate: 8, repeat: -1 });
  anims.create({ key: `${key}_walk_up`, frames: anims.generateFrameNumbers(key, { frames: [4, 3, 5, 3] }), frameRate: 8, repeat: -1 });
  anims.create({ key: `${key}_walk_side`, frames: anims.generateFrameNumbers(key, { frames: [7, 6] }), frameRate: 6, repeat: -1 });
}

function slash(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas('slash', 32, 32)!;
  const ctx = tex.getContext();
  for (let a = -65; a <= 65; a += 3) {
    const rad = (a * Math.PI) / 180;
    for (let r = 10; r <= 13; r++) {
      ctx.fillStyle = r === 13 ? PALETTE.L : PALETTE.W;
      ctx.fillRect(Math.round(16 + Math.cos(rad) * r), Math.round(16 + Math.sin(rad) * r), 1, 1);
    }
  }
  tex.refresh();
}

/** วงแสงแบบขั้นบันได (ให้ฟีล pixel) ใช้ลบความมืด */
export function ensureLight(scene: Phaser.Scene, radius: number): string {
  const r = Math.round(radius);
  const key = `light_${r}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, r * 2, r * 2)!;
  const ctx = tex.getContext();
  for (let y = 0; y < r * 2; y++) {
    for (let x = 0; x < r * 2; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      if (d >= 1) continue;
      // ไล่ระดับนุ่มๆ แล้ว quantize 6 ขั้นด้วย dithering ให้ยังดูเป็น pixel
      const smooth = Math.min(1, (1 - d) / 0.55);
      const a = Math.round(Math.min(1, Math.max(0, smooth * smooth * (3 - 2 * smooth) + dither(x, y) * 0.18)) * 6) / 6;
      if (!a) continue;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
  return key;
}

function vignette(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas('vignette', 960, 540)!;
  const ctx = tex.getContext();
  const g = ctx.createRadialGradient(480, 270, 200, 480, 270, 620);
  g.addColorStop(0, 'rgba(8,8,20,0)');
  g.addColorStop(1, 'rgba(8,8,20,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 960, 540);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
}

function tiny(scene: Phaser.Scene, key: string, rows: string[]) {
  const pc = new PixelCanvas(rowsWidth(rows), rows.length).rows(rows, 0, 0);
  canvasTexture(scene, key, pc);
}

export function buildAllTextures(scene: Phaser.Scene) {
  try {
    buildAll(scene);
  } finally {
    setTone(null);
  }
}

function buildAll(scene: Phaser.Scene) {
  // ฉากโลก (พื้น ต้นไม้ ของประกอบ สิ่งก่อสร้าง) → แปลงเข้าพาเลตต์โลก
  setTone(worldTone);
  // ---------- พื้นและขอบ ----------
  stripTexture(scene, 'tiles_a', groundTiles(0));
  stripTexture(scene, 'tiles_b', groundTiles(1));
  stripTexture(scene, 'edges_a', edgeTiles(0));
  stripTexture(scene, 'edges_b', edgeTiles(1));
  stripTexture(scene, 'decor', decorTiles());
  canvasTexture(scene, 'tile_grass', groundTiles(0)[3 * 4]);
  canvasTexture(scene, 'tile_deep', groundTiles(0)[0]);
  const g0 = groundTiles(0);
  for (const [name, t] of [['dirt', 11], ['stone', 7], ['brick', 8], ['sand', 2], ['shallow', 1], ['snow', 5], ['ash', 12], ['cave', 13], ['rockwall', 14]] as [string, number][]) {
    canvasTexture(scene, `tile_${name}`, g0[t * 4]);
  }
  canvasTexture(scene, 'tile_deep_b', groundTiles(1)[0]);

  // ---------- ธรรมชาติ ----------
  for (let i = 0; i < ART_VARIANTS.oak; i++) canvasTexture(scene, `oak_${i}`, oak(11 + i * 17));
  for (let i = 0; i < ART_VARIANTS.pine; i++) canvasTexture(scene, `pine_${i}`, pine(23 + i * 9));
  for (let i = 0; i < ART_VARIANTS.palm; i++) canvasTexture(scene, `palm_${i}`, palm(5 + i * 3));
  // ต้นไม้หลากชนิด (เกาะ/ป่าใหม่)
  for (let i = 0; i < ART_VARIANTS.birch; i++) canvasTexture(scene, `birch_${i}`, birch(200 + i));
  for (let i = 0; i < ART_VARIANTS.sakura; i++) canvasTexture(scene, `sakura_${i}`, sakura(210 + i * 3));
  for (let i = 0; i < ART_VARIANTS.maple; i++) canvasTexture(scene, `maple_${i}`, maple(220 + i * 3, i === 1));
  for (let i = 0; i < ART_VARIANTS.willow; i++) canvasTexture(scene, `willow_${i}`, willow(230 + i));
  for (let i = 0; i < ART_VARIANTS.bigoak; i++) canvasTexture(scene, `bigoak_${i}`, bigOak(240 + i));
  for (let i = 0; i < ART_VARIANTS.deadtree; i++) canvasTexture(scene, `deadtree_${i}`, deadTree(250 + i * 3, i === 1));
  for (let i = 0; i < ART_VARIANTS.mushtree; i++) canvasTexture(scene, `mushtree_${i}`, mushTree(260 + i, i === 1));
  // ไบโอมชุดใหม่: อาคาเซีย โกงกาง ไผ่ ปะการัง เห็ดเรืองแสง ผลึกคริสตัลใหญ่
  for (let i = 0; i < ART_VARIANTS.acacia; i++) canvasTexture(scene, `acacia_${i}`, acacia(270 + i * 5));
  for (let i = 0; i < ART_VARIANTS.mangrove; i++) canvasTexture(scene, `mangrove_${i}`, mangrove(280 + i * 7));
  for (let i = 0; i < ART_VARIANTS.bamboo; i++) canvasTexture(scene, `bamboo_${i}`, bambooClump(290 + i * 3));
  canvasTexture(scene, 'bamboo_cut', bambooClump(299).rect(0, 0, 22, 30, 'rgba(0,0,0,0)'));
  for (let i = 0; i < ART_VARIANTS.coral; i++) canvasTexture(scene, `coral_${i}`, coral(i));
  for (let i = 0; i < ART_VARIANTS.shroom; i++) canvasTexture(scene, `shroom_${i}`, shroomPatch(i));
  canvasTexture(scene, 'crystal_1', crystalCluster(7));
  canvasTexture(scene, 'i_glow_mushroom', glowMushroomIcon());
  for (let i = 0; i < ART_VARIANTS.rock; i++) canvasTexture(scene, `rock_${i}`, rock(31 + i * 7, i === 2));
  for (let i = 0; i < ART_VARIANTS.bush; i++) {
    canvasTexture(scene, `bush_${i}`, bush(50 + i, true));
    canvasTexture(scene, `bush_empty_${i}`, bush(50 + i, false));
  }
  for (let i = 0; i < ART_VARIANTS.grass; i++) canvasTexture(scene, `grass_${i}`, tuft(70 + i * 5));
  canvasTexture(scene, 'stump', stump());
  for (let i = 0; i < ART_VARIANTS.snow_pine; i++) canvasTexture(scene, `snow_pine_${i}`, snowPine(80 + i * 13));
  for (let i = 0; i < ART_VARIANTS.cactus; i++) {
    canvasTexture(scene, `cactus_${i}`, cactus(90 + i, true));
    canvasTexture(scene, `cactus_bare_${i}`, cactus(90 + i, false));
  }
  for (let i = 0; i < ART_VARIANTS.ore_iron; i++) canvasTexture(scene, `ore_iron_${i}`, oreRock('iron', 110 + i));
  canvasTexture(scene, 'ore_gold_0', oreRock('gold', 120));
  canvasTexture(scene, 'crystal_0', oreRock('crystal', 130));
  canvasTexture(scene, 'ore_coal_0', oreRock('coal', 150));
  canvasTexture(scene, 'ore_sulfur_0', oreRock('sulfur', 160));
  canvasTexture(scene, 'meteor_rock_0', oreRock('meteor', 170));
  for (let i = 0; i < ART_VARIANTS.wild; i++) canvasTexture(scene, `wild_crop_${i}`, wildCrop(140 + i));

  // ---------- เกาะกลาง / ตลาด / ลานประลอง ----------
  canvasTexture(scene, 'pillar', pillar());
  stripTexture(scene, 'brazier', [brazier(0), brazier(1)]);
  scene.anims.create({ key: 'brazier_burn', frames: scene.anims.generateFrameNumbers('brazier', { frames: [0, 1] }), frameRate: 6, repeat: -1 });
  canvasTexture(scene, 'banner_red', banner('R', 'P'));
  canvasTexture(scene, 'banner_blue', banner('B', 'U'));
  canvasTexture(scene, 'signpost', signpost());
  canvasTexture(scene, 'stall_a', marketStall('R', 'W'));
  canvasTexture(scene, 'stall_b', marketStall('B', 'W'));
  canvasTexture(scene, 'stall_c', marketStall('G', 'Y'));
  canvasTexture(scene, 'mailbox', mailbox(false));
  canvasTexture(scene, 'mailbox_flag', mailbox(true));
  canvasTexture(scene, 'emblem', arenaEmblem());
  canvasTexture(scene, 'airdrop', airdrop(false));
  canvasTexture(scene, 'airdrop_open', airdrop(true));
  canvasTexture(scene, 'parachute', parachute());

  // ---------- สิ่งก่อสร้าง / ฉาก ----------
  stripTexture(scene, 'campfire', [campfire(0), campfire(1), campfire(2), campfire(-1)]);
  scene.anims.create({ key: 'campfire_burn', frames: scene.anims.generateFrameNumbers('campfire', { frames: [0, 1, 2, 1] }), frameRate: 8, repeat: -1 });
  canvasTexture(scene, 'i_campfire', campfire(0));
  canvasTexture(scene, 'wood_wall', woodWall());
  canvasTexture(scene, 'spike_trap', spikeTrap());
  canvasTexture(scene, 'stone_wall', stoneWall());
  canvasTexture(scene, 'farm_plot', farmPlot());
  canvasTexture(scene, 'workbench', workbench());
  stripTexture(scene, 'furnace', [furnace(false), furnace(true)]);
  canvasTexture(scene, 'i_furnace', furnace(true));
  canvasTexture(scene, 'bed', bed());
  for (const kind of ['carrot', 'tomato', 'pumpkin']) {
    for (let st = 0; st < 4; st++) canvasTexture(scene, `crop_${kind}_${st}`, cropStage(kind, st));
  }
  canvasTexture(scene, 'wreck', planeWreck());
  canvasTexture(scene, 'crate', crate(false));
  canvasTexture(scene, 'crate_open', crate(true));
  for (let i = 0; i < ART_VARIANTS.cloud; i++) canvasTexture(scene, `cloud_${i}`, cloudShadow(300 + i));
  canvasTexture(scene, 'shadow', entityShadow());
  scene.textures.addCanvas('glow', glowCanvas(64, [255, 170, 80]));
  scene.textures.addCanvas('glow_cool', glowCanvas(32, [200, 255, 120]));

  setTone(null);
  // ---------- ตัวละคร / สัตว์ ----------
  for (const c of CHARACTERS) humanoid(scene, `char_${c.id}`, c.colors);
  humanoid(scene, 'zombie', ZOMBIE_COLORS);
  humanoid(scene, 'rival', RIVAL_COLORS);
  humanoid(scene, 'merchant', MERCHANT_COLORS);
  humanoid(scene, 'shade', SHADE_COLORS);
  // หมูป่า/หมาป่า/กระต่าย วาดแบบจิบิใน art/creatures.ts (buildCreatureTextures)

  // ---------- ไอคอน ----------
  for (const key of Object.keys(SPRITES).filter((k) => k.startsWith('i_'))) spriteTexture(scene, key, SPRITES[key]);
  for (const key of Object.keys(SPRITES).filter((k) => k.startsWith('hud_'))) spriteTexture(scene, key, SPRITES[key], 8, 8);
  spriteTexture(scene, 'arrow', SPRITES.arrow, 10, 3);
  for (const [key, art] of Object.entries(itemIcons())) canvasTexture(scene, key, art);
  for (const [key, art] of Object.entries(itemIcons2())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  for (const [key, art] of Object.entries(itemIcons3())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  for (const [key, art] of Object.entries(gearIcons())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  for (const [key, art] of Object.entries(weaponIcons())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  setTone(worldTone);
  buildBuildingTextures(scene);
  for (const [key, art] of Object.entries(vehicleArt())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  setTone(null);
  buildMonsterTextures(scene);
  buildCreatureTextures(scene);
  for (const [key, art] of Object.entries(creatureIcons())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art);
  for (const [key, art] of Object.entries(extraArt())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art); // กิจกรรมตามเวลาจริง/สมดุลร่างกาย
  for (const [key, art] of Object.entries(postArt())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art); // 📦 ท่าส่งของ
  for (const [key, art] of Object.entries(homeInteriorArt())) if (!scene.textures.exists(key)) canvasTexture(scene, key, art); // 🏠 เฟอร์นิเจอร์ในบ้าน
  // กล่องเปิดแล้ว (หีบซากโบราณ)
  if (!scene.textures.exists('reward_chest_open')) {
    const src = scene.textures.get('reward_chest').getSourceImage() as HTMLCanvasElement;
    const t = scene.textures.createCanvas('reward_chest_open', src.width, src.height)!;
    t.getContext().globalAlpha = 0.55;
    t.getContext().drawImage(src, 0, 0);
    t.refresh();
  }
  buildUiTextures(scene);

  // ---------- เอฟเฟกต์ ----------
  slash(scene);
  vignette(scene);
  tiny(scene, 'firefly', ['.y.', 'yYy', '.y.']);
  tiny(scene, 'leaf_a', ['gG', '.G']);
  tiny(scene, 'leaf_b', ['rY', '.r']);
  tiny(scene, 'ember', ['Y']);
  tiny(scene, 'raindrop', ['C', 'b', 'b']);
  tiny(scene, 'sparkle', ['.W.', 'WCW', '.W.']);
  const px = scene.textures.createCanvas('px', 2, 2)!;
  px.getContext().fillStyle = '#ffffff';
  px.getContext().fillRect(0, 0, 2, 2);
  px.refresh();
}
