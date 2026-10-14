import Phaser from 'phaser';
import { BUILD, type BuildDef } from '../data/buildables';
import { ITEMS } from '../data/items';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { TILE, isWater } from '../world/tiles';
import { vehicleKind } from '../data/vehicles';
import { isInterior } from '../world/Interiors';
import type { GameScene } from '../scenes/GameScene';
import type { UpTarget } from './UpgradeSystem';
import { consume, missingRaw, rawCostOfBuild } from './CraftingSystem';

/**
 * โหมดสร้าง (B): เลือกชิ้นจากแคตตาล็อก → เงาพรีวิวตามตำแหน่งเมาส์ (เขียว = วางได้)
 * โหมดรื้อ (X): คลิกสิ่งก่อสร้างเพื่อรื้อ ได้วัสดุคืนครึ่งหนึ่ง
 * โหมดอัพเกรด (U): ชี้สิ่งก่อสร้าง/ยาน → การ์ดค่าอัพ · คลิก = เลเวล +1 ทันที (เปลี่ยนโฉม + ค่าสถานะ)
 */
export class BuildSystem {
  active: BuildDef | null = null;
  demolish = false;
  /** โหมดอัพเกรด */
  upgrade = false;
  /** ของที่ชี้อยู่ในโหมดอัพเกรด (การ์ดข้อมูลอ่านค่านี้) */
  upgradeTarget: UpTarget | null = null;
  private ghost: Phaser.GameObjects.Image;
  private marker: Phaser.GameObjects.Rectangle;

  constructor(private scene: GameScene) {
    this.ghost = scene.add.image(0, 0, 'px').setOrigin(0.5, 1).setAlpha(0.65).setVisible(false).setDepth(2e5);
    this.marker = scene.add.rectangle(0, 0, 16, 16).setStrokeStyle(1, 0xffffff, 0.9).setOrigin(0).setVisible(false).setDepth(2e5);
  }

  get on() {
    return !!this.active || this.demolish || this.upgrade;
  }

  select(id: string | null) {
    this.active = id ? BUILD[id] : null;
    this.demolish = false;
    this.upgrade = false;
  }

  toggleDemolish() {
    this.demolish = !this.demolish;
    this.active = null;
    this.upgrade = false;
  }

  toggleUpgrade() {
    this.upgrade = !this.upgrade;
    this.active = null;
    this.demolish = false;
    this.upgradeTarget = null;
    if (this.upgrade) EventBus.emit('toast', this.scene.controls.touchMode ? '⬆ โหมดอัพเกรด: เดินไปข้างของแล้วแตะปุ่มหลัก · แตะ ⬆ อีกครั้ง = ออก' : '⬆ โหมดอัพเกรด: ชี้สิ่งก่อสร้าง/ยานเพื่อดูค่าอัพ · คลิก = อัพเกรด · U/คลิกขวา = ออก', '#ffcd75');
  }

  /** อัพเกรดของที่ชี้ */
  upgradeAt(wx: number, wy: number) {
    const t = this.scene.upgrades.targetAt(wx, wy);
    if (!t) {
      EventBus.emit('toast', 'ชี้ที่สิ่งก่อสร้างหรือยานพาหนะของคุณ', '#94b0c2');
      return;
    }
    this.scene.upgrades.upgradeBuild(t);
  }

  cancel() {
    this.active = null;
    this.demolish = false;
    this.upgrade = false;
    this.upgradeTarget = null;
    this.ghost.setVisible(false);
    this.marker.setVisible(false);
  }

  /** ตำแหน่ง tile ซ้ายบนของฐาน จากจุดที่ชี้ */
  anchor(wx: number, wy: number, def: BuildDef) {
    return { tx: Math.floor(wx / 16 - def.w / 2 + 0.5), ty: Math.floor(wy / 16 - def.h / 2 + 0.5) };
  }

