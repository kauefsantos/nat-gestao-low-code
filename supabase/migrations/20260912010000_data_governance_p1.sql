begin;

-- P1 de governança de dados: revisão de acessos e linhagem de importações CSV.

create table if not exists public.access_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  reviewed_user_id uuid not null,
  role_snapshot text not null check (role_snapshot in ('admin','member')),
  reviewed_by uuid not null,
  decision text not null check (decision in ('retain','revoke')),
  rationale text not null check (char_length(btrim(rationale)) between 2 and 500),
  reviewed_at timestamptz not null default now(),
  next_review_at date,
  created_at timestamptz not null default now(),
  check (decision='revoke' or next_review_at is not null)
);

create index if not exists access_reviews_business_user_idx
  on public.access_reviews(business_id,reviewed_user_id,reviewed_at desc);
create index if not exists access_reviews_next_review_idx
  on public.access_reviews(business_id,next_review_at) where decision='retain';

alter table public.access_reviews enable row level security;
alter table public.access_reviews force row level security;
revoke all on table public.access_reviews from public,anon,authenticated;
grant select on table public.access_reviews to authenticated;
grant all on table public.access_reviews to service_role;

drop policy if exists access_reviews_select on public.access_reviews;
create policy access_reviews_select on public.access_reviews
for select to authenticated
using (private.is_business_admin(business_id));

create table if not exists public.recipe_import_batches (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  actor_user_id uuid not null,
  source_type text not null check (source_type in ('file_csv','pasted_csv')),
  file_name text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null check (char_length(parser_version) between 1 and 40),
  row_count integer not null check (row_count between 1 and 5000),
  imported_at timestamptz not null default now(),
  check (file_name is null or char_length(file_name) between 1 and 160)
);

create unique index if not exists recipe_import_batches_dedup_idx
  on public.recipe_import_batches(business_id,actor_user_id,product_id,file_sha256,imported_at);
create index if not exists recipe_import_batches_product_idx
  on public.recipe_import_batches(business_id,product_id,imported_at desc);

alter table public.recipe_import_batches enable row level security;
alter table public.recipe_import_batches force row level security;
revoke all on table public.recipe_import_batches from public,anon,authenticated;
grant select on table public.recipe_import_batches to authenticated;
grant all on table public.recipe_import_batches to service_role;

drop policy if exists recipe_import_batches_select on public.recipe_import_batches;
create policy recipe_import_batches_select on public.recipe_import_batches
for select to authenticated
using (private.is_business_admin(business_id));

create table if not exists private.pending_recipe_imports (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null,
  source_type text not null check (source_type in ('file_csv','pasted_csv')),
  file_name text,
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  parser_version text not null check (char_length(parser_version) between 1 and 40),
  row_count integer not null check (row_count between 1 and 5000),
  created_at timestamptz not null default now(),
  primary key (business_id,user_id),
  check (file_name is null or char_length(file_name) between 1 and 160)
);

revoke all on table private.pending_recipe_imports from public,anon,authenticated;
grant all on table private.pending_recipe_imports to service_role;

