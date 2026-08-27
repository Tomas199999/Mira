-- =============================================================================
-- Mira — 0029: panel administrativo (§46)
--
-- Regla que gobierna todo lo de acá: NINGUNA imagen llega a la cola de revisión
-- sin haber pasado antes por el clasificador automático. Si la moderación la
-- marcó en `minor_safety`, `nudity` o `sexual`, se bloquea y NO se muestra —
-- ni siquiera a un administrador. En una app que admite menores, una cola sin
-- ese filtro expone al equipo a contenido que no debe ver y crea obligaciones
-- legales de reporte. Ver docs/SECURITY.md § Moderación.
--
-- Toda acción administrativa queda registrada en admin_audit_log. No es
-- opcional: es lo que se muestra si alguna vez hay que justificar una sanción.
-- =============================================================================

-- --- Métricas del producto -----------------------------------------------------
create or replace function admin_metrics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not viewer_has_admin_role('viewer') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',     (select count(*) from profiles),
      'active',    (select count(*) from profiles where account_status = 'active'),
      'suspended', (select count(*) from profiles where account_status in ('suspended','banned')),
      'newToday',  (select count(*) from profiles where created_at >= current_date)
    ),
    -- Activos = quienes subieron una foto. Es la métrica honesta para esta app:
    -- abrir la pantalla y no participar no es actividad.
    'activity', jsonb_build_object(
      'dau', (select count(distinct user_id) from submissions where submitted_at >= now() - interval '1 day'),
      'wau', (select count(distinct user_id) from submissions where submitted_at >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from submissions where submitted_at >= now() - interval '30 days')
    ),
    'submissions', jsonb_build_object(
      'today',    (select count(*) from submissions where challenge_date = current_date),
      'accepted', (select count(*) from submissions where challenge_date = current_date and status = 'accepted'),
      'rejected', (select count(*) from submissions where challenge_date = current_date and status = 'rejected'),
      'inReview', (select count(*) from submissions where status = 'in_review'),
      'blocked',  (select count(*) from submissions where challenge_date = current_date and status = 'blocked')
    ),
    -- Tasa de participación del día: cuántos de los que tenían ventana subieron.
    'participationToday', (
      select case when count(*) = 0 then 0
             else round(count(*) filter (where exists (
               select 1 from submissions s
                where s.user_id = w.user_id and s.challenge_date = w.challenge_date
                  and s.status in ('accepted','in_review')))::numeric / count(*), 3)
             end
        from challenge_windows w where w.challenge_date = current_date
    ),
    'streaks', jsonb_build_object(
      'average', (select round(avg(current_streak), 2) from profiles where account_status = 'active'),
      'longest', (select max(best_streak) from profiles)
    ),
    -- Costo real de la IA en las últimas 24 horas, en tokens.
    'ai', jsonb_build_object(
      'callsToday',   (select count(*) from ai_validations where created_at >= now() - interval '1 day'),
      'escalations',  (select count(*) from ai_validations where created_at >= now() - interval '1 day' and stage = 'escalation'),
      'inputTokens',  (select coalesce(sum(input_tokens), 0) from ai_validations where created_at >= now() - interval '1 day'),
      'avgLatencyMs', (select round(avg(latency_ms)) from ai_validations where created_at >= now() - interval '1 day')
    ),
    'reports', jsonb_build_object(
      'open',     (select count(*) from reports where status = 'open'),
      'reviewing', (select count(*) from reports where status = 'reviewing')
    )
  ) into result;

  return result;
end;
$$;

grant execute on function admin_metrics() to authenticated;
revoke execute on function admin_metrics() from public, anon;

