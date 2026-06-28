/**
 * 内置精简规则数据 —— 让游戏脱离 EA 文件即可运行的「代餐」。
 * 数值参考红警2 原版量级（金钱/电力/血量）但做了取整简化。
 * 真实 rules.ini 解析就绪后，可由同结构数据覆盖本表（见 RulesData 接口）。
 *
 * 所有数值均为整数：金钱(credits)、电力(power)、血量(hp)、
 * 速度(lepton/tick)、转速(二进制角/tick)、建造时间(tick)。
 */

export type Side = 'allied' | 'soviet';
export type Domain = 'infantry' | 'vehicle' | 'aircraft' | 'building';

export interface ArmorVerses {
  /** 弹头对各装甲类型的伤害百分比（默认 100）。 */
  none: number;
  flak: number;
  plate: number;
  light: number;
  heavy: number;
  concrete: number;
}

export type ArmorType = keyof ArmorVerses;
export type WeaponRole = 'gun' | 'cannon' | 'bomb' | 'missile';

export interface WeaponSpec {
  name: string;
  damage: number;
  /** 射程（lepton）。 */
  range: number;
  minRange?: number;
  /** 攻击间隔（tick）。 */
  cooldown: number;
  /** 弹丸飞行速度（lepton/tick）；0=瞬中（如激光）。 */
  projectileSpeed: number;
  warhead: Partial<ArmorVerses>;
  /** 溅射半径（lepton），0=单体。 */
  splash: number;
  role?: WeaponRole;
  targetDomains?: Domain[];
}

export interface UnitType {
  id: string;
  name: string;
  side: Side;
  domain: Domain;
  cost: number;
  hp: number;
  armor: ArmorType;
  /** 建造时间（tick，15Hz）。 */
  buildTime: number;
  /** 由哪个建筑生产（建筑 id）。 */
  builtBy: string;
  /** 前置建筑 id。 */
  prerequisites: string[];
  speed: number;
  rot: number;
  /** 视野（格）。 */
  sight: number;
  weapon?: WeaponSpec;
  antiAirWeapon?: WeaponSpec;
  /** 建筑专属。 */
  building?: BuildingTraits;
  /** 工程师：进入己方建筑满血修复、进入敌方建筑占领（进入后被消耗）。 */
  engineer?: boolean;
  /** 需展开才能开火的单位：展开耗时（tick）。展开后不可移动，收起耗时为展开的一半。 */
  deployTime?: number;
}

export interface BuildingTraits {
  /** 占地格（宽×高）。 */
  footprintW: number;
  footprintH: number;
  /** 正=发电，负=耗电。 */
  power: number;
  /** 提供建造能力的分类标签（如 'barracks' 让步兵可造）。 */
  provides?: string;
  /** 是矿石精炼厂（采矿车卸矿点）。 */
  refinery?: boolean;
  /** 附带一辆采矿车。 */
  freeHarvester?: boolean;
  /** 可由 MCV 展开得到（基地）。 */
  isConYard?: boolean;
}

export interface RulesData {
  units: Map<string, UnitType>;
  /** 装甲对照：弹头默认百分比补全。 */
  resolveVerses(warhead: Partial<ArmorVerses>): ArmorVerses;
}

const FULL: ArmorVerses = { none: 100, flak: 100, plate: 100, light: 100, heavy: 100, concrete: 100 };

