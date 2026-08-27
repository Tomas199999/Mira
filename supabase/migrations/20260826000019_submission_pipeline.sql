-- =============================================================================
-- Mira — 0019: reserva del intento, token de subida y aplicación del resultado
--
-- Tres operaciones que tienen que ser atómicas o no sirven:
--
--   1. Verificar la ventana, contar el intento y emitir el token. Si esto no
--      fuera una sola transacción, dos peticiones simultáneas se llevarían el
--      mismo intento y el límite de §9 sería decorativo.
--   2. Consumir el token. De un solo uso, o el mismo token sube dos fotos.
--   3. Escribir el veredicto y mover la racha juntos. Si se separan, una caída
--      entre medio deja una foto aceptada sin racha, o al revés.
-- =============================================================================

-- --- 1. Reservar un intento y emitir el token ---------------------------------
create or replace function start_submission(
  p_window_id uuid,
  p_device_id text default null,
  p_attestation_ok boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  w             challenge_windows%rowtype;
  max_attempts  integer;
  token_plain   text;
  submission_id uuid;
  storage_path  text;
  is_late       boolean;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  -- FOR UPDATE serializa los intentos concurrentes sobre la misma ventana.
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

  -- Fuera de ventana se puede subir, pero no cuenta para la racha (§42).
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

  update challenge_windows
     set attempts_used = attempts_used + 1,
         opened_at = coalesce(opened_at, now())
   where id = w.id;

  submission_id := gen_random_uuid();
  storage_path  := uid::text || '/' || w.challenge_date::text || '/' || submission_id::text || '.webp';

  insert into submissions (id, user_id, daily_challenge_id, challenge_date,
                           photo_path, timezone, status, was_late, visibility)
  select submission_id, uid, w.daily_challenge_id, w.challenge_date,
         storage_path, w.timezone, 'pending', is_late,
         coalesce((select photo_visibility from user_settings where user_id = uid), 'friends');

  insert into submission_attempts (user_id, challenge_window_id, submission_id,
                                   attempt_number, device_id, attestation_ok)
  values (uid, w.id, submission_id, w.attempts_used + 1, p_device_id, p_attestation_ok);

  -- El token viaja una sola vez, en esta respuesta. En la base queda su hash:
  -- si alguien lee la tabla, no puede usarlo.
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

-- --- 2. Consumir el token (lo llama el backend, no el cliente) ----------------
create or replace function consume_upload_token(p_token text, p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  tok upload_tokens%rowtype;
begin
  select * into tok from upload_tokens
   where token_hash = digest(p_token, 'sha256')
     and consumed_at is null
     and expires_at > now()
   for update;

  if not found then
    return false;
  end if;

  -- El token tiene que pertenecer a la misma ventana que la publicación.
  if not exists (select 1 from submissions s
                  where s.id = p_submission_id
                    and s.user_id = tok.user_id
                    and s.challenge_date = (select challenge_date from challenge_windows
                                             where id = tok.challenge_window_id)) then
    return false;
  end if;

  update upload_tokens set consumed_at = now() where id = tok.id;
  return true;
end;
$$;

revoke execute on function consume_upload_token(text, uuid) from public, anon, authenticated;

-- --- 3. Escribir el veredicto y mover la racha, juntos ------------------------
create or replace function apply_submission_result(
  p_submission_id   uuid,
  p_status          submission_status,
  p_ai_decision     ai_decision,
  p_confidence      numeric,
  p_moderation      moderation_status,
  p_perceptual_hash bytea default null,
  p_file_sha256     bytea default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s          submissions%rowtype;
  new_streak integer;
  counted    boolean := false;
begin
  select * into s from submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'no_data_found';
  end if;

  update submissions
     set status            = p_status,
         ai_decision       = p_ai_decision,
         ai_confidence     = p_confidence,
         moderation_status = p_moderation,
         perceptual_hash   = coalesce(p_perceptual_hash, perceptual_hash),
         file_sha256       = coalesce(p_file_sha256, file_sha256),
         updated_at        = now()
   where id = p_submission_id;

  -- La racha se mueve sólo si la foto entró en tiempo y fue aceptada.
  -- 'in_review' NO la mueve todavía, pero tampoco la rompe: close_challenge_day
  -- deja fuera a quien tiene algo en revisión (ver docs/AI.md).
  if p_status = 'accepted' and not s.was_late then
    new_streak := apply_streak_increment(s.user_id, s.challenge_date, s.id);
    counted := true;

    update submissions set counted_for_streak = true where id = p_submission_id;
    update challenge_windows
       set completed_at = now()
     where user_id = s.user_id and challenge_date = s.challenge_date;
  else
    select current_streak into new_streak from profiles where id = s.user_id;
  end if;

  if p_status = 'in_review' then
    update challenge_windows
       set completed_at = now()
     where user_id = s.user_id and challenge_date = s.challenge_date;
  end if;

  return jsonb_build_object(
    'status', p_status,
    'streak', new_streak,
    'counted_for_streak', counted,
    'was_late', s.was_late
  );
end;
$$;

revoke execute on function apply_submission_result(uuid, submission_status, ai_decision, numeric, moderation_status, bytea, bytea) from public, anon, authenticated;

-- --- Detectar la misma foto subida dos veces (§8) ------------------------------
create or replace function find_duplicate_photo(p_hash bytea, p_exclude uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from submissions s
   where s.perceptual_hash = p_hash
     and s.id <> p_exclude
     and s.status in ('accepted', 'in_review')
   limit 1;
$$;

revoke execute on function find_duplicate_photo(bytea, uuid) from public, anon, authenticated;
