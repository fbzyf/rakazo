import { describe, expect, it } from "vitest";
import { publicAuthCapabilities } from "./app.js";
import { loadEnv } from "./env.js";

const webOrigin = "https://app.example.test";
const envBase = {
  DATABASE_URL: "postgres://rakazo:rakazo@127.0.0.1:5433/rakazo",
  NODE_ENV: "test",
};
const wecomEnv = {
  WECOM_CORP_ID: "test-corp-id",
  WECOM_SECRET: "test-wecom-secret",
  WECOM_REDIRECT_URI: `${webOrigin}/api/auth/callback/wecom`,
};

function capabilitiesFromProcessEnv(source: NodeJS.ProcessEnv) {
  const env = loadEnv(source);
  return publicAuthCapabilities({
    oidc: env.oidc,
    passwordAuth: env.passwordAuth,
    hasEmail: false,
    emailCode: false,
    billing: false,
    wecom: Boolean(env.wecom),
    webOrigin: env.webOrigin,
  });
}

describe("GET /api/auth/capabilities wecom flag", () => {
  it("includes wecom: true when WeCom env is fully configured", () => {
    expect(
      publicAuthCapabilities({
        passwordAuth: true,
        hasEmail: true,
        emailCode: true,
        billing: false,
        wecom: true,
        webOrigin,
      }),
    ).toMatchObject({
      passwordAuth: true,
      passwordReset: true,
      resetUrl: `${webOrigin}/reset-password`,
      emailCode: true,
      billing: false,
      sso: null,
      wecom: true,
    });
  });

  it("includes wecom: false when WeCom env is missing and keeps password login", () => {
    expect(
      publicAuthCapabilities({
        passwordAuth: true,
        hasEmail: false,
        emailCode: false,
        billing: false,
        wecom: false,
        webOrigin,
      }),
    ).toEqual({
      sso: null,
      passwordAuth: true,
      passwordReset: false,
      resetUrl: null,
      emailCode: false,
      billing: false,
      wecom: false,
    });
  });

  it("advertises wecom from the three required env keys", () => {
    expect(capabilitiesFromProcessEnv({ ...envBase, ...wecomEnv }).wecom).toBe(true);
    expect(capabilitiesFromProcessEnv(envBase).wecom).toBe(false);
    expect(capabilitiesFromProcessEnv({ ...envBase, WECOM_CORP_ID: "test-corp-id" }).wecom).toBe(
      false,
    );
    expect(capabilitiesFromProcessEnv({ ...envBase, ...wecomEnv }).passwordAuth).toBe(true);
  });

  it("keeps SSO shape beside wecom", () => {
    expect(
      publicAuthCapabilities({
        oidc: { name: "SSO" },
        ssoAvailability: "available",
        passwordAuth: false,
        hasEmail: false,
        emailCode: false,
        billing: false,
        wecom: true,
        webOrigin,
      }).sso,
    ).toEqual({ name: "SSO", availability: "available" });
  });
});
