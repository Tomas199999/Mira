-- =============================================================================
-- Mira — 0014: cerrar la escritura a través de la vista public_app_config
--
-- HALLAZGO GRAVE, verificado explotándolo en producción.
--
-- `public_app_config` es una vista simple sobre `app_config`, y en Postgres eso
-- la vuelve automáticamente actualizable. Como no era `security_invoker`, las
-- escrituras a través de ella corrían con los permisos del dueño de la vista y
-- salteaban por completo el RLS de `app_config`. Sumado a los grants por defecto
-- de Supabase, cualquiera con la clave publicable — que viaja DENTRO del binario
-- de la app y por lo tanto es pública — podía reescribir la configuración:
-- umbrales de la IA, límites de rate limiting, edad mínima.
--
-- Reproducido con un PATCH sin sesión iniciada: feed_page_size pasó de 20 a 999.
--
-- El arreglo tiene dos capas, para que ninguna sea el único punto de falla:
--   1. La vista pasa a security_invoker: deja de tener poderes propios y todo
--      lo que la atraviese se evalúa con los permisos de quien consulta.
--   2. app_config gana una política de SELECT acotada a las claves públicas, y
--      la vista pierde todo permiso de escritura.
-- Aunque alguien re-otorgue los grants por error, el RLS sigue negando.
-- =============================================================================

-- --- 1. La vista deja de ser una puerta trasera -------------------------------
alter view public_app_config set (security_invoker = on);

-- --- 2. Lectura acotada a lo que es público de verdad -------------------------
-- Con security_invoker activo, la vista necesita que el rol pueda leer la tabla.
-- La política deja pasar SÓLO las filas marcadas como públicas: los umbrales de
-- IA y los límites siguen siendo invisibles.
drop policy if exists app_config_public_read on app_config;
create policy app_config_public_read on app_config
  for select to authenticated, anon
  using (is_public);

-- --- 3. Nadie escribe la configuración desde el cliente ------------------------
revoke insert, update, delete on public_app_config from anon, authenticated;
revoke insert, update, delete on app_config from anon, authenticated;

-- --- 4. Reparar el valor alterado durante la verificación ----------------------
update app_config set value = '20'::jsonb, updated_at = now()
 where key = 'feed_page_size';

-- --- 5. Que no vuelva a pasar con la próxima vista -----------------------------
-- Toda vista futura sobre una tabla con RLS tiene que declararse
-- security_invoker. Sin eso hereda los permisos del dueño y saltea las políticas.
-- La aserción correspondiente vive en scripts/verify-schema.mjs.
