# Arquitectura de Mira

> Documento vivo. Cada decisión importante que se toma queda acá con su
> alternativa y su motivo, como pide §81 del brief.

## 1. Vista general

```
┌──────────────────────┐         ┌───────────────────────────────┐
│  App móvil           │         │  Backend (Next.js en Vercel)  │
│  Expo + React Native │◄───────►│  Route handlers = API REST    │
│  TypeScript          │  HTTPS  │  Panel admin (mismo deploy)   │
└──────────┬───────────┘         │  Vercel Cron = jobs diarios   │
           │                     └──────────┬────────────────────┘
           │ signed upload URL              │ service_role
           ▼                                ▼
┌──────────────────────┐         ┌───────────────────────────────┐
│ Supabase Storage     │         │ Supabase Postgres             │
│ buckets privados     │         │ RLS + funciones de dominio    │
└──────────────────────┘         └──────────┬────────────────────┘
                                            │
                                            ▼
                                 ┌───────────────────────────────┐
                                 │ Proveedor de visión (Claude)  │
                                 │ detrás de `VisionProvider`    │
                                 └───────────────────────────────┘
```

**Regla que ordena todo lo demás (§61):** el cliente móvil no decide nada.
Ni la racha, ni la validez de una foto, ni la visibilidad, ni el ranking, ni
cuántas veces se puede intentar. La app dibuja estado; el servidor lo produce.

## 2. Por qué este stack

| Capa | Elección | Por qué | Alternativa descartada |
|---|---|---|---|
| Móvil | Expo + React Native + TS | Un código para iOS y Android, OTA updates, EAS Build resuelve la firma. Los módulos nativos que necesitamos (cámara, contactos, push, App Attest) existen y están mantenidos. | Nativo separado (Swift + Kotlin): el doble de trabajo para un producto cuya pantalla más compleja es una cámara y un feed. |
| Backend | Next.js (App Router) en Vercel | La API REST, el panel de administración y los cron jobs viven en un solo deploy y un solo lenguaje. Menos infraestructura que mantener para un equipo chico. | Servicio Node separado en Fly.io: más control sobre workers largos, pero un deploy más y un panel admin que igual habría que hostear. |
| Datos | Supabase (Postgres) | RLS nos deja escribir las reglas de privacidad **en la base**, que es donde §63 pide que estén. Auth, Storage y Postgres integrados. | Firebase: las reglas de seguridad son menos expresivas para un grafo social y las consultas de ranking son peores. |
| Visión | Claude vía `VisionProvider` | Sigue criterios en lenguaje natural (los `visual_criteria` de cada objeto) y devuelve salida estructurada, que es exactamente lo que pide §10. | Un detector de objetos clásico: más barato pero no entiende "una taza sí, un bol no". Queda como posible primer filtro futuro. |

## 3. El modelo temporal — la decisión más importante

§5 pide "un momento aleatorio del día para todos" y §43 pide "que funcione en
cualquier zona horaria". **Las dos cosas juntas son imposibles**: un instante
global único le toca a alguien a las 4 de la mañana.

**Lo que hacemos:** el desafío se indexa por **fecha**, no por instante.

- Un objeto por día, el mismo para todo el mundo (como Wordle).
- Cada usuario tiene una fila en `challenge_windows` con un `opens_at`
  sorteado dentro de **su** ventana local (10:00–22:00 por defecto).
- **El objeto no se revela por API hasta que `opens_at` pasó.** Esto lo
  garantiza `get_active_challenge()` en la base, no la app: antes de la hora
  devuelve `object_name = null`.
- Un cambio de zona horaria se aplica **al día siguiente**
  (`user_private.pending_timezone` + `timezone_effective_on`), así nadie se
  muda a Nueva Zelanda para ver el objeto 12 horas antes.

Se pierde la simultaneidad estricta y se gana que la app sea usable fuera de
un solo huso horario. La filtración residual (alguien en Asia publica el objeto
del día antes que alguien en América) existe y es acotada a ~24 horas; es el
mismo compromiso que aceptan Wordle y Duolingo.

## 4. Subida de fotos — por qué los bytes no pasan por el backend

