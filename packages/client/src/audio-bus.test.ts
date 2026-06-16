import { describe, expect, it } from 'vitest';
import { AudioBus } from './audio-bus';

describe('AudioBus battle ambience', () => {
  it('can be requested before browser audio is unlocked and stopped later', () => {
    const bus = new AudioBus();

    bus.startBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(true);

    bus.stopBattleAmbience();
    expect(bus.isBattleAmbienceWanted).toBe(false);
  });
});
