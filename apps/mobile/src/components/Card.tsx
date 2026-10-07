import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { elevation, radius, space, useTheme } from '@/theme';

/**
 * Dos niveles y nada más. Una tarjeta plana separa contenido; una `raised`
 * es LA tarjeta de la pantalla: fondo un tono más claro, borde teñido con el
 * acento y sombra. Si dos cosas sobresalen, no sobresale ninguna.
 *
 * Sin degradados: React Native no los trae, y el círculo que se usaba para
 * simular el brillo se veía como una mancha con borde duro, no como luz.
 */
export function Card({ children, style, raised = false }: {
  children: ReactNode; style?: ViewStyle; raised?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[
      styles.card,
      {
        backgroundColor: raised ? theme.color.surfaceRaised : theme.color.surface,
        borderColor: raised ? theme.color.accentSoft : theme.color.border,
      },
      raised && elevation.card,
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, overflow: 'hidden' },
});
