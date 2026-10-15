import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import { GRID, SLOT_SIZE } from '../data/islands';
import { HOME, NIGHT_HOUSE_THREAT, hazardPower, houseDamage, isDwelling, roomSize, roomStyle } from '../data/homes';
import { homeRoomCanvas } from '../gfx/art/homeInterior';
import { INTERIOR_BASE } from '../world/Interiors';
import { TILE } from '../world/tiles';
import type { Structure } from '../entities/Structure';
import type { GameScene } from '../scenes/GameScene';
import type { LightSource } from './LightingSystem';

const T = 16;
/** ช่องแมพย่อยของห้องในบ้าน (แถวพิเศษใต้ตาราง ช่องขวาสุด — ไม่ชนดันเจี้ยน) · ทั้งช่องเป็นผนังทึบ ห้องถูกขุดใหม่ทุกครั้งที่เข้า */
export const HOME_ROOM_SLOT = INTERIOR_BASE + GRID - 1;

interface Spot {
  x: number;
  y: number;
  r: number;
  label: string;
  run: () => void;
}

/**
 * 🏠 เข้าไปอยู่ในบ้าน: อาคารที่นอนได้บนเกาะเรามีประตู (เดินขึ้นเข้าประตู / กด E) → ห้องข้างในตามขนาดบ้าน
 * เตียง (นอน) · หีบ (= ที่เก็บของเดียวกับตัวบ้าน) · เตาผิง (แสงอุ่น) · ประตูออก (เดินลง / E / Esc)
 * ในบ้านปลอดภัยจากมอน/ผู้เล่นอื่น/อากาศ แต่ภัยพิบัติยังซัดตัวบ้านตามเลเวล (ตัวเลข: data/homes.ts)
 * บ้านของคนอื่น = ประตูล็อก
 */
export class HomeSystem {
  /** บ้านที่อยู่ข้างใน (null = อยู่ข้างนอก) */
  house: Structure | null = null;
  /** จุดหน้าประตูบ้าน (มอนมารุมรอตรงนี้ · ออกจากบ้านมายืนตรงนี้) */
  private front = { x: 0, y: 0 };
  private room = { x0: 0, y0: 0, w: 0, h: 0, door: 0 };
  private objs: Phaser.GameObjects.GameObject[] = [];
  private spots: Spot[] = [];
  private glow: LightSource[] = [];
  private windows: Phaser.GameObjects.Image[] = [];
  private hearth: Phaser.GameObjects.Image | null = null;
  private flick = 0;
  private busy = false;
  private tick = 0;
  private warned = '';
  private badgeKey = '';
  private walkIn = 0;
  private hearthAt = -999;
  private told = false;
  private readonly ox: number;
  private readonly oy: number;

  constructor(private s: GameScene) {
    const w = s.world;
    const o = w.slotOrigin(HOME_ROOM_SLOT);
    this.ox = o.x;
    this.oy = o.y;
    w.generated.add(HOME_ROOM_SLOT);
    for (let y = 0; y < SLOT_SIZE; y++) w.tiles.fill(TILE.ROCKWALL, (o.y + y) * w.size + o.x, (o.y + y) * w.size + o.x + SLOT_SIZE);
  }

  get inside() {
    return !!this.house;
  }

  /** ผู้เล่นหลบในบ้าน → มอนไล่ไปรุมหน้าประตูแทน */
  get lure(): { x: number; y: number } | null {
    return this.house ? this.front : null;
  }

  /** ในบ้าน: มืดสลัวนิดๆ ให้เห็นแสงไฟอุ่น */
  get darkness() {
    return this.house ? 0.42 : 0;
  }

  lights(): LightSource[] {
    return this.house ? this.glow : [];
  }

  isRoomTile(tx: number, ty: number) {
    return tx >= this.ox && ty >= this.oy && tx < this.ox + SLOT_SIZE && ty < this.oy + SLOT_SIZE;
  }

