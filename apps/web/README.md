# @mira/web — backend y panel administrativo

Next.js (App Router) en Vercel. Un solo deploy que sirve tres cosas:

1. **La API REST** que consume la app móvil (`src/app/api/*`).
2. **El panel de administración** (§46).
3. **Los cron jobs** (`src/app/api/cron/*`), disparados por Vercel Cron.

## Estructura

```
src/
├── app/
│   ├── api/
│   │   ├── challenge/       GET  — estado del desafío del usuario
│   │   ├── submissions/     POST — start / finalize (subida en dos pasos)
│   │   ├── feed/            GET  — feed paginado por cursor
│   │   ├── friends/         solicitudes, búsqueda, matching de contactos
│   │   ├── rankings/        global / país / amigos
│   │   ├── profile/         perfil, ajustes, historial
│   │   ├── reports/         POST — reportar contenido
│   │   ├── admin/           moderación, desafíos, métricas
│   │   └── cron/            schedule-challenges, send-push, close-day
│   └── (admin)/             UI del panel
└── server/
    ├── ai/                  implementaciones de VisionProvider y ModerationProvider
    ├── auth/                sesión, verificación de App Attest / Play Integrity
    ├── storage/             signed upload URLs, variantes, pHash
    ├── notifications/       push, preferencias, límites de frecuencia
    ├── jobs/                lógica de los crons
    ├── repositories/        acceso a datos (único lugar que toca la base)
    ├── services/            reglas de negocio
    └── middleware/          auth, rate limiting, validación
```

## Contrato

Los tipos de request y response están en `@mira/shared`
(`packages/shared/src/types/api.ts`). El backend implementa esos tipos; la app
los consume. Cualquier divergencia la detecta el typecheck.

## Estado

**Estructura definida, sin implementar.** Es el contenido de la Fase 3 en
adelante. No hay endpoints simulados ni handlers vacíos: los directorios están
para fijar dónde va cada cosa.
