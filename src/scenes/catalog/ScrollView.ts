import Phaser from 'phaser';

/**
 * กล่องเลื่อนแนวตั้ง: ตัดขอบด้วย GeometryMask + แถบเลื่อน
 * PC: ล้อเมาส์ / ลากแถบ · มือถือ: ลากนิ้ว + ไถลต่อ (inertia)
 * ไม่ใช้ interactive ของลูกใน container (เพราะ mask ไม่กันคลิก) — แจ้งพิกัดแตะ/ชี้เป็นพิกัดภายในแทน
 */
export class ScrollView {
  readonly content: Phaser.GameObjects.Container;
  private maskG: Phaser.GameObjects.Graphics;
  private track: Phaser.GameObjects.Rectangle;
  private thumb: Phaser.GameObjects.Rectangle;
  private scroll = 0;
  private target = 0;
  private vel = 0;
  private contentH = 0;
  private press: { x: number; y: number; scroll: number; thumb: boolean } | null = null;
  private dragging = false;
  private lastMove = { y: 0, t: 0 };
  onTap: ((lx: number, ly: number) => void) | null = null;
  onHover: ((lx: number, ly: number) => void) | null = null;
  private off: (() => void)[] = [];

  constructor(scene: Phaser.Scene, readonly x: number, readonly y: number, readonly w: number, readonly h: number, depth = 5) {
    this.content = scene.add.container(x, y).setDepth(depth);
    this.maskG = scene.make.graphics({}, false);
    this.maskG.fillStyle(0xffffff).fillRect(x, y, w, h);
    this.content.setMask(this.maskG.createGeometryMask());
    this.track = scene.add.rectangle(x + w - 3, y + 2, 4, h - 4, 0x0b0d1f, 0.6).setOrigin(0.5, 0).setDepth(depth + 1);
    this.thumb = scene.add.rectangle(x + w - 3, y + 2, 4, 20, 0xffcd75, 0.9).setOrigin(0.5, 0).setDepth(depth + 1);

    const input = scene.input;
    const down = (p: Phaser.Input.Pointer) => {
      if (!this.inside(p.x, p.y)) return;
      this.press = { x: p.x, y: p.y, scroll: this.target, thumb: p.x >= x + w - 14 && this.max > 0 };
      this.dragging = false;
      this.vel = 0;
      this.lastMove = { y: p.y, t: scene.time.now };
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (this.press && p.isDown) {
        const dy = p.y - this.press.y;
        if (!this.dragging && (Math.abs(dy) > 7 || Math.abs(p.x - this.press.x) > 10)) this.dragging = true;
        if (this.dragging) {
          if (this.press.thumb) {
            // ลากแถบเลื่อน: สเกลตามสัดส่วนเนื้อหา
            const ratio = this.contentH / this.h;
            this.target = this.clamp(this.press.scroll + dy * ratio);
          } else {
            const now = scene.time.now;
            const dt = Math.max(1, now - this.lastMove.t);
            this.vel = Phaser.Math.Linear(this.vel, (-(p.y - this.lastMove.y) / dt) * 1000, 0.5);
            this.lastMove = { y: p.y, t: now };
            this.target = this.rubber(this.press.scroll - dy);
          }
          this.scroll = this.target;
        }
        return;
      }
      if (this.onHover) {
        if (this.inside(p.x, p.y)) this.onHover(p.x - x, p.y - y + this.scroll);
        else this.onHover(-1, -1);
      }
    };
    const up = (p: Phaser.Input.Pointer) => {
      if (!this.press) return;
      const wasDrag = this.dragging;
      const thumb = this.press.thumb;
      this.press = null;
      this.dragging = false;
      if (!wasDrag) {
        if (thumb) return;
        if (this.inside(p.x, p.y)) this.onTap?.(p.x - x, p.y - y + this.scroll);
        this.vel = 0;
      } else if (thumb || scene.time.now - this.lastMove.t > 90) this.vel = 0;
    };
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.inside(p.x, p.y)) return;
      this.vel = 0;
      this.target = this.clamp(this.target + dy * 0.7);
    };
    input.on('pointerdown', down);
    input.on('pointermove', move);
    input.on('pointerup', up);
    input.on('pointerupoutside', up);
    input.on('wheel', wheel);
    this.off.push(() => {
      input.off('pointerdown', down);
      input.off('pointermove', move);
      input.off('pointerup', up);
      input.off('pointerupoutside', up);
      input.off('wheel', wheel);
    });
  }

  get max() {
    return Math.max(0, this.contentH - this.h);
  }

  get scrollY() {
    return this.scroll;
  }

  inside(px: number, py: number) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }

  private clamp(v: number) {
    return Phaser.Math.Clamp(v, 0, this.max);
  }

  /** ดึงเกินขอบได้นิดหน่อยแบบยางยืด */
  private rubber(v: number) {
    if (v < 0) return v * 0.35;
    if (v > this.max) return this.max + (v - this.max) * 0.35;
    return v;
  }

  /** ตั้งความสูงเนื้อหา (reset = เลื่อนกลับบนสุด) */
  setContentHeight(hh: number, reset = true) {
    this.contentH = hh;
    if (reset) {
      this.scroll = this.target = 0;
      this.vel = 0;
    } else this.target = this.clamp(this.target);
    this.layout();
  }

  /** เลื่อนให้ช่วง [top, bottom] (พิกัดภายใน) อยู่ในจอ */
  reveal(top: number, bottom: number) {
    if (top < this.target) this.target = this.clamp(top - 6);
    else if (bottom > this.target + this.h) this.target = this.clamp(bottom - this.h + 6);
  }

  scrollBy(d: number) {
    this.vel = 0;
    this.target = this.clamp(this.target + d);
  }

  clear() {
    this.content.removeAll(true);
  }

  update(dt: number) {
    const s = dt / 1000;
    if (!this.dragging) {
      if (Math.abs(this.vel) > 5) {
        this.target = this.clamp(this.target + this.vel * s);
        this.vel *= Math.pow(0.03, s);
        if (this.target <= 0 || this.target >= this.max) this.vel = 0;
      } else this.vel = 0;
      // กลับเข้าขอบ (หลังดึงยางยืด) + เลื่อนนุ่มๆ
      if (!this.press) this.target = this.clamp(this.target);
      this.scroll += (this.target - this.scroll) * Math.min(1, s * 14);
      if (Math.abs(this.target - this.scroll) < 0.3) this.scroll = this.target;
    }
    this.layout();
  }

  private layout() {
    this.content.y = Math.round(this.y - this.scroll);
    const show = this.max > 0;
    this.track.setVisible(show);
    this.thumb.setVisible(show);
    if (!show) return;
    const th = Math.max(24, (this.h - 4) * (this.h / this.contentH));
    const r = Phaser.Math.Clamp(this.scroll / this.max, 0, 1);
    this.thumb.setSize(4, th);
    this.thumb.y = this.y + 2 + (this.h - 4 - th) * r;
  }

  destroy() {
    this.off.forEach((f) => f());
    this.off = [];
    this.content.destroy();
    this.maskG.destroy();
    this.track.destroy();
    this.thumb.destroy();
  }
}

