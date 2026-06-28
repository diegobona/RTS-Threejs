/**
 * 模拟世界：固定 tick、命令驱动、全整数状态。
 * 锁步联机的共享内核 —— 同样的初始状态 + 同样的命令序列
 * 必须在任何机器上产生逐 tick 完全相同的世界（用 hash() 校验）。
 *
 * 本文件按系统分区：玩家经济 / 生产 / 建筑放置 / 移动寻路 / 采矿 / 战斗。
 * 所有遍历都按 id 升序（Map 插入序 = id 递增），保证全端一致。
 */
import {
  DEFAULT_RULES,
  producibleBy,
  type ArmorType,
  type Domain,
  type RulesData,
  type Side,
  type UnitType,
  type WeaponRole,
  type WeaponSpec,
} from './content';
import { cellToLepton, leptonToCell } from './coords';
import { dirToBangle, dist, turnToward, velocity } from './fixed';
import { StateHash } from './hash';
import { findPath, type PathGrid } from './pathfind';
import { Prng } from './prng';

export type TerrainKind = 'grass' | 'water' | 'ridge' | 'sand' | 'scorched' | 'shore' | 'road' | 'marsh';

export interface TerrainInfo extends PathGrid {
  width: number;
  height: number;
  passable(x: number, y: number): boolean;
  terrainAt?(x: number, y: number): TerrainKind;
}

export interface Player {
  id: number;
  side: Side;
  credits: number;
  /** 上一 tick 结算的发电/耗电（仅供显示与建造速度）。 */
  powerProduced: number;
  powerDrained: number;
  /** 曾拥有过建筑 —— 据此判负（避免开局未落基地即判负）。 */
  everBuilt: boolean;
  defeated: boolean;
}

/** 生产分类：建筑/步兵/车辆各一条并行队列。 */
export type ProdCategory = 'building' | 'infantry' | 'vehicle' | 'aircraft';

export interface ProductionQueue {
  /** 队列中的 typeId（含正在生产的队首）。 */
  items: string[];
  /** 队首已积累的建造进度（tick）。 */
  progress: number;
  /** 建筑造好后等待放置。 */
  readyToPlace: boolean;
}

export interface ProducerState {
  enabled: boolean;
  typeId: string;
  progress: number;
  paidTypeId: string | null;
}

export interface HarvesterState {
  mode: 'seek' | 'toOre' | 'harvest' | 'toRefinery' | 'unload';
  /** 已装载矿石价值。 */
  load: number;
  timer: number;
}

/** 作战姿态：进攻=更大半径主动出击；警戒=默认，警戒半径内迎击；
 *  坚守=只打武器射程内、绝不移动追击；不还火=不自动索敌也不还击（仅听显式命令）。 */
export type Stance = 'aggressive' | 'guard' | 'holdground' | 'holdfire';

export interface Entity {
  id: number;
  owner: number;
  typeId: string;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  /** 建筑左上角格（仅建筑）。 */
  constructionProgress: number;
  constructionTotal: number;
  cellX: number;
  cellY: number;
  // 移动
  path: { x: number; y: number }[];
  waypoint: { x: number; y: number } | null;
  goal: { x: number; y: number } | null;
  // 战斗
  targetId: number | null;
  groundTargetX: number | null;
  groundTargetY: number | null;
  cooldown: number;
  /** 累计击杀（老兵等级：≥2 老兵、≥5 精英，伤害递增）。 */
  kills: number;
  /** 攻击移动：朝目标格行军，沿途逐个停下歼敌再续行。 */
  attackMove: boolean;
  /** 攻击移动/巡逻的最终行军终点（格）。途中迎敌时被临时绕开，敌灭后据此续行/折返。null=无。 */
  attackDest: { x: number; y: number } | null;
  /** 攻击移动的指定最终攻击目标。途中可临时交战，清完后继续攻击该目标。 */
  attackTargetId: number | null;
  /** 巡逻：到达当前目的地后折返的另一端点（格），null=不巡逻。沿途自动交战。 */
  patrol: { x: number; y: number } | null;
  /** 工程师前往进入的目标建筑 id（己方=满血修复 / 敌方=占领；进入即消耗）。null=无。 */
  enterTarget: number | null;
  constructionTargetId: number | null;
  /** 作战姿态（默认 guard 警戒）。 */
  stance: Stance;
  // 采矿
  harvester: HarvesterState | null;
  // 建筑：集结点（格，-1=无）+ 是否在修理
  rallyX: number;
  rallyY: number;
  airLoiterX: number;
  airLoiterY: number;
  repairing: boolean;
  producer: ProducerState | null;
  producerExit: { x: number; y: number } | null;
  /** 展开状态：true=已展开可开火，false=已收起可移动。仅 deployTime 单位使用。 */
  deployed: boolean;
  /** 展开/收起倒计时（tick）。>0 表示正在转换中。 */
  deployTimer: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  targetId: number | null;
  targetX?: number;
  targetY?: number;
  speed: number;
  damage: number;
  warheadId: string;
  splash: number;
  owner: number;
  shooterId: number;
  weaponRole: WeaponRole;
  targetDomains?: Domain[];
}

export type Command =
  | { kind: 'spawn'; owner: number; typeId: string; cellX: number; cellY: number }
  | { kind: 'produce'; owner: number; typeId: string }
  | { kind: 'cancel'; owner: number; category: ProdCategory }
  | { kind: 'place'; owner: number; typeId: string; cellX: number; cellY: number }
  | { kind: 'move'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'attackMove'; entityIds: number[]; cellX: number; cellY: number; targetId?: number }
  | { kind: 'patrol'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'attack'; entityIds: number[]; targetId: number }
  | { kind: 'attackGround'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'engineerEnter'; entityIds: number[]; targetId: number }
  | { kind: 'harvest'; entityIds: number[]; cellX: number; cellY: number }
  | { kind: 'setRally'; owner: number; buildingId: number; cellX: number; cellY: number }
  | { kind: 'setAutoProduction'; owner: number; buildingId: number; enabled: boolean }
  | { kind: 'setProducerType'; owner: number; buildingId: number; typeId: string }
  | { kind: 'sell'; owner: number; entityId: number }
  | { kind: 'repair'; owner: number; entityId: number }
  | { kind: 'stance'; entityIds: number[]; stance: Stance }
  | { kind: 'stop'; entityIds: number[] };

const CATEGORY_PRODUCER: Record<ProdCategory, string> = {
  building: 'conyard',
  infantry: 'barracks',
  vehicle: 'warfactory',
  aircraft: 'airbase',
};

const HARVEST_RATE = 30;
const HARVEST_CAPACITY = 700;
const HARVEST_TICKS = 2;
const SIM_TICKS_PER_SECOND = 5;
const CONYARD_INCOME_PER_SECOND = 150;
const REFINERY_INCOME_PER_SECOND = 600;
const AUTO_PRODUCTION_STEP = 2;
const CONSTRUCTION_WORKER_COUNT = 1;
export interface CapacitySlot {
  count: number;
  limit: number;
}

export interface CapacitySnapshot {
  building: CapacitySlot;
  worker: CapacitySlot;
  infantry: CapacitySlot;
  vehicle: CapacitySlot;
  missileTruck?: CapacitySlot;
  aircraft: CapacitySlot;
}

export const DEFAULT_CAPACITY_LIMITS: Record<keyof CapacitySnapshot, number> = {
  building: 20,
  worker: 20,
  infantry: 300,
  vehicle: 100,
  missileTruck: 10,
  aircraft: 30,
};

type CapacityKey = keyof CapacitySnapshot;

function isMissileTruckType(type: UnitType): boolean {
  return type.domain === 'vehicle' && (type.id === 'arty' || type.id === 'tel');
}

function capacityKeyForType(type: UnitType): CapacityKey {
  if (type.id === 'worker') return 'worker';
  if (isMissileTruckType(type)) return 'missileTruck';
  return type.domain;
}
/** 单位「警戒」半径（lepton）：空闲单位会主动迎击此范围内的敌人（即便超出武器射程也会上前）。 */
const GUARD_RANGE = 6 * 256;
const COMBAT_SPATIAL_BUCKET_SIZE = GUARD_RANGE;
/** 修理：每隔多少 tick 回一次血。 */
const REPAIR_INTERVAL = 5;
/** 修理花费相对造价比例（修满约花造价的此比例）。 */
const REPAIR_COST_RATIO = 0.5;

export interface CombatSpatialIndex {
  nearby(x: number, y: number, radius: number): Entity[];
}

export function buildCombatSpatialIndex(
  entities: Iterable<Entity>,
  bucketSize = COMBAT_SPATIAL_BUCKET_SIZE,
): CombatSpatialIndex {
  const buckets = new Map<string, Entity[]>();
  const keyOf = (bucketX: number, bucketY: number): string => `${bucketX}:${bucketY}`;
  const bucketOf = (value: number): number => Math.floor(value / bucketSize);

  for (const e of entities) {
    const bucketX = bucketOf(e.x);
    const bucketY = bucketOf(e.y);
    const key = keyOf(bucketX, bucketY);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }

  return {
    nearby(x: number, y: number, radius: number): Entity[] {
      const out: Entity[] = [];
      const minX = bucketOf(x - radius);
      const maxX = bucketOf(x + radius);
      const minY = bucketOf(y - radius);
      const maxY = bucketOf(y + radius);
      for (let by = minY; by <= maxY; by++) {
        for (let bx = minX; bx <= maxX; bx++) {
          const bucket = buckets.get(keyOf(bx, by));
          if (!bucket) continue;
          for (const e of bucket) {
            if (dist(e.x - x, e.y - y) <= radius) out.push(e);
          }
        }
      }
      return out;
    },
  };
}

export function categoryOf(u: UnitType): ProdCategory {
  return u.domain === 'building' ? 'building' : u.domain;
}

function producerDomain(buildingId: string): Exclude<ProdCategory, 'building'> | null {
  if (buildingId === 'conyard') return 'infantry';
  if (buildingId === 'barracks') return 'infantry';
  if (buildingId === 'warfactory') return 'vehicle';
  if (buildingId === 'airbase') return 'aircraft';
  return null;
}

function defaultProducerUnit(buildingId: string, side: Side): string | null {
  if (buildingId === 'conyard') return 'worker';
  if (buildingId === 'barracks') return side === 'soviet' ? 'conscript' : 'gi';
  if (buildingId === 'warfactory') return side === 'soviet' ? 'rhino' : 'grizzly';
  if (buildingId === 'airbase') return 'fighter';
  return null;
}

function addHashString(h: StateHash, value: string): void {
  h.addInt(value.length);
  for (let i = 0; i < value.length; i++) h.addInt(value.charCodeAt(i));
}

