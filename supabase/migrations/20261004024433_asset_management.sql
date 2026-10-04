alter table public.assets add column deleted_at timestamptz;
create index assets_family_active on public.assets(family_id,kind,name,id) where deleted_at is null;

create function public.save_assets(p_family uuid,p_request uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; item jsonb; row_id uuid; expected integer; before_row public.assets%rowtype; after_row public.assets%rowtype;
 previous public.save_requests%rowtype; payload_hash text; changed uuid[]:='{}'; result jsonb;
begin
 actor:=public.require_family_member(p_family);
 if p_request is null or jsonb_typeof(p_payload->'upserts') is distinct from 'array' or jsonb_typeof(p_payload->'deletes') is distinct from 'array'
    or jsonb_array_length(p_payload->'upserts')+jsonb_array_length(p_payload->'deletes') not between 1 and 1000
 then raise exception '1~1,000개 이내의 올바른 자산 변경 요청이 필요합니다.'; end if;
 payload_hash:=encode(extensions.digest(jsonb_build_object('operation','assets','payload',p_payload)::text,'sha256'),'hex');
 select * into previous from public.save_requests where family_id=p_family and request_id=p_request;
 if found then
  if previous.payload_hash<>payload_hash then raise exception '재시도 내용이 바뀌었습니다. 새 저장 요청이 필요합니다.' using errcode='40001'; end if;
  return previous.result;
 end if;
 for item in select value from jsonb_array_elements(p_payload->'upserts') loop
  if jsonb_typeof(item) is distinct from 'object' then raise exception '자산 정보 형식을 확인하세요.'; end if;
  row_id:=(item->>'id')::uuid; expected:=(item->>'version')::integer;
  if row_id is null or expected is null or expected<0 or row_id=any(changed) then raise exception '항목 ID·버전과 중복 변경 여부를 확인하세요.'; end if;
  if item->>'name' is null or length(trim(item->>'name')) not between 1 and 120
     or item->>'owner' is null or item->>'owner' not in ('상화','하율','기타')
     or item->>'kind' is null or item->>'kind' not in ('deposit','pension','investment','other','loan')
     or item->>'basis_date' is null or item->>'basis_date' !~ '^\d{4}-\d{2}-\d{2}$'
     or item->>'balance' is null or item->>'balance' !~ '^\d+$'
     or (item->>'balance')::numeric not between 0 and 1000000000000
     or length(coalesce(item->>'memo',''))>500
  then raise exception '항목명·귀속·종류·기준일·잔액·메모를 확인하세요.'; end if;
  if (item->>'basis_date')::date not between '1900-01-01'::date and '9999-12-31'::date then raise exception '기준일은 1900~9999년이어야 합니다.'; end if;
  select * into before_row from public.assets where id=row_id for update;
  if found then
   if before_row.family_id<>p_family or before_row.deleted_at is not null or before_row.version<>expected then
    raise exception '다른 사용자가 변경한 항목입니다. 입력을 보존한 뒤 최신 내역을 확인하세요.' using errcode='40001';
   end if;
   if before_row.accounting<>'manual' then raise exception '원장 연결 항목은 수동 잔액으로 변경할 수 없습니다.'; end if;
   update public.assets set name=trim(item->>'name'),owner=item->>'owner',kind=item->>'kind',basis_date=(item->>'basis_date')::date,
    balance=(item->>'balance')::bigint,memo=coalesce(item->>'memo',''),version=version+1,updated_by=actor,updated_at=clock_timestamp()
    where id=row_id returning * into after_row;
  else
   if expected<>0 then raise exception '수정할 항목을 찾을 수 없습니다.' using errcode='40001'; end if;
   insert into public.assets(id,family_id,name,owner,kind,basis_date,balance,accounting,history_complete,memo,created_by,updated_by)
    values(row_id,p_family,trim(item->>'name'),item->>'owner',item->>'kind',(item->>'basis_date')::date,(item->>'balance')::bigint,'manual',false,coalesce(item->>'memo',''),actor,actor)
    returning * into after_row;
  end if;
  insert into public.audit_log(family_id,entity,entity_id,action,before_data,after_data,actor_id)
   values(p_family,'assets',row_id,case when before_row.id is null then 'INSERT' else 'UPDATE' end,
    case when before_row.id is null then null else to_jsonb(before_row) end,to_jsonb(after_row),actor);
  changed:=array_append(changed,row_id);
 end loop;
 for item in select value from jsonb_array_elements(p_payload->'deletes') loop
  row_id:=(item->>'id')::uuid; expected:=(item->>'version')::integer;
  if row_id is null or expected is null or expected<1 or row_id=any(changed) then raise exception '삭제 ID·버전과 중복 여부를 확인하세요.'; end if;
  select * into before_row from public.assets where id=row_id and family_id=p_family and deleted_at is null for update;
  if not found or before_row.version<>expected then raise exception '삭제 대상이 변경되었습니다. 최신 내역을 확인하세요.' using errcode='40001'; end if;
  update public.assets set deleted_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=actor,version=version+1 where id=row_id returning * into after_row;
  insert into public.audit_log(family_id,entity,entity_id,action,before_data,after_data,actor_id)
   values(p_family,'assets',row_id,'DELETE',to_jsonb(before_row),to_jsonb(after_row),actor);
  changed:=array_append(changed,row_id);
 end loop;
 result:=jsonb_build_object('request_id',p_request,'saved',cardinality(changed),'ids',changed);
 insert into public.save_requests(family_id,request_id,payload_hash,result,created_by) values(p_family,p_request,payload_hash,result,actor);
 return result;
end $$;
revoke all on function public.save_assets(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_assets(uuid,uuid,jsonb) to authenticated;
