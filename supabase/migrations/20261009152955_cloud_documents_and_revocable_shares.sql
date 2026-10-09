-- Staged only. Apply to a dedicated, explicitly selected Supabase project.
-- No service_role/secret key is needed by this feature.
begin;

create schema if not exists mmap_private;
revoke all on schema mmap_private from public, anon, authenticated;
-- USAGE lets invoker wrappers call their specifically granted private helper.
-- mmap_private must NOT be added to the Data API exposed schemas.
grant usage on schema mmap_private to anon, authenticated;

-- Count the compact JSON representation without stripping whitespace inside
-- strings. JSONB adds one space after each colon and each container separator.
-- Numeric spelling may be longer than JSON.stringify, which is conservative.
create function mmap_private.compact_json_bytes(p_value jsonb) returns bigint
language sql immutable strict security invoker set search_path = '' as $$
  select octet_length(p_value::text)::bigint - coalesce(sum(
    case jsonb_typeof(v)
      when 'object' then greatest(2 * (select count(*) from jsonb_object_keys(v)) - 1, 0)
      when 'array' then greatest(jsonb_array_length(v) - 1, 0)
      else 0
    end), 0)::bigint
  from jsonb_path_query(p_value, 'strict $.** ? (@.type() == "object" || @.type() == "array")') as v;
$$;
revoke all on function mmap_private.compact_json_bytes(jsonb) from public, anon, authenticated;
grant execute on function mmap_private.compact_json_bytes(jsonb) to authenticated;

create function mmap_private.bounded_json_number(p_value jsonb, p_min numeric, p_max numeric) returns boolean
language sql immutable security invoker set search_path = '' as $$
  select case when jsonb_typeof(p_value) = 'number'
    then p_value::numeric between p_min and p_max else false end;
