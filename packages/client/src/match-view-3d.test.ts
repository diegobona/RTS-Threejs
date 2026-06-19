import { describe, expect, it } from 'vitest';
import { World } from '@ra2web/game';
import { gridTerrain } from '@ra2web/game';
import { capacitySummaryText3D, initialCameraFocus3D, matchOutcomeText3D, PRODUCTION_CATEGORIES_3D, topHudText3D } from './match-view-3d';

describe('MatchView3D camera defaults', () => {
  it('starts focused on the center of the map instead of the local spawn', () => {
    expect(initialCameraFocus3D(44, 44)).toEqual({ x: 43, z: 43 });
  });
});

describe('MatchView3D production tabs', () => {
  it('only exposes manual building production; units are produced automatically by buildings', () => {
    expect(PRODUCTION_CATEGORIES_3D).toEqual(['building']);
  });
});

describe('MatchView3D capacity HUD', () => {
  it('summarizes building and unit caps in generated-over-limit form', () => {
    expect(
      capacitySummaryText3D({
        building: { count: 12, limit: 20 },
        infantry: { count: 340, limit: 500 },
        worker: { count: 12, limit: 60 },
        vehicle: { count: 76, limit: 100 },
        aircraft: { count: 31, limit: 30 },
      }),
    ).toBe('建筑 12/20 | 工人 12/60 | 士兵 340/500 | 坦克 76/100 | 飞机 31/30');
  });

  it('does not expose credits in the top HUD summary', () => {
    const text = topHudText3D({
      building: { count: 4, limit: 20 },
      infantry: { count: 117, limit: 500 },
      worker: { count: 8, limit: 60 },
      vehicle: { count: 48, limit: 100 },
      aircraft: { count: 23, limit: 30 },
    });

    expect(text).toBe('建筑 4/20 | 工人 8/60 | 士兵 117/500 | 坦克 48/100 | 飞机 23/30');
    expect(text).not.toContain('Credits');
    expect(text).not.toContain('$');
  });
});

describe('MatchView3D match outcome', () => {
  it('reports defeat for the local player and victory when all enemies are defeated', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    world.addPlayer(2, 'soviet', 0);

    expect(matchOutcomeText3D(world, 1)).toBeNull();
    world.players.get(1)!.defeated = true;
    expect(matchOutcomeText3D(world, 1)).toBe('Defeat');

    world.players.get(1)!.defeated = false;
    world.players.get(2)!.defeated = true;
    expect(matchOutcomeText3D(world, 1)).toBe('Victory');
  });
});
