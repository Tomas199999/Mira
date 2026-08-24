#!/usr/bin/env node
/**
 * Mira — verificación del esquema y de las políticas de RLS.
 *
 * Levanta un Postgres embebido, aplica el shim de Supabase, corre TODAS las
 * migraciones y el seed, y después ejecuta aserciones de seguridad reales
 * conectándose como usuarios distintos.
 *
 * Esto es lo que responde las preguntas de la auditoría de §84:
 *   ¿Puede un usuario modificar su racha? ¿Subir más de una foto por día?
 *   ¿Acceder a fotos privadas? ¿Ver el desafío antes de tiempo?
 *
 *   npm run verify:schema
 */
import EmbeddedPostgres from 'embedded-postgres';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.pgdata-verify');
const PORT = 54999;

const pass = [];
const fail = [];

function check(name, condition, detail = '') {
  if (condition) pass.push(name);
  else fail.push(`${name}${detail ? ` — ${detail}` : ''}`);
}

/** Ejecuta `fn` y devuelve el error de Postgres, o null si no hubo. */
async function expectError(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

/** Corre una consulta haciéndose pasar por un usuario autenticado. */
async function asUser(client, userId, fn) {
  await client.query('begin');
  try {
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await fn();
  } finally {
    await client.query('rollback');
  }
}

async function main() {
  rmSync(DATA_DIR, { recursive: true, force: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
  });

  console.log('· inicializando cluster…');
  await pg.initialise();
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();

  try {
    // ---- shim + migraciones + seed -----------------------------------------
    console.log('· aplicando shim de Supabase…');
    await client.query(readFileSync(join(ROOT, 'supabase/test/00_supabase_shim.sql'), 'utf8'));

    const migrations = readdirSync(join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
    for (const file of migrations) {
      process.stdout.write(`· migración ${file} … `);
      await client.query(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8'));
      console.log('ok');
    }
    check('todas las migraciones aplican sin error', true);

    const seeds = readdirSync(join(ROOT, 'supabase/seed')).filter(f => f.endsWith('.sql')).sort();
    for (const file of seeds) {
      process.stdout.write(`· seed ${file} … `);
      await client.query(readFileSync(join(ROOT, 'supabase/seed', file), 'utf8'));
      console.log('ok');
    }

    const { rows: [objects] } = await client.query(
      "select count(*)::int as n from challenge_objects where status = 'approved'");
    check('el catálogo tiene al menos 40 objetos aprobados', objects.n >= 40, `hay ${objects.n}`);

    // ---- datos de prueba ----------------------------------------------------
    console.log('\n· creando usuarios de prueba…');
    const mkUser = async (username, birth, country) => {
      const { rows: [u] } = await client.query(
        'insert into auth.users (email) values ($1) returning id', [`${username}@test.local`]);
      await client.query(
        `insert into profiles (id, username, display_name, country_code)
         values ($1, $2, $3, $4)`, [u.id, username, username, country]);
      await client.query(
        'insert into user_private (user_id, birth_date, timezone) values ($1, $2, $3)',
        [u.id, birth, 'America/Argentina/Buenos_Aires']);
      await client.query('insert into user_settings (user_id) values ($1)', [u.id]);
      return u.id;
    };

    const alice = await mkUser('alice', '1995-05-05', 'AR');
    const bob   = await mkUser('bob',   '1996-06-06', 'AR');
    const kid   = await mkUser('kid',   '2014-01-01', 'AR');   // 12 años

    // Desafío de hoy + ventana ya abierta para Alice.
    const today = new Date().toISOString().slice(0, 10);
    const { rows: [ch] } = await client.query('select schedule_daily_challenge($1::date) as id', [today]);
    const { rows: [win] } = await client.query(
      `insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
       values ($1, $2, $3::date, now() - interval '10 minutes', now() + interval '110 minutes', 'America/Argentina/Buenos_Aires')
       returning id`, [alice, ch.id, today]);

    // Ventana de Bob que todavía NO abrió.
    await client.query(
      `insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
       values ($1, $2, $3::date, now() + interval '2 hours', now() + interval '4 hours', 'America/Argentina/Buenos_Aires')`,
      [bob, ch.id, today]);

    const { rows: [sub] } = await client.query(
      `insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path, timezone,
                                status, moderation_status, ai_decision, ai_confidence, counted_for_streak)
       values ($1, $2, $3::date, $4, 'America/Argentina/Buenos_Aires',
               'accepted', 'passed', 'accepted', 0.94, true)
       returning id`,
      [alice, ch.id, today, `${alice}/${today}/photo.webp`]);

    // ---- aserciones de seguridad --------------------------------------------
    console.log('\n· verificando políticas de seguridad…\n');

    // §61 — la racha la decide el servidor. El intento falla con error de
    // permisos (grant por columna), no en silencio.
    await asUser(client, alice, async () => {
      const err = await expectError(() =>
        client.query('update profiles set current_streak = 9999 where id = $1', [alice]));
      check('un usuario NO puede inflar su propia racha', err !== null && /permission denied/i.test(err.message),
        err ? err.message : 'el update fue aceptado');
    });

    // …pero sí puede editar los campos que le corresponden.
    await asUser(client, alice, async () => {
      await client.query("update profiles set display_name = 'Alice A.', bio = 'hola' where id = $1", [alice]);
      const { rows: [p] } = await client.query('select display_name from profiles where id = $1', [alice]);
      check('un usuario SÍ puede editar su nombre y su bio', p.display_name === 'Alice A.');
    });

    // §28 — el username no se cambia desde el cliente: exige validar unicidad
    // y palabras prohibidas, así que pasa por el backend.
    await asUser(client, alice, async () => {
      const err = await expectError(() =>
        client.query("update profiles set username = 'robada' where id = $1", [alice]));
      check('un usuario NO puede cambiarse el username por su cuenta', err !== null);
    });

    // §18 — los datos privados no salen de la propia fila.
    await asUser(client, bob, async () => {
      const { rows } = await client.query('select * from user_private where user_id = $1', [alice]);
      check('un usuario NO puede leer la fecha de nacimiento de otro', rows.length === 0);
    });

    // §17/§63 — visibilidad de fotos resuelta en la base.
    await asUser(client, bob, async () => {
      const { rows } = await client.query('select id from submissions where id = $1', [sub.id]);
      check('un desconocido NO ve la foto de otro', rows.length === 0);
    });

    await client.query(
      'insert into friendships (user_a, user_b) values ($1, $2)',
      [alice < bob ? alice : bob, alice < bob ? bob : alice]);

    await asUser(client, bob, async () => {
      const { rows } = await client.query('select id from submissions where id = $1', [sub.id]);
      check('un amigo SÍ ve la foto', rows.length === 1);
    });

    // §25 — el bloqueo gana sobre la amistad.
    await client.query('insert into blocks (blocker_id, blocked_id) values ($1, $2)', [alice, bob]);
    await asUser(client, bob, async () => {
      const { rows } = await client.query('select id from submissions where id = $1', [sub.id]);
      check('tras un bloqueo, deja de ver la foto', rows.length === 0);
      const { rows: prof } = await client.query('select id from profiles where id = $1', [alice]);
      check('tras un bloqueo, deja de ver el perfil', prof.length === 0);
    });
    await client.query('delete from blocks where blocker_id = $1', [alice]);

    // §61 — el cliente no publica: escribe el backend.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path, timezone, status)
         values ($1, $2, current_date, 'x', 'UTC', 'accepted')`, [alice, ch.id]));
      check('el cliente NO puede insertar publicaciones directamente', err !== null,
        'el insert fue aceptado');
    });

    // §5 — no se puede espiar el catálogo ni el calendario.
    await asUser(client, alice, async () => {
      const { rows: objs } = await client.query('select id from challenge_objects');
      check('el catálogo de objetos NO es legible por usuarios', objs.length === 0, `leyó ${objs.length}`);
      const { rows: days } = await client.query('select id from daily_challenges');
      check('el calendario de desafíos NO es legible por usuarios', days.length === 0, `leyó ${days.length}`);
    });

    // §5 — el objeto no se revela antes de que abra la ventana.
    await asUser(client, bob, async () => {
      const { rows } = await client.query('select * from get_active_challenge()');
      check('antes de abrir la ventana, el objeto viene oculto',
        rows.length === 1 && rows[0].object_name === null && rows[0].is_revealed === false,
        JSON.stringify(rows[0] ?? null));
    });

    await asUser(client, alice, async () => {
      const { rows } = await client.query('select * from get_active_challenge()');
      check('con la ventana abierta, el objeto se revela',
        rows.length === 1 && typeof rows[0].object_name === 'string' && rows[0].is_open === true,
        JSON.stringify(rows[0] ?? null));
    });

    // §9 — una sola publicación válida por día.
    const dupErr = await expectError(() => client.query(
      `insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path, timezone, status, moderation_status)
       values ($1, $2, $3::date, 'otra.webp', 'UTC', 'accepted', 'passed')`,
      [alice, ch.id, today]));
    check('no se puede tener dos publicaciones aceptadas el mismo día', dupErr !== null);

    // §29/§72 — menores fuera de los rankings públicos.
    await client.query(
      'update user_settings set show_in_global_ranking = true, show_in_country_ranking = true where user_id = $1',
      [kid]);
    const { rows: [kidSettings] } = await client.query(
      'select show_in_global_ranking, show_in_country_ranking from user_settings where user_id = $1', [kid]);
    check('un menor de 16 no puede activar los rankings públicos',
      kidSettings.show_in_global_ranking === false && kidSettings.show_in_country_ranking === false);

    const { rows: [kidBand] } = await client.query('select age_band from user_private where user_id = $1', [kid]);
    check('la franja etaria se deriva sola de la fecha de nacimiento', kidBand.age_band === '13_15' || kidBand.age_band === 'under_13',
      `dio ${kidBand.age_band}`);

    // §12 — la racha la mueve la función del servidor, y es idempotente.
    await client.query('select apply_streak_increment($1, $2::date, $3)', [alice, today, sub.id]);
    await client.query('select apply_streak_increment($1, $2::date, $3)', [alice, today, sub.id]);
    const { rows: [aliceStreak] } = await client.query(
      'select current_streak, best_streak, total_completed from profiles where id = $1', [alice]);
    check('apply_streak_increment es idempotente para el mismo día',
      aliceStreak.current_streak === 1 && aliceStreak.total_completed === 1,
      JSON.stringify(aliceStreak));

    // §13 — el cierre del día consume protector o corta la racha.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await client.query('select schedule_daily_challenge($1::date)', [yesterday]);
    await client.query(
      `insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
       select $1, id, $2::date, now() - interval '30 hours', now() - interval '28 hours', 'UTC'
         from daily_challenges where challenge_date = $2::date`, [bob, yesterday]);
    await client.query(
      "update profiles set current_streak = 5, best_streak = 5 where id = $1", [bob]);
    await client.query('select close_challenge_day($1::date)', [yesterday]);
    const { rows: [bobAfter] } = await client.query(
      'select current_streak, best_streak from profiles where id = $1', [bob]);
    check('perder un día corta la racha actual pero conserva la mejor',
      bobAfter.current_streak === 0 && bobAfter.best_streak === 5, JSON.stringify(bobAfter));

    // §36 — los rankings se materializan y respetan el opt-out.
    await client.query('update user_settings set show_in_global_ranking = true where user_id = $1', [alice]);
    await client.query('select build_ranking_snapshots($1::date)', [today]);
    const { rows: ranked } = await client.query(
      "select user_id, rank from ranking_snapshots where snapshot_date = $1::date and scope = 'global'", [today]);
    check('sólo entra al ranking global quien lo activó',
      ranked.length === 1 && ranked[0].user_id === alice, `entraron ${ranked.length}`);

    // §32 — el bucket de fotos no es público.
    const { rows: [bucket] } = await client.query("select public from storage.buckets where id = 'submissions'");
    check('el bucket de fotos es privado', bucket.public === false);

    // §56 — el cliente no ve los umbrales de IA.
    await asUser(client, alice, async () => {
      const { rows } = await client.query('select key from public_app_config');
      const keys = rows.map(r => r.key);
      check('la config pública no expone los umbrales de IA',
        keys.includes('max_upload_attempts') && !keys.includes('ai_confidence_accept'),
        keys.join(','));
      const { rows: raw } = await client.query('select key from app_config');
      check('la tabla app_config completa NO es legible por usuarios', raw.length === 0, `leyó ${raw.length}`);
    });

  } finally {
    await client.end();
    await pg.stop();
    rmSync(DATA_DIR, { recursive: true, force: true });
  }

  console.log('\n' + '─'.repeat(64));
  for (const p of pass) console.log(`  ✓ ${p}`);
  for (const f of fail) console.log(`  ✗ ${f}`);
  console.log('─'.repeat(64));
  console.log(`${pass.length} pasaron, ${fail.length} fallaron\n`);
  process.exit(fail.length === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('\nLa verificación se cortó:', err.message);
  console.error(err.stack);
  process.exit(1);
});
