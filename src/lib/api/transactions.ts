import type { ServerRuntime } from "../server.ts";
import { context, fail, ApiError, checkWriteOrigin, jsonBody, dbFailure } from "../server.ts";
import { UUID, validateDraft, fromDraft, type Draft, type Category, type Account, type Named } from "../domain.ts";
export async function POST(request: Request, runtime: ServerRuntime) {
  try {
    checkWriteOrigin(request, runtime); const { db, familyId } = await context(runtime); const body = await jsonBody(request);
    if (typeof body.request_id !== "string" || !UUID.test(body.request_id) || !Array.isArray(body.upserts) || !Array.isArray(body.deletes) || body.upserts.length + body.deletes.length > 1000) throw new ApiError("올바른 저장 요청과 1,000행 이내의 변경사항이 필요합니다.");
    const [cs, ms, as] = await Promise.all([db.from("categories").select("*").eq("family_id", familyId), db.from("payment_methods").select("id,name").eq("family_id", familyId), db.from("accounts").select("id,name,kind").eq("family_id", familyId)]);
    if (cs.error || ms.error || as.error) throw new ApiError("분류·계좌를 검증하지 못했습니다. 입력은 보존됩니다.", 503);
    const errors: Record<string, unknown> = {}; const upserts = [];
    for (const [i, value] of body.upserts.entries()) {
      if (!value || typeof value !== "object" || typeof value.amount !== "string" || typeof value.description !== "string" || typeof value.memo !== "string" || typeof value.date !== "string") throw new ApiError(`${i + 1}행의 형식이 올바르지 않습니다.`);
      const row = value as Draft;
      const invalid = validateDraft(row, cs.data as Category[], ms.data as Named[], as.data as Account[]);
      if (Object.keys(invalid).length) errors[row.id] = invalid;
      else upserts.push(fromDraft(row));
    }
    if (Object.keys(errors).length) return Response.json({ error: "표시된 셀 오류를 수정하세요. 저장된 행은 없습니다.", errors }, { status: 422 });
    for (const row of body.deletes) if (!row || typeof row.id !== "string" || !UUID.test(row.id) || !Number.isInteger(row.version) || row.version < 1) throw new ApiError("삭제 대상 ID·버전을 확인하세요.");
    const payload: Record<string, unknown> = { upserts, deletes: body.deletes };
    if (body.import) {
      const source = body.import as Record<string, unknown>;
      if (typeof source.source !== "string" || source.source.length > 80 || typeof source.filename !== "string" || source.filename.length > 200) throw new ApiError("가져오기 출처를 확인하세요.");
      payload.import = { source: source.source, filename: source.filename };
    }
    const result = await db.rpc("save_transactions", { p_family: familyId, p_request: body.request_id, p_payload: payload });
    if (result.error) dbFailure(result.error);
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
