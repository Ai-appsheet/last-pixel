// สร้างภาพประกอบเกมทั้งชุดจาก JMT Image API (สไตล์ chibi อนิเมะ วาดเป็น pixel art 16-bit) → public/art/<name>.jpg
// ใช้: node tools/gen-batch.mjs [ชื่อ...]      ไม่ใส่ชื่อ = ทำเฉพาะภาพที่ยังไม่มี · ใส่ชื่อ = ทำใหม่ทับ
//      node tools/gen-batch.mjs --all            ทำใหม่ทุกภาพ
//      node tools/gen-batch.mjs --all --part=1/2 แบ่งงานรัน 2 process พร้อมกัน (API ตอบ 502 ถ้าถี่เกิน — อย่าเกิน 2)
// prompt ต้องสั้น — prompt ยาวทำให้ภาพจาก API นี้มีจุดรบกวน
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
// สไตล์ที่ผู้ใช้เลือกแล้ว — ใช้กับทุกภาพ (ห้ามแก้ข้อความ)
const STYLE = ', chibi anime character design, big eyes, small adorable proportions, drawn in 16-bit retro pixel art style, pixel sprite shading, vibrant colors, detailed pixel art background, no text, no letters, no watermark';
// สไตล์ฉาก/ภูมิทัศน์ (การ์ดเกาะ ภัยพิบัติ ฉากหลังคลัง): pixel look เดียวกัน แต่ไม่ใส่ "character design" — ไม่ให้ API ยัดตัวละครใหญ่กลางภาพ
const FIERCE = ', chibi anime boss character design, big angry glowing eyes, fierce furrowed brows, sharp fangs, menacing but stylized proportions, drawn in 16-bit retro pixel art style, pixel sprite shading, vibrant saturated colors, detailed pixel art background, no people, no text, no letters, no watermark';
const STYLE_SCENE = ', cute chibi anime world style, drawn in 16-bit retro pixel art style, pixel sprite shading, vibrant colors, detailed pixel art background, no text, no letters, no watermark';
/** การ์ดภูมิทัศน์: มุมกว้าง ไม่มีคน — ตัวเกาะ/ตัวภัยต้องเป็นพระเอกของภาพ */
const L = (name, prompt) => [name, `Wide landscape view, ${prompt}, no people, no characters`, '16:9', STYLE_SCENE];
const JOBS = [
  ['intro_1', 'Year 2099 flooded world, ruined skyscrapers half sunk in the ocean, tiny tropical islands, a big evacuation airplane flying through a stormy orange sky'],
  ['intro_2', 'A passenger airplane breaking apart in a night thunderstorm, lightning, a small orange rescue capsule with a parachute descending toward a lonely tropical island'],
  ['intro_3', 'Night on a deserted island, a lone chibi survivor with a torch defends a small wooden fort from zombies, giant crabs and bats, meteors in the purple sky, a horned demon silhouette in the clouds'],
  ['intro_4', 'A peaceful trading island with wooden market stalls, colorful awnings, glowing lanterns, small boats at a pier, chibi survivors trading goods, calm turquoise sea'],
  ['intro_5', 'Sunrise over a thriving island base: farm fields, windmill, wooden houses, watchtower, a glowing golden treasure chest opening, fishing boat, hopeful mood'],
  ['keyart', 'A brave young survivor hero with sword and backpack standing on a cliff overlooking a tropical archipelago at sunset, sailboats, a crashed plane on the beach below'],
  ['dungeon_1', 'Inside a dark rocky cave dungeon lit by torches, glowing blue crystals, bats, green slimes and skeleton archers, bones on the stone floor'],
  ['dungeon_2', 'Abandoned underground mine dungeon, broken minecart rails, wooden beams, glowing gold ore veins, bandaged mummies and shadow ghosts, eerie lantern light'],
  ['dungeon_3', 'Ancient cursed tomb dungeon, skull pillars, purple ghost fire braziers, a demonic altar, little red fire imps flying, cracked stone sarcophagi, ominous red glow'],
  ['boss_golem', 'A gigantic stone golem boss with a glowing orange core and mossy rocky body smashing the ground in a dark cave, debris flying'],
  // บอสปู: ผู้ใช้ขอให้ดุขึ้นแต่ยังเข้าชุดกับภาพอื่น → สไตล์จิบิแบบดุ (FIERCE)
  ['boss_crab', 'A huge armored crab king boss roaring with claws open, spiky red shell, golden crown, splashing ocean and palm trees, dramatic orange sky', '16:9', FIERCE],
  ['boss_demon', 'A towering demon lord boss with huge horns, burning eyes, dark armor and red cape, summoning fireballs over a burning island at night'],
  ['death', 'A fallen chibi survivor lying on a dark beach under a stormy night sky, a dropped torch, a broken sword and a lonely gravestone, melancholic blue and purple tones'],
  ['conquest', 'A triumphant chibi survivor hero raising a sword on the highest peak of a conquered tropical island at sunrise, a flag planted, light rays, victory'],
  ['special_island', 'A legendary treasure island with a golden beam of light rising to the sky, gold ore, crystals and treasure chests, ancient ruins, a swirling purple storm ring around it in the ocean'],
  // ภัยพิบัติกลางวัน (การ์ดเตือนเต็มจอ)
  L('hz_quake', 'a violent earthquake on a tropical island, the ground split by huge cracks with glowing fissures, wooden huts collapsing, rocks tumbling, dust clouds'),
  ['hz_lightning', 'A furious thunderstorm over a tropical island, giant lightning bolts striking palm trees, dark purple clouds, heavy rain, a chibi survivor running for cover'],
  ['hz_stampede', 'A stampede of wild boars, deer and buffalo charging across a jungle clearing toward a small wooden camp, dust and leaves flying'],
  ['hz_heatwave', 'A scorching heatwave on a tropical island, blazing sun, cracked dry earth, wilted palm trees, a thirsty chibi survivor drinking from a canteen, orange tones'],
  ['hz_coldsnap', 'A sudden cold snap on a tropical island, snow falling on palm trees, frost on the beach, icy blue light, a chibi survivor shivering next to a campfire'],
  L('hz_wildfire', 'a raging wildfire sweeping through a tropical jungle at dusk, towering flames, burning palm trees, embers and smoke filling the orange sky'),
  L('hz_meteor', 'a meteor shower raining on a tropical island at night, many flaming meteors with glowing trails crashing into the jungle, explosions and craters'),
  ['hz_tsunami', 'A gigantic tsunami wave towering over a small tropical island, foaming crest, a tiny chibi survivor on the beach looking up, boats tossed'],
  ['raid_night', 'Full moon night raid, a horde of zombies, skeletons, slimes and fire imps marching out of the dark jungle toward a torch-lit wooden fortress with spiked walls'],
  ['market_island', 'A bustling market island, wooden piers full of boats, colorful stalls and tents, glowing lanterns, a chibi trader with a big backpack, fish and fruit crates, golden afternoon light'],
  // ฉากหลังหน้าคลังอุปกรณ์/ร้านค้า แยกตามแท็บ
  ['cat_weapons', 'Empty rustic island armory workshop room, swords, axes, spears, bows and rifles mounted on wooden walls, a glowing forge and anvil, warm firelight, empty room with nobody inside, no people, no characters', '16:9', STYLE_SCENE],
  ['cat_gear', 'A cozy fantasy armor shop with three mannequins wearing leather, iron and golden armor, helmets and capes, shelves with boots and glowing rings, candle light, no people'],
  ['cat_build', 'A cozy survivor village on a tropical island with wooden houses, stone walls, a watchtower, farm plots, a windmill and a workshop, sunny day'],
  ['cat_boat', 'A tropical shipyard with wooden docks, a raft, a canoe, a sailboat and a large galleon under construction, cranes and ropes, turquoise water, sunny sky, no people, no characters', '16:9', STYLE_SCENE],
  ['cat_machine', 'A steampunk island workshop full of machines: a furnace, sawmill, gears, water pump, generator, crossbow turrets and cannons, glowing pipes, warm light, no people, no characters', '16:9', STYLE_SCENE],
  ['cat_mobs', 'A monster lineup on a jungle island at dusk: slime, bat, zombie, skeleton, giant crab, stone golem, fire imp and mummy, a huge demon lord behind them'],
  ['cat_shop', 'A merchant shop interior on a tropical island, shelves full of potions, food, tools, treasure chests and glowing gems, hanging lanterns, a cheerful chibi shopkeeper at the counter'],
  ['cat_elixir', 'A mystical alchemy room with glowing magic crystals and elixir bottles, wooden, iron, golden and diamond treasure chests overflowing with light, purple and gold glow, no people, no characters', '16:9', STYLE_SCENE],
];
// หน้าปก: ทีมฮีโร่ 7 คน + บอส 3 ตัว ทั้งหมดอยู่ครึ่งขวา (ครึ่งซ้ายเป็นทะเลสงบ ไว้วางเมนู)
JOBS.push(
  ['cover', 'Exactly seven chibi hero survivors (mechanic, medic, hunter, farmer, scout, shaman, robot) standing on a beach cliff at sunset on the right half of the image, three giant bosses right behind them: a crowned giant crab, a stone golem and a horned demon lord, storm lightning; the left half is only a calm dark sea and sunset sky, no words'],
);
// ภาพตัวละคร — เต็มตัว ท่าเดียวกัน สัดส่วนเดียวกัน กรอบเดียวกัน (เทมเพลตเดียว เปลี่ยนแค่ชุด/หน้าตา)
const BODY = (who) => `Full body chibi character of ${who}, standing straight facing the viewer, whole body visible from head to feet, feet on the ground, centered, tropical beach sunset background`;
JOBS.push(
  ['char_mechanic', BODY('a young boy mechanic with glasses and spiky brown hair wearing an orange jumpsuit and tool belt, holding a wrench'), '1:1'],
  ['char_medic', BODY('a young girl medic with a blonde ponytail wearing a white medical outfit and nurse cap, holding a first aid kit'), '1:1'],
  ['char_hunter', BODY('a tan-skinned boy hunter wearing a green hood and leather clothes, quiver on his back, holding a wooden bow'), '1:1'],
  ['char_farmer', BODY('a cheerful boy farmer with a straw hat, white shirt and blue denim overalls, holding a hoe'), '1:1'],
  ['char_scout', BODY('an agile boy scout with fluffy black hair and a red scarf cape, light beige clothes and boots, holding a dagger'), '1:1'],
  ['char_shaman', BODY('a mysterious boy shaman with long dark hair, feather headband, tribal face paint and purple robes, holding a carved wooden staff'), '1:1'],
  ['char_robot', BODY('a friendly silver humanoid robot with glowing blue eyes and an antenna on its head, scratched metal plates'), '1:1'],
);
// ---------- ชุดโลกหลากหลาย: การ์ดเกาะ / ภัยใหม่ / คืนภัยใหม่ / สัตว์ในตำนาน ----------
const S = (name, prompt) => [name, prompt, '16:9'];
JOBS.push(
  L('isl_forest', 'tropical island covered in a dense pine forest, deer in a sunny clearing, calm sea'),
  L('isl_snow', 'snowy island with frosted pine trees, icy rocks and a wolf, cold blue sky'),
  L('isl_desert', 'desert island with sand dunes, cactus and rocky mesas, blazing sun, turquoise sea'),
  L('isl_jungle', 'lush jungle island with giant trees, vines, parrots and a waterfall'),
  L('isl_volcanic', 'volcanic island at dusk, smoking volcano, lava rivers, black ash, ocean around'),
  L('isl_ruins', 'island with ancient stone temple ruins overgrown by vines, treasure chest'),
  L('isl_swamp', 'misty mangrove swamp island, twisted roots over murky green water, glowing fireflies'),
  L('isl_mushroom', 'fantasy island forest of giant glowing purple mushrooms at dusk'),
  L('isl_crystal', 'island covered in giant purple crystal shards, sparkling light'),
  L('isl_bamboo', 'peaceful island with bamboo grove and pink cherry blossom trees, petals falling'),
  L('isl_savanna', 'golden savanna island with acacia trees and a herd of wild buffalo at sunset'),
  L('isl_glacier', 'a glacier island of towering blue ice cliffs, snow and icebergs in a cold sea, a small white dragon flying far above'),
  L('isl_atoll', 'ring shaped coral atoll island with palm trees around a turquoise lagoon, aerial view'),
  L('isl_haunted', 'haunted foggy island with dead trees, ruined graves and ghostly lights at night'),
  S('hz_sandstorm', 'Huge sandstorm swallowing a desert island camp, orange dust sky'),
  L('hz_blizzard', 'a fierce blizzard on a snowy island, howling white wind and thick swirling snow burying small wooden huts and pine trees, a tiny campfire struggling'),
  L('hz_eruption', 'a volcano erupting on an island, lava bombs and ash raining on a small village, glowing lava rivers'),
  L('hz_acid_rain', 'toxic green acid rain pouring from sickly yellow-green clouds onto a small wooden island base, smoking puddles'),
  L('hz_locusts', 'a huge dark swarm of flying green grasshoppers devouring a vegetable farm on an island'),
  L('hz_flood', 'a flooded island village in heavy rain, brown flood water up to the hut roofs, floating barrels and logs'),
  L('hz_toxic_fog', 'a jungle island drowned in thick poisonous dark green fog at dusk, skull-shaped smoke, wilting plants, dark eerie sky'),
  L('hz_eclipse', 'a total solar eclipse, a black sun with a glowing ring in a dark sky over a tropical island, shadowy monsters emerging from the jungle'),
  L('hz_tornado', 'a giant tornado tearing across a grassy island, huts, trees and debris flying in the wind'),
  S('hz_whirlpool', 'Giant whirlpool in the ocean pulling a small sailboat'),
  S('raid_blood_moon', 'Blood red full moon, pack of red-eyed wolves attacking a wooden fort'),
  S('raid_ghost_night', 'Foggy night, ghosts and wraiths floating toward a lit wooden fort'),
  S('raid_skeleton_army', 'Army of skeleton warriors and archers marching at night toward a fort'),
  S('raid_insect_swarm', 'Swarm of giant beetles and a huge insect queen attacking a camp at night'),
  L('raid_sea_rage', 'a night raid on a beach, fierce angry sharks, giant kraken tentacles and giant crabs storming out of a stormy sea toward a torch-lit wooden fort, big crashing waves'),
  S('raid_legend', 'A huge fierce mythical dragon beast with glowing eyes leading a monster army to attack a torch-lit wooden island fort at night, fire and smoke'),
  S('legend_naga', 'Giant golden Thai naga serpent rising from a jungle river'),
  S('legend_garuda', 'Mythical Garuda from Thai temple art, golden humanoid body with crown, red wings'),
  S('legend_qilin', 'Chinese qilin, scaly dragon-headed beast with one horn and flaming mane, lightning'),
  S('legend_phoenix', 'Flaming phoenix rising from a volcano, wings of fire'),
  S('legend_kraken', 'A giant purple kraken with huge eyes and many tentacles rising from a stormy sea and grabbing a small wooden ship, no people'),
  S('legend_kochasi', 'Mythical Thai kochasi, lion body with elephant head, roaring in ancient ruins'),
  S('legend_frost_dragon', 'Ice dragon breathing frost over a glacier'),
  S('legend_stone_turtle', 'Colossal stone turtle with a mossy rock shell walking onto a beach'),
);
const argv = process.argv.slice(2);
const all = argv.includes('--all');
const part = argv.find((a) => a.startsWith('--part='))?.slice(7);
const want = argv.filter((a) => !a.startsWith('--'));
const outDir = path.join(root, 'public', 'art');
fs.mkdirSync(outDir, { recursive: true });
let list = JOBS.filter(([name]) => (want.length ? want.includes(name) : all || !fs.existsSync(path.join(outDir, `${name}.jpg`))));
if (part) {
  const [k, n] = part.split('/').map(Number);
  const size = Math.ceil(list.length / n);
  list = list.slice((k - 1) * size, k * size);
}
console.log(`งาน ${list.length} ภาพ`);
const failed = [];
for (const [name, prompt, aspect = '16:9', style = STYLE] of list) {
  const jpg = path.join(outDir, `${name}.jpg`);
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    const png = path.join(outDir, `.${name}.${process.pid}.png`);
    const tmp = path.join(outDir, `.${name}.${process.pid}.jpg`);
    try {
      const res = await fetch(env.JMT_IMAGE_API_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.JMT_IMAGE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt + style, aspect, count: 1, style: 'pixel' }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
      const m = text.match(/"(?:data:image\/[a-z]+;base64,)?([A-Za-z0-9+/]{2000,}={0,2})"/);
      const url = text.match(/https?:\/\/[^"]+\.(?:png|jpe?g|webp)[^"]*/i)?.[0];
      if (m) fs.writeFileSync(png, Buffer.from(m[1], 'base64'));
      else if (url) fs.writeFileSync(png, Buffer.from(await (await fetch(url)).arrayBuffer()));
      else throw new Error('ไม่พบรูปในผลลัพธ์');
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '84', png, '--out', tmp], { stdio: 'ignore' });
      fs.unlinkSync(png);
      fs.renameSync(tmp, jpg); // เขียนทับแบบอะตอมมิก — เกมที่เปิดอยู่ไม่เห็นไฟล์ครึ่งๆ กลางๆ
      console.log('✔', name, Math.round(fs.statSync(jpg).size / 1024) + 'KB');
      ok = true;
    } catch (e) {
      for (const f of [png, tmp]) if (fs.existsSync(f)) fs.unlinkSync(f);
      console.log('✘', name, `ครั้งที่ ${attempt}:`, e.message);
      await new Promise((r) => setTimeout(r, 4000 * attempt)); // API ตอบ 502 เมื่องานแน่น — รอแล้วลองใหม่
    }
  }
  if (!ok) failed.push(name);
}
console.log('เสร็จ', failed.length ? `ล้มเหลว: ${failed.join(' ')}` : '');
