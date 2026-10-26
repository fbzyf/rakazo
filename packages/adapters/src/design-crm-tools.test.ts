import { describe, expect, it, vi } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import {
  DESIGN_CRM_ACCESS_DENIED,
  DESIGN_CRM_BOT_DENIED,
  DESIGN_CRM_DEFAULT_DATABASE_ID,
  DESIGN_CRM_NOT_CONFIGURED,
  DESIGN_CRM_VISIT_GET,
  DESIGN_CRM_VISIT_SEARCH,
  DESIGN_CRM_VISIT_TOOL_NAMES,
  getDesignCrmVisit,
  isDesignCrmReadAllowed,
  isDesignCrmVisitBot,
  isDesignCrmVisitToolName,
  MISSING_MIRROR_FIELD,
  redactEmail,
  redactPhone,
  sameNotionId,
  searchDesignCrmVisits,
} from "./design-crm-tools.js";

const ALLOWED_EMAIL = "ken@linposh.com.cn";
const OTHER_ALLOWED_EMAIL = "josh@linposh.com.cn";
const SERVICE_BOT = "客服助手";

function visitPage(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-visit-1",
    url: "https://notion.example.test/page-visit-1",
    parent: { database_id: DESIGN_CRM_DEFAULT_DATABASE_ID },
    properties: {
      客户: { type: "rich_text", rich_text: [{ plain_text: "Acme Demo Customer" }] },
      客户编码: { type: "rich_text", rich_text: [{ plain_text: "C-1001" }] },
      业务员: { type: "rich_text", rich_text: [{ plain_text: "Pat Example" }] },
      大区: { type: "rich_text", rich_text: [{ plain_text: "East" }] },
      拜访类型: { type: "select", select: { name: "Follow-up" } },
      摘要: { type: "rich_text", rich_text: [{ plain_text: "Discussed sample catalog" }] },
      下一步: { type: "rich_text", rich_text: [{ plain_text: "Send quote" }] },
      产品线: { type: "rich_text", rich_text: [{ plain_text: "Hardware" }] },
      品牌: { type: "rich_text", rich_text: [{ plain_text: "DemoBrand" }] },
      参考分: { type: "number", number: 88 },
      等级: { type: "select", select: { name: "A" } },
      拜访日期: { type: "date", date: { start: "2026-10-20" } },
      crm_visit_id: { type: "rich_text", rich_text: [{ plain_text: "visit-1001" }] },
      CRM链接: { type: "url", url: "https://crm.example.test/visits/visit-1001" },
    },
    ...overrides,
  };
}

function allowedDeps(fetchMock: typeof fetch) {
  return {
    actorEmail: ALLOWED_EMAIL,
    botName: SERVICE_BOT,
    token: "notion-test-token",
    databaseId: DESIGN_CRM_DEFAULT_DATABASE_ID,
    fetch: fetchMock,
  };
}

describe("design CRM allowlist", () => {
  it("admits only the two locked work emails", () => {
    expect(isDesignCrmReadAllowed(ALLOWED_EMAIL)).toBe(true);
    expect(isDesignCrmReadAllowed(OTHER_ALLOWED_EMAIL.toUpperCase())).toBe(true);
    expect(isDesignCrmReadAllowed("outsider@example.test")).toBe(false);
    expect(isDesignCrmReadAllowed("bread@example.test")).toBe(false);
    expect(isDesignCrmReadAllowed(undefined)).toBe(false);
  });

  it("attaches only to 客服助手", () => {
    expect(isDesignCrmVisitBot(SERVICE_BOT)).toBe(true);
    expect(isDesignCrmVisitBot("订单助手")).toBe(false);
    expect(isDesignCrmVisitBot("追交货助手")).toBe(false);
  });
});

