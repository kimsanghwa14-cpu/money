import type { NextConfig } from "next";
import { validPublicKey } from "./src/lib/supabase/config";
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Fail before bundling: returning a disconnected screen alone would still embed NEXT_PUBLIC values.
if (publicKey && !validPublicKey(publicKey)) throw new Error("Supabase 공개 키 설정을 확인하세요. publishable/anon 키만 사용하며 secret/service-role 키는 사용할 수 없습니다.");
const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
    ] }];
  },
};
export default config;
