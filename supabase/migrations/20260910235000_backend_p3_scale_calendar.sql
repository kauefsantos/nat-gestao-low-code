-- Backend P3: idempotent transitions, scalable read APIs, and production-ready calendar lifecycle.
begin;

-- Idempotency ledger. A row only survives when the enclosing mutation transaction commits.
create table if not exists public.mutation_requests (
  business_id uuid not null references public.businesses(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null check (char_length(request_hash) = 32),
  created_at timestamptz not null default now(),
  primary key (business_id, request_id)
);

alter table public.mutation_requests enable row level security;
revoke all on table public.mutation_requests from public, anon, authenticated;
grant select, insert on table public.mutation_requests to service_role;
create index if not exists mutation_requests_created_idx on public.mutation_requests(created_at);

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

  perform public.apply_nat_transition(p_business_id,p_operations);
end;
$$;

revoke all on function public.apply_nat_transition_v2(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_nat_transition_v2(uuid,uuid,jsonb) to authenticated;

-- Dashboard summary computed server-side so the UI does not need full history for monthly KPIs.
create or replace function public.get_dashboard_summary(
  p_business_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month',coalesce(p_reference_date,current_date))::date;
  v_month_end date := (date_trunc('month',coalesce(p_reference_date,current_date)) + interval '1 month')::date;
  v_sales_count bigint := 0;
  v_revenue numeric := 0;
  v_units numeric := 0;
  v_contribution numeric := 0;
  v_sporadic numeric := 0;
  v_fixed numeric := 0;
  v_top jsonb := null;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;

  select count(*),coalesce(sum(total_received),0),coalesce(sum(contribution_snapshot),0)
    into v_sales_count,v_revenue,v_contribution
  from public.sales
  where business_id=p_business_id and status='completed'
    and (sold_at at time zone 'America/Sao_Paulo')::date >= v_month_start
    and (sold_at at time zone 'America/Sao_Paulo')::date < v_month_end;

  select coalesce(sum(si.quantity),0)
    into v_units
  from public.sale_items si
  join public.sales s on s.id=si.sale_id and s.business_id=si.business_id
  where s.business_id=p_business_id and s.status='completed'
    and (s.sold_at at time zone 'America/Sao_Paulo')::date >= v_month_start
    and (s.sold_at at time zone 'America/Sao_Paulo')::date < v_month_end;

  select coalesce(sum(amount),0) into v_sporadic
  from public.sporadic_expenses
  where business_id=p_business_id and spent_at>=v_month_start and spent_at<v_month_end;

  select coalesce(monthly_fixed_costs,0) into v_fixed
  from public.business_settings where business_id=p_business_id;

  select jsonb_build_object('productId',q.product_id,'name',q.product_name_snapshot,'quantity',q.qty)
    into v_top
  from (
    select si.product_id,max(si.product_name_snapshot) as product_name_snapshot,sum(si.quantity) as qty
    from public.sale_items si
    join public.sales s on s.id=si.sale_id and s.business_id=si.business_id
    where s.business_id=p_business_id and s.status='completed'
      and (s.sold_at at time zone 'America/Sao_Paulo')::date >= v_month_start
      and (s.sold_at at time zone 'America/Sao_Paulo')::date < v_month_end
    group by si.product_id
    order by sum(si.quantity) desc, max(si.product_name_snapshot)
    limit 1
  ) q;

  return jsonb_build_object(
    'monthStart',v_month_start,
    'salesCount',v_sales_count,
    'revenue',v_revenue,
    'units',v_units,
    'contribution',v_contribution,
    'sporadicExpenses',v_sporadic,
    'monthlyFixedCosts',v_fixed,
    'estimatedResult',v_contribution-v_sporadic-v_fixed,
    'topProduct',v_top
  );
end;
$$;
revoke all on function public.get_dashboard_summary(uuid,date) from public,anon;
grant execute on function public.get_dashboard_summary(uuid,date) to authenticated;

-- Keyset-paginated history APIs for future large datasets.
create or replace function public.list_sales_page(
  p_business_id uuid,
  p_limit integer default 30,
  p_before_sold_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,30),1),100);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_sold_at timestamptz;
  v_next_id uuid;
begin
  if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
  if (p_before_sold_at is null) <> (p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='22023'; end if;

  with page as (
    select s.*
    from public.sales s
    where s.business_id=p_business_id
      and (p_before_sold_at is null or (s.sold_at,s.id) < (p_before_sold_at,p_before_id))
    order by s.sold_at desc,s.id desc
    limit v_limit+1
  ), trimmed as (
    select * from page order by sold_at desc,id desc limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'soldAt',t.sold_at,'totalReceived',t.total_received,'paymentMethod',t.payment_method,
    'variableFeeSnapshot',t.variable_fee_snapshot,'contributionSnapshot',t.contribution_snapshot,
    'status',t.status,'cancelledAt',t.cancelled_at,'cancelReason',t.cancel_reason,'updatedAt',t.updated_at,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',si.id,'productId',si.product_id,'productName',si.product_name_snapshot,
      'portfolioKey',si.portfolio_key_snapshot,'quantity',si.quantity,
      'unitCostSnapshot',si.unit_cost_snapshot,'unitPriceSnapshot',si.unit_price_snapshot
    ) order by si.created_at,si.id) from public.sale_items si where si.sale_id=t.id and si.business_id=p_business_id),'[]'::jsonb)
  ) order by t.sold_at desc,t.id desc),'[]'::jsonb)
  into v_items from trimmed t;

  with page as (
    select s.sold_at,s.id from public.sales s
    where s.business_id=p_business_id
      and (p_before_sold_at is null or (s.sold_at,s.id) < (p_before_sold_at,p_before_id))
    order by s.sold_at desc,s.id desc limit v_limit+1
  ), trimmed as (select * from page order by sold_at desc,id desc limit v_limit)
  select (select count(*)>v_limit from page),t.sold_at,t.id
    into v_has_more,v_next_sold_at,v_next_id
  from trimmed t order by t.sold_at asc,t.id asc limit 1;

  return jsonb_build_object('items',v_items,'hasMore',coalesce(v_has_more,false),'nextCursor',case when v_has_more then jsonb_build_object('soldAt',v_next_sold_at,'id',v_next_id) else null end);
