import Phaser from 'phaser';
import { CENTER_SLOT } from '../core/RoomService';
import { SPECIAL_NAME, SPECIAL_SLOT, openLeft } from '../core/SpecialIsland';
import { bkkClock, fmtLeft } from '../core/WorldClock';
import { interiorDef } from '../world/Interiors';
import type { GameScene } from '../scenes/GameScene';
import { txt } from './widgets';

/**
 * หมุดสถานที่บนแผนที่ใหญ่ + มินิแมป: ดันเจี้ยนทั้ง 3 ชั้น (สถานะชั่วโมงนี้) · เกาะกลาง/ตลาด · เกาะมหาสมบัติ · เกาะกิจกรรม · เกาะอื่น (เขตผจญภัย)
 * แตะหมุดบนแผนที่ใหญ่ = ตั้งจุดหมาย (GameScene.waypoints → ลูกศรสีฟ้ารอบตัว) · แตะซ้ำ = ยกเลิก
 * UIScene ต่อสาย 3 จุด: สร้างใน makeMap · drawBig ใน refresher · tap ใน pointerup ของแผนที่ (+ มินิแมปวาดเองทุกเฟรม)
 */
export interface MapMark {
  key: string;
  tx: number;
  ty: number;
  icon: string;
  name: string;
  sub: string;
  color: number;
  css: string;
  /** แสดงชื่อบนแผนที่ใหญ่ (เกาะอื่นมีชื่อจากป้ายเดิมอยู่แล้ว = ไอคอนอย่างเดียว) */
  label: boolean;
  /** ด้านที่วางป้าย (ปากถ้ำอยู่ใกล้กัน — แยกซ้าย/ขวา/ล่าง ไม่ให้ทับกัน) */
  side?: 'below' | 'left' | 'right';
}

export function collectMarks(gs: GameScene): MapMark[] {
  const out: MapMark[] = [];
  const w = gs.world;
  const rs = gs.mobRespawn;
  const home = w.slots[w.home];
  for (const pt of w.portals) {
    const d = interiorDef(pt.interior);
    if (!d) continue;
    const st = gs.interiors.floorStatus(pt.interior);
    out.push({
      key: `d${pt.interior}`, tx: pt.tx, ty: pt.ty, side: !home || pt.ty <= home.cy ? 'below' : pt.tx < home.cx ? 'left' : 'right', icon: d.tier === 3 ? '💀' : '⛏', name: `${d.name} (ชั้น ${d.tier ?? 1})`, label: true,
      sub: `${gs.interiors.floorText(pt.interior)}${st.cleared ? '' : ` · ${fmtLeft(rs.msToRefresh)}`}`,
      color: st.cleared ? 0xa7f070 : st.bossAlive ? 0xef7d57 : 0xffcd75, css: st.cleared ? '#a7f070' : st.bossAlive ? '#ef7d57' : '#ffcd75',
    });
  }
  const c = w.slots[CENTER_SLOT];
  if (c) out.push({ key: 'center', tx: c.cx, ty: c.cy, icon: '⚖', name: 'เกาะกลาง · ตลาด', sub: gs.center.open ? openLeft(gs.center) : `ปิด · เปิด ${bkkClock(gs.center.nextOpen)} น.`, color: 0xa7f070, css: '#a7f070', label: true });
  const sp = w.slots[SPECIAL_SLOT];
  if (sp) out.push({ key: 'special', tx: sp.cx, ty: sp.cy, icon: '✨', name: SPECIAL_NAME, sub: gs.special.open ? openLeft(gs.special) : `ปิด · เปิด ${bkkClock(gs.special.nextOpen)} น.`, color: 0xffcd75, css: '#ffcd75', label: true });
  for (const m of gs.worldEvents.markers()) {
    if (m.kind !== 'event') continue;
    const col = Phaser.Display.Color.HexStringToColor(m.color).color;
    out.push({ key: `e${m.tx},${m.ty}`, tx: m.tx, ty: m.ty, icon: m.icon, name: m.name, sub: m.msLeft > 0 ? `เหลือ ${fmtLeft(m.msLeft)}` : 'หมดเวลา · รอคนออก', color: col, css: m.color, label: true });
  }
  for (const is of w.slots) {
    if (!is || is.index >= 1000 || is.index === CENTER_SLOT || is.index === SPECIAL_SLOT || is.index === w.home || is.event) continue;
    out.push({ key: `i${is.index}`, tx: is.cx, ty: is.cy, icon: '⚔', name: is.name, sub: 'เขตผจญภัย', color: 0xef7d57, css: '#ef7d57', label: false });
  }
  return out;
}

