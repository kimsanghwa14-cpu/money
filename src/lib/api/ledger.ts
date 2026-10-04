import type { ServerRuntime } from "../server.ts";
import { context, fail, ApiError, dbFailure } from "../server.ts";
import { validMonth } from "../domain.ts";
export async function GET(request: Request, runtime: ServerRuntime) {
  try {
    const { db, familyId } = await context(runtime);
    const params = new URL(request.url).searchParams, month = params.get("month") ?? "";
    if (!validMonth(month)) throw new ApiError("올바른 연월을 선택하세요.");
    const result = await db.rpc("load_ledger", { p_family: familyId, p_month: month, p_annual: params.get("annual") === "1" });
    if (result.error) dbFailure(result.error);
    return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
