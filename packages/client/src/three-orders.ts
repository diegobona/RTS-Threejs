import type { Command, GroundFormation } from '@ra2web/game';

export type GroundMoveMode = 'move' | 'attackMove';

interface RightClickOrderInput {
  selectedIds: readonly number[];
  combatIds: readonly number[];
  groundAttackIds?: readonly number[];
  target: { id: number; owner: number } | null;
  localPlayerId: number;
  cell: { x: number; y: number } | null;
  groundMode?: GroundMoveMode;
  formation?: GroundFormation;
}

export function rightClickCommand(input: RightClickOrderInput): Command | null {
  const selectedIds = [...input.selectedIds].sort((a, b) => a - b);
  if (selectedIds.length === 0) return null;
  const combatIds = [...input.combatIds].sort((a, b) => a - b);
  const withFormation = <T extends Command>(cmd: T): T => (
    input.formation ? { ...cmd, formation: input.formation } as T : cmd
  );
  if (input.target && input.target.owner !== input.localPlayerId && combatIds.length > 0) {
    if (input.groundMode === 'attackMove' && input.cell) {
      return withFormation({ kind: 'attackMove', entityIds: combatIds, cellX: input.cell.x, cellY: input.cell.y, targetId: input.target.id });
    }
    return { kind: 'attack', entityIds: combatIds, targetId: input.target.id };
  }
  if (!input.cell) return null;
  if (input.groundMode === 'attackMove' && combatIds.length > 0) {
    return withFormation({ kind: 'attackMove', entityIds: combatIds, cellX: input.cell.x, cellY: input.cell.y });
  }
  return withFormation({ kind: 'move', entityIds: selectedIds, cellX: input.cell.x, cellY: input.cell.y });
}
