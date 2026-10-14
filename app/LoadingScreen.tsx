'use client';
import { useEffect, useState } from 'react';
import './loading.css';
import PixelText from './PixelText';

/**
 * หน้าโหลด (HTML ล้วน — โผล่ทันทีตั้งแต่เปิดเว็บ ก่อนโค้ดเกมโหลดเสร็จ)
 * ภาพ key art นิ่งเต็มจอ (ไม่ซูม/ไม่เลื่อน) + โลโก้ + ชื่อไทย + หลอดโหลด + เคล็ดลับ — เคลื่อนไหวแค่แสงวิ้งช้าๆ บนโลโก้กับหิ่งห้อยไม่กี่ดวง
 * เกมแจ้งความคืบหน้าผ่าน window event 'si:progress' (detail 0..1) และปิดหน้าโหลดด้วย 'si:ready'
 */
const BASE = `${(process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')}/art/loader/`;

const TIPS = [
  'ตีต้นไม้และก้อนหินเพื่อเก็บวัตถุดิบ แล้วกด B เปิดสมุดแปลน',
  'อยู่ใกล้กองไฟตอนกลางคืน จะปลอดภัยและฟื้นเลือดได้',
  'รอดพ้นมหันตภัยแต่ละครั้ง จะได้รับกล่องสมบัติ',
  'กล่องทองและกล่องเพชรมีโอกาสได้แปลนหายาก',
  'อัปเกรดสิ่งก่อสร้างได้ถึงระดับ 10 รูปร่างจะเปลี่ยนตามระดับ',
  'ล้มบอสครบ 3 ด่านในดันเจี้ยน = พิชิตเกาะ',
  'เกาะที่ไม่ใช่ของเรา ผู้เล่นอื่นโจมตีเราได้ ระวังตัวด้วย',
  'กด Enter เพื่อคุยกับผู้เล่นทั่วโลกในห้องแชท',
];

/** ข้อความสถานะตามช่วงความคืบหน้า (ไม่วนเร็ว — เปลี่ยนตามการโหลดจริง) */
const status = (p: number) =>
  p >= 1 ? 'พร้อมแล้ว! ออกเดินทางกัน' : p < 0.3 ? 'กำลังเตรียมหมู่เกาะ…' : p < 0.6 ? 'กำลังโหลดภาพและเสียง…' : p < 0.85 ? 'กำลังสร้างตัวละครและมอนสเตอร์…' : 'เกือบเสร็จแล้ว…';

/** หิ่งห้อย: ตำแหน่ง/ความเร็วคงที่ (ไม่สุ่มทุกครั้งที่ render) */
const FLIES = [
  { x: 58, y: 62, d: 26, k: 0 },
  { x: 71, y: 48, d: 31, k: 6 },
  { x: 84, y: 70, d: 24, k: 11 },
  { x: 47, y: 78, d: 29, k: 3 },
  { x: 92, y: 55, d: 34, k: 15 },
  { x: 64, y: 84, d: 27, k: 9 },
];

