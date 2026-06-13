import { describe, expect, it } from 'vitest';
import { cellToWorld3D, leptonToWorld3D, worldToCell3D } from './three-coords';

describe('three coordinate mapping', () => {
  it('round-trips cell centers through 3D world coordinates', () => {
    const cells: Array<[number, number]> = [
      [0, 0],
      [5, 6],
      [12, 14],
      [43, 43],
    ];
    for (const [x, y] of cells) {
      const world = cellToWorld3D(x, y);
      expect(worldToCell3D(world.x, world.z)).toEqual({ x, y });
    }
  });

  it('maps lepton positions to the same 3D plane as cell centers', () => {
    expect(leptonToWorld3D(5 * 256, 6 * 256)).toEqual(cellToWorld3D(5, 6));
  });
});
