// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authClient } from "../lib/auth";
import type { AuthCapabilities } from "../lib/auth-capabilities";
import { fetchAuthCapabilities } from "../lib/auth-capabilities";
import { AuthPage } from "./Auth";

const wecom = vi.hoisted(() => ({
  isWeComWebView: vi.fn(() => false),
  commitWeComSession: vi.fn(),
}));
const wecomOAuth = vi.hoisted(() => ({
  startWeComOAuth: vi.fn(),
}));
vi.mock("../lib/wecom-webview", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wecom-webview")>();
  return {
    ...actual,
    isWeComWebView: wecom.isWeComWebView,
    commitWeComSession: wecom.commitWeComSession,
  };
});
vi.mock("../lib/wecom-oauth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/wecom-oauth")>();
  return {
    ...actual,
    startWeComOAuth: wecomOAuth.startWeComOAuth,
  };
});

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray | { message: string }, ...values: unknown[]) =>
      "message" in strings
        ? strings.message
        : strings.reduce((text, part, index) => text + part + (values[index] ?? ""), ""),
  }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@rakazo/ui-web", () => ({
  Button: ({
    children,
    variant,
    size,
    ...props
  }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => (
    <button data-variant={variant ?? "default"} data-size={size} {...props}>
      {children}
    </button>
  ),
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
  InputOTP: ({
    maxLength,
    onChange,
    onComplete,
    children: _children,
    ...props
  }: Omit<React.ComponentProps<"input">, "onChange"> & {
    onChange: (value: string) => void;
    onComplete?: (value: string) => void;
  }) => (
    <input
      {...props}
      data-otp=""
      onChange={(event) => {
        onChange(event.target.value);
        if (event.target.value.length === maxLength) onComplete?.(event.target.value);
      }}
    />
  ),
  InputOTPGroup: () => null,
  InputOTPSlot: () => null,
  Label: ({ children, htmlFor, ...props }: React.ComponentProps<"label">) => (
    <label htmlFor={htmlFor} {...props}>
      {children}
    </label>
  ),
}));
vi.mock("../lib/auth-capabilities", () => ({ fetchAuthCapabilities: vi.fn() }));
vi.mock("../lib/auth", () => ({
  authClient: {
    signIn: { social: vi.fn(async () => ({})), email: vi.fn(), emailOtp: vi.fn() },
    emailOtp: { sendVerificationOtp: vi.fn() },
  },
}));
vi.mock("../lib/rpc", () => ({ clearSpaceSelection: vi.fn() }));
const capabilities: AuthCapabilities = {
  passwordAuth: false,
  sso: { name: "Example", availability: "unavailable" },
  passwordReset: false,
  resetUrl: null,
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  wecom.isWeComWebView.mockReturnValue(false);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete window.rakazoDesktop;
});
async function render(mode: "in" | "up" | "forgot" = "in", search = "") {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[search ? `/${search}` : "/"]}>
        <Routes>
          <Route path="/" element={<AuthPage mode={mode} />} />
          <Route path="/app" element={<p>App</p>} />
          <Route path="/onboarding" element={<p>Onboarding</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
}
async function enter(input: Element | null, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function button(text: string) {
  return [...host.querySelectorAll("button")].find((button) => button.textContent === text)!;
}
async function submit() {
  await act(async () => {
    host.querySelector("form")!.requestSubmit();
  });
}
it("shows no credential form while capabilities load", async () => {
  vi.mocked(fetchAuthCapabilities).mockReturnValue(new Promise(() => undefined));
  await render();
  expect(host.querySelector("input")).toBeNull();
  expect(host.textContent).toContain("Loading…");
});
it.each(["in", "up"] as const)("offers SSO and hides credentials on %s", async (mode) => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(capabilities);
  await render(mode);
  expect(host.textContent).toContain("Continue with Example");
  expect(host.querySelector("input")).toBeNull();
  const sso = host.querySelector("button")!;
  expect(sso.dataset.variant).toBe("default");
  expect(sso.className).toContain("w-full");
});
it("retries failed capabilities without exposing a password form", async () => {
  vi.mocked(fetchAuthCapabilities)
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce(capabilities);
  await render();
  expect(host.textContent).toContain("Could not load sign-in options");
  expect(host.querySelector("input")).toBeNull();
  const retry = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Retry",
  )!;
  await act(async () => retry.click());
  expect(fetchAuthCapabilities).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("Continue with Example");
});
it.each(["in", "up"] as const)("puts quiet SSO below the primary action on %s", async (mode) => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...capabilities, passwordAuth: true });
  await render(mode);
  const email = host.querySelector('input[name="email"]')!;
  const password = host.querySelector('input[type="password"]')!;
  const submit = host.querySelector('button[type="submit"]')!;
  const sso = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Continue with Example",
  )!;
  for (const [first, second] of [
    [email, password],
    [password, submit],
    [submit, sso],
  ] as const) {
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  expect(submit.getAttribute("data-variant")).toBe("default");
  expect(sso.dataset.variant).toBe("link");
  expect(sso.dataset.size).toBe("sm");
});

