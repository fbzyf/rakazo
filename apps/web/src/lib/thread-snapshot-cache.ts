import type { ThreadSnapshot } from "@rakazo/contracts";

/**
 * In-memory working set for sidebar bot switches.
 *
 * Thread snapshots carry the latest message page, so this stays smaller than
 * the computer-status cache (20). Eight covers a typical working set of
 * sidebar switches without retaining every bot opened in a long session.
 * Session-only: a reload still waits on threads.get.
 */
export const THREAD_SNAPSHOT_CACHE_LIMIT = 8;

export type ThreadSnapshotCache = Map<string, ThreadSnapshot>;

export function createThreadSnapshotCache(): ThreadSnapshotCache {
  return new Map();
}

/** True for a private bot transcript. Group threads are not cached (1a). */
export function isCacheableBotThread(
  snapshot: ThreadSnapshot | null | undefined,
): snapshot is ThreadSnapshot & { botId: string } {
  return Boolean(snapshot?.botId && !snapshot.groupId);
}

/**
 * Remember a bot thread. Same-thread writes with a lower cursor are ignored so
 * a late threads.get cannot store a snapshot that would later paint over newer
 * local/SSE state. Re-inserting updates LRU (least-recently-used first).
 */
export function putThreadSnapshot(
  cache: ThreadSnapshotCache,
  snapshot: ThreadSnapshot,
  limit = THREAD_SNAPSHOT_CACHE_LIMIT,
): ThreadSnapshot | undefined {
  if (!isCacheableBotThread(snapshot)) return undefined;
  const botId = snapshot.botId;
  const previous = cache.get(botId);
  const keepPrevious =
    previous && previous.threadId === snapshot.threadId && previous.cursor > snapshot.cursor;
  const stored = keepPrevious ? previous : snapshot;
  cache.delete(botId);
  cache.set(botId, stored);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return stored;
}

/** Read without changing LRU order. Safe during render. */
export function peekThreadSnapshot(
  cache: ThreadSnapshotCache,
  botId: string,
): ThreadSnapshot | undefined {
  return cache.get(botId);
}

/**
 * Transcript to show on this render when switching bots.
 * Prefers the live snapshot when it already belongs to the bot; otherwise the
 * cached last visit. A search jump should skip this and load the around-page.
 */
export function botThreadSnapshotForPaint(
  current: ThreadSnapshot | null,
  botId: string,
  cache: ThreadSnapshotCache,
): ThreadSnapshot | null {
  if (current?.botId === botId && !current.groupId) return current;
  return peekThreadSnapshot(cache, botId) ?? null;
}
