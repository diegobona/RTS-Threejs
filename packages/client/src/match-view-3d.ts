import { World, categoryOf, type Command, type ProdCategory, type UnitType } from '@ra2web/game';
import { ThreeCameraController } from './three-camera';
import { cellToWorld3D, worldToCell3D } from './three-coords';
import { productionButtonState } from './three-build-ui';
import { idsInScreenRect, nearestIdWithinRadius } from './three-selection';
import { ThreeWorldRenderer } from './three-world-renderer';

export const MATCH_3D_STYLE = `
.mv3-root { position: fixed; inset: 0; overflow: hidden; background: #070b0d;
  font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; color: #d8e0e6; touch-action: none; }
.mv3-canvas { display: block; width: 100vw; height: 100vh; }
.mv3-top { position: fixed; left: 12px; top: 10px; z-index: 10; display: flex; gap: 14px; align-items: center;
  padding: 8px 12px; background: rgba(8,12,16,.82); border: 1px solid rgba(120,150,170,.18); border-radius: 8px; }
.mv3-top b { color: #f0d040; font-variant-numeric: tabular-nums; }
.mv3-top a { color: #6db3e8; text-decoration: none; }
.mv3-build { position: fixed; right: 12px; top: 12px; z-index: 10; width: 172px; display: grid; gap: 6px;
  padding: 8px; background: rgba(8,12,16,.86); border: 1px solid rgba(120,150,170,.2); border-radius: 8px; }
.mv3-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.mv3-tabs button { height: 30px; padding: 0; border: 1px solid rgba(125,150,165,.2); border-radius: 5px;
  background: #0d151c; color: #8ea0aa; cursor: pointer; font-size: 12px; }
.mv3-tabs button.on { color: #fff; border-color: #58a7d8; background: #173046; }
.mv3-prod-list { display: grid; gap: 6px; }
.mv3-prod-list button { height: 46px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px;
  padding: 7px 8px; border: 1px solid rgba(125,150,165,.28); border-radius: 6px; cursor: pointer;
  background: linear-gradient(#18232c, #101820); color: #dce6ed; text-align: left; }
.mv3-prod-list button:disabled { cursor: default; color: #6f7a82; background: #0b1116; border-color: rgba(125,150,165,.12); }
.mv3-prod-list button.ready { border-color: #58d478; box-shadow: inset 0 0 0 1px rgba(88,212,120,.25); }
.mv3-prod-list button.placing { border-color: #e0c74c; color: #fff2a8; }
.mv3-build .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv3-build .state { color: #f0d040; font-variant-numeric: tabular-nums; font-size: 12px; }
.mv3-chip { position: fixed; left: 12px; bottom: 12px; z-index: 10; padding: 7px 12px;
  background: rgba(8,12,16,.82); border: 1px solid rgba(120,150,170,.18); border-radius: 8px; color: #aeb9c2; }
.mv3-selbox { position: fixed; z-index: 9; display: none; pointer-events: none;
  border: 1px solid #72f085; background: rgba(114,240,133,.14); }
`;

export class MatchView3D {
  private renderer!: ThreeWorldRenderer;
  private camera!: ThreeCameraController;
  private creditsEl!: HTMLElement;
  private powerEl!: HTMLElement;
  private selBox!: HTMLElement;
  private tabsEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private lastStepAt = 0;
  private activeCategory: ProdCategory = 'building';
  private placingType: UnitType | null = null;
  private readonly selected = new Set<number>();
  private readonly localCommands: Command[] = [];
  private readonly buildButtons: { button: HTMLButtonElement; state: HTMLElement; type: UnitType }[] = [];

  constructor(
    private readonly root: HTMLElement,
    readonly world: World,
    readonly localPlayerId: number,
    readonly mapW: number,
    readonly mapH: number,
  ) {}

  async init(): Promise<void> {
    this.root.innerHTML = '';
    this.root.className = 'mv3-root';
    this.renderer = new ThreeWorldRenderer(this.root, this.world, this.localPlayerId);
    this.camera = new ThreeCameraController(this.renderer.renderer, this.mapW, this.mapH);
    const spawn =
      [...this.world.entities.values()].find((e) => {
        const type = this.world.rules.units.get(e.typeId);
        return e.owner === this.localPlayerId && type && type.domain !== 'building';
      }) ??
      [...this.world.entities.values()].find(
        (e) => e.owner === this.localPlayerId && this.world.rules.units.get(e.typeId)?.building,
      );
    if (spawn) {
      const focus = cellToWorld3D(spawn.cellX, spawn.cellY);
      this.camera.focus(focus.x, focus.z);
    }
    this.buildDom();
    this.bindCameraInput();
    this.lastStepAt = performance.now();
    (window as unknown as { __ra2view3d?: unknown }).__ra2view3d = {
      view: this,
      renderer: this.renderer,
      camera: this.camera,
      selected: this.selected,
    };
  }

