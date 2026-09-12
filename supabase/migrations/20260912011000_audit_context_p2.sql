begin;

-- P2 de governança: registrar não só o que mudou, mas também a origem e o contexto da mudança.

alter table public.audit_log add column if not exists source text not null default 'legacy';
alter table public.audit_log add column if not exists request_id uuid;
alter table public.audit_log add column if not exists change_reason text;
alter table public.audit_log add column if not exists actor_type text not null default 'user';
alter table public.audit_log add column if not exists app_version text;

update public.audit_log set actor_type='system' where actor_user_id is null;

alter table public.audit_log drop constraint if exists audit_log_source_length_check;
alter table public.audit_log add constraint audit_log_source_length_check check (char_length(source) between 1 and 40);
alter table public.audit_log drop constraint if exists audit_log_change_reason_length_check;
alter table public.audit_log add constraint audit_log_change_reason_length_check check (change_reason is null or char_length(change_reason) between 1 and 500);
alter table public.audit_log drop constraint if exists audit_log_actor_type_check;
alter table public.audit_log add constraint audit_log_actor_type_check check (actor_type in ('user','system','service'));
alter table public.audit_log drop constraint if exists audit_log_app_version_length_check;
alter table public.audit_log add constraint audit_log_app_version_length_check check (app_version is null or char_length(app_version) between 1 and 80);

alter table public.audit_log alter column source set default 'application';
create index if not exists audit_log_request_id_idx on public.audit_log(request_id) where request_id is not null;
create index if not exists audit_log_source_created_idx on public.audit_log(business_id,source,created_at desc);

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_row_source jsonb;
  v_business_id uuid;
  v_entity_id uuid;
  v_audit_source text;
  v_request_text text;
  v_request_id uuid;
  v_change_reason text;
  v_actor_type text;
  v_app_version text;
begin
  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_row_source := v_after;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    v_row_source := v_after;
  else
    v_before := to_jsonb(old);
    v_row_source := v_before;
  end if;

  v_entity_id := nullif(coalesce(v_row_source ->> 'id', v_row_source ->> 'user_id', v_row_source ->> 'business_id'), '')::uuid;

  if tg_table_name = 'businesses' then
    v_business_id := case when tg_op = 'DELETE' then null else nullif(v_row_source ->> 'id', '')::uuid end;
  else
    v_business_id := nullif(v_row_source ->> 'business_id', '')::uuid;
  end if;

  v_audit_source := nullif(left(btrim(coalesce(current_setting('app.audit_source',true),'')),40),'');
  if v_audit_source is null then
    v_audit_source := case when auth.uid() is null then 'system' else 'application' end;
  end if;

  v_request_text := nullif(btrim(coalesce(current_setting('app.audit_request_id',true),'')),'');
  if v_request_text is not null then
    begin
      v_request_id := v_request_text::uuid;
    exception when invalid_text_representation then
      v_request_id := null;
    end;
  end if;

  v_change_reason := nullif(left(btrim(coalesce(current_setting('app.audit_reason',true),'')),500),'');
  v_app_version := nullif(left(btrim(coalesce(current_setting('app.app_version',true),'')),80),'');
  v_actor_type := nullif(btrim(coalesce(current_setting('app.audit_actor_type',true),'')),'');
  if v_actor_type not in ('user','system','service') then
    v_actor_type := case when auth.uid() is null then 'system' else 'user' end;
  end if;

  insert into public.audit_log(
    business_id,actor_user_id,action,entity_table,entity_id,before_data,after_data,
    source,request_id,change_reason,actor_type,app_version
  ) values (
    v_business_id,auth.uid(),tg_op,tg_table_name,v_entity_id,v_before,v_after,
    v_audit_source,v_request_id,v_change_reason,v_actor_type,v_app_version
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.audit_row_change() from public,anon,authenticated;

-- Correlaciona todas as alterações de uma transição idempotente com o mesmo request_id.
create or replace function public.apply_nat_transition_v2(
  p_business_id uuid,
  p_request_id uuid,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_existing_hash text;
  v_inserted integer;
  v_reason text;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Identificador da alteração é obrigatório.' using errcode = '22023';
  end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Operações inválidas.' using errcode = '22023';
  end if;

  v_hash := md5(p_operations::text);
  insert into public.mutation_requests(business_id,request_id,request_hash)
  values (p_business_id,p_request_id,v_hash)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select request_hash into v_existing_hash
    from public.mutation_requests
    where business_id=p_business_id and request_id=p_request_id;
    if v_existing_hash is distinct from v_hash then
      raise exception 'CONFLICT: identificador de alteração reutilizado com conteúdo diferente.' using errcode='40001';
    end if;
    return;
  end if;

  if jsonb_array_length(p_operations)=1 then
    v_reason := nullif(left(btrim(coalesce(p_operations->0->'payload'->>'reason','')),500),'');
  end if;
  perform set_config('app.audit_source','ui_transition',true);
  perform set_config('app.audit_request_id',p_request_id::text,true);
  if v_reason is not null then perform set_config('app.audit_reason',v_reason,true); end if;

  perform public.apply_nat_transition(p_business_id,p_operations);
end;
$$;

revoke all on function public.apply_nat_transition_v2(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_nat_transition_v2(uuid,uuid,jsonb) to authenticated;

-- Registros de governança também entram na trilha geral.
drop trigger if exists access_reviews_audit on public.access_reviews;
create trigger access_reviews_audit
after insert or update or delete on public.access_reviews
for each row execute function private.audit_row_change();

drop trigger if exists recipe_import_batches_audit on public.recipe_import_batches;
create trigger recipe_import_batches_audit
after insert or update or delete on public.recipe_import_batches
for each row execute function private.audit_row_change();

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

  perform set_config('app.audit_source','csv_import',true);
  perform set_config('app.audit_reason','Importação de receita por CSV',true);

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

  perform set_config('app.audit_source','access_review',true);
  perform set_config('app.audit_reason',left(btrim(p_rationale),500),true);

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

commit;
