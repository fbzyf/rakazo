import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const actor: Actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: false,
};

describe("bot roster visibility contract", () => {
  const client = createRouterClient(
    createRouter({ prisma: {}, events: {} } as unknown as RouterDeps),
    { context: { actor } },
  );

  it("rejects invalid visibility instead of treating it as space", async () => {
    await expect(client.bots.list({ visibility: "all" as never })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.bots.listArchived({ visibility: "team" as never })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.bootstrap({ visibility: "everyone" as never })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.spaces.list({ visibility: "all" as never })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
