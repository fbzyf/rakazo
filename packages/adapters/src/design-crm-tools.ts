import type { ConnectorTool } from "@rakazo/adapter-kit";

/** Locked Path A mirror. Tools never accept a caller-supplied database id. */
export const DESIGN_CRM_DEFAULT_DATABASE_ID = "3d4793e1abd581249fffcb3644071cf7";
export const DESIGN_CRM_VISIT_SEARCH = "design_crm_visit_search";
export const DESIGN_CRM_VISIT_GET = "design_crm_visit_get";
export const DESIGN_CRM_VISIT_TOOL_NAMES = [DESIGN_CRM_VISIT_SEARCH, DESIGN_CRM_VISIT_GET] as const;
export const DESIGN_CRM_VISIT_BOT_NAME = "客服助手";
export const MISSING_MIRROR_FIELD = "镜像无此字段";
export const DESIGN_CRM_VISIT_INSTRUCTION =
  "拜访数据来自 CRM→Notion 每日同步（约 19:30），非实时。电话和邮箱：镜像无此字段时如实说明，不要编造。";
export const DESIGN_CRM_ACCESS_DENIED = "This account cannot read Design CRM visit data.";
export const DESIGN_CRM_BOT_DENIED = "This tool is only available on 客服助手.";
export const DESIGN_CRM_NOT_CONFIGURED = "Design CRM visit mirror is not configured.";

const ALLOWED_READ_EMAILS = new Set(["ken@linposh.com.cn", "josh@linposh.com.cn"]);
const NOTION_VERSION = "2022-06-28";
const NOTION_API = "https://api.notion.com/v1";
const SEARCH_PAGE_SIZE = 20;

const PHONE_PROPERTY_NAMES = new Set(["电话", "手机", "联系电话", "phone", "mobile"]);
const EMAIL_PROPERTY_NAMES = new Set(["邮箱", "邮件", "email", "e-mail"]);

const FIELD_ALIASES: Record<string, readonly string[]> = {
  crmVisitId: ["crm_visit_id", "crm visit id", "拜访id"],
  visitDate: ["拜访日期", "visit date", "date"],
  customer: ["客户", "客户名称", "customer"],
  customerCode: ["客户编码", "customer code"],
  salesperson: ["业务员", "salesperson", "owner"],
  region: ["大区", "region"],
  visitType: ["拜访类型", "visit type"],
  summary: ["摘要", "summary"],
  nextStep: ["下一步", "next step"],
  productLine: ["产品线", "product line"],
  brand: ["品牌", "brand"],
  score: ["参考分", "分数", "score"],
  grade: ["等级", "grade"],
  crmUrl: ["crm链接", "crm 链接", "crm url"],
};

export type DesignCrmContactField = {
  value: string | null;
  note?: string;
};

export type DesignCrmVisitRecord = {
  id: string;
  crmVisitId?: string;
  visitDate?: string;
  customer?: string;
  customerCode?: string;
  salesperson?: string;
  region?: string;
  visitType?: string;
  summary?: string;
  nextStep?: string;
  productLine?: string;
  brand?: string;
  score?: string;
  grade?: string;
  crmUrl?: string;
  phone: DesignCrmContactField;
  email: DesignCrmContactField;
};

