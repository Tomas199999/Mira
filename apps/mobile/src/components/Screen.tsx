import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { space, useTheme } from '@/theme';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: ViewStyle;
}

export function Screen({ children, scroll = false, padded = true, style }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const content: ViewStyle = {
    paddingTop: insets.top + space.md,
    paddingBottom: insets.bottom + space.xl,
    paddingHorizontal: padded ? space.lg : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.color.background }]}
        contentContainerStyle={[content, style]}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.color.background }, content, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