/** 内置单位/建筑表（盟苏各核心一批，对应 M7 MVP 子集）。 */
const UNIT_LIST: UnitType[] = [
  // —— 通用建筑 ——
  {
    id: 'conyard',
    name: '建造场',
    side: 'allied',
    domain: 'building',
    cost: 2500,
    hp: 1000,
    armor: 'concrete',
    buildTime: 0,
    builtBy: '',
    prerequisites: [],
    speed: 0,
    rot: 0,
    sight: 6,
    building: { footprintW: 3, footprintH: 3, power: 0, provides: 'conyard', isConYard: true },
  },
  {
    id: 'powerplant',
    name: '发电厂',
    side: 'allied',
    domain: 'building',
    cost: 800,
    hp: 750,
    armor: 'concrete',
    buildTime: 75,
    builtBy: '',
    prerequisites: [],
    speed: 0,
    rot: 0,
    sight: 4,
    building: { footprintW: 2, footprintH: 2, power: 100 },
  },
  {
    id: 'refinery',
    name: '矿石精炼厂',
    side: 'allied',
    domain: 'building',
    cost: 2000,
    hp: 900,
    armor: 'concrete',
    buildTime: 150,
    builtBy: '',
    prerequisites: [],
    speed: 0,
    rot: 0,
    sight: 5,
    building: { footprintW: 3, footprintH: 3, power: -30, refinery: true },
  },
  {
    id: 'barracks',
    name: '英军兵营',
    side: 'allied',
    domain: 'building',
    cost: 500,
    hp: 800,
    armor: 'concrete',
    buildTime: 75,
    builtBy: 'conyard',
    prerequisites: ['conyard'],
    speed: 0,
    rot: 0,
    sight: 4,
    building: { footprintW: 2, footprintH: 2, power: -20, provides: 'barracks' },
  },
  {
    id: 'warfactory',
    name: '英军战车工厂',
    side: 'allied',
    domain: 'building',
    cost: 2000,
    hp: 1000,
    armor: 'concrete',
    buildTime: 150,
    builtBy: 'conyard',
    prerequisites: ['conyard'],
    speed: 0,
    rot: 0,
    sight: 4,
    building: { footprintW: 3, footprintH: 3, power: -50, provides: 'warfactory' },
  },
  // —— 防御 ——
  {
    id: 'pillbox',
    name: '英军碉堡',
    side: 'allied',
    domain: 'building',
    cost: 500,
    hp: 600,
    armor: 'concrete',
    buildTime: 60,
    builtBy: 'conyard',
    prerequisites: ['barracks'],
    speed: 0,
    rot: 32,
    sight: 6,
    weapon: { name: '机枪', damage: 25, range: 5 * 256, cooldown: 8, projectileSpeed: 0, warhead: { none: 100, flak: 80, plate: 60, light: 25, heavy: 10 }, splash: 0 },
    building: { footprintW: 1, footprintH: 1, power: -10 },
  },
  {
    id: 'tesla',
    name: '磁暴线圈',
    side: 'soviet',
    domain: 'building',
    cost: 1500,
    hp: 600,
    armor: 'concrete',
    buildTime: 100,
    builtBy: 'conyard',
    prerequisites: ['barracks'],
    speed: 0,
    rot: 0,
    sight: 7,
    weapon: { name: '磁暴电击', damage: 200, range: 6 * 256, cooldown: 40, projectileSpeed: 0, warhead: { none: 100, flak: 100, plate: 100, light: 100, heavy: 80, concrete: 40 }, splash: 0 },
    building: { footprintW: 2, footprintH: 2, power: -150 },
  },
  // —— 防空导弹阵地（盟军固定防空）——
  // 不可移动，仅对空（aircraft 域）；导弹高速、追踪、命中爆炸。
  {
    id: 'patriot',
    name: '防空导弹阵地',
    side: 'allied',
    domain: 'building',
    cost: 1000,
    hp: 700,
    armor: 'concrete',
    buildTime: 80,
    builtBy: 'conyard',
    prerequisites: [],
    speed: 0,
    rot: 0,
    sight: 9,
    antiAirWeapon: {
      name: 'PAC-3 拦截弹',
      damage: 80,
      range: 18 * 256,
      cooldown: 32,
      projectileSpeed: 140,
      warhead: { none: 30, flak: 100, plate: 110, light: 120, heavy: 50, concrete: 15 },
      splash: 18,
      role: 'missile',
      targetDomains: ['aircraft'],
    },
    building: { footprintW: 2, footprintH: 2, power: -75 },
  },
  // —— 科技建筑：作战实验室（解锁高级单位）——
  {
    id: 'battlelab',
    name: '作战实验室',
    side: 'allied',
    domain: 'building',
    cost: 2000,
    hp: 800,
    armor: 'concrete',
    buildTime: 120,
    builtBy: 'conyard',
    prerequisites: ['warfactory'],
    speed: 0,
    rot: 0,
    sight: 4,
    building: { footprintW: 2, footprintH: 2, power: -100, provides: 'battlelab' },
  },
  {
    id: 'airbase',
    name: '空军基地',
    side: 'allied',
    domain: 'building',
    cost: 1500,
    hp: 850,
    armor: 'concrete',
    buildTime: 120,
    builtBy: 'conyard',
    prerequisites: ['conyard'],
    speed: 0,
    rot: 0,
    sight: 6,
    building: { footprintW: 3, footprintH: 2, power: -60, provides: 'airbase' },
  },
  // —— 步兵 ——
  {
    id: 'gi',
    name: '英国士兵',
    side: 'allied',
    domain: 'infantry',
    cost: 200,
    hp: 125,
    armor: 'none',
    buildTime: 30,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 20,
    rot: 32,
    sight: 5,
    weapon: { name: 'M1卡宾枪', damage: 15, range: 5 * 256, cooldown: 8, projectileSpeed: 0, warhead: { none: 100, flak: 80, plate: 65, light: 25, heavy: 8, concrete: 10 }, splash: 0 },
  },
  {
    id: 'worker',
    name: 'Worker',
    side: 'allied',
    domain: 'infantry',
    cost: 0,
    hp: 65,
    armor: 'none',
    buildTime: 120,
    builtBy: 'conyard',
    prerequisites: ['conyard'],
    speed: 18,
    rot: 32,
    sight: 4,
  },
  {
    id: 'conscript',
    name: '动员兵',
    side: 'soviet',
    domain: 'infantry',
    cost: 100,
    hp: 100,
    armor: 'none',
    buildTime: 20,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 22,
    rot: 32,
    sight: 5,
    weapon: { name: 'PPSh', damage: 12, range: 4 * 256, cooldown: 7, projectileSpeed: 0, warhead: { none: 100, flak: 80, plate: 60, light: 20, heavy: 6, concrete: 10 }, splash: 0 },
  },
  {
    id: 'engineer',
    name: '工程师',
    side: 'allied',
    domain: 'infantry',
    cost: 500,
    hp: 75,
    armor: 'none',
    buildTime: 40,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 18,
    rot: 32,
    sight: 4,
    engineer: true,
  },
  {
    id: 'sovengineer',
    name: '工程师',
    side: 'soviet',
    domain: 'infantry',
    cost: 500,
    hp: 75,
    armor: 'none',
    buildTime: 40,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 18,
    rot: 32,
    sight: 4,
    engineer: true,
  },
  // —— 反装甲步兵（火箭弹：强克载具/建筑，对步兵很弱——给步兵一个打坦克的答案）——
  {
    id: 'rocketsoldier',
    name: '火箭兵',
    side: 'allied',
    domain: 'infantry',
    cost: 300,
    hp: 110,
    armor: 'none',
    buildTime: 38,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 18,
    rot: 32,
    sight: 5,
    weapon: { name: '火箭弹', damage: 28, range: 5 * 256, cooldown: 26, projectileSpeed: 60, warhead: { none: 30, flak: 70, plate: 90, light: 110, heavy: 90, concrete: 70 }, splash: 12 },
  },
  {
    id: 'tankbuster',
    name: '反坦克兵',
    side: 'soviet',
    domain: 'infantry',
    cost: 300,
    hp: 110,
    armor: 'none',
    buildTime: 38,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 18,
    rot: 32,
    sight: 5,
    weapon: { name: '反坦克火箭', damage: 28, range: 5 * 256, cooldown: 26, projectileSpeed: 60, warhead: { none: 30, flak: 70, plate: 90, light: 110, heavy: 90, concrete: 70 }, splash: 12 },
  },
  // —— 军犬（快速廉价、撕咬秒步兵、对载具/建筑几乎无效；侦察视野好）——
  {
    id: 'k9',
    name: '警犬',
    side: 'allied',
    domain: 'infantry',
    cost: 100,
    hp: 70,
    armor: 'none',
    buildTime: 16,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 50,
    rot: 32,
    sight: 7,
    weapon: { name: '撕咬', damage: 90, range: 1 * 256, cooldown: 14, projectileSpeed: 0, warhead: { none: 100, flak: 25, plate: 15, light: 4, heavy: 2, concrete: 0 }, splash: 0 },
  },
  {
    id: 'dog',
    name: '军犬',
    side: 'soviet',
    domain: 'infantry',
    cost: 100,
    hp: 70,
    armor: 'none',
    buildTime: 16,
    builtBy: 'barracks',
    prerequisites: ['barracks'],
    speed: 50,
    rot: 32,
    sight: 7,
    weapon: { name: '撕咬', damage: 90, range: 1 * 256, cooldown: 14, projectileSpeed: 0, warhead: { none: 100, flak: 25, plate: 15, light: 4, heavy: 2, concrete: 0 }, splash: 0 },
  },
  // —— 车辆 ——
  {
    id: 'harvester',
    name: '矿车',
    side: 'allied',
    domain: 'vehicle',
    cost: 1400,
    hp: 600,
    armor: 'heavy',
    buildTime: 90,
    builtBy: '',
    prerequisites: [],
    speed: 24,
    rot: 16,
    sight: 4,
  },
  {
    id: 'grizzly',
    name: '英军坦克',
    side: 'allied',
    domain: 'vehicle',
    cost: 700,
    hp: 300,
    armor: 'heavy',
    buildTime: 60,
    builtBy: 'warfactory',
    prerequisites: ['warfactory'],
    speed: 40,
    rot: 12,
    sight: 6,
    weapon: { name: '90mm炮', damage: 45, range: 5 * 256, cooldown: 30, projectileSpeed: 80, warhead: { none: 60, flak: 60, plate: 75, light: 100, heavy: 60, concrete: 30 }, splash: 32 },
  },
  {
    id: 'rhino',
    name: '犀牛坦克',
    side: 'soviet',
    domain: 'vehicle',
    cost: 900,
    hp: 400,
    armor: 'heavy',
    buildTime: 75,
    builtBy: 'warfactory',
    prerequisites: ['warfactory'],
    speed: 32,
    rot: 10,
    sight: 6,
    weapon: { name: '120mm炮', damage: 65, range: 5 * 256, cooldown: 45, projectileSpeed: 70, warhead: { none: 60, flak: 60, plate: 80, light: 100, heavy: 70, concrete: 30 }, splash: 36 },
  },
  {
    id: 'flaktrak',
    name: '防空履带车',
    side: 'soviet',
    domain: 'vehicle',
    cost: 500,
    hp: 200,
    armor: 'light',
    buildTime: 50,
    builtBy: 'warfactory',
    prerequisites: ['warfactory'],
    speed: 44,
    rot: 16,
    sight: 6,
    weapon: { name: '高射炮', damage: 30, range: 6 * 256, cooldown: 12, projectileSpeed: 120, warhead: { none: 100, flak: 100, plate: 70, light: 60, heavy: 20 }, splash: 16 },
  },
  // —— 攻城车（远程高溅射，脆皮慢速；攻坚利器） ——
  {
    id: 'arty',
    name: '英军大炮',
    side: 'allied',
    domain: 'vehicle',
    cost: 1000,
    hp: 150,
    armor: 'light',
    buildTime: 90,
    builtBy: 'warfactory',
    prerequisites: ['warfactory'],
    speed: 20,
    rot: 8,
    sight: 10,
    deployTime: 45,
    weapon: {
      name: 'Tactical missile',
      damage: 160,
      range: 400 * 256,
      minRange: 8 * 256,
      cooldown: 225,
      projectileSpeed: 280,
      warhead: { none: 100, flak: 90, plate: 100, light: 80, heavy: 60, concrete: 120 },
      splash: 96,
      role: 'missile',
      targetDomains: ['infantry', 'vehicle', 'building'],
    },
  },
  {
    id: 'v3',
    name: 'V3 火箭车',
    side: 'soviet',
    domain: 'vehicle',
    cost: 1100,
    hp: 150,
    armor: 'light',
    buildTime: 95,
    builtBy: 'warfactory',
    prerequisites: ['warfactory'],
    speed: 18,
    rot: 8,
    sight: 9,
    weapon: { name: 'V3 火箭', damage: 130, range: 9 * 256, cooldown: 90, projectileSpeed: 40, warhead: { none: 100, flak: 90, plate: 100, light: 75, heavy: 50, concrete: 100 }, splash: 60 },
  },
  // —— 高级单位（需作战实验室）。数值偏保守，便于后续按手感微调 ——
  {
    id: 'prism',
    name: '光棱坦克',
    side: 'allied',
    domain: 'vehicle',
    cost: 1400,
    hp: 230,
    armor: 'light',
    buildTime: 80,
    builtBy: 'warfactory',
    prerequisites: ['battlelab'],
    speed: 32,
    rot: 10,
    sight: 8,
    weapon: { name: '光棱', damage: 90, range: 7 * 256, cooldown: 50, projectileSpeed: 0, warhead: { none: 90, flak: 80, plate: 100, light: 90, heavy: 55, concrete: 120 }, splash: 24 },
  },
  {
    id: 'apocalypse',
    name: '天启坦克',
    side: 'soviet',
    domain: 'vehicle',
    cost: 1750,
    hp: 800,
    armor: 'heavy',
    buildTime: 100,
    builtBy: 'warfactory',
    prerequisites: ['battlelab'],
    speed: 22,
    rot: 6,
    sight: 6,
    weapon: { name: '双管加农炮', damage: 110, range: 5 * 256, cooldown: 45, projectileSpeed: 70, warhead: { none: 60, flak: 60, plate: 85, light: 100, heavy: 90, concrete: 75 }, splash: 34 },
  },
  {
    id: 'fighter',
    name: '战斗机',
    side: 'allied',
    domain: 'aircraft',
    cost: 1200,
    hp: 220,
    armor: 'light',
    buildTime: 80,
    builtBy: 'airbase',
    prerequisites: ['airbase'],
    speed: 70,
    rot: 24,
    sight: 8,
    weapon: { name: '航弹', damage: 65, range: 2 * 256, cooldown: 36, projectileSpeed: 100, warhead: { none: 80, flak: 80, plate: 90, light: 100, heavy: 70, concrete: 45 }, splash: 48, role: 'bomb', targetDomains: ['infantry', 'vehicle', 'building'] },
    antiAirWeapon: { name: '空空导弹', damage: 55, range: 16 * 256, cooldown: 28, projectileSpeed: 150, warhead: { none: 40, flak: 85, plate: 75, light: 115, heavy: 45, concrete: 10 }, splash: 0, role: 'missile', targetDomains: ['aircraft'] },
  },
  // —— 战术导弹发射车（TEL）：远程压制，需展开→发射→收起→转移 ——
  {
    id: 'tel',
    name: '战术导弹车',
    side: 'soviet',
    domain: 'vehicle',
    cost: 1500,
    hp: 200,
    armor: 'light',
    buildTime: 100,
    builtBy: 'warfactory',
    prerequisites: [],
    speed: 14,
    rot: 6,
    sight: 8,
    deployTime: 60,
    weapon: {
      name: '战术弹道导弹',
      damage: 180,
      range: 180 * 256,
      cooldown: 225,
      projectileSpeed: 1200,
      warhead: { none: 100, flak: 90, plate: 100, light: 80, heavy: 60, concrete: 120 },
      splash: 80,
      role: 'missile',
      targetDomains: ['infantry', 'vehicle', 'building'],
    },
  },
];

export function buildRules(units: UnitType[] = UNIT_LIST): RulesData {
  const map = new Map<string, UnitType>();
  for (const u of units) map.set(u.id, u);
  return {
    units: map,
    resolveVerses: (warhead) => ({ ...FULL, ...warhead }),
  };
}

/** 默认内置规则。 */
export const DEFAULT_RULES = buildRules();

/** 某建筑能生产的单位（按出现顺序，供建造栏）。 */
export function producibleBy(rules: RulesData, buildingId: string): UnitType[] {
  const out: UnitType[] = [];
  for (const u of rules.units.values()) {
    if (u.builtBy === buildingId) out.push(u);
  }
  return out;
}
