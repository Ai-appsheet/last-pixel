export type Station = 'none' | 'campfire' | 'workbench' | 'furnace' | 'anvil' | 'mech_bench' | 'kitchen';

export interface Recipe {
  id: string;
  station: Station;
  inputs: { item: string; qty: number }[];
  output: { item: string; qty: number };
}

export const STATION_NAMES: Record<Station, string> = {
  none: 'มือเปล่า',
  campfire: 'กองไฟ',
  workbench: 'โต๊ะช่าง',
  furnace: 'เตาหลอม',
  anvil: 'ทั่งตีเหล็ก',
  mech_bench: 'โต๊ะช่างกล',
  kitchen: 'ครัว',
};

const R = (id: string, station: Station, inputs: [string, number][], out: [string, number] = [id, 1]): Recipe => ({
  id: `${id}@${station}`, station, inputs: inputs.map(([item, qty]) => ({ item, qty })), output: { item: out[0], qty: out[1] },
});

/** สูตรคราฟต์ไอเทม (สิ่งก่อสร้างทั้งหมดอยู่ใน buildables.ts — สร้างผ่านโหมดสร้าง) */
export const RECIPES: Recipe[] = [
  // มือเปล่า
  R('rope', 'none', [['fiber', 3]]),
  R('torch', 'none', [['wood', 1], ['fiber', 2]]),
  R('stone_axe', 'none', [['wood', 3], ['stone', 2], ['rope', 1]]),
  R('stone_pickaxe', 'none', [['wood', 3], ['stone', 3], ['rope', 1]]),
  R('wood_sword', 'none', [['wood', 6], ['rope', 1]]),
  R('spear', 'none', [['wood', 4], ['stone', 2], ['rope', 2]]),
  R('fishing_rod', 'none', [['wood', 3], ['rope', 2]]),
  R('bandage', 'none', [['fiber', 4], ['berry', 1]]),
  R('bandage', 'none', [['fiber', 2], ['slime_gel', 1]], ['bandage', 2]),
  // กองไฟ
  R('cooked_meat', 'campfire', [['raw_meat', 1]]),
  R('cooked_fish', 'campfire', [['fish', 1]]),
  R('veggie_stew', 'campfire', [['carrot', 2], ['tomato', 1], ['cooked_meat', 1]]),
  R('pumpkin_pie', 'campfire', [['pumpkin', 1], ['berry', 3]]),
  // โต๊ะช่าง
  R('bow', 'workbench', [['wood', 4], ['rope', 3]]),
  R('arrow', 'workbench', [['wood', 1], ['stone', 1]], ['arrow', 6]),
  R('arrow', 'workbench', [['wood', 1], ['bone', 1], ['bat_wing', 1]], ['arrow', 12]),
  R('leather_armor', 'workbench', [['hide', 5], ['rope', 2]]),
  R('fur_coat', 'workbench', [['hide', 3], ['yeti_fur', 1], ['fiber', 4]]),
  R('gunpowder', 'workbench', [['coal', 2], ['sulfur', 1]], ['gunpowder', 2]),
  R('crossbow', 'workbench', [['wood', 6], ['iron_ingot', 2], ['rope', 3]]),
  // เตาหลอม
  R('iron_ingot', 'furnace', [['iron_ore', 2], ['coal', 1]]),
  R('iron_ingot', 'furnace', [['iron_ore', 2], ['wood', 3]]),
  R('gold_ingot', 'furnace', [['gold_ore', 2], ['coal', 1]]),
  // ทั่งตีเหล็ก
  R('gear', 'anvil', [['iron_ingot', 1]], ['gear', 2]),
  R('iron_axe', 'anvil', [['iron_ingot', 3], ['wood', 2]]),
  R('iron_pickaxe', 'anvil', [['iron_ingot', 3], ['wood', 2]]),
  R('iron_sword', 'anvil', [['iron_ingot', 4], ['hide', 1]]),
  R('iron_spear', 'anvil', [['iron_ingot', 3], ['wood', 4]]),
  R('gold_sword', 'anvil', [['gold_ingot', 4], ['iron_ingot', 1]]),
  R('iron_armor', 'anvil', [['iron_ingot', 8], ['hide', 2]]),
  R('iron_armor', 'anvil', [['iron_ingot', 4], ['crab_shell', 3]]),
  R('gold_armor', 'anvil', [['gold_ingot', 6], ['hide', 2]]),
  R('bullet', 'anvil', [['iron_ingot', 1], ['gunpowder', 1]], ['bullet', 10]),
  // โต๊ะช่างกล
  R('engine', 'mech_bench', [['iron_ingot', 6], ['gear', 4], ['gold_ingot', 1]]),
  R('fuel', 'mech_bench', [['coal', 3]], ['fuel', 2]),
  R('flintlock', 'mech_bench', [['iron_ingot', 4], ['gear', 2], ['wood', 3]]),
  R('bomb', 'mech_bench', [['gunpowder', 2], ['iron_ingot', 1], ['fiber', 1]], ['bomb', 2]),
  R('crystal_staff', 'mech_bench', [['crystal', 3], ['gold_ingot', 2], ['wood', 4]]),
  R('crystal_sword', 'mech_bench', [['crystal', 3], ['gold_ingot', 2], ['iron_ingot', 2]]),
  R('meteor_sword', 'mech_bench', [['meteorite', 4], ['crystal', 2], ['iron_ingot', 3]]),
  R('meteor_armor', 'mech_bench', [['meteorite', 6], ['crystal', 2], ['hide', 3]]),
  // ---------- อุปกรณ์สวมใส่ (ชิ้นหายาก/เทพ ได้จากกล่องดรอปเท่านั้น) ----------
  R('leather_cap', 'workbench', [['hide', 2], ['fiber', 4]]),
  R('leather_pants', 'workbench', [['hide', 3], ['rope', 1]]),
  R('leather_boots', 'workbench', [['hide', 2], ['rope', 1]]),
  R('work_gloves', 'workbench', [['hide', 1], ['fiber', 6]]),
  R('travel_cloak', 'workbench', [['fiber', 12], ['rope', 2]]),
  R('fur_cloak', 'workbench', [['hide', 4], ['yeti_fur', 1]]),
  R('snow_boots', 'workbench', [['yeti_fur', 2], ['hide', 2]]),
  R('fang_amulet', 'workbench', [['bone', 4], ['rope', 1]]),
  R('shell_necklace', 'workbench', [['crab_shell', 1], ['rope', 2]]),
  R('wood_shield', 'workbench', [['wood', 10], ['rope', 2]]),
  R('pouch', 'workbench', [['hide', 2], ['rope', 3]]),
  R('leather_backpack', 'workbench', [['hide', 8], ['rope', 4], ['iron_ingot', 1]]),
  R('crab_armor', 'workbench', [['crab_shell', 6], ['hide', 2]]),
  R('crab_shield', 'workbench', [['crab_shell', 4], ['wood', 4]]),
  R('iron_helmet', 'anvil', [['iron_ingot', 4]]),
  R('iron_greaves', 'anvil', [['iron_ingot', 4], ['hide', 1]]),
  R('iron_boots', 'anvil', [['iron_ingot', 3], ['hide', 1]]),
  R('iron_gauntlets', 'anvil', [['iron_ingot', 3], ['hide', 1]]),
  R('iron_shield', 'anvil', [['iron_ingot', 5], ['wood', 3]]),
  R('iron_ring', 'anvil', [['iron_ingot', 2]]),
  R('gold_ring', 'anvil', [['gold_ingot', 2]]),
  R('ruby_ring', 'anvil', [['gold_ingot', 2], ['crystal', 1]]),
  R('samurai_helmet', 'anvil', [['iron_ingot', 5], ['gold_ingot', 1], ['hide', 2]]),
  R('lantern', 'mech_bench', [['iron_ingot', 2], ['crystal', 1], ['coal', 4]]),
  R('miner_helmet', 'mech_bench', [['iron_ingot', 2], ['gear', 2], ['crystal', 1]]),
  R('crystal_amulet', 'mech_bench', [['crystal', 3], ['gold_ingot', 1]]),
  R('jade_ring', 'mech_bench', [['crystal', 2], ['gold_ingot', 1], ['slime_gel', 4]]),
  R('meteor_greaves', 'mech_bench', [['meteorite', 4], ['crystal', 1], ['hide', 2]]),
  R('meteor_ring', 'mech_bench', [['meteorite', 3], ['gold_ingot', 2], ['crystal', 2]]),
  R('explorer_pack', 'mech_bench', [['leather_backpack', 1], ['yeti_fur', 3], ['gear', 2]]),
  // ---------- อาวุธชุดขยาย (ดู data/weapons.ts) — ของขั้นสูง/หายาก ต้องหาแปลนจากกล่อง ----------
  // มือเปล่า
  R('stone_dagger', 'none', [['stone', 3], ['wood', 1], ['fiber', 2]]),
  R('wood_club', 'none', [['wood', 5]]),
  R('sickle', 'none', [['stone', 2], ['wood', 2], ['rope', 1]]),
  R('rope_whip', 'none', [['rope', 4], ['fiber', 4]]),
  R('hand_wraps', 'none', [['fiber', 6], ['rope', 1]]),
  R('slingshot', 'none', [['wood', 2], ['rope', 2]]),
  // โต๊ะช่าง
  R('bone_dagger', 'workbench', [['bone', 4], ['rope', 1]]),
  R('bone_sword', 'workbench', [['bone', 6], ['wood', 2], ['rope', 1]]),
  R('bone_spear', 'workbench', [['bone', 4], ['wood', 4], ['rope', 2]]),
  R('bone_claws', 'workbench', [['bone', 5], ['hide', 1]]),
  R('stone_battleaxe', 'workbench', [['wood', 4], ['stone', 4], ['rope', 2]]),
  R('spiked_club', 'workbench', [['wood', 4], ['bone', 3], ['stone', 2]]),
  R('leather_whip', 'workbench', [['hide', 3], ['rope', 2]]),
  R('short_bow', 'workbench', [['wood', 3], ['rope', 2]]),
  R('long_bow', 'workbench', [['wood', 6], ['rope', 4], ['hide', 1]]),
  R('wood_boomerang', 'workbench', [['wood', 4], ['fiber', 2]]),
  R('javelin', 'workbench', [['wood', 3], ['stone', 2], ['rope', 1]], ['javelin', 3]),
  R('molotov', 'workbench', [['fuel', 1], ['fiber', 2]], ['molotov', 2]),
  R('smoke_bomb', 'workbench', [['coal', 2], ['fiber', 3], ['sulfur', 1]], ['smoke_bomb', 2]),
  R('poison_bomb', 'workbench', [['slime_gel', 3], ['sulfur', 2], ['bat_wing', 1]], ['poison_bomb', 2]),
  // ทั่งตีเหล็ก
  R('iron_dagger', 'anvil', [['iron_ingot', 2], ['hide', 1]]),
  R('venom_dagger', 'anvil', [['iron_ingot', 2], ['slime_gel', 4], ['bat_wing', 2]]),
  R('katana', 'anvil', [['iron_ingot', 5], ['gold_ingot', 1], ['hide', 1]]),
  R('iron_greatsword', 'anvil', [['iron_ingot', 8], ['hide', 2]]),
  R('gold_greatsword', 'anvil', [['gold_ingot', 6], ['iron_ingot', 4]]),
  R('iron_battleaxe', 'anvil', [['iron_ingot', 5], ['wood', 3]]),
  R('crab_cleaver', 'anvil', [['crab_shell', 6], ['iron_ingot', 3], ['wood', 2]]),
  R('iron_mace', 'anvil', [['iron_ingot', 5], ['wood', 2]]),
  R('gold_warhammer', 'anvil', [['gold_ingot', 5], ['iron_ingot', 3], ['wood', 2]]),
  R('gold_trident', 'anvil', [['gold_ingot', 4], ['iron_ingot', 2], ['wood', 3]]),
  R('iron_scythe', 'anvil', [['iron_ingot', 4], ['wood', 4]]),
  R('chain_whip', 'anvil', [['iron_ingot', 4], ['rope', 2]]),
  R('iron_knuckles', 'anvil', [['iron_ingot', 2]]),
  R('composite_bow', 'anvil', [['bone', 4], ['iron_ingot', 2], ['rope', 3], ['hide', 1]]),
  R('heavy_crossbow', 'anvil', [['iron_ingot', 5], ['wood', 4], ['gear', 2]]),
  R('chakram', 'anvil', [['iron_ingot', 4]]),
  R('throwing_knife', 'anvil', [['iron_ingot', 1]], ['throwing_knife', 6]),
  R('shuriken', 'anvil', [['iron_ingot', 1]], ['shuriken', 8]),
  R('flash_bomb', 'anvil', [['gunpowder', 1], ['sulfur', 2], ['iron_ingot', 1]], ['flash_bomb', 2]),
  R('shell', 'anvil', [['iron_ingot', 1], ['gunpowder', 1]], ['shell', 6]),
  R('rifle_round', 'anvil', [['iron_ingot', 1], ['gunpowder', 2]], ['rifle_round', 6]),
  // โต๊ะช่างกล
  R('crystal_dagger', 'mech_bench', [['crystal', 2], ['gold_ingot', 1], ['iron_ingot', 1]]),
  R('frost_sword', 'mech_bench', [['crystal', 2], ['yeti_fur', 3], ['iron_ingot', 3]]),
  R('meteor_greatsword', 'mech_bench', [['meteorite', 6], ['crystal', 2], ['iron_ingot', 4]]),
  R('crystal_battleaxe', 'mech_bench', [['crystal', 3], ['gold_ingot', 2], ['iron_ingot', 3]]),
  R('meteor_maul', 'mech_bench', [['meteorite', 5], ['iron_ingot', 5], ['gear', 2]]),
  R('crystal_halberd', 'mech_bench', [['crystal', 3], ['iron_ingot', 3], ['wood', 4]]),
  R('meteor_lance', 'mech_bench', [['meteorite', 5], ['crystal', 1], ['iron_ingot', 3]]),
  R('shadow_scythe', 'mech_bench', [['crystal', 2], ['bat_wing', 6], ['iron_ingot', 3]]),
  R('fire_whip', 'mech_bench', [['sulfur', 6], ['crystal', 1], ['iron_ingot', 3], ['hide', 2]]),
  R('crystal_knuckles', 'mech_bench', [['crystal', 2], ['gold_ingot', 1], ['iron_ingot', 2]]),
  R('frost_bow', 'mech_bench', [['crystal', 2], ['yeti_fur', 3], ['wood', 4]]),
  R('repeater_crossbow', 'mech_bench', [['iron_ingot', 4], ['gear', 4], ['wood', 4]]),
  R('revolver', 'mech_bench', [['iron_ingot', 5], ['gear', 3], ['gold_ingot', 1]]),
  R('shotgun', 'mech_bench', [['iron_ingot', 6], ['gear', 3], ['wood', 3]]),
  R('rifle', 'mech_bench', [['iron_ingot', 6], ['gear', 4], ['gold_ingot', 2], ['wood', 2]]),
  R('fire_staff', 'mech_bench', [['crystal', 1], ['sulfur', 5], ['gold_ingot', 1], ['wood', 4]]),
  R('frost_staff', 'mech_bench', [['crystal', 1], ['yeti_fur', 2], ['gold_ingot', 1], ['wood', 4]]),
  R('lightning_staff', 'mech_bench', [['crystal', 2], ['gold_ingot', 2], ['iron_ingot', 2], ['wood', 3]]),
  R('poison_staff', 'mech_bench', [['crystal', 1], ['slime_gel', 6], ['bat_wing', 3], ['wood', 4]]),
  R('ice_bomb', 'mech_bench', [['gunpowder', 1], ['yeti_fur', 1], ['slime_gel', 2]], ['ice_bomb', 2]),
  R('cluster_bomb', 'mech_bench', [['bomb', 2], ['gear', 1], ['gunpowder', 2]], ['cluster_bomb', 2]),
  // ---------- ของจากสัตว์ชุดใหม่ + อาวุธเวท ----------
  R('arrow', 'workbench', [['wood', 1], ['stone', 1], ['feather', 1]], ['arrow', 10]),
  R('poison_bomb', 'workbench', [['venom_sac', 1], ['sulfur', 1], ['fiber', 2]], ['poison_bomb', 2]),
  R('apprentice_wand', 'workbench', [['wood', 2], ['antler', 1], ['glow_dust', 3]]),
  R('water_staff', 'mech_bench', [['pearl', 1], ['turtle_shell', 1], ['crystal', 1], ['wood', 4]]),
  R('wind_staff', 'mech_bench', [['feather', 8], ['crystal', 1], ['gold_ingot', 1], ['wood', 4]]),
  R('earth_staff', 'mech_bench', [['stone', 20], ['iron_ingot', 2], ['crystal', 1], ['wood', 4]]),
  R('fire_tome', 'mech_bench', [['hide', 3], ['sulfur', 6], ['crystal', 1], ['gold_ingot', 1]]),
  R('blood_staff', 'mech_bench', [['shark_tooth', 4], ['bone', 6], ['crystal', 2], ['gold_ingot', 1]]),
  // วัสดุสัตว์ในตำนาน
  R('holy_staff', 'mech_bench', [['kochasi_tusk', 1], ['gold_ingot', 3], ['crystal', 2], ['glow_dust', 4]]),
  R('abyss_tome', 'mech_bench', [['kraken_ink', 2], ['hide', 3], ['crystal', 2], ['gold_ingot', 1]]),
  R('storm_wand', 'mech_bench', [['qilin_horn', 1], ['gold_ingot', 2], ['crystal', 2]]),
  R('glacier_orb', 'mech_bench', [['frost_dragon_scale', 3], ['crystal', 3], ['gold_ingot', 2]]),
  R('gaia_orb', 'mech_bench', [['jade_shell', 1], ['stone', 20], ['crystal', 2], ['gold_ingot', 2]]),
  R('naga_staff', 'mech_bench', [['naga_scale', 5], ['crystal', 3], ['gold_ingot', 3], ['wood', 4]]),
  R('garuda_tome', 'mech_bench', [['garuda_feather', 5], ['hide', 3], ['gold_ingot', 3], ['crystal', 2]]),
  R('phoenix_orb', 'mech_bench', [['phoenix_feather', 4], ['meteorite', 2], ['crystal', 3], ['gold_ingot', 2]]),
];

