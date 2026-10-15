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

/** พิกเซลจริงบนจอต่อ 1 พิกเซลเกม (ใช้เลือกขนาดภาพที่อบไว้ให้คมพอดีจอ) */
export function renderScale() {
  return R;
}

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

const rgb = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * ตัวหนังสือพิกเซล (Unifont: 1 พิกเซลฟอนต์ = m พิกเซลแคนวาส): ตัดความโปร่งใสเป็น 0/255 → ตัวหนาเทียม (ซ้ำเลื่อนขวา m ยกเว้นช่องว่าง 1 พิกเซลฟอนต์)
 * → ขอบหนา m รอบตัว (8 ทิศ) → เงาตกลง m — ทำบนแคนวาสเอง (stroke ของแคนวาสจะเบลอ/ทำให้ตัวพิกเซลเละ)
 */
export function pixelPost(canvas: HTMLCanvasElement, outline: string | null, shadow: string | null, bold: boolean, m = 1) {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  const on = (src: Uint8ClampedArray, x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] === 255;
  const put = (i: number, r: number, g: number, b: number) => {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  if (bold) {
    const src = new Uint8ClampedArray(d);
    for (let y = 0; y < h; y++) {
      for (let x = m; x < w; x++) {
        if (on(src, x, y) || !on(src, x - m, y)) continue;
        // อยู่ในช่องว่างแคบ 1 พิกเซลฟอนต์ (อักษรไทย พ ม ว) → ไม่ถม
        let gap = false;
        for (let k = 1; k <= m && !gap; k++) gap = on(src, x + k, y);
        if (gap) continue;
        const j = (y * w + x - m) * 4;
        put((y * w + x) * 4, src[j], src[j + 1], src[j + 2]);
      }
    }
  }
  if (outline) {
    const [r, g, b] = rgb(outline);
    // ขยายพื้นที่ตัวอักษร m พิกเซล (แยกแนวนอน/แนวตั้ง)
    const hor = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] !== 255) continue;
        for (let k = Math.max(0, x - m); k <= Math.min(w - 1, x + m); k++) hor[y * w + k] = 1;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 255) continue;
        let hit = false;
        for (let k = Math.max(0, y - m); k <= Math.min(h - 1, y + m) && !hit; k++) hit = hor[k * w + x] === 1;
        if (hit) put(i, r, g, b);
      }
    }
  }
  if (shadow) {
    const [r, g, b] = rgb(shadow);
    const src = new Uint8ClampedArray(d);
    for (let y = m; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (!src[i + 3] && on(src, x, y - m)) put(i, r, g, b);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function installCrispText(game: Phaser.Game) {
  const proto = Phaser.GameObjects.Text.prototype as unknown as { updateText: () => unknown; __crisp?: boolean };
  if (!proto.__crisp) {
    proto.__crisp = true;
    const orig = proto.updateText;
    type PxT = Phaser.GameObjects.Text & { __pixel?: boolean; __pxOutline?: string | null; __pxShadow?: string | null; __pxBold?: boolean; __pxM?: number; __pxD?: number };
    proto.updateText = function (this: PxT) {
      if (this.__pixel && this.__pxM && this.__pxD) {
        // ระยะขอบ/ระยะบรรทัด ปัดเป็นพิกเซลฟอนต์ (ไม่ให้ตัวอักษรเหลื่อมครึ่งพิกเซล) + เผื่อที่ให้ขอบ/เงา/ตัวหนา
        const u = this.__pxM / this.__pxD;
        const q = (v: number, min: number) => Math.max(min, Math.round(v / u)) * u;
        const p = this.padding;
        p.left = q(p.left ?? 0, 1);
        p.top = q(p.top ?? 0, 1);
        p.right = q(p.right ?? 0, 2);
        p.bottom = q(p.bottom ?? 0, 2);
        this.lineSpacing = q(this.lineSpacing, 2);
      }
      const r = orig.call(this);
      const rd = this.renderer as Phaser.Renderer.WebGL.WebGLRenderer | undefined;
      if (!rd?.gl || !this.texture) return r;
      if (this.__pixel) {
        // ตัวหนังสือพิกเซล (pixelTxt): ขอบแข็ง + ขอบ/เงา/ตัวหนา 1 พิกเซลฟอนต์ แล้วอัปโหลดใหม่แบบ NEAREST
        pixelPost(this.canvas, this.__pxOutline ?? null, this.__pxShadow ?? null, !!this.__pxBold, 1);
        this.frame.source.glTexture = rd.canvasToTexture(this.canvas, this.frame.source.glTexture ?? undefined, true);
      } else this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
      return r;
    };
    // ตัวพิกเซล: stroke/เงาของแคนวาส → ขอบ/เงา 1 พิกเซลฟอนต์ · ความละเอียดคุมเอง (ไม่ให้โค้ดอื่นเปลี่ยน)
    const P = proto as unknown as Record<string, (...a: unknown[]) => unknown>;
    const setStroke = P.setStroke;
    P.setStroke = function (this: PxT, color: unknown, thickness: unknown) {
      if (!this.__pixel) return setStroke.call(this, color, thickness);
      this.__pxOutline = Number(thickness) > 0 ? String(color) : null;
      return this.updateText();
    };
    const setShadow = P.setShadow;
    P.setShadow = function (this: PxT, ...a: unknown[]) {
      if (!this.__pixel) return setShadow.apply(this, a);
      const [x = 0, y = 0, color = '#000', , , fill = true] = a as [number?, number?, string?, number?, boolean?, boolean?];
      this.__pxShadow = fill && (x || y) && !String(color).startsWith('rgba') ? String(color) : null;
      return this.updateText();
    };
    const setResolution = P.setResolution;
    P.setResolution = function (this: PxT, v: unknown) {
      return this.__pixel ? this : setResolution.call(this, v);
    };
  }
  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const gl = renderer.gl as (WebGLRenderingContext & { __crisp?: boolean }) | undefined;
  if (!gl || gl.__crisp) return;
  gl.__crisp = true;

  // ---- ห่อ GL: ติดตาม framebuffer ที่ผูกอยู่ · วาดลงจอ = คูณ R ----
  let bound: WebGLFramebuffer | null = null;
  // Phaser บางครั้งตั้ง viewport/scissor "ก่อน" ผูก framebuffer ของ RenderTexture (เช่น ความมืดกลางคืน)
  // → จำค่าที่ขอไว้ แล้วตั้งใหม่ทุกครั้งที่เปลี่ยนเป้าหมาย (จอ = คูณ R · RenderTexture = ค่าเดิม)
  //   เดิมคูณ R ผิดตอนวาดลง RenderTexture → วงแสงรอบตัว/คบไฟ/กองไฟไม่ถูกวาด กลางคืนมืดทั้งจอ
  let vp: [number, number, number, number] | null = null;
  let sc: [number, number, number, number] | null = null;
  const bind = gl.bindFramebuffer.bind(gl);
  const viewport = gl.viewport.bind(gl);
  const scissor = gl.scissor.bind(gl);
  const k = (v: number) => (bound === null && R !== 1 ? Math.round(v * R) : v);
  const applyVp = () => vp && viewport(k(vp[0]), k(vp[1]), k(vp[2]), k(vp[3]));
  const applySc = () => sc && scissor(k(sc[0]), k(sc[1]), k(sc[2]), k(sc[3]));
  gl.bindFramebuffer = (target: number, fb: WebGLFramebuffer | null) => {
    bind(target, fb);
    if (target === gl.FRAMEBUFFER || target === (gl as unknown as WebGL2RenderingContext).DRAW_FRAMEBUFFER) {
      if (bound !== fb) {
        bound = fb;
        applyVp();
        applySc();
      }
    }
  };
  gl.viewport = (x: number, y: number, w: number, h: number) => {
    vp = [x, y, w, h];
    applyVp();
  };
  gl.scissor = (x: number, y: number, w: number, h: number) => {
    sc = [x, y, w, h];
    applySc();
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
