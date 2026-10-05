import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyFlows, payrollFlows, change, previousMonth, chartSlices } from '../src/lib/dashboard.ts';
import { summarize, validateDraft, type Transaction, type Category } from '../src/lib/domain.ts';
import { GET } from '../src/lib/api/dashboard.ts';
import type { ServerRuntime } from '../src/lib/server.ts';
const cat: Category[]=[{id:'expense',family_id:'family',kind:'expense',major:'생활',minor:'식비'},{id:'income',family_id:'family',kind:'income',major:'수입',minor:'급여'}];
function row(id:string, patch:Partial<Transaction>={}):Transaction {return {id,date:'2026-01-10',owner:'상화',kind:'expense',category_id:'expense',description:'검증',amount:100,status:'confirmed',memo:'',version:1,payment_method_id:null,account_id:null,target_account_id:null,planned_amount:null,original_transaction_id:null,source_id:null,source_namespace:null,...patch};}
test('monthly owner totals, chart totals and expense balances share the existing accounting rules',()=>{
 const rows=[row('salary',{kind:'income',category_id:'income',amount:1000}),row('a',{recurrence_rule_id:'rule'}),row('b',{owner:'하율',amount:200,cost_type:'variable'}),row('c',{owner:'기타',amount:300}),row('refund',{kind:'refund',amount:20,original_transaction_id:'a'}),row('savings',{kind:'saving',amount:50}),row('loan',{kind:'loan_principal',amount:30}),row('transfer',{kind:'transfer',amount:999}),row('settlement',{kind:'settlement'}),row('borrow',{kind:'loan_received'}),row('planned',{status:'planned'}),row('cancelled',{status:'cancelled'})];
 const [m]=monthlyFlows(rows,cat), old=summarize(rows);
 assert.equal(m.income,old.income);assert.equal(m.expense,old.expense);assert.equal(m.balance,420);assert.equal(m.allocation,80);assert.equal(old.remaining,340);
 assert.deepEqual(m.owners.map(r=>r.amount),[80,200,300]);
 assert.equal(m.owners.reduce((n,r)=>n+r.amount,0),m.expense);assert.equal(m.expenseCategories.reduce((n,r)=>n+r.amount,0),m.expense);assert.equal(m.incomeCategories.reduce((n,r)=>n+r.amount,0),m.income);
 assert.deepEqual([m.fixed,m.variable,m.unclassified],[80,200,300]);assert.equal(m.fixed+m.variable+m.unclassified,m.expense);
});
test('refunds inherit original classification across years without moving their dates',()=>{
 const flows=monthlyFlows([row('original',{date:'2025-12-31',cost_type:'variable'}),row('r',{date:'2026-01-01',kind:'refund',amount:80,original_transaction_id:'original'})],cat);
 assert.equal(flows[0].expense,100);assert.equal(flows[1].expense,-80);assert.equal(flows[1].variable,-80);assert.equal(flows[1].balance,80);
});
test('missing original and unclassified expenses remain unresolved rather than guessed',()=>{
 const [m]=monthlyFlows([row('a'),row('r',{kind:'refund',original_transaction_id:'missing',amount:20})],cat);
 assert.equal(m.unclassified,80);assert.equal(m.fixed,0);assert.equal(m.variable,0);
});
test('latest actual month excludes scheduled future rows and duplicate IDs fail',()=>{
 assert.equal(monthlyFlows([row('a'),row('future',{date:'2032-01-21',status:'planned'})],cat).at(-1)?.month,'2026-01');
 assert.throws(()=>monthlyFlows([row('a'),row('a')],cat),/중복/);
});
test('previous month comparisons handle year boundaries, missing, zero and negative bases',()=>{
 assert.equal(previousMonth('2026-01'),'2025-12');assert.equal(change(10,undefined),null);assert.deepEqual(change(100,80),{amount:20,percent:25});assert.deepEqual(change(0,0),{amount:0,percent:null});assert.deepEqual(change(-20,-40),{amount:20,percent:null});
});
test('grouped chart slices preserve exact signed category totals',()=>{
 const items=Array.from({length:10},(_,i)=>({id:String(i),label:String(i),amount:i+1}));
 assert.equal(chartSlices(items).length,6);assert.equal(chartSlices(items).reduce((n,r)=>n+r.amount,0),55);
 assert.equal(chartSlices([...items,{id:'refund',label:'환불',amount:-30}]).reduce((n,r)=>n+r.amount,0),25);
});
test('dashboard API scopes to verified family, rejects partial data and redacts timestamps',async()=>{
 let calls=0;let body:any={family:{id:'family'},record_count:1,transactions:[row('a',{updated_at:'private'})],categories:cat};
 const q={select(){return q;},eq(){return q;},async maybeSingle(){return{data:{family_id:'family',role:'editor',can_view_modification_dates:false}};}};
 let signedIn=true;
 const runtime={configured:true,client:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'user'}:null}})},from:()=>q,rpc:async(name:string,args:any)=>{calls++;assert.equal(name,'load_dashboard');assert.deepEqual(args,{p_family:'family'});return{data:body};}})} as unknown as ServerRuntime;
 const request=new Request('https://money-ab4.pages.dev/api/dashboard?family=attacker');
 const response=await GET(request,runtime);assert.equal(response.status,200);assert.equal((await response.json()).transactions[0].updated_at,undefined);assert.equal(response.headers.get('cache-control'),'private, no-store');
 body.record_count=2;assert.equal((await GET(request,runtime)).status,503);body.record_count=1;body.family.id='wrong';assert.equal((await GET(request,runtime)).status,503);
 signedIn=false;assert.equal((await GET(request,runtime)).status,401);assert.equal(calls,3);
});

test('personal payroll totals preserve 20/21 boundaries, year rollover, refunds and allocations',()=>{
 const rows=[row('dec',{date:'2026-01-20',kind:'income',amount:1000}),row('jan',{date:'2026-01-21',kind:'income',amount:2000}),row('end',{date:'2026-02-20',amount:300}),row('next',{date:'2026-02-21',amount:500}),row('refund',{date:'2026-02-20',kind:'refund',amount:100}),row('saving',{date:'2026-02-20',kind:'saving',amount:400}),row('other',{date:'2026-02-20',owner:'하율',amount:700}),row('transfer',{date:'2026-02-20',kind:'transfer',amount:99999}),row('planned',{date:'2026-02-20',status:'planned'})];
 const flows=payrollFlows(rows,'상화');
 assert.deepEqual(flows.map(f=>f.month),['2025-12','2026-01','2026-02']);
 assert.deepEqual(flows[1],{month:'2026-01',start:'2026-01-21',end:'2026-02-20',income:2000,expense:200,balance:1800,allocation:400,remaining:1400});
 assert.equal(payrollFlows(rows,'하율')[0].expense,700);
 assert.equal(flows.reduce((n,f)=>n+f.income,0),summarize(rows,'상화').income);
 assert.equal(flows.reduce((n,f)=>n+f.expense,0),summarize(rows,'상화').expense);
 assert.throws(()=>payrollFlows([row('a'),row('a')],'상화'),/중복/);
});
