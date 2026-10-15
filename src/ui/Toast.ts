import Phaser from 'phaser';
import { muteColor } from './retro';
import { txt } from './widgets';

/**
 * 🔔 การแจ้งเตือนแบบเกม "ริบบอน" (toast / แบนเนอร์บาง / การ์ดความสำเร็จ) — ตัวหนังสือเล็ก-บางเสมอ
 *  toast: แถบมืดมีแถบสีด้านซ้าย + ชิปไอคอน · เลื่อนลงเด้งเบาๆ · เส้นเวลาด้านล่างหดลง · แสงวิ่งผ่าน 1 ครั้ง
 *  banner: แถบบางกางออกจากกลางจอ เส้นสีบน/ล่างจางออก + เพชรเม็ดเล็กปลายสองข้าง · อยู่ใต้กอง toast เสมอ
 */
const W = 960;
const GAP = 3;
const LEAD = /^((?:\p{Extended_Pictographic}|[✔✦✓★☆⚠⚔♾⚖✚➜])️?)\s*/u;

/** แยกอีโมจิ/สัญลักษณ์นำหน้าออกมาทำเป็นป้ายไอคอน */
export function splitGlyph(s: string): [string, string] {
  const m = s.match(LEAD);
  return m ? [m[1], s.slice(m[0].length)] : ['', s];
}

export function cssHex(css: string): number {
  const m = /^#([0-9a-f]{6})/i.exec(css);
  return m ? parseInt(m[1], 16) : 0xa9bccb;
}

/** ตัดข้อความยาวให้พอดีความกว้าง (ต่อท้าย …) */
function clip(t: Phaser.GameObjects.Text, maxW: number) {
  const full = t.text;
  let n = full.length;
  while (t.width > maxW && n > 4) t.setText(`${full.slice(0, --n)}…`);
}

const DIMS = new Set(['#a9bccb', '#94b0c2', '#9aa7a4']);

interface Item {
  c: Phaser.GameObjects.Container;
  h: number;
  dead?: boolean;
}

export interface ToastLayout {
  /** สเกล HUD */
  k: number;
  /** y บนสุดของกองแจ้งเตือน (พิกเซลจอ UI) */
  top: number;
  /** จำนวนสูงสุดที่ซ้อน */
  max: number;
  /** y แบนเนอร์ (อย่างน้อย — ถ้ากอง toast สูงกว่าจะขยับลง) */
  bannerY: number;
}

export class ToastHost {
  private items: Item[] = [];

  constructor(private scene: Phaser.Scene, private layout: () => ToastLayout) {}

  /** แจ้งเตือนบรรทัดเดียว (ยาวมาก → 2 บรรทัด) */
  show(text: string, color = '#f4f4f4', life = 2800) {
    const [glyph, body] = splitGlyph(text);
    const c = this.ribbon(glyph, body, color, life);
    this.push(c, life);
    return c;
  }

  /** การ์ด 2 บรรทัด (ความสำเร็จ / รางวัล) — หัวข้อ + คำอธิบาย */
  card(title: string, desc: string, color = '#ffcd75', life = 3400) {
    const [glyph, body] = splitGlyph(title);
    const c = this.ribbon(glyph, body, color, life, desc);
    this.push(c, life);
    return c;
  }

