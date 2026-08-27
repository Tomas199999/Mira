import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import type { DayOutcome, HistoryDay } from '@/features/profile/api';
import { radius, space, useTheme } from '@/theme';
import { Text } from './Text';

/**
 * Calendario del mes (§20).
 *
 * Cada estado tiene su propia forma, no sólo su color: un calendario que
 * distingue sólo por color es ilegible para quien no distingue rojo de verde.
 */
export function HistoryCalendar({ month, days }: { month: string; days: HistoryDay[] }) {
  const theme = useTheme();

  const first = new Date(`${month}-01T00:00:00Z`);
  // Lunes primero, como se usa en español y portugués.
  const leading = (first.getUTCDay() + 6) % 7;
  const byDay = new Map(days.map((d) => [d.date, d]));
  const total = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();

  const cells: Array<HistoryDay | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      return byDay.get(date) ?? { date, objectDisplayName: null, outcome: 'no_challenge' as DayOutcome, streakAfter: null, submission: null };
    }),
  ];

  return (
    <View>
      <View style={styles.weekdays}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((letter, i) => (
          <Text key={`${letter}${i}`} variant="caption" tone="tertiary" center style={styles.cell}>{letter}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={styles.cell} />;
          const thumb = day.submission?.thumbnailUrl;
          return (
            <View key={day.date} style={styles.cell}>
              <View
                accessibilityLabel={`${day.date}: ${labelFor(day.outcome)}`}
                style={[
                  styles.day,
                  {
                    borderColor: borderFor(day.outcome, theme),
                    backgroundColor: theme.color.surface,
                    borderStyle: day.outcome === 'missed' ? 'dashed' : 'solid',
                  },
                ]}
              >
                {thumb ? (
                  <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" transition={120} />
                ) : (
                  <Text variant="caption" tone={day.outcome === 'no_challenge' ? 'tertiary' : 'secondary'}>
                    {markFor(day.outcome) || String(Number(day.date.slice(-2)))}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function markFor(outcome: DayOutcome): string {
  return outcome === 'protected' ? '🛡️' : outcome === 'reviewing' ? '⏳' : '';
}

function labelFor(outcome: DayOutcome): string {
  return outcome;
}

function borderFor(outcome: DayOutcome, theme: ReturnType<typeof useTheme>): string {
  switch (outcome) {
    case 'completed': return theme.color.accent;
    case 'late':      return theme.color.textTertiary;
    case 'protected': return theme.color.streak;
    case 'reviewing': return theme.color.info;
    case 'missed':    return theme.color.border;
    default:          return 'transparent';
  }
}

const styles = StyleSheet.create({
  weekdays: { flexDirection: 'row', marginBottom: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 2 },
  day: {
    flex: 1, borderRadius: radius.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
});
