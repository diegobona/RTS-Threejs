import type { Command } from '@ra2web/game';

export type GroundMoveMode = 'move' | 'attackMove';

interface RightClickOrderInput {
  selectedIds: readonly number[];
  combatIds: readonly number[];
  groundAttackIds?: readonly number[];
  target: { id: number; owner: number } | null;
  localPlayerId: number;
  cell: { x: number; y: number } | null;
  groundMode?: GroundMoveMode;
}

export function rightClickCommand(input: RightClickOrderInput): Command | null {
  const selectedIds = [...input.selectedIds].sort((a, b) => a - b);
  if (selectedIds.length === 0) return null;
  const combatIds = [...input.combatIds].sort((a, b) => a - b);
  if (input.target && input.target.owner !== input.localPlayerId && combatIds.length > 0) {
    if (input.groundMode === 'attackMove' && input.cell) {
      return { kind: 'attackMove', entityIds: combatIds, cellX: input.cell.x, cellY: input.cell.y, targetId: input.target.id };
    }
    return { kind: 'attack', entityIds: combatIds, targetId: input.target.id };
  }
  if (!input.cell) return null;
  if (input.groundMode === 'attackMove' && combatIds.length > 0) {
    return { kind: 'attackMove', entityIds: combatIds, cellX: input.cell.x, cellY: input.cell.y };
  }
  return { kind: 'move', entityIds: selectedIds, cellX: input.cell.x, cellY: input.cell.y };
}
