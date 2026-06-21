import { describe, expect, it } from 'vitest';
import { playerColorForOwner } from './player-colors';

describe('playerColorForOwner', () => {
  it('uses yellow for the local player and red for the first bot opponent', () => {
    expect(playerColorForOwner(1)).toBe(0xf8d020);
    expect(playerColorForOwner(2)).toBe(0xe04030);
  });
});
