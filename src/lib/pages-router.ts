import type { ServerRuntime } from "./server.ts";
import { context, fail } from "./server.ts";
import { GET as ledger } from "./api/ledger.ts";
import { POST as transactions } from "./api/transactions.ts";
import { POST as budgets } from "./api/budgets.ts";
import { POST as settings } from "./api/settings.ts";
import { POST as recurring } from "./api/recurring.ts";

const routes: Record<string, { method: string; handle: (request: Request, runtime: ServerRuntime) => Promise<Response> }> = {
  "/api/ledger": { method: "GET", handle: ledger },
  "/api/transactions": { method: "POST", handle: transactions },
  "/api/budgets": { method: "POST", handle: budgets },
  "/api/settings": { method: "POST", handle: settings },
  "/api/recurring": { method: "POST", handle: recurring },
  "/api/session": { method: "GET", handle: async (_request, runtime) => {
    try {
      await context(runtime);
      return Response.json({ configured: true });
    } catch (error) { return fail(error); }
  } },
};

export async function dispatchApi(request: Request, runtime: ServerRuntime): Promise<Response> {
  const route = routes[new URL(request.url).pathname];
  if (!route) return Response.json({ error: "API를 찾을 수 없습니다." }, { status: 404 });
  if (request.method !== route.method) {
    return Response.json({ error: "허용되지 않은 요청 방식입니다." }, { status: 405, headers: { Allow: route.method } });
  }
  return route.handle(request, runtime);
}
