-- Backend P1: multi-product orders, reversible cancellation history, and push cron plumbing.
begin;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- A sale is now an order that can contain multiple product lines.
alter table public.sales add column if not exists status text not null default 'completed';
alter table public.sales add column if not exists cancelled_at timestamptz;
alter table public.sales add column if not exists cancelled_by uuid references auth.users(id) on delete set null;
alter table public.sales add column if not exists cancel_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='sales_status_check' and conrelid='public.sales'::regclass
  ) then
    alter table public.sales add constraint sales_status_check
      check (status in ('completed','cancelled'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='sales_cancel_reason_check' and conrelid='public.sales'::regclass
  ) then
    alter table public.sales add constraint sales_cancel_reason_check
      check (cancel_reason is null or char_length(btrim(cancel_reason)) between 1 and 240);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='sales_cancellation_state_check' and conrelid='public.sales'::regclass
  ) then
    alter table public.sales add constraint sales_cancellation_state_check
      check (
        (status='completed' and cancelled_at is null and cancelled_by is null and cancel_reason is null)
        or
        (status='cancelled' and cancelled_at is not null)
      );
  end if;
end $$;

create index if not exists sales_business_status_date_idx
  on public.sales(business_id,status,sold_at desc);

drop index if exists public.sale_items_one_item_per_sale_idx;

-- Historical costing helper used by both single- and multi-product sale RPCs.
create or replace function private.product_unit_cost_at_date(
  p_business_id uuid,
  p_product_id uuid,
  p_sale_date date
)
returns numeric
language plpgsql
security definer
stable
set search_path=''
as $$
declare
  v_product public.products%rowtype;
  v_item record;
  v_package record;
  v_inputs numeric := 0;
  v_package_base numeric;
  v_usage_base numeric;
begin
  select * into v_product
  from public.products
  where business_id=p_business_id and id=p_product_id and active=true;
  if not found then
    raise exception 'Produto não encontrado ou inativo.' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.recipe_items
    where business_id=p_business_id and product_id=p_product_id
  ) then
    raise exception 'Complete a receita antes de registrar uma venda.' using errcode='22023';
  end if;

  for v_item in
    select supply_id,quantity,unit
    from public.recipe_items
    where business_id=p_business_id and product_id=p_product_id
  loop
    select sp.package_quantity,sp.package_unit,sp.package_price
      into v_package
    from public.supply_purchases sp
    where sp.business_id=p_business_id
      and sp.supply_id=v_item.supply_id
      and sp.purchased_at<=p_sale_date
    order by sp.purchased_at desc,sp.created_at desc
    limit 1;

    if not found then
      raise exception 'Não há compra válida do ingrediente na data desta venda.' using errcode='22023';
    end if;
    if private.unit_dimension(v_item.unit) is null
       or private.unit_dimension(v_item.unit)<>private.unit_dimension(v_package.package_unit) then
      raise exception 'A receita contém unidade incompatível.' using errcode='22023';
    end if;

    v_package_base:=private.unit_base_amount(v_package.package_quantity,v_package.package_unit);
    v_usage_base:=private.unit_base_amount(v_item.quantity,v_item.unit);
    if v_package_base is null or v_package_base<=0 or v_usage_base is null or v_usage_base<=0 then
      raise exception 'Quantidade inválida na receita.' using errcode='22023';
    end if;
    v_inputs:=v_inputs+(v_package.package_price/v_package_base)*v_usage_base;
  end loop;

  return ((v_inputs+v_product.production_cost_per_batch)*(1+v_product.loss_percent/100))/v_product.batch_yield;
end;
$$;
revoke all on function private.product_unit_cost_at_date(uuid,uuid,date) from public,anon,authenticated;

