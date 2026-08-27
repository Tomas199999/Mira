import type { NextRequest } from 'next/server';
import { isCronRequest } from '@/server/auth';
import { adminClient } from '@/server/supabase';
import { challengeNotification, sendPush, type PushMessage } from '@/server/notifications/expo-push';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface DueRow {
  window_id: string; user_id: string; token: string;
  platform: 'ios' | 'android'; locale: string;
  object_display: string; closes_at: string;
}

/**
 * Cron cada pocos minutos: avisa a quienes les acaba de abrir la ventana.
 *
 * `claim_due_challenge_notifications` devuelve y marca en la misma operación,
 * así que dos corridas solapadas no pueden tomar la misma ventana, y un fallo
 * después de reservar pierde una notificación en vez de repetirla seis veces.
 * Es preferible perder una que mandar seis.
 */
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return fail('forbidden', 'invalid cron secret');

  const db = adminClient();

  try {
    const { data, error } = await db.rpc('claim_due_challenge_notifications', { p_limit: 500 });
    if (error) throw new Error(error.message);

    const due = (data ?? []) as DueRow[];
    if (due.length === 0) return ok({ sent: 0, failed: 0, unregistered: 0 });

    const messages: PushMessage[] = due.map((row) => {
      const copy = challengeNotification(row.object_display, row.locale);
      return {
        to: row.token,
        title: copy.title,
        body: copy.body,
        sound: 'default',
        channelId: 'daily-challenge',
        // El enlace profundo abre directamente el desafío (§6, §52).
        data: { url: 'mira://challenge', windowId: row.window_id, closesAt: row.closes_at },
      };
    });

    const outcomes = await sendPush(messages);

    // Los tokens muertos se apagan; los que fallan por otra causa acumulan.
    await Promise.all(outcomes
      .filter((o) => !o.ok)
      .map((o) => o.unregistered
        ? db.rpc('invalidate_push_token', { p_token: o.token })
        : db.rpc('record_push_failure', { p_token: o.token })));

    // Copia en la bandeja in-app, para quien tenga las notificaciones apagadas
    // en el sistema pero igual abra la app.
    await Promise.all(due.map((row) => {
      const copy = challengeNotification(row.object_display, row.locale);
      return db.rpc('push_notification_record', {
        p_user_id: row.user_id, p_kind: 'daily_challenge',
        p_title: copy.title, p_body: copy.body,
        p_data: { windowId: row.window_id },
      });
    }));

    const sent = outcomes.filter((o) => o.ok).length;
    return ok({
      sent,
      failed: outcomes.length - sent,
      unregistered: outcomes.filter((o) => o.unregistered).length,
    });
  } catch (error) {
    return failFromError(error);
  }
}
