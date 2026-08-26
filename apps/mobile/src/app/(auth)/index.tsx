import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, Text, TextField } from '@/components';
import { signInWithEmail, signUpWithEmail } from '@/features/auth/api';
import { isNetworkError, toErrorCode, toUserMessage } from '@/features/auth/errors';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

type Mode = 'sign_in' | 'sign_up';

export default function AuthScreen() {
  const theme = useTheme();
  const copy = t().auth;

  const [mode, setMode] = useState<Mode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const passwordLongEnough = password.length >= 8;
  const canSubmit = emailLooksValid && passwordLongEnough && !busy;

  async function submit() {
    setFormError(null);
    setNotice(null);

    // Se valida acá sólo para no hacer un viaje inútil; el servidor valida igual.
    if (!emailLooksValid) { setFormError(t().errors.emailInvalid); return; }
    if (!passwordLongEnough) { setFormError(t().errors.passwordTooShort); return; }

    setBusy(true);
    try {
      if (mode === 'sign_up') {
        await signUpWithEmail(email, password);
        // Si el proyecto exige confirmar el email, no hay sesión todavía.
        // El AuthProvider avanza solo cuando la haya.
        setNotice(copy.checkEmailBody);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setFormError(isNetworkError(err) ? t().errors.offline : toUserMessage(err));
      // Un proveedor sin configurar no es culpa del usuario, pero sí algo que
      // el equipo tiene que ver en los logs.
      if (toErrorCode(err) === 'internal') console.warn('[auth]', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="caption" tone="tertiary" style={styles.brand}>MIRA</Text>
        <Text variant="title">{copy.welcomeTitle}</Text>
        <Text variant="body" tone="secondary">{copy.welcomeBody}</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label={copy.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          inputMode="email"
        />
        <TextField
          label={copy.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'sign_up' ? 'new-password' : 'current-password'}
          textContentType={mode === 'sign_up' ? 'newPassword' : 'password'}
          hint={mode === 'sign_up' ? copy.passwordHint : undefined}
        />

        {formError ? <Text variant="caption" tone="danger">{formError}</Text> : null}
        {notice ? <Text variant="caption" tone="accent">{notice}</Text> : null}

        <Button
          label={mode === 'sign_in' ? copy.signIn : copy.signUp}
          onPress={submit}
          loading={busy}
          disabled={!canSubmit}
          size="lg"
        />

        <Button
          label={mode === 'sign_in' ? copy.noAccount : copy.hasAccount}
          onPress={() => { setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in'); setFormError(null); setNotice(null); }}
          variant="ghost"
        />
      </View>

      {/* Apple y Google llegan en cuanto estén configurados los proveedores en
          Supabase. No se muestran botones que no funcionan (§79). */}
      <View style={[styles.pending, { borderColor: theme.color.border }]}>
        <Text variant="caption" tone="tertiary" center>
          Apple y Google: pendientes de configurar el proveedor.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space.xs, marginTop: space.xxxl, marginBottom: space.xxl },
  brand: { letterSpacing: 3, marginBottom: space.lg },
  form: { gap: space.lg },
  pending: { marginTop: space.xxxl, paddingTop: space.lg, borderTopWidth: 1 },
});
