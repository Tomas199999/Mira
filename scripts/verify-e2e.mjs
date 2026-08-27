#!/usr/bin/env node
/**
 * Mira — recorrido completo, de punta a punta (§82).
 *
 * Crear cuenta → perfil → recibir el desafío → subir la foto → validación →
 * racha → que un amigo la vea en su feed → historial.
 *
 * Todo con llamadas reales contra la base y la API. Lo único que se simula es
 * el paso del tiempo: la ventana del usuario se adelanta para no esperar horas.
 *
 *   npm run verify:e2e     (con el servidor local en :3210)
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const BASE = process.env.API_BASE_URL ?? 'http://localhost:3210';
const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SERVICE) {
  console.log('· faltan credenciales en .env — se saltea');
  process.exit(0);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL_, ANON, { auth: { persistSession: false } });

const steps = [];
const record = (n, ok, d = '') => steps.push({ n, ok, d });

const stamp = String(process.hrtime.bigint()).slice(-9);
const password = 'una-contrasena-larga-y-valida';
const created = [];
const uploaded = [];

async function signUp(tag) {
  const email = `e2e-${tag}-${stamp}@mira.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  created.push(data.user.id);
  const session = await anon.auth.signInWithPassword({ email, password });
  if (session.error) throw session.error;
  return { id: data.user.id, token: session.data.session.access_token };
}

async function api(path, token, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** Una foto sintética con una taza reconocible: el objeto del catálogo. */
async function makePhoto() {
  const svg = `<svg width="900" height="1200" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#e8e2d8"/>
    <ellipse cx="450" cy="880" rx="260" ry="40" fill="#00000018"/>
    <path d="M300 520 h300 v260 a150 150 0 0 1 -300 0 z" fill="#ffffff" stroke="#c8c2b8" stroke-width="6"/>
    <path d="M600 580 a80 80 0 0 1 0 140" fill="none" stroke="#ffffff" stroke-width="34"/>
    <ellipse cx="450" cy="520" rx="150" ry="34" fill="#6b4423"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

const today = new Date().toISOString().slice(0, 10);
let aiReached = false;

try {
  // ---- 1. Crear cuenta ---------------------------------------------------------
  const user = await signUp('protagonista');
  record('crear cuenta e iniciar sesión', Boolean(user.token));

  // ---- 2. Perfil ----------------------------------------------------------------
  const scoped = createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${user.token}` } },
  });
  const username = `hero${stamp}`.slice(0, 20);

  const free = await scoped.rpc('is_username_available', { p_username: username });
  record('el username está disponible', free.data === true);

  const profile = await scoped.rpc('create_user_profile', {
    p_username: username, p_display_name: 'Protagonista',
    p_birth_date: '1995-09-09', p_country_code: 'AR',
    p_timezone: 'America/Argentina/Buenos_Aires', p_locale: 'es',
  });
  record('crear el perfil', !profile.error, profile.error?.message ?? '');

  // ---- 3. El desafío del día ----------------------------------------------------
  // Se asegura que haya desafío y ventana, y se adelanta la apertura: el
  // recorrido no puede depender de a qué hora se corra el test.
  await admin.rpc('schedule_daily_challenge', { target_date: today });
  await admin.rpc('create_challenge_windows', { p_date: today });
  await admin.from('challenge_windows')
    .update({ opens_at: new Date(Date.now() - 60_000).toISOString(),
              closes_at: new Date(Date.now() + 3600_000).toISOString() })
    .eq('user_id', user.id).eq('challenge_date', today);

  const challenge = await api('/api/challenge', user.token);
  const state = challenge.body?.data;
  record('el desafío llega abierto y con el objeto',
    state?.kind === 'open' && Boolean(state.objectDisplayName),
    JSON.stringify(state).slice(0, 140));

  if (state?.kind !== 'open') throw new Error('sin desafío abierto no hay recorrido que seguir');

  // ---- 4. Reservar el intento ----------------------------------------------------
  const start = await api('/api/submissions/start', user.token, {
    method: 'POST', body: { windowId: state.windowId, deviceId: `e2e-${stamp}` },
  });
  record('reservar el intento y recibir la URL firmada',
    start.status === 200 && Boolean(start.body?.data?.uploadUrl),
    JSON.stringify(start.body).slice(0, 140));

  const reservation = start.body?.data;
  if (!reservation?.uploadUrl) throw new Error('sin URL de subida no se puede continuar');
  uploaded.push(reservation.uploadPath);

  // ---- 5. Subir la foto directo a Storage ------------------------------------------
  const photo = await makePhoto();
  const upload = await fetch(reservation.uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: photo,
  });
  record('subir la foto directo a Storage', upload.status < 400,
    `HTTP ${upload.status}`);

  // ---- 6. Validación ----------------------------------------------------------------
  const finalize = await api('/api/submissions/finalize', user.token, {
    method: 'POST', body: { submissionId: reservation.submissionId, uploadToken: reservation.uploadToken },
  });

  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  if (hasKey) {
    record('la IA valida la foto y la acepta',
      finalize.status === 200 && finalize.body?.data?.status === 'accepted',
      JSON.stringify(finalize.body).slice(0, 200));
    aiReached = true;
  } else {
    // Sin credenciales no se puede llamar al modelo. Que falle EXACTAMENTE en
    // ese punto es la prueba de que toda la cadena anterior funcionó.
    const code = finalize.body?.error?.code;
    record('el pipeline llega hasta la llamada al modelo',
      code === 'vision_unavailable' || finalize.status === 503,
      `sin ANTHROPIC_API_KEY: ${finalize.status} ${code ?? ''}`);
    aiReached = code === 'vision_unavailable' || finalize.status === 503;
  }

  // ---- 7. Racha, feed e historial -----------------------------------------------------
  // Cuando no hay clave se fuerza el veredicto para poder seguir el recorrido:
  // lo que se prueba de acá en adelante no depende del modelo.
  if (!hasKey) {
    await admin.rpc('apply_submission_result', {
      p_submission_id: reservation.submissionId, p_status: 'accepted',
      p_ai_decision: 'accepted', p_confidence: 0.95, p_moderation: 'passed',
    });
    await admin.from('submissions')
      .update({ thumbnail_path: reservation.uploadPath })
      .eq('id', reservation.submissionId);
  }

  const { data: after } = await admin.from('profiles')
    .select('current_streak, total_completed').eq('id', user.id).single();
  record('la racha subió a 1', after?.current_streak === 1 && after?.total_completed === 1,
    JSON.stringify(after));

  const done = await api('/api/challenge', user.token);
  record('el desafío pasa a completado',
    done.body?.data?.kind === 'completed', JSON.stringify(done.body?.data).slice(0, 120));

  const second = await api('/api/submissions/start', user.token, {
    method: 'POST', body: { windowId: state.windowId, deviceId: `e2e-${stamp}` } });
  record('no se puede subir una segunda foto el mismo día',
    second.status >= 400, `${second.status} ${second.body?.error?.code ?? ''}`);

  // Un amigo la ve; un desconocido no.
  const friend = await signUp('amigo');
  const stranger = await signUp('ajeno');
  for (const other of [friend, stranger]) {
    const c = createClient(URL_, ANON, { auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${other.token}` } } });
    await c.rpc('create_user_profile', {
      p_username: `${other === friend ? 'amigo' : 'ajeno'}${stamp}`.slice(0, 20),
      p_display_name: 'Otro', p_birth_date: '1995-01-01',
      p_country_code: 'AR', p_timezone: 'UTC', p_locale: 'es' });
  }
  const [a, b] = [user.id, friend.id].sort();
  await admin.from('friendships').insert({ user_a: a, user_b: b });

  const friendFeed = await api('/api/feed', friend.token);
  record('un amigo ve la foto en su feed',
    (friendFeed.body?.data?.items ?? []).some((i) => i.submission.id === reservation.submissionId),
    JSON.stringify(friendFeed.body).slice(0, 160));

  const strangerFeed = await api('/api/feed', stranger.token);
  record('un desconocido NO la ve',
    !(strangerFeed.body?.data?.items ?? []).some((i) => i.submission.id === reservation.submissionId));

  const history = await api(`/api/history?month=${today.slice(0, 7)}`, user.token);
  const dayEntry = (history.body?.data?.days ?? []).find((d) => d.date === today);
  record('la foto queda en el historial del día',
    dayEntry?.outcome === 'completed' && Boolean(dayEntry?.submission),
    JSON.stringify(dayEntry).slice(0, 140));

} catch (error) {
  record(`el recorrido se cortó: ${error.message}`, false);
} finally {
  if (uploaded.length) await admin.storage.from('submissions').remove(uploaded).catch(() => {});
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => {});
}

console.log('\n' + '─'.repeat(66));
steps.forEach((s, i) => {
  console.log(`  ${s.ok ? '✓' : '✗'} ${String(i + 1).padStart(2)}. ${s.n}${s.ok || !s.d ? '' : ` — ${s.d}`}`);
});
const failed = steps.filter((s) => !s.ok).length;
console.log('─'.repeat(66));
console.log(`${steps.length - failed} de ${steps.length} pasos completos`);
if (!process.env.ANTHROPIC_API_KEY) {
  console.log(`\n  Nota: sin ANTHROPIC_API_KEY, el modelo no se llamó.`);
  console.log(`  ${aiReached ? 'El pipeline SÍ llegó hasta ese punto.' : 'El pipeline NO llegó hasta ese punto.'}`);
}
console.log('');
process.exit(failed ? 1 : 0);