  /** แบนเนอร์บาง (ชื่อเกาะ/ภัย/กล่องฟรี) — ใต้กองแจ้งเตือน */
  banner(name: string, desc: string, color: string) {
    const s = this.scene;
    const L = this.layout();
    const accent = cssHex(color);
    const [glyph, title] = splitGlyph(name);
    // ใต้กองแจ้งเตือนเสมอ (กองสูงขึ้น → แบนเนอร์ต่ำลงตาม ไม่ทับกัน)
    const by = Math.max(L.bannerY, this.stackBottom() + 20 * L.k);
    const c = s.add.container(W / 2, by).setDepth(10).setScale(L.k);
    const head = txt(s, 0, 0, title, 13, muteColor(color), { fontStyle: '500', maxLines: 1 }).setOrigin(0, 0.5);
    const sub = txt(s, 0, 0, desc, 11, '#c9d3dc', { fontStyle: '400', maxLines: 1 }).setOrigin(0, 0.5);
    const maxW = Math.min(W - 60, 600) / L.k;
    clip(sub, maxW - head.width - 60);
    const g = s.add.graphics();
    // แถบมืด + เส้นสีบน/ล่างยาวเลยขอบ (จางออก) + เพชรเม็ดเล็กปลายทั้งสองข้าง
    const gw = glyph ? 16 : 0;
    const w = head.width + sub.width + gw + 34;
    const h = 24;
    g.fillStyle(0x0d111b, 0.9).fillRect(-w / 2, -h / 2, w, h);
    for (let i = 0; i < 6; i++) {
      const a = 0.9 - i * 0.15;
      const ext = 10 + i * 10;
      g.fillStyle(accent, a).fillRect(-w / 2 - ext, -h / 2, 10, 1).fillRect(w / 2 + ext - 10, -h / 2, 10, 1).fillRect(-w / 2 - ext, h / 2 - 1, 10, 1).fillRect(w / 2 + ext - 10, h / 2 - 1, 10, 1);
    }
    g.fillStyle(accent, 0.95).fillRect(-w / 2, -h / 2, w, 1).fillRect(-w / 2, h / 2 - 1, w, 1);
    for (const sx of [-w / 2 - 6, w / 2 + 6]) g.fillStyle(accent, 1).fillPoints([{ x: sx, y: -3 }, { x: sx + 3, y: 0 }, { x: sx, y: 3 }, { x: sx - 3, y: 0 }], true);
    let x = -w / 2 + 12;
    const parts: Phaser.GameObjects.GameObject[] = [g];
    if (glyph) {
      parts.push(txt(s, x + 6, 0, glyph, 11, '#ffffff').setOrigin(0.5));
      x += gw;
    }
    head.setX(x);
    x += head.width + 10;
    const dot = s.add.rectangle(x - 5, 0, 2, 2, accent, 0.9);
    sub.setX(x);
    parts.push(head, dot, sub);
    c.add(parts);
    // เปิดจากกลาง: ขยายแนวนอน แล้วแสงวิ่งผ่าน
    c.setScale(0.02 * L.k, L.k).setAlpha(0);
    s.tweens.add({ targets: c, scaleX: L.k, alpha: 1, duration: 280, ease: 'Cubic.easeOut' });
    this.shine(c, w, h, -h / 2, 260);
    s.tweens.add({ targets: c, alpha: 0, delay: 3000, duration: 420, onComplete: () => c.destroy() });
    return c;
  }

  // ------------------------------------------------------------------
  /** ขอบล่างของกองแจ้งเตือนตอนนี้ */
  private stackBottom() {
    const L = this.layout();
    let y = L.top;
    for (const it of this.items) if (!it.dead) y += (it.h + GAP) * L.k;
    return y;
  }

  private push(c: Phaser.GameObjects.Container, life: number) {
    const L = this.layout();
    const it: Item = { c, h: (c.getData('h') as number) ?? 20 };
    this.items.push(it);
    while (this.items.filter((x) => !x.dead).length > L.max) {
      const old = this.items.find((x) => !x.dead)!;
      this.kill(old, true);
    }
    this.relayout(true);
    this.scene.time.delayedCall(life, () => this.kill(it));
  }

  private kill(it: Item, fast = false) {
    if (it.dead) return;
    it.dead = true;
    const s = this.scene;
    s.tweens.killTweensOf(it.c);
    s.tweens.add({
      targets: it.c, alpha: 0, y: it.c.y - 6, duration: fast ? 120 : 380,
      onComplete: () => {
        it.c.destroy();
        this.items = this.items.filter((x) => x !== it);
        this.relayout(false);
      },
    });
  }

  private relayout(entering: boolean) {
    const L = this.layout();
    let y = L.top;
    const live = this.items.filter((x) => !x.dead);
    live.forEach((it, i) => {
      const last = i === live.length - 1;
      if (entering && last && !it.c.getData('placed')) {
        // ตัวใหม่: เลื่อนลงมาเด้งเบาๆ
        it.c.setData('placed', true);
        it.c.setPosition(W / 2, y - 10 * L.k).setAlpha(0);
        this.scene.tweens.add({ targets: it.c, y, alpha: 1, duration: 260, ease: 'Back.easeOut' });
      } else if (Math.abs(it.c.y - y) > 0.5) {
        this.scene.tweens.add({ targets: it.c, y, duration: 160, ease: 'Sine.easeOut' });
      }
      y += (it.h + GAP) * L.k;
    });
  }

