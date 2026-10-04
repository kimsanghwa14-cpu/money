import { createBrowserClient } from "@supabase/ssr";
import { browserConfig, configured } from "./config";
export function browserClient() {
  const config = browserConfig();
  if (!configured(config)) throw new Error("Supabase 연결 설정이 필요합니다.");
  return createBrowserClient(config.NEXT_PUBLIC_SUPABASE_URL!, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
