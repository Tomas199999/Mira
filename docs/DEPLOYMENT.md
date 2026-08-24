# Despliegue

## Piezas

| Pieza | Dónde | Cómo se despliega |
|---|---|---|
| Base de datos | Supabase | `supabase db push` desde CI |
| Backend + admin | Vercel | push a `main` |
| App móvil | EAS Build | `eas build` + envío a las tiendas |

## Base de datos

```bash
npx supabase link --project-ref qyicwtlzzlrnjepwcqlj
npx supabase db push --include-all
npx supabase db query --linked -f supabase/seed/01_challenge_objects.sql
npx supabase db query --linked -f supabase/seed/02_achievements.sql
```

No hace falta `psql`: `supabase db query` ejecuta SQL contra el proyecto
linkeado a través de la Management API.

### Claves de API

El proyecto usa las claves **nuevas** de Supabase (`sb_publishable_…` y
`sb_secret_…`), no los JWT heredados `anon` / `service_role`. Las variables
conservan los nombres `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` por
compatibilidad con las convenciones del ecosistema, pero **contienen las claves
nuevas**.

Conviene **deshabilitar las claves heredadas** en el dashboard
(Settings → API Keys): no se usan, y el JWT `service_role` saltea RLS por
completo.

Antes de tocar producción, siempre:

```bash
npm run verify:schema     # levanta un Postgres local y prueba las políticas
```

## Jobs programados

Tres crons, todos con `CRON_SECRET`:

| Job | Cadencia | Qué hace |
|---|---|---|
| `schedule-challenges` | diario, 00:15 UTC | sortea el objeto de los próximos días y crea las ventanas de cada usuario según su zona horaria |
| `send-challenge-push` | cada 5 minutos | notifica a quienes les acaba de abrir la ventana |
| `close-day` | diario | corta rachas o gasta protectores, y materializa los rankings |

## App móvil

```bash
eas build --profile development --platform ios   # requerido: App Attest no corre en Expo Go
eas build --profile production --platform ios
eas submit --platform ios
```

**Los development builds no son opcionales.** App Attest y Play Integrity no
funcionan en Expo Go, así que todo el desarrollo del flujo de subida necesita un
build propio instalado en el dispositivo.

## Backend en Vercel — cómo está montado

El proyecto se linkea desde la **raíz del monorepo**, no desde `apps/web`.
Linkear desde `apps/web` hace que Vercel suba sólo esa carpeta y el build falla:
`tsconfig.base.json` y `packages/shared` quedan afuera. La configuración vive en
`vercel.json` en la raíz, versionada, para no depender de ajustes del dashboard:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build --workspace @mira/web",
  "outputDirectory": "apps/web/.next"
}
```

### Desplegar

```bash
vercel pull --yes --environment=production
vercel build --prod --yes
vercel deploy --prebuilt --prod
```

**El paso `--prebuilt` no es opcional hoy.** Un `vercel deploy` directo falla en
el paso de despliegue con *"Cannot patch preview comments when immutable static
file upload is enabled"* — un conflicto entre los comentarios de preview de
Vercel y Next 16.3.2. El build en sí compila bien; lo que falla es la subida.
Construir local y subir el output ya construido lo esquiva. Revisar si se puede
volver al flujo simple cuando se actualice cualquiera de los dos.

### Pendiente antes de que la app móvil pueda consumir la API

**Deployment Protection está activa** (Vercel Authentication), así que hoy la
producción responde 401 a cualquier request sin token. Para un backend en
construcción está bien, pero **hay que desactivarla en producción antes de la
Fase 3** o la app móvil no va a poder llamar a la API. Los endpoints se protegen
con la sesión de Supabase, no con el muro de Vercel.

## Estado

| Pieza | Estado |
|---|---|
| Proyecto Vercel `mira` | ✅ creado, linkeado desde la raíz |
| Build en Vercel | ✅ compila (28s) |
| Despliegue de producción | ✅ `/api/health` responde |
| Variables de entorno | ✅ 12 cargadas en production, preview y development |
| Integración con GitHub | ⬜ el repo no tiene remoto todavía |
| Cron jobs | ⬜ Fase 3, cuando existan las rutas |
| Proyecto Supabase `mira` | ✅ creado en São Paulo (`sa-east-1`), ref `qyicwtlzzlrnjepwcqlj` |
| Migraciones aplicadas | ✅ las 12 · 28 tablas, 34 políticas, 2 buckets |
| Seed cargado | ✅ 45 objetos aprobados, 13 logros, 18 claves de config |
| RLS en producción | ✅ activo en las 28 tablas, verificado con la clave pública |
| `ANTHROPIC_API_KEY` | ⬜ falta cargarla |
