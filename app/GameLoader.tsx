'use client';
import dynamic from 'next/dynamic';

/** Phaser ใช้ window ตอนโหลด → โหลดเฉพาะฝั่ง client */
const GameCanvas = dynamic(() => import('./GameCanvas'), { ssr: false });

export default function GameLoader() {
  return <GameCanvas />;
}
