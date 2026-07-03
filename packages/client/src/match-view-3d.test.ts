import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World } from '@ra2web/game';
import { gridTerrain } from '@ra2web/game';
import * as matchView3D from './match-view-3d';
import { setLocaleForTests } from './i18n';
import {
  allOwnedUnitIdsInCapacityGroup3D,
  ATTACK_MODE_HUD_LABEL_3D,
  bindAudioUnlock,
  bindBuildButtonActivation3D,
  buildButtonMeta3D,
  buildButtonTitle3D,
  BUILD_PANEL_PLACEMENT_CLASS_3D,
  capacitySummarySegments3D,
  capacitySummaryText3D,
  CAPACITY_SELECT_TOOLTIP_3D,
  clickSelectionIds3D,
  clampCellToMap3D,
  CONTROL_GROUPS_HUD_LABEL_3D,
  controlGroupButtonLabel3D,
  controlGroupIdsForSelection3D,
  controlGroupHudItems3D,
  DEFAULT_GROUND_MOVE_MODE_3D,
  DEFAULT_TANK_FORMATION_3D,
  groundMoveModeButtons3D,
  initialCameraFocus3D,
  matchOutcomeText3D,
  MATCH_3D_STYLE,
  placementCellForClick3D,
  PRODUCTION_CATEGORIES_3D,
  productionClickPlan3D,
  rulesAndControlsSections3D,
  sameTypeVisibleSelectionIds3D,
  SELECTED_STATUS_CLASS_3D,
  supportedBuildButtonTypes3D,
  tankFormationButtons3D,
  topHudText3D,
} from './match-view-3d';

beforeEach(() => setLocaleForTests('zh'));
afterEach(() => setLocaleForTests(null));

describe('MatchView3D camera defaults', () => {
  it('starts focused on the center of the map instead of the local spawn', () => {
    expect(initialCameraFocus3D(44, 44)).toEqual({ x: 43, z: 43 });
  });
});

describe('MatchView3D map-edge targeting', () => {
  it('keeps right-click orders usable on the visible outer ground by clamping to the nearest map cell', () => {
    expect(clampCellToMap3D({ x: -8, y: 12 }, 44, 44)).toEqual({ x: 0, y: 12 });
    expect(clampCellToMap3D({ x: 12, y: 99 }, 44, 44)).toEqual({ x: 12, y: 43 });
    expect(clampCellToMap3D({ x: 99, y: -8 }, 44, 44)).toEqual({ x: 43, y: 0 });
  });

  it('clamps building placement so a clicked footprint can still fit at map edges', () => {
    const building = { building: { footprintW: 3, footprintH: 2 } } as const;

    expect(placementCellForClick3D({ x: 99, y: 99 }, building, 44, 44)).toEqual({ x: 41, y: 42 });
    expect(placementCellForClick3D({ x: -5, y: -7 }, building, 44, 44)).toEqual({ x: 0, y: 0 });
  });
});

