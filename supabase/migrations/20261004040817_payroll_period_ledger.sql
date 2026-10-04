create or replace function public.load_ledger_range(
  p_family uuid, p_month text, p_mode text,
  p_start date default null, p_end date default null, p_annual boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $function$
declare
  actor uuid := auth.uid(); first_day date; last_day date; cursor_month date;
  anchor date; next_anchor date; records jsonb; result jsonb; row_count bigint;
begin
  if actor is null or not public.is_family_member(p_family) then
    raise exception '가족 접근 권한이 없습니다.' using errcode='42501';
  end if;
  if p_mode is null or p_mode not in ('payroll','calendar','all','custom')
     or p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
     or left(p_month,4)::integer not between 1900 and 9998 or p_annual is null then
    raise exception '조회 방식과 연월을 확인하세요.';
  end if;
  if p_annual and p_mode not in ('payroll','calendar') then
    raise exception '연간 비교는 급여주기 또는 달력월에서 선택하세요.';
  end if;
  if p_mode='custom' then
    if p_start is null or p_end is null or p_start>p_end
       or p_start<'1900-01-01'::date or p_end>'9999-12-31'::date then
      raise exception '시작일·종료일을 순서대로 선택하세요.';
    end if;
    first_day:=p_start; last_day:=p_end;
  elsif p_mode in ('payroll','calendar') then
    anchor:=((case when p_annual then left(p_month,4)||'-01' else p_month end)||'-01')::date;
    next_anchor:=(anchor+case when p_annual then interval '1 year' else interval '1 month' end)::date;
    first_day:=anchor+case when p_mode='payroll' then 20 else 0 end;
    last_day:=next_anchor+case when p_mode='payroll' then 19 else -1 end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_family::text,0));
  if p_mode in ('payroll','calendar') then
    cursor_month:=date_trunc('month',first_day)::date;
    while cursor_month<=last_day loop
      perform public.ensure_recurring_month(p_family,to_char(cursor_month,'YYYY-MM'));
      cursor_month:=(cursor_month+interval '1 month')::date;
    end loop;
  end if;
  select count(*) into row_count from public.transactions t
    where t.family_id=p_family and t.deleted_at is null
      and (first_day is null or t.date>=first_day) and (last_day is null or t.date<=last_day);
  if row_count>100000 then raise exception '조회 거래가 100,000건을 초과했습니다. 기간을 줄여 다시 조회하세요.'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]'::jsonb) into records
    from public.transactions t where t.family_id=p_family and t.deleted_at is null
      and (first_day is null or t.date>=first_day) and (last_day is null or t.date<=last_day);
  result:=jsonb_build_object(
    'family',(select jsonb_build_object('id',id,'name',name) from public.families where id=p_family),
    'member',(select jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) from public.family_members where family_id=p_family and user_id=actor and active),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name)),'[]'::jsonb) from public.family_members where family_id=p_family),
    'transactions',records,
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.major,c.minor),'[]'::jsonb) from public.categories c where family_id=p_family),
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]'::jsonb) from public.accounts a where family_id=p_family),
    'methods',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]'::jsonb) from public.payment_methods m where family_id=p_family),
    'budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.month,b.owner,b.id),'[]'::jsonb) from public.monthly_budgets b
      where family_id=p_family and p_mode='calendar' and (case when p_annual then left(b.month,4)=left(p_month,4) else b.month=p_month end)),
    'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]'::jsonb) from
      (select distinct on(rule_id) * from public.recurring_versions where family_id=p_family order by rule_id,effective_month desc,revision desc) r),
    'period',jsonb_build_object('mode',p_mode,'month',p_month,'start',first_day,'end',last_day,'annual',p_annual),
    'record_count',row_count
  );
  if p_annual then result:=result||jsonb_build_object('annual_transactions',records,'annual_budgets',result->'budgets'); end if;
  return result;
end $function$;
revoke all on function public.load_ledger_range(uuid,text,text,date,date,boolean) from public, anon;
grant execute on function public.load_ledger_range(uuid,text,text,date,date,boolean) to authenticated;
comment on function public.load_ledger_range(uuid,text,text,date,date,boolean) is 'Family-scoped payroll (21 through next 20), calendar, custom or complete ledger; inclusive endpoints. Does not alter transaction dates. Calendar budgets are not reinterpreted as payroll budgets.';
notify pgrst, 'reload schema';
