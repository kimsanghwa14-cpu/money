import test from "node:test";
import assert from "node:assert/strict";
import { koreaDate,validDate,monthRange,recurringDate,parseAmount,summarize,budgetSummary,blankRow,validateDraft,parseDelimited,exportCsv,duplicateKey,sumSafe,type Category,type Transaction,type Budget } from "../src/lib/domain.ts";
import { COLUMNS,pasteRows } from "../src/lib/grid.ts";
import { validPublicKey } from "../src/lib/supabase/config.ts";
const family="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const categoryIds={expense:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",income:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",saving:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",loan_principal:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",transfer:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",settlement:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",loan_received:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7"};
const categories:Category[]=Object.entries(categoryIds).map(([kind,id])=>({id,family_id:family,kind:kind as Category["kind"],major:kind==="expense"?"생활":kind,minor:kind==="expense"?"식비":kind}));
function transaction(patch:Partial<Transaction>={}):Transaction{
 return {id:crypto.randomUUID(),date:"2026-10-03",owner:"상화",kind:"expense",category_id:categoryIds.expense,description:"가상 테스트 거래",amount:1000,payment_method_id:null,account_id:null,target_account_id:null,status:"confirmed",memo:"",version:1,planned_amount:null,original_transaction_id:null,source_id:null,source_namespace:null,...patch};
}
test("20행 TSV를 한 번에 붙여넣고 각 행을 유효한 거래로 검증한다",()=>{
 const tsv=Array.from({length:20},(_,i)=>`2026-10-${String(i+1).padStart(2,"0")}\t${["상화","하율","기타"][i%3]}\t소비지출\t생활\t식비\t가상 테스트 ${i+1}\t12,300\t\t\t확정`).join("\n");
 const rows=pasteRows([],tsv,0,0,COLUMNS.slice(0,10).map(c=>c.key),"상화","2026-10",categories,[],[]);
 assert.equal(rows.length,20);assert.equal(new Set(rows.map(r=>r.id)).size,20);
 rows.forEach(r=>{assert.deepEqual(validateDraft(r,categories,[],[]),{});assert.equal(parseAmount(r.amount),12300);});
});
test("상화·하율·기타 합계와 전체 집계가 일치한다",()=>{
 const rows=[transaction({owner:"상화",kind:"income",amount:3000}),transaction({owner:"하율",kind:"income",amount:5000}),transaction({owner:"기타",amount:400}),transaction({owner:"상화",kind:"saving",amount:600}),transaction({owner:"하율",kind:"loan_principal",amount:900})];
 const parts=["상화","하율","기타"].map(o=>summarize(rows,o as Transaction["owner"])),total=summarize(rows);
 for(const key of ["income","expense","allocation","remaining"] as const)assert.equal(parts.reduce((n,s)=>n+s[key],0),total[key]);
});
test("예정·취소 거래는 실제 실적에서 제외되고 예정금액은 별도 표시된다",()=>{
 const s=summarize([transaction({amount:100,status:"confirmed"}),transaction({amount:200,status:"planned"}),transaction({amount:300,status:"cancelled"}),transaction({amount:500,kind:"income",status:"planned"})]);
 assert.equal(s.expense,100);assert.equal(s.plannedOut,200);assert.equal(s.plannedIncome,500);assert.equal(s.income,0);
});
test("내부이체·카드정산·대출금 수령은 수입·소비·배분에 중복 반영되지 않는다",()=>{
 const s=summarize([transaction({amount:10000,kind:"income"}),transaction({amount:1000}),transaction({amount:1000,kind:"settlement"}),transaction({amount:9000,kind:"transfer"}),transaction({amount:50000,kind:"loan_received"})]);
 assert.deepEqual([s.income,s.expense,s.allocation,s.remaining],[10000,1000,0,9000]);
});
test("저축·투자·원금은 소비와 분리하고 환불은 관련 지출에서 차감한다",()=>{
 const s=summarize([transaction({amount:10000,kind:"income"}),transaction({amount:3000}),transaction({amount:1000,kind:"refund"}),transaction({amount:2000,kind:"saving"}),transaction({amount:500,kind:"loan_principal"})]);
 assert.equal(s.expense,2000);assert.equal(s.allocation,2500);assert.equal(s.consumptionRemaining,8000);assert.equal(s.remaining,5500);
});
test("원화 정수·쉼표 검사: 소수·음수·비정상 묶음·오버플로를 거부한다",()=>{
 assert.equal(parseAmount("12,300"),12300);assert.equal(parseAmount("0",true),0);
 for(const value of ["1,23","1.5","-1","","0","1e3","₩100","9007199254740992","1,000,000,000,001"])assert.throws(()=>parseAmount(value));
 assert.throws(()=>sumSafe(Number.MAX_SAFE_INTEGER,1));
});
test("한국 날짜는 UTC 15시에 다음날이 되고 연말도 정확하다",()=>{
 assert.equal(koreaDate(new Date("2026-12-31T15:00:00Z")),"2027-01-01");
 assert.equal(koreaDate(new Date("2026-10-02T14:59:59Z")),"2026-10-02");
 assert.equal(koreaDate(new Date("2026-10-02T15:00:00Z")),"2026-10-03");
});
test("월말·연말·윤년 날짜와 반복 예정일을 검증한다",()=>{
 assert.equal(recurringDate("2024-02",31),"2024-02-29");assert.equal(recurringDate("2025-02",31),"2025-02-28");assert.equal(recurringDate("2026-04",31),"2026-04-30");
 assert.deepEqual(monthRange("2026-12"),["2026-12-01","2027-01-01"]);assert.equal(validDate("2025-02-29"),false);assert.equal(validDate("2024-02-29"),true);assert.equal(validDate("2026-13-01"),false);
});
test("잘못된 붙여넣기 값은 사라지지 않고 해당 필드 오류로 남는다",()=>{
 const rows=pasteRows([],"2026-02-30\t알수없음\t소비지출\t생활\t알수없음\t내역\t12,3",0,0,COLUMNS.map(c=>c.key),"","2026-02",categories,[],[]);
 const errors=validateDraft(rows[0],categories,[],[]);assert.ok(errors.date);assert.ok(errors.owner);assert.ok(errors.category_id);assert.ok(errors.amount);assert.equal(rows[0].amount,"12,3");assert.equal(rows[0].owner,"알수없음");
});
test("미확인 귀속은 기타로 자동 확정하지 않는다",()=>{
 const row=blankRow("","2026-10",categories);assert.equal(row.owner,"");assert.ok(validateDraft(row,categories,[],[]).owner);
});
test("객체에서 상속한 이름은 거래유형·상태로 인정하지 않는다",()=>{
 const row=blankRow("상화","2026-10",categories);row.kind="toString" as Transaction["kind"];row.status="constructor" as Transaction["status"];
 const errors=validateDraft(row,categories,[],[]);assert.ok(errors.kind);assert.ok(errors.status);
});
test("계획예산은 실제 실적을 만들지 않으며 같은 집계 기준을 사용한다",()=>{
 const budgets:Budget[]=Object.entries({income:10000,expense:3000,saving:2000,loan_principal:1000}).map(([kind,amount])=>({id:crypto.randomUUID(),month:"2026-10",owner:"상화",category_id:categoryIds[kind as keyof typeof categoryIds],amount,label:"",version:1}));
 assert.deepEqual(budgetSummary(budgets,categories),{income:10000,expense:3000,allocation:3000,remaining:4000});assert.equal(summarize([]).income,0);
});
test("CSV·TSV의 인용 쉼표·줄바꿈·따옴표를 보존한다",()=>{
 assert.deepEqual(parseDelimited('내용,메모\n"카페, 간식","첫줄\n둘째줄 ""확인"""',","),[["내용","메모"],["카페, 간식",'첫줄\n둘째줄 "확인"']]);
 assert.throws(()=>parseDelimited('"닫히지 않음',","));
});
test("CSV 내보내기는 한글 BOM과 수식 실행 방지를 제공한다",()=>{
 const csv=exportCsv([transaction({description:"=HYPERLINK(가상)"})],categories,[],[]);assert.ok(csv.startsWith("\ufeff"));assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('"1000"'));
});
test("중복 후보는 계좌·내용·유형을 포함하고 날짜·금액만으로 삭제하지 않는다",()=>{
 const a=transaction(),b=transaction({description:"다른 가상 거래"});assert.notEqual(duplicateKey(a),duplicateKey(b));const same=transaction({...a,id:crypto.randomUUID()});assert.equal(duplicateKey(a),duplicateKey(same));
});
test("표 붙여넣기는 열 초과를 조용히 잘라내지 않는다",()=>{
 assert.throws(()=>pasteRows([],"1\t2\t3",0,0,["date"],"상화","2026-10",categories,[],[]));
});
test("브라우저용 설정은 secret/service-role 키를 거부한다",()=>{
 const jwt=(role:string)=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({role})).toString('base64url')}.test`;
 const token=(role:string)=>`eyJhbGciOiJIUzI1NiJ9.${jwt(role).split('.')[1]}.test`;
 assert.equal(validPublicKey("sb_secret_fake_test_placeholder"),false);assert.equal(validPublicKey(token("service_role")),false);
 assert.equal(validPublicKey(token("anon")),true);assert.equal(validPublicKey("sb_publishable_fake_test_placeholder"),true);assert.equal(validPublicKey(undefined),false);
});
