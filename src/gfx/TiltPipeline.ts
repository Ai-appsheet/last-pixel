import Phaser from 'phaser';

/**
 * post-effect ทั้งจอของกล้องโลก (ผ่านเดียว):
 *  1) มุมกล้อง 2.5D: บิดภาพเป็นพื้นราบที่เอียงออกไปไกล (Mode 7) — ล่างจอใกล้ บนจอไกล + หมอก + ท้องฟ้า (uTilt = 0 → ไม่บิด)
 *  2) ปรับโทนสี: ลดความจัดเล็กน้อย ไฮไลต์อุ่น เงาเย็น + ขอบจอมืดนุ่ม (vignette)
 *  3) ลำแสงแดดเฉียง (god rays) ตามตำแหน่งในโลกที่ AtmosphereSystem ส่งมา (สูงสุด 4 ลำ)
 *  4) หมอกจาง ๆ ลอยช้า ๆ เกาะส่วนที่มืด (เฉพาะคุณภาพสูง)
 * ใช้กับกล้องหลักของ GameScene เท่านั้น — UI อยู่คนละซีนจึงไม่โดน
 * คณิตศาสตร์ของการบิดอยู่ใน tiltMap() ฝั่ง JS ด้วย (แปลงตำแหน่งเมาส์กลับเป็นพิกัดโลก)
 */
const FRAG = `
#define SHADER_NAME TILT_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTilt;
uniform vec3 uSky;
uniform vec3 uFog;
uniform float uTime;
uniform vec4 uView;
uniform float uGrade;
uniform float uVig;
uniform float uHaze;
uniform float uRayLen;
uniform vec4 uS0;
uniform vec4 uS1;
uniform vec4 uS2;
uniform vec4 uS3;
varying vec2 outTexCoord;

float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
}

// ลำแสงหนึ่งลำ: s = (กลาง x, กลาง y, ครึ่งความกว้าง, ความแรง) · ทิศลำแสงเฉียงลงขวา
float shaft(vec2 wp, vec4 s) {
  if (s.w <= 0.0) return 0.0;
  vec2 dir = vec2(0.42, 0.91);
  vec2 d = wp - s.xy;
  float t = dot(d, dir);
  float u = dot(d, vec2(dir.y, -dir.x));
  float k = t / uRayLen;
  float w = s.z * (1.0 + 0.35 * k);
  float prof = 1.0 - smoothstep(w * 0.35, w, abs(u));
  float len = 1.0 - smoothstep(0.3, 0.5, abs(k));
  float flick = 0.75 + 0.25 * vnoise(vec2(u * 0.08 + s.x, t * 0.01 - uTime * 0.25));
  return prof * len * flick * s.w;
}

void main() {
  float k = uTilt * 2.2;
  float s = outTexCoord.y;              // 0 = ล่างจอ, 1 = บนจอ
  float dd = 1.0 + k - k * s;           // ระยะลึก: ล่าง = ใกล้ บน = ไกล
  float g = s / dd;
  float w = (1.0 + k * 0.5) / dd;
  float x = (outTexCoord.x - 0.5) * w + 0.5;
  vec2 uv = vec2(x, g);
  vec4 c = texture2D(uMainSampler, uv);
  if (x < 0.0 || x > 1.0) c = vec4(uFog, 1.0);

  // พิกัดโลกของพิกเซลนี้ (ก่อนบิด)
  vec2 wp = uView.xy + vec2(uv.x, 1.0 - uv.y) * uView.zw;

  // ---- ปรับโทน: ลดความจัดนิด ๆ + ไฮไลต์อุ่น/เงาเย็น ----
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  vec3 graded = mix(vec3(l), c.rgb, 0.93);
  graded *= mix(vec3(0.95, 1.0, 1.05), vec3(1.05, 1.01, 0.95), smoothstep(0.15, 0.85, l));
  c.rgb = mix(c.rgb, graded, uGrade);

  // ---- หมอกจาง ๆ เกาะส่วนมืด ----
  if (uHaze > 0.0) {
    float n = vnoise(wp / 70.0 + vec2(uTime * 0.04, uTime * 0.015)) * 0.65 + vnoise(wp / 31.0 - vec2(uTime * 0.03, 0.0)) * 0.35;
    float fogA = smoothstep(0.5, 0.95, n) * uHaze * smoothstep(0.78, 0.3, l);
    c.rgb = mix(c.rgb, vec3(0.82, 0.92, 0.88), fogA * 0.15);
  }

  // ---- ลำแสงแดด (บวกแสงแบบ screen ไม่ให้ขาวจ้า) ----
  float r = shaft(wp, uS0) + shaft(wp, uS1) + shaft(wp, uS2) + shaft(wp, uS3);
  if (r > 0.0) {
    vec3 sun = vec3(1.0, 0.95, 0.76) * min(r, 1.3) * 0.2;
    c.rgb = c.rgb + sun * (1.0 - c.rgb * 0.6);
  }

  // ---- ขอบจอมืดนุ่ม ----
  vec2 q = (outTexCoord - 0.5) * vec2(1.0, 0.85);
  c.rgb *= 1.0 - uVig * smoothstep(0.07, 0.36, dot(q, q));

  float fog = smoothstep(0.45, 1.0, s) * 0.55 * uTilt;
  c.rgb = mix(c.rgb, uFog, fog);
  // แถบท้องฟ้าเหนือขอบฟ้า
  float horizon = smoothstep(0.93, 1.0, s) * uTilt;
  c.rgb = mix(c.rgb, uSky, horizon);
  gl_FragColor = c;
}
`;

