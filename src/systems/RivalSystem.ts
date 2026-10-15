import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import { localPlayerId } from '../core/RoomService';
import { SPECIAL_SLOT } from '../core/SpecialIsland';
import { BIOMES } from '../data/islands';
import { ITEMS } from '../data/items';
import { RARITY, type BoxTier } from '../data/loot';
import type { MobDef } from '../data/mobs';
import { RIVAL, RIVAL_DROPS, RIVAL_LOOT, RIVAL_NAMES_TH, RIVAL_WEAPONS, rivalLevel, rivalStats, rivalTier, type RivalInfo } from '../data/rivals';
import { Mob } from '../entities/Mob';
import { GearAura, rivalAura } from '../fx/GearAura';
import { CAPES, CLASS_LOOKS, HELMETS, OUTFITS, buildHeroTexture, heroKey, type HeroLook } from '../gfx/art/heroes';
import { txt } from '../ui/widgets';
import { isWater } from '../world/tiles';
import type { GameScene } from '../scenes/GameScene';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
const between = (r: [number, number]) => r[0] + Math.random() * (r[1] - r[0]);
/** ของที่ "เก็บเกี่ยว" ตอนเดินเล่น (แค่ท่าทาง — ไม่ได้เอา node ไปจริง) */
const GATHER = new Set(['tree', 'rock', 'bush', 'ore_iron', 'ore_coal', 'bamboo', 'cactus', 'grass']);

/**
 * ผู้รอดชีวิตคู่แข่ง 1 คน — ใช้ Mob เดิมทั้งหมด (โดนตี/สถานะ/ดาเมจ/ดรอปเหมือนมอน) + ป้ายชื่อ หลบ/ป้องกัน หนีตอน HP ต่ำ เดินเก็บของ
 */
export class Rival extends Mob {
  readonly info: RivalInfo;
  /** ผู้เล่นอยู่ในเขตผจญภัยบนเกาะเดียวกัน (RivalSystem ตั้งทุก 0.5 วิ) */
  engaged = false;
  private provoked = 0;
  private tag: Phaser.GameObjects.Text;
  private dashT = 0;
  private dashDir = new Phaser.Math.Vector2();
  private gatherAt: { x: number; y: number; color: number } | null = null;
  private gatherT = 0;
  private gatherCd = Phaser.Math.FloatBetween(3, 8);
  private fxT = 0;

  constructor(scene: GameScene, x: number, y: number, def: MobDef, info: RivalInfo) {
    super(scene, x, y, def);
    this.info = info;
    new GearAura(scene, this, () => rivalAura(info), { fx: scene.fx }); // ออร่าตามอาวุธคู่แข่ง
    this.setData('rival', true);
    this.tag = txt(scene, x, y, `${info.ranged ? '🏹' : '⚔'} ${info.name} Lv.${info.level}`, 6, '#ef7d57', { fontStyle: '600' })
      .setOrigin(0.5, 1).setStroke('#0b0d1f', 2).setShadow(0, 1, '#0b0d1f', 0, true, true).setResolution(4).setDepth(1e6 - 2);
  }

  update(dt: number) {
    const s = this.scene;
    const p = s.player;
    this.provoked = Math.max(0, this.provoked - dt);
    const fight = this.engaged || this.provoked > 0;
    const dist = Phaser.Math.Distance.Between(this.x, this.feetY, p.x, p.feetY);
    // ขี้กลัว: HP ต่ำ → หนี (ฟื้นช้าๆ ระหว่างหนี) → หายแล้วกลับมาสู้
    if (this.info.coward) {
      if (!this.fleeing && fight && this.hp < this.def.hp * RIVAL.fleeAt) {
        this.fleeing = true;
        this.say('หนีก่อน!', '#ffcd75');
      } else if (this.fleeing && (this.hp > this.def.hp * RIVAL.fleeUntil || !fight)) this.fleeing = false;
      if (this.fleeing && dist > 110) this.hp = Math.min(this.def.hp, this.hp + this.def.hp * RIVAL.fleeRegen * dt);
    }
    if (!this.fleeing && this.state === 'flee') this.state = 'idle';
    this.calm = !fight;
    if (this.calm && this.state === 'chase') this.state = 'idle';
    super.update(dt);
    if (!this.active) return;
    const free = this.stunTime <= 0 && this.frozenTime <= 0;
    if (this.dashT > 0) {
      this.dashT -= dt;
      if (free) this.body.setVelocity(this.dashDir.x * 170, this.dashDir.y * 170);
    } else if (free && fight && this.info.ranged && this.state === 'chase' && dist < 64) {
      // นักธนู: ถอยรักษาระยะ
      const v = new Phaser.Math.Vector2(this.x - p.x, this.feetY - p.feetY).normalize().scale(this.def.speed * 0.8);
      this.body.setVelocity(v.x, v.y);
      this.animate(v.x, v.y);
    } else if (free && (this.state === 'idle' || this.state === 'wander')) this.gather(dt);
    this.tag.setPosition(this.x, this.y - this.displayHeight / 2 - 1);
  }

