import type { ExpoConfig } from 'expo/config';

/**
 * Configuración de la app.
 *
 * Los textos de permisos (§51) son los que Apple y Google le muestran al
 * usuario en el diálogo del sistema. Tienen que explicar el uso concreto:
 * un texto genérico es motivo de rechazo en App Store.
 */
const config: ExpoConfig = {
  name: 'Mira',
  slug: 'mira',
  scheme: 'mira',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',

  ios: {
    // TODO(Fase 16): reemplazar por el bundle ID definitivo antes del primer
    // build firmado. Cambiarlo después obliga a crear una app nueva en App Store.
    bundleIdentifier: 'com.miraapp.mira',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription:
        'Mira usa la cámara para que saques la foto del desafío de hoy. Sólo se toma la foto que vos decidís sacar.',
      NSPhotoLibraryAddUsageDescription:
        'Para guardar en tu galería las fotos que subiste a Mira.',
      NSContactsUsageDescription:
        'Para encontrar cuáles de tus contactos ya usan Mira. Enviamos sólo una versión cifrada de los números, nunca los nombres, y no guardamos tu agenda.',
      NSUserTrackingUsageDescription:
        'Mira no rastrea tu actividad en otras apps.',
      ITSAppUsesNonExemptEncryption: false,
    },
    // Sign in with Apple: requisito de Apple si se ofrece login social (§26).
    usesAppleSignIn: true,
  },

  android: {
    package: 'com.miraapp.mira',
    // Sólo lo que se usa de verdad. Cada permiso de más es fricción y riesgo.
    permissions: [
      'android.permission.CAMERA',
      'android.permission.READ_CONTACTS',
      'android.permission.POST_NOTIFICATIONS',
    ],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_MEDIA_IMAGES',
    ],
  },

  plugins: [
    'expo-router',
    'expo-localization',
    'expo-secure-store',
    'expo-font',
    'expo-image',
    'expo-contacts',
    'expo-camera',
    // TODO(marca): cuando existan el logo y el icono definitivos, agregar acá
    // `image` e `imageWidth`, y `android.adaptiveIcon`. Ver docs/BRAND.md.
    ['expo-splash-screen', { backgroundColor: '#0B0B0D' }],
  ],

  experiments: { typedRoutes: true },

  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    env: process.env.EXPO_PUBLIC_ENV ?? 'development',
  },
};

export default config;
