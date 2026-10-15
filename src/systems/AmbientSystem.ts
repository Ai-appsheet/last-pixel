import Phaser from 'phaser';
import { ITEMS } from '../data/items';
import { Sfx } from '../core/AudioManager';
import { ART_VARIANTS } from '../gfx/TextureFactory';
import { TILE } from '../world/tiles';
import type { GameScene } from '../scenes/GameScene';
import { isWater } from '../world/tiles';
import { qualityKnobs } from '../core/Quality';

const ABOVE_DARK = 1e6 + 1;
const SKY = 5e5;

interface Firefly {
  img: Phaser.GameObjects.Image;
  life: number;
  phase: number;
  ox: number;
  oy: number;
}

/**
 * บรรยากาศ: เงาเมฆ, หิ่งห้อย, ใบไม้ร่วง, ประกายไฟ/ควัน, แสงอุ่นรอบกองไฟ,
 * ประกายบนผิวน้ำ, ฝุ่นตอนวิ่ง, ควันจากซากเครื่องบิน
 */
export class AmbientSystem {
  private clouds: Phaser.GameObjects.Image[] = [];
  private fireflies: Firefly[] = [];
  private glows = new Map<object, Phaser.GameObjects.Image>();
  private torchGlow: Phaser.GameObjects.Image;
  private t = { leaf: 0, ember: 0, sparkle: 0, dust: 0, smoke: 0 };

  constructor(private scene: GameScene) {
    const view = scene.cameras.main.worldView;
    for (let i = 0; i < 4; i++) {
      this.clouds.push(
        scene.add
          .image(view.x + Math.random() * 500, view.y + Math.random() * 300, `cloud_${i % ART_VARIANTS.cloud}`)
          .setScale(2.2)
          .setAlpha(0.12)
          .setDepth(SKY),
      );
    }
    this.torchGlow = scene.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(ABOVE_DARK).setVisible(false);
  }

