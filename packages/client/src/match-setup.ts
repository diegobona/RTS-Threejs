import { createWorldFromConfig, type MatchConfig, type TerrainKind } from '@ra2web/game';

export { createWorldFromConfig as createMatchWorld };

export type SkirmishMapId = 'verdant' | 'lakeland' | 'highlands' | 'badlands' | 'delta';
export type MapSize = SkirmishMapId;

export interface SkirmishMapPreset {
  id: SkirmishMapId;
  name: string;
  hint: string;
  width: number;
  height: number;
  seed: number;
  blockedCells: number[];
  terrainCells: Partial<Record<TerrainKind, number[]>>;
  orePatches: { cellX: number; cellY: number }[];
}

const MAP_W = 72;
const MAP_H = 72;
export const DEFAULT_SKIRMISH_MAP_ID: SkirmishMapId = 'verdant';

function key(x: number, y: number, w = MAP_W): number {
  return y * w + x;
}

function addCell(cells: Set<number>, x: number, y: number, w = MAP_W, h = MAP_H): void {
  if (x >= 0 && y >= 0 && x < w && y < h) cells.add(key(x, y, w));
}

function circle(cx: number, cy: number, r: number, w = MAP_W, h = MAP_H): number[] {
  const cells = new Set<number>();
  const rr = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rr) addCell(cells, x, y, w, h);
    }
  }
  return [...cells].sort((a, b) => a - b);
}

function ellipse(cx: number, cy: number, rx: number, ry: number, w = MAP_W, h = MAP_H): number[] {
  const cells = new Set<number>();
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) addCell(cells, x, y, w, h);
    }
  }
  return [...cells].sort((a, b) => a - b);
}

function lineBand(points: { x: number; y: number }[], radius: number, w = MAP_W, h = MAP_H): number[] {
  const cells = new Set<number>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      for (let oy = -radius; oy <= radius; oy++) {
        for (let ox = -radius; ox <= radius; ox++) {
          if (ox * ox + oy * oy <= radius * radius) addCell(cells, x + ox, y + oy, w, h);
        }
      }
    }
  }
  return [...cells].sort((a, b) => a - b);
}

function merge(...groups: readonly number[][]): number[] {
  return [...new Set(groups.flat())].sort((a, b) => a - b);
}

function subtract(cells: number[], remove: readonly number[]): number[] {
  const removed = new Set(remove);
  return cells.filter((cell) => !removed.has(cell));
}

function grow(cells: readonly number[], radius: number, w = MAP_W, h = MAP_H): number[] {
  const grown = new Set<number>();
  for (const cell of cells) {
    const cx = cell % w;
    const cy = Math.floor(cell / w);
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) addCell(grown, x, y, w, h);
      }
    }
  }
  return [...grown].sort((a, b) => a - b);
}

function cellsOf(kind: TerrainKind, cells: number[]): Partial<Record<TerrainKind, number[]>> {
  return { [kind]: cells };
}

function baseOre(): { cellX: number; cellY: number }[] {
  return [
    { cellX: 16, cellY: 16 },
    { cellX: 55, cellY: 55 },
    { cellX: 36, cellY: 36 },
    { cellX: 18, cellY: 54 },
    { cellX: 54, cellY: 18 },
    { cellX: 34, cellY: 18 },
    { cellX: 38, cellY: 54 },
  ];
}

const lakelandMainWaterRaw = merge(
  ellipse(32, 33, 14, 9),
  ellipse(24, 24, 8, 6),
  ellipse(44, 25, 9, 7),
  ellipse(48, 44, 8, 6),
  lineBand([{ x: 21, y: 20 }, { x: 30, y: 30 }, { x: 40, y: 34 }, { x: 50, y: 43 }], 2),
);
const lakelandIsland = merge(ellipse(35, 34, 4, 3), ellipse(38, 31, 2, 2));
const lakelandNorthCreek = lineBand([{ x: 11, y: 4 }, { x: 17, y: 12 }, { x: 22, y: 20 }], 1);
const lakelandSouthCreek = lineBand([{ x: 50, y: 45 }, { x: 55, y: 55 }, { x: 61, y: 68 }], 1);
const lakelandWestPond = ellipse(12, 47, 5, 4);
const lakelandEastPond = ellipse(60, 18, 4, 5);
const lakelandWater = merge(
  subtract(lakelandMainWaterRaw, lakelandIsland),
  lakelandNorthCreek,
  lakelandSouthCreek,
  lakelandWestPond,
  lakelandEastPond,
);
const lakelandShore = subtract(grow(lakelandWater, 2), lakelandWater);
const lakelandRoads = merge(
  lineBand([{ x: 4, y: 57 }, { x: 16, y: 54 }, { x: 29, y: 50 }, { x: 43, y: 51 }, { x: 66, y: 58 }], 1),
  lineBand([{ x: 7, y: 13 }, { x: 18, y: 17 }, { x: 27, y: 24 }], 1),
  lineBand([{ x: 45, y: 48 }, { x: 55, y: 39 }, { x: 66, y: 35 }], 1),
);
const lakelandMarsh = subtract(
  merge(ellipse(18, 36, 8, 5), ellipse(55, 31, 8, 5), ellipse(42, 58, 7, 4)),
  merge(lakelandWater, lakelandRoads),
);
const highlandRidges = merge(
  lineBand([{ x: 18, y: 6 }, { x: 28, y: 18 }, { x: 34, y: 32 }], 2),
  lineBand([{ x: 47, y: 39 }, { x: 55, y: 51 }, { x: 62, y: 64 }], 2),
  ellipse(36, 50, 5, 2),
);
const badlandsSand = merge(ellipse(24, 25, 16, 10), ellipse(49, 47, 14, 12), lineBand([{ x: 5, y: 44 }, { x: 66, y: 28 }], 3));
const badlandsRidges = merge(ellipse(35, 35, 4, 2), ellipse(52, 22, 3, 4), ellipse(20, 51, 4, 3));
const deltaWaterRaw = merge(
  lineBand([{ x: 31, y: 0 }, { x: 33, y: 16 }, { x: 38, y: 31 }, { x: 36, y: 48 }, { x: 41, y: 71 }], 2),
  lineBand([{ x: 36, y: 31 }, { x: 22, y: 21 }, { x: 10, y: 18 }], 1),
  lineBand([{ x: 38, y: 34 }, { x: 53, y: 25 }, { x: 68, y: 21 }], 1),
);
const deltaFords = new Set<number>();
for (const y of [18, 36, 54]) for (let x = 0; x < MAP_W; x++) addCell(deltaFords, x, y);
const deltaWater = deltaWaterRaw.filter((cell) => !deltaFords.has(cell));

