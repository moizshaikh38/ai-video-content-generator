/** Check provider order before any sort can change the spoken text. No clock repair. */
export function reliableOrderedClocks(items: Array<{ start?: unknown; end?: unknown }>, tolerance = 0.08): boolean {
  let previousStart = -Infinity, previousEnd = -Infinity;
  return items.length > 0 && items.every(item => {
    const start = item?.start, end = item?.end;
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) return false;
    if (start < previousStart || start < previousEnd - tolerance) return false;
    previousStart = start; previousEnd = end; return true;
  });
}