create or replace function public.save_sale_items(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_line jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_list numeric;
  v_line_revenue numeric;
  v_total_list numeric := 0;
  v_total_quantity numeric := 0;
  v_total_cost numeric := 0;
  v_fee_percent numeric := 0;
  v_variable_fee numeric;
  v_contribution numeric;
  v_sale_date date;
  v_seen uuid[] := array[]::uuid[];
  v_lines jsonb := '[]'::jsonb;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_id is null
     or p_sold_at is null
     or p_total_received is null or p_total_received<0
     or p_payment_method not in ('pix','cash','card','other')
     or jsonb_typeof(coalesce(p_items,'null'::jsonb))<>'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Dados da venda inválidos.' using errcode='22023';
  end if;

  v_sale_date:=(p_sold_at at time zone 'America/Sao_Paulo')::date;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id:=nullif(v_item->>'productId','')::uuid;
      v_quantity:=nullif(v_item->>'quantity','')::numeric;
    exception when others then
      raise exception 'Item da venda inválido.' using errcode='22023';
    end;

    if v_product_id is null or v_quantity is null or v_quantity<=0 then
      raise exception 'Cada item precisa de produto e quantidade maior que zero.' using errcode='22023';
    end if;
    if v_product_id=any(v_seen) then
      raise exception 'O mesmo produto não pode aparecer duas vezes na venda.' using errcode='22023';
    end if;
    v_seen:=array_append(v_seen,v_product_id);

    select * into v_product
    from public.products
    where business_id=p_business_id and id=v_product_id and active=true;
    if not found then
      raise exception 'Produto não encontrado ou inativo.' using errcode='22023';
    end if;

    v_unit_cost:=private.product_unit_cost_at_date(p_business_id,v_product_id,v_sale_date);
    v_line_list:=v_product.selling_price*v_quantity;
    v_total_list:=v_total_list+v_line_list;
    v_total_quantity:=v_total_quantity+v_quantity;
    v_total_cost:=v_total_cost+(v_unit_cost*v_quantity);
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
      'productId',v_product.id,
      'productName',v_product.name,
      'portfolioKey',v_product.portfolio_key,
      'quantity',v_quantity,
      'unitCost',v_unit_cost,
      'listTotal',v_line_list
    ));
  end loop;

  select payment_fee_percent into v_fee_percent
  from public.business_settings where business_id=p_business_id;
  v_fee_percent:=coalesce(v_fee_percent,0);
  v_variable_fee:=p_total_received*v_fee_percent/100;
  v_contribution:=p_total_received-v_total_cost-v_variable_fee;

  insert into public.sales(
    id,business_id,sold_at,total_received,payment_method,variable_fee_snapshot,contribution_snapshot,status
  ) values (
    p_id,p_business_id,p_sold_at,p_total_received,p_payment_method,v_variable_fee,v_contribution,'completed'
  );

  for v_line in select value from jsonb_array_elements(v_lines)
  loop
    if v_total_list>0 then
      v_line_revenue:=p_total_received*((v_line->>'listTotal')::numeric/v_total_list);
    else
      v_line_revenue:=p_total_received*((v_line->>'quantity')::numeric/v_total_quantity);
    end if;

    insert into public.sale_items(
      business_id,sale_id,product_id,product_name_snapshot,portfolio_key_snapshot,
      quantity,unit_cost_snapshot,unit_price_snapshot
    ) values (
      p_business_id,p_id,(v_line->>'productId')::uuid,v_line->>'productName',nullif(v_line->>'portfolioKey',''),
      (v_line->>'quantity')::numeric,(v_line->>'unitCost')::numeric,
      v_line_revenue/(v_line->>'quantity')::numeric
    );
  end loop;
end;
$$;

-- Backwards-compatible single-item RPC used by the current client and older sessions.
create or replace function public.save_sale(
  p_business_id uuid,
  p_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.save_sale_items(
    p_business_id,
    p_id,
    jsonb_build_array(jsonb_build_object('productId',p_product_id,'quantity',p_quantity)),
    p_total_received,
    p_payment_method,
    p_sold_at
  );
end;
$$;

create or replace function public.cancel_sale(
  p_business_id uuid,
  p_id uuid,
  p_reason text default 'Cancelada pelo usuário'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reason text:=left(btrim(coalesce(nullif(p_reason,''),'Cancelada pelo usuário')),240);
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

  update public.sales
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancel_reason=v_reason
  where business_id=p_business_id and id=p_id and status='completed';

  if not found and not exists(
    select 1 from public.sales where business_id=p_business_id and id=p_id
  ) then
    raise exception 'Venda não encontrada.' using errcode='22023';
  end if;
end;
$$;

-- Compatibility: old client "delete" requests now cancel rather than destroy history.
create or replace function public.delete_sale(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  perform public.cancel_sale(p_business_id,p_id,'Cancelada pelo usuário');
end;
$$;

revoke all on function public.save_sale_items(uuid,uuid,jsonb,numeric,text,timestamptz) from public,anon;
revoke all on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) from public,anon;
revoke all on function public.cancel_sale(uuid,uuid,text) from public,anon;
revoke all on function public.delete_sale(uuid,uuid) from public,anon;
grant execute on function public.save_sale_items(uuid,uuid,jsonb,numeric,text,timestamptz) to authenticated;
grant execute on function public.save_sale(uuid,uuid,uuid,numeric,numeric,text,timestamptz) to authenticated;
grant execute on function public.cancel_sale(uuid,uuid,text) to authenticated;
grant execute on function public.delete_sale(uuid,uuid) to authenticated;

-- Server-side scheduler helper. Secrets/URL live in Vault, never in source.
create or replace function private.dispatch_nat_push_slot(p_slot smallint)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  if p_slot not in (9,12,16,21) then
    raise exception 'Slot inválido.' using errcode='22023';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name='nat_push_function_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='nat_push_cron_secret' limit 1;
  if nullif(v_url,'') is null or nullif(v_secret,'') is null then
    raise exception 'Push backend não configurado.' using errcode='55000';
  end if;

  select net.http_post(
    url:=v_url,
    headers:=jsonb_build_object('Content-Type','application/json','x-nat-cron-secret',v_secret),
    body:=jsonb_build_object('slot',p_slot),
    timeout_milliseconds:=10000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function private.dispatch_nat_push_slot(smallint) from public,anon,authenticated;

-- Schedule only in an environment whose Vault has the production push endpoint + secret.
do $$
declare
  v_job record;
begin
  if exists(select 1 from vault.secrets where name='nat_push_function_url')
     and exists(select 1 from vault.secrets where name='nat_push_cron_secret') then
    for v_job in select jobid from cron.job where jobname in ('nat-push-09','nat-push-12','nat-push-16','nat-push-21')
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;
    perform cron.schedule('nat-push-09','0 12 * * *',$cron$select private.dispatch_nat_push_slot(9);$cron$);
    perform cron.schedule('nat-push-12','0 15 * * *',$cron$select private.dispatch_nat_push_slot(12);$cron$);
    perform cron.schedule('nat-push-16','0 19 * * *',$cron$select private.dispatch_nat_push_slot(16);$cron$);
    perform cron.schedule('nat-push-21','0 0 * * *',$cron$select private.dispatch_nat_push_slot(21);$cron$);
  end if;
end $$;

commit;
