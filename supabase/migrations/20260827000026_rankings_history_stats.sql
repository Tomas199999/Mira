-- =============================================================================
-- Mira — 0026: rankings, historial y estadísticas del perfil
--
-- Todo lectura. Los rankings globales y por país salen de `ranking_snapshots`,
-- que materializa un job diario (§36): no se recorre la tabla de usuarios en
-- cada consulta. El de amigos sí se calcula al vuelo, porque el grafo de una
-- persona es chico y así siempre está fresco.
-- =============================================================================

-- --- Una página del ranking ----------------------------------------------------
create or replace function get_ranking_page(
  p_scope     ranking_scope,
  p_scope_key text default '',
  p_after_rank integer default 0,
  p_limit     integer default 50
)
returns table (
  rank           integer,
  user_id        uuid,
  username       citext,
  display_name   text,
  avatar_path    text,
  score          integer,
  is_me          boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.rank, p.id, p.username, p.display_name, p.avatar_path, r.score,
         p.id = auth.uid()
    from ranking_snapshots r
    join profiles p on p.id = r.user_id
   where r.scope = p_scope
     and r.scope_key = coalesce(p_scope_key, '')
     and r.snapshot_date = (select max(snapshot_date) from ranking_snapshots
                             where scope = p_scope and scope_key = coalesce(p_scope_key, ''))
     and r.rank > coalesce(p_after_rank, 0)
     -- Un bloqueo no borra a nadie del ranking, pero sí lo esconde de quien
     -- bloqueó: ver el nombre de quien uno bloqueó es una forma de acoso.
     and not viewer_is_blocked_with(p.id)
   order by r.rank
   limit least(coalesce(p_limit, 50), 100);
$$;

grant execute on function get_ranking_page(ranking_scope, text, integer, integer) to authenticated;
revoke execute on function get_ranking_page(ranking_scope, text, integer, integer) from public, anon;

-- --- Mi posición ---------------------------------------------------------------
-- Se devuelve aparte para poder mostrar "tu posición: #8.421" sin traer las
-- 8.420 filas de arriba.
create or replace function get_my_rank(p_scope ranking_scope, p_scope_key text default '')
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rank',  (select r.rank from ranking_snapshots r
               where r.user_id = auth.uid() and r.scope = p_scope
                 and r.scope_key = coalesce(p_scope_key, '')
               order by r.snapshot_date desc limit 1),
    'total', (select count(*) from ranking_snapshots r
               where r.scope = p_scope and r.scope_key = coalesce(p_scope_key, '')
                 and r.snapshot_date = (select max(snapshot_date) from ranking_snapshots
                                         where scope = p_scope and scope_key = coalesce(p_scope_key, ''))),
    'updated_at', (select max(snapshot_date) from ranking_snapshots
                    where scope = p_scope and scope_key = coalesce(p_scope_key, ''))
  );
$$;

grant execute on function get_my_rank(ranking_scope, text) to authenticated;
revoke execute on function get_my_rank(ranking_scope, text) from public, anon;

-- --- Historial de un mes (§20) --------------------------------------------------
-- Devuelve una fila por día del mes, con lo que pasó ese día. Los días sin
-- desafío se distinguen de los días perdidos: no es lo mismo "no jugaste" que
-- "no hubo desafío".
create or replace function get_history_month(p_month text)
returns table (
  day            date,
  object_display text,
  submission_id  uuid,
  thumbnail_path text,
  photo_path     text,
  outcome        text,
  streak_after   integer
)
language sql
stable
set search_path = public
as $$
  with rango as (
    select (p_month || '-01')::date as inicio,
           ((p_month || '-01')::date + interval '1 month' - interval '1 day')::date as fin
  ),
  dias as (
    select generate_series((select inicio from rango), (select fin from rango), interval '1 day')::date as d
  )
  select
    dias.d,
    s.object_display_name,
    s.id,
    s.thumbnail_path,
    s.photo_path,
    case
      when s.id is not null and s.status = 'accepted' and s.was_late then 'late'
      when s.id is not null and s.status = 'accepted'                then 'completed'
      when s.id is not null and s.status = 'in_review'               then 'reviewing'
      when ev.event = 'protected'                                    then 'protected'
      when w.id is not null                                          then 'missed'
      else 'no_challenge'
    end,
    ev.streak_after
  from dias
  left join challenge_windows w
         on w.user_id = auth.uid() and w.challenge_date = dias.d
  left join submissions s
         on s.user_id = auth.uid() and s.challenge_date = dias.d
        and s.status in ('accepted', 'in_review')
  left join streak_events ev
         on ev.user_id = auth.uid() and ev.challenge_date = dias.d
  where dias.d <= current_date
  order by dias.d;
$$;

grant execute on function get_history_month(text) to authenticated;
revoke execute on function get_history_month(text) from public, anon;

-- --- Estadísticas del perfil (§37) ----------------------------------------------
create or replace function get_my_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'currentStreak',  p.current_streak,
    'bestStreak',     p.best_streak,
    'totalCompleted', p.total_completed,
    'friendCount', (select count(*) from friendships f
                     where f.user_a = p.id or f.user_b = p.id),
    'protections', (select count(*) from streak_protections
                     where user_id = p.id and used_at is null),
    -- Participación: días completados sobre días con desafío disponible. Sin
    -- ventanas todavía se devuelve 0 en vez de dividir por cero.
    'participationRate', (
      select case when count(*) = 0 then 0
             else round(count(*) filter (where exists (
               select 1 from submissions s
                where s.user_id = p.id and s.challenge_date = w.challenge_date
                  and s.status = 'accepted'))::numeric / count(*), 3)
             end
        from challenge_windows w where w.user_id = p.id and w.closes_at < now()
    ),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', a.code, 'displayName', a.display_name, 'description', a.description,
        'icon', a.icon, 'unlockedAt', ua.unlocked_at) order by a.sort_order)
        from achievements a
        left join user_achievements ua on ua.code = a.code and ua.user_id = p.id
       where not a.is_secret or ua.unlocked_at is not null
    ), '[]'::jsonb)
  )
  from profiles p where p.id = auth.uid();
$$;

grant execute on function get_my_stats() to authenticated;
revoke execute on function get_my_stats() from public, anon;
