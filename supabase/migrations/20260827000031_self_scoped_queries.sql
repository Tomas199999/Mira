-- =============================================================================
-- Mira — 0031: consultas sobre datos propios sin pagar el peaje de RLS
--
-- Hallazgo de la medición con volumen real: `get_history_month()` tardaba
-- 1.142 ms y tocaba 182.000 páginas para devolver 27 filas.
--
-- La causa no es un índice faltante. La política de RLS de `submissions` llama
-- a `viewer_can_see_content_of()`, que no es LEAKPROOF, y Postgres **no puede
-- empujar el filtro del usuario por debajo de una condición de seguridad no
-- leakproof**: tiene que evaluar la política sobre cada fila antes de aplicar
-- nada más. Con el historial haciendo un LEFT JOIN por cada día del mes, eso
-- son 27 recorridos completos de la tabla.
--
-- Es una trampa clásica de RLS y no se arregla con índices: mientras la
-- política mande, el índice no se usa.
--
-- La salida correcta para una consulta que por definición sólo devuelve datos
-- PROPIOS es SECURITY DEFINER con el filtro `user_id = auth.uid()` explícito.
-- No se afloja ninguna regla: la condición de visibilidad de estas consultas es
-- trivialmente "es mío", y queda escrita en el WHERE en vez de delegada.
--
-- `get_feed()` NO se toca: ahí la visibilidad sí es no trivial (amigos,
-- bloqueos) y tiene que seguir resolviéndola RLS. Mide 73 ms, que está bien.
-- =============================================================================

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
security definer
set search_path = public
as $$
  with yo as (select auth.uid() as uid),
  rango as (
    select (p_month || '-01')::date as inicio,
           ((p_month || '-01')::date + interval '1 month' - interval '1 day')::date as fin
  ),
  dias as (
    select generate_series((select inicio from rango), (select fin from rango), interval '1 day')::date as d
  ),
  -- Se traen las filas propias UNA vez, con el índice, y después se cruzan con
  -- los días. Antes el LEFT JOIN se resolvía por día y multiplicaba el trabajo.
  mias as (
    select s.challenge_date, s.id, s.thumbnail_path, s.photo_path, s.status,
           s.was_late, s.object_display_name
      from submissions s
     where s.user_id = (select uid from yo)
       and s.challenge_date between (select inicio from rango) and (select fin from rango)
       and s.status in ('accepted', 'in_review')
  ),
  ventanas as (
    select w.challenge_date
      from challenge_windows w
     where w.user_id = (select uid from yo)
       and w.challenge_date between (select inicio from rango) and (select fin from rango)
  ),
  eventos as (
    select e.challenge_date, e.event, e.streak_after
      from streak_events e
     where e.user_id = (select uid from yo)
       and e.challenge_date between (select inicio from rango) and (select fin from rango)
  )
  select
    dias.d,
    m.object_display_name,
    m.id,
    m.thumbnail_path,
    m.photo_path,
    case
      when m.id is not null and m.status = 'accepted' and m.was_late then 'late'
      when m.id is not null and m.status = 'accepted'                then 'completed'
      when m.id is not null and m.status = 'in_review'               then 'reviewing'
      when ev.event = 'protected'                                    then 'protected'
      when w.challenge_date is not null                              then 'missed'
      else 'no_challenge'
    end,
    ev.streak_after
  from dias
  left join mias     m  on m.challenge_date  = dias.d
  left join ventanas w  on w.challenge_date  = dias.d
  left join eventos  ev on ev.challenge_date = dias.d
  where dias.d <= current_date
  order by dias.d;
$$;

grant execute on function get_history_month(text) to authenticated;
revoke execute on function get_history_month(text) from public, anon;

-- Mismo caso: sólo devuelve la publicación propia.
create or replace function get_my_submission(p_date date default null)
returns table (
  submission_id  uuid,
  challenge_date date,
  object_display text,
  photo_path     text,
  thumbnail_path text,
  medium_path    text,
  submitted_at   timestamptz,
  status         submission_status,
  was_late       boolean,
  counted        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.challenge_date, s.object_display_name, s.photo_path, s.thumbnail_path,
         s.medium_path, s.submitted_at, s.status, s.was_late, s.counted_for_streak
    from submissions s
   where s.user_id = auth.uid()
     and s.challenge_date = coalesce(p_date, s.challenge_date)
     and s.status in ('accepted', 'in_review')
   order by s.challenge_date desc
   limit 1;
$$;

grant execute on function get_my_submission(date) to authenticated;
revoke execute on function get_my_submission(date) from public, anon;
