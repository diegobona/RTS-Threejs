import type { Command, Entity, Player, UnitType, World } from '@ra2web/game';

const BUILD_ORDER = ['barracks', 'warfactory', 'airbase'] as const;
const SIM_TICKS_PER_SECOND = 5;
const AI_ATTACK_COOLDOWN_TICKS = 5 * 60 * SIM_TICKS_PER_SECOND;
const FORMATION_TIMEOUT_TICKS = 18 * SIM_TICKS_PER_SECOND;
const FORMATION_REISSUE_TICKS = 6 * SIM_TICKS_PER_SECOND;
const FORMATION_STAGING_DISTANCE = 8;
const FORMATION_GROUP_SPACING = 5;
const AI_MAX_ATTACK_WAVE = 120;
type CoreProductionBuilding = (typeof BUILD_ORDER)[number];

export type Difficulty = 'easy' | 'normal' | 'hard';

type Mode = 'defensive' | 'balanced' | 'aggressive';

const MODES: Mode[] = ['defensive', 'balanced', 'aggressive'];

interface ModeParams {
  waveSize: number;
  homeReserve: number;
}

const MODE: Record<Mode, ModeParams> = {
  defensive: { waveSize: 10, homeReserve: 1 },
  balanced: { waveSize: 8, homeReserve: 1 },
  aggressive: { waveSize: 6, homeReserve: 0 },
};

const PRODUCTION_BUILDING_TARGETS: Record<Mode, Record<CoreProductionBuilding, number>> = {
  defensive: { barracks: 3, warfactory: 2, airbase: 2 },
  balanced: { barracks: 3, warfactory: 3, airbase: 2 },
  aggressive: { barracks: 4, warfactory: 3, airbase: 3 },
};

interface DiffParams {
  waveBias: number;
}

const DIFF: Record<Difficulty, DiffParams> = {
  easy: { waveBias: 6 },
  normal: { waveBias: 0 },
  hard: { waveBias: -3 },
};

interface FormationGroup {
  typeId: string;
  ids: number[];
  anchor: { x: number; y: number };
}

interface FormationPlan {
  targetId: number;
  startedTick: number;
  lastMoveTick: number;
  groups: FormationGroup[];
}

interface ActiveAssault {
  targetId: number;
  ids: number[];
}

export class SimpleAI {
  private readonly mode: Mode;
  private readonly m: ModeParams;
  private readonly waveSize: number;
  private engaged = false;
  private formation: FormationPlan | null = null;
  private activeAssault: ActiveAssault | null = null;

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
      this.formation = null;
      this.activeAssault = null;
      if (world.tick < AI_ATTACK_COOLDOWN_TICKS) {
        cmds.push({ kind: 'attack', entityIds: ids, targetId: threat });
        return;
      }
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

    if (world.tick < AI_ATTACK_COOLDOWN_TICKS) {
      this.formation = null;
      this.activeAssault = null;
      return;
    }

