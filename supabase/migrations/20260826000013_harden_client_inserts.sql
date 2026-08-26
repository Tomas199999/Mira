-- =============================================================================
-- Mira — 0013: acotar lo que el cliente puede INSERTAR
--
-- Hallazgo: la migración 0002 revocó UPDATE sobre profiles y lo re-otorgó por
-- columna, pero dejó INSERT abierto a las 13 columnas. Combinado con la política
-- `profiles_insert_self`, un usuario autenticado podía crear su propio perfil
-- con current_streak = 9999, y saltearse la validación de username.
--
-- Es el mismo agujero de §61 que creíamos cerrado, entrando por la otra puerta.
-- =============================================================================

-- --- 1. anon no escribe nada, nunca ------------------------------------------
-- Supabase otorga por defecto todos los privilegios sobre el esquema public a
-- anon y authenticated, y deja que RLS haga de única puerta. Para anon eso
-- funciona hoy porque ninguna política lo incluye, pero significa que agregar
-- una política permisiva por error abre escritura anónima. Se revoca y listo.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete on public.%I from anon', t.tablename);
  end loop;
end $$;

alter default privileges in schema public revoke insert, update, delete on tables from anon;

-- --- 2. El perfil no lo crea el cliente ---------------------------------------
-- Crear una cuenta escribe en tres tablas (profiles, user_private,
-- user_settings) y tiene que ser atómico: tres inserts desde el cliente dejan
-- cuentas a medio crear si el proceso se corta. Además el username necesita
-- validarse contra una lista de reservados y la edad contra el mínimo legal.
--
-- Todo eso es una transacción del servidor, así que el cliente pierde el INSERT.
drop policy if exists profiles_insert_self on profiles;
revoke insert on profiles from authenticated;

-- --- 3. Una solicitud de amistad nace pendiente -------------------------------
-- Sin esto, un usuario podía insertar directamente una fila con
-- status = 'accepted'. No creaba la amistad (el trigger es BEFORE UPDATE), pero
-- dejaba una solicitud que la interfaz mostraría como aceptada.
drop policy if exists friend_requests_create on friend_requests;
create policy friend_requests_create on friend_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and responded_at is null
    and not viewer_is_blocked_with(addressee_id)
  );

-- --- 4. Un reporte nace abierto ------------------------------------------------
drop policy if exists reports_create on reports;
create policy reports_create on reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and status = 'open'
    and resolved_at is null
    and resolved_by is null
  );

-- --- 5. Usernames reservados ---------------------------------------------------
-- Como tabla y no como lista en el código: agregar uno es un INSERT, no un deploy.
create table reserved_usernames (
  username citext primary key,
  reason   text not null default 'reserved'
);

alter table reserved_usernames enable row level security;
-- Sin políticas: el cliente no la lee ni la escribe. La consulta la función.

insert into reserved_usernames (username, reason) values
  ('admin','system'), ('administrator','system'), ('root','system'),
  ('support','system'), ('soporte','system'), ('help','system'), ('ayuda','system'),
  ('mira','brand'), ('miraapp','brand'), ('equipomira','brand'), ('team','brand'),
  ('moderator','system'), ('moderador','system'), ('staff','system'),
  ('official','impersonation'), ('oficial','impersonation'),
  ('security','system'), ('seguridad','system'), ('info','system'),
  ('null','reserved'), ('undefined','reserved'), ('me','reserved'), ('yo','reserved'),
  ('settings','route'), ('ajustes','route'), ('profile','route'), ('perfil','route'),
  ('challenge','route'), ('desafio','route'), ('feed','route'), ('ranking','route')
on conflict do nothing;

-- --- 6. Alta de perfil, atómica y validada ------------------------------------
-- El backend llama a esto después de su propia validación (palabras ofensivas,
-- rate limiting). Lo que se valida acá es lo que NO puede quedar librado al
-- cliente: unicidad, formato, reservados y edad mínima.
create or replace function create_user_profile(
  p_username     text,
  p_display_name text,
  p_birth_date   date,
  p_country_code text,
  p_timezone     text,
  p_locale       text default 'es'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  min_age    integer;
  eea        boolean;
  norm_user  citext := lower(trim(p_username));
  norm_cc    char(2) := upper(trim(p_country_code));
begin
  if uid is null then
    raise exception 'unauthenticated' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from profiles where id = uid) then
    raise exception 'profile_already_exists' using errcode = 'unique_violation';
  end if;

  if norm_user !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'username_invalid' using errcode = 'check_violation';
  end if;

  if exists (select 1 from reserved_usernames where username = norm_user) then
    raise exception 'username_reserved' using errcode = 'check_violation';
  end if;

  if exists (select 1 from profiles where username = norm_user) then
    raise exception 'username_taken' using errcode = 'unique_violation';
  end if;

  -- Edad mínima: 13 en general, 16 en el Espacio Económico Europeo (GDPR art. 8).
  eea := norm_cc = any (array[
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO']);

  select (value #>> '{}')::int into min_age
    from app_config
   where key = case when eea then 'min_age_years_eea' else 'min_age_years' end;

  if p_birth_date > (current_date - make_interval(years => min_age)) then
    raise exception 'age_restricted' using errcode = 'check_violation';
  end if;

  if p_birth_date < current_date - interval '120 years' then
    raise exception 'birth_date_invalid' using errcode = 'check_violation';
  end if;

  insert into profiles (id, username, display_name, country_code)
  values (uid, norm_user, trim(p_display_name), norm_cc);

  insert into user_private (user_id, birth_date, timezone, locale)
  values (uid, p_birth_date, coalesce(nullif(trim(p_timezone), ''), 'UTC'), coalesce(p_locale, 'es'));

  -- El trigger de menores fuerza acá la privacidad según la franja etaria.
  insert into user_settings (user_id) values (uid);

  return jsonb_build_object(
    'id', uid,
    'username', norm_user,
    'display_name', trim(p_display_name),
    'country_code', norm_cc
  );
end;
$$;

-- La llama el backend con la sesión del usuario; por eso authenticated puede
-- ejecutarla. Toda la validación que importa está adentro.
grant execute on function create_user_profile(text, text, date, text, text, text) to authenticated;

-- --- 7. Disponibilidad de username --------------------------------------------
-- Consulta de sólo lectura para el onboarding. No revela nada: responde
-- únicamente si el nombre está libre.
create or replace function is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(p_username)) ~ '^[a-z0-9_.]{3,20}$'
     and not exists (select 1 from reserved_usernames where username = lower(trim(p_username)))
     and not exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

grant execute on function is_username_available(text) to authenticated;
