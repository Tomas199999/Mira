-- =============================================================================
-- Mira — 0004: catálogo de objetos, desafío diario y ventanas por usuario
--
-- Modelo temporal (decisión de arquitectura, ver docs/ARCHITECTURE.md § Tiempo):
-- el desafío se indexa por FECHA, no por instante. Todo el mundo hace el mismo
-- objeto el día D, pero cada usuario lo recibe en un momento aleatorio de SU
-- ventana local. El objeto no se revela por API hasta que la ventana abre.
-- =============================================================================

-- --- Catálogo de objetos ------------------------------------------------------
create table challenge_objects (
  id                uuid primary key default gen_random_uuid(),
  object_name       text not null unique,          -- clave canónica en inglés: 'mug'
  display_name      text not null,                 -- lo que ve el usuario: 'una taza'
  description       text,
  difficulty        challenge_difficulty not null default 'easy',

  -- Sinónimos aceptados. Evita que la validación dependa de una sola palabra (§10).
  aliases           text[] not null default '{}',

  -- Criterios visuales en lenguaje natural que se le pasan al modelo de visión.
  visual_criteria   text[] not null default '{}',

  status            challenge_object_status not null default 'draft',

  -- Trazabilidad del pipeline de aprobación (§4).
  safety_reviewed_at   timestamptz,
  safety_reviewed_by   uuid references profiles (id) on delete set null,
  safety_notes         text,
  generated_by_ai      boolean not null default false,

  -- Para no repetir objetos seguido.
  last_scheduled_on    date,
  times_scheduled      integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint approved_needs_review
    check (status <> 'approved' or safety_reviewed_at is not null),
  constraint approved_needs_criteria
    check (status <> 'approved' or array_length(visual_criteria, 1) >= 1)
);

create index challenge_objects_status_idx on challenge_objects (status, last_scheduled_on nulls first);

-- --- Desafío diario global ----------------------------------------------------
create table daily_challenges (
  id              uuid primary key default gen_random_uuid(),
  challenge_date  date not null unique,
  object_id       uuid not null references challenge_objects (id) on delete restrict,
  status          daily_challenge_status not null default 'scheduled',
  created_at      timestamptz not null default now(),
  created_by      uuid references profiles (id) on delete set null
);

create index daily_challenges_date_idx on daily_challenges (challenge_date desc);

-- --- Ventana por usuario ------------------------------------------------------
-- Una fila por (usuario, día). `opens_at` se sortea dentro de la ventana local
-- configurada en app_config. Es la fuente de verdad de "¿ya puede ver el objeto?".
create table challenge_windows (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles (id) on delete cascade,
  daily_challenge_id uuid not null references daily_challenges (id) on delete cascade,
  challenge_date    date not null,

  opens_at          timestamptz not null,
  closes_at         timestamptz not null,
  timezone          text not null,

  notified_at       timestamptz,
  opened_at         timestamptz,          -- cuándo el usuario abrió el desafío
  completed_at      timestamptz,

  attempts_used     smallint not null default 0,

  created_at        timestamptz not null default now(),

  unique (user_id, challenge_date),
  constraint window_ordering check (closes_at > opens_at),
  constraint attempts_non_negative check (attempts_used >= 0)
);

create index challenge_windows_user_idx     on challenge_windows (user_id, challenge_date desc);
-- Índice del job de push: a quién le toca notificar ahora.
create index challenge_windows_pending_push on challenge_windows (opens_at)
  where notified_at is null;

-- --- Sortear el objeto del día ------------------------------------------------
-- Elige un objeto aprobado dando prioridad al que hace más tiempo que no sale.
-- Se ejecuta desde un cron; nunca desde el cliente.
create or replace function schedule_daily_challenge(target_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_id uuid;
  challenge_id uuid;
begin
  select id into challenge_id from daily_challenges where challenge_date = target_date;
  if challenge_id is not null then
    return challenge_id;
  end if;

  select co.id into chosen_id
    from challenge_objects co
   where co.status = 'approved'
     and (co.last_scheduled_on is null or co.last_scheduled_on < target_date - interval '60 days')
   order by co.last_scheduled_on nulls first, random()
   limit 1;

  if chosen_id is null then
    raise exception 'no_approved_objects_available for %', target_date;
  end if;

  insert into daily_challenges (challenge_date, object_id, status)
  values (target_date, chosen_id, 'scheduled')
  returning id into challenge_id;

  update challenge_objects
     set last_scheduled_on = target_date,
         times_scheduled = times_scheduled + 1,
         updated_at = now()
   where id = chosen_id;

  return challenge_id;
end;
$$;
