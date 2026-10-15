import Phaser from 'phaser';
import { RETRO, retroButton, retroLabel, retroPanel } from './retro';
import { joyOptions, mirrorLayout, setJoyOptions, TOUCH_IDS, TOUCH_NAME, cssToGame, GH, GW, type TouchId, type TouchLayout } from './TouchLayout';
import { txt } from './widgets';

export interface TouchEditorHost {
  /** ขนาดของแต่ละปุ่มที่ขนาด 1 (หน่วยเกม) · round = วงกลม */
  sizeOf(id: TouchId): { w: number; h: number; round: boolean };
  /** แสดงผลทันทีตอนลาก/ปรับ */
  apply(l: TouchLayout): void;
  defaults(): TouchLayout;
  save(l: TouchLayout): void;
  close(): void;
}

/**
 * หน้าจัดตำแหน่งปุ่มสัมผัส: ลากปุ่มไปวางใหม่ (ชิดกริด 8px + เส้นช่วยจัดแนว) · เลือกปุ่มแล้วปรับขนาด/ความทึบด้วยแถบเลื่อน
 * จอย: ลอย/คงที่ + เดดโซน · รีเซ็ต / ซ้ายมือ (สลับข้าง) / บันทึก / ยกเลิก
 */
export class TouchEditor {
  readonly root: Phaser.GameObjects.Container;
  private l: TouchLayout;
  private ghosts = new Map<TouchId, { c: Phaser.GameObjects.Container; g: Phaser.GameObjects.Graphics }>();
  private sel: TouchId | null = null;
  private guides: Phaser.GameObjects.Graphics;
  private selName: Phaser.GameObjects.Text;
  private sizeSlider: { set(v: number): void; setEnabled(on: boolean): void };
  private alphaSlider: { set(v: number): void; setEnabled(on: boolean): void };

  constructor(private scene: Phaser.Scene, start: TouchLayout, private host: TouchEditorHost) {
    this.l = JSON.parse(JSON.stringify(start)) as TouchLayout;
    this.root = scene.add.container(0, 0).setDepth(70);
    const dim = scene.add.rectangle(0, 0, GW, GH, 0x0b0f12, 0.35).setOrigin(0).setInteractive();
    dim.on('pointerdown', () => this.select(null));
    this.guides = scene.add.graphics();
    this.root.add([dim, this.guides]);
    for (const id of TOUCH_IDS) this.makeGhost(id);

    // ---- แผงควบคุมกลางจอ ----
    const pw = 440;
    const ph = 132;
    const px = GW / 2 - pw / 2;
    const py = GH / 2 - ph / 2 - 30;
    const p = scene.add.container(0, 0);
    p.add(retroPanel(scene, px, py, pw, ph));
    p.add(retroLabel(scene, px + 12, py + 14, 'จัดตำแหน่งปุ่ม', RETRO.css.gold, 15).setOrigin(0, 0.5));
    p.add(txt(scene, px + pw - 12, py + 14, 'ลากปุ่มเพื่อย้าย · แตะเพื่อเลือก', 11, RETRO.css.muted).setOrigin(1, 0.5));
    this.selName = txt(scene, px + 12, py + 40, '', 12, RETRO.css.text).setOrigin(0, 0.5);
    p.add(this.selName);
    this.sizeSlider = this.slider(p, px + 150, py + 40, 'ขนาด', 0.7, 1.5, (v) => this.setSel({ s: v }));
    this.alphaSlider = this.slider(p, px + 300, py + 40, 'ทึบ', 0.3, 1, (v) => this.setSel({ a: v }));
    // จอย: ลอย/คงที่ + เดดโซน
    const jo = joyOptions();
    const modeB = retroButton(scene, px + 74, py + 70, 120, 24, jo.mode === 'floating' ? 'จอย: ลอยตามนิ้ว' : 'จอย: คงที่', () => {
      const m = joyOptions().mode === 'floating' ? 'fixed' : 'floating';
      setJoyOptions({ mode: m });
      modeB.setLabel(m === 'floating' ? 'จอย: ลอยตามนิ้ว' : 'จอย: คงที่');
    });
    p.add(modeB.objects);
    const dz = this.slider(p, px + 300, py + 70, 'เดดโซน', 0, 0.4, (v) => setJoyOptions({ dead: v }));
    dz.set(jo.dead);
    // ปุ่มคำสั่ง
    const bw = (pw - 24 - 18) / 4;
    const btn = (i: number, label: string, fn: () => void, role: 'normal' | 'primary' | 'danger' = 'normal') => {
      const b = retroButton(scene, px + 12 + bw / 2 + i * (bw + 6), py + 106, bw, 26, label, fn, role);
      p.add(b.objects);
    };
    btn(0, 'รีเซ็ตค่าเริ่มต้น', () => this.setLayout(this.host.defaults()));
    btn(1, 'ซ้ายมือ (สลับข้าง)', () => this.setLayout(mirrorLayout(this.l)));
    btn(2, 'บันทึก', () => {
      this.host.save(this.l);
      this.destroy();
    }, 'primary');
    btn(3, 'ยกเลิก', () => this.destroy(), 'danger');
    this.root.add(p);
    this.select(null);
    host.apply(this.l);
  }

  private destroy() {
    this.root.destroy();
    this.host.close();
  }

  private setLayout(l: TouchLayout) {
    this.l = JSON.parse(JSON.stringify(l)) as TouchLayout;
    for (const id of TOUCH_IDS) this.drawGhost(id);
    this.select(this.sel);
    this.host.apply(this.l);
  }

  private setSel(patch: Partial<{ s: number; a: number }>) {
    if (!this.sel) return;
    Object.assign(this.l[this.sel], patch);
    this.drawGhost(this.sel);
    this.host.apply(this.l);
  }

