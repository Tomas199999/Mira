import { EmptyState, Screen, Text } from '@/components';
import { t } from '@/i18n';
import { space } from '@/theme';

export default function FriendsScreen() {
  return (
    <Screen scroll>
      <Text variant="title" style={{ marginBottom: space.lg }}>{t().friends.title}</Text>
      <EmptyState
        icon="👥"
        title={t().empty.noFriendsTitle}
        body={t().empty.noFriendsBody}
        actionLabel={t().empty.noFriendsAction}
        onAction={() => {
          // Fase 6: pedir permiso de contactos, hashear y matchear.
          // Ver docs/SECURITY.md § Contactos.
        }}
      />
    </Screen>
  );
}
