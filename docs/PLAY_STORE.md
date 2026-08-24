# Publicación en Google Play

> Cuenta de Play Console: **todavía no**. Hasta que exista, Android se desarrolla
> y se prueba con builds de desarrollo y emulador; no hay publicación ni Play
> Integrity.

## Configuración

- `package`: `com.miraapp.mira` — **inmutable** después del primer envío.
- Permisos declarados: `CAMERA`, `READ_CONTACTS`, `POST_NOTIFICATIONS`.
- Permisos **bloqueados** explícitamente en `app.config.ts`: audio, ubicación y
  lectura de la galería. Una librería transitiva puede agregarlos sin que uno se
  entere, y cada permiso de más es fricción en la ficha y riesgo en la revisión.
- `POST_NOTIFICATIONS` es obligatorio desde Android 13 y se pide en tiempo de
  ejecución, en contexto.

## Data safety

La ficha de Data safety tiene que coincidir con la etiqueta de privacidad de
iOS. Ver `APP_STORE.md`.

## Políticas relevantes

- **Families / público menor de edad.** Si la app se dirige también a menores,
  aplica la Families Policy: hay requisitos extra sobre publicidad, analítica y
  contenido. La app no tiene publicidad, lo que simplifica bastante.
- **Contenido generado por usuarios.** Se exige moderación, reporte y bloqueo:
  lo mismo que pide Apple, y está cubierto.
- **Permission declaration.** `READ_CONTACTS` puede requerir un formulario
  justificando el uso.

## Pendiente

- [ ] Crear la cuenta de Play Console (USD 25, pago único)
- [ ] Keystore de release y firma gestionada por Play
- [ ] Play Integrity API (equivalente a App Attest)
- [ ] Ficha, capturas, clasificación de contenido
