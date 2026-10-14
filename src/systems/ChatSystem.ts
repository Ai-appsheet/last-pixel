import type Phaser from 'phaser';
import { getAccounts } from '../core/AccountService';
import { apiEnabled, onNetStatus } from '../core/backend/Api';
import { CHAT_MAX_LEN, chatGet, chatPost, type ChatMsg } from '../core/backend/Chat';
import { EventBus } from '../core/EventBus';
import { getRoomService, WORLD_ROOM } from '../core/RoomService';
import { MOBS } from '../data/mobs';

/**
 * แชทโลก (ฝั่ง client) — ตัวเดียวทั้งเกม ChatPanel (UIScene) เป็นคน start/stop
 *  - โพล chat.get ทุก 6 วิ ขณะอยู่ในเกมและแท็บมองเห็น · แท็บถูกซ่อน/เกมหยุด → 20 วิ · เรียกไม่ติด → 'offline' แล้วลองใหม่ทุก 20 วิ (หรือทันทีเมื่อ Api กลับมา online)
 *  - ไม่ได้ตั้ง API URL → 'off' (UI แสดง "แชทต้องออนไลน์")
 *  - รวมข้อความตาม id เก็บ 100 ข้อความล่าสุด · ประวัติอยู่ข้ามการ restart ของ UIScene (เปลี่ยนบัญชีค่อยล้าง)
 *  - EventBus: 'chat:message' (line: ChatLine, fresh: boolean — false = ประวัติรอบแรก) · 'chat:status' (ChatStatus)
 *  - ข้อความระบบ 📣 (คนเข้าโลก สัตว์ในตำนานโผล่ ล้มบอส ตายในเขตผจญภัย) สร้างในเครื่องจาก EventBus ไม่ผ่านเซิร์ฟเวอร์ — เห็นเฉพาะเรา
 */
export interface ChatLine {
  id: string;
  /** เวลาเซิร์ฟเวอร์ (ms) · ข้อความระบบใช้เวลาเครื่อง + ส่วนต่างนาฬิกาที่วัดจาก serverTime */
  time: number;
  name: string;
  text: string;
  mine: boolean;
  system: boolean;
}
export type ChatStatus = 'off' | 'connecting' | 'online' | 'offline';

const KEEP = 100;
const POLL_MS = 6000;
const POLL_SLOW_MS = 20000;
const SEND_GAP_MS = 2000;

class ChatSystem {
  private lines: ChatLine[] = [];
  private ids = new Set<string>();
  private since = 0;
  /** serverTime - Date.now() */
  private offset = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scene: Phaser.Scene | null = null;
  private status: ChatStatus = apiEnabled() ? 'connecting' : 'off';
  private first = true;
  private lastSend = 0;
  private myId = '';
  private me = '';
  private known: Set<string> | null = null;
  private sysN = 0;
  private off: (() => void)[] = [];

  get state() {
    return this.status;
  }

  all(): readonly ChatLine[] {
    return this.lines;
  }

  /** เริ่มโพล (UIScene สร้างแผงแชทแล้วเรียก) — เรียกซ้ำได้ · me = ชื่อในเกมที่ใช้ส่ง */
  start(scene: Phaser.Scene, me: string) {
    this.stop();
    this.scene = scene;
    this.me = me;
    const id = getAccounts().current()?.id ?? '';
    if (id !== this.myId) {
      this.myId = id;
      this.lines = [];
      this.ids.clear();
      this.since = 0;
      this.first = true;
      this.known = null;
    }
    const on = (ev: string, fn: (...a: never[]) => void) => {
      EventBus.on(ev, fn);
      this.off.push(() => EventBus.off(ev, fn));
    };
    on('legend:appear', (mobId: string) => this.system(`${MOBS[mobId]?.name ?? mobId} ปรากฏตัวในโลกแล้ว!`));
    on('mob:killed', (mobId: string) => {
      const d = MOBS[mobId];
      if (d?.ai === 'boss') this.system(`${this.me} ล้ม${d.name}สำเร็จ`);
    });
    on('ui:gameover', (r: { cause: string; adventure?: boolean }) => r.adventure && this.system(`${this.me} ตายในเขตผจญภัย — ${r.cause}`));
    // ประกาศ 📣 จากระบบอื่น (กิจกรรมตามเวลาจริง ฯลฯ)
    on('chat:system', (text: string) => this.system(text));
    if (!apiEnabled()) {
      this.setStatus('off');
      return;
    }
    const vis = () => document.visibilityState === 'visible' && this.scene && this.schedule(400);
    document.addEventListener('visibilitychange', vis);
    this.off.push(() => document.removeEventListener('visibilitychange', vis));
    this.off.push(onNetStatus((s) => s === 'online' && this.status === 'offline' && this.schedule(400)));
    this.schedule(this.first ? 200 : 1500);
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.scene = null;
    this.off.forEach((f) => f());
    this.off = [];
  }

