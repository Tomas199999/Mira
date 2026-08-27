#!/usr/bin/env node
/**
 * Mira — verificación de performance de las consultas calientes (§59, §36).
 *
 * Levanta el Postgres embebido, aplica el esquema, genera volumen realista y
 * mide los planes con EXPLAIN ANALYZE. Con la base vacía cualquier consulta es
 * rápida: sin datos, esta verificación no diría nada.
 *
 * Lo que se comprueba no es un número absoluto de milisegundos —depende de la
 * máquina— sino que el planificador use índices donde tiene que usarlos.
 *
 *   npm run verify:performance
 */
import EmbeddedPostgres from 'embedded-postgres';
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, '.pgdata-perf');
const PORT = 54998;

const USERS = 5000;
const SUBMISSIONS_PER_USER = 12;
const FRIENDS_PER_USER = 15;

const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(n + (ok || !d ? '' : ` — ${d}`));

let client = null;

/** Devuelve el plan como texto y el tiempo de ejecución en ms. */
async function explain(sql, params = [], label = '') {
  const { rows } = await client.query(
    `explain (analyze, buffers, format json) ${sql}`, params);
  const plan = rows[0]['QUERY PLAN'][0];

  if (process.env.DUMP_PLANS && label) {
    const { rows: textRows } = await client.query(
      `explain (analyze, format text) ${sql}`, params);
    appendFileSync('/tmp/mira-plans.txt',
      `\n===== ${label} =====\n` + textRows.map(r => r['QUERY PLAN']).join('\n') + '\n');
  }

  return { ms: plan['Execution Time'], text: JSON.stringify(plan.Plan) };
}

/** ¿El plan recorre secuencialmente alguna de estas tablas? */
function seqScansOn(planText, tables) {
  return tables.filter((t) =>
    new RegExp(`"Node Type":"Seq Scan","Parallel Aware":(true|false),"Relation Name":"${t}"`).test(planText));
}

