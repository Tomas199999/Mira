/**
 * Sistema de diseño de Mira.
 *
 * Identidad: la foto es el producto, así que la interfaz se corre del medio.
 * Lienzo oscuro con un dejo verdoso, un solo acento y relieve sólo donde
 * importa. Dirección "Menta", elegida el 20/09/2026 entre dos propuestas.
 *
 * Regla de color que ordena toda la app:
 *   · MENTA  = acción. El botón que hay que tocar. Uno solo por pantalla.
 *   · ÁMBAR  = racha. No se usa para nada más, nunca.
 *   · ROJO   = destructivo o error.
 * Si un elemento no es una acción, una racha o un error, es neutro.
 */

export const palette = {
  // Neutros: negro verdoso, no gris puro. El tinte es lo que los hace parecer
  // elegidos en vez de heredados.
  ink900: '#0C1112',
  ink800: '#131A1C',
  ink700: '#1A2427',
  ink600: '#243135',
  ink500: '#354548',
  ink400: '#62746F',
  ink300: '#9FB1AF',
  ink200: '#C6D2D0',
  ink100: '#E4EBEA',
  ink50:  '#F2F6F5',
  white:  '#FFFFFF',
  // Acento: acción.
  mint700: '#118F7E',
  mint600: '#17B09B',
  mint500: '#2ACCB5',
  mint400: '#3EE0C8',
  mint300: '#8FEDDD',
  mint100: '#DDF9F3',

  // Racha. Reservado.
  amber600: '#C77A00',
  amber500: '#FFB020',
  amber300: '#FFD37A',

  // Estados.
  red500:  '#FF4D4D',
  red300:  '#FF9494',
  blue500: '#4D9FFF',
} as const;

export interface Theme {
  isDark: boolean;
  color: {
    background: string;
    surface: string;
    surfaceRaised: string;
    border: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    accent: string;
    accentPressed: string;
    onAccent: string;
    /** Velo del acento: fondo de chips y el brillo detrás de lo importante. */
    accentSoft: string;
    streak: string;
    streakSoft: string;
    danger: string;
    info: string;
    /** Velo sobre una foto para que el texto encima se lea. */
    scrim: string;
  };
}

export const darkTheme: Theme = {
  isDark: true,
  color: {
    background: palette.ink900,
    surface: palette.ink800,
    surfaceRaised: palette.ink700,
    border: palette.ink600,
    textPrimary: palette.white,
    textSecondary: palette.ink300,
    textTertiary: palette.ink400,
    accent: palette.mint400,
    accentPressed: palette.mint500,
    onAccent: palette.ink900,
    accentSoft: 'rgba(62,224,200,0.13)',
    streak: palette.amber500,
    streakSoft: 'rgba(255,176,32,0.16)',
    danger: palette.red500,
    info: palette.blue500,
    scrim: 'rgba(12,17,18,0.55)',
  },
};

export const lightTheme: Theme = {
  isDark: false,
  color: {
    background: palette.white,
    surface: palette.ink50,
    surfaceRaised: palette.white,
    border: palette.ink100,
    textPrimary: palette.ink900,
    textSecondary: palette.ink400,
    textTertiary: palette.ink300,
    accent: palette.mint700,
    accentPressed: palette.mint600,
    onAccent: palette.white,
    accentSoft: 'rgba(17,143,126,0.12)',
    streak: palette.amber600,
    streakSoft: 'rgba(199,122,0,0.14)',
    danger: palette.red500,
    info: palette.blue500,
    scrim: 'rgba(12,17,18,0.45)',
  },
};

/** Escala de 4pt. Nada de márgenes arbitrarios. */
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48, huge: 64,
} as const;

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, pill: 999,
} as const;

/**
 * Tipografía. Escala corta a propósito: seis tamaños alcanzan para toda la app,
 * y una escala corta es lo que hace que se vea consistente.
 */
export const type = {
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800' },
  title:   { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  body:    { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label:   { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  mono:    { fontSize: 32, lineHeight: 36, fontWeight: '700', fontVariant: ['tabular-nums'] },
} as const;

/** Duraciones de animación (§41): rápidas. Nada por encima de 300ms. */
export const motion = {
  instant: 120,
  fast: 180,
  normal: 240,
  slow: 320,
} as const;

export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;
