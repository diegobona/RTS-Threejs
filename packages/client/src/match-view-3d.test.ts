import { describe, expect, it } from 'vitest';
import { initialCameraFocus3D, PRODUCTION_CATEGORIES_3D } from './match-view-3d';

describe('MatchView3D camera defaults', () => {
  it('starts focused on the center of the map instead of the local spawn', () => {
    expect(initialCameraFocus3D(44, 44)).toEqual({ x: 43, z: 43 });
  });
});

describe('MatchView3D production tabs', () => {
  it('exposes an aircraft tab for airbase-built fighters', () => {
    expect(PRODUCTION_CATEGORIES_3D).toEqual(['building', 'infantry', 'vehicle', 'aircraft']);
  });
});
