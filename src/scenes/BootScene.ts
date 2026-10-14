import Phaser from 'phaser';
import { buildAllTextures } from '../gfx/TextureFactory';
import { CAPES, CLASS_LOOKS, HELMETS, OUTFITS, buildHeroTexture, heroKey, type HeroLook } from '../gfx/art/heroes';
import { registerCosmetics } from '../data/items';
import { registerBlueprints } from '../data/blueprints';
import { LOOT_GROUPS, type Rarity } from '../data/loot';
import { FONT, PIXEL_FONT } from '../ui/widgets';
import { TiltPipeline } from '../gfx/TiltPipeline';
import { coverImage, queueArt } from '../ui/art';
import { fadeTo } from '../ui/transition';

/** แจ้งหน้าโหลด HTML (app/LoadingScreen.tsx) — ความคืบหน้า 0..1 / พร้อมแล้ว */
const report = (v: number) => window.dispatchEvent(new CustomEvent('si:progress', { detail: v }));

/** ชุดแฟชั่น (ที่ไม่ใช่ชุดเกราะพื้นฐาน) → ไอเทมที่สุ่มได้จากกล่อง */
const BASIC = new Set(['tunic', 'leather', 'fur', 'iron', 'gold', 'meteor', 'crab', 'none']);

function registerCostumes(scene: Phaser.Scene) {
  const base: HeroLook = { ...CLASS_LOOKS.mechanic, helmet: 'none', cape: 'none', outfit: 'tunic' };
  const list: { slot: 'outfit' | 'helmet' | 'cape'; id: string; name: string; rarity: Rarity }[] = [];
  const rar = (i: number): Rarity => (['uncommon', 'rare', 'epic', 'rare', 'legendary'] as Rarity[])[i % 5];
  OUTFITS.filter((o) => !BASIC.has(o.id)).forEach((o, i) => list.push({ slot: 'outfit', id: o.id, name: o.name, rarity: rar(i) }));
  HELMETS.filter((o) => o.id !== 'none').forEach((o, i) => list.push({ slot: 'helmet', id: o.id, name: o.name, rarity: rar(i + 1) }));
  CAPES.filter((o) => o.id !== 'none').forEach((o, i) => list.push({ slot: 'cape', id: o.id, name: o.name, rarity: rar(i + 2) }));
  registerCosmetics(list);
  registerBlueprints();
  LOOT_GROUPS.cosmetic.entries = list.map((c) => ({ item: `cos_${c.slot}_${c.id}`, qty: [1, 1], rarity: c.rarity }));
  // ไอคอน = เฟรมหน้าตรงของตัวละครที่ใส่ชุดนั้น
  for (const c of list) {
    const look = { ...base, [c.slot]: c.id } as HeroLook;
    const key = buildHeroTexture(scene, heroKey(look), look);
    const src = scene.textures.get(key);
    const f = src.get(0);
    const iconKey = `icon_cos_${c.slot}_${c.id}`;
    if (scene.textures.exists(iconKey)) continue;
    const tex = scene.textures.createCanvas(iconKey, f.width, f.height)!;
    tex.getContext().drawImage(src.getSourceImage() as HTMLCanvasElement, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);
    tex.refresh();
  }
}

/** สร้าง texture ทั้งหมดจากโค้ด + รอฟอนต์เกมโหลดเสร็จ */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  /** โหลดภาพประกอบ (ไม่มีไฟล์ก็ข้ามได้ เกมยังเล่นได้) */
  preload() {
    // โหลดแค่ภาพหน้าปก/หน้าโหลด ที่เหลือโหลดเบื้องหลังทีหลัง (เข้าเกมได้เร็ว)
    queueArt(this, ['keyart']);
    report(0.6);
    this.load.on('progress', (v: number) => report(0.6 + v * 0.15));
  }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    // หน้าโหลด: ภาพ key art
    coverImage(this, 'keyart', w, h);
    this.add.rectangle(0, h - 46, w, 46, 0x0b0d1f, 0.75).setOrigin(0);
    const label = this.add.text(w / 2, h - 23, 'SURVIVOR ISLES · LOADING...', { fontFamily: 'monospace', fontSize: '18px', color: '#ffcd75' }).setOrigin(0.5);
    // ข้อความกระพริบให้รู้ว่ายังโหลดอยู่ (หน้าโหลดไม่ดูค้าง)
    this.tweens.add({ targets: label, alpha: 0.45, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const r = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (r.pipelines && !r.pipelines.getPostPipeline('TiltPipeline')) r.pipelines.addPostPipeline('TiltPipeline', TiltPipeline);
    this.time.delayedCall(30, () => {
      buildAllTextures(this);
      report(0.85);
      registerCostumes(this);
      report(0.92);
      const fonts = document.fonts
        ? Promise.all([document.fonts.load(`700 16px ${FONT}`), document.fonts.load(`16px ${PIXEL_FONT}`)])
        : Promise.resolve();
      Promise.race([fonts, new Promise((r) => setTimeout(r, 3000))]).finally(() => {
        label.destroy();
        fadeTo(this, 'TitleScene', undefined, 180);
        // ให้หน้าแรกได้วาดก่อน แล้วค่อยเฟดหน้าโหลดออก
        setTimeout(() => window.dispatchEvent(new Event('si:ready')), 450);
      });
    });
  }
}