$$;
revoke all on function mmap_private.bounded_json_number(jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function mmap_private.bounded_json_number(jsonb, numeric, numeric) to authenticated;

-- Data API clients can write their own rows directly, so the database also
-- bounds the persisted structure. Full graph/design normalization still runs
-- on the Next API boundary before any owner or shared response is rendered.
create function mmap_private.valid_cloud_document_shape(p_value jsonb) returns boolean
language plpgsql immutable security invoker set search_path = '' as $$
declare n jsonb; e jsonb; s jsonb; m jsonb; p jsonb; k text;
  total_points integer := 0; erasure_points integer; ink jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'object'
    or jsonb_typeof(p_value->'title') is distinct from 'string'
    or jsonb_typeof(p_value->'nodes') is distinct from 'array'
    or jsonb_typeof(p_value->'edges') is distinct from 'array' then return false; end if;
  if p_value ? 'boardMode' and p_value->>'boardMode' not in ('map', 'blank') then return false; end if;
  if p_value->'boardMode' = 'null'::jsonb then return false; end if;
  if jsonb_array_length(p_value->'nodes') > 20000
    or (jsonb_array_length(p_value->'nodes') = 0 and p_value->>'boardMode' is distinct from 'blank') then return false; end if;
  for n in select value from jsonb_array_elements(p_value->'nodes') loop
    if jsonb_typeof(n) is distinct from 'object' or jsonb_typeof(n->'id') is distinct from 'string'
      or length(btrim(n->>'id')) = 0 or jsonb_typeof(n->'data') is distinct from 'object'
      or jsonb_typeof(n->'data'->'label') is distinct from 'string'
      or jsonb_typeof(n->'position') is distinct from 'object'
      or not mmap_private.bounded_json_number(n->'position'->'x', -1000000, 1000000)
      or not mmap_private.bounded_json_number(n->'position'->'y', -1000000, 1000000) then return false; end if;
    if n->'data' ? 'parentId' and jsonb_typeof(n->'data'->'parentId') not in ('string', 'null') then return false; end if;
    foreach k in array array['description','color','icon','emoji','link','linkedDocId','backDocId','backNodeId'] loop
      if n->'data' ? k and jsonb_typeof(n->'data'->k) is distinct from 'string' then return false; end if;
    end loop;
    foreach k in array array['collapsed','isRoot'] loop
      if n->'data' ? k and jsonb_typeof(n->'data'->k) is distinct from 'boolean' then return false; end if;
    end loop;
    if n->'data' ? 'tags' then
      if jsonb_typeof(n->'data'->'tags') is distinct from 'array' then return false; end if;
      if exists (select 1 from jsonb_array_elements(n->'data'->'tags') as tag where jsonb_typeof(tag) <> 'string') then return false; end if;
    end if;
    if n->'data' ? 'checklist' then
      if jsonb_typeof(n->'data'->'checklist') is distinct from 'array' then return false; end if;
      for e in select value from jsonb_array_elements(n->'data'->'checklist') loop
        if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string'
          or jsonb_typeof(e->'text') is distinct from 'string' or jsonb_typeof(e->'checked') is distinct from 'boolean' then return false; end if;
      end loop;
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_value->'nodes')) <> jsonb_array_length(p_value->'nodes') then return false; end if;
  for e in select value from jsonb_array_elements(p_value->'edges') loop
    if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string'
      or jsonb_typeof(e->'source') is distinct from 'string' or jsonb_typeof(e->'target') is distinct from 'string' then return false; end if;
  end loop;
  if p_value ? 'relations' then
    if jsonb_typeof(p_value->'relations') is distinct from 'array' then return false; end if;
    for e in select value from jsonb_array_elements(p_value->'relations') loop
      if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'id') is distinct from 'string'
        or jsonb_typeof(e->'source') is distinct from 'string' or jsonb_typeof(e->'target') is distinct from 'string'
        or (e ? 'label' and jsonb_typeof(e->'label') is distinct from 'string') then return false; end if;
    end loop;
  end if;
  if p_value ? 'snapshots' then
    if jsonb_typeof(p_value->'snapshots') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_value->'snapshots') > 100 then return false; end if;
  end if;
  if p_value ? 'ink' then
    ink := p_value->'ink';
    if jsonb_typeof(ink) is distinct from 'object' or ink->'version' not in ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb)
      or not (ink ? 'version') or jsonb_typeof(ink->'strokes') is distinct from 'array' then return false; end if;
    if jsonb_array_length(ink->'strokes') > 5000 then return false; end if;
    for s in select value from jsonb_array_elements(ink->'strokes') loop
      if jsonb_typeof(s) is distinct from 'object' or jsonb_typeof(s->'id') is distinct from 'string' or length(s->>'id') = 0
        or jsonb_typeof(s->'color') is distinct from 'string' or s->>'color' !~ '^#[0-9a-fA-F]{6}$'
        or not mmap_private.bounded_json_number(s->'width', 1, 64)
        or jsonb_typeof(s->'points') is distinct from 'array' then return false; end if;
      if jsonb_array_length(s->'points') not between 1 and 12000 then return false; end if;
      total_points := total_points + jsonb_array_length(s->'points');
      for p in select value from jsonb_array_elements(s->'points') loop
        if jsonb_typeof(p) is distinct from 'object'
          or not mmap_private.bounded_json_number(p->'x', -1000000, 1000000)
          or not mmap_private.bounded_json_number(p->'y', -1000000, 1000000)
          or not mmap_private.bounded_json_number(p->'pressure', 0, 1) then return false; end if;
      end loop;
      if s ? 'erasures' then
        if jsonb_typeof(s->'erasures') is distinct from 'array' then return false; end if;
        if jsonb_array_length(s->'erasures') > 128 then return false; end if;
        erasure_points := 0;
        for m in select value from jsonb_array_elements(s->'erasures') loop
          if jsonb_typeof(m) is distinct from 'object' or not mmap_private.bounded_json_number(m->'radius', 0, 2000)
            or m->'radius' = '0'::jsonb or jsonb_typeof(m->'points') is distinct from 'array' then return false; end if;
          if jsonb_array_length(m->'points') = 0 then return false; end if;
          erasure_points := erasure_points + jsonb_array_length(m->'points');
          if erasure_points > 8192 then return false; end if;
          for p in select value from jsonb_array_elements(m->'points') loop
            if jsonb_typeof(p) is distinct from 'object'
              or not mmap_private.bounded_json_number(p->'x', -1000000, 1000000)
              or not mmap_private.bounded_json_number(p->'y', -1000000, 1000000) then return false; end if;
          end loop;
        end loop;
        total_points := total_points + erasure_points;
      end if;
      if total_points > 250000 then return false; end if;
    end loop;
    if ink ? 'objects' then
      if jsonb_typeof(ink->'objects') is distinct from 'array' then return false; end if;
      if jsonb_array_length(ink->'objects') > 1000 then return false; end if;
      for n in select value from jsonb_array_elements(ink->'objects') loop
        if jsonb_typeof(n) is distinct from 'object' or jsonb_typeof(n->'id') is distinct from 'string'
          or jsonb_typeof(n->'kind') is distinct from 'string' or n->>'kind' not in ('stamp','label')
          or not mmap_private.bounded_json_number(n->'x', -1000000, 1000000)
          or not mmap_private.bounded_json_number(n->'y', -1000000, 1000000) then return false; end if;
      end loop;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function mmap_private.valid_cloud_document_shape(jsonb) from public, anon, authenticated;
