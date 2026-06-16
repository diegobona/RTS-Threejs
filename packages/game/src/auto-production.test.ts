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

function airLoiterOf(e: unknown): { airLoiterX?: number; airLoiterY?: number } {
  return e as { airLoiterX?: number; airLoiterY?: number };
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

  it('moves aircraft groups into a loose air formation instead of adjacent stacked cells', () => {
    const w = baseWorld(50000);
    w.addPlayer(2, 'soviet', 0);
    w.spawnUnit(2, 'conyard', 28, 28);
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) ids.push(w.spawnUnit(1, 'fighter', 4 + (i % 4), 4 + Math.floor(i / 4))!.id);

    w.applyCommands([{ kind: 'move', entityIds: ids, cellX: 28, cellY: 28 }]);

    const goals = ids.map((id) => w.entities.get(id)!.goal!);
    expect(goals[0]).toEqual({ x: 28, y: 28 });
    expect(new Set(goals.map((g) => `${g.x},${g.y}`)).size).toBe(ids.length);
    let minDistance = Infinity;
    for (let i = 0; i < goals.length; i++) {
      for (let j = i + 1; j < goals.length; j++) {
        minDistance = Math.min(minDistance, Math.hypot(goals[i]!.x - goals[j]!.x, goals[i]!.y - goals[j]!.y));
      }
    }
    expect(minDistance).toBeGreaterThanOrEqual(3);
  });

  it('keeps aircraft loiter anchored to the ordered airspace after a ground move', () => {
    const w = baseWorld(50000);
    const fighter = w.spawnUnit(1, 'fighter', 4, 4)!;

    w.applyCommands([{ kind: 'move', entityIds: [fighter.id], cellX: 25, cellY: 25 }]);

    expect(airLoiterOf(fighter)).toMatchObject({ airLoiterX: 25, airLoiterY: 25 });
    for (let i = 0; i < 500 && fighter.goal; i++) w.step();
    expect(fighter.goal).toBeNull();
    expect(airLoiterOf(fighter)).toMatchObject({ airLoiterX: 25, airLoiterY: 25 });
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
