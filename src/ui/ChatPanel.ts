import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { CHAT_MAX_LEN } from '../core/backend/Chat';
import { thaiWrap } from '../scenes/catalog/ScrollView';
import { chat, type ChatLine, type ChatStatus } from '../systems/ChatSystem';
import { displayScale, GH as H } from './layout';
import { COLORS, FONT, panel, txt } from './widgets';

/**
 * แผงแชทโลก (UIScene) — รายการข้อความเลื่อนได้ (ล้อเมาส์/ลาก) + ช่องพิมพ์ (DOM <input> เหมือนฟอร์มบัญชี) + ปุ่มส่ง + ป้ายจำนวนที่ยังไม่อ่าน + พับ/กาง
 *  - คอม: มุมซ้ายล่างเหนือ hotbar (ซ้ายของ hotbar) · พับเป็นแถบ "💬 N ข้อความใหม่" · Enter (ไม่มีหน้าต่างเปิด) = พิมพ์ · Esc = ปิดช่องพิมพ์
 *  - จอเล็ก: ปุ่ม 💬 ใต้แผงสถานะ (พับไว้ก่อน) · กางแล้วอยู่ซ้ายบนใต้แผงสถานะ ไม่ทับจอยสติก
 *  - รูปแบบ `[เวลา] ชื่อ: ข้อความ` เวลาไทย (Asia/Bangkok) · ชื่อสีทอง (กดชื่อ = เติม "@ชื่อ ") · ข้อความตัวเองมีแถบไฮไลต์ · ข้อความระบบ 📣 สีจาง
 *  - ปุ่มที่กดในช่องพิมพ์ไม่ส่งต่อให้ Phaser (stopPropagation) → เดิน/คีย์ลัดไม่ทำงานขณะพิมพ์
 */
export interface ChatPanelOpts {
  compact: boolean;
  /** ตัวคูณ HUD (ui/layout.ts hudScale) ใช้คำนวณขอบล่างของแผงสถานะ */
  k: number;
  /** ชื่อในเกม (ใช้ส่ง) */
  me: string;
  toast: (text: string, color?: string) => void;
}

interface Row {
  line: ChatLine;
  head: Phaser.GameObjects.Text | null;
  body: Phaser.GameObjects.Text;
  hl: Phaser.GameObjects.Rectangle | null;
  h: number;
}

const COLLAPSED_KEY = 'lastpixel.chat.collapsed';
const PAD = 8;
const TITLE_H = 22;
const KEEP = 100;
const bkk = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });

export class ChatPanel {
  private root: Phaser.GameObjects.Container;
  private pill: Phaser.GameObjects.Container;
  private pillBg: Phaser.GameObjects.NineSlice;
  private pillT: Phaser.GameObjects.Text;
  private list: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private statusT: Phaser.GameObjects.Text;
  private input: HTMLInputElement;
  private dom: Phaser.GameObjects.DOMElement;
  private rows: Row[] = [];
  private unread = 0;
  private collapsed: boolean;
  private scroll = 0;
  private contentH = 0;
  private stick = true;
  private sending = false;
  private paused = false;
  private readonly x: number;
  private readonly y: number;
  private readonly w: number;
  private readonly h: number;
  private readonly listTop = TITLE_H + 4;
  private readonly listH: number;
  private readonly fs: number;
  private readonly off: (() => void)[] = [];

