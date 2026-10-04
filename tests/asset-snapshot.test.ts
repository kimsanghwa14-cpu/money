import test from "node:test";
import assert from "node:assert/strict";
import { parseAssetSnapshot } from "../src/lib/asset-snapshot.ts";
import { GET } from "../src/lib/api/assets.ts";
import type { ServerRuntime } from "../src/lib/server.ts";
const source = {
  version: 1, source_label: "가상 검증 자료", received_date: "2026-01-02", source_basis_date: null,
  pending_assets: [{ id: "11111111-1111-4111-8111-111111111111", name: "미확인 예금", balance: 25, reason: "귀속 확인" }],
  forecast: { month: "2031-12",
    loans: [{ name: "가상 대출", starting_balance: 1000, change: 300, projected_balance: 700, note: "" }],
    savings: [{ name: "가상 적금", starting_balance: 100, change: 200, projected_balance: 300, note: "" }] }
};
test("Plans retain missing dates and pending ownership without mutating the source", () => {
  const original = structuredClone(source), parsed = parseAssetSnapshot(source);
  assert.equal(parsed.source_basis_date, null); assert.equal(parsed.forecast.loans[0].projected_balance, 700);
  assert.equal(parsed.pending_assets[0].balance, 25); assert.deepEqual(source, original);
});
test("Invalid arithmetic, amounts, dates, duplicate pending IDs and formats are rejected", () => {
  let bad = structuredClone(source); bad.forecast.loans[0].projected_balance = 699; assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.forecast.savings[0].projected_balance = 301; assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.pending_assets[0].balance = -1; assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.pending_assets.push({ ...bad.pending_assets[0] }); assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.received_date = "2026-02-30"; assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.forecast.month = "2031-13"; assert.throws(() => parseAssetSnapshot(bad));
  bad = structuredClone(source); bad.version = 2; assert.throws(() => parseAssetSnapshot(bad));
  assert.throws(() => parseAssetSnapshot(null));
  assert.throws(() => parseAssetSnapshot({ ...source, pending_assets: Array(101).fill(source.pending_assets[0]) }));
});
function mock(snapshot: unknown = source, authenticated = true, importError = false) {
  const filters: [string, string, unknown][] = [], selections: [string, string][] = [], reads: string[] = [];
  const db = {
    auth: { async getUser() { return { data: { user: authenticated ? { id: "trusted-user" } : null }, error: null }; } },
    from(table: string) {
      reads.push(table);
      const q = {
        select(columns: string) { selections.push([table, columns]); return q; },
        eq(key: string, value: unknown) { filters.push([table, key, value]); return q; },
        is() { return q; }, order() { return q; }, limit() { return q; },
        async maybeSingle() {
          return table === "family_members" ? { data: { family_id: "trusted-family", user_id: "trusted-user" }, error: null }
            : { data: snapshot === null ? null : { snapshot }, error: importError ? { message: "offline" } : null };
        },
        then(resolve: (v: unknown) => unknown) { return Promise.resolve({ data: [], count: 0, error: null }).then(resolve); }
      };
      return q;
    }
  };
  return { runtime: { configured: true, client: async () => db } as unknown as ServerRuntime, filters, selections, reads };
}
const req = (suffix = "?include_snapshot=1&family_id=attacker") => new Request(`https://example.com/api/assets${suffix}`);
test("Snapshot API uses the authenticated family, committed snapshots and minimal fields", async () => {
  const m = mock(), response = await GET(req(), m.runtime);
  assert.equal(response.status, 200); assert.match(response.headers.get("Cache-Control") ?? "", /no-store/);
  assert.deepEqual(await response.json(), { assets: [], asset_snapshot: source });
  assert.ok(m.filters.some(([table, key, value]) => table === "import_batches" && key === "family_id" && value === "trusted-family"));
  assert.ok(m.filters.some(([table, key, value]) => table === "import_batches" && key === "status" && value === "committed"));
  assert.ok(m.filters.some(([table, key, value]) => table === "import_batches" && key === "source" && value === "chatgpt:asset_snapshot"));
  assert.ok(m.selections.some(([table, fields]) => table === "import_batches" && fields === "snapshot:payload->asset_snapshot"));
});
test("Standard asset reads are unchanged and absent snapshots are explicit", async () => {
  const standard = mock(); assert.deepEqual(await (await GET(req(""), standard.runtime)).json(), { assets: [] });
  assert.equal(standard.reads.includes("import_batches"), false);
  assert.deepEqual(await (await GET(req(), mock(null).runtime)).json(), { assets: [], asset_snapshot: null });
});
test("Unauthenticated and invalid snapshot responses fail without false empty totals", async () => {
  const noAuth = mock(source, false); assert.equal((await GET(req(), noAuth.runtime)).status, 401); assert.equal(noAuth.reads.length, 0);
  assert.equal((await GET(req(), mock({ version: 2 }).runtime)).status, 503);
  assert.equal((await GET(req(), mock(source, true, true).runtime)).status, 503);
});
