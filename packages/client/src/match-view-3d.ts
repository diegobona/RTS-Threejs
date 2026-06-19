import { World, categoryOf, type CapacitySnapshot, type Command, type Entity, type ProdCategory, type UnitType } from '@ra2web/game';
import { Vector3 } from 'three';
import { audioBus } from './audio-bus';
import { bgm } from './bgm';
import { ThreeCameraController } from './three-camera';
import { cellToWorld3D, leptonToWorld3D, worldToCell3D } from './three-coords';
import { productionButtonState } from './three-build-ui';
import { rightClickCommand, type GroundMoveMode } from './three-orders';
import { idsInScreenRect, nearestIdWithinRadius } from './three-selection';
import { ThreeWorldRenderer } from './three-world-renderer';

export function initialCameraFocus3D(mapW: number, mapH: number): { x: number; z: number } {
  const center = cellToWorld3D((mapW - 1) / 2, (mapH - 1) / 2);
  return { x: center.x, z: center.z };
}

export const PRODUCTION_CATEGORIES_3D = ['building'] as const satisfies readonly ProdCategory[];

export function capacitySummaryText3D(capacity: CapacitySnapshot): string {
  return `建筑 ${capacity.building.count}/${capacity.building.limit} | 士兵 ${capacity.infantry.count}/${capacity.infantry.limit} | 坦克 ${capacity.vehicle.count}/${capacity.vehicle.limit} | 飞机 ${capacity.aircraft.count}/${capacity.aircraft.limit}`;
}

export function topHudText3D(capacity: CapacitySnapshot): string {
  return capacitySummaryText3D(capacity);
}

export const MATCH_3D_STYLE = `
.mv3-root { position: fixed; inset: 0; overflow: hidden; background: #070b0d;
  font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; color: #d8e0e6; touch-action: none; }
.mv3-canvas { display: block; width: 100vw; height: 100vh; }
.mv3-top { position: fixed; left: 12px; top: 10px; z-index: 10; display: flex; gap: 14px; align-items: center;
  padding: 8px 12px; background: rgba(8,12,16,.82); border: 1px solid rgba(120,150,170,.18); border-radius: 8px; }
.mv3-top b { color: #f0d040; font-variant-numeric: tabular-nums; }
.mv3-top a { color: #6db3e8; text-decoration: none; }
.mv3-capacity { color: #b9c9d2; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mv3-orders { position: fixed; left: 12px; top: 58px; z-index: 10; display: flex; gap: 6px;
  padding: 6px; background: rgba(8,12,16,.76); border: 1px solid rgba(120,150,170,.18); border-radius: 8px; }
.mv3-orders button { height: 30px; padding: 0 10px; border: 1px solid rgba(125,150,165,.22); border-radius: 6px;
  background: #0d151c; color: #aeb9c2; cursor: pointer; font-size: 13px; }
.mv3-orders button.on { color: #fff; border-color: #58a7d8; background: #173046; }
.mv3-build { position: fixed; right: 12px; top: 12px; z-index: 10; width: 196px; display: grid; gap: 6px;
  padding: 8px; background: rgba(8,12,16,.86); border: 1px solid rgba(120,150,170,.2); border-radius: 8px; }
.mv3-tabs { display: grid; grid-template-columns: 1fr; gap: 4px; }
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
.mv3-producer { display: none; gap: 6px; padding-top: 6px; border-top: 1px solid rgba(125,150,165,.16); }
.mv3-producer.on { display: grid; }
.mv3-producer-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; color: #b8c5cc; }
.mv3-producer button, .mv3-producer select { height: 30px; border-radius: 5px; border: 1px solid rgba(125,150,165,.25);
  background: #0d151c; color: #dce6ed; }
.mv3-producer button { cursor: pointer; padding: 0 9px; }
.mv3-producer select { min-width: 118px; }
.mv3-chip { position: fixed; left: 12px; bottom: 12px; z-index: 10; padding: 7px 12px;
  background: rgba(8,12,16,.82); border: 1px solid rgba(120,150,170,.18); border-radius: 8px; color: #aeb9c2; }
.mv3-selbox { position: fixed; z-index: 9; display: none; pointer-events: none;
  border: 1px solid #72f085; background: rgba(114,240,133,.14); }
`;

