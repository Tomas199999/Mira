-- =============================================================================
-- Mira — 0020: buscar duplicados por distancia, no por igualdad
--
-- `find_duplicate_photo` comparaba `perceptual_hash = p_hash`. Una huella
-- perceptual casi nunca es idéntica entre dos exportaciones de la misma foto:
-- para eso está, para tolerar recompresión y cambios de tamaño. Con igualdad
-- exacta la función encontraba lo mismo que el sha256 — o sea, nada nuevo — y
-- el dedupe de §8 quedaba en la teoría.
--
-- Lo expuso una verificación con imágenes reales: la misma foto re-exportada a
-- otro tamaño y calidad cambia el sha256 y conserva el dHash salvo unos bits.
-- =============================================================================

-- Distancia de Hamming entre dos huellas de 64 bits.
create or replace function hash_distance(a bytea, b bytea)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select bit_count(
    ('x' || encode(a, 'hex'))::bit(64) # ('x' || encode(b, 'hex'))::bit(64)
  )::integer;
$$;

revoke execute on function hash_distance(bytea, bytea) from public, anon, authenticated;

create or replace function find_duplicate_photo(
  p_hash    bytea,
  p_exclude uuid,
  p_max_distance integer default 8
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id
    from submissions s
   where s.perceptual_hash is not null
     and s.id <> p_exclude
     and s.status in ('accepted', 'in_review')
     and hash_distance(s.perceptual_hash, p_hash) <= p_max_distance
   order by hash_distance(s.perceptual_hash, p_hash)
   limit 1;
$$;

revoke execute on function find_duplicate_photo(bytea, uuid, integer) from public, anon, authenticated;

-- NOTA DE ESCALA: esto recorre las publicaciones vigentes calculando la
-- distancia, o sea O(n). Con decenas de miles alcanza. Más arriba hay que
-- indexar por prefijos de la huella o mover la búsqueda a una estructura
-- pensada para métrica de Hamming. Está anotado en docs/ARCHITECTURE.md.
create index if not exists submissions_phash_recent_idx
  on submissions (challenge_date desc)
  where perceptual_hash is not null and status in ('accepted', 'in_review');
