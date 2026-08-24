import { useEffect, useState } from 'react';
import { Text } from './Text';

/**
 * Cuenta regresiva del desafío (§42).
 *
 * Sólo dibuja: la ventana la decide el servidor. Cuando llega a cero avisa al
 * padre, que vuelve a preguntarle al backend en qué estado está — nunca asume
 * que el desafío se cerró sólo porque el reloj local llegó a cero.
 */
export function Countdown({ until, onExpire }: { until: string; onExpire?: () => void }) {
  const [remaining, setRemaining] = useState(() => msUntil(until));

  useEffect(() => {
    setRemaining(msUntil(until));
    const id = setInterval(() => {
      const next = msUntil(until);
      setRemaining(next);
      if (next <= 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);

  return <Text variant="mono" tone={remaining < 5 * 60_000 ? 'danger' : 'primary'}>{format(remaining)}</Text>;
}

function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

function format(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
