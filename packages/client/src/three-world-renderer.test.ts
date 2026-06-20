import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import * as renderer3D from './three-world-renderer';
import {
  combatEffectProfile3D,
  commandIndicatorProfile3D,
  commandIndicatorTransform3D,
  aircraftIdleOrbitOffset3D,
  aircraftIdleOrbitYaw3D,
  aircraftVisualStep3D,
  aircraftVisualDampedStep3D,
  entityRootAltitude3D,
  entitySelectionRingAltitude3D,
  entitySelectionRingScale3D,
  entityConstructionOpacity3D,
  entityConstructionBarProfile3D,
  entityConstructionProgress3D,
  entityYawForFacing3D,
  entityVisualAltitude3D,
  isPickableEntityPart3D,
  LOWPOLY_FIGHTER_PART_IDS,
  LOWPOLY_FIGHTER_MODEL_SCALE,
  LOWPOLY_WORKER_PART_IDS,
  proceduralModelYawOffset3D,
  combatMuzzlePoint3D,
  projectileTracerEnd3D,
  projectileImpactKind3D,
  projectileVisualProfile3D,
  projectileVisualPoint3D,
} from './three-world-renderer';

describe('ThreeWorldRenderer aircraft altitude', () => {
  it('derives construction progress and ghost opacity from map construction state', () => {
    const building = { constructionProgress: 30, constructionTotal: 100 };
    const complete = { constructionProgress: 100, constructionTotal: 100 };
    const normal = { constructionProgress: 0, constructionTotal: 0 };

    expect(entityConstructionProgress3D(building)).toBeCloseTo(0.3);
    expect(entityConstructionOpacity3D(building)).toBeLessThan(0.75);
    expect(entityConstructionProgress3D(complete)).toBe(1);
    expect(entityConstructionOpacity3D(complete)).toBe(1);
    expect(entityConstructionProgress3D(normal)).toBe(1);
    expect(entityConstructionOpacity3D(normal)).toBe(1);
  });

  it('makes map construction progress bars prominent above building ghosts', () => {
    const profile = entityConstructionBarProfile3D({
      domain: 'building',
      building: { footprintW: 3, footprintH: 2, power: 0 },
    });

    expect(profile.widthScale).toBeGreaterThan(2);
    expect(profile.heightScale).toBeGreaterThan(1.8);
    expect(profile.depthScale).toBeGreaterThan(1.8);
    expect(profile.y).toBeGreaterThan(2.9);
  });

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

  it('scales vehicle selection rings wider than infantry so tanks are clearly framed', () => {
    expect(entitySelectionRingScale3D({ domain: 'infantry' })).toBe(1);
    expect(entitySelectionRingScale3D({ domain: 'vehicle' })).toBeGreaterThanOrEqual(1.7);
    expect(entitySelectionRingScale3D({ domain: 'aircraft' })).toBeGreaterThanOrEqual(1.7);
  });

  it('shows health bars only for selected, damaged, hovered, constructing, or fighting entities', () => {
    const healthyIdle = { hp: 100, maxHp: 100 };

    expect(renderer3D.entityHpBarVisible3D(healthyIdle)).toBe(false);
    expect(renderer3D.entityHpBarVisible3D({ ...healthyIdle, selected: true })).toBe(true);
    expect(renderer3D.entityHpBarVisible3D({ hp: 60, maxHp: 100 })).toBe(true);
    expect(renderer3D.entityHpBarVisible3D({ ...healthyIdle, nearby: true })).toBe(true);
    expect(renderer3D.entityHpBarVisible3D({ ...healthyIdle, combat: true })).toBe(true);
    expect(renderer3D.entityHpBarVisible3D({ ...healthyIdle, constructing: true })).toBe(true);
  });

  it('raises health bars above low-poly unit silhouettes', () => {
    expect(renderer3D.entityHpBarProfile3D({ domain: 'infantry' }).y).toBeGreaterThan(1.85);
    expect(renderer3D.entityHpBarProfile3D({ domain: 'vehicle' }).y).toBeGreaterThan(1.95);
    expect(renderer3D.entityHpBarProfile3D({ domain: 'aircraft' }).y).toBeGreaterThan(entityVisualAltitude3D({ domain: 'aircraft' }) + 1.8);
    expect(renderer3D.entityHpBarProfile3D({ domain: 'building', building: { footprintW: 3, footprintH: 2, power: 0 } }).y).toBeGreaterThan(2.2);
  });

  it('counter-rotates health bars so unit facing cannot turn them edge-on', () => {
    expect(renderer3D.entityHpBarYaw3D(Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(renderer3D.entityHpBarYaw3D(-Math.PI / 4)).toBeCloseTo(Math.PI / 4);
  });

  it('keeps aircraft shadows out of raycast picking', () => {
    expect(isPickableEntityPart3D({ pickable: false })).toBe(false);
    expect(isPickableEntityPart3D({})).toBe(true);
  });

  it('renders aircraft projectiles as bombs descending directly below the aircraft', () => {
    const point = projectileVisualPoint3D(
      { domain: 'aircraft' },
      { x: 20 * 256, y: 10 * 256, weaponRole: 'bomb' },
      { x: 10 * 256, y: 10 * 256 },
      { x: 30 * 256, y: 10 * 256 },
    );
    expect(point.x).toBe(20);
    expect(point.z).toBe(20);
    expect(point.y).toBeGreaterThan(0.55);
    expect(point.y).toBeLessThan(entityVisualAltitude3D({ domain: 'aircraft' }) + 1);
  });

  it('renders aircraft missiles as high-air tracers instead of falling bombs', () => {
    const point = projectileVisualPoint3D(
      { domain: 'aircraft' },
      { x: 20 * 256, y: 10 * 256, weaponRole: 'missile' },
      { x: 10 * 256, y: 10 * 256 },
      { x: 30 * 256, y: 10 * 256 },
    );
    const profile = projectileVisualProfile3D({ domain: 'aircraft' }, 'missile');

    expect(point.x).toBeCloseTo(40);
    expect(point.z).toBeCloseTo(20);
    expect(point.y).toBeGreaterThan(entityVisualAltitude3D({ domain: 'aircraft' }) - 0.5);
    expect(profile.kind).toBe('tracer');
    expect(profile.color).not.toBe(0x111111);
  });

  it('renders ground projectiles as fast tracers and aircraft projectiles as black bombs', () => {
    const infantry = projectileVisualProfile3D({ domain: 'infantry' });
    const vehicle = projectileVisualProfile3D({ domain: 'vehicle' });
    const aircraft = projectileVisualProfile3D({ domain: 'aircraft' });
    const aircraftMissile = projectileVisualProfile3D({ domain: 'aircraft' }, 'missile');

    expect(infantry.kind).toBe('tracer');
    expect(vehicle.kind).toBe('tracer');
    expect(vehicle.color).not.toBe(0xffe060);
    expect(aircraft.kind).toBe('bomb');
    expect(aircraft.color).toBe(0x111111);
    expect(aircraftMissile.kind).toBe('tracer');
  });

  it('marks aircraft bomb impacts with a dedicated audible impact instead of muted generic explosions', () => {
    expect(projectileImpactKind3D({ domain: 'aircraft' }, 'bomb', 0)).toBe('bombImpact');
    expect(projectileImpactKind3D({ domain: 'aircraft' }, 'missile', 0)).toBe('explosion');
    expect(projectileImpactKind3D({ domain: 'vehicle' }, 'cannon', 0)).toBe('explosion');
    expect(projectileImpactKind3D({ domain: 'infantry' }, 'gun', 0)).toBe('hit');
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

  it('builds workers without rifle-like parts', () => {
    expect(LOWPOLY_WORKER_PART_IDS).toEqual(expect.arrayContaining(['hardhat', 'toolbox', 'team-patch']));
    expect(LOWPOLY_WORKER_PART_IDS.some((id) => /rifle|barrel|gun/i.test(id))).toBe(false);
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

  it('sends idle aircraft into a large orbit over the home base instead of circling in place', () => {
    const aircraftPos = new Vector3(10, 0, 10);
    const baseCenter = new Vector3(40, 0, 42);
    const idleA = aircraftIdleOrbitOffset3D({ domain: 'aircraft' }, { targetId: null, pathLength: 0 }, aircraftPos, baseCenter, 0, 11);
    const idleB = aircraftIdleOrbitOffset3D({ domain: 'aircraft' }, { targetId: null, pathLength: 0 }, aircraftPos, baseCenter, 1.25, 11);
    const moving = aircraftIdleOrbitOffset3D({ domain: 'aircraft' }, { targetId: null, pathLength: 1 }, aircraftPos, baseCenter, 1.25, 11);
    const attackingWithoutStation = aircraftIdleOrbitOffset3D({ domain: 'aircraft' }, { targetId: 42, pathLength: 0 }, aircraftPos, baseCenter, 1.25, 11);
    const attackingAtStation = aircraftIdleOrbitOffset3D(
      { domain: 'aircraft' },
      { targetId: 42, pathLength: 0, loiterCenter: baseCenter },
      baseCenter,
      undefined,
      1.25,
      11,
    );
    const ground = aircraftIdleOrbitOffset3D({ domain: 'vehicle' }, { targetId: null, pathLength: 0 }, aircraftPos, baseCenter, 1.25, 11);
    const visualA = aircraftPos.clone().add(idleA);
    const visualB = aircraftPos.clone().add(idleB);

    expect(visualA.distanceTo(baseCenter)).toBeGreaterThan(8);
    expect(visualA.distanceTo(baseCenter)).toBeLessThan(26);
    expect(visualA.distanceTo(aircraftPos)).toBeGreaterThan(24);
    expect(visualB.distanceTo(visualA)).toBeGreaterThan(2.5);
    expect(Math.hypot(moving.x, moving.z)).toBe(0);
    expect(Math.hypot(attackingWithoutStation.x, attackingWithoutStation.z)).toBe(0);
    expect(Math.hypot(attackingAtStation.x, attackingAtStation.z)).toBeGreaterThan(2.6);
    expect(Math.hypot(attackingAtStation.x, attackingAtStation.z)).toBeLessThan(6.5);
    expect(Math.hypot(ground.x, ground.z)).toBe(0);
  });

  it('stages idle aircraft into staggered loiter lanes instead of one cramped ring', () => {
    const aircraftPos = new Vector3(10, 0, 10);
    const baseCenter = new Vector3(40, 0, 42);
    const positions = Array.from({ length: 18 }, (_, i) => {
      const id = i + 1;
      const offset = aircraftIdleOrbitOffset3D({ domain: 'aircraft' }, { targetId: null, pathLength: 0 }, aircraftPos, baseCenter, 4, id);
      return aircraftPos.clone().add(offset);
    });
    const distances = positions.map((p) => p.distanceTo(baseCenter));
    const ringWidth = Math.max(...distances) - Math.min(...distances);
    const distanceBands = new Set(distances.map((d) => Math.round(d / 2)));

    expect(ringWidth).toBeGreaterThan(8);
    expect(distanceBands.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps many idle aircraft in wider readable lanes over the same airbase', () => {
    const aircraftPos = new Vector3(10, 0, 10);
    const airbaseCenter = new Vector3(40, 0, 42);
    const positions = Array.from({ length: 24 }, (_, i) => {
      const id = i + 1;
      const offset = aircraftIdleOrbitOffset3D(
        { domain: 'aircraft' },
        { targetId: null, pathLength: 0, loiterCenter: airbaseCenter },
        aircraftPos,
        new Vector3(2, 0, 2),
        6,
        id,
      );
      return aircraftPos.clone().add(offset);
    });

    let nearest = Infinity;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        nearest = Math.min(nearest, positions[i]!.distanceTo(positions[j]!));
      }
    }

    const distances = positions.map((p) => p.distanceTo(airbaseCenter));
    expect(nearest).toBeGreaterThan(2.8);
    expect(Math.min(...distances)).toBeGreaterThan(7.5);
    expect(Math.max(...distances)).toBeLessThan(26);
  });

  it('orbits idle aircraft around their ordered airspace before falling back to home base', () => {
    const aircraftPos = new Vector3(26, 0, 26);
    const homeBase = new Vector3(5, 0, 5);
    const orderedAirspace = new Vector3(28, 0, 28);
    const offset = aircraftIdleOrbitOffset3D(
      { domain: 'aircraft' },
      { targetId: null, pathLength: 0, loiterCenter: orderedAirspace },
      aircraftPos,
      homeBase,
      2,
      9,
    );
    const visual = aircraftPos.clone().add(offset);

    expect(visual.distanceTo(orderedAirspace)).toBeLessThan(26);
    expect(visual.distanceTo(homeBase)).toBeGreaterThan(20);
  });

  it('turns idle aircraft along the tangent of the orbit', () => {
    const yawA = aircraftIdleOrbitYaw3D(0, 5);
    const yawB = aircraftIdleOrbitYaw3D(1, 5);

    expect(yawB).not.toBeCloseTo(yawA);
    expect(Number.isFinite(yawA)).toBe(true);
    expect(Number.isFinite(yawB)).toBe(true);
  });

  it('caps abrupt aircraft visual jumps when leaving idle loiter', () => {
    const current = new Vector3(0, 0, 0);
    const farDesired = new Vector3(30, 0, 0);
    const stepped = aircraftVisualStep3D(current, farDesired, 2);

    expect(stepped.distanceTo(current)).toBeCloseTo(2);
    expect(stepped.distanceTo(farDesired)).toBeGreaterThan(20);
    expect(aircraftVisualStep3D(current, new Vector3(1, 0, 0), 2).x).toBeCloseTo(1);
  });

  it('smooths aircraft movement velocity so it does not suddenly snap or surge', () => {
    const current = new Vector3(0, 0, 0);
    const desired = new Vector3(10, 0, 0);
    const first = aircraftVisualDampedStep3D(current, desired, null, 0.05);
    const second = aircraftVisualDampedStep3D(first.position, desired, first.velocity, 0.05);

    expect(first.position.x).toBeGreaterThan(0);
    expect(first.position.x).toBeLessThan(10);
    expect(second.position.x).toBeGreaterThan(first.position.x);
    expect(second.velocity.length()).toBeGreaterThan(first.velocity.length());
    expect(second.velocity.length() - first.velocity.length()).toBeLessThan(4);
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

  it('uses green command markers for movement and red sword markers for attacks', () => {
    const move = commandIndicatorProfile3D('move');
    const attack = commandIndicatorProfile3D('attack');
    const moveTransform = commandIndicatorTransform3D('move');

    expect(move.color).toBe(0x00ffc8);
    expect(move.showSwords).toBe(false);
    expect(move.life).toBeGreaterThanOrEqual(40);
    expect(moveTransform.ringScale).toBeGreaterThan(1.3);
    expect(attack.color).toBe(0xff4b4b);
    expect(attack.showSwords).toBe(true);
  });

  it('scales and lifts attack markers for large building targets so they are not hidden under the model', () => {
    const unit = commandIndicatorTransform3D('attack');
    const building = commandIndicatorTransform3D('attack', { footprintW: 3, footprintH: 3 });

    expect(unit.ringScale).toBe(1);
    expect(building.ringScale).toBeGreaterThan(3);
    expect(building.swordHeight).toBeGreaterThan(unit.swordHeight);
  });
});
