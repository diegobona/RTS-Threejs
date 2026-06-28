import { describe, expect, it } from 'vitest';
import { rightClickCommand } from './three-orders';

describe('3D right-click orders', () => {
  it('attacks an enemy target with selected combat units', () => {
    expect(
      rightClickCommand({
        selectedIds: [7, 3],
        combatIds: [7],
        target: { id: 42, owner: 2 },
        localPlayerId: 1,
        cell: { x: 10, y: 12 },
      }),
    ).toEqual({ kind: 'attack', entityIds: [7], targetId: 42 });
  });

  it('attack-moves toward an enemy target when the ground mode says to fight on contact', () => {
    expect(
      rightClickCommand({
        selectedIds: [7, 3],
        combatIds: [7],
        target: { id: 42, owner: 2 },
        localPlayerId: 1,
        cell: { x: 10, y: 12 },
        groundMode: 'attackMove',
      }),
    ).toEqual({ kind: 'attackMove', entityIds: [7], cellX: 10, cellY: 12, targetId: 42 });
  });

  it('moves all selected units when right-clicking ground or a friendly target', () => {
    expect(
      rightClickCommand({
        selectedIds: [7, 3],
        combatIds: [7],
        target: { id: 5, owner: 1 },
        localPlayerId: 1,
        cell: { x: 10, y: 12 },
      }),
    ).toEqual({ kind: 'move', entityIds: [3, 7], cellX: 10, cellY: 12 });
  });

  it('attack-moves selected combat units when the ground mode says to fight on contact', () => {
    expect(
      rightClickCommand({
        selectedIds: [7, 3],
        combatIds: [7, 3],
        target: null,
        localPlayerId: 1,
        cell: { x: 10, y: 12 },
        groundMode: 'attackMove',
      }),
    ).toEqual({ kind: 'attackMove', entityIds: [3, 7], cellX: 10, cellY: 12 });
  });

  it('moves selected missile trucks when right-clicking empty ground', () => {
    expect(
      rightClickCommand({
        selectedIds: [9, 7],
        combatIds: [9, 7],
        groundAttackIds: [9],
        target: null,
        localPlayerId: 1,
        cell: { x: 24, y: 18 },
      }),
    ).toEqual({ kind: 'move', entityIds: [7, 9], cellX: 24, cellY: 18 });
  });

  it('falls back to movement when selected units cannot attack', () => {
    expect(
      rightClickCommand({
        selectedIds: [9],
        combatIds: [],
        target: { id: 42, owner: 2 },
        localPlayerId: 1,
        cell: { x: 6, y: 8 },
      }),
    ).toEqual({ kind: 'move', entityIds: [9], cellX: 6, cellY: 8 });
  });
});
