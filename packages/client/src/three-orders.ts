import type { Command } from '@ra2web/game';

interface RightClickOrderInput {
  selectedIds: readonly number[];
  combatIds: readonly number[];
  target: { id: number; owner: number } | null;
  localPlayerId: number;
  cell: { x: number; y: number } | null;
}

export function rightClickCommand(input: RightClickOrderInput): Command | null {
  const selectedIds = [...input.selectedIds].sort((a, b) => a - b);
  if (selectedIds.length === 0) return null;
  const combatIds = [...input.combatIds].sort((a, b) => a - b);
  if (input.target && input.target.owner !== input.localPlayerId && combatIds.length > 0) {
    return { kind: 'attack', entityIds: combatIds, targetId: input.target.id };
  }
  if (!input.cell) return null;
  return { kind: 'move', entityIds: selectedIds, cellX: input.cell.x, cellY: input.cell.y };
}
