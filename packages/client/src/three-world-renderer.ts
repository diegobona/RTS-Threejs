import {
  AmbientLight,
  Box3,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  type Camera,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Matrix4,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Entity, WeaponRole, World, UnitType } from '@ra2web/game';
import { ThreeAudioEventTracker, type ThreeAudioEvent, type ThreeAudioSnapshot, type ThreeProjectileAudioState } from './three-audio-events';
import { cellToWorld3D, leptonToWorld3D, THREE_CELL_SIZE } from './three-coords';
import { playerColorForOwner } from './player-colors';
import { WW1_MODEL_SPECS, type Ww1ModelSpec } from './ww1-model-manifest';

interface EntityView {
  root: Group;
  visualRoot: Group;
  hpBar: Group;
  statusBar: Group;
  statusLabel: Sprite;
  selectionRing: Mesh;
}

interface CombatEffect {
  root: Group;
  life: number;
  maxLife: number;
  grow: number;
}

interface InstancedModelPart {
  mesh: InstancedMesh;
  partId: string;
  localMatrix: Matrix4;
}

interface InstancedModelBatch {
  root: Group;
  typeId: string;
  owner: number;
  capacity: number;
  ids: number[];
  parts: InstancedModelPart[];
}

export type CommandIndicatorKind3D = 'move' | 'attack';

export interface CommandIndicatorProfile3D {
  color: number;
  life: number;
  showSwords: boolean;
}

export interface CommandIndicatorTarget3D {
  footprintW?: number;
  footprintH?: number;
}

export interface CommandIndicatorTransform3D {
  ringScale: number;
  arrowOffsetZ: number;
  arrowScale: number;
  swordHeight: number;
}

export interface RallyVisualStyle3D {
  lineColor: number;
  lineShadowColor: number;
  flagColor: number;
  poleColor: number;
  baseColor: number;
  lineOpacity: number;
  flagOpacity: number;
  lineWidth: number;
  flagHeight: number;
}

export interface CombatEffectProfile3D {
  visual: 'muzzleFlash' | 'impactSpark' | 'blast';
  color: number;
  radius: number;
  height: number;
  life: number;
  sparkCount: number;
  grow: number;
}

export interface ProjectileVisualProfile3D {
  kind: 'tracer' | 'bomb';
  color: number;
}

export type FrameVisualKind3D = 'projectile' | 'tracer' | 'combatEffect';

export interface FrameVisualLimits3D {
  projectile: number;
  tracer: number;
  combatEffect: number;
  activeCombatEffect: number;
}

export type FrameVisualBudget3D = FrameVisualLimits3D;

export const DEFAULT_FRAME_VISUAL_LIMITS_3D: FrameVisualLimits3D = {
  projectile: 120,
  tracer: 64,
  combatEffect: 48,
  activeCombatEffect: 220,
};

export function createFrameVisualBudget3D(limits: FrameVisualLimits3D = DEFAULT_FRAME_VISUAL_LIMITS_3D): FrameVisualBudget3D {
  return { ...limits };
}

export function consumeFrameVisualBudget3D(budget: FrameVisualBudget3D, kind: FrameVisualKind3D): boolean {
  if (budget[kind] <= 0) return false;
  budget[kind]--;
  return true;
}

export interface EntityConstructionBarProfile3D {
  widthScale: number;
  heightScale: number;
  depthScale: number;
  y: number;
}

export interface EntityHpBarProfile3D {
  width: number;
  y: number;
}

export interface EntityHpBarVisibility3D {
  hp: number;
  maxHp: number;
  selected?: boolean;
  nearby?: boolean;
  combat?: boolean;
  constructing?: boolean;
}

const AIRCRAFT_ALTITUDE = 8;
const AIRCRAFT_IDLE_ORBIT_RADIUS = 11.5;
const AIRCRAFT_IDLE_ORBIT_LANE_SPACING = 4;
const AIRCRAFT_IDLE_ORBIT_SPEED = 0.42;

interface AircraftActivity3D {
  targetId?: number | null;
  pathLength?: number;
  goal?: unknown | null;
  waypoint?: unknown | null;
  attackMove?: boolean;
  bombing?: boolean;
  loiterCenter?: { x: number; z: number } | null;
}

export const LOWPOLY_FIGHTER_MODEL_SCALE = 1.45;

export const LOWPOLY_FIGHTER_PART_IDS = [
  'fuselage',
  'spine',
  'faceted-nose',
  'nose-sensor',
  'chine-left',
  'chine-right',
  'shoulder-left',
  'shoulder-right',
  'bubble-canopy',
  'canopy-spine',
  'trapezoid-wing-left',
  'trapezoid-wing-right',
  'wing-thickness-left',
  'wing-thickness-right',
  'wing-panel-line-left',
  'wing-panel-line-right',
  'diverterless-intake-left',
  'diverterless-intake-right',
  'intake-lip-left',
  'intake-lip-right',
  'tailplane-left',
  'tailplane-right',
  'canted-tail-left',
  'canted-tail-right',
  'single-engine-nozzle',
  'exhaust-ring',
  'weapon-bay-left',
  'weapon-bay-right',
  'bay-line-center',
  'formation-light-left',
  'formation-light-right',
  'wingtip-left',
  'wingtip-right',
  'team-stripe',
  'team-fin-left',
  'team-fin-right',
] as const;

export const LOWPOLY_WORKER_PART_IDS = [
  'body',
  'head',
  'hardhat',
  'hardhat-brim',
  'toolpack',
  'left-arm',
  'right-arm',
  'left-leg',
  'right-leg',
  'toolbox',
  'team-patch',
] as const;

export const LOWPOLY_SOLDIER_PART_IDS = [
  'body',
  'torso-armor',
  'plate-carrier-front',
  'plate-carrier-back',
  'chest-rig',
  'ammo-pouch-left',
  'ammo-pouch-center',
  'ammo-pouch-right',
  'head',
  'helmet-shell',
  'helmet-rim',
  'helmet-rail-left',
  'helmet-rail-right',
  'goggles',
  'face-mask',
  'backpack',
  'radio',
  'radio-antenna',
  'left-upper-arm',
  'left-forearm',
  'right-upper-arm',
  'right-forearm',
  'left-glove',
  'right-glove',
  'left-thigh',
  'left-shin',
  'right-thigh',
  'right-shin',
  'knee-pad-left',
  'knee-pad-right',
  'boot-left',
  'boot-right',
  'rifle-stock',
  'rifle-body',
  'rifle-barrel',
  'rifle-muzzle',
  'rifle-magazine',
  'rifle-optic',
  'team-patch',
] as const;

export interface InfantryWalkPartTransform3D {
  translationY: number;
  translationZ: number;
  rotationX: number;
  rotationZ: number;
}

const IDLE_INFANTRY_WALK_PART_TRANSFORM_3D: InfantryWalkPartTransform3D = {
  translationY: 0,
  translationZ: 0,
  rotationX: 0,
  rotationZ: 0,
};

export function infantryWalkPartTransform3D(
  partId: string,
  moving: boolean,
  entityId: number,
  timeSeconds: number,
): InfantryWalkPartTransform3D {
  if (!moving) return IDLE_INFANTRY_WALK_PART_TRANSFORM_3D;

  const phase = timeSeconds * 8.6 + ((entityId * 0.731) % (Math.PI * 2));
  const swing = Math.sin(phase);
  const sideSwing = partId.includes('left') ? swing : partId.includes('right') ? -swing : 0;
  const bob = Math.abs(Math.sin(phase * 2)) * 0.035;
  let translationY = bob;
  let translationZ = 0;
  let rotationX = 0;
  let rotationZ = 0;

  if (partId.includes('thigh')) {
    rotationX = sideSwing * 0.36;
  } else if (partId.includes('shin')) {
    rotationX = -sideSwing * 0.24;
  } else if (partId.includes('knee-pad')) {
    rotationX = sideSwing * 0.16;
  } else if (partId.includes('boot')) {
    rotationX = sideSwing * 0.24;
    translationY += Math.max(0, sideSwing) * 0.035;
    translationZ = sideSwing * 0.025;
  } else if (partId.includes('upper-arm')) {
    rotationX = -sideSwing * 0.14;
    rotationZ = sideSwing * 0.04;
  } else if (partId.includes('forearm') || partId.includes('glove')) {
    rotationX = -sideSwing * 0.08;
    translationY += Math.max(0, -sideSwing) * 0.012;
  } else if (
    partId === 'body' ||
    partId.includes('armor') ||
    partId.includes('plate') ||
    partId.includes('rig') ||
    partId.includes('pouch') ||
    partId.includes('head') ||
    partId.includes('helmet') ||
    partId.includes('goggles') ||
    partId.includes('mask') ||
    partId.includes('backpack') ||
    partId.includes('radio') ||
    partId.includes('rifle') ||
    partId.includes('team-patch')
  ) {
    rotationZ = swing * 0.018;
  }

  return { translationY, translationZ, rotationX, rotationZ };
}

export function infantryFirePartTransform3D(
  partId: string,
  firing: boolean,
  entityId: number,
  timeSeconds: number,
): InfantryWalkPartTransform3D {
  if (!firing) return IDLE_INFANTRY_WALK_PART_TRANSFORM_3D;

  const impulse = 0.65 + Math.abs(Math.sin(timeSeconds * 34 + entityId * 0.37)) * 0.35;
  let translationY = 0;
  let translationZ = 0;
  let rotationX = 0;
  let rotationZ = 0;

  if (partId.includes('rifle')) {
    translationZ = 0.1 * impulse;
    rotationX = -0.035 * impulse;
  } else if (partId === 'right-forearm' || partId === 'right-glove') {
    translationZ = 0.035 * impulse;
    rotationX = -0.13 * impulse;
  } else if (partId === 'left-forearm' || partId === 'left-glove') {
    translationZ = 0.025 * impulse;
    rotationX = -0.08 * impulse;
  } else if (partId.includes('upper-arm')) {
    rotationX = -0.055 * impulse;
  } else if (
    partId === 'body' ||
    partId.includes('armor') ||
    partId.includes('plate') ||
    partId.includes('rig') ||
    partId.includes('pouch') ||
    partId.includes('head') ||
    partId.includes('helmet') ||
    partId.includes('goggles') ||
    partId.includes('mask') ||
    partId.includes('backpack') ||
    partId.includes('radio') ||
    partId.includes('team-patch')
  ) {
    rotationX = -0.045 * impulse;
    rotationZ = Math.sin(timeSeconds * 18 + entityId) * 0.012;
    translationY = -0.01 * impulse;
  }

  return { translationY, translationZ, rotationX, rotationZ };
}

function lowPolyPartId3D(meshName: string): string {
  return meshName
    .replace(/^infantry-/, '')
    .replace(/^worker-/, '')
    .replace(/^tank-/, '')
    .replace(/^fighter-/, '')
    .replace(/^aircraft-/, '')
    .replace(/^vehicle-/, '')
    .replace(/^tel-/, '');
}

export const LOWPOLY_TANK_UNIT_IDS = ['grizzly', 'rhino'] as const;

export function usesLowPolyTankModel3D(type: Pick<UnitType, 'id' | 'domain'>): boolean {
  return type.domain === 'vehicle' && (LOWPOLY_TANK_UNIT_IDS as readonly string[]).includes(type.id);
}

export function entityRootAltitude3D(_type: Pick<UnitType, 'domain'>): number {
  return 0;
}

export function commandIndicatorProfile3D(kind: CommandIndicatorKind3D): CommandIndicatorProfile3D {
  return kind === 'attack'
    ? { color: 0xff4b4b, life: 34, showSwords: true }
    : { color: 0x00ffc8, life: 44, showSwords: false };
}

export function commandIndicatorTransform3D(
  kind: CommandIndicatorKind3D,
  target: CommandIndicatorTarget3D = {},
): CommandIndicatorTransform3D {
  const footprint = Math.max(1, target.footprintW ?? 1, target.footprintH ?? 1);
  const ringScale = kind === 'attack' && footprint > 1 ? footprint * 1.25 : kind === 'move' ? 1.55 : 1;
  return {
    ringScale,
    arrowOffsetZ: -1.15 * ringScale,
    arrowScale: kind === 'move' ? 1.35 : 1.08,
    swordHeight: kind === 'attack' ? 0.78 + Math.max(0, footprint - 1) * 0.65 : 0.78,
  };
}

export const RALLY_VISUAL_STYLE_3D: RallyVisualStyle3D = {
  lineColor: 0xffc247,
  lineShadowColor: 0x141414,
  flagColor: 0xff3d3d,
  poleColor: 0x202934,
  baseColor: 0xffd65c,
  lineOpacity: 0.94,
  flagOpacity: 0.96,
  lineWidth: 0.16,
  flagHeight: 1.18,
};

export function entityVisualAltitude3D(type: Pick<UnitType, 'domain'>): number {
  return type.domain === 'aircraft' ? AIRCRAFT_ALTITUDE : 0;
}

export function entitySelectionRingAltitude3D(type: Pick<UnitType, 'domain'>): number {
  return entityVisualAltitude3D(type) + 0.045;
}

export function entitySelectionRingScale3D(type: Pick<UnitType, 'domain'>): number {
  if (type.domain === 'vehicle') return 1.8;
  if (type.domain === 'aircraft') return 1.7;
  return 1;
}

export function entityHpBarProfile3D(type: Pick<UnitType, 'domain' | 'building'>): EntityHpBarProfile3D {
  if (type.domain === 'building' && type.building) {
    const footprint = Math.max(1, type.building.footprintW, type.building.footprintH);
    return {
      width: Math.max(1.8, footprint * 0.7),
      y: 3.1 + Math.min(0.75, footprint * 0.16),
    };
  }
  if (type.domain === 'aircraft') return { width: 1.25, y: entityVisualAltitude3D(type) + 2.05 };
  if (type.domain === 'vehicle') return { width: 1.25, y: 2.08 };
  return { width: 0.95, y: 2.05 };
}

export function entityHpBarVisible3D(state: EntityHpBarVisibility3D): boolean {
  if (state.constructing || state.selected || state.nearby || state.combat) return true;
  if (!Number.isFinite(state.hp) || !Number.isFinite(state.maxHp) || state.maxHp <= 0) return false;
  return state.hp < state.maxHp;
}

export function entityHpBarYaw3D(entityYaw: number): number {
  return -entityYaw;
}

export function entityConstructionProgress3D(entity: { constructionProgress: number; constructionTotal: number }): number {
  if (entity.constructionTotal <= 0) return 1;
  return Math.max(0, Math.min(1, entity.constructionProgress / entity.constructionTotal));
}

export interface TacticalMissileStatus3D {
  kind: 'deploy' | 'undeploy' | 'cooldown';
  label: string;
  pct: number;
}

export function tacticalMissileStatus3D(
  entity: Pick<Entity, 'deployed' | 'deployMode' | 'deployTimer' | 'cooldown'> & Partial<Pick<Entity, 'owner'>>,
  type: { id: string; deployTime?: number; weapon?: { cooldown: number } | null },
  localPlayerId?: number,
): TacticalMissileStatus3D | null {
  if (type.id !== 'arty' && type.id !== 'tel') return null;
  if (localPlayerId !== undefined && entity.owner !== undefined && entity.owner !== localPlayerId) return null;
  const deployTime = type.deployTime ?? 0;
  if (entity.deployMode === 'deploy' && deployTime > 0 && entity.deployTimer > 0) {
    return { kind: 'deploy', label: 'Deploying...', pct: Math.max(0, Math.min(1, 1 - entity.deployTimer / deployTime)) };
  }
  if (entity.deployMode === 'undeploy' && deployTime > 0 && entity.deployTimer > 0) {
    return { kind: 'undeploy', label: 'Packing up...', pct: Math.max(0, Math.min(1, 1 - entity.deployTimer / deployTime)) };
  }
  if (!entity.deployed && deployTime > 0 && entity.deployTimer > 0) {
    return { kind: 'deploy', label: 'Deploying...', pct: Math.max(0, Math.min(1, 1 - entity.deployTimer / deployTime)) };
  }
  const cooldown = type.weapon?.cooldown ?? 0;
  if (entity.deployed && cooldown > 0 && entity.cooldown > 0) {
    return { kind: 'cooldown', label: 'Cooling down...', pct: Math.max(0, Math.min(1, 1 - entity.cooldown / cooldown)) };
  }
  return null;
}

export function tacticalMissileStatusLabelScale3D(): { x: number; y: number } {
  return { x: 18, y: 4.2 };
}

export function entityConstructionOpacity3D(entity: { constructionProgress: number; constructionTotal: number }): number {
  const pct = entityConstructionProgress3D(entity);
  return pct >= 1 ? 1 : 0.38 + pct * 0.28;
}

export function entityConstructionBarProfile3D(type: Pick<UnitType, 'domain' | 'building'>): EntityConstructionBarProfile3D {
  if (type.domain !== 'building' || !type.building) {
    return { widthScale: 1, heightScale: 1, depthScale: 1, y: entityVisualAltitude3D(type) + 1.35 };
  }
  const footprint = Math.max(1, type.building.footprintW, type.building.footprintH);
  return {
    widthScale: Math.max(2.25, footprint * 0.9),
    heightScale: 2.4,
    depthScale: 2.25,
    y: 2.95 + Math.min(0.7, footprint * 0.16),
  };
}

export function entityYawForFacing3D(facing: number): number {
  return -(((facing % 256) + 256) % 256 / 256) * Math.PI * 2;
}

export function proceduralModelYawOffset3D(
  type: Pick<UnitType, 'domain'> & Partial<Pick<UnitType, 'id'>>,
  hasExternalModel: boolean,
): number {
  if (hasExternalModel) return 0;
  if (type.domain === 'vehicle' && (type.id === 'arty' || type.id === 'tel')) return Math.PI;
  return type.domain === 'vehicle' || type.domain === 'infantry' ? -Math.PI / 2 : 0;
}

export function shouldUseInstancedUnitModel3D(type: Pick<UnitType, 'id' | 'domain'>, hasExternalModel = false): boolean {
  if (hasExternalModel || type.domain === 'building') return false;
  return type.id === 'gi' || usesLowPolyTankModel3D(type) || type.id === 'fighter';
}

export function configureInstancedUnitMesh3D(mesh: InstancedMesh, typeId: string): void {
  mesh.frustumCulled = false;
  mesh.userData.typeId = typeId;
}

export function isPickableEntityPart3D(userData: { pickable?: boolean }): boolean {
  return userData.pickable !== false;
}

export function aircraftIdleOrbitOffset3D(
  type: Pick<UnitType, 'domain'>,
  activity: AircraftActivity3D,
  aircraftPosition: { x: number; z: number },
  homeBaseCenter: { x: number; z: number } | null | undefined,
  timeSeconds: number,
  entityId: number,
): Vector3 {
  if (type.domain !== 'aircraft') return new Vector3();
  if ((activity.pathLength ?? 0) > 0 || activity.goal || activity.waypoint || activity.attackMove) return new Vector3();
  if (activity.targetId !== null && activity.targetId !== undefined && !activity.loiterCenter) return new Vector3();
  const center = activity.loiterCenter ?? homeBaseCenter ?? aircraftPosition;
  const attackingAtStation = activity.targetId !== null && activity.targetId !== undefined && activity.loiterCenter;
  const loiter = attackingAtStation && !activity.bombing
    ? aircraftCombatLoiterPoint3D(timeSeconds, entityId, center)
    : aircraftIdleLoiterPoint3D(timeSeconds, entityId, center);
  return new Vector3(loiter.x - aircraftPosition.x, 0, loiter.z - aircraftPosition.z);
}

export function aircraftIdleOrbitYaw3D(timeSeconds: number, entityId: number): number {
  const center = new Vector3();
  const current = aircraftIdleLoiterPoint3D(timeSeconds, entityId, center);
  const next = aircraftIdleLoiterPoint3D(timeSeconds + 0.24, entityId, center);
  const vx = next.x - current.x;
  const vz = next.z - current.z;
  return Math.atan2(-vz, vx);
}

export function aircraftLoiterYaw3D(
  type: Pick<UnitType, 'domain'>,
  activity: AircraftActivity3D,
  timeSeconds: number,
  entityId: number,
): number | null {
  if (type.domain !== 'aircraft') return null;
  if ((activity.pathLength ?? 0) > 0 || activity.goal || activity.waypoint || activity.attackMove) return null;
  if (activity.targetId !== null && activity.targetId !== undefined && !activity.loiterCenter) return null;
  if (activity.targetId !== null && activity.targetId !== undefined && activity.loiterCenter) {
    if (activity.bombing) return aircraftIdleOrbitYaw3D(timeSeconds, entityId);
    return aircraftCombatOrbitYaw3D(timeSeconds, entityId);
  }
  return aircraftIdleOrbitYaw3D(timeSeconds, entityId);
}

export function aircraftVisualStep3D(current: Vector3, desired: Vector3, maxStep: number): Vector3 {
  const delta = desired.clone().sub(current);
  const distance = delta.length();
  if (distance <= 0.001 || distance <= maxStep) return desired.clone();
  return current.clone().add(delta.multiplyScalar(maxStep / distance));
}

export function aircraftVisualDampedStep3D(
  current: Vector3,
  desired: Vector3,
  previousVelocity: Vector3 | null | undefined,
  dt: number,
): { position: Vector3; velocity: Vector3 } {
  const safeDt = Math.max(1 / 120, Math.min(0.12, dt));
  const velocity = previousVelocity?.clone() ?? new Vector3();
  const toTarget = desired.clone().sub(current);
  const distance = toTarget.length();
  if (distance <= 0.01 && velocity.length() <= 0.04) {
    return { position: desired.clone(), velocity: new Vector3() };
  }

  const stiffness = 3.2;
  const damping = 2 * stiffness;
  const acceleration = toTarget.multiplyScalar(stiffness * stiffness).add(velocity.clone().multiplyScalar(-damping));
  const nextVelocity = velocity.add(acceleration.multiplyScalar(safeDt));
  const maxSpeed = 30;
  const speed = nextVelocity.length();
  if (speed > maxSpeed) nextVelocity.multiplyScalar(maxSpeed / speed);

  const nextPosition = current.clone().add(nextVelocity.clone().multiplyScalar(safeDt));
  if (desired.clone().sub(current).dot(desired.clone().sub(nextPosition)) <= 0) {
    return { position: desired.clone(), velocity: new Vector3() };
  }
  return { position: nextPosition, velocity: nextVelocity };
}

function aircraftIdleLoiterPoint3D(timeSeconds: number, entityId: number, center: { x: number; z: number }): Vector3 {
  const profile = aircraftIdleLoiterProfile3D(entityId);
  const phase = timeSeconds * profile.speed * profile.direction + profile.phase;
  const weave = timeSeconds * profile.weaveSpeed * -profile.direction + profile.weavePhase;
  return new Vector3(
    center.x + profile.centerX + Math.cos(phase) * profile.radiusX + Math.sin(weave) * profile.weaveX,
    0,
    center.z + profile.centerZ + Math.sin(phase) * profile.radiusZ + Math.cos(weave) * profile.weaveZ,
  );
}

