# Qué componentes generan costo (§75)

| Componente | Qué lo dispara | Cómo lo controlamos |
|---|---|---|
| **IA de visión** | una llamada por intento de subida | cascada Haiku→Opus, dedupe por hash antes de llamar, resultados guardados y no recalculados, tope de intentos por día |
| **Storage** | 3 variantes por foto aceptada | compresión antes de subir, WebP, política de ciclo de vida para las variantes grandes |
| **Ancho de banda** | el feed sirviendo imágenes | el feed usa thumbnails; la original sólo se baja al abrir la foto |
| **Base de datos** | consultas del feed y del ranking | índices dedicados, rankings materializados, paginación por cursor |
| **Push** | una notificación diaria por usuario, más las sociales | límites de frecuencia, preferencias por categoría, limpieza de tokens inválidos |
| **Funciones serverless** | cada request de la API | los bytes de las fotos no pasan por acá (subida directa a Storage) |

## Orden de magnitud de la IA

Una foto comprimida ronda los 1.600 tokens de entrada.

| Usuarios activos/día | Sólo Haiku 4.5 | Cascada (5% escala a Opus 5) | Sólo Opus 5 |
|---|---|---|---|
| 1.000 | ~$2 | ~$3 | ~$10 |
| 10.000 | ~$22 | ~$26 | ~$105 |
| 100.000 | ~$215 | ~$260 | ~$1.050 |

Asume 1,2 intentos promedio por usuario. Los precios se verifican contra la
[página de precios](https://www.anthropic.com/pricing) antes de cada revisión de
presupuesto: cambian.

## Regla de diseño

Antes de agregar cualquier llamada a un modelo, la pregunta es: **¿se puede
descartar este caso con algo más barato?** El orden del pipeline de `AI.md`
(formato → hash → moderación → visión) es esa pregunta convertida en código.
