import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { resolvePeriod, selectionFromParams, periodContains } from "../../src/lib/periods";
import type { Transaction } from "../../src/lib/domain";
const origin="https://money-ab4.pages.dev";
const cat="00000000-0000-4000-8000-000000000001", incomeCat="00000000-0000-4000-8000-000000000002";
function record(index:number,date:string,description:string,amount:number,kind:Transaction["kind"]="expense"):Transaction {
  return {id:`11111111-1111-4111-8111-${String(index).padStart(12,"0")}`,date,description,amount,kind,owner:"상화",category_id:kind==="income"?incomeCat:cat,
    status:"confirmed",version:1,memo:"브라우저 테스트 전용 가상 자료",payment_method_id:null,account_id:null,target_account_id:null,planned_amount:null,original_transaction_id:null,source_id:null,source_namespace:null};
}
async function mockApp(page:Page,request:APIRequestContext,large=false,admin=false) {
  await page.clock.install({time:new Date("2026-10-04T03:00:00Z")});
  const store={rows:[record(1,"2026-10-20","경계 이전",10),record(2,"2026-10-21","가상 급여",500,"income"),record(3,"2026-11-05","다음 달 소비",100),record(4,"2026-11-20","종료일 소비",50),record(5,"2026-11-21","다음 주기",40),record(6,"2027-01-20","연말 주기",20)],requests:[] as string[]};
  if(large)store.rows=Array.from({length:405},(_,i)=>record(i+1,"2026-10-22",`가상 거래 ${i+1}`,i+1));
  await page.route("**/*.supabase.co/**",route=>route.abort());
  // Every request under this host is intercepted; production accounts are not used.
  await page.route(`${origin}/**`,async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/session")return route.fulfill({json:{configured:true}});
    if(url.pathname==="/api/assets")return route.fulfill({json:{assets:[],asset_snapshot:null}});
    if(url.pathname==="/api/dashboard") return route.fulfill({json:{family:{id:"test-family",name:"검증용 가계부"},record_count:store.rows.length,transactions:store.rows,categories:[{id:cat,family_id:"test-family",kind:"expense",major:"생활",minor:"기타지출"},{id:incomeCat,family_id:"test-family",kind:"income",major:"수입",minor:"급여"}]}});
    if(url.pathname==="/api/ledger") {
      store.requests.push(url.search);
      if(url.searchParams.has("ids"))return route.fulfill({json:{transactions:store.rows.filter(row=>(url.searchParams.get("ids")??"").split(",").includes(row.id))}});
      const period=resolvePeriod(selectionFromParams(url.searchParams),url.searchParams.get("annual")==="1");
      const transactions=store.rows.filter(row=>periodContains(period,row.date));
      const body={family:{id:"test-family",name:"검증용 가계부"},member:{user_id:"test-user",display_name:"sangfire",role:"owner"},permissions:{view_modification_dates:admin},members:[],transactions,record_count:transactions.length,period,
        categories:[{id:cat,family_id:"test-family",kind:"expense",major:"생활",minor:"기타지출"},{id:incomeCat,family_id:"test-family",kind:"income",major:"수입",minor:"급여"}],accounts:[{id:"22222222-2222-4222-8222-222222222222",name:"검증 계좌",kind:"bank"}],methods:[{id:"33333333-3333-4333-8333-333333333333",name:"검증 결제"}],budgets:[],rules:[],...(period.annual?{annual_transactions:transactions,annual_budgets:[]}: {})};
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
  await expect(page.getByRole("textbox",{name:"2행 날짜",exact:true})).toHaveValue("2026-10-21");
  await expect(page.getByRole("textbox",{name:"4행 날짜",exact:true})).toHaveValue("2026-11-20");
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(3);
  await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(6);
  await page.getByRole("button",{name:"기간 직접 선택",exact:true}).click();
  await page.getByLabel("조회 시작일").fill("2026-11-01");await page.getByLabel("조회 종료일").fill("2026-11-20");await page.getByRole("button",{name:"기간 적용",exact:true}).click();
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(2);
  await expect(page.getByRole("textbox",{name:"2행 날짜",exact:true})).toHaveValue("2026-11-05");
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"기간 전체 CSV",exact:true}).click();
  expect((await download).suggestedFilename()).toContain("2026-11-01_2026-11-20");
  expect(store.rows.map(row=>row.date)).toEqual(["2026-10-20","2026-10-21","2026-11-05","2026-11-20","2026-11-21","2027-01-20"]);
  await page.screenshot({path:testInfo.outputPath("custom-range.png"),fullPage:true});
  expect(errors).toEqual([]);
});
test("unsaved edits survive a dismissed period change and cross-month saves remain single records",async({page,request})=>{
  const store=await mockApp(page,request), salaryId=store.rows[1].id;
  await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
  await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
  const salaryDate=page.locator(`input[data-id="${salaryId}"][data-col="0"]`);
  await salaryDate.fill("2026-11-21");
  page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("button",{name:"전체 내역",exact:true}).click();
  await expect(page.getByRole("button",{name:"급여주기",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(salaryDate).toHaveValue("2026-11-21");
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
  await expect(page.getByTestId("ledger-live-total")).toHaveText("82,215원");
  await page.getByRole("button",{name:"다음 거래 페이지"}).click();
  await expect(page.getByRole("textbox",{name:"202행 날짜",exact:true})).toBeVisible();
  await expect(page.getByTestId("ledger-live-total")).toHaveText("82,215원");
  await page.getByLabel("내용 검색").fill("가상 거래 405");
  await expect(page.locator('.ledger-table input[data-col="0"]')).toHaveCount(1);
  await expect(page.getByRole("textbox",{name:"2행 내용",exact:true})).toHaveValue("가상 거래 405");
  await expect(page.getByTestId("ledger-live-total")).toHaveText("405원");
});

for (const admin of [false,true]) test(`personal columns, authorized audit and fixed rows remain at each month end: admin=${admin}`,async({page,request},testInfo)=>{
 const store=await mockApp(page,request,false,admin);
 const fixed=store.rows[2];
 Object.assign(fixed,{recurrence_rule_id:"existing-fixed-rule",planned_amount:4500,payment_method_id:"33333333-3333-4333-8333-333333333333",account_id:"22222222-2222-4222-8222-222222222222",updated_at:"2026-10-01T03:00:00Z"});
 store.rows.push({...record(7,"2026-11-01","직접 지정 고정비",70),cost_type:"fixed"});
 await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
 await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
 const heading=(name:string)=>page.getByRole("columnheader",{name,exact:true});
 for(const name of ["결제수단","계좌·카드","지출 구분","예정금액"])await expect(heading(name)).toHaveCount(0);
 await expect(heading("거래ID·수정 이력")).toHaveCount(admin?1:0);
 await expect(heading("수정일 (한국시간)")).toHaveCount(admin?1:0);
 const dates=()=>page.locator('.ledger-table input[data-col="0"]').evaluateAll(inputs=>inputs.map(input=>(input as HTMLInputElement).value));
 expect(await dates()).toEqual(["2026-10-21","2026-11-20","2026-11-01","2026-11-05"]);
 await page.getByLabel("정렬",{exact:true}).selectOption("date-desc");
 expect(await dates()).toEqual(["2026-11-20","2026-10-21","2026-11-05","2026-11-01"]);
 await page.getByLabel("정렬",{exact:true}).selectOption("date-asc");
 await page.getByLabel("보조 열",{exact:true}).check();
 for(const name of ["결제수단","계좌·카드"])await expect(heading(name)).toHaveCount(1);
 for(const name of ["지출 구분","예정금액"])await expect(heading(name)).toHaveCount(0);
 await expect(heading("거래ID·수정 이력")).toHaveCount(admin?1:0);
 await page.getByRole("textbox",{name:"5행 내용",exact:true}).fill("고정비 내용 수정 검증");
 await page.getByRole("button",{name:"변경사항 저장",exact:true}).click();
 await expect(page.getByRole("button",{name:"변경사항 저장",exact:true})).toBeDisabled();
 const saved=store.rows.find(row=>row.id===fixed.id)!;
 expect(saved.planned_amount).toBe(4500);expect(saved.recurrence_rule_id).toBe("existing-fixed-rule");
 expect(saved.payment_method_id).toBe("33333333-3333-4333-8333-333333333333");expect(saved.account_id).toBe("22222222-2222-4222-8222-222222222222");
 expect(saved.date).toBe("2026-11-05");expect(saved.amount).toBe(100);
 expect(store.rows.find(row=>row.description==="직접 지정 고정비")?.cost_type).toBe("fixed");
 await page.screenshot({path:testInfo.outputPath(`personal-columns-admin-${admin}.png`),fullPage:true});
 await page.getByRole("button",{name:"전체 내역",exact:true}).click();
 await expect.poll(dates).toEqual(["2026-10-20","2026-10-21","2026-11-20","2026-11-21","2026-11-01","2026-11-05","2027-01-20"]);
});

test("requested column order, pointer and keyboard resizing, persistence and new-order paste",async({page,request},testInfo)=>{
 const store=await mockApp(page,request);
 await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
 await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
 await expect(page.locator('.ledger-table th[data-column]')).toHaveText(["날짜","대분류","소분류","내용","금액","귀속","상태"]);
 await expect(page.getByRole("columnheader",{name:"거래유형",exact:true})).toHaveCount(0);
 const handle=page.getByRole("separator",{name:"날짜 열 너비 조절",exact:true});
 await handle.scrollIntoViewIfNeeded();
 const before=Number(await handle.getAttribute("aria-valuenow")), box=(await handle.boundingBox())!;
 if(testInfo.project.name==="mobile"){
   const cdp=await page.context().newCDPSession(page);
   const point={x:box.x+box.width/2,y:box.y+box.height/2};
   await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[point]});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{...point,x:point.x+80}]});
   await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
   await cdp.detach();
 }else{
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
   await page.mouse.move(box.x+box.width/2+80,box.y+box.height/2,{steps:8});await page.mouse.up();
 }
 await expect.poll(async()=>Number(await handle.getAttribute("aria-valuenow"))).toBeGreaterThan(before+50);
 const dragged=Number(await handle.getAttribute("aria-valuenow"));
 await handle.focus();await page.keyboard.press("ArrowLeft");
 await expect(handle).toHaveAttribute("aria-valuenow",String(dragged-10));
 await page.reload();await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
 await expect(page.getByRole("separator",{name:"날짜 열 너비 조절",exact:true})).toHaveAttribute("aria-valuenow",String(dragged-10));
 await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
 await page.getByRole("button",{name:"+ 행 추가",exact:true}).click();
 const input=page.locator('.new-row input[data-col="0"]');
 await input.evaluate(element=>{const clipboardData=new DataTransfer();clipboardData.setData("text/plain","2026-10-22\t수입\t급여\t새 순서 급여 입력\t1234\t상화\t확정");element.dispatchEvent(new ClipboardEvent("paste",{clipboardData,bubbles:true,cancelable:true}));});
 await page.getByRole("button",{name:"변경사항 저장",exact:true}).click();
 await expect.poll(()=>store.rows.filter(row=>row.description==="새 순서 급여 입력").length).toBe(1);
 const saved=store.rows.find(row=>row.description==="새 순서 급여 입력")!;
 expect(saved.kind).toBe("income");expect(saved.amount).toBe(1234);expect(saved.date).toBe("2026-10-22");
 expect(store.rows.find(row=>row.description==="가상 급여")?.kind).toBe("income");
 await expect(page.getByRole("button",{name:"변경사항 저장",exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("resized-ledger.png"),fullPage:true});
 await page.getByRole("button",{name:"열 너비 초기화",exact:true}).click();
 await expect(page.getByRole("separator",{name:"날짜 열 너비 조절",exact:true})).toHaveAttribute("aria-valuenow","128");
});

