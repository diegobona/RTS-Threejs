import { describe, expect, it } from 'vitest';
import { idsInScreenRect, nearestIdWithinRadius } from './three-selection';

describe('3D screen rectangle selection', () => {
  it('returns only ids inside the dragged rectangle', () => {
    const ids = idsInScreenRect(
      { x0: 100, y0: 100, x1: 260, y1: 220 },
      [
        { id: 1, x: 120, y: 120 },
        { id: 2, x: 250, y: 210 },
        { id: 3, x: 90, y: 120 },
        { id: 4, x: 180, y: 260 },
      ],
    );

    expect(ids).toEqual([1, 2]);
  });

  it('handles reverse drag direction', () => {
    const ids = idsInScreenRect(
      { x0: 260, y0: 220, x1: 100, y1: 100 },
      [
        { id: 1, x: 120, y: 120 },
        { id: 2, x: 270, y: 210 },
      ],
    );

    expect(ids).toEqual([1]);
  });

  it('finds the nearest point inside a click radius', () => {
    expect(
      nearestIdWithinRadius(
        { x: 100, y: 100 },
        [
          { id: 1, x: 130, y: 100 },
          { id: 2, x: 108, y: 106 },
          { id: 3, x: 180, y: 100 },
        ],
        32,
      ),
    ).toBe(2);
  });
});
