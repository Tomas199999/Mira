import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Text } from '@/components';
import { t } from '@/i18n';
import { space } from '@/theme';

/**
 * Una foto propia a pantalla completa. Llega con su URL firmada desde el
 * historial: acá no se consulta nada, sólo se muestra.
 */
export default function PhotoScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { uri, title, subtitle } = useLocalSearchParams<{ uri: string; title: string; subtitle: string }>();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.caption}>
        <Text variant="title" style={styles.light}>{title}</Text>
        <Text variant="caption" style={styles.dim}>{subtitle}</Text>
      </View>

      {uri ? (
        <Image source={{ uri }} style={styles.photo} contentFit="contain" transition={150} />
      ) : (
        <View style={styles.photo} />
      )}

      <View style={styles.controls}>
        <Button label={t().common.done} variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  caption: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: 2 },
  light: { color: '#fff' },
  dim: { color: 'rgba(255,255,255,0.6)' },
  photo: { flex: 1, width: '100%' },
  controls: { paddingHorizontal: space.lg, paddingTop: space.md },
});
