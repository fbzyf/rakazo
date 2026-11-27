import type { TransactionalEmailProvider } from "@rakazo/adapter-kit";
import type { Auth } from "@rakazo/auth";
import { publicSignInProviders } from "@rakazo/auth";
import type { AuthCapabilities } from "@rakazo/contracts";
import type { Hono } from "hono";
import type { BillingService } from "../billing/billing.js";
import type { AppEnv } from "../env.js";
import { nativePasskeys } from "../http/app-association.js";

/** Public `/api/auth/capabilities` body, including the optional WeCom flag. */
export function publicAuthCapabilities(input: {
  oidc?: { name: string };
  ssoAvailability?: "available" | "unavailable" | "checking";
  providers?: AuthCapabilities["providers"];
  passwordAuth?: boolean;
  hasEmail: boolean;
  emailCode: boolean;
  registrationOpen?: boolean;
  billing: boolean;
  wecom: boolean;
  webOrigin: string;
  passkeyRpId?: string | null;
  nativePasskeys?: AuthCapabilities["nativePasskeys"];
  crispWebsiteId?: string | null;
  demoAccount?: AuthCapabilities["demoAccount"];
}): AuthCapabilities {
  const passwordAuth = input.passwordAuth !== false;
  return {
    sso: input.oidc
      ? { name: input.oidc.name, availability: input.ssoAvailability ?? "checking" }
      : null,
    providers: input.providers,
    passwordAuth,
    passwordReset: passwordAuth && input.hasEmail,
    resetUrl:
      passwordAuth && input.hasEmail ? new URL("/reset-password", input.webOrigin).href : null,
    emailCode: input.emailCode,
    registrationOpen: input.registrationOpen,
    billing: input.billing,
    wecom: input.wecom,
    passkeyRpId: input.passkeyRpId ?? null,
    nativePasskeys: input.nativePasskeys,
    crispWebsiteId: input.crispWebsiteId ?? null,
    demoAccount: input.demoAccount ?? null,
  };
}

/** `GET /api/auth/capabilities`: the sign-in options this deployment offers. */
export function mountAuthCapabilities(
  app: Hono,
  {
    env,
    auth,
    email,
    billing,
  }: {
    env: AppEnv;
    auth: Auth;
    email: TransactionalEmailProvider | undefined;
    billing: BillingService | undefined;
  },
) {
  app.get("/api/auth/capabilities", (c) => {
    const registrationOpen = env.desktopStackToken
      ? auth.registrationOpen(c.req.raw.headers)
      : undefined;
    return c.json(
      publicAuthCapabilities({
        oidc: env.oidc,
        ssoAvailability: auth.ssoAvailability(),
        providers: publicSignInProviders(env.social, env.oidc),
        passwordAuth: env.passwordAuth,
        hasEmail: Boolean(email),
        emailCode: auth.emailCodeSignIn,
        registrationOpen,
        billing: Boolean(billing),
        wecom: Boolean(env.wecom),
        webOrigin: env.webOrigin,
        passkeyRpId: auth.passkeyRpId,
        nativePasskeys: nativePasskeys(env, auth.passkeyRpId),
        crispWebsiteId: billing ? (env.crispWebsiteId ?? null) : null,
        demoAccount: env.demoAccount ?? null,
      }),
    );
  });
}