  constructor(private scene: Phaser.Scene, private opts: ChatPanelOpts) {
    const c = opts.compact;
    this.fs = c ? 14 : 12;
    this.w = c ? 300 : 256;
    this.h = c ? 168 : 180;
    this.x = 8;
    // จอเล็ก: ใต้แผงสถานะ+ชิปพับ (136 × k) · คอม: ชิดล่าง
    this.y = c ? Math.round(136 * opts.k + 6) : H - 8 - this.h;
    // ช่องพิมพ์ ≥ 16px บนจอจริง (DOM ถูกย่อตามแคนวาส → ขยายชดเชย กัน iOS ซูมเอง)
    const inFont = Math.min(24, Math.ceil(Math.max(16, 16 / Math.min(1, displayScale(scene)))));
    const inH = inFont + 12;
    this.listH = this.h - this.listTop - inH - PAD - 4;
    const listW = this.w - PAD * 2;
    try {
      const saved = localStorage.getItem(COLLAPSED_KEY);
      this.collapsed = saved === null ? c : saved === '1';
    } catch {
      this.collapsed = c;
    }

    // ---- แผงกาง ----
    this.root = scene.add.container(this.x, this.y).setDepth(6);
    const bg = panel(scene, 0, 0, this.w, this.h, 'ui_panel_dark').setInteractive();
    const title = txt(scene, PAD, 4, '💬 แชทโลก', c ? 13 : 12, COLORS.gold);
    this.statusT = txt(scene, this.w - 30, 6, '', c ? 11 : 10, COLORS.dim).setOrigin(1, 0);
    const fold = txt(scene, this.w - 12, 3, '▾', 16, COLORS.gold).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    fold.on('pointerdown', () => this.setCollapsed(true));
    this.list = scene.add.container(PAD, this.listTop);
    this.maskG = scene.make.graphics({ x: 0, y: 0 }, false).fillStyle(0xffffff).fillRect(this.x + PAD, this.y + this.listTop, listW, this.listH);
    this.list.setMask(this.maskG.createGeometryMask());
    const inW = listW - 36;
    const send = txt(scene, this.w - PAD, this.h - PAD - inH / 2, '➤', c ? 18 : 16, COLORS.gold).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
    send.on('pointerdown', () => void this.send());
    this.root.add([bg, title, this.statusT, fold, this.list, send]);

    // ---- ช่องพิมพ์ (DOM) ----
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = CHAT_MAX_LEN;
    el.placeholder = c ? 'พิมพ์ข้อความ…' : 'พิมพ์ข้อความ… (Enter ส่ง · Esc ปิด)';
    el.name = 'chat';
    el.spellcheck = false;
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('enterkeyhint', 'send');
    Object.assign(el.style, {
      width: `${inW}px`, height: `${inH}px`, fontSize: `${inFont}px`, fontFamily: FONT, fontWeight: '500', padding: '0 8px', borderRadius: '8px',
      border: '2px solid #41a6f6', background: '#0b0d1f', color: '#f4f4f4', outline: 'none', boxSizing: 'border-box',
    });
    // ปุ่มในช่องพิมพ์ไม่ไปถึง Phaser (ฟังที่ window) → ไม่เดิน/ไม่เปิดหน้าต่างขณะพิมพ์
    el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') void this.send();
      else if (e.key === 'Escape') el.blur();
    });
    el.addEventListener('keyup', (e) => e.stopPropagation());
    el.addEventListener('focus', () => this.resetKeys());
    el.addEventListener('blur', () => this.resetKeys());
    this.input = el;
    this.dom = scene.add.dom(this.x + PAD + inW / 2, this.y + this.h - PAD - inH / 2, el).setDepth(6);

    // ---- แถบพับ ----
    this.pill = scene.add.container(0, 0).setDepth(6);
    this.pillBg = panel(scene, 0, 0, 60, 26, 'ui_panel_dark').setInteractive({ useHandCursor: true });
    this.pillT = txt(scene, 8, 4, '', c ? 14 : 12, COLORS.gold);
    this.pill.add([this.pillBg, this.pillT]);
    this.pillBg.on('pointerdown', () => {
      Sfx.unlock();
      this.setCollapsed(false);
    });

    // ---- เลื่อน: ล้อเมาส์ / ลาก ----
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.collapsed && this.contains(p.x, p.y)) this.scrollBy(dy > 0 ? 36 : -36);
    });
    let drag: { y: number; s: number } | null = null;
    bg.on('pointerdown', (p: Phaser.Input.Pointer) => (drag = { y: p.y, s: this.scroll }));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (drag && p.isDown) this.scrollTo(drag.s - (p.y - drag.y));
    });
    const endDrag = () => (drag = null);
    scene.input.on('pointerup', endDrag);
    scene.input.on('pointerupoutside', endDrag);

    // ---- ข้อความ ----
    for (const l of chat.all()) this.addRow(l);
    this.relayout();
    const onMsg = (l: ChatLine, fresh: boolean) => {
      this.addRow(l);
      this.relayout();
      if (fresh && !l.mine && (this.collapsed || this.paused)) {
        this.unread++;
        this.renderPill();
      }
    };
    const onStatus = (s: ChatStatus) => this.renderStatus(s);
    EventBus.on('chat:message', onMsg);
    EventBus.on('chat:status', onStatus);
    this.off.push(() => EventBus.off('chat:message', onMsg), () => EventBus.off('chat:status', onStatus));
    scene.events.on('update', this.tick, this);
    scene.events.once('shutdown', () => this.destroy());

    chat.start(scene, opts.me);
    this.renderStatus(chat.state);
    this.setCollapsed(this.collapsed, false);
  }

  /** จุดบนจออยู่บนแผง/แถบพับไหม (UIScene.isPointerOverUI กันคลิกทะลุไปโลก) */
  contains(x: number, y: number) {
    if (this.collapsed) return this.pill.visible && x >= this.pill.x && x <= this.pill.x + this.pillBg.width && y >= this.pill.y && y <= this.pill.y + this.pillBg.height;
    return x >= this.x && x <= this.x + this.w && y >= this.y && y <= this.y + this.h;
  }

  /** กางแผงแล้วโฟกัสช่องพิมพ์ (ปุ่ม Enter) */
  focus() {
    if (chat.state === 'off') return this.opts.toast('แชทต้องออนไลน์ — ตั้งค่าเซิร์ฟเวอร์ก่อน', COLORS.bad);
    if (this.collapsed) this.setCollapsed(false);
    if (this.paused) return;
    this.input.focus();
  }

  private setCollapsed(v: boolean, sound = true) {
    this.collapsed = v;
    if (sound) Sfx.play('click');
    try {
      localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0');
    } catch {
      /* ignore */
    }
    this.root.setVisible(!v);
    this.dom.setVisible(!v && !this.paused);
    this.pill.setVisible(v);
    if (v) this.input.blur();
    else {
      this.unread = 0;
      this.stick = true;
      this.relayout();
    }
    this.renderPill();
  }

  private renderPill() {
    const c = this.opts.compact;
    const n = this.unread;
    this.pillT.setText(c ? `💬${n ? ` ${n}` : ''}` : n ? `💬 ${n} ข้อความใหม่` : '💬 แชท').setColor(n ? COLORS.good : COLORS.gold);
    const w = Math.round(this.pillT.width + 16);
    const h = c ? 28 : 26;
    this.pillBg.setSize(w, h);
    // จอเล็ก: ขวาของปุ่ม "▾ สถานะ" ใต้แผงสถานะ (เหนือแผงปักหมุด/จอยสติก) · คอม: มุมซ้ายล่าง
    if (c) this.pill.setPosition(Math.round(96 * this.opts.k), Math.round(108 * this.opts.k) - 2);
    else this.pill.setPosition(this.x, H - 8 - h);
  }

  private renderStatus(s: ChatStatus) {
    const label: Record<ChatStatus, string> = { off: 'แชทต้องออนไลน์', connecting: 'กำลังเชื่อมต่อ…', online: '', offline: 'ออฟไลน์ — รอเชื่อมต่อใหม่' };
    this.statusT.setText(label[s]).setColor(s === 'off' || s === 'offline' ? COLORS.bad : COLORS.dim);
    this.input.disabled = s === 'off' || this.sending;
    if (s === 'off') this.input.placeholder = 'แชทต้องออนไลน์';
  }

  private async send() {
    if (this.sending) return;
    const text = this.input.value;
    if (!text.trim()) return this.input.blur();
    this.sending = true;
    this.input.disabled = true;
    const prev = this.statusT.text;
    this.statusT.setText('กำลังส่ง…').setColor(COLORS.dim);
    const err = await chat.send(text);
    this.sending = false;
    if (!this.scene.sys.isActive()) return;
    this.input.disabled = chat.state === 'off';
    this.statusT.setText(err ? prev : '');
    if (err) this.opts.toast(err, COLORS.bad);
    else {
      this.input.value = '';
      this.stick = true;
      this.relayout();
    }
    if (!this.collapsed && !this.paused) this.input.focus();
  }

  /** เคลียร์สถานะปุ่มของ Phaser ตอนสลับโฟกัสเข้า/ออกช่องพิมพ์ (ปุ่มที่กดค้างอยู่จะได้ไม่ค้าง) */
  private resetKeys() {
    this.scene.input.keyboard?.resetKeys();
    this.scene.scene.get('GameScene')?.input.keyboard?.resetKeys();
  }

  private tick() {
    // เกมหยุด (เมนู/ป๊อปอัป) → ซ่อนช่องพิมพ์ (DOM ลอยเหนือทุกอย่าง) และเลิกพิมพ์
    const paused = this.scene.scene.isPaused('GameScene');
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) this.input.blur();
    this.dom.setVisible(!paused && !this.collapsed);
  }

  private addRow(l: ChatLine) {
    const s = this.scene;
    const listW = this.w - PAD * 2;
    let head: Phaser.GameObjects.Text | null = null;
    let pad = '';
    if (!l.system) {
      head = txt(s, 0, 0, `[${bkk.format(new Date(l.time))}] ${l.name}:`, this.fs, COLORS.gold).setInteractive({ useHandCursor: true });
      head.on('pointerdown', () => {
        if (this.paused) return;
        this.input.value = `@${l.name} ${this.input.value.replace(/^@\S+\s*/, '')}`.slice(0, CHAT_MAX_LEN);
        this.input.focus();
      });
      // ดันบรรทัดแรกของข้อความให้พ้นหัว (ชื่อ) ด้วยช่องว่าง — บรรทัดถัดไปชิดซ้ายตามปกติ
      const sp = head.context.measureText(' ').width || 3;
      pad = ' '.repeat(Math.ceil((head.width + 4) / sp));
    }
    const body = txt(s, 0, 0, pad + l.text, this.fs, l.system ? COLORS.dim : COLORS.text, { wordWrap: { callback: thaiWrap(listW), callbackScope: null } });
    const h = Math.ceil(body.height) + 2;
    const hl = l.mine ? s.add.rectangle(-2, 0, listW + 4, h, 0xffcd75, 0.14).setOrigin(0) : null;
    const objs: Phaser.GameObjects.GameObject[] = [];
    if (hl) objs.push(hl);
    objs.push(body);
    if (head) objs.push(head);
    this.list.add(objs);
    // แทรกตามเวลา (ส่วนใหญ่ต่อท้าย)
    let i = this.rows.length;
    while (i > 0 && this.rows[i - 1].line.time > l.time) i--;
    this.rows.splice(i, 0, { line: l, head, body, hl, h });
    while (this.rows.length > KEEP) {
      const r = this.rows.shift()!;
      r.head?.destroy();
      r.body.destroy();
      r.hl?.destroy();
    }
  }

  private relayout() {
    let y = 0;
    for (const r of this.rows) {
      r.head?.setPosition(0, y);
      r.body.setPosition(0, y);
      r.hl?.setPosition(-2, y);
      y += r.h;
    }
    this.contentH = y;
    if (this.stick) this.scroll = Math.max(0, this.contentH - this.listH);
    this.list.setY(this.listTop - this.scroll);
  }

  private scrollBy(d: number) {
    this.scrollTo(this.scroll + d);
  }

  private scrollTo(v: number) {
    const max = Math.max(0, this.contentH - this.listH);
    this.scroll = Phaser.Math.Clamp(Math.round(v), 0, max);
    this.stick = this.scroll >= max - 1;
    this.list.setY(this.listTop - this.scroll);
  }

  private destroy() {
    chat.stop();
    this.off.forEach((f) => f());
    this.scene.events.off('update', this.tick, this);
    this.dom.destroy();
    this.maskG.destroy();
    this.root.destroy();
    this.pill.destroy();
  }
}
