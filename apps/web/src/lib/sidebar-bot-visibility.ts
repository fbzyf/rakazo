import type { BotRosterVisibility } from "@rakazo/contracts";
import { createStoredPreference, readStoredString } from "./stored-preference";

const KEY_PREFIX = "rakazo.sidebar-bot-visibility.";
const preferences = new Map<
  string,
  ReturnType<typeof createStoredPreference<BotRosterVisibility>>
>();

export function sidebarBotVisibilityKey(spaceId: string): string {
  return `${KEY_PREFIX}${spaceId}`;
}

export function parseSidebarBotVisibility(raw: string | null): BotRosterVisibility {
  return raw === "space" ? "space" : "mine";
}

/** Per-space sidebar roster: mine by default, space when the person asked to see everyone. */
export function sidebarBotVisibilityPreference(spaceId: string) {
  const existing = preferences.get(spaceId);
  if (existing) return existing;
  const preference = createStoredPreference<BotRosterVisibility>({
    key: sidebarBotVisibilityKey(spaceId),
    parse: parseSidebarBotVisibility,
    serialize: (value) => (value === "space" ? "space" : null),
  });
  preferences.set(spaceId, preference);
  return preference;
}

export function readSidebarBotVisibility(spaceId: string | null | undefined): BotRosterVisibility {
  if (!spaceId) return "mine";
  const existing = preferences.get(spaceId);
  if (existing) return existing.get();
  return parseSidebarBotVisibility(readStoredString(sidebarBotVisibilityKey(spaceId)));
}

export function rosterVisibilityInput(visibility: BotRosterVisibility) {
  return visibility === "space" ? { visibility } : {};
}
