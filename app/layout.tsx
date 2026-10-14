import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Survivor Isles — เอาชีวิตรอดบนหมู่เกาะ',
  description: 'Survivor Isles เกมเอาชีวิตรอดบนหมู่เกาะ ภาพ pixel art มุมกล้อง 2.5D เล่นบนเว็บได้ทั้งคอมและมือถือ',
  applicationName: 'Survivor Isles',
  appleWebApp: { capable: true, title: 'Survivor Isles', statusBarStyle: 'black-translucent' },
  openGraph: { title: 'Survivor Isles', description: 'เกมเอาชีวิตรอดบนหมู่เกาะ ภาพ pixel art มุมกล้อง 2.5D เล่นได้ทั้งคอมและมือถือ', type: 'website' },
};

// มือถือ: ห้ามซูมหน้าเว็บ (บีบนิ้ว/แตะสองครั้ง) — บีบนิ้วในเกมใช้ซูมกล้องแทน · viewportFit=cover ใช้พื้นที่รอยบาก (กันด้วย safe-area ใน globals.css)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0e0f1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;700&family=Press+Start+2P&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
