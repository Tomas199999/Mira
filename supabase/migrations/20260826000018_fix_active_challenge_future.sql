-- =============================================================================
-- Mira — 0018: get_active_challenge() devolvía una ventana futura
--
-- La versión original filtraba `challenge_date >= current_date - 1` y ordenaba
-- descendente, así que tomaba la fecha MÁS ALTA disponible. Mientras las
-- ventanas se creaban sólo para hoy no se notaba. Pero el cron de la Fase 3
-- las pre-crea para los próximos días, y con eso cada usuario habría visto un
-- desafío futuro y bloqueado en lugar del de hoy: la pantalla principal de la
-- app, rota para todo el mundo.
--
-- Lo detectó una aserción del modelo temporal, no una revisión a ojo.
--
-- Además, `current_date` es la fecha del servidor (UTC). Lo correcto es la
-- fecha LOCAL del usuario: para alguien en Tokio a las 08:00 el "hoy" del
-- servidor todavía es ayer.
-- =============================================================================

create or replace function get_active_challenge()
returns table (
  window_id       uuid,
  challenge_date  date,
  opens_at        timestamptz,
  closes_at       timestamptz,
  is_open         boolean,
  is_revealed     boolean,
  object_name     text,
  display_name    text,
  description     text,
  attempts_used   smallint,
  max_attempts    integer,
  completed_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select coalesce(nullif(up.timezone, ''), 'UTC') as tz
      from user_private up
     where up.user_id = auth.uid()
  ),
  hoy_local as (
    select (now() at time zone (select tz from yo))::date as fecha
  )
  select
    w.id,
    w.challenge_date,
    w.opens_at,
    w.closes_at,
    (now() >= w.opens_at and now() < w.closes_at),
    (now() >= w.opens_at),
    case when now() >= w.opens_at then o.object_name  end,
    case when now() >= w.opens_at then o.display_name end,
    case when now() >= w.opens_at then o.description  end,
    w.attempts_used,
    (select (value #>> '{}')::int from app_config where key = 'max_upload_attempts'),
    w.completed_at
  from challenge_windows w
  join daily_challenges  d on d.id = w.daily_challenge_id
  join challenge_objects o on o.id = d.object_id
  where w.user_id = auth.uid()
    -- Nunca una ventana futura, y la fecha de referencia es la del usuario.
    and w.challenge_date <= (select fecha from hoy_local)
    and w.challenge_date >= (select fecha from hoy_local) - 1
  order by w.challenge_date desc
  limit 1;
$$;

grant execute on function get_active_challenge() to authenticated;
revoke execute on function get_active_challenge() from public, anon;
