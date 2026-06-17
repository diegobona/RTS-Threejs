import {
  AmbientLight,
  Box3,
  BoxGeometry,
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
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WeaponRole, World, UnitType } from '@ra2web/game';
import { ThreeAudioEventTracker, type ThreeAudioEvent, type ThreeAudioSnapshot } from './three-audio-events';
import { cellToWorld3D, leptonToWorld3D, THREE_CELL_SIZE } from './three-coords';
import { WW1_MODEL_SPECS, type Ww1ModelSpec } from './ww1-model-manifest';

interface EntityView {
  root: Group;
  visualRoot: Group;
  hpBar: Group;
  selectionRing: Mesh;
}

interface CombatEffect {
  root: Group;
  life: number;
  maxLife: number;
  grow: number;
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

const PLAYER_COLORS = [0xf8d020, 0x3a7fe0, 0x30c040, 0xe04030, 0xd060d0, 0xe08020, 0x40c0c0, 0xc0c0c0];
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
  loiterCenter?: { x: number; z: number } | null;
}

export const LOWPOLY_FIGHTER_MODEL_SCALE = 1.45;

export const LOWPOLY_FIGHTER_PART_IDS = [
  'fuselage',
  'spine',
  'nose',
  'cockpit',
  'canopy',
  'main-wing',
  'main-wing-left',
  'main-wing-right',
  'tail-wing',
  'tail-wing-left',
  'tail-wing-right',
  'vertical-tail',
  'intake',
  'intake-left',
  'intake-right',
  'engine-nozzle',
  'hardpoint',
  'hardpoint-left-inner',
  'hardpoint-left-outer',
  'hardpoint-right-inner',
  'hardpoint-right-outer',
  'wingtip-left',
  'wingtip-right',
  'team-stripe',
] as const;

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

export function entityYawForFacing3D(facing: number): number {
  return -(((facing % 256) + 256) % 256 / 256) * Math.PI * 2;
}

