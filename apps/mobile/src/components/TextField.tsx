import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, space, type, useTheme } from '@/theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  /** Mensaje de error ya listo para mostrar. Nunca un código técnico (§58). */
  error?: string | null;
  hint?: string;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, style, ...rest }, ref,
) {
  const theme = useTheme();
  const borderColor = error ? theme.color.danger : theme.color.border;

  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="secondary">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textTertiary}
        {...rest}
        style={[
          styles.input,
          type.body,
          { color: theme.color.textPrimary, backgroundColor: theme.color.surface, borderColor },
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="danger">{error}</Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52,
  },
});
