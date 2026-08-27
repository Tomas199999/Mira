import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { configureForegroundBehaviour, registerForPush } from './push';

/**
 * Conecta las notificaciones con la navegación.
 *
 * Tocar la notificación del desafío tiene que abrir la cámara directamente
 * (§6): si abre la pantalla principal y obliga a un toque más, se pierde la
 * inmediatez que es el punto del producto.
 */
export function useNotifications(enabled: boolean): void {
  const router = useRouter();
  const registered = useRef(false);

  useEffect(() => {
    if (!enabled || registered.current) return;
    registered.current = true;
    configureForegroundBehaviour();
    void registerForPush();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { url?: string } | undefined;
      if (data?.url === 'mira://challenge') router.push('/challenge');
    });

    // Si la app se abrió DESDE la notificación, el listener no dispara: hay que
    // preguntar por la última respuesta explícitamente.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const data = response?.notification.request.content.data as { url?: string } | undefined;
      if (data?.url === 'mira://challenge') router.push('/challenge');
    });

    return () => subscription.remove();
  }, [enabled, router]);
}
