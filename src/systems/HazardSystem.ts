import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { CENTER_SLOT } from '../core/RoomService';
import type { GameScene } from '../scenes/GameScene';
import { TILE, isWater } from '../world/tiles';
import type { Structure } from '../entities/Structure';
import { ITEMS } from '../data/items';
import { BIOMES, type Biome } from '../data/islands';
import type { BoxTier } from '../data/loot';
import { ScreenTint, ensurePuff } from './BiomeSystem';
import type { LightSource } from './LightingSystem';

/** กล่องรางวัลเมื่อรอดภัยกลางวัน: ระดับ 1–2 ไม้ · 3–4 เหล็ก · 5+ เหล็ก (ลุ้นทอง 25%) */
export function hazardBox(level: number): BoxTier {
  if (level >= 5) return Math.random() < 0.25 ? 'box_gold' : 'box_iron';
  return level >= 3 ? 'box_iron' : 'box_wood';
}
import { IMPACT_MULT, QUAKE, materialOf } from './ShelterSystem';

/**
 * ภัยพิบัติระหว่างวัน — มาเรื่อยๆ ไม่หยุด (นอกจากภัยประจำคืนใน DisasterSystem)
 * ยิ่งรอดนาน ภัยยิ่งถี่และหนักขึ้น · ภัยใหม่ปลดล็อกตามวัน · สุ่มแบบถ่วงน้ำหนักตามไบโอมของเกาะที่ยืนอยู่ (กลางทะเลใช้น้ำหนัก sea)
 * ไม่เกิดตอนอยู่เกาะกลาง/ในดันเจี้ยน (นับเวลารอไว้ · ภัยที่กำลังเกิดจบทันทีแบบไม่ได้รางวัล) · รอดจากภัย = ได้ XP + เหรียญ + กล่อง
 * เขตปลอดภัยของบ้าน (ShelterSystem): จุดตก/จุดเกิดสุ่มใหม่นอกวงเสมอ · ภัยสภาพอากาศ (ทราย หิมะ กรด หมอก น้ำท่วม) ไม่มีผลในวง
 * วัสดุ: แรงกระแทกต่อสิ่งก่อสร้าง ไม้ ×1 / หิน ×0.6 / เหล็ก ×0.4 · ไฟไหม้เฉพาะของไม้/หญ้า
 */
export type HazardId =
  | 'quake' | 'lightning' | 'heatwave' | 'coldsnap' | 'stampede' | 'meteor' | 'wildfire' | 'tsunami'
  | 'sandstorm' | 'blizzard' | 'eruption' | 'acid_rain' | 'locusts' | 'flood' | 'toxic_fog' | 'eclipse' | 'tornado' | 'whirlpool';

export interface HazardDef {
  id: HazardId;
  name: string;
  warn: string;
  color: string;
  /** เกิดได้ตั้งแต่วันที่ */
  fromDay: number;
  /** ระยะเวลา (วินาที) */
  duration: number;
  /** น้ำหนักสุ่มตามไบโอม (ไม่ระบุ = base) */
  w?: Partial<Record<Biome, number>>;
  /** น้ำหนักบนเกาะที่ไม่ได้ระบุใน w (ค่าเริ่ม 1) */
  base?: number;
  /** น้ำหนักตอนล่องเรือกลางทะเล (ค่าเริ่ม 0 = ภัยบนบกเท่านั้น) */
  sea?: number;
}

