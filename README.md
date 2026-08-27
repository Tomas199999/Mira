# Mira

Un desafío fotográfico por día. En un momento al azar de tu día te avisamos qué
tenés que fotografiar, tenés una oportunidad, una IA verifica que el objeto esté
realmente ahí, y tu racha sigue viva.

```
🔔 notificación → 📸 foto → 🤖 validación → 🔥 racha → 👥 feed
```

## Estado

**Fases 1 a 11 de 16.** Lo que está hecho está hecho de verdad; lo que falta, falta —
no hay nada mockeado haciéndose pasar por funcional (§79 del brief).

| Componente | Estado |
|---|---|
| Esquema de base de datos y RLS | ✅ escrito y **verificado** contra Postgres (101/101 aserciones) |
| Catálogo de objetos | ✅ 45 objetos curados, con alias y criterios visuales |
| Funciones de dominio (racha, rankings, desafío) | ✅ escritas y probadas |
| Tipos compartidos y contrato de API | ✅ |
| Sistema de diseño y navegación | ✅ compila y empaqueta |
| Infraestructura | ✅ Supabase (São Paulo) y Vercel creados, desplegados y verificados |
| Backend (API, cron, admin) | ⬜ Fase 3 |
| Cámara y subida | ⬜ Fase 5 |
| Pipeline de IA y moderación | ⬜ Fase 4 |
| Amigos, contactos, feed | ⬜ Fases 6–7 |
| Notificaciones push | ⬜ Fase 9 |

## Probarlo en el teléfono

```bash
npm run demo
```

Levanta el backend en la máquina y te dice con qué comando abrir la app
apuntando a la IP de tu red local — el teléfono no puede resolver `localhost`.
No hace falta tocar Vercel ni desactivar Deployment Protection.

Mientras probás:

```bash
npm run demo:abrir <usuario>   # abre tu ventana del desafío ahora mismo
npm run demo:admin <email>     # te da acceso al panel en /admin
```

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
supabase/        migraciones, seed y shim de test
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
