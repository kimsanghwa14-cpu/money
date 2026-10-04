alter table public.family_members add column can_view_modification_dates boolean not null default false;
update public.family_members m set role='owner',can_view_modification_dates=true
from auth.users u where u.id=m.user_id and u.email='sangfire@id.money.invalid' and m.active;

create or replace function public.can_view_modification_dates(p_family uuid)
returns boolean language sql stable security invoker set search_path=''
as $$ select exists(select 1 from public.family_members m where m.family_id=p_family and m.user_id=auth.uid() and m.active and m.role='owner' and m.can_view_modification_dates); $$;
revoke all on function public.can_view_modification_dates(uuid) from public,anon;
grant execute on function public.can_view_modification_dates(uuid) to authenticated,service_role;

-- This narrow lookup is the only client-accessible path to protected timestamps.
-- Authorization uses the current DB membership, never user-editable Auth metadata.
create or replace function public.visible_modification_date(p_family uuid,p_entity text,p_id uuid)
returns timestamptz language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.can_view_modification_dates(p_family) then return null; end if;
 case p_entity
 when 'transactions' then return (select updated_at from public.transactions where family_id=p_family and id=p_id and deleted_at is null);
 when 'assets' then return (select updated_at from public.assets where family_id=p_family and id=p_id and deleted_at is null);
 when 'monthly_budgets' then return (select updated_at from public.monthly_budgets where family_id=p_family and id=p_id);
 else return null;
 end case;
end $$;
revoke all on function public.visible_modification_date(uuid,text,uuid) from public,anon;
grant execute on function public.visible_modification_date(uuid,text,uuid) to authenticated,service_role;

create view public.transactions_visible with (security_invoker=true) as select t.id,t.family_id,t.date,t.owner,t.kind,t.category_id,t.description,t.amount,t.payment_method_id,t.account_id,t.target_account_id,t.status,t.memo,t.planned_amount,t.original_transaction_id,t.recurrence_rule_id,t.recurrence_version_id,t.user_modified,t.source_namespace,t.source_id,t.version,t.created_by,t.updated_by,t.created_at,public.visible_modification_date(t.family_id,'transactions',t.id) as updated_at,t.deleted_at from public.transactions t;
revoke all on public.transactions_visible from public,anon;
grant select on public.transactions_visible to authenticated,service_role;

create view public.assets_visible with (security_invoker=true) as select t.id,t.family_id,t.name,t.owner,t.kind,t.basis_date,t.balance,t.accounting,t.account_id,t.history_complete,t.memo,t.version,t.created_by,t.updated_by,t.created_at,public.visible_modification_date(t.family_id,'assets',t.id) as updated_at,t.deleted_at from public.assets t;
revoke all on public.assets_visible from public,anon;
grant select on public.assets_visible to authenticated,service_role;

create view public.monthly_budgets_visible with (security_invoker=true) as select t.id,t.family_id,t.month,t.owner,t.category_id,t.amount,t.label,t.version,t.created_by,t.updated_by,t.created_at,public.visible_modification_date(t.family_id,'monthly_budgets',t.id) as updated_at from public.monthly_budgets t;
revoke all on public.monthly_budgets_visible from public,anon;
grant select on public.monthly_budgets_visible to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.load_ledger(p_family uuid, p_month text, p_annual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare actor uuid; start_date date; end_date date; y integer; result jsonb;
begin
  actor:=public.require_family_member(p_family);
  perform public.ensure_recurring_month(p_family,p_month);
  start_date:=(p_month||'-01')::date; end_date:=(start_date+interval '1 month')::date; y:=extract(year from start_date)::integer;
  if (select count(*) from public.transactions_visible where family_id=p_family and deleted_at is null and date>=start_date and date<end_date)>10000 then raise exception '월 거래가 10,000건을 초과했습니다.'; end if;
  if p_annual and (select count(*) from public.transactions_visible where family_id=p_family and deleted_at is null and extract(year from date)=y)>100000 then raise exception '연간 거래가 100,000건을 초과했습니다.'; end if;
  result:=jsonb_build_object(
    'family',(select jsonb_build_object('id',id,'name',name) from public.families where id=p_family),
    'member',(select jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) from public.family_members where family_id=p_family and user_id=actor),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name)),'[]') from public.family_members where family_id=p_family),
    'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]') from public.transactions_visible t where family_id=p_family and deleted_at is null and date>=start_date and date<end_date),
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.major,c.minor),'[]') from public.categories c where family_id=p_family),
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]') from public.accounts a where family_id=p_family),
    'methods',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.payment_methods m where family_id=p_family),
    'budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.owner,b.id),'[]') from public.monthly_budgets_visible b where family_id=p_family and month=p_month),
    'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]') from (select distinct on(rule_id) * from public.recurring_versions where family_id=p_family order by rule_id,effective_month desc,revision desc) r)
  );
  if p_annual then result:=result||jsonb_build_object(
    'annual_transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]') from public.transactions_visible t where family_id=p_family and deleted_at is null and extract(year from t.date)=y),
    'annual_budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.month,b.id),'[]') from public.monthly_budgets_visible b where family_id=p_family and left(b.month,4)=y::text)
  ); end if;
  return result||jsonb_build_object('permissions',jsonb_build_object('view_modification_dates',public.can_view_modification_dates(p_family)));
