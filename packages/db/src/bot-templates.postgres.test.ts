import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listBotTemplates,
  publishBotTemplate,
  removeBotTemplate,
  useBotTemplate,
} from "./bot-templates.js";
import { createRepos } from "./bots/bot-repository.js";
import type { PrismaClient } from "./database/client.js";
import { createDb } from "./database/client.js";
import { asSystem, runAsTenant } from "./database/row-security.js";
import { IsolationError } from "./database/scope.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("bot templates (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `bot-templates-org-${suffix}`;
  const spaceId = `bot-templates-space-${suffix}`;
  const otherSpaceId = `bot-templates-other-${suffix}`;
  const userA = `bot-templates-a-${suffix}`;
  const userB = `bot-templates-b-${suffix}`;
  const userC = `bot-templates-c-${suffix}`;
  let prisma: PrismaClient;
  let system: PrismaClient;
  let close: () => Promise<void>;

  const actor = (userId: string, space: string) => ({
    userId,
    spaceId: space,
    email: `${userId}@rakazo.test`,
    isDeploymentOwner: false,
  });

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    system = asSystem(db.prisma);
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    const createdAt = new Date();
    for (const id of [userA, userB, userC]) {
      await system.user.create({
        data: { id, name: id, email: `${id}@rakazo.test`, emailVerified: false },
      });
    }
    await system.organization.create({
      data: { id: organizationId, name: "Templates", slug: organizationId, createdAt },
    });
    for (const userId of [userA, userB, userC]) {
      await system.member.create({
        data: { id: `${userId}-member`, organizationId, userId, role: "member", createdAt },
      });
    }
    await system.space.create({
      data: { id: spaceId, organizationId, name: "Shared", createdByUserId: userA },
    });
    await system.space.create({
      data: { id: otherSpaceId, organizationId, name: "Other", createdByUserId: userC },
    });
    for (const userId of [userA, userB]) {
      await system.spaceMember.create({
        data: { id: `${spaceId}-${userId}`, spaceId, organizationId, userId, createdAt },
      });
    }
    await system.spaceMember.create({
      data: {
        id: `${otherSpaceId}-${userC}`,
        spaceId: otherSpaceId,
        organizationId,
        userId: userC,
        createdAt,
      },
    });
  });

  afterAll(async () => {
    if (!system) return;
    await system.organization.deleteMany({ where: { id: organizationId } });
    await system.user.deleteMany({ where: { id: { in: [userA, userB, userC] } } });
    await close();
  });

  it("lets a colleague copy instructions and a paused schedule, and nothing private", async () => {
    const source = await runAsTenant({ spaceId, userId: userA }, () =>
      createRepos(prisma).createBot(actor(userA, spaceId), {
        name: "Briefing",
        description: "Morning notes",
        instructions: "Summarize overnight mail.",
        notifyOnFinish: true,
        color: "ink",
      }),
    );
    await runAsTenant({ spaceId, userId: userA }, async () => {
      await prisma.memoryDocument.create({
        data: {
          spaceId,
          userId: userA,
          botId: source.id,
          scope: "bot",
          path: "private.md",
          content: "a private note",
        },
      });
      await prisma.botSecret.create({
        data: {
          id: `bot-templates-secret-${suffix}`,
          userId: userA,
          spaceId,
          botId: source.id,
          name: "inbox",
          origin: "user",
          auth: {},
          ciphertext: "sealed",
        },
      });
      const server = await prisma.mcpServer.create({
        data: {
          spaceId,
          userId: userA,
          slug: `bot-templates-${suffix}`,
          name: "Tools",
          transport: "http",
          endpoint: "https://example.test/mcp",
        },
      });
      await prisma.botMcpServer.create({
        data: { spaceId, userId: userA, botId: source.id, serverId: server.id },
      });
      await prisma.routine.create({
        data: {
          spaceId,
          botId: source.id,
          userId: userA,
          name: "Weekday",
          prompt: "Send the briefing",
          crons: ["0 9 * * 1-5"],
          timezone: "UTC",
          active: true,
          nextRunAt: new Date("2030-01-01T00:00:00.000Z"),
        },
      });
      await prisma.routine.create({
        data: {
          spaceId,
          botId: source.id,
          userId: userA,
          name: "Hook",
          prompt: "On a delivery",
          crons: [],
          timezone: "UTC",
          webhookEnabled: true,
        },
      });
      await prisma.routine.create({
        data: {
          spaceId,
          botId: source.id,
          userId: userA,
          name: "Once",
          prompt: "Just once",
          crons: ["@once"],
          timezone: "UTC",
        },
      });
    });

    const published = await runAsTenant({ spaceId, userId: userA }, () =>
      publishBotTemplate(prisma, actor(userA, spaceId), source.id),
    );
    expect(published.audience).toBe("space");
    expect(published.mine).toBe(true);
    expect(published.instructions).toBe("Summarize overnight mail.");
    expect(published.routines).toEqual([
      {
        name: "Weekday",
        prompt: "Send the briefing",
        crons: ["0 9 * * 1-5"],
        timezone: "UTC",
      },
    ]);

    const forColleague = await runAsTenant({ spaceId, userId: userB }, () =>
      listBotTemplates(prisma, actor(userB, spaceId)),
    );
    expect(forColleague.map((template) => ({ id: template.id, mine: template.mine }))).toEqual([
      { id: published.id, mine: false },
    ]);
    const forPublisher = await runAsTenant({ spaceId, userId: userA }, () =>
      listBotTemplates(prisma, actor(userA, spaceId)),
    );
    expect(forPublisher.map((template) => template.mine)).toEqual([true]);

    const elsewhere = await runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
      listBotTemplates(prisma, actor(userC, otherSpaceId)),
    );
    expect(elsewhere).toEqual([]);
    await expect(
      runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
        useBotTemplate(prisma, actor(userC, otherSpaceId), published.id),
      ),
    ).rejects.toBeInstanceOf(IsolationError);

    const copy = await runAsTenant({ spaceId, userId: userB }, () =>
      useBotTemplate(prisma, actor(userB, spaceId), published.id),
    );
    expect(copy.instructions).toBe("Summarize overnight mail.");
    const stored = await system.bot.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.userId).toBe(userB);
    expect(stored.avatarSetPinned).toBe(true);
    const copiedRoutines = await system.routine.findMany({ where: { botId: copy.id } });
    expect(copiedRoutines).toEqual([
      expect.objectContaining({
        userId: userB,
        name: "Weekday",
        prompt: "Send the briefing",
        active: false,
        nextRunAt: null,
        webhookEnabled: false,
      }),
    ]);
    const memories = await system.memoryDocument.findMany({
      where: { botId: copy.id },
      select: { path: true },
    });
    expect(memories.map((document) => document.path)).toEqual(["MEMORY.md"]);
    expect(await system.botSecret.count({ where: { botId: copy.id } })).toBe(0);
    expect(await system.botMcpServer.count({ where: { botId: copy.id } })).toBe(0);

    await runAsTenant({ spaceId, userId: userA }, () =>
      prisma.bot.update({
        where: { id: source.id },
        data: { instructions: "Updated briefing." },
      }),
    );
    const refreshed = await runAsTenant({ spaceId, userId: userA }, () =>
      publishBotTemplate(prisma, actor(userA, spaceId), source.id),
    );
    expect(refreshed.id).toBe(published.id);
    expect(refreshed.instructions).toBe("Updated briefing.");
    expect(await system.botTemplate.count({ where: { spaceId, sourceBotId: source.id } })).toBe(1);
    expect((await system.bot.findUniqueOrThrow({ where: { id: copy.id } })).instructions).toBe(
      "Summarize overnight mail.",
    );

    await expect(
      runAsTenant({ spaceId, userId: userB }, () =>
        removeBotTemplate(prisma, actor(userB, spaceId), published.id),
      ),
    ).rejects.toBeInstanceOf(IsolationError);
    await runAsTenant({ spaceId, userId: userA }, () =>
      removeBotTemplate(prisma, actor(userA, spaceId), published.id),
    );
    expect(
      await runAsTenant({ spaceId, userId: userB }, () =>
        listBotTemplates(prisma, actor(userB, spaceId)),
      ),
    ).toEqual([]);
    expect(await system.bot.findUnique({ where: { id: copy.id } })).not.toBeNull();
  });

  it("lets someone in another workspace copy a template shared with everyone who can log in", async () => {
    const source = await runAsTenant({ spaceId, userId: userA }, () =>
      createRepos(prisma).createBot(actor(userA, spaceId), {
        name: "Open brief",
        description: "",
        instructions: "Visible to people who can log in.",
        notifyOnFinish: true,
      }),
    );
    const hidden = await runAsTenant({ spaceId, userId: userA }, () =>
      publishBotTemplate(prisma, actor(userA, spaceId), source.id),
    );
    expect(hidden.audience).toBe("space");
    const before = await runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
      listBotTemplates(prisma, actor(userC, otherSpaceId)),
    );
    expect(before.find((template) => template.id === hidden.id)).toBeUndefined();

    const opened = await runAsTenant({ spaceId, userId: userA }, () =>
      publishBotTemplate(prisma, actor(userA, spaceId), source.id, "signed_in"),
    );
    expect(opened.id).toBe(hidden.id);
    expect(opened.audience).toBe("signed_in");
    const seen = await runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
      listBotTemplates(prisma, actor(userC, otherSpaceId)),
    );
    expect(seen.map((template) => template.id)).toContain(opened.id);

    const copy = await runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
      useBotTemplate(prisma, actor(userC, otherSpaceId), opened.id),
    );
    const stored = await system.bot.findUniqueOrThrow({ where: { id: copy.id } });
    expect(stored.userId).toBe(userC);
    expect(stored.spaceId).toBe(otherSpaceId);
    expect(stored.instructions).toBe("Visible to people who can log in.");
    expect(
      await system.memoryDocument.count({ where: { botId: copy.id, path: { not: "MEMORY.md" } } }),
    ).toBe(0);

    const visibleTo = async (space: string, userId: string) =>
      system.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT set_config('app.space_id', ${space}, true),
                 set_config('app.user_id', ${userId}, true),
                 set_config('app.rls_bypass', 'off', true),
                 set_config('app.rls_bypass_key', '', true)`;
        await tx.$executeRawUnsafe("SET LOCAL ROLE rakazo_app");
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM bot_templates WHERE id = ${opened.id}`;
        return rows.map((row) => row.id);
      });
    expect(await visibleTo(otherSpaceId, userC)).toEqual([opened.id]);
    expect(await visibleTo("", "")).toEqual([]);
    const changed = await system.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.space_id', ${otherSpaceId}, true),
               set_config('app.user_id', ${userC}, true),
               set_config('app.rls_bypass', 'off', true),
               set_config('app.rls_bypass_key', '', true)`;
      await tx.$executeRawUnsafe("SET LOCAL ROLE rakazo_app");
      return tx.$executeRaw`
        UPDATE bot_templates SET instructions = 'Changed by someone else.' WHERE id = ${opened.id}`;
    });
    expect(changed).toBe(0);
    expect(
      (await system.botTemplate.findUniqueOrThrow({ where: { id: opened.id } })).instructions,
    ).toBe("Visible to people who can log in.");

    await expect(
      runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
        removeBotTemplate(prisma, actor(userC, otherSpaceId), opened.id),
      ),
    ).rejects.toBeInstanceOf(IsolationError);

    const narrowed = await runAsTenant({ spaceId, userId: userA }, () =>
      publishBotTemplate(prisma, actor(userA, spaceId), source.id, "space"),
    );
    expect(narrowed.audience).toBe("space");
    const after = await runAsTenant({ spaceId: otherSpaceId, userId: userC }, () =>
      listBotTemplates(prisma, actor(userC, otherSpaceId)),
    );
    expect(after.find((template) => template.id === opened.id)).toBeUndefined();
    expect(await visibleTo(otherSpaceId, userC)).toEqual([]);
    expect(await system.bot.findUnique({ where: { id: copy.id } })).not.toBeNull();
  });
});
