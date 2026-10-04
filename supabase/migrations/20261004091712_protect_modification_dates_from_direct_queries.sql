revoke select on public.transactions from authenticated,anon,public;
revoke select(updated_at) on public.transactions from authenticated,anon,public;
grant select(id,family_id,date,owner,kind,category_id,description,amount,payment_method_id,account_id,target_account_id,status,memo,planned_amount,original_transaction_id,recurrence_rule_id,recurrence_version_id,user_modified,source_namespace,source_id,version,created_by,updated_by,created_at,deleted_at) on public.transactions to authenticated;
revoke select on public.assets from authenticated,anon,public;
revoke select(updated_at) on public.assets from authenticated,anon,public;
grant select(id,family_id,name,owner,kind,basis_date,balance,accounting,account_id,history_complete,memo,version,created_by,updated_by,created_at,deleted_at) on public.assets to authenticated;
revoke select on public.monthly_budgets from authenticated,anon,public;
revoke select(updated_at) on public.monthly_budgets from authenticated,anon,public;
grant select(id,family_id,month,owner,category_id,amount,label,version,created_by,updated_by,created_at) on public.monthly_budgets to authenticated;
-- Before/after audit JSON and saved RPC results can contain protected timestamps.
alter policy family_read on public.audit_log using (public.is_family_member(family_id) and public.can_view_modification_dates(family_id));
alter policy family_read on public.save_requests using (public.is_family_member(family_id) and public.can_view_modification_dates(family_id));
notify pgrst,'reload schema';

-- The privileged lookup lives outside the exposed API schema.
create or replace function ledger_private.visible_modification_date(p_family uuid,p_entity text,p_id uuid)
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
revoke all on function ledger_private.visible_modification_date(uuid,text,uuid) from public,anon;
grant usage on schema ledger_private to authenticated,service_role;
grant execute on function ledger_private.visible_modification_date(uuid,text,uuid) to authenticated,service_role;
create or replace function public.visible_modification_date(p_family uuid,p_entity text,p_id uuid)
returns timestamptz language sql stable security invoker set search_path=''
as $$ select ledger_private.visible_modification_date(p_family,p_entity,p_id); $$;
notify pgrst,'reload schema';
