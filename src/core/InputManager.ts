import Phaser from 'phaser';
import { getControlMode } from './ControlMode';

type Key = Phaser.Input.Keyboard.Key;

/** สถานะปุ่มจากจอสัมผัส (UIScene เป็นคนเขียน) */
export interface TouchState {
  move: Phaser.Math.Vector2;
  held: Set<string>;
  pressed: Set<string>;
  /** ทิศเล็งจากปุ่มโจมตี (มือถือเล็งตามทิศที่เดิน) */
  aim: Phaser.Math.Vector2 | null;
}

/** ปุ่มจอยเกมมาตรฐาน (Xbox layout) → ชื่อคำสั่ง */
const PAD_MAP: Record<number, string> = {
  0: 'interact', 1: 'dodge', 2: 'use', 3: 'skill', 4: 'hotprev', 5: 'hotnext', 6: 'sprint', 7: 'attack',
  8: 'pad_bag', 9: 'pad_menu', 10: 'auto', 11: 'pad_tilt', 12: 'zoomin', 13: 'zoomout',
};

/** รวมคีย์บอร์ด + จอสัมผัส + จอยเกมไว้ที่เดียว — โค้ดเกมเรียก move()/held()/pressed() โดยไม่ต้องสนว่ามาจากไหน */
export class InputManager {
  private keys: Record<string, Key>;
  readonly touch: TouchState = { move: new Phaser.Math.Vector2(), held: new Set(), pressed: new Set(), aim: null };
  private autoTouch: boolean;
  private autoPad = false;
  private padHeld = new Set<string>();
  private padPressed = new Set<string>();
  private padMove = new Phaser.Math.Vector2();
  /** ทิศเดินจากโหมดออโต้ (ผู้เล่นบังคับเองได้ทับเสมอ) */
  autoMove: Phaser.Math.Vector2 | null = null;
  /** ผู้เล่นกำลังบังคับเดินเอง (ไม่นับออโต้) */
  manualMoving = false;
  /** ทิศเล็งจากอนาล็อกขวา (null = ไม่ได้เล็ง) */
  padAim: Phaser.Math.Vector2 | null = null;

