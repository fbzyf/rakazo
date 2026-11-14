// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSidebarBotVisibility,
  readSidebarBotVisibility,
  rosterVisibilityInput,
  sidebarBotVisibilityKey,
  sidebarBotVisibilityPreference,
} from "./sidebar-bot-visibility";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("sidebar bot visibility preference", () => {
  it("defaults to mine per space and stores space separately", () => {
    expect(parseSidebarBotVisibility(null)).toBe("mine");
    expect(parseSidebarBotVisibility("space")).toBe("space");
    expect(parseSidebarBotVisibility("all")).toBe("mine");
    expect(readSidebarBotVisibility(null)).toBe("mine");
    expect(rosterVisibilityInput("mine")).toEqual({});
    expect(rosterVisibilityInput("space")).toEqual({ visibility: "space" });

    const first = sidebarBotVisibilityPreference("space-a");
    const second = sidebarBotVisibilityPreference("space-b");
    expect(first.get()).toBe("mine");
    first.set("space");
    expect(localStorage.getItem(sidebarBotVisibilityKey("space-a"))).toBe("space");
    expect(second.get()).toBe("mine");
    expect(localStorage.getItem(sidebarBotVisibilityKey("space-b"))).toBeNull();
  });
});
