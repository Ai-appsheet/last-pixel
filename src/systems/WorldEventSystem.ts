import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { CENTER_SLOT } from '../core/RoomService';
import { SPECIAL_NAME, SPECIAL_SLOT, gateState, type SpecialState } from '../core/SpecialIsland';
import { MINUTE, WorldClock, bkkClock, bkkDayKey, dayStartOf, fmtLeft } from '../core/WorldClock';
import { EVENT_TYPES, EVENT_IDS, daySchedule, pickEventSlot, type EventPlan, type EventTypeId, type GateKind } from '../data/worldEvents';
import { GRID, SLOT_SIZE } from '../data/islands';
import { txt } from '../ui/widgets';
import { TILE } from '../world/tiles';
import type { GameScene } from '../scenes/GameScene';

/**
 * กิจกรรมตามเวลาจริง (เวลาไทย) — ตารางเดียวกันทุกเครื่อง (data/worldEvents.ts)
 *  - เกาะกลาง + เกาะมหาสมบัติ: เปิดวันละ 2 รอบ × 60 นาที · ปิด = พายุกั้น + ป้าย "เปิดรอบถัดไป HH:MM น."
 *    ประกาศก่อนเปิด 10 นาที + ตอนเปิด · ก่อนปิด 2 นาทีเตือนคนบนเกาะ · ปิดแล้วส่งกลับเกาะบ้าน (ของอยู่ครบ)
 *  - เกาะกิจกรรม: โผล่ในช่องทะเลว่างตามตาราง 30–45 นาที แล้วหายไป (คนบนเกาะเตือน 2 นาที → ส่งกลับบ้าน)
 * ทดสอบ: ?specialopen · ?centeropen · ?eventnow=<shipwreck|crystal_cave|volcano|flower|reef>
 */
interface GateFx {
  storm: Phaser.GameObjects.Container;
  beam: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  signs: { img: Phaser.GameObjects.Image; text: Phaser.GameObjects.Text }[];
}

interface ActiveEvent {
  plan: EventPlan;
  slot: number;
  endAt: number;
  beam: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  warned: boolean;
}

export interface WorldMarker {
  kind: 'center' | 'special' | 'event';
  icon: string;
  name: string;
  /** พิกัด tile */
  tx: number;
  ty: number;
  open: boolean;
  msLeft: number;
  color: string;
}

const GATE_NAME: Record<GateKind, string> = { center: 'เกาะกลาง', special: SPECIAL_NAME };
const GATE_SLOT: Record<GateKind, number> = { center: CENTER_SLOT, special: SPECIAL_SLOT };
const GATE_COLOR: Record<GateKind, { storm: number; ring: number; open: string; closed: string }> = {
  center: { storm: 0x29366f, ring: 0x73eff7, open: '#a7f070', closed: '#73eff7' },
  special: { storm: 0x5d275d, ring: 0xa77bdb, open: '#ffcd75', closed: '#a77bdb' },
};
const WARN_MS = 2 * MINUTE;
const PRE_MS = 10 * MINUTE;

const debugEvent = (() => {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('eventnow');
  if (v === null) return null;
  return (EVENT_IDS.includes(v as EventTypeId) ? v : 'shipwreck') as EventTypeId;
})();

export class WorldEventSystem {
  private timer = 0;
  private gateFx: Partial<Record<GateKind, GateFx>> = {};
  private known: Partial<Record<GateKind, boolean>> = {};
  private warned: Partial<Record<GateKind, number>> = {};
  private round: Partial<Record<GateKind, number>> = {};
  private active = new Map<string, ActiveEvent>();
  /** ประกาศที่แสดงแล้ว (ไม่ซ้ำตอนโหลดเกมใหม่) */
  private announced = new Set<string>();
  /** เกาะกิจกรรมที่เคยขึ้นไปแล้ว */
  seen = new Set<string>();
  private debugPlan: EventPlan | null = null;
  private debugEnd = 0;
  private barrierToastAt = 0;
  private first = true;

  constructor(private s: GameScene) {
    void WorldClock.sync();
    if (debugEvent) {
      const now = WorldClock.now();
      const base = dayStartOf(bkkDayKey(now));
      const start = Math.floor((now - base) / MINUTE) - 1;
      this.debugPlan = { id: `debug#${debugEvent}`, type: debugEvent, start, end: start + 31, pref: 0.37 };
      this.debugEnd = now + 30 * MINUTE;
    }
  }

  // ------------------------------------------------------------------ เซฟ
  serialize() {
    const today = bkkDayKey();
    return { seen: [...this.seen].slice(-40), announced: [...this.announced].filter((k) => k.startsWith(today) || k.includes(`:${today}`)).slice(-80) };
  }

