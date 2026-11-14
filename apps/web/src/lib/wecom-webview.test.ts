// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyWeComWebViewDocument,
  commitWeComSession,
  isWeComWebView,
  WECOM_ATTACHMENT_ACCEPT,
  WECOM_VIEWPORT,
} from "./wecom-webview";

const wecomIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 wxwork/4.1.28 MicroMessenger/7.0.1 Language/zh";
const wecomAndroid =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 wxwork/4.1.28 MicroMessenger/7.0.1 Language/zh";

afterEach(() => {
  document.documentElement.removeAttribute("data-wecom");
  document.head.querySelector('meta[name="viewport"]')?.remove();
});

describe("isWeComWebView", () => {
  it("matches WeCom workbench and in-app WebView user agents", () => {
    expect(isWeComWebView(wecomIos)).toBe(true);
    expect(isWeComWebView(wecomAndroid)).toBe(true);
    expect(isWeComWebView("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 wxwork/4.1.28")).toBe(true);
  });

  it("ignores desktop browsers and consumer WeChat", () => {
    expect(isWeComWebView("Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120.0.0.0")).toBe(
      false,
    );
    expect(
      isWeComWebView("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 MicroMessenger/8.0.47 Language/zh"),
    ).toBe(false);
    expect(isWeComWebView("")).toBe(false);
  });
});

describe("applyWeComWebViewDocument", () => {
  it("marks the document and opts the viewport into safe-area only for WeCom", () => {
    const viewport = document.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1.0";
    document.head.append(viewport);

    expect(applyWeComWebViewDocument(document, "Chrome/120")).toBe(false);
    expect(document.documentElement.dataset.wecom).toBeUndefined();
    expect(viewport.getAttribute("content")).toBe("width=device-width, initial-scale=1.0");

    expect(applyWeComWebViewDocument(document, wecomIos)).toBe(true);
    expect(document.documentElement.dataset.wecom).toBe("");
    expect(viewport.getAttribute("content")).toBe(WECOM_VIEWPORT);
  });
});

describe("commitWeComSession", () => {
  it("assigns a same-origin path so the cookie jar can flush", () => {
    const assign = vi.fn();
    commitWeComSession("/app", assign);
    commitWeComSession("onboarding", assign);
    expect(assign).toHaveBeenCalledWith("/app");
    expect(assign).toHaveBeenCalledWith("/onboarding");
  });
});

describe("WECOM_ATTACHMENT_ACCEPT", () => {
  it("keeps camera-roll images and order-entry files without a long MIME enum", () => {
    expect(WECOM_ATTACHMENT_ACCEPT).toContain("image/*");
    expect(WECOM_ATTACHMENT_ACCEPT).toContain(".xlsx");
    expect(WECOM_ATTACHMENT_ACCEPT).not.toContain("application/vnd.openxmlformats");
  });
});
