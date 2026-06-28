import { describe, expect, it } from 'vitest';
import { gridTerrain } from './replay';
import { DEFAULT_RULES } from './content';
import { World } from './world';

function runTicks(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step();
}

describe('mobile tactical missile artillery', () => {
  it('configures artillery as a long-range ground missile launcher', () => {
    const arty = DEFAULT_RULES.units.get('arty');

    expect(arty?.domain).toBe('vehicle');
    expect(arty?.deployTime).toBeGreaterThan(0);
    expect(arty?.weapon?.role).toBe('missile');
    expect(arty?.weapon?.range).toBeGreaterThanOrEqual(400 * 256);
    expect(arty?.weapon?.targetDomains).toEqual(['infantry', 'vehicle', 'building']);
  });

  it('fires at a selected ground cell and damages enemies near the impact', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 34)!;
    const startingHp = target.hp;

    w.applyCommands([
      { kind: 'attackGround', entityIds: [launcher.id], cellX: target.cellX, cellY: target.cellY },
    ]);
    runTicks(w, 180);

    expect(target.hp).toBeLessThan(startingHp);
  });
});
