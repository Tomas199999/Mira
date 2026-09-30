import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { getLocales } from 'expo-localization';
import {
  findContactsOnMira, getSocialGraph, respondToRequest, searchUsers, sendRequest,
  type PersonSummary, type SocialGraph,
} from '@/features/friends/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, EmptyState, Icon, Screen, ScreenHeader, Text, TextField } from '@/components';
import { radius, space, useTheme } from '@/theme';
import { t, tp } from '@/i18n';

export default function FriendsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const copy = t().friends;

  const [graph, setGraph] = useState<SocialGraph | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSummary[]>([]);
  const [contactMatches, setContactMatches] = useState<PersonSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setGraph(await getSocialGraph()); }
    catch { /* se conserva lo último conocido */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Búsqueda con retardo: sin esto se dispara una petición por tecla.
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const found = await searchUsers(query.trim());
        if (!cancelled) setResults(found);
      } catch { if (!cancelled) setResults([]); }
    }, 350);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  async function act(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await load(); }
    catch (error) {
      const code = (error as { code?: string }).code;
      Alert.alert(
        t().errors.generic,
        code === 'rate_limited' ? t().errors.rateLimited : t().errors.generic,
      );
    } finally { setBusy(null); }
  }

  async function findContacts() {
    setBusy('contacts');
    try {
      const country = getLocales()[0]?.regionCode ?? 'AR';
      const outcome = await findContactsOnMira(country);
      setContactMatches(outcome.matches);
      if (outcome.matches.length === 0) {
        Alert.alert(copy.noMatchesTitle, copy.noMatchesBody);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      Alert.alert(
        t().errors.generic,
        code === 'contacts_denied' ? t().errors.contactsPermission
        : code === 'rate_limited' ? t().errors.rateLimited
        : t().errors.generic,
      );
    } finally { setBusy(null); }
  }

  if (loading) {
    return <Screen><ActivityIndicator color={theme.color.accent} /></Screen>;
  }

  const incoming = graph?.incoming ?? [];
  const friends = graph?.friends ?? [];
  const showing = query.trim().length >= 2 ? results : contactMatches;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.color.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }}
          tintColor={theme.color.accent} />
      }
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader title={copy.title} />

      <TextField
        label={copy.search}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={[styles.contacts, { backgroundColor: theme.color.surface }]}>
        <View style={[styles.contactsIcon, { backgroundColor: theme.color.accentSoft }]}>
          <Icon name="book" size={18} tone="accent" />
        </View>
        <View style={styles.contactsText}>
          <Text variant="label">{copy.findContacts}</Text>
          <Text variant="caption" tone="tertiary">{copy.contactsPrivacy}</Text>
        </View>
        <Button
          label={copy.findContacts}
          variant="primary"
          onPress={findContacts}
          loading={busy === 'contacts'}
          fullWidth={false}
          icon={<Icon name="search" size={14} tone="onAccent" />}
          iconOnly
        />
      </View>

      {showing ? (
        <Section title={query.trim().length >= 2 ? copy.results : copy.fromContacts}>
          {showing.length === 0 ? (
            <Text variant="caption" tone="tertiary" style={{ padding: space.md }}>{copy.noResults}</Text>
          ) : showing.map((person) => (
            <PersonRow
              key={person.userId}
              person={person}
              busy={busy === person.userId}
              onAdd={() => act(person.userId, () => sendRequest(person.userId))}
            />
          ))}
        </Section>
      ) : null}

      {incoming.length > 0 ? (
        <Section title={`${copy.requests} · ${incoming.length}`}>
          {incoming.map((person) => (
            <PersonRow
              key={person.requestId}
              person={person}
              busy={busy === person.requestId}
              onAccept={() => act(person.requestId, () => respondToRequest(person.requestId, true))}
              onReject={() => act(person.requestId, () => respondToRequest(person.requestId, false))}
            />
          ))}
        </Section>
      ) : null}

      <Section title={tp(t().profile, 'friendCount', friends.length)}>
        {friends.length === 0 ? (
          <EmptyState
            icon="users"
            title={t().empty.noFriendsTitle}
            body={t().empty.noFriendsBody}
          />
        ) : friends.map((person) => (
          <PersonRow key={person.userId} person={person} busy={false} />
        ))}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <Text variant="overline" tone="tertiary" style={{ paddingHorizontal: space.xs }}>{title}</Text>
      <View style={[styles.list, { backgroundColor: theme.color.surface }]}>{children}</View>
    </View>
  );
}

function PersonRow({ person, busy, onAdd, onAccept, onReject }: {
  person: PersonSummary;
  busy: boolean;
  onAdd?: () => void;
  onAccept?: () => void;
  onReject?: () => void;
}) {
  const theme = useTheme();
  const copy = t().friends;

  return (
    <View style={[styles.row, { borderColor: theme.color.border }]}>
      <Avatar name={person.displayName || person.username} size={40} />
      <View style={styles.rowText}>
        <Text variant="label">{person.displayName}</Text>
        <Text variant="caption" tone="tertiary">@{person.username}</Text>
      </View>

      {busy ? <ActivityIndicator color={theme.color.accent} />
        : onAccept ? (
          <View style={styles.rowActions}>
            <Pressable onPress={onAccept} style={[styles.pill, { backgroundColor: theme.color.accent }]}>
              <Text variant="caption" tone="onAccent">{copy.accept}</Text>
            </Pressable>
            <Pressable onPress={onReject} style={[styles.pill, { borderColor: theme.color.border, borderWidth: 1 }]}>
              <Text variant="caption" tone="secondary">{copy.reject}</Text>
            </Pressable>
          </View>
        ) : person.relationship === 'friends' ? (
          person.currentStreak ? (
            <View style={styles.streak}>
              <Text variant="label" tone="streak">{person.currentStreak}</Text>
              <Icon name="zap" size={13} tone="streak" />
            </View>
          ) : <Icon name="check" size={16} tone="tertiary" />
        ) : person.relationship === 'pending_sent' ? (
          <Text variant="caption" tone="tertiary">{copy.pending}</Text>
        ) : onAdd ? (
          <Pressable onPress={onAdd} style={[styles.pill, { backgroundColor: theme.color.accent }]}>
            <Text variant="caption" tone="onAccent">{copy.add}</Text>
          </Pressable>
        ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.huge, gap: space.md },
  contacts: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg },
  contactsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  contactsText: { flex: 1, gap: 2 },
  section: { gap: space.sm, marginTop: space.sm },
  list: { borderRadius: radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    paddingVertical: space.sm + 2, paddingHorizontal: space.md, borderBottomWidth: 1,
  },
  rowText: { flex: 1, gap: 1 },
  rowActions: { flexDirection: 'row', gap: space.sm },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pill: { paddingVertical: 6, paddingHorizontal: space.md, borderRadius: radius.pill },
});
