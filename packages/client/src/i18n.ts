import type { GroundMoveMode } from './three-orders';
import type { SkirmishMapId } from './match-setup';

export type Locale = 'zh' | 'en';

let forcedLocale: Locale | null = null;

export function detectLocaleFromLanguages(languages: readonly string[]): Locale {
  for (const raw of languages) {
    const lang = raw.trim().toLowerCase();
    if (!lang) continue;
    if (lang === 'zh' || lang.startsWith('zh-') || lang.startsWith('zh_')) return 'zh';
    return 'en';
  }
  return 'en';
}

function savedLocale(): Locale | null {
  try {
    const value = globalThis.localStorage?.getItem('fwg.locale');
    return value === 'zh' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

export function setLocaleForTests(locale: Locale | null): void {
  forcedLocale = locale;
}

export function currentLocale(): Locale {
  if (forcedLocale) return forcedLocale;
  const saved = savedLocale();
  if (saved) return saved;
  const nav = globalThis.navigator;
  const languages =
    nav && Array.isArray(nav.languages) && nav.languages.length > 0
      ? nav.languages
      : nav?.language
        ? [nav.language]
        : [];
  return detectLocaleFromLanguages(languages);
}

export const UI_TEXT = {
  zh: {
    appTitle: 'Fast War Game',
    setup: {
      aiDifficulty: 'AI 难度',
      battlefield: '战场',
      startGame: '开始游戏',
      comingSoon: '即将开放',
      difficulty: {
        easy: '简单',
        normal: '普通',
        hard: '困难',
      },
      maps: {
        verdant: { name: '翠绿', hint: '开阔草原' },
        lakeland: { name: '莱克兰', hint: '湖泊与开阔田野' },
        highlands: { name: '高地', hint: '山脊与瓶颈' },
        badlands: { name: '荒地', hint: '干旱开阔战场' },
        delta: { name: '三角洲', hint: '河道与浅滩' },
      },
    },
    hud: {
      combatUnits: '作战单元',
      controlGroups: '编队',
      attackMode: '攻击模式',
      selected: (count: number) => `选中 ${count}`,
      capacitySelectTooltip: '点击可全选兵种',
      noGroups: '无',
      helpButton: '规则和控制',
      helpTitle: '规则和控制',
      producerAuto: '自动',
      producerOff: '关闭',
      producerIdle: '待命',
      recallGroup: (group: number) => `选择编队 ${group}`,
      time: (time: string) => `时间 ${time}`,
      outcome: {
        Victory: '胜利',
        Defeat: '失败',
      },
      tabs: {
        building: '建造',
        infantry: '步兵',
        vehicle: '车辆',
        aircraft: '空军',
      },
    },
    groundMoveModes: {
      move: {
        label: '途中遇敌不攻击',
        title: '默认：右键移动，不主动攻击沿途敌人',
      },
      attackMove: {
        label: '途中遇敌攻击',
        title: '选择后，右键移动会边走边攻击',
      },
    } satisfies Record<GroundMoveMode, { label: string; title: string }>,
    capacity: {
      building: '建筑',
      worker: '工人',
      infantry: '士兵',
      vehicle: '坦克',
      aircraft: '飞机',
    },
    buildMeta: {
      conyard: { icon: 'HQ', label: '主基地', hint: '基地核心' },
      powerplant: { icon: '⚡', label: '发电厂', hint: '旧版电力' },
      refinery: { icon: '◆', label: '精炼厂', hint: '旧版经济' },
      barracks: { icon: '▥', label: '兵营', hint: '自动生产士兵' },
      warfactory: { icon: '▰', label: '战车工厂', hint: '自动生产坦克' },
      airbase: { icon: '✈', label: '空军基地', hint: '自动生产飞机' },
      pillbox: { icon: '⬟', label: '碉堡', hint: '固定防御' },
      battlelab: { icon: '✚', label: '实验室', hint: '科技解锁' },
      patriot: { icon: '◬', label: '防空导弹阵地', hint: '反导防空' },
      worker: { icon: '⚒', label: '工人', hint: '采集维修' },
      gi: { icon: '步兵', label: '士兵', hint: '基础步兵' },
      engineer: { icon: '🔧', label: '工程师', hint: '占领维修' },
      grizzly: { icon: '▰', label: '坦克', hint: '主战坦克' },
      arty: { icon: '◈', label: '火炮', hint: '远程压制' },
      fighter: { icon: '✈', label: '战斗机', hint: '对空对地' },
      harvester: { icon: '$', label: '采矿车', hint: '采集资源' },
      tel: { icon: '⊕', label: '战术导弹车', hint: '远程展开发射' },
      fallback: { icon: '◆', hint: '建筑' },
    },
    unitLabels: {
      worker: '工人',
      gi: '士兵',
      engineer: '工程师',
      grizzly: '坦克',
      arty: '火炮',
      fighter: '战斗机',
      harvester: '采矿车',
      tel: '战术导弹车',
    },
    rules: {
      sections: [
        {
          title: '胜利条件',
          items: ['消灭敌方全部建筑和战斗单位（不包括工人）。'],
        },
        {
          title: '建造',
          items: ['有工人才能新建建筑。', '点击建筑后再右键空地，可设置集结点。', '按住鼠标中键，可平移地图。'],
        },
        {
          title: '选择',
          items: ['拖框或按 Ctrl 选择：多选单位。', '双击单位：选中屏幕内同类型单位。', '点击顶部兵种数量：全选该兵种。'],
        },
        {
          title: '编队',
          items: ['Ctrl+数字：保存当前选中单位。', '数字键：选中对应编队。'],
        },
      ],
    },
  },
  en: {
    appTitle: 'Fast War Game',
    setup: {
      aiDifficulty: 'AI Difficulty',
      battlefield: 'Battlefield',
      startGame: 'Start Game',
      comingSoon: 'Coming Soon',
      difficulty: {
        easy: 'Easy',
        normal: 'Normal',
        hard: 'Hard',
      },
      maps: {
        verdant: { name: 'Verdant', hint: 'Open grassland' },
        lakeland: { name: 'Lakeland', hint: 'Lakes and open fields' },
        highlands: { name: 'Highlands', hint: 'Ridges and choke points' },
        badlands: { name: 'Badlands', hint: 'Dry open battlefield' },
        delta: { name: 'Delta', hint: 'River channels and fords' },
      },
    },
    hud: {
      combatUnits: 'Units',
      controlGroups: 'Groups',
      attackMode: 'Attack Mode',
      selected: (count: number) => `Selected ${count}`,
      capacitySelectTooltip: 'Click to select all units of this type',
      noGroups: 'None',
      helpButton: 'Rules & Controls',
      helpTitle: 'Rules & Controls',
      producerAuto: 'Auto',
      producerOff: 'Off',
      producerIdle: 'Idle',
      recallGroup: (group: number) => `Recall group ${group}`,
      time: (time: string) => `Time ${time}`,
      outcome: {
        Victory: 'Victory',
        Defeat: 'Defeat',
      },
      tabs: {
        building: 'Build',
        infantry: 'Inf',
        vehicle: 'Veh',
        aircraft: 'Air',
      },
    },
    groundMoveModes: {
      move: {
        label: 'Move without engaging',
        title: 'Default: right-click moves without seeking enemies on the way',
      },
      attackMove: {
        label: 'Attack while moving',
        title: 'When selected, right-click movement attacks enemies along the route',
      },
    } satisfies Record<GroundMoveMode, { label: string; title: string }>,
    capacity: {
      building: 'Buildings',
      worker: 'Workers',
      infantry: 'Soldiers',
      vehicle: 'Tanks',
      aircraft: 'Aircraft',
    },
    buildMeta: {
      conyard: { icon: 'HQ', label: 'Command HQ', hint: 'Base core' },
      powerplant: { icon: '⚡', label: 'Power Plant', hint: 'Legacy power' },
      refinery: { icon: '◆', label: 'Refinery', hint: 'Legacy economy' },
      barracks: { icon: '▥', label: 'Barracks', hint: 'Auto infantry' },
      warfactory: { icon: '▰', label: 'War Factory', hint: 'Auto tanks' },
      airbase: { icon: '✈', label: 'Airbase', hint: 'Auto aircraft' },
      pillbox: { icon: '⬟', label: 'Pillbox', hint: 'Static defense' },
      battlelab: { icon: '✚', label: 'Battle Lab', hint: 'Tech unlocks' },
      patriot: { icon: '◬', label: 'Air Defense Site', hint: 'Anti-air missile' },
      worker: { icon: '⚒', label: 'Worker', hint: 'Gather repair' },
      gi: { icon: 'GI', label: 'Soldier', hint: 'Basic infantry' },
      engineer: { icon: '🔧', label: 'Engineer', hint: 'Capture repair' },
      grizzly: { icon: '▰', label: 'Tank', hint: 'Main battle tank' },
      arty: { icon: '◈', label: 'Artillery', hint: 'Long range' },
      fighter: { icon: '✈', label: 'Fighter', hint: 'Air to ground' },
      harvester: { icon: '$', label: 'Harvester', hint: 'Gather ore' },
      tel: { icon: '⊕', label: 'Tactical Missile', hint: 'Deploy and fire' },
      fallback: { icon: '◆', hint: 'Structure' },
    },
    unitLabels: {
      worker: 'Worker',
      gi: 'Soldier',
      engineer: 'Engineer',
      grizzly: 'Tank',
      arty: 'Artillery',
      fighter: 'Fighter',
      harvester: 'Harvester',
      tel: 'Tactical Missile',
    },
    rules: {
      sections: [
        {
          title: 'Victory',
          items: ['Destroy every enemy building and combat unit. Workers do not count.'],
        },
        {
          title: 'Building',
          items: ['You need at least one worker to place new buildings.', 'Select a building, then right-click ground to set a rally point.', 'Hold the middle mouse button to pan the map.'],
        },
        {
          title: 'Selection',
          items: ['Drag-select or Ctrl-click to multi-select units.', 'Double-click a unit to select matching units on screen.', 'Click a top unit counter to select all units of that type.'],
        },
        {
          title: 'Groups',
          items: ['Ctrl+number saves the current selection.', 'Press a number key to recall that group.'],
        },
      ],
    },
  },
} as const;

export type UiText = (typeof UI_TEXT)[Locale];

export function uiText(): UiText {
  return UI_TEXT[currentLocale()];
}

export function difficultyLabel(difficulty: 'easy' | 'normal' | 'hard'): string {
  return uiText().setup.difficulty[difficulty];
}

export function skirmishMapText(id: SkirmishMapId): { name: string; hint: string } {
  return uiText().setup.maps[id];
}
