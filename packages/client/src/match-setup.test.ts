import { createWorldFromConfig } from '@ra2web/game';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKIRMISH_MAP_ID,
  localSkirmishConfig,
  SKIRMISH_MAP_PRESETS,
  skirmishMapPreset,
} from './match-setup';

describe('local skirmish map presets', () => {
  it('offers a small set of large named battlefields instead of size buckets', () => {
    expect(SKIRMISH_MAP_PRESETS.map((preset) => preset.id)).toEqual([
      'verdant',
      'lakeland',
      'highlands',
      'badlands',
      'delta',
    ]);
    for (const preset of SKIRMISH_MAP_PRESETS) {
      expect(preset.width).toBeGreaterThanOrEqual(108);
      expect(preset.height).toBeGreaterThanOrEqual(88);
    }
  });

  it('defaults to a valid large battlefield and keeps all spawns inside the map', () => {
    const config = localSkirmishConfig(0);

    expect(config.mapId).toBe(DEFAULT_SKIRMISH_MAP_ID);
    expect(config.mapWidth).toBe(108);
    expect(config.mapHeight).toBe(88);
    for (const spawn of config.spawns) {
      expect(spawn.cellX).toBeGreaterThanOrEqual(0);
      expect(spawn.cellY).toBeGreaterThanOrEqual(0);
      expect(spawn.cellX).toBeLessThan(config.mapWidth);
      expect(spawn.cellY).toBeLessThan(config.mapHeight);
    }
  });

  it('feeds terrain blockers and visual terrain cells into the shared match world', () => {
    const config = localSkirmishConfig(0, 'lakeland');
    const lake = skirmishMapPreset('lakeland').terrainCells.water![0]!;
    const world = createWorldFromConfig(config);
    const x = lake % config.mapWidth;
    const y = Math.floor(lake / config.mapWidth);

    expect(config.blockedCells).toContain(lake);
    expect(world.terrain.passable(x, y)).toBe(false);
    expect(world.terrain.terrainAt?.(x, y)).toBe('water');
  });

  it('designs Lakeland as a full battlefield with water, shore, road, marsh, and passable island ground', () => {
    const preset = skirmishMapPreset('lakeland');
    const water = preset.terrainCells.water ?? [];
    const shore = preset.terrainCells.shore ?? [];
    const road = preset.terrainCells.road ?? [];
    const marsh = preset.terrainCells.marsh ?? [];
    const config = localSkirmishConfig(0, 'lakeland');
    const world = createWorldFromConfig(config);

    expect(water.length).toBeGreaterThan(350);
    expect(shore.length).toBeGreaterThan(180);
    expect(road.length).toBeGreaterThan(120);
    expect(marsh.length).toBeGreaterThan(120);
    expect(world.terrain.passable(54, 42)).toBe(true);
    expect(world.terrain.terrainAt?.(54, 42)).not.toBe('water');
    for (const spawn of config.spawns) {
      expect(world.terrain.passable(spawn.cellX, spawn.cellY)).toBe(true);
    }
  });

  it('designs Verdant as an open natural battlefield with roads, small water features, and safe spawns', () => {
    const preset = skirmishMapPreset('verdant');
    const water = preset.terrainCells.water ?? [];
    const shore = preset.terrainCells.shore ?? [];
    const road = preset.terrainCells.road ?? [];
    const marsh = preset.terrainCells.marsh ?? [];
    const config = localSkirmishConfig(0, 'verdant');
    const world = createWorldFromConfig(config);

    expect(water.length).toBeGreaterThan(80);
    expect(shore.length).toBeGreaterThan(120);
    expect(road.length).toBeGreaterThan(140);
    expect(marsh.length).toBeGreaterThan(80);
    expect(world.terrain.passable(54, 44)).toBe(true);
    expect(world.terrain.terrainAt?.(54, 44)).not.toBe('water');
    for (const spawn of config.spawns) {
      expect(world.terrain.passable(spawn.cellX, spawn.cellY)).toBe(true);
    }
  });
});
