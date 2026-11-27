import type { ThreadSnapshot } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { shouldSkipSpaceRosterInterval, snapshotHasWorkingRun } from "./space-roster-poll";

function run(
  status: NonNullable<ThreadSnapshot["run"]>["status"],
): NonNullable<ThreadSnapshot["run"]> {
  return {
    id: "run-1",
    botId: "bot-1",
    threadId: "thread-1",
    taskId: "task-1",
    status,
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
    threadId: "thread-1",
    cursor: 0,
    messages: [],
    olderCursor: null,
    botId: "bot-1",
    run: null,
    ...overrides,
  };
}

describe("space roster interval skip", () => {
  it("skips while a list is in flight or the open chat is writing", () => {
    expect(shouldSkipSpaceRosterInterval({ botsRefreshInFlight: 0, openChatWorking: false })).toBe(
      false,
    );
    expect(shouldSkipSpaceRosterInterval({ botsRefreshInFlight: 1, openChatWorking: false })).toBe(
      true,
    );
    expect(shouldSkipSpaceRosterInterval({ botsRefreshInFlight: 0, openChatWorking: true })).toBe(
      true,
    );
  });

  it("treats queued, leased, and running as writing, and waiting as idle for the poll", () => {
    expect(snapshotHasWorkingRun(snapshot({ run: run("queued") }))).toBe(true);
    expect(snapshotHasWorkingRun(snapshot({ run: run("leased") }))).toBe(true);
    expect(snapshotHasWorkingRun(snapshot({ run: run("running") }))).toBe(true);
    expect(snapshotHasWorkingRun(snapshot({ run: run("waiting_input") }))).toBe(false);
    expect(snapshotHasWorkingRun(snapshot({ run: run("completed") }))).toBe(false);
    expect(snapshotHasWorkingRun(snapshot({ run: null }))).toBe(false);
    expect(
      snapshotHasWorkingRun(
        snapshot({
          run: run("waiting_input"),
          activeRuns: [run("waiting_input"), { ...run("running"), id: "run-2" }],
        }),
      ),
    ).toBe(true);
  });
});
