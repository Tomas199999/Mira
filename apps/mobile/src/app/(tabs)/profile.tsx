import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Card, EmptyState, HistoryCalendar, Icon, Text, type IconName } from '@/components';
import { getHistory, getMyProfile, type HistoryDay, type MyProfile } from '@/features/profile/api';
import { fonts, radius, space, useTheme } from '@/theme';
import { getLanguage, t, tp } from '@/i18n';

/** Los logros vienen con un emoji de la base; acá se dibujan con el set de la app. */
const ACHIEVEMENT_ICONS: Record<string, IconName> = {
  first_photo: 'camera', streak_3: 'zap', streak_7: 'zap', streak_30: 'zap', streak_100: 'zap',
  photos_50: 'image', photos_100: 'image', top_100_global: 'globe', top_10_country: 'flag',
  first_friend: 'user-plus', friends_10: 'users', early_bird: 'sunrise', comeback: 'refresh-cw',
};

export default function ProfileScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.color.background }]}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  const stats = me?.stats;
  const streak = stats?.currentStreak ?? 0;
  const name = me?.profile.displayName || me?.profile.username || '—';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); void load(); }}
          tintColor={theme.color.accent} />
      }
    >
      {/* Identidad */}
      <View style={styles.identity}>
        <Avatar name={name} size={64} />
        <View style={styles.who}>
          <Text variant="title">{name}</Text>
          <Text variant="caption" tone="tertiary">
            @{me?.profile.username ?? '—'}{me?.profile.countryCode ? ` · ${me.profile.countryCode}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.settings}
          onPress={() => router.push('/settings')}
          hitSlop={8}
          style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.color.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="settings" size={18} tone="secondary" />
        </Pressable>
      </View>

      {/* Racha: la pieza principal del perfil */}
      <Card raised style={styles.streakCard}>
        <View style={styles.streakRow}>
          <View style={[styles.flame, { backgroundColor: theme.color.surfaceRaised, borderColor: theme.color.streak }]}>
            <Icon name="zap" size={24} tone="streak" />
          </View>
          <View style={styles.streakText}>
            <Text style={[styles.streakNumber, { color: theme.color.textPrimary }]}>{streak}</Text>
            <Text variant="label" tone="secondary">{tp(copy, 'streakDays', streak)}</Text>
          </View>
          <LastSevenDays days={days} />
        </View>
        {stats?.protections ? (
          <View style={[styles.shield, { backgroundColor: theme.color.surface }]}>
            <Icon name="shield" size={14} tone="secondary" />
            <Text variant="caption" tone="secondary">{tp(copy, 'protections', stats.protections)}</Text>
          </View>
        ) : null}
      </Card>

      {/* Números */}
      <View style={styles.tiles}>
        <Tile label={copy.photos} value={stats?.totalCompleted ?? 0} />
        <Tile label={t().streak.best} value={stats?.bestStreak ?? 0} />
        <Tile label={copy.friends} value={stats?.friendCount ?? 0} />
      </View>

      {(me?.ranks.global || me?.ranks.country) ? (
        <View style={styles.ranks}>
          {me.ranks.global ? <RankChip icon="globe" label={copy.rankGlobal} rank={me.ranks.global} /> : null}
          {me.ranks.country ? <RankChip icon="flag" label={copy.rankCountry} rank={me.ranks.country} /> : null}
        </View>
      ) : null}

      {/* Historia */}
      <View style={styles.sectionRow}>
        <Text variant="heading">{copy.myStory}</Text>
        <Text variant="caption" tone="tertiary">{monthName(month)}</Text>
      </View>
      {days.some((d) => d.submission) ? (
        <HistoryCalendar
          month={month}
          days={days}
          onSelect={(day) => router.push({
            pathname: '/photo',
            params: {
              uri: day.submission?.photoUrl ?? '',
              title: day.objectDisplayName ?? '',
              subtitle: day.date,
            },
          })}
        />
      ) : (
        <EmptyState icon="calendar" title={t().empty.noPhotosTitle} body={t().empty.noPhotosBody} />
      )}

      {/* Logros */}
      {stats?.achievements?.length ? (
        <>
          <View style={styles.sectionRow}>
            <Text variant="heading">{copy.achievements}</Text>
            <Text variant="caption" tone="tertiary">
              {stats.achievements.filter((a) => a.unlockedAt).length}/{stats.achievements.length}
            </Text>
          </View>
          <View style={styles.badges}>
            {stats.achievements.map((a) => {
              const on = Boolean(a.unlockedAt);
              return (
                <View
                  key={a.code}
                  accessibilityLabel={`${a.displayName}: ${a.description}`}
                  style={[
                    styles.badge,
                    {
                      backgroundColor: on ? theme.color.accentSoft : theme.color.surface,
                      borderColor: on ? theme.color.accent : theme.color.border,
                    },
                  ]}
                >
                  <Icon name={ACHIEVEMENT_ICONS[a.code] ?? 'award'} size={20} tone={on ? 'accent' : 'tertiary'} />
                  <Text variant="caption" tone={on ? 'primary' : 'tertiary'} center numberOfLines={2}>
                    {a.displayName}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * Los últimos siete días, uno por punto. Es el dato que da sentido al número
 * de al lado: una racha de 3 se lee distinto si los cuatro días previos se
 * perdieron. Se dibuja con lo que ya trajo el historial, sin pedir nada más.
 */
function LastSevenDays({ days }: { days: HistoryDay[] }) {
  const theme = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const byDate = new Map(days.map((d) => [d.date, d]));

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${today}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return byDate.get(d.toISOString().slice(0, 10))?.outcome ?? 'no_challenge';
  });

  return (
    <View style={styles.week}>
      {week.map((outcome, i) => {
        const filled = outcome === 'completed' || outcome === 'late';
        return (
          <View
            key={i}
            style={[styles.dot, {
              backgroundColor: filled ? theme.color.accent
                : outcome === 'protected' ? theme.color.streak
                : 'transparent',
              borderColor: filled || outcome === 'protected'
                ? 'transparent'
                : outcome === 'missed' ? theme.color.border : theme.color.surfaceRaised,
            }]}
          />
        );
      })}
    </View>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: theme.color.surface }]}>
      <Text style={[styles.tileValue, { color: theme.color.textPrimary }]}>{value}</Text>
      <Text variant="caption" tone="tertiary">{label}</Text>
    </View>
  );
}

function RankChip({ icon, label, rank }: { icon: IconName; label: string; rank: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.rank, { backgroundColor: theme.color.surface }]}>
      <Icon name={icon} size={14} tone="secondary" />
      <Text variant="caption" tone="secondary">{label}</Text>
      <Text variant="label">#{rank}</Text>
    </View>
  );
}

function monthName(month: string): string {
  const locale = { es: 'es-AR', en: 'en-US', pt: 'pt-BR' }[getLanguage()] ?? 'es-AR';
  const text = new Date(`${month}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge, gap: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs, marginBottom: space.xs },
  who: { flex: 1, gap: 2 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  streakCard: { padding: space.lg },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flame: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  streakText: { flex: 1 },
  week: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
  streakNumber: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1.5, fontVariant: ['tabular-nums'] },
  shield: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, alignSelf: 'flex-start', marginTop: space.md },

  tiles: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, borderRadius: radius.lg, padding: space.md, gap: 2 },
  tileValue: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, fontVariant: ['tabular-nums'] },

  ranks: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  rank: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill },

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.lg, paddingHorizontal: space.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badge: {
    width: '31%', flexGrow: 1, aspectRatio: 1.15, borderRadius: radius.lg, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', gap: space.xs, padding: space.sm,
  },
});