grant execute on function mmap_private.valid_cloud_document_shape(jsonb) to authenticated;

create table public.cloud_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document jsonb not null,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  share_enabled boolean not null default false,
  constraint cloud_document_shape check (mmap_private.valid_cloud_document_shape(document)),
  -- Fast canonical ceiling plus the same compact 4 MiB bound as the route.
  constraint cloud_document_size check (octet_length(document::text) <= 8 * 1024 * 1024
    and mmap_private.compact_json_bytes(document) <= 4 * 1024 * 1024)
);
create index cloud_documents_owner_updated_idx on public.cloud_documents(owner_id, updated_at desc, id);
alter table public.cloud_documents enable row level security;
revoke all on table public.cloud_documents from public, anon, authenticated;
grant select, delete on public.cloud_documents to authenticated;
grant insert (id, owner_id, document) on public.cloud_documents to authenticated;
grant update (document) on public.cloud_documents to authenticated;
create policy cloud_documents_owner_select on public.cloud_documents for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy cloud_documents_owner_insert on public.cloud_documents for insert to authenticated
  with check ((select auth.uid()) = owner_id);
create policy cloud_documents_owner_update on public.cloud_documents for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy cloud_documents_owner_delete on public.cloud_documents for delete to authenticated
  using ((select auth.uid()) = owner_id);
-- Supabase anonymous sign-ins also use authenticated. A restrictive policy
-- keeps this requirement attached to every operation, including future policies.
create policy cloud_documents_permanent_account on public.cloud_documents as restrictive for all to authenticated
  using ((select auth.jwt()->>'is_anonymous') = 'false')
  with check ((select auth.jwt()->>'is_anonymous') = 'false');

create function mmap_private.stamp_cloud_document() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id then
    raise exception 'Document identity is immutable' using errcode = '42501';
  end if;
  if new.document is distinct from old.document then
    new.revision := old.revision + 1;
    new.updated_at := clock_timestamp();
  else
    new.revision := old.revision;
    new.updated_at := old.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function mmap_private.stamp_cloud_document() from public, anon, authenticated;
create trigger cloud_document_stamp before update on public.cloud_documents
  for each row execute function mmap_private.stamp_cloud_document();

