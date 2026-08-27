-- =============================================================================
-- Mira — shim de Supabase para verificación local
--
-- SÓLO PARA TESTS. Recrea los objetos que Supabase provee (roles, esquema auth,
-- auth.uid(), esquema storage) sobre un Postgres limpio, para poder ejecutar las
-- migraciones reales y probar RLS sin depender de la nube.
--
-- Este archivo NO se aplica en producción: no está en supabase/migrations.
-- =============================================================================

-- --- Extensiones donde las pone Supabase --------------------------------------
-- pgcrypto vive en `extensions`, no en `public`. Replicarlo acá es lo que hace
-- que una función con `search_path = public` que use digest() falle en los
-- tests en vez de fallar recién en producción.
create schema if not exists extensions;
drop extension if exists pgcrypto cascade;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to public;

-- --- Roles de Supabase --------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- --- Esquema auth -------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Misma implementación que Supabase: lee el sub del JWT desde la config de sesión.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- --- Esquema storage ----------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;

-- Devuelve los segmentos de carpeta de una ruta, sin el nombre de archivo.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
