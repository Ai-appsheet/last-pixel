import Phaser from 'phaser';
import { isTouchDevice, quality } from '../core/Quality';

/**
 * ตัวหนังสือคมชัด (ไม่แตกเป็นพิกเซล) ทั้งเกม — เรียก installCrispText(game) ครั้งเดียวตอนเริ่ม (BootScene)
 *
 * ปัญหาเดิม: เกมวาดลงแคนวาส 960×540 แล้วเบราว์เซอร์ขยายแบบ pixelated ×1.3–2.7 + เกมตั้ง pixelArt (NEAREST)
 * ทุกครั้งที่ข้อความเปลี่ยน Phaser อัปโหลด texture ใหม่เป็น NEAREST → ตัวหนังสือหยัก/แตก
 *
 * แก้ 2 อย่าง:
 *  1) Text ทุกตัวใช้ LINEAR หลังอัปเดตทุกครั้ง (ภาพพิกเซลอื่นยังคม NEAREST เหมือนเดิม)
 *  2) แคนวาสจริงใหญ่ R เท่า (≈ ขนาดบนจอ × devicePixelRatio) แต่เกมยังคิดพิกัด 960×540 —
 *     ห่อ gl.viewport/gl.scissor ให้คูณ R เฉพาะตอนวาดลงจอ (framebuffer = null) → ตัวหนังสือวาดละเอียดเท่าจอจริง
 *     ส่วน framebuffer ภายใน (post-fx, mask) ขนาดเดิม · อินพุต/DOM ไม่กระทบ (ScaleManager ใช้ขนาดแสดงผล)
 */
const GW = 960;
const GH = 540;

let R = 1;

/** ความละเอียดที่ควรใช้กับ Text ใหม่ (≥2) */
export function textResolution() {
  return Math.min(4, Math.max(2, Math.ceil(R)));
}

/** เพดาน R ตามอุปกรณ์/คุณภาพ (กันมือถือร้อน) */
function maxR() {
  const q = quality();
  const cap = q === 'low' ? 1.5 : q === 'medium' ? 2 : 3;
  return isTouchDevice() ? Math.min(cap, 2.5) : cap;
}

/** ตัดความโปร่งใสกึ่งๆ ที่ขอบตัวอักษร → ขอบแข็งแบบพิกเซลอาร์ต */
export function hardEdges(canvas: HTMLCanvasElement) {
  if (!canvas.width || !canvas.height) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

export function installCrispText(game: Phaser.Game) {
  const proto = Phaser.GameObjects.Text.prototype as unknown as { updateText: () => unknown; __crisp?: boolean };
  if (!proto.__crisp) {
    proto.__crisp = true;
    const orig = proto.updateText;
    proto.updateText = function (this: Phaser.GameObjects.Text & { __pixel?: boolean }) {
      const r = orig.call(this);
      const rd = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined;
      if (!rd?.gl || !this.texture) return r;
      if (this.__pixel) {
        // ตัวหนังสือพิกเซล (pixelTxt): ตัดขอบให้แข็ง แล้วอัปโหลดใหม่แบบ NEAREST
        hardEdges(this.canvas);
        this.frame.source.glTexture = rd.canvasToTexture(this.canvas, this.frame.source.glTexture ?? undefined, true);
      } else this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      return r;
    };
  }
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl as (WebGLRenderingContext & { __crisp?: boolean }) | undefined;
  if (!gl || gl.__crisp) return;
  gl.__crisp = true;

  // ---- ห่อ GL: ติดตาม framebuffer ที่ผูกอยู่ · วาดลงจอ = คูณ R ----
  let bound: WebGLFramebuffer | null = null;
  const bind = gl.bindFramebuffer.bind(gl);
  gl.bindFramebuffer = (target: number, fb: WebGLFramebuffer | null) => {
    if (target === gl.FRAMEBUFFER || target === (gl as unknown as WebGL2RenderingContext).DRAW_FRAMEBUFFER) bound = fb;
    bind(target, fb);
  };
  const viewport = gl.viewport.bind(gl);
  gl.viewport = (x: number, y: number, w: number, h: number) => {
    if (bound === null && R !== 1) viewport(Math.round(x * R), Math.round(y * R), Math.round(w * R), Math.round(h * R));
    else viewport(x, y, w, h);
  };
  const scissor = gl.scissor.bind(gl);
  gl.scissor = (x: number, y: number, w: number, h: number) => {
    if (bound === null && R !== 1) scissor(Math.round(x * R), Math.round(y * R), Math.round(w * R), Math.round(h * R));
    else scissor(x, y, w, h);
  };
  // Phaser คำนวณ scissor จาก drawingBufferHeight → ให้เห็นเป็นขนาดเกม (960×540)
  const proto2 = Object.getPrototypeOf(gl);
  const dbh = Object.getOwnPropertyDescriptor(proto2, 'drawingBufferHeight')?.get;
  const dbw = Object.getOwnPropertyDescriptor(proto2, 'drawingBufferWidth')?.get;
  if (dbh) Object.defineProperty(gl, 'drawingBufferHeight', { get: () => Math.round(dbh.call(gl) / R), configurable: true });
  if (dbw) Object.defineProperty(gl, 'drawingBufferWidth', { get: () => Math.round(dbw.call(gl) / R), configurable: true });

  // ---- ขนาดแคนวาสจริงตามขนาดบนจอ ----
  const apply = () => {
    const canvas = game.canvas;
    const d = game.scale.displaySize;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const want = Math.max(1, Math.min(maxR(), (Math.min(d.width / GW, d.height / GH) || 1) * dpr));
    const next = Math.round(want * 100) / 100;
    const cw = Math.round(GW * next);
    const ch = Math.round(GH * next);
    if (canvas.width === cw && canvas.height === ch && next === R) return;
    R = next;
    canvas.width = cw;
    canvas.height = ch;
    // ส่วนที่เหลือ (ถ้ามี) ให้เบราว์เซอร์ขยายแบบนุ่ม ไม่ใช่พิกเซล
    canvas.style.imageRendering = R >= 1.5 ? 'auto' : '';
    renderer.resize(GW, GH);
  };
  apply();
  game.scale.on(Phaser.Scale.Events.RESIZE, () => setTimeout(apply, 0));
  if (typeof window !== 'undefined') window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener?.('change', apply);
}
