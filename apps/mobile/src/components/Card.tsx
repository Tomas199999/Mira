import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { elevation, radius, space, useTheme } from '@/theme';

export function Card({ children, style, raised = false }: {
  children: ReactNode; style?: ViewStyle; raised?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[
      styles.card,
      {
        backgroundColor: raised ? theme.color.surfaceRaised : theme.color.surface,
        borderColor: theme.color.border,
      },
      raised && elevation.card,
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg },
});
