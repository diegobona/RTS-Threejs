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

const MAP_W = 108;
const MAP_H = 88;
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
    { cellX: 91, cellY: 71 },
    { cellX: 54, cellY: 44 },
    { cellX: 18, cellY: 70 },
    { cellX: 90, cellY: 18 },
    { cellX: 42, cellY: 18 },
    { cellX: 66, cellY: 70 },
  ];
}

const verdantWater = merge(
  ellipse(76, 20, 7, 4),
  ellipse(25, 64, 6, 4),
  ellipse(86, 58, 5, 3),
  lineBand([{ x: 9, y: 44 }, { x: 21, y: 48 }, { x: 33, y: 55 }, { x: 43, y: 66 }], 1),
);
const verdantShore = subtract(grow(verdantWater, 2), verdantWater);
const verdantRoads = subtract(
  merge(
    lineBand([{ x: 0, y: 72 }, { x: 20, y: 63 }, { x: 42, y: 54 }, { x: 70, y: 44 }, { x: 107, y: 33 }], 1),
    lineBand([{ x: 7, y: 17 }, { x: 27, y: 21 }, { x: 48, y: 34 }, { x: 64, y: 51 }, { x: 81, y: 72 }], 1),
    lineBand([{ x: 46, y: 0 }, { x: 50, y: 21 }, { x: 54, y: 44 }, { x: 59, y: 70 }, { x: 63, y: 87 }], 1),
  ),
  verdantWater,
);
const verdantMarsh = subtract(
  merge(ellipse(17, 49, 10, 5), ellipse(78, 28, 12, 5), ellipse(86, 65, 10, 5), ellipse(32, 70, 8, 4)),
  merge(verdantWater, verdantRoads),
);

const lakelandMainWaterRaw = merge(
  ellipse(50, 40, 20, 11),
  ellipse(35, 28, 11, 7),
  ellipse(70, 30, 12, 8),
  ellipse(74, 55, 11, 7),
  lineBand([{ x: 32, y: 24 }, { x: 49, y: 38 }, { x: 62, y: 42 }, { x: 77, y: 55 }], 2),
);
const lakelandIsland = merge(ellipse(54, 42, 5, 3), ellipse(59, 38, 3, 2));
const lakelandNorthCreek = lineBand([{ x: 17, y: 4 }, { x: 26, y: 15 }, { x: 32, y: 24 }], 1);
const lakelandSouthCreek = lineBand([{ x: 77, y: 55 }, { x: 86, y: 68 }, { x: 96, y: 84 }], 1);
const lakelandWestPond = ellipse(18, 58, 7, 5);
const lakelandEastPond = ellipse(92, 22, 6, 6);
const lakelandWater = merge(
  subtract(lakelandMainWaterRaw, lakelandIsland),
  lakelandNorthCreek,
  lakelandSouthCreek,
  lakelandWestPond,
  lakelandEastPond,
);
const lakelandShore = subtract(grow(lakelandWater, 2), lakelandWater);
const lakelandRoads = merge(
  lineBand([{ x: 6, y: 72 }, { x: 24, y: 67 }, { x: 44, y: 62 }, { x: 66, y: 63 }, { x: 102, y: 72 }], 1),
  lineBand([{ x: 8, y: 16 }, { x: 24, y: 21 }, { x: 39, y: 30 }], 1),
  lineBand([{ x: 67, y: 58 }, { x: 82, y: 48 }, { x: 102, y: 42 }], 1),
);
const lakelandMarsh = subtract(
  merge(ellipse(28, 46, 11, 6), ellipse(85, 40, 11, 6), ellipse(64, 72, 10, 5)),
  merge(lakelandWater, lakelandRoads),
);
const highlandRoadsRaw = merge(
  lineBand([{ x: 4, y: 70 }, { x: 22, y: 61 }, { x: 43, y: 50 }, { x: 65, y: 41 }, { x: 104, y: 28 }], 1),
  lineBand([{ x: 9, y: 17 }, { x: 28, y: 22 }, { x: 45, y: 35 }, { x: 54, y: 44 }, { x: 72, y: 54 }, { x: 97, y: 73 }], 1),
  lineBand([{ x: 52, y: 0 }, { x: 51, y: 18 }, { x: 54, y: 44 }, { x: 57, y: 67 }, { x: 56, y: 87 }], 1),
);
const highlandRidgeRaw = merge(
  lineBand([{ x: 17, y: 4 }, { x: 26, y: 16 }, { x: 33, y: 30 }, { x: 42, y: 40 }], 3),
  lineBand([{ x: 42, y: 5 }, { x: 48, y: 21 }, { x: 58, y: 36 }, { x: 72, y: 48 }], 3),
  lineBand([{ x: 69, y: 16 }, { x: 79, y: 29 }, { x: 88, y: 45 }, { x: 97, y: 61 }], 3),
  lineBand([{ x: 25, y: 77 }, { x: 39, y: 67 }, { x: 51, y: 58 }, { x: 64, y: 51 }], 3),
  ellipse(32, 51, 7, 3),
  ellipse(76, 64, 8, 4),
  ellipse(61, 17, 7, 3),
);
const highlandRidges = subtract(highlandRidgeRaw, grow(highlandRoadsRaw, 1));
const highlandRoads = subtract(highlandRoadsRaw, highlandRidges);
const highlandHighGround = subtract(
  merge(
    grow(highlandRidges, 3),
    ellipse(26, 37, 13, 8),
    ellipse(61, 31, 17, 9),
    ellipse(82, 55, 16, 10),
    ellipse(43, 67, 14, 7),
  ),
  merge(highlandRidges, highlandRoads),
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
    blockedCells: verdantWater,
    terrainCells: {
      marsh: verdantMarsh,
      shore: verdantShore,
      road: verdantRoads,
      water: verdantWater,
    },
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
      { cellX: 14, cellY: 14 },
      { cellX: 94, cellY: 74 },
      { cellX: 54, cellY: 44 },
      { cellX: 18, cellY: 70 },
      { cellX: 91, cellY: 18 },
      { cellX: 38, cellY: 74 },
      { cellX: 78, cellY: 14 },
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
    terrainCells: {
      highground: highlandHighGround,
      road: highlandRoads,
      ridge: highlandRidges,
    },
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
      { cellX: 91, cellY: 70 },
      { cellX: 36, cellY: 36 },
      { cellX: 18, cellY: 70 },
      { cellX: 90, cellY: 18 },
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
      { cellX: 92, cellY: 72 },
      { cellX: 22, cellY: 68 },
      { cellX: 86, cellY: 20 },
      { cellX: 62, cellY: 48 },
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
      { playerId: 1, side: 'allied', cellX: 10, cellY: 12 },
      { playerId: 2, side: 'soviet', cellX: preset.width - 16, cellY: preset.height - 16 },
    ],
    orePatches: preset.orePatches,
    inputDelay: 0,
    startingCredits,
  };
}
