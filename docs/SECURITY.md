# Seguridad y privacidad

## 1. Modelo de amenazas

| Quién | Qué quiere | Qué lo frena |
|---|---|---|
| Usuario que quiere mantener su racha sin jugar | Subir una foto vieja, una captura o la foto de otro | Cámara in-app sin galería, App Attest / Play Integrity, token de subida de un solo uso, pHash contra reutilización, detección de foto-de-pantalla en el mismo pase de visión |
| Usuario que quiere inflar su posición | Editar su racha o su ranking | Permisos por columna en `profiles`, funciones de dominio `SECURITY DEFINER`, snapshots de ranking que sólo escribe un job |
| Curioso | Ver fotos de gente que no lo agregó | RLS: `viewer_can_see_content_of()` se evalúa en la base, no en la UI |
| Curioso | Saber el objeto del día antes de tiempo | `challenge_objects` y `daily_challenges` sin política de lectura; `get_active_challenge()` oculta el objeto hasta `opens_at`; cambios de zona horaria diferidos un día |
| Acosador | Encontrar y contactar a una persona concreta | Bloqueo bidireccional que gana sobre todo, cuentas privadas, rankings opt-in, menores fuera de rankings públicos |
| Spammer | Cuentas masivas, solicitudes en masa | Rate limiting por acción, verificación de email, límites iniciales más bajos, reportes |
| Quien intente subir contenido ilegal | Publicarlo | Moderación automática antes de que la imagen sea visible para nadie, incluido el equipo |

**Lo que este diseño NO promete:** nadie puede impedir que alguien fotografíe
una taza que no es suya, o que le pida a otra persona la foto. El objetivo es
que hacer trampa cueste más trabajo que jugar, no que sea imposible.

## 2. Dónde vive cada secreto

