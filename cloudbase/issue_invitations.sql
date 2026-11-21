-- Run as the database administrator. Keep the result private.
-- Re-running rotates codes for empty seats only.
with codes as materialized (
  select space_id, position, replace(gen_random_uuid()::text, '-', '') as code
  from cozy_days_private.seat where user_id is null
), issued as (
  update cozy_days_private.seat s
  set invitation = sha256(convert_to(c.code, 'UTF8')), expires_at = now() + interval '7 days'
  from codes c
  where s.space_id = c.space_id and s.position = c.position and s.user_id is null
  returning s.position, s.expires_at, c.code
)
select * from issued order by position;
