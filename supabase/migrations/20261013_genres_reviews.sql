-- Run once in the existing project's Supabase SQL Editor.
-- Existing shows, watch progress, and RLS policies are preserved.
begin;
alter table public.shows add column if not exists genres jsonb;
alter table public.shows add column if not exists review text not null default '';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shows'::regclass and conname = 'shows_review_length_check'
  ) then
    alter table public.shows add constraint shows_review_length_check
      check (char_length(review) <= 200);
  end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
