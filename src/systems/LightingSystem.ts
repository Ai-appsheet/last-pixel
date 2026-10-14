import Phaser from 'phaser';
import { ensureLight } from '../gfx/TextureFactory';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
}

/**
 * ความมืดตอนกลางคืน: RenderTexture ขนาดเท่าจอ (หน่วย world) วางทับโลก
 * เติมสีมืด แล้ว "ลบ" วงแสงตามแหล่งกำเนิดแสงออก
 */
export class LightingSystem {
  private rt: Phaser.GameObjects.RenderTexture;
  private flicker = 0;

  constructor(private scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    const w = Math.ceil(cam.width / cam.zoom) + 32;
    const h = Math.ceil(cam.height / cam.zoom) + 32;
    this.rt = scene.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setDepth(1e6);
  }

  /** tint = สีความมืดพิเศษ (สุริยุปราคา / คืนหมอกผี) ถ้าไม่ใช่จันทร์เลือด */
  update(dt: number, darkness: number, bloodMoon: boolean, lights: LightSource[], tint?: number) {
    if (darkness <= 0.01) {
      this.rt.setVisible(false);
      return;
    }
    this.flicker += dt;
    const view = this.scene.cameras.main.worldView;
    // ปรับขนาดตามซูม (ซูมออก = ต้องครอบพื้นที่มากขึ้น)
    const needW = Math.ceil(view.width) + 32;
    const needH = Math.ceil(view.height) + 32;
    if (Math.abs(this.rt.width - needW) > 8 || Math.abs(this.rt.height - needH) > 8) {
      this.rt.destroy();
      this.rt = this.scene.add.renderTexture(0, 0, needW, needH).setOrigin(0, 0).setDepth(1e6);
    }
    const ox = Math.floor(view.x) - 16;
    const oy = Math.floor(view.y) - 16;
    this.rt.setVisible(true).setPosition(ox, oy);
    this.rt.clear();
    this.rt.fill(bloodMoon ? 0x2a0710 : tint ?? 0x0b0d1f, darkness);
    for (const l of lights) {
      // กองไฟกระพริบเล็กน้อย
      const r = Math.round(l.radius + Math.sin(this.flicker * 9 + l.x) * (l.radius > 40 ? 2 : 0));
      const key = ensureLight(this.scene, r);
      this.rt.erase(key, Math.round(l.x - r - ox), Math.round(l.y - r - oy));
    }
  }
}
