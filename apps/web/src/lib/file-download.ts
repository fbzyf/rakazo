import { isWeComWebView } from "./wecom-webview";

const FILENAME_RESERVED = new Set('<>:"/\\|?*');

/** A saved filename the OS will accept, even when the title is Chinese. */
export function downloadFilename(title: string, extension: string): string {
  const cleaned = Array.from(title)
    .map((char) => (char.charCodeAt(0) < 32 || FILENAME_RESERVED.has(char) ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return `${(cleaned || "download").slice(0, 120)}.${extension.replace(/^\./, "")}`;
}

/**
 * Start a file save from a same-origin or blob URL. Workbench WebViews ignore a synthetic
 * `<a download>.click()` on http(s) URLs, so those navigate instead and let the attachment
 * response save the file.
 */
export function startNamedFileDownload(
  href: string,
  name: string,
  env: {
    userAgent?: string;
    assign?: (url: string) => void;
  } = {},
): void {
  const userAgent = env.userAgent ?? (typeof navigator === "undefined" ? "" : navigator.userAgent);
  const assign =
    env.assign ??
    ((url: string) => {
      window.location.assign(url);
    });
  if (isWeComWebView(userAgent) && !href.startsWith("blob:") && !href.startsWith("data:")) {
    assign(href);
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function downloadBytes(name: string, mimeType: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  startNamedFileDownload(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
