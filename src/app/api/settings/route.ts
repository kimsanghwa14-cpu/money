import { NextResponse } from "next/server";
import { context, fail, checkWriteOrigin, jsonBody, ApiError, dbFailure } from "@/lib/server";
import { UUID } from "@/lib/domain";
export async function POST(request: Request) {
  try {
    checkWriteOrigin(request); const { db, familyId } = await context(); const body = await jsonBody(request);
    if (typeof body.request_id !== "string" || !UUID.test(body.request_id) || !["account", "method", "category"].includes(String(body.type)) || !body.item || typeof body.item !== "object") throw new ApiError("설정 항목과 저장 요청을 확인하세요.");
    const result = await db.rpc("save_reference", { p_family: familyId, p_request: body.request_id, p_type: body.type, p_item: body.item });
    if (result.error) dbFailure(result.error); return NextResponse.json({ id: result.data });
  } catch (error) { return fail(error); }
}
