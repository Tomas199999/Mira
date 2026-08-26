#!/usr/bin/env node
/**
 * Mira — verificación del flujo de alta contra el Supabase real.
 *
 * Ejecuta exactamente las llamadas que hace apps/mobile/src/features/auth/api.ts,
 * con una sesión de usuario de verdad. Que la app compile no prueba que el
 * contrato con la base funcione.
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY para crear y borrar el usuario de prueba,
 * así que corre localmente, no en CI.
 *
 *   node --env-file=.env scripts/verify-auth-flow.mjs
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.log('· faltan credenciales en .env — se saltea');
  process.exit(0);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const app = createClient(URL, ANON, { auth: { persistSession: false } });

const pass = [], fail = [];
const check = (name, ok, detail = '') => (ok ? pass : fail).push(name + (ok || !detail ? '' : ` — ${detail}`));
const expectError = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const stamp = process.env.TEST_STAMP ?? String(process.hrtime.bigint());
const email = `verify-${stamp}@mira.test`;
const password = 'una-contrasena-larga-y-valida';
let userId = null;

try {
  // --- alta del usuario (lo hace Supabase Auth, no nuestro código) -----------
  const created = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (created.error) throw created.error;
  userId = created.data.user.id;
  check('se puede crear un usuario de prueba', Boolean(userId));

  // --- signInWithEmail --------------------------------------------------------
  const signedIn = await app.auth.signInWithPassword({ email, password });
  check('inicio de sesión con email y contraseña', !signedIn.error && Boolean(signedIn.data.session),
    signedIn.error?.message ?? '');
  if (signedIn.error) throw signedIn.error;

  // --- hasProfile: recién creado, todavía no tiene ----------------------------
  const before = await app.from('profiles').select('id').eq('id', userId).maybeSingle();
  check('un usuario nuevo todavía no tiene perfil', !before.error && before.data === null,
    before.error?.message ?? JSON.stringify(before.data));

  // --- isUsernameAvailable ----------------------------------------------------
  const free = await app.rpc('is_username_available', { p_username: `u${stamp}`.slice(0, 20) });
  check('is_username_available responde para un nombre libre', !free.error && free.data === true,
    free.error?.message ?? String(free.data));

  const reserved = await app.rpc('is_username_available', { p_username: 'admin' });
  check('is_username_available rechaza un nombre reservado', !reserved.error && reserved.data === false,
    reserved.error?.message ?? String(reserved.data));

  // --- createProfile ----------------------------------------------------------
  const username = `u${stamp}`.slice(0, 20);
  const created2 = await app.rpc('create_user_profile', {
    p_username: username,
    p_display_name: 'Usuario de prueba',
    p_birth_date: '1995-06-15',
    p_country_code: 'AR',
    p_timezone: 'America/Argentina/Buenos_Aires',
    p_locale: 'es',
  });
  check('create_user_profile crea el perfil', !created2.error, created2.error?.message ?? '');

  const after = await app.from('profiles').select('username, current_streak').eq('id', userId).maybeSingle();
  check('el perfil queda con la racha en cero',
    !after.error && after.data?.username === username && after.data?.current_streak === 0,
    after.error?.message ?? JSON.stringify(after.data));

  // Atómico: las tres filas, no sólo profiles.
  const priv = await admin.from('user_private').select('age_band, timezone').eq('user_id', userId).maybeSingle();
  const sets = await admin.from('user_settings').select('photo_visibility, show_in_global_ranking').eq('user_id', userId).maybeSingle();
  check('el alta crea también los datos privados y los ajustes',
    priv.data?.age_band === 'adult' && sets.data?.photo_visibility === 'friends'
      && sets.data?.show_in_global_ranking === false,
    JSON.stringify({ priv: priv.data, sets: sets.data }));

  // --- reglas que el servidor tiene que hacer cumplir --------------------------
  const dup = await app.rpc('create_user_profile', {
    p_username: username, p_display_name: 'x', p_birth_date: '1995-01-01',
    p_country_code: 'AR', p_timezone: 'UTC', p_locale: 'es',
  });
  check('no se puede crear un segundo perfil', Boolean(dup.error), dup.error ? '' : 'fue aceptado');

  const inflate = await app.from('profiles').update({ current_streak: 9999 }).eq('id', userId);
  check('el cliente no puede inflar su racha contra la API real', Boolean(inflate.error),
    inflate.error ? '' : 'el update fue aceptado');

  const tzNow = await app.from('user_private')
    .update({ timezone: 'Pacific/Auckland' }).eq('user_id', userId);
  check('el cliente no puede cambiar su zona horaria de inmediato', Boolean(tzNow.error),
    tzNow.error ? '' : 'el update fue aceptado');

  const tzDeferred = await app.rpc('request_timezone_change', { p_timezone: 'Europe/Madrid' });
  const today = new Date().toISOString().slice(0, 10);
  check('el cambio de zona horaria se difiere al día siguiente',
    !tzDeferred.error && String(tzDeferred.data) > today,
    tzDeferred.error?.message ?? String(tzDeferred.data));

  // --- el usuario sí puede editar lo suyo -------------------------------------
  const edit = await app.from('profiles').update({ display_name: 'Editado', bio: 'hola' }).eq('id', userId);
  check('el usuario puede editar su nombre y su bio', !edit.error, edit.error?.message ?? '');

  // --- §50 eliminación de cuenta ----------------------------------------------
  const del = await app.from('account_deletion_requests').insert({ user_id: userId, reason: 'prueba' });
  check('el usuario puede pedir la baja de su cuenta', !del.error, del.error?.message ?? '');

  const fakeDone = await app.from('account_deletion_requests')
    .update({ completed_at: new Date().toISOString() }).eq('user_id', userId);
  check('el usuario no puede marcar su baja como completada', Boolean(fakeDone.error),
    fakeDone.error ? '' : 'el update fue aceptado');

  // --- cierre de sesión --------------------------------------------------------
  const out = await app.auth.signOut();
  check('cierre de sesión', !out.error, out.error?.message ?? '');

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
