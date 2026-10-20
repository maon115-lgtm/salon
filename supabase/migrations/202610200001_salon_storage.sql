begin;

-- New names avoid overwriting tables in an existing Supabase project.
create table public.salon_workspaces (
  owner_id text primary key check (length(owner_id) between 1 and 200),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
create table public.salon_branches (
  id text primary key references public.salon_workspaces(owner_id),
  owner_id text not null check (length(owner_id) between 1 and 200),
  category text not null check (category in ('women','spa','men')),
  name text not null check (length(name) between 2 and 80),
  city text not null check (length(city) between 2 and 60),
  listed boolean not null default false,
  created_at timestamptz not null default now()
);
create index salon_branches_owner on public.salon_branches(owner_id,created_at desc);
create index salon_branches_catalog on public.salon_branches(category,created_at desc) where listed;

-- Existing ChatGPT identities are checked by the app server, not Supabase Auth.
-- Browser/anonymous/authenticated roles cannot read tables or invoke this RPC.
alter table public.salon_workspaces enable row level security;
alter table public.salon_branches enable row level security;
revoke all on public.salon_workspaces, public.salon_branches from public, anon, authenticated;
grant select,insert,update,delete on public.salon_workspaces, public.salon_branches to service_role;

create function public.salon_store(p_operation text,p_args jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  current_revision integer;
  current_payload jsonb;
  changed integer;
begin
  case p_operation
  when 'get_branch' then
    select to_jsonb(b) into result from public.salon_branches b where b.id=p_args->>'id';
  when 'get_workspace' then
    select jsonb_build_object('payload',w.payload::text,'revision',w.revision)
      into result from public.salon_workspaces w where w.owner_id=p_args->>'id';
  when 'list_branches' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',b.id,'category',b.category,'name',coalesce(w.payload#>>'{settings,name}',b.name),
      'city',b.city,'listed',b.listed) order by b.created_at desc),'[]'::jsonb)
    into result from public.salon_branches b join public.salon_workspaces w on w.owner_id=b.id
    where b.owner_id=p_args->>'owner';
  when 'ensure_workspace' then
    insert into public.salon_workspaces(owner_id,payload) values(p_args->>'id',p_args->'payload')
    on conflict(owner_id) do nothing;
    result := 'true'::jsonb;
  when 'create_branch' then
    -- Both inserts commit together, or neither does.
    insert into public.salon_workspaces(owner_id,payload) values(p_args->>'id',p_args->'payload');
    insert into public.salon_branches(id,owner_id,category,name,city)
    values(p_args->>'id',p_args->>'owner_id',p_args->>'category',p_args->>'name',p_args->>'city');
    result := 'true'::jsonb;
  when 'set_visibility' then
    -- All writes affecting availability lock the workspace first, in the same order.
    select w.revision,w.payload into current_revision,current_payload
    from public.salon_workspaces w where w.owner_id=p_args->>'id' for update;
    if not found or current_revision<>(p_args->>'revision')::integer then return 'false'::jsonb; end if;
    if (p_args->>'listed')::boolean and (
      not exists(select 1 from jsonb_array_elements(current_payload->'staff') s where (s->>'active')::boolean)
      or not exists(select 1 from jsonb_array_elements(current_payload->'services') s
        where (s->>'active')::boolean and (s->>'price')::numeric>0)
    ) then return 'false'::jsonb; end if;
    update public.salon_branches set listed=(p_args->>'listed')::boolean
      where id=p_args->>'id' and owner_id=p_args->>'owner';
    get diagnostics changed = row_count;
    result := to_jsonb(changed=1);
  when 'save_workspace' then
    select w.revision into current_revision from public.salon_workspaces w
      where w.owner_id=p_args->>'id' for update;
    if not found or current_revision<>(p_args->>'revision')::integer then return 'false'::jsonb; end if;
    if coalesce((p_args->>'require_listed')::boolean,false)
      and not exists(select 1 from public.salon_branches where id=p_args->>'id' and listed)
      then return 'false'::jsonb; end if;
    update public.salon_workspaces set payload=p_args->'payload',revision=revision+1,updated_at=now()
      where owner_id=p_args->>'id' and revision=(p_args->>'revision')::integer;
    get diagnostics changed = row_count;
    result := to_jsonb(changed=1);
  when 'catalog' then
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'category',b.category,
      'city',b.city,'payload',w.payload::text) order by b.created_at desc),'[]'::jsonb)
    into result from public.salon_branches b join public.salon_workspaces w on w.owner_id=b.id
    where b.category=p_args->>'category' and b.listed;
  when 'listed_branch' then
    select jsonb_build_object('id',b.id,'name',b.name,'category',b.category,'city',b.city,
      'payload',w.payload::text,'revision',w.revision)
    into result from public.salon_branches b join public.salon_workspaces w on w.owner_id=b.id
    where b.id=p_args->>'id' and b.listed;
  when 'customer_branches' then
    select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'category',b.category,
      'city',b.city,'payload',w.payload::text)),'[]'::jsonb)
    into result from public.salon_branches b join public.salon_workspaces w on w.owner_id=b.id
    where exists(select 1 from jsonb_array_elements(w.payload->'bookings') booking
      where booking->>'customerId'=p_args->>'key');
  else
    raise exception 'Unsupported storage operation';
  end case;
  return result;
end;
$$;
revoke all on function public.salon_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.salon_store(text,jsonb) to service_role;
commit;
