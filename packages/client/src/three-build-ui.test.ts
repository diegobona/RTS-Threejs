import { describe, expect, it } from 'vitest';
import type { ProductionQueue, UnitType } from '@ra2web/game';
import { buildingButtonState } from './three-build-ui';

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

describe('3D building button state', () => {
  it('shows an unavailable building as disabled with its cost', () => {
    expect(buildingButtonState(barracks, false, undefined, null)).toEqual({
      disabled: true,
      progressText: '$500',
      ready: false,
      activePlace: false,
    });
  });

  it('shows progress for the building queue head', () => {
    const queue: ProductionQueue = { items: ['barracks'], progress: 38, readyToPlace: false };

    expect(buildingButtonState(barracks, true, queue, null)).toMatchObject({
      disabled: false,
      progressText: '50%',
      ready: false,
      activePlace: false,
    });
  });

  it('marks a completed building as ready and active when it is being placed', () => {
    const queue: ProductionQueue = { items: ['barracks'], progress: 75, readyToPlace: true };

    expect(buildingButtonState(barracks, true, queue, 'barracks')).toEqual({
      disabled: false,
      progressText: 'Ready',
      ready: true,
      activePlace: true,
    });
  });
});
