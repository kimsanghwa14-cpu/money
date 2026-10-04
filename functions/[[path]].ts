import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { configured, resolvePublicConfig } from "../src/lib/supabase/config";
import { dispatchApi } from "../src/lib/pages-router";
import { fail, ApiError, type ServerRuntime } from "../src/lib/server";

interface Env {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}
interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

export async function onRequest({ request, env, next }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/") && url.pathname !== "/auth/callback") return next();
  const config = resolvePublicConfig(env, url.hostname);
  const cookies = new Map<string, string>(parseCookieHeader(request.headers.get("Cookie") ?? "").map(c => [c.name, c.value ?? ""]));
  const outgoingCookies: string[] = [];
  let client: ReturnType<typeof createServerClient> | undefined;
  const runtime: ServerRuntime = {
    configured: configured(config),
    siteUrl: config.NEXT_PUBLIC_SITE_URL,
    client: async () => {
      if (!runtime.configured) throw new ApiError("DB 미연결: Supabase 환경변수를 설정하세요.", 503);
      client ??= createServerClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        cookies: {
          getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
          setAll: values => values.forEach(({ name, value, options }) => {
            cookies.set(name, value);
            outgoingCookies.push(serializeCookieHeader(name, value, options));
          }),
        },
      });
      return client;
    },
  };
  let response: Response;
  try {
    if (url.pathname === "/auth/callback") {
      if (request.method !== "GET") {
        response = Response.json({ error: "GET 요청이 필요합니다." }, { status: 405, headers: { Allow: "GET" } });
      } else {
        const code = url.searchParams.get("code");
        const site = config.NEXT_PUBLIC_SITE_URL ?? url.origin;
        const error = code ? (await (await runtime.client()).auth.exchangeCodeForSession(code)).error : true;
        response = Response.redirect(new URL(error ? "/login?error=callback" : "/", site), 303);
      }
    } else {
      response = await dispatchApi(request, runtime);
    }
  } catch (error) { response = fail(error); }
  // Redirect responses have immutable headers; clone before appending refreshed auth cookies.
  const result = new Response(response.body, response);
  result.headers.set("Cache-Control", "private, no-store");
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "same-origin");
  result.headers.set("X-Frame-Options", "DENY");
  for (const cookie of outgoingCookies) result.headers.append("Set-Cookie", cookie);
  return result;
}
