import { context, fail, dbFailure, ApiError, type ServerRuntime } from "../server.ts";
import { redactModificationDates } from "../permissions.ts";
export async function GET(_request: Request, runtime: ServerRuntime) {
  try {
    const { db, familyId, canViewModificationDates } = await context(runtime);
    const result = await db.rpc("load_dashboard", { p_family: familyId });
    if (result.error) dbFailure(result.error);
    const body = result.data;
    if (!body || body.family?.id !== familyId || !Array.isArray(body.transactions) || body.record_count !== body.transactions.length || !Array.isArray(body.categories)) throw new ApiError("월별 집계 자료를 모두 조회하지 못했습니다.", 503);
    return Response.json(redactModificationDates(body, canViewModificationDates), { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) { return fail(cause); }
}
