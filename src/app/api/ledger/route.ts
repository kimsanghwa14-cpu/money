import { NextResponse } from "next/server";
import { context, fail, ApiError, dbFailure } from "@/lib/server";
import { validMonth } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { db, familyId } = await context();
    const params = new URL(request.url).searchParams, month = params.get("month") ?? "";
    if (!validMonth(month)) throw new ApiError("올바른 연월을 선택하세요.");
    const result = await db.rpc("load_ledger", { p_family: familyId, p_month: month, p_annual: params.get("annual") === "1" });
    if (result.error) dbFailure(result.error);
    return NextResponse.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
