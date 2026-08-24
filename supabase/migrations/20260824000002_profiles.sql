-- =============================================================================
-- Mira — 0002: perfiles, datos privados y ajustes
--
-- Separación deliberada en tres tablas: RLS es a nivel de fila, no de columna.
-- Si la fecha de nacimiento y el hash del teléfono vivieran en `profiles`,
-- cualquier política que permita a un amigo leer el perfil expondría también
-- esos campos. Ver docs/DATABASE.md § Por qué tres tablas.
-- =============================================================================

-- --- profiles: lo que otros usuarios pueden llegar a ver ----------------------
create table profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          citext not null unique,
  display_name      text   not null,
  avatar_path       text,
  bio               text,
  country_code      char(2),

  -- Estado de racha. Sólo lo escribe el backend (ver política RLS más abajo:
  -- el usuario puede UPDATE su perfil pero un trigger revierte estos campos).
  current_streak    integer not null default 0,
  best_streak       integer not null default 0,
  total_completed   integer not null default 0,
  last_completed_on date,

  account_status    account_status not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint username_format check (username ~ '^[a-z0-9_.]{3,20}$'),
  constraint display_name_length check (char_length(display_name) between 1 and 40),
  constraint bio_length check (bio is null or char_length(bio) <= 160),
  constraint streaks_non_negative check (current_streak >= 0 and best_streak >= 0 and total_completed >= 0),
  constraint best_streak_is_max check (best_streak >= current_streak)
);

create index profiles_country_idx on profiles (country_code) where account_status = 'active';
create index profiles_streak_idx  on profiles (current_streak desc) where account_status = 'active';

-- --- user_private: nunca sale de la fila del propio usuario -------------------
create table user_private (
  user_id                 uuid primary key references profiles (id) on delete cascade,
  birth_date              date not null,
  age_band                age_band not null,

  -- Zona horaria IANA. Un cambio no se aplica hoy sino a partir de
  -- `timezone_effective_on`, para que no se pueda adelantar el desafío
  -- moviéndose de zona horaria (§5, vector de spoiler).
  timezone                text not null default 'UTC',
  pending_timezone        text,
  timezone_effective_on   date,

  locale                  text not null default 'es',

  -- Hash del teléfono PROPIO del usuario, para que otros puedan encontrarlo.
  -- No guardamos la agenda de nadie. Ver docs/SECURITY.md § Contactos.
  phone_hash              bytea,
  email_hash              bytea,
  discoverable_by_phone   boolean not null default false,
  discoverable_by_email   boolean not null default false,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Índices de descubrimiento: el match se hace por hash, nunca por el valor claro.
create index user_private_phone_hash_idx on user_private (phone_hash) where discoverable_by_phone;
create index user_private_email_hash_idx on user_private (email_hash) where discoverable_by_email;

-- --- user_settings: preferencias de privacidad y notificaciones ---------------
create table user_settings (
  user_id                     uuid primary key references profiles (id) on delete cascade,

  -- Privacidad de fotos (§17). Default restrictivo, como pide la especificación.
  photo_visibility            photo_visibility not null default 'friends',
  private_account             boolean not null default false,

  -- Rankings públicos (§72). Opt-in. El trigger de más abajo los fuerza a
  -- false para cualquier usuario menor de 16.
  show_in_global_ranking      boolean not null default false,
  show_in_country_ranking     boolean not null default false,

  -- Notificaciones por categoría (§55).
  notify_daily_challenge      boolean not null default true,
  notify_reminder             boolean not null default true,
  notify_friend_requests      boolean not null default true,
  notify_friend_activity      boolean not null default true,
  notify_reactions            boolean not null default true,
  notify_ranking              boolean not null default false,
  notify_achievements         boolean not null default true,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- --- Derivación de la franja etaria -------------------------------------------
create or replace function compute_age_band(birth date)
returns age_band
language sql
immutable
as $$
  select case
    when birth > (current_date - interval '13 years') then 'under_13'::age_band
    when birth > (current_date - interval '16 years') then '13_15'::age_band
    when birth > (current_date - interval '18 years') then '16_17'::age_band
    else 'adult'::age_band
  end;
$$;

create or replace function user_private_set_age_band()
returns trigger
language plpgsql
as $$
begin
  new.age_band := compute_age_band(new.birth_date);
  new.updated_at := now();
  return new;
end;
$$;

create trigger user_private_age_band
  before insert or update of birth_date on user_private
  for each row execute function user_private_set_age_band();

-- --- Los menores de 16 no aparecen en rankings públicos -----------------------
-- Se aplica en la base y no sólo en la UI: es una garantía, no una preferencia.
create or replace function enforce_minor_ranking_privacy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  band age_band;
begin
  select up.age_band into band from user_private up where up.user_id = new.user_id;

  if band in ('under_13', '13_15') then
    new.show_in_global_ranking  := false;
    new.show_in_country_ranking := false;
    new.photo_visibility        := 'friends';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger user_settings_minor_privacy
  before insert or update on user_settings
  for each row execute function enforce_minor_ranking_privacy();

-- --- Los campos de racha no los toca el cliente -------------------------------
-- Se resuelve con permisos a nivel de COLUMNA, no con un trigger que revierta
-- en silencio: un intento de mover la racha desde el cliente falla con un error
-- de permisos, que es ruidoso y auditable. RLS acota QUÉ filas; los grants por
-- columna acotan QUÉ campos. Esto cumple §61 sin que el backend tenga que
-- acordarse de activar ningún modo especial.
--
-- El username queda fuera a propósito: cambiarlo exige validar unicidad y lista
-- de palabras prohibidas (§28), así que pasa por un endpoint del backend.
revoke update on profiles from authenticated;
grant update (display_name, avatar_path, bio, country_code) on profiles to authenticated;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute function touch_updated_at();
