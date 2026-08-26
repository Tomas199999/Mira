-- =============================================================================
-- Mira — 0015: cerrar funciones y datos privados que el cliente podía escribir
--
-- Tercera pasada de auditoría. Dos familias de hallazgos.
--
-- A. Postgres otorga EXECUTE a PUBLIC en toda función nueva salvo que se
--    revoque. `schedule_daily_challenge` es SECURITY DEFINER y quedó
--    ejecutable por cualquier usuario autenticado: podía crear desafíos para
--    fechas arbitrarias y quemar objetos del catálogo (last_scheduled_on y
--    times_scheduled), degradando el sorteo para todos.
--
-- B. `user_private` tenía una política `for all` y todos los grants por
--    columna, así que el cliente podía escribir campos que sostienen tres
--    garantías del producto:
--      · phone_hash — poner el hash del teléfono de OTRA persona hace que uno
--        aparezca cuando sus contactos la buscan. Suplantación lisa y llana,
--        y rompe todo el modelo de descubrimiento de §16.
--      · birth_date — editable en cualquier momento. Un menor se registra con
--        su edad real y después la cambia, y con eso se desactivan las
--        protecciones de §29 que el trigger había aplicado.
--      · timezone y timezone_effective_on — escribirlos directo anula el
--        diferimiento de un día que impide mudarse de huso para espiar el
--        objeto del día.
-- =============================================================================

-- --- A. Las funciones de servidor no las llama el cliente ---------------------
revoke execute on function schedule_daily_challenge(date) from public, anon, authenticated;

-- Las funciones de trigger tampoco. Postgres ya rechaza invocarlas fuera de un
-- trigger, pero no hay razón para que figuren como ejecutables.
revoke execute on function block_cascade()                  from public, anon, authenticated;
revoke execute on function friend_request_on_accept()       from public, anon, authenticated;
revoke execute on function enforce_minor_ranking_privacy()  from public, anon, authenticated;
revoke execute on function reject_request_if_blocked()      from public, anon, authenticated;
revoke execute on function user_private_set_age_band()      from public, anon, authenticated;
revoke execute on function touch_updated_at()               from public, anon, authenticated;

-- Que las futuras nazcan cerradas y haya que abrirlas a propósito.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- --- B. user_private deja de ser escribible en bloque -------------------------
-- El alta ya pasa por create_user_profile(), así que el cliente no necesita
-- INSERT. De UPDATE conserva sólo lo que es genuinamente una preferencia suya.
revoke insert, update, delete on user_private from authenticated;
grant update (locale, discoverable_by_phone, discoverable_by_email)
  on user_private to authenticated;

-- La política `for all` se parte: leer lo propio, y actualizar dentro de las
-- columnas que quedaron permitidas.
drop policy if exists user_private_own on user_private;

create policy user_private_read_own on user_private
  for select to authenticated
  using (user_id = auth.uid());

create policy user_private_update_own on user_private
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- Cambio de zona horaria, diferido un día ----------------------------------
-- Se aplica recién mañana. Es lo que impide mudarse de huso para adelantar la
-- ventana y ver el objeto del día antes de tiempo (ver docs/ARCHITECTURE.md § 3).
create or replace function request_timezone_change(p_timezone text)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  effective date;
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'timezone_invalid' using errcode = 'check_violation';
  end if;

  effective := current_date + 1;

  update user_private
     set pending_timezone = p_timezone,
         timezone_effective_on = effective,
         updated_at = now()
   where user_id = uid;

  return effective;
end;
$$;

grant execute on function request_timezone_change(text) to authenticated;

-- --- Eliminación de cuenta: se pide y se cancela, no se marca completada ------
-- Antes la política `for all` dejaba escribir completed_at y cancelled_at, o
-- fijar scheduled_for en cualquier fecha.
revoke insert, update, delete on account_deletion_requests from authenticated;
grant insert (user_id, reason) on account_deletion_requests to authenticated;
grant update (cancelled_at) on account_deletion_requests to authenticated;

alter table account_deletion_requests
  alter column scheduled_for set default (now() + interval '14 days');

drop policy if exists account_deletion_own on account_deletion_requests;

create policy account_deletion_read_own on account_deletion_requests
  for select to authenticated using (user_id = auth.uid());

create policy account_deletion_request_own on account_deletion_requests
  for insert to authenticated with check (user_id = auth.uid());

create policy account_deletion_cancel_own on account_deletion_requests
  for update to authenticated
  using (user_id = auth.uid() and completed_at is null)
  with check (user_id = auth.uid());

-- --- Re-otorgar lo que el revoke por defecto se lleva puesto -------------------
-- El `alter default privileges ... revoke execute` de más arriba no toca lo ya
-- creado, pero dejamos explícito qué puede llamar el cliente.
grant execute on function get_active_challenge()                    to authenticated;
grant execute on function get_friends_ranking(integer)              to authenticated;
grant execute on function is_username_available(text)               to authenticated;
grant execute on function create_user_profile(text, text, date, text, text, text) to authenticated;
grant execute on function viewer_is_friend_of(uuid)                 to authenticated;
grant execute on function viewer_is_blocked_with(uuid)              to authenticated;
grant execute on function viewer_can_see_content_of(uuid)           to authenticated;
grant execute on function viewer_has_admin_role(admin_role)         to authenticated;
