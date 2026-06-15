import {
  AmbientLight,
  Box3,
  BoxGeometry,
  type Camera,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { World, UnitType } from '@ra2web/game';
import { cellToWorld3D, leptonToWorld3D, THREE_CELL_SIZE } from './three-coords';
import { WW1_MODEL_SPECS, type Ww1ModelSpec } from './ww1-model-manifest';

interface EntityView {
  root: Group;
  hpBar: Group;
  selectionRing: Mesh;
}

const PLAYER_COLORS = [0xf8d020, 0x3a7fe0, 0x30c040, 0xe04030, 0xd060d0, 0xe08020, 0x40c0c0, 0xc0c0c0];
const AIRCRAFT_ALTITUDE = 4.2;

export class ThreeWorldRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  private readonly entityLayer = new Group();
  private readonly projectileLayer = new Group();
  private readonly previewLayer = new Group();
  private readonly views = new Map<number, EntityView>();
  private readonly modelTemplates = new Map<string, Object3D>();
  private readonly gltfLoader = new GLTFLoader();
  private readonly tileGeo = new PlaneGeometry(THREE_CELL_SIZE, THREE_CELL_SIZE);
  private readonly oreGeo = new OctahedronGeometry(0.18, 0);
  private readonly projectileGeo = new SphereGeometry(0.12, 8, 8);
  private readonly soldierGeo = new CapsuleGeometry(0.22, 0.7, 4, 8);
  private readonly vehicleGeo = new BoxGeometry(0.9, 0.35, 1.25);
  private readonly barrelGeo = new BoxGeometry(0.16, 0.12, 0.8);
  private readonly aircraftBodyGeo = new BoxGeometry(1.45, 0.22, 0.28);
  private readonly aircraftWingGeo = new BoxGeometry(0.32, 0.08, 1.55);
  private readonly aircraftTailGeo = new BoxGeometry(0.24, 0.12, 0.78);
  private readonly aircraftNoseGeo = new ConeGeometry(0.18, 0.42, 12);
  private readonly selectionRingGeo = new RingGeometry(0.52, 0.64, 32);
  private readonly selectionRingMat = new MeshLambertMaterial({ color: 0x68f07a });
  private readonly hpBackMat = new MeshBasicLike(0x101010);
  private readonly hpGoodMat = new MeshBasicLike(0x42d66d);
  private readonly projectileMat = new MeshLambertMaterial({ color: 0xffe060 });
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

    this.scene.background = new Color(0x8fb0c9);
    this.scene.fog = new Fog(0x8fb0c9, 70, 260);
    this.scene.add(new AmbientLight(0x9fb2c0, 1.8));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(-8, 18, 10);
    this.scene.add(sun, this.entityLayer, this.projectileLayer, this.previewLayer);

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
    this.renderer.render(this.scene, camera);
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
      if (e?.owner === this.localPlayerId && type && type.domain !== 'building') return id;
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
      const p = view.root.position.clone().project(camera);
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

    const passMatA = new MeshLambertMaterial({ color: 0x244020 });
    const passMatB = new MeshLambertMaterial({ color: 0x1d351b });
    const blockMat = new MeshLambertMaterial({ color: 0x332d25 });
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
  }

  private largeGroundGeo(): PlaneGeometry {
    return new PlaneGeometry(this.world.terrain.width * THREE_CELL_SIZE * 4, this.world.terrain.height * THREE_CELL_SIZE * 4, this.world.terrain.width * 4, this.world.terrain.height * 4);
  }

  private largeGroundMat(): MeshLambertMaterial {
    return new MeshLambertMaterial({ color: 0x244020 });
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
    for (const e of this.world.entities.values()) {
      seen.add(e.id);
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
      let view = this.views.get(e.id);
      if (!view) {
        view = this.createEntityView(type, e.owner, e.id);
        this.views.set(e.id, view);
        this.entityLayer.add(view.root);
      }

      if (type.building) {
        const pos = cellToWorld3D(e.cellX + (type.building.footprintW - 1) / 2, e.cellY + (type.building.footprintH - 1) / 2);
        view.root.position.set(pos.x, 0, pos.z);
      } else {
        const last = view.root.userData.last as { x: number; y: number } | undefined;
        const lx = last?.x ?? e.x;
        const ly = last?.y ?? e.y;
        const pos = leptonToWorld3D(lx + (e.x - lx) * alpha, ly + (e.y - ly) * alpha);
        view.root.position.set(pos.x, type.domain === 'aircraft' ? AIRCRAFT_ALTITUDE : 0, pos.z);
        view.root.rotation.y = -(e.facing / 256) * Math.PI * 2;
        view.root.userData.last = { x: e.x, y: e.y };
      }
      view.root.scale.setScalar(selected.has(e.id) ? 1.12 : 1);
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
    root.userData.entityId = entityId;
    root.userData.typeId = type.id;
    const ownerColor = PLAYER_COLORS[(owner - 1) % PLAYER_COLORS.length] ?? 0xcccccc;
    const model = this.createModelInstance(type, entityId);

    if (model) {
      root.add(model);
    } else if (type.building) {
      root.add(this.createBuilding(type, ownerColor));
    } else if (type.domain === 'vehicle') {
      const body = new Mesh(this.vehicleGeo, new MeshLambertMaterial({ color: ownerColor }));
      body.position.y = 0.22;
      root.add(body);
      if (type.weapon) {
        const barrel = new Mesh(this.barrelGeo, new MeshLambertMaterial({ color: 0x343a3f }));
        barrel.position.set(0, 0.35, -0.55);
        root.add(barrel);
      }
    } else if (type.domain === 'aircraft') {
      root.add(this.createAircraft(ownerColor));
    } else {
      const soldier = new Mesh(this.soldierGeo, new MeshLambertMaterial({ color: ownerColor }));
      soldier.position.y = 0.55;
      root.add(soldier);
    }

    const hpBar = this.createHpBar(type.building ? 1.6 : 0.9, type.building ? 1.6 : 1.35);
    const selectionRing = new Mesh(this.selectionRingGeo, this.selectionRingMat);
    selectionRing.rotation.x = -Math.PI / 2;
    selectionRing.position.y = 0.045;
    selectionRing.visible = false;
    root.add(selectionRing, hpBar);
    root.traverse((child) => {
      child.userData.entityId = entityId;
    });
    return { root, hpBar, selectionRing };
  }

  private createBuilding(type: UnitType, ownerColor: number): Object3D {
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

  private createAircraft(ownerColor: number): Object3D {
    const root = new Group();
    const bodyMat = new MeshLambertMaterial({ color: ownerColor });
    const darkMat = new MeshLambertMaterial({ color: 0x343a3f });
    const body = new Mesh(this.aircraftBodyGeo, bodyMat);
    body.position.y = 0.28;
    const wing = new Mesh(this.aircraftWingGeo, bodyMat);
    wing.position.y = 0.27;
    const tail = new Mesh(this.aircraftTailGeo, bodyMat);
    tail.position.set(-0.58, 0.42, 0);
    const nose = new Mesh(this.aircraftNoseGeo, darkMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(0.93, 0.28, 0);
    root.add(body, wing, tail, nose);
    return root;
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
      const pos = leptonToWorld3D(p.x, p.y);
      const sp = new Mesh(this.projectileGeo, this.projectileMat);
      sp.position.set(pos.x, 0.55, pos.z);
      this.projectileLayer.add(sp);
    }
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
