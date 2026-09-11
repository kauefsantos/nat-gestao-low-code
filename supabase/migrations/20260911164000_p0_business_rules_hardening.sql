begin;

-- Non-commercial movements may use a paused technical product, while real sales may not.
create or replace function private.enforce_sellable_product()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_type text;
begin
  select s.transaction_type into v_type
  from public.sales s
  where s.business_id=new.business_id and s.id=new.sale_id;

  if coalesce(v_type,'sale')='sale' and not exists (
    select 1 from public.products p
    where p.business_id=new.business_id
      and p.id=new.product_id
      and p.active=true
      and p.available=true
  ) then
    raise exception 'Produto temporariamente indisponível para venda.' using errcode='22023';
  end if;

  if not exists (
    select 1 from public.products p
    where p.business_id=new.business_id and p.id=new.product_id and p.active=true
  ) then
    raise exception 'Produto não encontrado ou arquivado.' using errcode='22023';
  end if;
  return new;
end;
$$;

-- Business defaults must follow the same margin hierarchy as products.
create or replace function private.validate_business_margin()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.default_target_margin_percent < new.default_minimum_margin_percent then
    raise exception 'A margem recomendada não pode ser menor que a margem mínima.' using errcode='22023';
  end if;
  if new.default_minimum_margin_percent+new.payment_fee_percent>=100
     or new.default_target_margin_percent+new.payment_fee_percent>=100 then
    raise exception 'Margem e taxa somadas precisam ser menores que 100%%.' using errcode='22023';
  end if;
  return new;
end;
$$;

drop trigger if exists business_settings_validate_margin on public.business_settings;
create trigger business_settings_validate_margin
before insert or update of default_minimum_margin_percent,default_target_margin_percent,payment_fee_percent
on public.business_settings
for each row execute function private.validate_business_margin();

-- All writes continue to go through the authoritative transition RPC.
revoke all on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) from public,anon,authenticated;
revoke all on function public.save_business_settings_v2(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.save_product_v2(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) from public,anon,authenticated;
revoke all on function public.save_sale_items_v2(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.save_customer(uuid,uuid,text,text,text,text,boolean,text,boolean) to service_role;
grant execute on function public.save_business_settings_v2(uuid,text,numeric,numeric,numeric,numeric,numeric,numeric) to service_role;
grant execute on function public.save_product_v2(uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text) to service_role;
grant execute on function public.save_sale_items_v2(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text) to service_role;

commit;
