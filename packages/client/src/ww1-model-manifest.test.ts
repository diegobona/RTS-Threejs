import { describe, expect, it } from 'vitest';
import { WW1_MODEL_SPECS, ww1ModelSpec } from './ww1-model-manifest';

describe('WW1 3D model manifest', () => {
  it('maps gameplay typeIds to stable GLB asset paths', () => {
    expect(Object.fromEntries(WW1_MODEL_SPECS.map((spec) => [spec.typeId, spec.src]))).toEqual({
      conyard: '/ww1/models/conyard-hq.glb',
      barracks: '/ww1/models/barracks-british.glb',
      warfactory: '/ww1/models/warfactory-british.glb',
      pillbox: '/ww1/models/pillbox-british.glb',
      gi: '/ww1/models/infantry-british.glb',
      grizzly: '/ww1/models/tank-british.glb',
      arty: '/ww1/models/artillery-british.glb',
    });
  });

  it('looks up a single model spec by typeId', () => {
    expect(ww1ModelSpec('warfactory')?.src).toBe('/ww1/models/warfactory-british.glb');
    expect(ww1ModelSpec('unknown')).toBeUndefined();
  });

  it('keeps per-model transform overrides for generated building assets', () => {
    expect(ww1ModelSpec('barracks')).toMatchObject({ yawDeg: 0, scale: 2.9 });
    expect(ww1ModelSpec('warfactory')).toMatchObject({ yawDeg: 0, scale: 2.9 });
  });

  it('doubles every shipped GLB model by default for the 3D view', () => {
    for (const spec of WW1_MODEL_SPECS) {
      expect(spec.scale).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not add runtime yaw to Blender-aligned GLB models', () => {
    for (const spec of WW1_MODEL_SPECS) {
      expect(spec.yawDeg ?? 0).toBe(0);
    }
  });
});