describe('MatchView3D production tabs', () => {
  it('only exposes manual building production; units are produced automatically by buildings', () => {
    expect(PRODUCTION_CATEGORIES_3D).toEqual(['building']);
  });

  it('uses a bottom build bar with only currently supported buildings', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);

    expect(BUILD_PANEL_PLACEMENT_CLASS_3D).toBe('mv3-build-bottom-bar');
    expect(supportedBuildButtonTypes3D([...world.rules.units.values()], 'allied').map((type) => type.id)).toEqual([
      'barracks',
      'warfactory',
      'airbase',
      'patriot',
    ]);
  });

  it('keeps the build bar compact without a heading, status pill, or truncated names', () => {
    expect(MATCH_3D_STYLE).toContain('.mv3-build-head { display: none; }');
    expect(MATCH_3D_STYLE).toContain('.mv3-build .state { display: none; }');
    expect(MATCH_3D_STYLE).toContain('text-overflow: clip');
    expect(MATCH_3D_STYLE).not.toContain('.mv3-build .name { overflow: hidden; text-overflow: ellipsis;');
  });

  it('provides localized RTS-style icons and hints for core building buttons', () => {
    expect(buildButtonMeta3D({ id: 'barracks', name: 'Barracks' })).toEqual({
      icon: '\u25a5',
      label: '\u5175\u8425',
      hint: '\u53ef\u751f\u4ea7\uff1asoldier',
    });
    expect(buildButtonMeta3D({ id: 'warfactory', name: 'War Factory' })).toEqual({
      icon: '\u25b0',
      label: '\u6218\u8f66\u5de5\u5382',
      hint: '\u53ef\u751f\u4ea7\uff1atank\u3001missile truck',
    });
    expect(buildButtonMeta3D({ id: 'airbase', name: 'Airbase' })).toEqual({
      icon: '\u2708',
      label: '\u7a7a\u519b\u57fa\u5730',
      hint: '\u53ef\u751f\u4ea7\uff1afighter',
    });
    expect(buildButtonMeta3D({ id: 'pillbox', name: 'Pillbox' }).icon).toBe('\u2b1f');
    expect(buildButtonMeta3D({ id: 'battlelab', name: 'Battle Lab' }).hint).toBe('\u79d1\u6280\u89e3\u9501');
  });

  it('uses concise production hints as build button hover titles', () => {
    setLocaleForTests('en');

    expect(buildButtonTitle3D(buildButtonMeta3D({ id: 'barracks', name: 'Barracks' }))).toBe('Produces: soldier');
    expect(buildButtonTitle3D(buildButtonMeta3D({ id: 'warfactory', name: 'War Factory' }))).toBe('Produces: tank, missile truck');
    expect(buildButtonTitle3D(buildButtonMeta3D({ id: 'airbase', name: 'Airbase' }))).toBe('Produces: fighter');
  });

  it('activates build buttons on pointer down without firing the following click twice', () => {
    const button = new EventTarget();
    let activations = 0;

    bindBuildButtonActivation3D(button, () => {
      activations++;
    });

    const pointerDown = new Event('pointerdown') as Event & { button: number };
    Object.defineProperty(pointerDown, 'button', { value: 0 });
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(new Event('click'));

    expect(activations).toBe(1);

    button.dispatchEvent(new Event('click'));

    expect(activations).toBe(2);
  });

  it('switches the current pending building instead of queuing behind the previous pending building', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    const barracks = world.rules.units.get('barracks')!;
    const queue = { items: ['warfactory'], progress: 0, readyToPlace: true };

    expect(productionClickPlan3D(1, barracks, queue, 'warfactory')).toEqual({
      commands: [
        { kind: 'cancel', owner: 1, category: 'building' },
        { kind: 'produce', owner: 1, typeId: 'barracks' },
      ],
      placingTypeId: 'barracks',
    });
  });
});

describe('MatchView3D ground order mode HUD', () => {
  it('uses persistent button modes without a keyboard shortcut', () => {
    expect(DEFAULT_GROUND_MOVE_MODE_3D).toBe('move');
    expect(groundMoveModeButtons3D()).toEqual([
      { mode: 'move', label: '\u9014\u4e2d\u9047\u654c\u4e0d\u653b\u51fb', title: '\u9ed8\u8ba4\uff1a\u53f3\u952e\u79fb\u52a8\uff0c\u4e0d\u4e3b\u52a8\u653b\u51fb\u6cbf\u9014\u654c\u4eba' },
      { mode: 'attackMove', label: '\u9014\u4e2d\u9047\u654c\u653b\u51fb', title: '\u9009\u62e9\u540e\uff0c\u53f3\u952e\u79fb\u52a8\u4f1a\u8fb9\u8d70\u8fb9\u653b\u51fb' },
    ]);
    expect(JSON.stringify(groundMoveModeButtons3D())).not.toContain('A');
    expect('isAttackMoveModifierKey3D' in matchView3D).toBe(false);
    expect('groundMoveModeForOrder3D' in matchView3D).toBe(false);
  });
});

describe('MatchView3D tank formation HUD', () => {
  it('offers a default wide grid plus alternate tank formations', () => {
    expect(DEFAULT_TANK_FORMATION_3D).toBe('grid');
    expect(tankFormationButtons3D().map((button) => button.formation)).toEqual(['grid', 'line', 'wedge', 'column']);
  });
});

