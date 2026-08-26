import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getLocales, getCalendars } from 'expo-localization';
import { countryByCode, countryName, minimumAgeFor, searchCountries, type Country } from '@mira/shared';
import { Button, Screen, Text, TextField } from '@/components';
import { createProfile, isUsernameAvailable } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { isNetworkError, toUserMessage } from '@/features/auth/errors';
import { radius, space, useTheme } from '@/theme';
import { getLanguage, t } from '@/i18n';

/**
 * Alta de perfil (§28).
 *
 * Todo lo que importa lo valida el servidor dentro de `create_user_profile()`:
 * formato, reservados, unicidad y edad mínima, en una sola transacción. Lo de
 * acá es para dar respuesta inmediata, no para decidir.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { refresh } = useAuth();
  const copy = t().onboarding;
  const locale = getLanguage();

  const deviceRegion = getLocales()[0]?.regionCode ?? null;
  const deviceTz = getCalendars()[0]?.timeZone ?? 'UTC';

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [birth, setBirth] = useState('');
  const [country, setCountry] = useState<Country | null>(() => countryByCode(deviceRegion));
  const [pickingCountry, setPickingCountry] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');

  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const usernameWellFormed = /^[a-z0-9_.]{3,20}$/.test(username);
  const birthIso = parseBirthDate(birth);
  const minAge = minimumAgeFor(country?.code);
  const oldEnough = birthIso !== null && ageOn(birthIso) >= minAge;

  // Consulta con retardo: sin esto se dispara una llamada por tecla.
  useEffect(() => {
    if (!usernameWellFormed) { setAvailable(null); return; }
    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const ok = await isUsernameAvailable(username);
        if (!cancelled) setAvailable(ok);
      } catch {
        if (!cancelled) setAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, [username, usernameWellFormed]);

  const canSubmit = displayName.trim().length > 0
    && usernameWellFormed && available === true
    && oldEnough && country !== null && !busy;

  async function submit() {
    setFormError(null);
    if (!birthIso) { setFormError(t().errors.fieldRequired); return; }
    if (!oldEnough) { setFormError(t().errors.ageRestricted); return; }
    if (!country) { setFormError(t().errors.fieldRequired); return; }

    setBusy(true);
    try {
      await createProfile({
        username,
        displayName: displayName.trim(),
        birthDate: birthIso,
        countryCode: country.code,
        timezone: deviceTz,
        locale,
      });
      // El perfil ya existe: el AuthProvider recalcula y el guard deja pasar.
      await refresh();
      router.replace('/(onboarding)/permissions');
    } catch (err) {
      setFormError(isNetworkError(err) ? t().errors.offline : toUserMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const results = useMemo(() => searchCountries(countryQuery, locale).slice(0, 40), [countryQuery, locale]);

  if (pickingCountry) {
    return (
      <Screen>
        <TextField
          label={copy.country}
          value={countryQuery}
          onChangeText={setCountryQuery}
          autoFocus
          autoCorrect={false}
        />
        <ScrollView style={styles.countryList} keyboardShouldPersistTaps="handled">
          {results.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => { setCountry(c); setPickingCountry(false); setCountryQuery(''); }}
              style={[styles.countryRow, { borderBottomColor: theme.color.border }]}
            >
              <Text variant="body">{c.flag}  {countryName(c, locale)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Button label={t().common.cancel} variant="ghost" onPress={() => setPickingCountry(false)} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Text variant="title">{copy.profileTitle}</Text>
        <Text variant="body" tone="secondary">{copy.profileBody}</Text>
      </View>

      <View style={styles.form}>
        <TextField
          label={copy.name}
          value={displayName}
          onChangeText={setDisplayName}
          autoComplete="name"
          maxLength={40}
        />

        <TextField
          label={copy.username}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          hint={
            checking ? t().common.loading
            : available === true ? copy.usernameAvailable
            : copy.usernameHint
          }
          error={available === false ? copy.usernameTaken : null}
        />

        <TextField
          label={copy.birthDate}
          value={birth}
          onChangeText={(v) => setBirth(formatBirthInput(v))}
          keyboardType="number-pad"
          placeholder="DD/MM/AAAA"
          maxLength={10}
          hint={copy.birthDateHint}
          error={birth.length === 10 && !oldEnough ? t().errors.ageRestricted : null}
        />

        <View style={styles.field}>
          <Text variant="label" tone="secondary">{copy.country}</Text>
          <Pressable
            onPress={() => setPickingCountry(true)}
            style={[styles.countryButton, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
          >
            <Text variant="body" tone={country ? 'primary' : 'tertiary'}>
              {country ? `${country.flag}  ${countryName(country, locale)}` : copy.country}
            </Text>
          </Pressable>
        </View>

        {formError ? <Text variant="caption" tone="danger">{formError}</Text> : null}

        <Button label={copy.createProfile} onPress={submit} loading={busy} disabled={!canSubmit} size="lg" />
      </View>
    </Screen>
  );
}

/** `DD/MM/AAAA` mientras se escribe, sin librerías de máscara. */
function formatBirthInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

/** Devuelve ISO `YYYY-MM-DD`, o null si la fecha no existe (31/02, por ejemplo). */
function parseBirthDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = Number(dd), month = Number(mm), year = Number(yyyy);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function ageOn(iso: string): number {
  const birth = new Date(`${iso}T00:00:00Z`);
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

const styles = StyleSheet.create({
  head: { gap: space.xs, marginTop: space.xl, marginBottom: space.xxl },
  form: { gap: space.lg },
  field: { gap: space.xs },
  countryButton: {
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52, justifyContent: 'center',
  },
  countryList: { flex: 1, marginTop: space.md },
  countryRow: { paddingVertical: space.md, borderBottomWidth: 1 },
});
