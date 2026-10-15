import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { getSettings } from '../core/Settings';
import { ITEMS } from '../data/items';
import type { Mob } from '../entities/Mob';
import { ResourceNode } from '../entities/ResourceNode';
import { Structure } from '../entities/Structure';
import { TILE, isWater } from '../world/tiles';
import type { GameScene } from '../scenes/GameScene';
import type { UIScene } from '../scenes/UIScene';

/**
 * เมาส์ (คอม) — เดิน + คลิกทำทุกอย่าง
 * - กดซ้ายค้างบนพื้นว่าง = เดินตามเมาส์ · คลิกพื้น = เดินไปจุดนั้น (A* อ้อมสิ่งกีดขวาง ≤ 40 ช่อง) · Shift = วิ่ง
 * - คลิกของที่กด E ได้ (หีบ แปลงผัก บ่อ เตียง ประตู ยาน พ่อค้า ตู้จดหมาย กล่องร่ม พุ่มไม้ ของตกแต่ง ฯลฯ) = ทำสิ่งนั้นกับ "ชิ้นที่คลิก"
 *   (เรียก GameScene.interact() โดยสมมติว่ายืนตรงของชิ้นนั้น) · ไกล = เดินไปก่อนแล้วค่อยทำ
 * - คลิกมอน/ต้นไม้/หินที่ไกล = เดินไปตี/ตัด · ในระยะ = ตีเหมือนเดิม · คลิกของตก = เดินไปเก็บ · คลิกน้ำ = เดินไปดื่ม/ตกปลา
 * - ชี้ของ = เคอร์เซอร์เปลี่ยน + กรอบมุมรอบของ + ป้าย [คลิก/E] ของชิ้นนั้น
 * WASD/จอยทับได้เสมอ · ปิดตอนโหมดสร้าง/ขี่ยาน/ตกปลา/หน้าต่างเปิด
 */
type Target =
  | { kind: 'mob'; mob: Mob }
  | { kind: 'node'; node: ResourceNode }
  | { kind: 'use'; x: number; y: number; reach: number; label: string; obj?: Phaser.GameObjects.GameObject; talk: boolean }
  | { kind: 'drop'; x: number; y: number; obj: Phaser.GameObjects.GameObject }
  | { kind: 'water'; x: number; y: number; label: string };

type Goal =
  | { kind: 'point'; x: number; y: number }
  | { kind: 'mob'; mob: Mob; ax: number; ay: number }
  | { kind: 'node'; node: ResourceNode; hits: number; t: number }
  | { kind: 'use'; x: number; y: number; reach: number; obj?: Phaser.GameObjects.GameObject }
  | { kind: 'water'; x: number; y: number };