describe("design CRM visit tools", () => {
  it("rejects outsiders without calling Notion", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await searchDesignCrmVisits(
      { ...allowedDeps(fetchMock), actorEmail: "outsider@example.test" },
      { query: "Acme" },
    );
    expect(result).toEqual({ error: DESIGN_CRM_ACCESS_DENIED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects order and follow-up bots without calling Notion", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      searchDesignCrmVisits({ ...allowedDeps(fetchMock), botName: "订单助手" }, { query: "Acme" }),
    ).resolves.toEqual({ error: DESIGN_CRM_BOT_DENIED });
    await expect(
      getDesignCrmVisit(
        { ...allowedDeps(fetchMock), botName: "追交货助手" },
        { id: "page-visit-1" },
      ),
    ).resolves.toEqual({ error: DESIGN_CRM_BOT_DENIED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a search page from the hardcoded mirror only", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        `https://api.notion.com/v1/databases/${DESIGN_CRM_DEFAULT_DATABASE_ID}/query`,
      );
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body.page_size).toBe(20);
      expect(body.filter).toEqual({
        property: "客户",
        rich_text: { contains: "Acme Demo Customer" },
      });
      return Response.json({
        results: [visitPage()],
        has_more: false,
      });
    });

    const result = await searchDesignCrmVisits(allowedDeps(fetchMock), {
      customer: "Acme Demo Customer",
    });

    expect(result).toEqual({
      visits: [
        expect.objectContaining({
          id: "page-visit-1",
          customer: "Acme Demo Customer",
          customerCode: "C-1001",
          salesperson: "Pat Example",
          region: "East",
          visitType: "Follow-up",
          summary: "Discussed sample catalog",
          nextStep: "Send quote",
          productLine: "Hardware",
          brand: "DemoBrand",
          score: "88",
          grade: "A",
          visitDate: "2026-10-20",
          crmVisitId: "visit-1001",
          crmUrl: "https://crm.example.test/visits/visit-1001",
          phone: { value: null, note: MISSING_MIRROR_FIELD },
          email: { value: null, note: MISSING_MIRROR_FIELD },
        }),
      ],
      source: "notion_mirror",
      realtime: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gets one visit and never invents phone or email", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.notion.com/v1/pages/page-visit-1");
      expect(init?.method).toBe("GET");
      return Response.json(visitPage());
    });

    const result = await getDesignCrmVisit(allowedDeps(fetchMock), { id: "page-visit-1" });
    expect(result).toEqual({
      visit: expect.objectContaining({
        id: "page-visit-1",
        crmVisitId: "visit-1001",
        phone: { value: null, note: MISSING_MIRROR_FIELD },
        email: { value: null, note: MISSING_MIRROR_FIELD },
      }),
      source: "notion_mirror",
      realtime: false,
    });
  });

  it("redacts phone and email when those columns appear later", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(
        visitPage({
          properties: {
            ...(visitPage().properties as Record<string, unknown>),
            电话: { type: "phone_number", phone_number: "13812345678" },
            邮箱: { type: "email", email: "pat@example.test" },
          },
        }),
      ),
    );

    const result = await getDesignCrmVisit(allowedDeps(fetchMock), { id: "page-visit-1" });
    expect(result).toEqual({
      visit: expect.objectContaining({
        phone: { value: "138******78" },
        email: { value: "p***@example.test" },
      }),
      source: "notion_mirror",
      realtime: false,
    });
  });

  it("accepts a dashed Notion parent id against the undashed mirror id", async () => {
    const dashed = "3d4793e1-abd5-8124-9fff-cb3644071cf7";
    expect(sameNotionId(dashed, DESIGN_CRM_DEFAULT_DATABASE_ID)).toBe(true);
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(visitPage({ parent: { database_id: dashed } })),
    );
    const result = await getDesignCrmVisit(allowedDeps(fetchMock), { id: "page-visit-1" });
    expect(result).toEqual({
      visit: expect.objectContaining({ id: "page-visit-1", crmVisitId: "visit-1001" }),
      source: "notion_mirror",
      realtime: false,
    });
  });

  it("refuses a page that is not in the locked database", async () => {
    expect(
      sameNotionId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", DESIGN_CRM_DEFAULT_DATABASE_ID),
    ).toBe(false);
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json(visitPage({ parent: { database_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } })),
    );
    await expect(
      getDesignCrmVisit(allowedDeps(fetchMock), { id: "page-visit-1" }),
    ).resolves.toEqual({
      error: "Visit is not in the Design CRM mirror.",
    });
  });

  it("filters visit type on 拜访类型 with select.equals", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.filter).toEqual({
        property: "拜访类型",
        select: { equals: "Follow-up" },
      });
      return Response.json({ results: [visitPage()], has_more: false });
    });

    const result = await searchDesignCrmVisits(allowedDeps(fetchMock), { visitType: "Follow-up" });
    expect(result).toEqual({
      visits: [expect.objectContaining({ visitType: "Follow-up" })],
      source: "notion_mirror",
      realtime: false,
    });
  });

  it("does not call Notion when the token is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    await expect(
      searchDesignCrmVisits({ ...allowedDeps(fetchMock), token: "", env: {} }, { query: "Acme" }),
    ).resolves.toEqual({ error: DESIGN_CRM_NOT_CONFIGURED });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes only readonly search and get builtins", () => {
    const tools = builtinAgentTools.filter((tool) => isDesignCrmVisitToolName(tool.name));
    expect(tools.map((tool) => tool.name)).toEqual([DESIGN_CRM_VISIT_SEARCH, DESIGN_CRM_VISIT_GET]);
    expect(tools.every((tool) => tool.readOnly === true)).toBe(true);
    expect(DESIGN_CRM_VISIT_TOOL_NAMES.join(" ")).not.toMatch(/create|update|delete|write|patch/i);
    for (const tool of tools) {
      expect(JSON.stringify(tool.inputSchema)).not.toMatch(/create|update|delete|write|patch/i);
    }
  });
});

describe("contact redaction", () => {
  it("masks the middle of phone numbers and email locals", () => {
    expect(redactPhone("13812345678")).toBe("138******78");
    expect(redactEmail("pat@example.test")).toBe("p***@example.test");
  });
});
