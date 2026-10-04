import test from "node:test";
import assert from "node:assert/strict";
import { koreaDate } from "../src/lib/domain.ts";
import { entryDate, initialPeriod, ledgerUrl, payrollMonth, periodContains, periodFileLabel, resolvePeriod, selectionFromParams, shiftMonth, type PeriodSelection } from "../src/lib/periods.ts";
import { GET } from "../src/lib/api/ledger.ts";
import type { ServerRuntime } from "../src/lib/server.ts";
const pick = (patch: Partial<PeriodSelection> = {}): PeriodSelection => ({ mode:"payroll", month:"2026-10", start:"", end:"", ...patch });
test("The current cycle changes at day 21 in Korean local time",()=>{
  assert.equal(payrollMonth("2026-10-20"),"2026-09"); assert.equal(payrollMonth("2026-10-21"),"2026-10");
  assert.equal(payrollMonth("2027-01-01"),"2026-12"); assert.equal(initialPeriod("2026-10-04").month,"2026-09");
  assert.equal(payrollMonth(koreaDate(new Date("2026-10-20T15:00:00Z"))),"2026-10");
});
test("Payroll includes both endpoints but excludes the adjacent cycle",()=>{
  const p=resolvePeriod(pick()); assert.equal(p.start,"2026-10-21"); assert.equal(p.end,"2026-11-20");
  assert.equal(periodContains(p,"2026-10-20"),false); assert.equal(periodContains(p,"2026-10-21"),true);
  assert.equal(periodContains(p,"2026-11-20"),true); assert.equal(periodContains(p,"2026-11-21"),false);
});
test("Year rollover and leap-year February never lose days",()=>{
  assert.equal(resolvePeriod(pick({month:"2026-12"})).end,"2027-01-20");
  assert.equal(resolvePeriod(pick({month:"2028-02"})).end,"2028-03-20");
  assert.equal(resolvePeriod(pick({mode:"calendar",month:"2028-02"})).end,"2028-02-29");
  assert.equal(resolvePeriod(pick({mode:"calendar",month:"2027-02"})).end,"2027-02-28");
});
test("Twelve payroll cycles partition their payroll year without overlap",()=>{
  const year=resolvePeriod(pick(),true); assert.equal(year.start,"2026-01-21"); assert.equal(year.end,"2027-01-20");
  const periods=Array.from({length:12},(_,i)=>resolvePeriod(pick({month:`2026-${String(i+1).padStart(2,"0")}`})));
  for(let day=new Date("2026-01-21T00:00:00Z");day<=new Date("2027-01-20T00:00:00Z");day.setUTCDate(day.getUTCDate()+1)) {
    const date=day.toISOString().slice(0,10); assert.equal(periods.filter(p=>periodContains(p,date)).length,1);
  }
});
test("All-history has no artificial dates and custom endpoints are inclusive",()=>{
  assert.deepEqual(resolvePeriod(pick({mode:"all"})),{mode:"all",month:"2026-10",start:null,end:null,annual:false});
  const p=resolvePeriod(pick({mode:"custom",start:"2026-11-20",end:"2026-11-20"}));
  assert.equal(periodContains(p,"2026-11-20"),true); assert.equal(periodContains(p,"2026-11-21"),false);
});
test("Invalid, reversed, out-of-range and unsupported annual requests fail",()=>{
  for(const patch of [{mode:"bad"},{month:"9999-12"},{month:"2026-13"},{mode:"custom",start:"2026-02-30",end:"2026-03-01"},{mode:"custom",start:"2026-11-02",end:"2026-11-01"}]) assert.throws(()=>resolvePeriod(pick(patch as Partial<PeriodSelection>)));
  assert.throws(()=>resolvePeriod(pick({mode:"all"}),true)); assert.throws(()=>shiftMonth("1900-01",-1));
});
test("New entry dates stay in the selected range without changing existing dates",()=>{
  const p=resolvePeriod(pick()); assert.equal(entryDate(p,"2026-11-04"),"2026-11-04");
  assert.equal(entryDate(p,"2026-10-04"),"2026-10-21");
  assert.equal(entryDate(resolvePeriod(pick({mode:"all"})),"2026-10-04"),"2026-10-04");
});
test("Queries and export names carry explicit periods; legacy URLs stay calendar based",()=>{
  assert.equal(new URL(ledgerUrl(pick()),"https://example.test").searchParams.get("mode"),"payroll");
  assert.equal(periodFileLabel(resolvePeriod(pick())),"2026-10-21_2026-11-20");
  assert.equal(selectionFromParams(new URLSearchParams("month=2026-10")).mode,"calendar");
});
function runtime(options: { missingUser?: boolean; partial?: boolean; wrongPeriod?: boolean }={}) {
  const calls:{name:string;args:Record<string,unknown>}[]=[], filters:unknown[][]=[];
  const query={select(){return query;},eq(key:string,value:unknown){filters.push([key,value]);return query;},is(){return query;},in(){return query;},order(){return query;},async limit(){return {data:[],count:0,error:null};},async maybeSingle(){return {data:{family_id:"trusted-family",user_id:"trusted-user",active:true},error:null};}};
  const db={auth:{async getUser(){return {data:{user:options.missingUser?null:{id:"trusted-user"}},error:null};}},from(){return query;},async rpc(name:string,args:Record<string,unknown>){
    calls.push({name,args});
    if(name==="load_ledger")return {data:{transactions:[]},error:null};
    const period=resolvePeriod({mode:args.p_mode as PeriodSelection["mode"],month:args.p_month as string,start:(args.p_start as string)??"",end:(args.p_end as string)??""},args.p_annual as boolean);
    return {data:{transactions:[],record_count:options.partial?1:0,period:options.wrongPeriod?{...period,end:"2026-10-31"}:period},error:null};
  }};
  return {value:{configured:true,siteUrl:"https://example.test",client:async()=>db} as unknown as ServerRuntime,calls,filters};
}
const request=(query:string)=>new Request(`https://example.test/api/ledger?${query}`);
test("API uses the session family for payroll and does not trust a query family",async()=>{
  const r=runtime(),response=await GET(request("mode=payroll&month=2026-10&family_id=other"),r.value);
  assert.equal(response.status,200); assert.equal(r.calls[0].name,"load_ledger_range"); assert.equal(r.calls[0].args.p_family,"trusted-family");
  assert.equal((await response.json()).period.end,"2026-11-20"); assert.equal(response.headers.get("cache-control"),"private, no-store");
});
test("API passes exact custom dates and keeps legacy integrations unchanged",async()=>{
  const r=runtime(); assert.equal((await GET(request("mode=custom&month=2026-10&start=2026-10-21&end=2026-11-20"),r.value)).status,200);
  assert.equal(r.calls[0].args.p_start,"2026-10-21"); assert.equal(r.calls[0].args.p_end,"2026-11-20");
  await GET(request("month=2026-10"),r.value); assert.equal(r.calls[1].name,"load_ledger");
});
test("API refuses truncated or wrong-period data instead of displaying a partial total",async()=>{
  for(const options of [{partial:true},{wrongPeriod:true}]) assert.equal((await GET(request("mode=payroll&month=2026-10"),runtime(options).value)).status,503);
});
test("Invalid ranges are rejected before any range RPC",async()=>{
  const r=runtime(); for(const query of ["mode=unknown&month=2026-10","mode=custom&month=2026-10&start=2026-11-01&end=2026-10-01","mode=all&month=2026-10&annual=1"])
    assert.equal((await GET(request(query),r.value)).status,400);
  assert.equal(r.calls.length,0);
});
test("ID comparison is family scoped and works independently of the period",async()=>{
  const r=runtime(); assert.equal((await GET(request("month=2026-10&ids=00000000-0000-4000-8000-000000000001"),r.value)).status,200);
  assert.ok(r.filters.some(([key,value])=>key==="family_id"&&value==="trusted-family"));
  assert.equal((await GET(request("month=2026-10&ids=not-an-id"),r.value)).status,400);
});
test("Unauthenticated users cannot read any period",async()=>{
  const r=runtime({missingUser:true}); assert.equal((await GET(request("mode=all&month=2026-10"),r.value)).status,401); assert.equal(r.calls.length,0);
});
