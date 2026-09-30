import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Camera } from 'expo-camera';
import * as Contacts from 'expo-contacts';
import * as Notifications from 'expo-notifications';
import { Button, Icon, Screen, Text, type IconName } from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { radius, space, useTheme } from '@/theme';
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
 * Cada fila pide el permiso de verdad. iOS sólo muestra el diálogo una vez:
 * si ya se decidió antes, `request` devuelve lo decidido sin preguntar, y el
 * botón manda a Ajustes, que es el único lugar donde se puede cambiar.
 */
const REQUESTERS: Record<PermissionKey, () => Promise<boolean>> = {
  camera: async () => (await Camera.requestCameraPermissionsAsync()).granted,
  notifications: async () => (await Notifications.requestPermissionsAsync()).granted,
  contacts: async () => (await Contacts.requestPermissionsAsync()).granted,
};

export default function PermissionsScreen() {
  const theme = useTheme();
  const { refresh } = useAuth();
  const copy = t().onboarding;

  const [status, setStatus] = useState<Record<PermissionKey, Status>>({
    camera: 'pending', notifications: 'pending', contacts: 'pending',
  });
  const [busy, setBusy] = useState<PermissionKey | null>(null);

  async function ask(key: PermissionKey) {
    setBusy(key);
    try {
      const granted = await REQUESTERS[key]();
      setStatus((prev) => ({ ...prev, [key]: granted ? 'granted' : 'denied' }));
    } catch (error) {
      console.warn('[permisos]', key, error);
      setStatus((prev) => ({ ...prev, [key]: 'denied' }));
    } finally {
      setBusy(null);
    }
  }

  const items: Array<{ key: PermissionKey; icon: IconName; title: string; body: string }> = [
    { key: 'camera',        icon: 'camera', title: copy.cameraTitle,        body: copy.cameraBody },
    { key: 'notifications', icon: 'bell',   title: copy.notificationsTitle, body: copy.notificationsBody },
    { key: 'contacts',      icon: 'users',  title: copy.contactsTitle,      body: copy.contactsBody },
  ];

  const anyDenied = Object.values(status).includes('denied');

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">{copy.permissionsTitle}</Text>
        <Text variant="body" tone="secondary">{copy.permissionsBody}</Text>
      </View>

      <View style={styles.list}>
        {items.map((item) => {
          const state = status[item.key];
          return (
            <View key={item.key} style={[styles.row, { backgroundColor: theme.color.surface }]}>
              <View style={[styles.icon, {
                backgroundColor: state === 'granted' ? theme.color.accentSoft : theme.color.surfaceRaised,
              }]}>
                <Icon name={item.icon} size={20} tone={state === 'granted' ? 'accent' : 'secondary'} />
              </View>

              <View style={styles.text}>
                <Text variant="label">{item.title}</Text>
                <Text variant="caption" tone="tertiary">{item.body}</Text>
              </View>

              {state === 'granted' ? (
                <View style={[styles.done, { backgroundColor: theme.color.accentSoft }]}>
                  <Icon name="check" size={16} tone="accent" />
                </View>
              ) : (
                <Button
                  label={state === 'denied' ? t().common.settings : copy.allow}
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  loading={busy === item.key}
                  onPress={() => state === 'denied' ? void Linking.openSettings() : void ask(item.key)}
                />
              )}
            </View>
          );
        })}
      </View>

      {anyDenied ? (
        <Text variant="caption" tone="tertiary" style={styles.note}>{copy.permissionFailed}</Text>
      ) : null}

      <View style={styles.footer}>
        <Button label={copy.finish} onPress={() => void refresh()} size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs, marginTop: space.xl, marginBottom: space.xl },
  list: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  done: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  note: { marginTop: space.md },
  footer: { marginTop: space.xxl, gap: space.sm },
});
