import { StyleSheet, View } from 'react-native';
import { radius, space, useTheme } from '@/theme';
import { t, tp } from '@/i18n';
import { Text } from './Text';

/**
 * La racha es el único elemento que usa ámbar en toda la app. Esa exclusividad
 * es lo que la hace legible de un vistazo.
 */
export function StreakBadge({ days, size = 'md' }: { days: number; size?: 'sm' | 'md' | 'lg' }) {
  const theme = useTheme();
  const label = tp(t().streak, 'days', days);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Racha: ${label}`}
      style={[
        styles.badge,
        size === 'lg' && styles.lg,
        { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.border },
      ]}
    >
      <Text variant={size === 'lg' ? 'heading' : 'label'}>🔥</Text>
      <Text variant={size === 'lg' ? 'heading' : 'label'} tone="streak">{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingVertical: space.sm, paddingHorizontal: space.md,
    borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start',
  },
  lg: { paddingVertical: space.md, paddingHorizontal: space.lg },
});
