/**
 * รูปแบบการควบคุม (ผู้เล่นเลือกเองได้ในหน้าแรก/เมนู)
 *  auto    = ตรวจจับอัตโนมัติ (แตะจอ → ปุ่มสัมผัส, กดคีย์บอร์ด → คอม, กดจอย → จอยเกม)
 *  pc      = คีย์บอร์ด + เมาส์
 *  touch   = มือถือ/แท็บเล็ต (จอยสติกและปุ่มบนจอ)
 *  gamepad = จอยเกม (Xbox/PlayStation/จอยบลูทูธ)
 */
export type ControlMode = 'auto' | 'pc' | 'touch' | 'gamepad';

export const CONTROL_MODES: { id: ControlMode; label: string; icon: string }[] = [
  { id: 'auto', label: 'อัตโนมัติ', icon: '✨' },
  { id: 'pc', label: 'คอม (คีย์บอร์ด+เมาส์)', icon: '⌨' },
  { id: 'touch', label: 'มือถือ (จอยสัมผัส)', icon: '📱' },
  { id: 'gamepad', label: 'จอยเกม (Gamepad)', icon: '🎮' },
];

const KEY = 'lastpixel.control';
let cached: ControlMode | null = null;

export function getControlMode(): ControlMode {
  if (cached) return cached;
  try {
    const v = localStorage.getItem(KEY) as ControlMode | null;
    cached = v && CONTROL_MODES.some((m) => m.id === v) ? v : 'auto';
  } catch {
    cached = 'auto';
  }
  return cached;
}

export function setControlMode(m: ControlMode) {
  cached = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* ignore */
  }
}

export const controlLabel = (m = getControlMode()) => {
  const d = CONTROL_MODES.find((x) => x.id === m)!;
  return `${d.icon} ${d.label}`;
};
