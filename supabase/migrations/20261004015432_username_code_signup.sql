create schema if not exists ledger_private;
revoke all on schema ledger_private from public, anon, authenticated;
create table ledger_private.signup_codes (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id),
 code_hash text not null unique check(code_hash ~ '^[0-9a-f]{64}$'), active boolean not null default true,
 max_uses integer check(max_uses>0), use_count integer not null default 0 check(use_count>=0),
 allowed_username text, expires_at timestamptz, created_at timestamptz not null default now()
);
create table ledger_private.signup_requests (
 ticket uuid primary key default gen_random_uuid(), code_id uuid not null references ledger_private.signup_codes(id),
 username text not null unique check(username ~ '^[a-z0-9][a-z0-9_]{2,23}$'),
 display_name text not null check(length(display_name) between 1 and 30),
 user_id uuid unique references auth.users(id) on delete cascade,
 expires_at timestamptz not null default (now()+interval '5 minutes')
);
create table ledger_private.signup_attempts (
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'), bucket timestamptz not null,
 attempts integer not null default 1, primary key(fingerprint,bucket)
);
alter table ledger_private.signup_codes enable row level security;
alter table ledger_private.signup_requests enable row level security;
alter table ledger_private.signup_attempts enable row level security;
revoke all on all tables in schema ledger_private from public,anon,authenticated,service_role;
create index signup_codes_family on ledger_private.signup_codes(family_id);
create index signup_requests_code on ledger_private.signup_requests(code_id);

create function public.check_signup_rate(p_fingerprint text) returns boolean
language plpgsql security definer set search_path='' as $$
declare count_now integer; period timestamptz:=to_timestamp(floor(extract(epoch from now())/600)*600);
begin
 if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then return false; end if;
 delete from ledger_private.signup_attempts where bucket<now()-interval '1 day';
 insert into ledger_private.signup_attempts(fingerprint,bucket) values(p_fingerprint,period)
 on conflict(fingerprint,bucket) do update set attempts=ledger_private.signup_attempts.attempts+1
 returning attempts into count_now;
 return count_now<=10;
end $$;

create function public.prepare_signup(p_code text,p_username text,p_display_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation ledger_private.signup_codes%rowtype; new_ticket uuid; normalized text:=lower(trim(p_username));
begin
 if p_code is null or length(p_code)>128 then return jsonb_build_object('error','invalid_code'); end if;
 select * into invitation from ledger_private.signup_codes
 where code_hash=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex') for update;
 if not found or not invitation.active or (invitation.expires_at is not null and invitation.expires_at<=now())
    or (invitation.max_uses is not null and invitation.use_count>=invitation.max_uses)
    or (invitation.allowed_username is not null and invitation.allowed_username<>normalized)
 then return jsonb_build_object('error','invalid_code'); end if;
 if normalized is null or normalized !~ '^[a-z0-9][a-z0-9_]{2,23}$'
    or p_display_name is null or length(trim(p_display_name)) not between 1 and 30
 then return jsonb_build_object('error','invalid_input'); end if;
 if exists(select 1 from auth.users where lower(email)=normalized||'@id.money.invalid') then return jsonb_build_object('error','username_taken'); end if;
 delete from ledger_private.signup_requests where user_id is null and expires_at<=now();
 insert into ledger_private.signup_requests(code_id,username,display_name)
 values(invitation.id,normalized,trim(p_display_name)) on conflict(username) do nothing returning ticket into new_ticket;
 if new_ticket is null then return jsonb_build_object('error','username_taken'); end if;
 return jsonb_build_object('ticket',new_ticket,'email',normalized||'@id.money.invalid');
end $$;

create function public.cancel_signup(p_ticket uuid) returns void
language sql security definer set search_path='' as $$
 delete from ledger_private.signup_requests where ticket=p_ticket and user_id is null;
$$;

create function ledger_private.enroll_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare ticket_text text:=new.raw_app_meta_data->>'ledger_signup_ticket';
 registration ledger_private.signup_requests%rowtype; invitation ledger_private.signup_codes%rowtype; member_role text;
begin
 -- Trusted database administrators may create disposable SQL test fixtures.
 -- Supabase Auth's own connections cannot use this exception.
 if ticket_text is null and session_user='postgres' and current_setting('role',true) in ('none','postgres') then return new; end if;
 if ticket_text is null or ticket_text !~ '^[0-9a-fA-F-]{36}$' then raise exception '회원가입 코드가 필요한 서비스입니다.' using errcode='42501'; end if;
 select * into registration from ledger_private.signup_requests where ticket=ticket_text::uuid;
 if not found or registration.user_id is not null or registration.expires_at<=now()
    or lower(new.email) is distinct from registration.username||'@id.money.invalid'
 then raise exception '유효한 회원가입 승인이 필요합니다.' using errcode='42501'; end if;
 select * into invitation from ledger_private.signup_codes where id=registration.code_id for update;
 if not found or not invitation.active or (invitation.expires_at is not null and invitation.expires_at<=now())
    or (invitation.max_uses is not null and invitation.use_count>=invitation.max_uses)
    or (invitation.allowed_username is not null and invitation.allowed_username<>registration.username)
 then raise exception '회원가입 코드가 만료되었거나 사용 중지되었습니다.' using errcode='42501'; end if;
 select * into registration from ledger_private.signup_requests where ticket=ticket_text::uuid for update;
 if not found or registration.user_id is not null or registration.expires_at<=now() then raise exception '유효한 회원가입 승인이 필요합니다.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(invitation.family_id::text,0));
 member_role:=case when exists(select 1 from public.family_members where family_id=invitation.family_id and role='owner' and active) then 'editor' else 'owner' end;
 insert into public.family_members(family_id,user_id,display_name,role)
 values(invitation.family_id,new.id,registration.display_name,member_role);
 update ledger_private.signup_requests set user_id=new.id where ticket=registration.ticket;
 update ledger_private.signup_codes set use_count=use_count+1 where id=invitation.id;
 return new;
end $$;
create trigger ledger_signup_enrollment after insert on auth.users for each row execute function ledger_private.enroll_signup();
revoke all on function ledger_private.enroll_signup() from public,anon,authenticated,service_role;
revoke all on function public.check_signup_rate(text),public.prepare_signup(text,text,text),public.cancel_signup(uuid) from public,anon,authenticated;
grant execute on function public.check_signup_rate(text),public.prepare_signup(text,text,text),public.cancel_signup(uuid) to service_role;

