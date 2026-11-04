-- Lielu Lists — profiles
-- A profile is an extra Stremio install URL that exposes only a chosen subset of
-- the user's catalogs (e.g. "Enfants" → only the kids lists). The user's main
-- URL (users.config_token_*) keeps exposing every enabled catalog.

create table public.profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 40),
  token_hash        text not null unique,
  token_enc         text not null,
  token_rotated_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index profiles_user_idx on public.profiles (user_id, created_at);

create table public.profile_catalogs (
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  catalog_id  uuid not null references public.selected_catalogs(id) on delete cascade,
  primary key (profile_id, catalog_id)
);
create index profile_catalogs_catalog_idx on public.profile_catalogs (catalog_id);

alter table public.profiles enable row level security;
alter table public.profile_catalogs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.profiles, public.profile_catalogs from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.profiles, public.profile_catalogs from authenticated;
  end if;
end $$;