export class MatchView3D {
  private renderer!: ThreeWorldRenderer;
  private camera!: ThreeCameraController;
  private capacityEl!: HTMLElement;
  private selBox!: HTMLElement;
  private tabsEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private producerEl!: HTMLElement;
  private lastStepAt = 0;
  private activeCategory: ProdCategory = 'building';
  private placingType: UnitType | null = null;
  private readonly selected = new Set<number>();
  private readonly localCommands: Command[] = [];
  private readonly buildButtons: { button: HTMLButtonElement; state: HTMLElement; type: UnitType }[] = [];
  private readonly announcedCompletedBuildings = new Set<number>();
  private producerPanelKey = '';
  private groundMoveMode: GroundMoveMode = 'move';

  constructor(
    private readonly root: HTMLElement,
    readonly world: World,
    readonly localPlayerId: number,
    readonly mapW: number,
    readonly mapH: number,
  ) {}

  async init(): Promise<void> {
    bgm.enterMatch();
    audioBus.startBattleAmbience();
    void audioBus.loadRealSounds();
    this.root.innerHTML = '';
    this.root.className = 'mv3-root';
    this.renderer = new ThreeWorldRenderer(this.root, this.world, this.localPlayerId);
    await this.renderer.loadModels();
    this.renderer.onEvent = (kind, x, z) => {
      const { pan, gain } = this.spatialOfWorld(x, z);
      if (gain > 0.025) audioBus.play(kind, { pan, gain });
    };
    this.camera = new ThreeCameraController(this.renderer.renderer, this.mapW, this.mapH);
    const focus = initialCameraFocus3D(this.mapW, this.mapH);
    this.camera.focus(focus.x, focus.z);
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
    this.renderer.commitInterpolation();
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
    audioBus.stopBattleAmbience();
    this.renderer.dispose();
  }

