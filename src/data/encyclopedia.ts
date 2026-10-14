import { BIOMES, nodeTable, SPECIALTY_NAMES, type Biome, type Specialty } from './islands';
import { ITEMS, type ItemDef } from './items';
import { SLOT_NAME, TRAIN_CAP, gearMult, statLine, type Stats } from './equipment';
import { LOOT_GROUPS, RARITY, plusMult } from './loot';
import { BAND_INFO, MAX_LEVEL, UP_CATEGORY_NAMES, bandOf, itemDurMult, upCategoryOfItem } from './upgrade';
import { baseMobs } from './mobs';
import { RECIPES, STATION_NAMES } from './recipes';
import { SPECIAL_TEXT, THROW_TEXT, WEAPON_CLASSES, statusText } from './weapons';
import { NODE_SPECS } from '../entities/ResourceNode';
import { BUILDABLES } from './buildables';
import { isHiddenRecipe, isPart, rawCostOfRecipe } from '../systems/CraftingSystem';
import type { NodeType } from '../world/WorldGenerator';

export const NODE_NAMES: Record<NodeType, string> = {
  tree: 'ต้นไม้ (ตัดด้วยมือ/ขวาน)', rock: 'ก้อนหิน (ต้องใช้อีเต้อ)', bush: 'พุ่มเบอร์รี่ (กด E)', grass: 'กอหญ้า (กด E)',
  cactus: 'กระบองเพชร (ตัด)', wild_crop: 'พืชป่า (กด E)', ore_iron: 'สายแร่เหล็ก (อีเต้อหิน+)', ore_gold: 'สายแร่ทอง (อีเต้อเหล็ก)',
  ore_coal: 'สายแร่ถ่านหิน (อีเต้อหิน+)', ore_sulfur: 'สายแร่กำมะถัน (อีเต้อหิน+)', crystal: 'ผลึกคริสตัล (อีเต้อเหล็ก)',
  meteor_rock: 'หินอุกกาบาต (ตกตอนภัยฝนอุกกาบาต · อีเต้อเหล็ก)', ruin_chest: 'หีบสมบัติบนเกาะซากโบราณ/เกาะหมอกผี',
  bamboo: 'กอไผ่ (ตัดด้วยมือ/ขวาน — เกาะป่าไผ่)', coral: 'ปะการัง (อีเต้อ — เกาะปะการังวงแหวน)', shroom: 'เห็ดเรืองแสง (กด E)',
};

const SPECIAL_ITEM: Record<Specialty, string> = { iron: 'iron_ore', coal: 'coal', sulfur: 'sulfur', gold: 'gold_ore', crystal: 'crystal' };