  private select(id: TouchId | null) {
    this.sel = id;
    for (const [gid] of this.ghosts) this.drawGhost(gid);
    this.selName.setText(id ? `เลือก: ${TOUCH_NAME[id]}` : 'ยังไม่ได้เลือกปุ่ม');
    this.sizeSlider.setEnabled(!!id);
    this.alphaSlider.setEnabled(!!id);
    if (id) {
      this.sizeSlider.set(this.l[id].s);
      this.alphaSlider.set(this.l[id].a);
    }
  }

  private makeGhost(id: TouchId) {
    const c = this.scene.add.container(0, 0);
    const g = this.scene.add.graphics();
    const label = txt(this.scene, 0, 0, TOUCH_NAME[id], 10, RETRO.css.text).setOrigin(0.5);
    c.add([g, label]);
    this.root.add(c);
    this.ghosts.set(id, { c, g });
    this.drawGhost(id);
    this.scene.input.setDraggable(c);
    c.on('pointerdown', () => this.select(id));
    c.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => this.dragTo(id, x, y));
    c.on('dragend', () => this.guides.clear());
  }

  private drawGhost(id: TouchId) {
    const gh = this.ghosts.get(id);
    if (!gh) return;
    const it = this.l[id];
    const sz = this.host.sizeOf(id);
    const w = sz.w * it.s;
    const h = sz.h * it.s;
    const on = this.sel === id;
    gh.c.setPosition(it.x * GW, it.y * GH);
    gh.g.clear().fillStyle(on ? RETRO.gold : RETRO.edgeHi, on ? 0.18 : 0.08).lineStyle(on ? 2 : 1, on ? RETRO.gold : RETRO.edgeHi, 1);
    if (sz.round) gh.g.fillCircle(0, 0, w / 2).strokeCircle(0, 0, w / 2);
    else gh.g.fillRect(-w / 2, -h / 2, w, h).strokeRect(-w / 2, -h / 2, w, h);
    gh.c.setSize(Math.max(w, 44), Math.max(h, 44));
    if (gh.c.input) (gh.c.input.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, Math.max(w, 44), Math.max(h, 44));
    else gh.c.setInteractive({ useHandCursor: true, draggable: true });
  }

  /** ลาก: ชิดกริด 8px (บนจอจริง) · ใกล้แนวปุ่มอื่น = ชิดแนวนั้น + เส้นช่วย */
  private dragTo(id: TouchId, x: number, y: number) {
    const grid = cssToGame(this.scene, 8);
    let nx = Math.round(x / grid) * grid;
    let ny = Math.round(y / grid) * grid;
    this.guides.clear().lineStyle(1, RETRO.gold, 0.7);
    for (const o of TOUCH_IDS) {
      if (o === id) continue;
      const ox = this.l[o].x * GW;
      const oy = this.l[o].y * GH;
      if (Math.abs(ox - x) < grid) {
        nx = ox;
        this.guides.lineBetween(ox, 0, ox, GH);
      }
      if (Math.abs(oy - y) < grid) {
        ny = oy;
        this.guides.lineBetween(0, oy, GW, oy);
      }
    }
    const sz = this.host.sizeOf(id);
    const hw = (sz.w * this.l[id].s) / 2;
    const hh = (sz.h * this.l[id].s) / 2;
    nx = Phaser.Math.Clamp(nx, hw, GW - hw);
    ny = Phaser.Math.Clamp(ny, hh, GH - hh);
    this.l[id].x = nx / GW;
    this.l[id].y = ny / GH;
    this.drawGhost(id);
    this.host.apply(this.l);
  }

  /** แถบเลื่อนเล็ก (ป้าย · ราง 90px · ค่า) */
  private slider(p: Phaser.GameObjects.Container, x: number, y: number, label: string, min: number, max: number, onChange: (v: number) => void) {
    const s = this.scene;
    const W = 90;
    const lab = txt(s, x - 6, y, label, 11, RETRO.css.muted).setOrigin(1, 0.5);
    const track = s.add.rectangle(x, y, W, 4, RETRO.edge, 1).setOrigin(0, 0.5);
    const knob = s.add.rectangle(x, y, 10, 16, RETRO.gold, 1).setStrokeStyle(1, 0x0b0f12).setInteractive({ useHandCursor: true, draggable: true });
    const val = txt(s, x + W + 8, y, '', 11, RETRO.css.text).setOrigin(0, 0.5);
    const hit = s.add.zone(x - 4, y - 12, W + 8, 24).setOrigin(0).setInteractive({ useHandCursor: true });
    let enabled = true;
    const show = (v: number) => {
      knob.setX(x + ((v - min) / (max - min)) * W);
      val.setText(max <= 1.001 && min >= 0 && label !== 'ขนาด' ? `${Math.round(v * 100)}%` : `×${v.toFixed(2)}`);
    };
    const fromX = (px: number) => {
      if (!enabled) return;
      const v = Phaser.Math.Clamp(min + ((px - x) / W) * (max - min), min, max);
      const r = Math.round(v * 20) / 20;
      show(r);
      onChange(r);
    };
    knob.on('drag', (_p: Phaser.Input.Pointer, dx: number) => fromX(dx));
    hit.on('pointerdown', (pt: Phaser.Input.Pointer) => fromX(pt.x));
    p.add([lab, track, hit, knob, val]);
    return {
      set: (v: number) => show(v),
      setEnabled: (on: boolean) => {
        enabled = on;
        [lab, track, knob, val].forEach((o) => o.setAlpha(on ? 1 : 0.35));
      },
    };
  }
}