export function proceduralModelYawOffset3D(type: Pick<UnitType, 'domain'>, hasExternalModel: boolean): number {
  if (hasExternalModel) return 0;
  return type.domain === 'vehicle' || type.domain === 'infantry' ? -Math.PI / 2 : 0;
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
  if (activity.targetId !== null && activity.targetId !== undefined) return new Vector3();
  if ((activity.pathLength ?? 0) > 0 || activity.goal || activity.waypoint || activity.attackMove) return new Vector3();
  const center = activity.loiterCenter ?? homeBaseCenter ?? aircraftPosition;
  const loiter = aircraftIdleLoiterPoint3D(timeSeconds, entityId, center);
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

function aircraftIdleHash3D(entityId: number, salt: number): number {
  const value = Math.sin(entityId * 127.1 + salt * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

export function projectileVisualPoint3D(
  shooterType: Pick<UnitType, 'domain'> | null | undefined,
  projectile: { x: number; y: number; weaponRole?: WeaponRole },
  shooter: { x: number; y: number } | null | undefined,
  target: { x: number; y: number } | null | undefined,
): Vector3 {
  if (projectile.weaponRole === 'missile') {
    const pos = leptonToWorld3D(projectile.x, projectile.y);
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
  if (weaponRole === 'missile') return { kind: 'tracer', color: 0xaedfff };
  if (weaponRole === 'bomb' || shooterType?.domain === 'aircraft') return { kind: 'bomb', color: 0x111111 };
  return { kind: 'tracer', color: 0xfff0b0 };
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
    case 'hit':
      return { visual: 'impactSpark', color: 0xfff6c0, radius: 0.24, height: 0.38, life: 12, sparkCount: 7, grow: 1.55 };
    case 'explosion':
      return { visual: 'blast', color: 0xffa640, radius: 0.72, height: 0.5, life: 22, sparkCount: 13, grow: 2.2 };
    case 'bigExplosion':
      return { visual: 'blast', color: 0xff7a2a, radius: 1.18, height: 0.75, life: 32, sparkCount: 20, grow: 2.6 };
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
  private readonly views = new Map<number, EntityView>();
  private readonly combatEffects: CombatEffect[] = [];
  private readonly modelTemplates = new Map<string, Object3D>();
  private readonly gltfLoader = new GLTFLoader();
  private readonly audioEvents = new ThreeAudioEventTracker();
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
  private readonly projectileMat = new MeshLambertMaterial({ color: 0x111111 });
  private readonly projectileTracerMat = new MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.92, depthWrite: false });
  private readonly projectileMissileTracerMat = new MeshBasicMaterial({ color: 0xaedfff, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();

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
    this.scene.add(sun, this.entityLayer, this.projectileLayer, this.effectLayer, this.previewLayer);

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

  render(camera: Camera, alpha: number, selected: ReadonlySet<number>): void {
    this.syncEntities(alpha, selected);
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
      const id = this.entityIdOf(hit.object);
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
      const id = this.entityIdOf(hit.object);
      if (id !== null && this.world.entities.has(id)) return id;
    }
    return null;
  }

  ownUnitScreenPoints(camera: Camera): { id: number; x: number; y: number }[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out: { id: number; x: number; y: number }[] = [];
    for (const [id, view] of this.views) {
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (!e || e.owner !== this.localPlayerId || !type || type.domain === 'building') continue;
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

  dispose(): void {
    for (const view of this.views.values()) this.disposeObject(view.root);
    this.views.clear();
    for (const template of this.modelTemplates.values()) this.disposeObject(template);
    this.modelTemplates.clear();
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
    for (let y = 0; y < this.world.terrain.height; y++) {
      for (let x = 0; x < this.world.terrain.width; x++) {
        const m = this.world.terrain.passable(x, y) ? ((x + y) % 2 === 0 ? passMatA : passMatB) : blockMat;
        const tile = new Mesh(this.tileGeo, m);
        const pos = cellToWorld3D(x, y);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(pos.x, -0.01, pos.z);
        this.scene.add(tile);
      }
    }
    this.drawGrassBands(center.x, center.z);
    this.drawRoads();
    this.drawLandscapeProps();
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
        if (!this.world.terrain.passable(x, y) || this.world.oreAt(x, y) > 0 || this.nearInitialEntityCell(x, y, 5)) continue;
        const r = this.randCell(x, y);
        if (r > 0.24) continue;
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

  private syncEntities(alpha: number, selected: ReadonlySet<number>): void {
    const seen = new Set<number>();
    const nowSeconds = performance.now() / 1000;
    const airOrbitCenters = this.aircraftOrbitCenters();
    for (const e of this.world.entities.values()) {
      seen.add(e.id);
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
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
        const orbit = aircraftIdleOrbitOffset3D(
          type,
          { targetId: e.targetId, pathLength: e.path.length, goal: e.goal, waypoint: e.waypoint, attackMove: e.attackMove, loiterCenter },
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
        view.root.rotation.y = orbiting ? aircraftIdleOrbitYaw3D(nowSeconds, e.id) : entityYawForFacing3D(e.facing);
      }
      view.visualRoot.scale.setScalar(selected.has(e.id) ? 1.12 : 1);
      view.selectionRing.visible = selected.has(e.id);
      this.updateHpBar(view.hpBar, e.hp / e.maxHp);
    }

    for (const [id, view] of this.views) {
      if (!seen.has(id)) {
        this.disposeObject(view.root);
        this.views.delete(id);
      }
    }
  }

  private createEntityView(type: UnitType, owner: number, entityId: number): EntityView {
    const root = new Group();
    const visualRoot = new Group();
    visualRoot.position.y = entityVisualAltitude3D(type);
    root.userData.entityId = entityId;
    root.userData.typeId = type.id;
    const ownerColor = PLAYER_COLORS[(owner - 1) % PLAYER_COLORS.length] ?? 0xcccccc;
    const model = this.createModelInstance(type, entityId);
    visualRoot.rotation.y = proceduralModelYawOffset3D(type, !!model);

    if (model) {
      visualRoot.add(model);
    } else if (type.building) {
      visualRoot.add(this.createBuilding(type, ownerColor));
    } else if (type.domain === 'vehicle') {
      visualRoot.add(
        type.id === 'grizzly'
          ? this.createTank(ownerColor)
          : type.id === 'harvester'
            ? this.createHarvester(ownerColor)
            : this.createVehiclePlaceholder(ownerColor, !!type.weapon),
      );
    } else if (type.domain === 'aircraft') {
      visualRoot.add(this.createAircraft(ownerColor));
      root.add(this.createAircraftShadow());
    } else {
      visualRoot.add(this.createInfantry(ownerColor));
    }

    root.add(visualRoot);

    const hpBar = this.createHpBar(type.building ? 1.6 : 0.9, type.building ? 1.6 : entityVisualAltitude3D(type) + 1.35);
    const selectionRing = new Mesh(this.selectionRingGeo, this.selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = entitySelectionRingAltitude3D(type);
    selectionRing.scale.setScalar(entitySelectionRingScale3D(type));
    selectionRing.visible = false;
    root.add(selectionRing, hpBar);
    root.traverse((child) => {
      child.userData.entityId = entityId;
    });
    return { root, visualRoot, hpBar, selectionRing };
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
    const uniformMat = new MeshLambertMaterial({ color: 0x59634d });
    const darkUniformMat = new MeshLambertMaterial({ color: 0x394235 });
    const skinMat = new MeshLambertMaterial({ color: 0xb08a65 });
    const helmetMat = new MeshLambertMaterial({ color: 0x465143 });
    const rifleMat = new MeshLambertMaterial({ color: 0x2e302c });
    const woodMat = new MeshLambertMaterial({ color: 0x6c4e30 });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (name: string, mesh: Mesh): Mesh => {
      mesh.name = `infantry-${name}`;
      root.add(mesh);
      return mesh;
    };

    const body = addPart('body', new Mesh(this.soldierGeo, uniformMat));
    body.position.y = 0.68;
    body.scale.set(0.88, 0.92, 0.78);

    const head = addPart('head', new Mesh(new SphereGeometry(0.18, 8, 8), skinMat));
    head.position.set(0, 1.24, -0.03);
    const helmet = addPart('helmet', new Mesh(new ConeGeometry(0.23, 0.16, 8), helmetMat));
    helmet.position.set(0, 1.39, -0.03);
    helmet.rotation.y = Math.PI / 8;

    const backpack = addPart('backpack', new Mesh(new BoxGeometry(0.28, 0.38, 0.16), darkUniformMat));
    backpack.position.set(0, 0.78, 0.24);

    const leftArm = addPart('left-arm', new Mesh(new BoxGeometry(0.12, 0.5, 0.12), darkUniformMat));
    leftArm.position.set(-0.28, 0.82, -0.08);
    leftArm.rotation.x = -0.75;
    leftArm.rotation.z = -0.16;
    const rightArm = addPart('right-arm', new Mesh(new BoxGeometry(0.12, 0.5, 0.12), darkUniformMat));
    rightArm.position.set(0.28, 0.82, -0.1);
    rightArm.rotation.x = -0.65;
    rightArm.rotation.z = 0.18;

    const leftLeg = addPart('left-leg', new Mesh(new BoxGeometry(0.13, 0.48, 0.13), darkUniformMat));
    leftLeg.position.set(-0.11, 0.25, 0.02);
    leftLeg.rotation.x = -0.12;
    const rightLeg = addPart('right-leg', new Mesh(new BoxGeometry(0.13, 0.48, 0.13), darkUniformMat));
    rightLeg.position.set(0.11, 0.25, -0.02);
    rightLeg.rotation.x = 0.12;

    const rifleStock = addPart('rifle-stock', new Mesh(new BoxGeometry(0.12, 0.1, 0.3), woodMat));
    rifleStock.position.set(0.2, 0.86, -0.31);
    rifleStock.rotation.x = -0.15;
    const rifleBarrel = addPart('rifle-barrel', new Mesh(new BoxGeometry(0.06, 0.06, 0.72), rifleMat));
    rifleBarrel.position.set(0.14, 0.9, -0.72);
    rifleBarrel.rotation.x = -0.06;

    const teamPatch = addPart('team-patch', new Mesh(new BoxGeometry(0.08, 0.16, 0.035), accentMat));
    teamPatch.position.set(0.24, 0.96, -0.21);

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
    const hullMat = new MeshLambertMaterial({ color: 0x7f897b });
    const panelMat = new MeshLambertMaterial({ color: 0x5f6a62 });
    const darkMat = new MeshLambertMaterial({ color: 0x30383b });
    const canopyMat = new MeshLambertMaterial({ color: 0x26394b });
    const hardpointMat = new MeshLambertMaterial({ color: 0xd0d0bc });
    const accentMat = new MeshLambertMaterial({ color: ownerColor });
    const addPart = (id: string, mesh: Mesh): Mesh => {
      mesh.name = id;
      root.add(mesh);
      return mesh;
    };

    const fuselage = addPart('fuselage', new Mesh(this.fighterFuselageGeo, hullMat));
    fuselage.position.y = 0.36;

    const spine = addPart('spine', new Mesh(this.fighterSpineGeo, panelMat));
    spine.position.set(-0.18, 0.56, 0);

    const nose = addPart('nose', new Mesh(this.fighterNoseGeo, darkMat));
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(1.14, 0.36, 0);

    const cockpit = addPart('cockpit', new Mesh(this.fighterCockpitGeo, canopyMat));
    cockpit.position.set(0.34, 0.58, 0);
    cockpit.rotation.z = -0.08;

    const canopy = addPart('canopy', new Mesh(this.fighterCockpitGeo, canopyMat));
    canopy.position.set(0.16, 0.7, 0);
    canopy.scale.set(0.55, 0.58, 0.72);

    const mainWingLeft = addPart('main-wing-left', new Mesh(this.fighterWingGeo, hullMat));
    mainWingLeft.position.set(-0.08, 0.33, 0.62);
    mainWingLeft.rotation.y = -0.35;

    const mainWingRight = addPart('main-wing-right', new Mesh(this.fighterWingGeo, hullMat));
    mainWingRight.position.set(-0.08, 0.33, -0.62);
    mainWingRight.rotation.y = 0.35;

    const tailWingLeft = addPart('tail-wing-left', new Mesh(this.fighterTailWingGeo, panelMat));
    tailWingLeft.position.set(-0.72, 0.46, 0.38);
    tailWingLeft.rotation.y = -0.25;

    const tailWingRight = addPart('tail-wing-right', new Mesh(this.fighterTailWingGeo, panelMat));
    tailWingRight.position.set(-0.72, 0.46, -0.38);
    tailWingRight.rotation.y = 0.25;

    const verticalTail = addPart('vertical-tail', new Mesh(this.fighterVerticalTailGeo, panelMat));
    verticalTail.position.set(-0.78, 0.76, 0);
    verticalTail.rotation.z = 0.1;

    const intakeLeft = addPart('intake-left', new Mesh(this.fighterIntakeGeo, darkMat));
    intakeLeft.position.set(0.28, 0.27, 0.33);

    const intakeRight = addPart('intake-right', new Mesh(this.fighterIntakeGeo, darkMat));
    intakeRight.position.set(0.28, 0.27, -0.33);

    const nozzle = addPart('engine-nozzle', new Mesh(this.fighterNozzleGeo, darkMat));
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(-1.02, 0.36, 0);

    const addHardpoint = (id: string, x: number, z: number): void => {
      const body = addPart(id, new Mesh(this.fighterHardpointGeo, hardpointMat));
      body.position.set(x, 0.21, z);
      const tip = addPart(`${id}-nose`, new Mesh(this.fighterHardpointNoseGeo, darkMat));
      tip.rotation.z = -Math.PI / 2;
      tip.position.set(x + 0.23, 0.21, z);
    };
    addHardpoint('hardpoint-left-inner', 0.04, 0.58);
    addHardpoint('hardpoint-left-outer', -0.34, 0.82);
    addHardpoint('hardpoint-right-inner', 0.04, -0.58);
    addHardpoint('hardpoint-right-outer', -0.34, -0.82);

    const wingtipLeft = addPart('wingtip-left', new Mesh(this.fighterWingtipGeo, accentMat));
    wingtipLeft.position.set(-0.06, 0.36, 1.13);
    const wingtipRight = addPart('wingtip-right', new Mesh(this.fighterWingtipGeo, accentMat));
    wingtipRight.position.set(-0.06, 0.36, -1.13);

    const stripe = addPart('team-stripe', new Mesh(this.fighterStripeGeo, accentMat));
    stripe.position.set(-0.44, 0.53, 0);
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
    fill.name = 'fill';
    fill.position.z = -0.01;
    root.add(back, fill);
    root.position.y = y;
    return root;
  }

  private updateHpBar(bar: Group, pct: number): void {
    const fill = bar.getObjectByName('fill');
    if (!fill) return;
    fill.scale.x = Math.max(0.02, Math.min(1, pct));
    fill.visible = pct < 0.999;
    bar.visible = pct < 0.999;
  }

  private syncProjectiles(): void {
    this.projectileLayer.clear();
    for (const p of this.world.projectiles) {
      const shooter = this.world.entities.get(p.shooterId);
      const shooterType = shooter && this.world.rules.units.get(shooter.typeId);
      const target = this.world.entities.get(p.targetId);
      const pos = projectileVisualPoint3D(shooterType, p, shooter, target);
      const profile = projectileVisualProfile3D(shooterType, p.weaponRole);
      if (profile.kind === 'bomb') {
        const bomb = new Mesh(this.projectileGeo, this.projectileMat);
        bomb.position.set(pos.x, pos.y, pos.z);
        bomb.scale.set(0.75, 1.45, 0.75);
        this.projectileLayer.add(bomb);
      } else {
        const targetPos = target ? leptonToWorld3D(target.x, target.y) : null;
        const end = targetPos ? projectileTracerEnd3D(pos, new Vector3(targetPos.x, pos.y, targetPos.z), 1.85) : new Vector3(pos.x, pos.y, pos.z - 0.8);
        const mat = p.weaponRole === 'missile' ? this.projectileMissileTracerMat : this.projectileTracerMat;
        this.projectileLayer.add(this.createTracerMesh(pos, end, mat));
      }
    }
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
      if (event.kind === 'fire' || event.kind === 'cannon') this.spawnTracerEffect(event, effectPoint);
      this.spawnCombatEffect(event.kind, effectPoint.x, effectPoint.z);
      this.onEvent?.(event.kind, effectPoint.x, effectPoint.z);
    }
  }

  private spawnTracerEffect(event: ThreeAudioEvent, start: Vector3): void {
    if (event.targetX === undefined || event.targetZ === undefined) return;
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
      const target = this.world.entities.get(p.targetId);
      const pos = projectileVisualPoint3D(shooterType, p, shooter, target);
      const impactKind = p.splash > 0 || shooterType?.domain === 'aircraft' || shooterType?.domain === 'vehicle' ? 'explosion' : 'hit';
      projectiles.push({ id: p.id, x: pos.x, z: pos.z, impactKind });
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
      if (Array.isArray(mat)) for (const m of mat) m.dispose();
      else mat?.dispose();
    });
    obj.removeFromParent();
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
}

class MeshBasicLike {
  readonly mat: MeshLambertMaterial;

  constructor(color: number) {
    this.mat = new MeshLambertMaterial({ color });
  }
}
