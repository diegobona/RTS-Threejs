import { describe, expect, it } from 'vitest';
import { WW1_BUILDING_ART, WW1_UNIT_ART } from './ww1-art-manifest';

const byId = (art: readonly { typeId: string; src: string }[]): Record<string, string> =>
  Object.fromEntries(art.map((entry) => [entry.typeId, entry.src]));

describe('WWI art manifest', () => {
  it('maps the generated British building art to the game type ids', () => {
    expect(byId(WW1_BUILDING_ART)).toMatchObject({
      conyard: '/ww1/conyard-hq.png',
      barracks: '/ww1/barracks-british.png',
      warfactory: '/ww1/warfactory-british.png',
      pillbox: '/ww1/pillbox-british.png',
    });
  });

  it('maps the generated British unit art to the game type ids', () => {
    expect(byId(WW1_UNIT_ART)).toMatchObject({
      gi: '/ww1/infantry-british.png',
      grizzly: '/ww1/tank-british.png',
      arty: '/ww1/artillery-british.png',
    });
  });
});
