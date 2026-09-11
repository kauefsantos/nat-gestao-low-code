begin;

-- Read-only commercial quote used by the frontend before a sale is persisted.
-- It intentionally reuses the same historical/FIFO cost functions as save_sale_items_v4
-- so UI safeguards never depend on the latest purchase price alone.
create or replace function public.quote_sale_v1(
  p_business_id uuid,
  p_items jsonb,
  p_total_received numeric,
  p_payment_method text,
  p_sold_at timestamptz,
  p_transaction_type text default 'sale',
  p_delivery_cost numeric default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_quantity numeric;
  v_unit_cost numeric;
  v_total_cost numeric:=0;
  v_total_list numeric:=0;
  v_total_quantity numeric:=0;
  v_fee_percent numeric:=0;
  v_variable_fee numeric:=0;
  v_delivery numeric:=0;
  v_contribution numeric:=0;
  v_sale_date date;
  v_seen uuid[]:=array[]::uuid[];
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_transaction_type not in ('sale','courtesy','personal_consumption','loss') then
    raise exception 'Tipo de movimentação inválido.' using errcode='22023';
  end if;
  if p_id is not null then null; end if;
  if p_sold_at is null
     or p_total_received is null
     or p_total_received < 0
     or p_payment_method not in ('pix','cash','card','other')
     or jsonb_typeof(coalesce(p_items,'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Dados da movimentação inválidos.' using errcode='22023';
  end if;
  if p_transaction_type <> 'sale' and p_total_received <> 0 then
    raise exception 'Movimentações sem venda precisam ter valor recebido igual a zero.' using errcode='22023';
  end if;
  if coalesce(p_delivery_cost,0) < 0 then
    raise exception 'O custo de entrega não pode ser negativo.' using errcode='22023';
  end if;
  if p_transaction_type <> 'sale' and coalesce(p_delivery_cost,0) <> 0 then
    raise exception 'Movimentações sem venda não podem ter custo de entrega.' using errcode='22023';
  end if;

  v_sale_date:=(p_sold_at at time zone 'America/Sao_Paulo')::date;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      v_product_id:=nullif(v_item->>'productId','')::uuid;
      v_quantity:=nullif(v_item->>'quantity','')::numeric;
    exception when others then
      raise exception 'Item inválido.' using errcode='22023';
    end;
    if v_product_id is null or v_quantity is null or v_quantity<=0 or trunc(v_quantity)<>v_quantity then
      raise exception 'A quantidade de produtos acabados precisa ser inteira e maior que zero.' using errcode='22023';
    end if;
    if v_product_id=any(v_seen) then
      raise exception 'O mesmo produto não pode aparecer duas vezes.' using errcode='22023';
    end if;
    v_seen:=array_append(v_seen,v_product_id);

    select * into v_product
    from public.products
    where business_id=p_business_id and id=v_product_id and active=true;
    if not found then
      raise exception 'Produto não encontrado ou inativo.' using errcode='22023';
    end if;
    if p_transaction_type='sale' and v_product.available=false then
      raise exception 'Produto temporariamente indisponível para venda.' using errcode='22023';
    end if;

    v_unit_cost:=private.product_unit_cost_for_sale(p_business_id,v_product_id,v_quantity,v_sale_date);
    v_total_cost:=v_total_cost+(v_unit_cost*v_quantity);
    v_total_list:=v_total_list+(v_product.selling_price*v_quantity);
    v_total_quantity:=v_total_quantity+v_quantity;
  end loop;

  v_fee_percent:=coalesce(private.payment_fee_for_method(p_business_id,p_payment_method),0);
  v_variable_fee:=case when p_transaction_type='sale' then p_total_received*v_fee_percent/100 else 0 end;
  v_delivery:=case when p_transaction_type='sale' then coalesce(p_delivery_cost,0) else 0 end;
  v_contribution:=(case when p_transaction_type='sale' then p_total_received else 0 end)-v_total_cost-v_variable_fee-v_delivery;

  return jsonb_build_object(
    'listTotal',v_total_list,
    'totalCost',v_total_cost,
    'totalQuantity',v_total_quantity,
    'variableFee',v_variable_fee,
    'deliveryCost',v_delivery,
    'contribution',v_contribution,
    'marginPercent',case when p_transaction_type='sale' and p_total_received>0 then v_contribution/p_total_received*100 else 0 end,
    'belowCost',(p_transaction_type='sale' and v_contribution<0)
  );
end;
$$;

revoke all on function public.quote_sale_v1(uuid,jsonb,numeric,text,timestamptz,text,numeric) from public,anon;
grant execute on function public.quote_sale_v1(uuid,jsonb,numeric,text,timestamptz,text,numeric) to authenticated,service_role;

commit;
