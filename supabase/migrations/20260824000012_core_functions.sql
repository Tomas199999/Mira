-- =============================================================================
-- Mira — 0012: funciones de dominio (desafío activo, racha, cierre del día)
--
-- Todo lo que la especificación marca como "el cliente no puede decidir" (§61)
-- vive acá o en el backend, nunca en la app.
-- =============================================================================

-- --- ¿Cuál es el desafío del usuario ahora mismo? -----------------------------
-- Devuelve el objeto SOLO si la ventana del usuario ya abrió. Antes de eso
-- informa que hay un desafío pendiente pero no revela cuál (§5, anti-spoiler).
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
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  revealed boolean;
begin
  return query
  select
    w.id,
    w.challenge_date,
    w.opens_at,
    w.closes_at,
    (now() >= w.opens_at and now() < w.closes_at) as is_open,
    (now() >= w.opens_at)                          as is_revealed,
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
    and w.challenge_date >= (current_date - 1)
  order by w.challenge_date desc
  limit 1;
end;
$$;

grant execute on function get_active_challenge() to authenticated;

-- --- Aplicar la racha tras un envío aceptado ----------------------------------
-- Idempotente: llamarla dos veces para el mismo día no incrementa dos veces.
create or replace function apply_streak_increment(p_user_id uuid, p_date date, p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  prev_streak integer;
  prev_date   date;
  new_streak  integer;
begin
  select current_streak, last_completed_on
    into prev_streak, prev_date
    from profiles
   where id = p_user_id
   for update;

  if prev_date = p_date then
    return prev_streak;                        -- ya contado hoy
  end if;

  if prev_date = p_date - 1 then
    new_streak := prev_streak + 1;             -- día consecutivo
  else
    new_streak := 1;                           -- arranca de nuevo
  end if;

  update profiles
     set current_streak    = new_streak,
         best_streak       = greatest(best_streak, new_streak),
         total_completed   = total_completed + 1,
         last_completed_on = p_date
   where id = p_user_id;

  insert into streak_events (user_id, challenge_date, event, streak_before, streak_after, submission_id)
  values (p_user_id, p_date, 'increment', prev_streak, new_streak, p_submission_id)
  on conflict do nothing;

  -- Protector de racha cada N días (§13). Se gana jugando, no se compra.
  if new_streak % (select (value #>> '{}')::int from app_config where key = 'streak_protection_every_n_days') = 0
     and (select count(*) from streak_protections
           where user_id = p_user_id and used_at is null)
         < (select (value #>> '{}')::int from app_config where key = 'streak_protection_max_stock')
  then
    insert into streak_protections (user_id, earned_for)
    values (p_user_id, 'streak_' || new_streak);
  end if;

  return new_streak;
end;
$$;

revoke execute on function apply_streak_increment(uuid, date, uuid) from public, anon, authenticated;

-- --- Cierre del día -----------------------------------------------------------
-- Job nocturno. Para cada usuario cuya ventana del día ya cerró sin envío
-- aceptado: gasta un protector si tiene, o corta la racha.
--
-- Importante: un envío en estado 'in_review' NO rompe la racha. Se resuelve
-- retroactivamente cuando el moderador decide (ver docs/AI.md § Falsos negativos).
create or replace function close_challenge_day(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  r record;
  protection_id uuid;
begin
  for r in
    select w.user_id, p.current_streak
      from challenge_windows w
      join profiles p on p.id = w.user_id
     where w.challenge_date = p_date
       and w.closes_at < now()
       and p.account_status = 'active'
       and not exists (
         select 1 from submissions s
          where s.user_id = w.user_id
            and s.challenge_date = p_date
            and s.status in ('accepted', 'in_review')
       )
       and p.current_streak > 0
  loop
    select id into protection_id
      from streak_protections
     where user_id = r.user_id and used_at is null
     order by earned_at
     limit 1;

    if protection_id is not null then
      update streak_protections
         set used_at = now(), used_for_date = p_date
       where id = protection_id;

      insert into streak_events (user_id, challenge_date, event, streak_before, streak_after)
      values (r.user_id, p_date, 'protected', r.current_streak, r.current_streak)
      on conflict do nothing;
    else
      update profiles set current_streak = 0 where id = r.user_id;

      insert into streak_events (user_id, challenge_date, event, streak_before, streak_after)
      values (r.user_id, p_date, 'reset', r.current_streak, 0)
      on conflict do nothing;
    end if;

    affected := affected + 1;
  end loop;

  return affected;
end;
$$;

revoke execute on function close_challenge_day(date) from public, anon, authenticated;

-- --- Materializar rankings (§36) ----------------------------------------------
-- Un solo pase con RANK() sobre un índice, en vez de recorrer usuarios por
-- cada consulta. Sólo entran quienes aceptaron aparecer (§72).
create or replace function build_ranking_snapshots(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer := 0;
begin
  delete from ranking_snapshots where snapshot_date = p_date;

  insert into ranking_snapshots (snapshot_date, scope, scope_key, user_id, rank, score)
  select p_date, 'global', '', p.id,
         rank() over (order by p.current_streak desc, p.total_completed desc, p.created_at),
         p.current_streak
    from profiles p
    join user_settings s on s.user_id = p.id
   where p.account_status = 'active'
     and s.show_in_global_ranking
     and p.current_streak > 0;

  get diagnostics inserted = row_count;

  insert into ranking_snapshots (snapshot_date, scope, scope_key, user_id, rank, score)
  select p_date, 'country', p.country_code, p.id,
         rank() over (partition by p.country_code
                      order by p.current_streak desc, p.total_completed desc, p.created_at),
         p.current_streak
    from profiles p
    join user_settings s on s.user_id = p.id
   where p.account_status = 'active'
     and s.show_in_country_ranking
     and p.country_code is not null
     and p.current_streak > 0;

  return inserted;
end;
$$;

revoke execute on function build_ranking_snapshots(date) from public, anon, authenticated;

-- --- Ranking de amigos --------------------------------------------------------
-- No se materializa: el grafo de un usuario es chico y así siempre está fresco.
create or replace function get_friends_ranking(p_limit integer default 50)
returns table (rank bigint, user_id uuid, username citext, display_name text,
               avatar_path text, current_streak integer)
language sql
stable
security definer
set search_path = public
as $$
  with circle as (
    select case when f.user_a = auth.uid() then f.user_b else f.user_a end as friend_id
      from friendships f
     where f.user_a = auth.uid() or f.user_b = auth.uid()
    union
    select auth.uid()
  )
  select rank() over (order by p.current_streak desc, p.total_completed desc, p.created_at),
         p.id, p.username, p.display_name, p.avatar_path, p.current_streak
    from circle c
    join profiles p on p.id = c.friend_id
   where p.account_status = 'active'
   order by 1
   limit p_limit;
$$;

grant execute on function get_friends_ranking(integer) to authenticated;
