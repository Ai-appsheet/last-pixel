'use client';
import { useEffect, useState } from 'react';
import './loading.css';

/**
 * หน้าโหลด (HTML ล้วน — โผล่ทันทีตั้งแต่เปิดเว็บ ก่อนโค้ดเกมโหลดเสร็จ)
 * สไลด์ภาพบอส/สัตว์ในตำนาน/เกาะ + โลโก้เด้ง + ตัวละคร 7 ตัว + หลอดโหลด + เคล็ดลับ
 * เกมแจ้งความคืบหน้าผ่าน window event 'si:progress' (detail 0..1) และปิดหน้าโหลดด้วย 'si:ready'
 */
const BASE = `${(process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')}/art/loader/`;

const SLIDES: { img: string; tag: string; title: string }[] = [
  { img: 'cover', tag: 'ผจญภัย', title: 'รวมทีมเอาชีวิตรอดบนหมู่เกาะ' },
  { img: 'boss_demon', tag: 'บอส', title: 'จอมมารเพลิง' },
  { img: 'legend_frost_dragon', tag: 'สัตว์ในตำนาน', title: 'มังกรน้ำแข็ง' },
  { img: 'isl_crystal', tag: 'เกาะ', title: 'เกาะคริสตัล' },
  { img: 'raid_blood_moon', tag: 'คืนอันตราย', title: 'คืนพระจันทร์เลือด' },
  { img: 'special_island', tag: 'เกาะพิเศษ', title: 'เกาะมหาสมบัติ' },
  { img: 'legend_phoenix', tag: 'สัตว์ในตำนาน', title: 'หงส์เพลิง' },
  { img: 'hz_tsunami', tag: 'มหันตภัย', title: 'สึนามิถล่มเกาะ' },
  { img: 'market_island', tag: 'เกาะกลาง', title: 'ตลาดนัดผู้รอดชีวิต' },
  { img: 'dungeon_2', tag: 'ดันเจี้ยน', title: 'สุสานใต้ดิน' },
  { img: 'legend_kraken', tag: 'สัตว์ในตำนาน', title: 'คราเคนยักษ์' },
  { img: 'boss_crab', tag: 'บอส', title: 'ราชาปูยักษ์' },
];

const HEROES = ['mechanic', 'medic', 'hunter', 'farmer', 'scout', 'shaman', 'robot'];

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

const STEPS = ['เติมน้ำทะเล…', 'ปลูกต้นมะพร้าว…', 'ซ่อนกล่องสมบัติ…', 'ปลุกบอสในถ้ำ…', 'ฝึกปูยักษ์…', 'จุดกองไฟ…', 'เตรียมเรือ…'];

const LOGO = 'SURVIVOR';
const LOGO2 = 'ISLES';

export default function LoadingScreen() {
  const [slide, setSlide] = useState(0);
  const [tip, setTip] = useState(0);
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(0.04);
  const [gone, setGone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // ระหว่างโหลดโค้ดเกม: หลอดค่อยๆ ขยับเอง (ไม่เกิน 55%) — พอเกมเริ่มจะส่งค่าจริงมาแทน
    let real = 0;
    const fake = setInterval(() => setProg((p) => (real ? p : Math.min(0.55, p + (0.6 - p) * 0.06))), 200);
    const onProg = (e: Event) => {
      real = Math.max(real, Number((e as CustomEvent).detail) || 0);
      setProg((p) => Math.max(p, real));
    };
    const onReady = () => {
      setProg(1);
      setTimeout(() => setGone(true), 250);
      setTimeout(() => setHidden(true), 1100);
    };
    window.addEventListener('si:progress', onProg);
    window.addEventListener('si:ready', onReady);
    const s = setInterval(() => setSlide((i) => (i + 1) % SLIDES.length), 3200);
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 4200);
    const st = setInterval(() => setStep((i) => (i + 1) % STEPS.length), 1300);
    setTip(Math.floor(Math.random() * TIPS.length));
    return () => {
      clearInterval(fake);
      clearInterval(s);
      clearInterval(t);
      clearInterval(st);
      window.removeEventListener('si:progress', onProg);
      window.removeEventListener('si:ready', onReady);
    };
  }, []);

  if (hidden) return null;
  const pct = Math.round(prog * 100);
  const cur = SLIDES[slide];

  return (
    <div className={`si-loader${gone ? ' si-gone' : ''}`} aria-busy={!gone} aria-label="กำลังโหลดเกม">
      {/* สไลด์พื้นหลัง: โหลดเฉพาะภาพปัจจุบัน + ภาพถัดไป */}
      <div className="si-slides">
        {SLIDES.map((s, i) => {
          const near = i === slide || i === (slide + 1) % SLIDES.length || i === 0;
          return (
            <div
              key={s.img}
              className={`si-slide${i === slide ? ' on' : ''}`}
              style={near ? { backgroundImage: `url(${BASE}${s.img}.jpg)` } : undefined}
            />
          );
        })}
      </div>
      <div className="si-shade" />
      <div className="si-sparkles" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i * 0.37) % 4}s`, animationDuration: `${4 + (i % 5)}s` }} />
        ))}
      </div>

      <div className="si-top">
        <h1 className="si-logo" aria-label="Survivor Isles">
          <span className="w1">
            {LOGO.split('').map((c, i) => (
              <b key={i} style={{ animationDelay: `${i * 0.08}s` }}>{c}</b>
            ))}
          </span>
          <span className="w2">
            {LOGO2.split('').map((c, i) => (
              <b key={i} style={{ animationDelay: `${(i + LOGO.length) * 0.08}s` }}>{c}</b>
            ))}
          </span>
        </h1>
        <p className="si-sub">เอาชีวิตรอดบนหมู่เกาะ · สร้างฐาน · ล่องเรือ · ล้มบอส</p>
      </div>

      <div className="si-caption" key={cur.img}>
        <span className="si-tag">{cur.tag}</span>
        <span className="si-title">{cur.title}</span>
        <span className="si-dots">
          {SLIDES.map((s, i) => (
            <em key={s.img} className={i === slide ? 'on' : ''} />
          ))}
        </span>
      </div>

      <div className="si-bottom">
        <div className="si-heroes" aria-hidden>
          {HEROES.map((h, i) => (
            <img key={h} src={`${BASE}${h}.jpg`} alt="" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        <div className="si-bar">
          <div className="si-fill" style={{ width: `${pct}%` }}>
            <img className="si-rider" src={`${BASE}hunter.jpg`} alt="" />
          </div>
          <span className="si-pct">{pct}%</span>
        </div>
        <div className="si-step">{pct >= 100 ? 'พร้อมแล้ว! ออกเดินทางกัน ⛵' : STEPS[step]}</div>
        <div className="si-tip" key={tip}>
          💡 <b>เคล็ดลับ</b> {TIPS[tip]}
        </div>
      </div>
    </div>
  );
}
