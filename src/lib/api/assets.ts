import type { ServerRuntime } from "../server.ts";
import { ApiError, checkWriteOrigin, context, dbFailure, fail, jsonBody } from "../server.ts";
import { UUID } from "../domain.ts";
import { normalizeAsset } from "../assets.ts";

export async function GET(_request: Request, runtime: ServerRuntime) {
  try {
    const { db, familyId } = await context(runtime);
    const result = await db.from("assets").select("id,name,owner,kind,basis_date,balance,memo,version,accounting,created_at,updated_at,updated_by", { count: "exact" })
      .eq("family_id", familyId).is("deleted_at", null).order("kind").order("name").order("id").limit(1000);
    if (result.error) throw new ApiError("자산·대출 내역을 조회하지 못했습니다. 잠시 후 다시 시도하세요.", 503);
    if (result.count === null || result.count > 1000 || result.data?.length !== result.count) throw new ApiError("자산·대출 내역을 모두 조회하지 못했습니다. 조회 한도는 1,000개입니다.", 503);
    return Response.json({ assets: result.data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request, runtime: ServerRuntime) {
  try {
    checkWriteOrigin(request, runtime);
    const { db, familyId } = await context(runtime), body = await jsonBody(request);
    if (typeof body.request_id !== "string" || !UUID.test(body.request_id) || !Array.isArray(body.upserts) || !Array.isArray(body.deletes) || body.upserts.length + body.deletes.length < 1 || body.upserts.length + body.deletes.length > 1000) throw new ApiError("자산·대출 저장 요청을 확인하세요.");
    let upserts;
    try { upserts = body.upserts.map(normalizeAsset); }
    catch (error) { throw new ApiError(error instanceof Error ? error.message : "입력을 확인하세요."); }
    const deletes = body.deletes.map(value => {
      if (!value || typeof value !== "object" || typeof value.id !== "string" || !UUID.test(value.id) || !Number.isInteger(value.version) || value.version < 1) throw new ApiError("삭제할 항목의 ID·버전을 확인하세요.");
      return { id: value.id, version: value.version };
    });
    const result = await db.rpc("save_assets", { p_family: familyId, p_request: body.request_id, p_payload: { upserts, deletes } });
    if (result.error) dbFailure(result.error);
    return Response.json(result.data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return fail(error); }
}