  /** ตรวจว่าวางได้ไหม — คืนข้อความเหตุผล หรือ null */
  check(def: BuildDef, tx: number, ty: number): string | null {
    const s = this.scene;
    const p = s.player;
    const cx = (tx + def.w / 2) * 16;
    const cy = (ty + def.h / 2) * 16;
    if (Phaser.Math.Distance.Between(p.x, p.feetY, cx, cy) > 72 + def.w * 8) return 'ไกลเกินไป';
    if (!s.creative) {
      // แปลน = ของดิบ (ใช้ชิ้นส่วนที่มีอยู่ก่อน) · นับรวมของในหีบ/โกดังของเรา
      const miss = missingRaw(s.buildNeeds(def), s.materials())[0];
      if (miss) return `${ITEMS[miss[0]].name} ไม่พอ (ขาด ${miss[1]})`;
    }
    for (let y = 0; y < def.h; y++) {
      for (let x = 0; x < def.w; x++) {
        const X = tx + x;
        const Y = ty + y;
        const t = s.tileAt(X, Y);
        const slot = s.world.islandAt(X, Y) >= 0 ? s.world.islandAt(X, Y) : s.world.slotIndexAt(X, Y);
        const own = slot === s.world.home;
        if (s.isSafeTile(X, Y)) return 'เกาะกลางห้ามสร้าง (เขตตลาด)';
        if (def.layer === 'terrain') {
          if (!own) return 'ปรับพื้นได้เฉพาะเกาะของคุณ';
          if (def.terrain === 'fill') {
            if (!isWater(t)) return 'ถมได้เฉพาะน้ำ';
          } else if (t === def.terrain) return 'เป็นพื้นแบบนี้อยู่แล้ว';
          else if (t === TILE.DEEP) return 'ต้องถมทะเลก่อน';
          if (s.isTileBlocked(X, Y) || s.structureAt(X, Y, 'object')) return 'มีของวางอยู่';
          continue;
        }
        if (def.layer === 'boat') {
          // ยานพาหนะ: เรือ = น้ำ · ยานบก = บกที่ว่าง · ยานบิน = ได้ทั้งน้ำและบก
          const kind = def.boat ? vehicleKind(def.boat) : 'water';
          if (isInterior(s.world.slotIndexAt(X, Y))) return 'วางในดันเจี้ยนไม่ได้';
          // สิ่งก่อสร้างบนน้ำ (ท่าเรือ/บ้านบนเสา/ไซดักปลา) ใช้กฎเดียวกับสิ่งก่อสร้างปกติ
          if (!def.boat && !own && !def.anywhere) return 'สร้างได้เฉพาะเกาะของคุณ';
          if (s.boatAt(X, Y) || s.structureAt(X, Y, 'boat')) return 'มียานพาหนะอยู่แล้ว';
          if (kind === 'land' || (kind === 'air' && !isWater(t))) {
            if (isWater(t)) return `${def.name}ต้องวางบนบก`;
            if (t === TILE.ROCKWALL || s.isTileBlocked(X, Y) || s.structureAt(X, Y, 'object')) return 'มีของขวางอยู่';
            continue;
          }
          if (kind === 'air') continue;
          if (!isWater(t)) return def.dock ? 'ท่าเรือต้องวางบนน้ำตื้น' : 'เรือต้องวางบนน้ำ';
          if (def.dock && t !== TILE.SHALLOW) return 'ท่าเรือต้องวางบนน้ำตื้น';
          continue;
        }
        if (isWater(t)) return 'วางบนน้ำไม่ได้';
        if (!own && !def.anywhere) return 'สร้างได้เฉพาะเกาะของคุณ';
        if (s.isTileBlocked(X, Y)) return 'มีของขวางอยู่';
        if (def.layer === 'floor' && s.structureAt(X, Y, 'floor')) return 'มีพื้นอยู่แล้ว';
        if (def.layer === 'object' && s.structureAt(X, Y, 'object')) return 'มีของวางอยู่แล้ว';
        if (def.layer === 'object' && def.blocks !== 'none') {
          const b = p.body;
          if (b.right > X * 16 && b.left < X * 16 + 16 && b.bottom > Y * 16 && b.top < Y * 16 + 16) return 'ยืนทับอยู่';
        }
      }
    }
    return null;
  }

  /** วางที่ตำแหน่งชี้ */
  place(wx: number, wy: number) {
    const def = this.active;
    if (!def) return;
    const { tx, ty } = this.anchor(wx, wy, def);
    const err = this.check(def, tx, ty);
    if (err) {
      Sfx.play('error', 250);
      EventBus.emit('toast', err, '#b13e53');
      return;
    }
    const s = this.scene;
    if (!s.creative && !consume(s.buildNeeds(def), s.materials())) return;
    if (s.freeBuilds.delete(def.id)) EventBus.emit('toast', `🎁 สร้าง${def.name}ฟรีแล้ว (สิทธิ์เริ่มต้น)`, '#a7f070');
    if (def.layer === 'terrain') {
      for (let y = 0; y < def.h; y++) {
        for (let x = 0; x < def.w; x++) {
          const t = s.tileAt(tx + x, ty + y);
          const next = def.terrain === 'fill' ? (t === TILE.DEEP ? TILE.SHALLOW : TILE.SAND) : (def.terrain as number);
          s.paintTile(tx + x, ty + y, next);
        }
      }
      Sfx.play(def.id === 't_pond' ? 'splash' : 'place');
    } else if (def.layer === 'boat' && def.boat) {
      s.spawnBoat(def.id, (tx + 0.5) * 16, (ty + 0.5) * 16);
      Sfx.play(vehicleKind(def.boat) === 'water' ? 'splash' : 'place');
    } else {
      s.placeStructure(def, tx, ty);
      Sfx.play('place');
    }
    EventBus.emit('build', def.id);
  }

