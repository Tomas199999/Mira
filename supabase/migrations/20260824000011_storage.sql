-- =============================================================================
-- Mira — 0011: buckets de storage y sus políticas
--
-- Decisión (docs/ARCHITECTURE.md § Subida de fotos): el cliente NO sube a
-- través del backend. El backend emite una signed upload URL de un solo uso y
-- el cliente sube directo a Storage. Así los bytes de la imagen no atraviesan
-- una función serverless (evita el límite de payload y el costo de ancho de
-- banda duplicado), pero el backend sigue decidiendo quién sube y dónde.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('submissions', 'submissions', false, 10485760, array['image/jpeg', 'image/webp', 'image/heic']),
  ('avatars',     'avatars',     false,  2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- --- submissions --------------------------------------------------------------
-- Convención de rutas: {user_id}/{challenge_date}/{submission_id}_{variant}.webp
--
-- Sin INSERT/UPDATE/DELETE para el cliente: sube con signed upload URL, que es
-- una autorización previa del backend y no pasa por estas políticas.
-- La lectura tampoco es directa: el feed recibe signed URLs con TTL corto.
-- Esta política existe sólo para que el dueño pueda releer sus propios archivos.
create policy "submissions_owner_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- avatars ------------------------------------------------------------------
-- El avatar sí se sube directo: es contenido de bajo riesgo y sin pipeline de IA.
create policy "avatars_owner_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Los avatares de gente que puedo ver, los puedo leer.
create policy "avatars_visible_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or viewer_can_see_content_of(((storage.foldername(name))[1])::uuid)
    )
  );