  /** ส่งข้อความ — คืน null ถ้าสำเร็จ หรือข้อความ error (ไทย) */
  async send(raw: string): Promise<string | null> {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return 'พิมพ์ข้อความก่อนส่ง';
    if (text.length > CHAT_MAX_LEN) return `ข้อความยาวเกิน ${CHAT_MAX_LEN} ตัวอักษร`;
    if (this.status === 'off') return 'แชทต้องออนไลน์';
    const now = Date.now();
    if (now - this.lastSend < SEND_GAP_MS) return 'รอสักครู่ก่อนส่งข้อความถัดไป';
    this.lastSend = now;
    const r = await chatPost(text, this.me);
    if (!r.ok) {
      if (r.code !== 'rate') this.lastSend = 0;
      if (r.code === 'network' || r.code === 'timeout') this.setStatus('offline');
      return r.error;
    }
    // ไม่เลื่อน since ตามข้อความตัวเอง (ข้อความคนอื่นที่เก่ากว่าแต่ยังไม่ดึงจะหาย) — รอบโพลถัดไปจัดการเอง
    this.add(this.toLine(r.message), true);
    this.setStatus('online');
    if (this.scene) this.schedule(1500);
    return null;
  }

  /** ข้อความระบบในเครื่อง (📣 นำหน้า) */
  system(text: string) {
    this.add({ id: `sys${++this.sysN}`, time: Date.now() + this.offset, name: '', text: `📣 ${text}`, mine: false, system: true }, true);
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.poll(), ms);
  }

  private hidden() {
    return document.visibilityState === 'hidden' || !!this.scene?.scene.isPaused('GameScene');
  }

  private async poll() {
    this.timer = null;
    if (!this.scene) return;
    const r = await chatGet(this.since);
    if (!this.scene) return;
    if (!r.ok) {
      if (r.code === 'auth' || r.code === 'disabled') return this.setStatus('off');
      this.setStatus('offline');
      this.schedule(POLL_SLOW_MS);
      return;
    }
    this.offset = (Number(r.serverTime) || Date.now()) - Date.now();
    const fresh = !this.first;
    for (const m of r.messages) {
      this.add(this.toLine(m), fresh);
      if (m.time > this.since) this.since = m.time;
    }
    this.first = false;
    this.setStatus('online');
    this.announceJoins();
    this.schedule(this.hidden() ? POLL_SLOW_MS : POLL_MS);
  }

  /** ผู้เล่นจริงที่เพิ่งโผล่ในแผนที่โลก (เทียบกับรอบก่อน) → ข้อความระบบ */
  private announceJoins() {
    const real = getRoomService().getRoom(WORLD_ROOM)?.players.filter((p) => p.real && p.id !== this.myId) ?? [];
    if (!this.known) {
      this.known = new Set(real.map((p) => p.id));
      return;
    }
    for (const p of real) {
      if (this.known.has(p.id)) continue;
      this.known.add(p.id);
      if (p.name) this.system(`${p.name} เข้าสู่โลกแล้ว`);
    }
  }

  private toLine(m: ChatMsg): ChatLine {
    return { id: m.id, time: m.time, name: m.name || 'ผู้รอดชีวิต', text: m.text, mine: m.accountId === this.myId, system: false };
  }

  private add(line: ChatLine, fresh: boolean) {
    if (this.ids.has(line.id)) return;
    this.ids.add(line.id);
    // ส่วนใหญ่ต่อท้าย — แทรกตามเวลาถ้าช้ากว่าปกติ
    let i = this.lines.length;
    while (i > 0 && this.lines[i - 1].time > line.time) i--;
    this.lines.splice(i, 0, line);
    while (this.lines.length > KEEP) this.ids.delete(this.lines.shift()!.id);
    EventBus.emit('chat:message', line, fresh);
  }

  private setStatus(s: ChatStatus) {
    if (s === this.status) return;
    this.status = s;
    EventBus.emit('chat:status', s);
  }
}

export const chat = new ChatSystem();
