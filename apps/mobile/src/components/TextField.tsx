import { forwardRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { radius, space, type, useTheme } from '@/theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  /** Mensaje de error ya listo para mostrar. Nunca un código técnico (§58). */
  error?: string | null;
  hint?: string;
  /** Elemento a la derecha del campo: un estado, no una acción. */
  accessory?: ReactNode;
}

export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, hint, accessory, style, ...rest }, ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  // El foco se ve: un campo activo tiene que distinguirse de uno que no lo está.
  const borderColor = error ? theme.color.danger
    : focused ? theme.color.accent
    : 'transparent';

  return (
    <View style={styles.wrap}>
      <Text variant="overline" tone="tertiary">{label}</Text>
      <View>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textTertiary}
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[
          styles.input,
          type.body,
          { color: theme.color.textPrimary, backgroundColor: theme.color.surface, borderColor },
          accessory ? styles.withAccessory : null,
          style,
        ]}
      />
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
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
    borderWidth: 1.5, borderRadius: radius.lg,
    paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 54,
  },
  withAccessory: { paddingRight: space.xxl },
  accessory: { position: 'absolute', right: space.lg, top: 0, bottom: 0, justifyContent: 'center' },
});
