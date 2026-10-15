/**
 * ทดสอบ API ทุก action แบบ end-to-end ผ่าน HTTP
 *   node tools/test-api.mjs                     → เปิด mock backend (Code.gs จริงในหน่วยความจำ) แล้วทดสอบ
 *   API_URL=https://script.google.com/... node tools/test-api.mjs   → ทดสอบ Apps Script ที่ deploy แล้ว (เฉพาะส่วนที่ไม่ต้องอ่านอีเมล)
 *   เทสต์บัญชีอีเมลใช้ action เฉพาะ mock (__mail / __clock / __legacy) อ่านรหัสจากอีเมลจำลองและเลื่อนเวลา
 *   เทสต์ Google Sign-In ใช้ token ปลอม fakeGoogleToken() ที่ tokeninfo จำลองใน mock รับ
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createBackend, fakeGoogleToken, startServer } from './mock-backend.mjs';

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
const A = { email: `alice.${tag}@example.com`, password: 'secret123', name: `alice_${tag}` };
const B = { email: `bob.${tag}@example.com`, password: 'hunter22x', name: `บ๊อบ_${tag}`.slice(0, 16) };
const C = { email: `carol.${tag}@example.com`, password: 'pass1234', name: `carol_${tag}` };
let ta, tb, tc, accA, slotA;

/** อีเมลฉบับล่าสุดที่ส่งถึง address (mock เท่านั้น) */
const mailTo = async (email) => (await call('__mail', { email })).mail;
const codeOf = async (email) => {
  const m = await mailTo(email);
  assert.ok(m && /^\d{6}$/.test(m.code), 'ไม่มีอีเมลรหัสถึง ' + email);
  return m.code;
};
/** เลื่อนเวลาเซิร์ฟเวอร์ (mock เท่านั้น) */
const advance = (ms) => call('__clock', { advanceMs: ms });
/** สมัคร → อ่านรหัสจากอีเมล → ยืนยัน → ได้ token */
async function signup(u) {
  const r = ok(await call('register', u));
  assert.equal(r.needVerify, true);
  const v = ok(await call('verify', { email: u.email, code: await codeOf(u.email) }));
  return v;
}

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
  bad(await call('email.attach', { email: 'x@example.com' }), 'auth');
});

await step('register: ตรวจอีเมล/รหัสผ่าน/ชื่อในเกม', async () => {
  bad(await call('register', { ...A, email: 'not-an-email' }), 'invalid');
  bad(await call('register', { ...A, email: 'a b@example.com' }), 'invalid');
  bad(await call('register', { ...A, email: 'a@example' }), 'invalid');
  bad(await call('register', { ...A, password: 'abc123' }), 'invalid'); // สั้นกว่า 8
  bad(await call('register', { ...A, password: 'abcdefgh' }), 'invalid'); // ไม่มีตัวเลข
  bad(await call('register', { ...A, password: '12345678' }), 'invalid'); // ไม่มีตัวอักษร
  bad(await call('register', { ...A, name: 'a b' }), 'invalid');
  bad(await call('register', { ...A, name: 'ab' }), 'invalid');
  bad(await call('forgot', { email: 'nope' }), 'invalid');
});

if (!server) {
  // เซิร์ฟเวอร์จริงอ่านอีเมลไม่ได้ → ทดสอบต่อไม่ได้ (ทุกอย่างต้องยืนยันอีเมลก่อน)
  console.log('  · ข้ามเทสต์ที่ต้องอ่านรหัสจากอีเมล (ใช้ได้เฉพาะ mock: รัน npm run test:api โดยไม่ตั้ง API_URL)');
  console.log(process.exitCode ? `\nล้มเหลว (ผ่าน ${passed} ข้อ)` : `\nผ่านทั้งหมด ${passed} ข้อ`);
  process.exit();
}

