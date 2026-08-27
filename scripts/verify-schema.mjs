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

    // §61 — el agujero de la migración 0013: el cliente tampoco puede CREAR
    // un perfil con la racha ya inflada. UPDATE estaba acotado, INSERT no.
    const intruder = (await client.query('insert into auth.users (email) values ($1) returning id',
      ['intruder@test.local'])).rows[0].id;

    await asUser(client, intruder, async () => {
      const err = await expectError(() => client.query(
        `insert into profiles (id, username, display_name, current_streak, best_streak)
         values ($1, 'tramposo', 'Tramposo', 9999, 9999)`, [intruder]));
      check('un usuario NO puede crear su perfil con la racha inflada', err !== null,
        'el insert fue aceptado');
    });

    await asUser(client, intruder, async () => {
      const err = await expectError(() => client.query(
        `insert into profiles (id, username, display_name) values ($1, 'normalito', 'Normal')`,
        [intruder]));
      check('el cliente NO puede insertar perfiles ni con valores inocentes', err !== null);
    });

    // …y el alta legítima pasa por la función del servidor.
    await asUser(client, intruder, async () => {
      await client.query(
        `select create_user_profile('nuevousuario', 'Nuevo', '1998-03-03'::date, 'AR', 'UTC', 'es')`);
      const { rows } = await client.query(
        'select username, current_streak from profiles where id = $1', [intruder]);
      check('create_user_profile crea el perfil con la racha en cero',
        rows.length === 1 && rows[0].username === 'nuevousuario' && rows[0].current_streak === 0,
        JSON.stringify(rows[0] ?? null));

      const { rows: priv } = await client.query(
        'select age_band from user_private where user_id = $1', [intruder]);
      const { rows: sets } = await client.query(
        'select photo_visibility from user_settings where user_id = $1', [intruder]);
      check('el alta es atómica: crea también los datos privados y los ajustes',
        priv.length === 1 && sets.length === 1 && sets[0].photo_visibility === 'friends');
    });

    // Validaciones que no pueden quedar del lado del cliente.
    const mkBareUser = async (email) =>
      (await client.query('insert into auth.users (email) values ($1) returning id', [email])).rows[0].id;

    // Ojo: asUser corre dentro de una transacción con rollback, así que el
    // perfil creado más arriba no persiste. Se prueba contra 'alice', que sí
    // quedó commiteada por el sembrado de datos.
    const dupUser = await mkBareUser('dup@test.local');
    await asUser(client, dupUser, async () => {
      const err = await expectError(() => client.query(
        `select create_user_profile('alice', 'Otro', '1998-01-01'::date, 'AR', 'UTC', 'es')`));
      check('no se puede tomar un username ya usado', err !== null && /username_taken/.test(err.message),
        err ? err.message : 'fue aceptado');
    });

    const resUser = await mkBareUser('res@test.local');
    await asUser(client, resUser, async () => {
      const err = await expectError(() => client.query(
        `select create_user_profile('admin', 'Admin', '1998-01-01'::date, 'AR', 'UTC', 'es')`));
      check('no se puede tomar un username reservado', err !== null && /username_reserved/.test(err.message));
    });

    const youngUser = await mkBareUser('young@test.local');
    await asUser(client, youngUser, async () => {
      const err = await expectError(() => client.query(
        `select create_user_profile('chiquito', 'Chico', '2016-01-01'::date, 'AR', 'UTC', 'es')`));
      check('se rechaza a quien no llega a la edad mínima', err !== null && /age_restricted/.test(err.message));
    });

    // La edad mínima sube a 16 en el Espacio Económico Europeo (GDPR art. 8).
    const eeaUser = await mkBareUser('eea@test.local');
    const fourteen = new Date(Date.now() - 14 * 365.25 * 86400000).toISOString().slice(0, 10);
    await asUser(client, eeaUser, async () => {
      const err = await expectError(() => client.query(
        `select create_user_profile('europeo', 'Euro', $1::date, 'ES', 'UTC', 'es')`, [fourteen]));
      check('en el EEE la edad mínima sube a 16', err !== null && /age_restricted/.test(err.message),
        err ? err.message : 'fue aceptado');
    });
    const arUser = await mkBareUser('ar@test.local');
    await asUser(client, arUser, async () => {
      await client.query(
        `select create_user_profile('argentino', 'Arg', $1::date, 'AR', 'UTC', 'es')`, [fourteen]);
      const { rows } = await client.query('select 1 from profiles where id = $1', [arUser]);
      check('fuera del EEE, con 14 años sí se puede', rows.length === 1);
    });

    // §15 — una solicitud de amistad nace pendiente, no aceptada.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `insert into friend_requests (requester_id, addressee_id, status)
         values ($1, $2, 'accepted')`, [alice, bob]));
      check('no se puede crear una solicitud de amistad ya aceptada', err !== null);
    });

    // §23 — un reporte nace abierto, no resuelto.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `insert into reports (reporter_id, reported_user_id, reason, status)
         values ($1, $2, 'spam', 'dismissed')`, [alice, bob]));
      check('no se puede crear un reporte ya desestimado', err !== null);
    });

    // Defensa en profundidad: anon no escribe en ninguna tabla.
    const { rows: anonWrites } = await client.query(
      `select count(*)::int as n from information_schema.table_privileges
        where table_schema='public' and grantee='anon'
          and privilege_type in ('INSERT','UPDATE','DELETE')`);
    check('el rol anónimo no tiene ningún permiso de escritura', anonWrites[0].n === 0,
      `tiene ${anonWrites[0].n}`);

    // §16 — suplantación por hash de teléfono: si el cliente puede escribir
    // phone_hash, puede poner el de otra persona y aparecer cuando los
    // contactos de esa persona la buscan.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `update user_private set phone_hash = decode('deadbeef','hex') where user_id = $1`, [alice]));
      check('un usuario NO puede escribir su hash de teléfono', err !== null,
        'el update fue aceptado');
    });

    // §29 — la fecha de nacimiento no se edita: si se pudiera, un menor
    // desactivaría las protecciones que el trigger le aplicó al registrarse.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `update user_private set birth_date = '1980-01-01' where user_id = $1`, [alice]));
      check('un usuario NO puede cambiarse la fecha de nacimiento', err !== null);
    });

    // §5 — la zona horaria no se escribe directo: se pide, y rige mañana.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `update user_private set timezone = 'Pacific/Auckland', timezone_effective_on = current_date
          where user_id = $1`, [alice]));
      check('un usuario NO puede cambiar su zona horaria de forma inmediata', err !== null);
    });

    await asUser(client, alice, async () => {
      const { rows } = await client.query(
        `select request_timezone_change('Europe/Madrid') as efectiva`);
      const hoy = new Date().toISOString().slice(0, 10);
      check('el cambio de zona horaria se difiere al día siguiente',
        rows[0].efectiva.toISOString().slice(0, 10) > hoy,
        String(rows[0].efectiva));
    });

    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `select request_timezone_change('Marte/Olympus')`));
      check('se rechaza una zona horaria inexistente', err !== null && /timezone_invalid/.test(err.message));
    });

    // Las funciones de servidor no las puede invocar el cliente.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `select schedule_daily_challenge((current_date + 30)::date)`));
      check('un usuario NO puede programar desafíos', err !== null && /permission denied/i.test(err.message),
        err ? err.message : 'fue aceptado');
    });

    // §50 — la baja se pide; no se marca como completada.
    await asUser(client, alice, async () => {
      const err = await expectError(() => client.query(
        `insert into account_deletion_requests (user_id, scheduled_for, completed_at)
         values ($1, now(), now())`, [alice]));
      check('un usuario NO puede marcar su propia baja como completada', err !== null);
    });

    // Ninguna función SECURITY DEFINER debe ser invocable sin sesión. Es la
    // capa de permisos; el guard interno con auth.uid() es la segunda, no la
    // única. Lo detectó el analizador de Supabase, no esta suite.
    const { rows: exposed } = await client.query(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and (has_function_privilege('anon', p.oid, 'EXECUTE')
              or pg_catalog.has_function_privilege('public', p.oid, 'EXECUTE'))
       order by 1`);
    check('ninguna función SECURITY DEFINER es invocable por anon o PUBLIC',
      exposed.length === 0, exposed.map(r => r.proname).join(', '));

    // Toda función SECURITY DEFINER necesita search_path fijo, o quien pueda
    // crear objetos en un esquema anterior del path secuestra su cuerpo.
    const { rows: mutable } = await client.query(`
      select p.proname
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                          where c like 'search_path=%')
       order by 1`);
    check('toda función SECURITY DEFINER tiene search_path fijo',
      mutable.length === 0, mutable.map(r => r.proname).join(', '));

    // ---- modelo temporal (§5, §43) -----------------------------------------
    // Es la parte más riesgosa del diseño: un objeto global por fecha, pero la
    // ventana de cada usuario sorteada dentro de SU franja horaria local.
    const futureDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await client.query('select schedule_daily_challenge($1::date)', [futureDate]);

    const tzUser = async (username, tz) => {
      const id = (await client.query('insert into auth.users (email) values ($1) returning id',
        [`${username}@test.local`])).rows[0].id;
      await client.query(
        'insert into profiles (id, username, display_name, country_code) values ($1,$2,$3,$4)',
        [id, username, username, 'AR']);
      await client.query('insert into user_private (user_id, birth_date, timezone) values ($1,$2,$3)',
        [id, '1995-01-01', tz]);
      await client.query('insert into user_settings (user_id) values ($1)', [id]);
      return id;
    };

    const tokyo  = await tzUser('tokio',  'Asia/Tokyo');
    const madrid = await tzUser('madrid', 'Europe/Madrid');

    const { rows: [made] } = await client.query(
      'select create_challenge_windows($1::date) as n', [futureDate]);
    check('se crea una ventana por usuario activo en un solo pase', made.n >= 3, `creó ${made.n}`);

    // Cada ventana tiene que caer dentro de la franja LOCAL del usuario.
    const { rows: windows } = await client.query(`
      select w.timezone,
             (w.opens_at  at time zone w.timezone)::time as abre_local,
             (w.closes_at at time zone w.timezone)::time as cierra_local,
             (w.opens_at  at time zone w.timezone)::date as fecha_local,
             w.opens_at
        from challenge_windows w
       where w.challenge_date = $1::date`, [futureDate]);

    const dentroDeFranja = windows.every(w => {
      const abre = w.abre_local.slice(0, 5);
      const cierra = w.cierra_local.slice(0, 5);
      return abre >= '10:00' && cierra <= '22:00';
    });
    check('toda ventana cae dentro de la franja local 10:00–22:00',
      windows.length > 0 && dentroDeFranja,
      windows.map(w => `${w.timezone} ${w.abre_local}–${w.cierra_local}`).join(' | '));

    check('la fecha local de la ventana es el día del desafío',
      windows.every(w => w.fecha_local.toISOString().slice(0, 10) === futureDate),
      windows.map(w => w.fecha_local.toISOString().slice(0, 10)).join(','));

    // La misma franja local corresponde a instantes absolutos distintos según
    // el huso. Se compara el ARRANQUE de la franja, que es determinista; dos
    // sorteos aleatorios pueden coincidir por azar y no probarían nada.
    const { rows: [franjas] } = await client.query(`
      select extract(epoch from
               (($1::date + interval '10 hours') at time zone 'Europe/Madrid')
             - (($1::date + interval '10 hours') at time zone 'Asia/Tokyo')
             ) / 3600 as horas_de_diferencia`, [futureDate]);
    check('las 10:00 locales son instantes distintos según el huso',
      Math.abs(Number(franjas.horas_de_diferencia)) === 7,
      `dio ${franjas.horas_de_diferencia} horas`);

    // El bug de la migración 0018: con ventanas futuras ya creadas,
    // get_active_challenge() devolvía la de mayor fecha en vez de la de hoy.
    await asUser(client, alice, async () => {
      const { rows } = await client.query('select challenge_date from get_active_challenge()');
      const hoy = new Date().toISOString().slice(0, 10);
      check('get_active_challenge nunca devuelve una ventana futura',
        rows.length === 1 && rows[0].challenge_date.toISOString().slice(0, 10) <= hoy,
        rows.length ? rows[0].challenge_date.toISOString().slice(0, 10) : 'sin filas');
    });

    // El cron se reintenta: correrlo dos veces no puede duplicar ni re-sortear.
    const { rows: [again] } = await client.query(
      'select create_challenge_windows($1::date) as n', [futureDate]);
    check('crear las ventanas dos veces no duplica ninguna', again.n === 0, `creó ${again.n} de más`);

    // El cambio de zona horaria pedido ayer rige hoy, no antes.
    await client.query(
      `update user_private set pending_timezone = 'America/Sao_Paulo',
              timezone_effective_on = current_date + 1 where user_id = $1`, [tokyo]);
    await client.query('select promote_pending_timezones(current_date)');
    const { rows: [notYet] } = await client.query(
      'select timezone from user_private where user_id = $1', [tokyo]);
    check('un cambio de huso con fecha futura todavía no se aplica',
      notYet.timezone === 'Asia/Tokyo', notYet.timezone);

    await client.query('select promote_pending_timezones((current_date + 1)::date)');
    const { rows: [nowYes] } = await client.query(
      'select timezone, pending_timezone from user_private where user_id = $1', [tokyo]);
    check('al llegar la fecha, el cambio de huso se aplica y se limpia',
      nowYes.timezone === 'America/Sao_Paulo' && nowYes.pending_timezone === null,
      JSON.stringify(nowYes));

    // ---- pipeline de subida (§8, §9, §42) ----------------------------------
    const subUser = await mkUser('subidor', '1994-02-02', 'AR');
    const { rows: [subWin] } = await client.query(
      `insert into challenge_windows (user_id, daily_challenge_id, challenge_date, opens_at, closes_at, timezone)
       values ($1, $2, $3::date, now() - interval '5 minutes', now() + interval '60 minutes', 'UTC')
       returning id`, [subUser, ch.id, today]);

    let firstToken = null, firstSubmission = null;
    await asUser(client, subUser, async () => {
      const { rows } = await client.query('select start_submission($1) as r', [subWin.id]);
      const r = rows[0].r;
      check('start_submission reserva el intento y emite un token',
        Boolean(r.submission_id) && Boolean(r.upload_token) && r.attempts_remaining === 2,
        JSON.stringify(r));

      const { rows: r2 } = await client.query('select start_submission($1) as r', [subWin.id]);
      check('el segundo intento descuenta del cupo', r2[0].r.attempts_remaining === 1,
        JSON.stringify(r2[0].r));

      await client.query('select start_submission($1) as r', [subWin.id]);
      const err = await expectError(() => client.query('select start_submission($1) as r', [subWin.id]));
      check('al agotar los intentos, start_submission falla',
        err !== null && /attempts_exhausted/.test(err.message),
        err ? err.message : 'fue aceptado');
    });

    // Token de un solo uso: fuera de la transacción para que persista.
    await client.query(
      `update challenge_windows set attempts_used = 0 where id = $1`, [subWin.id]);
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [subUser]);
    const { rows: [issued] } = await client.query('select start_submission($1) as r', [subWin.id]);
    firstToken = issued.r.upload_token;
    firstSubmission = issued.r.submission_id;

    const { rows: [used1] } = await client.query(
      'select consume_upload_token($1, $2) as ok', [firstToken, firstSubmission]);
    check('el token de subida se consume una vez', used1.ok === true);

    const { rows: [used2] } = await client.query(
      'select consume_upload_token($1, $2) as ok', [firstToken, firstSubmission]);
    check('el mismo token no se puede reutilizar', used2.ok === false);

    const { rows: [wrongTok] } = await client.query(
      'select consume_upload_token($1, $2) as ok', ['no-existe', firstSubmission]);
    check('un token inventado no sirve', wrongTok.ok === false);

    // Veredicto y racha, juntos.
    const { rows: [applied] } = await client.query(
      `select apply_submission_result($1, 'accepted', 'accepted', 0.95, 'passed') as r`,
      [firstSubmission]);
    check('aceptar una foto incrementa la racha en la misma operación',
      applied.r.streak === 1 && applied.r.counted_for_streak === true,
      JSON.stringify(applied.r));

    const { rows: [closedWindow] } = await client.query(
      'select completed_at from challenge_windows where id = $1', [subWin.id]);
    check('al aceptar, la ventana queda marcada como completada', closedWindow.completed_at !== null);

    // Fuera de hora: la foto queda, pero no cuenta para la racha (§42).
    const lateUser = await mkUser('tardio', '1994-03-03', 'AR');
    const { rows: [lateSub] } = await client.query(
      `insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path,
                                timezone, status, was_late)
       values ($1, $2, $3::date, 'x.webp', 'UTC', 'pending', true) returning id`,
      [lateUser, ch.id, today]);
    const { rows: [lateResult] } = await client.query(
      `select apply_submission_result($1, 'accepted', 'accepted', 0.99, 'passed') as r`,
      [lateSub.id]);
    check('una foto fuera de hora se acepta pero no mueve la racha',
      lateResult.r.counted_for_streak === false && lateResult.r.was_late === true,
      JSON.stringify(lateResult.r));

    // En revisión: no incrementa, pero tampoco rompe (docs/AI.md).
    const revUser = await mkUser('revision', '1994-04-04', 'AR');
    const { rows: [revSub] } = await client.query(
      `insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path,
                                timezone, status)
       values ($1, $2, $3::date, 'y.webp', 'UTC', 'pending') returning id`,
      [revUser, ch.id, today]);
    await client.query(
      `select apply_submission_result($1, 'in_review', 'review', 0.55, 'passed')`, [revSub.id]);
    const { rows: [revProfile] } = await client.query(
      'select current_streak from profiles where id = $1', [revUser]);
    check('una foto en revisión no incrementa la racha todavía', revProfile.current_streak === 0);

    await client.query('select close_challenge_day($1::date)', [today]);
    const { rows: [revAfter] } = await client.query(
      'select current_streak from profiles where id = $1', [revUser]);
    check('…pero el cierre del día tampoco se la rompe', revAfter.current_streak === 0);

    // El dedupe tiene que encontrar la MISMA foto re-exportada, no sólo el
    // archivo idéntico. Con igualdad exacta no encontraría nada que el sha256
    // no encontrara ya.
    const baseHash = '\\x0f1e2d3c4b5a6978';
    const nearHash = '\\x0f1e2d3c4b5a6979';   // un bit de diferencia
    const farHash  = '\\xf0e1d2c3b4a59687';   // invertida
    const { rows: [dist] } = await client.query(
      'select hash_distance($1::bytea, $2::bytea) as cerca, hash_distance($1::bytea, $3::bytea) as lejos',
      [baseHash, nearHash, farHash]);
    check('hash_distance mide bits, no igualdad',
      dist.cerca === 1 && dist.lejos === 64, JSON.stringify(dist));

    await client.query(
      `update submissions set perceptual_hash = $1::bytea where id = $2`, [baseHash, sub.id]);
    const { rows: [found] } = await client.query(
      'select find_duplicate_photo($1::bytea, $2, 8) as id', [nearHash, firstSubmission]);
    check('una foto re-exportada se detecta como duplicada', found.id === sub.id,
      String(found.id));
    const { rows: [notFound] } = await client.query(
      'select find_duplicate_photo($1::bytea, $2, 8) as id', [farHash, firstSubmission]);
    check('una foto distinta no se marca como duplicada', notFound.id === null,
      String(notFound.id));

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
      // app_config ahora tiene una política de SELECT acotada a las claves
      // públicas, para que la vista pueda ser security_invoker. Lo que importa
      // es que las claves privadas sigan siendo invisibles.
      const { rows: raw } = await client.query('select key from app_config');
      const leidas = raw.map(r => r.key);
      check('los umbrales de IA no son legibles ni consultando app_config directo',
        !leidas.some(k => k.startsWith('ai_') || k.startsWith('rate_limit_')),
        leidas.join(','));
    });

    // La vulnerabilidad de la migración 0014: una vista simple sobre una tabla
    // con RLS es actualizable, y si no es security_invoker corre con los
    // permisos de su dueño y saltea las políticas por completo.
    const { rows: views } = await client.query(
      `select c.relname,
              coalesce((select option_value from pg_options_to_table(c.reloptions)
                         where option_name = 'security_invoker'), 'off') as invoker
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'v'`);
    check('toda vista sobre una tabla con RLS es security_invoker',
      views.every(v => v.invoker === 'on' || v.invoker === 'true'),
      views.map(v => `${v.relname}=${v.invoker}`).join(', '));

    // Y aunque alguien re-otorgue los grants, nadie escribe la configuración.
    const { rows: cfgWrites } = await client.query(
      `select count(*)::int as n from information_schema.table_privileges
        where table_schema='public' and grantee in ('anon','authenticated')
          and table_name in ('app_config','public_app_config')
          and privilege_type in ('INSERT','UPDATE','DELETE')`);
    check('nadie puede escribir la configuración remota desde el cliente',
      cfgWrites[0].n === 0, `hay ${cfgWrites[0].n} permisos`);

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
