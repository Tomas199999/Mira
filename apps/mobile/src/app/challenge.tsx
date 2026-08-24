import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text } from '@/components';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Pantalla del desafío: objeto arriba, cámara ocupando todo lo demás (§7).
 *
 * La cámara real llega en la Fase 5, junto con el token de subida y la
 * attestation. Hasta entonces esta pantalla existe para fijar el layout y la
 * navegación — no simula una captura.
 */
export default function ChallengeScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" tone="tertiary">{t().home.photograph.toUpperCase()}</Text>
        <Text variant="title">—</Text>
      </View>

      <View style={[styles.viewfinder, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
        <Text variant="caption" tone="tertiary" center>
          Cámara — Fase 5
        </Text>
      </View>

      <View style={styles.actions}>
        <Button label={t().common.cancel} variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.xs, marginBottom: space.lg },
  viewfinder: {
    flex: 1, borderRadius: 24, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  actions: { marginTop: space.lg },
});
