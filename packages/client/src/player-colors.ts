export const PLAYER_COLORS = [0xf8d020, 0xe04030, 0x30c040, 0x3a7fe0, 0xd060d0, 0xe08020, 0x40c0c0, 0xc0c0c0];

export function playerColorForOwner(owner: number): number {
  const count = PLAYER_COLORS.length;
  const index = (((owner - 1) % count) + count) % count;
  return PLAYER_COLORS[index] ?? 0xc0c0c0;
}
