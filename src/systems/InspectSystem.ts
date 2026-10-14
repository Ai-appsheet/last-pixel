import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { getSettings } from '../core/Settings';
import { NODE_NAMES } from '../data/encyclopedia';
import { statLine } from '../data/equipment';
import { ITEMS } from '../data/items';
import { RARITY } from '../data/loot';
import type { MobAI } from '../data/mobs';
import { STATION_NAMES } from '../data/recipes';
import { DEFAULT_FUEL, VEHICLE_KIND_NAME, vehicleKind } from '../data/vehicles';
import { BAND_INFO, BUILD_LEVEL, bandOf, upCategoryOfBuild } from '../data/upgrade';
import type { Boat } from '../entities/Boat';
import type { DroppedItem } from '../entities/DroppedItem';
import type { Mob } from '../entities/Mob';
import type { ResourceNode } from '../entities/ResourceNode';
import { RAIN_WATER_CAP, type Structure } from '../entities/Structure';
import type { GameScene } from '../scenes/GameScene';
import { MATERIAL_NAME, materialOf, shelterTiles } from './ShelterSystem';
import { nutriLine } from './BodySystem';

/** การ์ดข้อมูลของสิ่งที่ "จิ้ม/ชี้" หรือ "เดินเข้าใกล้" */
export interface InspectInfo {
  key: string;
  title: string;
  color: string;
  lines: string[];
}

type Target =
  | { kind: 'structure'; o: Structure }
  | { kind: 'node'; o: ResourceNode }
  | { kind: 'mob'; o: Mob }
  | { kind: 'drop'; o: DroppedItem }
  | { kind: 'boat'; o: Boat };

const AI_TEXT: Record<MobAI, string> = {
  flee: 'ขี้ตกใจ — วิ่งหนีเมื่อเข้าใกล้',
  neutral: 'ไม่ทำร้ายถ้าไม่ตีก่อน',
  hunter: 'นักล่า — ไล่ล่าผู้เล่นในระยะ',
  zombie: 'เดินบุกเข้าหาไม่หยุด',
  ranged: 'โจมตีระยะไกล — เข้าประชิดหรือใช้โล่',
  flyer: 'บินข้ามกำแพงได้',
  swimmer: 'อยู่ใต้น้ำ — อันตรายตอนล่องเรือ',
  wrecker: '⚠ ทุบสิ่งก่อสร้าง! สร้างป้อมยิงรับมือ',
  boss: '👑 บอส — ดรอปกล่องทอง/เทพ + เพชร',
};

export class InspectSystem {
  info: InspectInfo | null = null;
  /** สิ่งก่อสร้างที่การ์ดกำลังแสดง (ShelterSystem วาดวงเขตปลอดภัยของบ้านหลังนี้) */
  focus: Structure | null = null;
  private pinned: { t: Target; until: number } | null = null;
  private timer = 0;

  constructor(private s: GameScene) {}

  /** จิ้ม/คลิกที่โลก → ปักการ์ดไว้ 5 วิ (คืน true ถ้าเจอของ) */
  pick(wx: number, wy: number): boolean {
    const t = this.targetAt(wx, wy, 14);
    if (!t) return false;
    this.pinned = { t, until: this.s.worldTime + 5 };
    this.timer = 0;
    return true;
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.15;
    const s = this.s;
    // โหมดอัพเกรด: การ์ดค่าอัพของที่ชี้ (แสดงแม้ปิดการ์ดข้อมูลในตั้งค่า)
    if (s.build.upgrade && !s.uiOpen) {
      const t = s.build.upgradeTarget;
      this.info = t ? this.upgradeCard(t) : { key: 'up', title: '⬆ โหมดอัพเกรด', color: '#ffcd75', lines: ['ชี้ (หรือหันหน้าเข้าหา) สิ่งก่อสร้าง/ยานพาหนะของคุณ', 'อัพแล้วเลเวล +1 ทันที · เปลี่ยนโฉมที่ Lv.4 / 7 / 10', 'U / คลิกขวา / Esc = ออก'] };
      return;
    }
    this.focus = null;
    if (s.uiOpen || s.build.on || !getSettings().infoCards) {
      this.info = null;
      return;
    }
    let t: Target | null = null;
    if (this.pinned && s.worldTime < this.pinned.until && this.pinned.t.o.active) t = this.pinned.t;
    else this.pinned = null;
    if (!t && !s.controls.touchMode) {
      const wp = s.pointerWorld();
      if (wp) t = this.targetAt(wp.x, wp.y, 10);
    }
    t ??= this.nearPlayer();
    this.info = t ? this.describe(t) : null;
    if (t?.kind === 'structure') this.focus = t.o;
  }

