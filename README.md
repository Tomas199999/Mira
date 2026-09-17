# Mira

Un desafío fotográfico por día. En un momento al azar de tu día te avisamos qué
tenés que fotografiar, tenés una oportunidad, una IA verifica que el objeto esté
realmente ahí, y tu racha sigue viva.

```
🔔 notificación → 📸 foto → 🤖 validación → 🔥 racha → 👥 feed
```

## Estado

**Las 16 fases tienen trabajo hecho: 11 completas y 5 a medias.** Lo que está
hecho está hecho de verdad; lo que falta, falta — no hay nada mockeado
haciéndose pasar por funcional (§79 del brief). Las cinco a medias esperan
algo que no es código: una clave, un build o una cuenta.

| Fase | Estado | Qué falta |
|---|---|---|
| 1 Arquitectura, diseño y navegación | ✅ | |
| 2 Auth y perfiles | 🟡 | Apple y Google: configurar los proveedores en Supabase |
| 3 Backend y base de datos | ✅ | RLS en las 30 tablas, verificado (129/129) |
| 4 Desafío diario | ✅ | |
| 5 Cámara y subida | 🟡 | App Attest y Play Integrity necesitan un development build de EAS |
| 6 IA y moderación | 🟡 | `ANTHROPIC_API_KEY` para probar el modelo real |
| 7 Rachas | ✅ | |
| 8 Amigos y contactos | ✅ | |
| 9 Feed y privacidad | ✅ | |
| 10 Rankings | ✅ | |
| 11 Historial | ✅ | |
| 12 Notificaciones | 🟡 | El envío real necesita un development build |
| 13 Panel administrativo | ✅ | |
| 14 Testing | ✅ | Falta E2E de la interfaz móvil |
| 15 Rendimiento y seguridad | ✅ | |
| 16 App Store y Play Store | 🟡 | Build firmada y cuenta de Play Console |

## Probarlo en el teléfono

Dos terminales. En la primera:

```bash
npm run demo      # backend en la máquina, contra Supabase de producción
```

En la segunda:

```bash
npm run mobile    # abre Expo con el QR
```

`npm run mobile` genera `apps/mobile/.env.local` a partir del `.env` de la raíz
y completa solo la IP de tu red local. Expo lee el `.env` del directorio de la
app, no el de la raíz del monorepo: sin ese paso la app arranca y muere en el
primer render porque el cliente de Supabase no encuentra sus variables.

No hace falta tocar Vercel ni desactivar Deployment Protection.

Mientras probás:

```bash
npm run demo:abrir <usuario>   # abre tu ventana del desafío ahora mismo
npm run demo:push              # manda el aviso push a quien tenga la ventana abierta
npm run demo:admin <email>     # te da acceso al panel en /admin
```

Con **Expo Go** se puede recorrer todo menos el aviso push y App Attest. Para
eso hace falta el development build instalado en el teléfono
(`docs/DEPLOYMENT.md § App móvil`); con él, `npm run mobile` abre la app en el
build en vez de en Expo Go.

Sin `ANTHROPIC_API_KEY`, la validación de fotos usa un **doble de prueba que
acepta cualquier imagen sin mirarla**. El comando lo dice al arrancar y el
módulo se niega a cargarse en producción.

## Arrancar

```bash
npm install
npm run verify:schema     # levanta un Postgres embebido y prueba las políticas
npm run verify:auth       # flujo de alta contra el Supabase real (necesita .env)
npm run typecheck
npm run mobile            # abre Expo
```

No hace falta Docker ni tener Postgres instalado: la verificación levanta su
propio cluster y lo borra al terminar.

## Estructura

```
apps/mobile      Expo + React Native + TypeScript
apps/web         Next.js: API REST + panel admin + cron  (Fase 3)
packages/shared  tipos de dominio, contrato de API, contratos de IA
supabase/        migraciones (32), seed y shim de test
scripts/         verify-schema.mjs
docs/            arquitectura, base de datos, IA, seguridad, costos, tiendas
```

## Documentación

| Documento | De qué trata |
|---|---|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | decisiones y por qué, incluido el modelo temporal |
| [DATABASE.md](docs/DATABASE.md) | esquema, garantías que impone la base, crecimiento |
| [AI.md](docs/AI.md) | pipeline de validación, umbrales, costos |
| [SECURITY.md](docs/SECURITY.md) | modelo de amenazas, RLS, contactos, menores, moderación |
| [COSTS.md](docs/COSTS.md) | qué gasta plata y cómo se controla |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md) | variables y qué nunca va en el binario |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | base, backend, builds |
| [APP_STORE.md](docs/APP_STORE.md) | permisos, UGC, privacidad, checklist |
| [PLAY_STORE.md](docs/PLAY_STORE.md) | ídem Android |

## Las tres reglas que ordenan el código

1. **El servidor decide.** El cliente no calcula rachas, ni validez, ni
   visibilidad, ni rankings. Dibuja estado (§61).
2. **La privacidad vive en la base.** Se implementa con RLS, no escondiendo
   elementos de la interfaz (§63).
3. **Ante la duda, gana el usuario.** Una validación ambigua va a revisión y
   *no* rompe la racha.
