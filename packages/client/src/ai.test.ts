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

const isAttackCommand = (cmd: { kind: string }): boolean => cmd.kind === 'attack' || cmd.kind === 'attackMove';

describe('SimpleAI', () => {
  it('hard AI mirror match resolves without throwing', () => {
    const world = createWorldFromConfig(localSkirmishConfig(5000));
    const ai1 = new SimpleAI(1, 'hard');
    const ai2 = new SimpleAI(2, 'hard');

    let winner = 0;
    let lastTick = 0;
    for (let t = 0; t < 40000 && winner === 0; t++) {
      if (t % 15 === 0) {
        world.applyCommands(ai1.emit(world));
        world.applyCommands(ai2.emit(world));
      }
      world.step();
      lastTick = t;
      const p1 = world.players.get(1)!;
      const p2 = world.players.get(2)!;
      if (p1.defeated || p2.defeated) winner = p1.defeated ? 2 : 1;
    }
    expect(winner, `expected a winner by tick ${lastTick}`).toBeGreaterThan(0);
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
    const world = createWorldFromConfig(localSkirmishConfig(5000));
    const ai = new SimpleAI(1, 'normal', 1);
    let firstAttackArmy = -1;
    for (let t = 0; t < 6000 && firstAttackArmy < 0; t++) {
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
      const world = createWorldFromConfig(localSkirmishConfig(5000));
      const a = new SimpleAI(1, 'normal');
      const b = new SimpleAI(2, 'normal');
      for (let t = 0; t < 900; t++) {
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
