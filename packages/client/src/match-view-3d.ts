import { World, categoryOf, type CapacitySnapshot, type Command, type Entity, type ProdCategory, type UnitType } from '@ra2web/game';
import { Vector3 } from 'three';
import { audioBus } from './audio-bus';
import { bgm } from './bgm';
import { ThreeCameraController } from './three-camera';
import { cellToWorld3D, leptonToWorld3D, worldToCell3D, THREE_CELL_SIZE } from './three-coords';
import { playerColorForOwner } from './player-colors';
import { uiText } from './i18n';
import { productionButtonState } from './three-build-ui';
import { rightClickCommand, type GroundMoveMode } from './three-orders';
import { idsInScreenRect, nearestIdWithinRadius } from './three-selection';
import { ThreeWorldRenderer } from './three-world-renderer';

export function initialCameraFocus3D(mapW: number, mapH: number): { x: number; z: number } {
  const center = cellToWorld3D((mapW - 1) / 2, (mapH - 1) / 2);
  return { x: center.x, z: center.z };
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export function clampCellToMap3D(
  cell: { x: number; y: number },
  mapW: number,
  mapH: number,
): { x: number; y: number } | null {
  if (mapW <= 0 || mapH <= 0) return null;
  return {
    x: clampInt(cell.x, 0, mapW - 1),
    y: clampInt(cell.y, 0, mapH - 1),
  };
}

export function placementCellForClick3D(
  cell: { x: number; y: number },
  type: { building?: { footprintW: number; footprintH: number } | null },
  mapW: number,
  mapH: number,
): { x: number; y: number } | null {
  const b = type.building;
  if (!b) return clampCellToMap3D(cell, mapW, mapH);
  if (b.footprintW > mapW || b.footprintH > mapH) return null;
  return {
    x: clampInt(cell.x, 0, mapW - b.footprintW),
    y: clampInt(cell.y, 0, mapH - b.footprintH),
  };
}

export const PRODUCTION_CATEGORIES_3D = ['building'] as const satisfies readonly ProdCategory[];
export const BUILD_PANEL_PLACEMENT_CLASS_3D = 'mv3-build-bottom-bar';
export const SUPPORTED_BUILDING_BUTTON_IDS_3D = ['barracks', 'warfactory', 'airbase', 'patriot'] as const;

export function supportedBuildButtonTypes3D(types: readonly UnitType[], localSide?: string): UnitType[] {
  const byId = new Map(types.map((type) => [type.id, type]));
  return SUPPORTED_BUILDING_BUTTON_IDS_3D.map((id) => byId.get(id)).filter((type): type is UnitType => {
    if (!type || type.domain !== 'building' || type.builtBy === '') return false;
    return !localSide || type.side === localSide;
  });
}

export interface BuildButtonMeta3D {
  icon: string;
  label: string;
  hint: string;
}

export function buildButtonMeta3D(type: Pick<UnitType, 'id' | 'name'>): BuildButtonMeta3D {
  const text = uiText().buildMeta;
  const known = text[type.id as keyof Omit<typeof text, 'fallback'>];
  return known ?? { icon: text.fallback.icon, label: type.name, hint: text.fallback.hint };
}
export interface ProductionClickPlan3D {
  commands: Command[];
  placingTypeId: string | null;
}

export function productionClickPlan3D(
  owner: number,
  type: UnitType,
  queue: ReturnType<World['queueFor']>,
  placingTypeId: string | null,
): ProductionClickPlan3D {
  if (placingTypeId === type.id) return { commands: [], placingTypeId: null };
  const category = categoryOf(type);
  if (type.domain !== 'building') {
    return { commands: [{ kind: 'produce', owner, typeId: type.id }], placingTypeId };
  }
  if (queue?.readyToPlace && queue.items[0] === type.id) {
    return { commands: [], placingTypeId: type.id };
  }
  const commands: Command[] = [];
  for (let i = 0; i < (queue?.items.length ?? 0); i++) {
    commands.push({ kind: 'cancel', owner, category });
  }
  commands.push({ kind: 'produce', owner, typeId: type.id });
  return { commands, placingTypeId: type.id };
}

export const DEFAULT_GROUND_MOVE_MODE_3D: GroundMoveMode = 'move';

export function groundMoveModeButtons3D(): { mode: GroundMoveMode; label: string; title: string }[] {
  const text = uiText().groundMoveModes;
  return [
    { mode: 'move', label: text.move.label, title: text.move.title },
    { mode: 'attackMove', label: text.attackMove.label, title: text.attackMove.title },
  ];
}

export const GROUND_MOVE_MODE_BUTTONS_3D = groundMoveModeButtons3D();

export type CapacitySelectionGroup3D = 'worker' | 'infantry' | 'vehicle' | 'aircraft';

export const CONTROL_GROUPS_HUD_LABEL_3D = '编队';
export const ATTACK_MODE_HUD_LABEL_3D = '攻击模式';
export const CAPACITY_SELECT_TOOLTIP_3D = '点击可全选兵种';
export const SELECTED_STATUS_CLASS_3D = 'mv3-selected-status';

function controlGroupsHudLabel3D(): string {
  return uiText().hud.controlGroups;
}

function attackModeHudLabel3D(): string {
  return uiText().hud.attackMode;
}

function capacitySelectTooltip3D(): string {
  return uiText().hud.capacitySelectTooltip;
}
export interface CapacitySummarySegment3D {
  text: string;
  selectGroup?: CapacitySelectionGroup3D;
}

export function capacitySummarySegments3D(capacity: CapacitySnapshot): CapacitySummarySegment3D[] {
  const labels = uiText().capacity;
  return [
    { text: `${labels.building} ${capacity.building.count}/${capacity.building.limit}` },
    { text: `${labels.worker} ${capacity.worker.count}/${capacity.worker.limit}`, selectGroup: 'worker' },
    { text: `${labels.infantry} ${capacity.infantry.count}/${capacity.infantry.limit}`, selectGroup: 'infantry' },
    { text: `${labels.vehicle} ${capacity.vehicle.count}/${capacity.vehicle.limit}`, selectGroup: 'vehicle' },
    { text: `${labels.aircraft} ${capacity.aircraft.count}/${capacity.aircraft.limit}`, selectGroup: 'aircraft' },
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
  return uiText().rules.sections.map((section) => ({ title: section.title, items: [...section.items] }));
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

export function clickSelectionIds3D(
  currentIds: Iterable<number>,
  clickedId: number | null,
  additive: boolean,
): number[] {
  if (!additive) return clickedId === null ? [] : [clickedId];
  const ids = new Set(currentIds);
  if (clickedId !== null) ids.add(clickedId);
  return [...ids].sort((a, b) => a - b);
}

export interface ControlGroupHudItem3D {
  group: number;
  ids: number[];
  label: string;
}

const CONTROL_GROUP_KIND_ORDER: CapacitySelectionGroup3D[] = ['worker', 'infantry', 'vehicle', 'aircraft'];

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
    .map((kind) => `${uiText().capacity[kind]} ${counts[kind]}`);
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
  --hud-bg: rgba(9, 15, 18, .84);
  --hud-bg-strong: rgba(10, 18, 23, .94);
  --hud-edge: rgba(146, 174, 188, .24);
  --hud-edge-strong: rgba(99, 185, 238, .72);
  --hud-text: #d9e4ea;
  --hud-muted: #91a2ad;
  --hud-accent: #68c8ff;
  --hud-ready: #65e08b;
  --hud-warn: #f3d35f;
  font: 13px/1.4 system-ui, 'PingFang SC', sans-serif; color: var(--hud-text); touch-action: none; }
.mv3-canvas { display: block; width: 100vw; height: 100vh; }
.mv3-top { position: fixed; left: 12px; top: 10px; z-index: 10; display: flex; gap: 8px; align-items: flex-start;
  max-width: calc(100vw - 300px); }
.mv3-hud-panel { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 6px;
  background: var(--hud-bg); border: 1px solid var(--hud-edge); border-radius: 9px;
  box-shadow: 0 12px 35px rgba(0,0,0,.24); backdrop-filter: blur(6px); }
.mv3-panel-label { min-height: 28px; display: inline-flex; align-items: center; padding: 0 8px 0 2px;
  border-right: 1px solid rgba(146,174,188,.18); color: #8fd4ff; font-size: 12px; font-weight: 900; white-space: nowrap; }
.mv3-capacity { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; color: #b9c9d2; font-variant-numeric: tabular-nums; }
.mv3-capacity-chip { height: 30px; display: inline-flex; align-items: center; padding: 0 11px; border-radius: 6px;
  border: 1px solid rgba(146,174,188,.18); background: rgba(8,14,18,.68); color: var(--hud-text); font: inherit;
  font-variant-numeric: inherit; white-space: nowrap; appearance: none; }
.mv3-capacity-chip { cursor: default; }
.mv3-capacity-chip.is-clickable { cursor: pointer; }
.mv3-capacity-chip.is-clickable:hover { border-color: rgba(104,200,255,.62); background: rgba(20,42,55,.8); color: #fff; }
.mv3-selected-status { min-height: 34px; display: inline-flex; align-items: center; padding: 0 12px; border-radius: 999px;
  border: 1px solid rgba(243,211,95,.42); background: rgba(45,37,14,.66); color: #ffe39a; font-weight: 850;
  font-variant-numeric: tabular-nums; white-space: nowrap; box-shadow: inset 0 0 0 1px rgba(255,226,120,.08); }
.mv3-selected-status:empty { display: none; }
.mv3-groups-panel { position: fixed; left: 12px; top: 60px; z-index: 10; display: inline-flex; align-items: center; gap: 7px; min-height: 36px; padding: 6px;
  background: var(--hud-bg); border: 1px solid var(--hud-edge); border-radius: 9px; box-shadow: 0 12px 35px rgba(0,0,0,.2); backdrop-filter: blur(6px); }
.mv3-groups { display: flex; gap: 6px; align-items: center; min-width: 42px; white-space: nowrap; }
.mv3-groups:empty::after { content: attr(data-empty); color: var(--hud-muted); font-size: 12px; }
.mv3-group { height: 30px; max-width: 180px; padding: 0 8px; border: 1px solid rgba(88,167,216,.46);
  border-radius: 6px; background: rgba(23,48,70,.72); color: #dce6ed; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  font: inherit; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mv3-group:hover { border-color: #8fd4ff; color: #fff; }
.mv3-group-num { min-width: 20px; height: 22px; display: inline-grid; place-items: center; border-radius: 5px;
  background: rgba(104,200,255,.18); border: 1px solid rgba(104,200,255,.36); color: #bdeaff; font-weight: 900; }
.mv3-group-summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: #e3edf3; font-weight: 750; }
.mv3-group-summary .mv3-group-count { margin-left: 4px; padding: 1px 6px; border-radius: 999px;
  background: rgba(243,211,95,.18); border: 1px solid rgba(243,211,95,.28); color: #ffe39a; font-weight: 900; }
.mv3-orders { position: fixed; left: 12px; top: 110px; z-index: 10; display: flex; gap: 6px;
  align-items: center;
  padding: 6px; background: var(--hud-bg); border: 1px solid var(--hud-edge); border-radius: 9px; box-shadow: 0 12px 35px rgba(0,0,0,.18); }
.mv3-orders .mv3-panel-label { min-height: 34px; padding-right: 8px; }
.mv3-orders button { min-height: 34px; padding: 0 11px; border: 1px solid rgba(125,150,165,.22); border-radius: 7px;
  background: #0b141a; color: #b3c0c8; cursor: pointer; font-size: 13px; font-weight: 750; }
.mv3-orders button.on { color: #fff; border-color: var(--hud-edge-strong); background: linear-gradient(#1a4258, #132d3d); box-shadow: inset 0 0 0 1px rgba(104,200,255,.18); }
.mv3-build { position: fixed; left: 50%; right: auto; bottom: 12px; top: auto; transform: translateX(-50%); z-index: 10;
  width: fit-content; max-width: calc(100vw - 390px); overflow: visible;
  display: grid; grid-template-columns: 1fr; align-items: center; gap: 8px;
  padding: 8px; background: var(--hud-bg-strong); border: 1px solid var(--hud-edge); border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0,0,0,.28); backdrop-filter: blur(6px); }
.mv3-build::-webkit-scrollbar { width: 8px; }
.mv3-build::-webkit-scrollbar-thumb { background: rgba(146,174,188,.28); border-radius: 999px; }
.mv3-build-head { display: none; }
.mv3-build-title { display: inline-flex; align-items: center; gap: 8px; color: #f0f7fb; font-weight: 900; letter-spacing: 0; }
.mv3-build-title-mark { width: 22px; height: 22px; display: inline-grid; place-items: center; border-radius: 5px;
  background: rgba(104,200,255,.14); border: 1px solid rgba(104,200,255,.34); color: var(--hud-accent); font-size: 13px; }
.mv3-build-subtitle { display: none; }
.mv3-tabs { display: none; grid-template-columns: 1fr; gap: 4px; }
.mv3-tabs button { height: 30px; padding: 0; border: 1px solid rgba(125,150,165,.2); border-radius: 6px;
  background: #0d151c; color: #8ea0aa; cursor: pointer; font-size: 12px; font-weight: 800; }
.mv3-tabs button.on { color: #fff; border-color: var(--hud-edge-strong); background: #173046; }
.mv3-prod-list { display: flex; align-items: stretch; gap: 8px; min-width: 0; }
.mv3-prod-list button { position: relative; min-width: 166px; min-height: 50px; display: grid; grid-template-columns: 32px max-content; align-items: center; gap: 8px;
  padding: 7px 12px 7px 8px; overflow: visible; border: 1px solid rgba(125,150,165,.24); border-radius: 8px; cursor: pointer;
  background: linear-gradient(180deg, rgba(31,43,50,.96), rgba(11,18,23,.98)); color: #dce6ed; text-align: left; }
.mv3-prod-list button:hover:not(:disabled) { border-color: rgba(104,200,255,.62); background: linear-gradient(180deg, rgba(36,56,67,.98), rgba(13,25,32,.98)); }
.mv3-prod-list button:disabled { cursor: default; color: #6f7a82; background: #0b1116; border-color: rgba(125,150,165,.12); }
.mv3-prod-list button.ready { border-color: var(--hud-ready); box-shadow: inset 0 0 0 1px rgba(88,212,120,.25); }
.mv3-prod-list button.placing { border-color: var(--hud-warn); color: #fff2a8; box-shadow: inset 0 0 0 1px rgba(243,211,95,.18); }
.mv3-prod-icon { width: 30px; height: 30px; display: inline-grid; place-items: center; border-radius: 7px;
  background: linear-gradient(180deg, rgba(104,200,255,.2), rgba(104,200,255,.08)); border: 1px solid rgba(104,200,255,.24);
  color: #dff5ff; font-size: 15px; font-weight: 900; }
.mv3-prod-main { min-width: 0; display: grid; gap: 2px; }
.mv3-build .name { overflow: visible; text-overflow: clip; white-space: nowrap; font-weight: 850; color: #f0f7fb; }
.mv3-build .hint { display: none; }
.mv3-build .state { display: none; }
.mv3-prod-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.06); }
.mv3-prod-progress span { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, var(--hud-accent), var(--hud-ready)); }
.mv3-producer { display: none; gap: 6px; padding-top: 6px; border-top: 1px solid rgba(125,150,165,.16); }
.mv3-producer.on { display: grid; }
.mv3-producer-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 8px; color: #b8c5cc; }
.mv3-producer button { height: 30px; border-radius: 5px; border: 1px solid rgba(125,150,165,.25);
  background: #0d151c; color: #dce6ed; }
.mv3-producer button { cursor: pointer; padding: 0 9px; }
.mv3-producer-units { display: flex; gap: 6px; flex-wrap: wrap; }
.mv3-producer-unit { position: relative; min-width: 96px; min-height: 44px; display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 6px;
  padding: 0 8px; border: 1px solid rgba(125,150,165,.25); border-radius: 6px; background: #0d151c; color: #dce6ed; cursor: pointer; font: inherit; }
.mv3-producer-unit:hover:not(:disabled) { border-color: rgba(104,200,255,.62); background: linear-gradient(180deg, rgba(36,56,67,.98), rgba(13,25,32,.98)); }
.mv3-producer-unit:disabled { cursor: default; color: #6f7a82; background: #0b1116; border-color: rgba(125,150,165,.12); }
.mv3-producer-unit.active { border-color: var(--hud-accent); box-shadow: inset 0 0 0 1px rgba(104,200,255,.25); color: #fff; }
.mv3-producer-unit .mv3-prod-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.06); }
.mv3-producer-unit .mv3-prod-progress span { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, var(--hud-accent), var(--hud-ready)); }
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
.mv3-minimap { position: fixed; right: 12px; bottom: 12px; z-index: 10; padding: 6px;
  background: var(--hud-bg-strong); border: 1px solid var(--hud-edge); border-radius: 10px;
  box-shadow: 0 16px 40px rgba(0,0,0,.28); backdrop-filter: blur(6px); }
.mv3-minimap canvas { display: block; max-width: 200px; max-height: 200px; border-radius: 6px; cursor: crosshair; }
@media (max-width: 980px) {
  .mv3-top { right: 12px; max-width: none; flex-wrap: wrap; }
  .mv3-groups-panel { top: auto; bottom: 108px; max-width: calc(100vw - 284px); }
  .mv3-groups { overflow: hidden; }
  .mv3-orders { top: auto; bottom: 58px; }
  .mv3-build { left: 12px; right: 12px; bottom: 10px; transform: none; width: auto; max-width: none; grid-template-columns: 1fr; }
  .mv3-build-head { display: none; }
  .mv3-prod-list { overflow-x: auto; padding-bottom: 2px; }
  .mv3-prod-list button { min-width: 154px; width: 154px; }
  .mv3-minimap { right: 8px; bottom: 72px; padding: 4px; }
  .mv3-minimap canvas { max-width: 128px; max-height: 128px; }
}
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
  private readonly producerUnitFills = new Map<string, HTMLElement>();
  private capacityHudKey = '';
  private controlGroupsHudKey = '';
  private groundMoveMode: GroundMoveMode = DEFAULT_GROUND_MOVE_MODE_3D;
  private over = false;
  private minimapCanvas!: HTMLCanvasElement;
  private minimapCtx!: CanvasRenderingContext2D;
  private minimapScale = 2;
  private minimapTerrainCache!: HTMLCanvasElement;

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
    this.renderMinimap();
  }

  dispose(): void {
    audioBus.stopBattleAmbience();
    this.renderer.dispose();
  }

  private buildDom(): void {
    const text = uiText();
    const groundModeButtons = groundMoveModeButtons3D().map(
      (button) =>
        `<button type="button" data-ground-mode="${button.mode}" title="${button.title}">${button.label}</button>`,
    ).join('');
    this.root.insertAdjacentHTML(
      'beforeend',
      `<div class="mv3-top">
        <div class="mv3-hud-panel" aria-label="${text.hud.combatUnits}">
          <span class="mv3-panel-label">${text.hud.combatUnits}</span>
          <span id="mv3-capacity" class="mv3-capacity"></span>
        </div>
        <span id="mv3-selected" class="${SELECTED_STATUS_CLASS_3D}"></span>
      </div>
      <div class="mv3-groups-panel" aria-label="${controlGroupsHudLabel3D()}">
        <span class="mv3-panel-label">${controlGroupsHudLabel3D()}</span>
        <span id="mv3-groups" class="mv3-groups" data-empty="${text.hud.noGroups}"></span>
      </div>
      <div class="mv3-orders" id="mv3-orders" aria-label="${attackModeHudLabel3D()}">
        <span class="mv3-panel-label">${attackModeHudLabel3D()}</span>
        ${groundModeButtons}
      </div>
      <div class="mv3-build ${BUILD_PANEL_PLACEMENT_CLASS_3D}">
        <div class="mv3-tabs" id="mv3-tabs"></div>
        <div class="mv3-prod-list" id="mv3-prod-list"></div>
        <div class="mv3-producer" id="mv3-producer"></div>
      </div>
      <div class="mv3-selbox" id="mv3-selbox"></div>
      <div class="mv3-help" id="mv3-help">
        <button class="mv3-help-toggle" id="mv3-help-toggle" type="button" aria-expanded="false" aria-controls="mv3-help-panel">${text.hud.helpButton}</button>
        <div class="mv3-help-panel" id="mv3-help-panel" hidden></div>
      </div>
      <div class="mv3-minimap" id="mv3-minimap" aria-label="小地图">
        <canvas id="mv3-minimap-canvas"></canvas>
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
    const help = this.root.querySelector('#mv3-help');
    help?.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.querySelector('#mv3-help-toggle')?.addEventListener('click', () => this.toggleRulesAndControlsPanel());
    this.setupMinimap();
  }
  private buildRulesAndControlsPanel(): void {
    const panel = this.root.querySelector('#mv3-help-panel');
    if (!panel) return;
    const heading = document.createElement('h3');
    heading.textContent = uiText().hud.helpTitle;
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
    if (sel) sel.textContent = this.selected.size > 0 ? uiText().hud.selected(this.selected.size) : '';
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
    segments.forEach((segment) => {
      if (!segment.selectGroup) {
        const span = document.createElement('span');
        span.className = 'mv3-capacity-chip';
        span.textContent = segment.text;
        nodes.push(span);
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mv3-capacity-chip is-clickable';
      button.dataset.capacityGroup = segment.selectGroup;
      button.title = capacitySelectTooltip3D();
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
      const num = document.createElement('span');
      num.className = 'mv3-group-num';
      num.textContent = String(item.group);
      const summary = document.createElement('span');
      summary.className = 'mv3-group-summary';
      summary.innerHTML = this.formatControlGroupSummary(item.label, item.group);
      button.replaceChildren(num, summary);
      button.title = uiText().hud.recallGroup(item.group);
      return button;
    });
    this.groupsEl.replaceChildren(...nodes);
  }

  private formatControlGroupSummary(label: string, group: number): string {
    const raw = label.startsWith(`${group} `) ? label.slice(String(group).length + 1) : label;
    return raw.replace(/ (\d+)(?= ·|$)/g, ' <span class="mv3-group-count">$1</span>');
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
    const text = uiText().hud;
    banner.innerHTML = `${text.outcome[outcome]}<small>${text.time(time)}</small>`;
    this.root.appendChild(banner);
  }

  private buildProductionTabs(): void {
    const labels: Record<ProdCategory, string> = uiText().hud.tabs;
    this.tabsEl.hidden = PRODUCTION_CATEGORIES_3D.length <= 1;
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
    const units =
      this.activeCategory === 'building'
        ? supportedBuildButtonTypes3D([...this.world.rules.units.values()], localSide)
        : [];
    for (const type of units) {
      const meta = buildButtonMeta3D(type);
      const button = document.createElement('button');
      button.type = 'button';
      button.title = `${meta.label} - ${meta.hint}`;
      const icon = document.createElement('span');
      icon.className = 'mv3-prod-icon';
      icon.textContent = meta.icon;
      const main = document.createElement('span');
      main.className = 'mv3-prod-main';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = meta.label;
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = meta.hint;
      main.append(name, hint);
      const state = document.createElement('span');
      state.className = 'state';
      const progress = document.createElement('span');
      progress.className = 'mv3-prod-progress';
      progress.appendChild(document.createElement('span'));
      button.append(icon, main, state, progress);
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
      const progressFill = entry.button.querySelector<HTMLElement>('.mv3-prod-progress span');
      if (progressFill) {
        const pct = state.progressText.endsWith('%')
          ? Number(state.progressText.slice(0, -1))
          : state.ready || state.activePlace
            ? 100
            : 0;
        progressFill.style.width = `${Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))}%`;
      }
    }
  }

  private refreshTabs(): void {
    [...this.tabsEl.children].forEach((child, index) => {
      child.classList.toggle('on', PRODUCTION_CATEGORIES_3D[index] === this.activeCategory);
    });
  }

  private onProductionButton(type: UnitType): void {
    const q = this.world.queueFor(this.localPlayerId, categoryOf(type));
    const plan = productionClickPlan3D(this.localPlayerId, type, q, this.placingType?.id ?? null);
    if (plan.placingTypeId === null && this.placingType?.id === type.id) {
      this.cancelPlacement();
      return;
    }
    this.localCommands.push(...plan.commands);
    if (type.domain === 'building') {
      this.placingType = plan.placingTypeId === type.id ? type : null;
      this.selected.clear();
      audioBus.play('build');
      return;
    }
    audioBus.play('select');
  }

  private bindCameraInput(): void {
    const canvas = this.renderer.renderer.domElement;
    bindAudioUnlock(this.root);
    let panDrag: { x: number; y: number } | null = null;
    let selectDrag: { x: number; y: number; additive: boolean } | null = null;
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
        selectDrag = { x: e.clientX, y: e.clientY, additive: e.ctrlKey };
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
      if (selectDrag) this.finishSelection(selectDrag.x, selectDrag.y, e.clientX, e.clientY, selectDrag.additive);
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

  private finishSelection(startX: number, startY: number, endX: number, endY: number, additive: boolean): void {
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    if (w < 6 && h < 6) {
      const id =
        this.renderer.pickOwnUnit(this.camera.camera, endX, endY) ??
        nearestIdWithinRadius({ x: endX, y: endY }, this.renderer.ownUnitScreenPoints(this.camera.camera), 54);
      this.replaceSelection(clickSelectionIds3D(this.selected, id, additive));
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
    const cell = rawCell ? clampCellToMap3D(rawCell, this.mapW, this.mapH) : null;
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
      if ((cmd.kind === 'attack' || (cmd.kind === 'attackMove' && target && target.owner !== this.localPlayerId)) && target) this.spawnTargetCommandIndicator(target);
      else if (cmd.kind === 'attackGround' && cell) this.spawnGroundAttackCommandIndicator(cell);
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

  private spawnGroundAttackCommandIndicator(cell: { x: number; y: number }): void {
    const pos = cellToWorld3D(cell.x, cell.y);
    this.renderer.spawnCommandIndicator('attack', pos.x, pos.z);
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
    const cell = placementCellForClick3D(worldToCell3D(hit.x, hit.z), this.placingType, this.mapW, this.mapH);
    if (!cell || !this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y)) {
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
    const cell = placementCellForClick3D(worldToCell3D(hit.x, hit.z), this.placingType, this.mapW, this.mapH);
    this.renderer.setBuildPreview(
      this.placingType,
      cell,
      !!cell && this.world.canPlace(this.localPlayerId, this.placingType, cell.x, cell.y),
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
      this.producerUnitFills.clear();
      return;
    }

    const options = this.producerOptionsFor(selected.entity);
    const activeType = this.world.rules.units.get(producer.paidTypeId ?? producer.typeId);
    const pct = activeType && producer.paidTypeId ? Math.floor((producer.progress / activeType.buildTime) * 100) : 0;
    // 结构 key：不含 progress，避免生产中每帧重建导致按钮闪烁无法点击
    const key = [
      selected.id,
      producer.enabled ? 1 : 0,
      producer.typeId,
      producer.paidTypeId ?? '',
      options.map((o) => o.id).join(','),
    ].join('|');
    if (key !== this.producerPanelKey) {
      this.producerPanelKey = key;
      this.producerUnitFills.clear();
      this.producerEl.innerHTML = '';
      this.producerEl.classList.add('on');

      const title = document.createElement('div');
      title.className = 'mv3-producer-row';
      const titleText = document.createElement('span');
      titleText.textContent = this.buildLabel(this.world.rules.units.get(selected.entity.typeId)!);
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = producer.enabled ? uiText().hud.producerAuto : uiText().hud.producerOff;
      toggle.addEventListener('click', () => {
        this.localCommands.push({ kind: 'setAutoProduction', owner: this.localPlayerId, buildingId: selected.id, enabled: !producer.enabled });
        audioBus.play('select');
      });
      title.append(titleText, toggle);

      const unitsRow = document.createElement('div');
      unitsRow.className = 'mv3-producer-units';
      for (const option of options) {
        const meta = buildButtonMeta3D(option);
        const label = this.buildLabel(option);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv3-producer-unit';
        btn.title = `${label} - ${meta.hint}`;
        if (option.id === producer.typeId) btn.classList.add('active');
        const canProduce = this.world.canBuild(this.localPlayerId, option);
        btn.disabled = !canProduce;
        const icon = document.createElement('span');
        icon.className = 'mv3-prod-icon';
        icon.textContent = meta.icon;
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = label;
        const progress = document.createElement('span');
        progress.className = 'mv3-prod-progress';
        const fill = document.createElement('span');
        progress.appendChild(fill);
        btn.append(icon, name, progress);
        btn.addEventListener('click', () => {
          this.localCommands.push({ kind: 'setProducerType', owner: this.localPlayerId, buildingId: selected.id, typeId: option.id });
          audioBus.play('select');
        });
        unitsRow.appendChild(btn);
        this.producerUnitFills.set(option.id, fill);
      }
      this.producerEl.append(title, unitsRow);
    }

    // 仅更新进度条宽度（不重建 DOM）
    for (const [id, fill] of this.producerUnitFills) {
      const p = id === producer.paidTypeId ? pct : 0;
      fill.style.width = `${Math.max(0, Math.min(100, p))}%`;
    }
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
    const labels: Record<string, string> = uiText().unitLabels;
    return buildButtonMeta3D(type).label !== type.name ? buildButtonMeta3D(type).label : (labels[type.id] ?? type.name);
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

  // ───────────────────────── 小地图 ─────────────────────────

  private get minimapMaxX(): number {
    return Math.max(1, (this.mapW - 1) * THREE_CELL_SIZE);
  }

  private get minimapMaxZ(): number {
    return Math.max(1, (this.mapH - 1) * THREE_CELL_SIZE);
  }

  private setupMinimap(): void {
    this.minimapCanvas = this.root.querySelector('#mv3-minimap-canvas')!;
    const target = 200;
    const longest = Math.max(this.mapW, this.mapH);
    this.minimapScale = Math.max(2, Math.floor(target / longest));
    this.minimapCanvas.width = this.mapW * this.minimapScale;
    this.minimapCanvas.height = this.mapH * this.minimapScale;
    this.minimapCtx = this.minimapCanvas.getContext('2d')!;
    this.minimapTerrainCache = this.buildMinimapTerrain();
    this.bindMinimapInput();
  }

  private minimapTerrainColor(x: number, y: number): string {
    const t = this.world.terrain.terrainAt?.(x, y);
    switch (t) {
      case 'water': return '#2f6a8c';
      case 'ridge': return '#6a716a';
      case 'sand': return '#8a7a56';
      case 'scorched': return '#3a3128';
      case 'shore': return '#9a8d73';
      case 'road': return '#9a8a76';
      case 'marsh': return '#5a7a52';
      default:
        return this.world.terrain.passable(x, y)
          ? ((x + y) % 2 === 0 ? '#4a6a40' : '#42583a')
          : '#5a5040';
    }
  }

  private buildMinimapTerrain(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.minimapCanvas.width;
    canvas.height = this.minimapCanvas.height;
    const ctx = canvas.getContext('2d')!;
    const s = this.minimapScale;
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        ctx.fillStyle = this.minimapTerrainColor(x, y);
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        if (this.world.oreAt(x, y) > 0) {
          ctx.fillStyle = '#f3d35f';
          const o = Math.floor(s / 3);
          ctx.fillRect(x * s + o, y * s + o, Math.max(1, o), Math.max(1, o));
        }
      }
    }
    return canvas;
  }

  private worldToMinimapX(wx: number): number {
    return Math.max(0, Math.min(this.minimapCanvas.width, (wx / this.minimapMaxX) * this.minimapCanvas.width));
  }

  private worldToMinimapY(wz: number): number {
    return Math.max(0, Math.min(this.minimapCanvas.height, (wz / this.minimapMaxZ) * this.minimapCanvas.height));
  }

  private renderMinimap(): void {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const s = this.minimapScale;
    ctx.drawImage(this.minimapTerrainCache, 0, 0);
    // 实体
    for (const e of this.world.entities.values()) {
      const type = this.world.rules.units.get(e.typeId);
      if (!type) continue;
      const wp = leptonToWorld3D(e.x, e.y);
      const mx = this.worldToMinimapX(wp.x);
      const my = this.worldToMinimapY(wp.z);
      const color = playerColorForOwner(e.owner);
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      const size = type.domain === 'building' ? Math.max(2, s) : Math.max(1, Math.floor(s / 2));
      ctx.fillRect(mx - size / 2, my - size / 2, size, size);
    }
    // 视口指示框
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const corners = [
      this.camera.groundAt(0, 0),
      this.camera.groundAt(vw, 0),
      this.camera.groundAt(vw, vh),
      this.camera.groundAt(0, vh),
    ];
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (const c of corners) {
      if (!c) continue;
      const mx = this.worldToMinimapX(c.x);
      const my = this.worldToMinimapY(c.z);
      if (!started) { ctx.moveTo(mx, my); started = true; }
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private bindMinimapInput(): void {
    const canvas = this.minimapCanvas;
    let dragging = false;
    const jump = (clientX: number, clientY: number): void => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ndcY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      this.camera.focus(ndcX * this.minimapMaxX, ndcY * this.minimapMaxZ);
    };
    canvas.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      jump(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      jump(e.clientX, e.clientY);
    });
    const stop = (e: PointerEvent): void => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
  }
}
