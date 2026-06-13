import {
  AmbientLight,
  BoxGeometry,
  type Camera,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
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
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import type { World, UnitType } from '@ra2web/game';
import { cellToWorld3D, leptonToWorld3D, THREE_CELL_SIZE } from './three-coords';

interface EntityView {
  root: Group;
  hpBar: Group;
  selectionRing: Mesh;
}

const PLAYER_COLORS = [0xf8d020, 0x3a7fe0, 0x30c040, 0xe04030, 0xd060d0, 0xe08020, 0x40c0c0, 0xc0c0c0];

export class ThreeWorldRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  private readonly entityLayer = new Group();
  private readonly projectileLayer = new Group();
  private readonly previewLayer = new Group();
  private readonly views = new Map<number, EntityView>();
  private readonly tileGeo = new PlaneGeometry(THREE_CELL_SIZE, THREE_CELL_SIZE);
  private readonly oreGeo = new OctahedronGeometry(0.18, 0);
  private readonly projectileGeo = new SphereGeometry(0.12, 8, 8);
  private readonly soldierGeo = new CapsuleGeometry(0.22, 0.7, 4, 8);
  private readonly vehicleGeo = new BoxGeometry(0.9, 0.35, 1.25);
  private readonly barrelGeo = new BoxGeometry(0.16, 0.12, 0.8);
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

    this.scene.background = new Color(0x070b0d);
    this.scene.add(new AmbientLight(0x9fb2c0, 1.8));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(-8, 18, 10);
    this.scene.add(sun, this.entityLayer, this.projectileLayer, this.previewLayer);

    this.drawTerrain();
    this.drawOre();
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
    this.disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private drawTerrain(): void {
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
        view.root.position.set(pos.x, 0, pos.z);
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

    if (type.building) {
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
    const h = type.id === 'conyard' ? 1.8 : type.id === 'warfactory' ? 1.35 : type.id === 'pillbox' ? 0.55 : 1.1;
    const mat = new MeshLambertMaterial({ color: type.id === 'pillbox' ? 0x77715f : ownerColor });
    const body = new Mesh(new BoxGeometry(b.footprintW * 1.65, h, b.footprintH * 1.65), mat);
    body.position.y = h / 2;
    root.add(body);
    if (type.id === 'conyard' || type.id === 'barracks') {
      const roof = new Mesh(new ConeGeometry(Math.max(b.footprintW, b.footprintH) * 1.25, 0.75, 4), new MeshLambertMaterial({ color: 0x6a624b }));
      roof.position.y = h + 0.35;
      roof.rotation.y = Math.PI / 4;
      root.add(roof);
    }
    return root;
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