await step('register → ยังไม่ได้ token → login ก่อนยืนยัน = unverified → resend รอ 60 วิ → verify', async () => {
  const r = ok(await call('register', { ...A, email: A.email.toUpperCase() }));
  assert.equal(r.needVerify, true);
  assert.equal(r.token, undefined);
  assert.equal(r.email, A.email);
  assert.equal(r.sent, true);
  const m = await mailTo(A.email);
  assert.match(m.subject, /Survivor Isles/);
  assert.match(m.body, /รหัส: \d{6}/);
  assert.equal(m.name, 'Survivor Isles');
  const code1 = m.code;
  // ยังไม่ยืนยัน: เข้าระบบได้แค่ไปหน้าใส่รหัส (ส่งใหม่ไม่ได้เพราะยังไม่พ้น 60 วิ)
  const u = bad(await call('login', { email: A.email, password: A.password }), 'unverified');
  assert.equal(u.email, A.email);
  assert.equal(u.sent, false);
  assert.ok(u.wait > 0 && u.wait <= 60);
  assert.equal(u.token, undefined);
  const cd = bad(await call('resend', { email: A.email }), 'cooldown');
  assert.ok(cd.wait > 0 && cd.wait <= 60);
  // รหัสผิด / รูปแบบผิด
  const w = bad(await call('verify', { email: A.email, code: code1 === '000000' ? '111111' : '000000' }), 'bad_code');
  assert.equal(w.left, 4);
  bad(await call('verify', { email: A.email, code: '12ab' }), 'invalid');
  // พ้น 60 วิ → ส่งรหัสใหม่ได้ → รหัสเก่าใช้ไม่ได้
  await advance(61000);
  ok(await call('resend', { email: A.email }));
  const code2 = await codeOf(A.email);
  if (code2 !== code1) bad(await call('verify', { email: A.email, code: code1 }), 'bad_code');
  const v = ok(await call('verify', { email: A.email, code: code2 }));
  assert.match(v.token, /^t[0-9a-f]{64}$/);
  assert.ok(v.expiresAt > Date.now() + 29 * 86400000);
  assert.equal(v.account.username, A.name);
  assert.equal(v.account.email, A.email);
  assert.equal(v.account.needEmail, false);
  accA = v.account;
  ta = v.token;
  bad(await call('verify', { email: A.email, code: code2 }), 'already');
  const me = ok(await call('me', {}, ta));
  assert.equal(me.account.email, A.email);
});

await step('อีเมลซ้ำ / ชื่อในเกมซ้ำ', async () => {
  bad(await call('register', { ...B, email: A.email.toUpperCase() }), 'email_taken');
  bad(await call('register', { ...B, name: A.name.toUpperCase() }), 'taken');
});

await step('ใส่รหัสผิดครบ 5 ครั้ง → ต้องขอรหัสใหม่', async () => {
  ok(await call('register', B));
  const code = await codeOf(B.email);
  const wrong = code === '999999' ? '888888' : '999999';
  for (let i = 1; i <= 4; i++) assert.equal(bad(await call('verify', { email: B.email, code: wrong }), 'bad_code').left, 5 - i);
  bad(await call('verify', { email: B.email, code: wrong }), 'too_many');
  // รหัสถูกก็ใช้ไม่ได้แล้ว
  bad(await call('verify', { email: B.email, code }), 'too_many');
  await advance(61000);
  ok(await call('resend', { email: B.email }));
  tb = ok(await call('verify', { email: B.email, code: await codeOf(B.email) })).token;
});

await step('รหัสหมดอายุ 15 นาที → login ส่งรหัสใหม่ให้เอง', async () => {
  ok(await call('register', C));
  const old = await codeOf(C.email);
  await advance(16 * 60000);
  bad(await call('verify', { email: C.email, code: old }), 'expired');
  const u = bad(await call('login', { email: C.email, password: C.password }), 'unverified');
  assert.equal(u.sent, true);
  assert.equal(u.wait, 60);
  tc = ok(await call('verify', { email: C.email, code: await codeOf(C.email) })).token;
});

await step('login ด้วยอีเมล / รหัสผิด / ไม่บอกว่ามีบัญชีไหม / จำกัดจำนวนครั้ง', async () => {
  const r = ok(await call('login', { email: ` ${A.email.toUpperCase()} `, password: A.password }));
  assert.equal(r.account.id, accA.id);
  assert.equal(r.account.needEmail, false);
  ok(await call('me', {}, r.token));
  const e1 = bad(await call('login', { email: 'nobody_' + tag + '@example.com', password: 'x1234567' }), 'bad_login');
  const e2 = bad(await call('login', { email: A.email, password: 'wrong1234' }), 'bad_login');
  assert.equal(e1.error, e2.error);
  // ชื่อในเกมของบัญชีอีเมล ใช้แทนอีเมลไม่ได้
  bad(await call('login', { username: A.name, password: A.password }), 'use_email');
  for (let i = 0; i < 5; i++) bad(await call('login', { email: C.email, password: 'wrong!!1' }), 'bad_login');
  bad(await call('login', { email: C.email, password: C.password }), 'rate');
  // token เดิมของ C ยังใช้ได้
  ok(await call('me', {}, tc));
});

