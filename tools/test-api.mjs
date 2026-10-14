/**
 * ทดสอบ API ทุก action แบบ end-to-end ผ่าน HTTP
 *   node tools/test-api.mjs                     → เปิด mock backend (Code.gs จริงในหน่วยความจำ) แล้วทดสอบ
 *   API_URL=https://script.google.com/... node tools/test-api.mjs   → ทดสอบ Apps Script ที่ deploy แล้ว (สร้างบัญชีทดสอบจริงในชีต!)
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startServer } from './mock-backend.mjs';

let url = process.env.API_URL;
let server = null;
if (!url) {
  const s = await startServer(0, 0);
  server = s.server;
  url = `http://localhost:${s.port}`;
}

let passed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.stack ?? e}`);
    process.exitCode = 1;
  }
};

async function call(action, body = {}, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, action, token }),
    redirect: 'follow',
  });
  return res.json();
}

const ok = (r) => {
  assert.equal(r.ok, true, JSON.stringify(r).slice(0, 300));
  return r;
};
const bad = (r, code) => {
  assert.equal(r.ok, false, JSON.stringify(r).slice(0, 300));
  assert.equal(r.code, code, JSON.stringify(r).slice(0, 300));
  assert.equal(typeof r.error, 'string');
  return r;
};

const tag = crypto.randomBytes(3).toString('hex');
const A = { username: `alice_${tag}`, password: 'secret123' };
const B = { username: `บ๊อบ_${tag}`.slice(0, 16), password: 'hunter22' };
const C = { username: `carol_${tag}`, password: 'pass1234' };
let ta, tb, tc, accA, slotA;

console.log(`API: ${url}`);

await step('health (GET) + ping + CORS', async () => {
  const g = await fetch(url);
  const j = await g.json();
  assert.equal(j.ok, true);
  if (server) assert.equal(g.headers.get('access-control-allow-origin'), '*');
  ok(await call('ping'));
});

await step('คำขอผิดรูปแบบ / action ไม่รู้จัก / ไม่มี token', async () => {
  const r = await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{not json' })).json();
  bad(r, 'bad_request');
  bad(await call('nope'), 'bad_action');
  bad(await call('save.get'), 'auth');
  bad(await call('save.get', {}, 'tFAKE'), 'auth');
});

await step('register: ตรวจชื่อ/รหัส + ชื่อซ้ำ', async () => {
  bad(await call('register', { username: 'a b', password: 'secret123' }), 'invalid');
  bad(await call('register', { username: 'ok_name', password: '123' }), 'invalid');
  const r = ok(await call('register', A));
  assert.match(r.token, /^t[0-9a-f]{64}$/);
  assert.ok(r.expiresAt > Date.now() + 29 * 86400000);
  assert.equal(r.account.username, A.username);
  accA = r.account;
  ta = r.token;
  bad(await call('register', { ...A, username: A.username.toUpperCase() }), 'taken');
  tb = ok(await call('register', B)).token;
  tc = ok(await call('register', C)).token;
});

await step('login / me / รหัสผิด / จำกัดจำนวนครั้ง', async () => {
  bad(await call('login', { username: 'nobody_' + tag, password: 'x12345' }), 'bad_login');
  const r = ok(await call('login', { username: A.username.toUpperCase(), password: A.password }));
  assert.equal(r.account.id, accA.id);
  const me = ok(await call('me', {}, r.token));
  assert.equal(me.account.username, A.username);
  for (let i = 0; i < 5; i++) bad(await call('login', { username: C.username, password: 'wrong!!' }), 'bad_login');
  bad(await call('login', { username: C.username, password: C.password }), 'rate');
  // token เดิมของ C ยังใช้ได้
  ok(await call('me', {}, tc));
});

await step('save.get/put แบ่งหลายช่อง + กันเขียนทับด้วยเซฟเก่า + save.clear', async () => {
  const empty = ok(await call('save.get', {}, ta));
  assert.equal(empty.save, null);
  // ข้อมูลสุ่ม (บีบอัดไม่ลง) ~150KB → ต้องแบ่งหลายช่อง
  const big = JSON.stringify({ version: 3, name: 'ทดสอบไทย', blob: crypto.randomBytes(110000).toString('base64') });
  const t1 = Date.now();
  ok(await call('save.put', { save: big, updatedAt: t1, version: 3 }, ta));
  const got = ok(await call('save.get', {}, ta));
  assert.equal(got.save, big);
  assert.equal(got.updatedAt, t1);
  const st = bad(await call('save.put', { save: '{"old":1}', updatedAt: t1 - 1000 }, ta), 'stale');
  assert.equal(st.updatedAt, t1);
  // เซฟเล็กลงต้องไม่เหลือข้อมูลช่องเก่าค้าง
  const small = JSON.stringify({ version: 3, day: 2 });
  ok(await call('save.put', { save: small, updatedAt: t1 + 1 }, ta));
  assert.equal(ok(await call('save.get', {}, ta)).save, small);
  bad(await call('save.put', { save: 'not json', updatedAt: t1 + 2 }, ta), 'invalid');
  ok(await call('save.clear', { updatedAt: t1 + 5 }, ta));
  const cleared = ok(await call('save.get', {}, ta));
  assert.equal(cleared.save, null);
  assert.equal(cleared.updatedAt, t1 + 5);
  // เซฟของ B แยกจาก A
  assert.equal(ok(await call('save.get', {}, tb)).save, null);
});

await step('meta.get/put + stale', async () => {
  assert.equal(ok(await call('meta.get', {}, ta)).meta, null);
  const meta = JSON.stringify({ version: 2, playerName: 'อลิซ', lastCharacter: 'medic', bestPower: 120 });
  ok(await call('meta.put', { meta, updatedAt: 1000 }, ta));
  const g = ok(await call('meta.get', {}, ta));
  assert.equal(g.meta, meta);
  assert.equal(g.updatedAt, 1000);
  bad(await call('meta.put', { meta, updatedAt: 999 }, ta), 'stale');
});

await step('world.get / join (ช่องเดียวต่อบัญชี) / heartbeat / leave', async () => {
  const w = ok(await call('world.get', {}, ta));
  assert.ok(Number.isInteger(w.seed) && w.seed > 0);
  const j = ok(await call('world.join', { playerName: 'อลิซ', character: 'medic' }, ta));
  slotA = j.slot;
  assert.ok(j.slot >= 0 && j.slot < 121 && j.slot !== 60 && j.slot !== 115);
  assert.equal(j.seed, w.seed);
  assert.ok(j.players.some((p) => p.accountId === accA.id && p.playerName === 'อลิซ'));
  const again = ok(await call('world.join', { playerName: 'อลิซ2' }, ta));
  assert.equal(again.slot, slotA);
  assert.equal(again.players.filter((p) => p.accountId === accA.id).length, 1);
  // B ขอช่องเดียวกับ A → ได้ช่องอื่น
  const jb = ok(await call('world.join', { playerName: 'บ๊อบ', slot: slotA }, tb));
  assert.notEqual(jb.slot, slotA);
  // C ขอช่องที่ว่าง → ได้ตามขอ
  const want = [49, 50, 51, 59, 61, 69, 70, 71].find((s) => s !== slotA && s !== jb.slot);
  assert.equal(ok(await call('world.join', { playerName: 'แครอล', slot: want }, tc)).slot, want);
  const hb = ok(await call('world.heartbeat', { level: 7, power: 345, alive: true }, ta));
  const me = hb.players.find((p) => p.accountId === accA.id);
  assert.equal(me.level, 7);
  assert.equal(me.power, 345);
  ok(await call('world.leave', {}, tc));
  assert.ok(!ok(await call('world.get', {}, ta)).players.some((p) => p.slot === want));
});

let listing;
await step('market.post / list / buy / claim / cancel', async () => {
  bad(await call('market.post', { item: 'DROP TABLE', qty: 1, price: 10 }, ta), 'invalid');
  listing = ok(await call('market.post', { item: 'iron_ingot', qty: 3, price: 40, stall: 2, sellerName: 'อลิซ', plus: 0 }, ta)).listing;
  assert.equal(listing.status, 'open');
  const l = ok(await call('market.list', {}, tb));
  assert.ok(l.listings.some((x) => x.id === listing.id && x.item === 'iron_ingot' && x.qty === 3 && x.price === 40 && x.stall === 2));
  bad(await call('market.buy', { id: listing.id }, ta), 'invalid');
  const bought = ok(await call('market.buy', { id: listing.id }, tb));
  assert.equal(bought.listing.item, 'iron_ingot');
  bad(await call('market.buy', { id: listing.id }, tc), 'sold');
  assert.ok(!ok(await call('market.list', {}, tb)).listings.some((x) => x.id === listing.id));
  const claim = ok(await call('market.claim', {}, ta));
  assert.equal(claim.sold.length, 1);
  assert.equal(claim.sold[0].price, 40);
  assert.equal(ok(await call('market.claim', {}, ta)).sold.length, 0);
  const l2 = ok(await call('market.post', { item: 'wood', qty: 20, price: 18, stall: 0, plus: 2 }, ta)).listing;
  assert.equal(l2.plus, 2);
  bad(await call('market.cancel', { id: l2.id }, tb), 'forbidden');
  ok(await call('market.cancel', { id: l2.id }, ta));
  bad(await call('market.buy', { id: l2.id }, tb), 'sold');
  bad(await call('market.buy', { id: 'Mnope' }, tb), 'not_found');
});

await step('market.buy พร้อมกัน 2 คน → ได้คนเดียว', async () => {
  const l = ok(await call('market.post', { item: 'gold_ingot', qty: 1, price: 50 }, ta)).listing;
  const rs = await Promise.all([call('market.buy', { id: l.id }, tb), call('market.buy', { id: l.id }, tc)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(rs.filter((r) => !r.ok && r.code === 'sold').length, 1);
});

await step('world.leave → ของที่วางขายอยู่หมดอายุ', async () => {
  const l = ok(await call('market.post', { item: 'stone', qty: 5, price: 9 }, tb)).listing;
  ok(await call('world.leave', {}, tb));
  assert.ok(!ok(await call('market.list', {}, ta)).listings.some((x) => x.id === l.id));
});

await step('leaderboard.submit / get (เก็บค่าสูงสุด)', async () => {
  ok(await call('leaderboard.submit', { bestPower: 500, bestDays: 4, kills: 30, playerName: 'อลิซ' }, ta));
  ok(await call('leaderboard.submit', { bestPower: 900, bestDays: 2, kills: 5, playerName: 'บ๊อบ' }, tb));
  ok(await call('leaderboard.submit', { bestPower: 100, bestDays: 1, kills: 1, playerName: 'อลิซ' }, ta));
  const top = ok(await call('leaderboard.get', {}, tc)).top;
  const ia = top.findIndex((r) => r.accountId === accA.id);
  assert.ok(ia >= 0);
  assert.equal(top[ia].bestPower, 500);
  assert.equal(top[ia].bestDays, 4);
  assert.ok(top.findIndex((r) => r.playerName === 'บ๊อบ') < ia);
  assert.ok(top.length <= 50);
});

await step('logout → token ใช้ไม่ได้', async () => {
  ok(await call('logout', {}, ta));
  bad(await call('me', {}, ta), 'auth');
  ok(await call('me', {}, tb));
});

if (server) server.close();
console.log(process.exitCode ? `\nล้มเหลว (ผ่าน ${passed} ข้อ)` : `\nผ่านทั้งหมด ${passed} ข้อ`);
