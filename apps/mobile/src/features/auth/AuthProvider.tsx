import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { hasProfile } from './api';

/**
 * Estado de sesión de la app.
 *
 * Son tres estados, no dos. Tener sesión no alcanza: Apple y Google devuelven
 * un usuario sin username, sin país y sin fecha de nacimiento, así que hace
 * falta una etapa intermedia obligatoria. Si el guard mirara sólo "hay sesión",
 * se colaría gente sin perfil a la app y a la base.
 */
export type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'needs_profile'; session: Session }
  | { status: 'ready'; session: Session };

interface AuthContextValue {
  state: AuthState;
  /** Se llama al terminar el alta de perfil, para pasar a 'ready'. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  state: { status: 'loading' },
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // Evita que una resolución lenta pise a una más nueva: si el usuario cierra
  // sesión mientras se consultaba su perfil, gana el cierre de sesión.
  const generation = useRef(0);

  const resolve = useCallback(async (session: Session | null) => {
    const mine = ++generation.current;

    if (!session) {
      if (mine === generation.current) setState({ status: 'signed_out' });
      return;
    }

    try {
      const complete = await hasProfile(session.user.id);
      if (mine !== generation.current) return;
      setState(complete ? { status: 'ready', session } : { status: 'needs_profile', session });
    } catch {
      // Si no se pudo averiguar, se asume perfil incompleto. Mandar a alguien
      // al onboarding por error es molesto; dejar entrar a alguien sin perfil
      // rompe consultas en toda la app.
      if (mine === generation.current) setState({ status: 'needs_profile', session });
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolve(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) void resolve(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [resolve]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await resolve(data.session);
  }, [resolve]);

  const value = useMemo(() => ({ state, refresh }), [state, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

/** Atajo para pantallas que ya están detrás del guard. */
export function useSession(): Session {
  const { state } = useAuth();
  if (state.status !== 'ready' && state.status !== 'needs_profile') {
    throw new Error('useSession se llamó fuera de una pantalla autenticada');
  }
  return state.session;
}
