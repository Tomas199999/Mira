import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import type { ChallengeState } from '@mira/shared';
import { supabase } from '@/services/supabase';

const API_BASE = (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined)
  ?? process.env.EXPO_PUBLIC_API_BASE_URL
  ?? '';

/**
 * Estado del desafío de hoy, tal como lo decide el servidor.
 *
 * La app no calcula si la ventana está abierta ni compara fechas: el reloj del
 * teléfono se puede cambiar. Pregunta y dibuja (§61).
 */
export function useChallengeState() {
  const [state, setState] = useState<ChallengeState>({ kind: 'none' });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) { setState({ kind: 'none' }); return; }

      const response = await fetch(`${API_BASE}/api/challenge`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (payload?.ok) setState(payload.data as ChallengeState);
      else setFailed(true);
    } catch {
      // Sin red se conserva el último estado conocido en vez de vaciar la
      // pantalla: es más útil ver el desafío de hoy desactualizado que nada.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { state, loading, failed, reload: load, setPreviewState: setState };
}
