import { expect, test } from "@playwright/test";
import { captureScreenshot, completeOnboarding, signup } from "./helpers";

const wecomIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 wxwork/4.1.28 MicroMessenger/7.0.1 Language/zh";

test.use({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 390, height: 844 },
  userAgent: wecomIos,
});

test("sign-in fits portrait WeCom WebView", async ({ page }, testInfo) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: { passwordAuth: true, sso: null, passwordReset: false, resetUrl: null },
    }),
  );

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in to Rakazo" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-wecom", "");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /viewport-fit=cover/,
  );

  const box = await page.locator("form").boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeLessThanOrEqual(390);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "企微登录" })).toBeVisible();
  await captureScreenshot(page, testInfo, "wecom-sign-in");
});

test("企微登录 navigates to the locked WeCom start path", async ({ page }) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: { passwordAuth: true, sso: null, passwordReset: false, resetUrl: null },
    }),
  );
  await page.route("**/api/auth/wecom", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "wecom-oauth-start" }),
  );

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "企微登录" }).click();
  await expect(page.getByText("wecom-oauth-start")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/api/auth/wecom");
});

test("shows unbound copy from reason=unbound without auto-start", async ({ page }, testInfo) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: {
        passwordAuth: true,
        sso: null,
        passwordReset: false,
        resetUrl: null,
        wecom: true,
      },
    }),
  );

  await page.goto("/sign-in?reason=unbound");
  await expect(page.getByRole("alert")).toHaveText("未绑定");
  await expect(page.getByRole("button", { name: "企微登录" })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await captureScreenshot(page, testInfo, "wecom-sign-in-unbound");
});

test("shows denied copy from error=access_denied", async ({ page }, testInfo) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: { passwordAuth: true, sso: null, passwordReset: false, resetUrl: null },
    }),
  );

  await page.goto("/sign-in?error=access_denied");
  await expect(page.getByRole("alert")).toHaveText("拒绝授权");
  await captureScreenshot(page, testInfo, "wecom-sign-in-denied");
});

test("WeCom workbench auto-starts OAuth when the capability is on", async ({ page }) => {
  await page.route("**/api/auth/get-session**", (route) => route.fulfill({ json: null }));
  await page.route("**/api/auth/capabilities", (route) =>
    route.fulfill({
      json: {
        passwordAuth: true,
        sso: null,
        passwordReset: false,
        resetUrl: null,
        wecom: true,
      },
    }),
  );
  await page.route("**/api/auth/wecom", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "wecom-oauth-start" }),
  );

  await page.goto("/sign-in");
  await expect(page.getByText("wecom-oauth-start")).toBeVisible();
});

test("composer attach stays tappable after sign-in", async ({ page }, testInfo) => {
  const stamp = Date.now();
  await signup(page, `wecom-a-${stamp}@rakazo.test`, "password12", "WeCom A");
  await completeOnboarding(page);
  await expect(page.locator("html")).toHaveAttribute("data-wecom", "");

  const input = page.locator('input[type="file"]');
  await expect(input).toHaveAttribute("accept", /image\/\*/);
  expect(await input.evaluate((el) => getComputedStyle(el).display)).not.toBe("none");

  const attach = page.getByLabel("Attach file").first();
  const box = await attach.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await captureScreenshot(page, testInfo, "wecom-composer");
});
