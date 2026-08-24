-- =============================================================================
-- Mira — 0008: configuración remota, rate limiting, administración y auditoría
-- =============================================================================

-- --- Configuración remota (§56) -----------------------------------------------
-- Todo lo que la especificación pide no hardcodear vive acá. El cliente lee
-- una vista pública reducida; los valores sensibles (umbrales de IA, límites)
-- no salen del backend.
create table app_config (
  key           text primary key,
  value         jsonb not null,
  description   text not null,
  is_public     boolean not null default false,   -- ¿lo puede leer el cliente?
  updated_at    timestamptz not null default now(),
  updated_by    uuid references profiles (id) on delete set null
);

insert into app_config (key, value, description, is_public) values
  ('challenge_window_start_hour', '10',    'Hora local a partir de la cual puede abrirse el desafío', true),
  ('challenge_window_end_hour',   '22',    'Hora local límite para que abra el desafío', true),
  ('challenge_duration_minutes',  '120',   'Minutos que permanece abierto el desafío una vez notificado', true),
  ('max_upload_attempts',         '3',     'Intentos de subida por usuario y por día', true),
  ('late_submissions_allowed',    'true',  'Permitir subir fuera de ventana (no cuenta para la racha)', true),

  ('ai_confidence_accept',        '0.80',  'Confianza mínima para aceptar automáticamente', false),
  ('ai_confidence_reject',        '0.40',  'Confianza por debajo de la cual se rechaza automáticamente', false),
  ('ai_escalation_enabled',       'true',  'Escalar casos ambiguos a un modelo más capaz', false),

  ('streak_protection_every_n_days', '10', 'Cada cuántos días de racha se gana un protector', true),
  ('streak_protection_max_stock',    '2',  'Máximo de protectores acumulables', true),

  ('rate_limit_uploads_per_day',      '5',  'Subidas totales por usuario y día (incluye rechazos)', false),
  ('rate_limit_friend_requests_hour', '20', 'Solicitudes de amistad por hora', false),
  ('rate_limit_reports_per_day',      '20', 'Reportes por usuario y día', false),
  ('rate_limit_contact_sync_per_day', '3',  'Sincronizaciones de agenda por día', false),

  ('min_age_years',            '13',    'Edad mínima general', true),
  ('min_age_years_eea',        '16',    'Edad mínima en el Espacio Económico Europeo (GDPR art. 8)', true),

  ('feed_page_size',           '20',    'Publicaciones por página en el feed', true),
  ('friends_of_friends_enabled', 'false', 'Habilitar visibilidad de segundo grado (ver docs/ARCHITECTURE.md)', true)
on conflict (key) do nothing;

-- Vista que consume el cliente: sólo lo marcado como público.
create view public_app_config as
  select key, value from app_config where is_public;

-- --- Rate limiting ------------------------------------------------------------
-- Contadores por ventana fija. Suficiente para el MVP; si el volumen lo pide se
-- migra a Redis sin tocar la interfaz (ver docs/ARCHITECTURE.md § Rate limiting).
create table rate_limit_counters (
  bucket       text not null,          -- 'uploads:<user_id>'
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (bucket, window_start)
);

create index rate_limit_cleanup_idx on rate_limit_counters (window_start);

-- --- Administradores ----------------------------------------------------------
create table admin_users (
  user_id    uuid primary key references profiles (id) on delete cascade,
  role       admin_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid references profiles (id) on delete set null
);

-- --- Auditoría de acciones administrativas ------------------------------------
-- Toda acción de moderación queda registrada. No es opcional: es lo que se
-- muestra si alguna vez hay que justificar una suspensión.
create table admin_audit_log (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references profiles (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  before      jsonb,
  after       jsonb,
  note        text,
  created_at  timestamptz not null default now()
);

create index admin_audit_log_target_idx on admin_audit_log (target_type, target_id, created_at desc);
create index admin_audit_log_admin_idx  on admin_audit_log (admin_id, created_at desc);

-- --- Solicitudes de eliminación de cuenta (§50) -------------------------------
-- Requisito duro de App Store: eliminación de cuenta iniciada desde la app.
create table account_deletion_requests (
  user_id       uuid primary key references profiles (id) on delete cascade,
  requested_at  timestamptz not null default now(),
  scheduled_for timestamptz not null,      -- período de gracia
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  reason        text
);

create index account_deletion_due_idx on account_deletion_requests (scheduled_for)
  where completed_at is null and cancelled_at is null;
