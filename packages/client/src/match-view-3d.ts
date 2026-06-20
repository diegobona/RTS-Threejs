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

export const DEFAULT_GROUND_MOVE_MODE_3D: GroundMoveMode = 'move';

export const GROUND_MOVE_MODE_BUTTONS_3D = [
  { mode: 'move', label: '途中遇敌不攻击', title: '默认：右键移动，不主动攻击沿途敌人' },
  { mode: 'attackMove', label: '途中遇敌攻击', title: '选择后，右键移动会边走边攻击' },
] as const satisfies readonly { mode: GroundMoveMode; label: string; title: string }[];

export type CapacitySelectionGroup3D = 'worker' | 'infantry' | 'vehicle' | 'aircraft';

export interface CapacitySummarySegment3D {
  text: string;
  selectGroup?: CapacitySelectionGroup3D;
}

export function capacitySummarySegments3D(capacity: CapacitySnapshot): CapacitySummarySegment3D[] {
  return [
    { text: `建筑 ${capacity.building.count}/${capacity.building.limit}` },
    { text: `工人 ${capacity.worker.count}/${capacity.worker.limit}`, selectGroup: 'worker' },
    { text: `士兵 ${capacity.infantry.count}/${capacity.infantry.limit}`, selectGroup: 'infantry' },
    { text: `坦克 ${capacity.vehicle.count}/${capacity.vehicle.limit}`, selectGroup: 'vehicle' },
    { text: `飞机 ${capacity.aircraft.count}/${capacity.aircraft.limit}`, selectGroup: 'aircraft' },
  ];
}

export function capacitySummaryText3D(capacity: CapacitySnapshot): string {
  return capacitySummarySegments3D(capacity).map((segment) => segment.text).join(' | ');
}

export function topHudText3D(capacity: CapacitySnapshot): string {
  return capacitySummaryText3D(capacity);
}

export interface RulesAndControlsSection3D {
  title: string;
  items: string[];
}

export function rulesAndControlsSections3D(): RulesAndControlsSection3D[] {
  return [
    {
      title: '胜利条件',
      items: ['消灭敌方全部建筑和战斗单位（不包括工人）。'],
    },
    {
      title: '建造',
      items: ['有工人才能新建建筑。'],
    },
    {
      title: '选择',
      items: ['拖框：多选单位。', '双击单位：选中屏幕内同类型单位。', '点击顶部兵种数量：全选该兵种。'],
    },
    {
      title: '编队',
      items: ['Ctrl+数字：保存当前选中单位。', '数字键：选中对应编队。', '顶部显示编队号、兵种和数量。'],
    },
  ];
}

export function allOwnedUnitIdsInCapacityGroup3D(world: World, localPlayerId: number, group: CapacitySelectionGroup3D): number[] {
  const ids: number[] = [];
  for (const e of world.entities.values()) {
    if (e.owner !== localPlayerId) continue;
    const type = world.rules.units.get(e.typeId);
    if (!type || type.domain === 'building') continue;
    if (group === 'worker') {
      if (e.typeId === 'worker') ids.push(e.id);
      continue;
    }
    if (type.domain === group && e.typeId !== 'worker') ids.push(e.id);
  }
  return ids.sort((a, b) => a - b);
}

export function sameTypeVisibleSelectionIds3D(
  world: World,
  localPlayerId: number,
  clickedId: number,
  points: readonly { id: number; x: number; y: number }[],
  viewport: { left: number; top: number; width: number; height: number },
): number[] {
  const clicked = world.entities.get(clickedId);
  const clickedType = clicked && world.rules.units.get(clicked.typeId);
  if (!clicked || clicked.owner !== localPlayerId || !clickedType || clickedType.domain === 'building') return [];
  const right = viewport.left + viewport.width;
  const bottom = viewport.top + viewport.height;
  const ids: number[] = [];
  for (const point of points) {
    if (point.x < viewport.left || point.x > right || point.y < viewport.top || point.y > bottom) continue;
    const e = world.entities.get(point.id);
    const type = e && world.rules.units.get(e.typeId);
    if (!e || !type || e.owner !== localPlayerId || type.domain === 'building') continue;
    if (e.typeId === clicked.typeId) ids.push(e.id);
  }
  return ids.sort((a, b) => a - b);
}

export interface ControlGroupHudItem3D {
  group: number;
  ids: number[];
  label: string;
}

