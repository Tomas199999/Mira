import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme, type } from '@/theme';

type Variant = keyof typeof type;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'streak' | 'danger' | 'onAccent';

interface Props extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

const toneToColor = {
  primary: 'textPrimary', secondary: 'textSecondary', tertiary: 'textTertiary',
  accent: 'accent', streak: 'streak', danger: 'danger', onAccent: 'onAccent',
} as const;

/** Único punto donde se aplica tipografía. Nadie escribe fontSize a mano. */
export function Text({ variant = 'body', tone = 'primary', center, style, ...rest }: Props) {
  const theme = useTheme();
  const base = type[variant] as TextStyle;
  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: theme.color[toneToColor[tone]] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}
