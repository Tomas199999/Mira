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

const stamp = String(process.hrtime.bigint());
const email = `api-${stamp}@mira.test`;
const password = 'una-contrasena-larga-y-valida';
let userId = null;

async function api(path, { token, method = 'GET' } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let body = null;
  try { body = await res.json(); } catch { /* respuesta sin cuerpo */ }
  return { status: res.status, body };
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

} catch (err) {
  fail.push(`la verificación se cortó: ${err.message}`);
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
}

console.log('\n' + '─'.repeat(64));
for (const p of pass) console.log(`  ✓ ${p}`);
for (const f of fail) console.log(`  ✗ ${f}`);
console.log('─'.repeat(64));
console.log(`${pass.length} pasaron, ${fail.length} fallaron\n`);
process.exit(fail.length ? 1 : 0);
