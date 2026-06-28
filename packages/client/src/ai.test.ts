import { describe, expect, it } from 'vitest';
import { createWorldFromConfig, gridTerrain, World } from '@ra2web/game';
import { SimpleAI } from './ai';
import { localSkirmishConfig } from './match-setup';

function aiAttackWorld(): World {
  const world = new World(gridTerrain(48, 48), 20260616);
  world.addPlayer(1, 'allied', 5000);
  world.addPlayer(2, 'soviet', 5000);
  world.spawnUnit(1, 'conyard', 5, 5);
  for (let i = 0; i < 7; i++) world.spawnUnit(1, 'gi', 8 + i, 10);
  for (let i = 0; i < 4; i++) world.spawnUnit(1, 'grizzly', 9 + i, 13);
  world.spawnUnit(2, 'conyard', 36, 36);
  return world;
}

function aiMirrorWorld(): World {
  const world = new World(gridTerrain(48, 48), 20260610);
  world.addPlayer(1, 'allied', 5000);
  world.addPlayer(2, 'soviet', 5000);
  world.spawnUnit(1, 'conyard', 5, 6);
  world.spawnUnit(2, 'conyard', 40, 39);
  return world;
}

const isAttackCommand = (cmd: { kind: string }): boolean => cmd.kind === 'attack' || cmd.kind === 'attackMove';

function runTicks(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}

