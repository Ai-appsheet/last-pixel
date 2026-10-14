import { RNG, randomSeed } from './RNG';
import { getAccounts, scopedKey } from './AccountService';
import { SPECIAL_SLOT } from './SpecialIsland';
import { api, apiEnabled } from './backend/Api';

/**
 * ระบบโลก — ตอนนี้มี "แผนที่โลกเดียว" (WORLD_ROOM) ทุกคนอยู่แผนที่เดียวกัน เกาะใครเกาะมัน
 * (โครงสร้างแบบห้องยังเก็บไว้ เผื่อเปิดหลายเซิร์ฟเวอร์ภายหลัง)
 *  - 1 ห้อง = 1 โลก (seed เดียว) รองรับ ROOM_CAPACITY คน = เกาะสูงสุด ROOM_CAPACITY เกาะ
 *  - ผู้เล่นใหม่ได้ "ช่องเกาะ" ว่างที่ใกล้เกาะกลางที่สุด (วงก้นหอย) → แผนที่ขยายตามจำนวนคน
 *  - ห้องเต็ม = ปิด เข้าไม่ได้
 *
 * ออฟไลน์ (ไม่มี NEXT_PUBLIC_API_URL) = LocalRoomService จำลองผู้เล่นคนอื่นในเครื่อง
 * ออนไลน์ = RemoteRoomService: seed โลก ช่องเกาะของผู้เล่นจริง และแผงตลาด มาจากเซิร์ฟเวอร์ (Google Sheet)
 *   ช่องที่ยังว่างเติมด้วยบอทเดิม (โลกไม่เหงา) · เมธอด sync ใช้ข้อมูลในแคช ส่วนที่ต้องถามเซิร์ฟเวอร์เป็น async
 */
export const ROOM_CAPACITY = 100;
/** แผนที่โลกเดียวที่ทุกคนใช้ร่วมกัน */
export const WORLD_ROOM = 'world';
/** ตาราง 11×11 ช่อง: ช่องกลาง = เกาะกลาง (แลกเปลี่ยน) ที่เหลือ 120 ช่อง ใช้ได้ 100 */
export const ROOM_GRID = 11;
export const CENTER_SLOT = Math.floor((ROOM_GRID * ROOM_GRID) / 2);

export interface RoomPlayer {
  id: string;
  name: string;
  slot: number;
  /** เกาะพัฒนาไปแค่ไหน (ใช้วาดฐานของผู้เล่นจำลอง) 0..1 */
  progress: number;
  /** ผู้เล่นจริงจากเซิร์ฟเวอร์ (ไม่ใช่บอท) */
  real?: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  seed: number;
  players: RoomPlayer[];
  createdAt: number;
}

export interface TradeListing {
  id: string;
  seller: string;
  sellerName: string;
  item: string;
  qty: number;
  price: number;
  /** แผงที่วาง (index บนเกาะกลาง) */
  stall: number;
  /** เลเวลอัพเกรดของไอเทม (ถ้ามี) */
  plus?: number;
}

type Fail = { error: string };
export type JoinResult = { room: RoomInfo; slot: number } | Fail;