const CONTROL_GROUP_KIND_ORDER: CapacitySelectionGroup3D[] = ['worker', 'infantry', 'vehicle', 'aircraft'];
const CONTROL_GROUP_KIND_LABEL: Record<CapacitySelectionGroup3D, string> = {
  worker: '工人',
  infantry: '士兵',
  vehicle: '坦克',
  aircraft: '飞机',
};

function controlGroupKindOf(typeId: string, type: UnitType): CapacitySelectionGroup3D | null {
  if (type.domain === 'building') return null;
  if (typeId === 'worker') return 'worker';
  if (type.domain === 'infantry') return 'infantry';
  if (type.domain === 'vehicle') return 'vehicle';
  if (type.domain === 'aircraft') return 'aircraft';
  return null;
}

export function controlGroupIdsForSelection3D(world: World, localPlayerId: number, selectedIds: readonly number[]): number[] {
  const ids: number[] = [];
  for (const id of selectedIds) {
    const e = world.entities.get(id);
    if (!e || e.owner !== localPlayerId) continue;
    const type = world.rules.units.get(e.typeId);
    if (!type || controlGroupKindOf(e.typeId, type) === null) continue;
    ids.push(id);
  }
  return ids.sort((a, b) => a - b);
}

export function controlGroupButtonLabel3D(world: World, group: number, ids: readonly number[]): string {
  const counts: Record<CapacitySelectionGroup3D, number> = {
    worker: 0,
    infantry: 0,
    vehicle: 0,
    aircraft: 0,
  };
  for (const id of ids) {
    const e = world.entities.get(id);
    const type = e && world.rules.units.get(e.typeId);
    if (!e || !type) continue;
    const kind = controlGroupKindOf(e.typeId, type);
    if (kind) counts[kind]++;
  }
  const parts = CONTROL_GROUP_KIND_ORDER
    .filter((kind) => counts[kind] > 0)
    .map((kind) => `${CONTROL_GROUP_KIND_LABEL[kind]} ${counts[kind]}`);
  return parts.length > 0 ? `${group} ${parts.join(' · ')}` : `${group}`;
}

export function controlGroupHudItems3D(world: World, groups: ReadonlyMap<number, readonly number[]>): ControlGroupHudItem3D[] {
  const out: ControlGroupHudItem3D[] = [];
  for (const [group, ids] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const alive = ids.filter((id) => world.entities.has(id)).sort((a, b) => a - b);
    if (alive.length === 0) continue;
    out.push({ group, ids: alive, label: controlGroupButtonLabel3D(world, group, alive) });
  }
  return out;
}

export function matchOutcomeText3D(world: World, localPlayerId: number): 'Defeat' | 'Victory' | null {
  const me = world.players.get(localPlayerId);
  if (!me) return null;
  const others = [...world.players.values()].filter((p) => p.id !== localPlayerId);
  const win = others.length > 0 && others.every((p) => p.defeated);
  if (me.defeated && !win) return 'Defeat';
  if (win) return 'Victory';
  return null;
}