/** แหล่งที่มาของไอเทม (คำนวณจากข้อมูลเกมจริงทั้งหมด) */
export function itemSources(id: string): string[] {
  const out: string[] = [];
  // ทรัพยากรธรรมชาติ
  const nodes = (Object.keys(NODE_SPECS) as NodeType[]).filter((n) => NODE_SPECS[n].drops.some((d) => d.item === id));
  for (const n of nodes) {
    const biomes = (Object.keys(BIOMES) as Biome[]).filter((b) => ['land', 'forest', 'stone', 'sand', 'brick'].some((t) => nodeTable(b, t).some(([x]) => x === n)));
    const names = biomes.filter((b) => b !== 'central').map((b) => BIOMES[b].name.replace('เกาะ', ''));
    const where = names.length ? ` — เกาะ${names.slice(0, 3).join('/')}${names.length > 3 ? '…' : ''}` : '';
    out.push(`⛏ ${NODE_NAMES[n]}${where}`);
  }
  const spec = (Object.keys(SPECIAL_ITEM) as Specialty[]).find((s) => SPECIAL_ITEM[s] === id);
  if (spec) out.push(`🏝 แร่ประจำเกาะ: เกาะที่มีแร่เด่น "${SPECIALTY_NAMES[spec]}" (ดูบนแผนที่) — หรือแลกที่เกาะกลาง`);
  // คราฟต์
  for (const r of RECIPES.filter((x) => x.output.item === id && !isHiddenRecipe(x))) {
    out.push(`🔨 คราฟต์ที่${STATION_NAMES[r.station]}: ${rawCostOfRecipe(r).map(([i, n]) => `${ITEMS[i]?.name ?? i}×${n}`).join(' + ')}${r.output.qty > 1 ? ` → ×${r.output.qty}` : ''}`);
  }
  // ชิ้นส่วนกลาง: ไม่ต้องทำเอง (แปลนแตกเป็นของดิบ) — ได้จากเครื่องผลิตอัตโนมัติ
  if (isPart(id)) {
    const makers = BUILDABLES.filter((b) => b.prod?.recipes.some((pr) => pr.out.some(([o]) => o === id))).map((b) => b.name);
    out.push(`🏭 ${makers.length ? `ผลิตอัตโนมัติ: ${makers.join(', ')}` : 'ชิ้นส่วนกลาง'} — ไม่ต้องทำเอง แปลนใช้ของดิบแทน (มีในกระเป๋าจะถูกใช้ก่อน)`);
  }
  // มอนสเตอร์
  const mobs = baseMobs().filter((m) => m.drops.some((d) => d.item === id));
  if (mobs.length) out.push(`⚔ ดรอปจาก: ${mobs.map((m) => m.name).join(', ')}`);
  // กล่อง
  const groups = Object.values(LOOT_GROUPS).filter((g) => g.entries.some((e) => e.item === id));
  if (groups.length) {
    const r = groups[0].entries.find((e) => e.item === id)!.rarity;
    out.push(`🎁 สุ่มได้จากกล่อง (กลุ่ม${groups.map((g) => g.name).join('/')} · ระดับ${RARITY[r].name})`);
  }
  if (id === 'fish' || id === 'golden_fish') out.push('🎣 ตกปลาด้วยคันเบ็ดริมน้ำ');
  if (id === 'coin') out.push('💰 ขายของที่เกาะกลาง/เรือพ่อค้า · มอนสเตอร์ · ภารกิจ · ตู้จดหมายรายวัน');
  if (id.startsWith('elixir_')) out.push('⚔ ฆ่ามอนสเตอร์/บอส → เปิดกล่องดรอป (ยิ่งกล่องสูง ยิ่งได้ผลึกดี) · บอสดรอปแน่นอน');
  if (id.startsWith('box_')) out.push(id === 'box_wood' ? '🎁 ดรอปจากมอนสเตอร์ · รอดภัยพิบัติ · ตกปลา · ตู้จดหมาย · หีบดันเจี้ยน' : `🎁 ดรอปจากมอนสเตอร์/บอส · รอดภัย · หีบสมบัติ · ผู้รอดชีวิตคู่แข่ง — ${id === 'box_iron' ? 'บนเกาะเราได้จากบอสดันเจี้ยน/คืนบอสเท่านั้น' : 'ต้องไปเขตผจญภัย (เกาะอื่น) หรือซื้อด้วยเพชรที่เกาะกลาง'}`);
  if (!out.length) out.push('ซื้อที่เกาะกลางหรือเรือพ่อค้า');
  return out;
}