export interface RoomService {
  readonly online: boolean;
  listRooms(): RoomInfo[];
  /** เข้าห้อง (จากแคช) — คืนช่องเกาะของเรา หรือ error ถ้าห้องเต็ม/ยังไม่ได้ช่อง */
  join(roomId: string, playerId: string, name: string): JoinResult;
  /** เข้าห้องแบบรอเซิร์ฟเวอร์ — fresh = ทิ้งเกาะเดิมแล้วสุ่มใหม่ · slot = ขอช่องเดิม (จากเซฟ) */
  joinAsync(roomId: string, playerId: string, name: string, opts?: { fresh?: boolean; slot?: number; character?: string }): Promise<JoinResult>;
  /** ดึงข้อมูลโลก/ตลาดล่าสุด — คืนข้อความ error หรือ null */
  sync(): Promise<string | null>;
  /** รายงานสถานะทุก ~60 วิ (ออนไลน์) */
  heartbeat(info: { level: number; power: number; alive: boolean }): void;
  getRoom(roomId: string): RoomInfo | null;
  listings(roomId: string): TradeListing[];
  postListing(roomId: string, l: Omit<TradeListing, 'id'>): Promise<TradeListing | Fail>;
  /** ซื้อ (ตัดสินที่เซิร์ฟเวอร์ — คนซื้อพร้อมกันได้แค่คนเดียว) */
  takeListing(roomId: string, listingId: string): Promise<TradeListing | Fail>;
  cancelListing(roomId: string, listingId: string): Promise<TradeListing | Fail>;
  /** ของเราที่ขายได้แล้ว (ผู้เล่นจริงซื้อ) — คืนแล้วถือว่ารับเงินแล้ว */
  claimSales(): Promise<TradeListing[]>;
  /** ออกจากห้องถาวร (ตายถาวร) — ช่องเกาะว่างให้คนใหม่ */
  leave(roomId: string, playerId: string): void;
}

