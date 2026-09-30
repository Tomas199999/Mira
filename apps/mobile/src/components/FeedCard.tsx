import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { ReactionType } from '@mira/shared';
import type { FeedEntry } from '@/features/feed/api';
import { react } from '@/features/feed/api';
import { t } from '@/i18n';
import { timeAgo } from '@/i18n/time';
import { fonts, radius, space, useTheme } from '@/theme';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
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
 * La foto ocupa el ancho entero y manda; el resto es una línea arriba (quién,
 * cuándo) y una abajo (qué, reacciones). Sin comentarios y sin contadores
 * grandes: el producto es la foto del día, no un hilo.
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

  const streak = entry.author.currentStreak;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Avatar name={entry.author.displayName || entry.author.username} size={36} />
        <View style={styles.headerText}>
          <Text variant="label">{entry.author.displayName}</Text>
          <Text variant="caption" tone="tertiary">
            @{entry.author.username} · {timeAgo(entry.submission.submittedAt)}
          </Text>
        </View>
        {streak > 0 ? (
          <View style={[styles.streak, { backgroundColor: theme.color.streakSoft }]}>
            <Text style={{ fontFamily: fonts.displayBold, fontSize: 13, lineHeight: 16, color: theme.color.streak }}>
              {streak}
            </Text>
            <Icon name="zap" size={12} tone="streak" />
          </View>
        ) : null}
      </View>

      <View style={[styles.photoWrap, { backgroundColor: theme.color.surface }]}>
        <Image
          source={{ uri: entry.submission.photoUrl }}
          style={styles.photo}
          contentFit="cover"
          transition={180}
          accessibilityLabel={entry.submission.objectDisplayName}
        />
        <View style={[styles.objectTag, { backgroundColor: theme.color.scrim }]}>
          <Icon name="target" size={12} color="#fff" />
          <Text variant="caption" style={styles.objectText}>
            {entry.submission.objectDisplayName}{entry.submission.wasLate ? ` · ${t().streak.late}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.reactions}>
        {REACTIONS.map(({ type, emoji }) => {
          const base = entry.reactions.counts[type] ?? 0;
          const count = base + (mine === type && entry.reactions.mine !== type ? 1 : 0)
            - (mine !== type && entry.reactions.mine === type ? 1 : 0);
          const active = mine === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              disabled={sending}
              onPress={() => void toggle(type)}
              style={({ pressed }) => [
                styles.reaction,
                {
                  backgroundColor: active ? theme.color.accentSoft : theme.color.surface,
                  borderColor: active ? theme.color.accent : 'transparent',
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text variant="caption">{emoji}</Text>
              {count > 0 ? (
                <Text variant="caption" tone={active ? 'accent' : 'secondary'} style={styles.count}>{count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs },
  headerText: { flex: 1, gap: 1 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill },
  photoWrap: { borderRadius: radius.xl, overflow: 'hidden' },
  photo: { width: '100%', aspectRatio: 4 / 5 },
  objectTag: {
    position: 'absolute', left: space.md, bottom: space.md,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill,
  },
  objectText: { color: '#fff' },
  reactions: { flexDirection: 'row', gap: space.xs, paddingHorizontal: space.xs },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1,
  },
  count: { fontVariant: ['tabular-nums'] },
});
