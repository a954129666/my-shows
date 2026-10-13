-- Execute once in Supabase SQL Editor before deploying public beta.
create table if not exists public.tmdb_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  request_count integer not null
);
alter table public.tmdb_request_limits enable row level security;
revoke all on public.tmdb_request_limits from anon, authenticated;
create or replace function public.consume_tmdb_request()
returns boolean language plpgsql security definer set search_path = public as $$
declare allowed boolean; owner uuid := auth.uid();
begin
  if owner is null then return false; end if;
  insert into public.tmdb_request_limits as limits values (owner, date_trunc('minute', now()), 1)
  on conflict (user_id) do update set
    window_start = date_trunc('minute', now()),
    request_count = case when limits.window_start < date_trunc('minute', now()) then 1 else limits.request_count + 1 end
  returning request_count <= 30 into allowed;
  return allowed;
end;
$$;
revoke all on function public.consume_tmdb_request() from public, anon;
grant execute on function public.consume_tmdb_request() to authenticated;
