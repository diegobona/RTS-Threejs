import { describe, expect, it } from 'vitest';
import { WW1_MODEL_SPECS, ww1ModelSpec } from './ww1-model-manifest';

describe('WW1 3D model manifest', () => {
  it('maps gameplay typeIds to stable GLB asset paths', () => {
    expect(Object.fromEntries(WW1_MODEL_SPECS.map((spec) => [spec.typeId, spec.src]))).toEqual({
      conyard: '/ww1/models/conyard-hq.glb',
      barracks: '/ww1/models/barracks-british.glb',
      warfactory: '/ww1/models/warfactory-british.glb',
      airbase: '/ww1/models/airbase-british.glb',
      pillbox: '/ww1/models/pillbox-british.glb',
      gi: '/ww1/models/infantry-british.glb',
      grizzly: '/ww1/models/tank-british.glb',
      arty: '/ww1/models/artillery-british.glb',
      fighter: '/ww1/models/fighter-british.glb',
    });
  });

  it('looks up a single model spec by typeId', () => {
    expect(ww1ModelSpec('warfactory')?.src).toBe('/ww1/models/warfactory-british.glb');
    expect(ww1ModelSpec('unknown')).toBeUndefined();
  });

  it('keeps per-model transform overrides for generated building assets', () => {
    expect(ww1ModelSpec('barracks')).toMatchObject({ yawDeg: 0, scale: 2.9 });
    expect(ww1ModelSpec('warfactory')).toMatchObject({ yawDeg: 0, scale: 2.9 });
    expect(ww1ModelSpec('airbase')).toMatchObject({ yawDeg: 0, scale: 2 });
  });

  it('doubles every shipped GLB model by default for the 3D view', () => {
    for (const spec of WW1_MODEL_SPECS) {
      expect(spec.scale).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps placed building GLBs grid-aligned without runtime yaw', () => {
    for (const typeId of ['conyard', 'barracks', 'warfactory', 'airbase', 'pillbox']) {
      expect(ww1ModelSpec(typeId)?.yawDeg ?? 0).toBe(0);
    }
  });

  it('adds local yaw compensation for movable Blender GLBs so their front follows Entity.facing', () => {
    for (const typeId of ['gi', 'arty', 'fighter']) {
      expect(ww1ModelSpec(typeId)).toMatchObject({ yawDeg: -90 });
    }
    expect(ww1ModelSpec('grizzly')).toMatchObject({ yawDeg: 90 });
  });
});
