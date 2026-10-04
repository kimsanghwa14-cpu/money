import type { ServerRuntime } from "../server.ts";
import { context, fail, checkWriteOrigin, jsonBody, ApiError, dbFailure } from "../server.ts";
import { OWNERS, UUID, parseAmount, validMonth, koreaDate } from "../domain.ts";
export async function POST(request: Request, runtime: ServerRuntime) {
  try {
    checkWriteOrigin(request, runtime); const { db, familyId } = await context(runtime); const body = await jsonBody(request); const r = body.rule as Record<string, unknown> | undefined;
    if (!r || typeof r.name !== "string" || !r.name.trim() || r.name.length > 120 || !OWNERS.includes(r.owner as never) || !["income", "expense", "saving", "loan_principal"].includes(String(r.kind)) || !UUID.test(String(r.category_id)) || !Number.isInteger(r.day) || Number(r.day) < 1 || Number(r.day) > 31 || !Number.isInteger(r.interval_months) || Number(r.interval_months) < 1 || Number(r.interval_months) > 12 || !validMonth(String(r.effective_month)) || !validMonth(String(r.start_month)) || r.end_month && (!validMonth(String(r.end_month)) || String(r.end_month) < String(r.start_month)) || typeof r.enabled !== "boolean") throw new ApiError("고정비 항목·금액·날짜·반복주기를 확인하세요.");
    if (typeof body.request_id !== "string" || !UUID.test(body.request_id)) throw new ApiError("저장 요청 ID를 확인하세요.");
    if (r.rule_id && String(r.effective_month) < koreaDate().slice(0, 7)) throw new ApiError("규칙 변경은 이번 달 이후에 적용하세요. 과거 계획은 유지됩니다.");
    for (const key of ["id", "rule_id", "account_id", "payment_method_id"]) if (r[key] && !UUID.test(String(r[key]))) throw new ApiError("규칙·계좌 식별자를 확인하세요.");
    const result = await db.rpc("save_recurring_rule", { p_family: familyId, p_request: body.request_id, p_rule: { ...r, amount: parseAmount(r.amount) } });
    if (result.error) dbFailure(result.error); return Response.json({ rule_id: result.data });
  } catch (error) { return fail(error); }
}
