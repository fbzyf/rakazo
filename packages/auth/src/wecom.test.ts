import type * as Db from "@rakazo/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth, AuthEnv } from "./index.js";
import { createAuth } from "./index.js";
import {
  exchangeWecomAuthorizationCode,
  rewriteWecomCallbackRequest,
  wecomAuthorizeUrl,
  wecomConfigFromEnv,
} from "./wecom.js";

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: () => memoryAdapter(state.db) }));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Db>()),
  bootstrapUserSpace: vi.fn(),
}));

const origin = "https://app.example.test";
const password = "offline-password12";
const boundEmail = "bound@example.test";
const boundUserid = "wecom-user-bound";
const unboundUserid = "wecom-user-unbound";

let auth: Auth;
let cookies: string;
let bindings: Map<string, { wecomUserid: string; userId: string; email: string }>;
let createUser: ReturnType<typeof vi.fn> | undefined;

function setup(options: Partial<AuthEnv> = {}) {
  bindings = new Map();
  const prisma: Record<string, unknown> = {
    deploymentSettings: {
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    spaceMember: {
      findFirst: vi.fn(async () => ({ id: "existing-space" })),
    },
    member: { findMany: vi.fn(async () => []) },
    messagingIdentity: { deleteMany: vi.fn(async () => ({})) },
    organization: { deleteMany: vi.fn(async () => ({})) },
    wecomUserBinding: {
      findUnique: vi.fn(
        async ({ where }: { where: { wecomUserid: string } }) =>
          bindings.get(where.wecomUserid) ?? null,
      ),
    },
  };
  prisma.$transaction = vi.fn(async (operations: (tx: unknown) => Promise<unknown>) =>
    operations(prisma),
  );
  auth = createAuth(prisma as never, {
    secret: "offline-test-secret-with-at-least-32-characters",
    baseURL: origin,
    webOrigin: origin,
    signupsEnabled: "true",
    signupAllowlist: undefined,
    wecom: {
      corpId: "test-corp-id",
      agentId: "1000082",
      secret: "test-wecom-secret",
      redirectUri: `${origin}/api/auth/callback/wecom`,
      exchangeCode: async (code) => {
        if (code === "bound-code") return { userid: boundUserid };
        if (code === "unbound-code") return { userid: unboundUserid };
        return null;
      },
    },
    ...options,
  });
}

async function request(path: string, body?: unknown) {
  const headers = new Headers({
    origin,
    "content-type": "application/json",
    ...(cookies ? { cookie: cookies } : {}),
  });
  const response = await auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const jar = new Map(
    cookies
      .split("; ")
      .filter(Boolean)
      .map((item) => item.split("=") as [string, string]),
  );
  for (const cookie of response.headers.getSetCookie()) {
    const [key, value] = cookie.split(";")[0]!.split("=");
    if (key) jar.set(key, value ?? "");
  }
  cookies = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  return response;
}

async function signup(email = boundEmail) {
  return request("/sign-up/email", {
    email,
    password,
    name: "Bound User",
  });
}

async function signin(email = boundEmail) {
  return request("/sign-in/email", { email, password });
}

async function startWecom() {
  const response = await request("/wecom");
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  return location.searchParams.get("state")!;
}

async function callback(code: string, oauthState: string, publicPath = false) {
  const raw = new Request(
    `${origin}/api/auth${publicPath ? "/callback/wecom" : "/wecom/callback"}?code=${code}&state=${oauthState}`,
  );
  return auth.handler(publicPath ? rewriteWecomCallbackRequest(raw) : raw);
}

async function sessionFromCookies() {
  return auth.api.getSession({ headers: new Headers({ cookie: cookies }) });
}

function rows(model: string) {
  return state.db[model] ?? [];
}

async function spyCreateUser() {
  const context = await auth.$context;
  createUser = vi.spyOn(context.internalAdapter, "createUser");
}

beforeEach(() => {
  state.db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
  };
  cookies = "";
  createUser = undefined;
  setup();
});

afterEach(() => {
  createUser?.mockRestore();
});

