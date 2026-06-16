import type { Command, Entity, Player, World } from '@ra2web/game';

const BUILD_ORDER = ['refinery', 'barracks', 'warfactory', 'airbase'];

export type Difficulty = 'easy' | 'normal' | 'hard';

type Mode = 'defensive' | 'balanced' | 'aggressive';

const MODES: Mode[] = ['defensive', 'balanced', 'aggressive'];

interface ModeParams {
  defenseTarget: number;
  waveSize: number;
  refineries: number;
  homeReserve: number;
}

const MODE: Record<Mode, ModeParams> = {
  defensive: { defenseTarget: 3, waveSize: 10, refineries: 1, homeReserve: 1 },
  balanced: { defenseTarget: 2, waveSize: 8, refineries: 1, homeReserve: 1 },
  aggressive: { defenseTarget: 1, waveSize: 6, refineries: 1, homeReserve: 0 },
};

interface DiffParams {
  waveBias: number;
}

const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveBias: 6 },
  normal: { waveBias: 0 },
  hard: { waveBias: -3 },
};

export class SimpleAI {
  private readonly mode: Mode;
  private readonly m: ModeParams;
  private readonly waveSize: number;
  private engaged = false;

  constructor(
    private readonly playerId: number,
    difficulty: Difficulty = 'normal',
    seed: number = playerId,
  ) {
    this.mode = MODES[((seed >>> 0) + playerId) % MODES.length]!;
    this.m = MODE[this.mode];
    this.waveSize = Math.max(6, this.m.waveSize + DIFF[difficulty].waveBias);
  }

  get personality(): string {
    return this.mode;
  }

  get personaName(): string {
    return { defensive: 'Steel Line', balanced: 'Balanced Push', aggressive: 'Full Assault' }[this.mode];
  }

  emit(world: World): Command[] {
    const cmds: Command[] = [];
    const player = world.players.get(this.playerId);
    if (!player || player.defeated) return cmds;

    this.manageBuildings(world, player, cmds);
    this.manageArmy(world, cmds);
    return cmds;
  }

  private manageBuildings(world: World, player: Player, cmds: Command[]): void {
    const queue = world.queueFor(this.playerId, 'building');
    if (queue?.readyToPlace) {
      const typeId = queue.items[0]!;
      const spot = this.findBuildSpot(world, typeId);
      if (spot) cmds.push({ kind: 'place', owner: this.playerId, typeId, cellX: spot.x, cellY: spot.y });
      return;
    }

    if (queue && queue.items.length > 0) return;

    const next = this.nextBuilding(world, player);
    if (next) world.queueProduction(this.playerId, next);
  }

  private manageArmy(world: World, cmds: Command[]): void {
    const army: Entity[] = [];
    const enemies: Entity[] = [];
    for (const e of world.entities.values()) {
      const type = world.rules.units.get(e.typeId);
      if (!type) continue;
      if (e.owner === this.playerId) {
        if (type.domain !== 'building' && type.weapon) army.push(e);
      } else if (world.players.has(e.owner)) {
        enemies.push(e);
      }
    }
    if (army.length === 0 || enemies.length === 0) return;

    const decay = Math.floor(world.tick / (15 * 45));
    const effWave = Math.max(2, this.waveSize - decay);
    if (army.length >= effWave) this.engaged = true;
    else if (army.length < Math.max(2, effWave >> 1)) this.engaged = false;

    const ids = army.map((e) => e.id);
    const home = this.baseCentroid(world);
    const threat = this.nearestThreatToBase(world, enemies);
    if (threat !== null) {
      if (this.engaged && home && army.length >= 6) {
        const sorted = this.byDistToHome(army, home);
        const defenders = Math.max(1, Math.floor(sorted.length / 3));
        cmds.push({ kind: 'attack', entityIds: sorted.slice(0, defenders).map((e) => e.id), targetId: threat });
        const target = this.pickTarget(world, enemies, this.centroid(army));
        if (target !== null) cmds.push({ kind: 'attack', entityIds: sorted.slice(defenders).map((e) => e.id), targetId: target });
      } else {
        cmds.push({ kind: 'attack', entityIds: ids, targetId: threat });
      }
      return;
    }

    if (!this.engaged || army.length <= this.m.homeReserve) return;
    const target = this.pickTarget(world, enemies, this.centroid(army));
    if (target === null) return;
    const attackers = home ? this.byDistToHome(army, home).slice(this.m.homeReserve).map((e) => e.id) : ids;
    if (attackers.length > 0) cmds.push({ kind: 'attack', entityIds: attackers, targetId: target });
  }

