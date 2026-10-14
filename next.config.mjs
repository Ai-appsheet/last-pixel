import { fileURLToPath } from 'node:url';

/** Next.js — export เป็นไฟล์ static (out/) สำหรับ GitHub Pages
 *  NEXT_PUBLIC_BASE_PATH: path ของ repo เช่น '/last-pixel' (รันในเครื่องเว้นว่าง) */
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: base || undefined,
  assetPrefix: base || undefined,
  eslint: { ignoreDuringBuilds: true },
  webpack(config) {
    // phaser.esm.js ไม่มี default export แต่โค้ดเกมใช้ `import Phaser from 'phaser'` → ใช้ไฟล์ UMD แทน
    config.resolve.alias = { ...config.resolve.alias, phaser$: fileURLToPath(new URL('./node_modules/phaser/dist/phaser.js', import.meta.url)) };
    return config;
  },
};

export default nextConfig;
