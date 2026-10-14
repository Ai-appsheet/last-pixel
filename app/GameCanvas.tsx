'use client';
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';

/** กล่องที่ Phaser วาดเกมลงไป — StrictMode mount 2 รอบ: รอบแรกถูกยกเลิก/ทำลาย เหลือเกมเดียว */
export default function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let game: Phaser.Game | null = null;
    let destroy: ((g: Phaser.Game) => void) | null = null;
    void import('../src/main').then((m) => {
      if (cancelled || !ref.current) return;
      destroy = m.destroyGame;
      game = m.startGame(ref.current);
    });
    return () => {
      cancelled = true;
      if (game && destroy) destroy(game);
      game = null;
    };
  }, []);
  return <div id="game" ref={ref} />;
}
