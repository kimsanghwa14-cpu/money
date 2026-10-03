begin;
-- A consistent family snapshot; PostgREST row limits cannot silently truncate reports.
create function public.load_ledger(p_family uuid,p_month text,p_annual boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; start_date date; end_date date; y integer; result jsonb;
begin
  actor:=public.require_family_member(p_family);
  perform public.ensure_recurring_month(p_family,p_month);
  start_date:=(p_month||'-01')::date; end_date:=(start_date+interval '1 month')::date; y:=extract(year from start_date)::integer;
  if (select count(*) from public.transactions where family_id=p_family and deleted_at is null and date>=start_date and date<end_date)>10000 then raise exception '월 거래가 10,000건을 초과했습니다.'; end if;
  if p_annual and (select count(*) from public.transactions where family_id=p_family and deleted_at is null and extract(year from date)=y)>100000 then raise exception '연간 거래가 100,000건을 초과했습니다.'; end if;
  result:=jsonb_build_object(
    'family',(select jsonb_build_object('id',id,'name',name) from public.families where id=p_family),
    'member',(select jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) from public.family_members where family_id=p_family and user_id=actor),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name)),'[]') from public.family_members where family_id=p_family),
    'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]') from public.transactions t where family_id=p_family and deleted_at is null and date>=start_date and date<end_date),
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.major,c.minor),'[]') from public.categories c where family_id=p_family),
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]') from public.accounts a where family_id=p_family),
    'methods',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.payment_methods m where family_id=p_family),
    'budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.owner,b.id),'[]') from public.monthly_budgets b where family_id=p_family and month=p_month),
    'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from (select distinct on(rule_id) * from public.recurring_versions where family_id=p_family order by rule_id,effective_month desc,revision desc) r)
  );
  if p_annual then result:=result||jsonb_build_object(
    'annual_transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]') from public.transactions t where family_id=p_family and deleted_at is null and extract(year from t.date)=y),
    'annual_budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.month,b.id),'[]') from public.monthly_budgets b where family_id=p_family and left(b.month,4)=y::text)
  ); end if;
  return result;
end $$;
revoke all on function public.load_ledger(uuid,text,boolean) from public,anon;
grant execute on function public.load_ledger(uuid,text,boolean) to authenticated;
commit;