export type DesignCrmVisitToolDeps = {
  actorEmail?: string | null;
  botName?: string | null;
  token?: string;
  databaseId?: string;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

type NotionProperty = {
  type?: string;
  title?: Array<{ plain_text?: string }>;
  rich_text?: Array<{ plain_text?: string }>;
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  status?: { name?: string } | null;
  date?: { start?: string } | null;
  number?: number | null;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  unique_id?: { prefix?: string | null; number?: number | null };
  formula?: { string?: string | null; number?: number | null };
};

type NotionPage = {
  id?: string;
  parent?: { database_id?: string };
  properties?: Record<string, NotionProperty>;
  url?: string;
};

export function isDesignCrmVisitToolName(name: string): boolean {
  return (DESIGN_CRM_VISIT_TOOL_NAMES as readonly string[]).includes(name);
}

export function isDesignCrmVisitBot(name: string | null | undefined): boolean {
  return name?.trim() === DESIGN_CRM_VISIT_BOT_NAME;
}

export function isDesignCrmReadAllowed(email: string | null | undefined): boolean {
  return ALLOWED_READ_EMAILS.has((email ?? "").trim().toLowerCase());
}

/** Notion often returns dashed UUIDs; the locked mirror id is stored without dashes. */
export function sameNotionId(left: string | null | undefined, right: string | null | undefined) {
  const normalize = (value: string) => value.toLowerCase().replace(/[^0-9a-f]/g, "");
  const a = left ? normalize(left) : "";
  const b = right ? normalize(right) : "";
  return a.length > 0 && a === b;
}

export function redactPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  const masked = Math.max(digits.length - 5, 3);
  return `${digits.slice(0, 3)}${"*".repeat(masked)}${digits.slice(-2)}`;
}

export function redactEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `${value.slice(0, 1)}***${value.slice(at)}`;
}

export const designCrmVisitSearchTool: ConnectorTool = {
  name: DESIGN_CRM_VISIT_SEARCH,
  description:
    "Search Design CRM visit rows on the daily Notion mirror (not realtime). Phone and email are not on the mirror — say 镜像无此字段; never invent them. Readonly.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Customer, code, or summary text." },
      customer: { type: "string" },
      salesperson: { type: "string" },
      region: { type: "string" },
      visitType: { type: "string" },
      dateFrom: { type: "string", description: "Visit date lower bound, YYYY-MM-DD." },
      dateTo: { type: "string", description: "Visit date upper bound, YYYY-MM-DD." },
      crmVisitId: { type: "string" },
      cursor: { type: "string", description: "nextCursor from the previous page." },
    },
  },
  readOnly: true,
};

export const designCrmVisitGetTool: ConnectorTool = {
  name: DESIGN_CRM_VISIT_GET,
  description:
    "Read one Design CRM visit from the daily Notion mirror by page id or crm_visit_id. Phone and email: return 镜像无此字段 when the mirror has no such column. Readonly.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string", description: "Notion page id from design_crm_visit_search." },
      crmVisitId: { type: "string", description: "CRM visit id on the mirror row." },
    },
  },
  readOnly: true,
};

export async function searchDesignCrmVisits(
  deps: DesignCrmVisitToolDeps,
  input: {
    query?: string;
    customer?: string;
    salesperson?: string;
    region?: string;
    visitType?: string;
    dateFrom?: string;
    dateTo?: string;
    crmVisitId?: string;
    cursor?: string;
  },
) {
  const gate = authorizeDesignCrmVisit(deps);
  if (gate) return gate;
  const config = resolveConfig(deps);
  if ("error" in config) return config;
  const body: Record<string, unknown> = { page_size: SEARCH_PAGE_SIZE };
  const cursor = input.cursor?.trim();
  if (cursor) body.start_cursor = cursor;
  const filter = notionSearchFilter(input);
  if (filter) body.filter = filter;
  const payload = await notionJson(deps, config, {
    method: "POST",
    path: `/databases/${config.databaseId}/query`,
    body,
  });
  if ("error" in payload) return payload;
  const results = Array.isArray(payload.results) ? payload.results : [];
  const visits = results
    .filter((page): page is NotionPage => Boolean(page && typeof page === "object"))
    .map((page) => toVisitRecord(page))
    .filter((visit) => matchesClientFilter(visit, input));
  return {
    visits,
    source: "notion_mirror",
    realtime: false,
    ...(payload.has_more && typeof payload.next_cursor === "string"
      ? { nextCursor: payload.next_cursor }
      : {}),
  };
}

