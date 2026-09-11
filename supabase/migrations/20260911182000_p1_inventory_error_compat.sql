begin;

-- Preserve the established error contract used by existing clients/tests while P1
-- extends the same trigger to non-commercial outgoing movements.
create or replace function private.inventory_after_sale_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_tracking public.inventory_tracking%rowtype; v_balance numeric; v_pack record; v_sale public.sales%rowtype; v_required numeric;
begin
  select * into v_sale from public.sales where business_id=new.business_id and id=new.sale_id;
  select * into v_tracking from public.inventory_tracking where business_id=new.business_id and product_id=new.product_id;
  if found then
    perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':product:'||new.product_id::text,0));
    v_balance:=private.inventory_balance(new.business_id,'product',new.product_id);
    if v_balance<new.quantity then raise exception 'Estoque insuficiente do produto acabado para concluir a venda.' using errcode='22023'; end if;
    insert into public.inventory_movements(business_id,product_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(new.business_id,new.product_id,-new.quantity,'unit','sale','sale:'||new.id::text,'Saída: '||coalesce(v_sale.transaction_type,'sale'),v_sale.sold_at,auth.uid())
    on conflict (business_id,source_key) where source_key is not null do nothing;
  end if;

  for v_pack in
    select r.supply_id,t.base_unit,sum(private.unit_base_amount(r.quantity,r.unit)/p.batch_yield*new.quantity) as required_quantity
    from public.recipe_items r
    join public.supplies s on s.business_id=r.business_id and s.id=r.supply_id and s.category='packaging'
    join public.inventory_tracking t on t.business_id=r.business_id and t.supply_id=r.supply_id
    join public.products p on p.business_id=r.business_id and p.id=r.product_id
    where r.business_id=new.business_id and r.product_id=new.product_id
    group by r.supply_id,t.base_unit
  loop
    v_required:=v_pack.required_quantity;
    perform pg_advisory_xact_lock(hashtextextended(new.business_id::text||':supply:'||v_pack.supply_id::text,0));
    v_balance:=private.inventory_balance(new.business_id,'supply',v_pack.supply_id);
    if v_balance<v_required then raise exception 'Estoque insuficiente de embalagem para concluir a venda.' using errcode='22023'; end if;
    insert into public.inventory_movements(business_id,supply_id,quantity_delta,base_unit,movement_type,source_key,note,occurred_at,created_by)
    values(new.business_id,v_pack.supply_id,-v_required,v_pack.base_unit,'sale','sale:'||new.id::text||':packaging:'||v_pack.supply_id::text,'Embalagem usada na saída',v_sale.sold_at,auth.uid())
    on conflict (business_id,source_key) where source_key is not null do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function private.inventory_after_sale_item() from public,anon,authenticated;

commit;
