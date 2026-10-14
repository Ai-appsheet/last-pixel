import { EventBus } from '../core/EventBus';

/**
 * กระเป๋าเงิน (แยกจากกระเป๋าของ ไม่กินช่อง)
 *   coins = เหรียญทอง — เงินหลัก (ขายของ มอนสเตอร์ ภารกิจ รายวัน)
 *   gems  = เพชร — เงินหายาก (บอส กล่องเพชร ความสำเร็จ) ใช้ซื้อของพิเศษ/แลกเป็นเหรียญ
 */
export class Wallet {
  coins = 0;
  gems = 0;
  /** ภาษีตลาดเกาะกลาง */
  static readonly TAX = 0.05;
  static readonly GEM_RATE = 100;

  add(coins: number, gems = 0) {
    this.coins += Math.round(coins);
    this.gems += gems;
    EventBus.emit('wallet', this.coins, this.gems);
    EventBus.emit('coins', this.coins);
  }

  spend(coins: number, gems = 0): boolean {
    if (this.coins < coins || this.gems < gems) return false;
    this.coins -= Math.round(coins);
    this.gems -= gems;
    EventBus.emit('wallet', this.coins, this.gems);
    return true;
  }
}