describe('MatchView3D audio unlock', () => {
  it('unlocks audio from HUD/root clicks, not only canvas clicks', () => {
    const root = new EventTarget();
    let resumes = 0;

    bindAudioUnlock(root, null, () => {
      resumes++;
    });
    root.dispatchEvent(new Event('pointerdown'));
    root.dispatchEvent(new Event('pointerdown'));

    expect(resumes).toBe(1);
  });

  it('unlocks audio from the first keyboard gesture', () => {
    const root = new EventTarget();
    const keys = new EventTarget();
    let resumes = 0;

    bindAudioUnlock(root, keys, () => {
      resumes++;
    });
    keys.dispatchEvent(new Event('keydown'));
    keys.dispatchEvent(new Event('keydown'));

    expect(resumes).toBe(1);
  });
});

describe('MatchView3D rules and controls help', () => {
  it('keeps the help panel concise and grouped by player task', () => {
    const sections = rulesAndControlsSections3D();

    expect(sections.map((section) => section.title)).toEqual(['胜利条件', '建造', '选择', '编队']);
    expect(sections.flatMap((section) => section.items)).toEqual([
      '消灭敌方全部建筑和战斗单位（不包括工程师）。',
      '有工程师才能新建建筑。',
      '点击建筑后再右键空地，可设置集结点。',
      '按住鼠标中键，可平移地图。',
      '拖框或按 Ctrl 选择：多选单位。',
      '双击单位：选中屏幕内同类型单位。',
      '点击顶部兵种数量：全选该兵种。',
      'Ctrl+数字：保存当前选中单位。',
      '数字键：选中对应编队。',
    ]);
  });
});

describe('MatchView3D capacity HUD', () => {
  it('summarizes building and unit caps in generated-over-limit form', () => {
    expect(
      capacitySummaryText3D({
        building: { count: 12, limit: 20 },
        infantry: { count: 340, limit: 300 },
        worker: { count: 12, limit: 20 },
        vehicle: { count: 76, limit: 100 },
        aircraft: { count: 31, limit: 30 },
      }),
    ).toBe('建筑 12/20 | 工程师 12/20 | 士兵 340/300 | 坦克 76/100 | 飞机 31/30');
  });

  it('does not expose credits in the top HUD summary', () => {
    const text = topHudText3D({
      building: { count: 4, limit: 20 },
      infantry: { count: 117, limit: 300 },
      worker: { count: 8, limit: 20 },
      vehicle: { count: 48, limit: 100 },
      aircraft: { count: 23, limit: 30 },
    });

    expect(text).toBe('建筑 4/20 | 工程师 8/20 | 士兵 117/300 | 坦克 48/100 | 飞机 23/30');
    expect(text).not.toContain('Credits');
    expect(text).not.toContain('$');
  });

  it('marks unit capacity segments as selectable while keeping buildings informational', () => {
    const segments = capacitySummarySegments3D({
      building: { count: 4, limit: 20 },
      infantry: { count: 117, limit: 300 },
      worker: { count: 8, limit: 20 },
      vehicle: { count: 48, limit: 100 },
      aircraft: { count: 23, limit: 30 },
    });

    expect(segments.map((segment) => segment.text).join(' | ')).toBe('建筑 4/20 | 工程师 8/20 | 士兵 117/300 | 坦克 48/100 | 飞机 23/30');
    expect(segments.map((segment) => segment.selectGroup ?? null)).toEqual([null, 'worker', 'infantry', 'vehicle', 'aircraft']);
  });

  it('keeps capacity chips free of keyboard-letter badges', () => {
    expect(
      capacitySummarySegments3D({
        building: { count: 4, limit: 20 },
        infantry: { count: 117, limit: 300 },
        worker: { count: 8, limit: 20 },
        vehicle: { count: 48, limit: 100 },
        aircraft: { count: 23, limit: 30 },
      }),
    ).toEqual([
      { text: '建筑 4/20' },
      { text: '工程师 8/20', selectGroup: 'worker' },
      { text: '士兵 117/300', selectGroup: 'infantry' },
      { text: '坦克 48/100', selectGroup: 'vehicle' },
      { text: '飞机 23/30', selectGroup: 'aircraft' },
    ]);
  });

  it('switches the main HUD labels to English for English users', () => {
    setLocaleForTests('en');

    expect(capacitySummaryText3D({
      building: { count: 4, limit: 20 },
      infantry: { count: 117, limit: 300 },
      worker: { count: 8, limit: 20 },
      vehicle: { count: 48, limit: 100 },
      aircraft: { count: 23, limit: 30 },
    })).toBe('Buildings 4/20 | Engineers 8/20 | Soldiers 117/300 | Tanks 48/100 | Aircraft 23/30');
    expect(groundMoveModeButtons3D()[1]?.label).toBe('Attack while moving');
    expect(rulesAndControlsSections3D()[0]?.title).toBe('Victory');
  });

  it('shows missile truck capacity separately between tanks and aircraft', () => {
    setLocaleForTests('en');

    const segments = capacitySummarySegments3D({
      building: { count: 3, limit: 20 },
      worker: { count: 20, limit: 20 },
      infantry: { count: 0, limit: 300 },
      vehicle: { count: 100, limit: 100 },
      missileTruck: { count: 4, limit: 10 },
      aircraft: { count: 0, limit: 30 },
    });

    expect(segments.map((segment) => segment.text)).toEqual([
      'Buildings 3/20',
      'Engineers 20/20',
      'Soldiers 0/300',
      'Tanks 100/100',
      'Missile Trucks 4/10',
      'Aircraft 0/30',
    ]);
    expect(segments.map((segment) => segment.selectGroup ?? null)).toEqual([
      null,
      'worker',
      'infantry',
      'vehicle',
      'missileTruck',
      'aircraft',
    ]);
  });

  it('shows tactical missile ammo fired and total as a non-selectable HUD segment', () => {
    setLocaleForTests('en');

    const segments = capacitySummarySegments3D({
      building: { count: 3, limit: 20 },
      worker: { count: 20, limit: 20 },
      infantry: { count: 0, limit: 300 },
      vehicle: { count: 100, limit: 100 },
      missileTruck: { count: 4, limit: 10 },
      aircraft: { count: 0, limit: 30 },
    }, { fired: 12, total: 200 });

    expect(segments.map((segment) => segment.text)).toContain('Missiles fired 12/200');
    expect(segments.find((segment) => segment.text === 'Missiles fired 12/200')?.selectGroup).toBeUndefined();
    expect(topHudText3D({
      building: { count: 3, limit: 20 },
      worker: { count: 20, limit: 20 },
      infantry: { count: 0, limit: 300 },
      vehicle: { count: 100, limit: 100 },
      missileTruck: { count: 4, limit: 10 },
      aircraft: { count: 0, limit: 30 },
    }, { fired: 12, total: 200 })).toContain('Missiles fired 12/200');
  });
});

