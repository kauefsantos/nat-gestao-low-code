begin;

create unique index if not exists ai_generation_log_correlation_unique
  on public.ai_generation_log(business_id,user_id,correlation_id)
  where correlation_id is not null;

create or replace function public.save_calendar_event_v3(
  p_business_id uuid,p_request_id uuid,p_id uuid,p_expected_updated_at text,p_event_date date,p_event_time time,p_kind text,p_title text,p_details text,p_channel text,p_objective text,p_status text,p_reminder_enabled boolean
) returns void language plpgsql security definer set search_path='' as $$
declare
  v_hash text;v_existing text;v_row public.calendar_events%rowtype;v_same boolean:=false;
begin
  if p_request_id is null then raise exception 'request_id é obrigatório.' using errcode='22023'; end if;
  v_hash:=encode(extensions.digest(concat_ws('|',p_id::text,coalesce(p_expected_updated_at,''),p_event_date::text,coalesce(p_event_time::text,''),p_kind,btrim(coalesce(p_title,'')),coalesce(nullif(btrim(coalesce(p_details,'')),''),''),coalesce(nullif(btrim(coalesce(p_channel,'')),''),''),coalesce(nullif(btrim(coalesce(p_objective,'')),''),''),p_status,coalesce(p_reminder_enabled,true)::text),'sha256'),'hex');
  select request_hash into v_existing from private.calendar_mutation_requests where business_id=p_business_id and request_id=p_request_id;
  if found then
    if v_existing<>v_hash then raise exception 'CONFLICT: request_id reutilizado com conteúdo diferente.' using errcode='40001'; end if;
    return;
  end if;

  -- Se a resposta do primeiro commit se perder, o formulário mantém o mesmo event_id.
  -- Um novo request_id com exatamente o mesmo conteúdo é tratado como replay bem-sucedido.
  if p_expected_updated_at is null then
    select * into v_row from public.calendar_events where business_id=p_business_id and id=p_id;
    if found then
      v_same:=v_row.event_date=p_event_date
        and v_row.event_time is not distinct from p_event_time
        and v_row.kind=p_kind
        and v_row.title=btrim(p_title)
        and v_row.details is not distinct from nullif(btrim(coalesce(p_details,'')),'')
        and v_row.channel is not distinct from nullif(btrim(coalesce(p_channel,'')),'')
        and v_row.objective is not distinct from nullif(btrim(coalesce(p_objective,'')),'')
        and v_row.status=p_status
        and v_row.reminder_enabled=coalesce(p_reminder_enabled,true);
      if not v_same then raise exception 'CONFLICT: compromisso já existe com conteúdo diferente.' using errcode='40001'; end if;
      insert into private.calendar_mutation_requests(business_id,request_id,request_hash,event_id) values(p_business_id,p_request_id,v_hash,p_id);
      return;
    end if;
  end if;

  perform public.save_calendar_event_v2(p_business_id,p_id,p_expected_updated_at,p_event_date,p_event_time,p_kind,p_title,p_details,p_channel,p_objective,p_status,p_reminder_enabled);
  insert into private.calendar_mutation_requests(business_id,request_id,request_hash,event_id) values(p_business_id,p_request_id,v_hash,p_id);
end $$;

revoke all on function public.save_calendar_event_v3(uuid,uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.save_calendar_event_v3(uuid,uuid,uuid,text,date,time,text,text,text,text,text,text,boolean) to authenticated;

commit;
