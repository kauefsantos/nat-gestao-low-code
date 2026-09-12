begin;

-- Keep the operational settings contract explicit. The frontend already requests a
-- business timezone and all NAT business-time calculations currently use São Paulo.
alter table public.business_settings
  add column if not exists timezone text not null default 'America/Sao_Paulo';

update public.business_settings
set timezone='America/Sao_Paulo'
where timezone is null or btrim(timezone)='';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='business_settings_timezone_nonempty_check'
      and conrelid='public.business_settings'::regclass
  ) then
    alter table public.business_settings
      add constraint business_settings_timezone_nonempty_check
      check (char_length(btrim(timezone)) between 1 and 80);
  end if;
end $$;

commit;
