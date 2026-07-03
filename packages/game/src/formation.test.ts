import { describe, expect, it } from 'vitest';
import { World } from './world';
import { gridTerrain } from './replay';

function goalOf(world: World, id: number): { x: number; y: number } {
  const goal = world.entities.get(id)?.goal;
  expect(goal).toBeTruthy();
  return goal!;
}

function minGoalDistance(goals: readonly { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const a = goals[i]!;
      const b = goals[j]!;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return min;
}

function extent(goals: readonly { x: number; y: number }[]): { x: number; y: number } {
  const xs = goals.map((g) => g.x);
  const ys = goals.map((g) => g.y);
  return {
    x: Math.max(...xs) - Math.min(...xs),
    y: Math.max(...ys) - Math.min(...ys),
  };
}

describe('tank formations', () => {
  it('moves large tank selections into a default wide formation instead of adjacent stacked cells', () => {
    const world = new World(gridTerrain(120, 120), 701);
    world.addPlayer(1, 'allied', 0);
    const ids: number[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push(world.spawnUnit(1, 'grizzly', 5 + (i % 10), 5 + Math.floor(i / 10))!.id);
    }

    world.applyCommands([{ kind: 'move', entityIds: ids, cellX: 70, cellY: 70 }]);

    const goals = ids.map((id) => goalOf(world, id));
    expect(new Set(goals.map((g) => `${g.x},${g.y}`)).size).toBe(ids.length);
    expect(minGoalDistance(goals)).toBeGreaterThanOrEqual(3);
  });

  it('supports line and column tank formations with different footprints', () => {
    const world = new World(gridTerrain(120, 120), 702);
    world.addPlayer(1, 'allied', 0);
    const ids: number[] = [];
    for (let i = 0; i < 12; i++) ids.push(world.spawnUnit(1, 'grizzly', 5, 35 + i)!.id);

    world.applyCommands([{ kind: 'move', entityIds: ids, cellX: 80, cellY: 40, formation: 'line' }]);
    const lineExtent = extent(ids.map((id) => goalOf(world, id)));

    world.applyCommands([{ kind: 'move', entityIds: ids, cellX: 80, cellY: 40, formation: 'column' }]);
    const columnExtent = extent(ids.map((id) => goalOf(world, id)));

    expect(lineExtent.y).toBeGreaterThan(columnExtent.y);
    expect(columnExtent.x).toBeGreaterThan(lineExtent.x);
  });
});
