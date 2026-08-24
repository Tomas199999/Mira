-- =============================================================================
-- Mira — 0001: extensiones y tipos enumerados
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- --- Grafo social -------------------------------------------------------------
create type friend_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

-- --- Desafíos -----------------------------------------------------------------
-- El catálogo de objetos pasa por un pipeline de aprobación (§4). Un objeto
-- nunca llega a producción sin quedar en 'approved' por revisión explícita.
create type challenge_object_status as enum ('draft', 'pending_safety', 'pending_review', 'approved', 'rejected', 'retired');
create type challenge_difficulty     as enum ('easy', 'medium', 'hard');
create type daily_challenge_status   as enum ('scheduled', 'active', 'closed', 'cancelled');

-- --- Envíos -------------------------------------------------------------------
-- 'in_review' no rompe la racha: se resuelve retroactivamente (ver docs/AI.md).
create type submission_status  as enum ('pending', 'processing', 'accepted', 'rejected', 'in_review', 'blocked', 'expired');
create type ai_decision        as enum ('accepted', 'rejected', 'review', 'error');
create type moderation_status  as enum ('pending', 'passed', 'flagged', 'blocked', 'error');
create type photo_visibility   as enum ('friends', 'friends_of_friends');

-- --- Seguridad y moderación ---------------------------------------------------
create type report_reason  as enum ('sexual_content', 'violence', 'hate', 'harassment', 'spam', 'illegal', 'dangerous', 'impersonation', 'other');
create type report_status  as enum ('open', 'reviewing', 'actioned', 'dismissed');
create type account_status as enum ('active', 'suspended', 'banned', 'pending_deletion', 'deleted');
create type admin_role     as enum ('viewer', 'moderator', 'admin');

-- --- Edad ---------------------------------------------------------------------
-- Se deriva de la fecha de nacimiento y gobierna qué funciones están habilitadas.
-- 'under_13' no puede usar la app; '13_15' y '16_17' tienen rankings públicos
-- forzados a off. Ver docs/SECURITY.md § Menores.
create type age_band as enum ('under_13', '13_15', '16_17', 'adult');

-- --- Gamificación -------------------------------------------------------------
create type ranking_scope as enum ('global', 'country', 'friends');
create type reaction_type as enum ('fire', 'laugh', 'clap', 'wow', 'heart');

-- --- Dispositivos -------------------------------------------------------------
create type device_platform as enum ('ios', 'android');
