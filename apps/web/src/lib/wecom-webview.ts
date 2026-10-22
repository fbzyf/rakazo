/** WeCom (企业微信) workbench / in-app WebView. Consumer WeChat is not this. */
export const WECOM_WEBVIEW_UA = /wxwork/i;

export const WECOM_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";

/**
 * Long MIME enumerations make the WeCom file sheet empty. Keep images, camera
 * roll, and the order-entry file types the existing accept list already covers.
 */
export const WECOM_ATTACHMENT_ACCEPT = [
  "image/*",
  "application/pdf",
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".txt",
  ".zip",
].join(",");

/** Visually hidden but still a real hit target — `display:none` file inputs ignore tap in WeCom. */
export const WECOM_FILE_INPUT_CLASS =
  "absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:pointer-events-none";

export function isWeComWebView(
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  return WECOM_WEBVIEW_UA.test(userAgent);
}

export function applyWeComWebViewDocument(
  doc: Pick<Document, "documentElement" | "querySelector"> = document,
  userAgent: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
): boolean {
  if (!isWeComWebView(userAgent)) return false;
  doc.documentElement.dataset.wecom = "";
  const viewport = doc.querySelector('meta[name="viewport"]');
  if (viewport) viewport.setAttribute("content", WECOM_VIEWPORT);
  return true;
}

/** WKWebView-like shells often keep Set-Cookie from fetch until a real navigation. */
export function commitWeComSession(
  path: string,
  assign: (url: string) => void = (url) => {
    window.location.assign(url);
  },
): void {
  assign(path.startsWith("/") ? path : `/${path}`);
}
