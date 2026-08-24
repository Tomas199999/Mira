/**
 * Sistema de diseño de Mira.
 *
 * Identidad: la foto es el producto, así que la interfaz se corre del medio.
 * Lienzo casi neutro, un solo acento saturado y mucho aire.
 *
 * Regla de color que ordena toda la app:
 *   · LIMA   = acción. El botón que hay que tocar. Uno solo por pantalla.
 *   · ÁMBAR  = racha. No se usa para nada más, nunca.
 *   · ROJO   = destructivo o error.
 * Si un elemento no es una acción, una racha o un error, es neutro.
 */

export const palette = {
  // Neutros: la base de todo.
  ink900: '#0B0B0D',
  ink800: '#141417',
  ink700: '#1D1D22',
  ink600: '#2A2A31',
  ink500: '#3D3D46',
  ink400: '#6B6B78',
  ink300: '#9A9AA6',
  ink200: '#C9C9D2',
  ink100: '#E8E8ED',
  ink50:  '#F5F5F7',
  white:  '#FFFFFF',

  // Acento: acción.
  lime600: '#8FBF12',
  lime500: '#AEDD22',
  lime400: '#C8FF4D',
  lime300: '#DBFF8A',
  lime100: '#F0FFCB',

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
    streak: string;
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
    accent: palette.lime400,
    accentPressed: palette.lime500,
    onAccent: palette.ink900,
    streak: palette.amber500,
    danger: palette.red500,
    info: palette.blue500,
    scrim: 'rgba(11,11,13,0.55)',
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
    accent: palette.lime600,
    accentPressed: palette.lime500,
    onAccent: palette.white,
    streak: palette.amber600,
    danger: palette.red500,
    info: palette.blue500,
    scrim: 'rgba(11,11,13,0.45)',
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