end;
$$;

create or replace function public.list_expenses_page(
  p_business_id uuid,p_limit integer default 30,p_before_spent_at date default null,p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,30),1),100); v_items jsonb:='[]'::jsonb; v_has_more boolean:=false; v_date date; v_id uuid;
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if (p_before_spent_at is null) <> (p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='22023'; end if;
 with page as (select * from public.sporadic_expenses where business_id=p_business_id and (p_before_spent_at is null or (spent_at,id)<(p_before_spent_at,p_before_id)) order by spent_at desc,id desc limit v_limit+1), trimmed as (select * from page order by spent_at desc,id desc limit v_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'amount',amount,'spentAt',spent_at,'updatedAt',updated_at) order by spent_at desc,id desc),'[]'::jsonb) into v_items from trimmed;
 with page as (select spent_at,id from public.sporadic_expenses where business_id=p_business_id and (p_before_spent_at is null or (spent_at,id)<(p_before_spent_at,p_before_id)) order by spent_at desc,id desc limit v_limit+1), trimmed as (select * from page order by spent_at desc,id desc limit v_limit)
 select (select count(*)>v_limit from page),spent_at,id into v_has_more,v_date,v_id from trimmed order by spent_at asc,id asc limit 1;
 return jsonb_build_object('items',v_items,'hasMore',coalesce(v_has_more,false),'nextCursor',case when v_has_more then jsonb_build_object('spentAt',v_date,'id',v_id) else null end);
end; $$;

