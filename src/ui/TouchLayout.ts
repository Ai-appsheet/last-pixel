import type Phaser from 'phaser';
import { getSettings, setSettings } from '../core/Settings';

/**
 * ตำแหน่งปุ่มสัมผัส (มือถือ/แท็บเล็ต): จุดกลางแบบสัดส่วนจอ (0–1) + ขนาด (0.7–1.5) + ความทึบ (0.3–1)
 * เก็บแยกตามสัดส่วนจอ (กว้างมาก / มือถือ / แท็บเล็ต) ใน Settings → หมุนจอ/เปลี่ยนขนาดแล้วยังอยู่ที่เดิม
 */
export type TouchId = 'joy' | 'attack' | 'use' | 'eat' | 'dodge' | 'skill' | 'auto' | 'hotbar' | 'chat' | 'menu';
export interface TouchItem {
  x: number;
  y: number;
  s: number;
  a: number;
}
export type TouchLayout = Record<TouchId, TouchItem>;

export const TOUCH_IDS: TouchId[] = ['joy', 'attack', 'use', 'eat', 'dodge', 'skill', 'auto', 'hotbar', 'chat', 'menu'];

export const TOUCH_NAME: Record<TouchId, string> = {
  joy: 'จอยสติก', attack: 'โจมตี', use: 'ใช้ (E)', eat: 'กิน (F)', dodge: 'หลบ', skill: 'สกิล (Q)', auto: 'ออโต้',
  hotbar: 'แถบหมวด', chat: 'แชท', menu: 'เมนู/กระเป๋า',
};

/** รัศมีปุ่ม (px บนจอจริง ที่ขนาด 1) — โจมตีใหญ่สุด ~68px · ปุ่มรอบๆ ~48px */
export const TOUCH_R_CSS: Partial<Record<TouchId, number>> = { joy: 56, attack: 34, use: 24, eat: 24, dodge: 24, skill: 24, auto: 18 };

export const GW = 960;
export const GH = 540;

/** px บนจอจริง → หน่วยเกม (960×540) */
export function cssToGame(scene: Phaser.Scene, px: number) {
  const d = scene.scale.displaySize;
  return d.width > 0 ? (px * GW) / d.width : px;
}

/** กลุ่มสัดส่วนจอ: wide (≥ 2:1 มือถือแนวนอนยาว) · phone · tab (แท็บเล็ต/จอเกือบเหลี่ยม) */
export function bucketOf(scene: Phaser.Scene) {
  const d = scene.scale.parentSize;
  const r = d.width / Math.max(1, d.height);
  return r >= 2 ? 'wide' : r >= 1.6 ? 'phone' : 'tab';
}

/** ค่าเริ่มต้น: จอยซ้ายล่าง (~18% จากซ้าย · ~25% จากล่าง) · ปุ่มโจมตีมุมขวาล่าง + ปุ่มอื่นเรียงโค้งรอบ */
export function defaultLayout(scene: Phaser.Scene, fixed: Partial<Record<TouchId, TouchItem>>): TouchLayout {
  const d = scene.scale.displaySize;
  const dw = Math.max(1, d.width);
  const dh = Math.max(1, d.height);
  const ax = dw - 78;
  const ay = dh - 84;
  const at = (deg: number, dist: number, s = 1): TouchItem => {
    const r = (deg * Math.PI) / 180;
    return { x: (ax + Math.cos(r) * dist) / dw, y: (ay + Math.sin(r) * dist) / dh, s, a: 0.7 };
  };
  const base = { s: 1, a: 0.7 };
  return {
    joy: { x: 0.18, y: 0.75, ...base },
    attack: { x: ax / dw, y: ay / dh, ...base },
    use: at(180, 82),
    eat: at(-138, 84),
    dodge: at(-98, 84),
    skill: at(-58, 84),
    auto: at(-162, 150),
    hotbar: fixed.hotbar ?? { x: 0.5, y: 0.9, s: 0.9, a: 1 },
    chat: fixed.chat ?? { x: 0.2, y: 0.2, s: 1, a: 1 },
    menu: fixed.menu ?? { x: 0.75, y: 0.06, s: 1, a: 1 },
  };
}

export function loadLayout(scene: Phaser.Scene, fixed: Partial<Record<TouchId, TouchItem>>): TouchLayout {
  const def = defaultLayout(scene, fixed);
  const saved = getSettings().touchLayouts?.[bucketOf(scene)] as Partial<TouchLayout> | undefined;
  if (!saved) return def;
  const out = { ...def };
  for (const id of TOUCH_IDS) if (saved[id]) out[id] = { ...def[id], ...saved[id] };
  return out;
}

export function saveLayout(scene: Phaser.Scene, l: TouchLayout | null) {
  const all = { ...(getSettings().touchLayouts ?? {}) };
  if (l) all[bucketOf(scene)] = l;
  else delete all[bucketOf(scene)];
  setSettings({ touchLayouts: all });
}

/** ซ้ายมือ: สลับซ้าย-ขวาทั้งหมด */
export function mirrorLayout(l: TouchLayout): TouchLayout {
  const out = {} as TouchLayout;
  for (const id of TOUCH_IDS) out[id] = { ...l[id], x: 1 - l[id].x };
  return out;
}

export function joyOptions() {
  const s = getSettings();
  return { mode: s.joyMode ?? 'floating', dead: s.joyDead ?? 0.12 };
}

export function setJoyOptions(o: Partial<{ mode: 'floating' | 'fixed'; dead: number }>) {
  setSettings({ ...(o.mode ? { joyMode: o.mode } : {}), ...(o.dead !== undefined ? { joyDead: o.dead } : {}) });
}
