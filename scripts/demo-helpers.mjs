#!/usr/bin/env node
/**
 * Mira — atajos para probar sin esperar.
 *
 *   node --env-file=.env scripts/demo-helpers.mjs abrir <usuario>
 *   node --env-file=.env scripts/demo-helpers.mjs push
 *   node --env-file=.env scripts/demo-helpers.mjs admin <email>
 */
import { createClient } from '@supabase/supabase-js';

const [, , command, argument] = process.argv;
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

if (!command || (command !== 'push' && !argument)) {
  console.log('Uso: abrir <usuario> | push | admin <email>');
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
