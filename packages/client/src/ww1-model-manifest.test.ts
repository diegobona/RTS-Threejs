import { describe, expect, it } from 'vitest';
import { WW1_MODEL_SPECS, ww1ModelSpec } from './ww1-model-manifest';

describe('WW1 3D model manifest', () => {
  it('maps gameplay typeIds to stable GLB asset paths', () => {
    expect(Object.fromEntries(WW1_MODEL_SPECS.map((spec) => [spec.typeId, spec.src]))).toEqual({
      pillbox: '/ww1/models/pillbox-british.glb',
      arty: '/ww1/models/artillery-british.glb',
    });
  });

  it('looks up a single model spec by typeId', () => {
    expect(ww1ModelSpec('arty')?.src).toBe('/ww1/models/artillery-british.glb');
    expect(ww1ModelSpec('unknown')).toBeUndefined();
  });

  it('keeps per-model transform overrides for generated building assets', () => {
    expect(ww1ModelSpec('pillbox')).toMatchObject({ scale: 2 });
  });

  it('doubles every shipped GLB model by default for the 3D view', () => {
    for (const spec of WW1_MODEL_SPECS) {
      expect(spec.scale).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps placed building GLBs grid-aligned without runtime yaw', () => {
    for (const typeId of ['pillbox']) {
      expect(ww1ModelSpec(typeId)?.yawDeg ?? 0).toBe(0);
    }
  });

  it('adds local yaw compensation for movable Blender GLBs so their front follows Entity.facing', () => {
    expect(ww1ModelSpec('arty')).toMatchObject({ yawDeg: -90 });
  });

  it('uses a procedural low-poly model for the strike fighter preview', () => {
    expect(ww1ModelSpec('fighter')).toBeUndefined();
  });

  it('uses procedural low-poly models for early base buildings', () => {
    expect(ww1ModelSpec('conyard')).toBeUndefined();
    expect(ww1ModelSpec('barracks')).toBeUndefined();
    expect(ww1ModelSpec('warfactory')).toBeUndefined();
    expect(ww1ModelSpec('airbase')).toBeUndefined();
    expect(ww1ModelSpec('gi')).toBeUndefined();
    expect(ww1ModelSpec('grizzly')).toBeUndefined();
    expect(ww1ModelSpec('refinery')).toBeUndefined();
    expect(ww1ModelSpec('powerplant')).toBeUndefined();
    expect(ww1ModelSpec('harvester')).toBeUndefined();
  });
});
