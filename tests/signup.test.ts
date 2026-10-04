import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSignup, usernameEmail } from '../src/lib/auth/input.ts';
import { handleSignup } from '../supabase/functions/money-signup/index.ts';
const origin='https://money-ab4.pages.dev';
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-admin-key'};
const input={username:'Sang_01',displayName:' 상화 ',password:'a password with spaces ',code:' test-code '};
const request=(body:unknown=input,from=origin)=>new Request(origin+'/signup',{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(body)});
function server(options:{rate?:boolean;reservation?:unknown;createStatus?:number}={}){
 const calls:{path:string;body:Record<string,unknown>}[]=[];
 const fetcher=async(url:RequestInfo|URL,init?:RequestInit)=>{
  const path=new URL(String(url)).pathname; const body=JSON.parse(String(init?.body)); calls.push({path,body});
  if(path.endsWith('check_signup_rate'))return Response.json(options.rate??true);
  if(path.endsWith('prepare_signup'))return Response.json(options.reservation??{ticket:'server-ticket',email:'sang_01@id.money.invalid'});
  if(path.endsWith('cancel_signup'))return Response.json(null);
  return Response.json({id:'new-user-id'},{status:options.createStatus??200});
 };
 return {calls,fetcher:fetcher as typeof fetch};
}
test('Username normalization is deterministic; password whitespace is preserved',()=>{
 assert.equal(usernameEmail(' Sang_01 '),'sang_01@id.money.invalid');
 const parsed=validateSignup(input);assert.equal(parsed.password,input.password);assert.equal(parsed.code,'TEST-CODE');assert.equal(parsed.displayName,'상화');
 for(const value of ['aa','a@evil.example','../user','한글아이디','_abc','a'.repeat(25)])assert.throws(()=>usernameEmail(value));
 assert.throws(()=>validateSignup({...input,password:'가'.repeat(25)}));
 assert.throws(()=>validateSignup({...input,password:'short'}));
});
test('Wrong invitation and duplicate username never reach Auth account creation',async()=>{
 for(const [reason,status] of [['invalid_code',403],['username_taken',409]] as const){
  const s=server({reservation:{error:reason}});const response=await handleSignup(request(),env,s.fetcher);
  assert.equal(response.status,status);assert.equal(s.calls.some(c=>c.path.includes('/auth/')),false);
 }
});
test('Signup creates a user only with a server-issued trusted ticket and never returns admin secrets',async()=>{
 const s=server();const response=await handleSignup(request(),env,s.fetcher);
 assert.equal(response.status,201);assert.deepEqual(await response.json(),{created:true});
 assert.deepEqual(s.calls.find(c=>c.path.includes('/auth/'))?.body,{email:'sang_01@id.money.invalid',password:input.password,email_confirm:true,app_metadata:{ledger_signup_ticket:'server-ticket'}});
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
 assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(s.calls.at(-1)?.path,'/rest/v1/rpc/cancel_signup');
});
test('Admin failure releases only the reservation and does not delete a possibly committed account',async()=>{
 const s=server({createStatus:500});assert.equal((await handleSignup(request(),env,s.fetcher)).status,503);
 assert.equal(s.calls.at(-1)?.path,'/rest/v1/rpc/cancel_signup');
 assert.equal(s.calls.some(c=>c.path.includes('delete')),false);
});
test('Request throttling blocks account preparation and creation',async()=>{
 const s=server({rate:false});assert.equal((await handleSignup(request(),env,s.fetcher)).status,429);assert.equal(s.calls.length,1);
});
test('Origin and input validation fail before any privileged server call',async()=>{
 const s=server();assert.equal((await handleSignup(request(input,'https://other.example'),env,s.fetcher)).status,403);
 for(const body of [{...input,code:''},{...input,password:'short'},[],null])assert.equal((await handleSignup(request(body),env,s.fetcher)).status,400);
 assert.equal((await handleSignup(request({...input,displayName:'x'.repeat(5000)}),env,s.fetcher)).status,413);
 assert.equal(s.calls.length,0);
});
