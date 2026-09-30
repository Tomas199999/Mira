import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RankingScope } from '@mira/shared';
import { Avatar, EmptyState, Icon, ScreenHeader, Text } from '@/components';
import { getRanking, type RankingPage } from '@/features/profile/api';
import { fonts, radius, space, useTheme } from '@/theme';
import { interpolate, t } from '@/i18n';

export default function RankingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load(scope); }}
          tintColor={theme.color.accent} />
      }
    >
      <ScreenHeader title={t().tabs.rankings} />

      <View style={[styles.group, { backgroundColor: theme.color.surface }]}>
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
        <View style={[styles.mine, { backgroundColor: theme.color.accentSoft }]}>
          <View>
            <Text variant="overline" tone="accent">{copy.yourPosition}</Text>
            {page.totalParticipants ? (
              <Text variant="caption" tone="secondary">
                {interpolate(copy.ofTotal, { total: page.totalParticipants.toLocaleString('es') })}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.mineRank, { color: theme.color.accent }]}>#{page.myEntry.rank.toLocaleString('es')}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={theme.color.accent} style={{ marginTop: space.xl }} />
      ) : !page || page.entries.length === 0 ? (
        <EmptyState icon="award" title={t().empty.noRankingTitle} body={t().empty.noRankingBody} />
      ) : (
        <View style={[styles.list, { backgroundColor: theme.color.surface }]}>
          {page.entries.map((entry, i) => {
            const podium = entry.rank <= 3;
            return (
              <View
                key={entry.userId}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: theme.color.border },
                  entry.isMe && { backgroundColor: theme.color.surfaceRaised },
                ]}
              >
                <Text style={[styles.rank, { color: podium ? theme.color.textPrimary : theme.color.textTertiary }]}>
                  {entry.rank}
                </Text>
                <Avatar name={entry.displayName || entry.username} size={36} />
                <View style={styles.rowText}>
                  <Text variant="label" numberOfLines={1}>{entry.displayName}</Text>
                  <Text variant="caption" tone="tertiary">@{entry.username}</Text>
                </View>
                <View style={styles.score}>
                  <Text style={[styles.scoreNumber, { color: theme.color.streak }]}>{entry.score}</Text>
                  <Icon name="zap" size={13} tone="streak" />
                </View>
              </View>
            );
          })}
        </View>
      )}

      {page?.snapshotDate ? (
        <Text variant="caption" tone="tertiary" center style={{ marginTop: space.sm }}>
          {copy.updatedAt.replace('{{time}}', page.snapshotDate)}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge, gap: space.md },
  group: { flexDirection: 'row', padding: 4, borderRadius: radius.pill, gap: 4 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.pill },
  mine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg, borderRadius: radius.lg },
  mineRank: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  list: { borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  rank: { fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 20, minWidth: 24, textAlign: 'center', fontVariant: ['tabular-nums'] },
  rowText: { flex: 1, gap: 1 },
  score: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scoreNumber: { fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
});
