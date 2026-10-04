import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { validPublicKey } from "./src/lib/supabase/config";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "NEXT_PUBLIC_");
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publicKey && !validPublicKey(publicKey)) {
    throw new Error("Supabase publishable/anon 공개 키만 사용할 수 있습니다.");
  }
  return {
    plugins: [react()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    define: {
      "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? ""),
      "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicKey ?? ""),
      "process.env.NEXT_PUBLIC_SITE_URL": env.NEXT_PUBLIC_SITE_URL ? JSON.stringify(env.NEXT_PUBLIC_SITE_URL) : "undefined",
    },
    build: { outDir: "dist" },
  };
});
