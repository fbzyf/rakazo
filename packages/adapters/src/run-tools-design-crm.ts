import {
  DESIGN_CRM_VISIT_GET,
  DESIGN_CRM_VISIT_SEARCH,
  getDesignCrmVisit,
  searchDesignCrmVisits,
} from "./design-crm-tools.js";
import type { ToolHandlers } from "./run-tool-gate.js";

/** Readonly Design CRM visit mirror. Offered only on 客服助手. */
export const designCrmTools: ToolHandlers = {
  async [DESIGN_CRM_VISIT_SEARCH](ctx, call) {
    const { deps, run, bot } = ctx;
    const { args } = call;
    const actor = await deps.prisma.user.findUnique({
      where: { id: run.userId },
      select: { email: true },
    });
    const crmDeps = {
      actorEmail: actor?.email,
      botName: bot.name,
    };
    return call.finish(
      await searchDesignCrmVisits(crmDeps, {
        query: args.query !== undefined ? String(args.query) : undefined,
        customer: args.customer !== undefined ? String(args.customer) : undefined,
        salesperson: args.salesperson !== undefined ? String(args.salesperson) : undefined,
        region: args.region !== undefined ? String(args.region) : undefined,
        visitType: args.visitType !== undefined ? String(args.visitType) : undefined,
        dateFrom: args.dateFrom !== undefined ? String(args.dateFrom) : undefined,
        dateTo: args.dateTo !== undefined ? String(args.dateTo) : undefined,
        crmVisitId: args.crmVisitId !== undefined ? String(args.crmVisitId) : undefined,
        cursor: args.cursor !== undefined ? String(args.cursor) : undefined,
      }),
    );
  },
  async [DESIGN_CRM_VISIT_GET](ctx, call) {
    const { deps, run, bot } = ctx;
    const { args } = call;
    const actor = await deps.prisma.user.findUnique({
      where: { id: run.userId },
      select: { email: true },
    });
    const crmDeps = {
      actorEmail: actor?.email,
      botName: bot.name,
    };
    return call.finish(
      await getDesignCrmVisit(crmDeps, {
        id: args.id !== undefined ? String(args.id) : undefined,
        crmVisitId: args.crmVisitId !== undefined ? String(args.crmVisitId) : undefined,
      }),
    );
  },
};
