import type { Actor, Bot, BotTemplate, BotTemplateRoutine } from "@rakazo/contracts";
import {
  BOT_DESCRIPTION_MAX_LENGTH,
  BOT_INSTRUCTIONS_MAX_LENGTH,
  BOT_NAME_MAX_LENGTH,
  BotTemplateRoutineSchema,
  resolveBotAvatarSet,
  TimeZoneSchema,
} from "@rakazo/contracts";
import {
  hasMixedOneShotSchedule,
  isOneShotRoutineCrons,
  nextCronDateAcrossStrict,
} from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";
import { IsolationError } from "./scope.js";

const TEMPLATE_ROUTINE_LIMIT = 20;
const TEMPLATE_PROMPT_MAX_LENGTH = 20_000;

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

/** Keep a stored string inside its limit without splitting a surrogate pair. */
function clampText(value: string, max: number): string {
  const sliced = value.trim().slice(0, max);
  const last = sliced.charCodeAt(sliced.length - 1);
  return (last >= 0xd800 && last <= 0xdbff ? sliced.slice(0, -1) : sliced).trim();
}

/**
 * Schedules a colleague can run later. Connection triggers, one-shot times, and broken
 * crons stay behind: a copy must not start those, and a bad cron must not fail the copy.
 */
export function portableTemplateRoutines(
  rows: ReadonlyArray<{ name: string; prompt: string; crons: string[]; timezone: string }>,
): BotTemplateRoutine[] {
  const kept: BotTemplateRoutine[] = [];
  for (const row of rows) {
    if (kept.length >= TEMPLATE_ROUTINE_LIMIT) break;
    const routine = portableRoutine(row);
    if (routine) kept.push(routine);
  }
  return kept;
}

function portableRoutine(row: {
  name: string;
  prompt: string;
  crons: string[];
  timezone: string;
}): BotTemplateRoutine | null {
  const name = clampText(row.name, 80);
  const prompt = clampText(row.prompt, TEMPLATE_PROMPT_MAX_LENGTH);
  if (!name || !prompt) return null;
  if (
    row.crons.length === 0 ||
    isOneShotRoutineCrons(row.crons) ||
    hasMixedOneShotSchedule(row.crons)
  ) {
    return null;
  }
  if (!TimeZoneSchema.safeParse(row.timezone).success) return null;
  try {
    if (!nextCronDateAcrossStrict(row.crons, new Date(), row.timezone)) return null;
  } catch {
    return null;
  }
  return { name, prompt, crons: [...row.crons], timezone: row.timezone };
}

export function botTemplateContent(bot: {
  name: string;
  description: string;
  instructions: string;
  color: string;
  avatarSet?: string | null;
  routines: ReadonlyArray<{ name: string; prompt: string; crons: string[]; timezone: string }>;
}): {
  name: string;
  description: string;
  instructions: string;
  color: string;
  avatarSet: BotTemplate["avatarSet"];
  routines: BotTemplateRoutine[];
} {
  const name = clampText(bot.name, BOT_NAME_MAX_LENGTH);
  if (!name) throw new IsolationError();
  return {
    name,
    description: clampText(bot.description, BOT_DESCRIPTION_MAX_LENGTH),
    instructions: clampText(bot.instructions, BOT_INSTRUCTIONS_MAX_LENGTH),
    color: bot.color,
    avatarSet: resolveBotAvatarSet(bot.avatarSet),
    routines: portableTemplateRoutines(bot.routines),
  };
}

function storedRoutines(value: unknown): BotTemplateRoutine[] {
  const parsed = BotTemplateRoutineSchema.array().safeParse(value);
  return parsed.success ? parsed.data : [];
}

function toTemplate(
  row: {
    id: string;
    name: string;
    description: string;
    instructions: string;
    color: string;
    avatarSet: string;
    routines: unknown;
    createdByUserId: string | null;
    updatedAt: Date;
  },
  actor: Actor,
): BotTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    color: row.color,
    avatarSet: resolveBotAvatarSet(row.avatarSet),
    routines: storedRoutines(row.routines),
    mine: row.createdByUserId === actor.userId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listBotTemplates(prisma: PrismaClient, actor: Actor): Promise<BotTemplate[]> {
  const rows = await prisma.botTemplate.findMany({
    where: { spaceId: actor.spaceId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return rows.map((row) => toTemplate(row, actor));
}

/** Publish or refresh the template for one of the actor's bots. */
export async function publishBotTemplate(
  prisma: PrismaClient,
  actor: Actor,
  botId: string,
): Promise<BotTemplate> {
  const bot = await prisma.bot.findFirst({
    where: { id: botId, spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      instructions: true,
      color: true,
      avatarSet: true,
    },
  });
  if (!bot) throw new IsolationError();
  const routines = await prisma.routine.findMany({
    where: { botId: bot.id, spaceId: actor.spaceId, userId: actor.userId },
    select: { name: true, prompt: true, crons: true, timezone: true },
    orderBy: { createdAt: "asc" },
  });
  const content = botTemplateContent({ ...bot, routines });
  const data = {
    ...content,
    routines: content.routines as Prisma.InputJsonValue,
  };
  const existing = await prisma.botTemplate.findFirst({
    where: { spaceId: actor.spaceId, sourceBotId: bot.id },
  });
  if (existing) {
    if (existing.createdByUserId !== actor.userId) throw new IsolationError();
    const updated = await prisma.botTemplate.update({ where: { id: existing.id }, data });
    return toTemplate(updated, actor);
  }
  try {
    const created = await prisma.botTemplate.create({
      data: {
        ...data,
        spaceId: actor.spaceId,
        createdByUserId: actor.userId,
        sourceBotId: bot.id,
      },
    });
    return toTemplate(created, actor);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const winner = await prisma.botTemplate.findFirst({
      where: { spaceId: actor.spaceId, sourceBotId: bot.id, createdByUserId: actor.userId },
    });
    if (!winner) throw error;
    const updated = await prisma.botTemplate.update({ where: { id: winner.id }, data });
    return toTemplate(updated, actor);
  }
}

/** Remove a template the actor published. Copies already made stay. */
export async function removeBotTemplate(
  prisma: PrismaClient,
  actor: Actor,
  templateId: string,
): Promise<void> {
  const deleted = await prisma.botTemplate.deleteMany({
    where: { id: templateId, spaceId: actor.spaceId, createdByUserId: actor.userId },
  });
  if (deleted.count !== 1) throw new IsolationError();
}

/**
 * Make the actor's own bot from a template in their space. The copy gets paused schedules
 * and none of the publisher's chats, memory, files, connections, or credentials.
 */
export async function useBotTemplate(
  prisma: PrismaClient,
  actor: Actor,
  templateId: string,
): Promise<Bot> {
  const row = await prisma.botTemplate.findFirst({
    where: { id: templateId, spaceId: actor.spaceId },
  });
  if (!row) throw new IsolationError();
  const routines = storedRoutines(row.routines);
  return createRepos(prisma).createBot(actor, {
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    notifyOnFinish: true,
    color: row.color,
    avatarSet: resolveBotAvatarSet(row.avatarSet),
    avatarSetPinned: true,
    computerMode: "team",
    seed: async (tx, botId) => {
      if (routines.length === 0) return;
      await tx.routine.createMany({
        data: routines.map((routine) => ({
          spaceId: actor.spaceId,
          botId,
          userId: actor.userId,
          name: routine.name,
          prompt: routine.prompt,
          crons: routine.crons,
          timezone: routine.timezone,
          active: false,
          notify: true,
        })),
      });
    },
  });
}
