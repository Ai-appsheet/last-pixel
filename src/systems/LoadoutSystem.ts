import type { Slot } from '../components/Inventory';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import type { RunSave } from '../core/SaveManager';
import { ITEMS } from '../data/items';
import { BAR_KINDS, LOAD_INFO, canBelt, loadKindOf, type LoadKind } from '../data/loadout';
import { levelOfSlot } from '../data/upgrade';
import type { GameScene } from '../scenes/GameScene';

/** รุ่นของการจัดของเข้าช่อง (เซฟที่ต่ำกว่านี้ = จัดให้อัตโนมัติ 1 ครั้งตอนโหลด) · 3 = แถบเดียว 5 หมวด */
const LOADOUT_V = 3;

/** ตัวเลือกในหมวด: at = ช่องในกระเป๋า · -1 = ชิ้นที่ใส่อยู่ในช่องหมวด */
export interface LoadChoice { slot: Slot; at: number; current: boolean }

type EquipKey = 'weapon' | 'tool1' | 'lamp';
const EQUIP_OF: Partial<Record<LoadKind, EquipKey>> = { weapon: 'weapon', tool: 'tool1', lamp: 'lamp' };

/**
 * แถบด้านล่างแถบเดียว: 5 ช่องหมวด หมวดละ 1 ชิ้น ทำงานพร้อมกัน (ดู data/loadout.ts · ui/LoadoutBar.ts · DESIGN.md 5.3b)
 *   ⚔ อาวุธ = equip.weapon (หรือของขว้างที่ถือ = selected) · ⛏ เครื่องมือ = equip.tool1 (ตีต้นไม้/หิน/หันเข้าน้ำ = สลับชิ้นที่เหมาะเอง)
 *   ❤ ฟื้นเลือด = heal (id อาหาร/ยา) · ✨ บัฟ = buff (id ผลึกพลัง) · 🔦 แสง = equip.lamp
 *   มือว่างเป็นปกติ (Player.selected = -1) · เก็บของได้ครั้งแรก (ช่องว่าง) → ลงช่องให้เอง
 */
export class LoadoutSystem {
  /** ❤ ของฟื้นเลือด (id) — นับจากกระเป๋า */
  quick: string | null = null;
  /** ✨ ของบัฟ (id) */
  buff: string | null = null;
  /** เพิ่มทุกครั้งที่ช่องเปลี่ยน (UI วาดใหม่) */
  version = 0;
  private off: (() => void)[] = [];

