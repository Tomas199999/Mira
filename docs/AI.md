# Validación por IA

## 1. El pipeline (§74)

No es "si el modelo dice taza, aceptar".

```
FOTO
 ├─ 1. validación de formato y tamaño        ← barato, corta el 100% de la basura
 ├─ 2. hash + dedupe (pHash)                 ← barato, corta la reutilización
 ├─ 3. moderación de contenido               ← obligatoria, corre siempre
 ├─ 4. detección del objeto (modelo primario)
 ├─ 5. confianza vs. umbrales configurables
 ├─ 6. escalado a modelo más capaz si es ambiguo
 └─ 7. decisión: ACCEPTED | REJECTED | REVIEW | BLOCKED
```

Los pasos 1 a 3 son órdenes de magnitud más baratos que el 4. Ese orden **es** la
estrategia de costos de §48: la mayoría de lo que hay que rechazar se rechaza
antes de gastar un token.

## 2. Contrato con el proveedor

El backend habla con `VisionProvider` (en `packages/shared/src/contracts/vision.ts`),
nunca con un SDK concreto. Entrada: imagen, objeto esperado, alias y criterios
visuales. Salida, exactamente lo que pide §2:

```json
{
  "valid": true,
  "confidence": 0.96,
  "detected_object": "cup",
  "reason": "A cup is clearly visible in the image.",
  "needs_manual_review": false
}
```

Cada objeto del catálogo trae sus propios `visual_criteria`, que son los que se
le pasan al modelo. Por eso la validación no depende de que el modelo diga una
palabra exacta:

```
mug / "una taza"
  · Se ve un recipiente para beber, de cerámica, vidrio o metal.
  · Tiene forma de taza: cuerpo cilíndrico o cónico, boca abierta.
  · Un vaso liso sin asa también cuenta; una caja o un bol de comida no.
```

## 3. Umbrales

Configurables en `app_config`, no públicos (el cliente no los ve):

```
confidence >= 0.80  →  se acepta sola
confidence <= 0.40  →  va a revisión (poca confianza en cualquier dirección)
entre medio         →  se escala al modelo más capaz, y si sigue ambiguo, revisión
```

## 4. Falsos negativos — el problema de producto más serio

Un modelo que se equivoca y no ve la taza que está ahí le rompe a alguien una
racha de 60 días. Es, por lejos, la reseña de una estrella más previsible.

**La regla:** ante la duda, el usuario gana.

- `in_review` **no rompe la racha**. `close_challenge_day()` excluye
  explícitamente a los usuarios con un envío en revisión.
- Si el revisor acepta, la racha se resuelve retroactivamente
  (`streak_events.event = 'restored'`).
- El umbral de aceptación es generoso a propósito. Es preferible que se cuele
  algún tramposo antes que castigar a alguien que hizo todo bien.

## 5. Costos (§48, §75)

Una foto comprimida ronda los **1.600 tokens** de entrada. A precios actuales
de la API de Claude:

| Modelo | Input $/1M | Costo por 1.000 fotos |
|---|---|---|
| Claude Haiku 4.5 | $1,00 | ≈ **$1,80** |
| Claude Sonnet 5 | $3,00 | ≈ $5,30 |
| Claude Opus 5 | $5,00 | ≈ $8,70 |

Proyección con 1,2 intentos promedio por usuario y por día:

| Usuarios activos/día | Sólo Haiku | Sólo Opus |
|---|---|---|
| 1.000 | ~$2/día | ~$10/día |
| 10.000 | ~$22/día | ~$105/día |
| 100.000 | ~$215/día | ~$1.050/día |

**Por eso la cascada:** Haiku 4.5 resuelve la enorme mayoría de los casos, y
sólo lo ambiguo escala a Opus 5. Con un 5% de escalado, 100 mil usuarios
diarios cuestan del orden de $260/día en vez de $1.050.

Otras medidas: los resultados se guardan en `ai_validations` y no se vuelve a
pagar por la misma imagen; el dedupe por hash corta antes de llamar al modelo;
y `rate_limit_uploads_per_day` pone un techo duro por usuario.

## 6. Generación de objetos nuevos (§4)

Una IA **no** publica desafíos por su cuenta. El pipeline es:

```
candidato → validación de seguridad → validación de dificultad
          → validación de reconocibilidad → revisión humana → aprobado
```

Un objeto sólo pasa a `approved` con `safety_reviewed_at` completo — lo obliga
un CHECK constraint en la base, no una convención.

## 7. Estado

El contrato, los umbrales, la lógica de decisión y el catálogo están escritos y
verificados. **La implementación del proveedor y la llamada real al modelo son
de la Fase 4 y todavía no existen.** No hay ninguna IA simulada en el código.
