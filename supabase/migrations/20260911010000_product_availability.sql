-- Scoped feature extension: temporary product availability without archiving.
begin;

alter table public.products
  add column if not exists available boolean not null default true;

create or replace function public.set_product_availability(
  p_business_id uuid,
  p_id uuid,
  p_expected_updated_at text,
  p_available boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if p_id is null or p_available is null then
    raise exception 'Disponibilidade inválida.' using errcode = '22023';
  end if;

  perform private.assert_nat_version('product',p_business_id,p_id,p_expected_updated_at);

  update public.products
  set available = p_available
  where business_id = p_business_id
    and id = p_id
    and active = true;

  if not found then
    raise exception 'Produto não encontrado ou arquivado.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.set_product_availability(uuid,uuid,text,boolean) from public, anon;
grant execute on function public.set_product_availability(uuid,uuid,text,boolean) to authenticated;

-- Defense in depth: a paused product cannot be inserted in a new sale even if the UI is bypassed.
create or replace function private.enforce_sellable_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.products p
    where p.business_id = new.business_id
      and p.id = new.product_id
      and p.active = true
      and p.available = true
  ) then
    raise exception 'Produto temporariamente indisponível para venda.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_sellable_product() from public, anon, authenticated;

drop trigger if exists sale_items_enforce_sellable_product on public.sale_items;
create trigger sale_items_enforce_sellable_product
before insert on public.sale_items
for each row execute function private.enforce_sellable_product();

commit;
