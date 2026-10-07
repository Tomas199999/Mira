import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChallengeState } from '@mira/shared';
import { Button, Card, Countdown, EmptyState, FeedCard, Icon, Text } from '@/components';
import { useChallengeState } from '@/features/challenge/useChallengeState';
import { getFeed, type FeedEntry } from '@/features/feed/api';
import { fonts, radius, space, useTheme } from '@/theme';
import { getLanguage, t } from '@/i18n';

/**
 * Home (§70). El desafío de hoy arriba; el feed de amigos debajo, nunca al revés.
 *
 * Es una FlatList con el desafío de encabezado y no un ScrollView con todo
 * adentro: el feed es paginado y una lista virtualizada es lo único que
 * aguanta cien fotos sin comerse la memoria.
 */
export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state, reload } = useChallengeState();
  const router = useRouter();
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

  useFocusEffect(useCallback(() => { void loadFeed(true); }, []));

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

  const copy = t().home;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
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
          <View style={styles.brandRow}>
            <Text style={[styles.wordmark, { color: theme.color.textPrimary }]}>mira</Text>
            <Text variant="caption" tone="tertiary">{formatToday()}</Text>
          </View>
          <ChallengeCard state={state} onExpire={reload} />
          <View style={styles.sectionRow}>
            <Text variant="heading">{t().tabs.friends}</Text>
            {feed.length > 0 ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/friends')} hitSlop={8}>
                <Text variant="label" tone="accent">{copy.seeAll}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator color={theme.color.accent} style={{ marginTop: space.xl }} />
        ) : (
          <EmptyState
            icon="users"
            title={t().empty.noFriendsTitle}
            body={t().empty.noFriendsBody}
            actionLabel={t().friends.findContacts}
            onAction={() => router.push('/friends')}
          />
        )
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator color={theme.color.accent} style={{ marginVertical: space.lg }} /> : null
      }
    />
  );
}

function formatToday(): string {
  const locale = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' }[getLanguage()] ?? 'es-AR';
  const text = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ChallengeCard({ state, onExpire }: { state: ChallengeState; onExpire: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const copy = t().home;

  switch (state.kind) {
    case 'none':
    case 'locked':
      return (
        <Card style={styles.waiting}>
          <View style={[styles.disc, { backgroundColor: theme.color.accentSoft }]}>
            <Icon name="bell" size={20} tone="accent" />
          </View>
          <View style={styles.waitingText}>
            <Text variant="overline" tone="tertiary">{copy.todayEyebrow}</Text>
            <Text variant="heading">{copy.lockedTitle}</Text>
            <Text variant="caption" tone="tertiary">{copy.lockedBody}</Text>
          </View>
        </Card>
      );

    case 'open':
      return (
        <Card raised style={styles.heroOpen}>
          <View style={styles.openTop}>
            <View style={styles.live}>
              <View style={[styles.liveDot, { backgroundColor: theme.color.accent }]} />
              <Text variant="overline" tone="accent">{copy.openTitle}</Text>
            </View>
            {/* Al llegar a cero no se asume nada: se le vuelve a preguntar al
                servidor. Sin esto la tarjeta seguía ofreciendo la cámara con
                el reloj en 00:00:00, y el intento fallaba contra la API. */}
            <Countdown until={state.closesAt} onExpire={onExpire} />
          </View>
          <Text variant="caption" tone="secondary">{copy.photograph}</Text>
          <Text variant="display">{state.objectDisplayName}</Text>
          {state.objectDescription ? (
            <Text variant="body" tone="secondary" style={styles.heroBody}>{state.objectDescription}</Text>
          ) : null}
          <View style={styles.openActions}>
            <Button
              label={copy.openCamera}
              onPress={() => router.push('/challenge')}
              size="lg"
              icon={<Icon name="camera" size={18} tone="onAccent" />}
            />
            <Text variant="caption" tone="tertiary" center>
              {state.attemptsUsed}/{state.maxAttempts}
            </Text>
          </View>
        </Card>
      );

    case 'completed':
      // La foto del día es la pieza: a sangre, con lo demás encima.
      return (
        <View style={[styles.doneWrap, { backgroundColor: theme.color.surfaceRaised }]}>
          {state.submission?.photoUrl ? (
            <Image
              source={{ uri: state.submission.photoUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              accessibilityLabel={copy.yourPhoto}
            />
          ) : null}
          <View style={[styles.doneScrim, { backgroundColor: theme.color.scrim }]} />
          <View style={styles.doneTop}>
            <View style={[styles.chip, { backgroundColor: theme.color.accent }]}>
              <Icon name="check" size={13} tone="onAccent" />
              <Text variant="caption" tone="onAccent" style={styles.chipText}>{copy.completedTitle}</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: theme.color.streak }]}>
              <Icon name="zap" size={13} color={theme.color.background} />
              <Text style={[styles.chipNumber, { color: theme.color.background }]}>{state.currentStreak}</Text>
            </View>
          </View>
          <View style={styles.doneBottom}>
            <Text variant="overline" style={styles.onPhotoDim}>{copy.doneEyebrow}</Text>
            <Text variant="title" style={styles.onPhoto}>{state.objectDisplayName}</Text>
          </View>
        </View>
      );

    case 'reviewing':
      return (
        <Card style={styles.hero}>
          <View style={[styles.disc, { backgroundColor: theme.color.accentSoft }]}>
            <Icon name="eye" size={22} tone="accent" />
          </View>
          <Text variant="title" center>{copy.reviewingTitle}</Text>
          <Text variant="body" tone="secondary" center style={styles.heroBody}>{copy.reviewingBody}</Text>
        </Card>
      );

    case 'missed':
      return (
        <Card style={styles.hero}>
          <View style={[styles.disc, { backgroundColor: theme.color.surfaceRaised }]}>
            <Icon name="moon" size={22} tone="secondary" />
          </View>
          <Text variant="title" center>{copy.missedTitle}</Text>
          <Text variant="body" tone="secondary" center style={styles.heroBody}>{copy.missedBody}</Text>
        </Card>
      );
  }
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge },
  header: { gap: space.lg, marginBottom: space.md },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: space.xs },
  wordmark: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xs, marginTop: space.sm },

  hero: { gap: space.sm, alignItems: 'center', paddingVertical: space.xxl },
  heroBody: { maxWidth: 300 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  waitingText: { flex: 1, gap: 2 },
  disc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },

  heroOpen: { gap: space.xs, padding: space.xl },
  openTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  openActions: { marginTop: space.lg, gap: space.sm },

  doneWrap: { aspectRatio: 4 / 5, borderRadius: radius.xl, overflow: 'hidden', justifyContent: 'space-between' },
  doneScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  doneTop: { flexDirection: 'row', justifyContent: 'space-between', padding: space.md },
  doneBottom: { padding: space.lg, gap: 2 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill },
  chipText: { fontFamily: fonts.textSemibold },
  chipNumber: { fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 16 },
  onPhoto: { color: '#FFFFFF' },
  onPhotoDim: { color: 'rgba(255,255,255,0.72)' },
});
