begin;
create function pg_temp.asset_check(condition boolean,msg text) returns void language plpgsql as $$begin if condition is distinct from true then raise exception 'ASSET TEST FAILED: %',msg; end if; end$$;
insert into auth.users(id,email,created_at,updated_at) values
 ('66666666-6666-4666-8666-666666666666','assets-test@example.invalid',now(),now()),
 ('77777777-7777-4777-8777-777777777777','assets-outsider@example.invalid',now(),now());
insert into public.families(id,name) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','자산 롤백 검증'),('ffffffff-ffff-4fff-8fff-ffffffffffff','외부 자산 롤백 검증');
insert into public.family_members(family_id,user_id,display_name,role) values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','66666666-6666-4666-8666-666666666666','자산 테스트','owner'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','77777777-7777-4777-8777-777777777777','외부 테스트','owner');
set local role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$declare f uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; request uuid:=gen_random_uuid(); payload jsonb; deposit jsonb; loan jsonb; saved jsonb; denied boolean; begin
 deposit:=jsonb_build_object('id','88888888-8888-4888-8888-888888888888','version',0,'name','통장','owner','상화','kind','deposit','basis_date','2026-10-04','balance',1000000,'memo','');
 loan:=deposit||jsonb_build_object('id','99999999-9999-4999-8999-999999999999','name','대출','owner','하율','kind','loan','balance',400000);
 payload:=jsonb_build_object('upserts',jsonb_build_array(deposit,loan),'deletes','[]'::jsonb);
 saved:=public.save_assets(f,request,payload);perform public.save_assets(f,request,payload);
 perform pg_temp.asset_check((saved->>'saved')::integer=2,'batch save succeeds');
 perform pg_temp.asset_check((select count(*)=2 and max(version)=1 from public.assets where family_id=f),'retry does not duplicate or increment version');
 perform pg_temp.asset_check((select sum(balance) filter(where kind<>'loan')-sum(balance) filter(where kind='loan')=600000 from public.assets where family_id=f),'asset minus loan net balance');
 deposit:=deposit||jsonb_build_object('version',1,'balance',1200000);
 perform public.save_assets(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(deposit),'deletes','[]'::jsonb));
 perform pg_temp.asset_check((select version=2 and balance=1200000 and updated_at>created_at and updated_by='66666666-6666-4666-8666-666666666666' from public.assets where id=(deposit->>'id')::uuid),'edit advances version and server modification time');
 denied:=false;begin perform public.save_assets(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(deposit),'deletes','[]'::jsonb));exception when sqlstate 'PT409' then denied:=true;end;
 perform pg_temp.asset_check(denied,'stale edit rejected');
 denied:=false;begin perform public.save_assets(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(deposit||jsonb_build_object('version',2,'balance',1),loan||jsonb_build_object('version',1,'balance',-1)),'deletes','[]'::jsonb));exception when others then denied:=true;end;
 perform pg_temp.asset_check(denied and (select balance=1200000 from public.assets where id=(deposit->>'id')::uuid),'invalid batch rolls back every row');
 denied:=false;begin update public.assets set balance=1 where family_id=f;exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.asset_check(denied,'direct write denied');
 request:=gen_random_uuid();payload:=jsonb_build_object('upserts','[]'::jsonb,'deletes',jsonb_build_array(jsonb_build_object('id',loan->>'id','version',1)));
 perform public.save_assets(f,request,payload);perform public.save_assets(f,request,payload);
 perform pg_temp.asset_check((select deleted_at is not null and version=2 from public.assets where id=(loan->>'id')::uuid),'soft delete and retry retain one deletion');
 perform pg_temp.asset_check((select count(*)=4 from public.audit_log where family_id=f and entity='assets'),'creation edit and deletion have audit records');
end$$;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
do $$declare denied boolean:=false; begin
 perform pg_temp.asset_check((select count(*)=0 from public.assets where family_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'outsider read denied');
 begin perform public.save_assets('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',gen_random_uuid(),'{"upserts":[],"deletes":[{"id":"88888888-8888-4888-8888-888888888888","version":2}]}');exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.asset_check(denied,'outsider family RPC denied');
 denied:=false;begin perform public.save_assets('ffffffff-ffff-4fff-8fff-ffffffffffff',gen_random_uuid(),'{"upserts":[],"deletes":[{"id":"88888888-8888-4888-8888-888888888888","version":2}]}');exception when sqlstate 'PT409' then denied:=true;end;
 perform pg_temp.asset_check(denied,'cross-family ID deletion denied');
end$$;
reset role;
rollback;
select 'ASSET_DB_CHECKS_PASSED' as result;
