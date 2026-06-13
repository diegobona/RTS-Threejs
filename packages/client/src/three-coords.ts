export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export const THREE_CELL_SIZE = 2;

export function cellToWorld3D(cellX: number, cellY: number): Vector3Like {
  return {
    x: cellX * THREE_CELL_SIZE,
    y: 0,
    z: cellY * THREE_CELL_SIZE,
  };
}

export function leptonToWorld3D(x: number, y: number): Vector3Like {
  return {
    x: (x / 256) * THREE_CELL_SIZE,
    y: 0,
    z: (y / 256) * THREE_CELL_SIZE,
  };
}

export function worldToCell3D(x: number, z: number): { x: number; y: number } {
  return {
    x: Math.floor(x / THREE_CELL_SIZE + 0.5),
    y: Math.floor(z / THREE_CELL_SIZE + 0.5),
  };
}

export function cellCenterToWorld3D(cellX: number, cellY: number): Vector3Like {
  return cellToWorld3D(cellX, cellY);
}
