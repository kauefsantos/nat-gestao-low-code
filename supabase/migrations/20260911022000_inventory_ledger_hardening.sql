-- Inventory ledger integrity: automatic directions are fixed and posted movements are immutable.
begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='inventory_movements_direction_check'
      and conrelid='public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_direction_check check (
        (movement_type in ('opening','purchase','production_in','sale_cancel') and quantity_delta>0)
        or (movement_type in ('production_out','sale') and quantity_delta<0)
        or (movement_type='adjustment' and quantity_delta<>0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='inventory_movements_source_check'
      and conrelid='public.inventory_movements'::regclass
  ) then
    alter table public.inventory_movements
      add constraint inventory_movements_source_check check (
        (movement_type in ('opening','adjustment'))
        or nullif(btrim(source_key),'') is not null
      );
  end if;
end $$;

create or replace function private.prevent_inventory_movement_mutation()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if current_user in ('postgres','supabase_admin') then
    return coalesce(new,old);
  end if;
  raise exception 'Movimentos de estoque já lançados não podem ser alterados ou apagados.' using errcode='42501';
end;
$$;
revoke all on function private.prevent_inventory_movement_mutation() from public,anon,authenticated;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function private.prevent_inventory_movement_mutation();

commit;
