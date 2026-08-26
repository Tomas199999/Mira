import { useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, Text } from '@/components';
import { radius, space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Las cuatro pantallas que explican el producto (§27).
 *
 * Ningún permiso se pide acá: primero se entiende para qué sirve la app, y
 * recién después se piden permisos, de a uno y con contexto.
 */
export default function IntroScreen() {
  const router = useRouter();
  const theme = useTheme();
  const copy = t().onboarding;
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const width = Dimensions.get('window').width;

  const slides = [
    { icon: '⏳', title: copy.slide1Title, body: copy.slide1Body },
    { icon: '📸', title: copy.slide2Title, body: copy.slide2Body },
    { icon: '🔥', title: copy.slide3Title, body: copy.slide3Body },
    { icon: '🏅', title: copy.slide4Title, body: copy.slide4Body },
  ];
  const last = page === slides.length - 1;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  }

  function advance() {
    if (last) { router.push('/(onboarding)/profile'); return; }
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
  }

  return (
    <Screen padded={false}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.flex}
      >
        {slides.map((slide) => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <Text variant="display" center>{slide.icon}</Text>
            <Text variant="title" center>{slide.title}</Text>
            <Text variant="body" tone="secondary" center style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((slide, i) => (
            <View
              key={slide.title}
              style={[
                styles.dot,
                { backgroundColor: i === page ? theme.color.accent : theme.color.border },
              ]}
            />
          ))}
        </View>
        <Button label={last ? copy.start : t().common.continue} onPress={advance} size="lg" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, paddingHorizontal: space.xl },
  body: { maxWidth: 300 },
  footer: { paddingHorizontal: space.lg, gap: space.xl, paddingBottom: space.md },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  dot: { width: 7, height: 7, borderRadius: radius.pill },
});
