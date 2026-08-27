import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { useNotifications } from '@/features/notifications/useNotifications';
import { ThemeProvider, useTheme } from '@/theme';

/**
 * Guard de navegación.
 *
 * Vive acá y no en cada pantalla: una pantalla que se protege sola es una
 * pantalla que alguien va a olvidarse de proteger. `Stack.Protected` monta
 * cada grupo sólo cuando su condición se cumple, así que no hay un instante
 * en que la app dibuje contenido para el que todavía no hay permiso.
 */
function RootNavigator() {
  const theme = useTheme();
  const { state } = useAuth();

  // Se registra recién cuando el usuario tiene perfil: pedir el permiso antes
  // de que entienda para qué sirve es la forma más rápida de que diga que no.
  useNotifications(state.status === 'ready');

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: theme.color.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.color.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.background },
          animation: 'fade',
        }}
      >
        <Stack.Protected guard={state.status === 'signed_out'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>

        <Stack.Protected guard={state.status === 'needs_profile'}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>

        <Stack.Protected guard={state.status === 'ready'}>
          <Stack.Screen name="(tabs)" />
          {/* El desafío no es una pestaña: es una pantalla completa que se abre
              desde Home o desde la notificación. Ver docs/ARCHITECTURE.md. */}
          <Stack.Screen
            name="challenge"
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
