import { ALL_ITEMS, ALL_ITEMS_GRANT } from '../config/allItems';
import type { RunSave } from '../core/SaveManager';
import { EventBus } from '../core/EventBus';
import { BLUEPRINT_ITEM } from '../data/blueprints';
import { ITEMS, ITEM_LIST, type ItemDef } from '../data/items';
import { ITEM_CATS, catOf, type ItemCat } from '../data/loadout';
import type { GameScene } from '../scenes/GameScene';

/**
 * โหมดของครบ (ทุกคน) — ดู config/allItems.ts
 *   เงินไม่จำกัด (Wallet.unlimited) · รู้แปลนทุกใบ · วัสดุสร้าง/คราฟต์/อัพเกรด/ซ่อมไม่จำกัด (MaterialPool.unlimited)
 *   หีบ "คลังเสบียงไม่จำกัด" ข้างตู้จดหมาย (ui/SupplyWindow.ts) · ชุดเริ่มต้นในกระเป๋า (เกมใหม่ + เซฟเก่า 1 ครั้ง)
 */

/** หมวดในคลังเสบียง — ชุดเดียวกับหมวดในกระเป๋า (data/loadout.ts) */
export const SUPPLY_TABS: { id: SupplyTab; name: string }[] = [{ id: 'all', name: 'ทั้งหมด' }, ...ITEM_CATS.map((c) => ({ id: c.id, name: `${c.icon} ${c.name}` }))];
export type SupplyTab = ItemCat | 'all';

export function supplyTabOf(d: ItemDef): ItemCat {
  return catOf(d);
}

let LIST: ItemDef[] | null = null;
/** ของทุกชิ้นในเกม (ยกเว้นแปลน = รู้หมดแล้ว และเหรียญ/เพชร = เงินไม่จำกัดอยู่แล้ว) */
export function supplyItems(): ItemDef[] {
  return (LIST ??= ITEM_LIST.filter((d) => d.type !== 'blueprint' && d.id !== 'coin' && d.id !== 'gem'));
}

/** ชุดเริ่มต้นในกระเป๋า: เครื่องมือดีสุด อาวุธแรง คบไฟ อาหาร น้ำ ยา วัสดุก่อสร้าง */
function starterKit(): [string, number][] {
  const best = (score: (d: ItemDef) => number) => supplyItems().reduce((a, d) => (score(d) > score(a) ? d : a)).id;
  const axe = best((d) => d.tool?.tree ?? 0);
  const pick = best((d) => d.tool?.rock ?? 0);
  const ids = [axe, pick, 'thunder_blade', 'storm_bow', 'torch', 'fishing_rod'].filter((id, i, a) => ITEMS[id] && a.indexOf(id) === i);
  const kit: [string, number][] = ids.map((id) => [id, 1]);
  for (const id of ['cooked_meat', 'clean_water', 'bandage', 'wood', 'stone', 'plank', 'iron_ingot', 'coal', 'arrow']) if (ITEMS[id]) kit.push([id, ITEMS[id].stack]);
  return kit;
}

/** เรียกใน GameScene.create หลังโหลดเซฟ — เปิดโหมด + แจกของครั้งแรก (เกมใหม่/เซฟเก่าที่ยังไม่เคยได้) */
export function setupAllItems(gs: GameScene, save: RunSave | null) {
  if (!ALL_ITEMS) return;
  gs.wallet.setUnlimited(true);
  for (const k of BLUEPRINT_ITEM.keys()) gs.learned.add(k); // แปลนจากกล่องต่อจากนี้ = ซ้ำ → แลกเหรียญ
  // หมายเหตุ: ยังให้ "เลือกแปลนเริ่มต้น" (การ์ดฐาน+อาวุธ) ตอนเกมใหม่ตามปกติ — เป็นฉากเปิดที่ผู้ใช้เลือกดีไซน์ไว้ และปักหมุดฐานแรกให้ผู้เล่น
  gs.allItemsGrant = save?.allItems ?? 0;
  if (gs.allItemsGrant >= ALL_ITEMS_GRANT) return;
  gs.allItemsGrant = ALL_ITEMS_GRANT;
  const inv = gs.player.inventory;
  let skipped = 0;
  for (const [id, n] of starterKit()) skipped += inv.add(id, n) > 0 ? 1 : 0; // กระเป๋าเต็ม = ข้าม (หยิบเพิ่มได้จากคลังเสบียง)
  const at = inv.slots.findIndex((s) => s?.id === 'thunder_blade');
  if (at >= 0 && at < 8) gs.player.selected = at;
  inv.version++;
  // การ์ดแนะนำหลังฉากเปิด (เกมใหม่) หรือหลังเข้าเกม (เซฟเก่า)
  const tell = () => {
    // การ์ดสั้น 3 บรรทัด (แสดงครั้งเดียว · ซ่อนเองใน ~8 วิ)
    EventBus.emit('ui:guide', '♾ โหมดของครบ', [
      'เงิน/เพชร ∞ · รู้แปลนทุกใบ · ไม่ใช้วัสดุ',
      'หีบทองข้างตู้จดหมาย = คลังเสบียง',
      skipped ? 'ชุดเริ่มต้นอยู่ในกระเป๋า (ที่เหลือหยิบจากคลัง)' : 'ชุดเริ่มต้นอยู่ในกระเป๋าแล้ว',
    ]);
    gs.time.delayedCall(16500, () => gs.guide.showControls());
  };
  const wait = gs.time.addEvent({ delay: 500, loop: true, callback: () => {
    if (!gs.introSeen) return;
    wait.remove(false);
    gs.time.delayedCall(save ? 2500 : 900, tell);
  } });
  gs.time.delayedCall(1000, () => gs.autosave());
}
