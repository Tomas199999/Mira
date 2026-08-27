import { adminClient } from './supabase';

/**
 * Límites por acción (§35). Los valores vienen de app_config, así que se pueden
 * ajustar sin publicar una versión.
 */
export interface RateLimitVerdict {
  allowed: boolean;
  retryAfter: number;
}

const DAY = 86400;
const HOUR = 3600;

const RULES = {
  uploads:        { key: 'rate_limit_uploads_per_day',      window: DAY,  fallback: 5 },
  friendRequests: { key: 'rate_limit_friend_requests_hour', window: HOUR, fallback: 20 },
  reports:        { key: 'rate_limit_reports_per_day',      window: DAY,  fallback: 20 },
  contactSync:    { key: 'rate_limit_contact_sync_per_day', window: DAY,  fallback: 3 },
} as const;

export type RateLimitAction = keyof typeof RULES;

export async function consume(
  action: RateLimitAction,
  userId: string,
): Promise<RateLimitVerdict> {
  const rule = RULES[action];
  const db = adminClient();

  const { data: config } = await db
    .from('app_config').select('value').eq('key', rule.key).maybeSingle();
  const limit = Number(config?.value ?? rule.fallback) || rule.fallback;

  const { data, error } = await db.rpc('consume_rate_limit', {
    p_bucket: `${action}:${userId}`,
    p_limit: limit,
    p_window_seconds: rule.window,
  });

  // Un límite roto se deja pasar para no tirar abajo la funcionalidad, PERO se
  // registra fuerte. Este mismo bloque tapó durante horas que el limitador
  // entero estaba caído por una ambigüedad de nombres en plpgsql: fallar en
  // silencio es lo peor que puede hacer un rate limiter.
  if (error || !data) {
    console.error('[rate-limit] el limitador no respondió — se deja pasar', {
      action, bucket: `${action}:${userId}`, error: error?.message,
    });
    return { allowed: true, retryAfter: 0 };
  }

  const verdict = data as { allowed: boolean; retry_after: number };
  return { allowed: verdict.allowed, retryAfter: verdict.retry_after };
}