function aircraftCombatLoiterPoint3D(timeSeconds: number, entityId: number, center: { x: number; z: number }): Vector3 {
  const profile = aircraftCombatLoiterProfile3D(entityId);
  const phase = timeSeconds * profile.speed * profile.direction + profile.phase;
  const weave = timeSeconds * profile.weaveSpeed * -profile.direction + profile.weavePhase;
  return new Vector3(
    center.x + profile.centerX + Math.cos(phase) * profile.radiusX + Math.sin(weave) * profile.weaveX,
    0,
    center.z + profile.centerZ + Math.sin(phase) * profile.radiusZ + Math.cos(weave) * profile.weaveZ,
  );
}

function aircraftCombatOrbitYaw3D(timeSeconds: number, entityId: number): number {
  const center = new Vector3();
  const current = aircraftCombatLoiterPoint3D(timeSeconds, entityId, center);
  const next = aircraftCombatLoiterPoint3D(timeSeconds + 0.18, entityId, center);
  const vx = next.x - current.x;
  const vz = next.z - current.z;
  return Math.atan2(-vz, vx);
}

function aircraftIdleLoiterProfile3D(entityId: number): {
  centerX: number;
  centerZ: number;
  direction: 1 | -1;
  phase: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  weavePhase: number;
  weaveSpeed: number;
  weaveX: number;
  weaveZ: number;
} {
  const r2 = aircraftIdleHash3D(entityId, 2);
  const r3 = aircraftIdleHash3D(entityId, 3);
  const r5 = aircraftIdleHash3D(entityId, 5);
  const r7 = aircraftIdleHash3D(entityId, 7);
  const lane = ((entityId - 1) % 4 + 4) % 4;
  const laneCenter = lane - 1.5;
  const phaseBand = Math.floor(Math.max(0, entityId - 1) / 4);
  const stagger = (phaseBand * 0.61803398875 + lane * 0.035 + r5 * 0.018) % 1;
  return {
    centerX: laneCenter * 0.28 + (r2 - 0.5) * 0.5,
    centerZ: (r3 - 0.5) * 0.5,
    direction: 1,
    phase: stagger * Math.PI * 2,
    radiusX: AIRCRAFT_IDLE_ORBIT_RADIUS + lane * AIRCRAFT_IDLE_ORBIT_LANE_SPACING,
    radiusZ: AIRCRAFT_IDLE_ORBIT_RADIUS * 0.68 + lane * AIRCRAFT_IDLE_ORBIT_LANE_SPACING * 0.96,
    speed: AIRCRAFT_IDLE_ORBIT_SPEED * (0.94 + lane * 0.025 + r7 * 0.08),
    weavePhase: aircraftIdleHash3D(entityId, 8) * Math.PI * 2,
    weaveSpeed: AIRCRAFT_IDLE_ORBIT_SPEED * (0.55 + aircraftIdleHash3D(entityId, 9) * 0.22),
    weaveX: 0.12 + aircraftIdleHash3D(entityId, 10) * 0.22,
    weaveZ: 0.1 + aircraftIdleHash3D(entityId, 11) * 0.18,
  };
}

function aircraftCombatLoiterProfile3D(entityId: number): {
  centerX: number;
  centerZ: number;
  direction: 1 | -1;
  phase: number;
  radiusX: number;
  radiusZ: number;
  speed: number;
  weavePhase: number;
  weaveSpeed: number;
  weaveX: number;
  weaveZ: number;
} {
  const lane = ((entityId - 1) % 3 + 3) % 3;
  const r2 = aircraftIdleHash3D(entityId, 22);
  const r3 = aircraftIdleHash3D(entityId, 23);
  const r5 = aircraftIdleHash3D(entityId, 25);
  return {
    centerX: (r2 - 0.5) * 0.72,
    centerZ: (r3 - 0.5) * 0.72,
    direction: aircraftIdleHash3D(entityId, 24) > 0.5 ? 1 : -1,
    phase: ((Math.floor(Math.max(0, entityId - 1) / 3) * 0.381966 + lane * 0.28 + r5 * 0.04) % 1) * Math.PI * 2,
    radiusX: 3.15 + lane * 0.78,
    radiusZ: 2.7 + lane * 0.58,
    speed: 0.62 + aircraftIdleHash3D(entityId, 27) * 0.08,
    weavePhase: aircraftIdleHash3D(entityId, 28) * Math.PI * 2,
    weaveSpeed: 0.34 + aircraftIdleHash3D(entityId, 29) * 0.08,
    weaveX: 0.14 + aircraftIdleHash3D(entityId, 30) * 0.14,
    weaveZ: 0.1 + aircraftIdleHash3D(entityId, 31) * 0.12,
  };
}

