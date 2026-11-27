import * as z from "zod";
import { Id } from "../ids.js";
import { BotAvatarSetSchema } from "./bot-avatar.js";

/** Who can see a colleague-published bot. `space` is one workspace. `signed_in` is anyone who can log in. */
export const PublishedBotTemplateAudienceSchema = z.enum(["space", "signed_in"]);
export type PublishedBotTemplateAudience = z.infer<typeof PublishedBotTemplateAudienceSchema>;

/** A recurring schedule copied with a colleague-published bot. One-shot and connection triggers are left out. */
export const PublishedBotTemplateRoutineSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  crons: z.array(z.string()),
  timezone: z.string(),
});
export type PublishedBotTemplateRoutine = z.infer<typeof PublishedBotTemplateRoutineSchema>;

/**
 * A bot someone in the workspace published for colleagues to copy.
 * Distinct from the ready-made catalog template: this one carries the publisher's instructions.
 */
export const PublishedBotTemplateSchema = z.object({
  id: Id,
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  color: z.string(),
  avatarSet: BotAvatarSetSchema,
  routines: z.array(PublishedBotTemplateRoutineSchema),
  audience: PublishedBotTemplateAudienceSchema,
  mine: z.boolean(),
  updatedAt: z.string(),
});
export type PublishedBotTemplate = z.infer<typeof PublishedBotTemplateSchema>;