export class MapMarkers {
  private texts: Phaser.GameObjects.Text[] = [];
  private refresh: Phaser.GameObjects.Text;
  private marks: MapMark[] = [];
  private toMap: ((tx: number, ty: number) => { x: number; y: number }) | null = null;
  private fit = 1;
  private miniG: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private scene: Phaser.Scene,
    private gs: GameScene,
    private holder: Phaser.GameObjects.Container,
    private mask: Phaser.Display.Masks.GeometryMask,
    private mini?: Phaser.GameObjects.Image,
    private miniSize = 96,
  ) {
    this.refresh = txt(scene, 8, 6, '', 11, '#ffcd75').setBackgroundColor('#0b0d1fcc').setPadding(6, 2, 6, 2);
    holder.parentContainer?.add(this.refresh);
    if (mini) {
      this.miniG = scene.add.graphics();
      if (mini.parentContainer) mini.parentContainer.add(this.miniG);
      else this.miniG.setDepth(mini.depth + 1);
      const tick = () => this.drawMini();
      scene.events.on('update', tick);
      scene.events.once('shutdown', () => scene.events.off('update', tick));
    }
  }

  /** วาดหมุดบนแผนที่ใหญ่ (เรียกจาก refresher ของหน้าต่างแผนที่) */
  drawBig(gfx: Phaser.GameObjects.Graphics, toMap: (tx: number, ty: number) => { x: number; y: number }, fit: number) {
    const gs = this.gs;
    this.toMap = toMap;
    this.fit = fit;
    this.marks = collectMarks(gs);
    this.refresh.setText(`${gs.mobRespawn.refreshText} · แตะหมุด = ตั้งจุดหมาย 🧭`);
    let i = 0;
    for (const m of this.marks) {
      const p = toMap(m.tx, m.ty);
      const rr = m.key.startsWith('i') ? 6 : 8;
      gfx.fillStyle(0x0b0d1f, 0.85).fillCircle(p.x, p.y, rr).lineStyle(2, m.color, 1).strokeCircle(p.x, p.y, rr);
      let t = this.texts[i];
      if (!t) {
        t = txt(this.scene, 0, 0, '', 10, '#ffffff', { align: 'center', lineSpacing: 1 }).setOrigin(0.5, 0).setStroke('#0b0d1f', 3).setMask(this.mask);
        this.holder.add(t);
        this.texts.push(t);
      }
      i++;
      // ซูมไกล: ดันเจี้ยน (อยู่ติดกันบนเกาะเรา) โชว์แค่ไอคอน · เกาะอื่นเป็นไอคอนเสมอ (ชื่อมีป้ายเดิมแล้ว)
      const full = m.label && (fit >= 3 || !m.key.startsWith('d'));
      t.setVisible(true).setText(full ? `${m.icon} ${m.name}\n${m.sub}` : m.icon).setColor(m.css).setScale(full ? 1 : 0.9);
      if (full && m.side === 'left') t.setOrigin(1, 0.5).setPosition(p.x - 11, p.y).setAlign('right');
      else if (full && m.side === 'right') t.setOrigin(0, 0.5).setPosition(p.x + 11, p.y).setAlign('left');
      else if (full) t.setOrigin(0.5, 0).setPosition(p.x, p.y + 9).setAlign('center');
      else t.setOrigin(0.5, 0.5).setPosition(p.x, p.y);
    }
    for (; i < this.texts.length; i++) this.texts[i].setVisible(false);
    // จุดหมาย
    const wp = gs.waypoints.target;
    if (wp) {
      const p = toMap(wp.x / 16, wp.y / 16);
      gfx.lineStyle(2, 0x73eff7, 1).strokeCircle(p.x, p.y, 12 + Math.sin(this.scene.time.now / 200) * 2);
      const pm = toMap(gs.player.x / 16, gs.player.y / 16);
      gfx.lineStyle(2, 0x73eff7, 0.6);
      for (let k = 0; k < 24; k += 2) gfx.lineBetween(pm.x + (p.x - pm.x) * (k / 24), pm.y + (p.y - pm.y) * (k / 24), pm.x + (p.x - pm.x) * ((k + 1) / 24), pm.y + (p.y - pm.y) * ((k + 1) / 24));
    }
  }

  /** แตะแผนที่ใหญ่ที่พิกัด tile → ถ้าโดนหมุด ตั้งจุดหมาย (คืน true = ใช้การแตะนี้แล้ว) */
  tap(tx: number, ty: number): boolean {
    if (!this.toMap) return false;
    const r = 14 / Math.max(0.01, this.fit / 2);
    let best: MapMark | null = null;
    let bd = r;
    for (const m of this.marks) {
      const d = Math.hypot(m.tx - tx, m.ty - ty);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return false;
    this.gs.waypoints.set(best.tx * 16 + 8, best.ty * 16 + 8, best.name.replace(/\s*\(.*\)/, ''), best.color);
    return true;
  }

  /** มินิแมป: จุดหมุดในรัศมี + ลูกศรจุดหมายที่ขอบ */
  private drawMini() {
    const g = this.miniG;
    const mini = this.mini;
    if (!g || !mini) return;
    g.clear();
    g.setVisible(mini.visible);
    if (!mini.visible) return;
    const gs = this.gs;
    const half = this.miniSize / 2;
    const cx = mini.x + half;
    const cy = mini.y + half;
    const px = gs.player.x / 16;
    const py = gs.player.y / 16;
    if (this.scene.time.now % 1000 < 20 || !this.marks.length) this.marks = collectMarks(gs);
    for (const m of this.marks) {
      const dx = m.tx - px;
      const dy = m.ty - py;
      if (Math.abs(dx) > half - 2 || Math.abs(dy) > half - 2) continue;
      g.fillStyle(0x0b0d1f, 1).fillRect(cx + dx - 2, cy + dy - 2, 5, 5).fillStyle(m.color, 1).fillRect(cx + dx - 1, cy + dy - 1, 3, 3);
    }
    const wp = gs.waypoints.target;
    if (!wp) return;
    const dx = wp.x / 16 - px;
    const dy = wp.y / 16 - py;
    if (Math.abs(dx) < half - 3 && Math.abs(dy) < half - 3) {
      g.lineStyle(1.5, 0x73eff7, 1).strokeCircle(cx + dx, cy + dy, 4);
      return;
    }
    const a = Math.atan2(dy, dx);
    const ax = cx + Math.cos(a) * (half - 8);
    const ay = cy + Math.sin(a) * (half - 8);
    const s = 5;
    g.fillStyle(0x73eff7, 1).fillTriangle(ax + Math.cos(a) * s, ay + Math.sin(a) * s, ax + Math.cos(a + 2.4) * s, ay + Math.sin(a + 2.4) * s, ax + Math.cos(a - 2.4) * s, ay + Math.sin(a - 2.4) * s);
  }
}
