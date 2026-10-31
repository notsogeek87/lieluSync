-- Lielu Lists — initial schema
-- All tables live in `public` with RLS enabled and NO policies for the
-- `anon` / `authenticated` roles (RLS is not forced: the owner role used by the
-- server bypasses it): the Supabase Data API (PostgREST) cannot read
-- or write anything. The application connects server-side with the database
-- owner role and enforces per-user isolation in every query (user_id scoping).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- users
create table public.users (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- Stremio configuration identifier: HMAC hash for lookup, AES-GCM ciphertext for display.
  config_token_hash         text not null unique,
  config_token_enc          text not null,
  config_token_rotated_at   timestamptz not null default now(),
  -- synchronisation scheduling
  sync_enabled              boolean not null default true,
  next_sync_at              timestamptz not null default now(),
  last_sync_started_at      timestamptz,
  last_sync_finished_at     timestamptz,
  last_sync_status          text check (last_sync_status in ('success','partial','failed','skipped')),
  last_successful_sync_at   timestamptz,
  consecutive_failures      integer not null default 0,
  last_manual_sync_at       timestamptz,
  -- lease-based lock (survives crashed / timed-out functions)
  sync_lock_owner           uuid,
  sync_lock_until           timestamptz
);
create index users_due_idx on public.users (next_sync_at) where sync_enabled;

-- ---------------------------------------------------------------- sessions (Lielu web sessions)
create table public.user_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index user_sessions_user_idx on public.user_sessions (user_id);
create index user_sessions_expires_idx on public.user_sessions (expires_at);

-- ---------------------------------------------------------------- pending TMDB authorisations
create table public.auth_requests (
  id                 uuid primary key default gen_random_uuid(),
  state_hash         text not null unique,
  request_token_enc  text not null,
  user_id            uuid references public.users(id) on delete cascade, -- set when reconnecting
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null
);
create index auth_requests_expires_idx on public.auth_requests (expires_at);

-- ---------------------------------------------------------------- TMDB accounts & tokens
create table public.tmdb_accounts (
  user_id            uuid primary key references public.users(id) on delete cascade,
  account_object_id  text not null unique,
  v3_account_id      bigint,
  username           text,
  display_name       text,
  avatar_path        text,
  status             text not null default 'connected' check (status in ('connected','revoked','disconnected')),
  connected_at       timestamptz not null default now(),
  disconnected_at    timestamptz,
  updated_at         timestamptz not null default now()
);

create table public.tmdb_tokens (
  user_id           uuid primary key references public.tmdb_accounts(user_id) on delete cascade,
  access_token_enc  text not null,
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  invalidated_at    timestamptz
);

-- ---------------------------------------------------------------- TMDB lists
create table public.tmdb_lists (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.users(id) on delete cascade,
  kind                  text not null check (kind in ('watchlist_movie','watchlist_tv','custom')),
  tmdb_list_id          text not null, -- 'movie' / 'tv' for watchlists, numeric id for custom lists
  name                  text not null,
  description           text,
  is_public             boolean,
  tmdb_item_count       integer,
  movie_count           integer not null default 0,
  series_count          integer not null default 0,
  tmdb_updated_at       text,
  remote_signature      text,
  status                text not null default 'pending' check (status in ('pending','ok','error','gone')),
  last_error            text,
  consecutive_failures  integer not null default 0,
  next_attempt_at       timestamptz,
  last_checked_at       timestamptz,
  last_synced_at        timestamptz,
  last_full_sync_at     timestamptz,
  gone_at               timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, kind, tmdb_list_id)
);
create index tmdb_lists_user_idx on public.tmdb_lists (user_id);