export async function getDesignCrmVisit(
  deps: DesignCrmVisitToolDeps,
  input: { id?: string; crmVisitId?: string },
) {
  const gate = authorizeDesignCrmVisit(deps);
  if (gate) return gate;
  const config = resolveConfig(deps);
  if ("error" in config) return config;
  const pageId = input.id?.trim();
  if (pageId) {
    const page = await notionJson(deps, config, {
      method: "GET",
      path: `/pages/${pageId}`,
    });
    if ("error" in page) return page;
    if (!sameNotionId(page.parent?.database_id, config.databaseId)) {
      return { error: "Visit is not in the Design CRM mirror." };
    }
    return { visit: toVisitRecord(page), source: "notion_mirror", realtime: false };
  }
  const crmVisitId = input.crmVisitId?.trim();
  if (!crmVisitId) return { error: "id or crmVisitId is required." };
  const listed = await searchDesignCrmVisits(deps, { crmVisitId });
  if ("error" in listed) return listed;
  const visit = listed.visits[0];
  if (!visit) return { error: "Visit not found." };
  return { visit, source: "notion_mirror", realtime: false };
}

function authorizeDesignCrmVisit(deps: DesignCrmVisitToolDeps) {
  if (!isDesignCrmReadAllowed(deps.actorEmail)) return { error: DESIGN_CRM_ACCESS_DENIED };
  if (!isDesignCrmVisitBot(deps.botName)) return { error: DESIGN_CRM_BOT_DENIED };
  return undefined;
}

function resolveConfig(deps: DesignCrmVisitToolDeps) {
  const env = deps.env ?? process.env;
  const token = (deps.token ?? env.DESIGN_CRM_NOTION_TOKEN ?? "").trim();
  const databaseId = (
    deps.databaseId ??
    env.DESIGN_CRM_NOTION_DATABASE_ID ??
    DESIGN_CRM_DEFAULT_DATABASE_ID
  ).trim();
  if (!token || !databaseId) return { error: DESIGN_CRM_NOT_CONFIGURED };
  return { token, databaseId };
}