```
App                    Backend                Storage          Pipeline
 │  POST /submissions/start                      │                 │
 ├──────────────────────►│                       │                 │
 │                       │ valida ventana,       │                 │
 │                       │ intentos, attestation │                 │
 │                       ├── signed upload URL ─►│                 │
 │◄── url + uploadToken ─┤                       │                 │
 │                                               │                 │
 ├────────── PUT imagen ────────────────────────►│                 │
 │                                               │                 │
 │  POST /submissions/finalize                   │                 │
 ├──────────────────────►│───────────────────────┼────────────────►│
 │                       │                       │  hash, dedupe,  │
 │                       │                       │  moderación,    │
 │                       │                       │  visión, racha  │
 │◄── resultado ─────────┤◄──────────────────────┼─────────────────┤
```

Alternativa considerada: subir a través del backend. Se descartó porque las
funciones serverless tienen límite de payload y porque duplicaría el ancho de
banda (y el costo) sin ganar control: el token de subida ya decide **quién**
sube y **dónde**.

## 5. Por qué `friends_of_friends` no entra en el MVP

§17 pide visibilidad de segundo grado. El enum existe en la base y el default
es `friends`, pero la opción arranca **deshabilitada**
(`app_config.friends_of_friends_enabled = false`).

Motivos:
1. **Costo de consulta.** Resolver "amigos de mis amigos" en cada página del
   feed es un join cuadrático sobre el grafo. Hacerlo bien exige materializar
   las aristas de segundo grado, y eso es un sistema aparte.
2. **Fuga de privacidad.** Exponer contenido de segundo grado revela, de forma
   indirecta, quién conoce a quién.

Cuando haya volumen se activa con una tabla materializada, sin migración de
datos: el campo ya está guardado por publicación.

## 6. Rankings a escala (§36)

No se rankea recorriendo usuarios. Un job diario corre
`build_ranking_snapshots()`, que hace **un** pase con `RANK()` y materializa
`ranking_snapshots`. Entre snapshots la app muestra la última posición conocida.

- Global y por país: materializados, y sólo con quienes aceptaron aparecer (§72).
- Amigos: **no** se materializa. El grafo de una persona es chico, así que
  `get_friends_ranking()` lo calcula al vuelo y siempre está fresco.

Camino de crecimiento sin rediseño: 10 mil usuarios entran en el snapshot sin
esfuerzo; en el orden del millón el snapshot pasa a ser una tabla particionada
por fecha y el top-N se cachea en Redis. La interfaz de la API no cambia.

## 7. Rate limiting

Contadores por ventana fija en `rate_limit_counters`. Es lo bastante bueno para
el MVP y no agrega una dependencia más. La capa está detrás de una interfaz para
poder cambiarla por Redis cuando el volumen lo justifique.

## 8. Estructura del repositorio

```
mira/
├── apps/
│   ├── mobile/          # Expo + React Native + TypeScript
│   └── web/             # Next.js: API REST + panel admin + cron
├── packages/
│   └── shared/          # tipos de dominio, contrato de API, config, IA
├── supabase/
│   ├── migrations/      # esquema versionado (se aplica en orden)
│   ├── seed/            # catálogo de objetos y logros
│   └── test/            # shim de Supabase para verificación local
├── scripts/
│   └── verify-schema.mjs  # levanta Postgres y prueba las políticas de RLS
└── docs/
```

## 9. Estado de implementación

| Fase | Qué incluye | Estado |
|---|---|---|
| 1 | Arquitectura, esquema, RLS, catálogo, diseño, navegación | **en curso** |
| 2 | Auth, perfiles, onboarding | pendiente |
| 3 | Backend del desafío, cámara, subida | pendiente |
| 4 | Pipeline de IA y moderación | pendiente |
| 5 | Rachas y rankings | parcial (funciones de base listas y probadas) |
| 6 | Amigos y contactos | pendiente |
| 7 | Feed y privacidad | parcial (RLS lista y probada) |
| 8 | Historial | pendiente |
| 9 | Notificaciones | pendiente |
| 10 | Panel admin | pendiente |
| 11 | Testing, performance, publicación | pendiente |

Lo marcado como pendiente **no está mockeado**: directamente no está. §79.
