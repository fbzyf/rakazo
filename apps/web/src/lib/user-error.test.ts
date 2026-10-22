import { describe, expect, it } from "vitest";
import { authErrorText } from "./user-error";

describe("authErrorText", () => {
  it("maps PASSWORD_AUTH_DISABLED before the server message", () => {
    expect(
      authErrorText({ code: "PASSWORD_AUTH_DISABLED", message: "Server message" }, "Fallback"),
    ).toBe("Password sign-in is turned off on this server");
  });

  it("maps email code failures", () => {
    expect(authErrorText({ code: "INVALID_OTP", message: "Invalid OTP" }, "Fallback")).toBe(
      "Invalid code",
    );
    for (const code of ["OTP_EXPIRED", "TOO_MANY_ATTEMPTS"]) {
      expect(authErrorText({ code, message: "Server message" }, "Fallback")).toBe(
        "Request a new code",
      );
    }
  });

  it("keeps messages from older servers", () => {
    expect(authErrorText({ message: "Registration is closed" }, "Fallback")).toBe(
      "Registration is closed",
    );
  });

  it("maps WeCom unbound and denied return codes", () => {
    for (const code of ["unbound", "account_not_bound", "WECOM_NOT_BOUND"]) {
      expect(authErrorText({ code, message: "Server message" }, "Fallback")).toBe("未绑定");
    }
    for (const code of ["access_denied", "user_denied", "denied", "WECOM_DENIED"]) {
      expect(authErrorText({ code, message: "Server message" }, "Fallback")).toBe("拒绝授权");
    }
    expect(authErrorText({ code: "wecom_failed", message: "" }, "Could not continue")).toBe(
      "Could not continue",
    );
  });
});
