import { StyleSheet, View } from 'react-native';
import { space, useTheme } from '@/theme';
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
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { borderColor: theme.color.border }]}>
      <View style={[styles.disc, { backgroundColor: theme.color.accentSoft }]}>
        <Icon name={icon} size={22} tone="accent" />
      </View>
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
  wrap: {
    alignItems: 'center', justifyContent: 'center', gap: space.sm,
    paddingVertical: space.xxl, paddingHorizontal: space.lg,
    borderWidth: 1, borderStyle: 'dashed', borderRadius: 20,
  },
  disc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  body: { maxWidth: 280 },
  action: { marginTop: space.md },
});
