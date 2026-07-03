/**
 * @ra2web/game —— 确定性模拟内核（客户端与服务器共享）。
 * 约定：全整数运算、查表三角、种子 PRNG、禁真实时间（ESLint 强制）。
 */
export { LEPTONS_PER_CELL, SIM_TICKS_PER_SECOND, cellToLepton, leptonToCell } from './coords';
export { FP_ONE, fpSin, fpCos, isqrt, dist, dirToBangle, turnToward, velocity } from './fixed';
export { Prng } from './prng';
export { StateHash } from './hash';
export { findPath, type PathGrid } from './pathfind';
export {
  World,
  DEFAULT_CAPACITY_LIMITS,
  categoryOf,
  producibleBy,
  type CapacitySnapshot,
  type CapacitySlot,
  type Entity,
  type Command,
  type GroundFormation,
  type Stance,
  type Player,
  type Projectile,
  type ProdCategory,
  type ProducerState,
  type ProductionQueue,
  type TerrainInfo,
  type TerrainKind,
} from './world';
export {
  DEFAULT_RULES,
  buildRules,
  type RulesData,
  type UnitType,
  type Side,
  type Domain,
  type ArmorType,
  type ArmorVerses,
  type WeaponSpec,
  type WeaponRole,
  type BuildingTraits,
} from './content';
export { runScript, gridTerrain, type ScriptedCommand, type ReplayResult } from './replay';
export {
  LockstepSession,
  type OutgoingPacket,
  type IncomingPacket,
} from './lockstep';
export {
  PROTOCOL_VERSION,
  encodeMessage,
  decodeMessage,
  type ClientMessage,
  type ServerMessage,
  type LobbyPlayer,
  type MatchConfig,
} from './protocol';
export { createWorldFromConfig } from './match';
