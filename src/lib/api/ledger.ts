import { redactModificationDates } from "../permissions.ts";
import type { ServerRuntime } from "../server.ts";
import { context, fail, ApiError, dbFailure } from "../server.ts";
import { validMonth, UUID } from "../domain.ts";
import { resolvePeriod, selectionFromParams } from "../periods.ts";
export async function GET(request: Request, runtime: ServerRuntime) {
  try {
    const { db, familyId, canViewModificationDates } = await context(runtime);
    const params = new URL(request.url).searchParams, month = params.get("month") ?? "";
    if (!validMonth(month)) throw new ApiError("올바른 연월을 선택하세요.");
    // Conflict comparison must still find an edited row if its date moved outside the current period.
    if (params.has("ids")) {
      const ids = [...new Set((params.get("ids") ?? "").split(","))];
      if (!ids.length || ids.length > 100 || ids.some(id => !UUID.test(id))) throw new ApiError("비교할 거래 ID를 확인하세요.");
      const result = await db.from("transactions_visible").select("*", { count: "exact" }).eq("family_id", familyId).is("deleted_at", null).in("id", ids).order("id").limit(100);
      if (result.error) dbFailure(result.error);
      if (result.count === null || result.data?.length !== result.count) throw new ApiError("비교할 거래를 모두 조회하지 못했습니다.",503);
      return Response.json(redactModificationDates({ transactions: result.data }, canViewModificationDates), { headers: { "Cache-Control": "private, no-store" } });
    }
    if (!params.has("mode")) {
      // Existing saved integrations retain their original calendar-month contract.
      const result = await db.rpc("load_ledger", { p_family: familyId, p_month: month, p_annual: params.get("annual") === "1" });
      if (result.error) dbFailure(result.error);
      return Response.json(redactModificationDates({ ...result.data, permissions: { view_modification_dates: canViewModificationDates } }, canViewModificationDates), { headers: { "Cache-Control": "private, no-store" } });
    }
    let period;
    try { period = resolvePeriod(selectionFromParams(params), params.get("annual") === "1"); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "조회 기간을 확인하세요."); }
    const result = await db.rpc("load_ledger_range", { p_family: familyId, p_month: period.month, p_mode: period.mode,
      p_start: period.mode === "custom" ? period.start : null, p_end: period.mode === "custom" ? period.end : null, p_annual: period.annual });
    if (result.error) dbFailure(result.error);
    const data = result.data;
    if (!data || !Array.isArray(data.transactions) || data.record_count !== data.transactions.length || !data.period
        || data.period.start !== period.start || data.period.end !== period.end || data.period.mode !== period.mode || data.period.annual !== period.annual) {
      throw new ApiError("요청한 기간의 거래를 모두 조회하지 못했습니다. 다시 조회하세요.",503);
    }
    return Response.json(redactModificationDates({ ...data, permissions: { view_modification_dates: canViewModificationDates } }, canViewModificationDates), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
