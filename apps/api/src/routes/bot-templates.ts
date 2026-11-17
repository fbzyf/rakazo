import type { Bot } from "@rakazo/contracts";
import {
  listBotTemplates,
  publishBotTemplate,
  removeBotTemplate,
  useBotTemplate,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { enqueueBotIntroRun, mapSpaceLifecycleError } from "./bots.js";
import type { RouterContext } from "./context.js";

export function botTemplateRoutes(ctx: RouterContext) {
  const { deps, authed } = ctx;
  return {
    botTemplates: {
      list: authed.botTemplates.list.handler(async ({ context }) =>
        listBotTemplates(deps.prisma, context.actor),
      ),
      publish: authed.botTemplates.publish.handler(async ({ context, input }) =>
        publishBotTemplate(deps.prisma, context.actor, input.botId, input.audience),
      ),
      remove: authed.botTemplates.remove.handler(async ({ context, input }) => {
        await removeBotTemplate(deps.prisma, context.actor, input.templateId);
        return { ok: true as const };
      }),
      use: authed.botTemplates.use.handler(async ({ context, input }) => {
        let bot: Bot;
        try {
          bot = await useBotTemplate(deps.prisma, context.actor, input.templateId);
        } catch (error) {
          throw mapSpaceLifecycleError(error);
        }
        await enqueueBotIntroRun(deps, context.actor, bot).catch((error) => {
          getLogger().error("bot template intro run enqueue", error);
        });
        return bot;
      }),
    },
  };
}
