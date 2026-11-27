// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const selected = vi.hoisted(() => ({ spaceId: "space-1" as string | null }));
vi.mock("./rpc", () => ({
  selectedSpaceId: () => selected.spaceId,
  withSpaceHeaders: (init?: HeadersInit) => {
    const headers = new Headers(init);
    if (selected.spaceId) headers.set("x-rakazo-space-id", selected.spaceId);
    return headers;
  },
}));

import {
  ARTIFACT_DOWNLOAD_TIMEOUT_MS,
  artifactContentUrl,
  downloadArtifact,
  fetchArtifactBytes,
} from "./artifact-open";

describe("artifactContentUrl", () => {
  it("puts the selected space on the URL so a video element can authorize without custom headers", () => {
    selected.spaceId = "space-9";
    expect(artifactContentUrl("art-1")).toBe("/api/artifacts/art-1?space=space-9");
    expect(artifactContentUrl("art-1", { download: true })).toBe(
      "/api/artifacts/art-1?space=space-9&download=1",
    );
  });

  it("omits space when none is selected", () => {
    selected.spaceId = null;
    expect(artifactContentUrl("art/1")).toBe("/api/artifacts/art%2F1");
  });
});

describe("artifact binary fetch and download", () => {
  beforeEach(() => {
    selected.spaceId = "space-1";
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads bytes from the binary route with the download budget", async () => {
    const fetch = vi.mocked(window.fetch);
    fetch.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    await expect(fetchArtifactBytes({ botId: "bot-1" }, "art-1")).resolves.toEqual(
      new Uint8Array([1, 2, 3]),
    );
    const request = fetch.mock.calls[0];
    expect(String(request?.[0])).toBe("/api/artifacts/art-1?space=space-1");
    expect(request?.[1]?.credentials).toBe("include");
    expect(request?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(ARTIFACT_DOWNLOAD_TIMEOUT_MS).toBe(120_000);
  });

  it("surfaces HTTP failures with a status so gateway errors read as unreachable", async () => {
    vi.mocked(window.fetch).mockResolvedValueOnce(new Response("down", { status: 502 }));
    await expect(fetchArtifactBytes({ groupId: "g" }, "art-1")).rejects.toMatchObject({
      status: 502,
    });
  });

  it("downloads through a same-origin link instead of fetching the file into memory", async () => {
    const clicks: string[] = [];
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const original = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const element = original(tag);
      if (tag === "a") {
        element.click = () => clicks.push(element.getAttribute("href") ?? "");
      }
      return element;
    });
    await downloadArtifact({ botId: "bot-1" }, "art-1", "clip.mp4", "video/mp4");
    expect(fetch).not.toHaveBeenCalled();
    expect(clicks).toEqual(["/api/artifacts/art-1?space=space-1&download=1"]);
  });
});