/** ของที่คลิกซ้าย = เหวี่ยงตี (ที่เหลือ เช่น ของกิน/เบ็ด/ระเบิด คลิกพื้น = ใช้ของเหมือนเดิม) */
const ATTACKISH = ['tool', 'weapon', 'ranged', 'material', 'light', 'seed', 'ammo'];
/** ป้ายจากน้ำรอบตัว (ไม่นับเป็น "ของที่คลิก") */
const WATER_HINT = /ดื่มน้ำดิบ|ตักน้ำดิบ|^ตกปลา$|หุ่นยนต์ดื่มน้ำ/;
const TALK_HINT = /คุย|แผงตลาด|ท่าส่งของ|พ่อค้า/;
const T = 16;
/** รัศมีค้นหาเส้นทาง (ช่อง) */
const SEARCH_R = 40;
const MAX_EXPAND = 5000;
/** กดสั้นกว่านี้และเมาส์ไม่ขยับ = คลิกเดิน */
const CLICK_MS = 250;
const CLICK_SLOP = 10;
const DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export class MouseMove {
  /** การกดซ้ายครั้งนี้เป็นของระบบนี้: walk = เดินตามเมาส์ · stopped = กดค้างแต่ไม่เดิน (ทำของไปแล้ว/WASD ทับ) */
  private press: 'none' | 'walk' | 'stopped' = 'none';
  /** การกดล่าสุดถูกระบบนี้รับไปแล้ว — GameScene.onPointerDown ไม่ต้องทำต่อ */
  claimed = false;
  /** ป้าย [คลิก/E] ของที่ชี้อยู่ (null = ใช้ป้ายของที่ใกล้ตัวตามเดิม) */
  hoverHint: string | null = null;
  private downAt = 0;
  private downSx = 0;
  private downSy = 0;
  private downWx = 0;
  private downWy = 0;
  private goal: Goal | null = null;
  private path: { x: number; y: number }[] = [];
  private repathT = 0;
  private stuckT = 0;
  private stuckTries = 0;
  private lastX = 0;
  private lastY = 0;
  private walkCache = new Map<number, boolean>();
  private bw = 8;
  private bh = 5;
  private hover: Target | null = null;
  private hoverT = 0;
  private hoverPx = -1;
  private hoverPy = -1;
  private cursor = '';
  private cursors: Record<string, string> = {};
  private frame: Phaser.GameObjects.Graphics;

  constructor(private s: GameScene) {
    s.input.on('pointerdown', this.onDown, this);
    s.input.on('pointerup', this.onUp, this);
    this.frame = s.add.graphics().setDepth(1e6).setVisible(false);
    this.cursors = makeCursors();
    s.events.once('shutdown', () => this.setCursor(''));
  }

  /** กำลังเดินด้วยเมาส์/ไปหาเป้า — GameScene ไม่ต้องเหวี่ยงตีจากการกดซ้ายค้าง */
  get busy(): boolean {
    return this.press !== 'none' || !!this.goal;
  }

  private get ui(): UIScene | undefined {
    return this.s.scene.get('UIScene') as UIScene | undefined;
  }

  /** ใช้เมาส์คลิกโลกได้ตอนนี้ไหม */
  private usable(): boolean {
    const s = this.s;
    const c = s.controls;
    return !!c && !c.touchMode && !c.padMode && !s.build.on && !s.uiOpen && !s.riding && !s.fishing && !s.player.dead;
  }

  /** เดินด้วยเมาส์ได้ไหม (ตั้งค่า "เดินด้วยเมาส์") */
  private get walkOn(): boolean {
    return getSettings().mouseMove;
  }

  private cancel() {
    this.goal = null;
    this.path = [];
  }

  // ---------------------------------------------------------------- คลิก
  private onDown(pointer: Phaser.Input.Pointer) {
    this.claimed = false;
    if (pointer.button !== 0) return;
    // คลิกใหม่ = ทิ้งเป้าเดิม
    this.cancel();
    this.press = 'none';
    if (!this.usable() || this.ui?.isPointerOverUI(pointer)) return;
    const wp = this.s.pointerWorld(pointer);
    if (!wp) return;
    const p = this.s.player;
    const def = p.held ? ITEMS[p.held.id] : undefined;
    const attackish = !def || ATTACKISH.includes(def.type);
    const wr = p.weaponRef;
    const ranged = !!wr && !!ITEMS[wr.slot.id].ranged;
    const reach = this.mobReach();
    const near = Phaser.Math.Distance.Between(p.x, p.y, wp.x, wp.y) <= reach * 2 + 8;
    const t = this.pick(wp.x, wp.y);

    if (t?.kind === 'mob') {
      if (ranged || Phaser.Math.Distance.Between(p.x, p.y, t.mob.x, t.mob.y) <= reach || !this.walkOn) return; // ตี/ยิงตามเดิม
      this.claimed = true;
      this.press = 'stopped';
      return this.setGoal({ kind: 'mob', mob: t.mob, ax: t.mob.x, ay: t.mob.y });
    }
    // ศัตรูประชิด + คลิกใกล้ตัว (ไม่ได้คลิกของใช้) = ตีตามเดิม — กันพลาดเป้านิดเดียวแล้วกลายเป็นเดิน
    if (attackish && !ranged && near && t?.kind !== 'use' && this.s.mobList().some((m) => m.active && m.hostile && Phaser.Math.Distance.Between(p.x, p.y, m.x, m.y) <= reach + 6)) return;
    if (t?.kind === 'use') {
      this.claimed = true;
      this.press = 'stopped';
      if (this.useReach(t.x, t.y, t.reach, p.x, p.feetY)) return this.doUse(t.x, t.y);
      if (this.walkOn) this.setGoal({ kind: 'use', x: t.x, y: t.y, reach: t.reach, obj: t.obj });
      return;
    }
    if (t?.kind === 'node') {
      if (this.nodeReach(t.node, p.x, p.y) || !this.walkOn) return; // ตัด/ทุบตามเดิม
      this.claimed = true;
      this.press = 'stopped';
      return this.setGoal({ kind: 'node', node: t.node, hits: 0, t: 0 });
    }
    if (t?.kind === 'water') {
      // ยืนริมน้ำอยู่แล้ว = ตกปลา/ดื่มตามเดิม (GameScene.onPointerDown/E)
      if (this.waterNear(p.x, p.feetY)) {
        if (def?.type === 'rod') return;
        this.claimed = true;
        this.press = 'stopped';
        p.aimAt(t.x, t.y);
        this.s.waterAct(); // คันเบ็ดในเข็มขัด = ตกปลา (ช่องใช้งาน)
        return;
      }
      if (!this.walkOn) return;
      this.claimed = true;
      this.press = 'stopped';
      return this.setGoal({ kind: 'water', x: t.x, y: t.y });
    }
    if (!this.walkOn) return;
    if (t?.kind === 'drop') {
      this.claimed = true;
      this.press = 'stopped';
      this.marker(t.x, t.y);
      return this.setGoal({ kind: 'point', x: t.x, y: t.y });
    }
    if (!attackish) return; // ถือของกิน/ของใช้: คลิกพื้น = ใช้ของเหมือนเดิม
    if (near && this.swingHitsNode(wp.x, wp.y)) return; // ธนูก็ตัด/ขุดได้ (เครื่องมือในเข็มขัด)
    // พื้นว่าง: กดค้าง = เดินตามเมาส์ · ปล่อยเร็ว = คลิกเดิน
    this.claimed = true;
    this.press = 'walk';
    this.downAt = performance.now();
    this.downSx = pointer.x;
    this.downSy = pointer.y;
    this.downWx = wp.x;
    this.downWy = wp.y;
  }

  private onUp(pointer: Phaser.Input.Pointer) {
    if (pointer.button !== 0) return;
    this.release(pointer);
  }

  private release(pointer: Phaser.Input.Pointer) {
    const was = this.press;
    this.press = 'none';
    if (was !== 'walk' || !this.usable() || !this.walkOn) return;
    const quick = performance.now() - this.downAt < CLICK_MS && Phaser.Math.Distance.Between(pointer.x, pointer.y, this.downSx, this.downSy) < CLICK_SLOP;
    if (quick) {
      this.setGoal({ kind: 'point', x: this.downWx, y: this.downWy });
      this.marker(this.downWx, this.downWy);
    }
  }

  private setGoal(g: Goal) {
    this.goal = g;
    this.stuckTries = 0;
    this.stuckT = 0;
    this.repathT = 0;
    this.repath();
  }

  /** ทำแบบกด E กับของที่จุด (x,y) — สมมติว่ายืนตรงนั้น ของที่ใกล้สุดจึงเป็นชิ้นที่คลิก */
  private doUse(x: number, y: number) {
    const p = this.s.player;
    p.aimAt(x, y - 11);
    this.asIfAt(x, y, () => this.s.interact());
  }

  /** เรียก fn โดยย้ายเท้าผู้เล่นไปที่ (x, feetY) ชั่วคราว (ตำแหน่งจริงคืนทันที ยกเว้น fn ย้ายผู้เล่นเอง เช่น ขึ้นยาน) */
  private asIfAt<R>(x: number, feetY: number, fn: () => R): R {
    const s = this.s;
    const p = s.player;
    const ox = p.x;
    const oy = p.y;
    const aim = p.aim;
    const fy = feetY - (p.feetY - p.y);
    // ประตู/ทางเข้า (รัศมี 40px) ที่ไม่ได้คลิก ไม่ให้แย่งคลิก
    const spots = s.interiors.spots;
    const all = spots.slice();
    const keep = all.filter((it) => Phaser.Math.Distance.Between(x, feetY, it.x, it.y) <= 24);
    const hide = keep.length !== all.length;
    if (hide) spots.splice(0, spots.length, ...keep);
    p.x = x;
    p.y = fy;
    p.aim = new Phaser.Math.Vector2(0, 0);
    try {
      return fn();
    } finally {
      if (p.x === x && p.y === fy) {
        p.x = ox;
        p.y = oy;
      }
      p.aim = aim;
      if (hide && spots.length === keep.length && keep.every((it, i) => spots[i] === it)) spots.splice(0, spots.length, ...all);
    }
  }

  // ---------------------------------------------------------------- ทุกเฟรม (ก่อน player.update)
  update(dt: number) {
    const s = this.s;
    const c = s.controls;
    const p = s.player;
    c.mouseMove = null;
    this.walkCache.clear();
    const pointer = s.input.activePointer;
    if (!this.usable()) {
      this.cancel();
      if (this.press === 'walk') this.press = 'stopped';
      if (this.press !== 'none' && !pointer.leftButtonDown()) this.press = 'none';
      this.setHover(null);
      return;
    }
    this.updateHover(dt, pointer);
    if (this.press !== 'none' && !pointer.leftButtonDown()) this.release(pointer);
    // WASD/จอย ทับ = ยกเลิกการเดินด้วยเมาส์
    if (c.keyMoving) {
      this.cancel();
      if (this.press === 'walk') this.press = 'stopped';
      return;
    }
    const body = p.body as Phaser.Physics.Arcade.Body;
    const bx = body.center.x;
    const by = body.center.y;
    const moved = Phaser.Math.Distance.Between(bx, by, this.lastX, this.lastY);
    this.lastX = bx;
    this.lastY = by;
    // วาร์ป/เข้าบ้าน = ทิ้งเป้า
    if (moved > 48) this.cancel();

    if (this.press === 'walk') {
      if (!this.walkOn || this.ui?.isPointerOverUI(pointer)) return;
      const wp = s.pointerWorld(pointer);
      if (!wp) return;
      const v = new Phaser.Math.Vector2(wp.x - bx, wp.y - by);
      if (v.length() > 4) c.mouseMove = v.normalize();
      return;
    }

    const g = this.goal;
    if (!g) return;
    // เป้าหายไป (มอนตาย/ต้นไม้ล้ม/ของถูกรื้อ)
    if ((g.kind === 'mob' && !g.mob.active) || (g.kind === 'node' && (!g.node.active || !g.node.available)) || (g.kind === 'use' && g.obj && !g.obj.active)) return this.cancel();

    if (this.arrived(g, p.x, p.y)) {
      this.path = [];
      if (g.kind === 'point') return this.cancel();
      if (g.kind === 'use') {
        this.cancel();
        return this.doUse(g.x, g.y);
      }
      if (g.kind === 'water') {
        this.cancel();
        p.aimAt(g.x, g.y);
        return this.s.waterAct();
      }
      const tx = g.kind === 'mob' ? g.mob.x : g.node.x;
      const ty = g.kind === 'mob' ? g.mob.y : g.node.baseY - 3;
      p.aimAt(tx, ty);
      if (g.kind === 'node') {
        // ตัด/ทุบต่อจนล้ม (สูงสุด 4 ที หรือ 3 วิ)
        g.t += dt;
        if (g.hits >= 4 || g.t > 3) return this.cancel();
      }
      if (p.attackCd > 0 || p.isDodging || p.stamina < BALANCE.attackStamina) return;
      c.touch.pressed.add('attack');
      if (g.kind === 'mob') return this.cancel();
      g.hits++;
      return;
    }

    // มอนเดินหนี = หาทางใหม่เป็นระยะ
    this.repathT -= dt;
    if (g.kind === 'mob' && this.repathT <= 0 && Phaser.Math.Distance.Between(g.mob.x, g.mob.y, g.ax, g.ay) > 10) {
      g.ax = g.mob.x;
      g.ay = g.mob.y;
      this.repath();
    }

    // เดินตามจุด
    while (this.path.length && Phaser.Math.Distance.Between(bx, by, this.path[0].x, this.path[0].y) < 4) this.path.shift();
    if (!this.path.length) {
      // ปลายทางแล้วแต่ยังไม่ถึงระยะ → ลองหาทางใหม่ (ไม่เกิน 2 ครั้ง)
      if (g.kind === 'point' || this.stuckTries++ > 1) return this.cancel();
      this.repath();
      if (!this.path.length) return this.cancel();
    }
    // ติด (ไม่ขยับ 0.5 วิ) → หาทางใหม่ · ติดซ้ำ = เลิก
    this.stuckT = moved < 0.4 ? this.stuckT + dt : 0;
    if (this.stuckT > 0.5) {
      this.stuckT = 0;
      if (this.stuckTries++ > 1) return this.cancel();
      this.repath();
      if (!this.path.length) return this.cancel();
    }
    const n = this.path[0];
    c.mouseMove = new Phaser.Math.Vector2(n.x - bx, n.y - by).normalize();
  }

  // ---------------------------------------------------------------- ชี้ของ: เคอร์เซอร์ + กรอบ + ป้าย
  private updateHover(dt: number, pointer: Phaser.Input.Pointer) {
    if (this.ui?.isPointerOverUI(pointer)) return this.setHover(null);
    this.hoverT -= dt;
    const movedPtr = Math.abs(pointer.x - this.hoverPx) + Math.abs(pointer.y - this.hoverPy) > 1;
    // ขยับเมาส์ = ตรวจใหม่ได้ทุก ~80ms · อยู่นิ่ง (แต่กล้องเลื่อน) = ทุก 200ms
    if ((movedPtr && this.hoverT <= 0.12) || this.hoverT <= 0) {
      this.hoverT = 0.2;
      this.hoverPx = pointer.x;
      this.hoverPy = pointer.y;
      const wp = this.s.pointerWorld(pointer);
      this.setHover(wp ? this.pick(wp.x, wp.y) : null);
    }
    this.drawFrame();
  }

  private setHover(t: Target | null) {
    this.hover = t;
    const p = this.s.player;
    let cur = '';
    this.hoverHint = null;
    if (t?.kind === 'mob') cur = this.cursors.sword;
    else if (t?.kind === 'node') cur = this.cursors.pick;
    else if (t?.kind === 'drop') {
      cur = 'pointer';
      this.hoverHint = 'เก็บของ';
    } else if (t?.kind === 'use' || t?.kind === 'water') {
      cur = t.kind === 'use' && t.talk ? this.cursors.talk : 'pointer';
      const inReach = t.kind === 'use' ? this.useReach(t.x, t.y, t.reach, p.x, p.feetY) : this.waterNear(p.x, p.feetY);
      this.hoverHint = inReach || !this.walkOn ? t.label : `${t.label} (คลิก = เดินไป)`;
    }
    this.setCursor(cur);
    if (!t) this.frame.setVisible(false);
  }

  private setCursor(c: string) {
    if (c === this.cursor) return;
    this.cursor = c;
    this.s.input.setDefaultCursor(c);
  }

  /** กรอบมุมรอบของที่ชี้ (พิกเซล กะพริบเบาๆ) */
  private drawFrame() {
    const t = this.hover;
    const g = this.frame;
    const obj = !t ? null : t.kind === 'mob' ? t.mob : t.kind === 'node' ? t.node : t.kind === 'water' ? null : t.obj;
    let r: Phaser.Geom.Rectangle | null = null;
    if (obj && 'getBounds' in obj) r = (obj as Phaser.GameObjects.Image).getBounds();
    else if (t && t.kind !== 'mob' && t.kind !== 'node') r = new Phaser.Geom.Rectangle(Math.floor(t.x / T) * T, Math.floor(t.y / T) * T, T, T);
    if (!r) return void g.setVisible(false);
    g.clear().setVisible(true);
    const col = t?.kind === 'mob' ? 0xef7d57 : 0xffcd75;
    const x0 = Math.round(r.x) - 1;
    const y0 = Math.round(r.y) - 1;
    const x1 = Math.round(r.right);
    const y1 = Math.round(r.bottom);
    const L = Math.max(2, Math.min(4, Math.floor(Math.min(r.width, r.height) / 3)));
    g.setAlpha(0.65 + 0.35 * Math.sin(this.s.time.now / 180));
    for (const [c, o] of [[0x1a1c2c, 1], [col, 0]] as [number, number][]) {
      g.fillStyle(c, 1);
      for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        g.fillRect(Math.min(cx + o, cx + o + sx * L), cy + o, L, 1);
        g.fillRect(cx + o, Math.min(cy + o, cy + o + sy * L), 1, L);
      }
    }
  }

  // ---------------------------------------------------------------- หาของใต้เมาส์
  /** ของใต้เมาส์: มอน → ของตก → ของที่กด E ได้ → ต้นไม้/หิน → ของตกแต่งที่เก็บได้ → น้ำ */
  private pick(x: number, y: number): Target | null {
    const s = this.s;
    const p = s.player;
    const def = p.held ? ITEMS[p.held.id] : undefined;
    const attackish = !def || ATTACKISH.includes(def.type);
    const wr = p.weaponRef;
    const ranged = !!wr && !!ITEMS[wr.slot.id].ranged;
    if (attackish) {
      const mob = this.mobAt(x, y, ranged ? 28 : 14);
      if (mob) return { kind: 'mob', mob };
    }
    const drops = s.dropList();
    for (const o of this.objectsAt(x, y)) {
      if ((drops as Phaser.GameObjects.GameObject[]).includes(o)) return { kind: 'drop', x: o.x, y: o.y, obj: o };
      if (o instanceof ResourceNode && !o.isPickable) {
        if (o.available && attackish) return { kind: 'node', node: o };
        continue;
      }
      const b = o.getBounds();
      const ax = b.centerX;
      const ay = b.bottom - 4;
      const label = this.asIfAt(ax, ay, () => s.computeHint());
      // ป้ายที่มาจากน้ำ/ของตกแต่งรอบๆ (ไม่ใช่ภาพที่ชี้) ไม่นับ — ยกเว้นซากเครื่องบิน
      if (!label || WATER_HINT.test(label)) continue;
      if (o !== s.wreckSprite && label === this.asIfAt(ax, ay, () => s.gather.hint())) continue;
      return { kind: 'use', x: ax, y: ay, reach: 20 + Math.max(0, (b.width - 16) / 2), label, obj: o, talk: TALK_HINT.test(label) };
    }
    const tx = Math.floor(x / T);
    const ty = Math.floor(y / T);
    const w = s.world;
    if (tx < 0 || ty < 0 || tx >= w.size || ty >= w.size) return null;
    // ของตกแต่ง (ดอกไม้/หญ้าสูง ฯลฯ) มีทั่วพื้น — นับเป็นเป้าเฉพาะที่อยู่ในระยะ ไกลกว่านั้นคลิก = เดิน
    if (w.decor[ty * w.size + tx] >= 0 && this.useReach(tx * T + 8, ty * T + 8, 20, p.x, p.feetY)) {
      const label = this.asIfAt(tx * T + 8, ty * T + 8, () => s.gather.hint());
      if (label) return { kind: 'use', x: tx * T + 8, y: ty * T + 8, reach: 20, label, talk: false };
    }
    const tile = s.tileAt(tx, ty);
    // น้ำลึก/ถือเบ็ด = เป้าน้ำ · น้ำตื้น (เดินลุยได้) นับเฉพาะคลิกใกล้ตัวตอนยืนบนบก — ไกลกว่านั้นคลิก = เดินลุย
    const onLand = !isWater(s.tileAt(Math.floor(p.x / T), Math.floor(p.feetY / T)));
    if (isWater(tile) && (tile === TILE.DEEP || p.hasRod || (onLand && Phaser.Math.Distance.Between(p.x, p.feetY, x, y) <= 36))) {
      return { kind: 'water', x, y, label: p.hasRod ? 'ตกปลา' : p.char.passive.robot ? 'หุ่นยนต์ดื่มน้ำไม่ได้' : 'ดื่มน้ำ' };
    }
    return null;
  }

  /** ภาพในโลกที่เมาส์ทับ (บนสุดก่อน) — ไม่นับผู้เล่น/ของติดตัวผู้เล่น/มอน/พื้น/เอฟเฟกต์/ของใหญ่ทั้งจอ */
  private objectsAt(x: number, y: number): (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] {
    const s = this.s;
    const p = s.player;
    const out: (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite)[] = [];
    const mobs = new Set<Phaser.GameObjects.GameObject>(s.mobList());
    for (const o of s.children.list) {
      if (!(o instanceof Phaser.GameObjects.Image || o instanceof Phaser.GameObjects.Sprite)) continue;
      if (!o.active || !o.visible || o.alpha < 0.1 || o.depth < 0 || o === s.player) continue;
      if (Math.abs(o.x - x) > 64 || Math.abs(o.y - y) > 96) continue;
      if (o.displayWidth > 160 || o.displayHeight > 160 || (o.displayWidth < 6 && o.displayHeight < 6)) continue;
      // เอฟเฟกต์ลอยบนสุด (ฝน หิ่งห้อย อนุภาค) · ออร่า/อาวุธที่ติดตัวผู้เล่น
      if (o.depth > 60000 || o.blendMode !== Phaser.BlendModes.NORMAL) continue;
      if (Math.abs(o.depth - p.depth) < 3 && Math.abs(o.x - p.x) < 8 && Math.abs(o.y - p.y) < 16) continue;
      if (!o.getBounds().contains(x, y) || mobs.has(o)) continue; // มอนจัดการแยกแล้ว
      out.push(o);
    }
    return out.sort((a, b) => b.depth - a.depth);
  }

  private mobAt(x: number, y: number, r: number): Mob | null {
    let best: Mob | null = null;
    let bd = Infinity;
    for (const m of this.s.mobList()) {
      if (!m.active || !m.visible) continue;
      const d = Phaser.Math.Distance.Between(x, y, m.x, m.y - 2);
      if (d < r + (m.isBoss ? 10 : 0) && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** เหวี่ยงไปทางเมาส์แล้วโดนต้นไม้/หินไหม (ตรงกับ GameScene.attack) */
  private swingHitsNode(x: number, y: number): boolean {
    const p = this.s.player;
    const v = new Phaser.Math.Vector2(x - p.x, y - p.y);
    if (v.lengthSq() < 1) return false;
    v.normalize();
    const nr = Math.min(p.tool.range, 24) * 0.8;
    return !!this.s.nearestNode(p.x + v.x * nr, p.y + 3 + v.y * nr, 15, (n) => n.available);
  }

  // ---------------------------------------------------------------- ระยะถึงเป้า (px,py = พิกัดตัวผู้เล่น)
  private mobReach() {
    return this.s.player.tool.range + 12;
  }

  private nodeReach(n: ResourceNode, px: number, py: number) {
    const nr = Math.min(this.s.player.tool.range, 24) * 0.8;
    return Phaser.Math.Distance.Between(px, py + 3, n.x, n.baseY) <= nr + 9;
  }

  private useReach(x: number, y: number, reach: number, px: number, feetY: number) {
    return Phaser.Math.Distance.Between(px, feetY, x, y) <= reach;
  }

  /** มีน้ำติดตัว (เหมือน GameScene.waterNearby) */
  private waterNear(px: number, feetY: number) {
    return [[14, 0], [-14, 0], [0, 14], [0, -14]].some(([dx, dy]) => isWater(this.s.tileAt(Math.floor((px + dx) / T), Math.floor((feetY + dy) / T))));
  }

  private arrived(g: Goal, px: number, py: number): boolean {
    const feetY = py + (this.s.player.feetY - this.s.player.y);
    if (g.kind === 'point') return false;
    if (g.kind === 'mob') return Phaser.Math.Distance.Between(px, py, g.mob.x, g.mob.y) <= this.mobReach() - 3;
    if (g.kind === 'node') return this.nodeReach(g.node, px, py);
    if (g.kind === 'water') return this.waterNear(px, feetY);
    return this.useReach(g.x, g.y, g.reach, px, feetY);
  }

  // ---------------------------------------------------------------- เส้นทาง (A* บนช่อง 16px)
  private repath() {
    const g = this.goal;
    if (!g) return;
    this.repathT = 0.4;
    const p = this.s.player;
    const body = p.body as Phaser.Physics.Arcade.Body;
    this.bw = body.width;
    this.bh = body.height;
    const ox = body.center.x - p.x;
    const oy = body.center.y - p.y;
    const sx = Math.floor(body.center.x / T);
    const sy = Math.floor(body.center.y / T);
    let gx: number;
    let gy: number;
    let done: (tx: number, ty: number) => boolean;
    if (g.kind === 'point') {
      gx = Math.floor(g.x / T);
      gy = Math.floor(g.y / T);
      done = (tx, ty) => tx === gx && ty === gy;
    } else {
      const tgt = g.kind === 'mob' ? { x: g.mob.x, y: g.mob.y } : g.kind === 'node' ? { x: g.node.x, y: g.node.baseY } : { x: g.x, y: g.y };
      gx = Math.floor(tgt.x / T);
      gy = Math.floor(tgt.y / T);
      done = (tx, ty) => this.arrived(g, tx * T + 8 - ox, ty * T + 8 - oy);
    }
    const tiles = this.findPath(sx, sy, gx, gy, done);
    if (!tiles) {
      // หาทางไม่ได้ → เดินตรงไปก่อน (ติดเมื่อไหร่ค่อยเลิก)
      this.path = g.kind === 'point' ? [{ x: g.x, y: g.y }] : [];
      return;
    }
    const pts = tiles.map(([x, y]) => ({ x: x * T + 8, y: y * T + 8 }));
    // ปลายทางคลิกพื้น = จุดที่คลิกจริง (ถ้าอยู่ช่องเดียวกัน)
    const last = tiles[tiles.length - 1];
    if (g.kind === 'point' && last && last[0] === gx && last[1] === gy) pts[pts.length - 1] = { x: g.x, y: g.y };
    this.path = this.smooth(body.center.x, body.center.y, pts);
  }

  /** ช่องที่ตัวผู้เล่นยืนได้ (น้ำลึก/ผนังถ้ำ/สิ่งก่อสร้างกั้น/ต้นไม้-หิน/ตัวกันชนอื่น = ไม่ได้) */
  private walkable(tx: number, ty: number): boolean {
    const key = tx * 65536 + ty;
    const hit = this.walkCache.get(key);
    if (hit !== undefined) return hit;
    const ok = this.checkWalk(tx, ty);
    this.walkCache.set(key, ok);
    return ok;
  }

  private checkWalk(tx: number, ty: number): boolean {
    const s = this.s;
    const w = s.world;
    const slot = w.slotIndexAt(tx, ty);
    if (slot < 0) return false;
    if (!w.generated.has(slot) && w.slots[slot]) return false; // เกาะที่ยังไม่สร้าง — ไม่ไปปลุกให้สร้าง
    const t = s.tileAt(tx, ty);
    if (t === TILE.DEEP || t === TILE.ROCKWALL) return false;
    const st = s.structureAt(tx, ty, 'object');
    if (st && st.def.blocks === 'all') return false;
    if (s.isTileBlocked(tx, ty)) return false;
    const bodies = s.physics.overlapRect(tx * T + 8 - this.bw / 2, ty * T + 8 - this.bh / 2, this.bw, this.bh, false, true);
    for (const b of bodies) {
      if (!b.enable) continue;
      const go = b.gameObject;
      if (go instanceof Structure && go.def.blocks !== 'all') continue; // ประตู = ผู้เล่นผ่านได้
      return false;
    }
    return true;
  }

  /** A* 8 ทิศ (ไม่ตัดมุม) ในกรอบ ±40 ช่อง · ไปไม่ถึง = คืนทางไปช่องที่ใกล้เป้าที่สุด */
  private findPath(sx: number, sy: number, gx: number, gy: number, done: (tx: number, ty: number) => boolean): [number, number][] | null {
    const W = SEARCH_R * 2 + 1;
    const ox = sx - SEARCH_R;
    const oy = sy - SEARCH_R;
    const N = W * W;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const hf: number[] = [];
    const hi: number[] = [];
    const push = (f: number, i: number) => {
      let k = hf.length;
      hf.push(f);
      hi.push(i);
      while (k > 0) {
        const pk = (k - 1) >> 1;
        if (hf[pk] <= f) break;
        hf[k] = hf[pk];
        hi[k] = hi[pk];
        k = pk;
      }
      hf[k] = f;
      hi[k] = i;
    };
    const pop = (): number => {
      const top = hi[0];
      const lf = hf.pop()!;
      const li = hi.pop()!;
      if (hf.length) {
        let k = 0;
        for (;;) {
          let c = k * 2 + 1;
          if (c >= hf.length) break;
          if (c + 1 < hf.length && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= lf) break;
          hf[k] = hf[c];
          hi[k] = hi[c];
          k = c;
        }
        hf[k] = lf;
        hi[k] = li;
      }
      return top;
    };
    const h = (x: number, y: number) => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const si = SEARCH_R * W + SEARCH_R;
    g[si] = 0;
    push(h(sx, sy), si);
    let best = si;
    let bestH = h(sx, sy);
    let found = -1;
    let expanded = 0;
    while (hf.length && expanded < MAX_EXPAND) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      expanded++;
      const cx = (cur % W) + ox;
      const cy = Math.floor(cur / W) + oy;
      if (done(cx, cy)) {
        found = cur;
        break;
      }
      const hc = h(cx, cy);
      if (hc < bestH) {
        bestH = hc;
        best = cur;
      }
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        const lx = nx - ox;
        const ly = ny - oy;
        if (lx < 0 || ly < 0 || lx >= W || ly >= W) continue;
        const ni = ly * W + lx;
        if (closed[ni] || !this.walkable(nx, ny)) continue;
        if (dx && dy && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          from[ni] = cur;
          push(ng + h(nx, ny), ni);
        }
      }
    }
    const end = found >= 0 ? found : best;
    if (end === si) return found >= 0 ? [] : null;
    const out: [number, number][] = [];
    for (let i = end; i !== si && i >= 0; i = from[i]) out.push([(i % W) + ox, Math.floor(i / W) + oy]);
    return out.reverse();
  }

  /** ตัดจุดที่เดินตรงถึงได้ทิ้ง (เส้นทางดูเป็นธรรมชาติ ไม่ซิกแซกตามช่อง) */
  private smooth(x: number, y: number, pts: { x: number; y: number }[]) {
    const out: { x: number; y: number }[] = [];
    let fx = x;
    let fy = y;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(fx, fy, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      fx = pts[j].x;
      fy = pts[j].y;
      i = j + 1;
    }
    return out;
  }

  /** เดินตรงจาก a → b ได้ไหม (เช็กมุมกล่องเท้าทุก 4px) */
  private clear(x0: number, y0: number, x1: number, y1: number): boolean {
    const hw = this.bw / 2 + 1;
    const hh = this.bh / 2 + 1;
    const n = Math.max(1, Math.ceil(Phaser.Math.Distance.Between(x0, y0, x1, y1) / 4));
    for (let k = 1; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      for (const [cx, cy] of [[x - hw, y - hh], [x + hw, y - hh], [x - hw, y + hh], [x + hw, y + hh]]) {
        if (!this.walkable(Math.floor(cx / T), Math.floor(cy / T))) return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- เป้าหมายบนพื้น (พิกเซล จางหาย)
  private marker(x: number, y: number) {
    const gfx = this.s.add.graphics().setPosition(Math.round(x), Math.round(y)).setDepth(-0.4);
    const corner: [number, number][] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) corner.push([sx * 4, sy * 4], [sx * 3, sy * 4], [sx * 4, sy * 3]);
    const px = (c: number, pts: [number, number][]) => {
      gfx.fillStyle(c, 1);
      for (const [a, b] of pts) gfx.fillRect(a, b, 1, 1);
    };
    px(0x1a1c2c, corner.map(([a, b]) => [a + 1, b + 1] as [number, number]));
    px(0xffcd75, corner);
    px(0xffffff, [[0, 0]]);
    gfx.setScale(1.6);
    this.s.tweens.add({ targets: gfx, scale: 1, duration: 160, ease: 'Back.Out' });
    this.s.tweens.add({ targets: gfx, alpha: 0, delay: 380, duration: 420, onComplete: () => gfx.destroy() });
  }
}

/** เคอร์เซอร์พิกเซล (ดาบ = ตี · อีเต้อ = ตัด/ทุบ · ฟองคำพูด = คุย) วาดเป็น data URL ขยาย 2 เท่า */
function makeCursors(): Record<string, string> {
  const out: Record<string, string> = { sword: 'crosshair', pick: 'pointer', talk: 'pointer' };
  if (typeof document === 'undefined') return out;
  const make = (draw: (set: (x: number, y: number, c: string) => void) => void, hx: number, hy: number, fallback: string) => {
    const N = 15;
    const grid: (string | null)[] = new Array(N * N).fill(null);
    draw((x, y, c) => {
      if (x >= 0 && y >= 0 && x < N && y < N) grid[y * N + x] = c;
    });
    const cv = document.createElement('canvas');
    cv.width = cv.height = N * 2;
    const ctx = cv.getContext('2d');
    if (!ctx) return fallback;
    // ขอบเข้มรอบรูป
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (grid[y * N + x]) continue;
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const ax = x + dx;
          const ay = y + dy;
          return ax >= 0 && ay >= 0 && ax < N && ay < N && !!grid[ay * N + ax] && grid[ay * N + ax] !== '#1a1c2c';
        });
        if (nb) {
          ctx.fillStyle = '#1a1c2c';
          ctx.fillRect(x * 2, y * 2, 2, 2);
        }
      }
    }
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const c = grid[y * N + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * 2, y * 2, 2, 2);
      }
    }
    return `url(${cv.toDataURL()}) ${hx * 2} ${hy * 2}, ${fallback}`;
  };
  out.sword = make((set) => {
    for (let i = 1; i <= 8; i++) {
      set(i, i, '#f4f4f4');
      set(i + 1, i, '#94b0c2');
    }
    for (let k = -2; k <= 2; k++) set(9 + k, 10 - k, '#ffcd75');
    set(10, 11, '#8a5a35');
    set(11, 12, '#8a5a35');
    set(12, 13, '#ffcd75');
  }, 1, 1, 'crosshair');
  out.pick = make((set) => {
    for (let i = 5; i <= 12; i++) set(i, i, '#8a5a35');
    // หัวอีเต้อโค้งลงหาด้าม ปลายสองข้างสีอ่อน
    for (let k = -4; k <= 4; k++) {
      const bend = Math.abs(k) >= 3 ? Math.abs(k) - 2 : 0;
      set(5 + k + bend, 5 - k + bend, Math.abs(k) === 4 ? '#f4f4f4' : '#94b0c2');
    }
    set(4, 4, '#94b0c2');
    set(6, 6, '#94b0c2');
  }, 3, 11, 'pointer');
  out.talk = make((set) => {
    for (let y = 2; y <= 8; y++) for (let x = 2; x <= 12; x++) if (!((x === 2 || x === 12) && (y === 2 || y === 8))) set(x, y, '#f4f4f4');
    set(4, 9, '#f4f4f4');
    set(3, 10, '#f4f4f4');
    for (const x of [5, 7, 9]) set(x, 5, '#333c57');
  }, 3, 10, 'pointer');
  return out;
}