/** ลำดับช่องแบบวงก้นหอยจากเกาะกลางออกไป (ช่องใกล้กลางถูกใช้ก่อน) */
export function spiralSlots(): number[] {
  const c = Math.floor(ROOM_GRID / 2);
  const out: { s: number; d: number; a: number }[] = [];
  for (let y = 0; y < ROOM_GRID; y++) {
    for (let x = 0; x < ROOM_GRID; x++) {
      const s = y * ROOM_GRID + x;
      if (s === CENTER_SLOT || s === SPECIAL_SLOT) continue;
      out.push({ s, d: Math.max(Math.abs(x - c), Math.abs(y - c)), a: Math.atan2(y - c, x - c) });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.a - b.a).map((o) => o.s);
}

const NAMES = [
  'Somchai', 'Nong Fah', 'Kawin', 'Mali', 'Ploy', 'Arthit', 'Ben', 'Mint', 'Tonkla', 'Ice', 'Bank', 'Nam', 'Pond', 'Earth', 'Fern',
  'Golf', 'Jay', 'Kaew', 'Lek', 'May', 'Nut', 'Oat', 'Pang', 'Q', 'Ruj', 'Sky', 'Tae', 'Un', 'View', 'Win', 'Yok', 'Zen',
];

const KEY = 'lastpixel.rooms.v1';

interface Store {
  rooms: RoomInfo[];
  listings: Record<string, TradeListing[]>;
}

/** จำลองเซิร์ฟเวอร์ในเครื่อง (localStorage) */
class LocalRoomService implements RoomService {
  readonly online = false;
  private store: Store;

  constructor() {
    this.store = this.load();
  }

  private load(): Store {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const st = JSON.parse(raw) as Store;
        if (!st.rooms.some((r) => r.id === WORLD_ROOM)) {
          const w = makeWorld();
          st.rooms.unshift(w);
          st.listings[WORLD_ROOM] = seedListings(w, new RNG(4242));
          this.persist(st);
        }
        // ช่องเกาะพิเศษสงวนไว้ — ย้ายผู้เล่นจำลองที่เคยอยู่ช่องนั้นออก
        for (const room of st.rooms) {
          const p = room.players.find((x) => x.slot === SPECIAL_SLOT && x.id.startsWith('bot'));
          if (!p) continue;
          const used = new Set(room.players.map((x) => x.slot));
          p.slot = spiralSlots().find((sl) => !used.has(sl)) ?? p.slot;
        }
        return st;
      }
    } catch {
      /* สร้างใหม่ */
    }
    const rng = new RNG(20261013);
    const rooms = [makeWorld()];
    const listings: Record<string, TradeListing[]> = {};
    for (const r of rooms) listings[r.id] = seedListings(r, rng);
    const s = { rooms, listings };
    this.persist(s);
    return s;
  }

  private persist(s = this.store) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }

  listRooms() {
    return this.store.rooms.filter((r) => r.id === WORLD_ROOM);
  }

  getRoom(roomId: string) {
    return this.store.rooms.find((r) => r.id === roomId) ?? null;
  }

  join(roomId: string, playerId: string, name: string) {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'ไม่พบห้อง' };
    const mine = room.players.find((p) => p.id === playerId);
    if (mine) {
      if (name && mine.name !== name) {
        mine.name = name;
        this.persist();
      }
      return { room, slot: mine.slot };
    }
    if (room.players.length >= ROOM_CAPACITY) return { error: 'ห้องเต็มแล้ว (100/100) — ปิดรับผู้เล่นใหม่' };
    // สุ่มลงเกาะว่างในวงใกล้เกาะกลาง (แผนที่ขยายเป็นวงตามจำนวนคน)
    const used = new Set(room.players.map((p) => p.slot));
    const free = spiralSlots().filter((s) => !used.has(s));
    const pool = free.slice(0, Math.min(free.length, 10));
    const slot = pool[Math.floor(Math.random() * pool.length)];
    room.players.push({ id: playerId, name, slot, progress: 0 });
    this.persist();
    return { room, slot };
  }

  async joinAsync(roomId: string, playerId: string, name: string, opts: { fresh?: boolean } = {}) {
    if (opts.fresh) this.leave(roomId, playerId);
    return this.join(roomId, playerId, name);
  }

  async sync() {
    return null;
  }

  heartbeat() {
    /* ออฟไลน์: ไม่มีอะไรต้องรายงาน */
  }

  listings(roomId: string) {
    return this.store.listings[roomId] ?? [];
  }

  async postListing(roomId: string, l: Omit<TradeListing, 'id'>) {
    return this.postLocal(roomId, l);
  }

  postLocal(roomId: string, l: Omit<TradeListing, 'id'>) {
    const full: TradeListing = { ...l, id: `L${Date.now()}${Math.floor(Math.random() * 1000)}` };
    (this.store.listings[roomId] ??= []).push(full);
    this.persist();
    return full;
  }

  /** เอาออกจากแผงทันที (ซื้อ/ยกเลิก/บอทซื้อ) */
  takeLocal(roomId: string, listingId: string): TradeListing | null {
    const list = this.store.listings[roomId] ?? [];
    const i = list.findIndex((x) => x.id === listingId);
    if (i < 0) return null;
    const [l] = list.splice(i, 1);
    this.persist();
    return l;
  }

  async takeListing(roomId: string, listingId: string) {
    return this.takeLocal(roomId, listingId) ?? { error: 'มีคนซื้อไปแล้ว' };
  }

  async cancelListing(roomId: string, listingId: string) {
    return this.takeLocal(roomId, listingId) ?? { error: 'ไม่พบรายการนี้แล้ว' };
  }

  async claimSales() {
    return [];
  }

  leave(roomId: string, playerId: string) {
    const room = this.getRoom(roomId);
    if (!room) return;
    room.players = room.players.filter((p) => p.id !== playerId);
    this.store.listings[roomId] = (this.store.listings[roomId] ?? []).filter((l) => l.seller !== playerId);
    this.persist();
  }
}

/** บอท 30 คนชุดเดิม (ชื่อ/ความคืบหน้าคงที่ทุกเครื่อง) */
function makeBots(): RoomPlayer[] {
  const rng = new RNG(777);
  const order = spiralSlots();
  const players: RoomPlayer[] = [];
  for (let k = 0; k < 30; k++) players.push({ id: `bot_w_${k}`, name: `${rng.pick(NAMES)}${rng.int(1, 99)}`, slot: order[k], progress: rng.next() });
  return players;
}

