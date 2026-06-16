import { describe, expect, it } from 'vitest';
import { ThreeAudioEventTracker, type ThreeAudioSnapshot } from './three-audio-events';

function snapshot(overrides: Partial<ThreeAudioSnapshot> = {}): ThreeAudioSnapshot {
  return {
    entities: [],
    projectiles: [],
    ...overrides,
  };
}

describe('ThreeAudioEventTracker', () => {
  it('emits fire and cannon events when unit cooldown jumps after attacking', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [
          { id: 1, x: 10, z: 12, hp: 100, cooldown: 0, targetId: 2, building: false, engineer: false, projectileSpeed: 0 },
          { id: 3, x: 20, z: 24, hp: 100, cooldown: 0, targetId: 4, building: false, engineer: false, projectileSpeed: 80 },
        ],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [
          { id: 1, x: 10, z: 12, hp: 100, cooldown: 8, targetId: 2, building: false, engineer: false, projectileSpeed: 0 },
          { id: 3, x: 20, z: 24, hp: 100, cooldown: 30, targetId: 4, building: false, engineer: false, projectileSpeed: 80 },
        ],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['fire', 'cannon']);
  });

  it('emits hit and explosion events from damage, projectile impact, and entity removal', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [
          { id: 1, x: 10, z: 12, hp: 100, cooldown: 0, targetId: null, building: false, engineer: false, projectileSpeed: 0 },
          { id: 2, x: 16, z: 18, hp: 500, cooldown: 0, targetId: null, building: true, engineer: false, projectileSpeed: 0 },
        ],
        projectiles: [{ id: 7, x: 11, z: 13 }],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [{ id: 1, x: 10, z: 12, hp: 70, cooldown: 0, targetId: null, building: false, engineer: false, projectileSpeed: 0 }],
        projectiles: [],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['hit', 'bigExplosion', 'hit']);
  });
});
