import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { resolvePeriod, selectionFromParams, periodContains } from "../../src/lib/periods";
import type { Transaction } from "../../src/lib/domain";
const origin="https://money-ab4.pages.dev";
const cat="00000000-0000-4000-8000-000000000001", incomeCat="00000000-0000-4000-8000-000000000002";
function record(index:number,date:string,description:string,amount:number,kind:Transaction["kind"]="expense"):Transaction {
  return {id:`11111111-1111-4111-8111-${String(index).padStart(12,"0")}`,date,description,amount,kind,owner:"상화",category_id:kind==="income"?incomeCat:cat,
    status:"confirmed",version:1,memo:"브라우저 테스트 전용 가상 자료",payment_method_id:null,account_id:null,target_account_id:null,planned_amount:null,original_transaction_id:null,source_id:null,source_namespace:null};
}
async function mockApp(page:Page,request:APIRequestContext,large=false) {
  await page.clock.install({time:new Date("2026-10-04T03:00:00Z")});
  const store={rows:[record(1,"2026-10-20","경계 이전",10),record(2,"2026-10-21","가상 급여",500,"income"),record(3,"2026-11-05","다음 달 소비",100),record(4,"2026-11-20","종료일 소비",50),record(5,"2026-11-21","다음 주기",40),record(6,"2027-01-20","연말 주기",20)],requests:[] as string[]};
  if(large)store.rows=Array.from({length:405},(_,i)=>record(i+1,"2026-10-22",`가상 거래 ${i+1}`,i+1));
  await page.route("**/*.supabase.co/**",route=>route.abort());
  // Every request under this host is intercepted; no production API or personal account is used.
  await page.route(`${origin}/**`,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/session")return route.fulfill({json:{configured:true}});
    if(url.pathname==="/api/assets")return route.fulfill({json:{assets:[],asset_snapshot:null}});
    if(url.pathname==="/api/ledger") {
      store.requests.push(url.search);
      if(url.searchParams.has("ids"))return route.fulfill({json:{transactions:store.rows.filter(row=>(url.searchParams.get("ids")??"").split(",").includes(row.id))}});
      const period=resolvePeriod(selectionFromParams(url.searchParams),url.searchParams.get("annual")==="1");
      const transactions=store.rows.filter(row=>periodContains(period,row.date));
      const body={family:{id:"test-family",name:"검증용 가계부"},member:{user_id:"test-user",display_name:"테스트",role:"owner"},members:[],transactions,record_count:transactions.length,period,
        categories:[{id:cat,family_id:"test-family",kind:"expense",major:"생활",minor:"기타지출"},{id:incomeCat,family_id:"test-family",kind:"income",major:"수입",minor:"급여"}],accounts:[],methods:[],budgets:[],rules:[],...(period.annual?{annual_transactions:transactions,annual_budgets:[]}: {})};
      return route.fulfill({json:body});
    }
    if(url.pathname==="/api/transactions") {
      const payload=route.request().postDataJSON();
      for(const input of payload.upserts){const row={...input,amount:Number(String(input.amount).replaceAll(",","")),version:input.version+1};store.rows=store.rows.filter(old=>old.id!==row.id);store.rows.push(row);}
      store.rows=store.rows.filter(row=>!payload.deletes.some((item:{id:string})=>item.id===row.id));
      return route.fulfill({json:{saved:payload.upserts.length+payload.deletes.length}});
    }
    if(url.pathname.startsWith("/api/"))return route.fulfill({status:404,json:{error:"Unmocked API"}});
    const response=await request.get(`http://127.0.0.1:3000${url.pathname}${url.search}`);
    await route.fulfill({response});
  });
  await page.goto(origin);
  await expect(page.getByRole("heading",{name:"집계표",exact:true})).toBeVisible();
  await expect(page.getByText("✓ 가족 DB 연결",{exact:true})).toBeVisible();
  return store;
}
test("default payroll, cross-month grid, all-history and custom range preserve dates",async({page,request},testInfo)=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const store=await mockApp(page,request);
  await expect(page.getByTestId("period-label")).toContainText("2026-09-21 ~ 2026-10-20");
  await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
  await expect(page.getByTestId("period-label")).toContainText("2026-10-21 ~ 2026-11-20");
  await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
  await expect(page.getByRole("textbox",{name:"1행 날짜",exact:true})).toHaveValue("2026-10-21");
  await expect(page.getByRole("textbox",{name:"3행 날짜",exact:true})).toHaveValue("2026-11-20");
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(3);
  await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(6);
  await page.getByRole("button",{name:"기간 직접 선택",exact:true}).click();
  await page.getByLabel("조회 시작일").fill("2026-11-01");await page.getByLabel("조회 종료일").fill("2026-11-20");await page.getByRole("button",{name:"기간 적용",exact:true}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(2);
  await expect(page.getByRole("textbox",{name:"1행 날짜",exact:true})).toHaveValue("2026-11-05");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"기간 전체 CSV",exact:true}).click();
  expect((await download).suggestedFilename()).toContain("2026-11-01_2026-11-20");
  expect(store.rows.map(row=>row.date)).toEqual(["2026-10-20","2026-10-21","2026-11-05","2026-11-20","2026-11-21","2027-01-20"]);
  await page.screenshot({path:testInfo.outputPath("custom-range.png"),fullPage:true});
  expect(errors).toEqual([]);
});
test("unsaved edits survive a dismissed period change and cross-month saves remain single records",async({page,request})=>{
  const store=await mockApp(page,request);
  await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
  await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
  await page.getByRole("textbox",{name:"1행 날짜",exact:true}).fill("2026-11-21");
  page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await expect(page.getByRole("button",{name:"급여주기",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("textbox",{name:"1행 날짜",exact:true})).toHaveValue("2026-11-21");
  await page.getByRole("button",{name:"변경사항 저장",exact:true}).click();
  await expect(page.getByRole("button",{name:"변경사항 저장",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(6);
  expect(store.rows.filter(row=>row.description==="가상 급여")).toHaveLength(1);
  expect(store.rows.find(row=>row.description==="가상 급여")?.date).toBe("2026-11-21");
});
test("calendar fallback and payroll annual view show the correct year-end boundary",async({page,request},testInfo)=>{
  await mockApp(page,request);
  await page.getByRole("button",{name:"달력월",exact:true}).click();
  await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
  await expect(page.getByTestId("period-label")).toContainText("2026-10-01 ~ 2026-10-31");
  await page.getByRole("button",{name:"급여주기",exact:true}).click();
  await page.getByLabel("조회 연월",{exact:true}).fill("2026-12");
  await expect(page.getByTestId("period-label")).toContainText("2026-12-21 ~ 2027-01-20");
  await page.getByRole("button",{name:"연간",exact:true}).click();
  await expect(page.getByTestId("period-label")).toContainText("2026-01-21 ~ 2027-01-20");
  await expect(page.getByRole("heading",{name:"2026년 급여주기별 비교"})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("payroll-year.png"),fullPage:true});
});
test("search and export cover all pages, not only the rendered page",async({page,request})=>{
  await mockApp(page,request,true);
  await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(200);
  await page.getByRole("button",{name:"다음 거래 페이지"}).click();
  await expect(page.getByRole("textbox",{name:"201행 날짜",exact:true})).toBeVisible();
  await page.getByLabel("내용 검색").fill("가상 거래 405");
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(1);
  await expect(page.getByRole("textbox",{name:"1행 내용",exact:true})).toHaveValue("가상 거래 405");
});
