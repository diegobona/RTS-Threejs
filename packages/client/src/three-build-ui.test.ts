import { describe, expect, it } from 'vitest';
import type { ProductionQueue, UnitType } from '@ra2web/game';
import { productionButtonState } from './three-build-ui';

const barracks: UnitType = {
  id: 'barracks',
  name: 'British Barracks',
  side: 'allied',
  domain: 'building',
  cost: 500,
  hp: 800,
  armor: 'concrete',
  buildTime: 75,
  builtBy: 'conyard',
  prerequisites: ['powerplant'],
  speed: 0,
  rot: 0,
  sight: 4,
  building: { footprintW: 2, footprintH: 2, power: -20 },
};

const infantry: UnitType = {
  id: 'gi',
  name: 'British Soldier',
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
};

describe('3D building button state', () => {
  it('shows an unavailable building as disabled with its cost', () => {
    expect(productionButtonState(barracks, false, undefined, null)).toEqual({
      disabled: true,
      progressText: '$500',
      ready: false,
      activePlace: false,
    });
  });

  it('marks a queued building as placeable immediately instead of showing queue progress', () => {
    const queue: ProductionQueue = { items: ['barracks'], progress: 0, readyToPlace: true };

    expect(productionButtonState(barracks, true, queue, null)).toMatchObject({
      disabled: false,
      progressText: 'Place',
      ready: true,
      activePlace: false,
    });
  });

  it('marks a queued building as active when it is being placed', () => {
    const queue: ProductionQueue = { items: ['barracks'], progress: 0, readyToPlace: true };

    expect(productionButtonState(barracks, true, queue, 'barracks')).toEqual({
      disabled: false,
      progressText: 'Placing',
      ready: true,
      activePlace: true,
    });
  });

  it('shows progress for infantry and vehicle production queues', () => {
    const queue: ProductionQueue = { items: ['gi'], progress: 9, readyToPlace: false };

    expect(productionButtonState(infantry, true, queue, null)).toMatchObject({
      disabled: false,
      progressText: '30%',
      ready: false,
    });
  });

  it('shows queued count for non-head units in a category queue', () => {
    const queue: ProductionQueue = { items: ['gi', 'gi', 'gi'], progress: 4, readyToPlace: false };

    expect(productionButtonState(infantry, true, queue, null)).toMatchObject({
      disabled: false,
      progressText: '13%',
    });
  });
});
