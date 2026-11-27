import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { asSystem, createDb } from "@rakazo/db";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mountArtifactDownloadRoute } from "./artifact-download.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("GET /api/artifacts/:artifactId (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const userId = `artifact-http-user-${suffix}`;
  const organizationId = `artifact-http-org-${suffix}`;
  const spaceId = `artifact-http-space-${suffix}`;
  const actor: Actor = {
    userId,
    spaceId,
    email: `${userId}@rakazo.test`,
    isDeploymentOwner: false,
  };
  const bytes = Buffer.from("Result notes\n");
  const artifacts = {
    async get() {
      return bytes;
    },
  } as unknown as ArtifactStore;
  let prisma: PrismaClient;
  let system: PrismaClient;
  let close: () => Promise<void>;
  let artifactId: string;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    system = asSystem(prisma);
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    await system.user.create({
      data: { id: userId, name: userId, email: `${userId}@rakazo.test`, emailVerified: false },
    });
    await system.organization.create({
      data: {
        id: organizationId,
        name: "Download Org",
        slug: organizationId,
        createdAt: new Date(),
      },
    });
    await system.space.create({
      data: { id: spaceId, organizationId, name: "General", isDefault: true },
    });
    const bot = await system.bot.create({
      data: { spaceId, userId, name: "Chief", color: "blue" },
    });
    const row = await system.artifact.create({
      data: {
        spaceId,
        userId,
        botId: bot.id,
        name: "result.txt",
        mimeType: "text/plain",
        size: bytes.byteLength,
        hash: "hash",
        storageKey: "blob-result",
      },
    });
    artifactId = row.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await system.organization.deleteMany({ where: { id: organizationId } });
    await system.user.deleteMany({ where: { id: userId } });
    await close();
  });

  it("reads the file when the HTTP route is the only tenant scope", async () => {
    const app = new Hono();
    mountArtifactDownloadRoute(app, {
      prisma,
      artifacts,
      actorFor: async () => actor,
    });
    const response = await app.request(`/api/artifacts/${artifactId}`);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("Result notes\n");
  });
});
