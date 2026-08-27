import type { NextRequest } from 'next/server';
import { authenticate } from '@/server/auth';
import { signPaths } from '@/server/images/signed-urls';
import { fail, failFromError, ok } from '@/server/response';

export const dynamic = 'force-dynamic';

interface ReportRow {
  report_id: string; reason: string; description: string | null;
  created_at: string; reporter: string | null; reported_user: string | null;
  submission_id: string | null; photo_path: string | null; safe_to_view: boolean;
}

/** GET /api/admin/reports — reportes pendientes (§23). */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const status = request.nextUrl.searchParams.get('status') ?? 'open';

  try {
    const { data, error } = await auth.db.rpc('admin_reports', {
      p_status: status, p_limit: 50 });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as ReportRow[];

    // Sólo se firman las fotos que el clasificador consideró seguras. Una
    // imagen insegura no llega ni siquiera como enlace.
    const signable = rows.filter((r) => r.safe_to_view && r.photo_path)
      .map((r) => r.photo_path as string);
    const signed = await signPaths(signable);

    return ok({
      items: rows.map((r) => ({
        reportId: r.report_id,
        reason: r.reason,
        description: r.description,
        createdAt: r.created_at,
        reporter: r.reporter,
        reportedUser: r.reported_user,
        submissionId: r.submission_id,
        safeToView: r.safe_to_view,
        photoUrl: r.safe_to_view && r.photo_path ? signed.get(r.photo_path) ?? null : null,
      })),
    });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}

/** POST /api/admin/reports — resolver un reporte. */
export async function POST(request: NextRequest) {
  const auth = await authenticate(request);
  if (!auth) return fail('unauthenticated', 'missing or invalid bearer token');

  const { reportId, status, note } = await request.json().catch(() => ({}));
  if (!reportId || !['reviewing', 'actioned', 'dismissed'].includes(status)) {
    return fail('not_found', 'reportId and a valid status are required');
  }

  try {
    const { error } = await auth.db.rpc('admin_resolve_report', {
      p_report_id: reportId, p_status: status, p_note: note ?? null });
    if (error) throw new Error(error.message);
    return ok({ status });
  } catch (error) {
    return failFromError(error, 'forbidden');
  }
}
