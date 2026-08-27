-- =============================================================================
-- Mira — 0027: envío de notificaciones del desafío
--
-- El job corre cada pocos minutos y busca ventanas que acaban de abrir. La
-- marca `notified_at` es lo que hace que reintentar sea seguro: una ventana
-- notificada no vuelve a entrar en la selección.
--
-- Se reserva antes de enviar, no después. Si se marcara después, un fallo del
-- proveedor entre el envío y la marca haría que el usuario reciba la misma
-- notificación en cada corrida siguiente. Es preferible perder una notificación
-- que mandar seis.
-- =============================================================================

-- --- Registrar el token del dispositivo ---------------------------------------
create or replace function register_push_token(
  p_token       text,
  p_platform    device_platform,
  p_device_id   text default null,
  p_app_version text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  -- El token es único a nivel global: si el dispositivo cambió de cuenta, la
  -- fila se reasigna en vez de duplicarse. Sin esto, el usuario anterior
  -- seguiría recibiendo las notificaciones de ese teléfono.
  insert into push_tokens (user_id, token, platform, device_id, app_version, is_valid, updated_at)
  values (uid, p_token, p_platform, p_device_id, p_app_version, true, now())
  on conflict (token) do update
    set user_id = uid,
        platform = excluded.platform,
        device_id = excluded.device_id,
        app_version = excluded.app_version,
        is_valid = true,
        failure_count = 0,
        updated_at = now();

  return true;
end;
$$;

grant execute on function register_push_token(text, device_platform, text, text) to authenticated;
revoke execute on function register_push_token(text, device_platform, text, text) from public, anon;

-- --- A quién hay que avisarle ahora --------------------------------------------
-- Devuelve y marca en la misma operación: dos jobs solapados no pueden tomar la
-- misma ventana.
create or replace function claim_due_challenge_notifications(p_limit integer default 500)
returns table (
  window_id      uuid,
  user_id        uuid,
  token          text,
  platform       device_platform,
  locale         text,
  object_display text,
  closes_at      timestamptz
)
language sql
security definer
set search_path = public
as $$
  with vencidas as (
    select w.id
      from challenge_windows w
      join user_settings us on us.user_id = w.user_id
      join profiles p on p.id = w.user_id
     where w.notified_at is null
       and w.opens_at <= now()
       -- Una ventana ya cerrada no se notifica: avisar de algo que terminó es
       -- peor que no avisar.
       and w.closes_at > now()
       and us.notify_daily_challenge
       and p.account_status = 'active'
       and exists (select 1 from push_tokens t where t.user_id = w.user_id and t.is_valid)
     order by w.opens_at
     limit least(coalesce(p_limit, 500), 2000)
     for update of w skip locked
  ),
  marcadas as (
    update challenge_windows w
       set notified_at = now()
      from vencidas v
     where w.id = v.id
     returning w.id, w.user_id, w.daily_challenge_id, w.closes_at
  )
  select m.id, m.user_id, t.token, t.platform,
         coalesce(up.locale, 'es'),
         o.display_name,
         m.closes_at
    from marcadas m
    join push_tokens t on t.user_id = m.user_id and t.is_valid
    left join user_private up on up.user_id = m.user_id
    join daily_challenges d on d.id = m.daily_challenge_id
    join challenge_objects o on o.id = d.object_id;
$$;

revoke execute on function claim_due_challenge_notifications(integer) from public, anon, authenticated;

-- --- Tokens que el proveedor rechazó -------------------------------------------
-- Un token muerto que se reintenta para siempre es ancho de banda y cuota
-- tirados. A los tres fallos se marca inválido.
create or replace function record_push_failure(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update push_tokens
     set failure_count = failure_count + 1,
         is_valid = case when failure_count + 1 >= 3 then false else is_valid end,
         updated_at = now()
   where token = p_token;
$$;

revoke execute on function record_push_failure(text) from public, anon, authenticated;

create or replace function invalidate_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update push_tokens set is_valid = false, updated_at = now() where token = p_token;
$$;

revoke execute on function invalidate_push_token(text) from public, anon, authenticated;

-- --- Bandeja in-app -------------------------------------------------------------
create or replace function push_notification_record(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_data jsonb
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, title, body, data)
  values (p_user_id, p_kind, p_title, p_body, coalesce(p_data, '{}'::jsonb))
  returning id;
$$;

revoke execute on function push_notification_record(uuid, text, text, text, jsonb) from public, anon, authenticated;