  constructor(private s: GameScene) {
    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.off.push(() => EventBus.off(ev, fn));
    };
    on('pickup', (id: string) => this.autoAssign(id));
    on('craft', (id: string) => s.time.delayedCall(0, () => this.autoAssign(id)));
    s.events.once('shutdown', () => this.off.forEach((f) => f()));
  }

  private get p() {
    return this.s.player;
  }

  serialize() {
    return { v: LOADOUT_V, quick: this.quick, buff: this.buff };
  }

  /** หลังโหลดเซฟ/แจกชุดเริ่มต้น: มือว่าง + เซฟเก่า/เกมใหม่ → จัดของเข้าช่องให้ 1 ครั้ง */
  init(save: RunSave | null) {
    const d = save?.player.loadout;
    const p = this.p;
    this.quick = d?.quick ?? null;
    this.buff = d?.buff ?? null;
    const held = p.held;
    p.selected = -1;
    if (d && d.v >= LOADOUT_V) return;
    // เครื่องมือเหลือช่องเดียว: ชิ้นในช่องที่ 2 (เซฟรุ่นก่อน) กลับเข้ากระเป๋า
    const t2 = p.equip.tool2;
    if (t2) {
      p.equip.tool2 = null;
      if (!p.inventory.addSlot(t2)) this.s.spawnDrop(p.x, p.y + 6, t2.id, t2.qty, t2);
    }
    // ของที่ถืออยู่ (hotbar เดิม) ลงช่องหมวดของมันก่อน
    const hi = held ? p.inventory.slots.indexOf(held) : -1;
    const hk = held ? loadKindOf(ITEMS[held.id]) : null;
    if (hi >= 0 && hk && EQUIP_OF[hk] && ITEMS[held!.id].type !== 'throw' && !p.equip[EQUIP_OF[hk]!]) this.swap(EQUIP_OF[hk]!, hi, true);
    for (const k of BAR_KINDS) this.fillEmpty(k);
    this.version++;
  }

  /** ช่องว่าง → ใส่ชิ้นที่ดีสุดในกระเป๋า */
  private fillEmpty(kind: LoadKind) {
    const p = this.p;
    if (kind === 'heal') return void (this.quick ??= this.bestHeal());
    if (kind === 'buff') return void (this.buff ??= this.choices('buff')[0]?.slot.id ?? null);
    const key = EQUIP_OF[kind]!;
    if (p.equip[key]) return;
    const list = this.choices(kind).filter((c) => c.at >= 0 && ITEMS[c.slot.id].type !== 'throw');
    const score = (s: Slot) => {
      const d = ITEMS[s.id];
      if (kind === 'tool') return d.type === 'rod' ? 0.5 : Math.max(d.tool?.tree ?? 0, (d.tool?.rock ?? 0) * 1.2);
      if (kind === 'weapon') return d.tool?.damage ?? d.ranged?.damage ?? 0;
      return d.light?.radius ?? 1;
    };
    const best = list.sort((a, b) => score(b.slot) - score(a.slot))[0];
    if (best) this.swap(key, best.at, true);
  }

  kindOf(id: string): LoadKind | null {
    return ITEMS[id] ? loadKindOf(ITEMS[id]) : null;
  }

  /** ของชิ้นนี้ใส่ช่องหมวด kind ได้ไหม (ขวานรบ/ค้อน ใส่ช่องเครื่องมือได้ด้วย) */
  accepts(kind: LoadKind, id: string) {
    const d = ITEMS[id];
    if (!d) return false;
    return loadKindOf(d) === kind || (kind === 'tool' && canBelt(d) && d.type !== 'throw');
  }

  /** ชิ้นที่แสดงในช่อง (❤/✨ = จำนวนที่มีในกระเป๋า) */
  current(kind: LoadKind): Slot | null {
    const p = this.p;
    if (kind === 'heal' || kind === 'buff') {
      const id = kind === 'heal' ? this.quick : this.buff;
      return id ? { id, qty: p.inventory.count(id) } : null;
    }
    if (kind === 'weapon' && p.held && ITEMS[p.held.id].type === 'throw') return p.held; // ของขว้างในมือ
    if (kind === 'offhand') return p.equip.offhand;
    return p.equip[EQUIP_OF[kind]!];
  }

  /** ตัวเลือกทั้งหมดในหมวด (เรียงคงที่ตามชนิด → id → เลเวล) — ❤/✨ = id ละ 1 แถว */
  choices(kind: LoadKind): LoadChoice[] {
    const p = this.p;
    const inv = p.inventory.slots;
    const out: LoadChoice[] = [];
    if (kind === 'heal' || kind === 'buff') {
      const seen = new Set<string>();
      const cur = kind === 'heal' ? this.quick : this.buff;
      inv.forEach((s, i) => {
        if (!s || seen.has(s.id) || loadKindOf(ITEMS[s.id]) !== kind) return;
        seen.add(s.id);
        out.push({ slot: { id: s.id, qty: p.inventory.count(s.id) }, at: i, current: s.id === cur });
      });
    } else {
      const key = EQUIP_OF[kind]!;
      const heldThrow = kind === 'weapon' && p.held && ITEMS[p.held.id].type === 'throw' ? p.selected : -2;
      if (p.equip[key]) out.push({ slot: p.equip[key]!, at: -1, current: heldThrow < 0 });
      inv.forEach((s, i) => {
        if (s && this.accepts(kind, s.id)) out.push({ slot: s, at: i, current: i === heldThrow });
      });
    }
    const rank = (c: LoadChoice) => `${ITEMS[c.slot.id].type === 'throw' ? 1 : 0}|${c.slot.id}|${9 - (c.slot.plus ?? 0)}|${String(c.at + 1).padStart(3, '0')}`;
    return out.sort((a, b) => rank(a).localeCompare(rank(b)));
  }

  /** กดช่อง: อาวุธ/เครื่องมือ/แสง = สลับชิ้นถัดไป · ❤/✨ = ใช้ */
  tap(kind: LoadKind) {
    if (kind === 'heal') return void this.useQuick();
    if (kind === 'buff') return void this.useBuff();
    this.cycle(kind, 1);
  }

  /** ปุ่มเลข 1–5 = กดช่องตามลำดับบนแถบ */
  press(i: number) {
    const k = BAR_KINDS[i];
    if (k) this.tap(k);
  }

  /** วนไปชิ้นถัดไปในหมวด */
  cycle(kind: LoadKind, dir = 1) {
    const list = this.choices(kind);
    if (list.length <= 1) {
      EventBus.emit('toast', list.length ? `${LOAD_INFO[kind].icon} มี${LOAD_INFO[kind].name}ชิ้นเดียว` : `${LOAD_INFO[kind].icon} ยังไม่มี${LOAD_INFO[kind].name}ในกระเป๋า`, '#94b0c2');
      return;
    }
    const at = Math.max(0, list.findIndex((c) => c.current));
    const cur = list[at];
    // ข้ามชิ้นที่ "เหมือนกับที่ใส่อยู่" (เช่น ดาบเหล็ก 2 เล่ม) — ไม่งั้นจะสลับเล่มเดิมวนอยู่ที่เดิม ดูเหมือนค้าง
    const same = (a: LoadChoice, b: LoadChoice) => a.slot.id === b.slot.id && (a.slot.plus ?? 0) === (b.slot.plus ?? 0);
    const n = list.length;
    for (let k = 1; k < n; k++) {
      const c = list[(((at + dir * k) % n) + n) % n];
      if (!same(c, cur)) return this.pick(kind, c);
    }
    EventBus.emit('toast', `${LOAD_INFO[kind].icon} มี${LOAD_INFO[kind].name}ชนิดเดียว`, '#94b0c2');
  }

  /** เลือกชิ้นนี้ลงช่องหมวด */
  pick(kind: LoadKind, c: LoadChoice) {
    const p = this.p;
    Sfx.play('click');
    if (kind === 'heal' || kind === 'buff') {
      if (kind === 'heal') this.quick = c.slot.id;
      else this.buff = c.slot.id;
      this.version++;
      return this.say(kind, c.slot);
    }
    if (kind === 'weapon') {
      if (c.at >= 0 && ITEMS[c.slot.id].type === 'throw') {
        p.selected = c.at; // ของขว้าง: ถือในมือ (กดโจมตี = ขว้าง)
        this.version++;
        return this.say(kind, c.slot);
      }
      p.selected = -1;
    }
    if (c.at >= 0) this.swap(EQUIP_OF[kind]!, c.at);
    this.version++;
    this.say(kind, this.current(kind));
  }

  private say(kind: LoadKind, s: Slot | null) {
    if (!s) return;
    const d = ITEMS[s.id];
    EventBus.emit('loadout:pick', kind, `${LOAD_INFO[kind].icon} ${s.plus ? `Lv.${s.plus + 1} ` : ''}${d.name}`);
  }

  /** สลับของในกระเป๋า (index) กับชิ้นในช่อง key — ซ้อนกอง = หยิบ 1 */
  private swap(key: EquipKey, index: number, silent = false) {
    const p = this.p;
    const item = p.inventory.slots[index];
    if (!item) return false;
    const prev = p.equip[key];
    p.equip[key] = { ...item, qty: 1 };
    if (item.qty > 1) {
      item.qty--;
      if (prev && !p.inventory.addSlot(prev)) this.s.spawnDrop(p.x, p.y + 6, prev.id, prev.qty, prev);
    } else p.inventory.slots[index] = prev ? { ...prev } : null;
    p.inventory.version++;
    this.version++;
    if (key === 'weapon') {
      p.recalc();
      EventBus.emit('gear:changed');
    }
    if (!silent) this.s.equipFx.play(item.id, levelOfSlot(item), () => p.refreshLook()); // แสงวาบตอนสวม (fx/EquipFx)
    return true;
  }

  /** ใส่ของจากกระเป๋าเข้าช่องหมวด (kind ไม่ระบุ = ตามชนิดของ) */
  equip(index: number, kind?: LoadKind): boolean {
    const item = this.p.inventory.slots[index];
    if (!item) return false;
    kind ??= this.kindOf(item.id) ?? undefined;
    if (!kind || !this.accepts(kind, item.id)) {
      const k = this.kindOf(item.id);
      EventBus.emit('toast', kind ? `ช่อง${LOAD_INFO[kind].icon} ${LOAD_INFO[kind].name} รับเฉพาะ: ${LOAD_INFO[kind].hint.split(' —')[0]}${k ? ` (ชิ้นนี้ไปช่อง ${LOAD_INFO[k].icon} ${LOAD_INFO[k].name})` : ''}` : 'ของชิ้นนี้ไม่มีช่องบนแถบ — ใช้จากกระเป๋า', '#ef7d57');
      return false;
    }
    if (kind === 'offhand') return this.s.equipFrom(index);
    this.pick(kind, { slot: item, at: index, current: false });
    return true;
  }

  /** ถอดชิ้นในช่องกลับเข้ากระเป๋า */
  unequip(kind: LoadKind): boolean {
    const p = this.p;
    if (kind === 'heal' || kind === 'buff') {
      if (kind === 'heal') this.quick = null;
      else this.buff = null;
      this.version++;
      return true;
    }
    if (kind === 'weapon' && p.held && ITEMS[p.held.id].type === 'throw') {
      p.selected = -1;
      this.version++;
      return true;
    }
    if (kind === 'weapon' || kind === 'offhand') return this.s.unequip(kind);
    const key = EQUIP_OF[kind]!;
    const item = p.equip[key];
    if (!item) return false;
    if (!p.inventory.addSlot(item)) {
      EventBus.emit('toast', 'กระเป๋าเต็ม', '#ef7d57');
      return false;
    }
    p.equip[key] = null;
    this.version++;
    return true;
  }

  // ---------------------------------------------------------------- เครื่องมือตามเป้า (GameScene.attack / fishAhead)
  /** ตีต้นไม้/หิน: ในกระเป๋ามีชิ้นที่เหมาะกว่าชิ้นในช่อง → สลับเข้าช่องให้เอง · คืนชิ้นในช่อง */
  toolFor(kind: 'tree' | 'rock') {
    const p = this.p;
    const cur = p.equip.tool1;
    const curPow = cur ? ITEMS[cur.id].tool?.[kind] ?? 0 : 0;
    let bi = -1;
    let bp = curPow;
    p.inventory.slots.forEach((s, i) => {
      const d = s && ITEMS[s.id];
      if (!d || !this.accepts('tool', s!.id) || d.type === 'weapon') return; // อาวุธในกระเป๋าไม่ดึงมาเอง
      const pow = d.tool?.[kind] ?? 0;
      if (pow > bp) [bi, bp] = [i, pow];
    });
    if (bi >= 0) {
      this.swap('tool1', bi, true);
      this.say('tool', p.equip.tool1);
    }
    return p.beltTool(kind);
  }

  /** มีคันเบ็ด (ช่องเครื่องมือ/กระเป๋า) */
  hasRod() {
    return !!this.p.beltRod || this.p.inventory.slots.some((s) => s && ITEMS[s.id].type === 'rod');
  }

  /** ช่องเครื่องมือเป็นคันเบ็ด (ดึงจากกระเป๋าถ้ายังไม่ใช่) */
  ensureRod(): boolean {
    const p = this.p;
    if (p.beltRod) return true;
    const i = p.inventory.slots.findIndex((s) => s && ITEMS[s.id].type === 'rod');
    if (i < 0) return false;
    this.swap('tool1', i, true);
    this.say('tool', p.equip.tool1);
    return true;
  }

  // ---------------------------------------------------------------- เก็บของได้ → ลงช่องว่าง
  private autoAssign(id: string) {
    const p = this.p;
    const kind = this.kindOf(id);
    if (!kind || kind === 'offhand' || p.dead) return;
    if (kind === 'heal' || kind === 'buff') {
      if (kind === 'heal' && !this.quick) this.quick = id;
      else if (kind === 'buff' && !this.buff) this.buff = id;
      else return;
      this.version++;
      return;
    }
    if (ITEMS[id].type === 'throw') return;
    const key = EQUIP_OF[kind]!;
    if (p.equip[key]) return;
    for (let i = p.inventory.slots.length - 1; i >= 0; i--) {
      if (p.inventory.slots[i]?.id !== id) continue;
      this.swap(key, i);
      EventBus.emit('toast', `${LOAD_INFO[kind].icon} ${ITEMS[id].name} → ช่อง${LOAD_INFO[kind].name}`, '#a7f070');
      return;
    }
  }

  // ---------------------------------------------------------------- ใช้ของ
  /** ของกิน/ยาที่ดีสุดตอนนี้ (HP ต่ำ = ยา/ผ้าพันแผลก่อน) */
  private bestHeal(): string | null {
    const p = this.p;
    const lowHp = p.hp < p.maxHp * 0.6;
    let best: string | null = null;
    let bs = 0;
    for (const s of p.inventory.slots) {
      const d = s && ITEMS[s.id];
      if (!d || loadKindOf(d) !== 'heal') continue;
      const f = d.food!;
      const sc = (f.hp ?? 0) * (lowHp ? 3 : 0.5) + (f.hunger ?? 0) + (f.thirst ?? 0) * 0.5 + 1;
      if (sc > bs) [best, bs] = [d.id, sc];
    }
    return best;
  }

  /** ใช้ของในกระเป๋าช่อง i ด้วยโค้ดเดิม (GameScene.useHeld) แล้วกลับมือว่าง */
  private useAt(i: number) {
    const p = this.p;
    const sel = p.selected;
    p.selected = i;
    try {
      this.s.useHeld(true);
    } finally {
      p.selected = sel;
    }
  }

  /** ❤ กิน/ใช้ของฟื้นเลือด (F / กดช่อง) — หมดแล้วสลับเป็นของที่ดีสุดที่มี */
  useQuick(): boolean {
    const p = this.p;
    if (!this.quick || p.inventory.count(this.quick) <= 0) {
      const next = this.bestHeal();
      if (!next) {
        EventBus.emit('toast', '❤ ไม่มีอาหาร/ยาในกระเป๋า', '#ef7d57');
        return false;
      }
      this.quick = next;
      this.version++;
    }
    const i = p.inventory.slots.findIndex((s) => s?.id === this.quick);
    if (i < 0) return false;
    this.useAt(i);
    return true;
  }

  /** ✨ ใช้ผลึกพลัง */
  useBuff(): boolean {
    const p = this.p;
    if (!this.buff || p.inventory.count(this.buff) <= 0) {
      this.buff = this.choices('buff')[0]?.slot.id ?? null;
      this.version++;
      if (!this.buff) {
        EventBus.emit('toast', '✨ ยังไม่มีผลึกพลัง — สุ่มได้จากกล่องดรอป', '#94b0c2');
        return false;
      }
    }
    const i = p.inventory.slots.findIndex((s) => s?.id === this.buff);
    if (i >= 0) this.s.useElixir(i);
    return i >= 0;
  }

  /** F ตอนถือเครื่องมือ/คบไฟ (เช่นกด "ใช้" ในกระเป๋า) → ใส่ช่องหมวด */
  useHeldTool(): boolean {
    const p = this.p;
    const h = p.held;
    if (!h) return false;
    if (ITEMS[h.id].type === 'throw') {
      this.version++; // ของขว้าง: ถือไว้ในช่องอาวุธ (กดโจมตี = ขว้าง)
      this.say('weapon', h);
      return true;
    }
    const k = this.kindOf(h.id);
    if (k !== 'tool' && k !== 'lamp') return false;
    return this.equip(p.selected, k);
  }

  /** ไส้คบไฟในช่องแสง: หมดเฉพาะตอนมืด · มอดแล้วใส่อันสำรองให้ */
  burn(dt: number, dark: boolean) {
    const p = this.p;
    const lamp = p.equip.lamp;
    if (!lamp || !dark) return;
    if (p.held && ITEMS[p.held.id].type === 'light') return;
    if (p.wearLoadout('lamp', dt)) {
      this.version++;
      EventBus.emit('toast', `🔦 ${ITEMS[lamp.id].name}ในช่องแสงมอดดับแล้ว`, '#ef7d57');
      this.fillEmpty('lamp');
    }
  }
}
