// โค้ดร่วมของสคริปต์สร้างภาพไอเทม (gen-items.mjs / gen-items-all.mjs)
// เรียก JMT Image API → ย่อเป็น jpg 512px → public/art/items/<id>.jpg + index.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
export const STYLE = ', HD pixel art with rich realistic detail, intricate textures, beautiful realistic lighting and shading, vibrant colors, polished indie game item showcase art, no text, no letters, no watermark';
// อาวุธเทพ: วางลอยเหนือแท่นหิน แสงเรือง พื้นหลังมืด — ทุกชิ้นเทมเพลตเดียวกัน
export const WEAPON = (what) => `A legendary fantasy weapon showcase: ${what}, floating diagonally above an ancient carved stone pedestal, glowing magical aura and sparkling particles around it, dark moody background with soft light rays, the weapon centered and large`;
// อาคารใหญ่: มุมสามส่วนสี่ บนเกาะร้าง
export const BUILDING = (what) => `A survival island base building showcase: ${what}, three-quarter isometric view, centered and large, on a deserted tropical island, palm trees, golden hour light`;
export const outDir = path.join(root, 'public', 'art', 'items');
fs.mkdirSync(outDir, { recursive: true });

/** index.json = รายชื่อ jpg ที่มีจริงในโฟลเดอร์ (เขียนผ่านไฟล์ชั่วคราว+rename → ปลอดภัยเมื่อรันหลาย process) */
export const writeIndex = () => {
  const ids = fs.readdirSync(outDir).filter((f) => f.endsWith('.jpg') && !f.startsWith('.')).map((f) => f.slice(0, -4)).sort();
  const tmp = path.join(outDir, `.index.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(ids));
  fs.renameSync(tmp, path.join(outDir, 'index.json'));
  return ids;
};

/** ภาพเล็ก 128px (public/art/items/thumb/<id>.jpg) สำหรับการ์ด/ช่องเล็ก — ทำใหม่ถ้ายังไม่มีหรือเก่ากว่าภาพใหญ่ */
export const thumbDir = path.join(outDir, 'thumb');
export function writeThumb(id) {
  const jpg = path.join(outDir, `${id}.jpg`);
  const th = path.join(thumbDir, `${id}.jpg`);
  if (fs.existsSync(th) && fs.statSync(th).mtimeMs >= fs.statSync(jpg).mtimeMs) return false;
  fs.mkdirSync(thumbDir, { recursive: true });
  const tmp = path.join(thumbDir, `.${id}.${process.pid}.jpg`);
  execFileSync('sips', ['-Z', '128', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', jpg, '--out', tmp], { stdio: 'ignore' });
  fs.renameSync(tmp, th);
  return true;
}
/** ทำ thumb ให้ครบทุกภาพ + ลบ thumb ที่ไม่มีภาพใหญ่แล้ว */
export function writeThumbs() {
  const ids = writeIndex();
  let n = 0;
  for (const id of ids) if (writeThumb(id)) n++;
  if (fs.existsSync(thumbDir)) for (const f of fs.readdirSync(thumbDir)) if (f.endsWith('.jpg') && !ids.includes(f.slice(0, -4))) fs.unlinkSync(path.join(thumbDir, f));
  return n;
}

/** สร้างภาพ 1 ชิ้น (ลองใหม่สูงสุด 4 ครั้ง เว้นระยะเพิ่มขึ้น) — คืน true ถ้าสำเร็จ */
export async function generate(id, prompt) {
  const jpg = path.join(outDir, `${id}.jpg`);
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(env.JMT_IMAGE_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.JMT_IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt + STYLE, aspect: '1:1', count: 1, style: 'pixel' }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      const m = text.match(/"(?:data:image\/[a-z]+;base64,)?([A-Za-z0-9+/]{2000,}={0,2})"/);
      const url = text.match(/https?:\/\/[^"]+\.(?:png|jpe?g|webp)[^"]*/i)?.[0];
      const png = path.join(outDir, `.${id}.${process.pid}.png`);
      const tmpJpg = path.join(outDir, `.${id}.${process.pid}.jpg`);
      if (m) fs.writeFileSync(png, Buffer.from(m[1], 'base64'));
      else if (url) fs.writeFileSync(png, Buffer.from(await (await fetch(url)).arrayBuffer()));
      else throw new Error('ไม่พบรูปในผลลัพธ์');
      // ย่อเหลือ 512 พอสำหรับกรอบพรีวิว (ประหยัดขนาดไฟล์)
      execFileSync('sips', ['-Z', '512', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', png, '--out', tmpJpg], { stdio: 'ignore' });
      fs.unlinkSync(png);
      fs.renameSync(tmpJpg, jpg);
      writeThumb(id);
      writeIndex();
      console.log('✔', id, Math.round(fs.statSync(jpg).size / 1024) + 'KB');
      return true;
    } catch (e) {
      console.log('✘', id, `ครั้งที่ ${attempt}:`, e.message);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  return false;
}

/**
 * รันรายการงาน [id, prompt][]
 * argv: [id...] = ทำเฉพาะ id ที่ระบุ (ทำใหม่ทับของเดิม) · ไม่ระบุ = ทำเฉพาะที่ยังไม่มีภาพ
 *       --part k/n = แบ่งรายการเป็น n ส่ง ทำส่วนที่ k (ไว้รันหลาย process พร้อมกัน)
 */
export async function runJobs(jobs, argv = process.argv.slice(2)) {
  const part = argv.find((a) => a.startsWith('--part='))?.slice(7);
  const want = argv.filter((a) => !a.startsWith('--'));
  let list = jobs.filter(([id]) => (want.length ? want.includes(id) : !fs.existsSync(path.join(outDir, `${id}.jpg`))));
  if (part) {
    const [k, n] = part.split('/').map(Number);
    const size = Math.ceil(list.length / n);
    list = list.slice((k - 1) * size, k * size);
  }
  console.log(`งาน ${list.length} ชิ้น`);
  const failed = [];
  for (const [id, prompt] of list) if (!(await generate(id, prompt))) failed.push(id);
  writeThumbs();
  console.log('เสร็จ', failed.length ? `ล้มเหลว: ${failed.join(' ')}` : '');
}