// ---------- วัสดุก่อสร้าง + เมนูครัว (ระบบบ้าน/อาคาร) ----------
// ไม้กระดาน/อิฐ/กระจก/เหล็กกล้า ใช้สร้างบ้านขั้นสูง · โรงเลื่อยผลิตไม้กระดานได้คุ้มกว่า (ไม้ 2 → 3)
RECIPES.push(
  R('plank', 'workbench', [['wood', 2]], ['plank', 2]),
  R('brick', 'furnace', [['stone', 2], ['wood', 1]], ['brick', 2]),
  R('brick', 'furnace', [['stone', 3], ['coal', 1]], ['brick', 4]),
  R('glass', 'furnace', [['stone', 2], ['coal', 1]], ['glass', 2]),
  R('steel_plate', 'furnace', [['iron_ingot', 2], ['coal', 2]]),
  // ครัว (สร้างครัวในหมวดเครื่องจักร — ใช้แทนกองไฟได้ด้วย)
  R('fried_egg', 'kitchen', [['egg', 2]]),
  R('skewer', 'kitchen', [['raw_meat', 2], ['honey', 1]], ['skewer', 3]),
  R('fruit_juice', 'kitchen', [['berry', 4], ['tomato', 1]], ['fruit_juice', 2]),
  R('fruit_juice', 'kitchen', [['cactus_fruit', 2], ['honey', 1]], ['fruit_juice', 2]),
  R('tom_yum', 'kitchen', [['fish', 1], ['tomato', 1], ['carrot', 1]]),
  R('pumpkin_curry', 'kitchen', [['pumpkin', 1], ['cooked_meat', 1], ['egg', 1]]),
  R('honey_cake', 'kitchen', [['honey', 2], ['egg', 2], ['berry', 3]]),
  R('veggie_stew', 'kitchen', [['carrot', 2], ['tomato', 1], ['raw_meat', 1]], ['veggie_stew', 2]),
  R('cooked_fish', 'kitchen', [['fish', 2]], ['cooked_fish', 2]),
  R('cooked_meat', 'kitchen', [['raw_meat', 2]], ['cooked_meat', 2]),
);

