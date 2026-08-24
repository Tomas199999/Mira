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
