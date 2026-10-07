#!/usr/bin/env node
/**
 * Mira — atajos para probar sin esperar.
 *
 *   node --env-file=.env scripts/demo-helpers.mjs abrir <usuario>
 *   node --env-file=.env scripts/demo-helpers.mjs push
 *   node --env-file=.env scripts/demo-helpers.mjs amigo <usuario>
 *   node --env-file=.env scripts/demo-helpers.mjs limpiar
 *   node --env-file=.env scripts/demo-helpers.mjs admin <email>
 */
import { createClient } from '@supabase/supabase-js';

const [, , command, argument] = process.argv;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

if (!command || (!['push', 'limpiar'].includes(command) && !argument)) {
  console.log('Uso: abrir <usuario> | push | amigo <usuario> | limpiar | admin <email>');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

if (command === 'abrir') {
  const { data: profile } = await db.from('profiles')
    .select('id, username').eq('username', argument.toLowerCase()).maybeSingle();
  if (!profile) { console.log(`No existe el usuario @${argument}.`); process.exit(1); }

  // Asegurar que exista desafío y ventana para hoy.
  await db.rpc('schedule_daily_challenge', { target_date: today });
  await db.rpc('create_challenge_windows', { p_date: today });

  const { error } = await db.from('challenge_windows')
    .update({
      opens_at: new Date(Date.now() - 30_000).toISOString(),
      closes_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      notified_at: null,
    })
    .eq('user_id', profile.id).eq('challenge_date', today);

  if (error) { console.log('No se pudo abrir la ventana:', error.message); process.exit(1); }

  const { data: challenge } = await db.from('daily_challenges')
    .select('challenge_objects(display_name)').eq('challenge_date', today).maybeSingle();

  const objeto = challenge?.challenge_objects?.display_name ?? '(desconocido)';
  console.log(`\n  Ventana abierta para @${profile.username}.`);
  console.log(`  El desafío de hoy es: ${objeto}`);
  console.log(`  Cierra en 2 horas. Refrescá la pantalla principal de la app.\n`);
}

if (command === 'push') {
  // El mismo job que en producción dispara pg_cron, pero contra el backend
  // local. Manda el aviso a quien tenga la ventana abierta y sin notificar:
  // después de `demo:abrir`, eso es tu teléfono.
  const base = process.env.API_BASE_URL ?? 'http://localhost:3210';
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.log('Falta CRON_SECRET en .env.'); process.exit(1); }

  const response = await fetch(`${base}/api/cron/send-challenge-push`, {
    headers: { Authorization: `Bearer ${secret}` },
  }).catch((err) => { console.log(`No se pudo llegar a ${base}: ${err.message}. ¿Está corriendo npm run demo?`); process.exit(1); });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    console.log('El job falló:', JSON.stringify(payload ?? response.status));
    process.exit(1);
  }

  const { sent, failed, unregistered } = payload.data;
  console.log(`\n  Avisos enviados: ${sent} · fallidos: ${failed} · tokens dados de baja: ${unregistered}`);
  if (sent === 0) {
    console.log('  Nadie tenía la ventana abierta sin avisar. Corré antes: npm run demo:abrir <usuario>');
    console.log('  Y fijate que la app haya registrado el token de push (hace falta el development build).');
  }
  console.log('');
}

if (command === 'admin') {
  const { data: users } = await db.auth.admin.listUsers();
  const user = users.users.find((u) => u.email?.toLowerCase() === argument.toLowerCase());
  if (!user) { console.log(`No hay ninguna cuenta con el email ${argument}.`); process.exit(1); }

  const { error } = await db.from('admin_users')
    .upsert({ user_id: user.id, role: 'admin' }, { onConflict: 'user_id' });
  if (error) { console.log('No se pudo dar acceso:', error.message); process.exit(1); }

  console.log(`\n  ${argument} ahora es administrador.`);
  console.log(`  Entrá al panel con ese mismo email y contraseña.\n`);
}

/**
 * Crea un amigo de prueba con su foto del día, para poder mirar el feed.
 *
 * No inventa nada: crea una cuenta de verdad, le hace recorrer el mismo
 * camino que a cualquiera (ventana, intento, subida, veredicto) y la deja
 * como amiga. Por eso necesita el backend local andando. Los usuarios que
 * crea llevan el prefijo `demo_` y se borran con `demo:limpiar`.
 */
