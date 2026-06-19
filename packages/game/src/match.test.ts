import { describe, expect, it } from 'vitest';
import { createWorldFromConfig } from './match';
import type { MatchConfig } from './protocol';

describe('match setup', () => {
  it('starts players without refinery or harvester entities', () => {
    const config: MatchConfig = {
      seed: 7,
      mapWidth: 32,
      mapHeight: 32,
      spawns: [
        { playerId: 1, side: 'allied', cellX: 5, cellY: 5 },
        { playerId: 2, side: 'soviet', cellX: 22, cellY: 22 },
      ],
      orePatches: [{ cellX: 16, cellY: 16 }],
      inputDelay: 0,
      startingCredits: 0,
    };

    const world = createWorldFromConfig(config);
    const typeIds = [...world.entities.values()].map((e) => e.typeId);

    expect(typeIds).toContain('conyard');
    expect(typeIds).not.toContain('refinery');
    expect(typeIds).not.toContain('harvester');
  });
});