export const HAZARDS: HazardDef[] = [
  { id: 'quake', name: 'แผ่นดินไหว', warn: 'พื้นเริ่มสั่น… สิ่งก่อสร้างอาจพัง! (หิน/เหล็กทนกว่าไม้ · ซ่อมได้)', color: '#c28a50', fromDay: 1, duration: 8, w: { volcanic: 2, crystal: 1.6, glacier: 1.3 } },
  { id: 'lightning', name: 'พายุฟ้าผ่า', warn: 'เมฆดำตั้งเค้า… หลบวงแดงก่อนฟ้าผ่า! (ในบ้านปลอดภัย)', color: '#73eff7', fromDay: 1, duration: 28, sea: 1.5, w: { savanna: 1.3, desert: 0.4, glacier: 0.5 } },
  { id: 'stampede', name: 'ฝูงสัตว์คลั่ง', warn: 'เสียงฝีเท้ากระหึ่ม… ฝูงหมาป่าคลั่งกำลังมา! (ตั้งหลักในบ้าน/ป้อม)', color: '#ef7d57', fromDay: 2, duration: 40, w: { savanna: 2.5, forest: 1.5, atoll: 0.4, glacier: 0.6 } },
  { id: 'heatwave', name: 'คลื่นความร้อน', warn: 'แดดแผดเผา… หิวน้ำเร็ว หาที่ร่ม/ดื่มน้ำ!', color: '#ef7d57', fromDay: 2, duration: 45, sea: 0.8, w: { desert: 3, savanna: 2.5, volcanic: 2.5, snow: 0.15, glacier: 0.1 } },
  { id: 'coldsnap', name: 'ความหนาวฉับพลัน', warn: 'ลมเย็นจัดพัดมา… อยู่ใกล้ไฟ ใส่ชุดกันหนาว!', color: '#d6e4ee', fromDay: 2, duration: 45, sea: 0.6, w: { snow: 2.5, glacier: 2.5, desert: 0.5, volcanic: 0.2 } },
  { id: 'wildfire', name: 'ไฟป่า', warn: 'กลิ่นควันไฟ… ไฟป่ากำลังลุกลาม! (ถอยห่างต้นไม้ · บ้านหิน/เหล็กไม่ไหม้)', color: '#ef7d57', fromDay: 3, duration: 25,
    w: { forest: 2, jungle: 1.5, savanna: 2.5, bamboo: 1.5, swamp: 0.2, snow: 0.2, glacier: 0, atoll: 0.3, crystal: 0.3, desert: 0.3 } },
  { id: 'meteor', name: 'อุกกาบาตตก', warn: 'ดาวตกกลางวัน… หลบ! (ได้แร่อุกกาบาต)', color: '#ffcd75', fromDay: 3, duration: 22, w: { crystal: 2 } },
  { id: 'tsunami', name: 'คลื่นยักษ์', warn: 'น้ำทะเลลดฮวบ… คลื่นยักษ์พาสัตว์ทะเลขึ้นฝั่ง! (ถอยจากชายหาด)', color: '#41a6f6', fromDay: 4, duration: 40, w: { atoll: 2.5 } },
  // ---------- ภัยชุดใหม่ ----------
  { id: 'sandstorm', name: 'พายุทราย', warn: 'ทรายหมุนคลุ้งฟ้า… มองไม่เห็นทาง เดินช้า! เข้าบ้านหลบ หรือดื่มน้ำเผื่อไว้', color: '#e3a95f', fromDay: 3, duration: 35, base: 0.25, w: { desert: 4, savanna: 3, volcanic: 0.8 } },
  { id: 'blizzard', name: 'พายุหิมะ', warn: 'หิมะถล่มลมแรง… หนาวจัดและเดินช้า! ก่อไฟ ใส่ชุดกันหนาว หรือเข้าบ้าน', color: '#e8f4ff', fromDay: 3, duration: 35, base: 0.15, sea: 0.4, w: { snow: 4, glacier: 4.5, crystal: 1 } },
  { id: 'eruption', name: 'ภูเขาไฟระเบิด', warn: 'ภูเขาไฟพ่นลาวา… ก้อนลาวาตกใส่วงส้ม! วิ่งหลบ · บ้านหิน/เหล็กทนกว่า', color: '#ff6a3a', fromDay: 4, duration: 25, base: 0.2, w: { volcanic: 5, crystal: 0.8 } },
  { id: 'acid_rain', name: 'ฝนกรด', warn: 'ฝนสีเขียวกัดกร่อน… อยู่ใต้หลังคา (เขตบ้าน) — ของ/ผักนอกบ้านจะเสียหาย!', color: '#a7f070', fromDay: 5, duration: 30, base: 0.7, sea: 0.8, w: { swamp: 2.5, haunted: 2, volcanic: 1.5 } },
  { id: 'locusts', name: 'ฝูงตั๊กแตน', warn: 'ฝูงตั๊กแตนบุกไร่! ผักที่ไม่มีหุ่นไล่กา/โรงเพาะชำ/บ้านคุ้มกันจะถูกกิน', color: '#c4ef8a', fromDay: 4, duration: 30, base: 0.7, w: { savanna: 2.5, desert: 1.5, bamboo: 1, home: 1.4, glacier: 0, snow: 0.1 } },
  { id: 'flood', name: 'น้ำท่วม', warn: 'น้ำทะเลหนุนสูง… พื้นริมฝั่งน้ำท่วม เดินช้า! ขึ้นที่สูงกลางเกาะหรือเข้าบ้าน', color: '#41a6f6', fromDay: 4, duration: 35, base: 0.6, w: { swamp: 3, atoll: 2.5, jungle: 1.5, desert: 0.2, glacier: 0.1, volcanic: 0.2 } },
  { id: 'toxic_fog', name: 'หมอกพิษ', warn: 'หมอกพิษสีเขียวลอยมา… อย่ายืนในหมอก! (ในบ้านปลอดภัย)', color: '#7fd04a', fromDay: 5, duration: 30, base: 0.5, sea: 0.3, w: { swamp: 3, mushroom: 2.5, haunted: 2, volcanic: 1.5 } },
  { id: 'eclipse', name: 'สุริยุปราคา', warn: 'ดวงอาทิตย์ดับลงกลางวัน… มอนกลางคืนออกมา! จุดไฟ/คบเพลิง หรือหลบในบ้าน', color: '#a77bdb', fromDay: 6, duration: 40, base: 0.6, sea: 0.6, w: { haunted: 3, mushroom: 1.5 } },
  { id: 'tornado', name: 'พายุทอร์นาโด', warn: 'ลมหมุนยักษ์กำลังมา! ดูดคนและของ พังสิ่งก่อสร้างตามทาง — วิ่งหนีออกด้านข้าง/เข้าบ้าน', color: '#94b0c2', fromDay: 6, duration: 30, base: 0.6, sea: 0.5, w: { savanna: 3, desert: 1.5, home: 1, glacier: 0.5, bamboo: 0.5 } },
  { id: 'whirlpool', name: 'วังน้ำวน', warn: 'ทะเลหมุนวนดูดเรือ! เร่งเครื่อง (Shift) แล่นออกด้านข้าง อย่าเข้าใกล้ใจกลาง', color: '#3b5dc9', fromDay: 5, duration: 30, base: 0, sea: 4, w: { atoll: 2.5, swamp: 0.5 } },
];

const T = 16;

interface Mark {
  x: number;
  y: number;
  t: number;
  g: Phaser.GameObjects.Graphics;
  kind: 'bolt' | 'lava';
  bomb?: Phaser.GameObjects.Image;
}
interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
}
interface Patch {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  imgs: Phaser.GameObjects.Image[];
}
interface Vortex {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: Phaser.GameObjects.Graphics;
  spin: number;
}

export class HazardSystem {
  current: HazardDef | null = null;
  private left = 0;
  private next = 0;
  private tick = 0;
  private warned = false;
  /** วงเตือนฟ้าผ่า / ลาวา */
  private marks: Mark[] = [];
  private fires: { x: number; y: number; t: number; lava?: boolean }[] = [];
  /** ปรับอุณหภูมิอากาศระหว่างภัย (°C) */
  tempShift = 0;
  /** ตัวคูณการกระหาย */
  thirstMult = 1;
  /** ตัวคูณความเร็วเดิน (พายุทราย/หิมะ น้ำท่วม) — ในเขตบ้าน GameScene ไม่ใช้ค่านี้ */
  speedMult = 1;
  /** ความมืดระหว่างวัน (สุริยุปราคา) + สีความมืด */
  darkness = 0;
  darkTint: number | undefined;
  /** แผ่นดินไหว: ชิ้นนี้โดนไปกี่ครั้งแล้วในภัยรอบนี้ (จำกัด QUAKE.maxHits) */
  private quakeHits = new Map<Structure, number>();
  private tint: ScreenTint;
  private motes: Mote[] = [];
  private patches: Patch[] = [];
  private vortex: Vortex | null = null;
  private swarm: { x: number; y: number; dots: Phaser.GameObjects.Image[] } | null = null;
  private flood: { g: Phaser.GameObjects.Graphics; tiles: Set<number>; rise: number; at: number } | null = null;
  private told = false;
  /** ?hazard=<id> บังคับภัยถัดไป (ทดสอบ) */
  private forced: HazardId | null = null;

  constructor(private s: GameScene) {
    ensurePuff(s);
    this.tint = new ScreenTint(s, 1e6 + 1);
    this.schedule(true);
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('hazard') : null;
    if (q && HAZARDS.some((h) => h.id === q)) {
      this.forced = q as HazardId;
      this.next = 8;
    }
  }

  /** ระดับความรุนแรง (1 + ทุก 3 วัน) */
  get level() {
    return 1 + Math.floor((this.s.dayNight.day - 1) / 3);
  }

  get status(): string | null {
    if (this.current) return `⚠ ${this.current.name} — อีก ${Math.ceil(this.left)} วิ (ระดับ ${this.level})`;
    if (this.next < 12 && this.warned) return `⚠ ภัยกำลังมาใน ${Math.ceil(this.next)} วิ`;
    return null;
  }

  /** เวลาถึงภัยครั้งถัดไป: เริ่ม ~150 วิ แล้วสั้นลงเรื่อยๆ ตามวัน (ต่ำสุด ~55 วิ) */
  private schedule(first = false) {
    const day = this.s.dayNight?.day ?? 1;
    const base = Math.max(55, 150 - (day - 1) * 8);
    this.next = (first ? 90 : base) * Phaser.Math.FloatBetween(0.8, 1.2);
    this.warned = false;
  }