  /** แสดงปุ่มบนจอ (มือถือ) — ตามโหมดที่เลือก หรือตรวจจับอัตโนมัติ */
  get touchMode(): boolean {
    const m = getControlMode();
    if (m === 'auto') return this.autoTouch && !this.autoPad;
    return m === 'touch';
  }
  set touchMode(v: boolean) {
    this.autoTouch = v;
    if (v) this.autoPad = false;
  }
  /** กำลังเล่นด้วยจอยเกม */
  get padMode(): boolean {
    const m = getControlMode();
    return m === 'gamepad' || (m === 'auto' && this.autoPad);
  }

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.W, down: K.S, left: K.A, right: K.D,
      up2: K.UP, down2: K.DOWN, left2: K.LEFT, right2: K.RIGHT,
      sprint: K.SHIFT, dodge: K.SPACE, interact: K.E, skill: K.Q, use: K.F,
      auto: K.T,
      one: K.ONE, two: K.TWO, three: K.THREE, four: K.FOUR,
      five: K.FIVE, six: K.SIX, seven: K.SEVEN, eight: K.EIGHT,
    }, true, false) as Record<string, Key>;
    kb.addCapture([K.TAB, K.SPACE]);
    this.autoTouch = scene.sys.game.device.input.touch && !scene.sys.game.device.os.desktop;
    kb.on('keydown', (e: KeyboardEvent) => {
      this.autoTouch = false;
      this.autoPad = false;
      // จำการกดไว้จนกว่าเกมจะอ่าน — กดเร็วๆ (ลง+ขึ้นในเฟรมเดียว หรือเครื่องช้า) จะได้ไม่หาย
      if (e.repeat) return;
      for (const [name, key] of Object.entries(this.keys)) if (key.keyCode === e.keyCode) this.keyBuf.set(name, performance.now());
    });
    this.scene = scene;
  }
  private scene: Phaser.Scene;
  /** ปุ่มที่กดแล้วยังไม่ถูกอ่าน → เวลาที่กด */
  private keyBuf = new Map<string, number>();

  /** อ่านจอยเกม (เรียกทุกเฟรมก่อนใช้ move/held/pressed) */
  pollPad() {
    const gp = this.scene.input.gamepad;
    const pad = gp?.total ? gp.getPad(0) ?? gp.pad1 : null;
    this.padMove.set(0, 0);
    this.padAim = null;
    if (!pad) {
      this.padHeld.clear();
      return;
    }
    const dead = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
    const lx = dead(pad.leftStick.x);
    const ly = dead(pad.leftStick.y);
    const dx = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    this.padMove.set(lx || dx, ly);
    const rx = dead(pad.rightStick.x);
    const ry = dead(pad.rightStick.y);
    if (rx || ry) this.padAim = new Phaser.Math.Vector2(rx, ry).normalize();
    let any = !!(lx || ly || rx || ry || dx);
    for (const [i, name] of Object.entries(PAD_MAP)) {
      const b = pad.buttons[Number(i)];
      const down = !!b && (b.pressed || b.value > 0.5);
      if (down) {
        any = true;
        if (!this.padHeld.has(name)) this.padPressed.add(name);
        this.padHeld.add(name);
      } else this.padHeld.delete(name);
    }
    if (any) {
      this.autoPad = true;
      this.autoTouch = false;
    }
  }

  move(): Phaser.Math.Vector2 {
    const m = this.manualMove();
    this.manualMoving = m.lengthSq() > 0;
    if (!this.manualMoving && this.autoMove) return this.autoMove.clone().limit(1);
    return m;
  }

  private manualMove(): Phaser.Math.Vector2 {
    if (this.padMove.lengthSq() > 0.04) return this.padMove.clone().limit(1);
    const k = this.keys;
    const x = (k.right.isDown || k.right2.isDown ? 1 : 0) - (k.left.isDown || k.left2.isDown ? 1 : 0);
    const y = (k.down.isDown || k.down2.isDown ? 1 : 0) - (k.up.isDown || k.up2.isDown ? 1 : 0);
    if (x || y) return new Phaser.Math.Vector2(x, y).normalize();
    const t = this.touch.move;
    return t.lengthSq() > 0.04 ? t.clone().limit(1) : new Phaser.Math.Vector2();
  }

  held(name: string): boolean {
    return !!this.keys[name]?.isDown || this.touch.held.has(name) || this.padHeld.has(name);
  }

  pressed(name: string): boolean {
    if (this.touch.pressed.delete(name)) return true;
    if (this.padPressed.delete(name)) return true;
    const key = this.keys[name];
    const t = this.keyBuf.get(name);
    if (t !== undefined) {
      this.keyBuf.delete(name);
      if (key) Phaser.Input.Keyboard.JustDown(key); // เคลียร์สถานะของ Phaser ไม่ให้นับซ้ำ
      // กดค้างไว้นานเกิน (เช่นกดตอนหน้าต่างเปิดอยู่แล้วเพิ่งปิด) ไม่นับ
      if (performance.now() - t < 350) return true;
    }
    return !!key && Phaser.Input.Keyboard.JustDown(key);
  }

  /** ปุ่มเลข 1–8 ที่เพิ่งกด (−1 = ไม่มี) */
  hotbarPressed(): number {
    const names = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
    return names.findIndex((n) => this.pressed(n));
  }

  /** LB/RB เลื่อนช่อง hotbar (−1/+1/0) */
  hotbarCycle(): number {
    return (this.pressed('hotnext') ? 1 : 0) - (this.pressed('hotprev') ? 1 : 0);
  }

  /** ล้างปุ่มค้างที่ยังไม่ถูกอ่าน (กันกดทะลุตอนเปิดหน้าต่าง) */
  clearPadPressed() {
    this.padPressed.clear();
  }
}