describe('MatchView3D unit selection helpers', () => {
  it('adds ctrl-clicked units to the existing selection without clearing it', () => {
    expect(clickSelectionIds3D([7, 2], 5, true)).toEqual([2, 5, 7]);
    expect(clickSelectionIds3D([7, 2], 7, true)).toEqual([2, 7]);
    expect(clickSelectionIds3D([7, 2], null, true)).toEqual([2, 7]);
  });

  it('keeps normal click selection as replace-or-clear', () => {
    expect(clickSelectionIds3D([7, 2], 5, false)).toEqual([5]);
    expect(clickSelectionIds3D([7, 2], null, false)).toEqual([]);
  });

  it('selects same-type owned units that are currently inside the screen', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    world.addPlayer(2, 'soviet', 0);
    const clicked = world.spawnUnit(1, 'gi', 3, 3)!;
    const sameVisible = world.spawnUnit(1, 'gi', 4, 3)!;
    const sameOffscreen = world.spawnUnit(1, 'gi', 5, 3)!;
    const worker = world.spawnUnit(1, 'worker', 6, 3)!;
    const tank = world.spawnUnit(1, 'grizzly', 7, 3)!;
    const enemy = world.spawnUnit(2, 'gi', 8, 3)!;

    const ids = sameTypeVisibleSelectionIds3D(
      world,
      1,
      clicked.id,
      [
        { id: clicked.id, x: 120, y: 160 },
        { id: sameVisible.id, x: 300, y: 220 },
        { id: sameOffscreen.id, x: 900, y: 220 },
        { id: worker.id, x: 180, y: 180 },
        { id: tank.id, x: 240, y: 180 },
        { id: enemy.id, x: 260, y: 180 },
      ],
      { left: 0, top: 0, width: 800, height: 600 },
    );

    expect(ids).toEqual([clicked.id, sameVisible.id]);
  });

  it('selects all owned units for a clicked top capacity group', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    world.addPlayer(2, 'soviet', 0);
    const worker = world.spawnUnit(1, 'worker', 3, 3)!;
    const gi = world.spawnUnit(1, 'gi', 4, 3)!;
    const tank = world.spawnUnit(1, 'grizzly', 5, 3)!;
    const fighter = world.spawnUnit(1, 'fighter', 6, 3)!;
    world.spawnUnit(1, 'conyard', 7, 3);
    world.spawnUnit(2, 'gi', 8, 3);

    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'worker')).toEqual([worker.id]);
    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'infantry')).toEqual([gi.id]);
    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'vehicle')).toEqual([tank.id]);
    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'aircraft')).toEqual([fighter.id]);
  });

  it('selects missile trucks separately from regular tanks from the top counters', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    const tank = world.spawnUnit(1, 'grizzly', 5, 3)!;
    const missileTruck = world.spawnUnit(1, 'arty', 6, 3)!;

    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'vehicle')).toEqual([tank.id]);
    expect(allOwnedUnitIdsInCapacityGroup3D(world, 1, 'missileTruck')).toEqual([missileTruck.id]);
  });

  it('uses an explicit tooltip for clickable top unit counters', () => {
    expect(CAPACITY_SELECT_TOOLTIP_3D).toBe('点击可全选兵种');
  });
});

