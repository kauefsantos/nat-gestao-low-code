-- Backend P2: atomic client transitions, record-level optimistic concurrency, and AI production controls.
begin;

-- Sales now participate in the same optimistic-concurrency protocol as editable entities.
alter table public.sales
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists sales_touch_updated_at on public.sales;
create trigger sales_touch_updated_at
before update on public.sales
for each row execute function private.set_updated_at();

-- Privacy-preserving AI observability. Prompt/content text is intentionally not stored.
create table if not exists public.ai_generation_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  format text not null check (format in ('feed','story','square')),
  prompt_chars integer not null check (prompt_chars between 0 and 1500),
  status text not null default 'started' check (status in ('started','succeeded','failed','timeout','provider_error','invalid_output')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  provider_status integer check (provider_status is null or provider_status between 100 and 599),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.ai_generation_log enable row level security;
create index if not exists ai_generation_log_business_user_created_idx
  on public.ai_generation_log(business_id,user_id,created_at desc);
create index if not exists ai_generation_log_business_created_idx
  on public.ai_generation_log(business_id,created_at desc);

revoke all on table public.ai_generation_log from public, anon, authenticated;
grant select, insert, update on table public.ai_generation_log to service_role;

-- Compare only the record that a transition intends to mutate. A null expected version
-- means the record must not exist yet (new entity).
create or replace function private.assert_nat_version(
  p_entity text,
  p_business_id uuid,
  p_id uuid,
  p_expected_updated_at text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual timestamptz;
  v_expected timestamptz;
  v_exists boolean := false;
begin
  if p_expected_updated_at is not null then
    begin
      v_expected := p_expected_updated_at::timestamptz;
    exception when others then
      raise exception 'CONFLICT: versão inválida para %.', p_entity using errcode = '40001';
    end;
  end if;

  case p_entity
    when 'settings' then
      select updated_at into v_actual
      from public.business_settings
      where business_id = p_business_id;
      v_exists := found;
    when 'supply' then
      select updated_at into v_actual
      from public.supplies
      where business_id = p_business_id and id = p_id;
      v_exists := found;
    when 'product' then
      select updated_at into v_actual
      from public.products
      where business_id = p_business_id and id = p_id;
      v_exists := found;
    when 'sale' then
      select updated_at into v_actual
      from public.sales
      where business_id = p_business_id and id = p_id;
      v_exists := found;
    when 'expense' then
      select updated_at into v_actual
      from public.sporadic_expenses
      where business_id = p_business_id and id = p_id;
      v_exists := found;
    else
      raise exception 'Entidade de versão inválida.' using errcode = '22023';
  end case;

  if p_expected_updated_at is null then
    if v_exists then
      raise exception 'CONFLICT: % já existe.', p_entity using errcode = '40001';
    end if;
  elsif not v_exists or v_actual is distinct from v_expected then
    raise exception 'CONFLICT: % foi alterado em outro aparelho.', p_entity using errcode = '40001';
  end if;
end;
$$;

revoke all on function private.assert_nat_version(text,uuid,uuid,text) from public, anon, authenticated;

-- One RPC = one PostgreSQL transaction. If any operation or version check fails,
-- the whole transition rolls back automatically.
create or replace function public.apply_nat_transition(
  p_business_id uuid,
  p_operations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation jsonb;
  v_payload jsonb;
  v_type text;
  v_expected text;
  v_id uuid;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_operations is null or jsonb_typeof(p_operations) <> 'array' then
    raise exception 'Operações inválidas.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_operations) > 500 then
    raise exception 'Muitas operações em uma única alteração.' using errcode = '22023';
  end if;

  for v_operation in select value from jsonb_array_elements(p_operations)
  loop
    v_type := v_operation->>'type';
    v_payload := coalesce(v_operation->'payload','{}'::jsonb);
    v_expected := nullif(v_operation->>'expectedUpdatedAt','');

    if v_type = 'save_business_settings' then
      perform private.assert_nat_version('settings',p_business_id,null,v_expected);
      perform public.save_business_settings(
        p_business_id,
        v_payload->>'ownerName',
        (v_payload->>'monthlyFixedCosts')::numeric,
        (v_payload->>'paymentFeePercent')::numeric,
        (v_payload->>'defaultMinimumMarginPercent')::numeric,
        (v_payload->>'defaultTargetMarginPercent')::numeric
      );
      continue;
    end if;

    begin
      v_id := (v_payload->>'id')::uuid;
    exception when others then
      raise exception 'Identificador inválido em %.', coalesce(v_type,'operação') using errcode = '22023';
    end;

    case v_type
      when 'cancel_sale' then
        perform private.assert_nat_version('sale',p_business_id,v_id,v_expected);
        perform public.cancel_sale(p_business_id,v_id,coalesce(nullif(v_payload->>'reason',''),'Cancelada pelo usuário'));

      when 'archive_product' then
        perform private.assert_nat_version('product',p_business_id,v_id,v_expected);
        perform public.archive_product(p_business_id,v_id);

      when 'delete_supply' then
        perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);
        perform public.delete_supply(p_business_id,v_id);

      when 'delete_sporadic_expense' then
        perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);
        perform public.delete_sporadic_expense(p_business_id,v_id);

      when 'save_supply' then
        perform private.assert_nat_version('supply',p_business_id,v_id,v_expected);
        perform public.save_supply(
          p_business_id,v_id,v_payload->>'name',v_payload->>'category',
          (v_payload->>'packageQuantity')::numeric,v_payload->>'packageUnit',
          (v_payload->>'packagePrice')::numeric,(v_payload->>'purchasedAt')::date
        );

      when 'save_product' then
        perform private.assert_nat_version('product',p_business_id,v_id,v_expected);
        perform public.save_product(
          p_business_id,v_id,v_payload->>'name',
          (v_payload->>'batchYield')::numeric,(v_payload->>'sellingPrice')::numeric,
          (v_payload->>'lossPercent')::numeric,(v_payload->>'productionCostPerBatch')::numeric,
          (v_payload->>'minimumMarginPercent')::numeric,(v_payload->>'targetMarginPercent')::numeric,
          coalesce(v_payload->'recipe','[]'::jsonb),nullif(v_payload->>'portfolioKey','')
        );

      when 'save_sale_items' then
        perform private.assert_nat_version('sale',p_business_id,v_id,v_expected);
        perform public.save_sale_items(
          p_business_id,v_id,coalesce(v_payload->'items','[]'::jsonb),
          (v_payload->>'totalReceived')::numeric,v_payload->>'paymentMethod',
          (v_payload->>'soldAt')::timestamptz
        );

      when 'save_sporadic_expense' then
        perform private.assert_nat_version('expense',p_business_id,v_id,v_expected);
        perform public.save_sporadic_expense(
          p_business_id,v_id,v_payload->>'name',(v_payload->>'amount')::numeric,
          (v_payload->>'spentAt')::date
        );

      else
        raise exception 'Operação não suportada: %.', coalesce(v_type,'(vazia)') using errcode = '22023';
    end case;
  end loop;
end;
$$;

revoke all on function public.apply_nat_transition(uuid,jsonb) from public, anon;
grant execute on function public.apply_nat_transition(uuid,jsonb) to authenticated;

-- Atomic quota claim: 10 attempts per 10 minutes and 100 per rolling 24 hours,
-- scoped to the authenticated user inside one business. Only backend service role can call it.
create or replace function public.claim_content_ai_quota(
  p_business_id uuid,
  p_user_id uuid,
  p_format text,
  p_prompt_chars integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_recent integer;
  v_day integer;
begin
  if p_format not in ('feed','story','square') or p_prompt_chars < 0 or p_prompt_chars > 1500 then
    raise exception 'Dados de uso da IA inválidos.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.business_members
    where business_id=p_business_id and user_id=p_user_id
  ) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':' || p_user_id::text,0));

  select count(*) into v_recent
  from public.ai_generation_log
  where business_id=p_business_id and user_id=p_user_id and created_at >= now() - interval '10 minutes';
  select count(*) into v_day
  from public.ai_generation_log
  where business_id=p_business_id and user_id=p_user_id and created_at >= now() - interval '24 hours';

  if v_recent >= 10 or v_day >= 100 then
    return null;
  end if;

  insert into public.ai_generation_log(business_id,user_id,format,prompt_chars)
  values (p_business_id,p_user_id,p_format,p_prompt_chars)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_content_ai_generation(
  p_id uuid,
  p_status text,
  p_latency_ms integer,
  p_provider_status integer default null,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('succeeded','failed','timeout','provider_error','invalid_output') then
    raise exception 'Status de geração inválido.' using errcode = '22023';
  end if;
  update public.ai_generation_log
  set status=p_status,
      latency_ms=greatest(coalesce(p_latency_ms,0),0),
      provider_status=p_provider_status,
      input_tokens=p_input_tokens,
      output_tokens=p_output_tokens,
      total_tokens=p_total_tokens,
      error_code=left(p_error_code,80),
      finished_at=now()
  where id=p_id and status='started';
end;
$$;

revoke all on function public.claim_content_ai_quota(uuid,uuid,text,integer) from public, anon, authenticated;
revoke all on function public.finish_content_ai_generation(uuid,text,integer,integer,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.claim_content_ai_quota(uuid,uuid,text,integer) to service_role;
grant execute on function public.finish_content_ai_generation(uuid,text,integer,integer,integer,integer,integer,text) to service_role;

commit;
