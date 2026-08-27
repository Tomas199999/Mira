-- =============================================================================
-- Mira — 0021: grafo social y descubrimiento por contactos
--
-- El punto delicado es §16: encontrar gente por la agenda sin guardar la agenda
-- de nadie. La agenda de un usuario contiene datos personales de TERCEROS que
-- nunca aceptaron nada, así que no se persiste ni un byte de ella.
--
-- Cada usuario publica el hash de SU PROPIO teléfono, y sólo si lo pide. El
-- cliente manda los hashes de su agenda, el servidor los compara en memoria
-- contra esa tabla y descarta todo lo que no coincide.
-- =============================================================================

-- --- Publicar el propio teléfono para ser encontrable -------------------------
-- El hash lo calcula el servidor: si lo calculara el cliente, podría publicar
-- el hash del teléfono de otra persona y aparecer cuando sus contactos la
-- buscan (la suplantación que cerró la migración 0015).
create or replace function set_phone_discoverability(
  p_phone_e164 text,
  p_discoverable boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
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

  -- E.164: un '+' y entre 8 y 15 dígitos.
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

insert into app_config (key, value, description, is_public) values
  ('contact_hash_salt',
   '"mira.contacts.v1"'::jsonb,
   'Separador de dominio para los hashes de contacto. Viaja en el binario de la app, así que NO es un secreto: sirve para que estos hashes no se puedan cruzar con los de otra aplicación.',
   true)
on conflict (key) do nothing;

-- --- Comparar la agenda contra quienes optaron por ser encontrables -----------
-- Recibe hashes, devuelve perfiles. Lo que no coincide se descarta acá mismo:
-- no hay ninguna tabla donde se guarde lo que el usuario mandó.
create or replace function match_contact_hashes(p_hashes bytea[])
returns table (
  user_id      uuid,
  username     citext,
  display_name text,
  avatar_path  text,
  relationship text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.username,
         p.display_name,
         p.avatar_path,
         case
           when viewer_is_blocked_with(p.id)                                 then 'blocked'
           when viewer_is_friend_of(p.id)                                    then 'friends'
           when exists (select 1 from friend_requests fr
                         where fr.requester_id = auth.uid() and fr.addressee_id = p.id
                           and fr.status = 'pending')                        then 'pending_sent'
           when exists (select 1 from friend_requests fr
                         where fr.requester_id = p.id and fr.addressee_id = auth.uid()
                           and fr.status = 'pending')                        then 'pending_received'
           else 'none'
         end as relationship
    from user_private up
    join profiles p on p.id = up.user_id
   where up.discoverable_by_phone
     and up.phone_hash = any (p_hashes)
     and p.id <> auth.uid()
     and p.account_status = 'active'
     and not viewer_is_blocked_with(p.id)
   -- Un tope duro: sin esto, mandar cien mil hashes convierte esto en una
   -- herramienta de enumeración masiva.
   limit 200;
$$;

grant execute on function match_contact_hashes(bytea[]) to authenticated;
revoke execute on function match_contact_hashes(bytea[]) from public, anon;

-- --- Buscar por username -------------------------------------------------------
create or replace function search_users(p_query text, p_limit integer default 20)
returns table (
  user_id      uuid,
  username     citext,
  display_name text,
  avatar_path  text,
  current_streak integer,
  relationship text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_path, p.current_streak,
         case
           when viewer_is_friend_of(p.id) then 'friends'
           when exists (select 1 from friend_requests fr
                         where fr.requester_id = auth.uid() and fr.addressee_id = p.id
                           and fr.status = 'pending')                        then 'pending_sent'
           when exists (select 1 from friend_requests fr
                         where fr.requester_id = p.id and fr.addressee_id = auth.uid()
                           and fr.status = 'pending')                        then 'pending_received'
           else 'none'
         end
    from profiles p
   where p.account_status = 'active'
     and p.id <> auth.uid()
     and not viewer_is_blocked_with(p.id)
     -- Sólo prefijo, no subcadena: buscar "ana" no debería listar a todos los
     -- que tengan "ana" en el medio del nombre.
     and p.username like lower(trim(p_query)) || '%'
   order by length(p.username), p.username
   limit least(p_limit, 20);
$$;

grant execute on function search_users(text, integer) to authenticated;
revoke execute on function search_users(text, integer) from public, anon;

-- --- Estado del grafo del usuario ----------------------------------------------
create or replace function get_my_social_graph()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'friends', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.id, 'username', p.username, 'displayName', p.display_name,
        'avatarPath', p.avatar_path, 'currentStreak', p.current_streak)
        order by p.current_streak desc, p.username)
        from friendships f
        join profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
       where (f.user_a = auth.uid() or f.user_b = auth.uid())
         and p.account_status = 'active'
    ), '[]'::jsonb),
    'incoming', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId', fr.id, 'userId', p.id, 'username', p.username,
        'displayName', p.display_name, 'avatarPath', p.avatar_path,
        'createdAt', fr.created_at) order by fr.created_at desc)
        from friend_requests fr
        join profiles p on p.id = fr.requester_id
       where fr.addressee_id = auth.uid() and fr.status = 'pending'
         and p.account_status = 'active'
    ), '[]'::jsonb),
    'outgoing', coalesce((
      select jsonb_agg(jsonb_build_object(
        'requestId', fr.id, 'userId', p.id, 'username', p.username,
        'displayName', p.display_name, 'avatarPath', p.avatar_path,
        'createdAt', fr.created_at) order by fr.created_at desc)
        from friend_requests fr
        join profiles p on p.id = fr.addressee_id
       where fr.requester_id = auth.uid() and fr.status = 'pending'
         and p.account_status = 'active'
    ), '[]'::jsonb)
  );
$$;

grant execute on function get_my_social_graph() to authenticated;
revoke execute on function get_my_social_graph() from public, anon;
