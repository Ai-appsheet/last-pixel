/**
 * ปุ่ม "Sign in with Google" (Google Identity Services) — โหลดสคริปต์ของ Google เฉพาะตอนเปิดฟอร์มบัญชีบนหน้าแรก
 * กดแล้วได้ ID token (credential) → AccountService.google() → เซิร์ฟเวอร์ตรวจกับ Google เอง (action auth.google)
 * client id มาจาก NEXT_PUBLIC_GOOGLE_CLIENT_ID ตอน build · ไม่ตั้ง หรือเล่นออฟไลน์ = ไม่มีปุ่ม
 */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '').trim();

/** ส่วนของ google.accounts.id ที่ใช้ */
interface GsiId {
  initialize(o: Record<string, unknown>): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  prompt(): void;
  cancel(): void;
}
type GsiWindow = Window & { google?: { accounts?: { id?: GsiId } } };

let loading: Promise<GsiId | null> | null = null;
let gsi: GsiId | null = null;
/** ฟอร์มที่เปิดอยู่ตอนนี้ (ปุ่มและ One Tap ใช้ callback เดียวกันที่ตั้งตอน initialize) */
let handler: ((credential: string) => void) | null = null;
let prompted = false;

function load(): Promise<GsiId | null> {
  loading ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => {
      const id = (window as GsiWindow).google?.accounts?.id ?? null;
      if (id && !gsi) {
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (r: { credential?: string }) => r.credential && handler?.(r.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          use_fedcm_for_prompt: true,
        });
      }
      gsi = id;
      resolve(id);
    };
    s.onerror = () => {
      // โหลดไม่ได้ (เน็ตหลุด/ถูกบล็อก) → เปิดฟอร์มครั้งหน้าลองใหม่
      s.remove();
      loading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** วาดปุ่ม Google ลงใน el · คืน false ถ้าโหลดสคริปต์ไม่ได้ */
export async function renderGoogleButton(el: HTMLElement, o: { text: 'signin_with' | 'signup_with'; width: number }, onCredential: (credential: string) => void): Promise<boolean> {
  handler = onCredential;
  const id = await load();
  if (!id) return false;
  if (!el.isConnected) return true;
  id.renderButton(el, { type: 'standard', theme: 'filled_blue', size: 'medium', shape: 'pill', text: o.text, locale: 'th', width: o.width, logo_alignment: 'left' });
  return true;
}

/** One Tap (ป๊อปอัปเลือกบัญชี Google) — ครั้งเดียวต่อการเปิดหน้า */
export function promptGoogleOneTap() {
  if (prompted || !gsi) return;
  prompted = true;
  try {
    gsi.prompt();
  } catch {
    /* ignore */
  }
}

/** ออกจากฟอร์มบัญชี: ปิด One Tap ที่ค้าง + เลิกรับ credential */
export function cancelGoogle() {
  handler = null;
  try {
    gsi?.cancel();
  } catch {
    /* ignore */
  }
}