export const SKIRMISH_MAP_PRESETS: readonly SkirmishMapPreset[] = [
  {
    id: 'verdant',
    name: 'Verdant',
    hint: 'Open grassland',
    width: MAP_W,
    height: MAP_H,
    seed: 20260610,
    blockedCells: [],
    terrainCells: {},
    orePatches: baseOre(),
  },
  {
    id: 'lakeland',
    name: 'Lakeland',
    hint: 'Lakes and open fields',
    width: MAP_W,
    height: MAP_H,
    seed: 20260611,
    blockedCells: lakelandWater,
    terrainCells: {
      marsh: lakelandMarsh,
      shore: lakelandShore,
      road: lakelandRoads,
      water: lakelandWater,
    },
    orePatches: [
      { cellX: 10, cellY: 14 },
      { cellX: 62, cellY: 58 },
      { cellX: 35, cellY: 35 },
      { cellX: 15, cellY: 55 },
      { cellX: 59, cellY: 17 },
      { cellX: 26, cellY: 61 },
      { cellX: 50, cellY: 12 },
    ],
  },
  {
    id: 'highlands',
    name: 'Highlands',
    hint: 'Ridges and choke points',
    width: MAP_W,
    height: MAP_H,
    seed: 20260612,
    blockedCells: highlandRidges,
    terrainCells: cellsOf('ridge', highlandRidges),
    orePatches: baseOre(),
  },
  {
    id: 'badlands',
    name: 'Badlands',
    hint: 'Dry open battlefield',
    width: MAP_W,
    height: MAP_H,
    seed: 20260613,
    blockedCells: badlandsRidges,
    terrainCells: { sand: badlandsSand, ridge: badlandsRidges },
    orePatches: [
      { cellX: 16, cellY: 17 },
      { cellX: 55, cellY: 54 },
      { cellX: 36, cellY: 36 },
      { cellX: 18, cellY: 54 },
      { cellX: 54, cellY: 18 },
    ],
  },
  {
    id: 'delta',
    name: 'Delta',
    hint: 'River channels and fords',
    width: MAP_W,
    height: MAP_H,
    seed: 20260614,
    blockedCells: deltaWater,
    terrainCells: cellsOf('water', deltaWater),
    orePatches: [
      { cellX: 14, cellY: 14 },
      { cellX: 58, cellY: 58 },
      { cellX: 22, cellY: 52 },
      { cellX: 53, cellY: 20 },
      { cellX: 44, cellY: 42 },
    ],
  },
];

export function skirmishMapPreset(id: string | null | undefined): SkirmishMapPreset {
  return SKIRMISH_MAP_PRESETS.find((preset) => preset.id === id) ?? SKIRMISH_MAP_PRESETS[0]!;
}

export function localSkirmishConfig(startingCredits = 5000, mapId: SkirmishMapId = DEFAULT_SKIRMISH_MAP_ID): MatchConfig {
  const preset = skirmishMapPreset(mapId);
  return {
    seed: preset.seed,
    mapId: preset.id,
    mapWidth: preset.width,
    mapHeight: preset.height,
    blockedCells: preset.blockedCells,
    terrainCells: preset.terrainCells,
    spawns: [
      { playerId: 1, side: 'allied', cellX: 7, cellY: 8 },
      { playerId: 2, side: 'soviet', cellX: preset.width - 12, cellY: preset.height - 13 },
    ],
    orePatches: preset.orePatches,
    inputDelay: 0,
    startingCredits,
  };
}