| Secreto | Dónde | Nunca |
|---|---|---|
| `SUPABASE_ANON_KEY` | app móvil, backend | — (es pública por diseño; su poder lo limita RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | sólo backend | jamás en `apps/mobile`, jamás en una variable `EXPO_PUBLIC_*` |
| `ANTHROPIC_API_KEY` | sólo backend | la app nunca habla con el proveedor de IA |
| `UPLOAD_TOKEN_SECRET` | sólo backend | — |
| `CRON_SECRET` | sólo backend | — |

Todo lo que empieza con `EXPO_PUBLIC_` **se embebe en el binario** y es
legible por cualquiera que descomprima el `.ipa` o el `.apk`. Esa es la única
regla que hay que recordar.

## 3. Row Level Security

RLS está activo en **todas** las tablas y la postura por defecto es negar.
Una tabla sin política es inaccesible desde la app; el rol `service_role`
(backend) saltea RLS por diseño.

Deliberadamente **sin ninguna política**, o sea invisibles para la app:
`ai_validations`, `moderation_results`, `upload_tokens`,
`rate_limit_counters`, `admin_audit_log`, `app_config`.

Las funciones auxiliares de RLS nunca reciben dos usuarios arbitrarios: siempre
comparan contra `auth.uid()`. Si no fuera así, cualquiera podría preguntarle a
la base "¿son amigos Fulano y Mengano?".

**Verificado, no asumido.** `npm run verify:schema` levanta un Postgres real,
aplica las migraciones y comprueba 24 propiedades de seguridad conectándose
como usuarios distintos. Corre en CI.

## 4. Contactos — minimización de datos (§16)

El problema legal: los números de la agenda son datos personales de **terceros
que no son usuarios de Mira** y que nunca aceptaron nada.

El flujo:

1. La app pide permiso con una explicación previa, en pantalla propia.
2. La app normaliza cada número a E.164 y calcula `SHA-256(salt || número)`.
3. Manda **sólo los hashes**. Nunca nombres, nunca números.
4. El backend compara contra `user_private.phone_hash` — el hash que cada
   usuario publicó de **su propio** teléfono, y sólo si activó
   `discoverable_by_phone`.
5. Los hashes que no matchean **se descartan en memoria**. No hay ninguna
   tabla donde se guarde la agenda de nadie.
6. Se devuelven los perfiles que coincidieron. Enviar una solicitud es siempre
   una acción explícita del usuario: no se manda nada automáticamente.

Limitación honesta: un hash de un número de teléfono es reversible por fuerza
bruta (el espacio de números es chico). Por eso el matching sólo se hace contra
usuarios que **optaron** por ser encontrables, el salt es de la app, y el
endpoint tiene rate limit (`rate_limit_contact_sync_per_day`).

## 5. Menores

- Edad mínima **13**, y **16** en el Espacio Económico Europeo (GDPR art. 8).
  Se valida antes de crear el perfil, no después.
- `age_band` se deriva sola de la fecha de nacimiento con un trigger.
- Menores de 16: rankings públicos forzados a `false` y visibilidad de fotos
  forzada a `friends`. Lo impone un trigger en la base, no la UI.
- La fecha de nacimiento vive en `user_private` y no sale de la fila del propio
  usuario.

## 6. Moderación — la regla que no se negocia

**Ninguna imagen llega a un ojo humano sin haber pasado antes por el
clasificador automático.**

```
imagen → moderación automática
           ├─ allowed = false, safeForHumanReview = false
           │     → se bloquea, NO se muestra a nadie, NO va a la cola de revisión
           ├─ allowed = false, safeForHumanReview = true
           │     → se bloquea, va a la cola con contexto
           └─ allowed = true
                 → sigue al pipeline de visión
```

En una app que admite menores, una cola de revisión sin filtro previo expone
al equipo a contenido que no debe ver y crea obligaciones legales de reporte.
El campo `moderation_results.safe_for_human_review` existe exactamente para eso.

## 7. Anti-trampa, en capas

1. **Attestation** — App Attest (iOS) y Play Integrity (Android) prueban que el
   request viene de la app genuina, sin modificar, en un dispositivo no
   comprometido. Requiere *development build*: **no funciona en Expo Go**.
2. **Token de subida** — de un solo uso, corta vida, atado a
   `(usuario, ventana, dispositivo)`. Sin token no hay subida.
3. **Sólo cámara** — el desafío diario no acepta la galería (§7).
4. **pHash** — detecta la misma imagen subida dos veces, o por dos cuentas.
5. **Señales temporales** — `captured_at` del cliente se guarda como señal y se
   contrasta con `submitted_at`. **Nunca** como fuente de verdad (§62).
6. **Validación server-side** — la decisión final siempre es del backend.

Los datos EXIF se editan en segundos: no son evidencia de nada y el diseño no
depende de ellos.

## 8. Eliminación de cuenta (§50)

Requisito duro de App Store: se inicia **desde dentro de la app**.
`account_deletion_requests` guarda la solicitud con un período de gracia; un job
ejecuta el borrado. Se elimina el contenido y los datos personales; lo que deba
conservarse por obligación legal queda anonimizado y documentado en la política
de retención.

## 9. Hallazgos y correcciones

Se registran acá porque el patrón se repite y conviene tenerlo a mano.

### Vistas actualizables que saltean RLS (26/08/2026, grave)

`public_app_config` era una vista simple sobre `app_config`. En Postgres eso la
vuelve **automáticamente actualizable**, y al no ser `security_invoker` las
escrituras corrían con los permisos de su dueño, salteando el RLS de la tabla.
Con los grants por defecto de Supabase, cualquiera con la clave publicable — que
viaja dentro del binario de la app y por lo tanto es pública — podía reescribir
los umbrales de la IA, los límites de rate limiting y la edad mínima.

Verificado explotándolo: un `PATCH` sin sesión cambió `feed_page_size` de 20 a
999. Corregido en la migración 0014, en dos capas: la vista pasó a
`security_invoker` y la tabla ganó una política de `SELECT` acotada a las claves
públicas, más el revoke de toda escritura.

**Regla que queda:** toda vista sobre una tabla con RLS se declara
`security_invoker`. Lo verifica una aserción de `verify-schema.mjs`.

### INSERT sin acotar por columna (26/08/2026)

La migración 0002 revocó `UPDATE` sobre `profiles` y lo re-otorgó por columna,
pero dejó `INSERT` abierto a las 13 columnas. Con la política `profiles_insert_self`
un usuario podía **crear** su perfil con `current_streak = 9999` y saltearse la
validación de username. Era el mismo agujero de §61, entrando por la otra puerta.

Corregido en la migración 0013: el cliente perdió el `INSERT` sobre `profiles` y
el alta pasa por `create_user_profile()`, que valida formato, reservados,
unicidad y edad mínima, y crea las tres filas en una sola transacción.

**Regla que queda:** acotar un privilegio de escritura obliga a revisar los
cuatro (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), no sólo el que motivó el cambio.

### EXECUTE heredado de PUBLIC (26/08/2026)

Lo detectó el analizador de Supabase, no esta suite de tests. `grant execute …
to authenticated` **no revoca** el `EXECUTE` que Postgres le otorga a `PUBLIC`
al crear una función, y `anon` hereda de `PUBLIC`. Las nueve funciones
`SECURITY DEFINER` quedaron invocables sin sesión vía `/rest/v1/rpc/…`.

Ninguna era explotable — todas cortan con `auth.uid()` nulo — salvo
`is_username_available`, que permitía enumerar usernames sin cuenta. Pero
depender del guard interno en lugar del permiso es el mismo error de una sola
capa que causó el hallazgo de la vista. Corregido en la migración 0016, junto
con el `search_path` fijo que faltaba en tres funciones.

**Regla que queda:** exponer una función son dos pasos, no uno —
`revoke execute … from public, anon` y después `grant execute … to authenticated`.

### Funciones y avisos aceptados a conciencia

El analizador sigue marcando dos cosas, y están bien así:

- **Nueve funciones `SECURITY DEFINER` invocables por `authenticated`.** Son
  justamente las que el cliente tiene que poder llamar: `get_active_challenge`,
  `get_friends_ranking`, `create_user_profile`, `is_username_available`,
  `request_timezone_change` y los cuatro helpers `viewer_*`. Todas comparan
  contra `auth.uid()` y ninguna acepta un usuario arbitrario como parámetro.
- **`citext` instalado en el esquema `public`.** Moverlo exigiría reescribir el
  tipo de `profiles.username`, que es único y está referenciado. El riesgo de esa
  migración supera al del aviso, que es de higiene y no una vulnerabilidad.

## 10. Panel administrativo

Tres garantías, verificadas por aserciones y no por convención:

1. **Quién es administrador lo decide Postgres**, dentro de cada función, no el
   endpoint. Hay un solo lugar donde se toma esa decisión y no se puede llegar
   a los datos por otra puerta. El panel usa la clave publicable: no tiene
   privilegios propios.
2. **La cola de revisión nunca muestra lo que el clasificador marcó como no
   apto para revisión humana**, ni siquiera a un administrador. El endpoint de
   reportes tampoco firma la URL de esas imágenes: no llegan ni como enlace.
3. **Toda acción queda en `admin_audit_log`** con el antes y el después. Un
   administrador no puede suspenderse a sí mismo, y un moderador no puede
   sancionar cuentas — eso es de rol `admin`.

Para dar acceso a alguien: `insert into admin_users (user_id, role) values
(…, 'moderator')`. No hay forma de auto-otorgarse el rol desde la app.

## 11. Pendiente

Estas piezas están diseñadas pero **no implementadas** todavía (Fases 3–4):

- Verificación de App Attest / Play Integrity en el backend.
- Cálculo y comparación de pHash.
- Integración del proveedor de moderación.
- Aplicación efectiva del rate limiting en los endpoints.