if (command === 'amigo') {
  const base = process.env.API_BASE_URL ?? 'http://localhost:3210';
  const password = 'mira-demo-2026-contrasena';
  const stamp = String(Date.now()).slice(-5);
  const username = `demo_${stamp}`;
  const email = `${username}@mira.demo`;

  const { data: yo } = await db.from('profiles')
    .select('id, username').eq('username', argument.toLowerCase()).maybeSingle();
  if (!yo) { console.log(`No existe el usuario @${argument}.`); process.exit(1); }

  // 1. Cuenta y sesión.
  const { data: created, error: userError } =
    await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError) { console.log('No se pudo crear la cuenta:', userError.message); process.exit(1); }

  const { createClient: mkClient } = await import('@supabase/supabase-js');
  const anon = mkClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } });
  const { data: session, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });
  if (signInError) { console.log('No se pudo iniciar sesión:', signInError.message); process.exit(1); }
  const token = session.session.access_token;

  // 2. Perfil, con el mismo RPC que usa la app.
  const scoped = mkClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const nombres = ['Lucía', 'Marco', 'Ailén', 'Teo', 'Nina', 'Bruno'];
  const displayName = nombres[Math.floor(Math.random() * nombres.length)];
  const { error: profileError } = await scoped.rpc('create_user_profile', {
    p_username: username, p_display_name: displayName,
    p_birth_date: '1994-06-15', p_country_code: 'AR',
    p_timezone: 'America/Argentina/Buenos_Aires', p_locale: 'es',
  });
  if (profileError) { console.log('No se pudo crear el perfil:', profileError.message); process.exit(1); }

  // 3. Amistad, en el orden canónico que exige la tabla.
  const [a, b] = [yo.id, created.user.id].sort();
  const { error: friendError } = await db.from('friendships').insert({ user_a: a, user_b: b });
  if (friendError) { console.log('No se pudo crear la amistad:', friendError.message); process.exit(1); }

  // 4. Ventana abierta y foto, por el camino real.
  await db.rpc('schedule_daily_challenge', { target_date: today });
  await db.rpc('create_challenge_windows', { p_date: today });
  await db.from('challenge_windows')
    .update({ opens_at: new Date(Date.now() - 60_000).toISOString(),
              closes_at: new Date(Date.now() + 3600_000).toISOString() })
    .eq('user_id', created.user.id).eq('challenge_date', today);

  const challenge = await fetch(`${base}/api/challenge`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json()).catch(() => null);

  if (challenge?.data?.kind !== 'open') {
    console.log(`\n  @${username} quedó como amigo de @${yo.username}, pero sin foto:`);
    console.log(`  el desafío no está abierto (${challenge?.data?.kind ?? 'sin respuesta'}).`);
    console.log(`  ¿Está corriendo npm run demo?\n`);
    process.exit(0);
  }

  const start = await fetch(`${base}/api/submissions/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ windowId: challenge.data.windowId, deviceId: `demo-${stamp}` }),
  }).then((r) => r.json());

  if (!start?.data?.uploadUrl) {
    console.log('No se pudo reservar el intento:', JSON.stringify(start?.error ?? start));
    process.exit(1);
  }

  const sharp = (await import('sharp')).default;
  const photo = await sharp({
    create: { width: 900, height: 1200, channels: 3, background: tintAleatorio() },
  }).jpeg({ quality: 86 }).toBuffer();

  const upload = await fetch(start.data.uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: photo,
  });
  if (upload.status >= 400) { console.log('La subida falló:', upload.status); process.exit(1); }

  const finalize = await fetch(`${base}/api/submissions/finalize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ submissionId: start.data.submissionId, uploadToken: start.data.uploadToken }),
  }).then((r) => r.json());

  const estado = finalize?.data?.status ?? finalize?.error?.code ?? 'desconocido';
  console.log(`\n  @${username} (${displayName}) ahora es amigo de @${yo.username}.`);
  console.log(`  Su foto de hoy quedó en estado: ${estado}.`);
  console.log(`  Abrí la pestaña de inicio para verla en el feed.`);
  console.log(`  Para borrar los usuarios de prueba: npm run demo:limpiar\n`);
}

/** Borra las cuentas que creó `demo:amigo`. No toca ninguna otra. */
if (command === 'limpiar') {
  const { data: perfiles } = await db.from('profiles').select('id, username').like('username', 'demo\\_%');
  if (!perfiles?.length) { console.log('\n  No hay usuarios de prueba que borrar.\n'); process.exit(0); }

  for (const p of perfiles) {
    await db.auth.admin.deleteUser(p.id).catch(() => {});
  }
  console.log(`\n  Borrados ${perfiles.length}: ${perfiles.map((p) => '@' + p.username).join(', ')}\n`);
}

/** Un color plano distinto por foto, para distinguirlas en el feed. */
function tintAleatorio() {
  const tonos = [
    { r: 198, g: 184, b: 164 }, { r: 150, g: 168, b: 170 }, { r: 190, g: 160, b: 150 },
    { r: 160, g: 175, b: 150 }, { r: 175, g: 165, b: 190 },
  ];
  return tonos[Math.floor(Math.random() * tonos.length)];
}
