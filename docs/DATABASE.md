# Base de datos

Postgres en Supabase. Las migraciones están en `supabase/migrations/` y se
aplican **en orden alfabético**, que es el orden en que están numeradas.

## Verificación

```bash
npm run verify:schema
```

Levanta un Postgres embebido, aplica un shim con los objetos que provee
Supabase (`auth.users`, `auth.uid()`, `storage.*`, los roles), corre todas las
migraciones y el seed, y después comprueba **24 propiedades de seguridad**
conectándose como usuarios distintos. Corre en CI.

## Por qué tres tablas para un usuario

RLS es a nivel de **fila**, no de columna. Si la fecha de nacimiento viviera en
`profiles`, cualquier política que le permita a un amigo leer el perfil
expondría también ese dato. Por eso:

| Tabla | Qué guarda | Quién la lee |
|---|---|---|
| `profiles` | username, nombre, avatar, país, racha | cualquier usuario no bloqueado |
| `user_private` | fecha de nacimiento, franja etaria, zona horaria, hashes de contacto | sólo el propio usuario |
| `user_settings` | privacidad y notificaciones | sólo el propio usuario |

## Desvíos respecto de §30

§30 lista las tablas mínimas. Dos cambios, con motivo:

- **`photos` se fusionó en `submissions`.** La relación era 1:1 y las tres
  variantes de imagen (`photo_path`, `thumbnail_path`, `medium_path`) son tres
  columnas, no tres filas. Una tabla aparte sólo agregaría un join a la consulta
  más caliente de la app.
- **`contacts` no existe, y es a propósito.** Guardar la agenda de los usuarios
  sería guardar datos personales de terceros que nunca aceptaron nada. En su
  lugar, cada usuario publica el hash de **su propio** teléfono en
  `user_private.phone_hash` y el matching se hace contra eso, sin persistir nada
  del lado del que busca. Ver `SECURITY.md § Contactos`.
- **`streaks` se partió** en estado (columnas de `profiles`, por performance) y
  libro mayor (`streak_events`, para auditar y poder reconstruir).

## Las garantías que impone la base

No son convenciones ni validaciones de la capa de servicio: son constraints.

| Garantía | Cómo |
|---|---|
| Una sola publicación válida por usuario y día (§9) | índice único parcial `submissions_one_valid_per_day` |
| El cliente no puede mover su racha (§61) | `revoke update on profiles` + grant por columna |
| Un objeto no se publica sin revisión de seguridad (§4) | CHECK `approved_needs_review` |
| Un menor de 16 no aparece en rankings públicos (§29) | trigger `enforce_minor_ranking_privacy` |
| La franja etaria no se falsea | trigger que la deriva de `birth_date` |
| `best_streak` nunca es menor que `current_streak` | CHECK `best_streak_is_max` |
| Una amistad es una sola fila | par canónico `user_a < user_b` |
| No se pide amistad a quien te bloqueó | trigger `reject_request_if_blocked` |
| Bloquear destruye la relación existente | trigger `block_cascade` |

## Índices y por qué existen

| Índice | Consulta que sirve |
|---|---|
| `submissions_feed_idx` | el feed, ordenado por fecha |
| `submissions_user_history_idx` | el calendario del perfil |
| `submissions_phash_idx` | dedupe antes de llamar a la IA |
| `challenge_windows_pending_push` | el job que decide a quién notificar ahora |
| `ranking_snapshots_leaderboard_idx` | leer un top-N sin ordenar |
| `friendships_user_b_idx` | resolver amistad en la dirección inversa |
| `user_private_phone_hash_idx` | matching de contactos (parcial: sólo quienes optaron) |

## Funciones de dominio

Todas `SECURITY DEFINER`, y con `execute` revocado para `anon` y `authenticated`
salvo las dos que la app necesita.

| Función | Quién la llama | Qué hace |
|---|---|---|
| `get_active_challenge()` | la app | devuelve el desafío, ocultando el objeto hasta `opens_at` |
| `get_friends_ranking(limit)` | la app | ranking de amigos, calculado al vuelo |
| `schedule_daily_challenge(date)` | cron | sortea el objeto del día evitando repeticiones recientes |
| `apply_streak_increment(...)` | backend | incrementa la racha; idempotente por día |
| `close_challenge_day(date)` | cron | gasta un protector o corta la racha |
| `build_ranking_snapshots(date)` | cron | materializa los rankings global y por país |

## Crecimiento

Lo que hay funciona sin cambios hasta el orden de las decenas de miles de
usuarios. Después:

- `ranking_snapshots` pasa a estar particionada por `snapshot_date`, y las
  particiones viejas se descartan.
- `submissions` se particiona por `challenge_date`.
- `rate_limit_counters` se muda a Redis.
- El feed incorpora una tabla de fan-out si el join contra `friendships` deja de
  rendir.

Ninguno de esos cambios altera el contrato de la API.