  /** เดินไปเก็บไม้/หิน/ผลไม้ใกล้ๆ (ท่าทางเหมือนผู้เล่นจริง) */
  private gather(dt: number) {
    const s = this.scene;
    if (this.gatherAt) {
      this.gatherT -= dt;
      const g = this.gatherAt;
      const d = Phaser.Math.Distance.Between(this.x, this.feetY, g.x, g.y);
      if (d > 14) {
        const v = new Phaser.Math.Vector2(g.x - this.x, g.y - this.feetY).normalize().scale(this.def.speed * 0.5);
        this.body.setVelocity(v.x, v.y);
        this.animate(v.x, v.y);
      } else {
        this.body.setVelocity(0, 0);
        this.animate(0, 0);
        this.setFlipX(g.x < this.x);
        this.fxT -= dt;
        if (this.fxT <= 0) {
          this.fxT = 0.55;
          s.fx.debris(g.x, g.y - 4, g.color, 3);
        }
      }
      if (this.gatherT <= 0) this.gatherAt = null;
      return;
    }
    this.gatherCd -= dt;
    if (this.gatherCd > 0) return;
    this.gatherCd = Phaser.Math.FloatBetween(6, 14);
    const n = s.nearestNodeFar(this.x, this.feetY, 150, (r) => r.available && GATHER.has(r.kind));
    if (n) {
      this.gatherAt = { x: n.x, y: n.baseY, color: n.kind === 'tree' || n.kind === 'bamboo' ? 0x8a5a35 : n.kind === 'bush' || n.kind === 'grass' ? 0xa7f070 : 0x94b0c2 };
      this.gatherT = Phaser.Math.FloatBetween(3, 6);
    }
  }

  /** โดนตี: ลุ้นหลบ (ไม่โดน) / ป้องกัน (ลดดาเมจ) — ดาเมจต่อเนื่อง (silent) ไม่ลุ้น */
  hurt(amount: number, from?: { x: number; y: number }, opts: { silent?: boolean; crit?: boolean; knock?: number; armorPierce?: number; color?: number } = {}) {
    if (this.active && !opts.silent && amount > 0) {
      this.provoked = RIVAL.provoke;
      this.gatherAt = null;
      const r = Math.random();
      if (r < RIVAL.dodge && this.dashT <= 0 && this.stunTime <= 0 && this.frozenTime <= 0) {
        const src = from ?? this.scene.player;
        const away = new Phaser.Math.Vector2(this.x - src.x, this.y - src.y).normalize();
        this.dashDir.set(-away.y, away.x).scale(Math.random() < 0.5 ? 1 : -1).add(away.scale(0.4)).normalize();
        this.dashT = 0.22;
        this.say('หลบ!', '#73eff7');
        this.scene.fx.poof(this.x, this.feetY, 0xd6e4ee, 4);
        return;
      }
      if (r < RIVAL.dodge + RIVAL.block) {
        amount *= RIVAL.blockMult;
        this.scene.fx.ring(this.x, this.y, 0x94b0c2, 9);
        this.say('🛡', '#d6e4ee');
      }
    }
    super.hurt(amount, from, opts);
  }

