import { describe, expect, it } from 'vitest';
import {
  entityRootAltitude3D,
  entitySelectionRingAltitude3D,
  entityVisualAltitude3D,
  isPickableEntityPart3D,
  LOWPOLY_FIGHTER_PART_IDS,
  LOWPOLY_FIGHTER_MODEL_SCALE,
  projectileVisualPoint3D,
} from './three-world-renderer';

describe('ThreeWorldRenderer aircraft altitude', () => {
  it('keeps the RTS entity root on the ground while rendering aircraft visibly in the sky', () => {
    expect(entityRootAltitude3D({ domain: 'aircraft' })).toBe(0);
    expect(entityVisualAltitude3D({ domain: 'aircraft' })).toBeGreaterThanOrEqual(8);
    expect(entityVisualAltitude3D({ domain: 'vehicle' })).toBe(0);
    expect(entityVisualAltitude3D({ domain: 'building' })).toBe(0);
  });

  it('puts aircraft selection feedback on the aircraft body, not on the shadow', () => {
    expect(entitySelectionRingAltitude3D({ domain: 'aircraft' })).toBeGreaterThanOrEqual(entityVisualAltitude3D({ domain: 'aircraft' }));
    expect(entitySelectionRingAltitude3D({ domain: 'vehicle' })).toBeCloseTo(0.045);
  });

  it('keeps aircraft shadows out of raycast picking', () => {
    expect(isPickableEntityPart3D({ pickable: false })).toBe(false);
    expect(isPickableEntityPart3D({})).toBe(true);
  });

  it('renders aircraft projectiles as bombs descending directly below the aircraft', () => {
    const point = projectileVisualPoint3D(
      { domain: 'aircraft' },
      { x: 20 * 256, y: 10 * 256 },
      { x: 10 * 256, y: 10 * 256 },
      { x: 30 * 256, y: 10 * 256 },
    );
    expect(point.x).toBe(20);
    expect(point.z).toBe(20);
    expect(point.y).toBeGreaterThan(0.55);
    expect(point.y).toBeLessThan(entityVisualAltitude3D({ domain: 'aircraft' }) + 1);
  });

  it('builds the procedural fighter from detailed low-poly parts', () => {
    expect(LOWPOLY_FIGHTER_PART_IDS).toEqual(
      expect.arrayContaining(['fuselage', 'nose', 'cockpit', 'main-wing', 'tail-wing', 'vertical-tail', 'intake', 'hardpoint']),
    );
    expect(LOWPOLY_FIGHTER_PART_IDS.length).toBeGreaterThanOrEqual(12);
  });

  it('scales the procedural fighter large enough for close inspection', () => {
    expect(LOWPOLY_FIGHTER_MODEL_SCALE).toBeGreaterThanOrEqual(1.4);
  });
});
