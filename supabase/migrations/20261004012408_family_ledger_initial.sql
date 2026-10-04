-- Applied to the existing empty money project; filename matches its migration history.
-- Never resets or drops an existing table. Do not reapply to an initialized project.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.families (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.family_members (
  family_id uuid not null references public.families(id), user_id uuid not null references auth.users(id),
  display_name text not null, role text not null check (role in ('owner','editor')), active boolean not null default true,
  created_at timestamptz not null default now(), primary key (family_id,user_id), unique(user_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  kind text not null check (kind in ('income','expense','saving','loan_principal','transfer','settlement','loan_received')),
  major text not null, minor text not null, unique(family_id,id), unique(family_id,kind,major,minor)
);
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  name text not null check(length(name) between 1 and 80), unique(family_id,id), unique(family_id,name)
);
create table public.accounts (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  name text not null check(length(name) between 1 and 80), kind text not null check(kind in ('bank','card','asset','loan')),
  unique(family_id,id), unique(family_id,name)
);
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), unique(family_id,id)
);
create table public.recurring_versions (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id), rule_id uuid not null,
  revision integer not null, effective_month text not null check(effective_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  name text not null check(length(name) between 1 and 120), owner text not null check(owner in ('상화','하율','기타')),
  kind text not null check(kind in ('income','expense','saving','loan_principal')),
  category_id uuid not null, amount bigint not null check(amount between 1 and 1000000000000),
  payment_method_id uuid, account_id uuid, interval_months integer not null check(interval_months between 1 and 12),
  day integer not null check(day between 1 and 31), start_month text not null, end_month text,
  enabled boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  check(left(effective_month,4)::integer between 1900 and 9999), check(left(start_month,4)::integer between 1900 and 9999),
  check(end_month is null or left(end_month,4)::integer between 1900 and 9999),
  foreign key(family_id,rule_id) references public.recurring_rules(family_id,id),
  foreign key(family_id,category_id) references public.categories(family_id,id),
  foreign key(family_id,payment_method_id) references public.payment_methods(family_id,id),
  foreign key(family_id,account_id) references public.accounts(family_id,id), unique(rule_id,revision), unique(family_id,id),
  check(start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  check(end_month is null or (end_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and end_month >= start_month))
);
create table public.transactions (
  id uuid primary key, family_id uuid not null references public.families(id), date date not null check(date between '1900-01-01' and '9999-12-31'),
  owner text not null check(owner in ('상화','하율','기타')),
  kind text not null check(kind in ('income','expense','saving','loan_principal','transfer','refund','settlement','loan_received')),
  category_id uuid not null, description text not null check(length(trim(description)) between 1 and 120),
  amount bigint not null check(amount between 1 and 1000000000000),
  payment_method_id uuid, account_id uuid, target_account_id uuid,
  status text not null check(status in ('planned','confirmed','cancelled')), memo text not null default '' check(length(memo)<=500),
  planned_amount bigint check(planned_amount between 1 and 1000000000000), original_transaction_id uuid,
  recurrence_rule_id uuid, recurrence_version_id uuid, user_modified boolean not null default false,
  source_namespace text, source_id text, version integer not null default 1 check(version>0),
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  unique(family_id,id), foreign key(family_id,category_id) references public.categories(family_id,id),
  foreign key(family_id,payment_method_id) references public.payment_methods(family_id,id),
  foreign key(family_id,account_id) references public.accounts(family_id,id),
  foreign key(family_id,target_account_id) references public.accounts(family_id,id),
  foreign key(family_id,original_transaction_id) references public.transactions(family_id,id),
  foreign key(family_id,recurrence_rule_id) references public.recurring_rules(family_id,id),
  foreign key(family_id,recurrence_version_id) references public.recurring_versions(family_id,id),
  check((source_id is null) = (source_namespace is null)),
  check(kind <> 'refund' or (original_transaction_id is not null and original_transaction_id<>id)),
  check(kind not in ('transfer','settlement') or (account_id is not null and target_account_id is not null and account_id<>target_account_id))
);
create unique index transaction_source_unique on public.transactions(family_id,source_namespace,source_id) where source_id is not null;
create index transaction_month on public.transactions(family_id,date) where deleted_at is null;
create index transaction_owner on public.transactions(family_id,owner,date) where deleted_at is null;
create table public.recurrence_occurrences (
  family_id uuid not null references public.families(id), rule_id uuid not null, month text not null,
  transaction_id uuid not null, skipped boolean not null default false, primary key(rule_id,month),
  foreign key(family_id,rule_id) references public.recurring_rules(family_id,id),
  foreign key(family_id,transaction_id) references public.transactions(family_id,id)
);
create table public.monthly_budgets (
  id uuid primary key, family_id uuid not null references public.families(id), month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  owner text not null check(owner in ('상화','하율','기타')), category_id uuid not null,
  amount bigint not null check(amount between 0 and 1000000000000), label text not null default '' check(length(label)<=120),
  version integer not null default 1, created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(family_id,category_id) references public.categories(family_id,id), unique(family_id,id), check(left(month,4)::integer between 1900 and 9999)
);
create table public.assets (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
  name text not null check(length(name) between 1 and 120), owner text not null check(owner in ('상화','하율','기타')),
  kind text not null check(kind in ('deposit','pension','investment','other','loan')),
  basis_date date not null, balance bigint not null check(balance between 0 and 1000000000000),
  accounting text not null check(accounting in ('manual','ledger')), account_id uuid,
  history_complete boolean not null default false, memo text not null default '', version integer not null default 1,
  created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(family_id,account_id) references public.accounts(family_id,id),
  check(accounting<>'ledger' or account_id is not null)
);
create table public.irregular_plans (
  id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id), month text not null,
  name text not null, owner text not null check(owner in ('상화','하율','기타')), category_id uuid not null, amount bigint not null,
  transaction_id uuid, memo text not null default '', version integer not null default 1,
  foreign key(family_id,category_id) references public.categories(family_id,id),
  foreign key(family_id,transaction_id) references public.transactions(family_id,id)
);
create table public.import_batches (
  id uuid primary key, family_id uuid not null references public.families(id), source text not null,
  filename text, status text not null check(status in ('draft','approved','committed')),
  payload jsonb not null, approved_hash text, transaction_ids uuid[] not null default '{}',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), committed_at timestamptz
);
create table public.save_requests (
  family_id uuid not null references public.families(id), request_id uuid not null, payload_hash text not null,
  result jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  primary key(family_id,request_id)
);
create table public.audit_log (
  id bigint generated always as identity primary key, family_id uuid not null references public.families(id),
  entity text not null, entity_id uuid not null, action text not null, before_data jsonb, after_data jsonb,
  actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now()
);

