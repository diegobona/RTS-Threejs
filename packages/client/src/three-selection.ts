export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ScreenPointWithId {
  id: number;
  x: number;
  y: number;
}

export function idsInScreenRect(rect: ScreenRect, points: readonly ScreenPointWithId[]): number[] {
  const minX = Math.min(rect.x0, rect.x1);
  const maxX = Math.max(rect.x0, rect.x1);
  const minY = Math.min(rect.y0, rect.y1);
  const maxY = Math.max(rect.y0, rect.y1);
  return points
    .filter((p) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)
    .map((p) => p.id)
    .sort((a, b) => a - b);
}

export function nearestIdWithinRadius(
  point: { x: number; y: number },
  points: readonly ScreenPointWithId[],
  radius: number,
): number | null {
  const maxD2 = radius * radius;
  let best: { id: number; d2: number } | null = null;
  for (const p of points) {
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxD2 && (!best || d2 < best.d2)) best = { id: p.id, d2 };
  }
  return best?.id ?? null;
}