test("first ledger row totals update immediately for edits, blank/new rows, deletions, cancel and filters",async({page,request},testInfo)=>{
 const store=await mockApp(page,request), salary=store.rows[1];
 await page.getByLabel("조회 연월",{exact:true}).fill("2026-10");
 await page.getByRole("navigation").getByRole("button",{name:"상화 가계부"}).click();
 const total=page.getByTestId("ledger-live-total");
 await expect(page.locator('.ledger-table tbody tr').first()).toHaveAttribute("data-testid","ledger-total-row");
 await expect(page.getByTestId("ledger-total-row").locator('.row-number')).toHaveText("1");
 await expect(page.getByTestId("ledger-total-row").locator('input')).toHaveCount(0);
 await expect(total).toHaveText("650원");
 await page.locator(`input[data-id="${salary.id}"][data-col="4"]`).fill("600");
 await expect(total).toHaveText("750원");
 await page.getByRole("button",{name:"+ 행 추가",exact:true}).click();
 await expect(total).toHaveText("750원");
 const added=page.locator('.ledger-table .new-row');
 await added.locator('input[data-col="4"]').fill("12,3");
 await expect(total).toContainText("계산 불가");
 await added.locator('input[data-col="4"]').fill("25");
 await expect(total).toHaveText("775원");
 await added.locator('input[type="checkbox"]').check();
 await page.getByRole("button",{name:"선택 삭제",exact:true}).click();
 await expect(total).toHaveText("750원");
 const salaryRow=page.locator('.ledger-table tbody tr').filter({has:page.locator(`input[data-id="${salary.id}"][data-col="0"]`)});
 await salaryRow.locator('input[type="checkbox"]').check();
 await page.getByRole("button",{name:"선택 삭제",exact:true}).click();
 await expect(total).toHaveText("150원");
 expect(store.rows.find(row=>row.id===salary.id)?.amount).toBe(500);
 page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"변경 취소",exact:true}).click();
 await expect(total).toHaveText("650원");
 await page.getByLabel("내용 검색").fill("다음 달 소비");await expect(total).toHaveText("100원");
 await page.getByLabel("내용 검색").fill("없는 검색 결과");await expect(total).toHaveText("0원");
 await page.getByLabel("내용 검색").fill("");await expect(total).toHaveText("650원");
 await page.screenshot({path:testInfo.outputPath("live-ledger-total.png"),fullPage:true});
 expect(store.rows).toHaveLength(6);
});