/** แผนที่โลก: เริ่มด้วยผู้รอดชีวิตคนอื่น ~30 คน (จำลอง) — ยิ่งคนเยอะ แผนที่ยิ่งขยาย */
function makeWorld(): RoomInfo {
  return { id: WORLD_ROOM, name: 'แผนที่โลก', seed: randomSeed(), players: makeBots(), createdAt: Date.now() - 12 * 86400000 };
}

/** ของที่ผู้เล่นจำลองวางขายไว้บนเกาะกลาง */
function seedListings(room: RoomInfo, rng: RNG): TradeListing[] {
  const goods: [string, number, number][] = [
    ['wood', 20, 18], ['stone', 20, 18], ['iron_ingot', 3, 40], ['coal', 10, 28], ['sulfur', 5, 25], ['gold_ingot', 1, 50],
    ['crystal', 1, 70], ['rope', 10, 35], ['hide', 4, 26], ['carrot_seed', 6, 12], ['tomato_seed', 4, 14], ['pumpkin_seed', 3, 18],
    ['cooked_fish', 5, 40], ['veggie_stew', 2, 50], ['bandage', 3, 26], ['arrow', 30, 30], ['gear', 4, 48], ['fuel', 3, 40],
    ['crab_shell', 3, 40], ['meteorite', 1, 95], ['engine', 1, 180], ['iron_sword', 1, 70], ['crossbow', 1, 65],
  ];
  if (!room.players.length) return [];
  const out: TradeListing[] = [];
  const n = Math.min(24, 4 + Math.floor(room.players.length / 3));
  for (let i = 0; i < n; i++) {
    const [item, qty, price] = rng.pick(goods);
    const seller = rng.pick(room.players);
    out.push({ id: `S${i}`, seller: seller.id, sellerName: seller.name, item, qty, price: Math.round(price * rng.range(0.8, 1.3)), stall: i % 12 });
  }
  return out;
}

/** ผู้เล่นจริงหนึ่งช่องบนแผนที่ (แถวในชีต World) */
interface ServerPlayer {
  slot: number;
  accountId: string;
  playerName: string;
  character?: string;
  level?: number;
  power?: number;
  alive?: boolean;
}
interface ServerListing {
  id: string;
  sellerId: string;
  sellerName: string;
  item: string;
  qty: number;
  plus?: number;
  price: number;
  stall?: number;
}
/** แคชโลกออนไลน์ในเครื่อง (เล่นต่อได้ตอนเน็ตหลุด) */
const WORLD_CACHE = 'lastpixel.world.remote';
const SLOT_CACHE = 'lastpixel.slot.remote';
const BOT_KEEP = 10;

const toListing = (l: ServerListing): TradeListing => ({
  id: l.id, seller: l.sellerId, sellerName: l.sellerName, item: l.item, qty: Number(l.qty), price: Number(l.price), stall: Number(l.stall ?? 0), plus: l.plus ? Number(l.plus) : undefined,
});

/** โลกออนไลน์ — seed/ช่องเกาะ/ตลาดจากเซิร์ฟเวอร์ · แผงของบอทยังเป็นของในเครื่อง (LocalRoomService) */
class RemoteRoomService implements RoomService {
  readonly online = true;
  private bots = new LocalRoomService();
  private seed: number | null = null;
  private createdAt = Date.now();
  private real: ServerPlayer[] = [];
  private mySlot: number | null = null;
  private remote: TradeListing[] = [];
  private lastSync = 0;
  private cached: RoomInfo | null = null;

  constructor() {
    try {
      const w = JSON.parse(localStorage.getItem(WORLD_CACHE) ?? 'null') as { seed: number; createdAt: number; players: ServerPlayer[] } | null;
      if (w && Number.isFinite(w.seed)) {
        this.seed = w.seed;
        this.createdAt = w.createdAt;
        this.real = w.players ?? [];
      }
    } catch {
      /* ไม่มีแคช */
    }
  }

  private me() {
    return localPlayerId();
  }