describe('MatchView3D control groups', () => {
  it('labels control groups separately from unit capacity and gives selected count its own style hook', () => {
    expect(CONTROL_GROUPS_HUD_LABEL_3D).toBe('编队');
    expect(ATTACK_MODE_HUD_LABEL_3D).toBe('攻击模式');
    expect(SELECTED_STATUS_CLASS_3D).toBe('mv3-selected-status');
    expect(MATCH_3D_STYLE).toContain('.mv3-group-num');
    expect(MATCH_3D_STYLE).toContain('.mv3-group-count');
  });

  it('stores only live owned non-building units when assigning a control group', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    world.addPlayer(2, 'soviet', 0);
    const worker = world.spawnUnit(1, 'worker', 3, 3)!;
    const gi = world.spawnUnit(1, 'gi', 4, 3)!;
    const tank = world.spawnUnit(1, 'grizzly', 5, 3)!;
    const conyard = world.spawnUnit(1, 'conyard', 7, 3)!;
    const enemy = world.spawnUnit(2, 'gi', 8, 3)!;

    expect(controlGroupIdsForSelection3D(world, 1, [enemy.id, tank.id, conyard.id, gi.id, 9999, worker.id])).toEqual([
      worker.id,
      gi.id,
      tank.id,
    ]);
  });

  it('summarizes a group by group number, unit kind, and count', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    const worker = world.spawnUnit(1, 'worker', 3, 3)!;
    const giA = world.spawnUnit(1, 'gi', 4, 3)!;
    const giB = world.spawnUnit(1, 'gi', 5, 3)!;
    const tank = world.spawnUnit(1, 'grizzly', 6, 3)!;
    const fighter = world.spawnUnit(1, 'fighter', 7, 3)!;

    expect(controlGroupButtonLabel3D(world, 2, [fighter.id, tank.id, giA.id, worker.id, giB.id])).toBe(
      '2 工程师 1 · 士兵 2 · 坦克 1 · 飞机 1',
    );
  });

  it('omits empty or dead control groups from the HUD items', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    const gi = world.spawnUnit(1, 'gi', 4, 3)!;
    const tank = world.spawnUnit(1, 'grizzly', 5, 3)!;
    const groups = new Map<number, number[]>([
      [1, [gi.id]],
      [2, [9999]],
      [3, [tank.id]],
    ]);

    expect(controlGroupHudItems3D(world, groups)).toEqual([
      { group: 1, ids: [gi.id], label: '1 士兵 1' },
      { group: 3, ids: [tank.id], label: '3 坦克 1' },
    ]);
  });
});

describe('MatchView3D match outcome', () => {
  it('reports defeat for the local player and victory when all enemies are defeated', () => {
    const world = new World(gridTerrain(20, 20), 7);
    world.addPlayer(1, 'allied', 0);
    world.addPlayer(2, 'soviet', 0);

    expect(matchOutcomeText3D(world, 1)).toBeNull();
    world.players.get(1)!.defeated = true;
    expect(matchOutcomeText3D(world, 1)).toBe('Defeat');

    world.players.get(1)!.defeated = false;
    world.players.get(2)!.defeated = true;
    expect(matchOutcomeText3D(world, 1)).toBe('Victory');
  });
});
