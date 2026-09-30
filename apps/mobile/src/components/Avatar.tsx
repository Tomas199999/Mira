import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { fonts, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Avatar con foto o, si no hay, iniciales sobre un color que sale del nombre:
 * la misma persona siempre tiene el mismo color, en cualquier pantalla.
 */
const HUES = [172, 198, 230, 262, 292, 330, 14, 38];

function hueFor(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length] ?? 172;
}

export function Avatar({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const theme = useTheme();
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·';
  const hue = hueFor(name.toLowerCase());
  const radius = size / 2;

  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" transition={120} />;
  }

  return (
    <View
      accessibilityLabel={name}
      style={[styles.fallback, {
        width: size, height: size, borderRadius: radius,
        backgroundColor: `hsl(${hue} 34% 22%)`,
        borderColor: theme.color.border,
      }]}
    >
      <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.4, lineHeight: size * 0.5, color: `hsl(${hue} 70% 78%)` }}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
