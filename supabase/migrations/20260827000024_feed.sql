-- =============================================================================
-- Mira — 0024: feed
--
-- La función es SECURITY INVOKER a propósito: así las políticas de RLS de
-- `submissions` se evalúan con los permisos de quien consulta, y la privacidad
-- de §63 se resuelve donde tiene que resolverse. Si fuera DEFINER habría que
-- reimplementar acá las reglas de visibilidad, que es exactamente el error que
-- lleva a que la UI y la base opinen distinto.
--
-- Paginación por cursor compuesto (submitted_at, id): con `offset` una foto
-- nueva desplaza la ventana y el usuario ve repetidos.
-- =============================================================================

create or replace function get_feed(
  p_cursor_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit     integer default 20
)
returns table (
  submission_id   uuid,
  user_id         uuid,
  username        citext,
  display_name    text,
  avatar_path     text,
  current_streak  integer,
  challenge_date  date,
  object_display  text,
  photo_path      text,
  thumbnail_path  text,
  medium_path     text,
  submitted_at    timestamptz,
  was_late        boolean,
  reactions       jsonb,
  my_reaction     reaction_type
)
language sql
stable
set search_path = public
as $$
  select
    s.id, p.id, p.username, p.display_name, p.avatar_path, p.current_streak,
    s.challenge_date, o.display_name, s.photo_path, s.thumbnail_path, s.medium_path,
    s.submitted_at, s.was_late,
    coalesce((
      select jsonb_object_agg(r.type, r.n)
        from (select type, count(*) as n from reactions
               where submission_id = s.id group by type) r
    ), '{}'::jsonb),
    (select r.type from reactions r
      where r.submission_id = s.id and r.user_id = auth.uid())
  from submissions s
  join profiles p         on p.id = s.user_id
  join daily_challenges d on d.id = s.daily_challenge_id
  join challenge_objects o on o.id = d.object_id
  where s.status = 'accepted'
    and s.moderation_status = 'passed'
    -- RLS ya filtra por visibilidad; esto sólo excluye lo propio del feed
    -- social, que se muestra aparte en la pantalla principal.
    and s.user_id <> auth.uid()
    and (
      p_cursor_at is null
      or (s.submitted_at, s.id) < (p_cursor_at, p_cursor_id)
    )
  order by s.submitted_at desc, s.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

grant execute on function get_feed(timestamptz, uuid, integer) to authenticated;
revoke execute on function get_feed(timestamptz, uuid, integer) from public, anon;

-- Índice que sostiene el orden del feed sin ordenar en memoria.
create index if not exists submissions_feed_cursor_idx
  on submissions (submitted_at desc, id desc)
  where status = 'accepted' and moderation_status = 'passed';

-- --- La foto propia del día ----------------------------------------------------
-- La pantalla principal la muestra arriba de todo, separada del feed social.
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
set search_path = public
as $$
  select s.id, s.challenge_date, o.display_name, s.photo_path, s.thumbnail_path,
         s.medium_path, s.submitted_at, s.status, s.was_late, s.counted_for_streak
    from submissions s
    join daily_challenges d on d.id = s.daily_challenge_id
    join challenge_objects o on o.id = d.object_id
   where s.user_id = auth.uid()
     and s.challenge_date = coalesce(p_date, s.challenge_date)
     and s.status in ('accepted', 'in_review')
   order by s.challenge_date desc
   limit 1;
$$;

grant execute on function get_my_submission(date) to authenticated;
revoke execute on function get_my_submission(date) from public, anon;
