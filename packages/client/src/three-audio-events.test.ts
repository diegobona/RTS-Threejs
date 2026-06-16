import { describe, expect, it } from 'vitest';
import { ThreeAudioEventTracker, type ThreeAudioSnapshot } from './three-audio-events';

function snapshot(overrides: Partial<ThreeAudioSnapshot> = {}): ThreeAudioSnapshot {
  return {
    entities: [],
    projectiles: [],
    ...overrides,
  };
}

function entity(overrides: Partial<ThreeAudioSnapshot['entities'][number]> = {}): ThreeAudioSnapshot['entities'][number] {
  return {
    id: 1,
    x: 10,
    z: 12,
    hp: 100,
    cooldown: 0,
    targetId: null,
    building: false,
    engineer: false,
    domain: 'infantry',
    projectileSpeed: 0,
    ...overrides,
  };
}

describe('ThreeAudioEventTracker', () => {
  it('does not emit audio when a newly produced aircraft first appears without attacking', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [entity({ id: 1, targetId: null, domain: 'aircraft', projectileSpeed: 100 })],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [
          entity({ id: 1, targetId: null, domain: 'aircraft', projectileSpeed: 100 }),
          entity({ id: 2, x: 30, z: 34, targetId: null, domain: 'aircraft', projectileSpeed: 100 }),
        ],
      }),
    );

    expect(events).toEqual([]);
  });

  it('emits fire, cannon, and bomb events when unit cooldown jumps after attacking', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [
          entity({ id: 1, targetId: 2, projectileSpeed: 0 }),
          entity({ id: 2, x: 14, z: 15 }),
          entity({ id: 3, x: 20, z: 24, targetId: 4, domain: 'vehicle', projectileSpeed: 80 }),
          entity({ id: 4, x: 25, z: 26 }),
          entity({ id: 5, x: 30, z: 34, targetId: 6, domain: 'aircraft', projectileSpeed: 100 }),
          entity({ id: 6, x: 32, z: 38 }),
        ],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [
          entity({ id: 1, cooldown: 8, targetId: 2, projectileSpeed: 0 }),
          entity({ id: 2, x: 14, z: 15 }),
          entity({ id: 3, x: 20, z: 24, cooldown: 30, targetId: 4, domain: 'vehicle', projectileSpeed: 80 }),
          entity({ id: 4, x: 25, z: 26 }),
          entity({ id: 5, x: 30, z: 34, cooldown: 36, targetId: 6, domain: 'aircraft', projectileSpeed: 100 }),
          entity({ id: 6, x: 32, z: 38 }),
        ],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['fire', 'cannon', 'bomb']);
    expect(events[0]).toMatchObject({ targetX: 14, targetZ: 15 });
    expect(events[1]).toMatchObject({ targetX: 25, targetZ: 26 });
  });

  it('uses cannon-style launch audio for aircraft missiles instead of bomb audio', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [
          entity({ id: 1, targetId: 2, domain: 'aircraft', projectileSpeed: 150, weaponRole: 'missile' }),
          entity({ id: 2, x: 18, z: 20, domain: 'aircraft' }),
        ],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [
          entity({ id: 1, cooldown: 28, targetId: 2, domain: 'aircraft', projectileSpeed: 150, weaponRole: 'missile' }),
          entity({ id: 2, x: 18, z: 20, domain: 'aircraft' }),
        ],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['cannon']);
  });

  it('emits hit and explosion events from damage, projectile impact, and entity removal', () => {
    const tracker = new ThreeAudioEventTracker();
    tracker.update(
      snapshot({
        entities: [
          entity({ id: 1 }),
          entity({ id: 2, x: 16, z: 18, hp: 500, building: true, domain: 'building' }),
        ],
        projectiles: [{ id: 7, x: 11, z: 13, impactKind: 'explosion' }],
      }),
    );

    const events = tracker.update(
      snapshot({
        entities: [entity({ id: 1, hp: 70 })],
        projectiles: [],
      }),
    );

    expect(events.map((e) => e.kind)).toEqual(['hit', 'bigExplosion', 'explosion']);
  });
});
