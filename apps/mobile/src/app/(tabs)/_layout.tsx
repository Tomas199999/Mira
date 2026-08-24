import { Tabs } from 'expo-router';
import Feather from '@expo/vector-icons/Feather';
import { space, useTheme } from '@/theme';
import { t } from '@/i18n';

/**
 * Cuatro pestañas y nada más (§39).
 *
 * El brief propone cinco incluyendo Challenge, pero el desafío es una acción
 * puntual del día, no un lugar donde uno vive: convertirlo en pestaña deja una
 * pestaña vacía 23 horas al día. Se abre desde Home y desde la notificación.
 */
export default function TabsLayout() {
  const theme = useTheme();
  const labels = t().tabs;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.textTertiary,
        tabBarStyle: {
          backgroundColor: theme.color.background,
          borderTopColor: theme.color.border,
          paddingTop: space.xs,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: labels.home, tabBarIcon: ({ color, size }) => <Feather name="sun" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="friends"
        options={{ title: labels.friends, tabBarIcon: ({ color, size }) => <Feather name="users" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="rankings"
        options={{ title: labels.rankings, tabBarIcon: ({ color, size }) => <Feather name="bar-chart-2" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: labels.profile, tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
