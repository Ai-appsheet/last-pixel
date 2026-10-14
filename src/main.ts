import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { RoomSelectScene } from './scenes/RoomSelectScene';
import { CharacterSelectScene } from './scenes/CharacterSelectScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { CatalogScene } from './scenes/CatalogScene';
import { assetBase } from './core/backend/Api';
import { startSync } from './core/backend/Sync';
import { isTouchDevice } from './core/Quality';

/** เกมที่รันอยู่ (มีได้ทีละเกม — กัน React StrictMode mount ซ้ำ) */
let current: Phaser.Game | null = null;

/** สร้างเกม 960×540 ใส่ใน parent — เรียกจากหน้า Next.js (client เท่านั้น) */
export function startGame(parent: HTMLElement): Phaser.Game {
  if (current) destroyGame(current);
  const debug = new URLSearchParams(location.search).has('debug');
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: '#0e0f1a',
    pixelArt: true,
    roundPixels: true,
    // GPU แยก (ถ้ามี) · ไม่ต้อง antialias (pixel art) · ไม่ต้อง preserveDrawingBuffer
    render: { powerPreference: 'high-performance', antialias: false, pixelArt: true, roundPixels: true },
    // มือถือ: จำกัด 60 fps (จอ 90/120Hz ไม่ต้องวาดเกิน — เย็นกว่า แบตอยู่นานกว่า) · smoothStep กันเฟรมกระตุก
    fps: { target: 60, smoothStep: true, ...(isTouchDevice() ? { limit: 60 } : {}) },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, autoRound: true },
    input: { activePointers: 3, gamepad: true },
    disableContextMenu: true,
    dom: { createContainer: true },
    // ภาพทั้งหมด (art/..., art/items/...) โหลดใต้ basePath ของเว็บ (GitHub Pages = /<repo>/)
    loader: { baseURL: assetBase() },
    physics: { default: 'arcade', arcade: { debug } },
    scene: [BootScene, TitleScene, RoomSelectScene, CharacterSelectScene, CatalogScene, GameScene, UIScene],
  });
  current = game;
  startSync();
  mobileFullscreen(game);
  // เปิดไว้ให้ debug จาก console ได้
  (window as unknown as { game?: Phaser.Game }).game = game;
  return game;
}

/**
 * มือถือ: แตะเกมครั้งแรก → ขอเต็มจอ + ล็อกแนวนอน (Android/Chrome · iOS ไม่รองรับ จะข้ามไปเงียบๆ)
 * ฟังเฉพาะบนแคนวาส (แตะช่องกรอกชื่อ/รหัสผ่านไม่ทำให้เด้งเต็มจอ)
 */
function mobileFullscreen(game: Phaser.Game) {
  if (!isTouchDevice()) return;
  if (!game.canvas) {
    game.events.once(Phaser.Core.Events.READY, () => mobileFullscreen(game));
    return;
  }
  const canvas = game.canvas;
  const go = () => {
    canvas.removeEventListener('pointerup', go);
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) return;
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
    if (!req) return;
    Promise.resolve(req({ navigationUI: 'hide' } as FullscreenOptions))
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
      .catch(() => undefined);
  };
  canvas.addEventListener('pointerup', go);
}

/** ปิดเกม (React unmount) */
export function destroyGame(game: Phaser.Game) {
  if (current === game) current = null;
  const w = window as unknown as { game?: Phaser.Game };
  if (w.game === game) delete w.game;
  game.destroy(true);
}
