// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const download = vi.hoisted(() => ({
  bytes: vi.fn(),
  filename: (title: string, extension: string) => `${title}.${extension}`,
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ i18n: { locale: "en" }, t: String.raw }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../../lib/file-download", () => ({
  downloadBytes: download.bytes,
  downloadFilename: download.filename,
}));

import { DownloadPdfButton } from "./DownloadPdfButton";

afterEach(() => {
  download.bytes.mockReset();
  document.body.replaceChildren();
});

it("saves the page HTML under the page title", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () =>
    root.render(
      <DownloadPdfButton
        className="download"
        title="宁德时代 · 客户画像与商机漏斗"
        document="<h1>漏斗</h1>"
        labelClassName="sr-only"
      />,
    ),
  );
  const button = document.querySelector("button");
  expect(button?.getAttribute("title")).toBe("Download");
  expect(button?.textContent).toContain("Download");
  await act(async () => button?.click());
  expect(download.bytes).toHaveBeenCalledTimes(1);
  const [name, mime, bytes] = download.bytes.mock.calls[0] ?? [];
  expect(name).toBe("宁德时代 · 客户画像与商机漏斗.html");
  expect(mime).toBe("text/html;charset=utf-8");
  expect(new TextDecoder().decode(bytes as Uint8Array)).toBe("<h1>漏斗</h1>");
  await act(async () => root.unmount());
});
