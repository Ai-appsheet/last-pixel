import { BUILD } from '../data/buildables';
import { STORY } from '../data/quests';
import type { GameScene } from '../scenes/GameScene';
import { TILE, isWater } from './tiles';

/**
 * จำลอง "เกาะหลังเล่นมา 1 เดือน" — สร้างฐานเต็มรูปแบบบนเกาะของคุณ
 * (บ้าน ฟาร์ม โรงงาน เครื่องจักร ป้อม กำแพง ท่าเรือ เรือ) + ของเทพครบ
 */
export function buildShowcase(s: GameScene) {
  const W = s.world;
  const sx = W.spawn.tx;
  const sy = W.spawn.ty;
  const land = (x: number, y: number) => !isWater(s.tileAt(x, y));
  s.removeWreck();

  // เคลียร์พื้นที่ฐาน
  for (let y = -13; y <= 12; y++) for (let x = -16; x <= 18; x++) if (land(sx + x, sy + y)) s.clearNodeAt(sx + x, sy + y);

  const paint = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (land(sx + x, sy + y)) s.paintTile(sx + x, sy + y, t);
  };
  const put = (id: string, dx: number, dy: number) => {
    const def = BUILD[id];
    for (let y = 0; y < def.h; y++) for (let x = 0; x < def.w; x++) {
      const tx = sx + dx + x;
      const ty = sy + dy + y;
      if (!land(tx, ty) || s.structureAt(tx, ty, def.layer === 'floor' ? 'floor' : 'object')) return null;
    }
    return s.placeStructure(def, sx + dx, sy + dy, true);
  };

  // ---------- ภูมิทัศน์ ----------
  paint(-15, -12, 17, 11, TILE.GRASS);
  paint(-4, -2, 4, 3, TILE.BRICK); // ลานกลาง
  paint(-1, -11, 1, 11, TILE.DIRT); // ถนนเหนือ-ใต้
  paint(-14, 0, 16, 1, TILE.DIRT); // ถนนตะวันออก-ตะวันตก
  paint(-13, -11, -3, -5, TILE.STONE); // ลานบ้าน
  paint(3, -11, 14, -3, TILE.STONE); // ลานโรงงาน
  paint(-4, 6, -2, 9, TILE.SHALLOW); // บ่อน้ำ

  // ---------- ลานกลาง ----------
  put('statue', 0, -1);
  put('campfire', 2, 2);
  for (const [x, y] of [[-3, -2], [3, -2], [-3, 3], [3, 3]]) put('flower_pot', x, y);
  for (const [x, y] of [[1, 3], [3, 1]]) put('chair', x, y);
  put('table', 2, 3);
  for (const [x, y] of [[-2, -3], [2, -3], [-2, 4], [2, 4]]) put('lamp_post', x, y);

  // ---------- บ้าน ----------
  put('stone_house', -12, -10);
  put('cabin', -7, -10);
  for (let x = -12; x <= -4; x++) put('floor_wood', x, -7);
  put('bed', -12, -6);
  put('bookshelf', -10, -6);
  put('chest', -9, -6);
  put('chest', -8, -6);
  put('rug', -6, -6);
  put('lamp', -4, -6);
  put('banner_flag', -13, -8);
  put('banner_flag', -3, -8);

  // ---------- ฟาร์ม ----------
  const crops = ['carrot', 'tomato', 'pumpkin'];
  for (let y = 4; y <= 9; y++) {
    for (let x = -13; x <= -6; x++) {
      if (x === -9 && (y === 5 || y === 8)) {
        put('sprinkler', x, y);
        continue;
      }
      const plot = put('farm_plot', x, y);
      if (plot) {
        plot.plant(crops[(x + y + 30) % 3]);
        plot.growth = 0.25 + ((x * 7 + y * 13 + 100) % 10) / 10 * 0.8;
        plot.refreshCrop();
      }
    }
  }
  for (let x = -14; x <= -5; x++) {
    put('fence_wood', x, 3);
    put('fence_wood', x, 10);
  }
  for (let y = 4; y <= 9; y++) put('fence_wood', -14, y);

  // ---------- โรงงาน / เครื่องจักร ----------
  put('workbench', 4, -10);
  put('furnace', 6, -10);
  put('anvil', 8, -10);
  put('mech_bench', 10, -10);
  put('generator', 4, -7);
  put('windmill', 12, -7);
  put('auto_miner', 7, -7);
  put('auto_miner', 9, -7);
  for (let x = 4; x <= 10; x += 2) put('barrel', x, -4);
  put('crate_box', 5, -4);
  put('crate_box', 7, -4);
  put('warehouse', 11, -4);
  put('lamp_post', 14, -9);
  const gen = s.structureList().find((x) => x.def.id === 'generator');
  gen?.addFuel(900);

  // ---------- กำแพง + ป้อม ----------
  const wallX0 = -15;
  const wallX1 = 17;
  const wallY0 = -12;
  const wallY1 = 11;
  for (let x = wallX0; x <= wallX1; x++) {
    for (const y of [wallY0, wallY1]) {
      if (Math.abs(x) <= 1) put('door_iron', x, y);
      else put(x % 4 === 0 ? 'wall_iron' : 'stone_wall', x, y);
    }
  }
  for (let y = wallY0 + 1; y < wallY1; y++) {
    for (const x of [wallX0, wallX1]) {
      if (y === 0 || y === 1) put('door_iron', x, y);
      else put(y % 4 === 0 ? 'wall_iron' : 'stone_wall', x, y);
    }
  }
  put('watchtower', wallX0 + 1, wallY0 + 1);
  put('watchtower', wallX1 - 2, wallY1 - 2);
  for (const [x, y] of [[wallX1 - 2, wallY0 + 2], [wallX0 + 2, wallY1 - 2], [6, 6], [-6, -2]]) put('turret_arrow', x, y);
  put('turret_cannon', 8, 5);
  put('turret_cannon', -6, 2);
  for (const x of [-8, 8]) put('spike_trap', x, wallY1 + 1);
  for (const [x, y] of [[-2, wallY0 + 1], [2, wallY0 + 1], [-2, wallY1 - 1], [2, wallY1 - 1]]) put('banner_flag', x, y);

  // ---------- ท่าเรือ + เรือ + ประภาคาร (หาฝั่งที่ใกล้ที่สุด) ----------
  let dock: { x: number; y: number } | null = null;
  for (let r = 14; r < 40 && !dock; r++) {
    for (let a = 0; a < 48 && !dock; a++) {
      const ang = Math.PI / 2 + (a / 48) * Math.PI * 2;
      const tx = Math.round(sx + Math.cos(ang) * r);
      const ty = Math.round(sy + Math.sin(ang) * r);
      if (s.tileAt(tx, ty) === TILE.SHALLOW && s.tileAt(tx + 1, ty) === TILE.SHALLOW && s.tileAt(tx, ty + 1) === TILE.SHALLOW && s.tileAt(tx + 1, ty + 1) === TILE.SHALLOW) dock = { x: tx, y: ty };
    }
  }
  if (dock) {
    s.placeStructure(BUILD.dock, dock.x, dock.y, true);
    const boats = ['raft', 'sailboat', 'motorboat'];
    let placed = 0;
    for (let r = 2; r < 12 && placed < boats.length; r++) {
      for (let a = 0; a < 16 && placed < boats.length; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const tx = Math.round(dock.x + Math.cos(ang) * r * 1.6);
        const ty = Math.round(dock.y + Math.sin(ang) * r);
        if (isWater(s.tileAt(tx, ty)) && isWater(s.tileAt(tx + 1, ty)) && !s.boatAt(tx, ty) && !s.structureAt(tx, ty, 'boat')) {
          s.spawnBoat(boats[placed], tx * 16 + 8, ty * 16 + 8, undefined, 600);
          placed++;
        }
      }
    }
    // ประภาคารบนบกใกล้ท่าเรือ
    for (let r = 1; r < 8; r++) {
      const tx = dock.x + (sx > dock.x ? r : -r);
      if (land(tx, dock.y - 2) && land(tx + 1, dock.y - 2) && land(tx, dock.y - 1) && land(tx + 1, dock.y - 1)) {
        s.clearNodeAt(tx, dock.y - 2);
        s.clearNodeAt(tx + 1, dock.y - 2);
        s.placeStructure(BUILD.lighthouse, tx, dock.y - 2, true);
        break;
      }
    }
  }

  // ---------- ตัวละคร / ของ ----------
  const p = s.player;
  const inv = p.inventory;
  inv.slots.fill(null);
  inv.addSlot({ id: 'iron_sword', qty: 1, dur: 300, plus: 2 });
  inv.addSlot({ id: 'storm_bow', qty: 1, dur: 1500, plus: 5 });
  inv.addSlot({ id: 'iron_pickaxe', qty: 1, dur: 400, plus: 4 });
  inv.addSlot({ id: 'inferno_axe', qty: 1, dur: 1500, plus: 3 });
  inv.add('bomb', 12);
  inv.add('veggie_stew', 8);
  inv.add('bandage', 10);
  inv.addSlot({ id: 'fishing_rod', qty: 1 });
  for (const [id, n] of [
    ['box_legend', 2], ['box_gold', 3], ['box_iron', 5], ['enhance_stone', 40], ['gold_ore', 30], ['iron_ore', 40],
    ['iron_ingot', 60], ['gold_ingot', 20], ['crystal', 14], ['meteorite', 9], ['gear', 30], ['engine', 2], ['fuel', 15],
    ['wood', 200], ['stone', 200], ['coal', 80], ['gunpowder', 30], ['cooked_fish', 15], ['golden_fish', 4], ['demon_horn', 2],
  ] as [string, number][]) inv.add(id, n);
  inv.addSlot({ id: 'crystal_sword', qty: 1, dur: 500, plus: 7 });
  inv.addSlot({ id: 'vampire_scythe', qty: 1, dur: 1500, plus: 6 });
  inv.addSlot({ id: 'thor_hammer', qty: 1, dur: 1500, plus: 2 });
  inv.addSlot({ id: 'cosmic_staff', qty: 1, dur: 1500, plus: 4 });
  // อุปกรณ์ครบ 12 ช่อง (ของจากกล่องเพชร/บอส + อัพเกรด)
  Object.assign(p.equip, {
    weapon: { id: 'thunder_blade', qty: 1, dur: 1500, plus: 9 }, // Lv10 โฉมตำนาน
    offhand: { id: 'crab_shield', qty: 1, dur: 500, plus: 4 },
    head: { id: 'demon_crown', qty: 1, dur: 1200, plus: 3 },
    body: { id: 'meteor_armor', qty: 1, dur: 800, plus: 6 },
    legs: { id: 'meteor_greaves', qty: 1, dur: 700, plus: 4 },
    feet: { id: 'wind_boots', qty: 1, dur: 600, plus: 3 },
    hands: { id: 'fire_gauntlets', qty: 1, dur: 700, plus: 5 },
    back: { id: 'royal_cape', qty: 1, plus: 2 },
    neck: { id: 'demon_amulet', qty: 1, plus: 2 },
    ring1: { id: 'meteor_ring', qty: 1, plus: 3 },
    ring2: { id: 'ruby_ring', qty: 1, plus: 5 },
    bag: { id: 'explorer_pack', qty: 1 },
  });
  p.recalc();
  p.cosmetic = {};
  p.refreshLook();
  s.wallet.coins = 25840;
  s.wallet.gems = 46;
  // โชว์ระบบอัพเกรด: สิ่งก่อสร้าง/ยานหลายเลเวล (ทุกโฉม ปกติ/เหล็ก/ทอง/ตำนาน)
  const LV = [1, 3, 4, 6, 7, 9, 10];
  s.structureList().forEach((st, i) => !st.getData('foreign') && st.def.layer !== 'floor' && st.setLevel(LV[i % LV.length]));
  s.boatList().forEach((b, i) => b.setLevel(LV[(i * 3 + 2) % LV.length]));
  // แท่นวางของในโกดัง
  const wh = s.structureList().find((x) => x.def.id === 'warehouse');
  for (const [id, n] of [['iron_ore', 120], ['sulfur', 60], ['hide', 40], ['crab_shell', 25], ['yeti_fur', 12], ['pumpkin', 30], ['carrot', 80]] as [string, number][]) wh?.storage?.add(id, n);

  s.dayNight.day = 30;
  s.dayNight.time = 0.24;
  s.disaster.survived = 29;
  if (s.quests) s.quests.index = STORY.length;
  s.introSeen = true;
  p.setPosition((sx + 0.5) * 16, (sy + 5) * 16);
}
