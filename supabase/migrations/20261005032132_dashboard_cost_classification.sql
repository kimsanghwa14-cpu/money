-- Existing rows remain NULL; no amounts, dates, or ownership are modified.
alter table public.transactions add column cost_type text check (cost_type is null or (kind='expense' and cost_type in ('fixed','variable')));
grant select(cost_type) on public.transactions to authenticated;
create or replace view public.transactions_visible with (security_invoker=true) as select t.id,t.family_id,t.date,t.owner,t.kind,t.category_id,t.description,t.amount,t.payment_method_id,t.account_id,t.target_account_id,t.status,t.memo,t.planned_amount,t.original_transaction_id,t.recurrence_rule_id,t.recurrence_version_id,t.user_modified,t.source_namespace,t.source_id,t.version,t.created_by,t.updated_by,t.created_at,public.visible_modification_date(t.family_id,'transactions',t.id) as updated_at,t.deleted_at,t.cost_type from public.transactions t;
-- Extend existing atomic saves, keeping family, request, version and audit checks.
do $migration$
declare definition text;
begin
 definition := pg_get_functiondef('public.save_transactions(uuid,uuid,jsonb)'::regprocedure);
 if position('insert into public.transactions(id,' in definition)=0 or position('values(row_id,p_family,' in definition)=0 or position('update public.transactions set date=' in definition)=0 then raise exception 'Transaction save changed; review before extending'; end if;
 definition := replace(definition,'insert into public.transactions(id,','insert into public.transactions(cost_type,id,');
 definition := replace(definition,'values(row_id,p_family,','values(nullif(item->>''cost_type'',''''),row_id,p_family,');
 definition := replace(definition,'update public.transactions set date=','update public.transactions set cost_type=case when item ? ''cost_type'' then nullif(item->>''cost_type'','''') when item->>''kind''<>''expense'' then null else cost_type end,date=');
 execute definition;
end $migration$;
-- Read-only stable snapshot; no recurrence generation or writes.
create function public.load_dashboard(p_family uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid; records integer;
begin
 actor := public.require_family_member(p_family);
 select count(*) into records from public.transactions where family_id=p_family and deleted_at is null and status='confirmed';
 if records>100000 then raise exception '집계 거래가 100,000건을 초과했습니다.'; end if;
 return jsonb_build_object(
 'family',(select jsonb_build_object('id',id,'name',name) from public.families where id=p_family),
 'record_count',records,
 'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]'::jsonb) from public.transactions_visible t where family_id=p_family and deleted_at is null and status='confirmed'),
 'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.major,c.minor),'[]'::jsonb) from public.categories c where family_id=p_family));
end $$;
revoke all on function public.load_dashboard(uuid) from public,anon;
grant execute on function public.load_dashboard(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
