import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { ThreeCameraController } from './three-camera';

function fakeRenderer(width = 1280, height = 720): { domElement: HTMLElement } {
  return {
    domElement: {
      clientWidth: width,
      clientHeight: height,
      getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    } as HTMLElement,
  };
}

describe('ThreeCameraController', () => {
  it('starts with a high, broad RTS camera instead of a close isometric angle', () => {
    const camera = new ThreeCameraController(fakeRenderer() as never, 64, 64);

    expect(camera.camera).toBeInstanceOf(PerspectiveCamera);
    expect(camera.camera.position.x).toBeCloseTo(63, 4);
    expect(camera.camera.position.y).toBeCloseTo(72, 4);
    expect(camera.camera.position.z).toBeCloseTo(183, 4);
    expect((camera.camera as PerspectiveCamera).fov).toBe(34);
  });

  it('keeps more map visible when zooming out', () => {
    const camera = new ThreeCameraController(fakeRenderer() as never, 64, 64);

    for (let i = 0; i < 20; i++) camera.zoomAt(1);

    expect(camera.camera.position.z).toBeCloseTo(249, 4);
  });

  it('zooms in close enough to inspect object details', () => {
    const camera = new ThreeCameraController(fakeRenderer() as never, 64, 64);

    for (let i = 0; i < 20; i++) camera.zoomAt(-1);

    expect(camera.camera.position.y).toBeLessThanOrEqual(25);
  });

  it('keeps the initial broad view inside the map horizontally', () => {
    const camera = new ThreeCameraController(fakeRenderer() as never, 64, 64);

    camera.focus(24, 24);

    expect(camera.camera.position.x).toBeCloseTo(24, 4);
  });
});