export default function LoadingScreen() {
  // จอใหญ่ = พิกเซลตัวหนังสือ 3 เท่า · จอเล็ก/เตี้ย = 2 เท่า
  const [big, setBig] = useState(true);
  useEffect(() => {
    const fit = () => setBig(window.innerWidth >= 1000 && window.innerHeight >= 560);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const [tip, setTip] = useState(0);
  const [prog, setProg] = useState(0.04);
  const [shown, setShown] = useState(false);
  const [gone, setGone] = useState(false);
  const [hidden, setHidden] = useState(false);
  // ตั้งค่าคุณภาพ "ต่ำ" ในเกม (เก็บใน localStorage เดียวกับ src/core/Settings.ts) → งดเอฟเฟกต์ทั้งหมด
  const [low, setLow] = useState(false);

  useEffect(() => {
    try {
      setLow(JSON.parse(localStorage.getItem('lastpixel.game.settings.v1') ?? '{}').quality === 'low');
    } catch {
      /* อ่านไม่ได้ = ใช้ค่าปกติ */
    }
    // ระหว่างโหลดโค้ดเกม: หลอดค่อยๆ ขยับเอง (ไม่เกิน 55%) — พอเกมเริ่มจะส่งค่าจริงมาแทน
    let real = 0;
    const fake = setInterval(() => setProg((p) => (real ? p : Math.min(0.55, p + (0.6 - p) * 0.06))), 200);
    const onProg = (e: Event) => {
      real = Math.max(real, Number((e as CustomEvent).detail) || 0);
      setProg((p) => Math.max(p, real));
    };
    // ?loader = ค้างหน้าโหลดไว้ (ไว้ตรวจดีไซน์/ถ่ายภาพหน้าจอ)
    const hold = new URLSearchParams(location.search).has('loader');
    const onReady = () => {
      setProg(1);
      if (hold) return;
      setTimeout(() => setGone(true), 250);
      setTimeout(() => setHidden(true), 900);
    };
    window.addEventListener('si:progress', onProg);
    window.addEventListener('si:ready', onReady);
    // เคล็ดลับเปลี่ยนทุก 7 วิ (เฟดข้ามนุ่มๆ)
    setTip(Math.floor(Math.random() * TIPS.length));
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 7000);
    // ภาพยังไม่มาก็โชว์ส่วนอื่นได้เลย (กันค้างจอดำถ้าภาพโหลดช้า)
    const show = setTimeout(() => setShown(true), 1200);
    return () => {
      clearInterval(fake);
      clearInterval(t);
      clearTimeout(show);
      window.removeEventListener('si:progress', onProg);
      window.removeEventListener('si:ready', onReady);
    };
  }, []);

  if (hidden) return null;
  const pct = Math.round(prog * 100);

  return (
    <div className={`si-loader${shown ? ' si-in' : ''}${low ? ' si-low' : ''}${gone ? ' si-gone' : ''}`} aria-busy={!gone} aria-label="กำลังโหลดเกม">
      <img
        className="si-art"
        src={`${BASE}title_bg.jpg`}
        srcSet={`${BASE}title_bg.jpg 960w, ${BASE}title_bg_hd.jpg 1920w`}
        sizes="100vw"
        alt=""
        onLoad={() => setShown(true)}
      />
      <div className="si-shade" />
      <div className="si-flies" aria-hidden>
        {FLIES.map((f, i) => (
          <i key={i} style={{ left: `${f.x}%`, top: `${f.y}%`, animationDuration: `${f.d}s`, animationDelay: `-${f.k}s` }} />
        ))}
      </div>

      <header className="si-head">
        {/* โลโก้ = ภาพเดียวกับหน้าแรก (texture tt_logo_w1/w2 ที่เกมวาด) ขยายแบบพิกเซล */}
        <h1 className="si-logo si-logo-img" aria-label="Survivor Isles">
          <img src={`${BASE}logo_w1.png`} alt="" className="w1" />
          <img src={`${BASE}logo_w2.png`} alt="" className="w2" />
        </h1>
        <p className="si-sub">
          <PixelText text="เอาชีวิตรอดบนหมู่เกาะ" px={15} scale={big ? 3 : 2} color="#fff6d8" color2="#ffcd75" />
        </p>
        <p className="si-tag">
          <PixelText text="สร้างฐาน · ล่องเรือ · ล้มบอส · รอดให้ถึงรุ่งเช้า" px={12} scale={2} color="#e8ecff" color2="#9fd8ff" shadow="#1a2a5a" />
        </p>
      </header>

      <div className="si-bottom">
        <div className="si-row">
          <span className="si-step"><PixelText text={status(prog)} px={12} scale={2} color="#fff2b0" /></span>
          <span className="si-pct">{pct}%</span>
        </div>
        <div className="si-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="si-fill" style={{ transform: `scaleX(${Math.max(0.02, prog)})` }} />
        </div>
        <div className="si-tips">
          {TIPS.map((s, i) => (
            <p key={i} className={i === tip ? 'on' : ''} aria-hidden={i !== tip}>
              <PixelText text={`เคล็ดลับ  ${s}`} px={11} scale={2} color="#e8ecff" shadow="#0b0d1f" />
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
