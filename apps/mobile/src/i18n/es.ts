/** Español — idioma base. Todo texto de la app sale de acá, nunca inline (§44). */
export const es = {
  tabs: { home: 'Hoy', friends: 'Amigos', rankings: 'Ranking', profile: 'Perfil' },

  home: {
    lockedTitle: 'Hoy va a pasar algo',
    lockedBody: 'En algún momento del día te vamos a avisar qué tenés que fotografiar.',
    openTitle: 'Desafío de hoy',
    photograph: 'Fotografiá',
    openCamera: 'Abrir cámara',
    timeLeft: 'Tiempo restante',
    completedTitle: 'Desafío completado',
    yourPhoto: 'Tu foto de hoy',
    reviewingTitle: 'Estamos revisando tu foto',
    reviewingBody: 'Tu racha está a salvo mientras la revisamos.',
    missedTitle: 'El desafío de hoy terminó',
    missedBody: 'Mañana hay otro. Activá las notificaciones para no perdértelo.',
    seeFriends: 'Ver a tus amigos',
    friendsToday: 'Hoy',
  },

  streak: {
    days_one: '{{count}} día',
    days_other: '{{count}} días',
    best: 'Mejor racha',
    protected: 'Racha protegida',
    protectionsLeft: 'Protectores: {{count}}',
  },

  rankings: {
    global: 'Mundial',
    country: 'Nacional',
    friends: 'Amigos',
    yourPosition: 'Tu posición',
    notParticipating: 'No estás apareciendo en este ranking',
    enable: 'Aparecer en el ranking',
    updatedAt: 'Actualizado {{time}}',
  },

  friends: {
    title: 'Amigos',
    requests: 'Solicitudes',
    findContacts: 'Encontrar contactos',
    search: 'Buscar por nombre de usuario',
    add: 'Agregar',
    pending: 'Pendiente',
    accept: 'Aceptar',
    reject: 'Rechazar',
    remove: 'Eliminar',
    block: 'Bloquear',
  },

  profile: {
    completed: 'Desafíos completados',
    myStory: 'Mi historia',
    achievements: 'Logros',
    settings: 'Ajustes',
    friendCount_one: '{{count}} amigo',
    friendCount_other: '{{count}} amigos',
    signOut: 'Cerrar sesión',
  },

  empty: {
    noFriendsTitle: 'Todavía no tenés amigos acá',
    noFriendsBody: 'Mira se pone bueno cuando ves qué fotografiaron los demás.',
    noFriendsAction: 'Buscar contactos',
    noPhotosTitle: 'Tu historia empieza mañana',
    noPhotosBody: 'Cada foto que subas queda guardada acá.',
    noRankingTitle: 'Sin posiciones todavía',
    noRankingBody: 'Completá tu primer desafío para entrar al ranking.',
    noRequestsTitle: 'No tenés solicitudes',
  },

  /**
   * Mensajes de error (§58). Ninguno menciona códigos ni detalles técnicos:
   * dicen qué pasó y qué hacer.
   */
  auth: {
    welcomeTitle: 'Entrá a Mira',
    welcomeBody: 'Un desafío por día. Nada más.',
    email: 'Email',
    password: 'Contraseña',
    passwordHint: 'Mínimo 8 caracteres',
    signIn: 'Iniciar sesión',
    signUp: 'Crear cuenta',
    continueWithApple: 'Continuar con Apple',
    continueWithGoogle: 'Continuar con Google',
    noAccount: '¿No tenés cuenta? Creá una',
    hasAccount: '¿Ya tenés cuenta? Iniciá sesión',
    forgotPassword: '¿Olvidaste tu contraseña?',
    resetSent: 'Si ese email tiene cuenta, te mandamos las instrucciones.',
    checkEmail: 'Revisá tu email',
    checkEmailBody: 'Te mandamos un link para confirmar tu cuenta.',
    or: 'o',
  },

  onboarding: {
    slide1Title: 'Todos los días pasa algo',
    slide1Body: 'A una hora distinta cada día.',
    slide2Title: 'Recibí un desafío inesperado',
    slide2Body: 'Un objeto cualquiera. No sabés cuál hasta que te toca.',
    slide3Title: 'Sacá una foto y mantené tu racha',
    slide3Body: 'Una sola oportunidad por día.',
    slide4Title: 'Competí con tus amigos',
    slide4Body: 'Y con todo el mundo, si querés.',
    start: 'Empezar',
    skip: 'Saltear',

    profileTitle: 'Creá tu perfil',
    profileBody: 'Así te van a encontrar tus amigos.',
    name: 'Tu nombre',
    username: 'Nombre de usuario',
    usernameHint: 'Entre 3 y 20 caracteres: letras, números, punto y guion bajo',
    usernameAvailable: 'Disponible',
    usernameTaken: 'Ya está tomado',
    birthDate: 'Fecha de nacimiento',
    birthDateHint: 'No se muestra a nadie. La usamos para proteger a los más chicos.',
    country: 'País',
    createProfile: 'Crear perfil',

    permissionsTitle: 'Tres permisos, y listo',
    permissionsBody: 'Te explicamos para qué sirve cada uno. Podés decir que no.',
    cameraTitle: 'Cámara',
    cameraBody: 'Para sacar la foto del desafío. Sólo se toma la que vos decidís sacar.',
    notificationsTitle: 'Notificaciones',
    notificationsBody: 'Es cómo te enterás del desafío del día. Sin esto no vas a saber cuándo te toca.',
    contactsTitle: 'Contactos',
    contactsBody: 'Para encontrar cuáles de tus contactos ya usan Mira. Mandamos sólo una versión cifrada de los números, nunca los nombres, y no guardamos tu agenda.',
    allow: 'Permitir',
    allowed: 'Listo',
    later: 'Más tarde',
    finish: 'Entrar a Mira',
  },

  settings: {
    account: 'Cuenta',
    legal: 'Legal',
    privacyPolicy: 'Política de privacidad',
    terms: 'Términos y condiciones',
    guidelines: 'Normas de la comunidad',
    legalPending: 'Los documentos legales se publican antes del lanzamiento.',
    deleteAccount: 'Eliminar mi cuenta',
    deleteConfirmBody: 'Se eliminan tus fotos, tu racha y tu perfil. No se puede deshacer.',
    deleteConfirmLabel: 'Escribí tu nombre de usuario para confirmar',
    deletionRequested: 'Pedimos la baja de tu cuenta. Te queda un período de gracia por si te arrepentís.',
  },

  errors: {
    offline: 'Parece que no tenés internet. Revisá tu conexión e intentá de nuevo.',
    uploadFailed: 'No pudimos subir tu foto. Revisá tu conexión e intentá nuevamente.',
    visionUnavailable: 'No pudimos analizar tu foto ahora mismo. La guardamos y la revisamos en un rato — tu racha está a salvo.',
    challengeClosed: 'El desafío de hoy ya terminó.',
    alreadyCompleted: 'Ya completaste el desafío de hoy.',
    attemptsExhausted: 'Se te acabaron los intentos por hoy.',
    cameraPermission: 'Mira necesita la cámara para el desafío. Podés activarla desde Ajustes.',
    contactsPermission: 'Necesitamos permiso para buscar entre tus contactos. Podés activarlo desde Ajustes.',
    notificationsOff: 'Sin notificaciones no vas a enterarte del desafío del día.',
    rateLimited: 'Estás yendo muy rápido. Probá de nuevo en un rato.',
    sessionExpired: 'Tu sesión venció. Iniciá sesión de nuevo.',
    usernameTaken: 'Ese nombre de usuario ya está tomado.',
    usernameInvalid: 'Ese nombre de usuario no se puede usar. Probá con otro.',
    ageRestricted: 'No cumplís con la edad mínima para usar Mira.',
    invalidCredentials: 'Email o contraseña incorrectos.',
    passwordTooShort: 'La contraseña tiene que tener al menos 8 caracteres.',
    emailInvalid: 'Ese email no parece válido.',
    fieldRequired: 'Completá este campo.',
    generic: 'Algo salió mal. Intentá de nuevo en un momento.',
  },

  common: {
    retry: 'Reintentar',
    cancel: 'Cancelar',
    continue: 'Continuar',
    done: 'Listo',
    settings: 'Ajustes',
    loading: 'Cargando…',
  },
};

/**
 * El diccionario base NO lleva `as const` a propósito: con literales fijos
 * ninguna traducción podría asignarse a `Translations`. Lo que queremos que
 * comparta es la ESTRUCTURA, no los textos.
 */
export type Translations = typeof es;
