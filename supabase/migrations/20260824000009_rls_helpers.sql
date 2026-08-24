-- =============================================================================
-- Mira — 0009: funciones auxiliares para RLS
--
-- Todas son SECURITY DEFINER (evitan recursión de RLS al consultar tablas
-- protegidas) y STABLE (el planificador las puede cachear dentro del statement).
--
-- Diseño intencional: ninguna función recibe dos usuarios arbitrarios. Siempre
-- comparan contra auth.uid(). Las políticas de RLS se evalúan con los permisos
-- de quien consulta, así que estas funciones son ejecutables por cualquier
-- usuario autenticado — por eso no pueden servir para preguntar cosas sobre
-- terceros ("¿son amigos Fulano y Mengano?").
-- =============================================================================

-- ¿El usuario actual y `target` son amigos?
create or replace function viewer_is_friend_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from friendships f
     where f.user_a = least(auth.uid(), target)
       and f.user_b = greatest(auth.uid(), target)
  );
$$;

-- ¿Hay un bloqueo entre el usuario actual y `target`, en cualquier dirección?
-- Un bloqueo gana sobre cualquier otra regla de visibilidad (§25).
create or replace function viewer_is_blocked_with(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from blocks b
     where (b.blocker_id = auth.uid() and b.blocked_id = target)
        or (b.blocker_id = target      and b.blocked_id = auth.uid())
  );
$$;

-- ¿El usuario actual tiene al menos este rol administrativo?
-- El orden de los valores del enum define la jerarquía: viewer < moderator < admin.
create or replace function viewer_has_admin_role(min_role admin_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from admin_users a
     where a.user_id = auth.uid()
       and a.role >= min_role
  );
$$;

-- ¿El usuario actual puede ver contenido de `target`?
-- Regla del MVP: amigos, y nunca si hay bloqueo. La visibilidad de segundo
-- grado existe en el modelo pero está deshabilitada — ver docs/ARCHITECTURE.md
-- § Por qué friends_of_friends no entra en el MVP.
create or replace function viewer_can_see_content_of(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target = auth.uid()
      or (not viewer_is_blocked_with(target) and viewer_is_friend_of(target));
$$;