create function public.is_family_member(p_family uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.family_members where family_id=p_family and user_id=auth.uid() and active);
$$;
create function public.require_family_member(p_family uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not public.is_family_member(p_family) then raise exception '가족 접근 권한이 없습니다.' using errcode='42501'; end if;
  -- Serializes generation, edits, imports and refund checks within one family.
  perform pg_advisory_xact_lock(hashtextextended(p_family::text,0));
  return auth.uid();
end $$;

do $$ declare t text; begin
  foreach t in array array['families','family_members','categories','payment_methods','accounts','recurring_rules','recurring_versions','transactions','recurrence_occurrences','monthly_budgets','assets','irregular_plans','import_batches','save_requests','audit_log'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    if t='families' then
      execute 'create policy family_read on public.families for select to authenticated using(public.is_family_member(id))';
    else
      execute format('create policy family_read on public.%I for select to authenticated using(public.is_family_member(family_id))',t);
    end if;
  end loop;
end $$;

create function public.seed_family_defaults() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.categories(family_id,kind,major,minor)
  select new.id,v.kind,v.major,v.minor from (values
    ('income','수입','급여'),('income','수입','성과급'),('income','수입','기타수입'),
    ('expense','생활','식비'),('expense','생활','카페·간식'),('expense','생활','교통'),('expense','생활','쇼핑'),
    ('expense','주거','월세·관리비'),('expense','주거','통신'),('expense','금융','대출이자'),('expense','금융','보험'),
    ('expense','생활','건강·의료'),('expense','생활','문화·구독'),('expense','비정기','경조사'),('expense','생활','기타지출'),
    ('saving','저축·투자','적금'),('saving','저축·투자','연금'),('saving','저축·투자','주식·투자'),
    ('loan_principal','대출','원금상환'),('transfer','이체','내부이체'),('settlement','정산','카드대금'),('loan_received','대출','대출금 수령')
  ) as v(kind,major,minor);
  insert into public.payment_methods(family_id,name) values(new.id,'카드'),(new.id,'계좌이체'),(new.id,'현금'),(new.id,'자동이체');
  return new;
end $$;
create trigger seed_defaults after insert on public.families for each row execute function public.seed_family_defaults();

create function public.audit_transaction() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.audit_log(family_id,entity,entity_id,action,before_data,after_data,actor_id)
  values(new.family_id,'transactions',new.id,tg_op,case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.updated_by);
  return new;
end $$;
create trigger transaction_audit after insert or update on public.transactions for each row execute function public.audit_transaction();

create function public.save_transactions(p_family uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; item jsonb; row_id uuid; expected integer; existing public.transactions%rowtype;
  cat_kind text; original public.transactions%rowtype; hash text; previous public.save_requests%rowtype;
  changed uuid[] := '{}'; result jsonb; row_index integer:=0;
begin
  actor:=public.require_family_member(p_family);
  if jsonb_typeof(p_payload->'upserts') is distinct from 'array' or jsonb_typeof(p_payload->'deletes') is distinct from 'array'
     or jsonb_array_length(p_payload->'upserts')+jsonb_array_length(p_payload->'deletes')>1000 then
    raise exception '한 번에 1,000행 이내의 올바른 변경사항을 보내세요.';
  end if;
  hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  select * into previous from public.save_requests where family_id=p_family and request_id=p_request;
  if found then
    if previous.payload_hash<>hash then raise exception '재시도 요청의 내용이 바뀌었습니다. 새 저장 요청이 필요합니다.' using errcode='40001'; end if;
    return previous.result;
  end if;
  -- Store original transactions before refunds, even when pasted in the opposite order.
  for item in select value from jsonb_array_elements(p_payload->'upserts') order by case when value->>'kind'='refund' then 1 else 0 end loop
    row_index:=row_index+1; row_id:=(item->>'id')::uuid; expected:=(item->>'version')::integer;
    if item->>'date' is null or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or item->>'amount' is null or item->>'amount' !~ '^\d+$' then raise exception '%행: YYYY-MM-DD 날짜와 원 단위 정수를 입력하세요.',row_index; end if;
    if row_id is null or expected is null or expected<0 then raise exception '%행: ID·버전이 필요합니다.',row_index; end if;
    if row_id=any(changed) then raise exception '%행: 동일 거래가 변경 목록에 두 번 있습니다.',row_index; end if;
    select * into existing from public.transactions where id=row_id for update;
    if found and (existing.family_id<>p_family or existing.deleted_at is not null or existing.version<>expected) then
      raise exception '%행: 다른 사용자가 변경한 거래입니다. 입력을 보존한 뒤 최신 내역과 비교하세요.',row_index using errcode='40001';
    elsif not found and expected<>0 then raise exception '%행: 원거래를 찾을 수 없습니다.',row_index using errcode='40001'; end if;
    select kind into cat_kind from public.categories where id=(item->>'category_id')::uuid and family_id=p_family;
    if cat_kind is null or cat_kind<>(case when item->>'kind'='refund' then 'expense' else item->>'kind' end) then
      raise exception '%행: 거래유형에 맞는 분류를 선택하세요.',row_index;
    end if;
    if item->>'kind'='settlement' and not exists(select 1 from public.accounts where id=(item->>'target_account_id')::uuid and family_id=p_family and kind='card') then
      raise exception '%행: 정산 대상 카드 계좌를 지정하세요.',row_index;
    end if;
    if item->>'kind'='refund' then
      select * into original from public.transactions where id=(item->>'original_transaction_id')::uuid and family_id=p_family and kind='expense'
        and (item->>'status'='cancelled' or (status='confirmed' and deleted_at is null));
      if not found or original.id=row_id then raise exception '%행: 확정 소비지출의 원거래를 연결하세요.',row_index; end if;
      if item->>'status'<>'cancelled' and (original.owner<>item->>'owner' or original.category_id<>(item->>'category_id')::uuid) then raise exception '%행: 환불 귀속·분류는 원거래와 같아야 합니다.',row_index; end if;
    elsif nullif(item->>'original_transaction_id','') is not null then raise exception '%행: 원거래 연결은 환불에만 사용합니다.',row_index; end if;
    if existing.id is null then
      insert into public.transactions(id,family_id,date,owner,kind,category_id,description,amount,payment_method_id,account_id,target_account_id,status,memo,original_transaction_id,source_namespace,source_id,created_by,updated_by)
      values(row_id,p_family,(item->>'date')::date,item->>'owner',item->>'kind',(item->>'category_id')::uuid,trim(item->>'description'),
        (item->>'amount')::bigint,(item->>'payment_method_id')::uuid,(item->>'account_id')::uuid,(item->>'target_account_id')::uuid,item->>'status',coalesce(item->>'memo',''),
        (item->>'original_transaction_id')::uuid,nullif(item->>'source_namespace',''),nullif(item->>'source_id',''),actor,actor);
    else
      update public.transactions set date=(item->>'date')::date,owner=item->>'owner',kind=item->>'kind',category_id=(item->>'category_id')::uuid,
        description=trim(item->>'description'),amount=(item->>'amount')::bigint,payment_method_id=(item->>'payment_method_id')::uuid,
        account_id=(item->>'account_id')::uuid,target_account_id=(item->>'target_account_id')::uuid,status=item->>'status',memo=coalesce(item->>'memo',''),
        original_transaction_id=(item->>'original_transaction_id')::uuid,updated_by=actor,updated_at=now(),version=version+1,user_modified=true
      where id=row_id;
      -- Cancelling an occurrence is a persistent exception; later generation cannot revive it.
      if item->>'status'='cancelled' then update public.recurrence_occurrences set skipped=true where transaction_id=row_id; end if;
    end if;
    changed:=array_append(changed,row_id); existing:=null;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'deletes') loop
    row_id:=(item->>'id')::uuid;
    if row_id=any(changed) then raise exception '같은 거래를 저장·삭제 목록에 중복 지정할 수 없습니다.'; end if;
    update public.transactions set deleted_at=now(),version=version+1,updated_by=actor,updated_at=now(),user_modified=true
      where id=row_id and family_id=p_family and version=(item->>'version')::integer and deleted_at is null;
    if not found then raise exception '삭제 대상이 변경되었습니다. 최신 내역과 비교하세요.' using errcode='40001'; end if;
    update public.recurrence_occurrences set skipped=true where transaction_id=row_id;
    changed:=array_append(changed,row_id);
  end loop;
  -- Validate the final state of the ENTIRE batch. Over-refunds and cancelling/deleting a linked original roll back all changes.
  if exists(
    select 1 from public.transactions r left join public.transactions o on o.id=r.original_transaction_id and o.family_id=r.family_id
    where r.family_id=p_family and r.kind='refund' and r.deleted_at is null and r.status<>'cancelled'
      and (o.id is null or o.status<>'confirmed' or o.deleted_at is not null or o.kind<>'expense' or o.owner<>r.owner or o.category_id<>r.category_id)
  ) then raise exception '환불이 연결된 원거래의 취소·삭제·귀속 변경은 환불 내역과 함께 처리하세요.'; end if;
  if exists(
    select 1 from public.transactions r join public.transactions o on o.id=r.original_transaction_id
    where r.family_id=p_family and r.kind='refund' and r.status='confirmed' and r.deleted_at is null
    group by o.id,o.amount having sum(r.amount)>o.amount
  ) then raise exception '확정 환불의 합계가 원거래 금액을 초과합니다.'; end if;
  if p_payload ? 'import' then
    insert into public.import_batches(id,family_id,source,filename,status,payload,approved_hash,transaction_ids,created_by,committed_at)
    values(p_request,p_family,coalesce(p_payload->'import'->>'source','paste'),left(p_payload->'import'->>'filename',200),'committed',p_payload,hash,changed,actor,now());
  end if;
  result:=jsonb_build_object('request_id',p_request,'saved',cardinality(changed),'ids',changed);
  insert into public.save_requests values(p_family,p_request,hash,result,actor,now());
  return result;
end $$;

create function public.ensure_recurring_month(p_family uuid,p_month text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; rule public.recurring_versions%rowtype; occurrence public.recurrence_occurrences%rowtype;
  tx public.transactions%rowtype; occurrence_date date; new_id uuid; n integer:=0; month_date date; months integer;
begin
  actor:=public.require_family_member(p_family);
  if p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or left(p_month,4)::integer<1900 then raise exception '올바른 적용월이 필요합니다.'; end if;
  month_date:=(p_month||'-01')::date;
  for rule in select distinct on(rule_id) * from public.recurring_versions where family_id=p_family and effective_month<=p_month order by rule_id,effective_month desc,revision desc loop
    months:=(extract(year from month_date)::int-extract(year from (rule.start_month||'-01')::date)::int)*12+extract(month from month_date)::int-extract(month from (rule.start_month||'-01')::date)::int;
    select * into occurrence from public.recurrence_occurrences where rule_id=rule.rule_id and month=p_month;
    if not rule.enabled or p_month<rule.start_month or (rule.end_month is not null and p_month>rule.end_month) or months%rule.interval_months<>0 then
      if occurrence.transaction_id is not null and not occurrence.skipped then
        update public.transactions set status='cancelled',version=version+1,updated_by=actor,updated_at=now()
        where id=occurrence.transaction_id and status='planned' and not user_modified and deleted_at is null;
      end if;
      continue;
    end if;
    occurrence_date:=month_date+(least(rule.day,extract(day from (month_date+interval '1 month - 1 day'))::integer)-1);
    if occurrence.transaction_id is null then
      new_id:=gen_random_uuid();
      insert into public.transactions(id,family_id,date,owner,kind,category_id,description,amount,planned_amount,payment_method_id,account_id,status,recurrence_rule_id,recurrence_version_id,created_by,updated_by)
      values(new_id,p_family,occurrence_date,rule.owner,rule.kind,rule.category_id,rule.name,rule.amount,rule.amount,rule.payment_method_id,rule.account_id,'planned',rule.rule_id,rule.id,actor,actor);
      insert into public.recurrence_occurrences(family_id,rule_id,month,transaction_id) values(p_family,rule.rule_id,p_month,new_id);
      n:=n+1;
    elsif not occurrence.skipped then
      select * into tx from public.transactions where id=occurrence.transaction_id;
      if tx.status='planned' and not tx.user_modified and tx.deleted_at is null and tx.recurrence_version_id<>rule.id then
        update public.transactions set date=occurrence_date,owner=rule.owner,kind=rule.kind,category_id=rule.category_id,description=rule.name,
          amount=rule.amount,planned_amount=rule.amount,payment_method_id=rule.payment_method_id,account_id=rule.account_id,recurrence_version_id=rule.id,
          version=version+1,updated_by=actor,updated_at=now() where id=tx.id;
      end if;
    end if;
    occurrence:=null;
  end loop;
  return n;
end $$;

create function public.save_recurring_rule(p_family uuid,p_request uuid,p_rule jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; logical_id uuid; revision integer; current_month text; expected uuid; latest uuid; hash text; prior public.save_requests%rowtype;
begin
  actor:=public.require_family_member(p_family); current_month:=to_char(now() at time zone 'Asia/Seoul','YYYY-MM');
  hash:=encode(extensions.digest(p_rule::text,'sha256'),'hex');
  select * into prior from public.save_requests where family_id=p_family and request_id=p_request;
  if found then if prior.payload_hash<>hash then raise exception '재시도 규칙 내용이 바뀌었습니다.' using errcode='40001'; end if; return (prior.result->>'rule_id')::uuid; end if;
  if p_rule->>'effective_month' is null or p_rule->>'effective_month' !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception '적용 시작월을 확인하세요.'; end if;
  logical_id:=nullif(p_rule->>'rule_id','')::uuid;
  if logical_id is null then
    logical_id:=gen_random_uuid(); insert into public.recurring_rules(id,family_id,created_by) values(logical_id,p_family,actor); revision:=1;
  else
    if p_rule->>'effective_month'<current_month then raise exception '기존 규칙의 변경은 이번 달 이후에 적용하세요.'; end if;
    if not exists(select 1 from public.recurring_rules where id=logical_id and family_id=p_family) then raise exception '규칙에 접근할 수 없습니다.' using errcode='42501'; end if;
    select id,recurring_versions.revision+1 into latest,revision from public.recurring_versions where rule_id=logical_id order by recurring_versions.revision desc limit 1;
    expected:=nullif(p_rule->>'id','')::uuid;
    if expected is distinct from latest then raise exception '고정비 규칙이 변경되었습니다. 최신 규칙을 다시 불러오세요.' using errcode='40001'; end if;
    if exists(select 1 from public.recurring_versions where rule_id=logical_id and effective_month>p_rule->>'effective_month') then raise exception '이미 예약된 변경월 이후로 적용월을 지정하세요.'; end if;
  end if;
  if not exists(select 1 from public.categories where family_id=p_family and id=(p_rule->>'category_id')::uuid and kind=p_rule->>'kind') then raise exception '규칙의 분류를 확인하세요.'; end if;
  insert into public.recurring_versions(family_id,rule_id,revision,effective_month,name,owner,kind,category_id,amount,payment_method_id,account_id,interval_months,day,start_month,end_month,enabled,created_by)
  values(p_family,logical_id,revision,p_rule->>'effective_month',trim(p_rule->>'name'),p_rule->>'owner',p_rule->>'kind',(p_rule->>'category_id')::uuid,(p_rule->>'amount')::bigint,
    (p_rule->>'payment_method_id')::uuid,(p_rule->>'account_id')::uuid,(p_rule->>'interval_months')::integer,(p_rule->>'day')::integer,p_rule->>'start_month',nullif(p_rule->>'end_month',''),(p_rule->>'enabled')::boolean,actor);
  insert into public.save_requests values(p_family,p_request,hash,jsonb_build_object('rule_id',logical_id),actor,now());
  return logical_id;
end $$;

create function public.save_budgets(p_family uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; item jsonb; prior public.save_requests%rowtype; hash text; result jsonb; saved integer:=0;
begin
  actor:=public.require_family_member(p_family); hash:=encode(extensions.digest(p_payload::text,'sha256'),'hex');
  select * into prior from public.save_requests where family_id=p_family and request_id=p_request;
  if found then if prior.payload_hash<>hash then raise exception '저장 내용이 바뀌었습니다.' using errcode='40001'; end if; return prior.result; end if;
  if jsonb_typeof(p_payload->'budgets') is distinct from 'array' or jsonb_array_length(p_payload->'budgets')>1000 then raise exception '예산 목록을 확인하세요.'; end if;
  for item in select value from jsonb_array_elements(p_payload->'budgets') loop
    if not exists(select 1 from public.categories where id=(item->>'category_id')::uuid and family_id=p_family and kind in ('income','expense','saving','loan_principal')) then raise exception '수입·소비·배분 분류를 선택하세요.'; end if;
    if (item->>'version')::integer=0 then
      insert into public.monthly_budgets(id,family_id,month,owner,category_id,amount,label,created_by,updated_by)
      values((item->>'id')::uuid,p_family,item->>'month',item->>'owner',(item->>'category_id')::uuid,(item->>'amount')::bigint,coalesce(item->>'label',''),actor,actor);
    else
      update public.monthly_budgets set amount=(item->>'amount')::bigint,label=coalesce(item->>'label',''),category_id=(item->>'category_id')::uuid,owner=item->>'owner',version=version+1,updated_by=actor,updated_at=now()
      where id=(item->>'id')::uuid and family_id=p_family and month=item->>'month' and version=(item->>'version')::integer;
      if not found then raise exception '예산이 변경되었습니다. 최신 예산과 비교하세요.' using errcode='40001'; end if;
    end if; saved:=saved+1;
  end loop;
  result:=jsonb_build_object('saved',saved); insert into public.save_requests values(p_family,p_request,hash,result,actor,now()); return result;
end $$;

create function public.save_reference(p_family uuid,p_request uuid,p_type text,p_item jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; new_id uuid:=gen_random_uuid(); prior public.save_requests%rowtype; hash text; begin
  actor:=public.require_family_member(p_family);
  hash:=encode(extensions.digest(jsonb_build_object('type',p_type,'item',p_item)::text,'sha256'),'hex');
  select * into prior from public.save_requests where family_id=p_family and request_id=p_request;
  if found then if prior.payload_hash<>hash then raise exception '설정 저장 요청의 내용이 바뀌었습니다.' using errcode='40001'; end if; return (prior.result->>'id')::uuid; end if;
  if p_type='account' then insert into public.accounts(id,family_id,name,kind) values(new_id,p_family,trim(p_item->>'name'),p_item->>'kind');
  elsif p_type='method' then insert into public.payment_methods(id,family_id,name) values(new_id,p_family,trim(p_item->>'name'));
  elsif p_type='category' then
    if length(trim(p_item->>'major')) not between 1 and 80 or length(trim(p_item->>'minor')) not between 1 and 80 then raise exception '분류명을 1~80자로 입력하세요.'; end if;
    insert into public.categories(id,family_id,kind,major,minor) values(new_id,p_family,p_item->>'kind',trim(p_item->>'major'),trim(p_item->>'minor'));
  else raise exception '지원하지 않는 설정입니다.'; end if;
  insert into public.audit_log(family_id,entity,entity_id,action,after_data,actor_id) values(p_family,p_type,new_id,'INSERT',p_item,actor);
  insert into public.save_requests values(p_family,p_request,hash,jsonb_build_object('id',new_id),actor,now());
  return new_id;
end $$;

-- Explicit grants: clients cannot bypass validation, attribution, optimistic locking or auditing.
revoke all on function public.require_family_member(uuid),public.seed_family_defaults(),public.audit_transaction() from public,anon,authenticated;
revoke all on function public.is_family_member(uuid) from public,anon;
grant execute on function public.is_family_member(uuid) to authenticated;
revoke all on function public.save_transactions(uuid,uuid,jsonb),public.ensure_recurring_month(uuid,text),public.save_recurring_rule(uuid,uuid,jsonb),public.save_budgets(uuid,uuid,jsonb),public.save_reference(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.save_transactions(uuid,uuid,jsonb),public.ensure_recurring_month(uuid,text),public.save_recurring_rule(uuid,uuid,jsonb),public.save_budgets(uuid,uuid,jsonb),public.save_reference(uuid,uuid,text,jsonb) to authenticated;
commit;
