/**
 * Envío a través del servicio de push de Expo.
 *
 * Se aísla detrás de esta interfaz por la misma razón que el proveedor de
 * visión: mañana esto puede ser APNs y FCM directos sin tocar el job.
 */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
/** Expo acepta hasta 100 mensajes por petición. */
const BATCH_SIZE = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  /** Agrupa en el centro de notificaciones y reemplaza la anterior del día. */
  channelId?: string;
}

export interface PushOutcome {
  token: string;
  ok: boolean;
  /** `true` cuando el token está muerto y hay que dejar de usarlo. */
  unregistered: boolean;
  error?: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function sendPush(messages: PushMessage[]): Promise<PushOutcome[]> {
  const outcomes: PushOutcome[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          ...(process.env.EXPO_ACCESS_TOKEN
            ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
            : {}),
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        // Un fallo del lote entero no invalida tokens: el problema es del
        // servicio, no de los dispositivos.
        const detail = `expo responded ${response.status}`;
        for (const message of batch) {
          outcomes.push({ token: message.to, ok: false, unregistered: false, error: detail });
        }
        continue;
      }

      const payload = await response.json() as { data?: ExpoTicket[] };
      const tickets = payload.data ?? [];

      batch.forEach((message, index) => {
        const ticket = tickets[index];
        if (!ticket || ticket.status === 'ok') {
          outcomes.push({ token: message.to, ok: true, unregistered: false });
          return;
        }
        outcomes.push({
          token: message.to,
          ok: false,
          // DeviceNotRegistered es definitivo: el usuario desinstaló la app o
          // revocó el permiso. Reintentar para siempre es tirar cuota.
          unregistered: ticket.details?.error === 'DeviceNotRegistered',
          error: ticket.message ?? ticket.details?.error,
        });
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      for (const message of batch) {
        outcomes.push({ token: message.to, ok: false, unregistered: false, error: detail });
      }
    }
  }

  return outcomes;
}

/**
 * Texto de la notificación del desafío, en el idioma del usuario.
 *
 * No se traduce en el cliente porque la notificación llega con la app cerrada:
 * el texto tiene que viajar ya resuelto.
 */
export function challengeNotification(objectDisplayName: string, locale: string) {
  const copy = {
    es: { title: '🔔 ¡Desafío desbloqueado!', body: (o: string) => `Hoy tenés que fotografiar: 📷 ${o.toUpperCase()}` },
    en: { title: '🔔 Challenge unlocked!', body: (o: string) => `Today you have to photograph: 📷 ${o.toUpperCase()}` },
    pt: { title: '🔔 Desafio liberado!', body: (o: string) => `Hoje você tem que fotografar: 📷 ${o.toUpperCase()}` },
  } as const;

  const lang = (locale in copy ? locale : 'es') as keyof typeof copy;
  return { title: copy[lang].title, body: copy[lang].body(objectDisplayName) };
}
