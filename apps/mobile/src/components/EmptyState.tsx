import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

/**
 * Estado vacío (§58). Todos siguen la misma forma: un símbolo, qué pasa,
 * y — si hay algo que hacer — un solo botón.
 */
export function EmptyState({ icon, title, body, actionLabel, onAction }: {
  icon: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text variant="display" center style={styles.icon}>{icon}</Text>
      <Text variant="heading" center>{title}</Text>
      {body ? <Text variant="body" tone="secondary" center style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.huge, gap: space.sm },
  icon: { marginBottom: space.sm },
  body: { maxWidth: 280, marginTop: space.xs },
  action: { marginTop: space.lg },
});