  /** ภัยเกิดได้ไหมตอนนี้ (ไม่เกิดบนเกาะกลาง/ในดันเจี้ยน/ระหว่างภัยประจำคืน) */
  private canHappen() {
    const s = this.s;
    if (s.inGrace || s.interiors.current !== null || s.currentSlot === CENTER_SLOT || s.disaster.active) return false;
    return true;
  }

  /** ล่องเรืออยู่เหนือน้ำ */
  private get atSea() {
    const s = this.s;
    return s.boatRiding && isWater(s.tileAt(Math.floor(s.player.x / T), Math.floor(s.player.y / T)));
  }

  /** น้ำหนักสุ่มของภัยตามที่อยู่ปัจจุบัน */
  weightOf(h: HazardDef): number {
    if (this.atSea) return h.sea ?? 0;
    const w = h.w?.[this.s.currentBiome as Biome] ?? h.base ?? 1;
    if (h.id === 'whirlpool' && w > 0 && !this.waterSpot()) return 0;
    return w;
  }

  /** แสงจากลาวา/ไฟระหว่างภัย */
  lights(): LightSource[] {
    if (!this.fires.length) return [];
    return this.fires.slice(0, 12).map((f) => ({ x: f.x, y: f.y, radius: f.lava ? 34 : 26 }));
  }

  update(dt: number) {
    this.updateMarks(dt);
    this.updateFires(dt);
    if (this.current) {
      // ย้ายไปเกาะกลาง/ดันเจี้ยนระหว่างภัย → ภัยจบเงียบๆ (ไม่ได้รางวัล)
      if (!this.canHappen()) return this.finish(true);
      this.left -= dt;
      this.tick -= dt;
      if (this.tick <= 0) this.step();
      this.continuous(dt);
      if (this.left <= 0) this.finish();
      return;
    }
    this.continuous(dt);
    if (!this.canHappen()) return;
    this.next -= dt;
    if (this.next < 6 && !this.warned) {
      this.warned = true;
      Sfx.play('horn');
    }
    if (this.next <= 0) this.start();
  }

  start(id?: HazardId) {
    const day = this.s.dayNight.day;
    const want = id ?? this.forced ?? undefined;
    this.forced = null;
    let h = want ? HAZARDS.find((x) => x.id === want) : undefined;
    if (!h) {
      // สุ่มถ่วงน้ำหนักตามไบโอม (กลางทะเล = น้ำหนัก sea)
      const pool = HAZARDS.filter((x) => x.fromDay <= day).map((x) => [x, this.weightOf(x)] as const).filter(([, w]) => w > 0);
      let r = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
      h = pool.find(([, w]) => (r -= w) < 0)?.[0] ?? HAZARDS[1];
    }
    this.current = h;
    this.left = h.duration * (1 + (this.level - 1) * 0.15);
    this.tick = 0.5;
    this.told = false;
    this.quakeHits.clear();
    EventBus.emit('ui:splash', { art: `hz_${h.id}`, title: `⚠ ${h.name}!`, sub: `${h.warn} · ระดับ ${this.level}`, color: h.color });
    Sfx.play('thunder');
    const s = this.s;
    const lvl = this.level;
    switch (h.id) {
      case 'lightning':
        s.weather.set('storm', this.left + 5);
        break;
      case 'heatwave':
        this.tempShift = 14 + lvl * 2;
        this.thirstMult = 3;
        break;
      case 'coldsnap':
        this.tempShift = -(20 + lvl * 3);
        break;
      case 'stampede':
        this.spawnPack(['wolf', 'wolf', 'snow_wolf'], 3 + lvl, 'land');
        break;
      case 'tsunami':
        s.cameras.main.shake(1200, 0.006);
        this.spawnPack(['crab', 'crab', 'serpent'], 3 + lvl, 'sea');
        break;
      case 'wildfire':
        this.igniteTrees(4 + lvl * 2);
        break;
      case 'sandstorm':
        this.thirstMult = 1.5;
        break;
      case 'blizzard':
        this.tempShift = -(18 + lvl * 3);
        break;
      case 'eruption':
        s.cameras.main.shake(1500, 0.01);
        break;
      case 'acid_rain':
        s.weather.set('rain', this.left + 5);
        break;
      case 'locusts': {
        const p = s.player;
        const a = Math.random() * Math.PI * 2;
        const dots: Phaser.GameObjects.Image[] = [];
        for (let i = 0; i < 26 + lvl * 4; i++) dots.push(s.add.image(0, 0, 'px').setTint(i % 3 ? 0x7f9a46 : 0xc4ef8a).setScale(0.7).setDepth(1e6 + 2));
        this.swarm = { x: p.x + Math.cos(a) * 260, y: p.y + Math.sin(a) * 260, dots };
        break;
      }
      case 'flood':
        this.buildFlood();
        break;
      case 'toxic_fog':
        for (let i = 0; i < Math.min(8, 3 + lvl); i++) this.addPatch();
        break;
      case 'eclipse':
        this.darkTint = 0x1a0e2a;
        this.spawnPack(this.nightMobs(), 2 + lvl, 'land');
        break;
      case 'tornado':
      case 'whirlpool':
        this.makeVortex(h.id);
        break;
      default:
    }
  }

