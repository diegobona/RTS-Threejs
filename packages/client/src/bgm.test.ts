import { describe, expect, it } from 'vitest';
import { BGM_MATCH_VOLUME, BGM_MENU_VOLUME, BGM_SOURCE } from './bgm';

describe('BGM configuration', () => {
  it('uses the new original epic war music asset at a mix-friendly battle volume', () => {
    expect(BGM_SOURCE).toBe('/bgm.wav');
    expect(BGM_MENU_VOLUME).toBeGreaterThan(BGM_MATCH_VOLUME);
    expect(BGM_MATCH_VOLUME).toBeLessThanOrEqual(0.38);
  });
});
