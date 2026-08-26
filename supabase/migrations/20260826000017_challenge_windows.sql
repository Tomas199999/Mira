-- =============================================================================
-- Mira — 0017: crear las ventanas diarias de cada usuario
--
-- Acá se materializa el modelo temporal de docs/ARCHITECTURE.md § 3: un objeto
-- global por fecha, y una ventana por usuario sorteada dentro de SU franja
-- horaria local. Se hace en un solo pase con conjuntos, no iterando usuarios:
-- con cien mil cuentas un bucle sería una llamada por persona todas las noches.
-- =============================================================================

-- --- Aplicar los cambios de zona horaria que ya vencieron ---------------------
-- El cambio se pidió ayer con request_timezone_change() y recién rige hoy. Es
-- lo que impide mudarse de huso para adelantar la ventana y espiar el objeto.
create or replace function promote_pending_timezones(p_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  update user_private
     set timezone = pending_timezone,
         pending_timezone = null,
         timezone_effective_on = null,
         updated_at = now()
   where pending_timezone is not null
     and timezone_effective_on is not null
     and timezone_effective_on <= p_date;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke execute on function promote_pending_timezones(date) from public, anon, authenticated;

-- --- Crear las ventanas del día ------------------------------------------------
-- `opens_at` se sortea en [inicio, fin - duración] para que el desafío siempre
-- cierre dentro de la franja del usuario y no se derrame a la madrugada.
--
-- Idempotente: el índice único (user_id, challenge_date) hace que una segunda
-- corrida no duplique nada, así que el cron puede reintentarse sin miedo.
create or replace function create_challenge_windows(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge_id   uuid;
  start_hour     integer;
  end_hour       integer;
  duration_min   integer;
  created        integer;
begin
  select id into challenge_id from daily_challenges where challenge_date = p_date;
  if challenge_id is null then
    raise exception 'no_challenge_for_date %', p_date;
  end if;

  select (value #>> '{}')::int into start_hour   from app_config where key = 'challenge_window_start_hour';
  select (value #>> '{}')::int into end_hour     from app_config where key = 'challenge_window_end_hour';
  select (value #>> '{}')::int into duration_min from app_config where key = 'challenge_duration_minutes';

  -- Si la franja no da para la duración configurada, la ventana sería negativa.
  -- Mejor fallar ruidosamente que crear ventanas absurdas para todo el mundo.
  if (end_hour - start_hour) * 60 <= duration_min then
    raise exception 'window_too_short: % horas para % minutos de desafío',
      end_hour - start_hour, duration_min;
  end if;

  with elegibles as (
    select p.id as user_id,
           coalesce(nullif(up.timezone, ''), 'UTC') as tz
      from profiles p
      join user_private up on up.user_id = p.id
     where p.account_status = 'active'
  ),
  ventanas as (
    select e.user_id,
           e.tz,
           -- Instante local de inicio de la franja, convertido a absoluto.
           ((p_date + make_interval(hours => start_hour)) at time zone e.tz)
             + make_interval(secs => floor(
                 random() * (((end_hour - start_hour) * 60 - duration_min) * 60)
               )::int) as opens_at
      from elegibles e
  )
  insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
  select v.user_id, challenge_id, p_date, v.opens_at,
         v.opens_at + make_interval(mins => duration_min), v.tz
    from ventanas v
  on conflict (user_id, challenge_date) do nothing;

  get diagnostics created = row_count;
  return created;
end;
$$;

revoke execute on function create_challenge_windows(date) from public, anon, authenticated;

-- --- Alta tardía: un usuario que se registra hoy ------------------------------
-- Sin esto, quien se da de alta después de que corrió el cron no tiene ventana
-- y ve una pantalla vacía hasta mañana. Se le crea la del día en el momento.
create or replace function ensure_own_challenge_window()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  challenge_id uuid;
  tz           text;
  start_hour   integer;
  end_hour     integer;
  duration_min integer;
  local_now    timestamp;
  opens        timestamptz;
  today_local  date;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(nullif(up.timezone, ''), 'UTC') into tz
    from user_private up where up.user_id = uid;
  if tz is null then return false; end if;

  local_now   := now() at time zone tz;
  today_local := local_now::date;

  if exists (select 1 from challenge_windows
              where user_id = uid and challenge_date = today_local) then
    return false;
  end if;

  select id into challenge_id from daily_challenges where challenge_date = today_local;
  if challenge_id is null then return false; end if;

  select (value #>> '{}')::int into start_hour   from app_config where key = 'challenge_window_start_hour';
  select (value #>> '{}')::int into end_hour     from app_config where key = 'challenge_window_end_hour';
  select (value #>> '{}')::int into duration_min from app_config where key = 'challenge_duration_minutes';

  -- Si ya pasó la franja del día, no se inventa una ventana retroactiva:
  -- el usuario arranca mañana.
  if local_now::time >= make_time(end_hour, 0, 0) then
    return false;
  end if;

  -- Sortea entre "ahora" y el final de la franja, nunca antes de este momento.
  opens := greatest(
    now(),
    (today_local + make_interval(hours => start_hour)) at time zone tz
  ) + make_interval(secs => floor(random() * 900)::int);

  insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
  values (uid, challenge_id, today_local, opens,
          least(opens + make_interval(mins => duration_min),
                (today_local + make_interval(hours => end_hour)) at time zone tz),
          tz)
  on conflict (user_id, challenge_date) do nothing;

  return true;
end;
$$;

grant execute on function ensure_own_challenge_window() to authenticated;
revoke execute on function ensure_own_challenge_window() from public, anon;