end $function$
;

CREATE OR REPLACE FUNCTION public.load_ledger_range(p_family uuid, p_month text, p_mode text, p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_annual boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  -- One family-scoped lock keeps this snapshot consistent with the existing write RPCs.
  perform pg_advisory_xact_lock(hashtextextended(p_family::text,0));
  -- Whole-history/custom reads never manufacture years of planned transactions.
  if p_mode in ('payroll','calendar') then
    cursor_month:=date_trunc('month',first_day)::date;
    while cursor_month<=last_day loop
      perform public.ensure_recurring_month(p_family,to_char(cursor_month,'YYYY-MM'));
      cursor_month:=(cursor_month+interval '1 month')::date;
    end loop;
  end if;
  select count(*) into row_count from public.transactions_visible t
    where t.family_id=p_family and t.deleted_at is null
      and (first_day is null or t.date>=first_day) and (last_day is null or t.date<=last_day);
  if row_count>100000 then raise exception '조회 거래가 100,000건을 초과했습니다. 기간을 줄여 다시 조회하세요.'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.date,t.id),'[]'::jsonb) into records
    from public.transactions_visible t where t.family_id=p_family and t.deleted_at is null
      and (first_day is null or t.date>=first_day) and (last_day is null or t.date<=last_day);
  result:=jsonb_build_object(
    'family',(select jsonb_build_object('id',id,'name',name) from public.families where id=p_family),
    'member',(select jsonb_build_object('user_id',user_id,'display_name',display_name,'role',role) from public.family_members where family_id=p_family and user_id=actor and active),
    'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',display_name)),'[]'::jsonb) from public.family_members where family_id=p_family),
    'transactions',records,
    'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.major,c.minor),'[]'::jsonb) from public.categories c where family_id=p_family),
    'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.name),'[]'::jsonb) from public.accounts a where family_id=p_family),
    'methods',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]'::jsonb) from public.payment_methods m where family_id=p_family),
    'budgets',(select coalesce(jsonb_agg(to_jsonb(b) order by b.month,b.owner,b.id),'[]'::jsonb) from public.monthly_budgets_visible b
      where family_id=p_family and p_mode='calendar' and (case when p_annual then left(b.month,4)=left(p_month,4) else b.month=p_month end)),
    'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.name),'[]'::jsonb) from
      (select distinct on(rule_id) * from public.recurring_versions where family_id=p_family order by rule_id,effective_month desc,revision desc) r),
    'period',jsonb_build_object('mode',p_mode,'month',p_month,'start',first_day,'end',last_day,'annual',p_annual),
    'record_count',row_count
  );
  if p_annual then result:=result||jsonb_build_object('annual_transactions',records,'annual_budgets',result->'budgets'); end if;
  return result||jsonb_build_object('permissions',jsonb_build_object('view_modification_dates',public.can_view_modification_dates(p_family)));
end $function$
;

notify pgrst,'reload schema';
