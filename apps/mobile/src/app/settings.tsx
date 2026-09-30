import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Icon, Screen, ScreenHeader, Text, TextField, type IconName } from '@/components';
import { requestAccountDeletion, signOut } from '@/features/auth/api';
import { toUserMessage } from '@/features/auth/errors';
import { radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Ajustes de la cuenta.
 *
 * La eliminación de cuenta desde adentro de la app es requisito duro de App
 * Store (Guideline 5.1.1(v)), no una función más. Pide confirmación escribiendo
 * el username porque es una acción destructiva y no debería salir de un toque
 * accidental.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const copy = t().settings;
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleDelete() {
    setBusy(true);
    try {
      await requestAccountDeletion();
      setDone(true);
    } catch (err) {
      Alert.alert(t().errors.generic, toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <ScreenHeader
        title={t().common.settings}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t().common.done}
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [styles.close, { backgroundColor: theme.color.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <Icon name="x" size={18} tone="secondary" />
          </Pressable>
        }
      />

      <Text variant="overline" tone="tertiary" style={styles.groupTitle}>{copy.legal}</Text>
      <View style={[styles.group, { backgroundColor: theme.color.surface }]}>
        <Row icon="shield" label={copy.privacyPolicy} onPress={() => void Linking.openURL('https://mira.app/privacy')} />
        <Row icon="file-text" label={copy.terms} onPress={() => void Linking.openURL('https://mira.app/terms')} divider />
        <Row icon="users" label={copy.guidelines} onPress={() => void Linking.openURL('https://mira.app/guidelines')} divider />
      </View>
      <Text variant="caption" tone="tertiary" style={styles.note}>{copy.legalPending}</Text>

      <Text variant="overline" tone="tertiary" style={styles.groupTitle}>{copy.account}</Text>
      <View style={[styles.group, { backgroundColor: theme.color.surface }]}>
        <Row icon="log-out" label={t().profile.signOut} onPress={() => void signOut()} />
        {!confirming && !done ? (
          <Row icon="trash-2" label={copy.deleteAccount} tone="danger" onPress={() => setConfirming(true)} divider />
        ) : null}
      </View>

      {done ? (
        <View style={[styles.banner, { backgroundColor: theme.color.accentSoft }]}>
          <Icon name="check-circle" size={16} tone="accent" />
          <Text variant="caption" tone="accent" style={styles.bannerText}>{copy.deletionRequested}</Text>
        </View>
      ) : confirming ? (
        <View style={[styles.confirm, { borderColor: theme.color.danger }]}>
          <Text variant="caption" tone="secondary">{copy.deleteConfirmBody}</Text>
          <TextField
            label={copy.deleteConfirmLabel}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            label={copy.deleteAccount}
            variant="danger"
            onPress={handleDelete}
            loading={busy}
            disabled={confirmText.trim().length < 3}
          />
          <Button label={t().common.cancel} variant="ghost" onPress={() => setConfirming(false)} />
        </View>
      ) : null}
    </Screen>
  );
}

function Row({ icon, label, onPress, tone = 'primary', divider = false }: {
  icon: IconName; label: string; onPress: () => void;
  tone?: 'primary' | 'danger'; divider?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: 1, borderTopColor: theme.color.border },
        pressed && { backgroundColor: theme.color.surfaceRaised },
      ]}
    >
      <Icon name={icon} size={18} tone={tone === 'danger' ? 'danger' : 'secondary'} />
      <Text variant="body" tone={tone === 'danger' ? 'danger' : 'primary'} style={styles.rowLabel}>{label}</Text>
      <Icon name="chevron-right" size={18} tone="tertiary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { marginTop: space.lg, marginBottom: space.sm, paddingHorizontal: space.xs },
  group: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, minHeight: 52 },
  rowLabel: { flex: 1 },
  note: { marginTop: space.sm, paddingHorizontal: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderRadius: radius.md, marginTop: space.md },
  bannerText: { flex: 1 },
  confirm: { gap: space.md, marginTop: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
});
