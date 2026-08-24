-- =============================================================================
-- Mira — 0006: rachas, protectores, rankings y logros
-- =============================================================================

-- --- Historial de racha -------------------------------------------------------
-- El estado vive en profiles (current_streak/best_streak) por performance;
-- esta tabla es el libro mayor que permite auditar y reconstruir.
create table streak_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles (id) on delete cascade,
  challenge_date date not null,
  event          text not null check (event in ('increment', 'reset', 'protected', 'restored')),
  streak_before  integer not null,
  streak_after   integer not null,
  submission_id  uuid references submissions (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (user_id, challenge_date, event)
);

create index streak_events_user_idx on streak_events (user_id, challenge_date desc);

-- --- Protectores de racha (§13) -----------------------------------------------
-- Se ganan jugando, no se compran. La cantidad máxima acumulable vive en
-- app_config para poder ajustarla sin publicar una versión.
create table streak_protections (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  earned_at    timestamptz not null default now(),
  earned_for   text not null,               -- p.ej. 'streak_7'
  used_at      timestamptz,
  used_for_date date
);

create index streak_protections_available_idx on streak_protections (user_id) where used_at is null;
create unique index streak_protections_one_per_date on streak_protections (user_id, used_for_date)
  where used_for_date is not null;

-- --- Snapshots de ranking (§36) -----------------------------------------------
-- No se rankea recorriendo usuarios en cada request. Un job diario materializa
-- las posiciones; entre snapshots se muestra la última posición conocida.
create table ranking_snapshots (
  snapshot_date date not null,
  scope         ranking_scope not null,
  scope_key     text not null default '',    -- código de país para scope='country'
  user_id       uuid not null references profiles (id) on delete cascade,
  rank          integer not null,
  score         integer not null,            -- racha actual, criterio del MVP
  primary key (snapshot_date, scope, scope_key, user_id)
);

create index ranking_snapshots_leaderboard_idx
  on ranking_snapshots (snapshot_date desc, scope, scope_key, rank);
create index ranking_snapshots_user_idx
  on ranking_snapshots (user_id, snapshot_date desc);

-- --- Logros (§38) -------------------------------------------------------------
create table achievements (
  code         text primary key,             -- 'first_photo', 'streak_7', ...
  display_name text not null,
  description  text not null,
  icon         text not null,
  sort_order   integer not null default 0,
  is_secret    boolean not null default false
);

create table user_achievements (
  user_id      uuid not null references profiles (id) on delete cascade,
  code         text not null references achievements (code) on delete cascade,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, code)
);

create index user_achievements_user_idx on user_achievements (user_id, unlocked_at desc);
