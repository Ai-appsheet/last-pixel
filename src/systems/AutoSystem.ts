import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { EventBus } from '../core/EventBus';
import { Sfx } from '../core/AudioManager';
import { ITEMS } from '../data/items';
import { MOBS } from '../data/mobs';
import { HOTBAR_SIZE } from '../components/Inventory';
import { NODE_SPECS } from '../entities/ResourceNode';
import { ROBOT_FUEL, eatNutri, foodScore, robotCharge, wantsFood } from './BodySystem';
import type { Mob } from '../entities/Mob';
import type { ResourceNode } from '../entities/ResourceNode';
import type { Structure } from '../entities/Structure';
import type { GameScene } from '../scenes/GameScene';
import type { NodeType } from '../world/WorldGenerator';

/**
 * งานอัตโนมัติ — ใช้ได้เฉพาะบนเกาะของตัวเอง และต้อง "สั่งงาน" ก่อน
 *   เก็บทรัพยากร (ตัดไม้/ขุดแร่/เก็บหญ้า…) × จำนวน · เก็บผักที่สุก · กำจัดมอนสเตอร์ × จำนวน
 *   เฝ้าฐาน (สู้ทุกตัวที่เข้าใกล้บ้าน จนกว่าจะสั่งหยุด) · ทำภารกิจปัจจุบัน (ถ้าทำแทนได้)
 * ครบจำนวนแล้วหยุดเอง · ออกนอกเกาะ = พักงาน กลับเกาะแล้วทำต่อ · ผู้เล่นบังคับเองทับได้เสมอ
 */
export type TaskKind = 'gather' | 'crops' | 'kill' | 'guard';

export interface AutoTask {
  kind: TaskKind;
  label: string;
  /** ชนิดทรัพยากรที่จะเก็บ (gather) */
  nodes?: NodeType[];
  /** ไอเทมที่นับความคืบหน้า (gather) */
  item?: string;
  /** มอนสเตอร์ชนิดเดียว (kill จากภารกิจ) */
  mob?: string;
  /** จำนวนเป้าหมาย (0 = ไม่จำกัด ทำจนกว่าจะสั่งหยุด) */
  goal: number;
  fromQuest?: boolean;
}

export interface TaskPreset {
  id: string;
  icon: string;
  label: string;
  make: (n: number) => AutoTask;
  /** ใช้จำนวนจากตัวเลือก */
  counted: boolean;
}

const gather = (id: string, icon: string, label: string, nodes: NodeType[], item: string): TaskPreset => ({
  id, icon, label, counted: true, make: (n) => ({ kind: 'gather', label, nodes, item, goal: n }),
});

export const TASK_PRESETS: TaskPreset[] = [
  gather('wood', 'i_wood', 'ตัดไม้', ['tree'], 'wood'),
  gather('stone', 'i_stone', 'ทุบหิน', ['rock'], 'stone'),
  gather('fiber', 'grass_0', 'เก็บหญ้าแห้ง', ['grass'], 'fiber'),
  gather('berry', 'i_berry', 'เก็บเบอร์รี่', ['bush'], 'berry'),
  gather('coal', 'i_coal', 'ขุดถ่านหิน', ['ore_coal', 'rock'], 'coal'),
  gather('iron', 'i_iron_ore', 'ขุดแร่เหล็ก', ['ore_iron', 'rock'], 'iron_ore'),
  gather('gold', 'i_gold_ore', 'ขุดแร่ทอง', ['ore_gold'], 'gold_ore'),
  gather('sulfur', 'i_sulfur', 'ขุดกำมะถัน', ['ore_sulfur'], 'sulfur'),
  { id: 'crops', icon: 'i_carrot', label: 'เก็บเกี่ยวผักที่สุก', counted: true, make: (n) => ({ kind: 'crops', label: 'เก็บเกี่ยวผัก', goal: n }) },
  { id: 'kill', icon: 'i_iron_sword', label: 'กำจัดมอนสเตอร์', counted: true, make: (n) => ({ kind: 'kill', label: 'กำจัดมอนสเตอร์', goal: n }) },
  { id: 'guard', icon: 'i_wood_shield', label: 'เฝ้าฐาน (ไม่จำกัด)', counted: false, make: () => ({ kind: 'guard', label: 'เฝ้าฐาน', goal: 0 }) },
];

