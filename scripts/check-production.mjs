import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { MONEY_PUBLIC_CONFIG } from "../src/lib/supabase/config.ts";

const site = MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SITE_URL;
const browser = await chromium.launch();
try {
  let ready = false;
  for (let attempt = 0; attempt < 18; attempt++) {
    try {
      const response = await fetch(`${site}/api/session`, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (response.status === 401 && typeof data.error === "string") {
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        ready = true;
        break;
      }
      console.log(`Production deployment pending: session HTTP ${response.status}`);
    } catch {
      console.log("Production deployment pending: session endpoint unavailable");
    }
    if (attempt < 17) await new Promise(resolve => setTimeout(resolve, 10000));
  }
  assert.ok(ready, "Production must return JSON HTTP 401 for an unauthenticated session");
  console.log("Production session and no-cache checks passed");

  const settingsResponse = await fetch(`${MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(10000),
  });
  assert.ok(settingsResponse.ok, "Supabase public connection must be reachable");
  const settings = await settingsResponse.json();
  assert.equal(settings.external.email, true, "Email login must be enabled");
  console.log(`Supabase email auth reachable; public signup disabled: ${settings.disable_signup === true}`);

  const anonymousRead = await fetch(`${MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/transactions?select=id&limit=1`, {
    headers: { apikey: MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(10000),
  });
  assert.ok([401, 403].includes(anonymousRead.status), "Anonymous ledger reads must be denied");
  console.log("Anonymous direct ledger access denied");

  for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(site, { waitUntil: "domcontentloaded" });
    await page.waitForURL(`${site}/login`, { timeout: 20000 });
    await page.getByRole("heading", { name: "가족 계정으로 로그인" }).waitFor();
    assert.ok(await page.getByLabel("이메일", { exact: true }).isVisible());
    assert.ok(await page.getByLabel("비밀번호", { exact: true }).isVisible());
    assert.ok(await page.getByRole("button", { name: "로그인", exact: true }).isVisible());
    assert.deepEqual(errors, []);
    console.log(`Production ${name} login page verified`);
    await context.close();
  }
} finally {
  await browser.close();
}
