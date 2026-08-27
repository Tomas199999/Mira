import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { RankingScope } from '@mira/shared';
import { EmptyState, Screen, Text } from '@/components';
import { getRanking, type RankingPage } from '@/features/profile/api';
import { radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function RankingsScreen() {
  const theme = useTheme();
  const copy = t().rankings;
  const [scope, setScope] = useState<RankingScope>('friends');
  const [page, setPage] = useState<RankingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (which: RankingScope) => {
    try { setPage(await getRanking(which)); }
    catch { setPage(null); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { setLoading(true); void load(scope); }, [scope, load]);

  const tabs: Array<{ key: RankingScope; label: string }> = [
    { key: 'friends', label: copy.friends },
    { key: 'country', label: copy.country },
    { key: 'global', label: copy.global },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load(scope); }}
          tintColor={theme.color.accent} />
      }
    >
      <Text variant="title">{t().tabs.rankings}</Text>

      <View style={[styles.group, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
        {tabs.map((tab) => {
          const active = tab.key === scope;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setScope(tab.key)}
              style={[styles.segment, active && { backgroundColor: theme.color.surfaceRaised }]}
            >
              <Text variant="label" tone={active ? 'primary' : 'tertiary'}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {page?.myEntry ? (
        <View style={[styles.mine, { borderColor: theme.color.accent }]}>
          <Text variant="caption" tone="secondary">{copy.yourPosition}</Text>
          <Text variant="heading" tone="accent">#{page.myEntry.rank.toLocaleString('es')}</Text>
          {page.totalParticipants ? (
            <Text variant="caption" tone="tertiary">de {page.totalParticipants.toLocaleString('es')}</Text>
          ) : null}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.color.accent} style={{ marginTop: space.xl }} />
      ) : !page || page.entries.length === 0 ? (
        <EmptyState icon="🏅" title={t().empty.noRankingTitle} body={t().empty.noRankingBody} />
      ) : (
        <View style={styles.list}>
          {page.entries.map((entry) => (
            <View
              key={entry.userId}
              style={[
                styles.row,
                { borderColor: theme.color.border },
                entry.isMe && { backgroundColor: theme.color.surface },
              ]}
            >
              <Text variant="label" tone="tertiary" style={styles.rank}>{entry.rank}</Text>
              <View style={styles.rowText}>
                <Text variant="label">{entry.displayName}</Text>
                <Text variant="caption" tone="tertiary">@{entry.username}</Text>
              </View>
              <Text variant="label" tone="streak">🔥 {entry.score}</Text>
            </View>
          ))}
        </View>
      )}

      {page?.snapshotDate ? (
        <Text variant="caption" tone="tertiary" center style={{ marginTop: space.lg }}>
          {copy.updatedAt.replace('{{time}}', page.snapshotDate)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingTop: space.xxxl, paddingBottom: space.huge, gap: space.lg },
  group: { flexDirection: 'row', padding: space.xs, borderRadius: radius.pill, borderWidth: 1, gap: space.xs },
  segment: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.pill },
  mine: { alignItems: 'center', gap: 2, padding: space.lg, borderRadius: radius.lg, borderWidth: 1 },
  list: { gap: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingVertical: space.md, paddingHorizontal: space.sm, borderBottomWidth: 1, borderRadius: radius.sm,
  },
  rank: { minWidth: 32, textAlign: 'right' },
  rowText: { flex: 1, gap: 2 },
});