  /** ทำงานเป็นจังหวะระหว่างภัย */
  private step() {
    const s = this.s;
    const p = s.player;
    const h = this.current!;
    const lvl = this.level;
    const inside = !!s.shelter.inside;
    switch (h.id) {
      case 'quake': {
        this.tick = 0.8;
        s.cameras.main.shake(inside ? 450 : 700, 0.008);
        p.stamina = Math.max(0, p.stamina - (inside ? 3 : 6)); // ในบ้านโดนครึ่งเดียว
        // สุ่ม 1+ระดับ ชิ้น (ไม่ซ้ำ) · ดาเมจคงที่ตามระดับ × วัสดุ (เพดาน 12% HP) · ชิ้นเดียวโดนไม่เกิน 3 ครั้ง → บ้านไม่พังในภัยเดียว ซ่อมได้
        const near = s.structureList().filter((st) => !st.getData('foreign') && st.def.layer !== 'floor' && (this.quakeHits.get(st) ?? 0) < QUAKE.maxHits && Phaser.Math.Distance.Between(st.x, st.y, p.x, p.y) < 380);
        Phaser.Utils.Array.Shuffle(near);
        for (const st of near.slice(0, 1 + lvl)) {
          this.quakeHits.set(st, (this.quakeHits.get(st) ?? 0) + 1);
          const dmg = Math.min((QUAKE.base + QUAKE.perLevel * lvl) * IMPACT_MULT[materialOf(st.def)], st.maxHp * QUAKE.capFrac);
          s.damageStructure(st, dmg * Phaser.Math.FloatBetween(0.8, 1.2));
          s.fx.debris(st.x, st.y - 8, 0x8a5a35, 5);
        }
        Sfx.play('breakRock', 200);
        break;
      }
      case 'lightning':
      case 'eruption': {
        const lava = h.id === 'eruption';
        this.tick = lava ? Math.max(0.5, 1.2 - lvl * 0.1) : Math.max(1, 2.6 - lvl * 0.25);
        // จุดตกอยู่นอกเขตปลอดภัยของบ้านเสมอ (สุ่มใหม่) · อยู่ในบ้าน = ไม่เล็งตัวเรา
        const pt = s.shelter.outside(() => {
          const a = Math.random() * Math.PI * 2;
          const r = Phaser.Math.Between(20, inside ? 220 : 150);
          return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
        });
        const kind = lava ? 'lava' : 'bolt';
        if (pt) this.mark(pt.x, pt.y, lava ? 1.5 : 1.3, kind);
        if (!inside && Math.random() < (lava ? 0.3 : 0.35)) this.mark(p.x, p.y + 6, lava ? 1.6 : 1.4, kind); // บางทีเล็งตัวเราตรงๆ
        if (lava && Math.random() < 0.3) s.cameras.main.shake(300, 0.004);
        break;
      }
      case 'meteor':
        this.tick = Math.max(0.8, 1.8 - lvl * 0.15);
        s.dropMeteor(true);
        break;
      case 'stampede':
      case 'tsunami':
        this.tick = 12;
        if (this.left > 14) this.spawnPack(h.id === 'stampede' ? ['wolf', 'snow_wolf'] : ['crab', 'serpent'], 1 + Math.floor(lvl / 2), h.id === 'stampede' ? 'land' : 'sea');
        break;
      case 'wildfire':
        this.tick = 4;
        this.igniteTrees(1 + Math.floor(lvl / 2));
        break;
      case 'sandstorm':
        this.tick = 1;
        if (!inside && !s.riding) this.hurt(0.4 + lvl * 0.2, 'พายุทราย');
        break;
      case 'acid_rain':
        this.tick = 1;
        this.acidTick(lvl, inside);
        break;
      case 'locusts':
        this.tick = 1;
        this.locustTick(lvl, inside);
        break;
      case 'flood':
        this.tick = 8;
        if (this.left > 6) this.buildFlood(); // น้ำตามไปรอบตัวผู้เล่น
        break;
      case 'toxic_fog':
        this.tick = 8;
        if (this.patches.length < Math.min(10, 4 + lvl)) this.addPatch();
        break;
      case 'eclipse':
        this.tick = 12;
        if (this.left > 10) this.spawnPack(this.nightMobs(), 1 + Math.floor(lvl / 2), 'land');
        break;
      case 'tornado':
      case 'whirlpool':
        this.tick = 0.5;
        this.vortexTick(lvl);
        break;
      default:
        this.tick = 1;
    }
  }

  /** ผลต่อเนื่องทุกเฟรม: ม่านสี อนุภาค ความช้า ความมืด หมอก น้ำวน */
  private continuous(dt: number) {
    const s = this.s;
    const p = s.player;
    const h = this.current;
    const lvl = this.level;
    const inside = !!s.shelter.inside;
    let tint = 0;
    let color = 0;
    let slow = 1;
    let motes = 0;
    let mote: 'sand' | 'snow' | 'ash' | 'acid' = 'sand';
    switch (h?.id) {
      case 'sandstorm':
        color = 0xd9a066;
        tint = inside ? 0.12 : Math.min(0.5, 0.3 + lvl * 0.03);
        slow = Math.max(0.6, 0.8 - lvl * 0.03);
        motes = 70;
        break;
      case 'blizzard':
        color = 0xe8f4ff;
        tint = inside ? 0.1 : Math.min(0.5, 0.28 + lvl * 0.03);
        slow = Math.max(0.6, 0.8 - lvl * 0.03);
        motes = 90;
        mote = 'snow';
        break;
      case 'eruption':
        color = 0x6a2a1a;
        tint = 0.16;
        motes = 30;
        mote = 'ash';
        break;
      case 'acid_rain':
        color = 0x9bd34a;
        tint = inside ? 0.05 : 0.12;
        motes = 20;
        mote = 'acid';
        break;
      case 'flood':
        if (this.flood && !s.riding) {
          const k = Math.floor(p.feetY / T) * s.world.size + Math.floor(p.x / T);
          if (this.flood.rise > 0.5 && this.flood.tiles.has(k)) slow = 0.55;
        }
        break;
      default:
    }
    this.speedMult = slow;
    this.tint.update(dt, color || 0xffffff, tint);
    // ความมืดสุริยุปราคา (ค่อยๆ มืด/สว่าง)
    const dk = h?.id === 'eclipse' ? Math.min(0.8, 0.6 + lvl * 0.03) : 0;
    this.darkness += (dk - this.darkness) * Math.min(1, dt * 0.8);
    if (this.darkness < 0.02 && !dk) this.darkTint = undefined;
    // อนุภาค
    const view = s.cameras.main.worldView;
    while (this.motes.length < motes) this.motes.push(this.mote(mote, view));
    this.motes = this.motes.filter((m) => {
      m.life -= dt;
      m.img.x += m.vx * dt;
      m.img.y += m.vy * dt;
      if (m.life <= 0 || this.motes.length > motes + 8) {
        m.img.destroy();
        return false;
      }
      return true;
    });
    this.updatePatches(dt, inside);
    this.updateSwarm(dt, inside);
    this.updateFlood(dt);
    this.updateVortex(dt, inside, lvl);
  }

  private finish(quiet = false) {
    const h = this.current!;
    this.current = null;
    this.tempShift = 0;
    this.thirstMult = 1;
    this.schedule();
    this.cleanup(h);
    const s = this.s;
    if (quiet) {
      this.marks.forEach((m) => {
        m.g.destroy();
        m.bomb?.destroy();
      });
      this.marks = [];
      return;
    }
    if (s.player.dead) return;
    const coins = 15 + this.level * 10;
    s.wallet.add(coins);
    s.addXp(10 + this.level * 5);
    // รอดทุกครั้ง = ได้กล่อง 1 ใบ (ระดับภัยยิ่งสูง กล่องยิ่งดี) · เกาะเรา = กล่องไม้ · เขตผจญภัย = +1 ขั้น
    const box = s.capBox(hazardBox(this.level), 'hazard');
    s.spawnRewardChest(box);
    EventBus.emit('toast', `☀ รอดจาก${h.name}! +${coins} เหรียญ + ${ITEMS[box].name}`, '#a7f070');
    Sfx.play('victory');
  }

  /** ล้างของชั่วคราวของภัย */
  private cleanup(h: HazardDef) {
    this.patches.forEach((p) => p.imgs.forEach((i) => i.destroy()));
    this.patches = [];
    if (this.swarm) this.swarm.dots.forEach((d) => d.destroy());
    this.swarm = null;
    if (this.flood) {
      const f = this.flood;
      this.s.tweens.add({ targets: f.g, alpha: 0, duration: 2500, onComplete: () => f.g.destroy() });
    }
    this.flood = null;
    this.vortex?.g.destroy();
    this.vortex = null;
    // สุริยุปราคาจบ → มอนกลางคืนที่มากับภัยลุกไหม้
    if (h.id === 'eclipse') for (const m of this.s.mobList()) if (m.getData('hazard') && !m.isBoss) m.burning = true;
  }

