import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url), code = url.searchParams.get("code");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  if (code) {
    const db = await serverClient(); const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", site));
  }
  return NextResponse.redirect(new URL("/login?error=callback", site));
}
