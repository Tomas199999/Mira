/**
 * Página de estado del despliegue.
 *
 * No es el panel administrativo: ese llega en la Fase 10. Esto existe para
 * poder confirmar de un vistazo que el deploy está vivo y contra qué entorno
 * apunta, sin exponer nada sensible.
 */
export default function StatusPage() {
  const env = process.env.VERCEL_ENV ?? 'development';
  const configured = {
    'Base de datos': Boolean(process.env.SUPABASE_URL),
    'Clave de servicio': Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    'Proveedor de visión': Boolean(process.env.ANTHROPIC_API_KEY),
    'Secreto de cron': Boolean(process.env.CRON_SECRET),
  };

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px' }}>
      <p style={{ letterSpacing: 3, fontSize: 13, color: 'var(--text-dim)' }}>MIRA</p>
      <h1 style={{ fontSize: 32, margin: '8px 0 4px' }}>Backend</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 0 }}>
        Entorno: <strong style={{ color: 'var(--accent)' }}>{env}</strong>
      </p>

      <section
        style={{
          marginTop: 32, border: '1px solid var(--border)',
          borderRadius: 16, padding: 20, background: 'var(--surface)',
        }}
      >
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Configuración</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {Object.entries(configured).map(([label, ready]) => (
            <li key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: 'var(--text-dim)' }}>{label}</span>
              <span style={{ color: ready ? 'var(--accent)' : '#ff4d4d' }}>
                {ready ? 'configurada' : 'falta'}
              </span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 0 }}>
          Muestra sólo si cada variable existe, nunca su valor.
        </p>
      </section>

      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 32 }}>
        La API y el panel administrativo se implementan en las Fases 3 y 10.
        Ver <code>apps/web/README.md</code>.
      </p>
    </main>
  );
}
