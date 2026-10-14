import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import type { GameScene } from '../scenes/GameScene';

export type Weather = 'clear' | 'rain' | 'storm';

const NAMES: Record<Weather, string> = { clear: 'ท้องฟ้าแจ่มใส', rain: 'ฝนตก', storm: 'พายุฝนฟ้าคะนอง' };

interface Drop {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
}

/** สภาพอากาศ: ฝน / พายุ (ฟ้าผ่า) + หิมะบนเกาะหิมะ + ทรายปลิวบนเกาะทะเลทราย */
export class WeatherSystem {
  state: Weather = 'clear';
  /** ความแรง 0..1 (ค่อย ๆ เปลี่ยน) */
  intensity = 0;
  private timer = 120;
  private drops: Drop[] = [];
  private lightning = 8;

  constructor(private scene: GameScene) {}

  get raining() {
    return this.intensity > 0.3;
  }

  get name() {
    return NAMES[this.state];
  }

  set(state: Weather, duration = 120) {
    this.state = state;
    this.timer = duration;
    if (state !== 'clear') EventBus.emit('toast', state === 'storm' ? '⛈ พายุกำลังมา!' : '🌧 ฝนเริ่มตก', '#41a6f6');
  }

  update(dt: number, biomeId: string) {
    // ธารน้ำแข็ง = หิมะเหมือนเกาะหิมะ · ทุ่งสะวันนา = ฝุ่นทรายปลิวเบาๆ
    const biome = biomeId === 'glacier' ? 'snow' : biomeId;
    this.timer -= dt;
    if (this.timer <= 0) {
      const r = Math.random();
      this.set(r < 0.58 ? 'clear' : r < 0.9 ? 'rain' : 'storm', Phaser.Math.Between(90, 200));
    }
    const target = this.state === 'clear' ? 0 : this.state === 'rain' ? 0.6 : 1;
    this.intensity += (target - this.intensity) * Math.min(1, dt * 0.3);
    Sfx.setRain(biome === 'desert' || biome === 'snow' ? 0 : this.intensity);

    const s = this.scene;
    const view = s.cameras.main.worldView;
    // อนุภาค: ฝน (ไม่ตกบนทะเลทราย/หิมะ) / หิมะ / ทราย
    let want = 0;
    let kind: 'rain' | 'snow' | 'sand' = 'rain';
    if (biome === 'snow') {
      kind = 'snow';
      want = 50 + this.intensity * 80;
    } else if (biome === 'desert') {
      kind = 'sand';
      want = this.intensity * 90;
    } else if (biome === 'savanna' && this.state === 'clear') {
      kind = 'sand';
      want = 14;
    } else want = this.intensity * 160;
    while (this.drops.length < want) this.drops.push(this.spawn(kind, view));
    this.drops = this.drops.filter((d) => {
      d.life -= dt;
      d.img.x += d.vx * dt;
      d.img.y += d.vy * dt;
      if (d.life <= 0 || this.drops.length > want + 10) {
        if (kind === 'rain' && d.life <= 0 && Math.random() < 0.3) this.splash(d.img.x, d.img.y);
        d.img.destroy();
        return false;
      }
      return true;
    });

    // ฟ้าผ่า
    if (this.state === 'storm' && biome !== 'desert' && biome !== 'snow') {
      this.lightning -= dt;
      if (this.lightning <= 0) {
        this.lightning = Phaser.Math.FloatBetween(6, 14);
        s.cameras.main.flash(140, 230, 240, 255);
        s.time.delayedCall(Phaser.Math.Between(300, 1200), () => Sfx.play('thunder'));
      }
    }
  }

  private spawn(kind: 'rain' | 'snow' | 'sand', view: Phaser.Geom.Rectangle): Drop {
    const s = this.scene;
    const x = view.x + Math.random() * (view.width + 60) - 30;
    const y = view.y + Math.random() * view.height * 0.9 - 20;
    if (kind === 'snow') {
      const img = s.add.image(x, y, 'px').setTint(0xf4f4f4).setScale(Math.random() < 0.5 ? 0.5 : 0.8).setDepth(1e6 + 2).setAlpha(0.9);
      return { img, vx: Phaser.Math.Between(-8, 12), vy: Phaser.Math.Between(14, 26), life: Phaser.Math.FloatBetween(2, 5) };
    }
    if (kind === 'sand') {
      const img = s.add.image(x, y, 'px').setTint(0xe3a95f).setScale(0.5).setDepth(1e6 + 2).setAlpha(0.7);
      return { img, vx: Phaser.Math.Between(90, 140), vy: Phaser.Math.Between(-4, 8), life: Phaser.Math.FloatBetween(0.8, 2) };
    }
    const img = s.add.image(x, y, 'raindrop').setDepth(1e6 + 2).setAlpha(0.65);
    return { img, vx: 25, vy: Phaser.Math.Between(170, 220), life: Phaser.Math.FloatBetween(0.25, 0.7) };
  }

  private splash(x: number, y: number) {
    const s = this.scene;
    const r = s.add.circle(x, y, 1).setStrokeStyle(1, 0x73eff7, 0.6).setDepth(-2);
    s.tweens.add({ targets: r, radius: 3, alpha: 0, duration: 260, onComplete: () => r.destroy() });
  }
}
