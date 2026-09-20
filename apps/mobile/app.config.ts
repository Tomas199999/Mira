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
  // Proyecto en EAS (@tomas1111111/mira). No es secreto; lo escribiría
  // `eas init` si el config fuera estático.
  owner: 'tomas1111111',
  scheme: 'mira',
  version: '0.1.0',
  orientation: 'portrait',
  // Oscura siempre, como una app de cámara. Ver theme/ThemeProvider.tsx.
  userInterfaceStyle: 'dark',

  ios: {
    // com.miraapp.mira ya estaba registrado por otro equipo en Apple. Este es
    // el definitivo: cambiarlo después de crear la app en App Store Connect
    // obliga a crear una app nueva.
    bundleIdentifier: 'com.tomaspace.mira',
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
    package: 'com.tomaspace.mira',
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
    'expo-notifications',
    'expo-contacts',
    'expo-camera',
    // Development build: sin esto no hay App Attest, Play Integrity ni push.
    'expo-dev-client',
    // TODO(marca): cuando existan el logo y el icono definitivos, agregar acá
    // `image` e `imageWidth`, y `android.adaptiveIcon`. Ver docs/BRAND.md.
    ['expo-splash-screen', { backgroundColor: '#0C1112' }],
  ],

  experiments: { typedRoutes: true },

  extra: {
    // Sin esto, getExpoPushTokenAsync no sabe a qué proyecto pertenece el
    // token y el registro de push falla en silencio.
    eas: { projectId: 'a4f849c1-ab09-413e-acb6-7415f0b34039' },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
    env: process.env.EXPO_PUBLIC_ENV ?? 'development',
  },
};

export default config;
