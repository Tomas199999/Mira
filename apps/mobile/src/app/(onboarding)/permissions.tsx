import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Button, Card, Screen, Text } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

type PermissionKey = 'camera' | 'notifications' | 'contacts';
type Status = 'pending' | 'granted' | 'denied';

/**
 * Permisos, de a uno y explicados (§27).
 *
 * Ninguno es obligatorio para terminar el alta: negarlos degrada la
 * experiencia, no la bloquea. Pedirlos todos juntos al abrir es motivo de
 * rechazo en App Store, además de mala educación.
 *
 * Los pedidos reales se conectan cuando lleguen sus fases: cámara en la 5 y
 * notificaciones en la 9. Hasta entonces esta pantalla explica y deja pasar,
 * en vez de simular un diálogo del sistema que no existe (§79).
 */
export default function PermissionsScreen() {
  const theme = useTheme();
  const { refresh } = useAuth();
  const copy = t().onboarding;
  const [status, setStatus] = useState<Record<PermissionKey, Status>>({
    camera: 'pending', notifications: 'pending', contacts: 'pending',
  });

  const items: Array<{ key: PermissionKey; icon: string; title: string; body: string; phase: string }> = [
    { key: 'camera',        icon: '📷', title: copy.cameraTitle,        body: copy.cameraBody,        phase: 'Fase 5' },
    { key: 'notifications', icon: '🔔', title: copy.notificationsTitle, body: copy.notificationsBody, phase: 'Fase 9' },
    { key: 'contacts',      icon: '👥', title: copy.contactsTitle,      body: copy.contactsBody,      phase: 'Fase 6' },
  ];

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">{copy.permissionsTitle}</Text>
        <Text variant="body" tone="secondary">{copy.permissionsBody}</Text>
      </View>

      <View style={styles.list}>
        {items.map((item) => (
          <Card key={item.key} style={styles.card}>
            <Text variant="heading">{item.icon}  {item.title}</Text>
            <Text variant="caption" tone="secondary">{item.body}</Text>
            <Text variant="caption" tone="tertiary">
              Se solicita en la {item.phase}, cuando la función exista.
            </Text>
          </Card>
        ))}
      </View>

      <View style={styles.footer}>
        <Button label={copy.finish} onPress={() => void refresh()} size="lg" />
        <Button
          label={t().common.settings}
          variant="ghost"
          onPress={() => void Linking.openSettings()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs, marginTop: space.xl, marginBottom: space.xl },
  list: { gap: space.md },
  card: { gap: space.sm },
  footer: { marginTop: space.xxl, gap: space.sm },
});
