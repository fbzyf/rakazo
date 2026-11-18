import * as z from "zod";
import { BotAvatarSetSchema } from "./bot-avatar.js";
import { Id } from "./ids.js";

/** Who can see a published bot. `space` is one workspace. `signed_in` is anyone who can log in. */
export const BotTemplateAudienceSchema = z.enum(["space", "signed_in"]);
export type BotTemplateAudience = z.infer<typeof BotTemplateAudienceSchema>;

/** A recurring schedule copied with a published bot. One-shot and connection triggers are left out. */
export const PublishedBotTemplateRoutineSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  crons: z.array(z.string()),
  timezone: z.string(),
});
export type PublishedBotTemplateRoutine = z.infer<typeof PublishedBotTemplateRoutineSchema>;

/**
 * A colleague's published bot, safe to copy. Distinct from the ready-made catalog in
 * `bot-template.ts`. `mine` is true only for the publisher.
 */
export const PublishedBotTemplateSchema = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  color: z.string(),
  avatarSet: BotAvatarSetSchema,
  routines: z.array(PublishedBotTemplateRoutineSchema),
  audience: BotTemplateAudienceSchema,
  mine: z.boolean(),
  updatedAt: z.string(),
});
export type PublishedBotTemplate = z.infer<typeof PublishedBotTemplateSchema>;
