// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBytes, downloadFilename, startNamedFileDownload } from "./file-download";

const wecomUa = "Mozilla/5.0 wxwork/4.1.28 MicroMessenger/7.0.1";
const originalAnchorClick = HTMLAnchorElement.prototype.click;

function captureAnchorClicks() {
  const clicks: { href: string; download: string; inDocument: boolean }[] = [];
  HTMLAnchorElement.prototype.click = function click() {
    clicks.push({
      href: this.getAttribute("href") ?? "",
      download: this.getAttribute("download") ?? "",
      inDocument: document.body.contains(this),
    });
  };
  return clicks;
}

afterEach(() => {
  HTMLAnchorElement.prototype.click = originalAnchorClick;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("downloadFilename", () => {
  it("keeps a Chinese title and strips characters the OS rejects", () => {
    expect(downloadFilename("宁德时代 · 客户画像与商机漏斗", "html")).toBe(
      "宁德时代 · 客户画像与商机漏斗.html",
    );
    expect(downloadFilename("a/b:c*d?", "html")).toBe("a b c d.html");
    expect(downloadFilename("   ", "html")).toBe("download.html");
  });
});

describe("startNamedFileDownload", () => {
  it("saves through an attached download link", () => {
    const clicks = captureAnchorClicks();
    startNamedFileDownload("/api/artifacts/art-1?download=1", "clip.mp4");
    expect(clicks).toEqual([
      { href: "/api/artifacts/art-1?download=1", download: "clip.mp4", inDocument: true },
    ]);
    expect(document.body.querySelector("a")).toBeNull();
  });

  it("navigates in the workbench WebView so the attachment response can save", () => {
    const clicks = captureAnchorClicks();
    const assign = vi.fn();
    startNamedFileDownload("/api/artifacts/art-1?download=1", "clip.mp4", {
      userAgent: wecomUa,
      assign,
    });
    expect(assign).toHaveBeenCalledWith("/api/artifacts/art-1?download=1");
    expect(clicks).toEqual([]);
  });

  it("still uses a download link for blob URLs in the workbench WebView", () => {
    const clicks = captureAnchorClicks();
    const assign = vi.fn();
    startNamedFileDownload("blob:page", "page.html", { userAgent: wecomUa, assign });
    expect(assign).not.toHaveBeenCalled();
    expect(clicks).toEqual([{ href: "blob:page", download: "page.html", inDocument: true }]);
  });
});

describe("downloadBytes", () => {
  it("saves a blob through the download link", () => {
    const clicks = captureAnchorClicks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:bytes");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    downloadBytes("note.html", "text/html;charset=utf-8", new TextEncoder().encode("<p>hi</p>"));
    expect(clicks).toEqual([{ href: "blob:bytes", download: "note.html", inDocument: true }]);
  });
});
