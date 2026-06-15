import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES } from './content';

describe('WWI British display names', () => {
  it('renames the replaced Allied buildings and units', () => {
    expect(DEFAULT_RULES.units.get('barracks')?.name).toBe('英军兵营');
    expect(DEFAULT_RULES.units.get('warfactory')?.name).toBe('英军战车工厂');
    expect(DEFAULT_RULES.units.get('pillbox')?.name).toBe('英军碉堡');
    expect(DEFAULT_RULES.units.get('gi')?.name).toBe('英国士兵');
    expect(DEFAULT_RULES.units.get('grizzly')?.name).toBe('英军坦克');
    expect(DEFAULT_RULES.units.get('arty')?.name).toBe('英军大炮');
  });
});

describe('WWI air force content', () => {
  it('defines an airbase that unlocks fighter production', () => {
    expect(DEFAULT_RULES.units.get('airbase')).toMatchObject({
      id: 'airbase',
      domain: 'building',
      builtBy: 'conyard',
      prerequisites: ['warfactory'],
      building: { footprintW: 3, footprintH: 2, provides: 'airbase' },
    });
    expect(DEFAULT_RULES.units.get('fighter')).toMatchObject({
      id: 'fighter',
      domain: 'aircraft',
      builtBy: 'airbase',
      prerequisites: ['airbase'],
    });
  });
});