export class TiltPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  tilt = 0.6;
  sky: [number, number, number] = [0.35, 0.55, 0.85];
  fog: [number, number, number] = [0.55, 0.7, 0.85];
  /** วินาที (ใช้ขยับหมอก/ลำแสง) */
  time = 0;
  /** พื้นที่โลกที่กล้องเห็น (x, y, กว้าง, สูง) — ต้องตรงกับภาพก่อนบิด */
  area: [number, number, number, number] = [0, 0, 320, 180];
  /** 0..1 ความแรงการปรับโทน */
  grade = 1;
  vignette = 0.22;
  haze = 0;
  rayLen = 260;
  /** ลำแสง 4 ช่อง: [x, y, ครึ่งกว้าง, ความแรง] (ความแรง 0 = ปิด) */
  shafts: [number, number, number, number][] = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];

  constructor(game: Phaser.Game) {
    super({ game, name: 'TiltPipeline', fragShader: FRAG });
  }

  onPreRender() {
    this.set1f('uTilt', this.tilt);
    this.set3f('uSky', ...this.sky);
    this.set3f('uFog', ...this.fog);
    this.set1f('uTime', this.time);
    this.set4f('uView', ...this.area);
    this.set1f('uGrade', this.grade);
    this.set1f('uVig', this.vignette);
    this.set1f('uHaze', this.haze);
    this.set1f('uRayLen', this.rayLen);
    this.set4f('uS0', ...this.shafts[0]);
    this.set4f('uS1', ...this.shafts[1]);
    this.set4f('uS2', ...this.shafts[2]);
    this.set4f('uS3', ...this.shafts[3]);
  }
}

/**
 * แปลงพิกัดบนจอ (0..1, y ลงล่าง) → พิกัดบนภาพก่อนบิด (0..1) — ตรงกับ shader
 * คืน null ถ้าชี้เลยขอบฟ้า
 */
export function tiltMap(nx: number, ny: number, tilt: number): { x: number; y: number } | null {
  const k = tilt * 2.2;
  const s = 1 - ny;
  const d = 1 + k - k * s;
  const g = s / d;
  const w = (1 + k * 0.5) / d;
  const x = (nx - 0.5) * w + 0.5;
  if (x < 0 || x > 1) return null;
  return { x, y: 1 - g };
}