create or replace function public.list_supply_purchases_page(
  p_business_id uuid,p_limit integer default 30,p_before_purchased_at date default null,p_before_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,30),1),100); v_items jsonb:='[]'::jsonb; v_has_more boolean:=false; v_date date; v_id uuid;
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if (p_before_purchased_at is null) <> (p_before_id is null) then raise exception 'Cursor incompleto.' using errcode='22023'; end if;
 with page as (
   select sp.*,s.name as supply_name,s.category as supply_category from public.supply_purchases sp join public.supplies s on s.id=sp.supply_id and s.business_id=sp.business_id
   where sp.business_id=p_business_id and (p_before_purchased_at is null or (sp.purchased_at,sp.id)<(p_before_purchased_at,p_before_id)) order by sp.purchased_at desc,sp.id desc limit v_limit+1
 ), trimmed as (select * from page order by purchased_at desc,id desc limit v_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'supplyId',supply_id,'supplyName',supply_name,'category',supply_category,'packageQuantity',package_quantity,'packageUnit',package_unit,'packagePrice',package_price,'purchasedAt',purchased_at,'createdAt',created_at) order by purchased_at desc,id desc),'[]'::jsonb) into v_items from trimmed;
 with page as (select purchased_at,id from public.supply_purchases where business_id=p_business_id and (p_before_purchased_at is null or (purchased_at,id)<(p_before_purchased_at,p_before_id)) order by purchased_at desc,id desc limit v_limit+1), trimmed as (select * from page order by purchased_at desc,id desc limit v_limit)
 select (select count(*)>v_limit from page),purchased_at,id into v_has_more,v_date,v_id from trimmed order by purchased_at asc,id asc limit 1;
 return jsonb_build_object('items',v_items,'hasMore',coalesce(v_has_more,false),'nextCursor',case when v_has_more then jsonb_build_object('purchasedAt',v_date,'id',v_id) else null end);
end; $$;

revoke all on function public.list_sales_page(uuid,integer,timestamptz,uuid) from public,anon;
revoke all on function public.list_expenses_page(uuid,integer,date,uuid) from public,anon;
revoke all on function public.list_supply_purchases_page(uuid,integer,date,uuid) from public,anon;
grant execute on function public.list_sales_page(uuid,integer,timestamptz,uuid) to authenticated;
grant execute on function public.list_expenses_page(uuid,integer,date,uuid) to authenticated;
grant execute on function public.list_supply_purchases_page(uuid,integer,date,uuid) to authenticated;

-- Calendar lifecycle and validation.
alter table public.calendar_events add column if not exists reminder_enabled boolean not null default true;
alter table public.calendar_events add column if not exists completed_at timestamptz;
alter table public.calendar_events add column if not exists cancelled_at timestamptz;
alter table public.calendar_events add column if not exists cancelled_by uuid references auth.users(id) on delete set null;

update public.calendar_events set completed_at=coalesce(completed_at,updated_at,created_at) where status='done' and completed_at is null;
update public.calendar_events set cancelled_at=coalesce(cancelled_at,updated_at,created_at) where status='cancelled' and cancelled_at is null;

alter table public.calendar_events drop constraint if exists calendar_events_details_length_check;
alter table public.calendar_events add constraint calendar_events_details_length_check check (details is null or char_length(details)<=2000);
alter table public.calendar_events drop constraint if exists calendar_events_channel_length_check;
alter table public.calendar_events add constraint calendar_events_channel_length_check check (channel is null or char_length(channel)<=120);
alter table public.calendar_events drop constraint if exists calendar_events_objective_length_check;
alter table public.calendar_events add constraint calendar_events_objective_length_check check (objective is null or char_length(objective)<=240);
alter table public.calendar_events drop constraint if exists calendar_events_lifecycle_check;
alter table public.calendar_events add constraint calendar_events_lifecycle_check check (
  (status='planned' and completed_at is null and cancelled_at is null)
  or (status='done' and completed_at is not null and cancelled_at is null)
  or (status='cancelled' and cancelled_at is not null)
);

create index if not exists calendar_events_business_status_date_idx on public.calendar_events(business_id,status,event_date,event_time);
create index if not exists calendar_events_push_idx on public.calendar_events(event_date,status,reminder_enabled,business_id);

create table if not exists public.calendar_seed_runs (
  business_id uuid not null references public.businesses(id) on delete cascade,
  seed_key text not null,
  created_at timestamptz not null default now(),
  primary key(business_id,seed_key)
);
alter table public.calendar_seed_runs enable row level security;
revoke all on table public.calendar_seed_runs from public,anon,authenticated;

