import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { elevation, radius, space, useTheme } from '@/theme';

/**
 * Dos niveles y nada más. Una tarjeta plana separa contenido; una `raised`
 * es LA tarjeta de la pantalla: borde teñido con el acento, sombra y un
 * brillo detrás. Si dos cosas sobresalen, no sobresale ninguna.
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
      {raised ? (
        <View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.color.accentSoft }]} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, overflow: 'hidden' },
  // Un círculo grande y desenfocado por el propio borde redondeado: el brillo
  // asoma por arriba de la tarjeta sin necesitar un gradiente nativo.
  glow: {
    position: 'absolute', top: -140, alignSelf: 'center',
    width: 320, height: 260, borderRadius: 160,
  },
});
