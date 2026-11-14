import { randomUUID } from "node:crypto";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import type { Actor, Bot } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { asSystem, createDb, createRepos, IsolationError, runAsTenant } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";
import { handleRpcError } from "./rpc-errors.js";

const describePostgres =
  process.env.VERIFY_DATABASE && process.env.DATABASE_URL ? describe : describe.skip;

describePostgres("sidebar default-mine visibility (PostgreSQL)", () => {
  let db: ReturnType<typeof createDb>;
  let prisma: PrismaClient;
  let system: PrismaClient;
  let handler: RPCHandler<Record<string, unknown>>;
  const users: string[] = [];
  const organizations: string[] = [];

  async function person(name: string): Promise<Actor> {
    const id = `vis-${name}-${randomUUID()}`;
    users.push(id);
    organizations.push(id);
    const createdAt = new Date();
    await system.user.create({
      data: { id, name, email: `${id}@example.test`, emailVerified: true },
    });
    await system.organization.create({
      data: { id, name: "Personal", slug: id, createdAt },
    });
    await system.member.create({
      data: {
        id: `m-${id}`,
        organizationId: id,
        userId: id,
        role: "owner",
        createdAt,
      },
    });
    await system.space.create({
      data: {
        id,
        organizationId: id,
        name: "Personal",
        isDefault: true,
        createdByUserId: id,
      },
    });
    await system.spaceMember.create({
      data: {
        id: `sm-${id}`,
        spaceId: id,
        organizationId: id,
        userId: id,
        role: "owner",
        createdAt,
      },
    });
    return {
      userId: id,
      spaceId: id,
      email: `${id}@example.test`,
      isDeploymentOwner: false,
    };
  }

  async function join(spaceId: string, organizationId: string, userId: string, role: string) {
    const createdAt = new Date();
    if (role !== "owner") {
      await system.member.create({
        data: {
          id: randomUUID(),
          organizationId,
          userId,
          role: "member",
          createdAt,
        },
      });
    }
    await system.spaceMember.create({
      data: {
        id: randomUUID(),
        spaceId,
        organizationId,
        userId,
        role,
        createdAt,
      },
    });
  }

  async function call(actor: Actor, path: string, input?: unknown) {
    const { response } = await handler.handle(
      new Request(`http://127.0.0.1/rpc/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input ?? {} }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    const body = (await response!.json()) as { json: unknown };
    return { status: response!.status, json: body.json };
  }

  beforeAll(() => {
    db = createDb(process.env.DATABASE_URL!);
    prisma = db.prisma;
    system = asSystem(prisma);
    const deps = {
      prisma,
      events: { notify: async () => undefined },
      env: {
        agentRuntime: "scripted",
        defaultProvider: "fake",
        defaultModel: "fake-model",
        webOrigin: "https://app.example.test",
        screenProxySecret: "fake-test-secret",
        sandboxProvider: "fake",
      },
      dataDir: "/tmp/rakazo-roster-visibility-test",
    } as unknown as RouterDeps;
    handler = new RPCHandler(createRouter(deps), {
      clientInterceptors: [
        onError((error, { path, signal }) => handleRpcError(error, path, signal)),
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await system.organization.deleteMany({ where: { id: { in: organizations } } });
    await system.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
    await db.pool.end();
  });

  it("lists mine by default, maps get/update of another member's bot, and permutes reorder slots", async () => {
    const ownerHome = await person("owner");
    const partnerHome = await person("partner");
    const spaceId = randomUUID();
    await system.space.create({
      data: {
        id: spaceId,
        organizationId: ownerHome.spaceId,
        name: "Shared",
        createdByUserId: ownerHome.userId,
      },
    });
    await join(spaceId, ownerHome.spaceId, ownerHome.userId, "owner");
    await join(spaceId, ownerHome.spaceId, partnerHome.userId, "member");
    const owner: Actor = { ...ownerHome, spaceId };
    const partner: Actor = { ...partnerHome, spaceId };
    const repos = createRepos(prisma);
    const newBot = (actor: Actor, name: string) =>
      runAsTenant(actor, () =>
        repos.createBot(actor, {
          name,
          description: "",
          instructions: "Count to three.",
          notifyOnFinish: false,
        }),
      );
    const chef = await newBot(owner, "Chef");
    const planner = await newBot(owner, "Planner");
    const partnerBot = await newBot(partner, "Sous");
    await runAsTenant(owner, async () => {
      await prisma.message.create({
        data: {
          threadId: chef.threadId,
          seq: 0,
          role: "user",
          blocks: [{ kind: "text", text: "Chef preview" }],
        },
      });
      await prisma.thread.update({
        where: { id: chef.threadId },
        data: { nextMessageSeq: 1 },
      });
    });

    const omitted = await call(partner, "bots/list");
    const mine = await call(partner, "bots/list", { visibility: "mine" });
    expect(omitted.status).toBe(200);
    expect(mine.status).toBe(200);
    expect((omitted.json as Bot[]).map((bot) => bot.id)).toEqual([partnerBot.id]);
    expect((mine.json as Bot[]).map((bot) => bot.id)).toEqual([partnerBot.id]);
    expect((omitted.json as Bot[]).some((bot) => bot.id === chef.id)).toBe(false);
    expect((omitted.json as Bot[]).some((bot) => bot.preview === "Chef preview")).toBe(false);

    const all = await call(partner, "bots/list", { visibility: "space" });
    expect((all.json as Bot[]).map((bot) => bot.id).sort()).toEqual(
      [chef.id, planner.id, partnerBot.id].sort(),
    );

    const invalid = await call(partner, "bots/list", { visibility: "all" });
    expect(invalid.status).toBe(400);
    expect(invalid.json).toMatchObject({ code: "BAD_REQUEST" });

    const got = await call(partner, "bots/get", { botId: chef.id });
    expect(got.status).toBe(200);
    expect(got.json).toMatchObject({ id: chef.id, preview: "Chef preview" });

    const updated = await call(partner, "bots/update", { botId: chef.id, pinned: true });
    expect(updated.status).toBe(200);
    expect(updated.json).toMatchObject({ id: chef.id, pinned: true, preview: "Chef preview" });

    const rewritten = await call(partner, "bots/update", {
      botId: chef.id,
      instructions: "Count to four.",
      expectedInstructions: "Count to three.",
    });
    expect(rewritten.status).toBe(200);
    const version = (rewritten.json as Bot).instructionHistory?.[0];
    expect(version?.id).toBeTruthy();
    const restored = await call(partner, "bots/restoreInstructions", {
      botId: chef.id,
      versionId: version!.id,
      expectedInstructions: "Count to four.",
    });
    expect(restored.status).toBe(200);
    expect(restored.json).toMatchObject({ id: chef.id, preview: "Chef preview" });

    const bootstrapDefault = await call(partner, "bootstrap", {});
    expect(bootstrapDefault.status).toBe(200);
    const defaultJson = bootstrapDefault.json as { bots: Bot[]; thread: { botId: string } | null };
    expect(defaultJson.bots.map((bot) => bot.id)).toEqual([partnerBot.id]);
    expect(defaultJson.thread?.botId).toBe(partnerBot.id);

    const bootstrapMine = await call(partner, "bootstrap", { botId: chef.id });
    expect(bootstrapMine.status).toBe(200);
    const bootstrapJson = bootstrapMine.json as {
      bots: Bot[];
      thread: { botId: string } | null;
    };
    expect(bootstrapJson.bots.map((bot) => bot.id)).toEqual([partnerBot.id]);
    expect(bootstrapJson.bots.some((bot) => bot.id === chef.id)).toBe(false);
    expect(bootstrapJson.bots.some((bot) => bot.preview === "Chef preview")).toBe(false);
    expect(bootstrapJson.thread?.botId).toBe(chef.id);

    const bootstrapAll = await call(partner, "bootstrap", {
      botId: chef.id,
      visibility: "space",
    });
    expect(
      ((bootstrapAll.json as { bots: Bot[] }).bots.map((bot) => bot.id) as string[]).sort(),
    ).toEqual([chef.id, planner.id, partnerBot.id].sort());

    await system.bot.update({
      where: { id: chef.id },
      data: { position: 2 },
    });
    await system.bot.update({
      where: { id: planner.id },
      data: { position: 5 },
    });
    await system.bot.update({
      where: { id: partnerBot.id },
      data: { position: 9 },
    });
    const reordered = await call(partner, "bots/reorder", {
      botIds: [partnerBot.id, chef.id],
    });
    expect(reordered.status).toBe(200);
    const positions = await system.bot.findMany({
      where: { id: { in: [chef.id, planner.id, partnerBot.id] } },
      select: { id: true, position: true },
    });
    const byId = Object.fromEntries(positions.map((row) => [row.id, row.position]));
    expect(byId[partnerBot.id]).toBe(2);
    expect(byId[chef.id]).toBe(9);
    expect(byId[planner.id]).toBe(5);

    const unknown = await call(partner, "bots/reorder", { botIds: [partnerBot.id, randomUUID()] });
    expect(unknown.status).toBe(404);
    const duplicate = await call(partner, "bots/reorder", {
      botIds: [partnerBot.id, partnerBot.id],
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.json).toMatchObject({ code: "BAD_REQUEST" });

    await runAsTenant(owner, () =>
      expect(repos.reorderBots(owner, [partnerBot.id, "missing"])).rejects.toBeInstanceOf(
        IsolationError,
      ),
    );
  });
});
