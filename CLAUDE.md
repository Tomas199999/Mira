# Mira — contexto para Claude

Una red social de desafío fotográfico diario. Cada día, en un momento aleatorio
de la ventana local de cada usuario, hay que fotografiar un objeto cotidiano.
Una IA verifica que el objeto esté realmente en la foto, y eso sostiene una
racha.

```
🔔 notificación → 📸 foto → 🤖 validación → 🔥 racha → 👥 feed
```

## Las tres reglas que ordenan todo el código

Si una decisión contradice una de estas, la decisión está mal.

1. **El servidor decide.** El cliente móvil no calcula rachas, ni validez de una
   foto, ni visibilidad, ni rankings, ni cuántos intentos quedan. Dibuja estado.
2. **La privacidad vive en la base.** Se implementa con Row Level Security, no
   ocultando elementos de la interfaz. Si la única razón por la que alguien no
   ve algo es que la UI no lo muestra, está mal hecho.
3. **Ante la duda, gana el usuario.** Una validación ambigua va a revisión y
   *no* rompe la racha. Es preferible que se cuele un tramposo antes que
   castigar a alguien que hizo todo bien.

## Nada mockeado

Prohibido: datos falsos en funcionalidades principales, rankings inventados, IA
simulada, autenticación de mentira, handlers vacíos que devuelven `200`.

Si algo no se puede implementar de verdad todavía, **no se implementa**: se
documenta como pendiente. Un `EmptyState` honesto es correcto; un feed con
usuarios inventados no.

La única excepción, y está marcada como tal, es
`apps/mobile/src/features/dev/DesignHarness.tsx`: una herramienta de diseño
detrás de `__DEV__` que permite ver cada estado del desafío sin backend.

## Verificar antes de dar algo por bueno

```bash
npm install
npm run verify:schema    # Postgres embebido: 47 propiedades de RLS y permisos
npm run verify:auth      # flujo de alta contra el Supabase real (necesita .env)
npm run verify:api       # API del desafío; levantá antes el server local en :3210
npm run typecheck
npm run mobile           # abre Expo
```

`verify:schema` **no necesita Docker ni Postgres instalado**: levanta su propio
cluster, aplica un shim de Supabase, corre las 18 migraciones y comprueba las
políticas de seguridad conectándose como usuarios distintos. Después borra todo.

**Si tocás una migración, agregá su aserción a `scripts/verify-schema.mjs`.**
Ese archivo es la prueba de que la privacidad funciona; una migración sin test
es una regresión esperando pasar.

Y si cambiás el contrato entre la app y la base, sumá la aserción a
`scripts/verify-auth-flow.mjs`, que corre contra Supabase de verdad. Que la app
compile no prueba que el contrato funcione: los dos hallazgos de seguridad del
26/08 pasaban el typecheck sin problema.

## Estado

| Componente | Estado |
|---|---|
| Esquema y RLS | ✅ 29 tablas, 37 políticas, verificado (55/55) |
| Catálogo de objetos | ✅ 45 objetos con alias y criterios visuales |
| Funciones de dominio (racha, rankings, desafío) | ✅ escritas y probadas |
| Tipos compartidos y contrato de API | ✅ `packages/shared` |
| Diseño y navegación móvil | ✅ compila y empaqueta |
| Infraestructura | ✅ Supabase (São Paulo) y Vercel creados |
| Auth, perfiles, onboarding | 🟡 email/contraseña completo y verificado; falta Apple y Google |
| Backend: desafío diario y cron | 🟡 `GET /api/challenge` y los dos jobs, verificados; falta el resto de la API |
| Backend: panel admin | ⬜ Fase 10 |
| Cámara y subida | ⬜ Fase 5 |
| Pipeline de IA y moderación | ⬜ Fase 4 |
| Amigos, contactos, feed | ⬜ Fases 6–7 |
| Notificaciones push | ⬜ Fase 9 |

## Decisiones ya tomadas — no rediscutir

Están razonadas en `docs/`. Cambiarlas es una conversación, no un commit.

