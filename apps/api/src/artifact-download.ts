import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import { Id } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError } from "@rakazo/db";
import type { Hono } from "hono";
import { loadSpaceArtifactBytes } from "./artifacts.js";

export const ARTIFACT_CONTENT_PATH = "/api/artifacts";

/** RFC 5987 so a Chinese video title still becomes the saved filename. */
export function artifactContentDisposition(kind: "inline" | "attachment", name: string): string {
  const trimmed = name.replace(/[\r\n]+/g, " ").trim() || "file";
  const fallback = trimmed.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "") || "file";
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * `GET /api/artifacts/:artifactId`: the file itself, so a video can play and download without
 * waiting for a JSON base64 RPC body. Session cookie authorizes; `space` picks the Space when
 * the request cannot send `x-rakazo-space-id` (a `<video src>`).
 */
export function mountArtifactDownloadRoute(
  app: Hono,
  deps: {
    prisma: PrismaClient;
    artifacts: ArtifactStore;
    actorFor: (request: Request, spaceId: string | null) => Promise<Actor | null>;
  },
): void {
  app.get(`${ARTIFACT_CONTENT_PATH}/:artifactId`, async (c) => {
    const headers = { "cache-control": "no-store" };
    const parsed = Id.safeParse(c.req.param("artifactId"));
    if (!parsed.success) return c.text("Not found", 404, headers);
    const actor = await deps.actorFor(
      c.req.raw,
      c.req.query("space") ?? c.req.header("x-rakazo-space-id") ?? null,
    );
    if (!actor) return c.text("Unauthorized", 401, headers);
    try {
      const artifact = await loadSpaceArtifactBytes(deps, actor, parsed.data);
      const download = c.req.query("download") === "1";
      const mimeType = headerSafe(artifact.mimeType) || "application/octet-stream";
      return new Response(Buffer.from(artifact.bytes), {
        headers: {
          ...headers,
          "content-type": mimeType,
          "content-length": String(artifact.bytes.byteLength),
          "content-disposition": artifactContentDisposition(
            download ? "attachment" : "inline",
            artifact.name,
          ),
        },
      });
    } catch (error) {
      if (error instanceof IsolationError) return c.text("Not found", 404, headers);
      throw error;
    }
  });
}
