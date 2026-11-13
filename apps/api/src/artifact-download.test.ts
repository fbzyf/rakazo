import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import { IsolationError } from "@rakazo/db";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactContentDisposition, mountArtifactDownloadRoute } from "./artifact-download.js";

const actor: Actor = {
  userId: "user-1",
  spaceId: "space-1",
  email: "owner@example.com",
  isDeploymentOwner: false,
};

const bytes = Buffer.from("mp4-bytes");

vi.mock("./artifacts.js", () => ({
  loadSpaceArtifactBytes: vi.fn(),
}));

import { loadSpaceArtifactBytes } from "./artifacts.js";

function app(actorFor: (request: Request, spaceId: string | null) => Promise<Actor | null>) {
  const hono = new Hono();
  mountArtifactDownloadRoute(hono, {
    prisma: {} as never,
    artifacts: {} as ArtifactStore,
    actorFor,
  });
  return hono;
}

describe("artifactContentDisposition", () => {
  it("keeps a Chinese video title in filename*", () => {
    const name = "黄仁勋腾讯 夜市的代驾哥（混一）.mp4";
    const header = artifactContentDisposition("attachment", name);
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
    expect(header.startsWith('attachment; filename="')).toBe(true);
    expect(header).not.toMatch(/filename="[^"]*[\u4e00-\u9fff]/);
  });

  it("strips quotes and line breaks from the fallback name", () => {
    expect(artifactContentDisposition("inline", 'clip"\r\n.exe')).toBe(
      `inline; filename="clip .exe"; filename*=UTF-8''${encodeURIComponent('clip" .exe')}`,
    );
  });
});

describe("GET /api/artifacts/:artifactId", () => {
  afterEach(() => {
    vi.mocked(loadSpaceArtifactBytes).mockReset();
  });

  it("streams the file bytes instead of JSON", async () => {
    vi.mocked(loadSpaceArtifactBytes).mockResolvedValueOnce({
      id: "art-1",
      botId: "bot-1",
      groupId: null,
      runId: null,
      name: "clip.mp4",
      description: null,
      mimeType: "video/mp4",
      size: bytes.byteLength,
      version: 1,
      createdAt: "2026-11-13T00:00:00.000Z",
      bytes,
    });
    const response = await app(async () => actor).request("/api/artifacts/art-1?space=space-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp4");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
    expect(loadSpaceArtifactBytes).toHaveBeenCalledWith(expect.anything(), actor, "art-1");
  });

  it("sends an attachment disposition when download=1", async () => {
    vi.mocked(loadSpaceArtifactBytes).mockResolvedValueOnce({
      id: "art-1",
      botId: "bot-1",
      groupId: null,
      runId: null,
      name: "clip.mp4",
      description: null,
      mimeType: "video/mp4",
      size: bytes.byteLength,
      version: 1,
      createdAt: "2026-11-13T00:00:00.000Z",
      bytes,
    });
    const response = await app(async () => actor).request("/api/artifacts/art-1?download=1");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("passes the space query through when the request cannot send a space header", async () => {
    const actorFor = vi.fn(async () => actor);
    vi.mocked(loadSpaceArtifactBytes).mockResolvedValueOnce({
      id: "art-1",
      botId: "bot-1",
      groupId: null,
      runId: null,
      name: "clip.mp4",
      description: null,
      mimeType: "video/mp4",
      size: bytes.byteLength,
      version: 1,
      createdAt: "2026-11-13T00:00:00.000Z",
      bytes,
    });
    await app(actorFor).request("/api/artifacts/art-1?space=space-9");
    expect(actorFor).toHaveBeenCalledWith(expect.any(Request), "space-9");
  });

  it("refuses a signed-out caller", async () => {
    const response = await app(async () => null).request("/api/artifacts/art-1");
    expect(response.status).toBe(401);
    expect(loadSpaceArtifactBytes).not.toHaveBeenCalled();
  });

  it("hides another person's file", async () => {
    vi.mocked(loadSpaceArtifactBytes).mockRejectedValueOnce(new IsolationError());
    const response = await app(async () => actor).request("/api/artifacts/art-1");
    expect(response.status).toBe(404);
  });
});
