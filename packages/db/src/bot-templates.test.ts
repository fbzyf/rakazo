import { describe, expect, it } from "vitest";
import { botTemplateContent, portableTemplateRoutines } from "./bot-templates.js";
import { IsolationError } from "./scope.js";

describe("portable template routines", () => {
  it("keeps a weekday schedule and drops one-shot, mixed, empty, and broken crons", () => {
    expect(
      portableTemplateRoutines([
        { name: "Morning", prompt: "Summarize", crons: ["0 9 * * 1-5"], timezone: "UTC" },
        { name: "Once", prompt: "Later", crons: ["@once"], timezone: "UTC" },
        { name: "Mixed", prompt: "Both", crons: ["@once", "0 9 * * *"], timezone: "UTC" },
        { name: "Webhook", prompt: "Ping", crons: [], timezone: "UTC" },
        { name: "Bad zone", prompt: "Nope", crons: ["0 9 * * *"], timezone: "Not/AZone" },
        { name: "Bad cron", prompt: "Nope", crons: ["not a cron"], timezone: "UTC" },
        { name: "  ", prompt: "blank name", crons: ["0 9 * * *"], timezone: "UTC" },
      ]),
    ).toEqual([{ name: "Morning", prompt: "Summarize", crons: ["0 9 * * 1-5"], timezone: "UTC" }]);
  });

  it("stops at twenty schedules and drops a name that would end on a lone surrogate", () => {
    const rows = Array.from({ length: 25 }, (_, index) => ({
      name: `Routine ${index}`,
      prompt: "Run",
      crons: ["0 9 * * *"],
      timezone: "UTC",
    }));
    expect(portableTemplateRoutines(rows)).toHaveLength(20);

    const content = botTemplateContent({
      name: `${"a".repeat(79)}🙂`,
      description: "",
      instructions: "",
      color: "ink",
      routines: [],
    });
    expect(content.name).toBe("a".repeat(79));
    expect(() =>
      botTemplateContent({
        name: "   ",
        description: "",
        instructions: "",
        color: "ink",
        routines: [],
      }),
    ).toThrow(IsolationError);
  });
});
