import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configured } from "./config";
export async function serverClient() {
  if (!configured()) throw new Error("DB 미연결: Supabase URL과 공개 키를 설정하세요.");
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: values => { try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* Server components: proxy refreshes cookies. */ } },
    },
  });
}
