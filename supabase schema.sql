-- Supabase → SQL Editor → New query → shuni to'liq qo'yib "Run" bosing.

create table if not exists public.dokon_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  version    bigint      not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.dokon_data enable row level security;

drop policy if exists "own select" on public.dokon_data;
drop policy if exists "own insert" on public.dokon_data;
drop policy if exists "own update" on public.dokon_data;
drop policy if exists "own delete" on public.dokon_data;

create policy "own select" on public.dokon_data for select to authenticated using (auth.uid() = user_id);
create policy "own insert" on public.dokon_data for insert to authenticated with check (auth.uid() = user_id);
create policy "own update" on public.dokon_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own delete" on public.dokon_data for delete to authenticated using (auth.uid() = user_id);

create or replace function public.dokon_bump() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.version := 1; else new.version := old.version + 1; end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists dokon_bump_trg on public.dokon_data;
create trigger dokon_bump_trg before insert or update on public.dokon_data
for each row execute function public.dokon_bump();

grant select, insert, update, delete on public.dokon_data to authenticated;
