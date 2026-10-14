import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { hash2 } from '../gfx/art/terrain';
import type { GameScene } from '../scenes/GameScene';
import { TILE, isWater } from '../world/tiles';
import type { LightSource } from './LightingSystem';

/** ผิวจอทับโลก (หมอก/ทราย/หิมะ/ฝนกรด) — ใช้ร่วมกับ HazardSystem */
export class ScreenTint {
  private img: Phaser.GameObjects.Image;
  private a = 0;

  constructor(private s: Phaser.Scene, depth = 1e6 + 1) {
    this.img = s.add.image(0, 0, 'px').setDepth(depth).setVisible(false);
  }

  /** ค่อยๆ เข้าหา alpha เป้าหมาย */
  update(dt: number, color: number, target: number) {
    this.a += (target - this.a) * Math.min(1, dt * 1.5);
    if (this.a < 0.01) {
      this.img.setVisible(false);
      return;
    }
    const v = this.s.cameras.main.worldView;
    this.img.setVisible(true).setPosition(v.centerX, v.centerY).setDisplaySize(v.width + 64, v.height + 64).setTint(color).setAlpha(this.a);
  }

  destroy() {
    this.img.destroy();
  }
}

/** ภาพหมอกนุ่ม (วงกลมขาวไล่จาง) สำหรับหมอกพิษ/สปอร์/หมอกผี */
export function ensurePuff(scene: Phaser.Scene) {
  if (scene.textures.exists('puff')) return 'puff';
  const t = scene.textures.createCanvas('puff', 64, 64)!;
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  t.refresh();
  return 'puff';
}

interface Mist {
  x: number;
  y: number;
  r: number;
  imgs: Phaser.GameObjects.Image[];
}

interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
}

const MIST_CELL = 12; // tile

/**
 * ลักษณะพิเศษของไบโอมชุดใหม่ (เฉพาะตอนเดินบนเกาะ ไม่อยู่บนยาน/ในดันเจี้ยน)
 * - หนองน้ำ: โคลน (TILE.DIRT) เดินช้า ×0.62 · หมอกพิษเป็นหย่อมๆ (ติดพิษอ่อนๆ — ในเขตบ้านไม่โดน)
 * - เกาะเห็ดยักษ์: สปอร์ทำสติลด 0.35/วิ (ถือคบเพลิง/ใกล้ไฟ/ในบ้าน = ไม่ลด) · เห็ดเรืองแสง/ผลึกส่องแสงยามค่ำ
 * - ธารน้ำแข็ง: พื้นน้ำแข็ง (TILE.ASH) ลื่นไถล
 * - เกาะหมอกผี: หมอกหนาทั้งวัน (มืดลง + ทัศนวิสัยต่ำ)
 * - ป่าไผ่ซากุระ: กลีบซากุระปลิว · เกาะคริสตัล: ประกายผลึก
 * วางพื้น (ไม้/อิฐที่สร้างเอง) ทับแล้วไม่มีผลโคลน/น้ำแข็ง
 */
export class BiomeSystem {
  /** ตัวคูณความเร็วจากพื้น */
  speedMult = 1;
  /** ความมืดเพิ่ม (หมอกผี) */
  darkness = 0;
  private fog: ScreenTint;
  private mists = new Map<string, Mist>();
  private motes: Mote[] = [];
  private poisonCd = 0;
  private sparkleCd = 0;
  private told = new Set<string>();
  private biome = '';

  constructor(private s: GameScene) {
    ensurePuff(s);
    this.fog = new ScreenTint(s, 1e6 + 1);
  }

  /** ไบโอมของช่องที่พิกัดนี้อยู่ (รวมน้ำรอบเกาะ) */
  biomeAt(x: number, y: number): string | undefined {
    const w = this.s.world;
    return w.slots[w.slotIndexAt(Math.floor(x / 16), Math.floor(y / 16))]?.biome;
  }

  update(dt: number) {
    const s = this.s;
    const p = s.player;
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.feetY / 16);
    const biome = this.biomeAt(p.x, p.feetY) ?? '';
    this.biome = biome;
    const onFoot = !s.riding && s.interiors.current === null && !p.dead;
    const tile = s.tileAt(tx, ty);
    const floored = !!s.structureAt(tx, ty, 'floor');
    const inHouse = !!s.shelter.inside;

