import { Pressable, StyleSheet, View } from 'react-native';
import type { ChallengeState } from '@mira/shared';
import { Text } from '@/components';
import { radius, space, useTheme } from '@/theme';

/**
 * Harness de diseño — SÓLO EN DESARROLLO.
 *
 * Permite ver en el teléfono cada estado del desafío mientras el backend no
 * existe. No son datos de producción disfrazados: es una herramienta de
 * diseño, va detrás de `__DEV__` y no se monta en un build de release.
 */
export function DesignHarness({ onSelectState }: { onSelectState: (s: ChallengeState) => void }) {
  const theme = useTheme();
  if (!__DEV__) return null;

  const inTwoHours = new Date(Date.now() + 2 * 3600_000).toISOString();

  const states: Array<{ label: string; value: ChallengeState }> = [
    { label: 'none', value: { kind: 'none' } },
    { label: 'locked', value: { kind: 'locked', challengeDate: today(), opensAt: inTwoHours } },
    {
      label: 'open',
      value: {
        kind: 'open', windowId: 'preview', challengeDate: today(),
        objectDisplayName: 'una taza', objectDescription: null,
        opensAt: new Date().toISOString(), closesAt: inTwoHours,
        attemptsUsed: 0, maxAttempts: 3,
      },
    },
    {
      label: 'completed',
      value: {
        kind: 'completed', challengeDate: today(), objectDisplayName: 'una taza',
        currentStreak: 27,
        submission: {
          id: 'preview', userId: 'preview', challengeDate: today(),
          objectDisplayName: 'una taza', photoUrl: '', thumbnailUrl: null,
          submittedAt: new Date().toISOString(), status: 'accepted',
          countedForStreak: true, wasLate: false,
        },
      },
    },
    { label: 'reviewing', value: { kind: 'reviewing', challengeDate: today(), objectDisplayName: 'una taza', submissionId: 'preview' } },
    { label: 'missed', value: { kind: 'missed', challengeDate: today(), objectDisplayName: 'una taza', canSubmitLate: true } },
  ];

  return (
    <View style={[styles.wrap, { borderColor: theme.color.border }]}>
      <Text variant="caption" tone="tertiary">HARNESS DE DISEÑO · sólo desarrollo</Text>
      <View style={styles.row}>
        {states.map(s => (
          <Pressable
            key={s.label}
            onPress={() => onSelectState(s.value)}
            style={[styles.chip, { backgroundColor: theme.color.surface, borderColor: theme.color.border }]}
          >
            <Text variant="caption" tone="secondary">{s.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xxxl, paddingTop: space.lg, borderTopWidth: 1, gap: space.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1 },
});
