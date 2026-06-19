import { describe, expect, it } from 'vitest';
import { BGM_ENABLED, BGM_EPIC_PROFILE, BGM_MATCH_VOLUME, BGM_MENU_VOLUME, BGM_SOURCE } from './bgm';

describe('BGM configuration', () => {
  it('keeps game background music disabled', () => {
    expect(BGM_ENABLED).toBe(false);
    expect(BGM_SOURCE).toBe('');
    expect(BGM_EPIC_PROFILE).toBe('disabled');
    expect(BGM_MENU_VOLUME).toBe(0);
    expect(BGM_MATCH_VOLUME).toBe(0);
  });
});
