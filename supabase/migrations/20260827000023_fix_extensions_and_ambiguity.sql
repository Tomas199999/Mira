-- =============================================================================
-- Mira — 0023: dos fallos que sólo aparecían en producción
--
-- A. `pgcrypto` vive en el esquema `extensions` en Supabase, no en `public`.
--    Todas las funciones que usan digest() o gen_random_bytes() declaraban
--    `set search_path = public`, así que en producción fallaban con
--    "function digest(text, unknown) does not exist". Localmente andaban porque
--    el Postgres embebido instalaba pgcrypto en public.
--    El shim de test ahora replica la ubicación de Supabase, para que esta
--    clase de fallo se vea antes de desplegar.
--
-- B. `consume_rate_limit` declaraba una variable llamada `window_start`, que es
--    además el nombre de una columna de la tabla. Postgres no puede resolver
--    cuál es cuál y aborta con "column reference is ambiguous". El rate
--    limiting entero estaba caído — y como el llamador dejaba pasar ante error,
--    fallaba en silencio: exactamente lo que un límite no debe hacer.
-- =============================================================================

-- --- A. search_path con extensions -------------------------------------------
create or replace function set_phone_discoverability(
  p_phone_e164 text,
  p_discoverable boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  uid  uuid := auth.uid();
  salt text;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  if not p_discoverable then
    update user_private
       set phone_hash = null, discoverable_by_phone = false, updated_at = now()
     where user_id = uid;
    return false;
  end if;

  if p_phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'phone_invalid' using errcode = 'check_violation';
  end if;

  select value #>> '{}' into salt from app_config where key = 'contact_hash_salt';

  update user_private
     set phone_hash = digest(salt || p_phone_e164, 'sha256'),
         discoverable_by_phone = true,
         updated_at = now()
   where user_id = uid;

  return true;
end;
$$;

grant execute on function set_phone_discoverability(text, boolean) to authenticated;
revoke execute on function set_phone_discoverability(text, boolean) from public, anon;

alter function start_submission(uuid, text, boolean) set search_path = public, extensions;
alter function consume_upload_token(text, uuid)      set search_path = public, extensions;

-- --- B. Desambiguar las variables ---------------------------------------------
create or replace function consume_rate_limit(
  p_bucket   text,
  p_limit    integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Prefijo v_ para que ningún nombre choque con una columna de la tabla.
  v_window_start timestamptz;
  v_count        integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_counters as rl (bucket, window_start, count)
  values (p_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
    do update set count = rl.count + 1
  returning rl.count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from
      (v_window_start + make_interval(secs => p_window_seconds)) - now()))::int)
  );
end;
$$;

revoke execute on function consume_rate_limit(text, integer, integer) from public, anon, authenticated;