  private hurt(n: number, why: string) {
    const p = this.s.player;
    if (p.dead) return;
    p.hp = Math.max(0, p.hp - n);
    p.lastDamage = why;
  }

  private tell(text: string, color: string) {
    if (this.told) return;
    this.told = true;
    EventBus.emit('toast', text, color);
  }

  private nightMobs(): string[] {
    const b = BIOMES[this.s.currentBiome as Biome];
    const list = (b?.nightMobs ?? []).filter((id) => id !== 'bat');
    return list.length ? list : ['zombie', 'skeleton'];
  }

  // ------------------------------------------------------------------ วงเตือน (ฟ้าผ่า / ลาวา)
  private mark(x: number, y: number, delay: number, kind: 'bolt' | 'lava') {
    const s = this.s;
    const g = s.add.graphics().setDepth(1e6 - 1);
    const m: Mark = { x, y, t: delay, g, kind };
    if (kind === 'lava') {
      // ก้อนลาวาลอยโค้งลงมาจากฟ้า
      m.bomb = s.add.image(x + Phaser.Math.Between(-120, 120), y - 240, 'meteor').setDepth(1e6 + 3).setScale(1.1).setTint(0xff6a3a);
      s.tweens.add({ targets: m.bomb, x, y, duration: delay * 1000, ease: 'Quad.easeIn' });
    }
    this.marks.push(m);
  }

  private updateMarks(dt: number) {
    for (const m of [...this.marks]) {
      m.t -= dt;
      const k = Math.max(0, m.t);
      const [c0, c1] = m.kind === 'lava' ? [0xb13e53, 0xff8a3a] : [0xb13e53, 0xff3355];
      m.g.clear().fillStyle(c0, 0.22).fillCircle(m.x, m.y, 26).fillStyle(c1, 0.45 + (1 - k) * 0.3).fillCircle(m.x, m.y, 26 * (1 - k * 0.6)).lineStyle(2, 0xfff2b0, 0.95).strokeCircle(m.x, m.y, 26);
      if (m.t > 0) continue;
      m.g.destroy();
      m.bomb?.destroy();
      this.marks.splice(this.marks.indexOf(m), 1);
      if (m.kind === 'lava') this.lavaImpact(m.x, m.y);
      else this.boltImpact(m.x, m.y);
    }
  }

  private boltImpact(x: number, y: number) {
    const s = this.s;
    const bolt = s.add.graphics().setDepth(1e6);
    bolt.lineStyle(3, 0xfff2b0, 1);
    let bx = x;
    let by = y - 220;
    bolt.beginPath().moveTo(bx, by);
    while (by < y) {
      bx += Phaser.Math.Between(-10, 10);
      by += Phaser.Math.Between(16, 30);
      bolt.lineTo(bx, Math.min(by, y));
    }
    bolt.strokePath();
    s.tweens.add({ targets: bolt, alpha: 0, duration: 260, onComplete: () => bolt.destroy() });
    s.cameras.main.flash(120, 255, 255, 230);
    s.fx.ring(x, y, 0xfff2b0, 26);
    s.fx.sparks(x, y, 0x73eff7, 10, 20);
    Sfx.play('thunder', 150);
    const dmg = 18 + this.level * 6;
    const p = s.player;
    if (Phaser.Math.Distance.Between(p.x, p.feetY, x, y) < 28) {
      p.lastDamage = 'ฟ้าผ่า';
      s.fx.damageNumber(p.x, p.y - 12, p.hurt(dmg), 0xffcd75);
    }
    s.damageStructureAt(x, y, dmg * 2, 'impact');
  }

  /** ลาวาตก: ระเบิด + ไฟลวก + ทิ้งแอ่งลาวาไหม้ 3 วิ */
  private lavaImpact(x: number, y: number) {
    const s = this.s;
    s.fx.ring(x, y, 0xff8a3a, 30);
    s.fx.sparks(x, y, 0xef7d57, 14, 26);
    s.fx.debris(x, y, 0x3a3346, 6);
    Sfx.play('breakRock', 150);
    const dmg = 16 + this.level * 5;
    const p = s.player;
    if (Phaser.Math.Distance.Between(p.x, p.feetY, x, y) < 28) {
      p.lastDamage = 'ลาวาภูเขาไฟ';
      s.fx.damageNumber(p.x, p.y - 12, p.hurt(dmg), 0xef7d57);
      s.creatures.afflict({ kind: 'burn', dur: 3, power: 3 + this.level }, 'ลาวาภูเขาไฟ');
    }
    s.damageStructureAt(x, y, dmg * 3, 'impact');
    if (!isWater(s.tileAt(Math.floor(x / T), Math.floor(y / T)))) this.fires.push({ x, y: y - 6, t: 3, lava: true });
  }

  /** ไฟป่า: จุดไฟต้นไม้ใกล้ตัว ไฟไหม้ต้นไม้หมด + ลวกคน/สิ่งก่อสร้างที่อยู่ใกล้ */
  private igniteTrees(n: number) {
    const s = this.s;
    const p = s.player;
    const trees = s.nodesNear(p.x, p.y, 320, (nd) => nd.available && nd.spec.harvest === 'tree' && !s.shelter.at(nd.x, nd.baseY));
    Phaser.Utils.Array.Shuffle(trees);
    for (const t of trees.slice(0, n)) {
      t.deplete(s.worldTime);
      this.fires.push({ x: t.x, y: t.baseY - 6, t: 9 });
    }
  }

  private updateFires(dt: number) {
    const s = this.s;
    const p = s.player;
    for (const f of [...this.fires]) {
      f.t -= dt;
      if (Math.random() < dt * 8) s.fx.sparks(f.x + Phaser.Math.Between(-6, 6), f.y, Math.random() < 0.5 ? 0xef7d57 : 0xffcd75, 2, 14);
      if (Phaser.Math.Distance.Between(p.x, p.feetY, f.x, f.y + 6) < 22) {
        p.hp -= (6 + this.level * 2) * dt;
        p.lastDamage = f.lava ? 'ลาวาภูเขาไฟ' : 'ไฟป่า';
      }
      if (Math.random() < dt) s.damageStructureAt(f.x + Phaser.Math.Between(-16, 16), f.y + Phaser.Math.Between(-8, 16), 6, 'fire'); // ไหม้เฉพาะของไม้/หญ้า
      if (f.t <= 0) this.fires.splice(this.fires.indexOf(f), 1);
    }
  }