/** คำอธิบายเต็มของไอเทม (ใช้ใน tooltip / คู่มือ) */
export function itemInfo(def: ItemDef, plus = 0): string[] {
  const lv = 1 + plus;
  const band = bandOf(lv);
  const lines = [`${def.enhanceable ? `Lv.${lv}${band ? ` ${BAND_INFO[band].name}` : ''} ` : ''}${def.name}  ·  ${RARITY[def.rarity ?? 'common'].name}  ·  มูลค่า ${def.value}`, def.desc];
  if (def.food) {
    const f = def.food;
    lines.push([f.hunger && `อิ่ม +${f.hunger}`, f.thirst && `น้ำ +${f.thirst}`, f.hp && `HP ${f.hp > 0 ? '+' : ''}${f.hp}`, f.sanity && `สติ ${f.sanity > 0 ? '+' : ''}${f.sanity}`].filter(Boolean).join('  '));
  }
  const m = plusMult(plus);
  if (def.tool) lines.push(`ดาเมจ ${Math.round(def.tool.damage * m)} · ตัดไม้ ${def.tool.tree} · ขุด ${def.tool.rock} · ระยะ ${def.tool.range}`);
  const pellets = def.ranged?.pellets ?? (def.weaponClass ? WEAPON_CLASSES[def.weaponClass].pellets : undefined) ?? 1;
  if (def.ranged) lines.push(`ดาเมจ ${Math.round(def.ranged.damage * m)}${pellets > 1 ? ` ×${pellets} ลูก` : ''} · ยิงทุก ${def.ranged.cooldown} วิ · ${def.ranged.ammo ? `ใช้${ITEMS[def.ranged.ammo].name}` : 'ไม่ใช้กระสุน'}${def.ranged.pierce ? ' · ทะลุ' : ''}`);
  if (def.ranged?.mana) lines.push(`🔮 ร่ายเวท ใช้สแตมินา ${def.ranged.mana} ต่อครั้ง`);
  // ชนิดอาวุธ + ความเร็ว + สถานะ + พลังพิเศษ
  if (def.weaponClass) {
    const c = WEAPON_CLASSES[def.weaponClass];
    const extra = [c.speed && c.speed !== 1 && `ความเร็วโจมตี ×${c.speed}`, c.maxHits && `ฟันโดนสูงสุด ${c.maxHits} ตัว`, c.combo && 'ต่อคอมโบได้', c.armorPierce && `ทะลุเกราะ ${Math.round(c.armorPierce * 100)}%`]
      .filter(Boolean).join(' · ');
    lines.push(`⚔ ${c.name}: ${c.hint}${extra ? ` (${extra})` : ''}`);
    const st = [...(c.status ? [c.status] : []), ...(def.status ?? [])];
    if (st.length) lines.push(`สถานะ: ${st.map(statusText).join(' · ')}`);
  } else if (def.status?.length) lines.push(`สถานะ: ${def.status.map(statusText).join(' · ')}`);
  const crit = (def.weaponClass ? WEAPON_CLASSES[def.weaponClass].crit ?? 0 : 0) + (def.critBonus ?? 0);
  if (crit && (def.tool || def.ranged)) lines.push(`คริติคอล +${crit}%`);
  if (def.chain) lines.push(`⚡ สายฟ้ากระโดดไปหาศัตรูอีก ${def.chain} ตัว`);
  if (def.special) lines.push(SPECIAL_TEXT[def.special]);
  if (def.equip) {
    const slot = def.equip.slot === 'ring' ? 'แหวน (ใส่ได้ 2 วง)' : SLOT_NAME[def.equip.slot];
    lines.push(`สวมที่ช่อง: ${slot}`);
    lines.push(statLine(def.equip.stats, gearMult(plus)));
  }
  if (def.tool && def.type === 'weapon') lines.push('สวมเป็นอาวุธหลักได้ (F) — ใช้โจมตีตอนถือของอื่น');
  if (def.ranged) lines.push('สวมเป็นอาวุธหลักได้ (F)');
  if (def.throw) {
    const k = def.throw.kind ?? 'bomb';
    const thrown = k === 'knife' || k === 'shuriken' || k === 'javelin';
    lines.push(thrown ? `ดาเมจ ${def.throw.damage} · ${THROW_TEXT[k]}` : `ดาเมจ ${def.throw.damage} · รัศมี ${def.throw.radius} · ${THROW_TEXT[k]}${def.throw.dur ? ` (${def.throw.dur} วิ)` : ''}`);
  }
  if (def.elixir) {
    lines.push(`ใช้แล้วได้ถาวร: ${statLine(def.elixir.gains)}`);
    lines.push(`เพดาน: ${(Object.keys(def.elixir.gains) as (keyof Stats)[]).map((k) => statLine({ [k]: TRAIN_CAP[k] })).join(' · ')}`);
  }
  if (def.enhanceable) {
    const cat = upCategoryOfItem(def);
    const dur = def.tool?.durability ?? def.ranged?.durability ?? def.equip?.durability;
    lines.push(`⬆ อัพเกรด ${lv}/${MAX_LEVEL} (${cat ? UP_CATEGORY_NAMES[cat] : ''}) · ค่าสถานะ ×${plusMult(plus).toFixed(2)}${dur ? ` · ทนทาน ${Math.round(dur * itemDurMult(lv))}` : ''}`);
  }
  return lines;
}
