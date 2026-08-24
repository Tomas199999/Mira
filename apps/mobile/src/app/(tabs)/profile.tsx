import { StyleSheet, View } from 'react-native';
import { Card, EmptyState, Screen, StreakBadge, Text } from '@/components';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function ProfileScreen() {
  const theme = useTheme();
  const copy = t().profile;

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
});