export function bindAudioUnlock(pointerTarget: EventTarget, keyboardTarget: EventTarget | null = typeof window === 'undefined' ? null : window, resume = (): void => audioBus.resume()): void {
  pointerTarget.addEventListener('pointerdown', resume, { once: true });
  keyboardTarget?.addEventListener('keydown', resume, { once: true });
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
.mv3-capacity button { border: 0; background: none; color: inherit; padding: 0; cursor: pointer;
  font: inherit; font-variant-numeric: inherit; }
.mv3-capacity button:hover { color: #fff; text-decoration: underline; text-underline-offset: 3px; }
.mv3-groups { display: flex; gap: 5px; align-items: center; white-space: nowrap; }
.mv3-groups:empty { display: none; }
.mv3-group { height: 24px; max-width: 180px; padding: 0 7px; border: 1px solid rgba(88,167,216,.46);
  border-radius: 5px; background: rgba(23,48,70,.72); color: #dce6ed; cursor: pointer;
  font: inherit; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv3-group:hover { border-color: #8fd4ff; color: #fff; }
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
.mv3-help { position: fixed; left: 12px; bottom: 12px; z-index: 10; display: grid; gap: 8px; justify-items: start; max-width: min(340px, calc(100vw - 24px)); }
.mv3-help-toggle { height: 34px; padding: 0 12px; border: 1px solid rgba(120,150,170,.28); border-radius: 8px;
  background: rgba(8,12,16,.86); color: #d8e0e6; cursor: pointer; font: inherit; font-weight: 700; }
.mv3-help-toggle:hover, .mv3-help-toggle.on { border-color: #58a7d8; color: #fff; background: rgba(23,48,70,.9); }
.mv3-help-panel { width: min(340px, calc(100vw - 24px)); padding: 12px 14px; border: 1px solid rgba(120,150,170,.24);
  border-radius: 10px; background: rgba(8,12,16,.88); box-shadow: 0 16px 45px rgba(0,0,0,.28); color: #cbd6dc; }
.mv3-help-panel h3 { margin: 0 0 8px; font-size: 15px; color: #fff; letter-spacing: 0; }
.mv3-help-section { display: grid; gap: 4px; padding-top: 8px; margin-top: 8px; border-top: 1px solid rgba(120,150,170,.14); }
.mv3-help-section:first-of-type { padding-top: 0; margin-top: 0; border-top: 0; }
.mv3-help-title { color: #72c5ff; font-weight: 800; }
.mv3-help-list { margin: 0; padding-left: 18px; display: grid; gap: 2px; }
.mv3-help-list li { padding-left: 1px; }
.mv3-selbox { position: fixed; z-index: 9; display: none; pointer-events: none;
  border: 1px solid #72f085; background: rgba(114,240,133,.14); }
.mv3-banner { position: fixed; left: 50%; top: 50%; z-index: 30; transform: translate(-50%, -50%);
  min-width: 280px; padding: 24px 30px; border-radius: 10px; text-align: center;
  background: rgba(7, 10, 13, .9); border: 1px solid rgba(180, 205, 220, .28);
  box-shadow: 0 18px 60px rgba(0,0,0,.36); font-size: 42px; font-weight: 800; letter-spacing: 0; }
.mv3-banner.defeat { color: #ff6363; }
.mv3-banner.victory { color: #68e887; }
.mv3-banner small { display: block; margin-top: 8px; color: #aeb9c2; font-size: 14px; font-weight: 500; }
`;

export class MatchView3D {
  private renderer!: ThreeWorldRenderer;
  private camera!: ThreeCameraController;
  private capacityEl!: HTMLElement;
  private groupsEl!: HTMLElement;
  private selBox!: HTMLElement;
  private tabsEl!: HTMLElement;
  private buildEl!: HTMLElement;
  private producerEl!: HTMLElement;
  private lastStepAt = 0;
  private activeCategory: ProdCategory = 'building';
  private placingType: UnitType | null = null;
  private readonly selected = new Set<number>();
  private readonly nearbyHpIds = new Set<number>();
  private readonly localCommands: Command[] = [];
  private readonly controlGroups = new Map<number, number[]>();
  private readonly buildButtons: { button: HTMLButtonElement; state: HTMLElement; type: UnitType }[] = [];
  private readonly announcedCompletedBuildings = new Set<number>();
  private producerPanelKey = '';
  private capacityHudKey = '';
  private controlGroupsHudKey = '';
  private groundMoveMode: GroundMoveMode = DEFAULT_GROUND_MOVE_MODE_3D;
  private over = false;

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
    this.renderer.render(this.camera.camera, alpha, this.selected, this.nearbyHpIds);
  }

  dispose(): void {
    audioBus.stopBattleAmbience();
    this.renderer.dispose();
  }

  private buildDom(): void {
    const groundModeButtons = GROUND_MOVE_MODE_BUTTONS_3D.map(
      (button) =>
        `<button type="button" data-ground-mode="${button.mode}" title="${button.title}">${button.label}</button>`,
    ).join('');
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="mv3-top">
        <span>3D RTS Preview</span>
        <span id="mv3-capacity" class="mv3-capacity"></span>
        <span id="mv3-selected"></span>
        <span id="mv3-groups" class="mv3-groups"></span>
        <button id="mv3-mute" type="button" style="background:none;border:none;color:#9aa7b0;cursor:pointer;font-size:15px">Sound</button>
        <a href="#">Exit</a>
      </div>
      <div class="mv3-orders" id="mv3-orders">
        ${groundModeButtons}
      </div>
      <div class="mv3-build">
        <div class="mv3-tabs" id="mv3-tabs"></div>
        <div class="mv3-prod-list" id="mv3-prod-list"></div>
        <div class="mv3-producer" id="mv3-producer"></div>
      </div>
      <div class="mv3-selbox" id="mv3-selbox"></div>
      <div class="mv3-help" id="mv3-help">
        <button class="mv3-help-toggle" id="mv3-help-toggle" type="button" aria-expanded="false" aria-controls="mv3-help-panel">规则和控制</button>
        <div class="mv3-help-panel" id="mv3-help-panel" hidden></div>
      </div>`,
    );
    this.capacityEl = this.root.querySelector('#mv3-capacity')!;
    this.groupsEl = this.root.querySelector('#mv3-groups')!;
    this.selBox = this.root.querySelector('#mv3-selbox')!;
    this.tabsEl = this.root.querySelector('#mv3-tabs')!;
    this.buildEl = this.root.querySelector('#mv3-prod-list')!;
    this.producerEl = this.root.querySelector('#mv3-producer')!;
    this.capacityEl.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-capacity-group]');
      const group = button?.dataset.capacityGroup as CapacitySelectionGroup3D | undefined;
      if (group === 'worker' || group === 'infantry' || group === 'vehicle' || group === 'aircraft') this.selectAllCapacityGroup(group);
    });
    this.groupsEl.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-control-group]');
      const group = Number(button?.dataset.controlGroup);
      if (Number.isInteger(group)) this.recallControlGroup(group);
    });
    this.buildProductionTabs();
    this.rebuildProductionPanel();
    this.buildRulesAndControlsPanel();
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
    const help = this.root.querySelector('#mv3-help');
    help?.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.querySelector('#mv3-help-toggle')?.addEventListener('click', () => this.toggleRulesAndControlsPanel());
  }

  private buildRulesAndControlsPanel(): void {
    const panel = this.root.querySelector('#mv3-help-panel');
    if (!panel) return;
    const heading = document.createElement('h3');
    heading.textContent = '规则和控制';
    const sections = rulesAndControlsSections3D().map((section) => {
      const block = document.createElement('section');
      block.className = 'mv3-help-section';
      const title = document.createElement('div');
      title.className = 'mv3-help-title';
      title.textContent = section.title;
      const list = document.createElement('ul');
      list.className = 'mv3-help-list';
      for (const item of section.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      block.append(title, list);
      return block;
    });
    panel.replaceChildren(heading, ...sections);
  }

  private toggleRulesAndControlsPanel(): void {
    const panel = this.root.querySelector<HTMLElement>('#mv3-help-panel');
    const button = this.root.querySelector<HTMLButtonElement>('#mv3-help-toggle');
    if (!panel || !button) return;
    const open = panel.hidden;
    panel.hidden = !open;
    button.classList.toggle('on', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
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
    this.updateCapacityHud();
    this.updateControlGroupsHud();
    const sel = this.root.querySelector('#mv3-selected');
    if (sel) sel.textContent = this.selected.size > 0 ? `Selected ${this.selected.size}` : '';
    this.refreshBuildPanel();
    this.refreshProducerPanel();
    this.updateProductionAudio();
    this.checkVictory();
  }

  private updateCapacityHud(): void {
    const segments = capacitySummarySegments3D(this.world.capacityFor(this.localPlayerId));
    const key = segments.map((segment) => `${segment.selectGroup ?? '-'}:${segment.text}`).join('|');
    if (key === this.capacityHudKey) return;
    this.capacityHudKey = key;
    const nodes: Node[] = [];
    segments.forEach((segment, index) => {
      if (index > 0) nodes.push(document.createTextNode(' | '));
      if (!segment.selectGroup) {
        const span = document.createElement('span');
        span.textContent = segment.text;
        nodes.push(span);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.capacityGroup = segment.selectGroup;
      button.textContent = segment.text;
      nodes.push(button);
    });
    this.capacityEl.replaceChildren(...nodes);
  }

  private updateControlGroupsHud(): void {
    for (const [group, stored] of this.controlGroups) {
      const alive = stored.filter((id) => this.world.entities.has(id)).sort((a, b) => a - b);
      if (alive.length === 0) this.controlGroups.delete(group);
      else if (alive.length !== stored.length) this.controlGroups.set(group, alive);
    }
    const items = controlGroupHudItems3D(this.world, this.controlGroups);
    const key = items.map((item) => `${item.group}:${item.ids.join(',')}:${item.label}`).join('|');
    if (key === this.controlGroupsHudKey) return;
    this.controlGroupsHudKey = key;
    const nodes = items.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mv3-group';
      button.dataset.controlGroup = String(item.group);
      button.textContent = item.label;
      button.title = `Recall group ${item.group}`;
      return button;
    });
    this.groupsEl.replaceChildren(...nodes);
  }

  private checkVictory(): void {
    if (this.over) return;
    const outcome = matchOutcomeText3D(this.world, this.localPlayerId);
    if (!outcome) return;
    this.over = true;
    const banner = document.createElement('div');
    banner.className = `mv3-banner ${outcome === 'Defeat' ? 'defeat' : 'victory'}`;
    const seconds = Math.floor(this.world.tick / 15);
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    banner.innerHTML = `${outcome}<small>Time ${time}</small>`;
    this.root.appendChild(banner);
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
    bindAudioUnlock(this.root);
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
      this.updateNearbyHpTarget(e.clientX, e.clientY);
      this.updateBuildPreview(e.clientX, e.clientY);
      if (selectDrag) this.drawSelectionBox(selectDrag.x, selectDrag.y, e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerleave', () => {
      this.nearbyHpIds.clear();
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
    canvas.addEventListener('dblclick', (e: MouseEvent) => {
      if (e.button !== 0 || this.placingType) return;
      e.preventDefault();
      this.selectVisibleSameTypeAt(e.clientX, e.clientY);
    });
    canvas.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.camera.zoomAt(e.deltaY);
    }, { passive: false });
    window.addEventListener('resize', () => {
      this.camera.applyResize();
      this.renderer.resize(this.camera.camera);
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const group = this.controlGroupNumberFromKey(e.key);
      if (group !== null) {
        if (e.ctrlKey || e.metaKey) this.assignControlGroup(group);
        else this.recallControlGroup(group);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') this.cancelPlacement();
    });
  }

  private controlGroupNumberFromKey(key: string): number | null {
    return key >= '1' && key <= '9' ? Number(key) : null;
  }

  private updateNearbyHpTarget(clientX: number, clientY: number): void {
    this.nearbyHpIds.clear();
    const directId = this.renderer.pickEntity(this.camera.camera, clientX, clientY);
    const nearId =
      directId ??
      nearestIdWithinRadius(
        { x: clientX, y: clientY },
        this.renderer.entityScreenPoints(this.camera.camera),
        58,
      );
    if (nearId !== null) this.nearbyHpIds.add(nearId);
  }

  private finishSelection(startX: number, startY: number, endX: number, endY: number): void {
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    if (w < 6 && h < 6) {
      const id =
        this.renderer.pickOwnUnit(this.camera.camera, endX, endY) ??
        nearestIdWithinRadius({ x: endX, y: endY }, this.renderer.ownUnitScreenPoints(this.camera.camera), 54);
      this.replaceSelection(id !== null ? [id] : []);
      return;
    }
    const ids = idsInScreenRect(
      { x0: startX, y0: startY, x1: endX, y1: endY },
      this.renderer.ownUnitScreenPoints(this.camera.camera),
    );
    this.replaceSelection(ids);
  }

  private selectVisibleSameTypeAt(clientX: number, clientY: number): void {
    const clickedId =
      this.renderer.pickOwnUnit(this.camera.camera, clientX, clientY) ??
      nearestIdWithinRadius({ x: clientX, y: clientY }, this.renderer.ownUnitScreenPoints(this.camera.camera), 54);
    if (clickedId === null) return;
    const viewport = this.renderer.renderer.domElement.getBoundingClientRect();
    const ids = sameTypeVisibleSelectionIds3D(
      this.world,
      this.localPlayerId,
      clickedId,
      this.renderer.ownUnitScreenPoints(this.camera.camera),
      viewport,
    );
    if (ids.length > 0) this.replaceSelection(ids);
  }

  private selectAllCapacityGroup(group: CapacitySelectionGroup3D): void {
    this.cancelPlacement();
    this.replaceSelection(allOwnedUnitIdsInCapacityGroup3D(this.world, this.localPlayerId, group));
  }

  private assignControlGroup(group: number): void {
    const ids = controlGroupIdsForSelection3D(this.world, this.localPlayerId, [...this.selected]);
    if (ids.length === 0) return;
    this.controlGroups.set(group, ids);
    this.controlGroupsHudKey = '';
    audioBus.play('select');
  }

  private recallControlGroup(group: number): void {
    const ids = (this.controlGroups.get(group) ?? []).filter((id) => this.world.entities.has(id)).sort((a, b) => a - b);
    if (ids.length === 0) {
      this.controlGroups.delete(group);
      this.controlGroupsHudKey = '';
      return;
    }
    this.controlGroups.set(group, ids);
    this.replaceSelection(ids);
    this.controlGroupsHudKey = '';
  }

  private replaceSelection(ids: readonly number[]): void {
    this.selected.clear();
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
