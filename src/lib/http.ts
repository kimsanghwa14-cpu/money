export class HttpError extends Error {
  status: number; details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) { super(message); this.status = status; this.details = details; }
}
export async function postJson(path: string, body: unknown) {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" }); }
  catch { throw new HttpError("서버에 연결하지 못했습니다. 입력은 보존됩니다. 같은 저장 요청을 다시 시도할 수 있습니다.", 0); }
  const result = await response.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다. 입력은 보존됩니다." }));
  if (!response.ok) throw new HttpError(result.error ?? "저장에 실패했습니다.", response.status, result);
  return result;
}
