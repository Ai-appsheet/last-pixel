// ตัวเลขสมดุลเกมทั้งหมดรวมไว้ที่เดียว — ปรับความยากที่นี่
export const BALANCE = {
  tile: 16,
  cameraZoom: 3,

  dayLength: 480, // วินาทีต่อ 1 วันในเกม
  startTime: 0.08, // เริ่มตอนเช้า (0..1)
  bloodMoonEvery: 3,

  hungerPerSec: 100 / 360,
  thirstPerSec: 100 / 270,
  starveDamagePerSec: 1.5,
  sprintMult: 1.6,
  sprintStaminaPerSec: 18,
  sprintHungerMult: 1.5,
  staminaRegenPerSec: 22,
  dodgeStamina: 25,
  dodgeTime: 0.22,
  dodgeSpeedMult: 3.2,
  attackStamina: 6,
  attackCooldown: 0.38,
  hurtInvuln: 0.8,
  drinkAmount: 25,

  reach: 22, // ระยะเก็บของ/คุย
  buildReach: 56,

  campfireFuel: 180,
  campfireFuelPerWood: 60,
  campfireLight: 84,
  playerLight: 40, // แสงรอบตัวตอนกลางคืน (ไม่ถือคบไฟ) — ให้เห็นรอบตัวพอเดินได้
  stationRange: 40,

  structureHp: { campfire: 60, wood_wall: 100, stone_wall: 260, spike_trap: 60, farm_plot: 40, workbench: 120, furnace: 160, bed: 80 } as Record<string, number>,
  spikeDamage: 12,
  spikeSelfDamage: 6,

  passiveMobCap: 14,
  wolfCap: 3,
  zombieBase: 2,
  zombiePerDay: 1,
  bloodMoonMult: 2,
  despawnDistance: 520,

  // อุณหภูมิ/สติ
  comfortTemp: 50,
  freezeDamagePerSec: 1.5,
  heatThirstMult: 2,
  sanityDarkLossPerSec: 0.9,
  sanityRegenPerSec: 0.15,
  fireWarmth: 30,
  torchWarmth: 8,

  // รายวัน
  airdropsPerDay: 4,
  dailyBonusNodes: 14,
  rivalCap: 3,
  bossRespawnDays: 3,
  critChance: 0.12,
  critMult: 2,
};
