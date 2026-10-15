import { EventBus } from '../core/EventBus';
import { INF_MONEY } from '../config/allItems';

/**
 * กระเป๋าเงิน (แยกจากกระเป๋าของ ไม่กินช่อง)
 *   coins = เหรียญทอง — เงินหลัก (ขายของ มอนสเตอร์ ภารกิจ รายวัน)
 *   gems  = เพชร — เงินหายาก (บอส กล่องเพชร ความสำเร็จ) ใช้ซื้อของพิเศษ/แลกเป็นเหรียญ
 */
export class Wallet {
  coins = 0;
  gems = 0;
  /** โหมดของครบ: เงินไม่จำกัด — จ่ายได้เสมอ ยอดคงที่ INF_MONEY (หน้าจอแสดง ∞) */
  unlimited = false;
  /** ภาษีตลาดเกาะกลาง */
  static readonly TAX = 0.05;
  static readonly GEM_RATE = 100;

  /** เปิดโหมดเงินไม่จำกัด + เติมยอดเต็ม */
  setUnlimited(on: boolean) {
    this.unlimited = on;
    this.refill();
  }

  /** โหมดไม่จำกัด: ยอดกลับเป็น INF_MONEY เสมอ (โค้ด/เซิร์ฟเวอร์ที่เช็กตัวเลขยังทำงานปกติ) */
  private refill() {
    if (!this.unlimited) return;
    this.coins = INF_MONEY;
    this.gems = INF_MONEY;
  }

  add(coins: number, gems = 0) {
    this.coins += Math.round(coins);
    this.gems += gems;
    this.refill();
    EventBus.emit('wallet', this.coins, this.gems);
    EventBus.emit('coins', this.coins);
  }

  spend(coins: number, gems = 0): boolean {
    if (!this.unlimited && (this.coins < coins || this.gems < gems)) return false;
    this.coins -= Math.round(coins);
    this.gems -= gems;
    this.refill();
    EventBus.emit('wallet', this.coins, this.gems);
    return true;
  }
}
