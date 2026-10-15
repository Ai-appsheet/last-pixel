import Phaser from 'phaser';
import { apiEnabled, onNetStatus } from '../core/backend/Api';
import { presenceBye, presenceSync, type PresenceIn, type PresenceOut } from '../core/backend/Presence';
import { EventBus } from '../core/EventBus';
import type { HeroId } from '../data/characters';
import { GRID, SLOT_SIZE } from '../data/islands';
import { CAPES, CLASS_LOOKS, HELMETS, OUTFITS, buildHeroTexture, heroKey, type HeroLook } from '../gfx/art/heroes';
import { setWorldScale } from '../gfx/hd';
import { FONT } from '../ui/widgets';
import { INTERIOR_BASE } from '../world/Interiors';
import type { GameScene } from '../scenes/GameScene';

/**
 * ผู้เล่นคนอื่นในโลก (live) — ตัวเดียวทั้งเกม GameScene เรียก presence.attach(this) ตอนสร้างฉาก
 *  - ออนไลน์เท่านั้น (ไม่ตั้ง API URL / โลกโชว์เคส = ปิด) · backend = presence.sync (CacheService ไม่เขียนชีต)
 *  - ส่งตำแหน่งเรา + รับคนอื่นทุก PRESENCE_SYNC_MS ขณะเล่นและแท็บมองเห็น · ซ่อนแท็บ/เกมหยุด/อยู่ในดันเจี้ยน-บ้าน → PRESENCE_SLOW_MS
 *    ไม่มีใครใกล้ๆ 4 รอบติด → PRESENCE_IDLE_MS · เรียกไม่ติด → ช้าลงแล้วลองใหม่ · เซิร์ฟเวอร์ยังไม่มี action นี้ (bad_action) = ปิดทั้งรอบเล่น
 *  - ส่งเส้นทางย้อนหลัง (ทุก 0.5 วิ) ไปด้วย → อีกฝั่งเดินตามเส้นทางจริง ช้ากว่าจริง ~INTERP_MS (หมดเส้นทาง = เดาต่อ ≤ 1.2 วิ แล้วหยุด · กระโดดไกล = วาร์ป)
 *  - วาดด้วยหน้าตาจริง (อาชีพ + ชุด/หมวก/ผ้าคลุม) + ป้ายชื่อ/เลเวล + แถบ HP + ยานที่ขี่ · กดป้ายชื่อ = เติม "@ชื่อ " ในแชท
 *  - เป็น "เงา" เท่านั้น: ไม่ชน ตีไม่ได้ ไม่โดนตี (โพลทุก 2.5 วิส่งการโจมตีให้แม่นไม่ได้ — PvP ในเขตผจญภัยยังเป็นคู่แข่งบอท RivalSystem)
 */
export const PRESENCE_SYNC_MS = 2500;
export const PRESENCE_SLOW_MS = 8000;
export const PRESENCE_IDLE_MS = 5000;
/** ขอเฉพาะคนที่ห่างไม่เกินกี่ช่องเกาะ (7×7 ช่องรอบตัว) */
export const PRESENCE_AREA = 3;
/** วาดช้ากว่าเวลาจริงเท่านี้ (มีเส้นทางให้เดินตามเสมอ) */
const INTERP_MS = PRESENCE_SYNC_MS + 1300;
const EXTRAP_MS = 1200;
const TRAIL_STEP_MS = 500;
/** กระโดดไกลกว่านี้ = วาร์ป (เกิดใหม่/ข้ามแผนที่) */
const SNAP_PX = 480;
/** ไม่อยู่ในคำตอบนานเท่านี้ = เอาออก */
const GONE_MS = 9000;
const MAX_GHOSTS = 40;
const SEEN_COLOR = [115, 239, 247] as const;

const OUTFIT_IDS = new Set(OUTFITS.map((o) => o.id));
const HELMET_IDS = new Set(HELMETS.map((o) => o.id));
const CAPE_IDS = new Set(CAPES.map((o) => o.id));

