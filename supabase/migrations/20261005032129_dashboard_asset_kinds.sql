-- Extend explicit asset classifications. Existing rows and balances stay unchanged.
alter table public.assets drop constraint assets_kind_check;
alter table public.assets add constraint assets_kind_check check(kind in ('deposit','pension','investment','other','loan','savings','bank_deposit','stock','cash'));
-- Retain the deployed RPC's concurrency, family, audit and permission checks.
do $migration$
declare definition text; old_list text := '(''deposit'',''pension'',''investment'',''other'',''loan'')';
begin
 definition := pg_get_functiondef('public.save_assets(uuid,uuid,jsonb)'::regprocedure);
 if position(old_list in definition) = 0 then raise exception 'Asset validation changed; review the deployed RPC before extending kinds'; end if;
 definition := replace(definition, old_list, '(''deposit'',''pension'',''investment'',''other'',''loan'',''savings'',''bank_deposit'',''stock'',''cash'')');
 execute definition;
end $migration$;
