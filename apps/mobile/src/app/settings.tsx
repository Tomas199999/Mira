import { useState } from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Screen, Text, TextField } from '@/components';
import { requestAccountDeletion, signOut } from '@/features/auth/api';
import { toUserMessage } from '@/features/auth/errors';
import { space } from '@/theme';
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
      <Text variant="title" style={{ marginBottom: space.xl }}>{t().common.settings}</Text>

      <Card style={styles.card}>
        <Text variant="heading">{copy.legal}</Text>
        <Button label={copy.privacyPolicy} variant="ghost"
          onPress={() => void Linking.openURL('https://mira.app/privacy')} />
        <Button label={copy.terms} variant="ghost"
          onPress={() => void Linking.openURL('https://mira.app/terms')} />
        <Button label={copy.guidelines} variant="ghost"
          onPress={() => void Linking.openURL('https://mira.app/guidelines')} />
        <Text variant="caption" tone="tertiary">{copy.legalPending}</Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">{copy.account}</Text>
        <Button label={t().profile.signOut} variant="ghost" onPress={() => void signOut()} />

        {done ? (
          <Text variant="caption" tone="accent">{copy.deletionRequested}</Text>
        ) : confirming ? (
          <View style={styles.confirm}>
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
        ) : (
          <Button label={copy.deleteAccount} variant="ghost" onPress={() => setConfirming(true)} />
        )}
      </Card>

      <Button label={t().common.done} variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, marginBottom: space.lg },
  confirm: { gap: space.md, marginTop: space.sm },
});
