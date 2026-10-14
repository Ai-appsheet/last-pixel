/** ชนิดพื้น (terrain) — index ในไทล์เซ็ต = terrain * VARIANTS + variant */
export const TILE = {
  DEEP: 0,
  SHALLOW: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  SNOW: 5,
  DESERT: 6,
  STONE: 7,
  BRICK: 8,
  PLANK_H: 9,
  PLANK_V: 10,
  DIRT: 11,
  ASH: 12,
  CAVE: 13,
  ROCKWALL: 14,
} as const;

export const TERRAIN_COUNT = 15;

export const isWater = (t: number) => t === TILE.DEEP || t === TILE.SHALLOW;
export const isLand = (t: number) => !isWater(t);
