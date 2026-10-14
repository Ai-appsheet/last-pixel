import Phaser from 'phaser';

const FX_DEPTH = 1e6 + 5;

/** เอฟเฟกต์การต่อสู้: ตัวเลขดาเมจ, ประกายไฟ, วงแรงกระแทก, hit-stop, ควันตอนตาย */
export class CombatFX {
  private stopping = false;

  constructor(private scene: Phaser.Scene) {}

  /** ตัวเลขดาเมจลอยขึ้น (pixel digits) */
  damageNumber(x: number, y: number, amount: number, color = 0xffffff, crit = false) {
    const s = this.scene;
    const str = String(Math.max(1, Math.round(amount))) + (crit ? '!' : '');
    const c = s.add.container(Math.round(x), Math.round(y)).setDepth(FX_DEPTH);
    const w = str.length * 4;
    [...str].forEach((ch, i) => {
      c.add(s.add.image(i * 4 - w / 2 + 2, 0, `digit_${ch}`).setTint(color));
    });
    const scale = crit ? 1.5 : 1;
    c.setScale(scale * 1.6);
    s.tweens.add({ targets: c, scale, duration: 120, ease: 'Back.easeOut' });
    s.tweens.add({
      targets: c,
      y: y - 16 - (crit ? 6 : 0),
      x: x + Phaser.Math.Between(-5, 5),
      duration: 650,
      ease: 'Cubic.easeOut',
    });
    s.tweens.add({ targets: c, alpha: 0, delay: 420, duration: 260, onComplete: () => c.destroy() });
  }

  /** ประกายกระแทก (บวกแสง) */
  sparks(x: number, y: number, color: number, n = 6, speed = 18) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = speed * (0.5 + Math.random());
      const p = s.add.image(x, y, 'px').setTint(color).setScale(0.5).setDepth(FX_DEPTH).setBlendMode(Phaser.BlendModes.ADD);
      s.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.15,
        duration: Phaser.Math.Between(180, 320), ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
  }

  /** เศษวัสดุกระเด็น (ไม้/หิน/ใบไม้) มีแรงโน้มถ่วง */
  debris(x: number, y: number, color: number, n = 5) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const p = s.add.image(x, y, 'px').setTint(color).setScale(0.5).setDepth(y + 10);
      const vx = Phaser.Math.Between(-14, 14);
      s.tweens.add({ targets: p, x: x + vx, duration: 380, ease: 'Linear' });
      s.tweens.add({
        targets: p, y: { from: y, to: y - Phaser.Math.Between(6, 12) }, duration: 160, ease: 'Quad.easeOut', yoyo: true,
        onComplete: () => s.tweens.add({ targets: p, alpha: 0, duration: 300, delay: 200, onComplete: () => p.destroy() }),
      });
    }
  }

  ring(x: number, y: number, color: number, radius = 12) {
    const s = this.scene;
    const r = s.add.circle(x, y, 2).setStrokeStyle(1, color).setDepth(FX_DEPTH);
    s.tweens.add({ targets: r, radius, alpha: 0, duration: 220, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }

  /** รอยฟันตามทิศ (สีตามอาวุธ) */
  slash(x: number, y: number, angle: number, color: number, depth: number, big = false) {
    const s = this.scene;
    const fx = s.add.image(x, y, 'slash').setRotation(angle).setDepth(depth).setTint(color).setScale(big ? 1.25 : 1);
    s.tweens.add({ targets: fx, alpha: 0, scale: (big ? 1.25 : 1) * 1.2, duration: 150, onComplete: () => fx.destroy() });
  }

  /** หยุดฟิสิกส์ชั่วขณะให้การโจมตีหนักแน่น */
  hitStop(ms = 55) {
    if (this.stopping) return;
    const world = (this.scene as Phaser.Scene & { physics: Phaser.Physics.Arcade.ArcadePhysics }).physics.world;
    this.stopping = true;
    world.pause();
    setTimeout(() => {
      world.resume();
      this.stopping = false;
    }, ms);
  }

  poof(x: number, y: number, color = 0x94b0c2, n = 8) {
    const s = this.scene;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = s.add.image(x, y, 'px').setTint(color).setScale(1).setDepth(FX_DEPTH).setAlpha(0.8);
      s.tweens.add({
        targets: p, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6 - 4, alpha: 0, scale: 2.2,
        duration: 480, ease: 'Quad.easeOut', onComplete: () => p.destroy(),
      });
    }
  }
}
