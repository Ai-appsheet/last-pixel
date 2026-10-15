import Phaser from 'phaser';
import { Sfx } from '../core/AudioManager';
import { EventBus } from '../core/EventBus';
import { MetaSave } from '../core/MetaSave';
import type { GameScene } from '../scenes/GameScene';
import { isLand } from '../world/tiles';
import { GOLD_BOX_GEMS } from '../data/loot';
import { bkkDayKey, msToMidnight, shiftDayKey } from '../core/WorldClock';

/**
 * 🎁 กล่องฟรีรายวัน (วันจริง เวลาไทย · 1 ครั้ง/วัน/บัญชี) — ข้อยกเว้นของกฎ "เกาะเราได้แค่กล่องไม้" (ไม่ผ่าน capBox)
 *  วันปกติ: ไม้ 55% / เหล็ก 30% / ทอง 12% / เพชร 3%
 *  ต่อเนื่อง 3 วันขึ้นไป: ไม้ 43% / เหล็ก 32% / ทอง 20% / เพชร 5%
 *  ทุกวันที่ 7, 14, 21 … ต่อเนื่อง: การันตีทอง — ทอง 90% / เพชร 10%
 *  ขาด 1 วัน = เริ่มนับวันที่ 1 ใหม่
 */
export function dailyBoxOdds(streak: number): [string, number][] {
  if (streak > 0 && streak % 7 === 0) return [['box_gold', 0.9], ['box_legend', 0.1]];
  if (streak >= 3) return [['box_wood', 0.43], ['box_iron', 0.32], ['box_gold', 0.2], ['box_legend', 0.05]];
  return [['box_wood', 0.55], ['box_iron', 0.3], ['box_gold', 0.12], ['box_legend', 0.03]];
}

export function rollDailyBox(streak: number, r = Math.random()): string {
  const odds = dailyBoxOdds(streak);
  for (const [tier, p] of odds) if ((r -= p) < 0) return tier;
  return odds[odds.length - 1][0];
}

/**
 * ระบบรายวัน (ทุกเช้า):
 *  - ตู้จดหมายที่เกาะของคุณ: ของขวัญรายวัน + โบนัสล็อกอินวันจริง + เงินจากของที่ขายได้ที่เกาะกลาง
 *  - กล่องร่มชูชีพตกบนเกาะของคุณ 1 กล่อง และเกาะอื่น 1 กล่อง (แข่งกันเก็บ)
 */
export class DailySystem {
  airdrops: { x: number; y: number; opened: boolean; landed: boolean; sprite: Phaser.GameObjects.Image; chute?: Phaser.GameObjects.Image }[] = [];
  mailboxReady = true;
  /** ของในตู้จดหมาย (รวมเงินจากการขาย) */
  mailbox: [string, number][] = [];

  constructor(private scene: GameScene) {}

  onDayStart(day: number) {
    const s = this.scene;
    this.airdrops = this.airdrops.filter((a) => {
      if (!a.opened) return true;
      a.sprite.destroy();
      return false;
    });
    const islands = [s.world.home, ...s.world.slots.filter((x) => x && x.biome !== 'central' && x.biome !== 'dungeon' && x.biome !== 'special' && !x.event && x.index !== s.world.home).map((x) => x!.index)];
    const other = islands.length > 1 ? Phaser.Utils.Array.GetRandom(islands.slice(1)) : s.world.home;
    for (const idx of [s.world.home, other]) {
      const p = this.randomLand(idx);
      if (p) this.spawnAirdrop(p.x, p.y, true);
    }
    // ตู้จดหมายอยู่บนเกาะเรา → กล่องผ่านเพดาน (ทุก 5 วัน: กล่องเหล็ก → ไม้)
    const sp = s.world.spawn;
    this.mailbox.push(['coin', 10 + day * 3], ['box_wood', 1]);
    if (day % 5 === 0) this.mailbox.push([s.capBox('box_iron', 'daily', sp.tx * 16, sp.ty * 16), 1]);
    this.setMailbox(true);
    EventBus.emit('toast', '📦 กล่องร่มชูชีพกำลังลง (จุดเหลืองบนแผนที่)', '#ffcd75');
    EventBus.emit('toast', '📬 มีของในตู้จดหมายที่เกาะของคุณ', '#a7f070');
  }

