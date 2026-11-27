// @vitest-environment jsdom
import { deferred } from "@rakazo/core/test-async";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  download: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("../../lib/pages/artifact-open", () => ({
  fetchArtifactBytes: mocks.fetch,
  downloadArtifact: mocks.download,
  downloadArtifactBytes: vi.fn(),
  artifactContentUrl: (id: string, options?: { download?: boolean }) =>
    `/api/artifacts/${id}${options?.download ? "?download=1" : ""}`,
}));
vi.mock("@lingui/react/macro", () => {
  const t = (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});
vi.mock("@lingui/core/macro", () => ({
  t: (strings: TemplateStringsArray, ...values: unknown[]) =>
    `«${strings.reduce((text, part, index) => text + part + (values[index] ?? ""), "")}»`,
}));
vi.mock("./PdfViewer", () => ({ PdfViewer: () => null }));
vi.mock("@rakazo/chat-ui/web", () => ({
  ChatMarkdown: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.mock("./SandboxedHtmlViewer", () => ({ SandboxedHtmlViewer: () => <iframe title="HTML" /> }));

import { ArtifactFileCard } from "./ArtifactFileCard";

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static override createObjectURL = mocks.create;
      static override revokeObjectURL = mocks.revoke;
    },
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
  mocks.writeText.mockReset().mockResolvedValue(undefined);
  mocks.create.mockReset().mockReturnValue("blob:audio-preview");
  mocks.revoke.mockReset();
  mocks.fetch.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mocks.download.mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4"])(
  "plays %s from the binary route without fetching the whole file first",
  async (mimeType) => {
    await act(async () =>
      root?.render(
        <ArtifactFileCard
          target={{ botId: "bot-1" }}
          artifactId="audio-1"
          name="clip"
          mimeType={mimeType}
          size={3}
        />,
      ),
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    const audio = container.querySelector("audio");
    expect(audio?.hasAttribute("controls")).toBe(true);
    expect(audio?.getAttribute("preload")).toBe("metadata");
    expect(audio?.getAttribute("aria-label")).toBe("clip");
    expect(audio?.getAttribute("src")).toBe("/api/artifacts/audio-1");
    const download = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Download clip"]',
    );
    expect(download).not.toBeNull();
    await act(async () => download?.click());
    expect(mocks.download).toHaveBeenCalledWith({ botId: "bot-1" }, "audio-1", "clip", mimeType);
  },
);

function renderClip(artifactId = "audio-1") {
  root?.render(
    <ArtifactFileCard
      target={{ groupId: "group-1" }}
      artifactId={artifactId}
      name="clip"
      mimeType="audio/mpeg"
      size={3}
    />,
  );
}

it("streams video preview from the binary route without prefetching bytes", async () => {
  await act(async () =>
    root?.render(
      <ArtifactFileCard
        target={{ botId: "bot-1" }}
        artifactId="video-1"
        name="clip.mp4"
        mimeType="video/mp4"
        size={4_000_000}
      />,
    ),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview clip.mp4"]')?.click(),
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
  const video = document.body.querySelector("video");
  expect(video?.getAttribute("src")).toBe("/api/artifacts/video-1");
  expect(video?.hasAttribute("playsInline")).toBe(true);
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Download clip.mp4"]')?.click(),
  );
  expect(mocks.download).toHaveBeenCalledWith(
    { botId: "bot-1" },
    "video-1",
    "clip.mp4",
    "video/mp4",
  );
});

it("downloads without prefetching audio bytes", async () => {
  await act(async () => renderClip());
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Download clip"]')?.click(),
  );
  expect(mocks.download).toHaveBeenCalledTimes(1);
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("plays the next clip from its own address when the artifact changes", async () => {
  await act(async () => renderClip());
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(container.querySelector("audio")?.getAttribute("src")).toBe("/api/artifacts/audio-1");
  await act(async () => renderClip("audio-2"));
  expect(container.querySelector("audio")?.getAttribute("src")).toBe("/api/artifacts/audio-2");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("stops playback and revokes the old URL on artifact change", async () => {
  await act(async () => renderClip());
  expect(container.querySelector("audio")?.getAttribute("src")).toBe("/api/artifacts/audio-1");
  await act(async () => renderClip("audio-2"));
  expect(container.querySelector("audio")?.getAttribute("src")).toBe("/api/artifacts/audio-2");
  expect(mocks.fetch).not.toHaveBeenCalled();
});

it("translates every size unit and rolls up instead of 1,024.0 KB or 1,536.0 MB", async () => {
  await act(async () =>
    root?.render(
      <>
        {[512, 1024, 1048575, 1610612736, 1.5 * 1024 ** 4].map((size) => (
          <ArtifactFileCard
            key={size}
            target={{ botId: "b" }}
            artifactId={`a${size}`}
            name={`f${size}.zip`}
            mimeType="application/zip"
            size={size}
          />
        ))}
      </>,
    ),
  );
  const sizes = [...container.querySelectorAll("button span:last-child")].map(
    (el) => el.textContent,
  );
  expect(sizes).toEqual(["«512 B»", "«1 KB»", "«1 MB»", "«1.5 GB»", "«1.5 TB»"]);
});

it("aligns filenames and the download divider with the reading direction", async () => {
  await act(async () =>
    root?.render(
      <>
        <ArtifactFileCard
          target={{ botId: "bot-1" }}
          artifactId="notes-1"
          name="notes.txt"
          mimeType="text/plain"
          size={33}
        />
        <ArtifactFileCard
          target={{ botId: "bot-1" }}
          artifactId="archive-1"
          name="archive.zip"
          mimeType="application/zip"
          size={33}
        />
      </>,
    ),
  );
  const preview = container.querySelector('button[aria-label="Preview notes.txt"]')!;
  const download = container.querySelector('button[aria-label="Download notes.txt"]')!;
  const archive = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("archive.zip"),
  )!;
  expect(preview.classList.contains("text-start")).toBe(true);
  expect(archive.classList.contains("text-start")).toBe(true);
  expect(download.classList.contains("border-s")).toBe(true);
});

it("previews plain text in the app instead of only offering a download", async () => {
  mocks.fetch.mockResolvedValue(new TextEncoder().encode("1. Confirm the pricing page copy."));
  await act(async () =>
    root?.render(
      <ArtifactFileCard
        target={{ botId: "bot-1" }}
        artifactId="notes-1"
        name="notes.txt"
        mimeType="text/plain"
        size={33}
      />,
    ),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview notes.txt"]')?.click(),
  );
  await vi.waitFor(() =>
    expect(document.body.querySelector("pre")?.textContent).toBe(
      "1. Confirm the pricing page copy.",
    ),
  );
});

async function openFilePreview(mimeType = "text/markdown") {
  await act(async () =>
    root?.render(
      <ArtifactFileCard
        target={{ botId: "bot-1" }}
        artifactId="file-1"
        name="notes.md"
        mimeType={mimeType}
        size={30}
      />,
    ),
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Preview notes.md"]')!.click(),
  );
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}

it.each(["text/markdown", "text/plain"])(
  "copies the raw %s source after loading",
  async (mimeType) => {
    const source = "# Notes\n\n**Raw** source";
    const loading = deferred<Uint8Array>();
    mocks.fetch.mockReturnValue(loading.promise);
    const dialog = await openFilePreview(mimeType);
    expect(dialog.querySelector('button[aria-label="Copy notes.md"]')).toBeNull();
    await act(async () => loading.resolve(new TextEncoder().encode(source)));
    const copy = dialog.querySelector<HTMLButtonElement>('button[aria-label="Copy notes.md"]');
    expect(copy).not.toBeNull();
    await act(async () => copy!.click());
    expect(mocks.writeText).toHaveBeenCalledExactlyOnceWith(source);
    expect(copy!.getAttribute("aria-label")).toBe("Copied");
  },
);

it("offers the source to copy by hand when the browser refuses", async () => {
  const source = "# Notes";
  mocks.fetch.mockResolvedValue(new TextEncoder().encode(source));
  mocks.writeText.mockRejectedValue(new Error("denied"));
  Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
  const dialog = await openFilePreview("text/markdown");
  await act(async () =>
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Copy notes.md"]')!.click(),
  );
  await vi.waitFor(() =>
    expect(
      document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Copy notes.md"]')?.value,
    ).toBe(source),
  );
});

it.each(["text/html", "application/pdf", "video/mp4"])(
  "does not offer copy for %s",
  async (mimeType) => {
    mocks.fetch.mockResolvedValue(new TextEncoder().encode("<h1>Notes</h1>"));
    const dialog = await openFilePreview(mimeType);
    expect(dialog.querySelector('button[aria-label^="Copy"]')).toBeNull();
  },
);

it.each(["metaKey", "ctrlKey"])(
  "scopes %s+A from the dialog header to the file body",
  async (modifier) => {
    mocks.fetch.mockResolvedValue(new TextEncoder().encode("File contents"));
    const dialog = await openFilePreview();
    const button = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close preview"]')!;
    button.focus();
    const event = new KeyboardEvent("keydown", {
      key: "a",
      [modifier]: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => button.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe("File contents");
    expect(window.getSelection()?.getRangeAt(0).commonAncestorContainer).toBe(
      dialog.querySelector("article"),
    );
  },
);

it.each(["input", "textarea", "contenteditable"])(
  "preserves select-all inside %s",
  async (kind) => {
    mocks.fetch.mockResolvedValue(new TextEncoder().encode("File contents"));
    const dialog = await openFilePreview();
    const editable = document.createElement(kind === "contenteditable" ? "div" : kind);
    if (kind === "contenteditable") editable.setAttribute("contenteditable", "true");
    dialog.append(editable);
    const event = new KeyboardEvent("keydown", {
      key: "a",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => editable.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false);
  },
);