  // ------------------------------------------------------------------ อนุภาค
  private mote(kind: 'sand' | 'snow' | 'ash' | 'acid', view: Phaser.Geom.Rectangle): Mote {
    const s = this.s;
    const x = view.x + Math.random() * (view.width + 80) - 60;
    const y = view.y + Math.random() * view.height;
    const img = s.add.image(x, y, 'px').setDepth(1e6 + 2);
    if (kind === 'sand') {
      img.setTint(Math.random() < 0.5 ? 0xe3a95f : 0xc98a48).setScale(Phaser.Math.FloatBetween(0.5, 1.4), 0.5).setAlpha(0.8);
      return { img, vx: Phaser.Math.Between(160, 260), vy: Phaser.Math.Between(-10, 20), life: Phaser.Math.FloatBetween(0.6, 1.6) };
    }
    if (kind === 'snow') {
      img.setTint(0xf4f4f4).setScale(Math.random() < 0.5 ? 0.6 : 1).setAlpha(0.95);
      return { img, vx: Phaser.Math.Between(90, 170), vy: Phaser.Math.Between(30, 70), life: Phaser.Math.FloatBetween(0.8, 2) };
    }
    if (kind === 'ash') {
      img.setTint(Math.random() < 0.7 ? 0x3a3346 : 0xef7d57).setScale(0.6).setAlpha(0.85);
      return { img, vx: Phaser.Math.Between(-10, 20), vy: Phaser.Math.Between(18, 36), life: Phaser.Math.FloatBetween(2, 4) };
    }
    img.setTint(0xa7f070).setScale(0.5, 1.6).setAlpha(0.7);
    return { img, vx: 20, vy: Phaser.Math.Between(170, 220), life: Phaser.Math.FloatBetween(0.25, 0.7) };
  }

  // ------------------------------------------------------------------ ฝนกรด
  private acidTick(lvl: number, inside: boolean) {
    const s = this.s;
    const p = s.player;
    if (!inside) {
      this.hurt(1 + lvl * 0.5, 'ฝนกรด');
      this.tell('🧪 ฝนกรดแสบผิว! เข้าไปอยู่ในเขตบ้าน (ใต้หลังคา)', '#a7f070');
    }
    // สิ่งก่อสร้างนอกเขตบ้านถูกกัดกร่อน (หิน/เหล็กทนกว่า)
    const list = s.structureList().filter((st) => !st.getData('foreign') && st.def.layer !== 'floor' && !s.shelter.at(st.x, st.y - 4) && Phaser.Math.Distance.Between(st.x, st.y, p.x, p.y) < 320);
    Phaser.Utils.Array.Shuffle(list);
    for (const st of list.slice(0, 1 + Math.floor(lvl / 2))) {
      s.damageStructure(st, (3 + lvl * 1.5) * IMPACT_MULT[materialOf(st.def)]);
      s.fx.sparks(st.x, st.y - 8, 0xa7f070, 3, 8);
    }
    // ผักนอกบ้านเหี่ยว (โรงเพาะชำคุ้มกัน)
    for (const plot of this.cropPlots(400)) {
      if (Math.random() < 0.5) continue;
      plot.growth = Math.max(0, plot.growth - 0.08);
      plot.refreshCrop();
    }
  }

  /** แปลงผักที่ไม่มีอะไรคุ้มกัน (นอกเขตบ้าน · ไม่มีหุ่นไล่กาใน 6 ช่อง · ไม่อยู่ในรัศมีโรงเพาะชำ) */
  private cropPlots(range: number, scarecrowCounts = false): Structure[] {
    const s = this.s;
    const p = s.player;
    const all = s.structureList();
    const crows = scarecrowCounts ? all.filter((x) => x.def.id === 'scarecrow') : [];
    const houses = all.filter((x) => x.def.id === 'greenhouse');
    return all.filter(
      (st) =>
        st.def.crop && !!st.crop && !st.getData('foreign') && Phaser.Math.Distance.Between(st.x, st.y, p.x, p.y) < range && !s.shelter.at(st.x, st.y - 4) &&
        !crows.some((c) => Phaser.Math.Distance.Between(c.x, c.y, st.x, st.y) < 96) &&
        !houses.some((g) => Phaser.Math.Distance.Between(g.x, g.y - 8, st.x, st.y) < (g.def.growAura?.r ?? 72)),
    );
  }

  // ------------------------------------------------------------------ ฝูงตั๊กแตน
  private locustTick(lvl: number, inside: boolean) {
    const s = this.s;
    const sw = this.swarm;
    if (!sw) return;
    for (const plot of this.cropPlots(1200, true)) {
      if (Phaser.Math.Distance.Between(plot.x, plot.y - 4, sw.x, sw.y) > 44) continue;
      plot.growth -= 0.3;
      if (plot.growth <= 0) {
        plot.harvest();
        plot.refreshCrop();
        EventBus.emit('toast', '🦗 ตั๊กแตนกินผักไปหนึ่งแปลง! (วางหุ่นไล่กาใกล้แปลงกันได้)', '#ef7d57');
      } else plot.refreshCrop();
      s.fx.sparks(plot.x, plot.y - 6, 0xc4ef8a, 4, 10);
    }
    const p = s.player;
    if (!inside && !s.riding && Phaser.Math.Distance.Between(p.x, p.y, sw.x, sw.y) < 50) {
      this.hurt(1 + lvl * 0.5, 'ฝูงตั๊กแตน');
      this.tell('🦗 ฝูงตั๊กแตนรุมกัด! วิ่งหนีหรือเข้าบ้าน', '#c4ef8a');
    }
  }

  private updateSwarm(dt: number, _inside: boolean) {
    const sw = this.swarm;
    if (!sw) return;
    const s = this.s;
    const p = s.player;
    // บินไปหาแปลงผักที่ไม่มีอะไรคุ้มกันที่ใกล้ที่สุด ไม่งั้นตามผู้เล่น
    let tx = p.x;
    let ty = p.y;
    let best = 1e9;
    for (const plot of this.cropPlots(1200, true)) {
      const d = Phaser.Math.Distance.Between(plot.x, plot.y, sw.x, sw.y);
      if (d < best) {
        best = d;
        tx = plot.x;
        ty = plot.y - 4;
      }
    }
    const a = Math.atan2(ty - sw.y, tx - sw.x);
    const nx = sw.x + Math.cos(a) * 55 * dt;
    const ny = sw.y + Math.sin(a) * 55 * dt;
    if (!s.shelter.at(nx, ny)) {
      sw.x = nx;
      sw.y = ny;
    }
    const t = s.worldTime;
    sw.dots.forEach((d, i) => d.setPosition(sw.x + Math.sin(t * 3 + i * 1.7) * (14 + (i % 5) * 5), sw.y + Math.cos(t * 2.4 + i * 2.3) * (9 + (i % 4) * 4) - 10));
    if (Math.random() < dt * 4) Sfx.play('hitWood', 400);
  }

