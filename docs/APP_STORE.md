# Publicación en App Store

> Cuenta de Apple Developer: **activa**. Eso habilita push, Sign in with Apple,
> App Attest y TestFlight.

## Nombre

**"Mira" a secas es casi seguro que está tomado en App Store.** Hay que
verificarlo en App Store Connect antes de fijar nada. Si está ocupado, el nombre
en la tienda pasa a ser algo como *Mira: Desafío Diario* y la marca dentro de la
app sigue siendo Mira. El `bundleIdentifier` (`com.miraapp.mira`) **no se puede
cambiar** después del primer envío: crear una app nueva sería empezar de cero.

## Permisos

Cada texto ya está en `app.config.ts` y explica el uso concreto. Un texto
genérico es motivo de rechazo.

| Permiso | Texto | Guideline |
|---|---|---|
| Cámara | "Mira usa la cámara para que saques la foto del desafío de hoy…" | 5.1.1 |
| Contactos | "…Enviamos sólo una versión cifrada de los números, nunca los nombres, y no guardamos tu agenda." | 5.1.1, 5.1.2 |
| Notificaciones | se pide en contexto, después de explicar para qué | 4.5.4 |

Se piden **de a uno y con contexto** (§27), nunca todos juntos al abrir.

## Lo que Apple va a mirar con lupa

Esta app combina tres cosas que disparan revisión manual: **contenido generado
por usuarios**, **acceso a la agenda** y **posible público menor de edad**.

Guideline 1.2 (UGC) exige, y tenemos:

- [x] Filtrado de contenido objetable antes de publicar → moderación automática
- [x] Mecanismo de reporte → tabla `reports`, motivos de §23
- [x] Bloqueo de usuarios → `blocks`, con prioridad sobre todo
- [ ] Compromiso de actuar sobre un reporte en 24 horas → **falta el proceso operativo**, no el código
- [x] Datos de contacto del desarrollador publicados

Guideline 5.1.1(v) — eliminación de cuenta desde dentro de la app:
- [x] Modelo de datos (`account_deletion_requests`)
- [ ] Pantalla y endpoint → Fase 2

Guideline 4.8 — si se ofrece Google Sign In, **hay que ofrecer también Sign in
with Apple**. Ya está declarado en `app.config.ts`.

## Privacy manifest y etiqueta de privacidad

`PrivacyInfo.xcprivacy` es obligatorio. Hay que declarar:

| Dato | Uso | Vinculado a identidad | Rastreo |
|---|---|---|---|
| Email | funcionamiento de la app | sí | no |
| Fotos | funcionamiento de la app | sí | no |
| Contactos | **no se recolectan** — sólo se comparan hashes en memoria | no | no |
| Identificador de usuario | funcionamiento | sí | no |
| Datos de uso | analítica | no | no |

Que los contactos no se declaren como recolectados sólo es cierto porque el
diseño realmente no los guarda. Si eso cambia, cambia la etiqueta.

## Antes de enviar

- [ ] Cuenta de prueba con datos, para el revisor
- [ ] Notas de revisión explicando el desafío diario (el revisor puede abrir la
      app fuera de la ventana y ver una pantalla en espera — hay que avisarlo)
- [ ] Capturas de 6.7" y 6.1"
- [ ] Privacy Policy y Terms accesibles por URL pública
- [ ] Clasificación por edad: 12+
- [ ] `ITSAppUsesNonExemptEncryption: false` (ya está)

## Estado

Configuración lista. El resto depende de fases posteriores: no hay build
firmada todavía.
