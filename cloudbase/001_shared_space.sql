begin;

-- These tables have no Data API grants. Only the authenticated RPCs below can use them.
create schema if not exists cozy_days_private;
revoke all on schema cozy_days_private from public, anon, authenticated;

create table if not exists cozy_days_private.space (
  id uuid primary key,
  revision bigint not null default 0
);
insert into cozy_days_private.space(id) values ('cf1390bd-8749-4c04-a975-c4994c871f62')
on conflict do nothing;

create table if not exists cozy_days_private.seat (
  space_id uuid not null references cozy_days_private.space(id),
  position smallint not null check (position in (1, 2)),
  user_id bigint unique references auth.users(id),
  invitation bytea unique,
  expires_at timestamptz,
  primary key (space_id, position)
);
insert into cozy_days_private.seat(space_id, position)
select 'cf1390bd-8749-4c04-a975-c4994c871f62', n from generate_series(1, 2) n
on conflict do nothing;

create table if not exists cozy_days_private.record (
  space_id uuid not null references cozy_days_private.space(id),
  owner text not null,
  kind text not null,
  record_id text not null,
  version bigint not null,
  value jsonb,
  primary key (space_id, owner, kind, record_id),
  unique (space_id, version)
);
create unique index if not exists cozy_days_category_name
on cozy_days_private.record (space_id, owner, (value->>'key'))
where kind = 'category' and value is not null;

create table if not exists cozy_days_private.receipt (
  user_id varchar(64) not null,
  operation text not null,
  request_hash bytea not null,
  result jsonb not null,
  primary key (user_id, operation)
);
alter table cozy_days_private.space enable row level security;
alter table cozy_days_private.seat enable row level security;
alter table cozy_days_private.record enable row level security;
alter table cozy_days_private.receipt enable row level security;

create or replace function cozy_days_private.require_user()
returns text language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  actor text := auth.uid();
begin
  if coalesce(auth.role(), '') <> 'authenticated' or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true'
     or actor is null
     or not exists (select 1 from auth.users u where u.id::text = actor and u.email_verified is true) then
    raise exception 'COZY_AUTH_REQUIRED' using errcode = '42501';
  end if;
  return actor;
end
$$;

create or replace function public.cozy_days_space(p_invite text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor text := cozy_days_private.require_user();
  room constant uuid := 'cf1390bd-8749-4c04-a975-c4994c871f62';
  membership smallint;
  next_revision bigint;
  defaults jsonb;
begin
  if p_invite is not null then
    -- Serialize seat claims and keep an already joined account idempotent.
    perform 1 from cozy_days_private.space where id = room for update;
  end if;
  select position into membership from cozy_days_private.seat where user_id = actor::bigint and space_id = room;
  if membership is null and p_invite is not null then
    if p_invite !~ '^[0-9a-f]{32}$' then
      raise exception 'COZY_INVITE_INVALID' using errcode = '22023';
    end if;
    update cozy_days_private.seat set user_id = actor::bigint, invitation = null, expires_at = null
      where space_id = room and user_id is null and expires_at > now()
        and invitation = sha256(convert_to(p_invite, 'UTF8'))
      returning position into membership;
    if membership is null then
      raise exception 'COZY_INVITE_INVALID' using errcode = '22023';
    end if;
    for defaults in select item from jsonb_array_elements('[
      {"id":"work","name":"工作","key":"工作","builtin":true,"createdAt":0},
      {"id":"life","name":"生活","key":"生活","builtin":true,"createdAt":1},
      {"id":"study","name":"学习","key":"学习","builtin":true,"createdAt":2},
      {"id":"shopping","name":"购物","key":"购物","builtin":true,"createdAt":3}
    ]'::jsonb) item loop
      update cozy_days_private.space set revision = revision + 1 where id = room returning revision into next_revision;
      insert into cozy_days_private.record(space_id, owner, kind, record_id, version, value)
      values (room, actor, 'category', defaults->>'id', next_revision, defaults);
    end loop;
  end if;
  if membership is null then return null; end if;
  return jsonb_build_object('spaceId', room, 'userId', actor, 'members',
    (select count(*) from cozy_days_private.seat where space_id = room and user_id is not null));
end
$$;

create or replace function cozy_days_private.check_space(p_user text, p_space uuid)
returns text language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  actor text := cozy_days_private.require_user();
begin
  if actor is distinct from p_user or not exists (
    select 1 from cozy_days_private.seat where user_id = actor::bigint and space_id = p_space
  ) then
    raise exception 'COZY_SPACE_REQUIRED' using errcode = '42501';
  end if;
  return actor;
end
$$;

create or replace function public.cozy_days_pull(p_user text, p_space uuid, p_after bigint)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare
  actor text := cozy_days_private.check_space(p_user, p_space);
  shared_owner constant text := '';
begin
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'kind', r.kind, 'id', r.record_id, 'version', r.version, 'value', r.value
  ) order by r.version), '[]'::jsonb)
  from (
    select kind, record_id, version, value from cozy_days_private.record
    where space_id = p_space and owner in (shared_owner, actor) and version > p_after
    order by version limit 16
  ) r);
