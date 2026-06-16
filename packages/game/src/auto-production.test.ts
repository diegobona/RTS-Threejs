import { describe, expect, it } from 'vitest';
import { cellToLepton } from './coords';
import { gridTerrain } from './replay';
import { World } from './world';

function baseWorld(credits = 10000): World {
  const w = new World(gridTerrain(40, 40), 7);
  w.addPlayer(1, 'allied', credits);
  w.spawnUnit(1, 'conyard', 5, 5);
  return w;
}

function runTicks(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step();
}

function countType(w: World, typeId: string): number {
  return [...w.entities.values()].filter((e) => e.typeId === typeId).length;
}

function unitsOfType(w: World, typeId: string) {
  return [...w.entities.values()].filter((e) => e.typeId === typeId);
}

function cellKey(e: { cellX: number; cellY: number }): string {
  return `${e.cellX},${e.cellY}`;
}

function goalKey(e: { goal: { x: number; y: number } | null }): string {
  return e.goal ? `${e.goal.x},${e.goal.y}` : 'none';
}

describe('automatic production buildings', () => {
  it('produces infantry from every barracks in parallel', () => {
    const w = baseWorld(10000);
    w.spawnUnit(1, 'barracks', 10, 10);
    w.spawnUnit(1, 'barracks', 15, 10);

    runTicks(w, 15);

    expect(countType(w, 'gi')).toBe(2);
  });

  it('produces tanks and aircraft from their own factories', () => {
    const w = baseWorld(20000);
    w.spawnUnit(1, 'warfactory', 10, 10);
    w.spawnUnit(1, 'airbase', 16, 10);

    runTicks(w, 60);

    expect(countType(w, 'grizzly')).toBeGreaterThanOrEqual(1);
    expect(countType(w, 'fighter')).toBeGreaterThanOrEqual(1);
  });

  it('pauses automatic production without creating negative credits', () => {
    const w = new World(gridTerrain(40, 40), 7);
    w.addPlayer(1, 'allied', 0);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;

    runTicks(w, 20);

    expect(countType(w, 'gi')).toBe(0);
    expect(w.players.get(1)!.credits).toBeGreaterThanOrEqual(0);
    expect(barracks.producer?.progress).toBe(0);
  });

  it('can disable and retarget a single production building', () => {
    const w = baseWorld(10000);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;

    w.applyCommands([{ kind: 'setAutoProduction', owner: 1, buildingId: barracks.id, enabled: false }]);
    runTicks(w, 30);
    expect(countType(w, 'gi')).toBe(0);

    w.applyCommands([{ kind: 'setProducerType', owner: 1, buildingId: barracks.id, typeId: 'rocketsoldier' }]);
    w.applyCommands([{ kind: 'setAutoProduction', owner: 1, buildingId: barracks.id, enabled: true }]);
    runTicks(w, 19);

    expect(countType(w, 'gi')).toBe(0);
    expect(countType(w, 'rocketsoldier')).toBe(1);
  });

  it('fans infantry and tanks out around their rally point instead of stacking goals', () => {
    const w = baseWorld(50000);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;
    const factory = w.spawnUnit(1, 'warfactory', 16, 10)!;
    barracks.rallyX = 35;
    barracks.rallyY = 35;
    factory.rallyX = 35;
    factory.rallyY = 31;

    runTicks(w, 95);

    const infantry = unitsOfType(w, 'gi');
    const tanks = unitsOfType(w, 'grizzly');
    expect(infantry.length).toBeGreaterThanOrEqual(3);
    expect(tanks.length).toBeGreaterThanOrEqual(3);
    expect(new Set(infantry.map(goalKey)).size).toBe(infantry.length);
    expect(new Set(tanks.map(goalKey)).size).toBe(tanks.length);
  });

  it('spawns aircraft into separate air slots around the airbase', () => {
    const w = baseWorld(50000);
    w.spawnUnit(1, 'airbase', 10, 10)!;

    runTicks(w, 165);

    const fighters = unitsOfType(w, 'fighter');
    expect(fighters.length).toBeGreaterThanOrEqual(3);
    expect(new Set(fighters.map(cellKey)).size).toBe(fighters.length);
  });
});

describe('simplified combat economy and tech tree', () => {
  it('generates fast combat income from conyards and refineries once per second', () => {
    const w = baseWorld(0);
    w.spawnUnit(1, 'refinery', 10, 10);

    runTicks(w, 5);

    expect(w.players.get(1)!.credits).toBe(750);
  });

  it('removes powerplant from build options and unlocks airbase directly from the conyard', () => {
    const w = baseWorld();
    const ids = w.buildOptions(1).map((u) => u.id);

    expect(ids).not.toContain('powerplant');
    expect(ids).toEqual(expect.arrayContaining(['refinery', 'barracks', 'warfactory', 'airbase']));
  });
});

describe('producer exits', () => {
  it('reserves production exits so later buildings cannot block them', () => {
    const w = baseWorld();
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;
    const exit = barracks.producerExit!;
    const pillbox = w.rules.units.get('pillbox')!;

    expect(exit).toEqual({ x: 11, y: 12 });
    expect(w.canPlace(1, pillbox, exit.x, exit.y)).toBe(false);
  });

  it('spawns ground units at the reserved exit and sends them toward the rally point', () => {
    const w = baseWorld(10000);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;
    barracks.rallyX = 20;
    barracks.rallyY = 20;

    runTicks(w, 15);

    const gi = [...w.entities.values()].find((e) => e.typeId === 'gi')!;
    expect(gi.x).toBe(cellToLepton(barracks.producerExit!.x));
    expect(gi.y).toBe(cellToLepton(barracks.producerExit!.y));
    expect(gi.goal).toEqual({ x: 20, y: 20 });
  });
});
