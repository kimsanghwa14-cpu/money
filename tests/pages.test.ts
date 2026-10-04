import test from "node:test";
import assert from "node:assert/strict";
import { dispatchApi } from "../src/lib/pages-router.ts";
import { configured, MONEY_PUBLIC_CONFIG, resolvePublicConfig } from "../src/lib/supabase/config.ts";
import type { ServerRuntime } from "../src/lib/server.ts";

const site = "https://money-ab4.pages.dev";
function runtime({ user = true, member = true, connected = true } = {}) {
  const calls: unknown[] = [];
  const query = {
    select() { return query; },
    eq() { return query; },
    async maybeSingle() { return { data: member ? { family_id: "family-id", user_id: "user-id", role: "editor" } : null, error: null }; },
  };
  const db = {
    auth: { async getUser() { return { data: { user: user ? { id: "user-id" } : null }, error: null }; } },
    from() { return query; },
    async rpc(name: string, args: unknown) { calls.push({ name, args }); return { data: { transactions: [] }, error: null }; },
  };
  const value = { configured: connected, siteUrl: site, client: async () => db } as unknown as ServerRuntime;
  return { value, calls };
}
function request(path: string, method = "GET", body?: unknown, origin = site) {
  return new Request(site + path, { method, headers: { Origin: origin, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test("Pages API returns JSON 503 when Supabase is not configured", async () => {
  const r = await dispatchApi(request("/api/session"), runtime({ connected: false }).value);
  assert.equal(r.status, 503); assert.match((await r.json()).error, /DB 미연결/);
});
test("Pages verifies login and approved family membership", async () => {
  assert.equal((await dispatchApi(request("/api/session"), runtime({ user: false }).value)).status, 401);
  assert.equal((await dispatchApi(request("/api/session"), runtime({ member: false }).value)).status, 403);
  const r = await dispatchApi(request("/api/session"), runtime().value);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { configured: true });
});
test("Every Pages data route requires an authenticated approved family", async () => {
  for (const [user, member, status] of [[false, true, 401], [true, false, 403]] as const) {
    const { value, calls } = runtime({ user, member });
    for (const path of ["transactions", "budgets", "settings", "recurring", "assets"]) {
      assert.equal((await dispatchApi(request(`/api/${path}`, "POST", {}), value)).status, status);
    }
    assert.equal((await dispatchApi(request("/api/ledger?month=2026-10"), value)).status, status);
    assert.equal((await dispatchApi(request("/api/assets"), value)).status, status);
    assert.equal(calls.length, 0);
  }
});
test("Pages prevents writes from a different origin on all write routes", async () => {
  const { value, calls } = runtime();
  for (const path of ["transactions", "budgets", "settings", "recurring", "assets"]) {
    assert.equal((await dispatchApi(request(`/api/${path}`, "POST", {}, "https://other.example"), value)).status, 403);
  }
  assert.equal(calls.length, 0);
});
test("Pages routes reject incorrect methods and unknown API paths", async () => {
  const value = runtime().value;
  const r = await dispatchApi(request("/api/transactions"), value);
  assert.equal(r.status, 405); assert.equal(r.headers.get("Allow"), "POST");
  assert.equal((await dispatchApi(request("/api/missing"), value)).status, 404);
});
test("Pages ledger passes the approved family and requested month to the existing RPC", async () => {
  const { value, calls } = runtime();
  const r = await dispatchApi(request("/api/ledger?month=2026-10&annual=1"), value);
  assert.equal(r.status, 200); assert.deepEqual(calls, [{ name: "load_ledger", args: { p_family: "family-id", p_month: "2026-10", p_annual: true } }]);
});
test("Pages rejects invalid months and invalid save payloads before RPC", async () => {
  const { value, calls } = runtime();
  assert.equal((await dispatchApi(request("/api/ledger?month=invalid"), value)).status, 400);
  for (const path of ["transactions", "budgets", "settings", "recurring", "assets"]) {
    assert.equal((await dispatchApi(request(`/api/${path}`, "POST", {}), value)).status, 400);
  }
  assert.equal(calls.length, 0);
});
test("Pages runtime environment validation uses the supplied bindings", () => {
  assert.equal(configured({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test" }), true);
  assert.equal(configured({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }), false);
  assert.equal(configured({}), false);
});

test("Public project connection is restricted to the existing production hostname", () => {
  assert.deepEqual(resolvePublicConfig({}, "money-ab4.pages.dev"), MONEY_PUBLIC_CONFIG);
  assert.equal(configured(resolvePublicConfig({}, "money-ab4.pages.dev")), true);
  for (const host of ["localhost", "preview.money-ab4.pages.dev", "money-ab4.pages.dev.other.example", "other.example"]) {
    assert.deepEqual(resolvePublicConfig({}, host), {});
    assert.equal(configured(resolvePublicConfig({}, host)), false);
  }
});

test("Public project defaults preserve explicit configuration and never mix projects", () => {
  const other = { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" };
  assert.deepEqual(resolvePublicConfig(other, "money-ab4.pages.dev"), other);
  assert.equal(configured(resolvePublicConfig(other, "money-ab4.pages.dev")), false);
  const invalid = resolvePublicConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }, "money-ab4.pages.dev");
  assert.equal(configured(invalid), false);
  const explicit = { ...MONEY_PUBLIC_CONFIG, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_rotated" };
  assert.deepEqual(resolvePublicConfig(explicit, "money-ab4.pages.dev"), explicit);
});
