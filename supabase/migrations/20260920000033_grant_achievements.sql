-- =============================================================================
-- Mira — 0033: otorgar los logros
--
-- El catálogo de logros existía y el perfil los mostraba, pero nada insertaba
-- en user_achievements: ningún usuario podía desbloquear ninguno. Lo expuso la
-- primera prueba en un teléfono real ("Primera foto" seguía bloqueado con la
-- foto aceptada).
--
-- Una sola función evalúa todos los logros a partir del estado actual, es
-- idempotente (on conflict do nothing) y se llama desde los tres lugares
-- donde cambia algo que los afecta: la racha, las amistades y los rankings.
-- Agregar un logro sigue siendo insertar una fila en `achievements`, más su
-- condición acá.
-- =============================================================================

create or replace function grant_achievements(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  granted integer;
begin
  with estado as (
    select p.id, p.total_completed, p.best_streak,
           (select count(*) from friendships f
             where f.user_a = p.id or f.user_b = p.id) as amigos,
           (select min(r.rank) from ranking_snapshots r
             where r.user_id = p.id and r.scope = 'global') as mejor_global,
           (select min(r.rank) from ranking_snapshots r
             where r.user_id = p.id and r.scope = 'country') as mejor_pais,
           exists (select 1 from submissions s
                     join challenge_windows w on w.user_id = s.user_id
                                             and w.challenge_date = s.challenge_date
                    where s.user_id = p.id and s.status = 'accepted' and not s.was_late
                      and s.submitted_at < w.opens_at + interval '1 minute') as relampago,
           exists (select 1 from streak_events inc
                    where inc.user_id = p.id and inc.event = 'increment'
                      and exists (select 1 from streak_events rst
                                   where rst.user_id = p.id and rst.event = 'reset'
                                     and rst.streak_before >= 30
                                     and rst.challenge_date < inc.challenge_date)) as regreso
      from profiles p
     where p.id = p_user_id
  ),
  ganados as (
    select code from estado e, lateral (values
      ('first_photo',    e.total_completed >= 1),
      ('streak_3',       e.best_streak >= 3),
      ('streak_7',       e.best_streak >= 7),
      ('streak_30',      e.best_streak >= 30),
      ('streak_100',     e.best_streak >= 100),
      ('photos_50',      e.total_completed >= 50),
      ('photos_100',     e.total_completed >= 100),
      ('top_100_global', e.mejor_global <= 100),
      ('top_10_country', e.mejor_pais <= 10),
      ('first_friend',   e.amigos >= 1),
      ('friends_10',     e.amigos >= 10),
      ('early_bird',     e.relampago),
      ('comeback',       e.regreso)
    ) as v(code, cumple)
    where v.cumple
  )
  insert into user_achievements (user_id, code)
  select p_user_id, g.code
    from ganados g
    join achievements a on a.code = g.code   -- sólo los que existen en el catálogo
  on conflict do nothing;

  get diagnostics granted = row_count;
  return granted;
end;
$$;

revoke execute on function grant_achievements(uuid) from public, anon, authenticated;

-- --- Racha: al final de apply_streak_increment --------------------------------
-- Se envuelve la función de 0032 en vez de copiarla: la lógica de continuidad
-- queda en un solo lugar.
alter function apply_streak_increment(uuid, date, uuid) rename to apply_streak_increment_core;

create or replace function apply_streak_increment(p_user_id uuid, p_date date, p_submission_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_streak integer;
begin
  new_streak := apply_streak_increment_core(p_user_id, p_date, p_submission_id);
  perform grant_achievements(p_user_id);
  return new_streak;
end;
$$;

revoke execute on function apply_streak_increment(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function apply_streak_increment_core(uuid, date, uuid) from public, anon, authenticated;

-- --- Amistades: cuando se crea una ------------------------------------------
create or replace function friendships_grant_achievements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform grant_achievements(new.user_a);
  perform grant_achievements(new.user_b);
  return new;
end;
$$;

revoke execute on function friendships_grant_achievements() from public, anon, authenticated;

create trigger friendships_achievements
  after insert on friendships
  for each row execute function friendships_grant_achievements();

-- --- Rankings: después de materializar los snapshots -------------------------
-- En un solo pase, no por usuario: el cron corre sobre toda la base.
create or replace function grant_ranking_achievements(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  granted integer;
begin
  insert into user_achievements (user_id, code)
  select r.user_id, 'top_100_global'
    from ranking_snapshots r
   where r.snapshot_date = p_date and r.scope = 'global' and r.rank <= 100
  union
  select r.user_id, 'top_10_country'
    from ranking_snapshots r
   where r.snapshot_date = p_date and r.scope = 'country' and r.rank <= 10
  on conflict do nothing;

  get diagnostics granted = row_count;
  return granted;
end;
$$;

revoke execute on function grant_ranking_achievements(date) from public, anon, authenticated;

-- --- Quienes ya jugaron antes de esta migración -------------------------------
do $$
declare r record;
begin
  for r in select id from profiles where account_status = 'active' loop
    perform grant_achievements(r.id);
  end loop;
end;
$$;