  load(d?: { seen?: string[]; announced?: string[] }) {
    this.seen = new Set(d?.seen ?? []);
    this.announced = new Set(d?.announced ?? []);
  }

  // ------------------------------------------------------------------ query
  state(kind: GateKind): SpecialState {
    return kind === 'center' ? this.s.center : this.s.special;
  }

  /** เขตพายุของเกาะที่มีเวลาเปิด (พิกเซลโลก) */
  inGateZone(kind: GateKind, x: number, y: number): boolean {
    const is = this.s.world.slots[GATE_SLOT[kind]];
    if (!is) return false;
    return Math.hypot(x / 16 - is.cx, y / 16 - is.cy) < is.r + 12;
  }

  private inEventZone(slot: number, x: number, y: number): boolean {
    const is = this.s.world.slots[slot];
    if (!is?.event) return false;
    return Math.hypot(x / 16 - is.cx, y / 16 - is.cy) < is.r + 8;
  }

  /** เรือ/ยานบินชนพายุของเกาะที่ปิดอยู่ → คืนชนิดเกาะ (null = ผ่านได้) */
  blockedGate(nx: number, ny: number, x: number, y: number): GateKind | null {
    for (const kind of ['center', 'special'] as GateKind[]) {
      if (this.state(kind).open) continue;
      if (this.inGateZone(kind, nx, ny) && !this.inGateZone(kind, x, y)) return kind;
    }
    return null;
  }

  /** ชนพายุ: ข้อความบอกเวลาเปิด (เว้น 3 วิ) · ภารกิจ "ไปเกาะกลาง" นับว่ามาถึงแล้ว */
  onBarrier(kind: GateKind) {
    if (this.s.worldTime < this.barrierToastAt) return;
    this.barrierToastAt = this.s.worldTime + 3;
    const st = this.state(kind);
    EventBus.emit('toast', `🌀 ${GATE_NAME[kind]}ปิดอยู่ — เปิดรอบถัดไป ${bkkClock(st.nextOpen)} น. (อีก ${fmtLeft(st.msLeft)})`, GATE_COLOR[kind].closed);
    if (kind === 'center') EventBus.emit('island:enter', 'central');
  }

  /** ป้ายสถานะสำหรับ HUD (EventsPanel) และหมุดบนแผนที่ */
  markers(): WorldMarker[] {
    const out: WorldMarker[] = [];
    for (const kind of ['center', 'special'] as GateKind[]) {
      const is = this.s.world.slots[GATE_SLOT[kind]];
      const st = this.state(kind);
      if (is) out.push({ kind, icon: kind === 'center' ? '⚖' : '✨', name: GATE_NAME[kind], tx: is.cx, ty: is.cy, open: st.open, msLeft: st.msLeft, color: st.open ? GATE_COLOR[kind].open : GATE_COLOR[kind].closed });
    }
    const now = WorldClock.now();
    for (const a of this.active.values()) {
      const is = this.s.world.slots[a.slot];
      const def = EVENT_TYPES[a.plan.type];
      if (is) out.push({ kind: 'event', icon: def.icon, name: def.name, tx: is.cx, ty: is.cy, open: true, msLeft: a.endAt - now, color: def.color });
    }
    return out;
  }

  /** กิจกรรมถัดไปของวันนี้ (ยังไม่เริ่ม) */
  upcoming(): { plan: EventPlan; at: number } | null {
    const now = WorldClock.now();
    const day = bkkDayKey(now);
    const base = dayStartOf(day);
    const next = daySchedule(day).events.find((e) => base + e.start * MINUTE > now);
    return next ? { plan: next, at: base + next.start * MINUTE } : null;
  }

  /** ขึ้นเกาะกิจกรรม (จาก GameScene.updateZones) */
  onLand(slot: number) {
    const ev = this.s.world.slots[slot]?.event;
    if (!ev) return;
    const def = EVENT_TYPES[ev.type];
    const first = !this.seen.has(ev.id);
    this.seen.add(ev.id);
    EventBus.emit('banner', `${def.icon} ${def.name}`, `${def.desc} · เหลือ ${fmtLeft(ev.end - WorldClock.now())} · ⚔ เขตผจญภัย`, def.color);
    if (first) EventBus.emit('worldevent:landed', ev.type);
  }

