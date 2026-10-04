begin;
create function pg_temp.permission_check(ok boolean,message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'PERMISSION TEST FAILED: %',message; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data,created_at,updated_at) values
 ('40000000-0000-4000-8000-000000000004','date-authorized-test@example.invalid','{}',now(),now()),
 ('41111111-1111-4111-8111-111111111111','date-editor-test@example.invalid','{"username":"sangfire","role":"owner","can_view_modification_dates":true}',now(),now()),
 ('42222222-2222-4222-8222-222222222222','date-owner-test@example.invalid','{}',now(),now());
insert into public.families(id,name) values ('43333333-3333-4333-8333-333333333333','수정일 권한 롤백 검증'),('44444444-4444-4444-8444-444444444444','수정일 외부 롤백 검증');
insert into public.family_members(family_id,user_id,display_name,role,can_view_modification_dates) values
 ('43333333-3333-4333-8333-333333333333','40000000-0000-4000-8000-000000000004','sangfire 검증','owner',true),
 ('43333333-3333-4333-8333-333333333333','41111111-1111-4111-8111-111111111111','편집자 검증','editor',false),
 ('43333333-3333-4333-8333-333333333333','42222222-2222-4222-8222-222222222222','관리자 검증','owner',false);
insert into public.transactions(id,family_id,date,owner,kind,category_id,description,amount,status,created_by,updated_by)
 select '45555555-5555-4555-8555-555555555555','43333333-3333-4333-8333-333333333333','2026-10-04','상화','expense',id,'수정일 검증',100,'confirmed','40000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004' from public.categories where family_id='43333333-3333-4333-8333-333333333333' and kind='expense' limit 1;
insert into public.assets(id,family_id,name,owner,kind,basis_date,balance,accounting,created_by,updated_by) values ('46666666-6666-4666-8666-666666666666','43333333-3333-4333-8333-333333333333','수정일 통장','상화','deposit','2026-10-04',100,'manual','40000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000004',true);
do $$declare f uuid:='43333333-3333-4333-8333-333333333333'; data jsonb; begin
 perform pg_temp.permission_check(public.can_view_modification_dates(f),'sangfire has explicit admin permission');
 perform pg_temp.permission_check((select updated_at is not null from public.transactions_visible where id='45555555-5555-4555-8555-555555555555'),'admin sees transaction dates');
 perform pg_temp.permission_check((select updated_at is not null from public.assets_visible where id='46666666-6666-4666-8666-666666666666'),'admin sees asset dates');
 data:=public.load_ledger_range(f,'2026-10','all');
 perform pg_temp.permission_check((data->'permissions'->>'view_modification_dates')::boolean and data->'transactions'->0->>'updated_at' is not null,'range RPC exposes admin dates');
 perform pg_temp.permission_check(public.visible_modification_date('44444444-4444-4444-8444-444444444444','transactions','45555555-5555-4555-8555-555555555555') is null,'cross-family timestamp lookup denied');
end $$;
select set_config('request.jwt.claim.sub','41111111-1111-4111-8111-111111111111',true);
do $$declare f uuid:='43333333-3333-4333-8333-333333333333'; data jsonb; denied boolean:=false; row jsonb; begin
 perform pg_temp.permission_check(not public.can_view_modification_dates(f),'forged username and metadata do not grant permission');
 perform pg_temp.permission_check((select updated_at is null from public.transactions_visible where id='45555555-5555-4555-8555-555555555555'),'editor cannot see transaction dates');
 perform pg_temp.permission_check((select updated_at is null from public.assets_visible where id='46666666-6666-4666-8666-666666666666'),'editor cannot see asset dates');
 perform pg_temp.permission_check(public.visible_modification_date(f,'transactions','45555555-5555-4555-8555-555555555555') is null,'direct timestamp RPC does not bypass permission');
 begin perform updated_at from public.transactions; exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.permission_check(denied,'raw transaction date column inaccessible');
 denied:=false;begin perform updated_at from public.assets; exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.permission_check(denied,'raw asset date column inaccessible');
 denied:=false;begin perform updated_at from public.monthly_budgets; exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.permission_check(denied,'raw budget date column inaccessible');
 denied:=false;begin update public.family_members set can_view_modification_dates=true where user_id=auth.uid(); exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.permission_check(denied,'member cannot escalate permissions');
 perform pg_temp.permission_check((select count(*)=0 from public.audit_log where family_id=f),'audit before-after JSON cannot leak dates');
 data:=public.load_ledger(f,'2026-10',true);
 perform pg_temp.permission_check(not (data->'permissions'->>'view_modification_dates')::boolean and data->'transactions'->0->>'updated_at' is null and data->'annual_transactions'->0->>'updated_at' is null,'calendar and annual RPC protect dates');
 data:=public.load_ledger_range(f,'2026-10','payroll');
 perform pg_temp.permission_check(not (data->'permissions'->>'view_modification_dates')::boolean,'payroll RPC still succeeds with column restrictions');
 select to_jsonb(t)||jsonb_build_object('description','편집자 수정','version',1) into row from public.transactions_visible t where id='45555555-5555-4555-8555-555555555555';
 perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(row),'deletes','[]'::jsonb));
 perform pg_temp.permission_check((select version=2 and description='편집자 수정' and updated_at is null from public.transactions_visible where id='45555555-5555-4555-8555-555555555555'),'editor can still save without dates');
 perform pg_temp.permission_check((select count(*)=0 from public.save_requests where family_id=f),'save-result cache is private');
end $$;
select set_config('request.jwt.claim.sub','42222222-2222-4222-8222-222222222222',true);
do $$begin
 perform pg_temp.permission_check(not public.can_view_modification_dates('43333333-3333-4333-8333-333333333333'),'another family administrator cannot see dates');
 perform pg_temp.permission_check((select count(*)=0 from public.transactions_visible where family_id='44444444-4444-4444-8444-444444444444'),'cross-family row access stays restricted');
end $$;
reset role;
update public.family_members set can_view_modification_dates=false where family_id='43333333-3333-4333-8333-333333333333' and user_id='40000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000004',true);
select pg_temp.permission_check((select updated_at is null from public.transactions_visible where id='45555555-5555-4555-8555-555555555555'),'revocation takes effect immediately without JWT refresh');
reset role;
rollback;
select 'MODIFICATION_DATE_PERMISSIONS_PASSED' as result;