create table mmap_private.document_shares (
  document_id uuid primary key references public.cloud_documents(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table mmap_private.document_shares enable row level security;
-- Deliberately no table policies or grants for either API role.
revoke all on table mmap_private.document_shares from public, anon, authenticated;

-- One deep allowlist primitive. `true` copies scalars only; never arbitrary JSON.
create function mmap_private.project_json(p_value jsonb, p_shape jsonb) returns jsonb
language plpgsql immutable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_shape = 'true'::jsonb then
    if jsonb_typeof(p_value) in ('string', 'number', 'boolean', 'null') then return p_value; end if;
    return null;
  elsif jsonb_typeof(p_shape) = 'array' then
    if jsonb_typeof(p_value) <> 'array' then return null; end if;
    select coalesce(jsonb_agg(v order by ord) filter (where v is not null), '[]'::jsonb)
      into result from (
        select mmap_private.project_json(e.value, p_shape->0) as v, e.ord
        from jsonb_array_elements(p_value) with ordinality as e(value, ord)
      ) as elements;
    return result;
  elsif jsonb_typeof(p_shape) = 'object' then
    if jsonb_typeof(p_value) <> 'object' then return null; end if;
    select coalesce(jsonb_object_agg(k, v) filter (where v is not null), '{}'::jsonb)
      into result from (
        select s.key as k, mmap_private.project_json(p_value->s.key, s.value) as v
        from jsonb_each(p_shape) as s where p_value ? s.key
      ) as properties;
    return result;
  end if;
  return null;
end;
$$;
revoke all on function mmap_private.project_json(jsonb, jsonb) from public, anon, authenticated;

-- SHARE_PROJECTION_JSON is generated from src/lib/cloud/projection.ts below.
create function mmap_private.public_document(p_document jsonb) returns jsonb
language sql immutable security invoker set search_path = '' as $$
  select mmap_private.project_json(p_document, '{"title":true,"nodes":[{"id":true,"type":true,"position":{"x":true,"y":true},"width":true,"height":true,"measured":{"width":true,"height":true},"data":{"label":true,"description":true,"parentId":true,"collapsed":true,"isRoot":true,"type":true,"status":true,"color":true,"style":true,"icon":true,"emoji":true,"side":true,"layoutMode":true,"tags":[true],"link":true,"checklist":[{"id":true,"text":true,"checked":true}]}}],"edges":[{"id":true,"source":true,"target":true,"type":true,"sourceHandle":true,"targetHandle":true}],"relations":[{"id":true,"source":true,"target":true,"label":true}],"boardMode":true,"ink":{"version":true,"strokes":[{"id":true,"color":true,"width":true,"points":[{"x":true,"y":true,"pressure":true}],"brush":true,"seed":true,"opacity":true,"texture":true,"taper":true,"branchStyle":true,"materialStyle":true,"joinWidth":true,"curve":true,"erasures":[{"radius":true,"points":[{"x":true,"y":true}]}],"transform":{"x":true,"y":true,"scale":true,"rotation":true}}],"objects":[{"id":true,"kind":true,"shape":true,"text":true,"x":true,"y":true,"width":true,"height":true,"color":true,"fill":true,"fontSize":true,"transform":{"x":true,"y":true,"scale":true,"rotation":true}}],"order":[true],"paper":{"kind":true,"texture":true,"seed":true}},"appearance":{"theme":true,"font":true,"nodeStyle":true,"levelFontSizes":[true],"edgeStyle":true,"edgeAnimated":true,"edgeWidth":true,"edgeColorMode":true,"edgeLine":true,"nodeTint":true,"canvasBg":true,"accent":true,"rainbowBranches":true},"layoutMode":true,"viewport":{"x":true,"y":true,"zoom":true}}'::jsonb);
$$;
revoke all on function mmap_private.public_document(jsonb) from public, anon, authenticated;

-- This owner-only definer is necessary to keep token hashes in an unexposed,
-- completely ungranted table. It checks auth.uid() before touching anything.
create function mmap_private.set_document_share(p_document_id uuid, p_token_hash text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt()->>'is_anonymous') is distinct from 'false' then return false; end if;
  if p_token_hash is not null and p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid token hash' using errcode = '22023';
  end if;
  -- Lock makes rotate/revoke and content saves mutually ordered for this row.
  perform 1 from public.cloud_documents
    where id = p_document_id and owner_id = auth.uid() for update;
  if not found then return false; end if;
  if p_token_hash is null then
    delete from mmap_private.document_shares where document_id = p_document_id;
  else
    insert into mmap_private.document_shares(document_id, token_hash)
      values (p_document_id, p_token_hash)
      on conflict (document_id) do update set token_hash = excluded.token_hash, created_at = now();
  end if;
  update public.cloud_documents set share_enabled = p_token_hash is not null where id = p_document_id;
  return true;
end;
$$;
revoke all on function mmap_private.set_document_share(uuid, text) from public, anon, authenticated;
grant execute on function mmap_private.set_document_share(uuid, text) to authenticated;

create function public.mmap_set_document_share(p_document_id uuid, p_token_hash text) returns boolean
language sql security invoker set search_path = '' as $$
  select mmap_private.set_document_share(p_document_id, p_token_hash);
$$;
revoke all on function public.mmap_set_document_share(uuid, text) from public, anon, authenticated;
grant execute on function public.mmap_set_document_share(uuid, text) to authenticated;

-- Intentional narrow public capability, the ONLY anonymous document read path.
-- Unlike the owner helper it cannot require auth.uid(): visitors are anonymous.
-- It accepts a high-entropy RAW token, hashes in Postgres, returns one allowlisted
-- display JSON, and cannot enumerate IDs/owners/hashes or mutate data.
-- Storing only hashes is meaningful: supplying a stored hash is not accepted.
create function mmap_private.get_shared_document(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select mmap_private.public_document(d.document)
  from mmap_private.document_shares s
  join public.cloud_documents d on d.id = s.document_id
  where p_token ~ '^[A-Za-z0-9_-]{43}$'
    and s.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and d.share_enabled = true
  limit 1;
$$;
revoke all on function mmap_private.get_shared_document(text) from public, anon, authenticated;
grant execute on function mmap_private.get_shared_document(text) to anon, authenticated;

create function public.mmap_get_shared_document(p_token text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select mmap_private.get_shared_document(p_token);
$$;
revoke all on function public.mmap_get_shared_document(text) from public, anon, authenticated;
grant execute on function public.mmap_get_shared_document(text) to anon, authenticated;

comment on function public.mmap_get_shared_document(text) is
  'Read-only bearer capability. Accepts raw 256-bit URL-safe token; returns display fields only. No document/owner IDs, history, snapshots or hashes.';
commit;
