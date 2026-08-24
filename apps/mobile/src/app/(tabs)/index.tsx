import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import type { ChallengeState } from '@mira/shared';
import { Button, Card, Countdown, EmptyState, Screen, StreakBadge, Text } from '@/components';
import { useChallengeState } from '@/features/challenge/useChallengeState';
import { DesignHarness } from '@/features/dev/DesignHarness';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Home (§70). Lo único que importa acá es el estado del desafío de hoy.
 * El feed de amigos va debajo, nunca arriba.
 */
export default function HomeScreen() {
  const { state, setPreviewState } = useChallengeState();
  const copy = t().home;

  return (
    <Screen scroll>
      <Text variant="caption" tone="tertiary" style={styles.brand}>MIRA</Text>

      <ChallengeCard state={state} />

      <View style={styles.feedSection}>
        <Text variant="heading">{t().tabs.friends}</Text>
        <EmptyState
          icon="👋"
          title={t().empty.noFriendsTitle}
          body={t().empty.noFriendsBody}
        />
      </View>

      {/* Sólo en desarrollo: permite ver cada estado del desafío en el teléfono
          sin backend. No se compila en release. */}
      <DesignHarness onSelectState={setPreviewState} />
    </Screen>
  );
}

function ChallengeCard({ state }: { state: ChallengeState }) {
  const theme = useTheme();
  const router = useRouter();
  const copy = t().home;

  switch (state.kind) {
    case 'none':
    case 'locked':
      return (
        <Card style={styles.hero}>
          <Text variant="display" center>⏳</Text>
          <Text variant="title" center>{copy.lockedTitle}</Text>
          <Text variant="body" tone="secondary" center style={styles.heroBody}>{copy.lockedBody}</Text>
        </Card>
      );

    case 'open':
      return (
        <Card raised style={styles.hero}>
          <Text variant="label" tone="accent">{copy.openTitle.toUpperCase()}</Text>
          <Text variant="display" center>📸</Text>
          <Text variant="caption" tone="secondary">{copy.photograph}</Text>
          <Text variant="title" center>{state.objectDisplayName.toUpperCase()}</Text>

          <View style={styles.countdown}>
            <Text variant="caption" tone="tertiary">{copy.timeLeft}</Text>
            <Countdown until={state.closesAt} />
          </View>

          <Button label={copy.openCamera} onPress={() => router.push('/challenge')} size="lg" />
        </Card>
      );

    case 'completed':
      return (
        <Card raised style={styles.hero}>
          <Text variant="label" tone="accent">✅ {copy.completedTitle.toUpperCase()}</Text>
          <View style={[styles.photoSlot, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
            <Text variant="caption" tone="tertiary">{copy.yourPhoto}</Text>
          </View>
          <StreakBadge days={state.currentStreak} size="lg" />
        </Card>
      );

    case 'reviewing':
      return (
        <Card style={styles.hero}>
          <Text variant="display" center>⏳</Text>
          <Text variant="title" center>{copy.reviewingTitle}</Text>
          <Text variant="body" tone="secondary" center style={styles.heroBody}>{copy.reviewingBody}</Text>
        </Card>
      );

    case 'missed':
      return (
        <Card style={styles.hero}>
          <Text variant="display" center>🌙</Text>
          <Text variant="title" center>{copy.missedTitle}</Text>
          <Text variant="body" tone="secondary" center style={styles.heroBody}>{copy.missedBody}</Text>
        </Card>
      );
  }
}

const styles = StyleSheet.create({
  brand: { letterSpacing: 3, marginBottom: space.lg },
  hero: { gap: space.md, alignItems: 'center', paddingVertical: space.xl },
  heroBody: { maxWidth: 300 },
  countdown: { alignItems: 'center', gap: space.xs, marginVertical: space.sm },
  photoSlot: {
    width: '100%', aspectRatio: 3 / 4, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  feedSection: { marginTop: space.xxl, gap: space.md },
});
