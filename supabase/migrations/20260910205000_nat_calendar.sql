create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  event_date date not null,
  event_time time,
  kind text not null check (kind in ('content','delivery','production','purchase')),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  details text,
  channel text,
  objective text,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  source text not null default 'manual' check (source in ('manual','editorial_seed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_business_date_idx
  on public.calendar_events(business_id,event_date,event_time);
create unique index if not exists calendar_events_seed_unique_idx
  on public.calendar_events(business_id,event_date,title)
  where source='editorial_seed';

alter table public.calendar_events enable row level security;
drop policy if exists calendar_events_select on public.calendar_events;
create policy calendar_events_select on public.calendar_events
  for select to authenticated
  using (private.is_business_member(business_id));

revoke all on table public.calendar_events from public,anon,authenticated;
grant select on table public.calendar_events to authenticated;

drop trigger if exists calendar_events_audit on public.calendar_events;
create trigger calendar_events_audit
after insert or update or delete on public.calendar_events
for each row execute function private.audit_row_change();

create or replace function public.save_calendar_event(
  p_business_id uuid,
  p_id uuid,
  p_event_date date,
  p_event_time time,
  p_kind text,
  p_title text,
  p_details text,
  p_channel text,
  p_objective text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_id is null or p_event_date is null
     or p_kind not in ('content','delivery','production','purchase')
     or char_length(btrim(coalesce(p_title,''))) not between 1 and 180
     or p_status not in ('planned','done','cancelled') then
    raise exception 'Dados do calendário inválidos.' using errcode='22023';
  end if;

  insert into public.calendar_events(
    id,business_id,event_date,event_time,kind,title,details,channel,objective,status,source
  ) values (
    p_id,p_business_id,p_event_date,p_event_time,p_kind,btrim(p_title),nullif(btrim(coalesce(p_details,'')),''),
    nullif(btrim(coalesce(p_channel,'')),''),nullif(btrim(coalesce(p_objective,'')),''),p_status,'manual'
  )
  on conflict (id) do update set
    event_date=excluded.event_date,
    event_time=excluded.event_time,
    kind=excluded.kind,
    title=excluded.title,
    details=excluded.details,
    channel=excluded.channel,
    objective=excluded.objective,
    status=excluded.status,
    updated_at=now()
  where public.calendar_events.business_id=p_business_id;

  if not exists(select 1 from public.calendar_events where id=p_id and business_id=p_business_id) then
    raise exception 'O evento pertence a outra empresa.' using errcode='42501';
  end if;
end;
$$;

create or replace function public.delete_calendar_event(p_business_id uuid,p_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  delete from public.calendar_events where business_id=p_business_id and id=p_id;
end;
$$;

create or replace function public.seed_nat_editorial_calendar(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.is_business_member(p_business_id) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;

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
end;
$$;

revoke all on function public.save_calendar_event(uuid,uuid,date,time,text,text,text,text,text,text) from public,anon;
revoke all on function public.delete_calendar_event(uuid,uuid) from public,anon;
revoke all on function public.seed_nat_editorial_calendar(uuid) from public,anon;
grant execute on function public.save_calendar_event(uuid,uuid,date,time,text,text,text,text,text,text) to authenticated;
grant execute on function public.delete_calendar_event(uuid,uuid) to authenticated;
grant execute on function public.seed_nat_editorial_calendar(uuid) to authenticated;