  /** ข้อความลอยเหนือหัว */
  private say(text: string, color: string) {
    const s = this.scene;
    const t = txt(s, this.x, this.y - this.displayHeight / 2 - 8, text, 6, color, { fontStyle: '600' }).setOrigin(0.5, 1).setStroke('#0b0d1f', 2).setShadow(0, 1, '#0b0d1f', 0, true, true).setResolution(4).setDepth(1e6 - 1);
    s.tweens.add({ targets: t, y: t.y - 10, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  destroy(fromScene?: boolean) {
    this.tag?.destroy();
    super.destroy(fromScene);
  }
}

/**
 * ผู้รอดชีวิตคู่แข่ง (PvP) บนเกาะผจญภัย — **บอทแทนผู้เล่นคนอื่น** เพราะยังไม่มีเซิร์ฟเวอร์จริง
 *  - เกิดเฉพาะบนเกาะผจญภัยที่ผู้เล่นยืนอยู่ (ไม่ใช่เกาะเรา/เกาะกลาง) · เกาะละ 2–3 คน · ไม่เกิดช่วงตั้งหลัก · ไม่ออกนอกเกาะ
 *  - ชื่อจากผู้เล่นในห้อง (RoomService) — เจ้าของเกาะมาก่อน · ไม่พอใช้ชื่อไทยสุ่ม
 *  - ตอนผู้เล่นไม่อยู่ในเขตผจญภัยของเกาะนั้น (เช่น ขึ้นเรือ) = เดินเล่น/เก็บของ ไม่ไล่ตาม
 *  - ทดสอบ: `?rivals` = เกิดทันที (ข้ามช่วงตั้งหลัก)
 *
 * เปลี่ยนเป็นผู้เล่นออนไลน์จริงภายหลัง: ให้เซิร์ฟเวอร์ส่ง RivalInfo + ตำแหน่งมา แล้วเรียก spawn(info, x, y) / ย้ายตำแหน่ง
 * ส่วนการตายส่ง 'rival:killed' ไปเซิร์ฟเวอร์ — API ที่เหลือ (update/onKilled) ไม่ต้องเปลี่ยน
 */
export class RivalSystem {
  private list: Rival[] = [];
  /** ช่องเกาะ → worldTime ที่เกิดตัวถัดไปได้ */
  private next = new Map<number, number>();
  private timer = 1;
  private seq = 0;
  private readonly force: boolean;

  constructor(private s: GameScene) {
    this.force = typeof location !== 'undefined' && new URLSearchParams(location.search).has('rivals');
  }

  /** คู่แข่งที่อยู่ในโลกตอนนี้ */
  get active(): Rival[] {
    return this.list.filter((r) => r.active);
  }

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.5;
    const s = this.s;
    const p = s.player;
    const here = s.inAdventure ? s.world.slotIndexAt(Math.floor(p.x / 16), Math.floor(p.y / 16)) : -1;
    for (const r of this.list) {
      if (!r.active) continue;
      r.engaged = here === r.info.slot && !p.dead;
      // หลุดออกนอกเกาะของตัวเอง หรือผู้เล่นไปไกลมาก → หายไป (ไม่นับว่าตาย)
      const slot = s.world.slotIndexAt(Math.floor(r.x / 16), Math.floor(r.y / 16));
      if (slot !== r.info.slot || !s.isAdventureSlot(slot) || Phaser.Math.Distance.Between(r.x, r.y, p.x, p.y) > 900) r.destroy();
    }
    this.list = this.list.filter((r) => r.active);
    if (here < 0 || p.dead || (s.inGrace && !this.force)) return;
    if (here === SPECIAL_SLOT && !s.special.open) return;
    const is = s.world.slots[here];
    if (!is) return;
    const t = s.worldTime;
    if (!this.next.has(here)) this.next.set(here, t + (this.force ? 2 : between(RIVAL.firstDelay)));
    const alive = this.list.filter((r) => r.info.slot === here).length;
    const max = RIVAL.maxPerIsland(BIOMES[is.biome].danger);
    if (alive >= max || t < this.next.get(here)!) return;
    // ล้มแล้วไม่เกิดใหม่จนถึงรอบชั่วโมงหน้า (RespawnSystem) — เกาะละ max คนต่อชั่วโมง
    if (!s.mobRespawn.canSpawn(here, 'rival', max)) return;
    const pos = this.spawnPoint(here);
    if (!pos) return;
    s.mobRespawn.tag(this.spawn(this.makeInfo(here), pos.x, pos.y), here, 'rival');
    this.next.set(here, t + between(RIVAL.stagger));
  }

  /** สร้างคู่แข่ง 1 คนจากข้อมูล (บอทหรือผู้เล่นจริงในอนาคต) */
  spawn(info: RivalInfo, x: number, y: number): Rival {
    const s = this.s;
    const st = rivalStats(info.level, info.tier, info.ranged);
    const key = buildHeroTexture(s, heroKey(info.look), info.look);
    const def: MobDef = {
      id: `rival_${info.id}`, name: info.name, texture: key, hp: st.hp, attack: st.attack, speed: RIVAL.speed, ai: 'hunter', aggroRange: RIVAL.aggro,
      body: { w: 8, h: 5 }, armor: st.armor, xp: st.xp,
      drops: info.ranged ? [...RIVAL_DROPS, { item: 'arrow', qty: [4, 10], chance: 0.5 }] : RIVAL_DROPS,
      shoot: info.ranged ? { projectile: 'arrow', damage: st.shot, speed: 190, cooldown: 1.7, range: 130 } : undefined,
      habitat: 'ผู้รอดชีวิตคู่แข่งในเขตผจญภัย (PvP)',
    };
    const r = s.spawnMob(def.id, x, y, (xx, yy) => new Rival(s, xx, yy, def, info)) as Rival;
    s.fx.poof(x, y, 0xef7d57, 6);
    this.list.push(r);
    return r;
  }

  /** ล้มคู่แข่ง (GameScene.onMobKilled เรียก — วัตถุดิบดรอปจาก def.drops แล้ว) → ถุงของ: เหรียญ + กล่อง + อาวุธ */
  onKilled(mob: Mob) {
    const r = mob as Rival;
    const info = r.info;
    if (!info) return;
    const s = this.s;
    const [c0, c1] = RIVAL_LOOT.coins(info.level);
    s.spawnDrop(r.x, r.y + 4, 'coin', Phaser.Math.Between(c0, c1));
    let box: BoxTier | null = null;
    if (Math.random() < RIVAL_LOOT.boxChance) {
      let k = Math.random();
      for (const [tier, p] of Object.entries(RIVAL_LOOT.box) as [BoxTier, number][]) if ((k -= p) < 0) {
        box = tier;
        break;
      }
      box = s.capBox(box ?? 'box_iron', 'rival', r.x, r.y);
      s.spawnDrop(r.x, r.y + 2, box, 1);
      s.fx.sparks(r.x, r.y, RARITY[ITEMS[box].rarity ?? 'common'].hex, 12, 18);
    }
    const weapon = Math.random() < RIVAL_LOOT.weaponChance && ITEMS[info.weapon] ? info.weapon : null;
    if (weapon) s.spawnDrop(r.x + 6, r.y + 2, weapon, 1);
    s.fx.poof(r.x, r.y, 0xc9a46a, 10);
    Sfx.play('pickup');
    EventBus.emit('toast', `💰 ล้ม ${info.name} (Lv.${info.level}) ได้ถุงของ${box ? ` + ${ITEMS[box].name}` : ''}${weapon ? ` + ${ITEMS[weapon].name}` : ''}`, '#ffcd75');
    this.next.set(info.slot, Math.max(this.next.get(info.slot) ?? 0, s.worldTime + between(RIVAL.respawn)));
    EventBus.emit('rival:killed', info);
  }

  /** สุ่มข้อมูลบอท: ชื่อจากห้อง · เลเวล/อาวุธตามวันและความอันตรายของเกาะ */
  private makeInfo(slot: number): RivalInfo {
    const s = this.s;
    const is = s.world.slots[slot]!;
    const danger = BIOMES[is.biome].danger;
    const day = s.dayNight.day;
    const used = new Set(this.list.filter((r) => r.active).map((r) => r.info.name));
    const me = localPlayerId();
    const room = s.room.players.filter((pl) => pl.id !== me && pl.name && !used.has(pl.name));
    // ออนไลน์: ใช้ชื่อผู้เล่นจริงจากเซิร์ฟเวอร์ก่อนชื่อบอท
    const real = room.filter((pl) => pl.real);
    const owner = is.owner && is.owner !== me && !used.has(is.ownerName) ? is.ownerName : null;
    const ownerReal = !!owner && room.some((pl) => pl.id === is.owner && pl.real);
    const name = (ownerReal ? owner : null) ?? (real.length ? pick(real).name : null) ?? owner ?? (room.length ? pick(room).name : null) ?? pick(RIVAL_NAMES_TH.filter((n) => !used.has(n)).concat(['ผู้รอดชีวิต']));
    const tier = rivalTier(day, danger);
    const ranged = Math.random() < RIVAL.rangedChance;
    return {
      id: `${slot}_${++this.seq}`, name, level: rivalLevel(day, danger, Math.random()), tier,
      weapon: (ranged ? RIVAL_WEAPONS.ranged : RIVAL_WEAPONS.melee)[tier], ranged, slot, coward: Math.random() < RIVAL.cowardChance, look: randomLook(),
    };
  }

  /** จุดเกิดบนบกของเกาะนั้น ห่างผู้เล่น 220–420 px (เดินเข้ามาหา ไม่โผล่ต่อหน้า) */
  private spawnPoint(slot: number): { x: number; y: number } | null {
    const s = this.s;
    const is = s.world.slots[slot]!;
    const p = s.player;
    let fallback: { x: number; y: number } | null = null;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * is.r * 0.85;
      const tx = Math.round(is.cx + Math.cos(a) * rr);
      const ty = Math.round(is.cy + Math.sin(a) * rr);
      if (isWater(s.tileAt(tx, ty)) || s.world.islandAt(tx, ty) !== slot || s.isTileBlocked(tx, ty) || s.structureAt(tx, ty, 'object')) continue;
      const x = tx * 16 + 8;
      const y = ty * 16 + 8;
      const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
      if (d >= 220 && d <= 420) return { x, y };
      if (d >= 200 && !fallback) fallback = { x, y };
    }
    return fallback;
  }
}

/** หน้าตาสุ่มแบบผู้เล่น: ตัวละคร 1 ใน 7 + ชุด/หมวก/ผ้าคลุมสุ่ม */
function randomLook(): HeroLook {
  const base = { ...pick(Object.values(CLASS_LOOKS)) };
  if (Math.random() < 0.7) base.outfit = pick(OUTFITS).id;
  if (Math.random() < 0.5) base.helmet = pick(HELMETS).id;
  if (Math.random() < 0.35) base.cape = pick(CAPES).id;
  return base;
}