insert into public.calendar_seed_runs(business_id,seed_key)
select distinct business_id,'nat-editorial-2026-09' from public.calendar_events where source='editorial_seed'
on conflict do nothing;

-- Seed is now one-time. Cancelled/deleted suggestions never reappear on a later page load.
create or replace function public.seed_nat_editorial_calendar(p_business_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if exists(select 1 from public.calendar_seed_runs where business_id=p_business_id and seed_key='nat-editorial-2026-09') then return; end if;
 insert into public.calendar_events(business_id,event_date,kind,title,details,channel,objective,source)
 values
    (p_business_id,'2026-09-09','content','Pré-lançamento da NAT','Repostar “vem novidade”.','Feed/Reel + Stories','Apresentar a marca','editorial_seed'),
    (p_business_id,'2026-09-10','content','Enquete: Brownie ou brigadeiro?','Stories: “Brownie ou brigadeiro?” / “Qual sabor não pode faltar?”.','Stories','Começar interação','editorial_seed'),
    (p_business_id,'2026-09-11','content','Conheça a fundadora','A fundadora contando brevemente a trajetória da confeitaria.','Feed/Reel','Humanizar','editorial_seed'),
    (p_business_id,'2026-09-12','content','Escolha de embalagens e identidade visual','Mostrar embalagens, inspirações e construção da identidade.','Stories','Mostrar construção','editorial_seed'),
    (p_business_id,'2026-09-13','content','O que você pode esperar da NAT?','Carrossel + caixa: “Qual doce você gostaria de ver no cardápio?”. Data oficial de início: 16/09.','Feed/Reel + Stories','Posicionamento','editorial_seed'),
    (p_business_id,'2026-09-14','content','Amanhã começam os preparativos','Contagem regressiva para o início dos preparativos.','Stories','Criar expectativa','editorial_seed'),
    (p_business_id,'2026-09-15','content','Bastidores da preparação da NAT','Compras, ingredientes, cozinha organizada e preparação.','Feed/Reel + Stories','Mostrar o início dos preparativos','editorial_seed'),
    (p_business_id,'2026-09-16','content','Primeiro brownie da NAT','Foto/Reel sensorial: corte, recheio e textura + “Hoje a NAT começa de verdade”.','Feed/Reel + Stories','Criar desejo','editorial_seed'),
    (p_business_id,'2026-09-17','content','Enquete entre sabores testados','Perguntar qual sabor mais chamou atenção.','Stories','Envolver seguidores','editorial_seed'),
    (p_business_id,'2026-09-18','content','Bastidores: testes e ajustes','“Aprovado ou volta para a bancada?”.','Feed/Reel + Stories','Mostrar qualidade','editorial_seed'),
    (p_business_id,'2026-09-19','content','Primeiro produto apresentado oficialmente','Detalhes do sabor.','Feed/Reel + Stories','Começar apresentação do cardápio','editorial_seed'),
    (p_business_id,'2026-09-20','content','Spoilers de embalagem e cardápio','Antecipar detalhes visuais e sabores.','Stories','Aquecer lançamento','editorial_seed'),
    (p_business_id,'2026-09-21','content','Está quase na hora…','Post + contagem regressiva.','Feed/Reel + Stories','Preparar abertura das vendas','editorial_seed')
 on conflict do nothing;
 insert into public.calendar_seed_runs(business_id,seed_key) values(p_business_id,'nat-editorial-2026-09') on conflict do nothing;
end; $$;

create or replace function public.save_calendar_event_v2(
  p_business_id uuid,p_id uuid,p_expected_updated_at text,p_event_date date,p_event_time time,p_kind text,p_title text,p_details text,p_channel text,p_objective text,p_status text,p_reminder_enabled boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare v_actual timestamptz; v_expected timestamptz; v_exists boolean:=false; v_current_status text;
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 if p_id is null or p_event_date is null or p_kind not in ('content','delivery','production','purchase') or char_length(btrim(coalesce(p_title,''))) not between 1 and 180 or p_status not in ('planned','done','cancelled') then raise exception 'Dados do calendário inválidos.' using errcode='22023'; end if;
 if char_length(coalesce(p_details,''))>2000 or char_length(coalesce(p_channel,''))>120 or char_length(coalesce(p_objective,''))>240 then raise exception 'Texto do calendário excede o limite permitido.' using errcode='22023'; end if;
 if p_expected_updated_at is not null then begin v_expected:=p_expected_updated_at::timestamptz; exception when others then raise exception 'CONFLICT: versão inválida do compromisso.' using errcode='40001'; end; end if;
 select updated_at,status into v_actual,v_current_status from public.calendar_events where id=p_id and business_id=p_business_id; v_exists:=found;
 if p_expected_updated_at is null and v_exists then raise exception 'CONFLICT: compromisso já existe.' using errcode='40001'; end if;
 if p_expected_updated_at is not null and (not v_exists or v_actual is distinct from v_expected) then raise exception 'CONFLICT: compromisso foi alterado em outro aparelho.' using errcode='40001'; end if;
 if v_exists and v_current_status='cancelled' then raise exception 'Compromisso cancelado não pode ser alterado.' using errcode='22023'; end if;

 if not v_exists then
   insert into public.calendar_events(id,business_id,event_date,event_time,kind,title,details,channel,objective,status,source,reminder_enabled,completed_at,cancelled_at,cancelled_by)
   values(p_id,p_business_id,p_event_date,p_event_time,p_kind,btrim(p_title),nullif(btrim(coalesce(p_details,'')),''),nullif(btrim(coalesce(p_channel,'')),''),nullif(btrim(coalesce(p_objective,'')),''),p_status,'manual',coalesce(p_reminder_enabled,true),case when p_status='done' then now() end,case when p_status='cancelled' then now() end,case when p_status='cancelled' then auth.uid() end);
 else
   update public.calendar_events set event_date=p_event_date,event_time=p_event_time,kind=p_kind,title=btrim(p_title),details=nullif(btrim(coalesce(p_details,'')),''),channel=nullif(btrim(coalesce(p_channel,'')),''),objective=nullif(btrim(coalesce(p_objective,'')),''),status=p_status,reminder_enabled=coalesce(p_reminder_enabled,true),completed_at=case when p_status='done' then coalesce(completed_at,now()) else null end,cancelled_at=case when p_status='cancelled' then coalesce(cancelled_at,now()) else null end,cancelled_by=case when p_status='cancelled' then coalesce(cancelled_by,auth.uid()) else null end,updated_at=now() where id=p_id and business_id=p_business_id;
 end if;
end; $$;

create or replace function public.cancel_calendar_event_v2(p_business_id uuid,p_id uuid,p_expected_updated_at text)
returns void language plpgsql security definer set search_path='' as $$
declare v_actual timestamptz; v_expected timestamptz; v_status text;
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 begin v_expected:=p_expected_updated_at::timestamptz; exception when others then raise exception 'CONFLICT: versão inválida do compromisso.' using errcode='40001'; end;
 select updated_at,status into v_actual,v_status from public.calendar_events where business_id=p_business_id and id=p_id;
 if not found or v_actual is distinct from v_expected then raise exception 'CONFLICT: compromisso foi alterado em outro aparelho.' using errcode='40001'; end if;
 if v_status='cancelled' then return; end if;
 update public.calendar_events set status='cancelled',completed_at=null,cancelled_at=now(),cancelled_by=auth.uid(),updated_at=now() where business_id=p_business_id and id=p_id;
end; $$;

-- Legacy delete becomes non-destructive cancellation.
create or replace function public.delete_calendar_event(p_business_id uuid,p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_business_member(p_business_id) then raise exception 'Acesso negado.' using errcode='42501'; end if;
 update public.calendar_events set status='cancelled',completed_at=null,cancelled_at=coalesce(cancelled_at,now()),cancelled_by=coalesce(cancelled_by,auth.uid()),updated_at=now() where business_id=p_business_id and id=p_id and status<>'cancelled';
end; $$;

revoke all on function public.save_calendar_event_v2(uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) from public,anon;
revoke all on function public.cancel_calendar_event_v2(uuid,uuid,text) from public,anon;
grant execute on function public.save_calendar_event_v2(uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.cancel_calendar_event_v2(uuid,uuid,text) to authenticated;

commit;