    // ---------- พื้น: โคลน / น้ำแข็ง ----------
    const mud = onFoot && biome === 'swamp' && tile === TILE.DIRT && !floored;
    const ice = onFoot && biome === 'glacier' && tile === TILE.ASH && !floored;
    this.speedMult = mud ? 0.62 : 1;
    p.slippery = ice;
    if (mud) this.tell('mud', '🟫 โคลนหนืด — เดินช้าลง (วางพื้นไม้ทับได้)', '#c28a50');
    if (ice) this.tell('ice', '🧊 พื้นน้ำแข็งลื่น! ระวังไถลตกน้ำ', '#bfe8ff');

    // ---------- หมอกพิษหนองน้ำ ----------
    this.updateMists(dt, onFoot && !inHouse);

    // ---------- สปอร์เห็ด ----------
    const spores = biome === 'mushroom' && onFoot;
    if (spores && !inHouse) {
      const nearFire = p.holdingTorch || s.fireSources().some((f) => Phaser.Math.Distance.Between(p.x, p.y, f.x, f.y) < 90);
      if (!nearFire) {
        p.sanity = Math.max(0, p.sanity - 0.35 * dt);
        this.tell('spore', '🍄 สปอร์เห็ดลอยฟุ้ง — สติลดลงช้าๆ (ถือคบเพลิง/อยู่ใกล้ไฟ/กินเห็ดเรืองแสงช่วยได้)', '#c9a6ff');
      }
    }
    if (biome === 'haunted' && onFoot) this.tell('haunt', '👻 หมอกผีหนาทึบ… ระวังวิญญาณที่ซ่อนอยู่ในหมอก', '#9aa4c0');

    // ---------- อนุภาคบรรยากาศ ----------
    const view = s.cameras.main.worldView;
    const want = spores ? 26 : biome === 'bamboo' ? 18 : biome === 'haunted' ? 10 : 0;
    if (this.motes.length < want && Math.random() < dt * 20) this.motes.push(this.mote(biome, view));
    this.motes = this.motes.filter((m) => {
      m.life -= dt;
      m.img.x += m.vx * dt;
      m.img.y += m.vy * dt;
      if (m.life <= 0 || this.motes.length > want + 6) {
        m.img.destroy();
        return false;
      }
      m.img.setAlpha(Math.min(m.img.alpha, m.life));
      return true;
    });

    // ประกายผลึกคริสตัล
    this.sparkleCd -= dt;
    if (biome === 'crystal' && this.sparkleCd <= 0) {
      this.sparkleCd = 0.35;
      const list = s.nodesNear(p.x, p.y, 220, (n) => n.available && n.kind === 'crystal');
      const n = list[Math.floor(Math.random() * list.length)];
      if (n) s.fx.sparks(n.x + Phaser.Math.Between(-5, 5), n.baseY - Phaser.Math.Between(6, 16), 0xe0d0ff, 2, 8);
    }

