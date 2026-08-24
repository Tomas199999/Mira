import { useState } from 'react';
import type { ChallengeState } from '@mira/shared';

/**
 * Estado del desafío de hoy.
 *
 * En la Fase 3 esto consulta `GET /challenge` y el backend devuelve el estado
 * completo. Hasta entonces arranca en `none` — no inventa un desafío, porque
 * un desafío falso haría que la app mienta sobre lo único que importa (§79).
 *
 * `setPreviewState` existe sólo para el harness de diseño en desarrollo.
 */
export function useChallengeState() {
  const [state, setState] = useState<ChallengeState>({ kind: 'none' });

  return {
    state,
    /** Sólo para desarrollo. En release el harness no se monta. */
    setPreviewState: setState,
  };
}
