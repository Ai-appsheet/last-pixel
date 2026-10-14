import Phaser from 'phaser';

/**
 * มุมกล้อง 2.5D: บิดภาพของกล้องโลกให้เป็นพื้นราบที่เอียงออกไปไกล (perspective แบบ Mode 7)
 *   ล่างจอ = ใกล้ (ขยาย) · บนจอ = ไกล (ย่อ + หมอก) · ขอบฟ้าเป็นท้องฟ้าไล่สี
 * ใช้กับกล้องหลักของ GameScene เท่านั้น — UI อยู่คนละซีนจึงไม่โดนบิด
 * คณิตศาสตร์เดียวกันอยู่ใน tiltMap() ฝั่ง JS เพื่อแปลงตำแหน่งเมาส์กลับเป็นพิกัดโลก
 */
const FRAG = `
#define SHADER_NAME TILT_FS
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uTilt;
uniform vec3 uSky;
uniform vec3 uFog;
varying vec2 outTexCoord;

void main() {
  float k = uTilt * 2.2;
  float s = outTexCoord.y;              // 0 = ล่างจอ, 1 = บนจอ
  float d = 1.0 + k - k * s;            // ระยะลึก: ล่าง = ใกล้ บน = ไกล
  float g = s / d;
  float w = (1.0 + k * 0.5) / d;
  float x = (outTexCoord.x - 0.5) * w + 0.5;
  vec2 uv = vec2(x, g);
  vec4 c = texture2D(uMainSampler, uv);
  if (x < 0.0 || x > 1.0) c = vec4(uFog, 1.0);
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

  constructor(game: Phaser.Game) {
    super({ game, name: 'TiltPipeline', fragShader: FRAG });
  }

  onPreRender() {
    this.set1f('uTilt', this.tilt);
    this.set3f('uSky', ...this.sky);
    this.set3f('uFog', ...this.fog);
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
