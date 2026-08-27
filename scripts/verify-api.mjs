#!/usr/bin/env node
/**
 * Mira — verificación de la API del desafío diario.
 *
 * Levanta las rutas contra la base real y comprueba el contrato completo:
 * autenticación, revelado del objeto según la ventana, y protección de los
 * jobs. Se apunta con API_BASE_URL (por defecto, el servidor local).
 *
 *   npm run verify:api
 */
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:3210';
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON = process.env.CRON_SECRET;

if (!URL_ || !ANON || !SERVICE || !CRON) {
  console.log('· faltan credenciales en .env — se saltea');
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const app = createClient(URL_, ANON, { auth: { persistSession: false } });

const pass = [], fail = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(n + (ok || !d ? '' : ` — ${d}`));

const stamp = String(process.hrtime.bigint()).slice(-9);
const email = `api-${stamp}@mira.test`;
const password = 'una-contrasena-larga-y-valida';
let userId = null;
const extraUsers = [];
const uploaded = [];

/** Crea un usuario confirmado, con perfil, y devuelve su token. */
async function makeUser(tag) {
  const mail = `api-${tag}-${stamp}@mira.test`;
  const created = await admin.auth.admin.createUser({ email: mail, password, email_confirm: true });
  if (created.error) throw created.error;
  const signed = await app.auth.signInWithPassword({ email: mail, password });
  if (signed.error) throw signed.error;
  const scoped = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signed.data.session.access_token}` } },
  });
  await scoped.rpc('create_user_profile', {
    p_username: `${tag}${stamp}`.slice(0, 20), p_display_name: tag,
    p_birth_date: '1993-05-05', p_country_code: 'AR', p_timezone: 'UTC', p_locale: 'es',
  });
  extraUsers.push(created.data.user.id);
  return { id: created.data.user.id, token: signed.data.session.access_token };
}

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* respuesta sin cuerpo */ }
  return { status: res.status, body: payload };
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  const signIn = await app.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const token = signIn.data.session.access_token;

  await app.rpc('create_user_profile', {
    p_username: `a${stamp}`.slice(0, 20),
    p_display_name: 'API test',
    p_birth_date: '1994-04-04',
    p_country_code: 'AR',
    p_timezone: 'America/Argentina/Buenos_Aires',
    p_locale: 'es',
  });

  // --- autenticación -----------------------------------------------------------
  const anon = await api('/api/challenge');
  check('GET /api/challenge sin token responde 401',
    anon.status === 401 && anon.body?.error?.code === 'unauthenticated',
    `${anon.status} ${JSON.stringify(anon.body)}`);

  const bad = await api('/api/challenge', { token: 'no-es-un-token' });
  check('GET /api/challenge con un token inválido responde 401', bad.status === 401,
    String(bad.status));

  // --- jobs protegidos ----------------------------------------------------------
  const cronOpen = await api('/api/cron/schedule-challenges');
  check('el cron sin el secreto responde 403',
    cronOpen.status === 403 && cronOpen.body?.error?.code === 'forbidden',
    `${cronOpen.status} ${JSON.stringify(cronOpen.body)}`);

  const cronWrong = await api('/api/cron/schedule-challenges', { token: 'secreto-equivocado' });
  check('el cron con un secreto equivocado responde 403', cronWrong.status === 403,
    String(cronWrong.status));

  // --- el job crea el desafío y las ventanas ------------------------------------
  const cronOk = await api('/api/cron/schedule-challenges', { token: CRON });
  check('el cron con el secreto correcto programa los desafíos',
    cronOk.status === 200 && cronOk.body?.ok === true,
    `${cronOk.status} ${JSON.stringify(cronOk.body).slice(0, 200)}`);

  const reported = cronOk.body?.data?.report ?? [];
  check('el job prepara varios días por adelantado', reported.length >= 4,
    `preparó ${reported.length}`);

  // --- estado del desafío --------------------------------------------------------
  const state = await api('/api/challenge', { token });
  const kind = state.body?.data?.kind;
  check('GET /api/challenge devuelve un estado válido',
    state.status === 200 && ['none', 'locked', 'open', 'missed', 'completed'].includes(kind),
    `${state.status} ${JSON.stringify(state.body).slice(0, 200)}`);

  // La regla que sostiene todo el modelo: el objeto no se filtra antes de hora.
  if (kind === 'locked') {
    const payload = JSON.stringify(state.body.data);
    check('con la ventana cerrada, la respuesta no incluye el objeto',
      !payload.includes('objectDisplayName'), payload);
    check('con la ventana cerrada, sí informa cuándo abre',
      Boolean(state.body.data.opensAt), payload);
  } else if (kind === 'open') {
    check('con la ventana abierta, viene el objeto y los intentos',
      Boolean(state.body.data.objectDisplayName) && state.body.data.maxAttempts > 0,
      JSON.stringify(state.body.data));
  } else {
    check(`estado devuelto: ${kind}`, true);
  }

  // --- cierre del día -------------------------------------------------------------
  const close = await api('/api/cron/close-day', { token: CRON });
  check('el job de cierre corre y materializa los rankings',
    close.status === 200 && close.body?.ok === true,
    `${close.status} ${JSON.stringify(close.body).slice(0, 200)}`);

  // --- grafo social ------------------------------------------------------------
  const ana = await makeUser('ana');
  const beto = await makeUser('beto');

  const search = await api(`/api/users/search?q=beto${stamp}`.slice(0, 40), { token: ana.token });
  check('la búsqueda encuentra a otro usuario por prefijo',
    (search.body?.data?.results ?? []).some((r) => r.userId === beto.id),
    JSON.stringify(search.body).slice(0, 140));

  const sent = await api('/api/friends/request', {
    token: ana.token, method: 'POST', body: { targetUserId: beto.id } });
  check('se puede enviar una solicitud de amistad', sent.status === 200);

  const graph = await api('/api/friends', { token: beto.token });
  const incoming = graph.body?.data?.incoming ?? [];
  check('la solicitud llega como recibida', incoming.length === 1);

  const accepted = await api('/api/friends/respond', {
    token: beto.token, method: 'POST', body: { requestId: incoming[0]?.requestId, accept: true } });
  check('aceptarla crea la amistad', accepted.status === 200);

  // --- feed y privacidad --------------------------------------------------------
  const carla = await makeUser('carla');
  const today = new Date().toISOString().slice(0, 10);
  const { data: dc } = await admin.from('daily_challenges')
    .select('id').eq('challenge_date', today).maybeSingle();

  const photoPath = `${beto.id}/${today}/verify_thumb.webp`;
  // 1×1 webp mínimo, suficiente para que Storage tenga algo que firmar.
  const tiny = Buffer.from(
    'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
  await admin.storage.from('submissions').upload(photoPath, tiny,
    { contentType: 'image/webp', upsert: true });
  uploaded.push(photoPath);

  const { data: post } = await admin.from('submissions').insert({
    user_id: beto.id, daily_challenge_id: dc?.id, challenge_date: today,
    photo_path: photoPath, thumbnail_path: photoPath, timezone: 'UTC',
    status: 'accepted', moderation_status: 'passed', object_display_name: 'una taza',
  }).select('id').single();

  const friendFeed = await api('/api/feed', { token: ana.token });
  const entry = (friendFeed.body?.data?.items ?? []).find((i) => i.submission.id === post?.id);
  check('un amigo ve la foto en el feed', Boolean(entry),
    JSON.stringify(friendFeed.body).slice(0, 160));
  check('la foto viaja con URL firmada, nunca pública',
    Boolean(entry?.submission.photoUrl?.includes('token=')),
    entry?.submission.photoUrl?.slice(0, 80));
  check('el nombre del objeto llega sin exponer el catálogo',
    entry?.submission.objectDisplayName === 'una taza');

  const strangerFeed = await api('/api/feed', { token: carla.token });
  check('un desconocido NO ve la foto en su feed',
    !(strangerFeed.body?.data?.items ?? []).some((i) => i.submission.id === post?.id));

  const reacted = await api('/api/reactions', {
    token: ana.token, method: 'POST', body: { submissionId: post?.id, type: 'fire' } });
  check('un amigo puede reaccionar', reacted.status === 200);

  const badReaction = await api('/api/reactions', {
    token: carla.token, method: 'POST', body: { submissionId: post?.id, type: 'fire' } });
  check('un desconocido NO puede reaccionar', badReaction.status >= 400, String(badReaction.status));

} catch (err) {
  fail.push(`la verificación se cortó: ${err.message}`);
} finally {
  if (uploaded.length) await admin.storage.from('submissions').remove(uploaded).catch(() => {});
  for (const id of extraUsers) await admin.auth.admin.deleteUser(id).catch(() => {});
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log('\n' + '─'.repeat(64));
for (const p of pass) console.log(`  ✓ ${p}`);
for (const f of fail) console.log(`  ✗ ${f}`);
console.log('─'.repeat(64));
console.log(`${pass.length} pasaron, ${fail.length} fallaron\n`);
process.exit(fail.length ? 1 : 0);
