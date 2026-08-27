'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch, browserClient } from '@/lib/admin-client';
import './admin.css';

type Tab = 'metrics' | 'review' | 'reports';

interface Metrics {
  users: { total: number; active: number; suspended: number; newToday: number };
  activity: { dau: number; wau: number; mau: number };
  submissions: { today: number; accepted: number; rejected: number; inReview: number; blocked: number };
  participationToday: number;
  streaks: { average: number | null; longest: number | null };
  ai: { callsToday: number; escalations: number; inputTokens: number; avgLatencyMs: number | null };
  reports: { open: number; reviewing: number };
}

interface ReviewItem {
  submissionId: string; username: string; challengeDate: string;
  objectDisplayName: string; photoUrl: string | null;
  aiConfidence: number | null; aiReason: string | null;
  attempts: number; submittedAt: string;
}

interface ReportItem {
  reportId: string; reason: string; description: string | null;
  createdAt: string; reporter: string | null; reportedUser: string | null;
  safeToView: boolean; photoUrl: string | null;
}

export default function AdminPage() {
  const [session, setSession] = useState<'checking' | 'out' | 'in'>('checking');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('metrics');

  useEffect(() => {
    const supabase = browserClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session ? 'in' : 'out'));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ? 'in' : 'out'));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session !== 'in') return;
    browserClient().rpc('admin_whoami').then(({ data }) => {
      setIsAdmin(Boolean((data as { isAdmin?: boolean } | null)?.isAdmin));
    });
  }, [session]);

  if (session === 'checking') return <main className="shell"><p className="dim">Cargando…</p></main>;
  if (session === 'out') return <SignIn />;
  if (isAdmin === false) {
    return (
      <main className="shell">
        <h1>Sin acceso</h1>
        <p className="dim">Esta cuenta no tiene permisos de administración.</p>
        <button className="ghost" onClick={() => browserClient().auth.signOut()}>Cerrar sesión</button>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">MIRA</p>
          <h1>Panel</h1>
        </div>
        <button className="ghost" onClick={() => browserClient().auth.signOut()}>Cerrar sesión</button>
      </header>

      <nav className="tabs">
        {([['metrics', 'Métricas'], ['review', 'Revisión'], ['reports', 'Reportes']] as const).map(
          ([key, label]) => (
            <button key={key} className={tab === key ? 'tab active' : 'tab'} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
      </nav>

      {tab === 'metrics' ? <MetricsPanel /> : tab === 'review' ? <ReviewPanel /> : <ReportsPanel />}
    </main>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await browserClient().auth.signInWithPassword({ email, password });
    if (signInError) setError('Email o contraseña incorrectos.');
    setBusy(false);
  }

  return (
    <main className="shell narrow">
      <p className="eyebrow">MIRA</p>
      <h1>Panel</h1>
      <form onSubmit={submit} className="form">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error ? <p className="danger">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}

function MetricsPanel() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<Metrics>('/api/admin/metrics').then(setData).catch((e) => setError(String(e.message)));
  }, []);

  if (error) return <p className="danger">No se pudieron cargar las métricas ({error}).</p>;
  if (!data) return <p className="dim">Cargando…</p>;

  const rejectionRate = data.submissions.today
    ? Math.round((data.submissions.rejected / data.submissions.today) * 100)
    : 0;

  return (
    <>
      <section className="grid">
        <Stat label="Usuarios activos" value={data.users.active} hint={`${data.users.newToday} nuevos hoy`} />
        <Stat label="Activos hoy" value={data.activity.dau} hint={`${data.activity.wau} en 7 días`} />
        <Stat label="Activos en 30 días" value={data.activity.mau} />
        <Stat label="Participación de hoy" value={`${Math.round(data.participationToday * 100)}%`} />
        <Stat label="Fotos hoy" value={data.submissions.today}
              hint={`${data.submissions.accepted} aceptadas`} />
        <Stat label="Rechazo de la IA" value={`${rejectionRate}%`}
              tone={rejectionRate > 30 ? 'warn' : undefined}
              hint="alto sugiere umbral mal calibrado" />
        <Stat label="En revisión" value={data.submissions.inReview}
              tone={data.submissions.inReview > 20 ? 'warn' : undefined} />
        <Stat label="Reportes abiertos" value={data.reports.open}
              tone={data.reports.open > 0 ? 'warn' : undefined} />
        <Stat label="Racha promedio" value={data.streaks.average ?? 0}
              hint={`la más larga: ${data.streaks.longest ?? 0}`} />
      </section>

      <h2>IA en las últimas 24 horas</h2>
      <section className="grid">
        <Stat label="Llamadas" value={data.ai.callsToday} />
        <Stat label="Escaladas al modelo caro" value={data.ai.escalations}
              hint={data.ai.callsToday
                ? `${Math.round((data.ai.escalations / data.ai.callsToday) * 100)}% del total`
                : undefined} />
        <Stat label="Tokens de entrada" value={data.ai.inputTokens.toLocaleString('es')} />
        <Stat label="Latencia media" value={data.ai.avgLatencyMs ? `${data.ai.avgLatencyMs} ms` : '—'} />
      </section>
    </>
  );
}

function ReviewPanel() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    adminFetch<{ items: ReviewItem[] }>('/api/admin/review')
      .then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function resolve(submissionId: string, accept: boolean) {
    setBusy(submissionId);
    try {
      await adminFetch('/api/admin/review', { method: 'POST', body: { submissionId, accept } });
      load();
    } finally { setBusy(null); }
  }

  if (!items) return <p className="dim">Cargando…</p>;
  if (items.length === 0) return <p className="dim">No hay nada en revisión.</p>;

  return (
    <section className="cards">
      {items.map((item) => (
        <article key={item.submissionId} className="card">
          {item.photoUrl ? (
            <img src={item.photoUrl} alt={`Foto de @${item.username}`} />
          ) : <div className="placeholder">sin imagen</div>}
          <div className="card-body">
            <p className="mono">@{item.username} · {item.challengeDate}</p>
            <p><strong>{item.objectDisplayName}</strong></p>
            <p className="dim">
              Confianza {item.aiConfidence ?? '—'} · {item.attempts} intento(s)
            </p>
            {item.aiReason ? <p className="dim quote">{item.aiReason}</p> : null}
            <div className="actions">
              <button disabled={busy === item.submissionId}
                      onClick={() => resolve(item.submissionId, true)}>Aceptar</button>
              <button className="ghost" disabled={busy === item.submissionId}
                      onClick={() => resolve(item.submissionId, false)}>Rechazar</button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function ReportsPanel() {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    adminFetch<{ items: ReportItem[] }>('/api/admin/reports')
      .then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  async function resolve(reportId: string, status: 'actioned' | 'dismissed') {
    setBusy(reportId);
    try {
      await adminFetch('/api/admin/reports', { method: 'POST', body: { reportId, status } });
      load();
    } finally { setBusy(null); }
  }

  if (!items) return <p className="dim">Cargando…</p>;
  if (items.length === 0) return <p className="dim">No hay reportes abiertos.</p>;

  return (
    <section className="cards">
      {items.map((item) => (
        <article key={item.reportId} className="card">
          {item.photoUrl ? (
            <img src={item.photoUrl} alt="Contenido reportado" />
          ) : (
            <div className="placeholder">
              {item.safeToView ? 'sin imagen' : 'bloqueada por moderación automática'}
            </div>
          )}
          <div className="card-body">
            <p className="mono">{item.reason}</p>
            <p className="dim">
              @{item.reporter ?? '—'} reportó a @{item.reportedUser ?? '—'}
            </p>
            {item.description ? <p className="quote">{item.description}</p> : null}
            {!item.safeToView ? (
              <p className="danger">
                La moderación automática la marcó como no apta para revisión humana.
                No se muestra ni se puede abrir.
              </p>
            ) : null}
            <div className="actions">
              <button disabled={busy === item.reportId}
                      onClick={() => resolve(item.reportId, 'actioned')}>Accionado</button>
              <button className="ghost" disabled={busy === item.reportId}
                      onClick={() => resolve(item.reportId, 'dismissed')}>Desestimar</button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}

function Stat({ label, value, hint, tone }: {
  label: string; value: string | number; hint?: string; tone?: 'warn';
}) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className={tone === 'warn' ? 'stat-value warn' : 'stat-value'}>{value}</p>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}