describe('SimpleAI', () => {
  it('hard AI mirror match runs a tactical window without throwing', () => {
    const world = aiMirrorWorld();
    const ai1 = new SimpleAI(1, 'hard');
    const ai2 = new SimpleAI(2, 'hard');

    for (let t = 0; t < 90; t++) {
      if (t % 15 === 0) {
        world.applyCommands(ai1.emit(world));
        world.applyCommands(ai2.emit(world));
      }
      world.step();
    }
    expect(world.players.get(1)!.everBuilt).toBe(true);
    expect(world.players.get(2)!.everBuilt).toBe(true);
  });

  it('all personalities can start proactive staging after the opening cooldown', () => {
    for (const s of [0, 1, 2]) {
      const world = aiAttackWorld();
      world.tick = 1500;
      const a = new SimpleAI(1, 'hard', s);
      const cmds = a.emit(world);
      expect(cmds.some((cmd) => cmd.kind === 'move' || isAttackCommand(cmd)), `seed=${s}`).toBe(true);
    }
  });

  it('waits for a real wave before the first proactive attack', () => {
    const world = aiAttackWorld();
    const ai = new SimpleAI(1, 'normal', 1);
    let firstAttackArmy = -1;
    for (let t = 0; t < 1800 && firstAttackArmy < 0; t++) {
      if (t % 15 === 0) {
        const cmds = ai.emit(world);
        if (cmds.some((c) => c.kind === 'attack')) {
          let army = 0;
          for (const e of world.entities.values()) {
            const ty = world.rules.units.get(e.typeId);
            if (e.owner === 1 && ty && ty.domain !== 'building' && ty.weapon) army++;
          }
          firstAttackArmy = army;
        }
        world.applyCommands(cmds);
      }
      world.step();
    }
    expect(firstAttackArmy).toBeGreaterThanOrEqual(6);
  });

  it('does not proactively attack during the first five minutes', () => {
    const world = aiAttackWorld();
    world.tick = 1499;
    const cmds = new SimpleAI(1, 'hard', 1).emit(world);
    expect(cmds.some(isAttackCommand)).toBe(false);
  });

  it('does not queue duplicate core buildings while the first one is under construction', () => {
    const world = new World(gridTerrain(40, 40), 91);
    world.addPlayer(1, 'allied', 5000);
    world.spawnUnit(1, 'conyard', 5, 5);
    world.spawnUnit(1, 'worker', 8, 9);
    const ai = new SimpleAI(1, 'normal', 1);

    ai.emit(world);
    world.applyCommands(ai.emit(world));
    ai.emit(world);

    const buildingQueue = world.queueFor(1, 'building');
    expect([...world.entities.values()].filter((e) => e.owner === 1 && e.typeId === 'barracks')).toHaveLength(1);
    expect([...world.entities.values()].filter((e) => e.owner === 1 && e.typeId === 'refinery')).toHaveLength(0);
    expect(buildingQueue?.items ?? []).not.toContain('barracks');
    expect(buildingQueue?.items ?? []).not.toContain('refinery');
  });

  it('continues expanding production buildings after the first core set is built', () => {
    const world = new World(gridTerrain(64, 64), 20260620);
    world.addPlayer(1, 'allied', 5000);
    world.spawnUnit(1, 'conyard', 8, 8);
    for (let i = 0; i < 8; i++) world.spawnUnit(1, 'worker', 10 + (i % 4), 12 + Math.floor(i / 4));
    const ai = new SimpleAI(1, 'normal', 1);

    for (let t = 0; t < 1800; t++) {
      if (t % 15 === 0) world.applyCommands(ai.emit(world));
      world.step();
    }

    const count = (typeId: string): number => [...world.entities.values()].filter((e) => e.owner === 1 && e.typeId === typeId).length;
    expect(count('barracks')).toBeGreaterThan(1);
    expect(count('warfactory')).toBeGreaterThan(1);
    expect(count('airbase')).toBeGreaterThan(1);
    expect(count('pillbox')).toBe(0);
    expect(count('tesla')).toBe(0);
    expect(count('battlelab')).toBe(0);
  });

  it('hard AI switches any war factory to shared missile truck production while normal AI keeps tanks', () => {
    const hardWorld = new World(gridTerrain(64, 64), 20260628);
    hardWorld.addPlayer(2, 'soviet', 5000);
    const hardFactory = hardWorld.spawnUnit(2, 'warfactory', 20, 20)!;

    const hardCmds = new SimpleAI(2, 'hard', 1).emit(hardWorld);

    expect(hardCmds).toContainEqual({
      kind: 'setProducerType',
      owner: 2,
      buildingId: hardFactory.id,
      typeId: 'arty',
    });
    hardWorld.applyCommands(hardCmds);
    runTicks(hardWorld, 120);
    expect([...hardWorld.entities.values()].some((e) => e.owner === 2 && e.typeId === 'arty')).toBe(true);

    const normalWorld = new World(gridTerrain(64, 64), 20260628);
    normalWorld.addPlayer(2, 'soviet', 5000);
    normalWorld.spawnUnit(2, 'warfactory', 20, 20);
    normalWorld.spawnUnit(2, 'warfactory', 26, 20);

    const normalCmds = new SimpleAI(2, 'normal', 1).emit(normalWorld);

    expect(normalCmds.some((cmd) => cmd.kind === 'setProducerType')).toBe(false);
  });

  it('falls back to any empty map location when no local build spot is available', () => {
    const blocked = new Set<number>();
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        if (x < 20 || y < 20) blocked.add(y * 40 + x);
      }
    }
    const world = new World(gridTerrain(40, 40, blocked), 20260621);
    world.addPlayer(1, 'allied', 5000);
    world.spawnUnit(1, 'conyard', 3, 3);
    world.spawnUnit(1, 'worker', 4, 4);
    expect(world.queueProduction(1, 'barracks')).toBe(true);
    const queue = world.queueFor(1, 'building')!;
    queue.readyToPlace = true;

    const place = new SimpleAI(1, 'normal', 1).emit(world).find((cmd) => cmd.kind === 'place');

    expect(place?.kind).toBe('place');
    if (place?.kind === 'place') {
      expect(place.cellX).toBeGreaterThanOrEqual(20);
      expect(place.cellY).toBeGreaterThanOrEqual(20);
    }
  });

  it('stages each unit type into separate formations before proactive attacks', () => {
    const world = aiAttackWorld();
    world.tick = 1500;
    const cmds = new SimpleAI(1, 'hard', 1).emit(world);
    expect(cmds.some(isAttackCommand)).toBe(false);

    const moves = cmds.filter((cmd) => cmd.kind === 'move');
    expect(moves.length).toBeGreaterThanOrEqual(2);
    for (const move of moves) {
      const typeIds = new Set(move.entityIds.map((id) => world.entities.get(id)?.typeId));
      expect(typeIds.size).toBe(1);
    }
  });

  it('personality is deterministic by seed', () => {
    const persona = (seed: number): string => new SimpleAI(2, 'normal', seed).personality;
    expect(persona(7)).toBe(persona(7));
    const set = new Set([persona(0), persona(1), persona(2), persona(3)]);
    expect(set.size).toBeGreaterThan(1);
  });

  it('same seeds produce deterministic decisions', () => {
    const run = (): number => {
      const world = aiMirrorWorld();
      const a = new SimpleAI(1, 'normal');
      const b = new SimpleAI(2, 'normal');
      for (let t = 0; t < 120; t++) {
        if (t % 15 === 0) {
          world.applyCommands(a.emit(world));
          world.applyCommands(b.emit(world));
        }
        world.step();
      }
      return world.hash();
    };
    expect(run()).toBe(run());
  });
});
