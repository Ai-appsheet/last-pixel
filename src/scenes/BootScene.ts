import Phaser from 'phaser';
import { buildAllTextures } from '../gfx/TextureFactory';
import { CAPES, CLASS_LOOKS, HELMETS, OUTFITS, heroFrame, type HeroLook } from '../gfx/art/heroes';
import { registerCosmetics } from '../data/items';
import { registerBlueprints } from '../data/blueprints';
import { LOOT_GROUPS, type Rarity } from '../data/loot';
import { FONT, HEAD_FONT, PIXEL_FONT, PIXEL_TH } from '../ui/widgets';
import { installCrispText } from '../ui/crispText';
import { TiltPipeline } from '../gfx/TiltPipeline';
import { coverImage, queueArt } from '../ui/art';
import { fadeTo } from '../ui/transition';
import { Sfx } from '../core/AudioManager';

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
  // ไอคอน = เฟรมหน้าตรงของตัวละครที่ใส่ชุดนั้น — วาดความละเอียดปกติ 20×24 (ขนาดที่ช่องไอเทมคาดไว้ · ตัวในเกมเป็น HD)
  for (const c of list) {
    const iconKey = `icon_cos_${c.slot}_${c.id}`;
    if (scene.textures.exists(iconKey)) continue;
    const look = { ...base, [c.slot]: c.id } as HeroLook;
    const pc = heroFrame(look, 0, 1);
    const tex = scene.textures.createCanvas(iconKey, pc.W, pc.H)!;
    pc.blit(tex.getContext());
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
    queueArt(this, ['keyart', 'title_bg']);
    report(0.6);
    this.load.on('progress', (v: number) => report(0.6 + v * 0.15));
  }

  create() {
    // ตั้งเพลงหลักไว้ตั้งแต่หน้าโหลด → พอผู้ใช้แตะครั้งแรก (AudioManager ปลดล็อกให้เอง) เพลงจะเริ่มเล่นทันที
    // และเล่นต่อเนื่องไปจนถึงหน้าแรกและในเกม (GameScene เปลี่ยนเป็นเพลงกลางวัน/กลางคืนเอง)
    Sfx.startMusic('title');
    // ตัวหนังสือคมชัดทั้งเกม (ui/crispText.ts) — ต้องติดตั้งก่อนสร้างข้อความแรก
    installCrispText(this.game);
    const w = this.scale.width;
    const h = this.scale.height;
    // หน้าโหลด: ภาพ key art
    coverImage(this, 'keyart', w, h);
    this.add.rectangle(0, h - 46, w, 46, 0x0b0d1f, 0.75).setOrigin(0);
    const label = this.add.text(w / 2, h - 23, 'SURVIVOR ISLES · LOADING...', { fontFamily: FONT, fontSize: '18px', fontStyle: '600', color: '#ffcd75' }).setOrigin(0.5);
    // ข้อความกระพริบให้รู้ว่ายังโหลดอยู่ (หน้าโหลดไม่ดูค้าง)
    this.tweens.add({ targets: label, alpha: 0.45, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const r = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (r.pipelines && !r.pipelines.getPostPipeline('TiltPipeline')) r.pipelines.addPostPipeline('TiltPipeline', TiltPipeline);
    this.time.delayedCall(30, () => {
      const t0 = performance.now();
      buildAllTextures(this);
      this.registry.set('bootTexMs', Math.round(performance.now() - t0)); // ดูเวลาสร้าง texture ตอนบูต (game.registry)
      report(0.85);
      registerCostumes(this);
      report(0.92);
      const fonts = document.fonts
        ? Promise.all([document.fonts.load(`300 16px ${FONT}`), document.fonts.load(`400 16px ${FONT}`), document.fonts.load(`500 16px ${FONT}`), document.fonts.load(`600 16px ${FONT}`), document.fonts.load(`700 16px ${HEAD_FONT}`), document.fonts.load(`16px ${PIXEL_FONT}`), document.fonts.load(`16px ${PIXEL_TH}`)])
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
