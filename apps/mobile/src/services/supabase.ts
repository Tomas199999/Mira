import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { AppState } from 'react-native';
import { secureStorage } from './secure-storage';

const extra = Constants.expoConfig?.extra ?? {};
const url = (extra.supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL) as string | undefined;
const anonKey = (extra.supabaseAnonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) as string | undefined;

if (!url || !anonKey) {
  // Falla acá y no en el primer request: un error de configuración tiene que
  // ser obvio al arrancar, no una pantalla en blanco a mitad del onboarding.
  throw new Error(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY. Ver docs/ENVIRONMENT.md.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En móvil no hay URL que parsear: el callback llega por deep link.
    detectSessionInUrl: false,
    // PKCE es el flujo correcto para clientes públicos: el código de
    // autorización no sirve sin el verificador que quedó en el dispositivo.
    flowType: 'pkce',
  },
});

/**
 * Supabase refresca el token con un temporizador, y iOS congela los
 * temporizadores en segundo plano. Sin esto, volver a la app después de un rato
 * deja al usuario con un token vencido hasta el próximo ciclo.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
