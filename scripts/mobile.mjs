#!/usr/bin/env node
/**
 * Mira — arranque de la app.
 *
 * Expo lee el `.env` del directorio de la app, no el de la raíz del monorepo.
 * Sin esto la app arranca y muere en el primer render, porque el cliente de
 * Supabase falla al no encontrar sus variables.
 *
 * Este envoltorio copia las variables `EXPO_PUBLIC_*` desde el `.env` de la
 * raíz a `apps/mobile/.env.local`, y completa la URL del backend con la IP de
 * la red local si no se pasó ninguna.
 */
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MOBILE = join(ROOT, 'apps/mobile');
const API_PORT = 3210;

function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

const rootEnvPath = join(ROOT, '.env');
if (!existsSync(rootEnvPath)) {
  console.error('\n  No existe .env en la raíz. Copiá .env.example y completalo.\n');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(rootEnvPath, 'utf8').split('\n')
    .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
    .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]));

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\n  Faltan SUPABASE_URL y SUPABASE_ANON_KEY en el .env de la raíz.\n');
  process.exit(1);
}

const ip = lanAddress();
const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL
  ?? (ip ? `http://${ip}:${API_PORT}` : `http://localhost:${API_PORT}`);

writeFileSync(join(MOBILE, '.env.local'), [
  '# Generado por scripts/mobile.mjs a partir del .env de la raíz.',
  '# No se commitea. Volver a generarlo con: npm run mobile',
  `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY=${supabaseKey}`,
  `EXPO_PUBLIC_API_BASE_URL=${apiBase}`,
  `EXPO_PUBLIC_ENV=${env.EXPO_PUBLIC_ENV || 'development'}`,
  '',
].join('\n'));

console.log(`\n  Backend: ${apiBase}`);
if (!ip) {
  console.log('  ⚠ Sin IP de red local: el teléfono no va a poder llegar al backend.');
}
console.log('');

const child = spawn('npx', ['expo', 'start'], {
  cwd: MOBILE, stdio: 'inherit', env: process.env,
});
process.on('SIGINT', () => { child.kill('SIGINT'); process.exit(0); });
