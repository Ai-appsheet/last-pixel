import Phaser from 'phaser';
import type { Slot } from '../components/Inventory';
import { Sfx } from '../core/AudioManager';
import type { RunSave } from '../core/SaveManager';
import { EventBus } from '../core/EventBus';
import { hasAnvil } from '../data/buildables';
import { statLine, type EquipSlot } from '../data/equipment';
import { ITEMS } from '../data/items';
import { BAND_INFO, BUILD_LEVEL, MAX_LEVEL, VEHICLE_LEVEL, bandOf, itemDurMult, levelOfSlot, upCategoryOfBuild, upCategoryOfItem, type UpCategory, type UpgradeCost } from '../data/upgrade';
import { Vehicle } from '../entities/Boat';
import type { Structure } from '../entities/Structure';
import type { GameScene } from '../scenes/GameScene';
import { FONT } from '../ui/widgets';
import { bandName, buildUpgradeCost, itemUpgradeCost, lockLabel } from './upgradeCosts';

export { bandName, buildRarity, buildUpgradeCost, costText, itemBaseCost, itemStatAt, itemUpgradeCost, lockLabel } from './upgradeCosts';

/** ของที่อัพเกรดในโลกได้ */
export type UpTarget = Structure | Vehicle;
/** ตำแหน่งไอเทม: เลขช่องกระเป๋า หรือช่องสวมใส่ */
export type ItemRef = number | EquipSlot;

/** ของเก่าจากระบบตีบวก — โหลดเซฟแล้วแปลงเป็นเหรียญ */
const OBSOLETE = ['lucky_charm', 'protect_scroll'];

// ======================================================================
// ระบบอัพเกรดในเกม
// ======================================================================
export class UpgradeSystem {
  private badge: Phaser.GameObjects.Text;
  private sparkT = 0;
  private badgeT = 0;

