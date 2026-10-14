import Phaser from 'phaser';
import type { NodeData, NodeType } from '../world/WorldGenerator';

export interface NodeSpec {
  hp: number;
  /** 'tree' | 'rock' = ต้องตี (ใช้พลังของเครื่องมือชนิดนั้น), 'pick' = กด E เก็บ */
  harvest: 'tree' | 'rock' | 'pick';
  /** พลังขั้นต่ำของเครื่องมือ (เช่น ทองต้องอีเต้อเหล็ก) */
  minPower?: number;
  drops: { item: string; qty: [number, number]; chance: number }[];
  regrow: number;
  /** หลังเก็บแล้วเปลี่ยน texture เป็นอะไร (null = หายไป) */
  depleted: ((tex: string) => string) | null;
  blocker: { w: number; h: number } | null;
  sound: 'wood' | 'rock' | 'soft';
}

export const NODE_SPECS: Record<NodeType, NodeSpec> = {
  tree: { hp: 10, harvest: 'tree', drops: [{ item: 'wood', qty: [3, 4], chance: 1 }], regrow: 240, depleted: () => 'stump', blocker: { w: 6, h: 4 }, sound: 'wood' },
  cactus: { hp: 6, harvest: 'tree', drops: [{ item: 'cactus_fruit', qty: [1, 2], chance: 1 }, { item: 'fiber', qty: [1, 2], chance: 0.5 }], regrow: 200, depleted: (t) => t.replace('cactus_', 'cactus_bare_'), blocker: { w: 6, h: 4 }, sound: 'soft' },
  rock: { hp: 12, harvest: 'rock', drops: [{ item: 'stone', qty: [2, 4], chance: 1 }, { item: 'coal', qty: [1, 1], chance: 0.12 }, { item: 'iron_ore', qty: [1, 1], chance: 0.08 }], regrow: 360, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  ore_coal: { hp: 14, harvest: 'rock', minPower: 1, drops: [{ item: 'coal', qty: [2, 3], chance: 1 }, { item: 'stone', qty: [1, 1], chance: 0.5 }], regrow: 420, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  ore_sulfur: { hp: 14, harvest: 'rock', minPower: 3, drops: [{ item: 'sulfur', qty: [2, 3], chance: 1 }], regrow: 480, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  meteor_rock: { hp: 30, harvest: 'rock', minPower: 5, drops: [{ item: 'meteorite', qty: [1, 2], chance: 1 }, { item: 'crystal', qty: [1, 1], chance: 0.3 }], regrow: 999999, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  ruin_chest: {
    hp: 1, harvest: 'pick',
    drops: [
      { item: 'coin', qty: [30, 80], chance: 1 }, { item: 'gold_ingot', qty: [1, 2], chance: 0.6 }, { item: 'crystal', qty: [1, 2], chance: 0.4 },
      { item: 'gear', qty: [2, 4], chance: 0.5 }, { item: 'engine', qty: [1, 1], chance: 0.08 }, { item: 'crossbow', qty: [1, 1], chance: 0.1 },
    ],
    regrow: 999999, depleted: () => 'reward_chest_open', blocker: { w: 12, h: 6 }, sound: 'rock',
  },
  ore_iron: { hp: 16, harvest: 'rock', minPower: 3, drops: [{ item: 'iron_ore', qty: [2, 3], chance: 1 }, { item: 'stone', qty: [1, 2], chance: 0.6 }], regrow: 480, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  ore_gold: { hp: 20, harvest: 'rock', minPower: 5, drops: [{ item: 'gold_ore', qty: [1, 2], chance: 1 }, { item: 'stone', qty: [1, 2], chance: 0.6 }], regrow: 720, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  crystal: { hp: 24, harvest: 'rock', minPower: 5, drops: [{ item: 'crystal', qty: [1, 1], chance: 1 }, { item: 'crystal', qty: [1, 1], chance: 0.25 }], regrow: 900, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  bush: { hp: 1, harvest: 'pick', drops: [{ item: 'berry', qty: [2, 3], chance: 1 }], regrow: 150, depleted: (t) => t.replace('bush_', 'bush_empty_'), blocker: null, sound: 'soft' },
  grass: { hp: 1, harvest: 'pick', drops: [{ item: 'fiber', qty: [1, 2], chance: 1 }, { item: 'carrot_seed', qty: [1, 1], chance: 0.1 }], regrow: 120, depleted: null, blocker: null, sound: 'soft' },
  // ไบโอมชุดใหม่
  bamboo: { hp: 6, harvest: 'tree', drops: [{ item: 'wood', qty: [2, 3], chance: 1 }, { item: 'fiber', qty: [1, 2], chance: 0.8 }], regrow: 150, depleted: () => 'bamboo_cut', blocker: { w: 6, h: 4 }, sound: 'wood' },
  coral: { hp: 10, harvest: 'rock', minPower: 1, drops: [{ item: 'stone', qty: [1, 2], chance: 1 }, { item: 'pearl', qty: [1, 1], chance: 0.12 }, { item: 'crab_shell', qty: [1, 1], chance: 0.2 }], regrow: 600, depleted: null, blocker: { w: 12, h: 6 }, sound: 'rock' },
  shroom: { hp: 1, harvest: 'pick', drops: [{ item: 'glow_mushroom', qty: [1, 2], chance: 1 }, { item: 'glow_dust', qty: [1, 1], chance: 0.2 }], regrow: 260, depleted: null, blocker: null, sound: 'soft' },
  wild_crop: {
    hp: 1, harvest: 'pick',
    drops: [
      { item: 'carrot_seed', qty: [1, 2], chance: 0.6 }, { item: 'tomato_seed', qty: [1, 2], chance: 0.45 },
      { item: 'pumpkin_seed', qty: [1, 1], chance: 0.25 }, { item: 'carrot', qty: [1, 1], chance: 0.35 },
    ],
    regrow: 300, depleted: null, blocker: null, sound: 'soft',
  },
};

/** sprite ของทรัพยากร — สถานะจริงเก็บใน NodeData (คงอยู่แม้ chunk ถูกปลดออก) */
export class ResourceNode extends Phaser.GameObjects.Sprite {
  readonly info: NodeData;
  readonly spec: NodeSpec;

  constructor(scene: Phaser.Scene, info: NodeData) {
    const spec = NODE_SPECS[info.type];
    super(scene, info.tx * 16 + 8, info.ty * 16 + 16, info.tex);
    this.info = info;
    this.spec = spec;
    if (info.hp < 0) info.hp = spec.hp;
    this.setOrigin(0.5, 1);
    this.setDepth(this.y);
    scene.add.existing(this);
    this.applyState();
  }

  get kind() {
    return this.info.type;
  }
  get tx() {
    return this.info.tx;
  }
  get ty() {
    return this.info.ty;
  }
  get available() {
    return this.info.available;
  }
  get isPickable() {
    return this.available && this.spec.harvest === 'pick';
  }
  /** ตำแหน่งกลางฐาน ใช้วัดระยะกับผู้เล่น */
  get baseY() {
    return this.y - 4;
  }

  /** ตีด้วยพลัง power คืน true ถ้าเก็บสำเร็จ */
  hit(power: number, worldTime: number): boolean {
    if (!this.available || power <= 0) return false;
    this.info.hp -= power;
    this.scene.tweens.add({ targets: this, x: this.x + 1, duration: 40, yoyo: true, repeat: 1 });
    if (this.info.hp > 0) return false;
    this.deplete(worldTime);
    return true;
  }

  deplete(worldTime: number) {
    this.info.available = false;
    this.info.regrowAt = worldTime + this.spec.regrow;
    this.applyState();
  }

  /** งอกใหม่ทันที (สกิลชาวนา / ถึงเวลา) */
  regrowNow() {
    this.info.available = true;
    this.info.hp = this.spec.hp;
    this.applyState();
  }

  tick(worldTime: number) {
    if (this.available || worldTime < this.info.regrowAt) return;
    this.regrowNow();
  }

  private applyState() {
    const d = this.info;
    if (d.available) this.setTexture(d.tex).setVisible(true);
    else if (this.spec.depleted) this.setTexture(this.spec.depleted(d.tex)).setVisible(true);
    else this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.StaticBody | null;
    if (body) body.enable = d.available;
  }
}
