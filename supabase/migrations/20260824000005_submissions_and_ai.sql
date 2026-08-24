-- =============================================================================
-- Mira — 0005: envíos, intentos, validación de IA y moderación
-- =============================================================================

-- --- Envíos (la publicación) --------------------------------------------------
create table submissions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles (id) on delete cascade,
  daily_challenge_id  uuid not null references daily_challenges (id) on delete cascade,
  challenge_date      date not null,

  -- Rutas dentro del bucket privado. NUNCA URLs públicas: el acceso se sirve
  -- siempre con signed URLs de vida corta (§32).
  photo_path          text not null,
  thumbnail_path      text,
  medium_path         text,

  -- Percepción de la imagen, para detectar la misma foto subida dos veces o
  -- por dos cuentas distintas (§8, §35).
  perceptual_hash     bytea,
  file_sha256         bytea,
  bytes               integer,
  width               integer,
  height              integer,

  -- Señales temporales. `captured_at` viene del cliente y NO es fuente de
  -- verdad (§62): se guarda como señal y se contrasta con submitted_at.
  captured_at         timestamptz,
  submitted_at        timestamptz not null default now(),
  timezone            text not null,

  -- Resultado del pipeline.
  status              submission_status not null default 'pending',
  ai_decision         ai_decision,
  ai_confidence       numeric(4,3),
  moderation_status   moderation_status not null default 'pending',

  -- Copia de la visibilidad al momento de publicar: si el usuario después
  -- cambia su preferencia, no se re-expone contenido viejo sin querer.
  visibility          photo_visibility not null default 'friends',

  -- ¿Contó para la racha? Fuera de ventana no cuenta (§42).
  counted_for_streak  boolean not null default false,
  was_late            boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint confidence_range check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1))
);

-- Una sola publicación válida por usuario y por día (§9). Lo garantiza la base,
-- no el cliente ni la capa de servicio.
create unique index submissions_one_valid_per_day
  on submissions (user_id, challenge_date)
  where status in ('accepted', 'in_review');

create index submissions_user_history_idx on submissions (user_id, challenge_date desc)
  where status = 'accepted';
create index submissions_feed_idx on submissions (challenge_date desc, submitted_at desc)
  where status = 'accepted' and moderation_status = 'passed';
create index submissions_phash_idx on submissions (perceptual_hash) where perceptual_hash is not null;
create index submissions_review_queue_idx on submissions (created_at)
  where status = 'in_review';

-- --- Intentos -----------------------------------------------------------------
-- Cada subida cuenta, se acepte o no. Es lo que limita el gasto de IA (§48) y
-- deja rastro para el anti-fraude (§35).
create table submission_attempts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles (id) on delete cascade,
  challenge_window_id uuid not null references challenge_windows (id) on delete cascade,
  submission_id       uuid references submissions (id) on delete set null,
  attempt_number      smallint not null,

  outcome             ai_decision,
  rejection_reason    text,

  -- Trazabilidad del dispositivo que subió, para detectar granjas de cuentas.
  device_id           text,
  attestation_ok      boolean,
  client_ip_hash      bytea,

  created_at          timestamptz not null default now(),

  unique (challenge_window_id, attempt_number)
);

create index submission_attempts_user_idx on submission_attempts (user_id, created_at desc);

-- --- Validaciones de IA -------------------------------------------------------
-- Una fila por llamada al modelo. Guardar esto es lo que permite auditar,
-- calibrar umbrales y no volver a pagar por la misma imagen (§48).
create table ai_validations (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid references submissions (id) on delete cascade,
  attempt_id        uuid references submission_attempts (id) on delete cascade,

  provider          text not null,          -- 'anthropic'
  model             text not null,          -- 'claude-haiku-4-5'
  stage             text not null,          -- 'primary' | 'escalation'

  expected_object   text not null,
  detected_object   text,
  valid             boolean,
  confidence        numeric(4,3),
  reason            text,
  needs_manual_review boolean not null default false,

  -- Coste real, para poder responder "cuánto nos sale esto" con datos.
  input_tokens      integer,
  output_tokens     integer,
  latency_ms        integer,

  raw_response      jsonb,
  error             text,

  created_at        timestamptz not null default now(),

  constraint ai_confidence_range check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index ai_validations_submission_idx on ai_validations (submission_id);
create index ai_validations_cost_idx on ai_validations (created_at desc);

-- --- Moderación de contenido --------------------------------------------------
-- Corre ANTES de que ninguna imagen sea visible para nadie, incluido un admin.
-- Ver docs/SECURITY.md § Moderación: un humano nunca ve una imagen que no pasó
-- por el clasificador automático.
create table moderation_results (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submissions (id) on delete cascade,
  provider        text not null,
  status          moderation_status not null,
  categories      jsonb not null default '{}'::jsonb,
  max_score       numeric(4,3),
  safe_for_human_review boolean not null default false,
  raw_response    jsonb,
  created_at      timestamptz not null default now()
);

create index moderation_results_submission_idx on moderation_results (submission_id);

-- --- Tokens de subida ---------------------------------------------------------
-- Un token de un solo uso, emitido por el backend cuando el usuario abre el
-- desafío, atado a (usuario, ventana, dispositivo). Sin token no hay subida:
-- es lo que impide fabricar un request de upload desde afuera de la app (§8).
create table upload_tokens (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references profiles (id) on delete cascade,
  challenge_window_id uuid not null references challenge_windows (id) on delete cascade,
  token_hash          bytea not null unique,
  device_id           text,
  attestation_ok      boolean not null default false,
  issued_at           timestamptz not null default now(),
  expires_at          timestamptz not null,
  consumed_at         timestamptz
);

create index upload_tokens_cleanup_idx on upload_tokens (expires_at) where consumed_at is null;