type Target = { kind: 'mob'; o: Mob } | { kind: 'node'; o: ResourceNode } | { kind: 'crop'; o: Structure };

const SCAN = 300;

export class AutoSystem {
  task: AutoTask | null = null;
  /** คิวงานต่อจากงานปัจจุบัน (หาวัตถุดิบให้ครบตามแปลน) */
  private queue: AutoTask[] = [];
  private queueDone = '';
  progress = 0;
  /** พักงานเพราะอยู่นอกเกาะของตัวเอง */
  paused = false;
  /** หาเป้าไม่เจอ (รอทรัพยากรเกิดใหม่/ไม่มีมอน) */
  idle = false;
  private target: Target | null = null;
  private scanT = 0;
  private stuckT = 0;
  private bestDist = Infinity;
  private healCd = 0;
  private eatCd = 0;
  private skip = new Map<object, number>();
  private off: (() => void)[] = [];

  constructor(private s: GameScene) {
    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.off.push(() => EventBus.off(ev, fn));
    };
    on('pickup', (item: string, n: number) => this.task?.kind === 'gather' && item === this.task.item && this.count(n));
    on('harvest', () => this.task?.kind === 'crops' && this.count(1));
    on('mob:killed', (id: string) => this.task?.kind === 'kill' && (!this.task.mob || this.task.mob === id) && this.count(1));
    // ระบบอัตโนมัติทำงานเฉพาะตอนเปิดหน้าจอเกมอยู่ — สลับแอป/ปิดจอ = หยุดทันที
    const vis = () => {
      if (document.hidden && this.task) {
        this.stop(true);
        EventBus.emit('toast', '🤖 หยุดงานอัตโนมัติ — ระบบอัตโนมัติทำงานเฉพาะตอนเปิดหน้าจอเกมอยู่', '#ef7d57');
      }
    };
    document.addEventListener('visibilitychange', vis);
    this.off.push(() => document.removeEventListener('visibilitychange', vis));
    s.events.once('shutdown', () => this.off.forEach((f) => f()));
  }

  get active() {
    return !!this.task;
  }

  /** ป้ายสถานะสั้นๆ สำหรับ HUD */
  get status(): string {
    const t = this.task;
    if (!t) return '';
    const prog = t.goal ? ` ${Math.min(this.progress, t.goal)}/${t.goal}` : '';
    if (this.paused) return `⏸ ${t.label}${prog} — กลับเกาะของคุณเพื่อทำต่อ`;
    return `🤖 ${t.label}${prog}${this.idle ? ` · ${this.why()}` : ''}`;
  }

  /** ทำไมยังไม่มีเป้า */
  private why(): string {
    const t = this.task;
    if (t?.kind === 'gather') {
      const needRock = t.nodes!.every((n) => NODE_SPECS[n].harvest === 'rock');
      const min = Math.min(...t.nodes!.map((n) => NODE_SPECS[n].minPower ?? 1));
      if (needRock && this.bestToolPower('rock') < min) return min >= 5 ? 'ต้องมีอีเต้อเหล็กใน hotbar' : 'ต้องมีอีเต้อใน hotbar (คราฟต์ก่อน)';
      return 'ไม่พบบนเกาะ รอเกิดใหม่…';
    }
    if (t?.kind === 'crops') return 'ยังไม่มีผักสุก รอ…';
    if (t?.kind === 'kill') return 'ไม่มีมอนบนเกาะ รอ…';
    return 'เฝ้าระวัง…';
  }

  start(task: AutoTask) {
    this.task = task;
    this.progress = 0;
    this.target = null;
    this.skip.clear();
    Sfx.play('click');
    EventBus.emit('toast', `🤖 เริ่มงาน: ${task.label}${task.goal ? ` ${task.goal}` : ''} — เดินเองทับได้ตลอด`, '#a7f070');
  }

  /** งานจากภารกิจปัจจุบัน (null = ต้องทำเอง) */
  questTask(): AutoTask | null {
    const q = this.s.quests?.current;
    if (!q) return null;
    const left = Math.max(1, (this.s.quests!.target ?? 1) - (this.s.quests!.progress ?? 0));
    const g = q.goal;
    if (g.type === 'collect') {
      const nodes = (Object.keys(NODE_SPECS) as NodeType[]).filter((n) => NODE_SPECS[n].drops.some((d) => d.item === g.item));
      if (!nodes.length) return null;
      return { kind: 'gather', label: `ภารกิจ: เก็บ${ITEMS[g.item].name}`, nodes, item: g.item, goal: left, fromQuest: true };
    }
    if (g.type === 'kill') return { kind: 'kill', label: `ภารกิจ: ล่า${MOBS[g.mob]?.name ?? g.mob}`, mob: g.mob, goal: left, fromQuest: true };
    if (g.type === 'harvest') return { kind: 'crops', label: 'ภารกิจ: เก็บเกี่ยวผัก', goal: left, fromQuest: true };
    if (g.type === 'disaster') return { kind: 'guard', label: 'ภารกิจ: เฝ้าฐานรอดคืนนี้', goal: 0, fromQuest: true };
    return null;
  }

  /**
   * ออกหาวัตถุดิบที่ขาดให้ครบอัตโนมัติ (ทีละอย่างตามคิว) · คืนรายการที่หาเองไม่ได้ (ไม่มีแหล่งให้เก็บบนเกาะ)
   * forWhat = ชื่อสิ่งที่จะสร้าง (โชว์ตอนครบ)
   */
  gatherFor(missing: [string, number][], forWhat: string): { started: boolean; unavailable: string[] } {
    const tasks: AutoTask[] = [];
    const unavailable: string[] = [];
    for (const [item, n] of missing) {
      const nodes = (Object.keys(NODE_SPECS) as NodeType[]).filter((k) => NODE_SPECS[k].drops.some((d) => d.item === item));
      if (!nodes.length || n <= 0) {
        unavailable.push(ITEMS[item]?.name ?? item);
        continue;
      }
      tasks.push({ kind: 'gather', label: `หา${ITEMS[item]?.name ?? item}ให้${forWhat}`, nodes, item, goal: n });
    }
    if (!tasks.length) return { started: false, unavailable };
    this.stop(true);
    this.queue = tasks.slice(1);
    this.queueDone = forWhat;
    this.start(tasks[0]);
    return { started: true, unavailable };
  }

  stop(silent = false, keepQueue = false) {
    if (!keepQueue) this.queue = [];
    if (!this.task) return;
    if (!silent) EventBus.emit('toast', '🤖 หยุดงานอัตโนมัติ', '#94b0c2');
    this.task = null;
    this.target = null;
    this.s.controls.autoMove = null;
  }

  private count(n: number) {
    const t = this.task!;
    this.progress += n;
    if (t.goal && this.progress >= t.goal) {
      Sfx.play('achievement');
      // มีคิวต่อ (หาวัตถุดิบตามแปลน) → ทำอย่างถัดไปเลย
      const next = this.queue.shift();
      if (next) {
        this.stop(true, true);
        this.start(next);
        return;
      }
      EventBus.emit('toast', this.queueDone ? `✔ วัตถุดิบครบแล้ว! กด B เพื่อสร้าง${this.queueDone}` : `✔ งานอัตโนมัติเสร็จ: ${t.label} ${t.goal}/${t.goal}`, '#ffcd75');
      this.queueDone = '';
      this.stop(true);
    }
  }

  private onHome(x: number, y: number) {
    const w = this.s.world;
    const i = w.islandAt(Math.floor(x / 16), Math.floor(y / 16));
    // เกาะของเรา + แมพย่อยในเกาะเรา (ดันเจี้ยน)
    return i === w.home || i >= 1000;
  }

  update(dt: number) {
    const s = this.s;
    const c = s.controls;
    const p = s.player;
    c.autoMove = null;
    const t = this.task;
    if (!t || s.uiOpen || p.dead || s.build.on || !!s.fishing) return;
    // ใช้ได้เฉพาะบนเกาะของตัวเอง · หยุดพักระหว่างขี่ยานพาหนะทุกชนิด
    this.paused = !!s.riding || !this.onHome(p.x, p.feetY);
    if (this.paused) return;
    const now = s.worldTime;
    for (const [k, until] of this.skip) if (until < now) this.skip.delete(k);
    this.healCd -= dt;
    if (p.hp < p.maxHp * 0.35 && this.healCd <= 0) this.autoHeal();
    this.eatCd -= dt;
    if (this.eatCd <= 0) {
      this.eatCd = 4;
      if (wantsFood(p)) this.autoEat();
    }
    if (t.kind === 'gather' && !this.hasRoom(t.item!)) {
      EventBus.emit('toast', '🎒 กระเป๋าเต็ม — หยุดงานอัตโนมัติ', '#ef7d57');
      return this.stop(true);
    }

    this.scanT -= dt;
    if (!this.valid(this.target) || this.scanT <= 0) {
      this.scanT = 0.5;
      const next = this.pick(t);
      if (next?.o !== this.target?.o) {
        this.stuckT = 0;
        this.bestDist = Infinity;
      }
      this.target = next;
    }
    const tg = this.target;
    this.idle = !tg;
    if (!tg) {
      // เฝ้าฐาน: ไม่มีศัตรู → เดินกลับจุดเกิด
      if (t.kind === 'guard' && !c.manualMoving) {
        const home = s.world.spawn;
        const hx = home.tx * 16 + 8;
        const hy = home.ty * 16 + 8;
        if (Phaser.Math.Distance.Between(p.x, p.feetY, hx, hy) > 40) c.autoMove = new Phaser.Math.Vector2(hx - p.x, hy - p.feetY).normalize();
      }
      return;
    }
    if (c.manualMoving) return;

    const tx = tg.o.x;
    const ty = tg.kind === 'node' ? tg.o.baseY - 4 : tg.o.y;
    const dist = Phaser.Math.Distance.Between(p.x, p.feetY, tx, ty);
    let reach: number;
    if (tg.kind === 'mob') {
      this.chooseWeapon();
      const w = p.weaponRef?.slot;
      reach = w && ITEMS[w.id].ranged ? 140 : p.tool.range + 10 + (tg.o.isBoss ? 14 : 0);
    } else if (tg.kind === 'node' && tg.o.spec.harvest !== 'pick') {
      this.chooseTool(tg.o.spec.harvest);
      reach = 16;
    } else reach = BALANCE.reach;

    if (dist > reach) {
      c.autoMove = new Phaser.Math.Vector2(tx - p.x, ty - p.feetY).normalize();
      if (dist < this.bestDist - 2) {
        this.bestDist = dist;
        this.stuckT = 0;
      } else if ((this.stuckT += dt) > 1.5) {
        this.skip.set(tg.o, now + 15);
        this.target = null;
      }
      return;
    }
    p.aimAt(tx, ty);
    if (tg.kind === 'mob') {
      const w = p.weaponRef?.slot;
      if (w && ITEMS[w.id].ranged) s.shoot();
      else s.attack();
    } else if (tg.kind === 'crop') s.farmInteract(tg.o);
    else if (tg.o.spec.harvest === 'pick') s.pick(tg.o);
    else s.attack();
  }

  private valid(t: Target | null): boolean {
    if (!t || !t.o.active) return false;
    if (t.kind === 'mob') return t.o.hp > 0;
    if (t.kind === 'node') return t.o.available;
    return t.o.ripe;
  }

  private pick(t: AutoTask): Target | null {
    const s = this.s;
    const p = s.player;
    const home = s.world.spawn;
    const near = (x: number, y: number) => Phaser.Math.Distance.Between(p.x, p.y, x, y);
    // ศัตรู: งานสู้ = หาในรัศมีกว้าง · งานอื่น = ป้องกันตัวเมื่อเข้ามาใกล้
    const fight = t.kind === 'kill' || t.kind === 'guard';
    let mob: Mob | null = null;
    let md = fight ? SCAN : 70;
    for (const m of s.mobList()) {
      if (!m.hostile || this.skip.has(m) || !this.onHome(m.x, m.y)) continue;
      if (t.kind === 'kill' && t.mob && m.def.id !== t.mob && near(m.x, m.y) > 70) continue;
      if (t.kind === 'guard' && Phaser.Math.Distance.Between(m.x, m.y, home.tx * 16, home.ty * 16) > 260) continue;
      const d = near(m.x, m.y);
      if (d < md) {
        md = d;
        mob = m;
      }
    }
    if (mob) return { kind: 'mob', o: mob };
    if (t.kind === 'crops') {
      let crop: Structure | null = null;
      let cd = Infinity;
      for (const st of s.structureList()) {
        if (!st.def.crop || !st.ripe || st.getData('foreign') || this.skip.has(st)) continue;
        const d = near(st.x, st.y);
        if (d < cd) {
          cd = d;
          crop = st;
        }
      }
      return crop ? { kind: 'crop', o: crop } : null;
    }
    if (t.kind === 'gather') {
      const want = new Set(t.nodes);
      const node = s.nearestNodeFar(p.x, p.feetY, SCAN * 2, (n) =>
        n.available && want.has(n.kind) && !this.skip.has(n) && this.onHome(n.x, n.baseY) && this.canHarvest(n) && n.spec.drops.some((d) => d.item === t.item));
      return node ? { kind: 'node', o: node } : null;
    }
    return null;
  }

  private hasRoom(item: string): boolean {
    const inv = this.s.player.inventory;
    return inv.slots.some((sl) => !sl || (sl.id === item && sl.qty < ITEMS[item].stack));
  }

  private canHarvest(n: ResourceNode): boolean {
    const h = n.spec.harvest;
    if (h === 'pick') return true;
    const best = this.bestToolPower(h);
    return best > 0 && (!n.spec.minPower || best >= n.spec.minPower);
  }

  private bestToolPower(kind: 'tree' | 'rock'): number {
    const inv = this.s.player.inventory;
    let best = Math.max(kind === 'tree' ? 1 : 0, this.s.player.beltTool(kind)?.tool[kind] ?? 0); // ⛏ เข็มขัดเครื่องมือ
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const t = inv.slots[i] && ITEMS[inv.slots[i]!.id].tool;
      if (t) best = Math.max(best, t[kind]);
    }
    return best;
  }

  private chooseTool(kind: 'tree' | 'rock') {
    const p = this.s.player;
    let best = -1;
    const belt = p.beltTool(kind)?.tool[kind] ?? 0;
    let power = Math.max(kind === 'tree' ? 1 : 0, belt);
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const t = p.inventory.slots[i] && ITEMS[p.inventory.slots[i]!.id].tool;
      if (t && t[kind] > power) {
        power = t[kind];
        best = i;
      }
    }
    if (best >= 0) p.selected = best;
    else if (belt && p.held && ITEMS[p.held.id].type === 'tool') {
      // เข็มขัดดีกว่า: ปล่อยเครื่องมือในมือ (GameScene.attack ใช้ของในเข็มขัดเอง)
      const free = p.inventory.slots.findIndex((sl, i) => i < HOTBAR_SIZE && (!sl || ITEMS[sl.id].type === 'material'));
      if (free >= 0) p.selected = free;
    }
  }

  /** ใช้อาวุธแรงสุด (ใน hotbar หรืออาวุธหลักที่สวม) */
  private chooseWeapon() {
    const p = this.s.player;
    const dmg = (id: string) => ITEMS[id].tool?.damage ?? ITEMS[id].ranged?.damage ?? 0;
    let best = -1;
    let bd = p.equip.weapon ? dmg(p.equip.weapon.id) : 0;
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const sl = p.inventory.slots[i];
      if (!sl) continue;
      const def = ITEMS[sl.id];
      if ((def.type === 'weapon' || def.type === 'ranged') && dmg(sl.id) > bd && !(def.ranged?.ammo && p.inventory.count(def.ranged.ammo) <= 0)) {
        bd = dmg(sl.id);
        best = i;
      }
    }
    if (best >= 0) {
      p.selected = best;
      return;
    }
    const held = p.held ? ITEMS[p.held.id] : undefined;
    if (p.equip.weapon && held && ['tool', 'weapon', 'ranged'].includes(held.type)) {
      const free = p.inventory.slots.findIndex((sl, i) => i < HOTBAR_SIZE && (!sl || !['tool', 'weapon', 'ranged', 'throw', 'food', 'heal', 'box', 'elixir'].includes(ITEMS[sl.id].type)));
      if (free >= 0) p.selected = free;
    }
  }

  /**
   * หิว/กระหาย/ขาดสารอาหาร/ป่วย → กินของที่เติมส่วนที่ขาดมากที่สุด (BodySystem.foodScore)
   * เลี่ยงของดิบ/น้ำดิบ (เว้นแต่หิวหรือกระหายจัด) · ป่วย = กินสมุนไพร/ยาก่อน · หุ่นยนต์ = ชาร์จด้วยไม้/ถ่าน/เหล็ก
   */
  private autoEat() {
    const p = this.s.player;
    const slots = p.inventory.slots;
    if (p.char.passive.robot) {
      if (p.hunger >= 45) return;
      const i = slots.findIndex((sl) => sl && ROBOT_FUEL[sl.id]);
      if (i < 0) return;
      const msg = robotCharge(p, slots[i]!.id);
      p.inventory.consumeAt(i);
      if (msg) EventBus.emit('toast', `🤖 ${msg}`, '#73eff7');
      return;
    }
    let best = -1;
    let bs = 4;
    slots.forEach((sl, i) => {
      if (!sl) return;
      const sc = foodScore(p, ITEMS[sl.id]);
      if (sc > bs) {
        bs = sc;
        best = i;
      }
    });
    // ป่วย: ยาสมุนไพร (heal) ก็ใช้ได้
    if (best < 0 && p.nutri.sick > 0) best = slots.findIndex((sl) => sl && ITEMS[sl.id].nutri?.cure);
    if (best < 0) return;
    const def = ITEMS[slots[best]!.id];
    if (def.food) p.eat(def.food);
    const msg = eatNutri(p, def);
    p.inventory.consumeAt(best);
    Sfx.play('eat');
    EventBus.emit('toast', `🤖 กิน${def.name}อัตโนมัติ${msg ? ` · ${msg}` : ''}`, '#a7f070');
  }

  /** HP ต่ำ → ใช้ผ้าพันแผล/อาหารที่ฟื้น HP อัตโนมัติ */
  private autoHeal() {
    const p = this.s.player;
    const i = p.inventory.slots.findIndex((sl) => sl && (ITEMS[sl.id].type === 'heal' || ((ITEMS[sl.id].food?.hp ?? 0) > 0 && ITEMS[sl.id].type === 'food')));
    if (i < 0) return;
    const def = ITEMS[p.inventory.slots[i]!.id];
    p.eat(def.food!);
    eatNutri(p, def);
    p.inventory.consumeAt(i);
    this.healCd = 3;
    Sfx.play('eat');
    EventBus.emit('toast', `🤖 ใช้${def.name}อัตโนมัติ (HP ต่ำ)`, '#a7f070');
  }
}
