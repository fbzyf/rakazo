// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  canAutoStartWeComOAuth,
  isWeComWorkbench,
  startWeComOAuth,
  WECOM_OAUTH_CALLBACK_PATH,
  WECOM_OAUTH_START_PATH,
  WECOM_OAUTH_UNBOUND_PATH,
  wecomReturnIssue,
} from "./wecom-oauth";

afterEach(() => {
  document.documentElement.removeAttribute("data-wecom");
});

it("locks Ben's WeCom OAuth paths", () => {
  expect(WECOM_OAUTH_START_PATH).toBe("/api/auth/wecom");
  expect(WECOM_OAUTH_CALLBACK_PATH).toBe("/api/auth/callback/wecom");
  expect(WECOM_OAUTH_UNBOUND_PATH).toBe("/api/auth/wecom/unbound");
});

it("starts OAuth with a same-origin assign to the locked start path", () => {
  const assign = vi.fn();
  startWeComOAuth(assign);
  expect(assign).toHaveBeenCalledWith("/api/auth/wecom");
});

it("treats wxwork UA or html[data-wecom] as the WeCom workbench", () => {
  expect(isWeComWorkbench("Mozilla/5.0 wxwork/4.1.28", document.documentElement)).toBe(true);
  expect(isWeComWorkbench("Mozilla/5.0", document.documentElement)).toBe(false);
  document.documentElement.dataset.wecom = "";
  expect(isWeComWorkbench("Mozilla/5.0", document.documentElement)).toBe(true);
});

it("maps unbound reason and Auth error query codes", () => {
  expect(wecomReturnIssue(new URLSearchParams("reason=unbound"))).toBe("unbound");
  expect(wecomReturnIssue(new URLSearchParams("error=access_denied"))).toBe("access_denied");
  expect(wecomReturnIssue(new URLSearchParams("reason=unbound&error=other"))).toBe("unbound");
  expect(wecomReturnIssue(new URLSearchParams())).toBeNull();
});

it("auto-starts only on sign-in inside WeCom once the capability is on", () => {
  const allowed = {
    wecomEnabled: true,
    inWeCom: true,
    mode: "in" as const,
    returnIssue: null,
  };
  expect(canAutoStartWeComOAuth(allowed)).toBe(true);
  expect(canAutoStartWeComOAuth({ ...allowed, wecomEnabled: false })).toBe(false);
  expect(canAutoStartWeComOAuth({ ...allowed, inWeCom: false })).toBe(false);
  expect(canAutoStartWeComOAuth({ ...allowed, mode: "up" })).toBe(false);
  expect(canAutoStartWeComOAuth({ ...allowed, returnIssue: "unbound" })).toBe(false);
});
