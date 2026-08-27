import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { ReactionType } from '@mira/shared';
import type { FeedEntry } from '@/features/feed/api';
import { react } from '@/features/feed/api';
import { radius, space, useTheme } from '@/theme';
import { StreakBadge } from './StreakBadge';
import { Text } from './Text';

const REACTIONS: Array<{ type: ReactionType; emoji: string }> = [
  { type: 'fire', emoji: '🔥' },
  { type: 'laugh', emoji: '😂' },
  { type: 'clap', emoji: '👏' },
  { type: 'wow', emoji: '😮' },
  { type: 'heart', emoji: '❤️' },
];

/**
 * Una publicación del feed (§21).
 *
 * Sin comentarios y sin "me gusta" con contador visible: el producto es la
 * foto del día, no un hilo. Las reacciones son livianas a propósito.
 */
export function FeedCard({ entry }: { entry: FeedEntry }) {
  const theme = useTheme();
  const [mine, setMine] = useState<ReactionType | null>(entry.reactions.mine);
  const [sending, setSending] = useState(false);

  async function toggle(type: ReactionType) {
    const next = mine === type ? null : type;
    setMine(next);            // optimista: la reacción tiene que sentirse instantánea
    setSending(true);
    try { await react(entry.submission.id, next); }
    catch { setMine(entry.reactions.mine); }   // si falla, se revierte
    finally { setSending(false); }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="label">{entry.author.displayName}</Text>
          <Text variant="caption" tone="tertiary">@{entry.author.username}</Text>
        </View>
        <StreakBadge days={entry.author.currentStreak} />
      </View>

      <Image
        source={{ uri: entry.submission.photoUrl }}
        style={[styles.photo, { backgroundColor: theme.color.surface }]}
        contentFit="cover"
        transition={180}
        accessibilityLabel={entry.submission.objectDisplayName}
      />

      <View style={styles.footer}>
        <Text variant="caption" tone="secondary">
          📅 {entry.submission.objectDisplayName}
          {entry.submission.wasLate ? ' · fuera de hora' : ''}
        </Text>
        <View style={styles.reactions}>
          {REACTIONS.map(({ type, emoji }) => {
            const count = entry.reactions.counts[type] ?? 0;
            const active = mine === type;
            return (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                disabled={sending}
                onPress={() => void toggle(type)}
                style={[
                  styles.reaction,
                  {
                    backgroundColor: active ? theme.color.surfaceRaised : 'transparent',
                    borderColor: active ? theme.color.accent : theme.color.border,
                  },
                ]}
              >
                <Text variant="caption">{emoji}{count > 0 ? ` ${count}` : ''}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1, gap: 2 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg },
  footer: { gap: space.sm },
  reactions: { flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' },
  reaction: {
    paddingVertical: space.xs, paddingHorizontal: space.sm,
    borderRadius: radius.pill, borderWidth: 1,
  },
});
