#!/usr/bin/env node
/**
 * Mira — arranque para probar la app en un teléfono, contra la base real.
 *
 * Levanta el backend en la máquina y deja la app apuntando a la IP de la red
 * local, para que el teléfono pueda llegar. No toca Vercel ni requiere
 * desactivar Deployment Protection.
 *
 *   npm run demo
 */
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3210;

/** La IP de la red local: 'localhost' desde el teléfono apunta al teléfono. */
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return null;
}

const env = existsSync(join(ROOT, '.env'))
  ? Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
  : {};

const ip = lanAddress();
const apiBase = ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`;
const hasVisionKey = Boolean(env.ANTHROPIC_API_KEY);

const line = '─'.repeat(64);
console.log(`\n${line}`);
console.log('  MIRA — modo demo local');
console.log(line);
console.log(`\n  Backend:  ${apiBase}`);
console.log(`  Base:     Supabase de producción (São Paulo)`);
console.log(`  Validación de fotos: ${hasVisionKey
  ? 'IA real (Claude)'
  : 'SIMULADA — acepta cualquier foto sin mirarla'}`);

if (!ip) {
  console.log('\n  ⚠ No se encontró una IP de red local. El teléfono no va a poder');
  console.log('    llegar al backend; sólo va a funcionar en un simulador.');
}

console.log(`\n  Qué se puede probar ahora:`);
console.log(`    · crear cuenta, onboarding y alta de perfil`);
console.log(`    · recibir el desafío del día y sacar la foto`);
console.log(`    · buscar y agregar amigos, feed, rankings, historial`);
console.log(`    · el panel en ${apiBase}/admin`);

console.log(`\n  Qué NO se puede probar todavía:`);
if (!hasVisionKey) {
  console.log(`    · la validación real de la IA (falta ANTHROPIC_API_KEY)`);
}
console.log(`    · notificaciones push y App Attest (necesitan development build)`);

console.log(`\n${line}`);
console.log('  En otra terminal, para abrir la app en el teléfono:\n');
console.log(`    cd ${ROOT}`);
console.log(`    EXPO_PUBLIC_API_BASE_URL=${apiBase} npm run mobile\n`);
console.log('  Y escaneá el código QR con la cámara del teléfono.');
console.log(`${line}\n`);
console.log('  Comandos útiles mientras probás:');
console.log(`    npm run demo:abrir <usuario>   → abre tu ventana del desafío ahora`);
console.log(`    npm run demo:admin <email>     → te da acceso al panel`);
console.log(`${line}\n`);

const child = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: join(ROOT, 'apps/web'),
  stdio: 'inherit',
  env: {
    ...process.env,
    ...env,
    ...(hasVisionKey ? {} : { MIRA_STUB_VISION: '1' }),
    NODE_ENV: 'production',
  },
});

process.on('SIGINT', () => { child.kill('SIGINT'); process.exit(0); });
