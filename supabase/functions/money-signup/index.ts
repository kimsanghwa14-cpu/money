import { validateSignup } from "../../../src/lib/auth/input.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
type Environment = { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };
type Fetcher = typeof fetch;
const allowedOrigins = new Set(["https://money-ab4.pages.dev", "http://localhost:3000", "http://127.0.0.1:3000"]);

export async function handleSignup(request: Request, env: Environment, fetcher: Fetcher = fetch): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "private, no-store", "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (!allowedOrigins.has(origin)) return reply({ error: "허용되지 않은 요청 출처입니다." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "POST 요청이 필요합니다." }, 405);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "JSON 요청이 필요합니다." }, 415);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return reply({ error: "회원가입 서버를 준비하는 중입니다." }, 503);
  let input;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 4096) return reply({ error: "가입 정보가 너무 깁니다." }, 413);
    input = validateSignup(JSON.parse(text));
  } catch (error) { return reply({ error: error instanceof SyntaxError ? "가입 정보를 확인하세요." : error instanceof Error ? error.message : "가입 정보를 확인하세요." }, 400); }

  const adminHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };
  const post = (path: string, body: unknown) => fetcher(`${env.SUPABASE_URL}${path}`, {
    method: "POST", headers: adminHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  let ticket: string | undefined;
  try {
    const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    const rate = await post("/rest/v1/rpc/check_signup_rate", { p_fingerprint: fingerprint });
    if (!rate.ok) return reply({ error: "회원가입 서버에 연결하지 못했습니다." }, 503);
    if (await rate.json() !== true) return reply({ error: "가입 시도가 많습니다. 10분 후 다시 시도하세요." }, 429);

    const reserved = await post("/rest/v1/rpc/prepare_signup", { p_code: input.code, p_username: input.username, p_display_name: input.displayName });
    if (!reserved.ok) return reply({ error: "회원가입 서버에 연결하지 못했습니다." }, 503);
    const reservation = await reserved.json();
    if (reservation.error === "invalid_code") return reply({ error: "회원가입 코드가 올바르지 않거나 사용할 수 없습니다." }, 403);
    if (reservation.error === "username_taken") return reply({ error: "이미 사용 중이거나 가입 처리 중인 아이디입니다." }, 409);
    if (typeof reservation.ticket !== "string" || typeof reservation.email !== "string") return reply({ error: "가입 정보를 확인하세요." }, 400);
    ticket = reservation.ticket;
    // Admin credentials never leave this server. The Auth trigger verifies this
    // server-issued ticket and adds membership in the same user creation transaction.
    const created = await post("/auth/v1/admin/users", {
      email: reservation.email, password: input.password, email_confirm: true,
      app_metadata: { ledger_signup_ticket: ticket },
    });
    if (!created.ok) {
      return reply({ error: [409, 422].includes(created.status) ? "이미 사용 중인 아이디입니다. 로그인하거나 다른 아이디를 입력하세요." : "가입 처리에 실패했습니다. 잠시 후 다시 시도하세요." }, [409, 422].includes(created.status) ? 409 : 503);
    }
    return reply({ created: true }, 201);
  } catch { return reply({ error: "가입 결과를 확인하지 못했습니다. 로그인 화면에서 계정을 확인하거나 잠시 후 다시 시도하세요." }, 503); }
  finally {
    // Only unused reservations can be cancelled; a committed account is preserved.
    if (ticket) await post("/rest/v1/rpc/cancel_signup", { p_ticket: ticket }).catch(() => {});
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve(request => handleSignup(request, {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  }));
}