// ---------- สมดุลร่างกาย + วัตถุดิบจากการเก็บทุกอย่าง (กิจกรรมตามเวลาจริง) ----------
RECIPES.push(
  R('clean_water', 'campfire', [['dirty_water', 1]]),
  R('clean_water', 'campfire', [['ice_shard', 2]]),
  R('baked_potato', 'campfire', [['wild_potato', 1]]),
  R('flatbread', 'campfire', [['wild_grain', 3]]),
  R('flower_tea', 'campfire', [['petals', 3], ['clean_water', 1]]),
  R('herbal_medicine', 'none', [['herb', 3], ['fiber', 1]]),
  R('bandage', 'none', [['cloth', 1], ['herb', 1]], ['bandage', 2]),
  R('rope', 'none', [['cloth', 1]], ['rope', 2]),
  R('iron_ingot', 'furnace', [['scrap_metal', 3], ['coal', 1]]),
  R('glass', 'furnace', [['obsidian', 1]], ['glass', 3]),
  R('arrow', 'workbench', [['wood', 1], ['obsidian', 1]], ['arrow', 10]),
  R('torch', 'none', [['wood', 1], ['crystal_shard', 1]], ['torch', 2]),
  R('shell_necklace', 'workbench', [['shell', 6], ['rope', 1]]),
  R('fruit_juice', 'kitchen', [['mango', 1], ['dragonfruit', 1]], ['fruit_juice', 3]),
  R('tom_yum', 'kitchen', [['fish', 1], ['seaweed', 2], ['herb', 1]]),
);

// สูตรทางเลือก (ไอเทมเดียวกัน สถานีเดียวกัน แต่ใช้วัตถุดิบต่างกัน) → id ไม่ซ้ำ: xxx@station#2
{
  const seen = new Map<string, number>();
  for (const r of RECIPES) {
    const n = (seen.get(r.id) ?? 0) + 1;
    seen.set(r.id, n);
    if (n > 1) r.id = `${r.id}#${n}`;
  }
}
