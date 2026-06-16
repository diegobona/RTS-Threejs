import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  combatEffectProfile3D,
  entityRootAltitude3D,
  entitySelectionRingAltitude3D,
  entityYawForFacing3D,
  entityVisualAltitude3D,
  isPickableEntityPart3D,
  LOWPOLY_FIGHTER_PART_IDS,
  LOWPOLY_FIGHTER_MODEL_SCALE,
  proceduralModelYawOffset3D,
  combatMuzzlePoint3D,
  projectileTracerEnd3D,
  projectileVisualProfile3D,
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

  it('renders ground projectiles as fast tracers and aircraft projectiles as black bombs', () => {
    const infantry = projectileVisualProfile3D({ domain: 'infantry' });
    const vehicle = projectileVisualProfile3D({ domain: 'vehicle' });
    const aircraft = projectileVisualProfile3D({ domain: 'aircraft' });

    expect(infantry.kind).toBe('tracer');
    expect(vehicle.kind).toBe('tracer');
    expect(vehicle.color).not.toBe(0xffe060);
    expect(aircraft.kind).toBe('bomb');
    expect(aircraft.color).toBe(0x111111);
  });

  it('extends tracer lines from the muzzle toward the target direction', () => {
    const end = projectileTracerEnd3D(new Vector3(2, 1, 3), new Vector3(12, 1, 3), 2.5);

    expect(end.x).toBeCloseTo(4.5);
    expect(end.y).toBeCloseTo(1);
    expect(end.z).toBeCloseTo(3);
  });

  it('places fire and cannon flashes forward at the weapon muzzle instead of the unit center', () => {
    const center = { x: 10, z: 20 };
    const target = { x: 18, z: 20 };
    const rifle = combatMuzzlePoint3D('fire', center, target);
    const cannon = combatMuzzlePoint3D('cannon', center, target);

    expect(rifle.x).toBeCloseTo(center.x + 0.84);
    expect(rifle.z).toBeCloseTo(center.z);
    expect(cannon.x).toBeCloseTo(center.x + 1.9);
    expect(cannon.z).toBeCloseTo(center.z);
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

  it('aligns procedural ground unit fronts with the movement-facing convention', () => {
    expect(entityYawForFacing3D(0)).toBeCloseTo(0);
    expect(entityYawForFacing3D(64)).toBeCloseTo(-Math.PI / 2);
    expect(proceduralModelYawOffset3D({ domain: 'vehicle' }, false)).toBeCloseTo(-Math.PI / 2);
    expect(proceduralModelYawOffset3D({ domain: 'infantry' }, false)).toBeCloseTo(-Math.PI / 2);
    expect(proceduralModelYawOffset3D({ domain: 'aircraft' }, false)).toBe(0);
    expect(proceduralModelYawOffset3D({ domain: 'vehicle' }, true)).toBe(0);
  });

  it('maps combat events to distinct visible spark and blast effects', () => {
    const fire = combatEffectProfile3D('fire');
    const cannon = combatEffectProfile3D('cannon');
    const bomb = combatEffectProfile3D('bomb');
    const explosion = combatEffectProfile3D('explosion');

    expect(fire.visual).toBe('muzzleFlash');
    expect(fire.sparkCount).toBeGreaterThan(0);
    expect(cannon.radius).toBeGreaterThan(fire.radius);
    expect(bomb.height).toBeGreaterThan(fire.height);
    expect(explosion.visual).toBe('blast');
    expect(explosion.sparkCount).toBeGreaterThan(cannon.sparkCount);
  });
});
