# Marca y sistema de diseño

Decidido el 20/09/2026 entre dos propuestas, y ajustado el 30/09 y el 07/10
mirando la app corriendo en un simulador. Lo que sigue es lo que está en el
código: `apps/mobile/src/theme/tokens.ts` manda, esto explica por qué.

## El principio

La foto es el producto. Todo lo demás se corre del medio: lienzo oscuro,
un solo acento, y relieve únicamente donde hay que mirar.

## Color

Dirección **Menta**: neutros con un dejo verdoso en vez de gris puro — el
tinte es lo que los hace parecer elegidos y no heredados.

| Papel | Token | Valor |
|---|---|---|
| Fondo | `background` | `#0C1112` |
| Superficie | `surface` | `#131A1C` |
| Superficie elevada | `surfaceRaised` | `#1A2427` |
| Acento (acción) | `accent` | `#3EE0C8` |
| Racha | `streak` | `#FFB020` |
| Error | `danger` | `#FF4D4D` |

Tres reglas que ordenan el uso:

1. **Menta = acción.** El botón que hay que tocar. Uno solo por pantalla.
2. **Ámbar = racha.** No se usa para nada más, nunca. Esa exclusividad es lo
   que la hace legible de un vistazo.
3. Lo que no es acción, racha ni error, es neutro.

**La app es oscura siempre**, como una app de cámara, y no sigue el modo del
sistema: en claro la paleta pierde el sentido. `lightTheme` queda definido
por si algún día se ofrece como opción, pero no se elige solo.

## Tipografía

Dos familias, un papel cada una:

- **Bricolage Grotesque** para lo que se lee de un vistazo: el objeto del día,
  los títulos, los números grandes. Tiene carácter y aguanta el tamaño.
- **Instrument Sans** para todo lo demás: texto, etiquetas, botones.

En iOS cada peso es una familia distinta, así que el peso va en el nombre de
la fuente y no en `fontWeight`. La pantalla de arranque espera a que carguen:
un primer cuadro con la tipografía del sistema y después un salto es lo que
abarata una app.

La escala tiene siete tamaños y nada más. Una escala corta es lo que hace que
el conjunto se vea consistente; nadie escribe `fontSize` a mano, todo pasa por
`<Text variant="…">`.

## Iconos

Un solo set, **Feather**, detrás de `<Icon>`, con los tonos del tema. Los
emojis no son iconografía: cambian de forma según el sistema, no aceptan
color y delatan una interfaz sin diseñar.

La excepción son las **reacciones del feed**, que sí son emoji: ahí el emoji
es el contenido, no el ícono.

## Relieve

Dos niveles y nada más. Una tarjeta plana separa contenido; una `raised` es
*la* tarjeta de la pantalla. Si dos cosas sobresalen, no sobresale ninguna.

React Native no trae degradados, así que el relieve son borde teñido y sombra.
Se intentó simular un brillo con un círculo grande detrás: se veía como una
mancha con borde duro. No se repite.

## El ícono

El **iris de un obturador**: un disco menta con una apertura hexagonal y seis
cortes tangentes. El giro de los cortes es lo que lo distingue de una torta
cortada, y el hueco central es lo que se sigue leyendo a 40 px.

Se genera con `npm run icons` a partir de geometría, no de un archivo de
diseño: se puede rehacer en cualquier tamaño y cambiar el color de marca es
cambiar una línea. Ver `scripts/make-icons.mjs`.
