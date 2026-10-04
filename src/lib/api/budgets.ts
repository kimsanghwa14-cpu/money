import type { ServerRuntime } from "../server.ts";
import { context, fail, checkWriteOrigin, jsonBody, ApiError, dbFailure } from "../server.ts";
import { UUID, OWNERS, parseAmount, validMonth } from "../domain.ts";
export async function POST(request: Request, runtime: ServerRuntime) {
  try {
    checkWriteOrigin(request, runtime); const { db, familyId } = await context(runtime); const body = await jsonBody(request);
    if (typeof body.request_id !== "string" || !UUID.test(body.request_id) || !Array.isArray(body.budgets) || body.budgets.length > 1000) throw new ApiError("예산 저장 형식을 확인하세요.");
    const budgets = body.budgets.map((b, i) => {
      if (!b || !UUID.test(b.id) || !validMonth(b.month) || !OWNERS.includes(b.owner) || !UUID.test(b.category_id) || !Number.isInteger(b.version) || b.version < 0 || typeof b.label !== "string" || b.label.length > 120) throw new ApiError(`${i + 1}행의 예산 형식을 확인하세요.`);
      return { ...b, amount: parseAmount(b.amount, true) };
    });
    const result = await db.rpc("save_budgets", { p_family: familyId, p_request: body.request_id, p_payload: { budgets } });
    if (result.error) dbFailure(result.error); return Response.json(result.data);
  } catch (error) { return fail(error); }
}
