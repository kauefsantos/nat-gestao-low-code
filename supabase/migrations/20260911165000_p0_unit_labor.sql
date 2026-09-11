begin;

-- The technical single-unit Ninho product used R$1.50 as labor in the legacy generic production-cost field.
update public.products
set labor_cost_per_batch=1.50,
    production_cost_per_batch=0,
    available=false,
    updated_at=now()
where name='Brigadeiro • Ninho • Unitário'
  and labor_cost_per_batch=0
  and production_cost_per_batch=1.50;

-- Preserve owner-remuneration analytics for its already-recorded courtesy.
update public.sale_items si
set labor_cost_snapshot=round((p.labor_cost_per_batch/nullif(p.batch_yield,0))::numeric,4)
from public.products p
where p.business_id=si.business_id
  and p.id=si.product_id
  and p.name='Brigadeiro • Ninho • Unitário'
  and si.labor_cost_snapshot=0;

commit;
