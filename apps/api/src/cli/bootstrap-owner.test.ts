import { expect, it } from "vitest";
import { accountsFromEnv, generateAccountPassword, parseAccountLines } from "./bootstrap-owner.js";

it("parses emails, names, comments and duplicates", () => {
  expect(
    parseAccountLines(`
# skip
itservice@example.com\tIT Service
AMY@example.com
amy@example.com
second@example.com,third@example.com
`),
  ).toEqual([
    { email: "itservice@example.com", name: "IT Service" },
    { email: "amy@example.com", name: "amy" },
    { email: "second@example.com", name: "second" },
    { email: "third@example.com", name: "third" },
  ]);
});

it("rejects a line that is not an email", () => {
  expect(() => parseAccountLines("not-an-email")).toThrow(/Invalid account email/);
});

it("generates a 16+ character password without #", () => {
  const password = generateAccountPassword(() => Buffer.from("0123456789ab"));
  expect(password.length).toBeGreaterThanOrEqual(16);
  expect(password).not.toContain("#");
  expect(password.endsWith("Aa1")).toBe(true);
});

it("reads OWNER_EMAIL before stdin so a closed pipe cannot drop the account list", async () => {
  const previous = {
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    OWNER_EMAILS: process.env.OWNER_EMAILS,
    OWNER_NAME: process.env.OWNER_NAME,
  };
  process.env.OWNER_EMAIL = "Owner@example.com";
  process.env.OWNER_NAME = "Pat";
  delete process.env.OWNER_EMAILS;
  try {
    await expect(
      accountsFromEnv({
        isTTY: false,
        read: async () => {
          throw new Error("stdin should not be read");
        },
      }),
    ).resolves.toEqual([{ email: "owner@example.com", name: "Pat" }]);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
