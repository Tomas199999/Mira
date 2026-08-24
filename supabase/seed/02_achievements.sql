-- =============================================================================
-- Mira — logros iniciales (§38). Arquitectura extensible: agregar un logro es
-- insertar una fila, no tocar código.
-- =============================================================================

insert into achievements (code, display_name, description, icon, sort_order, is_secret) values
  ('first_photo',    'Primera foto',      'Completaste tu primer desafío.',              '🏆',  10, false),
  ('streak_3',       'Tres seguidos',     'Tres días de racha.',                          '🔥',  20, false),
  ('streak_7',       'Una semana',        'Siete días de racha.',                         '🔥',  30, false),
  ('streak_30',      'Un mes',            'Treinta días de racha.',                       '🔥',  40, false),
  ('streak_100',     'Cien días',         'Cien días de racha.',                          '💯',  50, false),
  ('photos_50',      '50 fotos',          'Cincuenta desafíos completados.',              '📸',  60, false),
  ('photos_100',     '100 fotos',         'Cien desafíos completados.',                   '📸',  70, false),
  ('top_100_global', 'Top 100 mundial',   'Entraste al top 100 del ranking mundial.',     '🌎',  80, false),
  ('top_10_country', 'Top 10 nacional',   'Entraste al top 10 de tu país.',               '🏅',  90, false),
  ('first_friend',   'Primer contacto',   'Sumaste tu primer amigo.',                     '👥', 100, false),
  ('friends_10',     'Círculo',           'Diez amigos en Mira.',                         '👥', 110, false),
  ('early_bird',     'Madrugador',        'Completaste un desafío en menos de un minuto.', '⚡', 120, true),
  ('comeback',       'Vuelta',            'Volviste después de perder una racha de 30+.', '💪', 130, true)
on conflict (code) do nothing;
