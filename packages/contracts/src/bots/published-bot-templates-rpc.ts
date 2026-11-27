import { oc } from "@orpc/contract";
import * as z from "zod";
import { Id } from "../ids.js";
import { botId } from "../rpc/inputs.js";
import { BotSchema } from "./bot.js";
import {
  PublishedBotTemplateAudienceSchema,
  PublishedBotTemplateSchema,
} from "./published-bot-template.js";

/** Colleague-published bots. The ready-made catalog stays on `bots/templates`. */
export const publishedBotTemplatesRpc = {
  botTemplates: {
    list: oc.output(z.array(PublishedBotTemplateSchema)),
    publish: oc
      .input(botId.extend({ audience: PublishedBotTemplateAudienceSchema.default("space") }))
      .output(PublishedBotTemplateSchema),
    remove: oc.input(z.object({ templateId: Id })).output(z.object({ ok: z.literal(true) })),
    use: oc.input(z.object({ templateId: Id })).output(BotSchema),
  },
};