  update(dt: number) {
    const s = this.scene;
    const view = s.cameras.main.worldView;
    const dark = s.dayNight.darkness;
    const p = s.player;
    // คุณภาพกลาง/ต่ำ: อนุภาคบรรยากาศน้อยลง (ช่วงห่างขึ้น / จำนวนสูงสุดน้อยลง)
    const q = qualityKnobs().particles;
    const indoor = !!s.homes?.inside; // อยู่ในห้องบ้าน: ไม่มีเงาเมฆ/หิ่งห้อย

    // ---------- เงาเมฆ ----------
    for (const c of this.clouds) {
      c.x += 7 * dt;
      c.y += 1.5 * dt;
      const w = c.displayWidth;
      const h = c.displayHeight;
      if (c.x - w / 2 > view.right + 40 || c.y - h / 2 > view.bottom + 40 || c.x + w / 2 < view.x - 300 || c.y + h / 2 < view.y - 300) {
        c.x = view.x - w / 2 - Math.random() * 120;
        c.y = view.y + Math.random() * view.height;
      }
      c.setAlpha(indoor ? 0 : 0.12 * (1 - dark));
    }

    // ---------- หิ่งห้อยตอนกลางคืน ----------
    if (dark > 0.4 && !indoor && this.fireflies.length < 18 * q && Math.random() < dt * 6) {
      const img = s.add.image(0, 0, 'firefly').setBlendMode(Phaser.BlendModes.ADD).setDepth(ABOVE_DARK).setAlpha(0);
      this.fireflies.push({
        img, life: Phaser.Math.FloatBetween(4, 9), phase: Math.random() * 10,
        ox: view.x + Math.random() * view.width, oy: view.y + Math.random() * view.height,
      });
    }
    this.fireflies = this.fireflies.filter((f) => {
      f.life -= dt;
      f.phase += dt;
      f.ox += Math.sin(f.phase * 0.7) * 6 * dt;
      f.oy += Math.cos(f.phase * 0.5) * 4 * dt;
      f.img.setPosition(Math.round(f.ox + Math.sin(f.phase * 2.3) * 3), Math.round(f.oy + Math.sin(f.phase * 1.7) * 2));
      const fade = Math.min(1, f.life, (9 - f.life) * 2);
      f.img.setAlpha(Math.max(0, fade * (0.5 + Math.sin(f.phase * 4) * 0.5)) * Math.min(1, dark * 1.5));
      if (f.life <= 0 || dark < 0.2) {
        f.img.destroy();
        return false;
      }
      return true;
    });

    // ---------- ใบไม้ร่วงในป่า ----------
    this.t.leaf -= dt;
    const ptile = s.tileAt(Math.floor(p.x / 16), Math.floor(p.y / 16));
    if (this.t.leaf <= 0 && dark < 0.5 && ptile === TILE.FOREST) {
      this.t.leaf = Phaser.Math.FloatBetween(0.25, 0.6) / q;
      const leaf = s.add.image(view.x + Math.random() * view.width, view.y - 4, Math.random() < 0.7 ? 'leaf_a' : 'leaf_b').setDepth(SKY);
      const dur = Phaser.Math.Between(3500, 5500);
      s.tweens.add({ targets: leaf, y: leaf.y + view.height * 0.8, x: leaf.x + 30, alpha: { from: 1, to: 0 }, duration: dur, onComplete: () => leaf.destroy() });
      s.tweens.add({ targets: leaf, scaleX: -1, duration: 400, yoyo: true, repeat: Math.floor(dur / 800) });
    }

    // ---------- กองไฟ: แสงอุ่น + ประกายไฟ + ควัน ----------
    const fires = s.fireSources();
    const alive = new Set(fires.map((f) => f.key));
    for (const [k, g] of this.glows) {
      if (!alive.has(k)) {
        g.destroy();
        this.glows.delete(k);
      }
    }
    this.t.ember -= dt;
    const emit = this.t.ember <= 0;
    if (emit) this.t.ember = 0.12 / q;
    for (const f of fires) {
      let g = this.glows.get(f.key);
      if (!g) {
        g = s.add.image(f.x, f.y - 6, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(ABOVE_DARK);
        this.glows.set(f.key, g);
      }
      const flick = Math.sin(s.time.now * 0.012 + f.x) * 0.05 + Math.random() * 0.04;
      g.setScale(2.4 + flick * 2).setAlpha(0.12 + dark * 0.45 + flick);
      if (emit && view.contains(f.x, f.y)) {
        if (Math.random() < 0.15 && Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y) < 80) Sfx.play('fire', 120);
        this.particle(f.x + Phaser.Math.Between(-3, 3), f.y - 9, 'ember', 0xffcd75, -26, 900, ABOVE_DARK, true);
        if (Math.random() < 0.5) this.particle(f.x + Phaser.Math.Between(-2, 2), f.y - 14, 'px', 0x566c86, -14, 1600, SKY - 1, false, 0.5);
      }
    }

    // ---------- แสงคบไฟในมือ ----------
    const held = p.held;
    const torch = held && ITEMS[held.id].type === 'light';
    this.torchGlow.setVisible(!!torch && dark > 0.05);
    if (torch) this.torchGlow.setPosition(p.x, p.y - 2).setScale(1.3).setAlpha(0.04 + dark * 0.12 + Math.random() * 0.02);

    // ---------- ประกายบนผิวน้ำ ----------
    this.t.sparkle -= dt;
    if (this.t.sparkle <= 0) {
      this.t.sparkle = 0.12 / q;
      const x = view.x + Math.random() * view.width;
      const y = view.y + Math.random() * view.height;
      if (isWater(s.tileAt(Math.floor(x / 16), Math.floor(y / 16)))) {
        const sp = s.add.image(Math.round(x), Math.round(y), 'sparkle').setDepth(-2).setScale(0.3).setAlpha(dark > 0.5 ? 0.3 : 0.9);
        s.tweens.add({ targets: sp, scale: 1, alpha: 0, duration: 600, ease: 'Sine.easeOut', onComplete: () => sp.destroy() });
      }
    }

    // ---------- ฝุ่นตอนวิ่ง ----------
    this.t.dust -= dt;
    if (this.t.dust <= 0 && p.body.velocity.length() > p.char.stats.speed * 1.2) {
      this.t.dust = 0.07 / q;
      const sand = ptile === TILE.SAND;
      this.particle(p.x + Phaser.Math.Between(-3, 3), p.feetY, 'px', sand ? 0xc9a46a : 0x94b0c2, -6, 380, p.depth - 0.2, false, 0.4);
    }

    // ---------- ควันจากซากเครื่องบิน ----------
    const w = s.wreckSprite;
    this.t.smoke -= dt;
    if (w && this.t.smoke <= 0 && view.contains(w.x, w.y - 10)) {
      this.t.smoke = 0.18;
      this.particle(w.x + 12 + Phaser.Math.Between(-3, 3), w.y - 20, 'px', 0x333c57, -16, 2600, SKY - 1, false, 0.9, 2.2);
    }
  }

  private particle(x: number, y: number, key: string, tint: number, vy: number, dur: number, depth: number, add: boolean, scale = 1, grow = 1) {
    const s = this.scene;
    const img = s.add.image(x, y, key).setTint(tint).setDepth(depth).setScale(scale);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD);
    s.tweens.add({
      targets: img,
      y: y + (vy * dur) / 1000,
      x: x + Phaser.Math.Between(-6, 6),
      alpha: 0,
      scale: scale * grow,
      duration: dur,
      ease: 'Sine.easeOut',
      onComplete: () => img.destroy(),
    });
  }
}
