import { createContext, useContext, type ReactNode } from 'react';
import { darkTheme, type Theme } from './tokens';

const ThemeContext = createContext<Theme>(darkTheme);

/**
 * Mira es oscura siempre, como una app de cámara: la identidad es el lienzo
 * oscuro y la foto encima. No sigue el modo del sistema, porque en claro la
 * paleta pierde el sentido (el brillo detrás de la tarjeta, el velo de la
 * racha). `lightTheme` queda definido en tokens.ts por si algún día se ofrece
 * como opción, pero no se elige solo.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeContext.Provider value={darkTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
