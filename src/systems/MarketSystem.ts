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
];
const SELL_POOL = [
  'fish', 'golden_fish', 'slime_gel', 'bat_wing', 'crab_shell', 'bone', 'yeti_fur', 'meteorite',
  'wood', 'stone', 'fiber', 'hide', 'iron_ore', 'iron_ingot', 'gold_ore', 'gold_ingot', 'crystal',
  'carrot', 'tomato', 'pumpkin', 'raw_meat', 'cactus_fruit', 'berry', 'cooked_meat', 'pumpkin_pie', 'veggie_stew',
  'feather', 'antler', 'pearl', 'shark_tooth', 'turtle_shell',
];

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
