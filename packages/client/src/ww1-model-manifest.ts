export interface Ww1ModelSpec {
  typeId: string;
  src: string;
  yawDeg?: number;
  scale?: number;
}

export const WW1_MODEL_SPECS: readonly Ww1ModelSpec[] = [
  { typeId: 'conyard', src: '/ww1/models/conyard-hq.glb', scale: 2 },
  { typeId: 'barracks', src: '/ww1/models/barracks-british.glb', yawDeg: 0, scale: 2.9 },
  { typeId: 'warfactory', src: '/ww1/models/warfactory-british.glb', yawDeg: 0, scale: 2.9 },
  { typeId: 'pillbox', src: '/ww1/models/pillbox-british.glb', scale: 2 },
  { typeId: 'gi', src: '/ww1/models/infantry-british.glb', scale: 2 },
  { typeId: 'grizzly', src: '/ww1/models/tank-british.glb', scale: 2 },
  { typeId: 'arty', src: '/ww1/models/artillery-british.glb', scale: 2 },
];

export function ww1ModelSpec(typeId: string): Ww1ModelSpec | undefined {
  return WW1_MODEL_SPECS.find((spec) => spec.typeId === typeId);
}