    if (!this.engaged || army.length <= this.m.homeReserve) {
      this.formation = null;
      this.activeAssault = null;
      return;
    }
    const target = this.pickTarget(world, enemies, this.centroid(army));
    if (target === null) return;
    const attackers = (home ? this.byDistToHome(army, home).slice(this.m.homeReserve) : army).slice(0, AI_MAX_ATTACK_WAVE);
    if (attackers.length > 0) this.stageAttack(world, attackers, target, home, cmds);
  }

  private stageAttack(
    world: World,
    attackers: Entity[],
    targetId: number,
    home: { x: number; y: number } | null,
    cmds: Command[],
  ): void {
    if (this.activeAssault) {
      if (world.entities.has(this.activeAssault.targetId)) {
        const ids = this.activeAssault.ids.filter((id) => world.entities.get(id)?.owner === this.playerId);
        if (ids.length > 0) {
          cmds.push({ kind: 'attack', entityIds: ids, targetId: this.activeAssault.targetId });
          return;
        }
      }
      this.activeAssault = null;
    }

    if (!this.formationMatches(world, attackers, targetId)) {
      this.formation = this.createFormation(world, attackers, targetId, home);
      cmds.push(...this.formationMoveCommands(world, this.formation));
      return;
    }

    const formation = this.formation!;
    if (this.formationReady(world, formation) || world.tick - formation.startedTick >= FORMATION_TIMEOUT_TICKS) {
      const ids = this.formationIds(world, formation);
      this.formation = null;
      this.activeAssault = { targetId, ids };
      if (ids.length > 0) cmds.push({ kind: 'attack', entityIds: ids, targetId });
      return;
    }

    if (world.tick - formation.lastMoveTick >= FORMATION_REISSUE_TICKS) {
      formation.lastMoveTick = world.tick;
      cmds.push(...this.formationMoveCommands(world, formation));
    }
  }

  private formationMatches(world: World, attackers: Entity[], targetId: number): boolean {
    if (!this.formation || this.formation.targetId !== targetId || !world.entities.has(targetId)) return false;
    const currentIds = new Set(attackers.map((e) => e.id));
    const plannedIds = this.formationIds(world, this.formation);
    if (plannedIds.length === 0) return false;
    let overlap = 0;
    for (const id of plannedIds) if (currentIds.has(id)) overlap++;
    return overlap >= Math.max(1, Math.floor(Math.min(currentIds.size, plannedIds.length) * 0.6));
  }

  private createFormation(
    world: World,
    attackers: Entity[],
    targetId: number,
    home: { x: number; y: number } | null,
  ): FormationPlan {
    const origin = home ?? this.centroid(attackers);
    const target = world.entities.get(targetId);
    const dx = (target?.cellX ?? origin.x + 1) - origin.x;
    const dy = (target?.cellY ?? origin.y + 1) - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py = ux;
    const center = {
      x: origin.x + ux * FORMATION_STAGING_DISTANCE,
      y: origin.y + uy * FORMATION_STAGING_DISTANCE,
    };
    const groups = this.groupAttackers(attackers);
    const mid = (groups.length - 1) / 2;

    return {
      targetId,
      startedTick: world.tick,
      lastMoveTick: world.tick,
      groups: groups.map((group, index) => {
        const desired = {
          x: Math.round(center.x + px * (index - mid) * FORMATION_GROUP_SPACING),
          y: Math.round(center.y + py * (index - mid) * FORMATION_GROUP_SPACING),
        };
        const anchor = world.passableNear(desired.x, desired.y, 8) ?? desired;
        return { ...group, anchor };
      }),
    };
  }

  private groupAttackers(attackers: Entity[]): FormationGroup[] {
    const byType = new Map<string, number[]>();
    for (const e of attackers) {
      const ids = byType.get(e.typeId) ?? [];
      ids.push(e.id);
      byType.set(e.typeId, ids);
    }
    return [...byType.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([typeId, ids]) => ({ typeId, ids: ids.sort((a, b) => a - b), anchor: { x: 0, y: 0 } }));
  }

  private formationMoveCommands(world: World, formation: FormationPlan): Command[] {
    const cmds: Command[] = [];
    for (const group of formation.groups) {
      const ids = group.ids.filter((id) => world.entities.get(id)?.owner === this.playerId);
      if (ids.length > 0) cmds.push({ kind: 'move', entityIds: ids, cellX: group.anchor.x, cellY: group.anchor.y });
    }
    return cmds;
  }

  private formationReady(world: World, formation: FormationPlan): boolean {
    let livingGroups = 0;
    for (const group of formation.groups) {
      const living = group.ids.map((id) => world.entities.get(id)).filter((e): e is Entity => !!e && e.owner === this.playerId);
      if (living.length === 0) continue;
      livingGroups++;
      const radius = Math.max(3, Math.ceil(Math.sqrt(living.length)) + 1);
      const radiusSq = radius * radius;
      for (const e of living) {
        const dx = e.cellX - group.anchor.x;
        const dy = e.cellY - group.anchor.y;
        if (dx * dx + dy * dy > radiusSq) return false;
      }
    }
    return livingGroups > 0;
  }

  private formationIds(world: World, formation: FormationPlan): number[] {
    const ids: number[] = [];
    for (const group of formation.groups) {
      for (const id of group.ids) {
        const e = world.entities.get(id);
        if (e?.owner === this.playerId) ids.push(id);
      }
    }
    return ids;
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

  private hasIncompleteBuilding(world: World, typeId: string): boolean {
    for (const e of world.entities.values()) {
      if (e.owner !== this.playerId || e.typeId !== typeId) continue;
      if (world.rules.units.get(e.typeId)?.domain !== 'building') continue;
      if (e.constructionTotal > 0 && e.constructionProgress < e.constructionTotal) return true;
    }
    return false;
  }

  private nextBuilding(world: World, _player: Player): string | null {
    const has = (id: string): boolean => this.countBuildings(world, id) > 0;
    for (const id of BUILD_ORDER) if (!has(id)) return id;

    const targets = PRODUCTION_BUILDING_TARGETS[this.mode];
    let waitingForProductionExpansion = false;
    for (const id of BUILD_ORDER) {
      if (this.countBuildings(world, id) >= targets[id]) continue;
      if (this.hasIncompleteBuilding(world, id)) {
        waitingForProductionExpansion = true;
        continue;
      }
      return id;
    }
    if (waitingForProductionExpansion) return null;

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
    if (!anchor) return this.findAnyBuildSpot(world, type);

    for (let r = 2; r < 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = anchor.x + dx;
          const y = anchor.y + dy;
          if (this.canUseBuildSpot(world, type, x, y)) return { x, y };
        }
      }
    }
    return this.findAnyBuildSpot(world, type);
  }

  private findAnyBuildSpot(world: World, type: UnitType): { x: number; y: number } | null {
    for (let y = 0; y < world.terrain.height; y++) {
      for (let x = 0; x < world.terrain.width; x++) {
        if (this.canUseBuildSpot(world, type, x, y)) return { x, y };
      }
    }
    return null;
  }

  private canUseBuildSpot(world: World, type: UnitType, cellX: number, cellY: number): boolean {
    if (!world.canPlace(this.playerId, type, cellX, cellY)) return false;
    const footprint = type.building;
    if (!footprint) return true;
    const margin = 1;
    for (const e of world.entities.values()) {
      if (e.owner !== this.playerId) continue;
      const other = world.rules.units.get(e.typeId)?.building;
      if (!other) continue;
      if (this.rectsOverlapWithMargin(cellX, cellY, footprint.footprintW, footprint.footprintH, e.cellX, e.cellY, other.footprintW, other.footprintH, margin)) {
        return false;
      }
    }
    return true;
  }

  private rectsOverlapWithMargin(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number, margin: number): boolean {
    return ax < bx + bw + margin && ax + aw + margin > bx && ay < by + bh + margin && ay + ah + margin > by;
  }
}
