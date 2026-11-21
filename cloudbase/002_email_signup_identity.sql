begin;

-- CloudBase's email OTP signup records created_from='email' but can leave
-- email_verified NULL. Both fields are written by the authentication service.
create or replace function cozy_days_private.require_user()
returns text language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  actor text := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true'
     or actor is null
     or not exists (
       select 1 from auth.users u
       where u.id::text = actor and nullif(btrim(u.email), '') is not null
         and (u.email_verified is true or (u.email_verified is null and u.created_from = 'email'))
     ) then
    raise exception 'COZY_AUTH_REQUIRED' using errcode = '42501';
  end if;
  return actor;
end
$$;

revoke all on function cozy_days_private.require_user() from public, anon, authenticated;
commit;