  /** รื้อสิ่งก่อสร้างที่ชี้ */
  demolishAt(wx: number, wy: number) {
    const s = this.scene;
    const tx = Math.floor(wx / 16);
    const ty = Math.floor(wy / 16);
    const st = s.structureAt(tx, ty, 'object') ?? s.structureAt(tx, ty, 'floor') ?? s.structureAt(tx, ty, 'boat');
    if (!st) {
      // รื้อยานพาหนะที่จอดอยู่ (คืนวัสดุครึ่งหนึ่ง)
      const v = s.boatList().find((b) => !b.riding && Phaser.Math.Distance.Between(b.x, b.y, wx, wy) < 14);
      if (!v) return;
      s.removeVehicle(v);
      for (const [item, n] of rawCostOfBuild(s.buildNeeds(v.def))) {
        const back = Math.floor(n / 2);
        if (back > 0) s.spawnDrop(v.x, v.y - 4, item, back);
      }
      Sfx.play('breakWood');
      return;
    }
    const home = s.world.islandAt(st.tx, st.ty) === s.world.home || st.def.anywhere || st.def.layer === 'boat';
    if (!home) {
      EventBus.emit('toast', 'รื้อของบนเกาะคนอื่นไม่ได้', '#b13e53');
      return;
    }
    s.removeStructure(st, true);
    for (const [item, n] of rawCostOfBuild(s.buildNeeds(st.def))) {
      const back = Math.floor(n / 2);
      if (back > 0) s.spawnDrop(st.x, st.y - 4, item, back);
    }
    Sfx.play('breakWood');
    s.fx.debris(st.x, st.y - 6, 0x8a5a35, 10);
  }

  update(wx: number, wy: number) {
    const def = this.active;
    if (this.upgrade) {
      this.ghost.setVisible(false);
      const c = this.scene.controls;
      if (c.touchMode || c.padMode) {
        // มือถือ/จอย: เล็งของตรงหน้าผู้เล่น (ปุ่มหลัก = อัพเกรด)
        const p = this.scene.player;
        wx = p.x + p.aim.x * 20;
        wy = p.feetY + p.aim.y * 20;
      }
      const t = (this.upgradeTarget = this.scene.upgrades.targetAt(wx, wy));
      if (!t) {
        this.marker.setVisible(true).setPosition(Math.floor(wx / 16) * 16, Math.floor(wy / 16) * 16).setSize(16, 16).setStrokeStyle(1, 0xffcd75, 0.6);
        return;
      }
      const b = t.getBounds();
      const ok = !this.scene.upgrades.checkBuild(t).err;
      this.marker.setVisible(true).setPosition(Math.floor(b.x), Math.floor(b.y)).setSize(Math.ceil(b.width), Math.ceil(b.height)).setStrokeStyle(1, ok ? 0xa7f070 : 0xffcd75, 0.95);
      return;
    }
    if (this.demolish) {
      this.ghost.setVisible(false);
      this.marker.setVisible(true).setPosition(Math.floor(wx / 16) * 16, Math.floor(wy / 16) * 16).setSize(16, 16).setStrokeStyle(1, 0xb13e53);
      return;
    }
    if (!def) {
      this.ghost.setVisible(false);
      this.marker.setVisible(false);
      return;
    }
    const { tx, ty } = this.anchor(wx, wy, def);
    const ok = !this.check(def, tx, ty);
    const color = ok ? 0xa7f070 : 0xb13e53;
    if (def.layer === 'terrain') {
      this.ghost.setVisible(false);
      this.marker.setVisible(true).setPosition(tx * 16, ty * 16).setSize(def.w * 16, def.h * 16).setStrokeStyle(2, color);
      return;
    }
    this.marker.setVisible(true).setPosition(tx * 16, ty * 16).setSize(def.w * 16, def.h * 16).setStrokeStyle(1, color, 0.8);
    const x = (tx + def.w / 2) * 16;
    const y = (ty + def.h) * 16;
    this.ghost.setTexture(def.texture, def.frame ?? 0).setPosition(x, def.layer === 'boat' && !def.dock ? y - 8 : y).setOrigin(0.5, def.layer === 'boat' && !def.dock ? 0.5 : 1).setVisible(true).setTint(color);
  }
}