-- ---------------------------------------------------------------- list membership (exact mirror of TMDB)
create table public.list_items (
  list_id        uuid not null references public.tmdb_lists(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  media_type     text not null check (media_type in ('movie','tv')),
  tmdb_id        integer not null check (tmdb_id > 0),
  position       integer not null,
  first_seen_at  timestamptz not null default now(),
  primary key (list_id, media_type, tmdb_id)
);
create index list_items_order_idx on public.list_items (list_id, media_type, position);
create index list_items_user_idx on public.list_items (user_id);
create index list_items_media_idx on public.list_items (media_type, tmdb_id);

-- ---------------------------------------------------------------- shared metadata cache (no user data)
create table public.tmdb_media (
  media_type      text not null check (media_type in ('movie','tv')),
  tmdb_id         integer not null check (tmdb_id > 0),
  status          text not null default 'pending' check (status in ('pending','ok','not_found','error')),
  imdb_id         text check (imdb_id ~ '^tt[0-9]{5,10}$'),
  title           text,
  original_title  text,
  overview        text,
  poster_path     text,
  backdrop_path   text,
  release_date    date,
  end_date        date,
  in_production   boolean,
  genres          text[],
  vote_average    numeric(3,1),
  runtime         integer,
  fetched_at      timestamptz,
  refresh_after   timestamptz not null default now(),
  error_count     integer not null default 0,
  primary key (media_type, tmdb_id)
);
create index tmdb_media_refresh_idx on public.tmdb_media (refresh_after);
create index tmdb_media_imdb_idx on public.tmdb_media (imdb_id) where imdb_id is not null;

-- ---------------------------------------------------------------- catalogs exposed in Stremio
create table public.selected_catalogs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  list_id      uuid not null references public.tmdb_lists(id) on delete cascade,
  media_type   text not null check (media_type in ('movie','tv')),
  enabled      boolean not null default true,
  custom_name  text check (custom_name is null or char_length(custom_name) between 1 and 80),
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (list_id, media_type)
);
create index selected_catalogs_user_idx on public.selected_catalogs (user_id, position);

-- Stremio-ready rows: one row per (catalog, item) with resolved metadata.
create view public.catalog_items with (security_invoker = true) as
select
  sc.id         as catalog_id,
  sc.user_id,
  li.position,
  li.media_type,
  li.tmdb_id,
  m.imdb_id,
  m.title,
  m.original_title,
  m.overview,
  m.poster_path,
  m.backdrop_path,
  m.release_date,
  m.end_date,
  m.in_production,
  m.genres,
  m.vote_average
from public.selected_catalogs sc
join public.list_items li on li.list_id = sc.list_id and li.media_type = sc.media_type
join public.tmdb_media m on m.media_type = li.media_type and m.tmdb_id = li.tmdb_id
where m.title is not null and m.status <> 'not_found';

-- ---------------------------------------------------------------- sync bookkeeping
create table public.sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  trigger        text not null check (trigger in ('cron','manual','stale','login')),
  status         text not null default 'running' check (status in ('running','success','partial','failed','skipped')),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  lists_checked  integer not null default 0,
  lists_updated  integer not null default 0,
  items_added    integer not null default 0,
  items_removed  integer not null default 0,
  media_resolved integer not null default 0,
  error          text
);
create index sync_jobs_user_idx on public.sync_jobs (user_id, started_at desc);
create index sync_jobs_started_idx on public.sync_jobs (started_at);

create table public.sync_logs (
  id          bigint generated always as identity primary key,
  job_id      uuid references public.sync_jobs(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  list_id     uuid references public.tmdb_lists(id) on delete set null,
  level       text not null check (level in ('info','warn','error')),
  event       text not null,
  message     text,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index sync_logs_user_idx on public.sync_logs (user_id, created_at desc);
create index sync_logs_created_idx on public.sync_logs (created_at);

-- ---------------------------------------------------------------- rate limiting (fixed windows)
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------- lock down the Data API
do $$
declare t text;
begin
  foreach t in array array['users','user_sessions','auth_requests','tmdb_accounts','tmdb_tokens','tmdb_lists',
                           'list_items','tmdb_media','selected_catalogs','sync_jobs','sync_logs','rate_limits']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
  end if;
end $$;
