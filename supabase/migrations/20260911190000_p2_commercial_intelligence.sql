begin;

alter table public.sales add column if not exists sale_channel text not null default 'other' check (sale_channel in ('whatsapp','instagram','street','referral','in_person','other'));
alter table public.sales add column if not exists delivery_cost_snapshot numeric(14,2) not null default 0 check (delivery_cost_snapshot >= 0);
alter table public.sales add column if not exists discount_reason text check (discount_reason is null or char_length(btrim(discount_reason)) between 2 and 500);
alter table public.sales add column if not exists below_cost_override boolean not null default false;

create index if not exists sales_business_channel_idx on public.sales(business_id,sale_channel,sold_at desc) where status='completed' and transaction_type='sale';

create or replace function public.save_sale_items_v4(
  p_business_id uuid,
  p_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_customer_id uuid default null,
  p_transaction_type text default 'sale',
  p_sale_channel text default 'other',
  p_delivery_cost numeric default 0,
  p_discount_reason text default null,
  p_below_cost_override boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_contribution numeric;
  v_list_total numeric:=0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_sale_channel not in ('whatsapp','instagram','street','referral','in_person','other') then
    raise exception 'Canal de venda inválido.' using errcode='22023';
  end if;
  if coalesce(p_delivery_cost,0) < 0 then
    raise exception 'O custo de entrega não pode ser negativo.' using errcode='22023';
  end if;
  if p_transaction_type <> 'sale' and coalesce(p_delivery_cost,0) <> 0 then
    raise exception 'Movimentações sem venda não podem ter custo de entrega.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_items,'null'::jsonb))='array' then
    for v_item in select value from jsonb_array_elements(p_items) loop
      begin
        v_product_id:=nullif(v_item->>'productId','')::uuid;
        v_quantity:=nullif(v_item->>'quantity','')::numeric;
      exception when others then
        raise exception 'Item inválido.' using errcode='22023';
      end;
      if v_quantity is null or v_quantity<=0 or trunc(v_quantity)<>v_quantity then
        raise exception 'A quantidade de produtos acabados precisa ser inteira e maior que zero.' using errcode='22023';
      end if;
      select * into v_product from public.products where business_id=p_business_id and id=v_product_id and active=true;
      if found then v_list_total:=v_list_total+(v_product.selling_price*v_quantity); end if;
    end loop;
  end if;

  perform public.save_sale_items_v3(p_business_id,p_id,p_items,p_total_received,p_payment_method,p_sold_at,p_customer_id,p_transaction_type);

  update public.sales
     set sale_channel = case when p_transaction_type='sale' then p_sale_channel else 'other' end,
         delivery_cost_snapshot = case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end,
         discount_reason = case when p_transaction_type='sale' then nullif(btrim(coalesce(p_discount_reason,'')),'') else null end,
         below_cost_override = case when p_transaction_type='sale' then coalesce(p_below_cost_override,false) else false end,
         contribution_snapshot = contribution_snapshot - case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end,
         updated_at=now()
   where business_id=p_business_id and id=p_id
   returning contribution_snapshot into v_contribution;

  if p_transaction_type='sale' and coalesce(p_total_received,0) < v_list_total and nullif(btrim(coalesce(p_discount_reason,'')),'') is null then
    raise exception 'Informe o motivo do desconto para salvar a venda.' using errcode='22023';
  end if;
  if p_transaction_type='sale' and v_contribution < 0 and not coalesce(p_below_cost_override,false) then
    raise exception 'Esta venda fica abaixo do custo. Confirme conscientemente para continuar.' using errcode='22023';
  end if;
  if p_transaction_type='sale' and v_contribution < 0 and coalesce(p_below_cost_override,false) and nullif(btrim(coalesce(p_discount_reason,'')),'') is null then
    raise exception 'Informe o motivo para confirmar uma venda abaixo do custo.' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean) from public,anon;
grant execute on function public.save_sale_items_v4(uuid,uuid,jsonb,numeric,text,timestamptz,uuid,text,text,numeric,text,boolean) to authenticated,service_role;

commit;
