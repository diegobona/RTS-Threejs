import {
  OrthographicCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';

export class ThreeCameraController {
  readonly camera: OrthographicCamera;
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly raycaster = new Raycaster();
  private readonly target = new Vector3();
  private readonly offset = new Vector3(22, 26, 22);
  private readonly maxX: number;
  private readonly maxZ: number;
  private zoom = 10;

  constructor(
    private readonly renderer: WebGLRenderer,
    mapW: number,
    mapH: number,
  ) {
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.maxX = Math.max(0, (mapW - 1) * 2);
    this.maxZ = Math.max(0, (mapH - 1) * 2);
    this.target.set(this.maxX / 2, 0, this.maxZ / 2);
    this.applyResize();
    this.apply();
  }

  applyResize(): void {
    const canvas = this.renderer.domElement;
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    const aspect = w / h;
    this.camera.left = -this.zoom * aspect;
    this.camera.right = this.zoom * aspect;
    this.camera.top = this.zoom;
    this.camera.bottom = -this.zoom;
    this.camera.updateProjectionMatrix();
  }

  pan(dx: number, dz: number): void {
    this.target.x += dx;
    this.target.z += dz;
    this.apply();
  }

  focus(x: number, z: number): void {
    this.target.x = x;
    this.target.z = z;
    this.apply();
  }

  panByScreen(dx: number, dy: number): void {
    const k = 0.008 * this.zoom;
    this.pan((-dx + dy) * k, (-dx - dy) * k);
  }

  zoomAt(delta: number): void {
    const next = this.zoom * (delta > 0 ? 1.12 : 0.9);
    this.zoom = Math.max(4, Math.min(28, next));
    this.applyResize();
  }

  groundAt(clientX: number, clientY: number): Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ?? null;
  }

  private apply(): void {
    this.target.x = Math.max(-4, Math.min(this.maxX + 4, this.target.x));
    this.target.z = Math.max(-4, Math.min(this.maxZ + 4, this.target.z));
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
