-- =============================================================================
-- Mira — 0032: continuidad de la racha y fotos sin veredicto
--
-- Tres fallas de la misma familia: situaciones en las que el usuario hizo todo
-- bien y la racha se le cortaba igual. Contra la regla 3 de CLAUDE.md.
--
--   1. Un protector gastado no protegía. close_challenge_day consumía el
--      protector, pero apply_streak_increment sólo miraba si el día anterior
--      estaba completado. Al día siguiente la racha arrancaba en 1: el usuario
--      perdía el protector Y la racha.
--
--   2. Una revisión aceptada tarde pisaba la racha. Si el moderador aprobaba
--      la foto del día D cuando el usuario ya había completado D+1 y D+2,
--      apply_streak_increment veía "no es el día siguiente" y la reiniciaba
--      en 1, y además movía last_completed_on hacia atrás.
--
--   3. Una foto subida cuyo veredicto nunca llegó (la función se cortó, el
--      modelo no respondió) quedaba en 'pending' y el cierre del día la
--      contaba como falta. Un error del servidor le rompía la racha a alguien.
-- =============================================================================

-- --- 1 y 2. La cadena se sostiene con protectores y revisiones ---------------
-- Regla: cada día entre la última completada y hoy tiene que haber quedado
-- cubierto por un protector o por una foto en revisión. Si un día quedó
-- descubierto, la racha se corta. Una revisión que después se rechaza NO
-- corta retroactivamente: ante la duda ya se le dio el beneficio al usuario.
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
  chain_alive boolean;
begin
  select current_streak, last_completed_on
    into prev_streak, prev_date
    from profiles
   where id = p_user_id
     for update;

  if prev_date = p_date then
    return prev_streak;                        -- ya contado hoy
  end if;

  -- Si la racha ya se cortó DESPUÉS de este día, aceptarlo no la revive: el
  -- día cuenta como completado, pero pertenece a una cadena que ya terminó.
  if exists (select 1 from streak_events e
              where e.user_id = p_user_id and e.event = 'reset'
                and e.challenge_date > p_date) then
    update profiles
       set total_completed   = total_completed + 1,
           last_completed_on = greatest(last_completed_on, p_date)
     where id = p_user_id;

    insert into streak_events (user_id, challenge_date, event, streak_before, streak_after, submission_id)
    values (p_user_id, p_date, 'increment', prev_streak, prev_streak, p_submission_id)
    on conflict do nothing;

    return prev_streak;
  end if;

  -- Aceptación retroactiva: el día ya sostuvo la cadena mientras estaba en
  -- revisión y el usuario siguió jugando; ahora además cuenta. Nunca mueve
  -- last_completed_on hacia atrás.
  if prev_date > p_date then
    new_streak := prev_streak + 1;

    update profiles
       set current_streak  = new_streak,
           best_streak     = greatest(best_streak, new_streak),
           total_completed = total_completed + 1
     where id = p_user_id;

    insert into streak_events (user_id, challenge_date, event, streak_before, streak_after, submission_id)
    values (p_user_id, p_date, 'increment', prev_streak, new_streak, p_submission_id)
    on conflict do nothing;

    return new_streak;
  end if;

  -- Continuidad hacia adelante. Con prev_date = p_date - 1 la serie es vacía
  -- y la cadena está viva; con un hueco, cada día del hueco tiene que estar
  -- cubierto.
  chain_alive := prev_date is not null and not exists (
    select 1
      from generate_series(prev_date + 1, p_date - 1, interval '1 day') g(d)
     where not exists (select 1 from streak_events e
                        where e.user_id = p_user_id
                          and e.challenge_date = g.d::date
                          and e.event = 'protected')
       and not exists (select 1 from submissions s
                        where s.user_id = p_user_id
                          and s.challenge_date = g.d::date
                          and s.status = 'in_review')
  );

  if chain_alive then
    new_streak := prev_streak + 1;
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

-- --- 3. Una foto subida sin veredicto va a revisión, no a falta ---------------
-- 'processing' lo escribe el backend recién cuando la foto está en Storage y
-- es una imagen válida: a partir de ahí, lo que falle es responsabilidad del
-- servidor. El cierre del día las manda a revisión humana antes de evaluar
-- faltas, y una revisión no rompe la racha.
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
  -- Sólo puede haber una publicación válida por usuario y día (índice
  -- submissions_one_valid_per_day): si el usuario reintentó y otra foto ya
  -- resolvió, la que quedó colgada se marca como superada, no como revisión.
  update submissions s
     set status      = 'in_review',
         ai_decision = 'error',
         updated_at  = now()
   where s.id in (
     select distinct on (user_id) id
       from submissions
      where challenge_date = p_date and status = 'processing'
      order by user_id, submitted_at desc
   )
     and not exists (select 1 from submissions o
                      where o.user_id = s.user_id and o.challenge_date = p_date
                        and o.status in ('accepted', 'in_review'));

  update submissions
     set status = 'expired', updated_at = now()
   where challenge_date = p_date
     and status = 'processing';

  update challenge_windows w
     set completed_at = coalesce(w.completed_at, now())
   where w.challenge_date = p_date
     and exists (select 1 from submissions s
                  where s.user_id = w.user_id and s.challenge_date = p_date
                    and s.status = 'in_review' and s.ai_decision = 'error');

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
