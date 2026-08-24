import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { RankingScope } from '@mira/shared';
import { EmptyState, Screen, Text } from '@/components';
import { radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

export default function RankingsScreen() {
  const [scope, setScope] = useState<RankingScope>('friends');
  const copy = t().rankings;

  const tabs: Array<{ key: RankingScope; label: string }> = [
    { key: 'friends', label: copy.friends },
    { key: 'country', label: copy.country },
    { key: 'global', label: copy.global },
  ];

  return (
    <Screen scroll>
      <Text variant="title" style={{ marginBottom: space.lg }}>{t().tabs.rankings}</Text>
      <Segmented tabs={tabs} value={scope} onChange={setScope} />
      <EmptyState icon="🏅" title={t().empty.noRankingTitle} body={t().empty.noRankingBody} />
    </Screen>
  );
}

function Segmented<T extends string>({ tabs, value, onChange }: {
  tabs: Array<{ key: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.group, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}>
      {tabs.map(tab => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={[styles.segment, active && { backgroundColor: theme.color.surfaceRaised }]}
          >
            <Text variant="label" tone={active ? 'primary' : 'tertiary'}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row', padding: space.xs, borderRadius: radius.pill,
    borderWidth: 1, gap: space.xs,
  },
  segment: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.pill },
});
