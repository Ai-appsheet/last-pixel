import Phaser from 'phaser';
import { mobFlies, mobFreeMove, mobSwims, type MobDef } from '../data/mobs';
import { EventBus } from '../core/EventBus';
import type { GameScene } from '../scenes/GameScene';
import { Sfx } from '../core/AudioManager';
import { isWater } from '../world/tiles';
import { STATUS_INFO, type StatusKind } from '../data/weapons';
import { resOf, setWorldScale } from '../gfx/hd';

type State = 'idle' | 'wander' | 'flee' | 'chase' | 'windup' | 'charge';

/** สัตว์/มอนสเตอร์ — AI แบบ state machine (ดูคำอธิบาย ai ใน data/mobs.ts) */
export class Mob extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  declare scene: GameScene;

  readonly def: MobDef;
  hp: number;
  state: State = 'idle';
  /** มาจากภัยพิบัติ (นับเพื่อจบภัย) */
  disaster = false;
  burning = false;
  /** ไม่สนผู้เล่น (เดินเล่นเฉยๆ) — ผู้รอดชีวิตคู่แข่งตอนผู้เล่นไม่ได้อยู่ในเขตผจญภัยของเกาะนั้น */
  calm = false;
  /** หนีผู้เล่น (ผู้รอดชีวิตคู่แข่ง HP ต่ำ) — ใช้ท่าเดินแบบ flee แทน ai ปกติ */
  fleeing = false;
  // ---------- สถานะผิดปกติ (ดู applyStatus) ----------
  burnTime = 0;
  burnDps = 8;
  poisonTime = 0;
  poisonStacks = 0;
  poisonDps = 3;
  bleedTime = 0;
  bleedDps = 5;
  /** ช้าลง (0..0.8) */
  chill = 0;
  chillTime = 0;
  /** แช่แข็งทั้งตัว */
  frozenTime = 0;
  stunTime = 0;
  /** บอสกันสตัน/แช่แข็งซ้ำชั่วคราว */
  private ccImmune = 0;
  private dotAcc: Record<'burn' | 'poison' | 'bleed', number> = { burn: 0, poison: 0, bleed: 0 };
  private dotTick = 0;
  private statusMask = 0;
  private stars: Phaser.GameObjects.Image[] = [];
  /** แฟลชขาวตอนโดนตี / ยุบตัวตอนโดนผลัก (วินาทีที่เหลือ) */
  private flashT = 0;
  private squashT = 0;
  private stateTime = 0;
  private wanderDir = new Phaser.Math.Vector2();
  private chargeDir = new Phaser.Math.Vector2();
  private attackCd = 0;
  private shootCd = 1;
  private specialCd = 4;
  private stun = 0;
  private angry = 0;
  private roared = false;
  /** ฟื้นคืนชีพไปแล้ว (หงส์เพลิง) */
  private revived = false;
  private groanTimer = Math.random() * 8;
  private bob = Math.random() * 10;
  private shadowImg: Phaser.GameObjects.Image;
  private humanoid: boolean;
  private targetStruct: { x: number; y: number; active: boolean } | null = null;

  constructor(scene: GameScene, x: number, y: number, def: MobDef) {
    super(scene, x, y, def.texture, 0);
    this.def = def;
    this.hp = def.hp;
    this.humanoid = scene.anims.exists(`${def.texture}_walk_down`);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    setWorldScale(this, def.scale ?? 1); // texture HD → scale จริง = def.scale / res (ขนาดในโลกเท่าเดิม)
    if (def.tint) this.setTint(def.tint);
    if (def.alpha) this.setAlpha(def.alpha);
    this.fitBody();
    const flying = mobFlies(def);
    this.shadowImg = scene.add.image(x, this.feetY, 'shadow').setDepth(-1).setScale((def.scale ?? 1) * (flying ? 0.6 : 1)).setAlpha(flying ? 0.5 : 1);
    if (mobSwims(def)) this.shadowImg.setVisible(false);
    if (!this.humanoid && scene.anims.exists(`${def.texture}_walk`)) this.play(`${def.texture}_walk`);
  }

  get isBoss() {
    return this.def.ai === 'boss' || !!this.def.legendary || !!this.getData('boss');
  }

  get ignoresWalls() {
    return mobFreeMove(this.def);
  }

  fitBody() {
    // body.setSize/Offset เป็นพิกเซล texture → คูณความละเอียด (texture HD) ให้ขนาด/ตำแหน่งในโลกเท่าเดิม
    const r = resOf(this.texture);
    const w = this.def.body.w * r;
    const h = this.def.body.h * r;
    this.body.setSize(w, h).setOffset((this.width - w) / 2, this.height - h - r);
  }

  get feetY() {
    return this.y + this.displayHeight / 2 - 1;
  }

  get hostile() {
    return !['flee', 'neutral'].includes(this.def.ai) || this.angry > 0;
  }

  update(dt: number) {
    const s = this.scene;
    const player = s.player;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.shootCd -= dt;
    this.specialCd -= dt;
    this.angry = Math.max(0, this.angry - dt);
    this.stateTime -= dt;

    this.tickStatus(dt);
    if (!this.active) return;
    this.tickHitFx(dt);
    if (this.burning) {
      this.hurt(10 * dt, undefined, { silent: true });
      if (!this.active) return;
    }
    if (this.stun > 0 || this.stunTime > 0 || this.frozenTime > 0) {
      this.stun -= dt;
      this.body.velocity.scale(this.frozenTime > 0 ? 0.5 : 0.85);
      this.syncShadow();
      return;
    }

    const px = player.x;
    const py = player.feetY;
    const dist = Phaser.Math.Distance.Between(this.x, this.feetY, px, py);
    const alive = !player.dead && !s.playerSafe && !this.calm;
    const aggro = this.def.aggroRange * (s.dayNight.isNight ? 1.5 : 1);
    const ai = this.def.ai;

    if (this.fleeing && alive) this.state = 'flee';
    else switch (ai) {
      case 'flee':
        this.state = alive && dist < aggro ? 'flee' : this.state === 'flee' ? 'idle' : this.state;
        break;
      case 'neutral':
        this.state = this.angry > 0 && alive ? 'chase' : this.state === 'chase' ? 'idle' : this.state;
        break;
      case 'hunter':
        if (alive && dist < aggro) this.state = 'chase';
        else if (this.state === 'chase' && dist > aggro * 1.6) this.state = 'idle';
        break;
      case 'boss':
        if (this.state !== 'windup' && this.state !== 'charge') this.state = alive && dist < aggro ? 'chase' : 'idle';
        if (this.state === 'chase' && !this.roared) {
          this.roared = true;
          Sfx.play('bossRoar');
          s.cameras.main.shake(500, 0.006);
        }
        break;
      default:
        this.state = alive ? 'chase' : 'wander';
    }

    let vx = 0;
    let vy = 0;
    const speed = this.def.speed * (this.chillTime > 0 ? 1 - this.chill : 1);
    let tx = px;
    let ty = py;
    if (ai === 'wrecker' && this.state === 'chase') {
      if (!this.targetStruct?.active || Math.random() < dt * 0.3) this.targetStruct = s.nearestStructureTo(this.x, this.y, 260);
      if (this.targetStruct?.active) {
        tx = this.targetStruct.x;
        ty = this.targetStruct.y;
      }
    }

    if (this.state === 'windup') {
      if (this.stateTime <= 0) {
        this.state = 'charge';
        this.stateTime = 0.7;
        this.refreshTint();
      }
    } else if (this.state === 'charge') {
      vx = this.chargeDir.x * speed * 4.2;
      vy = this.chargeDir.y * speed * 4.2;
      if (dist < 22 && this.attackCd <= 0) this.strike(1.5);
      if (this.stateTime <= 0) {
        this.state = 'chase';
        this.specialCd = Phaser.Math.FloatBetween(3.5, 5.5);
      }
    } else if (this.state === 'flee' || this.state === 'chase') {
      const v = new Phaser.Math.Vector2(tx - this.x, ty - this.feetY).normalize();
      const sign = this.state === 'flee' ? -1 : 1;
      let move = speed;
      const sh = this.def.shoot;
      if (sh && this.state === 'chase') {
        if (ai === 'ranged') {
          if (dist < sh.range * 0.6) move = -speed * 0.7;
          else if (dist < sh.range) move = 0;
        }
        if (dist < sh.range && this.shootCd <= 0 && alive) {
          this.shootCd = sh.cooldown;
          s.enemyShoot(this, sh);
        }
      }
      const flies = mobFlies(this.def);
      const wob = flies ? Math.sin(s.worldTime * 6 + this.bob) * 0.6 : 0;
      vx = (v.x - v.y * wob) * move * sign;
      vy = (v.y + v.x * wob) * move * sign;
      const reach = this.isBoss ? (this.def.legendary ? 30 : 24) : 13;
      if (this.state === 'chase' && dist < reach && this.attackCd <= 0 && alive) {
        this.strike(1);
        if (!flies) vx = vy = 0;
      }
      // สัตว์ในตำนาน: สุ่มท่าจาก moves (charge/summon ใช้โค้ดเดิม ที่เหลือให้ CreatureSystem ร่าย)
      const beastMove = this.isBoss && this.specialCd <= 0 && dist < 190 && this.def.moves ? Phaser.Utils.Array.GetRandom(this.def.moves) : null;
      if (beastMove && beastMove !== 'charge' && beastMove !== 'summon') {
        this.specialCd = this.def.moveCd ?? 5;
        s.creatures.cast(this, beastMove);
      } else if (this.isBoss && this.specialCd <= 0 && dist < 170) {
        const sp = beastMove ?? this.def.special;
        if (sp === 'charge') {
          this.state = 'windup';
          this.stateTime = 0.7;
          this.chargeDir.copy(v);
          this.setTint(0xff5060);
          // แถบเตือนแนวพุ่งชาร์จ (ระยะที่พุ่งไปได้จริง)
          s.fx.telegraphLine(this.x, this.feetY - 2, Math.atan2(v.y, v.x), Math.min(240, this.def.speed * 4.2 * 0.7) + 14, Math.max(14, this.body.width + 8), 0.7);
          Sfx.play('growl');
        } else if (sp === 'summon' && this.def.summon) {
          this.specialCd = this.def.moves ? this.def.moveCd ?? 9 : 9;
          for (let i = 0; i < (this.def.legendary && s.mobList().filter((m) => m.def.id === this.def.summon).length >= 6 ? 0 : 3); i++) {
            const m = s.spawnMob(this.def.summon, this.x + Phaser.Math.Between(-30, 30), this.y + Phaser.Math.Between(-30, 30));
            m.disaster = this.disaster;
            s.fx.poof(m.x, m.y, 0xb13e53, 8);
          }
          Sfx.play('bossRoar');
        }
      }
    } else {
      if (this.stateTime <= 0) {
        if (this.state === 'wander') {
          this.state = 'idle';
          this.stateTime = Phaser.Math.FloatBetween(1, 3);
        } else {
          this.state = 'wander';
          this.stateTime = Phaser.Math.FloatBetween(1, 2.5);
          this.wanderDir.setToPolar(Math.random() * Math.PI * 2, 1);
        }
      }
      if (this.state === 'wander') {
        vx = this.wanderDir.x * speed * 0.4;
        vy = this.wanderDir.y * speed * 0.4;
      }
    }

    const nx = Math.floor((this.x + vx * dt * 4) / 16);
    const ny = Math.floor((this.feetY + vy * dt * 4) / 16);
    if (mobSwims(this.def) && !isWater(s.tileAt(nx, ny))) {
      vx = -vx * 0.3;
      vy = -vy * 0.3;
    }
    if (this.hostile && s.isSafeTile(nx, ny)) {
      vx = -vx;
      vy = -vy;
    }

    if (ai === 'zombie' || ai === 'wrecker') {
      this.groanTimer -= dt;
      if (this.groanTimer <= 0 && dist < 160) {
        this.groanTimer = Phaser.Math.FloatBetween(5, 11);
        Sfx.play(this.def.id === 'golem' ? 'growl' : 'zombie', 600);
      }
    }

    if (ai === 'wrecker' && this.targetStruct?.active && Phaser.Math.Distance.Between(this.x, this.feetY, tx, ty) < 22 && this.attackCd <= 0) {
      this.attackCd = 1.4;
      s.damageStructureAt(tx, ty, this.def.attack * (this.def.structureMult ?? 1));
      s.cameras.main.shake(80, 0.003);
    }

    this.body.setVelocity(vx, vy);
    this.animate(vx, vy);
    this.syncShadow();
  }

  private strike(mult: number) {
    const s = this.scene;
    const player = s.player;
    this.attackCd = this.isBoss ? 1.3 : 1.0;
    if (s.boatRiding && (mobSwims(this.def) || this.def.move === 'amphi')) {
      s.damageBoat(this.def.attack * mult);
      return;
    }
    player.lastDamage = this.def.name;
    const dmg = player.hurt(this.def.attack * mult, this);
    if (dmg > 0) s.fx.damageNumber(player.x, player.y - 12, dmg, 0xef7d57);
    if (dmg > 0 && this.def.onHit) s.creatures.afflict(this.def.onHit, this.def.name);
  }

  private syncShadow() {
    const fly = mobFlies(this.def) ? 10 : 0;
    this.setDepth(this.feetY + (fly ? 40 : 0));
    this.shadowImg.setPosition(Math.round(this.x), Math.round(this.feetY + fly));
  }

  protected animate(vx: number, vy: number) {
    const moving = Math.abs(vx) + Math.abs(vy) > 1;
    const tex = this.def.texture;
    if (this.humanoid) {
      if (!moving) {
        this.anims.stop();
        return;
      }
      if (Math.abs(vx) > Math.abs(vy)) {
        this.setFlipX(vx < 0);
        this.anims.play(`${tex}_walk_side`, true);
      } else {
        this.setFlipX(false);
        this.anims.play(vy < 0 ? `${tex}_walk_up` : `${tex}_walk_down`, true);
      }
      return;
    }
    if (Math.abs(vx) > 1) this.setFlipX(vx < 0);
    if (tex === 'rabbit') {
      this.bob += moving ? 0.35 : 0;
      const r = resOf(this.texture);
      this.setDisplayOrigin(8 * r, this.height / 2 + (moving ? Math.abs(Math.sin(this.bob)) * 3 * r : 0));
      return;
    }
    const anim = `${tex}_walk`;
    if (!this.scene.anims.exists(anim)) return;
    const always = ['bat', 'slime', 'serpent'].includes(tex) || mobFlies(this.def) || mobSwims(this.def);
    if (moving || always) this.anims.play(anim, true);
    else this.anims.stop();
  }

  bumpStructure(damageFn: (mult: number) => void) {
    if ((this.state !== 'chase' && this.state !== 'charge') || this.attackCd > 0 || this.ignoresWalls) return;
    this.attackCd = 1.0;
    damageFn(this.def.structureMult ?? 1);
  }

  /**
   * โดนตี — knock = ตัวคูณแรงผลัก (0 = ไม่ผลัก) · armorPierce = ทะลุเกราะ 0..1 · color = สีตัวเลขดาเมจ
   * แช่แข็งอยู่รับดาเมจ +20% (แตกเป็นเสี่ยง)
   */
  hurt(amount: number, from?: { x: number; y: number }, opts: { silent?: boolean; crit?: boolean; knock?: number; armorPierce?: number; color?: number } = {}) {
    if (!this.active) return;
    const armor = (this.def.armor ?? 0) * (1 - (opts.armorPierce ?? 0));
    const dmg = amount * (1 - armor) * (this.frozenTime > 0 && !opts.silent ? 1.2 : 1);
    this.hp -= dmg;
    if (!opts.silent) {
      this.scene.fx.damageNumber(this.x, this.y - this.displayHeight / 2, dmg, opts.crit ? 0xffcd75 : opts.color ?? 0xffffff, opts.crit);
      this.setTintFill(0xffffff);
      this.flashT = 0.06;
      const heavy = this.isBoss || this.def.id === 'golem';
      if (!heavy) this.stun = 0.18;
      if (this.def.ai === 'neutral') this.angry = 8;
      if (this.def.ai === 'hunter') this.state = 'chase';
      if (this.def.ai === 'flee') this.state = 'flee';
      const knock = opts.knock ?? 1;
      // ตัวหนัก (บอส/โกเลม) ขยับเฉพาะอาวุธผลักแรงๆ · แช่แข็งอยู่ไม่กระเด็น
      const kb = this.frozenTime > 0 ? 0 : heavy ? (knock >= 1.5 ? 30 * knock : 0) : 150 * knock;
      if (from && kb > 0) {
        const k = new Phaser.Math.Vector2(this.x - from.x, this.y - from.y).normalize().scale(kb);
        this.body.setVelocity(k.x, k.y);
        this.squashT = 0.14;
      }
    }
    if (this.hp <= 0) {
      if (this.def.revive && !this.revived) return this.rebirth();
      this.scene.onMobKilled(this);
    }
  }

  /** ฟื้นคืนชีพจากเถ้าถ่าน 1 ครั้ง (HP 50% · ล้างสถานะ) */
  private rebirth() {
    const s = this.scene;
    this.revived = true;
    this.hp = this.def.hp * 0.5;
    this.burnTime = this.poisonTime = this.bleedTime = this.chillTime = this.frozenTime = this.stunTime = 0;
    this.refreshTint();
    s.fx.ring(this.x, this.y, 0xef7d57, 60);
    s.fx.sparks(this.x, this.y, 0xffcd75, 24, 40);
    s.cameras.main.shake(400, 0.008);
    Sfx.play('bossRoar');
    EventBus.emit('toast', `🔥 ${this.def.name}ฟื้นคืนชีพจากเถ้าถ่าน!`, '#ef7d57');
  }

  // ---------------------------------------------------------------- สถานะผิดปกติ

  /**
   * ใส่สถานะ: burn/poison/bleed = power ดาเมจต่อวิ (พิษซ้อนได้ 5 ชั้น) · freeze = power % ช้าลง (≥1 = แช่แข็งทั้งตัว) · stun = หยุดนิ่ง
   * บอสต้านทาน (เวลาสั้นลง + กันสตัน/แช่แข็งซ้ำ 4 วิ) · โกเลมต้านบางส่วน
   */
  applyStatus(kind: StatusKind, dur: number, power = 0): boolean {
    if (!this.active || dur <= 0) return false;
    const heavy = this.isBoss || this.def.id === 'golem';
    const ctrl = kind === 'stun' || kind === 'freeze';
    if (ctrl && this.isBoss && this.ccImmune > 0) return false;
    const d = dur * (this.isBoss ? (ctrl ? 0.3 : 0.5) : heavy ? 0.6 : 1);
    switch (kind) {
      case 'burn':
        this.burnDps = this.burnTime > 0 ? Math.max(this.burnDps, power || 8) : power || 8;
        this.burnTime = Math.max(this.burnTime, d);
        break;
      case 'poison':
        this.poisonStacks = Math.min(5, (this.poisonTime > 0 ? this.poisonStacks : 0) + 1);
        this.poisonDps = this.poisonTime > 0 ? Math.max(this.poisonDps, power || 3) : power || 3;
        this.poisonTime = Math.max(this.poisonTime, d);
        break;
      case 'bleed':
        this.bleedDps = this.bleedTime > 0 ? Math.max(this.bleedDps, power || 5) : power || 5;
        this.bleedTime = Math.max(this.bleedTime, d);
        break;
      case 'freeze':
        if (power >= 1 && !this.isBoss) this.frozenTime = Math.max(this.frozenTime, d);
        this.chill = Math.max(this.chillTime > 0 ? this.chill : 0, Math.min(0.8, power >= 1 ? 0.7 : power || 0.5));
        this.chillTime = Math.max(this.chillTime, d * (power >= 1 ? 1.5 : 1));
        break;
      case 'stun':
        this.stunTime = Math.max(this.stunTime, d);
        break;
    }
    if (ctrl && this.isBoss) this.ccImmune = 4;
    if (ctrl) this.scene.fx.ring(this.x, this.y, STATUS_INFO[kind].color, 12);
    this.refreshTint();
    return true;
  }

  get frozen() {
    return this.frozenTime > 0;
  }

  /** เดินเวลาสถานะ + ดาเมจต่อเนื่อง (ตัวเลขสีตามธาตุทุก 0.5 วิ) + เอฟเฟกต์ */
  private tickStatus(dt: number) {
    const s = this.scene;
    this.ccImmune = Math.max(0, this.ccImmune - dt);
    let dot = 0;
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      this.dotAcc.burn += this.burnDps * dt;
      dot += this.burnDps * dt;
      s.fx.status('burn', this.x, this.y, this.displayWidth, this.displayHeight, dt);
    }
    if (this.poisonTime > 0) {
      this.poisonTime -= dt;
      const p = this.poisonDps * this.poisonStacks * dt;
      this.dotAcc.poison += p;
      dot += p;
      s.fx.status('poison', this.x, this.y, this.displayWidth, this.displayHeight, dt, 1 + this.poisonStacks * 0.6);
      if (this.poisonTime <= 0) this.poisonStacks = 0;
    }
    if (this.bleedTime > 0) {
      this.bleedTime -= dt;
      // เลือดออก: ยิ่งเคลื่อนที่ยิ่งเสียเลือด
      const moving = this.body.velocity.lengthSq() > 100;
      const b = this.bleedDps * (moving ? 1.6 : 0.5) * dt;
      this.dotAcc.bleed += b;
      dot += b;
      s.fx.status('bleed', this.x, this.y, this.displayWidth, this.displayHeight, dt, moving ? 2.2 : 0.7);
    }
    if (this.chillTime > 0) {
      this.chillTime -= dt;
      s.fx.status('chill', this.x, this.y, this.displayWidth, this.displayHeight, dt);
    }
    if (this.frozenTime > 0) {
      this.frozenTime -= dt;
      s.fx.status('frozen', this.x, this.y, this.displayWidth, this.displayHeight, dt);
    }
    if (this.stunTime > 0) this.stunTime -= dt;
    this.updateStars();
    if (dot > 0) this.hurt(dot, undefined, { silent: true });
    if (!this.active) return;
    // ตัวเลขดาเมจต่อเนื่อง สีตามสถานะ
    this.dotTick -= dt;
    if (this.dotTick <= 0) {
      this.dotTick = 0.5;
      let i = 0;
      for (const k of ['burn', 'poison', 'bleed'] as const) {
        if (this.dotAcc[k] >= 1) {
          s.fx.damageNumber(this.x + (i++ - 1) * 6, this.y - this.displayHeight / 2 - 2, this.dotAcc[k], STATUS_INFO[k].color);
          this.dotAcc[k] = 0;
        }
      }
    }
    const mask = (this.burnTime > 0 ? 1 : 0) | (this.poisonTime > 0 ? 2 : 0) | (this.bleedTime > 0 ? 4 : 0) | (this.chillTime > 0 ? 8 : 0) | (this.frozenTime > 0 ? 16 : 0);
    if (mask !== this.statusMask) {
      this.statusMask = mask;
      this.refreshTint();
    }
  }

  /** แฟลชขาวหมดเวลา → คืนสี · ยุบ-ยืดตัวตอนโดนผลัก · ไฟลุกกะพริบสี */
  private tickHitFx(dt: number) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.refreshTint();
    } else if (this.state === 'windup') {
      this.setTint(Math.floor(this.scene.worldTime * 12) % 2 ? 0xff5060 : 0xffc0c8); // กะพริบแดงตอนง้าง
    } else if (this.burnTime > 0 && this.frozenTime <= 0 && this.chillTime <= 0 && this.poisonTime <= 0) {
      this.setTint(Math.sin(this.scene.worldTime * 28 + this.bob) > 0 ? 0xffb080 : 0xffe0a0);
    }
    if (this.squashT > 0) {
      this.squashT = Math.max(0, this.squashT - dt);
      const k = this.squashT / 0.14;
      const sc = this.def.scale ?? 1;
      setWorldScale(this, sc * (1 + 0.22 * k), sc * (1 - 0.18 * k));
    }
  }

  /** สีตัวตามสถานะ (แช่แข็ง > เย็น > พิษ > ไฟ > เลือด > สีประจำตัว) */
  refreshTint() {
    if (!this.active || this.flashT > 0) return;
    if (this.state === 'windup') {
      this.setTint(0xff5060); // กำลังง้างชาร์จ (กะพริบใน tickHitFx)
      return;
    }
    this.clearTint();
    const t = this.frozenTime > 0 ? 0x73eff7 : this.chillTime > 0 ? 0xa8d8ff : this.poisonTime > 0 ? 0xb8f08a : this.burnTime > 0 ? 0xffb080 : this.bleedTime > 0 ? 0xffa0a8 : this.def.tint;
    if (t) this.setTint(t);
  }

  /** ดาวหมุนเหนือหัวตอนมึน */
  private updateStars() {
    if (this.stunTime > 0 && !this.stars.length) {
      for (let i = 0; i < 3; i++) this.stars.push(this.scene.add.image(this.x, this.y, 'fx_star').setDepth(1e6 + 3).setScale(0.6));
    }
    if (!this.stars.length) return;
    if (this.stunTime <= 0) {
      this.clearStars();
      return;
    }
    const spin = this.scene.worldTime * 7;
    const top = this.y - this.displayHeight / 2 - 3;
    this.stars.forEach((st, i) => {
      const a = spin + (i * Math.PI * 2) / 3;
      st.setPosition(this.x + Math.cos(a) * 7, top + Math.sin(a) * 2.5).setScale(0.5 + 0.15 * Math.sin(a)).setDepth(Math.sin(a) < 0 ? this.depth - 0.1 : 1e6 + 3);
    });
  }

  private clearStars() {
    for (const st of this.stars) st.destroy();
    this.stars = [];
  }

  destroy(fromScene?: boolean) {
    this.clearStars();
    this.shadowImg?.destroy();
    super.destroy(fromScene);
  }
}
