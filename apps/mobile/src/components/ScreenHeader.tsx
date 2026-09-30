import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { space } from '@/theme';
import { Text } from './Text';

/**
 * Encabezado de pestaña: título grande a la izquierda, una acción a la
 * derecha si hace falta, y opcionalmente una línea de contexto debajo.
 */
export function ScreenHeader({ title, eyebrow, right }: { title: string; eyebrow?: string; right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={styles.titles}>
        {eyebrow ? <Text variant="overline" tone="tertiary">{eyebrow}</Text> : null}
        <Text variant="title">{title}</Text>
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md, marginBottom: space.lg },
  titles: { gap: 2, flex: 1 },
});
