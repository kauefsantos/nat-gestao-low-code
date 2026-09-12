begin;

-- Correções operacionais do portfólio NAT informadas em 12/09/2026.
-- O histórico de vendas permanece imutável; estas regras valem para o catálogo/receita vigente.

-- Tradicional com Disqueti saiu do portfólio.
update public.products
set active = false,
    available = false,
    updated_at = now()
where portfolio_key = 'brigadeiro-tradicional-disqueti'
   or name = 'Brigadeiro • Tradicional • Disqueti';

-- Padroniza a identidade atual da Surpresa de Uva.
update public.products
set name = 'Surpresa de Uva',
    portfolio_key = 'surpresa-uva',
    updated_at = now()
where portfolio_key in ('surpresa-uva', 'brigadeiro-uva')
   or name in ('Surpresa de Uva', 'Brigadeiro • Surpresa de uva');

-- Receita vigente da Surpresa de Uva (rendimento atual: 20 unidades):
-- massa de Ninho + 5 g de uva/unidade + 3 g de confeito de Ninho/unidade.
-- A massa usa 41 g de Leite Ninho; o confeito adiciona 60 g por lote, totalizando 101 g.
update public.recipe_items ri
set quantity = 100,
    unit = 'g'
from public.products p,
     public.supplies s
where p.business_id = ri.business_id
  and p.id = ri.product_id
  and s.business_id = ri.business_id
  and s.id = ri.supply_id
  and p.portfolio_key = 'surpresa-uva'
  and s.name = 'Uva';

update public.recipe_items ri
set quantity = 101,
    unit = 'g'
from public.products p,
     public.supplies s
where p.business_id = ri.business_id
  and p.id = ri.product_id
  and s.business_id = ri.business_id
  and s.id = ri.supply_id
  and p.portfolio_key = 'surpresa-uva'
  and s.name = 'Leite Ninho Nestlé';

commit;
