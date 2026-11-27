import type { ThreadSnapshot } from "@rakazo/contracts";
import { isRunWorking } from "@rakazo/core";
import { activeThreadRuns } from "../../lib/thread-events";

/** True while the open chat has a run that is queued, leased, or running. */
export function snapshotHasWorkingRun(snapshot: ThreadSnapshot | null): boolean {
  return activeThreadRuns(snapshot).some((run) => isRunWorking(run.status));
}

/** Interval polls skip while a list is already in flight or the open chat is writing. */
export function shouldSkipSpaceRosterInterval(input: {
  botsRefreshInFlight: number;
  openChatWorking: boolean;
}): boolean {
  return input.botsRefreshInFlight > 0 || input.openChatWorking;
}