  private buildDom(): void {
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="mv3-top">
        <span>3D RTS Preview</span>
        <span id="mv3-capacity" class="mv3-capacity"></span>
        <span id="mv3-selected"></span>
        <button id="mv3-mute" type="button" style="background:none;border:none;color:#9aa7b0;cursor:pointer;font-size:15px">Sound</button>
        <a href="#">Exit</a>
      </div>
      <div class="mv3-orders" id="mv3-orders">
        <button type="button" data-ground-mode="move">途中遇敌不攻击</button>
        <button type="button" data-ground-mode="attackMove">途中遇敌攻击</button>
      </div>
      <div class="mv3-build">
        <div class="mv3-tabs" id="mv3-tabs"></div>
        <div class="mv3-prod-list" id="mv3-prod-list"></div>
        <div class="mv3-producer" id="mv3-producer"></div>
      </div>
      <div class="mv3-selbox" id="mv3-selbox"></div>
      <div class="mv3-chip">Build, rally, command the swarm</div>`,
    );
    this.capacityEl = this.root.querySelector('#mv3-capacity')!;
    this.selBox = this.root.querySelector('#mv3-selbox')!;
    this.tabsEl = this.root.querySelector('#mv3-tabs')!;
    this.buildEl = this.root.querySelector('#mv3-prod-list')!;
    this.producerEl = this.root.querySelector('#mv3-producer')!;
    this.buildProductionTabs();
    this.rebuildProductionPanel();
    this.refreshGroundMoveModeButtons();
    this.root.querySelector('#mv3-orders')?.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-ground-mode]');
      const mode = button?.dataset.groundMode;
      if (mode === 'move' || mode === 'attackMove') this.setGroundMoveMode(mode);
    });
    this.root.querySelector('#mv3-mute')?.addEventListener('click', () => {
      const muted = audioBus.toggleMute();
      bgm.setMatchMuted(muted);
      const button = this.root.querySelector('#mv3-mute');
      if (button) button.textContent = muted ? 'Muted' : 'Sound';
    });
  }

  private setGroundMoveMode(mode: GroundMoveMode): void {
    this.groundMoveMode = mode;
    this.refreshGroundMoveModeButtons();
  }

  private refreshGroundMoveModeButtons(): void {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('#mv3-orders button[data-ground-mode]')) {
      button.classList.toggle('on', button.dataset.groundMode === this.groundMoveMode);
    }
  }

  private updateHud(): void {
    this.capacityEl.textContent = topHudText3D(this.world.capacityFor(this.localPlayerId));
    const sel = this.root.querySelector('#mv3-selected');
    if (sel) sel.textContent = this.selected.size > 0 ? `Selected ${this.selected.size}` : '';
    this.refreshBuildPanel();
    this.refreshProducerPanel();
    this.updateProductionAudio();
  }

  private buildProductionTabs(): void {
    const labels: Record<ProdCategory, string> = { building: 'Build', infantry: 'Inf', vehicle: 'Veh', aircraft: 'Air' };
    for (const category of PRODUCTION_CATEGORIES_3D) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = labels[category];
      button.addEventListener('click', () => {
        this.activeCategory = category;
        this.cancelPlacement();
        audioBus.play('select');
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
      button.title = type.name;
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
    [...this.tabsEl.children].forEach((child, index) => {
      child.classList.toggle('on', PRODUCTION_CATEGORIES_3D[index] === this.activeCategory);
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
      audioBus.play('select');
      return;
    }
    if (type.domain === 'building' && (!q || q.items.length === 0)) {
      this.localCommands.push({ kind: 'produce', owner: this.localPlayerId, typeId: type.id });
      this.placingType = type;
      this.selected.clear();
      audioBus.play('build');
      return;
    }
    this.localCommands.push({ kind: 'produce', owner: this.localPlayerId, typeId: type.id });
    audioBus.play(type.domain === 'building' ? 'build' : 'select');
  }

  private bindCameraInput(): void {
    const canvas = this.renderer.renderer.domElement;
    const unlock = (): void => audioBus.resume();
    canvas.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
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
        this.issueRightClickOrder(e.clientX, e.clientY);
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
      if (this.selected.size > 0) audioBus.play('select');
      return;
    }
    const ids = idsInScreenRect(
      { x0: startX, y0: startY, x1: endX, y1: endY },
      this.renderer.ownUnitScreenPoints(this.camera.camera),
    );
    for (const id of ids) this.selected.add(id);
    if (this.selected.size > 0) audioBus.play('select');
  }

  private selectedCombatIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (type && type.domain !== 'building' && type.weapon) out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  private selectedMovableIds(): number[] {
    const out: number[] = [];
    for (const id of this.selected) {
      const e = this.world.entities.get(id);
      const type = e && this.world.rules.units.get(e.typeId);
      if (type && type.domain !== 'building') out.push(id);
    }
    return out.sort((a, b) => a - b);
  }

  private selectedProducerBuilding(): { id: number; entity: NonNullable<ReturnType<World['entities']['get']>> } | null {
    if (this.selected.size !== 1) return null;
    const id = [...this.selected][0]!;
    const entity = this.world.entities.get(id);
    if (!entity || entity.owner !== this.localPlayerId || !entity.producer) return null;
    return { id, entity };
  }

  private issueRightClickOrder(clientX: number, clientY: number): void {
    const hit = this.camera.groundAt(clientX, clientY);
    const rawCell = hit ? worldToCell3D(hit.x, hit.z) : null;
    const cell =
      rawCell && rawCell.x >= 0 && rawCell.y >= 0 && rawCell.x < this.mapW && rawCell.y < this.mapH ? rawCell : null;
    const targetId = this.renderer.pickEntity(this.camera.camera, clientX, clientY);
    const target = targetId === null ? null : this.world.entities.get(targetId);
    const producer = this.selectedProducerBuilding();
    if (producer && cell && (!target || target.owner === this.localPlayerId)) {
      this.localCommands.push({ kind: 'setRally', owner: this.localPlayerId, buildingId: producer.id, cellX: cell.x, cellY: cell.y });
      this.spawnGroundCommandIndicator(cell);
      audioBus.play('move');
      return;
    }
    const cmd = rightClickCommand({
      selectedIds: this.selectedMovableIds(),
      combatIds: this.selectedCombatIds(),
      target: target ? { id: target.id, owner: target.owner } : null,
      localPlayerId: this.localPlayerId,
      cell,
      groundMode: this.groundMoveMode,
    });
    if (cmd) {
      this.localCommands.push(cmd);
      if (cmd.kind === 'attack' && target) this.spawnTargetCommandIndicator(target);
      else if (cell) this.spawnGroundCommandIndicator(cell);
      audioBus.play('move');
    } else {
      audioBus.play('deny');
    }
  }

  private spawnGroundCommandIndicator(cell: { x: number; y: number }): void {
    const pos = cellToWorld3D(cell.x, cell.y);
    this.renderer.spawnCommandIndicator('move', pos.x, pos.z);
  }

  private spawnTargetCommandIndicator(target: Entity): void {
    const type = this.world.rules.units.get(target.typeId);
    const pos = type?.building
      ? cellToWorld3D(target.cellX + (type.building.footprintW - 1) / 2, target.cellY + (type.building.footprintH - 1) / 2)
      : leptonToWorld3D(target.x, target.y);
    this.renderer.spawnCommandIndicator(
      'attack',
      pos.x,
      pos.z,
      type?.building ? { footprintW: type.building.footprintW, footprintH: type.building.footprintH } : undefined,
    );
  }

  private tryPlaceBuilding(clientX: number, clientY: number): void {
    if (!this.placingType) return;
    const hit = this.camera.groundAt(clientX, clientY);
    if (!hit) return;
    const cell = worldToCell3D(hit.x, hit.z);
    if (!this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
      this.updateBuildPreview(clientX, clientY);
      audioBus.play('deny');
      return;
    }
    this.localCommands.push({ kind: 'place', owner: this.localPlayerId, typeId: this.placingType.id, cellX: cell.x, cellY: cell.y });
    audioBus.play('place');
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

  private refreshProducerPanel(): void {
    const selected = this.selectedProducerBuilding();
    const producer = selected?.entity.producer ?? null;
    if (!selected || !producer) {
      this.producerPanelKey = '';
      this.producerEl.innerHTML = '';
      this.producerEl.classList.remove('on');
      return;
    }

    const options = this.producerOptionsFor(selected.entity);
    const activeType = this.world.rules.units.get(producer.paidTypeId ?? producer.typeId);
    const pct = activeType && producer.paidTypeId ? Math.floor((producer.progress / activeType.buildTime) * 100) : 0;
    const key = [
      selected.id,
      producer.enabled ? 1 : 0,
      producer.typeId,
      producer.paidTypeId ?? '',
      producer.progress,
      options.map((o) => o.id).join(','),
    ].join('|');
    if (key === this.producerPanelKey) return;
    this.producerPanelKey = key;
    this.producerEl.innerHTML = '';
    this.producerEl.classList.add('on');

    const title = document.createElement('div');
    title.className = 'mv3-producer-row';
    const titleText = document.createElement('span');
    titleText.textContent = this.buildLabel(this.world.rules.units.get(selected.entity.typeId)!);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = producer.enabled ? 'Auto' : 'Off';
    toggle.addEventListener('click', () => {
      this.localCommands.push({ kind: 'setAutoProduction', owner: this.localPlayerId, buildingId: selected.id, enabled: !producer.enabled });
      audioBus.play('select');
    });
    title.append(titleText, toggle);

    const row = document.createElement('div');
    row.className = 'mv3-producer-row';
    const progress = document.createElement('span');
    progress.textContent = producer.paidTypeId ? `${Math.max(0, Math.min(100, pct))}%` : 'Idle';
    const select = document.createElement('select');
    for (const option of options) {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = this.buildLabel(option);
      select.appendChild(item);
    }
    select.value = producer.typeId;
    select.addEventListener('change', () => {
      this.localCommands.push({ kind: 'setProducerType', owner: this.localPlayerId, buildingId: selected.id, typeId: select.value });
      audioBus.play('select');
    });
    row.append(progress, select);
    this.producerEl.append(title, row);
  }

  private producerOptionsFor(building: NonNullable<ReturnType<World['entities']['get']>>): UnitType[] {
    const localSide = this.world.players.get(this.localPlayerId)?.side;
    const options = [...this.world.rules.units.values()].filter(
      (type) =>
        type.builtBy === building.typeId &&
        type.domain !== 'building' &&
        (!localSide || type.side === localSide || type.id === 'harvester') &&
        this.world.canBuild(this.localPlayerId, type),
    );
    const current = building.producer ? this.world.rules.units.get(building.producer.typeId) : undefined;
    if (current && !options.some((type) => type.id === current.id)) options.unshift(current);
    return options;
  }

  private updateProductionAudio(): void {
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (e.owner !== this.localPlayerId || type?.domain !== 'building' || e.constructionTotal <= 0) continue;
      if (e.constructionProgress >= e.constructionTotal && !this.announcedCompletedBuildings.has(e.id)) {
        audioBus.playEva('buildComplete');
        this.announcedCompletedBuildings.add(e.id);
      }
    }
  }

  private spatialOfWorld(x: number, z: number): { pan: number; gain: number } {
    const projected = new Vector3(x, 0.5, z).project(this.camera.camera);
    const pan = Math.max(-1, Math.min(1, projected.x));
    const distance = Math.hypot(projected.x, projected.y);
    const gain = Math.max(0, Math.min(1, 1.05 - distance * 0.42));
    return { pan, gain };
  }

  private buildLabel(type: UnitType): string {
    const labels: Record<string, string> = {
      powerplant: 'Power',
      refinery: 'Refinery',
      barracks: 'Barracks',
      warfactory: 'War Factory',
      airbase: 'Airbase',
      pillbox: 'Pillbox',
      battlelab: 'Battle Lab',
      worker: 'Worker',
      gi: 'British Soldier',
      engineer: 'Engineer',
      grizzly: 'British Tank',
      arty: 'Artillery',
      fighter: 'Fighter',
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