it("hides SSO in password recovery", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...capabilities, passwordAuth: true });
  await render("forgot");
  expect(host.textContent).not.toContain("Continue with Example");
});

it("selects a non-redirecting SSO request on desktop", async () => {
  vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
  window.rakazoDesktop = {} as NonNullable<Window["rakazoDesktop"]>;
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(capabilities);
  vi.mocked(authClient.signIn.social).mockResolvedValue({
    data: null,
    error: { message: "Unavailable", status: 503, statusText: "Unavailable" },
  });
  await render();
  const button = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Continue with"),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
  expect(authClient.signIn.social).toHaveBeenCalledWith(
    expect.objectContaining({ provider: "oidc", disableRedirect: true }),
  );
});

it("keeps SSO available for retry while an authorization request is pending", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(capabilities);
  vi.mocked(authClient.signIn.social).mockReturnValue(new Promise(() => undefined));
  await render();
  const button = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Continue with"),
  )!;
  await act(async () => button.click());
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(authClient.signIn.social).toHaveBeenCalledTimes(2);
});

const codeCapabilities: AuthCapabilities = {
  ...capabilities,
  sso: null,
  passwordAuth: true,
  emailCode: true,
};

it("signs in with an emailed code by default", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(codeCapabilities);
  vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue({
    data: { success: true },
    error: null,
  } as never);
  vi.mocked(authClient.signIn.emailOtp).mockResolvedValue({ data: {}, error: null } as never);
  await render();
  expect(host.querySelector('input[type="password"]')).toBeNull();
  await enter(host.querySelector('input[name="email"]'), " person@example.com ");
  expect(host.querySelector('button[type="submit"]')!.textContent).toBe("Continue");
  await submit();
  expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
    email: "person@example.com",
    type: "sign-in",
  });
  expect(host.querySelector("h1")!.textContent).toBe("Check your email");
  const code = host.querySelector('input[aria-label="Code"]')!;
  expect(code.getAttribute("autocomplete")).toBe("one-time-code");
  await enter(code, "123456");
  expect(authClient.signIn.emailOtp).toHaveBeenCalledWith({
    email: "person@example.com",
    otp: "123456",
    name: undefined,
  });
  expect(host.textContent).toBe("App");
});

it("names a new account and keeps the email when going back from the code", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(codeCapabilities);
  vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue({
    data: { success: true },
    error: null,
  } as never);
  vi.mocked(authClient.signIn.emailOtp)
    .mockResolvedValueOnce({
      data: null,
      error: { code: "INVALID_OTP", message: "Invalid OTP", status: 400, statusText: "" },
    } as never)
    .mockResolvedValueOnce({ data: {}, error: null } as never);
  await render("up");
  await enter(host.querySelector('input[name="name"]'), "Ada");
  await enter(host.querySelector('input[name="email"]'), "ada@example.com");
  await submit();
  await enter(host.querySelector('input[aria-label="Code"]'), "111111");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Invalid code");
  await act(async () => button("Back").click());
  expect(host.querySelector<HTMLInputElement>('input[name="email"]')!.value).toBe(
    "ada@example.com",
  );
  await submit();
  expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(2);
  await enter(host.querySelector('input[aria-label="Code"]'), "222222");
  expect(authClient.signIn.emailOtp).toHaveBeenLastCalledWith({
    email: "ada@example.com",
    otp: "222222",
    name: "Ada",
  });
  expect(host.textContent).toBe("Onboarding");
});

it("sends the code on the first Continue but never submits an unfinished code", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(codeCapabilities);
  vi.mocked(authClient.emailOtp.sendVerificationOtp).mockResolvedValue({
    data: { success: true },
    error: null,
  } as never);
  await render();
  await enter(host.querySelector('input[name="email"]'), "person@example.com");
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  await submit();
  expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(1);
  const continueButton = host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(continueButton.disabled).toBe(true);
  await submit();
  await enter(host.querySelector('input[aria-label="Code"]'), "12345");
  expect(continueButton.disabled).toBe(true);
  await submit();
  expect(authClient.signIn.emailOtp).not.toHaveBeenCalled();
  expect(authClient.emailOtp.sendVerificationOtp).toHaveBeenCalledTimes(1);
});

