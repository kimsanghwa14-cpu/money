create or replace function ledger_private.enroll_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare registration ledger_private.signup_requests%rowtype; invitation ledger_private.signup_codes%rowtype; member_role text;
begin
 -- Trusted database administrators may create disposable SQL test fixtures.
 -- Supabase Auth's own connections cannot use this exception.
 -- Auth applies app_metadata after INSERT. Bind the reservation to the UUID
 -- chosen by our server through the privileged Admin API instead. Public Auth
 -- signup does not accept a user-supplied UUID. Metadata cannot authorize it.
 select * into registration from ledger_private.signup_requests where ticket=new.id;
 if not found and new.raw_app_meta_data->>'ledger_signup_ticket' is null
    and session_user='postgres' and current_setting('role',true) in ('none','postgres') then return new; end if;
 if not found or registration.user_id is not null or registration.expires_at<=now()
    or lower(new.email) is distinct from registration.username||'@id.money.invalid'
 then raise exception '유효한 회원가입 승인이 필요합니다.' using errcode='42501'; end if;
 select * into invitation from ledger_private.signup_codes where id=registration.code_id for update;
 if not found or not invitation.active or (invitation.expires_at is not null and invitation.expires_at<=now())
    or (invitation.max_uses is not null and invitation.use_count>=invitation.max_uses)
    or (invitation.allowed_username is not null and invitation.allowed_username<>registration.username)
 then raise exception '회원가입 코드가 만료되었거나 사용 중지되었습니다.' using errcode='42501'; end if;
 select * into registration from ledger_private.signup_requests where ticket=new.id for update;
 if not found or registration.user_id is not null or registration.expires_at<=now() then raise exception '유효한 회원가입 승인이 필요합니다.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(invitation.family_id::text,0));
 member_role:=case when exists(select 1 from public.family_members where family_id=invitation.family_id and role='owner' and active) then 'editor' else 'owner' end;
 insert into public.family_members(family_id,user_id,display_name,role)
 values(invitation.family_id,new.id,registration.display_name,member_role);
 update ledger_private.signup_requests set user_id=new.id where ticket=registration.ticket;
 update ledger_private.signup_codes set use_count=use_count+1 where id=invitation.id;
 return new;
end $$;
