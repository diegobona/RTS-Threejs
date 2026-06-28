import { describe, expect, it } from 'vitest';
import { gridTerrain } from './replay';
import { DEFAULT_RULES } from './content';
import { dirToBangle } from './fixed';
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
    expect(arty?.weapon?.minRange).toBeGreaterThanOrEqual(8 * 256);
    expect(arty?.weapon?.cooldown).toBeGreaterThanOrEqual(225);
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

  it('damages nearby small units with falloff when a tactical missile hits a selected unit', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'grizzly', 34, 8)!;
    const near = w.spawnUnit(2, 'grizzly', 35, 8)!;
    const mid = w.spawnUnit(2, 'grizzly', 36, 8)!;
    const far = w.spawnUnit(2, 'grizzly', 39, 8)!;
    const nearHp = near.hp;
    const midHp = mid.hp;
    const farHp = far.hp;

    launcher.deployed = true;
    launcher.deployMode = null;
    launcher.deployTimer = 0;
    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);
    runTicks(w, 180);

    const nearDamage = nearHp - near.hp;
    const midDamage = midHp - mid.hp;
    const farDamage = farHp - far.hp;
    expect(nearDamage).toBeGreaterThan(0);
    expect(midDamage).toBeGreaterThan(0);
    expect(nearDamage).toBeGreaterThan(midDamage);
    expect(farDamage).toBe(0);
  });

  it('must deploy before launching a tactical missile', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 34)!;
    const arty = DEFAULT_RULES.units.get('arty')!;
    const deployTime = arty.deployTime!;

    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);
    runTicks(w, Math.max(1, deployTime - 1));

    expect(launcher.deployed).toBe(false);
    expect(launcher.deployTimer).toBeGreaterThan(0);
    expect(w.projectiles).toHaveLength(0);

    for (let i = 0; i < 16 && !launcher.deployed; i++) w.step();

    expect(launcher.deployed).toBe(true);
    expect(w.projectiles.length).toBeGreaterThan(0);
  });

  it('waits for the long cooldown before launching a second tactical missile', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 34)!;
    const arty = DEFAULT_RULES.units.get('arty')!;

    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);
    runTicks(w, arty.deployTime! + 45);
    const hpAfterFirstImpact = target.hp;
    expect(hpAfterFirstImpact).toBeLessThan(target.maxHp);
    expect(launcher.cooldown).toBeGreaterThan(0);

    runTicks(w, Math.floor(arty.weapon!.cooldown / 2));

    expect(target.hp).toBe(hpAfterFirstImpact);
    expect(launcher.cooldown).toBeGreaterThan(0);
  });

  it('tracks fired tactical missiles per owner and blocks launches after the 200 missile stockpile is spent', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 8)!;

    launcher.deployed = true;
    launcher.deployMode = null;
    launcher.deployTimer = 0;
    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);

    w.step();

    expect(w.tacticalMissileAmmoFor(1)).toEqual({ fired: 1, total: 200 });

    launcher.cooldown = 0;
    w.setTacticalMissilesFiredForTests(1, 200);
    w.step();

    expect(w.tacticalMissileAmmoFor(1)).toEqual({ fired: 200, total: 200 });
    expect(w.projectiles.filter((p) => p.shooterId === launcher.id)).toHaveLength(1);
  });

  it('does not fire on a tick that begins while cooldown is still active', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 8)!;

    launcher.deployed = true;
    launcher.deployMode = null;
    launcher.deployTimer = 0;
    launcher.cooldown = 1;
    launcher.facing = dirToBangle(target.x - launcher.x, target.y - launcher.y);
    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);

    w.step();

    expect(launcher.cooldown).toBe(0);
    expect(w.projectiles).toHaveLength(0);

    w.step();

    expect(w.projectiles.length).toBeGreaterThan(0);
  });

  it('packs up before moving after it has deployed', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 8, 8)!;
    const target = w.spawnUnit(2, 'warfactory', 34, 34)!;
    const arty = DEFAULT_RULES.units.get('arty')!;

    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);
    runTicks(w, arty.deployTime! + 20);
    expect(launcher.deployed).toBe(true);

    const xBeforeMove = launcher.x;
    const yBeforeMove = launcher.y;
    w.applyCommands([{ kind: 'move', entityIds: [launcher.id], cellX: 18, cellY: 8 }]);
    runTicks(w, Math.max(1, Math.floor(arty.deployTime! / 2)));

    expect(launcher.deployed).toBe(true);
    expect(launcher.deployMode).toBe('undeploy');
    expect(launcher.x).toBe(xBeforeMove);
    expect(launcher.y).toBe(yBeforeMove);

    runTicks(w, arty.deployTime!);

    expect(launcher.deployed).toBe(false);
    expect(launcher.deployMode).toBeNull();
    expect(Math.abs(launcher.x - xBeforeMove) + Math.abs(launcher.y - yBeforeMove)).toBeGreaterThan(0);
  });

  it('does not fire tactical missiles inside the minimum range', () => {
    const w = new World(gridTerrain(80, 80), 20260628);
    w.addPlayer(1, 'allied', 10000);
    w.addPlayer(2, 'soviet', 10000);
    const launcher = w.spawnUnit(1, 'arty', 10, 10)!;
    const target = w.spawnUnit(2, 'warfactory', 12, 10)!;
    const startingHp = target.hp;

    w.applyCommands([{ kind: 'attack', entityIds: [launcher.id], targetId: target.id }]);
    runTicks(w, 220);

    expect(target.hp).toBe(startingHp);
    expect(w.projectiles).toHaveLength(0);
  });
});