  /** อากาศในบ้าน: อุ่นสบาย ไม่เปียกฝน มีแสง */
  indoorEnv<E extends { ambient: number; warmth: number; raining: boolean; lit: boolean }>(env: E): E {
    return { ...env, ambient: 22, warmth: Math.max(env.warmth, this.house?.def.warmth ?? 10), raining: false, lit: true };
  }

  // ------------------------------------------------------------------
  // ประตูบ้าน (ข้างนอก)
  // ------------------------------------------------------------------
  /** บ้านที่ยืนอยู่หน้าประตู (ของเราบนเกาะเรา หรือบ้านคนอื่น) */
  doorNear(r = 20): Structure | null {
    const s = this.s;
    if (this.house || s.riding || this.busy) return null;
    const p = s.player;
    let best: Structure | null = null;
    let bd = r * r;
    for (const st of s.structureList()) {
      if (!isDwelling(st.def) || !st.active) continue;
      const dx = p.x - st.x;
      const dy = p.feetY - (st.y + 4);
      const d = dx * dx + dy * dy;
      if (d >= bd) continue;
      if (!st.getData('foreign') && s.world.slotIndexAt(st.tx, st.ty) !== s.world.home) continue; // เต็นท์นอกเกาะเรา = นอน/เก็บของแบบเดิม
      bd = d;
      best = st;
    }
    return best;
  }

  private ownerName(st: Structure) {
    const is = this.s.world.slots[this.s.world.slotIndexAt(st.tx, st.ty)];
    return is?.ownerName || 'ผู้เล่นอื่น';
  }

  doorHint(st: Structure): string {
    if (st.getData('foreign')) return `🔒 บ้านของ ${this.ownerName(st)} (ประตูล็อก)`;
    return `🚪 เข้า${st.def.name} (ปลอดภัย)`;
  }

  useDoor(st: Structure) {
    if (st.getData('foreign')) {
      Sfx.play('error');
      EventBus.emit('toast', `🔒 บ้านของ ${this.ownerName(st)} — เข้าได้เฉพาะเจ้าของบ้าน`, '#ef7d57');
      return;
    }
    this.enter(st);
  }

  // ------------------------------------------------------------------
  // เข้า / ออก
  // ------------------------------------------------------------------
  enter(st: Structure, instant = false) {
    if (this.busy || this.house || !st.active) return;
    const go = () => {
      if (!st.active) return;
      this.build(st);
      const p = this.s.player;
      const r = this.room;
      p.setPosition((r.x0 + r.door) * T + 8, (r.y0 + r.h - 2) * T + 4);
      p.body.setVelocity(0, 0);
      p.aim.set(0, -1);
      this.s.cameras.main.centerOn(p.x, p.y);
      Sfx.play('place');
      if (!instant && !this.told) {
        this.told = true;
        EventBus.emit('toast', `🏠 เข้า${st.def.name}แล้ว — ปลอดภัยจากมอน/ผู้เล่นอื่น/อากาศ · เตียง = นอน · หีบ = ของในบ้าน · เดินลงประตู/Esc = ออก`, '#a7f070');
      }
    };
    if (instant) go();
    else this.fade(go);
  }

  /** ออกไปยืนหน้าประตู */
  leave() {
    if (this.busy || !this.house) return;
    this.fade(() => {
      const f = { ...this.front };
      this.teardown();
      this.s.player.setPosition(f.x, f.y);
      this.s.cameras.main.centerOn(f.x, f.y);
      Sfx.play('step');
    });
  }

  /** Esc ตอนอยู่ในบ้าน = ออกจากบ้าน (คืน true = ใช้ปุ่มแล้ว) */
  escape(): boolean {
    if (!this.house || this.busy) return false;
    this.leave();
    return true;
  }

  /** ตาย/เกิดใหม่: ออกจากบ้านทันที (ไม่มีจอมืด) */
  reset() {
    if (!this.house) return;
    const f = { ...this.front };
    this.teardown();
    this.s.player.setPosition(f.x, f.y);
  }