end
$$;

create or replace function cozy_days_private.valid_day(value text)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
begin
  return coalesce(value ~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' and value::date::text = value, false);
exception when datetime_field_overflow or invalid_datetime_format then
  return false;
end
$$;

create or replace function cozy_days_private.validate_record(kind text, record_id text, value jsonb)
returns text language plpgsql immutable set search_path = pg_catalog as $$
declare
  entry jsonb;
  last_end text := '';
  ids text[] := '{}';
  valid boolean;
begin
  if octet_length(value::text) > 650000 then return 'invalid'; end if;
  if kind = 'periods' then
    if record_id <> 'main' or jsonb_typeof(value) <> 'array' then return 'invalid'; end if;
    for entry in select item from jsonb_array_elements(value) item order by item->>'start' loop
      if coalesce(length(entry->>'id'), 0) not between 1 and 128 or entry->>'id' = any(ids)
        or not cozy_days_private.valid_day(entry->>'start')
        or (entry ? 'end' and (not cozy_days_private.valid_day(entry->>'end') or entry->>'end' < entry->>'start')) then
        return 'invalid';
      end if;
      if last_end is null or last_end >= entry->>'start' then return 'period'; end if;
      last_end := entry->>'end';
      ids := array_append(ids, entry->>'id');
    end loop;
    return null;
  end if;
  if jsonb_typeof(value) <> 'object' then return 'invalid'; end if;
  case kind
    when 'day' then
      valid := cozy_days_private.valid_day(record_id) and value->>'date' = record_id
        and jsonb_typeof(value->'symptoms') = 'array'
        and not jsonb_path_exists(value, '$.symptoms[*] ? (@.type() != "string")')
        and (not value ? 'flow' or jsonb_typeof(value->'flow') = 'string')
        and (not value ? 'mood' or jsonb_typeof(value->'mood') = 'string');
    when 'cycle' then
      valid := record_id = 'main' and value->>'cycleLength' ~ '^[0-9]{2}$'
        and value->>'periodLength' ~ '^[0-9]{1,2}$'
        and (value->>'cycleLength')::int between 15 and 90 and (value->>'periodLength')::int between 1 and 15
        and jsonb_typeof(value->'cycleLength') = 'number' and jsonb_typeof(value->'periodLength') = 'number';
    when 'category' then
      valid := value->>'id' = record_id and record_id <> 'all' and length(value->>'name') between 1 and 16
        and length(value->>'key') between 1 and 64 and value->>'key' <> '全部'
        and jsonb_typeof(value->'createdAt') = 'number' and jsonb_typeof(value->'builtin') = 'boolean';
    else
      valid := record_id ~ '^[1-9][0-9]{0,15}$' and record_id::bigint <= 4503599627370495
        and value->>'id' = record_id and jsonb_typeof(value->'id') = 'number'
        and cozy_days_private.valid_day(value->>'date') and jsonb_typeof(value->'createdAt') = 'number';
      if kind = 'todo' then
        valid := valid and jsonb_typeof(value->'text') = 'string' and jsonb_typeof(value->'completed') = 'boolean';
      else
        valid := valid and length(btrim(value->>'name')) between 1 and 60 and length(value->>'note') <= 500
          and length(value->>'icon') <= 16 and value->>'theme' in ('生活','恋爱','生日','宠物','成长')
          and value->>'color' in ('pink','yellow','lavender','mint')
          and jsonb_typeof(value->'yearly') = 'boolean' and jsonb_typeof(value->'updatedAt') = 'number'
          and (not value ? 'timingMode' or value->>'timingMode' in ('countdown','cumulative'))
          and (not value ? 'backgroundImage' or
            (length(value->>'backgroundImage') <= 600000 and value->>'backgroundImage' ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$'));
      end if;
  end case;
  return case when valid then null else 'invalid' end;
exception when invalid_text_representation or numeric_value_out_of_range then
  return 'invalid';
end
$$;

create or replace function public.cozy_days_push(
  p_user text, p_space uuid, p_kind text, p_id text, p_operation text, p_base bigint, p_value jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor text := cozy_days_private.check_space(p_user, p_space);
  record_owner text;
  previous cozy_days_private.record%rowtype;
  acknowledged cozy_days_private.receipt%rowtype;
  next_revision bigint;
  fingerprint bytea := sha256(convert_to(jsonb_build_array(p_space, p_kind, p_id, p_base, p_value)::text, 'UTF8'));
  result jsonb;
  reason text;
begin
  if p_kind is null or p_kind not in ('todo', 'category', 'anniversary', 'periods', 'day', 'cycle')
    or p_id is null or length(p_id) not between 1 and 128
    or (p_kind in ('periods', 'cycle') and p_id <> 'main')
    or p_operation is null or p_operation !~ '^[0-9a-f]{32}$'
    or p_base is null or p_base < 0 then
    raise exception 'COZY_BAD_OPERATION' using errcode = '22023';
  end if;
  if p_value = 'null'::jsonb then p_value := null; end if;
  record_owner := case when p_kind in ('todo', 'category') then actor
    else '' end;

  -- Versions follow commit order for this space. Pull cursors cannot skip a late commit.
  perform 1 from cozy_days_private.space where id = p_space for update;
  select * into previous from cozy_days_private.record
    where space_id = p_space and owner = record_owner and kind = p_kind and record_id = p_id;
  select * into acknowledged from cozy_days_private.receipt where user_id = actor and operation = p_operation;
  if found then
    if acknowledged.request_hash <> fingerprint then
      raise exception 'COZY_OPERATION_REUSED' using errcode = '22023';
    end if;
    if acknowledged.result->>'status' = 'applied' then
      return acknowledged.result || jsonb_build_object('value', p_value);
    end if;
    return acknowledged.result || jsonb_build_object('version', coalesce(previous.version, 0), 'value', previous.value);
  end if;

  if coalesce(previous.version, 0) <> p_base and previous.value is distinct from p_value then
    reason := 'version';
  elsif p_value is not null then
    reason := cozy_days_private.validate_record(p_kind, p_id, p_value);
    if reason is null and p_kind = 'category' and exists (
      select 1 from cozy_days_private.record where space_id = p_space and owner = actor
        and kind = 'category' and record_id <> p_id and value->>'key' = p_value->>'key'
    ) then reason := 'category'; end if;
  end if;

  if reason is not null then
    result := jsonb_build_object('status', 'conflict', 'reason', reason, 'version', coalesce(previous.version, 0), 'value', previous.value);
  elsif previous.version is not null and previous.value is not distinct from p_value then
    result := jsonb_build_object('status', 'applied', 'version', previous.version, 'value', previous.value);
  else
    update cozy_days_private.space set revision = revision + 1 where id = p_space returning revision into next_revision;
    insert into cozy_days_private.record(space_id, owner, kind, record_id, version, value)
      values (p_space, record_owner, p_kind, p_id, next_revision, p_value)
      on conflict (space_id, owner, kind, record_id) do update set version = excluded.version, value = excluded.value;
    result := jsonb_build_object('status', 'applied', 'version', next_revision, 'value', p_value);
  end if;
  insert into cozy_days_private.receipt(user_id, operation, request_hash, result)
    values (actor, p_operation, fingerprint, result - 'value');
  return result;
end
$$;

revoke all on all tables in schema cozy_days_private from public, anon, authenticated;
revoke all on all functions in schema cozy_days_private from public, anon, authenticated;
revoke all on function public.cozy_days_space(text),
  public.cozy_days_pull(text, uuid, bigint),
  public.cozy_days_push(text, uuid, text, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.cozy_days_space(text),
  public.cozy_days_pull(text, uuid, bigint),
  public.cozy_days_push(text, uuid, text, text, text, bigint, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
