// ย่อภาพวาดรายไอเทมเป็นภาพเล็ก 128px สำหรับการ์ดในหน้าคลังข้อมูล → public/art/items/thumb/<id>.jpg
// ใช้: node tools/make-thumbs.mjs   (ทำเฉพาะที่ยังไม่มีหรือภาพใหญ่ใหม่กว่า)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../public/art/items/', import.meta.url));
const out = path.join(dir, 'thumb');
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.jpg'))) {
  const src = path.join(dir, f);
  const dst = path.join(out, f);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) continue;
  execFileSync('sips', ['-Z', '128', '-s', 'format', 'jpeg', '-s', 'formatOptions', '78', src, '--out', dst], { stdio: 'ignore' });
  n++;
}
// ลบภาพเล็กที่ภาพใหญ่ถูกลบไปแล้ว
for (const f of fs.readdirSync(out)) if (!fs.existsSync(path.join(dir, f))) fs.unlinkSync(path.join(out, f));
console.log('thumbs', n);