    // ---------- หมอกผี ----------
    const haunted = biome === 'haunted' && s.interiors.current === null;
    this.darkness = haunted ? (inHouse ? 0.12 : 0.24) : 0;
    this.fog.update(dt, 0xa8b0c8, haunted ? (inHouse ? 0.12 : 0.26) : 0);
  }

  /** แสงจากเห็ดเรืองแสง/ผลึกคริสตัลรอบตัว (ตอนมืด) */
  lights(): LightSource[] {
    const s = this.s;
    if (s.dayNight.darkness < 0.15 && this.darkness <= 0) return [];
    if (!['mushroom', 'swamp', 'crystal', 'haunted'].includes(this.biome)) return [];
    const p = s.player;
    const out: LightSource[] = [];
    for (const n of s.nodesNear(p.x, p.y, 420, (nd) => nd.available && /^(shroom_|mushtree_1|crystal_1)/.test(nd.info.tex))) {
      out.push({ x: n.x, y: n.baseY - 10, radius: n.info.tex.startsWith('mushtree') ? 44 : 26 });
      if (out.length >= 24) break;
    }
    return out;
  }

  private tell(key: string, text: string, color: string) {
    if (this.told.has(key)) return;
    this.told.add(key);
    EventBus.emit('toast', text, color);
  }

  private mote(biome: string, view: Phaser.Geom.Rectangle): Mote {
    const s = this.s;
    const x = view.x + Math.random() * view.width;
    const y = view.y + Math.random() * view.height;
    const img = s.add.image(x, y, 'px').setDepth(1e6 + 2);
    if (biome === 'bamboo') {
      img.setTint(Math.random() < 0.5 ? 0xffb3c6 : 0xffd3dd).setScale(0.8).setAlpha(0.9);
      return { img, vx: Phaser.Math.Between(8, 22), vy: Phaser.Math.Between(10, 20), life: Phaser.Math.FloatBetween(3, 6) };
    }
    if (biome === 'haunted') {
      img.setTexture('puff').setTint(0xc8d0e8).setScale(Phaser.Math.FloatBetween(1.5, 3)).setAlpha(0.18);
      return { img, vx: Phaser.Math.Between(-10, 10), vy: Phaser.Math.Between(-4, 4), life: Phaser.Math.FloatBetween(5, 9) };
    }
    img.setTint(Math.random() < 0.6 ? 0xc9a6ff : 0x73eff7).setScale(0.6).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
    return { img, vx: Phaser.Math.Between(-6, 6), vy: Phaser.Math.Between(-14, -5), life: Phaser.Math.FloatBetween(2.5, 5) };
  }

  /** หย่อมหมอกพิษ (คงที่ตาม seed) ในเกาะหนองน้ำรอบกล้อง */
  private updateMists(dt: number, canHurt: boolean) {
    const s = this.s;
    const w = s.world;
    const view = s.cameras.main.worldView;
    const C = MIST_CELL * 16;
    const want = new Set<string>();
    if (s.interiors.current === null) {
      for (let cy = Math.floor((view.y - 64) / C); cy <= Math.floor((view.bottom + 64) / C); cy++) {
        for (let cx = Math.floor((view.x - 64) / C); cx <= Math.floor((view.right + 64) / C); cx++) {
          if (hash2(cx, cy, w.seed % 9973) > 0.24) continue;
          const x = (cx + 0.2 + hash2(cx, cy, 7) * 0.6) * C;
          const y = (cy + 0.2 + hash2(cx, cy, 11) * 0.6) * C;
          if (this.biomeAt(x, y) !== 'swamp' || isWater(s.tileAt(Math.floor(x / 16), Math.floor(y / 16)))) continue;
          if (s.shelter.at(x, y)) continue; // เขตบ้านปลอดภัยไม่มีหมอก
          const key = `${cx},${cy}`;
          want.add(key);
          if (!this.mists.has(key)) this.mists.set(key, this.makeMist(x, y, 30 + hash2(cx, cy, 3) * 16));
        }
      }
    }
    for (const [k, m] of this.mists) {
      if (want.has(k)) continue;
      m.imgs.forEach((i) => i.destroy());
      this.mists.delete(k);
    }
    const t = s.worldTime;
    const p = s.player;
    this.poisonCd -= dt;
    for (const m of this.mists.values()) {
      m.imgs.forEach((img, i) => {
        img.x = m.x + Math.sin(t * 0.6 + i * 2.1) * m.r * 0.35;
        img.y = m.y + Math.cos(t * 0.5 + i * 1.7) * m.r * 0.2;
      });
      if (canHurt && this.poisonCd <= 0 && Phaser.Math.Distance.Between(p.x, p.feetY, m.x, m.y) < m.r) {
        this.poisonCd = 0.6;
        s.creatures.afflict({ kind: 'poison', dur: 2, power: 2 }, 'หมอกพิษหนองน้ำ');
        this.tell('mist', '🟢 หมอกพิษ! เดินออกจากหมอกสีเขียว', '#a7f070');
      }
    }
  }

  private makeMist(x: number, y: number, r: number): Mist {
    const imgs: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < 4; i++) {
      imgs.push(this.s.add.image(x, y, 'puff').setTint(i % 2 ? 0x7fd04a : 0xa7f070).setAlpha(0.28).setScale((r / 32) * (0.9 + i * 0.12)).setDepth(y + 20));
    }
    return { x, y, r, imgs };
  }
}
