import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, Screen, StreakBadge, Text } from '@/components';
import { signOut } from '@/features/auth/api';
import { toUserMessage } from '@/features/auth/errors';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function ProfileScreen() {
  const theme = useTheme();
  const copy = t().profile;
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // No hace falta navegar: el guard del layout raíz reacciona al cambio
      // de sesión y desmonta el grupo de pestañas.
    } catch (err) {
      Alert.alert(t().errors.generic, toUserMessage(err));
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]} />
        <Text variant="title">—</Text>
        <Text variant="body" tone="secondary">@—</Text>
        <StreakBadge days={0} size="lg" />
      </View>

      <Card style={styles.stats}>
        <Stat label={copy.completed} value="0" />
        <Stat label={t().streak.best} value="0" />
      </Card>

      <Text variant="heading" style={{ marginTop: space.xl }}>{copy.myStory}</Text>
      <EmptyState icon="🗓️" title={t().empty.noPhotosTitle} body={t().empty.noPhotosBody} />

      <View style={styles.account}>
        <Button
          label={t().profile.settings}
          variant="ghost"
          onPress={() => router.push('/settings')}
        />
        <Button
          label={t().profile.signOut}
          variant="ghost"
          onPress={handleSignOut}
          loading={signingOut}
        />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="secondary" center>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.xl },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: space.xs, flex: 1 },
  account: { marginTop: space.xxl },
});
