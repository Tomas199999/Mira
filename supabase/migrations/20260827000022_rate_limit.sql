-- =============================================================================
-- Mira — 0022: rate limiting (§35)
--
-- Ventana fija por cubeta. Es lo bastante bueno para el MVP y no agrega una
-- dependencia más; la interfaz está pensada para poder mudarla a Redis sin
-- tocar a quien la llama.
--
-- Se hace en la base y no en la función serverless a propósito: las funciones
-- son sin estado y se escalan horizontalmente, así que un contador en memoria
-- limitaría por instancia, que es lo mismo que no limitar.
-- =============================================================================

create or replace function consume_rate_limit(
  p_bucket   text,
  p_limit    integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  window_start timestamptz;
  current_count integer;
begin
  -- Se trunca el instante al inicio de su ventana, así todas las peticiones de
  -- un mismo período comparten fila.
  window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limit_counters (bucket, window_start, count)
  values (p_bucket, window_start, 1)
  on conflict (bucket, window_start)
    do update set count = rate_limit_counters.count + 1
  returning count into current_count;

  return jsonb_build_object(
    'allowed', current_count <= p_limit,
    'count', current_count,
    'limit', p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from
      (window_start + make_interval(secs => p_window_seconds)) - now()))::int)
  );
end;
$$;

revoke execute on function consume_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Limpieza: las ventanas viejas no sirven para nada y sólo ocupan lugar.
create or replace function purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare removed integer;
begin
  delete from rate_limit_counters where window_start < now() - interval '2 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function purge_rate_limits() from public, anon, authenticated;