  private fade(mid: () => void) {
    this.busy = true;
    const cam = this.s.cameras.main;
    cam.fadeOut(200, 14, 10, 8);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.busy = false;
      mid();
      cam.fadeIn(260, 14, 10, 8);
    });
  }

  /** ขุดห้อง + วางของ + ตั้งขอบเขต */
  private build(st: Structure) {
    const s = this.s;
    const w = s.world;
    const { w: rw, h: rh } = roomSize(st.def);
    const style = roomStyle(st.def);
    const x0 = this.ox + Math.floor(SLOT_SIZE / 2 - rw / 2);
    const y0 = this.oy + Math.floor(SLOT_SIZE / 2 - rh / 2);
    const door = Math.floor(rw / 2);
    // ล้างห้องเก่า → ผนังทึบ แล้วขุดพื้นใหม่ (ผนัง/เฟอร์นิเจอร์ = ROCKWALL ชนได้)
    const old = this.room;
    if (old.w) for (let y = old.y0; y < old.y0 + old.h; y++) w.tiles.fill(TILE.ROCKWALL, y * w.size + old.x0, y * w.size + old.x0 + old.w);
    for (let y = y0 + 2; y < y0 + rh - 1; y++) w.tiles.fill(TILE.PLANK_H, y * w.size + x0 + 1, y * w.size + x0 + rw - 1);
    w.tiles[(y0 + rh - 1) * w.size + x0 + door] = TILE.PLANK_H;
    const solid = (tx: number, ty: number) => (w.tiles[(y0 + ty) * w.size + x0 + tx] = TILE.ROCKWALL);
    this.room = { x0, y0, w: rw, h: rh, door };
    this.house = st;
    s.currentSlot = w.home; // ห้องไม่มีเกาะ → นับว่าอยู่เกาะบ้าน (ป้ายพื้นที่/ไบโอม)
    this.front = { x: st.x, y: st.y + 12 };

    const px = (tx: number) => (x0 + tx) * T;
    const py = (ty: number) => (y0 + ty) * T;
    const add = <O extends Phaser.GameObjects.GameObject>(o: O) => {
      this.objs.push(o);
      return o;
    };
    const img = (key: string, x: number, y: number) => add(s.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y));
    // ความมืดรอบห้อง + ผืนห้อง
    const cx = px(rw / 2);
    const cy = py(rh / 2);
    add(s.add.rectangle(cx, cy, rw * T + 2400, rh * T + 2000, 0x0e0d10).setDepth(-6.95));
    const key = `hi_room_${rw}x${rh}_${style}`;
    if (!s.textures.exists(key)) {
      const pc = homeRoomCanvas(rw, rh, style);
      const tex = s.textures.createCanvas(key, pc.W, pc.H)!;
      pc.blit(tex.getContext());
      tex.refresh();
    }
    add(s.add.image(px(0), py(0), key).setOrigin(0, 0).setDepth(-6.9));
    // เตาผิงกลางผนังหลัง
    this.hearth = img('hi_hearth_a', cx, py(2) + 4);
    solid(Math.floor(rw / 2) - 1, 2);
    solid(Math.floor(rw / 2), 2);
    if (rw % 2) solid(Math.floor(rw / 2) + 1, 2);
    // หน้าต่าง 2 บาน
    const night = s.dayNight.darkness > 0.45;
    this.windows = [Math.floor(rw / 4), rw - 1 - Math.floor(rw / 4)].map((tx) => add(s.add.image(px(tx) + 8, py(1) + 4, night ? 'hi_window_night' : 'hi_window_day').setOrigin(0.5, 1).setDepth(-6.8)));
    // เตียง (ซ้ายบน) + โคมไฟ
    const dbl = rw >= 12;
    img(dbl ? 'hi_bed2' : 'hi_bed', dbl ? px(2) : px(1) + 8, py(4));
    solid(1, 2);
    solid(1, 3);
    if (dbl) {
      solid(2, 2);
      solid(2, 3);
    }
    const lampX = dbl ? 3 : 2;
    img('hi_lamp', px(lampX) + 8, py(3) - 1);
    solid(lampX, 2);
    // หีบ (ขวาบน) — ที่เก็บของเดียวกับตัวบ้าน
    const chestX = px(rw - 2) + 8;
    img('hi_chest', chestX, py(3));
    solid(rw - 2, 2);
    // โต๊ะ + ต้นไม้ (ห้องกว้าง)
    if (rw >= 11) {
      img('hi_table', px(2), py(rh - 2) - 2);
      solid(1, rh - 3);
      solid(2, rh - 3);
    }
    img('hi_plant', px(rw - 2) + 8, py(rh - 1) - 2);
    solid(rw - 2, rh - 2);
    // พรมเช็ดเท้าหน้าประตู
    add(s.add.image(px(door) + 8, py(rh - 1) + 6, 'hi_mat').setDepth(-6.7));
    s.refreshArea(x0 - 2, y0 - 2, x0 + rw + 2, y0 + rh + 2);

    // แสง: เตาผิงอุ่น · โคมไฟ · แสงลอดประตู
    this.glow = [
      { x: cx, y: py(2) - 4, radius: 70 + rw * 5 },
      { x: px(lampX) + 8, y: py(2) + 2, radius: 46 },
      { x: px(door) + 8, y: py(rh - 1) + 8, radius: 26 },
    ];
    // จุดกด E
    const bedX = dbl ? px(2) : px(1) + 8;
    this.spots = [
      { x: bedX, y: py(4) + 2, r: 24, label: s.dayNight.isNight || s.dayNight.phase === 'dusk' ? 'นอนบนเตียง' : 'เตียง (นอนได้ตอนกลางคืน)', run: () => s.sleep() },
      { x: chestX, y: py(3) + 4, r: 22, label: `เปิดหีบเก็บของ (${st.def.name})`, run: () => EventBus.emit('ui:storage', st) },
      { x: cx, y: py(3) + 2, r: 24, label: 'ผิงไฟ (ฟื้นสติ)', run: () => this.warmUp() },
      { x: px(door) + 8, y: py(rh - 1) + 12, r: 11, label: 'ออกจากบ้าน', run: () => this.leave() },
    ];
    // ฟิสิกส์จำกัดในห้อง · กล้องอยู่ในช่องห้อง
    s.physics.world.setBounds(px(0), py(0), rw * T, rh * T);
    s.cameras.main.setBounds(this.ox * T, this.oy * T, SLOT_SIZE * T, SLOT_SIZE * T);
    // กันตัว: ไม่โดนตี · หิวช้าลง
    s.player.sheltered = true;
    s.player.hungerMult = HOME.drain;
    this.tick = HOME.tick;
    this.warned = '';
    this.badgeKey = '';
    this.badge();
  }

  private teardown() {
    const s = this.s;
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.windows = [];
    this.hearth = null;
    this.spots = [];
    this.glow = [];
    this.house = null;
    const b = s.world.bounds;
    s.physics.world.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
    s.cameras.main.setBounds(b.x0 * T, b.y0 * T, (b.x1 - b.x0) * T, (b.y1 - b.y0) * T);
    s.player.sheltered = false;
    s.player.hungerMult = 1;
    this.badgeKey = '';
    EventBus.emit('home:inside', false);
  }

  private warmUp() {
    const s = this.s;
    if (s.worldTime - this.hearthAt < 30) return EventBus.emit('toast', '🔥 อุ่นสบายแล้ว — พักสักครู่ค่อยผิงอีก', '#ffcd75');
    this.hearthAt = s.worldTime;
    s.player.sanity = Math.min(100, s.player.sanity + 15);
    s.player.temp = Math.max(s.player.temp, 50);
    Sfx.play('fire');
    EventBus.emit('toast', '🔥 ผิงไฟอุ่นๆ — สติ +15', '#ffcd75');
  }

  // ------------------------------------------------------------------
  // ในบ้าน
  // ------------------------------------------------------------------
  /** สิ่งที่กด E ได้ใกล้ตัวในห้อง */
  spotNear(): Spot | null {
    const p = this.s.player;
    let best: Spot | null = null;
    let bd = Infinity;
    for (const it of this.spots) {
      const d = Phaser.Math.Distance.Between(p.x, p.feetY, it.x, it.y);
      if (d < it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  interact() {
    this.spotNear()?.run();
  }

  hint(): string | null {
    return this.spotNear()?.label ?? null;
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    if (!this.house) return this.walkInCheck(dt);
    const st = this.house;
    if (!st.active) return this.collapse();
    if (p.dead || this.busy) return;
    // พักในบ้าน: ฟื้นไวขึ้น
    if (p.hunger > 0 && p.thirst > 0) p.heal(HOME.hpRegen * dt);
    p.stamina = Math.min(p.maxStamina, p.stamina + HOME.staminaRegen * dt);
    p.sanity = Math.min(100, p.sanity + HOME.sanityRegen * dt);
    // ไฟในเตาผิงไหว + หน้าต่างตามเวลา
    this.flick -= dt;
    if (this.flick <= 0 && this.hearth) {
      this.flick = 0.16 + Math.random() * 0.1;
      this.hearth.setTexture(this.hearth.texture.key === 'hi_hearth_a' ? 'hi_hearth_b' : 'hi_hearth_a');
      const g = this.glow[0];
      if (g) g.radius = 70 + this.room.w * 5 + Math.random() * 6;
    }
    const win = s.dayNight.darkness > 0.45 ? 'hi_window_night' : 'hi_window_day';
    for (const w of this.windows) if (w.texture.key !== win) w.setTexture(win);
    // เดินลงไปที่ช่องประตู = ออก
    const r = this.room;
    if (p.feetY >= (r.y0 + r.h - 1) * T + 5 && Math.abs(p.x - ((r.x0 + r.door) * T + 8)) < 10) this.leave();
    // ภัยพิบัติข้างนอกซัดตัวบ้าน
    this.tick -= dt;
    if (this.tick <= 0) {
      this.tick = HOME.tick;
      this.badgeKey = ''; // ส่งป้ายซ้ำเป็นระยะ (HUD สร้างใหม่ตอนหมุนจอ)
      this.threatTick();
    }
    this.badge();
  }

  /** เดินขึ้นชนประตูบ้านเรา = เข้าบ้าน */
  private walkInCheck(dt: number) {
    const p = this.s.player;
    const st = p.body.velocity.y < -5 ? this.doorNear(12) : null;
    this.walkIn = st && !st.getData('foreign') ? this.walkIn + dt : 0;
    if (st && this.walkIn > 0.25) {
      this.walkIn = 0;
      this.enter(st);
    }
  }

  /** ภัยที่กำลังซัดเกาะ (ภัยกลางวัน หรือภัยประจำคืนแบบอุกกาบาต/พายุ) */
  private threat(): { key: string; id: string; name: string } | null {
    const s = this.s;
    const hz = s.hazards?.current;
    if (hz && hazardPower(hz.id, s.hazards.level)) return { key: `h:${hz.id}`, id: hz.id, name: hz.name };
    const d = s.disaster?.active ? s.disaster.current : null;
    const nid = d?.special ? NIGHT_HOUSE_THREAT[d.special] : undefined;
    if (d && nid) return { key: `d:${d.id}`, id: nid, name: d.name };
    return null;
  }

  private threatTick() {
    const s = this.s;
    const st = this.house!;
    const th = this.threat();
    if (!th) {
      this.warned = '';
      return;
    }
    const lvl = s.hazards?.level ?? 1;
    const power = hazardPower(th.id, lvl);
    const dmg = houseDamage(st.def, st.lv, st.maxHp, th.id, lvl);
    const weak = st.lv < power && dmg > st.maxHp * HOME.minorFrac;
    if (this.warned !== th.key) {
      this.warned = th.key;
      EventBus.emit(
        'toast',
        weak ? `⚠ บ้านสั่น! ${th.name}กำลังซัด — บ้าน Lv.${st.lv} อาจพัง (แนะนำ Lv.${power}+)` : `🏠 ${th.name}ข้างนอก — บ้าน Lv.${st.lv} ทนไหว (แนะนำ Lv.${power}+)`,
        weak ? '#ef7d57' : '#a7f070',
      );
    }
    if (dmg <= 0) return;
    s.cameras.main.shake(weak ? 320 : 180, weak ? 0.004 : 0.0015);
    const r = this.room;
    s.fx.debris((r.x0 + 1 + Math.random() * (r.w - 2)) * T, (r.y0 + 2.2) * T, 0x8a6a4a, weak ? 5 : 2);
    s.damageStructure(st, dmg);
  }

  /** บ้านพังตอนอยู่ข้างใน → กระเด็นออกมาหน้าซากบ้าน เจ็บนิดหน่อย (ไม่ถึงตาย) */
  private collapse() {
    const s = this.s;
    const p = s.player;
    const name = this.house?.def.name ?? 'บ้าน';
    const f = { ...this.front };
    this.teardown();
    p.setPosition(f.x, f.y);
    s.cameras.main.centerOn(f.x, f.y);
    const before = p.hp;
    p.hp = Math.max(1, p.hp - p.maxHp * HOME.collapseHurt);
    p.lastDamage = 'บ้านถล่ม';
    s.cameras.main.shake(500, 0.01);
    s.cameras.main.flash(200, 120, 80, 50);
    s.fx.debris(f.x, f.y - 16, 0x8a5a35, 14);
    Sfx.play('breakWood');
    EventBus.emit('toast', `🏚 ${name}พังถล่ม! หนีออกมาได้ทัน (−${Math.round(before - p.hp)} HP) — อัพเกรดบ้านให้เลเวลสูงขึ้นจะทนภัยกว่านี้`, '#ef7d57');
  }

  /** ป้าย "🏠 ปลอดภัย" ข้างหัวใจ (MiniHud ฟัง 'home:inside') */
  private badge() {
    const st = this.house;
    if (!st) return;
    const pct = Math.round((st.hp / st.maxHp) * 100);
    const shaking = this.warned !== '' && st.lv < hazardPower(this.threat()?.id ?? '', this.s.hazards?.level ?? 1);
    const text = shaking ? `⚠ บ้านสั่น · บ้าน ${pct}%` : pct < 100 ? `🏠 ปลอดภัย · บ้าน ${pct}%` : '🏠 ปลอดภัย';
    const color = shaking ? '#ef7d57' : pct < 50 ? '#ffcd75' : '#a7f070';
    const k = text + color;
    if (k === this.badgeKey) return;
    this.badgeKey = k;
    EventBus.emit('home:inside', true, text, color);
  }

  // ------------------------------------------------------------------
  // เซฟ / โหลด
  // ------------------------------------------------------------------
  /** บ้านที่อยู่ข้างใน (tile ซ้ายบน) — เซฟ */
  serialize(): [number, number] | undefined {
    return this.house ? [this.house.tx, this.house.ty] : undefined;
  }

  /** ตำแหน่งที่เซฟแทนตัวผู้เล่น (ในบ้าน = หน้าประตู) */
  savePos(): { x: number; y: number } | null {
    return this.house ? { ...this.front } : null;
  }

  /** โหลดเซฟที่อยู่ในบ้าน → เข้าบ้านหลังเดิมทันที (บ้านหายไปแล้ว = ยืนหน้าประตูตามเซฟ) */
  init(saved?: [number, number]) {
    if (!saved) return;
    const st = this.s.structureList().find((x) => x.tx === saved[0] && x.ty === saved[1] && isDwelling(x.def) && !x.getData('foreign'));
    if (st) this.enter(st, true);
  }
}
