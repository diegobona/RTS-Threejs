import { describe, expect, it } from 'vitest';

import { PLAYER_COLORS, playerColorForOwner } from './placeholder-art';

describe('playerColorForOwner', () => {
  it('maps owners to the same palette used for faction accents', () => {
    expect(playerColorForOwner(1)).toBe(PLAYER_COLORS[0]);
    expect(playerColorForOwner(2)).toBe(PLAYER_COLORS[1]);
    expect(playerColorForOwner(PLAYER_COLORS.length + 1)).toBe(PLAYER_COLORS[0]);
  });
});
