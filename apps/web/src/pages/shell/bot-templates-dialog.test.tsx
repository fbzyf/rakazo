// @vitest-environment jsdom

import type { BotTemplate } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createSpaceRpc } from "../../lib/rpc";

vi.mock("@lingui/react/macro", () => {
  const t = (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((text, part, index) => `${text}${index > 0 ? values[index - 1] : ""}${part}`, "");
  return { useLingui: () => ({ t }), Trans: ({ children }: { children: ReactNode }) => children };
});

import { BotTemplatesDialog, ShareTemplateDialog } from "./bot-templates-dialog";

let container: HTMLDivElement;
let root: Root;

const warning =
  "People in this space can make their own bot from this. They get the instructions and schedules. Chats, memory, and saved sign-ins stay with you.";

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function template(overrides: Partial<BotTemplate> = {}): BotTemplate {
  return {
    id: "template-1",
    name: "Morning briefing",
    description: "A short note before the day starts",
    instructions: `${"Read the overnight notes. ".repeat(20)}Then write the briefing.`,
    color: "ink",
    avatarSet: "organic",
    routines: [],
    mine: false,
    updatedAt: "2026-11-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("BotTemplatesDialog", () => {
  it("opens the published cards and copies the one that is chosen", async () => {
    const row = template();
    let resolveList: (rows: BotTemplate[]) => void = () => undefined;
    const list = vi.fn(
      () =>
        new Promise<BotTemplate[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const onUse = vi.fn(async () => undefined);
    const rpc = { botTemplates: { list } } as unknown as ReturnType<typeof createSpaceRpc>;
    await act(async () => {
      root.render(<BotTemplatesDialog rpc={rpc} onCancel={() => undefined} onUse={onUse} />);
    });
    expect(document.body.textContent).toContain("Bot templates");
    await act(async () => {
      resolveList([row]);
    });
    expect(document.body.textContent).toContain("Morning briefing");
    expect(document.body.textContent).toContain("A short note before the day starts");
    expect(document.body.textContent).toContain("Read the overnight notes.");
    expect(document.body.textContent).toContain("…");
    expect(document.body.textContent).not.toContain("Then write the briefing.");
    const card = document.querySelector<HTMLButtonElement>(
      '[data-testid="bot-template-template-1"]',
    );
    expect(card).toBeTruthy();
    await act(async () => {
      card!.click();
    });
    expect(onUse).toHaveBeenCalledWith("template-1");
  });

  it("says when the space has no templates", async () => {
    const rpc = {
      botTemplates: { list: vi.fn(async () => []) },
    } as unknown as ReturnType<typeof createSpaceRpc>;
    await act(async () => {
      root.render(
        <BotTemplatesDialog rpc={rpc} onCancel={() => undefined} onUse={async () => undefined} />,
      );
    });
    expect(document.body.textContent).toContain("No templates yet");
  });
});

describe("ShareTemplateDialog", () => {
  it("shows what colleagues receive before sharing", async () => {
    await act(async () => {
      root.render(
        <ShareTemplateDialog onCancel={() => undefined} onConfirm={async () => undefined} />,
      );
    });
    expect(document.querySelector('[data-testid="share-template-dialog"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Share as template");
    expect(document.body.textContent?.replace(/\s+/g, " ")).toContain(warning);
  });
});
