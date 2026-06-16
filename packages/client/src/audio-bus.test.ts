import { describe, expect, it } from 'vitest';
import {
  AudioBus,
  shouldPlayAlarm,
  shouldPlayEva,
  shouldPlaySfx,
  shouldPlayUiKey,
  shouldPlayVoice,
  SYNTHETIC_BOMB_SFX,
  SYNTHETIC_WEAPON_SFX,
} from './audio-bus';

describe('AudioBus battle ambience', () => {
  it('keeps battle ambience disabled because BGM now owns the background layer', () => {
    const bus = new AudioBus();

    bus.startBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(false);

    bus.stopBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(false);
  });

  it('allows only combat shots and building production feedback through the sfx bus', () => {
    expect(shouldPlaySfx('fire')).toBe(true);
    expect(shouldPlaySfx('cannon')).toBe(true);
    expect(shouldPlaySfx('bomb')).toBe(true);
    expect(shouldPlaySfx('build')).toBe(true);

    expect(shouldPlaySfx('ready')).toBe(false);
    expect(shouldPlaySfx('select')).toBe(false);
    expect(shouldPlaySfx('move')).toBe(false);
    expect(shouldPlaySfx('deny')).toBe(false);
    expect(shouldPlaySfx('place')).toBe(false);
    expect(shouldPlaySfx('hit')).toBe(false);
    expect(shouldPlaySfx('explosion')).toBe(false);
    expect(shouldPlaySfx('bigExplosion')).toBe(false);
  });

  it('allows only building-ready EVA and disables unit voice acknowledgements', () => {
    expect(shouldPlayEva('buildComplete')).toBe(true);
    expect(shouldPlayEva('attack')).toBe(false);
    expect(shouldPlayEva('lowPower')).toBe(false);
    expect(shouldPlayEva('noFunds')).toBe(false);
    expect(shouldPlayEva('unitLost')).toBe(false);
    expect(shouldPlayVoice()).toBe(false);
  });

  it('disables direct boot-screen alert and typing sounds', () => {
    expect(shouldPlayAlarm()).toBe(false);
    expect(shouldPlayUiKey()).toBe(false);
  });

  it('uses weighty ballistic layers for gun and cannon fire instead of toy-like blips', () => {
    expect(SYNTHETIC_WEAPON_SFX.fire.usesTonalBlip).toBe(false);
    expect(SYNTHETIC_WEAPON_SFX.cannon.usesTonalBlip).toBe(false);
    expect(SYNTHETIC_WEAPON_SFX.fire.noiseLayers).toBeGreaterThanOrEqual(2);
    expect(SYNTHETIC_WEAPON_SFX.cannon.noiseLayers).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.noiseLayers);
    expect(SYNTHETIC_WEAPON_SFX.cannon.lowPunchGain).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.lowPunchGain);
    expect(SYNTHETIC_WEAPON_SFX.cannon.tailMs).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.tailMs);
  });

  it('keeps aircraft bomb drops noise-based without a chirpy tonal cue', () => {
    expect(SYNTHETIC_BOMB_SFX.tonalLayers).toBe(0);
    expect(SYNTHETIC_BOMB_SFX.dropCueGain).toBe(0);
    expect(SYNTHETIC_BOMB_SFX.dropCueMs).toBe(0);
    expect(SYNTHETIC_BOMB_SFX.whistleMs).toBe(0);
    expect(SYNTHETIC_BOMB_SFX.whistleGain).toBe(0);
    expect(SYNTHETIC_BOMB_SFX.airRushMs).toBeLessThanOrEqual(260);
    expect(SYNTHETIC_BOMB_SFX.bodyGain).toBeGreaterThan(0);
  });
});
