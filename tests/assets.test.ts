import test from "node:test";
import assert from "node:assert/strict";
import { assetSummary, normalizeAsset } from "../src/lib/assets.ts";
import { koreaDateTime } from "../src/lib/domain.ts";
import { dispatchApi } from "../src/lib/pages-router.ts";
import type { ServerRuntime } from "../src/lib/server.ts";
const input = { id: "88888888-8888-4888-8888-888888888888", version: 0, name: " 통장 ", owner: "상화", kind: "deposit", basis_date: "2026-10-04", balance: "1,000,000", memo: "" };
test("Asset and loan balances form net assets, including zero and negative net worth", () => {
  assert.deepEqual(assetSummary([{ kind: "deposit", balance: 1000000 }, { kind: "investment", balance: 200000 }, { kind: "loan", balance: 400000 }]), { assets: 1200000, loans: 400000, net: 800000 });
  assert.deepEqual(assetSummary([{ kind: "pension", balance: 0 }, { kind: "loan", balance: 100 }]), { assets: 0, loans: 100, net: -100 });
});
test("Asset input accepts zero, preserves names and strips client authority fields", () => {
  const value = normalizeAsset({ ...input, balance: "0", created_by: "attacker", updated_at: "fake", accounting: "ledger", family_id: "other" });
  assert.equal(value.balance, 0); assert.equal(value.name, "통장");
  assert.equal("family_id" in value, false); assert.equal("accounting" in value, false); assert.equal("updated_at" in value, false);
  assert.equal(normalizeAsset(input).balance, 1000000);
});
test("Invalid asset amount, date, ownership and inherited kind fail before save", () => {
  for (const patch of [{ balance: "-1" }, { balance: "1.5" }, { balance: "1,23" }, { balance: "1,000,000,000,001" }, { basis_date: "2026-02-30" }, { owner: "외부" }, { kind: "toString" }, { name: " " }, { version: -1 }]) assert.throws(() => normalizeAsset({ ...input, ...patch }));
});
test("Saved modification dates are displayed in Korea time across year rollover", () => {
  assert.equal(koreaDateTime("2026-12-31T15:00:01Z"), "2027-01-01 00:00:01");
  assert.equal(koreaDateTime("2026-10-04T02:00:00Z"), "2026-10-04 11:00:00");
  assert.equal(koreaDateTime(undefined), "—"); assert.equal(koreaDateTime("invalid"), "—");
});
function apiRuntime(count = 0, records: unknown[] = [], failure?: { code: string; message: string }) {
  const calls: { name: string; args: any }[] = [];
  const filters: unknown[] = [];
  const query = { select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; }, is() { return query; }, order() { return query; }, async limit() { return { data: records, count, error: null }; }, async maybeSingle() { return { data: { family_id: "trusted-family", user_id: "trusted-user" }, error: null }; } };
  const db = { auth: { async getUser() { return { data: { user: { id: "trusted-user" } }, error: null }; } }, from() { return query; }, async rpc(name: string, args: any) { calls.push({ name, args }); return { data: { saved: 1 }, error: failure ?? null }; } };
  return { value: { configured: true, siteUrl: "https://money-ab4.pages.dev", client: async () => db } as unknown as ServerRuntime, calls, filters };
}
const apiRequest = (body?: unknown) => new Request("https://money-ab4.pages.dev/api/assets", { method: body ? "POST" : "GET", headers: { Origin: "https://money-ab4.pages.dev", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
test("Asset API reads only the authenticated family and refuses incomplete totals", async () => {
  const complete = apiRuntime(); const response = await dispatchApi(apiRequest(), complete.value);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { assets: [] });
  assert.ok(complete.filters.some(([key, value]: any) => key === "family_id" && value === "trusted-family"));
  for (const count of [1, 1001]) assert.equal((await dispatchApi(apiRequest(), apiRuntime(count).value)).status, 503);
});
test("Asset API normalizes balances and never trusts client family or audit claims", async () => {
  const s = apiRuntime(); const response = await dispatchApi(apiRequest({ request_id: crypto.randomUUID(), family_id: "other-family", upserts: [{ ...input, updated_by: "other-user" }], deletes: [] }), s.value);
  assert.equal(response.status, 200); assert.equal(s.calls[0].name, "save_assets");
  assert.equal(s.calls[0].args.p_family, "trusted-family"); assert.equal(s.calls[0].args.p_payload.upserts[0].balance, 1000000);
  assert.equal("updated_by" in s.calls[0].args.p_payload.upserts[0], false);
});
test("Asset API rejects bad writes and returns a conflict without overwriting data", async () => {
  const s = apiRuntime(); assert.equal((await dispatchApi(apiRequest({ request_id: crypto.randomUUID(), upserts: [{ ...input, balance: "-1" }], deletes: [] }), s.value)).status, 400); assert.equal(s.calls.length, 0);
  const conflict = apiRuntime(0, [], { code: "40001", message: "다른 사용자가 변경한 항목입니다." });
  assert.equal((await dispatchApi(apiRequest({ request_id: crypto.randomUUID(), upserts: [input], deletes: [] }), conflict.value)).status, 409);
  const method = await dispatchApi(new Request("https://money-ab4.pages.dev/api/assets", { method: "DELETE" }), s.value); assert.equal(method.status, 405); assert.equal(method.headers.get("allow"), "GET, POST");
});
