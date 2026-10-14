import { api } from './Api';

/**
 * แชทโลก — เรียก chat.get / chat.post ของ backend (ดู backend/apps-script/Code.gs ส่วน "แชทโลก")
 * ข้อความถูกตัดแต่งฝั่งเซิร์ฟเวอร์ (ตัดอักขระควบคุม/<> · ≤ 140 ตัว · คำหยาบ → *) และจำกัด 1 ข้อความ/2 วิ · 20/นาที ต่อบัญชี
 */
export const CHAT_MAX_LEN = 140;

export interface ChatMsg {
  id: string;
  /** เวลาเซิร์ฟเวอร์ (ms) — ไม่ซ้ำและเพิ่มขึ้นเสมอ ใช้เป็น `since` ได้ */
  time: number;
  accountId: string;
  name: string;
  text: string;
  channel: string;
}

/** ข้อความที่ใหม่กว่า since (0 = 50 ข้อความล่าสุด) เก่า→ใหม่ · serverTime ไว้เทียบนาฬิกาเครื่อง */
export function chatGet(since: number) {
  return api<{ messages: ChatMsg[]; serverTime: number; latest: number }>('chat.get', { since }, { timeout: 15000, retries: 1 });
}

export function chatPost(text: string, playerName: string) {
  return api<{ message: ChatMsg }>('chat.post', { text, playerName }, { timeout: 15000 });
}
