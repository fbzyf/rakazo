import { randomBytes } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

export const WECOM_DEFAULT_AGENT_ID = "1000082";
export const WECOM_START_PATH = "/wecom";
export const WECOM_CALLBACK_PATH = "/callback/wecom";
export const WECOM_CALLBACK_HANDLER_PATH = "/wecom/callback";
export const WECOM_UNBOUND_PATH = "/wecom/unbound";

const STATE_PREFIX = "wecom-oauth-";
const STATE_TTL_MS = 10 * 60_000;
const AUTHORIZE_URL = "https://open.weixin.qq.com/connect/oauth2/authorize";
const TOKEN_URL = "https://qyapi.weixin.qq.com/cgi-bin/gettoken";
/** Official 自建应用「获取访问用户身份」 (doc 91023). */
const USERINFO_URL = "https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo";
/** Classic 网页授权 path; still served and returns `UserId`. */
const USERINFO_URL_CLASSIC = "https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo";

type WecomStep = "gettoken" | "getuserinfo";

interface WecomApiBody {
  access_token?: unknown;
  userid?: unknown;
  UserId?: unknown;
  openid?: unknown;
  OpenId?: unknown;
  errcode?: unknown;
  errmsg?: unknown;
}

function wecomErrcodeOk(errcode: unknown): boolean {
  return errcode === undefined || errcode === null || errcode === 0 || errcode === "0";
}

function wecomCodeConsumed(errcode: unknown): boolean {
  return errcode === 40029 || errcode === "40029";
}