export class World {
  tick = 0;
  readonly prng: Prng;
  readonly entities = new Map<number, Entity>();
  readonly players = new Map<number, Player>();
  readonly projectiles: Projectile[] = [];
  /** 每格矿石价值（credit）。 */
  readonly ore: Int16Array;
  private readonly queues = new Map<string, ProductionQueue>(); // key = `${owner}:${category}`
  private nextEntityId = 1;
  private nextProjectileId = 1;
  /** 建筑占用的格 → entityId，用于放置校验与寻路阻挡。 */
  private readonly occupied = new Map<number, number>();
  private readonly reservedProducerExits = new Map<number, number>();
  private combatSpatialIndex: CombatSpatialIndex | null = null;

  constructor(
    readonly terrain: TerrainInfo,
    seed: number,
    readonly rules: RulesData = DEFAULT_RULES,
  ) {
    this.prng = new Prng(seed);
    this.ore = new Int16Array(terrain.width * terrain.height);
  }

  // ───────────────────────── 玩家 / 矿石 ─────────────────────────

  addPlayer(id: number, side: Side, credits: number): void {
    this.players.set(id, {
      id,
      side,
      credits,
      powerProduced: 0,
      powerDrained: 0,
      everBuilt: false,
      defeated: false,
    });
  }

  setOre(cellX: number, cellY: number, value: number): void {
    if (cellX < 0 || cellY < 0 || cellX >= this.terrain.width || cellY >= this.terrain.height) return;
    this.ore[cellY * this.terrain.width + cellX] = value;
  }

  oreAt(cellX: number, cellY: number): number {
    if (cellX < 0 || cellY < 0 || cellX >= this.terrain.width || cellY >= this.terrain.height) return 0;
    return this.ore[cellY * this.terrain.width + cellX]!;
  }

  // ───────────────────────── 命令 ─────────────────────────

