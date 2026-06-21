import {
  PerspectiveCamera,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from 'three';

export class ThreeCameraController {
  readonly camera: PerspectiveCamera;
  private readonly groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly raycaster = new Raycaster();
  private readonly target = new Vector3();
  private readonly baseOffset = new Vector3(0, 72, 120);
  private readonly offset = new Vector3();
  private readonly maxX: number;
  private readonly maxZ: number;
  private distanceScale = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    mapW: number,
    mapH: number,
  ) {
    this.camera = new PerspectiveCamera(34, 1, 0.1, 1200);
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
    this.camera.aspect = w / h;
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
    const k = 0.06 * this.distanceScale;
    const right = new Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    up.y = 0;
    right.normalize();
    up.normalize();
    this.pan((-dx * right.x + dy * up.x) * k, (-dx * right.z + dy * up.z) * k);
  }

  zoomAt(delta: number): void {
    const next = this.distanceScale * (delta > 0 ? 1.12 : 0.9);
    this.distanceScale = Math.max(0.32, Math.min(1.55, next));
    this.apply();
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
    this.target.x = Math.max(0, Math.min(this.maxX, this.target.x));
    this.target.z = Math.max(0, Math.min(this.maxZ, this.target.z));
    this.offset.copy(this.baseOffset).multiplyScalar(this.distanceScale);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
