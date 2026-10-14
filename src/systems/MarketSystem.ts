import { RNG } from '../core/RNG';
import { ITEMS } from '../data/items';
import type { Inventory } from '../components/Inventory';
import type { Wallet } from '../components/Wallet';

export interface Offer {
  item: string;
  qty: number;
  price: number;
  hot?: boolean;
}

const BUY_POOL = [
  'enhance_stone', 'box_wood', 'fishing_rod', 'gear', 'coal', 'iron_ore',
  'carrot_seed', 'tomato_seed', 'pumpkin_seed', 'bandage', 'arrow', 'bow', 'torch', 'iron_ingot', 'leather_armor',
  'fur_coat', 'iron_pickaxe', 'cooked_meat', 'veggie_stew', 'rope', 'iron_sword', 'hide',
  'herbal_medicine', 'clean_water', 'flatbread',
];
const SELL_POOL = [
  'fish', 'golden_fish', 'slime_gel', 'bat_wing', 'crab_shell', 'bone', 'yeti_fur', 'meteorite',
  'wood', 'stone', 'fiber', 'hide', 'iron_ore', 'iron_ingot', 'gold_ore', 'gold_ingot', 'crystal',
  'carrot', 'tomato', 'pumpkin', 'raw_meat', 'cactus_fruit', 'berry', 'cooked_meat', 'pumpkin_pie', 'veggie_stew',
  'feather', 'antler', 'pearl', 'shark_tooth', 'turtle_shell',
  // ของจากการเก็บทุกอย่าง/เกาะกิจกรรม
  'shell', 'petals', 'scrap_metal', 'cloth', 'obsidian', 'crystal_shard', 'herb', 'mango', 'dragonfruit', 'coconut',
];

/**
 * ร้านค้าทางไกล (📦 ท่าส่งของบนเกาะบ้าน) — ใช้ได้ตลอดแม้เกาะกลางปิด แต่ราคาแย่กว่า
 * ซื้อ ×1.25 (ปัดขึ้น) · ขาย ×0.8 (ปัดลง ขั้นต่ำ 1) · แผงผู้เล่น (ซื้อ/วางขาย) ค่าส่ง 10% ของราคา (ขั้นต่ำ 1)
 */
export const REMOTE = { buy: 1.25, sell: 0.8, fee: 0.1 } as const;
/** ของที่พ่อค้าขายเฉพาะเกาะกลาง (วัตถุดิบอัพเกรด/กล่อง) — ทางไกลไม่มี (รายการ ★ ราคาพิเศษ ก็เฉพาะเกาะกลาง) */
export const CENTER_ONLY_BUY: ReadonlySet<string> = new Set(['enhance_stone', 'box_wood']);
/** ร้านเพชร: แลกเพชร/กล่องทองใช้ทางไกลได้ราคาเดิม · กล่องเพชรเฉพาะเกาะกลาง */
export const CENTER_ONLY_GEM: ReadonlySet<string> = new Set(['box_legend']);

/** ราคาตามช่องทาง (คิดที่นี่ที่เดียว) — เกาะกลาง = ราคาเดิม */
export function priceFor(price: number, side: 'buy' | 'sell', remote: boolean): number {
  if (!remote) return price;
  return side === 'buy' ? Math.ceil(price * REMOTE.buy) : Math.max(1, Math.floor(price * REMOTE.sell));
}

/** ค่าส่งแผงผู้เล่นทางไกล (หักเหรียญเพิ่มฝั่งเครื่องเรา — เซิร์ฟเวอร์ตรวจเหรียญตอนเซฟอยู่แล้ว) */
export function remoteFee(price: number, remote: boolean): number {
  return remote ? Math.max(1, Math.ceil(price * REMOTE.fee)) : 0;
}

/**
 * ตลาดกลาง: ราคาซื้อ/ขายสุ่มใหม่ทุกวัน (seed เดียวกัน → ราคาเหมือนกันทุกคนในวันนั้น)
 * ภายหลังต่อเป็นระบบเทรดระหว่างผู้เล่นผ่านเซิร์ฟเวอร์ได้โดยใช้ Offer เดียวกัน
 */
export class MarketSystem {
  buy: Offer[] = [];
  sell: Offer[] = [];
  day = 0;
  trades = 0;

  refresh(seed: number, day: number) {
    this.day = day;
    const rng = new RNG(seed * 31 + day * 7919);
    const pick = (pool: string[], n: number) => {
      const copy = [...pool];
      const out: string[] = [];
      while (out.length < n && copy.length) out.push(copy.splice(rng.int(0, copy.length - 1), 1)[0]);
      return out;
    };
    this.buy = pick(BUY_POOL, 8).map((item) => {
      const v = ITEMS[item].value;
      const qty = v <= 2 ? 5 : 1;
      return { item, qty, price: Math.max(1, Math.round(v * qty * rng.range(1.1, 1.7))) };
    });
    this.sell = pick(SELL_POOL, 8).map((item) => {
      const v = ITEMS[item].value;
      const qty = v <= 2 ? 10 : v <= 6 ? 3 : 1;
      return { item, qty, price: Math.max(1, Math.round(v * qty * rng.range(0.55, 1.05))) };
    });
    const hot = this.sell[rng.int(0, this.sell.length - 1)];
    hot.price *= 2;
    hot.hot = true;
  }

  /** รายการที่เห็นตามช่องทาง — ทางไกล: ตัดของเฉพาะเกาะกลาง + ปรับราคา (สำเนา ไม่แก้ของเดิม) */
  offers(side: 'buy' | 'sell', remote: boolean): Offer[] {
    const list = side === 'buy' ? this.buy : this.sell;
    if (!remote) return list;
    return list
      .filter((o) => (side === 'buy' ? !CENTER_ONLY_BUY.has(o.item) : !o.hot))
      .map((o) => ({ ...o, price: priceFor(o.price, side, true) }));
  }

  /** ซื้อของด้วยเหรียญ — คืนข้อความ error หรือ null */
  doBuy(o: Offer, inv: Inventory, wallet: Wallet): string | null {
    if (wallet.coins < o.price) return 'เหรียญไม่พอ';
    const left = inv.add(o.item, o.qty);
    if (left > 0) {
      inv.remove(o.item, o.qty - left);
      return 'กระเป๋าเต็ม';
    }
    wallet.spend(o.price);
    this.trades++;
    return null;
  }

  doSell(o: Offer, inv: Inventory, wallet: Wallet): string | null {
    if (inv.count(o.item) < o.qty) return `ต้องมี ${ITEMS[o.item].name} ${o.qty} ชิ้น`;
    inv.remove(o.item, o.qty);
    wallet.add(o.price);
    this.trades++;
    return null;
  }
}
