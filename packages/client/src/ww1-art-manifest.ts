export interface Ww1SpriteSpec {
  typeId: string;
  src: string;
  scale: number;
  spriteAnchorX: number;
  spriteAnchorY: number;
}

export const WW1_BUILDING_ART: readonly Ww1SpriteSpec[] = [
  { typeId: 'conyard', src: '/ww1/conyard-hq.png', scale: 0.16, spriteAnchorX: 0.5, spriteAnchorY: 0.82 },
  { typeId: 'barracks', src: '/ww1/barracks-british.png', scale: 0.13, spriteAnchorX: 0.5, spriteAnchorY: 0.82 },
  { typeId: 'warfactory', src: '/ww1/warfactory-british.png', scale: 0.15, spriteAnchorX: 0.5, spriteAnchorY: 0.82 },
  { typeId: 'pillbox', src: '/ww1/pillbox-british.png', scale: 0.09, spriteAnchorX: 0.5, spriteAnchorY: 0.82 },
];

export const WW1_UNIT_ART: readonly Ww1SpriteSpec[] = [
  { typeId: 'gi', src: '/ww1/infantry-british.png', scale: 0.045, spriteAnchorX: 0.5, spriteAnchorY: 0.9 },
  { typeId: 'grizzly', src: '/ww1/tank-british.png', scale: 0.07, spriteAnchorX: 0.5, spriteAnchorY: 0.72 },
  { typeId: 'arty', src: '/ww1/artillery-british.png', scale: 0.07, spriteAnchorX: 0.5, spriteAnchorY: 0.72 },
];

export function ww1ArtSrc(typeId: string): string | undefined {
  return [...WW1_BUILDING_ART, ...WW1_UNIT_ART].find((entry) => entry.typeId === typeId)?.src;
}
