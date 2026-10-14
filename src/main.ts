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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 3, gamepad: true },
    dom: { createContainer: true },
    // ภาพทั้งหมด (art/..., art/items/...) โหลดใต้ basePath ของเว็บ (GitHub Pages = /<repo>/)
    loader: { baseURL: assetBase() },
    physics: { default: 'arcade', arcade: { debug } },
    scene: [BootScene, TitleScene, RoomSelectScene, CharacterSelectScene, CatalogScene, GameScene, UIScene],
  });
  current = game;
  startSync();
  // เปิดไว้ให้ debug จาก console ได้
  (window as unknown as { game?: Phaser.Game }).game = game;
  return game;
}

/** ปิดเกม (React unmount) */
export function destroyGame(game: Phaser.Game) {
  if (current === game) current = null;
  const w = window as unknown as { game?: Phaser.Game };
  if (w.game === game) delete w.game;
  game.destroy(true);
}
