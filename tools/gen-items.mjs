// ภาพตัวอย่างรายไอเทม (อาวุธเทพ ยานพาหนะ อาคาร) → public/art/items/<id>.jpg + index.json
// ใช้: node tools/gen-items.mjs [id...]   (ไม่ใส่ = ทำเฉพาะที่ยังไม่มี)
// โค้ดเรียก API/บันทึกไฟล์อยู่ใน gen-lib.mjs · ไอเทมที่เหลือทั้งหมดอยู่ใน gen-items-all.mjs
// อาวุธ: WEAPON = วางลอยเหนือแท่นหิน แสงเรือง พื้นหลังมืด · อาคาร: BUILDING = มุมสามส่วนสี่บนเกาะร้าง
import { BUILDING, WEAPON, runJobs } from './gen-lib.mjs';

// ยาน: มุมสามส่วนสี่ อยู่ในสภาพแวดล้อมของมัน
const VEHICLE = (what, where) => `A survival game vehicle showcase: ${what}, three-quarter view, centered and large, ${where}, tropical island setting, sunny afternoon`;
const SEA = 'on clear turquoise sea water near a sandy tropical beach';
const LAND = 'on a sandy dirt path through a tropical jungle clearing';
const SKY = 'flying in the sky above a tropical island and the sea, fluffy clouds';
const JOBS = [
  ['thunder_blade', WEAPON('a long silver-blue sword crackling with lightning bolts')],
  ['inferno_axe', WEAPON('a huge double-headed battle axe made of black iron engulfed in roaring flames')],
  ['vampire_scythe', WEAPON('a dark grim reaper scythe with a blood-red curved blade and bone handle, red mist')],
  ['thor_hammer', WEAPON('a massive rune-engraved war hammer with a short leather handle, blue lightning around it')],
  ['storm_bow', WEAPON('an elegant longbow made of storm clouds and silver, with three glowing water arrows')],
  ['cosmic_staff', WEAPON('a magic staff topped with a swirling galaxy orb and golden rings, fireballs orbiting')],
  ['glacier_greatsword', WEAPON('a gigantic two-handed greatsword made of glacier ice crystal, frost mist and snowflakes')],
  ['naga_spear', WEAPON('a golden Thai naga serpent spear with a serpent head blade, green poison mist')],
  ['rahu_fangs', WEAPON('a pair of curved twin daggers shaped like demon fangs, dark purple eclipse energy')],
  // garuda_bow: API วาดเป็นรูปปั้นนกทุกครั้ง — ไม่ทำภาพ (ใช้ตัวในเกมแทน)
  ['void_staff', WEAPON('a black obsidian staff with a small swirling black hole at its tip pulling in purple light')],
  ['dragon_cannon', WEAPON('an ornate bronze hand cannon shaped like a roaring dragon head, fire breath erupting')],
  ['raft', VEHICLE('a simple wooden log raft tied with ropes, with a small paddle', SEA)],
  ['canoe', VEHICLE('a slim wooden canoe with a paddle', SEA)],
  ['fishing_boat', VEHICLE('a small wooden fishing boat with a fishing net and buckets of fish', SEA)],
  ['sailboat', VEHICLE('a wooden sailboat with a big white sail', SEA)],
  ['cargo_ship', VEHICLE('a large wooden cargo ship loaded with crates and barrels', SEA)],
  ['jetski', VEHICLE('a red and white jet ski splashing water', SEA)],
  ['motorboat', VEHICLE('a white motorboat with an outboard engine', SEA)],
  ['speedboat', VEHICLE('a sleek yellow racing speedboat leaving a long wake', SEA)],
  ['warship', VEHICLE('an armored wooden warship with iron plates and twin deck cannons', SEA)],
  ['submarine', VEHICLE('a small yellow submarine half submerged with a periscope', SEA)],
  ['cart', VEHICLE('a wooden hand cart loaded with logs and stones', LAND)],
  ['bicycle', VEHICLE('a rugged old bicycle with a basket', LAND)],
  ['horse', VEHICLE('a brown horse with a leather saddle and bridle', LAND)],
  ['atv', VEHICLE('a muddy red four-wheel ATV quad bike', LAND)],
  ['motorbike', VEHICLE('an off-road dirt motorbike', LAND)],
  ['jeep', VEHICLE('an armored green off-road jeep with a roof rack', LAND)],
  ['tank', VEHICLE('a small military tank with a cannon turret', LAND)],
  ['glider', VEHICLE('a wooden hang glider with a patched canvas wing', SKY)],
  ['balloon', VEHICLE('a colorful patchwork hot air balloon with a wicker basket', SKY)],
  // อาคาร/ป้อม/เครื่องจักร: มุมสามส่วนสี่ บนเกาะร้าง
  ...[
    ['cabin', 'a small rustic wooden log cabin with a stone chimney'],
    ['stone_house', 'a sturdy stone cottage with a slate roof and warm lit windows'],
    ['warehouse', 'a large wooden warehouse with big doors, crates and barrels outside'],
    ['watchtower', 'a tall wooden watchtower with an archer platform on top'],
    ['lighthouse', 'a tall red and white lighthouse on rocky shore casting a bright beam'],
    ['tent', 'a canvas camping tent with a small campfire in front'],
    ['log_cabin', 'a cozy log cabin with a front porch and lanterns'],
    ['cottage', 'a cottage with orange brick walls and a red tile roof, flower garden'],
    ['wood_house_2f', 'a two-story timber frame wooden house with balcony'],
    ['brick_house', 'a solid red brick house with a chimney and iron lantern'],
    ['tree_house', 'a wooden tree house built in the branches of a giant tree with a rope ladder'],
    ['stilt_house', 'a wooden stilt house standing over shallow turquoise water with a fish trap below'],
    ['barn', 'a big red farm barn surrounded by vegetable fields'],
    ['forge_house', 'a blacksmith forge house with a glowing furnace, anvil and chimney smoke'],
    ['manor', 'a luxurious two-story manor with white roman columns and a garden'],
    ['fortress', 'a massive stone fortress with towers, battlements and archers'],
    ['wizard_tower', 'a tall mystical wizard tower with a glowing purple crystal at the top'],
    ['command_hall', 'a grand command hall with banners, stone stairs and a golden roof'],
    ['windmill', 'a wooden windmill with turning sails next to a field'],
    ['generator', 'a rusty diesel power generator with cables and a glowing lamp'],
    ['auto_miner', 'a steampunk automatic mining drill machine digging into rocks, ore piles'],
    ['sawmill', 'a water powered wooden sawmill cutting logs into planks'],
    ['greenhouse', 'a glass greenhouse full of green plants and vegetables'],
    ['turret_cannon', 'a heavy iron defense cannon turret on a stone base firing'],
    ['ballista', 'a giant wooden ballista siege crossbow on a stone platform'],
    ['flame_turret', 'a metal flamethrower defense turret spewing fire'],
    ['tesla_tower', 'a tall tesla coil tower crackling with blue electric arcs'],
    ['mortar', 'a bronze mortar cannon firing a shell high into the sky'],
  ].map(([id, what]) => [id, BUILDING(what)]),
];
await runJobs(JOBS);
