// สร้างภาพประกอบเกมทั้งชุดจาก JMT Image API (สไตล์ pixel ให้เข้ากับเกม) → public/art/<name>.jpg
// ใช้: node tools/gen-batch.mjs [ชื่อ...]   (ไม่ใส่ = ทำทุกภาพที่ยังไม่มี)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const STYLE = ', cartoon style HD pixel art with rich realistic detail, intricate textures, beautiful realistic lighting and shading, depth and atmosphere, vibrant colors, polished indie game key art, no text, no letters, no watermark';
const JOBS = [
  ['intro_1', 'Year 2099, the world is flooded, ruined skyscrapers half sunk in a vast ocean, tiny tropical islands scattered across the sea, a large evacuation airplane flying through a stormy orange sky'],
  ['intro_2', 'A passenger airplane breaking apart in a violent thunderstorm at night, lightning, a small orange rescue capsule with a parachute descending toward a lonely tropical island below'],
  ['intro_3', 'Night on a deserted island, a lone survivor holding a torch defends a small wooden fort, a horde of zombies, giant crabs and bats attack, meteors streak across the purple sky, a huge horned demon silhouette in the clouds'],
  ['intro_4', 'A peaceful central trading island with wooden market stalls and colorful awnings, lanterns glowing, small boats docking at a pier, survivors trading goods, calm turquoise sea, other islands on the horizon'],
  ['intro_5', 'Sunrise over a thriving island base built by a survivor: farm fields, windmill, wooden houses, watchtower, a glowing golden treasure chest opening, fishing boat, mining cave, hopeful mood'],
  ['keyart', 'Epic key art: a brave survivor hero with sword and backpack standing on a cliff overlooking a tropical archipelago at sunset, sailboats, a crashed plane on the beach below, distant storm with a giant demon lord shadow'],
  ['dungeon_1', 'Inside a dark rocky cave dungeon lit by wall torches, glowing blue crystals, bats flying, green slimes, skeleton archers, stone floor with bones, mysterious atmosphere'],
  ['dungeon_2', 'Abandoned underground mine dungeon, broken minecart rails, wooden support beams, glowing gold and crystal ore veins, bandaged mummies and ghostly shadow creatures, eerie lantern light'],
  ['dungeon_3', 'Ancient cursed tomb dungeon, skull pillars, purple ghostly fire braziers, demonic altar, little red fire imps flying, cracked stone sarcophagi, ominous red glow'],
  ['boss_golem', 'A gigantic stone golem boss with a glowing orange core and moss on its rocky body, smashing the ground in a dark cave, debris flying, boss battle'],
  ['boss_crab', 'A gigantic crab king boss wearing a golden crown with huge armored claws, rising from the sea onto a beach, waves crashing, boss battle'],
  ['boss_demon', 'A towering demon lord boss with huge horns, burning eyes, dark armor and a red cape, summoning fireballs over a burning island at night, boss battle'],
  ['death', 'A fallen survivor lying on a dark beach under a stormy night sky, a dropped torch and a broken sword, a lonely gravestone, melancholic blue and purple tones'],
  ['conquest', 'A triumphant survivor hero raising a sword on the highest peak of a conquered tropical island at sunrise, a flag planted, light rays, celebration, victory'],
  ['special_island', 'A legendary treasure island with a golden beam of light rising to the sky, gold ore veins, crystals and treasure chests, ancient ruins, surrounded by a swirling purple storm ring in the ocean'],
  // ภัยพิบัติกลางวัน (การ์ดเตือนเต็มจอ)
  ['hz_quake', 'A violent earthquake on a tropical island, the ground cracking open with glowing fissures, wooden huts collapsing, rocks tumbling down a cliff, dust clouds, a survivor struggling to keep balance'],
  ['hz_lightning', 'A furious thunderstorm over a tropical island, multiple giant lightning bolts striking the ground and palm trees, dark purple clouds, heavy rain, a survivor running for cover'],
  ['hz_stampede', 'A stampede of enraged wild boars, deer and buffalo charging across a jungle clearing toward a small wooden camp, dust and flying leaves, dramatic motion'],
  ['hz_heatwave', 'A scorching heatwave on a tropical island, blazing white sun, heat haze shimmer, dried cracked earth, wilted palm trees, a thirsty survivor drinking from a canteen, orange tones'],
  ['hz_coldsnap', 'A sudden freezing cold snap on a tropical island, snow falling on palm trees, frost covering the beach, icy blue light, a survivor shivering next to a campfire'],
  ['hz_wildfire', 'A raging wildfire sweeping through a tropical jungle at dusk, towering flames, burning palm trees, embers and smoke filling the orange sky, animals fleeing'],
  ['hz_meteor', 'A meteor shower raining down on a tropical island at night, flaming meteors with long glowing trails crashing into the jungle, explosions and craters, glowing space rocks'],
  ['hz_tsunami', 'A gigantic tsunami wave towering over a small tropical island, foaming crest, dark ocean, a tiny survivor on the beach looking up, boats being tossed, dramatic scale'],
  ['raid_night', 'A full moon night raid, a horde of zombies, skeletons, slimes and fire imps marching out of the dark jungle toward a lit wooden fortress with torches and spiked walls'],
  ['market_island', 'A bustling peaceful central market island, wooden piers full of boats, colorful market stalls and tents, glowing lanterns, a trader with a big backpack, fish and fruit crates, golden afternoon light'],
  // ฉากหลังหน้าคลังอุปกรณ์/ร้านค้า แยกตามแท็บ
  ['cat_weapons', 'Interior of a rustic island armory workshop, swords, axes, spears, bows and rifles mounted on wooden walls, a glowing forge and anvil, warm firelight, no people'],
  ['cat_gear', 'A cozy medieval fantasy armor shop with three mannequins wearing leather, iron and golden armor, helmets and capes, wooden shelves with boots and glowing rings, warm candle light, clean shapes, no people'],
  ['cat_build', 'A cozy survivor village on a tropical island with wooden houses, stone walls, a watchtower, farm plots, a windmill and a workshop, blueprint papers in the foreground, sunny day'],
  ['cat_boat', 'A tropical shipyard with wooden docks, a raft, a canoe, a sailboat and a large galleon under construction, cranes and ropes, turquoise water, sunny sky'],
  ['cat_machine', 'A steampunk island workshop full of machines: a furnace, sawmill, gears, water pump, generator, crossbow turrets and cannons, glowing pipes, warm light'],
  ['cat_mobs', 'A dark fantasy bestiary lineup of monsters on a jungle island at dusk: slime, bat, zombie, skeleton, giant crab, stone golem, fire imp, mummy, with a huge demon lord in the background'],
  ['cat_shop', 'A merchant shop interior on a tropical island, shelves full of potions, food, tools, treasure chests and glowing gems, hanging lanterns, a cheerful shopkeeper counter, warm cozy light'],
  ['cat_elixir', 'A mystical alchemy room with glowing magic crystals and elixir bottles, wooden, iron, golden and legendary treasure chests overflowing with light, sparkles, purple and gold glow'],
];
// หน้าปกใหม่: ทีมฮีโร่ 7 คน + บอส 3 ตัวด้านหลัง (ฝั่งซ้ายโล่งไว้วางเมนู)
JOBS.push(
  ['cover', 'Dramatic adventure scene, all characters on the right half of the image: seven young survivor heroes standing on a beach cliff at sunset, and right behind them three giant bosses side by side, a crowned giant crab, a huge stone golem and a horned demon lord, lightning in the storm clouds; the left half of the image is only a calm dark ocean, sunset sky and a small distant island, absolutely no words or title'],
);
// ภาพตัวละคร — เต็มตัว ท่าเดียวกัน สัดส่วนเดียวกัน กรอบเดียวกัน (เทมเพลตเดียว เปลี่ยนแค่ชุด/หน้าตา)
const BODY = (who) => `Full body pixel art character sprite of ${who}. Exactly the same template for every character: standing straight facing the viewer in a relaxed idle pose, whole body visible from the top of the head to the shoes, feet on the ground, same height and same proportions (about 5 heads tall, slightly chunky cute game hero proportions), character centered and filling 80 percent of the image height, small soft shadow under the feet, simple softly blurred tropical beach background at sunset, retro 16-bit pixel art with visible square pixels and rich shading`;
JOBS.push(
  ['char_mechanic', BODY('a young male mechanic with glasses and spiky brown hair, orange jumpsuit overalls, tool belt, holding a wrench in one hand'), '1:1'],
  ['char_medic', BODY('a young female medic with blonde hair in a ponytail, white medical outfit and nurse cap, holding a first aid kit in one hand'), '1:1'],
  ['char_hunter', BODY('a tan-skinned male hunter wearing a green hood and leather animal hide clothes, quiver on the back, holding a wooden bow in one hand'), '1:1'],
  ['char_farmer', BODY('a cheerful young male farmer with a straw hat, white shirt and blue denim overalls, holding a hoe in one hand'), '1:1'],
  ['char_scout', BODY('an agile young male scout with fluffy black hair and a red scarf cape, light beige clothes and boots, holding a dagger in one hand'), '1:1'],
  ['char_shaman', BODY('a mysterious male shaman with long dark hair, feather headband, tribal face paint and purple robes, holding a carved wooden staff in one hand'), '1:1'],
  ['char_robot', BODY('a friendly silver humanoid robot with glowing blue eyes and an antenna on its head, scratched metal plates'), '1:1'],
);
// ---------- ชุดโลกหลากหลาย: การ์ดเกาะ / ภัยใหม่ / คืนภัยใหม่ / สัตว์ในตำนาน ----------
// prompt สั้น + สไตล์สั้น (prompt ยาวทำให้ภาพจาก API นี้มีจุดรบกวน)
const SHORT = ', pixel art game scene, vibrant colors, no text';
const S = (name, prompt) => [name, prompt, '16:9', SHORT];
JOBS.push(
  S('isl_forest', 'Tropical island covered in a dense pine forest, deer in a sunny clearing, calm sea'),
  S('isl_snow', 'Snowy island with frosted pine trees, icy rocks and a wolf, cold blue sky'),
  S('isl_desert', 'Desert island with sand dunes, cactus and rocky mesas, blazing sun, turquoise sea'),
  S('isl_jungle', 'Lush jungle island with giant trees, vines, parrots and a waterfall'),
  S('isl_volcanic', 'Volcanic island at dusk, smoking volcano, lava rivers, black ash, ocean around'),
  S('isl_ruins', 'Island with ancient stone temple ruins overgrown by vines, treasure chest'),
  S('isl_swamp', 'Misty mangrove swamp island, twisted roots over murky green water, glowing fireflies'),
  S('isl_mushroom', 'Fantasy island forest of giant glowing purple mushrooms at dusk'),
  S('isl_crystal', 'Island covered in giant purple crystal shards, sparkling light'),
  S('isl_bamboo', 'Peaceful island with bamboo grove and pink cherry blossom trees, petals falling'),
  S('isl_savanna', 'Golden savanna island with acacia trees and a herd of wild buffalo at sunset'),
  S('isl_glacier', 'Glacier island of blue ice cliffs and snow, a white dragon flying above'),
  S('isl_atoll', 'Ring shaped coral atoll island with palm trees around a turquoise lagoon, aerial view'),
  S('isl_haunted', 'Haunted foggy island with dead trees, ruined graves and ghostly lights at night'),
  S('hz_sandstorm', 'Huge sandstorm swallowing a desert island camp, orange dust sky'),
  S('hz_blizzard', 'Fierce blizzard on a snowy island, survivor by a campfire, howling wind'),
  S('hz_eruption', 'Volcano erupting, lava bombs raining on an island village'),
  S('hz_acid_rain', 'Toxic green acid rain falling on a small island base'),
  S('hz_locusts', 'Dark cloud of flying green grasshoppers swarming over a vegetable farm'),
  S('hz_flood', 'Flooded island village in heavy rain, water up to the hut roofs'),
  S('hz_toxic_fog', 'Poisonous green fog rolling through a jungle island'),
  S('hz_eclipse', 'Solar eclipse turning day dark over a tropical island, monsters emerging'),
  S('hz_tornado', 'Giant tornado tearing across a grassy island, debris flying'),
  S('hz_whirlpool', 'Giant whirlpool in the ocean pulling a small sailboat'),
  S('raid_blood_moon', 'Blood red full moon, pack of red-eyed wolves attacking a wooden fort'),
  S('raid_ghost_night', 'Foggy night, ghosts and wraiths floating toward a lit wooden fort'),
  S('raid_skeleton_army', 'Army of skeleton warriors and archers marching at night toward a fort'),
  S('raid_insect_swarm', 'Swarm of giant beetles and a huge insect queen attacking a camp at night'),
  S('raid_sea_rage', 'Stormy sea at night, sharks, kraken tentacles and giant crabs storming a beach'),
  S('raid_legend', 'A legendary mythical beast leading a monster army against an island fort at night'),
  S('legend_naga', 'Giant golden Thai naga serpent rising from a jungle river'),
  S('legend_garuda', 'Mythical Garuda from Thai temple art, golden humanoid body with crown, red wings'),
  S('legend_qilin', 'Chinese qilin, scaly dragon-headed beast with one horn and flaming mane, lightning'),
  S('legend_phoenix', 'Flaming phoenix rising from a volcano, wings of fire'),
  S('legend_kraken', 'Giant kraken attacking a ship in a stormy sea'),
  S('legend_kochasi', 'Mythical Thai kochasi, lion body with elephant head, roaring in ancient ruins'),
  S('legend_frost_dragon', 'Ice dragon breathing frost over a glacier'),
  S('legend_stone_turtle', 'Colossal stone turtle with a mossy rock shell walking onto a beach'),
);
const want = process.argv.slice(2);
const outDir = path.join(root, 'public', 'art');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, prompt, aspect = '16:9', style = STYLE] of JOBS) {
  if (want.length && !want.includes(name)) continue;
  const jpg = path.join(outDir, `${name}.jpg`);
  if (!want.length && fs.existsSync(jpg)) continue;
  for (let attempt = 1; attempt <= 3; attempt++) {
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
      const png = path.join(outDir, `${name}.png`);
      if (m) fs.writeFileSync(png, Buffer.from(m[1], 'base64'));
      else if (url) fs.writeFileSync(png, Buffer.from(await (await fetch(url)).arrayBuffer()));
      else throw new Error('ไม่พบรูปในผลลัพธ์');
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '84', png, '--out', jpg], { stdio: 'ignore' });
      fs.unlinkSync(png);
      console.log('✔', name, Math.round(fs.statSync(jpg).size / 1024) + 'KB');
      break;
    } catch (e) {
      console.log('✘', name, `ครั้งที่ ${attempt}:`, e.message);
    }
  }
}
console.log('เสร็จ');