async function notionJson(
  deps: DesignCrmVisitToolDeps,
  config: { token: string; databaseId: string },
  request: { method: "GET" | "POST"; path: string; body?: Record<string, unknown> },
) {
  const fetchFn = deps.fetch ?? fetch;
  const response = await fetchFn(`${NOTION_API}${request.path}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message =
      typeof payload.message === "string" && payload.message.trim()
        ? payload.message.trim()
        : `Notion request failed (${response.status}).`;
    return { error: message };
  }
  return payload as NotionPage & {
    results?: unknown[];
    has_more?: boolean;
    next_cursor?: string | null;
    parent?: { database_id?: string };
  };
}

function notionSearchFilter(input: {
  query?: string;
  customer?: string;
  salesperson?: string;
  region?: string;
  visitType?: string;
  dateFrom?: string;
  dateTo?: string;
  crmVisitId?: string;
}) {
  const clauses: Record<string, unknown>[] = [];
  const crmVisitId = input.crmVisitId?.trim();
  if (crmVisitId) {
    clauses.push({
      property: "crm_visit_id",
      rich_text: { equals: crmVisitId },
    });
  }
  const customer = input.customer?.trim();
  if (customer) clauses.push({ property: "客户", rich_text: { contains: customer } });
  const salesperson = input.salesperson?.trim();
  if (salesperson) clauses.push({ property: "业务员", rich_text: { contains: salesperson } });
  const region = input.region?.trim();
  if (region) clauses.push({ property: "大区", rich_text: { contains: region } });
  const visitType = input.visitType?.trim();
  if (visitType) clauses.push({ property: "拜访类型", select: { equals: visitType } });
  const query = input.query?.trim();
  if (query) {
    clauses.push({
      or: [
        { property: "客户", rich_text: { contains: query } },
        { property: "摘要", rich_text: { contains: query } },
        { property: "客户编码", rich_text: { contains: query } },
      ],
    });
  }
  const dateFrom = input.dateFrom?.trim();
  const dateTo = input.dateTo?.trim();
  if (dateFrom || dateTo) {
    clauses.push({
      property: "拜访日期",
      date: {
        ...(dateFrom ? { on_or_after: dateFrom } : {}),
        ...(dateTo ? { on_or_before: dateTo } : {}),
      },
    });
  }
  if (clauses.length === 0) return undefined;
  return clauses.length === 1 ? clauses[0] : { and: clauses };
}

function matchesClientFilter(
  visit: DesignCrmVisitRecord,
  input: {
    query?: string;
    customer?: string;
    salesperson?: string;
    region?: string;
    visitType?: string;
    dateFrom?: string;
    dateTo?: string;
    crmVisitId?: string;
  },
) {
  const query = input.query?.trim().toLowerCase();
  if (query) {
    const haystack = [visit.customer, visit.customerCode, visit.summary, visit.salesperson]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

function toVisitRecord(page: NotionPage): DesignCrmVisitRecord {
  const properties = page.properties ?? {};
  const fields = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([key, aliases]) => [
      key,
      firstProperty(properties, aliases),
    ]),
  ) as Record<keyof typeof FIELD_ALIASES, string | undefined>;
  return {
    id: page.id ?? "",
    ...omitUndefined(fields),
    crmUrl: fields.crmUrl ?? page.url,
    ...contactFields(properties),
  };
}

function contactFields(properties: Record<string, NotionProperty>): {
  phone: DesignCrmContactField;
  email: DesignCrmContactField;
} {
  let phoneValue: string | undefined;
  let emailValue: string | undefined;
  let sawPhone = false;
  let sawEmail = false;
  for (const [name, prop] of Object.entries(properties)) {
    const key = name.trim().toLowerCase();
    if (prop.type === "phone_number" || PHONE_PROPERTY_NAMES.has(key)) {
      sawPhone = true;
      phoneValue = propertyText(prop) ?? phoneValue;
    }
    if (prop.type === "email" || EMAIL_PROPERTY_NAMES.has(key)) {
      sawEmail = true;
      emailValue = propertyText(prop) ?? emailValue;
    }
  }
  return {
    phone: sawPhone
      ? { value: phoneValue ? redactPhone(phoneValue) : null }
      : { value: null, note: MISSING_MIRROR_FIELD },
    email: sawEmail
      ? { value: emailValue ? redactEmail(emailValue) : null }
      : { value: null, note: MISSING_MIRROR_FIELD },
  };
}

function firstProperty(properties: Record<string, NotionProperty>, aliases: readonly string[]) {
  const wanted = new Set(aliases.map((name) => name.toLowerCase()));
  for (const [name, prop] of Object.entries(properties)) {
    if (wanted.has(name.trim().toLowerCase())) return propertyText(prop);
  }
  return undefined;
}

function propertyText(prop: NotionProperty | undefined): string | undefined {
  if (!prop) return undefined;
  switch (prop.type) {
    case "title":
      return joinPlain(prop.title);
    case "rich_text":
      return joinPlain(prop.rich_text);
    case "select":
      return emptyToUndefined(prop.select?.name);
    case "status":
      return emptyToUndefined(prop.status?.name);
    case "multi_select":
      return emptyToUndefined(
        prop.multi_select
          ?.map((item) => item.name)
          .filter(Boolean)
          .join(", "),
      );
    case "date":
      return emptyToUndefined(prop.date?.start);
    case "number":
      return prop.number == null ? undefined : String(prop.number);
    case "url":
      return emptyToUndefined(prop.url ?? undefined);
    case "email":
      return emptyToUndefined(prop.email ?? undefined);
    case "phone_number":
      return emptyToUndefined(prop.phone_number ?? undefined);
    case "unique_id": {
      const number = prop.unique_id?.number;
      if (number == null) return undefined;
      return prop.unique_id?.prefix ? `${prop.unique_id.prefix}-${number}` : String(number);
    }
    case "formula":
      return (
        emptyToUndefined(prop.formula?.string ?? undefined) ??
        (prop.formula?.number == null ? undefined : String(prop.formula.number))
      );
    default:
      return undefined;
  }
}

function joinPlain(parts: Array<{ plain_text?: string }> | undefined) {
  return emptyToUndefined(parts?.map((part) => part.plain_text ?? "").join("") ?? "");
}

function emptyToUndefined(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function omitUndefined<T extends Record<string, string | undefined>>(fields: T) {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}
