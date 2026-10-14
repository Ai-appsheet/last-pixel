import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { BIOMES, type Biome } from '../data/islands';
import { MOBS } from '../data/mobs';
import type { GameScene } from '../scenes/GameScene';
import { TILE, isWater } from '../world/tiles';

/** สัตว์ไม่ดุ (หนี/สู้เมื่อโดนตี) — นับรวมในเพดานสัตว์ */
const isPassive = (id: string) => ['flee', 'neutral'].includes(MOBS[id]?.ai ?? '');
/** สัตว์ที่เกิดเฉพาะบนชายหาด (พื้นทราย) */
const BEACH = new Set(['hermit_crab']);
/** สัตว์ทะเลลึก (ตอนล่องเรือ) กลางวัน / กลางคืน */
const SEA_DAY = ['shark', 'manta', 'sea_turtle', 'jellyfish', 'octopus'];
const SEA_NIGHT = ['shark', 'jellyfish', 'electric_eel', 'octopus'];
/** น้ำตื้นใกล้ฝั่ง (ตอนเดินบนเกาะ) ตามไบโอม — [รายชื่อ, โอกาสต่อรอบ] */
const SHORE: Partial<Record<Biome, [string[], number]>> = {
  home: [['jellyfish'], 0.06],
  forest: [['piranha', 'jellyfish'], 0.12],
  jungle: [['piranha', 'piranha', 'jellyfish'], 0.16],
  desert: [['jellyfish'], 0.1],
  snow: [['jellyfish'], 0.06],
  ruins: [['piranha', 'jellyfish'], 0.1],
  special: [['jellyfish', 'piranha'], 0.12],
  swamp: [['piranha', 'piranha', 'electric_eel'], 0.18],
  mushroom: [['jellyfish'], 0.06],
  crystal: [['electric_eel', 'jellyfish'], 0.08],
  bamboo: [['piranha'], 0.06],
  savanna: [['piranha'], 0.06],
  glacier: [['jellyfish'], 0.05],
  atoll: [['sea_turtle', 'manta', 'jellyfish', 'octopus'], 0.16],
  haunted: [['piranha', 'electric_eel'], 0.1],
};
/** สัตว์ที่เกิดเป็นฝูงตามไบโอม (เช่น ฝูงควายป่าบนทุ่งสะวันนา) */
const HERD: Partial<Record<Biome, Record<string, number>>> = {
  savanna: { buffalo: 3, deer: 2 },
  bamboo: { deer: 2 },
  glacier: { penguin: 3 },
};
type Where = 'land' | 'deep' | 'shallow' | 'beach';

/** สัตว์ป่าและมอนสเตอร์ประจำเกาะ (นอกจอ) — ไม่เกิดบนเกาะกลาง และในเขตปลอดภัยรอบบ้านของเรา */
export class SpawnSystem {
  private timer = 1;

  constructor(private scene: GameScene) {}

  update(dt: number) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.5;
    const s = this.scene;
    const p = s.player;
    const counts: Record<string, number> = {};
    for (const m of s.mobList()) {
      if (!m.isBoss && !m.disaster && !m.getData('dungeon') && Phaser.Math.Distance.Between(m.x, m.y, p.x, p.y) > BALANCE.despawnDistance) {
        m.destroy();
        continue;
      }
      counts[m.def.id] = (counts[m.def.id] ?? 0) + 1;
    }
    const c = (id: string) => counts[id] ?? 0;
    const sum = (ids: string[]) => [...new Set(ids)].reduce((a, id) => a + c(id), 0);
    const slot = s.world.slots[s.currentSlot];
    // กลางทะเล (เฉพาะเมื่ออยู่เหนือน้ำจริง — ยานบินลอยเหนือเกาะยังเกิดมอนตามปกติ): งูทะเล + สัตว์ทะเลลึก
    if (s.boatRiding && isWater(s.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16)))) {
      const dark = s.dayNight.darkness > 0.3;
      if (c('serpent') < 1 && Math.random() < 0.12 && dark) this.trySpawn('serpent', 'deep', 140, 220);
      const sea = dark ? SEA_NIGHT : SEA_DAY;
      if (sum(sea) < 3 && Math.random() < 0.18) this.trySpawn(Phaser.Utils.Array.GetRandom(sea), 'deep', 140, 240);
      return;
    }
    if (!slot || slot.biome === 'central' || s.playerSafe) return;
    const biome = BIOMES[slot.biome];
    const night = s.dayNight.isNight;
    const wild = biome.wildlife.filter((id) => !MOBS[id]?.nightOnly || night);
    const passive = wild.filter(isPassive);
    if (passive.length && sum(passive) < BALANCE.passiveMobCap) {
      const id = Phaser.Utils.Array.GetRandom(passive);
      this.trySpawn(id, 'land', 190, 330, HERD[slot.biome]?.[id] ?? 1);
    }
    const hostileWild = wild.filter((id) => !isPassive(id));
    if (hostileWild.length && sum(hostileWild) < 3 && Math.random() < 0.25) this.trySpawn(Phaser.Utils.Array.GetRandom(hostileWild));
    // น้ำตื้นใกล้ฝั่ง: ปิรันย่ามาเป็นฝูง 3 ตัว · แมงกะพรุน
    const shore = SHORE[slot.biome];
    if (shore && sum(shore[0]) < 3 && Math.random() < shore[1]) {
      const id = Phaser.Utils.Array.GetRandom(shore[0]);
      this.trySpawn(id, 'shallow', 100, 220, id === 'piranha' ? 3 : 1);
    }
    if (night) {
      const ambient = biome.nightMobs;
      if (ambient.reduce((a, id) => a + c(id), 0) < Math.ceil((s.inGrace ? 1 : 2) * biome.danger)) this.trySpawn(Phaser.Utils.Array.GetRandom(ambient), 'land', 160, 240);
      if (p.sanity < 30 && c('shade') < 3) this.trySpawn('shade', 'land', 90, 160);
    }
  }

  /** where: land = บก · deep = ทะเลลึก · shallow = น้ำตื้น · (สัตว์ชายหาดเลือกพื้นทรายเอง) · group = จำนวนตัวในฝูง */
  trySpawn(mobId: string, where: Where = 'land', minDist = 190, maxDist = 330, group = 1) {
    const s = this.scene;
    const p = s.player;
    if (where === 'land' && BEACH.has(mobId)) where = 'beach';
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Phaser.Math.FloatBetween(minDist, maxDist);
      const tx = Math.floor((p.x + Math.cos(a) * d) / 16);
      const ty = Math.floor((p.y + Math.sin(a) * d) / 16);
      const t = s.tileAt(tx, ty);
      if (where === 'deep' ? t !== TILE.DEEP : where === 'shallow' ? t !== TILE.SHALLOW : where === 'beach' ? t !== TILE.SAND || s.isTileBlocked(tx, ty) : isWater(t) || s.isTileBlocked(tx, ty)) continue;
      if (s.isSafeTile(tx, ty)) continue;
      if (s.shelter.at(tx * 16 + 8, ty * 16 + 8)) continue; // เขตปลอดภัยรอบบ้าน: มอนไม่เกิดเอง
      for (let k = 0; k < group; k++) s.spawnMob(mobId, tx * 16 + 8 + (k ? Phaser.Math.Between(-10, 10) : 0), ty * 16 + 8 + (k ? Phaser.Math.Between(-6, 6) : 0));
      return;
    }
  }
}
