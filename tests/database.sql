-- Disposable TEST database only, after both migrations. All fixtures and writes roll back.
begin;
create function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$
begin if condition is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
insert into auth.users(id,email,created_at,updated_at) values
 ('11111111-1111-4111-8111-111111111111','ledger-test-one@example.invalid',now(),now()),
 ('22222222-2222-4222-8222-222222222222','ledger-test-two@example.invalid',now(),now()),
 ('33333333-3333-4333-8333-333333333333','ledger-test-outsider@example.invalid',now(),now());
insert into public.families(id,name) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','가상 테스트 가족'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','별도 테스트 가족');
insert into public.family_members(family_id,user_id,display_name,role) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','테스트 작성자 1','owner'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','테스트 작성자 2','editor'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','외부 가족','owner');
create temp table fixture_keys(key text primary key,value uuid) on commit drop;
grant select,insert,update on fixture_keys to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$
declare f uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; cat uuid; payload jsonb; request_id uuid:=gen_random_uuid(); result jsonb;
  first_id uuid; failed boolean:=false; updated jsonb; bad_id uuid:=gen_random_uuid(); r_id uuid; rule jsonb; tx_id uuid; old_amount bigint;
  occurrence_payload jsonb; revision_id uuid; current_month text:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM'); count_before integer;