create or replace function public.stage_recipe_import_v1(
  p_source_type text,
  p_file_name text,
  p_file_sha256 text,
  p_parser_version text,
  p_row_count integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user is null then
    raise exception 'Autenticação obrigatória.' using errcode='42501';
  end if;
  if p_source_type not in ('file_csv','pasted_csv')
     or p_file_sha256 !~ '^[0-9a-f]{64}$'
     or char_length(coalesce(p_parser_version,'')) not between 1 and 40
     or p_row_count not between 1 and 5000
     or (p_file_name is not null and char_length(p_file_name) not between 1 and 160) then
    raise exception 'Metadados de importação inválidos.' using errcode='22023';
  end if;

  select bm.business_id into v_business_id
  from public.business_members bm
  where bm.user_id=v_user and private.is_business_member(bm.business_id)
  order by bm.created_at
  limit 1;

  if v_business_id is null then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  insert into private.pending_recipe_imports(
    business_id,user_id,source_type,file_name,file_sha256,parser_version,row_count,created_at
  ) values (
    v_business_id,v_user,p_source_type,nullif(left(btrim(coalesce(p_file_name,'')),160),''),
    p_file_sha256,p_parser_version,p_row_count,now()
  )
  on conflict (business_id,user_id) do update set
    source_type=excluded.source_type,
    file_name=excluded.file_name,
    file_sha256=excluded.file_sha256,
    parser_version=excluded.parser_version,
    row_count=excluded.row_count,
    created_at=now();
end;
$$;

revoke all on function public.stage_recipe_import_v1(text,text,text,text,integer) from public,anon;
grant execute on function public.stage_recipe_import_v1(text,text,text,text,integer) to authenticated,service_role;

create or replace function private.capture_staged_recipe_import()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_pending private.pending_recipe_imports%rowtype;
begin
  if v_user is null then return new; end if;

  select * into v_pending
  from private.pending_recipe_imports p
  where p.business_id=new.business_id
    and p.user_id=v_user
    and p.created_at >= now()-interval '2 hours'
  for update;

  if not found then return new; end if;

  insert into public.recipe_import_batches(
    business_id,product_id,actor_user_id,source_type,file_name,file_sha256,parser_version,row_count,imported_at
  ) values (
    new.business_id,new.id,v_user,v_pending.source_type,v_pending.file_name,v_pending.file_sha256,
    v_pending.parser_version,v_pending.row_count,now()
  );

  delete from private.pending_recipe_imports
  where business_id=new.business_id and user_id=v_user;

  return new;
end;
$$;

revoke all on function private.capture_staged_recipe_import() from public,anon,authenticated;

drop trigger if exists products_capture_recipe_import on public.products;
create trigger products_capture_recipe_import
after insert or update on public.products
for each row execute function private.capture_staged_recipe_import();

create or replace function public.record_access_review_v1(
  p_business_id uuid,
  p_reviewed_user_id uuid,
  p_decision text,
  p_rationale text,
  p_next_review_at date default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_id uuid;
  v_next date;
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem revisar acessos.' using errcode='42501';
  end if;
  if p_decision not in ('retain','revoke') then
    raise exception 'Decisão de revisão inválida.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_rationale,''))) not between 2 and 500 then
    raise exception 'Informe o motivo da revisão.' using errcode='22023';
  end if;

  select role into v_role from public.business_members
  where business_id=p_business_id and user_id=p_reviewed_user_id;
  if v_role is null then
    raise exception 'Usuário não possui acesso a este negócio.' using errcode='22023';
  end if;

  if p_decision='revoke' and p_reviewed_user_id=auth.uid() then
    raise exception 'Revogue seu próprio acesso somente por outro administrador.' using errcode='22023';
  end if;

  v_next := case when p_decision='retain' then coalesce(p_next_review_at,current_date+90) else null end;
  if v_next is not null and v_next <= current_date then
    raise exception 'A próxima revisão precisa estar no futuro.' using errcode='22023';
  end if;

  insert into public.access_reviews(
    business_id,reviewed_user_id,role_snapshot,reviewed_by,decision,rationale,reviewed_at,next_review_at
  ) values (
    p_business_id,p_reviewed_user_id,v_role,auth.uid(),p_decision,btrim(p_rationale),now(),v_next
  ) returning id into v_id;

  if p_decision='revoke' then
    delete from public.business_members
    where business_id=p_business_id and user_id=p_reviewed_user_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_access_review_v1(uuid,uuid,text,text,date) from public,anon;
grant execute on function public.record_access_review_v1(uuid,uuid,text,text,date) to authenticated,service_role;

create or replace function public.list_access_review_status_v1(p_business_id uuid)
returns table(
  user_id uuid,
  role text,
  granted_at timestamptz,
  last_reviewed_at timestamptz,
  next_review_at date,
  overdue boolean
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.is_business_admin(p_business_id) then
    raise exception 'Apenas administradores podem consultar revisões de acesso.' using errcode='42501';
  end if;
  return query
  select bm.user_id,bm.role,bm.created_at,r.reviewed_at,r.next_review_at,
         coalesce(r.next_review_at<current_date,true) as overdue
  from public.business_members bm
  left join lateral (
    select ar.reviewed_at,ar.next_review_at
    from public.access_reviews ar
    where ar.business_id=bm.business_id and ar.reviewed_user_id=bm.user_id
    order by ar.reviewed_at desc
    limit 1
  ) r on true
  where bm.business_id=p_business_id
  order by bm.created_at,bm.user_id;
end;
$$;

revoke all on function public.list_access_review_status_v1(uuid) from public,anon;
grant execute on function public.list_access_review_status_v1(uuid) to authenticated,service_role;

commit;
