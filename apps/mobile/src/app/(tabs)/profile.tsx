import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, EmptyState, HistoryCalendar, StreakBadge, Text } from '@/components';
import { getHistory, getMyProfile, type HistoryDay, type MyProfile } from '@/features/profile/api';
import { space, useTheme } from '@/theme';
import { t, tp } from '@/i18n';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const copy = t().profile;

  const [me, setMe] = useState<MyProfile | null>(null);
  const [month] = useState(() => new Date().toISOString().slice(0, 7));
  const [days, setDays] = useState<HistoryDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profile, history] = await Promise.all([getMyProfile(), getHistory(month)]);
      setMe(profile);
      setDays(history.days);
    } catch { /* se conserva lo último conocido */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [month]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  const stats = me?.stats;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load(); }}
          tintColor={theme.color.accent} />
      }
    >
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]} />
        <Text variant="title">{me?.profile.displayName ?? '—'}</Text>
        <Text variant="body" tone="secondary">@{me?.profile.username ?? '—'}</Text>
        <StreakBadge days={stats?.currentStreak ?? 0} size="lg" />
      </View>

      <Card style={styles.stats}>
        <Stat label={copy.completed} value={String(stats?.totalCompleted ?? 0)} />
        <Stat label={t().streak.best} value={String(stats?.bestStreak ?? 0)} />
        <Stat
          label={copy.participation}
          value={`${Math.round((stats?.participationRate ?? 0) * 100)}%`}
        />
      </Card>

      {(me?.ranks.global || me?.ranks.country) ? (
        <Card style={styles.stats}>
          {me.ranks.global ? <Stat label={t().rankings.global} value={`#${me.ranks.global}`} /> : null}
          {me.ranks.country ? <Stat label={t().rankings.country} value={`#${me.ranks.country}`} /> : null}
          <Stat label={t().tabs.friends} value={String(stats?.friendCount ?? 0)} />
        </Card>
      ) : null}

      <Text variant="heading" style={{ marginTop: space.lg }}>{copy.myStory}</Text>
      {days.some((d) => d.submission) ? (
        <HistoryCalendar month={month} days={days} />
      ) : (
        <EmptyState icon="🗓️" title={t().empty.noPhotosTitle} body={t().empty.noPhotosBody} />
      )}

      {stats?.achievements?.length ? (
        <>
          <Text variant="heading" style={{ marginTop: space.lg }}>{copy.achievements}</Text>
          <View style={styles.badges}>
            {stats.achievements.map((a) => (
              <View
                key={a.code}
                style={[
                  styles.badge,
                  { borderColor: a.unlockedAt ? theme.color.accent : theme.color.border,
                    opacity: a.unlockedAt ? 1 : 0.4 },
                ]}
              >
                <Text variant="heading">{a.icon}</Text>
                <Text variant="caption" tone="secondary" center>{a.displayName}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.account}>
        <Button label={copy.settings} variant="ghost" onPress={() => router.push('/settings')} />
      </View>
    </ScrollView>
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
  content: { padding: space.lg, paddingTop: space.xxxl, paddingBottom: space.huge, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 1 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: space.xs, flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: {
    width: 88, aspectRatio: 1, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.xs,
  },
  account: { marginTop: space.xxl },
});
