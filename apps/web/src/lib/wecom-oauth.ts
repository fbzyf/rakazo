import { isWeComWebView } from "./wecom-webview";

/** Start WeCom webpage OAuth (server 302 to 企微 authorize). */
export const WECOM_OAUTH_START_PATH = "/api/auth/wecom";

/** Server-owned callback; the client only survives the return / session cookie. */
export const WECOM_OAUTH_CALLBACK_PATH = "/api/auth/callback/wecom";

/** Unbound refusal. Query `reason=unbound` (or Auth `?error=unbound`). */
export const WECOM_OAUTH_UNBOUND_PATH = "/api/auth/wecom/unbound";

export function startWeComOAuth(
  assign: (url: string) => void = (url) => {
    window.location.assign(url);
  },
): void {
  assign(WECOM_OAUTH_START_PATH);
}

export function isWeComWorkbench(
  userAgent: string | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator.userAgent,
  root: Pick<Element, "hasAttribute"> | null = typeof document === "undefined"
    ? null
    : document.documentElement,
): boolean {
  return isWeComWebView(userAgent) || Boolean(root?.hasAttribute("data-wecom"));
}

/** Map Auth return query to a Better Auth-style `error` code. */
export function wecomReturnIssue(search: URLSearchParams): string | null {
  if (search.get("reason") === "unbound") return "unbound";
  const error = search.get("error");
  return error || null;
}

export function canAutoStartWeComOAuth(input: {
  wecomEnabled: boolean;
  inWeCom: boolean;
  mode: "in" | "up" | "forgot";
  returnIssue: string | null;
}): boolean {
  return input.wecomEnabled && input.inWeCom && input.mode === "in" && !input.returnIssue;
}
