import { describe, expect, it } from 'vitest';
import { cellToLepton } from './coords';
import { gridTerrain } from './replay';
import { buildCombatSpatialIndex, World } from './world';

describe('combat spatial index', () => {
  it('returns only nearby combat candidates and keeps radius edges inclusive', () => {
    const w = new World(gridTerrain(80, 80), 123);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const origin = w.spawnUnit(1, 'gi', 10, 10)!;
    const near = w.spawnUnit(2, 'conscript', 14, 10)!;
    const edge = w.spawnUnit(2, 'conscript', 16, 10)!;
    const far = w.spawnUnit(2, 'conscript', 30, 10)!;

    const index = buildCombatSpatialIndex(w.entities.values(), 6 * 256);
    const ids = index.nearby(origin.x, origin.y, 6 * 256).map((e) => e.id);

    expect(ids).toContain(origin.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(edge.id);
    expect(ids).not.toContain(far.id);
  });

  it('finds candidates across bucket boundaries', () => {
    const w = new World(gridTerrain(80, 80), 124);
    w.addPlayer(1, 'allied', 0);
    w.addPlayer(2, 'soviet', 0);
    const origin = w.spawnUnit(1, 'gi', 5, 5)!;
    const acrossBoundary = w.spawnUnit(2, 'conscript', 10, 5)!;

    const index = buildCombatSpatialIndex(w.entities.values(), 4 * 256);
    const ids = index.nearby(cellToLepton(5), cellToLepton(5), 5 * 256).map((e) => e.id);

    expect(ids).toContain(origin.id);
    expect(ids).toContain(acrossBoundary.id);
  });
});