  takeLocalCommands(): Command[] {
    return this.localCommands.splice(0);
  }

  stepWith(cmds: Command[]): void {
    if (cmds.length > 0) this.world.applyCommands(cmds);
    this.world.step();
    this.lastStepAt = performance.now();
  }

  render(): void {
    const now = performance.now();
    const alpha = Math.min(0.98, (now - this.lastStepAt) / (1000 / 15));
    this.updateHud();
    this.renderer.render(this.camera.camera, alpha, this.selected);
  }

  dispose(): void {
    this.renderer.dispose();
  }

  private buildDom(): void {
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="mv3-top">
        <span>3D RTS Preview</span>
        <span>Credits <b id="mv3-credits">0</b></span>
        <span>Power <b id="mv3-power">0</b></span>
        <span id="mv3-selected"></span>
        <a href="#">Exit</a>
      </div>
      <div class="mv3-build">
        <div class="mv3-tabs" id="mv3-tabs"></div>
        <div class="mv3-prod-list" id="mv3-prod-list"></div>
      </div>
      <div class="mv3-selbox" id="mv3-selbox"></div>
      <div class="mv3-chip">Produce: choose tab, click item | Buildings need Ready then placement</div>`,
    );
    this.creditsEl = this.root.querySelector('#mv3-credits')!;
    this.powerEl = this.root.querySelector('#mv3-power')!;
    this.selBox = this.root.querySelector('#mv3-selbox')!;
    this.tabsEl = this.root.querySelector('#mv3-tabs')!;
    this.buildEl = this.root.querySelector('#mv3-prod-list')!;
    this.buildProductionTabs();
    this.rebuildProductionPanel();
  }

  private updateHud(): void {
    const p = this.world.players.get(this.localPlayerId);
    this.creditsEl.textContent = String(p?.credits ?? 0);
    this.powerEl.textContent = `${p?.powerProduced ?? 0}/${p?.powerDrained ?? 0}`;
    const sel = this.root.querySelector('#mv3-selected');
    if (sel) sel.textContent = this.selected.size > 0 ? `Selected ${this.selected.size}` : '';
    this.refreshBuildPanel();
  }

  private buildProductionTabs(): void {
    const labels: Record<ProdCategory, string> = { building: 'Build', infantry: 'Inf', vehicle: 'Veh' };
    for (const category of ['building', 'infantry', 'vehicle'] as ProdCategory[]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels[category];
      button.addEventListener('click', () => {
        this.activeCategory = category;
        this.cancelPlacement();
        this.rebuildProductionPanel();
      });
      this.tabsEl.appendChild(button);
    }
    this.refreshTabs();
  }

  private rebuildProductionPanel(): void {
    this.buildEl.innerHTML = '';
    this.buildButtons.length = 0;
    const localSide = this.world.players.get(this.localPlayerId)?.side;
    const units = [...this.world.rules.units.values()].filter(
      (type) =>
        categoryOf(type) === this.activeCategory &&
        (!localSide || type.side === localSide || type.id === 'harvester') &&
        type.builtBy !== '',
    );
    for (const type of units) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${type.name} $${type.cost}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = this.buildLabel(type);
      const state = document.createElement('span');
      state.className = 'state';
      button.append(name, state);
      button.addEventListener('click', () => this.onProductionButton(type));
      this.buildEl.appendChild(button);
      this.buildButtons.push({ button, state, type });
    }
    this.refreshTabs();
    this.refreshBuildPanel();
  }

  private refreshBuildPanel(): void {
    for (const entry of this.buildButtons) {
      const state = productionButtonState(
        entry.type,
        this.world.canBuild(this.localPlayerId, entry.type),
        this.world.queueFor(this.localPlayerId, categoryOf(entry.type)),
        this.placingType?.id ?? null,
      );
      entry.button.disabled = state.disabled;
      entry.button.classList.toggle('ready', state.ready);
      entry.button.classList.toggle('placing', state.activePlace);
      entry.state.textContent = state.progressText;
    }
  }

  private refreshTabs(): void {
    const categories = ['building', 'infantry', 'vehicle'] as ProdCategory[];
    [...this.tabsEl.children].forEach((child, index) => {
      child.classList.toggle('on', categories[index] === this.activeCategory);
    });
  }

  private onProductionButton(type: UnitType): void {
    if (this.placingType?.id === type.id) {
      this.cancelPlacement();
      return;
    }
    const category = categoryOf(type);
    const q = this.world.queueFor(this.localPlayerId, category);
    if (type.domain === 'building' && q?.readyToPlace && q.items[0] === type.id) {
      this.placingType = type;
      this.selected.clear();
      return;
    }
    this.localCommands.push({ kind: 'produce', owner: this.localPlayerId, typeId: type.id });
  }

  private bindCameraInput(): void {
    const canvas = this.renderer.renderer.domElement;
    let panDrag: { x: number; y: number } | null = null;
    let selectDrag: { x: number; y: number } | null = null;
    canvas.addEventListener('contextmenu', (e: MouseEvent) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      if (e.button === 2) {
        if (this.placingType) {
          this.cancelPlacement();
          return;
        }
        this.issueMove(e.clientX, e.clientY);
        return;
      }
      if (e.button === 0 && this.placingType && !e.altKey) {
        this.tryPlaceBuilding(e.clientX, e.clientY);
        return;
      }
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        panDrag = { x: e.clientX, y: e.clientY };
      } else if (e.button === 0) {
        selectDrag = { x: e.clientX, y: e.clientY };
      }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (panDrag) {
        this.camera.panByScreen(e.clientX - panDrag.x, e.clientY - panDrag.y);
        panDrag = { x: e.clientX, y: e.clientY };
      }
      this.updateBuildPreview(e.clientX, e.clientY);
      if (selectDrag) this.drawSelectionBox(selectDrag.x, selectDrag.y, e.clientX, e.clientY);
    });
    const stop = (e: PointerEvent): void => {
      if (selectDrag) this.finishSelection(selectDrag.x, selectDrag.y, e.clientX, e.clientY);
      panDrag = null;
      selectDrag = null;
      this.selBox.style.display = 'none';
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.camera.zoomAt(e.deltaY);
    }, { passive: false });
    window.addEventListener('resize', () => {
      this.camera.applyResize();
      this.renderer.resize(this.camera.camera);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.cancelPlacement();
    });
  }

  private finishSelection(startX: number, startY: number, endX: number, endY: number): void {
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    this.selected.clear();
    if (w < 6 && h < 6) {
      const id =
        this.renderer.pickOwnUnit(this.camera.camera, endX, endY) ??
        nearestIdWithinRadius({ x: endX, y: endY }, this.renderer.ownUnitScreenPoints(this.camera.camera), 54);
      if (id !== null) this.selected.add(id);
      return;
    }
    const ids = idsInScreenRect(
      { x0: startX, y0: startY, x1: endX, y1: endY },
      this.renderer.ownUnitScreenPoints(this.camera.camera),
    );
    for (const id of ids) this.selected.add(id);
  }

  private issueMove(clientX: number, clientY: number): void {
    if (this.selected.size === 0) return;
    const hit = this.camera.groundAt(clientX, clientY);
    if (!hit) return;
    const cell = worldToCell3D(hit.x, hit.z);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.mapW || cell.y >= this.mapH) return;
    this.localCommands.push({ kind: 'move', entityIds: [...this.selected].sort((a, b) => a - b), cellX: cell.x, cellY: cell.y });
  }

  private tryPlaceBuilding(clientX: number, clientY: number): void {
    if (!this.placingType) return;
    const hit = this.camera.groundAt(clientX, clientY);
    if (!hit) return;
    const cell = worldToCell3D(hit.x, hit.z);
    if (!this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
      this.updateBuildPreview(clientX, clientY);
      return;
    }
    this.localCommands.push({ kind: 'place', owner: this.localPlayerId, typeId: this.placingType.id, cellX: cell.x, cellY: cell.y });
    this.cancelPlacement();
  }

  private updateBuildPreview(clientX: number, clientY: number): void {
    if (!this.placingType) {
      this.renderer.setBuildPreview(null, null, false);
      return;
    }
    const hit = this.camera.groundAt(clientX, clientY);
    if (!hit) {
      this.renderer.setBuildPreview(null, null, false);
      return;
    }
    const cell = worldToCell3D(hit.x, hit.z);
    const inBounds = cell.x >= 0 && cell.y >= 0 && cell.x < this.mapW && cell.y < this.mapH;
    this.renderer.setBuildPreview(
      this.placingType,
      inBounds ? cell : null,
      inBounds && this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y),
    );
  }

  private cancelPlacement(): void {
    this.placingType = null;
    this.renderer.setBuildPreview(null, null, false);
  }

  private buildLabel(type: UnitType): string {
    const labels: Record<string, string> = {
      powerplant: 'Power',
      refinery: 'Refinery',
      barracks: 'Barracks',
      warfactory: 'War Factory',
      pillbox: 'Pillbox',
      battlelab: 'Battle Lab',
      gi: 'British Soldier',
      engineer: 'Engineer',
      grizzly: 'British Tank',
      arty: 'Artillery',
      harvester: 'Harvester',
    };
    return labels[type.id] ?? type.name;
  }

  private drawSelectionBox(x0: number, y0: number, x1: number, y1: number): void {
    const minX = Math.min(x0, x1);
    const minY = Math.min(y0, y1);
    this.selBox.style.display = 'block';
    this.selBox.style.left = `${minX}px`;
    this.selBox.style.top = `${minY}px`;
    this.selBox.style.width = `${Math.abs(x1 - x0)}px`;
    this.selBox.style.height = `${Math.abs(y1 - y0)}px`;
  }
}
