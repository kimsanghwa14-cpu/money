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
export function configured(values: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string } = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}): boolean {
  const url = values.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !validPublicKey(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) return false;
  try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
}
