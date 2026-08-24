-- =============================================================================
-- Mira — 0010: políticas de Row Level Security
--
-- Postura por defecto: RLS activo en TODAS las tablas y negación total.
-- Una tabla sin política es inaccesible para anon y authenticated; el rol
-- service_role (backend) saltea RLS por diseño.
--
-- Las tablas que sólo toca el backend (validaciones de IA, moderación, tokens
-- de subida, contadores de rate limit, auditoría) quedan a propósito SIN
-- políticas: no hay forma de leerlas desde la app.
-- =============================================================================

alter table profiles                  enable row level security;
alter table user_private              enable row level security;
alter table user_settings             enable row level security;
alter table blocks                    enable row level security;
alter table friendships               enable row level security;
alter table friend_requests           enable row level security;
alter table challenge_objects         enable row level security;
alter table daily_challenges          enable row level security;
alter table challenge_windows         enable row level security;
alter table submissions               enable row level security;
alter table submission_attempts       enable row level security;
alter table ai_validations            enable row level security;
alter table moderation_results        enable row level security;
alter table upload_tokens             enable row level security;
alter table streak_events             enable row level security;
alter table streak_protections        enable row level security;
alter table ranking_snapshots         enable row level security;
alter table achievements              enable row level security;
alter table user_achievements         enable row level security;
alter table reactions                 enable row level security;
alter table notifications             enable row level security;
alter table push_tokens               enable row level security;
alter table reports                   enable row level security;
alter table app_config                enable row level security;
alter table rate_limit_counters       enable row level security;
alter table admin_users               enable row level security;
alter table admin_audit_log           enable row level security;
alter table account_deletion_requests enable row level security;

-- --- profiles -----------------------------------------------------------------
-- Los perfiles son semi-públicos: hacen falta para buscar gente por username
-- (§15) y para mostrar rankings. No exponen email, teléfono ni fecha de
-- nacimiento — eso vive en user_private.
create policy profiles_select on profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (account_status = 'active' and not viewer_is_blocked_with(id))
  );

create policy profiles_insert_self on profiles
  for insert to authenticated
  with check (id = auth.uid());

-- El usuario edita su perfil, pero el trigger protect_server_owned_profile_fields
-- revierte cualquier intento de tocar racha, estado de cuenta o username.
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- user_private / user_settings ---------------------------------------------
create policy user_private_own on user_private
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_settings_own on user_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- blocks -------------------------------------------------------------------
-- Sólo quien bloquea ve sus bloqueos. La persona bloqueada no se entera.
create policy blocks_own on blocks
  for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

-- --- friendships --------------------------------------------------------------
create policy friendships_participant on friendships
  for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

create policy friendships_delete_participant on friendships
  for delete to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- --- friend_requests ----------------------------------------------------------
create policy friend_requests_visible on friend_requests
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy friend_requests_create on friend_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and not viewer_is_blocked_with(addressee_id)
  );

-- Quien recibe acepta o rechaza; quien envía sólo puede cancelar.
create policy friend_requests_respond on friend_requests
  for update to authenticated
  using (addressee_id = auth.uid() or requester_id = auth.uid())
  with check (
    (addressee_id = auth.uid() and status in ('accepted', 'rejected'))
    or (requester_id = auth.uid() and status = 'cancelled')
  );

-- --- challenge_objects / daily_challenges -------------------------------------
-- SIN política de lectura para usuarios: el catálogo y el calendario revelarían
-- el objeto de hoy antes de que abra la ventana, y los de los próximos días.
-- El cliente obtiene el desafío por RPC, que verifica la ventana (§5).
create policy challenge_objects_admin on challenge_objects
  for all to authenticated
  using (viewer_has_admin_role('moderator'))
  with check (viewer_has_admin_role('admin'));

create policy daily_challenges_admin on daily_challenges
  for all to authenticated
  using (viewer_has_admin_role('moderator'))
  with check (viewer_has_admin_role('admin'));

-- --- challenge_windows --------------------------------------------------------
create policy challenge_windows_own on challenge_windows
  for select to authenticated
  using (user_id = auth.uid());

-- --- submissions --------------------------------------------------------------
-- El corazón de la privacidad (§63): la visibilidad se resuelve en la base,
-- no ocultando elementos en la UI.
create policy submissions_visible on submissions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      status = 'accepted'
      and moderation_status = 'passed'
      and viewer_can_see_content_of(user_id)
    )
  );

-- Sin INSERT/UPDATE/DELETE para el cliente. Toda escritura pasa por el backend,
-- que valida token de subida, attestation, límite de intentos, IA y moderación.
create policy submissions_admin_review on submissions
  for select to authenticated
  using (viewer_has_admin_role('moderator'));

-- --- submission_attempts ------------------------------------------------------
create policy submission_attempts_own on submission_attempts
  for select to authenticated
  using (user_id = auth.uid());

-- --- rachas -------------------------------------------------------------------
create policy streak_events_own on streak_events
  for select to authenticated
  using (user_id = auth.uid());

create policy streak_protections_own on streak_protections
  for select to authenticated
  using (user_id = auth.uid());

-- --- rankings -----------------------------------------------------------------
-- El job de ranking sólo materializa filas de usuarios que aceptaron aparecer
-- (§72), así que la tabla es legible sin filtro adicional. El ranking de amigos
-- no se materializa: se calcula al vuelo sobre friendships, que ya es pequeño.
create policy ranking_snapshots_read on ranking_snapshots
  for select to authenticated
  using (scope in ('global', 'country'));

-- --- logros -------------------------------------------------------------------
create policy achievements_read on achievements
  for select to authenticated
  using (true);

create policy user_achievements_read on user_achievements
  for select to authenticated
  using (user_id = auth.uid() or viewer_can_see_content_of(user_id));

-- --- reacciones ---------------------------------------------------------------
-- Sólo se puede reaccionar a algo que se puede ver.
create policy reactions_read on reactions
  for select to authenticated
  using (
    exists (
      select 1 from submissions s
       where s.id = reactions.submission_id
         and (s.user_id = auth.uid() or viewer_can_see_content_of(s.user_id))
    )
  );

create policy reactions_write on reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from submissions s
       where s.id = reactions.submission_id
         and s.status = 'accepted'
         and s.moderation_status = 'passed'
         and viewer_can_see_content_of(s.user_id)
    )
  );

create policy reactions_delete_own on reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- --- notificaciones y push ----------------------------------------------------
create policy notifications_own on notifications
  for select to authenticated
  using (user_id = auth.uid());

-- Sólo permite marcar como leída; el contenido lo escribe el backend.
create policy notifications_mark_read on notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_tokens_own on push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- reportes -----------------------------------------------------------------
create policy reports_create on reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy reports_read_own on reports
  for select to authenticated
  using (reporter_id = auth.uid() or viewer_has_admin_role('moderator'));

create policy reports_moderate on reports
  for update to authenticated
  using (viewer_has_admin_role('moderator'))
  with check (viewer_has_admin_role('moderator'));

-- --- eliminación de cuenta ----------------------------------------------------
create policy account_deletion_own on account_deletion_requests
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- administración -----------------------------------------------------------
create policy admin_users_read on admin_users
  for select to authenticated
  using (user_id = auth.uid() or viewer_has_admin_role('admin'));

create policy admin_audit_read on admin_audit_log
  for select to authenticated
  using (viewer_has_admin_role('admin'));

-- --- configuración pública ----------------------------------------------------
-- app_config queda cerrada. El cliente lee la vista, que sólo expone las claves
-- marcadas como públicas (los umbrales de IA y los límites no salen del backend).
grant select on public_app_config to authenticated, anon;