  /** ป้ายริบบอน: แถบมืด + แถบสีซ้าย + ชิปไอคอน + เส้นเวลา */
  private ribbon(glyph: string, body: string, color: string, life: number, desc?: string) {
    const s = this.scene;
    const L = this.layout();
    const dim = DIMS.has(color.toLowerCase());
    const accent = dim ? 0x6f8296 : cssHex(color);
    const c = s.add.container(W / 2, 0).setDepth(40).setScale(L.k);
    const t = txt(s, 0, 0, body, 12, desc ? muteColor(color) : dim ? '#c3ced8' : '#eef0f2', { fontStyle: desc ? '500' : '400', wordWrap: { width: 300 }, maxLines: 2 }).setOrigin(0, 0);
    const d = desc ? txt(s, 0, 0, desc, 11, '#a9bccb', { fontStyle: '400', wordWrap: { width: 300 }, maxLines: 2 }).setOrigin(0, 0) : null;
    const chip = 16;
    const tw = Math.max(t.width, d?.width ?? 0);
    const th = t.height + (d ? d.height - 2 : 0);
    const w = tw + chip + 22;
    const h = Math.max(chip + 6, th + 4);
    const g = s.add.graphics();
    g.fillStyle(0x0b0d1f, 0.5).fillRoundedRect(-w / 2 + 1, 2, w, h, 3);
    g.fillStyle(0x10141f, 0.93).fillRoundedRect(-w / 2, 0, w, h, 3);
    g.lineStyle(1, 0x2b3550, 1).strokeRoundedRect(-w / 2, 0, w, h, 3);
    g.fillStyle(accent, 1).fillRect(-w / 2, 2, 2, h - 4);
    const cx = -w / 2 + 6 + chip / 2;
    g.fillStyle(accent, 0.2).fillRoundedRect(cx - chip / 2, h / 2 - chip / 2, chip, chip, 2);
    g.lineStyle(1, accent, 0.55).strokeRoundedRect(cx - chip / 2, h / 2 - chip / 2, chip, chip, 2);
    const parts: Phaser.GameObjects.GameObject[] = [g];
    if (glyph) parts.push(txt(s, cx, h / 2, glyph, 10, '#ffffff').setOrigin(0.5));
    else {
      const dg = s.add.graphics();
      dg.fillStyle(accent, 1).fillPoints([{ x: cx, y: h / 2 - 4 }, { x: cx + 4, y: h / 2 }, { x: cx, y: h / 2 + 4 }, { x: cx - 4, y: h / 2 }], true);
      parts.push(dg);
    }
    t.setPosition(-w / 2 + chip + 12, h / 2 - th / 2);
    parts.push(t);
    if (d) parts.push(d.setPosition(t.x, t.y + t.height - 2));
    // เส้นเวลาด้านล่างหดลงตามเวลาที่เหลือ
    const bar = s.add.rectangle(-w / 2 + 3, h - 1, w - 6, 1, accent, 0.75).setOrigin(0, 0);
    parts.push(bar);
    c.add(parts);
    s.tweens.add({ targets: bar, scaleX: 0, duration: life, ease: 'Linear' });
    this.shine(c, w, h, 0, 120);
    c.setData('h', h + 2);
    return c;
  }

  /** แสงวาบวิ่งผ่านแถบ 1 ครั้ง */
  private shine(c: Phaser.GameObjects.Container, w: number, h: number, y0: number, delay: number) {
    const s = this.scene;
    const sh = s.add.rectangle(-w / 2 + 6, y0 + 1, 8, h - 2, 0xffffff, 0.16).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD);
    const sh2 = s.add.rectangle(-w / 2 + 16, y0 + 1, 3, h - 2, 0xffffff, 0.12).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD);
    c.add([sh, sh2]);
    s.tweens.add({ targets: [sh, sh2], x: `+=${w - 26}`, delay, duration: 520, ease: 'Sine.easeInOut', onComplete: () => (sh.destroy(), sh2.destroy()) });
  }
}
