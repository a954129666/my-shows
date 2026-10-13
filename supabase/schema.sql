-- 在 Supabase Dashboard > SQL Editor 中完整执行本文件。
create table if not exists public.shows (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tmdb_id bigint not null default 0,
  name text not null,
  english_name text not null default '',
  country text not null default '未知',
  year integer,
  seasons integer not null default 1 check (seasons >= 0),
  episodes integer not null default 0 check (episodes >= 0),
  season_episodes jsonb,
  poster text,
  genres jsonb,
  review text not null default '' check (char_length(review) <= 200),
  airing_status text not null check (airing_status in ('ended', 'ongoing')),
  watch_status text not null check (watch_status in ('watching', 'completed', 'planned', 'dropped')),
  current_season integer not null default 1 check (current_season >= 1),
  current_episode integer not null default 1 check (current_episode >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Also supports projects created with an earlier version of this schema.
alter table public.shows add column if not exists genres jsonb;
alter table public.shows add column if not exists review text not null default '';

create index if not exists shows_user_id_created_at_idx
  on public.shows (user_id, created_at desc);

alter table public.shows enable row level security;

drop policy if exists "Users can read own shows" on public.shows;
create policy "Users can read own shows"
  on public.shows for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own shows" on public.shows;
create policy "Users can insert own shows"
  on public.shows for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own shows" on public.shows;
create policy "Users can update own shows"
  on public.shows for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own shows" on public.shows;
create policy "Users can delete own shows"
  on public.shows for delete
  using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shows_set_updated_at on public.shows;
create trigger shows_set_updated_at
before update on public.shows
for each row execute function public.set_updated_at();