  private loadMySlot(): number | null {
    try {
      const v = localStorage.getItem(scopedKey(SLOT_CACHE));
      return v === null ? null : Number(v);
    } catch {
      return null;
    }
  }

  private setMySlot(slot: number | null) {
    this.mySlot = slot;
    try {
      if (slot === null) localStorage.removeItem(scopedKey(SLOT_CACHE));
      else localStorage.setItem(scopedKey(SLOT_CACHE), String(slot));
    } catch {
      /* ignore */
    }
  }

  private setWorld(w: { seed: number; createdAt?: number; players: ServerPlayer[] }) {
    this.seed = Number(w.seed);
    if (w.createdAt) this.createdAt = Number(w.createdAt);
    this.real = (w.players ?? []).map((p) => ({ ...p, slot: Number(p.slot) }));
    const mine = this.real.find((p) => p.accountId === this.me());
    if (mine) this.setMySlot(mine.slot);
    this.cached = null;
    try {
      localStorage.setItem(WORLD_CACHE, JSON.stringify({ seed: this.seed, createdAt: this.createdAt, players: this.real }));
    } catch {
      /* ignore */
    }
  }

  /** ผู้เล่นจริง + บอทเติมช่องว่าง (บอทลดลงเมื่อคนจริงเยอะขึ้น แต่เหลืออย่างน้อย BOT_KEEP) */
  private room(): RoomInfo | null {
    if (this.seed === null) return null;
    if (this.cached) return this.cached;
    const me = this.me();
    const players: RoomPlayer[] = this.real.map((p) => ({
      id: p.accountId, name: p.playerName || 'ผู้รอดชีวิต', slot: p.slot, real: true,
      progress: p.accountId === me ? 0 : Math.min(1, (Number(p.level) || 1) / 40),
    }));
    this.mySlot ??= this.loadMySlot();
    if (this.mySlot !== null && !players.some((p) => p.id === me)) players.push({ id: me, name: '', slot: this.mySlot, progress: 0, real: true });
    const used = new Set(players.map((p) => p.slot));
    const free = spiralSlots().filter((sl) => !used.has(sl));
    const nBots = Math.min(free.length, Math.max(BOT_KEEP, 30 - players.length), ROOM_CAPACITY - players.length);
    makeBots().slice(0, Math.max(0, nBots)).forEach((b, k) => players.push({ ...b, slot: free[k] }));
    this.cached = { id: WORLD_ROOM, name: 'แผนที่โลก', seed: this.seed, players, createdAt: this.createdAt };
    return this.cached;
  }

  listRooms() {
    const r = this.room();
    return r ? [r] : [];
  }

  getRoom(roomId: string) {
    return roomId === WORLD_ROOM ? this.room() : null;
  }

  async sync(force = false) {
    if (!force && Date.now() - this.lastSync < 5000 && this.seed !== null) return null;
    const [w, m] = await Promise.all([
      api<{ seed: number; createdAt: number; players: ServerPlayer[] }>('world.get'),
      api<{ listings: ServerListing[] }>('market.list'),
    ]);
    if (m.ok) this.remote = m.listings.map(toListing);
    if (!w.ok) return this.seed === null ? w.error : null;
    this.setWorld(w);
    this.lastSync = Date.now();
    return null;
  }

  join(roomId: string, playerId: string, name: string): JoinResult {
    const room = this.getRoom(roomId);
    if (!room) return { error: 'ยังโหลดแผนที่โลกจากเซิร์ฟเวอร์ไม่ได้' };
    this.mySlot ??= this.loadMySlot();
    if (this.mySlot === null) return { error: 'ยังไม่ได้รับช่องเกาะจากเซิร์ฟเวอร์ — กลับหน้าแรกแล้วลองใหม่' };
    const mine = room.players.find((p) => p.id === playerId);
    if (mine && name) mine.name = name;
    return { room, slot: this.mySlot };
  }

