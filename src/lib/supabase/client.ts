import { createBrowserClient } from "@supabase/ssr";
import { configured } from "./config";
export function browserClient() {
  if (!configured()) throw new Error("Supabase 연결 설정이 필요합니다.");
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
