-- =============================================================================
-- Mira — 0025: guardar el nombre del objeto en la propia publicación
--
-- El feed necesita mostrar "una taza" junto a la foto, y lo obtenía uniendo
-- contra `challenge_objects`. Pero esa tabla NO es legible por los usuarios, y
-- a propósito: es la que esconde el objeto del día hasta que abre la ventana
-- (migración 0010). Con RLS activo el join no devolvía nada, así que el feed
-- salía vacío para todo el mundo.
--
-- Es un caso interesante: dos decisiones correctas por separado que juntas dan
-- un producto roto. La salida no es aflojar el RLS ni hacer la función
-- SECURITY DEFINER — eso obligaría a reimplementar la visibilidad a mano, que
-- es justamente el error que lleva a que la interfaz y la base opinen distinto.
--
-- Se desnormaliza: cada publicación guarda el nombre que tenía el objeto cuando
-- se publicó. Además de resolver el permiso, es históricamente más correcto: si
-- mañana se corrige el texto del catálogo, las fotos viejas conservan el que
-- de verdad se les mostró a las personas.
-- =============================================================================

alter table submissions
  add column if not exists object_display_name text;

-- Rellenar lo que ya existe.
update submissions s
   set object_display_name = o.display_name
  from daily_challenges d
  join challenge_objects o on o.id = d.object_id
 where d.id = s.daily_challenge_id
   and s.object_display_name is null;

-- Desde ahora lo escribe start_submission, que ya corre como SECURITY DEFINER
-- y sí puede leer el catálogo.
create or replace function start_submission(
  p_window_id uuid,
  p_device_id text default null,
  p_attestation_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid           uuid := auth.uid();
  w             challenge_windows%rowtype;
  max_attempts  integer;
  token_plain   text;
  submission_id uuid;
  storage_path  text;
  is_late       boolean;
  object_label  text;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  select * into w from challenge_windows
   where id = p_window_id and user_id = uid
   for update;

  if not found then
    raise exception 'window_not_found' using errcode = 'no_data_found';
  end if;

  if w.completed_at is not null then
    raise exception 'challenge_already_completed' using errcode = 'unique_violation';
  end if;

  if exists (select 1 from submissions s
              where s.user_id = uid and s.challenge_date = w.challenge_date
                and s.status in ('accepted', 'in_review')) then
    raise exception 'challenge_already_completed' using errcode = 'unique_violation';
  end if;

  if now() < w.opens_at then
    raise exception 'challenge_not_open' using errcode = 'check_violation';
  end if;

  is_late := now() >= w.closes_at;
  if is_late and not (select (value #>> '{}')::boolean from app_config
                       where key = 'late_submissions_allowed') then
    raise exception 'challenge_not_open' using errcode = 'check_violation';
  end if;

  select (value #>> '{}')::int into max_attempts
    from app_config where key = 'max_upload_attempts';

  if w.attempts_used >= max_attempts then
    raise exception 'attempts_exhausted' using errcode = 'check_violation';
  end if;

  select o.display_name into object_label
    from daily_challenges d
    join challenge_objects o on o.id = d.object_id
   where d.id = w.daily_challenge_id;

  update challenge_windows
     set attempts_used = attempts_used + 1,
         opened_at = coalesce(opened_at, now())
   where id = w.id;

  submission_id := gen_random_uuid();
  storage_path  := uid::text || '/' || w.challenge_date::text || '/' || submission_id::text || '.webp';

  insert into submissions (id, user_id, daily_challenge_id, challenge_date,
                           photo_path, timezone, status, was_late, visibility,
                           object_display_name)
  select submission_id, uid, w.daily_challenge_id, w.challenge_date,
         storage_path, w.timezone, 'pending', is_late,
         coalesce((select photo_visibility from user_settings where user_id = uid), 'friends'),
         object_label;

  insert into submission_attempts (user_id, challenge_window_id, submission_id,
                                   attempt_number, device_id, attestation_ok)
  values (uid, w.id, submission_id, w.attempts_used + 1, p_device_id, p_attestation_ok);

  token_plain := encode(gen_random_bytes(32), 'hex');

  insert into upload_tokens (user_id, challenge_window_id, token_hash, device_id,
                             attestation_ok, expires_at)
  values (uid, w.id, digest(token_plain, 'sha256'), p_device_id, p_attestation_ok,
          now() + interval '15 minutes');

  return jsonb_build_object(
    'submission_id', submission_id,
    'upload_path',   storage_path,
    'upload_token',  token_plain,
    'attempts_remaining', max_attempts - (w.attempts_used + 1),
    'was_late',      is_late,
    'expires_at',    now() + interval '15 minutes'
  );
end;
$$;

grant execute on function start_submission(uuid, text, boolean) to authenticated;
revoke execute on function start_submission(uuid, text, boolean) from public, anon;

-- --- El feed deja de unir contra tablas que el usuario no puede leer ----------
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
    s.challenge_date, s.object_display_name, s.photo_path, s.thumbnail_path, s.medium_path,
    s.submitted_at, s.was_late,
    coalesce((
      select jsonb_object_agg(r.type, r.n)
        from (select type, count(*) as n from reactions
               where submission_id = s.id group by type) r
    ), '{}'::jsonb),
    (select r.type from reactions r
      where r.submission_id = s.id and r.user_id = auth.uid())
  from submissions s
  join profiles p on p.id = s.user_id
  where s.status = 'accepted'
    and s.moderation_status = 'passed'
    and s.user_id <> auth.uid()
    and (p_cursor_at is null or (s.submitted_at, s.id) < (p_cursor_at, p_cursor_id))
  order by s.submitted_at desc, s.id desc
  limit least(coalesce(p_limit, 20), 50);
$$;

grant execute on function get_feed(timestamptz, uuid, integer) to authenticated;
revoke execute on function get_feed(timestamptz, uuid, integer) from public, anon;

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
