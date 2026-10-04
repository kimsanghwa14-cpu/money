import type { createServerClient } from "@supabase/ssr";
export interface ServerRuntime {
  configured: boolean;
  siteUrl?: string;
  client: () => Promise<ReturnType<typeof createServerClient>>;
}
export class ApiError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export async function context(runtime: ServerRuntime) {
  if (!runtime.configured) throw new ApiError("DB 미연결: Supabase 환경변수를 설정하세요.", 503);
  const db = await runtime.client();
  const { data, error } = await db.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && (!error.status || error.status >= 500)) throw new ApiError("인증 서버에 연결하지 못했습니다. 네트워크와 Supabase 주소를 확인하세요.", 503);
  if (error || !data.user) throw new ApiError("로그인이 필요하거나 인증 서버에 연결하지 못했습니다.", 401);
  const memberResult = await db.from("family_members").select("family_id,user_id,display_name,role").eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (memberResult.error) throw new ApiError("가족 정보를 조회하지 못했습니다. DB 마이그레이션과 연결을 확인하세요.", 503);
  if (!memberResult.data) throw new ApiError("승인된 가족 구성원만 접근할 수 있습니다.", 403);
  return { db, member: memberResult.data, familyId: memberResult.data.family_id as string };
}
export function checkWriteOrigin(request: Request, runtime: ServerRuntime) {
  const origin = request.headers.get("origin");
  const siteUrl = runtime.siteUrl;
  const allowed = siteUrl ? new URL(siteUrl).origin : new URL(request.url).origin;
  if (!origin || origin !== allowed) throw new ApiError("허용되지 않은 요청 출처입니다.", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError("JSON 요청이 필요합니다.", 415);
}
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 2_000_000) throw new ApiError("요청 크기는 2MB 이내로 제한됩니다.", 413);
  let result: unknown; try { result = JSON.parse(text); } catch { throw new ApiError("JSON 형식이 올바르지 않습니다."); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new ApiError("객체 형태의 요청이 필요합니다.");
  return result as Record<string, unknown>;
}
export function fail(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "요청을 처리하지 못했습니다." }, { status: error instanceof ApiError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
}
export function dbFailure(error: { code?: string; message: string }): never {
  if (error.code === "PT409") throw new ApiError(error.message, 409);
  if (error.code === "40001" || error.code === "23505") throw new ApiError(error.code === "23505" ? "이미 저장된 거래 ID·원본 ID 또는 같은 이름의 설정이 있습니다. 중복 내역을 확인하세요." : error.message, 409);
  if (error.code === "42501") throw new ApiError("가족 접근 권한이 없습니다.", 403);
  throw new ApiError(error.code === "23503" ? "가족에 속한 분류·계좌·원거래를 선택하세요." : error.message, 400);
}