  randomLand(slot: number): { x: number; y: number } | null {
    const s = this.scene;
    const is = s.world.slots[slot];
    if (!is) return null;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * is.r * 0.8;
      const tx = Math.round(is.cx + Math.cos(a) * r);
      const ty = Math.round(is.cy + Math.sin(a) * r);
      if (!isLand(s.tileAt(tx, ty)) || s.isTileBlocked(tx, ty) || s.structureAt(tx, ty, 'object') || s.world.islandAt(tx, ty) !== slot) continue;
      return { x: tx * 16 + 8, y: ty * 16 + 15 };
    }
    return null;
  }

  spawnAirdrop(x: number, y: number, animate: boolean, opened = false) {
    const s = this.scene;
    const sprite = s.add.image(x, y, opened ? 'airdrop_open' : 'airdrop').setOrigin(0.5, 1).setDepth(y);
    const a: DailySystem['airdrops'][number] = { x, y, opened, landed: !animate, sprite };
    this.airdrops.push(a);
    if (!animate) return;
    sprite.setY(y - 220).setDepth(1e5);
    a.chute = s.add.image(x, y - 232, 'parachute').setOrigin(0.5, 1).setDepth(1e5);
    s.tweens.add({
      targets: sprite, y, duration: 6000, ease: 'Sine.easeIn',
      onUpdate: () => {
        const sway = Math.sin(s.time.now * 0.003) * 4;
        sprite.x = x + sway;
        a.chute?.setPosition(sprite.x, sprite.y - 12).setAngle(sway * 2);
      },
      onComplete: () => {
        a.landed = true;
        sprite.setPosition(x, y).setDepth(y);
        s.fx.poof(x, y - 2, 0xc9a46a, 10);
        if (a.chute) s.tweens.add({ targets: a.chute, alpha: 0, angle: 70, duration: 900, onComplete: () => a.chute?.destroy() });
      },
    });
  }

  nearest(px: number, py: number, range: number) {
    return this.airdrops.find((a) => a.landed && !a.opened && Phaser.Math.Distance.Between(px, py, a.x, a.y - 4) < range) ?? null;
  }

  open(a: DailySystem['airdrops'][number]) {
    a.opened = true;
    a.sprite.setTexture('airdrop_open');
    // กล่องร่มบนเกาะเรา = กล่องไม้ · บนเกาะอื่น (เขตผจญภัย) = ทอง 15% / เหล็ก 42.5% / ไม้
    const tier = this.scene.capBox(Math.random() < 0.15 ? 'box_gold' : Math.random() < 0.5 ? 'box_iron' : 'box_wood', 'daily', a.x, a.y);
    this.scene.spawnDrop(a.x, a.y - 2, tier, 1);
    this.scene.spawnDrop(a.x, a.y - 2, 'coin', Phaser.Math.Between(20, 60));
    this.scene.fx.sparks(a.x, a.y - 8, 0xffcd75, 12, 22);
    Sfx.play('levelUp');
    EventBus.emit('toast', 'เปิดกล่องร่มชูชีพ!', '#ffcd75');
  }

  setMailbox(ready: boolean) {
    this.mailboxReady = ready;
    this.scene.mailboxSprite?.setTexture(ready ? 'mailbox_flag' : 'mailbox');
  }

  /** เพิ่มของเข้าตู้จดหมาย (เช่น เงินจากการขายที่เกาะกลาง) */
  deliver(item: string, qty: number, note?: string) {
    this.mailbox.push([item, qty]);
    this.setMailbox(true);
    if (note) EventBus.emit('toast', note, '#ffcd75');
  }

  private boxCache = { at: 0, ok: false };
  /** รับกล่องฟรีวันนี้ได้ไหม (แคช 1 วิ — ใช้ทุกเฟรมได้) */
  get boxAvailable(): boolean {
    const now = Date.now();
    if (now - this.boxCache.at > 1000) this.boxCache = { at: now, ok: this.dailyBoxStatus().available };
    return this.boxCache.ok;
  }

  /** สถานะกล่องฟรีวันนี้ (HUD/ตู้จดหมาย) */
  dailyBoxStatus() {
    const today = bkkDayKey();
    const st = MetaSave.dailyBoxStatus(today, shiftDayKey(today, -1));
    return { ...st, msToReset: msToMidnight(), odds: dailyBoxOdds(st.streak) };
  }

  /** รับกล่องฟรีวันนี้ (ปุ่ม HUD หรือตู้จดหมาย) → tier ที่ได้ หรือ null ถ้ารับไปแล้ว */
  claimDailyBox(x?: number, y?: number): string | null {
    const s = this.scene;
    const today = bkkDayKey();
    const streak = MetaSave.claimDailyBox(today, shiftDayKey(today, -1));
    this.boxCache.at = 0;
    if (!streak) {
      EventBus.emit('toast', '🎁 รับกล่องฟรีของวันนี้ไปแล้ว — มาใหม่หลังเที่ยงคืน (เวลาไทย)', '#94b0c2');
      return null;
    }
    const tier = rollDailyBox(streak);
    s.spawnDrop(x ?? s.player.x, (y ?? s.player.y) + 6, tier, 1);
    Sfx.play('levelUp');
    s.fx.sparks(x ?? s.player.x, (y ?? s.player.y) - 6, 0xffcd75, 14, 22);
    const next = streak % 7 === 6 ? 'พรุ่งนี้การันตีกล่องทอง!' : streak < 3 ? 'ครบ 3 วันโอกาสกล่องทองเพิ่ม' : '';
    // 🎰 UI เล่นวงล้อสุ่มกล่อง (fx/RewardFx.dailyRoll) แล้วโชว์ผล + คำใบ้วันถัดไป
    EventBus.emit('dailybox:claimed', tier, streak, next);
    return tier;
  }

  claim() {
    if (!this.mailboxReady && !this.dailyBoxStatus().available) return;
    // ตู้จดหมาย = ที่รับกล่องฟรีรายวันอีกทางหนึ่ง
    if (this.dailyBoxStatus().available) {
      const b = this.scene.mailboxSprite;
      this.claimDailyBox(b?.x, b?.y);
      if (!this.mailboxReady) return;
    }
    const streak = MetaSave.claimLogin();
    if (streak > 0) {
      this.mailbox.push(['coin', Math.min(200, 25 * streak)]);
      // ทุก 7 วัน: เพชร 1 + 4 (แทนกล่องทอง = ราคากล่องทองที่พ่อค้ากลาง — กล่องทองไม่ส่งถึงเกาะเราแล้ว)
      if (streak % 7 === 0) this.mailbox.push(['gem', 1 + GOLD_BOX_GEMS]);
      EventBus.emit('toast', `🎁 โบนัสล็อกอินวันที่ ${streak} ติดต่อกัน!`, '#ffcd75');
    }
    const box = this.scene.mailboxSprite;
    const x = box?.x ?? this.scene.player.x;
    const y = box?.y ?? this.scene.player.y;
    for (const [item, qty] of this.mailbox) this.scene.spawnDrop(x, y + 4, item, qty);
    this.mailbox = [];
    this.setMailbox(false);
    Sfx.play('levelUp');
    EventBus.emit('toast', '📬 รับของจากตู้จดหมายแล้ว', '#a7f070');
  }
}
