export interface Ww1ModelSpec {
  typeId: string;
  src: string;
  yawDeg?: number;
  scale?: number;
}

export const WW1_MODEL_SPECS: readonly Ww1ModelSpec[] = [
  { typeId: 'pillbox', src: '/ww1/models/pillbox-british.glb', scale: 2 },
  { typeId: 'arty', src: '/ww1/models/artillery-british.glb', yawDeg: -90, scale: 2 },
];

export function ww1ModelSpec(typeId: string): Ww1ModelSpec | undefined {
  return WW1_MODEL_SPECS.find((spec) => spec.typeId === typeId);
}
