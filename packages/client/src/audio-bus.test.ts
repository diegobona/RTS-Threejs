import { describe, expect, it } from 'vitest';
import { AudioBus, SYNTHETIC_BOMB_SFX, SYNTHETIC_WEAPON_SFX } from './audio-bus';

describe('AudioBus battle ambience', () => {
  it('can be requested before browser audio is unlocked and stopped later', () => {
    const bus = new AudioBus();

    bus.startBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(true);

    bus.stopBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(false);
  });

  it('uses weighty ballistic layers for gun and cannon fire instead of toy-like blips', () => {
    expect(SYNTHETIC_WEAPON_SFX.fire.usesTonalBlip).toBe(false);
    expect(SYNTHETIC_WEAPON_SFX.cannon.usesTonalBlip).toBe(false);
    expect(SYNTHETIC_WEAPON_SFX.fire.noiseLayers).toBeGreaterThanOrEqual(2);
    expect(SYNTHETIC_WEAPON_SFX.cannon.noiseLayers).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.noiseLayers);
    expect(SYNTHETIC_WEAPON_SFX.cannon.lowPunchGain).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.lowPunchGain);
    expect(SYNTHETIC_WEAPON_SFX.cannon.tailMs).toBeGreaterThan(SYNTHETIC_WEAPON_SFX.fire.tailMs);
  });

  it('keeps aircraft bomb drops restrained without a long falling whistle', () => {
    expect(SYNTHETIC_BOMB_SFX.dropCueGain).toBeLessThanOrEqual(0.14);
    expect(SYNTHETIC_BOMB_SFX.whistleMs).toBeLessThanOrEqual(180);
    expect(SYNTHETIC_BOMB_SFX.whistleGain).toBeLessThanOrEqual(0.05);
    expect(SYNTHETIC_BOMB_SFX.airRushMs).toBeLessThanOrEqual(260);
    expect(SYNTHETIC_BOMB_SFX.bodyGain).toBeGreaterThanOrEqual(SYNTHETIC_BOMB_SFX.dropCueGain);
  });
});