  private nearestThreatToBase(world: World, enemies: Entity[]): number | null {
    const buildings: Entity[] = [];
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') buildings.push(e);
    }
    if (buildings.length === 0) return null;

    let best: number | null = null;
    let bestD = 12 * 12;
    for (const e of enemies) {
      if (world.rules.units.get(e.typeId)?.domain === 'building') continue;
      for (const b of buildings) {
        const dx = e.cellX - b.cellX;
        const dy = e.cellY - b.cellY;
        const d = dx * dx + dy * dy;
        if (d <= bestD) {
          bestD = d;
          best = e.id;
        }
      }
    }
    return best;
  }

  private pickTarget(world: World, enemies: Entity[], from: { x: number; y: number }): number | null {
    const buildings = enemies.filter((e) => world.rules.units.get(e.typeId)?.domain === 'building');
    const building = this.nearest(buildings, from);
    if (building) return building.id;
    const unit = this.nearest(enemies, from);
    return unit ? unit.id : null;
  }

  private nearest(list: Entity[], from: { x: number; y: number }): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of list) {
      const dx = e.cellX - from.x;
      const dy = e.cellY - from.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private byDistToHome(army: Entity[], home: { x: number; y: number }): Entity[] {
    return [...army].sort((a, b) => {
      const da = (a.cellX - home.x) * (a.cellX - home.x) + (a.cellY - home.y) * (a.cellY - home.y);
      const db = (b.cellX - home.x) * (b.cellX - home.x) + (b.cellY - home.y) * (b.cellY - home.y);
      return da - db;
    });
  }

  private baseCentroid(world: World): { x: number; y: number } | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        sx += e.cellX;
        sy += e.cellY;
        n++;
      }
    }
    return n === 0 ? null : { x: Math.round(sx / n), y: Math.round(sy / n) };
  }

  private centroid(list: Entity[]): { x: number; y: number } {
    let sx = 0;
    let sy = 0;
    for (const e of list) {
      sx += e.cellX;
      sy += e.cellY;
    }
    return { x: Math.round(sx / list.length), y: Math.round(sy / list.length) };
  }

  private countBuildings(world: World, typeId: string): number {
    let n = 0;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && e.typeId === typeId && world.rules.units.get(e.typeId)?.domain === 'building') n++;
    }
    return n;
  }

  private nextBuilding(world: World, _player: Player): string | null {
    const has = (id: string): boolean => world.hasBuilding(this.playerId, id);
    for (const id of BUILD_ORDER) if (!has(id)) return id;
    if (this.countBuildings(world, 'refinery') < this.m.refineries) return 'refinery';
    if (this.countBuildings(world, 'tesla') + this.countBuildings(world, 'pillbox') < this.m.defenseTarget) return 'pillbox';
    return null;
  }

  private findBuildSpot(world: World, typeId: string): { x: number; y: number } | null {
    const type = world.rules.units.get(typeId);
    if (!type) return null;

    let anchor: { x: number; y: number } | null = null;
    for (const e of world.entities.values()) {
      if (e.owner === this.playerId && world.rules.units.get(e.typeId)?.domain === 'building') {
        anchor = { x: e.cellX, y: e.cellY };
        break;
      }
    }
    if (!anchor) return null;

    for (let r = 2; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = anchor.x + dx;
          const y = anchor.y + dy;
          if (world.canPlace(this.playerId, type, x, y)) return { x, y };
        }
      }
    }
    return null;
  }
}