async function main() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR, user: 'postgres', password: 'postgres',
    port: PORT, persistent: false,
  });

  console.log('· preparando base…');
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient();
  await client.connect();

  try {
    await client.query(readFileSync(join(ROOT, 'supabase/test/00_supabase_shim.sql'), 'utf8'));
    for (const file of readdirSync(join(ROOT, 'supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8'));
    }
    for (const file of readdirSync(join(ROOT, 'supabase/seed')).filter(f => f.endsWith('.sql')).sort()) {
      await client.query(readFileSync(join(ROOT, 'supabase/seed', file), 'utf8'));
    }

    console.log(`· generando ${USERS} usuarios y ~${USERS * SUBMISSIONS_PER_USER} publicaciones…`);

    await client.query(`
      insert into auth.users (id, email)
      select gen_random_uuid(), 'perf' || g || '@mira.test' from generate_series(1, ${USERS}) g`);

    await client.query(`
      insert into profiles (id, username, display_name, country_code, current_streak, best_streak, total_completed)
      select u.id, 'perf' || row_number() over (order by u.id), 'Perf', 
             (array['AR','UY','ES','MX','BR'])[1 + (random() * 4)::int],
             (random() * 60)::int, (random() * 90)::int + 60, (random() * 200)::int
        from auth.users u`);

    await client.query(`
      insert into user_private (user_id, birth_date, timezone)
      select id, '1995-01-01'::date, 'UTC' from profiles`);
    await client.query(`
      insert into user_settings (user_id, show_in_global_ranking, show_in_country_ranking)
      select id, true, true from profiles`);

    // Desafíos de los últimos meses.
    await client.query(`
      insert into daily_challenges (challenge_date, object_id, status)
      select current_date - g,
             (select id from challenge_objects order by md5(g::text || object_name) limit 1),
             'closed'
        from generate_series(0, 120) g`);

    // Amistades: par canónico, sin duplicados.
    await client.query(`
      insert into friendships (user_a, user_b)
      select distinct least(p.id, o.id), greatest(p.id, o.id)
        from profiles p
        cross join lateral (
          select id from profiles x where x.id <> p.id order by md5(x.id::text || p.id::text)
          limit ${FRIENDS_PER_USER}
        ) o
      on conflict do nothing`);

    // Publicaciones repartidas en los últimos meses.
    await client.query(`
      insert into submissions (user_id, daily_challenge_id, challenge_date, photo_path,
                               thumbnail_path, timezone, status, moderation_status,
                               object_display_name, submitted_at)
      select p.id, d.id, d.challenge_date,
             p.id || '/' || d.challenge_date || '/f.webp',
             p.id || '/' || d.challenge_date || '/f_thumb.webp',
             'UTC', 'accepted', 'passed', 'una taza',
             d.challenge_date + interval '14 hours' + make_interval(secs => (random()*20000)::int)
        from profiles p
        cross join lateral (
          select id, challenge_date from daily_challenges
           order by md5(challenge_date::text || p.id::text) limit ${SUBMISSIONS_PER_USER}
        ) d
      on conflict do nothing`);

    await client.query(`
      insert into ranking_snapshots (snapshot_date, scope, scope_key, user_id, rank, score)
      select current_date, 'global', '', p.id,
             rank() over (order by p.current_streak desc, p.id), p.current_streak
        from profiles p`);

    await client.query('analyze');

    const { rows: [counts] } = await client.query(`
      select (select count(*) from profiles) as usuarios,
             (select count(*) from submissions) as publicaciones,
             (select count(*) from friendships) as amistades`);
    console.log(`· ${counts.usuarios} usuarios · ${counts.publicaciones} publicaciones · ${counts.amistades} amistades\n`);

    // Un usuario cualquiera, con amigos.
    const { rows: [victim] } = await client.query(`
      select user_a as id from friendships limit 1`);
    await client.query("select set_config('role', 'authenticated', false)");
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [victim.id]);

    // ---- feed ------------------------------------------------------------------
    if (process.env.DUMP_PLANS) writeFileSync('/tmp/mira-plans.txt', '');
    const feed = await explain('select * from get_feed(null, null, 20)', [], 'feed');
    const feedSeq = seqScansOn(feed.text, ['submissions', 'profiles']);
    check('el feed no recorre submissions secuencialmente', feedSeq.length === 0,
      `recorre ${feedSeq.join(', ')}`);
    check('el feed responde en menos de 150 ms', feed.ms < 150, `${feed.ms.toFixed(1)} ms`);
    console.log(`  feed: ${feed.ms.toFixed(1)} ms`);

    // ---- ranking ---------------------------------------------------------------
    const ranking = await explain("select * from get_ranking_page('global', '', 0, 50)");
    const rankSeq = seqScansOn(ranking.text, ['ranking_snapshots']);
    check('el ranking usa el índice del snapshot', rankSeq.length === 0,
      `recorre ${rankSeq.join(', ')}`);
    console.log(`  ranking: ${ranking.ms.toFixed(1)} ms`);

    // ---- historial ---------------------------------------------------------------
    const history = await explain(
      "select * from get_history_month($1)", [new Date().toISOString().slice(0, 7)], 'historial');
    const histSeq = seqScansOn(history.text, ['submissions']);
    check('el historial del mes no recorre submissions', histSeq.length === 0,
      `recorre ${histSeq.join(', ')}`);
    // La forma del plan no alcanza: una consulta puede usar índices y aun así
    // tardar un segundo. Este techo es lo que detectó el índice inservible.
    check('el historial responde en menos de 150 ms', history.ms < 150,
      `${history.ms.toFixed(1)} ms`);
    console.log(`  historial: ${history.ms.toFixed(1)} ms`);

    // ---- notificaciones -----------------------------------------------------------
    await client.query("select set_config('role', 'postgres', false)");
    const push = await explain('select * from claim_due_challenge_notifications(500)');
    console.log(`  reclamo de notificaciones: ${push.ms.toFixed(1)} ms`);
    check('el reclamo de notificaciones termina rápido', push.ms < 500, `${push.ms.toFixed(1)} ms`);

    // ---- dedupe perceptual ---------------------------------------------------------
    // Es O(n) por diseño; acá se mide dónde deja de ser aceptable.
    await client.query(`
      update submissions set perceptual_hash = decode(md5(id::text), 'hex')
       where challenge_date > current_date - 30`);
    await client.query('analyze submissions');
    const dedupe = await explain(
      "select find_duplicate_photo(decode(md5('x'), 'hex'), gen_random_uuid(), 8)");
    console.log(`  dedupe perceptual: ${dedupe.ms.toFixed(1)} ms`);
    check('el dedupe perceptual se mantiene bajo un segundo con este volumen',
      dedupe.ms < 1000, `${dedupe.ms.toFixed(1)} ms sobre ${counts.publicaciones} publicaciones`);

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
  process.exit(fail.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\nLa verificación se cortó:', err.message);
  console.error(err.stack);
  process.exit(1);
});