describe("WeCom OAuth skeleton", () => {
  it("maps the locked callback path onto the plugin handler", () => {
    const rewritten = rewriteWecomCallbackRequest(
      new Request(`${origin}/api/auth/callback/wecom?code=bound-code&state=abc`),
    );
    expect(new URL(rewritten.url).pathname).toBe("/api/auth/wecom/callback");
    expect(new URL(rewritten.url).searchParams.get("code")).toBe("bound-code");
  });

  it("redirects start to the WeCom authorize URL with CSRF state", async () => {
    const response = await request("/wecom");
    const location = new URL(response.headers.get("location")!);
    expect(location.origin + location.pathname).toBe(
      "https://open.weixin.qq.com/connect/oauth2/authorize",
    );
    expect(location.searchParams.get("appid")).toBe("test-corp-id");
    expect(location.searchParams.get("agentid")).toBe("1000082");
    expect(location.searchParams.get("scope")).toBe("snsapi_base");
    expect(location.searchParams.get("redirect_uri")).toBe(`${origin}/api/auth/callback/wecom`);
    expect(location.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
    expect(location.hash).toBe("#wechat_redirect");
    expect(
      wecomAuthorizeUrl(
        {
          corpId: "test-corp-id",
          agentId: "1000082",
          secret: "test-wecom-secret",
          redirectUri: `${origin}/api/auth/callback/wecom`,
        },
        location.searchParams.get("state")!,
      ).href,
    ).toBe(location.href);
  });

  it("creates a session for a bound userid and never creates a user", async () => {
    const created = await signup();
    expect(created.status).toBe(200);
    const user = rows("user")[0] as { id: string; email: string };
    bindings.set(boundUserid, {
      wecomUserid: boundUserid,
      userId: user.id,
      email: user.email,
    });
    await spyCreateUser();
    const usersBefore = rows("user").length;
    const oauthState = await startWecom();
    cookies = "";
    const response = await callback("bound-code", oauthState, true);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${origin}/app`);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/better-auth\.session_token=/);
    const jar = new Map(
      response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0]!.split("=") as [string, string]),
    );
    cookies = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    const session = await sessionFromCookies();
    expect(session?.user.id).toBe(user.id);
    expect(session?.user.email).toBe(boundEmail);
    expect(rows("user")).toHaveLength(usersBefore);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects an unbound userid without a session or createUser", async () => {
    const created = await signup();
    expect(created.status).toBe(200);
    await spyCreateUser();
    const usersBefore = rows("user").length;
    const sessionsBefore = rows("session").length;
    const oauthState = await startWecom();
    cookies = "";
    const response = await callback("unbound-code", oauthState);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${origin}/sign-in?reason=unbound`);
    expect(response.headers.getSetCookie().join("\n")).not.toMatch(
      /(?:^|, )(?:__Secure-)?better-auth\.session_token=/,
    );
    expect(await sessionFromCookies()).toBeNull();
    expect(rows("user")).toHaveLength(usersBefore);
    expect(rows("session")).toHaveLength(sessionsBefore);
    expect(createUser).not.toHaveBeenCalled();
    const unbound = await request("/wecom/unbound?reason=unbound");
    expect(unbound.status).toBe(403);
    expect(await unbound.text()).toContain("Unbound");
    expect(unbound.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("keeps email/password sign-in working beside WeCom routes", async () => {
    expect((await signup()).status).toBe(200);
    cookies = "";
    expect((await signin()).status).toBe(200);
    expect((await sessionFromCookies())?.user.email).toBe(boundEmail);
  });

  it("returns 503 when WeCom env is missing instead of crashing", async () => {
    setup({ wecom: undefined });
    const response = await request("/wecom");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "WECOM_NOT_CONFIGURED" });
  });

  it("rejects a forged state", async () => {
    expect((await signup()).status).toBe(200);
    cookies = "";
    await spyCreateUser();
    const response = await callback("bound-code", "forged-state");
    expect(response.status).toBe(400);
    expect(await sessionFromCookies()).toBeNull();
    expect(createUser).not.toHaveBeenCalled();
  });
});

describe("WeCom env", () => {
  const complete = {
    WECOM_CORP_ID: "test-corp-id",
    WECOM_SECRET: "test-wecom-secret",
    WECOM_REDIRECT_URI: `${origin}/api/auth/callback/wecom`,
  };

  it("stays unconfigured when keys are missing", () => {
    expect(wecomConfigFromEnv({})).toBeUndefined();
    expect(wecomConfigFromEnv({ WECOM_AGENT_ID: "1000082" })).toBeUndefined();
    expect(wecomConfigFromEnv({ WECOM_CORP_ID: "test-corp-id" })).toBeUndefined();
  });

  it("loads placeholders and defaults the confirmed agent id", () => {
    expect(wecomConfigFromEnv(complete)).toEqual({
      corpId: "test-corp-id",
      agentId: "1000082",
      secret: "test-wecom-secret",
      redirectUri: `${origin}/api/auth/callback/wecom`,
    });
    expect(wecomConfigFromEnv({ ...complete, WECOM_AGENT_ID: "1000099" })?.agentId).toBe("1000099");
  });

  it("ignores an unusable redirect URI", () => {
    expect(wecomConfigFromEnv({ ...complete, WECOM_REDIRECT_URI: "not-a-url" })).toBeUndefined();
  });
});

describe("WeCom token exchange", () => {
  const corp = { corpId: "test-corp-id", secret: "test-wecom-secret" };
  const liveCode = "live-code";
  const accessToken = "fake-access-token";

  function wecomUrl(input: string | URL | Request) {
    return new URL(input instanceof Request ? input.url : String(input));
  }

  function tokenOk(input: string | URL | Request, errcode: unknown = 0) {
    const url = wecomUrl(input);
    expect(url.pathname).toBe("/cgi-bin/gettoken");
    expect(url.searchParams.get("corpid")).toBe(corp.corpId);
    expect(url.searchParams.get("corpsecret")).toBe(corp.secret);
    return Response.json({ access_token: accessToken, errcode });
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.mocked(console.warn).mockRestore();
  });

  it("reads userid from the official auth/getuserinfo API", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = wecomUrl(input);
      if (url.pathname.endsWith("/gettoken")) return tokenOk(input);
      expect(url.href.split("?")[0]).toBe("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo");
      expect(url.searchParams.get("access_token")).toBe(accessToken);
      expect(url.searchParams.get("code")).toBe(liveCode);
      return Response.json({ userid: boundUserid, errcode: 0, errmsg: "ok" });
    });
    await expect(exchangeWecomAuthorizationCode(corp, liveCode, fetchImpl)).resolves.toEqual({
      userid: boundUserid,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("treats errcode 0 and UserId as success for 自建应用网页授权", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = wecomUrl(input);
      if (url.pathname.endsWith("/gettoken")) return tokenOk(input, "0");
      expect(url.pathname).toBe("/cgi-bin/auth/getuserinfo");
      return Response.json({ UserId: boundUserid, errcode: "0", errmsg: "ok" });
    });
    await expect(exchangeWecomAuthorizationCode(corp, liveCode, fetchImpl)).resolves.toEqual({
      userid: boundUserid,
    });
  });

  it("falls back to classic user/getuserinfo when the official path has no userid", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = wecomUrl(input);
      if (url.pathname.endsWith("/gettoken")) return tokenOk(input);
      if (url.pathname === "/cgi-bin/auth/getuserinfo") {
        return Response.json({ errcode: 48001, errmsg: "api unauthorized" });
      }
      expect(url.pathname).toBe("/cgi-bin/user/getuserinfo");
      expect(url.searchParams.get("code")).toBe(liveCode);
      return Response.json({ UserId: boundUserid, errcode: 0, errmsg: "ok" });
    });
    await expect(exchangeWecomAuthorizationCode(corp, liveCode, fetchImpl)).resolves.toEqual({
      userid: boundUserid,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs gettoken errcode/errmsg without secret, token, or code", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      expect(wecomUrl(input).pathname).toBe("/cgi-bin/gettoken");
      return Response.json({ errcode: 40001, errmsg: "invalid credential" });
    });
    await expect(exchangeWecomAuthorizationCode(corp, liveCode, fetchImpl)).resolves.toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(line).toContain("step=gettoken");
    expect(line).toContain("errcode=40001");
    expect(line).toContain("errmsg=invalid credential");
    expect(line).not.toContain(corp.secret);
    expect(line).not.toContain(accessToken);
    expect(line).not.toContain(liveCode);
  });

  it("logs getuserinfo errcode/errmsg and does not retry after invalid code", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = wecomUrl(input);
      if (url.pathname.endsWith("/gettoken")) return tokenOk(input);
      expect(url.pathname).toBe("/cgi-bin/auth/getuserinfo");
      return Response.json({ errcode: 40029, errmsg: "invalid code" });
    });
    await expect(exchangeWecomAuthorizationCode(corp, liveCode, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(1);
    const line = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
    expect(line).toContain("step=getuserinfo");
    expect(line).toContain("errcode=40029");
    expect(line).toContain("errmsg=invalid code");
    expect(line).not.toContain(corp.secret);
    expect(line).not.toContain(accessToken);
    expect(line).not.toContain(liveCode);
  });
});