await step('forgot / reset: ข้อความเหมือนกันทุกกรณี + ตั้งรหัสใหม่ + token เก่าใช้ไม่ได้', async () => {
  const ghost = `ghost.${tag}@example.com`;
  const g = ok(await call('forgot', { email: ghost }));
  assert.equal(await mailTo(ghost), null);
  const f = ok(await call('forgot', { email: A.email }));
  assert.equal(f.message, g.message);
  assert.match(f.message, /ถ้ามีบัญชีนี้ เราได้ส่งรหัสไปแล้ว/);
  const code = await codeOf(A.email);
  assert.match((await mailTo(A.email)).subject, /รหัสผ่านใหม่/);
  bad(await call('forgot', { email: A.email }), 'cooldown');
  bad(await call('forgot', { email: ghost }), 'cooldown');
  bad(await call('reset', { email: A.email, code, password: 'short1' }), 'invalid');
  bad(await call('reset', { email: A.email, code: code === '123456' ? '654321' : '123456', password: 'newpass99' }), 'bad_code');
  bad(await call('reset', { email: ghost, code: '123456', password: 'newpass99' }), 'bad_code');
  const r = ok(await call('reset', { email: A.email, code, password: 'newpass99' }));
  assert.equal(r.account.id, accA.id);
  bad(await call('me', {}, ta), 'auth');
  bad(await call('reset', { email: A.email, code, password: 'newpass99' }), 'bad_code');
  bad(await call('login', { email: A.email, password: A.password }), 'bad_login');
  A.password = 'newpass99';
  ta = ok(await call('login', { email: A.email, password: A.password })).token;
  ok(await call('me', {}, ta));
});

await step('สมัครแล้วยังไม่ยืนยัน → ลืมรหัสผ่านได้ทันที (เวลารอแยกตามประเภท) → reset = ยืนยันอีเมลไปด้วย', async () => {
  const D = { email: `dan.${tag}@example.com`, password: 'dandan12', name: `dan_${tag}` };
  ok(await call('register', D));
  ok(await call('forgot', { email: D.email }));
  assert.match((await mailTo(D.email)).subject, /รหัสผ่านใหม่/);
  const r = ok(await call('reset', { email: D.email, code: await codeOf(D.email), password: 'danNew99' }));
  assert.equal(r.account.username, D.name);
  ok(await call('login', { email: D.email, password: 'danNew99' }));
});

await step('บัญชีเก่า (ชื่อผู้ใช้) → เข้าได้ + needEmail → email.attach / email.confirm → ต่อไปใช้อีเมล', async () => {
  const L = { username: `Tawan_${tag}`, password: 'old123' };
  const leg = ok(await call('__legacy', L));
  const r = ok(await call('login', { email: L.username.toLowerCase(), password: L.password }));
  assert.equal(r.account.id, leg.id);
  assert.equal(r.account.username, L.username);
  assert.equal(r.account.needEmail, true);
  const t = r.token;
  assert.equal(ok(await call('me', {}, t)).account.needEmail, true);
  bad(await call('email.attach', { email: 'bad@' }, t), 'invalid');
  bad(await call('email.attach', { email: B.email }, t), 'email_taken');
  bad(await call('email.confirm', { code: '123456' }, t), 'no_code');
  const le = `tawan.${tag}@example.com`;
  const at = ok(await call('email.attach', { email: le.toUpperCase() }, t));
  assert.equal(at.email, le);
  const code = await codeOf(le);
  assert.match((await mailTo(le)).subject, /ผูกอีเมล/);
  bad(await call('email.attach', { email: le }, t), 'cooldown');
  bad(await call('email.confirm', { code: code === '000001' ? '000002' : '000001' }, t), 'bad_code');
  // ยังไม่ยืนยัน → ยังเข้าด้วยชื่อผู้ใช้ได้ อีเมลยังใช้เข้าไม่ได้
  ok(await call('login', { username: L.username, password: L.password }));
  bad(await call('login', { email: le, password: L.password }), 'bad_login');
  const c = ok(await call('email.confirm', { code }, t));
  assert.equal(c.account.email, le);
  assert.equal(c.account.needEmail, false);
  assert.equal(ok(await call('me', {}, t)).account.needEmail, false);
  bad(await call('email.attach', { email: `x.${tag}@example.com` }, t), 'has_email');
  bad(await call('login', { username: L.username, password: L.password }), 'use_email');
  const byMail = ok(await call('login', { email: le, password: L.password }));
  assert.equal(byMail.account.id, leg.id);
  bad(await call('register', { email: le, password: 'abcd1234', name: `n_${tag}` }), 'email_taken');
  bad(await call('register', { email: `n.${tag}@example.com`, password: 'abcd1234', name: L.username }), 'taken');
});