begin
 select id into cat from public.categories where family_id=f and kind='expense' and minor='식비';
 select jsonb_build_object('upserts',jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'version',0,'date','2026-10-03','owner',case i%3 when 0 then '기타' when 1 then '상화' else '하율' end,'kind','expense','category_id',cat,'description','가상 테스트 '||i,'amount',1000,'status','confirmed','memo','')),'deletes','[]'::jsonb) into payload from generate_series(1,20) i;
 result:=public.save_transactions(f,request_id,payload);
 perform pg_temp.assert_true((result->>'saved')::integer=20,'20 rows atomically saved');
 perform pg_temp.assert_true((select count(*)=20 from public.transactions where family_id=f),'20 persistent DB rows');
 perform pg_temp.assert_true((select sum(amount)=20000 from public.transactions where family_id=f),'all attribution rows counted');
 perform public.save_transactions(f,request_id,payload);
 perform pg_temp.assert_true((select count(*)=20 and max(version)=1 from public.transactions where family_id=f),'retry does not duplicate or update rows');
 first_id:=(payload->'upserts'->0->>'id')::uuid; insert into fixture_keys values('first',first_id);
 begin
   perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(
     (payload->'upserts'->0)||jsonb_build_object('id',bad_id,'amount',300),
     (payload->'upserts'->1)||jsonb_build_object('id',gen_random_uuid(),'amount',-1)),'deletes','[]'::jsonb));
 exception when others then failed:=true; end;
 perform pg_temp.assert_true(failed,'invalid batch rejected');
 perform pg_temp.assert_true(not exists(select 1 from public.transactions where id=bad_id),'no partial saves');
 updated:=(payload->'upserts'->0)||jsonb_build_object('version',1,'amount',1100);
 perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(updated),'deletes','[]'::jsonb));
 failed:=false;
 begin perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(updated||jsonb_build_object('amount',2000)),'deletes','[]'::jsonb));
 exception when serialization_failure then failed:=true; end;
 perform pg_temp.assert_true(failed,'optimistic concurrency conflict');
 perform pg_temp.assert_true((select version=2 and amount=1100 from public.transactions where id=first_id),'conflict does not overwrite');
 failed:=false;
 begin perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(updated||jsonb_build_object('id',gen_random_uuid(),'version',0,'kind','refund','original_transaction_id',first_id,'amount',2000)),'deletes','[]'::jsonb));
 exception when others then failed:=true; end;
 perform pg_temp.assert_true(failed,'over-refund rejected');
 -- A reviewed import uses the same atomic request fence; replay is exactly-once.
 request_id:=gen_random_uuid();updated:=(payload->'upserts'->0)||jsonb_build_object('id',gen_random_uuid(),'source_namespace','test-bank','source_id','test-source-id');
 occurrence_payload:=jsonb_build_object('upserts',jsonb_build_array(updated),'deletes','[]'::jsonb,'import',jsonb_build_object('source','test','filename','synthetic.csv'));
 perform public.save_transactions(f,request_id,occurrence_payload);perform public.save_transactions(f,request_id,occurrence_payload);
 perform pg_temp.assert_true((select count(*)=1 from public.import_batches where id=request_id),'one import history for retry');
 perform pg_temp.assert_true((select count(*)=1 from public.transactions where source_id='test-source-id' and family_id=f),'one imported transaction');
 rule:=jsonb_build_object('name','가상 반복 테스트','owner','기타','kind','expense','category_id',cat,'amount',1000,'day',31,'interval_months',1,'start_month','2024-01','effective_month','2024-01','enabled',true);
 request_id:=gen_random_uuid();r_id:=public.save_recurring_rule(f,request_id,rule);perform public.save_recurring_rule(f,request_id,rule);
 perform pg_temp.assert_true((select count(*)=1 from public.recurring_rules where id=r_id),'rule retry idempotency');
 perform public.ensure_recurring_month(f,'2024-02');perform public.ensure_recurring_month(f,'2024-02');
 perform pg_temp.assert_true((select count(*)=1 from public.recurrence_occurrences where rule_id=r_id and month='2024-02'),'unique monthly occurrence');
 select transaction_id into tx_id from public.recurrence_occurrences where rule_id=r_id and month='2024-02';
 perform pg_temp.assert_true((select date='2024-02-29' and status='planned' from public.transactions where id=tx_id),'leap-year month end and planned status');
 select to_jsonb(t)||jsonb_build_object('status','confirmed','amount',900) into occurrence_payload from public.transactions_visible t where id=tx_id;
 perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(occurrence_payload),'deletes','[]'::jsonb));
 perform public.ensure_recurring_month(f,'2024-03');select transaction_id into tx_id from public.recurrence_occurrences where rule_id=r_id and month='2024-03';
 select to_jsonb(t)||jsonb_build_object('status','cancelled') into occurrence_payload from public.transactions_visible t where id=tx_id;
 perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(occurrence_payload),'deletes','[]'::jsonb));
 perform public.ensure_recurring_month(f,'2024-03');perform pg_temp.assert_true((select status='cancelled' from public.transactions where id=tx_id),'skip persists');
 select id into revision_id from public.recurring_versions where recurring_versions.rule_id=r_id order by revision desc limit 1;
 perform public.save_recurring_rule(f,gen_random_uuid(),rule||jsonb_build_object('id',revision_id,'rule_id',r_id,'effective_month',current_month,'amount',2000));
 perform public.ensure_recurring_month(f,'2024-02');
 perform pg_temp.assert_true((select t.amount=900 and t.planned_amount=1000 and t.status='confirmed' from public.transactions_visible t join public.recurrence_occurrences o on o.transaction_id=t.id where o.rule_id=r_id and o.month='2024-02'),'past confirmed original and plan preserved');
 perform pg_temp.assert_true((public.load_ledger(f,'2024-02',false)->'transactions'->0->>'status')='confirmed','DB snapshot returned');
 failed:=false;begin update public.transactions set amount=99 where id=first_id; exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.assert_true(failed,'direct write bypass blocked');
end $$;
-- Second family member is free to edit another attribution; actor stays separate.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare f uuid:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; tx_id uuid; payload jsonb; begin
 select value into tx_id from fixture_keys where key='first';
 select to_jsonb(t)||jsonb_build_object('owner','상화') into payload from public.transactions_visible t where id=tx_id;
 perform public.save_transactions(f,gen_random_uuid(),jsonb_build_object('upserts',jsonb_build_array(payload),'deletes','[]'::jsonb));
 perform pg_temp.assert_true((select owner='상화' and updated_by='22222222-2222-4222-8222-222222222222' from public.transactions where id=tx_id),'actor differs from attribution');
end $$;
-- Outsider: both direct Data API/RLS reads and RPC calls must fail closed.
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ declare denied boolean:=false; begin
 perform pg_temp.assert_true((select count(*)=0 from public.transactions where family_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'outsider RLS read denied');
 begin perform public.load_ledger('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2026-10',false);exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert_true(denied,'outsider RPC denied');
end $$;
reset role;
rollback;
select 'DB_CHECKS_PASSED' as result;
