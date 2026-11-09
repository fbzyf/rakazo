import { randomBytes, randomUUID } from "node:crypto";
import { text } from "node:stream/consumers";
import { pathToFileURL } from "node:url";
import { contentKeyProviderFromEnv, unwrapEnvFromKeyManager } from "@rakazo/adapters";
import { createAuth } from "@rakazo/auth";
import { displayName } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { bootstrapUserSpace, createDb, runAsSystem } from "@rakazo/db";

export type ProvisionAccount = { email: string; name: string };

const MIN_PASSWORD_LENGTH = 16;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function envFlag(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** One account per line: `email` or `email<TAB>name`. Also accepts comma-separated emails. */
export function parseAccountLines(input: string): ProvisionAccount[] {
  const seen = new Set<string>();
  const accounts: ProvisionAccount[] = [];
  for (const raw of input.split(/[\n,]+/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [emailPart, ...nameParts] = line.split("\t");
    const email = emailPart?.trim().toLowerCase() ?? "";
    if (!email.includes("@")) throw new Error(`Invalid account email: ${line}`);
    if (seen.has(email)) continue;
    seen.add(email);
    const local = email.slice(0, email.indexOf("@")) || "Account";
    accounts.push({ email, name: displayName(nameParts.join("\t"), local) });
  }
  return accounts;
}

export function generateAccountPassword(bytes: (size: number) => Buffer = randomBytes): string {
  return `${bytes(12).toString("hex")}Aa1`;
}

export async function accountsFromEnv(stdin: {
  isTTY?: boolean | undefined;
  read: () => Promise<string>;
}): Promise<ProvisionAccount[]> {
  const listed = process.env.OWNER_EMAILS?.trim();
  if (listed) return parseAccountLines(listed);
  const email = process.env.OWNER_EMAIL?.trim();
  if (email) return parseAccountLines(`${email}\t${process.env.OWNER_NAME ?? ""}`);
  if (!stdin.isTTY) {
    const parsed = parseAccountLines(await stdin.read());
    if (parsed.length > 0) return parsed;
  }
  throw new Error("OWNER_EMAIL is required");
}

function report(status: string, email: string, password = "") {
  process.stdout.write(`${status}\t${email}\t${password}\n`);
}

async function provisionAccount(
  prisma: PrismaClient,
  account: ProvisionAccount,
  auth: ReturnType<typeof createAuth>,
): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: account.email } });
  const reset = envFlag(process.env.OWNER_RESET_PASSWORD);
  const supplied = process.env.OWNER_PASSWORD;
  const context = await auth.$context;

  if (existing?.emailVerified && !reset) {
    report("exists", account.email);
  } else if (existing && !existing.emailVerified) {
    const password = required("OWNER_PASSWORD");
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("OWNER_PASSWORD must contain at least 16 characters");
    }
    const credential = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
    });
    if (
      !credential?.password ||
      !(await context.password.verify({ hash: credential.password, password }))
    ) {
      throw new Error("Existing account password does not match; account was not verified");
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { emailVerified: true, name: account.name },
    });
    report("verified", account.email, password);
  } else if (existing && reset) {
    const password = supplied && supplied.length > 0 ? supplied : generateAccountPassword();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("OWNER_PASSWORD must contain at least 16 characters");
    }
    const hash = await context.password.hash(password);
    const credential = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
    });
    if (credential) {
      await prisma.account.update({ where: { id: credential.id }, data: { password: hash } });
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          accountId: existing.id,
          userId: existing.id,
          providerId: "credential",
          password: hash,
        },
      });
    }
    report("reset", account.email, password);
  } else {
    const password = supplied && supplied.length > 0 ? supplied : generateAccountPassword();
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new Error("OWNER_PASSWORD must contain at least 16 characters");
    }
    const hash = await context.password.hash(password);
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        name: account.name,
        email: account.email,
        emailVerified: true,
        accounts: {
          create: {
            id: randomUUID(),
            accountId: userId,
            providerId: "credential",
            password: hash,
          },
        },
      },
    });
    report("created", account.email, password);
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { email: account.email } });
  await bootstrapUserSpace(prisma, user, { signupsEnabled: "false", signupAllowlist: "" });
}

export async function bootstrap(prisma: PrismaClient, auth: ReturnType<typeof createAuth>) {
  const accounts = await accountsFromEnv({
    isTTY: process.stdin.isTTY,
    read: async () => text(process.stdin),
  });
  process.stdout.write("status\temail\tpassword\n");
  const failures: string[] = [];
  for (const account of accounts) {
    try {
      await provisionAccount(prisma, account, auth);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${account.email}: ${message}`);
      process.stderr.write(`${account.email}: ${message}\n`);
    }
  }
  await prisma.deploymentSettings.update({
    where: { id: "default" },
    data: { signupsEnabled: false, signupPolicyInitialized: true },
  });
  if (failures.length > 0) {
    throw new Error(`${failures.length} account(s) failed`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await unwrapEnvFromKeyManager();
  const { prisma, pool } = createDb(required("DATABASE_URL"), {
    keyProvider: contentKeyProviderFromEnv(),
  });
  try {
    const auth = createAuth(prisma, {
      secret: required("BETTER_AUTH_SECRET"),
      baseURL: required("BETTER_AUTH_URL"),
      webOrigin: required("BETTER_AUTH_URL"),
      signupsEnabled: "false",
      signupAllowlist: "",
    });
    await runAsSystem("private account bootstrap", () => bootstrap(prisma, auth));
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