- **Stack**: Expo SDK 57 + RN 0.86 + TS · Supabase · Next.js 16 en Vercel.
- **Modelo temporal**: el desafío se indexa por *fecha*, no por instante. Un
  objeto global por día; cada usuario tiene su ventana local aleatoria y la API
  no revela el objeto hasta que su ventana abre. Los cambios de zona horaria se
  aplican al día siguiente, para que nadie se mude de huso y espíe el objeto.
- **IA en cascada**: Claude Haiku 4.5 de primera pasada, Opus 5 sólo para casos
  ambiguos. Detrás de la interfaz `VisionProvider`, nunca contra un SDK directo.
- **Subida en dos pasos**: el backend emite una signed upload URL y el cliente
  sube directo a Storage. Los bytes de la foto no pasan por una función
  serverless.
- **Contactos**: no se guarda la agenda de nadie. Cada usuario publica el hash
  de *su propio* teléfono y el matching se hace contra eso. Ver
  `docs/SECURITY.md § Contactos`.
- **Menores**: mínimo 13 años, 16 en el Espacio Económico Europeo. Los menores
  de 16 quedan fuera de los rankings públicos, y lo impone un trigger.
- **`friends_of_friends`**: modelado pero deshabilitado en el MVP.
- **Campos de racha**: protegidos con permisos por columna, no con un trigger
  que revierta en silencio. Un intento de moverlos falla ruidosamente.

## Rarezas de la plataforma que ya costaron tiempo

- **App Attest y Play Integrity no funcionan en Expo Go.** El flujo de subida
  necesita *development builds* de EAS. No es opcional.
- **Vercel se linkea desde la raíz del monorepo**, no desde `apps/web`. Desde
  `apps/web` el build falla: quedan afuera `tsconfig.base.json` y
  `packages/shared`. El `vercel.json` de la raíz ya lo resuelve.
- **`vercel deploy` directo falla** con *"Cannot patch preview comments…"*. Hay
  que usar `vercel build` + `vercel deploy --prebuilt`. Ver `docs/DEPLOYMENT.md`.
- **La sesión de Supabase no entra en SecureStore de una pieza.** El límite es
  ~2048 bytes y una sesión lo supera, así que `src/services/secure-storage.ts`
  la fragmenta. Sin eso el usuario se desloguea solo, de forma intermitente.
- **Vercel Cron invoca con `GET`, no con `POST`.** Una ruta que exporta sólo
  `POST` devuelve 405 todas las noches sin que nadie se entere.
- **Los imports internos de `packages/shared` van sin extensión.** Con `.js`
  TypeScript compila igual pero Metro no resuelve, y el error aparece recién
  al empaquetar.
- **El diccionario base de i18n no lleva `as const`**: con literales fijos
  ninguna traducción puede asignarse al tipo `Translations`.

## Cómo trabajar en este repo

- **Ramas y pull requests. No empujar a `main`.** El dueño del repo revisa antes
  de mergear.
- Un PR por fase, o por pieza coherente dentro de una fase.
- Antes de abrir el PR: `npm run verify:schema && npm run typecheck` en verde.
- Los textos de la interfaz van en `apps/mobile/src/i18n/`, nunca escritos
  dentro de un componente.
- Los mensajes de error que ve el usuario nunca mencionan códigos ni detalles
  técnicos. Comparar con `i18n/es.ts § errors`.

## Sin acceso a producción

Este entorno **no tiene** las credenciales de Supabase ni de Vercel, y está
bien así: `verify:schema` alcanza para desarrollar y probar las Fases 2 a 5
completas contra un Postgres local.

No pidas las claves de producción. Si algo parece necesitarlas, casi siempre
significa que la lógica debería estar cubierta por un test local.

## Documentación

| Documento | De qué trata |
|---|---|
| `docs/ARCHITECTURE.md` | decisiones y su porqué, incluido el modelo temporal |
| `docs/DATABASE.md` | esquema, garantías que impone la base, crecimiento |
| `docs/AI.md` | pipeline de validación, umbrales, costos reales |
| `docs/SECURITY.md` | amenazas, RLS, contactos, menores, moderación |
| `docs/COSTS.md` | qué gasta plata y cómo se controla |
| `docs/DEPLOYMENT.md` | base, backend, builds |
| `docs/APP_STORE.md` · `docs/PLAY_STORE.md` | permisos, UGC, privacidad |
