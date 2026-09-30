import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Icon, Screen, Text, TextField } from '@/components';
import * as AppleAuthentication from 'expo-apple-authentication';
import { canSignInWithApple, signInWithApple, SignInCancelled, signInWithEmail, signUpWithEmail } from '@/features/auth/api';
import { isNetworkError, toErrorCode, toUserMessage } from '@/features/auth/errors';
import { fonts, radius, space, useTheme } from '@/theme';
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
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => { void canSignInWithApple().then(setAppleAvailable); }, []);

  async function withApple() {
    setFormError(null);
    setNotice(null);
    setBusy(true);
    try {
      await signInWithApple();
      // Con sesión, el AuthProvider lleva al alta de perfil o a la app.
    } catch (err) {
      if (!(err instanceof SignInCancelled)) {
        setFormError(isNetworkError(err) ? t().errors.offline : toUserMessage(err));
        console.warn('[auth] apple', err);
      }
    } finally {
      setBusy(false);
    }
  }

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
        <View style={[styles.mark, { backgroundColor: theme.color.accentSoft }]}>
          <Icon name="aperture" size={26} tone="accent" />
        </View>
        <Text style={[styles.wordmark, { color: theme.color.textPrimary }]}>mira</Text>
        <Text variant="body" tone="secondary" style={styles.tagline}>{copy.welcomeBody}</Text>
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

        {formError ? (
          <View style={[styles.banner, { backgroundColor: 'rgba(255,77,77,0.12)' }]}>
            <Icon name="alert-circle" size={16} tone="danger" />
            <Text variant="caption" tone="danger" style={styles.bannerText}>{formError}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={[styles.banner, { backgroundColor: theme.color.accentSoft }]}>
            <Icon name="mail" size={16} tone="accent" />
            <Text variant="caption" tone="accent" style={styles.bannerText}>{notice}</Text>
          </View>
        ) : null}

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

      {/* Sólo se muestra donde funciona: iOS con el proveedor configurado en
          Supabase. Google llega cuando esté configurado; no se muestra un botón
          que no funciona (§79). */}
      {appleAvailable ? (
        <View style={styles.social}>
          <View style={styles.divider}>
            <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
            <Text variant="caption" tone="tertiary">{copy.or}</Text>
            <View style={[styles.rule, { backgroundColor: theme.color.border }]} />
          </View>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={12}
            style={styles.apple}
            onPress={() => void withApple()}
          />
        </View>
      ) : null}
      <View style={[styles.pending, { borderColor: theme.color.border }]}>
        <Text variant="caption" tone="tertiary" center>{copy.googlePending}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', gap: space.xs, marginTop: space.xxl, marginBottom: space.xxl },
  mark: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  wordmark: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1.6 },
  tagline: { textAlign: 'center', maxWidth: 280 },
  form: { gap: space.md },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, padding: space.md, borderRadius: radius.md },
  bannerText: { flex: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rule: { flex: 1, height: 1 },
  social: { marginTop: space.xl, gap: space.md },
  apple: { height: 52, width: '100%' },
  pending: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: 1 },
});
