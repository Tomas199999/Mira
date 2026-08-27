import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import type { ChallengeState } from '@mira/shared';
import { Button, Card, Countdown, EmptyState, FeedCard, StreakBadge, Text } from '@/components';
import { useChallengeState } from '@/features/challenge/useChallengeState';
import { getFeed, type FeedEntry } from '@/features/feed/api';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Home (§70). El desafío de hoy arriba; el feed de amigos debajo, nunca al revés.
 *
 * Es una FlatList con el desafío de encabezado y no un ScrollView con todo
 * adentro: el feed pagina, y con un ScrollView se cargarían todas las fotos de
 * una sola vez (§59).
 */
export default function HomeScreen() {
  const theme = useTheme();
  const { state, reload } = useChallengeState();
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = useCallback(async (fresh = false) => {
    try {
      const page = await getFeed(fresh ? undefined : cursor ?? undefined);
      setFeed((prev) => (fresh ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch { /* se conserva lo que ya está en pantalla */ }
    finally { setLoading(false); setRefreshing(false); setLoadingMore(false); }
  }, [cursor]);

  useEffect(() => { void loadFeed(true); }, []);

  async function refresh() {
    setRefreshing(true);
    setCursor(null);
    await Promise.all([reload(), loadFeed(true)]);
  }

  function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadFeed(false);
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={styles.content}
      data={feed}
      keyExtractor={(item) => item.submission.id}
      renderItem={({ item }) => <FeedCard entry={item} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.color.accent} />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text variant="caption" tone="tertiary" style={styles.brand}>MIRA</Text>
          <ChallengeCard state={state} />
          <Text variant="heading" style={styles.feedTitle}>{t().tabs.friends}</Text>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={theme.color.accent} style={{ marginTop: space.xl }} />
        ) : (
          <EmptyState icon="👋" title={t().empty.noFriendsTitle} body={t().empty.noFriendsBody} />
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={theme.color.accent} style={{ marginVertical: space.lg }} /> : null
      }
    />
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
          <Text variant="body" tone="secondary">{state.objectDisplayName}</Text>
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
  content: { padding: space.lg, paddingTop: space.xxxl, paddingBottom: space.huge },
  header: { gap: space.md },
  brand: { letterSpacing: 3, marginBottom: space.sm },
  hero: { gap: space.md, alignItems: 'center', paddingVertical: space.xl },
  heroBody: { maxWidth: 300 },
  countdown: { alignItems: 'center', gap: space.xs, marginVertical: space.sm },
  feedTitle: { marginTop: space.xl, marginBottom: space.md },
});
