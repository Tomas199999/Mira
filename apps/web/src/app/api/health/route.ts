import { NextResponse } from 'next/server';

/**
 * Health check.
 *
 * Reporta si el despliegue está vivo y si las variables críticas están
 * presentes. Nunca devuelve el valor de un secreto, sólo si existe: este
 * endpoint es público.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    status: 'ok',
    environment: process.env.VERCEL_ENV ?? 'development',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    configured: {
      database: Boolean(process.env.SUPABASE_URL),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      vision: Boolean(process.env.ANTHROPIC_API_KEY),
      cron: Boolean(process.env.CRON_SECRET),
    },
    timestamp: new Date().toISOString(),
  });
}
