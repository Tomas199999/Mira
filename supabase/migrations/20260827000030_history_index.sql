-- =============================================================================
-- Mira — 0030: índice utilizable para el historial
--
-- `submissions_user_history_idx` es parcial sobre `status = 'accepted'`, pero
-- `get_history_month()` filtra `status in ('accepted','in_review')`. Postgres
-- no puede demostrar que el segundo predicado implica el primero, así que el
-- índice queda inutilizable y la consulta termina recorriendo la tabla entera.
--
-- Con 60.000 publicaciones eso medía 1.133 ms para una pantalla que el usuario
-- abre desde su perfil. Lo detectó una medición con volumen real: con la base
-- vacía cualquier plan parece rápido.
--
-- El índice nuevo no lleva predicado, así que sirve para el historial, para el
-- chequeo de "ya subió hoy" de start_submission y para get_my_submission.
-- =============================================================================

create index if not exists submissions_user_date_idx
  on submissions (user_id, challenge_date desc);

-- El parcial deja de aportar: lo que cubría ahora lo cubre el nuevo, y un
-- índice de más es escritura de más en cada publicación.
drop index if exists submissions_user_history_idx;

analyze submissions;
