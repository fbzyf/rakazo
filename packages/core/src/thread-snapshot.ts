function equalValue(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") {
    return false;
  }
  if (Array.isArray(previous) || Array.isArray(next)) {
    return (
      Array.isArray(previous) &&
      Array.isArray(next) &&
      previous.length === next.length &&
      previous.every((value, index) => equalValue(value, next[index]))
    );
  }
  const previousRecord = previous as Record<string, unknown>;
  const nextRecord = next as Record<string, unknown>;
  const keys = Object.keys(previousRecord);
  return (
    keys.length === Object.keys(nextRecord).length &&
    keys.every(
      (key) => Object.hasOwn(nextRecord, key) && equalValue(previousRecord[key], nextRecord[key]),
    )
  );
}

/** Compare projected screen snapshots; the replay cursor stays current in the live ref. */
export function reconcileVisibleThreadSnapshot<T extends object>(
  previous: T | null,
  next: T | null,
): T | null {
  if (previous === next || !previous || !next) return next;
  const { cursor: _previousCursor, ...previousVisible } = previous as T & { cursor?: unknown };
  const { cursor: _nextCursor, ...nextVisible } = next as T & { cursor?: unknown };
  return equalValue(previousVisible, nextVisible) ? previous : next;
}