  async joinAsync(roomId: string, playerId: string, name: string, opts: { fresh?: boolean; slot?: number; character?: string } = {}): Promise<JoinResult> {
    if (opts.fresh) {
      const r = await api('world.leave');
      if (!r.ok && r.code !== 'auth') return { error: r.error };
      this.setMySlot(null);
    }
    const r = await api<{ slot: number; seed: number; createdAt: number; players: ServerPlayer[] }>('world.join', { playerName: name, character: opts.character, slot: opts.slot });
    if (!r.ok) {
      // เน็ตหลุดแต่มีเซฟ + แคชโลก → เล่นออฟไลน์ไปก่อน (ซิงก์ทีหลัง)
      if ((r.code === 'network' || r.code === 'timeout') && !opts.fresh && opts.slot !== undefined && this.seed !== null) {
        this.setMySlot(opts.slot);
        this.cached = null;
        return this.join(roomId, playerId, name);
      }
      return { error: r.error };
    }
    this.setWorld(r);
    this.setMySlot(Number(r.slot));
    this.lastSync = Date.now();
    return this.join(roomId, playerId, name);
  }

  heartbeat(info: { level: number; power: number; alive: boolean }) {
    void api<{ players: ServerPlayer[]; seed: number }>('world.heartbeat', info).then((r) => {
      if (r.ok && r.players && this.seed !== null) this.setWorld({ seed: this.seed, players: r.players });
    });
    void api<{ listings: ServerListing[] }>('market.list').then((m) => m.ok && (this.remote = m.listings.map(toListing)));
  }

  listings(roomId: string) {
    return [...this.remote, ...this.bots.listings(roomId).filter((l) => l.seller.startsWith('bot'))];
  }

  async postListing(_roomId: string, l: Omit<TradeListing, 'id'>) {
    const r = await api<{ listing: ServerListing }>('market.post', { item: l.item, qty: l.qty, plus: l.plus ?? 0, price: l.price, stall: l.stall, sellerName: l.sellerName });
    if (!r.ok) return { error: r.error };
    const full = toListing(r.listing);
    this.remote.push(full);
    return full;
  }

  async takeListing(roomId: string, listingId: string) {
    if (!this.remote.some((x) => x.id === listingId)) return this.bots.takeListing(roomId, listingId);
    const r = await api<{ listing: ServerListing }>('market.buy', { id: listingId });
    this.remote = this.remote.filter((x) => x.id !== listingId);
    return r.ok ? toListing(r.listing) : { error: r.error };
  }

  async cancelListing(roomId: string, listingId: string) {
    if (!this.remote.some((x) => x.id === listingId)) return this.bots.cancelListing(roomId, listingId);
    const r = await api<{ listing: ServerListing }>('market.cancel', { id: listingId });
    if (r.ok) this.remote = this.remote.filter((x) => x.id !== listingId);
    return r.ok ? toListing(r.listing) : { error: r.error };
  }

  async claimSales() {
    const r = await api<{ sold: ServerListing[] }>('market.claim');
    return r.ok ? r.sold.map(toListing) : [];
  }

  leave(_roomId: string, playerId: string) {
    this.real = this.real.filter((p) => p.accountId !== playerId);
    this.cached = null;
    this.setMySlot(null);
    void api('world.leave');
  }
}

let service: RoomService | null = null;
export function getRoomService(): RoomService {
  service ??= apiEnabled() ? new RemoteRoomService() : new LocalRoomService();
  return service;
}

/** id ผู้เล่นในเครื่องนี้ (ออนไลน์ = id บัญชีบนเซิร์ฟเวอร์) */
export function localPlayerId(): string {
  if (apiEnabled()) {
    const acc = getAccounts().current();
    if (acc) return acc.id;
  }
  try {
    const k = scopedKey('lastpixel.pid');
    let id = localStorage.getItem(k);
    if (!id) {
      id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return 'guest';
  }
}
