import type { ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { reconcileRefreshedThread } from "./thread-events.js";
import {
  botThreadSnapshotForPaint,
  createThreadSnapshotCache,
  isCacheableBotThread,
  peekThreadSnapshot,
  putThreadSnapshot,
  THREAD_SNAPSHOT_CACHE_LIMIT,
} from "./thread-snapshot-cache.js";

describe("thread snapshot cache", () => {
  it("stores a private bot thread and paints it when the live snapshot is another bot", () => {
    const cache = createThreadSnapshotCache();
    const ada = snapshot("bot-ada", "Hello from Ada");
    const bob = snapshot("bot-bob", "Hello from Bob");

    putThreadSnapshot(cache, ada);
    expect(peekThreadSnapshot(cache, "bot-ada")).toEqual(ada);
    expect(botThreadSnapshotForPaint(bob, "bot-ada", cache)).toEqual(ada);
    expect(botThreadSnapshotForPaint(ada, "bot-ada", cache)).toBe(ada);
  });

  it("does not cache group threads", () => {
    const cache = createThreadSnapshotCache();
    const group: ThreadSnapshot = {
      ...snapshot("bot-ada", "in a group"),
      groupId: "group-1",
    };

    expect(isCacheableBotThread(group)).toBe(false);
    putThreadSnapshot(cache, group);
    expect(peekThreadSnapshot(cache, "bot-ada")).toBeUndefined();
    expect(botThreadSnapshotForPaint(null, "bot-ada", cache)).toBeNull();
  });

  it("keeps the newer cursor when a stale snapshot is put for the same thread", () => {
    const cache = createThreadSnapshotCache();
    const newer = snapshot("bot-ada", "new reply", 12);
    const stale = snapshot("bot-ada", "old reply", 8);

    putThreadSnapshot(cache, newer);
    expect(putThreadSnapshot(cache, stale)).toEqual(newer);
    expect(peekThreadSnapshot(cache, "bot-ada")?.cursor).toBe(12);
    expect(peekThreadSnapshot(cache, "bot-ada")?.messages[0]?.id).toBe("message-12");
  });

  it("replaces the cache when the bot's thread id changes", () => {
    const cache = createThreadSnapshotCache();
    putThreadSnapshot(cache, snapshot("bot-ada", "before clear", 4, "thread-old"));
    const cleared = snapshot("bot-ada", "fresh", 0, "thread-new");
    putThreadSnapshot(cache, cleared);
    expect(peekThreadSnapshot(cache, "bot-ada")).toEqual(cleared);
  });

  it("evicts the least-recently-written bot past the documented limit", () => {
    const cache = createThreadSnapshotCache();
    for (let index = 0; index < THREAD_SNAPSHOT_CACHE_LIMIT; index += 1) {
      putThreadSnapshot(cache, snapshot(`bot-${index}`, `hello ${index}`));
    }
    putThreadSnapshot(cache, snapshot("bot-ada", "newest"));
    expect(cache.size).toBe(THREAD_SNAPSHOT_CACHE_LIMIT);
    expect(peekThreadSnapshot(cache, "bot-0")).toBeUndefined();
    expect(peekThreadSnapshot(cache, "bot-ada")?.botId).toBe("bot-ada");
    expect(peekThreadSnapshot(cache, "bot-1")?.botId).toBe("bot-1");
  });

  it("lets a background reconcile keep newer local messages over a stale threads.get", () => {
    const cache = createThreadSnapshotCache();
    const live = snapshot("bot-ada", "typed after switch", 20);
    putThreadSnapshot(cache, live);
    const painted = botThreadSnapshotForPaint(null, "bot-ada", cache);
    const staleGet = snapshot("bot-ada", "older page", 15);

    const reconciled = reconcileRefreshedThread(painted, staleGet, null);
    expect(reconciled.snapshot).toBe(live);
    putThreadSnapshot(cache, staleGet);
    expect(peekThreadSnapshot(cache, "bot-ada")).toBe(live);
  });
});

function snapshot(
  botId: string,
  text: string,
  cursor = 3,
  threadId = `thread-${botId}`,
): ThreadSnapshot {
  const message: ThreadMessage = {
    id: `message-${cursor}`,
    threadId,
    seq: cursor,
    role: "bot",
    blocks: [{ kind: "text", text }],
    createdAt: "2026-10-21T00:00:00.000Z",
  };
  return {
    botId,
    threadId,
    cursor,
    messages: [message],
    olderCursor: null,
    run: null,
  };
}
