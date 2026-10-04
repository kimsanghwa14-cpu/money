begin;
create function pg_temp.check_signup_test(condition boolean,msg text) returns void language plpgsql as $$begin if condition is distinct from true then raise exception 'SIGNUP TEST FAILED: %',msg; end if; end$$;
insert into public.families(id,name) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','가입 롤백 검증');
insert into ledger_private.signup_codes(id,family_id,code_hash,max_uses)
values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc',encode(extensions.digest('ROLLBACK-CODE','sha256'),'hex'),2);
do $$declare result jsonb; second jsonb; failed boolean:=false; begin
 perform pg_temp.check_signup_test(not has_schema_privilege('anon','ledger_private','USAGE'),'private schema hidden from anon');
 perform pg_temp.check_signup_test(not has_function_privilege('authenticated','public.prepare_signup(text,text,text)','EXECUTE'),'enrollment RPC hidden from clients');
 perform pg_temp.check_signup_test((public.prepare_signup('wrong','rollback_one','상화')->>'error')='invalid_code','wrong code denied');
 perform pg_temp.check_signup_test((select count(*)=0 from ledger_private.signup_requests),'wrong code leaves no reservation');
 result:=public.prepare_signup(' rollback-code ','ROLLBACK_ONE','상화');
 perform pg_temp.check_signup_test(result ? 'ticket','valid code reserves username');
 perform pg_temp.check_signup_test((public.prepare_signup('ROLLBACK-CODE','rollback_one','상화')->>'error')='username_taken','concurrent duplicate reservation denied');
 insert into auth.users(id,email,raw_app_meta_data,created_at,updated_at) values('44444444-4444-4444-8444-444444444444',result->>'email',jsonb_build_object('ledger_signup_ticket',result->>'ticket'),now(),now());
 perform pg_temp.check_signup_test((select role='owner' from public.family_members where user_id='44444444-4444-4444-8444-444444444444'),'first member becomes owner');
 perform pg_temp.check_signup_test((select user_id='44444444-4444-4444-8444-444444444444' from ledger_private.signup_requests where ticket=(result->>'ticket')::uuid),'user and enrollment committed together');
 begin insert into auth.users(id,email,raw_app_meta_data) values(gen_random_uuid(),'replay@id.money.invalid',jsonb_build_object('ledger_signup_ticket',result->>'ticket')); exception when insufficient_privilege then failed:=true; end;
 perform pg_temp.check_signup_test(failed,'ticket replay rejected');
 second:=public.prepare_signup('ROLLBACK-CODE','rollback_two','하율');
 insert into auth.users(id,email,raw_app_meta_data,created_at,updated_at) values('55555555-5555-4555-8555-555555555555',second->>'email',jsonb_build_object('ledger_signup_ticket',second->>'ticket'),now(),now());
 perform pg_temp.check_signup_test((select role='editor' from public.family_members where user_id='55555555-5555-4555-8555-555555555555'),'later member becomes editor');
 perform pg_temp.check_signup_test((public.prepare_signup('ROLLBACK-CODE','rollback_three','기타')->>'error')='invalid_code','exhausted code denied');
 for i in 1..10 loop perform pg_temp.check_signup_test(public.check_signup_rate(repeat('f',64)),'first ten requests allowed'); end loop;
 perform pg_temp.check_signup_test(not public.check_signup_rate(repeat('f',64)),'eleventh request denied');
end$$;
do $$declare denied boolean:=false; begin
 begin insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(gen_random_uuid(),'bypass@id.money.invalid','{"ledger_signup_ticket":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","code":"ROLLBACK-CODE"}','{"ledger_signup_ticket":""}'); exception when insufficient_privilege then denied:=true; end;
 perform pg_temp.check_signup_test(denied,'untrusted metadata cannot replace trusted enrollment');
end$$;
reset role;
rollback;
select 'SIGNUP_DB_CHECKS_PASSED' as result;