/**
 * ตัดบรรทัดภาษาไทย (ไม่มีเว้นวรรค) ด้วย Intl.Segmenter — ใช้เป็น wordWrap.callback ของ Phaser Text
 * วัดด้วย context ของ Text เอง (ฟอนต์ถูกตั้งก่อนเรียก callback)
 */
const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
const graph = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'grapheme' }) : null;

export function thaiWrap(width: number) {
  return (text: string, obj: Phaser.GameObjects.Text): string[] => {
    const ctx = obj.context;
    const stroke = obj.style.strokeThickness ?? 0;
    const maxW = width - stroke;
    const out: string[] = [];
    for (const para of text.split('\n')) {
      const words = seg ? [...seg.segment(para)].map((s) => s.segment) : para.split(/(?<=\s)/);
      let line = '';
      for (const w of words) {
        const test = line + w;
        if (ctx.measureText(test).width <= maxW || !line) {
          // คำเดียวยาวเกิน → หั่นทีละตัวอักษร (grapheme)
          if (!line && ctx.measureText(w).width > maxW) {
            const gs = graph ? [...graph.segment(w)].map((s) => s.segment) : [...w];
            for (const g of gs) {
              if (line && ctx.measureText(line + g).width > maxW) {
                out.push(line);
                line = '';
              }
              line += g;
            }
          } else line = test;
        } else {
          out.push(line.trimEnd());
          line = w.trimStart();
        }
      }
      out.push(line.trimEnd());
    }
    return out;
  };
}

/** ขนาดขยายแบบพิกเซล: ≥1 ปัดลงเป็นจำนวนเต็ม (สูงสุด maxS) · <1 ย่อเท่าที่จำเป็น */
export function pixelFit(w: number, h: number, boxW: number, boxH: number, maxS = 6) {
  const s = Math.min(boxW / w, boxH / h);
  return s >= 1 ? Math.min(maxS, Math.floor(s)) : s;
}