function aircraftIdleHash3D(entityId: number, salt: number): number {
  const value = Math.sin(entityId * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function tacticalMissileLookTarget3D(
  pos: Vector3,
  shooter: { x: number; y: number } | null | undefined,
  target: { x: number; y: number } | null | undefined,
): Vector3 | null {
  if (!shooter || !target) return null;
  const shooterPos = leptonToWorld3D(shooter.x, shooter.y);
  const targetPos = leptonToWorld3D(target.x, target.y);
  const dirX = targetPos.x - shooterPos.x;
  const dirZ = targetPos.z - shooterPos.z;
  const fullWorld = Math.max(0.001, Math.hypot(dirX, dirZ));
  const traveled = Math.min(1, Math.max(0, Math.hypot(pos.x - shooterPos.x, pos.z - shooterPos.z) / fullWorld));
  const peakY = 14;
  const startY = 1.2;
  const endY = 0.5;
  const dyDt = (peakY - startY) * 4 * (1 - 2 * traveled) + (endY - startY) * 2 * traveled;
  const step = 3;
  const yDelta = (dyDt / fullWorld) * step;
  return new Vector3(
    pos.x + (dirX / fullWorld) * step,
    pos.y + yDelta,
    pos.z + (dirZ / fullWorld) * step,
  );
}

export function projectileVisualPoint3D(
  shooterType: Pick<UnitType, 'domain'> | null | undefined,
  projectile: { x: number; y: number; weaponRole?: WeaponRole },
  shooter: { x: number; y: number } | null | undefined,
  target: { x: number; y: number } | null | undefined,
): Vector3 {
  if (projectile.weaponRole === 'missile') {
    const pos = leptonToWorld3D(projectile.x, projectile.y);
    // 地面发射的拦截弹（爱国者）：从地面爬升至目标高度，模拟弹道爬升
    if (shooterType?.domain === 'building') {
      const startY = 1.0; // 发射架高度
      const endY = AIRCRAFT_ALTITUDE + 0.15;
      if (!shooter || !target) return new Vector3(pos.x, endY, pos.z);
      const full = Math.max(1, Math.hypot(target.x - shooter.x, target.y - shooter.y));
      const traveled = Math.min(1, Math.max(0, Math.hypot(projectile.x - shooter.x, projectile.y - shooter.y) / full));
      // 平滑爬升：前段快速爬升，后段接近目标高度
      const t = 1 - Math.pow(1 - traveled, 2);
      return new Vector3(pos.x, startY + (endY - startY) * t, pos.z);
    }
    // 战术弹道导弹（TEL 车发射）：高抛物线弹道，中段高空飞行，末段俯冲
    if (shooterType?.domain === 'vehicle') {
      const startY = 1.2; // 发射架竖起后的高度
      const peakY = 14;   // 弹道顶点（高空）
      const endY = 0.5;   // 目标地面高度
      if (!shooter || !target) return new Vector3(pos.x, peakY, pos.z);
      const full = Math.max(1, Math.hypot(target.x - shooter.x, target.y - shooter.y));
      const traveled = Math.min(1, Math.max(0, Math.hypot(projectile.x - shooter.x, projectile.y - shooter.y) / full));
      // 抛物线：y = start + (peak-start) * 4t(1-t)，末段叠加下坠
      const arc = 4 * traveled * (1 - traveled); // 0→1→0
      const y = startY + (peakY - startY) * arc + (endY - startY) * traveled * traveled;
      return new Vector3(pos.x, y, pos.z);
    }
    return new Vector3(pos.x, AIRCRAFT_ALTITUDE + 0.15, pos.z);
  }
  if (shooterType?.domain !== 'aircraft' || projectile.weaponRole === 'cannon' || projectile.weaponRole === 'gun' || !shooter || !target) {
    const pos = leptonToWorld3D(projectile.x, projectile.y);
    return new Vector3(pos.x, 0.55, pos.z);
  }
  const shooterPos = leptonToWorld3D(shooter.x, shooter.y);
  const full = Math.max(1, Math.hypot(target.x - shooter.x, target.y - shooter.y));
  const remaining = Math.min(1, Math.max(0, Math.hypot(target.x - projectile.x, target.y - projectile.y) / full));
  return new Vector3(shooterPos.x, 0.35 + AIRCRAFT_ALTITUDE * remaining, shooterPos.z);
}

export function projectileVisualProfile3D(shooterType: Pick<UnitType, 'domain'> | null | undefined, weaponRole?: WeaponRole): ProjectileVisualProfile3D {
  if (weaponRole === 'missile') {
    // TEL 战术导弹：橙色尾焰，更醒目
    if (shooterType?.domain === 'vehicle') return { kind: 'tracer', color: 0xffaa44 };
    return { kind: 'tracer', color: 0xaedfff };
  }
  if (weaponRole === 'bomb' || shooterType?.domain === 'aircraft') return { kind: 'bomb', color: 0x111111 };
  return { kind: 'tracer', color: 0xfff0b0 };
}

export function projectileImpactKind3D(
  shooterType: Pick<UnitType, 'domain'> | null | undefined,
  weaponRole: WeaponRole | undefined,
  splash: number,
): ThreeProjectileAudioState['impactKind'] {
  if (weaponRole === 'missile' && shooterType?.domain === 'building') return 'missileImpact';
  // TEL 战术导弹命中：大型战术爆炸
  if (weaponRole === 'missile' && shooterType?.domain === 'vehicle') return 'tacticalMissileImpact';
  if (weaponRole === 'bomb') return 'bombImpact';
  if (splash > 0 || shooterType?.domain === 'aircraft' || shooterType?.domain === 'vehicle') return 'explosion';
  return 'hit';
}

function weaponCanTarget3D(weapon: NonNullable<UnitType['weapon']>, targetType: UnitType): boolean {
  return !weapon.targetDomains || weapon.targetDomains.includes(targetType.domain);
}

function weaponForTarget3D(shooterType: UnitType, targetType: UnitType): NonNullable<UnitType['weapon']> | null {
  const weapons = [shooterType.antiAirWeapon, shooterType.weapon].filter((weapon): weapon is NonNullable<UnitType['weapon']> => !!weapon);
  return weapons.find((weapon) => weaponCanTarget3D(weapon, targetType)) ?? null;
}

function weaponRoleFor3D(shooterType: UnitType, weapon: NonNullable<UnitType['weapon']>): WeaponRole {
  if (weapon.role) return weapon.role;
  if (weapon.projectileSpeed <= 0) return 'gun';
  return shooterType.domain === 'aircraft' ? 'bomb' : 'cannon';
}

export function projectileTracerEnd3D(start: Vector3, target: Vector3, maxLength: number): Vector3 {
  const delta = target.clone().sub(start);
  const length = delta.length();
  if (length <= 0.001) return start.clone();
  return start.clone().add(delta.multiplyScalar(Math.min(maxLength, length) / length));
}

export function combatEffectProfile3D(kind: ThreeAudioEvent['kind']): CombatEffectProfile3D {
  switch (kind) {
    case 'fire':
      return { visual: 'muzzleFlash', color: 0xfff1a0, radius: 0.22, height: 1.05, life: 10, sparkCount: 5, grow: 1.45 };
    case 'cannon':
      return { visual: 'muzzleFlash', color: 0xff9f32, radius: 0.42, height: 0.9, life: 14, sparkCount: 8, grow: 1.8 };
    case 'bomb':
      return { visual: 'muzzleFlash', color: 0xffd05a, radius: 0.26, height: AIRCRAFT_ALTITUDE - 0.35, life: 16, sparkCount: 4, grow: 1.35 };
    case 'bombImpact':
      return { visual: 'blast', color: 0xff9a32, radius: 0.88, height: 0.58, life: 24, sparkCount: 16, grow: 2.35 };
    case 'scream':
      return { visual: 'impactSpark', color: 0xfff6c0, radius: 0.2, height: 0.42, life: 10, sparkCount: 5, grow: 1.35 };
    case 'hit':
      return { visual: 'impactSpark', color: 0xfff6c0, radius: 0.24, height: 0.38, life: 12, sparkCount: 7, grow: 1.55 };
    case 'explosion':
      return { visual: 'blast', color: 0xffa640, radius: 0.72, height: 0.5, life: 22, sparkCount: 13, grow: 2.2 };
    case 'bigExplosion':
      return { visual: 'blast', color: 0xff7a2a, radius: 1.18, height: 0.75, life: 32, sparkCount: 20, grow: 2.6 };
    case 'missileLaunch':
      return { visual: 'muzzleFlash', color: 0xfff1a0, radius: 0.28, height: 1.1, life: 12, sparkCount: 6, grow: 1.5 };
    case 'missileFlight':
      return { visual: 'impactSpark', color: 0xd8d8d8, radius: 0.18, height: 0.3, life: 8, sparkCount: 3, grow: 1.2 };
    case 'missileImpact':
      return { visual: 'blast', color: 0xffa640, radius: 0.92, height: 0.62, life: 26, sparkCount: 18, grow: 2.4 };
    case 'tacticalMissileLaunch':
      return { visual: 'muzzleFlash', color: 0xffe080, radius: 0.42, height: 1.4, life: 18, sparkCount: 10, grow: 1.8 };
    case 'tacticalMissileFlight':
      return { visual: 'impactSpark', color: 0xffaa44, radius: 0.24, height: 0.4, life: 10, sparkCount: 4, grow: 1.3 };
    case 'tacticalMissileImpact':
      return { visual: 'blast', color: 0xff6a2a, radius: 1.5, height: 0.95, life: 40, sparkCount: 28, grow: 3.0 };
  }
}

export function combatMuzzlePoint3D(
  kind: ThreeAudioEvent['kind'],
  origin: { x: number; z: number },
  target: { x: number; z: number } | null | undefined,
): Vector3 {
  const profile = combatEffectProfile3D(kind);
  const start = new Vector3(origin.x, profile.height, origin.z);
  if ((kind !== 'fire' && kind !== 'cannon') || !target) return start;
  const muzzleOffset = kind === 'cannon' ? 1.9 : 0.84;
  return projectileTracerEnd3D(start, new Vector3(target.x, profile.height, target.z), muzzleOffset);
}

function commandArrowGeometry3D(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0.58);
  shape.lineTo(-0.42, -0.36);
  shape.lineTo(0.42, -0.36);
  shape.lineTo(0, 0.58);
  return new ShapeGeometry(shape);
}

export class ThreeWorldRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  onEvent: ((kind: ThreeAudioEvent['kind'], x: number, z: number) => void) | null = null;
  private readonly entityLayer = new Group();
  private readonly projectileLayer = new Group();
  private readonly effectLayer = new Group();
  private readonly previewLayer = new Group();
  private readonly rallyLayer = new Group();
  private readonly views = new Map<number, EntityView>();
  private readonly combatEffects: CombatEffect[] = [];
  private readonly instancedBatches = new Map<string, InstancedModelBatch>();
  private readonly modelTemplates = new Map<string, Object3D>();
  private rallyVisualKey = '';
  private readonly gltfLoader = new GLTFLoader();
  private readonly audioEvents = new ThreeAudioEventTracker();
  private frameVisualBudget = createFrameVisualBudget3D();
  private readonly tileGeo = new PlaneGeometry(THREE_CELL_SIZE, THREE_CELL_SIZE);
  private readonly oreGeo = new OctahedronGeometry(0.18, 0);
  private readonly projectileGeo = new SphereGeometry(0.12, 8, 8);
  private readonly projectileTracerGeo = new BoxGeometry(0.045, 0.045, 1);
  private readonly effectFlashGeo = new SphereGeometry(1, 10, 8);
  private readonly effectSparkGeo = new BoxGeometry(0.055, 0.055, 0.38);
  private readonly effectRingGeo = new RingGeometry(0.65, 0.86, 24);
  private readonly commandRingGeo = new RingGeometry(0.72, 0.93, 36);
  private readonly commandArrowGeo = commandArrowGeometry3D();
  private readonly commandSwordBladeGeo = new BoxGeometry(0.13, 0.08, 1.05);
  private readonly commandSwordGuardGeo = new BoxGeometry(0.5, 0.08, 0.12);
  private readonly commandSwordGripGeo = new BoxGeometry(0.14, 0.08, 0.32);
  private readonly soldierGeo = new CapsuleGeometry(0.22, 0.7, 4, 8);
  private readonly vehicleGeo = new BoxGeometry(0.9, 0.35, 1.25);
  private readonly barrelGeo = new BoxGeometry(0.16, 0.12, 0.8);
  private readonly fighterFuselageGeo = new BoxGeometry(1.7, 0.32, 0.36);
  private readonly fighterSpineGeo = new BoxGeometry(0.74, 0.16, 0.24);
  private readonly fighterNoseGeo = new ConeGeometry(0.22, 0.58, 6);
  private readonly fighterCockpitGeo = new BoxGeometry(0.42, 0.16, 0.28);
  private readonly fighterWingGeo = new BoxGeometry(0.72, 0.08, 1);
  private readonly fighterTailWingGeo = new BoxGeometry(0.35, 0.07, 0.5);
  private readonly fighterVerticalTailGeo = new BoxGeometry(0.18, 0.46, 0.08);
  private readonly fighterIntakeGeo = new BoxGeometry(0.36, 0.14, 0.14);
  private readonly fighterNozzleGeo = new ConeGeometry(0.2, 0.3, 6);
  private readonly fighterHardpointGeo = new BoxGeometry(0.34, 0.06, 0.09);
  private readonly fighterHardpointNoseGeo = new ConeGeometry(0.05, 0.13, 6);
  private readonly fighterWingtipGeo = new BoxGeometry(0.14, 0.09, 0.18);
  private readonly fighterStripeGeo = new BoxGeometry(0.08, 0.34, 0.42);
  private readonly aircraftShadowGeo = new PlaneGeometry(3.25, 1.6);
  private readonly roadSegmentGeo = new BoxGeometry(1, 0.045, 1);
  private readonly grassTuftGeo = new ConeGeometry(0.16, 0.42, 5);
  private readonly treeTrunkGeo = new CylinderGeometry(0.08, 0.13, 0.72, 5);
  private readonly treeCrownGeo = new SphereGeometry(0.46, 7, 5);
  private readonly rockGeo = new OctahedronGeometry(0.34, 0);
  private readonly selectionRingGeo = new RingGeometry(0.52, 0.64, 32);
  private readonly selectionRingMat = new MeshLambertMaterial({ color: 0x68f07a });
  private readonly hpBackMat = new MeshBasicLike(0x101010);
  private readonly hpGoodMat = new MeshBasicLike(0x42d66d);
  private readonly hpConstructionMat = new MeshBasicLike(0xffd43b);
  private readonly missileDeployMat = new MeshBasicLike(0xffb02e);
  private readonly missileCooldownMat = new MeshBasicLike(0x62c8ff);
  private readonly hpOwnerMats = new Map<number, MeshBasicLike>();
  private readonly projectileMat = new MeshLambertMaterial({ color: 0x111111 });
  private readonly projectileTracerMat = new MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.92, depthWrite: false });
  private readonly projectileMissileTracerMat = new MeshBasicMaterial({ color: 0xaedfff, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly instancedPartTranslateMatrix = new Matrix4();
  private readonly instancedPartRotateXMatrix = new Matrix4();
  private readonly instancedPartRotateZMatrix = new Matrix4();

  constructor(
    private readonly host: HTMLElement,
    private readonly world: World,
    private readonly localPlayerId: number,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.domElement.className = 'mv3-canvas';
    host.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0xb8d3df);
    this.scene.fog = new Fog(0xb8d3df, 105, 330);
    this.scene.add(new HemisphereLight(0xe5f4ff, 0x789168, 2.45));
    this.scene.add(new AmbientLight(0xd8edf2, 1.55));
    const sun = new DirectionalLight(0xfff4d7, 3.1);
    sun.position.set(-20, 42, 28);
    this.scene.add(sun, this.rallyLayer, this.entityLayer, this.projectileLayer, this.effectLayer, this.previewLayer);

    this.drawTerrain();
    this.drawOre();
  }

  async loadModels(): Promise<void> {
    await Promise.all(
      WW1_MODEL_SPECS.map(async (spec) => {
        const type = this.world.rules.units.get(spec.typeId);
        if (!type) return;
        try {
          const res = await fetch(spec.src);
          if (!res.ok) return;
          const bytes = await res.arrayBuffer();
          if (!this.looksLikeGlb(bytes)) return;
          const gltf = await this.gltfLoader.parseAsync(bytes, this.assetBasePath(spec.src));
          this.modelTemplates.set(spec.typeId, this.prepareModelTemplate(gltf.scene, type, spec));
        } catch (err) {
          console.warn(`Failed to load 3D model ${spec.src}`, err);
        }
      }),
    );
  }

  resize(camera: { updateProjectionMatrix(): void }): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    camera.updateProjectionMatrix();
  }

  render(camera: Camera, alpha: number, selected: ReadonlySet<number>, nearbyHpIds: ReadonlySet<number> = new Set()): void {
    this.frameVisualBudget = createFrameVisualBudget3D();
    this.syncEntities(alpha, selected, nearbyHpIds);
    this.syncRallyVisuals(selected);
    this.syncProjectiles();
    this.processCombatEvents();
    this.stepCombatEffects();
    this.renderer.render(this.scene, camera);
  }

  commitInterpolation(): void {
    for (const e of this.world.entities.values()) {
      const view = this.views.get(e.id);
      if (view) view.root.userData.last = { x: e.x, y: e.y };
    }
  }

  spawnCommandIndicator(kind: CommandIndicatorKind3D, x: number, z: number, target: CommandIndicatorTarget3D = {}): void {
    const profile = commandIndicatorProfile3D(kind);
    const transform = commandIndicatorTransform3D(kind, target);
    const root = new Group();
    root.position.set(x, 0.08, z);

    const ringMat = new MeshBasicMaterial({
      color: profile.color,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: DoubleSide,
    });
    ringMat.userData.baseOpacity = ringMat.opacity;
    const ring = new Mesh(this.commandRingGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(transform.ringScale);
    root.add(ring);

    const arrowMat = new MeshBasicMaterial({
      color: profile.color,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      side: DoubleSide,
    });
    arrowMat.userData.baseOpacity = arrowMat.opacity;
    const arrow = new Mesh(this.commandArrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(0, 0.12, transform.arrowOffsetZ);
    arrow.scale.setScalar(transform.arrowScale);
    root.add(arrow);

    if (profile.showSwords) this.addCommandSwords(root, transform.swordHeight);

    this.effectLayer.add(root);
    this.combatEffects.push({ root, life: profile.life, maxLife: profile.life, grow: 0.12 });
  }

  private addCommandSwords(root: Group, swordHeight: number): void {
    const bladeMat = new MeshBasicMaterial({ color: 0xf5f8ff, transparent: true, opacity: 0.92, depthWrite: false });
    const gripMat = new MeshBasicMaterial({ color: 0x2357ff, transparent: true, opacity: 0.86, depthWrite: false });
    bladeMat.userData.baseOpacity = bladeMat.opacity;
    gripMat.userData.baseOpacity = gripMat.opacity;

    const makeSword = (rotationY: number): Group => {
      const sword = new Group();
      sword.position.set(0, swordHeight, -0.08);
      sword.rotation.y = rotationY;

      const blade = new Mesh(this.commandSwordBladeGeo, bladeMat);
      blade.position.z = 0.22;
      const guard = new Mesh(this.commandSwordGuardGeo, gripMat);
      guard.position.z = -0.36;
      const grip = new Mesh(this.commandSwordGripGeo, gripMat);
      grip.position.z = -0.58;
      sword.add(blade, guard, grip);
      return sword;
    };

    root.add(makeSword(Math.PI / 4), makeSword(-Math.PI / 4));
  }

  pickOwnUnit(camera: Camera, clientX: number, clientY: number): number | null {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, camera);
    const hits = this.raycaster.intersectObjects(this.entityLayer.children, true);
    for (const hit of hits) {
      const id = this.entityIdOfHit(hit);
      if (id === null) continue;
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (e?.owner === this.localPlayerId && type) return id;
    }
    return null;
  }

  pickEntity(camera: Camera, clientX: number, clientY: number): number | null {
    this.setPointerFromClient(clientX, clientY);
    this.raycaster.setFromCamera(this.pointer, camera);
    const hits = this.raycaster.intersectObjects(this.entityLayer.children, true);
    for (const hit of hits) {
      const id = this.entityIdOfHit(hit);
      if (id !== null && this.world.entities.has(id)) return id;
    }
    return null;
  }

  ownUnitScreenPoints(camera: Camera): { id: number; x: number; y: number }[] {
    const out: { id: number; x: number; y: number }[] = [];
    for (const point of this.entityScreenPoints(camera)) {
      const e = this.world.entities.get(point.id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (e?.owner === this.localPlayerId && type && type.domain !== 'building') out.push(point);
    }
    return out;
  }

  entityScreenPoints(camera: Camera): { id: number; x: number; y: number }[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out: { id: number; x: number; y: number }[] = [];
    for (const [id, view] of this.views) {
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (!e || !type) continue;
      const p = view.root.position.clone();
      p.y += entityVisualAltitude3D(type);
      p.project(camera);
      out.push({
        id,
        x: rect.left + ((p.x + 1) / 2) * rect.width,
        y: rect.top + ((-p.y + 1) / 2) * rect.height,
      });
    }
    return out;
  }

  setBuildPreview(type: UnitType | null, cell: { x: number; y: number } | null, canPlace: boolean): void {
    this.clearPreview();
    const b = type?.building;
    if (!type || !b || !cell) return;
    const mat = new MeshLambertMaterial({
      color: canPlace ? 0x42d66d : 0xe04a4a,
      transparent: true,
      opacity: 0.45,
    });
    const geo = new BoxGeometry(b.footprintW * THREE_CELL_SIZE * 0.92, 0.22, b.footprintH * THREE_CELL_SIZE * 0.92);
    const mesh = new Mesh(geo, mat);
    const pos = cellToWorld3D(cell.x + (b.footprintW - 1) / 2, cell.y + (b.footprintH - 1) / 2);
    mesh.position.set(pos.x, 0.12, pos.z);
    this.previewLayer.add(mesh);
  }

  private syncRallyVisuals(selected: ReadonlySet<number>): void {
    const entries: { id: number; from: { x: number; z: number }; to: { x: number; z: number } }[] = [];
    for (const id of [...selected].sort((a, b) => a - b)) {
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (!e || !type?.building || !e.producer || e.rallyX < 0 || e.rallyY < 0) continue;
      const from = cellToWorld3D(e.cellX + (type.building.footprintW - 1) / 2, e.cellY + (type.building.footprintH - 1) / 2);
      const to = cellToWorld3D(e.rallyX, e.rallyY);
      entries.push({ id, from, to });
    }

    const key = entries
      .map((entry) => `${entry.id}:${entry.from.x.toFixed(2)},${entry.from.z.toFixed(2)}>${entry.to.x.toFixed(2)},${entry.to.z.toFixed(2)}`)
      .join('|');
    if (key === this.rallyVisualKey) return;
    this.rallyVisualKey = key;
    this.clearRallyVisuals();
    for (const entry of entries) this.rallyLayer.add(this.createRallyVisual(entry.from, entry.to));
  }

  private createRallyVisual(from: { x: number; z: number }, to: { x: number; z: number }): Group {
    const root = new Group();
    root.name = 'rally-point-visual';
    const style = RALLY_VISUAL_STYLE_3D;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.2) {
      const shadowMat = new MeshBasicMaterial({
        color: style.lineShadowColor,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        depthTest: false,
      });
      const lineMat = new MeshBasicMaterial({
        color: style.lineColor,
        transparent: true,
        opacity: style.lineOpacity,
        depthWrite: false,
        depthTest: false,
      });
      const yaw = Math.atan2(-dz, dx);
      const shadow = new Mesh(new BoxGeometry(length, 0.04, style.lineWidth * 1.95), shadowMat);
      shadow.position.set((from.x + to.x) / 2, 0.135, (from.z + to.z) / 2);
      shadow.rotation.y = yaw;
      const line = new Mesh(new BoxGeometry(length, 0.05, style.lineWidth), lineMat);
      line.position.set((from.x + to.x) / 2, 0.17, (from.z + to.z) / 2);
      line.rotation.y = yaw;
      root.add(shadow, line);
    }

    const ringMat = new MeshBasicMaterial({
      color: style.baseColor,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
    });
    const ring = new Mesh(new RingGeometry(0.52, 0.72, 28), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(to.x, 0.2, to.z);

    const poleMat = new MeshBasicMaterial({
      color: style.poleColor,
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
      depthTest: false,
    });
    const flagMat = new MeshBasicMaterial({
      color: style.flagColor,
      transparent: true,
      opacity: style.flagOpacity,
      depthWrite: false,
      depthTest: false,
    });
    const pole = new Mesh(new BoxGeometry(0.09, style.flagHeight, 0.09), poleMat);
    pole.position.set(to.x, 0.2 + style.flagHeight / 2, to.z);
    const flagA = new Mesh(new BoxGeometry(0.72, 0.4, 0.08), flagMat);
    flagA.position.set(to.x + 0.34, 0.2 + style.flagHeight - 0.18, to.z);
    const flagB = new Mesh(new BoxGeometry(0.08, 0.4, 0.72), flagMat);
    flagB.position.set(to.x, 0.2 + style.flagHeight - 0.18, to.z + 0.34);
    root.add(ring, pole, flagA, flagB);
    return root;
  }

  private clearRallyVisuals(): void {
    for (const child of [...this.rallyLayer.children]) this.disposeObject(child);
  }

  dispose(): void {
    for (const view of this.views.values()) this.disposeObject(view.root);
    this.views.clear();
    for (const batch of this.instancedBatches.values()) this.disposeObject(batch.root);
    this.instancedBatches.clear();
    for (const template of this.modelTemplates.values()) this.disposeObject(template);
    this.modelTemplates.clear();
    for (const mat of this.hpOwnerMats.values()) mat.mat.dispose();
    this.hpOwnerMats.clear();
    this.disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private drawTerrain(): void {
    const ground = new Mesh(this.largeGroundGeo(), this.largeGroundMat());
    const center = cellToWorld3D((this.world.terrain.width - 1) / 2, (this.world.terrain.height - 1) / 2);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(center.x, -0.035, center.z);
    this.scene.add(ground);

    const passMatA = new MeshLambertMaterial({ color: 0x7f9f70, transparent: true, opacity: 0.16 });
    const passMatB = new MeshLambertMaterial({ color: 0x729568, transparent: true, opacity: 0.12 });
    const blockMat = new MeshLambertMaterial({ color: 0x8b8063, transparent: true, opacity: 0.48 });
    const waterMat = new MeshLambertMaterial({ color: 0x357ca0, transparent: true, opacity: 0.58 });
    const ridgeMat = new MeshLambertMaterial({ color: 0x7e857c, transparent: true, opacity: 0.58 });
    const sandMat = new MeshLambertMaterial({ color: 0xaa9a66, transparent: true, opacity: 0.34 });
    const scorchedMat = new MeshLambertMaterial({ color: 0x493f32, transparent: true, opacity: 0.4 });
    const shoreMat = new MeshLambertMaterial({ color: 0xb7aa83, transparent: true, opacity: 0.5 });
    const roadMat = new MeshLambertMaterial({ color: 0xb9aa90, transparent: true, opacity: 0.66 });
    const marshMat = new MeshLambertMaterial({ color: 0x6f8f68, transparent: true, opacity: 0.42 });
    for (let y = 0; y < this.world.terrain.height; y++) {
      for (let x = 0; x < this.world.terrain.width; x++) {
        const terrain = this.world.terrain.terrainAt?.(x, y);
        const m =
          terrain === 'water'
            ? waterMat
            : terrain === 'ridge'
              ? ridgeMat
              : terrain === 'sand'
                ? sandMat
                : terrain === 'scorched'
                  ? scorchedMat
                  : terrain === 'shore'
                    ? shoreMat
                    : terrain === 'road'
                      ? roadMat
                      : terrain === 'marsh'
                        ? marshMat
                        : this.world.terrain.passable(x, y)
                          ? ((x + y) % 2 === 0 ? passMatA : passMatB)
                          : blockMat;
        const tile = new Mesh(this.tileGeo, m);
        const pos = cellToWorld3D(x, y);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(pos.x, -0.01, pos.z);
        this.scene.add(tile);
      }
    }
    this.drawGrassBands(center.x, center.z);
    if (!this.hasTerrainKind('road')) this.drawRoads();
    this.drawLandscapeProps();
  }

  private hasTerrainKind(kind: string): boolean {
    for (let y = 0; y < this.world.terrain.height; y++) {
      for (let x = 0; x < this.world.terrain.width; x++) {
        if (this.world.terrain.terrainAt?.(x, y) === kind) return true;
      }
    }
    return false;
  }

  private largeGroundGeo(): PlaneGeometry {
    return new PlaneGeometry(this.world.terrain.width * THREE_CELL_SIZE * 4, this.world.terrain.height * THREE_CELL_SIZE * 4, this.world.terrain.width * 4, this.world.terrain.height * 4);
  }

  private largeGroundMat(): MeshLambertMaterial {
    return new MeshLambertMaterial({ color: 0x779868 });
  }

  private drawGrassBands(centerX: number, centerZ: number): void {
    const mapW = this.world.terrain.width * THREE_CELL_SIZE;
    const mapH = this.world.terrain.height * THREE_CELL_SIZE;
    const bandMatA = new MeshLambertMaterial({ color: 0x8cad78, transparent: true, opacity: 0.16, depthWrite: false });
    const bandMatB = new MeshLambertMaterial({ color: 0x66895e, transparent: true, opacity: 0.1, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const band = new Mesh(new PlaneGeometry(mapW * 1.8, 6 + (i % 3) * 2), i % 2 === 0 ? bandMatA : bandMatB);
      band.rotation.x = -Math.PI / 2;
      band.rotation.z = -0.08 + i * 0.014;
      band.position.set(centerX, 0.004 + i * 0.001, centerZ - mapH * 0.58 + i * mapH * 0.13);
      this.scene.add(band);
    }
  }

  private drawRoads(): void {
    const w = this.world.terrain.width - 1;
    const h = this.world.terrain.height - 1;
    this.addRoad(
      [
        [-4, h * 0.34],
        [w * 0.18, h * 0.36],
        [w * 0.42, h * 0.32],
        [w * 0.66, h * 0.35],
        [w + 4, h * 0.3],
      ],
      1.45,
    );
    this.addRoad(
      [
        [w * 0.55, h + 4],
        [w * 0.53, h * 0.72],
        [w * 0.51, h * 0.52],
        [w * 0.55, h * 0.35],
        [w * 0.6, -4],
      ],
      1.35,
    );
    this.addRoad(
      [
        [w * 0.18, -3],
        [w * 0.26, h * 0.16],
        [w * 0.37, h * 0.28],
        [w * 0.55, h * 0.35],
      ],
      1.05,
    );
  }

  private addRoad(points: [number, number][], width: number): void {
    const roadMat = new MeshLambertMaterial({ color: 0xa99d85, transparent: true, opacity: 0.9 });
    const vergeMat = new MeshLambertMaterial({ color: 0x8a806d, transparent: true, opacity: 0.28, depthWrite: false });
    const curve = new CatmullRomCurve3(points.map(([x, y]) => {
      const p = cellToWorld3D(x, y);
      return new Vector3(p.x, 0.025, p.z);
    }));
    const sampleCount = Math.max(8, Math.ceil(curve.getLength() / 1.4));
    const samples = curve.getPoints(sampleCount);
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]!;
      const b = samples[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.max(0.01, Math.hypot(dx, dz));
      const road = new Mesh(this.roadSegmentGeo, roadMat);
      road.scale.set(width, 1, len + 0.28);
      road.rotation.y = Math.atan2(dx, dz);
      road.position.set((a.x + b.x) / 2, 0.026, (a.z + b.z) / 2);
      this.scene.add(road);

      if (i % 2 === 0) {
        const verge = new Mesh(this.roadSegmentGeo, vergeMat);
        verge.scale.set(width + 0.85, 0.7, len + 0.36);
        verge.rotation.y = road.rotation.y;
        verge.position.set(road.position.x, 0.018, road.position.z);
        this.scene.add(verge);
      }
    }
  }

  private drawLandscapeProps(): void {
    const trunkMat = new MeshLambertMaterial({ color: 0x795642 });
    const crownMatA = new MeshLambertMaterial({ color: 0x315c2b });
    const crownMatB = new MeshLambertMaterial({ color: 0x4d6d33 });
    const rockMat = new MeshLambertMaterial({ color: 0x68716a });
    const shrubMat = new MeshLambertMaterial({ color: 0x496f36 });
    const flowerMat = new MeshLambertMaterial({ color: 0xd49a36 });
    const dryGrassMat = new MeshLambertMaterial({ color: 0x9a9a72 });

    for (let y = 2; y < this.world.terrain.height - 2; y += 3) {
      for (let x = 2; x < this.world.terrain.width - 2; x += 3) {
        const terrain = this.world.terrain.terrainAt?.(x, y);
        if (
          !this.world.terrain.passable(x, y) ||
          terrain === 'road' ||
          terrain === 'shore' ||
          this.world.oreAt(x, y) > 0 ||
          this.nearInitialEntityCell(x, y, 5)
        ) continue;
        const r = this.randCell(x, y);
        const limit = terrain === 'marsh' ? 0.42 : 0.24;
        if (r > limit) continue;
        const pos = cellToWorld3D(x + this.randCell(x, y, 2) * 1.4 - 0.7, y + this.randCell(x, y, 3) * 1.4 - 0.7);
        if (r < 0.075) {
          const tree = this.createLandscapeTree(trunkMat, this.randCell(x, y, 4) > 0.45 ? crownMatA : crownMatB);
          tree.position.set(pos.x, 0.05, pos.z);
          tree.rotation.y = this.randCell(x, y, 5) * Math.PI * 2;
          tree.scale.setScalar(0.8 + this.randCell(x, y, 6) * 0.55);
          this.scene.add(tree);
        } else if (r < 0.115) {
          const rock = new Mesh(this.rockGeo, rockMat);
          rock.position.set(pos.x, 0.2, pos.z);
          rock.rotation.set(this.randCell(x, y, 7), this.randCell(x, y, 8) * Math.PI, this.randCell(x, y, 9));
          rock.scale.set(1.2, 0.55 + this.randCell(x, y, 10) * 0.35, 0.85);
          this.scene.add(rock);
        } else {
          const plant = this.createGrassClump(r < 0.18 ? shrubMat : flowerMat, dryGrassMat, x, y);
          plant.position.set(pos.x, 0.04, pos.z);
          plant.rotation.y = this.randCell(x, y, 11) * Math.PI * 2;
          this.scene.add(plant);
        }
      }
    }
  }

  private createLandscapeTree(trunkMat: MeshLambertMaterial, crownMat: MeshLambertMaterial): Object3D {
    const root = new Group();
    const trunk = new Mesh(this.treeTrunkGeo, trunkMat);
    trunk.position.y = 0.38;
    trunk.rotation.z = 0.08;
    const crownA = new Mesh(this.treeCrownGeo, crownMat);
    crownA.position.set(0, 0.98, 0);
    crownA.scale.set(1, 0.82, 1);
    const crownB = new Mesh(this.treeCrownGeo, crownMat);
    crownB.position.set(0.22, 1.18, -0.12);
    crownB.scale.set(0.78, 0.68, 0.78);
    root.add(trunk, crownA, crownB);
    return root;
  }

  private createGrassClump(primaryMat: MeshLambertMaterial, dryGrassMat: MeshLambertMaterial, cellX: number, cellY: number): Object3D {
    const root = new Group();
    for (let i = 0; i < 3; i++) {
      const blade = new Mesh(this.grassTuftGeo, i === 0 ? primaryMat : dryGrassMat);
      blade.position.set((this.randCell(cellX, cellY, 20 + i) - 0.5) * 0.62, 0.2, (this.randCell(cellX, cellY, 30 + i) - 0.5) * 0.62);
      blade.rotation.y = this.randCell(cellX, cellY, 40 + i) * Math.PI * 2;
      blade.rotation.z = (this.randCell(cellX, cellY, 50 + i) - 0.5) * 0.35;
      blade.scale.setScalar(0.72 + this.randCell(cellX, cellY, 60 + i) * 0.5);
      root.add(blade);
    }
    return root;
  }

  private nearInitialEntityCell(cellX: number, cellY: number, radius: number): boolean {
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      const ex = type?.building ? e.cellX + (type.building.footprintW - 1) / 2 : e.x / 256;
      const ey = type?.building ? e.cellY + (type.building.footprintH - 1) / 2 : e.y / 256;
      if (Math.hypot(cellX - ex, cellY - ey) <= radius) return true;
    }
    return false;
  }

  private randCell(x: number, y: number, salt = 0): number {
    const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
    return v - Math.floor(v);
  }

  private drawOre(): void {
    const oreMat = new MeshStandardMaterial({ color: 0xd8a51d, roughness: 0.55, metalness: 0.15 });
    for (let y = 0; y < this.world.terrain.height; y++) {
      for (let x = 0; x < this.world.terrain.width; x++) {
        const ore = this.world.oreAt(x, y);
        if (ore <= 0) continue;
        const count = Math.max(1, Math.min(5, Math.round(ore / 150)));
        for (let i = 0; i < count; i++) {
          const c = new Mesh(this.oreGeo, oreMat);
          const pos = cellToWorld3D(x, y);
          const ox = ((i * 37) % 9) / 9 - 0.5;
          const oz = ((i * 53) % 9) / 9 - 0.5;
          c.position.set(pos.x + ox, 0.12, pos.z + oz);
          c.scale.setScalar(0.75 + i * 0.08);
          this.scene.add(c);
        }
      }
    }
  }

  private syncEntities(alpha: number, selected: ReadonlySet<number>, nearbyHpIds: ReadonlySet<number>): void {
    const seen = new Set<number>();
    const instanced = new Map<string, { type: UnitType; owner: number; ids: number[] }>();
    const combatIds = this.combatEntityIds();
    const nowSeconds = performance.now() / 1000;
    const airOrbitCenters = this.aircraftOrbitCenters();
    for (const e of this.world.entities.values()) {
      seen.add(e.id);
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
      const hasExternalModel = this.modelTemplates.has(type.id);
      const useInstancedModel = shouldUseInstancedUnitModel3D(type, hasExternalModel);
      if (useInstancedModel) {
        const key = this.instancedModelKey(type.id, e.owner);
        const batch = instanced.get(key) ?? { type, owner: e.owner, ids: [] };
        batch.ids.push(e.id);
        instanced.set(key, batch);
      }
      let view = this.views.get(e.id);
      if (!view) {
        view = this.createEntityView(type, e.owner, e.id);
        view.root.userData.last = { x: e.x, y: e.y };
        this.views.set(e.id, view);
        this.entityLayer.add(view.root);
      }

      if (type.building) {
        const pos = cellToWorld3D(e.cellX + (type.building.footprintW - 1) / 2, e.cellY + (type.building.footprintH - 1) / 2);
        view.root.position.set(pos.x, entityRootAltitude3D(type), pos.z);
      } else {
        const last = view.root.userData.last as { x: number; y: number } | undefined;
        const lx = last?.x ?? e.x;
        const ly = last?.y ?? e.y;
        const pos = leptonToWorld3D(lx + (e.x - lx) * alpha, ly + (e.y - ly) * alpha);
        const loiterCenter =
          type.domain === 'aircraft' && e.airLoiterX >= 0 && e.airLoiterY >= 0
            ? cellToWorld3D(e.airLoiterX, e.airLoiterY)
            : null;
        const attackTarget = e.targetId !== null ? this.world.entities.get(e.targetId) : undefined;
        const attackTargetType = attackTarget ? this.world.rules.units.get(attackTarget.typeId) : undefined;
        const aircraftActivity = {
          targetId: e.targetId,
          pathLength: e.path.length,
          goal: e.goal,
          waypoint: e.waypoint,
          attackMove: e.attackMove,
          bombing: type.domain === 'aircraft' && !!attackTargetType && attackTargetType.domain !== 'aircraft',
          loiterCenter,
        };
        const orbit = aircraftIdleOrbitOffset3D(
          type,
          aircraftActivity,
          { x: pos.x, z: pos.z },
          airOrbitCenters.get(e.owner),
          nowSeconds,
          e.id,
        );
        const orbiting = type.domain === 'aircraft' && (Math.abs(orbit.x) > 0.001 || Math.abs(orbit.z) > 0.001);
        const desired = new Vector3(pos.x + orbit.x, entityRootAltitude3D(type) + orbit.y, pos.z + orbit.z);
        if (type.domain === 'aircraft') {
          const lastVisual = view.root.userData.visualPosition as Vector3 | undefined;
          const lastVelocity = view.root.userData.visualVelocity as Vector3 | undefined;
          const lastVisualTime = view.root.userData.visualTime as number | undefined;
          const dt = Math.max(1 / 120, Math.min(0.12, lastVisualTime === undefined ? 1 / 60 : nowSeconds - lastVisualTime));
          const visual = lastVisual
            ? aircraftVisualDampedStep3D(lastVisual, desired, lastVelocity, dt)
            : { position: desired, velocity: new Vector3() };
          view.root.position.copy(visual.position);
          view.root.userData.visualPosition = visual.position.clone();
          view.root.userData.visualVelocity = visual.velocity.clone();
          view.root.userData.visualTime = nowSeconds;
        } else {
          view.root.position.copy(desired);
        }
        const loiterYaw = aircraftLoiterYaw3D(type, aircraftActivity, nowSeconds, e.id);
        view.root.rotation.y = orbiting && loiterYaw !== null ? loiterYaw : entityYawForFacing3D(e.facing);
      }
      // TEL 发射架：有目标时竖起（约 80°），无目标时水平放置
      if (type.id === 'tel' || type.id === 'arty') {
        const launcher = view.visualRoot.getObjectByName('tel-launcher');
        if (launcher) {
          const deployTime = type.deployTime ?? 0;
          const deployProgress = e.deployMode === 'undeploy' && deployTime > 0
            ? e.deployTimer / deployTime
            : e.deployed
            ? 1
            : e.deployMode === 'deploy' && deployTime > 0 && e.deployTimer > 0
              ? 1 - e.deployTimer / deployTime
              : 0;
          const targetAngle = -Math.PI * 0.44 * Math.max(0, Math.min(1, deployProgress));
          // 平滑插值至目标角度
          const current = launcher.rotation.z;
          launcher.rotation.z = current + (targetAngle - current) * 0.15;
        }
      }
      const constructionPct = entityConstructionProgress3D(e);
      const constructing = type.domain === 'building' && constructionPct < 1;
      const selectedScale = selected.has(e.id) ? 1.12 : 1;
      view.visualRoot.scale.set(selectedScale, selectedScale * (constructing ? 0.88 + constructionPct * 0.12 : 1), selectedScale);
      this.setVisualOpacity(view.visualRoot, constructing ? entityConstructionOpacity3D(e) : 1);
      view.selectionRing.visible = selected.has(e.id);
      this.applyHpBarProfile(view.hpBar, constructing ? entityConstructionBarProfile3D(type) : null);
      view.hpBar.rotation.y = entityHpBarYaw3D(view.root.rotation.y);
      const showHpBar = entityHpBarVisible3D({
        hp: e.hp,
        maxHp: e.maxHp,
        selected: selected.has(e.id),
        nearby: nearbyHpIds.has(e.id),
        combat: combatIds.has(e.id),
        constructing,
      });
      this.updateHpBar(
        view.hpBar,
        constructing ? constructionPct : e.hp / e.maxHp,
        constructing ? this.hpConstructionMat.mat : this.hpMaterialForOwner(e.owner),
        showHpBar,
      );
      const missileStatus = tacticalMissileStatus3D(e, type, this.localPlayerId);
      view.statusBar.rotation.y = entityHpBarYaw3D(view.root.rotation.y);
      this.updateHpBar(
        view.statusBar,
        missileStatus?.pct ?? 0,
        missileStatus?.kind === 'cooldown' ? this.missileCooldownMat.mat : this.missileDeployMat.mat,
        missileStatus !== null,
      );
      this.updateStatusLabel(
        view.statusLabel,
        missileStatus?.label ?? '',
        missileStatus !== null,
      );
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.disposeObject(view.root);
        this.views.delete(id);
      }
    }
    this.syncInstancedUnitModels(instanced, nowSeconds);
  }

  private syncInstancedUnitModels(groups: Map<string, { type: UnitType; owner: number; ids: number[] }>, timeSeconds: number): void {
    for (const [key, batch] of this.instancedBatches) {
      if (groups.has(key)) continue;
      this.disposeObject(batch.root);
      this.instancedBatches.delete(key);
    }

    for (const [key, group] of groups) {
      let batch = this.instancedBatches.get(key);
      if (!batch || batch.capacity < group.ids.length) {
        if (batch) {
          this.disposeObject(batch.root);
          this.instancedBatches.delete(key);
        }
        batch = this.createInstancedModelBatch(group.type, group.owner, this.nextInstancedCapacity(group.ids.length));
        this.instancedBatches.set(key, batch);
        this.entityLayer.add(batch.root);
      }

      batch.ids = [...group.ids];
      for (const part of batch.parts) {
        part.mesh.count = batch.ids.length;
        part.mesh.userData.instancedEntityIds = batch.ids;
      }

      for (let i = 0; i < batch.ids.length; i++) {
        const entityId = batch.ids[i]!;
        const view = this.views.get(entityId);
        if (!view) continue;
        const entity = this.world.entities.get(entityId);
        view.root.updateMatrixWorld(true);
        view.visualRoot.updateMatrixWorld(true);
        const base = view.visualRoot.matrixWorld;
        for (const part of batch.parts) {
          const local = this.instancedPartLocalMatrix(part, group.type, entity, view, timeSeconds);
          const matrix = base.clone().multiply(local);
          part.mesh.setMatrixAt(i, matrix);
        }
      }

      for (const part of batch.parts) {
        part.mesh.instanceMatrix.needsUpdate = true;
        part.mesh.boundingSphere = null;
        part.mesh.boundingBox = null;
      }
    }
  }

  private createInstancedModelBatch(type: UnitType, owner: number, capacity: number): InstancedModelBatch {
    const root = new Group();
    root.name = `instanced-${type.id}-${owner}`;
    const prototype = this.createInstancedModelPrototype(type, playerColorForOwner(owner));
    prototype.updateMatrixWorld(true);
    const parts: InstancedModelPart[] = [];
    prototype.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const geometry = (mesh.geometry as BufferGeometry).clone();
      const material = this.cloneMaterial(mesh.material as Material | Material[]);
      const instanced = new InstancedMesh(geometry, material, capacity);
      instanced.name = `instanced-${type.id}-${mesh.name || 'part'}`;
      instanced.count = 0;
      instanced.userData.instancedEntityIds = [];
      configureInstancedUnitMesh3D(instanced, type.id);
      parts.push({ mesh: instanced, partId: lowPolyPartId3D(mesh.name), localMatrix: mesh.matrixWorld.clone() });
      root.add(instanced);
    });
    return { root, typeId: type.id, owner, capacity, ids: [], parts };
  }

  private instancedPartLocalMatrix(
    part: InstancedModelPart,
    type: UnitType,
    entity: Entity | undefined,
    view: EntityView,
    timeSeconds: number,
  ): Matrix4 {
    const local = part.localMatrix.clone();
    if (type.id !== 'gi' || !entity) return local;

    const moving = this.entityMovingForWalkAnimation(entity, view);
    const firing = this.entityFiringForInfantryAnimation(entity);
    const walk = infantryWalkPartTransform3D(part.partId, moving, entity.id, timeSeconds);
    const fire = infantryFirePartTransform3D(part.partId, firing, entity.id, timeSeconds);
    const transform = {
      translationY: walk.translationY + fire.translationY,
      translationZ: walk.translationZ + fire.translationZ,
      rotationX: walk.rotationX + fire.rotationX,
      rotationZ: walk.rotationZ + fire.rotationZ,
    };
    if (
      transform.translationY === 0 &&
      transform.translationZ === 0 &&
      transform.rotationX === 0 &&
      transform.rotationZ === 0
    ) {
      return local;
    }

    if (transform.rotationX !== 0) {
      local.multiply(this.instancedPartRotateXMatrix.makeRotationX(transform.rotationX));
    }
    if (transform.rotationZ !== 0) {
      local.multiply(this.instancedPartRotateZMatrix.makeRotationZ(transform.rotationZ));
    }
    if (transform.translationY !== 0 || transform.translationZ !== 0) {
      local.premultiply(this.instancedPartTranslateMatrix.makeTranslation(0, transform.translationY, transform.translationZ));
    }
    return local;
  }

  private entityMovingForWalkAnimation(entity: Entity, view: EntityView): boolean {
    const last = view.root.userData.last as { x: number; y: number } | undefined;
    const dx = entity.x - (last?.x ?? entity.x);
    const dy = entity.y - (last?.y ?? entity.y);
    return Math.hypot(dx, dy) > 0.5 || entity.path.length > 0 || entity.waypoint !== null || entity.goal !== null;
  }

  private entityFiringForInfantryAnimation(entity: Entity): boolean {
    return entity.cooldown > 0 || entity.targetId !== null;
  }

  private createInstancedModelPrototype(type: UnitType, ownerColor: number): Object3D {
    if (type.id === 'gi') return this.createInfantry(ownerColor);
    if (usesLowPolyTankModel3D(type)) return this.createTank(ownerColor);
    if (type.id === 'fighter') return this.createAircraft(ownerColor);
    return this.createVehiclePlaceholder(ownerColor, !!type.weapon);
  }

  private cloneMaterial(material: Material | Material[]): Material | Material[] {
    return Array.isArray(material) ? material.map((m) => m.clone()) : material.clone();
  }

  private instancedModelKey(typeId: string, owner: number): string {
    return `${owner}:${typeId}`;
  }

  private nextInstancedCapacity(count: number): number {
    let capacity = 16;
    while (capacity < count) capacity *= 2;
    return capacity;
  }

  private createEntityView(type: UnitType, owner: number, entityId: number): EntityView {
    const root = new Group();
    const visualRoot = new Group();
    visualRoot.position.y = entityVisualAltitude3D(type);
    root.userData.entityId = entityId;
    root.userData.typeId = type.id;
    const ownerColor = playerColorForOwner(owner);
    const model = this.createModelInstance(type, entityId);
    const useInstancedModel = shouldUseInstancedUnitModel3D(type, !!model);
    visualRoot.rotation.y = proceduralModelYawOffset3D(type, !!model);

    if (model) {
      visualRoot.add(model);
    } else if (useInstancedModel) {
      if (type.domain === 'aircraft') root.add(this.createAircraftShadow());
    } else if (type.building) {
      visualRoot.add(this.createBuilding(type, ownerColor));
    } else if (type.domain === 'vehicle') {
      visualRoot.add(
        usesLowPolyTankModel3D(type)
          ? this.createTank(ownerColor)
          : type.id === 'harvester'
            ? this.createHarvester(ownerColor)
            : type.id === 'tel' || type.id === 'arty'
              ? this.createTelVehicle(ownerColor)
              : this.createVehiclePlaceholder(ownerColor, !!type.weapon),
      );
    } else if (type.domain === 'aircraft') {
      visualRoot.add(this.createAircraft(ownerColor));
      root.add(this.createAircraftShadow());
    } else if (type.id === 'worker') {
      visualRoot.add(this.createWorker(ownerColor));
    } else {
      visualRoot.add(this.createInfantry(ownerColor));
    }

    root.add(visualRoot);

    const hpProfile = entityHpBarProfile3D(type);
    const hpBar = this.createHpBar(hpProfile.width, hpProfile.y);
    const statusBar = this.createHpBar(1.2, Math.max(1.45, hpProfile.y - 0.28));
    const statusLabel = this.createStatusLabel(Math.max(1.95, hpProfile.y + 0.42));
    const selectionRing = new Mesh(this.selectionRingGeo, this.selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = entitySelectionRingAltitude3D(type);
    selectionRing.scale.setScalar(entitySelectionRingScale3D(type));
    selectionRing.visible = false;
    root.add(selectionRing, hpBar, statusBar, statusLabel);
    root.traverse((child) => {
      child.userData.entityId = entityId;
    });
    return { root, visualRoot, hpBar, statusBar, statusLabel, selectionRing };
  }

  private createVehiclePlaceholder(ownerColor: number, armed: boolean): Object3D {
    const root = new Group();
    const body = new Mesh(this.vehicleGeo, new MeshLambertMaterial({ color: ownerColor }));
    body.position.y = 0.22;
    root.add(body);
    if (armed) {
      const barrel = new Mesh(this.barrelGeo, new MeshLambertMaterial({ color: 0x343a3f }));
      barrel.position.set(0, 0.35, -0.55);
      root.add(barrel);
    }
    return root;
  }

  private createBuilding(type: UnitType, ownerColor: number): Object3D {
    if (type.id === 'conyard') return this.createConstructionYard(ownerColor);
    if (type.id === 'barracks') return this.createBarracks(ownerColor);
    if (type.id === 'warfactory') return this.createWarFactory(ownerColor);
    if (type.id === 'airbase') return this.createAirbase(ownerColor);
    if (type.id === 'refinery') return this.createRefinery(ownerColor);
    if (type.id === 'powerplant') return this.createPowerPlant(ownerColor);
    if (type.id === 'patriot') return this.createPatriotBattery(ownerColor);

    const b = type.building!;
    const root = new Group();
    const h = type.id === 'conyard' ? 1.8 : type.id === 'warfactory' ? 1.35 : type.id === 'pillbox' ? 0.55 : type.id === 'airbase' ? 0.55 : 1.1;
    const mat = new MeshLambertMaterial({ color: type.id === 'pillbox' ? 0x77715f : ownerColor });
    const body = new Mesh(new BoxGeometry(b.footprintW * 1.65, h, b.footprintH * 1.65), mat);
    body.position.y = h / 2;
    root.add(body);
    if (type.id === 'airbase') {
      const runway = new Mesh(new BoxGeometry(b.footprintW * 1.5, 0.08, b.footprintH * 0.42), new MeshLambertMaterial({ color: 0x30343a }));
      runway.position.y = h + 0.08;
      const stripe = new Mesh(new BoxGeometry(b.footprintW * 1.25, 0.09, 0.08), new MeshLambertMaterial({ color: 0xd8d3a4 }));
      stripe.position.y = h + 0.14;
      const tower = new Mesh(new BoxGeometry(0.48, 1.1, 0.48), new MeshLambertMaterial({ color: 0x7b806f }));
      tower.position.set(b.footprintW * 0.52, h + 0.55, -b.footprintH * 0.44);
      root.add(runway, stripe, tower);
    }
    if (type.id === 'conyard' || type.id === 'barracks') {
      const roof = new Mesh(new ConeGeometry(Math.max(b.footprintW, b.footprintH) * 1.25, 0.75, 4), new MeshLambertMaterial({ color: 0x6a624b }));
      roof.position.y = h + 0.35;
      roof.rotation.y = Math.PI / 4;
      root.add(roof);
    }
    return root;
  }

  private createAirbase(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-airbase';
    const concreteMat = new MeshLambertMaterial({ color: 0x686d64 });
    const runwayMat = new MeshLambertMaterial({ color: 0x30383c });
    const hangarMat = new MeshLambertMaterial({ color: 0x5f6a63 });
    const roofMat = new MeshLambertMaterial({ color: 0x384246 });
    const metalMat = new MeshLambertMaterial({ color: 0x2d3438 });
    const stripeMat = new MeshLambertMaterial({ color: 0xd8d3a4 });
    const glassMat = new MeshLambertMaterial({ color: 0x26384a });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `airbase-${name}`;
      root.add(mesh);
      return mesh;
    };

    const pad = addPart('foundation', new Mesh(new BoxGeometry(5.75, 0.18, 3.75), concreteMat));
    pad.position.y = 0.09;

    const runway = addPart('runway', new Mesh(new BoxGeometry(5.25, 0.08, 1.08), runwayMat));
    runway.position.set(0, 0.23, 0.72);
    for (let i = 0; i < 5; i++) {
      const stripe = addPart(`runway-stripe-${i}`, new Mesh(new BoxGeometry(0.42, 0.09, 0.08), stripeMat));
      stripe.position.set(-1.9 + i * 0.95, 0.29, 0.72);
    }

    const apron = addPart('apron', new Mesh(new BoxGeometry(2.25, 0.1, 1.35), runwayMat));
    apron.position.set(-1.35, 0.25, -0.82);
    const helipad = addPart('service-pad', new Mesh(new BoxGeometry(1.08, 0.11, 1.08), concreteMat));
    helipad.position.set(1.85, 0.27, -0.68);
    const padMarkA = addPart('service-pad-mark-a', new Mesh(new BoxGeometry(0.72, 0.12, 0.08), stripeMat));
    padMarkA.position.set(1.85, 0.34, -0.68);
    const padMarkB = addPart('service-pad-mark-b', new Mesh(new BoxGeometry(0.08, 0.12, 0.72), stripeMat));
    padMarkB.position.set(1.85, 0.35, -0.68);

    const hangar = addPart('hangar', new Mesh(new BoxGeometry(1.65, 0.92, 1.45), hangarMat));
    hangar.position.set(-1.7, 0.72, -0.72);
    const hangarDoor = addPart('hangar-door', new Mesh(new BoxGeometry(1.18, 0.62, 0.08), metalMat));
    hangarDoor.position.set(-1.7, 0.58, 0.04);
    const hangarRoof = addPart('hangar-roof', new Mesh(new ConeGeometry(1.08, 0.56, 4), roofMat));
    hangarRoof.position.set(-1.7, 1.35, -0.72);
    hangarRoof.rotation.y = Math.PI / 4;
    hangarRoof.scale.z = 0.78;

    const tower = addPart('control-tower', new Mesh(new BoxGeometry(0.55, 1.65, 0.55), hangarMat));
    tower.position.set(1.76, 1.04, -1.18);
    const towerCab = addPart('control-cab', new Mesh(new BoxGeometry(0.82, 0.42, 0.72), glassMat));
    towerCab.position.set(1.76, 1.98, -1.18);
    const towerRoof = addPart('control-roof', new Mesh(new BoxGeometry(0.92, 0.16, 0.82), roofMat));
    towerRoof.position.set(1.76, 2.28, -1.18);
    const antenna = addPart('tower-antenna', new Mesh(new BoxGeometry(0.05, 0.9, 0.05), metalMat));
    antenna.position.set(1.76, 2.82, -1.18);

    const radarMast = addPart('radar-mast', new Mesh(new BoxGeometry(0.09, 0.85, 0.09), metalMat));
    radarMast.position.set(2.28, 0.88, -0.38);
    const radarDish = addPart('radar-dish', new Mesh(new ConeGeometry(0.28, 0.13, 12), metalMat));
    radarDish.position.set(2.28, 1.36, -0.18);
    radarDish.rotation.x = Math.PI / 2;

    for (let i = 0; i < 2; i++) {
      const tank = addPart(`fuel-tank-${i}`, new Mesh(new BoxGeometry(0.44, 0.5, 0.72), metalMat));
      tank.position.set(-0.28 + i * 0.58, 0.5, -1.38);
      const cap = addPart(`fuel-tank-cap-${i}`, new Mesh(new BoxGeometry(0.5, 0.08, 0.78), roofMat));
      cap.position.set(-0.28 + i * 0.58, 0.8, -1.38);
    }

    const teamPanel = addPart('team-panel', new Mesh(new BoxGeometry(0.9, 0.1, 0.12), accentMat));
    teamPanel.position.set(-1.7, 1.05, 0.06);
    const beacon = addPart('beacon', new Mesh(new BoxGeometry(0.18, 0.2, 0.18), accentMat));
    beacon.position.set(1.76, 2.48, -1.18);

    return root;
  }

  /** 爱国者防空反导系统（Patriot PAC-3）低多边形模型：
   *  四联装发射架 + 旋转底座 + 相控阵雷达天线 + 控制方舱。 */
  private createPatriotBattery(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-patriot';
    // 配色：参照真实爱国者发射车（橄榄绿/沙色涂装）
    const bodyMat = new MeshLambertMaterial({ color: 0x4a5238 });   // 军绿车身
    const darkMat = new MeshLambertMaterial({ color: 0x2a2f1e });  // 深色部件
    const metalMat = new MeshLambertMaterial({ color: 0x3a3f30 }); // 金属支架
    const rubberMat = new MeshLambertMaterial({ color: 0x1a1d14 });// 轮胎
    const crateMat = new MeshLambertMaterial({ color: 0x5d6442 }); // 发射箱体（同色）
    const tubeMat = new MeshLambertMaterial({ color: 0x6b7350 });  // 发射管口
    const glassMat = new MeshLambertMaterial({ color: 0x223344 }); // 驾驶舱玻璃
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `patriot-${name}`;
      root.add(mesh);
      return mesh;
    };

    // —— 地台/压痕（部署后的地面痕迹，不抬高）——
    const pad = addPart('pad', new Mesh(new BoxGeometry(3.0, 0.04, 2.4), new MeshLambertMaterial({ color: 0x3a3d2e })));
    pad.position.y = 0.02;

    // —— 卡车底盘（M860半挂/HEMTT牵引车风格）——
    // 主纵梁
    const chassis = addPart('chassis', new Mesh(new BoxGeometry(2.6, 0.18, 1.5), darkMat));
    chassis.position.set(0, 0.32, 0);
    // 底盘横梁
    for (const z of [-0.55, 0, 0.55]) {
      const cross = addPart(`cross-${z}`, new Mesh(new BoxGeometry(2.5, 0.1, 0.1), darkMat));
      cross.position.set(0, 0.36, z);
    }

    // —— 轮组（3轴6轮，重型越野底盘）——
    const wheelGeo = new CylinderGeometry(0.28, 0.28, 0.18, 12);
    const wheelPositions: Array<[number, number]> = [
      [-0.9, -0.7], [-0.9, 0.7],
      [0.0, -0.7], [0.0, 0.7],
      [0.9, -0.7], [0.9, 0.7],
    ];
    for (let i = 0; i < wheelPositions.length; i++) {
      const [wx, wz] = wheelPositions[i]!;
      const wheel = addPart(`wheel-${i}`, new Mesh(wheelGeo, rubberMat));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.28, wz);
      // 轮毂
      const hub = addPart(`hub-${i}`, new Mesh(new CylinderGeometry(0.1, 0.1, 0.2, 8), metalMat));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.28, wz);
    }

    // —— 驾驶室（车头方向，+X 侧）——
    const cab = addPart('cab', new Mesh(new BoxGeometry(0.7, 0.6, 1.4), bodyMat));
    cab.position.set(1.15, 0.7, 0);
    // 驾驶室顶部（略斜）
    const cabRoof = addPart('cab-roof', new Mesh(new BoxGeometry(0.72, 0.08, 1.42), darkMat));
    cabRoof.position.set(1.15, 1.02, 0);
    // 挡风玻璃
    const windshield = addPart('windshield', new Mesh(new BoxGeometry(0.04, 0.3, 1.2), glassMat));
    windshield.position.set(1.5, 0.78, 0);
    // 车头保险杠
    const bumper = addPart('bumper', new Mesh(new BoxGeometry(0.12, 0.18, 1.6), darkMat));
    bumper.position.set(1.55, 0.4, 0);

    // —— 旋转转台（连接底盘与发射架）——
    const turntable = addPart('turntable', new Mesh(new CylinderGeometry(0.55, 0.65, 0.18, 12), metalMat));
    turntable.position.set(-0.2, 0.5, 0);
    // 转台外圈
    const turntableRing = addPart('turntable-ring', new Mesh(new TorusGeometry(0.6, 0.05, 6, 16), darkMat));
    turntableRing.position.set(-0.2, 0.6, 0);
    turntableRing.rotation.x = Math.PI / 2;

    // —— 四个液压支撑腿（部署时伸出接地）——
    const jackPositions: Array<[number, number]> = [
      [-1.1, -1.0], [-1.1, 1.0],
      [0.7, -1.0], [0.7, 1.0],
    ];
    for (let i = 0; i < jackPositions.length; i++) {
      const [jx, jz] = jackPositions[i]!;
      // 支撑臂（斜向外伸）
      const arm = addPart(`jack-arm-${i}`, new Mesh(new BoxGeometry(0.12, 0.12, 0.7), metalMat));
      arm.position.set(jx, 0.42, jz);
      arm.rotation.y = Math.atan2(jz, jx);
      // 支撑底脚（接地）
      const foot = addPart(`jack-foot-${i}`, new Mesh(new CylinderGeometry(0.12, 0.16, 0.1, 8), darkMat));
      foot.position.set(jx, 0.06, jz);
      // 液压缸
      const cyl = addPart(`jack-cyl-${i}`, new Mesh(new CylinderGeometry(0.05, 0.05, 0.36, 6), metalMat));
      cyl.position.set(jx, 0.24, jz);
    }

    // —— 发射架组（仰角约30°，指向天空）——
    const launcherGroup = new Group();
    launcherGroup.name = 'patriot-launcher';
    launcherGroup.position.set(-0.2, 0.62, 0);
    launcherGroup.rotation.x = -Math.PI / 6; // 仰角 30°

    // 发射架主框架（箱体结构，容纳4个发射管）
    const frame = new Mesh(new BoxGeometry(1.5, 0.5, 1.2), crateMat);
    frame.name = 'patriot-launcher-frame';
    frame.position.set(0, 0.25, 0);
    launcherGroup.add(frame);
    // 框架边沿（深色加固条）
    const frameEdge = new Mesh(new BoxGeometry(1.54, 0.54, 1.24), darkMat);
    frameEdge.name = 'patriot-launcher-frame-edge';
    frameEdge.position.set(0, 0.25, -0.02);
    frameEdge.scale.set(1, 1, 0.02);
    launcherGroup.add(frameEdge);

    // 四个密封发射箱（2x2排列，矩形管口朝前上方）
    const tubePositions: Array<[number, number]> = [
      [-0.32, 0.3], [0.32, 0.3],
      [-0.32, -0.3], [0.32, -0.3],
    ];
    for (let i = 0; i < tubePositions.length; i++) {
      const [tx, tz] = tubePositions[i]!;
      // 发射箱体（长方形密封罐）
      const tube = new Mesh(new BoxGeometry(1.4, 0.36, 0.36), crateMat);
      tube.name = `patriot-tube-${i}`;
      tube.position.set(0, 0.25, 0);
      // 偏移到各自位置
      const tubeGroup = new Group();
      tubeGroup.name = `patriot-tube-group-${i}`;
      tubeGroup.position.set(tx, 0, tz);
      tubeGroup.add(tube);
      // 发射管口（前端，深色圆口）
      const muzzle = new Mesh(new CylinderGeometry(0.13, 0.13, 0.06, 10), tubeMat);
      muzzle.name = `patriot-tube-muzzle-${i}`;
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0.72, 0.25, 0);
      tubeGroup.add(muzzle);
      // 管口密封盖（前端的方形盖板，发射时脱落）
      const seal = new Mesh(new BoxGeometry(0.04, 0.34, 0.34), darkMat);
      seal.name = `patriot-tube-seal-${i}`;
      seal.position.set(0.74, 0.25, 0);
      tubeGroup.add(seal);
      // 发射箱固定卡箍（环形固定件）
      const clamp = new Mesh(new TorusGeometry(0.2, 0.03, 4, 8), metalMat);
      clamp.name = `patriot-tube-clamp-${i}`;
      clamp.rotation.y = Math.PI / 2;
      clamp.position.set(-0.4, 0.25, 0);
      tubeGroup.add(clamp);
      launcherGroup.add(tubeGroup);
    }

    // 发射架侧边加固肋
    for (const side of [-1, 1]) {
      const rib = new Mesh(new BoxGeometry(1.5, 0.06, 0.06), darkMat);
      rib.name = `patriot-rib-${side}`;
      rib.position.set(0, 0.5, side * 0.6);
      launcherGroup.add(rib);
    }

    // 发射架液压俯仰装置（连接转台与发射架底部）
    const elevActuator = new Mesh(new CylinderGeometry(0.06, 0.06, 0.4, 6), metalMat);
    elevActuator.name = 'patriot-elev-actuator';
    elevActuator.rotation.x = Math.PI / 2;
    elevActuator.position.set(0.6, 0.1, 0);
    launcherGroup.add(elevActuator);

    root.add(launcherGroup);

    // —— 顶部状态指示灯（闪烁灯，玩家色）——
    const statusLight = addPart('status-light', new Mesh(new BoxGeometry(0.08, 0.08, 0.08), accentMat));
    statusLight.position.set(1.15, 1.12, 0);

    // —— 车身识别条纹（玩家色装饰）——
    const stripe = addPart('stripe', new Mesh(new BoxGeometry(0.6, 0.06, 1.3), accentMat));
    stripe.position.set(1.15, 0.55, 0);

    return root;
  }

  private createRefinery(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-refinery';
    const concreteMat = new MeshLambertMaterial({ color: 0x696f66 });
    const wallMat = new MeshLambertMaterial({ color: 0x626d65 });
    const darkWallMat = new MeshLambertMaterial({ color: 0x3d4744 });
    const roofMat = new MeshLambertMaterial({ color: 0x343d3f });
    const metalMat = new MeshLambertMaterial({ color: 0x2d3436 });
    const oreMat = new MeshLambertMaterial({ color: 0xd8a51d });
    const stripeMat = new MeshLambertMaterial({ color: 0xd2bd4c });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `refinery-${name}`;
      root.add(mesh);
      return mesh;
    };

    const pad = addPart('foundation', new Mesh(new BoxGeometry(5.85, 0.2, 5.75), concreteMat));
    pad.position.y = 0.1;

    const processingHall = addPart('processing-hall', new Mesh(new BoxGeometry(2.4, 1.35, 2.15), wallMat));
    processingHall.position.set(-0.75, 0.88, -0.35);
    const hallRoof = addPart('processing-roof', new Mesh(new BoxGeometry(2.55, 0.18, 2.32), roofMat));
    hallRoof.position.set(-0.75, 1.64, -0.35);

    const unloadingBay = addPart('unloading-bay', new Mesh(new BoxGeometry(2.25, 0.82, 1.15), darkWallMat));
    unloadingBay.position.set(0.95, 0.6, 1.48);
    const bayDoor = addPart('unloading-door', new Mesh(new BoxGeometry(1.68, 0.54, 0.08), metalMat));
    bayDoor.position.set(0.95, 0.5, 2.08);
    const ramp = addPart('ore-ramp', new Mesh(new BoxGeometry(2.1, 0.12, 0.92), concreteMat));
    ramp.position.set(0.95, 0.22, 2.58);
    ramp.rotation.x = -0.1;

    const hopper = addPart('ore-hopper', new Mesh(new ConeGeometry(0.92, 0.78, 4), darkWallMat));
    hopper.position.set(1.42, 1.25, -0.62);
    hopper.rotation.y = Math.PI / 4;
    hopper.scale.z = 0.72;
    const hopperTop = addPart('hopper-top', new Mesh(new BoxGeometry(1.45, 0.22, 1.05), metalMat));
    hopperTop.position.set(1.42, 1.76, -0.62);

    const conveyor = addPart('conveyor', new Mesh(new BoxGeometry(2.35, 0.22, 0.34), metalMat));
    conveyor.position.set(0.55, 1.12, 0.52);
    conveyor.rotation.z = 0.12;
    const conveyorOre = addPart('conveyor-ore', new Mesh(new BoxGeometry(1.45, 0.08, 0.22), oreMat));
    conveyorOre.position.set(0.55, 1.28, 0.52);
    conveyorOre.rotation.z = 0.12;

    for (let i = 0; i < 3; i++) {
      const silo = addPart(`storage-silo-${i}`, new Mesh(new BoxGeometry(0.68, 1.35, 0.68), metalMat));
      silo.position.set(1.25 + i * 0.58, 0.9, -1.78);
      const cap = addPart(`storage-silo-cap-${i}`, new Mesh(new ConeGeometry(0.44, 0.34, 8), roofMat));
      cap.position.set(1.25 + i * 0.58, 1.74, -1.78);
    }

    for (let i = 0; i < 5; i++) {
      const nugget = addPart(`ore-pile-${i}`, new Mesh(this.oreGeo, oreMat));
      nugget.position.set(-1.78 + (i % 3) * 0.38, 0.32 + i * 0.03, 1.72 + Math.floor(i / 3) * 0.32);
      nugget.scale.setScalar(1.15 + i * 0.08);
    }

    const pipeA = addPart('pipe-a', new Mesh(new BoxGeometry(0.16, 0.16, 2.15), metalMat));
    pipeA.position.set(-2.0, 1.38, -0.42);
    const pipeB = addPart('pipe-b', new Mesh(new BoxGeometry(0.16, 1.0, 0.16), metalMat));
    pipeB.position.set(-2.0, 0.94, 0.6);
    const teamPanel = addPart('team-panel', new Mesh(new BoxGeometry(0.95, 0.1, 0.12), accentMat));
    teamPanel.position.set(-0.75, 1.22, 0.75);
    const hazard = addPart('bay-hazard-line', new Mesh(new BoxGeometry(1.65, 0.1, 0.08), stripeMat));
    hazard.position.set(0.95, 0.9, 2.12);

    return root;
  }

  private createPowerPlant(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-power-plant';
    const concreteMat = new MeshLambertMaterial({ color: 0x6b7068 });
    const wallMat = new MeshLambertMaterial({ color: 0x5c675f });
    const roofMat = new MeshLambertMaterial({ color: 0x323a3c });
    const metalMat = new MeshLambertMaterial({ color: 0x303538 });
    const darkMat = new MeshLambertMaterial({ color: 0x252b2d });
    const glowMat = new MeshLambertMaterial({ color: 0xe0c94b });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `powerplant-${name}`;
      root.add(mesh);
      return mesh;
    };

    const pad = addPart('foundation', new Mesh(new BoxGeometry(3.75, 0.18, 3.75), concreteMat));
    pad.position.y = 0.09;

    const generatorHall = addPart('generator-hall', new Mesh(new BoxGeometry(2.15, 1.25, 1.8), wallMat));
    generatorHall.position.set(-0.38, 0.78, -0.1);
    const roof = addPart('generator-roof', new Mesh(new BoxGeometry(2.32, 0.18, 1.98), roofMat));
    roof.position.set(-0.38, 1.49, -0.1);

    const turbineBox = addPart('turbine-box', new Mesh(new BoxGeometry(1.05, 0.72, 1.22), metalMat));
    turbineBox.position.set(1.1, 0.55, 0.55);
    const turbineTop = addPart('turbine-top', new Mesh(new BoxGeometry(1.15, 0.15, 1.32), darkMat));
    turbineTop.position.set(1.1, 0.98, 0.55);

    for (let i = 0; i < 3; i++) {
      const vent = addPart(`roof-vent-${i}`, new Mesh(new BoxGeometry(0.38, 0.18, 0.42), metalMat));
      vent.position.set(-1.0 + i * 0.62, 1.68, -0.12);
    }

    const chimneyA = addPart('chimney-a', new Mesh(new BoxGeometry(0.32, 1.65, 0.32), metalMat));
    chimneyA.position.set(1.28, 1.35, -1.18);
    const chimneyB = addPart('chimney-b', new Mesh(new BoxGeometry(0.26, 1.28, 0.26), metalMat));
    chimneyB.position.set(1.66, 1.15, -0.82);
    const capA = addPart('chimney-cap-a', new Mesh(new BoxGeometry(0.48, 0.12, 0.48), roofMat));
    capA.position.set(1.28, 2.22, -1.18);
    const capB = addPart('chimney-cap-b', new Mesh(new BoxGeometry(0.4, 0.1, 0.4), roofMat));
    capB.position.set(1.66, 1.82, -0.82);

    const transformerA = addPart('transformer-a', new Mesh(new BoxGeometry(0.45, 0.56, 0.45), darkMat));
    transformerA.position.set(-1.44, 0.43, 1.22);
    const transformerB = addPart('transformer-b', new Mesh(new BoxGeometry(0.45, 0.56, 0.45), darkMat));
    transformerB.position.set(-0.86, 0.43, 1.22);
    const busBar = addPart('bus-bar', new Mesh(new BoxGeometry(1.1, 0.08, 0.08), glowMat));
    busBar.position.set(-1.15, 0.82, 1.22);

    const cableA = addPart('cable-a', new Mesh(new BoxGeometry(0.08, 0.08, 1.35), metalMat));
    cableA.position.set(-1.14, 0.78, 0.52);
    cableA.rotation.x = 0.1;
    const cableB = addPart('cable-b', new Mesh(new BoxGeometry(0.08, 0.08, 1.1), metalMat));
    cableB.position.set(-0.6, 0.78, 0.48);
    cableB.rotation.x = -0.08;

    const teamPanel = addPart('team-panel', new Mesh(new BoxGeometry(0.72, 0.1, 0.12), accentMat));
    teamPanel.position.set(-0.42, 1.1, 0.82);
    const warningLight = addPart('warning-light', new Mesh(new BoxGeometry(0.18, 0.16, 0.18), glowMat));
    warningLight.position.set(0.55, 1.66, 0.72);

    return root;
  }

  private createBarracks(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-barracks';
    const concreteMat = new MeshLambertMaterial({ color: 0x6c7065 });
    const wallMat = new MeshLambertMaterial({ color: 0x737f70 });
    const roofMat = new MeshLambertMaterial({ color: 0x48544c });
    const darkMat = new MeshLambertMaterial({ color: 0x2f3737 });
    const canvasMat = new MeshLambertMaterial({ color: 0x80785f });
    const sandMat = new MeshLambertMaterial({ color: 0xa08f66 });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `barracks-${name}`;
      root.add(mesh);
      return mesh;
    };

    const pad = addPart('foundation', new Mesh(new BoxGeometry(3.75, 0.18, 3.55), concreteMat));
    pad.position.y = 0.09;

    const main = addPart('main-hut', new Mesh(new BoxGeometry(2.45, 1.05, 1.85), wallMat));
    main.position.set(-0.15, 0.7, 0);

    const roofLeft = addPart('roof-left-slope', new Mesh(new BoxGeometry(2.65, 0.16, 1.08), roofMat));
    roofLeft.position.set(-0.15, 1.31, 0.47);
    roofLeft.rotation.x = 0.34;
    const roofRight = addPart('roof-right-slope', new Mesh(new BoxGeometry(2.65, 0.16, 1.08), roofMat));
    roofRight.position.set(-0.15, 1.31, -0.47);
    roofRight.rotation.x = -0.34;

    const entrance = addPart('front-entry', new Mesh(new BoxGeometry(0.82, 0.74, 0.18), darkMat));
    entrance.position.set(-0.85, 0.56, 0.98);
    const porch = addPart('porch-awning', new Mesh(new BoxGeometry(1.15, 0.12, 0.58), canvasMat));
    porch.position.set(-0.85, 1.05, 1.22);
    porch.rotation.x = 0.16;

    const sideTent = addPart('side-canvas-annex', new Mesh(new BoxGeometry(1.1, 0.72, 1.45), canvasMat));
    sideTent.position.set(1.17, 0.58, -0.18);
    const tentRoof = addPart('side-canvas-roof', new Mesh(new ConeGeometry(0.96, 0.52, 4), canvasMat));
    tentRoof.position.set(1.17, 1.18, -0.18);
    tentRoof.rotation.y = Math.PI / 4;
    tentRoof.scale.z = 0.72;

    for (let i = 0; i < 3; i++) {
      const win = addPart(`side-window-${i}`, new Mesh(new BoxGeometry(0.34, 0.22, 0.06), darkMat));
      win.position.set(-0.9 + i * 0.62, 0.82, -0.95);
    }

    const teamPlate = addPart('team-plate', new Mesh(new BoxGeometry(0.72, 0.09, 0.08), accentMat));
    teamPlate.position.set(0.45, 1.16, 0.98);
    const flagPole = addPart('flag-pole', new Mesh(new BoxGeometry(0.06, 1.25, 0.06), darkMat));
    flagPole.position.set(1.72, 0.92, 1.22);
    const flag = addPart('small-flag', new Mesh(new BoxGeometry(0.48, 0.25, 0.06), accentMat));
    flag.position.set(1.98, 1.42, 1.22);

    const sandbags: [number, number][] = [
      [-1.45, 1.42],
      [-0.85, 1.46],
      [-0.25, 1.46],
      [0.35, 1.44],
      [1.18, 1.27],
      [-1.55, -1.36],
      [-0.9, -1.4],
      [0.95, -1.38],
      [1.48, -1.18],
    ];
    for (let i = 0; i < sandbags.length; i++) {
      const [x, z] = sandbags[i]!;
      const bag = addPart(`sandbag-${i}`, new Mesh(new BoxGeometry(0.52, 0.25, 0.24), sandMat));
      bag.position.set(x, 0.34, z);
      bag.rotation.y = i % 2 === 0 ? 0.08 : -0.12;
    }

    const crate = addPart('supply-crate', new Mesh(new BoxGeometry(0.46, 0.36, 0.46), sandMat));
    crate.position.set(1.42, 0.36, 0.82);
    const antenna = addPart('radio-antenna', new Mesh(new BoxGeometry(0.045, 1.1, 0.045), darkMat));
    antenna.position.set(-1.18, 1.7, -0.72);

    return root;
  }

  private createWarFactory(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-war-factory';
    const concreteMat = new MeshLambertMaterial({ color: 0x686d64 });
    const wallMat = new MeshLambertMaterial({ color: 0x59645f });
    const darkWallMat = new MeshLambertMaterial({ color: 0x3d4846 });
    const roofMat = new MeshLambertMaterial({ color: 0x303a3c });
    const metalMat = new MeshLambertMaterial({ color: 0x2f3336 });
    const rampMat = new MeshLambertMaterial({ color: 0x575b57 });
    const hazardMat = new MeshLambertMaterial({ color: 0xd6b82f });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `warfactory-${name}`;
      root.add(mesh);
      return mesh;
    };

    const pad = addPart('foundation', new Mesh(new BoxGeometry(5.85, 0.22, 5.7), concreteMat));
    pad.position.y = 0.11;

    const hall = addPart('assembly-hall', new Mesh(new BoxGeometry(3.65, 1.45, 3.15), wallMat));
    hall.position.set(-0.25, 0.94, -0.22);

    const roofLeft = addPart('roof-left', new Mesh(new BoxGeometry(3.85, 0.18, 1.78), roofMat));
    roofLeft.position.set(-0.25, 1.72, 0.66);
    roofLeft.rotation.x = 0.26;
    const roofRight = addPart('roof-right', new Mesh(new BoxGeometry(3.85, 0.18, 1.78), roofMat));
    roofRight.position.set(-0.25, 1.72, -1.1);
    roofRight.rotation.x = -0.26;

    const doorFrame = addPart('vehicle-door-frame', new Mesh(new BoxGeometry(2.35, 1.15, 0.18), darkWallMat));
    doorFrame.position.set(-0.3, 0.76, 1.48);
    const door = addPart('vehicle-door', new Mesh(new BoxGeometry(1.9, 0.86, 0.09), metalMat));
    door.position.set(-0.3, 0.62, 1.61);
    for (let i = 0; i < 4; i++) {
      const slat = addPart(`door-slat-${i}`, new Mesh(new BoxGeometry(1.88, 0.05, 0.04), roofMat));
      slat.position.set(-0.3, 0.32 + i * 0.18, 1.67);
    }

    const ramp = addPart('vehicle-ramp', new Mesh(new BoxGeometry(2.45, 0.16, 1.1), rampMat));
    ramp.position.set(-0.3, 0.23, 2.18);
    ramp.rotation.x = -0.12;
    for (let i = 0; i < 4; i++) {
      const stripe = addPart(`hazard-stripe-${i}`, new Mesh(new BoxGeometry(0.22, 0.18, 0.08), hazardMat));
      stripe.position.set(-1.1 + i * 0.72, 0.36, 1.72);
      stripe.rotation.z = -0.45;
    }

    const annex = addPart('side-annex', new Mesh(new BoxGeometry(1.35, 1, 2.25), darkWallMat));
    annex.position.set(2.0, 0.68, -0.18);
    const annexRoof = addPart('side-annex-roof', new Mesh(new BoxGeometry(1.48, 0.18, 2.42), roofMat));
    annexRoof.position.set(2.0, 1.25, -0.18);

    for (let i = 0; i < 3; i++) {
      const vent = addPart(`roof-vent-${i}`, new Mesh(new BoxGeometry(0.5, 0.22, 0.34), metalMat));
      vent.position.set(-1.25 + i * 0.85, 1.93, -0.2);
    }

    const smokeA = addPart('smokestack-a', new Mesh(new BoxGeometry(0.3, 1.45, 0.3), metalMat));
    smokeA.position.set(1.52, 1.85, -1.42);
    const smokeB = addPart('smokestack-b', new Mesh(new BoxGeometry(0.24, 1.1, 0.24), metalMat));
    smokeB.position.set(1.95, 1.62, -1.18);
    const capA = addPart('smokestack-cap-a', new Mesh(new BoxGeometry(0.46, 0.12, 0.46), roofMat));
    capA.position.set(1.52, 2.62, -1.42);
    const capB = addPart('smokestack-cap-b', new Mesh(new BoxGeometry(0.38, 0.1, 0.38), roofMat));
    capB.position.set(1.95, 2.19, -1.18);

    const gantryLeft = addPart('gantry-left-post', new Mesh(new BoxGeometry(0.16, 1.25, 0.16), metalMat));
    gantryLeft.position.set(-1.75, 0.9, 2.02);
    const gantryRight = addPart('gantry-right-post', new Mesh(new BoxGeometry(0.16, 1.25, 0.16), metalMat));
    gantryRight.position.set(1.18, 0.9, 2.02);
    const gantryBeam = addPart('gantry-beam', new Mesh(new BoxGeometry(3.2, 0.18, 0.18), metalMat));
    gantryBeam.position.set(-0.28, 1.55, 2.02);
    const hook = addPart('gantry-hook', new Mesh(new BoxGeometry(0.2, 0.28, 0.2), accentMat));
    hook.position.set(-0.25, 1.22, 2.02);

    const teamBand = addPart('team-band', new Mesh(new BoxGeometry(0.14, 0.86, 2.2), accentMat));
    teamBand.position.set(1.18, 1.03, 1.0);
    const serviceCrateA = addPart('service-crate-a', new Mesh(new BoxGeometry(0.58, 0.38, 0.5), rampMat));
    serviceCrateA.position.set(-2.25, 0.41, -1.9);
    const serviceCrateB = addPart('service-crate-b', new Mesh(new BoxGeometry(0.45, 0.32, 0.62), metalMat));
    serviceCrateB.position.set(-2.25, 0.38, -1.25);

    return root;
  }

  private createConstructionYard(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-construction-yard';
    const concreteMat = new MeshLambertMaterial({ color: 0x6f7469 });
    const wallMat = new MeshLambertMaterial({ color: 0x7f887a });
    const darkWallMat = new MeshLambertMaterial({ color: 0x46514b });
    const roofMat = new MeshLambertMaterial({ color: 0x4d5a52 });
    const metalMat = new MeshLambertMaterial({ color: 0x30383b });
    const glassMat = new MeshLambertMaterial({ color: 0x26384a });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const sandMat = new MeshLambertMaterial({ color: 0xa08f66 });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `conyard-${name}`;
      root.add(mesh);
      return mesh;
    };

    const base = addPart('foundation', new Mesh(new BoxGeometry(5.65, 0.22, 5.65), concreteMat));
    base.position.y = 0.11;

    const yardPad = addPart('inner-pad', new Mesh(new BoxGeometry(4.7, 0.06, 4.45), darkWallMat));
    yardPad.position.y = 0.26;

    const command = addPart('command-block', new Mesh(new BoxGeometry(1.95, 1.35, 1.65), wallMat));
    command.position.set(-0.25, 0.94, -0.35);

    const commandRoof = addPart('command-roof', new Mesh(new ConeGeometry(1.45, 0.52, 4), roofMat));
    commandRoof.position.set(-0.25, 1.88, -0.35);
    commandRoof.rotation.y = Math.PI / 4;
    commandRoof.scale.z = 0.82;

    const frontBay = addPart('front-garage', new Mesh(new BoxGeometry(2.05, 0.85, 1.1), darkWallMat));
    frontBay.position.set(0.95, 0.71, 1.05);
    const frontDoor = addPart('front-garage-door', new Mesh(new BoxGeometry(1.55, 0.58, 0.08), metalMat));
    frontDoor.position.set(0.95, 0.58, 1.63);

    const sideBay = addPart('side-garage', new Mesh(new BoxGeometry(1.2, 0.78, 1.8), darkWallMat));
    sideBay.position.set(-1.65, 0.68, 0.9);
    const sideDoor = addPart('side-garage-door', new Mesh(new BoxGeometry(0.08, 0.5, 1.35), metalMat));
    sideDoor.position.set(-2.27, 0.54, 0.9);

    const tower = addPart('comms-tower', new Mesh(new BoxGeometry(0.62, 2.1, 0.62), wallMat));
    tower.position.set(1.25, 1.32, -1.35);
    const towerGlass = addPart('tower-glass', new Mesh(new BoxGeometry(0.66, 0.44, 0.68), glassMat));
    towerGlass.position.set(1.25, 2.52, -1.35);
    const towerRoof = addPart('tower-roof', new Mesh(new ConeGeometry(0.58, 0.36, 4), roofMat));
    towerRoof.position.set(1.25, 2.92, -1.35);
    towerRoof.rotation.y = Math.PI / 4;

    const antenna = addPart('antenna-mast', new Mesh(new BoxGeometry(0.09, 1.7, 0.09), metalMat));
    antenna.position.set(1.25, 3.72, -1.35);
    const dish = addPart('radar-dish', new Mesh(new ConeGeometry(0.36, 0.16, 12), metalMat));
    dish.position.set(1.25, 3.42, -1.02);
    dish.rotation.x = Math.PI / 2;

    const craneBase = addPart('crane-base', new Mesh(new BoxGeometry(0.42, 0.46, 0.42), metalMat));
    craneBase.position.set(-1.65, 0.5, -1.65);
    const craneMast = addPart('crane-mast', new Mesh(new BoxGeometry(0.14, 1.8, 0.14), metalMat));
    craneMast.position.set(-1.65, 1.55, -1.65);
    const craneBoom = addPart('crane-boom', new Mesh(new BoxGeometry(1.95, 0.12, 0.12), metalMat));
    craneBoom.position.set(-0.82, 2.38, -1.65);
    craneBoom.rotation.z = -0.12;
    const craneCable = addPart('crane-cable', new Mesh(new BoxGeometry(0.05, 0.78, 0.05), metalMat));
    craneCable.position.set(0.05, 1.98, -1.65);
    const craneHook = addPart('crane-hook', new Mesh(new BoxGeometry(0.18, 0.14, 0.18), accentMat));
    craneHook.position.set(0.05, 1.54, -1.65);

    const stripeA = addPart('team-stripe-a', new Mesh(new BoxGeometry(1.55, 0.1, 0.12), accentMat));
    stripeA.position.set(0.95, 1.18, 1.62);
    const stripeB = addPart('team-stripe-b', new Mesh(new BoxGeometry(0.12, 0.68, 0.9), accentMat));
    stripeB.position.set(1.58, 1.18, -0.35);

    const corners: [number, number][] = [
      [-2.15, -2.15],
      [-1.25, -2.15],
      [1.15, -2.15],
      [2.05, -2.15],
      [-2.15, 2.15],
      [-1.25, 2.15],
      [1.15, 2.15],
      [2.05, 2.15],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [x, z] = corners[i]!;
      const block = addPart(`perimeter-block-${i}`, new Mesh(new BoxGeometry(0.62, 0.42, 0.32), sandMat));
      block.position.set(x, 0.48, z);
      block.rotation.y = z < 0 ? 0 : Math.PI;
    }

    const crateA = addPart('supply-crate-a', new Mesh(new BoxGeometry(0.42, 0.34, 0.42), sandMat));
    crateA.position.set(-1.35, 0.44, 1.95);
    const crateB = addPart('supply-crate-b', new Mesh(new BoxGeometry(0.36, 0.3, 0.56), metalMat));
    crateB.position.set(-1.88, 0.42, 1.72);

    return root;
  }

  private createInfantry(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-infantry';
    const uniformMat = new MeshLambertMaterial({ color: 0x59644f });
    const darkUniformMat = new MeshLambertMaterial({ color: 0x333c32 });
    const armorMat = new MeshLambertMaterial({ color: 0x48513f });
    const pouchMat = new MeshLambertMaterial({ color: 0x77705c });
    const skinMat = new MeshLambertMaterial({ color: 0xb08a65 });
    const helmetMat = new MeshLambertMaterial({ color: 0x4c5647 });
    const bootMat = new MeshLambertMaterial({ color: 0x242a25 });
    const rifleMat = new MeshLambertMaterial({ color: 0x202622 });
    const rifleDarkMat = new MeshLambertMaterial({ color: 0x111614 });
    const lensMat = new MeshLambertMaterial({ color: 0x161f22 });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `infantry-${name}`;
      root.add(mesh);
      return mesh;
    };

    const body = addPart('body', new Mesh(this.soldierGeo, uniformMat));
    body.position.y = 0.71;
    body.scale.set(0.9, 0.98, 0.72);

    const torsoArmor = addPart('torso-armor', new Mesh(new BoxGeometry(0.45, 0.56, 0.26), armorMat));
    torsoArmor.position.set(0, 0.82, -0.04);
    const plateFront = addPart('plate-carrier-front', new Mesh(new BoxGeometry(0.38, 0.43, 0.08), darkUniformMat));
    plateFront.position.set(0, 0.88, -0.22);
    const plateBack = addPart('plate-carrier-back', new Mesh(new BoxGeometry(0.36, 0.42, 0.08), darkUniformMat));
    plateBack.position.set(0, 0.88, 0.19);
    const chestRig = addPart('chest-rig', new Mesh(new BoxGeometry(0.5, 0.07, 0.06), pouchMat));
    chestRig.position.set(0, 1.02, -0.28);
    for (const [name, x] of [
      ['ammo-pouch-left', -0.16],
      ['ammo-pouch-center', 0],
      ['ammo-pouch-right', 0.16],
    ] as const) {
      const pouch = addPart(name, new Mesh(new BoxGeometry(0.12, 0.18, 0.08), pouchMat));
      pouch.position.set(x, 0.82, -0.29);
    }

    const head = addPart('head', new Mesh(new SphereGeometry(0.18, 8, 8), skinMat));
    head.position.set(0, 1.24, -0.04);
    head.scale.set(0.92, 0.96, 0.86);
    const helmetShell = addPart('helmet-shell', new Mesh(new SphereGeometry(0.24, 8, 6), helmetMat));
    helmetShell.position.set(0, 1.38, -0.035);
    helmetShell.scale.set(1, 0.58, 0.88);
    const helmetRim = addPart('helmet-rim', new Mesh(new BoxGeometry(0.5, 0.05, 0.34), helmetMat));
    helmetRim.position.set(0, 1.31, -0.02);
    const railLeft = addPart('helmet-rail-left', new Mesh(new BoxGeometry(0.04, 0.045, 0.3), bootMat));
    railLeft.position.set(-0.23, 1.36, -0.02);
    const railRight = addPart('helmet-rail-right', new Mesh(new BoxGeometry(0.04, 0.045, 0.3), bootMat));
    railRight.position.set(0.23, 1.36, -0.02);
    const goggles = addPart('goggles', new Mesh(new BoxGeometry(0.32, 0.075, 0.04), lensMat));
    goggles.position.set(0, 1.26, -0.205);
    const mask = addPart('face-mask', new Mesh(new BoxGeometry(0.24, 0.11, 0.055), darkUniformMat));
    mask.position.set(0, 1.17, -0.2);

    const backpack = addPart('backpack', new Mesh(new BoxGeometry(0.34, 0.48, 0.2), darkUniformMat));
    backpack.position.set(0, 0.82, 0.3);
    const radio = addPart('radio', new Mesh(new BoxGeometry(0.11, 0.22, 0.06), rifleDarkMat));
    radio.position.set(0.23, 1.02, 0.31);
    const antenna = addPart('radio-antenna', new Mesh(new CylinderGeometry(0.012, 0.012, 0.48, 5), rifleDarkMat));
    antenna.position.set(0.29, 1.29, 0.33);
    antenna.rotation.z = -0.1;

    const leftUpperArm = addPart('left-upper-arm', new Mesh(new BoxGeometry(0.12, 0.3, 0.12), uniformMat));
    leftUpperArm.position.set(-0.3, 0.98, -0.04);
    leftUpperArm.rotation.x = -0.64;
    leftUpperArm.rotation.z = -0.24;
    const leftForearm = addPart('left-forearm', new Mesh(new BoxGeometry(0.11, 0.28, 0.11), darkUniformMat));
    leftForearm.position.set(-0.24, 0.76, -0.24);
    leftForearm.rotation.x = -0.9;
    leftForearm.rotation.z = 0.1;
    const rightUpperArm = addPart('right-upper-arm', new Mesh(new BoxGeometry(0.12, 0.3, 0.12), uniformMat));
    rightUpperArm.position.set(0.31, 0.98, -0.05);
    rightUpperArm.rotation.x = -0.56;
    rightUpperArm.rotation.z = 0.26;
    const rightForearm = addPart('right-forearm', new Mesh(new BoxGeometry(0.11, 0.28, 0.11), darkUniformMat));
    rightForearm.position.set(0.22, 0.77, -0.25);
    rightForearm.rotation.x = -0.86;
    rightForearm.rotation.z = -0.12;
    const leftGlove = addPart('left-glove', new Mesh(new BoxGeometry(0.12, 0.09, 0.12), bootMat));
    leftGlove.position.set(-0.19, 0.65, -0.39);
    const rightGlove = addPart('right-glove', new Mesh(new BoxGeometry(0.12, 0.09, 0.12), bootMat));
    rightGlove.position.set(0.18, 0.65, -0.38);

    for (const side of [-1, 1] as const) {
      const suffix = side < 0 ? 'left' : 'right';
      const thigh = addPart(`${suffix}-thigh`, new Mesh(new BoxGeometry(0.14, 0.32, 0.14), uniformMat));
      thigh.position.set(side * 0.11, 0.42, side < 0 ? 0.025 : -0.02);
      thigh.rotation.x = side < 0 ? -0.08 : 0.08;
      const shin = addPart(`${suffix}-shin`, new Mesh(new BoxGeometry(0.12, 0.34, 0.12), darkUniformMat));
      shin.position.set(side * 0.11, 0.18, side < 0 ? -0.005 : 0.025);
      shin.rotation.x = side < 0 ? 0.08 : -0.08;
      const knee = addPart(`knee-pad-${suffix}`, new Mesh(new BoxGeometry(0.15, 0.085, 0.055), armorMat));
      knee.position.set(side * 0.11, 0.31, -0.095);
      const boot = addPart(`boot-${suffix}`, new Mesh(new BoxGeometry(0.16, 0.09, 0.25), bootMat));
      boot.position.set(side * 0.11, 0.025, -0.045);
    }

    const rifleStock = addPart('rifle-stock', new Mesh(new BoxGeometry(0.13, 0.11, 0.28), rifleDarkMat));
    rifleStock.position.set(0.16, 0.78, -0.28);
    rifleStock.rotation.x = -0.1;
    const rifleBody = addPart('rifle-body', new Mesh(new BoxGeometry(0.12, 0.12, 0.42), rifleMat));
    rifleBody.position.set(0.08, 0.82, -0.5);
    rifleBody.rotation.x = -0.07;
    const rifleBarrel = addPart('rifle-barrel', new Mesh(new BoxGeometry(0.045, 0.045, 0.58), rifleDarkMat));
    rifleBarrel.position.set(0.05, 0.84, -0.96);
    rifleBarrel.rotation.x = -0.045;
    const rifleMuzzle = addPart('rifle-muzzle', new Mesh(new BoxGeometry(0.07, 0.06, 0.08), rifleDarkMat));
    rifleMuzzle.position.set(0.05, 0.845, -1.29);
    const rifleMagazine = addPart('rifle-magazine', new Mesh(new BoxGeometry(0.1, 0.24, 0.08), rifleDarkMat));
    rifleMagazine.position.set(0.08, 0.66, -0.52);
    rifleMagazine.rotation.x = 0.14;
    const rifleOptic = addPart('rifle-optic', new Mesh(new BoxGeometry(0.11, 0.07, 0.14), lensMat));
    rifleOptic.position.set(0.08, 0.93, -0.55);

    const teamPatch = addPart('team-patch', new Mesh(new BoxGeometry(0.08, 0.16, 0.035), accentMat));
    teamPatch.position.set(0.27, 1.02, -0.17);

    return root;
  }

  private createWorker(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-worker';
    const shirtMat = new MeshLambertMaterial({ color: 0x5f7456 });
    const pantsMat = new MeshLambertMaterial({ color: 0x35433a });
    const skinMat = new MeshLambertMaterial({ color: 0xb08a65 });
    const helmetMat = new MeshLambertMaterial({ color: 0xe0b23c });
    const crateMat = new MeshLambertMaterial({ color: 0x8b6a3d });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `worker-${name}`;
      root.add(mesh);
      return mesh;
    };

    const body = addPart('body', new Mesh(this.soldierGeo, shirtMat));
    body.position.y = 0.66;
    body.scale.set(0.82, 0.86, 0.74);

    const head = addPart('head', new Mesh(new SphereGeometry(0.17, 8, 8), skinMat));
    head.position.set(0, 1.2, -0.02);
    const helmet = addPart('hardhat', new Mesh(new CylinderGeometry(0.22, 0.2, 0.14, 8), helmetMat));
    helmet.position.set(0, 1.36, -0.02);
    const brim = addPart('hardhat-brim', new Mesh(new BoxGeometry(0.38, 0.035, 0.18), helmetMat));
    brim.position.set(0, 1.3, -0.15);

    const backpack = addPart('toolpack', new Mesh(new BoxGeometry(0.26, 0.34, 0.16), crateMat));
    backpack.position.set(0, 0.76, 0.24);

    const leftArm = addPart('left-arm', new Mesh(new BoxGeometry(0.12, 0.46, 0.12), shirtMat));
    leftArm.position.set(-0.27, 0.78, -0.05);
    leftArm.rotation.x = -0.35;
    leftArm.rotation.z = -0.2;
    const rightArm = addPart('right-arm', new Mesh(new BoxGeometry(0.12, 0.46, 0.12), shirtMat));
    rightArm.position.set(0.28, 0.8, -0.1);
    rightArm.rotation.x = -0.7;
    rightArm.rotation.z = 0.2;

    const leftLeg = addPart('left-leg', new Mesh(new BoxGeometry(0.13, 0.46, 0.13), pantsMat));
    leftLeg.position.set(-0.1, 0.24, 0.03);
    leftLeg.rotation.x = -0.1;
    const rightLeg = addPart('right-leg', new Mesh(new BoxGeometry(0.13, 0.46, 0.13), pantsMat));
    rightLeg.position.set(0.1, 0.24, -0.03);
    rightLeg.rotation.x = 0.1;

    const toolbox = addPart('toolbox', new Mesh(new BoxGeometry(0.32, 0.22, 0.2), crateMat));
    toolbox.position.set(0.34, 0.52, -0.18);
    toolbox.rotation.z = 0.08;

    const patch = addPart('team-patch', new Mesh(new BoxGeometry(0.08, 0.15, 0.035), accentMat));
    patch.position.set(0.23, 0.92, -0.2);

    return root;
  }

  private createHarvester(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-harvester';
    const hullMat = new MeshLambertMaterial({ color: 0x59645a });
    const armorMat = new MeshLambertMaterial({ color: 0x46534b });
    const darkMat = new MeshLambertMaterial({ color: 0x2c3231 });
    const trackMat = new MeshLambertMaterial({ color: 0x252a29 });
    const bucketMat = new MeshLambertMaterial({ color: 0x3d4542 });
    const glassMat = new MeshLambertMaterial({ color: 0x26384a });
    const oreMat = new MeshLambertMaterial({ color: 0xd8a51d });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `harvester-${name}`;
      root.add(mesh);
      return mesh;
    };

    const leftTrack = addPart('left-track', new Mesh(new BoxGeometry(0.32, 0.34, 1.95), trackMat));
    leftTrack.position.set(-0.62, 0.27, 0.04);
    const rightTrack = addPart('right-track', new Mesh(new BoxGeometry(0.32, 0.34, 1.95), trackMat));
    rightTrack.position.set(0.62, 0.27, 0.04);

    for (let i = 0; i < 5; i++) {
      const z = -0.72 + i * 0.36;
      const wheelL = addPart(`left-wheel-${i}`, new Mesh(new BoxGeometry(0.35, 0.16, 0.14), darkMat));
      wheelL.position.set(-0.64, 0.3, z);
      const wheelR = addPart(`right-wheel-${i}`, new Mesh(new BoxGeometry(0.35, 0.16, 0.14), darkMat));
      wheelR.position.set(0.64, 0.3, z);
    }

    const chassis = addPart('chassis', new Mesh(new BoxGeometry(1.2, 0.44, 1.95), hullMat));
    chassis.position.set(0, 0.52, 0.02);

    const cab = addPart('cab', new Mesh(new BoxGeometry(0.78, 0.7, 0.72), armorMat));
    cab.position.set(0, 0.98, -0.48);
    const windshield = addPart('windshield', new Mesh(new BoxGeometry(0.62, 0.28, 0.06), glassMat));
    windshield.position.set(0, 1.06, -0.86);

    const hopper = addPart('ore-bin', new Mesh(new BoxGeometry(1.02, 0.7, 0.95), bucketMat));
    hopper.position.set(0, 0.93, 0.55);
    hopper.rotation.x = -0.08;
    const binLip = addPart('ore-bin-lip', new Mesh(new BoxGeometry(1.14, 0.12, 1.05), darkMat));
    binLip.position.set(0, 1.34, 0.55);

    for (let i = 0; i < 6; i++) {
      const nugget = addPart(`ore-load-${i}`, new Mesh(this.oreGeo, oreMat));
      nugget.position.set(-0.32 + (i % 3) * 0.32, 1.47 + i * 0.015, 0.35 + Math.floor(i / 3) * 0.32);
      nugget.scale.setScalar(0.9 + i * 0.05);
    }

    const frontArmL = addPart('front-arm-left', new Mesh(new BoxGeometry(0.12, 0.12, 0.82), darkMat));
    frontArmL.position.set(-0.42, 0.48, -1.1);
    frontArmL.rotation.x = -0.2;
    const frontArmR = addPart('front-arm-right', new Mesh(new BoxGeometry(0.12, 0.12, 0.82), darkMat));
    frontArmR.position.set(0.42, 0.48, -1.1);
    frontArmR.rotation.x = -0.2;
    const scoop = addPart('front-scoop', new Mesh(new BoxGeometry(1.35, 0.28, 0.42), bucketMat));
    scoop.position.set(0, 0.32, -1.45);
    scoop.rotation.x = -0.18;

    const rearGate = addPart('rear-dump-gate', new Mesh(new BoxGeometry(0.9, 0.58, 0.12), darkMat));
    rearGate.position.set(0, 0.82, 1.58);
    const sidePanelL = addPart('left-team-panel', new Mesh(new BoxGeometry(0.06, 0.26, 0.58), accentMat));
    sidePanelL.position.set(-0.79, 0.74, 0.14);
    const sidePanelR = addPart('right-team-panel', new Mesh(new BoxGeometry(0.06, 0.26, 0.58), accentMat));
    sidePanelR.position.set(0.79, 0.74, 0.14);
    const beacon = addPart('roof-beacon', new Mesh(new BoxGeometry(0.16, 0.16, 0.16), accentMat));
    beacon.position.set(0, 1.42, -0.48);

    return root;
  }

  /** 战术导弹发射车（TEL）：重型卡车底盘 + 可升降导弹发射导轨。
   *  参照 SCUD/伊斯坎德尔 MAZ-543 发射车：8x8 底盘 + 后部竖立式发射架。 */
  private createTelVehicle(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-tel';
    const bodyMat = new MeshLambertMaterial({ color: 0x3d4a35 });   // 军绿车身
    const darkMat = new MeshLambertMaterial({ color: 0x2a2f1e });  // 深色部件
    const metalMat = new MeshLambertMaterial({ color: 0x3a3f30 }); // 金属支架
    const rubberMat = new MeshLambertMaterial({ color: 0x1a1d14 });// 轮胎
    const railMat = new MeshLambertMaterial({ color: 0x4a4a3e }); // 发射导轨
    const missileBodyMat = new MeshLambertMaterial({ color: 0xd8d8d0 });
    const missileNoseMat = new MeshLambertMaterial({ color: 0xc23a3a });
    const glassMat = new MeshLambertMaterial({ color: 0x223344 });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `tel-${name}`;
      root.add(mesh);
      return mesh;
    };

    // —— 底盘 ——
    const chassis = addPart('chassis', new Mesh(new BoxGeometry(2.2, 0.2, 1.3), darkMat));
    chassis.position.y = 0.35;

    // —— 8 轮组（4轴8轮，重型越野）——
    const wheelGeo = new CylinderGeometry(0.26, 0.26, 0.16, 10);
    const wheelX = [-0.75, -0.25, 0.25, 0.75];
    for (let i = 0; i < wheelX.length; i++) {
      for (const side of [-1, 1]) {
        const wheel = addPart(`wheel-${i}-${side}`, new Mesh(wheelGeo, rubberMat));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wheelX[i]!, 0.26, side * 0.65);
      }
    }

    // —— 驾驶室（车头，-X 侧）——
    const cab = addPart('cab', new Mesh(new BoxGeometry(0.55, 0.55, 1.15), bodyMat));
    cab.position.set(-0.85, 0.72, 0);
    const cabRoof = addPart('cab-roof', new Mesh(new BoxGeometry(0.57, 0.06, 1.17), darkMat));
    cabRoof.position.set(-0.85, 1.02, 0);
    const windshield = addPart('windshield', new Mesh(new BoxGeometry(0.04, 0.28, 1.0), glassMat));
    windshield.position.set(-1.12, 0.8, 0);
    // 车头保险杠
    const bumper = addPart('bumper', new Mesh(new BoxGeometry(0.1, 0.16, 1.3), darkMat));
    bumper.position.set(-1.15, 0.42, 0);

    // —— 后部设备舱（驾驶室后方，连接底盘与发射架）——
    const deck = addPart('deck', new Mesh(new BoxGeometry(0.8, 0.4, 1.1), bodyMat));
    deck.position.set(-0.15, 0.65, 0);
    // 设备舱顶部散热格栅
    for (const z of [-0.35, 0, 0.35]) {
      const vent = addPart(`vent-${z}`, new Mesh(new BoxGeometry(0.6, 0.04, 0.12), darkMat));
      vent.position.set(-0.15, 0.87, z);
    }

    // —— 发射架组（后部，可竖起）——
    // 真实 SCUD 发射车：行军时发射架水平放置在车顶，发射时竖起至近垂直
    const launcherGroup = new Group();
    launcherGroup.name = 'tel-launcher';
    // 旋转支点在底盘后部
    launcherGroup.position.set(0.55, 0.7, 0);
    // 默认行军状态：水平放置（展开时由 syncEntities 动态旋转）
    launcherGroup.rotation.z = 0;

    // 发射导轨主梁（长矩形）
    const rail = new Mesh(new BoxGeometry(1.8, 0.16, 0.28), railMat);
    rail.name = 'tel-rail';
    rail.position.set(0.4, 0, 0); // 向后延伸
    launcherGroup.add(rail);
    // 导轨加强肋
    for (const x of [-0.2, 0.3, 0.8, 1.2]) {
      const rib = new Mesh(new BoxGeometry(0.06, 0.2, 0.32), darkMat);
      rib.name = `tel-rail-rib-${x}`;
      rib.position.set(x, 0, 0);
      launcherGroup.add(rib);
    }
    // 导轨底座连接（旋转轴处）
    const pivot = new Mesh(new CylinderGeometry(0.12, 0.12, 0.4, 8), metalMat);
    pivot.name = 'tel-pivot';
    pivot.rotation.z = Math.PI / 2;
    pivot.position.set(-0.4, 0, 0);
    launcherGroup.add(pivot);

    // —— 战术导弹（放置在导轨上）——
    const missileGroup = new Group();
    missileGroup.name = 'tel-missile';
    missileGroup.position.set(0.5, 0.14, 0); // 在导轨上方
    // 弹体（细长圆柱）
    const mBody = new Mesh(new CylinderGeometry(0.07, 0.07, 1.2, 8), missileBodyMat);
    mBody.name = 'tel-missile-body';
    mBody.rotation.z = Math.PI / 2;
    missileGroup.add(mBody);
    // 弹头（红色锥形）
    const mNose = new Mesh(new ConeGeometry(0.07, 0.25, 8), missileNoseMat);
    mNose.name = 'tel-missile-nose';
    mNose.rotation.z = -Math.PI / 2;
    mNose.position.x = 0.72;
    missileGroup.add(mNose);
    // 尾翼（4片）
    for (let i = 0; i < 4; i++) {
      const fin = new Mesh(new BoxGeometry(0.12, 0.02, 0.14), darkMat);
      fin.name = `tel-missile-fin-${i}`;
      fin.position.set(-0.55, 0, 0);
      fin.rotation.x = (i * Math.PI) / 2;
      missileGroup.add(fin);
    }
    // 弹体标识环（玩家色）
    const ring = new Mesh(new TorusGeometry(0.08, 0.015, 4, 8), accentMat);
    ring.name = 'tel-missile-ring';
    ring.rotation.y = Math.PI / 2;
    ring.position.x = 0.3;
    missileGroup.add(ring);
    launcherGroup.add(missileGroup);

    // 液压举升臂（连接底盘与发射架，可见的液压杆）
    const liftArm = new Mesh(new CylinderGeometry(0.05, 0.05, 0.5, 6), metalMat);
    liftArm.name = 'tel-lift-arm';
    liftArm.position.set(0.1, -0.2, 0);
    liftArm.rotation.z = Math.PI / 4;
    launcherGroup.add(liftArm);

    root.add(launcherGroup);

    // —— 支撑腿（2个后部液压支撑，部署时接地）——
    for (const side of [-1, 1]) {
      const jackArm = addPart(`jack-arm-${side}`, new Mesh(new BoxGeometry(0.08, 0.3, 0.08), metalMat));
      jackArm.position.set(0.7, 0.25, side * 0.6);
      const jackFoot = addPart(`jack-foot-${side}`, new Mesh(new CylinderGeometry(0.1, 0.14, 0.06, 6), darkMat));
      jackFoot.position.set(0.7, 0.04, side * 0.6);
    }

    // —— 识别条纹（玩家色）——
    const stripe = addPart('stripe', new Mesh(new BoxGeometry(0.04, 0.2, 1.1), accentMat));
    stripe.position.set(-0.55, 0.72, 0);

    return root;
  }

  private createTank(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-tank';
    const hullMat = new MeshLambertMaterial({ color: 0x566356 });
    const armorMat = new MeshLambertMaterial({ color: 0x465248 });
    const darkMat = new MeshLambertMaterial({ color: 0x2d3435 });
    const trackMat = new MeshLambertMaterial({ color: 0x272b2b });
    const metalMat = new MeshLambertMaterial({ color: 0x353c3d });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `tank-${name}`;
      root.add(mesh);
      return mesh;
    };

    const leftTrack = addPart('left-track', new Mesh(new BoxGeometry(0.3, 0.34, 1.8), trackMat));
    leftTrack.position.set(-0.54, 0.26, 0);
    const rightTrack = addPart('right-track', new Mesh(new BoxGeometry(0.3, 0.34, 1.8), trackMat));
    rightTrack.position.set(0.54, 0.26, 0);

    for (let i = 0; i < 4; i++) {
      const z = -0.62 + i * 0.42;
      const wheelL = addPart(`left-roadwheel-${i}`, new Mesh(new BoxGeometry(0.34, 0.17, 0.16), metalMat));
      wheelL.position.set(-0.55, 0.28, z);
      const wheelR = addPart(`right-roadwheel-${i}`, new Mesh(new BoxGeometry(0.34, 0.17, 0.16), metalMat));
      wheelR.position.set(0.55, 0.28, z);
    }

    const hull = addPart('hull', new Mesh(this.vehicleGeo, hullMat));
    hull.position.y = 0.48;
    hull.scale.set(1.25, 1.08, 1.18);

    const frontArmor = addPart('front-armor', new Mesh(new BoxGeometry(0.92, 0.28, 0.18), armorMat));
    frontArmor.position.set(0, 0.6, -0.78);
    frontArmor.rotation.x = -0.18;
    const rearDeck = addPart('rear-engine-deck', new Mesh(new BoxGeometry(0.72, 0.12, 0.38), darkMat));
    rearDeck.position.set(0, 0.72, 0.54);

    const turret = addPart('turret', new Mesh(new BoxGeometry(0.74, 0.32, 0.62), armorMat));
    turret.position.set(0, 0.86, -0.12);
    turret.rotation.y = 0;
    const turretSlope = addPart('turret-front-slope', new Mesh(new BoxGeometry(0.58, 0.22, 0.16), armorMat));
    turretSlope.position.set(0, 0.86, -0.5);
    turretSlope.rotation.x = -0.12;

    const barrel = addPart('barrel', new Mesh(this.barrelGeo, metalMat));
    barrel.position.set(0, 0.88, -0.86);
    const muzzle = addPart('muzzle-brake', new Mesh(new BoxGeometry(0.22, 0.16, 0.12), darkMat));
    muzzle.position.set(0, 0.88, -1.3);

    const hatch = addPart('commander-hatch', new Mesh(new BoxGeometry(0.28, 0.12, 0.28), darkMat));
    hatch.position.set(-0.2, 1.08, 0.05);
    const antenna = addPart('radio-antenna', new Mesh(new BoxGeometry(0.035, 0.82, 0.035), darkMat));
    antenna.position.set(0.34, 1.34, 0.18);

    const teamPlate = addPart('team-plate', new Mesh(new BoxGeometry(0.42, 0.08, 0.12), accentMat));
    teamPlate.position.set(0, 0.72, -0.69);
    const sideMarkL = addPart('left-team-mark', new Mesh(new BoxGeometry(0.05, 0.18, 0.34), accentMat));
    sideMarkL.position.set(-0.72, 0.52, -0.18);
    const sideMarkR = addPart('right-team-mark', new Mesh(new BoxGeometry(0.05, 0.18, 0.34), accentMat));
    sideMarkR.position.set(0.72, 0.52, -0.18);

    return root;
  }

  private createAircraft(ownerColor: number): Object3D {
    const root = new Group();
    root.name = 'lowpoly-strike-fighter';
    root.scale.setScalar(LOWPOLY_FIGHTER_MODEL_SCALE);
    const hullMat = new MeshLambertMaterial({ color: 0x778176 });
    const panelMat = new MeshLambertMaterial({ color: 0x5d6861 });
    const edgeMat = new MeshLambertMaterial({ color: 0x4d5955 });
    const darkMat = new MeshLambertMaterial({ color: 0x252d31 });
    const canopyMat = new MeshLambertMaterial({ color: 0x20364a });
    const bayMat = new MeshLambertMaterial({ color: 0x39413f });
    const lightMat = new MeshLambertMaterial({ color: 0xcfd8c7 });
    const wingMat = new MeshLambertMaterial({ color: 0x738078, side: DoubleSide });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (id: string, mesh: Mesh): Mesh => {
      mesh.name = id;
      root.add(mesh);
      return mesh;
    };
    const addFlatWing = (id: string, side: -1 | 1): Mesh => {
      const shape = new Shape();
      shape.moveTo(0.48, side * 0.2);
      shape.lineTo(0.02, side * 1.38);
      shape.lineTo(-0.98, side * 1.04);
      shape.lineTo(-0.46, side * 0.16);
      shape.lineTo(0.48, side * 0.2);
      const wing = addPart(id, new Mesh(new ShapeGeometry(shape), wingMat));
      wing.rotation.x = Math.PI / 2;
      wing.position.y = 0.33;
      return wing;
    };

    const fuselage = addPart('fuselage', new Mesh(this.fighterFuselageGeo, hullMat));
    fuselage.position.set(-0.04, 0.36, 0);
    fuselage.scale.set(1.25, 0.9, 1.42);

    const spine = addPart('spine', new Mesh(this.fighterSpineGeo, panelMat));
    spine.position.set(-0.22, 0.55, 0);
    spine.scale.set(1.18, 0.82, 1.2);

    const nose = addPart('faceted-nose', new Mesh(this.fighterNoseGeo, hullMat));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(1.28, 0.36, 0);
    nose.scale.set(1.35, 0.82, 0.92);
    const noseSensor = addPart('nose-sensor', new Mesh(this.fighterHardpointNoseGeo, darkMat));
    noseSensor.rotation.z = -Math.PI / 2;
    noseSensor.position.set(1.66, 0.36, 0);
    noseSensor.scale.set(0.85, 0.72, 0.72);

    const shoulderLeft = addPart('shoulder-left', new Mesh(new BoxGeometry(0.92, 0.12, 0.26), edgeMat));
    shoulderLeft.position.set(0.2, 0.45, 0.35);
    shoulderLeft.rotation.y = -0.12;
    const shoulderRight = addPart('shoulder-right', new Mesh(new BoxGeometry(0.92, 0.12, 0.26), edgeMat));
    shoulderRight.position.set(0.2, 0.45, -0.35);
    shoulderRight.rotation.y = 0.12;
    const chineLeft = addPart('chine-left', new Mesh(new BoxGeometry(1.05, 0.07, 0.08), edgeMat));
    chineLeft.position.set(0.64, 0.36, 0.31);
    chineLeft.rotation.y = -0.17;
    const chineRight = addPart('chine-right', new Mesh(new BoxGeometry(1.05, 0.07, 0.08), edgeMat));
    chineRight.position.set(0.64, 0.36, -0.31);
    chineRight.rotation.y = 0.17;

    const canopy = addPart('bubble-canopy', new Mesh(new SphereGeometry(0.28, 8, 5), canopyMat));
    canopy.position.set(0.36, 0.63, 0);
    canopy.scale.set(1.18, 0.42, 0.72);
    const canopySpine = addPart('canopy-spine', new Mesh(this.fighterCockpitGeo, darkMat));
    canopySpine.position.set(0.08, 0.62, 0);
    canopySpine.scale.set(0.52, 0.42, 0.55);
    canopySpine.rotation.z = -0.08;

    addFlatWing('trapezoid-wing-left', 1);
    addFlatWing('trapezoid-wing-right', -1);

    const wingThicknessLeft = addPart('wing-thickness-left', new Mesh(this.fighterWingGeo, edgeMat));
    wingThicknessLeft.position.set(-0.2, 0.31, 0.74);
    wingThicknessLeft.rotation.y = -0.3;
    wingThicknessLeft.scale.set(1.1, 0.52, 0.24);
    const wingThicknessRight = addPart('wing-thickness-right', new Mesh(this.fighterWingGeo, edgeMat));
    wingThicknessRight.position.set(-0.2, 0.31, -0.74);
    wingThicknessRight.rotation.y = 0.3;
    wingThicknessRight.scale.set(1.1, 0.52, 0.24);
    const wingPanelLineLeft = addPart('wing-panel-line-left', new Mesh(new BoxGeometry(0.62, 0.035, 0.045), edgeMat));
    wingPanelLineLeft.position.set(0.02, 0.365, 0.78);
    wingPanelLineLeft.rotation.y = -0.38;
    const wingPanelLineRight = addPart('wing-panel-line-right', new Mesh(new BoxGeometry(0.62, 0.035, 0.045), edgeMat));
    wingPanelLineRight.position.set(0.02, 0.365, -0.78);
    wingPanelLineRight.rotation.y = 0.38;

    const intakeLeft = addPart('diverterless-intake-left', new Mesh(this.fighterIntakeGeo, darkMat));
    intakeLeft.position.set(0.36, 0.27, 0.45);
    intakeLeft.rotation.y = -0.28;
    intakeLeft.scale.set(1.1, 0.95, 1.15);
    const intakeRight = addPart('diverterless-intake-right', new Mesh(this.fighterIntakeGeo, darkMat));
    intakeRight.position.set(0.36, 0.27, -0.45);
    intakeRight.rotation.y = 0.28;
    intakeRight.scale.set(1.1, 0.95, 1.15);
    const intakeLipLeft = addPart('intake-lip-left', new Mesh(new BoxGeometry(0.32, 0.06, 0.08), edgeMat));
    intakeLipLeft.position.set(0.58, 0.34, 0.52);
    intakeLipLeft.rotation.y = -0.28;
    const intakeLipRight = addPart('intake-lip-right', new Mesh(new BoxGeometry(0.32, 0.06, 0.08), edgeMat));
    intakeLipRight.position.set(0.58, 0.34, -0.52);
    intakeLipRight.rotation.y = 0.28;

    const tailplaneLeft = addPart('tailplane-left', new Mesh(this.fighterTailWingGeo, panelMat));
    tailplaneLeft.position.set(-0.86, 0.42, 0.48);
    tailplaneLeft.rotation.y = -0.34;
    tailplaneLeft.scale.set(1.12, 1, 1.15);
    const tailplaneRight = addPart('tailplane-right', new Mesh(this.fighterTailWingGeo, panelMat));
    tailplaneRight.position.set(-0.86, 0.42, -0.48);
    tailplaneRight.rotation.y = 0.34;
    tailplaneRight.scale.set(1.12, 1, 1.15);

    const cantedTailLeft = addPart('canted-tail-left', new Mesh(this.fighterVerticalTailGeo, panelMat));
    cantedTailLeft.position.set(-0.88, 0.78, 0.38);
    cantedTailLeft.rotation.x = 0.42;
    cantedTailLeft.rotation.y = -0.08;
    cantedTailLeft.rotation.z = -0.08;
    cantedTailLeft.scale.set(1.12, 1.32, 1.08);
    const cantedTailRight = addPart('canted-tail-right', new Mesh(this.fighterVerticalTailGeo, panelMat));
    cantedTailRight.position.set(-0.88, 0.78, -0.38);
    cantedTailRight.rotation.x = -0.42;
    cantedTailRight.rotation.y = 0.08;
    cantedTailRight.rotation.z = -0.08;
    cantedTailRight.scale.set(1.12, 1.32, 1.08);

    const nozzle = addPart('single-engine-nozzle', new Mesh(this.fighterNozzleGeo, darkMat));
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(-1.16, 0.36, 0);
    nozzle.scale.set(1.2, 1.05, 1.05);
    const exhaustRing = addPart('exhaust-ring', new Mesh(new TorusGeometry(0.18, 0.025, 6, 12), edgeMat));
    exhaustRing.rotation.y = Math.PI / 2;
    exhaustRing.position.set(-1.2, 0.36, 0);

    const weaponBayLeft = addPart('weapon-bay-left', new Mesh(this.fighterHardpointGeo, bayMat));
    weaponBayLeft.position.set(-0.05, 0.16, 0.16);
    weaponBayLeft.scale.set(1.2, 0.6, 0.55);
    const weaponBayRight = addPart('weapon-bay-right', new Mesh(this.fighterHardpointGeo, bayMat));
    weaponBayRight.position.set(-0.05, 0.16, -0.16);
    weaponBayRight.scale.set(1.2, 0.6, 0.55);
    const bayLine = addPart('bay-line-center', new Mesh(new BoxGeometry(0.72, 0.035, 0.035), lightMat));
    bayLine.position.set(-0.06, 0.145, 0);

    const formationLightLeft = addPart('formation-light-left', new Mesh(new BoxGeometry(0.05, 0.04, 0.28), accentMat));
    formationLightLeft.position.set(-0.18, 0.43, 0.52);
    const formationLightRight = addPart('formation-light-right', new Mesh(new BoxGeometry(0.05, 0.04, 0.28), accentMat));
    formationLightRight.position.set(-0.18, 0.43, -0.52);
    const wingtipLeft = addPart('wingtip-left', new Mesh(this.fighterWingtipGeo, accentMat));
    wingtipLeft.position.set(-0.1, 0.36, 1.2);
    wingtipLeft.scale.set(0.8, 0.8, 0.8);
    const wingtipRight = addPart('wingtip-right', new Mesh(this.fighterWingtipGeo, accentMat));
    wingtipRight.position.set(-0.1, 0.36, -1.2);
    wingtipRight.scale.set(0.8, 0.8, 0.8);

    const stripe = addPart('team-stripe', new Mesh(this.fighterStripeGeo, accentMat));
    stripe.position.set(-0.44, 0.53, 0);
    stripe.scale.set(0.72, 0.82, 0.55);
    const teamFinLeft = addPart('team-fin-left', new Mesh(new BoxGeometry(0.05, 0.2, 0.08), accentMat));
    teamFinLeft.position.set(-0.88, 0.88, 0.43);
    teamFinLeft.rotation.x = 0.42;
    const teamFinRight = addPart('team-fin-right', new Mesh(new BoxGeometry(0.05, 0.2, 0.08), accentMat));
    teamFinRight.position.set(-0.88, 0.88, -0.43);
    teamFinRight.rotation.x = -0.42;
    return root;
  }

  private createAircraftShadow(): Object3D {
    const shadow = new Mesh(
      this.aircraftShadowGeo,
      new MeshLambertMaterial({ color: 0x050808, transparent: true, opacity: 0.35 }),
    );
    shadow.userData.pickable = false;
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.035;
    return shadow;
  }

  private createModelInstance(type: UnitType, entityId: number): Object3D | null {
    const template = this.modelTemplates.get(type.id);
    if (!template) return null;
    const instance = template.clone(true);
    instance.traverse((child) => {
      child.userData.entityId = entityId;
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry = mesh.geometry.clone();
      const mat = mesh.material as Material | Material[];
      mesh.material = Array.isArray(mat) ? mat.map((m) => m.clone()) : mat.clone();
    });
    return instance;
  }

  private prepareModelTemplate(scene: Object3D, type: UnitType, spec: Ww1ModelSpec): Object3D {
    const root = new Group();
    root.name = `ww1-model:${type.id}`;
    const model = scene.clone(true);
    root.add(model);
    const box = new Box3().setFromObject(model);
    if (box.isEmpty()) return root;
    const size = new Vector3();
    box.getSize(size);
    const span = Math.max(size.x, size.z, 0.001);
    model.scale.setScalar((this.targetModelSpan(type) / span) * (spec.scale ?? 1));
    model.rotation.y = ((spec.yawDeg ?? 0) * Math.PI) / 180;
    const fitted = new Box3().setFromObject(model);
    const center = new Vector3();
    fitted.getCenter(center);
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
    return root;
  }

  private targetModelSpan(type: UnitType): number {
    if (type.building) return Math.max(type.building.footprintW, type.building.footprintH) * THREE_CELL_SIZE * 0.85;
    if (type.domain === 'vehicle') return 1.55;
    if (type.domain === 'aircraft') return 1.85;
    return 0.75;
  }

  private assetBasePath(src: string): string {
    return src.slice(0, src.lastIndexOf('/') + 1);
  }

  private looksLikeGlb(bytes: ArrayBuffer): boolean {
    if (bytes.byteLength < 4) return false;
    const magic = new Uint8Array(bytes, 0, 4);
    return magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46;
  }

  private createHpBar(width: number, y: number): Group {
    const root = new Group();
    const back = new Mesh(new BoxGeometry(width, 0.08, 0.05), this.hpBackMat.mat);
    const fill = new Mesh(new BoxGeometry(width, 0.09, 0.06), this.hpGoodMat.mat);
    back.name = 'back';
    fill.name = 'fill';
    fill.position.z = -0.01;
    root.add(back, fill);
    root.position.y = y;
    root.userData.baseWidth = width;
    root.userData.baseY = y;
    return root;
  }

  private createStatusLabel(y: number): Sprite {
    const material = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false });
    const sprite = new Sprite(material);
    const scale = tacticalMissileStatusLabelScale3D();
    sprite.position.y = y + scale.y * 0.45;
    sprite.scale.set(scale.x, scale.y, 1);
    sprite.visible = false;
    sprite.userData.pickable = false;
    return sprite;
  }

  private updateStatusLabel(label: Sprite, text: string, visible: boolean): void {
    label.visible = visible;
    if (!visible || !text) return;
    if (label.userData.statusText === text) return;
    const material = label.material as SpriteMaterial;
    material.map?.dispose();
    material.map = this.createStatusLabelTexture(text);
    material.needsUpdate = true;
    label.userData.statusText = text;
  }

  private createStatusLabelTexture(text: string): CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(7, 12, 16, 0.82)';
    ctx.strokeStyle = 'rgba(255, 216, 96, 0.88)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 7, 9, 242, 46, 13);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 28px system-ui, "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff2b2';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
    const texture = new CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private applyHpBarProfile(bar: Group, profile: EntityConstructionBarProfile3D | null): void {
    if (!profile) {
      bar.position.y = typeof bar.userData.baseY === 'number' ? bar.userData.baseY : bar.position.y;
      bar.scale.set(1, 1, 1);
      return;
    }
    bar.position.y = profile.y;
    bar.scale.set(profile.widthScale, profile.heightScale, profile.depthScale);
  }

  private updateHpBar(bar: Group, pct: number, material: Material = this.hpGoodMat.mat, visible = false): void {
    const fill = bar.getObjectByName('fill') as Mesh | null;
    if (!fill) return;
    const normalizedPct = Number.isFinite(pct) ? pct : 0;
    const clampedPct = Math.max(0.02, Math.min(1, normalizedPct));
    const baseWidth = typeof bar.userData.baseWidth === 'number' ? bar.userData.baseWidth : 1;
    fill.material = material;
    fill.scale.x = clampedPct;
    fill.position.x = -(baseWidth * (1 - clampedPct)) / 2;
    fill.visible = visible;
    bar.visible = visible;
  }

  private combatEntityIds(): Set<number> {
    const ids = new Set<number>();
    for (const e of this.world.entities.values()) {
      if (e.cooldown > 0) ids.add(e.id);
      if (e.targetId !== null) {
        ids.add(e.id);
        if (this.world.entities.has(e.targetId)) ids.add(e.targetId);
      }
    }
    for (const p of this.world.projectiles) {
      ids.add(p.shooterId);
      if (p.targetId !== null) ids.add(p.targetId);
    }
    return ids;
  }

  private hpMaterialForOwner(owner: number): Material {
    let material = this.hpOwnerMats.get(owner);
    if (!material) {
      material = new MeshBasicLike(playerColorForOwner(owner));
      this.hpOwnerMats.set(owner, material);
    }
    return material.mat;
  }

  private setVisualOpacity(root: Object3D, opacity: number): void {
    root.traverse((child) => {
      const mesh = child as Mesh;
      const material = mesh.material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        const m = mat as Material & { opacity?: number; transparent?: boolean; depthWrite?: boolean };
        const baseOpacity = typeof m.userData.baseOpacity === 'number' ? m.userData.baseOpacity : (m.opacity ?? 1);
        m.userData.baseOpacity = baseOpacity;
        m.opacity = baseOpacity * opacity;
        m.transparent = opacity < 0.999 || baseOpacity < 0.999;
        m.depthWrite = opacity >= 0.999;
      }
    });
  }

  private syncProjectiles(): void {
    this.projectileLayer.clear();
    for (const p of this.world.projectiles) {
      if (!consumeFrameVisualBudget3D(this.frameVisualBudget, 'projectile')) continue;
      const shooter = this.world.entities.get(p.shooterId);
      const shooterType = shooter && this.world.rules.units.get(shooter.typeId);
      const target = p.targetId === null ? null : (this.world.entities.get(p.targetId) ?? null);
      const targetPoint = target ?? (p.targetX !== undefined && p.targetY !== undefined ? { x: p.targetX, y: p.targetY } : null);
      const pos = projectileVisualPoint3D(shooterType, p, shooter, targetPoint);
      const profile = projectileVisualProfile3D(shooterType, p.weaponRole);
      if (profile.kind === 'bomb') {
        const bomb = new Mesh(this.projectileGeo, this.projectileMat);
        bomb.position.set(pos.x, pos.y, pos.z);
        bomb.scale.set(0.75, 1.45, 0.75);
        this.projectileLayer.add(bomb);
      } else if (p.weaponRole === 'missile' && shooterType?.domain === 'building') {
        // 爱国者拦截弹：细长导弹体 + 烟雾尾迹
        this.projectileLayer.add(this.createPatriotMissileVisual(pos, targetPoint));
      } else if (p.weaponRole === 'missile' && shooterType?.domain === 'vehicle') {
        // TEL 战术弹道导弹：大型导弹体 + 朝向目标 + 橙色尾焰
        this.projectileLayer.add(this.createTacticalMissileVisual(pos, shooter ?? null, targetPoint));
      } else {
        const targetPos = targetPoint ? leptonToWorld3D(targetPoint.x, targetPoint.y) : null;
        const end = targetPos ? projectileTracerEnd3D(pos, new Vector3(targetPos.x, pos.y, targetPos.z), 1.85) : new Vector3(pos.x, pos.y, pos.z - 0.8);
        const mat = p.weaponRole === 'missile' ? this.projectileMissileTracerMat : this.projectileTracerMat;
        this.projectileLayer.add(this.createTracerMesh(pos, end, mat));
      }
    }
  }

  /** 爱国者 PAC-3 拦截弹视觉：细长弹体 + 朝向目标 + 浓白烟雾尾迹。 */
  private createPatriotMissileVisual(pos: Vector3, target: { x: number; y: number } | null): Group {
    const root = new Group();
    root.position.copy(pos);
    // 弹体：细长圆柱，白色弹身+红色弹头
    const bodyGeo = new CylinderGeometry(0.06, 0.06, 0.7, 6);
    const bodyMat = new MeshLambertMaterial({ color: 0xe8e8e0 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    root.add(body);
    const noseGeo = new ConeGeometry(0.06, 0.18, 6);
    const noseMat = new MeshLambertMaterial({ color: 0xc23a3a });
    const nose = new Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 0.44;
    root.add(nose);
    // 尾翼
    const finMat = new MeshLambertMaterial({ color: 0x8a8a82 });
    for (const [dx, dz] of [[0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]] as const) {
      const fin = new Mesh(new BoxGeometry(0.04, 0.02, 0.18), finMat);
      fin.position.set(dx, dz, -0.32);
      root.add(fin);
    }
    // 朝向目标
    if (target) {
      const targetPos = leptonToWorld3D(target.x, target.y);
      const dir = new Vector3(targetPos.x - pos.x, (AIRCRAFT_ALTITUDE + 0.15) - pos.y, targetPos.z - pos.z);
      if (dir.lengthSq() > 0.001) {
        root.lookAt(new Vector3(pos.x + dir.x, pos.y + dir.y, pos.z + dir.z));
      }
    }
    // 烟雾尾迹：朝发射方向的反向延伸的渐淡圆柱
    const trailLen = 1.6;
    const trailGeo = new CylinderGeometry(0.18, 0.04, trailLen, 8, 1, true);
    const trailMat = new MeshBasicMaterial({
      color: 0xd8d8d8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const trail = new Mesh(trailGeo, trailMat);
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -trailLen / 2 - 0.35;
    root.add(trail);
    return root;
  }

  /** TEL 战术弹道导弹视觉：大型导弹体 + 朝向飞行方向 + 橙色尾焰。 */
  private createTacticalMissileVisual(pos: Vector3, shooter: { x: number; y: number } | null, target: { x: number; y: number } | null): Group {
    const root = new Group();
    root.position.copy(pos);
    // 弹体：粗圆柱，白色弹身+红色弹头（比爱国者更大）
    const bodyGeo = new CylinderGeometry(0.12, 0.12, 1.1, 8);
    const bodyMat = new MeshLambertMaterial({ color: 0xe0e0d8 });
    const body = new Mesh(bodyGeo, bodyMat);
    body.rotation.x = Math.PI / 2;
    root.add(body);
    // 弹头（红色锥）
    const noseGeo = new ConeGeometry(0.12, 0.28, 8);
    const noseMat = new MeshLambertMaterial({ color: 0xc23a3a });
    const nose = new Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = 0.69;
    root.add(nose);
    // 尾翼（4片）
    const finMat = new MeshLambertMaterial({ color: 0x8a8a82 });
    for (const [dx, dz] of [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]] as const) {
      const fin = new Mesh(new BoxGeometry(0.06, 0.02, 0.26), finMat);
      fin.position.set(dx, dz, -0.5);
      root.add(fin);
    }
    // 朝向飞行方向（从发射点指向目标）
    if (shooter && target) {
      const shooterPos = leptonToWorld3D(shooter.x, shooter.y);
      const targetPos = leptonToWorld3D(target.x, target.y);
      // 用当前弹道切线方向：近似为 (target - shooter)，高度按抛物线切线估算
      const full = Math.max(1, Math.hypot(target.x - shooter.x, target.y - shooter.y));
      const traveled = Math.min(1, Math.max(0, Math.hypot(pos.x - shooterPos.x, pos.z - shooterPos.z) / full));
      const peakY = 14, startY = 1.2, endY = 0.5;
      // 抛物线 y(t) 的导数：dy/dt = (peak-start)*4(1-2t) + (end-start)*2t
      const dydt = (peakY - startY) * 4 * (1 - 2 * traveled) + (endY - startY) * 2 * traveled;
      const dirX = targetPos.x - shooterPos.x;
      const dirZ = targetPos.z - shooterPos.z;
      const len = Math.max(0.001, Math.hypot(dirX, dirZ));
      // lookAt 需要前方点：水平方向归一化 × 步长 + 高度切线
      const step = 2;
      const lookTarget = new Vector3(
        pos.x + (dirX / len) * step,
        pos.y + dydt * 0.3,
        pos.z + (dirZ / len) * step,
      );
      root.lookAt(lookTarget);
    }
    const parabolicLookTarget = tacticalMissileLookTarget3D(pos, shooter, target);
    if (parabolicLookTarget) root.lookAt(parabolicLookTarget);
    // 橙色尾焰：渐淡圆柱（比爱国者更长更亮）
    const trailLen = 2.4;
    const trailGeo = new CylinderGeometry(0.22, 0.05, trailLen, 8, 1, true);
    const trailMat = new MeshBasicMaterial({
      color: 0xff7a1a,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const trail = new Mesh(trailGeo, trailMat);
    trail.rotation.x = Math.PI / 2;
    trail.position.z = -trailLen / 2 - 0.55;
    root.add(trail);
    // 内层亮焰
    const innerTrailGeo = new CylinderGeometry(0.1, 0.02, trailLen * 0.7, 8, 1, true);
    const innerTrailMat = new MeshBasicMaterial({
      color: 0xffe0a0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const innerTrail = new Mesh(innerTrailGeo, innerTrailMat);
    innerTrail.rotation.x = Math.PI / 2;
    innerTrail.position.z = -innerTrailGeo.parameters.height / 2 - 0.55;
    root.add(innerTrail);
    return root;
  }

  private aircraftOrbitCenters(): Map<number, Vector3> {
    const conyards = new Map<number, { x: number; z: number; count: number }>();
    const buildings = new Map<number, { x: number; z: number; count: number }>();
    const add = (map: Map<number, { x: number; z: number; count: number }>, owner: number, pos: { x: number; z: number }): void => {
      const prev = map.get(owner) ?? { x: 0, z: 0, count: 0 };
      prev.x += pos.x;
      prev.z += pos.z;
      prev.count++;
      map.set(owner, prev);
    };

    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type?.building) continue;
      const pos = cellToWorld3D(e.cellX + (type.building.footprintW - 1) / 2, e.cellY + (type.building.footprintH - 1) / 2);
      add(buildings, e.owner, pos);
      if (e.typeId === 'conyard') add(conyards, e.owner, pos);
    }

    const centers = new Map<number, Vector3>();
    const owners = new Set([...buildings.keys(), ...conyards.keys()]);
    for (const owner of owners) {
      const source = conyards.get(owner) ?? buildings.get(owner);
      if (!source || source.count === 0) continue;
      centers.set(owner, new Vector3(source.x / source.count, 0, source.z / source.count));
    }
    return centers;
  }

  private createTracerMesh(start: Vector3, end: Vector3, material: Material): Mesh {
    const delta = end.clone().sub(start);
    const rawLength = delta.length();
    const length = Math.max(0.01, rawLength);
    const direction = rawLength > 0.001 ? delta.normalize() : new Vector3(0, 0, 1);
    const tracer = new Mesh(this.projectileTracerGeo, material);
    tracer.position.copy(start).add(end).multiplyScalar(0.5);
    tracer.scale.z = length;
    tracer.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), direction);
    return tracer;
  }

  private processCombatEvents(): void {
    for (const event of this.audioEvents.update(this.audioSnapshot())) {
      const target = event.targetX !== undefined && event.targetZ !== undefined ? { x: event.targetX, z: event.targetZ } : null;
      const effectPoint = combatMuzzlePoint3D(event.kind, event, target);
      if ((event.kind === 'fire' || event.kind === 'cannon') && consumeFrameVisualBudget3D(this.frameVisualBudget, 'tracer')) {
        this.spawnTracerEffect(event, effectPoint);
      }
      if (consumeFrameVisualBudget3D(this.frameVisualBudget, 'combatEffect')) {
        this.spawnCombatEffect(event.kind, effectPoint.x, effectPoint.z);
      }
      this.onEvent?.(event.kind, effectPoint.x, effectPoint.z);
    }
  }

  private spawnTracerEffect(event: ThreeAudioEvent, start: Vector3): void {
    if (event.targetX === undefined || event.targetZ === undefined) return;
    if (this.combatEffects.length >= DEFAULT_FRAME_VISUAL_LIMITS_3D.activeCombatEffect) return;
    const profile = combatEffectProfile3D(event.kind);
    const end = new Vector3(event.targetX, profile.height, event.targetZ);
    const tracerMat = new MeshBasicMaterial({
      color: event.kind === 'cannon' ? 0xffd18a : projectileVisualProfile3D({ domain: 'infantry' }).color,
      transparent: true,
      opacity: event.kind === 'cannon' ? 0.82 : 0.72,
      depthWrite: false,
    });
    tracerMat.userData.baseOpacity = tracerMat.opacity;

    const root = new Group();
    root.add(this.createTracerMesh(start, end, tracerMat));
    this.effectLayer.add(root);
    const life = event.kind === 'cannon' ? 7 : 5;
    this.combatEffects.push({ root, life, maxLife: life, grow: 0.08 });
  }

  private spawnCombatEffect(kind: ThreeAudioEvent['kind'], x: number, z: number): void {
    if (this.combatEffects.length >= DEFAULT_FRAME_VISUAL_LIMITS_3D.activeCombatEffect) return;
    const profile = combatEffectProfile3D(kind);
    const root = new Group();
    root.position.set(x, profile.height, z);
    root.rotation.y = this.randEffectAngle(x, z, this.combatEffects.length);

    const flashMat = new MeshBasicMaterial({
      color: profile.color,
      transparent: true,
      opacity: profile.visual === 'blast' ? 0.88 : 0.92,
      depthWrite: false,
    });
    flashMat.userData.baseOpacity = flashMat.opacity;
    const flash = new Mesh(this.effectFlashGeo, flashMat);
    flash.scale.set(profile.radius, profile.radius * (profile.visual === 'blast' ? 0.62 : 0.5), profile.radius);
    root.add(flash);

    if (profile.visual === 'blast') {
      const ringMat = new MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.45, depthWrite: false });
      ringMat.userData.baseOpacity = ringMat.opacity;
      const ring = new Mesh(this.effectRingGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -profile.height + 0.08;
      ring.scale.setScalar(profile.radius * 1.15);
      root.add(ring);
    }

    for (let i = 0; i < profile.sparkCount; i++) {
      const sparkMat = new MeshBasicMaterial({ color: i % 3 === 0 ? 0xffffff : profile.color, transparent: true, opacity: 0.8, depthWrite: false });
      sparkMat.userData.baseOpacity = sparkMat.opacity;
      const spark = new Mesh(this.effectSparkGeo, sparkMat);
      const angle = (i / Math.max(1, profile.sparkCount)) * Math.PI * 2 + this.randEffectAngle(x, z, i);
      const dist = profile.radius * (0.45 + (i % 4) * 0.18);
      spark.position.set(Math.cos(angle) * dist, (i % 5) * 0.045, Math.sin(angle) * dist);
      spark.rotation.set(this.randEffectAngle(z, x, i + 9), angle, this.randEffectAngle(x, z, i + 17));
      spark.scale.set(1, 1, 0.65 + (i % 4) * 0.22);
      root.add(spark);
    }

    this.effectLayer.add(root);
    this.combatEffects.push({ root, life: profile.life, maxLife: profile.life, grow: profile.grow });
  }

  private stepCombatEffects(): void {
    for (let i = this.combatEffects.length - 1; i >= 0; i--) {
      const effect = this.combatEffects[i]!;
      effect.life--;
      const t = Math.max(0, effect.life / effect.maxLife);
      const grow = 1 + (1 - t) * effect.grow;
      effect.root.scale.setScalar(grow);
      effect.root.traverse((child) => {
        const mesh = child as Mesh;
        const mat = mesh.material as MeshBasicMaterial | undefined;
        if (!mat || typeof mat.opacity !== 'number') return;
        const base = typeof mat.userData.baseOpacity === 'number' ? mat.userData.baseOpacity : 1;
        mat.opacity = base * t;
      });
      if (effect.life > 0) continue;
      this.disposeEffect(effect.root);
      this.combatEffects.splice(i, 1);
    }
  }

  private randEffectAngle(x: number, z: number, salt: number): number {
    return this.randCell(Math.round(x * 10), Math.round(z * 10), salt) * Math.PI * 2;
  }

  private disposeEffect(root: Object3D): void {
    root.traverse((child) => {
      const mesh = child as Mesh;
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) for (const m of mat) m.dispose();
      else mat?.dispose();
    });
    root.removeFromParent();
  }

  private audioSnapshot(): ThreeAudioSnapshot {
    const entities: ThreeAudioSnapshot['entities'] = [];
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
      const pos = type.building
        ? cellToWorld3D(e.cellX + (type.building.footprintW - 1) / 2, e.cellY + (type.building.footprintH - 1) / 2)
        : leptonToWorld3D(e.x, e.y);
      const target = e.targetId !== null ? this.world.entities.get(e.targetId) : null;
      const targetType = target && this.world.rules.units.get(target.typeId);
      const activeWeapon = targetType ? weaponForTarget3D(type, targetType) : (type.weapon ?? type.antiAirWeapon ?? null);
      entities.push({
        id: e.id,
        x: pos.x,
        z: pos.z,
        hp: e.hp,
        cooldown: e.cooldown,
        targetId: e.targetId,
        building: !!type.building,
        engineer: type.engineer === true,
        domain: type.domain,
        projectileSpeed: activeWeapon?.projectileSpeed ?? 0,
        weaponRole: activeWeapon ? weaponRoleFor3D(type, activeWeapon) : undefined,
      });
    }
    const projectiles: ThreeAudioSnapshot['projectiles'] = [];
    for (const p of this.world.projectiles) {
      const shooter = this.world.entities.get(p.shooterId);
      const shooterType = shooter && this.world.rules.units.get(shooter.typeId);
      const target = p.targetId === null ? null : (this.world.entities.get(p.targetId) ?? null);
      const targetPoint = target ?? (p.targetX !== undefined && p.targetY !== undefined ? { x: p.targetX, y: p.targetY } : null);
      const pos = projectileVisualPoint3D(shooterType, p, shooter, targetPoint);
      const impactKind = projectileImpactKind3D(shooterType, p.weaponRole, p.splash);
      const flightKind = p.weaponRole === 'missile' && shooterType?.domain === 'building'
        ? 'missileFlight' as const
        : p.weaponRole === 'missile' && shooterType?.domain === 'vehicle'
          ? 'tacticalMissileFlight' as const
          : undefined;
      projectiles.push({ id: p.id, x: pos.x, z: pos.z, impactKind, flightKind });
    }
    return { entities, projectiles };
  }

  private clearPreview(): void {
    for (const child of [...this.previewLayer.children]) this.disposeObject(child);
  }

  private disposeObject(obj: Object3D): void {
    obj.traverse((child) => {
      const mesh = child as Mesh;
      const geo = mesh.geometry as BufferGeometry | undefined;
      geo?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) for (const m of mat) this.disposeMaterial(m);
      else if (mat) this.disposeMaterial(mat);
    });
    obj.removeFromParent();
  }

  private disposeMaterial(material: Material): void {
    if (material instanceof SpriteMaterial) material.map?.dispose();
    material.dispose();
  }

  private setPointerFromClient(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
  }

  private entityIdOf(obj: Object3D): number | null {
    let cur: Object3D | null = obj;
    while (cur) {
      if (!isPickableEntityPart3D(cur.userData)) return null;
      const id = cur.userData.entityId as number | undefined;
      if (typeof id === 'number') return id;
      cur = cur.parent;
    }
    return null;
  }

  private entityIdOfHit(hit: { object: Object3D; instanceId?: number }): number | null {
    const ids = hit.object.userData.instancedEntityIds as number[] | undefined;
    if (ids && typeof hit.instanceId === 'number') return ids[hit.instanceId] ?? null;
    return this.entityIdOf(hit.object);
  }
}

class MeshBasicLike {
  readonly mat: MeshLambertMaterial;

  constructor(color: number) {
    this.mat = new MeshLambertMaterial({ color });
  }
}
