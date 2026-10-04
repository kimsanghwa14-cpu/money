import test from "node:test";
import assert from "node:assert/strict";
import { modificationDateAccess, redactModificationDates } from "../src/lib/permissions.ts";
import { GET as ledgerGET } from "../src/lib/api/ledger.ts";
import { GET as assetsGET } from "../src/lib/api/assets.ts";
import type { ServerRuntime } from "../src/lib/server.ts";
test("Modification dates require the explicit database permission and administrator role", () => {
  assert.equal(modificationDateAccess({ role: "owner", can_view_modification_dates: true }), true);
  for (const member of [{role:"owner"},{role:"editor",can_view_modification_dates:true},{role:"owner",can_view_modification_dates:false},{}]) assert.equal(modificationDateAccess(member), false);
});
test("Redaction removes dates from nested, annual and comparison records without mutation", () => {
  const payload={transactions:[{id:"1",updated_at:"secret",version:3}],annual_transactions:[{updated_at:"secret"}],budgets:[{updated_at:"secret",amount:100}],nested:{updated_at:"secret"}};
  assert.deepEqual(redactModificationDates(payload,false),{transactions:[{id:"1",version:3}],annual_transactions:[{}],budgets:[{amount:100}],nested:{}});
  assert.equal(payload.transactions[0].updated_at,"secret");
  assert.equal(redactModificationDates(payload,true),payload);
});
function runtime(allowed:boolean):ServerRuntime {
  const records=[{id:"11111111-1111-4111-8111-111111111111",updated_at:"2026-10-04T02:00:00Z",version:2}];
  const query={select(){return query;},eq(){return query;},is(){return query;},in(){return query;},order(){return query;},async maybeSingle(){return {data:{family_id:"family",user_id:"user",role:"owner",can_view_modification_dates:allowed},error:null};},async limit(){return {data:records,count:records.length,error:null};}};
  return {configured:true,client:async()=>({auth:{getUser:async()=>({data:{user:{id:"user"}},error:null})},from:()=>query,rpc:async()=>({data:{transactions:records,annual_transactions:records,member:{role:"owner"},permissions:{view_modification_dates:true}},error:null})}) as any};
}
for(const allowed of [false,true]) test(`API dates follow verified membership, including annual and comparison requests: ${allowed}`,async()=>{
  const requests=[
    await ledgerGET(new Request("https://money.test/api/ledger?month=2026-10&annual=1"),runtime(allowed)),
    await ledgerGET(new Request("https://money.test/api/ledger?month=2026-10&ids=11111111-1111-4111-8111-111111111111"),runtime(allowed)),
    await assetsGET(new Request("https://money.test/api/assets"),runtime(allowed))
  ];
  for(const response of requests){assert.equal(response.status,200);const body=await response.json();assert.equal(JSON.stringify(body).includes("updated_at"),allowed);if(body.permissions)assert.equal(body.permissions.view_modification_dates,allowed);}
});