  constructor(private s: GameScene) {
    this.badge = s.add.text(0, 0, '', { fontFamily: FONT, fontSize: '7px', fontStyle: '700', color: '#ffcd75', stroke: '#0b0d1f', strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 1).setDepth(1e6 + 20).setVisible(false);
  }

  // ---------------------------------------------------------------- ตรวจ/จ่าย
  /** ของที่ขาด (คืนรายการ + ข้อความ) */
  missing(c: UpgradeCost): { text: string; ok: boolean } {
    const s = this.s;
    if (s.creative) return { text: '', ok: true };
    const inv = s.materials(); // กระเป๋า + คลังในฐาน
    const miss: string[] = [];
    for (const [i, n] of c.items) if (inv.count(i) < n) miss.push(`${ITEMS[i]?.name ?? i} ${inv.count(i)}/${n}`);
    if (s.wallet.coins < c.coins) miss.push(`เหรียญ ${s.wallet.coins.toLocaleString()}/${c.coins.toLocaleString()}`);
    return { text: miss.join(' · '), ok: !miss.length };
  }

  /** ยังไม่รู้แปลนอัพเกรดที่ต้องใช้ → ข้อความ 🔒 (null = ผ่าน) */
  lock(c: UpgradeCost, cat: UpCategory, toLv: number): string | null {
    if (!c.needKey || this.s.knows(c.needKey)) return null;
    return `🔒 ${lockLabel(cat, toLv)} (สุ่มได้จากกล่องทอง/เพชร)`;
  }

  /** บรรทัดเช็กลิสต์ค่าอัพ: ✔/✘ ต่อรายการ */
  costLines(c: UpgradeCost): string {
    const s = this.s;
    const inv = s.materials();
    const mark = (ok: boolean) => (s.creative ? '' : ok ? '✔' : '✘');
    return [
      ...c.items.map(([i, n]) => `${mark(inv.count(i) >= n)}${ITEMS[i]?.name ?? i} ${s.creative ? n : `${Math.min(inv.count(i), 9999)}/${n}`}`),
      `${mark(s.wallet.coins >= c.coins)}💰${c.coins.toLocaleString()}`,
    ].join(' · ');
  }

  private pay(c: UpgradeCost) {
    const s = this.s;
    if (s.creative) return;
    const inv = s.materials();
    for (const [i, n] of c.items) inv.remove(i, n);
    s.wallet.spend(c.coins);
  }

  /** มีทั่งตีเหล็ก (หรือสิ่งก่อสร้างที่ใช้แทนทั่ง) บนเกาะเรา */
  hasAnvil(): boolean {
    return this.s.creative || this.s.structureList().some((st) => !st.getData('foreign') && hasAnvil(st.def));
  }

  // ---------------------------------------------------------------- ไอเทม
  slotOf(ref: ItemRef): Slot | null {
    const p = this.s.player;
    return typeof ref === 'string' ? p.equip[ref] : p.inventory.slots[ref] ?? null;
  }

  /** สถานะการอัพไอเทม: cost + เหตุผลที่อัพไม่ได้ (err) */
  checkItem(ref: ItemRef): { slot: Slot | null; lv: number; cost: UpgradeCost | null; err: string | null } {
    const slot = this.slotOf(ref);
    const def = slot ? ITEMS[slot.id] : undefined;
    const cat = upCategoryOfItem(def);
    const lv = levelOfSlot(slot);
    if (!slot || !cat) return { slot, lv, cost: null, err: 'เลือกอาวุธ เครื่องมือ หรืออุปกรณ์สวมใส่' };
    const cost = itemUpgradeCost(slot.id, lv);
    if (!cost) return { slot, lv, cost: null, err: `อัพเกรดสูงสุดแล้ว (Lv.${MAX_LEVEL})` };
    const lock = this.lock(cost, cat, lv + 1);
    if (lock) return { slot, lv, cost, err: lock };
    if (lv + 1 >= 4 && !this.hasAnvil()) return { slot, lv, cost, err: '⚒ Lv.4 ขึ้นไปต้องมีทั่งตีเหล็กบนเกาะของคุณ' };
    const m = this.missing(cost);
    return { slot, lv, cost, err: m.ok ? null : `ขาด: ${m.text}` };
  }

  /** อัพเกรดไอเทม — สำเร็จ 100% */
  upgradeItem(ref: ItemRef): { ok: boolean; msg: string } {
    const s = this.s;
    const r = this.checkItem(ref);
    if (r.err || !r.slot || !r.cost) {
      Sfx.play('error', 250);
      return { ok: false, msg: r.err ?? 'อัพเกรดไม่ได้' };
    }
    const slot = r.slot;
    const def = ITEMS[slot.id];
    const from = r.lv;
    this.pay(r.cost);
    slot.plus = from; // plus = เลเวล − 1 → เลเวลใหม่ = from + 1
    const to = from + 1;
    const dur = def.tool?.durability ?? def.ranged?.durability ?? def.equip?.durability ?? def.light?.durability;
    if (slot.dur !== undefined && dur && Number.isFinite(dur)) slot.dur = Math.round(dur * itemDurMult(to)); // อัพแล้วซ่อมเต็ม
    const p = s.player;
    p.inventory.version++;
    p.recalc();
    EventBus.emit('enhance:ok');
    EventBus.emit('enhance:level', slot.plus);
    EventBus.emit('upgrade', 'item', slot.id, to);
    const band = bandOf(to);
    const newLook = band && bandOf(from) !== band;
    Sfx.play(newLook ? 'achievement' : 'levelUp');
    s.fx.sparks(p.x, p.y - 8, band ? BAND_INFO[band].color : 0xa7f070, newLook ? 16 : 10, 22);
    s.fx.ring(p.x, p.y - 4, band ? BAND_INFO[band].color : 0xffcd75, 18);
    const msg = `⬆ ${def.name} Lv.${to}!${newLook ? ` — โฉมใหม่: ${BAND_INFO[band!].name}` : ''}`;
    EventBus.emit('toast', msg, band ? BAND_INFO[band].css : '#a7f070');
    return { ok: true, msg };
  }

  // ---------------------------------------------------------------- สิ่งก่อสร้าง / ยาน
  isOwn(t: UpTarget): boolean {
    if (t instanceof Vehicle) return !t.getData('foreign');
    const w = this.s.world;
    return !t.getData('foreign') && (w.islandAt(t.tx, t.ty) === w.home || !!t.def.anywhere || t.def.layer === 'boat');
  }

  checkBuild(t: UpTarget): { cost: UpgradeCost | null; err: string | null } {
    const cat = upCategoryOfBuild(t.def);
    if (!cat) return { cost: null, err: 'อัพเกรดไม่ได้' };
    const cost = buildUpgradeCost(t.def, t.lv);
    if (!cost) return { cost: null, err: `อัพเกรดสูงสุดแล้ว (Lv.${MAX_LEVEL})` };
    if (!this.isOwn(t)) return { cost, err: 'อัพเกรดได้เฉพาะของบนเกาะคุณ' };
    if (t instanceof Vehicle && t.riding) return { cost, err: 'ลงจากยานก่อน' };
    const lock = this.lock(cost, cat, t.lv + 1);
    if (lock) return { cost, err: lock };
    const m = this.missing(cost);
    return { cost, err: m.ok ? null : `ขาด: ${m.text}` };
  }

  /** อัพเกรดสิ่งก่อสร้าง/ยาน — เลเวล +1 ทันที เปลี่ยนโฉม + ค่าสถานะ + ซ่อมเต็ม */
  upgradeBuild(t: UpTarget): boolean {
    const s = this.s;
    const { cost, err } = this.checkBuild(t);
    if (err || !cost) {
      Sfx.play('error', 250);
      EventBus.emit('toast', err ?? 'อัพเกรดไม่ได้', '#ef7d57');
      return false;
    }
    this.pay(cost);
    const from = t.lv;
    t.setLevel(from + 1, true);
    const to = t.lv;
    const band = bandOf(to);
    const newLook = band && bandOf(from) !== band;
    const color = band ? BAND_INFO[band].color : 0xa7f070;
    const top = t.getTopCenter();
    s.fx.sparks(t.x, (t.y + top.y) / 2, color, newLook ? 22 : 12, 26);
    s.fx.poof(t.x, t.y - 2, color, newLook ? 12 : 6);
    s.tweens.add({ targets: t, scaleX: { from: 1.15, to: 1 }, scaleY: { from: 0.85, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    t.setTintFill(0xffffff);
    s.time.delayedCall(90, () => t.active && t.clearTint());
    if (newLook) s.cameras.main.flash(160, 255, 240, 200);
    Sfx.play(newLook ? 'achievement' : 'levelUp');
    if (!(t instanceof Vehicle) && t.def.buff) s.refreshBaseBuffs(true);
    EventBus.emit('upgrade', t instanceof Vehicle ? 'vehicle' : 'build', t.def.id, to);
    EventBus.emit('toast', `⬆ ${t.def.name} Lv.${to}!${newLook ? ` — โฉมใหม่: ${BAND_INFO[band!].name}` : ''}`, band ? BAND_INFO[band].css : '#a7f070');
    return true;
  }

  /** สิ่งก่อสร้าง/ยานที่ตำแหน่งนี้ (โหมดอัพเกรด) */
  targetAt(wx: number, wy: number): UpTarget | null {
    const s = this.s;
    const tx = Math.floor(wx / 16);
    const ty = Math.floor(wy / 16);
    const v = s.boatList().find((b) => !b.riding && Phaser.Math.Distance.Between(b.x, b.y, wx, wy) < Math.max(14, b.width * 0.4));
    const st = s.structureAt(tx, ty, 'object') ?? s.structureAt(tx, ty, 'boat') ?? s.structureAt(tx, ty, 'floor');
    const t = v ?? st ?? null;
    return t && upCategoryOfBuild(t.def) ? t : null;
  }

  /** ของที่อัพได้ใกล้ที่สุด (ชนิดนี้) ภายในระยะ px — ใช้กับสมุดแปลน */
  nearestOf(defId: string, range: number): UpTarget | null {
    const p = this.s.player;
    let best: UpTarget | null = null;
    let bd = range;
    const list: UpTarget[] = [...this.s.structureList(), ...this.s.boatList()];
    for (const o of list) {
      if (o.def.id !== defId || !this.isOwn(o)) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, o.x, o.y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** ค่าสถานะที่เปลี่ยนเมื่ออัพ lv → lv+1 (ข้อความสั้นๆ) */
  previewLines(t: UpTarget): string[] {
    const lv = t.lv;
    const n = Math.min(MAX_LEVEL, lv + 1);
    const arrow = (a: number | string, b: number | string) => `${a}→${b}`;
    const out: string[] = [];
    if (t instanceof Vehicle) {
      const v = t.spec;
      out.push(`HP ${arrow(t.maxHp, Math.round(v.hp * VEHICLE_LEVEL.hp(n)))}`, `ความเร็ว ${arrow(Math.round(v.speed * VEHICLE_LEVEL.speed(lv)), Math.round(v.speed * VEHICLE_LEVEL.speed(n)))}`);
      if (v.fuel) out.push(`กินน้ำมัน ×${VEHICLE_LEVEL.fuelUse(n).toFixed(2)}`);
      if (v.cargo) out.push(`ช่องเก็บ ${arrow(t.storage?.slots.length ?? v.cargo, Math.ceil(v.cargo * VEHICLE_LEVEL.cargo(n) - 1e-6))}`);
      if (v.armor) out.push(`เกราะ ${arrow(Math.round(VEHICLE_LEVEL.armor(v.armor, lv) * 100), Math.round(VEHICLE_LEVEL.armor(v.armor, n) * 100))}%`);
      return out;
    }
    const d = t.def;
    out.push(`HP ${arrow(t.maxHp, Math.round((t.maxHp / BUILD_LEVEL.hp(lv)) * BUILD_LEVEL.hp(n)))}`);
    if (d.turret) out.push(`ดาเมจ ${arrow(+(d.turret.damage * BUILD_LEVEL.damage(lv)).toFixed(1), +(d.turret.damage * BUILD_LEVEL.damage(n)).toFixed(1))} · ระยะ ${Math.round(d.turret.range * BUILD_LEVEL.range(n))} · ยิงทุก ${(d.turret.cooldown * BUILD_LEVEL.cooldown(n)).toFixed(2)} วิ`);
    if (d.trap) out.push(`ดาเมจกับดัก ×${BUILD_LEVEL.damage(n).toFixed(2)}`);
    if (d.storage) out.push(`ช่องเก็บ ${arrow(t.storage?.slots.length ?? d.storage, Math.ceil(d.storage * BUILD_LEVEL.storage(n) - 1e-6))}`);
    if (d.prod || d.miner) out.push(`ผลิตเร็ว ×${BUILD_LEVEL.production(n).toFixed(1)}`);
    if (d.buff) out.push(`บัฟฐาน ${statLine(d.buff, BUILD_LEVEL.buff(n))}`);
    if (d.light) out.push(`แสง ${arrow(Math.round(d.light * BUILD_LEVEL.light(lv)), Math.round(d.light * BUILD_LEVEL.light(n)))}`);
    return out;
  }

  /** บรรทัดการ์ดข้อมูล (InspectSystem): เลเวล · ค่าถัดไป · ค่าอัพ */
  cardLines(t: UpTarget, full: boolean): string[] {
    const lv = t.lv;
    const lines = [`⬆ Lv.${lv}/${MAX_LEVEL} · ${bandName(lv)}`];
    if (lv >= MAX_LEVEL) return [...lines, '✨ อัพเกรดสูงสุดแล้ว — โฉมตำนาน'];
    const { cost, err } = this.checkBuild(t);
    if (!cost) return lines;
    const nb = bandOf(lv + 1);
    lines[0] += ` → Lv.${lv + 1}${nb && nb !== bandOf(lv) ? ` (โฉมใหม่: ${BAND_INFO[nb].name}!)` : ''}`;
    lines.push(`ถัดไป: ${this.previewLines(t).join(' · ')}`);
    lines.push(`ค่าอัพ: ${this.costLines(cost)}`);
    if (err && (err.startsWith('🔒') || !err.startsWith('ขาด'))) lines.push(err);
    else if (full) lines.push(err ? '✘ วัสดุยังไม่ครบ' : this.s.controls.touchMode ? '✔ แตะปุ่มหลักเพื่ออัพเกรด' : '✔ คลิกเพื่ออัพเกรด');
    return lines;
  }

  // ---------------------------------------------------------------- เอฟเฟกต์ในโลก
  update(dt: number) {
    const s = this.s;
    // ประกายระยิบของ Lv10 (สุ่มทีละชิ้น เฉพาะที่อยู่บนจอ)
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.3;
      const view = s.cameras.main.worldView;
      const list: UpTarget[] = [];
      for (const o of s.structureList()) if (o.lv >= MAX_LEVEL && o.visible && view.contains(o.x, o.y)) list.push(o);
      for (const o of s.boatList()) if (o.lv >= MAX_LEVEL && o.visible && view.contains(o.x, o.y)) list.push(o);
      if (list.length && s.textures.exists('sparkle')) {
        const o = list[Math.floor(Math.random() * list.length)];
        const top = o.getTopCenter();
        const sp = s.add.image(o.x + Phaser.Math.Between(-o.displayWidth / 2 + 2, o.displayWidth / 2 - 2), Phaser.Math.Between(top.y + 2, o.y - 2), 'sparkle')
          .setDepth(o.depth + 1).setTint(Math.random() < 0.5 ? 0xc77dff : 0x73eff7).setScale(0.6).setAlpha(0.9);
        s.tweens.add({ targets: sp, y: sp.y - 6, alpha: 0, scale: 1, duration: 700, onComplete: () => sp.destroy() });
      }
    }
    // ป้ายเลเวลเล็กๆ บนของที่ชี้/อยู่ใกล้ (ไม่แสดงทุกชิ้น กันรก)
    this.badgeT -= dt;
    if (this.badgeT > 0) return;
    this.badgeT = 0.12;
    const t = this.badgeTarget();
    if (!t || t.lv <= 1 || s.uiOpen) {
      this.badge.setVisible(false);
      return;
    }
    const band = bandOf(t.lv);
    const top = t.getTopCenter();
    this.badge
      .setText(`${'★'.repeat(band === 'legend' ? 3 : band === 'gold' ? 2 : band ? 1 : 0)}Lv.${t.lv}`)
      .setColor(band ? BAND_INFO[band].css : '#a7f070')
      .setPosition(Math.round(t.x), Math.round(top.y - 1))
      .setVisible(true);
  }

  private badgeTarget(): UpTarget | null {
    const s = this.s;
    if (s.build.upgrade && s.build.upgradeTarget) return s.build.upgradeTarget;
    const c = s.controls;
    if (!c.touchMode && !c.padMode) {
      const wp = s.pointerWorld();
      if (wp) {
        const t = this.targetAt(wp.x, wp.y);
        if (t) return t;
      }
    }
    const p = s.player;
    let best: UpTarget | null = null;
    let bd = 30;
    for (const o of [...s.structureList(), ...s.boatList()] as UpTarget[]) {
      if (o.lv <= 1) continue;
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, o.x, o.y - 6);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }
}

// ======================================================================
// เซฟเก่า: plus > 9 → 9 · เครื่องรางนำโชค/ใบกันแตก → เหรียญ (ตามมูลค่า)
// ======================================================================
export function migrateUpgradeSave(save: RunSave): number {
  let coins = 0;
  const fix = (arr: (Slot | null | undefined)[] | null | undefined) => {
    if (!arr) return;
    arr.forEach((x, i) => {
      if (!x) return;
      if (OBSOLETE.includes(x.id)) {
        coins += (ITEMS[x.id]?.value ?? 50) * x.qty;
        arr[i] = null;
        return;
      }
      if (x.plus !== undefined) x.plus = Phaser.Math.Clamp(Math.round(x.plus), 0, MAX_LEVEL - 1);
    });
  };
  fix(save.player.slots);
  if (save.player.equip) for (const [k, v] of Object.entries(save.player.equip)) if (v) {
    const one: (Slot | null)[] = [v];
    fix(one);
    (save.player.equip as Record<string, Slot | null>)[k] = one[0];
  }
  if (save.player.armor && save.player.armor.plus !== undefined) save.player.armor.plus = Math.min(MAX_LEVEL - 1, save.player.armor.plus);
  for (const d of save.structures) fix(d.storage);
  for (const b of save.boats) fix(b.cargo);
  return coins;
}

/** เลเวลจากเซฟ (ไม่มี = 1) */
export const savedLevel = (lv: unknown) => (typeof lv === 'number' && lv >= 1 ? Math.min(MAX_LEVEL, Math.floor(lv)) : 1);