  // ------------------------------------------------------------------ update
  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const now = WorldClock.now();
    this.s.special = gateState('special', now);
    this.s.center = gateState('center', now);
    for (const kind of ['center', 'special'] as GateKind[]) this.updateGate(kind, now);
    this.updateEvents(now);
    // โหลดเกมแล้วยืนอยู่กลางทะเลลึก (เกาะกิจกรรมที่เซฟไว้หายไปแล้ว) → กลับเกาะบ้าน
    if (this.first) {
      this.first = false;
      const p = this.s.player;
      if (!this.s.riding && this.s.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16)) === TILE.DEEP) {
        this.s.sendHome((x, y) => Math.hypot(x - p.x, y - p.y) < 300, '🌊 เกาะกิจกรรมที่คุณอยู่หายไปแล้ว — กลับมาที่เกาะบ้าน', '#73eff7');
      }
    }
  }

  private announce(key: string, text: string, color: string) {
    if (this.announced.has(key)) return false;
    this.announced.add(key);
    EventBus.emit('chat:system', text);
    EventBus.emit('toast', `📣 ${text}`, color);
    return true;
  }

  private updateGate(kind: GateKind, now: number) {
    const s = this.s;
    const st = this.state(kind);
    if (!this.gateFx[kind]) this.buildGateFx(kind);
    const fx = this.gateFx[kind];
    const name = GATE_NAME[kind];
    const col = GATE_COLOR[kind];
    const day = bkkDayKey(now);
    if (fx) {
      fx.storm.setVisible(!st.open);
      fx.beam.setVisible(st.open);
      fx.label
        .setText(st.open ? `${kind === 'center' ? '⚖' : '✨'} ${name} — เปิดอยู่! เหลือ ${fmtLeft(st.msLeft)}` : `🔒 ${name} ปิดอยู่ — เปิดรอบถัดไป ${bkkClock(st.nextOpen)} น. (อีก ${fmtLeft(st.msLeft)})`)
        .setColor(st.open ? col.open : col.closed);
      for (const sg of fx.signs) {
        sg.img.setVisible(!st.open);
        sg.text.setVisible(!st.open).setText(`ปิดอยู่ — เปิดรอบถัดไป ${bkkClock(st.nextOpen)} น.`);
      }
    }
    // เปิดรอบใหม่ (เกาะมหาสมบัติ: ทรัพยากรเกิดใหม่ทั้งหมด)
    if (st.open && st.round !== this.round[kind]) {
      this.round[kind] = st.round;
      if (kind === 'special') this.refillSlot(SPECIAL_SLOT);
    }
    // ประกาศก่อนเปิด 10 นาที
    if (!st.open && st.msLeft <= PRE_MS) this.announce(`${kind}:${day}:${st.round}:pre`, `${name}จะเปิดในอีก ${Math.ceil(st.msLeft / MINUTE)} นาที (${bkkClock(st.nextOpen)} น.)`, col.open);
    const was = this.known[kind];
    if (st.open && (was === false || was === undefined)) {
      const fresh = this.announce(`${kind}:${day}:${st.round}:open`, `${name}เปิดแล้ว! อีก ${Math.ceil(st.msLeft / MINUTE)} นาที`, col.open);
      if (was === false && fresh) {
        Sfx.play('achievement');
        if (kind === 'special') EventBus.emit('ui:splash', { art: 'special_island', title: `✨ ${SPECIAL_NAME} เปิดแล้ว!`, sub: 'เปิด 60 นาที — นั่งเรือไปทางใต้สุดของแผนที่ (ดูแผนที่ M)', color: '#ffcd75', hold: 3200 });
      }
    }
    // เตือนคนบนเกาะก่อนปิด 2 นาที
    const p = s.player;
    if (st.open && st.msLeft <= WARN_MS && this.warned[kind] !== st.round && this.inGateZone(kind, p.x, p.y)) {
      this.warned[kind] = st.round;
      EventBus.emit('banner', `⚠ ${name}จะปิดใน ${fmtLeft(st.msLeft)}`, 'ยังอยู่บนเกาะตอนปิด = พายุพัดกลับเกาะบ้าน (ของที่เก็บมาอยู่ครบ)', '#ef7d57');
    }
    if (was === true && !st.open) {
      EventBus.emit('banner', `🌀 ${name}ปิดแล้ว`, `เปิดรอบถัดไป ${bkkClock(st.nextOpen)} น.`, col.closed);
      s.sendHome((x, y) => this.inGateZone(kind, x, y), `🌀 พายุพัดคุณออกจาก${name} — กลับเกาะบ้านแล้ว (ของที่เก็บมายังอยู่ครบ)`, col.closed);
    }
    // โหลดเกมตอนเกาะปิดแต่ตัวยังอยู่บนเกาะ → ส่งกลับเงียบๆ
    if (was === undefined && !st.open) s.sendHome((x, y) => this.inGateZone(kind, x, y), null, col.closed);
    this.known[kind] = st.open;
  }

  /** ทรัพยากรบนเกาะเกิดใหม่ทั้งหมด (เปิดรอบใหม่) */
  private refillSlot(slot: number) {
    for (const n of this.s.world.nodes) {
      if (this.s.world.slotIndexAt(n.tx, n.ty) !== slot) continue;
      if (!n.available) n.regrowAt = 0;
      n.hp = -1;
    }
  }

  private buildGateFx(kind: GateKind) {
    const s = this.s;
    const is = s.world.slots[GATE_SLOT[kind]];
    if (!is) return;
    const col = GATE_COLOR[kind];
    const x = is.cx * 16;
    const y = is.cy * 16;
    const R = (is.r + 12) * 16;
    // พายุกั้น (ตอนปิด): วงหมุน
    const g = s.add.graphics();
    g.fillStyle(col.storm, 0.22).fillCircle(0, 0, R);
    for (let i = 0; i < 3; i++) {
      g.lineStyle(10 - i * 3, i === 1 ? col.ring : col.storm, 0.55 - i * 0.12);
      for (let a = 0; a < 8; a++) g.beginPath().arc(0, 0, R - i * 26, (a / 8) * Math.PI * 2, (a / 8) * Math.PI * 2 + 0.5).strokePath();
    }
    const storm = s.add.container(x, y, [g]).setDepth(5e5);
    s.tweens.add({ targets: storm, angle: kind === 'center' ? -360 : 360, duration: 24000, repeat: -1 });
    // ลำแสง (ตอนเปิด)
    const beamG = s.add.graphics();
    const c = kind === 'center' ? 0xa7f070 : 0xffcd75;
    beamG.fillGradientStyle(c, c, c, c, 0, 0, 0.5, 0.5).fillRect(-14, -900, 28, 900);
    beamG.fillStyle(0xfff2b0, 0.3).fillEllipse(0, 0, 90, 28);
    const beam = s.add.container(x, y, [beamG]).setDepth(5e5).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: beam, alpha: 0.55, duration: 900, yoyo: true, repeat: -1 });
    const label = txt(s, x, y - (is.r + 4) * 16, '', 10, col.open).setOrigin(0.5).setDepth(5e5 + 1).setStroke('#0b0d1f', 3).setResolution(4);
    // ป้ายปิด 4 ทิศบนแนวพายุ (ทางที่เรือเข้ามา)
    const signs: GateFx['signs'] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 2;
      const sx = x + Math.cos(a) * (R + 26);
      const sy = y + Math.sin(a) * (R + 26);
      const img = s.add.image(sx, sy, 'signpost').setOrigin(0.5, 1).setDepth(5e5 + 1).setScale(1.4);
      const text = txt(s, sx, sy - 28, '', 9, col.closed).setOrigin(0.5, 1).setDepth(5e5 + 1).setStroke('#0b0d1f', 3).setResolution(4);
      signs.push({ img, text });
    }
    this.gateFx[kind] = { storm, beam, label, signs };
  }

  // ------------------------------------------------------------------ เกาะกิจกรรม
  private plansNow(now: number): { plan: EventPlan; startAt: number; endAt: number }[] {
    const day = bkkDayKey(now);
    const base = dayStartOf(day);
    const out = daySchedule(day).events.map((plan) => ({ plan, startAt: base + plan.start * MINUTE, endAt: base + plan.end * MINUTE }));
    if (this.debugPlan) out.push({ plan: this.debugPlan, startAt: this.debugEnd - 30 * MINUTE, endAt: this.debugEnd });
    return out;
  }

  private slotFor(plan: EventPlan): number {
    return pickEventSlot(plan.pref, this.s.world.freeSeaSlots());
  }

  private updateEvents(now: number) {
    const s = this.s;
    const p = s.player;
    for (const { plan, startAt, endAt } of this.plansNow(now)) {
      const def = EVENT_TYPES[plan.type];
      const a = this.active.get(plan.id);
      // ประกาศล่วงหน้า 10 นาที (บอกทิศ)
      if (!a && now < startAt && startAt - now <= PRE_MS) {
        const slot = this.slotFor(plan);
        this.announce(`${plan.id}:pre`, `อีก ${Math.ceil((startAt - now) / MINUTE)} นาที ${def.icon} ${def.name} จะโผล่${this.dirText(slot)} (${bkkClock(startAt)} น.)`, def.color);
      }
      if (!a && now >= startAt && now < endAt) this.spawn(plan, endAt);
      const b = this.active.get(plan.id);
      if (!b) continue;
      const left = endAt - now;
      b.label.setText(`${def.icon} ${def.name} — เหลือ ${fmtLeft(left)}`);
      if (left <= WARN_MS && !b.warned && this.inEventZone(b.slot, p.x, p.y)) {
        b.warned = true;
        EventBus.emit('banner', `⚠ ${def.name}กำลังจมหาย ${fmtLeft(left)}`, 'อยู่บนเกาะตอนหาย = ถูกส่งกลับเกาะบ้าน (ของที่เก็บมาอยู่ครบ)', '#ef7d57');
      }
      if (now >= endAt) this.despawn(b);
    }
    // กิจกรรมที่หลุดตาราง (ข้ามวัน/เวลาเครื่องเปลี่ยน)
    for (const a of [...this.active.values()]) if (now >= a.endAt) this.despawn(a);
  }

  private dirText(slot: number): string {
    if (slot < 0) return 'กลางทะเล';
    const c = Math.floor(GRID / 2);
    const dx = (slot % GRID) - c;
    const dy = Math.floor(slot / GRID) - c;
    const ns = dy < 0 ? 'เหนือ' : dy > 0 ? 'ใต้' : '';
    const ew = dx < 0 ? 'ตะวันตก' : dx > 0 ? 'ตะวันออก' : '';
    return ns || ew ? `ทางทิศ${ns}${ns && ew ? '' : ''}${ew}ของเกาะกลาง` : 'ใกล้เกาะกลาง';
  }

  private spawn(plan: EventPlan, endAt: number) {
    const s = this.s;
    const slot = this.slotFor(plan);
    if (slot < 0) return;
    const is = s.world.spawnEventIsland(slot, plan, endAt);
    if (!is) return;
    const o = s.world.slotOrigin(slot);
    s.refreshArea(o.x, o.y, o.x + SLOT_SIZE, o.y + SLOT_SIZE);
    // เรือของผู้เล่นทับผืนดินที่เพิ่งโผล่ → ดันออกไปน้ำใกล้สุด
    s.unstickBoats(slot);
    const def = EVENT_TYPES[plan.type];
    const x = is.cx * 16;
    const y = is.cy * 16;
    const c = Phaser.Display.Color.HexStringToColor(def.color).color;
    const g = s.add.graphics();
    g.fillGradientStyle(c, c, c, c, 0, 0, 0.45, 0.45).fillRect(-12, -800, 24, 800);
    const beam = s.add.container(x, y, [g]).setDepth(5e5).setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({ targets: beam, alpha: 0.5, duration: 800, yoyo: true, repeat: -1 });
    const label = txt(s, x, y - (is.r + 4) * 16, '', 10, def.color).setOrigin(0.5).setDepth(5e5 + 1).setStroke('#0b0d1f', 3).setResolution(4);
    this.active.set(plan.id, { plan, slot, endAt, beam, label, warned: false });
    const mins = Math.max(1, Math.ceil((endAt - WorldClock.now()) / MINUTE));
    if (this.announce(`${plan.id}:start`, `${def.icon} ${def.name}โผล่แล้ว${this.dirText(slot)}! อยู่ได้อีก ${mins} นาที (ดูแผนที่ M)`, def.color)) Sfx.play('horn');
  }

  private despawn(a: ActiveEvent) {
    const s = this.s;
    const def = EVENT_TYPES[a.plan.type];
    this.active.delete(a.plan.id);
    a.beam.destroy();
    a.label.destroy();
    const p = s.player;
    if (this.inEventZone(a.slot, p.x, p.y) && !s.boatRiding) s.sendHome((x, y) => this.inEventZone(a.slot, x, y), `🌊 ${def.name}จมหายไปแล้ว — คุณถูกส่งกลับเกาะบ้าน (ของที่เก็บมาอยู่ครบ)`, def.color);
    else s.sendHome((x, y) => this.inEventZone(a.slot, x, y), null, def.color, true);
    s.clearSlotCreatures(a.slot);
    const gone = s.world.clearEventIsland(a.slot);
    s.removeWorldNodes(gone);
    const o = s.world.slotOrigin(a.slot);
    s.refreshArea(o.x, o.y, o.x + SLOT_SIZE, o.y + SLOT_SIZE);
    this.announce(`${a.plan.id}:end`, `${def.icon} ${def.name}จมหายไปแล้ว — รอกิจกรรมถัดไป`, '#94b0c2');
  }
}
