-- =============================================================================
-- Mira — 0007: reacciones, notificaciones, push y reportes
-- =============================================================================

-- --- Reacciones (§22) ---------------------------------------------------------
-- Una reacción por persona y por publicación. Sin comentarios en el MVP:
-- el producto es la foto del día, no un hilo.
create table reactions (
  submission_id uuid not null references submissions (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  type          reaction_type not null,
  created_at    timestamptz not null default now(),
  primary key (submission_id, user_id)
);

create index reactions_submission_idx on reactions (submission_id);
create index reactions_user_idx on reactions (user_id, created_at desc);

-- --- Bandeja de notificaciones in-app -----------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_inbox_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- --- Tokens de push -----------------------------------------------------------
create table push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  token         text not null unique,
  platform      device_platform not null,
  device_id     text,
  app_version   text,
  is_valid      boolean not null default true,
  last_used_at  timestamptz,
  failure_count smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index push_tokens_user_idx on push_tokens (user_id) where is_valid;

-- --- Reportes (§23) -----------------------------------------------------------
create table reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references profiles (id) on delete set null,
  submission_id uuid references submissions (id) on delete cascade,
  reported_user_id uuid references profiles (id) on delete cascade,
  reason        report_reason not null,
  description   text,
  status        report_status not null default 'open',
  resolved_at   timestamptz,
  resolved_by   uuid references profiles (id) on delete set null,
  resolution_note text,
  created_at    timestamptz not null default now(),

  constraint report_has_target check (submission_id is not null or reported_user_id is not null),
  constraint description_length check (description is null or char_length(description) <= 1000)
);

-- Una persona no reporta dos veces la misma publicación.
create unique index reports_no_duplicates on reports (reporter_id, submission_id)
  where submission_id is not null;
create index reports_queue_idx on reports (status, created_at) where status in ('open', 'reviewing');
