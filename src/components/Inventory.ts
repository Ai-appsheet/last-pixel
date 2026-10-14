import { ITEMS } from '../data/items';

export interface Slot {
  id: string;
  qty: number;
  /** ความทนทานที่เหลือ (เฉพาะเครื่องมือ/คบไฟ) */
  dur?: number;
  /** เลเวลอัพเกรด − 1 (0..9 = Lv1..Lv10) — ดู data/upgrade.ts */
  plus?: number;
}

export const HOTBAR_SIZE = 8;
export const BAG_SIZE = 20;

/** กระเป๋า: ช่อง 0–7 = hotbar, ที่เหลือ = กระเป๋า (ขนาดตามตัวละคร) */
export class Inventory {
  slots: (Slot | null)[];
  /** creative: ไม่ใช้ของจริง */
  infinite = false;

  /** ช่องกระเป๋าพื้นฐาน (ไม่รวม hotbar) — กระเป๋าเป้เพิ่มได้ */
  readonly baseSize: number;

  constructor(bagSize = BAG_SIZE) {
    this.baseSize = bagSize;
    this.slots = new Array(HOTBAR_SIZE + bagSize).fill(null);
  }

  get bagSize() {
    return this.slots.length - HOTBAR_SIZE;
  }

  /** ขยาย/ลดช่องกระเป๋า (ลดได้เฉพาะช่องท้ายที่ว่าง — ของที่ล้นจะถูกคืนเป็นรายการ) */
  resize(bagSize: number): Slot[] {
    const want = HOTBAR_SIZE + Math.max(0, bagSize);
    const spill: Slot[] = [];
    while (this.slots.length < want) this.slots.push(null);
    while (this.slots.length > want) {
      const s = this.slots.pop();
      if (s) spill.push(s);
    }
    // ของที่ล้น ย้ายไปช่องว่างที่เหลือ
    for (const s of [...spill]) {
      const i = this.slots.findIndex((x) => x === null);
      if (i < 0) break;
      this.slots[i] = s;
      spill.splice(spill.indexOf(s), 1);
    }
    this.version++;
    return spill;
  }

  /** ช่องท้ายสุดที่ไม่ว่าง (ใช้เช็กก่อนถอดกระเป๋าเป้) */
  usedFrom(index: number): number {
    let n = 0;
    for (let i = index; i < this.slots.length; i++) if (this.slots[i]) n++;
    return n;
  }
  /** เพิ่มทุกครั้งที่ของเปลี่ยน ให้ UI รู้ว่าต้องวาดใหม่ */
  version = 0;

  private maxDur(id: string): number | undefined {
    const def = ITEMS[id];
    return def.tool?.durability ?? def.light?.durability ?? def.equip?.durability ?? def.ranged?.durability;
  }

  /** เพิ่มของ คืนจำนวนที่ใส่ไม่ได้ (กระเป๋าเต็ม) */
  add(id: string, qty: number): number {
    const def = ITEMS[id];
    let left = qty;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s && s.id === id && s.qty < def.stack && !s.plus) {
        const n = Math.min(def.stack - s.qty, left);
        s.qty += n;
        left -= n;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const n = Math.min(def.stack, left);
      this.slots[i] = { id, qty: n, dur: this.maxDur(id) };
      left -= n;
    }
    this.version++;
    return left;
  }

  /** ใส่ของทั้งช่อง (คงเลเวลอัพเกรด/ความทนทาน) — คืน false ถ้าเต็ม */
  addSlot(slot: Slot): boolean {
    if (!slot.plus && slot.dur === undefined) return this.add(slot.id, slot.qty) === 0;
    const i = this.slots.findIndex((x) => x === null);
    if (i < 0) return false;
    this.slots[i] = { ...slot };
    this.version++;
    return true;
  }

  count(id: string): number {
    if (this.infinite && id !== 'coin') return 999;
    return this.slots.reduce((sum, s) => sum + (s?.id === id ? s.qty : 0), 0);
  }

  /** เอาออก (เริ่มจากกระเป๋าก่อน hotbar) คืน true ถ้าสำเร็จ */
  remove(id: string, qty: number): boolean {
    if (this.infinite && id !== 'coin') return true;
    if (this.count(id) < qty) return false;
    let left = qty;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const n = Math.min(s.qty, left);
      s.qty -= n;
      left -= n;
      if (s.qty <= 0) this.slots[i] = null;
    }
    this.version++;
    return true;
  }

  consumeAt(index: number, qty = 1) {
    if (this.infinite) return;
    const s = this.slots[index];
    if (!s) return;
    s.qty -= qty;
    if (s.qty <= 0) this.slots[index] = null;
    this.version++;
  }

  /** ลดความทนทาน — พังแล้วหายไป คืน true ถ้าพัง */
  wear(index: number, amount: number): boolean {
    if (this.infinite) return false;
    const s = this.slots[index];
    if (!s || s.dur === undefined) return false;
    s.dur -= amount;
    this.version++;
    if (s.dur <= 0) {
      this.slots[index] = null;
      return true;
    }
    return false;
  }

  /** สลับ/รวมช่อง (ใช้ตอนลากของใน UI) */
  moveOrMerge(from: number, to: number) {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (a && b && a.id === b.id && b.dur === undefined && !a.plus && !b.plus) {
      const stack = ITEMS[a.id].stack;
      const n = Math.min(stack - b.qty, a.qty);
      b.qty += n;
      a.qty -= n;
      if (a.qty <= 0) this.slots[from] = null;
    } else {
      this.slots[from] = b;
      this.slots[to] = a;
    }
    this.version++;
  }

  /** แบ่งครึ่งไปช่องว่าง */
  split(index: number) {
    const s = this.slots[index];
    if (!s || s.qty < 2) return;
    const empty = this.slots.findIndex((x) => x === null);
    if (empty < 0) return;
    const half = Math.floor(s.qty / 2);
    s.qty -= half;
    this.slots[empty] = { id: s.id, qty: half };
    this.version++;
  }

  /** ส่งออก/นำเข้าสำหรับเซฟ */
  serialize(): (Slot | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  load(slots: (Slot | null)[]) {
    if (slots.length > this.slots.length) this.resize(slots.length - HOTBAR_SIZE);
    for (let i = 0; i < this.slots.length; i++) this.slots[i] = slots[i] ? { ...slots[i]! } : null;
    this.version++;
  }
}
