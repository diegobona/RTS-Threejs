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
  it('reports per-player capacity counts with the default swarm limits', () => {
    const w = baseWorld(50000);
    w.spawnUnit(1, 'barracks', 10, 10);
    w.spawnUnit(1, 'worker', 11, 12);
    w.spawnUnit(1, 'gi', 12, 12);
    w.spawnUnit(1, 'grizzly', 14, 12);
    w.spawnUnit(1, 'fighter', 16, 12);

    expect(w.capacityFor(1)).toMatchObject({
      building: { count: 2, limit: 20 },
      infantry: { count: 1, limit: 500 },
      worker: { count: 1, limit: 60 },
      vehicle: { count: 1, limit: 100 },
      aircraft: { count: 1, limit: 30 },
    });
  });

  it('caps workers separately from soldiers', () => {
    const w = baseWorld(50000);
    for (let i = 0; i < 60; i++) w.spawnUnit(1, 'worker', 10 + (i % 10), 20 + Math.floor(i / 10));

    runTicks(w, 240);

    expect(countType(w, 'worker')).toBe(60);
    expect(w.capacityFor(1)).toMatchObject({
      infantry: { count: 0, limit: 500 },
      worker: { count: 60, limit: 60 },
    });
    const conyard = [...w.entities.values()].find((e) => e.typeId === 'conyard')!;
    expect(conyard.producer?.paidTypeId).toBeNull();
  });

  it('blocks additional building placement once the building cap is reached', () => {
    const w = new World(gridTerrain(80, 80), 7);
    w.addPlayer(1, 'allied', 50000);
    w.spawnUnit(1, 'worker', 4, 4);
    const pillbox = w.rules.units.get('pillbox')!;
    for (let i = 0; i < 19; i++) w.spawnUnit(1, 'pillbox', 5 + i, 5);

    expect(w.canPlace(1, pillbox, 24, 5)).toBe(true);
    w.spawnUnit(1, 'pillbox', 24, 5);

    expect(w.capacityFor(1).building).toMatchObject({ count: 20, limit: 20 });
    expect(w.canBuild(1, pillbox)).toBe(false);
    expect(w.canPlace(1, pillbox, 25, 5)).toBe(false);
  });

  it('pauses infantry auto-production at its cap and resumes after losses free capacity', () => {
    const w = new World(gridTerrain(80, 80), 7);
    w.addPlayer(1, 'allied', 50000);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;
    for (let i = 0; i < 500; i++) w.spawnUnit(1, 'gi', 20 + (i % 20), 20 + Math.floor(i / 20));
    const creditsAtCap = w.players.get(1)!.credits;

    w.step();

    expect(w.capacityFor(1).infantry).toMatchObject({ count: 500, limit: 500 });
    expect(w.players.get(1)!.credits).toBe(creditsAtCap);
    expect(barracks.producer?.paidTypeId).toBeNull();
    unitsOfType(w, 'gi')[0]!.hp = 0;
    w.step();
    w.step();

    expect(w.capacityFor(1).infantry.count).toBe(499);
    expect(barracks.producer?.paidTypeId).toBe('gi');
    expect(w.players.get(1)!.credits).toBe(creditsAtCap);
  });

  it('produces infantry from every barracks in parallel', () => {
    const w = baseWorld(10000);
    w.spawnUnit(1, 'barracks', 10, 10);
    w.spawnUnit(1, 'barracks', 15, 10);

    runTicks(w, 15);

    expect(countType(w, 'gi')).toBe(2);
  });

  it('produces workers at one quarter of the soldier production speed', () => {
    const w = baseWorld(10000);
    const conyard = [...w.entities.values()].find((e) => e.typeId === 'conyard')!;

    expect(conyard.producer?.typeId).toBe('worker');

    runTicks(w, 15);
    expect(unitsOfType(w, 'worker')).toHaveLength(0);

    runTicks(w, 45);

    const workers = unitsOfType(w, 'worker');
    expect(workers).toHaveLength(1);
    expect(conyard.producerExit).not.toBeNull();
    expect(workers[0]!.cellX).toBe(conyard.producerExit!.x);
    expect(workers[0]!.cellY).toBe(conyard.producerExit!.y);
  });

  it('produces tanks and aircraft from their own factories', () => {
    const w = baseWorld(20000);
    w.spawnUnit(1, 'warfactory', 10, 10);
    w.spawnUnit(1, 'airbase', 16, 10);

    runTicks(w, 60);

    expect(countType(w, 'grizzly')).toBeGreaterThanOrEqual(1);
    expect(countType(w, 'fighter')).toBeGreaterThanOrEqual(1);
  });

  it('auto-produces units even with zero credits', () => {
    const w = new World(gridTerrain(40, 40), 7);
    w.addPlayer(1, 'allied', 0);
    const barracks = w.spawnUnit(1, 'barracks', 10, 10)!;

    runTicks(w, 20);

    expect(countType(w, 'gi')).toBeGreaterThanOrEqual(1);
    expect(w.players.get(1)!.credits).toBe(0);
    expect(barracks.producer?.progress).toBeGreaterThanOrEqual(0);
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

  it('anchors auto-produced aircraft loiter to the airbase that launched them', () => {
    const w = baseWorld(50000);
    const airbase = w.spawnUnit(1, 'airbase', 10, 10)!;

    runTicks(w, 55);

    const fighter = unitsOfType(w, 'fighter')[0]!;
    const footprint = w.rules.units.get('airbase')!.building!;
    expect(airLoiterOf(fighter)).toMatchObject({
      airLoiterX: airbase.cellX + Math.floor(footprint.footprintW / 2),
      airLoiterY: airbase.cellY + footprint.footprintH + 1,
    });
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
    expect(minDistance).toBeGreaterThanOrEqual(5);
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

  it('spreads aircraft attack stations around a shared target instead of stacking over it', () => {
    const w = baseWorld(50000);
    w.addPlayer(2, 'soviet', 0);
    const target = w.spawnUnit(2, 'conyard', 28, 28)!;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(w.spawnUnit(1, 'fighter', 4 + (i % 4), 4 + Math.floor(i / 4))!.id);

    w.applyCommands([{ kind: 'attack', entityIds: ids, targetId: target.id }]);

    const fighters = ids.map((id) => w.entities.get(id)!);
    const stations = fighters.map((e) => `${airLoiterOf(e).airLoiterX},${airLoiterOf(e).airLoiterY}`);
    expect(new Set(stations).size).toBe(fighters.length);
    expect(new Set(fighters.map(goalKey)).size).toBe(fighters.length);
    expect(fighters.every((e) => e.targetId === target.id)).toBe(true);
  });

  it('queues aircraft bombing runs along an ingress lane instead of crowding over a ground target', () => {
    const w = baseWorld(50000);
    w.addPlayer(2, 'soviet', 0);
    const target = w.spawnUnit(2, 'warfactory', 28, 28)!;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(w.spawnUnit(1, 'fighter', 4 + (i % 4), 8 + Math.floor(i / 4))!.id);

    w.applyCommands([{ kind: 'attack', entityIds: ids, targetId: target.id }]);

    const stations = ids.map((id) => {
      const station = airLoiterOf(w.entities.get(id)!);
      expect(station.airLoiterX).toBeDefined();
      expect(station.airLoiterY).toBeDefined();
      return { x: station.airLoiterX!, y: station.airLoiterY! };
    });
    let minDistance = Infinity;
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const a = stations[i]!;
        const b = stations[j]!;
        minDistance = Math.min(minDistance, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    const targetDistances = stations.map((s) => Math.hypot(s.x - target.cellX, s.y - target.cellY));

    expect(new Set(stations.map((s) => `${s.x},${s.y}`)).size).toBe(stations.length);
    expect(minDistance).toBeGreaterThanOrEqual(4);
    expect(Math.min(...targetDistances)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...targetDistances)).toBeGreaterThanOrEqual(16);
  });

  it('keeps bombers moving from the ingress lane to the target before releasing bombs', () => {
    const w = new World(gridTerrain(56, 56), 7);
    w.addPlayer(1, 'allied', 50000);
    w.addPlayer(2, 'soviet', 0);
    const target = w.spawnUnit(2, 'warfactory', 38, 38)!;
    const fighter = w.spawnUnit(1, 'fighter', 8, 12)!;

    w.applyCommands([{ kind: 'attack', entityIds: [fighter.id], targetId: target.id }]);

    const station = airLoiterOf(fighter);
    expect(station.airLoiterX).toBeDefined();
    expect(station.airLoiterY).toBeDefined();
    expect(Math.hypot(station.airLoiterX! - target.cellX, station.airLoiterY! - target.cellY)).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 900 && fighter.goal; i++) w.step();

    expect(fighter.goal).toBeNull();
    expect(Math.hypot(fighter.cellX - target.cellX, fighter.cellY - target.cellY)).toBeGreaterThan(2);

    w.step();

    expect(w.projectiles.filter((p) => p.shooterId === fighter.id)).toHaveLength(0);
    expect(fighter.goal).not.toBeNull();
    expect(fighter.goal && Math.hypot(fighter.goal.x - target.cellX, fighter.goal.y - target.cellY)).toBeLessThanOrEqual(2);
  });

  it('keeps large bomber groups in queued lanes without duplicate attack stations', () => {
    const w = new World(gridTerrain(56, 56), 7);
    w.addPlayer(1, 'allied', 50000);
    w.addPlayer(2, 'soviet', 0);
    const target = w.spawnUnit(2, 'warfactory', 36, 36)!;
    const ids: number[] = [];
    for (let i = 0; i < 24; i++) ids.push(w.spawnUnit(1, 'fighter', 8 + (i % 6), 10 + Math.floor(i / 6))!.id);

    w.applyCommands([{ kind: 'attack', entityIds: ids, targetId: target.id }]);

    const stations = ids.map((id) => {
      const station = airLoiterOf(w.entities.get(id)!);
      return { x: station.airLoiterX!, y: station.airLoiterY! };
    });
    expect(new Set(stations.map((s) => `${s.x},${s.y}`)).size).toBe(stations.length);
    expect(stations.every((s) => s.x >= 0 && s.y >= 0 && s.x < w.terrain.width && s.y < w.terrain.height)).toBe(true);
  });

  it('keeps aircraft dogfight attack stations in loose air lanes', () => {
    const w = baseWorld(50000);
    w.addPlayer(2, 'soviet', 0);
    const target = w.spawnUnit(2, 'fighter', 28, 28)!;
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(w.spawnUnit(1, 'fighter', 4 + (i % 4), 4 + Math.floor(i / 4))!.id);

    w.applyCommands([{ kind: 'attack', entityIds: ids, targetId: target.id }]);

    const stations = ids.map((id) => {
      const station = airLoiterOf(w.entities.get(id)!);
      expect(station.airLoiterX).toBeDefined();
      expect(station.airLoiterY).toBeDefined();
      return { x: station.airLoiterX!, y: station.airLoiterY! };
    });
    let minDistance = Infinity;
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        const a = stations[i]!;
        const b = stations[j]!;
        minDistance = Math.min(minDistance, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    const targetDistances = stations.map((s) => Math.hypot(s.x - target.cellX, s.y - target.cellY));

    expect(minDistance).toBeGreaterThanOrEqual(7);
    expect(Math.min(...targetDistances)).toBeGreaterThanOrEqual(8);
  });

  it('orders aircraft to break away instead of firing missiles while mixed into the target', () => {
    const w = baseWorld(50000);
    w.addPlayer(2, 'soviet', 0);
    const fighter = w.spawnUnit(1, 'fighter', 20, 20)!;
    const target = w.spawnUnit(2, 'fighter', 21, 20)!;

    w.applyCommands([{ kind: 'attack', entityIds: [fighter.id], targetId: target.id }]);
    w.step();

    expect(fighter.goal).not.toBeNull();
    expect(fighter.goal && Math.hypot(fighter.goal.x - target.cellX, fighter.goal.y - target.cellY)).toBeGreaterThanOrEqual(8);
    expect(w.projectiles.filter((p) => p.shooterId === fighter.id)).toHaveLength(0);
  });
});

describe('simplified combat economy and tech tree', () => {
  it('does not generate credits now that money is disabled', () => {
    const w = baseWorld(0);
    w.spawnUnit(1, 'refinery', 10, 10);

    runTicks(w, 5);

    expect(w.players.get(1)!.credits).toBe(0);
  });

  it('removes economy buildings from build options and unlocks airbase directly from the conyard', () => {
    const w = baseWorld();
    w.spawnUnit(1, 'worker', 8, 9);
    const ids = w.buildOptions(1).map((u) => u.id);

    expect(ids).not.toContain('powerplant');
    expect(ids).not.toContain('refinery');
    expect(ids).not.toContain('harvester');
    expect(ids).toEqual(expect.arrayContaining(['barracks', 'warfactory', 'airbase']));
  });
});

describe('producer exits', () => {
  it('reserves production exits so later buildings cannot block them', () => {
    const w = baseWorld();
    w.spawnUnit(1, 'worker', 8, 9);
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
