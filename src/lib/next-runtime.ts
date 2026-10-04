import "server-only";
import { serverClient } from "./supabase/server";
import { configured } from "./supabase/config";
import type { ServerRuntime } from "./server";

export function nextRuntime(): ServerRuntime {
  return {
    configured: configured(),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    client: serverClient,
  };
}
