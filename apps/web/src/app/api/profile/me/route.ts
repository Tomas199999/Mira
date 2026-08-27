import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

/** GET /api/profile/me — perfil, ajustes, estadísticas y posiciones (§19, §37). */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  try {
    const [profile, settings, stats] = await Promise.all([
      auth.db.from('profiles')
        .select('id, username, display_name, avatar_path, bio, country_code, current_streak, best_streak, total_completed')
        .eq('id', auth.userId).single(),
      auth.db.from('user_settings').select('*').eq('user_id', auth.userId).single(),
      auth.db.rpc('get_my_stats'),
    ]);
    if (profile.error) throw new Error(profile.error.message);

    // Las posiciones se piden en paralelo y son opcionales: si el usuario no
    // participa de los rankings públicos, simplemente vienen nulas.
    const [globalRank, countryRank] = await Promise.all([
      auth.db.rpc('get_my_rank', { p_scope: 'global', p_scope_key: '' }),
      auth.db.rpc('get_my_rank', { p_scope: 'country', p_scope_key: profile.data.country_code ?? '' }),
    ]);

    return ok({
      profile: {
        id: profile.data.id,
        username: profile.data.username,
        displayName: profile.data.display_name,
        avatarUrl: null,
        bio: profile.data.bio,
        countryCode: profile.data.country_code,
        currentStreak: profile.data.current_streak,
        bestStreak: profile.data.best_streak,
        totalCompleted: profile.data.total_completed,
      },
      settings: settings.data ?? null,
      stats: stats.data ?? null,
      ranks: {
        global: (globalRank.data as { rank: number | null } | null)?.rank ?? null,
        country: (countryRank.data as { rank: number | null } | null)?.rank ?? null,
      },
    });
  } catch (error) {
    return failFromError(error);
  }
}