function lookOf(e: PresenceIn): HeroLook {
  const base = CLASS_LOOKS[e.c as HeroId] ?? CLASS_LOOKS.mechanic;
  return {
    ...base,
    outfit: OUTFIT_IDS.has(e.o) ? e.o : base.outfit,
    helmet: HELMET_IDS.has(e.h) ? e.h : base.helmet,
    cape: CAPE_IDS.has(e.k) ? e.k : base.cape,
  };
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

/** ผู้เล่นจริง 1 คนที่เห็นในโลก (ไม่มีฟิสิกส์ — ไม่ชนอะไร) */
class Ghost {
  readonly id: string;
  info: PresenceIn;
  x: number;
  y: number;
  seenAt = Date.now();
  private samples: Sample[] = [];
  private sprite: Phaser.GameObjects.Sprite;
  private shadow: Phaser.GameObjects.Image;
  private tag: Phaser.GameObjects.Text;
  private barBg: Phaser.GameObjects.Rectangle;
  private bar: Phaser.GameObjects.Rectangle;
  private veh: Phaser.GameObjects.Image | null = null;
  private texKey = '';
  private tagText = '';
  private lastAct = 0;
  private vx = 0;
  private vy = 0;

  constructor(private s: GameScene, info: PresenceIn) {
    this.id = info.id;
    this.info = info;
    this.x = info.x;
    this.y = info.y;
    this.sprite = s.add.sprite(info.x, info.y, '__DEFAULT').setAlpha(0.95);
    this.shadow = s.add.image(info.x, info.y + 11, 'shadow').setDepth(-1);
    // ป้ายชื่อเล็ก (พิกัดโลก · กล้องซูมให้เอง) — ไม่ใช้ txt() เพราะตัวเล็กสุดของ UI คือ 10px
    this.tag = s.add.text(info.x, info.y, '', { fontFamily: FONT, fontSize: '5px', fontStyle: '600', color: '#73eff7', stroke: '#0b0d1f', strokeThickness: 1.5 })
      .setOrigin(0.5, 1).setResolution(8).setDepth(1e6 - 2)
      .setInteractive({ useHandCursor: true });
    this.tag.on('pointerdown', (_p: unknown, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation(); // ไม่ให้คลิกทะลุไปโจมตี/เดิน
      EventBus.emit('chat:mention', this.info.n);
    });
    this.barBg = s.add.rectangle(info.x, info.y, 16, 2, 0x0b0d1f, 0.85).setOrigin(0.5, 0).setDepth(1e6 - 3);
    this.bar = s.add.rectangle(info.x, info.y, 16, 2, 0xa7f070).setOrigin(0, 0).setDepth(1e6 - 3);
    this.apply(info);
    s.fx.poof(info.x, info.y + 6, 0x73eff7, 5);
  }

  /** ข้อมูลรอบใหม่ → ต่อเส้นทาง + หน้าตา/ป้าย/ท่า */
  apply(info: PresenceIn) {
    const prev = this.info;
    this.info = info;
    this.seenAt = Date.now();
    const last = this.samples.length ? this.samples[this.samples.length - 1].t : -Infinity;
    const pts = info.tr?.length ? info.tr : [[info.t, info.x, info.y] as [number, number, number]];
    for (const [t, x, y] of pts) if (t > last) this.samples.push({ t, x, y });
    if (this.samples.length > 24) this.samples.splice(0, this.samples.length - 24);
    const look = lookOf(info);
    const key = buildHeroTexture(this.s, heroKey(look), look);
    if (key !== this.texKey) {
      this.texKey = key;
      this.sprite.anims.stop();
      setWorldScale(this.sprite.setTexture(key, 0));
    }
    const label = `${info.z === 'adv' ? '⚔ ' : ''}${info.n} Lv.${info.lv}`;
    if (label !== this.tagText) this.tag.setText((this.tagText = label)).setColor(info.z === 'adv' ? '#ef7d57' : '#73eff7');
    this.bar.setSize(Math.max(1, 16 * Phaser.Math.Clamp(info.hp / 100, 0, 1)), 2).setFillStyle(info.hp > 50 ? 0xa7f070 : info.hp > 25 ? 0xffcd75 : 0xef7d57);
    // ท่าล่าสุด (ส่งมาใหม่เท่านั้น): โจมตี = ⚔ เด้งเหนือหัว · โดนตี = กะพริบแดง
    if (info.a && (info.a !== prev.a || info.t - this.lastAct > 1500) && info.t !== this.lastAct) {
      this.lastAct = info.t;
      if (info.a === 'hurt') {
        this.sprite.setTint(0xff6b6b);
        this.s.time.delayedCall(220, () => this.sprite.active && this.sprite.clearTint());
      } else this.emote('⚔');
    }
  }

  private emote(icon: string) {
    const t = this.s.add.text(this.x, this.y - 18, icon, { fontFamily: FONT, fontSize: '7px', color: '#ffcd75', stroke: '#0b0d1f', strokeThickness: 1.5 }).setOrigin(0.5).setDepth(1e6 - 1).setResolution(8);
    this.s.tweens.add({ targets: t, y: t.y - 8, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  /** เดินตามเส้นทาง ณ เวลา renderT (เวลาเซิร์ฟเวอร์) */
  update(dt: number, renderT: number, visible: boolean) {
    const sm = this.samples;
    let tx = this.info.x;
    let ty = this.info.y;
    if (sm.length) {
      let i = sm.length - 1;
      while (i > 0 && sm[i].t > renderT) i--;
      const a = sm[i];
      const b = sm[i + 1];
      if (renderT <= sm[0].t) [tx, ty] = [sm[0].x, sm[0].y];
      else if (b) {
        const k = (renderT - a.t) / Math.max(1, b.t - a.t);
        tx = a.x + (b.x - a.x) * k;
        ty = a.y + (b.y - a.y) * k;
      } else {
        // หมดเส้นทาง → เดาต่อตามความเร็วล่าสุดไม่เกิน EXTRAP_MS
        const p = sm[sm.length - 2];
        const ahead = Math.min(renderT - a.t, EXTRAP_MS);
        const span = p ? a.t - p.t : 0;
        tx = a.x + (p && span > 0 && span < 1500 ? ((a.x - p.x) / span) * ahead : 0);
        ty = a.y + (p && span > 0 && span < 1500 ? ((a.y - p.y) / span) * ahead : 0);
      }
      // เส้นทางเก่ากว่าที่ใช้ไปแล้วทิ้งได้ (เหลือจุดก่อนหน้าไว้ 1 จุด)
      if (i > 1) sm.splice(0, i - 1);
    }
    const ox = this.x;
    const oy = this.y;
    if (Math.hypot(tx - ox, ty - oy) > SNAP_PX) [this.x, this.y] = [tx, ty];
    else {
      const k = Math.min(1, dt * 14);
      this.x += (tx - ox) * k;
      this.y += (ty - oy) * k;
    }
    if (dt > 0) {
      this.vx = Phaser.Math.Linear(this.vx, (this.x - ox) / dt, Math.min(1, dt * 8));
      this.vy = Phaser.Math.Linear(this.vy, (this.y - oy) / dt, Math.min(1, dt * 8));
    }
    this.draw(visible);
  }

  private draw(visible: boolean) {
    const sp = this.sprite;
    const info = this.info;
    const moving = Math.hypot(this.vx, this.vy) > 10;
    const riding = !!info.rd;
    [sp, this.tag, this.barBg, this.bar].forEach((o) => o.setVisible(visible));
    this.shadow.setVisible(visible && !riding);
    if (!visible) {
      this.veh?.setVisible(false);
      return;
    }
    const x = Math.round(this.x);
    const y = Math.round(this.y);
    sp.setPosition(x, y);
    if (riding) {
      sp.anims.stop();
      const vk = this.s.textures.exists(info.rd) ? info.rd : info.rd.split('@')[0];
      if (this.s.textures.exists(vk)) {
        if (!this.veh) this.veh = this.s.add.image(x, y, vk);
        if (this.veh.texture.key !== vk) this.veh.setTexture(vk);
        if (Math.abs(this.vx) > 4) this.veh.setFlipX(this.vx < 0);
        this.veh.setPosition(x, y + 6 + info.alt).setVisible(true).setDepth(y + 6 + info.alt);
      }
      sp.setFrame(Math.abs(this.vy) > Math.abs(this.vx) && this.vy < -4 ? 3 : Math.abs(this.vx) > 4 ? 6 : 0).setFlipX(this.vx < -4);
      sp.setDepth((this.veh?.depth ?? y) + 1);
    } else {
      this.veh?.setVisible(false);
      const side = moving ? Math.abs(this.vx) > Math.abs(this.vy) : info.f === 's';
      const face = side ? 'side' : moving ? (this.vy < 0 ? 'up' : 'down') : info.f === 'u' ? 'up' : 'down';
      sp.setFlipX(side && (moving ? this.vx < 0 : !!info.fl));
      if (moving) sp.anims.play(`${this.texKey}_walk_${face}`, true);
      else {
        sp.anims.stop();
        sp.setFrame({ down: 0, up: 3, side: 6 }[face]);
      }
      sp.setDepth(y + 11);
      this.shadow.setPosition(x, y + 11);
    }
    const top = y - sp.displayHeight / 2 - 1;
    this.tag.setPosition(x, top - 3);
    this.barBg.setPosition(x, top - 2).setVisible(info.hp < 100);
    this.bar.setPosition(x - 8, top - 2).setVisible(info.hp < 100);
  }

  destroy(poof = false) {
    if (poof && this.sprite.visible) this.s.fx.poof(this.x, this.y + 6, 0x73eff7, 5);
    [this.sprite, this.shadow, this.tag, this.barBg, this.bar, this.veh].forEach((o) => o?.destroy());
  }
}

export interface PresenceDot {
  x: number;
  y: number;
  name: string;
  adv: boolean;
}

class PresenceSystem {
  private s: GameScene | null = null;
  private ghosts = new Map<string, Ghost>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  /** serverTime - Date.now() */
  private offset = 0;
  private dead = false;
  private lonely = 0;
  private trail: [number, number, number][] = [];
  private trailAt = 0;
  private atkAt = 0;
  private hurtAt = 0;
  private lastCd = 0;
  private lastHp = 0;
  private off: (() => void)[] = [];

  /** GameScene.create เรียก — ออฟไลน์/โลกโชว์เคส = ไม่ทำอะไร */
  attach(scene: GameScene) {
    this.detach();
    if (!apiEnabled() || scene.showcase || this.dead) return;
    this.s = scene;
    this.lastHp = scene.player.hp;
    scene.events.on('update', this.update, this);
    scene.events.once('shutdown', this.detach, this);
    const vis = () => document.visibilityState === 'visible' && this.schedule(300);
    const bye = () => presenceBye();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('pagehide', bye);
    this.off.push(
      () => document.removeEventListener('visibilitychange', vis),
      () => window.removeEventListener('pagehide', bye),
      onNetStatus((st) => st === 'online' && this.schedule(500)),
    );
    this.schedule(800);
  }

  /** ออกจากฉาก → ลบเงาทั้งหมด + บอกเซิร์ฟเวอร์ว่าออกแล้ว */
  detach() {
    const s = this.s;
    if (!s) return;
    s.events.off('update', this.update, this);
    s.events.off('shutdown', this.detach, this);
    this.off.forEach((f) => f());
    this.off = [];
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ghosts.forEach((g) => g.destroy());
    this.ghosts.clear();
    this.trail = [];
    this.s = null;
    presenceBye();
  }

  /** ตำแหน่งผู้เล่นคนอื่น (มินิแมป/แผนที่ใหญ่) */
  dots(): PresenceDot[] {
    return [...this.ghosts.values()].map((g) => ({ x: g.x, y: g.y, name: g.info.n, adv: g.info.z === 'adv' }));
  }

  /** วาดจุดผู้เล่นคนอื่น 2×2 ลงภาพมินิแมป (1 px = 1 tile · cx/cy = tile มุมซ้ายบนของภาพ) */
  paintMini(data: Uint8ClampedArray, size: number, cx: number, cy: number) {
    for (const g of this.ghosts.values()) {
      const mx = Math.floor(g.x / 16) - cx;
      const my = Math.floor(g.y / 16) - cy;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const x = mx + dx;
          const y = my + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          data.set([...SEEN_COLOR, 255], (y * size + x) * 4);
        }
      }
    }
  }

  private inside(): boolean {
    const s = this.s!;
    const p = s.player;
    return s.interiors?.current != null || s.world.slotIndexAt(Math.floor(p.x / 16), Math.floor(p.y / 16)) >= INTERIOR_BASE || p.y >= GRID * SLOT_SIZE * 16;
  }

  private update(_t: number, deltaMs: number) {
    const s = this.s;
    if (!s) return;
    const p = s.player;
    const now = Date.now();
    // จดท่าทางของเรา (โจมตี = cooldown เพิ่งถูกตั้ง · โดนตี = HP ลด)
    if (p.attackCd > this.lastCd + 0.05) this.atkAt = now;
    this.lastCd = p.attackCd;
    if (p.hp < this.lastHp - 0.5) this.hurtAt = now;
    this.lastHp = p.hp;
    if (now - this.trailAt >= TRAIL_STEP_MS) {
      this.trailAt = now;
      this.trail.push([now, Math.round(p.x), Math.round(p.y)]);
      if (this.trail.length > 10) this.trail.shift();
    }
    const dt = Math.min(deltaMs / 1000, 0.1);
    const renderT = now + this.offset - INTERP_MS;
    const hide = this.inside();
    for (const g of this.ghosts.values()) {
      const near = Math.abs(g.x - p.x) < 1400 && Math.abs(g.y - p.y) < 1000;
      g.update(dt, renderT, near && !hide);
    }
  }

  private schedule(ms: number) {
    if (!this.s || this.busy) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), ms);
  }

  private interval(): number {
    const s = this.s;
    if (!s || document.visibilityState === 'hidden' || s.scene.isPaused() || this.inside()) return PRESENCE_SLOW_MS;
    return this.lonely >= 4 ? PRESENCE_IDLE_MS : PRESENCE_SYNC_MS;
  }

  private collect(): PresenceOut {
    const s = this.s!;
    const p = s.player;
    const now = Date.now();
    const slot = s.world.slotIndexAt(Math.floor(p.x / 16), Math.floor(p.y / 16));
    const look = p.look;
    const b = s.riding;
    const tr = this.trail.map(([t, x, y]) => [now - t, x, y] as [number, number, number]);
    this.trail = [];
    return {
      x: Math.round(p.x), y: Math.round(p.y), s: slot,
      f: p.facing === 'side' ? 's' : p.facing === 'up' ? 'u' : 'd', fl: p.flipX,
      a: now - this.hurtAt < 1200 ? 'hurt' : now - this.atkAt < 1200 ? 'atk' : '',
      c: p.char.id, o: look.outfit, h: look.helmet, k: look.cape,
      lv: p.level, hp: Math.round((Math.max(0, p.hp) / Math.max(1, p.maxHp)) * 100), al: !p.dead,
      z: s.inAdventure ? 'adv' : s.playerSafe ? 'safe' : slot === s.world.home ? 'home' : s.boatRiding ? 'sea' : '',
      rd: b ? b.texture.key : '', alt: b ? Math.round(b.alt ?? 0) : 0,
      hid: this.inside(), name: s.playerName, tr, area: PRESENCE_AREA,
    };
  }

  private async sync() {
    this.timer = null;
    const s = this.s;
    if (!s || this.busy) return;
    this.busy = true;
    const r = await presenceSync(this.collect());
    this.busy = false;
    if (this.s !== s) return;
    if (!r.ok) {
      // ยังไม่ได้ deploy เซิร์ฟเวอร์รุ่นใหม่ / หลุดจากระบบ → ปิดทั้งรอบเล่น (ไม่ยิงคำขอเปล่า)
      if (r.code === 'bad_action' || r.code === 'auth' || r.code === 'disabled') {
        this.dead = r.code === 'bad_action';
        this.ghosts.forEach((g) => g.destroy());
        this.ghosts.clear();
        return;
      }
      this.schedule(PRESENCE_SLOW_MS);
      return;
    }
    const off = (Number(r.serverTime) || Date.now()) - Date.now();
    this.offset = this.offset ? this.offset * 0.7 + off * 0.3 : off;
    this.merge(r.players ?? []);
    this.lonely = this.ghosts.size ? 0 : this.lonely + 1;
    this.schedule(this.interval());
  }

  private merge(list: PresenceIn[]) {
    const s = this.s!;
    const now = Date.now();
    for (const e of list.slice(0, MAX_GHOSTS)) {
      const g = this.ghosts.get(e.id);
      if (!e.al) {
        // ตายแล้ว → หายไปพร้อมควัน
        if (g) {
          g.destroy(true);
          this.ghosts.delete(e.id);
        }
        continue;
      }
      if (g) g.apply(e);
      else if (this.ghosts.size < MAX_GHOSTS) this.ghosts.set(e.id, new Ghost(s, e));
    }
    for (const [id, g] of this.ghosts) {
      if (now - g.seenAt < GONE_MS) continue;
      g.destroy(true);
      this.ghosts.delete(id);
    }
  }
}

export const presence = new PresenceSystem();