const NAME_RE = /^[a-zA-Z0-9_฀-๿]{3,16}$/;
/** token ปลอมของ Google (mock) — sub/email ไม่ซ้ำกับรอบอื่น */
const gtok = (o) => fakeGoogleToken({ sub: `1${parseInt(tag, 16)}${o.n ?? 0}`, email: `g${o.n ?? 0}.${tag}@gmail.com`, given_name: 'Gina Tester', name: 'Gina Tester', ...o, n: undefined });

await step('auth.google: token เสีย / aud ผิด / iss ผิด / หมดอายุ / อีเมลยังไม่ยืนยัน → ปฏิเสธ · ปิดอยู่ = google_off', async () => {
  bad(await call('auth.google', {}), 'invalid');
  bad(await call('auth.google', { credential: 'not a token!' }), 'invalid');
  bad(await call('auth.google', { credential: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln' }), 'google_bad'); // Google ตอบ 400
  bad(await call('auth.google', { credential: gtok({ n: 90, aud: 'someone-else.apps.googleusercontent.com' }) }), 'google_bad');
  bad(await call('auth.google', { credential: gtok({ n: 91, iss: 'https://evil.example.com' }) }), 'google_bad');
  bad(await call('auth.google', { credential: gtok({ n: 92, expIn: -5 }) }), 'google_expired');
  bad(await call('auth.google', { credential: gtok({ n: 93, email_verified: false }) }), 'google_unverified');
  // ไม่มีบัญชีไหนถูกสร้างจาก token ที่ถูกปฏิเสธ
  for (const n of [90, 91, 92, 93]) ok(await call('register', { email: `g${n}.${tag}@gmail.com`, password: 'abcd1234', name: `gx${n}_${tag}` }));
  const off = createBackend({ googleClientId: '' });
  const r = off.post(JSON.stringify({ action: 'auth.google', credential: gtok({ n: 94 }) }));
  assert.equal(r.code, 'google_off');
  assert.equal(off.google.calls, 0);
});

await step('auth.google บัญชีใหม่ → needName → account.setName (ครั้งเดียว) → เข้าอีกครั้งได้บัญชีเดิม', async () => {
  const t1 = gtok({ n: 1 });
  const r = ok(await call('auth.google', { credential: t1 }));
  assert.match(r.token, /^t[0-9a-f]{64}$/);
  assert.equal(r.account.email, `g1.${tag}@gmail.com`);
  assert.equal(r.account.needEmail, false);
  assert.equal(r.account.needName, true);
  assert.match(r.account.username, /^Gina_Tester\d*$/);
  assert.match(r.account.username, NAME_RE);
  assert.equal(ok(await call('me', {}, r.token)).account.needName, true);
  // ยังไม่ยืนยันชื่อ → เข้าใหม่ก็ยังถามชื่อ
  const again = ok(await call('auth.google', { credential: t1 }));
  assert.equal(again.account.id, r.account.id);
  assert.equal(again.account.needName, true);
  // บัญชี Google ไม่มีรหัสผ่าน / ยืนยันอีเมลแล้ว
  bad(await call('login', { email: `g1.${tag}@gmail.com`, password: 'nopw$0$' }), 'bad_login');
  bad(await call('verify', { email: `g1.${tag}@gmail.com`, code: '123456' }), 'already');
  bad(await call('account.setName', { name: 'x' }), 'auth');
  bad(await call('account.setName', { name: 'a b' }, r.token), 'invalid');
  bad(await call('account.setName', { name: A.name.toUpperCase() }, r.token), 'taken');
  const nm = `จีน่า_${tag}`.slice(0, 16);
  const s = ok(await call('account.setName', { name: nm }, r.token));
  assert.equal(s.account.username, nm);
  assert.equal(s.account.needName, false);
  bad(await call('account.setName', { name: `gina2_${tag}` }, r.token), 'name_set');
  assert.equal(ok(await call('me', {}, r.token)).account.username, nm);
  const back = ok(await call('auth.google', { credential: t1 }));
  assert.equal(back.account.id, r.account.id);
  assert.equal(back.account.username, nm);
  assert.equal(back.account.needName, false);
  // ชื่อที่ตั้งแล้วกันคนอื่นสมัครซ้ำ
  bad(await call('register', { email: `n2.${tag}@example.com`, password: 'abcd1234', name: nm }), 'taken');
});

await step('auth.google ชื่อชั่วคราว: ซ้ำ → ต่อตัวเลข · ไทย · สั้น/อักขระแปลก → ใช้ชื่ออื่นแทน', async () => {
  const dup = ok(await call('auth.google', { credential: gtok({ n: 2, given_name: A.name }) }));
  assert.notEqual(dup.account.username.toLowerCase(), A.name.toLowerCase());
  assert.match(dup.account.username, NAME_RE);
  assert.ok(dup.account.username.startsWith(A.name.slice(0, 10)));
  const th = ok(await call('auth.google', { credential: gtok({ n: 3, given_name: 'สมชาย', name: 'สมชาย ใจดี' }) }));
  assert.match(th.account.username, /^สมชาย\d*$/);
  const odd = ok(await call('auth.google', { credential: gtok({ n: 4, given_name: '李', name: '🙂 Li', email: `li.wei.${tag}@gmail.com` }) }));
  assert.match(odd.account.username, NAME_RE);
  assert.ok(odd.account.username.startsWith('liwei'), odd.account.username);
  // ชื่อซ้ำกันเองในหลายบัญชี Google ก็ไม่ชน
  const names = new Set();
  for (const n of [5, 6, 7]) names.add(ok(await call('auth.google', { credential: gtok({ n, given_name: 'Twin' }) })).account.username.toLowerCase());
  assert.equal(names.size, 3);
});

await step('auth.google ผูกกับบัญชีอีเมลเดิมอัตโนมัติ · บัญชีค้างยืนยัน → ยืนยันให้ + ล้างรหัสผ่านเดิม · Google คนละคน → google_linked', async () => {
  const meB = ok(await call('me', {}, tb)).account;
  const sub = `7${parseInt(tag, 16)}`;
  const g = ok(await call('auth.google', { credential: fakeGoogleToken({ sub, email: B.email.toUpperCase(), given_name: 'Bob' }) }));
  assert.equal(g.account.id, meB.id);
  assert.equal(g.account.username, B.name);
  assert.equal(g.account.needName, false);
  // รหัสผ่านเดิมยังใช้ได้ · token เดิมยังใช้ได้
  ok(await call('login', { email: B.email, password: B.password }));
  ok(await call('me', {}, tb));
  // ผูกแล้ว: เปลี่ยนอีเมลใน Google ก็ยังเข้าบัญชีเดิมด้วย sub
  assert.equal(ok(await call('auth.google', { credential: fakeGoogleToken({ sub, email: `bob.new.${tag}@gmail.com` }) })).account.id, meB.id);
  bad(await call('auth.google', { credential: fakeGoogleToken({ sub: `8${parseInt(tag, 16)}`, email: B.email }) }), 'google_linked');
  // สมัครค้างไว้ (ยังไม่ยืนยันอีเมล) แล้วมาเข้าด้วย Google อีเมลเดียวกัน
  const P = { email: `pending.${tag}@example.com`, password: 'pend1234', name: `pend_${tag}` };
  ok(await call('register', P));
  const code = await codeOf(P.email);
  const pg = ok(await call('auth.google', { credential: fakeGoogleToken({ sub: `9${parseInt(tag, 16)}`, email: P.email }) }));
  assert.equal(pg.account.username, P.name);
  assert.equal(pg.account.needName, false);
  bad(await call('login', { email: P.email, password: P.password }), 'bad_login');
  bad(await call('verify', { email: P.email, code }), 'already');
});

await step('auth.google จำกัดความถี่: token ผิดรวมทั้งระบบเกินเพดาน → rate', async () => {
  const be = createBackend();
  const post = (o) => be.post(JSON.stringify(o));
  for (let i = 0; i < 300; i++) assert.equal(post({ action: 'auth.google', credential: fakeGoogleToken({ sub: '1', email: 'x@gmail.com', aud: 'bad' }) }).code, 'google_bad');
  const calls = be.google.calls;
  assert.equal(post({ action: 'auth.google', credential: fakeGoogleToken({ sub: '1', email: 'x@gmail.com' }) }).code, 'rate');
  assert.equal(be.google.calls, calls); // ไม่ถาม Google เพิ่ม
});

await step('setup เติมคอลัมน์ใหม่ให้ชีต Accounts เดิมโดยข้อมูลไม่หาย', async () => {
  const OLD = ['id', 'username', 'salt', 'hash', 'createdAt', 'lastLogin', 'playerName', 'character', 'banned'];
  let legacyRow;
  const be = createBackend({
    prepare: (ss) => {
      const sh = ss.insertSheet('Accounts');
      sh.appendRow(OLD);
      const salt = 'abc';
      // แฮชแบบเดียวกับ hashPassword_ ของ Code.gs (SHA-256(salt:pw) แล้ววนต่อ pw อีก 1999 รอบ)
      const pw = Buffer.from('legacy1', 'utf8');
      let h = crypto.createHash('sha256').update(`${salt}:legacy1`).digest();
      for (let i = 1; i < 2000; i++) h = crypto.createHash('sha256').update(Buffer.concat([h, pw])).digest();
      legacyRow = ["'acc_old1", "'Tawan", `'${salt}`, `'v1$2000$${h.toString('hex')}`, 1700000000000, 1700000000000, "'ทาวัน", "'medic", false];
      sh.appendRow(legacyRow);
    },
  });
  const sh = be.ss.getSheetByName('Accounts');
  assert.deepEqual(sh.getRange(1, 1, 1, 15).getValues()[0], [...OLD, 'email', 'verified', 'verifyHash', 'verifyExp', 'verifyTries', 'googleSub']);
  assert.deepEqual(sh.getRange(2, 1, 1, 9).getValues()[0], legacyRow.map((v) => (typeof v === 'string' ? v.slice(1) : v)));
  assert.ok(be.setupLog.some((l) => l.includes('เพิ่มคอลัมน์')));
  be.setup(); // รันซ้ำได้
  assert.equal(sh.getLastRow(), 2);
  const r = be.post(JSON.stringify({ action: 'login', username: 'tawan', password: 'legacy1' }));
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.account.id, 'acc_old1');
  assert.equal(r.account.needEmail, true);
});

await step('MailApp โควตาหมด → แจ้ง mail_quota', async () => {
  const be = createBackend({ mailQuota: 0 });
  const r = be.post(JSON.stringify({ action: 'register', email: `q.${tag}@example.com`, password: 'abcd1234', name: `q_${tag}` }));
  assert.equal(r.ok, true);
  assert.equal(r.sent, false);
  const f = be.post(JSON.stringify({ action: 'forgot', email: `q.${tag}@example.com` }));
  assert.equal(f.code, 'mail_quota');
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

await step('chat.post / chat.get (since) / ตัดอักขระ+คำหยาบ / ยาวเกิน / จำกัดความถี่', async () => {
  bad(await call('chat.get'), 'auth');
  bad(await call('chat.post', { text: '   ' }, ta), 'invalid');
  bad(await call('chat.post', { text: 'x'.repeat(141) }, ta), 'too_long');
  bad(await call('chat.post', { text: 'hi', channel: 'island' }, ta), 'invalid');
  const p1 = ok(await call('chat.post', { text: ' <b>สวัสดี</b>\u0001 ชาว\n\nเกาะ  fuck ', playerName: 'อลิซ' }, ta)).message;
  assert.equal(p1.text, 'bสวัสดี/b ชาว เกาะ ****');
  assert.equal(p1.name, 'อลิซ');
  assert.equal(p1.accountId, accA.id);
  assert.equal(p1.channel, 'world');
  assert.match(p1.id, /^C[0-9a-z]+$/);
  // ส่งซ้ำทันที → ต้องเว้น 2 วิ
  assert.equal(bad(await call('chat.post', { text: 'เร็วไป' }, ta), 'rate').wait, 2);
  await advance(2100);
  const p2 = ok(await call('chat.post', { text: 'ข้อความที่สอง' }, ta)).message;
  assert.ok(p2.time > p1.time);
  // ไม่ส่งชื่อ → ใช้ชื่อในบัญชี
  const pb = ok(await call('chat.post', { text: 'hello from bob' }, tb)).message;
  assert.equal(pb.name, B.name);
  // ดึงทั้งหมด: เก่า→ใหม่ + serverTime + latest
  const g = ok(await call('chat.get', {}, tc));
  assert.equal(typeof g.serverTime, 'number');
  const ids = g.messages.map((m) => m.id);
  assert.deepEqual(ids.slice(ids.indexOf(p1.id)), [p1.id, p2.id, pb.id]);
  assert.equal(g.latest, pb.time);
  // since = เวลาที่เห็นล่าสุด → ได้เฉพาะที่ใหม่กว่า
  assert.deepEqual(ok(await call('chat.get', { since: p1.time }, tc)).messages.map((m) => m.id), [p2.id, pb.id]);
  assert.equal(ok(await call('chat.get', { since: pb.time }, tc)).messages.length, 0);
  // ≤ 20 ข้อความ/นาที (A ส่งไปแล้ว 2)
  for (let i = 0; i < 18; i++) {
    await advance(2100);
    ok(await call('chat.post', { text: `spam ${i}` }, ta));
  }
  await advance(2100);
  assert.ok(bad(await call('chat.post', { text: 'ข้อความที่ 21' }, ta), 'rate').wait > 0);
  await advance(61000);
  ok(await call('chat.post', { text: 'ครบนาทีแล้ว' }, ta));
  assert.ok(ok(await call('chat.get', {}, tb)).messages.length <= 50);
  // heartbeat บอกข้อความล่าสุด
  const hb = ok(await call('world.heartbeat', { level: 1, power: 1, alive: true }, ta));
  assert.ok(hb.chat && hb.chat.latest > 0 && /^C/.test(hb.chat.latestId));
});

await step('ชีต Chat เก็บไม่เกิน 2,000 แถว (เกินแล้วลบ 200 แถวเก่าสุด)', async () => {
  const be = createBackend({
    prepare: (ss) => {
      const sh = ss.insertSheet('Chat');
      sh.appendRow(['id', 'time', 'accountId', 'playerName', 'text', 'channel']);
      for (let i = 0; i < 2200; i++) sh.appendRow([`'C${i}`, 1000 + i, "'acc_x", "'x", "'m", "'world"]);
    },
  });
  const em = `zed.${tag}@example.com`;
  const post = (o) => be.post(JSON.stringify(o));
  assert.equal(post({ action: 'register', email: em, password: 'abcd1234', name: `zed_${tag}` }).ok, true);
  const code = /\b(\d{6})\b/.exec(be.mail.last.get(em).body)[1];
  const v = post({ action: 'verify', email: em, code });
  assert.equal(v.ok, true, JSON.stringify(v));
  const p = post({ action: 'chat.post', text: 'ตัดแถวเก่า', token: v.token });
  assert.equal(p.ok, true, JSON.stringify(p));
  const sh = be.ss.getSheetByName('Chat');
  assert.equal(sh.getLastRow() - 1, 2200 + 1 - 200);
  assert.equal(sh.getRange(2, 1, 1, 1).getValues()[0][0], 'C200');
  const g = post({ action: 'chat.get', token: v.token });
  assert.equal(g.messages.length, 50);
  assert.equal(g.messages[49].id, p.message.id);
});

await step('presence.put / get / sync: ตัดค่า · ไม่เห็นตัวเอง · จำกัด 1 ครั้ง/วิ · เส้นทาง · กรองตามช่อง · ซ่อน · หมดอายุ · bye', async () => {
  bad(await call('presence.sync', { x: 1, y: 1 }), 'auth');
  bad(await call('presence.get'), 'auth');
  await advance(5000);
  // A ยืนบนเกาะกลาง (ช่อง 60) — ค่าแปลกๆ ถูกตัด
  const pa = ok(await call('presence.put', { x: 7000.7, y: -50, s: 60, f: 'u', fl: 1, a: 'atk', c: 'medic', o: 'Bad Key!', h: 'hood', k: 'red', lv: 5000, hp: 140, al: true, z: 'safe', name: ' <อลิซ> ', rd: 'raft', alt: 3 }, ta));
  assert.equal(typeof pa.serverTime, 'number');
  const g = ok(await call('presence.get', {}, tb));
  const ea = g.players.find((p) => p.id === accA.id);
  assert.ok(ea, 'B ต้องเห็น A');
  assert.deepEqual([ea.x, ea.y, ea.s, ea.f, ea.fl, ea.a, ea.c, ea.o, ea.h, ea.k, ea.lv, ea.hp, ea.al, ea.z, ea.n, ea.rd, ea.alt, ea.hid], [7000, 0, 60, 'u', 1, 'atk', 'medic', '', 'hood', 'red', 999, 100, 1, 'safe', 'อลิซ', 'raft', 3, 0]);
  assert.equal(ea.t, pa.serverTime);
  assert.ok(!ok(await call('presence.get', {}, ta)).players.some((p) => p.id === accA.id), 'ไม่เห็นตัวเอง');
  // ส่งซ้ำทันที → rate (put) / ข้ามการบันทึกแต่ยังได้รายชื่อ (sync)
  assert.ok(bad(await call('presence.put', { x: 1, y: 1, s: 60 }, ta), 'rate').wait > 0);
  const sr = ok(await call('presence.sync', { x: 1, y: 1, s: 60 }, ta));
  assert.equal(sr.rated, true);
  assert.equal(ok(await call('presence.get', {}, tb)).players.find((p) => p.id === accA.id).x, 7000);
  // เส้นทาง: จุดย้อนหลัง (ms ก่อนส่ง) ต่อจากของเดิม เรียงตามเวลา
  await advance(2500);
  ok(await call('presence.put', { x: 7100, y: 200, s: 60, tr: [[2000, 7020, 40], [1000, 7060, 120], [0, 7100, 200], ['x', 1e9, 5]] }, ta));
  const tr = ok(await call('presence.get', {}, tb)).players.find((p) => p.id === accA.id).tr;
  assert.deepEqual(tr.map((p) => [p[1], p[2]]), [[7000, 0], [7020, 40], [7060, 120], [7100, 200]]);
  assert.ok(tr.every((p, i) => !i || p[0] > tr[i - 1][0]));
  // sync: B ส่งของตัวเอง (ช่อง 61 ติดเกาะกลาง) + ได้ A กลับมาในคำขอเดียว · A เห็น B
  const sb = ok(await call('presence.sync', { x: 7400, y: 300, s: 61, c: 'robot', lv: 3, hp: 50, z: 'adv', area: 1 }, tb));
  assert.equal(sb.rated, false);
  assert.ok(sb.players.some((p) => p.id === accA.id));
  const seenB = ok(await call('presence.get', { s: 60, area: 2 }, ta)).players.find((p) => p.c === 'robot');
  assert.ok(seenB && seenB.c === 'robot' && seenB.hp === 50 && seenB.z === 'adv');
  // กรองตามช่อง: C อยู่มุมซ้ายบน (ช่อง 0) ห่างเกาะกลาง 5 ช่อง
  assert.ok(!ok(await call('presence.sync', { x: 100, y: 100, s: 0, area: 2 }, tc)).players.some((p) => p.id === accA.id));
  assert.ok(ok(await call('presence.get', { s: 0, area: 5 }, tc)).players.some((p) => p.id === accA.id));
  assert.ok(ok(await call('presence.get', { s: 0 }, tc)).players.some((p) => p.id === accA.id), 'ไม่ส่ง area = ทั้งโลก');
  // ซ่อน (เข้าดันเจี้ยน/บ้าน) → คนอื่นไม่เห็น
  await advance(1100);
  ok(await call('presence.put', { x: 7100, y: 200, s: 1000, hid: true }, ta));
  assert.ok(!ok(await call('presence.get', {}, tb)).players.some((p) => p.id === accA.id));
  await advance(1100);
  ok(await call('presence.put', { x: 7100, y: 200, s: 60 }, ta));
  assert.ok(ok(await call('presence.get', {}, tb)).players.some((p) => p.id === accA.id));
  // ไม่ส่งเกิน 20 วิ → ไม่ตอบ (key ยังอยู่) · ส่งใหม่ = กลับมา
  await advance(21000);
  assert.ok(!ok(await call('presence.get', {}, tb)).players.some((p) => p.id === accA.id));
  ok(await call('presence.put', { x: 7200, y: 220, s: 60 }, ta));
  const back = ok(await call('presence.get', {}, tb)).players.find((p) => p.id === accA.id);
  assert.ok(back && back.tr.length === 1, 'เส้นทางเก่ากว่า 6 วิถูกตัด');
  // key หมดอายุ 60 วิ → หายจาก index · ส่งใหม่ได้ทันที (ไม่ติด rate)
  await advance(61000);
  assert.equal(ok(await call('presence.get', {}, tc)).players.length, 0);
  ok(await call('presence.put', { x: 7300, y: 230, s: 60 }, ta));
  assert.ok(ok(await call('presence.get', {}, tb)).players.some((p) => p.id === accA.id));
  // bye → หายทันที
  ok(await call('presence.put', { bye: true }, ta));
  assert.ok(!ok(await call('presence.get', {}, tb)).players.some((p) => p.id === accA.id));
});

await step('logout → token ใช้ไม่ได้', async () => {
  ok(await call('logout', {}, ta));
  bad(await call('me', {}, ta), 'auth');
  ok(await call('me', {}, tb));
});

if (server) server.close();
console.log(process.exitCode ? `\nล้มเหลว (ผ่าน ${passed} ข้อ)` : `\nผ่านทั้งหมด ${passed} ข้อ`);