  applyCommands(commands: Command[]): void {
    for (const cmd of commands) {
      switch (cmd.kind) {
        case 'spawn':
          if (cmd.typeId === 'worker' && !this.hasBuilding(cmd.owner, 'conyard')) break;
          this.spawnUnit(cmd.owner, cmd.typeId, cmd.cellX, cmd.cellY);
          break;
        case 'produce':
          this.queueProduction(cmd.owner, cmd.typeId);
          break;
        case 'cancel':
          this.cancelProduction(cmd.owner, cmd.category);
          break;
        case 'place':
          this.placeBuilding(cmd.owner, cmd.typeId, cmd.cellX, cmd.cellY);
          break;
        case 'move': {
          // 多个单位：散开到目标周围不同格（队形展开），避免挤成一坨/互相挡路
          const ids = [...cmd.entityIds].sort((a, b) => a - b);
          const airFormation = this.allAircraft(ids);
          const slots = ids.length > 1 ? this.spreadDestinations(cmd.cellX, cmd.cellY, ids.length, airFormation ? 5 : 1, airFormation) : [{ x: cmd.cellX, y: cmd.cellY }];
          ids.forEach((eid, i) => {
            const e = this.entities.get(eid);
            if (!e) return;
            const s = slots[i] ?? slots[0]!;
            this.clearConstructionTarget(e);
            this.setAircraftLoiter(e, s.x, s.y);
            this.orderMove(e, s.x, s.y);
            e.targetId = null;
            e.groundTargetX = null;
            e.groundTargetY = null;
            e.attackMove = false;
            e.attackDest = null;
            e.attackTargetId = null;
            e.patrol = null;
            // 矿车手动移动后回到自动采矿状态：先去目的地，到了再自找最近矿（见 stepHarvester seek）
            if (e.harvester) e.harvester.mode = 'seek';
          });
          break;
        }
        case 'attackMove': {
          const ids = [...cmd.entityIds].sort((a, b) => a - b);
          const airFormation = this.allAircraft(ids);
          const target = cmd.targetId === undefined ? null : this.entities.get(cmd.targetId) ?? null;
          const targetCell = target
            ? airFormation
              ? this.passableAirNear(target.cellX, target.cellY, 8) ?? { x: target.cellX, y: target.cellY }
              : this.passableNear(target.cellX, target.cellY) ?? { x: cmd.cellX, y: cmd.cellY }
            : { x: cmd.cellX, y: cmd.cellY };
          const slots = ids.length > 1
            ? this.spreadDestinations(targetCell.x, targetCell.y, ids.length, airFormation ? 5 : 1, airFormation)
            : [targetCell];
          ids.forEach((eid, i) => {
            const e = this.entities.get(eid);
            if (!e) return;
            const s = slots[i] ?? slots[0]!;
            this.clearConstructionTarget(e);
            this.setAircraftLoiter(e, s.x, s.y);
            this.orderMove(e, s.x, s.y);
            e.targetId = null;
            e.groundTargetX = null;
            e.groundTargetY = null;
            e.attackMove = true;
            e.attackDest = { x: s.x, y: s.y };
            e.attackTargetId = target?.id ?? null;
            e.patrol = null;
          });
          break;
        }
        case 'patrol':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            // 巡逻：以当前格为一端、目标格为另一端往返；途中按攻击移动逻辑自动交战。
            // 无武器单位（如矿车）不巡逻。
            const type = e && this.rules.units.get(e.typeId);
            if (!e || !type || !this.hasWeapon(type)) continue;
            this.clearConstructionTarget(e);
            e.patrol = { x: e.cellX, y: e.cellY };
            this.orderMove(e, cmd.cellX, cmd.cellY);
            e.targetId = null;
            e.groundTargetX = null;
            e.groundTargetY = null;
            e.attackMove = true;
            e.attackDest = { x: cmd.cellX, y: cmd.cellY };
            e.attackTargetId = null;
          }
          break;
        case 'attack': {
          const ids = [...cmd.entityIds].sort((a, b) => a - b);
          const target = this.entities.get(cmd.targetId);
          const airUnits = ids
            .map((eid) => this.entities.get(eid))
            .filter((e): e is Entity => !!e && this.rules.units.get(e.typeId)?.domain === 'aircraft');
          const firstAir = airUnits[0] ?? null;
          const firstAirType = firstAir ? this.rules.units.get(firstAir.typeId) : null;
          const airSlots = target && firstAirType ? this.aircraftAttackDestinations(target, firstAirType, airUnits) : [];
          let airSlotIndex = 0;
          for (const eid of ids) {
            const e = this.entities.get(eid);
            if (e) {
              this.clearConstructionTarget(e);
              const type = this.rules.units.get(e.typeId);
              e.targetId = cmd.targetId;
              e.groundTargetX = null;
              e.groundTargetY = null;
              e.attackMove = false;
              e.attackDest = null;
              e.attackTargetId = null;
              e.patrol = null;
              if (type?.domain === 'aircraft') {
                const slot = airSlots[airSlotIndex++];
                if (slot) {
                  this.setAircraftLoiter(e, slot.x, slot.y);
                  if (slot.x !== e.cellX || slot.y !== e.cellY) this.orderMove(e, slot.x, slot.y);
                }
              }
            }
          }
          break;
        }
        case 'attackGround': {
          const targetX = cellToLepton(cmd.cellX);
          const targetY = cellToLepton(cmd.cellY);
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            const type = e && this.rules.units.get(e.typeId);
            if (!e || type?.domain !== 'vehicle' || type.weapon?.role !== 'missile') continue;
            this.clearConstructionTarget(e);
            e.targetId = null;
            e.groundTargetX = targetX;
            e.groundTargetY = targetY;
            e.attackMove = false;
            e.attackDest = null;
            e.attackTargetId = null;
            e.patrol = null;
          }
          break;
        }
        case 'engineerEnter': {
          // 工程师前往目标建筑：抵达即修复（己方）/ 占领（敌方），由 stepEngineer 处理。
          const tgt = this.entities.get(cmd.targetId);
          const tt = tgt && this.rules.units.get(tgt.typeId);
          if (tgt && tt?.building) {
            const dock = this.passableNear(tgt.cellX, tgt.cellY + 1) ?? this.passableNear(tgt.cellX, tgt.cellY) ?? { x: tgt.cellX, y: tgt.cellY };
            for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
              const e = this.entities.get(eid);
              if (!e || !this.rules.units.get(e.typeId)?.engineer) continue;
              this.clearConstructionTarget(e);
              e.enterTarget = cmd.targetId;
              e.targetId = null;
              e.groundTargetX = null;
              e.groundTargetY = null;
              e.attackMove = false;
              e.attackDest = null;
              e.attackTargetId = null;
              e.patrol = null;
              this.orderMove(e, dock.x, dock.y);
            }
          }
          break;
        }
        case 'harvest':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (!e || !e.harvester) continue;
            this.clearConstructionTarget(e);
            e.targetId = null;
            e.groundTargetX = null;
            e.groundTargetY = null;
            e.attackMove = false;
            e.attackDest = null;
            e.attackTargetId = null;
            if (this.oreAt(cmd.cellX, cmd.cellY) > 0) {
              this.orderMove(e, cmd.cellX, cmd.cellY); // 去指定矿点开采
              e.harvester.mode = 'toOre';
            } else {
              e.path = [];
              e.waypoint = null;
              e.goal = null;
              e.harvester.mode = 'seek'; // 恢复自动采矿：自找最近矿田
            }
          }
          break;
        case 'setRally': {
          const b = this.entities.get(cmd.buildingId);
          if (b && b.owner === cmd.owner && this.rules.units.get(b.typeId)?.building) {
            b.rallyX = cmd.cellX;
            b.rallyY = cmd.cellY;
          }
          break;
        }
        case 'setAutoProduction':
          this.setAutoProduction(cmd.owner, cmd.buildingId, cmd.enabled);
          break;
        case 'setProducerType':
          this.setProducerType(cmd.owner, cmd.buildingId, cmd.typeId);
          break;
        case 'sell':
          this.sellBuilding(cmd.owner, cmd.entityId);
          break;
        case 'repair': {
          const b = this.entities.get(cmd.entityId);
          if (b && b.owner === cmd.owner && this.rules.units.get(b.typeId)?.building) {
            b.repairing = !b.repairing; // 切换
          }
          break;
        }
        case 'stance':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (e) {
              e.stance = cmd.stance;
              // 切到不还火：放下当前自动锁定的目标（显式攻击命令仍可下达）
              if (cmd.stance === 'holdfire' && !e.attackMove) e.targetId = null;
            }
          }
          break;
        case 'stop':
          for (const eid of [...cmd.entityIds].sort((a, b) => a - b)) {
            const e = this.entities.get(eid);
            if (e) {
              e.path = [];
              e.waypoint = null;
              e.goal = null;
              e.targetId = null;
              e.groundTargetX = null;
              e.groundTargetY = null;
              e.attackMove = false;
              e.attackDest = null;
              e.attackTargetId = null;
              e.patrol = null;
              this.clearConstructionTarget(e);
            }
          }
          break;
      }
    }
  }

  private sellBuilding(owner: number, entityId: number): void {
    const e = this.entities.get(entityId);
    const type = e && this.rules.units.get(e.typeId);
    if (!e || e.owner !== owner || !type?.building) return;
    this.removeBuildingOccupancy(e);
    this.entities.delete(entityId);
  }

  private makeEntity(owner: number, type: UnitType, x: number, y: number): Entity {
    const id = this.nextEntityId++;
    const e: Entity = {
      id,
      owner,
      typeId: type.id,
      x,
      y,
      facing: 0,
      hp: type.hp,
      maxHp: type.hp,
      constructionProgress: 0,
      constructionTotal: 0,
      cellX: leptonToCell(x),
      cellY: leptonToCell(y),
      path: [],
      waypoint: null,
      goal: null,
      targetId: null,
      groundTargetX: null,
      groundTargetY: null,
      cooldown: 0,
      kills: 0,
      attackMove: false,
      attackDest: null,
      attackTargetId: null,
      patrol: null,
      enterTarget: null,
      constructionTargetId: null,
      stance: 'guard',
      rallyX: -1,
      rallyY: -1,
      airLoiterX: -1,
      airLoiterY: -1,
      repairing: false,
      harvester: type.id === 'harvester' ? { mode: 'seek', load: 0, timer: 0 } : null,
      producer: null,
      producerExit: null,
      deployed: false,
      deployTimer: 0,
    };
    this.entities.set(id, e);
    return e;
  }

  /** 直接生成单位（调试 / 测试 / 单位出厂）。 */
  spawnUnit(owner: number, typeId: string, cellX: number, cellY: number): Entity | null {
    const type = this.rules.units.get(typeId);
    if (!type) return null;
    if (type.domain === 'building') {
      return this.placeBuildingEntity(owner, type, cellX, cellY);
    }
    return this.makeEntity(owner, type, cellToLepton(cellX), cellToLepton(cellY));
  }

  // ───────────────────────── 生产 ─────────────────────────

  private queueKey(owner: number, category: ProdCategory): string {
    return `${owner}:${category}`;
  }

  private getQueue(owner: number, category: ProdCategory): ProductionQueue {
    const key = this.queueKey(owner, category);
    let q = this.queues.get(key);
    if (!q) {
      q = { items: [], progress: 0, readyToPlace: false };
      this.queues.set(key, q);
    }
    return q;
  }

  queueFor(owner: number, category: ProdCategory): ProductionQueue | undefined {
    return this.queues.get(this.queueKey(owner, category));
  }

  queueProduction(owner: number, typeId: string): boolean {
    const type = this.rules.units.get(typeId);
    if (type?.domain !== 'building') return false;
    if (!type || !this.canBuild(owner, type)) return false;
    const q = this.getQueue(owner, categoryOf(type));
    q.items.push(typeId);
    if (type.domain === 'building' && q.items[0] === typeId) {
      q.progress = 0;
      q.readyToPlace = true;
    }
    return true;
  }

  cancelProduction(owner: number, category: ProdCategory): void {
    const q = this.queueFor(owner, category);
    if (!q || q.items.length === 0) return;
    q.items.shift();
    q.progress = 0;
    q.readyToPlace = q.items.length > 0;
  }

  /** 玩家是否拥有某 typeId 的建筑（前置科技判断）。 */
  hasBuilding(owner: number, buildingId: string): boolean {
    for (const e of this.entities.values()) {
      if (e.owner === owner && e.typeId === buildingId && e.hp > 0 && this.rules.units.get(e.typeId)?.domain === 'building' && this.isConstructionComplete(e)) {
        return true;
      }
    }
    return false;
  }

  private isConstructionComplete(e: Entity): boolean {
    return e.constructionTotal <= 0 || e.constructionProgress >= e.constructionTotal;
  }

  /** 该单位当前能否建造（生产建筑存在 + 前置满足）。 */
  capacityFor(owner: number): CapacitySnapshot {
    const snapshot: CapacitySnapshot = {
      building: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.building },
      worker: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.worker },
      infantry: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.infantry },
      vehicle: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.vehicle },
      missileTruck: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.missileTruck },
      aircraft: { count: 0, limit: DEFAULT_CAPACITY_LIMITS.aircraft },
    };
    for (const e of this.entities.values()) {
      if (e.owner !== owner) continue;
      const type = this.rules.units.get(e.typeId);
      if (type) {
        const key = capacityKeyForType(type);
        snapshot[key]!.count++;
      }
    }
    return snapshot;
  }

  private isCapacityFull(owner: number, domain: Domain): boolean {
    const slot = this.capacityFor(owner)[domain];
    return slot.count >= slot.limit;
  }

  private isTypeCapacityFull(owner: number, type: UnitType): boolean {
    const capacity = this.capacityFor(owner);
    const slot = capacity[capacityKeyForType(type)];
    return !!slot && slot.count >= slot.limit;
  }

  private hasWorker(owner: number): boolean {
    for (const e of this.entities.values()) {
      if (e.owner === owner && e.typeId === 'worker') return true;
    }
    return false;
  }

  private hasCombatUnit(owner: number): boolean {
    for (const e of this.entities.values()) {
      if (e.owner !== owner) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type || type.domain === 'building' || e.typeId === 'worker') continue;
      if (type.weapon || type.antiAirWeapon) return true;
    }
    return false;
  }

  canBuild(owner: number, type: UnitType): boolean {
    if (type.builtBy === '') return false;
    if (this.isTypeCapacityFull(owner, type)) return false;
    if (type.domain === 'building') {
      if (!this.hasWorker(owner)) return false;
      for (const pre of type.prerequisites) {
        if (pre === 'conyard') continue;
        if (!this.hasBuilding(owner, pre)) return false;
      }
      return true;
    }
    if (!this.hasBuilding(owner, type.builtBy)) return false;
    for (const pre of type.prerequisites) {
      if (!this.hasBuilding(owner, pre)) return false;
    }
    return true;
  }

  /** 当前可建造清单（按规则表顺序）。 */
  buildOptions(owner: number): UnitType[] {
    const out: UnitType[] = [];
    for (const u of this.rules.units.values()) {
      if (this.canBuild(owner, u)) out.push(u);
    }
    return out;
  }

  private stepProduction(): void {
    for (const player of this.players.values()) {
      if (player.defeated) continue;
      for (const category of ['building'] as ProdCategory[]) {
        const q = this.queueFor(player.id, category);
        if (!q || q.items.length === 0 || q.readyToPlace) continue;
        const type = this.rules.units.get(q.items[0]!);
        if (!type) {
          q.items.shift();
          continue;
        }
        // 生产建筑被摧毁 → 暂停
        if (!this.hasBuilding(player.id, CATEGORY_PRODUCER[category])) continue;

        q.progress += AUTO_PRODUCTION_STEP;

        if (q.progress >= type.buildTime) {
          q.progress = type.buildTime;
          if (type.domain === 'building') {
            q.readyToPlace = true; // 等放置命令
          } else {
            this.spawnFromFactory(player.id, type);
            q.items.shift();
            q.progress = 0;
          }
        }
      }
    }
  }

  private spawnFromFactory(owner: number, type: UnitType): void {
    const producerId = CATEGORY_PRODUCER[categoryOf(type)];
    // 找该玩家的生产建筑，单位在其下方空格出现
    let exit: { x: number; y: number } | null = null;
    let rally: { x: number; y: number } | null = null;
    for (const e of this.entities.values()) {
      if (e.owner === owner && e.typeId === producerId) {
        const traits = this.rules.units.get(e.typeId)!.building!;
        const ex = e.cellX + Math.floor(traits.footprintW / 2);
        const ey = e.cellY + traits.footprintH;
        exit = { x: Math.min(ex, this.terrain.width - 1), y: Math.min(ey, this.terrain.height - 1) };
        if (e.rallyX >= 0 && e.rallyY >= 0) rally = { x: e.rallyX, y: e.rallyY };
        break;
      }
    }
    if (!exit) return;
    const spawn = this.findFreeUnitSlotNear(exit.x, exit.y, type.domain, 6, -1, true) ?? exit;
    const unit = this.makeEntity(owner, type, cellToLepton(spawn.x), cellToLepton(spawn.y));
    // 有集结点则前往
    const dest = rally ? this.findFreeUnitSlotNear(rally.x, rally.y, type.domain, 12, unit.id) ?? rally : null;
    if (dest) {
      this.setAircraftLoiter(unit, dest.x, dest.y);
      this.orderMove(unit, dest.x, dest.y);
    }
  }

  /** 修理：开启修理的建筑每隔若干 tick 扣钱回血。 */
  private setAutoProduction(owner: number, buildingId: number, enabled: boolean): void {
    const building = this.entities.get(buildingId);
    if (!building || building.owner !== owner || !building.producer) return;
    building.producer.enabled = enabled;
  }

  private setProducerType(owner: number, buildingId: number, typeId: string): void {
    const building = this.entities.get(buildingId);
    if (!building || building.owner !== owner || !building.producer) return;
    if (!this.isValidProducerChoice(owner, building, typeId)) return;
    if (building.producer.typeId === typeId) return;
    this.refundProducerProgress(owner, building.producer);
    building.producer.typeId = typeId;
    building.producer.progress = 0;
    building.producer.paidTypeId = null;
  }

  private refundProducerProgress(owner: number, producer: ProducerState): void {
    if (!producer.paidTypeId) return;
    void owner;
  }

  private isValidProducerChoice(owner: number, building: Entity, typeId: string): boolean {
    const domain = producerDomain(building.typeId);
    const type = this.rules.units.get(typeId);
    if (!domain || !type || type.domain !== domain) return false;
    if (type.builtBy !== building.typeId) return false;
    for (const pre of type.prerequisites) {
      if (!this.hasBuilding(owner, pre)) return false;
    }
    return true;
  }

  private stepCombatIncome(): void {
    // Money is disabled in the swarm ruleset; keep the hook as a no-op for deterministic step ordering.
  }

  private stepConstruction(): void {
    for (const e of this.entities.values()) {
      if (e.constructionTotal <= 0 || e.constructionProgress >= e.constructionTotal) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type?.building) continue;
      this.assignConstructionWorkers(e, type);
      if (!this.assignedConstructionWorkersReady(e, type)) continue;
      e.constructionProgress = Math.min(e.constructionTotal, e.constructionProgress + AUTO_PRODUCTION_STEP);
      if (e.constructionProgress >= e.constructionTotal) this.completeConstruction(e, type);
    }
  }

  private stepAutoProduction(): void {
    const producers = [...this.entities.values()]
      .filter((e) => e.producer && this.rules.units.get(e.typeId)?.domain === 'building')
      .sort((a, b) => a.id - b.id);
    for (const building of producers) this.stepProducer(building);
  }

  private stepProducer(building: Entity): void {
    const producer = building.producer;
    const player = this.players.get(building.owner);
    if (!producer || !producer.enabled || !player || player.defeated || building.hp <= 0 || !this.isConstructionComplete(building)) return;

    const activeTypeId = producer.paidTypeId ?? producer.typeId;
    let type = this.rules.units.get(activeTypeId);
    if (!type || !this.isValidProducerChoice(building.owner, building, activeTypeId)) {
      const fallback = defaultProducerUnit(building.typeId, player.side);
      if (!fallback || !this.isValidProducerChoice(building.owner, building, fallback)) return;
      producer.typeId = fallback;
      producer.progress = 0;
      producer.paidTypeId = null;
      type = this.rules.units.get(fallback)!;
    }
    if (this.isTypeCapacityFull(building.owner, type)) return;

    if (!producer.paidTypeId) {
      producer.paidTypeId = type.id;
      producer.progress = 0;
    }

    producer.progress += AUTO_PRODUCTION_STEP;
    if (producer.progress < type.buildTime) return;
    if (!this.spawnFromProducer(building, type)) {
      producer.progress = type.buildTime;
      return;
    }
    producer.progress = 0;
    producer.paidTypeId = null;
  }

  private spawnFromProducer(building: Entity, type: UnitType): boolean {
    if (this.isTypeCapacityFull(building.owner, type)) return false;
    const exit = building.producerExit;
    const aircraftAnchor = type.domain === 'aircraft' ? this.airProducerAnchor(building) : null;
    let spawn: { x: number; y: number } | null;
    if (aircraftAnchor) {
      spawn = this.findFreeUnitSlotNear(aircraftAnchor.x, aircraftAnchor.y, type.domain, 8) ?? aircraftAnchor;
    } else {
      if (!exit) return false;
      spawn = this.findFreeUnitSlotNear(exit.x, exit.y, type.domain, 6, -1, true) ?? exit;
    }
    const unit = this.makeEntity(building.owner, type, cellToLepton(spawn.x), cellToLepton(spawn.y));
    const rally = building.rallyX >= 0 && building.rallyY >= 0 ? { x: building.rallyX, y: building.rallyY } : null;
    const disperse = exit ? this.findFreeUnitSlotNear(exit.x, exit.y + 1, type.domain, 8, unit.id) : null;
    const rallySlot = rally ? this.findFreeUnitSlotNear(rally.x, rally.y, type.domain, 12, unit.id) ?? rally : null;
    const moveDest = aircraftAnchor ? rallySlot : (rallySlot ?? disperse);
    const loiterDest = aircraftAnchor ? (rallySlot ?? aircraftAnchor) : null;
    if (loiterDest) this.setAircraftLoiter(unit, loiterDest.x, loiterDest.y);
    if (moveDest && (moveDest.x !== unit.cellX || moveDest.y !== unit.cellY)) this.orderMove(unit, moveDest.x, moveDest.y);
    return true;
  }

  private airProducerAnchor(building: Entity): { x: number; y: number } {
    const b = this.rules.units.get(building.typeId)?.building;
    const x = b ? building.cellX + Math.floor(b.footprintW / 2) : building.cellX;
    const y = b ? building.cellY + b.footprintH + 1 : building.cellY + 1;
    return {
      x: Math.max(0, Math.min(this.terrain.width - 1, x)),
      y: Math.max(0, Math.min(this.terrain.height - 1, y)),
    };
  }

  private findFreeUnitSlotNear(
    cx: number,
    cy: number,
    domain: UnitType['domain'],
    maxR: number,
    ignoreId = -1,
    allowReservedExit = false,
  ): { x: number; y: number } | null {
    const taken = this.unitSlotKeys(domain, ignoreId);
    const tryCell = (x: number, y: number): { x: number; y: number } | null => {
      if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return null;
      if (domain !== 'aircraft' && this.isCellBlocked(x, y)) return null;
      if (!allowReservedExit && domain !== 'aircraft' && this.reservedProducerExits.has(y * this.terrain.width + x)) return null;
      if (taken.has(y * this.terrain.width + x)) return null;
      return { x, y };
    };
    const center = tryCell(cx, cy);
    if (center) return center;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const cell = tryCell(cx + dx, cy + dy);
          if (cell) return cell;
        }
      }
    }
    return null;
  }

  private unitSlotKeys(domain: UnitType['domain'], ignoreId: number): Set<number> {
    const taken = new Set<number>();
    const wantsAir = domain === 'aircraft';
    for (const e of this.entities.values()) {
      if (e.id === ignoreId) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type || type.domain === 'building') continue;
      if ((type.domain === 'aircraft') !== wantsAir) continue;
      taken.add(e.cellY * this.terrain.width + e.cellX);
      if (e.goal) taken.add(e.goal.y * this.terrain.width + e.goal.x);
    }
    return taken;
  }

  private stepRepair(): void {
    if (this.tick % REPAIR_INTERVAL !== 0) return;
    for (const e of this.entities.values()) {
      if (!e.repairing) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type?.building) {
        e.repairing = false;
        continue;
      }
      if (!this.isConstructionComplete(e)) {
        e.repairing = false;
        continue;
      }
      if (e.hp >= e.maxHp) {
        e.repairing = false;
        continue;
      }
      // 每次回血 maxHp/40；金钱系统已下线，维修不再扣费。
      const heal = Math.max(1, Math.ceil(e.maxHp / 40));
      e.hp = Math.min(e.maxHp, e.hp + heal);
      if (e.hp >= e.maxHp) e.repairing = false; // 修满即停
    }
  }

  // ───────────────────────── 建筑放置 ─────────────────────────

  canPlace(owner: number, type: UnitType, cellX: number, cellY: number): boolean {
    const b = type.building;
    if (!b) return false;
    if (this.isCapacityFull(owner, 'building')) return false;
    if (!this.hasWorker(owner)) return false;
    for (let dy = 0; dy < b.footprintH; dy++) {
      for (let dx = 0; dx < b.footprintW; dx++) {
        const cx = cellX + dx;
        const cy = cellY + dy;
        if (cx < 0 || cy < 0 || cx >= this.terrain.width || cy >= this.terrain.height) return false;
        if (!this.terrain.passable(cx, cy)) return false;
        if (this.occupied.has(cy * this.terrain.width + cx)) return false;
        if (this.reservedProducerExits.has(cy * this.terrain.width + cx)) return false;
      }
    }
    if (this.needsGroundProducerExit(type) && !this.findProducerExit(type, cellX, cellY)) return false;
    return true;
  }

  private needsGroundProducerExit(type: UnitType): boolean {
    const domain = producerDomain(type.id);
    return domain === 'infantry' || domain === 'vehicle';
  }

  private findProducerExit(type: UnitType, cellX: number, cellY: number): { x: number; y: number } | null {
    const b = type.building;
    if (!b || !this.needsGroundProducerExit(type)) return null;
    const candidates: { x: number; y: number }[] = [];
    const centerX = cellX + Math.floor(b.footprintW / 2);
    candidates.push({ x: centerX, y: cellY + b.footprintH });
    for (let dx = 0; dx < b.footprintW; dx++) candidates.push({ x: cellX + dx, y: cellY + b.footprintH });
    for (let dy = 0; dy < b.footprintH; dy++) candidates.push({ x: cellX + b.footprintW, y: cellY + dy });
    for (let dy = 0; dy < b.footprintH; dy++) candidates.push({ x: cellX - 1, y: cellY + dy });
    for (let dx = 0; dx < b.footprintW; dx++) candidates.push({ x: cellX + dx, y: cellY - 1 });
    for (const c of candidates) {
      if (this.canReserveProducerExit(c.x, c.y)) return c;
    }
    return null;
  }

  private canReserveProducerExit(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return false;
    const key = y * this.terrain.width + x;
    return this.terrain.passable(x, y) && !this.occupied.has(key) && !this.reservedProducerExits.has(key);
  }

  placeBuilding(owner: number, typeId: string, cellX: number, cellY: number): Entity | null {
    const type = this.rules.units.get(typeId);
    if (!type || type.domain !== 'building') return null;
    const q = this.queueFor(owner, 'building');
    // 必须是队首已就绪的该建筑
    if (!q || !q.readyToPlace || q.items[0] !== typeId) return null;
    if (!this.canPlace(owner, type, cellX, cellY)) return null;
    if (!this.players.has(owner)) return null;
    const e = this.placeBuildingEntity(owner, type, cellX, cellY, { underConstruction: true });
    q.items.shift();
    q.progress = 0;
    q.readyToPlace = q.items.length > 0;
    return e;
  }

  private placeBuildingEntity(owner: number, type: UnitType, cellX: number, cellY: number, options: { underConstruction?: boolean } = {}): Entity {
    const b = type.building!;
    const cx = cellX + b.footprintW / 2;
    const cy = cellY + b.footprintH / 2;
    const e = this.makeEntity(owner, type, Math.round(cellToLepton(cellX) + ((b.footprintW - 1) * 256) / 2), Math.round(cellToLepton(cellY) + ((b.footprintH - 1) * 256) / 2));
    e.cellX = cellX;
    e.cellY = cellY;
    void cx;
    void cy;
    const player = this.players.get(owner);
    if (player) player.everBuilt = true;
    for (let dy = 0; dy < b.footprintH; dy++) {
      for (let dx = 0; dx < b.footprintW; dx++) {
        this.occupied.set((cellY + dy) * this.terrain.width + (cellX + dx), e.id);
      }
    }
    if (options.underConstruction && type.buildTime > 0) {
      e.constructionProgress = 0;
      e.constructionTotal = type.buildTime;
      this.reserveProducerExit(e, type);
      this.assignConstructionWorkers(e, type);
    } else {
      this.completeConstruction(e, type);
    }
    return e;
  }

  private completeConstruction(e: Entity, type: UnitType): void {
    e.constructionProgress = e.constructionTotal;
    this.releaseConstructionWorkers(e.id);
    this.initProducer(e, type);
    const b = type.building;
    if (b?.freeHarvester) {
      const hx = Math.min(e.cellX + b.footprintW, this.terrain.width - 1);
      this.makeEntity(e.owner, this.rules.units.get('harvester')!, cellToLepton(hx), cellToLepton(e.cellY + 1));
    }
  }

  private assignConstructionWorkers(site: Entity, type: UnitType): void {
    const assignedCount = [...this.entities.values()].filter((e) => e.constructionTargetId === site.id).length;
    if (assignedCount >= CONSTRUCTION_WORKER_COUNT) return;
    const slots = this.constructionWorkerSlots(site, type, CONSTRUCTION_WORKER_COUNT).slice(assignedCount);
    if (slots.length === 0) return;
    const workers = [...this.entities.values()]
      .filter((e) => e.owner === site.owner && e.typeId === 'worker' && e.constructionTargetId === null)
      .sort((a, b) => {
        const da = dist(a.x - site.x, a.y - site.y);
        const db = dist(b.x - site.x, b.y - site.y);
        return da - db || a.id - b.id;
      })
      .slice(0, slots.length);
    workers.forEach((worker, index) => {
      const slot = slots[index]!;
      worker.constructionTargetId = site.id;
      worker.targetId = null;
      worker.groundTargetX = null;
      worker.groundTargetY = null;
      worker.attackMove = false;
      worker.attackDest = null;
      worker.attackTargetId = null;
      worker.patrol = null;
      worker.enterTarget = null;
      this.orderMove(worker, slot.x, slot.y);
    });
  }

  private assignedConstructionWorkersReady(site: Entity, type: UnitType): boolean {
    const assigned = [...this.entities.values()].filter((e) => e.owner === site.owner && e.typeId === 'worker' && e.constructionTargetId === site.id);
    if (assigned.length === 0) return false;
    const slots = new Set(this.constructionWorkerSlots(site, type, CONSTRUCTION_WORKER_COUNT).map((slot) => slot.y * this.terrain.width + slot.x));
    return assigned.every((worker) => slots.has(worker.cellY * this.terrain.width + worker.cellX));
  }

  private constructionWorkerSlots(site: Entity, type: UnitType, count: number): { x: number; y: number }[] {
    const b = type.building;
    if (!b || count <= 0) return [];
    const out: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const tryAdd = (x: number, y: number): void => {
      if (out.length >= count) return;
      if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return;
      if (this.isCellBlocked(x, y)) return;
      const key = y * this.terrain.width + x;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ x, y });
    };
    const centerX = site.cellX + Math.floor(b.footprintW / 2);
    tryAdd(centerX, site.cellY + b.footprintH);
    for (let dx = 0; dx < b.footprintW; dx++) tryAdd(site.cellX + dx, site.cellY + b.footprintH);
    for (let dy = 0; dy < b.footprintH; dy++) tryAdd(site.cellX + b.footprintW, site.cellY + dy);
    for (let dy = 0; dy < b.footprintH; dy++) tryAdd(site.cellX - 1, site.cellY + dy);
    for (let dx = 0; dx < b.footprintW; dx++) tryAdd(site.cellX + dx, site.cellY - 1);
    for (let r = 2; out.length < count && r <= 6; r++) {
      for (let dy = -r; dy <= b.footprintH - 1 + r && out.length < count; dy++) {
        for (let dx = -r; dx <= b.footprintW - 1 + r && out.length < count; dx++) {
          const onRing = dx === -r || dy === -r || dx === b.footprintW - 1 + r || dy === b.footprintH - 1 + r;
          if (onRing) tryAdd(site.cellX + dx, site.cellY + dy);
        }
      }
    }
    return out;
  }

  private releaseConstructionWorkers(siteId: number): void {
    for (const e of this.entities.values()) {
      if (e.constructionTargetId === siteId) e.constructionTargetId = null;
    }
  }

  private clearConstructionTarget(e: Entity): void {
    e.constructionTargetId = null;
  }

  private reserveProducerExit(e: Entity, type: UnitType): void {
    if (!this.needsGroundProducerExit(type) || e.producerExit) return;
    const exit = this.findProducerExit(type, e.cellX, e.cellY);
    if (exit) {
      e.producerExit = exit;
      this.reservedProducerExits.set(exit.y * this.terrain.width + exit.x, e.id);
    }
  }

  private initProducer(e: Entity, type: UnitType): void {
    const player = this.players.get(e.owner);
    const defaultType = player ? defaultProducerUnit(type.id, player.side) : null;
    if (!defaultType) return;
    e.producer = { enabled: true, typeId: defaultType, progress: 0, paidTypeId: null };
    this.reserveProducerExit(e, type);
  }

  private removeBuildingOccupancy(e: Entity): void {
    const type = this.rules.units.get(e.typeId);
    if (!type?.building) return;
    this.releaseConstructionWorkers(e.id);
    for (let dy = 0; dy < type.building.footprintH; dy++) {
      for (let dx = 0; dx < type.building.footprintW; dx++) {
        const key = (e.cellY + dy) * this.terrain.width + (e.cellX + dx);
        if (this.occupied.get(key) === e.id) this.occupied.delete(key);
      }
    }
    if (e.producerExit) {
      const key = e.producerExit.y * this.terrain.width + e.producerExit.x;
      if (this.reservedProducerExits.get(key) === e.id) this.reservedProducerExits.delete(key);
      e.producerExit = null;
    }
  }

  // ───────────────────────── 寻路 / 移动 ─────────────────────────

  private isCellBlocked(x: number, y: number): boolean {
    return !this.terrain.passable(x, y) || this.occupied.has(y * this.terrain.width + x);
  }

  /** 返回 (cx,cy) 或其最近的可通行+未占用格（环形扩展），找不到返回 null。 */
  passableNear(cx: number, cy: number, maxR = 10): { x: number; y: number } | null {
    if (cx >= 0 && cy >= 0 && cx < this.terrain.width && cy < this.terrain.height && !this.isCellBlocked(cx, cy)) {
      return { x: cx, y: cy };
    }
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) continue;
          if (!this.isCellBlocked(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  /** 为 n 个单位在 (cx,cy) 周围取 n 个互不相同的可通行格（队形展开，避免挤成一坨、
   *  互相挡路）。中心优先、按环形从内向外扩展；空间不足时用中心兜底。确定性遍历。 */
  private spreadDestinations(cx: number, cy: number, n: number, spacing = 1, ignoreGroundBlockers = false): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const tryAdd = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return;
      if (ignoreGroundBlockers ? !this.terrain.passable(x, y) : this.isCellBlocked(x, y)) return;
      const key = y * this.terrain.width + x;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ x, y });
    };
    tryAdd(cx, cy);
    for (let r = spacing; out.length < n && r <= 12 * spacing; r += spacing) {
      for (let dy = -r; dy <= r && out.length < n; dy += spacing) {
        for (let dx = -r; dx <= r && out.length < n; dx += spacing) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          tryAdd(cx + dx, cy + dy);
        }
      }
    }
    const fallback = out[0] ?? { x: cx, y: cy };
    while (out.length < n) out.push(fallback);
    return out;
  }

  private aircraftAttackDestinations(target: Entity, attackerType: UnitType, attackers: Entity[]): { x: number; y: number }[] {
    const targetType = this.rules.units.get(target.typeId);
    const weapon = targetType ? this.weaponForTarget(attackerType, targetType) : null;
    if (weapon && this.usesAircraftBombRun(attackerType, target, weapon)) return this.aircraftBombOrbitDestinations(target, attackers);
    const count = attackers.length;
    const range = weapon?.range ?? 2 * 256;
    const missile = weapon?.role === 'missile';
    const center = { x: leptonToCell(target.x), y: leptonToCell(target.y) };
    const maxRadius = Math.max(1, Math.floor(range / 256));
    const minRadius = missile ? Math.max(1, Math.floor(maxRadius * 0.68)) : 1;
    if (missile) {
      const slots = this.aircraftMissileAttackDestinations(center.x, center.y, count, Math.max(10, maxRadius - 2));
      if (slots.length >= count) return slots;
    }
    const candidates: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const tryAdd = (x: number, y: number): void => {
      if (x < 0 || y < 0 || x >= this.terrain.width || y >= this.terrain.height) return;
      if (!this.terrain.passable(x, y)) return;
      const key = y * this.terrain.width + x;
      if (seen.has(key)) return;
      const d = dist(cellToLepton(x) - target.x, cellToLepton(y) - target.y);
      if (d > range) return;
      seen.add(key);
      candidates.push({ x, y });
    };

    for (let r = missile ? maxRadius : 1; missile ? r >= minRadius : r <= maxRadius; missile ? r-- : r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          tryAdd(center.x + dx, center.y + dy);
        }
      }
    }

    if (candidates.length === 0) candidates.push(center);
    const preferredSpacing = missile ? 7 : 3;
    const selected: { x: number; y: number }[] = [];
    const selectedKeys = new Set<number>();
    const addSpaced = (minSpacing: number): void => {
      for (const c of candidates) {
        if (selected.length >= count) return;
        const key = c.y * this.terrain.width + c.x;
        if (selectedKeys.has(key)) continue;
        if (selected.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < minSpacing)) continue;
        selected.push(c);
        selectedKeys.add(key);
      }
    };

    addSpaced(preferredSpacing);
    if (selected.length < count && preferredSpacing > 2) addSpaced(2);
    if (selected.length < count) addSpaced(1);

    const fallback = selected[0] ?? candidates[0]!;
    while (selected.length < count) selected.push(fallback);
    return selected;
  }

  private aircraftBombOrbitDestinations(target: Entity, attackers: Entity[]): { x: number; y: number }[] {
    if (attackers.length === 0) return [];
    const center = { x: leptonToCell(target.x), y: leptonToCell(target.y) };
    const candidates: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const maxRadius = 4;
    const tryAdd = (x: number, y: number): void => {
      const slot = this.passableAirNear(x, y, 2);
      if (!slot) return;
      const key = slot.y * this.terrain.width + slot.x;
      if (seen.has(key)) return;
      if (Math.hypot(slot.x - center.x, slot.y - center.y) > maxRadius) return;
      seen.add(key);
      candidates.push(slot);
    };

    for (let r = maxRadius; r >= 0; r--) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          tryAdd(center.x + dx, center.y + dy);
        }
      }
    }

    const selected: { x: number; y: number }[] = [];
    const selectedKeys = new Set<number>();
    const addSpaced = (minSpacing: number): void => {
      for (const c of candidates) {
        if (selected.length >= attackers.length) return;
        const key = c.y * this.terrain.width + c.x;
        if (selectedKeys.has(key)) continue;
        if (selected.some((s) => Math.hypot(s.x - c.x, s.y - c.y) < minSpacing)) continue;
        selected.push(c);
        selectedKeys.add(key);
      }
    };

    addSpaced(3);
    addSpaced(2);
    addSpaced(1);
    const fallback = selected[0] ?? center;
    while (selected.length < attackers.length) selected.push(fallback);
    return selected;
  }

  private aircraftMissileAttackDestinations(cx: number, cy: number, count: number, radius: number): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    const seen = new Set<number>();
    const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
    const phase = ((cx * 13 + cy * 7) % 360) * Math.PI / 180;
    for (let i = 0; i < count; i++) {
      let placed = false;
      for (let attempt = 0; attempt < count * 3 && !placed; attempt++) {
        const angle = phase + ((i + attempt * 0.37) / count) * Math.PI * 2;
        const x = clamp(Math.round(cx + Math.cos(angle) * radius), 0, this.terrain.width - 1);
        const y = clamp(Math.round(cy + Math.sin(angle) * radius), 0, this.terrain.height - 1);
        const slot = this.passableAirNear(x, y, 4);
        if (!slot) continue;
        const key = slot.y * this.terrain.width + slot.x;
        if (seen.has(key)) continue;
        if (out.some((s) => Math.hypot(s.x - slot.x, s.y - slot.y) < 7)) continue;
        seen.add(key);
        out.push(slot);
        placed = true;
      }
    }
    return out;
  }

  private aircraftAttackStation(e: Entity, target: Entity, range: number): { x: number; y: number } | null {
    if (e.airLoiterX < 0 || e.airLoiterY < 0) return null;
    const d = dist(cellToLepton(e.airLoiterX) - target.x, cellToLepton(e.airLoiterY) - target.y);
    return d <= range ? { x: e.airLoiterX, y: e.airLoiterY } : null;
  }

  private aircraftBombReleaseStation(e: Entity, target: Entity, weapon: WeaponSpec): { x: number; y: number } | null {
    const cx = leptonToCell(target.x);
    const cy = leptonToCell(target.y);
    const radius = Math.max(1, Math.floor(weapon.range / 256));
    const offsets: { dx: number; dy: number }[] = [{ dx: 0, dy: 0 }];
    for (let r = 1; r <= radius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          offsets.push({ dx, dy });
        }
      }
    }

    const start = e.id % offsets.length;
    for (let i = 0; i < offsets.length; i++) {
      const offset = offsets[(start + i) % offsets.length]!;
      const slot = this.passableAirNear(cx + offset.dx, cy + offset.dy, 1);
      if (!slot) continue;
      const d = dist(cellToLepton(slot.x) - target.x, cellToLepton(slot.y) - target.y);
      if (d <= weapon.range) return slot;
    }
    return this.passableAirNear(cx, cy, radius);
  }

  private aircraftMissileStandoffDistance(type: UnitType, weapon: WeaponSpec): number {
    return type.domain === 'aircraft' && weapon.role === 'missile' ? 8 * 256 : 0;
  }

  private aircraftStandoffStation(e: Entity, target: Entity, weapon: WeaponSpec): { x: number; y: number } | null {
    const maxCells = Math.max(1, Math.floor(weapon.range / 256));
    const desiredCells = Math.max(8, maxCells - 2);
    const dx = e.x - target.x;
    const dy = e.y - target.y;
    const length = dist(dx, dy);
    const angle = length > 1 ? Math.atan2(dy, dx) : ((e.id * 137) % 360) * Math.PI / 180;
    const cx = leptonToCell(target.x + Math.cos(angle) * desiredCells * 256);
    const cy = leptonToCell(target.y + Math.sin(angle) * desiredCells * 256);
    return this.passableAirNear(cx, cy, 6);
  }

  private passableAirNear(cx: number, cy: number, maxR = 6): { x: number; y: number } | null {
    const ok = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < this.terrain.width && y < this.terrain.height && this.terrain.passable(x, y);
    if (ok(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cx + dx;
          const y = cy + dy;
          if (ok(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  private allAircraft(ids: number[]): boolean {
    if (ids.length === 0) return false;
    for (const id of ids) {
      const e = this.entities.get(id);
      const type = e && this.rules.units.get(e.typeId);
      if (type?.domain !== 'aircraft') return false;
    }
    return true;
  }

  private setAircraftLoiter(e: Entity, cellX: number, cellY: number): void {
    const type = this.rules.units.get(e.typeId);
    if (type?.domain !== 'aircraft') return;
    e.airLoiterX = cellX;
    e.airLoiterY = cellY;
  }

  private orderMove(e: Entity, cellX: number, cellY: number): void {
    const type = this.rules.units.get(e.typeId);
    if (type?.deployTime) {
      e.deployed = false;
      e.deployTimer = 0;
    }
    const canFly = type?.domain === 'aircraft';
    const grid: PathGrid = {
      width: this.terrain.width,
      height: this.terrain.height,
      passable: (x, y) => (canFly ? this.terrain.passable(x, y) : !this.isCellBlocked(x, y)),
    };
    const path = findPath(grid, leptonToCell(e.x), leptonToCell(e.y), cellX, cellY);
    e.goal = { x: cellX, y: cellY };
    e.path = path ? path.reverse() : [];
    e.waypoint = null;
  }

  private stepMovement(e: Entity, type: UnitType): void {
    if (type.domain === 'building') return;
    if (type.deployTime && (e.goal || e.waypoint || e.path.length > 0)) {
      e.deployed = false;
      e.deployTimer = 0;
    }
    if (!e.waypoint) {
      const next = e.path.pop();
      if (!next) {
        // 攻击移动/巡逻的续行与折返由 stepAggressiveMarch 统一负责，这里不擅自结束
        if (e.attackMove && (e.attackDest || e.patrol)) return;
        e.goal = null;
        e.attackMove = false; // 普通移动抵达目的地
        e.attackTargetId = null;
        return;
      }
      e.waypoint = { x: cellToLepton(next.x), y: cellToLepton(next.y) };
    }
    const dx = e.waypoint.x - e.x;
    const dy = e.waypoint.y - e.y;
    const target = dirToBangle(dx, dy);
    e.facing = turnToward(e.facing, target, type.rot);
    const diff = ((target - e.facing + 128) & 0xff) - 128;
    if (Math.abs(diff) > 32) return;
    const d = dist(dx, dy);
    if (d <= type.speed) {
      e.x = e.waypoint.x;
      e.y = e.waypoint.y;
      e.cellX = leptonToCell(e.x);
      e.cellY = leptonToCell(e.y);
      e.waypoint = null;
      return;
    }
    const v = velocity(e.facing, type.speed);
    e.x += v.dx;
    e.y += v.dy;
    e.cellX = leptonToCell(e.x);
    e.cellY = leptonToCell(e.y);
  }

  // ───────────────────────── 采矿 ─────────────────────────

  private findNearest(
    fromX: number,
    fromY: number,
    pred: (e: Entity) => boolean,
  ): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities.values()) {
      if (!pred(e)) continue;
      const d = dist(e.x - fromX, e.y - fromY);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private findNearestOreCell(fromX: number, fromY: number): { x: number; y: number } | null {
    const cx = leptonToCell(fromX);
    const cy = leptonToCell(fromY);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    // 半径扩展搜索（确定性：固定遍历顺序）
    for (let y = 0; y < this.terrain.height; y++) {
      for (let x = 0; x < this.terrain.width; x++) {
        if (this.ore[y * this.terrain.width + x]! <= 0) continue;
        const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return best;
  }

  private stepHarvester(e: Entity, type: UnitType): void {
    const h = e.harvester!;
    switch (h.mode) {
      case 'seek': {
        if (e.goal || e.waypoint) break; // 有手动目的地：先去，到了（goal 清空）再自找最近矿
        const ore = this.findNearestOreCell(e.x, e.y);
        if (ore) {
          this.orderMove(e, ore.x, ore.y);
          h.mode = 'toOre';
        }
        break;
      }
      case 'toOre': {
        if (!e.goal && !e.waypoint) {
          // 抵达：若脚下有矿则采，否则重找
          h.mode = this.oreAt(e.cellX, e.cellY) > 0 ? 'harvest' : 'seek';
        }
        break;
      }
      case 'harvest': {
        if (h.timer++ < HARVEST_TICKS) break;
        h.timer = 0;
        const cellOre = this.oreAt(e.cellX, e.cellY);
        if (cellOre <= 0 || h.load >= HARVEST_CAPACITY) {
          h.mode = h.load >= HARVEST_CAPACITY ? 'toRefinery' : 'seek';
          if (h.mode === 'toRefinery') this.routeToRefinery(e);
          break;
        }
        const take = Math.min(HARVEST_RATE, cellOre, HARVEST_CAPACITY - h.load);
        this.ore[e.cellY * this.terrain.width + e.cellX] = (cellOre - take) as number;
        h.load += take;
        if (h.load >= HARVEST_CAPACITY) {
          h.mode = 'toRefinery';
          this.routeToRefinery(e);
        }
        break;
      }
      case 'toRefinery': {
        if (!e.goal && !e.waypoint) h.mode = 'unload';
        break;
      }
      case 'unload': {
        h.load = 0;
        h.mode = 'seek';
        break;
      }
    }
    void type;
  }

  /** 工程师 FSM：前往目标建筑，贴近（移动结束）即进入——己方满血修复、敌方占领，
   *  随后工程师被消耗。返回 true 表示本帧已进入并消耗（跳过其余处理）。 */
  private stepEngineer(e: Entity): boolean {
    const tgt = e.enterTarget !== null ? this.entities.get(e.enterTarget) : null;
    const tt = tgt && this.rules.units.get(tgt.typeId);
    if (!tgt || !tt?.building || this.players.get(tgt.owner)?.defeated) {
      e.enterTarget = null;
      return false;
    }
    // 仍在路上：交给 stepMovement 推进，本帧不进入
    if (e.goal || e.waypoint || e.path.length > 0) return false;
    // 抵达停靠点 → 进入建筑
    if (tgt.owner === e.owner) {
      tgt.hp = tgt.maxHp; // 己方：满血修复
    } else {
      tgt.owner = e.owner; // 敌方：占领（连同其修理状态/集结点归零）
      tgt.repairing = false;
      tgt.rallyX = -1;
      tgt.rallyY = -1;
    }
    this.entities.delete(e.id); // 工程师消耗（渲染器对工程师消失不播死亡爆炸）
    return true;
  }

  private routeToRefinery(e: Entity): void {
    const refinery = this.findNearest(e.x, e.y, (o) =>
      o.owner === e.owner && this.rules.units.get(o.typeId)?.building?.refinery === true,
    );
    if (refinery) {
      const dock = this.passableNear(refinery.cellX, refinery.cellY + 1) ?? { x: refinery.cellX, y: refinery.cellY + 1 };
      this.orderMove(e, dock.x, dock.y);
    } else {
      e.harvester!.mode = 'seek'; // 没精炼厂就先囤着
    }
  }

  // ───────────────────────── 战斗 ─────────────────────────

  /** 返回 true 表示正在交火（本 tick 应暂停移动）。 */
  /** 索敌（带目标优先级，让单位"不傻"）：在射程/警戒半径内按优先级挑目标——
   *  先打能威胁我的武装单位 > 其它单位 > 建筑；同档优先残血者（自发集火补刀）；
   *  再近者，再 id 小（确定性）。非建筑单位用警戒半径主动迎击（超射程也上前，
   *  靠追击带进射程）；敌"建筑"仅在非攻击移动时受武器射程约束——空闲单位不会
   *  自发跑去拆远处建筑，攻击移动/巡逻则一并清理。 */
  private hasWeapon(type: UnitType): boolean {
    return !!(type.weapon || type.antiAirWeapon);
  }

  private weaponCanTarget(weapon: WeaponSpec, domain: Domain): boolean {
    return this.targetDomainsCanTarget(weapon.targetDomains, domain);
  }

  private targetDomainsCanTarget(targetDomains: readonly Domain[] | undefined, domain: Domain): boolean {
    return targetDomains ? targetDomains.includes(domain) : domain !== 'aircraft';
  }

  private weaponForTarget(type: UnitType, targetType: UnitType): WeaponSpec | null {
    const weapons = [type.antiAirWeapon, type.weapon].filter((weapon): weapon is WeaponSpec => !!weapon);
    return weapons.find((weapon) => this.weaponCanTarget(weapon, targetType.domain)) ?? null;
  }

  private weaponRoleFor(type: UnitType, weapon: WeaponSpec): WeaponRole {
    if (weapon.role) return weapon.role;
    if (weapon.projectileSpeed <= 0) return 'gun';
    return type.domain === 'aircraft' ? 'bomb' : 'cannon';
  }

  private isAircraftBombWeapon(type: UnitType, weapon: WeaponSpec): boolean {
    return type.domain === 'aircraft' && this.weaponRoleFor(type, weapon) === 'bomb';
  }

  private usesAircraftBombRun(type: UnitType, target: Entity, weapon: WeaponSpec): boolean {
    const targetDomain = this.rules.units.get(target.typeId)?.domain;
    return this.isAircraftBombWeapon(type, weapon) && targetDomain !== undefined && targetDomain !== 'aircraft';
  }

  private effectiveWeaponRange(type: UnitType, e: Entity, target: Entity, weapon: WeaponSpec): number {
    if (this.isAircraftBombWeapon(type, weapon)) return Math.max(weapon.range, 4 * 256);
    void e;
    void target;
    return weapon.range;
  }

  private acquireRangeForWeapon(type: UnitType, e: Entity, weapon: WeaponSpec, targetIsBuilding: boolean, onMission: boolean): number {
    if (targetIsBuilding && !onMission) return weapon.range;
    if (type.domain === 'building') return weapon.range;
    if (!onMission && e.stance === 'holdground') return weapon.range;
    if (!onMission && e.stance === 'aggressive') return Math.max(weapon.range, 2 * GUARD_RANGE);
    return Math.max(weapon.range, GUARD_RANGE);
  }

  private maxAcquireRange(type: UnitType, e: Entity, onMission: boolean): number {
    let maxRange = 0;
    const weapons = [type.antiAirWeapon, type.weapon].filter((weapon): weapon is WeaponSpec => !!weapon);
    for (const weapon of weapons) {
      maxRange = Math.max(
        maxRange,
        this.acquireRangeForWeapon(type, e, weapon, false, onMission),
        this.acquireRangeForWeapon(type, e, weapon, true, onMission),
      );
    }
    return maxRange;
  }

  private combatCandidatesNear(e: Entity, type: UnitType, onMission: boolean): Iterable<Entity> {
    const radius = this.maxAcquireRange(type, e, onMission);
    if (radius <= 0) return [];
    return this.combatSpatialIndex?.nearby(e.x, e.y, radius) ?? this.entities.values();
  }

  private acquireEnemy(e: Entity, type: UnitType): Entity | null {
    const onMission = e.attackMove; // 攻击移动/巡逻：无视姿态，强制按警戒半径交战
    if (!onMission && e.stance === 'holdfire') return null; // 不还火：不自动索敌
    // 姿态决定索敌半径：坚守=仅武器射程；进攻=更大半径主动出击；其余=警戒半径
    if (!this.hasWeapon(type)) return null;
    let best: Entity | null = null;
    let bestRank = 0;
    let bestHp = 0;
    let bestD = 0;
    for (const o of this.combatCandidatesNear(e, type, onMission)) {
      if (!this.entities.has(o.id)) continue;
      if (o.owner === e.owner || this.players.get(o.owner)?.defeated) continue;
      const ot = this.rules.units.get(o.typeId);
      if (!ot) continue;
      const isBuilding = ot.domain === 'building';
      const weapon = this.weaponForTarget(type, ot);
      if (!weapon) continue;
      const range = this.acquireRangeForWeapon(type, e, weapon, isBuilding, onMission);
      const d = dist(o.x - e.x, o.y - e.y);
      if (d > range) continue;
      const rank = isBuilding ? 1 : this.hasWeapon(ot) ? 3 : 2; // 武装单位 > 无武装单位 > 建筑
      // 同档：残血优先（集火），再近，再 id 小
      const better =
        best === null ||
        rank > bestRank ||
        (rank === bestRank && (o.hp < bestHp || (o.hp === bestHp && (d < bestD || (d === bestD && o.id < best.id)))));
      if (better) {
        best = o;
        bestRank = rank;
        bestHp = o.hp;
        bestD = d;
      }
    }
    return best;
  }

  private attackMoveFinalTarget(e: Entity, type: UnitType): Entity | null {
    if (e.attackTargetId === null) return null;
    const target = this.entities.get(e.attackTargetId);
    if (!target || target.owner === e.owner || this.players.get(target.owner)?.defeated) {
      e.attackTargetId = null;
      return null;
    }
    const targetType = this.rules.units.get(target.typeId);
    if (!targetType || !this.weaponForTarget(type, targetType)) {
      e.attackTargetId = null;
      return null;
    }
    return target;
  }

  private stepGroundAttack(e: Entity, type: UnitType): boolean {
    const weapon = type.weapon;
    if (!weapon || e.groundTargetX === null || e.groundTargetY === null) return false;
    const dx = e.groundTargetX - e.x;
    const dy = e.groundTargetY - e.y;
    const d = dist(dx, dy);
    if (weapon.minRange !== undefined && d < weapon.minRange) {
      e.path = [];
      e.waypoint = null;
      e.goal = null;
      return true;
    }
    if (d > weapon.range) {
      if (type.domain !== 'building' && !e.goal) this.orderMove(e, leptonToCell(e.groundTargetX), leptonToCell(e.groundTargetY));
      return false;
    }

    e.path = [];
    e.waypoint = null;
    e.goal = null;

    const aim = dirToBangle(dx, dy);
    if (type.rot > 0) {
      e.facing = turnToward(e.facing, aim, type.rot);
      if (Math.abs(((aim - e.facing + 128) & 0xff) - 128) > 8) return true;
    }
    if (!this.readyToFireAfterDeploy(e, type)) return true;
    if (e.cooldown <= 0) {
      this.fireGround(e, e.groundTargetX, e.groundTargetY, type, weapon);
      e.cooldown = weapon.cooldown;
    }
    return true;
  }

  private stepCombat(e: Entity, type: UnitType): boolean {
    if (!this.hasWeapon(type)) return false;
    if (e.cooldown > 0) e.cooldown--;
    if (e.groundTargetX !== null && e.groundTargetY !== null) return this.stepGroundAttack(e, type);

    let target: Entity | undefined;
    if (e.attackMove) {
      // 攻击移动/巡逻：每帧锁定射程/警戒内最近的敌人——逐个停下歼灭挡路之敌，
      // 打完（目标消失/驶离警戒）再据 attackDest 续行或折返。
      // TEL 不参与自动索敌（仅玩家显式指定目标才开火）
      target = (type.deployTime ? null : this.acquireEnemy(e, type)) ?? this.attackMoveFinalTarget(e, type) ?? undefined;
      e.targetId = target ? target.id : null;
    } else {
      // 显式攻击：紧咬指定目标；空闲（无目的地）：警戒索敌被动自卫。
      // TEL 仅攻击玩家显式指定的目标，不自动索敌也不被动还击
      target = e.targetId !== null ? this.entities.get(e.targetId) : undefined;
      if (target && (target.owner === e.owner || this.players.get(target.owner)?.defeated)) target = undefined;
      if (!target && !e.goal && !type.deployTime) target = this.acquireEnemy(e, type) ?? undefined;
      e.targetId = target ? target.id : null;
    }

    if (!target) {
      // 攻击移动/巡逻无敌可打：继续奔向终点（到点则结束/折返）
      if (e.attackMove && e.attackDest) this.stepAggressiveMarch(e);
      return false;
    }

    const targetType = this.rules.units.get(target.typeId);
    const weapon = targetType ? this.weaponForTarget(type, targetType) : null;
    if (!weapon) {
      e.targetId = null;
      if (e.attackMove && e.attackDest) this.stepAggressiveMarch(e);
      return false;
    }

    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const d = dist(dx, dy);
    const aircraftStandoff = this.aircraftMissileStandoffDistance(type, weapon);
    const bombRun = this.usesAircraftBombRun(type, target, weapon);
    const effectiveRange = this.effectiveWeaponRange(type, e, target, weapon);
    if (weapon.minRange !== undefined && d < weapon.minRange) {
      e.path = [];
      e.waypoint = null;
      e.goal = null;
      return true;
    }
    if (aircraftStandoff > 0 && d < aircraftStandoff) {
      const away = this.aircraftStandoffStation(e, target, weapon);
      if (away) {
        this.setAircraftLoiter(e, away.x, away.y);
        this.orderMove(e, away.x, away.y);
      }
      return false;
    }
    if (bombRun && e.goal) return false;
    if (d > effectiveRange) {
      // 坚守：绝不移动追击，够不着就放下目标原地待机
      if (!e.attackMove && e.stance === 'holdground') {
        e.targetId = null;
        return false;
      }
      // 够不着：上前进入射程。攻击移动暂离行军路线迎敌（attackDest 留待事后续行）；
      // 显式攻击同样追击；建筑不能动。
      if (e.attackMove ? e.path.length === 0 && !e.waypoint : type.domain !== 'building' && !e.goal) {
        const near = type.domain === 'aircraft'
          ? (bombRun ? this.aircraftBombReleaseStation(e, target, weapon) : this.aircraftAttackStation(e, target, effectiveRange)) ?? this.passableNear(target.cellX, target.cellY)
          : this.passableNear(target.cellX, target.cellY);
        if (near) {
          if (bombRun) this.setAircraftLoiter(e, near.x, near.y);
          this.orderMove(e, near.x, near.y);
        }
      }
      return false;
    }
    // 进入射程：停住、转向、开火（攻击移动也停下打完，靠 attackDest 事后续行）
    e.path = [];
    e.waypoint = null;
    e.goal = null;

    const aim = dirToBangle(dx, dy);
    if (type.rot > 0) {
      e.facing = turnToward(e.facing, aim, type.rot);
      if ((((aim - e.facing + 128) & 0xff) - 128) > 8) return true;
    }
    if (!this.readyToFireAfterDeploy(e, type)) return true;
    if (e.cooldown <= 0) {
      this.fire(e, target, type, weapon);
      e.cooldown = weapon.cooldown;
    }
    return true;
  }

  private readyToFireAfterDeploy(e: Entity, type: UnitType): boolean {
    const deployTime = type.deployTime ?? 0;
    if (deployTime <= 0) return true;
    if (e.deployed) return true;
    if (e.deployTimer <= 0) e.deployTimer = deployTime;
    e.deployTimer = Math.max(0, e.deployTimer - 1);
    if (e.deployTimer === 0) e.deployed = true;
    return e.deployed;
  }

  /** 攻击移动/巡逻在无敌情时推进：未到终点则（站定后）继续奔向终点；
   *  到终点——巡逻折返另一端，普通攻击移动则结束。 */
  private stepAggressiveMarch(e: Entity): void {
    const dest = e.attackDest!;
    if (e.cellX === dest.x && e.cellY === dest.y) {
      if (e.patrol) {
        const next = e.patrol; // 折返：刚到的点成为新的折返点
        e.patrol = e.attackDest;
        e.attackDest = next;
        this.orderMove(e, next.x, next.y);
      } else {
        e.attackMove = false;
        e.attackDest = null;
        e.attackTargetId = null;
      }
    } else if (e.path.length === 0 && !e.waypoint) {
      this.orderMove(e, dest.x, dest.y); // 刚打完站住 / 路径耗尽未到点：续行
    }
  }

  /** 老兵伤害倍率（百分比，整数）：新兵 100、老兵(≥2 杀) 125、精英(≥5 杀) 150。 */
  private vetMul(e: Entity): number {
    return e.kills >= 5 ? 150 : e.kills >= 2 ? 125 : 100;
  }

  private fire(shooter: Entity, target: Entity, shooterType: UnitType, weapon: WeaponSpec): void {
    const dmg = Math.floor((weapon.damage * this.vetMul(shooter)) / 100); // 老兵加成
    if (weapon.projectileSpeed <= 0) {
      this.applyDamage(target, dmg, weapon.warhead, weapon.splash, shooter.owner, shooter.id, weapon.targetDomains);
    } else {
      this.projectiles.push({
        id: this.nextProjectileId++,
        x: shooter.x,
        y: shooter.y,
        targetId: target.id,
        speed: weapon.projectileSpeed,
        damage: dmg,
        warheadId: JSON.stringify(weapon.warhead),
        splash: weapon.splash,
        owner: shooter.owner,
        shooterId: shooter.id,
        weaponRole: this.weaponRoleFor(shooterType, weapon),
        targetDomains: weapon.targetDomains ? [...weapon.targetDomains] : undefined,
      });
    }
  }

  private fireGround(shooter: Entity, targetX: number, targetY: number, shooterType: UnitType, weapon: WeaponSpec): void {
    const dmg = Math.floor((weapon.damage * this.vetMul(shooter)) / 100);
    if (weapon.projectileSpeed <= 0) {
      this.applyGroundDamage(targetX, targetY, dmg, weapon.warhead, weapon.splash, shooter.owner, shooter.id, weapon.targetDomains);
    } else {
      this.projectiles.push({
        id: this.nextProjectileId++,
        x: shooter.x,
        y: shooter.y,
        targetId: null,
        targetX,
        targetY,
        speed: weapon.projectileSpeed,
        damage: dmg,
        warheadId: JSON.stringify(weapon.warhead),
        splash: weapon.splash,
        owner: shooter.owner,
        shooterId: shooter.id,
        weaponRole: this.weaponRoleFor(shooterType, weapon),
        targetDomains: weapon.targetDomains ? [...weapon.targetDomains] : undefined,
      });
    }
  }

  private armorOf(e: Entity): ArmorType {
    return this.rules.units.get(e.typeId)?.armor ?? 'none';
  }

  private applyGroundDamage(
    x: number,
    y: number,
    damage: number,
    warhead: WeaponSpec['warhead'],
    splash: number,
    owner: number,
    attackerId = -1,
    targetDomains?: Domain[],
  ): void {
    const verses = this.rules.resolveVerses(warhead);
    const radius = Math.max(1, splash);
    for (const e of this.entities.values()) {
      if (e.owner === owner) continue;
      const type = this.rules.units.get(e.typeId);
      if (!type || !this.targetDomainsCanTarget(targetDomains, type.domain)) continue;
      const d = this.distanceToImpact(e, type, x, y);
      if (d > radius) continue;
      const base = splash > 0 ? Math.floor((damage * (splash - d)) / splash) : damage;
      const pct = verses[this.armorOf(e)];
      const before = e.hp;
      e.hp -= Math.max(1, Math.floor((base * pct) / 100));
      if (before > 0 && e.hp <= 0 && attackerId >= 0) {
        const killer = this.entities.get(attackerId);
        if (killer && killer.owner !== e.owner) killer.kills++;
      }
    }
  }

  private distanceToImpact(e: Entity, type: UnitType, x: number, y: number): number {
    const b = type.building;
    if (!b) return dist(e.x - x, e.y - y);
    const impactCellX = leptonToCell(x);
    const impactCellY = leptonToCell(y);
    const nearestCellX = Math.max(e.cellX, Math.min(e.cellX + b.footprintW - 1, impactCellX));
    const nearestCellY = Math.max(e.cellY, Math.min(e.cellY + b.footprintH - 1, impactCellY));
    return dist(cellToLepton(nearestCellX) - x, cellToLepton(nearestCellY) - y);
  }

  private applyDamage(
    target: Entity,
    damage: number,
    warhead: WeaponSpec['warhead'],
    splash: number,
    owner: number,
    attackerId = -1,
    targetDomains?: Domain[],
  ): void {
    const verses = this.rules.resolveVerses(warhead);
    const deal = (e: Entity, base: number): void => {
      const pct = verses[this.armorOf(e)];
      e.hp -= Math.max(1, Math.floor((base * pct) / 100));
    };
    const before = target.hp;
    deal(target, damage);
    // 击杀归属：致命一击让攻击者涨经验（升老兵/精英）；溅射误伤不计
    if (before > 0 && target.hp <= 0 && attackerId >= 0) {
      const killer = this.entities.get(attackerId);
      if (killer && killer.owner !== target.owner) killer.kills++;
    }
    // 反击：空闲的武装单位被打 → 自动还击攻击者（即便对方在远处/警戒范围外）；
    // 不还火姿态不还击；TEL 不自动还击（必须玩家显式指定目标）
    if (attackerId >= 0 && target.stance !== 'holdfire' && target.targetId === null && !target.goal && !target.attackMove) {
      const tt = this.rules.units.get(target.typeId);
      const attacker = this.entities.get(attackerId);
      const attackerType = attacker && this.rules.units.get(attacker.typeId);
      if (tt && !tt.deployTime && attackerType && this.weaponForTarget(tt, attackerType) && tt.domain !== 'building') target.targetId = attackerId;
    }
    if (splash > 0) {
      for (const e of this.entities.values()) {
        if (e.id === target.id || e.owner === owner) continue;
        const type = this.rules.units.get(e.typeId);
        if (!type || !this.targetDomainsCanTarget(targetDomains, type.domain)) continue;
        const d = dist(e.x - target.x, e.y - target.y);
        if (d <= splash) deal(e, Math.floor((damage * (splash - d)) / splash));
      }
    }
  }

  private stepProjectiles(): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const target = p.targetId === null ? null : this.entities.get(p.targetId);
      if (p.targetId !== null && !target) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const targetX = target ? target.x : p.targetX;
      const targetY = target ? target.y : p.targetY;
      if (targetX === undefined || targetY === undefined) {
        this.projectiles.splice(i, 1);
        continue;
      }
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const d = dist(dx, dy);
      if (d <= p.speed) {
        if (target) this.applyDamage(target, p.damage, JSON.parse(p.warheadId), p.splash, p.owner, p.shooterId, p.targetDomains);
        else this.applyGroundDamage(targetX, targetY, p.damage, JSON.parse(p.warheadId), p.splash, p.owner, p.shooterId, p.targetDomains);
        this.projectiles.splice(i, 1);
      } else {
        const ang = dirToBangle(dx, dy);
        const v = velocity(ang, p.speed);
        p.x += v.dx;
        p.y += v.dy;
      }
    }
  }

  private reapDead(): void {
    for (const [id, e] of this.entities) {
      if (e.hp <= 0) {
        this.removeBuildingOccupancy(e);
        this.entities.delete(id);
      }
    }
    // Defeat: workers alone do not keep a side alive; combat units do.
    for (const player of this.players.values()) {
      if (player.defeated || !player.everBuilt) continue;
      let hasBuilding = false;
      for (const e of this.entities.values()) {
        if (e.owner === player.id && this.rules.units.get(e.typeId)?.domain === 'building') {
          hasBuilding = true;
          break;
        }
      }
      if (!hasBuilding && !this.hasCombatUnit(player.id)) player.defeated = true;
    }
  }

  // ───────────────────────── tick ─────────────────────────

  step(): void {
    this.stepCombatIncome();
    this.stepProduction();
    this.stepConstruction();
    this.stepRepair();
    this.combatSpatialIndex = buildCombatSpatialIndex(this.entities.values());
    for (const e of this.entities.values()) {
      const type = this.rules.units.get(e.typeId);
      if (!type) continue;
      if (type.domain === 'building' && !this.isConstructionComplete(e)) continue;
      if (e.enterTarget !== null && this.stepEngineer(e)) continue; // 工程师进入建筑→已消耗，跳过本帧余下
      const engaging = this.stepCombat(e, type);
      if (!engaging) this.stepMovement(e, type);
    }
    this.combatSpatialIndex = null;
    this.stepProjectiles();
    this.reapDead();
    this.stepAutoProduction();
    this.tick++;
  }

  // ───────────────────────── 状态指纹 ─────────────────────────

  hash(): number {
    const h = new StateHash();
    h.addInt(this.tick);
    h.addInt(this.prng.getState());
    h.addInt(this.entities.size);
    for (const p of this.players.values()) {
      h.addInt(p.id).addInt(p.credits).addInt(p.defeated ? 1 : 0);
    }
    for (const e of this.entities.values()) {
      h.addInt(e.id).addInt(e.owner).addInt(e.x).addInt(e.y).addInt(e.facing).addInt(e.hp);
      h.addInt(e.constructionProgress).addInt(e.constructionTotal);
      h.addInt(e.harvester ? e.harvester.load : -1);
      h.addInt(e.repairing ? 1 : 0).addInt(e.rallyX).addInt(e.rallyY).addInt(e.airLoiterX).addInt(e.airLoiterY).addInt(e.enterTarget ?? -1);
      h.addInt(e.constructionTargetId ?? -1).addInt(e.attackTargetId ?? -1).addInt(e.groundTargetX ?? -1).addInt(e.groundTargetY ?? -1);
      h.addInt(e.producer ? 1 : 0)
        .addInt(e.producer?.enabled ? 1 : 0)
        .addInt(e.producer?.progress ?? -1);
      addHashString(h, e.producer?.typeId ?? '');
      addHashString(h, e.producer?.paidTypeId ?? '');
      h.addInt(e.producerExit?.x ?? -1)
        .addInt(e.producerExit?.y ?? -1);
      h.addInt(e.deployed ? 1 : 0).addInt(e.deployTimer);
    }
    h.addInt(this.projectiles.length);
    for (const p of this.projectiles) {
      h.addInt(p.id).addInt(p.x).addInt(p.y).addInt(p.targetId ?? -1).addInt(p.targetX ?? -1).addInt(p.targetY ?? -1);
      addHashString(h, p.weaponRole);
    }
    return h.value;
  }
}

export { producibleBy };
