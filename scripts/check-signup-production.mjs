import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
import { MONEY_PUBLIC_CONFIG } from '../src/lib/supabase/config.ts';
import { blankRow, koreaDate } from '../src/lib/domain.ts';
import { verifyAssetsAndModification } from './check-assets-production.mjs';
import { verifyDashboardAndRecurring } from './check-dashboard-production.mjs';
const url=MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_URL,site=MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SITE_URL;
const headers={apikey:MONEY_PUBLIC_CONFIG.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',Origin:site};
const username=`signup_ci_${(process.env.GITHUB_SHA??'local').slice(0,8)}`;
let password=randomBytes(24).toString('hex');
// The commit-derived code is valid only when a separate disposable family was
// provisioned for this exact run, this username, and a short expiry. It cannot
// join the real family; its secret registration code is never used in CI.
const code=process.env.GITHUB_SHA;
for(const body of [
 {email:`bypass_${randomUUID()}@id.money.invalid`,password},
 {email:`bypass_${randomUUID()}@id.money.invalid`,password,data:{ledger_signup_ticket:randomUUID()},app_metadata:{ledger_signup_ticket:randomUUID()}},
]){
 const result=await fetch(`${url}/auth/v1/signup`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 assert.ok(!result.ok,'Direct Auth signup without a server-issued enrollment must fail');
}
console.log('Direct Auth signup and forged metadata bypass denied');
const rpc=await fetch(`${url}/rest/v1/rpc/prepare_signup`,{method:'POST',headers,body:JSON.stringify({p_code:'anything',p_username:'anything',p_display_name:'anything'}),signal:AbortSignal.timeout(15000)});
assert.ok([401,403,404].includes(rpc.status),'Clients cannot call privileged enrollment RPC');
console.log('Privileged signup RPC is inaccessible to public clients');
if(!code){console.log('No disposable signup fixture configured; full-flow check skipped');process.exit(0);}
const browser=await chromium.launch();
try{
 const context=await browser.newContext({baseURL:site});const page=await context.newPage();
 await page.goto(`${site}/signup`,{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'가족 계정 만들기'}).waitFor();
 await page.getByLabel('아이디',{exact:true}).fill(username);
 await page.getByLabel('이름',{exact:true}).fill('회원가입 검증');
 await page.getByLabel('비밀번호',{exact:true}).fill(password);
 await page.getByLabel('비밀번호 확인',{exact:true}).fill(password);
 await page.getByLabel('회원가입 코드',{exact:true}).fill(code);
 const replyPromise=page.waitForResponse(response=>response.url().includes('/functions/v1/money-signup')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'회원가입',exact:true}).click();
 const reply=await replyPromise;
 if(reply.status()===403){console.log('No active disposable signup fixture provisioned; full-flow check skipped');await context.close();}
 else{
  assert.equal(reply.status(),201,`Code-validated signup must succeed: ${await reply.text()}`);
  await page.getByRole('heading',{name:'집계표',exact:true}).waitFor({timeout:30000});
  const month=koreaDate().slice(0,7);const ledgerPath=`/api/ledger?month=${month}`;
  const initial=await(await page.request.get(ledgerPath)).json();
  assert.equal(initial.family.name,`가입 검증 ${process.env.GITHUB_SHA.slice(0,8)}`);
  assert.equal(initial.member.display_name,'회원가입 검증');
  assert.equal(initial.member.role,'owner');
  console.log('Code-validated signup, automatic login and correct family enrollment passed');
  const description=`가입검증-${randomUUID()}`;
  const row={...blankRow('상화',month,initial.categories),description,amount:'1,000'};
  const saved=await page.request.post('/api/transactions',{headers:{origin:site},data:{request_id:randomUUID(),upserts:[row],deletes:[]}});
  assert.ok(saved.ok(),'Newly registered user can save a ledger transaction');
  await page.reload();await page.getByRole('heading',{name:'집계표',exact:true}).waitFor();
  const persisted=await(await page.request.get(ledgerPath)).json();let tx=persisted.transactions.find(t=>t.id===row.id);
  assert.equal(tx.amount,1000);assert.equal(tx.description,description);
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await page.getByLabel('아이디',{exact:true}).fill(username.toUpperCase());
  await page.getByLabel('비밀번호',{exact:true}).fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('heading',{name:'집계표',exact:true}).waitFor({timeout:30000});
  const reloaded=await(await page.request.get(ledgerPath)).json();assert.ok(reloaded.transactions.some(t=>t.id===row.id));
  console.log('Username/password relogin and saved ledger persistence passed');
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:844});
   await page.getByRole('button',{name:'설정',exact:false}).click();
   await page.getByRole('heading',{name:'비밀번호 변경',exact:true}).waitFor();
   const nextPassword=randomBytes(24).toString('hex');
   await page.getByLabel('새 비밀번호',{exact:true}).fill(nextPassword);
   await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(`${nextPassword}x`);
   await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'새 비밀번호 확인이 일치하지 않습니다.'}).waitFor();
   await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(nextPassword);
   await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();
   await page.getByRole('status').filter({hasText:'비밀번호를 변경했습니다.'}).waitFor();
   assert.equal(await page.getByLabel('새 비밀번호',{exact:true}).inputValue(),'');
   const oldLogin=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers,body:JSON.stringify({email:`${username}@id.money.invalid`,password}),signal:AbortSignal.timeout(15000)});
   assert.equal(oldLogin.status,400,'Previous password must no longer work');
   password=nextPassword;
   await page.getByRole('button',{name:'로그아웃',exact:true}).click();
   await page.getByLabel('아이디',{exact:true}).fill(username);
   await page.getByLabel('비밀번호',{exact:true}).fill(password);
   await page.getByRole('button',{name:'로그인',exact:true}).click();
   await page.getByRole('heading',{name:'집계표',exact:true}).waitFor({timeout:30000});
   const afterChange=await(await page.request.get(ledgerPath)).json();
   assert.ok(afterChange.transactions.some(t=>t.id===row.id),'Password change preserves ledger data');
   console.log(`Password mismatch validation, change, old-password rejection, new-password login and data preservation passed at ${width}px`);
  }
  const duplicate=await fetch(`${url}/functions/v1/money-signup`,{method:'POST',headers,body:JSON.stringify({username,displayName:'중복 검증',password,code}),signal:AbortSignal.timeout(15000)});
  assert.equal(duplicate.status,409,'Duplicate usernames must be rejected');
  console.log('Duplicate username rejection passed');
  await verifyDashboardAndRecurring(page,tx,ledgerPath);
  tx=await verifyAssetsAndModification(page,tx,ledgerPath);
  const cleaned=await page.request.post('/api/transactions',{headers:{origin:site},data:{request_id:randomUUID(),upserts:[],deletes:[{id:tx.id,version:tx.version}]}});assert.ok(cleaned.ok());
  await page.getByRole('button',{name:'로그아웃',exact:true}).click();
  await context.close();
 }
}finally{await browser.close();}
