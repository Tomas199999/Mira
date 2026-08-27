-- =============================================================================
-- Mira — 0028: programar el aviso del desafío desde Postgres
--
-- El plan Hobby de Vercel **sólo permite crons diarios**, y el aviso tiene que
-- correr cada pocos minutos: la ventana de cada usuario se sortea al segundo,
-- así que un cron diario haría llegar la notificación con horas de retraso, o
-- directamente después de que la ventana cerró.
--
-- En vez de pagar Vercel Pro se usa pg_cron, que en Supabase está disponible en
-- todos los planes y da granularidad de minutos. pg_net hace la llamada HTTP al
-- endpoint, que sigue teniendo toda la lógica en TypeScript.
--
-- El secreto va en Vault, no en una tabla: pg_cron guarda el comando en texto
-- plano en cron.job, así que escribirlo ahí lo dejaría legible para cualquiera
-- que pueda leer esa tabla.
-- =============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- --- Dónde vive la configuración del programador ------------------------------
create table if not exists scheduler_config (
  key   text primary key,
  value text not null,
  description text not null,
  updated_at timestamptz not null default now()
);

alter table scheduler_config enable row level security;
-- Sin políticas: sólo el backend y los jobs la ven.

comment on table scheduler_config is
  'Configuración del programador. El secreto del cron NO va acá: va en Vault.';

-- --- La función que dispara el aviso -------------------------------------------
-- Lee la URL de la tabla y el secreto de Vault, y llama al endpoint. pg_net es
-- asíncrono: encola la petición y devuelve enseguida, así que el job no se
-- queda esperando a que terminen los envíos.
create or replace function trigger_challenge_push()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  base_url text;
  secret   text;
  request_id bigint;
begin
  select value into base_url from scheduler_config where key = 'api_base_url';
  if base_url is null or base_url = '' then
    raise notice 'trigger_challenge_push: falta api_base_url en scheduler_config';
    return null;
  end if;

  select decrypted_secret into secret
    from vault.decrypted_secrets where name = 'cron_secret';
  if secret is null then
    raise notice 'trigger_challenge_push: falta el secreto cron_secret en Vault';
    return null;
  end if;

  select net.http_get(
    url := base_url || '/api/cron/send-challenge-push',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke execute on function trigger_challenge_push() from public, anon, authenticated;

-- --- Registrar el job -----------------------------------------------------------
-- Cada cinco minutos. Más seguido no aporta: el peor retraso posible entre que
-- abre la ventana y llega el aviso ya es de cinco minutos, sobre una ventana
-- que dura dos horas.
select cron.unschedule('mira-challenge-push')
 where exists (select 1 from cron.job where jobname = 'mira-challenge-push');

select cron.schedule(
  'mira-challenge-push',
  '*/5 * * * *',
  $job$ select public.trigger_challenge_push(); $job$
);

-- Limpieza de los contadores de rate limit, una vez por día.
select cron.unschedule('mira-purge-rate-limits')
 where exists (select 1 from cron.job where jobname = 'mira-purge-rate-limits');

select cron.schedule(
  'mira-purge-rate-limits',
  '17 4 * * *',
  $job$ select public.purge_rate_limits(); $job$
);
