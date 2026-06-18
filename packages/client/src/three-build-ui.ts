import type { ProductionQueue, UnitType } from '@ra2web/game';

export interface ProductionButtonState {
  disabled: boolean;
  progressText: string;
  ready: boolean;
  activePlace: boolean;
}

export function productionButtonState(
  type: UnitType,
  canBuild: boolean,
  queue: ProductionQueue | undefined,
  placingTypeId: string | null,
): ProductionButtonState {
  const isHead = queue?.items[0] === type.id;
  const ready = !!isHead && queue.readyToPlace;
  let progressText = `$${type.cost}`;
  if (ready) {
    progressText = placingTypeId === type.id ? 'Placing' : 'Place';
  } else if (isHead && queue.items.length > 0) {
    const pct = type.buildTime > 0 ? Math.floor((queue.progress / type.buildTime) * 100) : 100;
    progressText = `${Math.max(0, Math.min(100, pct))}%`;
  } else if (queue) {
    const queued = queue.items.filter((id) => id === type.id).length;
    if (queued > 0) progressText = `x${queued}`;
  }

  return {
    disabled: !canBuild && !ready,
    progressText,
    ready,
    activePlace: placingTypeId === type.id,
  };
}

export const buildingButtonState = productionButtonState;
