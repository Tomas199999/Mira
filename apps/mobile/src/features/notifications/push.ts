import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '@/services/supabase';

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

/**
 * Registro para notificaciones push.
 *
 * Sólo funciona en un dispositivo real con development build: el simulador no
 * tiene APNs y Expo Go no puede registrar tokens propios de la app. Si falla,
 * devuelve null y la app sigue funcionando — sin notificaciones el producto es
 * peor, pero no está roto.
 */

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  // Sólo se pide si no se decidió antes: volver a preguntar tras un "no" es
  // molesto y en iOS ni siquiera muestra el diálogo.
  if (status === 'undetermined') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    // El canal define cómo se ve y suena; sin declararlo, Android agrupa todo
    // en el canal por defecto y el usuario no puede silenciar sólo una parte.
    await Notifications.setNotificationChannelAsync('daily-challenge', {
      name: 'Desafío diario',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined);
    await sendToBackend(token);
    return token;
  } catch (error) {
    // Sin projectId de EAS o sin credenciales de APNs esto falla, y es lo
    // esperable hasta que exista el development build.
    console.warn('[push] no se pudo obtener el token', error);
    return null;
  }
}

async function sendToBackend(token: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const access = data.session?.access_token;
  if (!access) return;

  await fetch(`${API_BASE}/api/push/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? null,
    }),
  }).catch(() => { /* se reintenta en el próximo arranque */ });
}

/** Cómo se muestra una notificación con la app en primer plano. */
export function configureForegroundBehaviour(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