function readWecomUserid(body: WecomApiBody): string | undefined {
  for (const value of [body.userid, body.UserId]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function wecomHasOpenId(body: WecomApiBody): boolean {
  return (
    (typeof body.openid === "string" && Boolean(body.openid.trim())) ||
    (typeof body.OpenId === "string" && Boolean(body.OpenId.trim()))
  );
}

function logWecomExchangeFailure(
  step: WecomStep,
  details: { http?: number; errcode?: unknown; errmsg?: unknown; reason?: string },
): void {
  const parts = [`WeCom OAuth exchange failed step=${step}`];
  if (details.http !== undefined) parts.push(`http=${details.http}`);
  if (details.errcode !== undefined) parts.push(`errcode=${String(details.errcode)}`);
  if (typeof details.errmsg === "string" && details.errmsg) {
    parts.push(`errmsg=${details.errmsg}`);
  }
  if (details.reason) parts.push(`reason=${details.reason}`);
  console.warn(parts.join(" "));
}

async function readWecomJson(response: Response): Promise<WecomApiBody | undefined> {
  try {
    return (await response.json()) as WecomApiBody;
  } catch {
    return undefined;
  }
}

export interface WecomConfig {
  corpId: string;
  agentId: string;
  secret: string;
  redirectUri: string;
  /** Tests inject this. Production exchanges `code` with the official token API. */
  exchangeCode?: (code: string) => Promise<{ userid: string } | null>;
}

export function wecomConfigFromEnv(source: NodeJS.ProcessEnv): WecomConfig | undefined {
  const corpId = source.WECOM_CORP_ID?.trim() || undefined;
  const secret = source.WECOM_SECRET?.trim() || undefined;
  const redirectUri = source.WECOM_REDIRECT_URI?.trim() || undefined;
  const agentId = source.WECOM_AGENT_ID?.trim() || WECOM_DEFAULT_AGENT_ID;
  if (!corpId || !secret || !redirectUri) return undefined;
  try {
    const url = new URL(redirectUri);
    if (url.username || url.password) return undefined;
  } catch {
    return undefined;
  }
  return { corpId, agentId, secret, redirectUri };
}

export interface WecomBindingStore {
  wecomUserBinding: {
    findUnique: (args: {
      where: { wecomUserid: string };
    }) => Promise<{ userId: string; email: string } | null>;
  };
}

/**
 * Better Auth registers `/callback/:id` for social OAuth. The locked WeCom
 * callback is `/api/auth/callback/wecom`, so the API rewrites it here.
 */
export function rewriteWecomCallbackRequest(request: Request): Request {
  const url = new URL(request.url);
  if (!url.pathname.endsWith(WECOM_CALLBACK_PATH)) return request;
  url.pathname = `${url.pathname.slice(0, -WECOM_CALLBACK_PATH.length)}${WECOM_CALLBACK_HANDLER_PATH}`;
  return new Request(url, request);
}

export function wecomAuthorizeUrl(config: WecomConfig, state: string): URL {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("appid", config.corpId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_base");
  url.searchParams.set("state", state);
  url.searchParams.set("agentid", config.agentId);
  url.hash = "wechat_redirect";
  return url;
}

export async function exchangeWecomAuthorizationCode(
  config: Pick<WecomConfig, "corpId" | "secret">,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ userid: string } | null> {
  if (!code.trim()) return null;
  const tokenUrl = new URL(TOKEN_URL);
  tokenUrl.searchParams.set("corpid", config.corpId);
  tokenUrl.searchParams.set("corpsecret", config.secret);
  const tokenResponse = await fetchImpl(tokenUrl);
  const tokenBody = await readWecomJson(tokenResponse);
  const accessToken = tokenBody?.access_token;
  if (
    !tokenBody ||
    !wecomErrcodeOk(tokenBody.errcode) ||
    typeof accessToken !== "string" ||
    !accessToken
  ) {
    logWecomExchangeFailure("gettoken", {
      http: tokenResponse.status,
      errcode: tokenBody?.errcode,
      errmsg: tokenBody?.errmsg,
      reason: tokenBody ? undefined : "invalid_json",
    });
    return null;
  }

  const tryUserinfo = async (endpoint: string) => {
    const infoUrl = new URL(endpoint);
    infoUrl.searchParams.set("access_token", accessToken);
    infoUrl.searchParams.set("code", code);
    const infoResponse = await fetchImpl(infoUrl);
    return { infoResponse, info: await readWecomJson(infoResponse) };
  };

  const official = await tryUserinfo(USERINFO_URL);
  if (official.info && wecomErrcodeOk(official.info.errcode)) {
    const userid = readWecomUserid(official.info);
    if (userid) return { userid };
  }

  // Official path returned no member id. Retry classic unless WeCom already
  // consumed the one-time code (40029).
  if (!wecomCodeConsumed(official.info?.errcode)) {
    const classic = await tryUserinfo(USERINFO_URL_CLASSIC);
    if (classic.info && wecomErrcodeOk(classic.info.errcode)) {
      const userid = readWecomUserid(classic.info);
      if (userid) return { userid };
    }
  }

  logWecomExchangeFailure("getuserinfo", {
    http: official.infoResponse.status,
    errcode: official.info?.errcode,
    errmsg: official.info?.errmsg,
    reason: !official.info
      ? "invalid_json"
      : wecomErrcodeOk(official.info.errcode) && wecomHasOpenId(official.info)
        ? "openid_not_userid"
        : wecomErrcodeOk(official.info.errcode)
          ? "missing_userid"
          : undefined,
  });
  return null;
}

function notConfigured(): never {
  throw new APIError("SERVICE_UNAVAILABLE", {
    code: "WECOM_NOT_CONFIGURED",
    message: "WeCom OAuth is not configured",
  });
}

function signInUnboundLocation(webOrigin: string): string {
  const url = new URL("/sign-in", webOrigin);
  url.searchParams.set("reason", "unbound");
  return url.href;
}

function unboundResponse(request: Request): Response {
  if (request.headers.get("accept")?.includes("application/json")) {
    return Response.json({ error: "unbound" }, { status: 403 });
  }
  return new Response(`<!doctype html><title>Unbound</title><p>Unbound</p>`, {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function wecomAuth(
  prisma: WecomBindingStore,
  env: { wecom?: WecomConfig; webOrigin: string },
): BetterAuthPlugin {
  const requireConfig = () => env.wecom ?? notConfigured();

  const resolveUserid = async (config: WecomConfig, code: string) => {
    if (config.exchangeCode) return config.exchangeCode(code);
    return exchangeWecomAuthorizationCode(config, code);
  };

  return {
    id: "wecom",
    endpoints: {
      wecomStart: createAuthEndpoint(WECOM_START_PATH, { method: "GET" }, async (ctx) => {
        const config = requireConfig();
        const state = randomBytes(16).toString("hex");
        await ctx.context.internalAdapter.createVerificationValue({
          identifier: `${STATE_PREFIX}${state}`,
          value: "1",
          expiresAt: new Date(Date.now() + STATE_TTL_MS),
        });
        throw ctx.redirect(wecomAuthorizeUrl(config, state).href);
      }),
      wecomCallback: createAuthEndpoint(
        WECOM_CALLBACK_HANDLER_PATH,
        { method: "GET" },
        async (ctx) => {
          const config = requireConfig();
          const request = ctx.request;
          if (!request) throw new APIError("BAD_REQUEST", { code: "WECOM_INVALID_CALLBACK" });
          const params = new URL(request.url).searchParams;
          const code = params.get("code")?.trim() ?? "";
          const state = params.get("state")?.trim() ?? "";
          if (!code || !state) {
            throw new APIError("BAD_REQUEST", { code: "WECOM_INVALID_CALLBACK" });
          }
          const marker = await ctx.context.internalAdapter.consumeVerificationValue(
            `${STATE_PREFIX}${state}`,
          );
          if (!marker) {
            throw new APIError("BAD_REQUEST", { code: "WECOM_INVALID_STATE" });
          }
          const exchanged = await resolveUserid(config, code);
          if (!exchanged?.userid) {
            throw new APIError("BAD_REQUEST", { code: "WECOM_EXCHANGE_FAILED" });
          }
          const binding = await prisma.wecomUserBinding.findUnique({
            where: { wecomUserid: exchanged.userid },
          });
          const user = binding
            ? await ctx.context.internalAdapter.findUserById(binding.userId)
            : null;
          // Bound whitelist only. Never createUser / sign-up from this path.
          if (!user) throw ctx.redirect(signInUnboundLocation(env.webOrigin));
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", { code: "WECOM_SESSION_FAILED" });
          }
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(new URL("/app", env.webOrigin).href);
        },
      ),
      wecomUnbound: createAuthEndpoint(WECOM_UNBOUND_PATH, { method: "GET" }, async (ctx) => {
        if (!ctx.request) throw new APIError("BAD_REQUEST");
        return unboundResponse(ctx.request);
      }),
    },
  };
}
