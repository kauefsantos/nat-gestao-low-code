create table if not exists public.nat_workspace (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"version":1,"supplies":[],"products":[],"sales":[],"settings":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.nat_workspace enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nat_workspace'
      and policyname = 'Users can read their NAT workspace'
  ) then
    create policy "Users can read their NAT workspace"
      on public.nat_workspace
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nat_workspace'
      and policyname = 'Users can insert their NAT workspace'
  ) then
    create policy "Users can insert their NAT workspace"
      on public.nat_workspace
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nat_workspace'
      and policyname = 'Users can update their NAT workspace'
  ) then
    create policy "Users can update their NAT workspace"
      on public.nat_workspace
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'nat_workspace'
      and policyname = 'Users can delete their NAT workspace'
  ) then
    create policy "Users can delete their NAT workspace"
      on public.nat_workspace
      for delete
      to authenticated
      using (auth.uid() = user_id);
  end if;
end
$$;