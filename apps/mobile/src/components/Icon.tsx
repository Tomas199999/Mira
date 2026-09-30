import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { useTheme } from '@/theme';

export type IconName = ComponentProps<typeof Feather>['name'];
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'streak' | 'danger' | 'onAccent';

/**
 * Un solo set de iconos (Feather) con un solo trazo, en toda la app. Los
 * emojis no son iconografía: cambian por sistema y no aceptan color.
 */
export function Icon({ name, size = 20, tone = 'primary', color }: {
  name: IconName; size?: number; tone?: Tone; color?: string;
}) {
  const theme = useTheme();
  const toneColor = {
    primary: theme.color.textPrimary, secondary: theme.color.textSecondary,
    tertiary: theme.color.textTertiary, accent: theme.color.accent,
    streak: theme.color.streak, danger: theme.color.danger, onAccent: theme.color.onAccent,
  }[tone];
  return <Feather name={name} size={size} color={color ?? toneColor} />;
}