  // ------------------------------------------------------------------
  private targetAt(x: number, y: number, r: number): Target | null {
    const s = this.s;
    let best: Target | null = null;
    let bd = r;
    const consider = (t: Target, ox: number, oy: number, extra = 0) => {
      const d = Phaser.Math.Distance.Between(x, y, ox, oy) - extra;
      if (d < bd) {
        bd = d;
        best = t;
      }
    };
    for (const m of s.mobList()) consider({ kind: 'mob', o: m }, m.x, m.y, 4);
    for (const b of s.boatList()) consider({ kind: 'boat', o: b }, b.x, b.y, 8);
    for (const d of s.dropList()) if (d.active) consider({ kind: 'drop', o: d }, d.x, d.y);
    for (const st of s.structureList()) consider({ kind: 'structure', o: st }, st.x, st.y - 8 * st.def.h, (st.def.w - 1) * 8);
    const n = s.nodeNear(x, y, r);
    if (n) consider({ kind: 'node', o: n }, n.x, n.baseY - 6, 2);
    return best;
  }

  private nearPlayer(): Target | null {
    const p = this.s.player;
    const R = BALANCE.reach + 10;
    // มอนสเตอร์ที่เป็นศัตรูใกล้ๆ มาก่อน
    let mob: Mob | null = null;
    let md = 56;
    for (const m of this.s.mobList()) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y);
      if (d < md) {
        md = d;
        mob = m;
      }
    }
    if (mob?.isBoss) return { kind: 'mob', o: mob };
    // ของที่กด E แล้วจะทำงาน (เช่น ของพังที่ซ่อมได้) ให้ตรงกับคำใบ้
    const broken = this.s.nearestStructure(BALANCE.reach + 8, (st) => !st.getData('foreign') && st.hp < st.maxHp);
    if (broken) return { kind: 'structure', o: broken };
    return this.targetAt(p.x, p.feetY - 4, R) ?? (mob ? { kind: 'mob', o: mob } : null);
  }

  /** การ์ดโหมดอัพเกรด: เลเวล · ค่าสถานะถัดไป · ค่าอัพ */
  private upgradeCard(t: Boat | Structure): InspectInfo {
    const lines = this.s.upgrades.cardLines(t, true);
    const band = bandOf(t.lv);
    return { key: `u${t.def.id}${t.lv}`, title: `⬆ ${t.def.name}`, color: band ? BAND_INFO[band].css : '#ffcd75', lines };
  }

  private describe(t: Target): InspectInfo {
    switch (t.kind) {
      case 'structure': return this.structure(t.o);
      case 'node': return this.node(t.o);
      case 'mob': return this.mob(t.o);
      case 'drop': {
        const def = ITEMS[t.o.itemId];
        const r = RARITY[def.rarity ?? 'common'];
        const nl = nutriLine(def);
        return { key: `d${t.o.itemId}`, title: `${def.name}  ·  ${r.name}`, color: r.color, lines: [def.desc, ...(nl ? [nl] : []), 'เดินทับเพื่อเก็บ'] };
      }
      case 'boat': return this.vehicle(t.o);
    }
  }

  /** การ์ดยานพาหนะ: ชนิด · ความเร็ว · HP · เชื้อเพลิง/แรง · ความสามารถพิเศษ */
  private vehicle(b: Boat): InspectInfo {
    const v = b.spec;
    const kind = vehicleKind(v);
    const head = `${VEHICLE_KIND_NAME[kind]} · ความเร็ว ${Math.round(b.speed)} · HP ${Math.ceil(b.hp)}/${b.maxHp}${b.armor ? ` · เกราะ ${Math.round(b.armor * 100)}%` : ''}`;
    const lines = [b.def.desc, head];
    const up = this.s.upgrades.cardLines(b, false);
    if (v.fuel) lines.push(`⛽ เชื้อเพลิง ${Math.ceil(b.fuel)} วิ (เติม: ${(v.fuelItems ?? DEFAULT_FUEL).map(([i]) => ITEMS[i].name).join('/')})${v.fuelUse && v.fuelUse !== 1 ? ` · กิน ×${v.fuelUse}` : ''}`);
    else if (v.energy) lines.push(`${v.icon} แรง ${Math.round(b.energy)}%${v.energy.food ? ' · กินแครอท/เบอร์รี่' : ' · พักบนบกเพื่อฟื้น'}`);
    else lines.push('ไม่ใช้เชื้อเพลิง');
    if (v.special) lines.push(`✨ ${v.special}`);
    else if (b.storage) lines.push(`📦 ห้องเก็บของ ${b.storage.slots.filter(Boolean).length}/${b.storage.slots.length} ช่อง`);
    lines.push(kind === 'water' ? '[E] ขึ้นเรือ · ออกทะเลไปเกาะอื่นได้' : kind === 'air' ? '[E] ขึ้นบิน · ข้ามทั้งทะเลและเกาะ' : '[E] ขี่ · วิ่งได้เฉพาะบนบก');
    const band = bandOf(b.lv);
    return { key: `b${b.def.id}${b.lv}`, title: `${v.icon} ${b.def.name}${b.lv > 1 ? ` Lv.${b.lv}` : ''}`, color: band ? BAND_INFO[band].css : kind === 'land' ? '#a7f070' : kind === 'air' ? '#ffcd75' : '#73eff7', lines: [...lines.slice(0, 5), ...up.slice(0, 3)] };
  }

  private structure(st: Structure): InspectInfo {
    const def = st.def;
    const foreign = !!st.getData('foreign');
    const lines: string[] = [def.desc];
    const hpTxt = `HP ${Math.ceil(st.hp)}/${st.maxHp}`;
    if (!foreign && st.hp < st.maxHp) {
      const cost = this.s.repairCost(st).map(([i, n]) => `${ITEMS[i].name}×${n}`).join(' ');
      lines.push(`${hpTxt} — 🔧 [E] ซ่อม (${cost || 'ฟรี'})`);
    } else lines.push(hpTxt);
    // บ้าน: เขตปลอดภัย + วัสดุ (ทนแผ่นดินไหว/ไฟป่า)
    if (def.sleep && !foreign) {
      const mat = materialOf(def);
      const home = this.s.world.slotIndexAt(st.tx, st.ty) === this.s.world.home;
      lines.push(home ? `🛡 เขตปลอดภัย รัศมี ${shelterTiles(def, st.lv)} ช่อง · 🧱 ${MATERIAL_NAME[mat]}${mat === 'wood' ? ' (ติดไฟได้)' : ''}` : '🛡 เขตปลอดภัยใช้ได้เฉพาะบนเกาะของคุณ');
    }
    // อาคารผลิต / น้ำ / ฟาร์ม / ความสบาย (ชุดขยายบ้าน-อาคาร)
    if (def.prod && !foreign) lines.push(`⚙ ${def.prod.label} · ${st.prodText}`);
    if (def.water) lines.push(def.water === 'rain' ? `💧 น้ำฝน ${Math.floor(st.water)}/${RAIN_WATER_CAP} ครั้ง — [E] ดื่ม` : '💧 [E] ดื่มน้ำได้ไม่จำกัด');
    if (def.growAura) lines.push(`🌱 พืชรอบๆ โตเร็ว ×${def.growAura.mult}`);
    if (def.comfort) lines.push(`🛋 ฟื้นสติ +${def.comfort}/วิ เมื่ออยู่ใกล้`);
    if (def.stations) lines.push(`🔨 ใช้แทน: ${def.stations.map((k) => STATION_NAMES[k]).join(' · ')}`);
    if (def.station) lines.push(`🔨 ใช้คราฟต์: ${STATION_NAMES[def.station]} (มีบนเกาะก็คราฟต์จากแปลนได้ ไม่ต้องยืนใกล้)`);
    if (def.buff) lines.push(`🏠 บัฟฐาน: ${statLine(def.buff, BUILD_LEVEL.buff(st.lv))}${(def.buffMax ?? 1) > 1 ? ` (นับสูงสุด ${def.buffMax})` : ''}`);
    if (st.storage) lines.push(`📦 เก็บของ ${st.storage.slots.filter(Boolean).length}/${st.storage.slots.length} ช่อง`);
    if (def.crop) lines.push(st.crop ? `🌱 ${Math.floor(st.growth * 100)}%${st.ripe ? ' — พร้อมเก็บ!' : ''}` : '🌱 ว่าง — ถือเมล็ดแล้วกด E');
    if (st.turret) lines.push(`🎯 ดาเมจ ${st.turret.damage} · ระยะ ${st.turret.range}${def.power === 'use' ? (st.powered ? ' · ⚡มีไฟ' : ' · ⚠ ไม่มีไฟ') : ''}`);
    if (def.power === 'gen' || def.id === 'campfire') lines.push(`🔥 เชื้อเพลิง ${Math.ceil(st.fuel)} วิ`);
    else if (def.power === 'use' && !def.turret) lines.push(st.powered ? '⚡ มีไฟฟ้า' : '⚠ ต้องอยู่ในรัศมีเครื่องปั่นไฟ/กังหัน');
    if (foreign) lines.push('ของผู้เล่นอื่น');
    const band = bandOf(st.lv);
    const up = foreign || !upCategoryOfBuild(def) ? [] : this.s.upgrades.cardLines(st, false).slice(0, 3);
    return { key: `s${def.id}${st.lv}`, title: `${def.name}${st.lv > 1 ? ` Lv.${st.lv}` : ''}`, color: foreign ? '#94b0c2' : band ? BAND_INFO[band].css : '#ffcd75', lines: [...lines.slice(0, 5), ...up] };
  }

  private node(n: ResourceNode): InspectInfo {
    const sp = n.spec;
    const drops = sp.drops.map((d) => `${ITEMS[d.item].name}${d.chance < 1 ? `(${Math.round(d.chance * 100)}%)` : ` ${d.qty[0]}-${d.qty[1]}`}`).join(', ');
    const how = sp.harvest === 'pick' ? '[E] เก็บด้วยมือ' : sp.harvest === 'tree' ? 'ตีด้วยมือหรือขวาน (ขวานเร็วกว่ามาก)' : sp.minPower && sp.minPower >= 5 ? '⛏ ต้องใช้อีเต้อเหล็กขึ้นไป' : '⛏ ต้องใช้อีเต้อ';
    const lines = [`ได้: ${drops}`, how];
    if (!n.available) lines.push(`⏳ กำลังงอก/เกิดใหม่ (~${Math.round(sp.regrow / 60)} นาที)`);
    const name = NODE_NAMES[n.kind].replace(/\s*\(.*\)/, '');
    return { key: `n${n.kind}${n.available}`, title: name, color: '#a7f070', lines };
  }

  private mob(m: Mob): InspectInfo {
    const d = m.def;
    const drops = [...new Set(d.drops.map((x) => ITEMS[x.item].name))].join(', ');
    const lines = [`HP ${Math.max(0, Math.ceil(m.hp))}/${d.hp} · โจมตี ${d.attack}${d.armor ? ` · เกราะ ${Math.round(d.armor * 100)}%` : ''}`, AI_TEXT[d.ai], `ดรอป: ${drops}${d.xp >= 8 ? ' + 🎁 สุ่มกล่อง' : ''}`];
    if (m.disaster) lines.push('🌙 มาจากภัยพิบัติ — ฆ่าให้หมดรับกล่องรางวัล');
    if (m.getData('rival')) lines.splice(1, 1, '⚔ ผู้รอดชีวิตคู่แข่ง (PvP) — หลบ/ป้องกันได้ · ล้มแล้วได้ถุงของ (เหรียญ + ลุ้นกล่องทอง)');
    if (d.legendary) lines.splice(1, 1, `🐉 สัตว์ในตำนาน — ${d.lore ?? 'หายากมาก'}`);
    else if (d.onHit) lines.push(`⚠ โดนแล้ว${d.onHit.kind === 'poison' ? 'ติดพิษ' : d.onHit.kind === 'burn' ? 'ไฟลวก' : 'เดินช้าลง'}`);
    return { key: `m${d.id}`, title: `${d.legendary ? '🐉 ' : m.isBoss ? '👑 ' : ''}${d.name}`, color: m.hostile ? '#ef7d57' : '#a7f070', lines };
  }
}