-- --- Cola de revisión -----------------------------------------------------------
-- Sólo lo que el clasificador consideró seguro de mirar.
create or replace function admin_review_queue(p_limit integer default 50)
returns table (
  submission_id  uuid,
  user_id        uuid,
  username       citext,
  challenge_date date,
  object_display text,
  photo_path     text,
  ai_confidence  numeric,
  ai_reason      text,
  attempts       integer,
  submitted_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not viewer_has_admin_role('moderator') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
  select s.id, s.user_id, p.username, s.challenge_date, s.object_display_name,
         s.photo_path, s.ai_confidence,
         (select v.reason from ai_validations v
           where v.submission_id = s.id order by v.created_at desc limit 1),
         (select count(*)::int from submission_attempts a where a.user_id = s.user_id
           and a.created_at::date = s.challenge_date),
         s.submitted_at
    from submissions s
    join profiles p on p.id = s.user_id
   where s.status = 'in_review'
     -- La condición que protege al equipo: si el clasificador dijo que no es
     -- seguro mirarla, no aparece acá bajo ninguna circunstancia.
     and not exists (
       select 1 from moderation_results m
        where m.submission_id = s.id and not m.safe_for_human_review)
   order by s.submitted_at
   limit least(coalesce(p_limit, 50), 100);
end;
$$;

grant execute on function admin_review_queue(integer) to authenticated;
revoke execute on function admin_review_queue(integer) from public, anon;

-- --- Resolver una revisión -------------------------------------------------------
-- Aceptar de forma retroactiva SÍ mueve la racha: es la promesa de docs/AI.md,
-- que ante la duda el usuario no pierde nada.
create or replace function admin_resolve_review(
  p_submission_id uuid,
  p_accept        boolean,
  p_note          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s      submissions%rowtype;
  streak integer;
begin
  if not viewer_has_admin_role('moderator') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  select * into s from submissions where id = p_submission_id for update;
  if not found then
    raise exception 'submission_not_found' using errcode = 'no_data_found';
  end if;

  if p_accept then
    update submissions set status = 'accepted', updated_at = now() where id = s.id;
    if not s.was_late then
      streak := apply_streak_increment(s.user_id, s.challenge_date, s.id);
      update submissions set counted_for_streak = true where id = s.id;
      insert into streak_events (user_id, challenge_date, event, streak_before, streak_after, submission_id)
      values (s.user_id, s.challenge_date, 'restored', greatest(streak - 1, 0), streak, s.id)
      on conflict do nothing;
    end if;
  else
    update submissions set status = 'rejected', updated_at = now() where id = s.id;
  end if;

  insert into admin_audit_log (admin_id, action, target_type, target_id, before, after, note)
  values (auth.uid(),
          case when p_accept then 'review_accept' else 'review_reject' end,
          'submission', s.id::text,
          jsonb_build_object('status', s.status),
          jsonb_build_object('status', case when p_accept then 'accepted' else 'rejected' end),
          p_note);

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'rejected' end,
                            'streak', streak);
end;
$$;

grant execute on function admin_resolve_review(uuid, boolean, text) to authenticated;
revoke execute on function admin_resolve_review(uuid, boolean, text) from public, anon;

-- --- Reportes --------------------------------------------------------------------
create or replace function admin_reports(p_status report_status default 'open', p_limit integer default 50)
returns table (
  report_id      uuid,
  reason         report_reason,
  description    text,
  created_at     timestamptz,
  reporter       citext,
  reported_user  citext,
  submission_id  uuid,
  photo_path     text,
  safe_to_view   boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not viewer_has_admin_role('moderator') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  return query
  select r.id, r.reason, r.description, r.created_at,
         rp.username, tp.username, r.submission_id, s.photo_path,
         -- Se informa si es seguro mirarla; la interfaz no muestra la imagen
         -- cuando es false, y el endpoint tampoco la firma.
         coalesce((select bool_and(m.safe_for_human_review) from moderation_results m
                    where m.submission_id = s.id), true)
    from reports r
    left join profiles rp on rp.id = r.reporter_id
    left join profiles tp on tp.id = coalesce(r.reported_user_id, (select user_id from submissions where id = r.submission_id))
    left join submissions s on s.id = r.submission_id
   where r.status = p_status
   order by r.created_at
   limit least(coalesce(p_limit, 50), 100);
end;
$$;

grant execute on function admin_reports(report_status, integer) to authenticated;
revoke execute on function admin_reports(report_status, integer) from public, anon;

-- --- Acciones sobre usuarios ------------------------------------------------------
create or replace function admin_set_account_status(
  p_user_id uuid,
  p_status  account_status,
  p_note    text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  previous account_status;
begin
  if not viewer_has_admin_role('admin') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- Un administrador no se suspende a sí mismo por accidente.
  if p_user_id = auth.uid() then
    raise exception 'cannot_moderate_self' using errcode = 'check_violation';
  end if;

  select account_status into previous from profiles where id = p_user_id;
  if previous is null then
    raise exception 'user_not_found' using errcode = 'no_data_found';
  end if;

  update profiles set account_status = p_status, updated_at = now() where id = p_user_id;

  insert into admin_audit_log (admin_id, action, target_type, target_id, before, after, note)
  values (auth.uid(), 'set_account_status', 'user', p_user_id::text,
          jsonb_build_object('status', previous),
          jsonb_build_object('status', p_status), p_note);

  return true;
end;
$$;

grant execute on function admin_set_account_status(uuid, account_status, text) to authenticated;
revoke execute on function admin_set_account_status(uuid, account_status, text) from public, anon;

create or replace function admin_resolve_report(
  p_report_id uuid,
  p_status    report_status,
  p_note      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not viewer_has_admin_role('moderator') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  update reports
     set status = p_status, resolved_at = now(), resolved_by = auth.uid(), resolution_note = p_note
   where id = p_report_id;

  insert into admin_audit_log (admin_id, action, target_type, target_id, after, note)
  values (auth.uid(), 'resolve_report', 'report', p_report_id::text,
          jsonb_build_object('status', p_status), p_note);

  return true;
end;
$$;

grant execute on function admin_resolve_report(uuid, report_status, text) to authenticated;
revoke execute on function admin_resolve_report(uuid, report_status, text) from public, anon;

-- --- Catálogo de objetos ----------------------------------------------------------
create or replace function admin_approve_object(p_object_id uuid, p_note text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not viewer_has_admin_role('admin') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;

  -- El CHECK de la tabla ya exige criterios visuales para aprobar; acá se deja
  -- constancia de QUIÉN revisó, que es lo que pide §4.
  update challenge_objects
     set status = 'approved', safety_reviewed_at = now(), safety_reviewed_by = auth.uid(),
         safety_notes = coalesce(p_note, safety_notes), updated_at = now()
   where id = p_object_id;

  insert into admin_audit_log (admin_id, action, target_type, target_id, after, note)
  values (auth.uid(), 'approve_object', 'challenge_object', p_object_id::text,
          jsonb_build_object('status', 'approved'), p_note);

  return true;
end;
$$;

grant execute on function admin_approve_object(uuid, text) to authenticated;
revoke execute on function admin_approve_object(uuid, text) from public, anon;

-- --- ¿Quién soy? ------------------------------------------------------------------
create or replace function admin_whoami()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'isAdmin', exists (select 1 from admin_users where user_id = auth.uid()),
    'role', (select role from admin_users where user_id = auth.uid())
  );
$$;

grant execute on function admin_whoami() to authenticated;
revoke execute on function admin_whoami() from public, anon;