it("keeps password sign-in one step away", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(codeCapabilities);
  await render();
  await act(async () => button("Use password").click());
  expect(host.querySelector('input[type="password"]')).not.toBeNull();
  expect(host.querySelector('button[type="submit"]')!.textContent).toBe("Continue with email");
  await act(async () => button("Use email code").click());
  expect(host.querySelector('input[type="password"]')).toBeNull();
});

it("leaves the password form unchanged without email codes", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render();
  expect(host.querySelector('input[type="password"]')).not.toBeNull();
  expect(host.querySelector('button[type="submit"]')!.textContent).toBe("Continue with email");
  expect(host.textContent).not.toContain("Use email code");
  expect(host.textContent).not.toContain("Use password");
  expect(host.querySelector("form")!.className).toContain("w-full");
  expect(host.querySelector("form")!.className).toContain("max-w-[460px]");
});

it("commits a WeCom session with a document navigation after password sign-in", async () => {
  wecom.isWeComWebView.mockReturnValue(true);
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  vi.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null } as never);
  await render();
  await enter(host.querySelector('input[name="email"]'), "person@example.com");
  await enter(host.querySelector('input[type="password"]'), "password12");
  await submit();
  expect(authClient.signIn.email).toHaveBeenCalledWith({
    email: "person@example.com",
    password: "password12",
  });
  expect(wecom.commitWeComSession).toHaveBeenCalledWith("/app");
  expect(host.textContent).not.toBe("App");
});

it("keeps client navigation when the WebView is not WeCom", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  vi.mocked(authClient.signIn.email).mockResolvedValue({ data: {}, error: null } as never);
  await render();
  await enter(host.querySelector('input[name="email"]'), "person@example.com");
  await enter(host.querySelector('input[type="password"]'), "password12");
  await submit();
  expect(wecom.commitWeComSession).not.toHaveBeenCalled();
  expect(host.textContent).toBe("App");
});

it("offers 企微登录 beside password and SSO without starting OAuth", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render();
  const wecomLogin = button("企微登录");
  expect(wecomLogin).toBeDefined();
  expect(wecomLogin.dataset.variant).toBe("outline");
  expect(wecomLogin.className).toContain("w-full");
  expect(wecomOAuth.startWeComOAuth).not.toHaveBeenCalled();
});

it.each(["in", "up"] as const)("offers 企微登录 beside SSO-only on %s", async (mode) => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue(capabilities);
  await render(mode);
  expect(host.textContent).toContain("Continue with Example");
  const wecomLogin = button("企微登录");
  expect(wecomLogin.dataset.variant).toBe("outline");
  expect(wecomOAuth.startWeComOAuth).not.toHaveBeenCalled();
});

it("hides 企微登录 in password recovery", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render("forgot");
  expect(host.textContent).not.toContain("企微登录");
});

it("starts WeCom OAuth at the locked path and shows a pending label", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render();
  await act(async () => button("企微登录").click());
  expect(wecomOAuth.startWeComOAuth).toHaveBeenCalledTimes(1);
  expect(button("Working…").disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
});

it("auto-starts WeCom OAuth in the workbench once the capability is on", async () => {
  wecom.isWeComWebView.mockReturnValue(true);
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({
    ...codeCapabilities,
    emailCode: false,
    wecom: true,
  });
  await render();
  expect(wecomOAuth.startWeComOAuth).toHaveBeenCalled();
  expect(host.textContent).toContain("Working…");
});

it("does not auto-start WeCom OAuth without the capability", async () => {
  wecom.isWeComWebView.mockReturnValue(true);
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render();
  expect(wecomOAuth.startWeComOAuth).not.toHaveBeenCalled();
  expect(host.querySelector('input[name="email"]')).not.toBeNull();
  expect(button("企微登录")).toBeDefined();
});

it("shows unbound copy from reason=unbound and does not auto-start", async () => {
  wecom.isWeComWebView.mockReturnValue(true);
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({
    ...codeCapabilities,
    emailCode: false,
    wecom: true,
  });
  await render("in", "?reason=unbound");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("未绑定");
  expect(wecomOAuth.startWeComOAuth).not.toHaveBeenCalled();
});

it("shows unbound copy from error=unbound", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render("in", "?error=unbound");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("未绑定");
});

it("shows denied copy from error=access_denied", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render("in", "?error=access_denied");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("拒绝授权");
});

it("shows a generic failure for an unknown WeCom return code", async () => {
  vi.mocked(fetchAuthCapabilities).mockResolvedValue({ ...codeCapabilities, emailCode: false });
  await render("in", "?error=wecom_failed");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Could not continue");
});
