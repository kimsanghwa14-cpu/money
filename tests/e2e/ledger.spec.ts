import {test,expect,type Page} from "@playwright/test";
import {koreaDate,blankRow,toDraft,type Transaction} from "../../src/lib/domain";
const canWrite=process.env.E2E_ALLOW_WRITES==="true"&&!!process.env.E2E_USERNAME&&!!process.env.E2E_PASSWORD;
async function login(page:Page,email:string,password:string){
 await page.goto("/login");await page.getByLabel("아이디",{exact:true}).fill(email);await page.getByLabel("비밀번호",{exact:true}).fill(password);await page.getByRole("button",{name:"로그인",exact:true}).click();await expect(page.getByRole("heading",{name:"집계표",exact:true})).toBeVisible();
}
test("미로그인 사용자의 화면·API 접근을 차단한다",async({page})=>{
 test.skip(!process.env.NEXT_PUBLIC_SUPABASE_URL,"Supabase 설정이 필요합니다.");
 const result=await page.request.get(`/api/ledger?month=${koreaDate().slice(0,7)}`);expect(result.status()).toBe(401);
 await page.goto("/");await expect(page.getByRole("heading",{name:"가족 계정으로 로그인"})).toBeVisible();
});
test("DB 미연결 상태를 명확히 표시한다",async({page})=>{
 test.skip(!!process.env.NEXT_PUBLIC_SUPABASE_URL,"DB connected: run authenticated suite instead");
 await page.goto("/");await expect(page.getByText("! DB 미연결")).toBeVisible();await expect(page.getByRole("button",{name:"변경사항 저장"})).toHaveCount(0);
});
test("두 가족 사용자가 동시에 수정하면 한 요청만 저장되고 다른 요청은 충돌한다",async({page,browser})=>{
 test.skip(!canWrite||!process.env.E2E_SECOND_USERNAME||!process.env.E2E_SECOND_PASSWORD,"같은 테스트 가족의 서로 다른 계정 두 개가 필요합니다.");
 const second=await browser.newContext(),other=await second.newPage(),month=koreaDate().slice(0,7),run=`동시수정가상-${crypto.randomUUID()}`;
 let id="";
 try{
   await login(page,process.env.E2E_USERNAME!,process.env.E2E_PASSWORD!);await login(other,process.env.E2E_SECOND_USERNAME!,process.env.E2E_SECOND_PASSWORD!);
   const initial=await(await page.request.get(`/api/ledger?month=${month}`)).json(),secondInitial=await(await other.request.get(`/api/ledger?month=${month}`)).json();
   expect(initial.family.id).toBe(secondInitial.family.id);expect(initial.member.user_id).not.toBe(secondInitial.member.user_id);
   const row={...blankRow("상화",month,initial.categories),description:run,amount:"1,000"};id=row.id;
   const headers={origin:"http://localhost:3000"};
   const seed=await page.request.post("/api/transactions",{headers,data:{request_id:crypto.randomUUID(),upserts:[row],deletes:[]}});expect(seed.ok()).toBeTruthy();
   const loaded=await(await page.request.get(`/api/ledger?month=${month}`)).json();const tx=loaded.transactions.find((t:Transaction)=>t.id===id) as Transaction;
   const draft=toDraft(tx);
   const [a,b]=await Promise.all([
     page.request.post("/api/transactions",{headers,data:{request_id:crypto.randomUUID(),upserts:[{...draft,amount:"1,100"}],deletes:[]}}),
     other.request.post("/api/transactions",{headers,data:{request_id:crypto.randomUUID(),upserts:[{...draft,amount:"1,200"}],deletes:[]}}),
   ]);
   expect([a.status(),b.status()].sort()).toEqual([200,409]);
   const final=await(await page.request.get(`/api/ledger?month=${month}`)).json();const saved=final.transactions.find((t:Transaction)=>t.id===id) as Transaction;
   expect(saved.version).toBe(2);expect(saved.amount).toBe(a.ok()?1100:1200);expect(saved.updated_by).toBe(a.ok()?initial.member.user_id:secondInitial.member.user_id);
 }finally{
   if(id){const final=await(await page.request.get(`/api/ledger?month=${month}`)).json();const row=final.transactions?.find((t:Transaction)=>t.id===id);if(row){const cleaned=await page.request.post("/api/transactions",{headers:{origin:"http://localhost:3000"},data:{request_id:crypto.randomUUID(),upserts:[],deletes:[{id,version:row.version}]}});expect(cleaned.ok()).toBeTruthy();}}
   await second.close();
 }
});
test("20행 일괄 저장·실패 입력 보존·재로그인 영속성·귀속 집계",async({page})=>{
 test.skip(!canWrite,"승인된 전용 테스트 가족 계정과 E2E_ALLOW_WRITES=true가 필요합니다.");
 const run=`자동화가상-${crypto.randomUUID()}`,month=koreaDate().slice(0,7);
 await page.goto("/login");await page.getByLabel("아이디",{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel("비밀번호",{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole("button",{name:"로그인",exact:true}).click();await expect(page.getByRole("heading",{name:"집계표",exact:true})).toBeVisible();
 const initial=await(await page.request.get(`/api/ledger?month=${month}`)).json();expect(initial.transactions).toHaveLength(0);
 await page.getByRole("button",{name:"기타 · 전체 내역",exact:true}).click();await page.getByRole("button",{name:"+ 행 추가",exact:true}).click();
 const cell=page.locator('.ledger-table [data-row="0"][data-col="0"]');
 const tsv=Array.from({length:20},(_,i)=>`${month}-${String(i+1).padStart(2,"0")}\t${["상화","하율","기타"][i%3]}\t소비지출\t생활\t식비\t${run}-${i}\t1,000\t\t\t확정`).join("\n");
 await cell.evaluate((element,text)=>{const clipboard=new DataTransfer();clipboard.setData("text/plain",text);element.dispatchEvent(new ClipboardEvent("paste",{clipboardData:clipboard,bubbles:true,cancelable:true}));},tsv);
 const description=page.getByLabel("1행 내용",{exact:true});await description.focus();await description.evaluate(el=>el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true,cancelable:true})));await expect(description).toBeFocused();
 await page.route("**/api/transactions",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"가상 테스트 저장 실패"})}));
 await page.getByRole("button",{name:"변경사항 저장",exact:true}).click();await expect(page.getByText("가상 테스트 저장 실패",{exact:false})).toBeVisible();await expect(page.getByLabel("1행 내용",{exact:true})).toHaveValue(`${run}-0`);
 await page.unroute("**/api/transactions");await page.getByRole("button",{name:"변경사항 저장",exact:true}).click();await expect(page.getByText("20건의 변경사항을 DB에 저장했습니다.",{exact:false})).toBeVisible();
 try{
   await page.reload();const response=await page.request.get(`/api/ledger?month=${month}`);expect(response.ok()).toBeTruthy();const data=await response.json();const rows=(data.transactions as Transaction[]).filter(t=>t.description.startsWith(run));expect(rows).toHaveLength(20);expect(rows.reduce((n,t)=>n+t.amount,0)).toBe(20000);
   for(const owner of ["상화","하율","기타"]){expect(rows.some(t=>t.owner===owner)).toBeTruthy();}
   await page.getByRole("button",{name:"로그아웃",exact:true}).click();await page.getByLabel("아이디",{exact:true}).fill(process.env.E2E_USERNAME!);await page.getByLabel("비밀번호",{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole("button",{name:"로그인",exact:true}).click();await expect(page.getByRole("heading",{name:"집계표",exact:true})).toBeVisible();
   const persisted=await (await page.request.get(`/api/ledger?month=${month}`)).json();expect(persisted.transactions.filter((t:Transaction)=>t.description.startsWith(run))).toHaveLength(20);
 }finally{
   const data=await(await page.request.get(`/api/ledger?month=${month}`)).json();const rows=(data.transactions as Transaction[]).filter(t=>t.description.startsWith(run));
   if(rows.length){const cleanup=await page.request.post("/api/transactions",{headers:{origin:process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000"},data:{request_id:crypto.randomUUID(),upserts:[],deletes:rows.map(t=>({id:t.id,version:t.version}))}});expect(cleanup.ok()).toBeTruthy();}
 }
});
