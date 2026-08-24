import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // El backend importa tipos desde el workspace compartido; Next tiene que
  // transpilarlo porque se publica como TypeScript sin build.
  transpilePackages: ['@mira/shared'],
  // En un monorepo, Next necesita saber dónde está la raíz para trazar
  // correctamente los archivos que empaqueta.
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
};

export default config;
