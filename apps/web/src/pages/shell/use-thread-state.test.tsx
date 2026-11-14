// @vitest-environment jsdom

import type { ThreadMessage, ThreadSnapshot } from "@rakazo/contracts";
import { reduceLiveMessageBlocks } from "@rakazo/core";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { responseStreamingPreference } from "../../lib/response-streaming";
import { useThreadState } from "./use-thread-state";

let container: HTMLDivElement;
let root: Root;
let rafQueue: FrameRequestCallback[] = [];
const rafHandles = new Map<number, FrameRequestCallback>();
let rafId = 0;

beforeEach(() => {
  rafQueue = [];
  rafHandles.clear();
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++rafId;
    rafHandles.set(id, cb);
    rafQueue.push(cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const cb = rafHandles.get(id);
    if (!cb) return;
    rafHandles.delete(id);
    rafQueue = rafQueue.filter((queued) => queued !== cb);
  });
  responseStreamingPreference.set(false);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  responseStreamingPreference.set(false);
});

function flushFrames() {
  const queued = rafQueue;
  rafQueue = [];
  rafHandles.clear();
  act(() => {
    for (const cb of queued) cb(0);
  });
}

function renderThread() {
  const result: { current: ReturnType<typeof useThreadState> | null } = { current: null };
  function Probe() {
    result.current = useThreadState();
    return null;
  }
  act(() => root.render(createElement(Probe)));
  return result;
}

function run(): NonNullable<ThreadSnapshot["run"]> {
  return {
    id: "run-1",
    botId: "bot-1",
    threadId: "thread-1",
    taskId: "task-1",
    status: "running",
    trigger: "user",
    routineId: null,
    modelProvider: null,
    modelId: null,
    error: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-08-16T00:00:00.000Z",
  };
}

function snapshot(overrides: Partial<ThreadSnapshot> = {}): ThreadSnapshot {
  return {
    botId: "bot-1",
    threadId: "thread-1",
    cursor: 0,
    messages: [],
    olderCursor: null,
    run: run(),
    ...overrides,
  };
}

function progressMessage(blocks: ThreadMessage["blocks"]): ThreadMessage {
  return {
    id: "progress:run-1",
    threadId: "thread-1",
    seq: 1,
    role: "bot",
    createdAt: "2026-08-16T00:00:00.000Z",
    blocks,
  };
}

it("keeps 200 hidden progress ticks as five visible publications", () => {
  const thread = renderThread();
  let raw = snapshot();
  act(() => thread.current!.commitSnapshot(raw));
  let shown = thread.current!.snapshot;
  let publications = 0;
  for (let event = 1; event <= 200; event += 1) {
    raw = {
      ...raw,
      cursor: event,
      messages: [
        progressMessage(
          reduceLiveMessageBlocks(raw.messages[0]?.blocks ?? [], {
            type: "progress",
            payload: { text: `Stage ${Math.ceil(event / 40)}`, activity: true },
          }),
        ),
      ],
    };
    act(() => thread.current!.commitSnapshot(raw));
    flushFrames();
    if (thread.current!.snapshot !== shown) publications += 1;
    shown = thread.current!.snapshot;
  }
  expect(publications).toBe(5);
  expect(thread.current!.snapshotRef.current?.cursor).toBe(200);
  expect(thread.current!.snapshot?.messages[0]?.blocks).toEqual([
    { kind: "progress", text: "Stage 5", activity: true },
  ]);
});

it("coalesces same-thread progress in one animation frame", () => {
  const thread = renderThread();
  act(() => thread.current!.commitSnapshot(snapshot()));
  const initial = thread.current!.snapshot;
  act(() => {
    thread.current!.commitSnapshot(snapshot({ cursor: 1 }));
    thread.current!.commitSnapshot(snapshot({ cursor: 2 }));
    thread.current!.commitSnapshot(snapshot({ cursor: 3 }));
  });
  expect(thread.current!.snapshot).toBe(initial);
  expect(thread.current!.snapshotRef.current?.cursor).toBe(3);
  expect(rafQueue).toHaveLength(1);
  flushFrames();
  expect(thread.current!.snapshot).toBe(initial);
  expect(rafQueue).toHaveLength(0);
});

it("publishes a different thread without waiting for the next frame", () => {
  const thread = renderThread();
  act(() => thread.current!.commitSnapshot(snapshot()));
  const next = snapshot({ threadId: "thread-2", botId: "bot-2" });
  act(() => thread.current!.commitSnapshot(next));
  expect(thread.current!.snapshot?.threadId).toBe("thread-2");
  expect(rafQueue).toHaveLength(0);
});
