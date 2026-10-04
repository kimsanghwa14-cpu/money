export interface PublicConfig {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}

// Public connection information for the existing money Pages site only.
// Authorization is enforced by verified sessions, family membership and DB RLS.
export const MONEY_PUBLIC_CONFIG = {
  NEXT_PUBLIC_SUPABASE_URL: "https://uqwoshogxwayntrpajdi.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_UaC1hnK_SAEff8zKahLYew_OpXKTzzV",
  NEXT_PUBLIC_SITE_URL: "https://money-ab4.pages.dev",
} as const;

export function resolvePublicConfig(values: PublicConfig, hostname: string): PublicConfig {
  if (hostname !== "money-ab4.pages.dev") return values;
  // Never combine another project's URL with this project's public key.
  const suppliedUrl = values.NEXT_PUBLIC_SUPABASE_URL;
  if (suppliedUrl && suppliedUrl.replace(/\/$/, "") !== MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_URL) return values;
  return {
    NEXT_PUBLIC_SUPABASE_URL: suppliedUrl || MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: values.NEXT_PUBLIC_SITE_URL || MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SITE_URL,
  };
}

export function browserConfig(): PublicConfig {
  return resolvePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  }, typeof window === "undefined" ? "" : window.location.hostname);
}

export function validPublicKey(key: string | undefined): boolean {
  if (!key || key.startsWith("sb_secret_")) return false;
  try {
    if (key.startsWith("eyJ")) {
      const claims = JSON.parse(atob(key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")));
      return claims.role === "anon";
    }
    return /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  } catch { return false; }
}
export function configured(values: PublicConfig = browserConfig()): boolean {
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !validPublicKey(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return false;
  try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
}
