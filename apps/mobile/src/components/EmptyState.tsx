import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * Estado vacío (§58). Todos siguen la misma forma: un icono en su disco, qué
 * pasa, y — si hay algo que hacer — un solo botón. Compacto: un vacío no
 * tiene que ocupar más pantalla que el contenido que reemplaza.
 */
export function EmptyState({ icon, title, body, actionLabel, onAction }: {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={20} tone="tertiary" />
      <Text variant="label" center>{title}</Text>
      {body ? <Text variant="caption" tone="tertiary" center style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center', justifyContent: 'center', gap: space.xs,
    paddingVertical: space.xl, paddingHorizontal: space.lg,
  },
  body: { maxWidth: 260 },
  action: { marginTop: space.md },
});
