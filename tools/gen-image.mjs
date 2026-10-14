// สร้างภาพจาก JMT Image API → เซฟลง art/generated/
// ใช้: node tools/gen-image.mjs "<prompt>" [aspect=16:9] [style=pixel] [count=1] [name=cover]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const [prompt, aspect = '16:9', style = 'pixel', count = '1', name = 'image'] = process.argv.slice(2);
if (!prompt) {
  console.error('ต้องระบุ prompt');
  process.exit(1);
}
const res = await fetch(env.JMT_IMAGE_API_URL, {
  method: 'POST',
  headers: { Authorization: `Bearer ${env.JMT_IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(style === 'none' ? { prompt, aspect, count: Number(count) } : { prompt, aspect, count: Number(count), style }),
});
const text = await res.text();
const outDir = fileURLToPath(new URL('../art/generated/', import.meta.url));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${name}.response.json`), text);
console.log('HTTP', res.status, res.headers.get('content-type'));
let data;
try { data = JSON.parse(text); } catch { console.log(text.slice(0, 500)); process.exit(res.ok ? 0 : 1); }

// หา url หรือ base64 ในผลลัพธ์ (รองรับหลายรูปแบบ)
const found = [];
const walk = (v) => {
  if (typeof v === 'string') {
    if (/^https?:\/\/.+/.test(v) && /\.(png|jpe?g|webp)|image/i.test(v)) found.push({ url: v });
    else if (/^data:image\//.test(v)) found.push({ b64: v.split(',')[1] });
    else if (v.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(v.slice(0, 200))) found.push({ b64: v });
  } else if (Array.isArray(v)) v.forEach(walk);
  else if (v && typeof v === 'object') Object.values(v).forEach(walk);
};
walk(data);
let i = 0;
for (const f of found) {
  const file = path.join(outDir, `${name}_${i++}.png`);
  if (f.url) {
    const r = await fetch(f.url);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  } else fs.writeFileSync(file, Buffer.from(f.b64, 'base64'));
  console.log('saved', file);
}
if (!found.length) console.log(JSON.stringify(data).slice(0, 800));