  // ------------------------------------------------------------------ น้ำท่วม (ภาพทับพื้น ไม่เปลี่ยน tile จริง)
  private buildFlood() {
    const s = this.s;
    const w = s.world;
    const S = w.size;
    const p = s.player;
    const R = 24;
    const cx = Math.floor(p.x / T);
    const cy = Math.floor(p.y / T);
    const depth = Math.min(6, 2 + Math.floor(this.level / 2));
    // BFS จากน้ำ → พื้นดินที่ห่างน้ำไม่เกิน depth ช่อง
    const dist = new Map<number, number>();
    const q: number[] = [];
    for (let y = cy - R; y <= cy + R; y++) {
      for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        if (isWater(s.tileAt(x, y))) {
          const k = y * S + x;
          dist.set(k, 0);
          q.push(k);
        }
      }
    }
    const tiles = new Set<number>();
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      const d = dist.get(k)!;
      if (d >= depth) continue;
      const x = k % S;
      const y = Math.floor(k / S);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (Math.abs(nx - cx) > R || Math.abs(ny - cy) > R) continue;
        const nk = ny * S + nx;
        if (dist.has(nk)) continue;
        const t = s.tileAt(nx, ny);
        if (isWater(t) || t === TILE.ROCKWALL) continue;
        dist.set(nk, d + 1);
        if (s.shelter.at(nx * T + 8, ny * T + 8)) continue; // เขตบ้านน้ำไม่เข้า
        tiles.add(nk);
        q.push(nk);
      }
    }
    if (!this.flood) this.flood = { g: s.add.graphics().setDepth(-6.6), tiles, rise: 0, at: 0 };
    else this.flood.tiles = tiles;
    const g = this.flood.g.clear();
    for (const k of tiles) {
      const x = (k % S) * T;
      const y = Math.floor(k / S) * T;
      const d = dist.get(k) ?? 1;
      g.fillStyle(d <= 1 ? 0x3b5dc9 : 0x41a6f6, d <= 1 ? 0.75 : 0.55 - d * 0.04).fillRect(x, y, T, T);
      if ((x + y) % 48 === 0) g.fillStyle(0xd6e4ee, 0.5).fillRect(x + 4, y + 7, 6, 1);
    }
  }

  private updateFlood(dt: number) {
    const f = this.flood;
    if (!f) return;
    f.rise = Math.min(1, f.rise + dt / 4); // น้ำค่อยๆ ขึ้น 4 วิ
    f.g.setAlpha(f.rise * (0.85 + Math.sin(this.s.worldTime * 2) * 0.08));
    if (this.current?.id === 'flood' && f.rise >= 1 && this.s.player && !this.told) {
      const k = Math.floor(this.s.player.feetY / T) * this.s.world.size + Math.floor(this.s.player.x / T);
      if (f.tiles.has(k)) this.tell('🌊 น้ำท่วมถึงเข่า — เดินช้าลง! ขึ้นที่สูงกลางเกาะ', '#41a6f6');
    }
  }

  // ------------------------------------------------------------------ หมอกพิษ
  private addPatch() {
    const s = this.s;
    const p = s.player;
    const pt = s.shelter.outside(() => {
      const a = Math.random() * Math.PI * 2;
      const r = Phaser.Math.Between(60, 260);
      return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
    }, 12);
    if (!pt) return;
    const r = Phaser.Math.Between(36, 56);
    const a = Math.random() * Math.PI * 2;
    const sp = Phaser.Math.Between(6, 14);
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 4; i++) imgs.push(s.add.image(pt.x, pt.y, 'puff').setTint(i % 2 ? 0x5fa83a : 0x9bd34a).setAlpha(0).setScale((r / 32) * (0.85 + i * 0.12)).setDepth(1e6 - 2));
    imgs.forEach((im) => s.tweens.add({ targets: im, alpha: 0.38, duration: 1500 }));
    this.patches.push({ x: pt.x, y: pt.y, r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, imgs });
  }

  private patchCd = 0;
  private updatePatches(dt: number, inside: boolean) {
    if (!this.patches.length) return;
    const s = this.s;
    const p = s.player;
    const t = s.worldTime;
    this.patchCd -= dt;
    for (const pa of this.patches) {
      const nx = pa.x + pa.vx * dt;
      const ny = pa.y + pa.vy * dt;
      if (s.shelter.at(nx, ny)) {
        // ชนเขตบ้าน → ลอยกลับ
        pa.vx = -pa.vx;
        pa.vy = -pa.vy;
      } else {
        pa.x = nx;
        pa.y = ny;
      }
      pa.imgs.forEach((im, i) => im.setPosition(pa.x + Math.sin(t * 0.7 + i * 2) * pa.r * 0.3, pa.y + Math.cos(t * 0.6 + i * 1.6) * pa.r * 0.2));
      if (!inside && this.patchCd <= 0 && Phaser.Math.Distance.Between(p.x, p.feetY, pa.x, pa.y) < pa.r) {
        this.patchCd = 0.5;
        s.creatures.afflict({ kind: 'poison', dur: 2, power: 2 + this.level }, 'หมอกพิษ');
      }
    }
  }

  // ------------------------------------------------------------------ ทอร์นาโด / วังน้ำวน
  /** จุดน้ำใกล้ผู้เล่นสำหรับวังน้ำวน (ล่องเรือ = ข้างหน้าเรือ) */
  private waterSpot(): { x: number; y: number } | null {
    const s = this.s;
    const p = s.player;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Phaser.Math.Between(110, s.boatRiding ? 200 : 300);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      const tx = Math.floor(x / T);
      const ty = Math.floor(y / T);
      if (isWater(s.tileAt(tx, ty)) && isWater(s.tileAt(tx + 2, ty)) && isWater(s.tileAt(tx - 2, ty)) && !s.isSafeTile(tx, ty)) return { x, y };
    }
    return null;
  }

  private makeVortex(kind: 'tornado' | 'whirlpool') {
    const s = this.s;
    const p = s.player;
    let pt: { x: number; y: number } | null;
    if (kind === 'whirlpool') pt = this.waterSpot();
    else {
      pt = s.shelter.outside(() => {
        const a = Math.random() * Math.PI * 2;
        return { x: p.x + Math.cos(a) * 240, y: p.y + Math.sin(a) * 240 };
      }, 12);
    }
    if (!pt) {
      this.left = 0.1; // หาจุดไม่ได้ → ภัยจบทันที (ยังได้รางวัล)
      return;
    }
    const g = s.add.graphics().setDepth(kind === 'whirlpool' ? -6.8 : pt.y + 30);
    this.vortex = { x: pt.x, y: pt.y, vx: 0, vy: 0, g, spin: 0 };
  }

  private updateVortex(dt: number, inside: boolean, lvl: number) {
    const v = this.vortex;
    const h = this.current;
    if (!v || !h) return;
    const s = this.s;
    const p = s.player;
    const water = h.id === 'whirlpool';
    v.spin += dt * (water ? 2.5 : 6);
    // เคลื่อนที่: ทอร์นาโดเลื้อยตามผู้เล่นช้าๆ (เลี่ยงเขตบ้าน) · วังน้ำวนลอยช้ามาก
    if (!water) {
      const sp = Math.min(75, 40 + lvl * 4);
      const a = Math.atan2(p.y - v.y, p.x - v.x) + Math.sin(s.worldTime * 0.8) * 0.9;
      v.vx += (Math.cos(a) * sp - v.vx) * Math.min(1, dt);
      v.vy += (Math.sin(a) * sp - v.vy) * Math.min(1, dt);
      let nx = v.x + v.vx * dt;
      let ny = v.y + v.vy * dt;
      if (s.shelter.at(nx, ny)) {
        // เบี่ยงหลบเขตบ้าน
        const t = v.vx;
        v.vx = -v.vy;
        v.vy = t;
        nx = v.x + v.vx * dt;
        ny = v.y + v.vy * dt;
        if (s.shelter.at(nx, ny)) {
          nx = v.x;
          ny = v.y;
        }
      }
      v.x = nx;
      v.y = ny;
      v.g.setDepth(v.y + 30);
    }
    // วาด
    const g = v.g.clear();
    if (water) {
      for (let i = 0; i < 5; i++) {
        const r = 14 + i * 14;
        g.lineStyle(2, i % 2 ? 0xd6e4ee : 0x73eff7, 0.75 - i * 0.12);
        g.beginPath();
        g.arc(v.x, v.y, r, v.spin * (1 + i * 0.2) + i, v.spin * (1 + i * 0.2) + i + Math.PI * 1.3);
        g.strokePath();
      }
      g.fillStyle(0x29366f, 0.7).fillCircle(v.x, v.y, 10);
    } else {
      for (let i = 0; i < 9; i++) {
        const y = v.y - i * 9;
        const w = 8 + i * 4.2;
        const off = Math.sin(v.spin + i * 0.7) * (3 + i);
        g.fillStyle(i % 2 ? 0x94b0c2 : 0xb8c4d0, 0.55).fillEllipse(v.x + off, y, w * 2, 7);
      }
      g.fillStyle(0x566c86, 0.3).fillEllipse(v.x, v.y + 2, 40, 10);
      if (Math.random() < dt * 20) s.fx.debris(v.x + Phaser.Math.Between(-20, 20), v.y - Phaser.Math.Between(0, 50), 0x8a5a35, 1);
    }
    // แรงดูด
    const reach = water ? 200 : 140;
    const pull = (water ? 70 : 90) + lvl * (water ? 8 : 10);
    const d = Phaser.Math.Distance.Between(p.x, p.feetY, v.x, v.y);
    if (d < reach && d > 4) {
      const k = (1 - d / reach) * pull;
      const ax = (v.x - p.x) / d;
      const ay = (v.y - p.feetY) / d;
      const b = s.riding;
      if (water) {
        if (b && b.kind === 'water') {
          // ดูดเข้า + หมุนวน
          b.vel.x += (ax * k * 2.2 - ay * k * 1.2) * dt;
          b.vel.y += (ay * k * 2.2 + ax * k * 1.2) * dt;
        }
      } else if (!inside && (!b || b.kind === 'land')) {
        p.body.velocity.x += ax * k;
        p.body.velocity.y += ay * k;
      } else if (!inside && b && b.kind === 'water') {
        b.vel.x += ax * k * 1.6 * dt;
        b.vel.y += ay * k * 1.6 * dt;
      }
    }
    // ของที่หล่นอยู่ลอยเข้าหา (ทอร์นาโด)
    if (!water) {
      for (const it of s.dropList()) {
        const dd = Phaser.Math.Distance.Between(it.x, it.y, v.x, v.y);
        if (dd < reach && dd > 6) {
          it.x += ((v.x - it.x) / dd) * 60 * dt;
          it.y += ((v.y - it.y) / dd) * 60 * dt;
        }
      }
    }
    // เรือที่จอดไว้ถูกดูด (วังน้ำวน)
    if (water) {
      for (const b of s.boatList()) {
        if (b === s.riding || b.kind !== 'water') continue;
        const dd = Phaser.Math.Distance.Between(b.x, b.y, v.x, v.y);
        if (dd < reach && dd > 8 && isWater(s.tileAt(Math.floor((b.x + ((v.x - b.x) / dd) * 4) / T), Math.floor((b.y + ((v.y - b.y) / dd) * 4) / T)))) {
          b.x += ((v.x - b.x) / dd) * 18 * dt;
          b.y += ((v.y - b.y) / dd) * 18 * dt;
        }
      }
    }
  }

  /** ดาเมจเป็นจังหวะ (ทุก 0.5 วิ) */
  private vortexTick(lvl: number) {
    const v = this.vortex;
    const h = this.current;
    if (!v || !h) return;
    const s = this.s;
    const p = s.player;
    const inside = !!s.shelter.inside;
    const d = Phaser.Math.Distance.Between(p.x, p.feetY, v.x, v.y);
    if (h.id === 'whirlpool') {
      const b = s.riding;
      if (b && b.kind === 'water' && d < 44) {
        s.damageBoat(3 + lvl * 1.5);
        this.tell('🌀 เรือติดวังน้ำวน! เร่งเครื่องแล่นออกด้านข้าง', '#73eff7');
      }
      for (const o of s.boatList()) if (o !== b && o.kind === 'water' && Phaser.Math.Distance.Between(o.x, o.y, v.x, v.y) < 40) s.damageVehicle(o, 2 + lvl);
      return;
    }
    if (d < 30 && !inside) {
      this.hurt((5 + lvl * 2) * 0.5, 'พายุทอร์นาโด');
      this.tell('🌪 โดนทอร์นาโดดูด! วิ่งออกด้านข้าง', '#94b0c2');
    }
    // พังสิ่งก่อสร้างตามทาง (นอกเขตบ้าน)
    for (const st of s.structureList()) {
      if (st.getData('foreign') || st.def.layer === 'floor' || Phaser.Math.Distance.Between(st.x, st.y - 4, v.x, v.y) > 30 || s.shelter.at(st.x, st.y - 4)) continue;
      s.damageStructure(st, (10 + lvl * 4) * IMPACT_MULT[materialOf(st.def)]);
    }
    // ถอนต้นไม้ → ไม้ปลิวตก
    for (const n of s.nodesNear(v.x, v.y, 26, (nd) => nd.available && nd.spec.harvest === 'tree')) {
      n.deplete(s.worldTime);
      s.spawnDrop(n.x + Phaser.Math.Between(-30, 30), n.baseY + Phaser.Math.Between(-20, 20), 'wood', 1);
    }
  }

  /** ปล่อยฝูงสัตว์จากขอบเกาะ (land) หรือชายฝั่ง (sea) รอบผู้เล่น */
  private spawnPack(ids: string[], n: number, from: 'land' | 'sea') {
    const s = this.s;
    const p = s.player;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * Math.PI * 2;
        const r = Phaser.Math.Between(180, 260);
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        const t = s.tileAt(Math.floor(x / T), Math.floor(y / T));
        const id = ids[i % ids.length];
        const water = isWater(t);
        if ((id === 'serpent') !== water && !(from === 'sea' && id !== 'serpent' && !water && tries > 10)) continue;
        if (s.isTileBlocked(Math.floor(x / T), Math.floor(y / T)) || s.shelter.at(x, y) || s.isSafeTile(Math.floor(x / T), Math.floor(y / T))) continue;
        const m = s.spawnMob(id, x, y);
        m.setData('hazard', true);
        s.fx.poof(x, y, 0x5d275d, 5);
        break;
      }
    }
  }
}
