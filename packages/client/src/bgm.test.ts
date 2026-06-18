import { describe, expect, it } from 'vitest';
import { BGM_EPIC_PROFILE, BGM_MATCH_VOLUME, BGM_MENU_VOLUME, BGM_SOURCE } from './bgm';

describe('BGM configuration', () => {
  it('uses a brighter war march music asset at a mix-friendly battle volume', () => {
    expect(BGM_SOURCE).toBe('/bgm.wav?v=bright-modern-war-march-v5');
    expect(BGM_EPIC_PROFILE).toBe('bright-modern-war-march-v5');
    expect(BGM_MENU_VOLUME).toBeGreaterThan(BGM_MATCH_VOLUME);
    expect(BGM_MATCH_VOLUME).toBeGreaterThanOrEqual(0.38);
    expect(BGM_MATCH_VOLUME).toBeLessThanOrEqual(0.46);
  });
});
