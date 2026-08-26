-- =============================================================================
-- Mira — 0016: quitarle a PUBLIC el EXECUTE sobre las funciones expuestas
--
-- Detectado por el analizador de seguridad de Supabase, no por mí. Vale la pena
-- anotarlo: es la tercera vez que el mismo patrón muerde. `grant execute ... to
-- authenticated` NO revoca el EXECUTE que Postgres le otorga a PUBLIC al crear
-- la función, y anon hereda de PUBLIC. Resultado: todas las funciones
-- SECURITY DEFINER quedaban invocables sin sesión, vía /rest/v1/rpc/....
--
-- Ninguna era explotable: cada una corta con auth.uid() nulo. Pero depender del
-- guard interno en vez del permiso es exactamente el error de una sola capa que
-- ya nos costó la vista de configuración. Se cierra la capa que faltaba.
--
-- Excepción consciente: is_username_available SÍ permitía enumerar usernames
-- sin cuenta. Menor, pero real.
-- =============================================================================

revoke execute on function create_user_profile(text, text, date, text, text, text) from public, anon;
revoke execute on function get_active_challenge()                    from public, anon;
revoke execute on function get_friends_ranking(integer)              from public, anon;
revoke execute on function is_username_available(text)               from public, anon;
revoke execute on function request_timezone_change(text)             from public, anon;
revoke execute on function viewer_is_friend_of(uuid)                 from public, anon;
revoke execute on function viewer_is_blocked_with(uuid)              from public, anon;
revoke execute on function viewer_can_see_content_of(uuid)           from public, anon;
revoke execute on function viewer_has_admin_role(admin_role)         from public, anon;
revoke execute on function compute_age_band(date)                    from public, anon;

-- --- search_path fijo en las que faltaban -------------------------------------
-- Sin search_path explícito, quien pueda crear objetos en un esquema anterior
-- del path puede secuestrar a qué función u operador resuelve el cuerpo.
create or replace function compute_age_band(birth date)
returns age_band
language sql
immutable
set search_path = public
as $$
  select case
    when birth > (current_date - interval '13 years') then 'under_13'::age_band
    when birth > (current_date - interval '16 years') then '13_15'::age_band
    when birth > (current_date - interval '18 years') then '16_17'::age_band
    else 'adult'::age_band
  end;
$$;

create or replace function user_private_set_age_band()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.age_band := compute_age_band(new.birth_date);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function compute_age_band(date)           from public, anon, authenticated;
revoke execute on function user_private_set_age_band()      from public, anon, authenticated;
revoke execute on function touch_updated_at()               from public, anon, authenticated;

-- --- Aceptado a conciencia: citext vive en el esquema public ------------------
-- El analizador lo marca. Moverlo exigiría reescribir el tipo de profiles.username,
-- que es una clave única y está referenciada por reserved_usernames. El riesgo de
-- la migración supera al beneficio: el aviso es de higiene, no una vulnerabilidad.
