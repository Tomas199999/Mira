import { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, View } from 'react-native';
import { motion, radius, space, useTheme } from '@/theme';
import { Text } from './Text';

interface Props {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

/**
 * Botón. La animación de presión es deliberadamente chica y rápida (§41):
 * se tiene que sentir, no ver.
 */
export function Button({
  label, onPress, variant = 'primary', size = 'md',
  disabled, loading, icon, fullWidth = true,
}: Props) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.spring(scale, {
      toValue: to, useNativeDriver: true, speed: 40, bounciness: 0,
    }).start();

  const surface = {
    primary: theme.color.accent,
    secondary: theme.color.surfaceRaised,
    ghost: 'transparent',
    danger: theme.color.danger,
  }[variant];

  const tone = variant === 'primary' ? 'onAccent' : variant === 'danger' ? 'onAccent' : 'primary';
  const isInert = disabled || loading;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, fullWidth && { alignSelf: 'stretch' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isInert, busy: loading }}
        accessibilityLabel={label}
        disabled={isInert}
        onPress={onPress}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        style={[
          styles.base,
          size === 'lg' ? styles.lg : styles.md,
          {
            backgroundColor: surface,
            borderColor: variant === 'ghost' ? theme.color.border : 'transparent',
            borderWidth: variant === 'ghost' ? 1 : 0,
            opacity: isInert ? 0.45 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variant === 'primary' ? theme.color.onAccent : theme.color.textPrimary} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text variant="label" tone={tone}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  md: { paddingVertical: space.md, paddingHorizontal: space.xl, minHeight: 48 },
  lg: { paddingVertical: space.lg, paddingHorizontal: space.xxl, minHeight: 56 },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
